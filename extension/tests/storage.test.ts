import { describe, test, expect, beforeEach } from 'vitest';
import { storageService } from '../src/services/storage';

// Global type overrides for test environment
declare global {
  namespace NodeJS {
    interface Global {
      chrome: any;
      localStorage: any;
    }
  }
}

describe('Storage Service Tests', () => {
  let localStorageMock: { [key: string]: string } = {};

  beforeEach(() => {
    localStorageMock = {};
    // Mock global window and localStorage
    global.localStorage = {
      getItem: (key: string) => localStorageMock[key] || null,
      setItem: (key: string, value: string) => {
        localStorageMock[key] = value;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
      clear: () => {
        localStorageMock = {};
      },
    } as any;

    // Reset chrome mock
    (global as any).chrome = undefined;
  });

  test('should fallback to localStorage if chrome.storage is unavailable', async () => {
    // 1. Get default settings
    const settings = await storageService.getSettings();
    expect(settings.backendUrl).toBe('http://localhost:8000');
    expect(settings.autoTracking).toBe(true);

    // 2. Save settings to localStorage
    await storageService.saveSettings({ backendUrl: 'http://localhost:9000', autoTracking: false });

    // 3. Get updated settings
    const updatedSettings = await storageService.getSettings();
    expect(updatedSettings.backendUrl).toBe('http://localhost:9000');
    expect(updatedSettings.autoTracking).toBe(false);
  });

  test('should use chrome.storage.local when available in browser context', async () => {
    let mockStore: any = {};
    
    // Configure global chrome mock
    (global as any).chrome = {
      storage: {
        local: {
          get: (key: string, callback: (data: any) => void) => {
            callback(mockStore[key] ? { [key]: mockStore[key] } : {});
          },
          set: (data: any, callback?: () => void) => {
            mockStore = { ...mockStore, ...data };
            if (callback) callback();
          },
        },
      },
    } as any;

    // Save settings via mocked chrome API
    await storageService.saveSettings({ excludedDomains: ['example.com'] });

    const settings = await storageService.getSettings();
    expect(settings.excludedDomains).toContain('example.com');
    expect(mockStore.settings).toBeDefined();
  });
});
