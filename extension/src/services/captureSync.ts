import { useSettingsStore } from "../store/settingsStore";
import { backendClient } from "./BackendClient";
import type { CaptureSettings } from "../types";

const PULL_INTERVAL_MS = 30_000;
const PUSH_DELAY_MS = 400;

let applying = false;
let synced = "";
let lastPull = 0;
let started = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function fromStore(): CaptureSettings {
  const state = useSettingsStore.getState();
  return {
    auto_tracking: state.autoTracking,
    auto_extract: state.autoExtract,
    delay_seconds: state.captureDelaySeconds,
    excluded_domains: state.excludedDomains,
  };
}

function snapshot(values: CaptureSettings): string {
  return JSON.stringify([values.auto_tracking, values.auto_extract, values.delay_seconds, values.excluded_domains]);
}

function apply(remote: CaptureSettings) {
  synced = snapshot(remote);
  applying = true;
  try {
    useSettingsStore.setState({
      autoTracking: remote.auto_tracking,
      autoExtract: remote.auto_extract,
      captureDelaySeconds: remote.delay_seconds,
      excludedDomains: remote.excluded_domains,
    });
  } finally {
    applying = false;
  }
}

export async function pullCaptureSettings(force = false): Promise<void> {
  if (!force && Date.now() - lastPull < PULL_INTERVAL_MS) return;
  lastPull = Date.now();
  try {
    const remote = await backendClient.getCapture();
    if (remote.configured) apply(remote);
    else await push();
  } catch {
    lastPull = 0;
  }
}

async function push() {
  const values = fromStore();
  try {
    await backendClient.putCapture(values);
    synced = snapshot(values);
    lastPull = Date.now();
  } catch {
    lastPull = 0;
  }
}

export function startCaptureSync(): void {
  if (started) return;
  started = true;
  useSettingsStore.subscribe((state, previous) => {
    if (applying) return;
    if (state === previous || snapshot(fromStore()) === synced) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_DELAY_MS);
  });
  void pullCaptureSettings(true);
}
