"use client";

import { useState, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ReceiptUpload } from './ReceiptUpload';
import { createExpense, updateExpense } from '@/lib/actions/expense.actions';
import { ExpenseCategory, EXPENSE_CATEGORY_LABELS } from '@/types/pos.types';

const createExpenseSchema = z.object({
  supplierName: z.string().min(2, "Supplier name must be at least 2 characters").max(200),
  category: z.string().min(1, "Category is required"),
  description: z.string().min(5, "Description must be at least 5 characters").max(1000),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  vatCategory: z.enum(["standard", "zero-rated", "exempt"]),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  supplierTin: z.string().max(20).optional(),
  invoiceNumber: z.string().max(100).optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  receiptUrl: z.string().nullable().optional()
}).refine(
  (d) => !d.dueDate || !d.invoiceDate || d.dueDate >= d.invoiceDate,
  { message: 'Due date must be on or after invoice date', path: ['dueDate'] }
);

type ExpenseFormValues = z.infer<typeof createExpenseSchema>;

interface Props {
  open: boolean;
  expense: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ExpenseDrawer({ open, expense, onClose, onSaved }: Props) {
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { register, handleSubmit, setValue, watch, control, formState: { errors, isSubmitting } } = useForm<ExpenseFormValues>({
    resolver: zodResolver(createExpenseSchema),
    defaultValues: {
      supplierName: expense?.supplierName || '',
      category: expense?.category || 'food_supplies',
      description: expense?.description || '',
      amount: expense?.amount || 0,
      vatCategory: expense?.vatCategory || 'standard',
      invoiceDate: expense?.invoiceDate || new Date().toISOString().split('T')[0],
      supplierTin: expense?.supplierTin || '',
      invoiceNumber: expense?.invoiceNumber || '',
      dueDate: expense?.dueDate || '',
      notes: expense?.notes || '',
      receiptUrl: expense?.receiptUrl || null,
    }
  });

  const receiptUrl = watch('receiptUrl');

  const amount = useWatch({ control, name: 'amount', defaultValue: 0 });
  const vatCategory = useWatch({ control, name: 'vatCategory', defaultValue: 'standard' });

  const vatPreview = useMemo(() => {
    const base = Number(amount) || 0;
    const rate = vatCategory === 'standard' ? 0.16 : 0;
    return { vat: base * rate, total: base + base * rate };
  }, [amount, vatCategory]);

  const onSubmit = async (data: ExpenseFormValues) => {
    // ── Step 1: Upload receipt if staged ───────────────────────
    let receiptUrl: string | null = (data as any).receiptUrl ?? expense?.receiptUrl ?? null;

    if (stagedFile) {
      setIsUploading(true);
      const form = new FormData();
      form.append('file', stagedFile);
      try {
        const res = await fetch('/api/expenses/upload', { method: 'POST', body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Upload failed');
        receiptUrl = json.receiptUrl;
      } catch (err: any) {
        toast.error(err.message ?? 'Upload failed');
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    // ── Step 2: Save expense ────────────────────────────────────
    try {
      const payload = { ...data, receiptUrl };
      if (expense) {
        const res = await updateExpense(expense.$id, payload as any);
        if (res.success) {
          toast.success('Expense updated successfully');
          onSaved();
          onClose();
        } else {
          toast.error(res.error || 'Failed to update expense');
        }
      } else {
        const res = await createExpense(payload as any);
        if (res.success) {
          toast.success('Expense created successfully');
          onSaved();
          onClose();
        } else {
          toast.error(res.error || 'Failed to create expense');
        }
      }
    } catch {
      toast.error('An unexpected error occurred');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[600px] h-[90vh] flex flex-col p-0 gap-0 bg-slate-900 border-slate-700">
        <DialogHeader className="p-6 pb-4 border-b border-slate-700">
          <DialogTitle className="text-xl font-bold text-slate-100">
            {expense ? 'Edit Expense' : 'Add New Expense'}
          </DialogTitle>
        </DialogHeader>
        
        <form id="expense-form" onSubmit={handleSubmit(onSubmit)} className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="supplierName" className="text-slate-400">Supplier Name</Label>
              <Input id="supplierName" {...register('supplierName')} className="bg-slate-800 border-slate-700 text-slate-100" />
              {errors.supplierName && <p className="text-xs text-red-400 font-medium">{errors.supplierName.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category" className="text-slate-400">Category</Label>
              <select 
                id="category" 
                {...register('category')} 
                className="w-full h-10 px-3 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-red-400 font-medium">{errors.category.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-slate-400">Amount (Excl. VAT)</Label>
              <Input id="amount" type="number" step="0.01" {...register('amount')} className="bg-slate-800 border-slate-700 text-slate-100" />
              {errors.amount && <p className="text-xs text-red-400 font-medium">{errors.amount.message}</p>}
              {vatPreview.vat > 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  VAT (16%): KSh {vatPreview.vat.toLocaleString()} · Total: KSh {vatPreview.total.toLocaleString()}
                </p>
              )}
              {vatPreview.vat === 0 && Number(amount) > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  VAT: KSh 0 · Total: KSh {Number(amount).toLocaleString()}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vatCategory" className="text-slate-400">VAT Category (Kenya)</Label>
              <select 
                id="vatCategory" 
                {...register('vatCategory')} 
                className="w-full h-10 px-3 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="standard">Standard (16%)</option>
                <option value="zero-rated">Zero Rated (0%)</option>
                <option value="exempt">Exempt (0%)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber" className="text-slate-400">Invoice #</Label>
              <Input id="invoiceNumber" {...register('invoiceNumber')} className="bg-slate-800 border-slate-700 text-slate-100" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoiceDate" className="text-slate-400">Invoice Date</Label>
              <Input id="invoiceDate" type="date" {...register('invoiceDate')} className="bg-slate-800 border-slate-700 text-slate-100" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="supplierTin" className="text-slate-400">Supplier TIN</Label>
              <Input id="supplierTin" {...register('supplierTin')} className="bg-slate-800 border-slate-700 text-slate-100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate" className="text-slate-400">Due Date</Label>
              <Input id="dueDate" type="date" {...register('dueDate')} className="bg-slate-800 border-slate-700 text-slate-100" />
              {errors.dueDate && <p className="text-xs text-red-400 font-medium">{errors.dueDate.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-slate-400">Description</Label>
            <Textarea 
              id="description" 
              {...register('description')} 
              className="bg-slate-800 border-slate-700 text-slate-100 min-h-[80px]" 
              placeholder="What was purchased?"
            />
            {errors.description && <p className="text-xs text-red-400 font-medium">{errors.description.message}</p>}
          </div>

          <ReceiptUpload
            currentUrl={receiptUrl}
            onFileStaged={setStagedFile}
            onRemoved={() => { setStagedFile(null); setValue('receiptUrl', null) }}
          />

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-slate-400">Additional Notes</Label>
            <Textarea 
              id="notes" 
              {...register('notes')} 
              className="bg-slate-800 border-slate-700 text-slate-100 min-h-[60px]" 
            />
          </div>
        </form>

        <div className="p-6 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/50">
          <Button type="button" variant="outline" onClick={onClose} className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            Cancel
          </Button>
          <Button
            form="expense-form"
            type="submit"
            disabled={isUploading || isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[120px]"
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
              </span>
            ) : isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </span>
            ) : (
              expense ? 'Update Expense' : 'Save Expense'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
