export interface Keyword {
  keyword: string;
  score: number;
}

export interface SearchResultItem {
  id: number;
  url: string;
  domain: string;
  title: string | null;
  summary: string | null;
  score: number;
  published_date: string | null;
  last_visited_at: string;
  keywords: Keyword[];
  source_type: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  ai_summary: string | null;
}

export interface VisitRequest {
  url: string;
  title: string | null;
}

export interface VisitResponse {
  status: string; // 'success', 'duplicate', 'error'
  message: string;
  document_id: number | null;
  title: string | null;
  domain: string | null;
}

export interface DocumentResponse {
  id: number;
  url: string;
  domain: string;
  title: string | null;
  author: string | null;
  published_date: string | null;
  extracted_content: string;
  source_type: string;
  platform_metadata: Record<string, any> | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
  keywords: Keyword[];
  visit_history: string[];
}

export interface ExtensionSettings {
  backendUrl: string;
  autoTracking: boolean;
  excludedDomains: string[];
  privacyMode: boolean;
}

export interface BackendComponentStatus {
  database: "connected" | "disconnected";
  faiss_index: {
    status: string;
    vectors_count: number;
  };
  ollama: {
    status: "connected" | "offline";
    model: string | null;
  };
  embedding?: {
    status: "connected" | "offline";
    model: string;
    provider: string;
  };
}

export interface HealthCheckResponse {
  status: "healthy" | "degraded";
  components: BackendComponentStatus;
}
