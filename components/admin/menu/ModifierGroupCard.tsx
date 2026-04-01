"use client";

import { useState } from 'react';
import { Edit2, Trash2, ListChecks, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  group: any;
  onEdit: () => void;
  onRefresh: () => void;
}

export function ModifierGroupCard({ group, onEdit, onRefresh }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Delete this modifier group? This removes it from all attached menu items.')) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/menu/modifiers/${group.$id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Group deleted');
      onRefresh();
    } catch (e) {
      toast.error('Failed to delete group');
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700/50 rounded-xl overflow-hidden hover:border-slate-600 transition-colors flex flex-col">
      <div className="p-5 border-b border-slate-700/50 flex-1">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-semibold text-slate-100">{group.name}</h3>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {group.isRequired ? (
                <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Required
                </span>
              ) : (
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-full">
                  Optional
                </span>
              )}
              <span className="text-xs text-slate-400">Max {group.maxSelections} choices</span>
            </div>
          </div>
          <div className="flex gap-1 ml-2">
            <button onClick={onEdit} className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-slate-700/50 rounded-md transition-colors" title="Edit">
              <Edit2 className="w-4 h-4" />
            </button>
            <button onClick={handleDelete} disabled={isDeleting} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-slate-700/50 rounded-md transition-colors disabled:opacity-50" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <button 
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between mt-4 text-sm text-slate-300 hover:text-slate-100 group"
        >
          <span className="flex items-center gap-1.5"><ListChecks className="w-4 h-4 text-slate-500 group-hover:text-blue-400" /> {group.options.length} Options</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
            {group.options.map((optString: string, i: number) => {
              const [name, price] = optString.split(':');
              const p = Number(price);
              return (
                <div key={i} className="flex justify-between items-center text-sm py-1">
                  <span className="text-slate-300">{name}</span>
                  <span className={p > 0 ? "text-amber-400" : "text-emerald-400"}>
                    {p > 0 ? `+KSh ${p}` : 'Free'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
