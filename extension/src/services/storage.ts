import type { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  backendUrl: 'http://localhost:8000',
  autoTracking: true,
  privacyMode: false,
  excludedDomains: [],
};

/**
 * Service to manage Chrome Storage API operations, ensuring consistent
 * configurations across popup UI and background service worker contexts.
 */
export const storageService = {
  /**
   * Retrieves current application settings, falling back to defaults if unconfigured.
   */
  async getSettings(): Promise<AppSettings> {
    return new Promise((resolve) => {
      // Handle environment check for non-chrome environments (like local vite development)
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        const localData = localStorage.getItem('mindcache_settings');
        if (localData) {
          try {
            return resolve(JSON.parse(localData));
          } catch {
            // Fallback
          }
        }
        return resolve(DEFAULT_SETTINGS);
      }

      chrome.storage.local.get('settings', (result) => {
        if (result && result.settings) {
          resolve({ ...DEFAULT_SETTINGS, ...result.settings });
        } else {
          // Initialize defaults
          chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
          resolve(DEFAULT_SETTINGS);
        }
      });
    });
  },

  /**
   * Merges partial configuration updates into Chrome Storage.
   */
  async saveSettings(updated: Partial<AppSettings>): Promise<void> {
    const current = await this.getSettings();
    const next = { ...current, ...updated };

    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        localStorage.setItem('mindcache_settings', JSON.stringify(next));
        resolve();
        return;
      }

      chrome.storage.local.set({ settings: next }, () => {
        resolve();
      });
    });
  },

  /**
   * Listeners for real-time configuration changes, returns unsubscribe handle.
   */
  onSettingsChanged(callback: (settings: AppSettings) => void): () => void {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      const handler = (e: StorageEvent) => {
        if (e.key === 'mindcache_settings' && e.newValue) {
          callback(JSON.parse(e.newValue));
        }
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    }

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.settings && changes.settings.newValue) {
        callback(changes.settings.newValue as AppSettings);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  },
};
