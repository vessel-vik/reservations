import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FinanceKPIStrip } from '@/components/reports/FinanceKPIStrip';

const mockKpiData = {
  totalIncome: 100000,
  totalExpenses: 40000,
  netProfit: 60000,
  netVat: -2000,  // They get money back or owe, standard formatting applies
  outputVat: 5000,
  inputVat: 7000,
  profitMargin: 60,
  orderCount: 15,
  expenseCount: 5
};

describe('FinanceKPIStrip', () => {
  it('renders Revenue value from /api/reports/accounting response', () => {
    render(
      <FinanceKPIStrip 
        kpiData={mockKpiData} 
        period="month" 
        onPeriodChange={vi.fn()} 
        loading={false} 
      />
    );
    expect(screen.getByText(/KSh 100,000/i)).toBeInTheDocument();
  });

  it('renders Expenses value from /api/reports/accounting response', () => {
    render(
      <FinanceKPIStrip 
        kpiData={mockKpiData} 
        period="month" 
        onPeriodChange={vi.fn()} 
        loading={false} 
      />
    );
    expect(screen.getByText(/KSh 40,000/i)).toBeInTheDocument();
  });

  it('renders Net Profit value from /api/reports/accounting response', () => {
    render(
      <FinanceKPIStrip 
        kpiData={mockKpiData} 
        period="month" 
        onPeriodChange={vi.fn()} 
        loading={false} 
      />
    );
    expect(screen.getByText(/KSh 60,000/i)).toBeInTheDocument();
  });

  it('renders VAT Due (netVat) value from /api/reports/accounting response', () => {
    render(
      <FinanceKPIStrip 
        kpiData={mockKpiData} 
        period="month" 
        onPeriodChange={vi.fn()} 
        loading={false} 
      />
    );
    // netVat = -2000 => format could be "KSh -2,000"
    expect(screen.getByText(/KSh -2,000/i)).toBeInTheDocument();
  });

  it('profit card uses emerald-400 text when positive', () => {
    render(
      <FinanceKPIStrip 
        kpiData={mockKpiData} 
        period="month" 
        onPeriodChange={vi.fn()} 
        loading={false} 
      />
    );
    const profitText = screen.getByText(/KSh 60,000/i);
    expect(profitText).toHaveClass('text-emerald-400');
  });

  it('profit card uses red-400 text when negative', () => {
    render(
      <FinanceKPIStrip 
        kpiData={{ ...mockKpiData, netProfit: -500 }} 
        period="month" 
        onPeriodChange={vi.fn()} 
        loading={false} 
      />
    );
    const profitText = screen.getByText(/KSh -500/i);
    expect(profitText).toHaveClass('text-red-400');
  });

  it('clicking "Week" button calls onPeriodChange with "week"', () => {
    const onPeriodChange = vi.fn();
    render(
      <FinanceKPIStrip 
        kpiData={mockKpiData} 
        period="month" 
        onPeriodChange={onPeriodChange} 
        loading={false} 
      />
    );
    const weekBtn = screen.getByRole('button', { name: /week/i });
    fireEvent.click(weekBtn);
    expect(onPeriodChange).toHaveBeenCalledWith('week');
  });

  it('shows loading skeleton during fetch', () => {
    const { container } = render(
      <FinanceKPIStrip 
        kpiData={null} 
        period="month" 
        onPeriodChange={vi.fn()} 
        loading={true} 
      />
    );
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
