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

## Required Environment Variables

These must exist in `.env.local` before the new routes will work:

```
BUDGETS_COLLECTION_ID=       # Appwrite collection ID for budget documents
RECEIPTS_BUCKET_ID=          # Appwrite Storage bucket ID for receipt images
```

All other required env vars (`DATABASE_ID`, `APPWRITE_PROJECT_ID`, etc.) already exist.

---

## Design Decisions

### Layout: Overview-First Finance Hub (Option B)

A **persistent KPI strip** is pinned at the top of the Finance tab in all states. It shows four metrics: Revenue, Expenses, Net Profit, and VAT Due to KRA. A period selector (Today / Week / Month / Quarter) controls the time window for all four values.

Below the strip, a **contextual over-budget alert banner** appears automatically when any expense category has exceeded its monthly budget limit. It lists the offending categories and the overage amounts. It is hidden when all categories are within budget.

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
FinanceHub.tsx
  Props: none
  State: activeSection ('expenses'|'vat'|'reports'), period ('today'|'week'|'month'|'quarter')
  Fetches on mount and period change:
    - GET /api/reports/accounting?startDate&endDate  → kpiData (Revenue/Expenses/Profit/VAT)
    - GET /api/expenses?startDate&endDate            → expenseList + actuals per category
    - GET /api/budgets?month=YYYY-MM                 → budgetLimits per category
  Computes: comparisons = compareBudgetToActual(budgetLimits, actualsPerCategory)
  Passes comparisons to: BudgetAlertBanner, BudgetMeters

  FinanceKPIStrip.tsx
    Props: kpiData, period, onPeriodChange, loading
    Renders: Revenue, Expenses, Net Profit, VAT Due metric cards + period buttons
    Emits: onPeriodChange(period) when period buttons are clicked
    Period → date range mapping (used by FinanceHub to build startDate/endDate):
      today   → startDate = endDate = today (YYYY-MM-DD)
      week    → startDate = today − 7 days, endDate = today
      month   → startDate = first day of current calendar month, endDate = today
      quarter → startDate = first day of current calendar quarter, endDate = today

  BudgetAlertBanner.tsx
    Props: overBudgetCategories: BudgetComparison[]
    Renders: alert banner listing each category's name and KSh overage amount
    Hidden (returns null) when overBudgetCategories is empty

  FinanceSectionNav.tsx
    Props: activeSection, onSectionChange, onAddExpense, onSetBudgets
    Renders: segmented control (Expenses|VAT|Reports) + Add Expense + Set Budgets buttons
    Emits: onSectionChange(section), onAddExpense(), onSetBudgets()

  [Expenses section — receives from FinanceHub]
  BudgetMeters.tsx
    Props: comparisons: BudgetComparison[]
    Pure display — no fetching. Renders coloured progress bar per category.

  ExpenseList.tsx
    Props: expenses, onEdit(expense), onDelete(id), onMarkPaid(id), loading
    Renders: table — Date | Supplier | Category | Receipt | Amount | Status | Actions
    Receipt thumbnail: 🧾 icon if receiptUrl present; click opens image/PDF in new tab

  ExpenseDrawer.tsx
    Props: open, expense (null=create mode, Expense object=edit mode), onClose, onSaved
    State: formData, isSubmitting, isUploading, stagedFile, errors
    Emits: onClose(), onSaved()

    ReceiptUpload.tsx
      Props: currentUrl, onFileStaged(file), onRemoved()
      Renders: drag-drop zone; thumbnail if currentUrl exists; "Remove" button

  BudgetManager.tsx
    Props: open, comparisons: BudgetComparison[], onClose, onSaved
    Receives: comparisons from FinanceHub (contains both limits and current spend)
    Fetches only: POST/PUT /api/budgets on save — no independent GET needed
    Renders: editable KSh limit inputs per category with current-spend progress bars

  [VAT section]
  VATDashboard.tsx ← existing, unchanged

  [Reports section]
  RevenueExpenseChart.tsx
    Props: none (manages its own period state, independent of KPI strip period)
    Period options: 7 days | 30 days | 90 days | Custom date range
    Fetches:
      - GET /api/reports/revenue?days=N  → Array<{ date, revenue }>
      - GET /api/expenses?startDate&endDate → expenses grouped by invoiceDate
    Merges into: Array<{ date, revenue, expenses, profit }>
    Renders: Recharts ComposedChart — green revenue bars, red expense bars, amber dashed profit line
    Note: period is independent from the KPI strip period selector by design.
      The KPI strip uses calendar-aligned periods (Today/Week/Month/Quarter).
      The chart uses rolling-day windows (7/30/90) for trend analysis.

  PLSummaryTable.tsx
    Props: startDate, endDate (derived from chart's current period)
    Fetches: GET /api/reports/accounting?startDate&endDate
    Columns: Total Revenue | Total Expenses | Net Profit | Net VAT Payable
    Single aggregate row for the selected period

  ExportButtons.tsx
    Props: startDate, endDate
    CSV: fetches /api/reports/accounting, builds client-side Blob, triggers download
    PDF: window.print() with @media print stylesheet
```

### Modified Files

- `app/admin/page.tsx` — remove tabs 3, 4, 5; add Finance tab with `<FinanceHub />`; renumber shortcuts
- `lib/actions/expense.actions.ts` — add `receiptUrl?: string` field to `createExpense` and update

---

## API Routes

### Existing routes used (no changes)

**`GET /api/expenses`**
Already accepts: `startDate` (ISO date), `endDate` (ISO date), `category`, `paymentStatus`.
Returns: `{ expenses: Expense[], summary: { count, totalAmount, totalVat, totalWithVat } }`.
Used by: `FinanceHub` (expense list + actuals), `RevenueExpenseChart` (expense series).

**`GET /api/reports/accounting`**
Already accepts: `startDate`, `endDate`.
Returns: `{ summary: { totalIncome, totalExpenses, netProfit, outputVat, inputVat, netVat, profitMargin, orderCount, expenseCount }, expenseByCategory }`.
Used by: `FinanceKPIStrip` (KPI values), `PLSummaryTable`.

---

### New routes

#### `GET /api/reports/revenue`

Exposes `getRevenueByPeriod(days)` from `lib/actions/admin.actions.ts` with a configurable `days` param. The existing `/api/admin/analytics` hardcodes 7 days; this new route makes it flexible.

**Query params:** `days` (integer, default 7, max 365).

**Success (200):**
```json
{
  "data": [{ "date": "2026-03-21", "revenue": 48200 }],
  "totalRevenue": 301400
}
```

**Error responses:**
- `400 { "error": "days must be a positive integer" }`
- `500 { "error": "Failed to fetch revenue data" }`

---

#### `POST /api/expenses/upload`

Accepts `multipart/form-data` with a `file` field. Uploads to Appwrite Storage bucket `RECEIPTS_BUCKET_ID`.

**Success (200):** `{ "receiptUrl": "https://..." }`

**Error responses:**
- `400 { "error": "No file provided" }` — form-data missing `file` field or file is empty
- `400 { "error": "File too large. Maximum 5 MB" }` — exceeds 5 242 880 bytes
- `400 { "error": "Unsupported file type. Accepted: JPEG, PNG, WebP, PDF" }` — MIME not in allowed list
- `500 { "error": "Upload failed", "details": "..." }` — Appwrite Storage error

**Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

---

#### `GET /api/budgets`

**Query params:** `month` (YYYY-MM, defaults to current month).

**Success (200):**
```json
[
  { "budgetId": "$id", "category": "rent", "monthlyLimit": 80000, "month": 3, "year": 2026 }
]
```

If no budgets exist for the requested month, queries the previous calendar month. Returns `[]` if no data exists for either month.

**Error responses:**
- `400 { "error": "Invalid month format. Expected YYYY-MM" }`
- `500 { "error": "Failed to fetch budgets" }`

---

#### `POST /api/budgets`

**Body:** `{ category, monthlyLimit, month, year }`

Upsert behaviour: queries Appwrite for existing `(category, month, year)` first. Updates if found, creates if not.

**Success (200):** `{ "budget": { "budgetId", "category", "monthlyLimit", "month", "year" } }`

**Error responses:**
- `400 { "error": "category is required" }`
- `400 { "error": "monthlyLimit must be a positive number" }`
- `400 { "error": "Invalid category. Must be one of: operational, rent, utilities, supplies, marketing, salaries, maintenance, insurance, professional-services, other" }`
- `500 { "error": "Failed to save budget" }`

---

#### `PUT /api/budgets`

**Body:** `{ budgetId, monthlyLimit }` — updates only the limit on an existing document.

**Success (200):** `{ "success": true }`

**Error responses:**
- `400 { "error": "budgetId is required" }`
- `400 { "error": "monthlyLimit must be a positive number" }`
- `404 { "error": "Budget not found" }` — no document with that `$id`
- `500 { "error": "Failed to update budget" }`

---

## New Appwrite Collections

### `BUDGETS_COLLECTION_ID`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `category` | string | yes | one of the 10 categories |
| `monthlyLimit` | float | yes | > 0 |
| `month` | integer | yes | 1–12 |
| `year` | integer | yes | e.g. 2026 |
| `createdAt` | string (ISO) | yes | set on create |
| `updatedAt` | string (ISO) | yes | updated on every PUT |

**Uniqueness:** Appwrite has no composite unique index. The POST route enforces uniqueness by querying `[equal('category', c), equal('month', m), equal('year', y)]` before creating. If a match exists, it updates instead.

---

## New Library

### `lib/budget-utils.ts`

Pure functions — no side effects, no API calls.

```typescript
type BudgetStatus = 'ok' | 'warn' | 'over'

interface BudgetComparison {
  category: string
  limit: number        // 0 = no budget set
  actual: number
  percentage: number   // actual / limit * 100; 0 when limit is 0
  overage: number      // actual - limit; 0 when not over
  status: BudgetStatus // ok: <80%, warn: 80–100%, over: >100%
}

// Rules:
// - Category in actuals but not in budgets → limit=0, percentage=0, status='ok'
// - Category in budgets but not in actuals → actual=0, percentage=0, status='ok'
// - limit=0 → percentage=0, overage=0, status='ok' (no division)
function compareBudgetToActual(
  budgets: Record<string, number>,   // category → monthlyLimit
  actuals: Record<string, number>    // category → total spent this month
): BudgetComparison[]

function getOverBudgetCategories(comparisons: BudgetComparison[]): BudgetComparison[]
```

---

## Expense Categories (canonical list)

```
operational | rent | utilities | supplies | marketing |
salaries | maintenance | insurance | professional-services | other
```

Used in all Zod schemas, dropdowns, and budget category inputs.

---

## Expense Drawer — Behaviour Spec

### Validation (Zod schema)

| Field | Rule |
|-------|------|
| `supplierName` | required, min 2 chars, max 200 chars |
| `category` | required, one of the 10 categories above |
| `description` | required, min 5 chars, max 1000 chars |
| `amount` | required, number > 0 |
| `vatCategory` | required, one of: `standard` / `zero-rated` / `exempt` |
| `invoiceDate` | required, valid YYYY-MM-DD |
| `supplierTin` | optional, max 20 chars |
| `invoiceNumber` | optional, max 100 chars |
| `dueDate` | optional; if provided, must be ≥ `invoiceDate` |
| `notes` | optional, max 2000 chars |
| `receiptUrl` | optional, set internally |

### Submit Button State

The submit button is **disabled and shows a spinner** during both:
- Step 2: receipt upload in progress (`isUploading = true`)
- Step 3: expense save in progress (`isSubmitting = true`)

### Submit Flow

1. Run Zod validation — show inline field errors, abort if any fail.
2. If a receipt file is **staged** (`stagedFile !== null`):
   - Set `isUploading = true`, disable button.
   - `POST /api/expenses/upload` with the file.
   - **If upload fails:** show error toast with API error message, set `isUploading = false`, abort. Keep drawer open.
   - On success: save returned `receiptUrl` in form state, set `isUploading = false`.
3. Set `isSubmitting = true`, disable button.
4. `POST /api/expenses` (create) or `PUT /api/expenses` (edit) with full payload including `receiptUrl`.
5. On `200`: show success toast "Expense saved" → set `isSubmitting = false` → call `onSaved()` → call `onClose()`.
6. On `4xx/5xx`: show error toast with server `error` field → set `isSubmitting = false` → keep drawer open.

### Receipt Scenarios

**Create with receipt:** user stages a file → upload fires in step 2 → `receiptUrl` saved with expense.

**Edit, no new file staged:** existing `receiptUrl` is preserved as-is. No upload. Sent as-is in PUT body.

**Edit, new file staged:** upload fires in step 2. The returned `receiptUrl` replaces the old one in the PUT body. The old Appwrite Storage file is **not deleted** (orphan cleanup is v2 scope).

**Edit, user removes existing receipt:** user clicks "Remove" in `ReceiptUpload` → `receiptUrl` set to `null` in form state. On save, PUT is called with `receiptUrl: null`, clearing the field in Appwrite. Old file not deleted.

**Drawer closed mid-upload:** no AbortController (v1). Upload completes silently in background. No expense record is saved because submit was not triggered. The uploaded file becomes an orphan (v2 cleanup scope).

**Double-click submit:** prevented by the button being disabled from step 2 onward.

### VAT Preview

`amount` is the **pre-tax base** (exclusive of VAT), matching `lib/actions/expense.actions.ts` which calculates `vatAmount = amount * (vatRate / 100)`.

Updates in real time as `amount` or `vatCategory` changes:
- Standard (16%): `vat = amount * 0.16`, `total = amount + vat`
- Zero-rated: `vat = 0`, `total = amount`
- Exempt: `vat = 0`, `total = amount`

### Edit Mode

Opened by clicking ✏ in the expense list. Pre-fills all fields including displaying the existing receipt thumbnail. On save, calls PUT `/api/expenses`.

---

## Budget Meters — Colour Rules

| Percentage used | Colour | Label |
|-----------------|--------|-------|
| No budget set (limit = 0) | Gray `text-slate-500` | "no budget set" |
| < 80% | Green `text-emerald-400` | "on track" |
| 80–100% | Amber `text-amber-400` | "near limit" |
| > 100% | Red `text-red-400` | "over budget ⚠️" |

---

## Reports Section

### Trend Chart

Built with Recharts `ComposedChart`. Period toggle is **independent** of the KPI strip:
- KPI strip uses calendar-aligned periods (Today / Week / Month / Quarter) for P&L snapshots.
- Chart uses rolling-day windows (7 days / 30 days / 90 days / Custom) for visual trend analysis.

Data merged client-side: `Array<{ date, revenue, expenses, profit }>`.

### P&L Summary Table

Fetches `/api/reports/accounting` with `startDate`/`endDate` derived from the chart's current period.

Columns: Total Revenue | Total Expenses | Net Profit | Net VAT Payable.

### Export

**CSV:** client-side `Blob` download. Columns: Date, Revenue, Expenses, Net Profit, Net VAT.
**PDF:** `window.print()` with `@media print` stylesheet that hides nav and drawer.

---

## TDD Test Plan

All test files are written and confirmed **failing** before any implementation begins.

### `__tests__/finance/budget-utils.test.ts`

```
✗ returns ok when actual < 80% of limit
✗ returns warn when actual is 80–100% of limit
✗ returns over when actual exceeds limit
✗ calculates percentage and overage correctly
✗ limit=0: percentage=0, overage=0, status=ok (no division by zero)
✗ category in actuals but not budgets: limit=0, status=ok
✗ category in budgets but not actuals: actual=0, percentage=0, status=ok
✗ getOverBudgetCategories — returns only over-status items
✗ getOverBudgetCategories — returns empty array when all within budget
```

### `__tests__/finance/expense-drawer.test.tsx`

```
✗ shows inline error when supplierName is empty on submit
✗ shows inline error when amount is 0 on submit
✗ shows inline error when amount is negative on submit
✗ shows inline error when description is empty on submit
✗ shows inline error when dueDate is before invoiceDate
✗ disables submit button while upload is in progress (isUploading)
✗ disables submit button while save is in progress (isSubmitting)
✗ shows spinner on submit button while in flight
✗ shows success toast "Expense saved" on 200 response
✗ shows error toast with message on 400 response
✗ shows error toast with message on 500 response
✗ shows error toast and keeps drawer open when upload fails
✗ closes drawer on successful save
✗ keeps drawer open on save error
✗ pre-fills supplierName when editing existing expense
✗ pre-fills amount when editing existing expense
✗ sends receiptUrl: null when receipt is removed during edit
✗ VAT preview shows 16% VAT when vatCategory is standard
✗ VAT preview shows 0 VAT when vatCategory is zero-rated
✗ VAT preview shows 0 VAT when vatCategory is exempt
✗ VAT preview updates when amount input changes
```

### `__tests__/finance/budget-alert-banner.test.tsx`

```
✗ renders nothing (returns null) when overBudgetCategories is empty array
✗ renders banner when one category is over budget
✗ lists all over-budget category names
✗ shows formatted KSh overage amount for each over-budget category
```

### `__tests__/finance/finance-kpi-strip.test.tsx`

```
✗ renders Revenue value from /api/reports/accounting response
✗ renders Expenses value from /api/reports/accounting response
✗ renders Net Profit value from /api/reports/accounting response
✗ renders VAT Due (netVat) value from /api/reports/accounting response
✗ profit card uses emerald-400 text when positive
✗ profit card uses red-400 text when negative
✗ clicking "Week" button calls onPeriodChange with "week"
✗ shows loading skeleton during fetch
```

### `__tests__/finance/api-budgets.test.ts`

```
✗ GET returns budgets array for given YYYY-MM month with budgetId included
✗ GET returns empty array when no data for month or previous month
✗ GET auto-carries from previous month when current month has no budgets
✗ GET returns 400 for invalid month format
✗ POST creates a new budget document
✗ POST returns 400 when category is missing
✗ POST returns 400 when monthlyLimit is not a positive number
✗ POST returns 400 for invalid category value
✗ POST upserts (updates) when (category, month, year) already exists
✗ PUT updates monthlyLimit on existing document
✗ PUT returns 404 when budgetId does not exist
✗ PUT returns 400 when monthlyLimit is not a positive number
```

### `__tests__/finance/api-expenses-upload.test.ts`

```
✗ POST returns receiptUrl on successful upload
✗ POST returns 400 when no file field is provided
✗ POST returns 400 when file exceeds 5 MB
✗ POST returns 400 for unsupported MIME type
✗ POST returns 500 when Appwrite Storage throws
```

### `__tests__/finance/api-reports-revenue.test.ts`

```
✗ GET returns Array<{ date, revenue }> for given days param
✗ GET defaults to 7 days when no days param provided
✗ GET returns 400 when days is not a positive integer
✗ GET returns 500 when Appwrite query fails
```

---

## What Is Not Changing

- Existing `GET /api/expenses`, `POST /api/expenses`, `PUT /api/expenses`, `DELETE /api/expenses` — no modifications
- `VATDashboard.tsx` — integrated as-is
- `SalesReport.tsx` — unchanged
- Expense data model — only `receiptUrl?: string` field added
- KRA eTIMS integration — unchanged
- `/api/admin/analytics` route — unchanged (chart uses new `/api/reports/revenue`)

---

## Implementation Order

1. Write all test files (RED — confirm failures before any implementation)
2. `lib/budget-utils.ts` — pure functions, no Appwrite dependency
3. `lib/actions/budget.actions.ts` + `app/api/budgets/route.ts` + `app/api/reports/revenue/route.ts`
4. `app/api/expenses/upload/route.ts` (create `RECEIPTS_BUCKET_ID` in Appwrite console first)
5. `ReceiptUpload.tsx` + `ExpenseDrawer.tsx` (fix all broken form behaviour)
6. `BudgetAlertBanner.tsx` + `BudgetMeters.tsx` + `BudgetManager.tsx`
7. `FinanceKPIStrip.tsx` + `FinanceSectionNav.tsx`
8. `ExpenseList.tsx`
9. `RevenueExpenseChart.tsx` + `PLSummaryTable.tsx` + `ExportButtons.tsx`
10. `FinanceHub.tsx` (assemble — this is when steps 6 and 7 components become testable in full context)
11. `app/admin/page.tsx` — swap tabs 3/4/5 for Finance tab, renumber shortcuts
12. Run full test suite GREEN verification
