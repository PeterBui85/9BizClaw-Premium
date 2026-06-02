'use strict';
// Real-DB eval for CEO memory capture (recall + injection + dedup).
// Run under Electron (better-sqlite3 ABI):
//   npx electron scripts/eval-ceo-memory.js
// NOT part of the node smoke chain.
process.env.NODE_ENV = 'test';
const fs = require('fs'); const os = require('os'); const path = require('path');
// Throwaway workspace so the REAL ceo_memories DB + CEO-MEMORY.md are isolated.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ceomem-eval-'));
fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });

// Force workspace to the temp dir BEFORE requiring ceo-memory.js (which caches
// the DB path in getMemoryDb()). _setWorkspaceCacheForTest bypasses all platform
// detection and env fallback — only ceo-memory.js gets the temp workspace.
const { _setWorkspaceCacheForTest } = require('../lib/workspace');
_setWorkspaceCacheForTest(tmp);

const assert = require('assert');
const { captureAndStore } = require('../lib/ceo-memory-capture');
const ceoMem = require('../lib/ceo-memory');            // REAL writeMemory/searchMemory/regenerate
const { getWorkspace } = require('../lib/workspace');
const _norm = s => String(s || '').replace(/\s+/g, ' ').trim();

const HARD = ['anh thích trả lời ngắn gọn', 'anh ghét nói dài dòng', 'đừng gửi báo cáo sau 22h']; // all sensitivity-clean
const transcript = HARD.map(h => 'Anh: ' + h).join('\n') + '\nAnh: shop mình bán mỹ phẩm';
const missed = [];
const deps = {
  modelCall: async () => JSON.stringify([{ type: 'fact', content: 'Shop bán mỹ phẩm' }]),  // 1 soft fact
  readExistingMemories: async () => { try { return fs.readFileSync(path.join(getWorkspace(), 'CEO-MEMORY.md'), 'utf-8'); } catch { return ''; } },
  searchMemory: ceoMem.searchMemory,
  writeMemory: ceoMem.writeMemory,
  onMissed: m => missed.push(m),
};
const ws = getWorkspace();
(async () => {
  await captureAndStore(transcript, deps);
  await ceoMem.regenerateCeoMemoryFile();                // SYNCHRONOUS regenerate (avoid debounce race)
  const md = fs.readFileSync(path.join(ws, 'CEO-MEMORY.md'), 'utf-8').toLowerCase();
  for (const h of HARD) assert(md.includes(_norm(h).toLowerCase().slice(0, 20)), 'CEO-MEMORY.md missing hard fact: ' + h);
  const rows1 = (await ceoMem.searchMemory('trả lời ngắn gọn', { scopes: ['ceo'], limit: 10 })).length;
  await captureAndStore(transcript, deps);               // identical re-run
  const rows2 = (await ceoMem.searchMemory('trả lời ngắn gọn', { scopes: ['ceo'], limit: 10 })).length;
  assert.strictEqual(rows2, rows1, 'duplicate rows created on re-run (dedup failed)');
  assert.strictEqual(missed.length, 0, 'unexpected missed/skipped: ' + JSON.stringify(missed));
  console.log('[eval-ceo-memory] PASS — hard facts injected:', HARD.length, '| no duplicates on re-run');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(e => { console.error('[eval-ceo-memory] FAIL', e.message); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} process.exit(1); });
