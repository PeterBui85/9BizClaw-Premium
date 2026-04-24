// License key validation + activation module (membership builds only).
// Public/free builds have package.json membership=false and never require this.
//
// Key format: CLAW-XXXX-XXXX-XXXX (charset 23456789ABCDEFGHJKMNPQRSTUVWXYZ)
// Machine fingerprint: SHA256(hostname|firstMAC|platform) sliced to 32 chars
// License file: <workspace>/license.json with HMAC seal
// Revalidation: every 7 days online. Offline grace: 30 days OK, 45 days locked.
// Max 2 machines per key (enforced server-side).

const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const LICENSE_SERVER = 'https://license.modoro.com.vn';

// ---- seal key (obfuscated fragments, concat at runtime) ----
const _s1 = 'mdc-seal';
const _s2 = '-v1-';
const _s3 = '2026q2';
function _sealSecret(machineId) {
  return crypto.createHash('sha256').update(_s1 + _s2 + _s3 + machineId).digest('hex');
}

// ---- machine fingerprint ----

function getMachineId() {
  const hostname = os.hostname();
  const ifaces = os.networkInterfaces();
  // Sort interface names for deterministic order
  const names = Object.keys(ifaces).sort();
  // Filter out virtual adapters
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

// ---- HMAC seal ----

function computeSeal(data) {
  const mid = data.machineId || getMachineId();
  const payload = (data.key || '') + mid + (data.activatedAt || '') + (data.lastValidated || '');
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

// ---- workspace integration ----

let _getWorkspace = null;

function init(getWorkspaceFn) {
  _getWorkspace = getWorkspaceFn;
}

function licensePath() {
  const ws = _getWorkspace ? _getWorkspace() : null;
  if (!ws) return null;
  return path.join(ws, 'license.json');
}

function readLicense() {
  const p = licensePath();
  if (!p) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { return null; }
}

function writeLicense(data) {
  const p = licensePath();
  if (!p) return false;
  try {
    data.seal = computeSeal(data);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch { return false; }
}

// ---- status check ----

function checkLicenseStatus() {
  const data = readLicense();
  if (!data) return { status: 'no_license' };
  if (!verifySeal(data)) return { status: 'invalid', reason: 'seal_broken' };
  if (!data.key) return { status: 'no_license' };

  const now = Date.now();
  const lastValidated = data.lastValidated ? new Date(data.lastValidated).getTime() : 0;
  const daysSince = (now - lastValidated) / (24 * 60 * 60 * 1000);

  if (daysSince <= 30) {
    return { status: 'valid', key: maskKey(data.key), daysUntilRevalidation: Math.max(0, Math.floor(7 - daysSince)) };
  }
  if (daysSince <= 45) {
    return { status: 'grace_warning', key: maskKey(data.key), daysLeft: Math.floor(45 - daysSince) };
  }
  return { status: 'locked', reason: 'offline_too_long' };
}

// ---- key formatting helpers ----

function maskKey(key) {
  if (!key || key.length < 10) return '****';
  return key.slice(0, 9) + '****-****';
}

function formatKey(raw) {
  const clean = raw.replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/gi, '').toUpperCase().slice(0, 12);
  const parts = [clean.slice(0, 4), clean.slice(4, 8), clean.slice(8, 12)].filter(Boolean);
  return 'CLAW-' + parts.join('-');
}

// ---- HTTP helper ----

function _httpPost(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch { reject(new Error('Invalid server response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

// ---- activation ----

async function activateLicense(key) {
  const machineId = getMachineId();
  const hostname = os.hostname();
  let appVersion = '';
  try { appVersion = require('../package.json').version; } catch {}
  try {
    const resp = await _httpPost(LICENSE_SERVER + '/api/activate', {
      key, machineId, hostname, appVersion,
    });
    if (!resp.ok) return { success: false, error: resp.error || 'Activation failed' };
    const data = {
      key,
      machineId,
      activatedAt: new Date().toISOString(),
      lastValidated: new Date().toISOString(),
      validUntil: resp.validUntil || new Date(Date.now() + 90 * 86400000).toISOString(),
    };
    writeLicense(data);
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Không kết nối được server. Kiểm tra mạng và thử lại.' };
  }
}

// ---- revalidation ----

async function revalidateLicense() {
  const data = readLicense();
  if (!data || !data.key) return false;
  const lastValidated = data.lastValidated ? new Date(data.lastValidated).getTime() : 0;
  const daysSince = (Date.now() - lastValidated) / (24 * 60 * 60 * 1000);
  if (daysSince < 7) return true; // no need yet

  try {
    const resp = await _httpPost(LICENSE_SERVER + '/api/validate', {
      key: data.key, machineId: data.machineId || getMachineId(),
    });
    if (resp.ok) {
      data.lastValidated = new Date().toISOString();
      if (resp.validUntil) data.validUntil = resp.validUntil;
      writeLicense(data);
      return true;
    }
    if (resp.error === 'revoked') {
      try { fs.unlinkSync(licensePath()); } catch {}
      return false;
    }
    return false;
  } catch {
    return false; // network error — grace period handles this
  }
}

// ---- clear ----

async function clearLicense() {
  const p = licensePath();
  // Best-effort server unbind before deleting local file
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (data.key && data.machineId) {
      try {
        await _httpPost(LICENSE_SERVER + '/api/deactivate', {
          key: data.key,
          machineId: data.machineId,
        });
      } catch (e) {
        console.warn('[license] server unbind failed (best-effort):', e?.message);
      }
    }
  } catch {}
  if (p) try { fs.unlinkSync(p); } catch {}
}

module.exports = {
  init, getMachineId, checkLicenseStatus, activateLicense,
  revalidateLicense, clearLicense, formatKey, maskKey,
};
