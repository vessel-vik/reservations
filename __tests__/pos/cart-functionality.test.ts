import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePOSStore } from "@/store/pos-store";
import { Product } from "@/types/pos.types";

describe("POS Store Cart Functionality", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    usePOSStore.persist.clearStorage();
    usePOSStore.getState().clearCart();
    await usePOSStore.persist.rehydrate();
  });

  it("should handle corrupted cart data gracefully", async () => {
    localStorage.setItem(
      "pos-cart-storage",
      JSON.stringify({
        state: { cart: "not-an-array" as unknown as [], isPaymentModalOpen: false },
        version: 0,
      }),
    );
    await usePOSStore.persist.rehydrate();

    const store = usePOSStore.getState();
    expect(Array.isArray(store.cart)).toBe(true);
    expect(store.cart).toEqual([]);
  });

  it("should add items to cart correctly", () => {
    const store = usePOSStore.getState();

    const mockProduct: Product = {
      $id: "product-1",
      name: "Test Product",
      price: 100,
      category: "Test Category",
      stock: 10,
      imageUrl: "",
      description: "Test description",
      isActive: true,
      businessId: "test-business",
      index: 1,
    };

    store.addToCart(mockProduct, 2);

    const updatedStore = usePOSStore.getState();
    expect(updatedStore.cart).toHaveLength(1);
    expect(updatedStore.cart[0]).toMatchObject({
      $id: "product-1",
      name: "Test Product",
      quantity: 2,
    });
  });

  it("should update quantity correctly", () => {
    const store = usePOSStore.getState();

    const mockProduct: Product = {
      $id: "product-2",
      name: "Test Product 2",
      price: 50,
      category: "Test Category",
      stock: 5,
      imageUrl: "",
      description: "Test description",
      isActive: true,
      businessId: "test-business",
      index: 2,
    };

    store.addToCart(mockProduct, 1);
    store.updateQuantity("product-2", 2);

    const updatedStore = usePOSStore.getState();
    expect(updatedStore.cart[0].quantity).toBe(3);
  });

  it("should remove items from cart", () => {
    const store = usePOSStore.getState();

    const mockProduct: Product = {
      $id: "product-3",
      name: "Test Product 3",
      price: 75,
      category: "Test Category",
      stock: 20,
      imageUrl: "",
      description: "Test description",
      isActive: true,
      businessId: "test-business",
      index: 3,
    };

    store.addToCart(mockProduct, 1);
    store.removeFromCart("product-3");

    const updatedStore = usePOSStore.getState();
    expect(updatedStore.cart).toHaveLength(0);
  });

  it("should respect stock limits", () => {
    const store = usePOSStore.getState();

    const mockProduct: Product = {
      $id: "product-4",
      name: "Limited Stock Product",
      price: 25,
      category: "Test Category",
      stock: 3,
      imageUrl: "",
      description: "Test description",
      isActive: true,
      businessId: "test-business",
      index: 4,
    };

    store.addToCart(mockProduct, 5);

    const updatedStore = usePOSStore.getState();
    expect(updatedStore.cart[0].quantity).toBe(3);
  });
});
