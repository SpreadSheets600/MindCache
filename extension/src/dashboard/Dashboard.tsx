import React, { useState, useEffect, useRef } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { backendClient } from '../services/backendClient';
import { useSearchStore } from '../store/useSearchStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import SearchResultCard from '../components/SearchResultCard';
import RecentSearches from '../components/RecentSearches';
import KnowledgeGraph from '../components/KnowledgeGraph';
import type { SearchResult } from '../types';
import ShaderBackground from '../components/ShaderBackground';
import { 
  Sparkles, Search, Library, MessageSquare, Settings2, Globe, EyeOff, 
  ShieldAlert, Save, ExternalLink, Copy, Check, Trash2, Send, Loader2, Info,
  Network, Database, Cpu
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
}

export const Dashboard: React.FC = () => {
  const { isOnline, health } = useConnectionStore();
  const { settings, updateSettings, loadSettings } = useSettingsStore();

  const {
    query,
    results,
    aiSummary,
    isLoading,
    startTime,
    endTime,
    setQuery,
    setStartTime,
    setEndTime,
    executeSearch,
    loadRecentSearches
  } = useSearchStore();

  const [generateSummary, setGenerateSummary] = useState(true);
  const [activeTab, setActiveTab] = useState('search');

  const [docs, setDocs] = useState<SearchResult[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<SearchResult | null>(null);
  const [docFilter, setDocFilter] = useState('');
  const [copiedDocId, setCopiedDocId] = useState<number | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [autoTracking, setAutoTracking] = useState(settings.autoTracking);
  const [privacyMode, setPrivacyMode] = useState(settings.privacyMode);
  const [excludedDomains, setExcludedDomains] = useState(settings.excludedDomains.join('\n'));
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    loadSettings();
    loadRecentSearches();
    if (isOnline) {
      loadDocuments();
    }
  }, [loadSettings, loadRecentSearches, isOnline]);

  useEffect(() => {
    setBackendUrl(settings.backendUrl);
    setAutoTracking(settings.autoTracking);
    setPrivacyMode(settings.privacyMode);
    setExcludedDomains(settings.excludedDomains.join('\n'));
  }, [settings]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const loadDocuments = async () => {
    setDocsLoading(true);
    try {
      const response = await backendClient.request<SearchResult[]>('/documents?limit=100');
      setDocs(response);
      if (response.length > 0 && !selectedDoc) {
        setSelectedDoc(response[0]);
      }
    } catch (err) {
      console.warn("Failed To Load Memory Documents:", err);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleDeleteDocument = async (id: number) => {
    try {
      await backendClient.request(`/documents/${id}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
      }
    } catch (err) {
      console.warn("Failed To Delete Document:", err);
    }
  };

  const handleCopyUrl = async (url: string, id: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedDocId(id);
      setTimeout(() => setCopiedDocId(null), 2000);
    } catch (err) {
      console.debug("Failed To Copy URL:", err);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = chatInput.trim();
    if (!prompt || chatLoading) return;

    setChatMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await backendClient.search(prompt, 3, true);
      setChatMessages((prev) => [
        ...prev, 
        { 
          role: 'assistant', 
          content: response.ai_summary || "Memory Engine Could Not Formulate A Synthesis Response.",
          sources: response.results 
        }
      ]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error Querying Local Ollama Engine: ${err.message || 'Server Offline'}` }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    const parsedDomains = excludedDomains
      .split('\n')
      .map((d) => {
        let entry = d.trim().toLowerCase();
        
        if (entry.includes('://')) {
          try {
            const url = new URL(entry);
            entry = url.hostname;
          } catch {
            entry = entry.split('://')[1] || entry;
          }
        }
        
        entry = entry.replace(/^www\./i, '');
        entry = entry.split('/')[0].split(':')[0].split('?')[0];
        return entry.trim();
      })
      .filter((d) => {
        if (d.length === 0) return false;
        const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
        return domainRegex.test(d);
      });

    const uniqueDomains = Array.from(new Set(parsedDomains));

    await updateSettings({
      backendUrl: backendUrl.trim(),
      autoTracking,
      privacyMode,
      excludedDomains: uniqueDomains,
    });

    setExcludedDomains(uniqueDomains.join('\n'));
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const filteredDocs = docs.filter((d) => {
    const filter = docFilter.toLowerCase();
    return (
      (d.title?.toLowerCase() || '').includes(filter) ||
      d.url.toLowerCase().includes(filter) ||
      d.domain.toLowerCase().includes(filter)
    );
  });

  return (
    <div className="w-screen h-screen flex flex-col bg-[#020204] text-zinc-100 select-none overflow-hidden font-modern selection:bg-cyan-500/20 selection:text-cyan-300 relative">
      <ShaderBackground />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#11131f_1px,transparent_1px),linear-gradient(to_bottom,#11131f_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_80%,transparent_100%)] pointer-events-none z-0" />

      <header className="z-10 bg-[#040408]/60 backdrop-blur-xl border-b border-zinc-900/60 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 via-purple-600 to-emerald-500 rounded-lg blur opacity-40 animate-pulse" />
            <img src="/logo.png" alt="MindCache Logo" className="relative w-7 h-7 rounded-lg object-cover border border-zinc-800" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-futuristic font-black text-sm uppercase tracking-wider text-white leading-none">MINDCACHE</h1>
            <span className="text-[8.5px] text-cyan-400 font-bold uppercase tracking-widest font-futuristic mt-0.5">LOCAL COGNITIVE MEMORY BASE</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOnline ? 'bg-cyan-400' : 'bg-rose-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-cyan-500' : 'bg-rose-500'}`}></span>
            </span>
            <span className="font-futuristic font-bold text-[9px] uppercase tracking-wider text-zinc-400">
              {isOnline ? 'ENGINE: ONLINE' : 'ENGINE: OFFLINE'}
            </span>
          </div>

          {isOnline && health && (
            <div className="hidden sm:flex items-center gap-4 text-[9px] text-zinc-500 border-l border-zinc-800 pl-4">
              <span className="flex items-center gap-1 font-mono uppercase">
                <Database className="w-3 h-3 text-cyan-400" />
                VECTORS: {health.components.faiss_index.vectors_count}
              </span>
              <span className="flex items-center gap-1 uppercase font-mono">
                <Cpu className="w-3 h-3 text-purple-400" />
                OLLAMA: {health.components.ollama.status === 'connected' ? health.components.ollama.model : 'OFFLINE'}
              </span>
            </div>
          )}
        </div>
      </header>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-1 overflow-hidden z-10 relative">
        <Tabs.List className="w-64 bg-[#040408]/40 backdrop-blur-xl border-r border-zinc-900/60 p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            <div className="text-[9px] font-futuristic text-zinc-500 uppercase tracking-widest px-2 font-bold">DIRECTORY</div>
            
            <nav className="space-y-1.5 flex flex-col">
              <Tabs.Trigger 
                value="search" 
                className="flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.02] data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/20 border border-transparent transition-all cursor-pointer text-left w-full group"
              >
                <Search className="w-4 h-4 text-cyan-400/80 group-hover:text-cyan-300 transition-colors" />
                <span className="font-display tracking-tight uppercase tracking-wider text-[10.5px]">Search Base</span>
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="history" 
                onClick={loadDocuments}
                className="flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.02] data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/20 border border-transparent transition-all cursor-pointer text-left w-full group"
              >
                <Library className="w-4 h-4 text-purple-400/80 group-hover:text-purple-300 transition-colors" />
                <span className="font-display tracking-tight uppercase tracking-wider text-[10.5px]">Memory Index</span>
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="chat" 
                className="flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.02] data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/20 border border-transparent transition-all cursor-pointer text-left w-full group"
              >
                <MessageSquare className="w-4 h-4 text-purple-400/80 group-hover:text-purple-300 transition-colors" />
                <span className="font-display tracking-tight uppercase tracking-wider text-[10.5px]">Cognitive Chat</span>
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="graph" 
                onClick={loadDocuments}
                className="flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.02] data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/20 border border-transparent transition-all cursor-pointer text-left w-full group"
              >
                <Network className="w-4 h-4 text-emerald-400/80 group-hover:text-emerald-300 transition-colors" />
                <span className="font-display tracking-tight uppercase tracking-wider text-[10.5px]">Knowledge Map</span>
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="settings" 
                className="flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.02] data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/20 border border-transparent transition-all cursor-pointer text-left w-full group"
              >
                <Settings2 className="w-4 h-4 text-zinc-400/80 group-hover:text-white transition-colors" />
                <span className="font-display tracking-tight uppercase tracking-wider text-[10.5px]">Configuration</span>
              </Tabs.Trigger>
            </nav>
          </div>

          <div className="p-3 bg-zinc-950/40 border border-zinc-900 rounded-xl text-center select-none backdrop-blur-md">
            <span className="text-[8.5px] text-zinc-650 font-futuristic uppercase block tracking-widest font-bold">SYSTEM OVERRIDE</span>
            <kbd className="inline-block px-2 py-0.5 mt-2 bg-black border border-zinc-800 rounded text-[9.5px] font-mono text-cyan-400 font-bold uppercase">
              Ctrl+Shift+K
            </kbd>
          </div>
        </Tabs.List>

        <div className="flex-1 flex overflow-hidden bg-[#040408]/20 backdrop-blur-sm">
          
          <Tabs.Content value="search" className="flex-1 flex flex-col overflow-hidden w-full">
            <div className="flex flex-col gap-4 p-6 border-b border-zinc-900/60 bg-[#040408]/30 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 group">
                  <div className="absolute -inset-px bg-gradient-to-r from-cyan-500/30 to-purple-500/30 rounded-xl blur-xs group-focus-within:from-cyan-500/50 group-focus-within:to-purple-500/50 transition duration-300" />
                  <div className="relative flex items-center bg-[#07070a] border border-zinc-800 rounded-xl px-4 py-3">
                    <Search className="w-4.5 h-4.5 text-zinc-500 mr-3" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => {
                        const val = e.target.value;
                        setQuery(val);
                        if (!val.trim()) {
                          useSearchStore.getState().resetSearch();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          executeSearch(6, generateSummary);
                        }
                      }}
                      placeholder="SCAN LOCAL DATABASE HISTORY SEMANTICALLY..."
                      className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none font-technical tracking-wider"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    const nextGen = !generateSummary;
                    setGenerateSummary(nextGen);
                    if (query.trim() && isOnline) {
                      executeSearch(6, nextGen);
                    }
                  }}
                  className={`relative overflow-hidden flex items-center gap-2 px-4 py-3.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                    generateSummary
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 shadow-md shadow-cyan-500/5'
                      : 'bg-zinc-950/80 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span className="font-futuristic uppercase tracking-widest text-[9.5px] font-bold">AI INFERENCE</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-[8.5px] uppercase font-bold tracking-widest text-zinc-600 font-futuristic">FROM_STAMP</span>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      if (query.trim()) {
                        executeSearch(6, generateSummary);
                      }
                    }}
                    className="px-3.5 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-zinc-350 focus:outline-none focus:border-cyan-500/40 transition-colors text-[9.5px] text-center font-mono selection:bg-cyan-500/30 outline-none"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[8.5px] uppercase font-bold tracking-widest text-zinc-600 font-futuristic">TO_STAMP</span>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      if (query.trim()) {
                        executeSearch(6, generateSummary);
                      }
                    }}
                    className="px-3.5 py-2 bg-zinc-950/80 border border-zinc-800 rounded-xl text-zinc-350 focus:outline-none focus:border-cyan-500/40 transition-colors text-[9.5px] text-center font-mono selection:bg-cyan-500/30 outline-none"
                  />
                </div>

                {(startTime || endTime) && (
                  <button
                    onClick={() => {
                      useSearchStore.setState({ startTime: '', endTime: '' });
                      if (query.trim()) {
                        executeSearch(6, generateSummary);
                      }
                    }}
                    className="px-3 py-1.5 text-[9px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-widest cursor-pointer transition-all hover:bg-cyan-500/10 rounded-lg border border-transparent"
                  >
                    RESET_TIMEFRAME
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar bg-[#020204]/40">
              {isLoading && results.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64">
                  <div className="p-5 bg-zinc-950/60 border border-zinc-900 rounded-2xl flex flex-col items-center justify-center max-w-xs relative overflow-hidden">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-cyan-500 to-purple-600 animate-pulse" />
                    <Loader2 className="w-7 h-7 text-cyan-500 animate-spin" />
                    <span className="text-[9.5px] text-zinc-400 mt-4 font-bold uppercase tracking-widest font-futuristic">RESOLVING VECTORS</span>
                  </div>
                </div>
              )}

              {results.length > 0 && (
                <div className="max-w-4xl mx-auto space-y-4">
                  {aiSummary && (
                    <div className="p-5 bg-gradient-to-tr from-cyan-950/5 via-zinc-950/10 to-purple-950/5 border border-cyan-500/20 rounded-2xl relative overflow-hidden">
                      <div className="absolute -right-20 -top-20 w-44 h-44 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
                      <div className="flex items-center gap-2 mb-2.5">
                        <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-300 font-futuristic">
                          INFERENCE SYNTHESIS ANSWER
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed font-sans select-text">
                        {aiSummary}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {results.map((item) => (
                      <SearchResultCard key={item.id} result={item} />
                    ))}
                  </div>
                </div>
              )}

              {!query.trim() && (
                <div className="flex flex-col items-center justify-center h-80 max-w-md mx-auto text-center py-12">
                  <Search className="w-8 h-8 text-cyan-500/20 mb-4 animate-pulse" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-futuristic">
                    VECTOR SEARCH ENGINE
                  </h3>
                  <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed font-light font-sans max-w-sm">
                    Enter terms or phrases you read previously. Semantic inner product calculations will retrieve the closest matches locally.
                  </p>
                  <div className="w-full mt-8">
                    <RecentSearches generateSummary={generateSummary} />
                  </div>
                </div>
              )}

              {query.trim() && results.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Info className="w-6 h-6 text-zinc-700 mb-3" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-550 font-futuristic">ZERO DATABASE MATCHES</h3>
                  <p className="text-[9.5px] text-zinc-650 mt-1 font-light">Confirm the local server is operating correctly.</p>
                </div>
              )}
            </div>
          </Tabs.Content>

          <Tabs.Content value="history" className="flex-1 flex overflow-hidden w-full">
            <div className="w-80 border-r border-zinc-900/60 bg-[#040408]/30 backdrop-blur-xl flex flex-col shrink-0">
              <div className="p-4 border-b border-zinc-900/60 bg-black/20">
                <input
                  type="text"
                  placeholder="FILTER ARCHIVE LOGS..."
                  value={docFilter}
                  onChange={(e) => setDocFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-[#07070a] border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-500/50 placeholder-zinc-700 font-technical tracking-wider"
                />
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1.5 bg-[#020204]/30">
                {docsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="text-center py-12 text-[10px] text-zinc-600 font-mono uppercase tracking-widest">Database Empty.</div>
                ) : (
                  filteredDocs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`p-3 mx-1 my-0.5 rounded-xl text-left transition-all border block w-[calc(100%-8px)] ${
                        selectedDoc?.id === doc.id
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                          : 'bg-transparent border-transparent hover:bg-white/[0.02] hover:text-zinc-300'
                      }`}
                    >
                      <h4 className="text-xs font-semibold truncate font-display tracking-tight text-zinc-200">{doc.title || doc.url}</h4>
                      <span className="text-[8px] text-zinc-500 block font-mono mt-1 truncate uppercase tracking-widest">{doc.domain}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden bg-[#020204]/40 select-text">
              {selectedDoc ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  
                  <div className="p-6 border-b border-zinc-900/60 bg-[#040408]/30 backdrop-blur-xl flex items-start justify-between gap-6">
                    <div className="min-w-0">
                      <h2 className="font-display font-bold text-lg md:text-xl uppercase text-white tracking-tight leading-tight select-all">
                        {selectedDoc.title || 'Untitled Webpage'}
                      </h2>
                      <a 
                        href={selectedDoc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mt-2.5 font-mono break-all tracking-tight transition-colors uppercase"
                      >
                        {selectedDoc.url}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 select-none">
                      <button
                        onClick={() => handleCopyUrl(selectedDoc.url, selectedDoc.id)}
                        className="p-2.5 bg-zinc-950/80 border border-zinc-800 text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/30 rounded-xl transition-all cursor-pointer"
                        title="Copy Link"
                      >
                        {copiedDocId === selectedDoc.id ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(selectedDoc.id)}
                        className="p-2.5 bg-rose-950/10 border border-rose-900/30 hover:bg-rose-900/30 text-rose-400 rounded-xl transition-all cursor-pointer"
                        title="Delete Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                    
                    {selectedDoc.summary && (
                      <div className="p-5 bg-gradient-to-tr from-cyan-950/5 via-zinc-950/10 to-purple-950/5 border border-cyan-500/20 rounded-2xl select-text">
                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-cyan-300 mb-2.5 flex items-center gap-1.5 font-futuristic">
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                          INFERENCE SYNTHESIS
                        </h4>
                        <p className="text-xs text-zinc-350 leading-relaxed font-sans">
                          {selectedDoc.summary}
                        </p>
                      </div>
                    )}

                    {selectedDoc.keywords.length > 0 && (
                      <div className="space-y-2.5 select-none">
                        <span className="text-[8.5px] font-bold text-zinc-500 uppercase tracking-widest block font-futuristic">EXTRACTED_TAGS</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedDoc.keywords.map((kw, idx) => (
                            <span 
                              key={idx}
                              className="px-2.5 py-1 text-[9px] bg-zinc-950 border border-zinc-900 text-zinc-400 hover:text-white rounded-lg font-mono transition-colors"
                            >
                              {kw.keyword.toUpperCase()} • {Math.round(kw.score * 100)}%
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2.5 select-text">
                      <span className="text-[8.5px] font-bold text-zinc-500 uppercase tracking-widest block select-none font-futuristic">DOCUMENT_RAW_CONTENT</span>
                      <div className="bg-[#07070a]/90 border border-zinc-900 rounded-xl p-5 font-technical text-xs text-zinc-300 leading-relaxed max-w-4xl whitespace-pre-wrap">
                        {selectedDoc.extracted_content}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <Library className="w-8 h-8 text-zinc-800 mb-3" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 font-futuristic">NO DOCUMENT ACTIVE</h3>
                  <p className="text-[9.5px] text-zinc-600 font-light mt-1 max-w-xs leading-relaxed">Select any database element from the side tree to explore vectors, AI models output, and text context.</p>
                </div>
              )}
            </div>
          </Tabs.Content>

          <Tabs.Content value="chat" className="flex-1 flex flex-col overflow-hidden w-full">
            <div className="p-4 border-b border-zinc-900/60 bg-[#040408]/30 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-cyan-950/20 border border-cyan-500/20 rounded-xl text-cyan-400 shrink-0">
                  <Sparkles className="w-4 h-4 shrink-0 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-200 font-futuristic">COGNITIVE INTERACTIVE CHAT</h2>
                  <span className="text-[8.5px] text-zinc-650 block leading-none font-mono uppercase mt-0.5">Vector retrieval agent context chat</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar bg-[#020204]/40 select-text">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-80 max-w-md mx-auto text-center">
                  <MessageSquare className="w-8 h-8 text-cyan-500/15 mb-4 animate-pulse" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 font-futuristic">AGENT INTERFACE ACTIVED</h3>
                  <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed font-light max-w-xs font-sans">
                    Ask queries relating to pages you visited. Ollama will formulate context based on matching vectors and synthesize answers locally.
                  </p>
                </div>
              )}

              {chatMessages.map((msg, idx) => (
                <div 
                  key={idx}
                  className={`flex flex-col max-w-3xl ${
                    msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                  }`}
                >
                  <span className="text-[8.5px] text-zinc-550 font-bold uppercase tracking-widest mb-1 select-none font-mono">
                    {msg.role === 'user' ? 'CLIENT_USER' : 'COGNITIVE_CORE'}
                  </span>

                  <div className={`p-4 rounded-2xl text-xs leading-relaxed max-w-full relative overflow-hidden ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-cyan-600 to-purple-650 text-white font-medium rounded-tr-none shadow-lg shadow-cyan-500/5'
                      : 'bg-[#07070a] border border-cyan-500/10 text-zinc-200 rounded-tl-none shadow-md'
                  }`}>
                    {msg.role !== 'user' && (
                      <div className="absolute -top-12 -left-12 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
                    )}
                    
                    <span className="relative z-10 select-text">{msg.content}</span>

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 border-t border-zinc-900/60 pt-3 space-y-2 select-none relative z-10">
                        <span className="text-[8.5px] font-bold text-zinc-500 uppercase tracking-widest block font-futuristic">REFERENCE_NODES</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.sources.map((src, sIdx) => (
                            <a
                              key={sIdx}
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 bg-black/40 hover:bg-cyan-950/20 border border-zinc-900 hover:border-cyan-500/25 rounded-lg flex flex-col text-left group transition-all"
                            >
                              <span className="text-[9.5px] font-semibold text-zinc-300 group-hover:text-cyan-300 truncate font-display">
                                [{sIdx + 1}] {src.title || 'Untitled Webpage'}
                              </span>
                              <span className="text-[8px] text-zinc-650 font-mono mt-0.5 truncate uppercase tracking-widest">{src.domain}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex flex-col items-start max-w-3xl mr-auto select-none">
                  <span className="text-[8.5px] text-zinc-550 font-bold uppercase tracking-widest mb-1 font-mono">COGNITIVE_CORE</span>
                  <div className="p-4 bg-[#07070a] border border-cyan-500/10 rounded-2xl rounded-tl-none flex items-center gap-2.5 text-xs text-zinc-400 shadow-md">
                    <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    <span className="font-mono uppercase tracking-wider text-[9px] text-zinc-500">Retrieving vector weights and running LLM summary...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendChatMessage} className="p-4 border-t border-zinc-900/60 bg-[#040408]/30 backdrop-blur-xl">
              <div className="flex items-center gap-2 max-w-4xl mx-auto relative group">
                <input
                  type="text"
                  placeholder="QUERY AGENT: 'WHAT DID I RESEARCH RELATING TO GITHUB AND PYTHON?'"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 px-4 py-3 text-xs bg-[#07070a] border border-zinc-900 rounded-xl text-zinc-250 placeholder-zinc-700 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 font-technical uppercase tracking-wider"
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="p-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-[#07070a]/80 disabled:border-zinc-900 disabled:text-zinc-650 text-white border border-cyan-500 disabled:border-transparent rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all shrink-0 active:scale-[0.98]"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </Tabs.Content>

          <Tabs.Content value="graph" className="flex-1 flex overflow-hidden w-full">
            <div className="flex-1 relative w-full h-full bg-[#020204]/40">
              <KnowledgeGraph 
                docs={docs} 
                loadDocuments={loadDocuments} 
                docsLoading={docsLoading} 
                onOpenInHistory={(doc) => {
                  setActiveTab('history');
                  setSelectedDoc(doc);
                }} 
              />
            </div>
          </Tabs.Content>

          <Tabs.Content value="settings" className="flex-1 flex overflow-hidden w-full select-none overflow-y-auto no-scrollbar">
            <div className="max-w-2xl mx-auto p-6 space-y-6 w-full bg-[#020204]/20">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-100 font-futuristic">SYSTEM CONFIGURATIONS</h2>
                <span className="text-[9.5px] text-zinc-550 font-mono mt-1 block">MANAGE LOCAL ENDPOINTS, DEBOUNCING SAFEGUARDS, AND DOMAIN EXCLUSIONS.</span>
              </div>

              <div className="space-y-4">
                
                <div className="relative p-5 bg-zinc-950/40 border border-zinc-900 rounded-2xl overflow-hidden group">
                  <label className="flex items-center gap-1.5 text-[8.5px] font-bold text-zinc-500 uppercase tracking-widest block font-futuristic mb-2.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    LOCAL_SERVER_ENDPOINT_URL
                  </label>
                  <input
                    type="text"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#07070a] border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-500/60 font-mono transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between gap-4 p-5 bg-zinc-950/40 border border-zinc-900 rounded-2xl overflow-hidden group">
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest font-futuristic block">AUTO INGESTION</span>
                      <span className="text-[8px] text-zinc-550 block leading-tight mt-1 font-mono">Parse webpages visited in tabs automatically</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoTracking}
                        onChange={(e) => setAutoTracking(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-7 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-600 peer-checked:after:bg-white"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-4 p-5 bg-zinc-950/40 border border-zinc-900 rounded-2xl overflow-hidden group">
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest font-futuristic block flex items-center gap-1">
                        <EyeOff className="w-3.5 h-3.5 text-purple-400" />
                        PRIVACY SAFEGUARD
                      </span>
                      <span className="text-[8px] text-zinc-550 block leading-tight mt-1 font-mono">Filter queries and tracking on private pages</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={privacyMode}
                        onChange={(e) => setPrivacyMode(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-7 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-600 peer-checked:after:bg-white"></div>
                    </label>
                  </div>
                </div>

                <div className="relative p-5 bg-zinc-950/40 border border-zinc-900 rounded-2xl overflow-hidden group">
                  <label className="flex items-center gap-1.5 text-[8.5px] font-bold text-zinc-500 uppercase tracking-widest block font-futuristic mb-2.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
                    EXCLUSIONS_DOMAIN_BLACKLIST
                  </label>
                  <textarea
                    value={excludedDomains}
                    onChange={(e) => setExcludedDomains(e.target.value)}
                    rows={5}
                    className="w-full px-3.5 py-3 text-xs bg-[#07070a] border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-cyan-500/60 font-mono resize-none"
                    placeholder="github.com&#10;youtube.com"
                  />
                  <span className="text-[8px] text-zinc-650 block leading-tight mt-2 font-mono">
                    Subdomains are blocked automatically. Disables tracking pipeline immediately when visiting tabs on these domains.
                  </span>
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={settingsSaved}
                className={`w-full flex items-center justify-center gap-2 py-3 text-xs font-bold rounded-xl border transition-all ${
                  settingsSaved
                    ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-cyan-600 hover:bg-cyan-700 border-cyan-500 text-white shadow-lg shadow-cyan-500/10 cursor-pointer active:scale-[0.99] font-futuristic uppercase tracking-widest text-[9.5px]'
                }`}
              >
                <Save className="w-4 h-4" />
                {settingsSaved ? 'CONFIGURATIONS_SAVED_SUCCESSFULLY' : 'SAVE_SYSTEM_OVERRIDE_SETTINGS'}
              </button>
            </div>
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
};
export default Dashboard;
