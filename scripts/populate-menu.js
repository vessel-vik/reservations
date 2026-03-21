/**
 * Script to populate menu categories and items in Appwrite
 * Run with: node scripts/populate-menu.js
 */

const { Client, Databases, ID } = require('node-appwrite');

const ENDPOINT = process.env.NEXT_PUBLIC_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.PROJECT_ID || '669036bb001fb0233dd6';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DATABASE_ID = process.env.DATABASE_ID || '66903c2a003b0f1910b7';
const MENU_ITEMS_COLLECTION_ID = process.env.MENU_ITEMS_COLLECTION_ID || 'menu_items';
const CATEGORIES_COLLECTION_ID = process.env.CATEGORIES_COLLECTION_ID || 'categories';

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

// Category mapping with display order
const categories = [
  { id: 'beers', name: 'Beers', label: 'Beers', index: 1, slug: 'beers' },
  { id: 'whiskys', name: 'Whiskys', label: 'Whiskys', index: 2, slug: 'whiskys' },
  { id: 'brandy', name: 'Brandy', label: 'Brandy', index: 3, slug: 'brandy' },
  { id: 'rum', name: 'Rum', label: 'Rum', index: 4, slug: 'rum' },
  { id: 'gin', name: 'Gin', label: 'Gin', index: 5, slug: 'gin' },
  { id: 'vodka', name: 'Vodka', label: 'Vodka', index: 6, slug: 'vodka' },
  { id: 'wines', name: 'Wines', label: 'Wines', index: 7, slug: 'wines' },
  { id: 'soft_drinks', name: 'Soft Drinks', label: 'Soft Drinks', index: 8, slug: 'soft-drinks' },
  { id: 'tequila', name: 'Tequila', label: 'Tequila', index: 9, slug: 'tequila' },
  { id: 'liqueur', name: 'Liqueur', label: 'Liqueur', index: 10, slug: 'liqueur' },
];

// Menu items with prices (typical Kenyan lounge prices in KES)
const menuItems = {
  beers: [
    { name: 'Tusker Lager', price: 350, description: 'Classic Kenyan lager', preparationTime: 2 },
    { name: 'Tusker Lite', price: 350, description: 'Light Kenyan lager', preparationTime: 2 },
    { name: 'Balbozi', price: 350, description: 'Premium lager', preparationTime: 2 },
    { name: 'White Cap', price: 350, description: 'Quality lager', preparationTime: 2 },
    { name: 'Guinness Lager', price: 400, description: 'Dark Irish stout', preparationTime: 2 },
    { name: 'Guinness Smooth', price: 400, description: 'Smooth stout', preparationTime: 2 },
    { name: 'Heineken', price: 500, description: 'Premium international lager', preparationTime: 2 },
    { name: 'Savanna', price: 400, description: 'Refreshing cider', preparationTime: 2 },
    { name: 'Amarula', price: 450, description: 'Cream liqueur', preparationTime: 2 },
    { name: 'Black Ice', price: 400, description: 'Ice beer', preparationTime: 2 },
    { name: 'Pineapple Punch', price: 350, description: 'Fruit cocktail', preparationTime: 2 },
    { name: 'Guarana', price: 300, description: 'Energy drink', preparationTime: 2 },
    { name: 'Hafee Kenya 254', price: 350, description: 'Local brew', preparationTime: 2 },
  ],
  whiskys: [
    { name: 'Black Label 1L', price: 3500, description: 'Premium blended Scotch', preparationTime: 2 },
    { name: 'Singleton 12yrs', price: 2500, description: '12 year single malt', preparationTime: 2 },
    { name: 'Singleton 15yrs', price: 3500, description: '15 year single malt', preparationTime: 2 },
    { name: 'Hankey VS', price: 1800, description: 'Blended whiskey', preparationTime: 2 },
    { name: 'Grants 1L', price: 2200, description: 'Blended Scotch', preparationTime: 2 },
  ],
  brandy: [
    { name: 'Vice Roy', price: 1500, description: 'Quality brandy', preparationTime: 2 },
  ],
  rum: [
    { name: 'Captain Morgan Spiced 1L', price: 2500, description: 'Spiced rum', preparationTime: 2 },
  ],
  gin: [
    { name: 'Gordons 1L', price: 2500, description: 'Premium gin', preparationTime: 2 },
    { name: 'Gilbeys', price: 1500, description: 'Classic gin', preparationTime: 2 },
  ],
  vodka: [
    { name: 'Smirnoff Red 1L', price: 2500, description: 'Premium vodka', preparationTime: 2 },
  ],
  wines: [
    { name: 'Pierre Marcel Red', price: 1200, description: 'South African red wine', preparationTime: 2 },
    { name: 'Pierre Marcel White', price: 1200, description: 'South African white wine', preparationTime: 2 },
    { name: 'Drostdy Hof Red', price: 900, description: 'Table red wine', preparationTime: 2 },
    { name: 'Drostdy Hof White', price: 900, description: 'Table white wine', preparationTime: 2 },
    { name: 'Four Cousins Red', price: 1100, description: 'Sweet red wine', preparationTime: 2 },
    { name: 'Four Cousins White', price: 1100, description: 'Sweet white wine', preparationTime: 2 },
    { name: 'Nederburg White', price: 1000, description: 'White wine', preparationTime: 2 },
  ],
  soft_drinks: [
    { name: 'Soda', price: 150, description: 'Carbonated soft drink', preparationTime: 1 },
    { name: 'Water1L', price: 200, description: 'Bottled water 1L', preparationTime: 1 },
    { name: 'Water500ml', price: 150, description: 'Bottled water 500ml', preparationTime: 1 },
    { name: 'PicanaDelmonte', price: 350, description: 'Fruit juice', preparationTime: 2 },
  ],
  tequila: [
    { name: 'Jose Cuervo Gold', price: 1800, description: 'Gold tequila', preparationTime: 2 },
    { name: 'Jose Cuervo Silver', price: 1800, description: 'Silver tequila', preparationTime: 2 },
  ],
  liqueur: [
    { name: 'Jagermeister', price: 1500, description: 'Herbal liqueur', preparationTime: 2 },
  ],
};

async function populateCategories() {
  console.log('📂 Creating categories...');
  
  for (const cat of categories) {
    try {
      const result = await databases.createDocument(
        DATABASE_ID,
        CATEGORIES_COLLECTION_ID,
        ID.unique(),
        {
          name: cat.name,
          label: cat.label,
          slug: cat.slug,
          index: cat.index,
          isActive: true,
        }
      );
      console.log(`✅ Created category: ${cat.name} (${result.$id})`);
    } catch (error) {
      if (error.code === 409) {
        console.log(`⚠️ Category already exists: ${cat.name}`);
      } else {
        console.error(`❌ Error creating category ${cat.name}:`, error.message);
      }
    }
  }
}

async function populateMenuItems() {
  console.log('\n📋 Creating menu items...');
  
  let itemCount = 0;
  
  for (const cat of categories) {
    const items = menuItems[cat.id] || [];
    
    for (const item of items) {
      try {
        await databases.createDocument(
          DATABASE_ID,
          MENU_ITEMS_COLLECTION_ID,
          ID.unique(),
          {
            name: item.name,
            price: item.price,
            description: item.description || '',
            category: cat.name,
            preparationTime: item.preparationTime || 5,
            popularity: 50,
            isActive: true,
            isAvailable: true,
            isVegetarian: true,
            isVegan: true,
            isGlutenFree: true,
          }
        );
        itemCount++;
        console.log(`✅ Created menu item: ${item.name} - KES ${item.price}`);
      } catch (error) {
        if (error.code === 409) {
          console.log(`⚠️ Menu item already exists: ${item.name}`);
        } else {
          console.error(`❌ Error creating menu item ${item.name}:`, error.message);
        }
      }
    }
  }
  
  console.log(`\n📊 Total menu items created: ${itemCount}`);
}

async function main() {
  try {
    console.log('🚀 Starting menu population...\n');
    
    await populateCategories();
    await populateMenuItems();
    
    console.log('\n✅ Menu population complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
