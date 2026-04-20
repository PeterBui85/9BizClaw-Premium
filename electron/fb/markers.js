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
  if (meta.channel !== 'telegram') return false;  // channel check is real defense
  // NOTE: at outbound sendTelegram call sites, meta.chatId == expectedCeoChatId is tautological.
  // The actual defense against customer-sourced markers is ensureZaloFbNeutralizeFix (input-side rewrite).
  // This check remains to catch misconfiguration (e.g., interceptor wired into sendZalo by mistake).
  return true;
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

// =========================================================================
// Skill marker protocol (Task 28/29): [[SKILL_LIST]],
// [[SKILL_ACTIVATE: {"name":"..."}]], [[SKILL_DEACTIVATE]]
//
// Bot emits a marker on /skill commands; main.js replaces the marker in the
// outgoing Telegram text with the actual result (list / confirmation). This
// keeps skill management deterministic — LLM never touches the filesystem.
// =========================================================================

const SKILL_LIST_RE = /\[\[SKILL_LIST\]\]/g;
const SKILL_ACTIVATE_RE = /\[\[SKILL_ACTIVATE:\s*(\{[^}]*\})\]\]/g;
const SKILL_DEACTIVATE_RE = /\[\[SKILL_DEACTIVATE\]\]/g;

async function interceptSkillMarkers(replyText, { handlers }) {
  if (!replyText) return replyText;
  let result = replyText;

  // SKILL_LIST
  if (new RegExp(SKILL_LIST_RE.source, 'g').test(result)) {
    try {
      const listText = await handlers.list();
      result = result.replace(new RegExp(SKILL_LIST_RE.source, 'g'), listText);
    } catch (e) {
      result = result.replace(new RegExp(SKILL_LIST_RE.source, 'g'), `Lỗi list skill: ${e.message}`);
    }
  }

  // SKILL_ACTIVATE
  const activateRe = new RegExp(SKILL_ACTIVATE_RE.source, 'g');
  let m;
  while ((m = activateRe.exec(result)) !== null) {
    try {
      const args = JSON.parse(m[1]);
      const text = await handlers.activate(args.name);
      result = result.replace(m[0], text);
      activateRe.lastIndex = 0;  // reset because result changed
    } catch (e) {
      result = result.replace(m[0], `Lỗi activate: ${e.message}`);
      activateRe.lastIndex = 0;
    }
  }

  // SKILL_DEACTIVATE
  if (new RegExp(SKILL_DEACTIVATE_RE.source, 'g').test(result)) {
    try {
      const text = await handlers.deactivate();
      result = result.replace(new RegExp(SKILL_DEACTIVATE_RE.source, 'g'), text);
    } catch (e) {
      result = result.replace(new RegExp(SKILL_DEACTIVATE_RE.source, 'g'), `Lỗi deactivate: ${e.message}`);
    }
  }

  return result;
}

module.exports = { interceptFbMarkers, interceptSkillMarkers, extractFbMarkers, validateSource };
