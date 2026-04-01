"use server";

import { databases, DATABASE_ID, MENU_ITEMS_COLLECTION_ID, CATEGORIES_COLLECTION_ID } from "@/lib/appwrite.config";
import { Query, ID } from "node-appwrite";
import { parseStringify } from "@/lib/utils";

// ─── Menu Items ────────────────────────────────────────────────────────────────

export async function getMenuItems(options?: {
  categoryId?: string;
  search?: string;
  isAvailable?: boolean;
  limit?: number;
  offset?: number;
}) {
  try {
    const queries: any[] = [Query.orderAsc('name'), Query.limit(options?.limit || 500)];

    if (options?.categoryId) {
      queries.push(Query.equal('category', options.categoryId));
    }
    if (options?.isAvailable !== undefined) {
      queries.push(Query.equal('isAvailable', options.isAvailable));
    }
    if (options?.offset) {
      queries.push(Query.offset(options.offset));
    }

    const result = await databases.listDocuments(DATABASE_ID!, MENU_ITEMS_COLLECTION_ID!, queries);
    return { success: true, items: result.documents };
  } catch (error: any) {
    return { success: false, error: error.message, items: [] };
  }
}

export async function createMenuItem(data: {
  name: string;
  description?: string;
  price: number;
  categoryId: string;
  imageUrl?: string | null;
  isAvailable?: boolean;
  stock?: number | null;
  lowStockThreshold?: number;
  isVegetarian?: boolean;
  isVegan?: boolean;
  isGlutenFree?: boolean;
  ingredients?: string[];
  allergens?: string[];
  modifierGroupIds?: string[];
  calories?: number;
  preparationTime?: number;
  vatCategory?: string;
}) {
  try {
    const doc: any = {
      name: data.name,
      description: data.description || '',
      price: Number(data.price) || 0,
      category: data.categoryId,
      imageUrl: data.imageUrl || null,
      isAvailable: data.isAvailable ?? true,
      stock: (data.stock === undefined || data.stock === null || String(data.stock) === '') ? null : Number(data.stock),
      lowStockThreshold: (data.lowStockThreshold === undefined || data.lowStockThreshold === null || String(data.lowStockThreshold) === '') ? 5 : Number(data.lowStockThreshold),
      isVegetarian: !!data.isVegetarian,
      isVegan: !!data.isVegan,
      isGlutenFree: !!data.isGlutenFree,
      ingredients: data.ingredients ?? [],
      allergens: data.allergens ?? [],
      calories: (data.calories === undefined || data.calories === null || String(data.calories) === '') ? null : Number(data.calories),
      preparationTime: (data.preparationTime === undefined || data.preparationTime === null || String(data.preparationTime) === '') ? 10 : Number(data.preparationTime),
      popularity: 0,
      vatCategory: data.vatCategory || 'standard',
      isActive: true,
      modifierGroupIds: data.modifierGroupIds || [],
    };

    const result = await databases.createDocument(
      DATABASE_ID!,
      MENU_ITEMS_COLLECTION_ID!,
      ID.unique(),
      doc
    );

    return { success: true, item: parseStringify(result) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateMenuItem(
  itemId: string,
  data: Partial<{
    name: string;
    description: string;
    price: number;
    categoryId: string;
    imageUrl: string | null;
    isAvailable: boolean;
    stock: number | null;
    lowStockThreshold: number;
    isVegetarian: boolean;
    isVegan: boolean;
    isGlutenFree: boolean;
    ingredients: string[];
    allergens: string[];
    modifierGroupIds: string[];
    calories: number;
    preparationTime: number;
    vatCategory: string;
  }>
) {
  try {
    const updateData: any = { ...data };
    
    // Convert numerical fields correctly to avoid Appwrite type errors
    if (updateData.price !== undefined) updateData.price = Number(updateData.price);
    if (updateData.stock !== undefined) updateData.stock = (updateData.stock === null || String(updateData.stock) === '') ? null : Number(updateData.stock);
    if (updateData.lowStockThreshold !== undefined) updateData.lowStockThreshold = (updateData.lowStockThreshold === null || String(updateData.lowStockThreshold) === '') ? 5 : Number(updateData.lowStockThreshold);
    if (updateData.calories !== undefined) updateData.calories = (updateData.calories === null || String(updateData.calories) === '') ? null : Number(updateData.calories);
    if (updateData.preparationTime !== undefined) updateData.preparationTime = (updateData.preparationTime === null || String(updateData.preparationTime) === '') ? 10 : Number(updateData.preparationTime);

    if (data.categoryId !== undefined) {
      updateData.category = data.categoryId;
      delete updateData.categoryId;
    }

    const result = await databases.updateDocument(
      DATABASE_ID!,
      MENU_ITEMS_COLLECTION_ID!,
      itemId,
      updateData
    );
    return { success: true, item: parseStringify(result) };
  } catch (error: any) {
    if (error?.code === 404 || error?.message?.includes('not found')) {
      return { success: false, error: 'Document not found' };
    }
    return { success: false, error: error.message };
  }
}

export async function deleteMenuItem(itemId: string) {
  try {
    await databases.deleteDocument(DATABASE_ID!, MENU_ITEMS_COLLECTION_ID!, itemId);
    return { success: true };
  } catch (error: any) {
    if (error?.code === 404) return { success: false, error: 'Document not found' };
    return { success: false, error: error.message };
  }
}

// ─── Categories ────────────────────────────────────────────────────────────────

export async function getCategories() {
  try {
    const result = await databases.listDocuments(DATABASE_ID!, CATEGORIES_COLLECTION_ID!, [
      Query.orderAsc('index'),
      Query.limit(50),
    ]);
    return { success: true, categories: result.documents };
  } catch (error: any) {
    return { success: false, error: error.message, categories: [] };
  }
}

export async function createCategory(data: { name: string; label: string; slug: string; index: number; icon?: string }) {
  try {
    const result = await databases.createDocument(
      DATABASE_ID!,
      CATEGORIES_COLLECTION_ID!,
      ID.unique(),
      { ...data, isActive: true }
    );
    return { success: true, category: parseStringify(result) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateCategory(categoryId: string, data: Partial<{ name: string; label: string; index: number; icon: string; isActive: boolean }>) {
  try {
    await databases.updateDocument(DATABASE_ID!, CATEGORIES_COLLECTION_ID!, categoryId, data);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteCategory(categoryId: string) {
  try {
    const items = await databases.listDocuments(DATABASE_ID!, MENU_ITEMS_COLLECTION_ID!, [
      Query.equal('category', categoryId),
      Query.limit(1),
    ]);
    if (items.total > 0) {
      return { success: false, error: 'Cannot delete category with active items' };
    }
    await databases.deleteDocument(DATABASE_ID!, CATEGORIES_COLLECTION_ID!, categoryId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Stock Decrement (called after order) ─────────────────────────────────────

export async function decrementItemStocks(cartItems: { itemId: string; quantity: number }[]) {
  const results = await Promise.allSettled(
    cartItems.map(async ({ itemId, quantity }) => {
      const doc: any = await databases.getDocument(DATABASE_ID!, MENU_ITEMS_COLLECTION_ID!, itemId);
      if (doc.stock === null || doc.stock === undefined) return; // untracked

      const newStock = Math.max(0, doc.stock - quantity);
      await databases.updateDocument(DATABASE_ID!, MENU_ITEMS_COLLECTION_ID!, itemId, {
        stock: newStock,
        isAvailable: newStock > 0,
      });
    })
  );

  const failures = results.filter((r) => r.status === 'rejected');
  return { success: failures.length === 0, failureCount: failures.length };
}