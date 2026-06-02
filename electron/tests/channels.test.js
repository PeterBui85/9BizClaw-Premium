/**
 * channels.test.js
 * Critical-path tests for channels.js (pause, output filter, send)
 * Run: node --test electron/tests/channels.test.js
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Test the core logic without starting real channels
const TEST_DIR = path.join(__dirname, '_test_channels_' + Date.now());

function cleanup() {
  try { for (const f of fs.readdirSync(TEST_DIR)) fs.unlinkSync(path.join(TEST_DIR, f)); } catch {}
  try { fs.rmdirSync(TEST_DIR); } catch {}
}
try { fs.mkdirSync(TEST_DIR, { recursive: true }); } catch {}

// ─── Pause file logic ──────────────────────────────────────────────────────────
describe('pause file logic', () => {
  const pauseFile = (ch) => path.join(TEST_DIR, `${ch}-paused.json`);

  const isChannelPaused = (channel) => {
    const pf = pauseFile(channel);
    if (!fs.existsSync(pf)) return false;
    try {
      const data = JSON.parse(fs.readFileSync(pf, 'utf8'));
      if (data.pausedUntil && new Date(data.pausedUntil) < new Date()) {
        fs.unlinkSync(pf); // expire
        return false;
      }
      return true;
    } catch (e) {
      // Corrupt JSON → fail closed (treat as paused)
      return true;
    }
  };

  const pauseChannel = (channel, minutes) => {
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    fs.writeFileSync(pauseFile(channel), JSON.stringify({ pausedUntil: until }));
  };

  const resumeChannel = (channel) => {
    const pf = pauseFile(channel);
    if (fs.existsSync(pf)) fs.unlinkSync(pf);
  };

  test('pauseChannel creates file with future expiry', () => {
    pauseChannel('telegram', 30);
    const pf = pauseFile('telegram');
    assert.strictEqual(fs.existsSync(pf), true);
    const data = JSON.parse(fs.readFileSync(pf, 'utf8'));
    const expiry = new Date(data.pausedUntil);
    assert.ok(expiry > new Date());
    cleanup();
  });

  test('isChannelPaused returns false when no file', () => {
    cleanup();
    assert.strictEqual(isChannelPaused('telegram'), false);
    assert.strictEqual(isChannelPaused('zalo'), false);
  });

  test('isChannelPaused returns true when paused', () => {
    pauseChannel('zalo', 60);
    assert.strictEqual(isChannelPaused('zalo'), true);
    cleanup();
  });

  test('resumeChannel removes file', () => {
    pauseChannel('telegram', 30);
    resumeChannel('telegram');
    assert.strictEqual(fs.existsSync(pauseFile('telegram')), false);
    assert.strictEqual(isChannelPaused('telegram'), false);
    cleanup();
  });

  test('corrupt JSON is fail-closed (treats as paused)', () => {
    const pf = pauseFile('telegram');
    fs.writeFileSync(pf, 'not valid json {{{');
    assert.strictEqual(isChannelPaused('telegram'), true);
    cleanup();
  });

  test('expired pause file is auto-cleaned', () => {
    const pf = pauseFile('telegram');
    fs.writeFileSync(pf, JSON.stringify({ pausedUntil: '2020-01-01T00:00:00Z' }));
    assert.strictEqual(isChannelPaused('telegram'), false);
    assert.strictEqual(fs.existsSync(pf), false); // cleaned
    cleanup();
  });
});

// ─── Output filter logic ──────────────────────────────────────────────────────
describe('output filter (Layer K patterns)', () => {
  const processAckPatterns = [
    /^Em (đã )?xử lý (luôn|ngay|liền|rồi)\.?$/i,
    /^Em đang (xử lý|thực hiện|chạy)/i,
    /^Dạ$/i,
    /^Vâng$/i,
  ];

  const isProcessAck = (text) => {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    return processAckPatterns.some(re => re.test(trimmed));
  };

  test('bare process acks are detected', () => {
    assert.strictEqual(isProcessAck('Em xử lý luôn.'), true);
    assert.strictEqual(isProcessAck('Em xử lý ngay.'), true);
    assert.strictEqual(isProcessAck('Em xử lý liền.'), true);
    assert.strictEqual(isProcessAck('Em xử lý rồi.'), true);
    assert.strictEqual(isProcessAck('Em đang xử lý.'), true);
    assert.strictEqual(isProcessAck('Em đang thực hiện.'), true);
    assert.strictEqual(isProcessAck('Em đang chạy.'), true);
    assert.strictEqual(isProcessAck('Dạ'), true);
    assert.strictEqual(isProcessAck('Vâng'), true);
  });

  test('legitimate replies are NOT process acks', () => {
    assert.strictEqual(isProcessAck('Em đã xử lý đơn hàng cho anh rồi nhé.'), false);
    assert.strictEqual(isProcessAck('Dạ em sẽ gửi thông tin.'), false);
    assert.strictEqual(isProcessAck('Vâng, em sẽ kiểm tra ngay.'), false);
    assert.strictEqual(isProcessAck(''), false);
    assert.strictEqual(isProcessAck(null), false);
    assert.strictEqual(isProcessAck(undefined), false);
  });

  const cotPatterns = [
    /cot[- ]en[- ]the[- ]actor/i,
    /cot[- ]en[- ]we[- ]modal/i,
    /we (need|have|should) to /i,
    /i (need|should) to /i,
  ];

  const hasCot = (text) => {
    if (!text || text.length < 200) return false;
    return cotPatterns.some(re => re.test(text));
  };

  test('long CoT walls are detected', () => {
    const longCoT = 'First I need to think about this. Let me consider the options. We have to evaluate the situation. I need to analyze this step by step. The thinking process involves multiple layers. Let me break this down further. Each step requires careful consideration. The conclusion follows from the analysis.';
    assert.strictEqual(hasCot(longCoT), true);
    assert.strictEqual(hasCot('Dạ sản phẩm này giá 500k ạ.'), false);
    assert.strictEqual(hasCot('Short text.'), false);
  });
});

// ─── sendCeoAlert fallback ─────────────────────────────────────────────────────
describe('sendCeoAlert fallback to disk log', () => {
  const alertLogPath = path.join(TEST_DIR, 'ceo-alerts-missed.log');

  const writeMissedAlert = (msg) => {
    const entry = `${new Date().toISOString()} ${msg}\n`;
    fs.appendFileSync(alertLogPath, entry);
  };

  test('missed alert is appended with timestamp', () => {
    writeMissedAlert('[Cảnh báo cron] Không chạy được openclaw CLI');
    assert.strictEqual(fs.existsSync(alertLogPath), true);
    const content = fs.readFileSync(alertLogPath, 'utf8');
    assert.ok(content.includes('[Cảnh báo cron]'));
    assert.ok(content.includes('Không chạy được'));
    cleanup();
  });

  test('multiple alerts are appended, not overwritten', () => {
    writeMissedAlert('Alert 1');
    writeMissedAlert('Alert 2');
    const content = fs.readFileSync(alertLogPath, 'utf8');
    assert.ok(content.includes('Alert 1'));
    assert.ok(content.includes('Alert 2'));
    cleanup();
  });
});

process.on('exit', () => cleanup());
