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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required.\nSet it: export SUPABASE_SERVICE_KEY=your-key-here');
  process.exit(1);
}

function base64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadPrivateKey() {
  return crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8'));
}

// ---- Supabase helpers ----

function sbFetch(tablePath, method, body, extraHeaders) {
  return new Promise((resolve) => {
    const m = method || 'GET';
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      ...(extraHeaders || {}),
    };
    if (m !== 'GET') headers['Prefer'] = 'return=minimal';
    const opts = {
      hostname: 'ndssbmedzbjutnfznale.supabase.co',
      path: '/rest/v1/' + tablePath,
      method: m,
      headers,
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

function _generateOneKey(privateKey, email, months, plan) {
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
  return { payload, key, keyHash };
}

async function sbGenerateCustomer(customerName, months, plan, keyCount) {
  const privateKey = loadPrivateKey();
  const n = keyCount || 3;
  const keys = [];
  for (let i = 0; i < n; i++) {
    const { payload, key, keyHash } = _generateOneKey(privateKey, customerName, months, plan);
    const sbRes = await sbFetch('licenses', 'POST', {
      key_hash: keyHash,
      payload: payload,
      customer_name: customerName,
      full_key: key,
    });
    if (sbRes.status !== 201 && sbRes.status !== 200) {
      throw new Error(`Supabase insert failed (${sbRes.status}): ${sbRes.body}`);
    }
    keys.push({ key, keyHash, issued: payload.i, expires: payload.v });
  }
  return {
    customerName,
    plan: plan || 'premium',
    issued: keys[0].issued,
    expires: keys[0].expires,
    keys,
  };
}

async function sbListKeys() {
  const [res, actRes, revRes] = await Promise.all([
    sbFetch('licenses?select=*&order=created_at.desc', 'GET'),
    sbFetch('activations?select=*', 'GET'),
    sbFetch('revoked_keys?select=*&order=revoked_at.desc', 'GET'),
  ]);
  let licenses = [];
  if (res.status === 200) { try { licenses = JSON.parse(res.body); } catch {} }
  let activations = [];
  if (actRes.status === 200) { try { activations = JSON.parse(actRes.body); } catch {} }
  let revoked = [];
  if (revRes.status === 200) { try { revoked = JSON.parse(revRes.body); } catch {} }

  const actMap = {};
  for (const a of activations) { if (a.key_hash) actMap[a.key_hash] = a; }
  for (const lic of licenses) { lic.activation = actMap[lic.key_hash] || null; }

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
  .btn-download { background: #1e3a5f; color: #60a5fa; }
  .btn-download:hover { background: #1e4a7f; color: #93c5fd; }
  .btn-delete { background: transparent; color: #ef4444; border: 1px solid #7f1d1d; }
  .btn-delete:hover { background: #7f1d1d; color: white; }
  .btn-revoke-all { background: transparent; color: #f97316; border: 1px solid #7c3e12; }
  .btn-revoke-all:hover { background: #7c3e12; color: white; }
  .result { margin-top: 16px; padding: 16px; background: #09090b; border: 1px solid #27272a; border-radius: 8px; display: none; }
  .result.visible { display: block; animation: fadeIn 0.3s; }
  .result-key { font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 12px; word-break: break-all; line-height: 1.6; color: #22c55e; margin: 6px 0; padding: 10px; background: #0a0a0f; border-radius: 6px; user-select: all; }
  .result-meta { font-size: 12px; color: #71717a; }
  .result-actions { display: flex; gap: 8px; margin-top: 12px; }
  .supabase-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; background: #1a2e1a; border: 1px solid #1f4a1f; border-radius: 6px; font-size: 11px; color: #4ade80; font-weight: 500; margin-bottom: 20px; }
  .supabase-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #4ade80; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .customer-group { margin-bottom: 24px; }
  .customer-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #09090b; border: 1px solid #27272a; border-radius: 8px; cursor: pointer; user-select: none; transition: background 0.15s; }
  .customer-header:hover { background: #111114; }
  .customer-name { font-size: 15px; font-weight: 600; color: #f4f4f5; }
  .customer-meta { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .customer-keys-body { padding: 0 8px; }
  .customer-keys-body.collapsed { display: none; }
  .chevron { color: #52525b; font-size: 12px; transition: transform 0.2s; }
  .chevron.open { transform: rotate(90deg); }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 12px; border-bottom: 1px solid #27272a; }
  td { font-size: 13px; padding: 10px 12px; border-bottom: 1px solid #18181b; }
  tr:hover td { background: #18181b; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-premium { background: #1e3a5f; color: #60a5fa; }
  .badge-enterprise { background: #3b1f5e; color: #a78bfa; }
  .badge-expired { background: #3b1212; color: #f87171; }
  .badge-active { background: #0f2e1a; color: #4ade80; }
  .badge-revoked { background: #3b1212; color: #f87171; }
  .badge-pending { background: #1a1a2e; color: #a78bfa; }
  .badge-count { background: #27272a; color: #a1a1aa; font-size: 12px; padding: 2px 8px; border-radius: 10px; }
  .empty { text-align: center; color: #52525b; padding: 40px; font-size: 14px; }
  .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; background: #22c55e; color: #09090b; border-radius: 8px; font-size: 13px; font-weight: 600; transform: translateY(100px); opacity: 0; transition: all 0.3s; z-index: 100; }
  .toast.show { transform: translateY(0); opacity: 1; }
  .toast.error { background: #ef4444; color: white; }
  .count { color: #71717a; font-weight: 400; font-size: 14px; margin-left: 8px; }
  .sb-note { font-size: 12px; color: #52525b; margin-bottom: 16px; }
  .sb-note span { color: #71717a; }
  .key-label { font-size: 11px; color: #52525b; margin-bottom: 2px; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>
</head>
<body>
<div class="container">
  <h1>9BizClaw License Manager</h1>
  <p class="subtitle">Quản lý license theo khách hàng. Mỗi khách nhận 3 key khi đăng ký.</p>

  <div class="supabase-badge">Supabase connected</div>

  <div class="card">
    <h2>Đăng ký khách hàng mới</h2>
    <div class="sb-note">
      Tạo 3 key cho khách hàng. Key được insert vào bảng <span>licenses</span> trên Supabase.
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:3">
        <label>Tên khách hàng</label>
        <input type="text" id="customerName" placeholder="Công ty ABC / Nguyễn Văn A">
      </div>
      <div class="form-group">
        <label>Thời hạn</label>
        <select id="months">
          <option value="1">1 tháng</option>
          <option value="3">3 tháng</option>
          <option value="6">6 tháng</option>
          <option value="12" selected>12 tháng</option>
          <option value="24">24 tháng</option>
          <option value="36">36 tháng</option>
        </select>
      </div>
      <div class="form-group">
        <label>Gói</label>
        <select id="plan">
          <option value="premium">Premium</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>
      <div class="form-group" style="display:flex;align-items:flex-end">
        <button onclick="generateKeys()" id="gen-btn" style="width:100%">Tạo 3 key</button>
      </div>
    </div>
    <div class="result" id="result">
      <div class="result-meta" id="result-meta"></div>
      <div id="result-keys"></div>
      <div class="result-actions">
        <button class="btn-sm btn-download" onclick="downloadKeys()">Tải file .txt</button>
        <button class="btn-sm btn-copy" onclick="copyAllKeys()">Copy tất cả</button>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Khách hàng<span class="count" id="customer-count"></span></h2>
    <div id="customer-list"></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
var _lastGeneratedData = null;

function toast(msg, isError) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(function() { t.className = 'toast'; }, 2500);
}

function copyAllKeys() {
  if (!_lastGeneratedData || !_lastGeneratedData.keys) return;
  var text = _lastGeneratedData.keys.map(function(k) { return k.key; }).join('\\n');
  navigator.clipboard.writeText(text).then(function() { toast('Đã copy 3 key!'); });
}

function downloadKeys() {
  if (!_lastGeneratedData) return;
  var d = _lastGeneratedData;
  var lines = [
    '9BizClaw License Keys',
    '=====================',
    '',
    'Khách hàng: ' + d.customerName,
    'Gói: ' + d.plan,
    'Ngày cấp: ' + d.issued,
    'Hết hạn: ' + d.expires,
    '',
    '--- Key 1 ---',
    d.keys[0].key,
    '',
    '--- Key 2 ---',
    d.keys[1].key,
    '',
    '--- Key 3 ---',
    d.keys[2].key,
    '',
    '=====================',
    'Mỗi key chỉ kích hoạt được trên 1 máy.',
    'Nhập key trong 9BizClaw > Cài đặt > Kích hoạt license.',
  ];
  var blob = new Blob([lines.join('\\r\\n')], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = d.customerName.replace(/[^a-zA-Z0-9_\\-\\s]/g, '').replace(/\\s+/g, '-') + '-license-keys.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('File đã tải xuống!');
}

function downloadCustomerKeys(name, plan, issued, expires, keys) {
  var lines = [
    '9BizClaw License Keys',
    '=====================',
    '',
    'Khách hàng: ' + name,
    'Gói: ' + plan,
    'Ngày cấp: ' + issued,
    'Hết hạn: ' + expires,
    '',
  ];
  keys.forEach(function(k, i) {
    lines.push('--- Key ' + (i + 1) + ' ---');
    lines.push(k);
    lines.push('');
  });
  lines.push('=====================');
  lines.push('Mỗi key chỉ kích hoạt được trên 1 máy.');
  lines.push('Nhập key trong 9BizClaw > Cài đặt > Kích hoạt license.');
  var blob = new Blob([lines.join('\\r\\n')], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[^a-zA-Z0-9_\\-\\s]/g, '').replace(/\\s+/g, '-') + '-license-keys.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('File đã tải xuống!');
}

async function generateKeys() {
  var nameEl = document.getElementById('customerName');
  var name = nameEl.value.trim();
  if (!name) { nameEl.focus(); nameEl.style.borderColor = '#ef4444'; setTimeout(function() { nameEl.style.borderColor = ''; }, 2000); return; }
  var btn = document.getElementById('gen-btn');
  btn.disabled = true; btn.textContent = 'Đang tạo...';
  try {
    var months = document.getElementById('months').value;
    var plan = document.getElementById('plan').value;
    var res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: name, months: parseInt(months), plan: plan })
    });
    var data = await res.json();
    if (data.error) { toast(data.error, true); return; }
    _lastGeneratedData = data;
    var r = document.getElementById('result');
    r.classList.add('visible');
    document.getElementById('result-meta').textContent = data.customerName + ' — ' + data.plan + ' — ' + data.issued + ' -> ' + data.expires;
    var keysHtml = '';
    data.keys.forEach(function(k, i) {
      keysHtml += '<div class="key-label">Key ' + (i + 1) + '</div>';
      keysHtml += '<div class="result-key">' + esc(k.key) + '</div>';
    });
    document.getElementById('result-keys').innerHTML = keysHtml;
    nameEl.value = '';
    toast('3 key đã tạo và insert Supabase!');
    loadKeys();
  } catch (e) {
    toast('Lỗi: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Tạo 3 key';
  }
}

async function revokeKey(hash) {
  if (!confirm('Thu hồi key này? App khách sẽ bị chặn trong ~1 giờ.')) return;
  try {
    var res = await fetch('/api/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyHash: hash })
    });
    var data = await res.json();
    if (data.error) { toast(data.error, true); return; }
    toast('Key đã thu hồi!');
    loadKeys();
  } catch (e) {
    toast('Lỗi: ' + e.message, true);
  }
}

async function revokeAllCustomer(hashes) {
  if (!confirm('Thu hồi tất cả ' + hashes.length + ' key của khách hàng này?')) return;
  try {
    for (var i = 0; i < hashes.length; i++) {
      await fetch('/api/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyHash: hashes[i] })
      });
    }
    toast('Đã thu hồi ' + hashes.length + ' key!');
    loadKeys();
  } catch (e) {
    toast('Lỗi: ' + e.message, true);
  }
}

function toggleGroup(id) {
  var body = document.getElementById('body-' + id);
  var chev = document.getElementById('chev-' + id);
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    chev.classList.add('open');
  } else {
    body.classList.add('collapsed');
    chev.classList.remove('open');
  }
}

async function loadKeys() {
  try {
    var res = await fetch('/api/list');
    var data = await res.json();
  } catch (e) {
    document.getElementById('customer-list').innerHTML = '<div class="empty">Không thể kết nối Supabase: ' + esc(e.message) + '</div>';
    return;
  }
  var keys = data.licenses || [];
  var revoked = data.revoked || [];
  var revokedSet = {};
  revoked.forEach(function(r) { revokedSet[r.key_hash] = true; });

  var groups = {};
  var groupOrder = [];
  keys.forEach(function(k) {
    var name = k.customer_name || (k.payload && k.payload.e) || 'Không rõ';
    if (!groups[name]) { groups[name] = []; groupOrder.push(name); }
    groups[name].push(k);
  });

  var totalCustomers = groupOrder.length;
  document.getElementById('customer-count').textContent = '(' + totalCustomers + ' khách hàng, ' + keys.length + ' key)';

  if (!keys.length) {
    document.getElementById('customer-list').innerHTML = '<div class="empty">Chưa có khách hàng nào</div>';
    return;
  }

  var now = new Date().toISOString().slice(0, 10);
  var html = '';

  groupOrder.forEach(function(name, gi) {
    var gKeys = groups[name];
    var p0 = gKeys[0].payload || {};
    var plan = p0.p || 'premium';
    var planBadge = plan === 'enterprise' ? 'badge-enterprise' : 'badge-premium';
    var nonRevokedHashes = [];
    gKeys.forEach(function(k) {
      if (!revokedSet[k.key_hash]) nonRevokedHashes.push(k.key_hash);
    });

    html += '<div class="customer-group">';
    html += '<div class="customer-header" onclick="toggleGroup(' + gi + ')">';
    html += '<span class="chevron" id="chev-' + gi + '">&#9654;</span>';
    html += '<span class="customer-name">' + esc(name) + '</span>';
    html += '<span class="customer-meta">';
    html += '<span class="badge ' + planBadge + '">' + esc(plan) + '</span>';
    html += '<span class="badge-count">' + gKeys.length + ' key</span>';
    if (p0.v) html += '<span style="font-size:11px;color:#71717a">hết hạn ' + esc(p0.v) + '</span>';
    html += '</span>';
    html += '</div>';

    html += '<div class="customer-keys-body collapsed" id="body-' + gi + '">';
    html += '<div style="padding:12px 8px 8px;display:flex;gap:8px">';
    if (nonRevokedHashes.length > 0) {
      html += '<button class="btn-sm btn-download" onclick="event.stopPropagation();downloadCustomerKeysFromList(' + gi + ')">Tải file .txt</button>';
      html += '<button class="btn-sm btn-revoke-all" onclick="event.stopPropagation();revokeAllCustomer([' + nonRevokedHashes.map(function(h){return "\\'"+h+"\\'";}).join(',') + '])">Thu hồi tất cả</button>';
    }
    html += '</div>';

    html += '<table><thead><tr><th>#</th><th>Trạng thái</th><th>Machine ID</th><th>Ngày tạo</th><th>Hết hạn</th><th>Hash</th><th></th></tr></thead><tbody>';

    gKeys.forEach(function(k, ki) {
      var p = k.payload || {};
      var act = k.activation || null;
      var isRevoked = !!revokedSet[k.key_hash];
      var expired = p.v && p.v < now;
      var statusBadge;
      if (isRevoked) { statusBadge = '<span class="badge badge-revoked">Thu hồi</span>'; }
      else if (expired) { statusBadge = '<span class="badge badge-expired">Hết hạn</span>'; }
      else if (act) { statusBadge = '<span class="badge badge-active">Kích hoạt</span>'; }
      else { statusBadge = '<span class="badge badge-pending">Chưa kích hoạt</span>'; }
      var machineDisplay = '-';
      if (act && act.machine_id) { machineDisplay = act.machine_id; }
      else if (p.m) { machineDisplay = p.m + ' (pre-bound)'; }
      html += '<tr>';
      html += '<td style="color:#52525b">' + (ki + 1) + '</td>';
      html += '<td>' + statusBadge + '</td>';
      html += '<td style="font-size:11px;color:#71717a;font-family:monospace" title="' + escAttr(machineDisplay) + '">' + esc(machineDisplay.length > 16 ? machineDisplay.slice(0,16)+'...' : machineDisplay) + '</td>';
      html += '<td style="font-size:12px;color:#71717a">' + esc(p.i || '') + '</td>';
      html += '<td style="font-size:12px;color:#71717a">' + esc(p.v || '') + '</td>';
      html += '<td style="font-size:11px;font-family:monospace;color:#52525b">' + esc(k.key_hash || '') + '</td>';
      html += '<td style="text-align:right;white-space:nowrap">';
      if (!isRevoked && !expired) html += '<button class="btn-sm btn-delete" onclick="event.stopPropagation();revokeKey(\\'' + k.key_hash + '\\')">Thu hồi</button>';
      html += '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div></div>';
  });

  document.getElementById('customer-list').innerHTML = html;
  window._customerGroups = { groups: groups, groupOrder: groupOrder, revokedSet: revokedSet };
}

function downloadCustomerKeysFromList(gi) {
  var cg = window._customerGroups;
  if (!cg) return;
  var name = cg.groupOrder[gi];
  var gKeys = cg.groups[name];
  var p0 = gKeys[0].payload || {};
  var keyStrs = gKeys.filter(function(k) { return !cg.revokedSet[k.key_hash]; }).map(function(k) { return k.full_key || '(key hash: ' + k.key_hash + ')'; });
  downloadCustomerKeys(name, p0.p || 'premium', p0.i || '', p0.v || '', keyStrs);
}

function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

loadKeys();
document.getElementById('customerName').addEventListener('keydown', function(e) { if (e.key === 'Enter') generateKeys(); });
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
  // CORS restricted to localhost only
  const origin = req.headers.origin || '';
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
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
        const { customerName, months, plan } = JSON.parse(body);
        if (!customerName || !customerName.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tên khách hàng không được để trống' }));
          return;
        }
        const entry = await sbGenerateCustomer(customerName.trim(), parseInt(months) || 12, plan || 'premium', 3);
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
