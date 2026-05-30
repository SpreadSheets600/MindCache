import React, { useRef, useEffect } from 'react';
import { Search, Loader2, Sparkles, Settings } from 'lucide-react';
import { useSearchStore } from '../store/useSearchStore';

interface SearchBarProps {
  onToggleSettings: () => void;
  generateSummary: boolean;
  onToggleSummary: () => void;
}

/**
 * Premium spotlight search bar with reactive loader status and AI synthesis triggers.
 */
export const SearchBar: React.FC<SearchBarProps> = ({
  onToggleSettings,
  generateSummary,
  onToggleSummary,
}) => {
  const { query, setQuery, executeSearch, isLoading } = useSearchStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus input on initial popup display
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (!val.trim()) {
      useSearchStore.getState().resetSearch();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeSearch(5, generateSummary);
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-[#0a0b10] border-b border-gray-900">
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-gray-500" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search your browser memory... (Press Enter)"
          className="w-full pl-9 pr-4 py-2 text-xs bg-[#10111a] border border-gray-800 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/50 transition-colors"
        />
      </div>

      {/* Local Ollama Collective AI Summary Toggle */}
      <button
        onClick={onToggleSummary}
        title="Toggle Collective Ollama Synthesis"
        className={`flex items-center gap-1.5 px-2.5 py-2 text-[10px] font-semibold rounded-lg border transition-all cursor-pointer ${
          generateSummary
            ? 'bg-purple-950/20 border-purple-500/50 text-purple-300'
            : 'bg-[#10111a] border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700'
        }`}
      >
        <Sparkles className={`w-3.5 h-3.5 ${generateSummary ? 'text-purple-400' : ''}`} />
        AI Summary
      </button>

      {/* Settings Toggle Trigger */}
      <button
        onClick={onToggleSettings}
        title="Configuration Panel"
        className="p-2 bg-[#10111a] border border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700 rounded-lg transition-colors cursor-pointer"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
export default SearchBar;
