# MindCache System Memory: Architecture and Implementation Plan

Status: in progress. Date: 2026-11-25. Rules for whoever implements this are in `AGENT.md`.

## Implementation status

| Phase | State |
| --- | --- |
| 0 Housekeeping | Done except Alembic migrations, which were never used (tables are created at startup) |
| 1 EmbeddingGemma 2 | Done: spike, embedder, signature and re-embedding, relevance floor (0.70, calibrated on the real model). Benchmark harness is in `backend/benchmarks` (recall@1 0.97, recall@3 1.00 at the 0.70 floor). Comparing chunk sizes needs a corpus of long documents |
| 2 Chunk storage and search | Done, with the indexer running in the API process. Splitting out a separate worker process is deferred until measurements show search latency suffering during indexing. Saved web pages are chunked, embedded and searched together with files through `/memory/search` (existing pages are backfilled at startup). Notes and uploads are chunked and searched the same way |
| 3 Folder indexing | Done for text and PDF files |
| 4 Live watching | Done. Renames are detected by size, modification time and extension, so a moved file keeps its index without re-embedding |
| 5 and 6 Flutter app | Done: Search, Folders, Graph, Index and Settings screens, Ctrl+K, tray with close-to-tray. The system-wide hotkey is registered but only works on X11, not Wayland |
| 7 Resource behavior | Pause and resume, newest-first order, rate and ETA done. Worker niceness, free-memory batch sizing and the CPU speed plan are open |
| 8 Images, 9 Packaging | Not started |

## 1. Goal

MindCache becomes the search layer for the whole computer, not only the browser.

| Surface | Role | State |
| --- | --- | --- |
| Browser extension | Captures pages after a dwell threshold | Done, unchanged |
| Backend (FastAPI) | Extraction, embedding, indexing, search, file watching | Extended by this plan |
| Flutter desktop app | Native app with the dashboard UI. Picks watched folders, searches everything, shows index status | New |
| Web dashboard (`frontend/`) | Existing static dashboard | Kept, reduced in scope (section 12) |

A user picks folders. MindCache embeds every supported file in them, keeps the index current as files are added, changed, moved or deleted, and returns results across files and browsing history from one search box, fast enough to feel instant.

Non-goals: cloud sync, multi-user, mobile apps, whole-disk indexing without folder selection, replacing the OS file manager.

## 2. Decisions already made

1. **One embedding model: `google/embeddinggemma-2`.** No user choice, no fallback, no remote embeddings.
2. **Generation is optional and separate.** Local by default. A user may enter an API key for a remote provider; that is the only path by which content leaves the machine.
3. **Extension unchanged** apart from pointing at the same backend.
4. **Backend does the work, Flutter is a client.** The watcher, queue and indexer live in the Python backend so the extension, dashboard and Flutter app share one index and one source of truth.
5. **SQLite is authoritative.** FAISS and the keyword index are derived and rebuildable.

## 3. EmbeddingGemma 2: what the docs say and what it means for us

Sources read on 2026-11-25: the [Google Developers blog post](https://developers.googleblog.com/google-ai-edge-with-embeddinggemma-2/), the [Google announcement](https://blog.google/innovation-and-ai/technology/developers-tools/embeddinggemma-2/), the [Hugging Face model card](https://huggingface.co/google/embeddinggemma-2), the [LiteRT bundles](https://huggingface.co/litert-community/embeddinggemma-2-740m-litert-lm) and the [GGUF build](https://huggingface.co/ggml-org/embeddinggemma-2-GGUF). Released 2026-10-06 under Apache 2.0.

| Property | EmbeddingGemma 2 | Consequence |
| --- | --- | --- |
| Model id | `google/embeddinggemma-2` | Single constant in config |
| Native dimension | 768 | Replaces the current 1024 (Qwen3) |
| Matryoshka sizes | 768, 512, 256, 128 | Storage knob. Quality on MTEB multilingual v2: 61.36 / 61.17 / 60.41 / 57.89 |
| Context | 8,192 tokens, shared across modalities | Chunks can be much larger than before. We still chunk (section 6) |
| Size | 740M full multimodal, about 570M text plus audio, about 440M text plus vision, about 270M text only | Load text-only by default; load vision only when image indexing is on |
| Precision | bfloat16 or float32. **Never float16** | Pin dtype explicitly |
| Query prompt | `SearchQuery` prompt name, `task: search result \| query: {query}` | Used for every search |
| Document prompt | `title: {title} \| text: {content}`, or `title: none \| text: {content}` | Format manually so the file name acts as the title |
| Images, audio, video | No prefix; text can interleave `<\|image\|>` placeholders | Enables image files in a later phase |
| Libraries | sentence-transformers, transformers, llama.cpp/GGUF (Q8_0 310 MB, BF16 558 MB), LiteRT-LM, MLX, vLLM, Ollama | sentence-transformers first; GGUF as the CPU fallback if needed |

Selective loading per the model card: `config_kwargs={"vision_config": None, "audio_config": None}` gives the 270M text-only model. The card warns this differs between libraries.

### Spike results (2026-11-25, full numbers in `docs/AI-Pipeline.md`)

- The Hugging Face model is not gated. No token flow is needed.
- Version floor: `transformers>=5.24` and `sentence-transformers>=6.3`. Text-only loading still needs `pillow` and `torchvision`.
- The text-only load works with the `vision_config` and `audio_config` overrides: 271M parameters, 768 dimensions.
- `max_seq_length` is unbounded by default and must be set explicitly.
- 128-dimension truncation compresses similarity differences; keep 768 unless the Phase 1 benchmark supports 512.
- Speed is the main risk. GPU bf16 reaches about 24 chunks/s, but CPU fp32 only about 1.3 chunks/s (about 2 hours for 10,000 chunks) and CPU bf16 about 0.4. Use bf16 on GPU and fp32 on CPU.
- Still unverified: the multimodal `encode({...})` form (Phase 8), and the faster CPU options below.

### CPU speed

Measured and decided on 2026-11-25 (table in `docs/AI-Pipeline.md`): int8 quantization and the Q8 GGUF through llama.cpp give no meaningful gain on this model, and the GGUF has the wrong output size. The adopted fix is thread count equal to physical cores (about 26 percent faster). Beyond that, CPU indexing is about 2 chunks/s, so the product relies on newest-first ordering, visible time estimates, pause, and instant keyword search.

### Embedding rules

- One `Embedder` module owns the model. Everything else calls `embed_query(text)` and `embed_documents(items)`.
- L2-normalize every vector (re-normalize after truncation). Cosine similarity becomes inner product in FAISS.
- Each vector row stores `model_id`, `dim`, `truncate_dim`, `prompt_version`. A change in any of these marks the index stale and a full rebuild runs. There is no mixed index.
- Batch size adapts to available memory. Long texts are chunked, not truncated.
- Model files live in `{data_dir}/models/`. Download happens once, on explicit user consent, with progress. After that, `local_files_only=True`.

## 4. Current state of the repository

Facts from reading the tree on 2026-11-25:

- Backend: FastAPI + async SQLAlchemy + SQLite (`backend/app`). Routers: `visit`, `health`, `search`, `documents`, `privacy`, `ai`, `items`, `pairing`.
- Embedding: `services/embedding_service.py` uses sentence-transformers with a user-selectable model and provider (`core/ai_config.py`, `services/ai_providers.py`, `data/models.json`). Default is `Qwen/Qwen3-Embedding-0.6B`, dimension 1024.
- Indexes: `vector_service.py` (FAISS, `data/faiss_index.bin`) and `bm25_service.py` (`rank-bm25`, pickled to `data/bm25_index.pkl`). Both are document-level, not chunk-level.
- Data model: `Document` (web page, unique URL) and `SavedItem` (note or upload, original bytes stored in SQLite as `LargeBinary`).
- Security already present: `core/local_access.py`, `core/pairing.py`, `api/pairing.py`.
- Frontend: static HTML/CSS/JS in `frontend/` with design tokens in `tokens.css`.
- Extension: React/Vite/TypeScript in `extension/`.
- Flutter and Dart are **not installed** on this machine. Phase 0 installs them.
- The working tree has many uncommitted changes, and `backend/data/*.db`, `*.bin`, `*.pkl` show as modified, so user data is tracked by git.

### What must change

| Problem | Why it matters here | Fix |
| --- | --- | --- |
| Embedding model is user-selectable | Violates decision 1 | Delete model/provider choice for embeddings |
| Index is per document | Files are long. Search needs passages, not whole files | Chunk-level index |
| BM25 is a pickle rebuilt in memory | Cannot update incrementally for thousands of files, loses data on crash | SQLite FTS5 |
| FAISS file written whole | Deletions and updates need per-chunk removal | `IndexIDMap2` over chunk ids, atomic save |
| Originals stored as BLOBs | Watched files already live on disk | Folder files are referenced by path, never copied |
| No watcher, no job queue | Core of the new feature | Phase 3 and 4 |
| Data files tracked by git | Leaks personal data into history | Phase 0 |
| Comments and docstrings everywhere | Violates `AGENT.md` | Phase 0 sweep |

## 5. Architecture

```
 Browser extension ──┐
                     │ HTTP, paired token, 127.0.0.1
 Flutter app ────────┼──────────────► FastAPI
 Web dashboard ──────┘                  │
                                        ├─ api: search, folders, files, jobs, status, settings, ai
                                        ├─ Watcher (watchdog + reconcile scan)
                                        ├─ Job queue (SQLite table) ──► Worker process
                                        │                                 ├─ extract (text, pdf, docx, html, code)
                                        │                                 ├─ chunk
                                        │                                 └─ embed (EmbeddingGemma 2)
                                        └─ Search (FTS5 + FAISS + fusion)
                                        
 Storage: mindcache.db (SQLite WAL, FTS5), vectors.faiss, models/
```

### Process model

- **API process**: FastAPI, async, serves requests and holds the FAISS index for reads.
- **Worker process**: a separate OS process that owns the embedding model, runs extraction and embedding, and writes vectors. Reasons: model inference is CPU/GPU bound and must never stall search; the worker can be paused, niced or killed without affecting search; a worker crash cannot corrupt the API.
- The worker pulls jobs from the SQLite `jobs` table. The API and worker coordinate only through SQLite. No message broker.
- The API reloads the FAISS index when the worker publishes a new version (a generation number in SQLite, checked on search). Writes go to a new file and are swapped in with `os.replace`.
- Query embedding needs the model too. The API process loads the model lazily for queries only (text-only 270M, small). The worker loads its own copy. Memory cost is accepted; the spike measures it. If it is too high, the worker serves query embeddings over a local socket instead.

### Why not one process

An embedding batch can occupy all cores for seconds. In one process, typing in the search box would stall during a bulk index. Two processes keep search latency independent of indexing load.

## 6. Data model

New tables (SQLAlchemy models, Alembic migration). Existing `documents` and `saved_items` stay and are brought under the same chunk model in Phase 2.

```
watched_folders
  id, path (unique, resolved), enabled, recursive, include_globs, exclude_globs,
  added_at, last_scan_at, status

files
  id, folder_id, path (unique), rel_path, name, ext, mime, size, mtime_ns, content_hash,
  status (pending|indexed|skipped|failed|missing), skip_reason, error,
  chunk_count, indexed_at, embed_signature

chunks
  id (also the FAISS id), source_kind (file|document|item), source_id,
  ordinal, text, char_start, char_end, token_count, page

chunks_fts   FTS5 virtual table over chunks.text and the source title, external-content

jobs
  id, kind (index_file|delete_file|rescan_folder|rebuild_index), target_id,
  priority, state (queued|running|done|failed), attempts, last_error, created_at, started_at

index_meta
  key, value  (model_id, dim, truncate_dim, prompt_version, index_generation)
```

### Rules

- A file's identity is its resolved path. `content_hash` (xxhash or blake2b of the bytes) decides whether a changed mtime actually changed content. Same hash means no re-embedding.
- Rename or move: when a new path appears with a hash that matches a recently missing file in the same folder set, update the path and keep the chunks. No re-embedding.
- Chunking: split on structure first (headings, paragraphs, pages, code blocks), then pack to a target near 400 tokens with 15 percent overlap, hard cap 1,000. Chunk text is stored so search can show passages without rereading files. Chunking is deterministic so unchanged files produce identical chunks.
- Each chunk is embedded as `title: {file name or document title} | text: {chunk}`.
- The 8,192 token window is not used as the chunk size. Smaller chunks give sharper passage retrieval and cheaper re-indexing. The first benchmark (Phase 1) compares 400 against 800 tokens and the winner becomes the constant.
- Deleted or excluded file: remove its chunk rows, FTS rows and FAISS ids in one job.
- `embed_signature` on a file equals the hash of `(model_id, truncate_dim, prompt_version, chunker_version)`. A mismatch re-queues that file.

### Supported file types

| Tier | Types | Extraction |
| --- | --- | --- |
| 1 (Phase 3) | `.txt .md .rst .org .csv .json .yaml .toml .log` and source code | read as UTF-8 with charset fallback |
| 1 | `.pdf` | `pypdf` (already a dependency), per-page chunks |
| 2 (Phase 6) | `.docx .odt .pptx .xlsx`, `.html`, `.epub` | `python-docx`, `odfpy`, `python-pptx`, `openpyxl`, existing `trafilatura`, `ebooklib` |
| 3 (Phase 8) | images (embedded directly by the multimodal model, optional OCR through the existing `services/ocr.py`) | vision-enabled model load |
| Never | executables, archives, databases, `.env*`, key and certificate files, anything over the size cap (default 25 MB, configurable) | skipped, reason recorded |

Audio and video are out of scope until image support has proven the multimodal path.

## 7. Watching and indexing pipeline

### Discovery

1. **Initial scan** when a folder is added: walk with `os.scandir`, apply include/exclude rules, insert `files` rows as `pending` with size and mtime, enqueue `index_file` jobs. Directories are skipped by name before descent.
2. **Live watching**: `watchdog` (inotify on Linux, FSEvents on macOS, ReadDirectoryChangesW on Windows). Events feed a debouncer (default 2 s per path) so a save-in-progress or a build output burst becomes one job.
3. **Reconcile scan**: on startup and every 6 hours, compare disk against `files` using size and mtime only. This catches events missed while the app was closed, and watcher limits (the Linux inotify watch limit is a known failure; reconcile covers it and the app reports it).
4. A folder that cannot be watched falls back to reconcile-only polling and shows a status badge. The app never fails silently.

### Job execution

- Priorities: user-triggered reindex > changed file > initial scan > rebuild.
- Concurrency: extraction can use a small thread pool; embedding is one batch stream. Worker CPU priority is lowered (`nice` or equivalent). A "pause indexing" switch and "only index on AC power" setting ship in Phase 7.
- Retries: 3 attempts with backoff, then `failed` with the error text visible in the UI and a retry button.
- Crash safety: a job is `running` with a `started_at`. On worker start, stale running jobs reset to `queued`. All steps are idempotent: re-running a job for the same file produces the same state.
- Vector writes: the worker appends vectors in memory for a batch, saves FAISS to a temp file, `os.replace`s it, then bumps `index_generation`. SQLite and FAISS can briefly disagree after a crash, so startup runs a cheap consistency check (every chunk id in SQLite exists in FAISS and the reverse) and repairs by re-queueing the affected files.

### Exclusions

Default exclusions are applied before any file is opened: `.git`, `node_modules`, `.venv`, `__pycache__`, `target`, `build`, `dist`, `.cache`, browser profile directories, `*.env`, `.env*`, `*.pem`, `*.key`, `id_rsa*`, `*.kdbx`, `*.sqlite`, `*.db`, package-manager caches. The user can add globs per folder. A folder add dialog shows the exclusions that will apply.

## 8. Search

### Pipeline

1. Embed the query (`SearchQuery` prompt) and run a FAISS inner-product search for the top 100 chunks.
2. Run an FTS5 query (BM25 ranking, phrase and prefix support) for the top 100 chunks.
3. Fuse with Reciprocal Rank Fusion (k=60). RRF needs no score calibration between the two systems.
4. Group by source (file, page, note), keep the best 3 chunks per source, rank sources by their best fused score plus a small bounded boost for recency and, for web pages, the existing click and dwell signals.
5. Return: source kind, title, path or URL, best passage with highlighted match offsets, reason codes (`keyword`, `semantic`, `title`), modified time, and the source type icon.

### Behavior and targets

- Filters: source kind (file, web, note), folder, file type, date range.
- Search works before any model is downloaded (FTS5 only) and says so.
- "Instant" is defined as targets, measured in Phase 1 and enforced by a benchmark test in CI against a fixture corpus:
  - p95 under 80 ms for keyword-only on 100k chunks.
  - p95 under 250 ms for hybrid on 100k chunks, on the reference machine, including query embedding.
  - Results stream: keyword results render immediately, semantic merge arrives within the second budget.
- FAISS index type: `IndexFlatIP` up to about 200k chunks (exact, simple, fast enough at 768 dimensions). Above that, switch to HNSW. Do not implement HNSW until a real corpus needs it.
- Existing endpoints (`/search`, documents) keep their current response fields for the extension and gain a `kind` field.

## 9. Backend API additions

All routes require the paired token except `GET /health`.

| Route | Purpose |
| --- | --- |
| `GET/POST /folders`, `PATCH/DELETE /folders/{id}` | Manage watched folders and per-folder rules |
| `POST /folders/{id}/rescan` | Force reconcile |
| `GET /files?folder=&status=&q=` | Browse indexed files and problems |
| `POST /files/{id}/reindex`, `DELETE /files/{id}` | Retry or drop one file |
| `GET /index/status` | Queue depth, files indexed, current file, chunks, vector count, model state, last scan, errors |
| `GET /index/events` | Server-sent events stream for live progress |
| `POST /index/pause`, `POST /index/resume` | Throttle control |
| `POST /index/rebuild` | Full rebuild after model or chunker change |
| `POST /search` | New search with filters and passage results (existing `GET /search` stays) |
| `GET/PUT /ai/generation` | Generation provider config, including API key (replaces the embedding half of `/ai`) |
| `POST /model/download`, `GET /model/status` | Explicit EmbeddingGemma 2 download with progress |
| `GET /files/{id}/open` | Returns the path for the client to open with the OS; the backend never streams arbitrary files |

File content is read only for paths inside enabled watched roots. Path resolution rejects `..`, symlink escapes and non-regular files.

## 10. Flutter application

### Scope and platforms

Desktop first: Linux, Windows, macOS from one codebase. Mobile is out of scope. The app is a client of the backend over HTTP and SSE.

### Stack (kept deliberately small)

- Flutter stable, Dart 3, Material 3 theming from the project's design tokens.
- `flutter_riverpod` for state, `dio` for HTTP, `go_router` for navigation.
- `window_manager` and `hotkey_manager` for the global quick-search hotkey, `tray_manager` for the tray icon, `file_picker` for folder selection, `url_launcher` / `open_filex` to open files, `flutter_secure_storage` for the pairing token.
- No code generation beyond what Riverpod needs. No Bloc, no second state library.

### Layout

```
app/
  pubspec.yaml
  lib/
    main.dart
    core/        api client, auth, backend supervisor, theme (from tokens.css), router
    features/
      search/    search page, result tile, filters, preview pane
      folders/   folder list, add/edit dialog, exclusion editor
      status/    indexing progress, queue, failures, pause/resume
      library/   file browser, web pages and notes (existing dashboard content)
      graph/     knowledge graph (ported last)
      settings/  generation provider, privacy, model download, about
    shared/      widgets used by two or more features
  test/
  integration_test/
```

### Screens

1. **First run**: welcome, EmbeddingGemma 2 download with size and progress, pair with backend (automatic when the app launched it), pick first folders.
2. **Search** (home): one large box, results grouped by source, passage preview, open file, reveal in folder, filters in a side rail. Global hotkey opens a compact overlay version.
3. **Folders**: list of watched folders with status, file counts, last scan, add/remove, include/exclude editor.
4. **Index status**: live progress, current file, queue size, failed files with retry, pause/resume.
5. **Library**: web pages, notes, files in one list (the existing dashboard views).
6. **Settings**: generation provider (local, or API key), privacy controls from the existing privacy API, data location, rebuild index.

### Matching the dashboard UI

The brief is "same user interface as the dashboard". `frontend/tokens.css` and `frontend/base.css` are the source. Phase 5 extracts colors, type scale, spacing and radii into a Dart `ThemeData`. Screens are rebuilt natively, not wrapped in a web view. `PRODUCT.md` asks for clean, minimal and welcoming; this plan keeps to that.

### Backend lifecycle

On launch the app looks for a running backend on the configured loopback port. If none, it starts the backend as a child process and stops it on quit (the backend keeps the worker alive only while the app or extension needs it). Closing the window minimizes to the tray; indexing continues. A "launch at login" setting is optional and off by default.

### Packaging (needs a decision, see section 15)

PyTorch plus sentence-transformers makes a bundled Python sidecar large (hundreds of MB to several GB depending on CPU or CUDA wheels). Recommended approach: ship the Flutter app plus a small bootstrapper that creates a `uv`-managed environment on first run and installs the locked dependencies, with progress. This keeps installers small and avoids PyInstaller breakage with torch. The alternative, fully bundled installers, is deferred until the rest works.

## 11. Security and privacy

- Backend binds to `127.0.0.1` only. Host header and Origin checks from `core/local_access.py` stay. The Flutter app pairs once and stores its token in the OS keystore.
- Path safety as in sections 7 and 9. No route reads a path the user has not approved as a watched root.
- Embedding is local and offline after the one-time download. The only network calls: the model download (explicit), page fetching for extension captures (existing), and a remote generation provider if the user enters a key.
- Generation API keys live in the OS keystore through the Flutter app when available, otherwise in a file with `0600` permissions in the data dir. Never logged, never exported.
- Privacy page lists watched folders, counts, storage sizes, and offers "forget this folder" (deletes chunks, vectors and FTS rows, never touches the user's files) and "delete everything".
- Redaction: files matching secret patterns are skipped before reading. An opt-in setting could add content scanning for high-entropy tokens later; not in scope now.
- Search history logging stays controllable through the existing privacy settings.

## 12. Web dashboard and extension

- **Extension**: no behavior change. It keeps sending captured pages to `/visit`. It gains no file-related code. Update only if API field names the extension reads change (they do not).
- **Web dashboard**: kept so users without Flutter still have a UI, but no new features. The Flutter app is the primary UI. Remove the dashboard's model-selection screen for embeddings in Phase 2 because that option no longer exists.

## 13. Implementation phases

Each phase ends with a green acceptance list. Do not start a phase before the previous one passes. Steps are numbered so commits can reference them.

### Phase 0. Housekeeping

Goal: a clean base that follows `AGENT.md`.

- 0.1 Commit or stash the pending working-tree changes on `desloppify/backend-health` as separate, reviewed commits. Do not build on an unreviewed tree.
- 0.2 Add `scripts/check_style.py`: fails on any Python comment token (via `tokenize`), any docstring (via `ast`), any `->` return annotation, and any `//`, `/* */`, `///` comment in `.ts`, `.tsx`, `.dart`, `.js`. Wire it into `ruff`/pre-commit and CI.
- 0.3 Run the sweep: strip every comment and docstring from `backend/`, `scripts/`, `extension/src`, `extension/tests`, `frontend/*.js`. Remove inline `# noqa` and move the rules to `pyproject.toml`. Run the full test suite before and after; behavior must be identical.
- 0.4 Stop tracking user data: `git rm --cached backend/data/*.db *.bin *.pkl *.json`, add `backend/data/` to `.gitignore`. Check history for sensitive content and tell the user before any history rewrite.
- 0.5 Install the Flutter SDK and enable the Linux desktop target. Record the version in `docs/Development.md`.
- 0.6 Record baselines: current test results and search latency.

Acceptance: `check_style.py` passes on the whole repo; all existing tests pass; `git status` shows no data files tracked.

### Phase 1. EmbeddingGemma 2 backend

Goal: the backend uses EmbeddingGemma 2 and nothing else for embeddings.

- 1.1 Spike (done, results in section 3; throwaway script not committed): load `google/embeddinggemma-2` with sentence-transformers, text-only config, bfloat16. Verify prompts, dimension, truncation, normalization, RAM, load time, throughput on this machine. Resolve the open questions in section 3. Write findings to `docs/AI-Pipeline.md`.
- 1.2 Create `services/embedder.py` with `embed_query` and `embed_documents`, model constants, signature function, explicit download with progress and `local_files_only` afterward. Delete the model/provider choice for embeddings from `core/ai_config.py`, `services/ai_providers.py`, `api/ai.py`, `data/models.json` handling, `EMBEDDING_MODEL_NAME` and `EMBEDDING_MODEL_PATH` settings. Remove `embedding_service.py`.
- 1.3 `EMBEDDING_DIMENSION` becomes a derived constant. Store signature in `index_meta`. On mismatch (every existing install, since the index is currently Qwen 1024-d), mark the index stale and rebuild existing documents and items in the background. Lexical search keeps working during the rebuild.
- 1.4 Update `/health` and the extension and dashboard health consumers for the new status shape (model present, downloading, ready).
- 1.5 Relevance floor: semantic search always returns nearest neighbours, so even a nonsense query returns results. Calibrate a minimum similarity (and a minimum fused score) on the fixture and apply it in `file_search.py`.
- 1.5 Benchmark harness: a fixture corpus plus a query set with expected hits, reporting recall@10 and latency. Use it to choose chunk size and truncation dimension. Commit the harness, not the corpus if it contains personal data.
- 1.6 Tests: fake embedder for unit tests; one slow-marked test that runs the real model when present.

Acceptance: a fresh install downloads the model on consent and indexes a page captured by the extension; old installs rebuild automatically; no code path can select another embedding model; recall@10 on the fixture is not worse than the Qwen baseline.

### Phase 2. Chunk-level storage and search core

Goal: passage-level hybrid search for existing content, on the new data model.

- 2.1 Alembic migration: `chunks`, `chunks_fts`, `index_meta`, `jobs`. Backfill chunks from `documents` and `saved_items`.
- 2.2 `services/chunker.py`: deterministic structural chunker with version constant, unit-tested on markdown, prose, code, PDF pages.
- 2.3 Replace `vector_service.py` with an `IndexIDMap2` over `IndexFlatIP`, keyed by chunk id, with add, remove and atomic save.
- 2.4 Replace `bm25_service.py` and the pickle with FTS5. Delete `rank-bm25` from dependencies and `bm25_index.pkl`.
- 2.5 Rewrite `search_service.py` per section 8: FTS plus FAISS plus RRF, grouping, reason codes, passage highlights. Preserve the extension's response fields.
- 2.6 Index consistency check and repair on startup.
- 2.7 Move the worker out into its own process (`python -m app.worker`) reading from `jobs`. The extension capture path also becomes a job.

Acceptance: existing extension flows work unchanged; search returns passages with highlights; kill the worker mid-batch and restart, the index repairs and no data is lost; keyword search works with the model absent; benchmark meets the latency targets on the fixture.

### Phase 3. Folder indexing

Goal: pick a folder, get it indexed.

- 3.1 Models and CRUD for `watched_folders`; `api/folders.py` with path validation.
- 3.2 Scanner with default and custom exclusions, size cap, symlink policy (do not follow by default).
- 3.3 Tier 1 extractors (`services/extractors/files/`), one function per type, returning text and optional page map.
- 3.4 `index_file` and `delete_file` jobs: hash check, extract, chunk, embed, write. Idempotent.
- 3.5 `/index/status` and `/index/events` (SSE).
- 3.6 Tests on a real temp directory: add, modify, delete, binary file, huge file, secret file, symlink out of root.

Acceptance: add a folder of 1,000 mixed files and see them searchable and counted; re-adding changes nothing; excluded and secret files are never opened (verified by a test that fails if they are read).

### Phase 4. Live watching

Goal: the index follows the disk.

- 4.1 Watcher built on `watchdog` with debounce, started per enabled folder.
- 4.2 Reconcile scan on startup and every 6 hours, and on demand.
- 4.3 Rename and move detection by hash.
- 4.4 Handling for inotify limits and unavailable paths (external drives, network mounts): status `unavailable`, retry when it reappears, never delete the index because a drive is unmounted.
- 4.5 Pause, resume and low-priority mode.
- 4.6 Tests: create, edit, delete, rename, rapid save bursts, directory removal, unmount simulation.

Acceptance: edit a note and find the new text within 5 seconds of saving; delete a file and it disappears from search; rename keeps chunks without re-embedding; app closed for a day then reopened converges through reconcile.

### Phase 5. Flutter foundation

Goal: a runnable app that searches.

- 5.1 `flutter create` the desktop project in `app/`, strict `analysis_options.yaml`, the comment-free style gate in CI.
- 5.2 Theme extracted from `frontend/tokens.css` and `base.css`.
- 5.3 API client, pairing flow, secure token storage, SSE client.
- 5.4 Backend supervisor (find or start the backend, health wait, clean shutdown).
- 5.5 Search page with results, passage preview, open file, reveal in folder.
- 5.6 Widget tests and one integration test against a real backend started on a temp data dir.

Acceptance: launch the app on Linux, search existing data, open a result; the app starts and stops its backend cleanly.

### Phase 6. Flutter product surface

Goal: every function needed to run MindCache without the web dashboard.

- 6.1 First-run flow including consented model download and progress.
- 6.2 Folders screen with exclusions and per-folder status.
- 6.3 Index status screen with live progress, failures, retry, pause.
- 6.4 Library screen for web pages, notes and files, with detail and delete.
- 6.5 Settings: generation provider with API key, privacy controls, rebuild, data location.
- 6.6 Tier 2 extractors on the backend (`docx odt pptx xlsx html epub`).
- 6.7 Global hotkey quick-search overlay and tray with minimize-to-tray.
- 6.8 Knowledge graph, ported from the dashboard, last and only if time allows.

Acceptance: a new user installs, downloads the model, adds a folder, searches and opens a file without touching the web dashboard.

### Phase 7. Resource behavior and robustness

- 7.1 Worker niceness, batch sizing by free memory, optional GPU use when available (CUDA, MPS), and an "index only when idle or on AC power" setting.
- 7.2 Large-corpus test: 100k chunks, verify the latency targets and memory ceiling. Add HNSW only if flat search misses the target.
- 7.3 Backup and restore of `mindcache.db` plus a rebuild-from-SQLite path for the vector index.
- 7.4 Logging with rotation, an in-app "copy diagnostics" action that excludes content and keys.

### Phase 8. Images (optional, after review)

- 8.1 Spike the multimodal `encode` path in sentence-transformers; load the 440M text-plus-vision variant only when image indexing is enabled.
- 8.2 Image files as chunks (one chunk per image), searchable by text query. Optional OCR text through `services/ocr.py` feeds FTS.
- 8.3 Gallery results in the app.

Audio and video stay out of scope.

### Phase 9. Packaging and release

- 9.1 Bootstrapper that creates the `uv` environment and installs locked dependencies with progress.
- 9.2 Installers per platform (AppImage or deb, MSIX or Inno Setup, dmg).
- 9.3 Update docs: `README.md`, `docs/Setup.md`, `docs/Architecture.md`, `docs/API.md`, `docs/AI-Pipeline.md`.
- 9.4 Clean-machine install test on each target OS.

## 14. Testing strategy

- **Backend**: pytest with real SQLite and FAISS in temp dirs, fake embedder by default, real-model test marked slow. Property test for chunker determinism. Job idempotency and crash-recovery tests. Path-safety tests for every route that takes a path.
- **Search quality**: the benchmark harness from step 1.5 runs on every change to ranking, chunking or embedding. Track recall@10 and latency; fail on regression.
- **Flutter**: widget tests per feature, integration test driving the real backend.
- **Style gate**: `scripts/check_style.py`, `ruff`, `flutter analyze`, `dart format --set-exit-if-changed`.
- **Manual before release**: fresh install, offline after model download, 10k-file folder, unmount drive, rename directories.

## 15. Decisions needed from you before Phase 5 or 9

1. **Packaging**: bootstrapper with `uv` (recommended) or fully bundled installers.
2. **Platforms at launch**: Linux only first (your machine) or all three desktops.
3. **Default truncation dimension**: 768 until the benchmark says otherwise. Do you accept 512 if recall is within 0.5 percent, for 33 percent less storage?
4. **Return-type rule**: `AGENT.md` forbids `->` annotations in Python and keeps parameter annotations where FastAPI and Pydantic require them. Confirm that is what you meant.
5. **Images** in Phase 8, or stay text-only for the first release.
6. **Existing web dashboard**: keep as-is, or retire once the Flutter app reaches parity.

## 16. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Model gating or terms at Hugging Face | Download fails on first run | Check in Phase 1 spike; explain and accept a user token |
| Embedding RAM in two processes | Memory pressure on small machines | Measure in spike; serve query embeddings from worker if needed |
| First-run index of a large folder takes hours on CPU (measured 1.3 chunks/s) | Poor first impression | CPU speed plan in section 3, priority for recent files, visible progress and estimate, pause, lexical search available immediately |
| inotify limits and missed events | Stale index | Reconcile scans, visible status |
| Torch and packaging size | Large or fragile installers | `uv` bootstrapper first |
| Index corruption on crash | Lost search | Atomic saves, SQLite authoritative, repair on startup |
| Secrets indexed by mistake | Privacy breach | Exclusions before open, no content leaves the device by default |
| Multimodal path unverified | Phase 8 slips | Isolated to the final optional phase |
| Large uncommitted tree | Merge pain, lost work | Phase 0.1 first |

## 17. Definition of done for the whole project

A new user installs MindCache, downloads EmbeddingGemma 2 once, chooses folders, and within minutes can search files and browsing history together with sub-second results. Changing a file updates search within seconds. Nothing leaves the machine unless the user entered an API key for generation. Deleting a folder from MindCache removes its index and leaves the files untouched. The repository contains no comments, no docstrings, no return annotations in Python, and no tracked user data.
