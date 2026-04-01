import { AlertTriangle } from 'lucide-react';

interface Props {
  items: any[];
}

export function LowStockAlertStrip({ items }: Props) {
  if (items.length === 0) return null;

  const outOfStock = items.filter(i => (i.stock ?? 1) <= 0);
  const low = items.filter(i => (i.stock ?? 1) > 0);

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
      <AlertTriangle className="text-yellow-400 w-5 h-5 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-semibold text-yellow-400 mb-1">
          Stock Alert — {items.length} item{items.length !== 1 ? 's' : ''} need attention
        </p>
        <div className="flex flex-wrap gap-2 mt-1">
          {outOfStock.map(i => (
            <span key={i.$id} className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-xs font-medium">
              {i.name} — Out of Stock
            </span>
          ))}
          {low.map(i => (
            <span key={i.$id} className="px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 text-xs font-medium">
              {i.name} — {i.stock} left
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
