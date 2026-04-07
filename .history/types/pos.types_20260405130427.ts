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
  // Stock tracking (undefined = untracked — no badge shown)
  stock?: number;
  lowStockThreshold?: number;  // defaults to 5 when absent from Appwrite doc
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
    // Soft delete fields for audit trail
    isDeleted?: boolean;
    deletedAt?: string;
    deletedBy?: string; // Clerk user ID
    deletionReason?: string;
    $createdAt: string;
    $updatedAt: string;
}

/**
 * Expense Types for Input VAT Tracking
 * Used to capture supplier invoices and purchases for input VAT recovery
 */
export interface Expense {
  $id: string;
  expenseNumber: string;
  supplierName: string;
  supplierTin?: string;  // Supplier's Tax Identification Number
  category: ExpenseCategory;
  description: string;
  amount: number;  // Subtotal before VAT
  vatAmount: number;  // Input VAT amount
  totalAmount: number;  // Total including VAT
  invoiceNumber: string;  // Supplier's invoice number
  invoiceDate: string;
  paymentStatus: 'pending' | 'paid' | 'cancelled';
  paymentDate?: string;
  receiptUrl?: string | null;
  // VAT categorization
  vatCategory: 'standard' | 'zero-rated' | 'exempt';
  vatRate: number;  // VAT rate on the expense
  // Audit fields
  $createdAt: string;
  $updatedAt: string;
}

export type ExpenseCategory = 
  | 'food_supplies'
  | 'beverages'
  | 'equipment'
  | 'utilities'
  | 'rent'
  | 'marketing'
  | 'professional_services'
  | 'maintenance'
  | 'transport'
  | 'other';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  'food_supplies': 'Food Supplies',
  'beverages': 'Beverages',
  'equipment': 'Equipment',
  'utilities': 'Utilities',
  'rent': 'Rent',
  'marketing': 'Marketing & Advertising',
  'professional_services': 'Professional Services',
  'maintenance': 'Maintenance & Repairs',
  'transport': 'Transport & Logistics',
  'other': 'Other Expenses',
};

/**
 * eTIMS API Types for KRA Integration
 * Reference: https://api.developer.go.ke/etims-oscu/api/v1
 */
export interface ETIMSConfig {
  apiUrl: string;        // eTIMS API base URL
  cmcKey: string;       // Device registration key
  deviceSerial: string; // OSCU/VSCU device serial number
  certificate?: string; // SSL certificate for production
  isProduction: boolean;
}

export interface ETIMSInvoicePayload {
  // Header Information
  invoiceType: 'EC' | 'EI' | 'EF' | 'EN';  // E-commerce, Import, Export, Normal
  invoiceNo: string;
  invoiceDate: string;
  customerTin: string;
  customerName: string;
  customerMobile?: string;
  customerAddress?: string;
  
  // Financial Details
  subtotal: number;
  totalDiscount?: number;
  totalTax: number;
  totalAmount: number;
  
  // VAT Breakdown (15 tax fields for KRA compliance)
  taxDetails: {
    taxType: 'A' | 'B' | 'C' | 'D' | 'E';  // A=Standard, B=Zero, C=Exempt, D=Excise, E=Withholding
    taxTypeName: string;
    taxblAmtA: number;  // Taxable amount
    taxRtA: number;     // Tax rate
    taxAmtA: number;   // Tax amount
  }[];
  
  // Line Items
  items: ETIMSLineItem[];
  
  // Payment Info
  paymentInfo?: {
    method: 'CASH' | 'CARD' | 'MPESA' | 'BANK' | 'OTHER';
    amount: number;
    reference?: string;
  };
  
  // Metadata
  branchId?: string;
  cashierName?: string;
  remarks?: string;
}

export interface ETIMSLineItem {
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  taxType: 'A' | 'B' | 'C' | 'D' | 'E';
  totalAmount: number;
}

export interface ETIMSResponse {
  success: boolean;
  invoiceNo?: string;
  qrCode?: string;
  signature?: string;
  timestamp?: string;
  error?: string;
  errorCode?: string;
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

// ─── Admin CMS Types ──────────────────────────────────────────────────────────

export interface MenuItem {
  $id: string
  name: string
  price: number
  stock: number
  lowStockThreshold: number
  isAvailable: boolean
  category: string
  imageUrl?: string
  vatCategory: VatCategory
  description?: string
  preparationTime?: number
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
  defaultOptionIndex: number
  options: string[]
  createdAt: string
}
