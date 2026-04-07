#!/usr/bin/env node

/**
 * Cart Data Recovery Script
 *
 * This script helps recover from corrupted POS cart data in localStorage.
 * Run this if you encounter "state.cart.find is not a function" errors.
 */

const CART_STORAGE_KEY = 'pos-cart-storage';

try {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem(CART_STORAGE_KEY);

    if (stored) {
      const parsed = JSON.parse(stored);

      // Check if cart exists and is an array
      if (parsed.state && !Array.isArray(parsed.state.cart)) {
        console.log('🔧 Found corrupted cart data. Resetting to empty array...');

        // Reset cart to empty array
        const fixed = {
          ...parsed,
          state: {
            ...parsed.state,
            cart: []
          }
        };

        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(fixed));
        console.log('✅ Cart data has been reset. Please refresh the page.');
      } else {
        console.log('✅ Cart data appears to be valid.');
      }
    } else {
      console.log('ℹ️  No cart data found in localStorage.');
    }
  } else {
    console.log('ℹ️  This script should be run in a browser environment.');
  }
} catch (error) {
  console.error('❌ Error during cart data recovery:', error);
  console.log('🔄 Attempting to clear corrupted data...');

  // If parsing fails, clear the data entirely
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem(CART_STORAGE_KEY);
    console.log('✅ Corrupted cart data cleared. Cart will reset on next page load.');
  }
}