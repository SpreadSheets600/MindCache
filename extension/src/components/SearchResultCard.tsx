import React, { useState } from 'react';
import type { SearchResult } from '../types';
import { ExternalLink, Copy, Check } from 'lucide-react';

interface SearchResultCardProps {
  result: SearchResult;
}

/**
 * Premium result card displaying page titles, domain origins, similarity percentages,
 * custom AI summaries, and KeyBERT tags. Includes hover hotkeys for copy and open.
 */
export const SearchResultCard: React.FC<SearchResultCardProps> = ({ result }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  const handleOpen = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: result.url });
    } else {
      window.open(result.url, '_blank');
    }
  };

  const formattedDate = new Date(result.last_visited_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Convert FAISS cosine score (Inner Product) to percentage representation
  const matchPercent = Math.max(0, Math.min(100, Math.round(result.score * 100)));

  return (
    <div
      onClick={handleOpen}
      className="p-3 bg-[#0d0e14]/50 hover:bg-[#12131f]/80 border border-gray-800/80 hover:border-purple-500/30 rounded-lg cursor-pointer transition-all duration-200 group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-semibold text-gray-200 group-hover:text-purple-300 transition-colors truncate">
            {result.title || result.url}
          </h3>
          <span className="text-[9px] text-gray-500 font-mono">
            {result.domain} • {formattedDate}
          </span>
        </div>

        {/* Relevance Score Badge */}
        <span className="px-1.5 py-0.5 text-[8px] font-mono font-bold bg-purple-950/20 border border-purple-500/20 text-purple-400 rounded-md shrink-0">
          {matchPercent}% match
        </span>
      </div>

      {/* Ollama Page Summary */}
      {result.summary && (
        <p className="text-[10px] text-gray-400 leading-relaxed mb-2 bg-[#090a0f] p-1.5 rounded border border-gray-800/40">
          {result.summary}
        </p>
      )}

      {/* Keywords and Hover Shortcuts */}
      <div className="flex items-center justify-between gap-2 mt-2">
        {/* KeyBERT tags */}
        <div className="flex flex-wrap gap-1 max-w-[70%]">
          {result.keywords.slice(0, 3).map((kw, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 text-[8px] bg-gray-950 border border-gray-800/50 text-gray-500 rounded font-semibold"
            >
              #{kw.keyword}
            </span>
          ))}
        </div>

        {/* Copy/Open hotkeys (visible on card hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            title="Copy URL to clipboard"
            className="p-1 text-gray-500 hover:text-purple-300 hover:bg-gray-800 rounded transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
            title="Open page in a new browser tab"
            className="p-1 text-gray-500 hover:text-purple-300 hover:bg-gray-800 rounded transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
export default SearchResultCard;
