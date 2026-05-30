import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Chrome Extension API namespaces
const chromeMock = {
  storage: {
    local: {
      get: vi.fn((_key, callback) => {
        if (callback) callback({});
      }),
      set: vi.fn((_data, callback) => {
        if (callback) callback();
      }),
      remove: vi.fn((_key, callback) => {
        if (callback) callback();
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    onActivated: {
      addListener: vi.fn(),
    },
    onUpdated: {
      addListener: vi.fn(),
    },
    get: vi.fn((_id, callback) => {
      callback({ id: _id, url: "https://example.com", title: "Example" });
    }),
  },
  runtime: {
    openOptionsPage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
    lastError: undefined,
  },
};

global.chrome = chromeMock as any;

// Mock global fetch API
global.fetch = vi.fn();

// Clear mocks before each test runs
beforeEach(() => {
  vi.clearAllMocks();
});
