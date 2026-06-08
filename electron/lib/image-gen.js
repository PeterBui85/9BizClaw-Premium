// gpt-image-2 via 9router Codex Responses API — async job manager

const http = require('http');
const fs = require('fs');
const path = require('path');

const NINE_ROUTER_BASE = 'http://127.0.0.1:20128';
const JOB_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_GENERATED = 20;
const MAX_ASSET_B64_SIZE = 4 * 1024 * 1024;
const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 50;
const IMAGE_ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const IMAGE_ASSET_TYPES = new Set(['brand', 'product', 'generated', 'knowledge_image', 'pdf_page']);

const VALID_IMAGE_SIZES = new Set([
  '1024x1024', '1024x1536', '1536x1024',
  '1024x1792', '1792x1024', 'auto',
]);
const SIZE_ALIASES = {
  landscape: '1792x1024', ngang: '1792x1024', horizontal: '1792x1024', wide: '1792x1024',
  portrait: '1024x1792', doc: '1024x1792', dọc: '1024x1792', vertical: '1024x1792', tall: '1024x1792',
  square: '1024x1024', vuông: '1024x1024', vuong: '1024x1024',
};

function normalizeImageSize(raw) {
  if (!raw) return '1024x1024';
  const s = String(raw).trim().toLowerCase();
  if (SIZE_ALIASES[s]) return SIZE_ALIASES[s];
  if (VALID_IMAGE_SIZES.has(s)) return s;
  if (/^\d{3,4}x\d{3,4}$/.test(s)) return s;
  return '1024x1024';
}

const _jobs = new Map();

function generateJobId() {
  return 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function pruneJobs() {
  if (_jobs.size <= MAX_JOBS) return;
  const now = Date.now();
  for (const [id, job] of _jobs) {
    if (now - job.startedAt > JOB_TTL_MS) _jobs.delete(id);
  }
  if (_jobs.size <= MAX_JOBS) return;
  const sorted = [..._jobs.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt);
  while (sorted.length > MAX_JOBS) {
    const [id] = sorted.shift();
    _jobs.delete(id);
  }
}

function _jobTiming(job, now = Date.now()) {
  const startedAt = Number(job?.startedAt || now);
  return {
    ageMs: Math.max(0, now - startedAt),
    startedAt: new Date(startedAt).toISOString(),
    timeoutMs: JOB_TIMEOUT_MS,
    timeoutAt: new Date(startedAt + JOB_TIMEOUT_MS).toISOString(),
  };
}

function _expireJobIfStale(job, now = Date.now()) {
  if (!job || job.status !== 'generating') return false;
  const ageMs = now - Number(job.startedAt || now);
  if (ageMs < JOB_TIMEOUT_MS) return false;
  job.status = 'failed';
  job.error = 'image generation timed out after 15 minutes';
  if (typeof job._settle === 'function') {
    try { job._settle(new Error(job.error), null); } catch {}
  } else {
    const waiters = job.waiters || [];
    job.waiters = [];
    for (const waiter of waiters) {
      try { waiter(); } catch {}
    }
  }
  return true;
}

function isAssetPathSafe(baseDir, filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('\0')) return false;
  const resolved = path.resolve(baseDir, filename);
  return resolved.startsWith(baseDir + path.sep) || resolved === baseDir;
}

function isSupportedAssetImage(filePath) {
  return IMAGE_ASSET_EXTENSIONS.has(path.extname(filePath || '').toLowerCase());
}

function resolveAssetPath(brandAssetsDir, name) {
  if (!name || typeof name !== 'string') return null;
  if (!brandAssetsDir) return null;
  if (isAssetPathSafe(brandAssetsDir, name)) {
    const resolved = path.resolve(brandAssetsDir, name);
    if (fs.existsSync(resolved) && isSupportedAssetImage(resolved)) return resolved;
  }
  try {
    const media = require('./media-library');
    const asset = media.findMediaAsset(name);
    if (asset?.path && IMAGE_ASSET_TYPES.has(asset.type) && fs.existsSync(asset.path) && isSupportedAssetImage(asset.path)) {
      return asset.path;
    }
  } catch (e) { console.warn('[image-gen] media-library lookup error:', e?.message || e); }
  return null;
}

function loadAssets(brandAssetsDir, assetNames) {
  console.log(`[image-gen] loadAssets called: brandDir=${brandAssetsDir}, names=${JSON.stringify(assetNames)}`);
  const loaded = [];
  const skipped = [];
  for (const name of assetNames) {
    const resolved = resolveAssetPath(brandAssetsDir, name);
    if (!resolved || !fs.existsSync(resolved)) {
      console.warn(`[image-gen] asset SKIP "${name}": resolved=${resolved}, exists=${resolved ? fs.existsSync(resolved) : false}`);
      skipped.push({ name, reason: 'not_found' });
      continue;
    }
    let buf;
    try {
      buf = fs.readFileSync(resolved);
    } catch (e) {
      console.error(`[image-gen] asset READ FAILED "${name}": ${e.message}`);
      skipped.push({ name, reason: 'read_error', error: e.message });
      continue;
    }
    if (!buf || buf.length === 0) {
      console.warn(`[image-gen] asset SKIP "${name}": file is empty (0 bytes)`);
      skipped.push({ name, reason: 'empty_file' });
      continue;
    }
    const b64Len = Math.ceil(buf.length / 3) * 4;
    if (b64Len > MAX_ASSET_B64_SIZE) {
      const sizeMB = (b64Len / 1024 / 1024).toFixed(1);
      console.error(`[image-gen] asset REJECTED "${name}": ${sizeMB} MB exceeds ${(MAX_ASSET_B64_SIZE / 1024 / 1024).toFixed(0)} MB limit`);
      skipped.push({ name, reason: 'too_large', sizeMB });
      continue;
    }
    const b64 = buf.toString('base64');
    const ext = path.extname(resolved).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    loaded.push({ name: path.basename(resolved), base64: b64, mime });
    console.log(`[image-gen] asset LOADED "${name}" → ${resolved} (${(buf.length / 1024).toFixed(0)} KB, ${mime})`);
  }
  console.log(`[image-gen] loadAssets result: ${loaded.length} loaded, ${skipped.length} skipped of ${assetNames.length} requested`);
  return { loaded, skipped };
}

const BRAND_ASSET_PREFIX = 'CRITICAL INSTRUCTION: The attached reference image(s) are brand assets. You MUST reproduce them EXACTLY as they appear — preserve every detail: exact colors, exact shapes, exact text/typography, exact proportions, exact art style. Do NOT redraw, reinterpret, reimagine, or stylize them. Composite the ORIGINAL image unchanged into the scene.\n\n';

const MIN_PROMPT_LENGTH = 150;

function get9RouterApiKey() {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const cfg = JSON.parse(fs.readFileSync(path.join(home, '.openclaw', 'openclaw.json'), 'utf-8'));
    return cfg?.models?.providers?.ninerouter?.apiKey || null;
  } catch { return null; }
}

function findImageConnectionId() {
  try {
    const { primary } = findAllImageConnectionIds();
    return primary[0] || null;
  } catch { return null; }
}

function categorizeCodexConnections(conns) {
  const codex = conns.filter(c =>
    c.provider === 'codex' && c.isActive !== false &&
    typeof c['modelLock_gpt-5.4-image'] !== 'string'
  );
  const plus = codex.filter(c => c.providerSpecificData?.chatgptPlanType === 'plus');
  const team = codex.filter(c => c.providerSpecificData?.chatgptPlanType === 'team');
  const free = codex.filter(c => {
    const plan = c.providerSpecificData?.chatgptPlanType;
    return !plan || plan === 'free';
  });
  return {
    primary: [...plus.map(c => c.id), ...team.map(c => c.id)],
    free: free.map(c => c.id),
  };
}

function findAllImageConnectionIds() {
  const result = { primary: [], free: [] };
  try {
    const appData = process.env.APPDATA || (process.platform === 'darwin'
      ? path.join(process.env.HOME || '', 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '', '.config'));
    const dbPath = path.join(appData, '9router', 'db.json');
    if (!fs.existsSync(dbPath)) {
      console.warn('[image-gen] 9router db.json not found at', dbPath);
      return result;
    }
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    const conns = db.providerConnections || db.connections || db.providers || [];
    if (!Array.isArray(conns) || conns.length === 0) {
      console.warn('[image-gen] no provider connections in db.json (keys: ' + Object.keys(db).join(', ') + ')');
      return result;
    }
    const cat = categorizeCodexConnections(conns);
    if (cat.primary.length === 0 && cat.free.length === 0) {
      const allCodex = conns.filter(c => c.provider === 'codex');
      console.warn(`[image-gen] 0 eligible codex connections (${allCodex.length} total codex, ${conns.length} total providers)`);
      if (allCodex.length > 0) {
        console.warn('[image-gen] codex exclusion reasons:', allCodex.map(c =>
          `${(c.id || '').slice(0, 8)}: isActive=${c.isActive}, modelLock=${c['modelLock_gpt-5.4-image']}`
        ).join('; '));
      }
    }
    result.primary = cat.primary;
    result.free = cat.free;
  } catch (e) {
    console.error('[image-gen] findAllImageConnectionIds error:', e.message);
  }
  return result;
}

function buildCodexRequest(prompt, assets, size, options = {}) {
  const normalizedSize = normalizeImageSize(size);
  const finalPrompt = assets.length > 0 ? BRAND_ASSET_PREFIX + prompt : prompt;
  console.log(`[image-gen] buildCodexRequest: ${assets.length} assets attached, size=${normalizedSize}, hasPrefix=${assets.length > 0}, promptLen=${finalPrompt.length}`);
  if (assets.length > 0) console.log(`[image-gen] attached assets: ${assets.map(a => a.name + ' (' + (a.base64.length / 1024).toFixed(0) + 'KB b64)').join(', ')}`);
  const content = [{ type: 'input_text', text: finalPrompt }];
  for (const asset of assets) {
    content.push({
      type: 'input_image',
      image_url: `data:${asset.mime};base64,${asset.base64}`
    });
  }
  const body = {
    model: 'cx/gpt-5.4',
    input: [{ role: 'user', content }],
    tools: [{ type: 'image_generation', model: 'gpt-image-2', size: normalizedSize, quality: 'high' }],
    stream: options.stream !== false,
    store: false
  };
  if (options.toolChoice !== false) body.tool_choice = { type: 'image_generation' };
  return body;
}

function findConnectionIdsViaApi() {
  return new Promise(resolve => {
    let tokenCandidates = [''];
    try {
      const { get9RouterCliTokenCandidates } = require('./nine-router');
      const tokens = get9RouterCliTokenCandidates();
      if (Array.isArray(tokens) && tokens.length) tokenCandidates = tokens;
    } catch {}

    const requestWithToken = (index) => {
      const headers = { 'Accept': 'application/json' };
      if (tokenCandidates[index]) headers['x-9r-cli-token'] = tokenCandidates[index];
      const req = http.request({
        hostname: '127.0.0.1', port: 20128,
        path: '/api/providers', method: 'GET',
        headers,
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
        if ((res.statusCode === 401 || res.statusCode === 403) && index + 1 < tokenCandidates.length) {
          requestWithToken(index + 1);
          return;
        }
        try {
          const body = JSON.parse(data);
          // API returns { connections: [...] } — different key from db.json's providerConnections
          const conns = body.connections || body.providers || body.providerConnections || [];
          const cat = categorizeCodexConnections(Array.isArray(conns) ? conns : []);
          const ids = [...cat.primary, ...cat.free];
          console.log(`[image-gen] API fallback found ${ids.length} codex connections`);
          resolve(ids);
        } catch (e) {
          console.warn('[image-gen] API fallback parse error:', e.message);
          resolve([]);
        }
        });
      });
      req.on('error', (e) => {
        console.warn('[image-gen] API fallback request error:', e.message);
        resolve([]);
      });
      req.setTimeout(5000, () => { req.destroy(); resolve([]); });
      req.end();
    };
    requestWithToken(0);
  });
}

function parseSSEForImage(rawData) {
  const lines = rawData.split('\n');
  let errorDetail = null;
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const evt = JSON.parse(line.slice(6));
      if (evt.type === 'response.output_item.done' &&
          evt.item?.type === 'image_generation_call' &&
          evt.item?.result) {
        return Buffer.from(evt.item.result, 'base64');
      }
      if (evt.type === 'response.failed' || evt.type === 'error') {
        errorDetail = evt.error?.message || evt.message || JSON.stringify(evt).slice(0, 300);
      }
      if (evt.type === 'response.completed' && evt.response?.status === 'incomplete') {
        errorDetail = errorDetail || evt.response?.status_details?.reason || 'response incomplete';
      }
    } catch {}
  }
  const match = rawData.match(/"result":"(iVBOR[A-Za-z0-9+/=]+)"/);
  if (match) return Buffer.from(match[1], 'base64');
  if (errorDetail) {
    const err = new Error(`Image generation failed: ${errorDetail}`);
    err._isContentPolicy = /content.?policy|safety|moderation|blocked/i.test(errorDetail);
    throw err;
  }
  return null;
}

// Strip a trailing `/v1` (and slashes) so a stored OpenAI-compatible baseUrl
// (e.g. https://host/v1) yields the 9router ROOT. Image gen lives at
// `<root>/codex/responses` — NOT under /v1 (verified against the tunnel).
function codexRootFromBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '').replace(/\/v1$/, '');
}

// Core codex image caller. Protocol-aware (http for local 127.0.0.1, https for a
// remote Cloudflare tunnel). `rootBase` is the 9router root (no /v1, no trailing
// slash). `connectionId` is optional — a remote hosted 9router auto-routes
// cx/gpt-5.4 to its single codex account, so x-connection-id is omitted there.
function callCodexEndpoint({ rootBase, apiKey, connectionId }, requestBody) {
  return new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error('image provider API key not configured'));
    const payload = JSON.stringify(requestBody);
    const url = new URL(codexRootFromBaseUrl(rootBase) + '/codex/responses');
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? require('https') : http;
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${apiKey}`,
    };
    if (connectionId) headers['x-connection-id'] = connectionId;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST', headers,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`9router ${res.statusCode}: ${data.slice(0, 300)}`));
        try {
          const imgBuf = parseSSEForImage(data);
          if (!imgBuf) return reject(new Error('No image in response'));
          resolve(imgBuf);
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(JOB_TIMEOUT_MS, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// Local-9router image call (127.0.0.1:20128). Needs an explicit x-connection-id
// because a dev machine may hold several codex connections.
function callCodexAPI(requestBody, connectionId) {
  const apiKey = get9RouterApiKey();
  if (!apiKey) return Promise.reject(new Error('9Router API key not configured'));
  const connId = connectionId || findImageConnectionId();
  if (!connId) return Promise.reject(new Error('No codex provider connection available for image generation'));
  return callCodexEndpoint({ rootBase: NINE_ROUTER_BASE, apiKey, connectionId: connId }, requestBody);
}

const _providerProbeCache = new Map(); // baseUrl -> { ok, at }
const PROBE_TTL_MS = 10 * 60 * 1000;

// Read the highest-priority active OpenAI-compatible provider the CEO added in
// 9router. 9router 0.4.63 stores connections in db/data.sqlite (the old db.json
// is gone); GET /api/providers strips apiKey, so the key is only readable here.
// Returns { baseUrl, apiKey, name } or null (any failure → null → codex path).
function readCustom9RouterImageProvider() {
  try {
    const { get9RouterDataDir } = require('./nine-router');
    const dbPath = path.join(get9RouterDataDir(), 'db', 'data.sqlite');
    if (!fs.existsSync(dbPath)) return null;
    let Database;
    try { Database = require('better-sqlite3'); }
    catch (e) { console.warn('[image-gen] better-sqlite3 unavailable for provider read:', e.message); return null; }
    const db = new Database(dbPath, { readonly: true });
    let rows = [];
    try {
      rows = db.prepare(
        "SELECT name, data FROM providerConnections WHERE isActive=1 AND provider LIKE 'openai-compatible%' ORDER BY priority ASC"
      ).all();
    } finally { try { db.close(); } catch {} }
    for (const r of rows) {
      let d;
      try { d = JSON.parse(r.data); } catch { continue; }
      const baseUrl = d?.providerSpecificData?.baseUrl;
      const apiKey = d?.apiKey;
      if (baseUrl && apiKey) return { baseUrl, apiKey, name: r.name || 'custom' };
    }
    return null;
  } catch (e) {
    console.warn('[image-gen] readCustom9RouterImageProvider error:', e.message);
    return null;
  }
}

// Confirm a custom provider is a real 9router with a ChatGPT (codex) account
// behind it — its /v1/models must list at least one `cx/*` model. A non-9router
// OpenAI-compatible endpoint has no /codex/responses, so we skip it (→ codex)
// instead of failing a generation. Cached per baseUrl (10 min).
function probeIs9RouterImageProvider(baseUrl, apiKey) {
  return new Promise(resolve => {
    const cached = _providerProbeCache.get(baseUrl);
    if (cached && Date.now() - cached.at < PROBE_TTL_MS) return resolve(cached.ok);
    let url;
    try { url = new URL(codexRootFromBaseUrl(baseUrl) + '/v1/models'); }
    catch { return resolve(false); }
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? require('https') : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname, method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let ok = false;
        try {
          const j = JSON.parse(data);
          const arr = j?.data || j?.models || [];
          ok = Array.isArray(arr) && arr.some(m => String(m?.id || '').startsWith('cx/'));
        } catch {}
        _providerProbeCache.set(baseUrl, { ok, at: Date.now() });
        resolve(ok);
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function isImageToolChoiceUnsupported(err) {
  return /tool choice ['"]?image_generation['"]? not found|image_generation.*not found in ['"]?tools/i.test(err?.message || '');
}

async function callCodexAPIWithFallback(prompt, assets, size) {
  let customErr = null;
  // 1. Custom provider FIRST — offload image gen to the CEO's hosted account so
  //    the local ChatGPT isn't burned. Only a verified 9router-like provider is
  //    used; anything else (or a read/probe failure) silently skips to codex.
  const custom = readCustom9RouterImageProvider();
  if (custom) {
    const is9r = await probeIs9RouterImageProvider(custom.baseUrl, custom.apiKey);
    if (is9r) {
      // stream:false over the tunnel — ~2.7x faster, half the bytes vs SSE.
      const body = buildCodexRequest(prompt, assets, size, { stream: false });
      try {
        return await callCodexEndpoint({ rootBase: custom.baseUrl, apiKey: custom.apiKey }, body);
      } catch (err) {
        if (err._isContentPolicy) throw err; // genuine refusal — don't retry on codex
        customErr = err;
        console.warn(`[image-gen] custom provider "${custom.name}" failed: ${err.message} — falling back to local codex`);
      }
    } else {
      console.warn(`[image-gen] custom provider "${custom.name}" is not a 9router (no cx/* models) — skipping for image gen`);
    }
  }

  // 2. Local codex fallback.
  let { primary, free } = findAllImageConnectionIds();
  let allIds = [...primary, ...free];
  if (allIds.length === 0) {
    const apiIds = await findConnectionIdsViaApi();
    allIds = apiIds;
  }
  if (allIds.length === 0) {
    // 3. Nothing usable anywhere.
    if (customErr) throw new Error(`Custom provider tạo ảnh lỗi (${customErr.message}). Máy chưa có tài khoản ChatGPT Plus dự phòng. Bạn cần tài khoản ChatGPT Plus hoặc cấu hình custom provider để tạo ảnh.`);
    throw new Error('Bạn cần tài khoản ChatGPT Plus (hoặc cấu hình custom provider) để tạo ảnh.');
  }

  let lastErr = customErr;
  for (const connId of allIds) {
    const body = buildCodexRequest(prompt, assets, size);
    try {
      return await callCodexAPI(body, connId);
    } catch (err) {
      lastErr = err;
      if (err._isContentPolicy) throw err;
      if (/40[013]|unauthorized|invalid.*key/i.test(err.message) && !isImageToolChoiceUnsupported(err)) {
        console.warn(`[image-gen] connection ${connId.slice(0, 8)}… non-transient error: ${err.message}`);
        continue;
      }
      if (isImageToolChoiceUnsupported(err)) {
        try {
          const noTc = buildCodexRequest(prompt, assets, size, { toolChoice: false });
          return await callCodexAPI(noTc, connId);
        } catch (e2) {
          lastErr = e2;
          if (e2._isContentPolicy) throw e2;
        }
      }
      console.warn(`[image-gen] connection ${connId.slice(0, 8)}… failed: ${err.message}, trying next`);
      continue;
    }
  }
  throw lastErr;
}

function cleanupGenerated(generatedDir) {
  try {
    const files = fs.readdirSync(generatedDir)
      .filter(f => f.endsWith('.png'))
      .map(f => ({ name: f, time: fs.statSync(path.join(generatedDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    while (files.length > MAX_GENERATED) {
      const old = files.pop();
      const oldPath = path.join(generatedDir, old.name);
      try { fs.unlinkSync(oldPath); } catch {}
      try {
        const media = require('./media-library');
        media.removeAssetByPath(oldPath);
      } catch {}
    }
  } catch {}
}

let _genWriteChain = Promise.resolve();
function withGenLock(fn) {
  let release;
  const gate = new Promise(r => { release = r; });
  const prev = _genWriteChain;
  _genWriteChain = gate;
  return prev.then(fn).finally(() => release());
}

function startJob(jobId, prompt, brandAssetsDir, assetNames, size, onComplete) {
  const job = { status: 'generating', imagePath: null, relPath: null, mediaId: null, error: null, startedAt: Date.now(), waiters: [] };
  let _settled = false;
  _jobs.set(jobId, job);
  pruneJobs();

  function settle(err, imgPath) {
    if (_settled) return;
    _settled = true;
    const waiters = job.waiters || [];
    job.waiters = [];
    for (const waiter of waiters) {
      try { waiter(); } catch {}
    }
    if (onComplete) onComplete(err, imgPath);
  }
  job._settle = settle;

  const { loaded: assets, skipped: assetSkips } = loadAssets(brandAssetsDir, assetNames || []);
  if (assetSkips.length > 0) {
    job.assetWarnings = assetSkips;
  }

  callCodexAPIWithFallback(prompt, assets, size).then(imgBuf => {
    return withGenLock(() => {
      if (_settled || job.status !== 'generating') return;
      const generatedDir = path.join(brandAssetsDir, 'generated');
      fs.mkdirSync(generatedDir, { recursive: true });
      const outPath = path.join(generatedDir, jobId + '.png');
      fs.writeFileSync(outPath, imgBuf);
      job.status = 'done';
      job.imagePath = outPath;
      job.relPath = path.join('brand-assets', 'generated', jobId + '.png');
      try {
        const mediaAsset = require('./media-library').registerExistingMediaFile(outPath, {
          type: 'generated',
          visibility: 'internal',
          title: jobId,
          source: 'image-generation',
          status: 'ready',
          description: prompt,
        });
        job.mediaId = mediaAsset?.id || null;
      } catch (e) { console.warn('[image-gen] media register failed:', e.message); }
      cleanupGenerated(generatedDir);
      settle(null, outPath);
    });
  }).catch(err => {
    if (_settled || job.status !== 'generating') return;
    job.status = 'failed';
    job.error = err.message;
    settle(err, null);
  });

  setTimeout(() => {
    _expireJobIfStale(job);
  }, JOB_TIMEOUT_MS);

  return jobId;
}

function getJobStatus(jobId) {
  const job = _jobs.get(jobId);
  if (!job) return { status: 'not_found' };
  _expireJobIfStale(job);
  const warnings = job.assetWarnings?.length ? { assetWarnings: job.assetWarnings } : {};
  const timing = _jobTiming(job);
  if (job.status === 'done') return { status: 'done', imagePath: job.relPath || job.imagePath, mediaId: job.mediaId || null, ...timing, ...warnings };
  if (job.status === 'failed') return { status: 'failed', error: job.error, ...timing, ...warnings };
  return { status: 'generating', ...timing, ...warnings };
}

function waitForJobResult(jobId, timeoutMs = 3000) {
  const job = _jobs.get(jobId);
  if (!job) return Promise.resolve({ status: 'not_found' });
  if (job.status !== 'generating') return Promise.resolve(getJobStatus(jobId));
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(getJobStatus(jobId)), timeoutMs);
    job.waiters.push(() => {
      clearTimeout(timer);
      resolve(getJobStatus(jobId));
    });
  });
}

module.exports = {
  startJob,
  getJobStatus,
  generateJobId,
  waitForJobResult,
  normalizeImageSize,
  _test: {
    buildCodexRequest,
    isImageToolChoiceUnsupported,
    findImageConnectionId,
    codexRootFromBaseUrl,
    readCustom9RouterImageProvider,
    probeIs9RouterImageProvider,
    callCodexEndpoint,
    _expireJobIfStale,
    _jobTiming,
    JOB_TIMEOUT_MS,
  }
};
