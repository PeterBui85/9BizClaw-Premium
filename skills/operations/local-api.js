#!/usr/bin/env node
// Deterministic caller for the local cron API (port 20200) — the agent's reliable
// write path for ANY authenticated POST-with-body operation.
//
// WHY this exists: the agent's `web_fetch` tool is GET-only — its schema has no
// `method`/`body`, so the agent cannot POST a JSON body. Falling back to a raw
// `exec` HTTP call fails two ways: (1) Vietnamese / multi-line content gets mangled
// by shell quoting, and (2) shell HTTP carries no CEO-Telegram auth header, so the
// gate returns 403. This helper sidesteps both: the agent passes the JSON body as
// ONE base64 argument (shell-safe — no quotes/spaces/newlines), and the helper adds
// the auth header itself before POSTing.
//
// SECURITY INVARIANT: this grants Telegram-CEO auth to whatever whitelisted route
// it calls. It is safe ONLY because `exec`/`process` is BANNED from Zalo's
// tools.allow — so a Zalo turn can never run this script. Keep that ban. The
// ALLOWED whitelist below is the second guard: only agent-intended write routes.
//
// Usage:  node skills/operations/local-api.js <route> <base64-json>
// Output: "<httpStatus> <responseBody>" on success; "ERROR <reason>" on failure.
// Exit:   0 = 2xx, 2 = non-2xx HTTP, 1 = local error (bad args / no token / no conn).

const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 20200;
// Whitelist: authenticated POST-with-body write routes that skill docs route through
// this helper (web_fetch is GET-only, so `web_fetch method=POST` silently dropped the
// body → those writes were broken). Each entry is callable cron-API surface — keep it
// to routes a skill doc actually instructs. GET reads (list/status/read/...) stay on
// web_fetch and are intentionally absent. KEEP IN SYNC with the POST-only set in
// cron-api.js's 405 guard (user-skills routes).
const ALLOWED = new Set([
  // user-skills (skill-builder.md)
  '/api/user-skills/create',
  '/api/user-skills/check-conflict',
  '/api/user-skills/update',
  '/api/user-skills/delete',
  '/api/user-skills/toggle',
  '/api/user-skills/restore',
  // business ops (industry + operations skills)
  '/api/order/create',
  '/api/leave/request',
  '/api/inventory/adjust',
  '/api/report/daily',
  '/api/workspace/append',
  '/api/zalo-crm/export',
  // script generator
  '/api/skill/exec',
  '/api/skill/test-exec',
]);

function fail(msg) { console.log('ERROR ' + msg); process.exit(1); }

const route = process.argv[2];
const b64 = process.argv[3];
if (!route || !ALLOWED.has(route)) fail('route khong hop le. Phai la 1 trong: ' + [...ALLOWED].join(', '));
if (!b64) fail('thieu doi so base64-json (tham so thu 2)');

let body;
try {
  body = Buffer.from(b64, 'base64').toString('utf8');
  JSON.parse(body); // validate it is real JSON before sending
} catch (e) {
  fail('base64-json khong hop le (phai la base64 cua chuoi JSON UTF-8): ' + e.message);
}

// Token: workspace cwd first, then the Windows userData dir. The cron API writes
// it to both; it is intentionally NOT in AGENTS.md, so read it from disk here.
const candidates = [path.join(process.cwd(), 'cron-api-token.txt')];
if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, '9bizclaw', 'cron-api-token.txt'));
let token = '';
for (const p of candidates) {
  try {
    const t = fs.readFileSync(p, 'utf8').trim();
    if (/^[a-f0-9]{48}$/i.test(t)) { token = t; break; }
  } catch {}
}
if (!token) fail('khong doc duoc cron-api-token.txt (token noi bo)');

const payload = Buffer.from(body, 'utf8');
const req = http.request({
  host: '127.0.0.1',
  port: PORT,
  path: route,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Authorization': 'Bearer ' + token,
    // cron-api's gate accepts EITHER header (`x-9bizclaw-agent-channel || x-source-channel`);
    // we send both to match the web_fetch token-injection patch's convention.
    'X-Source-Channel': 'telegram',
    'X-9BizClaw-Agent-Channel': 'telegram',
  },
  timeout: 20000,
}, (res) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (c) => { data += c; });
  res.on('end', () => {
    console.log(res.statusCode + ' ' + data);
    process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 2);
  });
});
req.on('error', (e) => fail('ket noi API noi bo loi: ' + e.message));
req.on('timeout', () => { req.destroy(); fail('API noi bo qua thoi gian cho'); });
req.write(payload);
req.end();
