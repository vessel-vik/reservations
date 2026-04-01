import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseDrawer } from '@/components/reports/ExpenseDrawer';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/actions/expense.actions', () => ({
  createExpense: vi.fn().mockResolvedValue({ success: true }),
  updateExpense: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/components/reports/ReceiptUpload', () => ({
  ReceiptUpload: ({
    onFileStaged,
    onRemoved,
  }: {
    onFileStaged: (f: File) => void;
    onRemoved: () => void;
  }) => (
    <div data-testid="receipt-upload">
      <button
        type="button"
        onClick={() =>
          onFileStaged(new File(['x'], 'receipt.jpg', { type: 'image/jpeg' }))
        }
      >
        Stage File
      </button>
      <button type="button" onClick={onRemoved}>
        Remove
      </button>
    </div>
  ),
}));

describe('ExpenseDrawer', () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = () => {
    render(<ExpenseDrawer open={true} expense={null} onClose={onClose} onSaved={onSaved} />);
  };

  async function fillRequiredFields() {
    await userEvent.type(screen.getByLabelText(/supplier name/i), 'Acme Supplier');
    await userEvent.type(screen.getByLabelText(/description/i), 'Monthly food supplies delivery');
    await userEvent.clear(screen.getByLabelText(/amount \(excl/i));
    await userEvent.type(screen.getByLabelText(/amount \(excl/i), '1000');
    fireEvent.change(screen.getByLabelText(/invoice date/i), { target: { value: '2026-03-10' } });
  }

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

  describe('VAT preview', () => {
    it('shows VAT breakdown when vatCategory is standard and amount is entered', async () => {
      render(<ExpenseDrawer open={true} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />);
      await userEvent.clear(screen.getByLabelText(/amount \(excl/i));
      await userEvent.type(screen.getByLabelText(/amount \(excl/i), '1000');
      expect(await screen.findByText(/VAT \(16%\)/)).toBeInTheDocument();
      expect(screen.getByText(/160/)).toBeInTheDocument();
    });

    it('does not show VAT amount when vatCategory is zero-rated', async () => {
      render(<ExpenseDrawer open={true} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />);
      await userEvent.clear(screen.getByLabelText(/amount \(excl/i));
      await userEvent.type(screen.getByLabelText(/amount \(excl/i), '1000');
      fireEvent.change(screen.getByRole('combobox', { name: /vat category/i }), {
        target: { value: 'zero-rated' },
      });
      await waitFor(() =>
        expect(screen.queryByText(/VAT \(16%\)/)).not.toBeInTheDocument()
      );
    });
  });

  describe('dueDate validation', () => {
    it('shows error when dueDate is before invoiceDate', async () => {
      render(<ExpenseDrawer open={true} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />);
      await fillRequiredFields();
      fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-05' } });
      await userEvent.click(screen.getByRole('button', { name: /save expense/i }));
      expect(await screen.findByText(/due date must be on or after/i)).toBeInTheDocument();
    });
  });

  describe('upload flow', () => {
    it('button is disabled while upload is in-flight', async () => {
      vi.spyOn(global, 'fetch').mockImplementationOnce(
        () => new Promise<Response>(() => {}) // never resolves
      );
      render(<ExpenseDrawer open={true} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />);
      await fillRequiredFields();
      await userEvent.click(screen.getByRole('button', { name: /stage file/i }));
      const submitBtn = screen.getByRole('button', { name: /save expense/i });
      userEvent.click(submitBtn); // intentionally not awaited — we want in-flight state
      await waitFor(() => expect(submitBtn).toBeDisabled());
    });

    it('shows error toast and keeps drawer open when upload fails', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 })
      );
      render(<ExpenseDrawer open={true} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />);
      await fillRequiredFields();
      await userEvent.click(screen.getByRole('button', { name: /stage file/i }));
      await userEvent.click(screen.getByRole('button', { name: /save expense/i }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Upload failed')
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
