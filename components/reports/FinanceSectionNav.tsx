import { Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  activeSection: 'expenses' | 'vat' | 'reports';
  onSectionChange: (section: 'expenses' | 'vat' | 'reports') => void;
  onAddExpense: () => void;
  onSetBudgets: () => void;
}

export function FinanceSectionNav({ activeSection, onSectionChange, onAddExpense, onSetBudgets }: Props) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
      <div className="flex bg-slate-800/80 p-1.5 rounded-xl border border-slate-700/50 backdrop-blur-sm self-stretch sm:self-auto">
        <button
          onClick={() => onSectionChange('expenses')}
          className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeSection === 'expenses'
              ? 'bg-slate-700 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          Expenses & Budgets
        </button>
        <button
          onClick={() => onSectionChange('vat')}
          className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeSection === 'vat'
              ? 'bg-slate-700 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          Kenya eTIMS / VAT
        </button>
        <button
          onClick={() => onSectionChange('reports')}
          className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeSection === 'reports'
              ? 'bg-slate-700 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          P&L Reports
        </button>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto">
        <Button 
          variant="outline" 
          onClick={onSetBudgets}
          className="flex-1 sm:flex-none gap-2 bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-slate-100"
        >
          <Settings className="w-4 h-4" />
          Set Budgets
        </Button>
        <Button 
          onClick={onAddExpense}
          className="flex-1 sm:flex-none gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          <Plus className="w-4 h-4" />
          Add Expense
        </Button>
      </div>
    </div>
  );
}
