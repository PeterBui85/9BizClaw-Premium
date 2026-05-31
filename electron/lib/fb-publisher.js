// Facebook Graph API - page posting and insights

const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const GRAPH_API = 'graph.facebook.com';
const API_VERSION = 'v25.0';
const RESPONSE_TIMEOUT_MS = 30000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const MIN_POST_INTERVAL_MS = 10 * 60 * 1000;
const JITTER_MAX_MS = 2 * 60 * 1000;
const DEFAULT_INSIGHTS_DAYS = 7;
const INSIGHTS_METRICS = [
  'page_media_view',
  'page_post_engagements',
  'page_follows',
];
const SNAPSHOT_METRICS = new Set(['page_follows']);
const TIMESTAMP_FILE = path.join(process.platform === 'win32'
  ? path.join(process.env.APPDATA || os.homedir(), '9bizclaw')
  : path.join(os.homedir(), '.9bizclaw'), 'fb-last-post.json');
let _lastPostAt = _loadLastPostAt();

let _postQueue = Promise.resolve();
const POST_QUEUE_TIMEOUT_MS = 15 * 60 * 1000;

function _withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('post queue timeout')), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

function _loadLastPostAt() {
  try {
    const data = JSON.parse(fs.readFileSync(TIMESTAMP_FILE, 'utf-8'));
    return typeof data.t === 'number' ? data.t : 0;
  } catch { return 0; }
}

function _saveLastPostAt(ts) {
  try {
    const dir = path.dirname(TIMESTAMP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TIMESTAMP_FILE, JSON.stringify({ t: ts }));
  } catch {}
}

async function graphRequest(method, endpoint, token, body) {
  try {
    return await _graphRequestOnce(method, endpoint, token, body);
  } catch (e) {
    // Auto-retry 5xx ONLY for idempotent GET. Retrying a POST (feed/photo) on a
    // 5xx is unsafe: Facebook may have ACCEPTED the write before returning 5xx →
    // the retry double-posts. POST callers handle their own verify-then-retry.
    if (method === 'GET' && e._httpStatus && e._httpStatus >= 500 && e._httpStatus < 600) {
      console.warn('[fb-publisher] Graph API 5xx (GET) - retrying in 3s:', e.message);
      await new Promise(r => setTimeout(r, 3000));
      return await _graphRequestOnce(method, endpoint, token, body);
    }
    throw e;
  }
}

function _graphRequestOnce(method, endpoint, token, body) {
  return new Promise((resolve, reject) => {
    const url = `/${API_VERSION}${endpoint}`;
    const isPost = method === 'POST';
    const payload = isPost && body ? JSON.stringify(body) : null;
    const headers = { 'Authorization': `Bearer ${token}`, 'User-Agent': USER_AGENT };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({ hostname: GRAPH_API, path: url, method, headers }, res => {
      let d = '';
      const bodyTimer = setTimeout(() => { req.destroy(); reject(new Error('response body timeout')); }, RESPONSE_TIMEOUT_MS);
      res.on('data', c => d += c);
      res.on('end', () => {
        clearTimeout(bodyTimer);
        try {
          const parsed = JSON.parse(d);
          if (parsed.error) {
            const err = new Error(parsed.error.message || 'Graph API error');
            err._httpStatus = res.statusCode;
            if (res.statusCode === 401 || parsed.error.code === 190 || /expired|invalid.*token/i.test(parsed.error.message || '')) {
              err._isTokenExpired = true;
            }
            return reject(err);
          }
          if (res.statusCode >= 400) {
            const err = new Error(`Graph API HTTP ${res.statusCode}`);
            err._httpStatus = res.statusCode;
            return reject(err);
          }
          resolve(parsed);
        } catch { reject(new Error('Invalid JSON from Graph API')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('connect timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function detectMime(imagePath) {
  const ext = path.extname(imagePath || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function graphMultipartPhoto(pageId, token, message, imageBuffer, imagePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----FBBoundary' + crypto.randomBytes(16).toString('hex');
    const safeMessage = String(message).replace(/\r/g, '');
    let body = '';
    body += `--${boundary}\r\nContent-Disposition: form-data; name="message"\r\n\r\n${safeMessage}\r\n`;
    const mime = detectMime(imagePath);
    const ext = mime.split('/')[1] || 'png';
    body += `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="image.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`;
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
        'User-Agent': USER_AGENT,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
      },
    }, res => {
      let d = '';
      const bodyTimer = setTimeout(() => { req.destroy(); reject(new Error('response body timeout')); }, RESPONSE_TIMEOUT_MS);
      res.on('data', c => d += c);
      res.on('end', () => {
        clearTimeout(bodyTimer);
        try {
          const parsed = JSON.parse(d);
          if (parsed.error) {
            const err = new Error(parsed.error.message || 'Graph API photo upload error');
            err._httpStatus = res.statusCode;
            if (res.statusCode === 401 || parsed.error.code === 190 || /expired|invalid.*token/i.test(parsed.error.message || '')) {
              err._isTokenExpired = true;
            }
            return reject(err);
          }
          resolve(parsed);
        } catch { reject(new Error('Invalid response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('connect timeout')); });
    req.write(payload);
    req.end();
  });
}

function formatPostUrl(compoundId) {
  if (!compoundId) return null;
  const parts = String(compoundId).split('_');
  if (parts.length === 2) return `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
  return `https://www.facebook.com/${compoundId}`;
}

function hasPageCreateContentTask(tasks) {
  if (!Array.isArray(tasks)) return true;
  return tasks.includes('CREATE_CONTENT') || tasks.includes('PROFILE_PLUS_CREATE_CONTENT');
}

function normalizePermissionName(permission) {
  if (!permission) return null;
  if (typeof permission === 'string') return permission;
  if (typeof permission !== 'object') return null;
  if (permission.status && permission.status !== 'granted') return null;
  return permission.permission || permission.name || null;
}

function hasNamedPermission(permissions, name) {
  if (!Array.isArray(permissions)) return false;
  return permissions.some(p => normalizePermissionName(p) === name);
}

function hasPageInsightsPermission(permissions) {
  return hasNamedPermission(permissions, 'read_insights') ||
    hasNamedPermission(permissions, 'pages_read_engagement');
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function unixSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function metricValueToNumber(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, child) => {
      return typeof child === 'number' ? sum + child : sum;
    }, 0);
  }
  return 0;
}

function summarizeMetric(metricName, values, currentStartMs) {
  const daily = [];
  const previousDaily = [];
  for (const row of Array.isArray(values) ? values : []) {
    const n = metricValueToNumber(row && row.value);
    const endMs = Date.parse(row && row.end_time);
    if (Number.isFinite(endMs) && endMs > currentStartMs) daily.push(n);
    else previousDaily.push(n);
  }
  if (SNAPSHOT_METRICS.has(metricName)) {
    const latestCurrent = daily.length ? daily[daily.length - 1] : 0;
    const latestPrevious = previousDaily.length ? previousDaily[previousDaily.length - 1] : 0;
    return { current: latestCurrent, previous: latestPrevious, daily };
  }
  return {
    current: daily.reduce((sum, n) => sum + n, 0),
    previous: previousDaily.reduce((sum, n) => sum + n, 0),
    daily,
  };
}

function normalizeInsights(data, currentStartMs) {
  const out = {};
  for (const item of (data && data.data) || []) {
    if (!item || !item.name) continue;
    out[item.name] = summarizeMetric(item.name, item.values, currentStartMs);
  }
  return out;
}

async function fetchInsightMetric(pageId, token, metric, previousStart, until, currentStart) {
  const endpoint = `/${pageId}/insights?metric=${encodeURIComponent(metric)}` +
    `&period=day&since=${unixSeconds(previousStart)}&until=${unixSeconds(until)}`;
  const insights = await graphRequest('GET', endpoint, token);
  return normalizeInsights(insights, currentStart.getTime());
}

function addCompatibilityMetricAliases(metrics) {
  const out = { ...metrics };
  if (metrics.page_media_view) {
    out.page_views_total = metrics.page_media_view;
  }
  if (metrics.page_follows) {
    out.page_followers = metrics.page_follows;
  }
  return out;
}

function normalizePost(post) {
  if (!post || typeof post !== 'object') return null;
  return {
    id: post.id,
    message: post.message || '',
    created_time: post.created_time || null,
    full_picture: post.full_picture || null,
    likes: post.likes?.summary?.total_count || 0,
    comments: post.comments?.summary?.total_count || 0,
    shares: post.shares?.count || 0,
    url: post.permalink_url || formatPostUrl(post.id),
  };
}

async function getPagePermissions(pageId, token) {
  try {
    const data = await graphRequest('GET', `/${pageId}/permissions`, token);
    return data.data || [];
  } catch (e) {
    if (e._isTokenExpired) throw e;
    return [];
  }
}

async function getPageInfo(pageId, token, fallbackName) {
  try {
    const data = await graphRequest('GET', `/${pageId}?fields=id,name`, token);
    return { pageId: data.id || pageId, pageName: data.name || fallbackName || null };
  } catch (e) {
    if (e._isTokenExpired) throw e;
    return { pageId, pageName: fallbackName || null };
  }
}

async function verifyToken(token) {
  if (!token || !String(token).trim()) {
    return { valid: false, error: 'Token Facebook trống.' };
  }
  const requiredMsg = 'Token cần là Page Access Token hoặc User Token có pages_show_list, pages_manage_posts, pages_read_engagement và Page task CREATE_CONTENT.';
  try {
    const data = await graphRequest('GET', '/me/accounts?fields=id,name,access_token,tasks&limit=25', token);
    if (data.data && data.data.length > 0) {
      const page = data.data.find(p => p && p.access_token && hasPageCreateContentTask(p.tasks));
      if (!page) {
        return { valid: false, error: 'Không tìm thấy Fanpage có quyền tạo nội dung. ' + requiredMsg };
      }
      return { valid: true, pageId: page.id, pageName: page.name, pageToken: page.access_token };
    }
    return { valid: false, error: 'Không tìm thấy Fanpage nào. ' + requiredMsg };
  } catch (accountsErr) {
    try {
      const page = await graphRequest('GET', '/me?fields=id,name,category', token);
      if (page.id && page.category !== undefined) {
        return { valid: true, pageId: page.id, pageName: page.name, pageToken: token };
      }
      return { valid: false, error: requiredMsg };
    } catch (pageErr) {
      return { valid: false, error: accountsErr.message || pageErr.message || requiredMsg };
    }
  }
}

async function enforcePostInterval() {
  const onDisk = _loadLastPostAt();
  if (onDisk > _lastPostAt) _lastPostAt = onDisk;
  const elapsed = Date.now() - _lastPostAt;
  const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
  const required = MIN_POST_INTERVAL_MS + jitter;
  if (_lastPostAt > 0 && elapsed < required) {
    const waitMs = required - elapsed;
    console.log(`[fb-publisher] rate limit: waiting ${Math.round(waitMs / 1000)}s before next post (jitter +${Math.round(jitter / 1000)}s)`);
    await new Promise(r => setTimeout(r, waitMs));
  }
}

function postText(pageId, token, message) {
  const job = _postQueue.then(() => _withTimeout((async () => {
    await enforcePostInterval();
    const data = await graphRequest('POST', `/${pageId}/feed`, token, { message });
    _lastPostAt = Date.now();
    _saveLastPostAt(_lastPostAt);
    return { postId: data.id, postUrl: formatPostUrl(data.id) };
  })(), POST_QUEUE_TIMEOUT_MS));
  _postQueue = job.catch(e => console.error('[fb-publisher] queue error:', e?.message));
  return job;
}

function postPhoto(pageId, token, message, imageBuffer, imagePath) {
  const job = _postQueue.then(() => _withTimeout((async () => {
    await enforcePostInterval();
    const data = await graphMultipartPhoto(pageId, token, message, imageBuffer, imagePath);
    _lastPostAt = Date.now();
    _saveLastPostAt(_lastPostAt);
    const postId = data.post_id || data.id;
    return { postId, postUrl: formatPostUrl(postId) };
  })(), POST_QUEUE_TIMEOUT_MS));
  _postQueue = job.catch(e => console.error('[fb-publisher] queue error:', e?.message));
  return job;
}

async function getRecentPosts(pageId, token, limit = 5) {
  const safeLimit = clampInt(limit, 5, 1, 25);
  const fields = [
    'id',
    'message',
    'created_time',
    'full_picture',
    'permalink_url',
    'likes.summary(true)',
    'comments.summary(true)',
    'shares',
  ].join(',');
  const data = await graphRequest('GET',
    `/${pageId}/feed?fields=${encodeURIComponent(fields)}&limit=${safeLimit}`, token);
  return data.data || [];
}

// After an INDETERMINATE post error (timeout/5xx where FB may have accepted the
// write), check whether a post with this caption already landed — so we recover
// the real post instead of blindly retrying and double-posting.
async function findRecentPostByCaption(pageId, token, caption, withinMs = 10 * 60 * 1000) {
  try {
    const capKey = String(caption || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (capKey.length < 8) return null; // too short to match reliably
    const posts = await getRecentPosts(pageId, token, 5);
    const now = Date.now();
    for (const p of posts) {
      const msg = String(p.message || '').replace(/\s+/g, ' ').trim();
      const t = Date.parse(p.created_time || '');
      const recent = !withinMs || (Number.isFinite(t) && (now - t) < withinMs);
      if (recent && msg && msg.slice(0, 40) === capKey) {
        return { postId: p.id, postUrl: p.permalink_url || formatPostUrl(p.id) };
      }
    }
  } catch (e) {
    // getRecentPosts threw — we could NOT determine whether the post landed.
    // Return a distinct sentinel so the caller does NOT treat this as "not found"
    // and blind-retry (which would double-post if FB had actually accepted it).
    console.warn('[fb-publisher] findRecentPostByCaption verify failed:', e?.message);
    return { verifyFailed: true };
  }
  return null;
}

async function getInsights(pageId, token, opts = {}) {
  if (!pageId) return { valid: false, tokenValid: false, error: 'pageId required' };
  if (!token || !String(token).trim()) {
    return { valid: false, tokenValid: false, error: 'Facebook token missing' };
  }

  const days = clampInt(opts.days, DEFAULT_INSIGHTS_DAYS, 1, 90);
  const recentLimit = clampInt(opts.limit, 5, 1, 10);
  const until = opts.until instanceof Date ? opts.until : new Date();
  const currentStart = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

  const pageInfo = await getPageInfo(pageId, token, opts.pageName);
  const permissions = await getPagePermissions(pageId, token);
  const permissionSummary = {
    read_insights: hasNamedPermission(permissions, 'read_insights'),
    pages_read_engagement: hasNamedPermission(permissions, 'pages_read_engagement'),
  };

  let metrics = {};
  let insightsError = null;
  const metricErrors = {};
  for (const metric of INSIGHTS_METRICS) {
    try {
      Object.assign(metrics, await fetchInsightMetric(pageId, token, metric, previousStart, until, currentStart));
    } catch (e) {
      if (e._isTokenExpired) throw e;
      metricErrors[metric] = e.message || 'Facebook insights unavailable';
    }
  }
  metrics = addCompatibilityMetricAliases(metrics);
  if (Object.keys(metricErrors).length === INSIGHTS_METRICS.length) {
    insightsError = Object.values(metricErrors)[0] || 'Facebook insights unavailable';
  }

  let recentPosts = [];
  try {
    recentPosts = (await getRecentPosts(pageId, token, recentLimit)).map(normalizePost).filter(Boolean);
  } catch (e) {
    if (e._isTokenExpired) throw e;
  }

  const metricValues = Object.values(metrics);
  const hasMetricRows = metricValues.some(metric => metric && metric.daily && metric.daily.length > 0);
  const hasMetricData = metricValues.some(metric => {
    return metric && (metric.current !== 0 || metric.previous !== 0 || (metric.daily && metric.daily.length > 0));
  });

  return {
    valid: true,
    tokenValid: true,
    tokenName: pageInfo.pageName,
    pageName: pageInfo.pageName,
    pageId: pageInfo.pageId,
    since: isoDate(currentStart),
    until: isoDate(until),
    days,
    hasInsights: hasMetricData,
    hasInsightsPermission: hasPageInsightsPermission(permissions) || hasMetricRows,
    permissions: permissionSummary,
    metrics,
    metricErrors,
    recentPosts,
    insightsError,
  };
}

module.exports = {
  verifyToken,
  postText,
  postPhoto,
  getRecentPosts,
  findRecentPostByCaption,
  getInsights,
  _test: { hasPageCreateContentTask, hasPageInsightsPermission, insightsMetrics: INSIGHTS_METRICS },
};
