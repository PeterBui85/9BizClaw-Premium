/**
 * Migration script: import existing license data from local JSONL logs into Supabase.
 *
 * Run ONCE on your dev machine to migrate existing issued keys from:
 *   ~/.claw-license-issued.jsonl   (local issued log)
 *   ~/.claw-license-revoked.jsonl  (local revoked log)
 * to Supabase tables (licenses + revoked_keys).
 *
 * Also checks the GitHub Gist if ~/.claw-license-gist.json exists.
 *
 * Usage:
 *   node migrate-licenses-to-supabase.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const SUPABASE_URL = 'https://ndssbmedzbjutnfznale.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3NibWVkemJqdXRuZnpuYWxlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg4MjgwMywiZXhwIjoyMDkzNDU4ODAzfQ.-KlUesP2svgf2GWhUF0fNmcP3csmCnC4PwfTe22J9Jo';

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

function loadIssued() {
  const p = path.join(os.homedir(), '.claw-license-issued.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf-8').trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function loadRevoked() {
  const p = path.join(os.homedir(), '.claw-license-revoked.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf-8').trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function loadGistConfig() {
  const p = path.join(os.homedir(), '.claw-license-gist.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'X-GitHub-Api-Version': '2022-11-28', ...headers },
    };
    const req = https.get(opts, (res) => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: buf }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { try { req.destroy(); } catch {} reject(new Error('timeout')); });
  });
}

async function loadGistActivations(cfg) {
  if (!cfg || !cfg.token || !cfg.gistId) return null;
  try {
    const res = await httpsGet(`https://api.github.com/gists/${cfg.gistId}`, { Authorization: `Bearer ${cfg.token}` });
    if (!res.ok) return null;
    const data = JSON.parse(res.body);
    const fname = Object.keys(data.files)[0];
    const content = data.files[fname]?.content || '{}';
    return JSON.parse(content);
  } catch (e) {
    console.warn('[gist] Could not load activations:', e.message);
    return null;
  }
}

async function main() {
  console.log('\n=== 9BizClaw License Migration → Supabase ===\n');

  const issued = loadIssued();
  const revoked = loadRevoked();
  const gistCfg = loadGistConfig();

  console.log(`Found ${issued.length} issued key(s) in ~/.claw-license-issued.jsonl`);
  console.log(`Found ${revoked.length} revoked key(s) in ~/.claw-license-revoked.jsonl`);
  console.log(`Gist config: ${gistCfg ? 'exists (' + gistCfg.gistId + ')' : 'not found'}`);

  if (issued.length === 0 && revoked.length === 0) {
    console.log('\nNothing to migrate. Exiting.');
    return;
  }

  // Load existing Supabase data
  console.log('\n--- Checking Supabase state ---');
  const existingLicenses = await sbFetch('licenses?select=key_hash', 'GET');
  let existingHashes = [];
  if (existingLicenses.status === 200) {
    try { existingHashes = JSON.parse(existingLicenses.body).map(r => r.key_hash); } catch {}
  }
  const existingRevoked = await sbFetch('revoked_keys?select=key_hash', 'GET');
  let existingRevokedHashes = [];
  if (existingRevoked.status === 200) {
    try { existingRevokedHashes = JSON.parse(existingRevoked.body).map(r => r.key_hash); } catch {}
  }
  console.log(`Supabase licenses: ${existingHashes.length} existing`);
  console.log(`Supabase revoked:  ${existingRevokedHashes.length} existing`);

  // Migrate issued keys
  let licensesInserted = 0;
  for (const entry of issued) {
    const kh = entry.keyHash;
    if (existingHashes.includes(kh)) {
      console.log(`  [skip] ${kh} — already in Supabase`);
      continue;
    }

    const payload = {
      e: entry.email,
      p: entry.plan || 'premium',
      i: entry.issued,
      v: entry.expires,
    };
    if (entry.boundMachineId) payload.m = entry.boundMachineId;

    const res = await sbFetch('licenses', 'POST', { key_hash: kh, payload });
    if (res.status === 201 || res.status === 200) {
      console.log(`  [OK]   ${kh} — ${entry.email} (${entry.plan}) inserted`);
      licensesInserted++;
    } else {
      console.log(`  [FAIL] ${kh} — status ${res.status}: ${res.body.substring(0, 80)}`);
    }
  }

  // Migrate revoked keys
  let revokedInserted = 0;
  for (const entry of revoked) {
    const kh = entry.keyHash;
    if (existingRevokedHashes.includes(kh)) {
      console.log(`  [skip] ${kh} — already revoked in Supabase`);
      continue;
    }
    const res = await sbFetch('revoked_keys', 'POST', {
      key_hash: kh,
      reason: 'migrated-from-local:' + (entry.revokedAt || ''),
    });
    if (res.status === 201 || res.status === 200) {
      console.log(`  [OK]   ${kh} — revoked inserted`);
      revokedInserted++;
    } else {
      console.log(`  [FAIL] ${kh} — status ${res.status}: ${res.body.substring(0, 80)}`);
    }
  }

  // Migrate Gist activations (if any)
  if (gistCfg) {
    const gistData = await loadGistActivations(gistCfg);
    if (gistData && gistData.activations) {
      console.log('\n--- Migrating Gist activations ---');
      let actInserted = 0;
      for (const [kh, act] of Object.entries(gistData.activations)) {
        if (existingHashes.includes(kh)) {
          console.log(`  [skip] ${kh} — already in Supabase`);
          continue;
        }
        // Insert license payload from gist activation (minimal payload)
        const payload = { e: act.email || '', p: 'premium', i: act.activatedAt ? act.activatedAt.slice(0, 10) : '', v: '' };
        const res = await sbFetch('licenses', 'POST', { key_hash: kh, payload });
        if (res.status === 201 || res.status === 200) {
          console.log(`  [OK]   ${kh} — license inserted from Gist (${act.email || 'no email'})`);
          actInserted++;
        } else {
          console.log(`  [FAIL] ${kh} — status ${res.status}`);
        }
      }
      if (gistData.revoked && Array.isArray(gistData.revoked)) {
        for (const kh of gistData.revoked) {
          if (existingRevokedHashes.includes(kh)) continue;
          const res = await sbFetch('revoked_keys', 'POST', { key_hash: kh, reason: 'migrated-from-gist' });
          if (res.status === 201 || res.status === 200) {
            console.log(`  [OK]   ${kh} — revoked inserted from Gist`);
            revokedInserted++;
          }
        }
      }
      console.log(`  Gist activations inserted: ${actInserted}`);
    }
  }

  console.log(`\n=== Migration complete ===`);
  console.log(`  Licenses inserted:  ${licensesInserted}`);
  console.log(`  Revoked inserted:   ${revokedInserted}`);
  console.log(`\nExisting keys (from JSONL logs) are NOT deleted.`);
  console.log(`Run 'node generate-license.js --list' to verify Supabase contents.`);
}

main().catch(e => { console.error('\nMigration failed:', e.message); process.exit(1); });
