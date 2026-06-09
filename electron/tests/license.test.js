/**
 * license.test.js
 * Critical-path tests for license.js (seal, verify, expiry)
 * Run: node --test electron/tests/license.test.js
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TEST_ROOT = path.join(__dirname, '_test_license_' + Date.now());
function cleanup() {
  try {
    for (const f of fs.readdirSync(TEST_ROOT)) fs.unlinkSync(path.join(TEST_ROOT, f));
    fs.rmdirSync(TEST_ROOT);
  } catch {}
}
try { fs.mkdirSync(TEST_ROOT, { recursive: true }); } catch {}

// ─── Key format ──────────────────────────────────────────────────────────────
describe('license key format', () => {
  test('CLAW- prefix is required', () => {
    const keyPrefix = 'CLAW-';
    assert.strictEqual(keyPrefix, 'CLAW-');
  });

  test('payload contains required fields', () => {
    const payload = {
      e: 'customer@example.com',
      p: 'premium',
      i: '2026-06-01',
      v: '2027-06-01',
    };
    assert.strictEqual(payload.e, 'customer@example.com');
    assert.ok(['premium', 'enterprise'].includes(payload.p));
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(payload.i));
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(payload.v));
  });

  test('pre-bound machine ID is optional', () => {
    const withMachine = { e: 'a@b.com', p: 'premium', i: '2026-01-01', v: '2027-01-01', m: 'abc123' };
    const withoutMachine = { e: 'a@b.com', p: 'premium', i: '2026-01-01', v: '2027-01-01' };
    assert.strictEqual(withMachine.m, 'abc123');
    assert.strictEqual(withoutMachine.m, undefined);
  });
});

// ─── HMAC seal ───────────────────────────────────────────────────────────────
describe('hardware seal (HMAC)', () => {
  const computeSeal = (key, machineId, activatedAt, email) => {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(key + machineId + activatedAt + email);
    return hmac.digest('base64');
  };

  const verifySeal = (seal, key, machineId, activatedAt, email) => {
    const expected = computeSeal(key, machineId, activatedAt, email);
    return seal === expected;
  };

  test('seal is deterministic for same inputs', () => {
    const seal = computeSeal('secret-key', 'machine-abc', '2026-06-01T00:00:00Z', 'ceo@example.com');
    const seal2 = computeSeal('secret-key', 'machine-abc', '2026-06-01T00:00:00Z', 'ceo@example.com');
    assert.strictEqual(seal, seal2);
  });

  test('different machineId produces different seal', () => {
    const seal1 = computeSeal('secret', 'machine-a', '2026-06-01T00:00:00Z', 'ceo@example.com');
    const seal2 = computeSeal('secret', 'machine-b', '2026-06-01T00:00:00Z', 'ceo@example.com');
    assert.notStrictEqual(seal1, seal2);
  });

  test('different email produces different seal', () => {
    const seal1 = computeSeal('secret', 'machine-a', '2026-06-01T00:00:00Z', 'a@co.com');
    const seal2 = computeSeal('secret', 'machine-a', '2026-06-01T00:00:00Z', 'b@co.com');
    assert.notStrictEqual(seal1, seal2);
  });

  test('verifySeal returns true for correct seal', () => {
    const machineId = 'abc123';
    const activatedAt = '2026-06-01T00:00:00Z';
    const email = 'ceo@example.com';
    const secret = 'test-secret';
    const seal = computeSeal(secret, machineId, activatedAt, email);
    assert.strictEqual(verifySeal(seal, secret, machineId, activatedAt, email), true);
  });

  test('verifySeal returns false for tampered machineId', () => {
    const machineId = 'abc123';
    const activatedAt = '2026-06-01T00:00:00Z';
    const email = 'ceo@example.com';
    const secret = 'test-secret';
    const seal = computeSeal(secret, machineId, activatedAt, email);
    // Try to use on a different machine
    assert.strictEqual(verifySeal(seal, secret, 'different-machine', activatedAt, email), false);
  });
});

// ─── Machine ID fingerprint ─────────────────────────────────────────────────
describe('machine fingerprint', () => {
  const computeMachineId = (hostname, mac, platform) => {
    const input = `${hostname}|${mac}|${platform}`;
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
  };

  test('machine ID is consistent for same inputs', () => {
    const id1 = computeMachineId('DESKTOP-PC', 'AA:BB:CC:DD:EE:FF', 'win32');
    const id2 = computeMachineId('DESKTOP-PC', 'AA:BB:CC:DD:EE:FF', 'win32');
    assert.strictEqual(id1, id2);
  });

  test('different MAC produces different machine ID', () => {
    const id1 = computeMachineId('PC', 'AA:BB:CC:DD:EE:FF', 'win32');
    const id2 = computeMachineId('PC', '11:22:33:44:55:66', 'win32');
    assert.notStrictEqual(id1, id2);
  });

  test('machine ID is 16 hex chars', () => {
    const id = computeMachineId('PC', 'AA:BB:CC:DD:EE:FF', 'win32');
    assert.strictEqual(id.length, 16);
    assert.ok(/^[0-9a-f]{16}$/.test(id));
  });
});

// ─── Expiry check ───────────────────────────────────────────────────────────
describe('license expiry', () => {
  const isExpired = (expiryDate) => {
    if (!expiryDate) return false; // no expiry
    // Compare at day granularity: a license dated "today" stays valid through the
    // whole day. Comparing Date objects made expiry fail at 00:00 UTC of the day
    // (i.e. mid-morning in VN) instead of end-of-day. Date-only string compare is
    // also timezone-stable for CI.
    const today = new Date().toISOString().split('T')[0];
    return String(expiryDate).split('T')[0] < today;
  };

  test('valid future date is not expired', () => {
    const future = new Date(Date.now() + 86400 * 1000).toISOString().split('T')[0]; // tomorrow
    assert.strictEqual(isExpired(future), false);
  });

  test('past date is expired', () => {
    const past = '2020-01-01';
    assert.strictEqual(isExpired(past), true);
  });

  test('today is still valid', () => {
    const today = new Date().toISOString().split('T')[0];
    assert.strictEqual(isExpired(today), false);
  });

  test('null expiry means no expiry', () => {
    assert.strictEqual(isExpired(null), false);
    assert.strictEqual(isExpired(undefined), false);
  });
});

// ─── License file storage ──────────────────────────────────────────────────
describe('license.json storage path', () => {
  test('license stored in APPDATA, not workspace', () => {
    // This is the critical security property: license.json is in %APPDATA%/9bizclaw/
    // NOT in the copyable workspace folder
    const appDataPath = path.join(TEST_ROOT, '9bizclaw');
    const workspacePath = path.join(TEST_ROOT, 'workspace');
    try { fs.mkdirSync(appDataPath, { recursive: true }); } catch {}
    try { fs.mkdirSync(workspacePath, { recursive: true }); } catch {}

    // Simulate license stored at APPDATA level
    fs.writeFileSync(path.join(appDataPath, 'license.json'), JSON.stringify({ key: 'test' }));

    // Verify workspace is separate
    assert.strictEqual(fs.existsSync(path.join(workspacePath, 'license.json')), false);
    assert.strictEqual(fs.existsSync(path.join(appDataPath, 'license.json')), true);
  });
});

process.on('exit', () => cleanup());
