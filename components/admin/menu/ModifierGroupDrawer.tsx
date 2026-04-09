"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithSession } from '@/lib/fetch-with-session';

interface Props {
  open: boolean;
  group: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ModifierGroupDrawer({ open, group, onClose, onSaved }: Props) {
  const isEdit = !!group;
  const [name, setName] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [maxSelections, setMaxSelections] = useState(1);
  const [options, setOptions] = useState<{ name: string; price: string }[]>([
    { name: '', price: '0' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [defaultOptionIndex, setDefaultOptionIndex] = useState<number>(-1);

  useEffect(() => {
    if (open) {
      if (group) {
        setName(group.name);
        setIsRequired(group.isRequired);
        setMaxSelections(group.maxSelections);
        setOptions(group.options.map((opt: string) => {
          const [n, p] = opt.split(':');
          return { name: n, price: p };
        }));
        setDefaultOptionIndex(group.defaultOptionIndex ?? -1);
      } else {
        setName('');
        setIsRequired(false);
        setMaxSelections(1);
        setOptions([{ name: '', price: '0' }]);
        setDefaultOptionIndex(-1);
      }
    }
  }, [open, group]);

  useEffect(() => {
    if (!isRequired) setDefaultOptionIndex(-1);
  }, [isRequired]);

  const addOption = () => setOptions([...options, { name: '', price: '0' }]);
  
  const updateOption = (index: number, field: 'name' | 'price', value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setOptions(newOptions);
  };

  const removeOption = (index: number) => {
    if (options.length > 1) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const validate = () => {
    if (!name.trim()) return "Group name is required.";
    if (maxSelections < 1) return "Max selections must be at least 1.";
    for (const opt of options) {
      if (!opt.name.trim()) return "All options must have a name.";
      if (opt.name.includes(':')) return "Option names cannot contain a colon (:)";
      const p = parseFloat(opt.price);
      if (isNaN(p) || p < 0) return "Prices must be 0 or positive.";
    }
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setIsSubmitting(true);
    const serializedOptions = options.map(opt => `${opt.name.trim()}:${opt.price || '0'}`);

    const payload = {
      name: name.trim(),
      isRequired,
      maxSelections,
      options: serializedOptions,
      defaultOptionIndex,
    };

    try {
      const url = isEdit ? `/api/menu/modifiers/${group.$id}` : '/api/menu/modifiers';
      const res = await fetchWithSession(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error('Failed to save');
      
      toast.success(isEdit ? 'Group updated' : 'Group created');
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Failed to save group');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[500px] h-[90vh] flex flex-col p-0 gap-0 bg-slate-900 border-slate-700">
        <DialogHeader className="p-6 pb-4 border-b border-slate-700">
          <DialogTitle className="text-xl font-bold text-slate-100">
            {isEdit ? 'Edit Modifier Group' : 'New Modifier Group'}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="space-y-2">
            <Label className="text-slate-400">Group Name</Label>
            <Input 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Cooking Preference, Add-ons" 
              className="bg-slate-800 border-slate-700 text-slate-100" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <Label className="text-slate-400">Required Selection</Label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                <input 
                  type="checkbox" 
                  checked={isRequired}
                  onChange={e => setIsRequired(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700" 
                />
                Customer must choose
              </label>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400">Max Selections</Label>
              <Input 
                type="number" 
                min={1} 
                value={maxSelections}
                onChange={e => setMaxSelections(parseInt(e.target.value) || 1)}
                className="bg-slate-800 border-slate-700 text-slate-100" 
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex justify-between items-center">
              <Label className="text-slate-200 text-base">Options</Label>
              <Button type="button" size="sm" variant="outline" onClick={addOption} className="h-8 gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
            
            <div className="space-y-3">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-800 p-2 rounded-lg border border-slate-700/50">
                  <GripVertical className="w-5 h-5 text-slate-500 cursor-grab px-1" />
                  {isRequired && (
                    <input
                      type="radio"
                      name="defaultOption"
                      checked={defaultOptionIndex === i}
                      onChange={() => setDefaultOptionIndex(i)}
                      className="w-4 h-4 accent-emerald-500 cursor-pointer shrink-0"
                      title="Set as default"
                      aria-label={`Set ${opt.name || `option ${i + 1}`} as default`}
                    />
                  )}
                  <div className="flex-1">
                    <Input 
                      placeholder="Name (e.g. Extra Cheese)"
                      value={opt.name}
                      onChange={e => updateOption(i, 'name', e.target.value)}
                      className="bg-slate-900 border-slate-700 h-9" 
                    />
                  </div>
                  <div className="w-24 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">+</span>
                    <Input 
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Price"
                      value={opt.price}
                      onChange={e => updateOption(i, 'price', e.target.value)}
                      className="bg-slate-900 border-slate-700 h-9 pl-6 pr-2 text-right" 
                    />
                  </div>
                  <button 
                    onClick={() => removeOption(i)} 
                    disabled={options.length === 1}
                    className="p-2 text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/50">
          <Button variant="outline" onClick={onClose} className="border-slate-700 text-slate-400 hover:bg-slate-800">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[100px]">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
