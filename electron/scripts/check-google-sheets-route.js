#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const googleRoutes = require(path.join(__dirname, '..', 'lib', 'google-routes'));

const t = googleRoutes._test;
const failures = [];

function assert(name, condition, detail) {
  if (!condition) failures.push(`${name}: ${detail || 'assertion failed'}`);
}

const parsed = t.normalizeSheetValues({ values: '[["Ngày","Danh mục"],["",""]]' });
assert('parse JSON values', parsed.ok && Array.isArray(parsed.values) && parsed.values.length === 2, JSON.stringify(parsed));

const invalid = t.normalizeSheetValues({ values: '[1,2,3]' });
assert('reject non-2D JSON values', invalid.ok === false, JSON.stringify(invalid));

const invalidArray = t.normalizeSheetValues({ values: ['Ngày', 'Danh mục'] });
assert('reject non-2D array values', invalidArray.ok === false, JSON.stringify(invalidArray));

assert(
  'expand single row range',
  t.fitSheetRangeToValues('Sheet1!A1:H1', [['A', 'B'], ['C', 'D']]) === 'Sheet1!A1:H2',
  t.fitSheetRangeToValues('Sheet1!A1:H1', [['A', 'B'], ['C', 'D']])
);

assert(
  'expand single cell range',
  t.fitSheetRangeToValues('Sheet1!A1', [['A', 'B', 'C'], ['D', 'E', 'F']]) === 'Sheet1!A1:C2',
  t.fitSheetRangeToValues('Sheet1!A1', [['A', 'B', 'C'], ['D', 'E', 'F']])
);

assert(
  'preserve quoted sheet prefix',
  t.fitSheetRangeToValues("'Chi tiêu'!B2", [['A', 'B'], ['C', 'D']]) === "'Chi tiêu'!B2:C3",
  t.fitSheetRangeToValues("'Chi tiêu'!B2", [['A', 'B'], ['C', 'D']])
);

assert(
  'create-formatted normalizer exported',
  typeof t.normalizeCreateFormattedPayload === 'function',
  typeof t.normalizeCreateFormattedPayload
);

if (typeof t.normalizeCreateFormattedPayload === 'function') {
  const formatted = t.normalizeCreateFormattedPayload({
    title: 'Weekly plan',
    headers: '["day","channel","caption"]',
    data: '[["Mon","Facebook","Long caption"]]',
    textColumns: '[2]',
    style: 'standard',
  });
  assert(
    'create-formatted parses JSON query arrays',
    formatted.ok &&
      Array.isArray(formatted.headers) &&
      formatted.headers.length === 3 &&
      Array.isArray(formatted.data) &&
      Array.isArray(formatted.data[0]) &&
      formatted.textColumns[0] === 'C',
    JSON.stringify(formatted)
  );

  const payloadFile = path.join(os.tmpdir(), '9bizclaw-create-formatted-payload.json');
  fs.writeFileSync(payloadFile, '\uFEFF' + JSON.stringify({
    headers: ['day', 'channel'],
    data: [['Tue', 'Zalo']],
    textColumns: ['B'],
  }), 'utf8');
  const fromFile = t.normalizeCreateFormattedPayload({
    title: 'Weekly plan',
    payloadFile,
  });
  assert(
    'create-formatted reads BOM-prefixed payloadFile',
    fromFile.ok &&
      fromFile.headers[0] === 'day' &&
      fromFile.data[0][1] === 'Zalo' &&
      fromFile.textColumns[0] === 'B',
    JSON.stringify(fromFile)
  );

  const badFormatted = t.normalizeCreateFormattedPayload({
    title: 'Bad',
    headers: '[not-json]',
  });
  assert(
    'create-formatted rejects malformed JSON headers',
    badFormatted.ok === false && /headers must be valid JSON/.test(badFormatted.error || ''),
    JSON.stringify(badFormatted)
  );
}

if (failures.length) {
  console.error('[google-sheets-route] FAIL');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}

console.log('[google-sheets-route] PASS values JSON parsing and range fitting');
