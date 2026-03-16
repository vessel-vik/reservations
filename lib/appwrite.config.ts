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
  NEXT_PUBLIC_BUCKET_ID: BUCKET_ID,
  // eTIMS Configuration
  ETIMS_API_URL,
  ETIMS_CMC_KEY,
  ETIMS_DEVICE_SERIAL,
  ETIMS_CERTIFICATE,
} = process.env;

const client = new sdk.Client();

// Debug: Log configuration status
console.log('🚀 Appwrite Config Debug:', {
  endpoint: ENDPOINT ? 'Present' : 'Missing',
  projectId: PROJECT_ID ? 'Present' : 'Missing',
  apiKey: API_KEY ? 'Present' : 'Missing',
  databaseId: DATABASE_ID ? 'Present' : 'Missing',
  patientCollectionId: PATIENT_COLLECTION_ID ? 'Present' : 'Missing'
});

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error('❌ CRITICAL: Missing required Appwrite configuration!');
  console.error('Check your .env.local file for:', {
    NEXT_PUBLIC_ENDPOINT: ENDPOINT,
    PROJECT_ID,
    API_KEY: API_KEY ? 'Present' : 'Missing'
  });
}

client.setEndpoint(ENDPOINT!).setProject(PROJECT_ID!).setKey(API_KEY!);

export const databases = new sdk.Databases(client);
export const users = new sdk.Users(client);
export const messaging = new sdk.Messaging(client);
export const storage = new sdk.Storage(client);
