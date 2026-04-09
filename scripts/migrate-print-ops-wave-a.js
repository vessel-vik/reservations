#!/usr/bin/env node

/**
 * Wave A migration for print operations:
 * - Ensures print_jobs / print_audit_entries attributes
 * - Ensures key query indexes
 * - Backfills legacy rows with canonical metadata
 *
 * Usage:
 *   node scripts/migrate-print-ops-wave-a.js --dry-run
 *   node scripts/migrate-print-ops-wave-a.js
 */

const { Client, Databases, Query } = require("node-appwrite");
require("dotenv").config({ path: ".env.local" });

const endpoint = process.env.NEXT_PUBLIC_ENDPOINT;
const projectId = process.env.PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;
const apiKey = process.env.API_KEY;
const databaseId = process.env.DATABASE_ID;
const configuredPrintJobsCollectionId =
  process.env.PRINT_JOBS_COLLECTION_ID || process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID || "";
const configuredPrintAuditCollectionId = process.env.PRINT_AUDIT_ENTRIES_COLLECTION_ID || "";
const configuredTerminalControlsCollectionId = process.env.PRINT_TERMINAL_CONTROLS_COLLECTION_ID || "";
const configuredIncidentsCollectionId = process.env.PRINT_OPS_INCIDENTS_COLLECTION_ID || "";
const configuredOrdersCollectionId = process.env.ORDERS_COLLECTION_ID || "";
let printJobsCollectionId = "";
let printAuditCollectionId = "";
let terminalControlsCollectionId = "";
let incidentsCollectionId = "";
let ordersCollectionId = "";

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error("Missing required env vars: NEXT_PUBLIC_ENDPOINT, PROJECT_ID, API_KEY, DATABASE_ID");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const batchSize = 100;

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const JOB_TYPES = new Set([
  "receipt",
  "docket",
  "captain_docket",
  "kitchen_docket",
  "kitchen_delta",
  "anomaly_adjustment",
]);

function categoryFromJobType(jobType) {
  if (jobType === "kitchen_delta") return "update";
  if (jobType === "anomaly_adjustment") return "anomaly";
  if (jobType === "receipt") return "receipt";
  return "docket";
}

function parseContent(jobType, content) {
  const raw = String(content || "");
  if (jobType === "receipt" || jobType === "docket" || jobType === "captain_docket" || jobType === "kitchen_docket") {
    const id = raw.match(/orderId:([\w-]+)/)?.[1] || raw.trim();
    return { orderId: id || "", dedupeKey: "" };
  }
  if (jobType === "kitchen_delta" || jobType === "anomaly_adjustment") {
    try {
      const parsed = JSON.parse(raw);
      return {
        orderId: String(parsed?.orderId || "").trim(),
        dedupeKey: String(parsed?.dedupeKey || "").trim().slice(0, 120),
      };
    } catch {
      return { orderId: "", dedupeKey: "" };
    }
  }
  return { orderId: "", dedupeKey: "" };
}

async function ensureStringAttr(collectionId, key, size, required = false) {
  try {
    await databases.createStringAttribute(databaseId, collectionId, key, size, required);
    console.log(`  + ${collectionId}.${key}`);
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("already exists")) {
      console.warn(`  ! ${collectionId}.${key}: ${String(err?.message || err)}`);
    }
  }
}

async function ensureIntAttr(collectionId, key, required = false, min, max, def) {
  try {
    await databases.createIntegerAttribute(
      databaseId,
      collectionId,
      key,
      required,
      min,
      max,
      required ? undefined : def
    );
    console.log(`  + ${collectionId}.${key}`);
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("already exists")) {
      console.warn(`  ! ${collectionId}.${key}: ${String(err?.message || err)}`);
    }
  }
}

async function ensureIndex(collectionId, key, attributes) {
  try {
    await databases.createIndex(databaseId, collectionId, key, "key", attributes);
    console.log(`  # index ${collectionId}.${key}`);
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg.includes("already exists")) {
      console.warn(`  ! index ${collectionId}.${key}: ${String(err?.message || err)}`);
    }
  }
}

async function ensureSchema() {
  console.log("Ensuring print_jobs attributes...");
  await ensureStringAttr(printJobsCollectionId, "category", 24, false);
  await ensureStringAttr(printJobsCollectionId, "orderId", 64, false);
  await ensureStringAttr(printJobsCollectionId, "dedupeKey", 120, false);
  await ensureStringAttr(printJobsCollectionId, "waiterId", 64, false);
  await ensureStringAttr(printJobsCollectionId, "waiterNameSnapshot", 255, false);
  await ensureStringAttr(printJobsCollectionId, "requeueReason", 80, false);
  await ensureStringAttr(printJobsCollectionId, "createdByUserId", 64, false);
  await ensureStringAttr(printJobsCollectionId, "createdByRole", 40, false);
  await ensureStringAttr(printJobsCollectionId, "queuedAt", 40, false);
  await ensureStringAttr(printJobsCollectionId, "printedAt", 40, false);
  await ensureIntAttr(printJobsCollectionId, "attemptCount", false, 0, 1000, 0);

  console.log("Ensuring print_audit_entries attributes...");
  await ensureStringAttr(printAuditCollectionId, "dedupeKey", 120, false);
  await ensureStringAttr(printAuditCollectionId, "actorUserId", 64, false);
  await ensureStringAttr(printAuditCollectionId, "actorRole", 40, false);
  await ensureStringAttr(printAuditCollectionId, "waiterId", 64, false);
  await ensureStringAttr(printAuditCollectionId, "terminalId", 120, false);
  await ensureStringAttr(printAuditCollectionId, "requeueReason", 80, false);
  if (terminalControlsCollectionId) {
    console.log("Ensuring print_terminal_controls attributes...");
    await ensureStringAttr(terminalControlsCollectionId, "businessId", 64, true);
    await ensureStringAttr(terminalControlsCollectionId, "terminalId", 120, true);
    await ensureStringAttr(terminalControlsCollectionId, "state", 20, true);
    await ensureStringAttr(terminalControlsCollectionId, "fallbackTerminal", 120, false);
    await ensureStringAttr(terminalControlsCollectionId, "updatedAt", 40, true);
    await ensureStringAttr(terminalControlsCollectionId, "updatedByUserId", 64, false);
  }
  if (incidentsCollectionId) {
    console.log("Ensuring print_ops_incidents attributes...");
    await ensureStringAttr(incidentsCollectionId, "businessId", 64, true);
    await ensureStringAttr(incidentsCollectionId, "terminalId", 120, true);
    await ensureStringAttr(incidentsCollectionId, "action", 60, true);
    await ensureStringAttr(incidentsCollectionId, "severity", 20, true);
    await ensureStringAttr(incidentsCollectionId, "message", 500, true);
    await ensureStringAttr(incidentsCollectionId, "metadata", 2000, false);
    await ensureStringAttr(incidentsCollectionId, "timestamp", 40, true);
    await ensureStringAttr(incidentsCollectionId, "actorUserId", 64, false);
    await ensureStringAttr(incidentsCollectionId, "actorRole", 40, false);
  }

  console.log("Ensuring indexes...");
  await ensureIndex(printJobsCollectionId, "jobs_biz_cat_stat_created", [
    "businessId",
    "category",
    "status",
    "$createdAt",
  ]);
  await ensureIndex(printJobsCollectionId, "jobs_biz_order_created", [
    "businessId",
    "orderId",
    "$createdAt",
  ]);
  await ensureIndex(printJobsCollectionId, "jobs_biz_waiter_created", [
    "businessId",
    "waiterId",
    "$createdAt",
  ]);
  await ensureIndex(printAuditCollectionId, "audit_biz_order_ts", [
    "businessId",
    "orderId",
    "timestamp",
  ]);
  await ensureIndex(printAuditCollectionId, "audit_biz_job_ts", [
    "businessId",
    "printJobId",
    "timestamp",
  ]);
  if (terminalControlsCollectionId) {
    await ensureIndex(terminalControlsCollectionId, "ctrl_biz_terminal", ["businessId", "terminalId"]);
  }
  if (incidentsCollectionId) {
    await ensureIndex(incidentsCollectionId, "inc_biz_term_time", ["businessId", "terminalId", "timestamp"]);
  }
}

async function ensureCollectionIfMissing(collectionId, name) {
  try {
    await databases.createCollection(databaseId, collectionId, name, []);
    console.log(`  + created collection ${collectionId}`);
    return true;
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (msg.includes("already exists")) return true;
    console.warn(`  ! create collection ${collectionId}: ${String(err?.message || err)}`);
    return false;
  }
}

async function listAllDocuments(collectionId) {
  const out = [];
  let cursor = "";
  while (true) {
    const queries = [Query.orderAsc("$id"), Query.limit(batchSize)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(databaseId, collectionId, queries);
    if (!page.documents.length) break;
    out.push(...page.documents);
    cursor = page.documents[page.documents.length - 1].$id;
    if (page.documents.length < batchSize) break;
  }
  return out;
}

async function backfillJobs() {
  console.log("Backfilling print_jobs...");
  const docs = await listAllDocuments(printJobsCollectionId);
  const orderCache = new Map();
  let touched = 0;

  for (const doc of docs) {
    const jobType = String(doc.jobType || "");
    if (!JOB_TYPES.has(jobType)) continue;

    const { orderId: parsedOrderId, dedupeKey: parsedDedupe } = parseContent(jobType, doc.content);
    const orderId = String(doc.orderId || parsedOrderId || "").trim();
    const next = {};

    if (!doc.category) next.category = categoryFromJobType(jobType);
    if (!doc.orderId && orderId) next.orderId = orderId;
    if (!doc.queuedAt) next.queuedAt = String(doc.timestamp || doc.$createdAt || "");
    if (!doc.printedAt && String(doc.status || "") === "completed") {
      next.printedAt = String(doc.$updatedAt || doc.timestamp || "");
    }
    if (typeof doc.attemptCount !== "number") {
      next.attemptCount = String(doc.status || "") === "failed" ? 1 : 0;
    }
    if (!doc.requeueReason) {
      next.requeueReason = "legacy_migrated";
    }
    if (!doc.dedupeKey && parsedDedupe) {
      next.dedupeKey = parsedDedupe;
    }

    if ((!doc.waiterId || !doc.waiterNameSnapshot) && orderId && ordersCollectionId) {
      let order = orderCache.get(orderId);
      if (!order) {
        order = await databases.getDocument(databaseId, ordersCollectionId, orderId).catch(() => null);
        orderCache.set(orderId, order);
      }
      if (order) {
        if (!doc.waiterId && order.waiterId) next.waiterId = String(order.waiterId).slice(0, 64);
        if (!doc.waiterNameSnapshot && order.waiterName) next.waiterNameSnapshot = String(order.waiterName).slice(0, 255);
      }
    }

    if (Object.keys(next).length === 0) continue;
    touched += 1;
    if (!dryRun) {
      await databases.updateDocument(databaseId, printJobsCollectionId, doc.$id, next);
    }
  }

  console.log(`  ${dryRun ? "would update" : "updated"} ${touched} print_jobs rows`);
}

async function backfillAuditEntries() {
  console.log("Backfilling print_audit_entries...");
  const docs = await listAllDocuments(printAuditCollectionId);
  const jobCache = new Map();
  let touched = 0;

  for (const doc of docs) {
    const next = {};
    const jobId = String(doc.printJobId || "").trim();

    let job = null;
    if (jobId) {
      job = jobCache.get(jobId);
      if (job === undefined) {
        job = await databases.getDocument(databaseId, printJobsCollectionId, jobId).catch(() => null);
        jobCache.set(jobId, job);
      }
    }

    if (!doc.dedupeKey && job?.dedupeKey) next.dedupeKey = String(job.dedupeKey).slice(0, 120);
    if (!doc.actorUserId && job?.createdByUserId) next.actorUserId = String(job.createdByUserId).slice(0, 64);
    if (!doc.actorRole && job?.createdByRole) next.actorRole = String(job.createdByRole).slice(0, 40);
    if (!doc.waiterId && job?.waiterId) next.waiterId = String(job.waiterId).slice(0, 64);
    if (!doc.terminalId && job?.targetTerminal) next.terminalId = String(job.targetTerminal).slice(0, 120);
    if (!doc.orderId && job?.orderId) next.orderId = String(job.orderId).slice(0, 64);
    if (!doc.requeueReason && job?.requeueReason) next.requeueReason = String(job.requeueReason).slice(0, 80);

    if (Object.keys(next).length === 0) continue;
    touched += 1;
    if (!dryRun) {
      await databases.updateDocument(databaseId, printAuditCollectionId, doc.$id, next);
    }
  }

  console.log(`  ${dryRun ? "would update" : "updated"} ${touched} print_audit_entries rows`);
}

async function main() {
  const collections = await databases.listCollections(databaseId);
  const byId = new Map(collections.collections.map((c) => [String(c.$id), c]));
  const byName = new Map(collections.collections.map((c) => [String(c.name), c]));

  printJobsCollectionId =
    configuredPrintJobsCollectionId ||
    byName.get("Print Jobs")?.$id ||
    byId.get("print_jobs")?.$id ||
    "";
  printAuditCollectionId =
    configuredPrintAuditCollectionId ||
    byName.get("Print Audit Entries")?.$id ||
    byId.get("print_audit_entries")?.$id ||
    "";
  terminalControlsCollectionId =
    configuredTerminalControlsCollectionId ||
    byName.get("Print Terminal Controls")?.$id ||
    byId.get("print_terminal_controls")?.$id ||
    "";
  incidentsCollectionId =
    configuredIncidentsCollectionId ||
    byName.get("Print Ops Incidents")?.$id ||
    byId.get("print_ops_incidents")?.$id ||
    "";
  if (!terminalControlsCollectionId && !dryRun) {
    const ok = await ensureCollectionIfMissing("print_terminal_controls", "Print Terminal Controls");
    if (ok) terminalControlsCollectionId = "print_terminal_controls";
  }
  if (!incidentsCollectionId && !dryRun) {
    const ok = await ensureCollectionIfMissing("print_ops_incidents", "Print Ops Incidents");
    if (ok) incidentsCollectionId = "print_ops_incidents";
  }
  ordersCollectionId =
    configuredOrdersCollectionId || byName.get("Orders")?.$id || byId.get("orders")?.$id || "";

  if (!printJobsCollectionId || !printAuditCollectionId) {
    console.error("Could not resolve print collection IDs.");
    console.error("Set PRINT_JOBS_COLLECTION_ID and PRINT_AUDIT_ENTRIES_COLLECTION_ID in .env.local.");
    process.exit(1);
  }

  console.log("🚀 Print Ops Wave A migration");
  console.log("Database:", databaseId);
  console.log("Print jobs:", printJobsCollectionId);
  console.log("Print audit:", printAuditCollectionId);
  console.log("Terminal controls:", terminalControlsCollectionId || "(not resolved)");
  console.log("Ops incidents:", incidentsCollectionId || "(not resolved)");
  console.log("Orders:", ordersCollectionId || "(not resolved)");
  console.log("Dry run:", dryRun ? "yes" : "no");

  await ensureSchema();
  await backfillJobs();
  await backfillAuditEntries();

  console.log(`✅ Wave A migration ${dryRun ? "dry run complete" : "complete"}`);
}

main().catch((err) => {
  console.error("❌ migrate-print-ops-wave-a failed:", err?.message || err);
  process.exit(1);
});

