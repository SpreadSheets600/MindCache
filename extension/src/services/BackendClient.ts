import { useSettingsStore } from "../store/settingsStore";
import { useConnectionStore } from "../store/connectionStore";
import {
  VisitRequest,
  VisitResponse,
  SearchResponse,
  HealthCheckResponse,
  DocumentResponse,
} from "../types";

export class BackendClientError extends Error {
  public status?: number;
  public details?: any;

  constructor(message: string, status?: number, details?: any) {
    super(message);
    this.name = "BackendClientError";
    this.status = status;
    this.details = details;
  }
}

class BackendClient {
  private getBaseUrl(): string {
    return useSettingsStore.getState().backendUrl.replace(/\/+$/, "");
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    retries = 2,
    delay = 300
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${path}`;
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    let lastError: any = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
          let errorDetails = "";
          try {
            const errJson = await response.json();
            errorDetails = errJson.detail || JSON.stringify(errJson);
          } catch {
            errorDetails = await response.text();
          }

          throw new BackendClientError(
            errorDetails || `HTTP Error ${response.status}`,
            response.status,
            errorDetails
          );
        }

        const data = await response.json();
        return data as T;
      } catch (err: any) {
        lastError = err;
        
        // Don't retry client errors (4xx)
        if (err instanceof BackendClientError && err.status && err.status >= 400 && err.status < 500) {
          throw err;
        }

        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError || new BackendClientError("Network error: Unable to connect to local backend.");
  }

  /**
   * Health Check Diagnostic ping
   */
  public async checkHealth(): Promise<HealthCheckResponse> {
    const { setConnectionStatus, setChecking } = useConnectionStore.getState();
    setChecking(true);
    try {
      // 0 retries for health check to avoid hanging UI
      const data = await this.request<HealthCheckResponse>("/health", { method: "GET" }, 0);
      
      // Response validation
      if (!data || typeof data.status !== "string" || !data.components) {
        throw new Error("Invalid health check response schema");
      }

      setConnectionStatus(true, data.components);
      return data;
    } catch (err) {
      setConnectionStatus(false, null);
      throw err;
    }
  }

  /**
   * Post visit record
   */
  public async recordVisit(payload: VisitRequest): Promise<VisitResponse> {
    try {
      const data = await this.request<VisitResponse>("/visit", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!data || typeof data.status !== "string" || typeof data.message !== "string") {
        throw new Error("Invalid visit response schema");
      }

      return data;
    } catch (err: any) {
      console.error("Failed to record visit in backend:", err);
      throw err;
    }
  }

  /**
   * Perform Natural Language Semantic Search
   */
  public async search(
    query: string,
    limit = 5,
    generateSummary = false,
    startTime?: string,
    endTime?: string
  ): Promise<SearchResponse> {
    try {
      const payload: any = {
        query,
        limit,
        generate_summary: generateSummary,
      };

      if (startTime) payload.start_time = new Date(startTime).toISOString();
      if (endTime) payload.end_time = new Date(endTime).toISOString();

      const data = await this.request<SearchResponse>("/search", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Simple structural validation
      if (!data || typeof data.query !== "string" || !Array.isArray(data.results)) {
        throw new Error("Invalid search response schema");
      }

      return data;
    } catch (err: any) {
      console.error("Search API query failure:", err);
      throw err;
    }
  }

  /**
   * Delete Document
   */
  public async deleteDocument(documentId: number): Promise<{ message: string }> {
    try {
      const data = await this.request<{ message: string }>(
        `/documents/${documentId}`,
        { method: "DELETE" }
      );
      return data;
    } catch (err: any) {
      console.error(`Failed to delete document ${documentId}:`, err);
      throw err;
    }
  }

  /**
   * Fetch Single Document Details By ID
   */
  public async getDocument(documentId: number): Promise<DocumentResponse> {
    try {
      const data = await this.request<DocumentResponse>(`/documents/${documentId}`);
      if (!data || typeof data.id !== "number" || typeof data.extracted_content !== "string") {
        throw new Error("Invalid document details response schema");
      }
      return data;
    } catch (err: any) {
      console.error(`Failed to fetch document ${documentId}:`, err);
      throw err;
    }
  }

  /**
   * List Stored Documents (ordered by last updated timestamp)
   */
  public async listDocuments(skip = 0, limit = 100): Promise<DocumentResponse[]> {
    try {
      const data = await this.request<DocumentResponse[]>(
        `/documents?skip=${skip}&limit=${limit}`
      );
      if (!Array.isArray(data)) {
        throw new Error("Invalid documents list response schema");
      }
      return data;
    } catch (err: any) {
      console.error("Failed to list documents:", err);
      throw err;
    }
  }
}

export const backendClient = new BackendClient();
