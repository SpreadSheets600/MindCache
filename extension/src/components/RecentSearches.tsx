import React from 'react';
import { useSearchStore } from '../store/useSearchStore';
import { History, Trash2 } from 'lucide-react';

interface RecentSearchesProps {
  generateSummary: boolean;
}

/**
 * Click-to-search query history component showing the user's recent queries
 * as capsules that execute searches instantly when clicked.
 */
export const RecentSearches: React.FC<RecentSearchesProps> = ({ generateSummary }) => {
  const { recentSearches, setQuery, executeSearch, clearRecentSearches } = useSearchStore();

  if (recentSearches.length === 0) return null;

  const handleSelect = async (query: string) => {
    setQuery(query);
    await executeSearch(5, generateSummary);
  };

  return (
    <div className="px-4 py-2 border-t border-gray-900 bg-[#0a0b10] flex items-center justify-between gap-2 select-none">
      <div className="flex items-center gap-1.5 overflow-x-auto flex-1 py-0.5 no-scrollbar scroll-smooth">
        <History className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider shrink-0 mr-1">
          Recent:
        </span>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {recentSearches.map((queryText, i) => (
            <button
              key={i}
              onClick={() => handleSelect(queryText)}
              className="px-2 py-0.5 text-[9px] bg-[#10111a] hover:bg-purple-950/20 border border-gray-800 hover:border-purple-500/30 text-gray-400 hover:text-purple-300 rounded transition-all cursor-pointer font-medium whitespace-nowrap"
            >
              {queryText}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={clearRecentSearches}
        title="Clear Search History"
        className="p-1 text-gray-500 hover:text-rose-400 hover:bg-gray-800 rounded transition-colors cursor-pointer shrink-0"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
};
export default RecentSearches;
