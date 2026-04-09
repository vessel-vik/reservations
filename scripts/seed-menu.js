const { Client, Databases, ID, Query } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_ENDPOINT)
  .setProject(process.env.PROJECT_ID)
  .setKey(process.env.API_KEY);

const databases = new Databases(client);

const DATABASE_ID = process.env.DATABASE_ID;
const MENU_COLLECTION_ID = process.env.MENU_ITEMS_COLLECTION_ID || 'menu_items';

/**
 * `category` MUST be a categories collection document ID (see scripts/seed-categories.js).
 * Prices in KES to match POS display.
 */
const MENU_ITEMS = [
  // Beers
  { name: 'Tusker Lager', description: '500ml bottle', price: 300, category: 'beers', preparationTime: 5, popularity: 20, stock: 120, lowStockThreshold: 24 },
  { name: 'White Cap', description: '500ml bottle', price: 300, category: 'beers', preparationTime: 5, popularity: 18, stock: 100, lowStockThreshold: 20 },
  { name: 'Guinness Smooth', description: '330ml bottle', price: 300, category: 'beers', preparationTime: 5, popularity: 16, stock: 80, lowStockThreshold: 16 },
  { name: 'Savanna Dry', description: '330ml bottle', price: 350, category: 'beers', preparationTime: 5, popularity: 14, stock: 60, lowStockThreshold: 12 },
  // Whiskys
  { name: 'Johnnie Walker Black', description: '30ml pour', price: 450, category: 'whiskys', preparationTime: 5, popularity: 12, stock: 40, lowStockThreshold: 8 },
  { name: 'Jameson', description: '30ml pour', price: 400, category: 'whiskys', preparationTime: 5, popularity: 11, stock: 40, lowStockThreshold: 8 },
  // Cognac
  { name: 'Hennessy VS', description: '30ml pour', price: 550, category: 'cognac', preparationTime: 5, popularity: 10, stock: 25, lowStockThreshold: 5 },
  // Cocktails
  { name: 'Captain Morgan & Cola', description: 'House mix', price: 450, category: 'cocktails', preparationTime: 8, popularity: 15, stock: null, lowStockThreshold: 5 },
  // Soft drinks
  { name: 'Water 500ml', description: 'Still mineral water', price: 100, category: 'soft_drinks', preparationTime: 2, popularity: 25, stock: 200, lowStockThreshold: 40 },
  { name: 'Soda 300ml', description: 'Assorted flavours', price: 150, category: 'soft_drinks', preparationTime: 2, popularity: 18, stock: 150, lowStockThreshold: 30 },
  // Wine
  { name: 'House Red (glass)', description: '175ml', price: 450, category: 'wine', preparationTime: 3, popularity: 9, stock: 30, lowStockThreshold: 6 },
  { name: 'House White (glass)', description: '175ml', price: 450, category: 'wine', preparationTime: 3, popularity: 8, stock: 30, lowStockThreshold: 6 },
  // Food
  { name: 'Beef Sliders (3)', description: 'Mini burgers, pickles, house sauce', price: 850, category: 'food', preparationTime: 18, popularity: 12, ingredients: ['beef', 'bun', 'pickles'], allergens: ['gluten', 'dairy'], isVegetarian: false, isGlutenFree: false, calories: 520 },
  { name: 'Chicken Wings (6)', description: 'Spicy glaze, celery', price: 750, category: 'food', preparationTime: 20, popularity: 14, ingredients: ['chicken'], allergens: [], isVegetarian: false, isGlutenFree: true, calories: 480 },
  // Salads
  { name: 'Garden Salad', description: 'Mixed greens, vinaigrette', price: 550, category: 'salads', preparationTime: 10, popularity: 10, ingredients: ['lettuce', 'tomato', 'cucumber'], isVegetarian: true, isVegan: true, isGlutenFree: true, calories: 120 },
  // Desserts
  { name: 'Chocolate Brownie', description: 'Warm, vanilla ice cream', price: 450, category: 'desserts', preparationTime: 8, popularity: 11, ingredients: ['chocolate', 'flour', 'eggs'], allergens: ['gluten', 'dairy', 'eggs'], isVegetarian: true, calories: 380 },
];

function buildPayload(row) {
  const ingredients = row.ingredients || [];
  const allergens = row.allergens || [];
  const stock =
    row.stock === undefined || row.stock === null ? null : Number(row.stock);
  return {
    name: row.name,
    description: row.description || '',
    price: Number(row.price),
    category: row.category,
    imageUrl: row.imageUrl || '',
    isAvailable: row.isAvailable !== false,
    preparationTime: Math.min(120, Math.max(1, Number(row.preparationTime) || 10)),
    ingredients,
    allergens,
    isVegetarian: !!row.isVegetarian,
    isVegan: !!row.isVegan,
    isGlutenFree: !!row.isGlutenFree,
    calories: row.calories != null ? Number(row.calories) : null,
    popularity: Number(row.popularity) || 5,
    isActive: true,
    stock,
    lowStockThreshold: row.lowStockThreshold != null ? Number(row.lowStockThreshold) : 5,
  };
}

async function findExistingByName(name) {
  const res = await databases.listDocuments(DATABASE_ID, MENU_COLLECTION_ID, [
    Query.equal('name', name),
    Query.limit(1),
  ]);
  return res.documents[0] || null;
}

async function seed() {
  console.log('🌱 Seeding menu items (categories must exist — run seed-categories first)...\n');

  if (!DATABASE_ID || !MENU_COLLECTION_ID) {
    console.error('❌ DATABASE_ID or MENU_ITEMS_COLLECTION_ID missing in .env.local');
    process.exit(1);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of MENU_ITEMS) {
    const payload = buildPayload(row);
    try {
      const existing = await findExistingByName(payload.name);
      if (existing) {
        await databases.updateDocument(DATABASE_ID, MENU_COLLECTION_ID, existing.$id, payload);
        console.log(`♻️  Updated: ${payload.name} → category ${payload.category}`);
        updated += 1;
      } else {
        await databases.createDocument(DATABASE_ID, MENU_COLLECTION_ID, ID.unique(), payload);
        console.log(`✅ Created: ${payload.name} (${payload.category})`);
        created += 1;
      }
    } catch (error) {
      console.error(`❌ ${payload.name}:`, error.message);
      skipped += 1;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\n🎉 Menu seed done — created: ${created}, updated: ${updated}, errors: ${skipped}`);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
