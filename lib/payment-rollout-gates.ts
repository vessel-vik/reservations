type GateInput = {
    businessId: string;
    terminalId?: string;
};

function splitCsv(raw: string | undefined): string[] {
    return String(raw || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}

function matchesAllowlist(value: string, list: string[]): boolean {
    if (list.length === 0) return true;
    if (!value) return false;
    if (list.includes("*")) return true;
    return list.includes(value);
}

function isSystemTerminalId(terminalId: string): boolean {
    return terminalId.startsWith("jenga-");
}

export function isBankPaybillCanaryEnabled(input: GateInput): { allowed: boolean; reason?: string } {
    const enabledRaw = String(process.env.BANK_PAYBILL_ROLLOUT_ENABLED || "true").trim().toLowerCase();
    if (enabledRaw === "false" || enabledRaw === "0" || enabledRaw === "off") {
        return { allowed: false, reason: "bank_paybill_disabled" };
    }

    const businessId = String(input.businessId || "").trim();
    const terminalId = String(input.terminalId || "").trim();
    if (!businessId) return { allowed: false, reason: "missing_business_id" };
    if (terminalId && isSystemTerminalId(terminalId)) return { allowed: true };

    const businessAllowlist = splitCsv(process.env.BANK_PAYBILL_CANARY_BUSINESS_IDS);
    const terminalAllowlist = splitCsv(process.env.BANK_PAYBILL_CANARY_TERMINAL_IDS);
    const requireTerminalRaw = String(process.env.BANK_PAYBILL_CANARY_REQUIRE_TERMINAL || "true")
        .trim()
        .toLowerCase();
    const requireTerminal =
        requireTerminalRaw === "true" || requireTerminalRaw === "1" || requireTerminalRaw === "yes";

    const businessAllowed = matchesAllowlist(businessId, businessAllowlist);
    const terminalAllowed = matchesAllowlist(terminalId, terminalAllowlist);

    if (!businessAllowed) return { allowed: false, reason: "business_not_in_canary" };
    if (terminalAllowlist.length > 0 && !terminalAllowed) {
        return { allowed: false, reason: "terminal_not_in_canary" };
    }
    if (requireTerminal && terminalAllowlist.length > 0 && !terminalId) {
        return { allowed: false, reason: "missing_terminal_id" };
    }

    return { allowed: true };
}

