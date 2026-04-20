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

- [ ] **Step 5.1: Add smoke guard G13.ipc for preload exports (TDD-first)**

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

Note: inside the template-literal, `\\b` is the intended TS source `\b` (one backslash is swallowed by the JS string literal). If the file uses a raw template literal or different escaping convention, mirror the existing entries' escaping style exactly.

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
Expected: ALL guards PASS (pre-existing G1-G14 + all new Chunk 1 guards: G7.×8, G13.config.×5, G13.graph.×9+1 version pin, G13.auth.×7, G13.preload.×5, G13.filter.×3). If any FAIL, fix root cause before proceeding — do NOT move to Chunk 2.

- [ ] **Step 7.2: Tag the chunk completion**

```bash
git tag -a fb-chunk-1 -m "Chunk 1 complete: fb/ skeleton + config + graph + auth + IPC + output filter"
```

---

## Chunk 2: Wizard UI + Workspace Seeding

**Goal of chunk:** CEO can complete the FB wizard step end-to-end on a fresh install: paste App ID + Secret + 5 redirect URIs, click "Kết nối", log in to FB, grant permissions, pick Page, save. After completion, `%APPDATA%/9bizclaw/fb/` contains config.json, token.enc, app-secret.enc. AGENTS.md bumps v23→v24 triggering re-seed of 5 skill templates + fb-performance-history.md + fb-post-settings.json + INDEX.md diff-append.

_[Chunk 2 content continues with Tasks 8-13 — paused for plan-document-reviewer on Chunk 1 first per superpowers:writing-plans skill protocol.]_

---
