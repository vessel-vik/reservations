"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { fetchWithSession } from '@/lib/fetch-with-session';

interface Props {
  open: boolean;
  item: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export function StockAdjustmentModal({ open, item, onClose, onSaved }: Props) {
  const [newStock, setNewStock] = useState<number>(item?.stock ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) {
      setNewStock(item.stock ?? 0);
    }
  }, [open, item?.$id, item?.stock]);

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await fetchWithSession(`/api/menu/items/${item.$id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: newStock }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[380px] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">
            Adjust Stock — <span className="text-emerald-400">{item?.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-400">New Stock Count</Label>
            <Input
              type="number"
              min={0}
              value={newStock}
              onChange={(e) => setNewStock(parseInt(e.target.value) || 0)}
              className="bg-slate-800 border-slate-700 text-slate-100 text-lg"
            />
            {newStock <= 0 && (
              <p className="text-xs text-yellow-400">⚠️ Setting to 0 will auto-disable this item</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="border-slate-700 text-slate-400">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[100px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
