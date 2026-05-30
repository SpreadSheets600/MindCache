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
  // Navigation States
  const { isOnline } = useConnectionStore();
  const { settings, updateSettings, loadSettings } = useSettingsStore();

  // 1. Search Store Hooks
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

  // 2. Documents Memory Tab States
  const [docs, setDocs] = useState<SearchResult[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<SearchResult | null>(null);
  const [docFilter, setDocFilter] = useState('');
  const [copiedDocId, setCopiedDocId] = useState<number | null>(null);

  // 3. AI Chat Box States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 4. Configuration Form States
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [autoTracking, setAutoTracking] = useState(settings.autoTracking);
  const [privacyMode, setPrivacyMode] = useState(settings.privacyMode);
  const [excludedDomains, setExcludedDomains] = useState(settings.excludedDomains.join('\n'));
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Initialize
  useEffect(() => {
    loadSettings();
    loadRecentSearches();
    if (isOnline) {
      loadDocuments();
    }
  }, [loadSettings, loadRecentSearches, isOnline]);

  // Sync Settings Configurations
  useEffect(() => {
    setBackendUrl(settings.backendUrl);
    setAutoTracking(settings.autoTracking);
    setPrivacyMode(settings.privacyMode);
    setExcludedDomains(settings.excludedDomains.join('\n'));
  }, [settings]);

  // Scroll Chat To Bottom On New Message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Fetch SQLite Documents
  const loadDocuments = async () => {
    setDocsLoading(true);
    try {
      // Fetch 100 Documents
      const response = await backendClient.request<SearchResult[]>('/documents?limit=100');
      setDocs(response);
      if (response.length > 0 && !selectedDoc) {
        setSelectedDoc(response[0]);
      }
    } catch (err) {
      console.warn('Failed To Load Memory Documents:', err);
    } finally {
      setDocsLoading(false);
    }
  };

  // Delete Document From Both SQLite & FAISS
  const handleDeleteDocument = async (id: number) => {
    try {
      await backendClient.request(`/documents/${id}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
      }
    } catch (err) {
      console.warn('Failed To Delete Document:', err);
    }
  };

  // Copy URL Helper
  const handleCopyUrl = async (url: string, id: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedDocId(id);
      setTimeout(() => setCopiedDocId(null), 2000);
    } catch (err) {
      console.debug('Failed to copy', err);
    }
  };

  // Handle RAG Chat Messages
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = chatInput.trim();
    if (!prompt || chatLoading) return;

    setChatMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    setChatInput('');
    setChatLoading(true);

    try {
      // Query FAISS Index And Local Ollama Synthesis
      const response = await backendClient.search(prompt, 3, true);
      setChatMessages((prev) => [
        ...prev, 
        { 
          role: 'assistant', 
          content: response.ai_summary || "Memory Engine could not formulate a synthesis.",
          sources: response.results 
        }
      ]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error querying local Ollama engine: ${err.message || 'Server Offline'}` }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    const parsedDomains = excludedDomains
      .split('\n')
      .map((d) => {
        let entry = d.trim().toLowerCase();
        
        // Remove Protocol If Present
        if (entry.includes('://')) {
          try {
            const url = new URL(entry);
            entry = url.hostname;
          } catch {
            entry = entry.split('://')[1] || entry;
          }
        }
        
        // Remove Leading 'Www.' If Present
        entry = entry.replace(/^www\./i, '');
        
        // Strip Ports, Paths, Query Parameters
        entry = entry.split('/')[0].split(':')[0].split('?')[0];
        
        return entry.trim();
      })
      .filter((d) => {
        if (d.length === 0) return false;
        // Basic Domain Syntax Check: Should Contain Only Valid Domain Characters
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

  // Filters Documents List On Client Side
  const filteredDocs = docs.filter((d) => {
    const filter = docFilter.toLowerCase();
    return (
      (d.title?.toLowerCase() || '').includes(filter) ||
      d.url.toLowerCase().includes(filter) ||
      d.domain.toLowerCase().includes(filter)
    );
  });

  return (
    <div className="w-screen h-screen flex flex-col bg-[#07080c] text-gray-200 select-none overflow-hidden font-sans">
      {/* Diagnostics Status Bar */}
      <BackendStatus />

      {/* Primary Radix Tab layout */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-1 overflow-hidden">
        {/* Sidebar Nav */}
        <Tabs.List className="w-60 bg-[#090a0f] border-r border-gray-900 p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            {/* Header branding */}
            <div className="flex items-center gap-2 px-1">
              <img src="/logo.png" alt="MindCache Logo" className="w-8 h-8 rounded-lg object-cover border border-purple-500/30" />
              <div>
                <h1 className="text-xs font-bold uppercase tracking-wider text-gray-100 m-0">MindCache</h1>
                <span className="text-[9px] text-gray-500 font-semibold uppercase tracking-wider">Dashboard v1.0</span>
              </div>
            </div>

            {/* Navigation options */}
            <nav className="space-y-1.5 flex flex-col">
              <Tabs.Trigger 
                value="search" 
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-900/60 data-[state=active]:bg-purple-600 data-[state=active]:text-white transition-all cursor-pointer text-left w-full border border-transparent data-[state=active]:border-purple-500/35"
              >
                <Search className="w-4 h-4 shrink-0" />
                Spotlight Search
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="history" 
                onClick={loadDocuments}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-900/60 data-[state=active]:bg-purple-600 data-[state=active]:text-white transition-all cursor-pointer text-left w-full border border-transparent data-[state=active]:border-purple-500/35"
              >
                <Library className="w-4 h-4 shrink-0" />
                Document Memory
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="chat" 
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-900/60 data-[state=active]:bg-purple-600 data-[state=active]:text-white transition-all cursor-pointer text-left w-full border border-transparent data-[state=active]:border-purple-500/35"
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                Interactive Chat
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="graph" 
                onClick={loadDocuments}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-900/60 data-[state=active]:bg-purple-600 data-[state=active]:text-white transition-all cursor-pointer text-left w-full border border-transparent data-[state=active]:border-purple-500/35"
              >
                <Network className="w-4 h-4 shrink-0" />
                Knowledge Graph
              </Tabs.Trigger>

              <Tabs.Trigger 
                value="settings" 
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-900/60 data-[state=active]:bg-purple-600 data-[state=active]:text-white transition-all cursor-pointer text-left w-full border border-transparent data-[state=active]:border-purple-500/35"
              >
                <Settings2 className="w-4 h-4 shrink-0" />
                Configurations
              </Tabs.Trigger>
            </nav>
          </div>

          {/* Sidebar Footer */}
          <div className="px-2 py-3 bg-[#0d0e14] border border-gray-900 rounded-lg text-center select-none">
            <span className="text-[9px] text-gray-500 block leading-normal">Spotlight Hotkey</span>
            <kbd className="inline-block px-1.5 py-0.5 mt-1 bg-gray-950 border border-gray-800 rounded text-[9px] font-mono text-purple-400">
              Ctrl+Shift+K
            </kbd>
          </div>
        </Tabs.List>

        {/* Tab Panels content */}
        <div className="flex-1 flex overflow-hidden bg-[#07080c]">
          
          {/* TAB 1: SPOTLIGHT SEARCH */}
          <Tabs.Content value="search" className="flex-1 flex flex-col overflow-hidden w-full">
            {/* Search Top Input */}
            <div className="flex flex-col gap-3.5 p-4 border-b border-gray-900 bg-[#090a0f]">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-500" />
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
                    className="w-full pl-10 pr-4 py-2 text-xs bg-[#10111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-colors"
                  />
                </div>
                <button
                  onClick={() => {
                    const nextGen = !generateSummary;
                    setGenerateSummary(nextGen);
                    if (query.trim() && isOnline) {
                      executeSearch(6, nextGen);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    generateSummary
                      ? 'bg-purple-950/20 border-purple-500/40 text-purple-300'
                      : 'bg-[#10111a] border-gray-800 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Summary
                </button>
              </div>

              {/* Time Filtering Sub-Row */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-gray-500 select-none">From</span>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      if (query.trim()) {
                        executeSearch(6, generateSummary);
                      }
                    }}
                    className="px-3 py-1.5 bg-[#10111a] border border-gray-800 rounded-lg text-gray-300 focus:outline-none focus:border-purple-500/60 transition-colors text-[10px] font-semibold text-center outline-none selection:bg-purple-500/30"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-gray-500 select-none">To</span>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      if (query.trim()) {
                        executeSearch(6, generateSummary);
                      }
                    }}
                    className="px-3 py-1.5 bg-[#10111a] border border-gray-800 rounded-lg text-gray-300 focus:outline-none focus:border-purple-500/60 transition-colors text-[10px] font-semibold text-center outline-none selection:bg-purple-500/30"
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
                    className="px-2.5 py-1 text-[9px] text-purple-400 hover:text-purple-300 font-bold uppercase tracking-widest cursor-pointer transition-all hover:bg-purple-500/10 rounded-lg border border-transparent hover:border-purple-500/20"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            </div>

            {/* Ingestion results list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {isLoading && results.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="w-7 h-7 text-purple-500 animate-spin" />
                  <span className="text-[10px] text-gray-500 mt-2 font-semibold uppercase tracking-wider">Semantic matching...</span>
                </div>
              )}

              {results.length > 0 && (
                <div className="max-w-4xl mx-auto space-y-3">
                  {/* RAG summary */}
                  {aiSummary && (
                    <div className="p-4 bg-purple-950/15 border border-purple-500/25 rounded-lg shadow-lg shadow-purple-500/5 animate-in fade-in duration-200">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                          Collective Synthesis Answer
                        </span>
                      </div>
                      <p className="text-xs text-purple-200/90 leading-relaxed font-sans select-text">
                        {aiSummary}
                      </p>
                    </div>
                  )}

                  {/* Results cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {results.map((item) => (
                      <SearchResultCard key={item.id} result={item} />
                    ))}
                  </div>
                </div>
              )}

              {!query.trim() && (
                <div className="flex flex-col items-center justify-center h-80 max-w-sm mx-auto text-center py-12">
                  <Search className="w-10 h-10 text-purple-500/30 mb-3" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    MindCache Vector Spotlight
                  </h3>
                  <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
                    Ask your browser memory questions. FAISS similarity searches will resolve closest cosine matches.
                  </p>
                  <div className="w-full mt-6">
                    <RecentSearches generateSummary={generateSummary} />
                  </div>
                </div>
              )}

              {query.trim() && results.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Info className="w-8 h-8 text-gray-600 mb-2" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">No semantic hits found</h3>
                  <p className="text-[10px] text-gray-600 mt-1">Try typing details of pages you previously read.</p>
                </div>
              )}
            </div>
          </Tabs.Content>

          {/* TAB 2: DOCUMENT MEMORY EXPLORER */}
          <Tabs.Content value="history" className="flex-1 flex overflow-hidden w-full">
            {/* Sidebar list of documents */}
            <div className="w-72 border-r border-gray-900 bg-[#090a0f]/60 flex flex-col shrink-0">
              <div className="p-3 border-b border-gray-900">
                <input
                  type="text"
                  placeholder="Filter by title/domain..."
                  value={docFilter}
                  onChange={(e) => setDocFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-[#10111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
                {docsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="text-center py-10 text-[10px] text-gray-600">No documents stored.</div>
                ) : (
                  filteredDocs.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`p-2.5 rounded-lg text-left cursor-pointer transition-all border ${
                        selectedDoc?.id === doc.id
                          ? 'bg-purple-950/20 border-purple-500/30 text-purple-300'
                          : 'bg-transparent border-transparent hover:bg-gray-900/50 hover:text-gray-300'
                      }`}
                    >
                      <h4 className="text-xs font-semibold truncate">{doc.title || doc.url}</h4>
                      <span className="text-[9px] text-gray-500 block font-mono mt-0.5 truncate">{doc.domain}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Document Details Main Area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#07080c] select-text">
              {selectedDoc ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Detail Header */}
                  <div className="p-4 border-b border-gray-900 bg-[#090a0f]/80 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-gray-100 leading-tight select-all">
                        {selectedDoc.title || 'Untitled Webpage'}
                      </h2>
                      <a 
                        href={selectedDoc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-purple-400 hover:underline flex items-center gap-1 mt-1 font-mono break-all"
                      >
                        {selectedDoc.url}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 select-none">
                      <button
                        onClick={() => handleCopyUrl(selectedDoc.url, selectedDoc.id)}
                        className="p-2 bg-[#10111a] border border-gray-800 text-gray-400 hover:text-purple-300 hover:border-gray-700 rounded-lg transition-colors cursor-pointer"
                        title="Copy Link"
                      >
                        {copiedDocId === selectedDoc.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(selectedDoc.id)}
                        className="p-2 bg-rose-950/20 border border-rose-900/60 hover:bg-rose-900/40 text-rose-400 rounded-lg transition-colors cursor-pointer"
                        title="Delete Document from Memory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Details Scrollable Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                    {/* Ollama Document Summary callout */}
                    {selectedDoc.summary && (
                      <div className="p-3.5 bg-purple-950/15 border border-purple-500/25 rounded-lg select-text">
                        <h4 className="text-[9px] font-bold uppercase tracking-wider text-purple-300 mb-1 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          AI Webpage Summary
                        </h4>
                        <p className="text-xs text-purple-200/90 leading-relaxed">
                          {selectedDoc.summary}
                        </p>
                      </div>
                    )}

                    {/* Keywords row */}
                    {selectedDoc.keywords.length > 0 && (
                      <div className="space-y-1.5 select-none">
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">Extracted Keywords</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedDoc.keywords.map((kw, idx) => (
                            <span 
                              key={idx}
                              className="px-2 py-0.5 text-[9px] bg-gray-900 border border-gray-800 text-gray-400 rounded-md font-semibold"
                            >
                              {kw.keyword} ({Math.round(kw.score * 100)}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Full Extracted Page Text */}
                    <div className="space-y-2 select-text">
                      <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block select-none">Extracted Webpage Content</span>
                      <div className="bg-[#0b0c14] border border-gray-900/80 rounded-lg p-4 font-sans text-xs text-gray-300 leading-relaxed max-w-4xl whitespace-pre-wrap">
                        {selectedDoc.extracted_content}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <Library className="w-10 h-10 text-gray-700 mb-2" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">No document selected</h3>
                  <p className="text-[10px] text-gray-600">Select any webpage from the list to explore metadata and text content.</p>
                </div>
              )}
            </div>
          </Tabs.Content>

          {/* TAB 3: AI COGNITIVE CHAT ROOM */}
          <Tabs.Content value="chat" className="flex-1 flex flex-col overflow-hidden w-full">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-900 bg-[#090a0f]/80">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-purple-950/20 border border-purple-500/30 rounded-lg text-purple-400 shrink-0">
                  <Sparkles className="w-4 h-4 shrink-0" />
                </div>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200">Interactive Cognitive Chat</h2>
                  <span className="text-[8px] text-gray-500 block leading-tight font-mono">Conversation with your browser history</span>
                </div>
              </div>
            </div>

            {/* Chat message Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-[#07080c] select-text">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-80 max-w-md mx-auto text-center">
                  <MessageSquare className="w-10 h-10 text-purple-500/30 mb-3" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Ask Your Browser Memory</h3>
                  <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
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
                  {/* Sender title */}
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1 select-none">
                    {msg.role === 'user' ? 'You' : 'MindCache Memory'}
                  </span>

                  {/* Content bubbles */}
                  <div className={`p-3 rounded-lg text-xs leading-relaxed max-w-full ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white font-medium shadow-md shadow-purple-500/5'
                      : 'bg-[#10111a] border border-gray-900 text-gray-200'
                  }`}>
                    {msg.content}

                    {/* Chat RAG Sources */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 border-t border-gray-800/80 pt-2.5 space-y-1.5 select-none">
                        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider block">Referenced Webpages</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.sources.map((src, sIdx) => (
                            <a
                              key={sIdx}
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 bg-[#090a0f] hover:bg-purple-950/20 border border-gray-850 hover:border-purple-500/20 rounded flex flex-col text-left group transition-all"
                            >
                              <span className="text-[9px] font-semibold text-gray-300 group-hover:text-purple-300 truncate">
                                [{sIdx + 1}] {src.title || 'Untitled Webpage'}
                              </span>
                              <span className="text-[8px] text-gray-600 font-mono truncate">{src.domain}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Chat loader */}
              {chatLoading && (
                <div className="flex flex-col items-start max-w-3xl mr-auto select-none">
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">MindCache Memory</span>
                  <div className="p-3 bg-[#10111a] border border-gray-900 rounded-lg flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                    Searching FAISS and synthesizing collective summary via Ollama...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input form */}
            <form onSubmit={handleSendChatMessage} className="p-3 border-t border-gray-900 bg-[#090a0f]">
              <div className="flex items-center gap-2 max-w-4xl mx-auto">
                <input
                  type="text"
                  placeholder="Ask your memory: 'What did I read about karpathy coding guidlines?'"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs bg-[#10111a] border border-gray-850 rounded-lg text-gray-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="p-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-[#10111a] disabled:border-gray-850 disabled:text-gray-600 text-white border border-purple-500 disabled:border-transparent rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </Tabs.Content>

          {/* TAB 5: KNOWLEDGE GRAPH */}
          <Tabs.Content value="graph" className="flex-1 flex overflow-hidden w-full">
            <KnowledgeGraph 
              docs={docs} 
              loadDocuments={loadDocuments} 
              docsLoading={docsLoading} 
              onOpenInHistory={(doc) => {
                setActiveTab('history');
                setSelectedDoc(doc);
              }} 
            />
          </Tabs.Content>

          {/* TAB 4: CONFIGURATION SETTINGS */}
          <Tabs.Content value="settings" className="flex-1 flex overflow-hidden w-full select-none">
            <div className="max-w-2xl mx-auto p-6 space-y-6 w-full">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-100">System Configurations</h2>
                <span className="text-[10px] text-gray-500">Manage database connections, ingestion rules, and privacy exclusions list.</span>
              </div>

              {/* Form Areas */}
              <div className="space-y-4">
                {/* Connection url */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    <Globe className="w-3.5 h-3.5" />
                    Local Server Endpoint
                  </label>
                  <input
                    type="text"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#10111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                {/* Tracking checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="flex items-center justify-between gap-4 p-3 bg-[#10111a] border border-gray-800/80 rounded-lg">
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">Auto Ingestion</span>
                      <span className="text-[8px] text-gray-500 block leading-tight mt-0.5">Parse webpages visited in tabs automatically</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoTracking}
                        onChange={(e) => setAutoTracking(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-7 h-4 bg-gray-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600 peer-checked:after:bg-white"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-4 p-3 bg-[#10111a] border border-gray-800/80 rounded-lg">
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block flex items-center gap-1">
                        <EyeOff className="w-3.5 h-3.5 text-purple-400" />
                        Privacy Safeguard
                      </span>
                      <span className="text-[8px] text-gray-500 block leading-tight mt-0.5">Filter queries and tracking on private pages</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
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

                {/* Exclusions domains */}
                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    <ShieldAlert className="w-3.5 h-3.5 text-gray-500" />
                    Exclusions List (One Domain Per Line)
                  </label>
                  <textarea
                    value={excludedDomains}
                    onChange={(e) => setExcludedDomains(e.target.value)}
                    rows={5}
                    className="w-full px-3 py-2.5 text-xs bg-[#10111a] border border-gray-800 rounded-lg text-gray-200 focus:outline-none focus:border-purple-500 font-mono resize-none"
                    placeholder="github.com&#10;youtube.com"
                  />
                  <span className="text-[8px] text-gray-600 block leading-tight">
                    Subdomains are blocked automatically. Disables tracking pipeline immediately when visiting tabs on these domains.
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <button
                onClick={handleSaveSettings}
                disabled={settingsSaved}
                className={`w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-lg border transition-all ${
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
