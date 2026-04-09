import { createHash, timingSafeEqual } from "crypto";
import { Query } from "node-appwrite";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";

type StaffPasskeyRecord = {
    waiterUserId: string;
    waiterName: string;
    pinCode?: string;
    pinHash?: string;
    isActive?: boolean;
};

export type StaffPasskeyOption = {
    waiterUserId: string;
    waiterName: string;
};

const STAFF_PASSKEYS_COLLECTION_ID = process.env.STAFF_PASSKEYS_COLLECTION_ID || "";
const STAFF_PASSKEY_PEPPER = process.env.STAFF_PASSKEY_PEPPER || "";
const ENV_STAFF_PASSKEYS_JSON = process.env.STAFF_PASSKEYS_JSON || "";

function hashPin(pin: string): string {
    return createHash("sha256").update(`${pin}:${STAFF_PASSKEY_PEPPER}`).digest("hex");
}

function safeTimingEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}

function parseEnvPasskeys(): StaffPasskeyRecord[] {
    if (!ENV_STAFF_PASSKEYS_JSON) return [];
    try {
        const parsed = JSON.parse(ENV_STAFF_PASSKEYS_JSON) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((row) => {
                const item = row as Record<string, unknown>;
                return {
                    waiterUserId: String(item.waiterUserId || "").trim(),
                    waiterName: String(item.waiterName || "").trim(),
                    pinCode: item.pinCode != null ? String(item.pinCode) : undefined,
                    pinHash: item.pinHash != null ? String(item.pinHash) : undefined,
                    isActive: item.isActive == null ? true : Boolean(item.isActive),
                } satisfies StaffPasskeyRecord;
            })
            .filter((row) => row.waiterUserId && row.waiterName && row.isActive !== false);
    } catch {
        return [];
    }
}

async function listCollectionPasskeys(businessId: string): Promise<StaffPasskeyRecord[]> {
    if (!DATABASE_ID || !STAFF_PASSKEYS_COLLECTION_ID) return [];
    try {
        const res = await databases.listDocuments(DATABASE_ID, STAFF_PASSKEYS_COLLECTION_ID, [
            Query.equal("businessId", businessId),
            Query.equal("isActive", true),
            Query.limit(200),
        ]);
        return res.documents.map((doc) => ({
            waiterUserId: String((doc as any).waiterUserId || "").trim(),
            waiterName: String((doc as any).waiterName || "").trim(),
            pinCode: String((doc as any).pinCode || "").trim() || undefined,
            pinHash: String((doc as any).pinHash || "").trim() || undefined,
            isActive: Boolean((doc as any).isActive),
        }));
    } catch {
        return [];
    }
}

function mergeOptions(records: StaffPasskeyRecord[]): StaffPasskeyOption[] {
    const seen = new Set<string>();
    const result: StaffPasskeyOption[] = [];
    for (const row of records) {
        if (!row.waiterUserId || !row.waiterName || seen.has(row.waiterUserId)) continue;
        seen.add(row.waiterUserId);
        result.push({
            waiterUserId: row.waiterUserId,
            waiterName: row.waiterName,
        });
    }
    return result;
}

function matchesPin(row: StaffPasskeyRecord, pin: string): boolean {
    if (row.pinCode && safeTimingEqual(row.pinCode, pin)) return true;
    if (row.pinHash) {
        const digest = hashPin(pin);
        return safeTimingEqual(row.pinHash, digest);
    }
    return false;
}

export async function listStaffPasskeyOptions(businessId: string): Promise<StaffPasskeyOption[]> {
    const envRows = parseEnvPasskeys();
    const dbRows = await listCollectionPasskeys(businessId);
    return mergeOptions([...dbRows, ...envRows]);
}

export async function verifyStaffPasskey(
    businessId: string,
    pin: string
): Promise<StaffPasskeyOption | null> {
    const normalized = String(pin || "").trim();
    if (!normalized) return null;
    const envRows = parseEnvPasskeys();
    const dbRows = await listCollectionPasskeys(businessId);
    const allRows = [...dbRows, ...envRows];
    const match = allRows.find((row) => matchesPin(row, normalized));
    if (!match) return null;
    return {
        waiterUserId: match.waiterUserId,
        waiterName: match.waiterName,
    };
}

