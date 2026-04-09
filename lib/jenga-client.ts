import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

type JengaEnvironment = "uat" | "live";

type JengaTokenCache = {
    accessToken: string;
    expiresAtMs: number;
};

type JengaTransactionResponse = {
    status?: boolean;
    code?: number | string;
    message?: string;
    data?: {
        state?: string;
        stateCode?: number;
        amount?: number;
        charge?: number;
        transactionReference?: string;
        serviceName?: string;
        biller?: string;
    };
};

let tokenCache: JengaTokenCache | null = null;

function jengaEnvironment(): JengaEnvironment {
    const raw = String(process.env.JENGA_ENV || "uat").toLowerCase().trim();
    return raw === "live" ? "live" : "uat";
}

function jengaBaseUrl(): string {
    const configured = String(process.env.JENGA_BASE_URL || "").trim();
    if (configured) return configured.replace(/\/+$/, "");
    return jengaEnvironment() === "live"
        ? "https://api.finserve.africa"
        : "https://uat.finserve.africa";
}

function requiredEnv(name: string): string {
    const value = String(process.env[name] || "").trim();
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

function getPrivateKeyPem(): string {
    const inline = String(process.env.JENGA_PRIVATE_KEY || "").trim();
    if (inline) return inline.replaceAll("\\n", "\n");

    const privateKeyPath = String(process.env.JENGA_PRIVATE_KEY_PATH || "").trim();
    if (!privateKeyPath) {
        throw new Error("Missing Jenga private key: set JENGA_PRIVATE_KEY or JENGA_PRIVATE_KEY_PATH");
    }
    return readFileSync(privateKeyPath, "utf8");
}

function signMessageBase64(message: string): string {
    const signer = createSign("RSA-SHA256");
    signer.update(message, "utf8");
    signer.end();
    return signer.sign(getPrivateKeyPem(), "base64");
}

async function authenticateMerchant(): Promise<JengaTokenCache> {
    const apiKey = requiredEnv("JENGA_API_KEY");
    const merchantCode = requiredEnv("JENGA_MERCHANT_CODE");
    const consumerSecret = requiredEnv("JENGA_CONSUMER_SECRET");

    const response = await fetch(`${jengaBaseUrl()}/authentication/api/v3/authenticate/merchant`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Api-Key": apiKey,
        },
        body: JSON.stringify({ merchantCode, consumerSecret }),
        cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as {
        accessToken?: string;
        expiresIn?: string;
    };
    if (!response.ok || !data.accessToken) {
        throw new Error(`Jenga auth failed (${response.status})`);
    }

    const expiryMs = data.expiresIn ? new Date(data.expiresIn).getTime() : Date.now() + 45 * 60 * 1000;
    const expiresAtMs = Number.isFinite(expiryMs) ? expiryMs : Date.now() + 45 * 60 * 1000;
    return { accessToken: data.accessToken, expiresAtMs };
}

export async function getJengaAccessToken(): Promise<string> {
    const now = Date.now();
    if (tokenCache && tokenCache.expiresAtMs - 60_000 > now) {
        return tokenCache.accessToken;
    }
    tokenCache = await authenticateMerchant();
    return tokenCache.accessToken;
}

export async function queryJengaTransactionDetails(reference: string): Promise<JengaTransactionResponse> {
    const cleanRef = String(reference || "").trim();
    if (!cleanRef) throw new Error("Jenga reference is required");

    const accessToken = await getJengaAccessToken();
    const signature = signMessageBase64(cleanRef);
    const response = await fetch(
        `${jengaBaseUrl()}/v3-apis/transaction-api/v3.0/transactions/details/${encodeURIComponent(cleanRef)}`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Signature: signature,
            },
            cache: "no-store",
        }
    );
    const data = (await response.json().catch(() => ({}))) as JengaTransactionResponse;
    if (!response.ok) {
        throw new Error(data?.message || `Jenga transaction query failed (${response.status})`);
    }
    return data;
}

export function jengaStateToInternalStatus(input: {
    transactionStatus?: string;
    callbackCode?: number;
    callbackStatusBoolean?: boolean;
    stateCode?: number;
}): "confirmed" | "failed" | "pending" {
    const state = String(input.transactionStatus || "").toUpperCase().trim();
    if (state === "SUCCESS" || state === "PAID" || state === "COMPLETED") return "confirmed";
    if (state === "FAILED" || state === "CANCELLED" || state === "REJECTED") return "failed";

    if (typeof input.stateCode === "number") {
        if (input.stateCode === 2) return "confirmed";
        if (input.stateCode === 1) return "failed";
        if (input.stateCode === -1) return "pending";
    }

    if (typeof input.callbackCode === "number") {
        if (input.callbackCode === 3) return "confirmed";
        if ([1, 5, 6, 7].includes(input.callbackCode)) return "failed";
        if ([0, 2, 4].includes(input.callbackCode)) return "pending";
    }

    if (input.callbackStatusBoolean === true) return "confirmed";
    return "pending";
}

