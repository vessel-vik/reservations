import { NextResponse, NextRequest } from "next/server";
import { getBudgetsByMonth, upsertBudget, updateBudgetLimit } from "@/lib/actions/budget.actions";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const monthQuery = url.searchParams.get('month'); // YYYY-MM
    
    if (!monthQuery || !/^\d{4}-\d{2}$/.test(monthQuery)) {
      return NextResponse.json({ error: 'Invalid month format. Expected YYYY-MM' }, { status: 400 });
    }

    const [yearStr, monthStr] = monthQuery.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const budgets = await getBudgetsByMonth(month, year);
    return NextResponse.json(budgets);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch budgets' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, monthlyLimit, month, year } = body;

    if (!category) return NextResponse.json({ error: 'category is required' }, { status: 400 });
    if (typeof monthlyLimit !== 'number' || monthlyLimit <= 0) {
      return NextResponse.json({ error: 'monthlyLimit must be a positive number' }, { status: 400 });
    }

    const validCategories = [
      'operational', 'rent', 'utilities', 'supplies', 'marketing', 
      'salaries', 'maintenance', 'insurance', 'professional-services', 'food_supplies', 'beverages', 'equipment', 'professional_services', 'transport', 'other'
    ];
    // We accommodate both hyphen and underscore versions found in earlier types
    const flatCat = category.replace('_', '-');
    const isValid = validCategories.some(c => c.replace('_', '-') === flatCat);
    if (!isValid && category !== 'other') {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const budget = await upsertBudget({ category, monthlyLimit, month, year });
    return NextResponse.json({ budget }, { status: budget.budgetId ? 200 : 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save budget' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { budgetId, monthlyLimit } = body;

    if (!budgetId) return NextResponse.json({ error: 'budgetId is required' }, { status: 400 });
    if (typeof monthlyLimit !== 'number' || monthlyLimit <= 0) {
      return NextResponse.json({ error: 'monthlyLimit must be a positive number' }, { status: 400 });
    }

    await updateBudgetLimit(budgetId, monthlyLimit);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Budget not found') {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update budget' }, { status: 500 });
  }
}
