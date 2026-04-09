"use client";

import { Package } from 'lucide-react';
import { MenuItemCard } from './MenuItemRow';
import { MenuItemsTable } from './MenuItemsTable';
import type { ItemsViewMode } from './MenuSectionNav';

interface Props {
  items: any[];
  categories: any[];
  loading: boolean;
  onEdit: (item: any) => void;
  onRefresh: () => void;
  viewMode?: ItemsViewMode;
  onAdjustStock?: (item: any) => void;
}

export function MenuItemsSection({
  items,
  categories,
  loading,
  onEdit,
  onRefresh,
  viewMode = 'cards',
  onAdjustStock,
}: Props) {
  if (loading) {
    if (viewMode === 'table') {
      return (
        <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
          {[...Array(8)].map((_, i) => (
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

  if (viewMode === 'table') {
    return (
      <MenuItemsTable
        items={items}
        categories={categories}
        loading={false}
        onEdit={onEdit}
        onAdjustStock={onAdjustStock ?? (() => {})}
        onRefresh={onRefresh}
      />
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
