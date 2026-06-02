/**
 * electron/scripts/generate-rules-routing.js
 *
 * Scans all skill files under skills/ (excluding _archived/ and legacy
 * shipped paths already handled by SHIPPED_DOMAIN_SKILLS). Extracts
 * <!-- trigger: "phrase", ... --> and <!-- trigger-base: "keyword" -->
 * comments. Returns routing data for auto-generating AGENTS.md router table.
 *
 * Usage:
 *   node electron/scripts/generate-rules-routing.js
 *   const { scanSkills } = require('./electron/scripts/generate-rules-routing');
 *   const routes = scanSkills('/path/to/skills');
 *   // routes = [{ file, triggers, triggerBase }]
 */
'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Extract trigger arrays from a skill file's HTML comment markers.
 * Handles both single-line and multi-line comment styles.
 */
function extractTriggers(content) {
  const triggers = [];
  const triggerBase = [];

  // <!-- trigger: "foo", "bar", ... -->
  const triggerRe = /<!--\s*trigger:\s*["']([^"']+)["'\s,]*(?:,\s*["']([^"']+)["']\s*)*\s*-->/gi;
  let m;
  while ((m = triggerRe.exec(content)) !== null) {
    // m[0] = full match, m[1..] = capture groups
    for (let i = 1; i < m.length; i++) {
      if (m[i]) triggers.push(m[i].trim());
    }
  }

  // <!-- trigger-base: "foo" -->  (catch-all keywords)
  const baseRe = /<!--\s*trigger-base:\s*["']([^"']+)["']\s*(?:,\s*["']([^"']+)["']\s*)*\s*-->/gi;
  while ((m = baseRe.exec(content)) !== null) {
    for (let i = 1; i < m.length; i++) {
      if (m[i]) triggerBase.push(m[i].trim());
    }
  }

  return { triggers, triggerBase };
}

/**
 * Scan a skills directory recursively. Returns routing entries.
 * @param {string} skillsDir - Root skills/ directory
 * @param {string} prefix - Relative path prefix for nested skills
 * @returns {{ file: string, triggers: string[], triggerBase: string[], skillId: string }[]}
 */
function scanSkills(skillsDir, prefix = '') {
  const results = [];
  if (!fs.existsSync(skillsDir)) return results;

  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name === '_archived') continue;
    if (entry.name === '_registry.json') continue;
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(skillsDir, entry.name);
    const relPrefix = prefix ? `${prefix}/` : '';

    if (entry.isDirectory()) {
      // Anthropic folder skill: <dir>/SKILL.md
      const skillMd = path.join(fullPath, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        const content = fs.readFileSync(skillMd, 'utf-8');
        const { triggers, triggerBase } = extractTriggers(content);
        if (triggers.length > 0 || triggerBase.length > 0) {
          results.push({
            file: `skills/${relPrefix}${entry.name}/SKILL.md`,
            skillId: `${relPrefix}${entry.name}`,
            triggers,
            triggerBase,
          });
        }
      } else {
        // Recurse into subdirectory
        results.push(...scanSkills(fullPath, `${relPrefix}${entry.name}`));
      }
    } else if (entry.name.endsWith('.md') && entry.name !== 'INDEX.md') {
      // Flat .md skill
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { triggers, triggerBase } = extractTriggers(content);
      if (triggers.length > 0 || triggerBase.length > 0) {
        results.push({
          file: `skills/${relPrefix}${entry.name}`,
          skillId: `${relPrefix}${entry.name}`.replace(/\.md$/, ''),
          triggers,
          triggerBase,
        });
      }
    }
  }

  return results;
}

/**
 * Generate the AGENTS.md routing table section as markdown.
 */
function generateRoutingTable(skillsDir) {
  const routes = scanSkills(skillsDir);
  if (routes.length === 0) return '';

  const rows = routes.map(r => {
    const allTriggers = [...r.triggers, ...r.triggerBase].map(t => `"${t}"`).join(', ');
    return `| ${allTriggers} | \`${r.skillId}\` | — |`;
  });

  return `## Capability Router — AUTO-GENERATED (do not edit manually)\n\n` +
    `| Trigger keywords | Skill | Notes |\n` +
    `|---|---|---|\n` +
    rows.join('\n');
}

// CLI mode: print routing table
if (require.main === module) {
  const skillsDir = path.join(__dirname, '..', '..', 'skills');
  const table = generateRoutingTable(skillsDir);
  if (table) {
    console.log(table);
  } else {
    console.error('[generate-rules-routing] No triggers found in skills/');
    process.exit(1);
  }
}

module.exports = { scanSkills, extractTriggers, generateRoutingTable };
