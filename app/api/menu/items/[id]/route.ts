import { NextResponse, NextRequest } from "next/server";
import { updateMenuItem, deleteMenuItem } from "@/lib/actions/menu.actions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const body = await req.json();

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
  const resolvedParams = await params;
  const id = resolvedParams.id;
  const { success, error } = await deleteMenuItem(id);

  if (!success) {
    if (error?.includes('not found')) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    return NextResponse.json({ error }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
