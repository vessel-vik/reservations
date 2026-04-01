import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { Client, Databases } from 'node-appwrite';

// Load env variables from .env.local / .env
loadEnvConfig(process.cwd());

const { 
  NEXT_PUBLIC_ENDPOINT: ENDPOINT, 
  PROJECT_ID, 
  API_KEY, 
  DATABASE_ID, 
  MENU_ITEMS_COLLECTION_ID 
} = process.env;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !MENU_ITEMS_COLLECTION_ID) {
  console.error("Missing Appwrite credentials. Check your .env config.");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function createAttributes() {
  console.log('Initiating schema migration for Menu Items collection...');

  const attributes = [
    // Create 'stock' (Integer, not required)
    () => databases.createIntegerAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'stock', false, 0, 100000, null),
    // Create 'lowStockThreshold'
    () => databases.createIntegerAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'lowStockThreshold', false, 0, 10000, 5),
    // Create Dietary Flags
    () => databases.createBooleanAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'isVegetarian', false, false),
    () => databases.createBooleanAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'isVegan', false, false),
    () => databases.createBooleanAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'isGlutenFree', false, false),
    // Create Tag Arrays
    () => databases.createStringAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'ingredients', 255, false, null, true),
    () => databases.createStringAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'allergens', 255, false, null, true),
    // Create Modifiers Array
    () => databases.createStringAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'modifierGroupIds', 255, false, null, true),
    // Numeric metrics
    () => databases.createIntegerAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'calories', false, 0, 10000, null),
    () => databases.createIntegerAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'preparationTime', false, 0, 1000, 10),
    // Strings
    () => databases.createStringAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'vatCategory', 50, false, 'standard', false),
    () => databases.createBooleanAttribute(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'isActive', false, true),
  ];

  for (const createFn of attributes) {
    try {
      await createFn();
      console.log(`✅ Success`);
      
      // Wait to prevent database lock collisions while building the attribute
      console.log('Waiting 3s for Appwrite schema compilation...');
      await sleep(3000); 
    } catch (e) {
      if (e.code === 409 || e.message?.includes('already exists')) {
        console.log(`⏭️  Skipping attribute (already exists)`);
      } else {
        console.error(`❌ Failed:`, e.message);
      }
    }
  }
  
  console.log('Migration complete!');
}

createAttributes();
