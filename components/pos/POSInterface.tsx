"use client";

import {
    createTabOrderFromCart,
    updateOrder,
    computeKitchenPrintChangesForOrder,
    getOrder,
} from "@/lib/actions/pos.actions";

import { useState, useMemo, useEffect } from "react";
import { Product, CartItem, Category, Order } from "@/types/pos.types";
import { ProductCard } from "./ProductCard";
import { isOutOfStock } from "@/lib/stock-utils";
import { printOrderDocket, printKitchenDelta, printKitchenAnomalyAdjustment } from "@/lib/print.utils";
import { CartSidebar } from "./CartSidebar";
import { MobileCart } from "./MobileCart";
import { ServerDashboard } from "./ServerDashboard";
import { SettleTableTabModal } from "./SettleTableTabModal";
import { OpenOrdersModal } from "./OpenOrdersModal";
import { ClosedOrdersModal } from "./ClosedOrdersModal";
import { DocketPreviewModal } from "./DocketPreviewModal";
import { OrderReceiptModal } from "./OrderReceiptModal";
import {
    Search,
    Grid,
    LayoutDashboard,
    X,
    CreditCard,
    Receipt,
    AlertTriangle,
    BellRing,
    CheckCircle2,
    Copy,
    ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { usePOSStore } from "@/store/pos-store";
import { ProductDetailsModal } from "./ProductDetailsModal";
import { client } from "@/lib/appwrite-client";
import { subscribeWithRetry } from "@/lib/realtime-subscribe";
import {
    menuDocumentToProduct,
    menuItemVisibleOnPos,
    parseMenuRealtimeEvents,
} from "@/lib/pos-menu-product";
import { Button } from "@/components/ui/button";
import { PayNowModal } from "@/components/pos/PayNowModal";
import { CentralWaiterPinGate } from "@/components/pos/CentralWaiterPinGate";
import {
    clearActiveWaiterSession,
    loadActiveWaiterSession,
    saveActiveWaiterSession,
    touchActiveWaiterSession,
    type ActiveWaiterSession,
} from "@/lib/pos-waiter-session";

import { formatCurrency } from "@/lib/utils";
import { displayPaymentMethod } from "@/lib/payment-display";
import { useUser, UserButton, useOrganization } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface POSInterfaceProps {
    initialProducts: Product[];
    initialCategories: Category[];
}

type RecentConfirmation = {
    id: string;
    amount: number;
    reference: string;
    methodLabel: string;
    orderHint?: string;
    createdAt: number;
    source: "settle_tab" | "pay_now" | "realtime";
};

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const CONFIRMATION_MAX_ITEMS = 10;
const WAITER_AUTOLOCK_MS = Math.max(
    30_000,
    Number(process.env.NEXT_PUBLIC_CENTRAL_POS_AUTOLOCK_MS || 180_000)
);

export default function POSInterface({ initialProducts, initialCategories }: POSInterfaceProps) {
    const { organization, membership } = useOrganization();
    const orgId = organization?.id ?? null;
    const isOrgAdmin = membership?.role === "org:admin";
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Global State
    const {
        cart,
        addToCart,
        updateQuantity,
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
    const [isClosedOrdersOpen, setIsClosedOrdersOpen] = useState(false);
    const [isDocketModalOpen, setIsDocketModalOpen] = useState(false);
    const [docketModalType, setDocketModalType] = useState<"new" | "addition">("new");
    const [docketModalOrder, setDocketModalOrder] = useState<any | null>(null);
    const [docketModalDelta, setDocketModalDelta] = useState<{ name: string; quantity: number; price: number }[]>([]);
    const [editingOrder, setEditingOrder] = useState<any | null>(null);
    const [showOutOfStock, setShowOutOfStock] = useState(false);
    const [receiptOrder, setReceiptOrder] = useState<{
        $id: string;
        orderNumber?: string;
        tableNumber?: number;
        customerName?: string;
        waiterName?: string;
        orderTime: string;
        items: any[];
        subtotal: number;
        totalAmount: number;
        paymentStatus: string;
        paymentMethods?: Array<{ method?: string; amount?: number; reference?: string }>;
    } | null>(null);
    const [receiptPaymentMethod, setReceiptPaymentMethod] = useState<string | undefined>(undefined);
    const [receiptPaymentRef, setReceiptPaymentRef] = useState<string | undefined>(undefined);
    const [outOfStockItem, setOutOfStockItem] = useState<Product | null>(null);
    const [payNowOpen, setPayNowOpen] = useState(false);
    const [editConflict, setEditConflict] = useState<{ orderId: string; message: string } | null>(null);
    const [editingCustomerNameDraft, setEditingCustomerNameDraft] = useState("");
    const [recentConfirmations, setRecentConfirmations] = useState<RecentConfirmation[]>([]);
    const [confirmationTrayOpen, setConfirmationTrayOpen] = useState(true);
    const [closedOrdersSearchSeed, setClosedOrdersSearchSeed] = useState("");
    const [activeWaiterSession, setActiveWaiterSession] = useState<ActiveWaiterSession | null>(null);
    const centralPosModeEnabled =
        String(process.env.NEXT_PUBLIC_CENTRAL_POS_MODE_ENABLED || "false").trim().toLowerCase() === "true";

    // O(1) category lookup optimization
    const categoryMap = useMemo(() => {
        const map = new Map<string, Category>();
        initialCategories.forEach(cat => map.set(cat.slug, cat));
        return map;
    }, [initialCategories]);

    const payNowTotal = useMemo(() => {
        const arr = Array.isArray(cart) ? cart : [];
        return arr.reduce((s, i) => s + i.price * i.quantity, 0);
    }, [cart]);

    const enqueueConfirmation = (incoming: {
        amount: number;
        reference?: string;
        methodLabel?: string;
        orderHint?: string;
        source: RecentConfirmation["source"];
    }) => {
        const amount = Number(incoming.amount) || 0;
        const reference = String(incoming.reference || "").trim();
        if (amount <= 0 || !reference) return;
        const methodLabel = String(incoming.methodLabel || "Payment");
        const orderHint = String(incoming.orderHint || "").trim();
        const now = Date.now();
        const fingerprint = `${reference.toUpperCase()}::${Math.round(amount * 100)}`;

        setRecentConfirmations((prev) => {
            const fresh = prev.filter((x) => now - x.createdAt <= CONFIRMATION_TTL_MS);
            const duplicate = fresh.some(
                (x) =>
                    `${x.reference.toUpperCase()}::${Math.round(x.amount * 100)}` === fingerprint &&
                    now - x.createdAt < 90_000
            );
            if (duplicate) return fresh;
            return [
                {
                    id: `${fingerprint}:${now}`,
                    amount,
                    reference,
                    methodLabel,
                    orderHint,
                    createdAt: now,
                    source: incoming.source,
                },
                ...fresh,
            ].slice(0, CONFIRMATION_MAX_ITEMS);
        });
    };

    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now();
            setRecentConfirmations((prev) =>
                prev.filter((x) => now - x.createdAt <= CONFIRMATION_TTL_MS)
            );
        }, 15_000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!centralPosModeEnabled) return;
        setActiveWaiterSession(loadActiveWaiterSession());
    }, [centralPosModeEnabled]);

    useEffect(() => {
        if (!centralPosModeEnabled || !activeWaiterSession) return;
        const markActive = () => {
            const touched = touchActiveWaiterSession();
            if (touched) setActiveWaiterSession(touched);
        };
        const onActivity = () => markActive();
        window.addEventListener("pointerdown", onActivity);
        window.addEventListener("keydown", onActivity);
        const timer = setInterval(() => {
            const current = loadActiveWaiterSession();
            if (!current) {
                setActiveWaiterSession(null);
                return;
            }
            const idleMs = Date.now() - new Date(current.lastActiveAt).getTime();
            if (idleMs >= WAITER_AUTOLOCK_MS) {
                clearActiveWaiterSession();
                setActiveWaiterSession(null);
                toast.message("Central POS locked after inactivity. Enter waiter passkey to continue.");
            }
        }, 15_000);
        return () => {
            window.removeEventListener("pointerdown", onActivity);
            window.removeEventListener("keydown", onActivity);
            clearInterval(timer);
        };
    }, [centralPosModeEnabled, activeWaiterSession]);

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

    // Keep menu in sync when navigating back to /pos or after server revalidation
    useEffect(() => {
        setProducts(initialProducts);
    }, [initialProducts]);

    const handleCategoryChange = (categoryId: string) => {
        setSelectedCategory(categoryId);
        // Update URL without refresh
        router.push(`?category=${categoryId}`, { scroll: false });
    };

    // Realtime: admin/CMS changes must apply without full page reload.
    // Appwrite sends concrete event paths (e.g. ...documents.<id>.update), never literal "*".
    useEffect(() => {
        const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
        const collectionId = process.env.NEXT_PUBLIC_MENU_ITEMS_COLLECTION_ID;

        if (!databaseId || !collectionId) return;

        const unsubscribe = subscribeWithRetry(
            () =>
                client.subscribe(
                    `databases.${databaseId}.collections.${collectionId}.documents`,
                    (response) => {
                        const { isCreate, isUpdate, isDelete } = parseMenuRealtimeEvents(response.events || []);
                        if (!isCreate && !isUpdate && !isDelete) return;

                        const raw = response.payload as Record<string, unknown> | null;
                        if (!raw || typeof raw !== "object" || raw.$id == null) return;

                        const docId = String(raw.$id);

                        if (isDelete) {
                            setProducts((prev) => prev.filter((p) => p.$id !== docId));
                            usePOSStore.setState((state) => ({
                                cart: state.cart.filter((item) => item.$id !== docId),
                            }));
                            return;
                        }

                        const visible = menuItemVisibleOnPos(raw, orgId);
                        const nextProduct = menuDocumentToProduct(raw);

                        setProducts((prev) => {
                            const idx = prev.findIndex((p) => p.$id === docId);
                            if (!visible) {
                                return prev.filter((p) => p.$id !== docId);
                            }
                            if (idx >= 0) {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], ...nextProduct };
                                return copy;
                            }
                            return [...prev, nextProduct];
                        });

                        usePOSStore.setState((state) => ({
                            cart: state.cart.map((item) =>
                                item.$id === docId
                                    ? {
                                          ...nextProduct,
                                          quantity: item.quantity,
                                          notes: item.notes,
                                      }
                                    : item
                            ),
                        }));
                    }
                ),
            { maxAttempts: 5, initialDelayMs: 120 }
        );

        return () => {
            unsubscribe();
        };
    }, [orgId]);

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

    const activeWaiterName = centralPosModeEnabled
        ? activeWaiterSession?.waiterName || "POS System"
        : user?.fullName || "POS System";
    const activeWaiterId = centralPosModeEnabled
        ? activeWaiterSession?.waiterUserId || "system"
        : user?.id || "system";
    const waiterGateOpen = centralPosModeEnabled && !activeWaiterSession;

    const handleAddToTab = async () => {
        if (editingOrder) {
            toast.error("Save or cancel the current order edit before creating a new tab.");
            return;
        }

        if (waiterGateOpen) {
            toast.error("Enter waiter passkey first.");
            return;
        }

        if (!Array.isArray(cart) || !cart.length) return;

        try {
            const newOrder = await createTabOrderFromCart({
                items: cart,
                waiterName: activeWaiterName,
                waiterId: activeWaiterId,
            });

            let parsedItems: unknown = newOrder.items;
            if (typeof parsedItems === "string") {
                try {
                    parsedItems = JSON.parse(parsedItems);
                } catch {
                    parsedItems = [];
                }
            }
            if (!Array.isArray(parsedItems)) {
                parsedItems = [];
            }

            const normalizedOrder = {
                ...newOrder,
                items: parsedItems,
            } as any;

            clearCart();
            void printOrderDocket(newOrder.$id);
            setDocketModalOrder(normalizedOrder);
            setDocketModalType("new");
            setDocketModalDelta([]);
            setIsDocketModalOpen(true);
        } catch (error) {
            console.error("Failed to add to tab:", error);
            const message =
                error instanceof Error ? error.message : "Failed to add order to tab. Please try again.";
            toast.error(message);
        }
    };

    const handleEditOrder = async (order: any) => {
        let parsedItems: unknown;
        try {
            parsedItems = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
        } catch {
            toast.error("Order items could not be loaded for editing.");
            return;
        }
        if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
            toast.error("Order items could not be loaded for editing.");
            return;
        }

        setEditingOrder(order);
        setEditingCustomerNameDraft(String(order?.customerName || "Walk-in Customer"));
        setCart(parsedItems as CartItem[]);
        setIsOpenOrdersOpen(false);
        setIsClosedOrdersOpen(false);
        setIsSettleTabModalOpen(false);

        toast.success("Order loaded — adjust quantities or items, then tap Update.");
    };

    const handleSaveOrderChanges = async () => {
        if (!editingOrder) return;

        try {
            const hashKey = (value: unknown) => {
                const src = JSON.stringify(value);
                let h = 2166136261 >>> 0;
                for (let i = 0; i < src.length; i++) {
                    h ^= src.charCodeAt(i);
                    h = Math.imul(h, 16777619);
                }
                return (h >>> 0).toString(16);
            };
            const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const subtotal = total / (1 + 0.16);
            const taxAmount = subtotal * 0.16;

            const cartLines = cart.map((c) => ({
                $id: c.$id,
                quantity: c.quantity,
                name: c.name,
            }));

            const {
                deltaItems,
                anomalyItems,
                newSnapshotLines,
                baseSnapshotVersion,
                nextSnapshotVersion,
            } = await computeKitchenPrintChangesForOrder(
                editingOrder.$id,
                cartLines
            );

            // Enrich delta with price from cart BEFORE clearing — cart is still available
            const enrichedDelta = deltaItems.map((d) => {
                const cartItem = cart.find((c) => c.name === d.name);
                return { ...d, price: cartItem?.price ?? 0 };
            });

            await updateOrder(editingOrder.$id, {
                items: cart,
                customerName: String(editingCustomerNameDraft || "").trim() || "Walk-in Customer",
                subtotal: Math.round(subtotal * 100) / 100,
                taxAmount: Math.round(taxAmount * 100) / 100,
                totalAmount: total,
                kitchenSnapshotLines: newSnapshotLines,
                kitchenBaseSnapshotVersion: baseSnapshotVersion,
                kitchenSnapshotVersion: nextSnapshotVersion,
            } as any);

            // Queue print jobs only after the order/snapshot commit succeeds.
            if (enrichedDelta.length > 0) {
                const dedupeKey = `delta-${editingOrder.$id}-${baseSnapshotVersion}-${hashKey(enrichedDelta)}`;
                void printKitchenDelta(editingOrder.$id, enrichedDelta, dedupeKey);
            }
            if (anomalyItems.length > 0) {
                const previousItemsRaw =
                    typeof editingOrder.items === "string"
                        ? (() => {
                              try {
                                  return JSON.parse(editingOrder.items);
                              } catch {
                                  return [];
                              }
                          })()
                        : editingOrder.items;
                const previousItems = Array.isArray(previousItemsRaw) ? previousItemsRaw : [];
                const nameById = new Map<string, string>();
                previousItems.forEach((x: any) => {
                    const id = String(x?.$id || "").trim();
                    if (id) nameById.set(id, String(x?.name || "Item").slice(0, 80));
                });
                void printKitchenAnomalyAdjustment(
                    editingOrder.$id,
                    anomalyItems.map((a) => ({
                        name: (a.itemId && nameById.get(a.itemId)) || a.name || "Item",
                        quantity: a.quantity,
                        note: a.note,
                    })),
                    "Customer requested to return item",
                    `anomaly-${editingOrder.$id}-${baseSnapshotVersion}-${hashKey(anomalyItems)}`
                );
            }

            // clearCart AFTER updateOrder so enrichedDelta price lookup above is valid
            clearCart();
            setEditingOrder(null);
            setEditingCustomerNameDraft("");

            // Show docket modal for additions
            if (enrichedDelta.length > 0) {
                setDocketModalOrder(editingOrder);
                setDocketModalType("addition");
                setDocketModalDelta(enrichedDelta);
                setIsDocketModalOpen(true);
            } else if (anomalyItems.length > 0) {
                toast.success("Order updated. Anomaly adjustment docket queued for admin review.");
            } else {
                toast.success("Order updated successfully.");
            }
        } catch (error) {
            console.error("Failed to save order changes:", error);
            const message = error instanceof Error ? error.message : "Unable to save order updates.";
            if (message.toLowerCase().includes("another terminal")) {
                setEditConflict({
                    orderId: editingOrder.$id,
                    message,
                });
                toast.warning("Order changed elsewhere. Reload latest data before saving again.");
                return;
            }
            toast.error("Unable to save order updates.");
        }
    };

    const handleReloadLatestConflictOrder = async () => {
        if (!editConflict?.orderId) return;
        try {
            const latest = await getOrder(editConflict.orderId);
            if (!latest) {
                toast.error("Order no longer available.");
                setEditConflict(null);
                setEditingOrder(null);
                clearCart();
                return;
            }
            const parsedItems = typeof latest.items === "string" ? JSON.parse(latest.items) : latest.items;
            if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
                toast.error("Latest order has no items to edit.");
                setEditConflict(null);
                return;
            }
            setEditingOrder(latest);
            setEditingCustomerNameDraft(String(latest?.customerName || "Walk-in Customer"));
            setCart(parsedItems as CartItem[]);
            setEditConflict(null);
            toast.success("Latest order state loaded. Re-apply your edit and save.");
        } catch (error) {
            console.error("Failed to reload conflicted order:", error);
            toast.error("Could not reload latest order.");
        }
    };

    const handleCancelOrderEdit = () => {
        setEditingOrder(null);
        setEditingCustomerNameDraft("");
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
            <CentralWaiterPinGate
                open={waiterGateOpen}
                session={activeWaiterSession}
                onVerified={(session) => {
                    saveActiveWaiterSession(session);
                    setActiveWaiterSession(session);
                    toast.success(`Welcome, ${session.waiterName}.`);
                }}
                onLock={() => {
                    clearActiveWaiterSession();
                    setActiveWaiterSession(null);
                }}
            />
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Header — vertically stacked, centered on tablet; no logo chrome */}
                <div className="bg-neutral-900 border-b border-white/10 px-4 pt-3 pb-3 safe-area-top pos-tablet-portrait-top-safe">
                    {/* Phone: hamburger + search + user inline */}
                    <div className="flex md:hidden items-center gap-3">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className={`hamburger-btn flex-shrink-0 ${isMobileMenuOpen ? 'open' : ''}`}
                            aria-label="Toggle menu"
                        >
                            <span className="hamburger-line"></span>
                            <span className="hamburger-line"></span>
                            <span className="hamburger-line"></span>
                        </button>
                        <div className="flex-1 relative min-w-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                            <input
                                type="text"
                                placeholder="Search menu..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-neutral-800 border-none rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-neutral-500 focus:ring-2 focus:ring-emerald-500/50"
                            />
                        </div>
                        {user?.id && (
                            <div className="flex-shrink-0">
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
                        )}
                    </div>

                    {/* Tablet+: single centered column — search full width, then actions */}
                    <div className="hidden md:flex flex-col items-center w-full max-w-4xl xl:max-w-5xl mx-auto gap-4 px-1">
                        <div className="relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                            <input
                                type="text"
                                placeholder="Search menu..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-neutral-800 border border-white/5 rounded-xl py-3.5 pl-11 pr-14 text-base md:text-[17px] text-white placeholder:text-neutral-500 focus:ring-2 focus:ring-emerald-500/50 text-center md:text-left"
                            />
                            {user?.id && (
                                <div className="absolute right-2 top-1/2 -translate-y-1/2">
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
                            )}
                        </div>

                        {user?.id && (
                            <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
                                <Link
                                    href={`/pos/dashboard/${user.id}`}
                                    className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-5 py-3.5 min-h-[52px] rounded-xl text-sm md:text-[15px] font-semibold transition-colors duration-200 cursor-pointer"
                                >
                                    <LayoutDashboard className="w-5 h-5 shrink-0" />
                                    Dashboard
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => setIsOpenOrdersOpen(true)}
                                    className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-5 py-3.5 min-h-[52px] rounded-xl text-sm md:text-[15px] font-semibold transition-colors duration-200 cursor-pointer"
                                >
                                    <Grid className="w-5 h-5 shrink-0" />
                                    Open Orders
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsClosedOrdersOpen(true)}
                                    className="flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-600 text-white px-5 py-3.5 min-h-[52px] rounded-xl text-sm md:text-[15px] font-semibold transition-colors duration-200 cursor-pointer"
                                >
                                    <Receipt className="w-5 h-5 shrink-0" />
                                    Closed Orders
                                </button>
                                {isOrgAdmin && (
                                    <Link
                                        href="/pos/receipts"
                                        className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-5 py-3.5 min-h-[52px] rounded-xl text-sm md:text-[15px] font-semibold transition-colors duration-200 cursor-pointer"
                                    >
                                        <Receipt className="w-5 h-5 shrink-0" />
                                        Receipts
                                    </Link>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsSettleTabModalOpen(true)}
                                    className="flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white px-5 py-3.5 min-h-[52px] rounded-xl text-sm md:text-[15px] font-semibold transition-colors duration-200 cursor-pointer"
                                >
                                    <CreditCard className="w-5 h-5 shrink-0" />
                                    Settle Table
                                </button>
                            </div>
                        )}
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
                <div className="hidden md:flex gap-2 px-4 md:px-5 py-2.5 overflow-x-auto scrollbar-hide border-b border-white/5 bg-neutral-900/50">
                    {displayCategories.map(category => (
                        <button
                            key={category.slug}
                            type="button"
                            onClick={() => handleCategoryChange(category.slug)}
                            className={`shrink-0 min-h-[48px] px-4 md:px-5 py-2.5 rounded-xl text-sm md:text-base font-semibold transition-colors duration-200 cursor-pointer ${
                                selectedCategory === category.slug
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/35"
                                    : "text-neutral-400 hover:text-white hover:bg-white/[0.07] border border-transparent"
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
                <div className="pos-main-content flex-1 overflow-y-auto px-3 md:px-5 lg:px-6 py-4 md:py-5 pb-24 md:pb-4 scrollbar-hide">
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
            <div className="hidden md:flex md:h-full overflow-hidden pos-cart-sidebar-wrapper">
                <CartSidebar
                    cart={cart}
                    onUpdateQuantity={updateQuantity}
                    onAddToTab={handleAddToTab}
                    editingOrderId={editingOrder?.$id}
                    editingCustomerName={editingCustomerNameDraft || (editingOrder?.customerName ?? null)}
                    editingCustomerNameDraft={editingCustomerNameDraft}
                    onEditCustomerName={setEditingCustomerNameDraft}
                    onSaveOrderChanges={handleSaveOrderChanges}
                    onCancelEdit={handleCancelOrderEdit}
                />
            </div>

            {/* Mobile Cart - Hidden on desktop */}
            <MobileCart
                cart={cart}
                onUpdateQuantity={updateQuantity}
                onAddToTab={handleAddToTab}
                editingOrderId={editingOrder?.$id}
                editingCustomerName={editingCustomerNameDraft || (editingOrder?.customerName ?? null)}
                editingCustomerNameDraft={editingCustomerNameDraft}
                onEditCustomerName={setEditingCustomerNameDraft}
                onSaveOrderChanges={handleSaveOrderChanges}
                onCancelEdit={handleCancelOrderEdit}
                onOpenOrders={() => setIsOpenOrdersOpen(true)}
                onSettle={() => setIsSettleTabModalOpen(true)}
                onClosedOrders={() => setIsClosedOrdersOpen(true)}
                settleModalOpen={isSettleTabModalOpen}
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

            {/* Waiter confirmation tray (persistent for 5 minutes) */}
            {recentConfirmations.length > 0 && (
                <div className="fixed right-3 md:right-5 bottom-24 md:bottom-5 z-[70] w-[min(92vw,22rem)]">
                    <div className="rounded-2xl border border-emerald-500/30 bg-neutral-900/95 shadow-2xl overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setConfirmationTrayOpen((v) => !v)}
                            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-200 transition-colors"
                        >
                            <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                <BellRing className="w-4 h-4" />
                                Recent confirmations
                            </span>
                            <span className="text-xs tabular-nums">{recentConfirmations.length}</span>
                        </button>
                        {confirmationTrayOpen && (
                            <div className="max-h-64 overflow-y-auto p-2.5 space-y-2">
                                {recentConfirmations.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-[12px] font-semibold text-white inline-flex items-center gap-1.5">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                {entry.methodLabel}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setRecentConfirmations((prev) =>
                                                        prev.filter((x) => x.id !== entry.id)
                                                    )
                                                }
                                                className="text-neutral-500 hover:text-white"
                                                aria-label="Dismiss confirmation"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <p className="text-xs text-emerald-300 mt-1 tabular-nums">
                                            {formatCurrency(entry.amount)}
                                        </p>
                                        <p className="text-[11px] text-neutral-300 mt-0.5 break-all">
                                            Ref {entry.reference}
                                        </p>
                                        {entry.orderHint && (
                                            <p className="text-[11px] text-neutral-400 mt-0.5">
                                                Order {entry.orderHint}
                                            </p>
                                        )}
                                        <div className="mt-1.5 flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        await navigator.clipboard.writeText(entry.reference);
                                                        toast.success("Payment reference copied");
                                                    } catch {
                                                        toast.error("Failed to copy reference");
                                                    }
                                                }}
                                                className="inline-flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200"
                                            >
                                                <Copy className="w-3 h-3" />
                                                Copy ref
                                            </button>
                                            {entry.orderHint && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setClosedOrdersSearchSeed(entry.orderHint || "");
                                                        setIsClosedOrdersOpen(true);
                                                    }}
                                                    className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200"
                                                >
                                                    <ArrowUpRight className="w-3 h-3" />
                                                    Jump to order
                                                </button>
                                            )}
                                        </div>
                                        <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-400/80 transition-all"
                                                style={{
                                                    width: `${Math.max(
                                                        0,
                                                        Math.min(
                                                            100,
                                                            ((CONFIRMATION_TTL_MS - (Date.now() - entry.createdAt)) /
                                                                CONFIRMATION_TTL_MS) *
                                                                100
                                                        )
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                        <p className="text-[10px] text-neutral-500 mt-0.5">
                                            {new Date(entry.createdAt).toLocaleTimeString("en-KE", {
                                                timeStyle: "short",
                                            })}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Settle Table Tab Modal */}
            <SettleTableTabModal
                isOpen={isSettleTabModalOpen}
                onClose={() => setIsSettleTabModalOpen(false)}
                onSettlementSuccess={(consolidatedOrderId, totalAmount, meta) => {
                    const subtotal = totalAmount / 1.16;
                    setReceiptOrder({
                        $id: consolidatedOrderId,
                        orderNumber: consolidatedOrderId,
                        orderTime: new Date().toISOString(),
                        items: [],
                        subtotal,
                        totalAmount,
                        paymentStatus: "paid",
                        paymentMethods: meta.paymentMethods,
                    });
                    setReceiptPaymentMethod(meta.primaryPaymentLabel);
                    setReceiptPaymentRef(meta.paymentReference);
                    setIsSettleTabModalOpen(false);
                    const primaryMethod = meta.primaryPaymentLabel || "Settlement";
                    const primaryRef =
                        meta.paymentReference ||
                        (Array.isArray(meta.paymentMethods) ? meta.paymentMethods[0]?.reference : "") ||
                        "";
                    const primaryAmount =
                        (Array.isArray(meta.paymentMethods)
                            ? (meta.paymentMethods.reduce((s, m) => s + (Number(m.amount) || 0), 0) || totalAmount)
                            : totalAmount) || totalAmount;
                    enqueueConfirmation({
                        amount: primaryAmount,
                        reference: primaryRef,
                        methodLabel: primaryMethod,
                        orderHint: consolidatedOrderId,
                        source: "settle_tab",
                    });
                }}
                onBankRealtimeConfirmed={({ amount, reference, orderIds }) => {
                    enqueueConfirmation({
                        amount,
                        reference,
                        methodLabel: "Bank Paybill",
                        orderHint: Array.isArray(orderIds) && orderIds.length > 0 ? orderIds[0] : "",
                        source: "realtime",
                    });
                }}
            />

            <ClosedOrdersModal
                isOpen={isClosedOrdersOpen}
                onClose={() => {
                    setIsClosedOrdersOpen(false);
                    setClosedOrdersSearchSeed("");
                }}
                initialSearchQuery={closedOrdersSearchSeed}
            />

            {/* Open Orders Modal */}
            <OpenOrdersModal
                isOpen={isOpenOrdersOpen}
                onClose={() => setIsOpenOrdersOpen(false)}
                onPrint={(order) => {
                    setReceiptOrder({
                        $id: order.$id,
                        orderNumber: order.orderNumber,
                        tableNumber: order.tableNumber,
                        customerName: order.customerName,
                        waiterName: order.waiterName,
                        orderTime: order.orderTime,
                        items: Array.isArray(order.items) ? order.items as any[] : [],
                        subtotal: order.totalAmount / 1.16,
                        totalAmount: order.totalAmount,
                        paymentStatus: order.paymentStatus ?? "unpaid",
                        paymentMethods: Array.isArray(order.paymentMethods) ? order.paymentMethods : undefined,
                    });
                    setReceiptPaymentMethod(undefined);
                    setReceiptPaymentRef(undefined);
                }}
                onEdit={handleEditOrder}
            />


            {/* Docket Preview Modal — shown after Add to Tab or Update Order */}
            <DocketPreviewModal
                isOpen={isDocketModalOpen}
                onClose={() => {
                    setIsDocketModalOpen(false);
                    setDocketModalOrder(null);
                }}
                onEdit={() => {
                    setIsDocketModalOpen(false);
                    if (docketModalOrder) {
                        handleEditOrder(docketModalOrder);
                    }
                }}
                order={docketModalOrder ?? { totalAmount: 0, items: [] }}
                deltaItems={docketModalDelta}
                type={docketModalType}
            />

            {/* Receipt Modal — shown after print button tap or settlement */}
            {receiptOrder && (
                <OrderReceiptModal
                    isOpen={!!receiptOrder}
                    onClose={() => setReceiptOrder(null)}
                    order={receiptOrder}
                    paymentMethod={receiptPaymentMethod}
                    paymentReference={receiptPaymentRef}
                />
            )}

            {editingOrder && (
                <PayNowModal
                    isOpen={payNowOpen}
                    onClose={() => setPayNowOpen(false)}
                    orderId={editingOrder.$id}
                    orderNumber={editingOrder.orderNumber}
                    totalAmount={payNowTotal}
                    onPaymentSuccess={({ reference, method, paymentMethods }) => {
                        const subtotal = payNowTotal / 1.16;
                        const resolvedMethods =
                            Array.isArray(paymentMethods) && paymentMethods.length > 0
                                ? paymentMethods
                                : [
                                      {
                                          method,
                                          amount: payNowTotal,
                                          reference,
                                      },
                                  ];
                        const label =
                            resolvedMethods.length > 1
                                ? "Split payment"
                                : displayPaymentMethod(resolvedMethods[0]?.method);
                        setReceiptOrder({
                            $id: editingOrder.$id,
                            orderNumber: editingOrder.orderNumber,
                            tableNumber: editingOrder.tableNumber,
                            customerName: editingOrder.customerName,
                            waiterName: editingOrder.waiterName,
                            orderTime: new Date().toISOString(),
                            items: Array.isArray(cart) ? (cart as any[]) : [],
                            subtotal,
                            totalAmount: payNowTotal,
                            paymentStatus: "paid",
                            paymentMethods: resolvedMethods,
                        });
                        setReceiptPaymentMethod(label);
                        setReceiptPaymentRef(reference);
                        setPayNowOpen(false);
                        clearCart();
                        setEditingOrder(null);
                        const amountForTray =
                            Array.isArray(resolvedMethods) && resolvedMethods.length > 0
                                ? resolvedMethods.reduce((s, m: any) => s + (Number(m.amount) || 0), 0) || payNowTotal
                                : payNowTotal;
                        enqueueConfirmation({
                            amount: amountForTray,
                            reference,
                            methodLabel: label,
                            orderHint: editingOrder.orderNumber || editingOrder.$id,
                            source: "pay_now",
                        });
                        toast.success("Order paid and receipt queued");
                    }}
                />
            )}
            {editConflict && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-md rounded-xl border border-amber-500/40 bg-neutral-900 p-4 text-white shadow-2xl">
                        <h3 className="text-sm font-semibold text-amber-300">Order update conflict detected</h3>
                        <p className="mt-2 text-sm text-neutral-300">{editConflict.message}</p>
                        <p className="mt-2 text-xs text-neutral-400">
                            Reload latest order data to preserve snapshot integrity and avoid duplicate print deltas.
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditConflict(null)}
                            >
                                Dismiss
                            </Button>
                            <Button
                                type="button"
                                onClick={() => void handleReloadLatestConflictOrder()}
                            >
                                Reload Latest
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
