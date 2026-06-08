'use strict';
// Local test for the verbatim-cron CEO-confirm flow (2026-06-07 guarantee).
// Pure — exercises lib/verbatim-cron-store.js directly, no HTTP server / no
// Telegram (booting cron-api would fire a real preview). Run with system node.
// Mirrors check-zalo-daily-digest.js (node:assert, per-block OK log).

const assert = require('node:assert');
const store = require('../lib/verbatim-cron-store');
const { detectAgentPromptAsContent, detectOrchestrationLeak } = require('../lib/cron-content-guard');

// --- park → pending lists it; nothing is "written" until taken ---
{
  store.clear();
  const entry = { id: 'cron_x', label: 'Chào sáng', prompt: 'exec: openzca msg send 123 "Chào" --group --profile default', cronExpr: '0 8 * * *' };
  store.park('n1abcdef00000000', { entry, targetStr: '123', groupNames: 'Nhóm A (…0123)', content: 'Chào buổi sáng!', whenLabel: 'Lịch: 0 8 * * *' });
  assert.strictEqual(store.size(), 1, 'one pending after park');
  const list = store.pending();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].code, 'n1abcd', 'code = first 6 of nonce');
  assert.strictEqual(list[0].code.length, store.CODE_LEN);
  assert.strictEqual(list[0].entry.id, 'cron_x');
  store.clear();
  console.log('park + pending + code OK');
}

// --- code binding: CEO confirms the entry they previewed, not the newest ---
{
  store.clear();
  const T = Date.now();
  store.park('aaaa1111ffffffff', { entry: { id: 'X' }, content: 'X', groupNames: 'GA' }, T + 1000);
  store.park('bbbb2222ffffffff', { entry: { id: 'Y' }, content: 'Y', groupNames: 'GB' }, T + 2000); // newer
  const list = store.pending(T + 3000);
  assert.strictEqual(list[0].entry.id, 'Y', 'pending() is newest-first');
  // CEO replies with X's code → must resolve X, leave Y untouched (no bait-and-switch).
  const targetX = list.find(p => p.code === store.codeOf('aaaa1111ffffffff'));
  assert.strictEqual(targetX.entry.id, 'X');
  const taken = store.take(targetX.nonce);
  assert.strictEqual(taken.entry.id, 'X');
  assert.strictEqual(store.pending().length, 1, 'Y still pending');
  assert.strictEqual(store.pending()[0].entry.id, 'Y');
  store.clear();
  console.log('code binding (anti bait-and-switch) OK');
}

// --- atomic take: a duplicated ĐĂNG can't double-write ---
{
  store.clear();
  store.park('dup0dup0dup0dup0', { entry: { id: 'D' }, content: 'once' });
  const first = store.take('dup0dup0dup0dup0');
  assert.ok(first && first.entry.id === 'D', 'first take returns the entry');
  assert.strictEqual(store.take('dup0dup0dup0dup0'), null, 'second take returns null → no double write');
  store.clear();
  console.log('atomic take (no double write) OK');
}

// --- the create→ĐĂNG→commit decision path (the live handler's logic) ---
{
  store.clear();
  const entry = { id: 'cron_live', label: 'Tin Premium', cronExpr: '0 8 * * *' };
  store.park('live1live1live1aa', { entry, targetStr: '999', groupNames: 'PREMIUM (…7632)', content: 'Tin hôm nay: giảm 20%.', whenLabel: 'Lịch: 0 8 * * *' });

  // CEO replies a non-command → still pending (no accidental write).
  assert.strictEqual(store.classifyCommand('để anh xem đã').cmd, 'unhandled');
  assert.strictEqual(store.pending().length, 1, 'still pending after a non-command reply');

  // Sole pending → bare ĐĂNG resolves it; backstop passes (real post); commit+claim.
  const { cmd } = store.classifyCommand('ĐĂNG');
  assert.strictEqual(cmd, 'confirm');
  const list = store.pending();
  const target = list.length === 1 ? list[0] : null;   // mirrors the handler's sole-pending rule
  assert.ok(target, 'sole pending resolved without a code');
  assert.strictEqual(detectAgentPromptAsContent(target.content), null, 'real post passes the input backstop');
  const claimed = store.take(target.nonce);
  assert.ok(claimed, 'claimed for commit');
  assert.strictEqual(store.size(), 0, 'pending cleared after commit');
  store.clear();
  console.log('create → ĐĂNG → commit path OK');
}

// --- BỎ discards without writing ---
{
  store.clear();
  store.park('cancel0cancel000', { entry: { id: 'C' }, content: 'bản nháp' });
  assert.strictEqual(store.classifyCommand('BỎ').cmd, 'cancel');
  store.take(store.pending()[0].nonce);
  assert.strictEqual(store.size(), 0, 'cancel cleared the pending');
  store.clear();
  console.log('BỎ discards OK');
}

// --- a prompt that somehow reaches confirm is STILL refused at the backstop ---
{
  store.clear();
  const incident = '[WORKFLOW] Mỗi ngày tạo 1 bài viết... tạo 1 cron one-time mới cho ngày hôm sau. groupId 8058216865993097632';
  store.park('bad0bad0bad0bad0', { entry: { id: 'BAD' }, content: incident });
  assert.strictEqual(store.classifyCommand('ĐĂNG').cmd, 'confirm');
  const p = store.take(store.pending()[0].nonce);
  assert.ok(detectAgentPromptAsContent(p.content), 'incident prompt blocked even after a confirm');
  store.clear();
  console.log('post-confirm backstop OK');
}

// --- code parsing: a trailing 6-hex token binds the confirm to a specific pending ---
{
  assert.deepStrictEqual(store.classifyCommand('ĐĂNG a1b2c3'), { cmd: 'confirm', code: 'a1b2c3' });
  assert.deepStrictEqual(store.classifyCommand('BỎ a1b2c3'), { cmd: 'cancel', code: 'a1b2c3' });
  assert.strictEqual(store.classifyCommand('ĐĂNG a1b2').code, null, '4-hex is no longer a code');
  console.log('6-hex code parsing OK');
}

// --- TTL cleanup: a stale pending is forgotten ---
{
  store.clear();
  store.park('old0old0old0old0', { entry: { id: 'OLD' }, content: 'x' }, 0); // createdAtMs = 0
  store.cleanup(store.TTL_MS + 1);                                           // now well past TTL
  assert.strictEqual(store.size(), 0, 'expired pending cleaned up');
  store.clear();
  console.log('TTL cleanup OK');
}

// --- #5 output verifier behaviour (echo blocked, real article allowed) ---
{
  assert.ok(detectOrchestrationLeak('[AUTO-MODE]\nrestated prompt'), 'echoed system tag blocked at delivery');
  assert.ok(detectOrchestrationLeak('gọi http://127.0.0.1:20200/api/cron/create'), 'internal endpoint blocked');
  assert.strictEqual(
    detectOrchestrationLeak('Tự động hóa doanh nghiệp với AI Agent: thiết lập workflow và cron hợp lý. Tin - Trợ lý Ai sếp Quốc!'),
    null, 'real automation article delivered');
  console.log('output verifier (#5) OK');
}

console.log('check-cron-verbatim-confirm: ALL OK');
