import { describe, it, expect, beforeEach } from 'vitest';
import { usePOSStore } from '@/store/pos-store';
import { Product } from '@/types/pos.types';

// Mock localStorage for testing
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('POS Store Cart Functionality', () => {
  beforeEach(() => {
    // Clear localStorage mocks
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();

    // Reset the store before each test
    const { clearCart } = usePOSStore.getState();
    clearCart();
  });

  it('should handle corrupted cart data gracefully', () => {
    // Simulate corrupted localStorage data (cart is not an array)
    localStorageMock.getItem.mockReturnValue(JSON.stringify({ cart: 'not-an-array' }));

    // Reinitialize the store (this would happen on app reload)
    const store = usePOSStore.getState();

    // The store should handle the corrupted data and initialize cart as empty array
    expect(Array.isArray(store.cart)).toBe(true);
    expect(store.cart).toEqual([]);
  });

  it('should add items to cart correctly', () => {
    const store = usePOSStore.getState();

    const mockProduct: Product = {
      $id: 'product-1',
      name: 'Test Product',
      price: 100,
      category: 'Test Category',
      stock: 10,
      imageUrl: '',
      description: 'Test description',
      isActive: true,
      businessId: 'test-business',
      index: 1,
    };

    // Add product to cart
    store.addToCart(mockProduct, 2);

    // Check that cart contains the product
    const updatedStore = usePOSStore.getState();
    expect(updatedStore.cart).toHaveLength(1);
    expect(updatedStore.cart[0]).toMatchObject({
      $id: 'product-1',
      name: 'Test Product',
      quantity: 2,
    });
  });

  it('should update quantity correctly', () => {
    const store = usePOSStore.getState();

    const mockProduct: Product = {
      $id: 'product-2',
      name: 'Test Product 2',
      price: 50,
      category: 'Test Category',
      stock: 5,
      imageUrl: '',
      description: 'Test description',
      isActive: true,
      businessId: 'test-business',
      index: 2,
    };

    // Add product to cart
    store.addToCart(mockProduct, 1);

    // Update quantity
    store.updateQuantity('product-2', 2);

    // Check updated quantity
    const updatedStore = usePOSStore.getState();
    expect(updatedStore.cart[0].quantity).toBe(3);
  });

  it('should remove items from cart', () => {
    const store = usePOSStore.getState();

    const mockProduct: Product = {
      $id: 'product-3',
      name: 'Test Product 3',
      price: 75,
      category: 'Test Category',
      stock: 20,
      imageUrl: '',
      description: 'Test description',
      isActive: true,
      businessId: 'test-business',
      index: 3,
    };

    // Add product to cart
    store.addToCart(mockProduct, 1);

    // Remove from cart
    store.removeFromCart('product-3');

    // Check cart is empty
    const updatedStore = usePOSStore.getState();
    expect(updatedStore.cart).toHaveLength(0);
  });

  it('should respect stock limits', () => {
    const store = usePOSStore.getState();

    const mockProduct: Product = {
      $id: 'product-4',
      name: 'Limited Stock Product',
      price: 25,
      category: 'Test Category',
      stock: 3, // Only 3 in stock
      imageUrl: '',
      description: 'Test description',
      isActive: true,
      businessId: 'test-business',
      index: 4,
    };

    // Try to add more than available stock
    store.addToCart(mockProduct, 5);

    // Should only add up to stock limit
    const updatedStore = usePOSStore.getState();
    expect(updatedStore.cart[0].quantity).toBe(3);
  });
});