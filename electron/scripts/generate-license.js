#!/usr/bin/env node
// Generate Ed25519-signed license keys for 9BizClaw premium.
//
// Usage:
//   node generate-license.js <email> [months]
//   node generate-license.js tech@customer.com 12
//   node generate-license.js vip@company.com 6 --plan enterprise
//   node generate-license.js --list                    (show all issued keys)
//   node generate-license.js --revoke <key-prefix>     (add to revoked list)
//
// Private key: ~/.claw-license-private.pem (NEVER commit this)
// Issued keys log: ~/.claw-license-issued.jsonl

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PRIVATE_KEY_PATH = path.join(os.homedir(), '.claw-license-private.pem');
const ISSUED_LOG_PATH = path.join(os.homedir(), '.claw-license-issued.jsonl');

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

function generateKey(email, months, plan) {
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

  // Log issued key
  const entry = {
    email,
    plan: payload.p,
    issued: payload.i,
    expires: payload.v,
    keyPrefix: key.slice(0, 20),
    keyHash: crypto.createHash('sha256').update(key).digest('hex').slice(0, 16),
  };
  fs.appendFileSync(ISSUED_LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');

  return { key, payload, entry };
}

function listIssued() {
  if (!fs.existsSync(ISSUED_LOG_PATH)) {
    console.log('No keys issued yet.');
    return;
  }
  const lines = fs.readFileSync(ISSUED_LOG_PATH, 'utf-8').trim().split('\n').filter(Boolean);
  console.log(`\n  ${lines.length} key(s) issued:\n`);
  console.log('  ' + 'Email'.padEnd(30) + 'Plan'.padEnd(12) + 'Issued'.padEnd(13) + 'Expires'.padEnd(13) + 'Hash');
  console.log('  ' + '-'.repeat(85));
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      console.log('  ' + (e.email || '').padEnd(30) + (e.plan || '').padEnd(12) + (e.issued || '').padEnd(13) + (e.expires || '').padEnd(13) + (e.keyHash || ''));
    } catch {}
  }
  console.log('');
}

// ---- CLI ----

const args = process.argv.slice(2);

if (args[0] === '--list') {
  listIssued();
  process.exit(0);
}

if (args[0] === '--help' || args.length === 0) {
  console.log(`
  9BizClaw License Generator

  Usage:
    node generate-license.js <email> [months] [--plan <plan>]

  Examples:
    node generate-license.js tech@customer.com           (12 months, premium)
    node generate-license.js vip@co.vn 6                 (6 months, premium)
    node generate-license.js vip@co.vn 24 --plan enterprise

  Other:
    --list          Show all issued keys
    --help          Show this help
  `);
  process.exit(0);
}

const email = args[0];
const monthsArg = parseInt(args[1]) || 12;
const planIdx = args.indexOf('--plan');
const plan = planIdx >= 0 ? args[planIdx + 1] : 'premium';

if (!email.includes('@')) {
  console.error('Invalid email:', email);
  process.exit(1);
}

const { key, payload, entry } = generateKey(email, monthsArg, plan);

console.log(`
  License generated successfully!

  Email:    ${email}
  Plan:     ${payload.p}
  Issued:   ${payload.i}
  Expires:  ${payload.v}
  Hash:     ${entry.keyHash}

  License key (send to customer):
  ──────────────────────────────────────
  ${key}
  ──────────────────────────────────────

  Logged to: ${ISSUED_LOG_PATH}
`);
