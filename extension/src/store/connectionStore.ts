import { create } from "zustand";
import { BackendComponentStatus } from "../types";

interface ConnectionState {
  isOnline: boolean;
  isChecking: boolean;
  components: BackendComponentStatus | null;
  lastChecked: number | null;
  setConnectionStatus: (
    isOnline: boolean,
    components: BackendComponentStatus | null
  ) => void;
  setChecking: (isChecking: boolean) => void;
  clearConnectionStatus: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isOnline: false,
  isChecking: false,
  components: null,
  lastChecked: null,
  setConnectionStatus: (isOnline, components) =>
    set({
      isOnline,
      components,
      isChecking: false,
      lastChecked: Date.now(),
    }),
  setChecking: (isChecking) => set({ isChecking }),
  clearConnectionStatus: () =>
    set({
      isOnline: false,
      components: null,
      lastChecked: null,
      isChecking: false,
    }),
}));
