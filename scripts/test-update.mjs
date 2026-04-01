import { loadEnvConfig } from '@next/env';
const { loadEnvConfig: load } = require('@next/env');
load(process.cwd());

import { Client, Databases } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_ENDPOINT)
  .setProject(process.env.PROJECT_ID)
  .setKey(process.env.API_KEY);

const databases = new Databases(client);

async function testUpdate() {
  try {
    const res = await databases.updateDocument(
      process.env.DATABASE_ID,
      process.env.MENU_ITEMS_COLLECTION_ID,
      '69be8ea5000e1033bdd6', // The ID the user had trouble with
      {
        name: "Test Update String",
      }
    );
    console.log("Success:", res.$id);
  } catch (e) {
    console.error("Appwrite Update Error:", e.message);
  }
}

testUpdate();
