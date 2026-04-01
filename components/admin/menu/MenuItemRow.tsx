"use client";

import { Edit2, Image as ImageIcon, Leaf, WheatOff } from 'lucide-react';
import { InlineStockInput } from './InlineStockInput';
import { InlinePriceInput } from './InlinePriceInput';
import { AvailabilityToggle } from './AvailabilityToggle';
import { getStockStatus } from '@/lib/stock-utils';

interface Props {
  item: any;
  categories: any[];
  onEdit: (item: any) => void;
  onRefresh: () => void;
}

export function MenuItemCard({ item, categories, onEdit, onRefresh }: Props) {
  const categoryLabel = categories.find(c => c.$id === item.category)?.label || 'Uncategorized';
  const stockStatus = getStockStatus(item.stock, item.lowStockThreshold ?? 5);
  const isOut = stockStatus === 'out_of_stock';
  const isLow = stockStatus === 'low';

  const stockBadge = isOut
    ? { label: 'Out of Stock', cls: 'bg-red-500/15 text-red-400 border-red-500/25' }
    : isLow
    ? { label: `Low · ${item.stock}`, cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' }
    : item.stock !== undefined && item.stock !== null
    ? { label: `${item.stock} in stock`, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
    : null;

  return (
    <div className={`group flex flex-col bg-slate-800 rounded-2xl border border-slate-700/50 overflow-hidden hover:border-slate-600 transition-all duration-200 ${isOut ? 'opacity-60' : ''}`}>
      {/* Image */}
      <div className="relative aspect-video bg-slate-700/50 overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-slate-600" />
          </div>
        )}
        {/* Category badge top-left */}
        <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-900/80 text-slate-300 border border-slate-700/50 backdrop-blur-sm">
          {categoryLabel}
        </span>
        {/* Stock badge top-right */}
        {stockBadge && (
          <span className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-sm ${stockBadge.cls}`}>
            {stockBadge.label}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        <div>
          <h3 className="font-semibold text-slate-100 line-clamp-1 text-sm">{item.name}</h3>
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-xs text-slate-500">KSh</span>
            <InlinePriceInput itemId={item.$id} price={item.price} onSaved={onRefresh} />
          </div>
        </div>

        {/* Stock input row */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Stock:</span>
          <InlineStockInput
            itemId={item.$id}
            stock={item.stock ?? 0}
            threshold={item.lowStockThreshold}
            onSaved={onRefresh}
          />
        </div>

        {/* Dietary badges */}
        {(item.isVegetarian || item.isVegan || item.isGlutenFree) && (
          <div className="flex gap-1.5 flex-wrap">
            {item.isVegan && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                <Leaf className="w-2.5 h-2.5" /> Vegan
              </span>
            )}
            {item.isVegetarian && !item.isVegan && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 font-medium">
                <Leaf className="w-2.5 h-2.5" /> Veg
              </span>
            )}
            {item.isGlutenFree && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">
                <WheatOff className="w-2.5 h-2.5" /> GF
              </span>
            )}
          </div>
        )}

        {/* Footer: availability toggle + edit */}
        <div className="flex items-center justify-between pt-1 mt-auto border-t border-slate-700/50">
          <AvailabilityToggle
            itemId={item.$id}
            isAvailable={item.isAvailable}
            stock={item.stock ?? 0}
            onSaved={onRefresh}
          />
          <button
            onClick={() => onEdit(item)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
          >
            <Edit2 className="w-3 h-3" /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}
