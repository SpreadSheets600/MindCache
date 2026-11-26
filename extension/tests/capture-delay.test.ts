import { afterEach, expect, it, vi } from "vitest";

const recordVisit = vi.fn().mockResolvedValue({});
vi.mock("../src/services/BackendClient", () => ({ backendClient: { recordVisit } }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("waits for the selected delay before automatic capture", async () => {
  vi.useFakeTimers();
  const events = {
    activated: vi.fn(), updated: vi.fn(), removed: vi.fn(), focused: vi.fn(),
    changed: vi.fn(), installed: vi.fn(), clicked: vi.fn(), command: vi.fn(), message: vi.fn(),
  };
  vi.stubGlobal("chrome", {
    storage: {
      local: { get: (_key: string, done: (value: object) => void) => done({}), set: (_value: object, done: () => void) => done() },
      onChanged: { addListener: events.changed },
    },
    contextMenus: { onClicked: { addListener: events.clicked } },
    runtime: { onInstalled: { addListener: events.installed }, onMessage: { addListener: events.message } },
    tabs: {
      onActivated: { addListener: events.activated }, onUpdated: { addListener: events.updated },
      onRemoved: { addListener: events.removed },
      get: (id: number, done: (tab: object) => void) => done({ id, url: "https://example.com/article", title: "Article" }),
      sendMessage: vi.fn().mockResolvedValue({ content: "Example content" }),
    },
    windows: { onFocusChanged: { addListener: events.focused }, WINDOW_ID_NONE: -1 },
    commands: { onCommand: { addListener: events.command } },
  });
  vi.resetModules();
  const { useSettingsStore } = await import("../src/store/settingsStore");
  await useSettingsStore.persist.rehydrate();
  useSettingsStore.getState().setAutoTracking(true);
  useSettingsStore.getState().setCaptureDelaySeconds(30);
  await import("../src/background/index");
  await Promise.resolve();
  events.activated.mock.calls[0][0]({ tabId: 1 });
  await vi.advanceTimersByTimeAsync(29_000);
  expect(recordVisit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(recordVisit).toHaveBeenCalledOnce();
  expect(recordVisit.mock.calls[0][0].dwell_time).toBeGreaterThanOrEqual(30);

  recordVisit.mockClear();
  useSettingsStore.getState().setCaptureDelaySeconds(60);
  events.activated.mock.calls[0][0]({ tabId: 2 });
  await vi.advanceTimersByTimeAsync(10_000);
  events.removed.mock.calls[0][0](2);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(recordVisit).not.toHaveBeenCalled();

  events.activated.mock.calls[0][0]({ tabId: 3 });
  await vi.advanceTimersByTimeAsync(10_000);
  useSettingsStore.getState().setCaptureDelaySeconds(15);
  events.changed.mock.calls[0][0]({ "mindcache-settings-store": {} }, "local");
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(recordVisit).toHaveBeenCalledOnce();
});
