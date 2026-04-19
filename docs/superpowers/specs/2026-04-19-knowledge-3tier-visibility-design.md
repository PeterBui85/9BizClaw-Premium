# Knowledge 3-Tier Visibility — Design Spec (v3)

**Date**: 2026-04-19
**Target version**: v2.4.0
**Author**: Peter Bui (MODORO Tech Corp)
**Status**: Draft v3 — post spec-reviewer round 2, pending final reviewer check + user approval

## Revision history

- **v1** (2026-04-19 first draft): accepted approaches, factually incorrect claims about `zalo-group-settings.json` schema + searchKnowledge SQL structure + non-existent `__readGroupSettings` helper.
- **v2**: schema claims corrected against code, SQL rewritten (but still off — wrong column names like `c.text`), claimed preload unchanged (wrong — it's positional args), 3 tiers understated (actually 4 SQL locations), throttle 10m (actually 30m).
- **v3** (this doc): SQL replaced with exact copy-paste from main.js at verified line ranges, preload signature change explicit, 4 SQL locations enumerated with category-branch handling, throttle corrected, `knowledge-search` IPC added to §6.5, helper anchor verified against real inbound.ts top-of-file, cross-patch dependency fallback specified.

## 1. Problem

Current Knowledge model in 9BizClaw has **no access control**. Every uploaded file is readable by every customer via Zalo. Merchant cannot separate:

- Sensitive internal info (employee handbook, salary policy, internal SOP) — STAFF-only
- Owner-only info (P&L, supplier cost, personal notes) — CEO-only via Telegram
- Public info (product catalog, company hours, policy) — anyone

Real merchant scenario driving this design: merchant has a Zalo group of 15 employees + a "sổ tay nhân viên" PDF. Staff should be able to ask bot `"chính sách nghỉ thai sản là gì?"` in the employee group; customers in other groups must NOT see that file.

## 2. Goal + Non-goals

### In scope (v2.4.0)

- **3-tier file visibility**: `public` / `internal` / `private`
- **Per-file assignment** at upload time via Dashboard UI + post-upload inline edit
- **Zalo group internal flag** — merchant marks groups as "internal team" via Dashboard
- **RAG retrieval filter** enforced at SQL level across all 3 search tiers (vector rank, FTS5 MATCH, Tier 3 LIKE)
- **Migration path** — existing files backfill as `public` (safe default matching prior behavior)

### Out of scope (defer)

- Multi-agent architecture — single-agent with access-filtered context suffices for target scale (<50 staff per merchant)
- Department / role granularity — binary staff-vs-customer via group flag only; no sub-roles (sales/HR/finance) in v2.4.0
- Per-user ACL — all members of an internal group share identical access
- Dynamic visibility (time-based, event-based)
- Encryption at rest for private files — filesystem ACL (user-scoped Electron userData dir) is defense-in-depth enough. **Private ≠ encrypted; private = bot query filter only. See §8.3 for metadata leak note.**

## 3. Data model

### 3.1 SQLite — `documents` table

Current schema (verified at [main.js:15279-15290](../../electron/main.js#L15279-L15290)):
```sql
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  content TEXT,
  filetype TEXT,
  filesize INTEGER,
  word_count INTEGER,
  category TEXT DEFAULT 'general',
  summary TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Change**: add `visibility` column. Apply in BOTH places (defense-in-depth against partial schema corruption):

1. **CREATE TABLE additions** — add to the fresh-install schema literal so new tables have the column from the start:
   ```sql
   visibility TEXT NOT NULL DEFAULT 'public'
   ```
   Omit CHECK constraint from CREATE TABLE (SQLite ALTER doesn't reliably add CHECK; we enforce at write path instead — see §3.1.2).

2. **Idempotent ALTER** — for upgrade path, add column via try/catch pattern matching the sibling calls at [main.js:15295-15296](../../electron/main.js#L15295-L15296):
   ```js
   try { db.exec(`ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`); } catch {}
   ```

**Why split**: fresh install runs CREATE TABLE (not ALTER), so the column must be in the literal. Upgrade install already has the table but no column → ALTER runs. Belt-and-suspenders: both paths end with the column present.

#### 3.1.1 Backfill semantics

`ADD COLUMN ... DEFAULT 'public'` — SQLite stores DEFAULT at the table-schema level. Existing rows return `'public'` when selected (SQLite substitutes DEFAULT for missing-NULL on read). This is NOT a physical backfill — rows aren't rewritten. But the observable behavior is "every pre-upgrade row has visibility='public'".

If we later need ACTUAL backfill (e.g., for index support), do `UPDATE documents SET visibility='public' WHERE visibility IS NULL`. Not needed for v2.4.0.

#### 3.1.2 Enum enforcement

Since ALTER doesn't reliably propagate CHECK constraints across bundled SQLite versions, enforce enum **at write path**:

- IPC handlers (`upload-knowledge-file`, `set-knowledge-visibility`) validate input against `['public', 'internal', 'private']` before INSERT/UPDATE
- Any other code writing to `documents.visibility` MUST go through helper `validateVisibility(v)` that throws on invalid input
- Fuzz-style test in smoke suite: attempt INSERT with `'INVALID'` via handler → must return error response (not silently store)

### 3.2 Zalo group internal flag

**Current schema** (verified at [main.js:10116-10120](../../electron/main.js#L10116-L10120) — `save-zalo-manager-config` handler):
```json
{
  "<groupId>": { "mode": "off" | "mention" | "all" }
}
```

Save handler rejects entries without valid `mode`. `enabled` field does NOT exist (spec v1 was wrong).

**Change**: add optional `internal` field within the same object:
```json
{
  "<groupId>": {
    "mode": "mention",
    "internal": true
  }
}
```

#### 3.2.1 Save handler whitelist update

Current save handler iterates groups and stores entry only if `mode` is valid. Update: after `mode` validation passes, ALSO copy `internal` flag (typed boolean) to the stored entry:

```js
// Existing (simplified):
if (!gs || !gs.mode) continue;
if (!['off', 'mention', 'all'].includes(gs.mode)) continue;
existing[gid] = { mode: gs.mode };
// NEW — add AFTER existing mode check, BEFORE existing[gid] =:
const sanitized = { mode: gs.mode };
if (gs.internal === true) sanitized.internal = true;
existing[gid] = sanitized;
```

Reason for `=== true` (not truthy): prevents accidental `internal: 1` or `internal: "yes"` from getting stored as ambiguous truthy. Only literal boolean `true` → flagged. Anything else (false, undefined, string) → flag not stored, default `false`.

**Forgiving read**: absence of `internal` field = `false`. No migration needed for existing groups.

## 4. Upload UI

### 4.1 Upload modal (Dashboard → Knowledge → Upload)

Add section ABOVE category dropdown:

```
┌─ Ai được thấy file này? ──────────────────────────────────┐
│  (•) Công khai — mọi khách hàng thấy                      │
│      (mặc định — bảng giá, catalog, chính sách)           │
│                                                            │
│  ( ) Nội bộ — CEO + nhân viên nội bộ                      │
│      (sổ tay NV, SOP, quy định chỉ nhân viên cần biết)    │
│                                                            │
│  ( ) Chỉ mình tôi — chỉ CEO qua Telegram                  │
│      (ghi chú cá nhân, info tài chính, giá nhập...)       │
└────────────────────────────────────────────────────────────┘
```

**Default selection**: `Công khai` on modal open.

**Nudge logic**: when user picks `Nhân viên` from category dropdown → modal preselects `Nội bộ` radio if user has NOT yet interacted with the visibility radio. Once user manually selects any visibility, category changes do NOT override. Implementation: track `_visibilityUserTouched` boolean in modal state; nudge only fires while `false`.

### 4.2 IPC contract — upload with visibility

Current signature (verified at [main.js:15631](../../electron/main.js#L15631)):
```js
ipcMain.handle('upload-knowledge-file', async (_event, { category, filepath, originalName }) => {...})
```

**Change**: accept new optional param `visibility`:
```js
ipcMain.handle('upload-knowledge-file', async (_event, { category, filepath, originalName, visibility = 'public' }) => {
  if (!['public', 'internal', 'private'].includes(visibility)) {
    return { success: false, error: 'Invalid visibility value' };
  }
  // ... existing insert with visibility included in column list
});
```

**Preload bridge — REQUIRES SIGNATURE CHANGE** (`electron/preload.js:104`):

Current (positional args):
```js
uploadKnowledgeFile: (category, filepath, originalName) =>
  ipcRenderer.invoke('upload-knowledge-file', { category, filepath, originalName }),
```

Must change to accept `visibility`:
```js
uploadKnowledgeFile: (category, filepath, originalName, visibility = 'public') =>
  ipcRenderer.invoke('upload-knowledge-file', { category, filepath, originalName, visibility }),
```

Renderer call sites in dashboard.html must pass visibility as 4th positional arg. Backwards-compat: if renderer on old version doesn't pass 4th arg, `visibility='public'` default.

**Three existing INSERT paths** — each must include `visibility` column:

1. **`backfillKnowledgeFromDisk` at [main.js:15461](../../electron/main.js#L15461)** — disk-scan backfill. Insert with `visibility='public'` (safe default). Emit audit `visibility-backfill-default`.
2. **`upload-knowledge-file` IPC handler at [main.js:15681](../../electron/main.js#L15681)** — user upload via Dashboard. Insert with `visibility` from IPC param (validated enum).
3. **`index-document` IPC handler at [main.js:16890](../../electron/main.js#L16890)** — programmatic indexing (bot-triggered). Insert with `visibility='public'` default unless handler is extended to accept a visibility param (future).

Implementation approach: extract these 3 sites behind a single helper `insertDocumentRow({filename, filepath, content, filetype, filesize, wordCount, category, summary, visibility})`. Helper becomes the only SELECT-column-list manager for the documents table. Prevents future INSERT from forgetting `visibility` and silently getting NULL (which — per §3.1 — would hit the DEFAULT `'public'` = safe but semantically imprecise).

### 4.3 File list row — visibility badge + inline edit

Each file row shows a visibility badge next to filename:
- `Công khai` — gray pill, globe icon
- `Nội bộ` — amber pill, users icon
- `Chỉ CEO` — red pill, lock icon

Click badge → small dropdown inline-editor → select new value → PATCH via `set-knowledge-visibility` IPC.

**New IPC handler** `set-knowledge-visibility`:
```js
ipcMain.handle('set-knowledge-visibility', async (_event, { docId, visibility }) => {
  if (!Number.isInteger(docId)) return { success: false, error: 'Invalid docId' };
  if (!['public', 'internal', 'private'].includes(visibility)) {
    return { success: false, error: 'Invalid visibility value' };
  }
  const db = getDocumentsDb();
  const info = db.prepare('UPDATE documents SET visibility=? WHERE id=?').run(visibility, docId);
  if (info.changes === 0) return { success: false, error: 'Document not found' };
  auditLog('visibility-change', { docId, visibility, ts: Date.now() });
  return { success: true };
});
```

**Preload bridge additions** (`electron/preload.js`):
```js
setKnowledgeVisibility: (docId, visibility) => ipcRenderer.invoke('set-knowledge-visibility', { docId, visibility }),
```

**Audit log entry** format: `{ event: 'visibility-change', docId, visibility, ts }` in `logs/audit.jsonl`. Forensic only in v2.4.0; not surfaced in UI.

## 5. Group management UI

### 5.1 Dashboard — Zalo tab → Group list row

Current row structure (observed at dashboard.html zalo-groups-list — per-row shows icon + name + mode dropdown). No `enabled` checkbox exists (spec v1 was wrong).

**Add**: checkbox "Nội bộ" to the right of the mode dropdown.

```
┌──────────────────────────────────────────────────────────┐
│ [icon] Tên group    │ Chế độ: [mention ▼]  │ □ Nội bộ   │
└──────────────────────────────────────────────────────────┘
```

**Tooltip**: "Nếu tick, nhân viên trong group này truy cập được file Nội bộ. Group khách hàng để trống."

**Save flow**: existing `save-zalo-manager-config` IPC (per §3.2.1 update). Toast on save: "Đã lưu. N group nội bộ."

## 6. Retrieval logic

### 6.1 Shared group-settings helper — NEW patch block

**Problem**: RAG patch needs to know if current message's thread is flagged internal. The existing group-settings patch (v7) reads `zalo-group-settings.json` inline for mode decisions but does NOT expose the result to the RAG patch block. The two patches are lexically separate.

**Solution**: introduce new shared helper patch `ensureZaloGsHelperFix` that injects a helper function at the TOP of inbound.ts (before any other patches). The helper reads `zalo-group-settings.json` with file-mtime caching (per-message freshness) and exposes:

```typescript
// Injected at top of inbound.ts via ensureZaloGsHelperFix (NEW)
// === 9BizClaw GS-HELPER PATCH v1 ===
function __mcReadGroupSettings(): Record<string, { mode?: string; internal?: boolean }> {
  try {
    const fs = require('fs');
    const path = require('path');
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const candidates: string[] = [];
    if (process.env['9BIZ_WORKSPACE']) candidates.push(path.join(process.env['9BIZ_WORKSPACE'], 'zalo-group-settings.json'));
    if (process.platform === 'darwin') {
      candidates.push(path.join(home, 'Library', 'Application Support', '9bizclaw', 'zalo-group-settings.json'));
    } else if (process.platform === 'win32') {
      candidates.push(path.join(process.env.APPDATA || '', '9bizclaw', 'zalo-group-settings.json'));
    } else {
      candidates.push(path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), '9bizclaw', 'zalo-group-settings.json'));
    }
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch {}
    }
  } catch {}
  return {};
}
// === END 9BizClaw GS-HELPER PATCH v1 ===
```

**Helper placement**: injected as FIRST patch in the batch (before blocklist). Anchor: verified real import line at top of inbound.ts is:
```
import {
  createChannelPairingController,
  createChannelReplyPipeline,
  logInboundDrop,
  resolveControlCommandGate,
  type OpenClawConfig,
  type ReplyPayload,
  type RuntimeEnv,
} from "../api.js";
```

Use multi-line anchor match on `'from "../api.js";'` (unique in file). Inject helper IMMEDIATELY AFTER this line (module-scope, outside any function). Idempotency: wrap with `// === 9BizClaw GS-HELPER PATCH v1 ===` ... `// === END 9BizClaw GS-HELPER PATCH v1 ===` markers. On re-inject, strip existing v1 block before injecting fresh (same pattern as RAG patch strip loop at main.js:4052).

**Cross-patch dependency warning**: group-settings v7 patch and RAG v9 patch BOTH call `__mcReadGroupSettings()` from this helper. If `ensureZaloGsHelperFix` fails (e.g., anchor not found in a future plugin upgrade), the other two patches would reference an undefined function → TypeScript compile fails → plugin disabled → bot silent.

**Mitigation — inline fallback**: both group-settings v7 and RAG v9 patches MUST guard the call using the `(global as any)` pattern already established in inbound.ts (e.g. `__mcSenderDedup`). TypeScript strict mode rejects bare `typeof undeclaredName` — the `global as any` indirection avoids the check:
```typescript
const __mcGsFn = (global as any).__mcReadGroupSettings;
const __mcGs = typeof __mcGsFn === 'function' ? __mcGsFn() : {};
```
This way if helper injection fails, patches degrade gracefully (treat all groups as customer-default) rather than hard-crash. Matches the pre-existing `(global as any).__mcSenderDedup` pattern elsewhere in inbound.ts.

**Both patches use it**:
- Existing group-settings v7 patch: refactor to call `__mcReadGroupSettings()` internally (simplifies its own code; single file-read logic in one place)
- New RAG patch v9: calls `__mcReadGroupSettings()` to determine audience

**Patch ordering in `_startOpenClawImpl`** (verified at [main.js:6679-6680](../../electron/main.js#L6679-L6680)):
```
1. ensureZaloGsHelperFix   ← NEW, runs FIRST (prepends at import anchor, so appears BEFORE everything else in the file)
2. ensureZaloBlocklistFix
... (existing order)
8. ensureZaloGroupSettingsFix  (consumes helper)
9. ensureZaloRagFix            (consumes helper)  ← UPGRADED to v9
```

**Cache strategy**: for now, NO cache — read file per message. At < 1ms for a 10-group settings file this is fine. Add mtime caching if profiling shows hot-path (< 100 msgs/sec is our target scale, nowhere near contention).

### 6.2 Audience detection in RAG patch v9

Inside the RAG patch v9 block:

```typescript
// Existing v8 starts the try/catch; v9 adds audience detection BEFORE HTTP call
const __gs = __mcReadGroupSettings();
let __audience = 'customer';
if (message.isGroup && message.threadId) {
  const groupCfg = __gs[message.threadId];
  if (groupCfg?.internal === true) __audience = 'internal';
}
// Log for debug (volume-rated — only when we DO escalate to internal)
if (__audience === 'internal') {
  runtime.log?.(`openzalo: audience=internal for thread ${message.threadId}`);
}
```

**Variable names verified**: existing v7 patch (at main.js:~3913) uses `message.isGroup` and `message.threadId`. Spec v1 used `threadInfo` — wrong. Corrected in v2.

**DM behavior**: DMs never have `isGroup=true`, so audience stays `'customer'` for all DMs. Employees asking bot in DM get customer treatment — intentional. No audit leak into internal group.

### 6.3 HTTP query — `/search` endpoint audience param

Current handler (verified at [main.js:16727+](../../electron/main.js#L16727)):
- Path: `/search`
- Params: `q`, `k`, optional `cat`
- Auth: Bearer token (mandatory — §8.1)

**Change**: add optional `audience` param:
```
GET /search?q=...&k=3&audience=customer|internal
```

**Parse rule in handler**:
```js
const rawAudience = url.searchParams.get('audience');
const audience = (rawAudience === 'internal') ? 'internal' : 'customer';
// Any other value (including missing, 'ceo', 'admin', 'null') → 'customer' (fail closed)
```

**RAG v9 inbound.ts** must append to URL:
```typescript
const __ragUrl = `http://127.0.0.1:20129/search?q=${encodeURIComponent(__ragQ)}&k=3&audience=${__audience}`;
```

### 6.4 `searchKnowledge` + `searchKnowledgeFTS5` filter — 4 SQL locations

**Two functions share the workload**:
- `searchKnowledge` at [main.js:16254](../../electron/main.js#L16254) — vector/cosine path (1 SQL location, 2 prepared statements branched on category)
- `searchKnowledgeFTS5` at [main.js:15952](../../electron/main.js#L15952) — FTS5 path with 3 internal tiers (expanded MATCH → bare MATCH → LIKE fallback = 3 SQL locations, some sharing a query template)

Total: 4 SQL locations need the filter.

**Both function signatures accept `audience`**:
```js
async function searchKnowledge({ query, category, limit, audience = 'customer' } = {}) {...}
function searchKnowledgeFTS5({ query, category, limit, audience = 'customer' } = {}, sharedDb) {...}
```

Inside both: compute `allowedTiers`:
```js
const allowedTiers = audience === 'ceo'      ? ['public', 'internal', 'private']
                   : audience === 'internal' ? ['public', 'internal']
                                             : ['public'];  // customer default — covers missing/invalid
const visPlaceholders = allowedTiers.map(() => '?').join(',');
```

---

**Location 1 — searchKnowledge vector path (verified at [main.js:16298-16310](../../electron/main.js#L16298-L16310))**

Current SQL (exact copy from code):
```sql
SELECT c.id, c.document_id, c.chunk_index, c.char_start, c.char_end, c.embedding, d.filename, d.content
FROM documents_chunks c JOIN documents d ON d.id = c.document_id
WHERE c.category = ? AND c.embedding IS NOT NULL         -- category branch
ORDER BY c.id DESC LIMIT 2000

-- OR --

SELECT c.id, c.document_id, c.chunk_index, c.char_start, c.char_end, c.embedding, d.filename, d.content
FROM documents_chunks c JOIN documents d ON d.id = c.document_id
WHERE c.embedding IS NOT NULL                            -- no-category branch
ORDER BY c.id DESC LIMIT 2000
```

New — add `d.visibility IN (...)` to WHERE on both branches, bind `allowedTiers` first:
```sql
SELECT c.id, c.document_id, c.chunk_index, c.char_start, c.char_end, c.embedding, d.filename, d.content
FROM documents_chunks c JOIN documents d ON d.id = c.document_id
WHERE d.visibility IN (?,?,?)  -- allowedTiers expanded
  AND c.category = ? AND c.embedding IS NOT NULL
ORDER BY c.id DESC LIMIT 2000
```

(and matching for no-category branch — drop the `c.category = ?` clause but keep visibility filter).

Bind param order: `...allowedTiers, category, ...` for category branch; `...allowedTiers` for no-category branch.

---

**Location 2 — searchKnowledgeFTS5 baseSelect template ([main.js:15970-15981](../../electron/main.js#L15970-L15981))**

Current SQL (exact copy):
```sql
SELECT dc.id AS chunk_id, dc.document_id, dc.category, dc.chunk_index,
       dc.char_start, dc.char_end, d.filename, d.title,
       bm25(documents_chunks_fts) AS score,
       highlight(documents_chunks_fts, 0, '<b>', '</b>') AS snippet
FROM documents_chunks_fts
JOIN documents_chunks dc ON dc.id = documents_chunks_fts.rowid
JOIN documents d ON d.id = dc.document_id
WHERE documents_chunks_fts MATCH ?
  [AND dc.category = ?]  -- optional via catClause
ORDER BY bm25(documents_chunks_fts) LIMIT ?
```

Add `AND d.visibility IN (...)` to the WHERE clause:
```sql
...
WHERE documents_chunks_fts MATCH ?
  AND d.visibility IN (?,?,?)  -- allowedTiers
  [AND dc.category = ?]
ORDER BY bm25(documents_chunks_fts) LIMIT ?
```

This template is used by BOTH Tier 1 (expanded MATCH) and Tier 2 (bare MATCH) inside `searchKnowledgeFTS5` — same function, both `tryMatch` invocations. Adding once to `baseSelect` covers both tiers.

Bind order in `tryMatch`: `[expr, ...allowedTiers, ...(category ? [category] : []), lim]`.

---

**Location 3 — searchKnowledgeFTS5 Tier 3 LIKE fallback ([main.js:16020-16029](../../electron/main.js#L16020-L16029))**

Current SQL (exact copy):
```sql
SELECT NULL AS chunk_id, d.id AS document_id, d.category, 0 AS chunk_index,
       0 AS char_start, 0 AS char_end, d.filename, d.title,
       999.0 AS score,
       substr(d.content, 1, 300) AS snippet
FROM documents d
WHERE (d.content LIKE ? OR d.filename LIKE ?)
  [AND d.category = ?]
LIMIT ?
```

Add `d.visibility IN (...)`:
```sql
...
FROM documents d
WHERE d.visibility IN (?,?,?)
  AND (d.content LIKE ? OR d.filename LIKE ?)
  [AND d.category = ?]
LIMIT ?
```

This was spec v1's missed leak path. v2/v3 closes it.

---

**Why all 4 locations matter**: Tier 1 vector search is the "normal" path. When embeddings are partial (mid-backfill, see comment at main.js:~15042) OR embedder fails cold-start, `searchKnowledge` internally falls back to `searchKnowledgeFTS5`. The FTS5 path runs its OWN 3-tier cascade. A customer query COULD enter via any of the 4 SQL locations depending on state. Missing filter on any = leak.

**Bind param ordering**: since `allowedTiers` is prepended to existing params, update all call sites to bind `allowedTiers` FIRST, then existing params. Use a helper:

```js
function bindFilteredSearch(stmt, allowedTiers, ...rest) {
  return stmt.bind(...allowedTiers, ...rest);
}
```

### 6.5 Call sites of `searchKnowledge` / `searchKnowledgeFTS5`

Confirmed call sites (grep result, must all be updated):

1. **HTTP `/search` endpoint** at [main.js:16727](../../electron/main.js#L16727) — public bot-facing entry. Pass `audience` from URL `?audience=` param (parsed per §6.3, fail-closed to `'customer'`).
2. **`knowledge-search` IPC handler** at [main.js:16573](../../electron/main.js#L16573) — Dashboard "Test search" + bot-triggered internal search. This handler is trusted (only CEO-owned Dashboard can invoke). Pass `audience='ceo'` (no filter) so CEO testing sees all tiers.
3. **Internal fallback from `searchKnowledge` → `searchKnowledgeFTS5`** (mid-function at main.js:~16276 when embeddings partial during backfill, or catch-path on vector failure) — when `searchKnowledge` invokes `searchKnowledgeFTS5` internally, it MUST forward its own `audience` param. Implementation: propagate via function arg explicitly (no hidden state).

Invariant: every `searchKnowledge(` or `searchKnowledgeFTS5(` call site must explicitly pass `audience`. Grep-able rule enforced in code review. Default `'customer'` in signature is for defense only; relying on default = bug in caller.

## 7. Migration path (v2.3.48 → v2.4.0)

### 7.1 First boot after upgrade

1. `initDocumentsDb()` runs `CREATE TABLE IF NOT EXISTS documents (...)` — no-op (table exists). Then runs the new `ALTER TABLE documents ADD COLUMN visibility ...` in try/catch — adds column with default `'public'`
2. Existing rows: SELECT returns `visibility='public'` for all (SQLite substitutes DEFAULT for missing-NULL)
3. `zalo-group-settings.json` unchanged; reads are tolerant of missing `internal` field (defaults `false`)
4. Inbound.ts patches: existing v8 stripped by v9 re-inject logic (extend strip loop to include `v8`, same pattern as main.js:4052); new GS-helper patch injected

### 7.2 CEO notice (non-blocking UX nudge)

First open of Knowledge tab after v2.4.0 upgrade — show banner:

> **Mới v2.4.0**: anh/chị giờ có thể chọn file nào KHÁCH thấy, file nào CHỈ NHÂN VIÊN hoặc CHỈ CEO. Mặc định mọi file hiện tại là Công khai — vào tab Knowledge xem lại file nào cần đánh dấu lại.

Banner dismiss-once via localStorage key `v2.4.0-knowledge-visibility-seen`. Key namespace `v2.4.0-` avoids collision with existing localStorage keys (verified: `theme`, `onboard-dismissed`, `walkthrough-seen-v1` — no conflict).

### 7.3 Telegram boot ping mentions feature

Add 1 line to existing boot ping message (subject to same throttle at [main.js:7176](../../electron/main.js#L7176) — `.boot-ping-ts.json`, `READY_NOTIFY_THROTTLE_MS = 30 min` per-channel, verified):

> Mới: file Knowledge có 3 tầng Công khai / Nội bộ / Chỉ CEO. Vào Dashboard để cấu hình.

### 7.4 Downgrade / rollback

**v2.4.0 → v2.3.48 rollback scenario**:

1. **Database** — `visibility` column persists (SQLite doesn't drop columns on binary downgrade). v2.3.48 SELECT statements use explicit column lists (verified: no `SELECT * FROM documents` in v2.3.48 code) → new column ignored, zero data loss.

2. **inbound.ts** — if v2.4.0 patched plugin file with v9 RAG block (includes `audience` URL param), v2.3.48 gateway/main.js `/search` handler ignores unknown `audience` param and returns all-public results. **BUT**: v9 patch references `__mcReadGroupSettings` helper which only exists if GS-helper patch is also present. v2.3.48's patch logic doesn't know about GS-helper → left in place but unused. Plugin TS compiles fine (helper defined before use). **No crash; behavior gracefully degrades.**

3. **Required rollback action**: none. User uninstalls v2.4.0 → installs v2.3.48 → existing patched inbound.ts still works. If user wants COMPLETE clean rollback, manual delete of `~/.openclaw/extensions/openzalo/src/inbound.ts` triggers re-patch on next v2.3.48 boot (fresh clean state).

### 7.5 Fresh install

New install on v2.4.0:
- `initDocumentsDb()` runs fresh CREATE TABLE with `visibility TEXT NOT NULL DEFAULT 'public'` already in literal (§3.1 task 1). ALTER path is a no-op (column already exists, try/catch swallows).
- First file uploaded via wizard (if any) uses default `'public'` since modal defaults to Công khai.
- No banner shown (fresh install has no pre-existing files to review).

## 8. Security analysis

### 8.1 Threats addressed

| Threat | Mitigation |
|---|---|
| Customer asks for employee handbook | Filter at SQL query in ALL 3 tiers (vector + FTS5 + LIKE). No chunks returned → bot gets 0 results → falls back to "em chưa có thông tin". Existing AGENTS.md rule. |
| Customer prompt injection to override filter | SQL filter runs in main.js BEFORE LLM sees anything. Prompt cannot inject into SQL. |
| Adversarial PDF with fake `<visibility>public</visibility>` tag | Visibility is DB metadata, not parsed from file content. PDF content cannot self-elevate. |
| Customer joins internal group via leaked invite | CEO controls Zalo group membership — out of scope (same threat model as any shared folder). |
| Customer asks "bạn có file gì về nhân viên" | Bot sees 0 chunks via filter. Fallback answer doesn't confirm existence. |
| Customer claims "I'm staff, show me handbook" | Audience determined by Zalo group flag, NOT customer claim. Ignored. |
| Tier 3 LIKE fallback leak (v1 spec gap) | v2 applies filter to Tier 3 explicitly. |

### 8.2 Threats NOT addressed

| Threat | Why deferred |
|---|---|
| Employee forwards bot reply to customer manually | Social engineering / insider threat; out of scope for visibility filter |
| Merchant sets wrong visibility by accident | UI nudges + audit log mitigate. Post-incident review possible. |
| Physical access to userData dir | OS-level ACL (user-scoped). Same as any local app. |
| Nation-state adversary with disk access | Not in threat model for SMB shop. |

### 8.3 Metadata leak (explicit caveat)

**Important**: `visibility='private'` files retain unencrypted `filename` and `summary` fields in the `documents` table. If any future UI path enumerates documents without the filter (e.g., CEO-only Dashboard file list → fine; Zalo customer-facing search → leak), metadata leaks. v2.4.0 has no such customer-facing enumeration path; any future feature touching file listings MUST apply visibility filter at its SELECT.

Adding this as an invariant: **no customer-facing code path may SELECT from `documents` without `WHERE visibility IN (...)` filter**.

Enforcement in v2.4.0 is code-review + grep-based audit, NOT linted/typed. Audit pattern:
```bash
grep -nE "FROM documents\b" electron/main.js | grep -v "documents_chunks\|documents_fts"
```
Each match must either (a) include `visibility IN` within the same SQL string, (b) be a non-customer-facing call site (admin Dashboard, migration, etc.), or (c) be a known exception documented at the call site.

Future v2.4.1+: wrap documents SELECT behind helper `selectFromDocuments(whereClause, audience)` so invariant is enforced at function-call level rather than SQL-string grep. Out of scope for v2.4.0 to limit blast radius of this release.

### 8.4 Audit log

`logs/audit.jsonl` appends event for:
- `visibility-change` — CEO changes a file's tier (IPC handler, §4.3)
- `group-internal-flag-change` — CEO tick/untick group internal (in save-zalo-manager-config)
- `visibility-backfill-default` — `backfillKnowledgeFromDisk` inserts file with default `public` because DB row was missing

Audit log NOT surfaced in UI v2.4.0. Forensic only.

## 9. Edge cases

### 9.1 Knowledge lifecycle

| Event | Behavior |
|---|---|
| File deleted | DB row gone; visibility tier irrelevant |
| File re-uploaded (same filename, new content) | Old row deleted, new row inserted with user-chosen visibility from modal |
| File category changed | Visibility PRESERVED (doesn't auto-change) |
| Merchant moves file via OS file explorer (outside Dashboard) | `backfillKnowledgeFromDisk()` on next boot inserts row with `visibility='public'`. Audit log entry emitted. Merchant sees banner reminder. |
| Bot auto-generates file (vision OCR output) | Insert with `visibility='public'` (matches upload default). Merchant can retag via inline edit. |
| Upload with 0 extractable chunks (scanned PDF failing OCR) | `documents` row created with chosen visibility. `documents_chunks` has 0 entries for this doc. RAG never retrieves it (no chunks → no hit). **Metadata still in `documents.filename/summary`** — never exposed to customer because filter applies to any Dashboard/HTTP code reading `documents` table. |
| Concurrent upload + immediate visibility edit | Upload INSERTs row with chosen visibility atomically. `set-knowledge-visibility` IPC UPDATE fires after INSERT returns (renderer-driven). SQLite row-level consistency: race window is the time between IPC completion and renderer update dispatch — in practice <10ms. No torn read possible. |

### 9.2 Group lifecycle

| Event | Behavior |
|---|---|
| Merchant removes group from Zalo | zalo-group-settings.json has stale entry; next message from unknown group gets no matching entry → audience stays `customer` (safe default) |
| New group discovered | Existing Zalo auto-discovery adds entry with `mode: 'mention'`, no `internal` field → reads as `internal=false` (customer) |
| Group member joins/leaves | Access is automatic via group membership — no per-user record. Leaves group → loses access immediately at Zalo layer. |
| Merchant un-ticks `internal` mid-conversation | Next incoming message reads settings file fresh → sees `internal=false` → audience downgrades to `customer`. Already-in-flight message: reads settings at its own per-message read → may see old value (race window ~100ms). Acceptable; merchant intent is retroactive to future traffic, not in-flight. |

### 9.3 Retrieval edge cases

| Scenario | Behavior |
|---|---|
| Query matches public + internal + private, audience=customer | Tier 1/2/3 filter keeps only `public` → RRF rank runs on reduced set |
| Query matches ONLY internal chunks, audience=customer | 0 results → AGENTS.md fallback "em chưa có thông tin" → CEO escalation if applicable |
| Query matches both, audience=internal | Public + internal ranked together via RRF |
| Tier 2 query rewrite fires | Rewrite is client-side on rawBody; doesn't affect DB filter. Filter always applies. |
| Circuit breaker tripped | RAG skipped entirely — all tiers skipped, no SQL runs. Falls back to no-knowledge answer. Same as pre-v2.4.0 degraded behavior. |
| Search with audience param missing | Handler defaults to `customer` (fail closed). v2.3.48 client sending old URL → treated as customer. ACCEPTABLE degradation. |
| Search with invalid audience value ("admin", "ceo", "internal ") | Handler treats as customer. Does NOT throw — graceful fallback. |

### 9.4 Concurrency & atomicity

| Scenario | Resolution |
|---|---|
| CEO changing file visibility mid-customer-message | HTTP /search runs SQL SELECT after IPC SET. SELECT opens own connection — sees latest committed value. Maximum race window: IPC SET commit + RAG handler issues SELECT = ~20ms. For THIS particular message already in-flight through RAG, see 9.5. |
| Concurrent upload from 2 Dashboard windows | Both INSERTs go to DB, SQLite WAL mode serializes. Second file inserted after first — no collision. |
| RAG patch re-injection during boot vs HTTP server startup | F1 fix ensures secret written before `startOpenClaw`. HTTP server starts after gateway ready (post-whenReady chain). Windows still closes before first message. |

### 9.5 In-flight RAG race (documented, accepted)

If a customer message ALREADY retrieved chunks + built prompt + sent to LLM when CEO changes file Public→Private, the LLM response may include content from the now-private file. This is accepted because:

1. Redacting already-sent chunks is infeasible (agent is mid-generation, streaming tokens).
2. Customer already has the prompt context in their chat — "un-sending" is privacy-theater.
3. Future RAG calls (next customer message) respect new value.

Window: ~10-30s between prompt assembly and LLM completion. CEO should treat "set Private" as a forward-looking action, not retroactive. Spec-level acceptance; not a bug.

## 10. Backward compatibility

### 10.1 Forward compat (v2.4.0 → v2.4.1+)

- Column `visibility` stays. Future versions can add more tiers (e.g., `vip`) by extending enum; filter stays composable.
- `zalo-group-settings.json` `internal` field stays; future additions (e.g., `department: "sales"`) nest inside same object.

### 10.2 Backward compat (v2.4.0 → v2.3.48 rollback)

See §7.4.

### 10.3 Export / import

**Existing export** (`Dashboard → Support FAB → Xuất dữ liệu`): inspection required during implementation to confirm it includes:
- `memory.db` (yes — core export) → `documents.visibility` preserved automatically
- `zalo-group-settings.json` (unknown — implementation task 1 verification: grep export handler for this filename; include if missing)

**Import flow**: database binary imported → visibility intact. Group settings file imported → `internal` flags restored.

**Fail-safe**: if export omits `zalo-group-settings.json`, all restored groups default `internal=false` (customer). Safe fail mode — merchant must re-tick internal groups post-restore. Acceptable for v2.4.0 (TODO v2.4.1: verify export completeness).

## 11. Testing strategy

### 11.1 Smoke tests (pre-build gate)

Add to `electron/scripts/smoke-test.js` (or new `smoke-visibility.js` — consistent with existing split):

1. **Schema — fresh install** — create fresh in-memory SQLite, run CREATE TABLE with visibility in literal, assert column exists, default is `'public'`
2. **Schema — upgrade** — create in-memory SQLite with v2.3.48 schema (no visibility column), run ALTER migration, assert column exists, existing rows return `'public'` on SELECT
3. **Enum — invalid value via IPC** — call `upload-knowledge-file` with `visibility='PUBLIC'` (uppercase — invalid) → expect `{success: false, error: 'Invalid visibility value'}`
4. **Filter — customer** — fixtures: 3 files with tiers (public, internal, private). Call `searchKnowledge({query: 'test', audience: 'customer'})` → assert ONLY public file returned
5. **Filter — internal** — same fixtures; `audience: 'internal'` → assert public + internal (NOT private)
6. **Filter — ceo (no filter)** — fixtures; `audience: 'ceo'` → assert all 3 returned
7. **Filter — missing audience defaults to customer** — omit audience param → assert customer behavior
8. **Filter — Tier 3 LIKE path** — force circuit breaker / break FTS5, verify LIKE fallback still applies visibility filter (no leak)
9. **Group settings — internal flag** — write zalo-group-settings.json with `{group1: {mode:'all', internal: true}, group2: {mode:'all'}}`, call `__mcReadGroupSettings()` simulation, assert group1 internal=true, group2 internal=undefined (treated as false)
10. **Save handler — internal flag** — POST to save-zalo-manager-config with `{group1: {mode:'all', internal: true}}` → read file → assert `internal: true` persisted
11. **Save handler — internal non-bool** — POST with `internal: 'yes'` → assert field NOT stored (only literal `true` accepted)

### 11.2 Manual QA before ship

- [ ] Fresh install → upload 3 files (one per tier) → confirm Dashboard badges correct
- [ ] Upgrade v2.3.48 → confirm all files show `Công khai`, bot behavior unchanged for customers
- [ ] Create Zalo group, tick Nội bộ, upload Internal file → ask in that group → bot replies with content
- [ ] Same file from (3), ask in customer group → bot says "em chưa có thông tin"
- [ ] Change file Public → Internal → next customer message no longer sees it
- [ ] CEO Telegram asks about Private file → bot answers via direct file read (bypasses RAG HTTP)
- [ ] Rollback test: install v2.3.48 over v2.4.0 → verify bot still works (see §7.4)
- [ ] Export workspace → restore on fresh machine → verify visibility + internal flags both preserved
- [ ] Test 1000 concurrent search requests with mixed audience params → no SQL errors, filter correct

## 12. Rollout plan

### 12.1 Implementation order (~7 dev-hours focused work)

1. **DB migration** (20 min) — add to CREATE TABLE + idempotent ALTER
2. **INSERT helper consolidation** (45 min) — extract 3 verified call sites behind `insertDocumentRow` helper, add visibility column:
   - `backfillKnowledgeFromDisk` at [main.js:15461](../../electron/main.js#L15461) — default `visibility='public'`
   - `upload-knowledge-file` IPC at [main.js:15681](../../electron/main.js#L15681) — visibility from IPC param
   - `index-document` IPC at [main.js:16890](../../electron/main.js#L16890) — default `visibility='public'`
3. **IPC handlers** (45 min) — upload + set-knowledge-visibility, enum validation
4. **Preload bridge** (5 min) — signature change for `uploadKnowledgeFile` (add optional 4th positional arg `visibility`, default `'public'`) + 1 new method `setKnowledgeVisibility(docId, visibility)`
5. **RAG HTTP audience parse** (15 min)
6. **searchKnowledge filter — Tier 1** (20 min) — vector rank
7. **searchKnowledge filter — Tier 2** (30 min) — FTS5 3 sub-queries
8. **searchKnowledge filter — Tier 3** (15 min) — LIKE fallback
9. **GS-helper patch** (45 min) — new `ensureZaloGsHelperFix` injecting `__mcReadGroupSettings`
10. **RAG v9 patch rewrite** (45 min) — strip v8, inject v9 with audience detection + URL param
11. **Group settings save-handler update** (30 min) — whitelist `internal: true`
12. **Upload modal UI** (1 hr) — radio + nudge logic
13. **File list visibility badge** (1 hr) — pill rendering + inline editor
14. **Group row internal checkbox UI** (30 min)
15. **Migration banner + Telegram ping** (30 min)
16. **Smoke tests** (1.5 hr) — 11 assertions
17. **Manual QA** (1.5 hr)
18. **Audit log events** (20 min) — 3 event types
19. **Documentation** — release note v2.4.0 (30 min)

Total estimate: ~12 hours focused work (sum of listed task minutes = 725 min). Spec v1 underestimated at 7 hrs; v2/v3 upward revision reflects FTS5 complexity + INSERT helper refactor + 4 SQL locations (not 3) + preload signature change.

### 12.2 Release gating

- Smoke tests pass (blocks build)
- Manual QA checklist complete
- `docs/releases/v2.4.0.md` written with migration guidance
- Rollback tested on 1 real machine
- Export/import tested end-to-end

### 12.3 Observability post-release

- `logs/audit.jsonl` monitored for visibility-change patterns week 1
- CEO survey 1 week post-release: "Did you retag any files? Did bot correctly refuse customer queries for internal files?"

## 13. Resolved questions (closed during v2 revision)

1. **Chunk IDs in filtered-retrieval audit log?** → Log COUNT only in v2.4.0, not IDs. Sufficient for "N chunks hidden due to audience=customer" telemetry, zero content/structure leak.
2. **Enum value language?** → DB enum: English (`public`/`internal`/`private`) — stable API. UI labels: Vietnamese (`Công khai`/`Nội bộ`/`Chỉ mình tôi`).
3. **Retroactively redact from customer chat history when CEO sets Private?** → NO. Future-only. Documented in §9.5.

## 14. Non-goals (explicit)

- NOT building per-customer-Zalo-ID role
- NOT building department hierarchy (sales/HR/finance)
- NOT building file-content encryption at rest
- NOT building AI-auto-tagging of visibility
- NOT retroactively filtering chat history

---

**Spec status v2**: addressing all 12 blocking + 6 non-blocking issues from reviewer round 1. Pending re-review + user approval.
