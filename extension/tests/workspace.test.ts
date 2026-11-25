import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve(process.cwd(), "../frontend/workspace.html"), "utf8");
const app = readFileSync(resolve(process.cwd(), "../frontend/app.js"), "utf8");
const models = {
  embedding: { provider: "transformers", model: "old/model", endpoint: "", api_key_env: "", allow_remote: false },
  generation: { provider: "disabled", model: "", endpoint: "", api_key_env: "", allow_remote: false },
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

  it("shows fields relevant to the chosen model provider", async () => {
    (document.querySelector('[data-view="models"]') as HTMLButtonElement).click();
    await waitFor(() => expect((document.querySelector("#embedding-model") as HTMLInputElement).value).toBe("old/model"));
    const provider = document.querySelector("#embedding-provider") as HTMLSelectElement;
    const endpoint = document.querySelector("#embedding-endpoint") as HTMLInputElement;
    expect(endpoint.hidden).toBe(true);
    provider.value = "openai";
    provider.dispatchEvent(new Event("change", { bubbles: true }));
    expect(endpoint.hidden).toBe(false);
    expect((document.querySelector("#download-embedding") as HTMLButtonElement).hidden).toBe(true);
    provider.value = "disabled";
    provider.dispatchEvent(new Event("change", { bubbles: true }));
    expect((document.querySelector("#embedding-model") as HTMLInputElement).hidden).toBe(true);
  });

  it("shows a running download when returning to model settings", async () => {
    vi.mocked(fetch).mockImplementation(async (path: string) => ({
      ok: true,
      json: async () => path === "/ai/models" ? models : path === "/ai/downloads" ? { embedding: { status: "downloading", model: "old/model" } } : [],
    }) as Response);
    (document.querySelector('[data-view="models"]') as HTMLButtonElement).click();
    await waitFor(() => expect(document.querySelector("#embedding-download-status")?.textContent).toContain("Downloading old/model"));
    expect((document.querySelector("#download-embedding") as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves the entered model before requesting a download", async () => {
    (document.querySelector('[data-view="models"]') as HTMLButtonElement).click();
    await waitFor(() => expect((document.querySelector("#embedding-model") as HTMLInputElement).value).toBe("old/model"));
    (document.querySelector("#embedding-model") as HTMLInputElement).value = "new/model";
    (document.querySelector("#download-embedding") as HTMLButtonElement).click();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([path, options]) => path === "/ai/downloads" && options?.method === "POST")).toBe(true));
    const calls = vi.mocked(fetch).mock.calls;
    const save = calls.find(([path, options]) => path === "/ai/models" && options?.method === "PUT");
    expect(JSON.parse(save![1]!.body as string).embedding.model).toBe("new/model");
    expect(calls.findIndex(([path, options]) => path === "/ai/models" && options?.method === "PUT")).toBeLessThan(calls.findIndex(([path, options]) => path === "/ai/downloads" && options?.method === "POST"));
  });
});
