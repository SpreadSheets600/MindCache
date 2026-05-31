import React, { useEffect } from "react";
import { useConnectionStore } from "../store/connectionStore";
import { useSettingsStore } from "../store/settingsStore";
import { backendClient } from "../services/BackendClient";
import { Brain, Search, LayoutDashboard, Database, Shield } from "lucide-react";

export const App: React.FC = () => {
  const { isOnline, components } = useConnectionStore();
  const { autoTracking, privacyMode } = useSettingsStore();

  const performHealthCheck = async () => {
    try {
      await backendClient.checkHealth();
    } catch (err) {
      console.warn("Popup health check failed:", err);
    }
  };

  useEffect(() => {
    // Sync settings on popup launch
    useSettingsStore.persist.rehydrate();
    performHealthCheck();
  }, []);

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
          <div className="text-[11px] font-semibold">System Active & Recording</div>
        </div>
      ) : (
        <div className="mx-4 mt-4 p-3 rounded-lg border border-red-950/60 bg-red-950/20 flex items-center space-x-2.5 text-red-400">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <div className="text-[11px] font-semibold">Backend Disconnected</div>
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
              {isOnline && components ? `${components.faiss_index.vectors_count} pages` : "—"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-zinc-900/60">
            <span className="text-zinc-400 flex items-center space-x-1.5">
              <span>🤖</span>
              <span>AI Model</span>
            </span>
            <span className="font-mono text-[11px] text-zinc-300 truncate max-w-[140px]" title={components?.ollama.model || ""}>
              {isOnline && components?.ollama.status === "connected" ? components.ollama.model || "Active" : "OFFLINE"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-zinc-900/60">
            <span className="text-zinc-400 flex items-center space-x-1.5">
              <span>🧬</span>
              <span>Embedding Model</span>
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
              <span>🔒</span>
              <span>Private Logging</span>
            </span>
            <span className={`font-mono text-[11px] ${privacyMode ? "text-blue-400 font-medium" : "text-zinc-500"}`}>
              {privacyMode ? "ON" : "OFF"}
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
