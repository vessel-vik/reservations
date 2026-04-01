import * as sdk from "node-appwrite";

export const {
  NEXT_PUBLIC_ENDPOINT: ENDPOINT,
  PROJECT_ID,
  API_KEY,
  DATABASE_ID,
  PATIENT_COLLECTION_ID,
  DOCTOR_COLLECTION_ID,
  APPOINTMENT_COLLECTION_ID,
  MENU_ITEMS_COLLECTION_ID,
  ORDERS_COLLECTION_ID,
  CATEGORIES_COLLECTION_ID,
  EXPENSES_COLLECTION_ID,
  BUDGETS_COLLECTION_ID,
  MODIFIER_GROUPS_COLLECTION_ID,
  NEXT_PUBLIC_BUCKET_ID: BUCKET_ID,
  // eTIMS Configuration
  ETIMS_API_URL,
  ETIMS_CMC_KEY,
  ETIMS_DEVICE_SERIAL,
  ETIMS_CERTIFICATE,
} = process.env;

const client = new sdk.Client();

// Set default/demo values if env vars are missing to allow offline mode to work
const safeEndpoint = ENDPOINT || 'https://cloud.appwrite.io/v1';
const safeProjectId = PROJECT_ID || 'demo';
const safeApiKey = API_KEY || '';

client.setEndpoint(safeEndpoint).setProject(safeProjectId);

if (safeApiKey) {
  client.setKey(safeApiKey);
} else {
  console.warn('⚠️ API_KEY not set - running in limited/offline mode');
}

export const databases = new sdk.Databases(client);
export const users = new sdk.Users(client);
export const messaging = new sdk.Messaging(client);
export const storage = new sdk.Storage(client);
