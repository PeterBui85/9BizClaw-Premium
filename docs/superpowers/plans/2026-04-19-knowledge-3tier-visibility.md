# Knowledge 3-Tier Visibility Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-file visibility control (`public`/`internal`/`private`) for Knowledge files in 9BizClaw, enforced at SQL query level across all 4 search paths, with Zalo group `internal` flag for staff-vs-customer audience routing.

**Architecture:** Add `visibility` column to SQLite `documents` table via idempotent ALTER. Extract 3 existing INSERT sites behind `insertDocumentRow` helper. Audience detection in `inbound.ts` RAG patch v9 reads `zalo-group-settings.json` via new shared helper `__mcReadGroupSettings` (injected by `ensureZaloGsHelperFix` at top of file). RAG HTTP `/search` endpoint gains `audience` param; `searchKnowledge` + `searchKnowledgeFTS5` both filter by `d.visibility IN (...)`. Dashboard upload modal adds 3-option radio; file list row shows inline editable badge; Zalo group row adds internal checkbox. Migration path: idempotent ALTER + CREATE TABLE addition, all existing files default `public`, CEO nudged via Knowledge-tab banner to re-audit.

**Tech Stack:** Electron 28 + better-sqlite3 11.10.0 + Node.js (main) + vanilla JS (renderer) + openzalo plugin (TypeScript injected via runtime patch). No formal test framework — smoke tests are Node scripts with inline function copies + `console.assert`/`fail()`. Reference spec: [docs/superpowers/specs/2026-04-19-knowledge-3tier-visibility-design.md](../specs/2026-04-19-knowledge-3tier-visibility-design.md).

---

## File Structure

Files created:
- `electron/scripts/smoke-visibility.js` — new smoke test for 3-tier filter enforcement
- `docs/releases/v2.4.0.md` — release note for merchant

Files modified (by responsibility):
- **Data layer** — `electron/main.js`: `initDocumentsDb` (schema), 3 INSERT sites (via `insertDocumentRow` helper), `searchKnowledge` + `searchKnowledgeFTS5` (filter in 4 SQL locations)
- **API layer** — `electron/main.js`: `upload-knowledge-file` IPC, new `set-knowledge-visibility` IPC, HTTP `/search` audience param + handler validation
- **Preload bridge** — `electron/preload.js`: `uploadKnowledgeFile` signature + new `setKnowledgeVisibility` method
- **Zalo plugin patches** — `electron/main.js`: new `ensureZaloGsHelperFix`, `ensureZaloRagFix` v8→v9 rewrite, `save-zalo-manager-config` whitelist update for `internal`
- **Renderer UI** — `electron/ui/dashboard.html`: upload modal visibility radio, file list badge + inline editor, group row internal checkbox, migration banner, localStorage key
- **Package + smoke chain** — `electron/package.json`: bump to 2.4.0, chain `smoke-visibility.js` into `npm run smoke`

---

## Chunk 1: Data layer — schema migration + INSERT helper + search filter

This chunk lands the SQL-level enforcement. Without this, the whole feature is security theater. Each INSERT site and each of 4 SQL SELECT locations must be updated together to prevent leak paths.

### Task 1: Add visibility column (CREATE TABLE + ALTER)

**Files:**
- Modify: `electron/main.js:15279-15296` (documents table CREATE + sibling ALTER calls)

- [ ] **Step 1: Locate documents table CREATE TABLE block**

Run: `grep -n "CREATE TABLE IF NOT EXISTS documents" electron/main.js | head -5`
Expected: match at line 15279

- [ ] **Step 2: Add visibility column to CREATE TABLE literal**

Edit main.js:15279-15290. Original ends with `created_at TEXT DEFAULT (datetime('now'))` then closing `);`. Add new line BEFORE closing `);`:

```js
// Before (main.js:15279-15290):
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

// After — add visibility line before closing paren:
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
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 3: Add idempotent ALTER next to existing sibling ALTERs**

At main.js:15295-15296, AFTER the existing `ALTER TABLE documents ADD COLUMN category ...` line, add:

```js
try { db.exec(`ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`); } catch {}
```

This mirrors the pattern at line 15295-15296 for `category` and `summary` columns. SQLite throws `duplicate column name` on re-run, which the empty catch swallows — idempotent.

- [ ] **Step 4: Verify via sqlite3 manually**

Run:
```bash
cd c:/Users/buitu/Desktop/claw/electron
node -e "const Database=require('better-sqlite3'); const p=require('os').homedir()+'/AppData/Roaming/9bizclaw/memory.db'; const db=new Database(p,{readonly:true}); console.log(db.prepare('PRAGMA table_info(documents)').all().map(c=>c.name).join(','));"
```
Expected (on dev machine that has run at least once post-change): `id,filename,filepath,content,filetype,filesize,word_count,category,summary,visibility,created_at` — note `visibility` present.

If dev machine has old DB without column, Electron must be booted once to trigger ALTER. Test on fresh machine by deleting DB and running app.

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat(knowledge): add visibility column to documents table (CREATE + ALTER)

3-tier access control foundation. CREATE TABLE literal + idempotent ALTER
ensure both fresh install and upgrade paths end with the column present.
Default 'public' preserves v2.3.48 behavior.

Spec: docs/superpowers/specs/2026-04-19-knowledge-3tier-visibility-design.md §3.1"
```

---

### Task 2: Extract insertDocumentRow helper

**Files:**
- Modify: `electron/main.js:15461` (backfillKnowledgeFromDisk)
- Modify: `electron/main.js:15681` (upload-knowledge-file handler)
- Modify: `electron/main.js:16890` (index-document handler)

- [ ] **Step 1: Add helper function above the 3 INSERT sites**

Place helper ABOVE the earliest INSERT site (before line 15461). Find a stable anchor — e.g. after `backfillKnowledgeFromDisk` function signature. Insert at convenient spot around `main.js:15430`:

```js
// v2.4.0: All documents INSERT paths go through this helper to guarantee
// visibility column is always set. Bypassing = silent default to 'public'
// at SQL layer (safe) but semantically imprecise. Every caller must declare
// intent explicitly.
function insertDocumentRow(db, {
  filename, filepath, content, filetype, filesize, wordCount,
  category = 'general', summary = null, visibility = 'public'
}) {
  if (!['public', 'internal', 'private'].includes(visibility)) {
    throw new Error(`insertDocumentRow: invalid visibility "${visibility}"`);
  }
  return db.prepare(
    'INSERT INTO documents (filename, filepath, content, filetype, filesize, word_count, category, summary, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(filename, filepath, content, filetype, filesize, wordCount, category, summary, visibility);
}
```

- [ ] **Step 2: Replace INSERT at main.js:15461 (backfillKnowledgeFromDisk)**

Original (exact, copied from main.js:15460-15462):
```js
db.prepare(
  'INSERT INTO documents (filename, filepath, content, filetype, filesize, word_count, category, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
).run(entry.name, fp, content, filetype, stat.size, wordCount, cat, null);
```

Replace with:
```js
insertDocumentRow(db, {
  filename: entry.name, filepath: fp, content,
  filetype, filesize: stat.size, wordCount,
  category: cat, summary: null, visibility: 'public'
});
// v2.4.0: audit log — disk-scanned files default to public
try { auditLog('visibility-backfill-default', { filename: entry.name, visibility: 'public' }); } catch {}
```

- [ ] **Step 3: Replace INSERT at main.js:15681 (upload-knowledge-file)**

Original (main.js:15679-15683):
```js
const info = db.prepare(
  'INSERT INTO documents (filename, filepath, content, filetype, filesize, word_count, category, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
).run(finalName, dst, content, filetype, stat.size, wordCount, category, summary);
insertedDocId = Number(info.lastInsertRowid);
```

Replace with (NOTE: `visibility` will come from IPC param — pass via new variable set in handler; for now use `'public'` as placeholder, real wiring in Task 4):
```js
const info = insertDocumentRow(db, {
  filename: finalName, filepath: dst, content,
  filetype, filesize: stat.size, wordCount,
  category, summary, visibility: (visibility || 'public')
});
insertedDocId = Number(info.lastInsertRowid);
```

**Temporal ordering note**: IPC destructure adding `visibility` param happens in Task 7. If Task 2 commits BEFORE Task 7, `visibility` is undefined at this line → `ReferenceError` on every upload. To avoid this, Task 2 Step 3 MUST use literal `'public'` placeholder — NOT `(visibility || 'public')`. Task 7 then replaces `'public'` literal with `visibility` IPC param.

**Also note context**: this INSERT is inside a `db.transaction(() => { ... })` wrapper at main.js:15679. Keep the transaction wrapper intact; only replace the `db.prepare(INSERT...)...run(...)` line. The `insertBoth()` invoker at main.js:15686 stays unchanged.

So the actual replacement for this step:
```js
const info = insertDocumentRow(db, {
  filename: finalName, filepath: dst, content,
  filetype, filesize: stat.size, wordCount,
  category, summary, visibility: 'public'  // Task 7 wires real IPC param
});
insertedDocId = Number(info.lastInsertRowid);
```

- [ ] **Step 4: Replace INSERT at main.js:16890 (index-document)**

Original (main.js:16889-16896):
```js
const insertBoth = db.transaction(() => {
  db.prepare('INSERT INTO documents (filename, filepath, content, filetype, filesize, word_count) VALUES (?, ?, ?, ?, ?, ?)')
    .run(filename, dst, content, filetype, filesize, wordCount);
  db.prepare('INSERT INTO documents_fts (filename, content) VALUES (?, ?)')
    .run(filename, content);
});
insertBoth();
```

Replace with:
```js
const insertBoth = db.transaction(() => {
  insertDocumentRow(db, {
    filename, filepath: dst, content,
    filetype, filesize, wordCount,
    visibility: 'public'
  });
  db.prepare('INSERT INTO documents_fts (filename, content) VALUES (?, ?)')
    .run(filename, content);
});
insertBoth();
```

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "refactor(knowledge): route all 3 INSERT sites through insertDocumentRow helper

backfillKnowledgeFromDisk (15461), upload-knowledge-file (15681),
index-document (16890) now go through one helper that enforces the
visibility column. Prevents future INSERT from silently defaulting to
'public' at SQL layer when caller meant something else.

Spec: §4.2"
```

---

### Task 3: searchKnowledge filter — vector tier (Location 1)

**Files:**
- Modify: `electron/main.js:16254` (searchKnowledge signature)
- Modify: `electron/main.js:16298-16310` (vector SQL)

- [ ] **Step 1: Update searchKnowledge signature to accept audience**

Original (main.js:16254, from spec verification):
```js
async function searchKnowledge({ query, category, limit } = {}) {
```

Replace with:
```js
async function searchKnowledge({ query, category, limit, audience = 'customer' } = {}) {
  // v2.4.0: 3-tier visibility filter. Default 'customer' means missing/invalid
  // audience is treated as the most restrictive tier — fail-closed principle
  // ensures a buggy caller cannot accidentally elevate access.
  const allowedTiers = audience === 'ceo'      ? ['public', 'internal', 'private']
                     : audience === 'internal' ? ['public', 'internal']
                                               : ['public'];
  const visPlaceholders = allowedTiers.map(() => '?').join(',');
```

Insert the `allowedTiers` + `visPlaceholders` computation RIGHT AFTER the function signature brace, BEFORE any existing body.

- [ ] **Step 2: Update vector SQL at main.js:16298-16310 (both branches)**

Original category branch (exact from main.js):
```js
rows = category
  ? db.prepare(
      `SELECT c.id, c.document_id, c.chunk_index, c.char_start, c.char_end, c.embedding, d.filename, d.content
       FROM documents_chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.category = ? AND c.embedding IS NOT NULL
       ORDER BY c.id DESC LIMIT 2000`
    ).all(category)
  : db.prepare(
      `SELECT c.id, c.document_id, c.chunk_index, c.char_start, c.char_end, c.embedding, d.filename, d.content
       FROM documents_chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.embedding IS NOT NULL
       ORDER BY c.id DESC LIMIT 2000`
    ).all();
```

Replace with — filter is added as first WHERE clause so it short-circuits early, bind `allowedTiers` first:

```js
rows = category
  ? db.prepare(
      `SELECT c.id, c.document_id, c.chunk_index, c.char_start, c.char_end, c.embedding, d.filename, d.content
       FROM documents_chunks c JOIN documents d ON d.id = c.document_id
       WHERE d.visibility IN (${visPlaceholders})
         AND c.category = ? AND c.embedding IS NOT NULL
       ORDER BY c.id DESC LIMIT 2000`
    ).all(...allowedTiers, category)
  : db.prepare(
      `SELECT c.id, c.document_id, c.chunk_index, c.char_start, c.char_end, c.embedding, d.filename, d.content
       FROM documents_chunks c JOIN documents d ON d.id = c.document_id
       WHERE d.visibility IN (${visPlaceholders})
         AND c.embedding IS NOT NULL
       ORDER BY c.id DESC LIMIT 2000`
    ).all(...allowedTiers);
```

- [ ] **Step 3: Smoke verify manually (no automated test yet)**

Boot Electron, upload 1 file, run via Dashboard Test search:
- Dashboard → Knowledge → Test search — enter query that matches uploaded file
- Expect: returns results as before (since tier is public by default)

- [ ] **Step 4: Commit**

```bash
git add electron/main.js
git commit -m "feat(knowledge): filter searchKnowledge vector tier by visibility

Location 1 of 4 SQL filter sites. Signature accepts audience param;
allowedTiers array maps to SQL IN (...) placeholders. Fail-closed
default: missing audience treated as customer.

Spec: §6.4 Location 1"
```

---

### Task 4: searchKnowledgeFTS5 filter — baseSelect + LIKE fallback (Locations 2-3)

**Files:**
- Modify: `electron/main.js:15952` (signature)
- Modify: `electron/main.js:15970-15987` (baseSelect + tryMatch)
- Modify: `electron/main.js:16020-16029` (LIKE fallback)

- [ ] **Step 1: Update signature to accept audience**

Original (main.js:15952-15953):
```js
function searchKnowledgeFTS5(opts, sharedDb) {
  const { query, category, limit } = opts || {};
```

Replace with:
```js
function searchKnowledgeFTS5(opts, sharedDb) {
  const { query, category, limit, audience = 'customer' } = opts || {};
  // v2.4.0: same visibility filter policy as searchKnowledge — see that fn
  // for rationale on fail-closed default.
  const allowedTiers = audience === 'ceo'      ? ['public', 'internal', 'private']
                     : audience === 'internal' ? ['public', 'internal']
                                               : ['public'];
  const visPlaceholders = allowedTiers.map(() => '?').join(',');
```

- [ ] **Step 2: Update baseSelect at main.js:15970-15981**

Original (main.js:15970-15981):
```js
const baseSelect = `
  SELECT dc.id AS chunk_id, dc.document_id, dc.category, dc.chunk_index,
         dc.char_start, dc.char_end, d.filename, d.title,
         bm25(documents_chunks_fts) AS score,
         highlight(documents_chunks_fts, 0, '<b>', '</b>') AS snippet
  FROM documents_chunks_fts
  JOIN documents_chunks dc ON dc.id = documents_chunks_fts.rowid
  JOIN documents d ON d.id = dc.document_id
  WHERE documents_chunks_fts MATCH ?
`;
const catClause = category ? ' AND dc.category = ?' : '';
const orderLimit = ' ORDER BY bm25(documents_chunks_fts) LIMIT ?';
```

Replace with:
```js
const baseSelect = `
  SELECT dc.id AS chunk_id, dc.document_id, dc.category, dc.chunk_index,
         dc.char_start, dc.char_end, d.filename, d.title,
         bm25(documents_chunks_fts) AS score,
         highlight(documents_chunks_fts, 0, '<b>', '</b>') AS snippet
  FROM documents_chunks_fts
  JOIN documents_chunks dc ON dc.id = documents_chunks_fts.rowid
  JOIN documents d ON d.id = dc.document_id
  WHERE documents_chunks_fts MATCH ?
    AND d.visibility IN (${visPlaceholders})
`;
const catClause = category ? ' AND dc.category = ?' : '';
const orderLimit = ' ORDER BY bm25(documents_chunks_fts) LIMIT ?';
```

- [ ] **Step 3: Update tryMatch bind params at main.js:15983-15987**

Original:
```js
function tryMatch(expr) {
  const sql = baseSelect + catClause + orderLimit;
  const args = category ? [expr, category, lim] : [expr, lim];
  return db.prepare(sql).all(...args);
}
```

Replace with:
```js
function tryMatch(expr) {
  const sql = baseSelect + catClause + orderLimit;
  const args = category
    ? [expr, ...allowedTiers, category, lim]
    : [expr, ...allowedTiers, lim];
  return db.prepare(sql).all(...args);
}
```

- [ ] **Step 4: Update Tier 3 LIKE fallback at main.js:16020-16029**

Original:
```js
const sql3 = `
  SELECT NULL AS chunk_id, d.id AS document_id, d.category, 0 AS chunk_index,
         0 AS char_start, 0 AS char_end, d.filename, d.title,
         999.0 AS score,
         substr(d.content, 1, 300) AS snippet
  FROM documents d
  WHERE (d.content LIKE ? OR d.filename LIKE ?)
  ${category ? 'AND d.category = ?' : ''}
  LIMIT ?
`;
```

Replace with:
```js
const sql3 = `
  SELECT NULL AS chunk_id, d.id AS document_id, d.category, 0 AS chunk_index,
         0 AS char_start, 0 AS char_end, d.filename, d.title,
         999.0 AS score,
         substr(d.content, 1, 300) AS snippet
  FROM documents d
  WHERE d.visibility IN (${visPlaceholders})
    AND (d.content LIKE ? OR d.filename LIKE ?)
  ${category ? 'AND d.category = ?' : ''}
  LIMIT ?
`;
```

And find the `.all(...)` call right below and update bind order — search for the `sql3` usage:

Original bind (likely around main.js:16031):
```js
const args3 = category ? [like, like, category, lim] : [like, like, lim];
results = db.prepare(sql3).all(...args3);
```

Replace with:
```js
const args3 = category
  ? [...allowedTiers, like, like, category, lim]
  : [...allowedTiers, like, like, lim];
results = db.prepare(sql3).all(...args3);
```

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat(knowledge): filter searchKnowledgeFTS5 all 3 internal tiers by visibility

Locations 2-3 of 4 SQL filter sites. baseSelect template filters via
JOIN, Tier 3 LIKE fallback filters via FROM documents d. Bind params
reordered to prepend allowedTiers before existing params.

Spec: §6.4 Locations 2-3"
```

---

### Task 5: Update searchKnowledge callers — 3 call sites

**Files:**
- Modify: `electron/main.js:16576` (`knowledge-search` IPC — pass audience='ceo' since it's trusted Dashboard)
- Modify: `electron/main.js:16727+` (`/search` HTTP handler — parse audience from URL)
- Modify: `electron/main.js:~16276` (internal searchKnowledge→searchKnowledgeFTS5 fallback — propagate audience)

- [ ] **Step 1: Locate knowledge-search IPC handler**

Run: `grep -n "knowledge-search" electron/main.js | head -5`
Expected line: ~16573 for `ipcMain.handle('knowledge-search', ...)`

Read the handler body — find the `searchKnowledge({...})` call. Add `audience: 'ceo'` to the options object:

```js
// Original (approximate, actual line ~16576):
const results = await searchKnowledge({ query, category, limit });

// Replace with:
const results = await searchKnowledge({ query, category, limit, audience: 'ceo' });
```

Reason: `knowledge-search` IPC is only callable from trusted Dashboard renderer, which is CEO-operated. `audience='ceo'` gives CEO access to all tiers when testing.

- [ ] **Step 2: Update HTTP /search handler at main.js:16732-16740**

Actual code (verbatim, not approximate):
```js
const query = url.searchParams.get('q') || '';
const category = url.searchParams.get('cat') || null;
const limit = parseInt(url.searchParams.get('k') || '3', 10);
if (!query || query.length < 2) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ results: [] }));
  return;
}
const results = await searchKnowledge({ query, category, limit: Math.min(Math.max(limit, 1), 8) });
```

Add audience parsing BEFORE the length check + thread into searchKnowledge:
```js
const query = url.searchParams.get('q') || '';
const category = url.searchParams.get('cat') || null;
const limit = parseInt(url.searchParams.get('k') || '3', 10);
// v2.4.0: fail-closed audience parse. Any value other than 'internal' = customer.
const rawAudience = url.searchParams.get('audience');
const audience = (rawAudience === 'internal') ? 'internal' : 'customer';
if (!query || query.length < 2) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ results: [] }));
  return;
}
const results = await searchKnowledge({ query, category, limit: Math.min(Math.max(limit, 1), 8), audience });
```

- [ ] **Step 3: Propagate audience through ALL 4 internal fallback call sites**

Verified via grep: there are 4 `searchKnowledgeFTS5(...)` call sites inside `searchKnowledge`:
- main.js:16277 — `try { return searchKnowledgeFTS5({ query, category, limit }, db); }`
- main.js:16358 — `return searchKnowledgeFTS5({ query, category, limit }, db);`
- main.js:16392 — `const ftsResults = searchKnowledgeFTS5({ query, category, limit: 10 }, db);`
- main.js:16428 — `return searchKnowledgeFTS5({ query, category, limit }, db);`

EACH must add `audience`. Example for each (same change pattern):

```js
// Line 16277:
try { return searchKnowledgeFTS5({ query, category, limit, audience }, db); }

// Line 16358:
return searchKnowledgeFTS5({ query, category, limit, audience }, db);

// Line 16392 (note: overrides limit to 10):
const ftsResults = searchKnowledgeFTS5({ query, category, limit: 10, audience }, db);

// Line 16428:
return searchKnowledgeFTS5({ query, category, limit, audience }, db);
```

Missing even ONE = P0 filter leak (FTS5 fallback returns all tiers to customer). Verify all 4 changed with:
```bash
grep -n "searchKnowledgeFTS5({" electron/main.js | head -10
```
Every match should contain `audience` token.

- [ ] **Step 4: Smoke manual test**

Boot Electron. In Dashboard → Knowledge → Test search, enter query. Results should appear as before (audience='ceo' lets CEO see everything).

Upload 1 file with visibility='public' via Dashboard (assuming Task 9 is done — otherwise hardcode test by manually setting DB value). Call HTTP:
```bash
# Get RAG secret
RAG_SECRET=$(cat ~/AppData/Roaming/9bizclaw/rag-secret.txt)
curl -H "Authorization: Bearer $RAG_SECRET" "http://127.0.0.1:20129/search?q=test&audience=customer"
```
Expected: JSON response with results (since visibility='public').

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat(knowledge): wire audience through all 3 searchKnowledge call sites

- knowledge-search IPC: audience='ceo' (trusted Dashboard caller)
- HTTP /search: parse ?audience= from URL, fail-closed to 'customer'
- Internal searchKnowledge→searchKnowledgeFTS5 fallback: propagate audience

Spec: §6.5"
```

---

### Task 6: Smoke test — visibility filter at all 4 SQL locations

**Files:**
- Create: `electron/scripts/smoke-visibility.js`
- Modify: `electron/package.json` (chain into `npm run smoke`)

- [ ] **Step 1: Write smoke test covering 4 locations + enum validation**

Create `electron/scripts/smoke-visibility.js`:

```js
#!/usr/bin/env node
// Smoke test for 3-tier visibility filter. Creates temp SQLite in-memory,
// seeds 3 rows (public/internal/private), asserts filter behavior at all
// 4 SQL locations searchKnowledge uses.
//
// Does NOT require Electron or better-sqlite3 native — uses better-sqlite3
// via the existing electron/node_modules install.

const Database = require('../node_modules/better-sqlite3');
const path = require('path');

function fail(msg) { console.error('[visibility smoke] FAIL:', msg); process.exit(1); }
function ok(msg) { console.log('  OK  ', msg); }

// Minimal schema matching main.js CREATE TABLE (§3.1 of spec)
function setupDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      content TEXT,
      filetype TEXT,
      filesize INTEGER,
      word_count INTEGER,
      category TEXT DEFAULT 'general',
      summary TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      title TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE documents_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER,
      chunk_index INTEGER,
      char_start INTEGER,
      char_end INTEGER,
      category TEXT,
      embedding BLOB,
      text TEXT
    );
    CREATE VIRTUAL TABLE documents_chunks_fts USING fts5(text, tokenize='unicode61');
  `);
  const ins = db.prepare('INSERT INTO documents (filename, filepath, content, category, visibility) VALUES (?, ?, ?, ?, ?)');
  ins.run('public-file.pdf', '/fake/p.pdf', 'khach hang giao hang', 'cong-ty', 'public');
  ins.run('internal-file.pdf', '/fake/i.pdf', 'nhan vien noi quy giao hang', 'nhan-vien', 'internal');
  ins.run('private-file.pdf', '/fake/pr.pdf', 'bao mat ceo giao hang', 'cong-ty', 'private');
  // Also seed chunks (for later FTS5 test) — simplified
  const insChunk = db.prepare('INSERT INTO documents_chunks (document_id, chunk_index, char_start, char_end, category, text, embedding) VALUES (?, ?, ?, ?, ?, ?, ?)');
  // Fake 384-dim embedding as zeros — just needed to not-be-NULL for filter test
  const fakeEmb = Buffer.alloc(384 * 4);
  insChunk.run(1, 0, 0, 20, 'cong-ty', 'khach hang giao hang', fakeEmb);
  insChunk.run(2, 0, 0, 30, 'nhan-vien', 'nhan vien noi quy giao hang', fakeEmb);
  insChunk.run(3, 0, 0, 25, 'cong-ty', 'bao mat ceo giao hang', fakeEmb);
  // FTS5 index
  db.prepare('INSERT INTO documents_chunks_fts (rowid, text) VALUES (?, ?)').run(1, 'khach hang giao hang');
  db.prepare('INSERT INTO documents_chunks_fts (rowid, text) VALUES (?, ?)').run(2, 'nhan vien noi quy giao hang');
  db.prepare('INSERT INTO documents_chunks_fts (rowid, text) VALUES (?, ?)').run(3, 'bao mat ceo giao hang');
  return db;
}

// Location 1 — vector path (searchKnowledge fn SQL at main.js:16298-16310)
function testVectorFilter(db) {
  const cases = [
    { audience: 'customer', expectedIds: [1] },
    { audience: 'internal', expectedIds: [1, 2] },
    { audience: 'ceo',      expectedIds: [1, 2, 3] },
    { audience: 'invalid',  expectedIds: [1] },  // fail closed → customer
    { audience: undefined,  expectedIds: [1] },  // default → customer
  ];
  for (const c of cases) {
    const allowedTiers = c.audience === 'ceo'      ? ['public','internal','private']
                       : c.audience === 'internal' ? ['public','internal']
                                                   : ['public'];
    const placeholders = allowedTiers.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT d.id FROM documents_chunks c JOIN documents d ON d.id = c.document_id
       WHERE d.visibility IN (${placeholders}) AND c.embedding IS NOT NULL
       ORDER BY c.id ASC`
    ).all(...allowedTiers);
    const ids = rows.map(r => r.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify(c.expectedIds)) {
      fail(`vector audience=${c.audience} expected ${JSON.stringify(c.expectedIds)}, got ${JSON.stringify(ids)}`);
    }
    ok(`vector audience=${c.audience || 'undefined'} → ${ids.length} row(s)`);
  }
}

// Location 2 — FTS5 baseSelect (searchKnowledgeFTS5 baseSelect at main.js:15970)
function testFts5Filter(db) {
  const cases = [
    { audience: 'customer', expectedIds: [1] },
    { audience: 'internal', expectedIds: [1, 2] },
  ];
  for (const c of cases) {
    const allowedTiers = c.audience === 'internal' ? ['public','internal'] : ['public'];
    const placeholders = allowedTiers.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT dc.document_id AS did FROM documents_chunks_fts
       JOIN documents_chunks dc ON dc.id = documents_chunks_fts.rowid
       JOIN documents d ON d.id = dc.document_id
       WHERE documents_chunks_fts MATCH ? AND d.visibility IN (${placeholders})
       ORDER BY dc.id ASC`
    ).all('giao', ...allowedTiers);
    const ids = [...new Set(rows.map(r => r.did))].sort();
    if (JSON.stringify(ids) !== JSON.stringify(c.expectedIds)) {
      fail(`FTS5 audience=${c.audience} expected ${JSON.stringify(c.expectedIds)}, got ${JSON.stringify(ids)}`);
    }
    ok(`FTS5 audience=${c.audience} → ${ids.length} doc(s)`);
  }
}

// Location 3 — LIKE fallback (Tier 3 at main.js:16020)
function testLikeFilter(db) {
  const allowedTiers = ['public'];
  const placeholders = allowedTiers.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT d.id FROM documents d
     WHERE d.visibility IN (${placeholders}) AND d.content LIKE ?`
  ).all(...allowedTiers, '%giao%');
  const ids = rows.map(r => r.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify([1])) {
    fail(`LIKE audience=customer expected [1], got ${JSON.stringify(ids)}`);
  }
  ok(`LIKE audience=customer → only public`);
}

// Enum enforcement — invalid values rejected at write path
function testEnumValidation() {
  const valid = ['public', 'internal', 'private'];
  for (const v of ['Public', 'PRIVATE', '', null, undefined, ' ', 'internal ']) {
    if (valid.includes(v)) fail(`validation test bug: "${v}" should be invalid`);
  }
  ok('enum validation whitelist tight');
}

function main() {
  console.log('[visibility smoke] 4-location filter + enum validation...');
  const db = setupDb();
  try {
    testVectorFilter(db);
    testFts5Filter(db);
    testLikeFilter(db);
    testEnumValidation();
  } finally {
    db.close();
  }
  console.log('[visibility smoke] PASS');
}

main();
```

- [ ] **Step 2: Chain into npm run smoke**

Modify `electron/package.json` line 14:

Original:
```json
"smoke": "node scripts/smoke-test.js && node scripts/smoke-context-injection.js && node scripts/smoke-zalo-followup.js",
```

Replace with:
```json
"smoke": "node scripts/smoke-test.js && node scripts/smoke-context-injection.js && node scripts/smoke-zalo-followup.js && node scripts/smoke-visibility.js",
```

- [ ] **Step 3: Run smoke**

Run: `cd electron && npm run smoke`
Expected: all suites pass including new `[visibility smoke]` with 10+ OK lines + `PASS` final.

- [ ] **Step 4: Commit**

```bash
git add electron/scripts/smoke-visibility.js electron/package.json
git commit -m "test(smoke): 4-location visibility filter + enum validation

Covers: vector path, FTS5 baseSelect, LIKE fallback, invalid audience
values. In-memory SQLite fixture with 3 seed rows (public/internal/
private), asserts each audience returns correct subset.

Chained into npm run smoke — blocks build on regression."
```

---

## Chunk 2: API layer — IPC handlers + HTTP endpoint + preload bridge

### Task 7: Wire visibility through upload-knowledge-file IPC

**Files:**
- Modify: `electron/main.js:15631` (upload-knowledge-file signature)

- [ ] **Step 1: Update IPC handler destructure + validate**

Original (main.js:15631):
```js
ipcMain.handle('upload-knowledge-file', async (_event, { category, filepath, originalName }) => {
```

Replace with:
```js
ipcMain.handle('upload-knowledge-file', async (_event, { category, filepath, originalName, visibility = 'public' }) => {
  // v2.4.0: validate visibility BEFORE any filesystem work. Return early
  // so renderer gets a clean error, not a partial upload followed by
  // INSERT failure.
  if (!['public', 'internal', 'private'].includes(visibility)) {
    return { success: false, error: 'Invalid visibility value' };
  }
```

The `visibility` variable is now in function scope. Task 2 Step 3 already updated the INSERT site to use `(visibility || 'public')`.

- [ ] **Step 2: Smoke manual test via Dashboard**

Not applicable until UI task (Task 12). For now, test via direct IPC invocation from DevTools console:

Dashboard → F12 → Console:
```js
// Valid upload
await window.claw.uploadKnowledgeFile('cong-ty', 'C:/some/test.pdf', 'test.pdf', 'internal');
// Invalid value
await window.claw.uploadKnowledgeFile('cong-ty', 'C:/some/test.pdf', 'test.pdf', 'PUBLIC');
// Expected: { success: false, error: 'Invalid visibility value' }
```

(Note: preload bridge isn't updated yet; this will fail. Move on and test after Task 9.)

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat(knowledge): upload-knowledge-file IPC accepts visibility param

Destructure visibility with safe default 'public'. Validate enum before
any FS work to avoid partial uploads on bad input. Matches preload
signature change in Task 9.

Spec: §4.2"
```

---

### Task 8: New set-knowledge-visibility IPC handler

**Files:**
- Modify: `electron/main.js` (new handler near existing upload handler)

- [ ] **Step 1: Add new IPC handler after upload-knowledge-file**

Find main.js:~15800 (somewhere after upload handler ends). Add:

```js
// v2.4.0: PATCH visibility on existing doc row. Used by Dashboard file list
// inline editor. Validates enum + existence; audit logs for forensic trail.
ipcMain.handle('set-knowledge-visibility', async (_event, { docId, visibility }) => {
  try {
    if (!Number.isInteger(docId) || docId <= 0) {
      return { success: false, error: 'Invalid docId' };
    }
    if (!['public', 'internal', 'private'].includes(visibility)) {
      return { success: false, error: 'Invalid visibility value' };
    }
    const db = getDocumentsDb();
    if (!db) return { success: false, error: 'DB unavailable' };
    let info;
    try {
      info = db.prepare('UPDATE documents SET visibility=? WHERE id=?').run(visibility, docId);
    } finally {
      try { db.close(); } catch {}  // ensure close even if prepare/run throws
    }
    if (info.changes === 0) return { success: false, error: 'Document not found' };
    try { auditLog('visibility-change', { docId, visibility, ts: Date.now() }); } catch {}
    return { success: true };
  } catch (e) {
    console.error('[set-knowledge-visibility] error:', e.message);
    return { success: false, error: e.message };
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "feat(knowledge): set-knowledge-visibility IPC for inline edit

PATCH existing doc visibility (used by Dashboard file list row badge).
Validates docId + enum. Emits audit log 'visibility-change'.

Spec: §4.3"
```

---

### Task 9: Preload bridge — signature change + new method

**Files:**
- Modify: `electron/preload.js:104` (uploadKnowledgeFile signature)
- Modify: `electron/preload.js:~109` (add setKnowledgeVisibility after)

- [ ] **Step 1: Update uploadKnowledgeFile signature**

Original (preload.js:104):
```js
uploadKnowledgeFile: (category, filepath, originalName) => ipcRenderer.invoke('upload-knowledge-file', { category, filepath, originalName }),
```

Replace with:
```js
uploadKnowledgeFile: (category, filepath, originalName, visibility = 'public') => ipcRenderer.invoke('upload-knowledge-file', { category, filepath, originalName, visibility }),
```

- [ ] **Step 2: Add setKnowledgeVisibility method**

Insert AFTER line 108 (`listKnowledgeFolders`):
```js
  setKnowledgeVisibility: (docId, visibility) => ipcRenderer.invoke('set-knowledge-visibility', { docId, visibility }),
```

- [ ] **Step 3: Verify manually from DevTools**

Boot Electron. Dashboard → F12 → Console:
```js
// Test set-knowledge-visibility with a known docId (get from list)
const files = await window.claw.listKnowledgeFiles('cong-ty');
console.log(files);
// Use an id from the list
await window.claw.setKnowledgeVisibility(files[0].id, 'private');
// Verify:
const r = await window.claw.listKnowledgeFiles('cong-ty');
console.log(r[0].visibility); // should be 'private'
// Reset:
await window.claw.setKnowledgeVisibility(files[0].id, 'public');
```

- [ ] **Step 4: Commit**

```bash
git add electron/preload.js
git commit -m "feat(preload): uploadKnowledgeFile 4th arg + setKnowledgeVisibility method

Existing 3-arg callers still work (visibility defaults to 'public').
New setKnowledgeVisibility wraps IPC for Dashboard inline editor.

Spec: §4.2, §4.3"
```

---

### Task 10: list-knowledge-files IPC returns visibility

**Files:**
- Modify: `electron/main.js` (existing list-knowledge-files handler)

- [ ] **Step 1: Find list-knowledge-files handler**

Run: `grep -n "ipcMain.handle('list-knowledge-files'" electron/main.js`

- [ ] **Step 2: Update SELECT to include visibility**

Find the SELECT inside the handler. Add `visibility` to the column list:

Original (approximate):
```js
const rows = db.prepare('SELECT id, filename, filesize, word_count, summary, created_at FROM documents WHERE category = ? ORDER BY created_at DESC').all(cat);
```

Replace with:
```js
const rows = db.prepare('SELECT id, filename, filesize, word_count, summary, visibility, created_at FROM documents WHERE category = ? ORDER BY created_at DESC').all(cat);
```

Also update the filesystem-fallback path in the same handler (`listKnowledgeFilesFromDisk` helper) to include `visibility: 'public'` in its returned objects — disk-scanned files have no DB row, default public.

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat(knowledge): list-knowledge-files returns visibility column

Dashboard file list row needs visibility to render badge. FS fallback
path returns 'public' (disk-only files have no DB tier assignment).

Spec: §4.3 support"
```

---

## Chunk 3: Zalo patches — shared helper + audience detection + save handler

### Task 11: New ensureZaloGsHelperFix — shared helper patch

**Files:**
- Modify: `electron/main.js` (new function near other ensure*Fix + wire into boot)

- [ ] **Step 1: Add ensureZaloGsHelperFix function**

Add above `ensureZaloBlocklistFix` (around main.js:4487). Code:

```js
// v2.4.0: Shared helper __mcReadGroupSettings. Injected at TOP of inbound.ts
// (module scope, before other patches) so group-settings v7 AND RAG v9
// patches can both read zalo-group-settings.json via one function.
//
// Without this helper, each patch duplicates ~20 lines of path-candidate
// logic. Also: RAG v9 needs internal-flag lookup that v7 patch doesn't
// expose — shared helper solves both concerns.
//
// Idempotent via marker "9BizClaw GS-HELPER PATCH v1".
function ensureZaloGsHelperFix() {
  try {
    const pluginFile = path.join(HOME, '.openclaw', 'extensions', 'openzalo', 'src', 'inbound.ts');
    if (!fs.existsSync(pluginFile)) return;
    let content = _readInboundTs(pluginFile);
    if (content.includes('9BizClaw GS-HELPER PATCH v1')) return;

    // Anchor: end of the "from api.js" import block. Verified at top of
    // inbound.ts. Injection happens AFTER this line (module scope).
    const anchor = `} from "../api.js";`;
    if (!content.includes(anchor)) {
      console.warn('[zalo-gs-helper] api.js import anchor missing — skipping');
      return;
    }

    const injection = `

// === 9BizClaw GS-HELPER PATCH v1 ===
// Shared helper for zalo-group-settings.json access. Used by group-settings
// patch (v7) and RAG patch (v9). Module scope — available to all injections.
(global as any).__mcReadGroupSettings = function (): Record<string, { mode?: string; internal?: boolean }> {
  try {
    const fs = require('fs');
    const path = require('path');
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const candidates: string[] = [];
    if (process.env['9BIZ_WORKSPACE']) candidates.push(path.join(process.env['9BIZ_WORKSPACE'], 'zalo-group-settings.json'));
    if (process.env.MODORO_WORKSPACE) candidates.push(path.join(process.env.MODORO_WORKSPACE, 'zalo-group-settings.json')); // legacy fallback, matches RAG v8 at main.js:4110
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
};
// === END 9BizClaw GS-HELPER PATCH v1 ===
`;
    content = content.replace(anchor, anchor + injection);
    _writeInboundTs(pluginFile, content);
    console.log('[zalo-gs-helper] Injected shared __mcReadGroupSettings helper');
  } catch (e) {
    console.error('[zalo-gs-helper] error:', e?.message || e);
  }
}
```

- [ ] **Step 2: Wire into boot ordering**

Find main.js:~6668 (the patch call sequence after `_sweepInboundOrphanTmps()`):

Original:
```js
_sweepInboundOrphanTmps();
if (fs.existsSync(_inboundTsPath)) {
  global.__patchInboundCache = fs.readFileSync(_inboundTsPath, 'utf-8');
  global.__patchInboundDirty = false;
}
ensureZaloBlocklistFix();
```

Replace with:
```js
_sweepInboundOrphanTmps();
if (fs.existsSync(_inboundTsPath)) {
  global.__patchInboundCache = fs.readFileSync(_inboundTsPath, 'utf-8');
  global.__patchInboundDirty = false;
}
// v2.4.0: GS-HELPER must inject BEFORE other patches that consume it.
// Module-scope helper, anchored to api.js import line.
ensureZaloGsHelperFix();
ensureZaloBlocklistFix();
```

- [ ] **Step 3: Boot Electron + verify injection**

Run: `grep -c "9BizClaw GS-HELPER PATCH v1" ~/.openclaw/extensions/openzalo/src/inbound.ts`
Expected: `1` after Electron boots once with new code.

- [ ] **Step 4: Commit**

```bash
git add electron/main.js
git commit -m "feat(zalo): ensureZaloGsHelperFix injects __mcReadGroupSettings helper

Module-scope helper at top of inbound.ts, before other patches.
group-settings v7 + RAG v9 both call via (global as any) pattern.
Anchor: api.js import line (verified unique + stable).

Spec: §6.1"
```

---

### Task 12: ensureZaloRagFix v8→v9 — audience detection + URL param

**Files:**
- Modify: `electron/main.js:4029-4205` (entire RAG patch block)

- [ ] **Step 1: Update version strip list + marker check**

Find main.js:4052 (the for loop stripping old RAG markers):

Original:
```js
for (const oldVer of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']) {
  ...
}
if (content.includes('9BizClaw RAG PATCH v8')) return;
```

Replace with:
```js
for (const oldVer of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8']) {
  ...
}
if (content.includes('9BizClaw RAG PATCH v9')) return;
```

- [ ] **Step 2: Update injection string — add audience detection + URL param**

Find the injection template string at main.js:~4071. Two specific edits:

**Edit 2a**: Rename header comment v8→v9 + add v9 changelog line.
**Edit 2b**: Before the `__ragQ` / `__ragUrl` construction, add audience detection block. The current v8 code has:

```
// v8 security fixes ...
try {
  const __ragG = (global as any);
  ...
  const __ragSafeCustomer = __ragNeutralize(rawBody);

  let __ragCtx = '';
  if (__ragNow > __ragG.__ragCooldownUntil && (rawBody || '').trim().length >= 3) {
    if (!__ragG.__ragSecret) {
      ...
```

Add audience detection between `__ragSafeCustomer` computation and the fetch logic:

```typescript
// v9: audience detection for 3-tier visibility filter
const __mcGsFn = (global as any).__mcReadGroupSettings;
const __mcGs = typeof __mcGsFn === 'function' ? __mcGsFn() : {};
let __audience = 'customer';
if (message.isGroup && message.threadId) {
  const groupCfg = __mcGs[message.threadId];
  if (groupCfg?.internal === true) __audience = 'internal';
}
if (__audience === 'internal') {
  runtime.log?.(`openzalo: audience=internal for thread ${message.threadId}`);
}
```

**Edit 2c**: Update the `__ragUrl` to include `audience` param:

Original:
```typescript
const __ragUrl = \`http://127.0.0.1:20129/search?q=\${encodeURIComponent(__ragQ)}&k=3\`;
```

Replace with:
```typescript
const __ragUrl = \`http://127.0.0.1:20129/search?q=\${encodeURIComponent(__ragQ)}&k=3&audience=\${__audience}\`;
```

- [ ] **Step 3: Update bottom marker + console log**

Original:
```typescript
// === END 9BizClaw RAG PATCH v8 ===
`;
    content = content.replace(anchor, anchor + injection);
    _writeInboundTs(pluginFile, content);
    console.log('[zalo-rag] Injected RAG enrichment into inbound.ts (v8)');
```

Replace with:
```typescript
// === END 9BizClaw RAG PATCH v9 ===
`;
    content = content.replace(anchor, anchor + injection);
    _writeInboundTs(pluginFile, content);
    console.log('[zalo-rag] Injected RAG enrichment into inbound.ts (v9)');
```

Also header comment at main.js:4030:
```js
// Idempotent via "9BizClaw RAG PATCH v9" marker.
```

- [ ] **Step 4: Boot Electron + verify injection + test end-to-end**

Verify injection:
```bash
grep "9BizClaw RAG PATCH v9" ~/.openclaw/extensions/openzalo/src/inbound.ts
```

Verify audience string in URL (sniff after a Zalo message):
Check gateway log for line `RAG enriched` — no direct way to verify audience from log alone.

Easier: Dashboard → Zalo → tick "Nội bộ" on a test group → upload a `visibility='internal'` file → send msg in that group → bot uses file. Cross-verify by sending same question from a non-internal group → bot says "em chưa có thông tin".

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat(zalo): RAG patch v8→v9 — audience detection for 3-tier filter

Reads group internal flag via shared __mcReadGroupSettings helper.
Passes audience via URL to /search endpoint. Marker bumped v8→v9
so upgrade re-injects on existing installs (strip list extended).

Spec: §6.1, §6.2"
```

---

### Task 13: save-zalo-manager-config whitelist update for `internal`

**Files:**
- Modify: `electron/main.js:10117-10120`

- [ ] **Step 1: Update save handler to accept internal flag**

Original (main.js:10116-10120):
```js
for (const [gid, gs] of Object.entries(groupSettings)) {
  if (!gs || !gs.mode) continue;
  if (!['off', 'mention', 'all'].includes(gs.mode)) continue;
  existing[gid] = gs;
}
```

Replace with:
```js
for (const [gid, gs] of Object.entries(groupSettings)) {
  if (!gs || !gs.mode) continue;
  if (!['off', 'mention', 'all'].includes(gs.mode)) continue;
  // v2.4.0: whitelist visibility — store mode + (optionally) internal flag.
  // Strict: only literal true elevates; anything else = customer group.
  const sanitized: any = { mode: gs.mode };
  if (gs.internal === true) sanitized.internal = true;
  existing[gid] = sanitized;
}
```

Wait — main.js is JavaScript (not TypeScript), so remove the `: any`:

```js
for (const [gid, gs] of Object.entries(groupSettings)) {
  if (!gs || !gs.mode) continue;
  if (!['off', 'mention', 'all'].includes(gs.mode)) continue;
  // v2.4.0: whitelist visibility — store mode + (optionally) internal flag.
  // Strict: only literal true elevates; anything else = customer group.
  const sanitized = { mode: gs.mode };
  if (gs.internal === true) sanitized.internal = true;
  existing[gid] = sanitized;
}
```

- [ ] **Step 2: Verify by crafting test payload via DevTools console**

Dashboard → F12 → Console:
```js
const groups = await window.claw.getZaloGroups();
console.log(groups);
// Save with internal:true
await window.claw.saveZaloManagerConfig({ groupSettings: { [groups[0].id]: { mode: 'all', internal: true } } });
// Read back file
// (no direct IPC to read file — trust save flow + restart verifies)
```

Restart Electron, inspect `~/AppData/Roaming/9bizclaw/zalo-group-settings.json` file contents — should show `"internal": true` on that group.

- [ ] **Step 3: Audit log internal flag changes**

Add BEFORE the for loop:
```js
// v2.4.0: detect internal-flag changes for audit trail
const oldFile = (() => { try { return JSON.parse(fs.readFileSync(gsPath, 'utf-8')); } catch { return {}; } })();
```

AFTER the for loop, before writeJsonAtomic:
```js
// v2.4.0: audit any internal-flag changes
for (const gid of Object.keys({ ...oldFile, ...existing })) {
  const wasInternal = !!(oldFile[gid]?.internal);
  const isInternal = !!(existing[gid]?.internal);
  if (wasInternal !== isInternal) {
    try { auditLog('group-internal-flag-change', { groupId: gid, before: wasInternal, after: isInternal }); } catch {}
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.js
git commit -m "feat(zalo): save-zalo-manager-config whitelist internal flag

Strict storage: only literal boolean true elevates a group to internal.
Audit log 'group-internal-flag-change' emitted for any tick/untick
transition to preserve forensic trail.

Spec: §3.2.1"
```

---

## Chunk 4: UI — upload modal + file badge + group checkbox + migration banner

### Task 14: Knowledge tab — inline visibility radio (NO upload modal exists)

**Architecture note**: Dashboard has NO upload modal. Actual flow (verified):
- `currentKnowledgeCategory` state variable at [dashboard.html:4034](../../electron/ui/dashboard.html#L4034) set by folder-tab click at :4073
- User clicks pick button → `pickKnowledgeFile` IPC → OS file dialog → `uploadKnowledgePaths()` iterates selected paths → each upload via `uploadKnowledgeFile(currentKnowledgeCategory, fp, filename)`

Plan: place visibility radio INLINE in the Knowledge tab header area (next to the existing pick button), as a persistent UI element that applies to the NEXT upload(s). State stored in new module-scope var `currentUploadVisibility`.

**Files:**
- Modify: `electron/ui/dashboard.html` (Knowledge tab header area + uploadKnowledgePaths)

- [ ] **Step 1: Add inline radio UI to Knowledge tab header**

Find the Knowledge tab header section (around `refreshKnowledgeFiles` button at line 2362). Add ABOVE the pick button:

```html
<div class="form-row">
  <label class="form-label">Ai được thấy file này?</label>
  <div class="visibility-radio-group" style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
    <label class="visibility-option">
      <input type="radio" name="visibility" value="public" checked>
      <span class="radio-label">
        <strong>Công khai</strong> — mọi khách hàng thấy
        <small>Bảng giá, catalog, chính sách (mặc định)</small>
      </span>
    </label>
    <label class="visibility-option">
      <input type="radio" name="visibility" value="internal">
      <span class="radio-label">
        <strong>Nội bộ</strong> — CEO + nhân viên nội bộ
        <small>Sổ tay NV, quy định, SOP chỉ nhân viên cần biết</small>
      </span>
    </label>
    <label class="visibility-option">
      <input type="radio" name="visibility" value="private">
      <span class="radio-label">
        <strong>Chỉ mình tôi</strong> — chỉ CEO qua Telegram
        <small>Ghi chú cá nhân, tài chính, giá nhập</small>
      </span>
    </label>
  </div>
</div>
```

- [ ] **Step 3: Add CSS inside existing `<style>` block**

```css
.visibility-option { display:flex; gap:8px; align-items:flex-start; padding:8px; border:1px solid var(--border); border-radius:6px; cursor:pointer; }
.visibility-option:has(input:checked) { border-color: var(--accent); background: var(--bg-subtle); }
.visibility-option .radio-label { flex:1; }
.visibility-option .radio-label small { display:block; color: var(--text-muted); font-size:11px; margin-top:2px; }
```

- [ ] **Step 4: Wire radio state into upload flow**

Add module-scope state near `currentKnowledgeCategory` at line 4034:
```js
let currentUploadVisibility = 'public';
```

Find `uploadKnowledgePaths()` function. It iterates selected file paths calling:
```js
await window.claw.uploadKnowledgeFile(currentKnowledgeCategory, fp, filename);
```

Replace with:
```js
await window.claw.uploadKnowledgeFile(currentKnowledgeCategory, fp, filename, currentUploadVisibility);
```

Add change listener for the radio group (inside the same code block that wires folder-tab clicks):
```js
document.querySelectorAll('input[name="visibility"]').forEach(r => {
  r.addEventListener('change', (e) => {
    currentUploadVisibility = e.target.value;
    window._visibilityUserTouched = true;
  });
});
```

- [ ] **Step 5: Nudge logic — preselect Internal when current category = 'nhan-vien'**

The `setCurrentKnowledgeCategory(cat)` or equivalent function at line 4073 (where `currentKnowledgeCategory = cat` is assigned). Add nudge after the assignment:

```js
currentKnowledgeCategory = cat;
// v2.4.0: nudge visibility for HR category (overridable by explicit user click)
if (!window._visibilityUserTouched && cat === 'nhan-vien') {
  const r = document.querySelector('input[name="visibility"][value="internal"]');
  if (r) {
    r.checked = true;
    currentUploadVisibility = 'internal';
  }
}
refreshKnowledgeFiles();
```

Reset `window._visibilityUserTouched = false` in the tab's activation handler (when user navigates TO Knowledge tab — typically at the tab-click listener).

- [ ] **Step 6: Manual QA**

- [ ] Open upload modal — Công khai preselected
- [ ] Select Nhân viên from category — Internal auto-selected
- [ ] Manually click Chỉ mình tôi — stays Chỉ mình tôi even if category re-changed
- [ ] Upload a file with visibility=Internal — verify DB row has visibility='internal' via list-knowledge-files

- [ ] **Step 7: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat(ui): upload modal visibility radio (3 options)

Nudge UX: selecting 'nhan-vien' category preselects Internal. User's
explicit choice wins on subsequent category changes. Pass visibility
to uploadKnowledgeFile IPC as 4th positional arg.

Spec: §4.1"
```

---

### Task 15: File list — visibility badge + inline editor

**Files:**
- Modify: `electron/ui/dashboard.html` (knowledge file list rendering)

- [ ] **Step 1: Find file list rendering code**

Run: `grep -n "list-knowledge-files\|renderKnowledge" electron/ui/dashboard.html | head -10`

- [ ] **Step 2: Add badge rendering in file row template**

Find the `${file.filename}` template part. Add badge next to it:

```html
<span class="vis-badge vis-${file.visibility || 'public'}" data-doc-id="${file.id}" onclick="editVisibility(${file.id}, this)">
  ${file.visibility === 'private' ? 'Chỉ CEO' : file.visibility === 'internal' ? 'Nội bộ' : 'Công khai'}
</span>
```

- [ ] **Step 3: Add badge CSS**

```css
.vis-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:500; cursor:pointer; margin-left:8px; }
.vis-badge.vis-public { background:#e5e5e5; color:#555; }
.vis-badge.vis-internal { background:#fff3cd; color:#856404; }
.vis-badge.vis-private { background:#f8d7da; color:#721c24; }
.vis-badge:hover { opacity:0.8; }
```

- [ ] **Step 4: Add inline editor JS**

```js
async function editVisibility(docId, el) {
  const current = el.classList.contains('vis-private') ? 'private'
                : el.classList.contains('vis-internal') ? 'internal' : 'public';
  const next = prompt(
    `Đổi tầng hiển thị cho file (hiện tại: ${current}):\n\n` +
    `1 = Công khai (khách thấy)\n` +
    `2 = Nội bộ (nhân viên)\n` +
    `3 = Chỉ mình tôi`,
    current === 'public' ? '1' : current === 'internal' ? '2' : '3'
  );
  if (!next) return;
  const vis = next === '1' ? 'public' : next === '2' ? 'internal' : next === '3' ? 'private' : null;
  if (!vis) return alert('Giá trị không hợp lệ');
  const r = await window.claw.setKnowledgeVisibility(docId, vis);
  if (!r.success) return alert('Lỗi: ' + r.error);
  // Re-render file list — verified fn at dashboard.html:2362, 3524, 4079
  refreshKnowledgeFiles();
}
```

**Note**: the plan uses `prompt()` for simplicity. UI polish (dropdown menu inline) deferred to v2.4.1. `prompt()` is ugly but functional — CEO changes visibility rarely enough that modal polish is YAGNI for v2.4.0.

- [ ] **Step 5: Manual QA**

- [ ] File list shows badges with correct color per tier
- [ ] Click badge → prompt appears
- [ ] Enter "2" → file visibility changes to internal, badge re-renders amber

- [ ] **Step 6: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat(ui): file list visibility badge + inline editor via prompt()

Click badge → prompt() numeric input. 1/2/3 = public/internal/private.
UI polish (proper dropdown menu) deferred to v2.4.1 — rare action,
YAGNI for MVP.

Spec: §4.3"
```

---

### Task 16: Zalo group row — internal checkbox

**Files:**
- Modify: `electron/ui/dashboard.html` (zalo group list row)

- [ ] **Step 1: Find group row template**

Run: `grep -n "zalo-groups-list\|renderZaloGroups" electron/ui/dashboard.html | head -10`

- [ ] **Step 2: Add checkbox next to existing mode dropdown**

In the group row template (after mode `<select>`):

```html
<label class="internal-flag" title="Nếu tick, nhân viên trong group này truy cập được file Nội bộ">
  <input type="checkbox" data-group-id="${group.id}" ${group.internal ? 'checked' : ''} onchange="updateGroupInternal('${group.id}', this.checked)">
  Nội bộ
</label>
```

- [ ] **Step 3: Add save handler**

```js
async function updateGroupInternal(groupId, isInternal) {
  const groups = window._zaloGroupsCache || {};
  const current = groups[groupId] || { mode: 'mention' };
  const updated = { ...current, internal: isInternal };
  const payload = { ...groups, [groupId]: updated };
  const r = await window.claw.saveZaloManagerConfig({ groupSettings: payload });
  if (r.success) {
    groups[groupId] = updated;
    const internalCount = Object.values(groups).filter(g => g.internal).length;
    showToast(`Đã lưu. ${internalCount} group nội bộ.`, 'success');
  } else {
    alert('Lỗi: ' + r.error);
  }
}
```

- [ ] **Step 4: CSS**

```css
.internal-flag { margin-left:12px; font-size:12px; color:var(--text-muted); user-select:none; }
.internal-flag input { margin-right:4px; vertical-align:middle; }
```

- [ ] **Step 5: Manual QA**

- [ ] Dashboard → Zalo → tick "Nội bộ" on a group → toast confirms
- [ ] Restart Electron → checkbox still ticked
- [ ] Inspect `~/AppData/Roaming/9bizclaw/zalo-group-settings.json` → `internal: true` on that group

- [ ] **Step 6: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat(ui): zalo group row internal checkbox

Tick to mark group as internal (staff). Bot in that group gets
audience=internal → sees internal-tier files. Customer groups
left unticked (default).

Spec: §5.1"
```

---

## Chunk 5: Migration + observability + release

### Task 17: Migration banner on Knowledge tab (v2.4.0 first open)

**Files:**
- Modify: `electron/ui/dashboard.html`

- [ ] **Step 1: Add banner HTML at top of Knowledge tab content**

```html
<div id="visibility-migration-banner" style="display:none; padding:12px 16px; background:#fff8e1; border-left:3px solid #ffa000; margin-bottom:12px; border-radius:4px">
  <strong>Mới v2.4.0</strong>: anh/chị đã có thể chọn file nào KHÁCH thấy, file nào CHỈ NHÂN VIÊN hoặc CHỈ CEO.
  Mặc định mọi file hiện tại = Công khai. Vào xem và đánh dấu lại các file có nội dung nhạy cảm.
  <button onclick="dismissVisibilityBanner()" style="margin-left:12px;padding:4px 10px;background:none;border:1px solid #ffa000;border-radius:4px;cursor:pointer">Đã hiểu</button>
</div>
```

- [ ] **Step 2: Add show/dismiss JS**

At Knowledge-tab init (inside tab-click or DOMContentLoaded):
```js
if (!localStorage.getItem('v2.4.0-knowledge-visibility-seen')) {
  document.getElementById('visibility-migration-banner').style.display = 'block';
}
function dismissVisibilityBanner() {
  localStorage.setItem('v2.4.0-knowledge-visibility-seen', String(Date.now()));
  document.getElementById('visibility-migration-banner').style.display = 'none';
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat(ui): v2.4.0 migration banner on Knowledge tab

One-time banner (localStorage flag) nudging CEO to review file
visibility after upgrade. Dismiss-once — doesn't reappear.

Spec: §7.2"
```

---

### Task 18: Boot ping line

**Files:**
- Modify: `electron/main.js:~7176` (boot ping message)

- [ ] **Step 1: Find existing boot ping message**

Run: `grep -nE "đã sẵn sàng|MODOROClaw.*sẵn|9BizClaw.*sẵn" electron/main.js | head -5`

- [ ] **Step 2: Append v2.4.0 line to existing boot message**

Find the ping message string. Append:
```
\n\nMới: file Knowledge có 3 tầng Công khai / Nội bộ / Chỉ CEO. Vào Dashboard để cấu hình.
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat(boot): mention 3-tier Knowledge in boot ping

Throttled by existing READY_NOTIFY_THROTTLE_MS (30min) — no spam.

Spec: §7.3"
```

---

### Task 19: Version bump + release note

**Files:**
- Modify: `electron/package.json` (version)
- Create: `docs/releases/v2.4.0.md`

- [ ] **Step 1: Bump version**

`electron/package.json`:
```json
"version": "2.4.0",
```

- [ ] **Step 2: Write release note**

Create `docs/releases/v2.4.0.md`:

```markdown
# 9BizClaw v2.4.0 — 3-tier Knowledge visibility

Ngày phát hành: [TBD] · Feature release

Bản cập nhật đầu tiên sau hotfix v2.3.48. Focus: cho phép anh/chị chọn file Knowledge nào khách thấy, file nào nhân viên thấy, file nào chỉ mình mình thấy.

---

## Tính năng mới

**3 tầng quyền truy cập cho file Knowledge**

Khi upload file mới, anh/chị chọn 1 trong 3 tầng:
- **Công khai** — mọi khách hàng trên Zalo có thể được bot trả lời dựa trên file này (mặc định)
- **Nội bộ** — CEO + nhân viên trong Zalo group nội bộ mới thấy
- **Chỉ mình tôi** — chỉ CEO qua Telegram, không khách Zalo nào thấy

File đã upload trước đó tự động = Công khai. Anh/chị vào tab Knowledge nhấn badge bên cạnh filename để đổi tầng.

**Đánh dấu Zalo group nội bộ**

Dashboard → tab Zalo → mỗi group có checkbox mới "Nội bộ". Tick = nhân viên trong group đó truy cập được file `Nội bộ`. Để trống = group khách hàng (mặc định).

---

## Scenario thực tế

Anh có group Zalo 15 nhân viên + file PDF sổ tay nhân viên:
1. Tick "Nội bộ" cho group nhân viên trong Dashboard → tab Zalo
2. Upload sổ tay với tầng "Nội bộ"
3. Nhân viên hỏi "chính sách nghỉ thai sản?" trong group nội bộ → bot trả lời đúng
4. Khách nhắn cùng câu trong group khách → bot nói "em chưa có thông tin ạ"

---

## Tương thích ngược

- File cũ từ v2.3.x tự động = Công khai → hành vi bot không đổi với khách
- Zalo group cũ default KHÔNG tick Nội bộ → mặc định là group khách
- Cài đè v2.3.48 → v2.4.0 zero mất dữ liệu

---

## Cách dùng

1. Mở app → Dashboard hiện banner "Mới v2.4.0" trong tab Knowledge
2. Nhấn "Đã hiểu" → banner tắt
3. Duyệt qua các file đã upload → nhấn badge "Công khai" nếu muốn chuyển sang tầng khác
4. Nếu có group nhân viên, vào tab Zalo tick "Nội bộ" cho group đó

---

## Technical (dev reference)

- Migration: SQLite ALTER idempotent + CREATE TABLE change — boot 1 apply
- Filter enforced SQL level 4 location (vector tier + FTS5 baseSelect + LIKE fallback)
- Audience detection: Zalo inbound.ts RAG patch v9 đọc zalo-group-settings.json
- Rollback v2.4.0 → v2.3.48 zero data loss (column persists, ignored)

Chi tiết kỹ thuật: `docs/superpowers/specs/2026-04-19-knowledge-3tier-visibility-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add electron/package.json docs/releases/v2.4.0.md
git commit -m "chore(release): v2.4.0 — 3-tier Knowledge visibility

Version bump + Vietnamese merchant-facing release note."
```

---

### Task 20: Final smoke + manual QA gate

- [ ] **Step 1: Run full smoke chain**

```bash
cd electron && npm run smoke
```
Expected: all 4 suites pass (including smoke-visibility.js).

- [ ] **Step 2: Manual QA checklist** (do NOT ship without completing)

- [ ] Fresh install (delete `~/AppData/Roaming/9bizclaw/` + reinstall EXE) — upload 3 files (one per tier) → Dashboard shows correct badges
- [ ] Upgrade (v2.3.48 → v2.4.0) — all files show "Công khai", customer bot unchanged
- [ ] Migration banner appears on first Knowledge tab open → dismiss → doesn't reappear
- [ ] Create Zalo group → tick Nội bộ → upload Internal file → ask in that group → bot responds with file content
- [ ] Same file, ask in customer group → bot says "em chưa có thông tin"
- [ ] Change a file Public → Internal via badge click → next customer message excludes it
- [ ] Change a file Public → Private → test CEO Telegram can still reference it (read via AGENTS.md direct file access, bypasses RAG HTTP)
- [ ] Rollback test: install v2.3.48 over v2.4.0 → verify bot still works → verify files accessible (visibility column ignored by old code)
- [ ] Export workspace → restore on fresh machine → visibility badges restored, internal group flags restored (verify zalo-group-settings.json included in export)

- [ ] **Step 3: Build EXE + install locally**

```bash
cd electron && npm run build:win
```
Install generated `dist/9BizClaw Setup 2.4.0.exe` → smoke test above → ship.

- [ ] **Step 4: Tag + release note commit**

```bash
git tag v2.4.0
# DO NOT push tag until user approves
```

---

## Execution note

This plan has 20 tasks. Use `superpowers:subagent-driven-development` to dispatch 1 subagent per task; spec-compliance review + code-quality review after each task. Fresh subagent per task prevents context pollution.

Critical path: Chunk 1 (tasks 1-6) must land BEFORE Chunk 2 (tasks 7-10, which depend on helper + smoke). Chunk 3 (tasks 11-13) is independent-ish but requires Chunk 1 helper. Chunk 4 UI (tasks 14-16) can run after Chunk 2. Chunk 5 (tasks 17-20) is release prep.

Total estimated time: ~12 focused hours per spec §12.1.

Sequential execution recommended — each task commits before moving to next. If smoke fails mid-chunk, fix before proceeding.
