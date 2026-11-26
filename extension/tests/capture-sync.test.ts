import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ getCapture: vi.fn(), putCapture: vi.fn() }));
vi.mock("../src/services/BackendClient", () => ({ backendClient: backend }));

import { pullCaptureSettings, startCaptureSync } from "../src/services/captureSync";
import { useSettingsStore } from "../src/store/settingsStore";

const remote = { auto_tracking: true, auto_extract: false, delay_seconds: 45, excluded_domains: ["bank.com"], configured: true };

describe("capture settings shared through the backend", () => {
  beforeEach(() => {
    backend.getCapture.mockReset();
    backend.putCapture.mockReset().mockResolvedValue(remote);
    useSettingsStore.getState().resetSettings();
  });

  it("adopts the backend's settings so every client agrees", async () => {
    backend.getCapture.mockResolvedValue(remote);
    await pullCaptureSettings(true);
    const state = useSettingsStore.getState();
    expect([state.autoTracking, state.autoExtract, state.captureDelaySeconds, state.excludedDomains]).toEqual([true, false, 45, ["bank.com"]]);
    expect(backend.putCapture).not.toHaveBeenCalled();
  });

  it("uploads existing local choices when the backend has none yet", async () => {
    backend.getCapture.mockResolvedValue({ ...remote, configured: false });
    useSettingsStore.getState().setCaptureDelaySeconds(20);
    await pullCaptureSettings(true);
    expect(backend.putCapture).toHaveBeenCalledWith(expect.objectContaining({ delay_seconds: 20 }));
    expect(useSettingsStore.getState().captureDelaySeconds).toBe(20);
  });

  it("sends local changes to the backend", async () => {
    vi.useFakeTimers();
    backend.getCapture.mockResolvedValue(remote);
    startCaptureSync();
    await vi.advanceTimersByTimeAsync(0);
    backend.putCapture.mockClear();
    useSettingsStore.getState().setAutoTracking(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(backend.putCapture).toHaveBeenCalledTimes(1);
    expect(backend.putCapture).toHaveBeenCalledWith(expect.objectContaining({ auto_tracking: false, delay_seconds: 45 }));
    vi.useRealTimers();
  });

  it("keeps local settings when the backend is unreachable", async () => {
    backend.getCapture.mockRejectedValue(new Error("offline"));
    useSettingsStore.getState().setCaptureDelaySeconds(33);
    await pullCaptureSettings(true);
    expect(useSettingsStore.getState().captureDelaySeconds).toBe(33);
  });
});
