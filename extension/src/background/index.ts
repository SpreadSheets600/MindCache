import { backendClient } from "../services/BackendClient";
import { useSettingsStore } from "../store/settingsStore";

const recentVisits = new Map<string, number>();

// Rehydrate settings store on background startup
useSettingsStore.persist.rehydrate();

// Create context menus on install
function createContextMenus() {
  chrome.contextMenus.create({
    id: "save-page",
    title: "Save this page to MindCache",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "save-link",
    title: "Save this link to MindCache",
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: "save-selection",
    title: "Save selection to MindCache",
    contexts: ["selection"],
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    createContextMenus();
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-page" && tab?.id && tab?.url) {
    captureCurrentPage(tab.id, tab.url, tab.title || "");
  }
  if (info.menuItemId === "save-link" && info.linkUrl) {
    captureUrl(info.linkUrl);
  }
  if (info.menuItemId === "save-selection" && tab?.id) {
    captureSelection(tab.id, tab.url || "", tab.title || "");
  }
});

// Workaround: Sync settings changes from the popup/options UI to the background context
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes["mindcache-settings-store"]) {
      useSettingsStore.persist.rehydrate();
      console.log("[MindCache Background] Settings store rehydrated from storage changes.");
    }
  });
}

const BLACKLISTED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dmg', '.pkg', '.msi',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
];

function isBlacklistedExtension(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const pathname = u.pathname.toLowerCase();
    return BLACKLISTED_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

const BLACKLISTED_PATHS = [
  '/login', '/signup', '/register', '/logout', '/reset-password',
  '/forgot-password', '/subscribe', '/pricing', '/checkout', '/cart',
  '/wp-admin', '/admin', '/login/', '/signup/', '/register/',
];

function isBlacklistedPath(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const path = u.pathname.toLowerCase();
    return BLACKLISTED_PATHS.some(p => path === p || path.startsWith(p + '/'));
  } catch {
    return false;
  }
}

function isExcludedDomain(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();
    const settings = useSettingsStore.getState();
    for (const rule of settings.excludedDomains) {
      const cleanRule = rule.trim().toLowerCase();
      if (cleanRule && hostname.includes(cleanRule)) return true;
    }
  } catch {}
  return false;
}

function shouldTrack(urlStr: string): boolean {
  if (!urlStr) return false;

  try {
    const url = new URL(urlStr);

    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (urlStr.startsWith("chrome-extension://")) return false;

    const settings = useSettingsStore.getState();
    if (!settings.autoTracking) return false;
    if (isExcludedDomain(urlStr)) return false;
    if (isBlacklistedPath(urlStr)) return false;
    if (isBlacklistedExtension(urlStr)) return false;

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

  if (activeTab && activeTab.tabId === tabId && activeTab.url === url) {
    return;
  }

  await handleTabDeactivated(null);

  console.log(`[MindCache Background] Tracking started for active URL: ${url}`);

  const state: ActiveTabState = {
    tabId,
    url,
    title,
    activatedAt: Date.now(),
    indexed: false,
  };

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

  if (!state.indexed) {
    await processVisit(state.url, state.title, durationSeconds, state.tabId);
  }
}

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
    // Content script not available
  }
  return null;
}

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

async function processVisit(url: string, title: string, dwellTime: number, tabId?: number) {
  if (!shouldTrack(url)) return;

  const now = Date.now();
  const lastProcessed = recentVisits.get(url);

  if (lastProcessed && now - lastProcessed < 10000) return;

  recentVisits.set(url, now);
  if (recentVisits.size > 200) {
    const oldestKey = recentVisits.keys().next().value;
    if (oldestKey) recentVisits.delete(oldestKey);
  }

  const settings = useSettingsStore.getState();

  try {
    // When auto-extract is off, skip extraction entirely — user must trigger manually
    if (!settings.autoExtract) {
      console.log(`[MindCache Background] Auto-extract disabled. Skipping extraction for ${url}`);
      return;
    }

    console.log(`[MindCache Background] Logging visit (dwell_time=${dwellTime.toFixed(1)}s): ${url}`);

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

// 4. Monitor window focus changes
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

// 5. Monitor extension command hotkeys
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
  if (command === "capture-page") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const active = tabs[0];
      if (!active || !active.id || !active.url) return;
      captureCurrentPage(active.id, active.url, active.title || "");
    });
  }
});

async function captureCurrentPage(tabId: number, url: string, title: string) {
  try {
    const extraction = await getPageExtraction(tabId);
    if (extraction) {
      const payload = sanitizeExtraction({
        url,
        title: extraction.title || title || null,
        dwell_time: DWELL_TIME_THRESHOLD_SEC,
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
      console.log(`[MindCache Background] Page captured via keybind: ${url}`);
    }
  } catch (err) {
    console.warn(`[MindCache Background] Capture failed for ${url}:`, err);
  }
}

async function captureUrl(url: string) {
  if (!shouldTrack(url)) return;
  try {
    await backendClient.recordVisit({
      url,
      title: url,
      dwell_time: 0,
    });
    console.log(`[MindCache Background] Link saved to MindCache: ${url}`);
  } catch (err) {
    console.warn(`[MindCache Background] Failed to save link ${url}:`, err);
  }
}

async function captureSelection(tabId: number, url: string, title: string) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: "extract-selection" });
    if (res?.text) {
      await backendClient.recordVisit({
        url,
        title: title || null,
        dwell_time: 0,
        extracted_content: res.text,
        selection: res.text,
        selection_html: res.html || undefined,
      });
      console.log(`[MindCache Background] Selection saved from: ${url}`);
    }
  } catch (err) {
    console.warn(`[MindCache Background] Failed to save selection from ${url}:`, err);
  }
}

// 6. Handle messages
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
    return true;
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

  if (message.action === "capture-page") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const active = tabs[0];
      if (!active || !active.id || !active.url) {
        sendResponse({ status: "error", error: "No active tab" });
        return;
      }
      try {
        const extraction = await getPageExtraction(active.id);
        if (extraction) {
          const payload = sanitizeExtraction({
            url: active.url,
            title: extraction.title || active.title || null,
            dwell_time: message.dwellTime || DWELL_TIME_THRESHOLD_SEC,
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
          const result = await backendClient.recordVisit(payload);
          sendResponse({ status: "ok", result });
        } else {
          sendResponse({ status: "error", error: "Could not extract page content. The content script may not be available on this page." });
        }
      } catch (err: any) {
        sendResponse({ status: "error", error: err.message || "Failed to capture page" });
      }
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
