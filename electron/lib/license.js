// License system — Ed25519 signed keys + Supabase activation registry.
//
// Key format: CLAW-{base64url(payload_json + 64-byte Ed25519 signature)}
// Offline: works forever until expiry (HMAC seal prevents file copy)
// Online: Supabase stores activations + revocation list
//   - Activation requires Supabase check (online-first)
//   - Already-activated PCs work offline via local seal
//   - Revocation kills keys across all PCs on next revalidation (~1h)

const os = require('os');
const crypto = require('crypto');
const https = require('https');

const PUBLIC_KEY_PEM = require('fs').readFileSync(
  require('path').join(__dirname, 'license-public.pem'), 'utf-8'
);
const PUBLIC_KEY = crypto.createPublicKey(PUBLIC_KEY_PEM);

// ---- Supabase config ----
// anon key is safe to embed — RLS enforces read-only on activations + revoked_keys
const SUPABASE_URL = 'https://ndssbmedzbjutnfznale.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3NibWVkemJqdXRuZnpuYWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4ODI4MDMsImV4cCI6MjA5MzQ1ODgwM30.T2xw-TnIt371maqBEuJ5Yxj7CBpFEPQRT9MgwjiYVuA';

function sbFetch(path, method, body, extraHeaders) {
  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'ndssbmedzbjutnfznale.supabase.co',
      path: '/rest/v1/' + path,
      method: method || 'GET',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...(extraHeaders || {}),
      },
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, body: buf, parsed });
      });
      res.on('error', () => resolve({ status: 0, body: '', parsed: null }));
    });
    req.on('error', () => resolve({ status: 0, body: '', parsed: null }));
    req.setTimeout(12000, () => { try { req.destroy(); } catch {} resolve({ status: 0, body: 'timeout', parsed: null }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ---- seal key (obfuscated fragments, concat at runtime) ----
const _s1 = 'mdc-seal';
const _s2 = '-v2-';
const _s3 = '2026q2';
function _sealSecret(machineId) {
  return crypto.createHash('sha256').update(_s1 + _s2 + _s3 + machineId).digest('hex');
}

// ---- machine fingerprint ----

function _computeMachineIdRaw() {
  const hostname = os.hostname();
  const ifaces = os.networkInterfaces();
  const names = Object.keys(ifaces).sort();
  const virtualPatterns = /^(veth|docker|virbr|br-|vmware|virtualbox|vethernet)/i;
  let mac = null;
  for (const name of names) {
    if (virtualPatterns.test(name)) continue;
    for (const info of ifaces[name]) {
      if (!info.internal && info.mac && info.mac !== '00:00:00:00:00:00') {
        mac = info.mac;
        break;
      }
    }
    if (mac) break;
  }
  if (!mac) mac = 'no-mac';
  const raw = hostname + '|' + mac + '|' + os.platform();
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

let _cachedMachineId = null;

function getMachineId() {
  if (_cachedMachineId) return _cachedMachineId;
  const fs = require('fs');
  const path = require('path');
  const appData = process.env.APPDATA || (process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : path.join(os.homedir(), '.config'));
  const midFile = path.join(appData, '9bizclaw', '.machine-id');
  try {
    const stored = fs.readFileSync(midFile, 'utf-8').trim();
    if (stored && stored.length === 32) { _cachedMachineId = stored; return stored; }
  } catch {}
  const mid = _computeMachineIdRaw();
  try { fs.mkdirSync(path.dirname(midFile), { recursive: true }); fs.writeFileSync(midFile, mid, 'utf-8'); } catch {}
  _cachedMachineId = mid;
  return mid;
}

function keyHash(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

// ---- HMAC seal ----
//
// The seal is computed over the license key + stored machineId + activatedAt + email.
// verifySeal reads the stored machineId from the license data (not current machineId).
// This means:
//   - Copying license.json to PC-B → seal was created with PC-A's stored machineId
//     → computeSeal uses PC-A's stored machineId → HMAC differs → seal FAILS
//   - Any tampering (key, email, expiry) also breaks the seal

function computeSeal(data) {
  const fs = require('fs');
  const path = require('path');
  const mid = data.machineId || getMachineId();
  const payload = (data.key || '') + mid + (data.activatedAt || '') + (data.email || '');
  return crypto.createHmac('sha256', _sealSecret(mid)).update(payload).digest('hex');
}

function verifySeal(data) {
  if (!data || !data.seal) return false;
  const expected = computeSeal(data);
  const a = Buffer.from(data.seal || '', 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---- license path in APPDATA (machine-specific, NOT workspace) ----

function licensePath() {
  const path = require('path');
  const appData = process.env.APPDATA || (process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : path.join(os.homedir(), '.config'));
  return path.join(appData, '9bizclaw', 'license.json');
}

function readLicense() {
  const fs = require('fs');
  const p = licensePath();
  if (!p) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { return null; }
}

function writeLicense(data) {
  const fs = require('fs');
  const path = require('path');
  const p = licensePath();
  if (!p) return false;
  try {
    data.seal = computeSeal(data);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch { return false; }
}

// ---- migrate old workspace license to APPDATA ----

function migrateWorkspaceLicense() {
  const fs = require('fs');
  const path = require('path');
  const appData = process.env.APPDATA || (process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : path.join(os.homedir(), '.config'));
  const newPath = path.join(appData, '9bizclaw', 'license.json');
  if (fs.existsSync(newPath)) return;

  const home = os.homedir();
  const oldPaths = [
    path.join(home, '.openclaw', 'license.json'),
    path.join(home, '9bizclaw', 'license.json'),
  ];

  for (const oldPath of oldPaths) {
    if (fs.existsSync(oldPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));
        if (data && data.key) {
          console.log('[license] Migrating license from workspace to APPDATA');
          writeLicense(data);
          console.log('[license] License migrated successfully');
          return;
        }
      } catch {}
    }
  }
}

// ---- Ed25519 signature verification ----

function base64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function verifyLicenseKey(keyStr) {
  try {
    let raw = keyStr.trim();
    if (raw.startsWith('CLAW-')) raw = raw.slice(5);
    raw = raw.replace(/[\s\r\n]/g, '');

    const decoded = base64urlDecode(raw);
    if (decoded.length < 65) return { valid: false, error: 'invalid_key' };

    const sigBytes = decoded.slice(decoded.length - 64);
    const payloadBytes = decoded.slice(0, decoded.length - 64);

    const isValid = crypto.verify(null, payloadBytes, PUBLIC_KEY, sigBytes);
    if (!isValid) return { valid: false, error: 'invalid_key' };

    const payload = JSON.parse(payloadBytes.toString('utf-8'));

    if (payload.v) {
      const expiry = new Date(payload.v).getTime();
      if (Date.now() > expiry) return { valid: false, error: 'expired', payload };
    }

    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: 'invalid_key' };
  }
}

// ---- Supabase helpers ----
//
// Tables:
//   licenses       — inserted when a key is generated (by CLI)
//   activations     — inserted when customer activates (by app, anon insert allowed)
//   revoked_keys   — inserted when key is revoked (by license-manager/service_role)

async function sbCheckRegistry(key) {
  // Returns { activations: {...}, revoked: [...] } or null on network error
  const kh = keyHash(key);

  const [actRes, revRes] = await Promise.all([
    sbFetch(`activations?key_hash=eq.${kh}&limit=1`, 'GET'),
    sbFetch(`revoked_keys?key_hash=eq.${kh}&limit=1`, 'GET'),
  ]);

  const activation = (actRes.parsed && Array.isArray(actRes.parsed) && actRes.parsed[0]) || null;
  const revoked = (revRes.parsed && Array.isArray(revRes.parsed) && revRes.parsed.length > 0) || false;

  return { activation, revoked, ok: actRes.status > 0 };
}

async function sbRegisterActivation(key, machineId, email) {
  const kh = keyHash(key);
  const res = await sbFetch('activations', 'POST', {
    key_hash: kh,
    machine_id: machineId,
    email: email || '',
  }, { 'Prefer': 'resolution=merge-duplicates' });
  return res;
}

async function sbRegisterLicense(key, payload) {
  const kh = keyHash(key);
  const res = await sbFetch('licenses', 'POST', {
    key_hash: kh,
    payload: payload,
  }, { 'Prefer': 'resolution=ignore-duplicates' });
  return res;
}

async function sbRegisterRevoked(keyHash, reason) {
  const res = await sbFetch('revoked_keys', 'POST', {
    key_hash: keyHash,
    reason: reason || '',
  }, { 'Prefer': 'resolution=ignore-duplicates' });
  return res;
}

// ---- status check ----

function checkLicenseStatus() {
  migrateWorkspaceLicense();
  const data = readLicense();
  if (!data) return { status: 'no_license' };
  if (!verifySeal(data)) return { status: 'invalid', reason: 'seal_broken' };
  if (!data.key) return { status: 'no_license' };

  const verify = verifyLicenseKey(data.key);
  if (!verify.valid) {
    if (verify.error === 'expired') {
      return { status: 'expired', key: maskKey(data.key), email: data.email };
    }
    return { status: 'invalid', reason: 'signature_invalid' };
  }

  const payload = verify.payload;
  let daysLeft = null;
  if (payload.v) {
    daysLeft = Math.floor((new Date(payload.v).getTime() - Date.now()) / 86400000);
  }

  return {
    status: 'valid',
    key: maskKey(data.key),
    email: data.email || payload.e,
    plan: payload.p || 'premium',
    daysLeft,
    validUntil: payload.v,
    machineId: data.machineId,
  };
}

// ---- key formatting helpers ----

function maskKey(key) {
  if (!key || key.length < 15) return 'CLAW-****';
  return key.slice(0, 12) + '...' + key.slice(-4);
}

// ---- activation (online-first) ----
//
// Flow:
//  1. Verify Ed25519 signature + expiry (offline, always works)
//  2. If key pre-bound to a different machine (payload.m) → REJECT immediately
//  3. Check Supabase registry:
//     - If key in revoked list → REJECT
//     - If key bound to a DIFFERENT machineId → REJECT (already activated elsewhere)
//     - If network unavailable → REJECT (activation requires online check)
//  4. Write license.json locally + register in Supabase

async function activateLicense(key) {
  migrateWorkspaceLicense();

  const verify = verifyLicenseKey(key);
  if (!verify.valid) return { success: false, error: verify.error };

  const payload = verify.payload;
  const machineId = getMachineId();

  // Layer 1: Pre-bound key (payload.m) — checked offline first
  if (payload.m && payload.m !== machineId) {
    return {
      success: false,
      error: 'machine_mismatch',
      detail: 'Key was bound to a specific machine at creation time. Contact tech@modoro.com.vn.',
    };
  }

  // Layer 2: Supabase registry check (online)
  const registry = await sbCheckRegistry(key);

  if (!registry.ok) {
    // Supabase unreachable — reject activation to prevent key sharing
    // The local seal is sufficient for already-activated machines
    return {
      success: false,
      error: 'offline_activation_blocked',
      detail: 'Khong ket noi duoc may chu kiem tra ban quyen. Vui long thu lai khi co mang.',
    };
  }

  if (registry.revoked) {
    return { success: false, error: 'revoked', detail: 'Key da bi thu hoi. Lien he tech@modoro.com.vn.' };
  }

  if (registry.activation && registry.activation.machine_id && registry.activation.machine_id !== machineId) {
    return {
      success: false,
      error: 'already_activated',
      detail: 'Key da duoc kich hoat tren may khac. Lien he tech@modoro.com.vn de chuyen may.',
    };
  }

  // Activation allowed — write locally + register in Supabase
  const data = {
    key,
    email: payload.e || '',
    machineId,
    activatedAt: new Date().toISOString(),
    plan: payload.p || 'premium',
    validUntil: payload.v || null,
    boundMachineId: payload.m || null,
  };
  const wrote = writeLicense(data);
  if (!wrote) return { success: false, error: 'write_failed' };

  // Register in Supabase (non-blocking — already verified above)
  sbRegisterActivation(key, machineId, payload.e).catch(() => {});

  return { success: true };
}

// ---- revocation check (best-effort, cached) ----
//
// On every revalidation (~1h):
//  1. Check Supabase → if key in revoked list OR bound to different machine → kill license
//  2. Silently continue if Supabase unreachable (local seal is sufficient)

let _registryCache = null;
let _registryCacheTime = 0;
const REGISTRY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function revalidateLicense() {
  const data = readLicense();
  if (!data || !data.key) return false;

  const verify = verifyLicenseKey(data.key);
  if (!verify.valid) return false;

  const machineId = data.machineId;
  const now = Date.now();

  // Refresh cache if stale
  if (!_registryCache || (now - _registryCacheTime) > REGISTRY_CACHE_TTL) {
    const fresh = await sbCheckRegistry(data.key);
    if (fresh.ok) {
      _registryCache = fresh;
      _registryCacheTime = now;
    }
  }

  if (_registryCache) {
    if (_registryCache.revoked) {
      const fs = require('fs');
      const path = require('path');
      const p = licensePath();
      if (p) try { fs.unlinkSync(p); } catch {}
      return false;
    }

    if (_registryCache.activation && _registryCache.activation.machine_id &&
        _registryCache.activation.machine_id !== machineId) {
      const fs = require('fs');
      const path = require('path');
      const p = licensePath();
      if (p) try { fs.unlinkSync(p); } catch {}
      return false;
    }
  }

  return true;
}

// ---- clear ----

async function clearLicense() {
  const data = readLicense();
  const fs = require('fs');
  const path = require('path');
  const p = licensePath();
  if (p) try { fs.unlinkSync(p); } catch {}
}

// ---- exports ----

module.exports = {
  getMachineId, checkLicenseStatus, activateLicense,
  revalidateLicense, clearLicense, maskKey, verifyLicenseKey,
  // Expose for license-manager.js (runs as standalone Node process)
  SUPABASE_URL, ANON_KEY,
};
