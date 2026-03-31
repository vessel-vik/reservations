# Menu & Stock CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Menu & Stock CMS tab — image upload API, 2-step image upload flow in MenuItemDrawer, default modifier option selection, category drag-reorder, and stock decrement wired to `createOrder()`.

**Architecture:** Most components are already built (~80%). `decrementItemStocks()` already exists in `lib/actions/menu.actions.ts` with tests — `createOrder()` just needs to call it. `isAvailable` is confirmed as the correct field name for MENU_ITEMS (the `pos.actions.ts:48` query uses `isActive` in error — fix that one line). The only new API route needed is `/api/menu/items/[id]/image`. All other work is completing component features.

**Tech Stack:** Next.js App Router, Appwrite Storage (`MENU_IMAGES_BUCKET_ID`), React Hook Form + Zod, Vitest + @testing-library/react, HTML Drag and Drop API

---

## Current State (as of audit)

**COMPLETE — verify only, do not re-implement:**
- `lib/stock-utils.ts` — all functions, tests GREEN (11/11)
- `lib/actions/menu.actions.ts` — getMenuItems, createMenuItem, updateMenuItem, deleteMenuItem, **`decrementItemStocks()`** (exists at line 208, tested separately)
- `lib/actions/modifier.actions.ts` — full CRUD for modifier groups
- `components/admin/menu/InlineStockInput.tsx` — tests GREEN (7/7)
- `components/admin/menu/InlinePriceInput.tsx` — tests GREEN (9/9); note spec's `__tests__/menu/inline-price-input.test.tsx` must already exist — **verify file exists** before proceeding
- `components/admin/menu/AvailabilityToggle.tsx` — tests GREEN (6/6)
- `components/admin/menu/MenuItemRow.tsx`, `MenuItemsSection.tsx`, `MenuSectionNav.tsx` — complete
- `components/admin/menu/LowStockAlertStrip.tsx`, `TagInput.tsx`, `DietaryFlagPills.tsx`, `ModifierGroupSelector.tsx` — complete
- `components/admin/menu/ModifiersSection.tsx`, `ModifierGroupCard.tsx` — complete
- `components/admin/menu/CategoriesSection.tsx` — add/delete work; drag-reorder missing (Task 4)
- `components/admin/menu/MenuCMS.tsx` — orchestrator, fully wired
- `app/api/menu/items/route.ts` — GET/POST with validation
- `app/api/menu/modifiers/route.ts` + `[id]/route.ts` — full CRUD
- `app/admin/page.tsx` — Menu & Stock tab integrated at keyboard shortcut '4'
- `__tests__/menu/stock-utils.test.ts`, `inline-stock-input.test.tsx`, `availability-toggle.test.tsx` — GREEN
- `__tests__/menu/stock-decrement.test.ts` — tests `decrementItemStocks` directly; all GREEN

**NEEDS WORK (tasks below):**
- `types/pos.types.ts` — `MenuItem` and `ModifierGroup` interfaces missing (compile blocker for all admin/menu/ components)
- `lib/actions/pos.actions.ts:48` — `Query.equal("isActive", true)` should be `"isAvailable"` for MENU_ITEMS
- `app/api/menu/items/[id]/route.ts` — PATCH returns `{ success: true }` (spec requires `{ item: MenuItem }`); confirm `isAvailable=false` side-effect on `stock=0`
- `app/api/menu/items/[id]/image/route.ts` — MISSING (blocks image uploads)
- `components/admin/menu/MenuItemDrawer.tsx` — no 2-step image upload flow; `price` allows 0 (should be > 0)
- `components/admin/menu/ModifierGroupDrawer.tsx` — no `defaultOptionIndex` field or radio UI
- `components/admin/menu/CategoriesSection.tsx` — drag-reorder not implemented
- `lib/actions/pos.actions.ts` — `createOrder()` never calls `decrementItemStocks()`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `types/pos.types.ts` | **Modify** | Add `MenuItem` and `ModifierGroup` interfaces |
| `lib/actions/pos.actions.ts` | **Modify** | Fix `isActive` → `isAvailable` (line 48); wire `decrementItemStocks()` into `createOrder()` |
| `app/api/menu/items/[id]/route.ts` | **Modify** | PATCH must return `{ item: MenuItem }`; confirm `isAvailable=false` on `stock=0` |
| `app/api/menu/items/[id]/image/route.ts` | **Create** | Menu image upload → MENU_IMAGES_BUCKET_ID → `{ imageUrl }` |
| `components/admin/menu/MenuItemDrawer.tsx` | **Modify** | 2-step image upload (create mode: POST then upload; edit mode: upload then PATCH); `price > 0` |
| `components/admin/menu/ModifierGroupDrawer.tsx` | **Modify** | `defaultOptionIndex` state; radio UI when `isRequired=true` |
| `components/admin/menu/CategoriesSection.tsx` | **Modify** | HTML drag-reorder with optimistic rollback |
| `__tests__/menu/api-menu.test.ts` | **Modify** | Add: PATCH `{ item }` response, `isAvailable` side-effect, image upload route tests |
| `__tests__/menu/menu-item-drawer.test.tsx` | **Modify** | Add: image upload create/edit flow tests, `price=0` error |
| `__tests__/menu/stock-decrement.test.ts` | **Modify** | Add: integration test verifying `createOrder` calls `decrementItemStocks` |

---

## Task 1: Add TypeScript Types

**Files:**
- Modify: `types/pos.types.ts`

- [ ] **Step 1.1: Verify `inline-price-input.test.tsx` exists**

```bash
ls __tests__/menu/inline-price-input.test.tsx && echo "EXISTS" || echo "MISSING"
```

If MISSING, that file is required by the spec. Create it with the 10 test cases listed in the spec's TDD section before continuing. Run the component's tests to confirm GREEN before modifying types.

- [ ] **Step 1.2: Read the bottom of types/pos.types.ts**

```bash
tail -20 types/pos.types.ts
```

Confirm `MenuItem` and `ModifierGroup` don't already exist.

- [ ] **Step 1.3: Add the new interfaces**

Append to `types/pos.types.ts`:

```typescript
// ─── Admin CMS Types ──────────────────────────────────────────────────────────

export interface MenuItem {
  $id: string
  name: string
  price: number
  stock: number
  lowStockThreshold: number    // default 5
  isAvailable: boolean
  category: string             // Category.$id
  imageUrl?: string
  vatCategory: VatCategory     // reuses existing VatCategory type from this file
  description?: string
  preparationTime?: number     // minutes; 0 if not set
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
  defaultOptionIndex: number   // -1 = no default; valid index only when isRequired=true
  options: string[]            // serialised as "name:priceAdjustment" e.g. "Extra Chilli:100"
  createdAt: string
}
```

- [ ] **Step 1.4: Confirm no compile errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors. Ignore pre-existing unrelated errors if any.

- [ ] **Step 1.5: Commit**

```bash
git add types/pos.types.ts
git commit -m "feat: add MenuItem and ModifierGroup interfaces to types/pos.types.ts"
```

---

## Task 2: Fix `isActive` Field Name in pos.actions.ts

**Files:**
- Modify: `lib/actions/pos.actions.ts`

- [ ] **Step 2.1: Confirm the one-line fix**

`pos.actions.ts` line 48 currently has `Query.equal("isActive", true)` for the MENU_ITEMS query. The rest of the codebase (`menu.actions.ts`, `app/api/menu/items/[id]/route.ts`, `decrementItemStocks`) uses `isAvailable`. Line 18 (`Query.equal("isActive", true)`) is for CATEGORIES — that is **correct** and must not be changed.

```bash
grep -n "isActive\|isAvailable" lib/actions/pos.actions.ts
```

Expected output: line 18 (CATEGORIES — correct), line 48 (MENU_ITEMS — wrong).

- [ ] **Step 2.2: Fix line 48 only**

Change line 48:

```typescript
// Before:
Query.equal("isActive", true),
// After:
Query.equal("isAvailable", true),
```

- [ ] **Step 2.3: Verify categories still work (line 18 unchanged)**

```bash
grep -n "isActive\|isAvailable" lib/actions/pos.actions.ts
```

Expected: line 18 still `isActive` (for CATEGORIES), line 48 now `isAvailable` (for MENU_ITEMS).

- [ ] **Step 2.4: Commit**

```bash
git add lib/actions/pos.actions.ts
git commit -m "fix: pos.actions getMenuItems query uses isAvailable (was isActive)"
```

---

## Task 3: Fix PATCH Route — Return Full Item Document

**Files:**
- Modify: `app/api/menu/items/[id]/route.ts`
- Modify: `__tests__/menu/api-menu.test.ts`

The current PATCH handler returns `{ success: true }`. The spec requires `{ item: MenuItem }` so that inline inputs can update to the latest server state (important for the `isAvailable=false` side-effect).

- [ ] **Step 3.1: Read the current PATCH handler**

```bash
cat "app/api/menu/items/[id]/route.ts"
```

Look for `updateMenuItem()` call and what it returns. Check `lib/actions/menu.actions.ts` `updateMenuItem` signature.

- [ ] **Step 3.2: Write failing tests**

Add to `__tests__/menu/api-menu.test.ts`:

```typescript
import { PATCH } from '@/app/api/menu/items/[id]/route'
// ... existing mocks already set up in this file

test('PATCH returns { item } with full updated document', async () => {
  vi.mocked(databases.updateDocument).mockResolvedValueOnce({ $id: 'item1', stock: 5, isAvailable: true } as any)
  const req = new NextRequest('http://localhost/api/menu/items/item1', {
    method: 'PATCH',
    body: JSON.stringify({ stock: 5 }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await PATCH(req, { params: { id: 'item1' } })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.item).toBeDefined()
  expect(body.item.$id).toBe('item1')
})

test('PATCH sets isAvailable=false when stock is patched to 0', async () => {
  vi.mocked(databases.updateDocument).mockResolvedValueOnce({
    $id: 'item1', stock: 0, isAvailable: false
  } as any)
  const req = new NextRequest('http://localhost/api/menu/items/item1', {
    method: 'PATCH',
    body: JSON.stringify({ stock: 0 }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await PATCH(req, { params: { id: 'item1' } })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.item.isAvailable).toBe(false)
  expect(body.item.stock).toBe(0)
})

test('PATCH returns 400 when stock is patched to negative', async () => {
  const req = new NextRequest('http://localhost/api/menu/items/item1', {
    method: 'PATCH',
    body: JSON.stringify({ stock: -1 }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await PATCH(req, { params: { id: 'item1' } })
  expect(res.status).toBe(400)
  expect((await res.json()).error).toMatch(/cannot be negative/)
})
```

- [ ] **Step 3.3: Confirm tests FAIL**

```bash
npx vitest run __tests__/menu/api-menu.test.ts -t "PATCH"
```

- [ ] **Step 3.4: Fix the PATCH handler**

The handler must:
1. Validate `stock < 0` → return 400
2. Add `isAvailable: false` to update payload when `stock === 0`
3. Call `databases.updateDocument` and return the updated doc as `{ item }`

```typescript
// In the PATCH handler (replace the current { success: true } return):
const body = await req.json()

if (typeof body.stock === 'number' && body.stock < 0) {
  return NextResponse.json({ error: 'stock cannot be negative' }, { status: 400 })
}

const updates = { ...body }
if (typeof body.stock === 'number' && body.stock === 0) {
  updates.isAvailable = false
}

try {
  const updated = await databases.updateDocument(
    DATABASE_ID!, MENU_ITEMS_COLLECTION_ID!, id, updates
  )
  return NextResponse.json({ item: updated })
} catch (err: any) {
  if (err?.code === 404) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
}
```

**Note:** Check how the route currently calls `updateMenuItem` from `menu.actions.ts`. If it wraps the Appwrite call, update that wrapper to return the updated document (or bypass it and call `databases.updateDocument` directly in the route for this full-doc-return requirement).

- [ ] **Step 3.5: Run tests — confirm PASS**

```bash
npx vitest run __tests__/menu/api-menu.test.ts
```

- [ ] **Step 3.6: Commit**

```bash
git add "app/api/menu/items/[id]/route.ts" __tests__/menu/api-menu.test.ts
git commit -m "fix: PATCH /api/menu/items/[id] returns full item doc, sets isAvailable=false on stock=0"
```

---

## Task 4: Create Menu Item Image Upload Route

**Files:**
- Create: `app/api/menu/items/[id]/image/route.ts`
- Modify: `__tests__/menu/api-menu.test.ts`

**Environment variable:** The route reads `MENU_IMAGES_BUCKET_ID` (server-side, no `NEXT_PUBLIC_` prefix). Add to `.env.local`:
```
MENU_IMAGES_BUCKET_ID=<your-appwrite-images-bucket-id>
```

Note: `ImageUploadField.tsx` may read `NEXT_PUBLIC_MENU_IMAGES_BUCKET_ID`. If so, add both names to `.env.local` pointing to the same bucket, OR update `ImageUploadField` to not need the bucket ID client-side (it only calls the Next.js API route which reads the server-side var).

- [ ] **Step 4.1: Write failing tests**

Add to `__tests__/menu/api-menu.test.ts`:

```typescript
import { POST as imagePost } from '@/app/api/menu/items/[id]/image/route'

// storage mock already set up — add createFile mock:
// vi.mocked(storage.createFile).mockResolvedValue({ $id: 'img123' } as any)

process.env.MENU_IMAGES_BUCKET_ID = 'img-bucket'

test('POST /api/menu/items/[id]/image returns imageUrl', async () => {
  vi.mocked(storage.createFile).mockResolvedValueOnce({ $id: 'img123' } as any)
  const form = new FormData()
  form.append('file', new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))
  const req = new NextRequest('http://localhost/api/menu/items/item1/image', { method: 'POST', body: form })
  const res = await imagePost(req, { params: { id: 'item1' } })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.imageUrl).toContain('img123')
})

test('POST /api/menu/items/[id]/image returns 400 when no file', async () => {
  const req = new NextRequest('http://localhost/api/menu/items/item1/image', {
    method: 'POST', body: new FormData()
  })
  const res = await imagePost(req, { params: { id: 'item1' } })
  expect(res.status).toBe(400)
  expect((await res.json()).error).toBe('No file provided')
})

test('POST returns 400 when file exceeds 10 MB', async () => {
  const form = new FormData()
  form.append('file', new File([Buffer.alloc(10 * 1024 * 1024 + 1)], 'b.jpg', { type: 'image/jpeg' }))
  const req = new NextRequest('http://localhost/api/menu/items/item1/image', { method: 'POST', body: form })
  const res = await imagePost(req, { params: { id: 'item1' } })
  expect(res.status).toBe(400)
  expect((await res.json()).error).toMatch(/10 MB/)
})

test('POST returns 400 for unsupported MIME (PDF not allowed for images)', async () => {
  const form = new FormData()
  form.append('file', new File(['x'], 'doc.pdf', { type: 'application/pdf' }))
  const req = new NextRequest('http://localhost/api/menu/items/item1/image', { method: 'POST', body: form })
  const res = await imagePost(req, { params: { id: 'item1' } })
  expect(res.status).toBe(400)
  expect((await res.json()).error).toMatch(/Unsupported/)
})
```

- [ ] **Step 4.2: Confirm tests FAIL**

```bash
npx vitest run __tests__/menu/api-menu.test.ts -t "POST /api/menu/items"
```

- [ ] **Step 4.3: Create the route**

Create `app/api/menu/items/[id]/image/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { storage } from '@/lib/appwrite.config'
import { InputFile, ID } from 'node-appwrite'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file || file.size === 0)
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: 'File too large. Maximum 10 MB' }, { status: 400 })
    if (!ALLOWED.includes(file.type))
      return NextResponse.json(
        { error: 'Unsupported file type. Accepted: JPEG, PNG, WebP' },
        { status: 400 }
      )

    const bucket = process.env.MENU_IMAGES_BUCKET_ID!
    const uploaded = await storage.createFile(
      bucket,
      ID.unique(),
      InputFile.fromBuffer(Buffer.from(await file.arrayBuffer()), file.name)
    )
    const ep = process.env.NEXT_PUBLIC_ENDPOINT ?? 'https://cloud.appwrite.io/v1'
    const pid = process.env.NEXT_PUBLIC_PROJECT_ID ?? ''
    const imageUrl = `${ep}/storage/buckets/${bucket}/files/${uploaded.$id}/view?project=${pid}`
    return NextResponse.json({ imageUrl })
  } catch (err: any) {
    console.error(`[menu/items/${params.id}/image]`, err)
    return NextResponse.json({ error: 'Upload failed', details: err?.message }, { status: 500 })
  }
}
```

- [ ] **Step 4.4: Run tests — confirm PASS**

```bash
npx vitest run __tests__/menu/api-menu.test.ts
```

- [ ] **Step 4.5: Commit**

```bash
git add "app/api/menu/items/[id]/image/route.ts" __tests__/menu/api-menu.test.ts
git commit -m "feat: POST /api/menu/items/[id]/image — menu image upload to MENU_IMAGES_BUCKET_ID"
```

---

## Task 5: Fix MenuItemDrawer — 2-Step Image Upload + Price > 0

**Files:**
- Modify: `components/admin/menu/MenuItemDrawer.tsx`
- Modify: `__tests__/menu/menu-item-drawer.test.tsx`

- [ ] **Step 5.1: Read the current drawer**

```bash
cat components/admin/menu/MenuItemDrawer.tsx
```

Look for: `price` Zod validation (should be `.positive()` not `.nonnegative()`), `stagedImageFile` state, submit handler.

- [ ] **Step 5.2: Write failing tests for image upload flows**

Add to `__tests__/menu/menu-item-drawer.test.tsx`:

```typescript
test('shows error when price is 0 on submit', async () => {
  render(<MenuItemDrawer open={true} item={null} categories={[]} modifierGroups={[]} onClose={vi.fn()} onSaved={vi.fn()} />)
  await userEvent.type(screen.getByLabelText(/name/i), 'Burger')
  await userEvent.clear(screen.getByLabelText(/price/i))
  await userEvent.type(screen.getByLabelText(/price/i), '0')
  await userEvent.click(screen.getByRole('button', { name: /save/i }))
  expect(screen.getByText(/greater than 0/i)).toBeInTheDocument()
})

test('in create mode: calls POST items first, then POSTs image, then PATCHes imageUrl', async () => {
  const createdItemId = 'new-item-123'
  const mockFetch = vi.spyOn(global, 'fetch')
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ item: { $id: createdItemId } }), { status: 201 })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ imageUrl: 'https://cdn.x.com/img.jpg' }), { status: 200 })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ item: { $id: createdItemId, imageUrl: 'https://cdn.x.com/img.jpg' } }), { status: 200 })
    )

  render(<MenuItemDrawer open={true} item={null} ... />)
  // fill required fields + trigger file stage
  await userEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => {
    const calls = mockFetch.mock.calls
    expect(calls[0][0]).toContain('/api/menu/items')
    expect(calls[0][1]?.method).toBe('POST')
    expect(calls[1][0]).toContain(`/api/menu/items/${createdItemId}/image`)
    expect(calls[2][0]).toContain(`/api/menu/items/${createdItemId}`)
    expect(calls[2][1]?.method).toBe('PATCH')
  })
})

test('in create mode: item is still saved even if image upload fails', async () => {
  vi.spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ item: { $id: 'item1' } }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 }))

  const onSaved = vi.fn()
  render(<MenuItemDrawer open={true} item={null} ... onSaved={onSaved} />)
  // fill fields + stage image
  await userEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => {
    expect(onSaved).toHaveBeenCalled()
    expect(screen.getByText(/image upload failed/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 5.3: Confirm new tests FAIL**

```bash
npx vitest run __tests__/menu/menu-item-drawer.test.tsx
```

- [ ] **Step 5.4: Fix price validation in Zod schema**

Find `z.coerce.number().nonnegative()` for the `price` field and change to:

```typescript
price: z.coerce.number().positive({ message: 'Price must be greater than 0' })
```

- [ ] **Step 5.5: Implement 2-step submit flow**

```typescript
const onSubmit = async (data: FormValues) => {
  // ── EDIT MODE ─────────────────────────────────────────────────
  if (item) {
    let imageUrl = formData?.imageUrl ?? item.imageUrl
    if (stagedImageFile) {
      setIsUploading(true)
      const form = new FormData()
      form.append('file', stagedImageFile)
      try {
        const res = await fetch(`/api/menu/items/${item.$id}/image`, { method: 'POST', body: form })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Image upload failed')
        imageUrl = json.imageUrl
      } catch (err: any) {
        toast.error(err.message ?? 'Image upload failed')
        setIsUploading(false)
        return
      }
      setIsUploading(false)
    }
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/menu/items/${item.$id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, imageUrl }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Item saved')
      onSaved(); onClose()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save item')
    } finally { setIsSubmitting(false) }
    return
  }

  // ── CREATE MODE ────────────────────────────────────────────────
  setIsSubmitting(true)
  let newItemId: string | null = null
  try {
    const { imageUrl: _, ...dataWithoutImage } = data as any
    const res = await fetch('/api/menu/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataWithoutImage),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    newItemId = json.item.$id
  } catch (err: any) {
    toast.error(err.message ?? 'Failed to create item')
    setIsSubmitting(false)
    return
  }
  setIsSubmitting(false)

  // Upload image to newly created item (best-effort — failure does not block save)
  if (stagedImageFile && newItemId) {
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', stagedImageFile)
      const imgRes = await fetch(`/api/menu/items/${newItemId}/image`, { method: 'POST', body: form })
      const imgJson = await imgRes.json()
      if (imgRes.ok) {
        await fetch(`/api/menu/items/${newItemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: imgJson.imageUrl }),
        })
      } else {
        toast.warning('Item saved but image upload failed. Edit the item to add an image.')
      }
    } catch {
      toast.warning('Item saved but image upload failed.')
    }
    setIsUploading(false)
  }

  toast.success('Item saved')
  onSaved(); onClose()
}
```

Disable button: `disabled={isUploading || isSubmitting}`.

- [ ] **Step 5.6: Run tests — confirm PASS**

```bash
npx vitest run __tests__/menu/menu-item-drawer.test.tsx
```

- [ ] **Step 5.7: Commit**

```bash
git add components/admin/menu/MenuItemDrawer.tsx __tests__/menu/menu-item-drawer.test.tsx
git commit -m "fix: MenuItemDrawer 2-step image upload flow, price > 0 validation"
```

---

## Task 6: Fix ModifierGroupDrawer — Default Option Selection

**Files:**
- Modify: `components/admin/menu/ModifierGroupDrawer.tsx`

- [ ] **Step 6.1: Write failing tests (RED before implementation)**

Add to `__tests__/menu/api-menu-modifiers.test.ts` or a new `modifier-group-drawer.test.tsx`:

```typescript
test('default option radio appears when isRequired is true', async () => {
  render(<ModifierGroupDrawer open={true} group={null} onClose={vi.fn()} onSaved={vi.fn()} />)
  const toggle = screen.getByLabelText(/required/i)
  await userEvent.click(toggle)  // turn on isRequired
  // Add an option
  await userEvent.type(screen.getByPlaceholderText(/option name/i), 'Sauce A')
  expect(screen.getAllByRole('radio').length).toBeGreaterThan(0)
})

test('default option radio is hidden when isRequired is false', async () => {
  render(<ModifierGroupDrawer open={true} group={null} onClose={vi.fn()} onSaved={vi.fn()} />)
  // isRequired defaults to false
  expect(screen.queryAllByRole('radio').length).toBe(0)
})

test('submit payload includes defaultOptionIndex matching selected radio', async () => {
  const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify({ group: { $id: 'g1' } }), { status: 201 })
  )
  render(<ModifierGroupDrawer open={true} group={null} onClose={vi.fn()} onSaved={vi.fn()} />)
  // Enable isRequired, add options, select the 2nd as default
  // submit
  await waitFor(() => {
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
    expect(body.defaultOptionIndex).toBe(1)  // 0-indexed
  })
})
```

- [ ] **Step 6.2: Confirm tests FAIL**

```bash
npx vitest run __tests__/menu/api-menu-modifiers.test.ts
```

- [ ] **Step 6.3: Read the current ModifierGroupDrawer**

```bash
cat components/admin/menu/ModifierGroupDrawer.tsx
```

- [ ] **Step 6.4: Add `defaultOptionIndex` state and radio UI**

```typescript
const [defaultOptionIndex, setDefaultOptionIndex] = useState<number>(
  group?.defaultOptionIndex ?? -1
)
const isRequired = watch('isRequired')

// When isRequired is toggled off, reset default:
useEffect(() => {
  if (!isRequired) setDefaultOptionIndex(-1)
}, [isRequired])
```

In the options list, for each option at index `i`:

```tsx
{isRequired && (
  <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer ml-2">
    <input
      type="radio"
      name="defaultOption"
      checked={defaultOptionIndex === i}
      onChange={() => setDefaultOptionIndex(i)}
      className="accent-amber-400"
      aria-label={`Set option ${i + 1} as default`}
    />
    Default
  </label>
)}
```

In the submit handler, include:

```typescript
const payload = {
  name,
  isRequired,
  maxSelections,
  defaultOptionIndex: isRequired ? defaultOptionIndex : -1,
  options: serializedOptions,
}
```

- [ ] **Step 6.5: Run tests — confirm PASS**

```bash
npx vitest run __tests__/menu/api-menu-modifiers.test.ts
```

- [ ] **Step 6.6: Commit**

```bash
git add components/admin/menu/ModifierGroupDrawer.tsx __tests__/menu/api-menu-modifiers.test.ts
git commit -m "feat: ModifierGroupDrawer defaultOptionIndex with radio UI for required groups"
```

---

## Task 7: Add Category Drag-Reorder

**Files:**
- Modify: `components/admin/menu/CategoriesSection.tsx`

- [ ] **Step 7.1: Write failing tests (RED before implementation)**

Add to `__tests__/menu/api-menu.test.ts`:

```typescript
test('PATCH /api/menu/categories/[id] accepts { index } and returns 200', async () => {
  // Mock the categories PATCH route
  vi.mocked(databases.updateDocument).mockResolvedValueOnce({ $id: 'cat1', index: 2 } as any)
  const req = new NextRequest('http://localhost/api/menu/categories/cat1', {
    method: 'PATCH',
    body: JSON.stringify({ index: 2 }),
    headers: { 'Content-Type': 'application/json' },
  })
  // Import and call the categories PATCH handler
  // const res = await categoriesPATCH(req, { params: { id: 'cat1' } })
  // expect(res.status).toBe(200)
})
```

Also write a component-level test using `vi.spyOn(global, 'fetch')`:

```typescript
test('CategoriesSection reverts order when PATCH fails', async () => {
  vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'))
  // render, drag item from index 0 to index 1
  // wait for revert
  // expect toast "Reorder failed" visible
})
```

- [ ] **Step 7.2: Confirm tests FAIL**

```bash
npx vitest run __tests__/menu/api-menu.test.ts -t "PATCH /api/menu/categories"
```

- [ ] **Step 7.3: Read the current CategoriesSection**

```bash
cat components/admin/menu/CategoriesSection.tsx
```

GripVertical handles are already rendered. The drag event handlers are missing.

- [ ] **Step 7.4: Add drag-reorder logic**

```typescript
const [localCategories, setLocalCategories] = useState(categories)
const [dragIndex, setDragIndex] = useState<number | null>(null)

useEffect(() => { setLocalCategories(categories) }, [categories])

function handleDragStart(i: number) { setDragIndex(i) }

function handleDragOver(e: React.DragEvent, i: number) {
  e.preventDefault()
  if (dragIndex === null || dragIndex === i) return
  const reordered = [...localCategories]
  const [moved] = reordered.splice(dragIndex, 1)
  reordered.splice(i, 0, moved)
  setLocalCategories(reordered)
  setDragIndex(i)
}

async function handleDrop() {
  setDragIndex(null)
  const snapshot = categories  // original server order
  const changed = localCategories.filter((cat, newIdx) => {
    const oldIdx = snapshot.findIndex(c => c.$id === cat.$id)
    return newIdx !== oldIdx
  })
  if (changed.length === 0) return

  const results = await Promise.allSettled(
    changed.map((cat, _, arr) => {
      const newIdx = localCategories.indexOf(cat)
      return fetch(`/api/menu/categories/${cat.$id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: newIdx }),
      }).then(r => { if (!r.ok) throw new Error('PATCH failed') })
    })
  )

  if (results.some(r => r.status === 'rejected')) {
    setLocalCategories(categories)
    toast.error('Reorder failed — please try again')
    onRefresh()
  }
}
```

Apply to each row wrapper:
```tsx
<div
  key={cat.$id}
  draggable
  onDragStart={() => handleDragStart(i)}
  onDragOver={(e) => handleDragOver(e, i)}
  onDrop={handleDrop}
  onDragEnd={() => setDragIndex(null)}
  className={dragIndex === i ? 'opacity-50' : ''}
>
```

Use `localCategories` (not `categories`) in the render map.

- [ ] **Step 7.5: Run tests — confirm PASS**

```bash
npx vitest run __tests__/menu/api-menu.test.ts
```

- [ ] **Step 7.6: Commit**

```bash
git add components/admin/menu/CategoriesSection.tsx __tests__/menu/api-menu.test.ts
git commit -m "feat: CategoriesSection drag-reorder with Promise.allSettled and optimistic rollback"
```

---

## Task 8: Wire `decrementItemStocks()` into `createOrder()`

**Files:**
- Modify: `lib/actions/pos.actions.ts`
- Modify: `__tests__/menu/stock-decrement.test.ts`

`decrementItemStocks()` already exists in `lib/actions/menu.actions.ts` (line 208) with tests passing. This task only wires it into `createOrder()` and adds one integration-level test.

- [ ] **Step 8.1: Write failing integration test**

Add to `__tests__/menu/stock-decrement.test.ts`:

```typescript
import { createOrder } from '@/lib/actions/pos.actions'
import * as menuActions from '@/lib/actions/menu.actions'

// Mock the entire module so decrementItemStocks can be spied on
vi.mock('@/lib/actions/menu.actions', async (orig) => ({
  ...(await orig<typeof menuActions>()),
  decrementItemStocks: vi.fn().mockResolvedValue({ success: true, failureCount: 0 }),
}))

vi.mock('@/lib/appwrite.config', () => ({
  databases: {
    createDocument: vi.fn().mockResolvedValue({ $id: 'order-1' }),
    getDocument: vi.fn().mockResolvedValue({ stock: 5, popularity: 0 }),
    updateDocument: vi.fn().mockResolvedValue({}),
  },
  DATABASE_ID: 'db',
  ORDERS_COLLECTION_ID: 'orders',
  MENU_ITEMS_COLLECTION_ID: 'items',
  CATEGORIES_COLLECTION_ID: 'cats',
  ID: { unique: () => 'new-id' },
}))

test('createOrder calls decrementItemStocks after saving order', async () => {
  const order = {
    orderNumber: 'ORD-001',
    items: [
      { $id: 'item-a', name: 'Burger', price: 500, quantity: 2 },
    ],
    totalAmount: 1000,
    paymentStatus: 'paid',
  }
  await createOrder(order as any)
  expect(menuActions.decrementItemStocks).toHaveBeenCalledWith(
    expect.arrayContaining([{ itemId: 'item-a', quantity: 2 }])
  )
})

test('createOrder completes even if decrementItemStocks fails', async () => {
  vi.mocked(menuActions.decrementItemStocks).mockRejectedValueOnce(new Error('Stock service down'))
  const order = { orderNumber: 'ORD-002', items: [{ $id: 'item-a', quantity: 1 }], totalAmount: 500, paymentStatus: 'paid' }
  await expect(createOrder(order as any)).resolves.toBeDefined()
})
```

- [ ] **Step 8.2: Confirm new tests FAIL**

```bash
npx vitest run __tests__/menu/stock-decrement.test.ts -t "createOrder"
```

Expected: FAIL — `decrementItemStocks` is not called by `createOrder` yet.

- [ ] **Step 8.3: Add the call to `createOrder()`**

In `lib/actions/pos.actions.ts`, after the popularity update try/catch block (around line 133), add:

```typescript
// ── Stock decrement ──────────────────────────────────────────────────────────
try {
  const { decrementItemStocks } = await import('@/lib/actions/menu.actions')
  const cartItems = (order.items as any[]).map(item => ({
    itemId: item.$id,
    quantity: item.quantity ?? 1,
  }))
  await decrementItemStocks(cartItems)
} catch (stockErr) {
  console.error('[createOrder] Stock decrement failed:', stockErr)
  // Do not re-throw — order is already saved
}
```

**Note on dynamic import:** Use `await import(...)` to avoid a circular dependency between `pos.actions` and `menu.actions`. If no circular dependency exists (check imports), a static import at the top of the file is cleaner.

- [ ] **Step 8.4: Run tests — confirm PASS**

```bash
npx vitest run __tests__/menu/stock-decrement.test.ts
```

Expected: all tests (existing `decrementItemStocks` tests + new `createOrder` integration tests) PASS.

- [ ] **Step 8.5: Commit**

```bash
git add lib/actions/pos.actions.ts __tests__/menu/stock-decrement.test.ts
git commit -m "feat: createOrder calls decrementItemStocks after order is saved"
```

---

## Task 9: Full Test Suite Verification

- [ ] **Step 9.1: Run all Menu CMS tests**

```bash
cd /home/elyees/D/reservations/reservations
npx vitest run __tests__/menu/
```

Expected: all GREEN. Fix any failures before continuing.

- [ ] **Step 9.2: Run full test suite**

```bash
npx vitest run
```

Expected: no regressions.

- [ ] **Step 9.3: Manual smoke test**

1. `localhost:3000/admin` → Menu & Stock tab (key 4)
2. Add a new item with an image → confirm image persists after save
3. Edit an existing item and upload a replacement image
4. Create a modifier group with `isRequired=true` → confirm default option radio appears; confirm `defaultOptionIndex` is saved correctly
5. Drag categories into a new order → reload page → confirm order persists
6. Create a POS order → navigate to Menu & Stock → confirm stock count decremented
7. Order enough to zero out stock → confirm item shows as unavailable in POS

- [ ] **Step 9.4: Final commit**

```bash
git add components/admin/menu/ __tests__/menu/ types/pos.types.ts lib/actions/pos.actions.ts
git commit -m "feat: Menu & Stock CMS Sub-project 2 complete — image uploads, modifier defaults, drag-reorder, stock decrement"
```
