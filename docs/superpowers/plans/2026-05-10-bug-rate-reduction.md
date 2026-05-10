# Bug Rate Reduction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pre-flight boot verification and contract guards to catch path/config/process/native-module issues on every boot, before they cascade into silent failures.

**Architecture:** New `electron/lib/preflight.js` module exports a `guardPath()` utility and a `runPreflightChecks()` function. Guards are added inline to 5 existing modules. `runPreflightChecks()` is called in `main.js` boot sequence between `app.whenReady()` setup and `createWindow()`.

**Tech Stack:** Node.js (Electron main process), `fs`, `path`, `child_process`.

---

## Chunk 1: preflight.js module + contract guards

### Task 1: Create `electron/lib/preflight.js`

**Files:**
- Create: `electron/lib/preflight.js`

- [ ] **Step 1: Write the preflight module**

```javascript
'use strict';
const fs = require('fs');
const path = require('path');

let app;
try { app = require('electron').app; } catch {}

function guardPath(label, actual, mustBeInside) {
  if (!actual) throw new Error(`[preflight] ${label}: path is null`);
  if (mustBeInside) {
    const rel = path.relative(mustBeInside, actual);
    if (rel.startsWith('..') || path.isAbsolute(rel))
      throw new Error(`[preflight] ${label}: ${actual} escapes ${mustBeInside}`);
  }
}

function guardWritable(label, dir) {
  if (!dir) throw new Error(`[preflight] ${label}: dir is null`);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {
      throw new Error(`[preflight] ${label}: cannot create ${dir}: ${e.message}`);
    }
  }
  try { fs.accessSync(dir, fs.constants.W_OK); } catch {
    throw new Error(`[preflight] ${label}: not writable: ${dir}`);
  }
}

async function runPreflightChecks() {
  const TIMEOUT = 10000;
  const results = [];
  const deadline = Date.now() + TIMEOUT;

  const checks = [
    { name: 'paths',     critical: true,  fn: checkPaths },
    { name: 'config',    critical: true,  fn: checkConfig },
    { name: 'processes', critical: true,  fn: checkProcesses },
    { name: 'native',    critical: false, fn: checkNative },
    { name: 'model',     critical: false, fn: checkModel },
  ];

  for (const check of checks) {
    if (Date.now() > deadline) {
      results.push({ name: check.name, pass: false, critical: check.critical, message: 'Timeout — check skipped' });
      continue;
    }
    try {
      const r = await check.fn();
      results.push({ name: check.name, pass: r.pass, critical: check.critical, message: r.message });
    } catch (e) {
      results.push({ name: check.name, pass: false, critical: check.critical, message: e.message });
    }
  }

  const criticalFailures = results.filter(r => !r.pass && r.critical);
  const warnings = results.filter(r => !r.pass && !r.critical);
  const allCriticalPass = criticalFailures.length === 0;

  for (const r of results) {
    const icon = r.pass ? 'OK' : (r.critical ? 'FAIL' : 'WARN');
    console.log(`[preflight] ${icon} ${r.name}: ${r.message}`);
  }

  return { allCriticalPass, criticalFailures, warnings, results };
}

function checkPaths() {
  const { getUserDataDir, getWorkspace } = require('./workspace');
  const { getBundledVendorDir } = require('./boot');
  const { getModelDir } = require('./model-downloader');

  const ud = getUserDataDir();
  guardWritable('getUserDataDir', ud);

  const ws = getWorkspace();
  guardWritable('getWorkspace', ws);

  const vendor = getBundledVendorDir();
  if (vendor) {
    if (!fs.existsSync(vendor)) {
      return { pass: false, message: `vendor dir missing: ${vendor}` };
    }
    const nm = path.join(vendor, 'node_modules');
    if (!fs.existsSync(nm)) {
      return { pass: false, message: `vendor/node_modules missing: ${nm}` };
    }
  }

  const modelDir = getModelDir();
  guardPath('getModelDir', modelDir, ud);

  return { pass: true, message: 'All paths OK' };
}

function checkConfig() {
  const ctx = require('./context');
  const configPath = path.join(ctx.HOME, '.openclaw', 'openclaw.json');
  if (!fs.existsSync(configPath)) {
    return { pass: true, message: 'No openclaw.json yet (fresh install)' };
  }
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
    JSON.parse(raw);
  } catch (e) {
    // JSON.parse failed = corrupt file. healOpenClawConfigInline only fixes
    // schema errors (unrecognized keys), not syntax corruption. Best we can
    // do: back up the corrupt file and let ensureDefaultConfig recreate it.
    try {
      const backupPath = configPath + '.corrupt.' + Date.now();
      fs.copyFileSync(configPath, backupPath);
      fs.unlinkSync(configPath);
      return { pass: true, message: 'Config was corrupt JSON — backed up and removed for re-creation' };
    } catch (backupErr) {
      return { pass: false, message: 'Config is corrupt JSON and backup failed: ' + backupErr.message };
    }
  }
  return { pass: true, message: 'openclaw.json valid' };
}

function checkProcesses() {
  const { findNodeBin, getBundledVendorDir } = require('./boot');
  const node = findNodeBin();
  if (!node) {
    return { pass: false, message: 'Node binary not found — cron and gateway will fail' };
  }
  const vendor = getBundledVendorDir();
  if (vendor) {
    const nrDir = path.join(vendor, 'node_modules', '9router');
    if (!fs.existsSync(nrDir)) {
      return { pass: false, message: '9router package missing from vendor' };
    }
  }
  return { pass: true, message: 'Node: ' + node };
}

function checkNative() {
  try {
    require('better-sqlite3');
    return { pass: true, message: 'better-sqlite3 loads OK' };
  } catch (e) {
    if (String(e.message).includes('NODE_MODULE_VERSION')) {
      try {
        const { autoFixBetterSqlite3 } = require('./knowledge');
        const fixed = autoFixBetterSqlite3();
        if (fixed) return { pass: true, message: 'better-sqlite3 ABI auto-fixed' };
      } catch {}
    }
    return { pass: false, message: 'better-sqlite3: ' + e.message };
  }
}

function checkModel() {
  const { isModelDownloaded } = require('./model-downloader');
  if (isModelDownloaded()) {
    return { pass: true, message: 'RAG model present' };
  }
  return { pass: false, message: 'RAG model missing — will download on splash' };
}

module.exports = {
  guardPath,
  guardWritable,
  runPreflightChecks,
};
```

- [ ] **Step 2: Verify module loads without error**

Run: `node -e "require('./electron/lib/preflight')"`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add electron/lib/preflight.js
git commit -m "feat: add preflight boot verification module"
```

---

### Task 2: Add contract guards to `model-downloader.js`

**Files:**
- Modify: `electron/lib/model-downloader.js:41-57` (`getModelDir`), line 59 (`getModelFilePath`)

- [ ] **Step 1: Add guard to `getModelDir()`**

After the migration logic and before `return dest;` (line 56), add:

```javascript
  // Contract guard: model dir must be inside userData (packaged only)
  try {
    if (app && app.isPackaged) {
      const { guardPath } = require('./preflight');
      guardPath('getModelDir', dest, getUserDataDir());
    }
  } catch (e) {
    console.error(e.message);
  }
```

- [ ] **Step 2: Add guard to `getModelFilePath()`**

Replace the single-line `getModelFilePath` with:

```javascript
function getModelFilePath(filename) {
  const dir = getModelDir();
  const full = path.join(dir, filename);
  try {
    const { guardPath } = require('./preflight');
    guardPath('getModelFilePath', full, dir);
  } catch (e) {
    console.error(e.message);
  }
  return full;
}
```

- [ ] **Step 3: Verify module loads**

Run: `node -e "require('./electron/lib/model-downloader')"`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add electron/lib/model-downloader.js
git commit -m "feat: add path contract guards to model-downloader"
```

---

### Task 3: Add contract guard to `workspace.js`

**Files:**
- Modify: `electron/lib/workspace.js:68-108` (`getWorkspace`)

- [ ] **Step 1: Add writable guard to BOTH return paths**

`getWorkspace()` has two return paths: packaged (line 98) and dev (line 107). Both must be guarded. Add a helper at the top of the function body and call it before each return:

After `if (_workspaceCached) return _workspaceCached;` (line 69), add nothing — cached path already passed the guard on first call.

Before `return _workspaceCached;` at line 98 (packaged path), add:

```javascript
    try {
      const { guardWritable } = require('./preflight');
      guardWritable('getWorkspace', _workspaceCached);
    } catch (e) {
      console.warn('[getWorkspace] guard failed:', e.message);
    }
```

Before `return _workspaceCached;` at line 107 (dev path), add the same block:

```javascript
  try {
    const { guardWritable } = require('./preflight');
    guardWritable('getWorkspace', _workspaceCached);
  } catch (e) {
    console.warn('[getWorkspace] guard failed:', e.message);
  }
```

- [ ] **Step 2: Verify module loads**

Run: `node -e "require('./electron/lib/workspace')"`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add electron/lib/workspace.js
git commit -m "feat: add writable guard to getWorkspace()"
```

---

### Task 4: Add contract guard to `boot.js`

**Files:**
- Modify: `electron/lib/boot.js:35-47` (`getBundledVendorDir`)

- [ ] **Step 1: Add structure guard when vendor dir is found**

In `getBundledVendorDir()`, after `if (fs.existsSync(userDataVendor)) return userDataVendor;` (line 43), replace with:

```javascript
    if (fs.existsSync(userDataVendor)) {
      const nm = path.join(userDataVendor, 'node_modules');
      if (!fs.existsSync(nm)) {
        console.warn('[preflight] getBundledVendorDir: vendor/ exists but node_modules missing');
      }
      return userDataVendor;
    }
```

- [ ] **Step 2: Verify module loads**

Run: `node -e "require('./electron/lib/boot')"`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add electron/lib/boot.js
git commit -m "feat: add structure guard to getBundledVendorDir()"
```

---

### Task 5: Add contract guard to `config.js`

**Files:**
- Modify: `electron/lib/config.js:291+` (`writeOpenClawConfigIfChanged`)

- [ ] **Step 1: Add JSON validity assertion before write**

At the top of `writeOpenClawConfigIfChanged`, after `sanitizeOpenClawConfigInPlace(config)` and `const serialized = ...`, add:

```javascript
    // Contract guard: verify serialization round-trips
    try { JSON.parse(serialized); } catch (e) {
      console.error('[preflight] writeOpenClawConfigIfChanged: serialized config is invalid JSON:', e.message);
      return false;
    }
```

- [ ] **Step 2: Commit**

```bash
git add electron/lib/config.js
git commit -m "feat: add JSON validity guard to writeOpenClawConfigIfChanged"
```

---

### Task 6: Add contract guard to `spawnOpenClawSafe` in `boot.js`

**Files:**
- Modify: `electron/lib/boot.js:550+` (`spawnOpenClawSafe`)

- [ ] **Step 1: Add node binary existence assertion**

Inside `spawnOpenClawSafe`, in the preferred path branch (after `cmd = nodeBin; spawnArgs = [cliJs, ...args];`, around line 555), add:

```javascript
    if (!fs.existsSync(nodeBin)) {
      console.error('[preflight] spawnOpenClawSafe: nodeBin does not exist:', nodeBin);
      return { code: -1, stdout: '', stderr: `Node binary not found at ${nodeBin}`, viaCmdShell: false };
    }
```

- [ ] **Step 2: Commit**

```bash
git add electron/lib/boot.js
git commit -m "feat: add node binary guard to spawnOpenClawSafe"
```

---

## Chunk 2: Wire preflight into boot sequence

### Task 7: Call `runPreflightChecks()` in main.js boot

**Files:**
- Modify: `electron/main.js:819-828` (between `bootDiagRunFullCheck` and `installEmbedHeaderStripper`)

- [ ] **Step 1: Add preflight import**

At the top of main.js imports section, add:

```javascript
const { runPreflightChecks } = require('./lib/preflight');
```

- [ ] **Step 2: Wire preflight into boot sequence**

Between the `bootDiagRunFullCheck` call (line 825) and `installEmbedHeaderStripper` (line 827), insert:

```javascript
  // Pre-flight verification — catches path/config/process issues before they cascade
  try {
    const pf = await runPreflightChecks();
    if (!pf.allCriticalPass) {
      const failMsgs = pf.criticalFailures.map(f => `${f.name}: ${f.message}`).join('\n');
      console.error('[boot] CRITICAL preflight failures:\n' + failMsgs);
      try { auditLog('preflight_critical_failure', { failures: pf.criticalFailures }); } catch {}
    }
  } catch (e) {
    console.warn('[boot] preflight error (non-fatal):', e?.message || e);
  }
```

This logs failures but does NOT block boot — the existing splash error UI handles blocking when the actual operation fails downstream. The preflight output gives immediate diagnostic visibility.

- [ ] **Step 3: Verify main.js loads**

Run: `node -e "require('./electron/main')"`  
Expected: may fail (no Electron runtime), but import line should parse without syntax error. Verify by checking no SyntaxError in output.

- [ ] **Step 4: Commit**

```bash
git add electron/main.js
git commit -m "feat: wire preflight checks into boot sequence"
```

---

### Task 8: Smoke test

- [ ] **Step 1: Run existing smoke test**

Run: `npm run smoke` from `electron/` directory.
Expected: exits 0.

- [ ] **Step 2: Manual verification**

Launch the app (`npm start` or `RUN.bat`). Check console output for:
- `[preflight] OK paths: All paths OK`
- `[preflight] OK config: openclaw.json valid`
- `[preflight] OK processes: Node: <path>`
- `[preflight] OK native: better-sqlite3 loads OK` or `WARN native: ...`
- `[preflight] OK model: RAG model present` or `WARN model: ...`

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: preflight smoke test verified"
```
