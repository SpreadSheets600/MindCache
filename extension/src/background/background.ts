import { storageService } from '../services/storage';
import { backendClient } from '../services/backendClient';

// Helper to determine if a URL should be ignored
function shouldIgnoreUrl(url: string, excludedDomains: string[]): boolean {
  if (!url) return true;

  // 1. Ignore browser internal pages and protocols
  const ignoredPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'file://',
    'view-source:',
    'chrome-error://',
  ];

  if (ignoredPrefixes.some((prefix) => url.startsWith(prefix))) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // 2. Ignore local hosts
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.')
    ) {
      return true;
    }

    // 3. Ignore domains on the user's excluded list (and their subdomains)
    const isExcluded = excludedDomains.some((domain) => {
      const target = domain.toLowerCase().trim();
      return hostname === target || hostname.endsWith('.' + target);
    });

    if (isExcluded) {
      return true;
    }
  } catch {
    // Treat malformed URLs as ignored
    return true;
  }

  return false;
}

// Queue to prevent duplicate rapid trigger calls for identical tabs/URLs
const visitedUrlsQueue = new Map<string, number>();

async function handlePageVisit(url: string, title: string) {
  const settings = await storageService.getSettings();

  // Guard: Verify auto-tracking is enabled
  if (!settings.autoTracking) {
    return;
  }

  // Guard: Verify privacy exclusions
  if (shouldIgnoreUrl(url, settings.excludedDomains)) {
    return;
  }

  // Guard: Deduplicate rapid triggers (within 10 seconds for the same URL)
  const now = Date.now();
  const lastVisitedTime = visitedUrlsQueue.get(url);
  if (lastVisitedTime && now - lastVisitedTime < 10000) {
    return;
  }
  visitedUrlsQueue.set(url, now);

  // Clean up queue memory occasionally (max 100 entries)
  if (visitedUrlsQueue.size > 100) {
    const firstKey = visitedUrlsQueue.keys().next().value;
    if (firstKey) visitedUrlsQueue.delete(firstKey);
  }

  try {
    console.log(`[MindCache Background] Dispatching page visit: ${url}`);
    const response = await backendClient.recordVisit(url, title || url);
    console.log(`[MindCache Background] Ingestion complete. Status: ${response.status}`);
  } catch (error) {
    // Graceful logging - never crash background threads on network disconnects
    console.warn(`[MindCache Background] Local backend server is offline or unreachable:`, error);
  }
}

// --- BROWSER EVENT LISTENERS ---

// 1. Monitor tab navigation updates
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.title) {
    handlePageVisit(tab.url, tab.title);
  }
});

// 2. Monitor tab switching / activations
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) return;
      if (tab.url && tab.title) {
        handlePageVisit(tab.url, tab.title);
      }
    });
  } catch (error) {
    console.debug('[MindCache Background] Activated tab fetching failed:', error);
  }
});

// 3. Command dispatcher for Ctrl+Shift+K to open Spotlight popup programmatically
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open_search') {
    console.log('[MindCache Background] Command received: open_search');
    // Browser API Workaround: Opens popup programmatically via chrome.action API
    if (chrome.action && typeof chrome.action.openPopup === 'function') {
      chrome.action.openPopup();
    } else {
      console.warn('[MindCache Background] Programmatic popup open unsupported in this browser environment.');
    }
  }
});

console.log('[MindCache Background] Browser memory engine initialized.');
