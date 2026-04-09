#!/usr/bin/env node

const crypto = require("crypto");
const { Client, Databases, ID, Permission, Role, Query } = require("node-appwrite");
require("dotenv").config({ path: ".env.local" });

const ENDPOINT = process.env.NEXT_PUBLIC_ENDPOINT;
const PROJECT_ID = process.env.PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID;
const API_KEY = process.env.API_KEY || process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.DATABASE_ID;
const COLLECTION_ID = process.env.STAFF_PASSKEYS_COLLECTION_ID || "staff_passkeys";
const PEPPER = process.env.STAFF_PASSKEY_PEPPER || "";
const DEFAULT_BUSINESS_ID = process.env.STAFF_PASSKEYS_BUSINESS_ID || "";
const SEED_JSON = process.env.STAFF_PASSKEYS_SEED_JSON || "[]";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing required env vars: NEXT_PUBLIC_ENDPOINT, PROJECT_ID/NEXT_PUBLIC_PROJECT_ID, API_KEY/APPWRITE_API_KEY, DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

function hashPin(pin) {
  return crypto.createHash("sha256").update(`${String(pin)}:${PEPPER}`).digest("hex");
}

async function ensureCollection() {
  try {
    await databases.createCollection(
      DATABASE_ID,
      COLLECTION_ID,
      "Staff Passkeys",
      [
        Permission.create(Role.any()),
        Permission.read(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any()),
      ]
    );
    console.log(`✅ Created collection ${COLLECTION_ID}`);
  } catch (e) {
    if (String(e.message || "").includes("already exists")) {
      console.log(`ℹ️ Collection ${COLLECTION_ID} already exists`);
    } else {
      throw e;
    }
  }
}

async function ensureString(key, size, required = false, defaultValue = undefined) {
  try {
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, key, size, required, defaultValue);
    console.log(`  ✅ attr ${key}`);
  } catch (e) {
    if (!String(e.message || "").includes("already exists")) {
      console.log(`  ⚠️ attr ${key}: ${e.message}`);
    }
  }
}

async function ensureBoolean(key, required = false, defaultValue = undefined) {
  try {
    await databases.createBooleanAttribute(DATABASE_ID, COLLECTION_ID, key, required, defaultValue);
    console.log(`  ✅ attr ${key}`);
  } catch (e) {
    if (!String(e.message || "").includes("already exists")) {
      console.log(`  ⚠️ attr ${key}: ${e.message}`);
    }
  }
}

async function ensureIndex(key, attrs) {
  try {
    await databases.createIndex(DATABASE_ID, COLLECTION_ID, key, "key", attrs);
    console.log(`  ✅ index ${key}`);
  } catch (e) {
    if (!String(e.message || "").includes("already exists")) {
      console.log(`  ⚠️ index ${key}: ${e.message}`);
    }
  }
}

async function ensureSchema() {
  console.log("🔧 Ensuring staff passkey schema...");
  await ensureString("businessId", 64, true);
  await ensureString("waiterUserId", 64, true);
  await ensureString("waiterName", 255, true);
  await ensureString("pinHash", 128, true);
  await ensureString("pinVersion", 20, false, "v1");
  await ensureBoolean("isActive", false, true);
  await ensureString("lastRotatedAt", 40, false);

  await ensureIndex("staff_passkeys_biz_waiter", ["businessId", "waiterUserId"]);
  await ensureIndex("staff_passkeys_biz_active", ["businessId", "isActive"]);
}

function parseSeed() {
  try {
    const parsed = JSON.parse(SEED_JSON);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

async function seedRows() {
  const rows = parseSeed();
  if (!rows.length) {
    console.log("ℹ️ No STAFF_PASSKEYS_SEED_JSON provided; schema setup only.");
    return;
  }

  console.log(`🌱 Seeding ${rows.length} staff passkey row(s)...`);
  for (const raw of rows) {
    const row = raw || {};
    const businessId = String(row.businessId || DEFAULT_BUSINESS_ID || "").trim();
    const waiterUserId = String(row.waiterUserId || "").trim();
    const waiterName = String(row.waiterName || "").trim();
    const pin = row.pin != null ? String(row.pin).trim() : "";
    const pinHashFromSeed = row.pinHash != null ? String(row.pinHash).trim() : "";

    if (!businessId || !waiterUserId || !waiterName) {
      console.log(`  ⚠️ skipping invalid row: missing businessId/waiterUserId/waiterName`);
      continue;
    }
    if (!pinHashFromSeed && !pin) {
      console.log(`  ⚠️ skipping ${waiterUserId}: missing pin or pinHash`);
      continue;
    }
    if (pin && !PEPPER) {
      throw new Error("STAFF_PASSKEY_PEPPER is required when seeding plaintext pin values");
    }

    const pinHash = pinHashFromSeed || hashPin(pin);
    const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
      Query.equal("businessId", businessId),
      Query.equal("waiterUserId", waiterUserId),
      Query.limit(1),
    ]).catch(() => null);

    const payload = {
      businessId,
      waiterUserId,
      waiterName,
      pinHash,
      pinVersion: "v1",
      isActive: true,
      lastRotatedAt: new Date().toISOString(),
    };

    if (existing && (existing.total || 0) > 0) {
      const id = existing.documents[0].$id;
      await databases.updateDocument(DATABASE_ID, COLLECTION_ID, id, payload);
      console.log(`  ♻️ updated ${waiterName} (${waiterUserId})`);
    } else {
      await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), payload);
      console.log(`  ✅ created ${waiterName} (${waiterUserId})`);
    }
  }
}

async function run() {
  console.log("🚀 Setup staff passkeys");
  await ensureCollection();
  await ensureSchema();
  await seedRows();
  console.log("🎉 Done.");
}

run().catch((e) => {
  console.error("❌ setup-staff-passkeys failed:", e.message || e);
  process.exit(1);
});

