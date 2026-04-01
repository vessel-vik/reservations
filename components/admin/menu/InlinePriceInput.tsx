"use client";

import { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  itemId: string;
  price: number;
  onSaved: () => void;
}

export function InlinePriceInput({ itemId, price, onSaved }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(price.toString());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(price.toString());
  }, [price]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setError('Must be > 0');
      return;
    }

    if (numValue === price) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setIsEditing(false);
    setError(null);

    try {
      const res = await fetch(`/api/menu/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: numValue })
      });
      if (!res.ok) throw new Error('Failed to update price');
      onSaved();
    } catch (e) {
      toast.error('Failed to update price');
      setValue(price.toString()); // revert
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setValue(price.toString());
      setIsEditing(false);
      setError(null);
    }
  };

  if (isSaving) {
    return <Loader2 className="w-4 h-4 animate-spin mr-2 text-amber-500 inline-block" />;
  }

  if (isEditing) {
    return (
      <div className="relative inline-block w-20">
        <input
          ref={inputRef}
          type="number"
          step="0.01"
          min={0.01}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full h-8 text-right pr-1 text-sm font-mono bg-slate-800 border-amber-500/50 rounded focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
        {error && <span className="absolute right-0 -bottom-5 text-[10px] text-red-400 whitespace-nowrap">{error}</span>}
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="cursor-text inline-block min-w-[60px] text-right px-1 py-1 rounded text-sm font-mono border border-transparent hover:border-slate-700 hover:bg-slate-800/50 transition-colors"
    >
      {price.toLocaleString()}
    </div>
  );
}
