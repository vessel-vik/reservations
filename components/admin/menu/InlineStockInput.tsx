"use client";

import { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getStockStatus } from '@/lib/stock-utils';
import { toast } from 'sonner';
import { fetchWithSession } from '@/lib/fetch-with-session';

interface Props {
  itemId: string;
  stock: number;
  threshold?: number;
  onSaved: () => void;
}

export function InlineStockInput({ itemId, stock, threshold = 5, onSaved }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(stock.toString());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const status = getStockStatus(stock, threshold);

  useEffect(() => {
    setValue(stock.toString());
  }, [stock]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) {
      setError('Cannot be negative');
      return;
    }

    if (numValue === stock) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setIsEditing(false);
    setError(null);

    try {
      const res = await fetchWithSession(`/api/menu/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: numValue })
      });
      if (res.status === 401) throw new Error('Unauthorized');
      if (!res.ok) throw new Error('Failed to update stock');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error && e.message === 'Unauthorized' ? 'Sign in to save changes' : 'Failed to update stock');
      setValue(stock.toString()); // revert
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setValue(stock.toString());
      setIsEditing(false);
      setError(null);
    }
  };

  if (isSaving) {
    return <Loader2 className="w-4 h-4 animate-spin mx-auto text-emerald-500" />;
  }

  if (isEditing) {
    return (
      <div className="relative">
        <input
          ref={inputRef}
          type="number"
          min={0}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-16 h-8 text-center text-sm font-mono bg-slate-800 border-emerald-500/50 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        />
        {error && <span className="absolute left-1/2 -translate-x-1/2 -bottom-5 text-[10px] text-red-400 whitespace-nowrap">{error}</span>}
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`cursor-text px-2 py-1 rounded text-center text-sm font-mono border border-transparent hover:border-slate-700 hover:bg-slate-800/50 transition-colors
        ${status === 'in_stock' ? 'text-emerald-400' : status === 'low' ? 'text-amber-400' : status === 'out_of_stock' ? 'text-red-400 font-semibold' : 'text-slate-500'}`
      }
    >
      {stock}
    </div>
  );
}
