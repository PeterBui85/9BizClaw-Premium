'use strict';
/**
 * check-sacred-data-guard.js — Layer 1 Sacred Data Protection static guard.
 *
 * Scans JS/TS source for destructive fs ops whose argument text contains a
 * sacred path segment. Fails the build if such a call appears outside the
 * allowlist. WHY: catching an accidental `rmSync(... 'zalo-users' ...)` at
 * build time is cheaper than a customer losing all conversation history.
 *
 * Anti-features:
 *  - Not full taint analysis — heuristic line-proximity. Layers 2-4 cover gaps.
 *  - Only checks .js + .ts source; not generated/dist/node_modules.
 */

const fs = require('fs');
const path = require('path');

// ── Constants ────────────────────────────────────────────────────────────────

// Destructive op patterns (regex strings — compiled below)
const DESTRUCTIVE_PATTERNS = [
  /\.(rmSync|unlinkSync|rmdirSync)\s*\(/,
  /\.rm\s*\(/,
  /\.(writeFileSync|copyFileSync|cpSync)\s*\(/,
];

// Sacred segments — exact tokens that identify sacred paths.
// IMPORTANT: 'user-skills' is sacred; bare 'skills' alone is NOT.
// The guard checks for these as distinct path segments using word-boundary logic
// to avoid matching 'skills' inside 'user-skills' as a standalone sacred segment.
// Single source of truth — import from sacred-data.js so adding a sacred dir/file
// there automatically extends this guard. Hardcoding a 2nd copy here would silently
// stop protecting any newly-added sacred path (the list drifts unnoticed).
const { SACRED_SEGMENTS } = require('../lib/sacred-data');

// Files (basename) permitted to perform destructive ops on sacred paths.
// Each sacred-touching op must also carry a `// SACRED-OK` marker (warn if absent).
const ALLOWLIST = new Set([
  'customer-memory-updater.js',  // merge (append-only)
  'conversation.js',             // per-customer summary appends
  'dashboard-ipc.js',            // CEO note add/edit + factory-reset
  'sacred-data.js',              // backup/restore engine
  'backup.js',                   // manifest backups
  'ceo-memory.js',               // sole regeneration engine for CEO-MEMORY.md
  'zalo-plugin.js',              // seeds zalo-users/ + zalo-groups/ on first sync
  'zalo-history-archive.js',     // append-only raw ground-truth archive writer
]);

// Lines of context window (current + N following) to inspect for sacred segments
const CONTEXT_WINDOW = 3;

// Directories to skip when walking
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.obfuscate-backup']);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Walk a directory recursively, yielding absolute file paths.
 * Skips SKIP_DIRS. Follows no symlinks.
 */
function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

// Build a regex that matches a sacred segment as a distinct path token.
// Boundary chars: path separators, quotes (single/double/backtick), parens, commas,
// whitespace, start/end. Ensures 'skills' alone does NOT match 'user-skills'.
function buildSegmentRegex(seg) {
  // Escape special regex chars in the segment itself
  const esc = seg.replace(/[-.*+?^${}()|\\[\]]/gu, '\\$&');
  // Boundaries: path sep, quotes, parens, commas, whitespace
  const BOUNDARY = '[/\\\\\'\"()`\\s,+]';
  const B = '(?:^|' + BOUNDARY + ')';
  const BE = '(?:' + BOUNDARY + '|$)';
  return new RegExp(B + esc + BE);
}

const SEGMENT_REGEXES = SACRED_SEGMENTS.map(s => ({ seg: s, re: buildSegmentRegex(s) }));

/**
 * Returns true if the text window (multi-line string) contains any sacred segment
 * as a distinct path token.
 */
function containsSacredSegment(text) {
  return SEGMENT_REGEXES.some(({ re }) => re.test(text));
}

/**
 * Returns the matched sacred segment string, or null.
 */
function matchedSegment(text) {
  const m = SEGMENT_REGEXES.find(({ re }) => re.test(text));
  return m ? m.seg : null;
}

/**
 * Core scan function — exported for unit testing.
 *
 * @param {string} filePath  Absolute path to the file.
 * @param {string} content   File content (string).
 * @returns {{ violations: Array, warnings: Array }}
 *   violations: { file, line, op, segment } — build-failing
 *   warnings:   { file, line, op, segment } — allowlisted but missing SACRED-OK marker
 */
function scanFile(filePath, content) {
  const violations = [];
  const warnings = [];

  const basename = path.basename(filePath);
  const isAllowlisted = ALLOWLIST.has(basename);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line contains a destructive op
    const opMatch = DESTRUCTIVE_PATTERNS.find(re => re.test(line));
    if (!opMatch) continue;

    // Capture the op name for reporting
    const opNameMatch = line.match(/\.(rmSync|unlinkSync|rmdirSync|rm|writeFileSync|copyFileSync|cpSync)\s*\(/);
    const opName = opNameMatch ? opNameMatch[1] : '?';

    // Build context window: current line + next CONTEXT_WINDOW lines
    const windowLines = lines.slice(i, Math.min(i + 1 + CONTEXT_WINDOW, lines.length));
    const windowText = windowLines.join('\n');

    const seg = matchedSegment(windowText);
    if (!seg) continue; // No sacred segment in argument text — skip

    if (!isAllowlisted) {
      violations.push({ file: filePath, line: i + 1, op: opName, segment: seg });
    } else {
      // Allowlisted — check for SACRED-OK marker on same line or line above
      const prevLine = i > 0 ? lines[i - 1] : '';
      const hasSacredOk = line.includes('// SACRED-OK') || prevLine.includes('// SACRED-OK');
      if (!hasSacredOk) {
        warnings.push({ file: filePath, line: i + 1, op: opName, segment: seg });
      }
    }
  }

  return { violations, warnings };
}

// ── File collection ───────────────────────────────────────────────────────────

/**
 * Collect all source files to scan.
 * Covers: lib js files, top-level electron js, packages src ts files
 */
function collectFiles(electronDir) {
  const files = [];

  // electron/lib/**/*.js
  for (const f of walk(path.join(electronDir, 'lib'))) {
    if (f.endsWith('.js')) files.push(f);
  }

  // electron/*.js (top-level, e.g. main.js, preload.js)
  for (const e of fs.readdirSync(electronDir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.js')) {
      files.push(path.join(electronDir, e.name));
    }
  }

  // electron/packages/**/src/**/*.ts
  const pkgsDir = path.join(electronDir, 'packages');
  if (fs.existsSync(pkgsDir)) {
    for (const f of walk(pkgsDir)) {
      if (f.endsWith('.ts') && f.includes(`${path.sep}src${path.sep}`)) {
        files.push(f);
      }
    }
  }

  return files;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const electronDir = path.resolve(__dirname, '..');
  const files = collectFiles(electronDir);

  let totalViolations = 0;
  const allWarnings = [];

  for (const filePath of files) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf-8'); }
    catch { continue; }

    const { violations, warnings } = scanFile(filePath, content);

    for (const v of violations) {
      console.error(`${v.file}:${v.line}: ${v.op}() touches sacred path ('${v.segment}') — VIOLATION`);
      totalViolations++;
    }
    allWarnings.push(...warnings);
  }

  for (const w of allWarnings) {
    console.warn(`${w.file}:${w.line}: ${w.op}() touches sacred path ('${w.segment}') — missing // SACRED-OK marker [allowlisted, warn only]`);
  }

  if (totalViolations > 0) {
    console.error(`\n[sacred-data-guard] FAIL — ${totalViolations} violation(s) found in ${files.length} files scanned`);
    process.exit(1);
  } else {
    console.log(`[sacred-data-guard] OK — ${files.length} files scanned, 0 violations${allWarnings.length > 0 ? `, ${allWarnings.length} warning(s)` : ''}`);
  }
}

// Export for unit tests
module.exports = { scanFile, containsSacredSegment, SACRED_SEGMENTS, ALLOWLIST };

// Run if invoked directly
if (require.main === module) {
  main();
}
