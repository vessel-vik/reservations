// __tests__/print/print-utils.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sonner before importing print.utils
vi.mock('sonner', () => ({ toast: { error: vi.fn(), message: vi.fn() } }));
// ThermalPrinterClient is no longer used — mock it to ensure it's never called
vi.mock('@/lib/thermal-printer', () => ({ ThermalPrinterClient: { loadConfig: vi.fn() } }));

import { toast } from 'sonner';
import { ThermalPrinterClient } from '@/lib/thermal-printer';
import { printOrderDocket, printKitchenDelta } from '@/lib/print.utils';

beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).queuePrintJob;
});

describe('printOrderDocket', () => {
    it('calls window.queuePrintJob with captain_docket and returns success', async () => {
        const mockQueue = vi.fn().mockResolvedValue(undefined);
        (window as any).queuePrintJob = mockQueue;

        const result = await printOrderDocket('order-123');

        expect(mockQueue).toHaveBeenCalledWith('captain_docket', 'orderId:order-123');
        expect(result).toEqual({ success: true });
        expect(ThermalPrinterClient.loadConfig).not.toHaveBeenCalled();
    });

    it('shows toast.error and returns failure when PrintBridge not mounted', async () => {
        const result = await printOrderDocket('order-456');

        expect(result.success).toBe(false);
        expect(toast.error).toHaveBeenCalledWith(
            expect.stringContaining('Print bridge not ready')
        );
    });
});

describe('printKitchenDelta', () => {
    it('calls window.queuePrintJob with kitchen_delta JSON payload', async () => {
        const mockQueue = vi.fn().mockResolvedValue(undefined);
        (window as any).queuePrintJob = mockQueue;

        const delta = [{ name: 'Savanna', quantity: 1, price: 350 }];
        const result = await printKitchenDelta('order-123', delta);

        expect(mockQueue).toHaveBeenCalledWith(
            'kitchen_delta',
            JSON.stringify({ orderId: 'order-123', deltaItems: delta })
        );
        expect(result).toEqual({ success: true });
    });

    it('returns success without queuing when deltaItems is empty', async () => {
        const mockQueue = vi.fn();
        (window as any).queuePrintJob = mockQueue;

        const result = await printKitchenDelta('order-123', []);
        expect(result).toEqual({ success: true });
        expect(mockQueue).not.toHaveBeenCalled();
    });

    it('shows toast.error and returns failure when PrintBridge not mounted', async () => {
        const delta = [{ name: 'Wine', quantity: 2, price: 700 }];
        const result = await printKitchenDelta('order-456', delta);

        expect(result.success).toBe(false);
        expect(toast.error).toHaveBeenCalledWith(
            expect.stringContaining('Print bridge not ready')
        );
    });
});
