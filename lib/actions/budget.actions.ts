"use server";

import { databases, DATABASE_ID, BUDGETS_COLLECTION_ID } from "@/lib/appwrite.config";
import { Query, ID } from "node-appwrite";

export async function getBudgetsByMonth(month: number, year: number) {
  if (!DATABASE_ID || !BUDGETS_COLLECTION_ID) throw new Error("Missing BUDGETS_COLLECTION_ID");

  const queries = [
    Query.equal('month', month),
    Query.equal('year', year),
    Query.limit(100)
  ];

  const result = await databases.listDocuments(DATABASE_ID, BUDGETS_COLLECTION_ID, queries);
  
  if (result.documents.length === 0) {
    // Attempt previous month
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear--;
    }
    const prevResult = await databases.listDocuments(DATABASE_ID, BUDGETS_COLLECTION_ID, [
      Query.equal('month', prevMonth),
      Query.equal('year', prevYear),
      Query.limit(100)
    ]);
    return prevResult.documents.map((d: any) => ({
      budgetId: d.$id,
      category: d.category,
      monthlyLimit: d.monthlyLimit,
      month: d.month,
      year: d.year
    }));
  }

  return result.documents.map((d: any) => ({
    budgetId: d.$id,
    category: d.category,
    monthlyLimit: d.monthlyLimit,
    month: d.month,
    year: d.year
  }));
}

export async function upsertBudget({ category, monthlyLimit, month, year }: { category: string, monthlyLimit: number, month: number, year: number }) {
  if (!DATABASE_ID || !BUDGETS_COLLECTION_ID) throw new Error("Missing BUDGETS_COLLECTION_ID");

  const existing = await databases.listDocuments(DATABASE_ID, BUDGETS_COLLECTION_ID, [
    Query.equal('category', category),
    Query.equal('month', month),
    Query.equal('year', year),
    Query.limit(1)
  ]);

  if (existing.documents.length > 0) {
    const doc: any = existing.documents[0];
    const updated: any = await databases.updateDocument(DATABASE_ID, BUDGETS_COLLECTION_ID, doc.$id, {
      monthlyLimit
    });
    return {
      budgetId: updated.$id,
      category: updated.category,
      monthlyLimit: updated.monthlyLimit,
      month: updated.month,
      year: updated.year
    };
  }

  const created: any = await databases.createDocument(DATABASE_ID, BUDGETS_COLLECTION_ID, ID.unique(), {
    category,
    monthlyLimit,
    month,
    year
  });

  return {
    budgetId: created.$id,
    category: created.category,
    monthlyLimit: created.monthlyLimit,
    month: created.month,
    year: created.year
  };
}

export async function updateBudgetLimit(budgetId: string, monthlyLimit: number) {
  if (!DATABASE_ID || !BUDGETS_COLLECTION_ID) throw new Error("Missing BUDGETS_COLLECTION_ID");

  try {
    await databases.updateDocument(DATABASE_ID, BUDGETS_COLLECTION_ID, budgetId, { monthlyLimit });
    return true;
  } catch (error: any) {
    if (error?.code === 404) {
      throw new Error("Budget not found");
    }
    throw error;
  }
}
