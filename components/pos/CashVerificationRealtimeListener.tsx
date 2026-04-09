"use client";

import { useEffect, useRef } from "react";
import { useOrganization } from "@clerk/nextjs";
import { client } from "@/lib/appwrite-client";
import { toast } from "sonner";

/**
 * org:admin only: live toast when a new cash_verifications document is created for this tenant.
 * Complements PrintBridge — cash evidence is queued in Appwrite even without a printer.
 */
export function CashVerificationRealtimeListener() {
    const { membership } = useOrganization();
    const businessId = membership?.organization?.id ?? null;
    const businessIdRef = useRef<string | null>(businessId);
    useEffect(() => {
        businessIdRef.current = businessId;
    }, [businessId]);

    useEffect(() => {
        if (!membership) return;
        if (membership.role !== "org:admin") return;

        let unsubscribe: (() => void) | undefined;

        const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
        const collectionId = process.env.NEXT_PUBLIC_CASH_VERIFICATIONS_COLLECTION_ID;

        if (!databaseId || !collectionId) {
            return;
        }

        unsubscribe = client.subscribe(
            `databases.${databaseId}.collections.${collectionId}.documents`,
            (response: { events: string[]; payload?: Record<string, unknown> }) => {
                if (!response.events?.includes("databases.*.collections.*.documents.*.create")) return;
                const row = response.payload as { businessId?: string; paymentReference?: string } | undefined;
                if (!row || row.businessId !== businessIdRef.current) return;
                const ref = row.paymentReference ?? "cash";
                toast.message("Cash verification recorded", {
                    description: `Reference ${ref} — review photo in Finance hub when ready.`,
                    duration: 12_000,
                });
            }
        );

        return () => {
            unsubscribe?.();
        };
    }, [membership]);

    return null;
}
