import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ searchMemory: vi.fn(), absoluteUrl: vi.fn((path: string) => `http://127.0.0.1:8000${path}`), openFile: vi.fn() }));
vi.mock("../src/services/BackendClient", () => ({ backendClient: backend }));

import { SearchPage } from "../src/settings/SearchPage";
import { useConnectionStore } from "../src/store/connectionStore";

const page = { kind: "page", id: 1, title: "Cedar pruning guide", location: "https://garden.example/cedar", score: 0.03, reasons: ["keyword", "semantic"], passages: [{ text: "Prune cedar in late winter.", start: 0 }], open_url: "https://garden.example/cedar", when: "2026-11-01T10:00:00", domain: "garden.example" };
const file = { kind: "file", id: 7, title: "budget.md", location: "/home/me/docs/budget.md", score: 0.02, reasons: ["keyword"], passages: [{ text: "Cedar project budget.", start: 0 }], open_url: "/files/7/raw", when: "2026-11-02T09:00:00", folder: "/home/me/docs", ext: ".md", size: 2048 };

function view() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SearchPage onOpenDocument={vi.fn()} onNavigate={vi.fn()} /></QueryClientProvider>);
}

describe("unified search page", () => {
  beforeEach(() => {
    backend.searchMemory.mockReset().mockImplementation(async (_query, options) => ({ mode: options.mode, terms: ["cedar"], results: [page, file] }));
    backend.openFile.mockReset().mockResolvedValue({});
    useConnectionStore.setState({ isOnline: true, isChecking: false, components: { embedding: { status: "ready" } } as never });
  });

  it("shows pages and files together with matched words highlighted", async () => {
    view();
    fireEvent.change(screen.getByLabelText(/Search your pages/), { target: { value: "cedar" } });
    expect(await screen.findByText("budget.md")).toBeInTheDocument();
    expect(screen.getByTitle("Cedar pruning guide").querySelector("mark")).not.toBeNull();
    expect(screen.getByText(/\/home\/me\/docs\s+·\s+2 KB/)).toBeInTheDocument();
    const modes = backend.searchMemory.mock.calls.map((call) => call[1].mode);
    expect(modes).toContain("fast");
    expect(modes).toContain("full");
  });

  it("filters by kind and opens files on this computer", async () => {
    view();
    fireEvent.change(screen.getByLabelText(/Search your pages/), { target: { value: "cedar" } });
    await screen.findByText("budget.md");
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    await waitFor(() => expect(backend.searchMemory).toHaveBeenCalledWith("cedar", expect.objectContaining({ kinds: ["file"] })));
    fireEvent.click(await screen.findByRole("button", { name: /Show in folder/ }));
    await waitFor(() => expect(backend.openFile).toHaveBeenCalledWith(7, true));
  });

  it("explains when meaning search is unavailable", () => {
    useConnectionStore.setState({ components: { embedding: { status: "not_downloaded" } } as never });
    view();
    expect(screen.getByText(/Searching by words only/)).toBeInTheDocument();
  });
});
