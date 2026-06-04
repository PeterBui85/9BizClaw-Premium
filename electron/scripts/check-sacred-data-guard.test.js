'use strict';
/**
 * Unit tests for check-sacred-data-guard.js
 *
 * Run: node electron/scripts/check-sacred-data-guard.test.js
 * Exit 0 = all pass. Exit 1 = failure.
 *
 * WHY these tests matter: the guard is the keystone of Sacred Data Protection.
 * If it can't detect an rmSync on zalo-users/, Layer 1 is silent. These tests
 * verify the detection bites before it can fail in production.
 */

const assert = require('assert');
const { scanFile, containsSacredSegment } = require('./check-sacred-data-guard');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

// ── Test 1: rmSync on zalo-users → violation detected ────────────────────────

test('rmSync on zalo-users in non-allowlisted file → violation', () => {
  const fakePath = '/tmp/some-random-module.js';
  const content = [
    "const ws = getWorkspace();",
    "fs.rmSync(path.join(ws, 'memory', 'zalo-users'), { recursive: true });",
  ].join('\n');

  const { violations, warnings } = scanFile(fakePath, content);
  assert.strictEqual(violations.length, 1, `Expected 1 violation, got ${violations.length}`);
  assert.strictEqual(violations[0].op, 'rmSync');
  assert.strictEqual(violations[0].segment, 'zalo-users');
  assert.strictEqual(warnings.length, 0);
});

// ── Test 2: rmSync with no sacred segment → no violation ─────────────────────

test('rmSync on non-sacred path → no violation', () => {
  const fakePath = '/tmp/some-random-module.js';
  const content = [
    "const tmp = '/tmp/scratch-dir';",
    "fs.rmSync(tmp, { recursive: true, force: true });",
  ].join('\n');

  const { violations, warnings } = scanFile(fakePath, content);
  assert.strictEqual(violations.length, 0, `Expected 0 violations, got ${violations.length}`);
  assert.strictEqual(warnings.length, 0);
});

// ── Test 3: 'skills' alone does NOT match 'user-skills' ──────────────────────

test('"skills" alone does NOT trigger sacred segment match (only "user-skills" does)', () => {
  // A path like 'skills/marketing/...' must NOT be flagged
  assert.strictEqual(
    containsSacredSegment("fs.rmSync(path.join(ws, 'skills', 'marketing'))"),
    false,
    "'skills' standalone should not match 'user-skills'"
  );

  // But 'user-skills' should match
  assert.strictEqual(
    containsSacredSegment("fs.rmSync(path.join(ws, 'user-skills'))"),
    true,
    "'user-skills' must match"
  );
});

// ── Test 4: unlinkSync on CEO-MEMORY.md → violation ──────────────────────────

test('unlinkSync on CEO-MEMORY.md in non-allowlisted file → violation', () => {
  const fakePath = '/tmp/bad-cleanup.js';
  const content = "fs.unlinkSync(path.join(ws, 'CEO-MEMORY.md'));";
  const { violations } = scanFile(fakePath, content);
  assert.strictEqual(violations.length, 1, `Expected 1 violation, got ${violations.length}`);
  assert.strictEqual(violations[0].segment, 'CEO-MEMORY.md');
});

// ── Test 5: allowlisted file + SACRED-OK marker → no violation, no warning ───

test('rmSync in allowlisted file WITH // SACRED-OK → no violation, no warning', () => {
  const fakePath = '/some/path/lib/dashboard-ipc.js';
  const content = [
    "// SACRED-OK: factory-reset snapshots before this wipe",
    "fs.rmSync(path.join(ws, 'memory', 'zalo-users'), { recursive: true });",
  ].join('\n');

  const { violations, warnings } = scanFile(fakePath, content);
  assert.strictEqual(violations.length, 0, `Expected 0 violations`);
  assert.strictEqual(warnings.length, 0, `Expected 0 warnings (SACRED-OK present)`);
});

// ── Test 6: allowlisted file WITHOUT SACRED-OK marker → warning, no violation ─

test('rmSync in allowlisted file WITHOUT // SACRED-OK → warn, no violation', () => {
  const fakePath = '/some/path/lib/conversation.js';
  const content = "fs.writeFileSync(path.join(ws, 'memory', 'zalo-users', id + '.md'), data);";

  const { violations, warnings } = scanFile(fakePath, content);
  assert.strictEqual(violations.length, 0, `Expected 0 violations (allowlisted)`);
  assert.strictEqual(warnings.length, 1, `Expected 1 warning (missing SACRED-OK)`);
});

// ── Test 7: writeFileSync inline with zalo-groups segment → violation ────────

test('writeFileSync inline with zalo-groups segment in non-allowlisted file → violation', () => {
  const fakePath = '/tmp/some-unknown-module.js'; // not in the allowlist
  // Segment on the same line as the op — guard must catch it
  const content = "fs.writeFileSync(path.join(ws, 'memory', 'zalo-groups', groupId + '.md'), content, 'utf-8');";

  const { violations } = scanFile(fakePath, content);
  assert.strictEqual(violations.length, 1, `Expected 1 violation`);
  assert.strictEqual(violations[0].segment, 'zalo-groups');
});

// ── Test 8: multi-line context window catches segment on next line ─────────────

test('sacred segment on line below the op → detected via context window', () => {
  const fakePath = '/tmp/bad.js';
  const content = [
    "fs.rmSync(",
    "  path.join(ws, 'memory', 'zalo-users'),",
    "  { recursive: true }",
    ");",
  ].join('\n');

  const { violations } = scanFile(fakePath, content);
  assert.strictEqual(violations.length, 1, `Expected 1 violation (segment on next line)`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n[check-sacred-data-guard.test] ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
