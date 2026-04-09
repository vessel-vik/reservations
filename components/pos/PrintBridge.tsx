"use client";

import { useEffect, useRef, useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { client } from "@/lib/appwrite-client";
import { Databases } from "appwrite";
import { toast } from "sonner";
import { ThermalPrinterClient } from "@/lib/thermal-printer";

interface PrintJob {
    $id: string;
    status: "pending" | "pending_approval" | "printing" | "completed" | "failed";
    jobType:
        | "receipt"
        | "docket"
        | "captain_docket"
        | "kitchen_docket"
        | "kitchen_delta"
        | "anomaly_adjustment";
    content: string;
    timestamp: string;
    targetTerminal?: string;
    errorMessage?: string;
    businessId?: string; // Multi-tenant isolation
    correlationKey?: string;
    printMode?: string;
    sessionId?: string;
    waiterUserId?: string;
    waiterName?: string;
}

type QueuePrintMeta = {
    targetTerminal?: string;
    waiterUserId?: string;
    waiterName?: string;
    correlationKey?: string;
    printMode?: "queued" | "direct";
    sessionId?: string;
    requeueReason?: string;
};

function parseJobPayload(content: string): {
    orderId: string;
    deltaItems?: { name: string; quantity: number; price: number }[];
    adjustments?: { name: string; quantity: number; note?: string }[];
    note?: string;
    correlationKey?: string;
    sessionId?: string;
    waiterUserId?: string;
    waiterName?: string;
} {
    const raw = String(content || "").trim();
    if (!raw) return { orderId: "" };
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return {
            orderId: String(parsed.orderId || "").trim(),
            deltaItems: Array.isArray(parsed.deltaItems) ? (parsed.deltaItems as any) : undefined,
            adjustments: Array.isArray(parsed.adjustments) ? (parsed.adjustments as any) : undefined,
            note: parsed.note != null ? String(parsed.note) : undefined,
            correlationKey: parsed.correlationKey != null ? String(parsed.correlationKey) : undefined,
            sessionId: parsed.sessionId != null ? String(parsed.sessionId) : undefined,
            waiterUserId: parsed.waiterUserId != null ? String(parsed.waiterUserId) : undefined,
            waiterName: parsed.waiterName != null ? String(parsed.waiterName) : undefined,
        };
    } catch {
        const byToken = raw.match(/orderId:([\w-]+)/)?.[1];
        return { orderId: byToken || raw };
    }
}

/**
 * PrintBridge Component - Centralized Print Infrastructure
 *
 * A persistent listener that monitors the PRINT_JOBS collection and
 * coordinates print job lifecycle with real thermal printer support:
 * pending → printing → completed (or failed)
 *
 * Features:
 * - Real thermal printer driver abstraction (USB/Network)
 * - ESC/POS receipt and kitchen docket formatters (80mm high-density)
 * - Job state machine validation
 * - "Print before payment" workflow
 * - Multi-terminal support with business isolation
 * - 2-second thermal printer-safe queuing (prevents buffer overflow)
 */
export function PrintBridge() {
    const { membership } = useOrganization();
    const [jobQueue, setJobQueue] = useState<PrintJob[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const businessId = membership?.organization?.id ?? null;
    const businessIdRef = useRef<string | null>(businessId);
    useEffect(() => {
        businessIdRef.current = businessId;
    }, [businessId]);

    // Always expose queuePrintJob globally (all devices — waiters and admin can queue)
    useEffect(() => {
        (window as any).queuePrintJob = queuePrintJob;
        return () => {
            delete (window as any).queuePrintJob;
        };
        // queuePrintJob is defined in this component and stable across renders
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Only org:admin terminals subscribe to and process print jobs
    useEffect(() => {
        if (!membership) return; // Clerk org context not loaded yet
        if (membership.role !== 'org:admin') return; // Waiter — mount silently, never process

        let cancelled = false;
        let unsubscribe: (() => void) | undefined;

        setupPrintListener().then((cleanup) => {
            if (cancelled) {
                cleanup?.(); // component already unmounted — unsubscribe immediately
            } else {
                unsubscribe = cleanup;
            }
        });

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [membership]);

    // Process job queue with 2-second delay to prevent thermal printer buffer overflow
    useEffect(() => {
        if (jobQueue.length === 0 || isProcessing) return;

        setIsProcessing(true);
        const timer = setTimeout(() => {
            processPrintJob(jobQueue[0]);
        }, 2000);

        return () => clearTimeout(timer);
    }, [jobQueue, isProcessing]);

    const setupPrintListener = async () => {
        try {
            const databases = new Databases(client);
            const PRINT_JOBS_COLLECTION_ID =
                process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;
            const DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID;

            if (!PRINT_JOBS_COLLECTION_ID || !DATABASE_ID) {
                toast.error('Print bridge misconfigured — NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID or NEXT_PUBLIC_DATABASE_ID missing. Printing disabled.');
                return;
            }

            // Get business context for tenant isolation
            const businessId = businessIdRef.current;
            if (!businessId) {
                toast.error('Print bridge: organisation context not loaded. Try reloading the page.');
                return;
            }

            // Subscribe to real-time updates on PRINT_JOBS collection (filtered by business)
            const unsubscribe = client.subscribe(
                `databases.${DATABASE_ID}.collections.${PRINT_JOBS_COLLECTION_ID}.documents`,
                (response: any) => {
                    const events = Array.isArray(response?.events) ? response.events : [];
                    const changed =
                        events.some((evt: string) => evt.includes(".create")) ||
                        events.some((evt: string) => evt.includes(".update"));
                    if (!changed) return;
                    const job = response.payload as PrintJob;
                    if (job.businessId !== businessId || job.status !== "pending") return;
                    setJobQueue((prev) => {
                        if (prev.some((existing) => existing.$id === job.$id)) return prev;
                        return [...prev, job];
                    });
                }
            );

            return () => unsubscribe();
        } catch (error) {
            console.error("Error setting up print listener:", error);
        }
    };

    const processPrintJob = async (job: PrintJob) => {
        try {
            // Update job status to "printing"
            await updateJobStatus(job.$id, "printing");

            // Process print job based on type
            await executePrintJob(job);

            // Update job status to "completed"
            await updateJobStatus(job.$id, "completed");

            // Show success toast
            toast.success(`Print job completed: ${job.jobType}`);

            // Remove job from queue
            setJobQueue((prev) => prev.filter((j) => j.$id !== job.$id));
        } catch (error) {
            console.error("Print job failed:", error);

            // Update job status to "failed"
            await updateJobStatus(job.$id, "failed", String(error));

            // Show error toast
            toast.error(`Print job failed: ${String(error)}`);

            // Remove failed job from queue
            setJobQueue((prev) => prev.filter((j) => j.$id !== job.$id));
        } finally {
            setIsProcessing(false);
        }
    };

    const updateJobStatus = async (
        jobId: string,
        status: PrintJob["status"],
        errorMessage?: string
    ) => {
        const res = await fetch(`/api/pos/print-jobs/${encodeURIComponent(jobId)}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status,
                errorMessage,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || `Status update failed (${res.status})`);
        }
    };

    const executePrintJob = async (job: PrintJob) => {
        try {
            // Load printer configuration
            const printerConfig = ThermalPrinterClient.loadConfig();
            if (!printerConfig) {
                throw new Error("No thermal printer configured. Please set up printer in settings.");
            }

            const printer = new ThermalPrinterClient(printerConfig);

            // Execute print based on job type
            switch (job.jobType) {
                case "receipt": {
                    const parsed = parseJobPayload(job.content);
                    const orderId = parsed.orderId || job.content;
                    const result = await printer.printReceipt(orderId);
                    if (!result.success) {
                        throw new Error(result.error || "Receipt print failed");
                    }
                    break;
                }

                case "docket":
                case "captain_docket": {
                    const parsed = parseJobPayload(job.content);
                    const docketOrderId = parsed.orderId || job.content.trim();
                    const docketRes = await printer.printKitchenDocket(docketOrderId);
                    if (!docketRes.success) {
                        throw new Error(docketRes.error || 'Captain docket print failed');
                    }
                    break;
                }

                case "kitchen_docket": {
                    // Legacy jobType — kept for backwards compat. Bug fix: was fetching bytes but never printing.
                    const parsed = parseJobPayload(job.content);
                    const orderId = (parsed.orderId || job.content.match(/orderId:([\w-]+)/)?.[1])
                        ?? job.content.match(/table:(\d+)/)?.[1]
                        ?? job.content.trim();
                    const res = await fetch('/api/print/thermal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            orderId: orderId || undefined,
                            jobType: 'kitchen_docket',
                            printerType: printerConfig.type,
                            terminalName: printerConfig.terminalName,
                            lineWidth: printerConfig.lineWidth || 32,
                            correlationKey: parsed.correlationKey,
                            sessionId: parsed.sessionId,
                            waiterUserId: parsed.waiterUserId,
                            waiterName: parsed.waiterName,
                            printMode: "queued",
                        }),
                    });
                    if (!res.ok) {
                        let msg = `Thermal API error ${res.status}`;
                        try { msg = (await res.json()).error || msg; } catch {}
                        throw new Error(msg);
                    }
                    const data = await res.json();
                    if (data.commands) {
                        await printer.printRawCommands(data.commands as number[]);
                    } else {
                        throw new Error(data.error || 'Kitchen docket print failed');
                    }
                    break;
                }

                case "kitchen_delta": {
                    const parsed = parseJobPayload(job.content);
                    const res = await fetch('/api/print/thermal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jobId: job.$id,
                            orderId: parsed.orderId,
                            jobType: 'kitchen_delta',
                            deltaItems: parsed.deltaItems,
                            printerType: printerConfig.type,
                            terminalName: printerConfig.terminalName,
                            lineWidth: printerConfig.lineWidth || 32,
                            correlationKey: parsed.correlationKey,
                            sessionId: parsed.sessionId,
                            waiterUserId: parsed.waiterUserId,
                            waiterName: parsed.waiterName,
                            printMode: "queued",
                        }),
                    });
                    if (!res.ok) {
                        let msg = `Thermal API error ${res.status}`;
                        try { msg = (await res.json()).error || msg; } catch {}
                        throw new Error(msg);
                    }
                    const data = await res.json();
                    if (data.commands) {
                        await printer.printRawCommands(data.commands as number[]);
                    } else {
                        throw new Error(data.error || 'Kitchen delta print failed');
                    }
                    break;
                }

                case "anomaly_adjustment": {
                    const parsed = parseJobPayload(job.content);
                    const res = await fetch('/api/print/thermal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jobId: job.$id,
                            orderId: parsed.orderId,
                            jobType: 'anomaly_adjustment',
                            adjustments: parsed.adjustments,
                            note: parsed.note,
                            printerType: printerConfig.type,
                            terminalName: printerConfig.terminalName,
                            lineWidth: printerConfig.lineWidth || 32,
                            correlationKey: parsed.correlationKey,
                            sessionId: parsed.sessionId,
                            waiterUserId: parsed.waiterUserId,
                            waiterName: parsed.waiterName,
                            printMode: "queued",
                        }),
                    });
                    if (!res.ok) {
                        let msg = `Thermal API error ${res.status}`;
                        try { msg = (await res.json()).error || msg; } catch {}
                        throw new Error(msg);
                    }
                    const data = await res.json();
                    if (data.commands) {
                        await printer.printRawCommands(data.commands as number[]);
                    } else {
                        throw new Error(data.error || 'Anomaly adjustment print failed');
                    }
                    break;
                }

                default:
                    throw new Error(`Unsupported job type: ${job.jobType}`);
            }

        } catch (error) {
            console.error(`Print execution failed for job ${job.$id}:`, error);
            throw error;
        }
    };

    /**
     * Public method to queue a print job
     * Called from POS interface when user clicks "Print Docket"
     */
    const queuePrintJob = async (
        jobType: PrintJob["jobType"],
        content: string,
        meta?: QueuePrintMeta
    ) => {
        try {
            const res = await fetch("/api/pos/print-jobs/queue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jobType,
                    content,
                    targetTerminal: meta?.targetTerminal || "default",
                    waiterUserId: meta?.waiterUserId,
                    waiterName: meta?.waiterName,
                    correlationKey: meta?.correlationKey,
                    printMode: meta?.printMode || "queued",
                    sessionId: meta?.sessionId,
                    requeueReason: meta?.requeueReason,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || `Queue failed (${res.status})`);
            }
            return {
                success: true,
                deduped: Boolean(body?.deduped),
                jobId: body?.jobId ? String(body.jobId) : undefined,
            };
        } catch (error) {
            console.error("Error queuing print job:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to queue print job",
            };
        }
    };

    // This component doesn't render anything; it's purely a listener/controller
    return null;
}
