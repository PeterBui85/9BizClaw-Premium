# Knowledge Folder Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers open knowledge folders on PC, drop files directly, and have the app auto-index them with correct visibility based on subfolder placement.

**Architecture:** Add 3 visibility subfolders (`public/`, `noi-bo/`, `ceo-only/`) to each knowledge category. `fs.watch` with 60s polling fallback detects changes and auto-indexes. Migration moves existing files into correct subfolders based on DB visibility column.

**Tech Stack:** Electron main process, Node.js `fs.watch`, SQLite (better-sqlite3)

---

## Task 1: Visibility subfolder constants + `inferVisibilityFromPath()`

**Files:**
- Modify: `electron/lib/knowledge.js:596-627` (constants area)

- [ ] **Step 1: Add visibility subfolder constants and helper**

In `electron/lib/knowledge.js`, after the existing `KNOWLEDGE_LABELS` constant (around line 600), add:

```js
const VISIBILITY_SUBFOLDERS = { public: 'public', internal: 'noi-bo', private: 'ceo-only' };
const SUBFOLDER_TO_VISIBILITY = { 'public': 'public', 'noi-bo': 'internal', 'ceo-only': 'private' };

function inferVisibilityFromPath(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  const m = norm.match(/\/files\/(public|noi-bo|ceo-only)\//);
  return m ? (SUBFOLDER_TO_VISIBILITY[m[1]] || 'public') : 'public';
}
```

- [ ] **Step 2: Export the new helpers**

Add `inferVisibilityFromPath`, `VISIBILITY_SUBFOLDERS`, `SUBFOLDER_TO_VISIBILITY` to `module.exports` at the end of `knowledge.js`.

- [ ] **Step 3: Run smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass

---

## Task 2: Update `ensureKnowledgeFolders()` + `seedWorkspace()`

**Files:**
- Modify: `electron/lib/knowledge.js:652-669` (`ensureKnowledgeFolders`)
- Modify: `electron/lib/workspace.js:705-720` (`seedWorkspace` knowledge section)

- [ ] **Step 1: Update `ensureKnowledgeFolders()` in knowledge.js**

Replace the `fs.mkdirSync(dir, { recursive: true })` inside the for loop (line 656) to also create the 3 visibility subfolders:

```js
function ensureKnowledgeFolders() {
  const ws = getWorkspace();
  for (const cat of getKnowledgeCategories()) {
    const filesDir = path.join(ws, 'knowledge', cat, 'files');
    try { fs.mkdirSync(filesDir, { recursive: true }); } catch {}
    for (const sub of Object.values(VISIBILITY_SUBFOLDERS)) {
      try { fs.mkdirSync(path.join(filesDir, sub), { recursive: true }); } catch {}
    }
    const indexFile = path.join(ws, 'knowledge', cat, 'index.md');
    if (!fs.existsSync(indexFile)) {
      const label = KNOWLEDGE_LABELS[cat] || cat;
      try {
        fs.writeFileSync(
          indexFile,
          `# Knowledge — ${label}\n\n*Chưa có tài liệu nào. CEO upload file qua Dashboard → Knowledge.*\n`,
          'utf-8'
        );
      } catch {}
    }
  }
}
```

- [ ] **Step 2: Update `seedWorkspace()` in workspace.js**

In `electron/lib/workspace.js` around line 705-720, after the `fs.mkdirSync(filesDir, ...)` line, add the 3 subfolders:

```js
for (const cat of knowCategories) {
  const filesDir = path.join(ws, 'knowledge', cat, 'files');
  try { fs.mkdirSync(filesDir, { recursive: true }); } catch {}
  for (const sub of ['public', 'noi-bo', 'ceo-only']) {
    try { fs.mkdirSync(path.join(filesDir, sub), { recursive: true }); } catch {}
  }
  // ... rest of index.md creation unchanged ...
}
```

- [ ] **Step 3: Run smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass

---

## Task 3: Update `listKnowledgeFilesFromDisk()` to scan subfolders

**Files:**
- Modify: `electron/lib/knowledge.js:883-909` (`listKnowledgeFilesFromDisk`)

- [ ] **Step 1: Rewrite to scan 3 subfolders + root**

Replace the function to scan `files/public/`, `files/noi-bo/`, `files/ceo-only/`, plus root-level legacy files:

```js
function listKnowledgeFilesFromDisk(category) {
  try {
    const baseDir = path.join(getKnowledgeDir(category), 'files');
    if (!fs.existsSync(baseDir)) return [];
    const results = [];
    const _addFromDir = (dir, visibility) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isFile()) continue;
        const fp = path.join(dir, e.name);
        let st = null;
        try { st = fs.statSync(fp); } catch {}
        results.push({
          filename: e.name,
          filepath: fp,
          filetype: path.extname(e.name).toLowerCase().replace('.', ''),
          filesize: st ? st.size : 0,
          word_count: 0,
          summary: null,
          visibility,
          created_at: st ? new Date(st.mtimeMs).toISOString().replace('T', ' ').slice(0, 19) : '',
          _source: 'disk',
        });
      }
    };
    _addFromDir(path.join(baseDir, 'public'), 'public');
    _addFromDir(path.join(baseDir, 'noi-bo'), 'internal');
    _addFromDir(path.join(baseDir, 'ceo-only'), 'private');
    _addFromDir(baseDir, 'public'); // legacy root-level files
    // Deduplicate: if a file exists in both root and subfolder, prefer subfolder
    const seen = new Set();
    return results.filter(r => {
      if (r._source === 'disk' && r.filepath === path.join(baseDir, r.filename) && seen.has(r.filename)) return false;
      seen.add(r.filename);
      return true;
    }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  } catch (e) {
    console.error('[knowledge] disk list error:', e.message);
    return [];
  }
}
```

- [ ] **Step 2: Run smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass

---

## Task 4: Update `backfillKnowledgeFromDisk()` for subfolder paths

**Files:**
- Modify: `electron/lib/knowledge.js:674-715` (`backfillKnowledgeFromDisk`)

- [ ] **Step 1: Update to scan subfolders**

In `backfillKnowledgeFromDisk()`, replace the single-level scan with a scan of all 3 subfolders + root. Change the inner loop starting at the `fs.readdirSync(filesDir, ...)` line:

```js
async function backfillKnowledgeFromDisk() {
  const db = getDocumentsDb();
  if (!db) return;
  let inserted = 0;
  for (const cat of getKnowledgeCategories()) {
    let existing = new Set();
    try {
      for (const r of db.prepare('SELECT filename FROM documents WHERE category = ?').all(cat)) existing.add(r.filename);
    } catch {}
    const baseDir = path.join(getKnowledgeDir(cat), 'files');
    if (!fs.existsSync(baseDir)) continue;
    const dirsToScan = [
      { dir: path.join(baseDir, 'public'), visibility: 'public' },
      { dir: path.join(baseDir, 'noi-bo'), visibility: 'internal' },
      { dir: path.join(baseDir, 'ceo-only'), visibility: 'private' },
      { dir: baseDir, visibility: 'public' }, // legacy root
    ];
    for (const { dir, visibility } of dirsToScan) {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (existing.has(entry.name)) continue;
        const fp = path.join(dir, entry.name);
        let stat;
        try { stat = fs.statSync(fp); } catch { continue; }
        const filetype = path.extname(entry.name).toLowerCase().replace('.', '');
        let content = '';
        try { content = await extractTextFromFile(fp, entry.name); } catch {}
        const isImage = /\.(jpe?g|png|gif|webp|bmp)$/i.test(entry.name);
        if (isImage && !content) continue;
        const wordCount = content ? content.split(/\s+/).length : 0;
        try {
          const result = db.prepare(
            'INSERT OR IGNORE INTO documents (filename, filepath, content, filetype, filesize, word_count, category, summary, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(entry.name, fp, content, filetype, stat.size, wordCount, cat, null, visibility);
          if (result.changes > 0) {
            try { db.prepare('INSERT INTO documents_fts (filename, content) VALUES (?, ?)').run(entry.name, content); } catch {}
            inserted++;
          }
        } catch (e) { console.error('[knowledge] backfill insert err:', entry.name, e.message); }
      }
    }
  }
  if (inserted > 0) {
    console.log('[knowledge] backfilled', inserted, 'file(s) from disk into DB');
    for (const cat of getKnowledgeCategories()) rewriteKnowledgeIndex(cat);
  }
}
```

- [ ] **Step 2: Run smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass

---

## Task 5: Update upload handler to write to visibility subfolder

**Files:**
- Modify: `electron/lib/dashboard-ipc.js:3282-3287` (upload destination)

- [ ] **Step 1: Change upload destination to subfolder**

In the `upload-knowledge-file` handler, change lines 3282-3287:

**Before:**
```js
    const filesDir = path.join(getKnowledgeDir(category), 'files');
    let safeName = (originalName || path.basename(filepath)).replace(/[\\/:*?"<>|]/g, '_');
    safeName = safeName.replace(/[\x00-\x1F\x7F]/g, '');
    const finalName = resolveUniqueFilename(filesDir, safeName);
    const dst = path.join(filesDir, finalName);
```

**After:**
```js
    const baseFilesDir = path.join(getKnowledgeDir(category), 'files');
    const subDir = VISIBILITY_SUBFOLDERS[visibility] || 'public';
    const filesDir = path.join(baseFilesDir, subDir);
    try { fs.mkdirSync(filesDir, { recursive: true }); } catch {}
    let safeName = (originalName || path.basename(filepath)).replace(/[\\/:*?"<>|]/g, '_');
    safeName = safeName.replace(/[\x00-\x1F\x7F]/g, '');
    const finalName = resolveUniqueFilename(filesDir, safeName);
    const dst = path.join(filesDir, finalName);
```

Add `VISIBILITY_SUBFOLDERS` to the require from `./knowledge` at the top of dashboard-ipc.js.

- [ ] **Step 2: Run smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass

---

## Task 6: Update `set-knowledge-visibility` to move file

**Files:**
- Modify: `electron/lib/dashboard-ipc.js:3423-3459` (`set-knowledge-visibility` handler)

- [ ] **Step 1: Add file move logic after DB update**

After the DB update at line 3439, before `rewriteKnowledgeIndex`, add the file move:

```js
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
    let info, category, filename, filepath;
    try {
      const row = db.prepare('SELECT category, filename, filepath FROM documents WHERE id=?').get(docId);
      category = row?.category;
      filename = row?.filename;
      filepath = row?.filepath;
      info = db.prepare('UPDATE documents SET visibility=? WHERE id=?').run(visibility, docId);
    } catch (e) {
      return { success: false, error: 'DB error: ' + e.message };
    }
    if (!info || info.changes === 0) return { success: false, error: 'Document not found' };

    // Move file to matching visibility subfolder
    if (filepath && filename && category) {
      try {
        const targetSubDir = VISIBILITY_SUBFOLDERS[visibility] || 'public';
        const targetDir = path.join(getKnowledgeDir(category), 'files', targetSubDir);
        fs.mkdirSync(targetDir, { recursive: true });
        const newPath = path.join(targetDir, filename);
        if (fs.existsSync(filepath) && filepath !== newPath) {
          fs.renameSync(filepath, newPath);
          db.prepare('UPDATE documents SET filepath=? WHERE id=?').run(newPath, docId);
        }
      } catch (e) { console.warn('[set-knowledge-visibility] file move error:', e.message); }
    }

    try { auditLog('visibility-change', { docId, visibility, ts: Date.now() }); } catch {}
    let indexWarning;
    if (category) {
      try { rewriteKnowledgeIndex(category); } catch (e) { indexWarning = e.message; }
      purgeAgentSessions('knowledge-visibility');
    }
    try {
      mediaLibrary.updateKnowledgeMediaAssets({ docId, filename, filepath }, { visibility });
    } catch (e) {
      indexWarning = indexWarning || e.message;
    }
    return { success: true, indexWarning };
  } catch (e) {
    console.error('[set-knowledge-visibility] error:', e.message);
    return { success: false, error: e.message };
  }
});
```

- [ ] **Step 2: Run smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass

---

## Task 7: Migration — `migrateKnowledgeToSubfolders()`

**Files:**
- Modify: `electron/lib/knowledge.js` (add new function after `ensureKnowledgeFolders`)

- [ ] **Step 1: Add migration function**

Add after `ensureKnowledgeFolders()`:

```js
function migrateKnowledgeToSubfolders() {
  const ws = getWorkspace();
  const marker = path.join(ws, 'knowledge', '.migrated-to-subfolders');
  if (fs.existsSync(marker)) return;
  const db = getDocumentsDb();
  let total = 0;
  for (const cat of getKnowledgeCategories()) {
    const filesDir = path.join(ws, 'knowledge', cat, 'files');
    if (!fs.existsSync(filesDir)) continue;
    for (const sub of Object.values(VISIBILITY_SUBFOLDERS)) {
      try { fs.mkdirSync(path.join(filesDir, sub), { recursive: true }); } catch {}
    }
    let entries;
    try { entries = fs.readdirSync(filesDir, { withFileTypes: true }).filter(e => e.isFile()); } catch { continue; }
    for (const entry of entries) {
      let vis = 'public';
      if (db) {
        try {
          const row = db.prepare('SELECT visibility FROM documents WHERE filename=? AND category=?').get(entry.name, cat);
          if (row?.visibility) vis = row.visibility;
        } catch {}
      }
      const subDir = VISIBILITY_SUBFOLDERS[vis] || 'public';
      const src = path.join(filesDir, entry.name);
      const dst = path.join(filesDir, subDir, entry.name);
      try {
        fs.renameSync(src, dst);
        if (db) {
          try { db.prepare('UPDATE documents SET filepath=? WHERE filename=? AND category=?').run(dst, entry.name, cat); } catch {}
        }
        total++;
      } catch (e) { console.warn('[knowledge] migration skip:', entry.name, e.message); }
    }
  }
  try { fs.writeFileSync(marker, new Date().toISOString(), 'utf-8'); } catch {}
  if (total > 0) {
    console.log(`[knowledge] migrated ${total} files to subfolder structure`);
    for (const cat of getKnowledgeCategories()) {
      try { rewriteKnowledgeIndex(cat); } catch {}
    }
  }
}
```

- [ ] **Step 2: Export and wire into boot**

Add `migrateKnowledgeToSubfolders` to `module.exports`. Call it in the boot sequence (in `knowledge.js` or wherever `backfillKnowledgeFromDisk` is called) — **before** `backfillKnowledgeFromDisk()`.

- [ ] **Step 3: Run smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass

---

## Task 8: File watcher — `startKnowledgeWatcher()`

**Files:**
- Modify: `electron/lib/knowledge.js` (add new function)

- [ ] **Step 1: Add watcher with debounce + polling fallback**

Add after `migrateKnowledgeToSubfolders()`:

```js
let _knowledgeWatcher = null;
let _knowledgeWatchDebounce = null;
let _knowledgePollInterval = null;
let _isReindexing = false;
const _WATCH_IGNORE = /(?:\.tmp$|^~\$|\.DS_Store$|Thumbs\.db$|^index\.md)/i;

async function _processKnowledgeChange(filePath) {
  if (_isReindexing) return;
  if (_WATCH_IGNORE.test(path.basename(filePath))) return;
  const norm = filePath.replace(/\\/g, '/');
  const m = norm.match(/knowledge\/([a-z0-9-]+)\/files\//);
  if (!m) return;
  const category = m[1];
  const visibility = inferVisibilityFromPath(filePath);
  const exists = fs.existsSync(filePath);
  const db = getDocumentsDb();
  const filename = path.basename(filePath);

  if (!exists) {
    // File deleted
    if (db) {
      try {
        const row = db.prepare('SELECT id FROM documents WHERE filename=? AND category=?').get(filename, category);
        if (row) {
          db.prepare('DELETE FROM documents_chunks WHERE document_id=?').run(row.id);
          db.prepare('DELETE FROM documents WHERE id=?').run(row.id);
        }
      } catch (e) { console.error('[knowledge-watch] delete DB error:', e.message); }
    }
    _isReindexing = true;
    try { rewriteKnowledgeIndex(category); } finally { _isReindexing = false; }
    _broadcastKnowledgeUpdated();
    return;
  }

  // New or changed file
  let stat;
  try { stat = fs.statSync(filePath); } catch { return; }
  if (!stat.isFile()) return;
  if (stat.size > 100 * 1024 * 1024) { console.warn('[knowledge-watch] skip >100MB:', filename); return; }

  let content = '';
  try { content = await extractTextFromFile(filePath, filename, { visibility, category }); } catch {}
  if (content && /^\[(PDF|DOCX|Excel) extract failed:/.test(content)) {
    console.warn('[knowledge-watch] extract failed:', filename, content);
    return;
  }
  const wordCount = content ? content.split(/\s+/).length : 0;
  const filetype = path.extname(filename).toLowerCase().replace('.', '');

  if (db) {
    try {
      const existing = db.prepare('SELECT id FROM documents WHERE filename=? AND category=?').get(filename, category);
      if (existing) {
        db.prepare('UPDATE documents SET filepath=?, content=?, filetype=?, filesize=?, word_count=?, visibility=? WHERE id=?')
          .run(filePath, content, filetype, stat.size, wordCount, visibility, existing.id);
      } else {
        db.prepare('INSERT INTO documents (filename, filepath, content, filetype, filesize, word_count, category, summary, visibility) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(filename, filePath, content, filetype, stat.size, wordCount, category, null, visibility);
        try { db.prepare('INSERT INTO documents_fts (filename, content) VALUES (?,?)').run(filename, content); } catch {}
      }
      const doc = db.prepare('SELECT id FROM documents WHERE filename=? AND category=?').get(filename, category);
      if (doc) {
        try { indexDocumentChunks(db, doc.id, category, content); } catch {}
      }
    } catch (e) { console.error('[knowledge-watch] DB error:', filename, e.message); }
  }

  _isReindexing = true;
  try { rewriteKnowledgeIndex(category); } finally { _isReindexing = false; }
  _broadcastKnowledgeUpdated();
  console.log(`[knowledge-watch] indexed: ${filename} (${category}/${visibility})`);
}

function _broadcastKnowledgeUpdated() {
  try {
    const { BrowserWindow } = require('electron');
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) { try { w.webContents.send('knowledge-updated'); } catch {} }
    }
  } catch {}
}

function startKnowledgeWatcher() {
  const ws = getWorkspace();
  const knowledgeDir = path.join(ws, 'knowledge');
  if (!fs.existsSync(knowledgeDir)) return;

  // fs.watch with debounce
  const pendingPaths = new Set();
  try {
    _knowledgeWatcher = fs.watch(knowledgeDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.join(knowledgeDir, filename);
      if (!filename.includes('files')) return;
      pendingPaths.add(fullPath);
      clearTimeout(_knowledgeWatchDebounce);
      _knowledgeWatchDebounce = setTimeout(async () => {
        const batch = [...pendingPaths];
        pendingPaths.clear();
        for (const p of batch) {
          try { await _processKnowledgeChange(p); } catch (e) { console.error('[knowledge-watch] process error:', e.message); }
        }
      }, 2000);
    });
    _knowledgeWatcher.on('error', (err) => {
      console.error('[knowledge-watch] watcher error:', err.message);
      setTimeout(startKnowledgeWatcher, 5000);
    });
  } catch (e) { console.error('[knowledge-watch] failed to start fs.watch:', e.message); }

  // Fallback polling every 60s
  _knowledgePollInterval = setInterval(async () => {
    if (_isReindexing) return;
    const db = getDocumentsDb();
    if (!db) return;
    for (const cat of getKnowledgeCategories()) {
      const diskFiles = listKnowledgeFilesFromDisk(cat);
      let dbFiles;
      try { dbFiles = db.prepare('SELECT filename FROM documents WHERE category=?').all(cat).map(r => r.filename); } catch { continue; }
      const dbSet = new Set(dbFiles);
      for (const df of diskFiles) {
        if (!dbSet.has(df.filename)) {
          try { await _processKnowledgeChange(df.filepath); } catch {}
        }
      }
    }
  }, 60000);
}

function stopKnowledgeWatcher() {
  if (_knowledgeWatcher) { try { _knowledgeWatcher.close(); } catch {} _knowledgeWatcher = null; }
  if (_knowledgePollInterval) { clearInterval(_knowledgePollInterval); _knowledgePollInterval = null; }
  clearTimeout(_knowledgeWatchDebounce);
}
```

- [ ] **Step 2: Export and wire into boot**

Add `startKnowledgeWatcher`, `stopKnowledgeWatcher` to `module.exports`. Call `startKnowledgeWatcher()` in the boot sequence **after** `migrateKnowledgeToSubfolders()` and `backfillKnowledgeFromDisk()`. Call `stopKnowledgeWatcher()` in the app quit handler.

- [ ] **Step 3: Run smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass

---

## Task 9: Open folder IPC + preload bridge

**Files:**
- Modify: `electron/lib/dashboard-ipc.js` (add IPC handler)
- Modify: `electron/preload.js:108-117` (add bridge)

- [ ] **Step 1: Add IPC handler**

In `dashboard-ipc.js`, after the existing knowledge handlers, add:

```js
ipcMain.handle('open-knowledge-folder', async (_event, { category }) => {
  try {
    const filesDir = path.join(getKnowledgeDir(category), 'files');
    fs.mkdirSync(filesDir, { recursive: true });
    const { shell } = require('electron');
    const err = await shell.openPath(filesDir);
    return { success: !err, error: err || undefined };
  } catch (e) { return { success: false, error: e.message }; }
});
```

- [ ] **Step 2: Add preload bridges**

In `electron/preload.js`, after line 117 (`knowledgeSearch`), add:

```js
  openKnowledgeFolder: (category) => ipcRenderer.invoke('open-knowledge-folder', { category }),
```

Also add the `knowledge-updated` event listener bridge:

```js
  onKnowledgeUpdated: (cb) => ipcRenderer.on('knowledge-updated', cb),
```

- [ ] **Step 3: Run smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass (preload parity check should now include the 2 new bridges)

---

## Task 10: Dashboard UI — folder button + auto-refresh

**Files:**
- Modify: `electron/ui/dashboard.html:6754` (category row rendering)
- Modify: `electron/ui/dashboard.html` (add auto-refresh handler)

- [ ] **Step 1: Add folder icon button to category row**

In `dashboard.html`, in the `renderKnowledgeFolders()` function around line 6754, add an open-folder button in the category row template. Change:

```js
      return '<div class="know-folder' + isActive + '" data-cat="' + esc(f.id) + '" onclick="selectKnowledgeFolder(\'' + esc(f.id) + '\')">'
        + '<div class="icon-wrap" data-icon="' + iconName + '"></div>'
        + '<div class="info"><div class="name">' + esc(f.label) + '</div><div class="count">' + count + ' tài liệu</div></div>'
        + deleteBtn
        + '</div>';
```

To:

```js
      const openBtn = '<button class="know-folder-open" onclick="event.stopPropagation();openKnowledgeFolder(\'' + escJs(f.id) + '\')" title="Mo thu muc tren may tinh" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;border-radius:4px;flex-shrink:0;opacity:0;transition:opacity 0.15s"><span data-icon="folder-open" data-icon-size="14"></span></button>';
      return '<div class="know-folder' + isActive + '" data-cat="' + esc(f.id) + '" onclick="selectKnowledgeFolder(\'' + esc(f.id) + '\')">'
        + '<div class="icon-wrap" data-icon="' + iconName + '"></div>'
        + '<div class="info"><div class="name">' + esc(f.label) + '</div><div class="count">' + count + ' tài liệu</div></div>'
        + openBtn
        + deleteBtn
        + '</div>';
```

- [ ] **Step 2: Add CSS for the open button (show on hover)**

In the CSS section, add after the `.know-folder-delete` hover rule:

```css
.know-folder-open { opacity:0; transition:opacity 0.15s; }
.know-folder:hover .know-folder-open { opacity:0.7; }
.know-folder:hover .know-folder-open:hover { opacity:1; }
```

- [ ] **Step 3: Add `openKnowledgeFolder()` JS function**

In the Knowledge JS section, add:

```js
async function openKnowledgeFolder(cat) {
  try {
    const r = await window.claw.openKnowledgeFolder(cat);
    if (r && !r.success) showToast('Khong mo duoc thu muc: ' + (r.error || ''), 'error');
  } catch (e) { showToast('Loi: ' + e.message, 'error'); }
}
```

- [ ] **Step 4: Add `knowledge-updated` auto-refresh listener**

In the Knowledge init section (around `knowledgeInitialized` setup), add:

```js
if (window.claw.onKnowledgeUpdated) {
  window.claw.onKnowledgeUpdated(() => {
    renderKnowledgeFolders();
    refreshKnowledgeFiles();
  });
}
```

- [ ] **Step 5: Run smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass

---

## Task 11: Final verification + commit

- [ ] **Step 1: Run full smoke test**

Run: `cd electron; node scripts/smoke-test.js`
Expected: all checks pass, no regressions

- [ ] **Step 2: Commit**

```bash
git add electron/lib/knowledge.js electron/lib/workspace.js electron/lib/dashboard-ipc.js electron/preload.js electron/ui/dashboard.html
git commit -m "feat: knowledge folder open + auto-scan watcher + subfolder visibility + migration"
```
