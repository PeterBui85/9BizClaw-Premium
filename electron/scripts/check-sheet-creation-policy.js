#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
const googleSkill = fs.readFileSync(path.join(root, 'skills', 'operations', 'google-workspace.md'), 'utf8');
const xlsxSkill = fs.readFileSync(path.join(root, 'skills', 'anthropic-xlsx', 'SKILL.md'), 'utf8');

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

// ── Binary-file write contract (corrupt-file regression guard) ──
// A binary Office/PDF file written through a text path (write_file or
// /api/file/write as utf-8) is corrupted. The docs MUST mandate the
// skill-runner XLSX.writeFile path and forbid the text path.
assert(
  'AGENTS hard-forbids creating binary Office/PDF via text write',
  /BẮT BUỘC qua skill-runner/i.test(agents) &&
    /HỎNG FILE/i.test(agents) &&
    /(write_file|\/api\/file\/write)/.test(agents),
  'AGENTS must forbid creating .xlsx/.docx/.pptx/.pdf via text write_file or /api/file/write'
);

assert(
  'AGENTS shows skill-runner XLSX.writeFile create recipe',
  /XLSX\.writeFile\(/.test(agents),
  'AGENTS must show XLSX.writeFile(<absolute path>) as the binary-safe create recipe'
);

assert(
  'Google workspace skill mandates skill-runner writeFile, forbids text write',
  /skill-runner/i.test(googleSkill) &&
    /XLSX\.writeFile\(/.test(googleSkill) &&
    /(write_file|\/api\/file\/write)[^\n]*(text|hỏng)/i.test(googleSkill),
  'google-workspace.md must mandate skill-runner writeFile and forbid text write'
);

assert(
  'anthropic-xlsx skill mandates binary write via skill runner, never text',
  /MANDATORY/i.test(xlsxSkill) &&
    /XLSX\.writeFile\(/.test(xlsxSkill) &&
    /never\s+(as\s+)?text|never reconstruct|write_file/i.test(xlsxSkill),
  'anthropic-xlsx SKILL.md must mandate skill-runner binary write and forbid text write'
);

if (failures.length) {
  console.error('[sheet-creation-policy] FAIL');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}

console.log('[sheet-creation-policy] PASS local XLSX creation policy');
