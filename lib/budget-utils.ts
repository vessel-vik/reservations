export type BudgetStatus = 'ok' | 'warn' | 'over';

export interface BudgetComparison {
  category: string;
  limit: number;        // 0 = no budget set
  actual: number;
  percentage: number;   // actual / limit * 100; 0 when limit is 0
  overage: number;      // actual - limit; 0 when not over
  status: BudgetStatus; // ok: <80%, warn: 80-100%, over: >100%
}

export function compareBudgetToActual(
  budgets: Record<string, number>,
  actuals: Record<string, number>
): BudgetComparison[] {
  const categories = new Set([...Object.keys(budgets), ...Object.keys(actuals)]);
  const comparisons: BudgetComparison[] = [];

  for (const category of categories) {
    const limit = budgets[category] || 0;
    const actual = actuals[category] || 0;
    
    let percentage = 0;
    if (limit > 0) {
      percentage = Math.round((actual / limit) * 100);
    }

    let overage = 0;
    if (limit > 0 && actual > limit) {
      overage = actual - limit;
    }

    let status: BudgetStatus = 'ok';
    if (limit > 0) {
      if (percentage >= 80 && percentage <= 100) {
        status = 'warn';
      } else if (percentage > 100) {
        status = 'over';
      }
    }

    comparisons.push({
      category,
      limit,
      actual,
      percentage,
      overage,
      status
    });
  }

  return comparisons;
}

export function getOverBudgetCategories(comparisons: BudgetComparison[]): BudgetComparison[] {
  return comparisons.filter(c => c.status === 'over');
}
