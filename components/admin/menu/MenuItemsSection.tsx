"use client";

import { Package } from 'lucide-react';
import { MenuItemCard } from './MenuItemRow';

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/50 animate-pulse">
            <div className="aspect-video bg-slate-700" />
            <div className="p-4 space-y-3">
              <div className="h-4 bg-slate-700 rounded w-3/4" />
              <div className="h-3 bg-slate-700 rounded w-1/2" />
              <div className="h-8 bg-slate-700 rounded" />
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((item) => (
        <MenuItemCard
          key={item.$id}
          item={item}
          categories={categories}
          onEdit={onEdit}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}
