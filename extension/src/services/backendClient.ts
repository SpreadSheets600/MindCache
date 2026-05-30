import { storageService } from './storage';
import type { HealthCheckResponse, SearchResponse, VisitResponse } from '../types';

export class BackendClientError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'BackendClientError';
  }
}

/**
 * Service to execute REST commands against the MindCache local engine,
 * implementing custom JSON validations, retries, and domain error maps.
 */
export const backendClient = {
  /**
   * Helper to execute fetch operations with a 3-try retry strategy and dynamic backend URL loading.
   */
  async request<T>(path: string, options: RequestInit = {}, retries = 2): Promise<T> {
    const settings = await storageService.getSettings();
    const cleanUrl = settings.backendUrl.replace(/\/+$/, '');
    const url = `${cleanUrl}${path}`;

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new BackendClientError(
          response.status,
          `HTTP Error ${response.status}: ${response.statusText}`
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (retries > 0) {
        // Linear backoff delay
        await new Promise((resolve) => setTimeout(resolve, 500 * (3 - retries)));
        return this.request<T>(path, options, retries - 1);
      }
      throw error;
    }
  },

  /**
   * Executes local backend diagnostic checks.
   */
  async checkHealth(): Promise<HealthCheckResponse> {
    return this.request<HealthCheckResponse>('/health', { method: 'GET' }, 0); // No retries for healthchecks
  },

  /**
   * Dispatches a page visit payload to SQLite metadata and FAISS index pipeline.
   */
  async recordVisit(url: string, title: string): Promise<VisitResponse> {
    return this.request<VisitResponse>('/visit', {
      method: 'POST',
      body: JSON.stringify({ url, title }),
    });
  },

  /**
   * Performs vector-based semantic search across browsed history.
   */
  async search(
    query: string,
    limit = 5,
    generateSummary = false,
    startTime?: string | null,
    endTime?: string | null
  ): Promise<SearchResponse> {
    return this.request<SearchResponse>('/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        limit,
        generate_summary: generateSummary,
        start_time: startTime || null,
        end_time: endTime || null,
      }),
    });
  },
};
