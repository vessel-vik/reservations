import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseDrawer } from '@/components/reports/ExpenseDrawer';

describe('ExpenseDrawer', () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = () => {
    render(<ExpenseDrawer open={true} expense={null} onClose={onClose} onSaved={onSaved} />);
  };

  it('shows inline error when supplierName is empty on submit', async () => {
    setup();
    const submitBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(submitBtn);
    
    expect(await screen.findByText(/supplier name must be at least/i)).toBeInTheDocument();
  });

  it('shows inline error when amount is 0 on submit', async () => {
    setup();
    const amountInput = screen.getByLabelText(/amount/i);
    await userEvent.type(amountInput, '0');
    
    const submitBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(submitBtn);
    
    expect(await screen.findByText(/amount must be greater than 0/i)).toBeInTheDocument();
  });

  it('shows inline error when amount is negative on submit', async () => {
    setup();
    const amountInput = screen.getByLabelText(/amount/i);
    // userEvent can be tricky with negative numbers, fireEvent is direct
    fireEvent.change(amountInput, { target: { value: '-10' } });
    
    const submitBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(submitBtn);
    
    expect(await screen.findByText(/amount must be greater than 0/i)).toBeInTheDocument();
  });

  it('shows inline error when description is empty on submit', async () => {
    setup();
    const submitBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(submitBtn);
    
    expect(await screen.findByText(/description must be at least/i)).toBeInTheDocument();
  });
});
