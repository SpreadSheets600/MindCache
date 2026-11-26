import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Brain, Copy, FileText, FolderOpen, Globe, Search, StickyNote, Upload } from "lucide-react";
import { backendClient } from "../services/BackendClient";
import { useConnectionStore } from "../store/connectionStore";
import type { MemoryHit, MemoryKind } from "../types";
import { getErrorMessage } from "../utils/error";

type Filter = "all" | "page" | "file" | "note";

const FILTERS: { id: Filter; label: string; kinds: MemoryKind[] }[] = [
  { id: "all", label: "Everything", kinds: [] },
  { id: "page", label: "Pages", kinds: ["page"] },
  { id: "file", label: "Files", kinds: ["file"] },
  { id: "note", label: "Notes & uploads", kinds: ["note", "upload"] },
];

const FAST_DELAY = 60;

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const parts = useMemo(() => {
    const words = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!words.length) return [text];
    return text.split(new RegExp(`(${words.map(escapePattern).join("|")})`, "gi"));
  }, [text, terms]);
  const lower = terms.map((term) => term.toLowerCase());
  return (
    <>
      {parts.map((part, index) =>
        lower.some((term) => part.toLowerCase() === term) ? (
          <mark key={index} className="rounded-sm bg-blue-500/20 px-0.5 text-blue-200">{part}</mark>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatWhen(value: string | null) {
  if (!value) return "";
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const KIND_LABEL: Record<MemoryKind, string> = { page: "Page", file: "File", note: "Note", upload: "Upload" };

function KindIcon({ kind }: { kind: MemoryKind }) {
  const Icon = kind === "page" ? Globe : kind === "file" ? FileText : kind === "note" ? StickyNote : Upload;
  return <Icon className="h-4 w-4" aria-hidden="true" />;
}

interface ResultProps {
  hit: MemoryHit;
  terms: string[];
  selected: boolean;
  onSelect: () => void;
  onOpenDocument: (id: number) => void;
}

function Result({ hit, terms, selected, onSelect, onOpenDocument }: ResultProps) {
  const [notice, setNotice] = useState("");
  const meta =
    hit.kind === "page"
      ? [hit.domain, formatWhen(hit.when)]
      : hit.kind === "file"
        ? [hit.folder, formatSize(hit.size), formatWhen(hit.when)]
        : [KIND_LABEL[hit.kind], formatWhen(hit.when)];

  const tell = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };
  const open = () => {
    if (hit.kind === "page") window.open(hit.location, "_blank", "noopener");
    else if (hit.open_url) window.open(backendClient.absoluteUrl(hit.open_url), "_blank", "noopener");
  };
  const act = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      tell(done);
    } catch (error) {
      tell(getErrorMessage(error));
    }
  };

  return (
    <li>
      <article
        data-selected={selected}
        onMouseEnter={onSelect}
        className={`group rounded-xl border p-4 transition-colors ${selected ? "border-primary/50 bg-primary/5" : "border-border bg-card/20 hover:bg-card/40"}`}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"><KindIcon kind={hit.kind} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-sm font-medium">
                <button
                  type="button"
                  data-result-open
                  onClick={() => (hit.kind === "page" ? onOpenDocument(hit.id) : open())}
                  className="truncate text-left hover:text-blue-300"
                  title={hit.title}
                >
                  <Highlight text={hit.title} terms={terms} />
                </button>
              </h3>
              <div className="flex shrink-0 gap-1.5 text-[10px] uppercase tracking-wide">
                <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{KIND_LABEL[hit.kind]}</span>
                {hit.reasons.includes("semantic") && <span className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-blue-300" title="Matches the meaning of your search">Meaning</span>}
                {hit.reasons.includes("keyword") && <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300" title="Contains your words">Words</span>}
              </div>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground" title={hit.location}>{meta.filter(Boolean).join("  ·  ")}</p>
            {hit.passages.length > 0 && (
              <ul className="mt-3 space-y-2 border-l border-border pl-3">
                {hit.passages.map((passage, index) => (
                  <li key={index} className="text-xs leading-relaxed text-muted-foreground"><Highlight text={passage.text} terms={terms} /></li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {hit.kind === "page" && (
                <>
                  <ActionButton onClick={() => onOpenDocument(hit.id)} icon={<Brain className="h-3.5 w-3.5" />}>Details</ActionButton>
                  <ActionButton onClick={open} icon={<ArrowUpRight className="h-3.5 w-3.5" />}>Visit page</ActionButton>
                </>
              )}
              {hit.kind === "file" && (
                <>
                  <ActionButton onClick={open} icon={<ArrowUpRight className="h-3.5 w-3.5" />}>Open here</ActionButton>
                  <ActionButton onClick={() => act(() => backendClient.openFile(hit.id), "Opened on your computer")} icon={<FileText className="h-3.5 w-3.5" />}>Open with app</ActionButton>
                  <ActionButton onClick={() => act(() => backendClient.openFile(hit.id, true), "Shown in your file manager")} icon={<FolderOpen className="h-3.5 w-3.5" />}>Show in folder</ActionButton>
                  <ActionButton onClick={() => act(() => navigator.clipboard.writeText(hit.location), "Path copied")} icon={<Copy className="h-3.5 w-3.5" />}>Copy path</ActionButton>
                </>
              )}
              {hit.kind === "upload" && hit.open_url && <ActionButton onClick={open} icon={<ArrowUpRight className="h-3.5 w-3.5" />}>Download</ActionButton>}
              {notice && <span role="status" className="text-blue-300">{notice}</span>}
            </div>
          </div>
        </div>
      </article>
    </li>
  );
}

function ActionButton({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
      {icon}
      {children}
    </button>
  );
}

interface Props {
  initialQuery?: string;
  onOpenDocument: (id: number) => void;
  onNavigate: (page: "models" | "folders") => void;
}

export function SearchPage({ initialQuery = "", onOpenDocument, onNavigate }: Props) {
  const { isOnline, components } = useConnectionStore();
  const [text, setText] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const kinds = FILTERS.find((item) => item.id === filter)!.kinds;

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), FAST_DELAY);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSelected(0), [query, filter]);
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement !== input.current && !(document.activeElement instanceof HTMLInputElement) && !(document.activeElement instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", focus);
    return () => window.removeEventListener("keydown", focus);
  }, []);

  const enabled = isOnline && query.length > 0;
  const fast = useQuery({
    queryKey: ["memory", "fast", query, filter],
    queryFn: async ({ signal }) => {
      const started = performance.now();
      const response = await backendClient.searchMemory(query, { mode: "fast", kinds, limit: 30, signal });
      return { ...response, elapsed: Math.round(performance.now() - started) };
    },
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  const full = useQuery({
    queryKey: ["memory", "full", query, filter],
    queryFn: async ({ signal }) => {
      const started = performance.now();
      const response = await backendClient.searchMemory(query, { mode: "full", kinds, limit: 30, signal });
      return { ...response, elapsed: Math.round(performance.now() - started) };
    },
    enabled,
    retry: false,
    staleTime: 60_000,
  });

  const shown = full.data ?? fast.data;
  const results = shown?.results ?? [];
  const terms = shown?.terms ?? [];
  const refining = enabled && !full.data && !full.isError;
  const error = fast.error ?? full.error;
  const embeddingReady = components?.embedding?.status === "ready";

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setText("");
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!results.length) return;
      event.preventDefault();
      const next = (selected + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      setSelected(next);
      list.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && results.length) {
      event.preventDefault();
      list.current?.children[selected]?.querySelector<HTMLButtonElement>("[data-result-open]")?.click();
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="rounded-xl border border-border bg-card/30 p-3 focus-within:border-primary/60">
        <div className="flex items-center gap-3 px-2">
          <Search className="h-5 w-5 shrink-0 text-blue-400" aria-hidden="true" />
          <label htmlFor="memory-query" className="sr-only">Search your pages, files and notes</label>
          <input
            id="memory-query"
            ref={input}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search pages, files and notes — try a topic, a filename, or a half-remembered idea"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted-foreground/60"
          />
          {text ? (
            <button type="button" onClick={() => { setText(""); input.current?.focus(); }} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
          ) : (
            <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">/</kbd>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 px-1 pt-2" role="group" aria-label="Filter results">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${filter === item.id ? "bg-primary/20 text-blue-200" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              {item.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground" role="status" aria-live="polite">
            {!enabled ? "" : refining ? `${results.length} so far · matching by meaning…` : `${results.length} result${results.length === 1 ? "" : "s"} · ${full.data?.elapsed ?? 0} ms`}
          </span>
        </div>
      </div>

      {isOnline && components && !embeddingReady && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          Searching by words only. <button type="button" className="underline" onClick={() => onNavigate("models")}>Download the embedding model</button> to also match by meaning.
        </p>
      )}
      {!isOnline && <p className="rounded-lg border border-border px-4 py-6 text-center text-sm text-muted-foreground">MindCache is not running. Start it and this page reconnects on its own.</p>}
      {error && <p role="alert" className="rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 text-xs text-red-300">{getErrorMessage(error)}</p>}

      {enabled && !error && results.length === 0 && !refining && (
        <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <p className="text-sm font-medium">Nothing matches “{query}”.</p>
          <p className="mt-2 text-xs text-muted-foreground">Try fewer or different words. To search files, <button type="button" className="text-blue-300 underline" onClick={() => onNavigate("folders")}>add a folder</button>.</p>
        </div>
      )}

      {results.length > 0 && (
        <ol ref={list} className="space-y-3" aria-label="Search results">
          {results.map((hit, index) => (
            <Result key={`${hit.kind}-${hit.id}`} hit={hit} terms={terms} selected={index === selected} onSelect={() => setSelected(index)} onOpenDocument={onOpenDocument} />
          ))}
        </ol>
      )}

      {!query && isOnline && (
        <div className="rounded-xl border border-border bg-card/20 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">One search for everything you keep.</p>
          <p className="mt-2 leading-6">Pages you browsed, files in your watched folders, notes and uploads are searched together. Words match instantly; meaning follows a moment later.</p>
          <p className="mt-3 text-xs"><kbd className="rounded border border-border px-1 font-mono">↑</kbd> <kbd className="rounded border border-border px-1 font-mono">↓</kbd> to move, <kbd className="rounded border border-border px-1 font-mono">Enter</kbd> to open, <kbd className="rounded border border-border px-1 font-mono">Esc</kbd> to clear.</p>
        </div>
      )}
    </div>
  );
}
