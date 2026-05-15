// Facebook Graph API — page posting (publish-only)

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
const TIMESTAMP_FILE = path.join(process.platform === 'win32'
  ? path.join(process.env.APPDATA || os.homedir(), '9bizclaw')
  : path.join(os.homedir(), '.9bizclaw'), 'fb-last-post.json');
let _lastPostAt = _loadLastPostAt();
let _postQueue = Promise.resolve();
const POST_QUEUE_TIMEOUT_MS = 90000;

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

function graphRequest(method, endpoint, token, body) {
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
        'Content-Length': payload.length
      }
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
  // Re-read from disk before comparing so a sibling Electron instance (dev
  // setup or a second window) that posted recently is observed. Without this,
  // `_lastPostAt` would be the module-load snapshot — second instance starts
  // with 0, posts immediately, defeats the anti-shadow-ban rate limiter.
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
  _postQueue = job.catch(() => {});
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
  _postQueue = job.catch(() => {});
  return job;
}

async function getRecentPosts(pageId, token, limit = 5) {
  const data = await graphRequest('GET',
    `/${pageId}/feed?fields=message,created_time,full_picture&limit=${limit}`, token);
  return data.data || [];
}

module.exports = { verifyToken, postText, postPhoto, getRecentPosts, _test: { hasPageCreateContentTask } };
