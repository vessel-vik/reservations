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

        expect(mockQueue).toHaveBeenCalledTimes(1);
        const [jobType, content, meta] = mockQueue.mock.calls[0];
        expect(jobType).toBe('captain_docket');
        const payload = JSON.parse(String(content));
        expect(payload.orderId).toBe('order-123');
        expect(typeof payload.correlationKey).toBe('string');
        expect(meta).toEqual(expect.objectContaining({
            printMode: 'queued',
            requeueReason: 'initial_docket',
        }));
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

        expect(mockQueue).toHaveBeenCalledTimes(1);
        const [jobType, content, meta] = mockQueue.mock.calls[0];
        expect(jobType).toBe('kitchen_delta');
        const payload = JSON.parse(String(content));
        expect(payload.orderId).toBe('order-123');
        expect(payload.deltaItems).toEqual(delta);
        expect(typeof payload.correlationKey).toBe('string');
        expect(meta).toEqual(expect.objectContaining({
            printMode: 'queued',
            requeueReason: 'order_update_docket',
        }));
        expect(result).toEqual({ success: true });
    });

    it('includes dedupeKey when provided', async () => {
        const mockQueue = vi.fn().mockResolvedValue(undefined);
        (window as any).queuePrintJob = mockQueue;
        const delta = [{ name: 'Savanna', quantity: 1, price: 350 }];
        await printKitchenDelta('order-123', delta, 'delta-key-1');
        const [, content, meta] = mockQueue.mock.calls[0];
        const payload = JSON.parse(String(content));
        expect(payload).toEqual(expect.objectContaining({
            orderId: 'order-123',
            deltaItems: delta,
            correlationKey: 'delta-key-1',
        }));
        expect(meta).toEqual(expect.objectContaining({
            correlationKey: 'delta-key-1',
        }));
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
