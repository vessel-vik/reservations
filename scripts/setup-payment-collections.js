#!/usr/bin/env node

/**
 * Creates payment settlement collections required for queue-first flow:
 * - payment_settlement_jobs
 * - payment_idempotency
 * - payment_ledger
 */

const { Client, Databases, Permission, Role } = require("node-appwrite");
require("dotenv").config({ path: ".env.local" });

const endpoint = process.env.NEXT_PUBLIC_ENDPOINT;
const projectId = process.env.PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;
const apiKey = process.env.API_KEY;
const databaseId = process.env.DATABASE_ID;

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error("Missing Appwrite env vars. Need NEXT_PUBLIC_ENDPOINT, PROJECT_ID, API_KEY, DATABASE_ID.");
  process.exit(1);
}

const collections = {
  jobs: process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID || "payment_settlement_jobs",
  idempotency: process.env.PAYMENT_IDEMPOTENCY_COLLECTION_ID || "payment_idempotency",
  ledger: process.env.PAYMENT_LEDGER_COLLECTION_ID || "payment_ledger",
};

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function ensureCollection(collectionId, name) {
  try {
    await databases.createCollection(
      databaseId,
      collectionId,
      name,
      [
        Permission.read(Role.any()),
        Permission.create(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any()),
      ]
    );
    console.log(`✅ created collection: ${collectionId}`);
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`ℹ️ collection exists: ${collectionId}`);
    } else {
      throw err;
    }
  }
}

async function ensureStringAttr(collectionId, key, size, required, def) {
  try {
    await databases.createStringAttribute(databaseId, collectionId, key, size, required, required ? undefined : def);
    console.log(`  + ${collectionId}.${key}`);
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!msg.toLowerCase().includes("already exists")) {
      console.warn(`  ! ${collectionId}.${key}: ${msg}`);
    }
  }
}

async function ensureFloatAttr(collectionId, key, required) {
  try {
    await databases.createFloatAttribute(databaseId, collectionId, key, required);
    console.log(`  + ${collectionId}.${key}`);
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!msg.toLowerCase().includes("already exists")) {
      console.warn(`  ! ${collectionId}.${key}: ${msg}`);
    }
  }
}

async function ensureIntAttr(collectionId, key, required, def) {
  try {
    await databases.createIntegerAttribute(
      databaseId,
      collectionId,
      key,
      required,
      undefined,
      undefined,
      required ? undefined : def
    );
    console.log(`  + ${collectionId}.${key}`);
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!msg.toLowerCase().includes("already exists")) {
      console.warn(`  ! ${collectionId}.${key}: ${msg}`);
    }
  }
}

async function ensureIndex(collectionId, key, type, attributes) {
  try {
    await databases.createIndex(databaseId, collectionId, key, type, attributes);
    console.log(`  # index ${collectionId}.${key}`);
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!msg.toLowerCase().includes("already exists")) {
      console.warn(`  ! index ${collectionId}.${key}: ${msg}`);
    }
  }
}

async function setupJobs() {
  const c = collections.jobs;
  await ensureCollection(c, "Payment Settlement Jobs");
  await ensureStringAttr(c, "businessId", 64, true);
  await ensureStringAttr(c, "status", 24, true);
  await ensureStringAttr(c, "orderIdsJson", 5000, true);
  await ensureStringAttr(c, "paymentSplitsJson", 5000, true);
  await ensureStringAttr(c, "paymentMethod", 40, true);
  await ensureStringAttr(c, "paymentReference", 160, false);
  await ensureStringAttr(c, "terminalId", 120, false);
  await ensureStringAttr(c, "idempotencyKey", 160, true);
  await ensureStringAttr(c, "requestHash", 128, true);
  await ensureStringAttr(c, "createdBy", 64, true);
  await ensureStringAttr(c, "createdAt", 40, true);
  await ensureStringAttr(c, "startedAt", 40, false);
  await ensureStringAttr(c, "completedAt", 40, false);
  await ensureStringAttr(c, "resultJson", 5000, false);
  await ensureStringAttr(c, "errorMessage", 500, false);
  await ensureIntAttr(c, "attemptCount", true);

  await ensureIndex(c, "jobs_business_status_createdAt", "key", ["businessId", "status", "createdAt"]);
  await ensureIndex(c, "jobs_business_idem", "key", ["businessId", "idempotencyKey"]);
}

async function setupIdempotency() {
  const c = collections.idempotency;
  await ensureCollection(c, "Payment Idempotency");
  await ensureStringAttr(c, "businessId", 64, true);
  await ensureStringAttr(c, "idempotencyKey", 160, true);
  await ensureStringAttr(c, "requestHash", 128, true);
  await ensureStringAttr(c, "status", 24, true);
  await ensureStringAttr(c, "responseJson", 5000, false);
  await ensureStringAttr(c, "createdAt", 40, true);
  await ensureStringAttr(c, "expiresAt", 40, false);

  await ensureIndex(c, "idem_business_key", "key", ["businessId", "idempotencyKey"]);
  await ensureIndex(c, "idem_business_createdAt", "key", ["businessId", "createdAt"]);
}

async function setupLedger() {
  const c = collections.ledger;
  await ensureCollection(c, "Payment Ledger");
  await ensureStringAttr(c, "businessId", 64, true);
  await ensureStringAttr(c, "orderId", 64, true);
  await ensureStringAttr(c, "settlementGroupId", 64, false);
  await ensureStringAttr(c, "method", 24, true);
  await ensureFloatAttr(c, "amount", true);
  await ensureStringAttr(c, "reference", 220, false);
  await ensureStringAttr(c, "terminalId", 120, false);
  await ensureStringAttr(c, "source", 24, true);
  await ensureStringAttr(c, "status", 24, true);
  await ensureStringAttr(c, "settledAt", 40, true);
  await ensureStringAttr(c, "createdAt", 40, true);

  await ensureIndex(c, "ledger_business_order_settledAt", "key", ["businessId", "orderId", "settledAt"]);
  await ensureIndex(c, "ledger_business_method_settledAt", "key", ["businessId", "method", "settledAt"]);
}

async function main() {
  console.log("🚀 Setting up payment collections");
  console.log("Database:", databaseId);
  console.log("Jobs:", collections.jobs);
  console.log("Idempotency:", collections.idempotency);
  console.log("Ledger:", collections.ledger);

  await setupJobs();
  await setupIdempotency();
  await setupLedger();

  console.log("\n✅ Payment collections ready");
  console.log("Set these env vars:");
  console.log(`PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID=${collections.jobs}`);
  console.log(`PAYMENT_IDEMPOTENCY_COLLECTION_ID=${collections.idempotency}`);
  console.log(`PAYMENT_LEDGER_COLLECTION_ID=${collections.ledger}`);
}

main().catch((err) => {
  console.error("❌ setup-payment-collections failed:", err?.message || err);
  process.exit(1);
});

