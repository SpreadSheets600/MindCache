import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { extensionStorage } from "../utils/storage";

interface SearchState {
  query: string;
  recentSearches: string[];
  limit: number;
  generateSummary: boolean;
  setQuery: (query: string) => void;
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  setLimit: (limit: number) => void;
  setGenerateSummary: (generateSummary: boolean) => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      query: "",
      recentSearches: [],
      limit: 5,
      generateSummary: false,
      setQuery: (query) => set({ query }),
      addRecentSearch: (query) =>
        set((state) => {
          const cleaned = query.trim();
          if (!cleaned) return state;
          // Filter out existing and prepend
          const filtered = state.recentSearches.filter((q) => q !== cleaned);
          const updated = [cleaned, ...filtered].slice(0, 10);
          return { recentSearches: updated };
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),
      setLimit: (limit) => set({ limit }),
      setGenerateSummary: (generateSummary) => set({ generateSummary }),
    }),
    {
      name: "mindcache-search-store",
      storage: createJSONStorage(() => extensionStorage),
      partialize: (state) => ({
        recentSearches: state.recentSearches,
        limit: state.limit,
        generateSummary: state.generateSummary,
      }), // only persist these fields, not the active query
    }
  )
);
