# Knowledge Folder Enhancement: Open Folder + Auto-Scan + Subfolder Visibility

**Date:** 2026-05-23
**Status:** Approved

## Problem

1. Customers can only add files via Dashboard drag-drop — no way to open the folder on PC and drop files directly
2. Files added outside the app (via Explorer/Finder) are never indexed until next boot backfill
3. Visibility is a DB column — not reflected in folder structure, making it invisible to users browsing files on disk

## Source of Truth

**Subfolder location is authoritative for visibility.** DB syncs to match:
- Watcher detects file in `public/` → DB visibility = `"public"`
- User changes visibility in Dashboard UI → file physically moves to matching subfolder + DB updates
- On conflict (DB says `internal` but file is in `public/`), subfolder wins

## Design

### 1. Subfolder-based visibility

Each knowledge category gets 3 subfolders that determine file visibility:

```
knowledge/<category>/files/
  public/       → Khách Zalo thấy được
  noi-bo/       → Nội bộ (nhân viên + CEO)
  ceo-only/     → Chỉ CEO
```

**Mapping:**
- `*/public/*` → DB visibility = `"public"`
- `*/noi-bo/*` → DB visibility = `"internal"`
- `*/ceo-only/*` → DB visibility = `"private"`
- Files at `*/files/<file>` (no subfolder, legacy) → treated as `"public"`

**Visibility inferred from first path segment after `files/`** — nested folders inside a visibility subfolder (e.g., `files/public/thang-5/report.pdf`) still inherit the parent visibility.

**seedWorkspace()** AND **ensureKnowledgeFolders()** both create all 3 subfolders for each category.

**Upload via app** (existing drag-drop): visibility dropdown still works. App copies file into the matching subfolder based on selection.

### 2. Open folder button

Each category row in the Knowledge tab UI gets a small folder icon button. Click → `shell.openPath(categoryFilesDir)` — opens the `files/` folder for that category in Explorer/Finder. Customer sees 3 subfolders (`public/`, `noi-bo/`, `ceo-only/`), drops files directly.

**IPC:** `open-knowledge-folder` (category) → resolve path → ensure dir exists → `shell.openPath()`.
**Preload bridge:** `openKnowledgeFolder(category)`.

### 3. File watcher (auto-scan + auto-index)

`startKnowledgeWatcher()` called at boot after migration + `backfillKnowledgeFromDisk()`:

- **Watch:** `fs.watch(knowledgeBaseDir, { recursive: true })` on the root `knowledge/` directory
- **Fallback polling:** Every 60s, compare disk vs DB to catch events `fs.watch` missed (matches existing `cron.js` `_watchPollerInterval` pattern)
- **Debounce:** 2s after last event — gathers all changes into one batch
- **Self-write guard:** `_isReindexing` boolean flag — suppresses watcher events during `rewriteKnowledgeIndex()` and other self-initiated writes (prevents infinite loop where index.md write triggers re-indexing)
- **On new/changed file:**
  1. Infer category from path (`knowledge/<category>/files/...`)
  2. Infer visibility from first subfolder after `files/` (`public/`|`noi-bo/`|`ceo-only/`, default `public` if none)
  3. Skip non-file events (directory creation, temp files, `index.md`)
  4. Extract text → summarize → chunk → embed → insert/update DB
  5. Rewrite `index.md` for the category (guarded by `_isReindexing`)
  6. Broadcast `knowledge-updated` event to renderer → UI auto-refreshes
- **On file deleted:**
  1. Remove from DB (documents + documents_chunks)
  2. Rewrite `index.md` (guarded by `_isReindexing`)
  3. Broadcast `knowledge-updated`
- **Ignore patterns:** `*.tmp`, `~$*` (Office temp), `.DS_Store`, `Thumbs.db`, `index.md`, `index.md.*`
- **Concurrency:** Processing queue — one file at a time to avoid DB contention
- **Lifecycle:** Start on boot (strictly after migration completes), stop on app quit. Restart if watcher errors out (5s delay).

### 4. Migration (existing installs)

`migrateKnowledgeToSubfolders()` runs once on boot (before watcher starts):

1. Check marker `knowledge/.migrated-to-subfolders` — skip if exists
2. For each category, scan `knowledge/<category>/files/` for files at root level (not in a subfolder)
3. For each file found:
   - Look up visibility in DB by filename + category
   - If found: move to matching subfolder (`public/`|`noi-bo/`|`ceo-only/`)
   - If not in DB: move to `public/` (safe default)
   - Update DB `filepath` column to reflect new path
4. Rewrite `index.md` for each migrated category
5. Write migration marker with timestamp: `knowledge/.migrated-to-subfolders`
6. Log: `[knowledge] migrated N files to subfolder structure`

**Safety:** Uses `fs.renameSync` (same filesystem, atomic). If rename fails (cross-device, permissions), log error and leave file in place — watcher will still pick it up as legacy root-level file.

**Boot order:** migration → backfillKnowledgeFromDisk → startKnowledgeWatcher (strictly sequential).

### 5. `set-knowledge-visibility` file move

When user changes visibility via Dashboard UI dropdown:
1. `fs.renameSync` file from current subfolder to target subfolder
2. Update DB `filepath` column
3. Update DB `visibility` column
4. Rewrite `index.md` (guarded by `_isReindexing` to avoid watcher re-trigger)

This keeps disk layout and DB in sync bidirectionally.

### 6. Files to modify

| File | Change |
|------|--------|
| `electron/lib/knowledge.js` | `migrateKnowledgeToSubfolders()`, `startKnowledgeWatcher()`, `inferVisibilityFromPath()`, update `listKnowledgeFilesFromDisk()` to scan 3 subfolders + root, update `backfillKnowledgeFromDisk()` for subfolder paths, update `ensureKnowledgeFolders()` to create 3 subfolders, update `upload-knowledge-file` to write to subfolder |
| `electron/lib/dashboard-ipc.js` | `open-knowledge-folder` IPC handler, update `set-knowledge-visibility` to move file + update path, update `list-knowledge-files` to scan subfolders |
| `electron/preload.js` | `openKnowledgeFolder` bridge, `onKnowledgeUpdated` event listener |
| `electron/ui/dashboard.html` | Folder icon button per category, `onKnowledgeUpdated` handler for auto-refresh |
| `electron/lib/workspace.js` | `seedWorkspace()` create 3 subfolders per category |

### 7. Edge cases

- **File locked by another process:** Skip, log warning, retry on next watcher event or 60s poll
- **Huge file (>100MB):** Same limit as upload — skip with log
- **Unsupported format:** Skip with log (same as upload handler)
- **Watcher crash:** Catch error, restart watcher after 5s delay. 60s poller continues regardless.
- **Rapid bulk copy (50+ files):** Debounce 2s gathers all → process queue handles one-by-one
- **Subfolder renamed/deleted by user:** Watcher detects, recreates subfolder on next boot via `ensureKnowledgeFolders()`
- **File renamed by user:** Old name deleted from DB, new name re-indexed (summary/embeddings recomputed — known limitation, acceptable)
- **Migration marker deleted:** Migration re-runs but is a no-op (no files at root level to move)

## Out of Scope

- Drag-drop between subfolders in Dashboard UI (use Explorer/Finder)
- Real-time progress bar for auto-indexing (just refresh file list when done)
- Custom subfolder names beyond the 3 fixed ones
