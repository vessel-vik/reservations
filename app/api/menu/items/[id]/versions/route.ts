"use server";

import { NextRequest, NextResponse } from "next/server";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";
import { Query } from "node-appwrite";
import { parseStringify } from "@/lib/utils";

const MENU_ITEM_VERSIONS_COLLECTION_ID = process.env.NEXT_PUBLIC_MENU_ITEM_VERSIONS_COLLECTION_ID!;

/**
 * GET /api/menu/items/[id]/versions
 * Fetch version history for a menu item
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const itemId = params.id;

        if (!itemId) {
            return NextResponse.json(
                { error: "Item ID required" },
                { status: 400 }
            );
        }

        if (!DATABASE_ID || !MENU_ITEM_VERSIONS_COLLECTION_ID) {
            return NextResponse.json(
                { error: "Database configuration missing" },
                { status: 500 }
            );
        }

        // Fetch all versions for this item, ordered by timestamp (newest first)
        const result = await databases.listDocuments(
            DATABASE_ID,
            MENU_ITEM_VERSIONS_COLLECTION_ID,
            [
                Query.equal("itemId", itemId),
                Query.orderDesc("timestamp"),
                Query.limit(100)
            ]
        );

        const versions = parseStringify(result.documents);

        return NextResponse.json({
            success: true,
            versions,
            count: versions.length
        });
    } catch (error) {
        console.error("Error fetching menu item versions:", error);
        return NextResponse.json(
            { error: "Failed to fetch versions" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/menu/items/[id]/versions
 * Create a new version snapshot (called when publishing)
 */
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const itemId = params.id;
        const { formValues, versionNumber, userId, userName } = await request.json();

        if (!itemId || !formValues || !versionNumber) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        if (!DATABASE_ID || !MENU_ITEM_VERSIONS_COLLECTION_ID) {
            return NextResponse.json(
                { error: "Database configuration missing" },
                { status: 500 }
            );
        }

        // Create version snapshot
        const versionData = {
            itemId,
            versionNumber,
            snapshot: JSON.stringify(formValues), // Store as JSON string
            timestamp: new Date().toISOString(),
            publishedBy: userName || userId,
            publisherId: userId
        };

        const newVersion = await databases.createDocument(
            DATABASE_ID,
            MENU_ITEM_VERSIONS_COLLECTION_ID,
            undefined, // Let Appwrite generate ID
            versionData
        );

        return NextResponse.json({
            success: true,
            version: parseStringify(newVersion)
        });
    } catch (error) {
        console.error("Error creating menu item version:", error);
        return NextResponse.json(
            { error: "Failed to create version" },
            { status: 500 }
        );
    }
}
