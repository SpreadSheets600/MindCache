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
import { SearchPage } from "./SearchPage";
import { FoldersPage } from "./FoldersPage";
import { startCaptureSync, pullCaptureSettings } from "../services/captureSync";
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
    Globe,
    KeyRound,
    FileText as FileTextIcon,
} from "lucide-react";

const MAX_DOCUMENTS_FETCH = 100;
const SAVE_SUCCESS_DURATION = 1500;
const RECENT_ACTIVITY_COUNT = 7;
const MAX_KEYWORDS_DISPLAY = 4;
const GRAPH_DISPLAY_MAX = 50;

function formatDuration(seconds: number): string {
    if (!seconds || seconds < 1) return "";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}

type Page = "dashboard" | "search" | "folders" | "graph" | "memories" | "settings" | "library" | "privacy" | "models" | "setup";
const isWebDashboard = typeof window !== "undefined" && /^https?:$/.test(window.location.protocol);

const App: React.FC = () => {
    const queryClient = useQueryClient();
    const [activePage, setActivePage] = useState<Page>(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const requestedPage = params.get("page") as Page;
            const page = requestedPage;
            if (
                page &&
                [
                    "dashboard",
                    "search",
                    "folders",
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
            if (event.data?.type === "mindcache:search" && typeof event.data.query === "string") {
                setSearchQuery(event.data.query);
                setDetailDocId(null);
                setActivePage("search");
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
        captureDelaySeconds,
        excludedDomains,
        setBackendUrl,
        setAutoTracking,
        setAutoExtract,
        setCaptureDelaySeconds,
        addExcludedDomain,
        removeExcludedDomain,
    } = useSettingsStore();

    const { isOnline, isChecking, components } = useConnectionStore();

    const [urlInput, setUrlInput] = useState(backendUrl);
    const [captureDelayInput, setCaptureDelayInput] = useState(String(captureDelaySeconds));
    const [newDomain, setNewDomain] = useState("");
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [searchFilter, setSearchFilter] = useState("");

    useEffect(() => setCaptureDelayInput(String(captureDelaySeconds)), [captureDelaySeconds]);

    const [dashSearch, setDashSearch] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
    const [searchQuery, setSearchQuery] = useState(dashSearch);

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
        startCaptureSync();
    }, []);

    useEffect(() => {
        if (activePage === "settings") void pullCaptureSettings(true);
    }, [activePage]);

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
            const dt = doc.total_dwell_time || 0;
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
        onError: (err: Error) => {
            setDeleteError(err.message || "Failed to delete document. Check backend logs.");
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
            if (!isWebDashboard && (page === "dashboard" || page === "search" || page === "folders" || page === "memories" || page === "library" || page === "privacy" || page === "models" || page === "setup")) {
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
                            <form className="home-search" onSubmit={(event) => { event.preventDefault(); setSearchQuery(dashSearch); setActivePage("search"); }}>
                                <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
                                <label htmlFor="home-query" className="sr-only">Search your memory</label>
                                <input id="home-query" value={dashSearch} onChange={(event) => setDashSearch(event.target.value)} placeholder="Search pages, files and notes" />
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
                                <section><h3>Your workspace</h3><div className="home-status"><span>Connection</span><strong>{isChecking ? "Checking…" : isOnline ? "Connected" : "Offline"}</strong></div><div className="home-status"><span>Saved pages</span><strong>{isOnline ? (components?.database?.documents_count ?? documents.length) : "—"}</strong></div><div className="home-status"><span>Embedding model</span><strong title={components?.embedding?.model || ""}>{components?.embedding?.status === "ready" ? "EmbeddingGemma 2" : "Not downloaded"}</strong></div><button className="home-link" onClick={() => setActivePage("models")}>Manage models</button></section>
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
                                                {doc.total_dwell_time > 0 && (
                                                    <>
                                                        <span className="text-muted-foreground/30">-</span>
                                                        <span className="font-mono text-[10px] text-amber-400/70">
                                                            {formatDuration(doc.total_dwell_time)}
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
                            {!isWebDashboard && (<>
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
                            </>)}

                            <div className="space-y-4">
                                <div className="flex items-center space-x-2 text-sm font-medium">
                                    <Shield className="w-4 h-4 text-muted-foreground" />
                                    <span>Capture</span>
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
                                    <div>
                                        <label htmlFor="capture-delay" className="text-sm">Wait before saving</label>
                                        <p className="text-xs text-muted-foreground mt-0.5">Seconds to spend on a page before it is saved automatically.</p>
                                        <Input id="capture-delay" type="number" min="1" max="3600" step="1" value={captureDelayInput} onChange={(event) => setCaptureDelayInput(event.target.value)} onBlur={() => { const seconds = Number(captureDelayInput); if (Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600) setCaptureDelaySeconds(seconds); else setCaptureDelayInput(String(captureDelaySeconds)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="mt-2 w-28" />
                                        <p className="text-xs text-muted-foreground mt-1">1–3,600 seconds. Applied when you leave the field.</p>
                                    </div>
                                </div>
                            </div>

                            {!isWebDashboard && (<>
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
                            </>)}
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
                return <SearchPage key={searchQuery} initialQuery={searchQuery} onOpenDocument={setDetailDocId} onNavigate={(page) => setActivePage(page === "models" ? "models" : "folders")} />;
            case "folders":
                return <FoldersPage />;
        }
    };

    const pageTitle = detailDocId
        ? "Document"
        : activePage === "dashboard"
          ? "Overview"
          : activePage === "search"
            ? "Search"
            : activePage === "folders"
              ? "Files & folders"
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
                        "Search",
                        <Search className="w-4 h-4" />,
                    )}
                    {navItem("folders", "Files & folders", <FolderOpen className="w-4 h-4" />)}
                    {navItem(
                        "graph",
                        "Knowledge Graph",
                        <Network className="w-4 h-4" />,
                    )}
                    {navItem("library", "Documents", <FileTextIcon className="w-4 h-4" />)}
                    {navItem("privacy", "Settings", <Settings className="w-4 h-4" />)}
                    {navItem("settings", "Browser capture", <Globe className="w-4 h-4" />)}
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
