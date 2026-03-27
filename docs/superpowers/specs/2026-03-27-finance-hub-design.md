# Finance Hub — Sub-project 1 Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Project:** ScanNServe Reservations Admin Panel
**Scope:** Accounting Operations Overhaul (Sub-project 1 of 4)

---

## Problem Statement

The admin panel currently has three separate financial tabs — Accounting (tab 3), VAT (tab 4), and Expenses (tab 5) — that require constant tab-switching to get a complete financial picture. The Expenses tab is actively broken: the submit button fails silently on API errors, there is no loading state, the edit button is imported but never rendered, amount defaults to `0` (passing `required` validation), and the entire form uses mismatched `gray-800` styles instead of the established `slate-800` design system. There is no receipt attachment, no budget tracking, and no way to export financial data.

---

## Goals

1. Replace three financial tabs with one unified **Finance Hub** tab.
2. Fix all broken expense form behaviour with proper validation, loading states, and error feedback.
3. Add receipt/invoice image attachment via Appwrite Storage.
4. Introduce monthly budget tracking per expense category with over-budget alerts.
5. Provide a revenue vs. expenses trend chart with CSV/PDF export.
6. Maintain full Kenya KRA compliance (VAT tracking unchanged).
7. Implement with TDD: every new behaviour has a failing test before implementation.

---

## Design Decisions

### Layout: Overview-First Finance Hub (Option B)

A **persistent KPI strip** is pinned at the top of the Finance tab in all states. It shows four metrics: Revenue, Expenses, Net Profit, and VAT Due to KRA. A period selector (Today / Week / Month / Quarter) controls the time window for all four values.

Below the strip, a **contextual over-budget alert banner** appears automatically when any expense category has exceeded its monthly budget limit. It lists the offending categories and the overage amounts.

Below the banner, a **segmented control** switches between three sections: Expenses | VAT | Reports. The "Add Expense" and "Set Budgets" action buttons live at the right of this nav row, visible from any section.

This layout was chosen over inner-tab navigation (Option A) and command-centre layout (Option C) because it keeps financial context (P&L) visible at all times without sacrificing vertical space for detail content.

### Admin Tab Consolidation

Admin tabs go from 6 to 4:

| Before | After |
|--------|-------|
| Dashboard (1) | Dashboard (1) |
| Sales (2) | Sales (2) |
| Accounting (3) | **Finance (3)** ← new, replaces 3+4+5 |
| VAT (4) | ~~removed~~ |
| Expenses (5) | ~~removed~~ |
| Import (6) | Import (4) |

Keyboard shortcuts 1–4 remain functional.

---

## Component Architecture

### New Components (`components/reports/`)

```
FinanceHub.tsx                  ← top-level, owns section state + period state
  FinanceKPIStrip.tsx           ← persistent 4-metric strip with period selector
  BudgetAlertBanner.tsx         ← contextual over-budget banner (hidden when clear)
  FinanceSectionNav.tsx         ← Expenses | VAT | Reports segmented control + action buttons

  [Expenses section]
  BudgetMeters.tsx              ← per-category progress bars (green/amber/red)
  ExpenseList.tsx               ← rebuilt table: date, supplier, category, receipt, amount, status, actions
  ExpenseDrawer.tsx             ← slide-in form (replaces modal): Zod validation, toast, edit support
    ReceiptUpload.tsx           ← drag-drop zone → Appwrite Storage → receiptUrl
  BudgetManager.tsx             ← "Set Budgets" panel: editable KSh inputs per category

  [VAT section]
  VATDashboard.tsx              ← existing component, integrated unchanged

  [Reports section]
  RevenueExpenseChart.tsx       ← Recharts bar+line: revenue bars, expense bars, profit line
  PLSummaryTable.tsx            ← Revenue / Expenses / Net Profit / Net VAT row
  ExportButtons.tsx             ← CSV (client Blob) and PDF (window.print) export
```

### Modified Files

- `app/admin/page.tsx` — remove tabs 3, 4, 5; add Finance tab with `<FinanceHub />`; renumber keyboard shortcuts
- `lib/actions/expense.actions.ts` — add `receiptUrl?: string` field support to `createExpense` and `updateExpense`

---

## New API Routes

### `POST /api/expenses/upload`

Accepts `multipart/form-data` with a `file` field. Uploads to Appwrite Storage bucket `RECEIPTS_BUCKET_ID`. Returns `{ receiptUrl: string }`.

**Constraints:** Max file size 5 MB. Accepted types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

### `GET /api/budgets`

Query params: `month` (YYYY-MM, defaults to current month).
Returns array of `{ category, monthlyLimit, month, year }`.
If no budgets exist for the requested month, auto-carries from the previous month (falls back to empty array if no previous month data exists).

### `POST /api/budgets`

Body: `{ category, monthlyLimit, month, year }`.
Creates or upserts a budget document in the `BUDGETS_COLLECTION_ID` Appwrite collection.

### `PUT /api/budgets`

Body: `{ budgetId, monthlyLimit }`.
Updates an existing budget limit.

---

## New Appwrite Collections

### `BUDGETS_COLLECTION_ID`

| Field | Type | Required |
|-------|------|----------|
| `category` | string | yes |
| `monthlyLimit` | float | yes |
| `month` | integer (1–12) | yes |
| `year` | integer | yes |
| `createdAt` | string (ISO) | yes |

Unique constraint: `(category, month, year)` — one budget per category per month.

---

## New Library

### `lib/budget-utils.ts`

Pure functions — no side effects, no API calls. Fully unit-testable.

```typescript
type BudgetStatus = 'ok' | 'warn' | 'over'

interface BudgetComparison {
  category: string
  limit: number
  actual: number
  percentage: number        // actual / limit * 100
  overage: number           // actual - limit (0 if not over)
  status: BudgetStatus      // ok <80%, warn 80–100%, over >100%
}

function compareBudgetToActual(
  budgets: Record<string, number>,   // category → limit
  actuals: Record<string, number>    // category → spent
): BudgetComparison[]

function getOverBudgetCategories(comparisons: BudgetComparison[]): BudgetComparison[]
```

---

## Expense Drawer — Behaviour Spec

### Validation (Zod schema)

| Field | Rule |
|-------|------|
| `supplierName` | required, min 2 chars |
| `category` | required, must be one of the 10 categories |
| `description` | required, min 5 chars |
| `amount` | required, must be > 0 |
| `vatCategory` | required, one of: standard / zero-rated / exempt |
| `invoiceDate` | required, valid date string |
| `supplierTin` | optional |
| `invoiceNumber` | optional |
| `dueDate` | optional, must be ≥ invoiceDate if provided |
| `notes` | optional |
| `receiptUrl` | optional (set after upload completes) |

### Submit Flow

1. Run Zod validation — show inline errors for failing fields, abort if any fail.
2. If a receipt file is staged: `POST /api/expenses/upload` → receive `receiptUrl`.
   Show upload progress. If upload fails: show toast error, keep drawer open.
3. `POST /api/expenses` (create) or `PUT /api/expenses` (edit) with full payload including `receiptUrl`.
4. On `200`: show success toast → close drawer → refetch expense list + KPI strip.
5. On `4xx/5xx`: show error toast with the API error message → keep drawer open.

### VAT Preview

Updates in real time as `amount` or `vatCategory` changes:
- Standard (16%): `vat = amount * 0.16`, `total = amount + vat`
- Zero-rated / Exempt: `vat = 0`, `total = amount`

### Edit Mode

Opened by clicking the edit (✏) icon in the expense list. Pre-fills all fields including displaying the existing receipt thumbnail. On save, calls `PUT /api/expenses` and re-uploads receipt only if a new file is staged.

---

## Budget Meters — Colour Rules

| Percentage of budget used | Colour | Label |
|--------------------------|--------|-------|
| < 80% | Green (`text-emerald-400`) | "on track" |
| 80–100% | Amber (`text-amber-400`) | "near limit" |
| > 100% | Red (`text-red-400`) | "over budget ⚠️" |

---

## Reports Section

### Trend Chart

Built with Recharts `ComposedChart`. Three data series per day:
- Revenue (green `BarChart` bars)
- Expenses (red `BarChart` bars, narrower)
- Net Profit (amber `Line`, dashed)

Period toggles: 7 days / 30 days / 3 months / Custom date range.

Data sources:
- Revenue: `/api/admin/analytics` (existing, returns daily revenue)
- Expenses: `/api/expenses` grouped client-side by `invoiceDate`
- Merged into `Array<{ date: string, revenue: number, expenses: number, profit: number }>`

### Export

**CSV:** Client-side string construction → `Blob` → `URL.createObjectURL` download. Columns: Date, Revenue, Expenses, Net Profit, Net VAT.

**PDF:** Print stylesheet (`@media print`) renders a clean P&L view. `window.print()` triggers it. No server-side PDF library needed.

---

## TDD Test Plan

Tests are written and confirmed failing **before** any implementation begins.

### `__tests__/finance/budget-utils.test.ts`

```
✗ compareBudgetToActual — returns ok when actual < 80% of limit
✗ compareBudgetToActual — returns warn when actual is 80–100% of limit
✗ compareBudgetToActual — returns over when actual exceeds limit
✗ compareBudgetToActual — calculates percentage and overage correctly
✗ compareBudgetToActual — handles zero limit without division error
✗ compareBudgetToActual — includes category with no budget as ok (no limit set)
✗ getOverBudgetCategories — returns only over-status items
✗ getOverBudgetCategories — returns empty array when all within budget
```

### `__tests__/finance/expense-drawer.test.tsx`

```
✗ shows inline error when supplierName is empty on submit
✗ shows inline error when amount is 0 on submit
✗ shows inline error when amount is negative on submit
✗ shows inline error when description is empty on submit
✗ disables submit button while request is in flight
✗ shows spinner on submit button while request is in flight
✗ shows success toast ("Expense saved") on 200 response
✗ shows error toast with message on 400 response
✗ shows error toast with message on 500 response
✗ closes drawer on success
✗ keeps drawer open on error
✗ pre-fills supplierName when editing existing expense
✗ pre-fills amount when editing existing expense
✗ VAT preview shows 16% VAT when vatCategory is standard
✗ VAT preview shows 0 VAT when vatCategory is zero-rated
✗ VAT preview updates when amount input changes
```

### `__tests__/finance/finance-kpi-strip.test.tsx`

```
✗ renders Revenue value from API response
✗ renders Expenses value from API response
✗ renders Net Profit value from API response
✗ renders VAT Due value from API response
✗ profit displays in green when positive
✗ profit displays in red when negative (loss)
✗ clicking "Week" period button triggers refetch with week params
✗ shows loading skeleton during data fetch
```

### `__tests__/finance/api-budgets.test.ts`

```
✗ GET /api/budgets returns budgets for given month
✗ GET /api/budgets returns empty array when no budgets exist for month
✗ GET /api/budgets auto-carries from previous month when current month empty
✗ POST /api/budgets creates a budget document
✗ POST /api/budgets returns 400 when category is missing
✗ POST /api/budgets returns 400 when monthlyLimit is not a positive number
✗ PUT /api/budgets updates monthlyLimit on existing document
```

### `__tests__/finance/api-expenses-upload.test.ts`

```
✗ POST /api/expenses/upload returns receiptUrl on success
✗ POST /api/expenses/upload returns 400 when no file is provided
✗ POST /api/expenses/upload returns 400 when file exceeds 5 MB
✗ POST /api/expenses/upload returns 400 for unsupported file type
```

---

## What Is Not Changing

- Existing `GET /api/expenses`, `POST /api/expenses`, `PUT /api/expenses`, `DELETE /api/expenses` routes — no modifications
- `VATDashboard.tsx` — integrated as-is, zero changes
- `SalesReport.tsx` — unchanged
- Expense data model in Appwrite — only `receiptUrl?: string` field added
- Kenya KRA eTIMS integration — unchanged

---

## Implementation Order

1. Write all test files (RED phase — confirm failures)
2. `lib/budget-utils.ts` — pure functions, no dependencies
3. `lib/actions/budget.actions.ts` + `app/api/budgets/route.ts`
4. `app/api/expenses/upload/route.ts` + Appwrite Storage bucket
5. `ExpenseDrawer.tsx` + `ReceiptUpload.tsx` (fix all broken form behaviour)
6. `BudgetMeters.tsx` + `BudgetManager.tsx`
7. `FinanceKPIStrip.tsx` + `BudgetAlertBanner.tsx` + `FinanceSectionNav.tsx`
8. `ExpenseList.tsx` (rebuilt table)
9. `RevenueExpenseChart.tsx` + `PLSummaryTable.tsx` + `ExportButtons.tsx`
10. `FinanceHub.tsx` (assemble all sections)
11. `app/admin/page.tsx` — swap tabs 3/4/5 for Finance tab
12. Run full test suite GREEN verification
