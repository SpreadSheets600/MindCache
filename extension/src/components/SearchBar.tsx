import React, { useRef, useEffect } from "react";
import { Search, Loader2, Sparkles, X, Settings } from "lucide-react";
import { useSearchStore } from "../store/searchStore";

interface SearchBarProps {
  isLoading: boolean;
  onSettingsClick: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  isLoading,
  onSettingsClick,
}) => {
  const { query, setQuery, generateSummary, setGenerateSummary } = useSearchStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleClear = () => {
    setQuery("");
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className="relative border-b border-border bg-background">
      <div className="flex items-center px-4 py-3 space-x-3">
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        ) : (
          <Search className="w-4 h-4 text-muted-foreground" />
        )}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your memory..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
        />

        {query && (
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => setGenerateSummary(!generateSummary)}
          className={`flex items-center space-x-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors focus:outline-none ${
            generateSummary
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Toggle AI summary"
        >
          <Sparkles className="w-3 h-3" />
          <span>AI</span>
        </button>

        <button
          onClick={onSettingsClick}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus:outline-none"
          title="Open Dashboard"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {isLoading && (
        <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden">
          <div className="loading-scan-line"></div>
        </div>
      )}
    </div>
  );
};
