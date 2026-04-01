import { BudgetComparison } from '@/lib/budget-utils';
import { AlertTriangle } from 'lucide-react';

export function BudgetAlertBanner({ overBudgetCategories }: { overBudgetCategories: BudgetComparison[] }) {
  if (!overBudgetCategories || overBudgetCategories.length === 0) {
    return null;
  }

  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 flex items-start gap-3">
      <AlertTriangle className="text-red-400 w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <h3 className="text-red-400 font-medium mb-1">Over Budget Alert</h3>
        <p className="text-slate-300 text-sm mb-2">
          The following categories have exceeded their monthly limits:
        </p>
        <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
          {overBudgetCategories.map((item) => (
            <li key={item.category}>
              <span className="capitalize font-medium text-slate-200">{item.category}</span>
              {' — '}
              <span className="text-red-300">over by KSh {item.overage.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
