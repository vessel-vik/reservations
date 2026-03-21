/**
 * Script to populate menu categories and items in Appwrite
 * Run with: npx tsx scripts/populate-menu.ts
 */

import { Client, Databases, ID } from 'node-appwrite';

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = '669036bb001fb0233dd6';
const API_KEY = 'e70e3824412719211742843b301a27260f0965587f99c621d83c69b509e61f8f45fafd2';
const DATABASE_ID = '66903c2a003b0f1910b7';
const MENU_ITEMS_COLLECTION_ID = 'menu_items';
const CATEGORIES_COLLECTION_ID = 'categories';

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

// Category mapping with display order
const categories = [
  { id: 'beers', name: 'Beers', displayOrder: 1 },
  { id: 'whiskys', name: 'Whiskys', displayOrder: 2 },
  { id: 'brandy', name: 'Brandy', displayOrder: 3 },
  { id: 'rum', name: 'Rum', displayOrder: 4 },
  { id: 'gin', name: 'Gin', displayOrder: 5 },
  { id: 'vodka', name: 'Vodka', displayOrder: 6 },
  { id: 'wines', name: 'Wines', displayOrder: 7 },
  { id: 'soft_drinks', name: 'Soft Drinks', displayOrder: 8 },
  { id: 'tequila', name: 'Tequila', displayOrder: 9 },
  { id: 'liqueur', name: 'Liqueur', displayOrder: 10 },
];

// Menu items with prices (typical Kenyan lounge prices in KES)
const menuItems: Record<string, { name: string; price: number }[]> = {
  beers: [
    { name: 'Tusker Lager', price: 350 },
    { name: 'Tusker Lite', price: 350 },
    { name: 'Balbozi', price: 350 },
    { name: 'White Cap', price: 350 },
    { name: 'Guinness Lager', price: 400 },
    { name: 'Guinness Smooth', price: 400 },
    { name: 'Heineken', price: 500 },
    { name: 'Savanna', price: 400 },
    { name: 'Amarula', price: 450 },
    { name: 'Black Ice', price: 400 },
    { name: 'Pineapple Punch', price: 350 },
    { name: 'Guarana', price: 300 },
    { name: 'Hafee Kenya 254', price: 350 },
  ],
  whiskys: [
    { name: 'Black Label 1L', price: 3500 },
    { name: 'Singleton 12yrs', price: 2500 },
    { name: 'Singleton 15yrs', price: 3500 },
    { name: 'Hankey VS', price: 1800 },
    { name: 'Grants 1L', price: 2200 },
  ],
  brandy: [
    { name: 'Vice Roy', price: 1500 },
  ],
  rum: [
    { name: 'Captain Morgan Spiced 1L', price: 2500 },
  ],
  gin: [
    { name: 'Gordons 1L', price: 2500 },
    { name: 'Gilbeys', price: 1500 },
  ],
  vodka: [
    { name: 'Smirnoff Red 1L', price: 2500 },
  ],
  wines: [
    { name: 'Pierre Marcel Red', price: 1200 },
    { name: 'Pierre Marcel White', price: 1200 },
    { name: 'Drostdy Hof Red', price: 900 },
    { name: 'Drostdy Hof White', price: 900 },
    { name: 'Four Cousins Red', price: 1100 },
    { name: 'Four Cousins White', price: 1100 },
    { name: 'Nederburg White', price: 1000 },
  ],
  soft_drinks: [
    { name: 'Soda', price: 150 },
    { name: 'Water 1L', price: 200 },
    { name: 'Water 500ml', price: 150 },
    { name: 'Picana & Delmonte', price: 350 },
  ],
  tequila: [
    { name: 'Jose Cuervo Gold', price: 1800 },
    { name: 'Jose Cuervo Silver', price: 1800 },
  ],
  liqueur: [
    { name: 'Jagermeister', price: 1500 },
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
          description: `${cat.name} - Premium selection`,
          displayOrder: cat.displayOrder,
          isActive: true,
        }
      );
      console.log(`✅ Created category: ${cat.name} (${result.$id})`);
    } catch (error: any) {
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
            description: `Premium ${item.name}`,
            price: item.price,
            category: cat.name,
            isAvailable: true,
            preparationTime: 5,
            ingredients: [],
            allergens: [],
            dietaryFlags: {
              isVegetarian: true,
              isVegan: true,
              isGlutenFree: true,
            },
            popularity: 50,
            isActive: true,
          }
        );
        itemCount++;
        console.log(`✅ Created menu item: ${item.name} - KES ${item.price}`);
      } catch (error: any) {
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
