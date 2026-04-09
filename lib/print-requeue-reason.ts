export const ALLOWED_REQUEUE_REASONS = [
  "system_queue",
  "initial_docket",
  "admin_manual_requeue",
  "admin_docket_reprint",
  "admin_receipt_reprint",
  "paper_jam",
  "kitchen_lost_ticket",
  "audit_reprint",
  "legacy_migrated",
  "other",
] as const;

export type RequeueReason = (typeof ALLOWED_REQUEUE_REASONS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_REQUEUE_REASONS as readonly string[]);

export function normalizeRequeueReason(value: unknown, fallback: RequeueReason): RequeueReason {
  const raw = String(value || "").trim().toLowerCase().slice(0, 80);
  if (!raw) return fallback;
  if (ALLOWED_SET.has(raw)) return raw as RequeueReason;
  return "other";
}

