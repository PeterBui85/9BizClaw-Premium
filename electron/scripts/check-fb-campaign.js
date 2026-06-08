'use strict';
// Unit tests for the Facebook campaign-batch helpers in lib/fb-schedule.js.
// Run with system node. Covers the dependency-injected pure helpers:
// _validateImageSource, _isFrozenPost, _buildFbHistoryRecord, collectActivePendings.

const assert = require('node:assert');
const fb = require('../lib/fb-schedule');

// --- _validateImageSource: require prompt OR imagePath; imagePath must exist ---
{
  const exists = (p) => p === '/frozen/ok.png';
  assert.deepStrictEqual(fb._validateImageSource({ prompt: 'draw a cat' }, exists), { ok: true });
  assert.deepStrictEqual(fb._validateImageSource({ imagePath: '/frozen/ok.png' }, exists), { ok: true });
  assert.strictEqual(fb._validateImageSource({}, exists).ok, false, 'neither prompt nor imagePath → error');
  const missing = fb._validateImageSource({ imagePath: '/frozen/gone.png' }, exists);
  assert.strictEqual(missing.ok, false, 'imagePath set but file missing → error');
  assert.ok(/không tồn tại|missing|not found/i.test(missing.error), 'error explains missing file');
  console.log('_validateImageSource OK');
}

// --- _isPathUnderRoots + containment: imagePath outside allowed roots → reject ---
{
  const path = require('node:path');
  const ws = path.resolve('/ws');
  assert.strictEqual(fb._isPathUnderRoots(path.join(ws, 'media-assets/a.png'), [ws]), true, 'inside root');
  assert.strictEqual(fb._isPathUnderRoots(path.join(ws, '../etc/passwd'), [ws]), false, 'traversal blocked');
  assert.strictEqual(fb._isPathUnderRoots('/elsewhere/x.png', [ws]), false, 'sibling root blocked');
  assert.strictEqual(fb._isPathUnderRoots('/x.png', [null, undefined]), false, 'no roots → deny');

  // _validateImageSource honors the isAllowed predicate (containment) before existence.
  const exists = () => true;
  const allowOnly = (p) => fb._isPathUnderRoots(p, [ws]);
  const outside = fb._validateImageSource({ imagePath: '/etc/passwd' }, exists, allowOnly);
  assert.strictEqual(outside.ok, false, 'imagePath outside roots → reject');
  assert.ok(/ngoài thư mục|allowed|root/i.test(outside.error), 'error explains containment');
  const inside = fb._validateImageSource({ imagePath: path.join(ws, 'media-assets/a.png') }, exists, allowOnly);
  assert.strictEqual(inside.ok, true, 'imagePath inside roots → ok');
  console.log('_isPathUnderRoots + containment OK');
}

// --- _isFrozenPost: true only when schedule carries a frozen imagePath ---
{
  assert.strictEqual(fb._isFrozenPost({ imagePath: '/x.png' }), true);
  assert.strictEqual(fb._isFrozenPost({ prompt: 'draw' }), false);
  assert.strictEqual(fb._isFrozenPost({}), false);
  assert.strictEqual(fb._isFrozenPost(null), false);
  console.log('_isFrozenPost OK');
}

// --- wiring guard: handleGenerate honors the frozen branch (can't unit-test the
//     cron/imageGen/telegram path; pin the source so it can't silently regress) ---
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'fb-schedule.js'), 'utf8');
  assert.ok(/_isFrozenPost\(schedule\)/.test(src), 'handleGenerate must branch on _isFrozenPost');
  assert.ok(src.includes('Bug B: never regenerate'), 'frozen branch comment present (skip-generate intent)');
  console.log('frozen-skip wiring guard OK');
}

// --- _buildFbHistoryRecord: carries campaignId + postIndex/postTotal, with the
//     pending winning over a (possibly auto-deleted) schedule ---
{
  const pending = {
    scheduleId: 'fb_1', date: '2026-06-09', status: 'published',
    postId: 'p1', postUrl: 'https://fb/p1', publishedAt: '2026-06-09T13:30:00Z',
    targetPageId: 'PAGE', campaignId: 'camp_X', postIndex: 3, postTotal: 14, label: 'Bài 3',
  };
  // schedule == null simulates a one-time schedule auto-deleted by publish time
  const rec = fb._buildFbHistoryRecord(pending, null);
  assert.strictEqual(rec.campaignId, 'camp_X', 'campaignId from pending when schedule gone');
  assert.strictEqual(rec.postIndex, 3);
  assert.strictEqual(rec.postTotal, 14);
  assert.strictEqual(rec.status, 'published');
  assert.strictEqual(rec.postUrl, 'https://fb/p1');
  assert.strictEqual(rec.label, 'Bài 3', 'label falls back to pending when schedule gone');
  // schedule present overrides label/campaignId
  const rec2 = fb._buildFbHistoryRecord(pending, { id: 'fb_1', label: 'Sched Label', campaignId: 'camp_X', postDate: '2026-06-09' });
  assert.strictEqual(rec2.label, 'Sched Label');
  // BACKWARD-COMPAT: a legacy pending with no campaign fields → nulls, never undefined/crash
  const legacy = fb._buildFbHistoryRecord({ scheduleId: 'old', date: '2026-06-01', status: 'published', postId: 'x' }, null);
  assert.strictEqual(legacy.campaignId, null);
  assert.strictEqual(legacy.postIndex, null);
  assert.strictEqual(legacy.postTotal, null);
  assert.strictEqual(legacy.status, 'published');
  console.log('_buildFbHistoryRecord OK');
}

// --- collectActivePendings: disk-scan; surfaces an ORPHANED pending (no live
//     schedule) — the Bug A fix. Dependency-injected listPendingForDateFn. ---
{
  const byDate = {
    '2026-06-09': [
      { scheduleId: 'fb_live', date: '2026-06-09', status: 'pending' },
      { scheduleId: 'fb_orphan', date: '2026-06-09', status: 'approved' }, // schedule deleted
      { scheduleId: 'fb_done', date: '2026-06-09', status: 'published' },   // not active
    ],
    '2026-06-10': [],
    '2026-06-08': [],
  };
  const listFn = (d) => byDate[d] || [];
  const schedules = [{ id: 'fb_live', label: 'Live one' }]; // fb_orphan intentionally absent
  const active = fb.collectActivePendings(['2026-06-09', '2026-06-10', '2026-06-08'], schedules, listFn);
  const ids = active.map(a => a.pending.scheduleId).sort();
  assert.deepStrictEqual(ids, ['fb_live', 'fb_orphan'], 'active = pending+approved; published excluded; orphan INCLUDED');
  const orphan = active.find(a => a.pending.scheduleId === 'fb_orphan');
  assert.strictEqual(orphan.schedule, null, 'orphan has no live schedule but is still surfaced');
  const live = active.find(a => a.pending.scheduleId === 'fb_live');
  assert.strictEqual(live.schedule.label, 'Live one', 'live pending enriched with its schedule');
  console.log('collectActivePendings OK');
}

{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'fb-schedule.js'), 'utf8');
  assert.ok(/collectActivePendings\(dates, schedules, listPendingForDate\)/.test(src), 'handleTelegramCommand must use the disk-scan collector');
  assert.ok(/schedules\.find\(s => s\.id === specificId\) \|\| null/.test(src), 'resolve must tolerate a missing schedule (|| null)');
  assert.ok(!/[^?]\.schedule\.label/.test(src), 'all .schedule.label references must be null-safe (.schedule?.label)');
  console.log('bug-A discovery wiring guard OK');
}

console.log('\nAll fb-campaign helper tests passed.');
