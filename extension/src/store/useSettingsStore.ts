import { create } from 'zustand';
import { storageService } from '../services/storage';
import type { AppSettings } from '../types';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (updated: Partial<AppSettings>) => Promise<void>;
}

/**
 * Global store to manage user configurations, automatically synchronizing
 * updates with Chrome Storage API.
 */
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: {
    backendUrl: 'http://localhost:8000',
    autoTracking: true,
    privacyMode: false,
    excludedDomains: [],
  },
  isLoading: true,

  loadSettings: async () => {
    set({ isLoading: true });
    const settings = await storageService.getSettings();
    set({ settings, isLoading: false });
  },

  updateSettings: async (updated: Partial<AppSettings>) => {
    await storageService.saveSettings(updated);
    const settings = await storageService.getSettings();
    set({ settings });
  },
}));
