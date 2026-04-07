import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Product, CartItem } from '@/types/pos.types';

interface POSState {
    cart: CartItem[];
    addToCart: (product: Product, quantity?: number) => void;
    updateQuantity: (id: string, delta: number) => void;
    removeFromCart: (id: string) => void;
    clearCart: () => void;
    setCart: (items: CartItem[]) => void;
    
    // UI State
    isPaymentModalOpen: boolean;
    setPaymentModalOpen: (open: boolean) => void;
}

export const usePOSStore = create<POSState>()(
    persist(
        (set) => ({
            cart: [],
            isPaymentModalOpen: false,

            addToCart: (product, quantity = 1) => set((state) => {
                // Ensure cart is always an array (defensive programming for persisted state)
                const cart = Array.isArray(state.cart) ? state.cart : [];
                const existing = cart.find((item) => item.$id === product.$id);
                const currentQty = existing?.quantity ?? 0;
                const maxQty = product.stock !== undefined ? product.stock : Infinity;
                const addable = Math.min(quantity, maxQty - currentQty);
                if (addable <= 0) return state; // already at stock limit

                if (existing) {
                    return {
                        cart: cart.map((item) =>
                            item.$id === product.$id
                                ? { ...item, quantity: item.quantity + addable }
                                : item
                        ),
                    };
                }
                return { cart: [...cart, { ...product, quantity: addable }] };
            }),

            updateQuantity: (id, delta) => set((state) => {
                // Ensure cart is always an array
                const cart = Array.isArray(state.cart) ? state.cart : [];
                const updated = cart.map((item) => {
                    if (item.$id === id) {
                        if (delta > 0 && item.stock !== undefined && item.quantity >= item.stock) {
                            return item; // at stock limit — don't increment
                        }
                        const newQuantity = item.quantity + delta;
                        return newQuantity > 0 ? { ...item, quantity: newQuantity } : null;
                    }
                    return item;
                }).filter(Boolean) as CartItem[];
                return { cart: updated };
            }),

            removeFromCart: (id) => set((state) => ({
                cart: (Array.isArray(state.cart) ? state.cart : []).filter((item) => item.$id !== id),
            })),

            setCart: (items) => set({ cart: Array.isArray(items) ? items : [] }),

            clearCart: () => set({ cart: [] }),

            setPaymentModalOpen: (open) => set({ isPaymentModalOpen: open }),
        }),
        {
            name: 'pos-cart-storage', // localStorage key
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({ cart: state.cart }), // Only persist cart, not UI state
            // Migration function to ensure cart is always an array
            onRehydrateStorage: () => (state) => {
                if (state && !Array.isArray(state.cart)) {
                    console.warn('POS store: Cart was not an array, resetting to empty array');
                    state.cart = [];
                }
            },
        }
    )
);
