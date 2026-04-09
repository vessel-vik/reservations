#!/usr/bin/env node

// Setup script for Restaurant POS Database Collections
// Run with: node scripts/setup-pos-database.js

const { Client, Databases, ID, Permission, Role } = require('node-appwrite');
require('dotenv').config({ path: '.env.local' });

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_ENDPOINT)
    .setProject(process.env.PROJECT_ID)
    .setKey(process.env.API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.DATABASE_ID;

console.log('🚀 Setting up Restaurant POS Database Collections...\n');


async function createCollection(collectionId, name, attributes, permissions = []) {
    try {
        console.log(`📁 Creating collection: ${name} (${collectionId})`);
        
        // Create collection
        await databases.createCollection(
            DATABASE_ID,
            collectionId,
            name,
            permissions.length > 0 ? permissions : [
                Permission.create(Role.any()),
                Permission.read(Role.any()),
                Permission.update(Role.any()),
                Permission.delete(Role.any()),
            ]
        );
        console.log(`✅ Collection ${name} created successfully`);
    } catch (error) {
        if (error.message.includes('already exists')) {
            console.log(`⚠️  Collection ${name} already exists`);
        } else {
            console.error(`❌ Error creating collection ${name}:`, error.message);
            return; // Stop if collection creation failed critically (not just exists)
        }
    }

    // Check existing attributes to handle migrations
    let existingAttributes = [];
    try {
        const response = await databases.listAttributes(DATABASE_ID, collectionId);
        existingAttributes = response.attributes;
    } catch (e) {
        // Collection might not exist yet
    }

    // Always try to create attributes
    console.log(`Checking attributes for ${name}...`);
    for (const attr of attributes) {
        // Check for type mismatch and delete if necessary
        const existing = existingAttributes.find(a => a.key === attr.key);
        if (existing) {
             // Map our simple types to Appwrite types
             const typeMap = {
                 'string': 'string',
                 'integer': 'integer',
                 'float': 'double', // Appwrite returns 'double' for float? or 'float'? Usually checks needed.
                 'boolean': 'boolean',
                 'datetime': 'datetime',
                 'relationship': 'relationship' // Complex check needed?
             };

             // Simplify: If we want a relationship but existing is string, DELETE.
             // Relationship attributes in Appwrite don't always have 'type'='relationship' in listAttributes?
             // They have type='' but might appear differently. 
             // Simplest check: If we want connection/rel setup and existing is string.
             
             if (attr.type === 'relationship' && existing.type !== 'relationship') {
                 console.log(`⚠️  Attribute type mismatch for ${attr.key}. Deleting old ${existing.type}...`);
                 await databases.deleteAttribute(DATABASE_ID, collectionId, attr.key);
                 console.log(`   Deleted ${attr.key}. Waiting 5s for cleanup...`);
                 await new Promise(resolve => setTimeout(resolve, 5000));
             }
        }

        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
        
        // Appwrite validation: Cannot set default value for required attribute
        // We must pass undefined/null if required is true
        const defaultValue = attr.required ? undefined : attr.default;

        try {
            switch (attr.type) {
                case 'string':
                    await databases.createStringAttribute(
                        DATABASE_ID,
                        collectionId,
                        attr.key,
                        attr.size || 255,
                        attr.required || false,
                        defaultValue,
                        attr.array || false
                    );
                    break;
                case 'integer':
                    await databases.createIntegerAttribute(
                        DATABASE_ID,
                        collectionId,
                        attr.key,
                        attr.required || false,
                        attr.min,
                        attr.max,
                        defaultValue,
                        attr.array || false
                    );
                    break;
                case 'float':
                    await databases.createFloatAttribute(
                        DATABASE_ID,
                        collectionId,
                        attr.key,
                        attr.required || false,
                        attr.min,
                        attr.max,
                        defaultValue,
                        attr.array || false
                    );
                    break;
                case 'boolean':
                    await databases.createBooleanAttribute(
                        DATABASE_ID,
                        collectionId,
                        attr.key,
                        attr.required || false,
                        defaultValue,
                        attr.array || false
                    );
                    break;
                case 'datetime':
                    await databases.createDatetimeAttribute(
                        DATABASE_ID,
                        collectionId,
                        attr.key,
                        attr.required || false,
                        defaultValue,
                        attr.array || false
                    );
                    break;
                case 'relationship':
                    await databases.createRelationshipAttribute(
                        DATABASE_ID,
                        collectionId,
                        attr.relatedCollectionId,
                        attr.relationType, // Changed from attr.type
                        attr.twoWay || false,
                        attr.key,
                        attr.twoWayKey,
                        attr.onDelete || 'restrict'
                    );
                    break;
            }
            
            console.log(`  ✅ ${attr.key} (${attr.type})`);
        } catch (error) {
            if (error.message.includes('already exists')) {
                 // Attribute exists, that's fine
            } else {
                console.log(`  ❌ Failed to create attribute ${attr.key}:`, error.message);
            }
        }
    }
    console.log(`Done with ${name}\n`);
}

async function createIndex(collectionId, key, attributes) {
    try {
        await databases.createIndex(DATABASE_ID, collectionId, key, 'key', attributes);
        console.log(`  # index ${collectionId}.${key}`);
    } catch (error) {
        if (!String(error?.message || '').includes('already exists')) {
            console.log(`  ❌ Failed to create index ${collectionId}.${key}:`, error.message);
        }
    }
}

async function setupDatabase() {
    console.log('Database ID:', DATABASE_ID);
    console.log('Endpoint:', process.env.NEXT_PUBLIC_ENDPOINT);
    console.log('Project:', process.env.PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID);
    console.log('---\n');

    // 7. Categories Collection (New)
    await createCollection('categories', 'Categories', [
        { key: 'name', type: 'string', size: 100, required: true },
        { key: 'label', type: 'string', size: 100, required: true }, // Display name
        { key: 'slug', type: 'string', size: 100, required: true },  // for URL
        { key: 'icon', type: 'string', size: 50, required: false },
        { key: 'index', type: 'integer', required: true, default: 0 }, // For sorting
        { key: 'parentId', type: 'string', size: 50, required: false }, // For subcategories
        { key: 'isActive', type: 'boolean', required: true, default: true }
    ]);

    // 1. Menu Items Collection
    await createCollection('menu_items', 'Menu Items', [
        { key: 'name', type: 'string', size: 255, required: true },
        { key: 'description', type: 'string', size: 1000, required: true },
        { key: 'price', type: 'float', required: true, min: 0, max: 1000000 },
        { 
            key: 'category', 
            type: 'relationship', 
            relatedCollectionId: 'categories', 
            relationType: 'manyToOne', // Correct property name
            twoWay: false,
            onDelete: 'setNull'
        },
        { key: 'imageUrl', type: 'string', size: 2000, required: false },
        { key: 'isAvailable', type: 'boolean', required: true, default: true },
        { key: 'preparationTime', type: 'integer', required: true, min: 1, max: 120 },
        { key: 'ingredients', type: 'string', size: 100, required: false, array: true },
        { key: 'allergens', type: 'string', size: 100, required: false, array: true },
        { key: 'isVegetarian', type: 'boolean', required: true, default: false },
        { key: 'isVegan', type: 'boolean', required: true, default: false },
        { key: 'isGlutenFree', type: 'boolean', required: true, default: false },
        { key: 'calories', type: 'integer', required: false, min: 0, max: 10000 },
        { key: 'costPrice', type: 'float', required: false, min: 0 },
        { key: 'popularity', type: 'integer', required: true, default: 0 },
        { key: 'isActive', type: 'boolean', required: true, default: true }
    ]);

    // 2. Orders Collection  
    await createCollection('orders', 'Orders', [
        { key: 'orderNumber', type: 'string', size: 20, required: true },
        { key: 'type', type: 'string', size: 20, required: true }, // dine_in, takeaway, delivery
        { key: 'status', type: 'string', size: 20, required: true }, // draft, placed, confirmed, etc.
        { key: 'tableNumber', type: 'integer', required: false, min: 1, max: 100 },
        { key: 'customerName', type: 'string', size: 255, required: true },
        { key: 'customerPhone', type: 'string', size: 20, required: false },
        { key: 'customerEmail', type: 'string', size: 255, required: false },
        { key: 'guestCount', type: 'integer', required: true, min: 1, max: 20 },
        { key: 'reservationId', type: 'string', size: 50, required: false },
        { key: 'waiterId', type: 'string', size: 50, required: false },
        { key: 'waiterName', type: 'string', size: 255, required: true },
        { key: 'subtotal', type: 'float', required: true, min: 0 },
        { key: 'taxAmount', type: 'float', required: true, min: 0 },
        { key: 'serviceCharge', type: 'float', required: true, min: 0 },
        { key: 'discountAmount', type: 'float', required: true, default: 0 },
        { key: 'tipAmount', type: 'float', required: true, default: 0 },
        { key: 'totalAmount', type: 'float', required: true, min: 0 },
        { key: 'orderTime', type: 'datetime', required: true },
        { key: 'estimatedReadyTime', type: 'datetime', required: false },
        { key: 'actualReadyTime', type: 'datetime', required: false },
        { key: 'servedTime', type: 'datetime', required: false },
        { key: 'specialInstructions', type: 'string', size: 1000, required: false },
        { key: 'priority', type: 'string', size: 20, required: true, default: 'normal' },
        { key: 'priority', type: 'string', size: 20, required: true, default: 'normal' },
        { key: 'paymentStatus', type: 'string', size: 20, required: true, default: 'pending' },
        { key: 'items', type: 'string', size: 5000, required: false }
    ]);

    // 3. Order Items Collection
    await createCollection('order_items', 'Order Items', [
        { key: 'orderId', type: 'string', size: 50, required: true },
        { key: 'menuItemId', type: 'string', size: 50, required: true },
        { key: 'menuItemName', type: 'string', size: 255, required: true },
        { key: 'quantity', type: 'integer', required: true, min: 1, max: 100 },
        { key: 'unitPrice', type: 'float', required: true, min: 0 },
        { key: 'totalPrice', type: 'float', required: true, min: 0 },
        { key: 'specialInstructions', type: 'string', size: 500, required: false },
        { key: 'kitchenStatus', type: 'string', size: 20, required: true, default: 'waiting' },
        { key: 'startedAt', type: 'datetime', required: false },
        { key: 'completedAt', type: 'datetime', required: false }
    ]);

    // 4. Tables Collection
    await createCollection('tables', 'Tables', [
        { key: 'number', type: 'integer', required: true, min: 1, max: 100 },
        { key: 'capacity', type: 'integer', required: true, min: 1, max: 20 },
        { key: 'location', type: 'string', size: 50, required: true },
        { key: 'status', type: 'string', size: 20, required: true, default: 'available' },
        { key: 'currentOrderId', type: 'string', size: 50, required: false },
        { key: 'reservationId', type: 'string', size: 50, required: false },
        { key: 'waiterId', type: 'string', size: 50, required: false },
        { key: 'waiterName', type: 'string', size: 255, required: false },
        { key: 'guestCount', type: 'integer', required: false, min: 0 },
        { key: 'occupiedAt', type: 'datetime', required: false },
        { key: 'lastCleaned', type: 'datetime', required: false },
        { key: 'estimatedAvailableAt', type: 'datetime', required: false },
        { key: 'features', type: 'string', size: 100, required: false, array: true },
        { key: 'notes', type: 'string', size: 500, required: false },
        { key: 'isActive', type: 'boolean', required: true, default: true }
    ]);

    // 5. Staff Collection
    await createCollection('staff', 'Staff', [
        { key: 'name', type: 'string', size: 255, required: true },
        { key: 'email', type: 'string', size: 255, required: true },
        { key: 'phone', type: 'string', size: 20, required: true },
        { key: 'role', type: 'string', size: 50, required: true },
        { key: 'pin', type: 'string', size: 4, required: true },
        { key: 'permissions', type: 'string', size: 100, required: false, array: true },
        { key: 'accessLevel', type: 'integer', required: true, min: 1, max: 5, default: 1 },
        { key: 'isActive', type: 'boolean', required: true, default: true },
        { key: 'employeeId', type: 'string', size: 20, required: true },
        { key: 'department', type: 'string', size: 50, required: true },
        { key: 'hourlyRate', type: 'float', required: false, min: 0 },
        { key: 'totalOrders', type: 'integer', required: true, default: 0 },
        { key: 'totalRevenue', type: 'float', required: true, default: 0 },
        { key: 'averageRating', type: 'float', required: true, default: 5.0 },
        { key: 'startDate', type: 'datetime', required: true }
    ]);

    // 6. Kitchen Orders Collection
    await createCollection('kitchen_orders', 'Kitchen Orders', [
        { key: 'orderId', type: 'string', size: 50, required: true },
        { key: 'orderNumber', type: 'string', size: 20, required: true },
        { key: 'tableNumber', type: 'integer', required: false, min: 1, max: 100 },
        { key: 'totalItems', type: 'integer', required: true, min: 1 },
        { key: 'status', type: 'string', size: 20, required: true, default: 'pending' },
        { key: 'priority', type: 'string', size: 20, required: true, default: 'normal' },
        { key: 'estimatedTime', type: 'integer', required: true, min: 5, max: 120 },
        { key: 'actualTime', type: 'integer', required: false },
        { key: 'receivedAt', type: 'datetime', required: true },
        { key: 'startedAt', type: 'datetime', required: false },
        { key: 'completedAt', type: 'datetime', required: false },
        { key: 'assignedChef', type: 'string', size: 50, required: false },
        { key: 'completedBy', type: 'string', size: 50, required: false },
        { key: 'kitchenNotes', type: 'string', size: 500, required: false },
        { key: 'specialInstructions', type: 'string', size: 1000, required: false },
        { key: 'guestCount', type: 'integer', required: true, min: 1 },
        { key: 'allergies', type: 'string', size: 100, required: false, array: true }
    ]);

    await createCollection('cash_verifications', 'Cash Verifications', [
        { key: 'businessId', type: 'string', size: 64, required: true },
        { key: 'paymentReference', type: 'string', size: 120, required: true },
        { key: 'fileId', type: 'string', size: 64, required: true },
        { key: 'deviceInstallId', type: 'string', size: 80, required: false },
        { key: 'capturedAt', type: 'string', size: 40, required: true },
        { key: 'clerkUserId', type: 'string', size: 64, required: false },
        { key: 'userAgent', type: 'string', size: 500, required: false },
        { key: 'geoJson', type: 'string', size: 500, required: false },
        { key: 'orderIdsJson', type: 'string', size: 4000, required: false },
    ]);

    await createCollection('individual_units', 'Individual Units', [
        { key: 'businessId', type: 'string', size: 64, required: true },
        { key: 'unitUid', type: 'string', size: 120, required: true },
        { key: 'menuItemId', type: 'string', size: 64, required: true },
        { key: 'state', type: 'string', size: 24, required: true },
        { key: 'scannedInAt', type: 'string', size: 40, required: false },
        { key: 'scannedOutAt', type: 'string', size: 40, required: false },
        { key: 'lastOrderId', type: 'string', size: 64, required: false },
        { key: 'lastScannedBy', type: 'string', size: 64, required: false },
        { key: 'embeddingLabel', type: 'string', size: 500, required: false },
    ]);

    await createCollection('menu_item_versions', 'Menu Item Versions', [
        { key: 'itemId', type: 'string', size: 64, required: true },
        { key: 'versionNumber', type: 'integer', required: true, min: 1, max: 100000 },
        { key: 'snapshot', type: 'string', size: 12000, required: true },
        { key: 'timestamp', type: 'string', size: 40, required: true },
        { key: 'publishedBy', type: 'string', size: 255, required: true },
        { key: 'publisherId', type: 'string', size: 64, required: false },
    ]);

    await createCollection('print_jobs', 'Print Jobs', [
        { key: 'businessId', type: 'string', size: 64, required: true },
        { key: 'status', type: 'string', size: 24, required: true },
        { key: 'jobType', type: 'string', size: 40, required: true },
        { key: 'category', type: 'string', size: 24, required: false },
        { key: 'content', type: 'string', size: 5000, required: true },
        { key: 'orderId', type: 'string', size: 64, required: false },
        { key: 'dedupeKey', type: 'string', size: 120, required: false },
        { key: 'waiterId', type: 'string', size: 64, required: false },
        { key: 'waiterNameSnapshot', type: 'string', size: 255, required: false },
        { key: 'requeueReason', type: 'string', size: 80, required: false },
        { key: 'createdByUserId', type: 'string', size: 64, required: false },
        { key: 'createdByRole', type: 'string', size: 40, required: false },
        { key: 'timestamp', type: 'string', size: 40, required: true },
        { key: 'queuedAt', type: 'string', size: 40, required: false },
        { key: 'printedAt', type: 'string', size: 40, required: false },
        { key: 'attemptCount', type: 'integer', required: false, min: 0, max: 1000 },
        { key: 'targetTerminal', type: 'string', size: 80, required: false },
        { key: 'errorMessage', type: 'string', size: 500, required: false },
    ]);

    await createCollection('print_audit_entries', 'Print Audit Entries', [
        { key: 'businessId', type: 'string', size: 64, required: true },
        { key: 'printJobId', type: 'string', size: 64, required: true },
        { key: 'orderId', type: 'string', size: 64, required: false },
        { key: 'jobType', type: 'string', size: 40, required: true },
        { key: 'category', type: 'string', size: 24, required: true },
        { key: 'status', type: 'string', size: 24, required: true },
        { key: 'summary', type: 'string', size: 500, required: false },
        { key: 'errorMessage', type: 'string', size: 500, required: false },
        { key: 'timestamp', type: 'string', size: 40, required: true },
        { key: 'contentSample', type: 'string', size: 1800, required: false },
        { key: 'dedupeKey', type: 'string', size: 120, required: false },
        { key: 'actorUserId', type: 'string', size: 64, required: false },
        { key: 'actorRole', type: 'string', size: 40, required: false },
        { key: 'waiterId', type: 'string', size: 64, required: false },
        { key: 'terminalId', type: 'string', size: 120, required: false },
        { key: 'requeueReason', type: 'string', size: 80, required: false },
    ]);
    await createCollection('print_terminal_controls', 'Print Terminal Controls', [
        { key: 'businessId', type: 'string', size: 64, required: true },
        { key: 'terminalId', type: 'string', size: 120, required: true },
        { key: 'state', type: 'string', size: 20, required: true },
        { key: 'fallbackTerminal', type: 'string', size: 120, required: false },
        { key: 'updatedAt', type: 'string', size: 40, required: true },
        { key: 'updatedByUserId', type: 'string', size: 64, required: false },
    ]);
    await createCollection('print_ops_incidents', 'Print Ops Incidents', [
        { key: 'businessId', type: 'string', size: 64, required: true },
        { key: 'terminalId', type: 'string', size: 120, required: true },
        { key: 'action', type: 'string', size: 60, required: true },
        { key: 'severity', type: 'string', size: 20, required: true },
        { key: 'message', type: 'string', size: 500, required: true },
        { key: 'metadata', type: 'string', size: 2000, required: false },
        { key: 'timestamp', type: 'string', size: 40, required: true },
        { key: 'actorUserId', type: 'string', size: 64, required: false },
        { key: 'actorRole', type: 'string', size: 40, required: false },
    ]);
    await createIndex('print_jobs', 'jobs_biz_cat_stat_created', ['businessId', 'category', 'status', '$createdAt']);
    await createIndex('print_jobs', 'jobs_biz_order_created', ['businessId', 'orderId', '$createdAt']);
    await createIndex('print_jobs', 'jobs_biz_waiter_created', ['businessId', 'waiterId', '$createdAt']);
    await createIndex('print_audit_entries', 'audit_biz_order_ts', ['businessId', 'orderId', 'timestamp']);
    await createIndex('print_audit_entries', 'audit_biz_job_ts', ['businessId', 'printJobId', 'timestamp']);
    await createIndex('print_terminal_controls', 'ctrl_biz_terminal', ['businessId', 'terminalId']);
    await createIndex('print_ops_incidents', 'inc_biz_term_time', ['businessId', 'terminalId', 'timestamp']);

    console.log('🎉 Database setup completed!\n');
    console.log('Next steps:');
    console.log('1. Add to .env.local: CASH_VERIFICATIONS_COLLECTION_ID=cash_verifications');
    console.log('   + NEXT_PUBLIC_CASH_VERIFICATIONS_COLLECTION_ID=cash_verifications (admin realtime toasts)');
    console.log('2. Add to .env.local: INDIVIDUAL_UNITS_COLLECTION_ID=individual_units');
    console.log('3. Add to .env.local: MENU_VERSIONS_COLLECTION_ID=menu_item_versions');
    console.log('   + NEXT_PUBLIC_MENU_ITEM_VERSIONS_COLLECTION_ID=menu_item_versions (version history API)');
    console.log('4. Add to .env.local: PRINT_JOBS_COLLECTION_ID=print_jobs');
    console.log('   + NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID=print_jobs (PrintBridge realtime + admin tabs)');
    console.log('5. Add to .env.local: PRINT_AUDIT_ENTRIES_COLLECTION_ID=print_audit_entries');
    console.log('6. Add to .env.local: PRINT_TERMINAL_CONTROLS_COLLECTION_ID=print_terminal_controls');
    console.log('7. Add to .env.local: PRINT_OPS_INCIDENTS_COLLECTION_ID=print_ops_incidents');
    console.log('8. Run: npm run seed-menu');
    console.log('9. Run: npm run seed-staff');  
    console.log('10. Run: npm run seed-tables');
    console.log('11. Test the POS system\n');
}

setupDatabase().catch(console.error);