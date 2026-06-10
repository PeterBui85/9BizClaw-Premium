'use strict';
const fs = require('fs');
const path = require('path');
const { getWorkspace, auditLog } = require('./workspace');
const { writeJsonAtomic } = require('./util');
// NOTE: require('./context') is intentionally NOT imported here yet.
// ctx.ipcInFlightCount will be needed by the periodic RECONCILE tick in Slice 4.
// The require will be ADDED lazily in Slice 4 when the tick needs it.

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
// Require direction (no cycles): todos.js requires ONLY workspace/util
// (leaf deps). cron.js / channels.js / license.js must lazy-`require('./todos')`
// at call-time inside their hooks — they load during startOpenClaw() which can
// run before todos.js is warm, and a top-level require there could form a cycle.
// dashboard-ipc.js eager-requires todos.js safely (it loads after full app init).

const VALID_STATUS = ['mở', 'đang làm', 'chờ duyệt', 'xong', 'hoãn', 'bỏ'];
const OPEN_STATUSES = ['mở', 'đang làm', 'chờ duyệt'];
const CLOSED_STATUSES = ['xong', 'bỏ'];
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

let _ridSeq = 0;
function _rid() {
  // Monotonic process counter: same-millisecond calls get distinct suffixes.
  return 'todo_' + Date.now().toString(36) + '_' + (++_ridSeq).toString(36).padStart(4, '0');
}

// Strip newlines + emoji + control chars, collapse spaces, cap 200. Vietnamese
// dấu MUST survive (do not normalize away combining marks). No emoji in CEO UI.
function sanitizeTitle(s) {
  let x = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ');
  // emoji/pictograph ranges — does not affect Vietnamese precomposed chars (U+1EA0–U+1EF9 are below these ranges).
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
    const slug = (sanitizeTitle(task.title || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip dấu for slug only
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40))
      || _rid().slice(-8);   // all-emoji/all-stripped titles get a unique suffix
    return `telegram:${o.sessionId || 'main'}:${slug}`;
  }
  // manual: always unique
  return `manual:${_rid()}`;
}

// Create a task. If a task with the same dedupeKey is OPEN, return it unchanged
// (no duplicate). Closed duplicates do NOT block re-creation (the issue recurred).
async function addTask(input) {
  return _withTodoLock(async () => {
    const arr = readTodos();
    const candidate = {
      source: VALID_SOURCE.includes(input.source) ? input.source : 'manual',
      origin: input.origin || {},
      title: sanitizeTitle(input.title),
      detail: input.detail ? String(input.detail).slice(0, 2000) : '',
      categoryKey: input.categoryKey,        // used only for dedupe of customer tasks
    };
    candidate.dedupeKey = normalizeDedupeKey(candidate);
    const dup = arr.find(x => x.dedupeKey === candidate.dedupeKey && OPEN_STATUSES.includes(x.status));
    if (dup) return dup;
    const now = new Date().toISOString();
    const task = {
      id: _rid(),
      source: candidate.source,
      origin: candidate.origin,
      title: candidate.title,
      detail: candidate.detail,
      customerFacing: false,               // Slice 1+2: nothing is customer-facing yet
      status: 'mở',
      priority: null, priorityReason: null,
      signals: {},
      proposedAction: null,
      dedupeKey: candidate.dedupeKey,
      createdAt: now, updatedAt: now,
      closedAt: null, closedReason: null,
    };
    arr.push(task);
    // writeJsonAtomic throws on ENOSPC/rename failure → addTask's promise rejects;
    // callers must handle or use emitSystemTask (which swallows).
    if (!_writeTodos(arr)) {
      console.warn('[todos] addTask: workspace not ready, task not persisted');
      return null;
    }
    try { auditLog('todo_created', { id: task.id, source: task.source, dedupeKey: task.dedupeKey }); } catch {}
    return task;
  });
}

function listTasks({ status } = {}) {
  const arr = readTodos();
  if (status === 'open') return arr.filter(x => OPEN_STATUSES.includes(x.status));
  if (status && VALID_STATUS.includes(status)) return arr.filter(x => x.status === status);
  return arr;
}

async function setStatus(id, status, closedReason = null) {
  if (!VALID_STATUS.includes(status)) return null;
  return _withTodoLock(async () => {
    const arr = readTodos();
    const task = arr.find(x => x.id === id);
    if (!task) return null;
    task.status = status;
    task.updatedAt = new Date().toISOString();
    if (CLOSED_STATUSES.includes(status)) {
      task.closedAt = task.updatedAt;
      task.closedReason = closedReason || (status === 'xong' ? 'ceo-done' : 'ceo-skip');
    } else {
      task.closedAt = null; task.closedReason = null;   // re-opening clears
    }
    if (!_writeTodos(arr)) {
      console.warn('[todos] setStatus: workspace not ready, status change not persisted');
      return null;
    }
    try { auditLog('todo_status', { id, status, closedReason: task.closedReason }); } catch {}
    return task;
  });
}

// Slice 1+2 spotlight: a DETERMINISTIC COUNT sentence only. No priority, no AI —
// those arrive in Slice 4. Keeps the surface honest: "Có N việc cần làm." or, if
// any are system-flagged problems, name that bucket.
function spotlight() {
  const open = listTasks({ status: 'open' });
  const openCount = open.length;
  const sysCount = open.filter(x => x.source === 'system').length;
  let sentence;
  if (openCount === 0) sentence = 'Hiện chưa có việc nào cần làm.';
  else if (sysCount > 0) sentence = `Có ${openCount} việc cần làm, trong đó ${sysCount} việc hệ thống cần anh xem.`;
  else sentence = `Có ${openCount} việc cần làm.`;
  return { sentence, openCount, systemCount: sysCount, top: open.slice(0, 3) };
}

// Code-only entry point for the system hooks (cron/Zalo/license). No LLM. Safe to
// call repeatedly — dedupes on (failureType, resourceId) so a flapping failure
// updates nothing rather than spamming. Never throws (callers are failure paths).
async function emitSystemTask(failureType, resourceId, title, detail = '') {
  try {
    return await addTask({
      source: 'system',
      origin: { failureType, resourceId },
      title, detail,
    });
  } catch (e) {
    console.warn('[todos] emitSystemTask error:', e?.message);
    return null;
  }
}

module.exports = {
  VALID_STATUS, OPEN_STATUSES, VALID_SOURCE,
  getTodosPath, readTodos, _withTodoLock,
  _rid, sanitizeTitle, normalizeDedupeKey,
  addTask, listTasks, setStatus, spotlight, emitSystemTask,
};
