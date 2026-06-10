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
process.on('exit', () => {
  try { workspace._setWorkspaceCacheForTest(null); } catch {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});

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

// telegram all-emoji/stripped title → slug is empty → fallback → two distinct keys
const ke1 = t.normalizeDedupeKey({ source: 'telegram', title: '😀😁' });
const ke2 = t.normalizeDedupeKey({ source: 'telegram', title: '😂😃' });
assert.notStrictEqual(ke1, ke2, 'all-emoji telegram titles get distinct dedupeKeys');

// --- sanitizeTitle: no newlines, no emoji, capped ---
assert.ok(!t.sanitizeTitle('a\nb').includes('\n'), 'newlines stripped');
assert.strictEqual(t.sanitizeTitle('  Trả giá cho chị Lan  '), 'Trả giá cho chị Lan', 'trimmed, dấu intact');
assert.ok(t.sanitizeTitle('x'.repeat(500)).length <= 200, 'capped at 200');

console.log('todos id/dedupe/sanitize OK');

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
})().catch(e => { console.error(e); process.exit(1); });
