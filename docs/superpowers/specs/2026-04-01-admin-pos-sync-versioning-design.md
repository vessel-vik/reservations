# Admin POS Synchronization & Menu Versioning Architecture
**Date:** April 1, 2026  
**Status:** Implemented  
**Version:** 1.0

---

## Executive Summary

This specification defines the architecture for real-time synchronization between the Admin CMS and POS terminal, combined with a comprehensive menu item versioning system. The design ensures:

- **Data Consistency:** Menu changes propagate in real-time to all POS terminals
- **Version Control:** Every published menu item change is snapshotted for audit and rollback
- **Automatic Stock Logic:** Items auto-disable when stock falls below threshold
- **Multi-Tenant Support:** Clerk Organizations enable strict business data isolation

---

## 1. Real-Time POS Synchronization

### 1.1 Architecture Overview

```
Admin CMS (Edit Menu Item)
    ↓
    [Publish Event]
    ↓
Appwrite Real-Time Listener (in POS)
    ↓
    [Create Version Snapshot]
    ↓
POS ProductCard Updates Automatically
```

### 1.2 Implementation Details

**File:** `lib/actions/menu.actions.ts`

```typescript
// When Admin publishes a menu item:
export const publishMenuItem = async (itemId: string, formValues: any, userId: string) => {
    // 1. Update the main menu item document
    const updated = await databases.updateDocument(
        DATABASE_ID,
        MENU_ITEMS_COLLECTION_ID,
        itemId,
        formValues
    );

    // 2. Create a version snapshot
    const version = await databases.createDocument(
        DATABASE_ID,
        MENU_ITEM_VERSIONS_COLLECTION_ID,
        undefined,
        {
            itemId,
            versionNumber: getNextVersionNumber(itemId),
            snapshot: JSON.stringify(formValues),
            timestamp: new Date().toISOString(),
            publishedBy: userId
        }
    );

    // 3. Trigger real-time broadcast
    broadcastMenuUpdate(itemId);

    return { updated, version };
};
```

### 1.3 POS Real-Time Listener

**File:** `components/pos/POSInterface.tsx`

```typescript
useEffect(() => {
    // Subscribe to menu item changes
    const unsubscribe = client.subscribe(
        `databases.${DATABASE_ID}.collections.${MENU_ITEMS_COLLECTION_ID}.documents`,
        (response) => {
            if (response.events.includes("*.documents.*.update")) {
                const updatedItem = response.payload;
                
                // Update local product state with upsert logic
                setProducts((prev) => {
                    const exists = prev.find((p) => p.$id === updatedItem.$id);
                    if (exists) {
                        // Update existing
                        return prev.map((p) =>
                            p.$id === updatedItem.$id ? updatedItem : p
                        );
                    } else {
                        // Add new
                        return [...prev, updatedItem];
                    }
                });
            }
        }
    );

    return () => unsubscribe();
}, []);
```

---

## 2. Automated Stock-Based Availability

### 2.1 Stock Threshold Logic

When an Admin updates a menu item's stock:

```typescript
const AUTO_DISABLE_THRESHOLD = lowStockThreshold || 5; // Default 5 units

const updateStock = async (itemId: string, newStock: number) => {
    const item = await getMenuItem(itemId);
    
    // Auto-disable if below threshold
    const shouldDisable = newStock < AUTO_DISABLE_THRESHOLD;
    
    await databases.updateDocument(
        DATABASE_ID,
        MENU_ITEMS_COLLECTION_ID,
        itemId,
        {
            stock: newStock,
            isAvailable: !shouldDisable || newStock > 0
        }
    );
};
```

### 2.2 POS Visual States

The ProductCard displays three distinct inventory states:

| State          | Condition                        | Visual Indicator              |
| -------------- | -------------------------------- | ----------------------------- |
| **In Stock**   | `isAvailable && stock > threshold` | Subtle "{n} in stock" pill    |
| **Low Stock**  | `!isAvailable && stock > 0`        | Amber "Low Stock" banner      |
| **Out of Stock** | `stock <= 0 || !isAvailable`     | Red "Out of Stock" badge      |

```typescript
// ProductCard.tsx
const getStockDisplay = (item: Product) => {
    if (item.stock === undefined) return null;
    
    if (item.stock <= 0 || !item.isAvailable) {
        return <Badge className="bg-red-500">Out of Stock</Badge>;
    }
    
    if (item.stock < (item.lowStockThreshold || 5) && !item.isAvailable) {
        return <Badge className="bg-amber-500">Low Stock ({item.stock})</Badge>;
    }
    
    return (
        <span className="text-xs text-neutral-400">
            {item.stock} in stock
        </span>
    );
};
```

---

## 3. Menu Item Versioning System

### 3.1 Version Snapshot Collection

Each "Publish" creates an entry in `menu_item_versions`:

```json
{
    "$id": "unique-version-id",
    "itemId": "menu-item-123",
    "versionNumber": 5,
    "snapshot": "{JSON string of entire form state}",
    "timestamp": "2026-04-01T10:30:00Z",
    "publishedBy": "admin@example.com",
    "publisherId": "clerk-user-id"
}
```

### 3.2 Version API Endpoint

**File:** `app/api/menu/items/[id]/versions/route.ts`

```typescript
// GET /api/menu/items/{id}/versions
// Returns all versions for a menu item, ordered by timestamp (newest first)

export async function GET(request, { params: { id } }) {
    const result = await databases.listDocuments(
        DATABASE_ID,
        MENU_ITEM_VERSIONS_COLLECTION_ID,
        [
            Query.equal("itemId", id),
            Query.orderDesc("timestamp"),
            Query.limit(100)
        ]
    );
    
    return NextResponse.json({
        versions: result.documents
    });
}

// POST /api/menu/items/{id}/versions
// Create a new version snapshot when publishing
```

### 3.3 Version History UI

**File:** `components/admin/menu/VersionHistoryPanel.tsx`

Features:
- **List View:** Shows all published versions with timestamps
- **Expand Details:** Click to see field-by-field changes
- **Revert Button:** Click "Revert" to populate the edit form with snapshot
- **Amber Warning:** Displays when reverting to a previous state
- **Re-publish:** New version only created if reverted state is published again

```typescript
const handleRevert = (version: MenuItemVersion) => {
    const snapshot = JSON.parse(version.snapshot);
    form.reset(snapshot); // Populate edit form
    showWarningBanner("Reverting to v" + version.versionNumber);
};
```

---

## 4. Multi-Tenant Architecture

### 4.1 Business Context

The system uses Clerk Organizations for strict data isolation:

```typescript
// Extract business context from Clerk
const { orgId } = auth();
const businessId = orgId; // Clerk's org ID is our business ID

// All queries include businessId filter
const items = await databases.listDocuments(
    DATABASE_ID,
    MENU_ITEMS_COLLECTION_ID,
    [Query.equal("businessId", businessId)]
);
```

### 4.2 Migration Strategy

A dedicated script backfills businessId for all existing documents:

```bash
node migrate-multitenancy.mjs
```

---

## 5. Collection Schema

### Menu Items Collection

```json
{
    "$id": "string",
    "businessId": "string (Clerk orgId)",
    "name": "string",
    "description": "string",
    "price": "number",
    "category": "reference",
    "imageUrl": "string",
    "stock": "number",
    "lowStockThreshold": "number (default: 5)",
    "isAvailable": "boolean",
    "popularity": "number",
    "$createdAt": "datetime",
    "$updatedAt": "datetime"
}
```

### Menu Item Versions Collection

```json
{
    "$id": "string",
    "itemId": "string (reference to menu item)",
    "businessId": "string (for multi-tenancy)",
    "versionNumber": "number (auto-incremented)",
    "snapshot": "string (JSON stringified form values)",
    "timestamp": "datetime",
    "publishedBy": "string (user email or name)",
    "publisherId": "string (Clerk user ID)"
}
```

---

## 6. Reliability & Data Integrity

### 6.1 Concurrency Handling

- **Check-and-Set:** Before publishing, verify no conflict with concurrent edits
- **Version Locking:** Prevents two users from publishing simultaneously

### 6.2 Error Handling

- **Network Failures:** Real-time listener automatically reconnects
- **Sync Delays:** POS gracefully handles temporary data inconsistency
- **Duplicate Versions:** Prevent accidental re-publish of identical state

---

## 7. Performance Optimizations

### 7.1 Caching Strategy

- **Admin CMS:** Cache full menu for 5 minutes, invalidate on publish
- **POS:** Cache products at SSR; real-time updates for changes only

### 7.2 Query Optimization

```typescript
// Efficient: Single query with businessId + isAvailable filters
const items = await databases.listDocuments(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, [
    Query.equal("businessId", businessId),
    Query.equal("isAvailable", true),
    Query.limit(100),
    Query.orderDesc("popularity")
]);
```

---

## 8. Implementation Timeline

| Phase | Task | Status |
| ----- | ---- | ------ |
| 1     | Real-time listener setup | ✅ Done |
| 2     | Version snapshot creation | ✅ Done |
| 3     | Version history UI panel | ✅ Done |
| 4     | Revert functionality | ✅ Done |
| 5     | Auto-disable stock logic | ✅ Done |
| 6     | Multi-tenancy migration | ✅ Done |

---

## 9. Testing Checklist

- [ ] Real-time updates propagate within 500ms
- [ ] Version snapshot accurately captures all fields
- [ ] Revert populates form without validation errors
- [ ] Stock auto-disable triggers at threshold
- [ ] Multi-tenant queries don't leak data
- [ ] Concurrent publishes don't create duplicate versions
