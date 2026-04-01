"use client";

import { Edit2, Trash2, Image as ImageIcon } from 'lucide-react';
import { InlineStockInput } from './InlineStockInput';
import { InlinePriceInput } from './InlinePriceInput';
import { AvailabilityToggle } from './AvailabilityToggle';

interface Props {
  item: any;
  categories: any[];
  onEdit: (item: any) => void;
  onRefresh: () => void;
}

export function MenuItemRow({ item, categories, onEdit, onRefresh }: Props) {
  const categoryLabel = categories.find(c => c.$id === item.category)?.label || 'Unknown';

  return (
    <tr className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
      <td className="px-4 py-3">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-slate-500" />
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-200">{item.name}</p>
        <p className="text-xs text-slate-500">{categoryLabel}</p>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end">
          <span className="text-xs text-slate-500 mr-1">KSh</span>
          <InlinePriceInput itemId={item.$id} price={item.price} onSaved={onRefresh} />
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <InlineStockInput itemId={item.$id} stock={item.stock ?? 0} threshold={item.lowStockThreshold} onSaved={onRefresh} />
      </td>
      <td className="px-4 py-3 text-center">
        <AvailabilityToggle itemId={item.$id} isAvailable={item.isAvailable} stock={item.stock ?? 0} onSaved={onRefresh} />
      </td>
      <td className="px-4 py-3 text-center">
        <button onClick={() => onEdit(item)} className="p-1.5 text-blue-400 hover:text-blue-300 transition-colors mx-1">
          <Edit2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
