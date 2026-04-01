import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AvailabilityToggle } from '@/components/admin/menu/AvailabilityToggle';

global.fetch = vi.fn();

describe('AvailabilityToggle', () => {
  it('renders in ON state when isAvailable=true', () => {
    const { container } = render(<AvailabilityToggle itemId="item1" isAvailable={true} stock={10} onSaved={() => {}} />);
    expect(container.querySelector('.text-emerald-400')).toBeInTheDocument();
  });

  it('is not clickable (disabled) when stock = 0', () => {
    render(<AvailabilityToggle itemId="item1" isAvailable={false} stock={0} onSaved={() => {}} />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('optimistically updates before API resolves', async () => {
    let resolveApi: any;
    const promise = new Promise((r) => { resolveApi = r; });
    (global.fetch as any).mockReturnValueOnce(promise);

    const { container } = render(<AvailabilityToggle itemId="item1" isAvailable={false} stock={10} onSaved={() => {}} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Should immediately show ON (emerald icon) despite API pending
    expect(container.querySelector('.text-emerald-400')).toBeInTheDocument();
    
    resolveApi({ ok: true, json: async () => ({}) });
  });
});
