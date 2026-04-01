"use client";

import { Boxes } from 'lucide-react';
import { ModifierGroupCard } from './ModifierGroupCard';

interface Props {
  modifierGroups: any[];
  onEdit: (group: any) => void;
  onRefresh: () => void;
}

export function ModifiersSection({ modifierGroups, onEdit, onRefresh }: Props) {
  if (modifierGroups.length === 0) {
    return (
      <div className="py-20 text-center bg-slate-800/50 border border-slate-700/50 border-dashed rounded-xl text-slate-500">
        <Boxes className="w-10 h-10 mx-auto mb-3 opacity-30 text-blue-400" />
        <p className="font-medium text-slate-400">No modifier groups yet</p>
        <p className="text-sm mt-1 mb-4">Create groups like "Sauce Choice" or "Extra Toppings"</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative">
      {modifierGroups.map(group => (
        <ModifierGroupCard 
          key={group.$id} 
          group={group} 
          onEdit={() => onEdit(group)} 
          onRefresh={onRefresh} 
        />
      ))}
    </div>
  );
}
