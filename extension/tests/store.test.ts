import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "../src/store/settingsStore";
import { useSearchStore } from "../src/store/searchStore";
import { useConnectionStore } from "../src/store/connectionStore";

describe("MindCache Settings Store Tests", () => {
  beforeEach(() => {
    useSettingsStore.getState().resetSettings();
  });

  it("should load defaults correctly", () => {
    const state = useSettingsStore.getState();
    expect(state.backendUrl).toBe("http://localhost:8000");
    expect(state.autoTracking).toBe(true);
    expect(state.excludedDomains).toContain("localhost");
  });

  it("should modify settings variables successfully", () => {
    const store = useSettingsStore.getState();
    store.setBackendUrl("http://custom-url:9000");
    store.setAutoTracking(false);
    store.setPrivacyMode(true);

    const updated = useSettingsStore.getState();
    expect(updated.backendUrl).toBe("http://custom-url:9000");
    expect(updated.autoTracking).toBe(false);
    expect(updated.privacyMode).toBe(true);
  });

  it("should add and remove excluded domains safely", () => {
    const store = useSettingsStore.getState();
    
    // Add new domain
    store.addExcludedDomain("github.com");
    expect(useSettingsStore.getState().excludedDomains).toContain("github.com");

    // Prevent duplicate entries
    store.addExcludedDomain("github.com");
    expect(useSettingsStore.getState().excludedDomains.filter((d) => d === "github.com").length).toBe(1);

    // Remove domain
    store.removeExcludedDomain("github.com");
    expect(useSettingsStore.getState().excludedDomains).not.toContain("github.com");
  });
});

describe("MindCache Search Store Tests", () => {
  beforeEach(() => {
    useSearchStore.getState().clearRecentSearches();
    useSearchStore.getState().setQuery("");
  });

  it("should modify query inputs", () => {
    const store = useSearchStore.getState();
    store.setQuery("FastAPI client");
    expect(useSearchStore.getState().query).toBe("FastAPI client");
  });

  it("should handle recent searches queue constraints", () => {
    const store = useSearchStore.getState();
    
    store.addRecentSearch("FastAPI");
    store.addRecentSearch("Docker");
    store.addRecentSearch("FastAPI"); // duplicate

    const current = useSearchStore.getState().recentSearches;
    expect(current[0]).toBe("FastAPI"); // most recent moved to front
    expect(current[1]).toBe("Docker");
    expect(current.length).toBe(2);
  });
});

describe("MindCache Connection Store Tests", () => {
  beforeEach(() => {
    useConnectionStore.getState().clearConnectionStatus();
  });

  it("should transition connection states correctly", () => {
    const store = useConnectionStore.getState();
    expect(store.isOnline).toBe(false);

    // Set online
    const componentsMock = {
      database: { status: "connected" as const, documents_count: 42 },
      faiss_index: { status: "initialized", vectors_count: 42 },
      embedding: { status: "connected" as const, model: "Qwen/Qwen3-Embedding-0.6B", provider: "local" },
      generative: undefined,
    };
    
    store.setConnectionStatus(true, componentsMock);

    const active = useConnectionStore.getState();
    expect(active.isOnline).toBe(true);
    expect(active.components?.database.status).toBe("connected");
    expect(active.components?.database.documents_count).toBe(42);
    expect(active.components?.faiss_index.vectors_count).toBe(42);
  });
});
