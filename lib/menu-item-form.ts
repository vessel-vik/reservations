/**
 * Shared shape for menu item editor + version snapshots (PATCH body / form state).
 */

export type MenuItemFormSnapshot = {
  name: string;
  description?: string;
  price: number;
  categoryId: string;
  imageUrl?: string | null;
  stock?: number | null;
  lowStockThreshold?: number;
  isVegetarian?: boolean;
  isVegan?: boolean;
  isGlutenFree?: boolean;
  ingredients?: string[];
  allergens?: string[];
  modifierGroupIds?: string[];
  vatCategory?: "standard" | "zero-rated" | "exempt";
  preparationTime?: number;
  calories?: number | null;
};

export function itemDocToFormSnapshot(item: Record<string, unknown> | null | undefined): MenuItemFormSnapshot {
  if (!item) {
    return {
      name: "",
      description: "",
      price: 0,
      categoryId: "",
      imageUrl: null,
      stock: null,
      lowStockThreshold: 5,
      isVegetarian: false,
      isVegan: false,
      isGlutenFree: false,
      ingredients: [],
      allergens: [],
      modifierGroupIds: [],
      vatCategory: "standard",
      preparationTime: 10,
      calories: undefined,
    };
  }

  return {
    name: String(item.name ?? ""),
    description: item.description != null ? String(item.description) : "",
    price: Number(item.price) || 0,
    categoryId: String(item.category ?? ""),
    imageUrl: (item.imageUrl as string | null | undefined) ?? null,
    stock:
      item.stock === undefined || item.stock === null || String(item.stock) === ""
        ? null
        : Number(item.stock),
    lowStockThreshold:
      item.lowStockThreshold === undefined || item.lowStockThreshold === null
        ? 5
        : Number(item.lowStockThreshold),
    isVegetarian: !!item.isVegetarian,
    isVegan: !!item.isVegan,
    isGlutenFree: !!item.isGlutenFree,
    ingredients: Array.isArray(item.ingredients) ? (item.ingredients as string[]) : [],
    allergens: Array.isArray(item.allergens) ? (item.allergens as string[]) : [],
    modifierGroupIds: Array.isArray(item.modifierGroupIds)
      ? (item.modifierGroupIds as string[])
      : [],
    vatCategory: (item.vatCategory as MenuItemFormSnapshot["vatCategory"]) || "standard",
    preparationTime:
      item.preparationTime === undefined || item.preparationTime === null
        ? 10
        : Number(item.preparationTime),
    calories:
      item.calories === undefined || item.calories === null || String(item.calories) === ""
        ? undefined
        : Number(item.calories),
  };
}

/** Normalize a stored JSON snapshot (may use legacy `category` instead of `categoryId`). */
export function snapshotToFormSnapshot(raw: Record<string, unknown>): MenuItemFormSnapshot {
  const categoryId =
    (raw.categoryId as string) ||
    (raw.category as string) ||
    "";
  const { category: _c, ...rest } = raw;
  return itemDocToFormSnapshot({ ...rest, category: categoryId });
}
