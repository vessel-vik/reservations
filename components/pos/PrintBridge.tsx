"use client";

import { useEffect, useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { client } from "@/lib/appwrite-client";
import { Databases, Query } from "appwrite";
import { toast } from "sonner";
import { ThermalPrinterClient } from "@/lib/thermal-printer";
import { getAuthContext } from "@/lib/auth.utils";

interface PrintJob {
    $id: string;
    status: "pending" | "printing" | "completed" | "failed";
    jobType: "receipt" | "docket" | "captain_docket" | "kitchen_docket" | "kitchen_delta";
    content: string;
    timestamp: string;
    targetTerminal?: string;
    errorMessage?: string;
    businessId?: string; // Multi-tenant isolation
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

        let unsubscribe: (() => void) | undefined;
        setupPrintListener().then((cleanup) => {
            unsubscribe = cleanup;
        });

        return () => unsubscribe?.();
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
            const { businessId } = await getAuthContext();

            // Subscribe to real-time updates on PRINT_JOBS collection (filtered by business)
            const unsubscribe = client.subscribe(
                `databases.${DATABASE_ID}.collections.${PRINT_JOBS_COLLECTION_ID}.documents`,
                (response: any) => {
                    if (response.events.includes("databases.*.collections.*.documents.*.create")) {
                        const job = response.payload as PrintJob;
                        // Only process jobs for this business
                        if (job.businessId === businessId && job.status === "pending") {
                            setJobQueue((prev) => [...prev, job]);
                        }
                    }
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
        try {
            const databases = new Databases(client);
            const PRINT_JOBS_COLLECTION_ID =
                process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;
            const DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID;

            if (!PRINT_JOBS_COLLECTION_ID || !DATABASE_ID) return;

            const updateData: any = { status };
            if (errorMessage) {
                updateData.errorMessage = errorMessage;
            }

            await databases.updateDocument(
                DATABASE_ID,
                PRINT_JOBS_COLLECTION_ID,
                jobId,
                updateData
            );
        } catch (error) {
            console.error("Error updating job status:", error);
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
                    const orderId = job.content.match(/orderId:(\w+)/)?.[1] || job.content;
                    const result = await printer.printReceipt(orderId);
                    if (!result.success) {
                        throw new Error(result.error || "Receipt print failed");
                    }
                    break;
                }

                case "docket":
                case "captain_docket": {
                    const docketOrderId =
                        job.content.match(/orderId:([\w-]+)/)?.[1] || job.content.trim();
                    const docketRes = await printer.printKitchenDocket(docketOrderId);
                    if (!docketRes.success) {
                        throw new Error(docketRes.error || 'Captain docket print failed');
                    }
                    break;
                }

                case "kitchen_docket": {
                    // Legacy jobType — kept for backwards compat. Bug fix: was fetching bytes but never printing.
                    const orderId = job.content.match(/orderId:([\w-]+)/)?.[1]
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
                        }),
                    });
                    const data = await res.json();
                    if (data.commands) {
                        await printer.printRawCommands(data.commands as number[]);
                    } else {
                        throw new Error(data.error || 'Kitchen docket print failed');
                    }
                    break;
                }

                case "kitchen_delta": {
                    const parsed = JSON.parse(job.content) as {
                        orderId: string;
                        deltaItems: { name: string; quantity: number; price: number }[];
                    };
                    const res = await fetch('/api/print/thermal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            orderId: parsed.orderId,
                            jobType: 'kitchen_delta',
                            deltaItems: parsed.deltaItems,
                            printerType: printerConfig.type,
                            terminalName: printerConfig.terminalName,
                            lineWidth: printerConfig.lineWidth || 32,
                        }),
                    });
                    const data = await res.json();
                    if (data.commands) {
                        await printer.printRawCommands(data.commands as number[]);
                    } else {
                        throw new Error(data.error || 'Kitchen delta print failed');
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
        targetTerminal?: string
    ) => {
        try {
            const databases = new Databases(client);
            const PRINT_JOBS_COLLECTION_ID =
                process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;
            const DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID;

            if (!PRINT_JOBS_COLLECTION_ID || !DATABASE_ID) {
                toast.error("Print configuration missing");
                return;
            }

            // Get business context for tenant isolation
            const { businessId } = await getAuthContext();

            const jobData = {
                status: "pending",
                jobType,
                content,
                timestamp: new Date().toISOString(),
                targetTerminal: targetTerminal || "default",
                businessId // CRITICAL: Multi-tenant isolation
            };

            await databases.createDocument(
                DATABASE_ID,
                PRINT_JOBS_COLLECTION_ID,
                "unique()",
                jobData
            );

            toast.success("Print job queued");
        } catch (error) {
            console.error("Error queuing print job:", error);
            toast.error("Failed to queue print job");
        }
    };

    // This component doesn't render anything; it's purely a listener/controller
    return null;
}
