// electron/fb/markers.js
// Spec: docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md
// Responsibility: [[FB_*]] marker extraction + source-channel validation

'use strict';

const fs = require('fs');
const path = require('path');

// Regex captures action + JSON payload. Payload limited to flat object ({...} with no nested braces).
const MARKER_RE = /\[\[FB_(PUBLISH|SKIP|UNDO):\s*(\{[^}]*\})\]\]/g;

function extractFbMarkers(text) {
  const out = [];
  if (!text) return out;
  let m;
  const re = new RegExp(MARKER_RE.source, 'g');  // fresh regex, don't share state
  while ((m = re.exec(text))) {
    let payload = null;
    try { payload = JSON.parse(m[2]); } catch { /* malformed — skip */ }
    out.push({ full: m[0], action: m[1], payload, index: m.index });
  }
  return out;
}

function validateSource(meta, expectedCeoChatId) {
  if (!meta || !expectedCeoChatId) return false;
  if (meta.channel !== 'telegram') return false;
  const match = String(meta.chatId) === String(expectedCeoChatId)
             || String(meta.senderUserId) === String(expectedCeoChatId);
  return match;
}

function _auditDeny(marker, meta, reason, workspace) {
  try {
    const logDir = path.join(workspace, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'fb-marker-denied.jsonl'),
      JSON.stringify({ t: new Date().toISOString(), marker, meta, reason }) + '\n');
  } catch {}
}

/**
 * Replace FB markers in replyText with confirmation text (or strip if denied).
 * handlers: { publish({id}) -> {ok, text?, postId?, error?}, skip({id}) -> {ok, text?}, undo({postId}) -> {ok, text?} }
 * Each handler returns { ok: bool, text: string } — text is what replaces the marker in the reply.
 */
async function interceptFbMarkers(replyText, meta, { ceoChatId, workspace, handlers }) {
  const markers = extractFbMarkers(replyText);
  if (markers.length === 0) return replyText;

  let result = replyText;
  for (const mk of markers) {
    if (!validateSource(meta, ceoChatId)) {
      _auditDeny(mk.full, meta, 'wrong-channel-or-chat', workspace);
      result = result.replace(mk.full, '');
      continue;
    }
    if (!mk.payload) {
      _auditDeny(mk.full, meta, 'parse-error', workspace);
      result = result.replace(mk.full, '(Marker payload không hợp lệ)');
      continue;
    }
    try {
      let handlerResult;
      if (mk.action === 'PUBLISH') handlerResult = await handlers.publish(mk.payload);
      else if (mk.action === 'SKIP') handlerResult = await handlers.skip(mk.payload);
      else if (mk.action === 'UNDO') handlerResult = await handlers.undo(mk.payload);
      const text = handlerResult?.text || (handlerResult?.ok ? 'Xong.' : `Lỗi: ${handlerResult?.error || 'unknown'}`);
      result = result.replace(mk.full, text);
    } catch (e) {
      result = result.replace(mk.full, `Lỗi: ${e.message}`);
    }
  }
  return result;
}

module.exports = { interceptFbMarkers, extractFbMarkers, validateSource };
