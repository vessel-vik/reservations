"use client";

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PLDataRow {
  period: string;
  revenue: number;
  expenses: number;
  vatCollected?: number;
  vatPaid?: number;
  profit: number;
}

interface Props {
  data: PLDataRow[];
}

export function PLSummaryTable({ data }: Props) {
  if (data.length === 0) {
    return null;
  }

  // Calculate totals
  const totals = data.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      expenses: acc.expenses + row.expenses,
      profit: acc.profit + row.profit,
    }),
    { revenue: 0, expenses: 0, profit: 0 }
  );

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="font-semibold text-slate-100">Profit & Loss Summary Statement</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-400">
          <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-700/50">
            <tr>
              <th className="px-6 py-4">Financial Period</th>
              <th className="px-6 py-4 text-right">Gross Revenue</th>
              <th className="px-6 py-4 text-right">Total Expenses</th>
              <th className="px-6 py-4 text-right font-medium text-blue-400">Net Profit</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                <td className="px-6 py-4 font-medium text-slate-200">{row.period}</td>
                <td className="px-6 py-4 text-right text-emerald-400 font-mono">
                  + KSh {row.revenue.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-red-400 font-mono">
                  - KSh {row.expenses.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-200 font-mono">
                  KSh {row.profit.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-900/80 font-semibold text-slate-200 border-t-2 border-slate-700">
            <tr>
              <td className="px-6 py-5">Aggregated Totals</td>
              <td className="px-6 py-5 text-right text-emerald-400 font-mono">
                + KSh {totals.revenue.toLocaleString()}
              </td>
              <td className="px-6 py-5 text-right text-red-400 font-mono">
                - KSh {totals.expenses.toLocaleString()}
              </td>
              <td className="px-6 py-5 text-right font-mono text-blue-400 text-lg">
                KSh {totals.profit.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
