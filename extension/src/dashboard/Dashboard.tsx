import React, { useState, useEffect, useRef } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { backendClient } from '../services/backendClient';
import { useSearchStore } from '../store/useSearchStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import SearchResultCard from '../components/SearchResultCard';
import RecentSearches from '../components/RecentSearches';
import BackendStatus from '../components/BackendStatus';
import KnowledgeGraph from '../components/KnowledgeGraph';
import type { SearchResult } from '../types';
import ShaderBackground from '../components/ShaderBackground';
import { 
  Sparkles, Search, Library, MessageSquare, Settings2, Globe, EyeOff, 
  ShieldAlert, Save, ExternalLink, Copy, Check, Trash2, Send, Loader2, Info,
  Network
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
}

export const Dashboard: React.FC = () => {
  // Navigation States And Data Stores
  const { isOnline } = useConnectionStore();
  const { settings, updateSettings, loadSettings } = useSettingsStore();

  // Search Store Hook Connectors
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

  // Documents Memory Tab State Connectors
  const [docs, setDocs] = useState<SearchResult[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<SearchResult | null>(null);
  const [docFilter, setDocFilter] = useState('');
  const [copiedDocId, setCopiedDocId] = useState<number | null>(null);

  // Cognitive Chat Conversation Thread States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Configuration Panel Local Form States
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [autoTracking, setAutoTracking] = useState(settings.autoTracking);
  const [privacyMode, setPrivacyMode] = useState(settings.privacyMode);
  const [excludedDomains, setExcludedDomains] = useState(settings.excludedDomains.join('\n'));
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Initialize Configurations And Recent Searches List
  useEffect(() => {
    loadSettings();
    loadRecentSearches();
    if (isOnline) {
      loadDocuments();
    }
  }, [loadSettings, loadRecentSearches, isOnline]);

  // Sync Input Elements To Store Upgrades
  useEffect(() => {
    setBackendUrl(settings.backendUrl);
    setAutoTracking(settings.autoTracking);
    setPrivacyMode(settings.privacyMode);
    setExcludedDomains(settings.excludedDomains.join('\n'));
  }, [settings]);

  // Scroll Chat Thread Messages Frame To Bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Fetch SQLite Page Documents List
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

  // Delete Indexed Webpage Entries
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

  // Copy Selected URL Endpoint
  const handleCopyUrl = async (url: string, id: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedDocId(id);
      setTimeout(() => setCopiedDocId(null), 2000);
    } catch (err) {
      console.debug("Failed To Copy URL:", err);
    }
  };

  // Dispatch Messages To Ollama Retrieval Agent
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

  // Save Settings Payload
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

  // Client Side Ingestion Filters
  const filteredDocs = docs.filter((d) => {
    const filter = docFilter.toLowerCase();
    return (
      (d.title?.toLowerCase() || '').includes(filter) ||
      d.url.toLowerCase().includes(filter) ||
      d.domain.toLowerCase().includes(filter)
    );
  });

  return (
    <div className="w-screen h-screen flex flex-col bg-[#030305] text-gray-200 select-none overflow-hidden font-technical selection:bg-purple-600/30 selection:text-purple-300 relative">
      
      {/* Background WebGL Shader Layer */}
      <ShaderBackground />

      {/* Grid Pattern Foreground Filter */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0c0d12_1px,transparent_1px),linear-gradient(to_bottom,#0c0d12_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none z-0" />

      {/* Diagnostics Status Panel */}
      <div className="z-10 relative">
        <BackendStatus />
      </div>

      {/* Primary Navigation System */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-1 overflow-hidden z-10 relative">
        
        {/* Sleek Translucent Sidebar */}
        <Tabs.List className="w-64 bg-[#030305]/40 backdrop-blur-xl border-r border-gray-900/60 p-5 flex flex-col justify-between shrink-0 z-10 relative">
          <div className="space-y-8">
            
            {/* Logo Brand Header */}
            <div className="flex items-center gap-3 px-2">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg blur opacity-45 group-hover:opacity-75 transition duration-300" />
                <img src="/logo.png" alt="MindCache Logo" className="relative w-8 h-8 rounded-lg object-cover border border-purple-500/25" />
              </div>
              <div>
                <h1 className="font-display font-extrabold text-[13px] uppercase tracking-wider text-white m-0">MindCache</h1>
                <span className="text-[8.5px] text-purple-400 font-bold uppercase tracking-widest font-mono">Collective Engine</span>
              </div>
            </div>

            {/* Navigation Lists */}
            <nav className="space-y-2 flex flex-col">
              <Tabs.Trigger 
                value="search" 
                className="flex items-center gap-3.5 px-4 py-3 text-xs font-semibold rounded-xl text-gray-400 hover:text-gray-200 hover:bg-white/[0.02] data-[state=active]:bg-purple-950/15 data-[state=active]:text-purple-300 data-[state=active]:border-purple-500/30 border border-transparent transition-all cursor-pointer text-left w-full group"
              >
                <Search className="w-4 h-4 text-purple-400/80 group-hover:text-purple-300 transition-colors" />
                <span className="font-display tracking-tight">Spotlight Search</span>
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="history" 
                onClick={loadDocuments}
                className="flex items-center gap-3.5 px-4 py-3 text-xs font-semibold rounded-xl text-gray-400 hover:text-gray-200 hover:bg-white/[0.02] data-[state=active]:bg-purple-950/15 data-[state=active]:text-purple-300 data-[state=active]:border-purple-500/30 border border-transparent transition-all cursor-pointer text-left w-full group"
              >
                <Library className="w-4 h-4 text-purple-400/80 group-hover:text-purple-300 transition-colors" />
                <span className="font-display tracking-tight">Document Memory</span>
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="chat" 
                className="flex items-center gap-3.5 px-4 py-3 text-xs font-semibold rounded-xl text-gray-400 hover:text-gray-200 hover:bg-white/[0.02] data-[state=active]:bg-purple-950/15 data-[state=active]:text-purple-300 data-[state=active]:border-purple-500/30 border border-transparent transition-all cursor-pointer text-left w-full group"
              >
                <MessageSquare className="w-4 h-4 text-purple-400/80 group-hover:text-purple-300 transition-colors" />
                <span className="font-display tracking-tight">Interactive Chat</span>
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="graph" 
                onClick={loadDocuments}
                className="flex items-center gap-3.5 px-4 py-3 text-xs font-semibold rounded-xl text-gray-400 hover:text-gray-200 hover:bg-white/[0.02] data-[state=active]:bg-purple-950/15 data-[state=active]:text-purple-300 data-[state=active]:border-purple-500/30 border border-transparent transition-all cursor-pointer text-left w-full group"
              >
                <Network className="w-4 h-4 text-purple-400/80 group-hover:text-purple-300 transition-colors" />
                <span className="font-display tracking-tight">Knowledge Graph</span>
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="settings" 
                className="flex items-center gap-3.5 px-4 py-3 text-xs font-semibold rounded-xl text-gray-400 hover:text-gray-200 hover:bg-white/[0.02] data-[state=active]:bg-purple-950/15 data-[state=active]:text-purple-300 data-[state=active]:border-purple-500/30 border border-transparent transition-all cursor-pointer text-left w-full group"
              >
                <Settings2 className="w-4 h-4 text-purple-400/80 group-hover:text-purple-300 transition-colors" />
                <span className="font-display tracking-tight">Configurations</span>
              </Tabs.Trigger>
            </nav>
          </div>

          {/* Shortcut Key Info */}
          <div className="px-3 py-4 bg-[#090a10]/50 border border-gray-900 rounded-xl text-center select-none backdrop-blur-md">
            <span className="text-[9px] text-gray-500 font-mono block leading-normal">Spotlight Hotkey</span>
            <kbd className="inline-block px-2 py-0.5 mt-2 bg-[#030305] border border-gray-800 rounded text-[9px] font-mono text-purple-400 font-bold">
              Ctrl+Shift+K
            </kbd>
          </div>
        </Tabs.List>

        {/* Workspace Display Screens */}
        <div className="flex-1 flex overflow-hidden bg-[#030305]/20 backdrop-blur-sm">
          
          {/* TAB 1: SPOTLIGHT VECTOR SEARCH */}
          <Tabs.Content value="search" className="flex-1 flex flex-col overflow-hidden w-full">
            
            {/* Holographic Header Command Panel */}
            <div className="flex flex-col gap-4 p-6 border-b border-gray-900/60 bg-[#030305]/35 backdrop-blur-md relative">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl blur opacity-20 group-focus-within:opacity-40 transition duration-300" />
                  <div className="relative flex items-center bg-[#090a10]/80 border border-gray-900 rounded-xl px-4 py-3">
                    <Search className="w-4.5 h-4.5 text-gray-500 mr-3" />
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
                      placeholder="Query your browsed articles semantically... (Press Enter)"
                      className="w-full bg-transparent text-xs text-gray-200 placeholder-gray-500 focus:outline-none font-sans"
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
                      ? 'bg-purple-950/20 border-purple-500/35 text-purple-300 shadow-md shadow-purple-500/5'
                      : 'bg-[#090a10]/80 border-gray-900 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="font-display">AI Summary</span>
                </button>
              </div>

              {/* Ingestion Filtering Time Matrix */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-gray-500">From</span>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      if (query.trim()) {
                        executeSearch(6, generateSummary);
                      }
                    }}
                    className="px-3.5 py-2 bg-[#090a10]/80 border border-gray-900 rounded-xl text-gray-300 focus:outline-none focus:border-purple-500/60 transition-colors text-[10px] text-center font-mono selection:bg-purple-500/30"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-gray-500">To</span>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      if (query.trim()) {
                        executeSearch(6, generateSummary);
                      }
                    }}
                    className="px-3.5 py-2 bg-[#090a10]/80 border border-gray-900 rounded-xl text-gray-300 focus:outline-none focus:border-purple-500/60 transition-colors text-[10px] text-center font-mono selection:bg-purple-500/30"
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
                    className="px-3 py-1.5 text-[9px] text-purple-400 hover:text-purple-300 font-bold uppercase tracking-widest cursor-pointer transition-all hover:bg-purple-500/10 rounded-lg border border-transparent hover:border-purple-500/20"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            </div>

            {/* Results Rendering Stream */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar">
              {isLoading && results.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64">
                  <div className="p-4 bg-[#090a10]/40 border border-gray-900 rounded-2xl flex flex-col items-center justify-center max-w-sm">
                    <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                    <span className="text-[10px] text-gray-500 mt-3.5 font-bold uppercase tracking-widest font-mono">Running Vector Scan...</span>
                  </div>
                </div>
              )}

              {results.length > 0 && (
                <div className="max-w-4xl mx-auto space-y-4">
                  {/* Synthesis Prompt Output */}
                  {aiSummary && (
                    <div className="p-5 bg-gradient-to-tr from-purple-950/10 via-blue-950/5 to-purple-950/10 border border-purple-500/25 rounded-2xl shadow-xl shadow-purple-500/[0.02]">
                      <div className="flex items-center gap-2 mb-2.5">
                        <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 font-display">
                          Collective Synthesis Answer
                        </span>
                      </div>
                      <p className="text-xs text-purple-200/90 leading-relaxed font-sans select-text">
                        {aiSummary}
                      </p>
                    </div>
                  )}

                  {/* Similarity Result Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {results.map((item) => (
                      <SearchResultCard key={item.id} result={item} />
                    ))}
                  </div>
                </div>
              )}

              {!query.trim() && (
                <div className="flex flex-col items-center justify-center h-80 max-w-md mx-auto text-center py-12">
                  <Search className="w-10 h-10 text-purple-500/25 mb-4" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 font-display">
                    MindCache Vector Spotlight
                  </h3>
                  <p className="text-[10.5px] text-gray-500 mt-2 leading-relaxed font-light">
                    Ask your browser memory questions. FAISS similarity searches will resolve closest cosine matches.
                  </p>
                  <div className="w-full mt-8">
                    <RecentSearches generateSummary={generateSummary} />
                  </div>
                </div>
              )}

              {query.trim() && results.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Info className="w-8 h-8 text-gray-600 mb-3" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-450 font-display">No Semantic Hits Found</h3>
                  <p className="text-[10px] text-gray-600 mt-1 font-light">Try typing details of pages you previously read.</p>
                </div>
              )}
            </div>
          </Tabs.Content>

          {/* TAB 2: DOCUMENT MEMORY EXPLORER */}
          <Tabs.Content value="history" className="flex-1 flex overflow-hidden w-full">
            
            {/* Sidebar List Of Documents */}
            <div className="w-80 border-r border-gray-900/60 bg-[#030305]/30 backdrop-blur-md flex flex-col shrink-0">
              <div className="p-4 border-b border-gray-900/60">
                <input
                  type="text"
                  placeholder="Filter by title/domain..."
                  value={docFilter}
                  onChange={(e) => setDocFilter(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-[#090a10]/80 border border-gray-900 rounded-xl text-gray-200 focus:outline-none focus:border-purple-500/60 placeholder-gray-600 transition-colors"
                />
              </div>

              {/* Scrollable List Container */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-2.5 space-y-1 bg-[#030305]/10">
                {docsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 text-gray-650 animate-spin" />
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="text-center py-12 text-[10px] text-gray-600 font-mono">No Documents Stored.</div>
                ) : (
                  filteredDocs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`p-3 mx-1 my-0.5 rounded-xl text-left transition-all border block w-[calc(100%-8px)] ${
                        selectedDoc?.id === doc.id
                          ? 'bg-purple-950/15 border-purple-500/30 text-purple-300'
                          : 'bg-transparent border-transparent hover:bg-white/[0.02] hover:text-gray-300'
                      }`}
                    >
                      <h4 className="text-xs font-semibold truncate font-display">{doc.title || doc.url}</h4>
                      <span className="text-[8.5px] text-gray-500 block font-mono mt-0.5 truncate uppercase tracking-widest">{doc.domain}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Document Details Workspace */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#030305]/20 backdrop-blur-sm select-text">
              {selectedDoc ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  
                  {/* Detail Panel Header */}
                  <div className="p-6 border-b border-gray-900/60 bg-[#030305]/45 flex items-start justify-between gap-6">
                    <div className="min-w-0">
                      <h2 className="font-display font-black text-xl md:text-2xl uppercase text-white tracking-tight leading-tight select-all">
                        {selectedDoc.title || 'Untitled Webpage'}
                      </h2>
                      <a 
                        href={selectedDoc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9.5px] text-purple-400 hover:text-purple-300 flex items-center gap-1 mt-2.5 font-mono break-all tracking-tight transition-colors"
                      >
                        {selectedDoc.url}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                    
                    {/* Action Triggers */}
                    <div className="flex items-center gap-2 shrink-0 select-none">
                      <button
                        onClick={() => handleCopyUrl(selectedDoc.url, selectedDoc.id)}
                        className="p-2.5 bg-[#090a10]/85 border border-gray-900 text-gray-400 hover:text-purple-300 hover:border-purple-500/30 rounded-xl transition-all cursor-pointer"
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
                        className="p-2.5 bg-rose-950/20 border border-rose-900/40 hover:bg-rose-900/40 text-rose-450 rounded-xl transition-all cursor-pointer"
                        title="Delete Document from Memory"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Detail Area Scroll Framework */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                    
                    {/* Summary Callout */}
                    {selectedDoc.summary && (
                      <div className="p-5 bg-gradient-to-tr from-purple-950/10 via-blue-950/5 to-purple-950/10 border border-purple-500/20 rounded-2xl select-text">
                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-purple-300 mb-2.5 flex items-center gap-1.5 font-display">
                          <Sparkles className="w-4 h-4 text-purple-400" />
                          AI Webpage Summary
                        </h4>
                        <p className="text-xs text-purple-200/90 leading-relaxed">
                          {selectedDoc.summary}
                        </p>
                      </div>
                    )}

                    {/* Keywords Matrix */}
                    {selectedDoc.keywords.length > 0 && (
                      <div className="space-y-2 select-none">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block font-mono">Extracted Keywords</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedDoc.keywords.map((kw, idx) => (
                            <span 
                              key={idx}
                              className="px-2.5 py-1 text-[9px] bg-[#090a10]/80 border border-gray-900 text-gray-400 hover:text-white rounded-lg font-mono font-medium transition-colors"
                            >
                              {kw.keyword} ({Math.round(kw.score * 100)}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Full Raw Content Display */}
                    <div className="space-y-2 select-text">
                      <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block select-none font-mono">Extracted Webpage Content</span>
                      <div className="bg-[#090a10]/70 border border-gray-900 rounded-xl p-5 font-sans text-xs text-gray-300 leading-relaxed max-w-4xl whitespace-pre-wrap">
                        {selectedDoc.extracted_content}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <Library className="w-10 h-10 text-gray-700 mb-3" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-450 font-display">No Document Selected</h3>
                  <p className="text-[10px] text-gray-600 font-light mt-1">Select any webpage from the list to explore metadata and text content.</p>
                </div>
              )}
            </div>
          </Tabs.Content>

          {/* TAB 3: AI COGNITIVE CHAT ROOM */}
          <Tabs.Content value="chat" className="flex-1 flex flex-col overflow-hidden w-full">
            
            {/* Thread Header */}
            <div className="p-4 border-b border-gray-900/60 bg-[#030305]/45 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-950/20 border border-purple-500/30 rounded-xl text-purple-400 shrink-0">
                  <Sparkles className="w-4 h-4 shrink-0" />
                </div>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200 font-display">Interactive Cognitive Chat</h2>
                  <span className="text-[8.5px] text-gray-500 block leading-tight font-mono">Conversation with your browser history</span>
                </div>
              </div>
            </div>

            {/* Conversation Flow */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar bg-[#030305]/5 select-text">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-80 max-w-md mx-auto text-center">
                  <MessageSquare className="w-10 h-10 text-purple-500/25 mb-4" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 font-display">Ask Your Browser Memory</h3>
                  <p className="text-[10.5px] text-gray-500 mt-2 leading-relaxed font-light">
                    Type any query about articles you have visited. Ollama will query FAISS for context, retrieve matching documents, and synthesize an answer.
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
                  <span className="text-[9.5px] text-gray-500 font-bold uppercase tracking-wider mb-1 select-none font-mono">
                    {msg.role === 'user' ? 'You' : 'MindCache Memory'}
                  </span>

                  <div className={`p-4 rounded-2xl text-xs leading-relaxed max-w-full relative overflow-hidden ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-tr-none shadow-lg shadow-purple-500/10'
                      : 'bg-[#090a10]/95 border border-purple-500/15 text-gray-200 rounded-tl-none shadow-md'
                  }`}>
                    {msg.role !== 'user' && (
                      <div className="absolute -top-12 -left-12 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
                    )}
                    
                    <span className="relative z-10 select-text">{msg.content}</span>

                    {/* Source References */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 border-t border-gray-900/60 pt-3 space-y-2 select-none relative z-10">
                        <span className="text-[8.5px] font-bold text-gray-500 uppercase tracking-widest block font-mono">Referenced Webpages</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.sources.map((src, sIdx) => (
                            <a
                              key={sIdx}
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 bg-[#030305]/60 hover:bg-purple-950/20 border border-gray-900 hover:border-purple-500/25 rounded-lg flex flex-col text-left group transition-all"
                            >
                              <span className="text-[9.5px] font-semibold text-gray-300 group-hover:text-purple-300 truncate font-display">
                                [{sIdx + 1}] {src.title || 'Untitled Webpage'}
                              </span>
                              <span className="text-[8px] text-gray-650 font-mono mt-0.5 truncate uppercase tracking-widest">{src.domain}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Chat Loading Response Bubble */}
              {chatLoading && (
                <div className="flex flex-col items-start max-w-3xl mr-auto select-none">
                  <span className="text-[9.5px] text-gray-500 font-bold uppercase tracking-wider mb-1 font-mono">MindCache Memory</span>
                  <div className="p-4 bg-[#090a10]/95 border border-purple-500/10 rounded-2xl rounded-tl-none flex items-center gap-2.5 text-xs text-gray-400 shadow-md">
                    <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                    <span className="font-mono">Searching FAISS and synthesizing collective summary via Ollama...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Submission Panel */}
            <form onSubmit={handleSendChatMessage} className="p-4 border-t border-gray-900/60 bg-[#030305]/45 backdrop-blur-md">
              <div className="flex items-center gap-2 max-w-4xl mx-auto relative group">
                <input
                  type="text"
                  placeholder="Ask your memory: 'What did I read about karpathy coding guidelines?'"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 px-4 py-3 text-xs bg-[#090a10]/90 border border-gray-900 rounded-xl text-gray-250 placeholder-gray-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40"
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="p-3 bg-purple-600 hover:bg-purple-700 disabled:bg-[#090a10]/80 disabled:border-gray-900 disabled:text-gray-600 text-white border border-purple-500 disabled:border-transparent rounded-xl cursor-pointer disabled:cursor-not-allowed transition-all shrink-0 active:scale-[0.98]"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </Tabs.Content>

          {/* TAB 5: KNOWLEDGE GRAPH */}
          <Tabs.Content value="graph" className="flex-1 flex overflow-hidden w-full">
            <div className="flex-1 relative w-full h-full bg-[#030305]/10">
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

          {/* TAB 4: CONFIGURATION SETTINGS */}
          <Tabs.Content value="settings" className="flex-1 flex overflow-hidden w-full select-none overflow-y-auto no-scrollbar">
            <div className="max-w-2xl mx-auto p-6 space-y-6 w-full">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-100 font-display">System Configurations</h2>
                <span className="text-[10px] text-gray-500 font-mono mt-1 block">Manage database connections, ingestion rules, and privacy exclusions list.</span>
              </div>

              {/* Bento Grid Layout Configuration Form */}
              <div className="space-y-4">
                
                {/* Connection Address URL */}
                <div className="relative p-5 bg-[#090a10]/45 border border-gray-900 rounded-2xl overflow-hidden group">
                  <label className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest block font-mono mb-2">
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                    Local Server Endpoint
                  </label>
                  <input
                    type="text"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs bg-[#030305]/80 border border-gray-900 rounded-xl text-gray-200 focus:outline-none focus:border-purple-500/60 font-mono transition-colors"
                  />
                </div>

                {/* Switch Triggers Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between gap-4 p-5 bg-[#090a10]/45 border border-gray-900 rounded-2xl overflow-hidden group">
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest font-display block">Auto Ingestion</span>
                      <span className="text-[8px] text-gray-500 block leading-tight mt-1 font-mono">Parse webpages visited in tabs automatically</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoTracking}
                        onChange={(e) => setAutoTracking(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-7 h-4 bg-gray-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600 peer-checked:after:bg-white"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-4 p-5 bg-[#090a10]/45 border border-gray-900 rounded-2xl overflow-hidden group">
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest font-display block flex items-center gap-1">
                        <EyeOff className="w-3.5 h-3.5 text-purple-400" />
                        Privacy Safeguard
                      </span>
                      <span className="text-[8px] text-gray-500 block leading-tight mt-1 font-mono">Filter queries and tracking on private pages</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={privacyMode}
                        onChange={(e) => setPrivacyMode(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-7 h-4 bg-gray-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600 peer-checked:after:bg-white"></div>
                    </label>
                  </div>
                </div>

                {/* Excluded Domain Textarea */}
                <div className="relative p-5 bg-[#090a10]/45 border border-gray-900 rounded-2xl overflow-hidden group">
                  <label className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest block font-mono mb-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-yellow-500" />
                    Exclusions List (One Domain Per Line)
                  </label>
                  <textarea
                    value={excludedDomains}
                    onChange={(e) => setExcludedDomains(e.target.value)}
                    rows={5}
                    className="w-full px-3.5 py-3 text-xs bg-[#030305]/80 border border-gray-900 rounded-xl text-gray-200 focus:outline-none focus:border-purple-500/60 font-mono resize-none"
                    placeholder="github.com&#10;youtube.com"
                  />
                  <span className="text-[8px] text-gray-600 block leading-tight mt-2 font-mono">
                    Subdomains are blocked automatically. Disables tracking pipeline immediately when visiting tabs on these domains.
                  </span>
                </div>
              </div>

              {/* Action Trigger Save Button */}
              <button
                onClick={handleSaveSettings}
                disabled={settingsSaved}
                className={`w-full flex items-center justify-center gap-2 py-3 text-xs font-bold rounded-xl border transition-all ${
                  settingsSaved
                    ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-purple-600 hover:bg-purple-700 border-purple-500 text-white shadow-lg shadow-purple-500/10 cursor-pointer active:scale-[0.99]'
                }`}
              >
                <Save className="w-4 h-4" />
                {settingsSaved ? 'Configurations Saved Successfully!' : 'Save System Settings'}
              </button>
            </div>
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
};
export default Dashboard;
