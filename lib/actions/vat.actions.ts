"use server";

import { databases, DATABASE_ID, ORDERS_COLLECTION_ID } from "@/lib/appwrite.config";
import { Query } from "node-appwrite";
import { parseStringify } from "@/lib/utils";
import { Order, VatCategory, VAT_RATES } from "@/types/pos.types";
import { getInputVatSummary } from "./expense.actions";

/**
 * Kenya VAT Report Types
 */
export interface VatReportInput {
  startDate: string;
  endDate: string;
  branchId?: string;
}

export interface VatReportOutput {
  period: {
    startDate: string;
    endDate: string;
  };
  salesSummary: {
    totalSales: number;
    totalVatCollected: number;
    totalServiceCharge: number;
  };
  vatBreakdown: {
    standard: {
      sales: number;
      vat: number;
    };
    zeroRated: {
      sales: number;
      vat: number;
    };
    exempt: {
      sales: number;
      vat: number;
    };
  };
  inputVat: {
    total: number;
    entries: {
      supplier: string;
      amount: number;
      vat: number;
      invoiceRef: string;
      date: string;
    }[];
  };
  netVatPayable: number;
  transactionCount: number;
  eTIMSFormat: ETIMSInvoice[];
}

export interface ETIMSInvoice {
  invoiceType: string;
  invoiceNo: string;
  invoiceDate: string;
  customerTin?: string;
  customerName?: string;
  items: {
    itemName: string;
    quantity: number;
    unitPrice: number;
    total: number;
    vatCategory: string;
    vatRate: number;
    vatAmount: number;
  }[];
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
}

/**
 * Generate VAT Remittance Report for a given period
 * This report calculates output VAT from sales and optionally includes input VAT from expenses
 */
export async function generateVatRemittanceReport(
  input: VatReportInput
): Promise<{ success: boolean; report?: VatReportOutput; error?: string }> {
  try {
    const { startDate, endDate, branchId } = input;

    // Parse dates
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Fetch all paid orders in the period
    // Exclude settled/child orders to avoid double-counting
    const response = await databases.listDocuments(
      DATABASE_ID!,
      ORDERS_COLLECTION_ID!,
      [
        Query.greaterThanEqual('$createdAt', start.toISOString()),
        Query.lessThanEqual('$createdAt', end.toISOString()),
        Query.equal('status', 'paid'),
        Query.notEqual('paymentStatus', 'settled'), // Exclude child orders
        Query.orderDesc('$createdAt'),
        Query.limit(10000),
      ]
    );

    const orders = response.documents as unknown as Order[];

    // Initialize VAT breakdown
    const vatBreakdown = {
      standard: { sales: 0, vat: 0 },
      zeroRated: { sales: 0, vat: 0 },
      exempt: { sales: 0, vat: 0 },
    };

    let totalSales = 0;
    let totalVatCollected = 0;
    let totalServiceCharge = 0;
    const eTIMSInvoices: ETIMSInvoice[] = [];

    // Process each order
    for (const order of orders) {
      // Use order-level VAT category or default to standard
      const vatCategory = order.vatCategory || 'standard';
      const vatRate = order.vatRate || VAT_RATES.STANDARD;
      
      // Calculate VAT for this order
      // VAT = subtotal * (vatRate / 100)
      const orderSubtotal = order.subtotal || 0;
      const orderVat = order.taxAmount || (orderSubtotal * (vatRate / 100));
      const orderServiceCharge = order.serviceCharge || 0;
      const orderTotal = order.totalAmount || orderSubtotal + orderVat + orderServiceCharge;

      // Add to totals
      totalSales += orderSubtotal;
      totalVatCollected += orderVat;
      totalServiceCharge += orderServiceCharge;

      // Add to VAT breakdown by category
      if (vatCategory === 'standard') {
        vatBreakdown.standard.sales += orderSubtotal;
        vatBreakdown.standard.vat += orderVat;
      } else if (vatCategory === 'zero-rated') {
        vatBreakdown.zeroRated.sales += orderSubtotal;
        vatBreakdown.zeroRated.vat += orderVat; // Should be 0
      } else if (vatCategory === 'exempt') {
        vatBreakdown.exempt.sales += orderSubtotal;
        vatBreakdown.exempt.vat += orderVat; // Should be 0
      }

      // Generate eTIMS format for each invoice
      const items = Array.isArray(order.items) ? order.items : [];
      const eTIMSItems = items.map((item: any) => {
        const itemVatRate = item.vatRate || VAT_RATES.STANDARD;
        const itemSubtotal = (item.price || 0) * (item.quantity || 1);
        const itemVat = itemSubtotal * (itemVatRate / 100);
        
        return {
          itemName: item.name || 'Unknown Item',
          quantity: item.quantity || 1,
          unitPrice: item.price || 0,
          total: itemSubtotal,
          vatCategory: item.vatCategory || vatCategory,
          vatRate: itemVatRate,
          vatAmount: Math.round(itemVat * 100) / 100,
        };
      });

      eTIMSInvoices.push({
        invoiceType: 'EC', // E-commerce invoice
        invoiceNo: order.orderNumber,
        invoiceDate: order.orderTime || order.$createdAt,
        customerTin: 'A0000000000', // Default for walk-in customer
        customerName: order.customerName || 'Walk-in Customer',
        items: eTIMSItems,
        subtotal: orderSubtotal,
        vatAmount: Math.round(orderVat * 100) / 100,
        totalAmount: Math.round(orderTotal * 100) / 100,
      });
    }

    // Fetch input VAT from expenses (only paid expenses qualify)
    let inputVat = {
      total: 0,
      entries: [] as { supplier: string; amount: number; vat: number; invoiceRef: string; date: string }[],
    };

    try {
      const expenseResult = await getInputVatSummary({
        startDate,
        endDate,
      });
      
      if (expenseResult.success && expenseResult.summary) {
        inputVat.total = expenseResult.summary.totalInputVat;
      }
    } catch (expenseError) {
      console.warn('Could not fetch expense data for VAT report:', expenseError);
      // Continue without input VAT - this is not critical
    }

    // Calculate net VAT payable (output VAT - input VAT)
    const netVatPayable = totalVatCollected - inputVat.total;

    const report: VatReportOutput = {
      period: {
        startDate: startDate,
        endDate: endDate,
      },
      salesSummary: {
        totalSales: Math.round(totalSales * 100) / 100,
        totalVatCollected: Math.round(totalVatCollected * 100) / 100,
        totalServiceCharge: Math.round(totalServiceCharge * 100) / 100,
      },
      vatBreakdown: {
        standard: {
          sales: Math.round(vatBreakdown.standard.sales * 100) / 100,
          vat: Math.round(vatBreakdown.standard.vat * 100) / 100,
        },
        zeroRated: {
          sales: Math.round(vatBreakdown.zeroRated.sales * 100) / 100,
          vat: Math.round(vatBreakdown.zeroRated.vat * 100) / 100,
        },
        exempt: {
          sales: Math.round(vatBreakdown.exempt.sales * 100) / 100,
          vat: Math.round(vatBreakdown.exempt.vat * 100) / 100,
        },
      },
      inputVat,
      netVatPayable: Math.round(netVatPayable * 100) / 100,
      transactionCount: orders.length,
      eTIMSFormat: eTIMSInvoices,
    };

    return {
      success: true,
      report,
    };
  } catch (error) {
    console.error('Error generating VAT report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate VAT report',
    };
  }
}

/**
 * Generate summary VAT data for a specific month
 * Convenience function for quick VAT overview
 */
export async function getMonthlyVatSummary(
  year: number,
  month: number
): Promise<{
  success: boolean;
  summary?: {
    month: string;
    totalSales: number;
    vatCollected: number;
    transactionCount: number;
  };
  error?: string;
}> {
  try {
    // Calculate start and end of month
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const result = await generateVatRemittanceReport({
      startDate,
      endDate,
    });

    if (!result.success || !result.report) {
      return {
        success: false,
        error: result.error || 'Failed to generate report',
      };
    }

    return {
      success: true,
      summary: {
        month: new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
        totalSales: result.report.salesSummary.totalSales,
        vatCollected: result.report.salesSummary.totalVatCollected,
        transactionCount: result.report.transactionCount,
      },
    };
  } catch (error) {
    console.error('Error getting monthly VAT summary:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get monthly summary',
    };
  }
}

/**
 * Export VAT report in iTax-compatible JSON format
 * This format can be uploaded to KRA iTax portal
 */
export async function exportVatReportForITax(
  input: VatReportInput
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const result = await generateVatRemittanceReport(input);

    if (!result.success || !result.report) {
      return {
        success: false,
        error: result.error || 'Failed to generate report',
      };
    }

    // Format for KRA iTax VAT Return
    const iTaxFormat = {
      returnType: 'VAT',
      period: {
        startDate: result.report.period.startDate,
        endDate: result.report.period.endDate,
      },
      outputVat: {
        standardRatedSales: result.report.vatBreakdown.standard.sales,
        standardRatedVat: result.report.vatBreakdown.standard.vat,
        zeroRatedSales: result.report.vatBreakdown.zeroRated.sales,
        zeroRatedVat: result.report.vatBreakdown.zeroRated.vat,
        exemptSales: result.report.vatBreakdown.exempt.sales,
        exemptVat: result.report.vatBreakdown.exempt.vat,
        totalOutputVat: result.report.salesSummary.totalVatCollected,
      },
      inputVat: {
        totalInputVat: result.report.inputVat.total,
        entries: result.report.inputVat.entries,
      },
      netVatPayable: result.report.netVatPayable,
      totalSales: result.report.salesSummary.totalSales,
      transactionCount: result.report.transactionCount,
      submissionDate: new Date().toISOString(),
      // Include eTIMS data for detailed audit trail
      eTIMSDocuments: result.report.eTIMSFormat,
    };

    return {
      success: true,
      data: iTaxFormat,
    };
  } catch (error) {
    console.error('Error exporting VAT report for iTax:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export report',
    };
  }
}

/**
 * Check VAT filing deadline (20th of following month for Kenya)
 */
export function getVatFilingDeadline(year: number, month: number): Date {
  // VAT is due by 20th of the following month
  return new Date(year, month, 20);
}

/**
 * Calculate potential penalty for late filing
 * 5% penalty + 1% interest per month (KRA standard)
 */
export function calculateLateFilingPenalty(
  vatAmount: number,
  daysLate: number
): {
  penalty: number;
  interest: number;
  total: number;
} {
  if (daysLate <= 0) {
    return { penalty: 0, interest: 0, total: 0 };
  }

  // 5% penalty on VAT amount
  const penalty = vatAmount * 0.05;
  
  // 1% interest per month (pro-rata for partial months)
  const monthsLate = daysLate / 30;
  const interest = vatAmount * 0.01 * Math.ceil(monthsLate);

  return {
    penalty: Math.round(penalty * 100) / 100,
    interest: Math.round(interest * 100) / 100,
    total: Math.round((penalty + interest) * 100) / 100,
  };
}
