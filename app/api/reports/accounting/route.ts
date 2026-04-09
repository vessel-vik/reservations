import { NextRequest, NextResponse } from 'next/server';
import { databases, DATABASE_ID, ORDERS_COLLECTION_ID, EXPENSES_COLLECTION_ID } from '@/lib/appwrite.config';
import { Query } from 'node-appwrite';
import { parseStringify } from '@/lib/utils';
import { getAuthContext, validateBusinessContext } from '@/lib/auth.utils';

const PAYMENT_LEDGER_COLLECTION_ID = process.env.PAYMENT_LEDGER_COLLECTION_ID;

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    console.log('[Accounting API] Request params:', { startDate, endDate });
    
    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
      console.error('[Accounting API] Missing database configuration', { DATABASE_ID, ORDERS_COLLECTION_ID });
      return NextResponse.json({ 
        error: 'Database configuration missing',
        details: 'Please check DATABASE_ID and ORDERS_COLLECTION_ID environment variables'
      }, { status: 500 });
    }

    // Handle missing expenses collection gracefully
    const hasExpensesCollection = EXPENSES_COLLECTION_ID && EXPENSES_COLLECTION_ID.length > 0;
    
    if (!hasExpensesCollection) {
      console.warn('EXPENSES_COLLECTION_ID not configured - returning orders only');
    }

    const ordersQueries: any[] = [
      Query.equal('businessId', businessId),
      // Only filter by paymentStatus=paid to include all paid orders
      Query.equal('paymentStatus', 'paid'),
      Query.limit(500)
    ];
    
    const expensesQueries: any[] = [
      Query.equal('businessId', businessId),
      Query.equal('paymentStatus', 'paid'),
      Query.limit(500)
    ];
    
    // Date filters
    if (startDate && endDate) {
      // Use start of startDate and end of endDate for proper range filtering
      const startDateTime = new Date(startDate).toISOString();
      const endDateTime = new Date(endDate + 'T23:59:59.999').toISOString();
      
      ordersQueries.push(Query.greaterThanEqual('$createdAt', startDateTime));
      ordersQueries.push(Query.lessThanEqual('$createdAt', endDateTime));
      expensesQueries.push(Query.greaterThanEqual('invoiceDate', startDate));
      expensesQueries.push(Query.lessThanEqual('invoiceDate', endDate));
    }
    
    ordersQueries.push(Query.orderDesc('$createdAt'));
    expensesQueries.push(Query.orderDesc('$createdAt'));

    // Fetch orders (always required)
    const ordersResult = await databases.listDocuments(
      DATABASE_ID, 
      ORDERS_COLLECTION_ID, 
      ordersQueries
    );

    // Fetch expenses only if collection is configured
    let expensesResult;
    const expensesCollectionId = EXPENSES_COLLECTION_ID;
    if (hasExpensesCollection && expensesCollectionId) {
      expensesResult = await databases.listDocuments(
        DATABASE_ID, 
        expensesCollectionId, 
        expensesQueries
      );
    }

    const orders = parseStringify(ordersResult.documents);
    console.log('[Accounting API] Found orders:', orders.length);
    if (orders.length > 0) {
      console.log('[Accounting API] First order keys:', Object.keys(orders[0]));
      console.log('[Accounting API] First order sample:', {
        $id: orders[0].$id,
        status: orders[0].status,
        paymentStatus: orders[0].paymentStatus,
        total: orders[0].total,
        totalAmount: orders[0].totalAmount,
        subtotal: orders[0].subtotal,
        vatAmount: orders[0].vatAmount || orders[0].taxAmount,
        serviceCharge: orders[0].serviceCharge,
        createdAt: orders[0].createdAt
      });
    }
    
    // Initialize expenses as empty array if collection not configured
    let expenses: any[] = [];
    if (hasExpensesCollection && expensesResult) {
      expenses = parseStringify(expensesResult.documents);
    }
    
    // Legacy order-derived revenue fallback (used when no ledger rows exist)
    const totalIncomeFromOrders = orders.reduce((sum: number, order: any) => {
      const total = order.total || order.totalAmount || order.grandTotal || 0;
      return sum + total;
    }, 0);
    
    // Calculate output VAT with reverse-calculation for legacy orders
    const outputVat = orders.reduce((sum: number, order: any) => {
      const taxAmount = order.vatAmount || order.taxAmount || 0;
      if (taxAmount > 0) {
        // New orders with proper taxAmount
        return sum + taxAmount;
      }
      // Legacy orders: reverse-calculate from totalAmount
      const totalAmount = order.totalAmount || order.total || order.grandTotal || 0;
      if (totalAmount > 0) {
        const subtotal = totalAmount / 1.16;
        return sum + (subtotal * 0.16);
      }
      return sum;
    }, 0);
    
    let ledgerIncome = 0;
    let ledgerOrderCount = 0;
    const paymentMethodTotals: Record<string, number> = {};
    if (PAYMENT_LEDGER_COLLECTION_ID) {
      const ledgerQueries: any[] = [
        Query.equal("businessId", businessId),
        Query.equal("status", "confirmed"),
        Query.limit(5000),
      ];
      if (startDate && endDate) {
        const startDateTime = new Date(startDate).toISOString();
        const endDateTime = new Date(endDate + 'T23:59:59.999').toISOString();
        ledgerQueries.push(Query.greaterThanEqual("settledAt", startDateTime));
        ledgerQueries.push(Query.lessThanEqual("settledAt", endDateTime));
      }
      ledgerQueries.push(Query.orderDesc("$createdAt"));

      try {
        const ledgerResult = await databases.listDocuments(
          DATABASE_ID,
          PAYMENT_LEDGER_COLLECTION_ID,
          ledgerQueries
        );
        const ledgerRows = parseStringify(ledgerResult.documents);
        const uniqueOrderIds = new Set<string>();
        ledgerIncome = ledgerRows.reduce((sum: number, row: any) => {
          const amount = Number(row.amount) || 0;
          const method = String(row.method || "unknown").toLowerCase();
          paymentMethodTotals[method] = (paymentMethodTotals[method] || 0) + amount;
          if (row.orderId) uniqueOrderIds.add(String(row.orderId));
          return sum + amount;
        }, 0);
        ledgerOrderCount = uniqueOrderIds.size;
      } catch (ledgerErr) {
        console.warn("[Accounting API] Ledger query failed, falling back to orders:", ledgerErr);
      }
    }

    const totalIncome = ledgerIncome > 0 ? ledgerIncome : totalIncomeFromOrders;

    const totalExpenses = expenses.reduce((sum: number, exp: any) => {
      return sum + (exp.totalAmount || exp.amount || 0);
    }, 0);
    const netProfit = totalIncome - totalExpenses;
    
    const inputVat = expenses.reduce((sum: number, exp: any) => {
      return sum + (exp.vatAmount || 0);
    }, 0);
    const netVat = outputVat - inputVat;
    
    // Category breakdown for expenses
    const expenseByCategory: Record<string, number> = {};
    for (const exp of expenses) {
      const cat = exp.category || 'Other';
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + (exp.totalAmount || exp.amount || 0);
    }
    
    // Calculate profit margin
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
    
    return NextResponse.json({
      summary: {
        totalIncome,
        totalExpenses,
        netProfit,
        outputVat,
        inputVat,
        netVat,
        profitMargin,
        orderCount: ledgerOrderCount > 0 ? ledgerOrderCount : orders.length,
        revenueSource: ledgerIncome > 0 ? "payment_ledger" : "orders",
        paymentMethodTotals,
        expenseCount: expenses.length
      },
      expenseByCategory,
      orders: orders.slice(0, 100), // Limit for display
      expenses: expenses.slice(0, 100)
    });
  } catch (error) {
    console.error('Error fetching accounting summary:', error);
    return NextResponse.json({ error: 'Failed to fetch accounting data' }, { status: 500 });
  }
}
