'use strict';
// CEO Memory Capture — unit guard (plain node, DI'd I/O, no DB/better-sqlite3).
// Run: node scripts/check-ceo-memory-capture.js
// Part of: npm run smoke
process.env.NODE_ENV = 'test';
const assert = require('assert');
const { captureFromConversation, captureAndStore, _norm } = require('../lib/ceo-memory-capture');
let passed = 0, failed = 0;
const ok = (n, c) => { if (c) { console.log('  PASS', n); passed++; } else { console.log('  FAIL', n); failed++; } };

(async () => {
  // =========================================================
  // Layer 1: explicit preference is captured deterministically (no model)
  // =========================================================
  const r = await captureFromConversation('Anh: anh thích trả lời ngắn gọn nha em', { modelCall: async () => '[]' });
  const pref = r.facts.find(f => f.type === 'preference' && /ngắn gọn/i.test(f.content));
  ok('layer1 captures explicit preference', !!pref && pref.confidence === 1);
  // Emittable-type guard: never emits task/task_state (writeMemory skips them for source auto)
  ok('no task/task_state types', !r.facts.some(f => f.type === 'task' || f.type === 'task_state'));

  // =========================================================
  // Layer 2: parse valid JSON facts, assign confidence 0.7, drop non-emittable types
  // =========================================================
  const stub = async () => JSON.stringify([
    { type: 'fact', content: 'Công ty bán lẻ thời trang' },
    { type: 'decision', content: 'should be dropped (not VALID_TYPES)' },
    { type: 'task', content: 'should be dropped (auto-skip type)' },
  ]);
  const r2 = await captureFromConversation('Anh: shop mình bán thời trang', { modelCall: stub });
  ok('layer2 keeps valid fact', r2.facts.some(f => f.type === 'fact' && f.confidence === 0.7));
  ok('layer2 drops decision/task', !r2.facts.some(f => ['decision', 'task'].includes(f.type)));
  // Malformed model output: no throw, Layer-1 facts still returned, error recorded
  const r3 = await captureFromConversation('Anh: anh thích trả lời ngắn gọn', { modelCall: async () => 'not json{' });
  ok('malformed model output is safe', r3.facts.some(f => f.type === 'preference') && r3.errors.length >= 1);

  const r4 = await captureFromConversation('Anh [23:15] Tin nhắn từ CEO:', { modelCall: async () => '[]' });
  ok('no false pref from timestamp-prefixed sender line', !r4.facts.some(f => f.type === 'preference'));

  // =========================================================
  // captureAndStore: writes hard facts, dedups exact re-emission, logs skipped + missed
  // =========================================================
  const db = []; const missed = [];
  const deps = {
    modelCall: async () => '[]',
    readExistingMemories: async () => '',
    searchMemory: async (q) => db.filter(r => _norm(r.content).toLowerCase() === _norm(q).toLowerCase()).map(r => ({ ...r })),
    writeMemory: async ({ type, content, source }) => {
      if (source === 'auto' && (type === 'task' || type === 'task_state')) return { skipped: true };
      db.push({ type, content, source }); return { id: db.length };
    },
    onMissed: (m) => missed.push(m),
  };
  const a = await captureAndStore('Anh: anh thích trả lời ngắn gọn', deps);
  ok('captureAndStore writes the preference', db.some(r => /ngắn gọn/i.test(r.content) && r.type === 'preference' && r.source === 'auto'));
  const before = db.length;
  await captureAndStore('Anh: anh thích trả lời ngắn gọn', deps); // exact re-emission
  ok('dedup: no duplicate row on identical re-run', db.length === before);

  console.log(`\n[check-ceo-memory-capture] ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
