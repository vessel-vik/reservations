import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BudgetAlertBanner } from '../../components/reports/BudgetAlertBanner';
import { BudgetComparison } from '@/lib/budget-utils';

describe('BudgetAlertBanner', () => {
  it('renders nothing (returns null) when overBudgetCategories is empty array', () => {
    const { container } = render(<BudgetAlertBanner overBudgetCategories={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when one category is over budget', () => {
    const mockData: BudgetComparison[] = [
      { category: 'rent', limit: 100, actual: 150, percentage: 150, overage: 50, status: 'over' }
    ];
    render(<BudgetAlertBanner overBudgetCategories={mockData} />);
    expect(screen.getByText(/over budget/i)).toBeInTheDocument();
  });

  it('lists all over-budget category names', () => {
    const mockData: BudgetComparison[] = [
      { category: 'marketing', limit: 100, actual: 150, percentage: 150, overage: 50, status: 'over' },
      { category: 'supplies', limit: 100, actual: 120, percentage: 120, overage: 20, status: 'over' }
    ];
    render(<BudgetAlertBanner overBudgetCategories={mockData} />);
    expect(screen.getByText(/marketing/i)).toBeInTheDocument();
    expect(screen.getByText(/supplies/i)).toBeInTheDocument();
  });

  it('shows formatted KSh overage amount for each over-budget category', () => {
    const mockData: BudgetComparison[] = [
      { category: 'rent', limit: 1000, actual: 1500, percentage: 150, overage: 500, status: 'over' }
    ];
    render(<BudgetAlertBanner overBudgetCategories={mockData} />);
    // Testing numeric formatting KSh 500
    expect(screen.getByText(/500/i)).toBeInTheDocument();
  });
});
