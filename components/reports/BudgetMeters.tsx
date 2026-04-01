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
        const barColor =
          c.status === 'over' ? 'bg-red-400'
          : c.status === 'warn' ? 'bg-amber-400'
          : 'bg-emerald-400'
        const textColor =
          c.status === 'over' ? 'text-red-400'
          : c.status === 'warn' ? 'text-amber-400'
          : c.limit === 0 ? 'text-slate-500'
          : 'text-emerald-400'
        const label =
          c.limit === 0 ? 'no budget'
          : c.status === 'over' ? 'over budget'
          : c.status === 'warn' ? 'near limit'
          : 'on track'

        return (
          <div key={c.category} className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400 capitalize mb-1">
              {c.category.replace(/_/g, ' ')}
            </p>
            <div className="h-1.5 w-full rounded bg-slate-700 mb-1">
              <div
                className={`h-1.5 rounded ${barColor}`}
                style={{ width: `${Math.min(c.percentage, 100)}%` }}
              />
            </div>
            <p className={`text-xs ${textColor}`}>{label}</p>
            <p className="text-xs text-slate-500">
              {c.limit > 0
                ? `KSh ${c.actual.toLocaleString()} / ${c.limit.toLocaleString()}`
                : `KSh ${c.actual.toLocaleString()} spent`}
            </p>
          </div>
        )
      })}
    </div>
  )
}
