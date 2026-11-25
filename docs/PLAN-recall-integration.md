# MindCache + Recall integration plan

Status: implementation in progress. The web library shell, lexical fallback, search explanations, backend history controls, local-origin checks, and initial per-task model providers are implemented but need full integration and browser testing. The extension remains integral. Notes and file uploads now have initial SQLite-backed storage and text matching; image OCR is available on request through installed Tesseract, while semantic indexing for these items is not yet implemented. Recall JSON and packaged managed originals have an initial preview and transactional import; broader migration and restore testing remains open. Extension IDs can now be paired and revoked from the local web app; end-to-end extension compatibility, complete privacy controls, safe embedding reindexing, and release work remain open.

## Product decision

Make **MindCache** the single product and repository. Its primary experience becomes a local web application, usable without a browser extension. Bring Recall's standalone interface and multimodal memory capabilities into MindCache as first-class features. Make the browser extension an **integral part of MindCache**, alongside the web app and local memory backend. It provides automatic browsing and one-click capture against the same library; users control capture and may pause it. The web app remains usable when the extension is disconnected. Do not embed Recall as an extension, run two backends, or maintain two independent libraries.

This treats your preference for MindCache as the product direction while recognizing that the current MindCache checkout has an extension UI, not a standalone web UI. Recall already has a standalone React app: use it as the starting point for the web experience, then adapt its design and flows to MindCache rather than assuming either UI is finished. Keep Recall untouched during the initial work; decide its archival or redirect only after migration and release are proven.

## What the review found

| Area | MindCache today | Recall today | Direction |
| --- | --- | --- | --- |
| Interface | React extension popup, settings, overlay and graph | React web app with dashboard, search, library, upload, graph and models | Port and refine Recall's web app under MindCache branding; reuse MindCache interaction patterns where useful |
| Capture | Automatic dwell-based and manual browser capture; platform-specific extraction | Manual web clips, notes, PDFs, images and screenshots | Preserve MindCache web capture; add Recall's file and note ingestion to the shared backend |
| Storage | SQLAlchemy SQLite documents keyed by unique URL, visit/click/query history, separate FAISS and BM25 indexes | SQLite memories including file metadata and embeddings; FAISS rebuilt from stored embeddings | Extend MindCache's schema for multiple content types; adopt the authoritative-database/rebuildable-index principle |
| Search | Hybrid vector/BM25 plus title, metadata, recency, quality and click signals | Hybrid retrieval, filters and match-reason chips | Keep a single evaluated ranking pipeline; adapt Recall's explanations and filters to actual MindCache signals |
| Setup | Separate backend and extension build, model prerequisites documented | One script builds, tests and starts the app; optional AI fallbacks | One guided local launch for the web app, with integrated extension setup and user-selected models |
| Privacy | Extension controls and exclusions; backend stores content, visits, queries and clicks | Local library, delete and JSON import/export | Unified dashboard and enforceable controls covering every storage location and capture path |

Evidence to recheck during implementation: `backend/app/main.py` currently initializes MindCache's schema with `create_all` and ad hoc column changes; its search response has a score but no reason fields. Recall's `backend/app/search.py` already emits reason labels, and its `backend/app/db.py` stores embeddings with memories. MindCache's backend currently permits all CORS origins, so localhost alone must not be treated as an access-control boundary. MindCache's README mentions Ollama synthesis, but the checked search service currently returns no generated summary; verify the actual ingestion/model behavior and correct public claims before promising features. Model downloads and server-side fetching can involve network access even when inference and data storage are local.

## Target experience

1. A user starts MindCache locally with one documented command, opens the web app and completes a short setup. They can add a note or file and search immediately while the extension is being set up and without downloading an unwanted AI model.
2. The library contains web pages, notes, PDFs and images/screenshots in one searchable collection. Each item shows its type, origin, processing status and available content. Capture failures and partial OCR/extraction are visible and retryable.
3. Search results explain the evidence: for example, matching title terms, a matching passage, or a semantic similarity signal. Filters cover type, domain and date; dwell-time filters apply only when that data exists. A score is a ranking signal, not a probability or a percentage of certainty.
4. A privacy dashboard shows what is captured, where it is stored, which network/model services are used, and how to pause, exclude, inspect, export and delete data. Settings reflect effective behavior, including whether the extension is connected.
5. Setup includes installing and connecting the MindCache extension; users explicitly choose automatic capture, manual-only mode, or pause. Existing MindCache users retain their settings and library through an upgrade.

## Architecture and boundaries

- Keep MindCache's FastAPI/SQLAlchemy backend and extension as the base; bring the useful Recall services into that codebase, adapting rather than copying a second app wholesale. Add a `frontend/` web app based on Recall's React UI, served by the same local backend in production and proxied in development.
- Introduce a shared memory/item model with a stable internal ID, type, optional URL/domain, title, text, source metadata, timestamps and processing state. Web pages keep visit, dwell, keyword and entity relationships. Files need managed relative paths, MIME type, size, hash and extraction/OCR status; notes need no artificial URL. Preserve original files as well as derived text where applicable.
- Preserve existing document IDs and URLs for compatibility. Use a versioned database migration and a compatibility layer for the existing extension API while the web UI adopts a stable common API. Decide the exact schema after inventorying existing data and Alembic state; avoid a risky table rewrite without a tested rollback.
- SQLite and managed original files are authoritative; BM25 and FAISS are derived, versioned and rebuildable. Store embedding model identity, dimension and version with vectors; rebuild when model, contents or index version changes, including same-dimension model changes. Handle updates/deletes across all chunks and recover cleanly after interruption.
- Keep ingestion modular: browser extraction and MindCache's existing platform extractors; text notes; PDF extraction; image metadata and optional OCR/captioning adapted from Recall. Make optional dependencies and degraded behavior explicit; route each AI task through its selected provider. Validate file type, size and paths; avoid arbitrary server-side filesystem reads in the normal UI.
- Audit Recall's source and third-party dependencies/assets and their licenses before porting; retain required notices and do not introduce paid BoardUI components. Bring across tests and fixtures with the functionality.

## User-controlled AI architecture

MindCache is a recall layer under the user's control, not an autonomous agent. It must never silently select, download, switch or send personal content to a model provider. Capture, retrieval, summarization and other AI actions remain understandable and controllable.

- Support three provider families: direct local Transformers, Ollama, and user-configured OpenAI-compatible APIs. Configure providers and models independently by task: embeddings, summarization/generation, and optional image/OCR tasks where the provider supports them. For example, local embeddings can coexist with remote summarization. Clearly label unsupported combinations rather than promising every model can perform every task.
- Show installed and available models, provider endpoint, task assignments, download size/source where known, and current status. Let users explicitly download, select, change, disable and remove local models; never delete shared Ollama models without clear confirmation. Provide connection tests and useful failure states.
- Treat remote providers as opt-in: show exactly which task and content will leave the device and to which endpoint before enabling it. Keep credentials out of logs and exports; use suitable local secret storage where available and document its limitations. Local-only remains possible.
- Track embedding provider, model and version in the index. On changes, offer a visible, resumable re-embedding operation; do not mix incompatible vectors or silently fall back to another model. Lexical search remains available while embeddings are unavailable or rebuilding.
- Test independent provider/task routing, explicit download consent, remote disclosure, secrets handling, provider outages and embedding migrations.

## Work packages and acceptance criteria

### 0. Baseline and decisions

- Inventory both apps' dependencies, licenses, existing tests, actual network calls, model requirements, OS support and user data formats. Run current suites and record failures before changes. Inspect the existing UI and compare its workflows before adopting individual pages.
- Establish a representative retrieval fixture from MindCache's `backend/tests/search_evaluation.json` plus web, note, PDF and image examples. Record relevance and latency baselines, including no-model operation.
- Decide supported initial platforms and packaging after a clean-machine trial; do not promise a native installer until verified.

**Done when:** baseline results, license decisions and supported configurations are recorded, with any discrepancies in README claims identified.

### 1. Easier setup and first run

- Provide a cross-platform documented launcher or platform-specific equivalents that check Python/`uv` and Node, install locked dependencies, build the web UI and start the backend with actionable errors. Offer explicit flags for development, tests, model installation and extension build; never silently seed or delete user data. Document a manual path and offline limitations.
- On first launch show readiness for database, search, configured AI providers, per-task models and extension connection. Provide a working lexical search path with no model; model installation/download is opt-in, with size, source and network use explained. Show progress and remediation, and make repeated setup safe.
- Serve the built UI from localhost; bind to loopback by default. Document ports, data directory, backup and uninstall. Include browser unpacked-extension installation and connection in the guided setup.

**Done when:** a clean supported environment can start, create a note and search it without waiting for a model download; rerunning preserves data; missing prerequisites and offline/model failures give clear next steps.

### 2. One library and multimodal ingestion

- Add versioned migrations and a unified item API for listing, filtering, detail, create/edit, upload, delete and ingestion status. Add notes, PDFs and images using adapted Recall logic, retaining source attribution and original files. Keep existing web and extension endpoints working throughout the transition.
- Port dashboard, upload, library, detail and graph workflows into the MindCache web app. Clearly show queued, processing, ready, partial and failed states. A failed OCR or embedding must not hide successfully extracted text.
- Define duplicate behavior: preserve MindCache's URL recapture behavior; use content hashes to flag identical uploaded files, but do not silently merge different user content. Make updates and retries idempotent.

**Done when:** each supported type can be added, viewed, searched, edited where appropriate and deleted; recaptured URLs retain visit history; extension capture and web uploads appear in the same library; existing MindCache data survives upgrade.

### 3. Explainable search

- Refactor ranking to retain per-candidate evidence from the same scoring pass: matched title/keyword/content terms and excerpt positions, semantic contribution, and any recency, dwell, quality or click adjustments. Avoid presenting a semantic match as a literal text match. Bound engagement boosts so they cannot dominate relevance; evaluate this rather than assuming Recall's weights transfer.
- Return structured, versioned reason codes and safe text excerpts with optional offsets; no fabricated snippets or confidence percentages. Keep existing response fields for the extension during transition. Display human-readable reasons, highlights and filters in the web app; provide a useful fallback when no excerpt exists.
- Make search logging and click learning independently controllable. When disabled, do not write their corresponding records or use old click signals until re-enabled; make deletion available.

**Done when:** reasons correspond to actual signals, snippets come from the matching item, filters work across types, and ranking tests cover exact title, lexical, semantic-only, no-match, disabled logging and engagement-boost cases. Compare relevance and latency against the baseline before changing defaults.

### 4. Privacy dashboard and local security

- Show counts and storage locations for original files, extracted text, SQLite, indexes, logs, query/click history and extension-held settings/queued data; distinguish estimated disk use from exact counts. Describe local model inference separately from model downloads, page fetching and external site access.
- Provide explicit capture mode (off, manual, automatic), domain exclusions, search-history and click-learning controls, and a clear indication when the extension is disconnected or settings have not synchronized. Enforce exclusions before capture and server-side fetching; document limitations for browser-restricted pages and private windows.
- Provide preview and confirmation for deletion of one item, a domain/date range, search/click history, and all local data. Delete originals, derived text, metadata and index entries, handle queued work and rebuild indexes as needed. Clearly distinguish app deletion from backups, OS caches and browser history. Offer export and a tested restore before destructive bulk operations.
- Secure local access before exposing sensitive library operations: restrict origins and hosts, address browser cross-origin requests and DNS rebinding, and design a local authentication/pairing mechanism for the web app and extension. Validate upload and import paths and prevent unsafe URL fetches to local/private services, including redirects. Verify browser and extension compatibility rather than relying on CORS alone.

**Done when:** controls change actual capture and retention behavior; deleted data does not reappear after restart/rebuild; unauthenticated or untrusted origins cannot read or mutate the library; dashboard statements match observed storage and network behavior.

### 5. Recall import, release and consolidation

- Build an explicit, opt-in Recall importer after inspecting its actual database, upload directory and JSON export formats. Preview counts, unsupported fields and duplicates; preserve originals, timestamps, source URLs, notes and metadata where possible. Map IDs and report per-item errors. Recompute embeddings using the selected MindCache model rather than mixing incompatible vectors.
- Import into a backed-up destination transactionally where practical, with a resumable manifest and a clear rollback/restore path for files and DB. Never modify the source Recall library. Test empty, duplicate, interrupted and partially corrupt imports and compare counts and representative content.
- Update setup, privacy, API and migration documentation; provide a release checklist, known limitations and a compatibility/deprecation window for old extension clients. Only propose archiving Recall after real migration and user review.

**Done when:** a representative Recall library imports into an existing MindCache library without loss or silent overwrites, can be searched alongside existing data, and can be restored from backup; release documentation matches tested behavior.

## Delivery order and checks

Ship in small vertical slices: baseline → local web shell and setup → unified schema and notes → PDFs/images → explainable search → privacy/security controls → Recall import and consolidation. Security required to safely expose the web app is a prerequisite for the first usable web release, not deferred until the dashboard is polished. Keep the existing extension usable at each step.

For each slice run the relevant backend and frontend tests, migration/rollback tests on copies of old databases, and a clean setup smoke test. Add integration tests for index rebuild, deletion and privacy settings, plus browser tests for first run, capture, search and dashboard on desktop and mobile widths. Verify offline operation and observe outbound requests during setup, model installation and ingestion. Measure relevance against the agreed fixture and record performance on representative hardware. Fix regressions before proceeding.

## Review decisions

- **Recommended:** MindCache is the product name and repository; Recall becomes a source of features and an optional import source. Keep its repository intact until migration is proven.
- **Recommended:** manual-only browser capture by default for new installs, with automatic capture opt-in; preserve existing users' current settings during upgrade.
- **Recommended:** lexical search works immediately; users choose providers and models independently for each AI task. No cloud account is required, and remote services are explicitly opt-in.
- **To decide:** which operating systems must be supported in the first release, and whether Recall's visual design should be retained closely or restyled to match MindCache. These choices affect packaging and UI scope, not the unified architecture.
