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
