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
