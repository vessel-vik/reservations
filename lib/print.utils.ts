import { toast } from 'sonner';
import { ThermalPrinterClient } from "@/lib/thermal-printer";
import { loadActiveWaiterSession } from "@/lib/pos-waiter-session";

type PrintJobPayload = {
    orderId: string;
    deltaItems?: { name: string; quantity: number; price: number }[];
    adjustments?: { name: string; quantity: number; note?: string }[];
    note?: string;
    correlationKey: string;
    sessionId?: string;
    waiterUserId?: string;
    waiterName?: string;
    printMode?: "queued" | "direct";
};

type QueueMeta = {
    targetTerminal?: string;
    waiterUserId?: string;
    waiterName?: string;
    correlationKey?: string;
    sessionId?: string;
    printMode?: "queued" | "direct";
    requeueReason?: string;
};

function getQueueFn(): ((jobType: string, content: string, meta?: QueueMeta) => Promise<void>) | null {
    if (typeof window === 'undefined') return null;
    const fn = (window as any).queuePrintJob;
    return typeof fn === 'function' ? fn : null;
}

const BRIDGE_NOT_READY_MSG =
    'Print bridge not ready — reload the page or contact the admin.';

const PRINT_PARALLEL_ENABLED = (() => {
    const centralOn = String(process.env.NEXT_PUBLIC_CENTRAL_POS_MODE_ENABLED || "false").trim().toLowerCase() === "true";
    const parallelOn = String(process.env.NEXT_PUBLIC_PRINT_PARALLEL_MODE_ENABLED || "false").trim().toLowerCase() === "true";
    return centralOn && parallelOn;
})();
const TABLET_QUEUE_ONLY_ENABLED =
    String(process.env.NEXT_PUBLIC_TABLET_QUEUE_ONLY || "true").trim().toLowerCase() !== "false";

function isTabletLikeViewport(): boolean {
    if (typeof window === "undefined") return false;
    const width = window.innerWidth || 0;
    const touch = typeof navigator !== "undefined" && Number(navigator.maxTouchPoints || 0) > 0;
    return touch && width > 0 && width <= 1100;
}

function buildCorrelationKey(prefix: string, orderId: string): string {
    const seed = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}:${orderId}:${seed}`.slice(0, 120);
}

function getSessionWaiterMeta() {
    const session = loadActiveWaiterSession();
    if (!session) return {};
    return {
        sessionId: session.sessionId,
        waiterUserId: session.waiterUserId,
        waiterName: session.waiterName,
    };
}

async function queueWithMeta(
    jobType: string,
    payload: PrintJobPayload,
    meta?: QueueMeta
): Promise<{ success: boolean; error?: string }> {
    const queue = getQueueFn();
    if (!queue) return { success: false, error: BRIDGE_NOT_READY_MSG };
    try {
        const content = JSON.stringify(payload);
        await queue(jobType, content, {
            ...meta,
            correlationKey: payload.correlationKey,
            sessionId: payload.sessionId,
            waiterUserId: payload.waiterUserId,
            waiterName: payload.waiterName,
            printMode: "queued",
        });
        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown print error';
        return { success: false, error: msg };
    }
}

async function directThermalPrint(
    jobType: string,
    payload: PrintJobPayload
): Promise<{ success: boolean; error?: string }> {
    try {
        const config = ThermalPrinterClient.loadConfig();
        if (!config) {
            return { success: false, error: "No thermal printer configured for direct printing" };
        }
        const printer = new ThermalPrinterClient(config);
        const body: Record<string, unknown> = {
            orderId: payload.orderId,
            jobType,
            lineWidth: config.lineWidth || 32,
            terminalName: config.terminalName,
            characterSet: config.characterSet,
            correlationKey: payload.correlationKey,
            sessionId: payload.sessionId,
            waiterUserId: payload.waiterUserId,
            waiterName: payload.waiterName,
            printMode: "direct",
        };
        if (payload.deltaItems) body.deltaItems = payload.deltaItems;
        if (payload.adjustments) body.adjustments = payload.adjustments;
        if (payload.note) body.note = payload.note;
        const res = await fetch("/api/print/thermal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { success: false, error: json?.error || `Thermal API error ${res.status}` };
        }
        if (Array.isArray(json?.commands)) {
            await printer.printRawCommands(json.commands as number[]);
            return { success: true };
        }
        return { success: false, error: "Thermal API returned no commands" };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Direct thermal print failed",
        };
    }
}

async function runParallelPrint(
    jobType: string,
    payload: PrintJobPayload,
    requeueReason: string
): Promise<{ success: boolean; error?: string }> {
    const queuePromise = queueWithMeta(jobType, payload, { requeueReason });
    if (!PRINT_PARALLEL_ENABLED || (TABLET_QUEUE_ONLY_ENABLED && isTabletLikeViewport())) {
        const queued = await queuePromise;
        if (!queued.success) {
            toast.error(queued.error || BRIDGE_NOT_READY_MSG);
        }
        return queued;
    }

    const [queued, direct] = await Promise.all([
        queuePromise,
        directThermalPrint(jobType, payload),
    ]);

    if (queued.success && direct.success) {
        toast.success("Printed now and queued backup.");
        return { success: true };
    }
    if (queued.success && !direct.success) {
        toast.message(`Queued backup ready. Direct print issue: ${direct.error || "unknown error"}`);
        return { success: true };
    }
    if (!queued.success && direct.success) {
        toast.message("Printed now, but queue backup failed.");
        return { success: true };
    }
    toast.error(queued.error || direct.error || "Print failed");
    return { success: false, error: queued.error || direct.error || "Print failed" };
}

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
    const waiterMeta = getSessionWaiterMeta();
    return runParallelPrint("captain_docket", {
        orderId,
        correlationKey: buildCorrelationKey("docket", orderId),
        ...waiterMeta,
    }, "initial_docket");
}

/**
 * Customer receipt for a settled/paid order (the 80mm thermal receipt format).
 * Always queues via PrintBridge — call this after a successful payment.
 */
export async function printReceipt(
    orderId: string
): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined') {
        return { success: false, error: 'Print is only available in the browser' };
    }
    const waiterMeta = getSessionWaiterMeta();
    return runParallelPrint("receipt", {
        orderId,
        correlationKey: buildCorrelationKey("receipt", orderId),
        ...waiterMeta,
    }, "receipt_reprint");
}

/**
 * Delta slip: only newly added items (output of computeKitchenDeltaForOrder, enriched with price).
 * Always queues via PrintBridge.
 */
export async function printKitchenDelta(
    orderId: string,
    deltaItems: { name: string; quantity: number; price: number }[],
    dedupeKey?: string
): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined') {
        return { success: false, error: 'Print is only available in the browser' };
    }
    if (deltaItems.length === 0) return { success: true };

    const waiterMeta = getSessionWaiterMeta();
    const correlationKey = dedupeKey
        ? String(dedupeKey).slice(0, 120)
        : buildCorrelationKey("delta", orderId);
    return runParallelPrint("kitchen_delta", {
        orderId,
        deltaItems,
        correlationKey,
        ...waiterMeta,
    }, "order_update_docket");
}

/**
 * Anomaly adjustment slip: quantity reductions after a captain snapshot was already printed.
 * This is intentionally separate from kitchen delta (additions).
 */
export async function printKitchenAnomalyAdjustment(
    orderId: string,
    adjustments: { name: string; quantity: number; note?: string }[],
    note = "Customer requested to return item",
    dedupeKey?: string
): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined') {
        return { success: false, error: 'Print is only available in the browser' };
    }
    if (!Array.isArray(adjustments) || adjustments.length === 0) {
        return { success: false, error: 'No anomaly adjustments to print' };
    }

    const waiterMeta = getSessionWaiterMeta();
    const correlationKey = dedupeKey
        ? String(dedupeKey).slice(0, 120)
        : buildCorrelationKey("anomaly", orderId);
    return runParallelPrint("anomaly_adjustment", {
        orderId,
        adjustments: adjustments.map((x) => ({
            name: String(x.name || 'Item').slice(0, 80),
            quantity: Math.max(1, Math.floor(Number(x.quantity) || 1)),
            note: x.note || note,
        })),
        note,
        correlationKey,
        ...waiterMeta,
    }, "anomaly_adjustment");
}
