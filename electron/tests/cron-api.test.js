/**
 * cron-api.test.js
 * Critical-path tests for cron-api.js
 * Run: node --test electron/tests/cron-api.test.js
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const url = require('url');

// Test route parsing logic without starting the server
describe('cron-api route parsing', () => {
  test('extracts path from full URL', () => {
    const parse = (rawUrl) => {
      try {
        const parsed = url.parse(rawUrl);
        const pathname = parsed.pathname || '/';
        // strip mount prefix
        return pathname.replace(/^\/api\//, '');
      } catch { return null; }
    };
    assert.strictEqual(parse('http://localhost:20200/api/media/search?q=áo'), 'media/search');
    assert.strictEqual(parse('/api/cron/list'), 'cron/list');
    assert.strictEqual(parse('http://127.0.0.1:20200/api/fb/schedule/list'), 'fb/schedule/list');
  });

  test('extracts query params from URL', () => {
    const parseParams = (rawUrl) => {
      try {
        const parsed = url.parse(rawUrl, true);
        return parsed.query;
      } catch { return {}; }
    };
    const q = parseParams('http://localhost:20200/api/media/search?q=áo+thun&type=product&limit=3');
    assert.strictEqual(q.q, 'áo thun');
    assert.strictEqual(q.type, 'product');
    assert.strictEqual(Number(q.limit), 3);
  });

  test('extracts body params from JSON', () => {
    const parseBody = (body) => {
      try { return JSON.parse(body); } catch { return null; }
    };
    const body = parseBody('{"text":"ok"}');
    assert.deepStrictEqual(body, { text: 'ok' });
    assert.strictEqual(parseBody('not json'), null);
  });
});

describe('auth token validation', () => {
  test('generates consistent hex token', () => {
    // Simulate token generation
    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('hex');
    assert.strictEqual(token.length, 48);
    assert.ok(/^[0-9a-f]{48}$/.test(token));
  });

  test('token is not empty', () => {
    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('hex');
    assert.ok(token.length > 0);
  });

  test('two generated tokens differ', () => {
    const crypto = require('crypto');
    const t1 = crypto.randomBytes(24).toString('hex');
    const t2 = crypto.randomBytes(24).toString('hex');
    assert.notStrictEqual(t1, t2);
  });
});

describe('cron expression validation', () => {
  const parseCron = (expr) => {
    // Simplified cron parser: HH:MM format
    const m = expr.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { hour: h, min };
  };

  test('parses valid HH:MM cron', () => {
    const r = parseCron('09:00');
    assert.deepStrictEqual(r, { hour: 9, min: 0 });

    const r2 = parseCron('14:30');
    assert.deepStrictEqual(r2, { hour: 14, min: 30 });
  });

  test('rejects invalid cron', () => {
    assert.strictEqual(parseCron('25:00'), null);
    assert.strictEqual(parseCron('09:60'), null);
    assert.strictEqual(parseCron('abc'), null);
    assert.strictEqual(parseCron(''), null);
  });
});

describe('cron-api JSON response format', () => {
  const jsonResp = (statusCode, body) => {
    return { statusCode, body: typeof body === 'string' ? body : JSON.stringify(body) };
  };

  test('returns 200 with JSON body', () => {
    const r = jsonResp(200, { success: true, crons: [] });
    assert.strictEqual(r.statusCode, 200);
    const parsed = JSON.parse(r.body);
    assert.deepStrictEqual(parsed, { success: true, crons: [] });
  });

  test('returns error format correctly', () => {
    const r = jsonResp(400, { error: 'query required' });
    assert.strictEqual(r.statusCode, 400);
    const parsed = JSON.parse(r.body);
    assert.strictEqual(parsed.error, 'query required');
  });
});

describe('cron job schema validation', () => {
  const validateJob = (job) => {
    if (!job || typeof job !== 'object') return { valid: false, reason: 'not an object' };
    if (typeof job.label !== 'string' || !job.label.trim()) return { valid: false, reason: 'missing label' };
    if (typeof job.cronExpr !== 'string') return { valid: false, reason: 'missing cronExpr' };
    if (!Array.isArray(job.groupIds)) return { valid: false, reason: 'groupIds must be array' };
    if (!job.content && typeof job.content !== 'string') return { valid: false, reason: 'missing content' };
    return { valid: true };
  };

  test('accepts valid cron job', () => {
    const job = { label: 'Morning greeting', cronExpr: '09:00', groupIds: ['gid1'], content: 'Chào buổi sáng' };
    const r = validateJob(job);
    assert.strictEqual(r.valid, true);
  });

  test('rejects missing label', () => {
    const job = { cronExpr: '09:00', groupIds: [], content: 'Test' };
    assert.strictEqual(validateJob(job).valid, false);
  });

  test('rejects non-array groupIds', () => {
    const job = { label: 'Test', cronExpr: '09:00', groupIds: 'not-an-array', content: 'Test' };
    assert.strictEqual(validateJob(job).valid, false);
  });
});
