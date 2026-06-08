'use strict';
// Unit tests for lib/zalo-group-history-archive.js — the account-namespaced raw
// ground-truth archive of Zalo GROUP messages. Run with system node.
//
// Mirrors check-zalo-history-archive.js. Covers: append + dedup by msgId, dir
// computation (out only for self; every other member = in), per-account
// separation, readGroupHistory + limit (newest-last, default 100), path-safety,
// listGroupAccounts/listGroups, robustness.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const a = require('../lib/zalo-group-history-archive');

function tmpWs() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zgha-test-'));
}

// --- appendGroupMessages: many senders, dir only 'out' for self; dedup ---
{
  const ws = tmpWs();
  const acct = 'self001';
  const gid = '7290379638000003675';
  const rows = [
    { msg_id: 'g1', timestamp_ms: 1000, sender_id: 'memberA', sender_name: 'An',  msg_type: 'text', content_text: 'chào nhóm' },
    { msg_id: 'g2', timestamp_ms: 1001, sender_id: 'self001', sender_name: 'Shop', msg_type: 'text', content_text: 'chào cả nhà' },
    { msg_id: 'g3', timestamp_ms: 1002, sender_id: 'memberB', sender_name: 'Bình', msg_type: 'text', content_text: 'cho hỏi lịch' },
  ];
  a.appendGroupMessages(ws, acct, gid, rows);

  const file = path.join(ws, 'zalo-group-history', acct, gid + '.jsonl');
  assert.ok(fs.existsSync(file), 'group jsonl created at expected path');
  let lines = fs.readFileSync(file, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
  assert.strictEqual(lines.length, 3, '3 rows → 3 lines');
  assert.strictEqual(lines[0].dir, 'in', 'member A → in');
  assert.strictEqual(lines[1].dir, 'out', 'self → out');
  assert.strictEqual(lines[2].dir, 'in', 'member B → in');
  assert.strictEqual(lines[2].senderName, 'Bình', 'per-message senderName carried (makes transcript readable)');

  a.appendGroupMessages(ws, acct, gid, rows);
  lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
  assert.strictEqual(lines.length, 3, 're-append same → still 3 (dedup by msgId)');

  fs.rmSync(ws, { recursive: true, force: true });
  console.log('appendGroupMessages + dir + dedup OK');
}

// --- account separation: same group under 2 accounts → 2 files, no mixing ---
{
  const ws = tmpWs();
  const gid = 'shared_group';
  a.appendGroupMessages(ws, 'acctA', gid, [
    { msg_id: 'a1', timestamp_ms: 2000, sender_id: 'm1', sender_name: 'X', msg_type: 'text', content_text: 'từ acctA' },
  ]);
  a.appendGroupMessages(ws, 'acctB', gid, [
    { msg_id: 'b1', timestamp_ms: 3000, sender_id: 'm2', sender_name: 'Y', msg_type: 'text', content_text: 'từ acctB' },
  ]);
  const cA = fs.readFileSync(path.join(ws, 'zalo-group-history', 'acctA', gid + '.jsonl'), 'utf-8');
  const cB = fs.readFileSync(path.join(ws, 'zalo-group-history', 'acctB', gid + '.jsonl'), 'utf-8');
  assert.ok(cA.includes('từ acctA') && !cA.includes('từ acctB'), 'acctA isolated');
  assert.ok(cB.includes('từ acctB') && !cB.includes('từ acctA'), 'acctB isolated');
  assert.deepStrictEqual(a.listGroupAccounts(ws).sort(), ['acctA', 'acctB'], 'listGroupAccounts');
  assert.deepStrictEqual(a.listGroups(ws, 'acctA'), [gid], 'listGroups for acctA');
  fs.rmSync(ws, { recursive: true, force: true });
  console.log('group account separation OK');
}

// --- readGroupHistory: newest-last, default 100, limit respected ---
{
  const ws = tmpWs();
  const acct = 'self001';
  const gid = 'g_read';
  const rows = [];
  for (let i = 1; i <= 5; i++) {
    rows.push({ msg_id: 'r' + i, timestamp_ms: 1000 + i, sender_id: 'm', sender_name: 'M', msg_type: 'text', content_text: 'msg ' + i });
  }
  a.appendGroupMessages(ws, acct, gid, rows);

  const all = a.readGroupHistory(ws, gid, { account: acct });
  assert.strictEqual(all.length, 5, 'all 5 (under default 100)');
  assert.strictEqual(all[0].msgId, 'r1', 'oldest first');
  assert.strictEqual(all[4].msgId, 'r5', 'newest last');

  const limited = a.readGroupHistory(ws, gid, { account: acct, limit: 2 });
  assert.deepStrictEqual(limited.map(m => m.msgId), ['r4', 'r5'], 'limit 2, newest-last');

  assert.deepStrictEqual(a.readGroupHistory(ws, gid, { account: 'nope' }), [], 'unknown account → []');
  fs.rmSync(ws, { recursive: true, force: true });
  console.log('readGroupHistory + limit OK');
}

// --- default limit is 100 (not the DM module's 200) ---
{
  const ws = tmpWs();
  const acct = 'self001';
  const gid = 'g_big';
  const rows = [];
  for (let i = 1; i <= 150; i++) {
    rows.push({ msg_id: 'b' + i, timestamp_ms: 1000 + i, sender_id: 'm', sender_name: 'M', msg_type: 'text', content_text: 't' + i });
  }
  a.appendGroupMessages(ws, acct, gid, rows);
  const def = a.readGroupHistory(ws, gid, { account: acct });
  assert.strictEqual(def.length, 100, 'default limit caps at 100');
  assert.strictEqual(def[99].msgId, 'b150', 'newest kept');
  assert.strictEqual(def[0].msgId, 'b51', 'oldest of the last 100');
  fs.rmSync(ws, { recursive: true, force: true });
  console.log('default-100 OK');
}

// --- path-safety: malicious ids skipped, no escape ---
{
  const ws = tmpWs();
  a.appendGroupMessages(ws, 'self001', '../evil', [
    { msg_id: 'x1', timestamp_ms: 1, sender_id: 'self001', sender_name: 'S', msg_type: 'text', content_text: 'pwn' },
  ]);
  a.appendGroupMessages(ws, '../../evil', 'g', [
    { msg_id: 'x2', timestamp_ms: 1, sender_id: 'self001', sender_name: 'S', msg_type: 'text', content_text: 'pwn' },
  ]);
  assert.ok(!fs.existsSync(path.join(ws, 'evil.jsonl')), 'no escape to ws root');
  assert.ok(!fs.existsSync(path.join(path.dirname(ws), 'evil.jsonl')), 'no escape above ws');
  assert.deepStrictEqual(a.readGroupHistory(ws, '../evil', { account: 'self001' }), [], 'bad id read → []');
  fs.rmSync(ws, { recursive: true, force: true });
  console.log('path-safety OK');
}

// --- robustness: never throws on bad input ---
{
  assert.doesNotThrow(() => a.appendGroupMessages(null, 'a', 'g', null), 'null ws/rows tolerated');
  assert.doesNotThrow(() => a.appendGroupMessages('/nonexistent-xyz', 'a', 'g', []), 'empty rows tolerated');
  console.log('robustness OK');
}

console.log('\nAll zalo-group-history-archive tests passed.');
