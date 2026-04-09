"use server";

import { ID, Query } from "node-appwrite";
import {
  databases,
  DATABASE_ID,
  PRINT_TERMINAL_CONTROLS_COLLECTION_ID,
  PRINT_OPS_INCIDENTS_COLLECTION_ID,
} from "@/lib/appwrite.config";

type TerminalState = "active" | "paused";

export async function getTerminalControl(
  businessId: string,
  terminalId: string
): Promise<{ state: TerminalState; fallbackTerminal: string; updatedAt?: string } | null> {
  if (!DATABASE_ID || !PRINT_TERMINAL_CONTROLS_COLLECTION_ID) return null;
  const id = String(terminalId || "").trim();
  if (!id) return null;
  const res = await databases.listDocuments(DATABASE_ID, PRINT_TERMINAL_CONTROLS_COLLECTION_ID, [
    Query.equal("businessId", businessId),
    Query.equal("terminalId", id),
    Query.limit(1),
  ]);
  const doc = res.documents[0] as any;
  if (!doc) return null;
  return {
    state: String(doc.state || "active") === "paused" ? "paused" : "active",
    fallbackTerminal: String(doc.fallbackTerminal || "default"),
    updatedAt: String(doc.updatedAt || doc.$updatedAt || ""),
  };
}

export async function upsertTerminalControl(input: {
  businessId: string;
  terminalId: string;
  state: TerminalState;
  fallbackTerminal?: string;
  updatedByUserId?: string;
}): Promise<void> {
  if (!DATABASE_ID || !PRINT_TERMINAL_CONTROLS_COLLECTION_ID) return;
  const terminalId = String(input.terminalId || "").trim();
  if (!terminalId) return;
  const fallbackTerminal = String(input.fallbackTerminal || "default").trim() || "default";
  const existing = await databases.listDocuments(DATABASE_ID, PRINT_TERMINAL_CONTROLS_COLLECTION_ID, [
    Query.equal("businessId", input.businessId),
    Query.equal("terminalId", terminalId),
    Query.limit(1),
  ]);
  const payload = {
    businessId: input.businessId,
    terminalId,
    state: input.state,
    fallbackTerminal,
    updatedAt: new Date().toISOString(),
    updatedByUserId: String(input.updatedByUserId || "").slice(0, 64),
  };
  if ((existing.total || 0) > 0) {
    await databases.updateDocument(DATABASE_ID, PRINT_TERMINAL_CONTROLS_COLLECTION_ID, existing.documents[0].$id, payload);
  } else {
    await databases.createDocument(DATABASE_ID, PRINT_TERMINAL_CONTROLS_COLLECTION_ID, ID.unique(), payload);
  }
}

export async function resolveTerminalRouting(input: {
  businessId: string;
  requestedTerminal: string;
}): Promise<{ targetTerminal: string; redirected: boolean; reason?: string }> {
  const requested = String(input.requestedTerminal || "default").trim() || "default";
  const control = await getTerminalControl(input.businessId, requested);
  if (!control || control.state !== "paused") {
    return { targetTerminal: requested, redirected: false };
  }
  return {
    targetTerminal: control.fallbackTerminal || "default",
    redirected: true,
    reason: `terminal_${requested}_paused`,
  };
}

export async function recordPrintOpsIncident(input: {
  businessId: string;
  terminalId: string;
  action: string;
  severity?: "info" | "warning" | "critical";
  message: string;
  metadata?: string;
  actorUserId?: string;
  actorRole?: string;
}): Promise<void> {
  if (!DATABASE_ID || !PRINT_OPS_INCIDENTS_COLLECTION_ID) return;
  await databases.createDocument(DATABASE_ID, PRINT_OPS_INCIDENTS_COLLECTION_ID, ID.unique(), {
    businessId: input.businessId,
    terminalId: String(input.terminalId || "").slice(0, 120),
    action: String(input.action || "").slice(0, 60),
    severity: String(input.severity || "info").slice(0, 20),
    message: String(input.message || "").slice(0, 500),
    metadata: String(input.metadata || "").slice(0, 2000),
    actorUserId: String(input.actorUserId || "").slice(0, 64),
    actorRole: String(input.actorRole || "").slice(0, 40),
    timestamp: new Date().toISOString(),
  });
}

