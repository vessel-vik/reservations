"use client";

import { Package } from 'lucide-react';
import { MenuItemRow } from './MenuItemRow';

interface Props {
  items: any[];
  categories: any[];
  loading: boolean;
  onEdit: (item: any) => void;
  onRefresh: () => void;
}

export function MenuItemsSection({ items, categories, loading, onEdit, onRefresh }: Props) {
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
              <th className="px-4 py-3 flex-1 min-w-[200px]">Product / Category</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-center">Stock</th>
              <th className="px-4 py-3 text-center">Available</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <MenuItemRow
                key={item.$id}
                item={item}
                categories={categories}
                onEdit={onEdit}
                onRefresh={onRefresh}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
