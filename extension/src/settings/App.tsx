import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSettingsStore } from "../store/settingsStore";
import { useConnectionStore } from "../store/connectionStore";
import { backendClient } from "../services/BackendClient";
import { DocumentDetail } from "../components/DocumentDetail";
import { SidebarLink } from "../components/ui/sidebar";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { InteractiveKnowledgeGraph } from "../components/InteractiveKnowledgeGraph";
import {
    Brain,
    Database,
    Plus,
    Trash2,
    Shield,
    Server,
    LayoutDashboard,
    Search,
    ExternalLink,
    Eye,
    Settings,
    RefreshCw,
    FolderOpen,
    Network,
    Sparkles,
    Trophy,
    KeyRound,
    Clock,
    FileText as FileTextIcon,
} from "lucide-react";
import { getErrorMessage } from "../utils/error";

const DEFAULT_RESULT_LIMIT = 10;
const MAX_DOCUMENTS_FETCH = 100;
const SEARCH_DEBOUNCE_DELAY = 250;
const SAVE_SUCCESS_DURATION = 1500;
const RECENT_ACTIVITY_COUNT = 7;
const MAX_KEYWORDS_DISPLAY = 4;
const GRAPH_DISPLAY_MAX = 50;
const SCORE_PERCENTAGE_MULTIPLIER = 100;
const BEST_MATCH_THRESHOLD = 65;
const STRONG_MATCH_THRESHOLD = 55;
const DEFAULT_MIN_SCORE = 0;
const RESULT_LIMIT_OPTIONS = [5, 10, 20, 30] as const;

function formatDuration(seconds: number): string {
    if (!seconds || seconds < 1) return "";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}

type Page = "dashboard" | "search" | "graph" | "memories" | "settings" | "library" | "privacy" | "models" | "setup";
const isWebDashboard = typeof window !== "undefined" && /^https?:$/.test(window.location.protocol);

const App: React.FC = () => {
    const queryClient = useQueryClient();
    const [activePage, setActivePage] = useState<Page>(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const requestedPage = params.get("page") as Page;
            const page = isWebDashboard && requestedPage === "settings" ? "privacy" : requestedPage;
            if (
                page &&
                [
                    "dashboard",
                    "search",
                    "graph",
                    "memories",
                    "settings", "library", "privacy", "models", "setup",
                ].includes(page)
            ) {
                return page;
            }
        } catch {
        }
        if (isWebDashboard && new URLSearchParams(window.location.search).get("focus") === "search") return "search";
        return isWebDashboard ? "dashboard" : "settings";
    });
    const [detailDocId, setDetailDocId] = useState<number | null>(null);
    const embeddedFrame = useRef<HTMLIFrameElement>(null);
    const [frameHeight, setFrameHeight] = useState(700);

    useEffect(() => {
        const navigate = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== embeddedFrame.current?.contentWindow) return;
            if (event.data?.type === "mindcache:resize" && Number.isFinite(event.data.height)) {
                setFrameHeight(Math.max(240, Math.min(event.data.height, 100000)));
            }
            if (event.data?.type === "mindcache:navigate" && event.data.page === "models") {
                setActivePage("models");
                setDetailDocId(null);
            }
        };
        window.addEventListener("message", navigate);
        return () => window.removeEventListener("message", navigate);
    }, []);

    const {
        backendUrl,
        autoTracking,
        autoExtract,
        privacyMode,
        excludedDomains,
        setBackendUrl,
        setAutoTracking,
        setAutoExtract,
        setPrivacyMode,
        addExcludedDomain,
        removeExcludedDomain,
    } = useSettingsStore();

    const { isOnline, isChecking, components } = useConnectionStore();

    const [urlInput, setUrlInput] = useState(backendUrl);
    const [newDomain, setNewDomain] = useState("");
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [searchFilter, setSearchFilter] = useState("");

    const [dashSearch, setDashSearch] = useState("");
    const [debouncedDashSearch, setDebouncedDashSearch] = useState("");
    const [dashLimit, setDashLimit] = useState(DEFAULT_RESULT_LIMIT);
    const [dashAI, setDashAI] = useState(false);
    const [searchStartTime, setSearchStartTime] = useState("");
    const [searchEndTime, setSearchEndTime] = useState("");
    const [searchSourceType, setSearchSourceType] = useState("all");
    const [searchSortOrder, setSearchSortOrder] = useState("relevance");
    const [searchMinScore, setSearchMinScore] = useState(DEFAULT_MIN_SCORE);
    const [searchMinDwell, setSearchMinDwell] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedDashSearch(dashSearch), SEARCH_DEBOUNCE_DELAY);
        return () => clearTimeout(timer);
    }, [dashSearch]);

    useEffect(() => {
        setUrlInput(backendUrl);
    }, [backendUrl]);

    const runDiagnostics = async () => {
        try {
            await backendClient.checkHealth();
        } catch {
        }
    };

    useEffect(() => {
        runDiagnostics();
    }, []);

    const {
        data: documents = [],
        isLoading: isDocsLoading,
        refetch: refetchDocs,
    } = useQuery({
        queryKey: ["documents"],
        queryFn: () => backendClient.listDocuments(0, MAX_DOCUMENTS_FETCH),
        enabled: isOnline,
    });

    const { data: memoryStats } = useQuery({
        queryKey: ["privacy-overview"],
        queryFn: async () => {
            const response = await fetch("/privacy");
            if (!response.ok) throw new Error("Unable to load memory statistics");
            return response.json() as Promise<{ documents: number; items: number; search_queries: number; search_clicks: number }>;
        },
        enabled: isOnline && isWebDashboard,
    });

    const domainTimeData = useMemo(() => {
        const map = new Map<string, { total: number; count: number }>();
        for (const doc of documents) {
            const dt = (doc as any).total_dwell_time || 0;
            const cur = map.get(doc.domain) || { total: 0, count: 0 };
            cur.total += dt;
            cur.count += 1;
            map.set(doc.domain, cur);
        }
        return Array.from(map.entries())
            .map(([domain, data]) => ({ domain, ...data }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);
    }, [documents]);

    const {
        data: dashSearchResults,
        isLoading: isDashSearchLoading,
        isError: isDashSearchError,
        error: dashSearchError,
    } = useQuery({
        queryKey: [
            "dashSearch",
            debouncedDashSearch,
            dashLimit,
            dashAI,
            searchStartTime,
            searchEndTime,
        ],
        queryFn: () =>
            backendClient.search(
                debouncedDashSearch,
                dashLimit,
                dashAI,
                searchStartTime || undefined,
                searchEndTime || undefined,
            ),
        enabled: isOnline && !!debouncedDashSearch.trim(),
        retry: false,
    });

    const processedResults = useMemo(() => {
        if (!dashSearchResults?.results) return [];
        let items = [...dashSearchResults.results];

        if (searchSourceType !== "all") {
            items = items.filter(
                (item) => item.source_type?.toLowerCase() === searchSourceType.toLowerCase()
            );
        }

        if (searchMinScore > DEFAULT_MIN_SCORE) {
            items = items.filter((item) => Math.round(item.score * SCORE_PERCENTAGE_MULTIPLIER) >= searchMinScore);
        }

        if (searchMinDwell > 0) {
            items = items.filter((item) => (item.total_dwell_time || 0) >= searchMinDwell);
        }

        if (searchSortOrder === "date_desc") {
            items.sort((a, b) => new Date(b.last_visited_at).getTime() - new Date(a.last_visited_at).getTime());
        } else if (searchSortOrder === "date_asc") {
            items.sort((a, b) => new Date(a.last_visited_at).getTime() - new Date(b.last_visited_at).getTime());
        } else if (searchSortOrder === "domain") {
            items.sort((a, b) => (a.domain || "").localeCompare(b.domain || ""));
        } else if (searchSortOrder === "dwell_desc") {
            items.sort((a, b) => (b.total_dwell_time || 0) - (a.total_dwell_time || 0));
        } else if (searchSortOrder === "dwell_asc") {
            items.sort((a, b) => (a.total_dwell_time || 0) - (b.total_dwell_time || 0));
        }

        return items;
    }, [dashSearchResults, searchSourceType, searchMinScore, searchSortOrder, searchMinDwell]);

    useEffect(() => {
        if (isOnline && activePage === "memories") {
            refetchDocs();
        }
    }, [activePage, isOnline]);

    const [deleteError, setDeleteError] = useState<string | null>(null);

    const deleteMutation = useMutation({
        mutationFn: (id: number) => backendClient.deleteDocument(id),
        onSuccess: () => {
            setDeleteError(null);
            queryClient.invalidateQueries({ queryKey: ["documents"] });
            refetchDocs();
        },
        onError: (err: any) => {
            setDeleteError(err?.message || "Failed to delete document. Check backend logs.");
        },
    });

    const handleSaveUrl = () => {
        setBackendUrl(urlInput);
        setSaveSuccess(true);
        setTimeout(() => {
            setSaveSuccess(false);
            runDiagnostics();
        }, SAVE_SUCCESS_DURATION);
    };

    const handleAddDomain = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanDomain = newDomain.trim().toLowerCase();
        if (cleanDomain) {
            addExcludedDomain(cleanDomain);
            setNewDomain("");
        }
    };

    const handleDeleteDoc = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        deleteMutation.mutate(id);
    };

    const filteredDocuments = documents.filter((doc) => {
        const term = searchFilter.toLowerCase();
        return (
            (doc.title && doc.title.toLowerCase().includes(term)) ||
            doc.url.toLowerCase().includes(term) ||
            doc.domain.toLowerCase().includes(term)
        );
    });

    const navItem = (page: Page, label: string, icon: React.ReactNode) => (
        <SidebarLink icon={icon} active={(activePage === page || (page === "privacy" && (activePage === "models" || activePage === "setup"))) && !detailDocId} onClick={() => {
            if (!isWebDashboard && (page === "dashboard" || page === "search" || page === "memories" || page === "library" || page === "privacy" || page === "models" || page === "setup")) {
                const base = useSettingsStore.getState().backendUrl.replace(/\/+$/, "");
                chrome.tabs.create({ url: `${base}/app/${page === "search" ? "?focus=search" : page === "dashboard" || page === "memories" ? "" : `?page=${page}`}` });
                return;
            }
            setActivePage(page);
            setDetailDocId(null);
        }} className="shrink-0 md:w-full">
            {label}
        </SidebarLink>
    );

    const renderContent = () => {
        if (detailDocId !== null) {
            return (
                <DocumentDetail
                    documentId={detailDocId}
                    onBack={() => setDetailDocId(null)}
                />
            );
        }

        switch (activePage) {
            case "library":
                return <iframe key={activePage} ref={embeddedFrame} title="library workspace" src="/app/workspace.html?embedded=1&view=library" scrolling="no" style={{ height: frameHeight }} className="block w-full border-0" />;
            case "privacy":
            case "models":
            case "setup":
                return <div>
                    <nav aria-label="Settings sections" className="mb-6 flex gap-1 border-b border-border">
                        <button type="button" aria-current={activePage !== "models" ? "page" : undefined} onClick={() => setActivePage("privacy")} className={`px-4 py-3 text-sm ${activePage !== "models" ? "border-b-2 border-blue-400 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Privacy</button>
                        <button type="button" aria-current={activePage === "models" ? "page" : undefined} onClick={() => setActivePage("models")} className={`px-4 py-3 text-sm ${activePage === "models" ? "border-b-2 border-blue-400 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Models</button>
                    </nav>
                    <iframe key={activePage} ref={embeddedFrame} title={`${activePage} workspace`} src={`/app/workspace.html?embedded=1&view=${activePage === "setup" ? "privacy" : activePage}`} scrolling="no" style={{ height: frameHeight }} className="block w-full border-0" />
                </div>;
            case "dashboard":
                return (
                    <div className="home-layout">
                        <section className="home-welcome">
                            <div className="home-title-row"><div><h2>Your memory at a glance</h2><p>Everything you’ve saved, ready when you need it.</p></div><button className="home-add" onClick={() => setActivePage("library")}><Plus className="h-4 w-4" /> Add to memory</button></div>
                            <form className="home-search" onSubmit={(event) => { event.preventDefault(); setActivePage("search"); }}>
                                <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
                                <label htmlFor="home-query" className="sr-only">Search your memory</label>
                                <input id="home-query" value={dashSearch} onChange={(event) => setDashSearch(event.target.value)} placeholder="What are you looking for?" />
                                <button type="submit">Search</button>
                            </form>
                        </section>
                        <div className="home-metrics" aria-label="Memory statistics">
                            <div><span>Saved pages</span><strong>{isOnline ? (memoryStats?.documents ?? components?.database?.documents_count ?? "—") : "—"}</strong><small>Captured from your browser</small></div>
                            <div><span>Notes &amp; files</span><strong>{memoryStats?.items ?? "—"}</strong><small>Added to your memory</small></div>
                            <div><span>Searches saved</span><strong>{memoryStats?.search_queries ?? "—"}</strong><small>According to your privacy settings</small></div>
                            <div><span>Search index</span><strong>{isOnline && components?.faiss_index.status === "initialized" ? components.faiss_index.vectors_count : "—"}</strong><small>Page vectors indexed</small></div>
                        </div>
                        <div className="home-columns">
                            <section className="home-recent" aria-labelledby="recent-title">
                                <div className="home-section-header"><div><h3 id="recent-title">Recently saved</h3><p>Pick up where you left off.</p></div><button onClick={() => setActivePage("library")}>All documents</button></div>
                                {!isOnline ? <div className="home-empty"><p>Your memory is unavailable.</p><span>Start MindCache and try connecting again.</span><button onClick={runDiagnostics} disabled={isChecking}>{isChecking ? "Checking…" : "Retry connection"}</button></div> : isDocsLoading ? <div className="home-empty"><p>Loading your saved pages…</p></div> : documents.length === 0 ? <div className="home-empty"><FolderOpen className="h-6 w-6" aria-hidden="true" /><p>Your saved pages will appear here.</p><span>Capture a page with the browser extension, or add a note or file.</span><button onClick={() => setActivePage("library")}>Open documents</button></div> : <div className="home-rows">{documents.slice(0, RECENT_ACTIVITY_COUNT).map((doc) => <button type="button" key={doc.id} className="home-row" onClick={() => setDetailDocId(doc.id)}><span className="home-document-icon"><FileTextIcon /></span><span className="min-w-0 flex-1"><strong>{doc.title || doc.url}</strong><span>{doc.domain}</span></span><time dateTime={doc.updated_at}>{new Date(doc.updated_at).toLocaleDateString()}</time></button>)}</div>}
                            </section>
                            <aside className="home-aside" aria-label="Workspace information">
                                <section><h3>Your workspace</h3><div className="home-status"><span>Connection</span><strong>{isChecking ? "Checking…" : isOnline ? "Connected" : "Offline"}</strong></div><div className="home-status"><span>Saved pages</span><strong>{isOnline ? (components?.database?.documents_count ?? documents.length) : "—"}</strong></div><div className="home-status"><span>Embedding model</span><strong title={components?.embedding?.model || ""}>{components?.embedding?.status === "connected" ? components.embedding.model : "Unavailable"}</strong></div><button className="home-link" onClick={() => setActivePage("models")}>Manage models</button></section>
                                <section><h3>Make it yours</h3><p>Choose what MindCache keeps and how it searches.</p><button className="home-link" onClick={() => setActivePage("privacy")}>Privacy controls</button><button className="home-link" onClick={() => setActivePage("library")}>Add notes and files</button></section>
                                <details><summary>Technical details</summary><div className="home-status"><span>Search vectors</span><strong>{components?.faiss_index.status === "initialized" ? components.faiss_index.vectors_count : "—"}</strong></div><div className="home-status"><span>Domains indexed</span><strong>{isOnline ? new Set(documents.map(d => d.domain)).size : "—"}</strong></div>{domainTimeData.map(d => <div className="home-status" key={d.domain}><span>{d.domain}</span><strong>{formatDuration(d.total)}</strong></div>)}<button className="home-link" onClick={runDiagnostics} disabled={isChecking}>Refresh connection</button></details>
                            </aside>
                        </div>
                    </div>
                );

            case "memories":
                return (
                    <div className="space-y-4">
                        <div className="flex items-center bg-secondary/50 border border-border px-3 py-2 rounded-md space-x-2">
                            <Search className="w-4 h-4 text-muted-foreground" />
                            <Input
                                type="text"
                                value={searchFilter}
                                onChange={(e) =>
                                    setSearchFilter(e.target.value)
                                }
                                placeholder="Filter by title, domain, or URL..."
                                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                            />
                            {searchFilter && (
                                <button
                                    onClick={() => setSearchFilter("")}
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        {isDocsLoading ? (
                            <div className="flex flex-col items-center justify-center h-64 space-y-2">
                                <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
                                <p className="text-xs text-muted-foreground">
                                    Loading...
                                </p>
                            </div>
                        ) : filteredDocuments.length === 0 ? (
                            <div className="p-12 text-center border border-dashed border-border rounded-lg">
                                <FolderOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                                <p className="text-xs text-muted-foreground">
                                    {searchFilter
                                        ? "No matching pages."
                                        : "No documents recorded yet."}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredDocuments.map((doc) => (
                                    <Card
                                        key={doc.id}
                                        className="flex flex-col gap-4 transition-colors hover:bg-secondary/30 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="space-y-1 max-w-[80%]">
                                            <h3><button type="button" onClick={() => setDetailDocId(doc.id)} className="text-left text-sm font-medium hover:text-primary transition-colors" title={doc.title || doc.url}>{doc.title || "Untitled Page"}</button></h3>
                                            <div className="flex items-center space-x-2 text-[11px] text-muted-foreground">
                                                <span className="truncate max-w-[200px]">
                                                    {doc.domain}
                                                </span>
                                                <span className="text-muted-foreground/30">
                                                    -
                                                </span>
                                                <span>
                                                    {new Date(
                                                        doc.updated_at,
                                                    ).toLocaleDateString()}
                                                </span>
                                                {(doc as any).total_dwell_time > 0 && (
                                                    <>
                                                        <span className="text-muted-foreground/30">-</span>
                                                        <span className="font-mono text-[10px] text-amber-400/70">
                                                            {formatDuration((doc as any).total_dwell_time)}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            {doc.keywords &&
                                                doc.keywords.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {doc.keywords
                                                            .slice(0, MAX_KEYWORDS_DISPLAY)
                                                            .map((kw, idx) => (
                                                                <span
                                                                    key={idx}
                                                                    className="text-[10px] text-muted-foreground/50 font-mono"
                                                                >
                                                                    {kw.keyword}
                                                                    {idx <
                                                                    Math.min(
                                                                        doc
                                                                            .keywords
                                                                            .length,
                                                                        MAX_KEYWORDS_DISPLAY,
                                                                    ) -
                                                                        1
                                                                        ? ","
                                                                        : ""}
                                                                </span>
                                                            ))}
                                                    </div>
                                                )}
                                        </div>

                                        <div className="flex items-center space-x-1.5">
                                            <button
                                                onClick={() =>
                                                    setDetailDocId(doc.id)
                                                }
                                                className="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                                                title="View"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() =>
                                                    window.open(
                                                        doc.url,
                                                        "_blank",
                                                    )
                                                }
                                                className="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                                                title="Open"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) =>
                                                    handleDeleteDoc(doc.id, e)
                                                }
                                                className="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-red-400 transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                        {deleteError && (
                            <div className="p-3 rounded-md bg-red-950/20 border border-red-900/30 text-red-400 text-xs">
                                {deleteError}
                                <button onClick={() => setDeleteError(null)} className="ml-2 underline">Dismiss</button>
                            </div>
                        )}
                    </div>
                );

            case "settings":
                return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="md:col-span-2 space-y-6">
                            <div className="space-y-3">
                                <div className="flex items-center space-x-2 text-sm font-medium">
                                    <Server className="w-4 h-4 text-muted-foreground" />
                                    <span>Server</span>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-muted-foreground">
                                        Base URL
                                    </label>
                                    <div className="flex space-x-2">
                                        <Input
                                            type="text"
                                            aria-label="Backend URL"
                                            value={urlInput}
                                            onChange={(e) =>
                                                setUrlInput(e.target.value)
                                            }
                                            placeholder="http://localhost:8000"
                                            className="flex-1 bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-primary transition-colors"
                                        />
                                        <button
                                            onClick={handleSaveUrl}
                                            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 active:scale-95 transition-colors"
                                        >
                                            {saveSuccess ? "Saved" : "Save"}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-border" />

                            <div className="space-y-4">
                                <div className="flex items-center space-x-2 text-sm font-medium">
                                    <Shield className="w-4 h-4 text-muted-foreground" />
                                    <span>Privacy</span>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-sm">
                                                Auto tab tracking
                                            </label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Automatically index pages as you
                                                browse.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-label="Auto tab tracking"
                                            aria-checked={autoTracking}
                                            onClick={() =>
                                                setAutoTracking(!autoTracking)
                                            }
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                                autoTracking
                                                    ? "bg-primary"
                                                    : "bg-secondary"
                                            }`}
                                        >
                                            <span
                                                className={`inline-block h-3.5 w-3.5 rounded-full bg-foreground transition-transform ${
                                                    autoTracking
                                                        ? "translate-x-4"
                                                        : "translate-x-0.5"
                                                }`}
                                            />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-sm">
                                                Private search logging
                                            </label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Don't save recent search
                                                queries.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-label="Private search logging"
                                            aria-checked={privacyMode}
                                            onClick={() =>
                                                setPrivacyMode(!privacyMode)
                                            }
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                                privacyMode
                                                    ? "bg-primary"
                                                    : "bg-secondary"
                                            }`}
                                        >
                                            <span
                                                className={`inline-block h-3.5 w-3.5 rounded-full bg-foreground transition-transform ${
                                                    privacyMode
                                                        ? "translate-x-4"
                                                        : "translate-x-0.5"
                                                }`}
                                            />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-sm">
                                                Auto extraction
                                            </label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Automatically extract and index page content while browsing. When off, use the popup or keybind to save pages manually.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-label="Auto extraction"
                                            aria-checked={autoExtract}
                                            onClick={() =>
                                                setAutoExtract(!autoExtract)
                                            }
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                                autoExtract
                                                    ? "bg-primary"
                                                    : "bg-secondary"
                                            }`}
                                        >
                                            <span
                                                className={`inline-block h-3.5 w-3.5 rounded-full bg-foreground transition-transform ${
                                                    autoExtract
                                                        ? "translate-x-4"
                                                        : "translate-x-0.5"
                                                }`}
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-border" />

                            <div className="space-y-4">
                                <div className="flex items-center space-x-2 text-sm font-medium">
                                    <KeyRound className="w-4 h-4 text-muted-foreground" />
                                    <span>Shortcuts</span>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                        Configure keyboard shortcuts for MindCache in your browser's extension shortcuts page.
                                    </p>
                                    <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Toggle Search Overlay</span>
                                            <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-300">Ctrl+Shift+K</kbd>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Capture Current Page</span>
                                            <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] font-mono text-zinc-300">Ctrl+Shift+S</kbd>
                                        </div>
                                        <div className="border-t border-border/40 my-1" />
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Right-click page</span>
                                            <span className="text-[10px] text-muted-foreground/60">Save this page to MindCache</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Right-click link</span>
                                            <span className="text-[10px] text-muted-foreground/60">Save this link to MindCache</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Right-click selection</span>
                                            <span className="text-[10px] text-muted-foreground/60">Save selection to MindCache</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}
                                        className="flex items-center space-x-1 text-xs text-primary hover:underline"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        <span>Customize shortcuts</span>
                                    </button>
                                </div>
                            </div>
                        </Card>

                        <Card className="space-y-6 self-start">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2 text-sm font-medium">
                                        <Database className="w-4 h-4 text-muted-foreground" />
                                        <span>Exclusions</span>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground font-mono">
                                        {excludedDomains.length}
                                    </span>
                                </div>

                                <form
                                    onSubmit={handleAddDomain}
                                    className="flex space-x-2"
                                >
                                    <Input
                                        type="text"
                                        aria-label="Domain to exclude"
                                        value={newDomain}
                                        onChange={(e) =>
                                            setNewDomain(e.target.value)
                                        }
                                        placeholder="example.com"
                                        className="flex-1 bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-primary"
                                    />
                                    <button
                                        type="submit"
                                        className="flex items-center space-x-1 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 active:scale-95 transition-colors"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Add</span>
                                    </button>
                                </form>

                                <div className="max-h-44 overflow-y-auto rounded-md border border-border">
                                    {excludedDomains.length === 0 ? (
                                        <p className="text-xs text-muted-foreground/40 italic p-4 text-center">
                                            No exclusions.
                                        </p>
                                    ) : (
                                        excludedDomains.map((domain, i) => (
                                            <div
                                                key={i}
                                                className={`flex items-center justify-between py-2 px-3 text-xs font-mono ${
                                                    i > 0
                                                        ? "border-t border-border/50"
                                                        : ""
                                                }`}
                                            >
                                                <span className="text-muted-foreground truncate max-w-[80%]">
                                                    {domain}
                                                </span>
                                                <button
                                                    onClick={() =>
                                                        removeExcludedDomain(
                                                            domain,
                                                        )
                                                    }
                                                    className="text-muted-foreground/60 hover:text-red-400 transition-colors"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-border" />

                            <div className="space-y-3">
                                <div className="flex items-center space-x-2 text-sm font-medium">
                                    <Shield className="w-4 h-4 text-muted-foreground" />
                                    <span>Auto-Excluded Pages</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                                    These common auth/shell pages are automatically skipped during tracking.
                                </p>
                                <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-secondary/10 p-2">
                                    {[
                                        '/login', '/signup', '/register', '/logout', '/auth',
                                        '/admin', '/checkout', '/cart', '/pricing', '/subscribe',
                                        '/oauth', '/authorize', '/sign-in', '/log-in', '/2fa',
                                        '/password-reset', '/verify-email', '/sessions',
                                    ].map((path, i) => (
                                        <span
                                            key={i}
                                            className="inline-block text-[10px] font-mono text-muted-foreground/60 bg-secondary/30 px-1.5 py-0.5 rounded mr-1 mb-1"
                                        >
                                            {path}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-[10px] text-muted-foreground/50 italic">
                                    Add domain-level exclusions above for more control.
                                </p>
                            </div>

                            <div className="border-t border-border" />
                        </Card>
                    </div>
                );
            case "graph":
                return (
                    <Card className="min-h-0 flex-1 overflow-hidden p-0">
                        <InteractiveKnowledgeGraph
                            documents={documents}
                            onDocumentClick={(id) => setDetailDocId(id)}
                            onDeleteDocument={(id) => deleteMutation.mutate(id)}
                        />
                    </Card>
                );
            case "search":
                return (
                    <div className="space-y-6">
                        <div>
                            <div className="flex items-center bg-secondary/35 border border-border px-4 py-3 rounded-lg space-x-3 focus-within:border-primary/50 transition-colors">
                                <Search className="w-5 h-5 text-blue-400" />
                                <Input
                                    type="text"
                                    value={dashSearch}
                                    onChange={(e) => setDashSearch(e.target.value)}
                                    placeholder="Ask anything about your web history..."
                                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 text-foreground"
                                />
                                {dashSearch && (
                                    <button
                                        onClick={() => setDashSearch("")}
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                    >
                                        Clear
                                    </button>
                                )}
                                <button
                                    onClick={() => setDashAI(!dashAI)}
                                    className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                                        dashAI
                                            ? "bg-primary/20 text-primary border border-primary/30"
                                            : "text-muted-foreground hover:text-foreground border border-transparent"
                                    }`}
                                    title="Generate AI summary of results"
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>AI Summary</span>
                                </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-2.5 text-xs text-muted-foreground/80 pl-1">
                                <span className="font-medium text-muted-foreground/60">Try:</span>
                                {[
                                    "that rust pdf parser",
                                    "the paper about transformers",
                                    "youtube video about rag pipelines"
                                ].map((query, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setDashSearch(query)}
                                        className="px-2.5 py-1 bg-secondary/30 hover:bg-secondary/70 border border-border/50 hover:border-border rounded-full text-[11.5px] cursor-pointer transition-colors hover:scale-[1.02] text-muted-foreground hover:text-foreground inline-flex items-center"
                                    >
                                        "{query}"
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="space-y-4">
                                <Card className="space-y-4">
                                    <h4 className="text-xs font-semibold text-zinc-300">
                                        Search scope
                                    </h4>

                                    <div className="space-y-1.5">
                                        <label className="text-[11px] text-muted-foreground">
                                            Result Limit
                                        </label>
                                        <select
                                            value={dashLimit}
                                            onChange={(e) =>
                                                setDashLimit(
                                                    parseInt(e.target.value),
                                                )
                                            }
                                            className="w-full bg-zinc-900 border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none"
                                        >
                                            {RESULT_LIMIT_OPTIONS.map((n) => (
                                                <option key={n} value={n}>
                                                    Top {n} matches
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="border-t border-zinc-800/60 pt-3.5 space-y-3">
                                        <h5 className="text-xs font-semibold text-zinc-400">
                                            Time range
                                        </h5>

                                        <div className="space-y-1 bg-zinc-950/20 p-1.5 rounded-md border border-zinc-900/50">
                                            <label className="text-[10.5px] text-muted-foreground flex justify-between">
                                                <span>Start Date & Time</span>
                                                {searchStartTime && (
                                                    <button
                                                        onClick={() =>
                                                            setSearchStartTime(
                                                                "",
                                                            )
                                                        }
                                                        className="text-[9.5px] text-zinc-500 hover:text-zinc-300 transition-colors"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={searchStartTime}
                                                onChange={(e) =>
                                                    setSearchStartTime(
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-foreground outline-none focus:border-primary/45 transition-colors"
                                            />
                                        </div>

                                        <div className="space-y-1 bg-zinc-950/20 p-1.5 rounded-md border border-zinc-900/50">
                                            <label className="text-[10.5px] text-muted-foreground flex justify-between">
                                                <span>End Date & Time</span>
                                                {searchEndTime && (
                                                    <button
                                                        onClick={() =>
                                                            setSearchEndTime("")
                                                        }
                                                        className="text-[9.5px] text-zinc-500 hover:text-zinc-300 transition-colors"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={searchEndTime}
                                                onChange={(e) =>
                                                    setSearchEndTime(
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-foreground outline-none focus:border-primary/45 transition-colors"
                                            />
                                        </div>
                                    </div>

                                    <div className="border-t border-zinc-800/60 pt-3.5 space-y-1.5">
                                        <label className="text-[11px] text-muted-foreground">
                                            Source / Platform
                                        </label>
                                        <select
                                            value={searchSourceType}
                                            onChange={(e) => setSearchSourceType(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-850/50 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/45 transition-colors"
                                        >
                                            <option value="all">All Sources</option>
                                            <option value="github">GitHub</option>
                                            <option value="youtube">YouTube</option>
                                            <option value="reddit">Reddit</option>
                                            <option value="x">X / Twitter</option>
                                            <option value="generic">Generic Web</option>
                                        </select>
                                    </div>

                                    <div className="border-t border-zinc-800/60 pt-3.5 space-y-1.5">
                                        <label className="text-[11px] text-muted-foreground">
                                            Sort Results By
                                        </label>
                                        <select
                                            value={searchSortOrder}
                                            onChange={(e) => setSearchSortOrder(e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-850/50 rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/45 transition-colors"
                                        >
                                            <option value="relevance">Relevance (AI Hybrid)</option>
                                            <option value="date_desc">Visited: Newest First</option>
                                            <option value="date_asc">Visited: Oldest First</option>
                                            <option value="domain">Domain (A-Z)</option>
                                            <option value="dwell_desc">Time Spent: Most First</option>
                                            <option value="dwell_asc">Time Spent: Least First</option>
                                        </select>
                                    </div>

                                    <div className="border-t border-zinc-800/60 pt-3.5 space-y-1.5">
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-muted-foreground">Min Match Score</span>
                                            <span className="text-primary font-mono font-semibold">{searchMinScore}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={searchMinScore}
                                            onChange={(e) => setSearchMinScore(parseInt(e.target.value))}
                                            className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                    </div>

                                    <div className="border-t border-zinc-800/60 pt-3.5 space-y-1.5">
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-muted-foreground">Min Time Spent</span>
                                            <span className="text-amber-400/80 font-mono font-semibold">{searchMinDwell > 0 ? formatDuration(searchMinDwell) : "Any"}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="3600"
                                            step="30"
                                            value={searchMinDwell}
                                            onChange={(e) => setSearchMinDwell(parseInt(e.target.value))}
                                            className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                        />
                                        <div className="flex justify-between text-[9px] text-muted-foreground/50">
                                            <span>Any</span>
                                            <span>1h</span>
                                        </div>
                                    </div>
                                </Card>
                            </div>

                            <div className="md:col-span-3 space-y-4">
                                {isDashSearchLoading && (
                                    <div className="flex flex-col items-center justify-center py-16 space-y-2">
                                        <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
                                        <p className="text-xs text-muted-foreground">
                                            Searching your database...
                                        </p>
                                    </div>
                                )}

                                {!isDashSearchLoading &&
                                    !debouncedDashSearch.trim() && (
                                        <div className="p-16 text-center border border-dashed border-border rounded-lg space-y-2">
                                            <Search className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                                            <h3 className="text-xs font-semibold text-zinc-300">
                                                Semantic Engine Idle
                                            </h3>
                                            <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                                                Type your question above to
                                                query indexed pages, extract
                                                answers, and compute matching
                                                vectors.
                                            </p>
                                        </div>
                                    )}

                                {isDashSearchError && (
                                    <div className="p-4 rounded-md bg-red-950/20 border border-red-900/30 text-red-400 text-xs">
                                        {getErrorMessage(dashSearchError)}
                                    </div>
                                )}

                                {!isDashSearchLoading &&
                                    debouncedDashSearch.trim() &&
                                    dashSearchResults && (
                                        <>
                                            {dashAI &&
                                                dashSearchResults.ai_summary && (
                                                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 shadow-md space-y-1.5 animate-in fade-in duration-200">
                                                        <div className="flex items-center space-x-1.5 text-xs text-primary font-semibold">
                                                            <Sparkles className="w-3.5 h-3.5" />
                                                            <span>
                                                                AI Synthesized
                                                                Response
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-foreground/90 leading-relaxed">
                                                            {
                                                                dashSearchResults.ai_summary
                                                            }
                                                        </p>
                                                    </div>
                                                )}

                                            {processedResults.length === 0 ? (
                                                <div className="p-12 text-center border border-dashed border-border rounded-lg">
                                                    <p className="text-xs text-muted-foreground">
                                                        {dashSearchResults.results.length === 0
                                                            ? "No matches found. Try widening your query."
                                                            : "No results match your active filters. Try adjusting them."}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {processedResults.map(
                                                        (result, idx) => {
                                                            const matchPercentage =
                                                                            Math.round(
                                                                                result.score *
                                                                                    SCORE_PERCENTAGE_MULTIPLIER,
                                                                            );
                                                            const isTopResult = idx === 0 && searchSortOrder === "relevance";
                                                            const borderClass = isTopResult
                                                                ? "border-blue-500/60 bg-blue-500/5 ring-1 ring-blue-500/20"
                                                                : "border-border bg-secondary/10";
                                                            return (
                                                                <Card
                                                                    key={result.id}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onClick={() => setDetailDocId(result.id)}
                                                                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetailDocId(result.id); } }}
                                                                    className={`${borderClass} cursor-pointer space-y-2.5 transition-colors hover:bg-secondary/20`}
                                                                >
                                                                    <div className="flex items-start justify-between space-x-3">
                                                                        <h3 className="font-semibold text-sm text-zinc-100 hover:text-blue-400 transition-colors line-clamp-1">
                                                                            {result.title ||
                                                                                result.url}
                                                                        </h3>
                                                                        <div className="flex items-center space-x-1.5 shrink-0">
                                                                            {(() => {
                                                                                if (matchPercentage >= BEST_MATCH_THRESHOLD) {
                                                                                    return (
                                                                                        <span className="text-[10.5px] font-semibold bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1 whitespace-nowrap">
                                                                                            <Trophy className="w-3 h-3" /> Best Match
                                                                                        </span>
                                                                                    );
                                                                                } else if (matchPercentage >= STRONG_MATCH_THRESHOLD) {
                                                                                    return (
                                                                                        <span className="text-[10.5px] font-semibold bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 whitespace-nowrap">
                                                                                            Strong Match
                                                                                        </span>
                                                                                    );
                                                                                } else {
                                                                                    return (
                                                                                        <span className="text-[10.5px] font-semibold bg-zinc-500/15 text-zinc-400 px-2 py-0.5 rounded border border-zinc-500/30 flex items-center gap-1 whitespace-nowrap">
                                                                                            Related Result
                                                                                        </span>
                                                                                    );
                                                                                }
                                                                            })()}
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center space-x-2 text-[10.5px] text-muted-foreground">
                                                                        <span className="truncate max-w-[200px]">
                                                                            {
                                                                                result.domain
                                                                            }
                                                                        </span>
                                                                        <span>
                                                                            &bull;
                                                                        </span>
                                                                        <span>
                                                                            {new Date(
                                                                                result.last_visited_at,
                                                                            ).toLocaleDateString()}
                                                                        </span>
                                                                        {result.total_dwell_time > 0 && (
                                                                            <>
                                                                                <span>&bull;</span>
                                                                                <span className="flex items-center gap-1 font-mono text-[10px] text-amber-400/70">
                                                                                    <Clock className="w-3 h-3" />
                                                                                    {formatDuration(result.total_dwell_time)}
                                                                                </span>
                                                                            </>
                                                                        )}
                                                                    </div>

                                                                    {result.match_reasons && result.match_reasons.length > 0 && (
                                                                        <p className="text-xs text-blue-300">Matched: {result.match_reasons.map(reason => ({ title: "title", keyword: "keyword", metadata: "metadata", lexical: "indexed terms", semantic: "semantic similarity", text: "saved text" }[reason] || reason)).join(", ")}</p>
                                                                    )}
                                                                    {result.excerpt && <p className="text-xs leading-relaxed text-muted-foreground">{result.excerpt}</p>}
                                                                    {result.summary && (
                                                                        <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
                                                                            {
                                                                                result.summary
                                                                            }
                                                                        </p>
                                                                    )}

                                                                    {result.keywords &&
                                                                        result
                                                                            .keywords
                                                                            .length >
                                                                            0 && (
                                                                            <div className="flex flex-wrap gap-1 pt-1.5 border-t border-border/30">
                                                                                {result.keywords
                                                                                    .slice(
                                                                                        0,
                                                                                        MAX_KEYWORDS_DISPLAY,
                                                                                    )
                                                                                    .map(
                                                                                        (
                                                                                            kw,
                                                                                            i,
                                                                                        ) => (
                                                                                            <span
                                                                                                key={
                                                                                                    i
                                                                                                }
                                                                                                className="text-[9px] bg-secondary/70 text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded font-mono"
                                                                                            >
                                                                                                #
                                                                                                {
                                                                                                    kw.keyword
                                                                                                }
                                                                                            </span>
                                                                                        ),
                                                                                    )}
                                                                            </div>
                                                                        )}
                                                                </Card>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                            </div>
                        </div>
                    </div>
                );
        }
    };

    const pageTitle = detailDocId
        ? "Document"
        : activePage === "dashboard"
          ? "Overview"
          : activePage === "search"
            ? "Semantic Search"
            : activePage === "graph"
              ? "Knowledge Graph"
              : activePage === "memories"
                ? "Memories"
                : activePage === "library" ? "Documents" : activePage === "privacy" || activePage === "models" || activePage === "setup" ? "Settings" : "Settings";

    return (
        <div className="flex h-screen min-h-screen flex-col bg-background text-foreground md:flex-row">
            <aside className="flex flex-shrink-0 flex-col border-b border-border bg-card/40 md:w-56 md:border-b-0 md:border-r">
                <div className="flex items-center space-x-2.5 px-4 py-5 border-b border-border">
                    <Brain className="w-5 h-5 text-blue-400" />
                    <span className="text-sm font-semibold">MindCache</span>
                </div>

                <nav className="flex gap-1 overflow-x-auto p-2 md:block md:flex-1 md:space-y-0.5 md:p-3">
                    {navItem(
                        "dashboard",
                        "Overview",
                        <LayoutDashboard className="w-4 h-4" />,
                    )}
                    {navItem(
                        "search",
                        "Semantic Search",
                        <Search className="w-4 h-4" />,
                    )}
                    {navItem(
                        "graph",
                        "Knowledge Graph",
                        <Network className="w-4 h-4" />,
                    )}
                    {navItem("library", "Documents", <FolderOpen className="w-4 h-4" />)}
                    {navItem("privacy", "Settings", <Settings className="w-4 h-4" />)}
                    {!isWebDashboard && navItem("settings", "Browser settings", <Settings className="w-4 h-4" />)}
                </nav>

                <div className="hidden px-4 py-3 border-t border-border text-[11px] text-muted-foreground space-y-1 md:block">
                    <div className="flex items-center space-x-1.5">
                        <span
                            className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-red-400"}`}
                        />
                        <span>{isOnline ? "Connected" : "Offline"}</span>
                    </div>
                    {isOnline && components && (
                        <div className="text-[10px] text-muted-foreground/60">
                            {components.faiss_index.vectors_count} vectors
                            indexed
                        </div>
                    )}
                </div>
            </aside>

            <main
                className={`min-h-0 flex-1 ${activePage === "graph" && !detailDocId ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}
            >
                <div
                    className={
                        activePage === "graph" && !detailDocId
                            ? "w-full h-full px-6 py-5 flex flex-col space-y-4"
                            : "w-full px-6 md:px-10 py-8 space-y-8"
                    }
                >
                    <div className="flex items-center justify-between flex-shrink-0">
                        <h1 className="text-2xl font-semibold tracking-tight">{pageTitle}</h1>
                        {activePage === "memories" && !detailDocId && (
                            <span className="text-xs text-muted-foreground">
                                {documents.length} total
                            </span>
                        )}
                        {activePage === "graph" && !detailDocId && (
                            <span className="text-xs text-muted-foreground">
                                {documents.length > GRAPH_DISPLAY_MAX
                                    ? String(GRAPH_DISPLAY_MAX)
                                    : documents.length}{" "}
                                of {documents.length} docs mapped
                            </span>
                        )}
                    </div>

                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default App;
