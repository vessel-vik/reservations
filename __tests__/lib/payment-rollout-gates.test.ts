import { afterEach, describe, expect, it, vi } from "vitest";
import { isBankPaybillCanaryEnabled } from "@/lib/payment-rollout-gates";

const originalEnv = { ...process.env };

describe("payment-rollout-gates", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        process.env = { ...originalEnv };
    });

    it("allows by default when rollout is enabled", () => {
        process.env.BANK_PAYBILL_ROLLOUT_ENABLED = "true";
        process.env.BANK_PAYBILL_CANARY_BUSINESS_IDS = "";
        process.env.BANK_PAYBILL_CANARY_TERMINAL_IDS = "";

        const gate = isBankPaybillCanaryEnabled({
            businessId: "biz_123",
            terminalId: "term_abc",
        });

        expect(gate.allowed).toBe(true);
    });

    it("blocks when business is not in canary allowlist", () => {
        process.env.BANK_PAYBILL_CANARY_BUSINESS_IDS = "biz_allowed";
        process.env.BANK_PAYBILL_CANARY_TERMINAL_IDS = "term_1";

        const gate = isBankPaybillCanaryEnabled({
            businessId: "biz_other",
            terminalId: "term_1",
        });

        expect(gate.allowed).toBe(false);
        expect(gate.reason).toBe("business_not_in_canary");
    });

    it("blocks when terminal is required but not in allowlist", () => {
        process.env.BANK_PAYBILL_CANARY_BUSINESS_IDS = "biz_allowed";
        process.env.BANK_PAYBILL_CANARY_TERMINAL_IDS = "term_canary";
        process.env.BANK_PAYBILL_CANARY_REQUIRE_TERMINAL = "true";

        const gate = isBankPaybillCanaryEnabled({
            businessId: "biz_allowed",
            terminalId: "term_other",
        });

        expect(gate.allowed).toBe(false);
        expect(gate.reason).toBe("terminal_not_in_canary");
    });

    it("allows system terminals for automated bank settlement paths", () => {
        process.env.BANK_PAYBILL_CANARY_BUSINESS_IDS = "biz_allowed";
        process.env.BANK_PAYBILL_CANARY_TERMINAL_IDS = "term_canary";

        const gate = isBankPaybillCanaryEnabled({
            businessId: "biz_other",
            terminalId: "jenga-callback",
        });

        expect(gate.allowed).toBe(true);
    });

    it("blocks when rollout flag is disabled", () => {
        process.env.BANK_PAYBILL_ROLLOUT_ENABLED = "false";

        const gate = isBankPaybillCanaryEnabled({
            businessId: "biz_123",
            terminalId: "term_abc",
        });

        expect(gate.allowed).toBe(false);
        expect(gate.reason).toBe("bank_paybill_disabled");
    });
});

