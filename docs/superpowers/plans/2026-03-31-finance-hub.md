# Finance Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Finance Hub tab — receipt upload API, fixed ExpenseDrawer (2-step upload, VAT preview, dueDate validation), corrected BudgetManager (field-naming bugs, progress bars), dedicated BudgetMeters component, period-to-date mapping in FinanceHub, real chart data, and ExportButtons.

**Architecture:** Most components already exist (~70%). This plan finishes the gaps. `ReceiptUpload` must be refactored to stage (not upload) the file — the upload happens in `ExpenseDrawer` on form submit. `BudgetManager` has two field-naming bugs (`actualSpent` and `monthlyLimit`). `FinanceHub` passes `?period=` instead of `startDate/endDate`. The chart uses hardcoded mock data. All follow the existing amber/slate design system.

**Tech Stack:** Next.js App Router, Appwrite Storage (`RECEIPTS_BUCKET_ID`), React Hook Form + Zod, `useWatch` (react-hook-form), Recharts, Vitest + @testing-library/react, `vi.spyOn(global, 'fetch')`

---

## Current State (as of audit)

**COMPLETE — verify only, do not re-implement:**
- `lib/budget-utils.ts` — all pure functions, tests GREEN. Types: `BudgetComparison { category, limit, actual, percentage, overage, status }`
- `lib/actions/budget.actions.ts` — getBudgetsByMonth, upsertBudget, updateBudgetLimit
- `app/api/budgets/route.ts` — GET/POST/PUT with full validation
- `app/api/reports/revenue/route.ts` — configurable `days` param, returns `{ data, totalRevenue }`
- `app/api/reports/accounting/route.ts` — returns `{ summary: { totalIncome, totalExpenses, netProfit, netVat, ... }, expenseByCategory }`
- `components/reports/FinanceKPIStrip.tsx` — 4 KPIs, period buttons, loading skeleton
- `components/reports/BudgetAlertBanner.tsx` — shows over-budget categories, returns null when empty
- `components/reports/FinanceSectionNav.tsx` — segmented control + action buttons
- `components/reports/ExpenseList.tsx` — table with edit/delete, receipt link
- `components/reports/RevenueExpenseChart.tsx` — Recharts ComposedChart (needs real data — see Task 5)
- `components/reports/PLSummaryTable.tsx` — accepts `data: PLDataRow[]` prop (not startDate/endDate)
- `app/admin/page.tsx` — Finance tab integrated at keyboard shortcut '3'
- `__tests__/finance/budget-utils.test.ts` — all GREEN
- `__tests__/finance/api-budgets.test.ts` — written
- `__tests__/finance/api-reports-revenue.test.ts` — written

**NEEDS WORK (tasks below):**
- `app/api/expenses/upload/route.ts` — MISSING (blocks receipt attachment entirely)
- `components/reports/ReceiptUpload.tsx` — must be refactored to stage-only (no upload on drop); currently calls wrong endpoint
- `components/reports/ExpenseDrawer.tsx` — missing VAT preview, dueDate validation, 2-step upload flow
- `components/reports/BudgetManager.tsx` — two field bugs: `actualSpent` → `actual`, `monthlyLimit` → `limit`; no progress bars
- `components/reports/BudgetMeters.tsx` — MISSING (separate display component for Expenses section)
- `components/reports/FinanceHub.tsx` — period-to-date mapping stub; RevenueExpenseChart gets mock data
- `components/reports/ExportButtons.tsx` — MISSING

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `app/api/expenses/upload/route.ts` | **Create** | Receipt upload: MIME/size validation → Appwrite Storage → `{ receiptUrl }` |
| `components/reports/ReceiptUpload.tsx` | **Modify** | Stage file locally; call `onFileStaged(file)`; no upload on drop |
| `components/reports/ExpenseDrawer.tsx` | **Modify** | 2-step upload on submit; VAT preview with `useWatch`; dueDate ≥ invoiceDate |
| `components/reports/BudgetManager.tsx` | **Modify** | Fix `actual`/`limit` field names; add progress bars with status colours |
| `components/reports/BudgetMeters.tsx` | **Create** | Read-only progress bars per category — rendered in Expenses section |
| `components/reports/FinanceHub.tsx` | **Modify** | `getPeriodDateRange()`; real chart data via `/api/reports/revenue` + `/api/expenses`; expose chart period to ExportButtons/PLSummaryTable |
| `components/reports/ExportButtons.tsx` | **Create** | CSV Blob download + `window.print()` PDF |
| `__tests__/finance/api-expenses-upload.test.ts` | **Create** | 5 route tests |
| `__tests__/finance/expense-drawer.test.tsx` | **Modify** | Add tests: VAT preview, upload flow, dueDate, button disabled states |

---

## Task 1: Receipt Upload API Route

**Files:**
- Create: `app/api/expenses/upload/route.ts`
- Create: `__tests__/finance/api-expenses-upload.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `__tests__/finance/api-expenses-upload.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/expenses/upload/route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/appwrite.config', () => ({
  storage: { createFile: vi.fn() },
  ID: { unique: vi.fn(() => 'mock-id') },
}))
// Also mock node-appwrite so ID.unique() is intercepted
vi.mock('node-appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-appwrite')>()
  return { ...actual, ID: { unique: () => 'mock-id' }, InputFile: actual.InputFile }
})

import { storage } from '@/lib/appwrite.config'

process.env.RECEIPTS_BUCKET_ID = 'test-bucket'
process.env.NEXT_PUBLIC_ENDPOINT = 'https://cloud.appwrite.io/v1'
process.env.NEXT_PUBLIC_PROJECT_ID = 'test-proj'

function makeReq(file?: File) {
  const form = new FormData()
  if (file) form.append('file', file)
  return new NextRequest('http://localhost/api/expenses/upload', { method: 'POST', body: form })
}

describe('POST /api/expenses/upload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns receiptUrl on successful JPEG upload', async () => {
    vi.mocked(storage.createFile).mockResolvedValueOnce({ $id: 'file123' } as any)
    const res = await POST(makeReq(new File(['x'], 'r.jpg', { type: 'image/jpeg' })))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.receiptUrl).toContain('file123')
  })

  it('returns 400 when no file field', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No file provided')
  })

  it('returns 400 when file exceeds 5 MB', async () => {
    const file = new File([Buffer.alloc(5 * 1024 * 1024 + 1)], 'b.jpg', { type: 'image/jpeg' })
    const res = await POST(makeReq(file))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/5 MB/)
  })

  it('returns 400 for unsupported MIME type', async () => {
    const res = await POST(makeReq(new File(['x'], 'f.gif', { type: 'image/gif' })))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Unsupported/)
  })

  it('returns 500 when Appwrite Storage throws', async () => {
    vi.mocked(storage.createFile).mockRejectedValueOnce(new Error('Storage down'))
    const res = await POST(makeReq(new File(['x'], 'r.png', { type: 'image/png' })))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Upload failed')
  })
})
```

- [ ] **Step 1.2: Run — confirm 5 FAILING**

```bash
cd /home/elyees/D/reservations/reservations
npx vitest run __tests__/finance/api-expenses-upload.test.ts
```

Expected: 5 FAIL with module-not-found or similar.

- [ ] **Step 1.3: Create the route**

Create `app/api/expenses/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { storage } from '@/lib/appwrite.config'
import { InputFile, ID } from 'node-appwrite'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file || file.size === 0)
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: 'File too large. Maximum 5 MB' }, { status: 400 })
    if (!ALLOWED.includes(file.type))
      return NextResponse.json(
        { error: 'Unsupported file type. Accepted: JPEG, PNG, WebP, PDF' },
        { status: 400 }
      )

    const bucket = process.env.RECEIPTS_BUCKET_ID!
    const uploaded = await storage.createFile(
      bucket,
      ID.unique(),
      InputFile.fromBuffer(Buffer.from(await file.arrayBuffer()), file.name)
    )
    const ep = process.env.NEXT_PUBLIC_ENDPOINT ?? 'https://cloud.appwrite.io/v1'
    const pid = process.env.NEXT_PUBLIC_PROJECT_ID ?? ''
    const receiptUrl = `${ep}/storage/buckets/${bucket}/files/${uploaded.$id}/view?project=${pid}`
    return NextResponse.json({ receiptUrl })
  } catch (err: any) {
    console.error('[expenses/upload]', err)
    return NextResponse.json({ error: 'Upload failed', details: err?.message }, { status: 500 })
  }
}
```

- [ ] **Step 1.4: Run — confirm 5 PASSING**

```bash
npx vitest run __tests__/finance/api-expenses-upload.test.ts
```

- [ ] **Step 1.5: Commit**

```bash
git add app/api/expenses/upload/route.ts __tests__/finance/api-expenses-upload.test.ts
git commit -m "feat: POST /api/expenses/upload — receipt upload with MIME and size validation"
```

---

## Task 2: Refactor ReceiptUpload to Stage-Only

**Files:**
- Modify: `components/reports/ReceiptUpload.tsx`

The spec requires `ReceiptUpload` to **stage** the file (show a preview) and call `onFileStaged(file)` — actual upload happens in `ExpenseDrawer` on form submit. The current component uploads immediately on drop, which is wrong. Read the current file first.

- [ ] **Step 2.1: Read the current component**

```bash
cat components/reports/ReceiptUpload.tsx
```

- [ ] **Step 2.2: Rewrite to stage-only**

The new prop interface:

```typescript
interface Props {
  currentUrl?: string | null     // existing receipt URL (edit mode)
  onFileStaged: (file: File) => void   // called when user drops/selects a file
  onRemoved: () => void                // called when user clicks Remove
}
```

New behaviour:
1. On file drop/select: validate size (≤ 5 MB) client-side with toast on fail. On pass: store file in local state for preview + call `onFileStaged(file)`. No fetch call.
2. Show `<img>` preview if file is staged (use `URL.createObjectURL(file)`)
3. If `currentUrl` provided and no file staged: show existing image thumbnail
4. "Remove" button: clear local file state + call `onRemoved()`

Remove all `fetch('/api/upload', ...)` code.

- [ ] **Step 2.3: Update ExpenseDrawer to use new interface**

`ExpenseDrawer` must hold `stagedFile` state and wire the new callbacks:

```typescript
const [stagedFile, setStagedFile] = useState<File | null>(null)

<ReceiptUpload
  currentUrl={formData.receiptUrl}
  onFileStaged={(file) => setStagedFile(file)}
  onRemoved={() => { setStagedFile(null); setValue('receiptUrl', null) }}
/>
```

- [ ] **Step 2.4: Commit**

```bash
git add components/reports/ReceiptUpload.tsx components/reports/ExpenseDrawer.tsx
git commit -m "refactor: ReceiptUpload stages file locally; upload deferred to form submit"
```

---

## Task 3: Fix ExpenseDrawer — VAT Preview, dueDate, Upload Flow

**Files:**
- Modify: `components/reports/ExpenseDrawer.tsx`
- Modify: `__tests__/finance/expense-drawer.test.tsx`

- [ ] **Step 3.1: Read the current ExpenseDrawer**

```bash
cat components/reports/ExpenseDrawer.tsx
```

Look for: `stagedFile` state (added in Task 2), existing Zod schema, and the submit handler.

- [ ] **Step 3.2: Write failing tests**

Add to `__tests__/finance/expense-drawer.test.tsx`. Use `vi.spyOn(global, 'fetch')` — MSW is not installed:

```typescript
test('VAT preview shows 16% breakdown when vatCategory is standard', async () => {
  render(<ExpenseDrawer open={true} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />)
  const amtInput = screen.getByLabelText(/amount/i)
  await userEvent.clear(amtInput)
  await userEvent.type(amtInput, '1000')
  // select standard via the vatCategory select
  await userEvent.selectOptions(screen.getByLabelText(/vat/i), 'standard')
  expect(screen.getByText(/160/)).toBeInTheDocument()   // vat = 160
  expect(screen.getByText(/1[,.]160/)).toBeInTheDocument() // total = 1160
})

test('VAT preview shows 0 when vatCategory is zero-rated', async () => {
  render(<ExpenseDrawer open={true} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />)
  await userEvent.type(screen.getByLabelText(/amount/i), '1000')
  await userEvent.selectOptions(screen.getByLabelText(/vat/i), 'zero-rated')
  // Should NOT show a nonzero VAT amount
  expect(screen.queryByText(/160/)).not.toBeInTheDocument()
})

test('shows inline error when dueDate is before invoiceDate', async () => {
  render(<ExpenseDrawer open={true} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />)
  await userEvent.type(screen.getByLabelText(/invoice date/i), '2026-03-10')
  await userEvent.type(screen.getByLabelText(/due date/i), '2026-03-05')
  await userEvent.click(screen.getByRole('button', { name: /save/i }))
  expect(screen.getByText(/due date.*on or after/i)).toBeInTheDocument()
})

test('submit button is disabled during receipt upload', async () => {
  let resolveFetch!: (v: Response) => void
  vi.spyOn(global, 'fetch').mockImplementationOnce(
    () => new Promise<Response>(res => { resolveFetch = res })
  )
  render(<ExpenseDrawer open={true} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />)
  // ... fill required fields, stage a file ...
  const submitBtn = screen.getByRole('button', { name: /save/i })
  userEvent.click(submitBtn)  // do not await — it's in-flight
  await waitFor(() => expect(submitBtn).toBeDisabled())
  resolveFetch(new Response(JSON.stringify({ receiptUrl: 'http://x.com/r.jpg' }), { status: 200 }))
})

test('shows error toast and keeps drawer open when upload fails', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 })
  )
  render(<ExpenseDrawer open={true} expense={null} onClose={vi.fn()} onSaved={vi.fn()} />)
  // fill required fields + stage a file
  await userEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(screen.getByText(/upload failed/i)).toBeInTheDocument())
  expect(screen.getByRole('dialog')).toBeInTheDocument()  // drawer still open
})
```

- [ ] **Step 3.3: Confirm new tests FAIL**

```bash
npx vitest run __tests__/finance/expense-drawer.test.tsx
```

- [ ] **Step 3.4: Add VAT preview using `useWatch`**

`useWatch` from react-hook-form re-renders only when watched fields change (no infinite loop):

```typescript
import { useWatch } from 'react-hook-form'

// Inside the component body, after useForm():
const amount = useWatch({ control, name: 'amount', defaultValue: 0 })
const vatCategory = useWatch({ control, name: 'vatCategory', defaultValue: 'standard' })

const vatPreview = useMemo(() => {
  const base = Number(amount) || 0
  const rate = vatCategory === 'standard' ? 0.16 : 0
  return { vat: base * rate, total: base + base * rate }
}, [amount, vatCategory])
```

Add below the amount input in JSX:

```tsx
{vatPreview.vat > 0 && (
  <p className="text-sm text-slate-400 mt-1">
    VAT (16%): KSh {vatPreview.vat.toLocaleString()} · Total: KSh {vatPreview.total.toLocaleString()}
  </p>
)}
{vatPreview.vat === 0 && Number(amount) > 0 && (
  <p className="text-sm text-slate-500 mt-1">
    VAT: KSh 0 · Total: KSh {Number(amount).toLocaleString()}
  </p>
)}
```

- [ ] **Step 3.5: Add dueDate ≥ invoiceDate Zod refinement**

Add to the existing Zod schema:

```typescript
.refine(
  (d) => !d.dueDate || !d.invoiceDate || d.dueDate >= d.invoiceDate,
  { message: 'Due date must be on or after invoice date', path: ['dueDate'] }
)
```

- [ ] **Step 3.6: Implement 2-step submit flow**

```typescript
const onSubmit = async (data: FormValues) => {
  // ── Upload receipt if staged ──────────────────────────────────
  let receiptUrl: string | null = (data as any).receiptUrl ?? expense?.receiptUrl ?? null

  if (stagedFile) {
    setIsUploading(true)
    const form = new FormData()
    form.append('file', stagedFile)
    try {
      const res = await fetch('/api/expenses/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      receiptUrl = json.receiptUrl
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed')
      setIsUploading(false)
      return
    }
    setIsUploading(false)
  }

  // ── Save expense ──────────────────────────────────────────────
  setIsSubmitting(true)
  try {
    const payload = { ...data, receiptUrl }
    const url = '/api/expenses'
    const method = expense ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to save expense')
    toast.success('Expense saved')
    onSaved()
    onClose()
  } catch (err: any) {
    toast.error(err.message ?? 'Failed to save expense')
  } finally {
    setIsSubmitting(false)
  }
}
```

Disable submit button: `disabled={isUploading || isSubmitting}`.

- [ ] **Step 3.7: Run tests — confirm PASS**

```bash
npx vitest run __tests__/finance/expense-drawer.test.tsx
```

- [ ] **Step 3.8: Commit**

```bash
git add components/reports/ExpenseDrawer.tsx __tests__/finance/expense-drawer.test.tsx
git commit -m "fix: ExpenseDrawer 2-step upload flow, VAT preview, dueDate validation"
```

---

## Task 4: Fix BudgetManager Field Bugs + Add Progress Bars

**Files:**
- Modify: `components/reports/BudgetManager.tsx`

- [ ] **Step 4.1: Read the current BudgetManager**

```bash
cat components/reports/BudgetManager.tsx
```

Look for every reference to `actualSpent` and `monthlyLimit`. These are both wrong field names. `BudgetComparison` (from `lib/budget-utils.ts`) uses `actual` and `limit`.

- [ ] **Step 4.2: Fix both field-name bugs**

Run these to confirm the occurrences:

```bash
grep -n "actualSpent\|monthlyLimit" components/reports/BudgetManager.tsx
```

Replace all:
- `c.actualSpent` → `c.actual`
- `comparison.actualSpent` → `comparison.actual`
- `c.monthlyLimit` → `c.limit`
- `comparison.monthlyLimit` → `comparison.limit`

- [ ] **Step 4.3: Add progress bars with colour coding**

For each category row in the BudgetManager, add below the limit input:

```typescript
// Colour based on comparison.status ('ok' | 'warn' | 'over')
const barColor = comparison.status === 'over'
  ? 'bg-red-400'
  : comparison.status === 'warn'
  ? 'bg-amber-400'
  : 'bg-emerald-400'

const textColor = comparison.status === 'over'
  ? 'text-red-400'
  : comparison.status === 'warn'
  ? 'text-amber-400'
  : comparison.limit === 0
  ? 'text-slate-500'
  : 'text-emerald-400'

const label = comparison.limit === 0
  ? 'no budget set'
  : comparison.status === 'over'
  ? 'over budget ⚠'
  : comparison.status === 'warn'
  ? 'near limit'
  : 'on track'
```

```tsx
<div className="mt-1">
  <div className="h-1.5 w-full rounded bg-slate-700">
    <div
      className={`h-1.5 rounded transition-all ${barColor}`}
      style={{ width: `${Math.min(comparison.percentage, 100)}%` }}
    />
  </div>
  <p className={`text-xs mt-0.5 ${textColor}`}>
    {label} · spent KSh {comparison.actual.toLocaleString()}
  </p>
</div>
```

- [ ] **Step 4.4: Commit**

```bash
git add components/reports/BudgetManager.tsx
git commit -m "fix: BudgetManager field names (actual/limit), add progress bars with status colours"
```

---

## Task 5: Create BudgetMeters Component

**Files:**
- Create: `components/reports/BudgetMeters.tsx`

The spec defines `BudgetMeters` as a **separate read-only component** rendered in the Expenses section (not inside the modal). It shows progress bars per category for quick at-a-glance spend overview.

- [ ] **Step 5.1: Create BudgetMeters.tsx**

```typescript
'use client'

import { BudgetComparison } from '@/lib/budget-utils'

interface Props {
  comparisons: BudgetComparison[]
}

export function BudgetMeters({ comparisons }: Props) {
  if (comparisons.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-4">
      {comparisons.map((c) => {
        const barColor = c.status === 'over' ? 'bg-red-400'
          : c.status === 'warn' ? 'bg-amber-400'
          : 'bg-emerald-400'
        const textColor = c.status === 'over' ? 'text-red-400'
          : c.status === 'warn' ? 'text-amber-400'
          : c.limit === 0 ? 'text-slate-500'
          : 'text-emerald-400'
        const label = c.limit === 0 ? 'no budget'
          : c.status === 'over' ? 'over budget'
          : c.status === 'warn' ? 'near limit'
          : 'on track'

        return (
          <div key={c.category} className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400 capitalize mb-1">{c.category.replace('-', ' ')}</p>
            <div className="h-1.5 w-full rounded bg-slate-700 mb-1">
              <div
                className={`h-1.5 rounded ${barColor}`}
                style={{ width: `${Math.min(c.percentage, 100)}%` }}
              />
            </div>
            <p className={`text-xs ${textColor}`}>{label}</p>
            <p className="text-xs text-slate-500">
              {c.limit > 0 ? `KSh ${c.actual.toLocaleString()} / ${c.limit.toLocaleString()}` : `KSh ${c.actual.toLocaleString()} spent`}
            </p>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5.2: Wire into FinanceHub Expenses section**

In `components/reports/FinanceHub.tsx`, inside the Expenses section render, add `<BudgetMeters>` above the expense list:

```tsx
{activeSection === 'expenses' && (
  <>
    <BudgetMeters comparisons={comparisons} />
    <ExpenseList ... />
  </>
)}
```

Import: `import { BudgetMeters } from '@/components/reports/BudgetMeters'`

- [ ] **Step 5.3: Commit**

```bash
git add components/reports/BudgetMeters.tsx components/reports/FinanceHub.tsx
git commit -m "feat: add BudgetMeters component for inline category spend visualisation"
```

---

## Task 6: Fix FinanceHub — Period Mapping + Real Chart Data

**Files:**
- Modify: `components/reports/FinanceHub.tsx`
- Modify: `components/reports/RevenueExpenseChart.tsx`

- [ ] **Step 6.1: Read the current FinanceHub**

```bash
cat components/reports/FinanceHub.tsx
```

Look for: hardcoded `data` array passed to `RevenueExpenseChart`, `?period=` query strings.

- [ ] **Step 6.2: Add `getPeriodDateRange` and fix API calls**

Add at the top of the file:

```typescript
function getPeriodDateRange(period: 'today' | 'week' | 'month' | 'quarter') {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  switch (period) {
    case 'today': { const s = fmt(today); return { startDate: s, endDate: s } }
    case 'week': {
      const s = new Date(today); s.setDate(today.getDate() - 7)
      return { startDate: fmt(s), endDate: fmt(today) }
    }
    case 'month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      return { startDate: fmt(s), endDate: fmt(today) }
    }
    case 'quarter': {
      const q = Math.floor(today.getMonth() / 3)
      const s = new Date(today.getFullYear(), q * 3, 1)
      return { startDate: fmt(s), endDate: fmt(today) }
    }
  }
}
```

Replace `?period=${period}` with `?startDate=${startDate}&endDate=${endDate}` in all fetch calls. Use `const { startDate, endDate } = getPeriodDateRange(period)`.

- [ ] **Step 6.3: Add chart period state and real data for RevenueExpenseChart**

Add to FinanceHub state:

```typescript
const [chartDays, setChartDays] = useState(30)
const [chartStartDate, setChartStartDate] = useState('')
const [chartEndDate, setChartEndDate] = useState('')
```

Pass chart period change callback to `RevenueExpenseChart`:

```typescript
<RevenueExpenseChart
  onPeriodChange={(start, end) => {
    setChartStartDate(start)
    setChartEndDate(end)
  }}
/>
```

In `RevenueExpenseChart.tsx`, add `onPeriodChange?: (start: string, end: string) => void` to props. Call it after fetching data, passing the computed start/end dates. Replace any hardcoded `data` prop with internal fetch calls to `/api/reports/revenue?days=N` and `/api/expenses?startDate=&endDate=`.

- [ ] **Step 6.4: Pass chart dates to PLSummaryTable and ExportButtons**

```tsx
{/* In Reports section: */}
<PLSummaryTable data={plData} />    {/* PLSummaryTable takes data prop, not dates */}
<ExportButtons startDate={chartStartDate} endDate={chartEndDate} />
```

For `PLSummaryTable`: FinanceHub must fetch `/api/reports/accounting?startDate=${chartStartDate}&endDate=${chartEndDate}` when `chartStartDate` changes, and pass the result as the `data` prop.

- [ ] **Step 6.5: Commit**

```bash
git add components/reports/FinanceHub.tsx components/reports/RevenueExpenseChart.tsx
git commit -m "fix: FinanceHub period-to-date mapping, real chart data, PLSummaryTable wired"
```

---

## Task 7: Create ExportButtons Component

**Files:**
- Create: `components/reports/ExportButtons.tsx`

- [ ] **Step 7.1: Create the component**

```typescript
'use client'
import { Download, FileText } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  startDate: string
  endDate: string
}

export function ExportButtons({ startDate, endDate }: Props) {
  async function handleCSV() {
    if (!startDate || !endDate) { toast.error('No period selected'); return }
    try {
      const res = await fetch(`/api/reports/accounting?startDate=${startDate}&endDate=${endDate}`)
      if (!res.ok) throw new Error('Failed to fetch report')
      const { summary, expenseByCategory } = await res.json()

      const rows: (string | number)[][] = [
        ['Finance Report', `${startDate} to ${endDate}`],
        [],
        ['Metric', 'KSh'],
        ['Total Revenue', summary.totalIncome ?? 0],
        ['Total Expenses', summary.totalExpenses ?? 0],
        ['Net Profit', summary.netProfit ?? 0],
        ['Net VAT Payable', summary.netVat ?? 0],
        [],
        ['Category', 'Expenses (KSh)'],
        ...Object.entries(expenseByCategory ?? {}).map(([k, v]) => [k, v as number]),
      ]

      const csv = rows.map(r => r.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-${startDate}-${endDate}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      toast.error(err.message ?? 'Export failed')
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleCSV}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </button>
      <button
        onClick={() => window.print()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
      >
        <FileText className="w-4 h-4" />
        Export PDF
      </button>
    </div>
  )
}
```

- [ ] **Step 7.2: Confirm it renders in the Reports section**

Open `components/reports/FinanceHub.tsx` and ensure the Reports section contains:

```tsx
import { ExportButtons } from '@/components/reports/ExportButtons'
// ...
{activeSection === 'reports' && (
  <>
    <ExportButtons startDate={chartStartDate} endDate={chartEndDate} />
    <RevenueExpenseChart onPeriodChange={...} />
    <PLSummaryTable data={plData} />
  </>
)}
```

- [ ] **Step 7.3: Commit**

```bash
git add components/reports/ExportButtons.tsx components/reports/FinanceHub.tsx
git commit -m "feat: add ExportButtons (CSV Blob download + window.print PDF)"
```

---

## Task 8: Full Test Suite Verification

- [ ] **Step 8.1: Run all Finance Hub tests**

```bash
cd /home/elyees/D/reservations/reservations
npx vitest run __tests__/finance/
```

Expected: all GREEN. Fix any failures before continuing.

- [ ] **Step 8.2: Run the full test suite**

```bash
npx vitest run
```

Expected: no regressions.

- [ ] **Step 8.3: Manual smoke test**

1. Open `localhost:3000/admin` → Finance tab (key 3)
2. Verify KPI strip loads; click period buttons and watch values update
3. Add an expense with a receipt image → confirm upload completes and receipt link appears in list
4. Edit an expense and remove its receipt → confirm `receiptUrl: null` sent
5. Add an expense that exceeds a budget → confirm over-budget banner appears
6. Open BudgetManager → confirm progress bars and status colours appear; no runtime errors
7. Navigate to Reports → verify chart shows real data (not placeholder)
8. Click Export CSV → confirm file downloads with correct columns

- [ ] **Step 8.4: Commit final verification**

```bash
git add __tests__/finance/
git commit -m "test: Finance Hub all tests GREEN — Sub-project 1 complete"
```
