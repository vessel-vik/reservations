"use client";

import { useState, useEffect } from 'react';
import { createCategory, updateCategory, deleteCategory } from '@/lib/actions/menu.actions';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, GripVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  categories: any[];
  onRefresh: () => void;
  /** Increment from parent (e.g. toolbar "New Category") to open the add row */
  triggerAddTick?: number;
}

export function CategoriesSection({ categories, onRefresh, triggerAddTick = 0 }: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [localCategories, setLocalCategories] = useState(categories);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => { setLocalCategories(categories); }, [categories]);

  useEffect(() => {
    if (triggerAddTick > 0) setAdding(true);
  }, [triggerAddTick]);

  const handleDragStart = (i: number) => setDragIndex(i);

  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    const reordered = [...localCategories];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(i, 0, moved);
    setLocalCategories(reordered);
    setDragIndex(i);
  };

  const handleDrop = async () => {
    if (dragIndex === null) return;
    setDragIndex(null);
    const prev = categories;
    try {
      await Promise.all(
        localCategories.map((cat, idx) => updateCategory(cat.$id, { index: idx }))
      );
      onRefresh();
    } catch {
      setLocalCategories(prev);
      toast.error('Failed to reorder categories');
    }
  };

  const handleAddCategory = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const slug = newName.toLowerCase().replace(/\s+/g, '_');
      await createCategory({
        name: slug,
        label: newName.trim(),
        slug,
        index: categories.length,
      });
      setNewName('');
      setAdding(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (catId: string) => {
    setDeletingId(catId);
    try {
      const result = await deleteCategory(catId);
      if (!result.success) {
        alert(result.error || 'Cannot delete category');
      } else {
        onRefresh();
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="font-semibold text-slate-100">Menu Categories</h3>
        <Button onClick={() => setAdding(true)} size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white">
          <Plus className="w-3.5 h-3.5" /> Add Category
        </Button>
      </div>

      <ul className="divide-y divide-slate-700/50">
        {localCategories.map((cat, i) => (
          <li
            key={cat.$id}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={handleDrop}
            className={`flex items-center gap-4 px-4 py-3 hover:bg-slate-700/20 transition-opacity ${dragIndex === i ? 'opacity-40' : ''}`}
          >
            <GripVertical className="w-4 h-4 text-slate-600 cursor-grab" />
            <div className="flex-1">
              <p className="font-medium text-slate-200">{cat.label || cat.name}</p>
              <p className="text-xs text-slate-500">{cat.slug}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${cat.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
              {cat.isActive ? 'Active' : 'Hidden'}
            </span>
            <button
              onClick={() => handleDelete(cat.$id)}
              disabled={deletingId === cat.$id}
              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
            >
              {deletingId === cat.$id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="p-4 border-t border-slate-700/50 bg-slate-800/50 flex gap-3">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Category name (e.g. Small Plates)"
            className="bg-slate-800 border-slate-700 text-slate-100"
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
          />
          <Button onClick={handleAddCategory} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setAdding(false)} className="border-slate-700 text-slate-400 shrink-0">
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
