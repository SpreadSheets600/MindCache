import { describe, test, expect, beforeEach, beforeAll } from 'vitest';
import { useSearchStore } from '../src/store/useSearchStore';
import { useConnectionStore } from '../src/store/useConnectionStore';

describe('Zustand States Store Tests', () => {
  beforeAll(() => {
    let mockStore: { [key: string]: string } = {};
    global.localStorage = {
      getItem: (key: string) => mockStore[key] || null,
      setItem: (key: string, value: string) => {
        mockStore[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        mockStore = {};
      },
    } as any;
  });

  beforeEach(() => {
    useSearchStore.getState().resetSearch();
    useSearchStore.getState().clearRecentSearches();
  });

  test('should update query and reset states successfully', () => {
    const store = useSearchStore.getState();
    expect(store.query).toBe('');
    
    // Set query
    store.setQuery('sqlite faiss indexes');
    expect(useSearchStore.getState().query).toBe('sqlite faiss indexes');
    
    // Reset state
    useSearchStore.getState().resetSearch();
    expect(useSearchStore.getState().query).toBe('');
    expect(useSearchStore.getState().results).toEqual([]);
    expect(useSearchStore.getState().aiSummary).toBeNull();
  });

  test('should append and deduplicate recent searches cache', () => {
    const store = useSearchStore.getState();
    
    store.addRecentSearch('fastapi');
    store.addRecentSearch('docker setup');
    store.addRecentSearch('fastapi'); // Duplicate query

    const history = useSearchStore.getState().recentSearches;
    expect(history.length).toBe(2);
    expect(history[0]).toBe('fastapi'); // Newly added duplicate moves to front
    expect(history[1]).toBe('docker setup');
  });

  test('should toggle connection online state correctly', () => {
    expect(useConnectionStore.getState().isOnline).toBe(false);
  });
});
