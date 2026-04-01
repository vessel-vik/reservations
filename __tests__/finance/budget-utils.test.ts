import { describe, it, expect } from 'vitest';
import { compareBudgetToActual, getOverBudgetCategories, type BudgetComparison } from '../../lib/budget-utils';

describe('budget-utils: compareBudgetToActual', () => {
  it('returns ok when actual < 80% of limit', () => {
    const budgets = { rent: 100000 };
    const actuals = { rent: 79000 };
    
    const result = compareBudgetToActual(budgets, actuals);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      category: 'rent',
      status: 'ok',
      percentage: 79,
      overage: 0
    }));
  });

  it('returns warn when actual is 80–100% of limit', () => {
    const budgets = { marketing: 50000, utilities: 10000 };
    const actuals = { marketing: 40000, utilities: 10000 };
    
    const result = compareBudgetToActual(budgets, actuals);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'marketing', status: 'warn', percentage: 80 }),
      expect.objectContaining({ category: 'utilities', status: 'warn', percentage: 100 })
    ]));
  });

  it('returns over when actual exceeds limit', () => {
    const budgets = { supplies: 20000 };
    const actuals = { supplies: 21000 };
    
    const result = compareBudgetToActual(budgets, actuals);
    expect(result[0]).toEqual(expect.objectContaining({
      category: 'supplies',
      status: 'over',
      percentage: 105,
      overage: 1000
    }));
  });

  it('calculates percentage and overage correctly', () => {
    const budgets = { salaries: 150000 };
    const actuals = { salaries: 151500 };
    
    const result = compareBudgetToActual(budgets, actuals);
    expect(result[0].percentage).toBe(101);
    expect(result[0].overage).toBe(1500);
  });

  it('limit=0: percentage=0, overage=0, status=ok (no division by zero)', () => {
    const budgets = { maintenance: 0 };
    const actuals = { maintenance: 5000 };
    
    const result = compareBudgetToActual(budgets, actuals);
    expect(result[0]).toEqual(expect.objectContaining({
      category: 'maintenance',
      limit: 0,
      actual: 5000,
      percentage: 0,
      overage: 0,
      status: 'ok'
    }));
  });

  it('category in actuals but not budgets: limit=0, status=ok', () => {
    const budgets = {};
    const actuals = { other: 1000 };
    
    const result = compareBudgetToActual(budgets, actuals);
    expect(result[0]).toEqual(expect.objectContaining({
      category: 'other',
      limit: 0,
      actual: 1000,
      percentage: 0,
      overage: 0,
      status: 'ok'
    }));
  });

  it('category in budgets but not actuals: actual=0, percentage=0, status=ok', () => {
    const budgets = { operational: 25000 };
    const actuals = {};
    
    const result = compareBudgetToActual(budgets, actuals);
    expect(result[0]).toEqual(expect.objectContaining({
      category: 'operational',
      limit: 25000,
      actual: 0,
      percentage: 0,
      overage: 0,
      status: 'ok'
    }));
  });
});

describe('budget-utils: getOverBudgetCategories', () => {
  it('returns only over-status items', () => {
    const comparisons: BudgetComparison[] = [
      { category: 'rent', limit: 100, actual: 50, percentage: 50, overage: 0, status: 'ok' },
      { category: 'utilities', limit: 100, actual: 90, percentage: 90, overage: 0, status: 'warn' },
      { category: 'marketing', limit: 100, actual: 110, percentage: 110, overage: 10, status: 'over' },
      { category: 'supplies', limit: 100, actual: 150, percentage: 150, overage: 50, status: 'over' }
    ];
    
    const overBudget = getOverBudgetCategories(comparisons);
    expect(overBudget).toHaveLength(2);
    expect(overBudget.map(b => b.category)).toEqual(['marketing', 'supplies']);
  });

  it('returns empty array when all within budget', () => {
    const comparisons: BudgetComparison[] = [
      { category: 'rent', limit: 100, actual: 50, percentage: 50, overage: 0, status: 'ok' },
      { category: 'utilities', limit: 100, actual: 90, percentage: 90, overage: 0, status: 'warn' },
    ];
    
    expect(getOverBudgetCategories(comparisons)).toEqual([]);
  });
});
