#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
const googleSkill = fs.readFileSync(path.join(root, 'skills', 'operations', 'google-workspace.md'), 'utf8');

const failures = [];

function assert(name, condition, detail) {
  if (!condition) failures.push(`${name}: ${detail || 'assertion failed'}`);
}

assert(
  'AGENTS requires local XLSX creation before upload',
  /tạo\s+(file\s+)?`?\.xlsx`?\s+local|local\s+`?\.xlsx`?/i.test(agents) &&
    /gog\s+drive\s+upload/.test(agents) &&
    /--convert/.test(agents),
  'Sheet creation must be local XLSX then Drive upload with --convert'
);

assert(
  'Google workspace skill requires local XLSX creation before upload',
  /tạo\s+(file\s+)?`?\.xlsx`?\s+local|local\s+`?\.xlsx`?/i.test(googleSkill) &&
    /gog\s+drive\s+upload/.test(googleSkill) &&
    /--convert/.test(googleSkill),
  'Google workspace skill must teach local XLSX then Drive upload with --convert'
);

assert(
  'AGENTS no longer says create-formatted is mandatory for new Sheets',
  !/LUÔN dùng `\/api\/google\/sheets\/create-formatted`/.test(agents) &&
    !/Khi tạo Sheet mới,\s*LUÔN dùng `\/sheets\/create-formatted`/.test(agents),
  'old create-formatted-first rule is still present'
);

assert(
  'Google workspace skill keeps API for simple edits',
  /API.*(sửa|cập nhật|append|xóa).*đơn giản/i.test(googleSkill),
  'skill should route simple edits through the Google Sheets API'
);

if (failures.length) {
  console.error('[sheet-creation-policy] FAIL');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}

console.log('[sheet-creation-policy] PASS local XLSX creation policy');
