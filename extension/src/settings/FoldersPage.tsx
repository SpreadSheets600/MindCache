import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { backendClient } from "../services/BackendClient";
import { useConnectionStore } from "../store/connectionStore";
import { getErrorMessage } from "../utils/error";

function duration(seconds?: number | null) {
  if (!seconds) return "";
  if (seconds < 90) return `${Math.round(seconds)} seconds`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}

const STATUS_LABEL: Record<string, string> = { pending: "Waiting to scan", scanning: "Scanning", ready: "Up to date", unavailable: "Folder not found" };

export function FoldersPage() {
  const { isOnline } = useConnectionStore();
  const client = useQueryClient();
  const [path, setPath] = useState("");
  const [message, setMessage] = useState("");

  const status = useQuery({
    queryKey: ["index-status"],
    queryFn: () => backendClient.indexStatus(),
    enabled: isOnline,
    refetchInterval: (query) => ((query.state.data?.queued ?? 0) > 0 ? 1500 : 8000),
  });
  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: () => backendClient.listFolders(),
    enabled: isOnline,
    refetchInterval: 4000,
  });

  const refresh = () => {
    client.invalidateQueries({ queryKey: ["folders"] });
    client.invalidateQueries({ queryKey: ["index-status"] });
  };
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => { setMessage(""); refresh(); },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const value = path.trim();
    if (!value) return;
    run.mutate(async () => { await backendClient.addFolder(value); setPath(""); });
  };

  const counts = status.data?.files ?? {};
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const done = (counts.indexed ?? 0) + (counts.partial ?? 0);
  const percent = total ? Math.round((done / total) * 100) : 0;
  const working = (status.data?.queued ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <section className="rounded-xl border border-border bg-card/30 p-6">
        <h2 className="text-lg font-semibold">Search your files</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose folders and MindCache keeps their text, Markdown, code and PDF files searchable as they change. Files stay where they are.</p>
        <form onSubmit={add} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="folder-path" className="sr-only">Absolute folder path</label>
          <input
            id="folder-path"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/home/you/Documents"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
          />
          <button type="submit" disabled={!isOnline || run.isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            <FolderPlus className="h-4 w-4" /> Add folder
          </button>
        </form>
        {message && <p role="alert" className="mt-3 text-xs text-red-300">{message}</p>}
      </section>

      <section className="rounded-xl border border-border bg-card/20 p-6" aria-label="Indexing progress">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">{!isOnline ? "Not connected" : status.data?.paused ? "Indexing paused" : working ? "Indexing" : "Everything is searchable"}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {total === 0 ? "No files yet." : `${done.toLocaleString()} of ${total.toLocaleString()} files indexed${working ? ` · ${status.data!.queued} waiting` : ""}${status.data?.eta_seconds ? ` · about ${duration(status.data.eta_seconds)} left` : ""}`}
            </p>
          </div>
          {(working || status.data?.paused) && (
            <button type="button" onClick={() => run.mutate(() => backendClient.setIndexPaused(!status.data?.paused))} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
              {status.data?.paused ? <><Play className="h-3.5 w-3.5" /> Resume</> : <><Pause className="h-3.5 w-3.5" /> Pause</>}
            </button>
          )}
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Files indexed">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
        {(counts.error ?? 0) > 0 && <p className="mt-3 text-xs text-amber-300">{counts.error} file{counts.error === 1 ? "" : "s"} could not be read and are skipped.</p>}
      </section>

      <section aria-label="Watched folders" className="rounded-xl border border-border bg-card/20">
        <div className="border-b border-border px-6 py-4"><h3 className="text-sm font-semibold">Watched folders</h3></div>
        {folders.data?.length ? (
          <ul className="divide-y divide-border">
            {folders.data.map((folder) => (
              <li key={folder.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm" title={folder.path}>{folder.path}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{folder.enabled ? STATUS_LABEL[folder.status] ?? folder.status : "Off"}{folder.last_scan_at ? ` · scanned ${new Date(folder.last_scan_at.endsWith("Z") ? folder.last_scan_at : `${folder.last_scan_at}Z`).toLocaleString()}` : ""}</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" role="switch" checked={folder.enabled} onChange={(event) => run.mutate(() => backendClient.setFolderEnabled(folder.id, event.target.checked))} />
                  Watch
                </label>
                <button type="button" aria-label={`Rescan ${folder.path}`} title="Rescan" onClick={() => run.mutate(() => backendClient.rescanFolder(folder.id))} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><RefreshCw className="h-4 w-4" /></button>
                <button
                  type="button"
                  aria-label={`Stop indexing ${folder.path}`}
                  title="Remove from MindCache"
                  onClick={() => { if (window.confirm(`Stop searching ${folder.path}? Your files are not touched.`)) run.mutate(() => backendClient.forgetFolder(folder.id)); }}
                  className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-red-400"
                ><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-10 text-sm text-muted-foreground">{isOnline ? "No folders yet. Add one above to search your files." : "Start MindCache to manage folders."}</p>
        )}
      </section>
    </div>
  );
}
