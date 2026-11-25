import React, { useEffect, useState } from "react";
import { useConnectionStore } from "../store/connectionStore";
import { useSettingsStore } from "../store/settingsStore";
import { backendClient } from "../services/BackendClient";
import { Brain, Search, LayoutDashboard, Database, Shield, FileText, Sparkles, Network, Settings } from "lucide-react";
import { SidebarLink } from "../components/ui/sidebar";

interface PagePreview {
  title: string;
  description: string;
  content: string;
  site: string;
  wordCount: number;
}

export const App: React.FC = () => {
  const [pagePreview, setPagePreview] = useState<PagePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureResult, setCaptureResult] = useState<string | null>(null);
  const { isOnline, components } = useConnectionStore();
  const { autoTracking, autoExtract } = useSettingsStore();

  const performHealthCheck = async () => {
    try {
      await backendClient.checkHealth();
    } catch (err) {
      console.warn("Popup health check failed:", err);
    }
  };

  useEffect(() => {
    useSettingsStore.persist.rehydrate();
    performHealthCheck();
    fetchPagePreview();
  }, []);

  async function fetchPagePreview() {
    setPreviewLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ action: "get-current-extraction" });
      if (response && response.status === "ok" && response.extraction) {
        setPagePreview({
          title: response.extraction.title || "Untitled",
          description: response.extraction.description || "",
          content: (response.extraction.content || "").slice(0, 300),
          site: response.extraction.site || "",
          wordCount: response.extraction.wordCount || 0,
        });
      } else {
        setPagePreview(null);
      }
    } catch {
      setPagePreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleCapturePage() {
    setCapturing(true);
    setCaptureResult(null);
    try {
      const response = await chrome.runtime.sendMessage({ action: "capture-page" });
      if (response && response.status === "ok" && response.result) {
        setCaptureResult("saved");
        setPagePreview(null);
      } else {
        setCaptureResult(response?.error || "failed");
      }
    } catch {
      setCaptureResult("failed");
    } finally {
      setCapturing(false);
    }
  }

  const handleOpenDashboard = (search = false) => {
    const base = useSettingsStore.getState().backendUrl.replace(/\/+$/, "");
    const url = `${base}/app/${search ? "?focus=search" : ""}`;
    if (typeof chrome !== "undefined" && chrome.tabs) chrome.tabs.create({ url });
    else window.open(url, "_blank", "noopener,noreferrer");
  };
  const openBrowserSettings = () => {
    if (typeof chrome !== "undefined" && chrome.tabs) chrome.tabs.create({ url: chrome.runtime.getURL("settings.html?page=settings") });
  };

  return (
    <div className="w-[360px] bg-background text-foreground font-sans">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600"><Brain className="h-5 w-5 text-white" /></span><div><h1 className="text-sm font-semibold">MindCache</h1><p className="text-xs text-muted-foreground">Your browser memory</p></div></div>
        <span className={`rounded-full border px-2.5 py-1 text-xs ${isOnline ? "border-emerald-900 text-emerald-400" : "border-red-900 text-red-400"}`}>{isOnline ? "Connected" : "Offline"}</span>
      </header>

      <main className="space-y-5 p-5">
        <section aria-labelledby="current-page-title">
          <div className="mb-3 flex items-center justify-between"><h2 id="current-page-title" className="text-sm font-semibold">Current page</h2><FileText className="h-4 w-4 text-muted-foreground" /></div>
          {previewLoading ? <p className="rounded-xl border border-border p-4 text-xs text-muted-foreground">Extracting page content...</p> : pagePreview ? (
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <p className="truncate text-sm font-medium" title={pagePreview.title}>{pagePreview.title}</p>
              {pagePreview.site && <p className="mt-1 truncate text-xs text-muted-foreground">{pagePreview.site}</p>}
              {pagePreview.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{pagePreview.description}</p>}
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{pagePreview.content}</p>
              <p className="mt-3 text-xs text-muted-foreground">{pagePreview.wordCount} words</p>
            </div>
          ) : <p className="rounded-xl border border-border p-4 text-xs leading-5 text-muted-foreground">No content available for extraction on this page.</p>}
          {captureResult && <p role="status" className={`mt-3 text-xs ${captureResult === "saved" ? "text-emerald-400" : "text-red-400"}`}>{captureResult === "saved" ? "Page saved to MindCache" : captureResult === "failed" ? "Failed to capture page" : captureResult}</p>}
          {isOnline && pagePreview && (!autoTracking || !autoExtract) && <button onClick={handleCapturePage} disabled={capturing} className="overview-action mt-3 w-full justify-center disabled:opacity-50"><Sparkles className="h-4 w-4" />{capturing ? "Saving..." : "Save to MindCache"}</button>}
        </section>

        <section aria-labelledby="setup-title">
          <h2 id="setup-title" className="mb-3 text-sm font-semibold">Your setup</h2>
          <dl className="space-y-3 text-xs">
            <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-muted-foreground"><Database className="h-4 w-4" /> Pages indexed</dt><dd>{isOnline && components ? `${components.database?.documents_count ?? components.faiss_index.vectors_count} pages` : "—"}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-muted-foreground"><Network className="h-4 w-4" /> Embedding</dt><dd className="max-w-[150px] truncate" title={components?.embedding?.model || ""}>{isOnline && components?.embedding?.status === "connected" ? components.embedding.model : "Offline"}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-muted-foreground"><Shield className="h-4 w-4" /> Tab tracking</dt><dd>{autoTracking ? "Active" : "Disabled"}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-muted-foreground"><Sparkles className="h-4 w-4" /> Page extraction</dt><dd>{autoExtract ? "On" : "Manual"}</dd></div>
          </dl>
          {!isOnline && <p className="mt-4 text-xs leading-5 text-muted-foreground">Start MindCache with <code>./start.sh</code>, then check the server URL in settings.</p>}
        </section>
      </main>
      <footer className="grid grid-cols-2 gap-2 border-t border-border p-4">
        <SidebarLink icon={<Search className="h-4 w-4" />} active onClick={() => handleOpenDashboard(true)}>Search</SidebarLink>
        <SidebarLink icon={<LayoutDashboard className="h-4 w-4" />} onClick={() => handleOpenDashboard()}>Dashboard</SidebarLink>
        <SidebarLink className="col-span-2" icon={<Settings className="h-4 w-4" />} onClick={openBrowserSettings}>Browser capture settings and graph</SidebarLink>
      </footer>
    </div>
  );
};

export default App;
