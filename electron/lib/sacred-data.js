'use strict';
// Single source of truth for irreplaceable CEO/customer-generated data.
// Layer 1 of Sacred Data Protection — see docs/superpowers/specs/2026-06-04-sacred-data-protection-design.md

const SACRED_DIRS = [
  'memory/zalo-users', 'memory/zalo-groups',
  'memory/whatsapp-users', 'memory/whatsapp-groups',
  'user-skills',
];

const SACRED_FILES = [
  'CEO-MEMORY.md', 'so-sach.md', 'cong-no.md',
  'schedules.json', 'custom-crons.json',
  'zalo-blocklist.json', 'zalo-allowlist.json',
  'user-skills/_registry.json',
];

// Leaf segments used by the static guard to spot sacred paths in fs-op arguments.
// IMPORTANT: 'user-skills' is a segment; bare 'skills' is NOT — avoid false matches.
const SACRED_SEGMENTS = [
  'zalo-users', 'zalo-groups',
  'whatsapp-users', 'whatsapp-groups',
  'user-skills',
  'CEO-MEMORY.md', 'so-sach.md', 'cong-no.md',
];

/**
 * Returns true if relPath refers to a sacred directory or file.
 * relPath is workspace-relative (forward slashes).
 */
function isSacredPath(relPath) {
  const p = String(relPath || '').replace(/\\/g, '/');
  return (
    SACRED_DIRS.some(d => p === d || p.startsWith(d + '/')) ||
    SACRED_FILES.includes(p)
  );
}

module.exports = { SACRED_DIRS, SACRED_FILES, SACRED_SEGMENTS, isSacredPath };
