"use server";

import { databases, DATABASE_ID, MODIFIER_GROUPS_COLLECTION_ID } from "@/lib/appwrite.config";
import { Query, ID } from "node-appwrite";
import { parseStringify } from "@/lib/utils";

export async function getModifierGroups() {
  try {
    const result = await databases.listDocuments(DATABASE_ID!, MODIFIER_GROUPS_COLLECTION_ID!, [
      Query.limit(100),
    ]);
    return { success: true, groups: result.documents };
  } catch (error: any) {
    return { success: false, error: error.message, groups: [] };
  }
}

export async function createModifierGroup(data: {
  name: string;
  isRequired: boolean;
  maxSelections: number;
  options: string[];
}) {
  try {
    const doc = {
      name: data.name,
      isRequired: data.isRequired ?? false,
      maxSelections: data.maxSelections ?? 1,
      options: data.options ?? [],
      createdAt: new Date().toISOString()
    };

    const result = await databases.createDocument(
      DATABASE_ID!,
      MODIFIER_GROUPS_COLLECTION_ID!,
      ID.unique(),
      doc
    );
    return { success: true, group: parseStringify(result) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateModifierGroup(
  groupId: string,
  data: Partial<{ name: string; isRequired: boolean; maxSelections: number; options: string[] }>
) {
  try {
    const result = await databases.updateDocument(
      DATABASE_ID!,
      MODIFIER_GROUPS_COLLECTION_ID!,
      groupId,
      data
    );
    return { success: true, group: parseStringify(result) };
  } catch (error: any) {
    if (error?.code === 404 || error?.message?.includes('not found')) {
      return { success: false, error: 'Document not found' };
    }
    return { success: false, error: error.message };
  }
}

export async function deleteModifierGroup(groupId: string) {
  try {
    await databases.deleteDocument(DATABASE_ID!, MODIFIER_GROUPS_COLLECTION_ID!, groupId);
    return { success: true };
  } catch (error: any) {
    if (error?.code === 404) return { success: false, error: 'Document not found' };
    return { success: false, error: error.message };
  }
}
