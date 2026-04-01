"use client";

import { useState } from 'react';
import { getStockStatus, STOCK_STATUS_COLORS, STOCK_STATUS_LABELS } from '@/lib/stock-utils';
import { Edit2, Package, ToggleLeft, ToggleRight, Loader2, Image as ImageIcon } from 'lucide-react';

interface Props {
  items: any[];
  categories: any[];
  loading: boolean;
  onEdit: (item: any) => void;
  onAdjustStock: (item: any) => void;
  onRefresh: () => void;
}

export function MenuItemsTable({ items, categories, loading, onEdit, onAdjustStock, onRefresh }: Props) {
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const categoryMap = Object.fromEntries(categories.map(c => [c.$id, c.label || c.name]));

  const handleToggle = async (item: any) => {
    setTogglingId(item.$id);
    try {
      await fetch(`/api/menu/items/${item.$id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !item.isAvailable }),
      });
      onRefresh();
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-700/50 animate-pulse">
            <div className="w-12 h-12 rounded-lg bg-slate-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-700 rounded w-40" />
              <div className="h-3 bg-slate-700 rounded w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-20 text-center bg-slate-800/50 border border-slate-700/50 border-dashed rounded-xl text-slate-500">
        <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium text-slate-400">No menu items found</p>
        <p className="text-sm mt-1">Add your first item or adjust filters</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-400">
          <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-700/50">
            <tr>
              <th className="px-4 py-3 w-16">Image</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-center">Stock</th>
              <th className="px-4 py-3 text-center">Available</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const stockStatus = getStockStatus(item.stock, item.lowStockThreshold ?? 5);
              const statusColor = STOCK_STATUS_COLORS[stockStatus];
              const statusLabel = STOCK_STATUS_LABELS[stockStatus];

              return (
                <tr key={item.$id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-slate-500" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-200">{item.name}</td>
                  <td className="px-4 py-3">{categoryMap[item.category] || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">KSh {item.price?.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onAdjustStock(item)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full hover:opacity-80 transition-opacity
                        ${stockStatus === 'in_stock' ? 'bg-emerald-500/10 text-emerald-400' : ''}
                        ${stockStatus === 'low' ? 'bg-yellow-500/10 text-yellow-400' : ''}
                        ${stockStatus === 'out_of_stock' ? 'bg-red-500/10 text-red-400' : ''}
                        ${stockStatus === 'untracked' ? 'bg-slate-700/50 text-slate-500' : ''}
                      `}
                    >
                      {stockStatus === 'untracked' ? '∞ Untracked' : `${item.stock} — ${statusLabel}`}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={togglingId === item.$id}
                      className="transition-all"
                    >
                      {togglingId === item.$id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                      ) : item.isAvailable ? (
                        <ToggleRight className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-slate-600" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => onEdit(item)} className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 mx-auto">
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
