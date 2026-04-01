import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

type MenuSection = 'items' | 'categories' | 'modifiers';

interface Props {
  activeSection: MenuSection;
  onSectionChange: (s: MenuSection) => void;
  search: string;
  onSearch: (q: string) => void;
  categories: any[];
  filterCategory: string | undefined;
  onFilterCategory: (id: string | undefined) => void;
  onAddItem: () => void;
}

export function MenuSectionNav({ activeSection, onSectionChange, search, onSearch, categories, filterCategory, onFilterCategory, onAddItem }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex bg-slate-800/80 p-1.5 rounded-xl border border-slate-700/50 flex-wrap">
          <button
            onClick={() => onSectionChange('items')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeSection === 'items' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Menu Items
          </button>
          <button
            onClick={() => onSectionChange('categories')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeSection === 'categories' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Categories
          </button>
          <button
            onClick={() => onSectionChange('modifiers')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeSection === 'modifiers' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Modifiers
          </button>
        </div>

        <Button onClick={onAddItem} className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white">
          <Plus className="w-4 h-4" /> {activeSection === 'categories' ? 'New Category' : activeSection === 'modifiers' ? 'New Group' : 'New Item'}
        </Button>
      </div>

      {activeSection === 'items' && (
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <select
            value={filterCategory || ''}
            onChange={(e) => onFilterCategory(e.target.value || undefined)}
            className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.$id} value={c.$id}>{c.label || c.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
