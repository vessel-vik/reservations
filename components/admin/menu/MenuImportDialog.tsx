"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import MenuImport from "@/components/admin/MenuImport";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Optional bulk JSON import — kept for one-off migrations; primary workflow is Menu & Stock inline editing. */
export function MenuImportDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700 text-slate-100 p-6">
        <p className="text-xs text-slate-500 mb-4">
          Optional: bulk JSON import for migrations. Prefer the card grid or table for daily stock and price updates.
        </p>
        <MenuImport />
      </DialogContent>
    </Dialog>
  );
}
