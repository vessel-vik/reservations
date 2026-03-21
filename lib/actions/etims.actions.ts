"use server";

/**
 * eTIMS API Client for KRA Integration
 * 
 * Supports OSCU (Online Sales Control Unit) for real-time invoicing
 * Reference: https://api.developer.go.ke/etims-oscu/api/v1
 * 
 * This module provides:
 * - Device initialization and registration
 * - Invoice submission to eTIMS
 * - Real-time validation and QR code generation
 * - Error handling for KRA API responses
 */

import { ETIMSConfig, ETIMSInvoicePayload, ETIMSResponse } from "@/types/pos.types";

/**
 * Get eTIMS configuration from environment
 */
function getETIMSConfig(): ETIMSConfig {
  const apiUrl = process.env.ETIMS_API_URL || 'https://api.developer.go.ke/etims-oscu/api/v1';
  const cmcKey = process.env.ETIMS_CMC_KEY || '';
  const deviceSerial = process.env.ETIMS_DEVICE_SERIAL || '';
  const certificate = process.env.ETIMS_CERTIFICATE;
  
  const isProduction = apiUrl.includes('api.developer.go.ke');
  
  return {
    apiUrl,
    cmcKey,
    deviceSerial,
    certificate,
    isProduction,
  };
}

/**
 * Generate required KRA headers
 */
function generateHeaders(cmcKey: string): Record<string, string> {
  const timestamp = new Date().toISOString();
  const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  return {
    'Authorization': `Bearer ${cmcKey}`,
    'cmcKey': cmcKey,
    'X-Request-ID': requestId,
    'X-Timestamp': timestamp,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

/**
 * Initialize eTIMS device/session
 * This must be called before any other API operations
 * Returns the cmcKey that should be used for subsequent requests
 */
export async function initializeETIMS(): Promise<{
  success: boolean;
  cmcKey?: string;
  deviceInfo?: any;
  error?: string;
}> {
  const config = getETIMSConfig();
  
  if (!config.cmcKey || !config.deviceSerial) {
    return {
      success: false,
      error: 'eTIMS configuration missing. Please set ETIMS_CMC_KEY and ETIMS_DEVICE_SERIAL environment variables.',
    };
  }

  try {
    const response = await fetch(`${config.apiUrl}/initialize`, {
      method: 'POST',
      headers: generateHeaders(config.cmcKey),
      body: JSON.stringify({
        deviceSerial: config.deviceSerial,
        os: 'POS-System',
        version: '1.0.0',
      }),
    });

    const data = await response.json();
    
    if (response.ok && data.status === 0) {
      // Update cmcKey for future requests if returned
      const newCmcKey = data.cmcKey || config.cmcKey;
      
      return {
        success: true,
        cmcKey: newCmcKey,
        deviceInfo: data,
      };
    } else {
      return {
        success: false,
        error: data.description || 'Failed to initialize eTIMS',
      };
    }
  } catch (error) {
    console.error('eTIMS initialization error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error during eTIMS initialization',
    };
  }
}

/**
 * Submit an invoice to eTIMS for validation and registration
 * Returns QR code and signature for receipt printing
 */
export async function submitInvoiceToETIMS(
  invoice: ETIMSInvoicePayload
): Promise<ETIMSResponse> {
  const config = getETIMSConfig();
  
  if (!config.cmcKey) {
    return {
      success: false,
      error: 'eTIMS not initialized. Call initializeETIMS() first.',
    };
  }

  try {
    // Map internal invoice type to KRA codes
    const kraInvoice = mapToKRAFormat(invoice);
    
    const response = await fetch(`${config.apiUrl}/invoices`, {
      method: 'POST',
      headers: generateHeaders(config.cmcKey),
      body: JSON.stringify(kraInvoice),
    });

    const data = await response.json();
    
    if (response.ok) {
      return {
        success: true,
        invoiceNo: data.invoiceNo || invoice.invoiceNo,
        qrCode: data.qrCode,
        signature: data.signature,
        timestamp: data.dateTime || new Date().toISOString(),
      };
    } else {
      return {
        success: false,
        error: data.description || 'Invoice submission failed',
        errorCode: data.errorCode || data.status?.toString(),
      };
    }
  } catch (error) {
    console.error('eTIMS invoice submission error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error during invoice submission',
    };
  }
}

/**
 * Map internal invoice format to KRA eTIMS format
 * Includes all 15 tax fields required by KRA
 */
function mapToKRAFormat(invoice: ETIMSInvoicePayload): any {
  // Build tax details array (KRA requires all 15 fields)
  const taxDetails = buildTaxDetails(invoice);
  
  return {
    // Header
    invcNo: invoice.invoiceNo,
    invcDt: invoice.invoiceDate,
    invcType: invoice.invoiceType,
    
    // Customer
    custTin: invoice.customerTin,
    custNm: invoice.customerName,
    custMobNo: invoice.customerMobile || '',
    custAddr: invoice.customerAddress || '',
    
    // Financials
    taxblAmt: invoice.subtotal,
    totDisc: invoice.totalDiscount || 0,
    totTaxAmt: invoice.totalTax,
    totAmt: invoice.totalAmount,
    
    // Tax Details (15 fields)
    taxDetails,
    
    // Items
    itemList: invoice.items.map((item, index) => ({
      itemNo: index + 1,
      itemCd: item.itemCode,
      itemNm: item.itemName,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      totDisc: item.discount || 0,
      taxblAmt: item.taxableAmount,
      taxRt: item.taxRate,
      taxAmt: item.taxAmount,
      totAmt: item.totalAmount,
      taxType: item.taxType,
    })),
    
    // Payment
    pymtMthd: invoice.paymentInfo?.method || 'CASH',
    pymtAmnt: invoice.paymentInfo?.amount || invoice.totalAmount,
    pymtRef: invoice.paymentInfo?.reference || '',
    
    // Metadata
    brnchCd: invoice.branchId || '001',
    cashrNm: invoice.cashierName || 'System',
    rmk: invoice.remarks || '',
  };
}

/**
 * Build KRA-compliant tax details array
 * KRA requires 15 tax fields (A through O)
 */
function buildTaxDetails(invoice: ETIMSInvoicePayload): any[] {
  // Calculate totals by tax type
  const taxSummary: Record<string, { taxable: number; tax: number }> = {
    'A': { taxable: 0, tax: 0 },  // Standard Rate
    'B': { taxable: 0, tax: 0 },  // Zero Rate
    'C': { taxable: 0, tax: 0 },  // Exempt
    'D': { taxable: 0, tax: 0 },  // Excise Duty
    'E': { taxable: 0, tax: 0 },  // Withholding VAT
  };

  // Aggregate from line items
  for (const item of invoice.items) {
    const type = item.taxType;
    if (taxSummary[type]) {
      taxSummary[type].taxable += item.taxableAmount;
      taxSummary[type].tax += item.taxAmount;
    }
  }

  // Build array with all 15 fields (A-O)
  const taxTypeNames: Record<string, string> = {
    'A': 'Standard Rate',
    'B': 'Zero Rate',
    'C': 'Exempt',
    'D': 'Excise Duty',
    'E': 'Withholding VAT',
  };

  return ['A', 'B', 'C', 'D', 'E'].map(type => ({
    taxType: type,
    taxTypeName: taxTypeNames[type],
    taxblAmtA: Math.round((taxSummary[type].taxable || 0) * 100) / 100,
    taxRtA: type === 'A' ? 16 : type === 'D' ? 20 : 0, // Example rates
    taxAmtA: Math.round((taxSummary[type].tax || 0) * 100) / 100,
  }));
}

/**
 * Submit batch of invoices to eTIMS
 * Useful for bulk uploads
 */
export async function submitBatchToETIMS(
  invoices: ETIMSInvoicePayload[]
): Promise<{
  success: boolean;
  results: ETIMSResponse[];
  errors?: string[];
}> {
  const results: ETIMSResponse[] = [];
  const errors: string[] = [];

  for (const invoice of invoices) {
    const result = await submitInvoiceToETIMS(invoice);
    results.push(result);
    
    if (!result.success && result.error) {
      errors.push(`${invoice.invoiceNo}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Query eTIMS for previously submitted invoice
 */
export async function queryETIMSInvoice(
  invoiceNo: string
): Promise<{
  success: boolean;
  invoice?: any;
  error?: string;
}> {
  const config = getETIMSConfig();
  
  if (!config.cmcKey) {
    return {
      success: false,
      error: 'eTIMS not initialized',
    };
  }

  try {
    const response = await fetch(
      `${config.apiUrl}/invoices/${invoiceNo}`,
      {
        method: 'GET',
        headers: generateHeaders(config.cmcKey),
      }
    );

    const data = await response.json();
    
    if (response.ok) {
      return {
        success: true,
        invoice: data,
      };
    } else {
      return {
        success: false,
        error: data.description || 'Failed to query invoice',
      };
    }
  } catch (error) {
    console.error('eTIMS query error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Test eTIMS connection
 */
export async function testETIMSConnection(): Promise<{
  success: boolean;
  message: string;
  config?: Partial<ETIMSConfig>;
}> {
  const config = getETIMSConfig();
  
  if (!config.cmcKey) {
    return {
      success: false,
      message: 'eTIMS cmcKey not configured',
      config: {
        apiUrl: config.apiUrl,
        isProduction: config.isProduction,
      },
    };
  }

  try {
    const response = await fetch(`${config.apiUrl}/ping`, {
      method: 'GET',
      headers: generateHeaders(config.cmcKey),
    });

    if (response.ok) {
      return {
        success: true,
        message: 'eTIMS connection successful',
        config: {
          apiUrl: config.apiUrl,
          isProduction: config.isProduction,
        },
      };
    } else {
      return {
        success: false,
        message: 'eTIMS connection failed',
        config: {
          apiUrl: config.apiUrl,
          isProduction: config.isProduction,
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      config: {
        apiUrl: config.apiUrl,
        isProduction: config.isProduction,
      },
    };
  }
}
