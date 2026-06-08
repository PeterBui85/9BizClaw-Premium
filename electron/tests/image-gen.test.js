/**
 * image-gen.test.js
 * Tests for the custom-provider → codex image routing added 2026-06-08.
 * Run: node --test electron/tests/image-gen.test.js
 */
'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const imageGen = require('../lib/image-gen');
const t = imageGen._test;

// 1x1 transparent PNG — base64 starts with the iVBOR marker parseSSEForImage greps for.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function startServer(handler) {
  return new Promise(resolve => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

const servers = [];
after(() => { for (const s of servers) try { s.close(); } catch {} });

describe('codexRootFromBaseUrl', () => {
  test('strips trailing /v1 (image gen lives at root /codex/responses)', () => {
    assert.equal(t.codexRootFromBaseUrl('https://host/v1'), 'https://host');
    assert.equal(t.codexRootFromBaseUrl('https://host/v1/'), 'https://host');
  });
  test('leaves a root base untouched', () => {
    assert.equal(t.codexRootFromBaseUrl('http://127.0.0.1:20128'), 'http://127.0.0.1:20128');
    assert.equal(t.codexRootFromBaseUrl('http://127.0.0.1:20128/'), 'http://127.0.0.1:20128');
  });
});

describe('buildCodexRequest stream option', () => {
  test('defaults to stream:true (local SSE path unchanged)', () => {
    assert.equal(t.buildCodexRequest('prompt here', [], '1024x1024').stream, true);
  });
  test('honors stream:false for the remote tunnel path', () => {
    assert.equal(t.buildCodexRequest('prompt here', [], '1024x1024', { stream: false }).stream, false);
  });
});

describe('callCodexEndpoint', () => {
  test('POSTs to <root>/codex/responses, sends Bearer, returns decoded PNG', async () => {
    let seen = null;
    const { srv, port } = await startServer((req, res) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        seen = { url: req.url, auth: req.headers['authorization'], conn: req.headers['x-connection-id'], body };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: PNG_B64 }] }));
      });
    });
    servers.push(srv);

    const buf = await t.callCodexEndpoint(
      { rootBase: `http://127.0.0.1:${port}`, apiKey: 'sk-test-key' },
      t.buildCodexRequest('a detailed prompt for the model', [], '1024x1024', { stream: false })
    );

    assert.ok(Buffer.isBuffer(buf) && buf.length > 0, 'returns a PNG buffer');
    assert.deepEqual(buf, Buffer.from(PNG_B64, 'base64'), 'buffer matches decoded base64');
    assert.equal(seen.url, '/codex/responses', 'hits the codex responses route at root, not /v1');
    assert.equal(seen.auth, 'Bearer sk-test-key', 'forwards the provider key');
    assert.equal(seen.conn, undefined, 'omits x-connection-id for the remote path');
  });

  test('includes x-connection-id only when a connection id is given (local path)', async () => {
    let conn = 'MISSING';
    const { srv, port } = await startServer((req, res) => {
      conn = req.headers['x-connection-id'] || null;
      res.writeHead(200);
      res.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: PNG_B64 }] }));
    });
    servers.push(srv);
    await t.callCodexEndpoint(
      { rootBase: `http://127.0.0.1:${port}`, apiKey: 'k', connectionId: 'conn-123' },
      t.buildCodexRequest('a detailed prompt for the model', [], '1024x1024', { stream: false })
    );
    assert.equal(conn, 'conn-123');
  });

  test('rejects on non-200', async () => {
    const { srv, port } = await startServer((req, res) => { res.writeHead(401); res.end('{"error":{"message":"Missing API key"}}'); });
    servers.push(srv);
    await assert.rejects(
      () => t.callCodexEndpoint({ rootBase: `http://127.0.0.1:${port}`, apiKey: 'k' }, t.buildCodexRequest('a detailed prompt for the model', [], '1024x1024')),
      /9router 401/
    );
  });
});

describe('probeIs9RouterImageProvider', () => {
  test('true when /v1/models lists a cx/* model', async () => {
    const { srv, port } = await startServer((req, res) => {
      assert.equal(req.url, '/v1/models');
      res.writeHead(200);
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'cx/gpt-5.4' }, { id: 'cx/gpt-5.5' }] }));
    });
    servers.push(srv);
    assert.equal(await t.probeIs9RouterImageProvider(`http://127.0.0.1:${port}/v1`, 'k'), true);
  });

  test('false when no cx/* model (not a 9router → skip to codex)', async () => {
    const { srv, port } = await startServer((req, res) => {
      res.writeHead(200);
      res.end(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'llama-3' }] }));
    });
    servers.push(srv);
    assert.equal(await t.probeIs9RouterImageProvider(`http://127.0.0.1:${port}/v1`, 'k'), false);
  });

  test('false on connection error (unreachable provider)', async () => {
    // Port 1 is not listening; probe must resolve false, never throw.
    assert.equal(await t.probeIs9RouterImageProvider('http://127.0.0.1:1/v1', 'k'), false);
  });
});

describe('parseSSEForImage — stream:false (tunnel) bodies', () => {
  test('extracts PNG from a non-SSE full response object', () => {
    const body = JSON.stringify({ status: 'completed', output: [{ type: 'image_generation_call', result: PNG_B64 }] });
    assert.deepEqual(t.parseSSEForImage(body), Buffer.from(PNG_B64, 'base64'));
  });
  test('throws with _isContentPolicy on an incomplete content-policy body (not "No image")', () => {
    const body = JSON.stringify({ status: 'incomplete', status_details: { reason: 'content_policy_violation' } });
    try { t.parseSSEForImage(body); assert.fail('should have thrown'); }
    catch (e) { assert.match(e.message, /content_policy_violation/); assert.equal(e._isContentPolicy, true); }
  });
  test('throws a real error (not policy) on a generic error body', () => {
    const body = JSON.stringify({ error: { message: 'rate limit exceeded' } });
    try { t.parseSSEForImage(body); assert.fail('should have thrown'); }
    catch (e) { assert.match(e.message, /rate limit/); assert.equal(e._isContentPolicy, false); }
  });
  test('still parses SSE (stream:true) success events', () => {
    const sse = `event: x\ndata: ${JSON.stringify({ type: 'response.output_item.done', item: { type: 'image_generation_call', result: PNG_B64 } })}\n\n`;
    assert.deepEqual(t.parseSSEForImage(sse), Buffer.from(PNG_B64, 'base64'));
  });
});

describe('callCodexAPIWithFallback — resolution order', () => {
  const PNG = Buffer.from(PNG_B64, 'base64');
  const baseDeps = () => ({
    readCustom: () => null,
    probe: async () => false,
    callEndpoint: async () => { throw new Error('callEndpoint should not run'); },
    findAll: () => ({ primary: [], free: [] }),
    findApi: async () => [],
    callLocal: async () => { throw new Error('callLocal should not run'); },
  });

  test('custom provider succeeds → codex never touched', async () => {
    let localCalled = false;
    const d = { ...baseDeps(),
      readCustom: () => ({ baseUrl: 'https://h/v1', apiKey: 'k', name: 'modoro' }),
      probe: async () => true,
      callEndpoint: async () => PNG,
      callLocal: async () => { localCalled = true; throw new Error('x'); },
    };
    assert.deepEqual(await t.callCodexAPIWithFallback('a long enough prompt here', [], '1024x1024', d), PNG);
    assert.equal(localCalled, false);
  });

  test('custom content-policy refusal → throws, does NOT retry on codex', async () => {
    let localCalled = false;
    const policyErr = Object.assign(new Error('blocked by safety'), { _isContentPolicy: true });
    const d = { ...baseDeps(),
      readCustom: () => ({ baseUrl: 'https://h/v1', apiKey: 'k', name: 'modoro' }),
      probe: async () => true,
      callEndpoint: async () => { throw policyErr; },
      findAll: () => ({ primary: ['c1'], free: [] }),
      callLocal: async () => { localCalled = true; return PNG; },
    };
    await assert.rejects(() => t.callCodexAPIWithFallback('a long enough prompt here', [], '1024x1024', d), /blocked by safety/);
    assert.equal(localCalled, false);
  });

  test('custom non-policy failure → falls back to local codex', async () => {
    const d = { ...baseDeps(),
      readCustom: () => ({ baseUrl: 'https://h/v1', apiKey: 'k', name: 'modoro' }),
      probe: async () => true,
      callEndpoint: async () => { throw new Error('502 bad gateway'); },
      findAll: () => ({ primary: ['c1'], free: [] }),
      callLocal: async () => PNG,
    };
    assert.deepEqual(await t.callCodexAPIWithFallback('a long enough prompt here', [], '1024x1024', d), PNG);
  });

  test('custom provider not a 9router (probe false) → skips to codex', async () => {
    let endpointCalled = false;
    const d = { ...baseDeps(),
      readCustom: () => ({ baseUrl: 'https://h/v1', apiKey: 'k', name: 'groq' }),
      probe: async () => false,
      callEndpoint: async () => { endpointCalled = true; return PNG; },
      findAll: () => ({ primary: ['c1'], free: [] }),
      callLocal: async () => PNG,
    };
    assert.deepEqual(await t.callCodexAPIWithFallback('a long enough prompt here', [], '1024x1024', d), PNG);
    assert.equal(endpointCalled, false);
  });

  test('no custom + no codex → throws ChatGPT-Plus-required error', async () => {
    await assert.rejects(
      () => t.callCodexAPIWithFallback('a long enough prompt here', [], '1024x1024', baseDeps()),
      /ChatGPT Plus/
    );
  });

  test('custom fails + no codex → surfaces capped custom error', async () => {
    const longMsg = 'x'.repeat(400);
    const d = { ...baseDeps(),
      readCustom: () => ({ baseUrl: 'https://h/v1', apiKey: 'k', name: 'modoro' }),
      probe: async () => true,
      callEndpoint: async () => { throw new Error(longMsg); },
    };
    try { await t.callCodexAPIWithFallback('a long enough prompt here', [], '1024x1024', d); assert.fail('should throw'); }
    catch (e) {
      assert.match(e.message, /Custom provider tạo ảnh lỗi/);
      assert.ok(e.message.length < 300, 'upstream message is capped, not echoed in full: ' + e.message.length);
    }
  });
});
