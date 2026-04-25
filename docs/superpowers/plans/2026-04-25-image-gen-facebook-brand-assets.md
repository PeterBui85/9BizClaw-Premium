# Image Generation + Facebook Posting + Brand Assets — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CEO generates branded images via gpt-image-2 and posts to Facebook Page — all from Telegram chat.

**Architecture:** Three loosely-coupled modules: brand-assets folder (upload/list), image-gen via 9router Codex API (async jobs), and Facebook Graph API publisher. Agent accesses everything via `web_fetch` to Cron API endpoints on port 20200. No new tools in `tools.allow`.

**Tech Stack:** Node.js (Electron main process), Facebook Graph API v25.0, 9router Codex Responses API, Electron safeStorage for token encryption.

**Spec:** `docs/superpowers/specs/2026-04-25-image-gen-facebook-brand-assets-design.md`

---

## Chunk 1: Validation + Brand Assets

### Task 0: Validate reference image input with 9router

**GATE: If this fails, image generation falls back to text-only prompting. Proceed with Task 1+ regardless.**

**Files:** None — manual test only.

- [ ] **Step 1: Test reference image input**

Use the existing test image. Send it as `input_image` to gpt-image-2 via 9router with a prompt that should incorporate the input image's elements.

```javascript
// Test script (run manually, don't commit)
const http = require('http');
const fs = require('fs');
const imgBuf = fs.readFileSync('C:\\Users\\buitu\\AppData\\Local\\Temp\\gpt-image-2-test.png');
const b64 = imgBuf.toString('base64');
const body = JSON.stringify({
  model: 'cx/gpt-5.4',
  input: [{ role: 'user', content: [
    { type: 'input_text', text: 'Redesign this character as a mascot for a Vietnamese coffee shop called "Cafe Saigon". Keep the top hat but add coffee beans and Vietnamese elements.' },
    { type: 'input_image', image_url: 'data:image/png;base64,' + b64 }
  ]}],
  tools: [{ type: 'image_generation', model: 'gpt-image-2', size: '1024x1024' }],
  tool_choice: { type: 'image_generation' },
  stream: true, store: false
});
const req = http.request('http://127.0.0.1:20128/codex/responses', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const lines = data.split('\n').filter(l => l.startsWith('data: '));
    for (const line of lines) {
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'response.output_item.done' && evt.item?.content?.[0]?.result) {
          const b64Out = JSON.parse(evt.item.content[0].result).b64_json;
          if (b64Out) {
            fs.writeFileSync('C:\\Users\\buitu\\AppData\\Local\\Temp\\gpt-image-2-ref-test.png',
              Buffer.from(b64Out, 'base64'));
            console.log('SUCCESS — reference image test saved');
          }
        }
      } catch {}
    }
  });
});
req.write(body); req.end();
```

- [ ] **Step 2: Record result**

Open the output image. If it incorporates elements from the input (the cat character), reference image input works → `REFERENCE_IMAGE_SUPPORTED = true`. If it ignores the input entirely, set `REFERENCE_IMAGE_SUPPORTED = false` and note in spec that assets will be described via text prompting only.

---

### Task 1: Brand assets folder + seedWorkspace

**Files:**
- Modify: `electron/main.js` (seedWorkspace function, ~line 664)

- [ ] **Step 1: Add brand-assets dir creation to seedWorkspace**

In `seedWorkspace()`, after the `memory/zalo-groups` mkdir block, add:

```javascript
try { fs.mkdirSync(path.join(ws, 'brand-assets'), { recursive: true }); } catch {}
try { fs.mkdirSync(path.join(ws, 'brand-assets', 'generated'), { recursive: true }); } catch {}
```

- [ ] **Step 2: Add path validation helper**

Add near the top of main.js (near other utility functions):

```javascript
function isPathSafe(baseDir, filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('\0')) return false;
  const resolved = path.resolve(baseDir, filename);
  return resolved.startsWith(baseDir + path.sep) || resolved === baseDir;
}
```

- [ ] **Step 3: Verify**

Run: `node -e "require('./electron/main.js')"` — no, this won't work (Electron-only). Instead, verify by checking the function exists after next build. For now, visually confirm the code is in the right place.

- [ ] **Step 4: Commit**

```
git add electron/main.js
git commit -m "feat: seed brand-assets dir + path safety helper"
```

---

### Task 2: Brand assets IPC handlers

**Files:**
- Modify: `electron/main.js` (add IPC handlers near knowledge handlers ~line 14536)
- Modify: `electron/preload.js` (add bridges)

- [ ] **Step 1: Add IPC handlers in main.js**

After the knowledge IPC handlers block:

```javascript
// ─── Brand Assets IPC ──────────────────────────────────────────────
const BRAND_ASSET_FORMATS = ['.png', '.jpg', '.jpeg', '.webp'];
const BRAND_ASSET_MAX_SIZE = 10 * 1024 * 1024; // 10MB

function getBrandAssetsDir() {
  return path.join(getWorkspace(), 'brand-assets');
}

ipcMain.handle('list-brand-assets', async () => {
  try {
    const dir = getBrandAssetsDir();
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return BRAND_ASSET_FORMATS.includes(ext) && fs.statSync(path.join(dir, f)).isFile();
    });
    return files.map(f => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { name: f, sizeBytes: stat.size, modifiedAt: stat.mtimeMs };
    });
  } catch (e) { return []; }
});

ipcMain.handle('upload-brand-asset', async (_event, { filepath, originalName }) => {
  try {
    const dir = getBrandAssetsDir();
    fs.mkdirSync(dir, { recursive: true });
    const safeName = (originalName || path.basename(filepath)).replace(/[\\/:*?"<>|]/g, '_');
    const ext = path.extname(safeName).toLowerCase();
    if (!BRAND_ASSET_FORMATS.includes(ext)) return { success: false, error: 'Chỉ hỗ trợ PNG, JPG, WebP' };
    if (!isPathSafe(dir, safeName)) return { success: false, error: 'Tên file không hợp lệ' };
    const stat = fs.statSync(filepath);
    if (stat.size > BRAND_ASSET_MAX_SIZE) return { success: false, error: 'File quá lớn (tối đa 10MB)' };
    const dst = path.join(dir, safeName);
    fs.copyFileSync(filepath, dst);
    return { success: true, name: safeName, sizeBytes: stat.size };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('delete-brand-asset', async (_event, { name }) => {
  try {
    const dir = getBrandAssetsDir();
    if (!isPathSafe(dir, name)) return { success: false, error: 'Tên file không hợp lệ' };
    const full = path.join(dir, name);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('pick-brand-asset-file', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile', 'multiSelections']
  });
  return result.canceled ? [] : result.filePaths;
});
```

- [ ] **Step 2: Add preload bridges**

In `electron/preload.js`, inside the `contextBridge.exposeInMainWorld('claw', { ... })` object:

```javascript
listBrandAssets: () => ipcRenderer.invoke('list-brand-assets'),
uploadBrandAsset: (filepath, originalName) => ipcRenderer.invoke('upload-brand-asset', { filepath, originalName }),
deleteBrandAsset: (name) => ipcRenderer.invoke('delete-brand-asset', { name }),
pickBrandAssetFile: () => ipcRenderer.invoke('pick-brand-asset-file'),
```

- [ ] **Step 3: Commit**

```
git add electron/main.js electron/preload.js
git commit -m "feat: brand assets IPC handlers + preload bridges"
```

---

### Task 3: Brand assets Cron API endpoints

**Files:**
- Modify: `electron/main.js` (inside `startCronApi()`, ~line 12247)

- [ ] **Step 1: Add /api/brand-assets/list endpoint**

Inside `startCronApi()`, before the final `else { return jsonResp(res, 404, ...); }` block:

```javascript
    } else if (urlPath === '/api/brand-assets/list') {
      try {
        const dir = getBrandAssetsDir();
        if (!fs.existsSync(dir)) return jsonResp(res, 200, { files: [] });
        const files = fs.readdirSync(dir).filter(f => {
          const ext = path.extname(f).toLowerCase();
          return BRAND_ASSET_FORMATS.includes(ext) && fs.statSync(path.join(dir, f)).isFile();
        });
        return jsonResp(res, 200, { files });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }

    } else if (urlPath === '/api/brand-assets/save') {
      if (req.method !== 'POST') return jsonResp(res, 405, { error: 'POST only' });
      const { name, base64: b64Data } = params;
      if (!name || !b64Data) return jsonResp(res, 400, { error: 'name and base64 required' });
      const dir = getBrandAssetsDir();
      fs.mkdirSync(dir, { recursive: true });
      const safeName = String(name).replace(/[\\/:*?"<>|]/g, '_');
      if (!isPathSafe(dir, safeName)) return jsonResp(res, 400, { error: 'invalid filename' });
      const ext = path.extname(safeName).toLowerCase();
      if (!BRAND_ASSET_FORMATS.includes(ext)) return jsonResp(res, 400, { error: 'only png/jpg/webp allowed' });
      try {
        const buf = Buffer.from(b64Data, 'base64');
        if (buf.length > BRAND_ASSET_MAX_SIZE) return jsonResp(res, 400, { error: 'file too large (max 10MB)' });
        fs.writeFileSync(path.join(dir, safeName), buf);
        return jsonResp(res, 200, { ok: true, name: safeName, sizeBytes: buf.length });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }
```

- [ ] **Step 2: Add endpoints to the 404 endpoints list**

Update the 404 response's `endpoints` array to include the new endpoints.

- [ ] **Step 3: Commit**

```
git add electron/main.js
git commit -m "feat: brand assets Cron API endpoints (list + save)"
```

---

## Chunk 2: Image Generation

### Task 4: Image generation module

**Files:**
- Create: `electron/lib/image-gen.js`

- [ ] **Step 1: Create the module**

```javascript
// electron/lib/image-gen.js
// gpt-image-2 via 9router Codex Responses API — async job manager

const http = require('http');
const fs = require('fs');
const path = require('path');

const NINE_ROUTER_BASE = 'http://127.0.0.1:20128';
const JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_GENERATED = 20;
const MAX_ASSET_B64_SIZE = 4 * 1024 * 1024; // 4MB per asset

const _jobs = new Map(); // jobId → { status, imagePath, error, startedAt }

function generateJobId() {
  return 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function isAssetPathSafe(baseDir, filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('\0')) return false;
  const resolved = path.resolve(baseDir, filename);
  return resolved.startsWith(baseDir + path.sep) || resolved === baseDir;
}

function resizeImageBase64(buf) {
  // If base64 would exceed 4MB, skip this asset (sharp not available in Electron main)
  const b64Len = Math.ceil(buf.length / 3) * 4;
  if (b64Len > MAX_ASSET_B64_SIZE) return null;
  return buf.toString('base64');
}

function loadAssets(brandAssetsDir, assetNames) {
  const loaded = [];
  for (const name of assetNames) {
    if (!isAssetPathSafe(brandAssetsDir, name)) continue; // path traversal guard
    if (!fs.existsSync(resolved)) continue;
    const buf = fs.readFileSync(resolved);
    const b64 = resizeImageBase64(buf);
    if (!b64) continue;
    const ext = path.extname(name).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    loaded.push({ name, base64: b64, mime });
  }
  return loaded;
}

function buildCodexRequest(prompt, assets, size) {
  const content = [{ type: 'input_text', text: prompt }];
  for (const asset of assets) {
    content.push({
      type: 'input_image',
      image_url: `data:${asset.mime};base64,${asset.base64}`
    });
  }
  return {
    model: 'cx/gpt-5.4',
    input: [{ role: 'user', content }],
    tools: [{ type: 'image_generation', model: 'gpt-image-2', size: size || '1024x1024' }],
    tool_choice: { type: 'image_generation' },
    stream: true,
    store: false
  };
}

function parseSSEForImage(rawData) {
  const lines = rawData.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const evt = JSON.parse(line.slice(6));
      if (evt.type === 'response.output_item.done' && evt.item?.content?.[0]?.result) {
        const result = JSON.parse(evt.item.content[0].result);
        if (result.b64_json) return Buffer.from(result.b64_json, 'base64');
      }
    } catch {}
  }
  return null;
}

function callCodexAPI(requestBody) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(requestBody);
    const url = new URL(NINE_ROUTER_BASE + '/codex/responses');
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`9router ${res.statusCode}: ${data.slice(0, 200)}`));
        const imgBuf = parseSSEForImage(data);
        if (!imgBuf) return reject(new Error('No image in response'));
        resolve(imgBuf);
      });
    });
    req.on('error', reject);
    req.setTimeout(JOB_TIMEOUT_MS, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

function cleanupGenerated(generatedDir) {
  try {
    const files = fs.readdirSync(generatedDir)
      .filter(f => f.endsWith('.png'))
      .map(f => ({ name: f, time: fs.statSync(path.join(generatedDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    while (files.length > MAX_GENERATED) {
      const old = files.pop();
      try { fs.unlinkSync(path.join(generatedDir, old.name)); } catch {}
    }
  } catch {}
}

// Async mutex for generated/ dir writes (prevents cleanup race)
let _genWriteChain = Promise.resolve();
function withGenLock(fn) {
  let release;
  const gate = new Promise(r => { release = r; });
  const prev = _genWriteChain;
  _genWriteChain = gate;
  return prev.then(fn).finally(() => release());
}

function startJob(jobId, prompt, brandAssetsDir, assetNames, size, onComplete) {
  const job = { status: 'generating', imagePath: null, error: null, startedAt: Date.now() };
  let _settled = false;
  _jobs.set(jobId, job);

  function settle(err, imgPath) {
    if (_settled) return;
    _settled = true;
    if (onComplete) onComplete(err, imgPath);
  }

  const assets = loadAssets(brandAssetsDir, assetNames || []);
  const reqBody = buildCodexRequest(prompt, assets, size);

  callCodexAPI(reqBody).then(imgBuf => {
    return withGenLock(() => {
      const generatedDir = path.join(brandAssetsDir, 'generated');
      fs.mkdirSync(generatedDir, { recursive: true });
      const outPath = path.join(generatedDir, jobId + '.png');
      fs.writeFileSync(outPath, imgBuf);
      job.status = 'done';
      job.imagePath = outPath;
      cleanupGenerated(generatedDir);
      settle(null, outPath);
    });
  }).catch(err => {
    job.status = 'failed';
    job.error = err.message;
    settle(err, null);
  });

  // Timeout watchdog
  setTimeout(() => {
    if (job.status === 'generating') {
      job.status = 'failed';
      job.error = 'Timeout sau 15 phút';
      settle(new Error(job.error), null);
    }
  }, JOB_TIMEOUT_MS);

  return jobId;
}

function getJobStatus(jobId) {
  const job = _jobs.get(jobId);
  if (!job) return { status: 'not_found' };
  if (job.status === 'done') return { status: 'done', imagePath: job.imagePath };
  if (job.status === 'failed') return { status: 'failed', error: job.error };
  return { status: 'generating' };
}

module.exports = { startJob, getJobStatus, generateJobId };
```

- [ ] **Step 2: Commit**

```
git add electron/lib/image-gen.js
git commit -m "feat: image generation module (9router Codex API + async jobs)"
```

---

### Task 5: Image generation + Telegram photo Cron API endpoints

**Files:**
- Modify: `electron/main.js` (inside `startCronApi()`)

- [ ] **Step 1: Add require at top of startCronApi**

```javascript
  const imageGen = require('./lib/image-gen');
```

- [ ] **Step 2: Add /api/image/generate endpoint**

```javascript
    } else if (urlPath === '/api/image/generate') {
      const { prompt, assets, size } = params;
      if (!prompt) return jsonResp(res, 400, { error: 'prompt required' });
      if (String(prompt).length > 5000) return jsonResp(res, 400, { error: 'prompt too long (max 5000)' });
      const jobId = imageGen.generateJobId();
      const brandDir = getBrandAssetsDir();
      const assetList = Array.isArray(assets) ? assets : (assets ? [assets] : []);
      imageGen.startJob(jobId, String(prompt), brandDir, assetList, size || '1024x1024', (err, imgPath) => {
        // Proactive notification — send to CEO when job completes
        if (err) {
          sendTelegram('[Tạo ảnh] Thất bại: ' + err.message, { skipFilter: true });
        } else if (imgPath) {
          sendTelegramPhoto(imgPath, 'Ảnh đã tạo xong').catch(e =>
            console.error('[image-gen] proactive photo send failed:', e.message));
        }
      });
      return jsonResp(res, 200, { jobId });

    } else if (urlPath === '/api/image/status') {
      const { jobId } = params;
      if (!jobId) return jsonResp(res, 400, { error: 'jobId required' });
      return jsonResp(res, 200, imageGen.getJobStatus(String(jobId)));
```

- [ ] **Step 3: Add sendTelegramPhoto function**

Add near `sendTelegram()` in main.js:

```javascript
async function sendTelegramPhoto(imagePath, caption) {
  const { token, chatId } = getTelegramConfig();
  if (!token || !chatId) return false;
  if (!fs.existsSync(imagePath)) return false;

  const https = require('https');
  const boundary = '----FormBoundary' + Date.now().toString(36);
  const imgBuf = fs.readFileSync(imagePath);
  const filename = path.basename(imagePath);

  let body = '';
  body += `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
  if (caption) body += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
  body += `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;

  const prefix = Buffer.from(body, 'utf-8');
  const suffix = Buffer.from(tail, 'utf-8');
  const payload = Buffer.concat([prefix, imgBuf, suffix]);

  return new Promise(resolve => {
    const req = https.request(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': payload.length }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).ok === true); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(30000, () => { req.destroy(); resolve(false); });
    req.write(payload);
    req.end();
  });
}
```

- [ ] **Step 4: Add /api/telegram/send-photo endpoint**

```javascript
    } else if (urlPath === '/api/telegram/send-photo') {
      const { imagePath: relPath, caption } = params;
      if (!relPath) return jsonResp(res, 400, { error: 'imagePath required' });
      const ws = getWorkspace();
      const absPath = path.resolve(ws, relPath);
      if (!absPath.startsWith(ws)) return jsonResp(res, 400, { error: 'invalid path' });
      if (!fs.existsSync(absPath)) return jsonResp(res, 400, { error: 'file not found' });
      try {
        const ok = await sendTelegramPhoto(absPath, caption || '');
        return jsonResp(res, ok ? 200 : 500, { success: ok });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }
```

- [ ] **Step 5: Update 404 endpoints list**

- [ ] **Step 6: Commit**

```
git add electron/main.js
git commit -m "feat: image gen + telegram send-photo Cron API endpoints"
```

---

## Chunk 3: Facebook Publisher

### Task 6: Facebook publisher module

**Files:**
- Create: `electron/lib/fb-publisher.js`

- [ ] **Step 1: Create the module**

```javascript
// electron/lib/fb-publisher.js
// Facebook Graph API v25.0 — page posting (publish-only)

const https = require('https');

const GRAPH_API = 'graph.facebook.com';
const API_VERSION = 'v25.0';

function graphRequest(method, endpoint, token, body) {
  return new Promise((resolve, reject) => {
    const url = `/${API_VERSION}${endpoint}`;
    const isPost = method === 'POST';
    const payload = isPost && body ? JSON.stringify(body) : null;
    const headers = { 'Authorization': `Bearer ${token}` };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({ hostname: GRAPH_API, path: url, method, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.error) return reject(new Error(parsed.error.message || 'Graph API error'));
          resolve(parsed);
        } catch { reject(new Error('Invalid JSON from Graph API')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function graphMultipartPhoto(pageId, token, message, imageBuffer) {
  return new Promise((resolve, reject) => {
    const boundary = '----FBBoundary' + Date.now().toString(36);
    let body = '';
    body += `--${boundary}\r\nContent-Disposition: form-data; name="message"\r\n\r\n${message}\r\n`;
    body += `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const prefix = Buffer.from(body, 'utf-8');
    const suffix = Buffer.from(tail, 'utf-8');
    const payload = Buffer.concat([prefix, imageBuffer, suffix]);

    const req = https.request({
      hostname: GRAPH_API,
      path: `/${API_VERSION}/${pageId}/photos`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed);
        } catch { reject(new Error('Invalid response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

async function verifyToken(token) {
  try {
    const data = await graphRequest('GET', '/me/accounts', token);
    if (data.data && data.data.length > 0) {
      const page = data.data[0];
      return { valid: true, pageId: page.id, pageName: page.name, pageToken: page.access_token };
    }
    return { valid: false, error: 'Không tìm thấy Page nào. Token cần quyền pages_manage_posts.' };
  } catch (e) { return { valid: false, error: e.message }; }
}

async function postText(pageId, token, message) {
  const data = await graphRequest('POST', `/${pageId}/feed`, token, { message });
  return { postId: data.id, postUrl: `https://facebook.com/${data.id}` };
}

async function postPhoto(pageId, token, message, imageBuffer) {
  const data = await graphMultipartPhoto(pageId, token, message, imageBuffer);
  const postId = data.post_id || data.id;
  return { postId, postUrl: `https://facebook.com/${postId}` };
}

async function getRecentPosts(pageId, token, limit = 5) {
  const data = await graphRequest('GET',
    `/${pageId}/feed?fields=message,created_time,full_picture&limit=${limit}`, token);
  return data.data || [];
}

module.exports = { verifyToken, postText, postPhoto, getRecentPosts };
```

- [ ] **Step 2: Commit**

```
git add electron/lib/fb-publisher.js
git commit -m "feat: Facebook publisher module (Graph API v25.0)"
```

---

### Task 7: Facebook config IPC + Cron API endpoints

**Files:**
- Modify: `electron/main.js` (IPC handlers + startCronApi endpoints)
- Modify: `electron/preload.js` (bridges)

- [ ] **Step 1: Add FB config helpers in main.js**

```javascript
// ─── Facebook Config ────────────────────────────────────────────────
function getFbConfigPath() { return path.join(getWorkspace(), 'fb-config.json'); }

function readFbConfig() {
  try {
    const raw = fs.readFileSync(getFbConfigPath(), 'utf-8');
    const cfg = JSON.parse(raw);
    if (cfg.accessToken) {
      try {
        const { safeStorage } = require('electron');
        if (safeStorage.isEncryptionAvailable()) {
          cfg.accessToken = safeStorage.decryptString(Buffer.from(cfg.accessToken, 'base64'));
        }
      } catch {}
    }
    return cfg;
  } catch { return null; }
}

function writeFbConfig(cfg) {
  const toWrite = { ...cfg };
  if (toWrite.accessToken) {
    try {
      const { safeStorage } = require('electron');
      if (safeStorage.isEncryptionAvailable()) {
        toWrite.accessToken = safeStorage.encryptString(toWrite.accessToken).toString('base64');
      } else {
        console.warn('[fb-config] safeStorage unavailable — storing token in plaintext');
      }
    } catch {}
  }
  fs.writeFileSync(getFbConfigPath(), JSON.stringify(toWrite, null, 2), 'utf-8');
}
```

- [ ] **Step 2: Add FB IPC handlers**

```javascript
ipcMain.handle('get-fb-config', async () => {
  const cfg = readFbConfig();
  if (!cfg) return null;
  return { pageId: cfg.pageId, pageName: cfg.pageName, connectedAt: cfg.connectedAt };
});

ipcMain.handle('save-fb-config', async (_event, { accessToken }) => {
  try {
    const fbPub = require('./lib/fb-publisher');
    const result = await fbPub.verifyToken(accessToken);
    if (!result.valid) return { success: false, error: result.error };
    const cfg = {
      pageId: result.pageId,
      pageName: result.pageName,
      accessToken: result.pageToken || accessToken,
      connectedAt: new Date().toISOString()
    };
    writeFbConfig(cfg);
    return { success: true, pageId: cfg.pageId, pageName: cfg.pageName };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('verify-fb-token', async () => {
  const cfg = readFbConfig();
  if (!cfg || !cfg.accessToken) return { valid: false, error: 'Chưa kết nối Facebook' };
  const fbPub = require('./lib/fb-publisher');
  return fbPub.verifyToken(cfg.accessToken);
});

ipcMain.handle('get-fb-recent-posts', async () => {
  const cfg = readFbConfig();
  if (!cfg || !cfg.accessToken) return [];
  try {
    const fbPub = require('./lib/fb-publisher');
    return await fbPub.getRecentPosts(cfg.pageId, cfg.accessToken, 5);
  } catch { return []; }
});
```

- [ ] **Step 3: Add /api/fb/post and /api/fb/recent Cron API endpoints**

```javascript
    } else if (urlPath === '/api/fb/post') {
      const { message: fbMessage, imagePath: relImgPath } = params;
      if (!fbMessage) return jsonResp(res, 400, { error: 'message required' });
      const cfg = readFbConfig();
      if (!cfg || !cfg.accessToken) return jsonResp(res, 400, { error: 'Facebook chưa kết nối. Paste token vào Dashboard.' });
      const fbPub = require('./lib/fb-publisher');
      try {
        let result;
        if (relImgPath) {
          const ws = getWorkspace();
          const absImg = path.resolve(ws, relImgPath);
          if (!absImg.startsWith(ws)) return jsonResp(res, 400, { error: 'invalid imagePath' });
          if (!fs.existsSync(absImg)) return jsonResp(res, 400, { error: 'image not found' });
          const imgBuf = fs.readFileSync(absImg);
          result = await fbPub.postPhoto(cfg.pageId, cfg.accessToken, String(fbMessage), imgBuf);
        } else {
          result = await fbPub.postText(cfg.pageId, cfg.accessToken, String(fbMessage));
        }
        return jsonResp(res, 200, result);
      } catch (e) {
        if (/OAuthException|Invalid OAuth|expired/i.test(e.message)) {
          return jsonResp(res, 401, { error: 'Token Facebook hết hạn. Paste token mới vào Dashboard.' });
        }
        return jsonResp(res, 500, { error: e.message });
      }

    } else if (urlPath === '/api/fb/recent') {
      const cfg = readFbConfig();
      if (!cfg || !cfg.accessToken) return jsonResp(res, 200, { posts: [] });
      try {
        const fbPub = require('./lib/fb-publisher');
        const posts = await fbPub.getRecentPosts(cfg.pageId, cfg.accessToken, 5);
        return jsonResp(res, 200, { posts });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }
```

- [ ] **Step 4: Add preload bridges**

```javascript
getFbConfig: () => ipcRenderer.invoke('get-fb-config'),
saveFbConfig: (accessToken) => ipcRenderer.invoke('save-fb-config', { accessToken }),
verifyFbToken: () => ipcRenderer.invoke('verify-fb-token'),
getFbRecentPosts: () => ipcRenderer.invoke('get-fb-recent-posts'),
```

- [ ] **Step 5: Update 404 endpoints list**

- [ ] **Step 6: Commit**

```
git add electron/main.js electron/preload.js electron/lib/fb-publisher.js
git commit -m "feat: Facebook config IPC + Cron API post/recent endpoints"
```

---

## Chunk 4: Dashboard UI + AGENTS.md

### Task 8: Dashboard Facebook tab

**Files:**
- Modify: `electron/ui/dashboard.html` (replace Facebook "Soon" page)

- [ ] **Step 1: Replace page-facebook content**

Replace the existing `<div class="page" id="page-facebook">` block (currently the "Soon" placeholder) with the full Facebook tab. Three sections: Connect Page, Recent Posts, Brand Assets.

The UI should follow the existing dashboard patterns:
- `.page-header` with icon + title + subtitle
- `.card` containers for each section
- Same CSS variables: `var(--surface)`, `var(--border)`, `var(--text)`, etc.
- Vietnamese text with proper diacritics throughout

**Section 1 — Kết nối Page:** Token paste input, "Kết nối" button, status display, help link to Meta Business Suite.

**Section 2 — Bài đăng gần đây:** List of 5 recent posts from `getFbRecentPosts()`. Each shows text snippet + thumbnail + date. Empty state: "Chưa có bài đăng nào."

**Section 3 — Tài sản thương hiệu:** Grid of thumbnails from `listBrandAssets()`. Upload button (multi-file via `pickBrandAssetFile()`). Delete per-file. Empty state: "Chưa có tài sản nào. Upload logo, ảnh sản phẩm để bot dùng khi tạo ảnh."

- [ ] **Step 2: Add switchPage handler for facebook**

In `switchPage()`, add:
```javascript
if (page === 'facebook') {
  loadFacebookTab();
}
```

- [ ] **Step 3: Add JavaScript functions**

```javascript
async function loadFacebookTab() {
  loadFbConfig();
  loadFbRecentPosts();
  loadBrandAssets();
}

async function loadFbConfig() {
  const cfg = await window.claw.getFbConfig();
  const el = document.getElementById('fb-status');
  if (cfg && cfg.pageName) {
    el.innerHTML = `<div class="card" style="border-color:var(--success)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="color:var(--success);font-size:20px">●</span>
        <div><strong>${esc(cfg.pageName)}</strong><div style="font-size:12px;color:var(--text-muted)">Kết nối lúc ${new Date(cfg.connectedAt).toLocaleString('vi-VN')}</div></div>
      </div>
    </div>`;
  } else {
    el.innerHTML = '';
  }
}

async function connectFbPage() {
  const tokenInput = document.getElementById('fb-token-input');
  const token = tokenInput.value.trim();
  if (!token) { tokenInput.style.borderColor = 'var(--danger)'; return; }
  const btn = document.getElementById('fb-connect-btn');
  btn.disabled = true; btn.textContent = 'Đang xác nhận...';
  try {
    const res = await window.claw.saveFbConfig(token);
    if (res.success) {
      tokenInput.value = '';
      loadFbConfig();
      loadFbRecentPosts();
    } else {
      alert('Lỗi: ' + res.error);
    }
  } catch (e) { alert('Lỗi: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Kết nối';
}

async function loadFbRecentPosts() {
  const el = document.getElementById('fb-recent-posts');
  try {
    const posts = await window.claw.getFbRecentPosts();
    if (!posts.length) { el.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">Chưa có bài đăng nào</div>'; return; }
    el.innerHTML = posts.map(p => `<div class="card" style="margin-bottom:8px">
      <div style="font-size:13px">${esc((p.message || '').slice(0, 200))}</div>
      ${p.full_picture ? '<img src="' + esc(p.full_picture) + '" style="max-width:200px;border-radius:8px;margin-top:8px">' : ''}
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">${new Date(p.created_time).toLocaleString('vi-VN')}</div>
    </div>`).join('');
  } catch { el.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">Không tải được bài đăng</div>'; }
}

async function loadBrandAssets() {
  const el = document.getElementById('brand-assets-grid');
  try {
    const assets = await window.claw.listBrandAssets();
    if (!assets.length) {
      el.innerHTML = '<div style="color:var(--text-muted);padding:30px;text-align:center">Chưa có tài sản nào. Upload logo, ảnh sản phẩm để bot dùng khi tạo ảnh.</div>';
      return;
    }
    el.innerHTML = assets.map(a => `<div class="brand-asset-item" style="display:inline-flex;flex-direction:column;align-items:center;gap:6px;padding:12px;border:1px solid var(--border);border-radius:8px;position:relative">
      <div style="width:80px;height:80px;background:var(--bg);border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden">
        <span data-icon="image" data-icon-size="32" style="color:var(--text-muted)"></span>
      </div>
      <div style="font-size:11px;color:var(--text);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(a.name)}">${esc(a.name)}</div>
      <button class="btn-sm" data-delete-asset="${esc(a.name)}" style="font-size:10px;padding:2px 8px;color:var(--danger);background:transparent;border:1px solid var(--danger);border-radius:4px;cursor:pointer">Xoá</button>
    </div>`).join('');
  } catch { el.innerHTML = '<div style="color:var(--text-muted)">Lỗi tải tài sản</div>'; }
}

async function uploadBrandAssets() {
  const paths = await window.claw.pickBrandAssetFile();
  if (!paths.length) return;
  for (const fp of paths) {
    const name = fp.split(/[\\\/]/).pop();
    const res = await window.claw.uploadBrandAsset(fp, name);
    if (!res.success) alert('Lỗi upload ' + name + ': ' + res.error);
  }
  loadBrandAssets();
}

// Event delegation for brand asset delete buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete-asset]');
  if (!btn) return;
  const name = btn.dataset.deleteAsset;
  if (!confirm('Xoá ' + name + '?')) return;
  window.claw.deleteBrandAsset(name).then(() => loadBrandAssets());
});
```

- [ ] **Step 4: Remove "Soon" badge from sidebar**

Change the Facebook sidebar menu item from:
```html
<span class="badge">Soon</span>
```
to nothing (remove the badge span).

- [ ] **Step 5: Commit**

```
git add electron/ui/dashboard.html
git commit -m "feat: Dashboard Facebook tab (connect page, recent posts, brand assets)"
```

---

### Task 9: AGENTS.md rules

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add Facebook + Image Generation + Brand Assets rules**

Add a new section in AGENTS.md (after the existing Zalo/Telegram rules). All Vietnamese with proper diacritics:

```markdown
## Facebook + Tạo ảnh + Tài sản thương hiệu

### Đăng bài Facebook
KHI CEO yêu cầu đăng bài Facebook:
1. Tạo ảnh (nếu cần) qua web_fetch POST http://127.0.0.1:20200/api/image/generate
2. Soạn caption phù hợp với nội dung CEO yêu cầu
3. GỬI PREVIEW cho CEO qua Telegram:
   - Ảnh (nếu có) qua web_fetch POST http://127.0.0.1:20200/api/telegram/send-photo
   - Caption đầy đủ
   - "Anh xác nhận đăng bài này lên fanpage không? Reply 'ok' để đăng, hoặc nói em thay đổi gì."
4. CHỜ CEO REPLY — KHÔNG tự động đăng
5. CEO nói "ok" / "đăng đi" → web_fetch POST http://127.0.0.1:20200/api/fb/post → xác nhận với link bài đăng
6. CEO nói thay đổi → sửa caption hoặc tạo lại ảnh → preview lại
7. CEO nói "huỷ" / "thôi" → dừng, không đăng

### Tạo ảnh (không đăng FB)
KHI CEO yêu cầu tạo ảnh:
1. web_fetch POST http://127.0.0.1:20200/api/image/generate (prompt + assets)
2. Nói CEO "Em đang tạo ảnh, có thể mất vài phút..."
3. Poll web_fetch GET http://127.0.0.1:20200/api/image/status?jobId=... (tối đa 5 lần, mỗi lần cách 30-60 giây)
4. Khi done → gửi ảnh qua web_fetch POST /api/telegram/send-photo
5. Nếu sau 5 lần vẫn generating → "Ảnh đang tạo lâu hơn dự kiến. Em sẽ báo anh khi xong."
6. KHÔNG tự động đăng lên bất kỳ đâu

### Tài sản thương hiệu (Brand Assets)
- CEO nói "dùng logo" / "dùng ảnh sản phẩm" → web_fetch GET /api/brand-assets/list
- Nếu rỗng → "Anh chưa upload tài sản thương hiệu nào. Vào Dashboard > Facebook > Tài sản thương hiệu để thêm, hoặc gửi ảnh cho em kèm lệnh 'lưu asset'."
- Có nhiều file → hỏi CEO dùng file nào, hoặc dùng tất cả nếu CEO nói chung chung

### Lưu ảnh từ Telegram vào tài sản
KHI CEO gửi ảnh kèm lệnh ("lưu asset", "save logo", "lưu brand asset", "lưu ảnh này"):
1. Download ảnh từ tin nhắn
2. web_fetch POST /api/brand-assets/save (name + base64)
3. Xác nhận: "Em đã lưu [tên file] vào tài sản thương hiệu."
```

- [ ] **Step 2: Bump AGENTS.md version number**

Update the version comment at the top (e.g., v24 → v25).

- [ ] **Step 3: Commit**

```
git add AGENTS.md
git commit -m "feat: AGENTS.md v25 — Facebook posting + image gen + brand assets rules"
```

---

### Task 10: Smoke test + strip Facebook schedule cleanup

**Files:**
- Modify: `electron/main.js` (~line 923, the Facebook schedule stripping code)

- [ ] **Step 1: Remove the Facebook schedule cleanup code**

The code that strips `owner:"facebook"` entries from schedules.json was a guard for when FB wasn't implemented. Now that it is, remove it:

```javascript
// DELETE these lines (~923-936):
// Strip entries with owner:"facebook" — FB features are v2.3.48+, not this version.
// const cleaned = sched.filter(s => s?.owner !== 'facebook' && !/^fb-/.test(s?.id || ''));
// ...
```

- [ ] **Step 2: Run smoke test**

```
cd electron && npm run smoke
```

Expect: PASS. If fail, fix before proceeding.

- [ ] **Step 3: Manual integration test checklist**

1. Start app → Dashboard → Facebook tab loads (no "Soon" badge)
2. Brand Assets section shows empty state
3. Upload an image → appears in grid
4. Delete image → removed
5. Paste a Facebook Page Access Token → "Kết nối" → shows page name
6. Recent posts appear (if page has posts)
7. (If 9router running) Test image generation via Cron API:
   ```
   curl -X POST http://127.0.0.1:20200/api/image/generate -H "Content-Type: application/json" -d "{\"token\":\"<TOKEN>\",\"prompt\":\"A simple test image\"}"
   ```
   Then poll status until done.

- [ ] **Step 4: Commit**

```
git add electron/main.js
git commit -m "feat: remove FB schedule stripping (FB now implemented)"
```

---

## Execution Notes

- **Task 0 is a gate** — run it first. If reference images don't work via 9router, `loadAssets()` in image-gen.js still loads them but the API may ignore them. The module works either way; we just won't get brand-incorporated outputs.
- **main.js is huge** (~17K lines). All additions follow existing patterns. Don't reorganize — just add at the established insertion points.
- **All Vietnamese text must have proper diacritics** (dấu). No "Bat Zalo" or "Tao lai". Check every string.
- **safeStorage** may not be available before `app.whenReady()`. The FB config read/write functions handle this gracefully.
- **No changes to `tools.allow`** — agent uses `web_fetch` for everything.
