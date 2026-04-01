import { NextResponse, NextRequest } from "next/server";
import { getModifierGroups, createModifierGroup } from "@/lib/actions/modifier.actions";

export async function GET(req: NextRequest) {
  const { success, groups, error } = await getModifierGroups();
  
  if (!success) {
    return NextResponse.json({ error: 'Failed to fetch modifier groups' }, { status: 500 });
  }
  return NextResponse.json({ groups });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (!Array.isArray(body.options) || body.options.length === 0) {
      return NextResponse.json({ error: 'options must have at least one entry' }, { status: 400 });
    }

    for (const opt of body.options) {
      if (!opt.includes(':')) {
        return NextResponse.json({ error: "invalid option format — expected 'name:price'" }, { status: 400 });
      }
    }

    const { success, group, error } = await createModifierGroup(body);

    if (!success) {
      return NextResponse.json({ error: 'Failed to create modifier group' }, { status: 500 });
    }

    return NextResponse.json({ group }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
