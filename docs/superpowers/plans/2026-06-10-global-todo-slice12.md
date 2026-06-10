# Global To-Do (Việc cần làm) — Slice 1+2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an app-wide task store (`todos.json`) that the CEO manages from the Dashboard and Telegram, and that the bot populates deterministically from its own failures (cron/Zalo/license) — the foundation + the "bot surfaces problems" half, with no AI yet.

**Architecture:** One JSON store in the workspace, all writes serialized through a single promise-chain lock (copied from `cron.js` `_withCustomCronLock`) + `writeJsonAtomic`. Two access paths over shared store functions: HTTP `/api/todos/*` (behind the existing `_requireCeoTelegram` gate, for the Telegram agent via AGENTS.md→web_fetch) and Electron `ipcMain` handlers (for the Dashboard). System tasks are emitted by plain code at the failure site — no LLM. Priority fields exist in the schema but stay empty (Slice 4 fills them); the spotlight is a deterministic count sentence.

**Tech Stack:** Node.js (Electron main process), plain `fs` + `writeJsonAtomic` (`electron/lib/util.js`), `node:assert` check-scripts (project convention — NOT node:test), vanilla JS Dashboard (`electron/ui/dashboard.html`), `contextBridge` preload.

**Spec:** `docs/superpowers/specs/2026-06-10-global-todo-design.md` — read it first. This plan implements the bundled **Slice 1+2** only (store + CRUD + both surfaces + system hooks). Slices 3 (AI harvest) and 4 (priority + autonomy) are out of scope.

**Hard project rules that gate every task (from CLAUDE.md + MEMORY.md):**
- NEVER edit `openclaw.json` or `*.json` config via PowerShell. Use the Edit/Write tools only.
- Vietnamese text: proper dấu always, NEVER `\uXXXX` escapes, NEVER PowerShell `-Encoding utf8` (adds BOM/mojibake).
- No emoji anywhere in CEO-facing UI/text (premium aesthetic). Emoji allowed only in marketing content (not relevant here).
- `pwd` + `git branch --show-current` before EVERY commit.
- Chat-first: Telegram control is in scope, not deferred.
- Propose-first: nothing in Slice 1+2 sends to a customer (system tasks are CEO-facing only), so no customer-send path exists here at all — keep it that way.
- Every data-storing feature updates the backup manifest (Task 9) AND the self-knowledge skill (Task 10) in the same batch.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `electron/lib/todos.js` | **Create** | The store: schema constants, serialized-write lock, CRUD, dedupe, system-task emit helper, spotlight-count. One concern: task persistence + manipulation. No HTTP, no IPC, no UI. |
| `electron/scripts/check-todos.js` | **Create** | `node:assert` check-script for `todos.js` (mirrors `check-customer-memory-updater.js`). |
| `electron/lib/cron-api.js` | Modify | Add `/api/todos/*` HTTP routes inside the existing route chain (behind the central `_requireCeoTelegram` gate). |
| `electron/lib/dashboard-ipc.js` | Modify | Add `ipcMain.handle('todos:*')` handlers calling the same `todos.js` functions. |
| `electron/preload.js` | Modify | Expose `todos*` methods on `window.claw`. |
| `electron/ui/dashboard.html` | Modify | Add the `Việc cần làm` page (count-stub spotlight + list + add/close/snooze), nav entry, and JS handlers. |
| `electron/lib/cron.js` | Modify | System-hook: emit a todo when a cron fails fatally / after 3 retries. |
| `electron/lib/channels.js` | Modify | System-hook: emit a todo when Zalo is detected down. |
| `electron/lib/license.js` | Modify | System-hook: emit a todo when license is expiring soon. |
| `electron/lib/backup.js` | Modify | Add `todos` to `wsJsonFiles`. |
| `skills/operations/gioi-thieu.md` | Modify | Describe `Việc cần làm` in the bot's self-model. |
| `electron/lib/workspace.js` | Modify | Bump `CURRENT_AGENTS_MD_VERSION` (skill/AGENTS edits must reach installs). |
| `AGENTS.md` | Modify | Document the todo routing (CEO "việc hôm nay?" → web_fetch `/api/todos/spotlight`) + bump the version stamp to match. |
| `electron/scripts/smoke-skill-runtime.js` | Modify | Drift guards: routes exist + gated, backup includes todos, self-knowledge mentions it. |

**Schema (the single source of truth, defined in `todos.js`):**
```
Task {
  id            string   // 'todo_' + base36(now) + 4 rand hex
  source        'zalo'|'fb'|'telegram'|'system'|'manual'
  origin        { customerId?, customerName?, channel?, sessionId?, failureType?, resourceId? }
  title         string   // short Vietnamese, proper dấu, no emoji
  detail        string   // optional
  customerFacing boolean // Slice 1+2: system+manual tasks are all false
  status        'mở'|'đang làm'|'chờ duyệt'|'xong'|'hoãn'|'bỏ'
  priority      'cao'|'trung'|'thấp'|null   // null until Slice 4
  priorityReason string|null                // null until Slice 4
  signals       { amount?, pendingSinceMs?, vip?, deadline? }  // {} for now
  proposedAction null                       // Slice 4
  dedupeKey     string   // per-source, see normalizeDedupeKey()
  createdAt, updatedAt   // ISO strings
  closedAt      string|null
  closedReason  null|'ceo-done'|'ceo-skip'|'bot-detected-done'|'expired'|'source-gone'
}
```

---

## Chunk 1: The store (`todos.js`) + its check-script

This chunk produces a fully unit-tested store module with zero wiring. It is independently verifiable via `node electron/scripts/check-todos.js`.

### Task 1: Create the store module skeleton + path/bootstrap

**Files:**
- Create: `electron/lib/todos.js`

- [ ] **Step 1: Write the module with path resolution, null-guard bootstrap, read, and the serialized-write lock.**

Mirror `cron.js` exactly for the lock and `writeJsonAtomic` usage. Read `electron/lib/cron.js:2647-2667` and `electron/lib/follow-up.js:25-41` first to match the patterns.

```javascript
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
```

- [ ] **Step 2: Syntax-check.**

Run: `node --check electron/lib/todos.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit.**

```bash
git add electron/lib/todos.js
git commit -m "feat(todos): store skeleton — path, bootstrap read, serialized-write lock"
```

### Task 2: `id`, `normalizeDedupeKey`, and `sanitizeTitle`

**Files:**
- Modify: `electron/lib/todos.js`
- Create: `electron/scripts/check-todos.js`

- [ ] **Step 1: Write the failing check-script first (TDD).**

Create `electron/scripts/check-todos.js`. NOTE: this project uses plain `node:assert` scripts, NOT node:test — match `check-customer-memory-updater.js`. Inject a temp workspace via env so it never touches real data (read how `getWorkspace()` resolves: it honors `9BIZ_WORKSPACE`).

```javascript
'use strict';
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolated workspace so the check NEVER touches real CEO data. getWorkspace()
// does NOT honor any env var — it caches a resolved path. workspace.js exports
// _setWorkspaceCacheForTest(p) exactly for this. MUST be called before any
// todos.js function runs (todos.js calls getWorkspace() at call-time, so setting
// the cache first is sufficient even though we require todos.js at the top).
const workspace = require('../lib/workspace');
const TMP = path.join(os.tmpdir(), 'todos_check_' + Date.now());
fs.mkdirSync(TMP, { recursive: true });
workspace._setWorkspaceCacheForTest(TMP);
process.on('exit', () => { try { workspace._setWorkspaceCacheForTest(null); } catch {} });

const t = require('../lib/todos');

// --- dedupeKey: stable + per-source ---
assert.strictEqual(
  t.normalizeDedupeKey({ source: 'system', origin: { failureType: 'cron_failed', resourceId: 'cron_abc' } }),
  'system:cron_failed:cron_abc', 'system key is deterministic');
assert.strictEqual(
  t.normalizeDedupeKey({ source: 'zalo', origin: { customerId: '42' }, categoryKey: 'bao-gia' }),
  'zalo:42:bao-gia', 'customer key uses fixed category, not free-text');
// manual → unique each call (no dedupe)
const k1 = t.normalizeDedupeKey({ source: 'manual', title: 'x' });
const k2 = t.normalizeDedupeKey({ source: 'manual', title: 'x' });
assert.notStrictEqual(k1, k2, 'manual keys never collide');

// --- sanitizeTitle: no newlines, no emoji, capped ---
assert.ok(!t.sanitizeTitle('a\nb').includes('\n'), 'newlines stripped');
assert.strictEqual(t.sanitizeTitle('  Trả giá cho chị Lan  '), 'Trả giá cho chị Lan', 'trimmed, dấu intact');
assert.ok(t.sanitizeTitle('x'.repeat(500)).length <= 200, 'capped at 200');

console.log('todos id/dedupe/sanitize OK');
```

- [ ] **Step 2: Run it — must FAIL (functions not defined).**

Run: `node electron/scripts/check-todos.js`
Expected: throws `TypeError: t.normalizeDedupeKey is not a function`.

- [ ] **Step 3: Implement the three helpers in `todos.js`.**

`Date.now()`/`Math.random()` are fine in app code (the no-`Date.now` rule is only for Workflow scripts). Add before `module.exports`:

```javascript
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
```

Add `_rid, sanitizeTitle, normalizeDedupeKey` to `module.exports`.

- [ ] **Step 4: Run the check — must PASS.**

Run: `node electron/scripts/check-todos.js`
Expected: `todos id/dedupe/sanitize OK`.

- [ ] **Step 5: Commit.**

```bash
git add electron/lib/todos.js electron/scripts/check-todos.js
git commit -m "feat(todos): id, per-source dedupeKey, title sanitize + check-script"
```

### Task 3: `addTask` (with dedupe) + `listTasks`

**Files:**
- Modify: `electron/lib/todos.js`, `electron/scripts/check-todos.js`

- [ ] **Step 1: Extend the check-script (failing).** Append:

```javascript
// --- addTask + dedupe + listTasks ---
(async () => {
  const a = await t.addTask({ source: 'manual', title: 'Gọi nhà cung cấp' });
  assert.ok(a.id && a.status === 'mở' && a.priority === null, 'new task: open, no priority yet');
  assert.strictEqual(a.createdAt, a.updatedAt, 'timestamps equal on create');

  // system dedupe: same failureType+resourceId must NOT create a 2nd task
  const s1 = await t.addTask({ source: 'system', title: 'Cron lỗi', origin: { failureType: 'cron_failed', resourceId: 'cron_x' } });
  const s2 = await t.addTask({ source: 'system', title: 'Cron lỗi (again)', origin: { failureType: 'cron_failed', resourceId: 'cron_x' } });
  assert.strictEqual(s1.id, s2.id, 'duplicate system task returns the existing one');

  const all = t.listTasks();
  assert.strictEqual(all.filter(x => x.origin.resourceId === 'cron_x').length, 1, 'only one cron_x task stored');

  // listTasks status filter
  const open = t.listTasks({ status: 'open' });
  assert.ok(open.every(x => t.OPEN_STATUSES.includes(x.status)), 'open filter returns only open');
  console.log('todos addTask/list OK');
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run — FAIL** (`addTask is not a function`).
Run: `node electron/scripts/check-todos.js`

- [ ] **Step 3: Implement `addTask` + `listTasks`.**

```javascript
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
    _writeTodos(arr);
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
```

Export both.

- [ ] **Step 4: Run — PASS.** `node electron/scripts/check-todos.js` → `todos addTask/list OK`.

- [ ] **Step 5: Commit.**
```bash
git add electron/lib/todos.js electron/scripts/check-todos.js
git commit -m "feat(todos): addTask with open-dedupe + listTasks status filter"
```

### Task 4: `setStatus` (close/snooze/cancel) + `spotlight` count-stub

**Files:** Modify `electron/lib/todos.js`, `electron/scripts/check-todos.js`

- [ ] **Step 1: Extend check-script (failing).** Append inside the async IIFE before its closing log:

```javascript
  // setStatus
  const m = await t.addTask({ source: 'manual', title: 'Đặt hàng bao bì' });
  const done = await t.setStatus(m.id, 'xong', 'ceo-done');
  assert.strictEqual(done.status, 'xong');
  assert.ok(done.closedAt && done.closedReason === 'ceo-done', 'close stamps closedAt+reason');
  assert.notStrictEqual(done.updatedAt, done.createdAt, 'updatedAt advances on change');
  const missing = await t.setStatus('todo_nope', 'xong');
  assert.strictEqual(missing, null, 'setStatus on missing id returns null');
  // snooze keeps it out of "open" but not closed
  const sn = await t.addTask({ source: 'manual', title: 'Xem báo cáo' });
  await t.setStatus(sn.id, 'hoãn');
  assert.ok(!t.listTasks({ status: 'open' }).some(x => x.id === sn.id), 'snoozed task leaves open list');

  // spotlight count-stub (no AI): counts OPEN tasks, Vietnamese, no emoji
  const sp = t.spotlight();
  assert.ok(/việc cần/i.test(sp.sentence), 'spotlight sentence in Vietnamese');
  assert.ok(!/[\u{1F000}-\u{1FAFF}]/u.test(sp.sentence), 'spotlight has no emoji');
  assert.strictEqual(typeof sp.openCount, 'number');
  console.log('todos setStatus/spotlight OK');
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement `setStatus` + `spotlight`.**

```javascript
const CLOSED_STATUSES = ['xong', 'bỏ'];
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
    _writeTodos(arr);
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
```

Export `setStatus, spotlight`.

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**
```bash
git add electron/lib/todos.js electron/scripts/check-todos.js
git commit -m "feat(todos): setStatus (close/snooze/reopen) + count-stub spotlight"
```

### Task 5: `emitSystemTask` convenience + concurrency test

**Files:** Modify `electron/lib/todos.js`, `electron/scripts/check-todos.js`

- [ ] **Step 1: Extend check-script (failing) — emit helper + the concurrency guarantee (the WHY: a dropped concurrent CEO edit = a re-surfaced chore).** Append:

```javascript
  // emitSystemTask convenience wrapper
  const e1 = await t.emitSystemTask('cron_failed', 'cron_morning', 'Cron buổi sáng lỗi 3 lần', 'Exit code 1');
  assert.strictEqual(e1.origin.failureType, 'cron_failed');
  assert.strictEqual(e1.source, 'system');
  const e2 = await t.emitSystemTask('cron_failed', 'cron_morning', 'dup', '');
  assert.strictEqual(e1.id, e2.id, 'emitSystemTask dedupes by failureType+resourceId');

  // Concurrency: 20 parallel addTask calls must all persist (lock serializes them).
  const before = t.listTasks().length;
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    t.addTask({ source: 'manual', title: 'concurrent ' + i })));
  assert.strictEqual(t.listTasks().length, before + 20, 'all 20 concurrent writes persisted (no lost update)');
  console.log('todos emit/concurrency OK');
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement `emitSystemTask`.**

```javascript
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
```

Export it.

- [ ] **Step 4: Run — PASS.** `node electron/scripts/check-todos.js` → `todos emit/concurrency OK`.

  Note: check-scripts in `electron/scripts/` run standalone (`node electron/scripts/check-todos.js`); `smoke-test.js` is a dependency/vendor validator and does NOT host check-scripts, so there is nothing to "register" there. CI runs check-todos as its own step (and Task 11 runs it in the final verification pass).

- [ ] **Step 5: Commit.**
```bash
git add electron/lib/todos.js electron/scripts/check-todos.js
git commit -m "feat(todos): emitSystemTask wrapper + concurrency test (lock = no lost update)"
```

---

## Chunk 2: HTTP routes + Dashboard IPC (both surfaces over shared store)

### Task 6: `/api/todos/*` HTTP routes (behind the CEO gate)

**Files:** Modify `electron/lib/cron-api.js`

Read `electron/lib/cron-api.js:1486-1523` (the `/api/cron/list|delete|toggle` handlers) to match the `jsonResp(res, code, obj)` style and the central gate at ~817. The gate already protects everything not in `PUBLIC_ROUTES`, so todos routes are auto-gated — do NOT add them to `PUBLIC_ROUTES`. NOTE: do NOT wrap todo routes in cron-api's `withWriteLock` — that lock is for cron writes. The todo store serializes its own writes via `_withTodoLock` internally, so the route handlers just call `todos.addTask`/`setStatus` directly (the code blocks below already do this correctly).

- [ ] **Step 1: Add a require for the store near the other requires at the top of cron-api.js.**
```javascript
const todos = require('./todos');
```

- [ ] **Step 2: Add the route block inside the main `if/else if` chain** (after the `/api/cron/*` block, before the file-route section). Each route mirrors the cron handlers' shape.

```javascript
    } else if (urlPath === '/api/todos/list') {
      try { return jsonResp(res, 200, { todos: todos.listTasks({ status: params.status }) }); }
      catch (e) { return jsonResp(res, 500, { error: e.message }); }

    } else if (urlPath === '/api/todos/spotlight') {
      try { return jsonResp(res, 200, todos.spotlight()); }
      catch (e) { return jsonResp(res, 500, { error: e.message }); }

    } else if (urlPath === '/api/todos/add') {
      const { title, detail } = params;
      if (!title || !String(title).trim()) return jsonResp(res, 400, { error: 'title required' });
      try {
        const task = await todos.addTask({ source: 'manual', title, detail });
        return jsonResp(res, 200, { success: true, task });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }

    } else if (urlPath === '/api/todos/status') {
      const { id, status, reason } = params;
      if (!id || !status) return jsonResp(res, 400, { error: 'id and status required' });
      try {
        const task = await todos.setStatus(id, status, reason);
        if (!task) return jsonResp(res, 404, { error: 'task not found or invalid status: ' + id });
        return jsonResp(res, 200, { success: true, task });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }
```

- [ ] **Step 3: Syntax-check.** `node --check electron/lib/cron-api.js`

- [ ] **Step 4: Add a drift-guard test** to `electron/tests/cron-api.test.js` (append a `describe`). NOTE: `cron-api.test.js` uses the `node:test` framework (`describe`/`test`, run with `node --test`) — a DIFFERENT convention from `check-todos.js`, which is a plain `node:assert` script. Use `node:test` style here:
```javascript
describe('todos routes wired + gated', () => {
  const fs = require('fs'); const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cron-api.js'), 'utf8');
  test('all four todos routes exist', () => {
    for (const r of ['/api/todos/list', '/api/todos/spotlight', '/api/todos/add', '/api/todos/status'])
      assert.ok(src.includes(`urlPath === '${r}'`), 'missing route ' + r);
  });
  test('todos routes are NOT in PUBLIC_ROUTES (stay CEO-gated)', () => {
    const pub = src.slice(src.indexOf('PUBLIC_ROUTES = new Set'), src.indexOf('PUBLIC_ROUTES = new Set') + 400);
    assert.ok(!pub.includes('/api/todos'), 'todos must not be public');
  });
});
```

- [ ] **Step 5: Run** `node --test electron/tests/cron-api.test.js` → all pass.
- [ ] **Step 6: Commit.**
```bash
git add electron/lib/cron-api.js electron/tests/cron-api.test.js
git commit -m "feat(todos): /api/todos/* routes behind CEO gate + drift guard"
```

### Task 7: Dashboard IPC handlers

**Files:** Modify `electron/lib/dashboard-ipc.js`, `electron/preload.js`

Read `electron/lib/dashboard-ipc.js:4123-4130` (the `startup:get/set` handlers) for the exact `ipcMain.handle` shape, and `electron/preload.js:125-129` for the `contextBridge` exposure shape.

- [ ] **Step 1: Add a require for the store** near the top of `dashboard-ipc.js` (grep an existing `require('./` to find the block).
```javascript
const todos = require('./todos');
```

- [ ] **Step 2: Add the four IPC handlers** next to the other `ipcMain.handle` calls (near `startup:*`):
```javascript
ipcMain.handle('todos:list', (_e, { status } = {}) => {
  try { return { success: true, todos: todos.listTasks({ status }) }; }
  catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('todos:spotlight', () => {
  try { return { success: true, ...todos.spotlight() }; }
  catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('todos:add', async (_e, { title, detail } = {}) => {
  if (!title || !String(title).trim()) return { success: false, error: 'title required' };
  try { return { success: true, task: await todos.addTask({ source: 'manual', title, detail }) }; }
  catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('todos:status', async (_e, { id, status, reason } = {}) => {
  if (!id || !status) return { success: false, error: 'id and status required' };
  try {
    const task = await todos.setStatus(id, status, reason);
    return task ? { success: true, task } : { success: false, error: 'not found' };
  } catch (e) { return { success: false, error: e.message }; }
});
```

- [ ] **Step 3: Expose on `window.claw`** in `preload.js` (add next to the existing `getStartupSetting` lines):
```javascript
  todosList: (status) => ipcRenderer.invoke('todos:list', { status }),
  todosSpotlight: () => ipcRenderer.invoke('todos:spotlight'),
  todosAdd: (title, detail) => ipcRenderer.invoke('todos:add', { title, detail }),
  todosStatus: (id, status, reason) => ipcRenderer.invoke('todos:status', { id, status, reason }),
```

- [ ] **Step 4: Syntax-check both.** `node --check electron/lib/dashboard-ipc.js && node --check electron/preload.js`
- [ ] **Step 5: Commit.**
```bash
git add electron/lib/dashboard-ipc.js electron/preload.js
git commit -m "feat(todos): Dashboard IPC handlers + preload exposure"
```

---

## Chunk 3: Dashboard page + Telegram routing + system hooks + manifest/skill

### Task 8: Dashboard `Việc cần làm` page

**Files:** Modify `electron/ui/dashboard.html`

Read the dashboard.html patterns first (it is ~12k lines — ALWAYS Grep + offset-read, NEVER full-read). Grep for: `data-icon="folder-open"` and the MODORO AI page (`page-modoro-ai`) added recently as the closest template for a new page + nav entry + JS handlers (see the diff style in commit history). Match: no emoji, proper Vietnamese, `var(--…)` theme tokens, `showToast`, `esc()`.

- [ ] **Step 1: Add the nav/page entry.** Grep for the `config:` nav array that includes `'modoro-ai'` (around the `pages: ['skills','persona-mix','modoro-ai',...]` line) and the matching `tabs` array. Add a `viec-can-lam` page id with `icon: 'check-square'` and label `Việc cần làm` in the appropriate section (Hệ Thống / overview).

- [ ] **Step 2: Add the page markup** (a `<div class="page" id="page-viec-can-lam">`) modeled on `page-modoro-ai`: a header, a spotlight banner `<div id="todo-spotlight">`, an add-row (text input + button), and a `<div id="todo-list">`. Vietnamese labels, no emoji, theme tokens.

- [ ] **Step 3: Add the JS handlers** near the other page loaders (grep `async function doModoroSetup`):
```javascript
async function loadTodos() {
  const sp = document.getElementById('todo-spotlight');
  const list = document.getElementById('todo-list');
  try {
    const s = await window.claw.todosSpotlight();
    if (sp && s && s.success) sp.textContent = s.sentence;
    const r = await window.claw.todosList('open');
    if (!list) return;
    if (!r || !r.success) { list.innerHTML = '<div style="color:var(--text-muted)">Không tải được danh sách.</div>'; return; }
    if (!r.todos.length) { list.innerHTML = '<div style="color:var(--text-muted)">Chưa có việc nào.</div>'; return; }
    list.innerHTML = r.todos.map(todoCardHtml).join('');
  } catch (e) { if (list) list.innerHTML = '<div style="color:var(--danger)">Lỗi: ' + esc(e.message) + '</div>'; }
}
function todoCardHtml(x) {
  const src = { system: 'Hệ thống', manual: 'Tự nhập', telegram: 'CEO', zalo: 'Zalo', fb: 'FB' }[x.source] || x.source;
  return '<div class="card" style="margin-bottom:8px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start">'
    + '<div><div style="font-weight:600">' + esc(x.title) + '</div>'
    + (x.detail ? '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">' + esc(x.detail) + '</div>' : '')
    + '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + esc(src) + '</div></div>'
    + '<div style="display:flex;gap:6px;flex-shrink:0">'
    + '<button class="btn btn-secondary btn-small" onclick="todoSet(\'' + x.id + '\',\'xong\')">Xong</button>'
    + '<button class="btn btn-secondary btn-small" onclick="todoSet(\'' + x.id + '\',\'hoãn\')">Hoãn</button>'
    + '<button class="btn btn-secondary btn-small" onclick="todoSet(\'' + x.id + '\',\'bỏ\')">Bỏ</button>'
    + '</div></div>';
}
async function todoSet(id, status) {
  try { const r = await window.claw.todosStatus(id, status);
    if (r && r.success) { if (typeof showToast === 'function') showToast('Đã cập nhật', 'success'); loadTodos(); }
    else showToast('Không cập nhật được: ' + ((r && r.error) || ''), 'error');
  } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
}
async function todoAdd() {
  const inp = document.getElementById('todo-add-input'); const v = (inp.value || '').trim();
  if (!v) return;
  try { const r = await window.claw.todosAdd(v);
    if (r && r.success) { inp.value = ''; loadTodos(); } else showToast('Không thêm được: ' + ((r && r.error) || ''), 'error');
  } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
}
```

- [ ] **Step 4: Wire `loadTodos()` to fire when the page is shown.** Grep how `page-modoro-ai` / other pages trigger their loader on nav (the page-switch function) and add a `loadTodos()` call when `viec-can-lam` becomes active.

- [ ] **Step 5: Manual smoke (no automated DOM test in this project).** Document in the commit that the page was visually checked: `npm run` the app per the run skill, open the page, add a task, mark it xong, confirm it disappears from the open list. If the app can't be launched in this environment, note that and defer to the user's verification.

- [ ] **Step 6: Commit.**
```bash
git add electron/ui/dashboard.html
git commit -m "feat(todos): Dashboard 'Việc cần làm' page (count spotlight + list + add/close/snooze)"
```

### Task 9: System hooks (cron / Zalo / license)

**Files:** Modify `electron/lib/cron.js`, `electron/lib/channels.js`, `electron/lib/license.js`

The store must be required lazily inside each hook to avoid require cycles (cron.js ↔ todos.js could cycle via workspace). Use `require('./todos')` at call time, wrapped in try/catch — these are failure paths and must never throw.

- [ ] **Step 1: Cron hook.** In `cron.js` `_runCronAgentPromptImpl`, at the two terminal failure points — the fatal-error branch (search for `reason: 'fatal-no-retry'`, ~line 754) and the after-3-retries fail (search for the final `journalCronRun({ phase: 'fail'` + `sendCeoAlert('*Cron ... thất bại sau 3 lần*`, ~line 792) — add after the existing `journalCronRun`/`sendCeoAlert`:
```javascript
    try { require('./todos').emitSystemTask('cron_failed', niceLabel, `Cron "${niceLabel}" lỗi, cần anh kiểm tra`, lastErr.slice(0, 300)); } catch {}
```
(Use the label as resourceId so repeated failures of the same cron dedupe to one task.)

- [ ] **Step 2: Zalo-down hook — attach to the MONITORING path, not the send path.**

  CRITICAL: do NOT hook `sendZaloTo`/`isZaloListenerAlive` (the send path) — it fires on every failed customer reply and would spam-create tasks during an outage. The correct site is `broadcastChannelStatusOnce()` in `channels.js`, which already implements a 5-minute down-grace (`DOWN_GRACE_MS`) specifically to avoid transient noise.

  **Down-hook** — at the sustained-down block (~line 1934, the `(now - global._channelDownSince[ch]) >= DOWN_GRACE_MS` branch that currently only `console.warn`s), gate to Zalo only:
```javascript
        if (ch === 'zalo') {
          try { require('./todos').emitSystemTask('zalo_down', 'zalo', 'Zalo mất kết nối trên 5 phút, cần anh kiểm tra/đăng nhập lại', `down ${downMin} phút`); } catch {}
        }
```

  **Up-close hook** — at the recovery point (~line 1929-1930, the `intentionallyOff || cur.ready === true` branch that does `delete global._channelDownSince[ch]`), gate to Zalo only and close any open down-task:
```javascript
        if (ch === 'zalo') {
          try { const tdo = require('./todos'); const open = tdo.listTasks({ status: 'open' }).find(x => x.dedupeKey === 'system:zalo_down:zalo'); if (open) await tdo.setStatus(open.id, 'xong', 'bot-detected-done'); } catch {}
        }
```
  (`broadcastChannelStatusOnce` is `async`, and `setStatus` returns a Promise — `await` it so a lock-chain rejection is caught by the surrounding `try/catch` instead of becoming an unhandled rejection. The auto-close is the ONE allowed self-close in Slice 1+2 — deterministic, no transcript scan.)

- [ ] **Step 3: License hook.** In `license.js` `checkLicenseStatus`, when `daysLeft` is a small positive number (≤ 7), emit a task; use a resourceId that changes by day-bucket so it refreshes but doesn't spam:
```javascript
    try { if (typeof daysLeft === 'number' && daysLeft >= 0 && daysLeft <= 7) require('./todos').emitSystemTask('license_expiring', 'license', `License sắp hết hạn (còn ${daysLeft} ngày)`, ''); } catch {}
```

- [ ] **Step 4: Syntax-check all three.** `node --check electron/lib/cron.js && node --check electron/lib/channels.js && node --check electron/lib/license.js`

- [ ] **Step 5: Drift-guard in smoke-skill-runtime.js** — assert each hook source contains `emitSystemTask`:
```javascript
{
  const todoSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'todos.js'), 'utf-8');
  if (/function emitSystemTask/.test(todoSrc)) ok('todos.js has emitSystemTask'); else bad('todos.js has emitSystemTask', 'missing');
  for (const [f, label] of [['cron.js','cron'],['channels.js','zalo'],['license.js','license']]) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'lib', f), 'utf-8');
    if (/emitSystemTask/.test(s)) ok(`${f} emits system todo`); else bad(`${f} emits system todo`, 'hook missing');
  }
}
```

- [ ] **Step 6: Run** `node electron/scripts/smoke-skill-runtime.js` → all pass.
- [ ] **Step 7: Commit.**
```bash
git add electron/lib/cron.js electron/lib/channels.js electron/lib/license.js electron/scripts/smoke-skill-runtime.js
git commit -m "feat(todos): system hooks — cron/Zalo/license failures emit (and Zalo-up closes) tasks"
```

### Task 10: Backup manifest + self-knowledge skill + AGENTS routing + version bump

**Files:** Modify `electron/lib/backup.js`, `skills/operations/gioi-thieu.md`, `AGENTS.md`, `electron/lib/workspace.js`

- [ ] **Step 1: Backup manifest.** In `electron/lib/backup.js`, add `'todos'` to the `wsJsonFiles` array (near `'follow-up-queue'`).

- [ ] **Step 2: AGENTS routing (chat-first).** In `AGENTS.md`, find where cron/internal-API routing is documented and add a line so the agent knows to serve CEO to-do requests: when the CEO asks "việc hôm nay?/việc cần làm/xong việc…", call the internal API: `GET http://127.0.0.1:20200/api/todos/spotlight` (and `/api/todos/list`, `/api/todos/status` to close). This is the chat-first path (no new poller — reuse the existing AGENTS→web_fetch→internal-API routing, per the Telegram invariant).

- [ ] **Step 3: Self-knowledge skill.** In `skills/operations/gioi-thieu.md`, add a short section describing `Việc cần làm` truthfully for Slice 1+2 scope: the bot keeps a list of things to do, gathered from the CEO and from system events (cron/Zalo/license), viewable on Dashboard and via Telegram ("việc hôm nay?"); the CEO can mark done/hoãn/bỏ. Do NOT claim AI prioritization or customer-intent harvesting yet (those are Slices 3-4) — keep the self-description truthful.

- [ ] **Step 4: Version bump.** In `electron/lib/workspace.js`, bump `CURRENT_AGENTS_MD_VERSION` by 1, and update the matching `<!-- modoroclaw-agents-version: N -->` stamp at the top of `AGENTS.md` to the SAME number (skill/AGENTS edits don't reach installs without this — project rule).

- [ ] **Step 5: Drift-guard in smoke-skill-runtime.js**:
```javascript
{
  const bk = fs.readFileSync(path.join(__dirname, '..', 'lib', 'backup.js'), 'utf-8');
  if (/'todos'/.test(bk)) ok('backup manifest includes todos'); else bad('backup manifest includes todos', 'todos.json not backed up');
  const gi = fs.readFileSync(path.join(__dirname, '..', '..', 'skills', 'operations', 'gioi-thieu.md'), 'utf-8');
  if (/[Vv]iệc cần làm/.test(gi)) ok('self-knowledge mentions Việc cần làm'); else bad('self-knowledge mentions Việc cần làm', 'skill not updated');
}
```

- [ ] **Step 6: Run** `node electron/scripts/smoke-skill-runtime.js` → pass. Also confirm the AGENTS version stamp matches the constant (grep both).
- [ ] **Step 7: Commit.**
```bash
git add electron/lib/backup.js skills/operations/gioi-thieu.md AGENTS.md electron/lib/workspace.js electron/scripts/smoke-skill-runtime.js
git commit -m "feat(todos): backup manifest + self-knowledge + AGENTS routing + version bump"
```

### Task 11: Regenerate system-map + final verification

**Files:** Modify `docs/generated/system-map.*`

- [ ] **Step 1: Regenerate** the system-map (source edits drift it; CI `map:check` fails otherwise — project rule):
```bash
node electron/scripts/generate-system-map.js
```
- [ ] **Step 2: Full verification pass.**
```bash
node electron/scripts/check-todos.js
node --test electron/tests/cron-api.test.js
node electron/scripts/smoke-skill-runtime.js
node electron/scripts/smoke-test.js
```
Expected: all pass.
- [ ] **Step 3: Commit.**
```bash
git add docs/generated/system-map.json docs/generated/system-map.txt
git commit -m "chore(todos): regen system-map after Slice 1+2"
```

---

## Out of scope (do NOT build here — later slices)

- AI priority scoring / `priorityReason` / the business-meaningful spotlight (Slice 4).
- Customer-intent extraction / expanding the memory extractor schema (Slice 3).
- CEO-session task extraction (Slice 3).
- Bot autonomy / proposedAction / customer-facing send (Slice 4) — and per propose-first, the customer-send path must NOT be introduced in this slice at all.
- Self-close by re-scanning customer transcripts (Slice 4) — the only auto-close here is the deterministic Zalo-up→close in Task 9.

## Verification summary (acceptance criteria from the spec)

- [ ] Bootstrap: no `todos.json` → empty list, no crash; null workspace → no-op (Task 1, tested Task 2-5 via temp ws).
- [ ] Per-source dedupeKey, stable across re-scans (Task 2, tested Task 3/5).
- [ ] Concurrent tick/IPC writes don't lose a CEO edit (Task 5 concurrency test).
- [ ] Both surfaces over one store: HTTP gated (Task 6) + Dashboard IPC (Task 7).
- [ ] Telegram chat-first via AGENTS routing (Task 10 Step 2). NOTE: the spec lists "Telegram command parsing" as a test, but in this app Telegram natural-language commands are handled by AGENTS.md→web_fetch routing (text matching by the LLM), NOT parser code — so there is no unit-testable parser. It is verified by the AGENTS version-stamp bump + the routes existing, not a check-script. This is an intentional, documented omission, not a gap.
- [ ] System hooks emit + Zalo-up closes (Task 9).
- [ ] Backup manifest includes todos.json (Task 10).
- [ ] Self-knowledge skill updated + AGENTS version bumped (Task 10).
- [ ] Tests mirror check-customer-memory-updater.js convention (Task 2-5).
- [ ] No emoji, proper Vietnamese dấu throughout (every UI/text task).
