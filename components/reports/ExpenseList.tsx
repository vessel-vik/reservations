import { Expense } from "@/types/pos.types";
import { BudgetComparison } from "@/lib/budget-utils";
import { Receipt } from "lucide-react";

interface Props {
  expenses: Expense[];
  comparisons: BudgetComparison[];
  loading: boolean;
  onEdit: (exp: Expense) => void;
}

export function ExpenseList({ expenses, comparisons, loading, onEdit }: Props) {
  if (loading) return <div className="p-8 text-center text-slate-400">Loading expenses...</div>;
  if (expenses.length === 0) return <div className="p-8 text-center text-slate-400">No expenses found for this period.</div>;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-400">
          <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-700/50">
            <tr>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">Supplier</th>
              <th className="px-6 py-3">Category</th>
              <th className="px-6 py-3 text-right">Amount</th>
              <th className="px-6 py-3 text-center">Receipt</th>
              <th className="px-6 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense.$id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                <td className="px-6 py-4">{expense.invoiceDate}</td>
                <td className="px-6 py-4 font-medium text-slate-200">{expense.supplierName}</td>
                <td className="px-6 py-4 capitalize">{expense.category.replace('_', ' ')}</td>
                <td className="px-6 py-4 text-right">KSh {expense.amount.toLocaleString()}</td>
                <td className="px-6 py-4 text-center">
                  {expense.receiptUrl ? (
                    <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-blue-400 hover:text-blue-300">
                      <Receipt className="w-4 h-4 mr-1" /> View
                    </a>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  <button onClick={() => onEdit(expense)} className="text-emerald-400 hover:text-emerald-300 font-medium">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
