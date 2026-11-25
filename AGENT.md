# AGENT.md

Binding rules for any agent or contributor working in this repository. Read this and `PLAN.md` before changing code. If a rule here conflicts with a habit, the rule wins.

## 1. Simplicity first, efficiency always

- Write the simplest code that fully solves the problem. No speculative abstraction, no plugin systems, no config for things nobody asked to configure.
- No new layer, class, wrapper or helper unless it removes duplication that exists right now, in at least three places.
- Prefer plain functions and data over class hierarchies. Prefer the standard library and dependencies already in the project over new ones. A new dependency needs a one-line reason in the PR.
- Simple does not mean slow. Batch embeddings, stream large files, never load a whole corpus into memory, never block the event loop, never rescan what a hash or mtime already answers.
- One way to do each thing. Delete the old path when the new one lands. No feature flags for finished work, no compatibility shims nobody uses.
- Do only what the task asks. No drive-by refactors, no unrequested features.

## 2. No comments. Anywhere.

- No `#` comments, no `//` comments, no `/* */`, no `///`, no `<!-- -->`, no docstrings, no TODO or FIXME markers, no commented-out code, no lint pragmas such as `# noqa` or `// ignore:`.
- If a comment or docstring already exists in a file you touch, remove it. Opening a file to change it means leaving it comment-free.
- Code explains itself through names and structure. If it cannot, simplify the code. Rationale belongs in `PLAN.md`, `docs/`, or the commit message.
- Lint suppressions move into tool config (`pyproject.toml`, `analysis_options.yaml`, `tsconfig`), never inline.
- Exceptions: machine-required headers (a `LICENSE` file, generated files, lockfiles) and `.gitignore` style config files.

## 3. Python style

- No return type annotations. Never write `-> X`. Parameter annotations only where a framework needs them to work (FastAPI request bodies and dependencies, Pydantic models, SQLAlchemy `Mapped[...]` columns).
- No docstrings. No `from __future__` imports unless a runtime error requires one.
- Python 3.12, `async` only for I/O paths in the API layer. CPU-bound work (embedding, extraction) runs in the worker, never on the event loop.
- Names are full words. No single-letter names except loop indices and comprehension variables.
- Keep functions short and single-purpose. Early return over nesting. No nested function definitions unless a closure is genuinely required.
- Errors: raise the narrowest built-in or an existing project exception; never `except Exception: pass`. Log once, at the boundary.
- Format and lint with `ruff` using the project config. Ruff must pass with zero inline suppressions.

## 4. Dart and Flutter style

- No comments or doc comments. Same rule as Python.
- Dart's types are not optional, so annotate normally, but do not repeat the type where inference is obvious (`final items = []` needs its element type, `final count = 3` does not).
- State management is Riverpod and nothing else. No second state library.
- One widget per file when it exceeds roughly 80 lines; small private widgets stay with their parent.
- No business logic in widgets. Widgets read providers and call repository methods.
- `flutter analyze` and `dart format` must be clean.

## 5. TypeScript, extension and web dashboard

- No comments. No `any`. No new dependency without a reason.
- The extension is stable: change it only when `PLAN.md` says so, or to fix a bug you can reproduce.

## 6. Embedding model rule (non-negotiable)

- The only embedding model is `google/embeddinggemma-2`. Users cannot choose another embedding model, provider or dimension. Do not add a settings switch, environment override or fallback model for embeddings.
- Embedding always runs locally. No API key path exists for embeddings.
- Query side uses the `SearchQuery` prompt. Document side uses `title: {title} | text: {content}` (`title: none` when there is no title).
- Never run the model in `float16`. Use `bfloat16` or `float32`.
- Every vector row records model id, dimension and index version. A mismatch triggers a rebuild, never a silent mix.

## 7. Generation provider rule

- Generation (summaries, answers) is optional. Default is off or local.
- A remote provider requires the user to enter an API key and endpoint and explicitly enable it. Show what leaves the device before it is enabled.
- Keys are never logged, never exported, never written to the database in plain text.
- Retrieval and indexing must never depend on a generation provider.

## 8. Privacy and security

- Local-first. No telemetry, no analytics, no outbound request that the user did not initiate or enable.
- Everything bound to `127.0.0.1`. Every non-health route requires the paired token.
- The backend reads files only inside user-approved watched roots. Resolve real paths and reject anything that escapes a root, including through symlinks.
- Never index secrets by accident: honour the default exclusion list (`.git`, `node_modules`, `.env*`, key files, browser profiles, cache directories) and every user exclusion before opening a file.

## 9. No slop

- No redundant code: dead branches, unused imports, unused parameters, duplicate helpers, wrappers that only forward a call.
- No placeholder implementations, no `pass`-bodied stubs, no fake data, no "for future use" parameters.
- No defensive code for situations that cannot happen. Validate at the boundary (HTTP input, filesystem, model output) and trust internal calls.
- No filler in prose: no marketing language, no restating what the code does, no emoji in code, docs or commit messages.
- No duplicate documentation. One fact lives in one place.
- Delete what you replace. If you remove a feature, remove its route, schema, test, doc line and dependency in the same change.

## 10. Tests

- Every behavior change ships with a test that fails before and passes after.
- Test behavior through public interfaces: real SQLite in a temp directory, real FAISS, real files. Mock only the network and the embedding model (use the fake embedder from `backend/tests/conftest.py`).
- Tests contain no comments and no docstrings either.
- A phase in `PLAN.md` is done only when its acceptance list passes. Do not start the next phase before then.

## 11. Workflow

- Work one `PLAN.md` step at a time, in order. State which step you are on in the commit message.
- Before writing code, read the files you will change and the files that call them.
- Run the style gate (`python scripts/check_style.py`), `ruff`, and the relevant test suite before reporting a step complete.
- Report only what you verified. If a check fails or was skipped, say so with the output.
- Small commits, one concern each. Message format: `type(scope): imperative summary`, no body unless needed.
- Do not touch `backend/data/`, `*.db`, `*.bin`, `*.pkl` or lockfiles by hand. Data files do not belong in commits (see `PLAN.md` step 0.4).
- Ask before anything destructive or outward-facing: deleting user data, force pushes, publishing, network calls to third parties.

## 12. Definition of done for any change

1. Does exactly what the step says, and nothing more.
2. Contains no comments, docstrings, return annotations (Python), dead code or unused dependencies.
3. Style gate, linters and tests are green.
4. Docs updated only where behavior changed, in the one place that owns the fact.
