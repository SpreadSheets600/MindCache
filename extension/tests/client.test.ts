import { describe, test, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { backendClient, BackendClientError } from '../src/services/backendClient';

describe('Backend Client Tests', () => {
  let originalFetch: any;

  beforeAll(() => {
    originalFetch = global.fetch;
    let mockStore: { [key: string]: string } = {};
    global.localStorage = {
      getItem: (key: string) => mockStore[key] || null,
      setItem: (key: string, value: string) => {
        mockStore[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        mockStore = {};
      },
    } as any;
  });

  beforeEach(() => {
    // Mock global fetch
    global.fetch = vi.fn() as any;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('should resolve healthcheck cleanly on successful server response', async () => {
    const mockResponse = {
      status: 'healthy',
      components: {
        database: 'connected',
        faiss_index: { status: 'initialized', vectors_count: 42 },
        ollama: { status: 'connected', model: 'qwen2:0.5b' },
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const health = await backendClient.checkHealth();
    expect(health.status).toBe('healthy');
    expect(health.components.faiss_index.vectors_count).toBe(42);
    expect(health.components.ollama.model).toBe('qwen2:0.5b');
  });

  test('should throw BackendClientError when status is non-200', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(backendClient.recordVisit('http://site.com', 'Site')).rejects.toThrow(
      BackendClientError
    );
  });
});
