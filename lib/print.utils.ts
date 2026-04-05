import { toast } from 'sonner';

function getQueueFn(): ((jobType: string, content: string) => Promise<void>) | null {
    if (typeof window === 'undefined') return null;
    const fn = (window as any).queuePrintJob;
    return typeof fn === 'function' ? fn : null;
}

const BRIDGE_NOT_READY_MSG =
    'Print bridge not ready — reload the page or contact the admin.';

/**
 * Full captain / kitchen docket for an order (all lines).
 * Always queues via PrintBridge — never opens USB directly.
 */
export async function printOrderDocket(
    orderId: string
): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined') {
        return { success: false, error: 'Print is only available in the browser' };
    }
    const queue = getQueueFn();
    if (!queue) {
        toast.error(BRIDGE_NOT_READY_MSG);
        return { success: false, error: 'PrintBridge not mounted' };
    }
    await queue('captain_docket', `orderId:${orderId}`);
    return { success: true };
}

/**
 * Delta slip: only newly added items (output of computeKitchenDeltaForOrder, enriched with price).
 * Always queues via PrintBridge.
 */
export async function printKitchenDelta(
    orderId: string,
    deltaItems: { name: string; quantity: number; price: number }[]
): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined') {
        return { success: false, error: 'Print is only available in the browser' };
    }
    if (deltaItems.length === 0) return { success: true };

    const queue = getQueueFn();
    if (!queue) {
        toast.error(BRIDGE_NOT_READY_MSG);
        return { success: false, error: 'PrintBridge not mounted' };
    }
    await queue('kitchen_delta', JSON.stringify({ orderId, deltaItems }));
    return { success: true };
}
