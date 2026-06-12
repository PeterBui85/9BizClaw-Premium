#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const googleApi = require(path.join(__dirname, '..', 'lib', 'google-api'));
const googleRoutes = require(path.join(__dirname, '..', 'lib', 'google-routes'));

const root = path.join(__dirname, '..');
const apiSrc = fs.readFileSync(path.join(root, 'lib', 'google-api.js'), 'utf8');
const routesSrc = fs.readFileSync(path.join(root, 'lib', 'google-routes.js'), 'utf8');
const dashboardIpcSrc = fs.readFileSync(path.join(root, 'lib', 'dashboard-ipc.js'), 'utf8');
const runtimeSrc = fs.readFileSync(path.join(root, 'lib', 'runtime-installer.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const macWorkflowSrc = fs.readFileSync(path.join(root, '..', '.github', 'workflows', 'build-mac.yml'), 'utf8');

const failures = [];
function check(name, fn) {
  try { fn(); } catch (e) { failures.push(`${name}: ${e.message}`); }
}

function findGogBinary() {
  const binName = process.platform === 'win32' ? 'gog.exe' : 'gog';
  const local = path.join(root, 'vendor', 'gog', binName);
  if (fs.existsSync(local)) return local;

  const tarPath = path.join(root, 'vendor-bundle.tar');
  const extractDir = path.join(require('os').tmpdir(), `9bizclaw-gog-help-${process.pid}-${Date.now()}`);
  const tarEntry = process.platform === 'win32' ? 'vendor/gog/gog.exe' : 'vendor/gog/gog';
  if (!fs.existsSync(tarPath)) return null;
  try {
    fs.mkdirSync(extractDir, { recursive: true });
    const tarBin = process.platform === 'win32'
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
    const res = spawnSync(tarBin, ['-xf', tarPath, '-C', extractDir, tarEntry], { encoding: 'utf8', timeout: 30000 });
    if (res.status !== 0) return null;
    const extracted = path.join(extractDir, tarEntry);
    return fs.existsSync(extracted) ? extracted : null;
  } catch {
    return null;
  }
}

check('google-api searches runtime gog path', () => {
  assert(apiSrc.includes("require('./runtime-installer')"));
  assert(apiSrc.includes('getRuntimeNodeDir'));
});

check('google-api lazily installs gog when missing', () => {
  assert(apiSrc.includes('ensureGogBinaryAvailable'));
  assert(apiSrc.includes('runtimeInstaller.ensureGogCli()'));
});

check('google-api caps docs read by default', () => {
  assert(apiSrc.includes('|| 200000'));
  assert(apiSrc.includes('1000000'));
  assert(apiSrc.includes("'--max-bytes'"));
});

check('google-api uses temp files for efficient docs writes', () => {
  assert(apiSrc.includes('withTempTextFile'));
  assert(apiSrc.includes("'--file'"));
  assert.strictEqual(typeof googleApi._test.shouldUseTempTextFile, 'function');
  assert.strictEqual(googleApi._test.shouldUseTempTextFile('x'.repeat(40000)), true);
});

check('google-routes blocks both Zalo channel headers for Gmail mutation', () => {
  assert(routesSrc.includes("req.headers['x-source-channel'] || req.headers['x-9bizclaw-agent-channel']"));
  assert(routesSrc.includes('if (isZalo) return jsonResp(res, 403'));
});

check('runtime installer verifies gog archive SHA256', () => {
  assert(runtimeSrc.includes('GOG_ARCHIVE_SHA256'));
  assert(runtimeSrc.includes('verifyDownloadedGogArchive(tmp)'));
  assert(runtimeSrc.includes('verifyDownloadedGogArchive(tmp2)'));
});

check('runtime installer tracks gog readiness truthfully', () => {
  assert(runtimeSrc.includes('const gogReady = await checkGogCliReady()'));
  assert(runtimeSrc.includes('needsGogInstall: !gogReady'));
  assert(runtimeSrc.includes("await execFilePromise(gogBin, ['version']"));
  assert(runtimeSrc.includes('gogcli installed but failed readiness check'));
  assert(!runtimeSrc.includes('gogReady: true,\n    needsGogInstall: false'));
});

check('sheets helper still exported', () => {
  assert.strictEqual(typeof googleRoutes._test.normalizeSheetValues, 'function');
});

check('homedir path validation uses relative path', () => {
  assert(routesSrc.includes('path.relative(home, resolved)'));
  assert(routesSrc.includes("relative.startsWith('..')"));
  assert(routesSrc.includes('path.isAbsolute(relative)'));
  assert.strictEqual(googleRoutes.isHomedirPathSafe(path.join(require('os').homedir() + '-evil', 'doc.txt')), false);
});

check('dashboard sheets IPC reuses route helpers', () => {
  assert(dashboardIpcSrc.includes('googleRoutes.normalizeSheetValues'));
  assert(dashboardIpcSrc.includes('googleRoutes.fitSheetRangeToValues'));
});

check('apps script is included in health probe', () => {
  assert(apiSrc.includes('probeAppScriptAccess'));
  assert(apiSrc.includes("probeService('appscript'"));
});

// Why this matters: the keyring backend is PLATFORM-SPECIFIC and getting it wrong
// silently breaks Google. gog v0.13.0 accepts ONLY auto|keychain|file (any other
// value errors "invalid keyring backend"). macOS/Linux must force 'file' (the
// unsigned, runtime-downloaded gog binary loses Keychain ACL access -> "secret
// not found in keyring"; 'auto'/'keychain' would pick the broken Keychain).
// Windows must use 'auto' (gog picks Credential Manager): 'file' uses colon
// filenames illegal on Windows, 'keychain' is "not available", 'wincred' is an
// invalid value. All verified against the real binary, 2026-06.
const GOG_VALID_BACKENDS = ['auto', 'keychain', 'file'];
check('gog keyring backend is valid + correct per platform (Windows=auto, else file)', () => {
  const env = googleApi._test.gogEnv();
  // Hard allowlist: catches invalid values gog would reject at runtime (e.g. the
  // 'wincred' regression). gogEnv must never emit a value outside this set.
  assert(GOG_VALID_BACKENDS.includes(env.GOG_KEYRING_BACKEND),
    `GOG_KEYRING_BACKEND must be one of ${GOG_VALID_BACKENDS.join('|')} (gog rejects anything else); got "${env.GOG_KEYRING_BACKEND}"`);
  if (process.platform === 'win32') {
    assert.strictEqual(env.GOG_KEYRING_BACKEND, 'auto',
      'Windows must use auto (Credential Manager); file=colon filenames, keychain=unavailable, wincred=invalid');
  } else {
    assert.strictEqual(env.GOG_KEYRING_BACKEND, 'file',
      'macOS/Linux must force GOG_KEYRING_BACKEND=file (Keychain is unreliable for the unsigned gog binary)');
    assert(typeof env.GOG_KEYRING_PASSWORD === 'string' && env.GOG_KEYRING_PASSWORD.length >= 32,
      'file backend needs a stable, non-empty passphrase or it errors with no TTY');
    assert.strictEqual(googleApi._test.gogEnv().GOG_KEYRING_PASSWORD, env.GOG_KEYRING_PASSWORD,
      'passphrase must be stable across calls, else gog cannot decrypt what an earlier run wrote');
  }
  // Ordering invariant (behavioral): the backend key is set AFTER the
  // ...process.env spread, so a stale inherited GOG_KEYRING_BACKEND — e.g. a
  // customer-applied workaround — must NOT override our platform choice.
  const want = process.platform === 'win32' ? 'auto' : 'file';
  const prev = process.env.GOG_KEYRING_BACKEND;
  process.env.GOG_KEYRING_BACKEND = want === 'file' ? 'auto' : 'file';
  try {
    assert.strictEqual(googleApi._test.gogEnv().GOG_KEYRING_BACKEND, want,
      'inherited GOG_KEYRING_BACKEND must not override the platform choice');
  } finally {
    if (prev === undefined) delete process.env.GOG_KEYRING_BACKEND;
    else process.env.GOG_KEYRING_BACKEND = prev;
  }
});

check('stale token after keyring move is detected as needs-reconnect (not silently "connected")', () => {
  assert.strictEqual(typeof googleApi._test.isGogNoAuth, 'function');
  // The exact string a customer hit on Mac after v2.4.13 moved Keychain -> file.
  // authStatus must treat this as NOT connected so the UI offers a one-tap
  // reconnect instead of a "connected" state where every Gmail call fails.
  const real = 'No auth for gmail le.nuong2307@gmail.com. OAuth (browser flow): gog auth add le.nuong2307@gmail.com --services gmail';
  assert(googleApi._test.isGogNoAuth(real), 'observed gog no-auth message must be classified as needs-reconnect');
  assert(googleApi._test.isGogNoAuth('secret not found in keyring (refresh token missing)'), 'Mac Keychain miss must be needs-reconnect');
  // A genuinely-connected status line must NOT trip the detector (no false reconnect prompt).
  assert(!googleApi._test.isGogNoAuth('gmail: authorized (token ok)'), 'a healthy status must not be flagged as needs-reconnect');
});

check('keyring migration uses gog tokens export/import so working users skip reconnect', () => {
  assert.strictEqual(typeof googleApi._test.buildTokenExportArgs, 'function');
  assert.strictEqual(typeof googleApi._test.buildTokenImportArgs, 'function');
  // export reads from the active backend; --overwrite so a stale migrate file can't wedge it.
  assert.deepStrictEqual(
    googleApi._test.buildTokenExportArgs('ceo@example.com', '/tmp/t.json'),
    ['auth', 'tokens', 'export', 'ceo@example.com', '--out', '/tmp/t.json', '--overwrite'],
    'export args must match gog v0.13.0 CLI (auth tokens export <email> --out <path> --overwrite)');
  assert.deepStrictEqual(
    googleApi._test.buildTokenImportArgs('/tmp/t.json'),
    ['auth', 'tokens', 'import', '/tmp/t.json'],
    'import args must match gog v0.13.0 CLI (auth tokens import <inPath>)');
});

check('gog connect forces consent so Google issues a refresh token', () => {
  const args = googleApi._test.buildAuthAddArgs('ceo@example.com');
  assert.strictEqual(args[0], 'auth');
  assert.strictEqual(args[1], 'add');
  assert.strictEqual(args[2], 'ceo@example.com');
  assert(args.includes('--services'), 'auth add must request the wrapped services');
  assert(args.includes('--force-consent'),
    'auth add must pass --force-consent or a reconnect returns no refresh token');
});

check('release build paths run smoke before electron-builder', () => {
  assert.strictEqual(packageJson.scripts['build:win'], 'node scripts/build-win.js');
  assert(packageJson.scripts['build:mac'].includes('smoke'));
  assert(packageJson.scripts['build:mac:arm'].includes('smoke'));
  assert(packageJson.scripts['build:mac:intel'].includes('smoke'));
  assert(macWorkflowSrc.includes('Run smoke guards'));
});

check('gog CLI help covers wrapped services when binary exists', () => {
  const gogBin = findGogBinary();
  if (!gogBin) return;
  const services = ['calendar', 'gmail', 'drive', 'contacts', 'tasks', 'sheets', 'docs', 'appscript'];
  for (const service of services) {
    const res = spawnSync(gogBin, [service, '--help'], { encoding: 'utf8', timeout: 10000 });
    assert.strictEqual(res.status, 0, `${service} --help failed: ${(res.stderr || res.stdout || '').slice(0, 200)}`);
  }
});

if (failures.length) {
  console.error('[google-workspace-audit-fixes] FAIL');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}

console.log('[google-workspace-audit-fixes] PASS audit fixes are wired');
