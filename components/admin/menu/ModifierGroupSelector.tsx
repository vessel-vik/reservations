"use client";

import { X, Plus } from 'lucide-react';

interface ModifierGroup {
  $id: string;
  name: string;
}

interface Props {
  attachedGroupIds: string[];
  allGroups: ModifierGroup[];
  onChange: (ids: string[]) => void;
}

export function ModifierGroupSelector({ attachedGroupIds, allGroups, onChange }: Props) {
  const attachedGroups = attachedGroupIds.map(id => allGroups.find(g => g.$id === id)).filter(Boolean) as ModifierGroup[];
  const unattachedGroups = allGroups.filter(g => !attachedGroupIds.includes(g.$id));

  const removeGroup = (id: string) => {
    onChange(attachedGroupIds.filter(gId => gId !== id));
  };

  const addGroup = (id: string) => {
    onChange([...attachedGroupIds, id]);
  };

  return (
    <div className="space-y-3">
      {attachedGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachedGroups.map(group => (
            <div key={group.$id} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm rounded-lg">
              <span className="font-medium">{group.name}</span>
              <button type="button" onClick={() => removeGroup(group.$id)} className="text-blue-500 hover:text-blue-300">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {unattachedGroups.length > 0 && (
        <select
          value=""
          onChange={(e) => addGroup(e.target.value)}
          className="w-full h-10 px-3 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-sm cursor-pointer focus:outline-none focus:border-slate-600"
        >
          <option value="" disabled>+ Attach modifier group...</option>
          {unattachedGroups.map(group => (
            <option key={group.$id} value={group.$id}>{group.name}</option>
          ))}
        </select>
      )}

      {unattachedGroups.length === 0 && attachedGroups.length === 0 && (
        <p className="text-xs text-slate-500">No modifier groups exist. Create them in the Modifiers tab.</p>
      )}
    </div>
  );
}
