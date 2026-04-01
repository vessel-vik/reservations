import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { BudgetComparison } from '@/lib/budget-utils';
import { upsertBudget } from '@/lib/actions/budget.actions';

interface Props {
  open: boolean;
  comparisons: BudgetComparison[];
  onClose: () => void;
  onSaved: () => void;
}

export function BudgetManager({ open, comparisons, onClose, onSaved }: Props) {
  const [limits, setLimits] = useState<Record<string, number>>(
    Object.fromEntries(comparisons.map((c) => [c.category, c.monthlyLimit]))
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const date = new Date();
    const currentMonth = date.getMonth() + 1;
    const currentYear = date.getFullYear();

    try {
      const promises = Object.entries(limits).map(([category, limit]) => 
        upsertBudget({ category, monthlyLimit: limit || 0, month: currentMonth, year: currentYear })
      );
      
      await Promise.all(promises);
      onSaved();
      onClose();
    } catch (e) {
      console.error('Failed to save budgets', e);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (category: string, val: string) => {
    setLimits(prev => ({ ...prev, [category]: parseInt(val) || 0 }));
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[500px] h-[80vh] flex flex-col p-0 gap-0 bg-slate-900 border-slate-700">
        <DialogHeader className="p-6 pb-4 border-b border-slate-700">
          <DialogTitle className="text-xl font-bold text-slate-100">Set Monthly Budgets</DialogTitle>
          <DialogDescription className="text-slate-400">
            Define limits per category to receive over-budget warnings. Limit applies to the current calendar month.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {comparisons.map((c) => (
            <div key={c.category} className="space-y-2">
              <Label className="text-slate-300 capitalize flex justify-between">
                <span>{c.category.replace('_', ' ')}</span>
                <span className="text-slate-500 font-normal">Actual: KSh {c.actualSpent.toLocaleString()}</span>
              </Label>
              <Input
                type="number"
                min={0}
                value={limits[c.category] || 0}
                onChange={(e) => handleChange(c.category, e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/50">
          <Button type="button" variant="outline" onClick={onClose} className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[120px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Budgets'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
