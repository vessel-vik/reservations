import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { requireOrgAdmin } from "@/lib/auth.utils";
import {
  databases,
  DATABASE_ID,
  PRINT_JOBS_COLLECTION_ID,
  PRINT_OPS_INCIDENTS_COLLECTION_ID,
  PRINT_TERMINAL_CONTROLS_COLLECTION_ID,
} from "@/lib/appwrite.config";
import { recordPrintOpsIncident, upsertTerminalControl } from "@/lib/print-terminal-controls";

type TerminalRollup = {
  terminalId: string;
  pending: number;
  printing: number;
  failedRecent: number;
  lastQueuedAt: string;
  state: "active" | "paused";
  fallbackTerminal: string;
  lastIncidentAt: string;
  lastIncidentMessage: string;
};

export async function GET() {
  try {
    const auth = await requireOrgAdmin();
    const businessId = String(auth.businessId || "");
    if (!DATABASE_ID || !PRINT_JOBS_COLLECTION_ID) {
      return NextResponse.json({ error: "Print collections not configured." }, { status: 500 });
    }

    const rows = new Map<string, TerminalRollup>();
    const ensure = (id: string): TerminalRollup => {
      const key = id || "default";
      const existing = rows.get(key);
      if (existing) return existing;
      const created: TerminalRollup = {
        terminalId: key,
        pending: 0,
        printing: 0,
        failedRecent: 0,
        lastQueuedAt: "",
        state: "active",
        fallbackTerminal: "default",
        lastIncidentAt: "",
        lastIncidentMessage: "",
      };
      rows.set(key, created);
      return created;
    };

    const active = await databases.listDocuments(DATABASE_ID, PRINT_JOBS_COLLECTION_ID, [
      Query.equal("businessId", businessId),
      Query.equal("status", ["pending", "printing"]),
      Query.orderDesc("$createdAt"),
      Query.limit(500),
    ]);
    for (const d of active.documents as any[]) {
      const terminalId = String(d.targetTerminal || "default");
      const row = ensure(terminalId);
      const status = String(d.status || "");
      if (status === "pending") row.pending += 1;
      if (status === "printing") row.printing += 1;
      const queuedAt = String(d.queuedAt || d.timestamp || d.$createdAt || "");
      if (queuedAt && (!row.lastQueuedAt || queuedAt > row.lastQueuedAt)) row.lastQueuedAt = queuedAt;
    }

    const failed = await databases.listDocuments(DATABASE_ID, PRINT_JOBS_COLLECTION_ID, [
      Query.equal("businessId", businessId),
      Query.equal("status", "failed"),
      Query.orderDesc("$createdAt"),
      Query.limit(300),
    ]);
    for (const d of failed.documents as any[]) {
      const terminalId = String(d.targetTerminal || "default");
      const row = ensure(terminalId);
      row.failedRecent += 1;
    }

    if (PRINT_TERMINAL_CONTROLS_COLLECTION_ID) {
      const controls = await databases.listDocuments(DATABASE_ID, PRINT_TERMINAL_CONTROLS_COLLECTION_ID, [
        Query.equal("businessId", businessId),
        Query.limit(200),
      ]);
      for (const c of controls.documents as any[]) {
        const row = ensure(String(c.terminalId || "default"));
        row.state = String(c.state || "active") === "paused" ? "paused" : "active";
        row.fallbackTerminal = String(c.fallbackTerminal || "default");
      }
    }

    if (PRINT_OPS_INCIDENTS_COLLECTION_ID) {
      const incidents = await databases.listDocuments(DATABASE_ID, PRINT_OPS_INCIDENTS_COLLECTION_ID, [
        Query.equal("businessId", businessId),
        Query.orderDesc("timestamp"),
        Query.limit(200),
      ]);
      for (const i of incidents.documents as any[]) {
        const row = ensure(String(i.terminalId || "default"));
        if (row.lastIncidentAt) continue;
        row.lastIncidentAt = String(i.timestamp || i.$createdAt || "");
        row.lastIncidentMessage = String(i.message || "");
      }
    }

    return NextResponse.json({
      terminals: Array.from(rows.values()).sort((a, b) =>
        (b.pending + b.printing + b.failedRecent) - (a.pending + a.printing + a.failedRecent)
      ),
    });
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg.toLowerCase().includes("admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to load terminal remediation data." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOrgAdmin();
    const businessId = String(auth.businessId || "");
    const actorUserId = String(auth.userId || "");
    const actorRole = String(auth.role || "");
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const terminalId = String(body?.terminalId || "").trim();
    const toTerminal = String(body?.toTerminal || "default").trim() || "default";

    if (!DATABASE_ID || !PRINT_JOBS_COLLECTION_ID) {
      return NextResponse.json({ error: "Print collections not configured." }, { status: 500 });
    }
    if (!terminalId) {
      return NextResponse.json({ error: "terminalId is required." }, { status: 400 });
    }

    if (action === "pause" || action === "resume") {
      await upsertTerminalControl({
        businessId,
        terminalId,
        state: action === "pause" ? "paused" : "active",
        fallbackTerminal: toTerminal,
        updatedByUserId: actorUserId,
      });
      await recordPrintOpsIncident({
        businessId,
        terminalId,
        action: action === "pause" ? "pause_terminal" : "resume_terminal",
        severity: "info",
        message:
          action === "pause"
            ? `Terminal ${terminalId} paused. New jobs will route to ${toTerminal}.`
            : `Terminal ${terminalId} resumed.`,
        metadata: JSON.stringify({ toTerminal }),
        actorUserId,
        actorRole,
      }).catch(() => {});
      return NextResponse.json({ success: true });
    }

    if (action === "reroute_pending") {
      const page = await databases.listDocuments(DATABASE_ID, PRINT_JOBS_COLLECTION_ID, [
        Query.equal("businessId", businessId),
        Query.equal("targetTerminal", terminalId),
        Query.equal("status", ["pending", "printing"]),
        Query.limit(200),
      ]);
      let updated = 0;
      for (const d of page.documents as any[]) {
        await databases.updateDocument(DATABASE_ID, PRINT_JOBS_COLLECTION_ID, d.$id, {
          targetTerminal: toTerminal,
        });
        updated += 1;
      }
      await recordPrintOpsIncident({
        businessId,
        terminalId,
        action: "reroute_pending",
        severity: "warning",
        message: `Rerouted ${updated} active jobs from ${terminalId} to ${toTerminal}.`,
        metadata: JSON.stringify({ toTerminal, updated }),
        actorUserId,
        actorRole,
      }).catch(() => {});
      return NextResponse.json({ success: true, updated });
    }

    if (action === "log_health_transition") {
      const level = String(body?.level || "").trim().toLowerCase();
      const breachedJobs = Number(body?.breachedJobs || 0);
      if (!["degraded", "critical", "healthy"].includes(level)) {
        return NextResponse.json({ error: "Invalid level." }, { status: 400 });
      }
      await recordPrintOpsIncident({
        businessId,
        terminalId: "fleet",
        action: "queue_health_transition",
        severity: level === "critical" ? "critical" : level === "degraded" ? "warning" : "info",
        message: `Queue health transitioned to ${level} with ${Math.max(0, breachedJobs)} breached jobs.`,
        metadata: JSON.stringify({ level, breachedJobs }),
        actorUserId,
        actorRole,
      }).catch(() => {});
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg.toLowerCase().includes("admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Terminal remediation action failed." }, { status: 500 });
  }
}

