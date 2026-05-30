import { StateStorage } from "zustand/middleware";

export const extensionStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const result = await new Promise<{ [key: string]: any }>((resolve) => {
          chrome.storage.local.get(name, (items) => resolve(items));
        });
        return result[name] ? JSON.stringify(result[name]) : null;
      }
      return localStorage.getItem(name);
    } catch (e) {
      console.warn(`Storage read failed for key ${name}:`, e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const parsedValue = JSON.parse(value);
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await new Promise<void>((resolve) => {
          chrome.storage.local.set({ [name]: parsedValue }, () => resolve());
        });
        return;
      }
      localStorage.setItem(name, value);
    } catch (e) {
      console.warn(`Storage write failed for key ${name}:`, e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await new Promise<void>((resolve) => {
          chrome.storage.local.remove(name, () => resolve());
        });
        return;
      }
      localStorage.removeItem(name);
    } catch (e) {
      console.warn(`Storage remove failed for key ${name}:`, e);
    }
  },
};
