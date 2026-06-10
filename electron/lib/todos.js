'use strict';
const fs = require('fs');
const path = require('path');
const { getWorkspace, auditLog } = require('./workspace');
const { writeJsonAtomic } = require('./util');
const ctx = require('./context');

// ============================================================
//   GLOBAL TO-DO STORE  (Việc cần làm)
// ============================================================
// One JSON store of tasks the CEO must decide or the bot must do. Slice 1+2:
// manual CRUD + deterministic system-generated tasks (cron/Zalo/license). NO AI
// here — priority/priorityReason stay null until Slice 4. See
// docs/superpowers/specs/2026-06-10-global-todo-design.md.
//
// Write-safety: ALL writes (IPC, HTTP route, future tick) go through
// _withTodoLock — a real promise-serialization chain (copied from cron.js
// _withCustomCronLock), NOT the follow-up.js boolean. Plus writeJsonAtomic.
//
// NOTE on the spec's _tickInFlight + ctx.ipcInFlightCount mandate: those guard a
// periodic RECONCILE tick, which does not exist until Slice 4. Slice 1+2 has no
// tick (system tasks are emitted inline at failure sites, manual tasks via IPC),
// so _tickInFlight is intentionally deferred to Slice 4. _withTodoLock already
// serializes the only writers that exist now (IPC + HTTP + system hooks).
//
// Require direction (no cycles): todos.js requires ONLY workspace/util/context
// (leaf deps). cron.js / channels.js / license.js must lazy-`require('./todos')`
// at call-time inside their hooks — they load during startOpenClaw() which can
// run before todos.js is warm, and a top-level require there could form a cycle.
// dashboard-ipc.js eager-requires todos.js safely (it loads after full app init).

const VALID_STATUS = ['mở', 'đang làm', 'chờ duyệt', 'xong', 'hoãn', 'bỏ'];
const OPEN_STATUSES = ['mở', 'đang làm', 'chờ duyệt'];
const VALID_SOURCE = ['zalo', 'fb', 'telegram', 'system', 'manual'];

function getTodosPath() {
  const ws = getWorkspace();
  if (!ws) return null;                 // pre-init: callers no-op gracefully
  return path.join(ws, 'todos.json');
}

function readTodos() {
  const p = getTodosPath();
  if (!p || !fs.existsSync(p)) return [];   // first-run = empty, never throws
  try {
    const arr = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('[todos] readTodos parse error (returning empty):', e?.message);
    return [];
  }
}

let _todoWriteChain = Promise.resolve();
async function _withTodoLock(fn) {
  let release;
  const gate = new Promise(r => { release = r; });
  const prev = _todoWriteChain;
  _todoWriteChain = gate;
  await prev;
  try { return await fn(); } finally { release(); }
}

function _writeTodos(arr) {
  const p = getTodosPath();
  if (!p) return false;                 // null workspace: no-op, not a crash
  writeJsonAtomic(p, arr);
  return true;
}

function _rid() {
  // 'todo_' + base36 time + 4 hex. Unique enough for a single-machine store.
  return 'todo_' + Date.now().toString(36) + '_' +
    Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
}

// Strip newlines + emoji + control chars, collapse spaces, cap 200. Vietnamese
// dấu MUST survive (do not normalize away combining marks). No emoji in CEO UI.
function sanitizeTitle(s) {
  let x = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ');
  // Remove emoji / pictographs (keep Vietnamese letters, which are < U+1F000).
  x = x.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu, '');
  x = x.replace(/\s{2,}/g, ' ').trim();
  return x.slice(0, 200);
}

// Per-source dedupe key. customerId+fixed-category for customer tasks (NEVER a
// free-text hash — "muốn báo giá" vs "hỏi báo giá" would differ and re-create
// every scan). Deterministic for system. Unique for manual.
function normalizeDedupeKey(task) {
  const src = task.source;
  const o = task.origin || {};
  if (src === 'zalo' || src === 'fb') {
    return `${src}:${o.customerId || 'unknown'}:${task.categoryKey || 'khac'}`;
  }
  if (src === 'system') {
    return `system:${o.failureType || 'unknown'}:${o.resourceId || 'na'}`;
  }
  if (src === 'telegram') {
    const slug = sanitizeTitle(task.title).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip dấu for slug only
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return `telegram:${o.sessionId || 'main'}:${slug}`;
  }
  // manual: always unique
  return `manual:${_rid()}`;
}

module.exports = {
  VALID_STATUS, OPEN_STATUSES, VALID_SOURCE,
  getTodosPath, readTodos, _withTodoLock,
  _rid, sanitizeTitle, normalizeDedupeKey,
};
