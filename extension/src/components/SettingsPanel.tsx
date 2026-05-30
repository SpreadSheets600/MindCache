import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import { ArrowLeft, Save, Globe, EyeOff, ShieldAlert } from 'lucide-react';

interface SettingsPanelProps {
  onClose: () => void;
}

/**
 * Slide-over settings configuration component to modify local endpoints,
 * tracking behaviors, privacy modes, and subdomain exclusions lists.
 */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { settings, updateSettings, loadSettings } = useSettingsStore();
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [autoTracking, setAutoTracking] = useState(settings.autoTracking);
  const [privacyMode, setPrivacyMode] = useState(settings.privacyMode);
  const [excludedDomains, setExcludedDomains] = useState(settings.excludedDomains.join('\n'));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Sync settings when loaded from storage service
  useEffect(() => {
    setBackendUrl(settings.backendUrl);
    setAutoTracking(settings.autoTracking);
    setPrivacyMode(settings.privacyMode);
    setExcludedDomains(settings.excludedDomains.join('\n'));
  }, [settings]);

  const handleSave = async () => {
    const parsedDomains = excludedDomains
      .split('\n')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);

    await updateSettings({
      backendUrl: backendUrl.trim(),
      autoTracking,
      privacyMode,
      excludedDomains: parsedDomains,
    });

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="absolute inset-0 bg-[#090a0f] flex flex-col z-50 animate-in slide-in-from-right duration-200">
      {/* Settings Header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-900 bg-[#0c0d12]">
        <button
          onClick={onClose}
          className="p-1 text-gray-500 hover:text-purple-300 hover:bg-gray-800 rounded transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-200">
          Engine Settings
        </span>
      </div>

      {/* Settings Scroll Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {/* Backend API Connection string */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
            <Globe className="w-3.5 h-3.5" />
            Local Backend Connection
          </label>
          <input
            type="text"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-[#10111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-purple-500/80 transition-colors"
            placeholder="http://localhost:8000"
          />
        </div>

        {/* Feature toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 p-2 bg-[#10111a] border border-gray-800/60 rounded-lg">
            <div className="flex-1">
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">Auto Ingestion</span>
              <span className="text-[8px] text-gray-500 block leading-tight">Index page visits automatically</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoTracking}
                onChange={(e) => setAutoTracking(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-7 h-4 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          <div className="flex items-center justify-between gap-4 p-2 bg-[#10111a] border border-gray-800/60 rounded-lg">
            <div className="flex-1">
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block flex items-center gap-1">
                <EyeOff className="w-3 h-3 text-purple-400" />
                Privacy Controls
              </span>
              <span className="text-[8px] text-gray-500 block leading-tight">Restrict logging on private pages</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={privacyMode}
                onChange={(e) => setPrivacyMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-7 h-4 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600 peer-checked:after:bg-white"></div>
            </label>
          </div>
        </div>

        {/* Exclusions domains textarea */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
            <ShieldAlert className="w-3.5 h-3.5" />
            Excluded Domains
          </label>
          <textarea
            value={excludedDomains}
            onChange={(e) => setExcludedDomains(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 text-xs bg-[#10111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-purple-500/80 transition-colors font-mono resize-none placeholder-gray-600"
            placeholder="e.g. github.com&#10;youtube.com"
          />
          <span className="text-[8px] text-gray-600 leading-tight block">
            One domain per line. Exclusions cover all respective subdomains.
          </span>
        </div>
      </div>

      {/* Save Button Footer */}
      <div className="p-3 border-t border-gray-900 bg-[#0c0d12]">
        <button
          onClick={handleSave}
          disabled={saved}
          className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg border transition-all ${
            saved
              ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-400'
              : 'bg-purple-600 hover:bg-purple-700 border-purple-500 text-white shadow-lg shadow-purple-500/10 cursor-pointer'
          }`}
        >
          <Save className="w-3.5 h-3.5" />
          {saved ? 'Configurations Saved!' : 'Save System Settings'}
        </button>
      </div>
    </div>
  );
};
export default SettingsPanel;
