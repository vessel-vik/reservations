import { Client, Databases } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);

async function check() {
  const collectionId = process.env.NEXT_PUBLIC_MENU_ITEMS_COLLECTION_ID;
  const dbId = process.env.NEXT_PUBLIC_DATABASE_ID;
  const attrs = await databases.listAttributes(dbId!, collectionId!);
  console.log(attrs.attributes.map(a => `${a.key}: required=${a.required}`));
}
check();
