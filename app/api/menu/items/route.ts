import { NextResponse, NextRequest } from "next/server";
import { getMenuItems, createMenuItem } from "@/lib/actions/menu.actions";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const categoryId = url.searchParams.get('categoryId') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const isAvailableStr = url.searchParams.get('isAvailable');
  const isAvailable = isAvailableStr === null ? undefined : isAvailableStr === 'true';

  const { success, items, error } = await getMenuItems({ categoryId, search, isAvailable });

  if (!success) {
    return NextResponse.json({ error: 'Failed to fetch menu items' }, { status: 500 });
  }

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (typeof body.price !== 'number' || body.price < 0) {
      return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 });
    }
    if (!body.categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 });
    }

    const { success, item, error } = await createMenuItem(body);

    if (!success) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
