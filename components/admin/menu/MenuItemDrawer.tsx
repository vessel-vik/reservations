"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ImageUploadField } from './ImageUploadField';
import { TagInput } from './TagInput';
import { DietaryFlagPills } from './DietaryFlagPills';
import { ModifierGroupSelector } from './ModifierGroupSelector';

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
  modifierGroups?: any[]; // optional, fetched by parent MenuCMS
  onClose: () => void;
  onSaved: () => void;
}

export function MenuItemDrawer({ open, item, categories, modifierGroups = [], onClose, onSaved }: Props) {
  const isEdit = !!item;

  const [stagedImageFile, setStagedImageFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<MenuItemFormValues>({
    resolver: zodResolver(menuItemSchema),
    defaultValues: {
      name: item?.name || '',
      description: item?.description || '',
      price: item?.price || 0,
      categoryId: item?.category || '',
      imageUrl: item?.imageUrl || null,
      stock: item?.stock ?? null,
      lowStockThreshold: item?.lowStockThreshold ?? 5,
      isVegetarian: item?.isVegetarian ?? false,
      isVegan: item?.isVegan ?? false,
      isGlutenFree: item?.isGlutenFree ?? false,
      ingredients: item?.ingredients || [],
      allergens: item?.allergens || [],
      modifierGroupIds: item?.modifierGroupIds || [],
      vatCategory: item?.vatCategory || 'standard',
      preparationTime: item?.preparationTime ?? 10,
      calories: item?.calories || undefined,
    }
  });

  const imageUrl = watch('imageUrl');
  const watchIngredients = watch('ingredients') || [];
  const watchAllergens = watch('allergens') || [];
  const watchModifiers = watch('modifierGroupIds') || [];

  const flags = {
    isVegetarian: watch('isVegetarian') || false,
    isVegan: watch('isVegan') || false,
    isGlutenFree: watch('isGlutenFree') || false,
  };

  const onSubmit = async (data: MenuItemFormValues) => {
    // ── EDIT MODE ─────────────────────────────────────────────────
    if (isEdit) {
      if (stagedImageFile) {
        setIsUploading(true)
        const form = new FormData()
        form.append('file', stagedImageFile)
        try {
          const res = await fetch(`/api/menu/items/${item.$id}/image`, { method: 'POST', body: form })
          const json = await res.json()
          if (!res.ok) throw new Error(json.error ?? 'Image upload failed')
          data.imageUrl = json.imageUrl
        } catch (err: any) {
          toast.error(err.message ?? 'Image upload failed')
          setIsUploading(false)
          return
        }
        setIsUploading(false)
      }
      const res = await fetch(`/api/menu/items/${item.$id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to save item')
        return
      }
      toast.success('Item saved')
      onSaved()
      onClose()
      return
    }

    // ── CREATE MODE ────────────────────────────────────────────────
    let newItemId: string | null = null
    const { imageUrl: _, ...dataWithoutImage } = data as any
    const createRes = await fetch('/api/menu/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataWithoutImage),
    })
    const createJson = await createRes.json()
    if (!createRes.ok) {
      toast.error(createJson.error ?? 'Failed to create item')
      return
    }
    newItemId = createJson.item.$id

    // Upload image to newly created item (best-effort)
    if (stagedImageFile && newItemId) {
      setIsUploading(true)
      try {
        const form = new FormData()
        form.append('file', stagedImageFile)
        const imgRes = await fetch(`/api/menu/items/${newItemId}/image`, { method: 'POST', body: form })
        const imgJson = await imgRes.json()
        if (imgRes.ok) {
          await fetch(`/api/menu/items/${newItemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: imgJson.imageUrl }),
          })
        } else {
          toast.error('Item saved but image upload failed. Edit the item to add an image.')
        }
      } catch {
        toast.error('Item saved but image upload failed.')
      }
      setIsUploading(false)
    }

    toast.success('Item saved')
    onSaved()
    onClose()
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[700px] h-[90vh] flex flex-col p-0 gap-0 bg-slate-900 border-slate-700">
        <DialogHeader className="p-6 pb-4 border-b border-slate-700">
          <DialogTitle className="text-xl font-bold text-slate-100">
            {isEdit ? `Edit — ${item.name}` : 'Add New Menu Item'}
          </DialogTitle>
        </DialogHeader>

        <form id="menu-item-form" onSubmit={handleSubmit(onSubmit)} className="p-6 flex-1 overflow-y-auto space-y-8">

          <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-200 border-b border-slate-800 pb-2">Core Details</h3>

            <ImageUploadField
              currentUrl={imageUrl}
              onFileStaged={(file) => setStagedImageFile(file)}
              onRemoved={() => { setStagedImageFile(null); setValue('imageUrl', null) }}
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
