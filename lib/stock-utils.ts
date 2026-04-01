export type StockStatus = 'in_stock' | 'low' | 'out_of_stock' | 'untracked';

export function getStockStatus(
  stock: number | null | undefined,
  lowStockThreshold: number = 5
): StockStatus {
  if (stock === null || stock === undefined) return 'untracked';
  if (stock <= 0) return 'out_of_stock';
  if (stock <= lowStockThreshold) return 'low';
  return 'in_stock';
}

export function isLowStock(
  stock: number | null | undefined,
  lowStockThreshold: number = 5
): boolean {
  const status = getStockStatus(stock, lowStockThreshold);
  return status === 'low';
}

export function isOutOfStock(stock: number | null | undefined): boolean {
  return getStockStatus(stock) === 'out_of_stock';
}

export function shouldAutoDisable(stock: number | null | undefined): boolean {
  return typeof stock === 'number' && stock <= 0;
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: 'In Stock',
  low: 'Low Stock',
  out_of_stock: 'Out of Stock',
  untracked: 'Untracked',
};

export const STOCK_STATUS_COLORS: Record<StockStatus, string> = {
  in_stock: 'text-emerald-400',
  low: 'text-yellow-400',
  out_of_stock: 'text-red-400',
  untracked: 'text-slate-500',
};
