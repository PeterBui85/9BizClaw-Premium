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

module.exports = {
  VALID_STATUS, OPEN_STATUSES, VALID_SOURCE,
  getTodosPath, readTodos, _withTodoLock,
};
