#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const imageGen = require(path.join(__dirname, '..', 'lib', 'image-gen'));

const failures = [];

function assert(name, condition, detail) {
  if (!condition) failures.push(`${name}: ${detail || 'assertion failed'}`);
}

const t = imageGen._test || {};
assert('exports test helpers', typeof t.buildCodexRequest === 'function', 'missing buildCodexRequest');
assert('exports waitForJobResult', typeof imageGen.waitForJobResult === 'function', 'missing waitForJobResult');

const req = t.buildCodexRequest ? t.buildCodexRequest('make an ad', [], '1024x1024') : {};
assert('request uses codex model', req.model === 'cx/gpt-5.4', 'model: ' + req.model);
assert('request has input', Array.isArray(req.input) && req.input.length > 0, 'missing input array');
assert('request has image_generation tool', Array.isArray(req.tools) && req.tools.some(t => t.type === 'image_generation'), 'missing image_generation tool');

assert('can resolve connection id', typeof t.findImageConnectionId === 'function', 'missing findImageConnectionId');

assert('exports normalizeImageSize', typeof imageGen.normalizeImageSize === 'function', 'missing normalizeImageSize');
if (imageGen.normalizeImageSize) {
  assert('landscape → 1792x1024', imageGen.normalizeImageSize('landscape') === '1792x1024', imageGen.normalizeImageSize('landscape'));
  assert('portrait → 1024x1792', imageGen.normalizeImageSize('portrait') === '1024x1792', imageGen.normalizeImageSize('portrait'));
  assert('square → 1024x1024', imageGen.normalizeImageSize('square') === '1024x1024', imageGen.normalizeImageSize('square'));
  assert('ngang → 1792x1024', imageGen.normalizeImageSize('ngang') === '1792x1024', imageGen.normalizeImageSize('ngang'));
  assert('valid size passes through', imageGen.normalizeImageSize('1024x1024') === '1024x1024', imageGen.normalizeImageSize('1024x1024'));
  assert('null → 1024x1024', imageGen.normalizeImageSize(null) === '1024x1024', imageGen.normalizeImageSize(null));
  assert('garbage → 1024x1024', imageGen.normalizeImageSize('blah') === '1024x1024', imageGen.normalizeImageSize('blah'));
}

const reqLandscape = t.buildCodexRequest ? t.buildCodexRequest('test', [], 'landscape') : {};
assert('buildCodexRequest normalizes landscape', reqLandscape.tools?.[0]?.size === '1792x1024', 'size: ' + reqLandscape.tools?.[0]?.size);

const cronApiSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cron-api.js'), 'utf8');
assert('image route waits for immediate failure', cronApiSource.includes('waitForJobResult(jobId, 3000)'), 'image route does not wait for early job failure');
assert('image route returns failed status', cronApiSource.includes("status: 'failed'"), 'image route does not return failed status');
assert('image route exposes mediaId after completion', fs.readFileSync(path.join(__dirname, '..', 'lib', 'image-gen.js'), 'utf8').includes('mediaId'), 'image status does not expose mediaId for follow-up delivery');
assert('atomic image-to-zalo route exists', cronApiSource.includes('/api/image/generate-and-send-zalo'), 'missing atomic generate-and-send-zalo route');
assert('generated internal media can be sent only with explicit flag', cronApiSource.includes('allowInternalGenerated') && cronApiSource.includes("asset.type === 'generated'"), 'send-media does not gate internal generated image delivery explicitly');

if (failures.length) {
  console.error('[image-generation-route] FAIL');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}

console.log('[image-generation-route] PASS codex responses API routing and early failure handling');
