"use client";

import { createOrder } from "@/lib/actions/pos.actions";

import { useState, useMemo, useEffect } from "react";
import { Product, CartItem, Category } from "@/types/pos.types";
import { ProductCard } from "./ProductCard";
import { CartSidebar } from "./CartSidebar";
import { MobileCart } from "./MobileCart";
import { ServerDashboard } from "./ServerDashboard";
import { ProcessingOverlay } from "./ProcessingOverlay";
import { SettleTableTabModal } from "./SettleTableTabModal";
import { AddToTabModal } from "./AddToTabModal";
import { Search, Grid, List, LayoutDashboard, LogOut, Menu, X, CreditCard } from "lucide-react";
import dynamic from 'next/dynamic';
import { usePOSStore } from "@/store/pos-store";
import { ProductDetailsModal } from "./ProductDetailsModal";
import { client } from "@/lib/appwrite-client";
import { Button } from "@/components/ui/button";

const PaymentModal = dynamic(
    () => import('./PaymentModal').then((mod) => mod.PaymentModal),
    { ssr: false }
);
import { cn, formatCurrency } from "@/lib/utils";
import { useUser, UserButton } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface POSInterfaceProps {
    initialProducts: Product[];
    initialCategories: Category[];
}

export default function POSInterface({ initialProducts, initialCategories }: POSInterfaceProps) {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Global State
    const {
        cart,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        isPaymentModalOpen,
        setPaymentModalOpen
    } = usePOSStore();

    // Local UI State
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [showDashboard, setShowDashboard] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>(searchParams.get("category") || "all");
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [processingStatus, setProcessingStatus] = useState<"processing" | "generating" | "complete">("processing");
    const [isSettleTabModalOpen, setIsSettleTabModalOpen] = useState(false);
    const [isAddToTabModalOpen, setIsAddToTabModalOpen] = useState(false);

    // O(1) category lookup optimization
    const categoryMap = useMemo(() => {
        const map = new Map<string, Category>();
        initialCategories.forEach(cat => map.set(cat.slug, cat));
        return map;
    }, [initialCategories]);

    // Add "All Items" as UI-only filter
    const displayCategories = useMemo(() => [
        { $id: 'all', name: 'all', label: 'All Items', slug: 'all', index: -1, isActive: true },
        ...initialCategories
    ], [initialCategories]);

    // Sync state to URL and vice-verse
    useEffect(() => {
        const cat = searchParams.get("category");
        if (cat && cat !== selectedCategory) {
            setSelectedCategory(cat);
        }
    }, [searchParams]);

    const handleCategoryChange = (categoryId: string) => {
        setSelectedCategory(categoryId);
        // Update URL without refresh
        router.push(`?category=${categoryId}`, { scroll: false });
    };

    // Realtime Subscription
    useEffect(() => {
        const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
        const collectionId = process.env.NEXT_PUBLIC_MENU_ITEMS_COLLECTION_ID;

        if (!databaseId || !collectionId) return;

        console.log("Subscribing to realtime updates...", databaseId, collectionId);

        const unsubscribe = client.subscribe(
            `databases.${databaseId}.collections.${collectionId}.documents`,
            (response) => {
                if (response.events.includes("databases.*.collections.*.documents.*.update")) {
                    const updatedDoc = response.payload as any;
                    console.log("Realtime update received:", updatedDoc);

                    setProducts((prev) => prev.map((p) =>
                        p.$id === updatedDoc.$id
                            ? { ...p, ...updatedDoc, popularity: updatedDoc.popularity } // Merge updates
                            : p
                    ));
                }
            }
        );

        return () => {
            unsubscribe();
        };
    }, []);

    // Hydration fix for persist middleware
    useEffect(() => {
        setMounted(true);
    }, []);

    const filteredProducts = useMemo(() => {
        return products.filter(product => {
            // Handle category - could be ID string or object
            let productCategorySlug = "all";
            
            if (typeof product.category === 'string') {
                // Category is an ID - look it up in categoryMap
                const cat = Array.from(categoryMap.values()).find(c => c.$id === product.category);
                productCategorySlug = cat?.slug || product.category;
            } else if (product.category?.$id) {
                // Category is an object with $id
                productCategorySlug = product.category.slug;
            } else if (product.category?.slug) {
                // Category is an object with just slug
                productCategorySlug = product.category.slug;
            }
            
            const matchesCategory = selectedCategory === "all" || productCategorySlug === selectedCategory;
            const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                product.description.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [products, selectedCategory, searchQuery, categoryMap]);

    const handleCheckout = () => {
        setPaymentModalOpen(true);
    };

    const handleAddToTab = () => {
        if (!cart.length) return;
        setIsAddToTabModalOpen(true);
    };

    const handlePaymentSuccess = async (reference: string, tableNumber: number, guestCount: number) => {
        try {
            // INSTANT FEEDBACK - Show processing overlay immediately (< 3ms)
            setIsProcessingPayment(true);
            setProcessingStatus("processing");

            // Close payment modal
            setPaymentModalOpen(false);

            // Calculate totals
            const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
            // Prices are VAT-inclusive, no separate tax
            const total = subtotal;

            // Generate short order number (max 20 chars per schema)
            const timestamp = Date.now().toString().slice(-10); // Last 10 digits
            const random = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 chars
            const shortOrderNumber = `ORD-${timestamp}-${random}`; // e.g., ORD-4012345678-A3B9 (19 chars)

            // Update status to generating receipt
            setProcessingStatus("generating");

            // Order data matching ACTUAL Appwrite schema (verified)
            const orderData = {
                // Order identification (max 20 chars!)
                orderNumber: shortOrderNumber,
                type: 'dine_in',
                status: 'paid',

                // Customer information
                customerName: "Walk-in Customer",
                tableNumber: tableNumber,
                guestCount: guestCount,

                // Staff information
                waiterName: user?.fullName || "POS System",
                waiterId: user?.id || "system", // Clerk user ID for dashboard filtering

                // Financial details
                subtotal: subtotal,
                taxAmount: 0, // VAT included in prices
                serviceCharge: 0,
                discountAmount: 0,
                tipAmount: 0,
                totalAmount: total,

                // Payment status
                paymentStatus: 'paid',

                // Timing
                orderTime: new Date().toISOString(),

                // Priority and items
                priority: 'normal',
                items: cart, // Will be stringified by createOrder action

                // Store Paystack reference in specialInstructions (optional field)
                specialInstructions: `Paystack Ref: ${reference}`,
            };

            const newOrder = await createOrder(orderData);

            // Mark as complete
            setProcessingStatus("complete");

            // Clear cart
            clearCart();

            // Small delay to show complete state, then navigate
            setTimeout(() => {
                setIsProcessingPayment(false);
                router.push(`/pos/receipt/${newOrder.$id}`);
            }, 500);
        } catch (error) {
            console.error("Failed to create order:", error);
            setIsProcessingPayment(false);
            // Optionally show error toast
        }
    };

    // Calculate total for payment modal (prices are VAT-inclusive)
    const cartTotal = useMemo(() => {
        return cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    }, [cart]);

    // Prevent hydration mismatch by waiting for mount
    if (!mounted || !isLoaded) return <div className="h-screen flex items-center justify-center bg-black text-white">Loading POS...</div>;

    if (showDashboard) {
        return (
            <div className="h-screen bg-neutral-950 text-white overflow-y-auto">
                <div className="p-6">
                    <button
                        onClick={() => setShowDashboard(false)}
                        className="mb-4 text-emerald-400 hover:text-emerald-300"
                    >
                        ← Back to POS
                    </button>
                    <h1 className="text-2xl font-bold mb-6">Server Dashboard: {user?.fullName}</h1>
                    <ServerDashboard />
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden bg-neutral-950">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Optimized Header with Hamburger Menu */}
                <div className="bg-neutral-900 border-b border-white/10 px-4 md:px-8 py-4 safe-area-top">
                    <div className="flex items-center justify-between gap-4">
                        {/* Left: Hamburger (mobile) + Logo */}
                        <div className="flex items-center gap-3">
                            {/* Hamburger Menu Button - Mobile Only */}
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className={`hamburger-btn md:hidden ${isMobileMenuOpen ? 'open' : ''}`}
                                aria-label="Toggle menu"
                            >
                                <span className="hamburger-line"></span>
                                <span className="hamburger-line"></span>
                                <span className="hamburger-line"></span>
                            </button>

                            {/* Logo */}
                            <div>
                                <h1 className="text-xl md:text-2xl font-bold text-white gradient-text">AM | PM POS</h1>
                                <p className="hidden md:block text-xs text-neutral-400 mt-0.5">Point of Sale System</p>
                            </div>
                        </div>

                        {/* Right: Search (desktop) + User */}
                        <div className="flex items-center gap-3">
                            {/* Search - Desktop Only */}
                            <div className="hidden md:block relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                                <input
                                    type="text"
                                    placeholder="Search menu..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-64 bg-neutral-800 border-none rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-neutral-500 focus:ring-2 focus:ring-emerald-500/50"
                                />
                            </div>

                            {/* Dashboard Link - Desktop Only */}
                            {user?.id && (
                                <>
                                    <Link
                                        href={`/pos/dashboard/${user.id}`}
                                        className="hidden md:flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors"
                                    >
                                        <LayoutDashboard className="w-4 h-4" />
                                        <span className="text-sm font-medium">Dashboard</span>
                                    </Link>

                                    <Button
                                        type="button"
                                        onClick={() => setIsSettleTabModalOpen(true)}
                                        className="hidden md:inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg"
                                    >
                                        <CreditCard className="w-4 h-4" />
                                        <span className="text-sm font-medium">Settle Table</span>
                                    </Button>
                                </>
                            )}

                            {/* User Button - Desktop Only */}
                            <div className="hidden md:block">
                                <UserButton
                                    afterSignOutUrl="/"
                                    appearance={{
                                        elements: {
                                            userButtonAvatarBox: "w-9 h-9",
                                            userButtonTrigger: "focus:shadow-none"
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Category Menu Drawer */}
                <div
                    className={`category-menu-overlay ${isMobileMenuOpen ? 'active' : ''}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                />
                <div className={`category-menu-drawer ${isMobileMenuOpen ? 'open' : ''}`}>
                    <div className="category-menu-header">
                        <span className="category-menu-title">Categories</span>
                        <button
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="category-menu-close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="category-menu-content">
                        {displayCategories.map(category => (
                            <button
                                key={category.slug}
                                onClick={() => {
                                    handleCategoryChange(category.slug);
                                    setIsMobileMenuOpen(false);
                                }}
                                className={`category-menu-item ${selectedCategory === category.slug ? 'active' : ''
                                    }`}
                            >
                                {category.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Desktop Category Tabs */}
                <div className="hidden md:block category-tabs">
                    {displayCategories.map(category => (
                        <button
                            key={category.slug}
                            onClick={() => handleCategoryChange(category.slug)}
                            className={`category-tab ${selectedCategory === category.slug
                                ? 'category-tab-active'
                                : 'category-tab-inactive'
                                }`}
                        >
                            {category.label}
                        </button>
                    ))}
                </div>

                {/* Products Grid - Optimized responsive layout */}
                <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 pb-24 md:pb-6 scrollbar-hide">
                    {filteredProducts.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-neutral-500">
                            <div className="text-center space-y-4">
                                <div className="text-6xl opacity-50">🍽️</div>
                                <p className="text-lg">No products available in this category</p>
                            </div>
                        </div>
                    ) : (
                        <div className="product-grid">
                            {filteredProducts.map((product, index) => (
                                <ProductCard
                                    key={product.$id}
                                    product={product}
                                    onAdd={(p) => addToCart(p, 1)}
                                    onView={(p) => setSelectedProduct(p)}
                                    priority={index < 6} // Prioritize first 6 products for above-the-fold loading
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Desktop Cart Sidebar - Hidden on mobile */}
            <div className="hidden md:block">
                <CartSidebar
                    cart={cart}
                    onUpdateQuantity={updateQuantity}
                    onRemove={removeFromCart}
                    onCheckout={handleCheckout}
                    onAddToTab={handleAddToTab}
                />
            </div>

            {/* Mobile Cart - Hidden on desktop */}
            <MobileCart
                cart={cart}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
                onCheckout={handleCheckout}
                onAddToTab={handleAddToTab}
            />

            {/* Product Details Modal */}
            {selectedProduct && (
                <ProductDetailsModal
                    product={selectedProduct}
                    isOpen={!!selectedProduct}
                    onClose={() => setSelectedProduct(null)}
                    onAdd={(product, quantity) => addToCart(product, quantity)}
                />
            )}

            {/* Payment Modal */}
            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setPaymentModalOpen(false)}
                amount={cartTotal}
                email={user?.primaryEmailAddress?.emailAddress || "customer@example.com"}
                orderId={`temp-${Date.now()}`}
                onSuccess={handlePaymentSuccess}
            />

            {/* Processing Overlay - Instant feedback after payment */}
            <ProcessingOverlay
                isVisible={isProcessingPayment}
                status={processingStatus}
            />

            {/* Settle Table Tab Modal */}
            <SettleTableTabModal
                isOpen={isSettleTabModalOpen}
                onClose={() => setIsSettleTabModalOpen(false)}
            />

            {/* Add To Tab Modal */}
            <AddToTabModal
                isOpen={isAddToTabModalOpen}
                onClose={() => setIsAddToTabModalOpen(false)}
                cart={cart as CartItem[]}
                waiterName={user?.fullName || null}
                waiterId={user?.id || null}
                onSuccess={() => {
                    clearCart();
                }}
            />
        </div>
    );
}
