#!/usr/bin/env node
'use strict';
// Guard: the Zalo customer image-send (Approach Y, 2026-06-08) stays wired the
// way the design requires — agent emits a [[GUI_ANH: ...]] marker, the PLUGIN
// (trusted server code) searches via the audited cron-API guard and sends to the
// current conversation. No new agent-facing auth surface; marker never leaks.
// Source-pattern guard (reads files as text, like check-zalo-listener-recovery.js).

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const mz = 'packages/modoro-zalo/src';

const failures = [];
const need = (cond, msg) => { if (!cond) failures.push(msg); };

// --- image-marker.ts: pure parser, no IO import ---
let marker = '';
try { marker = read(`${mz}/image-marker.ts`); } catch { failures.push('image-marker.ts missing'); }
need(/export function parseImageMarker\s*\(/.test(marker), 'image-marker.ts must export parseImageMarker');
need(/export const MAX_CUSTOMER_IMAGES\s*=\s*10\b/.test(marker), 'MAX_CUSTOMER_IMAGES must be 10');
need(!/from\s+["']\.\/send/.test(marker), 'image-marker.ts must NOT import from ./send (keep it pure for the unit test)');

// --- image-send.ts: IO orchestration + guards ---
let isend = '';
try { isend = read(`${mz}/image-send.ts`); } catch { failures.push('image-send.ts missing'); }
need(/export async function deliverCustomerImages\s*\(/.test(isend), 'image-send.ts must export deliverCustomerImages');
need(/audience=customer/.test(isend), 'image-send.ts must use audience=customer (the public/product guard)');
need(/cron-api-token\.txt/.test(isend), 'image-send.ts must read the cron-api token from disk');
need(!/[a-f0-9]{40,}/.test(isend), 'image-send.ts must NOT contain a hardcoded token literal');
need(/media-assets/.test(isend) && /relPath/.test(isend), 'image-send.ts must contain the media-assets relPath containment guard');
need(/sendMediaModoroZalo\s*\(/.test(isend), 'image-send.ts must send via sendMediaModoroZalo (plugin session, not cron-api)');
// The cron-API gate only admits the telegram+Bearer pair for the s2s call;
// changing this header to "zalo" would 403 (the bug Approach Y routes around).
need(/X-Source-Channel[^\n]*telegram/i.test(isend), 'image-send.ts must send X-Source-Channel: telegram for the trusted s2s call (do NOT change to zalo → 403)');

// --- inbound.ts wiring ---
let inbound = '';
try { inbound = read(`${mz}/inbound.ts`); } catch { failures.push('inbound.ts missing'); }
need(/from\s+["']\.\/image-marker\.js["']/.test(inbound), 'inbound.ts must import from ./image-marker.js');
need(/from\s+["']\.\/image-send\.js["']/.test(inbound), 'inbound.ts must import from ./image-send.js');
need(/parseImageMarker\s*\(/.test(inbound), 'inbound.ts must call parseImageMarker');
need(/deliverCustomerImages\s*\(/.test(inbound), 'inbound.ts must call deliverCustomerImages');

// --- output-filter safety net in BOTH mirrors ---
// Assert the actual STRIP call (.replace(... GUI_ANH ...)), not just a mention —
// a comment referencing GUI_ANH while the strip line is deleted must NOT pass.
need(/\.replace\([^;\n]*GUI_ANH/.test(read(`${mz}/send.ts`)), 'send.ts must STRIP the GUI_ANH marker via .replace (mirror 1)');
need(/\.replace\([^;\n]*GUI_ANH/.test(read('lib/channels.js')), 'channels.js must STRIP the GUI_ANH marker via .replace (mirror 2)');

// --- fork version in sync (zalo-plugin.js vs .fork-version) ---
const forkFile = read(`${mz}/.fork-version`).trim();
const zp = read('lib/zalo-plugin.js');
const m = zp.match(/MODORO_ZALO_FORK_VERSION\s*=\s*['"]([^'"]+)['"]/);
need(m && m[1] === forkFile, `fork version mismatch: zalo-plugin.js=${m && m[1]} vs .fork-version=${forkFile}`);

if (failures.length) {
  console.error('[zalo-image-marker] FAIL');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('[zalo-image-marker] PASS customer image-send marker wired (plugin-side, no auth hole, marker stripped)');
