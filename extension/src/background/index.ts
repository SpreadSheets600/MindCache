import { backendClient } from "../services/BackendClient";
import { useSettingsStore } from "../store/settingsStore";

const recentVisits = new Map<string, number>();

// Rehydrate settings store on background startup
useSettingsStore.persist.rehydrate();

// Workaround: Sync settings changes from the popup/options UI to the background context
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes["mindcache-settings-store"]) {
      useSettingsStore.persist.rehydrate();
      console.log("[MindCache Background] Settings store rehydrated from storage changes.");
    }
  });
}

/**
 * Validates whether a URL should be indexed based on scheme, localhost, and custom excluded domains.
 */
function shouldTrack(urlStr: string): boolean {
  if (!urlStr) return false;

  try {
    const url = new URL(urlStr);

    // Only track standard web protocols
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Ignore browser internal extensions
    if (urlStr.startsWith("chrome-extension://")) {
      return false;
    }

    const settings = useSettingsStore.getState();

    // Verify auto-tracking configuration is active
    if (!settings.autoTracking) {
      return false;
    }

    // Evaluate custom domain exclusion rules
    for (const rule of settings.excludedDomains) {
      const cleanRule = rule.trim().toLowerCase();
      if (cleanRule && hostname.includes(cleanRule)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

const DWELL_TIME_THRESHOLD_SEC = 10;

interface ActiveTabState {
  tabId: number;
  url: string;
  title: string;
  activatedAt: number;
  timerId?: any;
  indexed: boolean;
}

let activeTab: ActiveTabState | null = null;

async function handleTabActivated(tabId: number, url: string, title: string) {
  if (!shouldTrack(url)) {
    await handleTabDeactivated(null);
    return;
  }

  // Ignore if already tracking same tab/URL
  if (activeTab && activeTab.tabId === tabId && activeTab.url === url) {
    return;
  }

  // Deactivate previous active tab first
  await handleTabDeactivated(null);

  console.log(`[MindCache Background] Tracking started for active URL: ${url}`);

  const state: ActiveTabState = {
    tabId,
    url,
    title,
    activatedAt: Date.now(),
    indexed: false,
  };

  // Stage a timer to auto-index after 10s of continuous viewing
  state.timerId = setTimeout(async () => {
    if (activeTab && activeTab.tabId === tabId && activeTab.url === url && !activeTab.indexed) {
      activeTab.indexed = true;
      console.log(`[MindCache Background] Dwell threshold crossed for ${url}. Ingesting now.`);
      await processVisit(url, title, DWELL_TIME_THRESHOLD_SEC, tabId);
    }
  }, DWELL_TIME_THRESHOLD_SEC * 1000);

  activeTab = state;
}

async function handleTabDeactivated(tabId: number | null) {
  if (!activeTab) return;
  if (tabId !== null && activeTab.tabId !== tabId) return;

  const state = activeTab;
  activeTab = null;

  if (state.timerId) {
    clearTimeout(state.timerId);
  }

  const durationSeconds = (Date.now() - state.activatedAt) / 1000;
  console.log(`[MindCache Background] Active session ended for ${state.url} after ${durationSeconds.toFixed(1)}s`);

  // If it was not indexed yet, check if it should be (met rules)
  if (!state.indexed) {
    await processVisit(state.url, state.title, durationSeconds, state.tabId);
  }
}

/**
 * Tries to get page extraction data from the content script.
 * Returns null if the content script is unavailable or times out.
 */
const EXTRACTION_TIMEOUT_MS = 2000;

async function getPageExtraction(tabId: number): Promise<any | null> {
  try {
    const result = await Promise.race([
      chrome.tabs.sendMessage(tabId, { action: "extract-page" }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), EXTRACTION_TIMEOUT_MS)
      ),
    ]);
    if (result && result.content) return result;
  } catch {
    // Content script not available (chrome:// pages, PDF viewer, etc.) or timeout
  }
  return null;
}

/** Sanitize extraction payload to match backend Pydantic schema expectations. */
function sanitizeExtraction(payload: any): any {
  if (payload.meta_tags && Array.isArray(payload.meta_tags)) {
    payload.meta_tags = payload.meta_tags
      .filter((t: any) => t && t.content != null)
      .map((t: any) => {
        const cleaned: Record<string, string> = { content: String(t.content) };
        if (t.name) cleaned.name = String(t.name);
        if (t.property) cleaned.property = String(t.property);
        return cleaned;
      });
  }
  if (payload.schema_org && (Array.isArray(payload.schema_org) || typeof payload.schema_org !== 'object')) {
    delete payload.schema_org;
  }
  if (payload.highlights && Array.isArray(payload.highlights)) {
    payload.highlights = payload.highlights.filter(
      (h: any) => h && h.text != null && h.content != null && h.xpath != null
    );
  }
  return payload;
}

/**
 * Queues and sends page visit events to the FastAPI backend.
 */
async function processVisit(url: string, title: string, dwellTime: number, tabId?: number) {
  if (!shouldTrack(url)) return;

  const now = Date.now();
  const lastProcessed = recentVisits.get(url);

  // Prevent duplicate operations during navigation transitions or reload spams
  if (lastProcessed && now - lastProcessed < 10000) {
    return;
  }

  recentVisits.set(url, now);

  // Maintain cache size boundaries
  if (recentVisits.size > 200) {
    const oldestKey = recentVisits.keys().next().value;
    if (oldestKey) {
      recentVisits.delete(oldestKey);
    }
  }

  try {
    console.log(`[MindCache Background] Logging visit (dwell_time=${dwellTime.toFixed(1)}s): ${url}`);

    // Try client-side extraction for richer content
    const extraction = tabId !== undefined ? await getPageExtraction(tabId) : null;

    if (extraction) {
      console.log(`[MindCache Background] Client-side extraction succeeded for ${url}`);
      const payload = sanitizeExtraction({
        url,
        title: extraction.title || title || null,
        dwell_time: dwellTime,
        extracted_content: extraction.content,
        extracted_content_html: extraction.contentHtml,
        description: extraction.description || undefined,
        author: extraction.author || undefined,
        site_name: extraction.site || undefined,
        published_date: extraction.published || undefined,
        language: extraction.language || undefined,
        schema_org: extraction.schemaOrgData || undefined,
        meta_tags: extraction.metaTags || undefined,
        highlights: extraction.highlights || undefined,
        selection: extraction.selection || undefined,
        selection_html: extraction.selectionHtml || undefined,
      });
      await backendClient.recordVisit(payload);
    } else {
      if (tabId !== undefined) {
        console.log(`[MindCache Background] Client-side extraction unavailable, sending basic payload for ${url}`);
      }
      await backendClient.recordVisit({
        url,
        title: title || null,
        dwell_time: dwellTime,
      });
    }
  } catch (err) {
    // Fail silently in background without crashing worker; handles offline server state
    console.warn(`[MindCache Background] Backend server unreachable. Skipped: ${url}`, err);
  }
}

// 1. Monitor active tab switches
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab && tab.url) {
      handleTabActivated(activeInfo.tabId, tab.url, tab.title || "");
    }
  });
});

// 2. Monitor page navigation updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.active) {
    handleTabActivated(tabId, tab.url, tab.title || "");
  }
});

// 3. Monitor tab closure
chrome.tabs.onRemoved.addListener((tabId) => {
  handleTabDeactivated(tabId);
});

// 4. Monitor window focus changes (e.g. user switching windows/applications)
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    handleTabDeactivated(null);
  } else {
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      const active = tabs[0];
      if (active && active.url && active.id) {
        handleTabActivated(active.id, active.url, active.title || "");
      }
    });
  }
});

// 3. Monitor extension command hotkeys (e.g. Ctrl+Shift+K)
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-search-overlay") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id) {
        chrome.tabs.sendMessage(activeTab.id, { action: "toggle-overlay" }).catch((err) => {
          console.warn("[MindCache Background] Error sending toggle message to content script:", err);
        });
      }
    });
  }
});

// 4. Handle messages from content script overlays (CORS bypass for searches)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "get-active-tabs") {
    chrome.tabs.query({}, (tabs) => {
      const formatted = tabs.map((t) => ({
        id: t.id,
        windowId: t.windowId,
        title: t.title || "Untitled Tab",
        url: t.url || "",
        favIconUrl: t.favIconUrl || "",
        active: t.active,
      }));
      sendResponse({ status: "ok", tabs: formatted });
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === "search-memory") {
    const query = message.query || "";
    const limit = message.limit || 8;
    backendClient
      .search(query, limit, false)
      .then((res) => {
        sendResponse({ status: "ok", results: res.results || [] });
      })
      .catch((err) => {
        console.error("[MindCache Background] Search memory failed:", err);
        sendResponse({ status: "error", error: err.message || "Failed to query backend" });
      });
    return true;
  }

  if (message.action === "check-backend-health") {
    backendClient
      .checkHealth()
      .then((res) => {
        sendResponse({ status: "ok", health: res });
      })
      .catch((err) => {
        sendResponse({ status: "error", error: err.message || "Offline" });
      });
    return true;
  }

  if (message.action === "get-current-extraction") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const active = tabs[0];
      if (!active || !active.id) {
        sendResponse({ status: "error", error: "No active tab" });
        return;
      }
      getPageExtraction(active.id).then((extraction) => {
        if (extraction) {
          sendResponse({ status: "ok", extraction });
        } else {
          sendResponse({ status: "no-content" });
        }
      }).catch(() => {
        sendResponse({ status: "error", error: "Extraction failed" });
      });
    });
    return true;
  }

  if (message.action === "switch-to-tab") {
    const { tabId, windowId } = message;
    if (tabId) {
      chrome.tabs.update(tabId, { active: true }, () => {
        if (windowId) {
          chrome.windows.update(windowId, { focused: true });
        }
      });
      sendResponse({ status: "ok" });
    } else {
      sendResponse({ status: "error", error: "Missing tabId" });
    }
    return true;
  }

  if (message.action === "open-url") {
    const { url } = message;
    if (url) {
      chrome.tabs.create({ url });
      sendResponse({ status: "ok" });
    } else {
      sendResponse({ status: "error", error: "Missing url" });
    }
    return true;
  }

  return false;
});

console.log("[MindCache Background] Service worker initialized successfully.");
