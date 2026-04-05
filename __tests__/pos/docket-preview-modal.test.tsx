// __tests__/pos/docket-preview-modal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocketPreviewModal } from '@/components/pos/DocketPreviewModal';

const baseOrder = {
    orderNumber: 'KITCHEN-8244',
    tableNumber: 71,
    waiterName: 'Ham Chulo',
    totalAmount: 1300,
    items: [
        { $id: 'a1', name: 'Savanna', price: 350, quantity: 1 },
        { $id: 'a2', name: 'Pilsner', price: 300, quantity: 2 },
    ],
    createdAt: '2026-04-05T13:57:58.000Z',
};

describe('DocketPreviewModal', () => {
    it('renders nothing when closed', () => {
        const { container } = render(
            <DocketPreviewModal
                isOpen={false}
                onClose={vi.fn()}
                onEdit={vi.fn()}
                order={baseOrder}
                type="new"
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('shows all items and CAPTAIN ORDER header for type=new', () => {
        render(
            <DocketPreviewModal
                isOpen={true}
                onClose={vi.fn()}
                onEdit={vi.fn()}
                order={baseOrder}
                type="new"
            />
        );
        expect(screen.getByText('CAPTAIN ORDER')).toBeInTheDocument();
        expect(screen.getByText('Savanna')).toBeInTheDocument();
        expect(screen.getByText('Pilsner')).toBeInTheDocument();
        expect(screen.queryByText(/ADDITION/)).toBeNull();
    });

    it('shows only deltaItems and addition banner for type=addition', () => {
        const delta = [{ name: 'Jameson 50ml', quantity: 1, price: 550 }];
        render(
            <DocketPreviewModal
                isOpen={true}
                onClose={vi.fn()}
                onEdit={vi.fn()}
                order={baseOrder}
                deltaItems={delta}
                type="addition"
            />
        );
        expect(screen.getByText(/ADDITION/)).toBeInTheDocument();
        expect(screen.getByText('Jameson 50ml')).toBeInTheDocument();
        // Original order items should NOT appear
        expect(screen.queryByText('Savanna')).toBeNull();
    });

    it('calls onEdit when Edit Order button clicked', () => {
        const onEdit = vi.fn();
        render(
            <DocketPreviewModal
                isOpen={true}
                onClose={vi.fn()}
                onEdit={onEdit}
                order={baseOrder}
                type="new"
            />
        );
        fireEvent.click(screen.getByText(/Edit/));
        expect(onEdit).toHaveBeenCalled();
    });

    it('calls onClose when Done button clicked', () => {
        const onClose = vi.fn();
        render(
            <DocketPreviewModal
                isOpen={true}
                onClose={onClose}
                onEdit={vi.fn()}
                order={baseOrder}
                type="new"
            />
        );
        fireEvent.click(screen.getByText('Done'));
        expect(onClose).toHaveBeenCalled();
    });
});
