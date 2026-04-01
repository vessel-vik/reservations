import { describe, it, expect } from 'vitest';
import { getStockStatus, isLowStock, isOutOfStock, shouldAutoDisable } from '../../lib/stock-utils';

describe('getStockStatus', () => {
  it('returns "untracked" when stock is null', () => {
    expect(getStockStatus(null)).toBe('untracked');
  });

  it('returns "untracked" when stock is undefined', () => {
    expect(getStockStatus(undefined)).toBe('untracked');
  });

  it('returns "out_of_stock" when stock is 0', () => {
    expect(getStockStatus(0)).toBe('out_of_stock');
  });

  it('returns "out_of_stock" when stock is negative', () => {
    expect(getStockStatus(-3)).toBe('out_of_stock');
  });

  it('returns "low" when stock equals the threshold (default 5)', () => {
    expect(getStockStatus(5)).toBe('low');
  });

  it('returns "low" when stock is below the threshold', () => {
    expect(getStockStatus(2)).toBe('low');
  });

  it('returns "in_stock" when stock is above the threshold', () => {
    expect(getStockStatus(10)).toBe('in_stock');
  });

  it('respects a custom lowStockThreshold', () => {
    expect(getStockStatus(3, 10)).toBe('low');
    expect(getStockStatus(11, 10)).toBe('in_stock');
  });
});

describe('isLowStock', () => {
  it('returns true when stock is at threshold', () => {
    expect(isLowStock(5)).toBe(true);
  });

  it('returns true when stock is below threshold', () => {
    expect(isLowStock(1)).toBe(true);
  });

  it('returns false when stock is well above threshold', () => {
    expect(isLowStock(20)).toBe(false);
  });

  it('returns false when stock is null (untracked)', () => {
    expect(isLowStock(null)).toBe(false);
  });
});

describe('isOutOfStock', () => {
  it('returns true when stock is 0', () => {
    expect(isOutOfStock(0)).toBe(true);
  });

  it('returns true when stock is negative', () => {
    expect(isOutOfStock(-1)).toBe(true);
  });

  it('returns false when stock is positive', () => {
    expect(isOutOfStock(1)).toBe(false);
  });

  it('returns false when stock is null', () => {
    expect(isOutOfStock(null)).toBe(false);
  });
});

describe('shouldAutoDisable', () => {
  it('returns true when stock is exactly 0', () => {
    expect(shouldAutoDisable(0)).toBe(true);
  });

  it('returns true when stock is negative', () => {
    expect(shouldAutoDisable(-5)).toBe(true);
  });

  it('returns false when stock is positive', () => {
    expect(shouldAutoDisable(3)).toBe(false);
  });

  it('returns false when stock is null (untracked)', () => {
    expect(shouldAutoDisable(null)).toBe(false);
  });
});
