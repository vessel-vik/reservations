"use client";

interface Flags {
  isVegetarian: boolean;
  isVegan: boolean;
  isGlutenFree: boolean;
}

interface Props {
  flags: Flags;
  onChange: (flags: Flags) => void;
}

export function DietaryFlagPills({ flags, onChange }: Props) {
  const toggle = (key: keyof Flags) => {
    onChange({ ...flags, [key]: !flags[key] });
  };

  return (
    <div className="flex flex-wrap gap-3">
      {(Object.keys(flags) as Array<keyof Flags>).map((key) => {
        const isActive = flags[key];
        const label = key === 'isVegetarian' ? 'Vegetarian' : key === 'isVegan' ? 'Vegan' : 'Gluten Free';
        
        return (
          <label
            key={key}
            className={`cursor-pointer px-4 py-1.5 text-sm font-medium rounded-full transition-colors border select-none
              ${isActive 
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-500/10' 
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }
            `}
          >
            <input
              type="checkbox"
              className="sr-only" // Hidden but accessible for tests
              checked={isActive}
              onChange={() => toggle(key)}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}
