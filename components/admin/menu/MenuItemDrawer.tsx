"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useUser } from '@clerk/nextjs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ImageUploadField } from './ImageUploadField';
import { TagInput } from './TagInput';
import { DietaryFlagPills } from './DietaryFlagPills';
import { ModifierGroupSelector } from './ModifierGroupSelector';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { itemDocToFormSnapshot, snapshotToFormSnapshot, type MenuItemFormSnapshot } from '@/lib/menu-item-form';
import { fetchWithSession } from '@/lib/fetch-with-session';

const menuItemSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(200),
  description: z.string().max(2000).optional(),
  price: z.coerce.number().positive('Price must be greater than 0'),
  categoryId: z.string().min(1, 'Category is required'),
  imageUrl: z.string().nullable().optional(),
  stock: z.coerce.number().nullable().optional(),
  lowStockThreshold: z.coerce.number().optional(),
  isVegetarian: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  isGlutenFree: z.boolean().optional(),
  ingredients: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional(),
  modifierGroupIds: z.array(z.string()).optional(),
  vatCategory: z.enum(['standard', 'zero-rated', 'exempt']).optional(),
  preparationTime: z.coerce.number().optional(),
  calories: z.coerce.number().optional(),
});

type MenuItemFormValues = z.infer<typeof menuItemSchema>;

interface Props {
  open: boolean;
  item: any | null;
  categories: any[];
  modifierGroups?: any[];
  onClose: () => void;
  onSaved: () => void;
}

async function recordMenuItemVersion(
  itemId: string,
  formValues: MenuItemFormSnapshot,
  publisher: { id: string; label: string }
) {
  const listRes = await fetchWithSession(`/api/menu/items/${itemId}/versions`);
  if (!listRes.ok) return;
  const data = await listRes.json();
  const versions = (data.versions || []) as { versionNumber?: number }[];
  const maxV = versions.reduce((m, v) => Math.max(m, Number(v.versionNumber) || 0), 0);
  const next = maxV + 1;

  const postRes = await fetchWithSession(`/api/menu/items/${itemId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      formValues,
      versionNumber: next,
      userId: publisher.id,
      userName: publisher.label,
    }),
  });
  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({}));
    console.warn('Menu item version snapshot failed:', err);
  }
}

export function MenuItemDrawer({ open, item, categories, modifierGroups = [], onClose, onSaved }: Props) {
  const isEdit = !!item;
  const { user } = useUser();

  const [stagedImageFile, setStagedImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const publisher = {
    id: user?.id ?? '',
    label:
      user?.fullName ||
      user?.primaryEmailAddress?.emailAddress ||
      user?.username ||
      'Admin',
  };

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<MenuItemFormValues>({
    resolver: zodResolver(menuItemSchema),
    defaultValues: itemDocToFormSnapshot(item),
  });

  useEffect(() => {
    if (!open) return;
    reset(itemDocToFormSnapshot(item));
    setStagedImageFile(null);
    setHistoryOpen(false);
  }, [open, item?.$id, reset]);

  const imageUrl = watch('imageUrl');
  const watchIngredients = watch('ingredients') || [];
  const watchAllergens = watch('allergens') || [];
  const watchModifiers = watch('modifierGroupIds') || [];

  const flags = {
    isVegetarian: watch('isVegetarian') || false,
    isVegan: watch('isVegan') || false,
    isGlutenFree: watch('isGlutenFree') || false,
  };

  const onRevertSnapshot = useCallback((raw: Record<string, unknown>) => {
    const normalized = snapshotToFormSnapshot(raw);
    reset(normalized);
    toast.message('Draft loaded from history — press Update Item to save.');
  }, [reset]);

  const onSubmit = async (data: MenuItemFormValues) => {
    const snapshotPayload: MenuItemFormSnapshot = { ...data };

    if (isEdit) {
      if (stagedImageFile) {
        setIsUploading(true);
        const form = new FormData();
        form.append('file', stagedImageFile);
        try {
          const res = await fetchWithSession(`/api/menu/items/${item.$id}/image`, { method: 'POST', body: form });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? 'Image upload failed');
          data.imageUrl = json.imageUrl;
          snapshotPayload.imageUrl = json.imageUrl;
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Image upload failed');
          setIsUploading(false);
          return;
        }
        setIsUploading(false);
      }
      const res = await fetchWithSession(`/api/menu/items/${item.$id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(res.status === 401 ? 'Sign in to save changes' : json.error || 'Failed to save item');
        return;
      }
      try {
        await recordMenuItemVersion(item.$id, snapshotPayload, publisher);
      } catch (e) {
        console.warn('Version snapshot:', e);
      }
      toast.success('Item saved');
      onSaved();
      onClose();
      return;
    }

    let newItemId: string | null = null;
    const { imageUrl: _, ...dataWithoutImage } = data as MenuItemFormValues & { imageUrl?: unknown };
    const createRes = await fetchWithSession('/api/menu/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataWithoutImage),
    });
    const createJson = await createRes.json();
    if (!createRes.ok) {
      toast.error(createRes.status === 401 ? 'Sign in to save changes' : createJson.error ?? 'Failed to create item');
      return;
    }
    newItemId = createJson.item.$id;

    let merged: MenuItemFormSnapshot = itemDocToFormSnapshot(createJson.item);

    if (stagedImageFile && newItemId) {
      setIsUploading(true);
      try {
        const form = new FormData();
        form.append('file', stagedImageFile);
        const imgRes = await fetchWithSession(`/api/menu/items/${newItemId}/image`, { method: 'POST', body: form });
        const imgJson = await imgRes.json();
        if (imgRes.ok) {
          await fetchWithSession(`/api/menu/items/${newItemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: imgJson.imageUrl }),
          });
          merged = { ...merged, imageUrl: imgJson.imageUrl };
        } else {
          toast.error('Item saved but image upload failed. Edit the item to add an image.');
        }
      } catch {
        toast.error('Item saved but image upload failed.');
      }
      setIsUploading(false);
    }

    try {
      if (newItemId) await recordMenuItemVersion(newItemId, merged, publisher);
    } catch (e) {
      console.warn('Version snapshot:', e);
    }

    toast.success('Item saved');
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[700px] h-[90vh] flex flex-col p-0 gap-0 bg-slate-900 border-slate-700">
        <DialogHeader className="p-6 pb-4 border-b border-slate-700">
          <DialogTitle className="text-xl font-bold text-slate-100">
            {isEdit ? `Edit — ${item?.name ?? 'Item'}` : 'Add New Menu Item'}
          </DialogTitle>
        </DialogHeader>

        <form id="menu-item-form" onSubmit={handleSubmit(onSubmit)} className="p-6 flex-1 overflow-y-auto space-y-8">

          <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-200 border-b border-slate-800 pb-2">Core Details</h3>

            <ImageUploadField
              currentUrl={imageUrl}
              onFileStaged={(file) => setStagedImageFile(file)}
              onRemoved={() => { setStagedImageFile(null); setValue('imageUrl', null); }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2 space-y-2">
                <Label className="text-slate-400">Item Name</Label>
                <Input {...register('name')} className="bg-slate-800 border-slate-700 text-slate-100" />
                {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-slate-400">Price (KSh)</Label>
                <Input type="number" step="0.01" {...register('price')} className="bg-slate-800 border-slate-700 text-slate-100" />
                {errors.price && <p className="text-xs text-red-400">{errors.price.message}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-slate-400">Category</Label>
                <select {...register('categoryId')} className="w-full h-10 px-3 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm">
                  <option value="">Select category</option>
                  {categories.map(c => (
                    <option key={c.$id} value={c.$id}>{c.label || c.name}</option>
                  ))}
                </select>
                {errors.categoryId && <p className="text-xs text-red-400">{errors.categoryId.message}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-slate-400">Initial Stock</Label>
                <Input type="number" min={0} placeholder="Blank to disable" {...register('stock')} className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-400">Low Stock Alert at</Label>
                <Input type="number" min={1} {...register('lowStockThreshold')} className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-400">Description</Label>
              <Textarea {...register('description')} className="bg-slate-800 border-slate-700 text-slate-100 min-h-[80px]" />
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-200 border-b border-slate-800 pb-2">Preparation & Dietary</h3>

            <div className="space-y-3">
              <Label className="text-slate-400">Dietary Flags</Label>
              <DietaryFlagPills
                flags={flags}
                onChange={(f) => {
                  setValue('isVegetarian', f.isVegetarian);
                  setValue('isVegan', f.isVegan);
                  setValue('isGlutenFree', f.isGlutenFree);
                }}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-slate-400">Ingredients</Label>
              <TagInput
                tags={watchIngredients}
                onChange={(tags) => setValue('ingredients', tags)}
                placeholder="e.g. Flour, Sugar..."
              />
            </div>

            <div className="space-y-3">
              <Label className="text-slate-400">Allergens</Label>
              <TagInput
                tags={watchAllergens}
                onChange={(tags) => setValue('allergens', tags)}
                placeholder="e.g. Nuts, Dairy..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label className="text-slate-400">Prep Time (m)</Label>
                <Input type="number" min={0} {...register('preparationTime')} className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-400">Calories kcal</Label>
                <Input type="number" min={0} {...register('calories')} className="bg-slate-800 border-slate-700 text-slate-100" />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-400">VAT Policy</Label>
                <select {...register('vatCategory')} className="w-full h-10 px-3 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm flex-1">
                  <option value="standard">Standard (16%)</option>
                  <option value="zero-rated">Zero Rated (0%)</option>
                  <option value="exempt">Exempt</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-200 border-b border-slate-800 pb-2">Modifiers & Add-ons</h3>
            <ModifierGroupSelector
              attachedGroupIds={watchModifiers}
              allGroups={modifierGroups}
              onChange={(ids) => setValue('modifierGroupIds', ids)}
            />
          </div>

          {isEdit && item?.$id && (
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setHistoryOpen(!historyOpen)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-200 hover:bg-slate-800/50"
              >
                <span>Publish history & revert</span>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
              </button>
              {historyOpen && (
                <div className="border-t border-slate-700/80 px-2 pb-4">
                  <VersionHistoryPanel itemId={item.$id} onRevert={onRevertSnapshot} />
                </div>
              )}
            </div>
          )}

        </form>

        <div className="p-6 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/50">
          <Button type="button" variant="outline" onClick={onClose} className="border-slate-700 text-slate-400 hover:bg-slate-800">
            Cancel
          </Button>
          <Button form="menu-item-form" type="submit" disabled={isUploading || isSubmitting} className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[120px]">
            {isUploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
              </span>
            ) : isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              isEdit ? 'Update Item' : 'Create Item'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
