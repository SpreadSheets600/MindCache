import { create } from 'zustand';
import { backendClient } from '../services/backendClient';
import type { HealthCheckResponse } from '../types';

interface ConnectionState {
  isOnline: boolean;
  health: HealthCheckResponse | null;
  isChecking: boolean;
  checkConnection: () => Promise<boolean>;
}

/**
 * Global store managing local server connectivity and diagnostic components state.
 */
export const useConnectionStore = create<ConnectionState>((set) => ({
  isOnline: false,
  health: null,
  isChecking: false,

  checkConnection: async () => {
    set({ isChecking: true });
    try {
      const response = await backendClient.checkHealth();
      set({
        isOnline: response.status === 'healthy' || response.status === 'degraded',
        health: response,
        isChecking: false,
      });
      return true;
    } catch {
      set({
        isOnline: false,
        health: null,
        isChecking: false,
      });
      return false;
    }
  },
}));
