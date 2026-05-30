import React from "react";
import { useSearchStore } from "../store/searchStore";
import { History, X } from "lucide-react";

interface RecentSearchesProps {
  onSearchSelect: (query: string) => void;
}

export const RecentSearches: React.FC<RecentSearchesProps> = ({
  onSearchSelect,
}) => {
  const { recentSearches, clearRecentSearches } = useSearchStore();

  if (recentSearches.length === 0) return null;

  return (
    <div className="px-4 py-3 border-t border-border/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5 text-[11px] text-muted-foreground">
          <History className="w-3 h-3" />
          <span>Recent</span>
        </div>
        <button
          onClick={clearRecentSearches}
          className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors focus:outline-none"
          title="Clear history"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {recentSearches.map((term, index) => (
          <button
            key={index}
            onClick={() => onSearchSelect(term)}
            className="px-2.5 py-1 text-xs rounded-md bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors focus:outline-none"
          >
            {term}
          </button>
        ))}
      </div>
    </div>
  );
};
