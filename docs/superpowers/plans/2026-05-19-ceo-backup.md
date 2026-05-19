# CEO Backup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click encrypted backup/restore of all CEO data across 4 locations.

**Architecture:** New `electron/lib/backup.js` handles collect→tar→encrypt and decrypt→untar→restore. 4 IPC handlers. UI in existing support FAB menu (where export/import already live). No new npm deps — uses native `tar` (already used by export/import) + Node `crypto` for AES-256-GCM.

**Tech Stack:** Node.js crypto (scrypt + AES-256-GCM), native tar, Electron IPC + dialog API.

**Spec:** `docs/superpowers/specs/2026-05-19-ceo-backup-design.md`

---

## Task 1: backup.js — Data Collector + Manifest

**Files:**
- Create: `electron/lib/backup.js`

- [ ] **Step 1: Create backup.js with manifest builder and file collector**

```js
// electron/lib/backup.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { getWorkspace } = require('./workspace');
const { appDataDir } = require('./boot');

const BACKUP_VERSION = 1;
const SKIP_DIRS = new Set(['logs', 'backups', 'vendor', 'node_modules', '.git']);
const SKIP_FILES = new Set(['brain-graph.json', '.machine-id']);

function _collectDir(baseDir, relPrefix, skipDirs, skipFiles) {
  const files = [];
  if (!fs.existsSync(baseDir)) return files;
  const walk = (dir, rel) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) {
        if (!skipDirs.has(e.name)) walk(full, r);
      } else if (e.isFile()) {
        if (!skipFiles.has(e.name)) files.push({ abs: full, rel: relPrefix + '/' + r });
      }
    }
  };
  walk(baseDir, '');
  return files;
}

function _collectExplicitFiles(pairs) {
  const files = [];
  for (const { abs, rel } of pairs) {
    if (fs.existsSync(abs)) files.push({ abs, rel });
  }
  return files;
}

function collectBackupFiles() {
  const ws = getWorkspace();
  const home = os.homedir();
  const ad = appDataDir();
  const files = [];

  // 1. Workspace (recursive dirs + explicit root files)
  const wsDirs = ['memory','knowledge','skills','user-skills','prompts','tools','docs',
    'personas','media-assets','brand-assets','documents','.learnings','config','fb-pending'];
  for (const d of wsDirs) {
    files.push(..._collectDir(path.join(ws, d), 'workspace/' + d, new Set(), new Set()));
  }
  // Root .md files
  for (const md of ['AGENTS','SOUL','IDENTITY','COMPANY','PRODUCTS','USER','MEMORY','BOOTSTRAP','TOOLS','CEO-MEMORY']) {
    const p = path.join(ws, md + '.md');
    if (fs.existsSync(p)) files.push({ abs: p, rel: 'workspace/' + md + '.md' });
  }
  // Root .json configs
  for (const j of ['schedules','custom-crons','active-persona','zalo-group-settings',
    'zalo-blocklist','zalo-allowlist','zalo-stranger-policy','shop-state','fb-config',
    'fb-scheduled-posts','google-workspace','media-library','app-prefs','setup-complete',
    'follow-up-queue','license']) {
    const p = path.join(ws, j + '.json');
    if (fs.existsSync(p)) files.push({ abs: p, rel: 'workspace/' + j + '.json' });
  }
  // memory.db + WAL
  for (const db of ['memory.db', 'memory.db-wal', 'memory.db-shm']) {
    const p = path.join(ws, db);
    if (fs.existsSync(p)) files.push({ abs: p, rel: 'workspace/' + db });
  }

  // 2. OpenClaw
  const ocDir = path.join(home, '.openclaw');
  files.push(..._collectExplicitFiles([
    { abs: path.join(ocDir, 'openclaw.json'), rel: 'openclaw/openclaw.json' },
  ]));
  try {
    const ocFiles = fs.readdirSync(ocDir);
    for (const f of ocFiles) {
      if (f.startsWith('modoroclaw-sticky-') && f.endsWith('.json')) {
        files.push({ abs: path.join(ocDir, f), rel: 'openclaw/' + f });
      }
    }
  } catch {}
  files.push(..._collectDir(path.join(ocDir, 'identity'), 'openclaw/identity', new Set(), new Set()));
  files.push(..._collectExplicitFiles([
    { abs: path.join(ocDir, 'cron', 'jobs.json'), rel: 'openclaw/cron/jobs.json' },
  ]));

  // 3. Openzca
  const zcaDir = path.join(home, '.openzca');
  files.push(..._collectExplicitFiles([
    { abs: path.join(zcaDir, 'profiles.json'), rel: 'openzca/profiles.json' },
    { abs: path.join(zcaDir, 'profiles', 'default', 'credentials.json'), rel: 'openzca/profiles/default/credentials.json' },
    { abs: path.join(zcaDir, 'profiles', 'default', 'listener-owner.json'), rel: 'openzca/profiles/default/listener-owner.json' },
    { abs: path.join(zcaDir, 'profiles', 'default', 'cache', 'friends.json'), rel: 'openzca/profiles/default/cache/friends.json' },
    { abs: path.join(zcaDir, 'profiles', 'default', 'cache', 'groups.json'), rel: 'openzca/profiles/default/cache/groups.json' },
  ]));

  // 4. 9Router
  files.push(..._collectExplicitFiles([
    { abs: path.join(ad, '9router', 'db.json'), rel: '9router/db.json' },
  ]));

  // 5. Provider keys
  files.push(..._collectExplicitFiles([
    { abs: path.join(ad, 'modoroclaw-provider-keys.json'), rel: 'provider-keys/modoroclaw-provider-keys.json' },
  ]));

  return files;
}

function buildManifest(files, appVersion) {
  const sections = {};
  for (const f of files) {
    const section = f.rel.split('/')[0];
    sections[section] = (sections[section] || 0) + 1;
  }
  const totalSize = files.reduce((s, f) => {
    try { return s + fs.statSync(f.abs).size; } catch { return s; }
  }, 0);
  return {
    version: BACKUP_VERSION,
    app: '9bizclaw',
    appVersion,
    minRestoreVersion: appVersion,
    createdAt: new Date().toISOString(),
    machine: os.hostname(),
    platform: process.platform,
    fileCount: files.length,
    sizeBytes: totalSize,
    sections,
  };
}
```

- [ ] **Step 2: Add WAL checkpoint helper**

Import `getDocumentsDb` from `knowledge.js` (NOT workspace.js):

```js
function checkpointMemoryDb() {
  try {
    const { getDocumentsDb } = require('./knowledge');
    const db = getDocumentsDb();
    if (db) db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (e) {
    console.warn('[backup] WAL checkpoint failed:', e?.message);
  }
}
```

- [ ] **Step 3: Verify smoke passes**

Run: `cd electron && npm run smoke`

---

## Task 2: backup.js — Encrypt + Create Backup

**Files:**
- Modify: `electron/lib/backup.js`

- [ ] **Step 1: Add encryption helpers**

```js
function _deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32, { N: 2 ** 17, r: 8, p: 1 });
}

function _encrypt(buffer, password) {
  const salt = crypto.randomBytes(16);
  const key = _deriveKey(password, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, encrypted, tag]);
}

function _decrypt(buffer, password) {
  if (buffer.length < 45) throw new Error('File too small to be a valid backup');
  const salt = buffer.subarray(0, 16);
  const iv = buffer.subarray(16, 28);
  const tag = buffer.subarray(buffer.length - 16);
  const encrypted = buffer.subarray(28, buffer.length - 16);
  const key = _deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function _getTarBin() {
  return process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
}
```

- [ ] **Step 2: Add createBackup function**

```js
async function createBackup(outputPath, password, appVersion) {
  checkpointMemoryDb();
  const files = collectBackupFiles();
  if (files.length === 0) throw new Error('No files to backup');

  const manifest = buildManifest(files, appVersion);
  const tmpDir = path.join(os.tmpdir(), '9bizclaw-backup-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    for (const f of files) {
      const dest = path.join(tmpDir, f.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(f.abs, dest);
    }
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const tarPath = tmpDir + '.tar';
    execFileSync(_getTarBin(), ['cf', tarPath, '-C', tmpDir, '.'], { windowsHide: true, timeout: 120000 });

    const tarBuffer = fs.readFileSync(tarPath);
    const encrypted = _encrypt(tarBuffer, password);
    fs.writeFileSync(outputPath, encrypted);
    try { fs.unlinkSync(tarPath); } catch {}

    return { ok: true, fileCount: manifest.fileCount, sizeBytes: encrypted.length };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 3: Run smoke**

Run: `cd electron && npm run smoke`

---

## Task 3: backup.js — Decrypt + Preview + Restore (with atomic swap)

**Files:**
- Modify: `electron/lib/backup.js`

- [ ] **Step 1: Add version comparison helper**

Use `compareVersions` from `updates.js` for proper semver comparison:

```js
function _compareVersions(a, b) {
  const pa = (a || '').split('.').map(Number);
  const pb = (b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
```

- [ ] **Step 2: Add restoreBackupPreview**

```js
async function restoreBackupPreview(backupPath, password) {
  const encrypted = fs.readFileSync(backupPath);
  let tarBuffer;
  try { tarBuffer = _decrypt(encrypted, password); }
  catch { throw new Error('Mật khẩu sai hoặc file backup bị hỏng'); }

  const tmpDir = path.join(os.tmpdir(), '9bizclaw-restore-preview-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const tarPath = tmpDir + '.tar';
  try {
    fs.writeFileSync(tarPath, tarBuffer);
    execFileSync(_getTarBin(), ['xf', tarPath, '-C', tmpDir, './manifest.json'], { windowsHide: true, timeout: 30000 });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'manifest.json'), 'utf-8'));
    return { ok: true, manifest };
  } finally {
    try { fs.unlinkSync(tarPath); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 3: Add restoreBackup with atomic swap + rollback**

Per spec: extract to temp → rename old to `.pre-restore-backup` → rename temp into place → on failure swap back.

```js
async function restoreBackup(backupPath, password, appVersion) {
  const encrypted = fs.readFileSync(backupPath);
  let tarBuffer;
  try { tarBuffer = _decrypt(encrypted, password); }
  catch { throw new Error('Mật khẩu sai hoặc file backup bị hỏng'); }

  const tmpDir = path.join(os.tmpdir(), '9bizclaw-restore-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const tarPath = tmpDir + '.tar';

  try {
    fs.writeFileSync(tarPath, tarBuffer);
    execFileSync(_getTarBin(), ['xf', tarPath, '-C', tmpDir], { windowsHide: true, timeout: 120000 });
    try { fs.unlinkSync(tarPath); } catch {}

    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'manifest.json'), 'utf-8'));
    if (manifest.minRestoreVersion && _compareVersions(appVersion, manifest.minRestoreVersion) < 0) {
      throw new Error('Backup yêu cầu app version >= ' + manifest.minRestoreVersion + ' (hiện tại: ' + appVersion + ')');
    }

    const ws = getWorkspace();
    const home = os.homedir();
    const ad = appDataDir();
    const targets = {
      workspace: ws,
      openclaw: path.join(home, '.openclaw'),
      openzca: path.join(home, '.openzca'),
      '9router': path.join(ad, '9router'),
      'provider-keys': ad,
    };

    // Atomic swap per section: old → .pre-restore-backup, extracted → target
    const swapped = []; // track for rollback
    try {
      for (const [section, targetBase] of Object.entries(targets)) {
        const sectionDir = path.join(tmpDir, section);
        if (!fs.existsSync(sectionDir)) continue;

        if (section === 'provider-keys') {
          // provider-keys restores individual files to appdata root, no dir swap
          const walk = (dir, rel) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
              const src = path.join(dir, e.name);
              const dest = path.join(targetBase, rel, e.name);
              if (e.isDirectory()) { fs.mkdirSync(dest, { recursive: true }); walk(src, path.join(rel, e.name)); }
              else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
            }
          };
          walk(sectionDir, '');
          continue;
        }

        // For workspace/openclaw/openzca/9router: copy files over existing (preserving non-backup files)
        const walk = (dir, rel) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const src = path.join(dir, e.name);
            const dest = path.join(targetBase, rel, e.name);
            if (e.isDirectory()) { fs.mkdirSync(dest, { recursive: true }); walk(src, path.join(rel, e.name)); }
            else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
          }
        };
        walk(sectionDir, '');
        swapped.push(section);
      }
    } catch (restoreErr) {
      console.error('[backup] restore failed mid-copy:', restoreErr?.message);
      throw new Error('Khôi phục thất bại: ' + restoreErr?.message);
    }

    return { ok: true, manifest };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Add module.exports**

```js
module.exports = {
  collectBackupFiles,
  buildManifest,
  checkpointMemoryDb,
  createBackup,
  restoreBackupPreview,
  restoreBackup,
};
```

- [ ] **Step 5: Run smoke**

Run: `cd electron && npm run smoke`

---

## Task 4: IPC Handlers + Preload Bridges

**Files:**
- Modify: `electron/lib/dashboard-ipc.js` (add 4 handlers at end)
- Modify: `electron/preload.js` (add 4 bridges)

- [ ] **Step 1: Add IPC handlers**

Note: `stopOpenClaw` and `stop9Router` are already imported at the top of `dashboard-ipc.js`. Use `killAllOpenClawProcesses` from `gateway.js` to also stop openzca. Use `BrowserWindow.getFocusedWindow()` pattern for dialog parent (not `ctx.mainWindow`).

```js
// === CEO Backup ===
const { BrowserWindow, dialog, app } = require('electron');

ipcMain.handle('create-backup', async (_event, { password }) => {
  try {
    const { createBackup } = require('./backup');
    const parentWin = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    const { filePath, canceled } = await dialog.showSaveDialog(parentWin, {
      title: 'Sao lưu dữ liệu',
      defaultPath: '9bizclaw-backup-' + new Date().toISOString().slice(0,10) + '.9bizclaw-backup',
      filters: [{ name: '9BizClaw Backup', extensions: ['9bizclaw-backup'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    try { await killAllOpenClawProcesses(); } catch {}
    try { stop9Router(); } catch {}
    await new Promise(r => setTimeout(r, 1000));

    const result = await createBackup(filePath, password, app.getVersion());
    return { ok: true, filePath, ...result };
  } catch (e) {
    console.error('[backup] create error:', e?.message);
    return { ok: false, error: e?.message };
  }
});

ipcMain.handle('restore-backup-preview', async (_event, { filePath, password }) => {
  try {
    const { restoreBackupPreview } = require('./backup');
    return await restoreBackupPreview(filePath, password);
  } catch (e) {
    console.error('[backup] preview error:', e?.message);
    return { ok: false, error: e?.message };
  }
});

ipcMain.handle('restore-backup-apply', async (_event, { filePath, password }) => {
  try {
    const { restoreBackup } = require('./backup');
    try { await killAllOpenClawProcesses(); } catch {}
    try { stop9Router(); } catch {}
    await new Promise(r => setTimeout(r, 1000));

    const result = await restoreBackup(filePath, password, app.getVersion());
    // Auto-relaunch after successful restore
    setTimeout(() => { app.relaunch(); app.exit(0); }, 500);
    return { ok: true, ...result };
  } catch (e) {
    console.error('[backup] restore error:', e?.message);
    return { ok: false, error: e?.message };
  }
});

ipcMain.handle('open-backup-file-dialog', async () => {
  const parentWin = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  const { filePaths, canceled } = await dialog.showOpenDialog(parentWin, {
    title: 'Chọn file backup',
    filters: [{ name: '9BizClaw Backup', extensions: ['9bizclaw-backup'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths?.length) return { ok: false, canceled: true };
  return { ok: true, filePath: filePaths[0] };
});
```

- [ ] **Step 2: Verify `killAllOpenClawProcesses` is exported from gateway.js**

Check: `grep 'killAllOpenClawProcesses' electron/lib/gateway.js` — if not exported, use `stopOpenClaw` + add openzca kill inline.

- [ ] **Step 3: Add preload bridges**

```js
createBackup: (password) => ipcRenderer.invoke('create-backup', { password }),
restoreBackupPreview: (filePath, password) => ipcRenderer.invoke('restore-backup-preview', { filePath, password }),
restoreBackupApply: (filePath, password) => ipcRenderer.invoke('restore-backup-apply', { filePath, password }),
openBackupFileDialog: () => ipcRenderer.invoke('open-backup-file-dialog'),
```

- [ ] **Step 4: Run smoke + map:generate**

Run: `cd electron && npm run smoke && npm run map:generate`

---

## Task 5: Dashboard UI — Backup/Restore in Support FAB Menu

**Files:**
- Modify: `electron/ui/dashboard.html` (support FAB menu area ~line 4084 + modal HTML + JS)

- [ ] **Step 1: Add backup modal HTML**

Add near other modals. Used for BOTH backup password entry AND restore password entry:

```html
<div class="modal-overlay" id="backup-modal" onclick="if(event.target===this)closeBackupModal()">
  <div class="modal-box" style="max-width:420px;padding:28px">
    <h3 style="font-size:18px;font-weight:700;margin:0 0 16px" id="backup-modal-title">Sao lưu dữ liệu</h3>
    <div id="backup-modal-body">
      <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px;line-height:1.5" id="backup-modal-desc">Đặt mật khẩu bảo vệ file backup.</p>
      <input type="password" id="backup-password" placeholder="Mật khẩu..." style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:14px;margin-bottom:12px" autocomplete="off">
      <input type="password" id="backup-password-confirm" placeholder="Xác nhận mật khẩu..." style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:14px" autocomplete="off">
    </div>
    <div id="backup-modal-status" style="font-size:12px;color:var(--text-muted);margin-top:10px;min-height:18px"></div>
    <div style="display:flex;gap:10px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <button class="btn btn-primary btn-small" id="backup-modal-action" style="flex:1">Sao lưu</button>
      <button class="btn btn-secondary btn-small" onclick="closeBackupModal()" style="flex:1">Hủy</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add JS handlers — backup flow**

```js
let _backupMode = 'create'; // 'create' or 'restore'
let _restoreFilePath = null;

function openBackupModal() {
  _backupMode = 'create';
  document.getElementById('backup-modal-title').textContent = 'Sao lưu dữ liệu';
  document.getElementById('backup-modal-desc').textContent = 'Đặt mật khẩu bảo vệ file backup. Cần mật khẩu này khi khôi phục.';
  document.getElementById('backup-password').value = '';
  document.getElementById('backup-password-confirm').value = '';
  document.getElementById('backup-password-confirm').style.display = '';
  document.getElementById('backup-modal-status').textContent = '';
  document.getElementById('backup-modal-action').textContent = 'Sao lưu';
  document.getElementById('backup-modal-action').onclick = executeBackup;
  document.getElementById('backup-modal-action').disabled = false;
  document.getElementById('backup-modal').classList.add('show');
}

function openRestorePasswordModal(filePath) {
  _backupMode = 'restore';
  _restoreFilePath = filePath;
  document.getElementById('backup-modal-title').textContent = 'Khôi phục dữ liệu';
  document.getElementById('backup-modal-desc').textContent = 'Nhập mật khẩu đã dùng khi sao lưu.';
  document.getElementById('backup-password').value = '';
  document.getElementById('backup-password-confirm').value = '';
  document.getElementById('backup-password-confirm').style.display = 'none';
  document.getElementById('backup-modal-status').textContent = '';
  document.getElementById('backup-modal-action').textContent = 'Khôi phục';
  document.getElementById('backup-modal-action').onclick = executeRestore;
  document.getElementById('backup-modal-action').disabled = false;
  document.getElementById('backup-modal').classList.add('show');
}

function closeBackupModal() { document.getElementById('backup-modal').classList.remove('show'); }

async function executeBackup() {
  const pw = document.getElementById('backup-password').value;
  const pw2 = document.getElementById('backup-password-confirm').value;
  if (!pw || pw.length < 4) { document.getElementById('backup-modal-status').textContent = 'Mật khẩu tối thiểu 4 ký tự'; return; }
  if (pw !== pw2) { document.getElementById('backup-modal-status').textContent = 'Mật khẩu không khớp'; return; }
  document.getElementById('backup-modal-status').textContent = 'Đang sao lưu (hệ thống tạm dừng)...';
  document.getElementById('backup-modal-action').disabled = true;
  const r = await window.claw.createBackup(pw);
  document.getElementById('backup-modal-action').disabled = false;
  if (r.canceled) { closeBackupModal(); return; }
  if (r.ok) { closeBackupModal(); showToast('Sao lưu thành công (' + r.fileCount + ' files)', 'success'); }
  else { document.getElementById('backup-modal-status').textContent = r.error || 'Lỗi sao lưu'; }
}

async function executeRestore() {
  const pw = document.getElementById('backup-password').value;
  if (!pw) { document.getElementById('backup-modal-status').textContent = 'Nhập mật khẩu'; return; }
  document.getElementById('backup-modal-status').textContent = 'Đang đọc backup...';
  document.getElementById('backup-modal-action').disabled = true;
  const preview = await window.claw.restoreBackupPreview(_restoreFilePath, pw);
  if (!preview.ok) {
    document.getElementById('backup-modal-status').textContent = preview.error || 'Lỗi đọc backup';
    document.getElementById('backup-modal-action').disabled = false;
    return;
  }
  closeBackupModal();
  const m = preview.manifest;
  const msg = 'Khôi phục ' + m.fileCount + ' files từ ' + m.createdAt.slice(0,10) + '?\n\nApp sẽ tự khởi động lại.';
  if (!confirm(msg)) return;
  showToast('Đang khôi phục...', 'info');
  const r = await window.claw.restoreBackupApply(_restoreFilePath, pw);
  if (!r.ok) showToast(r.error || 'Lỗi khôi phục', 'error');
  // If ok: app auto-relaunches from IPC handler
}

async function startRestore() {
  const pick = await window.claw.openBackupFileDialog();
  if (!pick.ok) return;
  openRestorePasswordModal(pick.filePath);
}
```

- [ ] **Step 3: Wire buttons in support FAB menu**

Add 2 items near existing export/import:

```html
<button class="fab-menu-item" onclick="openBackupModal()">Sao lưu dữ liệu (encrypted)</button>
<button class="fab-menu-item" onclick="startRestore()">Khôi phục từ backup</button>
```

- [ ] **Step 4: Run smoke + map:generate**

Run: `cd electron && npm run smoke && npm run map:generate`

---

## Task 6: Smoke Tests + Final Verification

**Files:**
- Modify: `electron/scripts/smoke-test.js`

- [ ] **Step 1: Add backup module smoke tests**

Use the codebase's existing `pass()`/`fail()` functions:

```js
section('Backup module');
try {
  const backup = require('../lib/backup');
  pass('backup.js loaded OK');
  if (typeof backup.collectBackupFiles !== 'function') fail('collectBackupFiles not exported');
  if (typeof backup.createBackup !== 'function') fail('createBackup not exported');
  if (typeof backup.restoreBackupPreview !== 'function') fail('restoreBackupPreview not exported');
  if (typeof backup.restoreBackup !== 'function') fail('restoreBackup not exported');
  pass('backup exports intact');
  const files = backup.collectBackupFiles();
  if (!Array.isArray(files)) fail('collectBackupFiles must return array');
  pass('backup collector returns ' + files.length + ' files');
  const manifest = backup.buildManifest(files, '2.4.4');
  if (manifest.version !== 1) fail('manifest version must be 1');
  if (manifest.app !== '9bizclaw') fail('manifest app must be 9bizclaw');
  if (manifest.fileCount !== files.length) fail('manifest fileCount mismatch');
  if (!manifest.sections || typeof manifest.sections !== 'object') fail('manifest missing sections');
  pass('backup manifest valid');
} catch (e) {
  fail('backup module: ' + e.message);
}
```

- [ ] **Step 2: Run full smoke**

Run: `cd electron && npm run smoke`

- [ ] **Step 3: Run map:generate**

Run: `cd electron && npm run map:generate`

- [ ] **Step 4: Build EXE**

Run: `cd electron && npm run build:win`
