"use server";

import { databases, DATABASE_ID, EXPENSES_COLLECTION_ID } from "@/lib/appwrite.config";
import { Query, ID } from "node-appwrite";
import { parseStringify } from "@/lib/utils";
import { Expense, ExpenseCategory } from "@/types/pos.types";

/**
 * Generate a unique expense number
 */
function generateExpenseNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `EXP-${dateStr}-${random}`;
}

/**
 * Calculate VAT for an expense
 */
function calculateExpenseVat(amount: number, vatCategory: string): {
  vatAmount: number;
  totalAmount: number;
  vatRate: number;
} {
  let vatRate: number = 16; // Default to Kenya standard rate
  if (vatCategory === 'zero-rated' || vatCategory === 'exempt') {
    vatRate = 0;
  }
  
  const vatAmount = Math.round(amount * (vatRate / 100) * 100) / 100;
  const totalAmount = amount + vatAmount;
  
  return {
    vatAmount,
    totalAmount,
    vatRate,
  };
}

/**
 * Create a new expense record
 */
export async function createExpense(data: {
  supplierName: string;
  supplierTin?: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  vatCategory?: 'standard' | 'zero-rated' | 'exempt';
  invoiceNumber: string;
  invoiceDate: string;
  receiptUrl?: string | null;
}): Promise<{ success: boolean; expense?: Expense; error?: string }> {
  try {
    if (!DATABASE_ID || !EXPENSES_COLLECTION_ID) {
      return { success: false, error: 'Database configuration missing' };
    }

    const vatCategory = data.vatCategory || 'standard';
    const { vatAmount, totalAmount, vatRate } = calculateExpenseVat(data.amount, vatCategory);

    const expenseData = {
      expenseNumber: generateExpenseNumber(),
      supplierName: data.supplierName,
      supplierTin: data.supplierTin || '',
      category: data.category,
      description: data.description,
      amount: data.amount,
      vatAmount,
      totalAmount,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: data.invoiceDate,
      paymentStatus: 'pending',
      vatCategory,
      vatRate,
      receiptUrl: data.receiptUrl || null,
    };

    const result = await databases.createDocument(
      DATABASE_ID,
      EXPENSES_COLLECTION_ID,
      ID.unique(),
      expenseData
    );

    return {
      success: true,
      expense: parseStringify(result) as Expense,
    };
  } catch (error) {
    console.error('Error creating expense:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create expense',
    };
  }
}

/**
 * Get all expenses with optional filters
 */
export async function getExpenses(options?: {
  startDate?: string;
  endDate?: string;
  category?: ExpenseCategory;
  paymentStatus?: 'pending' | 'paid' | 'cancelled';
  limit?: number;
}): Promise<{ success: boolean; expenses?: Expense[]; error?: string }> {
  try {
    console.log('[getExpenses] Fetching expenses with options:', options);
    
    if (!DATABASE_ID || !EXPENSES_COLLECTION_ID) {
      console.error('[getExpenses] Missing config:', { DATABASE_ID, EXPENSES_COLLECTION_ID });
      return { success: false, error: 'Database configuration missing' };
    }

    const queries = [
      Query.orderDesc('$createdAt'),
      Query.limit(options?.limit || 100),
    ];

    if (options?.startDate) {
      queries.push(Query.greaterThanEqual('invoiceDate', options.startDate));
    }

    if (options?.endDate) {
      queries.push(Query.lessThanEqual('invoiceDate', options.endDate));
    }

    if (options?.category) {
      queries.push(Query.equal('category', options.category));
    }

    if (options?.paymentStatus) {
      queries.push(Query.equal('paymentStatus', options.paymentStatus));
    }

    const result = await databases.listDocuments(
      DATABASE_ID,
      EXPENSES_COLLECTION_ID,
      queries
    );

    return {
      success: true,
      expenses: result.documents as unknown as Expense[],
    };
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch expenses',
    };
  }
}

/**
 * Get input VAT summary for a period
 */
export async function getInputVatSummary(options: {
  startDate: string;
  endDate: string;
}): Promise<{
  success: boolean;
  summary?: {
    totalExpenses: number;
    totalInputVat: number;
    byCategory: Record<ExpenseCategory, { amount: number; vat: number }>;
    byVatCategory: {
      standard: number;
      zeroRated: number;
      exempt: number;
    };
  };
  error?: string;
}> {
  try {
    const result = await getExpenses({
      startDate: options.startDate,
      endDate: options.endDate,
      paymentStatus: 'paid', // Only paid expenses qualify for input VAT
    });

    if (!result.success || !result.expenses) {
      return { success: false, error: result.error };
    }

    const expenses = result.expenses;
    
    let totalExpenses = 0;
    let totalInputVat = 0;
    
    const byCategory: Record<ExpenseCategory, { amount: number; vat: number }> = {
      'food_supplies': { amount: 0, vat: 0 },
      'beverages': { amount: 0, vat: 0 },
      'equipment': { amount: 0, vat: 0 },
      'utilities': { amount: 0, vat: 0 },
      'rent': { amount: 0, vat: 0 },
      'marketing': { amount: 0, vat: 0 },
      'professional_services': { amount: 0, vat: 0 },
      'maintenance': { amount: 0, vat: 0 },
      'transport': { amount: 0, vat: 0 },
      'other': { amount: 0, vat: 0 },
    };
    
    const byVatCategory = {
      standard: 0,
      zeroRated: 0,
      exempt: 0,
    };

    for (const expense of expenses) {
      const amount = expense.amount || 0;
      const vat = expense.vatAmount || 0;
      
      totalExpenses += amount;
      totalInputVat += vat;
      
      // Aggregate by expense category
      if (byCategory[expense.category]) {
        byCategory[expense.category].amount += amount;
        byCategory[expense.category].vat += vat;
      }
      
      // Aggregate by VAT category
      if (expense.vatCategory === 'standard') {
        byVatCategory.standard += vat;
      } else if (expense.vatCategory === 'zero-rated') {
        byVatCategory.zeroRated += vat;
      } else if (expense.vatCategory === 'exempt') {
        byVatCategory.exempt += vat;
      }
    }

    return {
      success: true,
      summary: {
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalInputVat: Math.round(totalInputVat * 100) / 100,
        byCategory,
        byVatCategory,
      },
    };
  } catch (error) {
    console.error('Error calculating input VAT summary:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate input VAT',
    };
  }
}

/**
 * Update expense payment status
 */
export async function updateExpensePayment(
  expenseId: string,
  status: 'pending' | 'paid' | 'cancelled',
  paymentDate?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!DATABASE_ID || !EXPENSES_COLLECTION_ID) {
      return { success: false, error: 'Database configuration missing' };
    }

    const updateData: Record<string, any> = {
      paymentStatus: status,
    };

    if (status === 'paid' && paymentDate) {
      updateData.paymentDate = paymentDate;
    }

    await databases.updateDocument(
      DATABASE_ID,
      EXPENSES_COLLECTION_ID,
      expenseId,
      updateData
    );

    return { success: true };
  } catch (error) {
    console.error('Error updating expense:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update expense',
    };
  }
}

/**
 * Delete an expense
 */
export async function deleteExpense(
  expenseId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!DATABASE_ID || !EXPENSES_COLLECTION_ID) {
      return { success: false, error: 'Database configuration missing' };
    }

    await databases.deleteDocument(
      DATABASE_ID,
      EXPENSES_COLLECTION_ID,
      expenseId
    );

    return { success: true };
  } catch (error) {
    console.error('Error deleting expense:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete expense',
    };
  }
}

/**
 * Update an existing expense record
 */
export async function updateExpense(expenseId: string, data: Partial<{
  supplierName: string;
  supplierTin: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  vatCategory: 'standard' | 'zero-rated' | 'exempt';
  invoiceNumber: string;
  invoiceDate: string;
  receiptUrl: string | null;
  paymentStatus: 'pending' | 'paid' | 'cancelled';
}>): Promise<{ success: boolean; error?: string }> {
  try {
    if (!DATABASE_ID || !EXPENSES_COLLECTION_ID) {
      return { success: false, error: 'Database configuration missing' };
    }

    const updateData: any = { ...data };

    if (data.amount !== undefined || data.vatCategory !== undefined) {
      // Re-calculate VAT if amount or vatCategory changes
      const current = await databases.getDocument(DATABASE_ID, EXPENSES_COLLECTION_ID, expenseId);
      const amount = data.amount ?? current.amount;
      const vatCat = data.vatCategory ?? current.vatCategory;
      let vatRate = 16;
      if (vatCat === 'zero-rated' || vatCat === 'exempt') vatRate = 0;
      const vatAmount = Math.round(amount * (vatRate / 100) * 100) / 100;
      const totalAmount = amount + vatAmount;

      updateData.vatAmount = vatAmount;
      updateData.totalAmount = totalAmount;
      updateData.vatRate = vatRate;
    }

    await databases.updateDocument(
      DATABASE_ID,
      EXPENSES_COLLECTION_ID,
      expenseId,
      updateData
    );

    return { success: true };
  } catch (error) {
    console.error('Error updating expense:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update expense',
    };
  }
}
