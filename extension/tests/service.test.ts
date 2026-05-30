import { describe, it, expect, vi, beforeEach } from "vitest";
import { backendClient, BackendClientError } from "../src/services/BackendClient";
import { useConnectionStore } from "../src/store/connectionStore";

describe("BackendClient Service API Tests", () => {
  beforeEach(() => {
    useConnectionStore.getState().clearConnectionStatus();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("should perform successful health checks and update stores", async () => {
    const healthMockResponse = {
      status: "healthy",
      components: {
        database: "connected",
        faiss_index: { status: "initialized", vectors_count: 12 },
        ollama: { status: "connected", model: "llama3" },
      },
    };

    // Setup global fetch mock
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => healthMockResponse,
    });

    const res = await backendClient.checkHealth();
    expect(res.status).toBe("healthy");
    expect(res.components.database).toBe("connected");
    expect(useConnectionStore.getState().isOnline).toBe(true);
    expect(useConnectionStore.getState().components?.faiss_index.vectors_count).toBe(12);
  });

  it("should fail health check gracefully on offline errors", async () => {
    (global.fetch as any).mockRejectedValue(new Error("Failed to fetch"));

    await expect(backendClient.checkHealth()).rejects.toThrow();
    expect(useConnectionStore.getState().isOnline).toBe(false);
    expect(useConnectionStore.getState().components).toBeNull();
  });

  it("should submit visits to the backend", async () => {
    const visitMockRes = {
      status: "success",
      message: "Indexed successfully",
      document_id: 101,
      title: "Google",
      domain: "google.com",
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => visitMockRes,
    });

    const response = await backendClient.recordVisit({
      url: "https://google.com",
      title: "Google",
    });

    expect(response.status).toBe("success");
    expect(response.document_id).toBe(101);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/visit"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "https://google.com", title: "Google" }),
      })
    );
  });

  it("should query semantic search and validate output shape", async () => {
    const searchMockRes = {
      query: "Docker help",
      results: [
        {
          id: 1,
          url: "https://docker.com/help",
          domain: "docker.com",
          title: "Docker Help",
          summary: "Guide on docker containers",
          score: 0.95,
          published_date: null,
          last_visited_at: "2026-05-30T12:00:00Z",
          keywords: [{ keyword: "docker", score: 0.99 }],
        },
      ],
      ai_summary: "Docker containers provide isolated environments",
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => searchMockRes,
    });

    const response = await backendClient.search("Docker help", 5, true);

    expect(response.query).toBe("Docker help");
    expect(response.results.length).toBe(1);
    expect(response.results[0].domain).toBe("docker.com");
    expect(response.ai_summary).toContain("isolated environments");
  });
});
