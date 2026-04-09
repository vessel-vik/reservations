#!/usr/bin/env node

/**
 * Export payment collections to local JSON backups.
 * Usage:
 *   npm run backup-payments
 * Output:
 *   backups/payments/<timestamp>/*.json
 */

const fs = require("node:fs");
const path = require("node:path");
const { Client, Databases, Query } = require("node-appwrite");
require("dotenv").config({ path: ".env.local" });

const endpoint = process.env.NEXT_PUBLIC_ENDPOINT;
const projectId = process.env.PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;
const apiKey = process.env.API_KEY;
const databaseId = process.env.DATABASE_ID;

const collections = {
  jobs: process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID || "payment_settlement_jobs",
  idempotency: process.env.PAYMENT_IDEMPOTENCY_COLLECTION_ID || "payment_idempotency",
  ledger: process.env.PAYMENT_LEDGER_COLLECTION_ID || "payment_ledger",
};

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error("Missing Appwrite env vars. Need NEXT_PUBLIC_ENDPOINT, PROJECT_ID, API_KEY, DATABASE_ID.");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function listAllDocuments(collectionId) {
  const pageSize = 100;
  let offset = 0;
  let all = [];

  while (true) {
    const page = await databases.listDocuments(databaseId, collectionId, [
      Query.limit(pageSize),
      Query.offset(offset),
    ]);
    const docs = Array.isArray(page.documents) ? page.documents : [];
    all = all.concat(docs);
    if (docs.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

function safeTimestamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function backupCollection(name, collectionId, outputDir) {
  const startedAt = new Date().toISOString();
  const docs = await listAllDocuments(collectionId);
  const endedAt = new Date().toISOString();
  const payload = {
    collection: collectionId,
    exportedAt: endedAt,
    startedAt,
    count: docs.length,
    documents: docs,
  };

  const filePath = path.join(outputDir, `${name}.json`);
  writeJson(filePath, payload);
  return { name, collectionId, count: docs.length, filePath };
}

async function main() {
  const backupDir = path.join(process.cwd(), "backups", "payments", safeTimestamp());
  fs.mkdirSync(backupDir, { recursive: true });

  console.log("📦 Exporting payment backups...");
  const results = [];

  for (const [name, collectionId] of Object.entries(collections)) {
    try {
      const result = await backupCollection(name, collectionId, backupDir);
      results.push(result);
      console.log(`✅ ${name}: ${result.count} docs -> ${path.relative(process.cwd(), result.filePath)}`);
    } catch (err) {
      const msg = String(err?.message || err || "");
      console.warn(`⚠️ Skipped ${name} (${collectionId}): ${msg}`);
    }
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    databaseId,
    endpoint,
    projectId,
    collections,
    results,
  };
  writeJson(path.join(backupDir, "manifest.json"), manifest);

  console.log(`\n✅ Backup complete: ${path.relative(process.cwd(), backupDir)}`);
}

main().catch((err) => {
  console.error("❌ backup-payments failed:", err?.message || err);
  process.exit(1);
});

