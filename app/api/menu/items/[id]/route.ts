import { NextResponse, NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { databases, DATABASE_ID, MENU_ITEMS_COLLECTION_ID } from "@/lib/appwrite.config";
import { updateMenuItem, deleteMenuItem } from "@/lib/actions/menu.actions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const id = resolvedParams.id;
    const body = await req.json();
    delete body.businessId;

    if (!DATABASE_ID || !MENU_ITEMS_COLLECTION_ID) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    let existing: { businessId?: string } | null = null;
    try {
      existing = (await databases.getDocument(
        DATABASE_ID,
        MENU_ITEMS_COLLECTION_ID,
        id
      )) as { businessId?: string };
    } catch {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (orgId) {
      const docBid = existing.businessId != null ? String(existing.businessId) : "";
      if (docBid !== "" && docBid !== orgId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (docBid === "") {
        body.businessId = orgId;
      }
    }

    // Reject negative stock values
    if (typeof body.stock === 'number' && body.stock < 0) {
      return NextResponse.json({ error: 'stock cannot be negative' }, { status: 400 });
    }

    // Auto-disable when stock is patched to 0
    if (typeof body.stock === 'number' && body.stock === 0) {
      body.isAvailable = false;
    }

    const { success, item, error } = await updateMenuItem(id, body);

    if (!success) {
      if (error?.includes('not found') || error?.includes('Document not found')) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ item: item ?? null });
  } catch (error: any) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await params;
  const id = resolvedParams.id;

  if (DATABASE_ID && MENU_ITEMS_COLLECTION_ID && orgId) {
    try {
      const doc = (await databases.getDocument(DATABASE_ID, MENU_ITEMS_COLLECTION_ID, id)) as {
        businessId?: string;
      };
      const bid = doc.businessId != null ? String(doc.businessId) : "";
      if (bid !== "" && bid !== orgId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
  }

  const { success, error } = await deleteMenuItem(id);

  if (!success) {
    if (error?.includes('not found')) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    return NextResponse.json({ error }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
