#!/usr/bin/env node
'use strict';
// Capability verification harness — proves the bot's critical capabilities work.
//
// Two layers, by cost:
//   1. Document engine (docx/xlsx/pptx/pdf) — runs the bundled libraries directly.
//      No app, no network, no auth. Always runnable.
//   2. Integration plumbing — probes the LIVE local API (port 20200) with the
//      CEO token, verifying file-read / Facebook / Google / Zalo wiring + auth.
//      Needs 9BizClaw running (pass --launch to start it + wait). No Telegram, no LLM.
//
// Anti-feature (deliberately NOT covered): LLM routing end-to-end ("does the bot
// turn 'tạo báo giá' into docx→Drive"). That needs the Telegram test-user script
// or a human — it is not something this harness can prove autonomously.
//
// Usage: node scripts/verify-capabilities.js [--launch]

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');           // electron/
const LIB_BASES = [path.join(ROOT, 'node_modules'), path.join(ROOT, 'vendor', 'node_modules')];
const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const WORKSPACE = path.join(APPDATA, '9bizclaw');
const PORT = 20200;
const rows = [];
function row(cap, status, detail) { rows.push({ cap, status, detail }); }

function resolveLib(name) {
  for (const base of LIB_BASES) {
    const p = path.join(base, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
function magicOf(p) {
  const b = fs.readFileSync(p).subarray(0, 4);
  return { zip: b[0] === 0x50 && b[1] === 0x4b, pdf: b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46, size: fs.statSync(p).size };
}

async function checkDocs() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capcheck-'));
  try {
    // PDF (pdfkit — runtime/vendor)
    try {
      const lib = resolveLib('pdfkit'); if (!lib) throw new Error('pdfkit not installed (vendor)');
      const PDFDocument = require(lib);
      const f = path.join(tmp, 't.pdf');
      await new Promise((res, rej) => { const d = new PDFDocument(); const s = fs.createWriteStream(f); d.pipe(s); d.fontSize(16).text('9BizClaw verify — báo giá'); d.end(); s.on('finish', res); s.on('error', rej); });
      const m = magicOf(f); row('PDF (pdfkit)', m.pdf ? 'PASS' : 'FAIL', m.pdf ? `%PDF, ${m.size}B` : 'bad magic');
    } catch (e) { row('PDF (pdfkit)', 'FAIL', e.message); }
    // DOCX
    try {
      const lib = resolveLib('docx'); if (!lib) throw new Error('docx not installed');
      const { Document, Packer, Paragraph, TextRun } = require(lib);
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun('Hợp đồng — tiếng Việt có dấu')] })] }] });
      const f = path.join(tmp, 't.docx'); fs.writeFileSync(f, await Packer.toBuffer(doc));
      const m = magicOf(f); row('DOCX (docx)', m.zip ? 'PASS' : 'FAIL', m.zip ? `zip, ${m.size}B` : 'bad magic');
    } catch (e) { row('DOCX (docx)', 'FAIL', e.message); }
    // XLSX
    try {
      const lib = resolveLib('xlsx'); if (!lib) throw new Error('xlsx not installed');
      const XLSX = require(lib);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['SP', 'Giá'], ['Cà phê', 25000]]), 'G');
      const f = path.join(tmp, 't.xlsx'); XLSX.writeFile(wb, f);
      const m = magicOf(f); row('XLSX (xlsx)', m.zip ? 'PASS' : 'FAIL', m.zip ? `zip, ${m.size}B` : 'bad magic');
    } catch (e) { row('XLSX (xlsx)', 'FAIL', e.message); }
    // PPTX
    try {
      const lib = resolveLib('pptxgenjs'); if (!lib) throw new Error('pptxgenjs not installed');
      const pptxgen = require(lib);
      const pres = new pptxgen(); pres.addSlide().addText('Pitch — 9BizClaw', { x: 1, y: 1, fontSize: 24 });
      const f = path.join(tmp, 't.pptx'); await pres.writeFile({ fileName: f });
      const m = magicOf(f); row('PPTX (pptxgenjs)', m.zip ? 'PASS' : 'FAIL', m.zip ? `zip, ${m.size}B` : 'bad magic');
    } catch (e) { row('PPTX (pptxgenjs)', 'FAIL', e.message); }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

function portUp(port) {
  return new Promise((res) => {
    const sock = require('net').connect({ host: '127.0.0.1', port, timeout: 1500 }, () => { sock.destroy(); res(true); });
    sock.on('error', () => res(false));
    sock.on('timeout', () => { sock.destroy(); res(false); });
  });
}
function readToken() {
  for (const p of [path.join(WORKSPACE, 'cron-api-token.txt'), path.join(os.homedir(), '.openclaw', 'cron-api-token.txt')]) {
    try { const t = fs.readFileSync(p, 'utf-8').trim(); if (t) return t; } catch {}
  }
  return null;
}
function probe(urlPath, token) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: urlPath, timeout: 9000,
      headers: { authorization: 'Bearer ' + token, 'x-9bizclaw-agent-channel': 'telegram' } }, (res) => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => { let j = null; try { j = JSON.parse(body); } catch {} resolve({ status: res.statusCode, json: j, body }); });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
  });
}

async function checkIntegrations(launch) {
  let up = await portUp(PORT);
  if (!up && launch) {
    const exe = path.join(process.env.LOCALAPPDATA || '', 'Programs', '9bizclaw', '9BizClaw.exe');
    if (fs.existsSync(exe)) {
      console.log('[verify] launching 9BizClaw, waiting for cron-api :20200 (up to 120s)...');
      require('child_process').spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
      for (let i = 0; i < 60 && !up; i++) { await new Promise(r => setTimeout(r, 2000)); up = await portUp(PORT); }
    } else { console.log('[verify] --launch: exe not found at ' + exe); }
  }
  if (!up) {
    for (const c of ['File read (/api/file/read)', 'Facebook (/api/fb/verify)', 'Google (/api/google/health)', 'Zalo (/api/zalo/ready)'])
      row(c, 'SKIP', 'app not running — start 9BizClaw (or pass --launch)');
    return;
  }
  const token = readToken();
  if (!token) { row('Integrations', 'FAIL', 'cron-api-token.txt not found in ' + WORKSPACE); return; }

  // File read on PC — write a temp file, read it back through the API
  try {
    const probeFile = path.join(os.tmpdir(), '_capprobe_' + Date.now() + '.txt');
    const marker = 'CAPCHECK-' + Date.now();
    fs.writeFileSync(probeFile, marker);
    const r = await probe('/api/file/read?path=' + encodeURIComponent(probeFile), token);
    const txt = (r.json && (r.json.content || r.json.data || r.json.text)) || r.body || '';
    row('File read (/api/file/read)', (r.status === 200 && String(txt).includes(marker)) ? 'PASS' : 'FAIL',
      r.error || `HTTP ${r.status}` + (String(txt).includes(marker) ? ' content match' : ' content mismatch'));
    try { fs.unlinkSync(probeFile); } catch {}
  } catch (e) { row('File read (/api/file/read)', 'FAIL', e.message); }

  // Facebook — verify all connected pages
  try {
    const r = await probe('/api/fb/verify', token);
    const results = (r.json && (r.json.results || (r.json.valid !== undefined ? [r.json] : null))) || [];
    const okPages = results.filter(p => p && p.valid);
    if (r.status === 200 && okPages.length) row('Facebook (/api/fb/verify)', 'PASS', `connected: ${okPages.map(p => p.pageName).join(', ')}`);
    else if (r.status === 200 && results.length) row('Facebook (/api/fb/verify)', 'WARN', 'page(s) present but token invalid/expired');
    else row('Facebook (/api/fb/verify)', 'WARN', r.error || `HTTP ${r.status} — no connected fanpage (paste token in Dashboard)`);
  } catch (e) { row('Facebook (/api/fb/verify)', 'FAIL', e.message); }

  // Google — health/status
  try {
    let r = await probe('/api/google/health', token);
    if (r.status === 404) r = await probe('/api/google/status', token);
    const j = r.json || {};
    const connected = j.connected || j.ok || j.authenticated || j.healthy || (j.status === 'connected');
    if (r.status === 200 && connected) row('Google (/api/google/health)', 'PASS', 'connected');
    else if (r.status === 200) row('Google (/api/google/health)', 'WARN', 'reachable but not connected (run Dashboard > Google setup)');
    else row('Google (/api/google/health)', 'WARN', r.error || `HTTP ${r.status}`);
  } catch (e) { row('Google (/api/google/health)', 'FAIL', e.message); }

  // Zalo — listener readiness
  try {
    const r = await probe('/api/zalo/ready', token);
    const j = r.json || {};
    if (r.status === 200 && j.ready) row('Zalo (/api/zalo/ready)', 'PASS', 'listener ready' + (j.listenerPid ? ` (pid ${j.listenerPid})` : ''));
    else if (r.status === 200) row('Zalo (/api/zalo/ready)', 'WARN', 'not ready: ' + (j.error || 'listener down / cookie stale'));
    else row('Zalo (/api/zalo/ready)', 'WARN', r.error || `HTTP ${r.status}`);
  } catch (e) { row('Zalo (/api/zalo/ready)', 'FAIL', e.message); }
}

(async () => {
  const launch = process.argv.includes('--launch');
  console.log('\n=== 9BizClaw capability verification ===\n');
  console.log('-- Document engine (bundled libs, no app) --');
  await checkDocs();
  console.log('\n-- Integration plumbing (live local API :20200) --');
  await checkIntegrations(launch);

  console.log('\n=== RESULT ===');
  const pad = Math.max(...rows.map(r => r.cap.length));
  for (const r of rows) console.log(`  ${r.status.padEnd(4)}  ${r.cap.padEnd(pad)}  ${r.detail || ''}`);
  const fails = rows.filter(r => r.status === 'FAIL');
  const warns = rows.filter(r => r.status === 'WARN');
  const skips = rows.filter(r => r.status === 'SKIP');
  console.log(`\n  ${rows.filter(r => r.status === 'PASS').length} pass · ${warns.length} warn · ${skips.length} skip · ${fails.length} fail`);
  console.log('  (LLM-routing end-to-end is NOT covered here — use scripts/telegram-test-user.py for that.)');
  process.exit(fails.length ? 1 : 0);   // WARN/SKIP do not fail the harness (config/runtime state, not capability bugs)
})();
