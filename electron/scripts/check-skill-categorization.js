'use strict';
// Guard: the CEO skill library stays consistent across its 3 hand-maintained
// surfaces — disk (`skills/*`), the SKILL_CATEGORY map (Dashboard list), and
// INDEX.md (what the bot reads to PICK a skill). Drift here ships a skill the
// bot can't find, or a duplicate/legacy entry in the CEO list. Real incidents
// this would have caught (2026-06-07): `facebook-campaign` on disk but missing
// from INDEX; legacy `excel` leaking into the list beside `anthropic-xlsx`.
// Pure — scans the repo skills/ tree directly via listShippedSkills(dir). Run
// with system node. Mirrors the other check-*.js (node:assert, per-block OK log).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const sm = require('../lib/skill-manager');

const SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');
const INDEX = fs.readFileSync(path.join(SKILLS_DIR, 'INDEX.md'), 'utf-8');

const {
  SKILL_CATEGORY, SKILL_CATEGORIES, SKILL_CATEGORY_HIDE,
  _LEGACY_SHIPPED_SKILL_PATHS, listShippedSkills,
} = sm;

// Categories that are auto-injected (shipped behavior rules) or prose-referenced
// (image templates) — intentionally NOT rows in an INDEX table.
const NON_TABLE_CATEGORIES = new Set(['Quy tắc hệ thống', 'Mẫu hình ảnh']);
const isCeoFacing = (s) => !s.id.startsWith('shipped/') && !NON_TABLE_CATEGORIES.has(s.category);

// --- A. a legacy/hidden id is NEVER also categorized (would leak or self-contradict) ---
{
  for (const id of Object.keys(SKILL_CATEGORY)) {
    assert.ok(!_LEGACY_SHIPPED_SKILL_PATHS.has(id), `legacy alias "${id}" must not be in SKILL_CATEGORY`);
    assert.ok(!SKILL_CATEGORY_HIDE.has(id), `hidden skill "${id}" must not be in SKILL_CATEGORY`);
  }
  console.log('A. no legacy/hidden id is categorized OK');
}

const skills = listShippedSkills(SKILLS_DIR);
assert.ok(skills.length > 5, `scanner found skills in repo skills/ (got ${skills.length})`);

// --- B. every CEO-facing skill buckets into one of the 5 fixed categories ---
{
  for (const s of skills.filter(isCeoFacing)) {
    assert.ok(SKILL_CATEGORIES.includes(s.category),
      `skill "${s.id}" has category "${s.category}" — not one of the 5 fixed buckets`);
  }
  console.log('B. every CEO-facing skill is in one of the 5 categories OK');
}

// --- C. every CEO-facing skill is referenced in INDEX.md (bot can find it) ---
{
  const missing = [];
  for (const s of skills.filter(isCeoFacing)) {
    const token = s.layout === 'folder' ? `${s.id}/SKILL.md` : `${s.id}.md`;
    if (!INDEX.includes(token)) missing.push(`${s.id} (${s.category})`);
  }
  assert.deepStrictEqual(missing, [], `skills on disk missing from INDEX.md: ${missing.join('; ')}`);
  console.log('C. every CEO-facing skill is referenced in INDEX OK');
}

// --- D. every .md link in INDEX.md points at a real file (no dangling links) ---
{
  const tokens = new Set();
  for (const m of INDEX.matchAll(/`([A-Za-z0-9_./-]+\.md)`/g)) tokens.add(m[1]);
  // `SKILL.md` (bare, no folder) is generic prose ("mỗi gói có SKILL.md"), not a
  // path link — a real folder-skill is always referenced as `<folder>/SKILL.md`.
  tokens.delete('SKILL.md');
  const dangling = [...tokens].filter((t) => !fs.existsSync(path.join(SKILLS_DIR, t)));
  assert.deepStrictEqual(dangling, [], `INDEX.md links to non-existent files: ${dangling.join(', ')}`);
  console.log(`D. all ${tokens.size} INDEX file links exist on disk OK`);
}

console.log('check-skill-categorization: ALL OK');
