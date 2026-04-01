'use client'

import { Download, FileText } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  startDate: string
  endDate: string
}

export function ExportButtons({ startDate, endDate }: Props) {
  async function handleCSV() {
    if (!startDate || !endDate) {
      toast.error('No period selected')
      return
    }
    try {
      const res = await fetch(
        `/api/reports/accounting?startDate=${startDate}&endDate=${endDate}`
      )
      if (!res.ok) throw new Error('Failed to fetch report')
      const { summary, expenseByCategory } = await res.json()

      const rows: (string | number)[][] = [
        ['Finance Report', `${startDate} to ${endDate}`],
        [],
        ['Metric', 'KSh'],
        ['Total Revenue', summary?.totalIncome ?? 0],
        ['Total Expenses', summary?.totalExpenses ?? 0],
        ['Net Profit', summary?.netProfit ?? 0],
        ['Net VAT Payable', summary?.netVat ?? 0],
        [],
        ['Category', 'Expenses (KSh)'],
        ...Object.entries(expenseByCategory ?? {}).map(([k, v]) => [k, v as number]),
      ]

      const csv = rows.map((r) => r.join(',')).join('\n')
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
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </button>
      <button
        onClick={() => window.print()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
      >
        <FileText className="w-4 h-4" />
        Export PDF
      </button>
    </div>
  )
}
