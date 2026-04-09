const { Client, Databases } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_ENDPOINT)
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.API_KEY);

const databases = new Databases(client);

const DATABASE_ID = process.env.DATABASE_ID;
const COLLECTION_ID = process.env.CATEGORIES_COLLECTION_ID || 'categories';

/**
 * Fixed document IDs = relationship targets for menu_items.category (manyToOne → categories).
 * Order matches typical POS tab order (bar-first for AM | PM Lounge).
 */
const CATEGORIES = [
  { id: 'beers', name: 'beers', label: 'Beers', slug: 'beers', index: 0 },
  { id: 'whiskys', name: 'whiskys', label: 'Whiskys', slug: 'whiskys', index: 1 },
  { id: 'cognac', name: 'cognac', label: 'Cognac', slug: 'cognac', index: 2 },
  { id: 'cocktails', name: 'cocktails', label: 'Cocktails', slug: 'cocktails', index: 3 },
  { id: 'soft_drinks', name: 'soft_drinks', label: 'Soft Drinks', slug: 'soft_drinks', index: 4 },
  { id: 'wine', name: 'wine', label: 'Wine', slug: 'wine', index: 5 },
  { id: 'food', name: 'food', label: 'Food', slug: 'food', index: 6 },
  { id: 'salads', name: 'salads', label: 'Salads', slug: 'salads', index: 7 },
  { id: 'desserts', name: 'desserts', label: 'Desserts', slug: 'desserts', index: 8 },
];

async function seedCategories() {
  console.log('🌱 Seeding categories (fixed IDs for product relationships)...\n');

  if (!DATABASE_ID || !COLLECTION_ID) {
    console.error('❌ DATABASE_ID or CATEGORIES_COLLECTION_ID missing in .env.local');
    process.exit(1);
  }

  try {
    for (const cat of CATEGORIES) {
      try {
        await databases.createDocument(DATABASE_ID, COLLECTION_ID, cat.id, {
          name: cat.name,
          label: cat.label,
          slug: cat.slug,
          index: cat.index,
          isActive: true,
        });
        console.log(`✅ Created category: ${cat.label} (${cat.id})`);
      } catch (error) {
        if (error.code === 409) {
          await databases.updateDocument(DATABASE_ID, COLLECTION_ID, cat.id, {
            name: cat.name,
            label: cat.label,
            slug: cat.slug,
            index: cat.index,
            isActive: true,
          });
          console.log(`♻️  Updated category: ${cat.label} (${cat.id})`);
        } else {
          console.error(`❌ Failed ${cat.label}:`, error.message);
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    console.log('\n🎉 Categories ready:', CATEGORIES.length);
  } catch (error) {
    console.error('❌ Error seeding categories:', error.message);
    process.exit(1);
  }
}

seedCategories();
