import { resolveAppwriteFileViewUrl } from "@/lib/appwrite-storage-url";
import type { Product } from "@/types/pos.types";

/**
 * Map an Appwrite menu_items document to the POS Product shape (matches app/pos/page.tsx).
 */
export function menuDocumentToProduct(doc: Record<string, unknown>): Product {
    return {
        $id: String(doc.$id ?? ""),
        name: String(doc.name ?? ""),
        description: String(doc.description ?? ""),
        price: Number(doc.price) || 0,
        category: (typeof doc.category === "string" ? doc.category : doc.category) as Product["category"],
        imageUrl: resolveAppwriteFileViewUrl(doc.imageUrl as string | null | undefined),
        isAvailable: doc.isAvailable !== false,
        preparationTime: Number(doc.preparationTime) || 10,
        popularity: Number(doc.popularity) || 0,
        ingredients: Array.isArray(doc.ingredients) ? (doc.ingredients as string[]) : [],
        allergens: Array.isArray(doc.allergens) ? (doc.allergens as string[]) : [],
        calories:
            doc.calories === undefined || doc.calories === null || String(doc.calories) === ""
                ? undefined
                : Number(doc.calories),
        isVegetarian: !!doc.isVegetarian,
        isVegan: !!doc.isVegan,
        isGlutenFree: !!doc.isGlutenFree,
        stock:
            doc.stock === undefined || doc.stock === null || String(doc.stock) === ""
                ? undefined
                : Number(doc.stock),
        lowStockThreshold:
            doc.lowStockThreshold === undefined || doc.lowStockThreshold === null
                ? undefined
                : Number(doc.lowStockThreshold),
        vatCategory: doc.vatCategory as Product["vatCategory"],
    };
}

/**
 * Same visibility rule as pos.actions getMenuItems: tenant match + not explicitly unavailable.
 */
export function menuItemVisibleOnPos(doc: Record<string, unknown>, orgId: string | null | undefined): boolean {
    if (doc.isAvailable === false) return false;
    const bid = doc.businessId;
    if (orgId && bid != null && String(bid) !== "" && String(bid) !== orgId) {
        return false;
    }
    return true;
}

/** Detect Appwrite Realtime event types (payload uses concrete IDs, never literal "*"). */
export function parseMenuRealtimeEvents(events: string[]): {
    isCreate: boolean;
    isUpdate: boolean;
    isDelete: boolean;
} {
    const list = Array.isArray(events) ? events : [];
    const isCreate = list.some((e) => typeof e === "string" && e.endsWith(".create"));
    const isUpdate = list.some((e) => typeof e === "string" && e.endsWith(".update"));
    const isDelete = list.some((e) => typeof e === "string" && e.endsWith(".delete"));
    return { isCreate, isUpdate, isDelete };
}
