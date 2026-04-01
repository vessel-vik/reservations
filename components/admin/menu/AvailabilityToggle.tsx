"use client";

import { useState } from 'react';
import { ToggleRight, ToggleLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  itemId: string;
  isAvailable: boolean;
  stock: number;
  onSaved: () => void;
}

export function AvailabilityToggle({ itemId, isAvailable, stock, onSaved }: Props) {
  const [internalState, setInternalState] = useState(isAvailable);
  const [isSaving, setIsSaving] = useState(false);

  // Sync prop changes
  if (isAvailable !== internalState && !isSaving) {
    setInternalState(isAvailable);
  }

  const disabled = stock <= 0;

  const handleToggle = async () => {
    if (disabled || isSaving) return;
    
    const newState = !internalState;
    setInternalState(newState); // Optimistic UI
    setIsSaving(true);
    
    try {
      const res = await fetch(`/api/menu/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: newState })
      });
      if (!res.ok) throw new Error('Failed to update availability');
      onSaved();
    } catch (e) {
      toast.error('Failed to update availability');
      setInternalState(!newState); // revert
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={disabled || isSaving}
      className={`transition-all ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105'}`}
      type="button"
    >
      <span className="relative">
        {internalState ? (
          <ToggleRight className="w-6 h-6 text-emerald-400" />
        ) : (
          <ToggleLeft className="w-6 h-6 text-slate-600" />
        )}
        {isSaving && (
          <Loader2 className="w-3 h-3 animate-spin text-slate-400 absolute -top-1 -right-1" />
        )}
      </span>
    </button>
  );
}
