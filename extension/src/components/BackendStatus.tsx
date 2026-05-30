import React, { useEffect } from "react";
import { useConnectionStore } from "../store/connectionStore";
import { backendClient } from "../services/BackendClient";
import { RefreshCw } from "lucide-react";

export const BackendStatus: React.FC = () => {
  const { isOnline, isChecking, components } = useConnectionStore();

  const performHealthCheck = async () => {
    try {
      await backendClient.checkHealth();
    } catch (err) {
      console.warn("Health check failed:", err);
    }
  };

  useEffect(() => {
    performHealthCheck();
    const interval = setInterval(performHealthCheck, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground">
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-red-400"}`} />
          <span>{isOnline ? "Connected" : "Offline"}</span>
        </div>

        {isOnline && components && (
          <>
            <span className="text-muted-foreground/30">|</span>
            <span>
              {components.faiss_index.vectors_count} vectors
            </span>
            {components.ollama.status === "connected" && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span>{components.ollama.model || "AI ready"}</span>
              </>
            )}
          </>
        )}
      </div>

      <button
        onClick={performHealthCheck}
        disabled={isChecking}
        className="text-muted-foreground/60 hover:text-foreground transition-colors focus:outline-none"
        title="Refresh"
      >
        <RefreshCw className={`w-3 h-3 ${isChecking ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
};
