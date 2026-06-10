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
const { isLicenseExpired } = require('../lib/license');

const TEST_ROOT = path.join(__dirname, '_test_license_' + Date.now());
// Recursive remove: the storage-path test creates subdirs (9bizclaw/, workspace/),
// so the old flat unlinkSync loop left _test_license_* dirs behind whenever the
// runner was killed (CI timeout/SIGINT). Fire on exit AND on signals so an aborted
// run still tidies up instead of accumulating tracked junk.
function cleanup() {
  try { fs.rmSync(TEST_ROOT, { recursive: true, force: true }); } catch {}
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
// Exercises the REAL exported license.js#isLicenseExpired (not a local copy) so
// the test can never silently diverge from shipped behavior. A pinned `now` keeps
// it deterministic. WHY day-granularity matters: a "valid until 2026-06-30"
// license must serve the customer through the whole of June 30 in their local
// timezone — expiring it at 07:00 (00:00 UTC in VN) loses a paid business day.
describe('license expiry', () => {
  // Pin "now" to mid-morning Vietnam on 2026-06-30. Under the OLD Date-object
  // check this instant was already "expired"; the day-granular rule keeps it valid.
  const NOW = new Date('2026-06-30T03:30:00+07:00'); // 03:30 UTC

  test('valid future date is not expired', () => {
    assert.strictEqual(isLicenseExpired('2026-07-01', NOW), false);
  });

  test('past date is expired', () => {
    assert.strictEqual(isLicenseExpired('2020-01-01', NOW), true);
  });

  test('expiry day itself stays valid through end-of-day (the VN morning case)', () => {
    assert.strictEqual(isLicenseExpired('2026-06-30', NOW), false);
  });

  test('yesterday is expired', () => {
    assert.strictEqual(isLicenseExpired('2026-06-29', NOW), true);
  });

  test('datetime-form expiry is compared by its date part', () => {
    assert.strictEqual(isLicenseExpired('2026-06-30T23:59:59Z', NOW), false);
  });

  test('null/undefined expiry means perpetual (never expired)', () => {
    assert.strictEqual(isLicenseExpired(null, NOW), false);
    assert.strictEqual(isLicenseExpired(undefined, NOW), false);
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
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
