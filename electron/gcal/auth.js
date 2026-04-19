/**
 * Google Calendar OAuth2 — raw HTTPS, no googleapis package.
 *
 * Token storage: ~/.openclaw/gcal-tokens.json
 * Encrypted via electron.safeStorage when available, plaintext fallback.
 *
 * Exports: getAuthUrl, exchangeCode, getAccessToken, isConnected, disconnect,
 *          startCallbackServer, stopCallbackServer
 */

'use strict';

// Errors thrown with .code set to one of these constants allow IPC handlers
// to surface specific Vietnamese error messages without brittle string parse.
const HTTP_CODE_QUOTA = 'QUOTA';
const HTTP_CODE_UNAUTHORIZED = 'UNAUTHORIZED'; // refresh expired/revoked
const HTTP_CODE_NOT_FOUND = 'NOT_FOUND';
const HTTP_CODE_ETAG_MISMATCH = 412;

function _classifyHttpError(statusCode, bodyJson) {
  if (statusCode === 429) return HTTP_CODE_QUOTA;
  if (statusCode === 403) {
    const reason = bodyJson?.error?.errors?.[0]?.reason || bodyJson?.error?.status;
    if (reason === 'userRateLimitExceeded' || reason === 'rateLimitExceeded' || reason === 'quotaExceeded' || reason === 'RESOURCE_EXHAUSTED') {
      return HTTP_CODE_QUOTA;
    }
  }
  if (statusCode === 401) return HTTP_CODE_UNAUTHORIZED;
  if (statusCode === 404) return HTTP_CODE_NOT_FOUND;
  if (statusCode === 412) return HTTP_CODE_ETAG_MISMATCH;
  return null;
}

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ---------------------------------------------------------------------------
// Google OAuth2 credentials
// REDIRECT_URI + SCOPES are constant; CLIENT_ID + SECRET come from
// credentials.js at call time so CEO-supplied values take effect without
// restart after the setup wizard saves them.
// ---------------------------------------------------------------------------
const credentials = require('./credentials');

const REDIRECT_URI = 'http://127.0.0.1:20199/gcal/callback';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';

function getCreds() {
  const c = credentials.load();
  if (!c) throw new Error('NO_CREDENTIALS — CEO chưa setup OAuth qua Dashboard wizard');
  return c;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve token file path — same level as openclaw.json */
function tokenPath() {
  // Reuse getWorkspace from main.js via a simple heuristic:
  // ~/.openclaw/gcal-tokens.json (matches other gcal-config, sticky-chatid, etc.)
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const openclawDir = path.join(home, '.openclaw');
  try { fs.mkdirSync(openclawDir, { recursive: true }); } catch {}
  return path.join(openclawDir, 'gcal-tokens.json');
}

/** Try encrypt with safeStorage (Electron), fallback plaintext JSON */
function saveTokens(tokens) {
  const filePath = tokenPath();
  try {
    const { safeStorage } = require('electron');
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(JSON.stringify(tokens));
      fs.writeFileSync(filePath, encrypted);
      return;
    }
  } catch {}
  // Fallback: plaintext JSON
  fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2));
}

/** Load tokens — try decrypt, fallback parse JSON */
function loadTokens() {
  const filePath = tokenPath();
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath);
  // Try safeStorage decrypt first
  try {
    const { safeStorage } = require('electron');
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(raw);
      return JSON.parse(decrypted);
    }
  } catch {}
  // Fallback: try parsing as plaintext JSON
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OAuth2 URL
// ---------------------------------------------------------------------------

function getAuthUrl() {
  const { clientId } = getCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange / refresh via raw HTTPS
// ---------------------------------------------------------------------------

function httpsPost(hostname, pathStr, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const req = https.request({
      hostname,
      path: pathStr,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error('Invalid JSON from Google: ' + Buffer.concat(chunks).toString().slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Token request timeout')); });
    req.write(data);
    req.end();
  });
}

async function exchangeCode(code) {
  const { clientId, clientSecret } = getCreds();
  const resp = await httpsPost('oauth2.googleapis.com', '/token', {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  if (resp.error) throw new Error(resp.error_description || resp.error);
  const tokens = {
    access_token: resp.access_token,
    refresh_token: resp.refresh_token,
    expiresAt: Date.now() + (resp.expires_in || 3600) * 1000 - 60000, // 1 min buffer
    email: null,
  };
  // Fetch user email for display
  try {
    const info = await httpsGet('www.googleapis.com', '/oauth2/v2/userinfo', resp.access_token);
    tokens.email = info.email || null;
  } catch {}
  saveTokens(tokens);
  return tokens;
}

async function refreshAccessToken() {
  const { clientId, clientSecret } = getCreds();
  const tokens = loadTokens();
  if (!tokens || !tokens.refresh_token) throw new Error('No refresh token available');
  const resp = await httpsPost('oauth2.googleapis.com', '/token', {
    refresh_token: tokens.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  if (resp.error) throw new Error(resp.error_description || resp.error);
  tokens.access_token = resp.access_token;
  tokens.expiresAt = Date.now() + (resp.expires_in || 3600) * 1000 - 60000;
  saveTokens(tokens);
  return tokens.access_token;
}

/** Get a valid access token, refreshing if expired */
async function getAccessToken() {
  const tokens = loadTokens();
  if (!tokens) throw new Error('Google Calendar not connected');
  if (Date.now() < tokens.expiresAt) return tokens.access_token;
  return await refreshAccessToken();
}

function isConnected() {
  const tokens = loadTokens();
  return !!(tokens && tokens.refresh_token);
}

// Returns OAuth'd Google email from stored userinfo, or null.
function getEmail() {
  try {
    const tokens = loadTokens();
    return tokens?.email || null;
  } catch { return null; }
}

function disconnect() {
  const filePath = tokenPath();
  try { fs.unlinkSync(filePath); } catch {}
}

async function revokeToken() {
  const tokens = loadTokens();
  if (!tokens || !tokens.refresh_token) return { ok: true, skipped: true };
  const https = require('node:https');
  const body = `token=${encodeURIComponent(tokens.refresh_token)}`;
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/revoke',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      res.on('data', () => {}); // drain
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// HTTPS GET helper (used by calendar.js too)
// ---------------------------------------------------------------------------

function httpsGet(hostname, pathStr, accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path: pathStr,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            const code = _classifyHttpError(res.statusCode, parsed);
            const err = new Error(`HTTP ${res.statusCode}: ${parsed.error?.message || raw.slice(0, 200)}`);
            if (code !== null) err.code = code;
            return reject(err);
          } catch {
            return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error('Invalid JSON from Google'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function httpsPostJson(hostname, pathStr, body, accessToken) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname,
      path: pathStr,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            const code = _classifyHttpError(res.statusCode, parsed);
            const err = new Error(`HTTP ${res.statusCode}: ${parsed.error?.message || raw.slice(0, 200)}`);
            if (code !== null) err.code = code;
            return reject(err);
          } catch {
            return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error('Invalid JSON from Google'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Temporary callback server for OAuth redirect
// ---------------------------------------------------------------------------

let _callbackServer = null;

/**
 * Start a temp HTTP server on port 20199 that waits for the OAuth callback.
 * Returns a promise that resolves with the tokens once the code is exchanged.
 */
function startCallbackServer() {
  return new Promise((resolve, reject) => {
    if (_callbackServer) {
      try { _callbackServer.close(); } catch {}
      _callbackServer = null;
    }

    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname === '/gcal/callback') {
        const code = parsed.query.code;
        const error = parsed.query.error;

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Ket noi that bai</h2><p>' + error + '</p><p>Ban co the dong tab nay.</p></body></html>');
          stopCallbackServer();
          reject(new Error(error));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Loi</h2><p>Khong nhan duoc ma xac thuc.</p></body></html>');
          return;
        }

        try {
          const tokens = await exchangeCode(code);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Ket noi thanh cong!</h2><p>Google Calendar da duoc ket noi voi 9BizClaw.</p><p>Ban co the dong tab nay.</p></body></html>');
          stopCallbackServer();
          resolve(tokens);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Loi</h2><p>' + (e.message || 'Unknown error') + '</p></body></html>');
          stopCallbackServer();
          reject(e);
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(20199, '127.0.0.1', () => {
      _callbackServer = server;
      console.log('[gcal] OAuth callback server listening on http://127.0.0.1:20199');
    });

    server.on('error', (err) => {
      console.error('[gcal] Callback server error:', err.message);
      reject(err);
    });

    // Auto-close after 5 minutes if no callback received
    setTimeout(() => {
      if (_callbackServer === server) {
        stopCallbackServer();
        reject(new Error('OAuth timeout — no callback received within 5 minutes'));
      }
    }, 5 * 60 * 1000);
  });
}

function stopCallbackServer() {
  if (_callbackServer) {
    try { _callbackServer.close(); } catch {}
    _callbackServer = null;
  }
}

async function httpsDelete(host, pathStr, token) {
  const https = require('node:https');
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host, path: pathStr, method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 204 || res.statusCode === 200) return resolve({ deleted: true });
        if (res.statusCode >= 400) {
          try {
            const parsed = data ? JSON.parse(data) : {};
            const code = _classifyHttpError(res.statusCode, parsed);
            const err = new Error(`HTTP ${res.statusCode}: ${parsed.error?.message || data.slice(0, 200)}`);
            if (code !== null) err.code = code;
            return reject(err);
          } catch {
            return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        }
        reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function httpsPatch(host, pathStr, body, token, etag) {
  const https = require('node:https');
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host, path: pathStr, method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(etag ? { 'If-Match': etag } : {}),
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // Preserve ETAG_MISMATCH message for callers that parse it.
        if (res.statusCode === 412) return reject(Object.assign(new Error('ETAG_MISMATCH'), { code: 412 }));
        if (res.statusCode >= 400) {
          try {
            const parsed = data ? JSON.parse(data) : {};
            const code = _classifyHttpError(res.statusCode, parsed);
            const err = new Error(`HTTP ${res.statusCode}: ${parsed.error?.message || data.slice(0, 200)}`);
            if (code !== null) err.code = code;
            return reject(err);
          } catch {
            return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        }
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload); req.end();
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getAuthUrl,
  exchangeCode,
  getAccessToken,
  isConnected,
  getEmail,
  disconnect,
  revokeToken,
  startCallbackServer,
  stopCallbackServer,
  // Expose for calendar.js
  httpsGet,
  httpsPostJson,
  httpsPatch,
  httpsDelete,
  // Error classification sentinels
  HTTP_CODE_QUOTA,
  HTTP_CODE_UNAUTHORIZED,
  HTTP_CODE_NOT_FOUND,
  HTTP_CODE_ETAG_MISMATCH,
};
