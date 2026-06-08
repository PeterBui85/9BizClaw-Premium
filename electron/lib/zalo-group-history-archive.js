'use strict';
// Append-only raw ground-truth archive of Zalo GROUP messages, account-namespaced.
//
// Sibling of zalo-history-archive.js (DMs). WHY a separate store, same rationale:
// openzca's messages.sqlite is per-profile, mutable, and reset on account
// re-login. This is our OWN durable mirror under <userData>/zalo-group-history,
// keyed by owner account, surviving account switches.
//
// Layout: <userData>/zalo-group-history/<ownerAccountId>/<groupId>.jsonl
//   - ownerAccountId = self_profiles.user_id at capture time.
//   - groupId = scope_thread_id of a thread_type='group' thread.
//   - one raw message per line, append-only, dedup by msgId.
//
// DRY: leaf helpers (_toLine, _isSafeId, _existingMsgIds, ID_RE) are imported from
// the DM module — the line shape and dedup are identical; only the root folder and
// the read default (100, not 200) differ. We do NOT touch the DM module's control
// flow (it is live + sacred).

const fs = require('fs');
const path = require('path');
const dm = require('./zalo-history-archive');
const { _isSafeId, _toLine, _existingMsgIds } = dm;

// Read default: 100 (a group transcript summary needs less than a 1:1 DM thread).
const DEFAULT_GROUP_LIMIT = 100;

// Resolve <ws>/zalo-group-history. wsOverride lets tests pass a temp dir.
function groupArchiveRoot(ws) {
  const base = ws || (function () {
    try { return require('./workspace').getWorkspace(); } catch { return null; }
  })();
  if (!base) return null;
  return path.join(base, 'zalo-group-history');
}

// <ws>/zalo-group-history/<account>/<groupId>.jsonl, or null if unsafe / no ws.
function _groupFileFor(ws, account, groupId) {
  if (!_isSafeId(account) || !_isSafeId(groupId)) return null;
  const root = groupArchiveRoot(ws);
  if (!root) return null;
  return path.join(root, account, groupId + '.jsonl');
}

// Append new group messages (deduped by msgId). Append-only; never throws.
function appendGroupMessages(ws, ownerAccountId, groupId, rows) {
  try {
    if (!Array.isArray(rows) || rows.length === 0) return;
    const file = _groupFileFor(ws, ownerAccountId, groupId);
    if (!file) return; // unsafe id / no ws — skip silently (path-safety)

    fs.mkdirSync(path.dirname(file), { recursive: true });

    const seen = _existingMsgIds(file);
    const out = [];
    for (const row of rows) {
      const msgId = String(row && row.msg_id != null ? row.msg_id : '');
      if (!msgId || seen.has(msgId)) continue;
      seen.add(msgId);
      out.push(JSON.stringify(_toLine(row, ownerAccountId)));
    }
    if (out.length === 0) return;
    fs.appendFileSync(file, out.join('\n') + '\n', 'utf-8'); // SACRED-OK: append-only ground-truth archive
  } catch (e) {
    console.error('[zalo-group-history] appendGroupMessages failed (non-blocking):', e && e.message);
  }
}

// Most recent `limit` messages for a group under `account` (newest-last).
function readGroupHistory(ws, groupId, { account, limit = DEFAULT_GROUP_LIMIT } = {}) {
  try {
    const file = _groupFileFor(ws, account, groupId);
    if (!file) return [];
    let raw;
    try { raw = fs.readFileSync(file, 'utf-8'); } catch { return []; }
    const msgs = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try { msgs.push(JSON.parse(line)); } catch {}
    }
    const n = Number(limit) > 0 ? Number(limit) : msgs.length;
    return msgs.slice(-n);
  } catch (e) {
    console.error('[zalo-group-history] readGroupHistory failed:', e && e.message);
    return [];
  }
}

// Owner-account subfolders present under zalo-group-history.
function listGroupAccounts(ws) {
  try {
    const root = groupArchiveRoot(ws);
    if (!root) return [];
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(e => e.isDirectory() && _isSafeId(e.name))
      .map(e => e.name);
  } catch { return []; }
}

// Group-id file basenames (without .jsonl) under a given account.
function listGroups(ws, account) {
  try {
    if (!_isSafeId(account)) return [];
    const root = groupArchiveRoot(ws);
    if (!root) return [];
    return fs.readdirSync(path.join(root, account), { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.jsonl'))
      .map(e => e.name.slice(0, -'.jsonl'.length));
  } catch { return []; }
}

module.exports = {
  appendGroupMessages, readGroupHistory, listGroupAccounts, listGroups,
  groupArchiveRoot, DEFAULT_GROUP_LIMIT,
};
