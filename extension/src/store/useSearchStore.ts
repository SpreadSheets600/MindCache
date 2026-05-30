import { create } from 'zustand';
import { backendClient } from '../services/backendClient';
import type { SearchResult } from '../types';

interface SearchState {
  query: string;
  results: SearchResult[];
  aiSummary: string | null;
  isLoading: boolean;
  error: string | null;
  recentSearches: string[];
  startTime: string;
  endTime: string;
  setQuery: (query: string) => void;
  setStartTime: (startTime: string) => void;
  setEndTime: (endTime: string) => void;
  executeSearch: (limit?: number, generateSummary?: boolean) => Promise<void>;
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  loadRecentSearches: () => void;
  resetSearch: () => void;
}

/**
 * Global store managing semantic search operations, queries, and history caches.
 */
export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  aiSummary: null,
  isLoading: false,
  error: null,
  recentSearches: [],
  startTime: '',
  endTime: '',

  setQuery: (query: string) => set({ query }),
  setStartTime: (startTime: string) => set({ startTime }),
  setEndTime: (endTime: string) => set({ endTime }),

  executeSearch: async (limit = 5, generateSummary = false) => {
    const { query, startTime, endTime } = get();
    if (!query.trim()) {
      set({ results: [], aiSummary: null, error: null });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const response = await backendClient.search(
        query,
        limit,
        generateSummary,
        startTime || null,
        endTime || null
      );
      set({
        results: response.results,
        aiSummary: response.ai_summary,
        isLoading: false,
      });
      get().addRecentSearch(query);
    } catch (e: any) {
      set({
        error: e.message || 'Failed to retrieve search results.',
        isLoading: false,
        results: [],
        aiSummary: null,
      });
    }
  },

  addRecentSearch: (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const current = get().recentSearches;
    // Deduplicate and slice to maximum 5 recent queries
    const next = [trimmed, ...current.filter((q) => q !== trimmed)].slice(0, 5);
    set({ recentSearches: next });
    localStorage.setItem('mindcache_recent_searches', JSON.stringify(next));
  },

  clearRecentSearches: () => {
    set({ recentSearches: [] });
    localStorage.removeItem('mindcache_recent_searches');
  },

  loadRecentSearches: () => {
    const data = localStorage.getItem('mindcache_recent_searches');
    if (data) {
      try {
        set({ recentSearches: JSON.parse(data) });
      } catch {
        // Fallback on corrupt cache
      }
    }
  },

  resetSearch: () => {
    set({ query: '', results: [], aiSummary: null, error: null, isLoading: false, startTime: '', endTime: '' });
  },
}));
