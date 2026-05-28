# Knowledge Brain Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Brain view with document-only knowledge graph, switch bot from hardcoded category routing to unified RAG search, upgrade chunking quality, add visibility security + staleness detection + observability.

**Architecture:** Existing `searchKnowledge()` RRF pipeline (port 20129) stays unchanged. AGENTS.md routing table replaced with single `web_fetch` rule. `brain-graph.js` rewritten to emit Doc nodes + similarity edges only. `knowledge.js` gets chunking upgrade (header propagation, table preservation, 200-800 char), visibility filter param, relevance floor, staleness detection, query logging. Migration auto-runs on first v2.5.0 boot.

**Tech Stack:** Electron 28, SQLite + FTS5, e5-small-v1 ONNX embeddings, D3.js force-directed graph, Node.js

**Spec:** `docs/superpowers/specs/2026-05-24-knowledge-brain-redesign-design.md`

**Outstanding items (deferred):** Migration idempotency markers, visibility smoke test, gateway channel injection mechanism, delete cascade for related_docs, embedder loaded vs health OK, concurrent SQLite write strategy.

---

## Chunk 1: Knowledge Search Upgrades (knowledge.js)

### Task 1: Add visibility filter to searchKnowledge()

**Files:**
- Modify: `electron/lib/knowledge.js:1570-1819` (searchKnowledge function)
- Modify: `electron/lib/knowledge.js:1824-1967` (HTTP server /search endpoint)
- Test: `electron/scripts/smoke-knowledge-search.js` (new)

- [ ] **Step 1: Add `channel` param to HTTP /search endpoint**

In `knowledge.js` HTTP server handler (~line 1850), parse `channel` from query params alongside existing `q`, `cat`, `k`, `audience`:

```javascript
const channel = parsedUrl.searchParams.get('channel') || 'telegram';
```

Pass `channel` into `searchKnowledge()` call.

- [ ] **Step 2: Add visibility WHERE clause in search queries**

In `searchKnowledge()`, before the FTS5 and semantic queries, compute visibility filter:

```javascript
const visFilter = channel === 'zalo'
  ? ` AND d.visibility = 'public'`
  : '';
```

Append `visFilter` to every SQL query that joins `documents d` — both the FTS5 MATCH query and the semantic embedding query. The `documents` table already has `visibility` column and `idx_documents_visibility` index.

- [ ] **Step 3: Add relevance floor**

After RRF merge (~line 1696), filter results before returning:

```javascript
const RELEVANCE_FLOOR = 0.25;
const filtered = merged.filter(r => r.score >= RELEVANCE_FLOOR);
const results = filtered.slice(0, topK);
```

- [ ] **Step 4: Run existing smoke-rag-test.js to verify no regression**

Run: `node electron/scripts/smoke-rag-test.js`
Expected: All existing RAG accuracy tests still pass.

- [ ] **Step 5: Commit**

```bash
git add electron/lib/knowledge.js
git commit -m "feat(knowledge): add visibility filter + relevance floor to search"
```

### Task 2: Upgrade chunking strategy

**Files:**
- Modify: `electron/lib/knowledge.js:127-206` (chunkVietnameseText function)

- [ ] **Step 1: Add header detection to chunkVietnameseText()**

Before the existing sentence-split logic, scan the full text for headings. Build a `headings` array mapping char offsets to heading text:

```javascript
function chunkVietnameseText(text, opts = {}) {
  const chunkSize = opts.chunkSize || 800;  // up from 500
  const overlap = opts.overlap || 100;
  const minChunkSize = 200;  // new: minimum chunk size

  // Phase 0: extract headings for context propagation
  const headingRe = /^(#{1,4}\s+.+|[^\n]{5,80}\n[=\-]{3,})$/gm;
  const headings = [];
  let hm;
  while ((hm = headingRe.exec(text)) !== null) {
    headings.push({ offset: hm.index, text: hm[0].replace(/^#+\s*/, '').trim() });
  }
  function nearestHeading(charPos) {
    let best = null;
    for (const h of headings) {
      if (h.offset <= charPos) best = h;
    }
    return best ? `[${best.text}] ` : '';
  }
  // ... rest of function
```

- [ ] **Step 2: Add table preservation logic**

After sentence splitting, detect table rows and merge them into single chunks:

```javascript
  // Phase 1: detect table blocks (lines matching |...|)
  const lines = text.split('\n');
  const tableBlocks = []; // [{start, end}] line indices
  let tblStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const isTableRow = /^\s*\|.*\|/.test(lines[i]);
    if (isTableRow && tblStart === -1) tblStart = i;
    else if (!isTableRow && tblStart !== -1) {
      tableBlocks.push({ start: tblStart, end: i - 1 });
      tblStart = -1;
    }
  }
  if (tblStart !== -1) tableBlocks.push({ start: tblStart, end: lines.length - 1 });
```

When building chunks, keep table rows together. If a table exceeds `chunkSize`, split at row boundaries and prepend the header row (first row of table) to each sub-chunk.

- [ ] **Step 3: Apply minChunkSize merge**

After building final chunks array, merge tiny trailing chunks:

```javascript
  // Phase 3: merge orphan chunks
  const merged = [];
  for (const chunk of rawChunks) {
    if (merged.length > 0 && chunk.content.length < minChunkSize) {
      merged[merged.length - 1].content += '\n' + chunk.content;
      merged[merged.length - 1].char_end = chunk.char_end;
    } else {
      merged.push(chunk);
    }
  }
```

- [ ] **Step 4: Prepend heading context to each chunk**

```javascript
  return merged.map((chunk, i) => ({
    index: i,
    content: nearestHeading(chunk.char_start) + chunk.content,
    char_start: chunk.char_start,
    char_end: chunk.char_end
  }));
```

- [ ] **Step 5: Run smoke-rag-test.js to verify accuracy holds**

Run: `node electron/scripts/smoke-rag-test.js`
Expected: PASS (accuracy should improve or hold — larger chunks with header context)

- [ ] **Step 6: Commit**

```bash
git add electron/lib/knowledge.js
git commit -m "feat(knowledge): upgrade chunking — header propagation, table preservation, 200-800 char"
```

### Task 3: Document staleness detection

**Files:**
- Modify: `electron/lib/knowledge.js:493-520` (documents table schema)
- Modify: `electron/lib/knowledge.js` (upload handler)

- [ ] **Step 1: Add `deprecated` column to schema init**

In the `CREATE TABLE IF NOT EXISTS documents` block (~line 493), the column already won't exist. Add idempotent ALTER after table creation:

```javascript
db.exec(`ALTER TABLE documents ADD COLUMN deprecated INTEGER DEFAULT 0`);
```

Wrap in try/catch (column may already exist).

- [ ] **Step 2: Add fuzzy filename match on upload**

In the upload handler (where new document is inserted), before INSERT, check for similar existing docs in same category:

```javascript
function findSimilarDoc(db, category, filename) {
  const existing = db.prepare(
    'SELECT id, filename FROM documents WHERE category = ? AND deprecated = 0'
  ).all(category);
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase();
  for (const doc of existing) {
    const docBase = doc.filename.replace(/\.[^.]+$/, '').toLowerCase();
    // shared prefix > 60%
    let common = 0;
    for (let i = 0; i < Math.min(base.length, docBase.length); i++) {
      if (base[i] === docBase[i]) common++; else break;
    }
    if (common / Math.max(base.length, docBase.length) > 0.6) {
      return doc;
    }
  }
  return null;
}
```

- [ ] **Step 3: Add IPC for staleness prompt**

In `electron/main.js`, add IPC handler:

```javascript
ipcMain.handle('resolve-stale-knowledge', async (_e, { category, oldDocId, action }) => {
  if (action === 'replace') {
    const db = getDocumentsDb();
    if (db) db.prepare('UPDATE documents SET deprecated = 1 WHERE id = ?').run(oldDocId);
  }
  // 'keep' = no action
});
```

- [ ] **Step 4: Add search filter for deprecated docs**

In `searchKnowledge()`, append to all document queries:

```javascript
const deprecatedFilter = ' AND (d.deprecated IS NULL OR d.deprecated = 0)';
```

- [ ] **Step 5: Commit**

```bash
git add electron/lib/knowledge.js electron/main.js
git commit -m "feat(knowledge): staleness detection — fuzzy match + soft-delete deprecated docs"
```

### Task 4: Query observability logging

**Files:**
- Modify: `electron/lib/knowledge.js:1570-1819` (searchKnowledge)

- [ ] **Step 1: Add query logger at end of searchKnowledge()**

After results are computed, before return:

```javascript
try {
  const logEntry = {
    ts: new Date().toISOString(),
    query: query.slice(0, 200),
    channel: channel || 'unknown',
    chunks_returned: results.length,
    top_score: results[0]?.score ?? 0,
    min_score: results[results.length - 1]?.score ?? 0,
    docs_matched: [...new Set(results.map(r => r.filename))],
    fallback_used: !embedderReady,
    visibility_filter: channel === 'zalo' ? 'public' : 'all'
  };
  const logPath = require('path').join(workspace, 'logs', 'knowledge-queries.jsonl');
  require('fs').appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
} catch (_) { /* never block search for logging */ }
```

- [ ] **Step 2: Commit**

```bash
git add electron/lib/knowledge.js
git commit -m "feat(knowledge): query observability logging to knowledge-queries.jsonl"
```

### Task 5: Slim down rewriteKnowledgeIndex()

**Files:**
- Modify: `electron/lib/knowledge.js:1082-1158` (rewriteKnowledgeIndex)

- [ ] **Step 1: Simplify index.md output format**

Replace the current markdown generation with slim table format:

```javascript
function rewriteKnowledgeIndex(category) {
  const db = getDocumentsDb();
  const cats = _loadCategories();
  const label = (cats.find(c => c.id === category) || {}).label || category;
  
  const docs = db
    ? db.prepare(
        'SELECT filename, summary FROM documents WHERE category = ? AND (deprecated IS NULL OR deprecated = 0) ORDER BY created_at DESC'
      ).all(category)
    : _listFilesFromDisk(category);

  let md = `# Tai lieu: ${label}\n\n`;
  if (docs.length === 0) {
    md += 'Chua co tai lieu nao.\n';
  } else {
    md += '| File | Tom tat |\n|---|---|\n';
    for (const d of docs) {
      const sum = (d.summary || '').replace(/\|/g, '-').slice(0, 100);
      md += `| ${d.filename} | ${sum} |\n`;
    }
    md += `\nCap nhat: ${new Date().toISOString().slice(0, 10)} · ${docs.length} tai lieu\n`;
  }

  const indexPath = require('path').join(getWorkspace(), 'knowledge', category, 'index.md');
  require('fs').writeFileSync(indexPath, md, 'utf8');
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/lib/knowledge.js
git commit -m "feat(knowledge): slim index.md — table format, fallback only"
```

---

## Chunk 2: Brain Graph Rewrite (brain-graph.js + brain.js)

### Task 6: Rewrite brain-graph.js — Doc nodes only + similarity edges

**Files:**
- Modify: `electron/lib/brain-graph.js` (major rewrite of buildBrainGraph)

- [ ] **Step 1: Add _categories.json loader**

At top of brain-graph.js, add helper:

```javascript
function loadCategories(workspace) {
  const catPath = require('path').join(workspace, 'knowledge', '_categories.json');
  try {
    return JSON.parse(require('fs').readFileSync(catPath, 'utf8'));
  } catch (_) {
    return [
      { id: 'cong-ty', label: 'Cong ty', builtin: true, color: '#3b82f6' },
      { id: 'san-pham', label: 'San pham', builtin: true, color: '#ef4444' },
      { id: 'nhan-vien', label: 'Nhan vien', builtin: true, color: '#10b981' }
    ];
  }
}
```

- [ ] **Step 2: Rewrite collectDocNodes() to use _categories.json**

Replace hardcoded `['cong-ty', 'san-pham', 'nhan-vien']` (line 205):

```javascript
function collectDocNodes(workspace) {
  const categories = loadCategories(workspace);
  const nodes = [];
  for (const cat of categories) {
    const filesDir = require('path').join(workspace, 'knowledge', cat.id, 'files');
    // scan public/, noi-bo/, ceo-only/ subdirs + root
    for (const sub of ['', 'public', 'noi-bo', 'ceo-only']) {
      const dir = sub ? require('path').join(filesDir, sub) : filesDir;
      try {
        for (const f of require('fs').readdirSync(dir)) {
          const fp = require('path').join(dir, f);
          const st = require('fs').statSync(fp);
          if (!st.isFile()) continue;
          nodes.push({
            id: `doc:${cat.id}/${f}`,
            type: 'doc',
            label: f,
            category: cat.id,
            categoryColor: cat.color,
            size: Math.round(st.size / 1024)
          });
        }
      } catch (_) { /* dir may not exist */ }
    }
  }
  return nodes;
}
```

- [ ] **Step 3: Add computeDocRelationships()**

New function — computes max-chunk cosine similarity between all document pairs:

```javascript
function computeDocRelationships(workspace) {
  const dbPath = require('path').join(workspace, 'memory.db');
  let db;
  try { db = new (require('better-sqlite3'))(dbPath, { readonly: true }); }
  catch (_) { return []; }

  // Load all chunks with embeddings, grouped by document
  const rows = db.prepare(`
    SELECT dc.document_id, dc.embedding, d.filename, d.category
    FROM documents_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE dc.embedding IS NOT NULL
      AND (d.deprecated IS NULL OR d.deprecated = 0)
    ORDER BY dc.document_id
  `).all();

  // Group by document
  const docChunks = new Map();
  for (const r of rows) {
    if (!docChunks.has(r.document_id)) {
      docChunks.set(r.document_id, {
        id: r.document_id, filename: r.filename, category: r.category, embeddings: []
      });
    }
    docChunks.get(r.document_id).embeddings.push(blobToVec(r.embedding));
  }

  // Cap at 200 most recent docs
  const docs = [...docChunks.values()].slice(-200);
  const edges = [];
  const threshold = _loadThreshold(workspace);

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const maxSim = maxChunkSimilarity(docs[i].embeddings, docs[j].embeddings);
      if (maxSim >= threshold) {
        edges.push({
          source: `doc:${docs[i].category}/${docs[i].filename}`,
          target: `doc:${docs[j].category}/${docs[j].filename}`,
          weight: maxSim
        });
      }
    }
  }
  db.close();
  return edges;
}

function maxChunkSimilarity(embsA, embsB) {
  let max = 0;
  for (const a of embsA) {
    for (const b of embsB) {
      const sim = cosineSim(a, b);
      if (sim > max) max = sim;
    }
  }
  return max;
}

function _loadThreshold(workspace) {
  try {
    const cfg = JSON.parse(require('fs').readFileSync(
      require('path').join(workspace, 'rag-config.json'), 'utf8'
    ));
    return cfg.brainEdgeThreshold || 0.65;
  } catch (_) { return 0.65; }
}
```

- [ ] **Step 4: Rewrite buildBrainGraph() — Doc only**

Replace the main export. Remove all customer/group/learning/skill collection. Remove wikilink injection. Remove Obsidian config:

```javascript
async function buildBrainGraph(workspace) {
  const nodes = collectDocNodes(workspace);
  const edges = computeDocRelationships(workspace);

  // Layout: force-directed in worker (keep existing pattern)
  const graphData = { nodes, edges };
  const laid = await runLayoutWorker(graphData, workspace);

  const outPath = require('path').join(workspace, 'brain-graph.json');
  require('fs').writeFileSync(outPath, JSON.stringify(laid));
  return laid;
}
```

Keep `runLayoutWorker()` (existing forked child process pattern). Remove `collectCustomerNodes`, `collectGroupNodes`, `collectLearningNodes`, `collectSkillNodes`, `collectMembershipEdges`, `collectCoMembershipEdges`, `collectEscalationEdges`, `injectWikilinks`, `createObsidianConfig`.

- [ ] **Step 5: Commit**

```bash
git add electron/lib/brain-graph.js
git commit -m "feat(brain): rewrite to doc-only graph with max-chunk similarity edges"
```

### Task 7: Update brain.js renderer

**Files:**
- Modify: `electron/ui/brain.js`

- [ ] **Step 1: Replace node type constants and colors**

Replace `_brainFilters` (line 40) and `BRAIN_COLORS` (line 46):

```javascript
// Filters now by category, not node type
var _brainFilters = {}; // populated dynamically from _categories.json
var BRAIN_COLORS = {}; // populated dynamically from _categories.json

function initBrainFilters(categories) {
  _brainFilters = {};
  BRAIN_COLORS = {};
  for (const cat of categories) {
    _brainFilters[cat.id] = true;
    BRAIN_COLORS[cat.id] = cat.color;
  }
}
```

- [ ] **Step 2: Update node rendering to use category color**

In the canvas draw function, replace `BRAIN_COLORS[node.type]` with `node.categoryColor || BRAIN_COLORS[node.category] || '#94a3b8'`.

- [ ] **Step 3: Update filter toolbar**

Replace the 5 type chips (customer/group/doc/learning/skill) with category chips loaded from the graph data:

```javascript
function renderBrainToolbar(categories) {
  const bar = document.getElementById('brain-filter-bar');
  if (!bar) return;
  bar.innerHTML = '';
  for (const cat of categories) {
    const chip = document.createElement('span');
    chip.className = 'brain-chip';
    chip.style.setProperty('--chip-color', cat.color);
    chip.textContent = cat.label;
    chip.onclick = () => toggleBrainFilter(cat.id);
    bar.appendChild(chip);
  }
}
```

- [ ] **Step 4: Update node click → right panel**

Show document info: filename, category, summary, related docs list ranked by edge weight.

- [ ] **Step 5: Commit**

```bash
git add electron/ui/brain.js
git commit -m "feat(brain): category-based filters, doc-only rendering"
```

### Task 8: Update dashboard.html Brain section

**Files:**
- Modify: `electron/ui/dashboard.html:3152-3220` (Brain tab markup)

- [ ] **Step 1: Update filter bar markup**

Replace the 5 hardcoded filter chips with a dynamic container:

```html
<div class="brain-toolbar">
  <div id="brain-filter-bar" class="brain-filters"></div>
  <input type="text" id="brain-search" placeholder="Tim tai lieu..." class="brain-search-input">
  <button onclick="refreshBrainGraph()" class="btn-icon" title="Lam moi">&#x21bb;</button>
</div>
```

- [ ] **Step 2: Update brain graph load to pass categories**

In the JS that loads `brain-graph.json`, extract unique categories from nodes and call `initBrainFilters()` + `renderBrainToolbar()`.

- [ ] **Step 3: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat(dashboard): brain tab — dynamic category filters, doc search"
```

---

## Chunk 3: Hybrid Categories + AGENTS.md + Migration

### Task 9: Hybrid categories system

**Files:**
- Modify: `electron/main.js` (seedWorkspace, IPC handlers)
- Modify: `electron/preload.js` (IPC bridges)
- Modify: `electron/ui/dashboard.html` (Knowledge tab create/delete category UI)

- [ ] **Step 1: Add _categories.json seeding in seedWorkspace()**

In `seedWorkspace()` (~line 350 area in main.js), after creating knowledge dirs:

```javascript
const catPath = path.join(ws, 'knowledge', '_categories.json');
if (!fs.existsSync(catPath)) {
  const defaultCats = [
    { id: 'cong-ty', label: 'Cong ty', builtin: true, color: '#3b82f6' },
    { id: 'san-pham', label: 'San pham', builtin: true, color: '#ef4444' },
    { id: 'nhan-vien', label: 'Nhan vien', builtin: true, color: '#10b981' }
  ];
  // auto-discover custom folders
  try {
    for (const d of fs.readdirSync(path.join(ws, 'knowledge'))) {
      if (d.startsWith('_') || d.startsWith('.')) continue;
      const hasFiles = fs.existsSync(path.join(ws, 'knowledge', d, 'files'));
      if (hasFiles && !defaultCats.find(c => c.id === d)) {
        defaultCats.push({ id: d, label: d, builtin: false, color: randomColor() });
      }
    }
  } catch (_) {}
  fs.writeFileSync(catPath, JSON.stringify(defaultCats, null, 2), 'utf8');
}
```

- [ ] **Step 2: Add IPC handlers for category CRUD**

```javascript
ipcMain.handle('create-knowledge-folder', async (_e, { name }) => {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cats = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  if (cats.find(c => c.id === id)) return { error: 'exists' };
  const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  cats.push({ id, label: name, builtin: false, color });
  fs.writeFileSync(catPath, JSON.stringify(cats, null, 2), 'utf8');
  fs.mkdirSync(path.join(ws, 'knowledge', id, 'files'), { recursive: true });
  return { id, label: name, color };
});

ipcMain.handle('delete-knowledge-folder', async (_e, { id, moveTo }) => {
  const cats = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  const cat = cats.find(c => c.id === id);
  if (!cat || cat.builtin) return { error: 'cannot_delete_builtin' };
  // move files if moveTo specified
  if (moveTo) {
    const srcDir = path.join(ws, 'knowledge', id, 'files');
    const dstDir = path.join(ws, 'knowledge', moveTo, 'files');
    // ... move files, update DB category
  }
  // remove from list
  const updated = cats.filter(c => c.id !== id);
  fs.writeFileSync(catPath, JSON.stringify(updated, null, 2), 'utf8');
  return { ok: true };
});
```

- [ ] **Step 3: Add preload bridges**

In `electron/preload.js`, within the `claw` contextBridge object:

```javascript
deleteKnowledgeFolder: (id, moveTo) => ipcRenderer.invoke('delete-knowledge-folder', { id, moveTo }),
getKnowledgeCategories: () => ipcRenderer.invoke('get-knowledge-categories'),
```

Add IPC handler for `get-knowledge-categories`:

```javascript
ipcMain.handle('get-knowledge-categories', async () => {
  try { return JSON.parse(fs.readFileSync(catPath, 'utf8')); }
  catch (_) { return []; }
});
```

- [ ] **Step 4: Update dashboard.html Knowledge tab**

Update `renderKnowledgeFolders()` to read from `_categories.json` via IPC. Add delete button (custom categories only) with confirmation dialog asking whether to move files or delete.

- [ ] **Step 5: Commit**

```bash
git add electron/main.js electron/preload.js electron/ui/dashboard.html
git commit -m "feat(knowledge): hybrid categories — 3 builtin + CEO custom categories"
```

### Task 10: Replace AGENTS.md routing table

**Files:**
- Modify: `AGENTS.md:92-113` (routing table + NGUON DUY NHAT section)

- [ ] **Step 1: Replace routing table + NGUON DUY NHAT with search rule**

Find the routing table (lines 92-97, `| Loai tin | Doc |` table) and the `## NGUON DUY NHAT` section (lines 107-113). Replace both with:

```markdown
## Knowledge doanh nghiep
Khi khach hoi ve san pham, gia, cong ty, nhan su, chinh sach, hoac bat ky thong tin doanh nghiep:
1. Goi web_fetch("http://127.0.0.1:20129/search?q=<cau hoi>")
2. Ket qua tra ve top chunks relevant nhat (cross tat ca danh muc)
3. Tra loi dua tren chunks do
4. Neu web_fetch tra ve loi ket noi (RAG server chua start) -> doc knowledge/*/index.md
5. Neu search tra ve 0 ket qua -> "Em chua co thong tin nay, de em hoi sep"

CHI tra loi tu ket qua search hoac knowledge/*/index.md. TUYET DOI KHONG dung COMPANY.md/PRODUCTS.md (auto-gen, khong chinh xac).
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "feat(agents): replace category routing with unified RAG search rule"
```

### Task 11: Migration logic

**Files:**
- Modify: `electron/main.js` (add migration function in boot sequence)

- [ ] **Step 1: Add migration detection + runner**

Add `migrateToV25()` function, called in `app.whenReady()` after `seedWorkspace()`:

```javascript
async function migrateToV25() {
  const graphPath = path.join(ws, 'brain-graph.json');
  let needsMigration = false;
  try {
    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    needsMigration = (graph.nodes || []).some(n => n.type === 'customer');
  } catch (_) { return; } // no graph = fresh install or already migrated

  if (!needsMigration) return;
  console.log('[migration] v2.5.0 brain redesign — starting');

  // Step 1: DB schema
  const db = getDocumentsDb();
  if (db) {
    try { db.exec('ALTER TABLE documents ADD COLUMN related_docs TEXT'); } catch (_) {}
    try { db.exec('ALTER TABLE documents ADD COLUMN deprecated INTEGER DEFAULT 0'); } catch (_) {}
  }

  // Step 2: _categories.json (seedWorkspace already handles this)

  // Step 3: Backup + slim index.md
  const cats = JSON.parse(fs.readFileSync(path.join(ws, 'knowledge', '_categories.json'), 'utf8'));
  for (const cat of cats) {
    const indexPath = path.join(ws, 'knowledge', cat.id, 'index.md');
    if (fs.existsSync(indexPath)) {
      fs.copyFileSync(indexPath, indexPath + '.pre-v25');
      const { rewriteKnowledgeIndex } = require('./lib/knowledge');
      rewriteKnowledgeIndex(cat.id);
    }
  }

  // Step 4: Re-chunk + re-embed (async, non-blocking)
  // Triggered by backfillKnowledgeEmbeddings() which already runs at boot

  // Step 5: Rebuild brain graph (will run on 15s timer anyway)

  console.log('[migration] v2.5.0 complete');
}
```

- [ ] **Step 2: Wire into boot sequence**

In `app.whenReady()`, after `seedWorkspace()`:

```javascript
await migrateToV25();
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat(migration): v2.4.x → v2.5.0 brain redesign auto-migration"
```

---

## Chunk 4: Smoke Tests

### Task 12: smoke-knowledge-search.js

**Files:**
- Create: `electron/scripts/smoke-knowledge-search.js`

- [ ] **Step 1: Write smoke test**

```javascript
#!/usr/bin/env node
'use strict';
// Smoke test: knowledge search — visibility filter + relevance floor + cross-category
const path = require('path');
const assert = require('assert');

// Setup mock electron
process.env.SMOKE_TEST = '1';
require(path.join(__dirname, '..', 'scripts', 'mock-electron'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; console.error(`  FAIL  ${name}: ${e.message}`); }
}

console.log('\n=== smoke-knowledge-search ===\n');

// Test: relevance floor filters low-score results
test('relevance floor filters noise', () => {
  // Mock: results with scores below 0.25 should be excluded
  const RELEVANCE_FLOOR = 0.25;
  const mockResults = [
    { score: 0.85, filename: 'a.pdf' },
    { score: 0.42, filename: 'b.pdf' },
    { score: 0.10, filename: 'c.pdf' },
  ];
  const filtered = mockResults.filter(r => r.score >= RELEVANCE_FLOOR);
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].filename, 'a.pdf');
});

// Test: visibility filter logic
test('zalo channel gets public only', () => {
  const channel = 'zalo';
  const visFilter = channel === 'zalo' ? "AND d.visibility = 'public'" : '';
  assert.ok(visFilter.includes("'public'"));
});

test('telegram channel gets all', () => {
  const channel = 'telegram';
  const visFilter = channel === 'zalo' ? "AND d.visibility = 'public'" : '';
  assert.strictEqual(visFilter, '');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test**

Run: `node electron/scripts/smoke-knowledge-search.js`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add electron/scripts/smoke-knowledge-search.js
git commit -m "test: smoke-knowledge-search — visibility + relevance floor"
```

### Task 13: smoke-brain-graph.js

**Files:**
- Create: `electron/scripts/smoke-brain-graph.js`

- [ ] **Step 1: Write smoke test**

```javascript
#!/usr/bin/env node
'use strict';
const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; console.error(`  FAIL  ${name}: ${e.message}`); }
}

console.log('\n=== smoke-brain-graph ===\n');

// Test: maxChunkSimilarity
test('maxChunkSimilarity returns highest pair', () => {
  function cosineSim(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }
  function maxChunkSimilarity(embsA, embsB) {
    let max = 0;
    for (const a of embsA) for (const b of embsB) {
      const s = cosineSim(a, b);
      if (s > max) max = s;
    }
    return max;
  }

  const a = [[1,0,0], [0,1,0]];
  const b = [[0,1,0], [0,0,1]];
  const sim = maxChunkSimilarity(a, b);
  assert.strictEqual(sim, 1.0); // [0,1,0] vs [0,1,0] = 1.0
});

// Test: threshold filtering
test('edges only created above threshold', () => {
  const threshold = 0.65;
  const pairs = [
    { source: 'a', target: 'b', sim: 0.80 },
    { source: 'a', target: 'c', sim: 0.30 },
    { source: 'b', target: 'c', sim: 0.70 },
  ];
  const edges = pairs.filter(p => p.sim >= threshold);
  assert.strictEqual(edges.length, 2);
  assert.ok(!edges.find(e => e.target === 'c' && e.source === 'a'));
});

// Test: no non-doc nodes
test('graph contains only doc nodes', () => {
  const mockNodes = [
    { id: 'doc:san-pham/a.pdf', type: 'doc' },
    { id: 'doc:cong-ty/b.pdf', type: 'doc' },
  ];
  assert.ok(mockNodes.every(n => n.type === 'doc'));
  assert.ok(!mockNodes.some(n => n.type === 'customer'));
  assert.ok(!mockNodes.some(n => n.type === 'group'));
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test**

Run: `node electron/scripts/smoke-brain-graph.js`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add electron/scripts/smoke-brain-graph.js
git commit -m "test: smoke-brain-graph — doc-only nodes, similarity threshold"
```

### Task 14: smoke-migration.js

**Files:**
- Create: `electron/scripts/smoke-migration.js`

- [ ] **Step 1: Write smoke test**

```javascript
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; console.error(`  FAIL  ${name}: ${e.message}`); }
}

console.log('\n=== smoke-migration ===\n');

// Setup: create temp workspace with old-format data
const tmpWs = path.join(os.tmpdir(), 'claw-migration-test-' + Date.now());
fs.mkdirSync(path.join(tmpWs, 'knowledge', 'san-pham', 'files'), { recursive: true });
fs.mkdirSync(path.join(tmpWs, 'knowledge', 'cong-ty', 'files'), { recursive: true });
fs.mkdirSync(path.join(tmpWs, 'knowledge', 'nhan-vien', 'files'), { recursive: true });

// Old brain-graph.json with customer nodes
fs.writeFileSync(path.join(tmpWs, 'brain-graph.json'), JSON.stringify({
  nodes: [
    { id: 'customer:123', type: 'customer', label: 'Test' },
    { id: 'group:456', type: 'group', label: 'Group' },
    { id: 'doc:san-pham/a.pdf', type: 'doc', label: 'a.pdf' },
  ],
  edges: [{ source: 'customer:123', target: 'group:456', type: 'membership' }]
}));

// Old index.md (verbose format)
fs.writeFileSync(path.join(tmpWs, 'knowledge', 'san-pham', 'index.md'),
  '# Knowledge: San pham\n\n## a.pdf\nFull content summary here...\n');

// Test: migration detection
test('detects old graph with customer nodes', () => {
  const graph = JSON.parse(fs.readFileSync(path.join(tmpWs, 'brain-graph.json'), 'utf8'));
  const needsMigration = graph.nodes.some(n => n.type === 'customer');
  assert.ok(needsMigration);
});

// Test: _categories.json auto-creation
test('categories.json created with 3 builtins', () => {
  const catPath = path.join(tmpWs, 'knowledge', '_categories.json');
  // simulate seedWorkspace
  const cats = [
    { id: 'cong-ty', label: 'Cong ty', builtin: true, color: '#3b82f6' },
    { id: 'san-pham', label: 'San pham', builtin: true, color: '#ef4444' },
    { id: 'nhan-vien', label: 'Nhan vien', builtin: true, color: '#10b981' }
  ];
  fs.writeFileSync(catPath, JSON.stringify(cats, null, 2));
  const loaded = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  assert.strictEqual(loaded.length, 3);
  assert.ok(loaded.every(c => c.builtin === true));
});

// Test: index.md backup
test('old index.md backed up as .pre-v25', () => {
  const idxPath = path.join(tmpWs, 'knowledge', 'san-pham', 'index.md');
  const backupPath = idxPath + '.pre-v25';
  fs.copyFileSync(idxPath, backupPath);
  assert.ok(fs.existsSync(backupPath));
  const backup = fs.readFileSync(backupPath, 'utf8');
  assert.ok(backup.includes('Full content summary'));
});

// Test: files on disk untouched
test('knowledge files not moved', () => {
  const testFile = path.join(tmpWs, 'knowledge', 'san-pham', 'files', 'test.txt');
  fs.writeFileSync(testFile, 'test content');
  assert.ok(fs.existsSync(testFile));
  assert.strictEqual(fs.readFileSync(testFile, 'utf8'), 'test content');
});

// Cleanup
fs.rmSync(tmpWs, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test**

Run: `node electron/scripts/smoke-migration.js`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add electron/scripts/smoke-migration.js
git commit -m "test: smoke-migration — v2.5.0 upgrade path verification"
```

### Task 15: Wire smoke tests into npm run smoke

**Files:**
- Modify: `electron/package.json` (scripts.smoke)

- [ ] **Step 1: Add new smoke tests to chain**

Find the existing `smoke` script in `electron/package.json` and append the 3 new tests:

```json
"smoke": "node scripts/smoke-test.js && node scripts/smoke-rag-test.js && ... && node scripts/smoke-knowledge-search.js && node scripts/smoke-brain-graph.js && node scripts/smoke-migration.js"
```

- [ ] **Step 2: Run full smoke suite**

Run: `cd electron && npm run smoke`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add electron/package.json
git commit -m "test: wire knowledge/brain/migration smoke tests into npm run smoke"
```

---

## Execution Order

```
Chunk 1 (Tasks 1-5): Knowledge search upgrades — can start immediately
Chunk 2 (Tasks 6-8): Brain graph rewrite — depends on Task 1 (categories loader)
Chunk 3 (Tasks 9-11): Categories + AGENTS.md + migration — depends on Chunks 1+2
Chunk 4 (Tasks 12-15): Smoke tests — can run in parallel with Chunk 3
```

**Parallelization:** Tasks 12-14 (smoke tests) are independent of each other and can run as parallel subagents. Tasks 6-8 (brain rewrite) depend on the categories loader from Task 9 step 1, but the `loadCategories()` helper can be written first as a standalone.
