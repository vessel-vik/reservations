"use server";

/**
 * eTIMS Validation & Test Utilities
 * 
 * This module provides:
 * - JSON schema validation for eTIMS payloads
 * - Sandbox testing utilities
 * - Error handling helpers
 * - Connection diagnostics
 */

import { ETIMSInvoicePayload, ETIMSResponse } from "@/types/pos.types";
import { testETIMSConnection, submitInvoiceToETIMS } from "./etims.actions";

/**
 * Validate required fields in eTIMS invoice payload
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

/**
 * KRA eTIMS Field Requirements (as of current documentation)
 */
const REQUIRED_HEADER_FIELDS = [
  'invoiceType',
  'invoiceNo', 
  'invoiceDate',
  'customerTin',
  'customerName',
  'subtotal',
  'totalTax',
  'totalAmount',
] as const;

const VALID_INVOICE_TYPES = ['EC', 'EI', 'EF', 'EN'] as const;
const VALID_TAX_TYPES = ['A', 'B', 'C', 'D', 'E'] as const;
const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'MPESA', 'BANK', 'OTHER'] as const;

/**
 * Validate eTIMS invoice payload against KRA requirements
 */
export function validateETIMSPayload(invoice: ETIMSInvoicePayload): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate header fields
  for (const field of REQUIRED_HEADER_FIELDS) {
    const value = invoice[field as keyof ETIMSInvoicePayload];
    
    if (value === undefined || value === null || value === '') {
      errors.push({
        field,
        message: `Required field "${field}" is missing or empty`,
        code: 'MISSING_REQUIRED_FIELD',
      });
    }
  }

  // Validate invoice type
  if (invoice.invoiceType && !VALID_INVOICE_TYPES.includes(invoice.invoiceType as any)) {
    errors.push({
      field: 'invoiceType',
      message: `Invalid invoice type "${invoice.invoiceType}". Must be one of: ${VALID_INVOICE_TYPES.join(', ')}`,
      code: 'INVALID_INVOICE_TYPE',
    });
  }

  // Validate invoice date format (should be ISO 8601)
  if (invoice.invoiceDate) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    if (!dateRegex.test(invoice.invoiceDate)) {
      errors.push({
        field: 'invoiceDate',
        message: 'Invalid date format. Should be ISO 8601 format (e.g., 2026-03-14T10:00:00Z)',
        code: 'INVALID_DATE_FORMAT',
      });
    }
  }

  // Validate customer TIN format (Kenya TIN is 11 characters)
  if (invoice.customerTin && invoice.customerTin.length !== 11) {
    warnings.push({
      field: 'customerTin',
      message: `Customer TIN "${invoice.customerTin}" does not match standard 11-character format`,
    });
  }

  // Validate financial amounts
  if (invoice.subtotal && invoice.subtotal < 0) {
    errors.push({
      field: 'subtotal',
      message: 'Subtotal cannot be negative',
      code: 'NEGATIVE_AMOUNT',
    });
  }

  if (invoice.totalTax && invoice.totalTax < 0) {
    errors.push({
      field: 'totalTax',
      message: 'Total tax cannot be negative',
      code: 'NEGATIVE_AMOUNT',
    });
  }

  if (invoice.totalAmount && invoice.totalAmount < 0) {
    errors.push({
      field: 'totalAmount',
      message: 'Total amount cannot be negative',
      code: 'NEGATIVE_AMOUNT',
    });
  }

  // Validate tax details (must have at least one)
  if (!invoice.taxDetails || invoice.taxDetails.length === 0) {
    warnings.push({
      field: 'taxDetails',
      message: 'No tax details provided. KRA requires full tax breakdown.',
    });
  }

  // Validate tax details
  if (invoice.taxDetails) {
    for (let i = 0; i < invoice.taxDetails.length; i++) {
      const tax = invoice.taxDetails[i];
      
      if (!VALID_TAX_TYPES.includes(tax.taxType as any)) {
        errors.push({
          field: `taxDetails[${i}].taxType`,
          message: `Invalid tax type "${tax.taxType}". Must be one of: ${VALID_TAX_TYPES.join(', ')}`,
          code: 'INVALID_TAX_TYPE',
        });
      }

      if (tax.taxRtA < 0 || tax.taxRtA > 100) {
        errors.push({
          field: `taxDetails[${i}].taxRtA`,
          message: `Tax rate must be between 0 and 100, got ${tax.taxRtA}`,
          code: 'INVALID_TAX_RATE',
        });
      }
    }
  }

  // Validate line items
  if (!invoice.items || invoice.items.length === 0) {
    errors.push({
      field: 'items',
      message: 'At least one line item is required',
      code: 'MISSING_ITEMS',
    });
  } else {
    for (let i = 0; i < invoice.items.length; i++) {
      const item = invoice.items[i];
      
      if (!item.itemName) {
        errors.push({
          field: `items[${i}].itemName`,
          message: 'Item name is required',
          code: 'MISSING_ITEM_NAME',
        });
      }

      if (item.quantity <= 0) {
        errors.push({
          field: `items[${i}].quantity`,
          message: 'Item quantity must be greater than 0',
          code: 'INVALID_QUANTITY',
        });
      }

      if (item.unitPrice < 0) {
        errors.push({
          field: `items[${i}].unitPrice`,
          message: 'Unit price cannot be negative',
          code: 'NEGATIVE_AMOUNT',
        });
      }

      // Validate tax type for item
      if (item.taxType && !VALID_TAX_TYPES.includes(item.taxType as any)) {
        errors.push({
          field: `items[${i}].taxType`,
          message: `Invalid tax type "${item.taxType}"`,
          code: 'INVALID_TAX_TYPE',
        });
      }
    }
  }

  // Validate payment info
  if (invoice.paymentInfo) {
    if (!VALID_PAYMENT_METHODS.includes(invoice.paymentInfo.method as any)) {
      errors.push({
        field: 'paymentInfo.method',
        message: `Invalid payment method. Must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
        code: 'INVALID_PAYMENT_METHOD',
      });
    }

    if (invoice.paymentInfo.amount < 0) {
      errors.push({
        field: 'paymentInfo.amount',
        message: 'Payment amount cannot be negative',
        code: 'NEGATIVE_AMOUNT',
      });
    }
  }

  // Check for potential issues
  if (invoice.totalAmount !== undefined && invoice.subtotal !== undefined) {
    const expectedTotal = invoice.subtotal + invoice.totalTax - (invoice.totalDiscount || 0);
    if (Math.abs(invoice.totalAmount - expectedTotal) > 0.01) {
      warnings.push({
        field: 'totalAmount',
        message: `Total amount (${invoice.totalAmount}) doesn't match expected (${expectedTotal})`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Test eTIMS Integration in Sandbox
 */
export async function runETIMSTestSuite(): Promise<{
  connection: { success: boolean; message: string };
  validation: ValidationResult;
  submission?: ETIMSResponse;
  errors: string[];
}> {
  const errors: string[] = [];

  // 1. Test connection
  let connectionResult = { success: false, message: 'Not tested' };
  try {
    connectionResult = await testETIMSConnection();
  } catch (error) {
    errors.push(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // 2. Create test invoice
  const testInvoice: ETIMSInvoicePayload = {
    invoiceType: 'EC',
    invoiceNo: `TEST-${Date.now()}`,
    invoiceDate: new Date().toISOString(),
    customerTin: 'A0000000000', // Test TIN
    customerName: 'Test Customer',
    customerMobile: '+254757650125',
    subtotal: 1000,
    totalTax: 160,
    totalAmount: 1160,
    taxDetails: [
      {
        taxType: 'A',
        taxTypeName: 'Standard Rate',
        taxblAmtA: 1000,
        taxRtA: 16,
        taxAmtA: 160,
      },
    ],
    items: [
      {
        itemCode: 'TEST001',
        itemName: 'Test Item',
        quantity: 1,
        unitPrice: 1000,
        taxableAmount: 1000,
        taxRate: 16,
        taxAmount: 160,
        taxType: 'A',
        totalAmount: 1160,
      },
    ],
    paymentInfo: {
      method: 'CASH',
      amount: 1160,
    },
    cashierName: 'Test Cashier',
    remarks: 'Test invoice for API validation',
  };

  // 3. Validate test invoice
  const validation = validateETIMSPayload(testInvoice);
  if (!validation.isValid) {
    errors.push(...validation.errors.map(e => `Validation: ${e.message}`));
  }

  // 4. Try submission if validation passes
  let submission: ETIMSResponse | undefined;
  if (validation.isValid && connectionResult.success) {
    try {
      submission = await submitInvoiceToETIMS(testInvoice);
      if (!submission.success) {
        errors.push(`Submission: ${submission.error || 'Unknown error'}`);
      }
    } catch (error) {
      errors.push(`Submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return {
    connection: connectionResult,
    validation,
    submission,
    errors,
  };
}

/**
 * Retry configuration for eTIMS submissions
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Retry helper with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: Error) => void
): Promise<{ success: boolean; result?: T; error?: string; attempts: number }> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await fn();
      return { success: true, result, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < config.maxRetries) {
        const delay = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );
        
        if (onRetry) {
          onRetry(attempt, lastError);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error after retries',
    attempts: config.maxRetries,
  };
}

/**
 * Queue for failed eTIMS submissions
 */
export interface FailedSubmission {
  id: string;
  invoice: ETIMSInvoicePayload;
  error: string;
  attempts: number;
  lastAttempt: string;
  status: 'pending' | 'failed' | 'manual_review';
}

const failedSubmissions: Map<string, FailedSubmission> = new Map();

export function queueFailedSubmission(
  invoice: ETIMSInvoicePayload,
  error: string
): string {
  const id = `FAILED-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  failedSubmissions.set(id, {
    id,
    invoice,
    error,
    attempts: 1,
    lastAttempt: new Date().toISOString(),
    status: 'pending',
  });

  return id;
}

export function getFailedSubmissions(): FailedSubmission[] {
  return Array.from(failedSubmissions.values());
}

export function markForManualReview(submissionId: string): boolean {
  const submission = failedSubmissions.get(submissionId);
  if (submission) {
    submission.status = 'manual_review';
    return true;
  }
  return false;
}

export function removeFailedSubmission(submissionId: string): boolean {
  return failedSubmissions.delete(submissionId);
}

/**
 * Generate diagnostic report for troubleshooting
 */
export function getETIMSDiagnostics(): {
  timestamp: string;
  configPresent: boolean;
  environment: string;
  apiUrl: string;
  knownIssues: string[];
} {
  const apiUrl = process.env.ETIMS_API_URL || '';
  const isProduction = apiUrl.includes('api.kra.go.ke');
  const isSandbox = apiUrl.includes('developer.go.ke');
  
  const knownIssues: string[] = [];
  
  if (!process.env.ETIMS_CMC_KEY) {
    knownIssues.push('ETIMS_CMC_KEY is not configured');
  }
  
  if (!process.env.ETIMS_DEVICE_SERIAL) {
    knownIssues.push('ETIMS_DEVICE_SERIAL is not configured');
  }
  
  if (isProduction && !process.env.ETIMS_CERTIFICATE) {
    knownIssues.push('Running in production without SSL certificate configured');
  }

  return {
    timestamp: new Date().toISOString(),
    configPresent: !!(process.env.ETIMS_CMC_KEY && process.env.ETIMS_DEVICE_SERIAL),
    environment: isProduction ? 'production' : isSandbox ? 'sandbox' : 'unknown',
    apiUrl: apiUrl || 'Not configured',
    knownIssues,
  };
}
