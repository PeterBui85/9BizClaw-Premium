// electron/fb/auth.js
// Spec: docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md
// Responsibility: OAuth flow + safeStorage token wrap + port fallback 18791..18795

'use strict';

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

async function startCallbackServer({ appId, appSecret, onResult } = {}) {
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
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
  fs.writeFileSync(tokenPath, safeStorage.encryptString(pageToken));
  fs.writeFileSync(secretPath, safeStorage.encryptString(appSecret));
  return cfg;
}

function _readConfig() {
  const p = path.join(getFbDir(), 'config.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; }
}

async function storePageToken(pageId, pageName, pageToken, appSecret, safeStorage) {
  return completeOAuth({
    appId: _readConfig().appId, appSecret,
    pageId, pageName, pageToken, safeStorage,
  });
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
