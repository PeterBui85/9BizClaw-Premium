#!/usr/bin/env node
// Local license key manager — run: node license-manager.js
// Opens http://localhost:3847 with a simple UI to generate/list/revoke keys.
// Uses Supabase for data (service_role key on localhost only — never embedded in app)

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');

const PORT = 3847;
const PRIVATE_KEY_PATH = path.join(os.homedir(), '.claw-license-private.pem');
const SUPABASE_URL = 'https://ndssbmedzbjutnfznale.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3NibWVkemJqdXRuZnpuYWxlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg4MjgwMywiZXhwIjoyMDkzNDU4ODAzfQ.-KlUesP2svgf2GWhUF0fNmcP3csmCnC4PwfTe22J9Jo';

function base64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadPrivateKey() {
  return crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8'));
}

// ---- Supabase helpers ----

function sbFetch(tablePath, method, body) {
  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'ndssbmedzbjutnfznale.supabase.co',
      path: '/rest/v1/' + tablePath,
      method: method || 'GET',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      res.on('error', () => resolve({ status: 0, body: '' }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.setTimeout(15000, () => { try { req.destroy(); } catch {} resolve({ status: 0, body: 'timeout' }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function sbGenerateKey(email, months, plan) {
  const privateKey = loadPrivateKey();
  const now = new Date();
  const expiry = new Date(now);
  expiry.setMonth(expiry.getMonth() + months);
  const payload = {
    e: email,
    p: plan || 'premium',
    i: now.toISOString().slice(0, 10),
    v: expiry.toISOString().slice(0, 10),
  };
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf-8');
  const signature = crypto.sign(null, payloadBytes, privateKey);
  const combined = Buffer.concat([payloadBytes, signature]);
  const key = 'CLAW-' + base64urlEncode(combined);
  const keyHash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);

  // Insert into Supabase
  const sbRes = await sbFetch('licenses', 'POST', {
    key_hash: keyHash,
    payload: payload,
  });
  if (sbRes.status !== 201 && sbRes.status !== 200) {
    throw new Error(`Supabase insert failed (${sbRes.status}): ${sbRes.body}`);
  }

  return {
    email,
    plan: payload.p,
    issued: payload.i,
    expires: payload.v,
    keyHash,
    key,
  };
}

async function sbListKeys() {
  const res = await sbFetch('licenses?select=*&order=created_at.desc', 'GET');
  if (res.status !== 200) return { licenses: [], revoked: [] };
  let licenses = [];
  try { licenses = JSON.parse(res.body); } catch {}

  const revRes = await sbFetch('revoked_keys?select=*&order=revoked_at.desc', 'GET');
  let revoked = [];
  if (revRes.status === 200) {
    try { revoked = JSON.parse(revRes.body); } catch {}
  }

  return { licenses, revoked };
}

async function sbRevokeKey(keyHash) {
  const res = await sbFetch('revoked_keys', 'POST', {
    key_hash: keyHash,
    reason: 'revoked-via-manager',
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Supabase revoke failed (${res.status}): ${res.body}`);
  }
  return res;
}

const HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>9BizClaw License Manager</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e4e4e7; min-height: 100vh; }
  .container { max-width: 1100px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px; }
  .subtitle { color: #71717a; font-size: 14px; margin-bottom: 48px; }
  .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 28px; margin-bottom: 32px; }
  .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 20px; color: #f4f4f5; }
  .form-row { display: flex; gap: 12px; margin-bottom: 16px; }
  .form-group { flex: 1; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; color: #a1a1aa; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  input, select { width: 100%; padding: 10px 14px; background: #09090b; border: 1px solid #27272a; border-radius: 8px; color: #e4e4e7; font-size: 14px; outline: none; transition: border-color 0.2s; }
  input:focus, select:focus { border-color: #3b82f6; }
  select { cursor: pointer; }
  button { padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit; }
  button:hover { background: #2563eb; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-sm { padding: 6px 12px; font-size: 12px; }
  .btn-copy { background: #27272a; color: #a1a1aa; }
  .btn-copy:hover { background: #3f3f46; color: #e4e4e7; }
  .btn-delete { background: transparent; color: #ef4444; border: 1px solid #7f1d1d; }
  .btn-delete:hover { background: #7f1d1d; color: white; }
  .result { margin-top: 16px; padding: 16px; background: #09090b; border: 1px solid #27272a; border-radius: 8px; display: none; }
  .result.visible { display: block; animation: fadeIn 0.3s; }
  .result-key { font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 12px; word-break: break-all; line-height: 1.6; color: #22c55e; margin: 8px 0; padding: 12px; background: #0a0a0f; border-radius: 6px; user-select: all; }
  .result-meta { font-size: 12px; color: #71717a; }
  .supabase-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; background: #1a2e1a; border: 1px solid #1f4a1f; border-radius: 6px; font-size: 11px; color: #4ade80; font-weight: 500; margin-bottom: 20px; }
  .supabase-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #4ade80; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 12px; border-bottom: 1px solid #27272a; }
  td { font-size: 13px; padding: 12px; border-bottom: 1px solid #18181b; }
  tr:hover td { background: #18181b; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-premium { background: #1e3a5f; color: #60a5fa; }
  .badge-enterprise { background: #3b1f5e; color: #a78bfa; }
  .badge-expired { background: #3b1212; color: #f87171; }
  .badge-active { background: #0f2e1a; color: #4ade80; }
  .badge-revoked { background: #3b1212; color: #f87171; }
  .empty { text-align: center; color: #52525b; padding: 40px; font-size: 14px; }
  .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; background: #22c55e; color: #09090b; border-radius: 8px; font-size: 13px; font-weight: 600; transform: translateY(100px); opacity: 0; transition: all 0.3s; }
  .toast.show { transform: translateY(0); opacity: 1; }
  .toast.error { background: #ef4444; color: white; }
  .count { color: #71717a; font-weight: 400; font-size: 14px; margin-left: 8px; }
  .sb-note { font-size: 12px; color: #52525b; margin-bottom: 16px; }
  .sb-note span { color: #71717a; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>
</head>
<body>
<div class="container">
  <h1>9BizClaw License Manager</h1>
  <p class="subtitle">Tao va quan ly license key cho khach hang Premium</p>

  <div class="supabase-badge">Supabase connected — ndssbmedzbjutnfznale.supabase.co</div>

  <div class="card">
    <h2>Tao key moi</h2>
    <div class="sb-note">
      Key se duoc insert vao bang <span>licenses</span> tren Supabase ngay khi tao.
      Thu hoi se insert vao bang <span>revoked_keys</span>.
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label>Email khach hang</label>
        <input type="email" id="email" placeholder="customer@company.com">
      </div>
      <div class="form-group">
        <label>Thoi han</label>
        <select id="months">
          <option value="1">1 thang</option>
          <option value="3">3 thang</option>
          <option value="6">6 thang</option>
          <option value="12" selected>12 thang</option>
          <option value="24">24 thang</option>
          <option value="36">36 thang</option>
        </select>
      </div>
      <div class="form-group">
        <label>Goi</label>
        <select id="plan">
          <option value="premium">Premium</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>
    </div>
    <button onclick="generateKey()">Tao license key</button>
    <div class="result" id="result">
      <div class="result-meta" id="result-meta"></div>
      <div class="result-key" id="result-key"></div>
      <button class="btn-sm btn-copy" onclick="copyKey()">Copy key</button>
    </div>
  </div>

  <div class="card">
    <h2>Danh sach key<span class="count" id="key-count"></span></h2>
    <div id="key-list"></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
function toast(msg, isError) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(function() { t.className = 'toast'; }, 2500);
}

function copyKey() {
  var key = document.getElementById('result-key').textContent;
  navigator.clipboard.writeText(key).then(function() { toast('Da copy!'); });
}

function copyFromList(hash) {
  var el = document.querySelector('[data-hash="' + hash + '"]');
  if (el) navigator.clipboard.writeText(el.textContent).then(function() { toast('Da copy!'); });
}

async function generateKey() {
  var emailEl = document.getElementById('email');
  var email = emailEl.value.trim();
  if (!email) { emailEl.focus(); emailEl.style.borderColor = '#ef4444'; setTimeout(function() { emailEl.style.borderColor = ''; }, 2000); return; }
  var btn = document.querySelector('.card button:not(.btn-sm)');
  btn.disabled = true; btn.textContent = 'Dang tao...';
  try {
    var months = document.getElementById('months').value;
    var plan = document.getElementById('plan').value;
    var res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, months: parseInt(months), plan: plan })
    });
    var data = await res.json();
    if (data.error) { toast(data.error, true); return; }
    var r = document.getElementById('result');
    r.classList.add('visible');
    document.getElementById('result-meta').textContent = data.email + ' - ' + data.plan + ' - ' + data.issued + ' -> ' + data.expires;
    document.getElementById('result-key').textContent = data.key;
    emailEl.value = '';
    toast('Key da tao va insert Supabase!');
    loadKeys();
  } catch (e) {
    toast('Loi: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Tao license key';
  }
}

async function revokeKey(hash) {
  if (!confirm('Thu hoi key nay? App khach se bi chan trong ~1 gio.')) return;
  try {
    var res = await fetch('/api/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyHash: hash })
    });
    var data = await res.json();
    if (data.error) { toast(data.error, true); return; }
    toast('Key da thu hoi! Running apps se bi chan trong ~1 gio.');
    loadKeys();
  } catch (e) {
    toast('Loi: ' + e.message, true);
  }
}

async function loadKeys() {
  try {
    var res = await fetch('/api/list');
    var data = await res.json();
  } catch (e) {
    document.getElementById('key-list').innerHTML = '<div class="empty">Khong the ket noi Supabase: ' + esc(e.message) + '</div>';
    return;
  }
  var keys = data.licenses || [];
  var revoked = data.revoked || [];
  var total = keys.length + revoked.length;
  document.getElementById('key-count').textContent = '(' + total + ')';
  if (!keys.length && !revoked.length) {
    document.getElementById('key-list').innerHTML = '<div class="empty">Chua co key nao trong Supabase</div>';
    return;
  }
  var now = new Date().toISOString().slice(0, 10);

  var html = '<table><thead><tr><th>Email</th><th>Goi</th><th>Ngay tao</th><th>Het han</th><th>Machine</th><th>Hash</th><th></th></tr></thead><tbody>';

  keys.forEach(function(k) {
    var p = k.payload || {};
    var expired = p.v && p.v < now;
    var badge = expired ? '<span class="badge badge-expired">Het han</span>' : '<span class="badge badge-active">Active</span>';
    var planBadge = p.p === 'enterprise' ? 'badge-enterprise' : 'badge-premium';
    html += '<tr>';
    html += '<td>' + esc(p.e || '') + '</td>';
    html += '<td><span class="badge ' + planBadge + '">' + esc(p.p || '') + '</span></td>';
    html += '<td>' + esc(p.i || '') + '</td>';
    html += '<td>' + esc(p.v || '') + '</td>';
    html += '<td style="font-size:11px;color:#71717a;font-family:monospace">' + esc(p.m ? p.m.slice(0,8)+'...' : '-') + '</td>';
    html += '<td style="font-size:11px;font-family:monospace;color:#71717a">' + esc(k.key_hash || '') + '</td>';
    html += '<td style="text-align:right;white-space:nowrap">';
    if (k.key) html += '<button class="btn-sm btn-copy" onclick="copyFromList(\\'' + k.key_hash + '\\')">Copy</button> ';
    html += '<button class="btn-sm btn-delete" onclick="revokeKey(\\'' + k.key_hash + '\\')">Thu hoi</button>';
    html += '</td>';
    html += '</tr>';
    if (k.key) html += '<tr style="display:none"><td colspan="7"><span data-hash="' + k.key_hash + '">' + esc(k.key) + '</span></td></tr>';
  });

  revoked.forEach(function(k) {
    html += '<tr style="opacity:0.5">';
    html += '<td colspan="3"><span class="badge badge-revoked">Da thu hoi</span></td>';
    html += '<td colspan="2" style="font-size:11px;color:#71717a">' + esc(k.reason || '') + '</td>';
    html += '<td colspan="2" style="font-size:11px;color:#71717a;font-family:monospace">' + esc(k.key_hash || '') + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table>';
  document.getElementById('key-list').innerHTML = html;
}

function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

loadKeys();
document.getElementById('email').addEventListener('keydown', function(e) { if (e.key === 'Enter') generateKey(); });
</script>
</body>
</html>`;

const args = process.argv.slice(2);

if (args[0] === '--help') {
  console.log(`
  9BizClaw License Manager

  HTTP mode (default):
    node license-manager.js             (opens http://localhost:3847)

  CLI mode:
    node license-manager.js --revoke <key-hash>
    node license-manager.js --help
  `);
  process.exit(0);
}

if (args[0] === '--revoke') {
  const hash = args[1];
  if (!hash) {
    console.error('Usage: node license-manager.js --revoke <key-hash>');
    process.exit(1);
  }
  sbRevokeKey(hash).then(() => {
    console.log(`Key ${hash} revoked. Running apps blocked within ~1 hour.`);
    process.exit(0);
  }).catch(e => {
    console.error('Revoke failed:', e.message);
    process.exit(1);
  });
  return;
}

const server = http.createServer((req, res) => {
  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/list') {
    sbListKeys().then(data => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }).catch(e => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { email, months, plan } = JSON.parse(body);
        if (!email || !email.includes('@')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Email khong hop le' }));
          return;
        }
        const entry = await sbGenerateKey(email, parseInt(months) || 12, plan || 'premium');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(entry));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/revoke') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { keyHash } = JSON.parse(body);
        if (!keyHash) throw new Error('keyHash required');
        await sbRevokeKey(keyHash);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n  9BizClaw License Manager running at ${url}\n`);
  try {
    const cmd = process.platform === 'win32' ? `start ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
    execSync(cmd, { stdio: 'ignore' });
  } catch {}
});
