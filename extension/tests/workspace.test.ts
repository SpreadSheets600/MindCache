import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve(process.cwd(), "../frontend/workspace.html"), "utf8");
const app = readFileSync(resolve(process.cwd(), "../frontend/app.js"), "utf8");
const models = {
  embedding: { model: "google/embeddinggemma-2", dimension: 768, status: "not_downloaded", device: "cpu" },
  generation: { provider: "disabled", model: "", endpoint: "", api_key_set: false, allow_remote: false },
};

beforeEach(() => {
  document.open(); document.write(html); document.close();
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (path: string, options?: RequestInit) => ({
    ok: true,
    json: async () => path === "/documents?limit=100" ? [{ id: 1, title: "Saved page", domain: "example.com" }] :
      path.startsWith("/items?") ? [{ id: 2, title: "My note", kind: "note" }] : path === "/ai/models" ? models : {},
  })));
  new Function(app)();
});

describe("web workspace", () => {
  it("filters saved pages and notes without losing the full list", async () => {
    await waitFor(() => expect(document.querySelector("#results")?.textContent).toContain("Saved page"));
    (document.querySelector('[data-kind="note"]') as HTMLButtonElement).click();
    expect(document.querySelector("#results")?.textContent).toContain("My note");
    expect(document.querySelector("#results")?.textContent).not.toContain("Saved page");
    (document.querySelector('[data-kind="all"]') as HTMLButtonElement).click();
    expect(document.querySelector("#results")?.textContent).toContain("Saved page");
  });

  it("shows the fixed embedding model and its download state", async () => {
    (document.querySelector('[data-view="models"]') as HTMLButtonElement).click();
    await waitFor(() => expect(document.querySelector("#embedding-info")?.textContent).toContain("google/embeddinggemma-2 · 768 dimensions"));
    expect(document.querySelector("#embedding-info")?.textContent).toContain("not downloaded yet");
    expect((document.querySelector("#download-embedding") as HTMLButtonElement).hidden).toBe(false);
    expect(document.querySelector("#embedding-provider")).toBeNull();
  });

  it("shows fields relevant to the chosen generation provider", async () => {
    (document.querySelector('[data-view="models"]') as HTMLButtonElement).click();
    await waitFor(() => expect(document.querySelector("#embedding-info")?.textContent).toContain("768"));
    const provider = document.querySelector("#generation-provider") as HTMLSelectElement;
    const endpoint = document.querySelector("#generation-endpoint") as HTMLInputElement;
    const key = document.querySelector("#generation-key") as HTMLInputElement;
    expect(endpoint.hidden).toBe(true);
    provider.value = "openai";
    provider.dispatchEvent(new Event("change", { bubbles: true }));
    expect(endpoint.hidden).toBe(false);
    expect(key.hidden).toBe(false);
    expect((document.querySelector("#download-generation") as HTMLButtonElement).hidden).toBe(true);
    provider.value = "disabled";
    provider.dispatchEvent(new Event("change", { bubbles: true }));
    expect((document.querySelector("#generation-model") as HTMLInputElement).hidden).toBe(true);
  });

  it("shows a running download when returning to model settings", async () => {
    vi.mocked(fetch).mockImplementation(async (path: string) => ({
      ok: true,
      json: async () => path === "/ai/models" ? models : path === "/ai/downloads" ? { embedding: { status: "downloading", model: "google/embeddinggemma-2" } } : [],
    }) as Response);
    (document.querySelector('[data-view="models"]') as HTMLButtonElement).click();
    await waitFor(() => expect(document.querySelector("#embedding-download-status")?.textContent).toContain("Downloading google/embeddinggemma-2"));
    expect((document.querySelector("#download-embedding") as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves generation settings with the typed key before requesting a download", async () => {
    (document.querySelector('[data-view="models"]') as HTMLButtonElement).click();
    await waitFor(() => expect(document.querySelector("#embedding-info")?.textContent).toContain("768"));
    const provider = document.querySelector("#generation-provider") as HTMLSelectElement;
    provider.value = "ollama";
    provider.dispatchEvent(new Event("change", { bubbles: true }));
    (document.querySelector("#generation-model") as HTMLInputElement).value = "llama3.2";
    (document.querySelector("#generation-endpoint") as HTMLInputElement).value = "http://localhost:11434";
    (document.querySelector("#generation-key") as HTMLInputElement).value = "sk-typed";
    (document.querySelector("#download-generation") as HTMLButtonElement).click();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([path, options]) => path === "/ai/downloads" && options?.method === "POST")).toBe(true));
    const calls = vi.mocked(fetch).mock.calls;
    const saveIndex = calls.findIndex(([path, options]) => path === "/ai/generation" && options?.method === "PUT");
    expect(JSON.parse(calls[saveIndex][1]!.body as string)).toMatchObject({ model: "llama3.2", api_key: "sk-typed" });
    expect(saveIndex).toBeLessThan(calls.findIndex(([path, options]) => path === "/ai/downloads" && options?.method === "POST"));
  });
});
