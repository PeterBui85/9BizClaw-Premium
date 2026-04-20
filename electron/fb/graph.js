// electron/fb/graph.js
// Spec: docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md
// Responsibility: Graph v21.0 helpers: postToFeed, uploadPhoto, fetchInsights, fetchRecentPosts, debugToken

'use strict';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function _buildGraphError(res, json, fallbackMsg) {
  const err = new Error(json?.error?.message || fallbackMsg || `Graph API ${res.status}`);
  err.status = res.status;
  err.code = json?.error?.code;
  err.subcode = json?.error?.error_subcode;
  err.fbtrace = json?.error?.fbtrace_id;
  err.raw = json;
  return err;
}

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
    throw _buildGraphError(res, json);
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
    const fs = require('fs');
    const form = new FormData();
    form.append('source', new Blob([fs.readFileSync(filePath)]));
    form.append('published', 'false');
    const url = `${GRAPH_BASE}/${encodeURIComponent(pageId)}/photos?access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url, { method: 'POST', body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw _buildGraphError(res, json, `Graph photo upload ${res.status}`);
    }
    return json;
  }
  throw new Error('uploadPhoto requires imageUrl or filePath');
}

async function fetchInsights(postId, pageToken, metrics) {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new Error('fetchInsights: metrics must be a non-empty array');
  }
  return _graphRequest('GET', `/${encodeURIComponent(postId)}/insights`, {
    metric: metrics.join(','),
  }, pageToken);
}

async function fetchRecentPosts(pageId, pageToken, sinceIso) {
  const sinceTs = Math.floor(new Date(sinceIso).getTime() / 1000);
  if (isNaN(sinceTs)) throw new Error('fetchRecentPosts: invalid sinceIso');
  return _graphRequest('GET', `/${encodeURIComponent(pageId)}/posts`, {
    since: sinceTs,
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
