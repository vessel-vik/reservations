// VAT Types for Kenya Compliance
export type VatCategory = 'standard' | 'zero-rated' | 'exempt';

// Kenya VAT Rates
export const VAT_RATES = {
  STANDARD: 16,      // Standard rate - 16%
  ZERO_RATED: 0,     // Zero rated - 0% (e.g., exports)
  EXEMPT: 0,        // Exempt - 0% (e.g., healthcare, education)
} as const;

export const VAT_CATEGORY_LABELS: Record<VatCategory, string> = {
  'standard': 'Standard Rated (16%)',
  'zero-rated': 'Zero Rated (0%)',
  'exempt': 'Exempt (0%)',
};

export interface Product {
  $id: string;
  name: string;
  description: string;
  price: number;
  category: Category | string; // Can be expanded object or just ID
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
  // VAT categorization for Kenya compliance
  vatCategory?: VatCategory;  // Per-item VAT classification
  vatRate?: number;           // Override default 16% if needed
}

export interface CartItem extends Product {
  quantity: number;
  notes?: string;
}

export interface Order {
    $id: string;
    orderNumber: string;
    type: string;
    status: string;
    tableNumber?: number;
    customerName: string;
    guestCount: number;
    waiterName: string; // Added for server tracking
    waiterId?: string; // Clerk user ID for dashboard filtering
    subtotal: number;
    taxAmount: number;
    serviceCharge: number;
    discountAmount: number;
    tipAmount: number;
    totalAmount: number;
    paymentStatus: string;
    orderTime: string; // Added for timestamp
    priority: string;
    items: CartItem[];
    specialInstructions?: string;
    // Optional settlement/payment metadata for advanced POS flows
    settlementType?: string; // e.g. 'table_tab_master' | 'table_tab_child'
    settlementParentOrderId?: string;
    settledOrderIds?: string[];
    paymentMethods?: any[];
    // VAT fields for Kenya compliance
    vatCategory?: VatCategory;        // Order-level VAT category
    vatRate?: number;                 // VAT rate applied (default 16%)
    outputVatAmount?: number;         // Output VAT collected (calculated)
    outputVatBreakdown?: {           // Breakdown by VAT category
        standard: number;
        zeroRated: number;
        exempt: number;
    };
    // Input VAT for expenses (if tracking supplier invoices)
    inputVatAmount?: number;
    inputVatSupplier?: string;
    // eTIMS compliance
    eTIMSInvoiceId?: string;
    eTIMSSubmissionDate?: string;
    $createdAt: string;
    $updatedAt: string;
}

export interface Category {
  $id: string;
  name: string; // e.g., 'appetizers', 'mains', 'drinks'
  label: string; // Display name
  slug: string;
  icon?: string;
  index: number;
  parentId?: string;
  isActive: boolean;
}

