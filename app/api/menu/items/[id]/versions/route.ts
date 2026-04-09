import { NextRequest, NextResponse } from "next/server";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";
import { ID, Query } from "node-appwrite";
import { parseStringify } from "@/lib/utils";

function getVersionsCollectionId(): string {
  return (
    process.env.NEXT_PUBLIC_MENU_ITEM_VERSIONS_COLLECTION_ID ||
    process.env.MENU_VERSIONS_COLLECTION_ID ||
    process.env.MENU_ITEM_VERSIONS_COLLECTION_ID ||
    ""
  );
}

/**
 * GET /api/menu/items/[id]/versions
 * Fetch version history for a menu item
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await context.params;
    const MENU_ITEM_VERSIONS_COLLECTION_ID = getVersionsCollectionId();

    if (!itemId) {
      return NextResponse.json({ error: "Item ID required" }, { status: 400 });
    }

    if (!DATABASE_ID || !MENU_ITEM_VERSIONS_COLLECTION_ID) {
      return NextResponse.json(
        { error: "Database configuration missing (menu item versions collection)" },
        { status: 500 }
      );
    }

    const result = await databases.listDocuments(DATABASE_ID, MENU_ITEM_VERSIONS_COLLECTION_ID, [
      Query.equal("itemId", itemId),
      Query.orderDesc("timestamp"),
      Query.limit(100),
    ]);

    const versions = parseStringify(result.documents);

    return NextResponse.json({
      success: true,
      versions,
      count: versions.length,
    });
  } catch (error) {
    console.error("Error fetching menu item versions:", error);
    return NextResponse.json({ error: "Failed to fetch versions" }, { status: 500 });
  }
}

/**
 * POST /api/menu/items/[id]/versions
 * Create a new version snapshot (after publish / save)
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: itemId } = await context.params;
    const MENU_ITEM_VERSIONS_COLLECTION_ID = getVersionsCollectionId();
    const { formValues, versionNumber, userId, userName } = await request.json();

    if (!itemId || !formValues || versionNumber == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!DATABASE_ID || !MENU_ITEM_VERSIONS_COLLECTION_ID) {
      return NextResponse.json(
        { error: "Database configuration missing (menu item versions collection)" },
        { status: 500 }
      );
    }

    const versionData = {
      itemId,
      versionNumber: Number(versionNumber),
      snapshot: JSON.stringify(formValues),
      timestamp: new Date().toISOString(),
      publishedBy: String(userName || userId || "system"),
      publisherId: userId != null ? String(userId) : "",
    };

    const newVersion = await databases.createDocument(
      DATABASE_ID,
      MENU_ITEM_VERSIONS_COLLECTION_ID,
      ID.unique(),
      versionData
    );

    return NextResponse.json({
      success: true,
      version: parseStringify(newVersion),
    });
  } catch (error) {
    console.error("Error creating menu item version:", error);
    return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
  }
}
