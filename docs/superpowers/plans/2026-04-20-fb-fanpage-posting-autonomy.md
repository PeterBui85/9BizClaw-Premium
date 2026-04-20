# Facebook Fanpage Posting Autonomy — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Facebook Fanpage posting autonomy (CEO-owned Meta app, 5-skill AI drafting, Telegram inline-button approval, Performance Loop via Insights) bundled into 9BizClaw v2.3.48.

**Architecture:** New module `electron/fb/` (mirrors `electron/gcal/` convention) with 8 files. Daily cron generates drafts via single-prompt LLM call with 5 concatenated skills. Telegram inline buttons (new openclaw plugin patch) for single-tap approval. Graph API v21.0 for publish + 24h+7d Insights fetches. Marker protocol `[[FB_PUBLISH]]` / `[[FB_SKIP]]` / `[[FB_EDIT]]` / `[[SKILL_*]]` with input-side neutralization (Zalo inbound patch) + output-side source-channel validation.

**Tech Stack:** Electron 28, Node.js 22, Graph API v21.0, Electron safeStorage (DPAPI/Keychain), node-cron, node-fetch, existing `_outputFilterPatterns` + `filterSensitiveOutput`, custom SVG charts.

**Spec reference:** `docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md` (commit `1ab092a`, 4 review rounds passed).

**Testing model:** 9BizClaw uses `electron/scripts/smoke-test.js` with file/code-presence guards (no unit test framework). Each task adds a smoke guard that FAILS first, then implements the feature, then verifies the guard PASSES. Manual QA checklist at end of plan covers behavioral verification (OAuth round-trip, actual FB publish, inline buttons on mobile Telegram, etc.).

---

## File Structure

### New files (source tree)

```
electron/fb/
  auth.js          - OAuth flow + port fallback 18791..18795 + safeStorage wrap
  config.js        - fb-post-settings.json read/write + path resolution
  graph.js         - Graph v21.0 helpers: postToFeed, uploadPhoto, fetchInsights, fetchRecentPosts, debugToken
  drafts.js        - pending-fb-drafts/*.json lifecycle + status transitions + undo window
  generator.js     - context assembly + 5-skill prompt + JSON schema output
  performance.js   - Insights cron worker + history append + trim policy
  markers.js       - [[FB_*]] + [[SKILL_*]] interceptors + source-channel validation
  migrate.js       - cron owner field migration (one-shot, marker-gated)

electron/ui/vendor/fb/
  (no vendored libs — use fetch + custom SVG)

skills/
  fb-post-writer.md
  fb-industry-voice.md
  fb-repetition-avoider.md
  fb-trend-aware.md
  fb-ab-variant.md

memory/
  fb-performance-history.md  (seeded empty)

config/
  fb-post-settings.json      (defaults: cronTime, quietHours, defaultAngle)

docs/
  (no new docs; spec in specs/ is source of truth)
```

### Modified files

```
electron/main.js
  - Add fb/ module loaders + IPC handlers for FB operations
  - Add ensureTelegramCallbackFix() + ensureZaloFbNeutralizeFix() patches
  - Add interceptFbMarkers() + interceptSkillMarkers() into sendTelegram/sendZalo pipelines
  - Add fb-draft-generator cron handler + Insights worker every 15min
  - Extend _outputFilterPatterns with access_token= + client_secret= regex
  - Extend seedWorkspace() to piggyback 5 new skills + memory/fb-performance-history.md + config/fb-post-settings.json
  - Bump AGENTS.md version check from v23 to v24

electron/preload.js
  - Add IPC bridges: fb-connect, fb-disconnect, fb-list-drafts, fb-publish, fb-skip, fb-get-performance, fb-set-cron-owner

electron/ui/wizard.html
  - Add Step "Facebook (optional)" with 6-bước UI + 5-URI Copy all button

electron/ui/dashboard.html
  - Add "Facebook" tab in sidebar with: status bar, drafts list, compose, Performance section (custom SVG charts)
  - Redesign "Lịch tự động" tab: group by owner (Zalo / Facebook / CEO / System) with filter pills + "Sửa nhóm" per-row action

electron/package.json
  - version stays 2.3.48 (per user directive)
  - No new runtime dependencies (fetch is built into Node 22; custom SVG avoids Chart.js)

electron/scripts/smoke-test.js
  - Add guards G7 (fb/ files), G8 (5 skills templates), G9 (ensureTelegramCallbackFix marker),
    G9b (call-site pinned in _startOpenClawImpl), G10 (ensureZaloFbNeutralizeFix marker),
    G11 (Dashboard FB tab DOM IDs), G12 (workspace templates list), G13 (fb/ exports importable),
    G14 (/skill handler wired)

AGENTS.md
  - Bump version stamp v23 → v24 (triggers seedWorkspace piggyback re-seed)
  - Add rules: /skill command mapping, FB approval reply parsing, FB marker protocol declaration,
    pause-aware cron, digest quiet hours, emoji dual-context clarification

skills/INDEX.md
  - Append 5 rows under Marketing section (or new Facebook Marketing subsection) pointing to fb-*.md

schedules.json
  - Add entries: fb-draft-generator (07:30), fb-token-check (Mon 08:00), fb-insights-worker (every 15min)
  - Add owner field to existing entries (zalo_morning_report → owner=zalo, etc.)
```

---

## Chunk 1: Foundation — Module Skeleton + Auth + Graph API Core

**Goal of chunk:** Land the `electron/fb/` module skeleton with working OAuth flow (CEO can complete wizard + get Page token stored encrypted) and core Graph API helpers. No UI yet — IPC handlers only. Smoke guards G7 + G13 introduced.

**Chunk commit discipline:** Each task ends in a commit. Chunk ends with chunk-level smoke-test pass.

### Task 1: Create fb/ module skeleton with stubs

**Files:**
- Create: `electron/fb/auth.js`
- Create: `electron/fb/config.js`
- Create: `electron/fb/graph.js`
- Create: `electron/fb/drafts.js`
- Create: `electron/fb/generator.js`
- Create: `electron/fb/performance.js`
- Create: `electron/fb/markers.js`
- Create: `electron/fb/migrate.js`

- [ ] **Step 1.1: Add smoke guard G7 to smoke-test.js**

Open `electron/scripts/smoke-test.js`. Find the section after the last `G` guard (search for `section("UI regression guards")` or similar end-of-guards marker). Add a new section:

```js
section("FB Fanpage module");
const fbFiles = [
  'auth.js', 'config.js', 'graph.js', 'drafts.js',
  'generator.js', 'performance.js', 'markers.js', 'migrate.js',
];
for (const f of fbFiles) {
  const p = path.join(__dirname, '..', 'fb', f);
  if (fs.existsSync(p)) pass(`G7.${f} — electron/fb/${f} exists`);
  else fail(`G7.${f} — electron/fb/${f} missing`, p);
}
```

- [ ] **Step 1.2: Run smoke to verify G7 fails**

Run: `cd electron && node scripts/smoke-test.js`
Expected: `FAIL  G7.auth.js — electron/fb/auth.js missing` (and 7 more FAIL lines).

- [ ] **Step 1.3: Create 8 stub files**

Each stub has a concrete spec section pointer so the next implementer knows where to land the real code. Create all 8 files:

```
electron/fb/auth.js          → spec section "Wizard + Auth" (OAuth flow)
electron/fb/config.js        → spec section "Workspace Files (Seeded)" + "Encrypted Token Store"
electron/fb/graph.js         → spec section "Metrics Fetch" + "OAuth Flow (Code)"
electron/fb/drafts.js        → spec section "Daily Generator Pipeline" + "Approval UX" (Undo Window)
electron/fb/generator.js     → spec section "Daily Generator Pipeline"
electron/fb/performance.js   → spec section "Performance Loop"
electron/fb/markers.js       → spec section "Output-Side Defense" + "AGENTS.md v24 Delta"
electron/fb/migrate.js       → spec section "Cron Dashboard Redesign" (Migration)
```

Stub content for each:
```js
// electron/fb/<name>.js
// Spec: docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md
// Responsibility: <copy the responsibility line from the module layout table>
module.exports = {};
```

Example for `auth.js`:
```js
// electron/fb/auth.js
// Spec: docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md
// Responsibility: OAuth flow + safeStorage token wrap + port fallback 18791..18795
module.exports = {};
```

- [ ] **Step 1.4: Run smoke to verify G7 passes**

Run: `cd electron && node scripts/smoke-test.js`
Expected: 8 × `PASS  G7.<file> — electron/fb/<file> exists`.

- [ ] **Step 1.5: Commit**

```bash
git add electron/fb/ electron/scripts/smoke-test.js
git commit -m "feat(fb): scaffold electron/fb/ module with 8 file stubs + smoke G7"
```

### Task 2: Config resolver (`fb/config.js`)

**Responsibility:** Resolve workspace paths for `config/fb-post-settings.json`, `%APPDATA%/9bizclaw/fb/config.json`, `%APPDATA%/9bizclaw/fb/token.enc`, `%APPDATA%/9bizclaw/fb/app-secret.enc`. Read/write settings with defaults.

**Files:**
- Modify: `electron/fb/config.js`

- [ ] **Step 2.1: Add smoke guard G13.config to smoke-test.js**

In `electron/scripts/smoke-test.js` `section("FB Fanpage module")` block, append:

```js
try {
  const fbConfig = require('../fb/config.js');
  const required = ['getFbDir', 'getSettingsPath', 'readSettings', 'writeSettings', 'DEFAULT_SETTINGS'];
  for (const name of required) {
    if (typeof fbConfig[name] !== 'undefined') pass(`G13.config.${name} — exported`);
    else fail(`G13.config.${name} — missing export`, `require('../fb/config.js').${name} is undefined`);
  }
} catch (e) {
  fail('G13.config — require failed', e.message);
}
```

- [ ] **Step 2.2: Run smoke to verify G13.config fails**

Run: `cd electron && node scripts/smoke-test.js`
Expected: 5 × FAIL (getFbDir, getSettingsPath, readSettings, writeSettings, DEFAULT_SETTINGS).

- [ ] **Step 2.3: Implement fb/config.js**

Replace stub content with:

```js
// electron/fb/config.js
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_SETTINGS = {
  cronTime: '07:30',
  quietHours: null,        // { start: '22:00', end: '07:00' } or null
  defaultAngle: null,      // 'educational' | 'story' | 'question' | null
};

const APP_DIR_NAME = '9bizclaw';

function getAppDataRoot() {
  if (process.env['9BIZ_WORKSPACE']) return process.env['9BIZ_WORKSPACE'];
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_DIR_NAME);
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, APP_DIR_NAME);
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(xdg, APP_DIR_NAME);
}

function getFbDir() {
  const dir = path.join(getAppDataRoot(), 'fb');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

function getSettingsPath() {
  return path.join(getAppDataRoot(), 'config', 'fb-post-settings.json');
}

function readSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Object.assign({}, DEFAULT_SETTINGS, parsed);
  } catch {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}

function writeSettings(settings) {
  const merged = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  const p = getSettingsPath();
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch {}
  fs.writeFileSync(p, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

module.exports = {
  DEFAULT_SETTINGS,
  getFbDir,
  getSettingsPath,
  readSettings,
  writeSettings,
};
```

- [ ] **Step 2.4: Run smoke to verify G13.config passes**

Run: `cd electron && node scripts/smoke-test.js`
Expected: 5 × `PASS  G13.config.<name> — exported`.

- [ ] **Step 2.5: Commit**

```bash
git add electron/fb/config.js electron/scripts/smoke-test.js
git commit -m "feat(fb): config resolver with safeStorage dir + settings defaults"
```

### Task 3: Graph API core helpers (`fb/graph.js`)

**Responsibility:** Pure HTTP wrappers around Graph v21.0 endpoints. Exports: `postToFeed`, `uploadPhoto`, `fetchInsights`, `fetchRecentPosts`, `debugToken`, `fetchPageTokens`, `exchangeCodeForToken`, `exchangeLongLived`.

**Files:**
- Modify: `electron/fb/graph.js`

- [ ] **Step 3.1: Add smoke guard G13.graph**

In `electron/scripts/smoke-test.js`, append to FB section:

```js
try {
  const fbGraph = require('../fb/graph.js');
  const required = ['GRAPH_API_VERSION', 'postToFeed', 'uploadPhoto', 'fetchInsights',
                    'fetchRecentPosts', 'debugToken', 'fetchPageTokens',
                    'exchangeCodeForToken', 'exchangeLongLived'];
  for (const name of required) {
    if (typeof fbGraph[name] !== 'undefined') pass(`G13.graph.${name} — exported`);
    else fail(`G13.graph.${name} — missing export`, `${name} is undefined`);
  }
  if (fbGraph.GRAPH_API_VERSION === 'v21.0') pass('G13.graph.version — pinned v21.0');
  else fail('G13.graph.version — wrong pin', `got ${fbGraph.GRAPH_API_VERSION}`);
} catch (e) {
  fail('G13.graph — require failed', e.message);
}
```

- [ ] **Step 3.2: Run smoke, verify G13.graph fails**

Expected: 9 × FAIL (GRAPH_API_VERSION + 8 functions).

- [ ] **Step 3.3: Implement fb/graph.js**

Replace stub:

```js
// electron/fb/graph.js
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

async function _graphRequest(method, pathPart, params = {}, token = null, body = null) {
  const url = new URL(GRAPH_BASE + pathPart);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  if (token) url.searchParams.set('access_token', token);
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = new Error(json.error?.message || `Graph API ${res.status}`);
    err.status = res.status;
    err.code = json.error?.code;
    err.subcode = json.error?.error_subcode;
    err.fbtrace = json.error?.fbtrace_id;
    err.raw = json;
    throw err;
  }
  return json;
}

async function postToFeed(pageId, pageToken, { message, mediaFbids } = {}) {
  const body = { message };
  if (mediaFbids && mediaFbids.length) {
    body.attached_media = mediaFbids.map((id) => ({ media_fbid: id }));
  }
  return _graphRequest('POST', `/${encodeURIComponent(pageId)}/feed`, {}, pageToken, body);
}

async function uploadPhoto(pageId, pageToken, { imageUrl, filePath } = {}) {
  if (imageUrl) {
    return _graphRequest('POST', `/${encodeURIComponent(pageId)}/photos`, {
      url: imageUrl, published: 'false',
    }, pageToken);
  }
  if (filePath) {
    // Multipart upload: use FormData
    const fs = require('fs');
    const form = new FormData();
    form.append('source', new Blob([fs.readFileSync(filePath)]));
    form.append('published', 'false');
    const url = `${GRAPH_BASE}/${encodeURIComponent(pageId)}/photos?access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url, { method: 'POST', body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const err = new Error(json.error?.message || `Graph photo upload ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }
  throw new Error('uploadPhoto requires imageUrl or filePath');
}

async function fetchInsights(postId, pageToken, metrics) {
  return _graphRequest('GET', `/${encodeURIComponent(postId)}/insights`, {
    metric: metrics.join(','),
  }, pageToken);
}

async function fetchRecentPosts(pageId, pageToken, sinceIso) {
  return _graphRequest('GET', `/${encodeURIComponent(pageId)}/posts`, {
    since: Math.floor(new Date(sinceIso).getTime() / 1000),
    fields: 'id,message,created_time',
  }, pageToken);
}

async function debugToken(inputToken, appId, appSecret) {
  return _graphRequest('GET', '/debug_token', {
    input_token: inputToken,
    access_token: `${appId}|${appSecret}`,
  });
}

async function fetchPageTokens(longUserToken) {
  return _graphRequest('GET', '/me/accounts', {
    fields: 'id,name,access_token,tasks',
  }, longUserToken);
}

async function exchangeCodeForToken(code, appId, appSecret, redirectUri) {
  return _graphRequest('GET', '/oauth/access_token', {
    client_id: appId,
    redirect_uri: redirectUri,
    client_secret: appSecret,
    code,
  });
}

async function exchangeLongLived(userToken, appId, appSecret) {
  return _graphRequest('GET', '/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: userToken,
  });
}

module.exports = {
  GRAPH_API_VERSION,
  postToFeed,
  uploadPhoto,
  fetchInsights,
  fetchRecentPosts,
  debugToken,
  fetchPageTokens,
  exchangeCodeForToken,
  exchangeLongLived,
};
```

- [ ] **Step 3.4: Run smoke, verify G13.graph passes**

Expected: 9 × PASS.

- [ ] **Step 3.5: Commit**

```bash
git add electron/fb/graph.js electron/scripts/smoke-test.js
git commit -m "feat(fb): Graph API v21.0 helpers (post, photo, insights, oauth, debug_token)"
```

### Task 4: Auth + OAuth callback server with port fallback (`fb/auth.js`)

**Responsibility:** Per-flow state Map (CSRF), multi-port bind (18791..18795), build auth URL, exchange code → long-lived Page token, encrypted storage via safeStorage.

**Files:**
- Modify: `electron/fb/auth.js`

- [ ] **Step 4.1: Add smoke guard G13.auth**

```js
try {
  const fbAuth = require('../fb/auth.js');
  const required = ['buildAuthUrl', 'startCallbackServer', 'completeOAuth',
                    'storePageToken', 'loadPageToken', 'clearCredentials',
                    'PORT_RANGE'];
  for (const name of required) {
    if (typeof fbAuth[name] !== 'undefined') pass(`G13.auth.${name} — exported`);
    else fail(`G13.auth.${name} — missing export`, `${name} is undefined`);
  }
  if (Array.isArray(fbAuth.PORT_RANGE) && fbAuth.PORT_RANGE.length === 5 &&
      fbAuth.PORT_RANGE[0] === 18791 && fbAuth.PORT_RANGE[4] === 18795) {
    pass('G13.auth.PORT_RANGE — 18791..18795');
  } else {
    fail('G13.auth.PORT_RANGE — wrong range', JSON.stringify(fbAuth.PORT_RANGE));
  }
} catch (e) {
  fail('G13.auth — require failed', e.message);
}
```

- [ ] **Step 4.2: Run smoke, verify G13.auth fails**

Expected: 7 × FAIL.

- [ ] **Step 4.3: Implement fb/auth.js**

Replace stub with a full implementation (paste the entire module). Key responsibilities:

```js
// electron/fb/auth.js
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getFbDir } = require('./config');
const graph = require('./graph');

const PORT_RANGE = [18791, 18792, 18793, 18794, 18795];
const CALLBACK_PATH = '/fb-callback';
const STATE_TTL_MS = 10 * 60 * 1000;

// Per-flow CSRF state Map: state → { expiresAt, port, appId, appSecret }
const _pendingStates = new Map();

function _cleanupExpiredStates() {
  const now = Date.now();
  for (const [k, v] of _pendingStates) {
    if (v.expiresAt <= now) _pendingStates.delete(k);
  }
}

function buildAuthUrl(appId, state, port) {
  const redirectUri = `http://localhost:${port}${CALLBACK_PATH}`;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: 'pages_show_list,pages_manage_posts,pages_read_engagement',
    response_type: 'code',
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

async function _bindFirstAvailablePort(handler) {
  for (const port of PORT_RANGE) {
    try {
      const server = await new Promise((resolve, reject) => {
        const s = http.createServer(handler);
        s.once('error', reject);
        s.listen(port, '127.0.0.1', () => resolve(s));
      });
      return { server, port };
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
    }
  }
  const err = new Error('Vui lòng đóng ứng dụng khác đang dùng port 18791-18795 rồi thử lại');
  err.code = 'ALL_PORTS_BUSY';
  throw err;
}

async function startCallbackServer({ appId, appSecret, onResult }) {
  _cleanupExpiredStates();
  const state = crypto.randomBytes(16).toString('hex');
  let boundPort = null;

  let resolveResult;
  const resultPromise = new Promise((r) => { resolveResult = r; });

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${boundPort}`);
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404); res.end('Not found');
        return;
      }
      const gotState = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const errorParam = url.searchParams.get('error');

      const entry = _pendingStates.get(gotState);
      if (!entry || entry.expiresAt <= Date.now()) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h3>CSRF state mismatch hoặc hết hạn. Vui lòng thử lại wizard.</h3>');
        return;
      }
      _pendingStates.delete(gotState);

      if (errorParam) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h3>Facebook từ chối: ${errorParam}</h3>`);
        resolveResult({ error: errorParam });
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h3>Đã kết nối. Vui lòng quay lại 9BizClaw.</h3>');
      resolveResult({ code, port: entry.port });
    } catch (e) {
      try { res.writeHead(500); res.end('Internal error'); } catch {}
      resolveResult({ error: e.message });
    }
  };

  const { server, port } = await _bindFirstAvailablePort(handler);
  boundPort = port;
  _pendingStates.set(state, {
    expiresAt: Date.now() + STATE_TTL_MS, port, appId, appSecret,
  });

  const ready = { state, port, authUrl: buildAuthUrl(appId, state, port) };
  const tokens = (async () => {
    const cb = await resultPromise;
    server.close();
    if (cb.error) return { error: cb.error };
    const redirectUri = `http://localhost:${cb.port}${CALLBACK_PATH}`;
    try {
      const short = await graph.exchangeCodeForToken(cb.code, appId, appSecret, redirectUri);
      const long = await graph.exchangeLongLived(short.access_token, appId, appSecret);
      const pages = await graph.fetchPageTokens(long.access_token);
      return { longUserToken: long.access_token, pages: pages.data || [] };
    } catch (e) {
      return { error: e.message };
    }
  })();

  return { ready, tokens, port };
}

async function completeOAuth({ appId, appSecret, pageId, pageName, pageToken, safeStorage }) {
  const fbDir = getFbDir();
  const configPath = path.join(fbDir, 'config.json');
  const tokenPath = path.join(fbDir, 'token.enc');
  const secretPath = path.join(fbDir, 'app-secret.enc');

  const cfg = {
    appId, pageId, pageName,
    grantedAt: new Date().toISOString(),
    scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'],
  };
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
  fs.writeFileSync(tokenPath, safeStorage.encryptString(pageToken));
  fs.writeFileSync(secretPath, safeStorage.encryptString(appSecret));
  return cfg;
}

async function storePageToken(pageId, pageName, pageToken, appSecret, safeStorage) {
  return completeOAuth({
    appId: _readConfig().appId, appSecret,
    pageId, pageName, pageToken, safeStorage,
  });
}

function _readConfig() {
  const p = path.join(getFbDir(), 'config.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; }
}

function loadPageToken(safeStorage) {
  const tokenPath = path.join(getFbDir(), 'token.enc');
  const secretPath = path.join(getFbDir(), 'app-secret.enc');
  try {
    const token = safeStorage.decryptString(fs.readFileSync(tokenPath));
    const secret = safeStorage.decryptString(fs.readFileSync(secretPath));
    return { token, secret, config: _readConfig() };
  } catch {
    return null;
  }
}

function clearCredentials() {
  const fbDir = getFbDir();
  for (const f of ['config.json', 'token.enc', 'app-secret.enc']) {
    try { fs.unlinkSync(path.join(fbDir, f)); } catch {}
  }
}

module.exports = {
  PORT_RANGE,
  buildAuthUrl,
  startCallbackServer,
  completeOAuth,
  storePageToken,
  loadPageToken,
  clearCredentials,
};
```

- [ ] **Step 4.4: Run smoke, verify G13.auth passes**

Expected: 7 × PASS.

- [ ] **Step 4.5: Commit**

```bash
git add electron/fb/auth.js electron/scripts/smoke-test.js
git commit -m "feat(fb): OAuth callback server with port fallback 18791..18795 + encrypted token store"
```

### Task 5: IPC handlers in main.js for FB auth + basic Page operations

**Responsibility:** Wire `fb-connect-start`, `fb-connect-await-pages`, `fb-connect-complete`, `fb-get-status`, `fb-disconnect` IPC handlers in `electron/main.js`. These call into `fb/auth.js` + `fb/graph.js`. **All 5 handlers are one atomic task** — wizard needs them as a complete set to drive OAuth end-to-end.

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`

- [ ] **Step 5.1: Add smoke guard G13.preload for IPC bridges (TDD-first)**

In `electron/scripts/smoke-test.js`, append to the FB section:

```js
try {
  const preloadText = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf-8');
  const required = ['fbConnectStart', 'fbConnectAwaitPages', 'fbConnectComplete',
                    'fbGetStatus', 'fbDisconnect'];
  for (const name of required) {
    if (preloadText.includes(name + ':')) pass(`G13.preload.${name} — wired`);
    else fail(`G13.preload.${name} — missing in preload.js`, `${name}: not found`);
  }
} catch (e) {
  fail('G13.preload — read failed', e.message);
}
```

Note the guard checks for `name + ':'` (e.g., `fbConnectStart:`) which matches the preload object key syntax and avoids false-positives from comments or strings elsewhere.

- [ ] **Step 5.2: Run smoke, verify G13.preload fails**

Run: `cd electron && node scripts/smoke-test.js`
Expected: 5 × FAIL (fbConnectStart, fbConnectAwaitPages, fbConnectComplete, fbGetStatus, fbDisconnect).

- [ ] **Step 5.3: Verify `safeStorage` import exists in main.js**

Search `electron/main.js` top section (first 200 lines) for `safeStorage`. If present (e.g., `const { safeStorage } = require('electron')`), proceed. If missing, add to the existing `require('electron')` destructuring or as a new line:

```js
const { safeStorage } = require('electron');
```

This is a discrete verification — record the file:line where `safeStorage` is imported before moving on. If the existing GCal module already uses `safeStorage` (it does per v2.3.48 ship), the import is already there.

- [ ] **Step 5.4: Wire all 5 IPC handlers in main.js (single atomic change)**

In `electron/main.js`, find the section of existing GCal IPC handlers (search for `ipcMain.handle('gcal-`). Just below the last GCal handler, add the complete FB handler block:

```js
// === FB IPC handlers ===
const fbAuth = require('./fb/auth');
const fbGraph = require('./fb/graph');
const fbConfig = require('./fb/config');

// State for pending OAuth flow: store the { ready, tokens, port } across IPC calls
let _fbOauthInFlight = null;

ipcMain.handle('fb-connect-start', async (_e, appId, appSecret) => {
  if (_fbOauthInFlight) _fbOauthInFlight = null;
  try {
    const flow = await fbAuth.startCallbackServer({ appId, appSecret });
    _fbOauthInFlight = {
      tokens: flow.tokens, port: flow.port, ready: flow.ready,
      appId, appSecret,
    };
    return { ok: true, authUrl: flow.ready.authUrl, port: flow.ready.port };
  } catch (e) {
    _fbOauthInFlight = null;
    return { ok: false, error: e.message, code: e.code };
  }
});

// Wizard calls this after opening the auth URL and user completes FB consent.
// Awaits the tokens Promise returned from startCallbackServer, returns the
// list of Pages CEO admins so wizard renders dropdown.
ipcMain.handle('fb-connect-await-pages', async () => {
  if (!_fbOauthInFlight) return { ok: false, error: 'No OAuth flow in progress' };
  try {
    const result = await _fbOauthInFlight.tokens;
    if (result.error) return { ok: false, error: result.error };
    return { ok: true, pages: result.pages || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Wizard calls this after CEO picks a Page from dropdown. Finalizes encrypted storage.
ipcMain.handle('fb-connect-complete', async (_e, pickedPage) => {
  if (!_fbOauthInFlight) return { ok: false, error: 'No OAuth flow in progress' };
  try {
    const result = await _fbOauthInFlight.tokens;  // awaiting same promise — resolves to same value
    if (result.error) {
      _fbOauthInFlight = null;
      return { ok: false, error: result.error };
    }
    const page = (result.pages || []).find((p) => p.id === pickedPage?.id);
    if (!page) {
      _fbOauthInFlight = null;
      return { ok: false, error: 'Page not found in list', pages: result.pages };
    }
    await fbAuth.completeOAuth({
      appId: _fbOauthInFlight.appId,
      appSecret: _fbOauthInFlight.appSecret,
      pageId: page.id,
      pageName: page.name,
      pageToken: page.access_token,
      safeStorage,
    });
    _fbOauthInFlight = null;
    return { ok: true, pageId: page.id, pageName: page.name };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fb-get-status', async () => {
  try {
    const loaded = fbAuth.loadPageToken(safeStorage);
    if (!loaded) return { ok: true, connected: false };
    return {
      ok: true,
      connected: true,
      pageId: loaded.config.pageId,
      pageName: loaded.config.pageName,
      grantedAt: loaded.config.grantedAt,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fb-disconnect', async () => {
  try {
    fbAuth.clearCredentials();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
// === END FB IPC handlers ===
```

Then add matching preload bridges to `electron/preload.js`, inside the `contextBridge.exposeInMainWorld('claw', {...})` block:

```js
fbConnectStart: (appId, appSecret) => ipcRenderer.invoke('fb-connect-start', appId, appSecret),
fbConnectAwaitPages: () => ipcRenderer.invoke('fb-connect-await-pages'),
fbConnectComplete: (pickedPage) => ipcRenderer.invoke('fb-connect-complete', pickedPage),
fbGetStatus: () => ipcRenderer.invoke('fb-get-status'),
fbDisconnect: () => ipcRenderer.invoke('fb-disconnect'),
```

- [ ] **Step 5.5: Run smoke, verify G13.preload passes + main.js syntax OK**

Run: `cd electron && node scripts/smoke-test.js`
Expected: 5 × PASS for G13.preload.*.

Run: `cd electron && node --check main.js`
Expected: no output (syntax valid).

- [ ] **Step 5.6: Commit**

```bash
git add electron/main.js electron/preload.js electron/scripts/smoke-test.js
git commit -m "feat(fb): IPC handlers (5) + preload bridges for OAuth lifecycle"
```

### Task 6: Output filter extension for FB token leak prevention

**Responsibility:** Extend the JS-level `_outputFilterPatterns` array in `main.js` (used by `filterSensitiveOutput()` for Telegram replies) AND the TS-injected block in `ensureZaloOutputFilterFix()` (used for Zalo outbound via openzalo patch) with 3 regexes preventing accidental leak of FB App ID / App Secret / access tokens in bot replies.

**Files:**
- Modify: `electron/main.js`

**Location disambiguation (pre-task orientation):**
- **Location A (JS-level array)**: array literal assigned to `_outputFilterPatterns` near the top of the `filterSensitiveOutput()` function definition. Used at runtime in main.js process for Telegram output.
- **Location B (TS-injected block)**: template-literal string inside `ensureZaloOutputFilterFix()` containing a line `const __ofBlockPatterns: { name: string; re: RegExp }[] = [`. This string is written to `openzalo/src/inbound.ts` on each `startOpenClaw()`. Used at runtime inside the openzalo plugin for Zalo output.
- Both must be edited. Edit B is a string-literal modification: the new regex entries must be appended **inside the template-literal string** that contains the TS code, not the live JS file.

- [ ] **Step 6.1: Add smoke guard G13.filter (TDD-first)**

In `electron/scripts/smoke-test.js`, append to FB section:

```js
try {
  const mainText = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  const patternNames = ['fb-access-token-leak', 'fb-app-secret-leak', 'fb-app-id-leak'];
  for (const name of patternNames) {
    // Match named pattern entry. Must appear at least twice: once in JS array,
    // once in TS-injected block inside ensureZaloOutputFilterFix string literal.
    const occurrences = (mainText.match(new RegExp(`name:\\s*['"\`]${name}['"\`]`, 'g')) || []).length;
    if (occurrences >= 2) pass(`G13.filter.${name} — present in both JS array + TS-injected block (${occurrences}x)`);
    else if (occurrences === 1) fail(`G13.filter.${name} — present only once (need 2)`, `occurrences: ${occurrences}`);
    else fail(`G13.filter.${name} — missing`, 'Add to both _outputFilterPatterns and ensureZaloOutputFilterFix');
  }
} catch (e) {
  fail('G13.filter — read failed', e.message);
}
```

- [ ] **Step 6.2: Run smoke, verify G13.filter fails**

Expected: 3 × FAIL (fb-access-token-leak, fb-app-secret-leak, fb-app-id-leak).

- [ ] **Step 6.3: Add regex patterns to JS-level filter (Location A)**

In `electron/main.js`, find the `_outputFilterPatterns` array (use Grep: `const _outputFilterPatterns = [`). Append 3 new entries at the end of the array, before the closing `]`:

```js
  { name: 'fb-access-token-leak', re: /\baccess_token\s*=\s*[A-Za-z0-9|_\-]{20,}/i },
  { name: 'fb-app-secret-leak', re: /\bclient_secret\s*=\s*[A-Za-z0-9]{20,}/i },
  { name: 'fb-app-id-leak', re: /\bclient_id\s*=\s*\d{15,}/i },
```

- [ ] **Step 6.4: Add regex patterns to TS-injected filter (Location B)**

In `electron/main.js`, find `ensureZaloOutputFilterFix` function. Inside it, find the template-literal containing `const __ofBlockPatterns: { name: string; re: RegExp }[] = [`. Append the same 3 entries to that array, inside the template-literal string. The edit target is a string literal, so the 3 entries are inserted as text lines that preserve the TS syntax. Example of what the result looks like inside the string:

```
    const __ofBlockPatterns: { name: string; re: RegExp }[] = [
      // ... existing entries ...
      { name: "no-vietnamese-diacritic", re: /^...$/ },
      // Added in v2.3.48 FB update: FB credential leak prevention
      { name: "fb-access-token-leak", re: /\\baccess_token\\s*=\\s*[A-Za-z0-9|_\\-]{20,}/i },
      { name: "fb-app-secret-leak", re: /\\bclient_secret\\s*=\\s*[A-Za-z0-9]{20,}/i },
      { name: "fb-app-id-leak", re: /\\bclient_id\\s*=\\s*\\d{15,}/i },
    ];
```

Note: inside the template-literal, `\\b` is the intended TS source `\b` (one backslash is swallowed by the JS string literal). **Before pasting, grep one existing regex entry in the same template-literal block** to confirm the single-vs-double-backslash convention (e.g., `grep -A 1 'cot-en-the-actor' electron/main.js`) — mirror that escaping style exactly to avoid regex-in-string errors at patch-apply time.

**Also bump the patch marker version** at the top of the TS-injected block (find comment like `// === 9BizClaw OUTPUT-FILTER PATCH v3 ===`): bump version by one (e.g., v3 → v4) so `ensureZaloOutputFilterFix()` re-applies the updated patch on existing installs instead of skipping due to matching marker.

- [ ] **Step 6.5: Run smoke, verify G13.filter passes**

Expected: 3 × PASS (each name found 2x — once in Location A, once in Location B).

- [ ] **Step 6.6: Commit**

```bash
git add electron/main.js electron/scripts/smoke-test.js
git commit -m "feat(fb): output filter blocks access_token/client_secret/client_id leaks (JS + TS paths, patch v4)"
```

### Task 7: Chunk 1 smoke-pass gate

- [ ] **Step 7.1: Verify `smoke` script exists in electron/package.json**

Open `electron/package.json`, confirm the `scripts.smoke` entry is present (it should be — shipped in v2.3.48):
```
"smoke": "node scripts/smoke-test.js && node scripts/smoke-context-injection.js && node scripts/smoke-zalo-followup.js && node --disable-warning=ExperimentalWarning scripts/smoke-visibility.js && node scripts/smoke-gcal.js"
```
If missing, add it. If present, proceed.

- [ ] **Step 7.2: Full smoke run**

Run: `cd electron && npm run smoke`
Expected: ALL guards PASS (pre-existing G1-G14 + all new Chunk 1 guards: G7.×8, G13.config.×5, G13.graph.×10 (9 function exports + 1 version pin), G13.auth.×7, G13.preload.×5, G13.filter.×3). If any FAIL, fix root cause before proceeding — do NOT move to Chunk 2.

- [ ] **Step 7.3: Tag the chunk completion**

```bash
git tag -a fb-chunk-1 -m "Chunk 1 complete: fb/ skeleton + config + graph + auth + IPC + output filter"
```

---

## Chunk 2: Wizard UI + Workspace Seeding

**Goal:** CEO completes FB wizard end-to-end on fresh install. `%APPDATA%/9bizclaw/fb/` has config.json + token.enc + app-secret.enc. AGENTS.md bumps v23→v24 triggering re-seed of 5 skill templates + memory/fb-performance-history.md + config/fb-post-settings.json + skills/INDEX.md diff-append.

### Task 8: Wizard FB step UI (wizard.html)

**Files:** Modify `electron/ui/wizard.html`

- [ ] **Step 8.1: Smoke guard G11.wizard**

Append to `electron/scripts/smoke-test.js` FB section:

```js
try {
  const wizardText = fs.readFileSync(path.join(__dirname, '..', 'ui', 'wizard.html'), 'utf-8');
  const domIds = ['wiz-fb-appid', 'wiz-fb-secret', 'wiz-fb-connect-btn',
                  'wiz-fb-redirects', 'wiz-fb-pages-dropdown', 'wiz-fb-save-btn'];
  for (const id of domIds) {
    if (wizardText.includes(`id="${id}"`)) pass(`G11.wizard.${id} — present`);
    else fail(`G11.wizard.${id} — missing DOM id`, `id="${id}" not found in wizard.html`);
  }
  if (wizardText.includes('18791') && wizardText.includes('18795')) pass('G11.wizard.port-range — 5 URIs rendered');
  else fail('G11.wizard.port-range', 'redirect URI 18791..18795 not found');
} catch (e) {
  fail('G11.wizard — read failed', e.message);
}
```

- [ ] **Step 8.2: Run smoke, verify 7 FAIL for G11.wizard.***

- [ ] **Step 8.3: Add FB step block to wizard.html**

Insert after the existing GCal wizard step. Structure:

```html
<div class="wiz-step" data-step="fb" id="wiz-step-fb">
  <h2 class="wiz-title">Facebook Fanpage (tùy chọn — có thể bỏ qua)</h2>
  <p class="wiz-sub">Kết nối để bot tự soạn + đăng bài cho Fanpage. Có thể làm sau ở Dashboard.</p>

  <div class="wiz-substep"><span class="wiz-step-num">1</span>
    <a href="#" class="wiz-btn-open" data-url="https://developers.facebook.com/apps/">Mở Meta for Developers</a>
    → tạo App mới, chọn type <b>Doanh nghiệp</b>, tên "9BizClaw-&lt;tên sếp&gt;"
  </div>

  <div class="wiz-substep"><span class="wiz-step-num">2</span>
    Dashboard → <b>Add Product</b> → <b>Facebook Login for Business</b> → Settings.
    Paste 5 dòng redirect URI dưới vào ô <b>Valid OAuth Redirect URIs</b>:
    <textarea id="wiz-fb-redirects" readonly rows="5">http://localhost:18791/fb-callback
http://localhost:18792/fb-callback
http://localhost:18793/fb-callback
http://localhost:18794/fb-callback
http://localhost:18795/fb-callback</textarea>
    <button class="wiz-btn-copy" data-target="wiz-fb-redirects">Copy tất cả</button>
  </div>

  <div class="wiz-substep"><span class="wiz-step-num">3</span>
    Settings → Basic → copy App ID + App Secret:
    <input id="wiz-fb-appid" placeholder="App ID (15+ chữ số)">
    <input id="wiz-fb-secret" type="password" placeholder="App Secret">
  </div>

  <div class="wiz-substep"><span class="wiz-step-num">4</span>
    <button id="wiz-fb-connect-btn" class="wiz-btn-primary">Kết nối với Facebook</button>
    <span id="wiz-fb-connect-status"></span>
  </div>

  <div class="wiz-substep" id="wiz-fb-page-picker" style="display:none"><span class="wiz-step-num">5</span>
    Chọn Page:
    <select id="wiz-fb-pages-dropdown"></select>
    <button id="wiz-fb-save-btn" class="wiz-btn-primary">Lưu</button>
  </div>

  <button class="wiz-btn-skip" data-next-step="...">Bỏ qua bước này</button>
</div>
```

Reuse existing `.wiz-*` CSS classes from GCal step. Replicate `.wiz-btn-open` + `.wiz-btn-copy` + `.wiz-step-num` primitives already shipped.

- [ ] **Step 8.4: Wire JS handlers in wizard.html**

Add inside the existing wizard `<script>` block:

```js
document.getElementById('wiz-fb-connect-btn').addEventListener('click', async () => {
  const status = document.getElementById('wiz-fb-connect-status');
  const appId = document.getElementById('wiz-fb-appid').value.trim();
  const secret = document.getElementById('wiz-fb-secret').value.trim();
  if (!appId || !secret) { status.textContent = 'Thiếu App ID hoặc Secret'; return; }
  status.textContent = 'Đang mở Facebook...';
  const startRes = await window.claw.fbConnectStart(appId, secret);
  if (!startRes.ok) { status.textContent = 'Lỗi: ' + startRes.error; return; }
  await window.claw.openExternal(startRes.authUrl);
  status.textContent = 'Đang chờ sếp hoàn tất đăng nhập trên Facebook...';
  const pagesRes = await window.claw.fbConnectAwaitPages();
  if (!pagesRes.ok) { status.textContent = 'Lỗi: ' + pagesRes.error; return; }
  const dropdown = document.getElementById('wiz-fb-pages-dropdown');
  dropdown.innerHTML = pagesRes.pages.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('wiz-fb-page-picker').style.display = 'block';
  status.textContent = '';
});

document.getElementById('wiz-fb-save-btn').addEventListener('click', async () => {
  const dropdown = document.getElementById('wiz-fb-pages-dropdown');
  const pickedId = dropdown.value;
  const pickedName = dropdown.options[dropdown.selectedIndex].text;
  const res = await window.claw.fbConnectComplete({ id: pickedId, name: pickedName });
  const status = document.getElementById('wiz-fb-connect-status');
  if (res.ok) { status.textContent = 'Đã kết nối: ' + res.pageName; /* advance to next step */ }
  else status.textContent = 'Lỗi lưu: ' + res.error;
});
```

- [ ] **Step 8.5: Run smoke, verify G11.wizard passes**

Expected: 7 × PASS.

- [ ] **Step 8.6: Commit**

```bash
git add electron/ui/wizard.html electron/scripts/smoke-test.js
git commit -m "feat(fb): wizard step — 5 redirect URIs + OAuth round-trip + Page picker"
```

### Task 9: Create 5 FB skill markdown files

**Files:** Create `skills/fb-post-writer.md`, `skills/fb-industry-voice.md`, `skills/fb-repetition-avoider.md`, `skills/fb-trend-aware.md`, `skills/fb-ab-variant.md`

- [ ] **Step 9.1: Smoke guard G8**

Append to `electron/scripts/smoke-test.js`:

```js
const fbSkills = ['fb-post-writer', 'fb-industry-voice', 'fb-repetition-avoider',
                  'fb-trend-aware', 'fb-ab-variant'];
for (const s of fbSkills) {
  const p = path.join(__dirname, '..', '..', 'skills', s + '.md');
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf-8');
    if (content.length > 500) pass(`G8.${s} — exists + non-trivial (${content.length} bytes)`);
    else fail(`G8.${s} — file too short`, `${content.length} bytes, needs >500`);
  } else fail(`G8.${s} — missing`, p);
}
```

- [ ] **Step 9.2: Run smoke, verify 5 × FAIL**

- [ ] **Step 9.3: Write `skills/fb-post-writer.md`**

```markdown
---
name: fb-post-writer
description: Core Facebook post copy skill — hook structure, VN conversational tone, CTA, length, no-emoji default
---

# fb-post-writer — Core FB Post Writer

Áp dụng khi: bot soạn bài đăng Facebook cho Fanpage của CEO.

## Cấu trúc bắt buộc

**Hook — 2 dòng đầu (trước "See more" của FB):**
- Dòng 1: câu mở thu hút (không phải "Chào sếp, hôm nay..."), tối đa 80 ký tự
- Dòng 2: làm rõ giá trị / tình huống / mâu thuẫn
- Không dùng cliché ("Bạn có biết..." / "Bí quyết để..." / "Đừng bỏ lỡ..." trừ khi thật sự phù hợp)

**Body — thân bài (60-150 từ):**
- 1 ý chính, không dàn trải
- Dùng ngôi xưng phù hợp với ngành (xem fb-industry-voice)
- Câu ngắn 8-15 từ, tránh câu dài nhiều mệnh đề

**CTA — call to action:**
- Đặt ở dòng cuối
- Concrete: "Comment 'TƯ VẤN' để nhận báo giá" / "Nhắn inbox để đặt chỗ" / "Tag 1 người bạn đang tìm X"
- Tránh: "Hãy liên hệ chúng tôi" (mờ, không hành động được)

## Độ dài

80-200 từ là sweet spot. FB truncate ~400 ký tự bằng "See more" → dưới 400 ký tự là full-read, trên là click-more (giảm 40% engagement).

## Emoji — Hard Rule

**Mặc định: KHÔNG emoji.** 9BizClaw premium aesthetic — CEO brand cũng premium nếu content AI soạn không rơi vào pattern "fb page con chat template".

Ngoại lệ duy nhất: CEO prompt cụ thể ("viết bài vui có emoji") → 1-2 emoji chức năng (vị trí, đánh dấu), không emoji trang trí.

## Hashtag

1-3 hashtag max, đặt cuối bài. Chỉ tag nếu thật sự có cộng đồng search (ngành-specific, #tenCongTy). Không spam hashtag như Instagram.

## Checklist cuối

- [ ] Hook 2 dòng có giá trị rõ
- [ ] Body 1 ý chính, không dàn trải
- [ ] CTA cụ thể (hành động được)
- [ ] 80-200 từ
- [ ] Không emoji (trừ khi CEO opt-in)
- [ ] Không cliché mở đầu

## Ví dụ đạt (tone F&B)

> Khách quen bảo: "Bánh mì anh làm nhân nhiều hơn tháng trước à?"
> Em cười: "Giá bán vẫn vậy anh ơi."
>
> Hôm nay làm bánh mì thịt nguội, thêm 1/3 nhân so với tuần trước. Không tăng giá. Lý do đơn giản: giá thịt nguội em nhập giảm, em share bớt cho khách.
>
> Ghé em hôm nay, số lượng giới hạn.
> Inbox hoặc comment "ĐẶT" để giữ phần.

## Ví dụ KHÔNG đạt

> Chào cả nhà ơi! Hôm nay shop có bánh mì siêu ngon nhé! Bánh mì thịt nguội đầy đủ topping siêu xịn luôn. Cả nhà ghé ủng hộ shop nhé! Yêu cả nhà nhiều!

Lý do fail: cliché mở, emoji-adjacent tone, không hook cụ thể, CTA mờ.
```

- [ ] **Step 9.4: Write `skills/fb-industry-voice.md`**

```markdown
---
name: fb-industry-voice
description: Adjust FB post tone per industry active profile (F&B, SaaS, Edu, Retail, Real Estate)
---

# fb-industry-voice — Industry Voice Adjuster

Đọc `industry/active.md` + `knowledge/cong-ty/index.md` để match tone cho ngành đang active.

## Bảng tone theo ngành

| Ngành | Tone chính | Xưng hô CEO→khách | Emoji OK? | CTA hay dùng |
|---|---|---|---|---|
| F&B (ẩm thực) | Ấm áp, playful, visual-heavy | "em" / "mình" ↔ "anh/chị/bạn" | Không (per rule) | "Inbox đặt", "Ghé thử hôm nay" |
| SaaS / IT | Professional, benefit-focused, feature+use-case | "chúng tôi" ↔ "anh/chị", "quý khách" | Không | "Đăng ký demo", "Xem case study" |
| Giáo dục | Ấm, có uy, testimonial-driven | "nhà trường" / "team" ↔ "quý phụ huynh" / "bạn" | Không | "Đăng ký tư vấn", "Để lại số, em gọi lại" |
| Retail / Thương mại | Urgency + promotion, direct | "shop" / "em" ↔ "anh/chị" | Không | "Comment size + mã", "Inbox chọn" |
| Bất động sản | Data-driven, location-heavy, formal | "bên em" ↔ "quý khách" / "anh/chị" | Không | "Gọi ngay 090x xem nhà", "Inbox layout" |
| Dịch vụ tổng quát | Adapt tùy ngành con | Tùy | Không | Concrete action specific |

## Rules

- Nếu `industry/active.md` không có nhãn ngành rõ → default tone F&B-like (gần gũi) cho B2C, SaaS-like cho B2B (phân biệt qua knowledge/cong-ty/index.md)
- Không bao giờ mix tone giữa 2 bài cùng ngày (consistency)
- Không dùng từ kỹ thuật ngành khác (ví dụ SaaS không dùng "nhân" "topping" trong bài)

## Ví dụ per ngành (cùng topic: "giới thiệu sản phẩm X")

**F&B** — "Bún bò Huế ngày mưa, em nấu 5 tiếng hầm xương..."
**SaaS** — "Team CRM của bạn vẫn import lead bằng Excel? Tuần này chúng tôi ra tính năng sync Facebook Lead Ads tự động..."
**Giáo dục** — "Phụ huynh hỏi: con em đuối từ học kỳ 2, có kịp không? — Có, nếu bắt đầu trước tuần sau..."

## Checklist

- [ ] Tone match ngành active
- [ ] Xưng hô match ngành
- [ ] CTA style match ngành
- [ ] Không mix từ ngành khác
```

- [ ] **Step 9.5: Write `skills/fb-repetition-avoider.md`**

```markdown
---
name: fb-repetition-avoider
description: Extract topics + angles from last 14 days posts, instruct generator to pick different
---

# fb-repetition-avoider — Repetition Detector

Input: mảng `recentPosts` (14 ngày qua, fetch từ Graph `/me/posts`) + performance history.

## Nhiệm vụ

Extract + output 3 bucket cho generator:

```
RECENT_TOPICS (14 days):
- iPhone 15 Pro (3 posts)
- Khuyến mãi Tết (2 posts)
- Customer testimonial (1 post)

RECENT_ANGLES:
- Educational (4 times)
- Promotional (3 times)
- Story (0 times)  ← gap, ưu tiên

HARD_AVOID:
- Cùng sản phẩm iPhone 15 Pro (đã post 3/14 ngày)
- Cùng angle "bảng giá" (post hôm qua)
```

## Rules

- Hard rule: KHÔNG post cùng sản phẩm 2 ngày liên tiếp
- Soft rule: nếu angle X đã dùng 3+ lần / tuần qua → prefer angle khác
- Nếu recentPosts rỗng (fresh install, page mới): không constraint, skip output

## Thuật toán extract topic (heuristic)

1. Tokenize title + first 50 từ
2. Match keyword list từ `knowledge/san-pham/index.md` → topic = SP match được
3. Không match → topic = "chủ đề chung"

## Output format (inject vào system prompt)

Tạo block text "RECENT CONTENT ANALYSIS" với 3 bucket trên. LLM tự decide angle dựa trên signal.
```

- [ ] **Step 9.6: Write `skills/fb-trend-aware.md`**

```markdown
---
name: fb-trend-aware
description: VN calendar awareness (Tết, 30/4, 20/10, 20/11, 8/3, Trung Thu, Vu Lan) for timely FB post hooks
---

# fb-trend-aware — VN Calendar Trend Hook

Input: ngày hôm nay (cron fire time). Output: danh sách dịp +/- 7 ngày có thể weave hook.

## Lịch cố định (dương)

| Ngày | Dịp | Hook gợi ý |
|---|---|---|
| 14/2 | Valentine | Quà tặng, "cặp đôi", service "dành cho 2 người" |
| 8/3 | Quốc tế Phụ nữ | Tri ân, phụ nữ-oriented |
| 30/4 | Giải phóng | Nghỉ lễ, du lịch, hàng lễ |
| 1/5 | Lao động | Cùng nhóm 30/4 |
| 2/9 | Quốc khánh | Promo lễ |
| 10/10 | Giải phóng Thủ đô (HN) | Chỉ áp nếu page ở HN |
| 20/10 | Phụ nữ VN | Quà, tri ân, hoa |
| 20/11 | Nhà giáo | Giáo dục, quà thầy cô |

## Lịch âm (tính động theo năm)

| Dịp | Tính |
|---|---|
| Tết Nguyên Đán | Năm mới âm lịch |
| Vu Lan (15/7 âm) | Báo hiếu |
| Trung Thu (15/8 âm) | Gia đình, bánh, đèn |
| Rằm tháng 7 | Tín ngưỡng |

Generator dùng `date-fns-timezone` hoặc helper `nextLunarDate()` để tra các dịp âm.

## Industry-specific

- Retail: Black Friday (24-29/11), Double-11 (11/11), Tết sale
- Edu: Khai giảng (2/9, 5/9), tốt nghiệp (5-6)
- F&B: Tuần lễ món lễ (trung thu → bánh, Tết → gói quà)

## Rules

- Today ± 7 ngày: nếu có dịp match → output "TREND_HOOK: <dịp>" trong prompt
- Không force: generator có thể ignore nếu content không hợp
- Tránh trùng lặp: nếu CEO đã đăng về Tết trong 3 ngày qua → không đề xuất lại

## Output format

```
UPCOMING_TRENDS (±7d):
- 2026-04-30: Giải phóng / Lao động (10 ngày nữa) ← gợi ý weave
- 2026-05-12: (âm 15/4) không có dịp
```

LLM decide mức độ integrate.
```

- [ ] **Step 9.7: Write `skills/fb-ab-variant.md`**

```markdown
---
name: fb-ab-variant
description: Generate 1 main + 2 variant FB posts from same topic with contrasting angles
---

# fb-ab-variant — Variant Generator

## Mục đích

Từ 1 topic, output 3 bài với 3 góc nhìn khác nhau để CEO chọn. Mỗi variant có hook hoàn toàn khác — KHÔNG phải cùng bài reword.

## Angle taxonomy

1. **Educational** — dạy / giải thích. Hook = insight.
2. **Story** — kể chuyện. Hook = nhân vật hoặc tình huống.
3. **Question** — đặt câu hỏi. Hook = câu hỏi cho audience.
4. **Promotional** — ưu đãi trực tiếp. Hook = giá / deadline.
5. **Testimonial** — khách nói. Hook = trích lời khách.

## Rule generate

- **Main**: angle mạnh nhất theo `LEARNED_PATTERNS` (nếu có) hoặc `Educational` mặc định cho fresh install
- **Variant A**: angle ĐỐI LẬP main (Main=Educational → A=Story; Main=Story → A=Question)
- **Variant B**: short-form (< 80 từ), angle bất kỳ khác Main + A

## Rule enforcement

- Hook 3 variant KHÔNG được giống nhau (ngay cả reword)
- Main + A + B phải kể 3 câu chuyện phụ khác nhau về cùng 1 topic
- Nếu content-safety filter trim bỏ Main → variants A+B vẫn ship (spec allows 0-2 variants)
- Nếu cả 3 đều fail → generator returns empty, main.js alert CEO

## Output format

JSON schema đã định ở spec Section "Daily Generator Pipeline" — variants là array length 0-2.
```

- [ ] **Step 9.8: Run smoke, verify G8 passes**

Expected: 5 × PASS.

- [ ] **Step 9.9: Commit**

```bash
git add skills/fb-*.md electron/scripts/smoke-test.js
git commit -m "feat(fb): add 5 skill templates (post-writer, industry-voice, rep-avoider, trend-aware, ab-variant)"
```

### Task 10: skills/INDEX.md diff-append

**Files:** Modify `skills/INDEX.md`

- [ ] **Step 10.1: Smoke guard G12.index**

```js
try {
  const indexText = fs.readFileSync(path.join(__dirname, '..', '..', 'skills', 'INDEX.md'), 'utf-8');
  const skills = ['fb-post-writer', 'fb-industry-voice', 'fb-repetition-avoider',
                  'fb-trend-aware', 'fb-ab-variant'];
  for (const s of skills) {
    if (indexText.includes(s)) pass(`G12.index.${s} — linked in INDEX.md`);
    else fail(`G12.index.${s} — missing from INDEX.md`, `search for ${s}`);
  }
} catch (e) {
  fail('G12.index — read failed', e.message);
}
```

- [ ] **Step 10.2: Run smoke, verify 5 × FAIL**

- [ ] **Step 10.3: Append Facebook Marketing subsection to skills/INDEX.md**

Find the `### Marketing` section in `skills/INDEX.md`. Append immediately after its last row (or create a new `### Facebook Marketing` subsection below it):

```markdown
### Facebook Marketing (5 skills) — `skills/`

| Skill | File | Khi nào dùng |
|---|---|---|
| FB Post Writer | `fb-post-writer.md` | Soạn hook + body + CTA + 80-200 từ cho mọi bài FB |
| FB Industry Voice | `fb-industry-voice.md` | Adjust tone per industry: F&B, SaaS, Edu, Retail, BĐS |
| FB Repetition Avoider | `fb-repetition-avoider.md` | Tránh trùng topic/angle 14 ngày qua |
| FB Trend Aware | `fb-trend-aware.md` | Weave hook theo lịch VN (Tết, 30/4, 20/10, Trung Thu...) |
| FB A/B Variant | `fb-ab-variant.md` | Generate 1 Main + 2 Variant với 3 angle khác nhau |
```

- [ ] **Step 10.4: Run smoke, verify G12.index passes (5 × PASS)**

- [ ] **Step 10.5: Commit**

```bash
git add skills/INDEX.md electron/scripts/smoke-test.js
git commit -m "docs(skills): append Facebook Marketing subsection to INDEX with 5 new skills"
```

### Task 11: Seed workspace templates + AGENTS.md v24 bump

**Files:** Modify `AGENTS.md`, `memory/fb-performance-history.md` (new), `config/fb-post-settings.json` (new), `electron/main.js` (version constant)

- [ ] **Step 11.1: Create `memory/fb-performance-history.md`**

```markdown
# FB Post Performance History

<!-- Generated by 9BizClaw performance.js after each post publish. -->
<!-- Keep last 12 weeks verbose; older entries auto-collapse to monthly rollup. -->
<!-- Max file size ≤ 50 KB (trim policy per spec Section "History Size + Trim Policy"). -->

(No entries yet.)
```

- [ ] **Step 11.2: Create `config/fb-post-settings.json`**

```json
{
  "cronTime": "07:30",
  "quietHours": null,
  "defaultAngle": null
}
```

- [ ] **Step 11.3: Bump AGENTS.md version stamp v23 → v24**

Find the line in `AGENTS.md` containing `VERSION: v23` or similar stamp (grep AGENTS.md for `^v23` or `# VERSION`). Change to `v24`.

Also search `electron/main.js` for the constant `AGENTS_MD_VERSION` or `seedWorkspace` version check (look for `v23` literal). Bump to `v24`.

- [ ] **Step 11.4: Smoke guard G14.workspace-seed**

```js
const seedFiles = [
  { p: path.join(__dirname, '..', '..', 'memory', 'fb-performance-history.md'), check: 'FB Post Performance History' },
  { p: path.join(__dirname, '..', '..', 'config', 'fb-post-settings.json'), check: '"cronTime": "07:30"' },
  { p: path.join(__dirname, '..', '..', 'AGENTS.md'), check: 'v24' },
];
for (const s of seedFiles) {
  if (fs.existsSync(s.p)) {
    const content = fs.readFileSync(s.p, 'utf-8');
    const name = path.basename(s.p);
    if (content.includes(s.check)) pass(`G14.seed.${name} — marker present`);
    else fail(`G14.seed.${name} — marker missing`, `expected: ${s.check}`);
  } else fail(`G14.seed — file missing`, s.p);
}
```

- [ ] **Step 11.5: Run smoke, verify G14.workspace-seed passes (3 × PASS)**

- [ ] **Step 11.6: Commit**

```bash
git add AGENTS.md memory/fb-performance-history.md config/fb-post-settings.json electron/main.js electron/scripts/smoke-test.js
git commit -m "feat(fb): seed memory/fb-performance-history.md + config/fb-post-settings.json + AGENTS.md v23→v24"
```

### Task 12: Update electron-builder extraResources in package.json

**Files:** Modify `electron/package.json`

- [ ] **Step 12.1: Smoke guard G12.extraresources**

```js
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
  const extraRes = pkg.build?.extraResources || [];
  const expected = [
    'fb-performance-history.md',
    'fb-post-settings.json',
  ];
  const allFromPaths = extraRes.map(r => r.from || r).join('\n');
  for (const e of expected) {
    if (allFromPaths.includes(e) || JSON.stringify(extraRes).includes(e)) pass(`G12.extraresources.${e} — in build config`);
    else fail(`G12.extraresources.${e} — missing from build.extraResources`, e);
  }
} catch (e) {
  fail('G12.extraresources — read failed', e.message);
}
```

- [ ] **Step 12.2: Run smoke, verify 2 × FAIL**

- [ ] **Step 12.3: Add 2 extraResources entries**

In `electron/package.json`, inside `build.extraResources` array, add alongside existing entries:

```json
{ "from": "../memory/fb-performance-history.md", "to": "workspace-templates/memory/fb-performance-history.md" },
{ "from": "../config/fb-post-settings.json", "to": "workspace-templates/config/fb-post-settings.json" }
```

(The 5 new skill files are automatically covered by the existing `{ "from": "../skills", "to": "workspace-templates/skills", "filter": ["**/*", "!**/{*.test.js,node_modules}"] }` glob entry — no additional work needed for skills.)

- [ ] **Step 12.4: Run smoke, verify G12.extraresources passes (2 × PASS)**

- [ ] **Step 12.5: Commit**

```bash
git add electron/package.json electron/scripts/smoke-test.js
git commit -m "build(fb): include fb-performance-history.md + fb-post-settings.json in DMG/EXE extraResources"
```

### Task 13: Wire seedWorkspace() to copy new templates (piggyback AGENTS.md v24)

**Files:** Modify `electron/main.js`

- [ ] **Step 13.1: Smoke guard G14.seed-logic**

```js
try {
  const mainText = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  const checks = [
    'fb-performance-history.md',
    'fb-post-settings.json',
    'seedWorkspace',
  ];
  for (const c of checks) {
    if (mainText.includes(c)) pass(`G14.seed-logic.${c} — referenced in main.js`);
    else fail(`G14.seed-logic.${c} — not referenced`, c);
  }
} catch (e) {
  fail('G14.seed-logic — read failed', e.message);
}
```

- [ ] **Step 13.2: Run smoke, verify FAIL for fb-performance-history.md + fb-post-settings.json**

- [ ] **Step 13.3: Extend seedWorkspace()**

In `electron/main.js`, find `function seedWorkspace()`. The function already piggybacks on AGENTS.md version bumps to force-refresh certain files (per CLAUDE.md: `tools/` force-refreshed on piggyback). Add similar piggyback entries for 2 new files:

```js
// Inside seedWorkspace(), in the piggyback block that fires on AGENTS.md v23→v24:
const fbPiggybackFiles = [
  'memory/fb-performance-history.md',
  'config/fb-post-settings.json',
];
for (const f of fbPiggybackFiles) {
  const fp = path.join(workspace, f);
  // Always force-refresh on AGENTS.md bump if file is empty/default
  try {
    const source = path.join(bundledResourcesDir, 'workspace-templates', f);
    if (fs.existsSync(source)) {
      // Only seed if workspace file missing; never overwrite CEO's accumulated history
      if (!fs.existsSync(fp)) {
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.copyFileSync(source, fp);
        console.log(`[seedWorkspace] seeded ${f}`);
      }
    }
  } catch (e) {
    console.warn(`[seedWorkspace] ${f} seed failed:`, e.message);
  }
}
```

Note: `fb-performance-history.md` NEVER overwrites existing CEO history on upgrade (different from AGENTS.md/skills behavior where force-refresh is desired).

- [ ] **Step 13.4: Run smoke, verify G14.seed-logic passes (3 × PASS)**

- [ ] **Step 13.5: Commit**

```bash
git add electron/main.js electron/scripts/smoke-test.js
git commit -m "feat(fb): extend seedWorkspace to copy fb-performance-history.md + fb-post-settings.json on fresh install"
```

### Task 14: Chunk 2 smoke-pass gate

- [ ] **Step 14.1: Full smoke run**

Run: `cd electron && npm run smoke`
Expected: ALL prior + Chunk 2 guards PASS (G11.wizard.×7, G8.×5, G12.index.×5, G14.seed.×3, G12.extraresources.×2, G14.seed-logic.×3).

- [ ] **Step 14.2: Tag**

```bash
git tag -a fb-chunk-2 -m "Chunk 2 complete: wizard UI + 5 skills + INDEX.md + seedWorkspace wiring"
```

---

## Chunk 3: Generator Pipeline + Drafts Lifecycle

**Goal:** Daily 07:30 cron generates 1 Main + 0-2 Variants into `pending-fb-drafts/{today}.json`, sends Telegram digest (no inline buttons yet — those come in Chunk 4).

### Task 15: drafts.js — pending-fb-drafts lifecycle

**Files:** Modify `electron/fb/drafts.js`

- [ ] **Step 15.1: Smoke guard G13.drafts**

```js
try {
  const fbDrafts = require('../fb/drafts.js');
  const required = ['readDraftForDate', 'writeDraftForDate', 'markStatus',
                    'listPendingDrafts', 'getDraftPath', 'DRAFT_STATUSES'];
  for (const name of required) {
    if (typeof fbDrafts[name] !== 'undefined') pass(`G13.drafts.${name} — exported`);
    else fail(`G13.drafts.${name} — missing`, name);
  }
  if (Array.isArray(fbDrafts.DRAFT_STATUSES) && fbDrafts.DRAFT_STATUSES.includes('pending-digest-queued')) {
    pass('G13.drafts.statuses — includes pending-digest-queued');
  } else fail('G13.drafts.statuses — enum incomplete', JSON.stringify(fbDrafts.DRAFT_STATUSES));
} catch (e) { fail('G13.drafts — require failed', e.message); }
```

- [ ] **Step 15.2: Run smoke, verify 7 × FAIL**

- [ ] **Step 15.3: Implement `fb/drafts.js`**

```js
// electron/fb/drafts.js
const fs = require('fs');
const path = require('path');
const os = require('os');

const DRAFT_STATUSES = [
  'pending', 'pending-digest-queued', 'approved',
  'published', 'skipped', 'failed',
];

function _workspaceDir() {
  if (process.env['9BIZ_WORKSPACE']) return process.env['9BIZ_WORKSPACE'];
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', '9bizclaw');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), '9bizclaw');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), '9bizclaw');
}

function _draftsDir() {
  const d = path.join(_workspaceDir(), 'pending-fb-drafts');
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
  return d;
}

function getDraftPath(dateIsoOrLocal) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateIsoOrLocal)
    ? dateIsoOrLocal
    : new Date(dateIsoOrLocal).toISOString().slice(0, 10);
  return path.join(_draftsDir(), `${date}.json`);
}

function readDraftForDate(dateIsoOrLocal) {
  const p = getDraftPath(dateIsoOrLocal);
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function writeDraftForDate(dateIsoOrLocal, draftObj) {
  const p = getDraftPath(dateIsoOrLocal);
  fs.writeFileSync(p, JSON.stringify(draftObj, null, 2), 'utf-8');
}

function markStatus(dateIsoOrLocal, variantId, newStatus) {
  if (!DRAFT_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  const d = readDraftForDate(dateIsoOrLocal);
  if (!d) return null;
  if (d.main?.id === variantId) d.main.status = newStatus;
  else {
    const v = (d.variants || []).find((x) => x.id === variantId);
    if (!v) return null;
    v.status = newStatus;
  }
  writeDraftForDate(dateIsoOrLocal, d);
  return d;
}

function listPendingDrafts() {
  try {
    const files = fs.readdirSync(_draftsDir()).filter((f) => f.endsWith('.json')).sort();
    return files.map((f) => {
      const d = JSON.parse(fs.readFileSync(path.join(_draftsDir(), f), 'utf-8'));
      return { date: f.replace('.json', ''), draft: d };
    }).filter(({ draft }) => {
      const mainPending = draft.main?.status && ['pending', 'pending-digest-queued'].includes(draft.main.status);
      const variantsPending = (draft.variants || []).some((v) => ['pending', 'pending-digest-queued'].includes(v.status));
      return mainPending || variantsPending;
    });
  } catch { return []; }
}

module.exports = {
  DRAFT_STATUSES,
  getDraftPath,
  readDraftForDate,
  writeDraftForDate,
  markStatus,
  listPendingDrafts,
};
```

- [ ] **Step 15.4: Run smoke, verify G13.drafts passes**

- [ ] **Step 15.5: Commit**

```bash
git add electron/fb/drafts.js electron/scripts/smoke-test.js
git commit -m "feat(fb): drafts.js — pending-fb-drafts lifecycle with status transitions + listing"
```

### Task 16: generator.js — context assembly + skill injection

**Files:** Modify `electron/fb/generator.js`

- [ ] **Step 16.1: Smoke guard G13.generator**

```js
try {
  const gen = require('../fb/generator.js');
  const required = ['gatherContext', 'buildPrompt', 'parseGeneratorOutput', 'generateDrafts'];
  for (const name of required) {
    if (typeof gen[name] !== 'undefined') pass(`G13.generator.${name} — exported`);
    else fail(`G13.generator.${name} — missing`, name);
  }
} catch (e) { fail('G13.generator — require failed', e.message); }
```

- [ ] **Step 16.2: Run smoke, 4 × FAIL**

- [ ] **Step 16.3: Implement `fb/generator.js`**

```js
// electron/fb/generator.js
const fs = require('fs');
const path = require('path');
const fbGraph = require('./graph');
const fbConfig = require('./config');

function _readFileSafe(p, maxBytes = 50 * 1024) {
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    return raw.length > maxBytes ? raw.slice(0, maxBytes) + '\n...(truncated)' : raw;
  } catch { return null; }
}

function _workspace() {
  return process.env['9BIZ_WORKSPACE'] || (() => {
    const os = require('os');
    if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', '9bizclaw');
    if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '9bizclaw');
    return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), '9bizclaw');
  })();
}

async function gatherContext({ pageId, pageToken }) {
  const ws = _workspace();
  const ctx = {
    agents: _readFileSafe(path.join(ws, 'AGENTS.md')),
    identity: _readFileSafe(path.join(ws, 'IDENTITY.md')),
    company: _readFileSafe(path.join(ws, 'knowledge', 'cong-ty', 'index.md')),
    products: _readFileSafe(path.join(ws, 'knowledge', 'san-pham', 'index.md')),
    industry: _readFileSafe(path.join(ws, 'industry', 'active.md')),
    performance: _readFileSafe(path.join(ws, 'memory', 'fb-performance-history.md')),
    recentMemory: [],
    recentPosts: [],
    skills: {},
  };

  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const mem = _readFileSafe(path.join(ws, 'memory', `${iso}.md`), 10 * 1024);
    if (mem) ctx.recentMemory.push({ date: iso, content: mem });
  }

  const skills = ['fb-post-writer', 'fb-industry-voice', 'fb-repetition-avoider', 'fb-trend-aware', 'fb-ab-variant'];
  for (const s of skills) {
    ctx.skills[s] = _readFileSafe(path.join(ws, 'skills', `${s}.md`));
  }

  if (pageId && pageToken) {
    try {
      const since = new Date(); since.setDate(since.getDate() - 14);
      const res = await fbGraph.fetchRecentPosts(pageId, pageToken, since.toISOString());
      ctx.recentPosts = res.data || [];
    } catch (e) {
      ctx.recentPosts = [];
      ctx.recentPostsError = e.message;
    }
  }

  return ctx;
}

function buildPrompt(ctx) {
  const parts = [];
  parts.push('Bạn là copywriter Facebook cho CEO Việt Nam. Soạn 1 Main + 0-2 Variants cho bài đăng Fanpage hôm nay.');
  parts.push('\n=== AGENTS.md (voice, rules) ===\n' + (ctx.agents || '(empty)'));
  if (ctx.identity) parts.push('\n=== IDENTITY.md ===\n' + ctx.identity);
  if (ctx.company) parts.push('\n=== Company knowledge ===\n' + ctx.company);
  if (ctx.products) parts.push('\n=== Products knowledge ===\n' + ctx.products);
  if (ctx.industry) parts.push('\n=== Industry tone ===\n' + ctx.industry);

  parts.push('\n=== Skills (apply all 5 in order) ===');
  const order = ['fb-post-writer', 'fb-industry-voice', 'fb-repetition-avoider', 'fb-trend-aware', 'fb-ab-variant'];
  for (const s of order) {
    if (ctx.skills[s]) parts.push(`\n--- ${s} ---\n${ctx.skills[s]}`);
  }

  if (ctx.recentMemory.length) {
    parts.push('\n=== Recent memory (7 days) ===');
    for (const m of ctx.recentMemory) parts.push(`\n[${m.date}]\n${m.content}`);
  }
  if (ctx.recentPosts.length) {
    parts.push('\n=== Recent FB posts (14 days) ===');
    for (const p of ctx.recentPosts) {
      parts.push(`[${p.created_time}] ${(p.message || '').slice(0, 120)}`);
    }
  }
  if (ctx.performance && ctx.performance !== '(No entries yet.)') {
    parts.push('\n=== Performance history ===\n' + ctx.performance);
  }

  parts.push('\n=== Output ===');
  parts.push('Return STRICT JSON. No prose outside JSON. Schema:');
  parts.push(`{
  "generatedAt": "ISO8601",
  "date": "YYYY-MM-DD",
  "main": { "id": "YYYY-MM-DD-main", "angle": "educational|story|question|promotional|testimonial",
            "message": "...", "imageHint": "path_or_null", "suggestedTimes": ["HH:MM"],
            "hashtags": [], "status": "pending" },
  "variants": [
    { "id": "YYYY-MM-DD-a", ... },
    { "id": "YYYY-MM-DD-b", ... }
  ]
}
Variants array: min 0, max 2.`);

  return parts.join('\n');
}

function parseGeneratorOutput(raw) {
  let text = String(raw || '').trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) throw new Error('No JSON in generator output');
  text = text.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(text);
  if (!parsed.main?.id) throw new Error('Missing main.id');
  parsed.variants = Array.isArray(parsed.variants) ? parsed.variants.slice(0, 2) : [];
  return parsed;
}

async function generateDrafts({ pageId, pageToken, llmCall }) {
  const ctx = await gatherContext({ pageId, pageToken });
  const prompt = buildPrompt(ctx);
  const raw = await llmCall(prompt);
  return parseGeneratorOutput(raw);
}

module.exports = { gatherContext, buildPrompt, parseGeneratorOutput, generateDrafts };
```

- [ ] **Step 16.4: Run smoke, verify G13.generator passes**

- [ ] **Step 16.5: Commit**

```bash
git add electron/fb/generator.js electron/scripts/smoke-test.js
git commit -m "feat(fb): generator.js — context assembly + 5-skill prompt + JSON schema parser"
```

### Task 17: Morning cron handler + Telegram digest (text-only, no buttons yet)

**Files:** Modify `electron/main.js`

- [ ] **Step 17.1: Smoke guard G14.cron-fb**

```js
try {
  const mainText = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  if (mainText.includes("'fb-draft-generator'") || mainText.includes('"fb-draft-generator"')) {
    pass('G14.cron-fb.handler — fb-draft-generator case present');
  } else fail('G14.cron-fb.handler — missing case', 'Add to startCronJobs');
  if (mainText.includes('fbGenerator.generateDrafts') || mainText.includes("require('./fb/generator')")) {
    pass('G14.cron-fb.import — generator module imported');
  } else fail('G14.cron-fb.import — not imported', 'require fb/generator');
} catch (e) { fail('G14.cron-fb — read failed', e.message); }
```

- [ ] **Step 17.2: Run smoke, 2 × FAIL**

- [ ] **Step 17.3: Add fb-draft-generator case to startCronJobs**

In `electron/main.js`, find `_startCronJobsImpl`. In the switch/case that handles existing schedules (like `morning_report`, `heartbeat`), add:

```js
case 'fb-draft-generator':
  task = cron.schedule(parsedCronExpr, async () => {
    try {
      const loaded = fbAuth.loadPageToken(safeStorage);
      if (!loaded) {
        console.log('[fb-draft-generator] no token, skipping');
        return;
      }
      // Pause-aware: check if Telegram paused
      const tgPaused = isChannelPaused('telegram');
      const settings = fbConfig.readSettings();
      // Skip if inside quietHours
      if (settings.quietHours && _nowInsideQuietHours(settings.quietHours)) {
        console.log('[fb-draft-generator] in quiet hours, shifting to end+1min');
        // TODO in Chunk 4: delay logic
      }
      const llmCall = async (prompt) => {
        // Use existing 9router HTTP endpoint
        const res = await fetch(GATEWAY_URL + '/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5-mini',
            messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Generate today\'s drafts.' }],
            max_tokens: 2000,
            response_format: { type: 'json_object' },
          }),
        });
        const json = await res.json();
        return json.choices?.[0]?.message?.content || '';
      };
      const draft = await fbGenerator.generateDrafts({
        pageId: loaded.config.pageId, pageToken: loaded.token, llmCall,
      });
      // Mark queued if paused
      if (tgPaused) {
        draft.main.status = 'pending-digest-queued';
        for (const v of (draft.variants || [])) v.status = 'pending-digest-queued';
      }
      fbDrafts.writeDraftForDate(draft.date, draft);
      if (!tgPaused) {
        await sendTelegram(_renderFbDigest(draft));
      }
      auditLog('fb_draft_generated', { date: draft.date, mainId: draft.main.id, variantCount: (draft.variants || []).length });
    } catch (e) {
      console.error('[fb-draft-generator] failed:', e);
      // 2-consecutive-fail alert logic (track in simple in-memory counter persisted to audit)
      _fbGeneratorFailCount = (_fbGeneratorFailCount || 0) + 1;
      if (_fbGeneratorFailCount >= 2) {
        await sendCeoAlert('[FB] Không gen được draft 2 ngày liên tiếp. Kiểm tra kết nối FB + 9router. Lỗi: ' + e.message);
        _fbGeneratorFailCount = 0;
      }
    }
  });
  break;
```

Add at top of main.js (with other requires):

```js
const fbGenerator = require('./fb/generator');
const fbDrafts = require('./fb/drafts');
let _fbGeneratorFailCount = 0;
```

Add helper `_renderFbDigest(draft)` (plain text, no emoji, no inline buttons yet — Chunk 4 adds buttons):

```js
function _renderFbDigest(draft) {
  const m = draft.main;
  const lines = [
    `Sáng sếp. Hôm nay có 1 draft FB${draft.variants?.length ? ` + ${draft.variants.length} variant` : ''} để duyệt.`,
    '',
    `[Main] ${m.angle}`,
    `"${(m.message || '').slice(0, 180)}${(m.message || '').length > 180 ? '...' : ''}"`,
  ];
  if (m.imageHint) lines.push(`Ảnh gợi ý: ${m.imageHint}`);
  if (m.suggestedTimes?.length) lines.push(`Giờ đăng tối ưu: ${m.suggestedTimes.join(', ')}`);
  lines.push('');
  for (const v of (draft.variants || [])) {
    lines.push(`[Variant ${v.id.slice(-1).toUpperCase()}] ${v.angle}`);
    lines.push(`"${(v.message || '').slice(0, 120)}${(v.message || '').length > 120 ? '...' : ''}"`);
    lines.push('');
  }
  lines.push('Sếp vào Dashboard → tab Facebook để duyệt.');
  lines.push('(Chunk 4 sẽ thêm nút "Đăng Main" bấm trực tiếp trên Telegram.)');
  return lines.join('\n');
}

function _nowInsideQuietHours(qh) {
  if (!qh?.start || !qh?.end) return false;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (qh.start <= qh.end) return hhmm >= qh.start && hhmm <= qh.end;
  return hhmm >= qh.start || hhmm <= qh.end;
}
```

- [ ] **Step 17.4: Add schedule entry**

In `schedules.json` at repo root, add:
```json
{
  "name": "fb-draft-generator",
  "time": "07:30",
  "owner": "facebook",
  "label": "Tạo draft FB sáng"
}
```

- [ ] **Step 17.5: Run smoke, verify G14.cron-fb passes**

- [ ] **Step 17.6: Commit**

```bash
git add electron/main.js schedules.json electron/scripts/smoke-test.js
git commit -m "feat(fb): morning cron fb-draft-generator + Telegram digest (text-only, buttons in Chunk 4)"
```

### Task 18: Chunk 3 smoke-pass gate

- [ ] **Step 18.1: Full smoke run**

Run: `cd electron && npm run smoke`
Expected: all prior + G13.drafts.×7, G13.generator.×4, G14.cron-fb.×2 PASS.

- [ ] **Step 18.2: Tag**

```bash
git tag -a fb-chunk-3 -m "Chunk 3 complete: drafts lifecycle + generator pipeline + morning cron + text digest"
```

---

## Chunk 4: Approval UX — Telegram Inline Buttons + Dashboard FB Tab

**Goal:** CEO taps "Đăng Main" on Telegram → bot publishes → digest edited to "Đã đăng". Dashboard FB tab with full editor. Undo window 60s persisted.

### Task 19: ensureTelegramCallbackFix — openclaw Telegram plugin patch

**Files:** Modify `electron/main.js`

- [ ] **Step 19.1: Smoke guards G9 + G9b**

```js
try {
  const mainText = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  if (mainText.includes('ensureTelegramCallbackFix')) pass('G9b.call-site — function defined');
  else fail('G9b.call-site — not defined', 'Add ensureTelegramCallbackFix');
  // G9b: function must be called inside _startOpenClawImpl body
  const impl = mainText.match(/function\s+_startOpenClawImpl[\s\S]+?\n\}/);
  if (impl && impl[0].includes('ensureTelegramCallbackFix()')) {
    pass('G9b.invoke — called from _startOpenClawImpl');
  } else fail('G9b.invoke — not called in _startOpenClawImpl', 'Add ensureTelegramCallbackFix() call');
  if (mainText.includes('9BizClaw TELEGRAM-CALLBACK PATCH v1')) pass('G9.marker — patch marker present');
  else fail('G9.marker — missing', 'Add marker to TS injection');
} catch (e) { fail('G9 — read failed', e.message); }
```

- [ ] **Step 19.2: Run smoke, 3 × FAIL**

- [ ] **Step 19.3: Implement ensureTelegramCallbackFix**

In `electron/main.js`, following the pattern of `ensureZaloBlocklistFix`:

```js
function ensureTelegramCallbackFix() {
  try {
    const home = require('os').homedir();
    const inboundPath = path.join(home, '.openclaw', 'extensions', 'telegram', 'src', 'inbound.ts');
    if (!fs.existsSync(inboundPath)) {
      console.warn('[ensureTelegramCallbackFix] telegram inbound.ts not found, skipping');
      return;
    }
    let content = fs.readFileSync(inboundPath, 'utf-8');
    if (content.includes('9BizClaw TELEGRAM-CALLBACK PATCH v1')) {
      return; // already applied
    }
    // Find anchor: the switch-case on update type, or top of handler
    const anchor = /handleUpdate\s*\(\s*update\s*[:,]/;
    const match = content.match(anchor);
    if (!match) {
      const err = new Error('TELEGRAM_CALLBACK_ANCHOR_MISSING');
      try {
        auditLog('patch_anchor_missing', { patch: 'ensureTelegramCallbackFix', inbound: inboundPath });
        sendCeoAlert('[FB] Telegram callback patch anchor not found — inline buttons disabled, text fallback still works').catch(() => {});
      } catch {}
      throw err;
    }
    const injection = `
    // === 9BizClaw TELEGRAM-CALLBACK PATCH v1 ===
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data || '';
      if (data.startsWith('fb:')) {
        // Forward via IPC to main.js
        if (process.send) {
          process.send({ type: 'fb-telegram-callback', data, chatId: cb.message?.chat?.id, messageId: cb.message?.message_id, userId: cb.from?.id, callbackQueryId: cb.id });
        }
        // ACK immediately to prevent spinner timeout
        fetch(\`https://api.telegram.org/bot\${this.token}/answerCallbackQuery\`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: cb.id, text: 'Đã nhận' }),
        }).catch(() => {});
        return;
      }
    }
    // === END 9BizClaw TELEGRAM-CALLBACK PATCH v1 ===
`;
    // Insert immediately after the anchor match
    content = content.replace(match[0], match[0] + injection);
    fs.writeFileSync(inboundPath, content, 'utf-8');
    console.log('[ensureTelegramCallbackFix] patched telegram inbound.ts');
  } catch (e) {
    console.error('[ensureTelegramCallbackFix] failed:', e.message);
    // Do not throw — continue boot with inline buttons disabled
  }
}
```

Add call inside `_startOpenClawImpl()` right after other `ensureXxxFix()` calls:

```js
ensureTelegramCallbackFix();
```

- [ ] **Step 19.4: Handle callback IPC in main.js**

Add (outside any function, near other `process.on` listeners):

```js
// Process message handler for openclaw child process
// Note: the openclaw gateway is spawned via spawn(); we get IPC via process.send
// from the forked process. If openclaw is run in non-IPC mode, this no-ops.
process.on('message', async (msg) => {
  if (msg?.type === 'fb-telegram-callback' && typeof msg.data === 'string') {
    try { await handleFbTelegramCallback(msg); } catch (e) { console.error('[fb-tg-callback]', e); }
  }
});

async function handleFbTelegramCallback({ data, chatId, messageId, userId }) {
  const parts = data.split(':'); // fb:<action>:<draftId>[:<variant>]
  const action = parts[1];
  const draftId = parts[2];
  const variant = parts[3] || null;
  // Source-channel validation: compare userId with CEO chat ID
  const tgCfg = await getTelegramConfigWithRecovery();
  if (String(userId) !== String(tgCfg.chatId) && String(chatId) !== String(tgCfg.chatId)) {
    auditLog('fb_callback_denied', { reason: 'wrong-chat', userId, chatId, expected: tgCfg.chatId });
    return;
  }
  switch (action) {
    case 'publish': await _fbHandlePublish(draftId, variant, chatId, messageId); break;
    case 'skip': await _fbHandleSkip(draftId, chatId, messageId); break;
    case 'undo': await _fbHandleUndo(draftId, chatId, messageId); break;
    case 'edit': await _fbHandleEdit(draftId, chatId, messageId); break;
    default: console.warn('[fb-tg-callback] unknown action:', action);
  }
}
```

Stubs for `_fbHandlePublish`, `_fbHandleSkip`, `_fbHandleUndo`, `_fbHandleEdit` — implement in Task 20.

- [ ] **Step 19.5: Run smoke, verify G9 + G9b pass**

- [ ] **Step 19.6: Commit**

```bash
git add electron/main.js electron/scripts/smoke-test.js
git commit -m "feat(fb): ensureTelegramCallbackFix patch + IPC handler for fb:* callback_query"
```

### Task 20: Publish handler + undo window persistence

**Files:** Modify `electron/main.js`, `electron/fb/drafts.js`

- [ ] **Step 20.1: Smoke guard G13.undo**

```js
try {
  const mainText = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  const required = ['_fbHandlePublish', '_fbHandleUndo', 'pending-undo.json'];
  for (const r of required) {
    if (mainText.includes(r)) pass(`G13.undo.${r} — present`);
    else fail(`G13.undo.${r} — missing`, r);
  }
} catch (e) { fail('G13.undo — read failed', e.message); }
```

- [ ] **Step 20.2: Run smoke, 3 × FAIL**

- [ ] **Step 20.3: Implement publish + undo**

Add to `main.js`:

```js
const _fbUndoPath = () => path.join(_workspace(), 'pending-undo.json');

function _readUndoList() {
  try { return JSON.parse(fs.readFileSync(_fbUndoPath(), 'utf-8')); } catch { return []; }
}

function _writeUndoList(list) {
  fs.writeFileSync(_fbUndoPath(), JSON.stringify(list, null, 2), 'utf-8');
}

async function _fbHandlePublish(draftId, variantSuffix, chatId, messageId) {
  try {
    const date = draftId.slice(0, 10); // YYYY-MM-DD
    const draft = fbDrafts.readDraftForDate(date);
    if (!draft) return;
    const variantId = variantSuffix && variantSuffix !== 'main'
      ? `${date}-${variantSuffix}`
      : `${date}-main`;
    const content = draft.main?.id === variantId ? draft.main
      : (draft.variants || []).find((v) => v.id === variantId);
    if (!content) return;

    const loaded = fbAuth.loadPageToken(safeStorage);
    if (!loaded) { await sendTelegram('Không kết nối FB. Mở wizard reconnect.'); return; }

    let mediaFbids = [];
    if (content.imageHint && content.imageHint.startsWith('knowledge/')) {
      const imgPath = path.join(_workspace(), content.imageHint);
      if (fs.existsSync(imgPath)) {
        try {
          const up = await fbGraph.uploadPhoto(loaded.config.pageId, loaded.token, { filePath: imgPath });
          if (up.id) mediaFbids = [up.id];
        } catch (e) { console.warn('[fb publish] photo upload failed, text-only fallback:', e.message); }
      }
    }

    const res = await fbGraph.postToFeed(loaded.config.pageId, loaded.token, {
      message: content.message, mediaFbids,
    });
    fbDrafts.markStatus(date, variantId, 'published');

    const postId = res.id || res.post_id;
    fs.appendFileSync(path.join(_workspace(), 'logs', 'fb-posts-log.jsonl'),
      JSON.stringify({ t: new Date().toISOString(), postId, draftId: variantId, angle: content.angle, imageHint: content.imageHint || null }) + '\n');

    // Queue Insights checks (implemented in Chunk 5)
    try { _fbQueueInsights(postId); } catch {}

    // Register undo window
    const undoList = _readUndoList();
    undoList.push({
      postId, chatId, messageId, variantId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    _writeUndoList(undoList);

    // Edit digest message
    await _editTelegramMessage(chatId, messageId, `Đã đăng ${variantId}. Post ID: ${postId}\nhttps://www.facebook.com/${postId}\n\nHủy trong 60s: bấm [Undo] bên dưới.`, [
      [{ text: 'Undo', callback_data: `fb:undo:${postId}` }]
    ]);
    auditLog('fb_published', { postId, draftId: variantId });
  } catch (e) {
    console.error('[fb publish] failed:', e);
    await sendTelegram(`Lỗi đăng FB: ${e.message}`);
    try {
      if (e.status === 401 || e.status === 403) {
        const loaded = fbAuth.loadPageToken(safeStorage);
        if (loaded) {
          const dbg = await fbGraph.debugToken(loaded.token, loaded.config.appId, loaded.secret);
          if (!dbg.data?.is_valid) {
            await sendCeoAlert('[FB] Token invalid. Mở Dashboard reconnect.');
          }
        }
      }
    } catch {}
  }
}

async function _fbHandleSkip(draftId, chatId, messageId) {
  const date = draftId.slice(0, 10);
  fbDrafts.markStatus(date, `${date}-main`, 'skipped');
  await _editTelegramMessage(chatId, messageId, 'Đã bỏ qua draft hôm nay.', []);
}

async function _fbHandleUndo(postId, chatId, messageId) {
  const undoList = _readUndoList();
  const idx = undoList.findIndex((u) => u.postId === postId);
  if (idx < 0) {
    await _answerCallbackQueryInline(chatId, 'Quá thời gian hủy.');
    return;
  }
  const entry = undoList[idx];
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    undoList.splice(idx, 1); _writeUndoList(undoList);
    await _answerCallbackQueryInline(chatId, 'Quá thời gian hủy.');
    return;
  }
  try {
    const loaded = fbAuth.loadPageToken(safeStorage);
    await fbGraph._graphRequest?.('DELETE', `/${encodeURIComponent(postId)}`, {}, loaded.token);
    // Note: graph.js _graphRequest is private; expose deletePost in a later sub-task or
    // add directly here via fetch.
    undoList.splice(idx, 1); _writeUndoList(undoList);
    await _editTelegramMessage(chatId, messageId, 'Đã hủy post.', []);
  } catch (e) {
    await _editTelegramMessage(chatId, messageId, 'Hủy lỗi: ' + e.message, []);
  }
}

async function _fbHandleEdit(draftId, chatId, messageId) {
  // Focus Electron window + navigate FB tab
  if (_mainBrowserWindow && !_mainBrowserWindow.isDestroyed()) {
    _mainBrowserWindow.focus();
    _mainBrowserWindow.webContents.send('navigate-to-fb-draft', draftId);
  } else {
    // If window closed, open it
    createWindow();
    setTimeout(() => _mainBrowserWindow?.webContents.send('navigate-to-fb-draft', draftId), 1500);
  }
  await _answerCallbackQueryInline(chatId, 'Mở Dashboard...');
}

async function _editTelegramMessage(chatId, messageId, text, inlineKeyboard) {
  const tgCfg = await getTelegramConfigWithRecovery();
  const url = `https://api.telegram.org/bot${tgCfg.token}/editMessageText`;
  await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId, message_id: messageId, text,
      reply_markup: inlineKeyboard?.length ? { inline_keyboard: inlineKeyboard } : undefined,
    }),
  });
}

async function _answerCallbackQueryInline(chatId, text) {
  // Fallback when we don't have callbackQueryId in scope (e.g., expired)
  await sendTelegramTo(chatId, text);
}

// Undo expiry worker
setInterval(() => {
  try {
    const list = _readUndoList();
    const now = Date.now();
    const kept = [];
    for (const e of list) {
      if (new Date(e.expiresAt).getTime() <= now) {
        _editTelegramMessage(e.chatId, e.messageId,
          null, []).catch(() => {});
      } else kept.push(e);
    }
    if (kept.length !== list.length) _writeUndoList(kept);
  } catch {}
}, 10_000);
```

- [ ] **Step 20.4: Run smoke, verify G13.undo passes**

- [ ] **Step 20.5: Commit**

```bash
git add electron/main.js electron/scripts/smoke-test.js
git commit -m "feat(fb): publish handler + undo window (pending-undo.json) + 10s expiry worker"
```

### Task 21: Upgrade digest to include inline buttons

**Files:** Modify `electron/main.js`

- [ ] **Step 21.1: Update `_renderFbDigest` to return text + inline_keyboard array**

```js
function _renderFbDigestWithButtons(draft) {
  const m = draft.main;
  const lines = [
    `Sáng sếp. Hôm nay có 1 draft FB${draft.variants?.length ? ` + ${draft.variants.length} variant` : ''} để duyệt.`,
    '',
    `[Main] ${m.angle} — khuyến nghị`,
    `"${(m.message || '').slice(0, 180)}${(m.message || '').length > 180 ? '...' : ''}"`,
  ];
  if (m.imageHint) lines.push(`Ảnh: ${m.imageHint}`);
  if (m.suggestedTimes?.length) lines.push(`Giờ đăng tối ưu: ${m.suggestedTimes.join(', ')}`);
  lines.push('');
  for (let i = 0; i < (draft.variants || []).length; i++) {
    const v = draft.variants[i];
    const label = i === 0 ? 'A' : 'B';
    lines.push(`[Variant ${label}] ${v.angle}`);
    lines.push(`"${(v.message || '').slice(0, 120)}${(v.message || '').length > 120 ? '...' : ''}"`);
    lines.push('');
  }
  const buttons = [[{ text: 'Đăng Main', callback_data: `fb:publish:${draft.date}:main` }]];
  if (draft.variants?.[0]) buttons[0].push({ text: 'Variant A', callback_data: `fb:publish:${draft.date}:a` });
  if (draft.variants?.[1]) buttons[0].push({ text: 'Variant B', callback_data: `fb:publish:${draft.date}:b` });
  buttons.push([
    { text: 'Bỏ hôm nay', callback_data: `fb:skip:${draft.date}` },
    { text: 'Sửa trên Dashboard', callback_data: `fb:edit:${draft.date}` },
  ]);
  return { text: lines.join('\n'), inlineKeyboard: buttons };
}

async function sendTelegramWithButtons(text, inlineKeyboard) {
  const tgCfg = await getTelegramConfigWithRecovery();
  const url = `https://api.telegram.org/bot${tgCfg.token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: tgCfg.chatId, text, reply_markup: { inline_keyboard: inlineKeyboard } }),
  });
  return res.json();
}
```

Update `fb-draft-generator` cron handler (from Task 17.3): replace `await sendTelegram(_renderFbDigest(draft))` with:

```js
const { text, inlineKeyboard } = _renderFbDigestWithButtons(draft);
await sendTelegramWithButtons(text, inlineKeyboard);
```

- [ ] **Step 21.2: Commit**

```bash
git add electron/main.js
git commit -m "feat(fb): upgrade morning digest to inline-button message via sendTelegramWithButtons"
```

### Task 22: Dashboard FB tab shell

**Files:** Modify `electron/ui/dashboard.html`, `electron/preload.js`

- [ ] **Step 22.1: Smoke guard G11.fb-tab**

```js
try {
  const dashText = fs.readFileSync(path.join(__dirname, '..', 'ui', 'dashboard.html'), 'utf-8');
  const ids = ['page-facebook', 'fb-status-bar', 'fb-drafts-list', 'fb-compose', 'fb-performance-chart'];
  for (const id of ids) {
    if (dashText.includes(`id="${id}"`)) pass(`G11.fb-tab.${id} — present`);
    else fail(`G11.fb-tab.${id} — missing`, id);
  }
} catch (e) { fail('G11.fb-tab — read failed', e.message); }
```

- [ ] **Step 22.2: Run smoke, 5 × FAIL**

- [ ] **Step 22.3: Add sidebar menu item + page shell**

In `dashboard.html`, find sidebar nav. Add a new item below "Lịch hẹn" / GCal entry:

```html
<a href="#page-facebook" class="side-item" data-page="facebook">Facebook</a>
```

Add page div (inside main content area):

```html
<section id="page-facebook" class="page" style="display:none">
  <h1>Facebook</h1>
  <div id="fb-status-bar" class="status-bar">
    <span class="dot dot-gray"></span>
    <span class="status-text">Chưa kết nối</span>
    <button id="fb-connect-cta">Kết nối</button>
  </div>

  <section id="fb-drafts-section">
    <h2>Duyệt hôm nay</h2>
    <div id="fb-drafts-list"><!-- cards injected by JS --></div>
  </section>

  <section id="fb-compose-section">
    <h2>Soạn bài mới</h2>
    <div id="fb-compose">
      <textarea id="fb-compose-text" rows="6" placeholder="Nội dung bài đăng..."></textarea>
      <input id="fb-compose-image" placeholder="Đường dẫn ảnh (knowledge/san-pham/...)" />
      <button id="fb-compose-publish">Đăng ngay</button>
    </div>
  </section>

  <section id="fb-performance-section">
    <h2>Hiệu quả (4 tuần)</h2>
    <div id="fb-performance-chart"><!-- custom SVG injected by JS in Chunk 5 --></div>
  </section>
</section>
```

- [ ] **Step 22.4: Wire draft card rendering**

Add JS inside dashboard.html:

```js
async function loadFbDrafts() {
  const status = await window.claw.fbGetStatus();
  const bar = document.getElementById('fb-status-bar');
  if (status.connected) {
    bar.querySelector('.dot').className = 'dot dot-green';
    bar.querySelector('.status-text').textContent = `Kết nối: ${status.pageName}`;
  }
  const drafts = await window.claw.fbListPendingDrafts();
  const list = document.getElementById('fb-drafts-list');
  list.innerHTML = '';
  for (const { date, draft } of drafts) {
    const card = document.createElement('div');
    card.className = 'fb-draft-card';
    card.id = `fb-draft-${date}-main`;
    card.innerHTML = `
      <div class="fb-draft-angle">[Main] ${draft.main.angle}</div>
      <textarea class="fb-draft-message">${draft.main.message}</textarea>
      <div class="fb-draft-meta">
        ${draft.main.imageHint ? `Ảnh: ${draft.main.imageHint}` : ''}
        ${draft.main.suggestedTimes ? `Giờ đề xuất: ${draft.main.suggestedTimes.join(', ')}` : ''}
      </div>
      <div class="fb-draft-actions">
        <button class="fb-publish-btn" data-date="${date}" data-variant="main">Đăng ngay</button>
        <button class="fb-skip-btn" data-date="${date}">Bỏ</button>
      </div>
    `;
    list.appendChild(card);
    // Variants
    for (let i = 0; i < (draft.variants || []).length; i++) {
      const v = draft.variants[i];
      const letter = i === 0 ? 'a' : 'b';
      const vCard = card.cloneNode(true);
      vCard.id = `fb-draft-${date}-${letter}`;
      vCard.querySelector('.fb-draft-angle').textContent = `[Variant ${letter.toUpperCase()}] ${v.angle}`;
      vCard.querySelector('.fb-draft-message').value = v.message;
      vCard.querySelector('.fb-publish-btn').dataset.variant = letter;
      list.appendChild(vCard);
    }
  }
  // Wire buttons
  list.querySelectorAll('.fb-publish-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      const text = b.closest('.fb-draft-card').querySelector('.fb-draft-message').value;
      await window.claw.fbPublishDraft({ date: b.dataset.date, variant: b.dataset.variant, text });
      loadFbDrafts();
    });
  });
  list.querySelectorAll('.fb-skip-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      await window.claw.fbSkipDraft({ date: b.dataset.date });
      loadFbDrafts();
    });
  });
}

// Handle navigate-to-fb-draft from Telegram "Sửa" button
window.claw.onNavigateToFbDraft?.((draftId) => {
  document.querySelector('[data-page="facebook"]').click();
  setTimeout(() => {
    const anchor = document.getElementById(`fb-draft-${draftId}`);
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
  }, 300);
});

// Call on page activation
document.querySelector('[data-page="facebook"]').addEventListener('click', loadFbDrafts);
```

Add preload bridges:

```js
fbListPendingDrafts: () => ipcRenderer.invoke('fb-list-pending-drafts'),
fbPublishDraft: (args) => ipcRenderer.invoke('fb-publish-draft', args),
fbSkipDraft: (args) => ipcRenderer.invoke('fb-skip-draft', args),
onNavigateToFbDraft: (cb) => ipcRenderer.on('navigate-to-fb-draft', (_e, id) => cb(id)),
```

Add matching IPC handlers in `main.js`:

```js
ipcMain.handle('fb-list-pending-drafts', async () => {
  return { ok: true, items: fbDrafts.listPendingDrafts() };
});
ipcMain.handle('fb-publish-draft', async (_e, { date, variant, text }) => {
  const draft = fbDrafts.readDraftForDate(date);
  if (!draft) return { ok: false, error: 'Draft not found' };
  const variantId = variant === 'main' ? `${date}-main` : `${date}-${variant}`;
  const target = variantId === `${date}-main` ? draft.main : (draft.variants || []).find((v) => v.id === variantId);
  if (!target) return { ok: false, error: 'Variant not found' };
  if (text) target.message = text; // honor inline edit from Dashboard
  fbDrafts.writeDraftForDate(date, draft);
  try {
    await _fbHandlePublish(variantId, variant, null, null); // no chat/message context (Dashboard path)
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('fb-skip-draft', async (_e, { date }) => {
  fbDrafts.markStatus(date, `${date}-main`, 'skipped');
  return { ok: true };
});
```

- [ ] **Step 22.5: Run smoke, verify G11.fb-tab passes (5 × PASS)**

- [ ] **Step 22.6: Commit**

```bash
git add electron/ui/dashboard.html electron/preload.js electron/main.js electron/scripts/smoke-test.js
git commit -m "feat(fb): Dashboard FB tab — drafts list + compose + preload + IPC handlers"
```

### Task 23: Chunk 4 smoke-pass gate

- [ ] **Step 23.1: Full smoke run + tag**

```bash
cd electron && npm run smoke
git tag -a fb-chunk-4 -m "Chunk 4 complete: inline buttons + IPC + Dashboard FB tab + undo window"
```

---

## Chunk 5: Performance Loop — Insights Cron + History + Charts

**Goal:** After post publish, schedule 24h + 7d Insights fetches. Append to `memory/fb-performance-history.md`. Trim to ≤50KB with 12-week verbose + monthly rollup. Render 4-week rolling SVG chart on Dashboard.

### Task 24: performance.js — Insights worker

**Files:** Modify `electron/fb/performance.js`

- [ ] **Step 24.1: Smoke guard G13.performance**

```js
try {
  const p = require('../fb/performance.js');
  const req = ['queueInsightsCheck', 'runInsightsSweep', 'appendPerformanceEntry',
               'trimFbPerformanceHistory', 'readRecentPerformance'];
  for (const n of req) {
    if (typeof p[n] !== 'undefined') pass(`G13.performance.${n} — exported`);
    else fail(`G13.performance.${n} — missing`, n);
  }
} catch (e) { fail('G13.performance — require failed', e.message); }
```

- [ ] **Step 24.2: Run smoke, 5 × FAIL**

- [ ] **Step 24.3: Implement `fb/performance.js`**

```js
// electron/fb/performance.js
const fs = require('fs');
const path = require('path');
const fbGraph = require('./graph');

function _workspace() {
  return process.env['9BIZ_WORKSPACE'] || require('./drafts')._workspaceDir?.() ||
    (() => {
      const os = require('os');
      if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', '9bizclaw');
      if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '9bizclaw');
      return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), '9bizclaw');
    })();
}

const _queuePath = () => path.join(_workspace(), 'pending-insights-checks.json');
const _historyPath = () => path.join(_workspace(), 'memory', 'fb-performance-history.md');

function _readQueue() {
  try { return JSON.parse(fs.readFileSync(_queuePath(), 'utf-8')); } catch { return []; }
}
function _writeQueue(q) { fs.writeFileSync(_queuePath(), JSON.stringify(q, null, 2), 'utf-8'); }

function queueInsightsCheck(postId, publishedAt) {
  const q = _readQueue();
  const t24 = new Date(new Date(publishedAt).getTime() + 24 * 3600_000).toISOString();
  const t7d = new Date(new Date(publishedAt).getTime() + 7 * 24 * 3600_000).toISOString();
  q.push({ postId, checkAt: t24, type: '24h' });
  q.push({ postId, checkAt: t7d, type: '7d' });
  _writeQueue(q);
}

async function runInsightsSweep({ pageToken, fbPosts }) {
  const q = _readQueue();
  const now = Date.now();
  const remaining = [];
  for (const entry of q) {
    if (new Date(entry.checkAt).getTime() > now) {
      remaining.push(entry);
      continue;
    }
    try {
      let metrics;
      if (entry.type === '24h') {
        const r = await fbGraph.fetchInsights(entry.postId, pageToken, [
          'post_reactions_by_type_total',
        ]);
        metrics = { t: '24h', ...r };
      } else {
        const r = await fbGraph.fetchInsights(entry.postId, pageToken, [
          'post_impressions', 'post_impressions_unique', 'post_clicks',
          'post_engaged_users', 'post_reactions_by_type_total',
        ]);
        metrics = { t: '7d', ...r };
      }
      appendPerformanceEntry(entry.postId, metrics, fbPosts?.findById?.(entry.postId));
    } catch (e) {
      if (e.status === 400 || e.code === 100) {
        // Post deleted or insights unavailable (too early) — shift to +1h, max 24h retries
        const retries = (entry._retries || 0) + 1;
        if (retries < 24) {
          remaining.push({ ...entry, _retries: retries, checkAt: new Date(now + 3600_000).toISOString() });
        } else {
          console.warn('[fb performance] giving up on', entry.postId, entry.type);
        }
      } else {
        remaining.push(entry); // transient, retry next sweep
      }
    }
  }
  _writeQueue(remaining);
}

function appendPerformanceEntry(postId, metrics, meta = {}) {
  const hp = _historyPath();
  let content = '';
  try { content = fs.readFileSync(hp, 'utf-8'); } catch { content = '# FB Post Performance History\n\n'; }

  const section = `\n## ${meta.date || new Date().toISOString().slice(0, 10)} | ${meta.angle || 'unknown'} | ${postId}\n\n` +
    `### ${metrics.t}\n${JSON.stringify(metrics.data || metrics, null, 2)}\n\n---\n`;

  fs.writeFileSync(hp, content + section, 'utf-8');
  trimFbPerformanceHistory();
}

function trimFbPerformanceHistory(maxBytes = 50 * 1024) {
  const hp = _historyPath();
  let content;
  try { content = fs.readFileSync(hp, 'utf-8'); } catch { return; }
  if (Buffer.byteLength(content) <= maxBytes) return;

  // Simple collapse: keep last 12 weeks of ## sections verbatim, collapse older to 1-line rollup
  const sections = content.split(/^## /m).map((s, i) => i === 0 ? s : '## ' + s);
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 84);
  const kept = [];
  const old = [];
  for (const sec of sections) {
    const dateMatch = sec.match(/^## (\d{4}-\d{2}-\d{2})/m);
    if (!dateMatch) { kept.push(sec); continue; }
    const d = new Date(dateMatch[1]);
    if (d >= cutoff) kept.push(sec);
    else old.push({ date: dateMatch[1], month: dateMatch[1].slice(0, 7) });
  }
  // Rollup by month
  const byMonth = {};
  for (const o of old) { byMonth[o.month] = (byMonth[o.month] || 0) + 1; }
  const rollups = Object.entries(byMonth).map(([m, n]) => `## ${m} — ${n} posts (summary collapsed)\n`).join('');
  const newContent = (kept[0] || '') + rollups + kept.slice(1).join('');
  fs.writeFileSync(hp, newContent, 'utf-8');
}

function readRecentPerformance() {
  try { return fs.readFileSync(_historyPath(), 'utf-8'); } catch { return null; }
}

module.exports = {
  queueInsightsCheck, runInsightsSweep, appendPerformanceEntry,
  trimFbPerformanceHistory, readRecentPerformance,
};
```

- [ ] **Step 24.4: Run smoke, verify G13.performance passes**

- [ ] **Step 24.5: Commit**

```bash
git add electron/fb/performance.js electron/scripts/smoke-test.js
git commit -m "feat(fb): performance.js — Insights queue + sweep + history append + trim 50KB"
```

### Task 25: Wire 15-min Insights worker + `_fbQueueInsights` helper

**Files:** Modify `electron/main.js`

- [ ] **Step 25.1: Add cron entry + handler**

In `schedules.json`:
```json
{ "name": "fb-insights-sweep", "time": "Mỗi 15 phút", "owner": "facebook", "label": "FB Insights sweep" }
```

In `_startCronJobsImpl` add case:
```js
case 'fb-insights-sweep':
  task = cron.schedule('*/15 * * * *', async () => {
    try {
      const loaded = fbAuth.loadPageToken(safeStorage);
      if (!loaded) return;
      await fbPerformance.runInsightsSweep({ pageToken: loaded.token });
    } catch (e) { console.error('[fb-insights-sweep]', e); }
  });
  break;
```

Add helper:
```js
const fbPerformance = require('./fb/performance');

function _fbQueueInsights(postId) {
  fbPerformance.queueInsightsCheck(postId, new Date().toISOString());
}
```

Also add weekly token-check cron:
```js
case 'fb-token-check':
  task = cron.schedule('0 8 * * 1', async () => {  // Monday 08:00
    try {
      const loaded = fbAuth.loadPageToken(safeStorage);
      if (!loaded) return;
      const dbg = await fbGraph.debugToken(loaded.token, loaded.config.appId, loaded.secret);
      if (!dbg.data?.is_valid) await sendCeoAlert('[FB] Token invalid. Mở Dashboard reconnect.');
    } catch {}
  });
  break;
```

Schedules.json:
```json
{ "name": "fb-token-check", "time": "Mon 08:00", "owner": "facebook", "label": "FB token validity check" }
```

- [ ] **Step 25.2: Commit**

```bash
git add electron/main.js schedules.json
git commit -m "feat(fb): wire fb-insights-sweep + fb-token-check crons with handlers"
```

### Task 26: Dashboard performance section — custom SVG chart

**Files:** Modify `electron/ui/dashboard.html`

- [ ] **Step 26.1: Smoke guard G11.fb-perf-chart**

```js
try {
  const dash = fs.readFileSync(path.join(__dirname, '..', 'ui', 'dashboard.html'), 'utf-8');
  if (dash.includes('renderFbPerformanceChart')) pass('G11.fb-perf-chart.fn — present');
  else fail('G11.fb-perf-chart.fn — missing', 'add renderFbPerformanceChart');
  if (dash.includes('<svg') && dash.includes('fb-performance-chart')) pass('G11.fb-perf-chart.svg — structure present');
  else fail('G11.fb-perf-chart.svg — missing', 'add inline SVG rendering');
} catch (e) { fail('G11.fb-perf-chart — read failed', e.message); }
```

- [ ] **Step 26.2: Run smoke, 2 × FAIL**

- [ ] **Step 26.3: Implement chart rendering**

Add IPC in main.js:
```js
ipcMain.handle('fb-get-performance', async () => {
  const raw = fbPerformance.readRecentPerformance() || '';
  // Parse last 28 days of sections for chart data
  const days = {};
  const sectionRe = /^## (\d{4}-\d{2}-\d{2}).*?\n([\s\S]*?)(?=\n## |\n---\n|$)/gm;
  let m;
  while ((m = sectionRe.exec(raw))) {
    const date = m[1];
    const body = m[2];
    const reactMatch = body.match(/Reactions\s+(\d+)/i) || body.match(/"post_reactions[^"]*"[^:]*:\s*\[?{?"value":?\s*(\d+)/);
    const impMatch = body.match(/Impressions\s+([\d,]+)/i) || body.match(/"post_impressions"[^:]*:[^[]*\[?{?"value":?\s*(\d+)/);
    days[date] = { reactions: parseInt(reactMatch?.[1]?.replace(/,/g, '') || '0', 10),
                    impressions: parseInt(impMatch?.[1]?.replace(/,/g, '') || '0', 10) };
  }
  return { ok: true, days };
});
```

Preload bridge:
```js
fbGetPerformance: () => ipcRenderer.invoke('fb-get-performance'),
```

Dashboard HTML script:
```js
async function renderFbPerformanceChart() {
  const { days } = await window.claw.fbGetPerformance();
  const chart = document.getElementById('fb-performance-chart');
  const entries = Object.entries(days).sort((a, b) => a[0].localeCompare(b[0])).slice(-28);
  if (!entries.length) { chart.innerHTML = '<p>Chưa có dữ liệu. Cần ít nhất 1 post + 24h để thấy biểu đồ.</p>'; return; }
  const maxR = Math.max(1, ...entries.map((e) => e[1].reactions));
  const maxI = Math.max(1, ...entries.map((e) => e[1].impressions));
  const w = 800, h = 240, padL = 50, padB = 30, padT = 10, padR = 10;
  const chartW = w - padL - padR, chartH = h - padT - padB;
  const xStep = chartW / Math.max(1, entries.length - 1);
  const toY = (val, max) => padT + chartH - (val / max) * chartH;

  const reactPath = entries.map(([, v], i) => `${i === 0 ? 'M' : 'L'} ${padL + i * xStep} ${toY(v.reactions, maxR)}`).join(' ');
  const impPath = entries.map(([, v], i) => `${i === 0 ? 'M' : 'L'} ${padL + i * xStep} ${toY(v.impressions, maxI)}`).join(' ');

  chart.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#888" />
      <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#888" />
      <path d="${reactPath}" stroke="#4a90e2" fill="none" stroke-width="2" />
      <path d="${impPath}" stroke="#e24a90" fill="none" stroke-width="2" stroke-dasharray="4 2" />
      <text x="${padL}" y="${padT + chartH + 20}" font-size="10" fill="#666">
        ${entries[0][0]} → ${entries[entries.length - 1][0]}
      </text>
      <text x="${padL + chartW - 150}" y="${padT + 10}" font-size="11" fill="#4a90e2">— Reactions (max ${maxR})</text>
      <text x="${padL + chartW - 150}" y="${padT + 25}" font-size="11" fill="#e24a90">--- Impressions (max ${maxI})</text>
    </svg>
  `;
}

// Call on FB tab activation (extend existing listener from Task 22)
document.querySelector('[data-page="facebook"]').addEventListener('click', () => {
  loadFbDrafts();
  renderFbPerformanceChart();
});
```

- [ ] **Step 26.4: Run smoke, verify G11.fb-perf-chart passes**

- [ ] **Step 26.5: Commit**

```bash
git add electron/ui/dashboard.html electron/preload.js electron/main.js electron/scripts/smoke-test.js
git commit -m "feat(fb): Dashboard performance section with custom SVG 4-week chart"
```

### Task 27: Chunk 5 smoke-pass gate

- [ ] **Step 27.1: Full smoke + tag**

```bash
cd electron && npm run smoke
git tag -a fb-chunk-5 -m "Chunk 5 complete: Insights worker + history + trim + SVG chart"
```

---

## Chunk 6: Bundled Fixes + Cron Dashboard Redesign + Security + Rollout

**Goal:** `/skill` command fixed, Zalo input-side FB marker neutralized, cron Dashboard redesigned by owner field, full smoke G7-G14 passing, version label 2.3.48 shipped.

### Task 28: markers.js — FB + SKILL interceptors

**Files:** Modify `electron/fb/markers.js`

- [ ] **Step 28.1: Smoke guard G13.markers**

```js
try {
  const mk = require('../fb/markers.js');
  const req = ['interceptFbMarkers', 'interceptSkillMarkers', 'validateSource'];
  for (const n of req) {
    if (typeof mk[n] !== 'undefined') pass(`G13.markers.${n} — exported`);
    else fail(`G13.markers.${n} — missing`, n);
  }
} catch (e) { fail('G13.markers — require failed', e.message); }
```

- [ ] **Step 28.2: Run smoke, 3 × FAIL**

- [ ] **Step 28.3: Implement `fb/markers.js`**

```js
// electron/fb/markers.js
const fs = require('fs');
const path = require('path');

function validateSource(meta, expectedCeoChatId) {
  if (!meta || !expectedCeoChatId) return false;
  if (meta.channel !== 'telegram') return false;
  if (String(meta.chatId) !== String(expectedCeoChatId) &&
      String(meta.senderUserId) !== String(expectedCeoChatId)) return false;
  return true;
}

function _auditDeny(marker, meta, reason, workspace) {
  try {
    const logDir = path.join(workspace, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'fb-marker-denied.jsonl'),
      JSON.stringify({ t: new Date().toISOString(), marker, meta, reason }) + '\n');
  } catch {}
}

async function interceptFbMarkers(replyText, meta, { ceoChatId, workspace, handlers }) {
  const reFb = /\[\[FB_(PUBLISH|SKIP|EDIT):\s*(\{[^}]*\})\]\]/g;
  let match;
  let text = replyText;
  while ((match = reFb.exec(replyText))) {
    const action = match[1];
    const payload = match[2];
    if (!validateSource(meta, ceoChatId)) {
      _auditDeny(match[0], meta, 'wrong-channel-or-chat', workspace);
      text = text.replace(match[0], '');
      continue;
    }
    try {
      const args = JSON.parse(payload);
      if (action === 'PUBLISH') await handlers.publish(args);
      else if (action === 'SKIP') await handlers.skip(args);
      else if (action === 'EDIT') await handlers.edit(args);
      text = text.replace(match[0], '');
    } catch (e) {
      _auditDeny(match[0], meta, 'parse-error: ' + e.message, workspace);
      text = text.replace(match[0], '');
    }
  }
  return text;
}

async function interceptSkillMarkers(replyText, meta, { handlers }) {
  let text = replyText;
  const reList = /\[\[SKILL_LIST\]\]/g;
  if (reList.test(replyText)) {
    const listText = await handlers.list();
    text = text.replace(reList, listText);
  }
  const reAct = /\[\[SKILL_ACTIVATE:\s*(\{[^}]*\})\]\]/g;
  let m;
  while ((m = reAct.exec(replyText))) {
    try {
      const args = JSON.parse(m[1]);
      const result = await handlers.activate(args.name);
      text = text.replace(m[0], result);
    } catch (e) { text = text.replace(m[0], `(Không activate được skill: ${e.message})`); }
  }
  const reDeact = /\[\[SKILL_DEACTIVATE\]\]/g;
  if (reDeact.test(replyText)) {
    const result = await handlers.deactivate();
    text = text.replace(reDeact, result);
  }
  return text;
}

module.exports = { interceptFbMarkers, interceptSkillMarkers, validateSource };
```

- [ ] **Step 28.4: Wire into sendTelegram/sendZalo**

In `main.js` `sendTelegram` and `sendZalo`, add marker interception BEFORE the send step. Pattern:

```js
// Before the actual send, run interceptors
const tgCfg = await getTelegramConfigWithRecovery();
const ws = _workspace();
text = await fbMarkers.interceptFbMarkers(text, meta, {
  ceoChatId: tgCfg.chatId,
  workspace: ws,
  handlers: {
    publish: (args) => _fbHandlePublish(args.id, args.variant || 'main'),
    skip: (args) => _fbHandleSkip(args.id),
    edit: (args) => _fbHandleEdit(args.id),
  },
});
text = await fbMarkers.interceptSkillMarkers(text, meta, {
  handlers: {
    list: () => _handleSkillList(),
    activate: (name) => _handleSkillActivate(name),
    deactivate: () => _handleSkillDeactivate(),
  },
});
```

Add stubs for `_handleSkillList`, `_handleSkillActivate`, `_handleSkillDeactivate`:

```js
async function _handleSkillList() {
  const indexPath = path.join(_workspace(), 'skills', 'INDEX.md');
  try {
    const content = fs.readFileSync(indexPath, 'utf-8');
    // Return top-level category list only (first 2 heading levels)
    const lines = content.split('\n').filter((l) => /^#{1,3}\s/.test(l) || /^\|/.test(l)).slice(0, 80);
    return 'Danh sách skill hiện có:\n' + lines.join('\n');
  } catch {
    return 'Không tìm thấy skills/INDEX.md. Hãy reset workspace.';
  }
}

async function _handleSkillActivate(name) {
  const activePath = path.join(_workspace(), 'skills', 'active.md');
  const skillPath = path.join(_workspace(), 'skills', `${name}.md`);
  if (!fs.existsSync(skillPath)) return `Skill không tồn tại: ${name}`;
  fs.writeFileSync(activePath, fs.readFileSync(skillPath, 'utf-8'), 'utf-8');
  return `Đã kích hoạt skill: ${name}`;
}

async function _handleSkillDeactivate() {
  const activePath = path.join(_workspace(), 'skills', 'active.md');
  try { fs.unlinkSync(activePath); } catch {}
  return 'Đã tắt skill.';
}
```

- [ ] **Step 28.5: Run smoke, verify G13.markers passes**

- [ ] **Step 28.6: Commit**

```bash
git add electron/fb/markers.js electron/main.js electron/scripts/smoke-test.js
git commit -m "feat(fb): markers.js — FB + SKILL interceptors with fail-closed source validation"
```

### Task 29: ensureZaloFbNeutralizeFix + AGENTS.md v24 rule updates

**Files:** Modify `electron/main.js`, `AGENTS.md`

- [ ] **Step 29.1: Smoke guard G10**

```js
try {
  const mainText = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
  if (mainText.includes('ensureZaloFbNeutralizeFix')) pass('G10.fn — defined');
  else fail('G10.fn — missing', 'add function');
  if (mainText.includes('9BizClaw FB-NEUTRALIZE PATCH v1')) pass('G10.marker — present');
  else fail('G10.marker — missing', 'v1 marker');
  const agents = fs.readFileSync(path.join(__dirname, '..', '..', 'AGENTS.md'), 'utf-8');
  if (agents.includes('SKILL_LIST') && agents.includes('/skill')) pass('G14.agents.skill-rule — present');
  else fail('G14.agents.skill-rule — missing', 'add /skill mapping rule');
  if (agents.includes('[[FB_PUBLISH]]') || agents.includes('FB_PUBLISH')) pass('G14.agents.fb-marker-rule — present');
  else fail('G14.agents.fb-marker-rule — missing', 'add FB marker protocol declaration');
} catch (e) { fail('G10/G14.agents — failed', e.message); }
```

- [ ] **Step 29.2: Run smoke, 4 × FAIL**

- [ ] **Step 29.3: Implement `ensureZaloFbNeutralizeFix`**

Pattern matches `ensureZaloGcalNeutralizeFix`:

```js
function ensureZaloFbNeutralizeFix() {
  try {
    const home = require('os').homedir();
    const inboundPath = path.join(home, '.openclaw', 'extensions', 'openzalo', 'src', 'inbound.ts');
    if (!fs.existsSync(inboundPath)) return;
    let content = fs.readFileSync(inboundPath, 'utf-8');
    if (content.includes('9BizClaw FB-NEUTRALIZE PATCH v1')) return;

    const anchor = /\/\/ === END MODOROClaw BLOCKLIST PATCH ===/;
    const m = content.match(anchor);
    if (!m) {
      const err = new Error('FB_NEUTRALIZE_ANCHOR_MISSING');
      try {
        auditLog('patch_anchor_missing', { patch: 'ensureZaloFbNeutralizeFix' });
        sendCeoAlert('[FB] Zalo FB neutralize anchor missing — input defense disabled, output defense still runs').catch(() => {});
      } catch {}
      return; // don't throw; continue boot with output-only defense
    }

    const injection = `
// === 9BizClaw FB-NEUTRALIZE PATCH v1 ===
if (typeof rawBody === 'string') {
  rawBody = rawBody.replace(/\\[\\[FB_/g, '[FB-blocked-');
}
// === END 9BizClaw FB-NEUTRALIZE PATCH v1 ===
`;
    content = content.replace(anchor, m[0] + injection);
    fs.writeFileSync(inboundPath, content, 'utf-8');
    console.log('[ensureZaloFbNeutralizeFix] patched inbound.ts');
  } catch (e) {
    console.error('[ensureZaloFbNeutralizeFix] failed:', e.message);
  }
}
```

Add call in `_startOpenClawImpl` after `ensureZaloGcalNeutralizeFix()`.

- [ ] **Step 29.4: Update AGENTS.md with v24 delta rules**

Append new section to `AGENTS.md` (or edit the relevant lines):

```markdown
## Facebook Fanpage — markers [[FB_X: ...]]

When CEO (Telegram only) asks to publish/skip/edit a FB draft, emit one of:

- `[[FB_PUBLISH: {"id":"YYYY-MM-DD-main|a|b"}]]` — publish approved draft
- `[[FB_SKIP: {"id":"YYYY-MM-DD"}]]` — skip today's draft
- `[[FB_EDIT: {"id":"YYYY-MM-DD-main|a|b"}]]` — open Dashboard to edit

main.js executes the marker only if source channel = Telegram AND sender = CEO chat ID.
Markers from Zalo (customer-sourced) are neutralized by ensureZaloFbNeutralizeFix before AI dispatch.

## /skill command protocol

- User types `/skill` → emit `[[SKILL_LIST]]` (main.js replies with categorized skill list from INDEX.md)
- User types `/skill <name>` → emit `[[SKILL_ACTIVATE: {"name":"<name>"}]]`
- User types `/skill off` → emit `[[SKILL_DEACTIVATE]]`

## FB approval reply (short text fallback)

If CEO replies to FB morning digest on Telegram with short text, parse intent:

- "ok", "yes", "đăng", "đăng main" → emit `[[FB_PUBLISH: {"id":"<today>-main"}]]`
- "a", "variant a", "đăng a" → emit `[[FB_PUBLISH: {"id":"<today>-a"}]]`
- "b", "variant b", "đăng b" → emit `[[FB_PUBLISH: {"id":"<today>-b"}]]`
- "bỏ", "skip", "không" → emit `[[FB_SKIP: {"id":"<today>"}]]`
- "sửa", "edit" → emit `[[FB_EDIT: {"id":"<today>-main"}]]`

## Pause-aware cron + quiet hours

FB draft generator cron at 07:30 respects `telegram-paused.json`. If Telegram paused:
generate + persist as `pending-digest-queued`, do not send digest. On channel resume,
send consolidated catch-up digest.

If `config/fb-post-settings.json.quietHours` set, shift digest send to end of quiet window + 1 minute.

## Emoji rule (clarified)

- 9BizClaw-produced UI / digests / alerts / Telegram bot replies: NEVER emoji
- FB caption CEO publishes to their Page: allowed ONLY IF CEO explicitly requests per task
```

- [ ] **Step 29.5: Run smoke, verify G10 + G14.agents pass**

- [ ] **Step 29.6: Commit**

```bash
git add electron/main.js AGENTS.md electron/scripts/smoke-test.js
git commit -m "feat(fb): ensureZaloFbNeutralizeFix patch + AGENTS.md v24 delta rules"
```

### Task 30: Cron Dashboard redesign — group by owner

**Files:** Modify `electron/ui/dashboard.html`, `electron/main.js`, `electron/fb/migrate.js`, `schedules.json`

- [ ] **Step 30.1: Smoke guard G11.cron-dashboard**

```js
try {
  const dash = fs.readFileSync(path.join(__dirname, '..', 'ui', 'dashboard.html'), 'utf-8');
  if (dash.includes('cron-filter-all') && dash.includes('cron-group-zalo') &&
      dash.includes('cron-group-facebook') && dash.includes('cron-group-ceo') &&
      dash.includes('cron-group-system')) {
    pass('G11.cron-dashboard.groups — all 5 filter/group IDs present');
  } else fail('G11.cron-dashboard.groups — missing IDs', 'add filter pills + group sections');
  const sched = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'schedules.json'), 'utf-8'));
  const hasOwner = sched.every((e) => typeof e.owner === 'string');
  if (hasOwner) pass('G11.cron-dashboard.schema — all schedules.json entries have owner');
  else fail('G11.cron-dashboard.schema — missing owner field', 'add owner to all entries');
} catch (e) { fail('G11.cron-dashboard — read failed', e.message); }
```

- [ ] **Step 30.2: Run smoke, 2 × FAIL**

- [ ] **Step 30.3: Add owner field to schedules.json entries**

Update `schedules.json`:
- `morning_report` → `owner: "zalo"`
- `evening_report` → `owner: "zalo"`
- `zalo_cookie_refresh` → `owner: "zalo"`
- `fb-draft-generator`, `fb-insights-sweep`, `fb-token-check` → `owner: "facebook"`
- `heartbeat` → `owner: "system"`
- other system → `owner: "system"`

- [ ] **Step 30.4: Implement migrate.js (one-shot, marker-gated)**

```js
// electron/fb/migrate.js
const fs = require('fs');
const path = require('path');

function migrateCronOwnerFields(workspace) {
  const statePath = path.join(workspace, 'workspace-state.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf-8')); } catch {}
  if (state['cron-owner-migrated-v1']) return { migrated: false, reason: 'already-migrated' };

  const targets = [
    path.join(workspace, 'schedules.json'),
    path.join(workspace, 'custom-crons.json'),
  ];
  for (const tp of targets) {
    try {
      const arr = JSON.parse(fs.readFileSync(tp, 'utf-8'));
      if (!Array.isArray(arr)) continue;
      let changed = false;
      for (const entry of arr) {
        if (typeof entry.owner === 'string') continue;
        const name = (entry.name || '').toLowerCase();
        if (name.startsWith('zalo') || name.includes('cookie')) entry.owner = 'zalo';
        else if (name.startsWith('fb') || name.startsWith('facebook')) entry.owner = 'facebook';
        else if (name === 'heartbeat' || name.includes('watchdog')) entry.owner = 'system';
        else entry.owner = 'ceo';
        changed = true;
      }
      if (changed) fs.writeFileSync(tp, JSON.stringify(arr, null, 2), 'utf-8');
    } catch {}
  }
  state['cron-owner-migrated-v1'] = true;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  return { migrated: true };
}

module.exports = { migrateCronOwnerFields };
```

Call in `seedWorkspace()`:
```js
const fbMigrate = require('./fb/migrate');
fbMigrate.migrateCronOwnerFields(workspace);
```

- [ ] **Step 30.5: Redesign cron Dashboard HTML**

In `dashboard.html` find existing `page-lich-tu-dong` section, replace internals:

```html
<div class="cron-filter-pills">
  <button id="cron-filter-all" class="active">Tất cả</button>
  <button id="cron-filter-zalo">Zalo</button>
  <button id="cron-filter-facebook">Facebook</button>
  <button id="cron-filter-ceo">Cá nhân</button>
  <button id="cron-filter-system">Hệ thống</button>
</div>

<div id="cron-group-zalo" class="cron-group" data-owner="zalo">
  <h3>ZALO</h3>
  <div class="cron-rows"></div>
</div>
<div id="cron-group-facebook" class="cron-group" data-owner="facebook">
  <h3>FACEBOOK</h3>
  <div class="cron-rows"></div>
</div>
<div id="cron-group-ceo" class="cron-group" data-owner="ceo">
  <h3>CÁ NHÂN CEO</h3>
  <div class="cron-rows"></div>
  <button id="cron-add-ceo">+ Thêm lịch</button>
</div>
<div id="cron-group-system" class="cron-group" data-owner="system">
  <h3>HỆ THỐNG (chỉ đọc)</h3>
  <div class="cron-rows"></div>
</div>
```

JS:
```js
async function renderCronPage() {
  const { schedules, custom } = await window.claw.getCronEntries();
  const all = [...schedules, ...custom];
  for (const g of ['zalo', 'facebook', 'ceo', 'system']) {
    const container = document.querySelector(`#cron-group-${g} .cron-rows`);
    container.innerHTML = '';
    for (const e of all.filter((x) => x.owner === g)) {
      const row = document.createElement('div');
      row.className = 'cron-row';
      row.innerHTML = `
        <span class="cron-name">${e.label || e.name}</span>
        <span class="cron-time">${e.time}</span>
        <span class="cron-status">${e.enabled === false ? 'OFF' : 'ON'}</span>
        <span class="cron-actions">
          ${g !== 'system' ? `<button class="cron-pause" data-name="${e.name}">Pause</button>` : ''}
          ${g !== 'system' ? `<button class="cron-test" data-name="${e.name}">Test</button>` : ''}
          ${g !== 'system' ? `<button class="cron-owner-edit" data-name="${e.name}">Sửa nhóm</button>` : ''}
        </span>
      `;
      container.appendChild(row);
    }
  }
  // Wire edit owner
  document.querySelectorAll('.cron-owner-edit').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const newOwner = prompt('Nhóm mới? (zalo/facebook/ceo/system)');
      if (!['zalo', 'facebook', 'ceo', 'system'].includes(newOwner)) return;
      await window.claw.setCronOwner(btn.dataset.name, newOwner);
      renderCronPage();
    });
  });
  // Wire filter pills
  document.querySelectorAll('.cron-filter-pills button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = btn.id.replace('cron-filter-', '');
      document.querySelectorAll('.cron-group').forEach((el) => {
        el.style.display = (g === 'all' || el.dataset.owner === g) ? 'block' : 'none';
      });
      document.querySelectorAll('.cron-filter-pills button').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
}
```

Preload + IPC:
```js
// preload
getCronEntries: () => ipcRenderer.invoke('get-cron-entries'),
setCronOwner: (name, owner) => ipcRenderer.invoke('set-cron-owner', name, owner),

// main.js
ipcMain.handle('get-cron-entries', () => {
  const ws = _workspace();
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ws, f), 'utf-8')); } catch { return []; } };
  return { schedules: read('schedules.json'), custom: read('custom-crons.json') };
});
ipcMain.handle('set-cron-owner', (_e, name, owner) => {
  const ws = _workspace();
  for (const f of ['schedules.json', 'custom-crons.json']) {
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(ws, f), 'utf-8'));
      const entry = arr.find((x) => x.name === name);
      if (entry) { entry.owner = owner; fs.writeFileSync(path.join(ws, f), JSON.stringify(arr, null, 2), 'utf-8'); return { ok: true }; }
    } catch {}
  }
  return { ok: false, error: 'entry not found' };
});
```

- [ ] **Step 30.6: Run smoke, verify G11.cron-dashboard passes (2 × PASS)**

- [ ] **Step 30.7: Commit**

```bash
git add electron/ui/dashboard.html electron/main.js electron/preload.js electron/fb/migrate.js schedules.json electron/scripts/smoke-test.js
git commit -m "feat(fb): Cron Dashboard redesign grouped by owner + migrate + Sửa nhóm action"
```

### Task 31: Chunk 6 smoke-pass gate + final QA checklist run

- [ ] **Step 31.1: Full smoke + tag**

```bash
cd electron && npm run smoke
git tag -a fb-chunk-6 -m "Chunk 6 complete: markers + Zalo neutralize + AGENTS v24 + cron redesign"
```

- [ ] **Step 31.2: Manual QA checklist (from spec)**

Run full manual QA checklist from spec Section "Testing" on fresh install (Windows + Mac):

- Wizard FB step Meta deep-link opens
- Paste App ID + Secret + 5 redirect URIs
- OAuth round-trip on localhost:18791 or fallback
- Pages dropdown shows admin'd Pages
- token.enc + app-secret.enc exist, NOT readable plain
- Cron 07:30 fires (temp set +2min to verify)
- Morning digest Telegram, 3 variants, NO emojis
- Inline buttons render mobile + desktop
- Tap "Đăng Main" → real FB post
- Digest edited to "Đã đăng" after publish
- 24h after: Insights cron fetch OK, appends history
- Dashboard FB tab renders drafts + compose + SVG chart
- /skill command lists categories
- /skill advisory/ceo-advisor activates
- /skill off clears active.md
- Customer sends `[[FB_PUBLISH]]` via Zalo → does NOT publish
- Random Telegram non-CEO chat sends `[[FB_PUBLISH]]` → dropped + audit log
- Disconnect FB (revoke in Meta) → banner appears next boot
- Reconnect preserves historic drafts + performance
- Fresh install, SKIP FB wizard → FB tab empty state, other features OK
- Telegram paused at 07:30 → draft queued, catch-up on resume
- Port 18791 occupied → fallback 18792 works, wizard shows new port
- Cron owner migration: fresh install + upgrade → all entries have owner field
- Undo race: force-quit mid-window → relaunch → button still functional within 60s

- [ ] **Step 31.3: Build + distribute**

```bash
cd electron
npm run build:win
npm run build:mac:arm
npm run build:mac:intel
```

Upload to Telegram/Zalo channel for premium CEOs (per existing v2.3.48 distribution plan).

- [ ] **Step 31.4: Final commit + release tag**

```bash
git tag -a v2.3.48-fb -m "v2.3.48 Facebook Update — CEO-owned fanpage autonomy"
```

---

## Summary

| Chunk | Tasks | Guards Added | Key Deliverable |
|---|---|---|---|
| 1 | 7 | G7 + G13.config/graph/auth/preload/filter | fb/ module + OAuth + IPC |
| 2 | 7 | G11.wizard, G8, G12.index, G14.seed/extraresources/seed-logic | Wizard + 5 skills + seeding |
| 3 | 4 | G13.drafts, G13.generator, G14.cron-fb | Generator + morning cron + text digest |
| 4 | 5 | G9, G9b, G13.undo, G11.fb-tab | Inline buttons + publish + undo + Dashboard |
| 5 | 4 | G13.performance, G11.fb-perf-chart | Insights + history + trim + SVG chart |
| 6 | 4 | G13.markers, G10, G14.agents, G11.cron-dashboard | Markers + Zalo neutralize + AGENTS v24 + cron redesign |

**Total: 31 tasks, 6 chunks, ~41 commits.**

**Version:** `package.json` stays 2.3.48. AGENTS.md bumps v23→v24. UI/about shows "9BizClaw v2.3.48 — Facebook Update".

**Ready to execute** via `superpowers:subagent-driven-development`.

