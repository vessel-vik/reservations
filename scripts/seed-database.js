#!/usr/bin/env node

// Seed script for Restaurant POS Database
// Run with: node scripts/seed-database.js

const { Client, Databases, ID } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_ENDPOINT)
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.DATABASE_ID;

console.log('🌱 Seeding Restaurant POS Database (staff + tables only)...\n');
console.log('   Menu: run `pnpm run seed-catalog` after categories + products.\n');

// Sample Staff
const STAFF_MEMBERS = [
  {
    name: "Sarah Johnson",
    email: "sarah@restaurant.com",
    phone: "+234 801 234 5678",
    role: "waiter",
    pin: "1234",
    permissions: ["view_orders", "create_orders", "process_payments"],
    accessLevel: 2,
    isActive: true,
    employeeId: "EMP001",
    department: "front_of_house",
    hourlyRate: 2500,
    totalOrders: 0,
    totalRevenue: 0,
    averageRating: 5.0,
    startDate: new Date("2024-01-15").toISOString()
  },
  {
    name: "Michael Chen",
    email: "michael@restaurant.com", 
    phone: "+234 802 345 6789",
    role: "chef",
    pin: "5678",
    permissions: ["view_kitchen", "manage_orders", "update_menu"],
    accessLevel: 3,
    isActive: true,
    employeeId: "EMP002",
    department: "kitchen",
    hourlyRate: 4000,
    totalOrders: 0,
    totalRevenue: 0,
    averageRating: 4.8,
    startDate: new Date("2023-11-20").toISOString()
  },
  {
    name: "Emma Rodriguez",
    email: "emma@restaurant.com",
    phone: "+234 803 456 7890", 
    role: "manager",
    pin: "9999",
    permissions: ["manage_staff", "view_analytics", "manage_menu", "process_payments", "manage_tables"],
    accessLevel: 4,
    isActive: true,
    employeeId: "EMP003",
    department: "management",
    hourlyRate: 6000,
    totalOrders: 0,
    totalRevenue: 0,
    averageRating: 4.9,
    startDate: new Date("2023-08-01").toISOString()
  },
  {
    name: "James Wilson",
    email: "james@restaurant.com",
    phone: "+234 804 567 8901",
    role: "waiter",
    pin: "4321",
    permissions: ["view_orders", "create_orders", "process_payments"],
    accessLevel: 2,
    isActive: true,
    employeeId: "EMP004",
    department: "front_of_house",
    hourlyRate: 2500,
    totalOrders: 0,
    totalRevenue: 0,
    averageRating: 4.7,
    startDate: new Date("2024-03-10").toISOString()
  },
  {
    name: "Admin User",
    email: "admin@restaurant.com",
    phone: "+234 800 000 0000",
    role: "admin",
    pin: "0000",
    permissions: ["*"],
    accessLevel: 5,
    isActive: true,
    employeeId: "EMP000",
    department: "management",
    hourlyRate: 10000,
    totalOrders: 0,
    totalRevenue: 0,
    averageRating: 5.0,
    startDate: new Date("2023-01-01").toISOString()
  }
];

// Sample Tables
const TABLES = [
  // Indoor Tables
  { number: 1, capacity: 2, location: "indoor", status: "available", features: ["window_view"], isActive: true },
  { number: 2, capacity: 4, location: "indoor", status: "available", features: [], isActive: true },
  { number: 3, capacity: 2, location: "indoor", status: "available", features: ["quiet"], isActive: true },
  { number: 4, capacity: 6, location: "indoor", status: "available", features: ["large_group"], isActive: true },
  { number: 5, capacity: 4, location: "indoor", status: "available", features: [], isActive: true },
  { number: 6, capacity: 2, location: "indoor", status: "available", features: ["window_view"], isActive: true },
  { number: 7, capacity: 8, location: "indoor", status: "available", features: ["large_group"], isActive: true },
  { number: 8, capacity: 4, location: "indoor", status: "available", features: [], isActive: true },

  // Outdoor Tables  
  { number: 9, capacity: 4, location: "outdoor", status: "available", features: ["garden_view"], isActive: true },
  { number: 10, capacity: 2, location: "outdoor", status: "available", features: ["garden_view"], isActive: true },
  { number: 11, capacity: 6, location: "outdoor", status: "available", features: ["garden_view", "large_group"], isActive: true },
  { number: 12, capacity: 4, location: "outdoor", status: "available", features: ["garden_view"], isActive: true },

  // Bar Tables
  { number: 13, capacity: 2, location: "bar", status: "available", features: ["bar_seating"], isActive: true },
  { number: 14, capacity: 2, location: "bar", status: "available", features: ["bar_seating"], isActive: true },
  { number: 15, capacity: 4, location: "bar", status: "available", features: ["bar_seating", "tv_view"], isActive: true },

  // Private Dining
  { number: 16, capacity: 10, location: "private_dining", status: "available", features: ["private", "large_group", "projector"], isActive: true },
  { number: 17, capacity: 8, location: "private_dining", status: "available", features: ["private", "large_group"], isActive: true },

  // Terrace
  { number: 18, capacity: 4, location: "terrace", status: "available", features: ["city_view"], isActive: true },
  { number: 19, capacity: 2, location: "terrace", status: "available", features: ["city_view", "romantic"], isActive: true },
  { number: 20, capacity: 6, location: "terrace", status: "available", features: ["city_view", "large_group"], isActive: true }
];

async function seedCollection(collectionId, name, data) {
    console.log(`🌱 Seeding ${name}...`);
    
    try {
        for (const item of data) {
            await databases.createDocument(
                DATABASE_ID,
                collectionId,
                ID.unique(),
                item
            );
            await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
        }
        console.log(`✅ ${name} seeded successfully (${data.length} items)\n`);
    } catch (error) {
        console.error(`❌ Error seeding ${name}:`, error.message, '\n');
    }
}

async function seedDatabase() {
    console.log('Database ID:', DATABASE_ID);
    console.log('---\n');

    try {
        // Seed Staff
        await seedCollection('staff', 'Staff Members', STAFF_MEMBERS);

        // Seed Tables
        await seedCollection('tables', 'Tables', TABLES);

        console.log('🎉 Database seeding completed!\n');
        console.log('✅ Staff Members: ' + STAFF_MEMBERS.length);
        console.log('✅ Tables: ' + TABLES.length);
        console.log('\n🚀 Ready to test the POS system!');

    } catch (error) {
        console.error('❌ Error during seeding:', error.message);
    }
}

seedDatabase();