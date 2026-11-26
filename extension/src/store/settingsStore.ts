import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { ExtensionSettings } from "../types";
import { extensionStorage } from "../utils/storage";

interface SettingsState extends ExtensionSettings {
  setBackendUrl: (url: string) => void;
  setAutoTracking: (enabled: boolean) => void;
  setAutoExtract: (enabled: boolean) => void;
  setCaptureDelaySeconds: (seconds: number) => void;
  setPrivacyMode: (enabled: boolean) => void;
  setExcludedDomains: (domains: string[]) => void;
  addExcludedDomain: (domain: string) => void;
  removeExcludedDomain: (domain: string) => void;
  resetSettings: () => void;
}

const defaultSettings: ExtensionSettings = {
  backendUrl: "http://localhost:8000",
  autoTracking: false,
  autoExtract: true,
  captureDelaySeconds: 10,
  excludedDomains: [
    "localhost",
    "127.0.0.1",
    "chrome",
    "edge",
    "about",
    "google.com/search",
    "youtube.com/results",
  ],
  privacyMode: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setBackendUrl: (backendUrl) => set({ backendUrl }),
      setAutoTracking: (autoTracking) => set({ autoTracking }),
      setAutoExtract: (autoExtract) => set({ autoExtract }),
      setCaptureDelaySeconds: (seconds) => {
        if (Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600) {
          set({ captureDelaySeconds: seconds });
        }
      },
      setPrivacyMode: (privacyMode) => set({ privacyMode }),
      setExcludedDomains: (excludedDomains) => set({ excludedDomains }),
      addExcludedDomain: (domain) =>
        set((state) => {
          const trimmed = domain.trim().toLowerCase();
          if (!trimmed || state.excludedDomains.includes(trimmed)) return state;
          return { excludedDomains: [...state.excludedDomains, trimmed] };
        }),
      removeExcludedDomain: (domain) =>
        set((state) => ({
          excludedDomains: state.excludedDomains.filter((d) => d !== domain),
        })),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "mindcache-settings-store",
      storage: createJSONStorage(() => extensionStorage),
    }
  )
);
