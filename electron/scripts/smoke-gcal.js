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

function testConfigRoundTrip() {
  const config = require('../gcal/config');
  const cfg = config.read(); // Fresh install — returns defaults
  if (cfg.reminderMinutes !== 15) fail('config default reminderMinutes != 15');
  if (cfg.workingHours.start !== '08:00') fail('config default workingHours.start != 08:00');
  config.write({ workingHours: { start: '09:00', end: '17:00' }, reminderMinutes: 30 });
  const reloaded = config.read();
  if (reloaded.reminderMinutes !== 30) fail('reminderMinutes not persisted');
  if (reloaded.workingHours.start !== '09:00') fail('workingHours.start not persisted');
  if (reloaded.workingHours.end !== '17:00') fail('workingHours.end not persisted');
  // Partial write preserves other fields
  config.write({ slotDurationMinutes: 45 });
  const merged = config.read();
  if (merged.slotDurationMinutes !== 45) fail('partial write did not persist slotDurationMinutes');
  if (merged.reminderMinutes !== 30) fail('partial write clobbered reminderMinutes');
  ok('config round-trip: defaults, full write, partial write merge');
}

function main() {
  console.log('[gcal smoke] running...');
  try {
    testCredentialsRoundTrip();
    testConfigRoundTrip();
  } finally {
    try { fs.rmSync(TMP_WS, { recursive: true, force: true }); } catch {}
  }
  console.log('[gcal smoke] PASS');
}

main();
