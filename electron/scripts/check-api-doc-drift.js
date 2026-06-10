#!/usr/bin/env node
'use strict';

const {
  readText,
  walkFiles,
  collectApiHandlerRoutes,
  collectApiRefsFromText
} = require('./lib/architecture-map');

// STRICT: a documented route "exists" only if a real handler dispatches it —
// not if it merely appears as a string literal in a comment/error message.
const { exact: handlerRoutes, prefixes: handlerPrefixes } = collectApiHandlerRoutes();
const failures = [];
const warnings = [];

const files = [
  'AGENTS.md',
  'README.md',
  ...walkFiles('skills', { exts: ['.md'] }).filter(f => !f.startsWith('skills/_archived/')),
  ...walkFiles('docs', { exts: ['.md'] }).filter(f => !f.startsWith('docs/generated/') && !f.startsWith('docs/superpowers/') && !/-backlog\.md$/.test(f) && f !== 'docs/fix-history.md')
];

function routeExists(refPath) {
  const clean = refPath.replace(/\/+$/, '');
  if (handlerRoutes.has(clean)) return true;
  if (handlerPrefixes.some(pre => clean.startsWith(pre))) return true;
  if (clean.endsWith('/*')) {
    const prefix = clean.slice(0, -1);
    return [...handlerRoutes].some(route => route.startsWith(prefix)) ||
      handlerPrefixes.some(pre => pre.startsWith(prefix) || prefix.startsWith(pre));
  }
  return false;
}

for (const rel of files) {
  const text = readText(rel);
  if (!text) continue;
  if (/\/api\/workspace\/read\?path=cron-api-token\.txt/i.test(text)) {
    failures.push(`${rel}: blocked token bootstrap path /api/workspace/read?path=cron-api-token.txt`);
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\/api\/auth\/token/.test(line) && !/bot_token/.test(line) && !/(KHÔNG|KHONG|do not|don't)/i.test(line)) {
      warnings.push(`${rel}:${i + 1}: /api/auth/token mentioned without bot_token on the same line`);
    }
  }
  for (const ref of collectApiRefsFromText(rel, text)) {
    if (/\/api\/google\/\*/.test(ref.path)) continue;
    if (/\/api\/[A-Za-z0-9_-]+\/\*/.test(ref.path) && routeExists(ref.path)) continue;
    if (!routeExists(ref.path)) {
      failures.push(`${ref.source}:${ref.line}: documented API route not implemented: ${ref.path}`);
    }
  }
}

if (failures.length) {
  console.error('[api-doc-drift] FAIL');
  for (const f of failures.slice(0, 80)) console.error('  - ' + f);
  if (failures.length > 80) console.error(`  ... ${failures.length - 80} more`);
  process.exit(1);
}

console.log(`[api-doc-drift] PASS ${files.length} docs/skill file(s), ${handlerRoutes.size} handler route(s) + ${handlerPrefixes.length} prefix(es)`);
for (const w of warnings.slice(0, 10)) console.warn('[api-doc-drift] WARN ' + w);
