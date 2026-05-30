import React from "react";
import { SearchResultItem } from "../types";
import { ExternalLink, Copy, Eye, Trash2 } from "lucide-react";

interface SearchResultCardProps {
  result: SearchResultItem;
  isSelected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onCopy: () => void;
  onViewDetails: () => void;
  onDelete: () => void;
}

export const SearchResultCard: React.FC<SearchResultCardProps> = ({
  result,
  isSelected,
  onSelect,
  onOpen,
  onCopy,
  onViewDetails,
  onDelete,
}) => {
  const matchPercentage = Math.round(result.score * 100);

  const formatVisitDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`group relative flex flex-col p-3.5 rounded-lg transition-colors cursor-pointer ${
        isSelected
          ? "bg-secondary"
          : "hover:bg-secondary/50"
      }`}
    >
      <div className="flex items-start justify-between space-x-3">
        <h3
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="font-medium text-sm line-clamp-1 flex-1 leading-snug hover:text-primary transition-colors"
          title={result.title || result.url}
        >
          {result.title || result.url}
        </h3>

        <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
          {matchPercentage}%
        </span>
      </div>

      <div className="flex items-center space-x-2 mt-1 text-[11px] text-muted-foreground">
        <span className="truncate max-w-[180px]">{result.domain}</span>
        <span className="text-muted-foreground/40">-</span>
        <span>{formatVisitDate(result.last_visited_at)}</span>
      </div>

      {result.summary ? (
        <p className="mt-2 text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
          {result.summary}
        </p>
      ) : null}

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/50">
        <div className="flex items-center gap-1.5 overflow-hidden max-w-[65%]">
          {result.keywords && result.keywords.length > 0 ? (
            result.keywords.slice(0, 3).map((kw, i) => (
              <span
                key={i}
                className="text-[9px] bg-secondary/80 text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded font-mono truncate max-w-[90px]"
              >
                #{kw.keyword}
              </span>
            ))
          ) : null}
        </div>

        <div
          className={`flex items-center space-x-1 transition-opacity duration-150 ${
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onViewDetails}
            className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
            title="View details"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onCopy}
            className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
            title="Copy URL"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpen}
            className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
            title="Open page"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-background text-muted-foreground hover:text-red-400 transition-colors focus:outline-none"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
