/**
 * Payment Queue System - Queue payment operations when offline
 */

import { localDb, generateOfflineId, generateChecksum, getCurrentTimestamp, type LocalPayment } from '../local-db';
import { queueMutation } from '../sync/sync-engine';
import { isOnline } from '../sync/network-monitor';

// ============================================================================
// Types
// ============================================================================

export interface ProcessPaymentInput {
  orderId?: string;
  reservationId?: string;
  amount: number;
  method: LocalPayment['method'];
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  processedBy: string;
  staffName: string;
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  tipAmount?: number;
  discountAmount?: number;
  metadata?: Record<string, unknown>;
  notes?: string;
}

export interface PaymentResult {
  success: boolean;
  payment?: LocalPayment;
  error?: string;
  offlineToken?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const MAX_PAYMENT_RETRIES = 3;
const PAYMENT_RETRY_DELAYS = [5000, 15000, 60000]; // 5s, 15s, 60s

// ============================================================================
// Payment Processing
// ============================================================================

/**
 * Process a payment (works offline with queuing)
 */
export async function processPaymentOffline(
  input: ProcessPaymentInput
): Promise<PaymentResult> {
  const id = generateOfflineId('PAY');
  const now = getCurrentTimestamp();
  
  // Check if online
  const online = isOnline();
  
  const payment: LocalPayment = {
    id,
    orderId: input.orderId,
    reservationId: input.reservationId,
    amount: input.amount,
    currency: 'NGN',
    method: input.method,
    status: online ? 'processing' : 'pending_offline',
    transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    receiptNumber: generateReceiptNumber(),
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    processedBy: input.processedBy,
    staffName: input.staffName,
    subtotal: input.subtotal,
    taxAmount: input.taxAmount,
    serviceCharge: input.serviceCharge,
    tipAmount: input.tipAmount || 0,
    discountAmount: input.discountAmount || 0,
    processedAt: now,
    metadata: input.metadata,
    notes: input.notes,
    createdAt: now,
    syncStatus: online ? 'synced' : 'pending',
    checksum: ''
  };
  
  payment.checksum = generateChecksum(payment as unknown as Record<string, unknown>);
  
  // Save to local database
  await localDb.payments.put(payment);
  
  if (online) {
    // Try to process online payment immediately
    try {
      const processed = await processOnlinePayment(payment);
      if (processed) {
        payment.status = 'completed';
        payment.completedAt = getCurrentTimestamp();
        payment.paystackReference = processed.reference;
        payment.syncStatus = 'synced';
        await localDb.payments.put(payment);
      }
    } catch (error) {
      console.error('Online payment failed, queuing for retry:', error);
      payment.status = 'pending_offline';
      payment.syncStatus = 'pending';
      await localDb.payments.put(payment);
      await queueMutation('payments', 'create', id, payment as unknown as Record<string, unknown>);
    }
  } else {
    // Queue for sync when online
    await queueMutation('payments', 'create', id, payment as unknown as Record<string, unknown>);
  }
  
  console.log(`💳 Payment ${id} processed (${online ? 'online' : 'offline'})`);
  
  return {
    success: true,
    payment,
    offlineToken: !online ? id : undefined
  };
}

/**
 * Process online payment (placeholder - integrate with Paystack)
 */
async function processOnlinePayment(payment: LocalPayment): Promise<{ reference: string } | null> {
  // This would integrate with Paystack API
  // For now, simulate successful payment
  console.log(`Processing online payment: ${payment.amount}`);
  
  // In production, this would call Paystack API:
  // const response = await fetch('/api/payments/process', {
  //   method: 'POST',
  //   body: JSON.stringify(payment)
  // });
  
  return {
    reference: `PS-${Date.now()}`
  };
}

/**
 * Generate receipt number
 */
function generateReceiptNumber(): string {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `RCP-${today}-${random}`;
}

// ============================================================================
// Payment Queries
// ============================================================================

/**
 * Get payment by ID
 */
export async function getPaymentById(id: string): Promise<LocalPayment | undefined> {
  return localDb.payments.get(id);
}

/**
 * Get payment by order ID
 */
export async function getPaymentByOrderId(orderId: string): Promise<LocalPayment | undefined> {
  return localDb.payments
    .filter(payment => payment.orderId === orderId)
    .first();
}

/**
 * Get payment by transaction ID
 */
export async function getPaymentByTransactionId(transactionId: string): Promise<LocalPayment | undefined> {
  return localDb.payments
    .filter(payment => payment.transactionId === transactionId)
    .first();
}

/**
 * Get all payments
 */
export async function getPayments(
  filters?: {
    status?: LocalPayment['status'];
    method?: LocalPayment['method'];
    date?: string;
  }
): Promise<LocalPayment[]> {
  let payments = await localDb.payments.orderBy('processedAt').reverse().toArray();
  
  if (filters?.status) {
    payments = payments.filter(p => p.status === filters.status);
  }
  
  if (filters?.method) {
    payments = payments.filter(p => p.method === filters.method);
  }
  
  if (filters?.date) {
    const dateStr = filters.date.split('T')[0];
    payments = payments.filter(p => p.processedAt.startsWith(dateStr));
  }
  
  return payments;
}

/**
 * Get today's payments
 */
export async function getTodaysPayments(): Promise<LocalPayment[]> {
  const today = new Date().toISOString().split('T')[0];
  
  return localDb.payments
    .filter(payment => payment.processedAt.startsWith(today))
    .toArray();
}

/**
 * Get total payments for today
 */
export async function getTodaysPaymentTotal(): Promise<number> {
  const payments = await getTodaysPayments();
  
  return payments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);
}

// ============================================================================
// Offline Payment Queue Management
// ============================================================================

/**
 * Get pending offline payments
 */
export async function getPendingOfflinePayments(): Promise<LocalPayment[]> {
  return localDb.payments
    .filter(payment => payment.status === 'pending_offline')
    .toArray();
}

/**
 * Get count of pending offline payments
 */
export async function getPendingOfflinePaymentCount(): Promise<number> {
  return localDb.payments
    .filter(payment => payment.status === 'pending_offline')
    .count();
}

/**
 * Retry pending offline payments
 */
export async function retryPendingPayments(): Promise<{
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  const pending = await getPendingOfflinePayments();
  
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  
  for (const payment of pending) {
    try {
      const result = await processOnlinePayment(payment);
      
      if (result) {
        payment.status = 'completed';
        payment.completedAt = getCurrentTimestamp();
        payment.paystackReference = result.reference;
        payment.syncStatus = 'synced';
        await localDb.payments.put(payment);
        succeeded++;
      } else {
        failed++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Payment ${payment.id}: ${errorMessage}`);
      failed++;
    }
  }
  
  return { succeeded, failed, errors };
}

// ============================================================================
// Refund Processing
// ============================================================================

/**
 * Refund a payment
 */
export async function refundPayment(
  paymentId: string,
  reason?: string
): Promise<PaymentResult> {
  const payment = await localDb.payments.get(paymentId);
  
  if (!payment) {
    return { success: false, error: 'Payment not found' };
  }
  
  if (payment.status !== 'completed') {
    return { success: false, error: 'Can only refund completed payments' };
  }
  
  // Update payment status
  payment.status = 'refunded';
  payment.notes = reason ? `Refunded: ${reason}` : 'Refunded';
  payment.updatedAt = getCurrentTimestamp();
  payment.syncStatus = isOnline() ? 'synced' : 'pending';
  
  await localDb.payments.put(payment);
  
  if (!isOnline()) {
    await queueMutation('payments', 'update', paymentId, payment as unknown as Record<string, unknown>);
  }
  
  // In production, this would also call Paystack refund API
  console.log(`💰 Payment ${paymentId} refunded`);
  
  return { success: true, payment };
}

// ============================================================================
// Sync Helpers
// ============================================================================

/**
 * Sync payments from cloud
 */
export async function syncPaymentsFromCloud(
  cloudPayments: LocalPayment[]
): Promise<number> {
  let synced = 0;
  
  for (const cloudPayment of cloudPayments) {
    const local = await localDb.payments.get(cloudPayment.id);
    
    if (!local) {
      await localDb.payments.put({
        ...cloudPayment,
        syncStatus: 'synced'
      });
      synced++;
    } else if (local.syncStatus === 'synced') {
      if (local.checksum !== cloudPayment.checksum) {
        await localDb.payments.put({
          ...cloudPayment,
          syncStatus: 'synced'
        });
        synced++;
      }
    }
  }
  
  return synced;
}

// ============================================================================
// Payment Terminal Integration
// ============================================================================

/**
 * Check if payment terminal is available
 */
export async function checkPaymentTerminal(): Promise<boolean> {
  // This would check for connected payment terminal
  // For now, return true (assume available)
  return true;
}

/**
 * Process terminal payment
 */
export async function processTerminalPayment(
  input: ProcessPaymentInput,
  terminalId: string
): Promise<PaymentResult> {
  // Mark as terminal payment in metadata
  const result = await processPaymentOffline({
    ...input,
    metadata: {
      ...input.metadata,
      terminalId,
      paymentType: 'terminal'
    }
  });
  
  return result;
}
