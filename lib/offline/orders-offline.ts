/**
 * Orders Offline - Full POS order processing offline
 */

import { localDb, generateOfflineId, generateChecksum, getCurrentTimestamp, type LocalOrder, type LocalOrderItem } from '../local-db';
import { queueMutation } from '../sync/sync-engine';
import { isOnline } from '../sync/network-monitor';

// ============================================================================
// Types
// ============================================================================

export interface CreateOrderInput {
  type: LocalOrder['type'];
  tableNumber?: number;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  guestCount?: number;
  reservationId?: string;
  waiterId?: string;
  waiterName: string;
  specialInstructions?: string;
  kitchenNotes?: string;
  priority?: LocalOrder['priority'];
}

export interface UpdateOrderInput {
  id: string;
  status?: LocalOrder['status'];
  tableNumber?: number;
  guestCount?: number;
  specialInstructions?: string;
  kitchenNotes?: string;
  priority?: LocalOrder['priority'];
  paymentStatus?: LocalOrder['paymentStatus'];
  paymentMethods?: LocalOrder['paymentMethods'];
  discountAmount?: number;
  tipAmount?: number;
  estimatedReadyTime?: string;
  actualReadyTime?: string;
  servedTime?: string;
  completedTime?: string;
}

export interface AddOrderItemInput {
  orderId: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  variant?: { name: string; price: number };
  customizations?: Array<{ name: string; price: number }>;
  specialInstructions?: string;
}

// ============================================================================
// Order Number Generation
// ============================================================================

let orderCounter = 0;
let lastCounterDate = '';

/**
 * Generate order number (e.g., ORD-001)
 */
function generateOrderNumber(): string {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  // Reset counter on new day
  if (today !== lastCounterDate) {
    orderCounter = 0;
    lastCounterDate = today;
  }
  
  orderCounter++;
  return `ORD-${orderCounter.toString().padStart(4, '0')}`;
}

// ============================================================================
// Order CRUD Operations
// ============================================================================

/**
 * Create a new order (works offline)
 */
export async function createOrderOffline(
  input: CreateOrderInput,
  cashierId?: string
): Promise<LocalOrder> {
  const id = generateOfflineId('ORD');
  const now = getCurrentTimestamp();
  
  const order: LocalOrder = {
    id,
    orderNumber: generateOrderNumber(),
    type: input.type,
    status: 'draft',
    tableNumber: input.tableNumber,
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    guestCount: input.guestCount || 1,
    reservationId: input.reservationId,
    waiterId: input.waiterId,
    waiterName: input.waiterName,
    cashierId,
    subtotal: 0,
    taxAmount: 0,
    serviceCharge: 0,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 0,
    orderTime: now,
    specialInstructions: input.specialInstructions,
    kitchenNotes: input.kitchenNotes,
    priority: input.priority || 'normal',
    paymentStatus: 'pending',
    paymentMethods: [],
    createdAt: now,
    updatedAt: now,
    syncStatus: isOnline() ? 'synced' : 'pending',
    checksum: ''
  };
  
  order.checksum = generateChecksum(order as unknown as Record<string, unknown>);
  
  await localDb.orders.put(order);
  
  if (!isOnline()) {
    await queueMutation('orders', 'create', id, order as unknown as Record<string, unknown>);
  }
  
  console.log(`📝 Created order ${order.orderNumber} (${isOnline() ? 'online' : 'offline'})`);
  
  return order;
}

/**
 * Get order by ID
 */
export async function getOrderById(id: string): Promise<LocalOrder | undefined> {
  return localDb.orders.get(id);
}

/**
 * Get order by order number
 */
export async function getOrderByNumber(orderNumber: string): Promise<LocalOrder | undefined> {
  return localDb.orders
    .filter(order => order.orderNumber === orderNumber)
    .first();
}

/**
 * Get all orders with optional filters
 */
export async function getOrders(
  filters?: {
    status?: LocalOrder['status'];
    type?: LocalOrder['type'];
    paymentStatus?: LocalOrder['paymentStatus'];
    date?: string;
  }
): Promise<LocalOrder[]> {
  let orders = await localDb.orders.orderBy('orderTime').reverse().toArray();
  
  if (filters?.status) {
    orders = orders.filter(o => o.status === filters.status);
  }
  
  if (filters?.type) {
    orders = orders.filter(o => o.type === filters.type);
  }
  
  if (filters?.paymentStatus) {
    orders = orders.filter(o => o.paymentStatus === filters.paymentStatus);
  }
  
  if (filters?.date) {
    const dateStr = filters.date.split('T')[0];
    orders = orders.filter(o => o.orderTime.startsWith(dateStr));
  }
  
  return orders;
}

/**
 * Update an order
 */
export async function updateOrderOffline(
  input: UpdateOrderInput
): Promise<LocalOrder | undefined> {
  const existing = await localDb.orders.get(input.id);
  
  if (!existing) {
    console.error(`Order ${input.id} not found`);
    return undefined;
  }
  
  // Recalculate totals if needed
  let subtotal = existing.subtotal;
  let taxAmount = existing.taxAmount;
  let serviceCharge = existing.serviceCharge;
  
  if (input.discountAmount !== undefined) {
    subtotal = subtotal - (existing.discountAmount - input.discountAmount);
  }
  
  if (input.tipAmount !== undefined) {
    // Recalculate total
    const newTotal = subtotal + taxAmount + serviceCharge - (input.discountAmount ?? existing.discountAmount) + input.tipAmount;
    
    const updated: LocalOrder = {
      ...existing,
      ...(input.status && { status: input.status }),
      ...(input.tableNumber !== undefined && { tableNumber: input.tableNumber }),
      ...(input.guestCount !== undefined && { guestCount: input.guestCount }),
      ...(input.specialInstructions !== undefined && { specialInstructions: input.specialInstructions }),
      ...(input.kitchenNotes !== undefined && { kitchenNotes: input.kitchenNotes }),
      ...(input.priority && { priority: input.priority }),
      ...(input.paymentStatus && { paymentStatus: input.paymentStatus }),
      ...(input.paymentMethods && { paymentMethods: input.paymentMethods }),
      ...(input.discountAmount !== undefined && { discountAmount: input.discountAmount }),
      ...(input.tipAmount !== undefined && { tipAmount: input.tipAmount }),
      ...(input.estimatedReadyTime !== undefined && { estimatedReadyTime: input.estimatedReadyTime }),
      ...(input.actualReadyTime !== undefined && { actualReadyTime: input.actualReadyTime }),
      ...(input.servedTime !== undefined && { servedTime: input.servedTime }),
      ...(input.completedTime !== undefined && { completedTime: input.completedTime }),
      totalAmount: newTotal,
      updatedAt: getCurrentTimestamp(),
      syncStatus: isOnline() ? 'synced' : 'pending'
    };
    
    updated.checksum = generateChecksum(updated as unknown as Record<string, unknown>);
    
    await localDb.orders.put(updated);
    
    if (!isOnline()) {
      await queueMutation('orders', 'update', input.id, updated as unknown as Record<string, unknown>);
    }
    
    return updated;
  }
  
  const updated: LocalOrder = {
    ...existing,
    ...(input.status && { status: input.status }),
    ...(input.tableNumber !== undefined && { tableNumber: input.tableNumber }),
    ...(input.guestCount !== undefined && { guestCount: input.guestCount }),
    ...(input.specialInstructions !== undefined && { specialInstructions: input.specialInstructions }),
    ...(input.kitchenNotes !== undefined && { kitchenNotes: input.kitchenNotes }),
    ...(input.priority && { priority: input.priority }),
    ...(input.paymentStatus && { paymentStatus: input.paymentStatus }),
    ...(input.paymentMethods && { paymentMethods: input.paymentMethods }),
    ...(input.discountAmount !== undefined && { discountAmount: input.discountAmount }),
    ...(input.tipAmount !== undefined && { tipAmount: input.tipAmount }),
    ...(input.estimatedReadyTime !== undefined && { estimatedReadyTime: input.estimatedReadyTime }),
    ...(input.actualReadyTime !== undefined && { actualReadyTime: input.actualReadyTime }),
    ...(input.servedTime !== undefined && { servedTime: input.servedTime }),
    ...(input.completedTime !== undefined && { completedTime: input.completedTime }),
    updatedAt: getCurrentTimestamp(),
    syncStatus: isOnline() ? 'synced' : 'pending'
  };
  
  updated.checksum = generateChecksum(updated as unknown as Record<string, unknown>);
  
  await localDb.orders.put(updated);
  
  if (!isOnline()) {
    await queueMutation('orders', 'update', input.id, updated as unknown as Record<string, unknown>);
  }
  
  return updated;
}

/**
 * Place an order (change from draft to placed)
 */
export async function placeOrder(id: string): Promise<LocalOrder | undefined> {
  return updateOrderOffline({
    id,
    status: 'placed'
  });
}

/**
 * Cancel an order
 */
export async function cancelOrder(id: string, reason?: string): Promise<LocalOrder | undefined> {
  return updateOrderOffline({
    id,
    status: 'cancelled'
  });
}

// ============================================================================
// Order Items Operations
// ============================================================================

/**
 * Add item to order
 */
export async function addOrderItem(input: AddOrderItemInput): Promise<LocalOrderItem> {
  const id = generateOfflineId('ITEM');
  const now = getCurrentTimestamp();
  
  const customizationsTotal = input.customizations?.reduce((sum, c) => sum + c.price, 0) || 0;
  const variantPrice = input.variant?.price || 0;
  const totalPrice = (input.unitPrice + variantPrice + customizationsTotal) * input.quantity;
  
  const orderItem: LocalOrderItem = {
    id,
    orderId: input.orderId,
    menuItemId: input.menuItemId,
    menuItemName: input.menuItemName,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    totalPrice,
    variant: input.variant,
    customizations: input.customizations || [],
    specialInstructions: input.specialInstructions,
    kitchenStatus: 'waiting',
    createdAt: now,
    syncStatus: isOnline() ? 'synced' : 'pending',
    checksum: ''
  };
  
  orderItem.checksum = generateChecksum(orderItem as unknown as Record<string, unknown>);
  
  await localDb.orderItems.put(orderItem);
  
  // Update order totals
  await recalculateOrderTotals(input.orderId);
  
  // Queue for sync if offline
  if (!isOnline()) {
    await queueMutation('orderItems', 'create', id, orderItem as unknown as Record<string, unknown>);
  }
  
  return orderItem;
}

/**
 * Get order items for an order
 */
export async function getOrderItems(orderId: string): Promise<LocalOrderItem[]> {
  return localDb.orderItems
    .filter(item => item.orderId === orderId)
    .toArray();
}

/**
 * Update order item status
 */
export async function updateOrderItemStatus(
  itemId: string,
  status: LocalOrderItem['kitchenStatus']
): Promise<LocalOrderItem | undefined> {
  const item = await localDb.orderItems.get(itemId);
  
  if (!item) {
    return undefined;
  }
  
  const now = getCurrentTimestamp();
  
  const updated: LocalOrderItem = {
    ...item,
    kitchenStatus: status,
    ...(status === 'preparing' && !item.startedAt ? { startedAt: now } : {}),
    ...(status === 'ready' && !item.completedAt ? { completedAt: now } : {}),
    updatedAt: now,
    syncStatus: isOnline() ? 'synced' : 'pending'
  };
  
  updated.checksum = generateChecksum(updated as unknown as Record<string, unknown>);
  
  await localDb.orderItems.put(updated);
  
  if (!isOnline()) {
    await queueMutation('orderItems', 'update', itemId, updated as unknown as Record<string, unknown>);
  }
  
  return updated;
}

/**
 * Remove item from order
 */
export async function removeOrderItem(itemId: string): Promise<void> {
  const item = await localDb.orderItems.get(itemId);
  
  if (!item) {
    return;
  }
  
  await localDb.orderItems.delete(itemId);
  
  // Recalculate order totals
  await recalculateOrderTotals(item.orderId);
}

// ============================================================================
// Totals Calculation
// ============================================================================

const TAX_RATE = 0.075; // 7.5%
const SERVICE_CHARGE_RATE = 0.10; // 10%

/**
 * Recalculate order totals
 */
async function recalculateOrderTotals(orderId: string): Promise<void> {
  const order = await localDb.orders.get(orderId);
  const items = await getOrderItems(orderId);
  
  if (!order) {
    return;
  }
  
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxAmount = subtotal * TAX_RATE;
  const serviceCharge = subtotal * SERVICE_CHARGE_RATE;
  const totalAmount = subtotal + taxAmount + serviceCharge - order.discountAmount + order.tipAmount;
  
  await updateOrderOffline({
    id: orderId,
    // @ts-expect-error - updating multiple fields at once
    subtotal,
    taxAmount,
    serviceCharge,
    totalAmount
  } as UpdateOrderInput);
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Get active orders (not completed or cancelled)
 */
export async function getActiveOrders(): Promise<LocalOrder[]> {
  return localDb.orders
    .filter(order => order.status !== 'completed' && order.status !== 'cancelled')
    .toArray();
}

/**
 * Get orders by table
 */
export async function getOrdersByTable(tableNumber: number): Promise<LocalOrder[]> {
  return localDb.orders
    .filter(order => order.tableNumber === tableNumber && 
                     order.status !== 'completed' && 
                     order.status !== 'cancelled')
    .toArray();
}

/**
 * Get today's orders
 */
export async function getTodaysOrders(): Promise<LocalOrder[]> {
  const today = new Date().toISOString().split('T')[0];
  
  return localDb.orders
    .filter(order => order.orderTime.startsWith(today))
    .toArray();
}

/**
 * Get pending sync count for orders
 */
export async function getPendingOrderSyncCount(): Promise<number> {
  return localDb.orders
    .filter(order => order.syncStatus === 'pending')
    .count();
}

// ============================================================================
// Kitchen Display
// ============================================================================

/**
 * Get kitchen queue (items waiting to be prepared)
 */
export async function getKitchenQueue(): Promise<LocalOrderItem[]> {
  const orders = await getActiveOrders();
  const orderIds = orders.map(o => o.id);
  
  return localDb.orderItems
    .filter(item => orderIds.includes(item.orderId) && 
                    item.kitchenStatus !== 'served')
    .toArray();
}

// ============================================================================
// Sync Helpers
// ============================================================================

/**
 * Sync orders from cloud
 */
export async function syncOrdersFromCloud(
  cloudOrders: LocalOrder[]
): Promise<number> {
  let synced = 0;
  
  for (const cloudOrder of cloudOrders) {
    const local = await localDb.orders.get(cloudOrder.id);
    
    if (!local) {
      await localDb.orders.put({
        ...cloudOrder,
        syncStatus: 'synced'
      });
      synced++;
    } else if (local.syncStatus === 'synced') {
      if (local.checksum !== cloudOrder.checksum) {
        await localDb.orders.put({
          ...cloudOrder,
          syncStatus: 'synced'
        });
        synced++;
      }
    }
  }
  
  return synced;
}
