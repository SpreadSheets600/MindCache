export interface Keyword {
  keyword: string;
  score: number;
}

export interface Entity {
  name: string;
  type: string;  // Person, Company, Technology, Project, etc.
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
  dwell_time?: number;

  extracted_content?: string;
  extracted_content_html?: string;
  description?: string;
  author?: string;
  site_name?: string;
  published_date?: string;
  language?: string;

  schema_org?: Record<string, any>;
  meta_tags?: { name?: string; property?: string; content: string }[];
  keywords?: string[];

  highlights?: { text: string; content: string; xpath: string }[];
  selection?: string;
  selection_html?: string;
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
  entities: Entity[];
  visit_history: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "document" | "keyword" | "entity";
  url?: string;
  domain?: string;
  source_type?: string;
  updated_at?: string;
  visit_count?: number;
  entity_type?: string;
  document_count?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "has_keyword" | "has_entity" | "co_occurs";
  weight?: number;
}

export interface GraphResponse {
  nodes: {
    documents: GraphNode[];
    entities: GraphNode[];
    keywords: GraphNode[];
  };
  edges: GraphEdge[];
  stats: {
    document_count: number;
    entity_count: number;
    keyword_count: number;
    edge_count: number;
  };
}

export interface ExtensionSettings {
  backendUrl: string;
  autoTracking: boolean;
  autoExtract: boolean;
  excludedDomains: string[];
  privacyMode: boolean;
}

export interface BackendComponentStatus {
  database: {
    status: "connected" | "disconnected";
    documents_count: number;
  };
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
