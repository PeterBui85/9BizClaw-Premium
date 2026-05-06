/**
 * 9BizClaw License Generator
 *
 * Usage:
 *   node generate-license.js <email> [months] [--plan <plan>] [--machine-id <id>]
 *   node generate-license.js tech@customer.com 12 --machine-id a1b2c3d4e5f6
 *   node generate-license.js vip@co.vn 6 --plan enterprise --machine-id <id>
 *   node generate-license.js --list                    (show all issued keys)
 *   node generate-license.js --revoke <key-hash>      (add to revoked list)
 *
 * Private key: ~/.claw-license-private.pem (NEVER commit this)
 * Supabase: inserts into licenses table on generate; inserts into revoked_keys on revoke
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const PRIVATE_KEY_PATH = path.join(os.homedir(), '.claw-license-private.pem');
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kc3NibWVkemJqdXRuZnpuYWxlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg4MjgwMywiZXhwIjoyMDkzNDU4ODAzfQ.-KlUesP2svgf2GWhUF0fNmcP3csmCnC4PwfTe22J9Jo';

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
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
    };
    if (bodyStr) opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', function(c) { buf += c; });
      res.on('end', function() { resolve({ status: res.statusCode, body: buf }); });
      res.on('error', function() { resolve({ status: 0, body: '' }); });
    });
    req.on('error', function() { resolve({ status: 0, body: '' }); });
    req.setTimeout(15000, function() { try { req.destroy(); } catch (_) {} resolve({ status: 0, body: 'timeout' }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function base64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadPrivateKey() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('Private key not found at:', PRIVATE_KEY_PATH);
    console.error('Run this on your machine only. Never share the private key.');
    process.exit(1);
  }
  return crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8'));
}

async function generateKey(email, months, plan, machineId) {
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

  if (machineId) {
    payload.m = machineId;
  }

  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf-8');
  const signature = crypto.sign(null, payloadBytes, privateKey);
  const combined = Buffer.concat([payloadBytes, signature]);
  const key = 'CLAW-' + base64urlEncode(combined);

  const keyHash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);

  // Push to Supabase licenses table
  const sbRes = await sbFetch('licenses', 'POST', {
    key_hash: keyHash,
    payload: payload,
  });
  if (sbRes.status !== 201 && sbRes.status !== 200) {
    console.warn('[supabase] warning: failed to insert into licenses table (status ' + sbRes.status + ') ' + sbRes.body.substring(0, 100));
  }

  return {
    email,
    plan: payload.p,
    issued: payload.i,
    expires: payload.v,
    keyHash,
    key,
    boundMachineId: machineId || null,
  };
}

async function listSupabaseKeys() {
  const res = await sbFetch('licenses?select=*&order=created_at.desc', 'GET');
  if (res.status !== 200) {
    console.error('Supabase error:', res.status, res.body);
    return [];
  }
  try {
    return JSON.parse(res.body);
  } catch (_) {
    return [];
  }
}

async function revokeKeySupabase(keyHash) {
  const res = await sbFetch('revoked_keys', 'POST', {
    key_hash: keyHash,
    reason: 'revoked-via-cli',
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error('Supabase error ' + res.status + ': ' + res.body);
  }
  return res;
}

async function listIssued() {
  const rows = await listSupabaseKeys();
  if (!rows.length) {
    console.log('No keys in Supabase licenses table.');
    return;
  }
  console.log('\n  ' + rows.length + ' key(s) in Supabase:\n');
  console.log('  ' + 'Email'.padEnd(30) + 'Plan'.padEnd(12) + 'Issued'.padEnd(13) + 'Expires'.padEnd(13) + 'Machine'.padEnd(12) + 'Hash');
  console.log('  ' + '-'.repeat(95));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const p = row.payload || {};
    const bound = p.m ? p.m.slice(0, 10) + '...' : '-';
    console.log('  ' + (p.e || '').padEnd(30) + (p.p || '').padEnd(12) + (p.i || '').padEnd(13) + (p.v || '').padEnd(13) + bound.padEnd(12) + row.key_hash);
  }
  console.log('');
}

// ---- CLI router ----

const args = process.argv.slice(2);

async function main() {
  if (args[0] === '--list') {
    await listIssued();
    process.exit(0);
  }

  if (args[0] === '--revoke') {
    const hash = args[1];
    if (!hash) {
      console.error('Usage: --revoke <key-hash>');
      process.exit(1);
    }
    await revokeKeySupabase(hash);
    console.log('Key ' + hash + ' revoked and pushed to Supabase.');
    console.log('Running apps will be blocked within ~1 hour.');
    process.exit(0);
  }

  if (args[0] === '--help' || args.length === 0) {
    console.log('\n 9BizClaw License Generator\n\n  Usage:\n    node generate-license.js <email> [months] [--plan <plan>] [--machine-id <id>]\n\n  Examples:\n    node generate-license.js tech@customer.com           (12 months, premium, any machine)\n    node generate-license.js vip@co.vn 6               (6 months, premium, any machine)\n    node generate-license.js vip@co.vn 24 --plan enterprise\n    node generate-license.js tech@customer.com --machine-id a1b2c3d4e5f6  (pre-bound to machine)\n\n  Flags:\n    --list           Show all issued keys (from Supabase)\n    --revoke <hash>  Revoke a key by its hash prefix (pushes to Supabase)\n    --machine-id <id> Pre-bind key to a specific machine at creation time\n\n  Machine binding:\n    If --machine-id is provided, the key will only work on that specific machine.\n    To get a machine ID, run the app on the customer\'s PC -> License page -> copy Machine ID.\n\n  Supabase:\n    Keys are inserted into the licenses table on generation.\n    Revocations are inserted into the revoked_keys table.\n    App checks both tables when customer activates.\n  ');
    process.exit(0);
  }

  const email = args[0];
  const monthsArg = parseInt(args[1]) || 12;
  const planIdx = args.indexOf('--plan');
  const plan = planIdx >= 0 ? args[planIdx + 1] : 'premium';
  const machineIdx = args.indexOf('--machine-id');
  const machineId = machineIdx >= 0 ? args[machineIdx + 1] : null;

  if (!email.includes('@')) {
    console.error('Invalid email:', email);
    process.exit(1);
  }

  if (machineId && (machineId.length < 8 || machineId.length > 64)) {
    console.error('--machine-id must be 8-64 hex characters. Got:', machineId);
    process.exit(1);
  }

  const result = await generateKey(email, monthsArg, plan, machineId);

  console.log('\n  License generated successfully!\n');
  console.log('  Email:    ' + email);
  console.log('  Plan:     ' + result.plan);
  console.log('  Issued:   ' + result.issued);
  console.log('  Expires:  ' + result.expires);
  console.log('  Hash:     ' + result.keyHash);
  console.log('  Machine:  ' + (result.boundMachineId ? 'BOUND to ' + result.boundMachineId : 'Any machine'));
  console.log('\n  License key (send to customer):\n  ' + result.key + '\n');
  console.log('  Inserted into Supabase licenses table.\n');
}

main().catch(function(e) {
  console.error('Error:', e.message);
  process.exit(1);
});
