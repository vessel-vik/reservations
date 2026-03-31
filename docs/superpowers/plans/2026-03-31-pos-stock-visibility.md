# POS Stock Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface `stock` and `lowStockThreshold` from Appwrite MENU_ITEMS in the POS product grid — amber badge for low stock, red badge + dimming for out-of-stock, a hide/show toggle, and a staff override warning dialog.

**Architecture:** Extend `Product` type with two optional fields; update `ProductCard` to render badge overlays using `getStockStatus` / `isOutOfStock` from `lib/stock-utils.ts`; update `POSInterface` to sort out-of-stock items to the bottom, toggle their visibility, and show an inline warning dialog before adding them to cart. No new files created, no new API routes, no new Appwrite queries.

**Tech Stack:** Next.js App Router, React 18, TypeScript, Appwrite Realtime, Vitest + @testing-library/react, Tailwind CSS + `tailwindcss-animate`, Lucide icons, `cn()` from `@/lib/utils`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `types/pos.types.ts` | Modify | Add `stock?: number`, `lowStockThreshold?: number` to `Product` |
| `__tests__/pos/stock-visibility.test.tsx` | Create | 22 TDD tests — all RED before implementation |
| `components/pos/ProductCard.tsx` | Modify | Badge overlay, opacity dimming, conditional hover-lift, remove legacy pill |
| `components/pos/POSInterface.tsx` | Modify | Sort logic, showOutOfStock state, toggle pill, warning dialog |

---

## Task 1: Add `stock` and `lowStockThreshold` to `Product`

This is a two-line type change — required before tests can typecheck. It is NOT the implementation.

**Files:**
- Modify: `types/pos.types.ts:17-36`

- [ ] **Step 1: Add the two optional fields to `Product`**

Open `types/pos.types.ts`. After `popularity: number;` (line 32), add:

```typescript
  popularity: number;
  // Stock tracking (undefined = untracked — no badge shown)
  stock?: number;
  lowStockThreshold?: number;  // defaults to 5 when absent from Appwrite doc
  // VAT categorization for Kenya compliance
```

The full updated `Product` interface should look like:

```typescript
export interface Product {
  $id: string;
  name: string;
  description: string;
  price: number;
  category: Category | string;
  imageUrl?: string;
  isAvailable: boolean;
  preparationTime: number;
  ingredients?: string[];
  allergens?: string[];
  isVegetarian: boolean;
  isVegan: boolean;
  isGlutenFree: boolean;
  calories?: number;
  popularity: number;
  stock?: number;
  lowStockThreshold?: number;
  vatCategory?: VatCategory;
  vatRate?: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors related to `Product`.

- [ ] **Step 3: Commit**

```bash
git add types/pos.types.ts
git commit -m "feat(types): add stock and lowStockThreshold to Product interface"
```

---

## Task 2: Write all 22 failing tests

All tests must be **RED** before any implementation in Tasks 3–4 begins.

**Files:**
- Create: `__tests__/pos/stock-visibility.test.tsx`

- [ ] **Step 1: Create the test file with all 22 tests**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductCard } from '@/components/pos/ProductCard';
import POSInterface from '@/components/pos/POSInterface';
import { Product, Category } from '@/types/pos.types';

// ─── Global mocks ──────────────────────────────────────────────────────────────

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (price: number) => `KSh ${price}`,
  cn: (...classes: (string | boolean | undefined)[]) =>
    classes.filter(Boolean).join(' '),
}));

// ─── POSInterface dependency mocks ─────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: (_key: string) => null }),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null, isLoaded: true }),
  UserButton: () => null,
}));

const mockAddToCart = vi.fn();

vi.mock('@/store/pos-store', () => ({
  usePOSStore: () => ({
    cart: [],
    addToCart: mockAddToCart,
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
    isPaymentModalOpen: false,
    setPaymentModalOpen: vi.fn(),
  }),
}));

vi.mock('@/lib/appwrite-client', () => ({
  client: { subscribe: () => () => {} },
}));

vi.mock('@/lib/actions/pos.actions', () => ({
  createOrder: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: (_loader: unknown) => () => null,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/components/pos/CartSidebar', () => ({ CartSidebar: () => null }));
vi.mock('@/components/pos/MobileCart', () => ({ MobileCart: () => null }));
vi.mock('@/components/pos/ServerDashboard', () => ({ ServerDashboard: () => null }));
vi.mock('@/components/pos/ProcessingOverlay', () => ({ ProcessingOverlay: () => null }));
vi.mock('@/components/pos/SettleTableTabModal', () => ({ SettleTableTabModal: () => null }));
vi.mock('@/components/pos/AddToTabModal', () => ({ AddToTabModal: () => null }));
vi.mock('@/components/pos/ProductDetailsModal', () => ({ ProductDetailsModal: () => null }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props}>{children}</button>
  ),
}));

// ─── Shared fixtures ───────────────────────────────────────────────────────────

const baseProduct: Product = {
  $id: 'p1',
  name: 'Grilled Chicken',
  description: 'Tender chicken breast',
  price: 450,
  category: 'mains',
  isAvailable: true,
  preparationTime: 15,
  isVegetarian: false,
  isVegan: false,
  isGlutenFree: false,
  popularity: 10,
};

const baseCategories: Category[] = [
  { $id: 'cat1', name: 'mains', label: 'Mains', slug: 'mains', index: 0, isActive: true },
];

// Products for POSInterface tests — all share category 'cat1' (slug: 'mains')
const inStockProduct: Product = {
  ...baseProduct,
  $id: 'p1',
  name: 'Grilled Chicken',
  category: 'cat1',
  stock: 20,
  lowStockThreshold: 5,
};

const outOfStockProduct: Product = {
  ...baseProduct,
  $id: 'p2',
  name: 'Fish Fillet',
  category: 'cat1',
  stock: 0,
  lowStockThreshold: 5,
  isAvailable: true,
};

const unavailableProduct: Product = {
  ...baseProduct,
  $id: 'p3',
  name: 'Seasonal Soup',
  category: 'cat1',
  stock: 10,
  lowStockThreshold: 5,
  isAvailable: false,
};

const allProducts = [inStockProduct, outOfStockProduct, unavailableProduct];

const renderPOS = (
  products: Product[] = allProducts,
  categories: Category[] = baseCategories,
) => render(<POSInterface initialProducts={products} initialCategories={categories} />);

// ─── ProductCard tests ─────────────────────────────────────────────────────────

describe('ProductCard — stock badge', () => {
  const onAdd = vi.fn();
  const onView = vi.fn();

  beforeEach(() => {
    onAdd.mockClear();
    onView.mockClear();
  });

  it('renders amber "Last N" badge when stock is at or below lowStockThreshold', () => {
    render(
      <ProductCard
        product={{ ...baseProduct, stock: 3, lowStockThreshold: 5 }}
        onAdd={onAdd}
        onView={onView}
      />,
    );
    expect(screen.getByText('Last 3')).toBeInTheDocument();
  });

  it('renders no stock badge when stock is above lowStockThreshold', () => {
    render(
      <ProductCard
        product={{ ...baseProduct, stock: 10, lowStockThreshold: 5 }}
        onAdd={onAdd}
        onView={onView}
      />,
    );
    expect(screen.queryByText(/Last/)).not.toBeInTheDocument();
    expect(screen.queryByText('Out of Stock')).not.toBeInTheDocument();
  });

  it('renders no stock badge when stock is undefined (untracked item)', () => {
    render(<ProductCard product={baseProduct} onAdd={onAdd} onView={onView} />);
    expect(screen.queryByText(/Last/)).not.toBeInTheDocument();
    expect(screen.queryByText('Out of Stock')).not.toBeInTheDocument();
  });

  it('renders red "Out of Stock" badge when stock is 0', () => {
    render(
      <ProductCard product={{ ...baseProduct, stock: 0 }} onAdd={onAdd} onView={onView} />,
    );
    expect(screen.getByText('Out of Stock')).toBeInTheDocument();
  });

  it('renders red "Out of Stock" badge when isAvailable is false (stock > 0)', () => {
    render(
      <ProductCard
        product={{ ...baseProduct, stock: 10, isAvailable: false }}
        onAdd={onAdd}
        onView={onView}
      />,
    );
    expect(screen.getByText('Out of Stock')).toBeInTheDocument();
  });
});

describe('ProductCard — out-of-stock card state', () => {
  const onAdd = vi.fn();
  const onView = vi.fn();

  it('applies opacity-40 class to card wrapper when stock is 0', () => {
    const { container } = render(
      <ProductCard product={{ ...baseProduct, stock: 0 }} onAdd={onAdd} onView={onView} />,
    );
    expect(container.firstChild).toHaveClass('opacity-40');
  });

  it('applies opacity-40 class to card wrapper when isAvailable is false', () => {
    const { container } = render(
      <ProductCard product={{ ...baseProduct, isAvailable: false }} onAdd={onAdd} onView={onView} />,
    );
    expect(container.firstChild).toHaveClass('opacity-40');
  });

  it('applies pointer-events-none to quick-add button when stock is 0', () => {
    render(
      <ProductCard product={{ ...baseProduct, stock: 0 }} onAdd={onAdd} onView={onView} />,
    );
    const btn = screen.getByRole('button', { name: /quick add/i });
    expect(btn).toHaveClass('pointer-events-none');
  });

  it('does not render the legacy "Unavailable" pill in the price row', () => {
    render(
      <ProductCard product={{ ...baseProduct, isAvailable: false }} onAdd={onAdd} onView={onView} />,
    );
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
  });
});

// ─── POSInterface tests ────────────────────────────────────────────────────────

describe('POSInterface — sort and visibility', () => {
  beforeEach(() => mockAddToCart.mockClear());

  it('sorts stock=0 items to the bottom of the product grid', () => {
    // out-of-stock product is FIRST in the array — it must end up LAST in the grid
    renderPOS([outOfStockProduct, inStockProduct]);

    // First make out-of-stock items visible
    fireEvent.click(screen.getByRole('button', { name: /show out-of-stock/i }));

    const headings = screen.getAllByRole('heading', { level: 3 });
    const chickenIdx = headings.findIndex((h) => h.textContent === 'Grilled Chicken');
    const fishIdx = headings.findIndex((h) => h.textContent === 'Fish Fillet');
    expect(chickenIdx).toBeLessThan(fishIdx);
  });

  it('sorts isAvailable=false items (with stock > 0) to the bottom of the grid', () => {
    renderPOS([unavailableProduct, inStockProduct]);

    fireEvent.click(screen.getByRole('button', { name: /show out-of-stock/i }));

    const headings = screen.getAllByRole('heading', { level: 3 });
    const chickenIdx = headings.findIndex((h) => h.textContent === 'Grilled Chicken');
    const soupIdx = headings.findIndex((h) => h.textContent === 'Seasonal Soup');
    expect(chickenIdx).toBeLessThan(soupIdx);
  });

  it('hides stock=0 items by default (showOutOfStock = false)', () => {
    renderPOS();
    expect(screen.queryByText('Fish Fillet')).not.toBeInTheDocument();
  });

  it('hides isAvailable=false items by default (showOutOfStock = false)', () => {
    renderPOS();
    expect(screen.queryByText('Seasonal Soup')).not.toBeInTheDocument();
  });

  it('shows out-of-stock and unavailable items when the toggle is clicked', () => {
    renderPOS();
    expect(screen.queryByText('Fish Fillet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show out-of-stock/i }));

    expect(screen.getByText('Fish Fillet')).toBeInTheDocument();
    expect(screen.getByText('Seasonal Soup')).toBeInTheDocument();
  });

  it('toggle label shows the count of hidden out-of-stock items', () => {
    renderPOS(); // 2 hidden: outOfStockProduct + unavailableProduct
    expect(
      screen.getByRole('button', { name: /show out-of-stock \(2\)/i }),
    ).toBeInTheDocument();
  });

  it('toggle resets to false when selectedCategory changes', async () => {
    renderPOS();

    // Turn toggle on
    fireEvent.click(screen.getByRole('button', { name: /show out-of-stock/i }));
    expect(screen.getByText('Fish Fillet')).toBeInTheDocument();

    // Change category — click the first "Mains" tab button
    const mainsBtns = screen.getAllByRole('button', { name: 'Mains' });
    fireEvent.click(mainsBtns[0]);

    // Toggle should reset → out-of-stock items hidden
    await waitFor(() => {
      expect(screen.queryByText('Fish Fillet')).not.toBeInTheDocument();
    });
  });
});

describe('POSInterface — out-of-stock warning dialog', () => {
  beforeEach(() => mockAddToCart.mockClear());

  const showOutOfStockItems = () => {
    fireEvent.click(screen.getByRole('button', { name: /show out-of-stock/i }));
  };

  it('shows warning dialog when a stock=0 card is clicked', () => {
    renderPOS();
    showOutOfStockItems();

    fireEvent.click(screen.getByText('Fish Fillet'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Fish Fillet/)).toBeInTheDocument();
  });

  it('shows warning dialog when an isAvailable=false card is clicked', () => {
    renderPOS();
    showOutOfStockItems();

    fireEvent.click(screen.getByText('Seasonal Soup'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('"Add Anyway" calls addToCart with the product and closes the dialog', () => {
    renderPOS();
    showOutOfStockItems();
    fireEvent.click(screen.getByText('Fish Fillet'));

    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }));

    expect(mockAddToCart).toHaveBeenCalledWith(outOfStockProduct, 1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Cancel" does not call addToCart and closes the dialog', () => {
    renderPOS();
    showOutOfStockItems();
    fireEvent.click(screen.getByText('Fish Fillet'));

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockAddToCart).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dialog closes on Escape key press', () => {
    renderPOS();
    showOutOfStockItems();
    fireEvent.click(screen.getByText('Fish Fillet'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dialog has role="dialog" and aria-modal="true"', () => {
    renderPOS();
    showOutOfStockItems();
    fireEvent.click(screen.getByText('Fish Fillet'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
```

- [ ] **Step 2: Run tests to confirm all 22 fail**

```bash
npx vitest run __tests__/pos/stock-visibility.test.tsx --reporter verbose
```

Expected: 22 tests FAIL. Common failure modes:
- `Last 3` not found — badge not yet implemented
- `opacity-40` class not on card — dimming not yet implemented
- `role="dialog"` not found — warning dialog not yet implemented

If any test PASSES, stop and investigate — a passing test before implementation means the test is asserting the wrong thing.

- [ ] **Step 3: Commit the failing tests**

```bash
git add __tests__/pos/stock-visibility.test.tsx
git commit -m "test(pos): write 22 failing TDD tests for stock visibility"
```

---

## Task 3: Update `ProductCard.tsx`

Adds stock badge overlay, dims out-of-stock cards, makes `hover-lift` conditional, removes the legacy "Unavailable" pill.

**Files:**
- Modify: `components/pos/ProductCard.tsx`

**Before you start:** Read `components/pos/ProductCard.tsx` to orient yourself. Key lines:
- Line 7: `import { Plus } from "lucide-react"` — add `AlertTriangle, XCircle` here
- Line 48: card wrapper `className` — add conditional `opacity-40` and remove `hover-lift` from the static string
- Lines 52–58: quick-add button — add conditional `pointer-events-none opacity-0`
- Lines 60–100: image container — add stock badge inside here
- Lines 114–118: legacy "Unavailable" pill — **delete** entirely

- [ ] **Step 1: Run only the ProductCard tests to see them fail**

```bash
npx vitest run __tests__/pos/stock-visibility.test.tsx -t "ProductCard" --reporter verbose
```

Expected: 9 ProductCard tests FAIL.

- [ ] **Step 2: Update the imports**

Replace:
```typescript
import { Plus } from "lucide-react";
```
With:
```typescript
import { Plus, AlertTriangle, XCircle } from "lucide-react";
import { getStockStatus, isOutOfStock } from "@/lib/stock-utils";
import { cn } from "@/lib/utils";
```

- [ ] **Step 3: Add stock status derivation inside the component**

Inside `ProductCard`, after the `imageError` / `imageLoading` state declarations (around line 17), add:

```typescript
const stockStatus = getStockStatus(product.stock, product.lowStockThreshold);
const isOut = !product.isAvailable || isOutOfStock(product.stock);
const isLow = stockStatus === 'low' && !isOut;
```

- [ ] **Step 4: Update the card wrapper `className` to conditionally apply `opacity-40` and `hover-lift`**

Replace:
```typescript
className="group relative bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-2xl overflow-hidden border border-white/10 hover:border-emerald-500/50 transition-all duration-300 hover-lift cursor-pointer animate-fade-in"
```
With:
```typescript
className={cn(
  "group relative bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-2xl overflow-hidden border border-white/10 hover:border-emerald-500/50 transition-all duration-300 cursor-pointer animate-fade-in",
  !isOut && "hover-lift",
  isOut && "opacity-40",
)}
```

- [ ] **Step 5: Update the quick-add button `className`**

Replace:
```typescript
className="product-card-quick-add"
```
With:
```typescript
className={cn("product-card-quick-add", isOut && "pointer-events-none opacity-0")}
```

- [ ] **Step 6: Add stock badge inside the image container**

The image container div starts at line 61 (`<div className="product-card-image">`). Inside it, before the closing `</div>` of the image container (just above the Popular Badge comment), add the stock badges:

```tsx
{/* Stock Status Badge */}
{isOut && (
  <div className="absolute top-2 left-2 z-10 animate-in fade-in duration-300 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-red-500/20 text-red-400 border-red-500/30 backdrop-blur-sm">
    <XCircle className="w-3 h-3" />
    Out of Stock
  </div>
)}
{isLow && (
  <div className="absolute top-2 left-2 z-10 animate-in fade-in duration-300 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-500/20 text-amber-400 border-amber-500/30 backdrop-blur-sm">
    <AlertTriangle className="w-3 h-3" />
    Last {product.stock}
  </div>
)}
```

- [ ] **Step 7: Delete the legacy "Unavailable" pill**

Find and **delete** these lines entirely (around lines 114–118):
```tsx
{!product.isAvailable && (
  <span className="text-xs bg-rose-500/20 text-rose-400 px-2 py-1 rounded-full border border-rose-500/20">
    Unavailable
  </span>
)}
```

- [ ] **Step 8: Run ProductCard tests to verify they now pass**

```bash
npx vitest run __tests__/pos/stock-visibility.test.tsx -t "ProductCard" --reporter verbose
```

Expected: All 9 ProductCard tests PASS.

- [ ] **Step 9: Commit**

```bash
git add components/pos/ProductCard.tsx
git commit -m "feat(pos): add stock badges, dimming, and hover-lift fix to ProductCard"
```

---

## Task 4: Update `POSInterface.tsx`

Adds sort logic (out-of-stock sinks to bottom), `showOutOfStock` toggle pill, and inline warning dialog.

**Files:**
- Modify: `components/pos/POSInterface.tsx`

**Before you start:** Read `components/pos/POSInterface.tsx` to orient yourself. Key landmarks:
- Line 5: React imports — add `useCallback` if desired (optional optimisation)
- Line 14: Lucide imports — add `AlertTriangle`
- Lines 52–62: local state declarations — add two new states here
- Lines 92–119: realtime subscription `useEffect` — leave completely untouched
- Lines 126–148: `filteredProducts` useMemo — add `sorted` and `visibleProducts` memos after this
- Lines 387–400: Desktop category tabs — add toggle pill after this block
- Lines 403–424: Products grid `<div>` — change `filteredProducts.map` → `visibleProducts.map`
- End of component return, before the final `</div>` — add warning dialog

- [ ] **Step 1: Run only the POSInterface tests to see them fail**

```bash
npx vitest run __tests__/pos/stock-visibility.test.tsx -t "POSInterface" --reporter verbose
```

Expected: 13 POSInterface tests FAIL.

- [ ] **Step 2: Add `isOutOfStock` and `AlertTriangle` to imports**

Find the existing import:
```typescript
import { Search, Grid, List, LayoutDashboard, LogOut, Menu, X, CreditCard } from "lucide-react";
```
Replace with:
```typescript
import { Search, Grid, List, LayoutDashboard, LogOut, Menu, X, CreditCard, AlertTriangle } from "lucide-react";
```

Add a new import line after the `ProductCard` import:
```typescript
import { isOutOfStock } from "@/lib/stock-utils";
```

- [ ] **Step 3: Add `showOutOfStock` and `outOfStockItem` state**

In the local UI state section (around lines 52–62, after `const [isAddToTabModalOpen, setIsAddToTabModalOpen] = useState(false);`), add:

```typescript
const [showOutOfStock, setShowOutOfStock] = useState(false);
const [outOfStockItem, setOutOfStockItem] = useState<Product | null>(null);
```

- [ ] **Step 4: Add a `useEffect` to reset the toggle when `selectedCategory` changes**

Add this `useEffect` after the existing `useEffect` that syncs the URL param (around line 83):

```typescript
// Reset out-of-stock toggle when category changes
useEffect(() => {
    setShowOutOfStock(false);
}, [selectedCategory]);
```

- [ ] **Step 5: Add `sorted` and `visibleProducts` memos after `filteredProducts`**

After the `filteredProducts` useMemo (which ends around line 148), add:

```typescript
// Sort: out-of-stock and unavailable items sink to the bottom
const sorted = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
        const aOut = !a.isAvailable || (a.stock !== undefined && a.stock === 0);
        const bOut = !b.isAvailable || (b.stock !== undefined && b.stock === 0);
        if (aOut === bOut) return 0;
        return aOut ? 1 : -1;
    });
}, [filteredProducts]);

// Apply show/hide filter (only when toggle is off)
const visibleProducts = useMemo(() => {
    if (showOutOfStock) return sorted;
    return sorted.filter(
        (item) => item.isAvailable !== false && (item.stock === undefined || item.stock > 0),
    );
}, [sorted, showOutOfStock]);

// Count of items currently hidden by the toggle
const hiddenOutOfStockCount = useMemo(() => {
    return sorted.filter(
        (item) => !item.isAvailable || (item.stock !== undefined && item.stock === 0),
    ).length;
}, [sorted]);
```

- [ ] **Step 6: Replace the products grid block (empty state + map) with `visibleProducts`**

Find the **entire conditional block** starting at `{filteredProducts.length === 0 ? (` (around line 404) and ending at the closing `)}` of the ternary. Replace the whole block:

```tsx
{filteredProducts.length === 0 ? (
    <div className="flex items-center justify-center h-full text-neutral-500">
        <div className="text-center space-y-4">
            <div className="text-6xl opacity-50">🍽️</div>
            <p className="text-lg">No products available in this category</p>
        </div>
    </div>
) : (
    <div className="product-grid">
        {filteredProducts.map((product, index) => (
            <ProductCard
                key={product.$id}
                product={product}
                onAdd={(p) => addToCart(p, 1)}
                onView={(p) => setSelectedProduct(p)}
                priority={index < 6}
            />
        ))}
    </div>
)}
```

With:

```tsx
{visibleProducts.length === 0 ? (
    <div className="flex items-center justify-center h-full text-neutral-500">
        <div className="text-center space-y-4">
            <div className="text-6xl opacity-50">🍽️</div>
            <p className="text-lg">No products available in this category</p>
        </div>
    </div>
) : (
    <div className="product-grid">
        {visibleProducts.map((product, index) => (
            <ProductCard
                key={product.$id}
                product={product}
                onAdd={(p) => {
                    const isOut = !p.isAvailable || isOutOfStock(p.stock);
                    if (isOut) {
                        setOutOfStockItem(p);
                    } else {
                        addToCart(p, 1);
                    }
                }}
                onView={(p) => {
                    const isOut = !p.isAvailable || isOutOfStock(p.stock);
                    if (isOut) {
                        setOutOfStockItem(p);
                    } else {
                        setSelectedProduct(p);
                    }
                }}
                priority={index < 6}
            />
        ))}
    </div>
)}
```

> **Important:** The outer condition changes from `filteredProducts.length === 0` to `visibleProducts.length === 0`. This ensures the "No products available" empty-state also appears when all items in a category are out-of-stock and the toggle is off.

- [ ] **Step 7: Add the show/hide toggle pill**

Find the desktop category tabs block (ends around line 400):
```tsx
                </div>
            </div>

                {/* Products Grid */}
```

Between the category tabs closing tag and the Products Grid comment, insert:

```tsx
                {/* Show / Hide Out-of-Stock Toggle */}
                {(hiddenOutOfStockCount > 0 || showOutOfStock) && (
                    <div className="hidden md:flex px-8 py-2 justify-end">
                        <button
                            onClick={() => setShowOutOfStock((prev) => !prev)}
                            aria-label={
                                showOutOfStock
                                    ? 'Hide out-of-stock'
                                    : `Show out-of-stock (${hiddenOutOfStockCount})`
                            }
                            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-150 cursor-pointer select-none"
                        >
                            {showOutOfStock
                                ? 'Hide out-of-stock'
                                : `Show out-of-stock (${hiddenOutOfStockCount})`}
                        </button>
                    </div>
                )}
```

> **Note on the test:** The test uses `screen.getByRole('button', { name: /show out-of-stock/i })`. Because jsdom does not evaluate media query breakpoints, `hidden md:flex` classes are meaningless in tests — the element is always in the DOM. The `aria-label` attribute provides the accessible name the test queries.

- [ ] **Step 8: Add the warning dialog**

Find the `{/* Settle Table Tab Modal */}` comment near the bottom of the component return. Add the warning dialog **before** that comment:

```tsx
            {/* Out-of-Stock Warning Dialog */}
            {outOfStockItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="oos-dialog-title"
                        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                        onKeyDown={(e) => e.key === 'Escape' && setOutOfStockItem(null)}
                    >
                        <h2
                            id="oos-dialog-title"
                            className="text-white font-semibold text-lg flex items-center gap-2"
                        >
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                            Out of Stock
                        </h2>
                        <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                            <span className="text-white font-medium">
                                &ldquo;{outOfStockItem.name}&rdquo;
                            </span>{' '}
                            is currently out of stock. Adding it to the cart may not be
                            fulfillable.
                        </p>
                        <div className="flex gap-3 mt-6">
                            <button
                                autoFocus
                                onClick={() => setOutOfStockItem(null)}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-medium transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    addToCart(outOfStockItem, 1);
                                    setOutOfStockItem(null);
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 text-sm font-medium transition"
                            >
                                Add Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
```

- [ ] **Step 9: Run all POSInterface tests to verify they pass**

```bash
npx vitest run __tests__/pos/stock-visibility.test.tsx -t "POSInterface" --reporter verbose
```

Expected: All 13 POSInterface tests PASS.

If the toggle tests fail, check:
- The `aria-label` on the toggle button — test uses `/show out-of-stock/i`
- `hiddenOutOfStockCount` calculation — must count both `stock === 0` AND `!isAvailable` items

If the dialog tests fail, check:
- The `onView` / `onAdd` callbacks in the ProductCard render — both must call `setOutOfStockItem`
- The `role="dialog"` attribute on the inner div, not the backdrop

- [ ] **Step 10: Commit**

```bash
git add components/pos/POSInterface.tsx
git commit -m "feat(pos): add stock sort, show/hide toggle, and out-of-stock warning dialog"
```

---

## Task 5: Full test suite verification

- [ ] **Step 1: Run the full stock-visibility test file**

```bash
npx vitest run __tests__/pos/stock-visibility.test.tsx --reporter verbose
```

Expected: **22 tests PASS, 0 fail.**

- [ ] **Step 2: Run the full test suite to check for regressions**

```bash
npx vitest run --reporter verbose
```

Expected: All previously passing tests still pass. No new failures.

If regressions appear:
- `product.stock` or `product.lowStockThreshold` referenced without optional chaining → add `?.`
- `cn` import missing from a file → add it
- Existing tests that checked for the "Unavailable" pill text → those tests were wrong and should be updated (the pill was removed by design)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: POS Stock Visibility — badges, sort, toggle, warning dialog (Sub-project 3)"
```
