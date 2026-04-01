import { NextResponse, NextRequest } from "next/server";
import { updateModifierGroup, deleteModifierGroup } from "@/lib/actions/modifier.actions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const body = await req.json();

    const { success, group, error } = await updateModifierGroup(resolvedParams.id, body);

    if (!success) {
      if (error?.includes('not found') || error?.includes('Document not found')) {
        return NextResponse.json({ error: 'Modifier group not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to update modifier group' }, { status: 500 });
    }

    return NextResponse.json({ group });
  } catch (error: any) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const { success, error } = await deleteModifierGroup(resolvedParams.id);

  if (!success) {
    if (error?.includes('not found')) {
      return NextResponse.json({ error: 'Modifier group not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete modifier group' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
