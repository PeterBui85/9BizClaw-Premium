#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  WORKSPACE_ROOT,
  buildSystemMap,
  renderSystemMapText
} = require('./lib/architecture-map');

const CHECK = process.argv.includes('--check');
const outDir = path.join(WORKSPACE_ROOT, 'docs', 'generated');
const jsonPath = path.join(outDir, 'system-map.json');
const textPath = path.join(outDir, 'system-map.txt');

function stableJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function readIfExists(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

const map = buildSystemMap();
const json = stableJson(map);
const text = renderSystemMapText(map);

if (CHECK) {
  const currentJson = readIfExists(jsonPath);
  const currentText = readIfExists(textPath);
  const stale = currentJson !== json || currentText !== text;
  if (stale) {
    console.error('[system-map] generated map is stale. Run: npm run map:generate');
    if (currentJson === null) console.error('[system-map] missing docs/generated/system-map.json');
    if (currentText === null) console.error('[system-map] missing docs/generated/system-map.txt');
    process.exit(1);
  }
  console.log(`[system-map] PASS routes=${map.counts.apiRoutes} ipc=${map.counts.ipcHandlers} capabilities=${map.counts.capabilityContracts}`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(jsonPath, json, 'utf8');
fs.writeFileSync(textPath, text, 'utf8');
console.log(`[system-map] wrote ${path.relative(WORKSPACE_ROOT, jsonPath)} and ${path.relative(WORKSPACE_ROOT, textPath)}`);
