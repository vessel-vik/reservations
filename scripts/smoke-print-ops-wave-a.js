#!/usr/bin/env node

/**
 * Targeted smoke validation for Wave A print ops contract:
 * queue -> status -> timeline
 *
 * Usage:
 *   node scripts/smoke-print-ops-wave-a.js
 */

const { Client, Databases, ID, Query } = require("node-appwrite");
require("dotenv").config({ path: ".env.local" });

const endpoint = process.env.NEXT_PUBLIC_ENDPOINT;
const projectId = process.env.PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;
const apiKey = process.env.API_KEY;
const databaseId = process.env.DATABASE_ID;
const printJobsCollectionId =
  process.env.PRINT_JOBS_COLLECTION_ID || process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;
const printAuditCollectionId = process.env.PRINT_AUDIT_ENTRIES_COLLECTION_ID;

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error("Missing Appwrite env vars (endpoint/project/key/database).");
  process.exit(1);
}
if (!printJobsCollectionId || !printAuditCollectionId) {
  console.error("Missing PRINT_JOBS_COLLECTION_ID or PRINT_AUDIT_ENTRIES_COLLECTION_ID.");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

function isoNow() {
  return new Date().toISOString();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const businessId = String(process.env.SMOKE_BUSINESS_ID || "smoke-business");
  const orderId = `smoke-order-${Date.now()}`;
  const targetTerminal = "smoke-terminal";
  const content = `orderId:${orderId}`;
  const queuedAt = isoNow();

  let printJobId = "";
  const createdAuditIds = [];

  try {
    // 1) Queue simulation
    const queuedJob = await databases.createDocument(
      databaseId,
      printJobsCollectionId,
      ID.unique(),
      {
        businessId,
        status: "pending",
        jobType: "receipt",
        category: "receipt",
        content,
        orderId,
        dedupeKey: `smoke:${orderId}`.slice(0, 120),
        waiterId: "smoke-waiter",
        waiterNameSnapshot: "Smoke Waiter",
        createdByUserId: "smoke-user",
        createdByRole: "org:admin",
        timestamp: queuedAt,
        queuedAt,
        printedAt: "",
        attemptCount: 0,
        targetTerminal,
        errorMessage: "",
      }
    );
    printJobId = queuedJob.$id;
    console.log(`queued job: ${printJobId}`);

    const queuedAudit = await databases.createDocument(
      databaseId,
      printAuditCollectionId,
      ID.unique(),
      {
        businessId,
        printJobId,
        orderId,
        jobType: "receipt",
        category: "receipt",
        status: "queued",
        summary: "Queued receipt",
        timestamp: isoNow(),
        dedupeKey: `smoke:${orderId}`.slice(0, 120),
        actorUserId: "smoke-user",
        actorRole: "org:admin",
        waiterId: "smoke-waiter",
        terminalId: targetTerminal,
      }
    );
    createdAuditIds.push(queuedAudit.$id);

    // 2) Status simulation (printing -> completed)
    await databases.updateDocument(databaseId, printJobsCollectionId, printJobId, {
      status: "printing",
      attemptCount: 0,
    });
    const printingAudit = await databases.createDocument(
      databaseId,
      printAuditCollectionId,
      ID.unique(),
      {
        businessId,
        printJobId,
        orderId,
        jobType: "receipt",
        category: "receipt",
        status: "printing",
        summary: "Printer accepted job",
        timestamp: isoNow(),
        dedupeKey: `smoke:${orderId}`.slice(0, 120),
        actorUserId: "smoke-user",
        actorRole: "org:admin",
        waiterId: "smoke-waiter",
        terminalId: targetTerminal,
      }
    );
    createdAuditIds.push(printingAudit.$id);

    const printedAt = isoNow();
    await databases.updateDocument(databaseId, printJobsCollectionId, printJobId, {
      status: "completed",
      printedAt,
      attemptCount: 0,
    });
    const completedAudit = await databases.createDocument(
      databaseId,
      printAuditCollectionId,
      ID.unique(),
      {
        businessId,
        printJobId,
        orderId,
        jobType: "receipt",
        category: "receipt",
        status: "completed",
        summary: "Printed receipt",
        timestamp: printedAt,
        dedupeKey: `smoke:${orderId}`.slice(0, 120),
        actorUserId: "smoke-user",
        actorRole: "org:admin",
        waiterId: "smoke-waiter",
        terminalId: targetTerminal,
      }
    );
    createdAuditIds.push(completedAudit.$id);

    // 3) Timeline validation
    const jobsRes = await databases.listDocuments(databaseId, printJobsCollectionId, [
      Query.equal("businessId", businessId),
      Query.equal("orderId", orderId),
      Query.orderDesc("$createdAt"),
      Query.limit(20),
    ]);
    const auditRes = await databases.listDocuments(databaseId, printAuditCollectionId, [
      Query.equal("businessId", businessId),
      Query.equal("orderId", orderId),
      Query.orderDesc("timestamp"),
      Query.limit(50),
    ]);

    const timeline = [
      ...jobsRes.documents.map((j) => ({
        source: "job",
        status: j.status,
        at: j.printedAt || j.queuedAt || j.timestamp || j.$createdAt,
      })),
      ...auditRes.documents.map((a) => ({
        source: "audit",
        status: a.status,
        at: a.timestamp || a.$createdAt,
      })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    assert(jobsRes.documents.length >= 1, "Expected at least one print job in timeline query.");
    assert(auditRes.documents.length >= 3, "Expected at least three audit entries in timeline query.");
    assert(
      jobsRes.documents.some((d) => String(d.status) === "completed"),
      "Expected final print job status to be completed."
    );
    assert(
      auditRes.documents.some((d) => String(d.status) === "queued") &&
        auditRes.documents.some((d) => String(d.status) === "printing") &&
        auditRes.documents.some((d) => String(d.status) === "completed"),
      "Expected queued -> printing -> completed audit trail."
    );

    console.log("timeline events:");
    for (const row of timeline) {
      console.log(` - [${row.source}] ${row.status} @ ${row.at}`);
    }
    console.log("✅ Smoke validation passed: queue -> status -> timeline");
  } finally {
    // Keep data clean for repeated smoke runs.
    for (const auditId of createdAuditIds) {
      try {
        await databases.deleteDocument(databaseId, printAuditCollectionId, auditId);
      } catch {}
    }
    if (printJobId) {
      try {
        await databases.deleteDocument(databaseId, printJobsCollectionId, printJobId);
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error("❌ smoke-print-ops-wave-a failed:", err?.message || err);
  process.exit(1);
});

