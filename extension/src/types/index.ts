export interface Keyword {
  keyword: string;
  score: number;
}

export interface SearchResult {
  id: number;
  url: string;
  domain: string;
  title: string | null;
  summary: string | null;
  score: number;
  published_date: string | null;
  last_visited_at: string;
  keywords: Keyword[];
  source_type?: string | null;
  extracted_content?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  ai_summary: string | null;
}

export interface AppSettings {
  backendUrl: string;
  autoTracking: boolean;
  privacyMode: boolean;
  excludedDomains: string[];
}

export interface VisitRequest {
  url: string;
  title: string;
}

export interface VisitResponse {
  status: 'success' | 'duplicate' | 'error';
  message: string;
  document_id?: number;
  title?: string;
  domain?: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  components: {
    database: 'connected' | 'disconnected';
    faiss_index: {
      status: string;
      vectors_count: number;
    };
    ollama: {
      status: 'connected' | 'offline';
      model: string | null;
    };
  };
}
