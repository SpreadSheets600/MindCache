import React, { useEffect } from 'react';
import { useConnectionStore } from '../store/useConnectionStore';
import { Wifi, WifiOff, Cpu } from 'lucide-react';

/**
 * Diagnostic component displaying current local server connection state,
 * total registered vectors, and Ollama status.
 */
export const BackendStatus: React.FC = () => {
  const { isOnline, health, checkConnection } = useConnectionStore();

  useEffect(() => {
    // Initial check
    checkConnection();
    
    // Interval check every 10 seconds
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-900 bg-[#0c0d12]">
      <div className="flex items-center gap-2">
        {isOnline ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <Wifi className="w-3.5 h-3.5 animate-pulse" />
            Memory Engine Online
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
            <WifiOff className="w-3.5 h-3.5" />
            Engine Offline
          </span>
        )}
      </div>

      {isOnline && health && (
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            FAISS: {health.components.faiss_index.vectors_count} docs
          </span>
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-purple-400" />
            Ollama: {health.components.ollama.status === 'connected' ? (
              <span className="text-purple-300 font-semibold">{health.components.ollama.model}</span>
            ) : (
              <span className="text-gray-500 font-medium">offline</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
};
export default BackendStatus;
