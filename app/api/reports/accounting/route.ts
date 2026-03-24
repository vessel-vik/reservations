import { NextRequest, NextResponse } from 'next/server';
import { databases, DATABASE_ID, ORDERS_COLLECTION_ID, EXPENSES_COLLECTION_ID } from '@/lib/appwrite.config';
import { Query } from 'appwrite';
import { parseStringify } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
      console.error('Missing database configuration');
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
      Query.equal('status', 'paid'),
      Query.notEqual('paymentStatus', 'settled'),
      Query.limit(500)
    ];
    
    const expensesQueries: any[] = [
      Query.equal('paymentStatus', 'paid'),
      Query.limit(500)
    ];
    
    // Date filters
    if (startDate && endDate) {
      ordersQueries.push(Query.greaterThanEqual('$createdAt', startDate));
      ordersQueries.push(Query.lessThanEqual('$createdAt', endDate));
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
    if (hasExpensesCollection) {
      expensesResult = await databases.listDocuments(
        DATABASE_ID, 
        EXPENSES_COLLECTION_ID, 
        expensesQueries
      );
    }

    const orders = parseStringify(ordersResult.documents);
    
    // Initialize expenses as empty array if collection not configured
    let expenses: any[] = [];
    if (hasExpensesCollection && expensesResult) {
      expenses = parseStringify(expensesResult.documents);
    }
    
    // Calculate totals
    const totalIncome = orders.reduce((sum: number, order: any) => sum + (order.total || 0), 0);
    const totalExpenses = expenses.reduce((sum: number, exp: any) => sum + (exp.totalAmount || exp.amount || 0), 0);
    const netProfit = totalIncome - totalExpenses;
    
    // Calculate VAT
    const outputVat = orders.reduce((sum: number, order: any) => sum + (order.vatAmount || 0), 0);
    const inputVat = expenses.reduce((sum: number, exp: any) => sum + (exp.vatAmount || 0), 0);
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
        orderCount: orders.length,
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
