import React, { useEffect } from 'react';
import { useConnectionStore } from './store/useConnectionStore';
import { useSettingsStore } from './store/useSettingsStore';
import BackendStatus from './components/BackendStatus';
import { ExternalLink, Database, Cpu, BrainCircuit, Activity } from 'lucide-react';

/**
 * Extension Action Popup. Primarily acts as a project diagnostic monitor,
 * showcasing live engine states, and links to the full-page dashboard.
 */
export const App: React.FC = () => {
  const { isOnline, health, checkConnection } = useConnectionStore();
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
    checkConnection();
  }, [loadSettings, checkConnection]);

  const handleOpenDashboard = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    } else {
      window.open('/dashboard.html', '_blank');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#07080c] select-none text-gray-200">
      {/* Status Bar */}
      <BackendStatus />

      {/* Diagnostic grid area */}
      <div className="flex-1 flex flex-col justify-between p-4 space-y-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-950/20 border border-purple-500/30 rounded-lg text-purple-400">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xs font-bold uppercase tracking-wider text-gray-100 m-0">MindCache Memory</h1>
              <span className="text-[9px] text-gray-500 font-mono">Local Personal Cognitive System</span>
            </div>
          </div>

          {/* Diagnostic statuses using Radix component-library styled layouts */}
          <div className="grid grid-cols-2 gap-2">
            {/* Database Engine */}
            <div className="p-2.5 bg-[#10111a] border border-gray-800/80 rounded-lg flex flex-col justify-between h-16">
              <div className="flex items-center justify-between text-[8px] font-bold text-gray-500 uppercase tracking-wider">
                <span>Database</span>
                <Database className="w-3 h-3 text-purple-500/80" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-gray-200">SQLite Async</span>
                <span className={`text-[9px] font-mono ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isOnline ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>

            {/* FAISS Vector capacity */}
            <div className="p-2.5 bg-[#10111a] border border-gray-800/80 rounded-lg flex flex-col justify-between h-16">
              <div className="flex items-center justify-between text-[8px] font-bold text-gray-500 uppercase tracking-wider">
                <span>Vector Store</span>
                <Activity className="w-3 h-3 text-purple-500/80" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-gray-200">FAISS IP Index</span>
                <span className="text-[9px] text-purple-300 font-mono">
                  {isOnline && health ? `${health.components.faiss_index.vectors_count} vectors` : 'Offline'}
                </span>
              </div>
            </div>

            {/* Ollama local synthesis status */}
            <div className="p-2.5 bg-[#10111a] border border-gray-800/80 rounded-lg flex flex-col justify-between h-16 col-span-2">
              <div className="flex items-center justify-between text-[8px] font-bold text-gray-500 uppercase tracking-wider">
                <span>AI Synthesis Engine</span>
                <Cpu className="w-3 h-3 text-purple-500/80" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-gray-200">Ollama Server</span>
                <span className={`text-[9px] font-semibold font-mono ${isOnline && health?.components.ollama.status === 'connected' ? 'text-purple-300' : 'text-gray-500'}`}>
                  {isOnline && health?.components.ollama.status === 'connected' ? health.components.ollama.model : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard CTA */}
        <button
          onClick={handleOpenDashboard}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-purple-600 hover:bg-purple-700 border border-purple-500 text-xs font-bold text-white rounded-lg shadow-lg shadow-purple-500/10 cursor-pointer transition-all active:scale-[0.98]"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open MindCache Dashboard
        </button>
      </div>
    </div>
  );
};
export default App;
