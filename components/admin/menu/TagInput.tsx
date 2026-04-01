"use client";

import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagInput({ tags, onChange, placeholder = 'Type and press enter' }: Props) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = inputValue.trim();
      if (val && !tags.includes(val)) {
        onChange([...tags, val]);
        setInputValue('');
      }
    }
  };

  const removeTag = (indexToRemove: number) => {
    onChange(tags.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className="w-full flex flex-wrap items-center gap-2 p-2 bg-slate-800 border border-slate-700 rounded-xl min-h-[44px]">
      {tags.map((tag, i) => (
        <span key={i} className="flex items-center gap-1.5 px-3 py-1 bg-slate-700 text-slate-200 text-sm rounded-full">
          {tag}
          <button type="button" onClick={() => removeTag(i)} className="text-slate-400 hover:text-red-400 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-200 focus:outline-none placeholder:text-slate-500"
      />
    </div>
  );
}
