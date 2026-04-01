"use client";

import { useEffect, useState, useCallback } from "react";
import { getMenuItems, getCategories } from "@/lib/actions/menu.actions";
import { getModifierGroups } from "@/lib/actions/modifier.actions";
import { getStockStatus, STOCK_STATUS_COLORS } from "@/lib/stock-utils";
import { MenuItemDrawer } from "./MenuItemDrawer";
import { StockAdjustmentModal } from "./StockAdjustmentModal";
import { LowStockAlertStrip } from "./LowStockAlertStrip";
import { MenuSectionNav } from "./MenuSectionNav";
import { MenuItemsSection } from "./MenuItemsSection";
import { CategoriesSection } from "./CategoriesSection";
import { ModifiersSection } from "./ModifiersSection";
import { ModifierGroupDrawer } from "./ModifierGroupDrawer";

type MenuSection = 'items' | 'categories' | 'modifiers';

export function MenuCMS() {
  const [activeSection, setActiveSection] = useState<MenuSection>('items');
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | undefined>(undefined);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  
  const [modDrawerOpen, setModDrawerOpen] = useState(false);
  const [selectedModGroup, setSelectedModGroup] = useState<any | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, catRes, modsRes] = await Promise.all([
        getMenuItems({ categoryId: filterCategory }),
        getCategories(),
        getModifierGroups(),
      ]);
      setItems((itemsRes.items as any[]) || []);
      setCategories((catRes.categories as any[]) || []);
      setModifierGroups((modsRes.groups as any[]) || []);
    } catch (e) {
      console.error('MenuCMS fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [filterCategory]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const lowStockItems = items.filter(i => {
    const s = getStockStatus(i.stock, i.lowStockThreshold ?? 5);
    return s === 'low' || s === 'out_of_stock';
  });

  const filteredItems = search
    ? items.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="space-y-6">
      <LowStockAlertStrip items={lowStockItems} />

      <MenuSectionNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        search={search}
        onSearch={setSearch}
        categories={categories}
        filterCategory={filterCategory}
        onFilterCategory={setFilterCategory}
        onAddItem={() => {
          if (activeSection === 'items') {
            setSelectedItem(null);
            setDrawerOpen(true);
          } else if (activeSection === 'modifiers') {
            setSelectedModGroup(null);
            setModDrawerOpen(true);
          }
        }}
      />

      {activeSection === 'items' && (
        <MenuItemsSection
          items={filteredItems}
          categories={categories}
          loading={loading}
          onEdit={(item: any) => { setSelectedItem(item); setDrawerOpen(true); }}
          onRefresh={fetchData}
        />
      )}

      {activeSection === 'categories' && (
        <CategoriesSection
          categories={categories}
          onRefresh={fetchData}
        />
      )}

      {activeSection === 'modifiers' && (
        <ModifiersSection
          modifierGroups={modifierGroups}
          onEdit={(group: any) => { setSelectedModGroup(group); setModDrawerOpen(true); }}
          onRefresh={fetchData}
        />
      )}

      <MenuItemDrawer
        open={drawerOpen}
        item={selectedItem}
        categories={categories}
        modifierGroups={modifierGroups}
        onClose={() => setDrawerOpen(false)}
        onSaved={fetchData}
      />

      <ModifierGroupDrawer
        open={modDrawerOpen}
        group={selectedModGroup}
        onClose={() => setModDrawerOpen(false)}
        onSaved={fetchData}
      />
    </div>
  );
}
