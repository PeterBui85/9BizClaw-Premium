# Connector Gateway Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers configure arbitrary external APIs (Shopify, CRM, etc.) via Dashboard UI; bot calls them through a local proxy that injects auth credentials without the AI ever seeing raw API keys.

**Architecture:** New `electron/lib/connector.js` module handles config CRUD, credential encrypt/decrypt, HTTP proxy with SSRF/rate-limit/redirect protection, and skill file generation. Routes delegated from existing `cron-api.js` on port 20200. Dashboard IPC in `dashboard-ipc.js`, bridges in `preload.js`, UI in `dashboard.html`.

**Tech Stack:** Node.js `https`, Electron `safeStorage`, existing cron-api HTTP server, existing `auditLog()`.

**Spec:** `docs/superpowers/specs/2026-05-20-connector-gateway-design.md`

---

## Chunk 1: Core Module — `connector.js`

### Task 1: Scaffold `connector.js` with config CRUD + validation

**Files:**
- Create: `electron/lib/connector.js`

- [ ] **Step 1: Create connector.js with constants, validation, and config read/write**

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { getWorkspace, auditLog } = require('./workspace');

const BLOCKED_HOSTS = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|localhost|::1|\[::)/i;
const CONNECTOR_ID_RE = /^[a-z0-9-]{1,40}$/;
const MAX_CONNECTORS = 20;
const RATE_LIMIT_PER_MIN = 30;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const TEMPLATES = {
  shopify: {
    name: 'Shopify Store',
    baseUrl: 'https://{store}.myshopify.com/admin/api/2024-01',
    authType: 'header',
    headerName: 'X-Shopify-Access-Token',
    placeholder: 'Thay {store} bằng tên shop của bạn',
  },
  hubspot: {
    name: 'HubSpot CRM',
    baseUrl: 'https://api.hubapi.com',
    authType: 'bearer',
  },
};

function getConfigPath() {
  const ws = getWorkspace();
  return ws ? path.join(ws, 'config', 'connectors.json') : null;
}

function getSecretsPath() {
  const ws = getWorkspace();
  return ws ? path.join(ws, 'config', 'connector-secrets.json') : null;
}

function validateConnectorId(id) {
  return typeof id === 'string' && CONNECTOR_ID_RE.test(id);
}

function validateBaseUrl(url) {
  if (typeof url !== 'string') return 'baseUrl must be a string';
  if (!url.startsWith('https://')) return 'baseUrl must start with https://';
  try {
    const parsed = new URL(url);
    if (BLOCKED_HOSTS.test(parsed.hostname)) return 'baseUrl points to a private/internal address';
  } catch { return 'baseUrl is not a valid URL'; }
  return null;
}

function readConnectors() {
  try {
    const p = getConfigPath();
    if (!p || !fs.existsSync(p)) return { version: 1, connectors: [] };
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { return { version: 1, connectors: [] }; }
}

function writeConnectors(data) {
  const p = getConfigPath();
  if (!p) return;
  const dir = path.dirname(p);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

function readSecrets() {
  try {
    const p = getSecretsPath();
    if (!p || !fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { return {}; }
}

function writeSecrets(data) {
  const p = getSecretsPath();
  if (!p) return;
  const dir = path.dirname(p);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}
```

- [ ] **Step 2: Add encrypt/decrypt helpers using safeStorage**

```js
const PLAIN_PREFIX = 'plain:';

function encryptToken(plaintext) {
  try {
    const { safeStorage } = require('electron');
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plaintext).toString('base64');
    }
  } catch {}
  console.warn('[connector] safeStorage unavailable — storing token with plaintext marker');
  return PLAIN_PREFIX + plaintext;
}

function decryptToken(stored) {
  if (typeof stored === 'string' && stored.startsWith(PLAIN_PREFIX)) {
    return stored.slice(PLAIN_PREFIX.length);
  }
  try {
    const { safeStorage } = require('electron');
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    }
  } catch (e) {
    console.error('[connector] token decryption failed:', e?.message);
    return null;
  }
  return stored;
}
```

- [ ] **Step 3: Add saveConnector / deleteConnector / toggleConnector / listConnectors**

```js
function listConnectors() {
  const { connectors } = readConnectors();
  return connectors.map(c => ({
    id: c.id, name: c.name, baseUrl: c.baseUrl, authType: c.authType,
    enabled: c.enabled, readOnly: c.readOnly, headerName: c.headerName,
    template: c.template, createdAt: c.createdAt, updatedAt: c.updatedAt,
  }));
}

function saveConnector({ id, name, baseUrl, authType, token, headerName, readOnly, template }) {
  if (!name || typeof name !== 'string' || !name.trim()) return { ok: false, error: 'Tên kết nối không được để trống' };
  if (!validateConnectorId(id)) return { ok: false, error: 'Invalid connector ID (a-z0-9- only, max 40 chars)' };
  const urlErr = validateBaseUrl(baseUrl);
  if (urlErr) return { ok: false, error: urlErr };
  if (!['bearer', 'header'].includes(authType)) return { ok: false, error: 'authType must be "bearer" or "header"' };
  if (authType === 'header' && !headerName) return { ok: false, error: 'headerName required for API Key Header auth' };

  const data = readConnectors();
  if (data.connectors.length >= MAX_CONNECTORS && !data.connectors.find(c => c.id === id)) {
    return { ok: false, error: `Maximum ${MAX_CONNECTORS} connectors reached` };
  }
  const now = new Date().toISOString();
  const existing = data.connectors.findIndex(c => c.id === id);
  const connector = {
    id, name, baseUrl, authType, enabled: true,
    readOnly: readOnly !== false, timeoutMs: 30000,
    headers: { 'Content-Type': 'application/json' },
    headerName: authType === 'header' ? headerName : undefined,
    template: template || null, createdAt: now, updatedAt: now,
  };
  if (existing >= 0) {
    connector.createdAt = data.connectors[existing].createdAt;
    data.connectors[existing] = connector;
  } else {
    data.connectors.push(connector);
  }
  writeConnectors(data);

  if (token) {
    const secrets = readSecrets();
    secrets[id] = { token: encryptToken(token), headerName: headerName || null };
    writeSecrets(secrets);
  }

  regenerateSkillFile();
  auditLog('connector_saved', { id, name });
  return { ok: true };
}

function deleteConnector(id) {
  const data = readConnectors();
  data.connectors = data.connectors.filter(c => c.id !== id);
  writeConnectors(data);
  const secrets = readSecrets();
  delete secrets[id];
  writeSecrets(secrets);
  regenerateSkillFile();
  auditLog('connector_deleted', { id });
  return { ok: true };
}

function toggleConnector(id, enabled) {
  const data = readConnectors();
  const c = data.connectors.find(x => x.id === id);
  if (!c) return { ok: false, error: 'Connector not found' };
  c.enabled = !!enabled;
  c.updatedAt = new Date().toISOString();
  writeConnectors(data);
  regenerateSkillFile();
  auditLog('connector_toggled', { id, enabled: c.enabled });
  return { ok: true };
}
```

- [ ] **Step 4: Add skill file regeneration**

```js
function regenerateSkillFile() {
  try {
    const ws = getWorkspace();
    if (!ws) return;
    const dir = path.join(ws, 'user-skills');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const connectors = listConnectors().filter(c => c.enabled);
    if (!connectors.length) {
      const p = path.join(dir, 'connector-api.md');
      try { fs.unlinkSync(p); } catch {}
      return;
    }
    const lines = [
      '---', 'name: connector-api', 'appliesTo: []', '---',
      '## API Connectors',
      '',
      'Khi CEO hỏi về dữ liệu từ hệ thống bên ngoài (đơn hàng, khách hàng, tồn kho...):',
      '',
      '1. Xem danh sách connector: `web_fetch http://127.0.0.1:20200/api/connectors`',
      '2. Gọi API: `web_fetch http://127.0.0.1:20200/api/connect/{id}/{path}`',
      '',
      '### Connector hiện có:',
    ];
    for (const c of connectors) {
      const rw = c.readOnly ? 'Chỉ đọc' : 'Đọc + ghi';
      lines.push(`- **${c.id}** (${c.name}) — ${rw}.`);
    }
    fs.writeFileSync(path.join(dir, 'connector-api.md'), lines.join('\n') + '\n', 'utf-8');
  } catch (e) {
    console.error('[connector] skill file regeneration failed:', e?.message);
  }
}
```

- [ ] **Step 5: Commit scaffold**

```bash
git add electron/lib/connector.js
git commit -m "feat(connector): scaffold config CRUD, validation, safeStorage encrypt, skill generation"
```

---

### Task 2: HTTP proxy with SSRF/rate-limit/redirect protection

**Files:**
- Modify: `electron/lib/connector.js`

- [ ] **Step 1: Add rate limiter**

```js
const _rateCounts = new Map();
let _rateResetTimer = null;

function _checkRateLimit(connectorId) {
  if (!_rateResetTimer) {
    _rateResetTimer = setInterval(() => _rateCounts.clear(), 60000);
    _rateResetTimer.unref();
  }
  const count = (_rateCounts.get(connectorId) || 0) + 1;
  _rateCounts.set(connectorId, count);
  return count <= RATE_LIMIT_PER_MIN;
}
```

- [ ] **Step 2: Add handleConnectorRoute — the proxy core**

```js
async function handleConnectorRoute(urlPath, params, req, res, jsonResp) {
  // urlPath = '/shopify/orders.json' (already stripped '/api/connect' prefix)
  const parts = urlPath.replace(/^\//, '').split('/');
  const connectorId = parts[0];
  const remainingPath = '/' + parts.slice(1).join('/');

  if (!connectorId) return jsonResp(res, 400, { error: 'Missing connector ID' });

  const data = readConnectors();
  const connector = data.connectors.find(c => c.id === connectorId && c.enabled);
  if (!connector) return jsonResp(res, 404, { error: `Connector "${connectorId}" not found or disabled` });

  // Read-only gate
  const method = (req.method || 'GET').toUpperCase();
  if (connector.readOnly && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return jsonResp(res, 403, { error: 'Connector is read-only' });
  }

  // SSRF + HTTPS check (defense-in-depth — also validated at save time)
  try {
    const parsed = new URL(connector.baseUrl);
    if (parsed.protocol !== 'https:') {
      return jsonResp(res, 400, { error: 'Only HTTPS connectors are supported' });
    }
    if (BLOCKED_HOSTS.test(parsed.hostname)) {
      return jsonResp(res, 403, { error: 'Connector baseUrl points to a blocked address' });
    }
  } catch { return jsonResp(res, 500, { error: 'Invalid connector baseUrl' }); }

  // Rate limit
  if (!_checkRateLimit(connectorId)) {
    res.setHeader('Retry-After', '60');
    return jsonResp(res, 429, { error: 'Rate limit exceeded (30/min per connector)' });
  }

  // Decrypt credentials
  const secrets = readSecrets();
  const cred = secrets[connectorId];
  if (!cred?.token) return jsonResp(res, 500, { error: 'No credentials configured for this connector' });
  const plainToken = decryptToken(cred.token);
  if (!plainToken) return jsonResp(res, 500, { error: 'Failed to decrypt connector credentials' });

  // Build outbound URL
  const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = connector.baseUrl.replace(/\/+$/, '') + remainingPath + queryString;

  // Build headers
  const outHeaders = { ...(connector.headers || {}) };
  if (connector.authType === 'bearer') {
    outHeaders['Authorization'] = 'Bearer ' + plainToken;
  } else if (connector.authType === 'header') {
    outHeaders[connector.headerName || cred.headerName || 'X-API-Key'] = plainToken;
  }

  // Collect request body (for POST/PUT/PATCH)
  let reqBody = null;
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    reqBody = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', () => resolve(null));
    });
    if (reqBody && !outHeaders['Content-Length']) {
      outHeaders['Content-Length'] = reqBody.length;
    }
  }

  // Proxy request — no redirects
  const https = require('https');
  const parsedTarget = new URL(targetUrl);
  const startMs = Date.now();

  return new Promise((resolve) => {
    const options = {
      hostname: parsedTarget.hostname,
      port: parsedTarget.port || 443,
      path: parsedTarget.pathname + parsedTarget.search,
      method,
      headers: outHeaders,
      timeout: connector.timeoutMs || 30000,
    };

    const proxyReq = https.request(options, (proxyRes) => {
      const status = proxyRes.statusCode;

      // Redirect — return info, never follow
      if (status >= 300 && status < 400) {
        auditLog('connector_proxy', { connector: connectorId, path: remainingPath, method, status });
        resolve(jsonResp(res, 200, {
          redirect: true, status, location: proxyRes.headers.location || null,
        }));
        proxyRes.resume();
        return;
      }

      // Check content type
      const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
      const isJson = contentType.includes('application/json');
      const isText = contentType.includes('text/') || contentType.includes('xml') || contentType.includes('html');

      if (!isJson && !isText) {
        auditLog('connector_proxy', { connector: connectorId, path: remainingPath, method, status });
        proxyRes.resume();
        resolve(jsonResp(res, 200, {
          error: 'binary response not supported', contentType, status,
        }));
        return;
      }

      // Stream response with cap
      const chunks = [];
      let size = 0;
      let truncated = false;
      proxyRes.on('data', (chunk) => {
        size += chunk.length;
        if (size <= MAX_RESPONSE_BYTES) {
          chunks.push(chunk);
        } else {
          truncated = true;
        }
      });
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        auditLog('connector_proxy', { connector: connectorId, path: remainingPath, method, status });

        if (isJson) {
          try {
            const parsed = JSON.parse(body);
            const result = truncated ? { data: parsed, _warning: 'Response truncated at 2MB' } : parsed;
            resolve(jsonResp(res, status, result));
          } catch {
            resolve(jsonResp(res, status, { raw: body, contentType, _parseError: true }));
          }
        } else {
          const result = { raw: body, contentType };
          if (truncated) result._warning = 'Response truncated at 2MB';
          resolve(jsonResp(res, 200, result));
        }
      });
      proxyRes.on('error', (e) => {
        auditLog('connector_proxy', { connector: connectorId, path: remainingPath, method, status: 'stream_error' });
        resolve(jsonResp(res, 502, { error: 'Upstream stream error: ' + e.message }));
      });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      auditLog('connector_proxy', { connector: connectorId, path: remainingPath, method, status: 'timeout' });
      resolve(jsonResp(res, 504, { error: 'Upstream timeout (' + (connector.timeoutMs || 30000) + 'ms)' }));
    });
    proxyReq.on('error', (e) => {
      auditLog('connector_proxy', { connector: connectorId, path: remainingPath, method, status: 'error' });
      resolve(jsonResp(res, 502, { error: 'Upstream request failed: ' + e.message }));
    });

    if (reqBody) proxyReq.write(reqBody);
    proxyReq.end();
  });
}
```

- [ ] **Step 3: Add testConnector function**

```js
async function testConnector(id) {
  const data = readConnectors();
  const connector = data.connectors.find(c => c.id === id);
  if (!connector) return { ok: false, error: 'Connector not found' };

  const secrets = readSecrets();
  const cred = secrets[id];
  if (!cred?.token) return { ok: false, error: 'No credentials configured' };
  const plainToken = decryptToken(cred.token);
  if (!plainToken) return { ok: false, error: 'Failed to decrypt credentials' };

  try {
    const parsed = new URL(connector.baseUrl);
    if (BLOCKED_HOSTS.test(parsed.hostname)) return { ok: false, error: 'baseUrl blocked (private IP)' };
  } catch { return { ok: false, error: 'Invalid baseUrl' }; }

  const outHeaders = { ...(connector.headers || {}) };
  if (connector.authType === 'bearer') {
    outHeaders['Authorization'] = 'Bearer ' + plainToken;
  } else if (connector.authType === 'header') {
    outHeaders[cred.headerName || 'X-API-Key'] = plainToken;
  }

  const tryMethod = async (method) => {
    const https = require('https');
    const parsed = new URL(connector.baseUrl);
    const startMs = Date.now();
    return new Promise((resolve) => {
      const req = https.request({
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method,
        headers: outHeaders,
        timeout: 10000,
      }, (resp) => {
        resp.resume();
        resolve({ ok: resp.statusCode < 400, status: resp.statusCode, latencyMs: Date.now() - startMs, method });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout', method }); });
      req.on('error', (e) => resolve({ ok: false, error: e.message, method }));
      req.end();
    });
  };

  let result = await tryMethod('HEAD');
  if (!result.ok && result.status === 405) {
    result = await tryMethod('GET');
  }
  auditLog('connector_test', { id, result: result.ok, status: result.status });
  return result;
}
```

- [ ] **Step 4: Add module.exports**

```js
module.exports = {
  listConnectors,
  saveConnector,
  deleteConnector,
  toggleConnector,
  testConnector,
  handleConnectorRoute,
  regenerateSkillFile,
  TEMPLATES,
};
```

- [ ] **Step 5: Commit proxy + test**

```bash
git add electron/lib/connector.js
git commit -m "feat(connector): HTTP proxy with SSRF guard, rate limiter, redirect blocking, test endpoint"
```

---

## Chunk 2: Route Delegation + IPC + Preload + Workspace Seed

### Task 3: Wire routes in cron-api.js

**Files:**
- Modify: `electron/lib/cron-api.js:127` (require) and `~675-686` (route delegation)

- [ ] **Step 1: Add require at top of startCronApi**

At line ~127 (after `const handleGoogleRoute = require('./google-routes');`), add:

```js
const connector = require('./connector');
```

- [ ] **Step 2: Add route delegation before the Google routes block**

Insert before the line `if (urlPath.startsWith('/api/google/'))` (line ~679). This placement is AFTER the global default-deny auth gate at line 675, so connector routes are CEO-authenticated automatically.

```js
    if (urlPath.startsWith('/api/connect/')) {
      return connector.handleConnectorRoute(urlPath.slice('/api/connect'.length), params, req, res, jsonResp);
    }
    if (urlPath === '/api/connectors') {
      return jsonResp(res, 200, { connectors: connector.listConnectors() });
    }
    if (urlPath.startsWith('/api/connectors/test/')) {
      const testId = urlPath.slice('/api/connectors/test/'.length);
      const result = await connector.testConnector(testId);
      return jsonResp(res, 200, result);
    }
```

- [ ] **Step 3: Commit route delegation**

```bash
git add electron/lib/cron-api.js
git commit -m "feat(connector): delegate /api/connect and /api/connectors routes from cron-api"
```

---

### Task 4: IPC handlers in dashboard-ipc.js

**Files:**
- Modify: `electron/lib/dashboard-ipc.js` (append at end, before any closing brace)

- [ ] **Step 1: Add 5 IPC handlers**

Add near the end of the file (alongside other `ipcMain.handle` blocks):

```js
// ─── Connector Gateway ──────────────────────────────────────────
ipcMain.handle('list-connectors', async () => {
  try {
    const connector = require('./connector');
    return { ok: true, connectors: connector.listConnectors(), templates: connector.TEMPLATES };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('save-connector', async (_event, data) => {
  try {
    const connector = require('./connector');
    return connector.saveConnector(data);
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('delete-connector', async (_event, id) => {
  try {
    const connector = require('./connector');
    return connector.deleteConnector(id);
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('test-connector', async (_event, id) => {
  try {
    const connector = require('./connector');
    return connector.testConnector(id);
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('toggle-connector', async (_event, { id, enabled }) => {
  try {
    const connector = require('./connector');
    return connector.toggleConnector(id, enabled);
  } catch (e) { return { ok: false, error: e.message }; }
});
```

- [ ] **Step 2: Commit IPC handlers**

```bash
git add electron/lib/dashboard-ipc.js
git commit -m "feat(connector): 5 IPC handlers for Dashboard connector management"
```

---

### Task 5: Preload bridges

**Files:**
- Modify: `electron/preload.js` (add after the Brand Assets section, around line ~262)

- [ ] **Step 1: Add 5 bridge functions**

```js
  // Connector Gateway
  listConnectors: () => ipcRenderer.invoke('list-connectors'),
  saveConnector: (data) => ipcRenderer.invoke('save-connector', data),
  deleteConnector: (id) => ipcRenderer.invoke('delete-connector', id),
  testConnector: (id) => ipcRenderer.invoke('test-connector', id),
  toggleConnector: (id, enabled) => ipcRenderer.invoke('toggle-connector', { id, enabled }),
```

- [ ] **Step 2: Commit preload bridges**

```bash
git add electron/preload.js
git commit -m "feat(connector): 5 preload bridges for connector IPC"
```

---

### Task 6: Seed config/ directory in workspace.js

**Files:**
- Modify: `electron/lib/workspace.js:228` (inside `seedWorkspace()`)

- [ ] **Step 1: Add config dir creation**

After the line `try { fs.mkdirSync(ws, { recursive: true }); } catch {}` (line 228), add:

```js
  try { fs.mkdirSync(path.join(ws, 'config'), { recursive: true }); } catch {}
```

- [ ] **Step 2: Commit workspace seed**

```bash
git add electron/lib/workspace.js
git commit -m "feat(connector): seed config/ directory in workspace on boot"
```

---

## Chunk 3: Dashboard UI

### Task 7: Dashboard sidebar + connector page

**Files:**
- Modify: `electron/ui/dashboard.html`

- [ ] **Step 1: Add sidebar menu item**

Find the sidebar section and add a new item after the existing entries (follow the pattern of existing sidebar items). Add "Tích hợp" (Integration) with an appropriate icon.

- [ ] **Step 2: Add page-connectors container**

Add a new page div following the existing page pattern (e.g., `page-knowledge`, `page-facebook`):

```html
<div id="page-connectors" class="page">
  <div class="page-header">
    <h2>Tích hợp API</h2>
    <p class="page-subtitle">Kết nối bot với các hệ thống bên ngoài (Shopify, CRM, ...)</p>
  </div>

  <div id="connector-list" class="connector-cards"></div>

  <div id="connector-form" style="display:none">
    <div class="form-card">
      <h3 id="connector-form-title">Thêm kết nối</h3>

      <div class="form-group">
        <label>Mẫu</label>
        <select id="conn-template" onchange="applyConnectorTemplate()">
          <option value="">Tùy chỉnh</option>
        </select>
      </div>

      <div class="form-group">
        <label>Tên kết nối</label>
        <input id="conn-name" type="text" placeholder="VD: Shopify Store" oninput="updateConnIdPreview()" />
        <small id="conn-id-preview" class="form-hint"></small>
      </div>

      <div class="form-group">
        <label>URL cơ sở</label>
        <input id="conn-base-url" type="url" placeholder="https://api.example.com" />
      </div>

      <div class="form-group">
        <label>Xác thực</label>
        <select id="conn-auth-type" onchange="toggleConnHeaderName()">
          <option value="bearer">Bearer Token</option>
          <option value="header">API Key Header</option>
        </select>
      </div>

      <div class="form-group" id="conn-header-name-group" style="display:none">
        <label>Header name</label>
        <input id="conn-header-name" type="text" placeholder="X-API-Key" />
      </div>

      <div class="form-group">
        <label>Token / API Key</label>
        <input id="conn-token" type="password" placeholder="Nhập token hoặc API key" />
      </div>

      <div class="form-group">
        <label class="toggle-label">
          <input id="conn-readonly" type="checkbox" checked />
          Chỉ đọc (khuyên dùng)
        </label>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" onclick="testConnectorFromForm()">Kiểm tra kết nối</button>
        <button class="btn btn-primary" onclick="saveConnectorFromForm()">Lưu</button>
        <button class="btn btn-danger" id="conn-delete-btn" style="display:none" onclick="deleteConnectorFromForm()">Xóa</button>
        <button class="btn btn-ghost" onclick="hideConnectorForm()">Hủy</button>
      </div>
      <div id="conn-test-result" class="form-feedback" style="display:none"></div>
    </div>
  </div>

  <button class="btn btn-primary" id="conn-add-btn" onclick="showConnectorForm()">Thêm kết nối</button>
</div>
```

- [ ] **Step 3: Add CSS for connector cards and form**

Add styles matching existing dashboard design system (same card style as Knowledge cards, same form inputs):

```css
.connector-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-bottom: 24px; }
.connector-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; cursor: pointer; transition: border-color 0.15s; }
.connector-card:hover { border-color: var(--accent); }
.connector-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.connector-card-name { font-weight: 600; font-size: 15px; }
.connector-card-url { color: var(--text-muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.connector-card-badges { display: flex; gap: 6px; margin-top: 10px; }
.connector-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: var(--badge-bg, rgba(255,255,255,0.06)); color: var(--text-muted); }
.connector-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.connector-dot.on { background: var(--green, #34d399); }
.connector-dot.off { background: var(--text-muted); }
.connector-toggle-btn { background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px; }
.connector-toggle-btn:hover { background: rgba(255,255,255,0.08); }
```

- [ ] **Step 4: Add JavaScript handlers**

```js
let _editingConnectorId = null;

async function loadConnectors() {
  const result = await window.claw.listConnectors();
  if (!result.ok) return;
  const list = document.getElementById('connector-list');
  const tpl = document.getElementById('conn-template');

  // Populate template dropdown
  tpl.innerHTML = '<option value="">Tùy chỉnh</option>';
  for (const [key, t] of Object.entries(result.templates || {})) {
    tpl.innerHTML += `<option value="${key}">${t.name}</option>`;
  }

  if (!result.connectors.length) {
    list.innerHTML = '<p class="empty-state">Chưa có kết nối nào.</p>';
    return;
  }
  list.innerHTML = result.connectors.map(c => `
    <div class="connector-card" onclick="editConnector('${c.id}')">
      <div class="connector-card-header">
        <span class="connector-card-name">${esc(c.name)}</span>
        <button class="connector-toggle-btn ${c.enabled ? 'on' : ''}" onclick="event.stopPropagation();toggleConnectorEnabled('${c.id}',${!c.enabled})" title="${c.enabled ? 'Tắt' : 'Bật'}">
          <span class="connector-dot ${c.enabled ? 'on' : 'off'}"></span>
        </button>
      </div>
      <div class="connector-card-url">${esc(c.baseUrl)}</div>
      <div class="connector-card-badges">
        <span class="connector-badge">${c.authType === 'bearer' ? 'Bearer' : 'API Key'}</span>
        <span class="connector-badge">${c.readOnly ? 'Chỉ đọc' : 'Đọc + ghi'}</span>
      </div>
    </div>
  `).join('');
}

function showConnectorForm(data) {
  _editingConnectorId = data?.id || null;
  document.getElementById('connector-form').style.display = '';
  document.getElementById('conn-add-btn').style.display = 'none';
  document.getElementById('connector-form-title').textContent = data ? 'Sửa kết nối' : 'Thêm kết nối';
  document.getElementById('conn-delete-btn').style.display = data ? '' : 'none';
  document.getElementById('conn-name').value = data?.name || '';
  document.getElementById('conn-base-url').value = data?.baseUrl || '';
  document.getElementById('conn-auth-type').value = data?.authType || 'bearer';
  document.getElementById('conn-header-name').value = data?.headerName || '';
  document.getElementById('conn-readonly').checked = data ? data.readOnly : true;
  document.getElementById('conn-token').value = '';
  document.getElementById('conn-template').value = data?.template || '';
  document.getElementById('conn-test-result').style.display = 'none';
  toggleConnHeaderName();
  updateConnIdPreview();
}

function hideConnectorForm() {
  document.getElementById('connector-form').style.display = 'none';
  document.getElementById('conn-add-btn').style.display = '';
  _editingConnectorId = null;
}

function applyConnectorTemplate() {
  // Templates are loaded from the IPC result — pre-fill fields when selected
  const tplKey = document.getElementById('conn-template').value;
  if (!tplKey) return;
  // Fetch fresh to get template data
  window.claw.listConnectors().then(r => {
    const t = (r.templates || {})[tplKey];
    if (!t) return;
    document.getElementById('conn-name').value = t.name || '';
    document.getElementById('conn-base-url').value = t.baseUrl || '';
    document.getElementById('conn-auth-type').value = t.authType || 'bearer';
    if (t.headerName) document.getElementById('conn-header-name').value = t.headerName;
    toggleConnHeaderName();
    updateConnIdPreview();
  });
}

function toggleConnHeaderName() {
  const show = document.getElementById('conn-auth-type').value === 'header';
  document.getElementById('conn-header-name-group').style.display = show ? '' : 'none';
}

function updateConnIdPreview() {
  const name = document.getElementById('conn-name').value;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  document.getElementById('conn-id-preview').textContent = id ? `ID: ${id}` : '';
}

async function saveConnectorFromForm() {
  const name = document.getElementById('conn-name').value.trim();
  const id = _editingConnectorId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const result = await window.claw.saveConnector({
    id, name,
    baseUrl: document.getElementById('conn-base-url').value.trim(),
    authType: document.getElementById('conn-auth-type').value,
    token: document.getElementById('conn-token').value || undefined,
    headerName: document.getElementById('conn-header-name').value.trim() || undefined,
    readOnly: document.getElementById('conn-readonly').checked,
    template: document.getElementById('conn-template').value || undefined,
  });
  if (!result.ok) { alert(result.error); return; }
  hideConnectorForm();
  loadConnectors();
}

async function deleteConnectorFromForm() {
  if (!_editingConnectorId) return;
  if (!confirm('Xóa kết nối này?')) return;
  await window.claw.deleteConnector(_editingConnectorId);
  hideConnectorForm();
  loadConnectors();
}

async function editConnector(id) {
  const result = await window.claw.listConnectors();
  const c = (result.connectors || []).find(x => x.id === id);
  if (c) showConnectorForm(c);
}

async function toggleConnectorEnabled(id, enabled) {
  await window.claw.toggleConnector(id, enabled);
  loadConnectors();
}

async function testConnectorFromForm() {
  const id = _editingConnectorId;
  const el = document.getElementById('conn-test-result');
  if (!id) {
    el.textContent = 'Lưu kết nối trước khi kiểm tra.';
    el.className = 'form-feedback warn';
    el.style.display = '';
    return;
  }
  el.textContent = 'Đang kiểm tra...';
  el.className = 'form-feedback';
  el.style.display = '';
  const result = await window.claw.testConnector(id);
  if (result.ok) {
    el.textContent = `Kết nối thành công (${result.status}, ${result.latencyMs}ms)`;
    el.className = 'form-feedback success';
  } else {
    el.textContent = `Lỗi: ${result.error || 'HTTP ' + result.status}`;
    el.className = 'form-feedback error';
  }
}
```

- [ ] **Step 5: Wire loadConnectors into switchPage**

In the existing `switchPage()` function, add a case for `'connectors'`:

```js
case 'connectors': loadConnectors(); break;
```

- [ ] **Step 6: Commit Dashboard UI**

```bash
git add electron/ui/dashboard.html
git commit -m "feat(connector): Dashboard 'Tích hợp' page — connector list, form, test, templates"
```

---

### Task 8: Smoke test end-to-end

- [ ] **Step 1: Run app via RUN.bat, open Dashboard**

Verify:
- Sidebar shows "Tích hợp" item
- Click it → page loads with empty state message
- Click "Thêm kết nối" → form appears
- Select Shopify template → fields pre-fill
- Enter a dummy token, save → card appears with green dot
- Click card → edit form with existing data
- Toggle off → dot turns gray
- Delete → card removed

- [ ] **Step 2: Test proxy route**

With a saved connector, run:
```
curl -H "Authorization: Bearer <cron-api-token>" http://127.0.0.1:20200/api/connectors
```
Verify connector appears in list.

- [ ] **Step 3: Verify audit log**

Check `logs/audit.jsonl` for `connector_saved`, `connector_toggled`, `connector_test` events.

- [ ] **Step 4: Verify skill file**

Check `user-skills/connector-api.md` exists with the enabled connector listed.

- [ ] **Step 5: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix(connector): smoke test adjustments"
```
