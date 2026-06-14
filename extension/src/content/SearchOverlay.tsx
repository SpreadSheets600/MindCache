import React, { useState, useEffect, useRef } from "react";
import { Search, Globe, Brain, CornerDownLeft, X } from "lucide-react";

interface TabItem {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl: string;
  active: boolean;
}

interface MemoryItem {
  id: number;
  url: string;
  domain: string;
  title: string | null;
  summary: string | null;
  score: number;
  last_visited_at: string;
  source_type: string;
}

export const SearchOverlay: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"tabs" | "memory">("tabs");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTabs, setActiveTabs] = useState<TabItem[]>([]);
  const [memoryResults, setMemoryResults] = useState<MemoryItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Listen for toggle events and global toggle shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Toggle overlay on Ctrl + Shift + K or Cmd + Shift + K (Mac)
      const isK = e.key.toLowerCase() === "k";
      const isModifier = e.ctrlKey || e.metaKey;
      if (isModifier && e.shiftKey && isK) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    const handleChromeMessage = (
      message: any,
      _sender: any,
      sendResponse: (response?: any) => void
    ) => {
      if (message.action === "toggle-overlay") {
        setIsOpen((prev) => !prev);
        sendResponse({ status: "toggled" });
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(handleChromeMessage);
    }

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true);
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.removeListener(handleChromeMessage);
      }
    };
  }, []);

  // 2. Clear state and auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setSelectedIndex(0);
      setMemoryResults([]);
      checkBackendHealth();
      fetchActiveTabs();
      
      // Auto focus with short timeout to ensure modal rendering is complete
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // 3. Reset selected index when search query or mode changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, mode]);

  // 4. Fetch open tabs from background
  const fetchActiveTabs = () => {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ action: "get-active-tabs" }, (response) => {
        if (response && response.status === "ok" && response.tabs) {
          setActiveTabs(response.tabs);
        }
      });
    }
  };

  // 5. Query memory from backend (via background script)
  const searchMemory = (query: string) => {
    if (!query.trim()) {
      setMemoryResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage(
        { action: "search-memory", query: query.trim(), limit: 8 },
        (response) => {
          setIsLoading(false);
          if (response && response.status === "ok") {
            setMemoryResults(response.results || []);
          } else {
            setMemoryResults([]);
          }
        }
      );
    }
  };

  // 6. Check FastAPI backend status
  const checkBackendHealth = () => {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ action: "check-backend-health" }, (response) => {
        if (response && response.status === "ok" && response.health) {
          setIsBackendOnline(true);
        } else {
          setIsBackendOnline(false);
        }
      });
    }
  };

  // 7. Handle search text changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (mode === "memory") {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setIsLoading(true);
      debounceTimer.current = setTimeout(() => {
        searchMemory(val);
      }, 250);
    }
  };

  // 8. Handle mode changes
  const handleModeChange = (newMode: "tabs" | "memory") => {
    setMode(newMode);
    if (newMode === "memory" && searchQuery.trim()) {
      searchMemory(searchQuery);
    }
  };

  // 9. Switch active tab / Open memory URL
  const handleSelectItem = (item: any) => {
    if (mode === "tabs") {
      const tab = item as TabItem;
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage({
          action: "switch-to-tab",
          tabId: tab.id,
          windowId: tab.windowId,
        });
        setIsOpen(false);
      }
    } else {
      const memory = item as MemoryItem;
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage({
          action: "open-url",
          url: memory.url,
        });
        setIsOpen(false);
      }
    }
  };

  // 10. Filter tabs locally
  const getFilteredTabs = () => {
    if (!searchQuery.trim()) return activeTabs;
    const lowerQuery = searchQuery.toLowerCase();
    return activeTabs.filter(
      (tab) =>
        tab.title.toLowerCase().includes(lowerQuery) || tab.url.toLowerCase().includes(lowerQuery)
    );
  };

  // Current list based on mode
  const currentResults = mode === "tabs" ? getFilteredTabs() : memoryResults;

  // 11. Handle keydown events inside the modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // Stop propagation to host page listeners
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      // Toggle mode
      handleModeChange(mode === "tabs" ? "memory" : "tabs");
      return;
    }

    // Ctrl + T to jump to tabs mode
    if (e.ctrlKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      handleModeChange("tabs");
      return;
    }

    // Ctrl + M to jump to memory mode
    if (e.ctrlKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      handleModeChange("memory");
      return;
    }

    if (currentResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => {
        const nextIdx = (prev + 1) % currentResults.length;
        scrollToItem(nextIdx);
        return nextIdx;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => {
        const nextIdx = (prev - 1 + currentResults.length) % currentResults.length;
        scrollToItem(nextIdx);
        return nextIdx;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelectItem(currentResults[selectedIndex]);
    }
  };

  // Auto-scroll inside list container
  const scrollToItem = (index: number) => {
    const container = resultsContainerRef.current;
    if (!container) return;
    const elements = container.getElementsByClassName("result-item");
    const targetElement = elements[index] as HTMLElement;
    if (targetElement) {
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      const elemTop = targetElement.offsetTop;
      const elemBottom = elemTop + targetElement.clientHeight;

      if (elemTop < containerTop) {
        container.scrollTop = elemTop;
      } else if (elemBottom > containerBottom) {
        container.scrollTop = elemBottom - container.clientHeight;
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS_STYLES }} />
      <div 
        className="overlay-backdrop"
        onClick={() => setIsOpen(false)}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        onKeyPress={(e) => e.stopPropagation()}
      >
        <div 
          className="overlay-container"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.focus();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          onKeyPress={(e) => e.stopPropagation()}
        >
          {/* Search header row */}
          <div className="search-header">
            <Search className="search-icon" size={20} />
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder={
                mode === "tabs"
                  ? "Search open tabs (e.g. github, docs)..."
                  : "Search semantic memory..."
              }
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
            />
            
            <button 
              className="tab-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close search overlay"
            >
              <X size={16} />
            </button>
          </div>

          {/* Mode selector tab bar */}
          <div className="tab-nav">
            <button
              className={`tab-btn ${mode === "tabs" ? "active" : ""}`}
              onClick={() => handleModeChange("tabs")}
            >
              <Globe size={14} />
              <span>Active Tabs</span>
              <span className="results-count-badge">{activeTabs.length}</span>
            </button>
            <button
              className={`tab-btn ${mode === "memory" ? "active" : ""}`}
              onClick={() => handleModeChange("memory")}
            >
              <Brain size={14} />
              <span>Search Memory</span>
              {isBackendOnline && (
                <span className="results-count-badge online">AI</span>
              )}
            </button>
          </div>

          {/* Results view list */}
          <div 
            ref={resultsContainerRef}
            className="results-list"
          >
            {isLoading && (
              <div className="empty-state">
                <span className="loading-spinner"></span>
                <div className="empty-state-title">Querying Memory...</div>
              </div>
            )}

            {!isLoading && currentResults.length === 0 && (
              <div className="empty-state">
                {mode === "tabs" ? (
                  <>
                    <Globe size={32} style={{ opacity: 0.3 }} />
                    <div className="empty-state-title">No matching tabs open</div>
                    <div>Try a different query or open more tabs.</div>
                  </>
                ) : (
                  <>
                    <Brain size={32} style={{ opacity: 0.3 }} />
                    <div className="empty-state-title">
                      {searchQuery.trim() ? "No memories found" : "Search your knowledge base"}
                    </div>
                    <div>
                      {searchQuery.trim() 
                        ? "The semantic search found zero matching documents." 
                        : "Type something above to search your indexed web pages."}
                    </div>
                    {!searchQuery.trim() && (
                      <div className="overlay-suggestions" style={{ marginTop: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", color: "#71717a", fontWeight: 500 }}>Try:</span>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                          {[
                            "that rust pdf parser",
                            "the paper about transformers",
                            "youtube video about rag pipelines"
                          ].map((query, i) => (
                            <button
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSearchQuery(query);
                                searchMemory(query);
                              }}
                              style={{
                                background: "rgba(255, 255, 255, 0.04)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                color: "#a1a1aa",
                                fontSize: "11px",
                                padding: "4px 10.5px",
                                borderRadius: "12px",
                                cursor: "pointer",
                                transition: "all 0.15s ease"
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                                e.currentTarget.style.color = "#ffffff";
                                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                                e.currentTarget.style.color = "#a1a1aa";
                                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                              }}
                            >
                              "{query}"
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!isLoading && currentResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const key = mode === "tabs" ? `tab-${(item as TabItem).id}` : `mem-${(item as MemoryItem).id}`;
              const title = mode === "tabs" ? (item as TabItem).title : ((item as MemoryItem).title || "Untitled Document");
              const url = item.url;
              const domain = mode === "tabs" 
                ? new URL(url || "http://tab").hostname.replace("www.", "") 
                : (item as MemoryItem).domain;
              const favIconUrl = mode === "tabs" ? (item as TabItem).favIconUrl : null;

              return (
                <div
                  key={key}
                  className={`result-item ${isSelected ? "selected" : ""} ${mode === "memory" ? "memory" : ""}`}
                  onClick={() => handleSelectItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="item-icon-wrapper">
                    {mode === "tabs" ? (
                      favIconUrl ? (
                        <img 
                          src={favIconUrl} 
                          alt="" 
                          className="tab-favicon"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <Globe size={16} />
                      )
                    ) : (
                      <Brain size={16} />
                    )}
                  </div>

                  <div className="item-details">
                    <div className="item-title">{title}</div>
                    <div className="item-url">{url}</div>
                  </div>

                  <div className="item-domain">{domain}</div>

                  {isSelected && (
                    <div className="select-badge">
                      <CornerDownLeft size={10} />
                      <span>Open</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer shortcuts help bar */}
          <div className="footer">
            <div className="shortcut-hints">
              <div className="shortcut-hint">
                <kbd>↑↓</kbd> <span>Navigate</span>
              </div>
              <div className="shortcut-hint">
                <kbd>Enter</kbd> <span>Select</span>
              </div>
              <div className="shortcut-hint">
                <kbd>Tab</kbd> <span>Switch Mode</span>
              </div>
              <div className="shortcut-hint">
                <kbd>Esc</kbd> <span>Close</span>
              </div>
            </div>

            <div className="backend-badge">
              <span className={`backend-dot ${isBackendOnline ? "online" : ""}`}></span>
              <span>Memory Server: {isBackendOnline ? "Online" : "Offline"}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const CSS_STYLES = `
:host {
  all: initial; /* Reset all inherited CSS */
}

.overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(9, 9, 11, 0.45);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #f4f4f5;
}

.overlay-backdrop * {
  box-sizing: border-box;
}

.overlay-container {
  width: 680px;
  max-width: 90vw;
  background: rgba(15, 15, 20, 0.85);
  border: 1px solid rgba(63, 63, 70, 0.35);
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 
              0 0 40px rgba(59, 130, 246, 0.05),
              inset 0 1px 0 rgba(255, 255, 255, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: modal-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes modal-enter {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.search-header {
  position: relative;
  display: flex;
  align-items: center;
  padding: 18px 24px;
  border-bottom: 1px solid rgba(63, 63, 70, 0.25);
  background: rgba(20, 20, 25, 0.3);
}

.search-icon {
  color: #71717a;
  margin-right: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-input {
  flex-grow: 1;
  background: transparent !important;
  border: none !important;
  color: #f4f4f5 !important;
  font-size: 16px !important;
  line-height: 24px !important;
  outline: none !important;
  font-family: inherit !important;
  padding: 0 !important;
  margin: 0 !important;
  box-shadow: none !important;
  width: 100% !important;
}

.search-input::placeholder {
  color: #52525b;
}

.tab-close-btn {
  background: transparent;
  border: none;
  color: #52525b;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  margin-left: 12px;
}

.tab-close-btn:hover {
  color: #e4e4e7;
  background: rgba(255, 255, 255, 0.08);
}

.tab-nav {
  display: flex;
  background: rgba(15, 15, 20, 0.4);
  padding: 8px 16px;
  gap: 10px;
  border-bottom: 1px solid rgba(63, 63, 70, 0.15);
}

.tab-btn {
  background: transparent;
  border: none;
  color: #71717a;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
}

.tab-btn:hover {
  color: #d4d4d8;
  background: rgba(255, 255, 255, 0.04);
}

.tab-btn.active {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.07);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.results-count-badge {
  background: rgba(255, 255, 255, 0.06);
  color: #71717a;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 10px;
  transition: all 0.15s ease;
}

.tab-btn.active .results-count-badge {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.tab-btn.active .results-count-badge.online {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}

.results-list {
  max-height: 380px;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.results-list::-webkit-scrollbar {
  width: 6px;
}
.results-list::-webkit-scrollbar-track {
  background: transparent;
}
.results-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
.results-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.result-item {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  gap: 14px;
  border: 1px solid transparent;
  background: transparent;
}

.result-item:hover {
  background: rgba(255, 255, 255, 0.02);
}

.result-item.selected {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
}

.result-item.selected.memory {
  background: rgba(147, 51, 234, 0.08);
  border-color: rgba(147, 51, 234, 0.25);
}

.item-icon-wrapper {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #71717a;
  transition: all 0.15s ease;
}

.tab-favicon {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  object-fit: contain;
}

.result-item.selected .item-icon-wrapper {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.result-item.selected.memory .item-icon-wrapper {
  background: rgba(147, 51, 234, 0.15);
  color: #c084fc;
}

.item-details {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
  color: #e4e4e7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-url {
  font-size: 11px;
  color: #52525b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
}

.item-domain {
  font-size: 11px;
  font-weight: 500;
  color: #3f3f46;
  text-transform: lowercase;
  margin-left: auto;
  flex-shrink: 0;
  font-family: monospace;
}

.result-item.selected .item-domain {
  color: rgba(96, 165, 250, 0.55);
}
.result-item.selected.memory .item-domain {
  color: rgba(192, 132, 252, 0.55);
}

.select-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  padding: 3px 8px;
  border-radius: 6px;
  margin-left: 12px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  animation: fade-in 0.12s ease-out forwards;
}

.result-item.selected.memory .select-badge {
  background: rgba(147, 51, 234, 0.15);
  color: #c084fc;
  border-color: rgba(147, 51, 234, 0.25);
}

@keyframes fade-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.empty-state {
  padding: 48px 24px;
  text-align: center;
  color: #52525b;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.empty-state-title {
  font-size: 14px;
  font-weight: 600;
  color: #a1a1aa;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 2px solid rgba(255, 255, 255, 0.05);
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.footer {
  padding: 12px 20px;
  border-top: 1px solid rgba(63, 63, 70, 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(10, 10, 15, 0.5);
  font-size: 11px;
  color: #52525b;
}

.shortcut-hints {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
}

.shortcut-hint {
  display: flex;
  align-items: center;
  gap: 4px;
}

kbd {
  font-family: monospace;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  padding: 1px 5px;
  color: #71717a;
  font-size: 9px;
  font-weight: 600;
}

.backend-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  color: #71717a;
}

.backend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
  transition: all 0.2s ease;
}

.backend-dot.online {
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
}
`;
