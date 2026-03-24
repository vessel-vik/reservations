import { NextRequest, NextResponse } from 'next/server';
import { databases, DATABASE_ID, EXPENSES_COLLECTION_ID } from '@/lib/appwrite.config';
import { Query, ID } from 'appwrite';
import { createExpense, getExpenses, updateExpensePayment, deleteExpense } from '@/lib/actions/expense.actions';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const category = searchParams.get('category') || undefined;
    const paymentStatus = searchParams.get('paymentStatus') as 'pending' | 'paid' | 'cancelled' | undefined;
    
    const result = await getExpenses({
      startDate,
      endDate,
      category: category as any,
      paymentStatus,
      limit: 200
    });
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    
    // Calculate summary
    const expenses = result.expenses || [];
    console.log('[Expenses API] Found expenses:', expenses.length);
    if (expenses.length > 0) {
      console.log('[Expenses API] First expense keys:', Object.keys(expenses[0]));
    }
    
    const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || exp.totalAmount || 0), 0);
    const totalVat = expenses.reduce((sum, exp) => sum + (exp.vatAmount || 0), 0);
    
    return NextResponse.json({
      expenses,
      summary: {
        count: expenses.length,
        totalAmount,
        totalVat,
        totalWithVat: totalAmount + totalVat
      }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const result = await createExpense({
      supplierName: body.supplierName,
      supplierTin: body.supplierTin,
      category: body.category,
      description: body.description,
      amount: body.amount,
      vatCategory: body.vatCategory,
      invoiceNumber: body.invoiceNumber,
      invoiceDate: body.invoiceDate,
      dueDate: body.dueDate,
      notes: body.notes
    });
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    
    return NextResponse.json({ expense: result.expense });
  } catch (error) {
    console.error('Error creating expense:', error);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { expenseId, status, paymentDate } = body;
    
    const result = await updateExpensePayment(expenseId, status, paymentDate);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating expense:', error);
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const expenseId = searchParams.get('expenseId');
    
    if (!expenseId) {
      return NextResponse.json({ error: 'Expense ID required' }, { status: 400 });
    }
    
    const result = await deleteExpense(expenseId);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting expense:', error);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
