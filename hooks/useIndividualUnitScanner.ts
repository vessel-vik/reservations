"use client";

import { useCallback, useState } from "react";
import {
    registerIndividualUnit,
    scanInIndividualUnit,
    scanOutIndividualUnit,
    scanOutUnitWithDocketAndStock,
    searchDamagedBarcodeSimilar,
    searchDamagedBarcodeVisual,
} from "@/lib/actions/units.actions";
import { toast } from "sonner";

export function useIndividualUnitScanner() {
    const [busy, setBusy] = useState(false);

    const register = useCallback(
        async (unitUid: string, menuItemId: string, embeddingLabel?: string, bottleImageDataUrl?: string) => {
            setBusy(true);
            try {
                await registerIndividualUnit({
                    unitUid,
                    menuItemId,
                    embeddingLabel,
                    bottleImageDataUrl,
                });
                toast.success("Unit registered");
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "Register failed");
            } finally {
                setBusy(false);
            }
        },
        []
    );

    const scanIn = useCallback(async (unitUid: string) => {
        setBusy(true);
        try {
            await scanInIndividualUnit(unitUid);
            toast.success("Scan-in recorded");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Scan-in failed");
        } finally {
            setBusy(false);
        }
    }, []);

    const scanOut = useCallback(async (unitUid: string, orderId?: string) => {
        setBusy(true);
        try {
            await scanOutIndividualUnit(unitUid, orderId);
            toast.success("Scan-out recorded");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Scan-out failed");
        } finally {
            setBusy(false);
        }
    }, []);

    const scanOutWithDocket = useCallback(async (unitUid: string, captainOrderId: string) => {
        setBusy(true);
        try {
            await scanOutUnitWithDocketAndStock({
                unitUid,
                captainOrderId,
                decrementStock: true,
            });
            toast.success("Scan-out vs docket — stock updated");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Scan-out failed");
        } finally {
            setBusy(false);
        }
    }, []);

    const searchDamaged = useCallback(async (q: string) => {
        setBusy(true);
        try {
            return await searchDamagedBarcodeSimilar(q, 5);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Search failed");
            return { matches: [] };
        } finally {
            setBusy(false);
        }
    }, []);

    const searchVisual = useCallback(async (imageDataUrl: string) => {
        setBusy(true);
        try {
            return await searchDamagedBarcodeVisual(imageDataUrl, 5);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Visual search failed");
            return { matches: [] };
        } finally {
            setBusy(false);
        }
    }, []);

    return { busy, register, scanIn, scanOut, scanOutWithDocket, searchDamaged, searchVisual };
}
