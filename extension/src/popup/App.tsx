import React, { useEffect, useState } from "react";
import { useConnectionStore } from "../store/connectionStore";
import { useSettingsStore } from "../store/settingsStore";
import { backendClient } from "../services/BackendClient";
import { Brain, Search, LayoutDashboard, Database, Shield, FileText, Sparkles, Cpu, Network } from "lucide-react";

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

  const handleOpenDashboard = (pageName: string) => {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL(`settings.html?page=${pageName}`) });
    } else {
      window.open(`/settings.html?page=${pageName}`, "_blank");
    }
  };

  return (
    <div className="w-[300px] bg-zinc-950 text-foreground overflow-hidden border border-zinc-900 flex flex-col font-sans">
      {/* Brand Header */}
      <div className="flex items-center space-x-2 px-4 py-3 border-b border-zinc-900 bg-zinc-950 flex-shrink-0">
        <Brain className="w-4.5 h-4.5 text-blue-500" />
        <span className="text-sm font-semibold tracking-tight text-zinc-100">MindCache</span>
      </div>

      {/* Connection status banner */}
      {isOnline ? (
        <div className="mx-4 mt-4 p-3 rounded-lg border border-emerald-950 bg-emerald-950/20 flex items-center space-x-2.5 text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <div className="text-[11px] font-semibold">System Active {autoExtract ? "& Recording" : ""}</div>
        </div>
      ) : (
        <div className="mx-4 mt-4 p-3 rounded-lg border border-red-950/60 bg-red-950/20 flex items-center space-x-2.5 text-red-400">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <div className="text-[11px] font-semibold">Backend Disconnected</div>
        </div>
      )}

      {/* Page Preview */}
      {pagePreview && (
        <div className="mx-4 mt-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/30">
          <div className="flex items-center space-x-1.5 mb-1.5">
            <FileText className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Current Page</span>
          </div>
          <div className="text-xs font-semibold text-zinc-200 truncate">{pagePreview.title}</div>
          {pagePreview.description && (
            <div className="text-[11px] text-zinc-400 truncate mt-0.5">{pagePreview.description}</div>
          )}
          <div className="text-[11px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">{pagePreview.content}</div>
          <div className="flex items-center space-x-2 mt-1.5 text-[10px] text-zinc-500">
            {pagePreview.site && <span>{pagePreview.site}</span>}
            <span>{pagePreview.wordCount} words</span>
          </div>
        </div>
      )}
      {!pagePreview && !previewLoading && isOnline && (
        <div className="mx-4 mt-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/30">
          <div className="flex items-center space-x-1.5">
            <FileText className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] text-zinc-500">No content available for extraction on this page</span>
          </div>
        </div>
      )}
      {previewLoading && (
        <div className="mx-4 mt-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/30">
          <div className="flex items-center space-x-1.5">
            <div className="w-3 h-3 rounded-full border border-zinc-500 border-t-transparent animate-spin" />
            <span className="text-[10px] text-zinc-500">Extracting page content...</span>
          </div>
        </div>
      )}

      {/* Capture result feedback */}
      {captureResult === "saved" && (
        <div className="mx-4 mt-2 p-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50 text-emerald-400 text-[11px] text-center font-medium">
          Page saved to MindCache
        </div>
      )}
      {captureResult === "failed" && (
        <div className="mx-4 mt-2 p-2 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 text-[11px] text-center font-medium">
          Failed to capture page
        </div>
      )}

      {/* Manual capture button (shown when auto-tracking or auto-extract is off) */}
      {isOnline && pagePreview && (!autoTracking || !autoExtract) && (
        <div className="mx-4 mt-2">
          <button
            onClick={handleCapturePage}
            disabled={capturing}
            className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-zinc-400 text-white text-xs font-semibold rounded-md transition-all active:scale-[0.98] shadow-md shadow-blue-900/10"
          >
            {capturing ? (
              <>
                <div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Save to MindCache</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Diagnostics details */}
      <div className="px-4 py-4 space-y-3 flex-grow">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Diagnostics</div>
        
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center py-1 border-b border-zinc-900/60">
            <span className="text-zinc-400 flex items-center space-x-1.5">
              <Database className="w-3.5 h-3.5 text-zinc-500" />
              <span>Memories Indexed</span>
            </span>
            <span className="font-mono text-zinc-300 font-medium">
              {isOnline && components ? `${components.database?.documents_count ?? components.faiss_index.vectors_count} pages` : "—"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-zinc-900/60">
            <span className="text-zinc-400 flex items-center space-x-1.5">
              <Network className="w-3.5 h-3.5 text-zinc-500" />
              <span>Embedding</span>
            </span>
            <span className="font-mono text-[11px] text-zinc-300 truncate max-w-[140px]" title={components?.embedding?.model || ""}>
              {isOnline && components?.embedding?.status === "connected" ? components.embedding.model : "OFFLINE"}
            </span>
          </div>
          
          <div className="flex justify-between items-center py-1 border-b border-zinc-900/60">
            <span className="text-zinc-400 flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-zinc-500" />
              <span>Auto Tab Tracking</span>
            </span>
            <span className={`font-mono text-[11px] ${autoTracking ? "text-emerald-500" : "text-zinc-500"}`}>
              {autoTracking ? "ACTIVE" : "DISABLED"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1">
            <span className="text-zinc-400 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
              <span>Auto Extraction</span>
            </span>
            <span className={`font-mono text-[11px] ${autoExtract ? "text-emerald-500" : "text-amber-500"}`}>
              {autoExtract ? "ON" : "MANUAL"}
            </span>
          </div>
        </div>

        {!isOnline && (
          <p className="text-[10px] text-zinc-500 leading-relaxed pt-1">
            Start the local server (<code className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-400 font-mono">python main.py</code>) or update server URL in settings options.
          </p>
        )}
      </div>

      {/* Actions footer */}
      <div className="p-4 border-t border-zinc-900 bg-zinc-900/10 space-y-2 flex-shrink-0">
        <button
          onClick={() => handleOpenDashboard("search")}
          className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-all active:scale-[0.98] shadow-md shadow-blue-900/10"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search Memory</span>
        </button>
        <button
          onClick={() => handleOpenDashboard("dashboard")}
          className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-medium rounded-md transition-all active:scale-[0.98] border border-zinc-800/80"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Open Dashboard</span>
        </button>
      </div>
    </div>
  );
};

export default App;
