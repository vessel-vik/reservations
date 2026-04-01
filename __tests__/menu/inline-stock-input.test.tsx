import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InlineStockInput } from '@/components/admin/menu/InlineStockInput';

// Mock fetch
global.fetch = vi.fn();

beforeEach(() => {
  (global.fetch as any).mockClear();
});

describe('InlineStockInput', () => {
  it('renders current stock value', () => {
    render(<InlineStockInput itemId="item1" stock={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('clicking field enters edit mode', () => {
    render(<InlineStockInput itemId="item1" stock={42} />);
    fireEvent.click(screen.getByText('42'));
    expect(screen.getByDisplayValue('42')).toBeInTheDocument();
  });

  it('pressing Enter triggers PATCH /api/menu/items/[id]', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<InlineStockInput itemId="item1" stock={42} />);
    
    fireEvent.click(screen.getByText('42'));
    const input = screen.getByDisplayValue('42');
    fireEvent.change(input, { target: { value: '50' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/menu/items/item1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ stock: 50 })
      }));
    });
  });

  it('rejects negative values and does not save', () => {
    render(<InlineStockInput itemId="item1" stock={42} />);
    
    fireEvent.click(screen.getByText('42'));
    const input = screen.getByDisplayValue('42');
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Cannot be negative/i)).toBeInTheDocument();
  });
});
