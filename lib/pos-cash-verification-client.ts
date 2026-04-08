import { recordCashVerification } from "@/lib/actions/cash-verification.actions";
import { getOrCreateDeviceInstallId } from "@/lib/pos-device-install-id";
import { collectGeoSnapshot } from "@/lib/pos-geo";

/** Non-blocking: uploads photo + metadata after cash settlement. */
export function enqueueCashVerification(opts: {
    paymentReference: string;
    imageDataUrl: string;
    orderIds: string[];
}): void {
    void (async () => {
        try {
            const geo = await collectGeoSnapshot();
            await recordCashVerification({
                paymentReference: opts.paymentReference,
                imageBase64: opts.imageDataUrl,
                deviceInstallId: getOrCreateDeviceInstallId(),
                capturedAt: new Date().toISOString(),
                userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
                orderIds: opts.orderIds,
                geo,
            });
        } catch (e) {
            console.error("enqueueCashVerification failed", e);
        }
    })();
}
