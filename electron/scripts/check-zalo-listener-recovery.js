#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const monitor = fs.readFileSync(path.join(root, 'packages', 'modoro-zalo', 'src', 'monitor.ts'), 'utf8');
const channels = fs.readFileSync(path.join(root, 'lib', 'channels.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const failures = [];

function requireMatch(label, pattern) {
  if (!pattern.test(monitor)) failures.push(`${label}: missing ${pattern}`);
}

function forbidMatch(label, pattern) {
  if (pattern.test(monitor)) failures.push(`${label}: still matches ${pattern}`);
}

requireMatch('credential version helper', /function\s+readOpenzcaCredentialsVersion\s*\(/);
requireMatch('credential-aware sleep helper', /export\s+async\s+function\s+sleepWithAbortOrCredentialChange\s*\(/);
requireMatch('circuit breaker wakes on credential refresh', /sleepWithAbortOrCredentialChange\s*\(\s*MODORO_ZALO_CIRCUIT_BREAKER_COOLDOWN_MS/);
requireMatch('normal reconnect delay wakes on credential refresh', /sleepWithAbortOrCredentialChange\s*\(\s*delayMs/);
requireMatch('listener exit logs exit code', /listener exited \(code=\$\{streamExitCode/);
if (!/function\s+_execPowerShell\s*\(/.test(channels)) {
  failures.push('windows listener probe: missing execFileSync PowerShell wrapper');
}
if (/execSync\s*\(\s*`powershell\b/i.test(channels) || /execSync\s*\(\s*'powershell\b/i.test(channels)) {
  failures.push('windows listener probe: raw shell powershell call can break on C:\\Program Files paths');
}
forbidMatch(
  'stale self id guard',
  /if\s*\(!selfId\)\s*\{[\s\S]{0,800}?runOpenzcaCommand/,
);

if (!pkg.scripts || !String(pkg.scripts['guard:architecture'] || '').includes('guard:zalo-listener')) {
  failures.push('package guard chain: guard:architecture must include guard:zalo-listener');
}

// Behavioral: the listener-liveness cache must be ASYMMETRIC — a transient
// "dead" (listener mid-respawn under load) must expire fast so sends recover in
// seconds; a "dead" cached for the full 30s window was the false-listener_dead
// bug. Exercise the real exported pure function.
{
  const ch = require(path.join(root, 'lib', 'channels.js'));
  const fresh = ch._listenerCacheFresh;
  const ALIVE = ch.ZALO_LISTENER_CACHE_TTL_ALIVE;
  const DEAD = ch.ZALO_LISTENER_CACHE_TTL_DEAD;
  if (typeof fresh !== 'function') {
    failures.push('listener cache: _listenerCacheFresh not exported');
  } else {
    if (!(DEAD <= 5000)) failures.push(`listener cache: DEAD ttl ${DEAD}ms too long — a respawn gap must not stick`);
    if (!(ALIVE >= DEAD)) failures.push('listener cache: ALIVE ttl must be >= DEAD ttl');
    if (fresh(null, 0) !== false) failures.push('listener cache: null (never probed) must be NOT fresh');
    if (fresh(true, ALIVE - 1) !== true) failures.push('listener cache: alive within ALIVE ttl must be fresh');
    if (fresh(true, ALIVE + 1) !== false) failures.push('listener cache: alive past ALIVE ttl must re-probe');
    if (fresh(false, DEAD - 1) !== true) failures.push('listener cache: dead within DEAD ttl may stay cached');
    // The regression: a dead result older than DEAD ttl (but < 30s) MUST re-probe.
    if (fresh(false, DEAD + 1) !== false) failures.push('listener cache: dead past DEAD ttl must re-probe (false-listener_dead regression)');
    if (fresh(false, 29000) !== false) failures.push('listener cache: a 29s-old dead must NOT be reused (the 30s-sticky bug)');
  }
}

if (failures.length) {
  console.error('[zalo-listener-recovery] FAIL');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}

console.log('[zalo-listener-recovery] PASS listener reconnect handles credentials refresh and stale self id');
