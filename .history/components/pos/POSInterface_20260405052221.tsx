"use client";

import { createOrder, deleteOrder, updateOrder } from "@/lib/actions/pos.actions";

import { useState, useMemo, useEffect } from "react";
import { Product, CartItem, Category, Order } from "@/types/pos.types";
import { ProductCard } from "./ProductCard";
import { isOutOfStock } from "@/lib/stock-utils";
import { printOrderDocket } from "@/lib/print.utils";
import { CartSidebar } from "./CartSidebar";
import { MobileCart } from "./MobileCart";
import { ServerDashboard } from "./ServerDashboard";
import { SettleTableTabModal } from "./SettleTableTabModal";
import { OpenOrdersModal } from "./OpenOrdersModal";
import { OrderConfirmationModal } from "./OrderConfirmationModal";
import { getPOSTables, seatGuestsAtTable } from "@/lib/actions/pos-table.actions";
import { Search, Grid, LayoutDashboard, X, CreditCard, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { usePOSStore } from "@/store/pos-store";
import { ProductDetailsModal } from "./ProductDetailsModal";
import { client } from "@/lib/appwrite-client";
import { Button } from "@/components/ui/button";

import { formatCurrency } from "@/lib/utils";
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
        setCart,
    } = usePOSStore();

    // Local UI State
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [showDashboard, setShowDashboard] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>(searchParams.get("category") || "all");
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isSettleTabModalOpen, setIsSettleTabModalOpen] = useState(false);
    const [isOpenOrdersOpen, setIsOpenOrdersOpen] = useState(false);
    const [isRecentOrderModalOpen, setIsRecentOrderModalOpen] = useState(false);
    const [recentOrder, setRecentOrder] = useState<any | null>(null);
    const [editingOrder, setEditingOrder] = useState<any | null>(null);
    const [showOutOfStock, setShowOutOfStock] = useState(false);
    const [outOfStockItem, setOutOfStockItem] = useState<Product | null>(null);

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

    // Reset out-of-stock toggle when category changes
    useEffect(() => {
        setShowOutOfStock(false);
    }, [selectedCategory]);

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

                    // Update product list
                    setProducts((prev) => prev.map((p) =>
                        p.$id === updatedDoc.$id
                            ? { ...p, ...updatedDoc }
                            : p
                    ));

                    // Keep cart item stock in sync so the quantity cap stays accurate
                    usePOSStore.setState((state) => ({
                        cart: state.cart.map((item) =>
                            item.$id === updatedDoc.$id
                                ? { ...item, stock: updatedDoc.stock, isAvailable: updatedDoc.isAvailable }
                                : item
                        ),
                    }));
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

    // Sort: out-of-stock and unavailable items sink to the bottom
    const sorted = useMemo(() => {
        return [...filteredProducts].sort((a, b) => {
            const aOut = !a.isAvailable || isOutOfStock(a.stock);
            const bOut = !b.isAvailable || isOutOfStock(b.stock);
            if (aOut === bOut) return 0;
            return aOut ? 1 : -1;
        });
    }, [filteredProducts]);

    // Apply show/hide filter (only when toggle is off)
    const visibleProducts = useMemo(() => {
        if (showOutOfStock) return sorted;
        return sorted.filter(
            (item) => item.isAvailable !== false && !isOutOfStock(item.stock),
        );
    }, [sorted, showOutOfStock]);

    // Count of items currently hidden by the toggle
    const hiddenOutOfStockCount = useMemo(() => {
        return sorted.filter(
            (item) => !item.isAvailable || isOutOfStock(item.stock),
        ).length;
    }, [sorted]);

    const handleAddToTab = async () => {
        if (editingOrder) {
            toast.error("Save or cancel the current order edit before creating a new tab.");
            return;
        }

        if (!Array.isArray(cart) || !cart.length) return;

        try {
            const tables = await getPOSTables();
            const availableTable = tables.find((table: any) => table.status === "available");

            if (!availableTable) {
                toast.error("No available table found. Clear an open tab before creating a new one.");
                return;
            }

            const assignedTableNumber = availableTable.number;
            const guestCount = cart.reduce((sum, item) => sum + item.quantity, 0);
            const timestamp = Date.now().toString().slice(-10);
            const random = Math.random().toString(36).substring(2, 6).toUpperCase();
            const shortOrderNumber = `ORD-${timestamp}-${random}`;
            const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const subtotal = total / (1 + 0.16);
            const taxAmount = subtotal * 0.16;

            const orderData = {
                orderNumber: shortOrderNumber,
                type: "dine_in",
                status: "placed",
                tableNumber: assignedTableNumber,
                customerName: "Walk-in Customer",
                guestCount,
                waiterName: user?.fullName || "POS System",
                waiterId: user?.id || "system",
                subtotal: Math.round(subtotal * 100) / 100,
                taxAmount: Math.round(taxAmount * 100) / 100,
                serviceCharge: 0,
                discountAmount: 0,
                tipAmount: 0,
                totalAmount: total,
                paymentStatus: "unpaid",
                orderTime: new Date().toISOString(),
                priority: "normal",
                items: cart,
                specialInstructions: `TAB - Table ${assignedTableNumber}`,
            } as any;

            const newOrder = await createOrder(orderData);

            try {
                await seatGuestsAtTable(
                    assignedTableNumber,
                    guestCount,
                    user?.id || "system",
                    user?.fullName || "POS System",
                    undefined,
                    newOrder.$id
                );
            } catch (seatError) {
                console.error("Table assignment failed after order creation:", seatError);
                await deleteOrder(newOrder.$id);
                toast.error("Unable to assign the table. The order was cancelled.");
                return;
            }

            void printOrderDocket(newOrder.$id);

            const normalizedOrder = {
                ...newOrder,
                items: typeof newOrder.items === "string" ? JSON.parse(newOrder.items) : newOrder.items,
            } as any;

            clearCart();
            setRecentOrder(normalizedOrder);
            setIsRecentOrderModalOpen(true);
        } catch (error) {
            console.error("Failed to add to tab:", error);
            toast.error("Failed to add order to tab. Please try again.");
        }
    };

    const handleEditOrder = async (order: any) => {
        const parsedItems = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
        if (!Array.isArray(parsedItems)) {
            toast.error("Order items could not be loaded for editing.");
            return;
        }

        setEditingOrder(order);
        setCart(parsedItems);
        setIsOpenOrdersOpen(false);
        setIsRecentOrderModalOpen(false);

        toast.success("Order items loaded into cart for editing.");
    };

    const handleSaveOrderChanges = async () => {
        if (!editingOrder) return;

        try {
            const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const subtotal = total / (1 + 0.16);
            const taxAmount = subtotal * 0.16;

            await updateOrder(editingOrder.$id, {
                items: cart,
                subtotal: Math.round(subtotal * 100) / 100,
                taxAmount: Math.round(taxAmount * 100) / 100,
                totalAmount: total,
            } as any);

            toast.success("Order updated successfully.");
            setEditingOrder(null);
            clearCart();
        } catch (error) {
            console.error("Failed to save order changes:", error);
            toast.error("Unable to save order updates.");
        }
    };

    const handleCancelOrderEdit = () => {
        setEditingOrder(null);
        clearCart();
        toast.success("Order edit canceled.");
    };


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
                                        onClick={() => setIsOpenOrdersOpen(true)}
                                        className="hidden md:inline-flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg"
                                    >
                                        <Grid className="w-4 h-4" />
                                        <span className="text-sm font-medium">Open Orders</span>
                                    </Button>

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
                <div className="hidden md:flex gap-1 px-4 md:px-8 py-3 overflow-x-auto scrollbar-hide border-b border-white/5 bg-neutral-900/50">
                    {displayCategories.map(category => (
                        <button
                            key={category.slug}
                            onClick={() => handleCategoryChange(category.slug)}
                            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                                selectedCategory === category.slug
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {category.label}
                        </button>
                    ))}
                </div>

                {/* Show / Hide Out-of-Stock Toggle */}
                {(hiddenOutOfStockCount > 0 || showOutOfStock) && (
                    <div className="flex px-4 md:px-8 py-2 justify-end">
                        <button
                            onClick={() => setShowOutOfStock((prev) => !prev)}
                            aria-label={
                                showOutOfStock
                                    ? 'Hide out-of-stock'
                                    : `Show out-of-stock (${hiddenOutOfStockCount})`
                            }
                            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-150 cursor-pointer select-none"
                        >
                            {showOutOfStock
                                ? 'Hide out-of-stock'
                                : `Show out-of-stock (${hiddenOutOfStockCount})`}
                        </button>
                    </div>
                )}

                {/* Products Grid - Optimized responsive layout */}
                <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 pb-24 md:pb-6 scrollbar-hide">
                    {visibleProducts.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center space-y-3 max-w-xs">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto text-3xl">
                                    🍽️
                                </div>
                                <p className="text-neutral-400 font-medium">No items available</p>
                                <p className="text-neutral-600 text-sm">Try a different category or search term</p>
                            </div>
                        </div>
                    ) : (
                        <div className="product-grid">
                            {visibleProducts.map((product, index) => (
                                <ProductCard
                                    key={product.$id}
                                    product={product}
                                    onAdd={(p) => {
                                        const isOut = !p.isAvailable || isOutOfStock(p.stock);
                                        if (isOut) {
                                            setOutOfStockItem(p);
                                            return;
                                        }
                                        if (p.stock !== undefined) {
                                            const cartArray = Array.isArray(cart) ? cart : [];
                                            const inCart = cartArray.find(c => c.$id === p.$id)?.quantity ?? 0;
                                            if (inCart >= p.stock) {
                                                toast.error(`Only ${p.stock} available — already in cart`);
                                                return;
                                            }
                                        }
                                        addToCart(p, 1);
                                    }}
                                    onView={(p) => {
                                        const isOut = !p.isAvailable || isOutOfStock(p.stock);
                                        if (isOut) {
                                            setOutOfStockItem(p);
                                        } else {
                                            setSelectedProduct(p);
                                        }
                                    }}
                                    priority={index < 6}
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
                    onAddToTab={handleAddToTab}
                />
            </div>

            {/* Mobile Cart - Hidden on desktop */}
            <MobileCart
                cart={cart}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
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

            {/* Out-of-Stock Warning Dialog */}
            {outOfStockItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="oos-dialog-title"
                        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                        onKeyDown={(e) => e.key === 'Escape' && setOutOfStockItem(null)}
                    >
                        <h2
                            id="oos-dialog-title"
                            className="text-white font-semibold text-lg flex items-center gap-2"
                        >
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                            Out of Stock
                        </h2>
                        <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                            <span className="text-white font-medium">
                                &ldquo;{outOfStockItem.name}&rdquo;
                            </span>{' '}
                            is currently out of stock. Adding it to the cart may not be
                            fulfillable.
                        </p>
                        <div className="flex gap-3 mt-6">
                            <button
                                autoFocus
                                onClick={() => setOutOfStockItem(null)}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-medium transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    addToCart(outOfStockItem, 1);
                                    setOutOfStockItem(null);
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 text-sm font-medium transition"
                            >
                                Add Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settle Table Tab Modal */}
            <SettleTableTabModal
                isOpen={isSettleTabModalOpen}
                onClose={() => setIsSettleTabModalOpen(false)}
            />

            {/* Open Orders Modal */}
            <OpenOrdersModal
                isOpen={isOpenOrdersOpen}
                onClose={() => setIsOpenOrdersOpen(false)}
                onPrint={async (order) => {
                    await printOrderDocket(order.$id);
                }}
                onDelete={async (order) => {
                    try {
                        const response = await fetch(`/api/pos/orders?orderId=${order.$id}`, {
                            method: 'DELETE',
                        });
                        if (response.ok) {
                            toast.success('Order deleted');
                        } else {
                            throw new Error('Delete failed');
                        }
                    } catch (error) {
                        console.error(error);
                        toast.error('Failed to delete order');
                    }
                }}
                onEdit={async (order) => {
                    const newName = window.prompt('Enter updated customer name', order.customerName || '');
                    if (newName !== null) {
                        try {
                            const response = await fetch('/api/pos/orders', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderId: order.$id, data: { customerName: newName } }),
                            });
                            if (response.ok) {
                                toast.success('Order updated');
                            } else {
                                throw new Error('Update failed');
                            }
                        } catch (error) {
                            console.error(error);
                            toast.error('Failed to update order');
                        }
                    }
                }}
            />


            {/* Recent Order Review Modal */}
            <OrderConfirmationModal
                isOpen={isRecentOrderModalOpen && recentOrder !== null}
                onClose={() => {
                    setIsRecentOrderModalOpen(false);
                    setRecentOrder(null);
                }}
                items={recentOrder?.items || []}
                total={recentOrder?.totalAmount || 0}
                tableNumber={recentOrder?.tableNumber}
                customerName={recentOrder?.customerName}
                onPrint={() => {
                    if (recentOrder) {
                        void printOrderDocket(recentOrder.$id);
                    }
                }}
                onEdit={() => {
                    const newName = window.prompt('Update customer name', recentOrder?.customerName || '');
                    if (newName && recentOrder) {
                        void fetch('/api/pos/orders', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId: recentOrder.$id, data: { customerName: newName } }),
                        }).then((response) => {
                            if (response.ok) {
                                toast.success('Order updated');
                            } else {
                                toast.error('Failed to update order');
                            }
                        }).catch((err) => {
                            console.error(err);
                            toast.error('Failed to update order');
                        });
                    }
                }}
                onDelete={() => {
                    if (!recentOrder) return;
                    void fetch(`/api/pos/orders?orderId=${recentOrder.$id}`, {
                        method: 'DELETE',
                    }).then((response) => {
                        if (response.ok) {
                            toast.success('Order deleted');
                        } else {
                            toast.error('Failed to delete order');
                        }
                        setIsRecentOrderModalOpen(false);
                        setRecentOrder(null);
                    }).catch((err) => {
                        console.error(err);
                        toast.error('Failed to delete order');
                        setIsRecentOrderModalOpen(false);
                        setRecentOrder(null);
                    });
                }}
                onConfirm={() => {
                    setIsRecentOrderModalOpen(false);
                    setRecentOrder(null);
                }}
                confirmLabel="Done"
            />
        </div>
    );
}
