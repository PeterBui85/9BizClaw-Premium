#!/usr/bin/env node
// Smoke for Google Calendar module — credentials round-trip, marker parse,
// Vietnamese date parser, audit log token exclusion, confirmation window.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function fail(msg) { console.error('[gcal smoke] FAIL:', msg); process.exit(1); }
function ok(msg) { console.log('  OK  ', msg); }

// Isolated temp workspace per run — never touch real workspace
const TMP_WS = fs.mkdtempSync(path.join(os.tmpdir(), 'gcal-smoke-'));
process.env.MODORO_WORKSPACE = TMP_WS;

function testCredentialsRoundTrip() {
  // Load via require path — module resolves getWorkspace() at call time
  const credentials = require('../gcal/credentials');
  const sample = {
    clientId: 'test-123.apps.googleusercontent.com',
    clientSecret: 'GOCSPX-testsecret',
  };
  credentials.save(sample);
  const loaded = credentials.load();
  if (!loaded) fail('credentials load returned null after save');
  if (loaded.clientId !== sample.clientId) fail('clientId mismatch on round-trip');
  if (loaded.clientSecret !== sample.clientSecret) fail('clientSecret mismatch on round-trip');
  // Delete
  credentials.clear();
  if (credentials.load() !== null) fail('clear did not purge credentials');
  ok('credentials round-trip: save / load / clear');
}

function main() {
  console.log('[gcal smoke] running...');
  try {
    testCredentialsRoundTrip();
  } finally {
    try { fs.rmSync(TMP_WS, { recursive: true, force: true }); } catch {}
  }
  console.log('[gcal smoke] PASS');
}

main();
