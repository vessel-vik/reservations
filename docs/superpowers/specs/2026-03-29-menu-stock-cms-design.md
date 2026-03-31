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

## TypeScript Types Required

The following new types must be added to `types/pos.types.ts` before any component in `components/admin/menu/` will compile. The existing `Product` type is **not** extended — `MenuItem` is a separate admin-layer type that includes CMS-only fields.

```typescript
// types/pos.types.ts — add alongside existing types

export interface MenuItem {
  $id: string
  name: string
  price: number
  stock: number
  lowStockThreshold: number  // default 5
  isAvailable: boolean
  category: string           // category $id
  imageUrl?: string
  vatCategory: 'standard' | 'zero-rated' | 'exempt'
  description?: string
  preparationTime?: number   // minutes; 0 if not set
  isVegetarian: boolean
  isVegan: boolean
  isGlutenFree: boolean
  ingredients: string[]
  allergens: string[]
  modifierGroupIds: string[]
  $createdAt: string
  $updatedAt: string
}

export interface ModifierGroup {
  $id: string
  name: string
  isRequired: boolean
  maxSelections: number
  defaultOptionIndex: number  // -1 = no default; index into options array (required groups only)
  options: string[]           // serialised as "name:priceAdjustment"
  createdAt: string
}
```

**Note on `isActive` vs `isAvailable` (confirmed discrepancy):** `pos.actions.ts:48` queries `Query.equal("isActive", true)` on `MENU_ITEMS_COLLECTION_ID`, but the `Product` TypeScript interface (line 24) uses `isAvailable`. Note that `isActive` is the correct field name for `Category` documents (line 224). The MENU_ITEMS Appwrite attribute name must be verified at implementation time:
- If the Appwrite attribute is `isActive` → the `Product` type has a wrong field name; rename to `isActive` (or alias both)
- If the Appwrite attribute is `isAvailable` → `pos.actions.ts:48` query is wrong and returns all items without filtering

Step 14 (stock decrement) must resolve this before writing the PATCH call that sets availability. Do not proceed with `PATCH { isAvailable }` without confirming the correct Appwrite attribute name.

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
  State: activeSection ('items' | 'categories' | 'modifiers'), searchTerm (string), selectedCategoryId (string | null), filterToLowStock (boolean), items (MenuItem[]), categories (Category[]), modifierGroups (ModifierGroup[]), loading (boolean), error (string | null)
  Fetches on mount: GET /api/menu/items, GET /api/menu/categories, GET /api/menu/modifiers
  Passes data to all child sections

  LowStockAlertStrip.tsx
    Props: items: MenuItem[], onFilterToLowStock: () => void
    Renders: pinned banner listing items where stock ≤ lowStockThreshold
    Hidden when no items are low.
    "Jump to items" calls onFilterToLowStock() — MenuCMS sets activeSection='items' and filterToLowStock=true, which MenuItemsSection uses to filter rows to stock ≤ lowStockThreshold

  MenuSectionNav.tsx
    Props: activeSection, searchTerm, selectedCategoryId, onSectionChange, onSearchChange, onCategoryFilterChange, onAddItem, onImportCSV
    Renders: Items | Categories | Modifiers segmented control + search input + category filter + Add Item + Import CSV buttons
    Emits: onSectionChange(section), onSearchChange(term), onCategoryFilterChange(id | null), onAddItem(), onImportCSV()
    Note: search and category filter are controlled — state lives in MenuCMS and is passed down

  [Items section]
  MenuItemsSection.tsx
    Props: items, categories, loading, searchTerm, selectedCategoryId, filterToLowStock, onEdit(item), onDelete(id), onRefresh()
    Note: items passed in are the full unfiltered list from MenuCMS; component applies searchTerm/category/filterToLowStock client-side
    Renders: sortable, filtered table of MenuItemRow components

    MenuItemRow.tsx
      Props: item, categories, onEdit(item), onDelete(id), onFieldSaved()
      Note: onFieldSaved() calls onRefresh() on the parent — MenuItemRow fires onFieldSaved() after any inline PATCH succeeds, which propagates to MenuCMS.refresh() to reload the full items list (ensures isAvailable state stays in sync after stock→0 side effect)
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
      URL paste flow: onUrlSet(url) sets formData.imageUrl directly in MenuItemDrawer (no upload needed). stagedImageFile remains null. On submit, step 2 is skipped and the pasted URL is included in the POST/PATCH body directly.

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
      Each option: name (string) + priceAdjustment (number ≥ 0)
      Default flag: radio button shown only when isRequired=true; selecting it sets defaultOptionIndex to that option's array index. When isRequired=false the default flag row is hidden and defaultOptionIndex is saved as -1.
      Colon constraint: form validates option names for `:` character — shows inline error "Option name may not contain a colon" if detected, blocks submit.
      Serialises options as "name:priceAdjustment" strings for Appwrite storage
```

### Modified Files

- `app/admin/page.tsx` — replace Import tab (4) with Menu & Stock tab; keyboard shortcut 4 now opens MenuCMS
- `lib/actions/pos.actions.ts` — `createOrder()` decrements stock for each cart item after order is saved; audit `isActive` vs `isAvailable` query
- `lib/actions/menu.actions.ts` — extend with `createMenuItem`, `updateMenuItem`, `deleteMenuItem`, `getMenuItemById` (these call Appwrite directly, same pattern as existing actions)
- `lib/actions/modifier.actions.ts` — **new file** with `createModifierGroup`, `updateModifierGroup`, `deleteModifierGroup`, `getModifierGroups`, `getModifierGroupById`
- `types/pos.types.ts` — add `MenuItem` and `ModifierGroup` interfaces (see TypeScript Types section above)

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
**Error:** `500 { "error": "Failed to fetch categories" }`

---

### `POST /api/menu/categories`

Body: `{ name, label, slug, icon, index, isActive }`.

Route queries for existing slug before creating. Returns 409 on duplicate.

**Success (201):** `{ "category": Category }`

**Error responses:**
- `400 { "error": "name is required" }`
- `400 { "error": "slug is required" }`
- `409 { "error": "A category with this slug already exists" }`
- `500 { "error": "Failed to create category" }`

---

### `PATCH /api/menu/categories/[id]`

Partial update. Used for: inline name/icon edit, isActive toggle, drag-reorder (index).

**Success (200):** `{ "category": Category }`

**Error responses:**
- `400 { "error": "name cannot be empty" }` — if `name` field is present and blank
- `400 { "error": "index must be a non-negative integer" }` — if `index` field is present and invalid
- `404 { "error": "Category not found" }`
- `500 { "error": "Failed to update category" }`

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
**Error:** `500 { "error": "Failed to fetch modifier groups" }`

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

**Error responses:**
- `400 { "error": "name cannot be empty" }` — if `name` field is present and blank
- `400 { "error": "options must have at least one entry" }` — if `options` field is present and empty
- `400 { "error": "invalid option format — expected 'name:price'" }` — if any option string is malformed
- `404 { "error": "Modifier group not found" }`
- `500 { "error": "Failed to update modifier group" }`

---

### `DELETE /api/menu/modifiers/[id]`

Blocked if any menu item references this group in `modifierGroupIds` — returns `409` instead of deleting.

**Success (200):** `{ "success": true }`

**Error responses:**
- `409 { "error": "Cannot delete modifier group — it is attached to N item(s). Remove it from all items first." }`
- `404 { "error": "Modifier group not found" }`
- `500 { "error": "Failed to delete modifier group" }`

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
| `defaultOptionIndex` | integer | yes | -1 | -1 = no default; valid index only when isRequired=true |
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

### Submit Flow — Edit Mode (`item != null`)

1. Zod validation — show inline errors, abort if failing.
2. If `stagedImageFile` present: `POST /api/menu/items/[id]/image` → receive `imageUrl`. Set `formData.imageUrl = imageUrl`. If upload fails: toast error, keep drawer open, abort.
3. `PATCH /api/menu/items/[id]` with full payload (includes `imageUrl` from step 2 if uploaded).
4. On `200`: toast "Item saved" → `onSaved()` → `onClose()` → parent refetches list.
5. On `4xx/5xx`: toast error → keep drawer open.

### Submit Flow — Create Mode (`item == null`)

1. Zod validation — show inline errors, abort if failing.
2. `POST /api/menu/items` with full payload **excluding** `imageUrl` (image is uploaded after creation). On `4xx/5xx`: toast error, keep drawer open, abort.
3. If `stagedImageFile` present: `POST /api/menu/items/[newId]/image` using the `$id` returned in step 2 → receive `imageUrl`. Then `PATCH /api/menu/items/[newId] { imageUrl }`. If either call fails: toast warning "Item saved but image upload failed" — item is still created, drawer closes.
4. On success: toast "Item saved" → `onSaved()` → `onClose()` → parent refetches list.

---

## Stock Auto-Decrement — `pos.actions.ts` Change

After `createOrder()` successfully saves the order document, it fires a `Promise.allSettled` of PATCH calls — one per unique item in the cart.

**Stock source:** Immediately before firing the PATCHes, `createOrder()` reads the live stock for each unique item via `getMenuItemById(itemId)` (Appwrite `getDocument`). This avoids stale-cart race conditions. If `getMenuItemById` fails for an item, that item's stock decrement is skipped and logged — the order is not affected.

```
PATCH /api/menu/items/[itemId] { stock: max(0, liveStock - orderedQuantity) }
```

- `Promise.allSettled` is used (not `Promise.all`) — a failed stock update does not roll back the order.
- Stock is clamped to 0: `Math.max(0, liveStock - quantity)` — never goes negative.
- The server-side PATCH route handles the `isAvailable = false` side-effect when `stock === 0`.
- Failed decrements are logged: `console.error('[Stock decrement failed]', itemId, error)`.
- Step 14 must also audit the existing `Query.equal("isActive", true)` in `pos.actions.ts` and correct to `isAvailable` if the field name differs.

---

## Category Display Order

Drag-and-drop reorder in `CategoriesSection` uses the HTML Drag and Drop API (no external library).

On drag-end:
1. Compute new order locally — apply it to the rendered list immediately (optimistic update).
2. Fire `Promise.allSettled` of `PATCH /api/menu/categories/[id] { index: newIndex }` for every category whose index changed.
3. If **any** PATCH fails: revert the entire list to the pre-drag order, show a toast "Reorder failed — please try again", call `onRefresh()` to reload from server.
4. If all succeed: no further action (optimistic order stands).

The POS product grid respects this order (already sorts by `index` in `getCategories()`).

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

### `__tests__/menu/inline-price-input.test.tsx`

```
✗ renders current price value
✗ clicking field enters edit mode
✗ pressing Enter triggers PATCH /api/menu/items/[id] with new price
✗ pressing Escape cancels without saving (reverts value)
✗ blur triggers save
✗ rejects price of 0 — shows inline error, does not save
✗ rejects negative price — shows inline error, does not save
✗ shows saving spinner while request is in flight
✗ disables input while saving
✗ reverts to original value on API error
```

### `__tests__/menu/stock-decrement.test.ts`

```
✗ createOrder fetches live stock before decrementing (not using stale cart value)
✗ createOrder decrements stock by ordered quantity for single item
✗ createOrder decrements stock for multiple items independently
✗ createOrder clamps stock to 0 (never negative)
✗ order document is still created when stock decrement PATCH fails
✗ order document is still created when live stock fetch fails for one item
✗ stock is not decremented when order creation itself fails
```

Note: "createOrder sets isAvailable=false when stock reaches 0" is tested in `api-menu-items.test.ts` — the PATCH route handles that side-effect server-side; `createOrder()` only sends the PATCH, it does not itself set `isAvailable`.

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
✗ POST saves defaultOptionIndex=-1 for non-required group
✗ PATCH updates modifier group name
✗ PATCH returns 400 when options array is patched empty
✗ PATCH returns 404 for unknown groupId
✗ DELETE returns 200 on success
✗ DELETE returns 404 for unknown groupId
✗ DELETE returns 409 when modifier group is referenced by at least one menu item
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
