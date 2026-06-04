'use strict';
// Unit tests for lib/zalo-history-archive.js — the account-namespaced raw
// ground-truth archive. Run with system node (no Electron binary needed).
//
// Covers: append + dedup by msgId, dir computation (out for self), the KEY
// requirement (per-account separation: same customer under 2 accounts → 2
// files that never mix), readHistory + limit (newest-last), path-safety.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const a = require('../lib/zalo-history-archive');

function tmpWs() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zha-test-'));
}

// --- appendMessages: 3 rows → 3 lines; re-append → still 3 (dedup) ---
{
  const ws = tmpWs();
  const acct = 'self001';
  const cust = 'cust_A';
  const rows = [
    { msg_id: 'm1', timestamp_ms: 1000, sender_id: 'cust_A', sender_name: 'A', msg_type: 'text', content_text: 'xin chào' },
    { msg_id: 'm2', timestamp_ms: 1001, sender_id: 'self001', sender_name: 'Shop', msg_type: 'text', content_text: 'chào bạn' },
    { msg_id: 'm3', timestamp_ms: 1002, sender_id: 'cust_A', sender_name: 'A', msg_type: 'text', content_text: 'cho hỏi giá' },
  ];
  a.appendMessages(ws, acct, cust, rows);

  const file = path.join(ws, 'zalo-history', acct, cust + '.jsonl');
  assert.ok(fs.existsSync(file), 'jsonl file created at expected path');
  let lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
  assert.strictEqual(lines.length, 3, '3 rows → 3 lines');

  // dir computation: m2 is from self → 'out'; m1/m3 from customer → 'in'
  const parsed = lines.map(l => JSON.parse(l));
  assert.strictEqual(parsed[0].dir, 'in', 'customer msg → in');
  assert.strictEqual(parsed[1].dir, 'out', 'self msg → out');
  assert.strictEqual(parsed[1].text, 'chào bạn', 'text carried over');
  assert.strictEqual(parsed[1].senderName, 'Shop', 'senderName carried over');

  // Re-append the SAME 3 → still 3 (dedup by msgId)
  a.appendMessages(ws, acct, cust, rows);
  lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
  assert.strictEqual(lines.length, 3, 're-append same 3 → still 3 (dedup by msgId)');

  // Append 1 new + 2 dupes → 4 total
  a.appendMessages(ws, acct, cust, [
    ...rows,
    { msg_id: 'm4', timestamp_ms: 1003, sender_id: 'cust_A', sender_name: 'A', msg_type: 'text', content_text: 'ok' },
  ]);
  lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
  assert.strictEqual(lines.length, 4, 'one new msgId appended, dupes skipped');

  fs.rmSync(ws, { recursive: true, force: true });
  console.log('appendMessages + dedup OK');
}

// --- ACCOUNT SEPARATION (the key requirement) ---
{
  const ws = tmpWs();
  const cust = 'shared_cust';
  // Same customerId under TWO accounts
  a.appendMessages(ws, 'acctA', cust, [
    { msg_id: 'a1', timestamp_ms: 2000, sender_id: 'shared_cust', sender_name: 'X', msg_type: 'text', content_text: 'từ acctA' },
  ]);
  a.appendMessages(ws, 'acctB', cust, [
    { msg_id: 'b1', timestamp_ms: 3000, sender_id: 'shared_cust', sender_name: 'X', msg_type: 'text', content_text: 'từ acctB' },
  ]);

  const fileA = path.join(ws, 'zalo-history', 'acctA', cust + '.jsonl');
  const fileB = path.join(ws, 'zalo-history', 'acctB', cust + '.jsonl');
  assert.ok(fs.existsSync(fileA), 'acctA file exists');
  assert.ok(fs.existsSync(fileB), 'acctB file exists');
  assert.notStrictEqual(fileA, fileB, 'two separate files');

  const contentA = fs.readFileSync(fileA, 'utf-8');
  const contentB = fs.readFileSync(fileB, 'utf-8');
  // No mixing: A's file only has a1/từ acctA; B's only b1/từ acctB
  assert.ok(contentA.includes('a1') && contentA.includes('từ acctA'), 'A has its own msg');
  assert.ok(!contentA.includes('b1') && !contentA.includes('từ acctB'), 'A does NOT contain B msgs');
  assert.ok(contentB.includes('b1') && contentB.includes('từ acctB'), 'B has its own msg');
  assert.ok(!contentB.includes('a1') && !contentB.includes('từ acctA'), 'B does NOT contain A msgs');

  // listAccounts / listCustomers
  const accts = a.listAccounts(ws).sort();
  assert.deepStrictEqual(accts, ['acctA', 'acctB'], 'listAccounts returns both');
  assert.deepStrictEqual(a.listCustomers(ws, 'acctA'), [cust], 'listCustomers for acctA');

  fs.rmSync(ws, { recursive: true, force: true });
  console.log('account separation OK');
}

// --- readHistory: returns appended msgs, respects limit (newest-last) ---
{
  const ws = tmpWs();
  const acct = 'self001';
  const cust = 'cust_R';
  const rows = [];
  for (let i = 1; i <= 5; i++) {
    rows.push({ msg_id: 'r' + i, timestamp_ms: 1000 + i, sender_id: 'cust_R', sender_name: 'R', msg_type: 'text', content_text: 'msg ' + i });
  }
  a.appendMessages(ws, acct, cust, rows);

  const all = a.readHistory(ws, cust, { account: acct });
  assert.strictEqual(all.length, 5, 'all 5 returned');
  assert.strictEqual(all[0].msgId, 'r1', 'oldest first');
  assert.strictEqual(all[4].msgId, 'r5', 'newest last');

  const limited = a.readHistory(ws, cust, { account: acct, limit: 2 });
  assert.strictEqual(limited.length, 2, 'limit respected');
  assert.strictEqual(limited[0].msgId, 'r4', 'most recent 2, newest-last (r4)');
  assert.strictEqual(limited[1].msgId, 'r5', 'most recent 2, newest-last (r5)');

  // missing account → empty
  assert.deepStrictEqual(a.readHistory(ws, cust, { account: 'nope' }), [], 'unknown account → []');

  fs.rmSync(ws, { recursive: true, force: true });
  console.log('readHistory + limit OK');
}

// --- path-safety: '../evil' customerId / account → skipped, no escape ---
{
  const ws = tmpWs();
  // Malicious customerId
  a.appendMessages(ws, 'self001', '../evil', [
    { msg_id: 'x1', timestamp_ms: 1, sender_id: 'self001', sender_name: 'S', msg_type: 'text', content_text: 'pwn' },
  ]);
  // Malicious account
  a.appendMessages(ws, '../../evil', 'cust', [
    { msg_id: 'x2', timestamp_ms: 1, sender_id: 'self001', sender_name: 'S', msg_type: 'text', content_text: 'pwn' },
  ]);

  // Nothing written outside zalo-history; no 'evil' file anywhere under ws parent
  const histRoot = path.join(ws, 'zalo-history');
  const accts = fs.existsSync(histRoot) ? fs.readdirSync(histRoot) : [];
  assert.ok(!accts.includes('..'), 'no .. account dir');
  // The evil.jsonl must not exist at the workspace root or above
  assert.ok(!fs.existsSync(path.join(ws, 'evil.jsonl')), 'no escape to ws root');
  assert.ok(!fs.existsSync(path.join(path.dirname(ws), 'evil.jsonl')), 'no escape above ws');

  // readHistory with bad id → []
  assert.deepStrictEqual(a.readHistory(ws, '../evil', { account: 'self001' }), [], 'bad customerId read → []');

  fs.rmSync(ws, { recursive: true, force: true });
  console.log('path-safety OK');
}

// --- appendMessages never throws on bad input ---
{
  assert.doesNotThrow(() => a.appendMessages(null, 'a', 'c', null), 'null ws / rows tolerated');
  assert.doesNotThrow(() => a.appendMessages('/nonexistent-xyz', 'a', 'c', []), 'empty rows tolerated');
  console.log('robustness OK');
}

console.log('\nAll zalo-history-archive tests passed.');
