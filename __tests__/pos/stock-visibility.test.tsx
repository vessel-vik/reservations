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
