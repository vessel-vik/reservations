# Menu & Stock CMS — Sub-project 2 Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Project:** ScanNServe Reservations Admin Panel
**Scope:** Intuitive Product/Stock CMS (Sub-project 2 of 4)

---

## Problem Statement

The admin panel has no dedicated product management UI. Menu items can only be bulk-imported via CSV (Import tab) or managed directly in Appwrite's console. There is no way to add, edit, or delete individual items from the admin panel, no image management, no stock tracking, no modifier/add-on management, and no category management UI. The existing `isAvailable: boolean` field requires manual toggling with no relationship to stock levels.

---

## Goals

1. Replace the Import tab with a unified **Menu & Stock** CMS tab.
2. Enable inline editing of stock, price, and availability directly in the product list.
3. Provide a full item editor drawer for complex fields (images, ingredients, allergens, dietary flags, modifiers).
4. Add numeric stock tracking that auto-decrements on POS orders and auto-disables items when stock hits 0.
5. Build a category management UI (name, icon, display order, active/inactive).
6. Build a modifier/add-on management UI (groups with options and price adjustments).
7. Implement with TDD: all tests written and confirmed failing before implementation.

---

## Required Environment Variables

```
MODIFIER_GROUPS_COLLECTION_ID=   # Appwrite collection for modifier group documents
MENU_IMAGES_BUCKET_ID=           # Appwrite Storage bucket for product images (separate from RECEIPTS_BUCKET_ID)
```

---

## Design Decision: Inline Editing + Drawer (Option A)

The product list is a live, editable table. **Stock counts, prices, and availability** are editable inline — click a field, type, press Enter or blur to auto-save via `PATCH /api/menu/items/[id]`. Clicking **✏ Edit** or **+ Add Item** opens a slide-in drawer for complex fields. This replicates the Minimart Sanity SDK inline-editing pattern on the Appwrite backend.

### Admin Tab Structure (after both sub-projects)

| Tab | Key |
|-----|-----|
| Dashboard | 1 |
| Sales | 2 |
| Finance | 3 |
| **Menu & Stock** | 4 ← replaces Import |

---

## Component Architecture

### New Directory: `components/admin/menu/`

```
MenuCMS.tsx
  State: activeSection ('items' | 'categories' | 'modifiers')
  Fetches on mount: GET /api/menu/items, GET /api/menu/categories, GET /api/menu/modifiers
  Passes data to all child sections

  LowStockAlertStrip.tsx
    Props: items: MenuItem[]
    Renders: pinned banner listing items where stock ≤ lowStockThreshold
    Hidden when no items are low. "Jump to items" filters table to low-stock rows only.

  MenuSectionNav.tsx
    Props: activeSection, onSectionChange, onAddItem, onImportCSV
    Renders: Items | Categories | Modifiers segmented control + search input + category filter + Add Item + Import CSV buttons
    Emits: onSectionChange(section), onAddItem(), onImportCSV()

  [Items section]
  MenuItemsSection.tsx
    Props: items, categories, loading, onEdit(item), onDelete(id), onRefresh()
    Renders: sortable, searchable table of MenuItemRow components

    MenuItemRow.tsx
      Props: item, categories, onEdit(item), onDelete(id), onFieldSaved()
      Renders: image thumbnail, name+category, inline price, inline stock, availability toggle, VAT badge, Edit/Delete actions

      InlineStockInput.tsx
        Props: itemId, stock, threshold (default 5), onSaved()
        State: editMode, pendingValue, isSaving
        Colour: green (stock > threshold), amber (0 < stock ≤ threshold), red (stock = 0)
        On Enter/blur: PATCH /api/menu/items/[id] { stock }
        If new stock = 0: response also sets isAvailable=false (handled server-side)
        Rejects negative values with inline error
        Reverts to original on Escape or API error

      InlinePriceInput.tsx
        Props: itemId, price, onSaved()
        Same edit pattern as InlineStockInput. Amber colour. Rejects ≤ 0.

      AvailabilityToggle.tsx
        Props: itemId, isAvailable, stock, onSaved()
        Disabled (not clickable) when stock = 0
        Optimistic update — flips immediately, reverts on API error
        On change: PATCH /api/menu/items/[id] { isAvailable }
        Shows error toast on API failure

  MenuItemDrawer.tsx
    Props: open, item (null = create, MenuItem = edit), categories, modifierGroups, onClose, onSaved
    State: formData, isSubmitting, isUploading, stagedImageFile, errors
    Emits: onClose(), onSaved()

    ImageUploadField.tsx
      Props: currentUrl, onFileStaged(file), onUrlSet(url), onRemoved()
      Renders: image thumbnail (if currentUrl), drag-drop zone, URL paste input
      Upload fires on form submit (not immediately on file selection)

    TagInput.tsx
      Props: tags: string[], onChange(tags), placeholder
      Reusable for both ingredients and allergens
      Add: type + Enter. Remove: click ×. No duplicates.

    DietaryFlagPills.tsx
      Props: isVegetarian, isVegan, isGlutenFree, onChange({ isVegetarian, isVegan, isGlutenFree })
      Toggle pills — selected state uses emerald-400, unselected uses slate-700

    ModifierGroupSelector.tsx
      Props: attachedGroupIds: string[], allGroups: ModifierGroup[], onChange(ids)
      Renders: attached groups as removable chips + "Attach modifier group" dropdown

  [Categories section]
  CategoriesSection.tsx
    Props: categories, onRefresh()
    Renders: draggable list of CategoryRow. On drag-end: PATCH /api/menu/categories/[id] { index } for all reordered items.
    "+ Add Category" opens inline blank row.

    CategoryRow.tsx
      Props: category, onDelete(id), onSaved()
      Inline editable: name (text input), icon (emoji picker / text input), isActive toggle
      Auto-saves each field on blur via PATCH /api/menu/categories/[id]

  [Modifiers section]
  ModifiersSection.tsx
    Props: modifierGroups, onRefresh()
    Renders: list of ModifierGroupCard. "+ Add Modifier Group" opens ModifierGroupDrawer.

    ModifierGroupCard.tsx
      Props: group, onEdit(group), onDelete(id)
      Renders: group name, isRequired, maxSelections, item usage count, expandable options list

    ModifierGroupDrawer.tsx
      Props: open, group (null = create, ModifierGroup = edit), onClose, onSaved
      Fields: name, isRequired (toggle), maxSelections (number), options list
      Each option: name (string) + priceAdjustment (number ≥ 0), default flag (radio for required groups)
      Serialises options as "name:priceAdjustment" strings for Appwrite storage
```

### Modified Files

- `app/admin/page.tsx` — replace Import tab (4) with Menu & Stock tab; keyboard shortcut 4 now opens MenuCMS
- `lib/actions/pos.actions.ts` — `createOrder()` decrements stock for each cart item after order is saved
- `lib/actions/menu.actions.ts` — extend with `createMenuItem`, `updateMenuItem`, `deleteMenuItem`, `getMenuItemById`

---

## API Routes

### `GET /api/menu/items`

Query params: `search` (string), `category` (categoryId), `status` (all | low | out), `limit` (default 200).

**Success (200):**
```json
{
  "items": [{ "$id", "name", "price", "stock", "lowStockThreshold", "isAvailable", "category", "imageUrl", "vatCategory", "modifierGroupIds", ... }],
  "total": 42
}
```

**Error:** `500 { "error": "Failed to fetch items" }`

---

### `POST /api/menu/items`

Body: full item object (name, price, stock, category, vatCategory, description, preparationTime, lowStockThreshold, isVegetarian, isVegan, isGlutenFree, ingredients, allergens, modifierGroupIds, imageUrl).

**Success (201):** `{ "item": MenuItem }`

**Error responses:**
- `400 { "error": "name is required" }`
- `400 { "error": "price must be greater than 0" }`
- `400 { "error": "stock must be 0 or greater" }`
- `400 { "error": "category is required" }`
- `500 { "error": "Failed to create item" }`

---

### `GET /api/menu/items/[id]`

**Success (200):** `{ "item": MenuItem }`
**Error:** `404 { "error": "Item not found" }` | `500 { "error": "Failed to fetch item" }`

---

### `PATCH /api/menu/items/[id]`

Partial update — only the fields provided in the body are updated. Accepts any subset of item fields.

**Special rule:** if `stock` is patched to `0`, the route also sets `isAvailable: false` in the same Appwrite update call.

**Success (200):** `{ "item": MenuItem }` (full updated document)

**Error responses:**
- `400 { "error": "stock cannot be negative" }`
- `400 { "error": "price must be greater than 0" }`
- `404 { "error": "Item not found" }`
- `500 { "error": "Failed to update item" }`

---

### `DELETE /api/menu/items/[id]`

**Success (200):** `{ "success": true }`
**Error:** `404 { "error": "Item not found" }` | `500 { "error": "Failed to delete item" }`

---

### `POST /api/menu/items/[id]/image`

Accepts `multipart/form-data` with a `file` field. Uploads to `MENU_IMAGES_BUCKET_ID`. Returns image URL. Then the client calls `PATCH /api/menu/items/[id] { imageUrl }` separately.

**Success (200):** `{ "imageUrl": "https://..." }`

**Error responses:**
- `400 { "error": "No file provided" }`
- `400 { "error": "File too large. Maximum 10 MB" }`
- `400 { "error": "Unsupported file type. Accepted: JPEG, PNG, WebP" }`
- `500 { "error": "Upload failed", "details": "..." }`

---

### `GET /api/menu/categories`

**Success (200):** `{ "categories": Category[] }` sorted by `index` ascending.

---

### `POST /api/menu/categories`

Body: `{ name, label, slug, icon, index, isActive }`.

**Success (201):** `{ "category": Category }`

**Error responses:**
- `400 { "error": "name is required" }`
- `400 { "error": "slug is required and must be unique" }`
- `500 { "error": "Failed to create category" }`

---

### `PATCH /api/menu/categories/[id]`

Partial update. Used for: inline name/icon edit, isActive toggle, drag-reorder (index).

**Success (200):** `{ "category": Category }`
**Error:** `404 { "error": "Category not found" }` | `500 { "error": "Failed to update category" }`

---

### `DELETE /api/menu/categories/[id]`

Blocked if category has items — returns `409` instead of deleting.

**Success (200):** `{ "success": true }`

**Error responses:**
- `409 { "error": "Cannot delete category with active items. Reassign or delete items first." }`
- `404 { "error": "Category not found" }`
- `500 { "error": "Failed to delete category" }`

---

### `GET /api/menu/modifiers`

**Success (200):** `{ "groups": ModifierGroup[] }`

---

### `POST /api/menu/modifiers`

Body: `{ name, isRequired, maxSelections, options: string[] }` where each option is `"name:priceAdjustment"` (e.g. `"Extra Chilli:100"`, `"Peri-Peri:0"`).

**Success (201):** `{ "group": ModifierGroup }`

**Error responses:**
- `400 { "error": "name is required" }`
- `400 { "error": "options must have at least one entry" }`
- `400 { "error": "invalid option format — expected 'name:price'" }`
- `500 { "error": "Failed to create modifier group" }`

---

### `PATCH /api/menu/modifiers/[id]`

**Success (200):** `{ "group": ModifierGroup }`
**Error:** `404 { "error": "Modifier group not found" }` | `500 { "error": "Failed to update modifier group" }`

---

### `DELETE /api/menu/modifiers/[id]`

**Success (200):** `{ "success": true }`
**Error:** `404 { "error": "Modifier group not found" }` | `500 { "error": "Failed to delete modifier group" }`

---

## Appwrite Schema Changes

### `MENU_ITEMS_COLLECTION_ID` — new fields only

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `stock` | integer | yes | 0 | must be ≥ 0 |
| `lowStockThreshold` | integer | no | 5 | alert fires when stock ≤ this value |
| `modifierGroupIds` | string[] | no | [] | references to MODIFIER_GROUPS documents |

All other fields (`name`, `price`, `imageUrl`, `isAvailable`, `category`, `vatCategory`, `isVegetarian`, `isVegan`, `isGlutenFree`, `ingredients`, `allergens`, `preparationTime`, `calories`, `popularity`, `description`) already exist.

### `MODIFIER_GROUPS_COLLECTION_ID` — new collection

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `name` | string | yes | — | e.g. "Sauce Choice" |
| `isRequired` | boolean | yes | false | customer must pick if true |
| `maxSelections` | integer | yes | 1 | max options selectable |
| `options` | string[] | yes | — | serialised as `"name:priceAdjustment"` |
| `createdAt` | string (ISO) | yes | — | |

**Option serialisation:** `"Peri-Peri Sauce:0"`, `"Extra Chilli:100"`. Parser: `option.split(':')` → `[name, Number(price)]`. Names may not contain colons.

### `CATEGORIES_COLLECTION_ID` — no schema changes

All needed fields (`name`, `label`, `slug`, `icon`, `index`, `isActive`) already exist.

---

## New Library: `lib/stock-utils.ts`

Pure functions, no side effects. Used by `InlineStockInput`, `LowStockAlertStrip`, and tests.

```typescript
type StockStatus = 'healthy' | 'low' | 'out'

function getStockStatus(stock: number, threshold?: number): StockStatus
// threshold defaults to 5
// stock > threshold → 'healthy'
// 0 < stock ≤ threshold → 'low'
// stock = 0 → 'out'

function isLowStock(stock: number, threshold?: number): boolean
// true only when 0 < stock ≤ threshold (not when out)

function isOutOfStock(stock: number): boolean
// true when stock = 0
```

---

## Item Editor Drawer — Validation (Zod)

| Field | Rule |
|-------|------|
| `name` | required, min 2 chars, max 200 chars |
| `category` | required, must be a valid category ID |
| `price` | required, number > 0 |
| `stock` | required, integer ≥ 0 |
| `lowStockThreshold` | optional, integer ≥ 1, default 5 |
| `vatCategory` | required, one of: standard / zero-rated / exempt |
| `preparationTime` | optional, integer ≥ 0 |
| `description` | optional, max 1000 chars |
| `ingredients` | optional, string[] |
| `allergens` | optional, string[] |
| `modifierGroupIds` | optional, string[] |
| `imageUrl` | optional, set after upload or URL paste |

### Submit Flow

1. Zod validation — show inline errors, abort if failing.
2. If `stagedImageFile` present: `POST /api/menu/items/[id]/image` → receive `imageUrl`. If upload fails: toast error, keep drawer open, abort.
3. `POST /api/menu/items` (create) or `PATCH /api/menu/items/[id]` (edit) with full payload.
4. On `200/201`: toast "Item saved" → `onSaved()` → `onClose()` → parent refetches list.
5. On `4xx/5xx`: toast error → keep drawer open.

---

## Stock Auto-Decrement — `pos.actions.ts` Change

After `createOrder()` successfully saves the order document, it fires a `Promise.allSettled` of PATCH calls — one per unique item in the cart:

```
PATCH /api/menu/items/[itemId] { stock: currentStock - orderedQuantity }
```

- `Promise.allSettled` is used (not `Promise.all`) — a failed stock update does not roll back the order.
- Stock is not decremented below 0. If `currentStock - quantity < 0`, the value is clamped to 0.
- The server-side PATCH route handles the `isAvailable = false` side-effect when `stock === 0`.
- Failed decrements are logged: `console.error('[Stock decrement failed]', itemId, error)`.

---

## Category Display Order

Drag-and-drop reorder in `CategoriesSection` uses the HTML Drag and Drop API (no external library). On drag-end, the new order is computed and a `PATCH /api/menu/categories/[id] { index: newIndex }` is fired for every category whose index changed. The POS product grid respects this order (already sorts by `index` in `getCategories()`).

---

## Modifier Option Format

Options are stored in Appwrite as a `string[]` with the format `"<name>:<priceAdjustment>"`:

- `"Peri-Peri Sauce:0"` → free option
- `"Extra Chilli:100"` → adds KSh 100 to item price
- Parser: `const [name, price] = opt.split(':'); return { name, priceAdjustment: Number(price) }`
- **Constraint:** option names must not contain the colon character `:`. This is validated in the `ModifierGroupDrawer` form.

---

## TDD Test Plan

All tests written RED before implementation begins.

### `__tests__/menu/stock-utils.test.ts`

```
✗ getStockStatus returns 'healthy' when stock > threshold
✗ getStockStatus returns 'healthy' with custom threshold
✗ getStockStatus returns 'low' when 0 < stock ≤ threshold
✗ getStockStatus returns 'out' when stock = 0
✗ getStockStatus defaults threshold to 5 when not provided
✗ isLowStock returns true when 0 < stock ≤ threshold
✗ isLowStock returns false when stock = 0 (out, not low)
✗ isLowStock returns false when stock > threshold
✗ isOutOfStock returns true only when stock = 0
✗ isOutOfStock returns false when stock > 0
```

### `__tests__/menu/inline-stock-input.test.tsx`

```
✗ renders current stock value
✗ applies green styling when stock is healthy
✗ applies amber styling when stock is low (≤ threshold)
✗ applies red styling when stock = 0
✗ clicking field enters edit mode (shows input element)
✗ pressing Enter triggers PATCH /api/menu/items/[id]
✗ pressing Escape cancels without saving (reverts value)
✗ blur triggers save
✗ rejects negative values — shows inline error, does not save
✗ shows saving spinner while request is in flight
✗ disables input while saving
✗ reverts to original value on API error
```

### `__tests__/menu/availability-toggle.test.tsx`

```
✗ renders in ON state when isAvailable=true
✗ renders in OFF state when isAvailable=false
✗ is not clickable (disabled) when stock = 0
✗ clicking calls PATCH /api/menu/items/[id] with toggled value
✗ optimistically updates before API resolves
✗ reverts to original when API returns error
✗ shows error toast on API failure
```

### `__tests__/menu/menu-item-drawer.test.tsx`

```
✗ shows error when name is empty on submit
✗ shows error when price is 0 on submit
✗ shows error when price is negative on submit
✗ shows error when stock is negative on submit
✗ shows error when category is not selected
✗ pre-fills name, price, stock, category in edit mode
✗ TagInput adds tag on Enter keypress
✗ TagInput removes tag when × is clicked
✗ TagInput rejects duplicate tags
✗ DietaryFlagPills toggle isVegetarian on click
✗ DietaryFlagPills toggle isVegan on click
✗ DietaryFlagPills toggle isGlutenFree on click
✗ disables submit button while saving
✗ shows success toast "Item saved" on 201 response
✗ shows error toast with message on 400 response
✗ shows error toast with message on 500 response
✗ closes drawer on successful save
✗ keeps drawer open on error
✗ shows error toast and keeps open when image upload fails
```

### `__tests__/menu/stock-decrement.test.ts`

```
✗ createOrder decrements stock by ordered quantity for single item
✗ createOrder decrements stock for multiple items independently
✗ createOrder clamps stock to 0 (never negative)
✗ createOrder sets isAvailable=false when stock reaches 0
✗ order document is still created when stock decrement PATCH fails
✗ stock is not decremented when order creation itself fails
```

### `__tests__/menu/api-menu-items.test.ts`

```
✗ GET returns list of items
✗ GET filters by search query (name match)
✗ GET filters by category ID
✗ GET filters by status=low (stock ≤ threshold)
✗ GET filters by status=out (stock = 0)
✗ POST creates item and returns 201
✗ POST returns 400 when name is missing
✗ POST returns 400 when price is 0
✗ POST returns 400 when stock is negative
✗ POST returns 400 when category is missing
✗ PATCH updates stock field
✗ PATCH sets isAvailable=false when stock patched to 0
✗ PATCH returns 400 when stock is patched to negative
✗ PATCH returns 404 for unknown itemId
✗ DELETE returns 200 on success
✗ DELETE returns 404 for unknown itemId
```

### `__tests__/menu/api-menu-modifiers.test.ts`

```
✗ GET returns list of modifier groups
✗ POST creates modifier group and returns 201
✗ POST returns 400 when name is missing
✗ POST returns 400 when options array is empty
✗ POST returns 400 for invalid option format (missing colon)
✗ PATCH updates modifier group name
✗ PATCH returns 404 for unknown groupId
✗ DELETE returns 200 on success
✗ DELETE returns 404 for unknown groupId
```

---

## What Is Not Changing

- Existing `GET /api/menu/import` — unchanged, just moved to a button inside the CMS
- `getMenuItems()` and `getCategories()` server actions — still used by POS page (`app/pos/page.tsx`)
- POS interface (`POSInterface.tsx`) — unchanged in this sub-project (stock visibility is Sub-project 3)
- eTIMS integration — unchanged
- All reservation/booking functionality — unchanged

---

## Implementation Order

1. Write all test files (RED — confirm failures before any implementation)
2. `lib/stock-utils.ts` — pure functions, no dependencies
3. `lib/actions/modifier.actions.ts` + `app/api/menu/modifiers/route.ts` + `app/api/menu/modifiers/[id]/route.ts`
4. `app/api/menu/categories/route.ts` + `app/api/menu/categories/[id]/route.ts`
5. `app/api/menu/items/route.ts` + `app/api/menu/items/[id]/route.ts` + `app/api/menu/items/[id]/image/route.ts`
6. `TagInput.tsx` + `DietaryFlagPills.tsx` + `ImageUploadField.tsx` + `ModifierGroupSelector.tsx` (leaf components)
7. `MenuItemDrawer.tsx` + `ModifierGroupDrawer.tsx`
8. `InlineStockInput.tsx` + `InlinePriceInput.tsx` + `AvailabilityToggle.tsx`
9. `MenuItemRow.tsx` → `MenuItemsSection.tsx`
10. `CategoryRow.tsx` → `CategoriesSection.tsx`
11. `ModifierGroupCard.tsx` → `ModifiersSection.tsx`
12. `LowStockAlertStrip.tsx` + `MenuSectionNav.tsx`
13. `MenuCMS.tsx` (assemble all sections)
14. `lib/actions/pos.actions.ts` — add stock decrement to `createOrder()`
15. `app/admin/page.tsx` — replace Import tab with Menu & Stock tab
16. Run full test suite GREEN verification
