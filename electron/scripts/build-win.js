#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(ROOT, '..', 'dist');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

process.env.TARGET_PLATFORM = 'win32';
process.env.TARGET_ARCH = process.env.TARGET_ARCH || 'x64';

function run(cmd, args) {
  console.log(`[build-win] ${cmd} ${args.join(' ')}`);
  const quote = (value) => {
    const s = String(value);
    return /[\s&()]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
  };
  const res = spawnSync([cmd, ...args].map(quote).join(' '), {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
    shell: true,
  });
  if (res.status !== 0) {
    if (res.error) console.error('[build-win] spawn error:', res.error.message);
    if (res.signal) console.error('[build-win] terminated by signal:', res.signal);
    process.exit(res.status || 1);
  }
}

function removeIfExists(target) {
  try {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      console.log('[build-win] removed stale artifact:', target);
    }
  } catch (e) {
    // Windows: fs.rmSync fails on locked dirs. Fall back to cmd rmdir which can
    // break locks. Strip \\?\ prefix so cmd can handle the path.
    try {
      const winPath = target.replace(/^\\\\\?\\/, '');
      require('child_process').execSync(`cmd /c rmdir /s /q "${winPath}"`, { stdio: 'ignore' });
      console.log('[build-win] removed stale artifact (cmd fallback):', target);
    } catch (e2) {
      console.warn('[build-win] could not remove stale artifact:', target, e.message);
    }
  }
}

function sleep(ms) {
  try {
    require('child_process').execSync('powershell -Command "Start-Sleep -Milliseconds ' + ms + '"', { stdio: 'ignore' });
  } catch {}
}

// Run electron-builder with retry on transient Windows Defender file-lock collisions.
// electron-builder fails with "Cannot access file because it is being used by
// another process" when Windows Defender scans app.asar during unpack. Retry with
// backoff until it succeeds or exhausts attempts.
function runElectronBuilderWithRetry() {
  const maxAttempts = 3;
  const delays = [500, 2000, 5000];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      console.log('[build-win] electron-builder retry ' + attempt + '/' + maxAttempts + ' after ' + delays[attempt - 1] + 'ms...');
      sleep(delays[attempt - 1]);
      removeIfExists(path.join(DIST, 'win-unpacked'));
    }
    run(npxCmd, ['electron-builder', '--win']);
    const appAsar = path.join(DIST, 'win-unpacked', 'resources', 'app.asar');
    if (fs.existsSync(appAsar)) {
      console.log('[build-win] electron-builder succeeded');
      return true;
    }
    console.log('[build-win] electron-builder attempt ' + attempt + ' failed (no app.asar)');
  }
  console.error('[build-win] electron-builder exhausted all attempts');
  return false;
}

const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
removeIfExists(path.join(DIST, '9BizClaw Setup ' + pkgVersion + '.exe'));
removeIfExists(path.join(DIST, 'win-unpacked'));

run(npmCmd, ['run', 'prebuild:models']);
run(npmCmd, ['run', 'prebuild:vendor']);
run(npmCmd, ['run', 'prebuild:modoro-zalo']);
// Generate map BEFORE smoke — this becomes the baseline that map:check compares against.
run(process.execPath, ['scripts/generate-system-map.js']);
run(npmCmd, ['run', 'smoke']);
run(process.execPath, ['scripts/obfuscate.js']);
const ebSuccess = runElectronBuilderWithRetry();
// Always restore originals, even if electron-builder fails
const restore = spawnSync(process.execPath, ['scripts/obfuscate.js', '--restore'], {
  cwd: ROOT, env: process.env, stdio: 'inherit', shell: false,
});
if (restore.status !== 0) console.warn('[build-win] obfuscate --restore failed');
// Capture post-smoke + post-restore state as baseline for next build
spawnSync(process.execPath, ['scripts/generate-system-map.js'], {
  cwd: ROOT, env: process.env, stdio: 'inherit', shell: false,
});
if (!ebSuccess) process.exit(1);
run(process.execPath, ['scripts/fix-artifact-name.js']);
run(process.execPath, ['scripts/check-bundle-size.js', '--strict']);
