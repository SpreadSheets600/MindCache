import { backendClient } from "../services/BackendClient";
import { useSettingsStore } from "../store/settingsStore";

const VISIT_COOLDOWN_MS = 20000; // 20-second cooldown for the same URL to prevent write spam
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

    // Ignore localhost, local loopbacks, and internal IP address spaces
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.endsWith(".local")
    ) {
      return false;
    }

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

/**
 * Queues and sends page visit events to the FastAPI backend.
 */
async function processVisit(url: string, title: string) {
  if (!shouldTrack(url)) return;

  const now = Date.now();
  const lastProcessed = recentVisits.get(url);

  // Prevent duplicate operations during navigation transitions or reload spams
  if (lastProcessed && now - lastProcessed < VISIT_COOLDOWN_MS) {
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
    console.log(`[MindCache Background] Logging visit: ${url}`);
    await backendClient.recordVisit({
      url,
      title: title || null,
    });
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
      processVisit(tab.url, tab.title || "");
    }
  });
});

// 2. Monitor page navigation updates/URL modifications
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    processVisit(tab.url, tab.title || "");
  }
});

console.log("[MindCache Background] Service worker initialized successfully.");
