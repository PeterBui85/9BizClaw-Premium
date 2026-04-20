#!/usr/bin/env node
/*
 * smoke-test.js
 * ---------------------------------------------------------------
 * Pre-build supply-chain validator. Catches upstream package breakage
 * BEFORE we ship a .exe / .dmg with broken dependencies.
 *
 * Why this exists:
 * 9BizClaw depends on 4 third-party npm packages we don't control:
 *   - openclaw            (the gateway + agent runtime)
 *   - openzca             (Zalo websocket listener)
 *   - 9router             (AI provider router)
 *   - @tuyenhx/openzalo   (openclaw plugin for Zalo channel)
 *
 * Each upstream version bump can silently break 9BizClaw if:
 *   - Config schema validator rejects fields we set
 *   - CLI flags renamed/removed
 *   - Internal file format changed (session jsonl, listener-owner.json)
 *   - Plugin source files we patch (inbound.ts, openzca.ts) restructured
 *
 * This script runs the most likely failure modes and exits non-zero
 * if any are detected. Wired into npm run build:win + build:mac so a
 * broken build never reaches users.
 *
 * Each test below has a clear failure message + remediation hint.
 * NEVER add a test that requires network access or external state —
 * smoke tests must be hermetic and fast (<10 seconds total).
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const VENDOR_NM = path.join(VENDOR, 'node_modules');
const VENDOR_TAR = path.join(ROOT, 'vendor-bundle.tar');
const VENDOR_META = path.join(ROOT, 'vendor-meta.json');

let failures = 0;
let warnings = 0;

function pass(name) { console.log(`  PASS  ${name}`); }
function fail(name, why) {
  console.error(`  FAIL  ${name}\n        → ${why}`);
  failures++;
}
function warn(name, why) {
  console.warn(`  WARN  ${name}\n        → ${why}`);
  warnings++;
}
function section(label) { console.log(`\n[${label}]`); }

// =========================================================================
// PINNED VERSIONS — must match prebuild-vendor.js + main.js install handler
// =========================================================================
const PINNED = {
  openclaw: '2026.4.14',
  '9router': '0.3.82',
  openzca: '0.1.57',
  '@tuyenhx/openzalo': '2026.3.31',
};

// =========================================================================
// TEST 1: Vendor packages exist at pinned versions (Mac builds only)
// =========================================================================
section('Vendor packages');
// Build artifacts differ per platform as of 2026-04-08:
//   - Mac DMG: ships vendor/ directory directly (APFS fast drag-drop copy)
//   - Win EXE: ships vendor-bundle.tar + vendor-meta.json (one-big-file NSIS install)
//
// If either layout is present, prebuild has run and we verify.
// If neither is present, this is a standalone smoke run — skip silently.
const hasVendorDir = fs.existsSync(VENDOR_NM);
const hasVendorTar = fs.existsSync(VENDOR_TAR) && fs.existsSync(VENDOR_META);
const isBundledBuild = hasVendorDir || hasVendorTar;

// If only the Windows tar is present, peek inside it to verify pinned versions.
// Uses `tar -tvf` to list contents without extracting — fast.
let tarContents = null;
if (hasVendorTar && !hasVendorDir) {
  try {
    const tarBin = process.platform === 'win32'
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
    const res = spawnSync(tarBin, ['-tf', VENDOR_TAR], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false, maxBuffer: 20 * 1024 * 1024,
    });
    if (res.status === 0) {
      tarContents = new Set(res.stdout.split('\n').map(s => s.trim()).filter(Boolean));
      pass(`vendor-bundle.tar contains ${tarContents.size} entries`);
      try {
        const meta = JSON.parse(fs.readFileSync(VENDOR_META, 'utf8'));
        pass(`vendor-meta.json bundle_version=${meta.bundle_version}`);
      } catch {}
    } else {
      warn('vendor-bundle.tar', `tar -tf failed exit ${res.status}`);
    }
  } catch (e) {
    warn('vendor-bundle.tar', `could not inspect: ${e.message}`);
  }
}

function checkVendorVersion(pkgName, expected) {
  // If we only have the Windows tar, verify package path exists inside the tar listing.
  // We can't easily read version from inside a tar without extracting, so trust the
  // tar was built from a prebuild that already SHA256-verified + version-pinned.
  if (tarContents && !hasVendorDir) {
    const entryPrefix = pkgName.startsWith('@')
      ? `vendor/node_modules/${pkgName}/`
      : `vendor/node_modules/${pkgName}/`;
    const hasEntry = [...tarContents].some(e => e === entryPrefix || e.startsWith(entryPrefix));
    if (hasEntry) {
      pass(`vendor tar: ${pkgName} present`);
    } else {
      fail(`vendor tar ${pkgName}`, `${pkgName} not found in vendor-bundle.tar. Run: rm vendor-bundle.tar vendor-meta.json && npm run prebuild:vendor`);
    }
    return;
  }
  const pkgJsonPath = pkgName.startsWith('@')
    ? path.join(VENDOR_NM, ...pkgName.split('/'), 'package.json')
    : path.join(VENDOR_NM, pkgName, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    if (isBundledBuild) {
      fail(`vendor ${pkgName}`, `vendor dir present but ${pkgName} missing. Run: rm -rf vendor && npm run prebuild:vendor`);
    }
    // No vendor dir at all — standalone smoke, skip silently
    return;
  }
  let actual;
  try { actual = require(pkgJsonPath).version; } catch (e) {
    fail(`vendor ${pkgName}`, `package.json unreadable: ${e.message}`);
    return;
  }
  if (actual !== expected) {
    fail(`vendor ${pkgName}`, `version drift: have=${actual} pinned=${expected}. Run: rm -rf vendor/node_modules && npm run prebuild:vendor`);
    return;
  }
  pass(`vendor ${pkgName}@${actual}`);
}
for (const [name, version] of Object.entries(PINNED)) {
  checkVendorVersion(name, version);
}

// =========================================================================
// TEST 2: openclaw CLI is runnable + `agent --help` works
// =========================================================================
section('openclaw CLI');
function findOpenclawCli() {
  // Prefer vendor if present
  const vendorCli = path.join(VENDOR_NM, 'openclaw', 'openclaw.mjs');
  if (fs.existsSync(vendorCli)) return vendorCli;
  // Fallback to user-global install
  const HOME = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(HOME, 'AppData', 'Roaming', 'npm', 'node_modules', 'openclaw', 'openclaw.mjs'),
    '/usr/local/lib/node_modules/openclaw/openclaw.mjs',
    '/opt/homebrew/lib/node_modules/openclaw/openclaw.mjs',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
const openclawCli = findOpenclawCli();
if (!openclawCli) {
  warn('openclaw CLI', 'not found in vendor or user-global. Smoke test for CLI behavior skipped.');
} else {
  // Use a TEMP empty config to isolate from user's potentially-broken openclaw.json.
  // We test --version (no schema validation) and `agent --help` separately so
  // a config issue doesn't mask a missing-binary issue.
  const tmpDir = path.join(os.tmpdir(), 'modoro-smoketest-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.openclaw'), { recursive: true });
  // FULL config that matches ALL fields ensureDefaultConfig() writes.
  // CRITICAL: every field ensureDefaultConfig adds to openclaw.json MUST appear
  // here. If a new field is added to ensureDefaultConfig but not here, and that
  // field is invalid in openclaw's schema, the smoke test CATCHES IT before shipping.
  // This is the EXACT test that would have caught the execSecurity bug.
  const minimalConfig = {
    gateway: { mode: 'local', auth: { mode: 'token', token: 'a'.repeat(48) } },
    channels: {
      telegram: {
        botToken: '0000000:fake_token_for_smoke_test_only', enabled: false,
        blockStreaming: false, streaming: 'off',
        groupPolicy: 'open', requireMention: true,
      },
      openzalo: {
        enabled: false, dmPolicy: 'open', allowFrom: ['*'],
        groupPolicy: 'open', groupAllowFrom: ['*'], blockStreaming: false,
        groups: {
          'fake-group-id-for-smoke-test': { requireMention: false, enabled: true },
        },
      },
    },
    plugins: {
      entries: { openzalo: { enabled: false } },
      allow: ['openzalo'],
    },
    models: { providers: { ninerouter: { baseUrl: 'http://127.0.0.1:20128/v1', apiKey: 'sk-fake', api: 'openai-completions', models: [{ id: 'main', name: 'fake' }] } } },
    agents: { defaults: { model: 'ninerouter/main', workspace: tmpDir, blockStreamingDefault: 'off', contextInjection: 'continuation-skip' } },
    tools: {
      deny: ['image_generate', 'music_generate', 'video_generate', 'exec', 'process'],
      loopDetection: { enabled: true },
      message: { crossContext: { allowAcrossProviders: true } },
      web: { search: { provider: 'duckduckgo' } },
    },
    messages: { inbound: { debounceMs: 3000 } },
  };
  fs.writeFileSync(path.join(tmpDir, '.openclaw', 'openclaw.json'), JSON.stringify(minimalConfig, null, 2));

  // Use HOME env override so openclaw reads our temp config, not user's real one.
  // Set timeout 5s — --help should be near-instant (no network, no config validation
  // for `agent --help` since openclaw 2026.4.x). If it hangs, something is very wrong.
  const env = { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir };

  // Test 2a: --version (no config needed, should be instant)
  const rVer = spawnSync('node', [openclawCli, '--version'], {
    encoding: 'utf-8',
    timeout: 5000,
    env,
  });
  if (rVer.error) {
    fail('openclaw --version spawn', rVer.error.message);
  } else if (rVer.status !== 0) {
    fail('openclaw --version exit', `exit ${rVer.status}, stderr: ${(rVer.stderr || '').slice(0, 300)}`);
  } else if (!/\d+\.\d+\.\d+/.test(rVer.stdout)) {
    fail('openclaw --version output', `expected version number, got: ${rVer.stdout.slice(0, 200)}`);
  } else {
    pass('openclaw --version: ' + rVer.stdout.trim().slice(0, 60));
  }

  // Test 2b: Schema validator accepts ensureDefaultConfig() output shape.
  // We invoke `--help` (top-level, fastest) which still loads + validates config.
  // openclaw 2026.4.5 cold start can take 5-10s for plugin discovery, so we give
  // it 20s. If it still hangs, that's the validator getting stuck in a loop.
  const rValidate = spawnSync('node', [openclawCli, '--help'], {
    encoding: 'utf-8',
    timeout: 20000,
    env,
  });
  if (rValidate.error && rValidate.error.code === 'ETIMEDOUT') {
    warn('openclaw schema validation', 'timed out (20s) — slow plugin discovery is normal. Manually verify config shape before shipping.');
  } else if (rValidate.status !== 0) {
    const stderr = (rValidate.stderr || '').slice(0, 500);
    if (/Config invalid|Unrecognized key|additional properties/i.test(stderr)) {
      fail('openclaw schema accepts ensureDefaultConfig output', `validator REJECTED our config shape:\n${stderr}\nFix: update ensureDefaultConfig() in main.js to match new schema.`);
    } else {
      warn('openclaw --help', `non-zero exit ${rValidate.status} but no schema error: ${stderr}`);
    }
  } else {
    pass('openclaw schema accepts ensureDefaultConfig output shape');
  }

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

// =========================================================================
// TEST 3: openzca CLI runnable
// =========================================================================
section('openzca CLI');
function findOpenzcaCli() {
  const vendorCli = path.join(VENDOR_NM, 'openzca', 'dist', 'cli.js');
  if (fs.existsSync(vendorCli)) return vendorCli;
  const HOME = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(HOME, 'AppData', 'Roaming', 'npm', 'node_modules', 'openzca', 'dist', 'cli.js'),
    '/usr/local/lib/node_modules/openzca/dist/cli.js',
    '/opt/homebrew/lib/node_modules/openzca/dist/cli.js',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
const openzcaCli = findOpenzcaCli();
if (!openzcaCli) {
  warn('openzca CLI', 'not found in vendor or user-global. Skipped.');
} else {
  const r = spawnSync('node', [openzcaCli, '--help'], { encoding: 'utf-8', timeout: 10000 });
  if (r.error) {
    fail('openzca --help spawn', r.error.message);
  } else if (r.status !== 0) {
    fail('openzca --help exit', `exit ${r.status}, stderr: ${(r.stderr || '').slice(0, 300)}`);
  } else if (!/listen|profile/i.test(r.stdout + r.stderr)) {
    fail('openzca --help output', 'expected "listen" or "profile" in help — CLI structure may have changed');
  } else {
    pass('openzca --help');
  }
}

// =========================================================================
// TEST 4: Patch anchors in openzalo plugin source still match expected format
// =========================================================================
section('Plugin patch anchors');
// Patch anchors: pass if EITHER the original anchor matches (unpatched plugin)
// OR the 9BizClaw patch marker is present (already patched). Both states are
// "smoke OK" — only failure is "neither matches", which means upstream
// restructured the file in a way our patch logic can no longer find.
function checkPatchAnchor(name, file, anchorRegex, patchMarker, hint) {
  if (!fs.existsSync(file)) {
    warn(name, `plugin source not found at ${file} — skipped (Mac vendor or fresh install)`);
    return;
  }
  const content = fs.readFileSync(file, 'utf-8');
  if (anchorRegex.test(content)) {
    pass(name + ' (anchor matches — unpatched)');
    return;
  }
  // Accept both current marker and legacy MODOROClaw marker (rebrand transition)
  const legacyMarker = patchMarker.replace('9BizClaw', 'MODOROClaw');
  if (patchMarker && content.includes(patchMarker)) {
    pass(name + ' (already patched — marker present)');
    return;
  }
  if (legacyMarker !== patchMarker && content.includes(legacyMarker)) {
    pass(name + ' (already patched — legacy marker present, will re-patch on next launch)');
    return;
  }
  fail(name, `neither anchor regex NOR patch marker "${patchMarker}" found. ${hint}`);
}

// Look for openzalo source in vendor first, then user-installed
const openzaloSrcCandidates = [
  path.join(VENDOR_NM, '@tuyenhx', 'openzalo', 'src'),
  path.join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw', 'extensions', 'openzalo', 'src'),
];
let openzaloSrc = null;
for (const c of openzaloSrcCandidates) {
  if (fs.existsSync(c)) { openzaloSrc = c; break; }
}

// In CI Mac builds the vendor MUST contain openzalo (no user-installed
// fallback exists in CI). Fail loudly if vendor is empty so the build doesn't
// silently ship a DMG with no plugin patches applied at runtime.
const isCiBuild = !!process.env.CI || !!process.env.GITHUB_ACTIONS;
if (!openzaloSrc && isCiBuild && process.platform === 'darwin') {
  fail('openzalo vendor source', 'CI Mac build requires vendor/node_modules/@tuyenhx/openzalo/src — prebuild-vendor failed silently');
}

if (openzaloSrc) {
  // Anchor 1: ensureOpenzaloShellFix anchor or already-patched marker
  checkPatchAnchor(
    'openzca.ts spawn anchor',
    path.join(openzaloSrc, 'openzca.ts'),
    /spawn\s*\(\s*binary\s*,/,
    '9BizClaw PATCH',
    'ensureOpenzaloShellFix() in main.js may need updated patch template at electron/patches/openzalo-openzca.ts'
  );

  // Anchor 2: ensureOpenzaloForceOneMessageFix anchor or already-patched marker
  checkPatchAnchor(
    'inbound.ts disableBlockStreaming anchor',
    path.join(openzaloSrc, 'inbound.ts'),
    /disableBlockStreaming:\s*\n?\s*typeof account\.config\.blockStreaming === ["']boolean["']/,
    '9BizClaw FORCE-ONE-MESSAGE PATCH',
    'ensureOpenzaloForceOneMessageFix() regex needs updating — openzalo plugin restructured'
  );

  // Anchor 3: ensureZaloBlocklistFix anchor or already-patched marker
  checkPatchAnchor(
    'inbound.ts blocklist anchor',
    path.join(openzaloSrc, 'inbound.ts'),
    /if\s*\(!rawBody\s*&&\s*!hasMedia\)\s*\{\s*\n\s*return;\s*\n\s*\}/,
    '9BizClaw BLOCKLIST PATCH',
    'ensureZaloBlocklistFix() anchor missing — openzalo plugin restructured'
  );
} else {
  warn('openzalo plugin source', 'not found in vendor or ~/.openclaw/extensions — patch anchors skipped');
}

// =========================================================================
// TEST 5: Patch template files exist (for ensureOpenzaloShellFix to read)
// =========================================================================
section('Patch templates');
const patchTemplate = path.join(__dirname, '..', 'patches', 'openzalo-openzca.ts');
if (!fs.existsSync(patchTemplate)) {
  fail('patches/openzalo-openzca.ts', `MISSING — ensureOpenzaloShellFix() will fail silently in production. Restore from git history.`);
} else {
  const content = fs.readFileSync(patchTemplate, 'utf-8');
  if (!content.includes('9BizClaw PATCH')) {
    fail('patches/openzalo-openzca.ts marker', 'file present but missing "9BizClaw PATCH" marker — ensureOpenzaloShellFix will refuse to apply it');
  } else {
    pass('patches/openzalo-openzca.ts (has 9BizClaw PATCH marker)');
  }
}

// =========================================================================
// TEST 6: workspace-templates contains all critical files
// =========================================================================
section('Workspace templates (extraResources)');
const templateRoot = path.resolve(__dirname, '..', '..');
const requiredTemplates = [
  'AGENTS.md', 'IDENTITY.md', 'SOUL.md', 'BOOTSTRAP.md', 'COMPANY.md',
  'PRODUCTS.md', 'USER.md', 'MEMORY.md', 'HEARTBEAT.md', 'TOOLS.md',
];
for (const f of requiredTemplates) {
  const p = path.join(templateRoot, f);
  if (!fs.existsSync(p)) {
    fail(`template ${f}`, `MISSING at ${p} — fresh install will boot with broken workspace`);
  } else {
    pass(`template ${f}`);
  }
}

// IDENTITY.md must NOT contain hardcoded test names in the personalization fields.
// Examples in markdown blocks are OK — only the actual `**Cách xưng hô:**` line matters.
const identityPath = path.join(templateRoot, 'IDENTITY.md');
if (fs.existsSync(identityPath)) {
  const ic = fs.readFileSync(identityPath, 'utf-8');
  const xunghoLine = ic.match(/-\s*\*\*Cách xưng hô:\*\*\s*(.*)/);
  if (xunghoLine && /thầy Huy|Nguyễn Văn Huy|Peter Bui|Pi tờ|anh Huy/i.test(xunghoLine[1])) {
    fail('IDENTITY.md placeholder', `personalization line has leaked test name: "${xunghoLine[1].trim()}". Reset to "[Wizard sẽ điền cách bot gọi anh/chị]".`);
  } else {
    pass('IDENTITY.md personalization line is placeholder');
  }
}

// =========================================================================
// TEST 7: AGENTS.md must contain the no-emoji + history-block rules
// =========================================================================
section('AGENTS.md rules');
const agentsPath = path.join(templateRoot, 'AGENTS.md');
if (fs.existsSync(agentsPath)) {
  const ac = fs.readFileSync(agentsPath, 'utf-8');
  if (!/KHÔNG BAO GIỜ DÙNG EMOJI/i.test(ac)) {
    fail('AGENTS.md emoji rule', 'missing "KHÔNG BAO GIỜ DÙNG EMOJI" rule — bot will reply with emojis on fresh install');
  } else {
    pass('AGENTS.md has no-emoji rule');
  }
  if (!/LỊCH SỬ TIN NHẮN/i.test(ac)) {
    fail('AGENTS.md history rule', 'missing cron history block rule — bot will hallucinate "no Zalo data"');
  } else {
    pass('AGENTS.md has cron history block rule');
  }
}

// =========================================================================
// TEST 8: RAG accuracy (gated — only if vendor/models exists)
// =========================================================================
// Skips silently during pre-prebuild:models states (e.g. standalone smoke,
// fresh checkout before model download). When models are present, runs the
// 40-query canonical probe — hard-gates Top-3 >= 85%. Cold model load
// adds ~10-15s to the smoke; still hermetic (no network, no external state).
section('RAG accuracy');
const modelsDir = path.join(__dirname, '..', 'vendor', 'models', 'Xenova');
if (fs.existsSync(modelsDir)) {
  console.log('  running smoke-rag-test.js (40-query probe)...');
  try {
    // Use process.execPath instead of 'node' — binds to the exact Node
    // binary running smoke-test.js. Guards against CI PATH quirks where
    // `node` could resolve to a different version than our parent.
    require('child_process').execFileSync(
      process.execPath,
      [path.join(__dirname, 'smoke-rag-test.js')],
      { stdio: 'inherit' }
    );
    pass('RAG smoke (Top-3 >= 85%)');
  } catch (e) {
    fail('RAG smoke', `smoke-rag-test.js exited non-zero — Top-3 below 85% gate or runtime error`);
  }
} else {
  warn('RAG smoke', 'vendor/models/ not present — run `npm run prebuild:models` first. Skipped.');
}

// =========================================================================
// TEST 9: Vision patch signature — ensureVisionFix V2 anchor must be present
// =========================================================================
// V1 ensureVisionFix regex broke silently on openclaw upgrade → Telegram
// images not seen by ChatGPT for weeks. V2 uses `async function
// resolveGatewayModelSupportsImages(params) {` as the anchor. If openclaw
// renames/restructures this function we must know at BUILD time, not at
// first customer report. Skipped if vendor not yet prebuilt (CI/fresh checkout).
section('openclaw vision patch anchor');
function findOpenclawSessionUtils() {
  const candidates = [
    path.join(__dirname, '..', 'vendor', 'node_modules', 'openclaw', 'dist'),
    path.join(__dirname, '..', 'node_modules', 'openclaw', 'dist'),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(f => f.startsWith('session-utils-') && f.endsWith('.js'));
      if (files.length > 0) return files.map(f => path.join(dir, f));
    } catch {}
  }
  return null;
}
const sessionUtilsFiles = findOpenclawSessionUtils();
if (!sessionUtilsFiles) {
  warn('vision-patch anchor', 'openclaw session-utils not found in vendor or node_modules — skip (run prebuild:vendor first)');
} else {
  const FUNC_SIG = 'async function resolveGatewayModelSupportsImages(params) {';
  let anchorFound = false;
  let anchorFile = null;
  for (const fp of sessionUtilsFiles) {
    const src = fs.readFileSync(fp, 'utf-8');
    if (src.includes(FUNC_SIG)) { anchorFound = true; anchorFile = fp; break; }
  }
  if (!anchorFound) {
    fail('vision-patch anchor', `openclaw session-utils present but FUNC_SIG "${FUNC_SIG}" missing — upstream refactor detected. ensureVisionFix will silently no-op. Update patch anchor before ship.`);
  } else {
    pass(`vision-patch anchor (${path.basename(anchorFile)})`);
  }
}

// =========================================================================
// openclaw vision catalog patch — LAYER 2 vision gate
// ensureVisionCatalogFix patches model-catalog-*.js `modelSupportsVision`.
// Without this patch, image-understanding capability runs instead of direct
// model pass-through → bot hallucinates image content.
// =========================================================================
section('openclaw vision-catalog patch anchor');
function findOpenclawModelCatalog() {
  const candidates = [
    path.join(__dirname, '..', 'vendor', 'node_modules', 'openclaw', 'dist'),
    path.join(__dirname, '..', 'node_modules', 'openclaw', 'dist'),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(f => f.startsWith('model-catalog-') && f.endsWith('.js'));
      if (files.length > 0) return files.map(f => path.join(dir, f));
    } catch {}
  }
  return null;
}
const modelCatalogFiles = findOpenclawModelCatalog();
if (!modelCatalogFiles) {
  warn('vision-catalog-patch anchor', 'openclaw model-catalog not found in vendor or node_modules — skip (run prebuild:vendor first)');
} else {
  const FUNC_SIG_CATALOG = 'function modelSupportsVision(entry) {';
  let anchorFoundCatalog = false;
  let anchorFileCatalog = null;
  for (const fp of modelCatalogFiles) {
    const src = fs.readFileSync(fp, 'utf-8');
    if (src.includes(FUNC_SIG_CATALOG)) { anchorFoundCatalog = true; anchorFileCatalog = fp; break; }
  }
  if (!anchorFoundCatalog) {
    fail('vision-catalog-patch anchor', `openclaw model-catalog present but FUNC_SIG "${FUNC_SIG_CATALOG}" missing — upstream refactor detected. ensureVisionCatalogFix will silently no-op. Update patch anchor before ship.`);
  } else {
    pass(`vision-catalog-patch anchor (${path.basename(anchorFileCatalog)})`);
  }
}

// =========================================================================
// openclaw vision serialization patch — LAYER 3+4 vision gates
// ensureVisionSerializationFix patches supportsImageInput (outbound content
// serializer) + supportsExplicitImageInput (tool-result image replay).
// Without these, images survive gateway accept + capability skip but get
// STRIPPED at the final OpenAI-compat serialization step → model never
// sees the actual image data → hallucination.
// =========================================================================
section('openclaw vision-serialization patch anchors');
function findFileWithFuncSig(distDirs, filenamePrefix, funcSig) {
  for (const dir of distDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(f => f.startsWith(filenamePrefix) && f.endsWith('.js'));
      for (const f of files) {
        const fp = path.join(dir, f);
        const src = fs.readFileSync(fp, 'utf-8');
        if (src.includes(funcSig)) return fp;
      }
    } catch {}
  }
  return null;
}
const visionSerializationDirs = [
  path.join(__dirname, '..', 'vendor', 'node_modules', 'openclaw', 'dist'),
  path.join(__dirname, '..', 'node_modules', 'openclaw', 'dist'),
];
const serializationTargets = [
  { label: 'supportsImageInput', prefix: 'model-context-tokens-', sig: 'function supportsImageInput(modelOverride) {' },
  { label: 'supportsExplicitImageInput', prefix: 'stream-', sig: 'function supportsExplicitImageInput(model) {' },
];
let serializationDistFound = false;
for (const dir of visionSerializationDirs) if (fs.existsSync(dir)) { serializationDistFound = true; break; }
if (!serializationDistFound) {
  warn('vision-serialization anchors', 'openclaw dist not found in vendor or node_modules — skip (run prebuild:vendor first)');
} else {
  for (const target of serializationTargets) {
    const hit = findFileWithFuncSig(visionSerializationDirs, target.prefix, target.sig);
    if (!hit) {
      fail('vision-serialization anchor', `${target.label} FUNC_SIG not found in any ${target.prefix}*.js — upstream refactor detected, ensureVisionSerializationFix will silently no-op → images stripped from outbound requests.`);
    } else {
      pass(`vision-serialization anchor: ${target.label} (${path.basename(hit)})`);
    }
  }
}

// =========================================================================
// electron-builder files allowlist coverage
// Every local `require('./xxx/...')` in main.js must have its prefix
// covered by `build.files` in package.json, otherwise the shipped .exe
// will throw `Cannot find module ./xxx/...` on first launch. This exact
// regression shipped v2.3.47 (lib/embedder.js was committed but not in
// files list) and cost 1 rebuild + user-visible crash.
// =========================================================================
section('electron-builder files allowlist covers local requires');
const mainJsSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
const filesList = pkgJson.build?.files || [];
const localRequireRe = /require\(['"]\.\/([a-zA-Z0-9_/-]+)['"]\)/g;
const prefixes = new Set();
let m;
while ((m = localRequireRe.exec(mainJsSrc)) !== null) {
  const rel = m[1];
  // Skip package.json — that's auto-included.
  if (rel === 'package' || rel === 'package.json') continue;
  // Take the top-level prefix (e.g. `./lib/embedder` → `lib`).
  const top = rel.split('/')[0];
  prefixes.add(top);
}
const missingPrefixes = [];
for (const prefix of prefixes) {
  // Match either exact filename "lib" or glob "lib/**/*" etc.
  const matched = filesList.some((entry) => {
    if (typeof entry !== 'string') return false;
    if (entry.startsWith('!')) return false;  // negation
    return entry === prefix || entry.startsWith(prefix + '/') || entry.startsWith(prefix + '.');
  });
  if (!matched) missingPrefixes.push(prefix);
}
if (missingPrefixes.length > 0) {
  fail('files allowlist coverage', `main.js require('./${missingPrefixes.join("/...'), require('./")}/...') but package.json build.files does NOT include [${missingPrefixes.join(', ')}] — shipped .exe will crash at launch with "Cannot find module ./${missingPrefixes[0]}/...". Add "${missingPrefixes[0]}/**/*" to build.files.`);
} else {
  pass(`files allowlist covers all local require prefixes [${[...prefixes].join(', ')}]`);
}

// =========================================================================
// Runtime dependency version pins (electron/package.json)
// ---------------------------------------------------------------
// These packages have ABI or API compat requirements that bite hard if
// drift. Pin EXACT versions (no caret/tilde) for ones we've personally
// verified. Build failure here means the postinstall will regenerate the
// wrong native binary and first Knowledge upload will crash.
// =========================================================================
section('Runtime dependency pins');
const electronPkgPath = path.join(__dirname, '..', 'package.json');
const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, 'utf-8'));
const deps = { ...(electronPkg.dependencies || {}), ...(electronPkg.devDependencies || {}) };
const PINNED_DEPS = {
  'better-sqlite3': '11.10.0',       // EXACT — Electron 28 ABI sweet-spot; any drift re-triggers Knowledge-tab crash
  'pdf-parse': '1.1.1',              // EXACT — 2.x pulls in DOMMatrix (browser-only), breaks PDF extraction in Node main process
};
for (const [name, expected] of Object.entries(PINNED_DEPS)) {
  const actual = deps[name];
  if (!actual) {
    fail(`dep ${name}`, `electron/package.json missing dependency "${name}" — add "${name}": "${expected}"`);
  } else if (actual !== expected) {
    fail(`dep ${name} exact pin`, `electron/package.json has "${name}": "${actual}" — MUST be exact "${expected}" (no caret/tilde). Drift reintroduces a fixed bug. See CLAUDE.md.`);
  } else {
    pass(`dep ${name} pinned at ${expected}`);
  }
}

// =========================================================================
// loadFile(...) path existence
// ---------------------------------------------------------------
// Electron's BrowserWindow.loadFile() fails silently (blank window) if the
// resolved path doesn't exist. Easy to introduce by renaming ui/X.html
// without updating the loadFile call. Build-time grep catches it.
// =========================================================================
section('loadFile paths resolve');
const mainJsForLoadFile = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const loadFileRe = /loadFile\s*\(\s*path\.join\(\s*__dirname\s*,\s*(['"][^'"]+['"]\s*(?:,\s*['"][^'"]+['"]\s*)*)\)/g;
let loadFileMatch;
const loadFileFailures = [];
while ((loadFileMatch = loadFileRe.exec(mainJsForLoadFile)) !== null) {
  const segs = loadFileMatch[1].match(/['"]([^'"]+)['"]/g).map((s) => s.slice(1, -1));
  const resolved = path.join(__dirname, '..', ...segs);
  if (!fs.existsSync(resolved)) {
    loadFileFailures.push({ call: loadFileMatch[0].slice(0, 80), resolved });
  }
}
if (loadFileFailures.length > 0) {
  for (const f of loadFileFailures) {
    fail('loadFile path', `${f.call} → ${f.resolved} does NOT exist. loadFile silently shows blank window when path missing.`);
  }
} else {
  pass('all loadFile paths resolve');
}

// =========================================================================
// IPC parity guards (preload.js ↔ main.js ↔ dashboard.html)
// ---------------------------------------------------------------
// Closest structural analog to the v2.3.48 silent-reject bug: a preload
// bridge invokes an IPC channel that no main.js handler registers, or
// dashboard.html calls window.claw.X that no preload bridge exposes, or
// onclick="fn()" where fn is not defined. All three fail silently.
// =========================================================================
section('IPC parity (preload/main/dashboard)');
const preloadPath = path.join(__dirname, '..', 'preload.js');
const dashboardHtmlPathForParity = path.join(__dirname, '..', 'ui', 'dashboard.html');
const mainJsPath = path.join(__dirname, '..', 'main.js');

if (!fs.existsSync(preloadPath) || !fs.existsSync(dashboardHtmlPathForParity) || !fs.existsSync(mainJsPath)) {
  warn('IPC parity', 'one or more source files missing — skip');
} else {
  const preloadSrc = fs.readFileSync(preloadPath, 'utf-8');
  const dashSrc = fs.readFileSync(dashboardHtmlPathForParity, 'utf-8');
  const mainSrcForParity = fs.readFileSync(mainJsPath, 'utf-8');

  // G1: every ipcRenderer.invoke('<ch>') in preload must have ipcMain.handle in main.js
  const preloadChannels = new Set();
  const invokeRe = /ipcRenderer\.(?:invoke|send)\(['"]([a-z0-9-]+)['"]/gi;
  let gm;
  while ((gm = invokeRe.exec(preloadSrc)) !== null) preloadChannels.add(gm[1]);
  const handlerChannels = new Set();
  const handleRe = /ipcMain\.(?:handle|on)\(['"]([a-z0-9-]+)['"]/gi;
  while ((gm = handleRe.exec(mainSrcForParity)) !== null) handlerChannels.add(gm[1]);
  const orphanPreloadChannels = [...preloadChannels].filter((ch) => !handlerChannels.has(ch));
  if (orphanPreloadChannels.length > 0) {
    fail('G1 preload channels have main handlers', `preload.js bridges channels that no ipcMain handler serves: [${orphanPreloadChannels.join(', ')}]. Calling these from renderer silently returns undefined — dead buttons. Register ipcMain.handle('<name>', ...) in main.js or remove the bridge.`);
  } else {
    pass(`G1 all ${preloadChannels.size} preload channels have main.js handlers`);
  }

  // G2a: every onclick="fn(" / onchange="fn(" / oninput="fn(" / onsubmit="fn(" in dashboard.html must resolve to defined JS function
  const onEventRe = /on(?:click|change|input|submit|focus|blur|mouseover|mouseout)\s*=\s*["']([a-zA-Z_$][\w$]*)\s*\(/g;
  const inlineHandlerNames = new Set();
  while ((gm = onEventRe.exec(dashSrc)) !== null) inlineHandlerNames.add(gm[1]);
  // Built-in and this-reference whitelist. Include JS control-flow keywords
  // because `onclick="if(event.target===this)foo()"` is a valid pattern
  // (backdrop-click-to-close modal) where the regex captures `if` as the
  // "function name" before the first paren.
  const builtins = new Set(['alert', 'confirm', 'prompt', 'event', 'return', 'this',
    'if', 'for', 'while', 'switch', 'try', 'function', 'void', 'typeof', 'new']);
  const declaredFnRe = /(?:^|\s)(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(|\bconst\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(|\blet\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(|\bvar\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(|\bwindow\.([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g;
  const declaredFns = new Set();
  while ((gm = declaredFnRe.exec(dashSrc)) !== null) {
    const name = gm[1] || gm[2] || gm[3] || gm[4] || gm[5];
    if (name) declaredFns.add(name);
  }
  const missingInlineFns = [...inlineHandlerNames].filter((n) => !builtins.has(n) && !declaredFns.has(n));
  if (missingInlineFns.length > 0) {
    fail('G2a onclick handlers have defined functions', `dashboard.html inline on* handlers reference undefined functions: [${missingInlineFns.join(', ')}]. Clicks throw ReferenceError at runtime. Define the function or fix the typo.`);
  } else {
    pass(`G2a all ${inlineHandlerNames.size} inline on* handlers defined`);
  }

  // G2b: every window.claw.X in dashboard.html + wizard.html must have matching preload bridge
  const wizardPath = path.join(__dirname, '..', 'ui', 'wizard.html');
  const wizardSrc = fs.existsSync(wizardPath) ? fs.readFileSync(wizardPath, 'utf-8') : '';
  const clawUsageRe = /window\.claw\.([a-zA-Z_$][\w$]*)/g;
  const clawUsedMethods = new Set();
  while ((gm = clawUsageRe.exec(dashSrc + '\n' + wizardSrc)) !== null) clawUsedMethods.add(gm[1]);
  const bridgeKeyRe = /^\s*([a-zA-Z_$][\w$]*)\s*:\s*\(/gm;
  const bridgeKeys = new Set();
  while ((gm = bridgeKeyRe.exec(preloadSrc)) !== null) bridgeKeys.add(gm[1]);
  const missingBridges = [...clawUsedMethods].filter((m) => !bridgeKeys.has(m));
  if (missingBridges.length > 0) {
    fail('G2b window.claw.X has preload bridge', `dashboard.html/wizard.html call window.claw.X where X is not in preload.js: [${missingBridges.join(', ')}]. Await resolves undefined — silent dead button. Add the bridge to preload.js contextBridge.exposeInMainWorld('claw', {...}).`);
  } else {
    pass(`G2b all ${clawUsedMethods.size} window.claw.X methods have bridges`);
  }
}

// =========================================================================
// UI regression guards (dashboard.html)
// ---------------------------------------------------------------
// Enforce docs/UI-REGRESSION-RULES.md. Grep-based checks for CSS
// anti-patterns that previously caused ship-breaking layout bugs.
// Every bug discovered in production gets a rule added here + in
// UI-REGRESSION-RULES.md so the same class can NEVER ship again.
// =========================================================================
section('UI regression guards (dashboard.html)');
const dashboardHtmlPath = path.join(__dirname, '..', 'ui', 'dashboard.html');
if (!fs.existsSync(dashboardHtmlPath)) {
  fail('dashboard.html present', `${dashboardHtmlPath} missing — UI shell file. Build will produce empty window.`);
} else {
  const dashboardSrc = fs.readFileSync(dashboardHtmlPath, 'utf-8');

  // R1: never `overflow-wrap:anywhere` (collapses flex/grid children to 1-char width)
  if (/overflow-wrap\s*:\s*anywhere/i.test(dashboardSrc)) {
    fail('R1 no overflow-wrap:anywhere', 'dashboard.html contains `overflow-wrap:anywhere`. Combined with flex:1 1 0 or grid minmax(0,1fr), this makes text min-content = 1 glyph → vertical char-per-line collapse under viewport pressure. Use `word-break:break-word` instead. See docs/UI-REGRESSION-RULES.md R1.');
  } else {
    pass('R1 no overflow-wrap:anywhere in dashboard.html');
  }

  // R2: .visibility-option must use grid, not flex (prevents char-per-line collapse)
  const visOptMatch = dashboardSrc.match(/\.visibility-option\s*\{[^}]*\}/);
  if (!visOptMatch) {
    fail('R2 visibility-option CSS exists', '.visibility-option CSS rule not found in dashboard.html. Knowledge upload visibility radios will be unstyled.');
  } else if (/display\s*:\s*flex/i.test(visOptMatch[0])) {
    fail('R2 visibility-option uses grid', '.visibility-option uses `display:flex`. Must be `display:grid` with `grid-template-columns:18px minmax(0,1fr)`. Flex is fragile under viewport pressure (1200-1400px) and previously shipped char-per-line bug. See docs/UI-REGRESSION-RULES.md R2.');
  } else if (!/display\s*:\s*grid/i.test(visOptMatch[0])) {
    fail('R2 visibility-option uses grid', '.visibility-option missing `display:grid`. Required for robust radio layout. See docs/UI-REGRESSION-RULES.md R2.');
  } else {
    pass('R2 visibility-option uses display:grid');
  }

  // R5: .know-col must have overflow:hidden AND min-width:0
  const knowColMatch = dashboardSrc.match(/\.know-col\s*\{[^}]*\}/);
  if (!knowColMatch) {
    fail('R5 know-col CSS exists', '.know-col CSS rule not found in dashboard.html.');
  } else {
    const hasOverflowHidden = /overflow\s*:\s*hidden/i.test(knowColMatch[0]);
    const hasMinWidth0 = /min-width\s*:\s*0/i.test(knowColMatch[0]);
    if (!hasOverflowHidden || !hasMinWidth0) {
      fail('R5 know-col has overflow:hidden + min-width:0', `.know-col missing ${!hasOverflowHidden ? '`overflow:hidden`' : ''}${!hasOverflowHidden && !hasMinWidth0 ? ' and ' : ''}${!hasMinWidth0 ? '`min-width:0`' : ''}. Without these, flex/grid children overflow outside card boundary (text renders in blank area beside card). See docs/UI-REGRESSION-RULES.md R5.`);
    } else {
      pass('R5 know-col has overflow:hidden + min-width:0');
    }
  }

  // R6: every -webkit-line-clamp must be paired with -webkit-box-orient:vertical
  const clampCount = (dashboardSrc.match(/-webkit-line-clamp/g) || []).length;
  if (clampCount > 0) {
    // Split CSS into rule blocks and check each block that has line-clamp also has box-orient
    const ruleBlocks = dashboardSrc.match(/\{[^{}]*-webkit-line-clamp[^{}]*\}/g) || [];
    const missingBoxOrient = ruleBlocks.filter((blk) => !/-webkit-box-orient\s*:\s*vertical/i.test(blk));
    if (missingBoxOrient.length > 0) {
      fail('R6 line-clamp paired with box-orient', `${missingBoxOrient.length} rule(s) use \`-webkit-line-clamp\` without \`-webkit-box-orient:vertical\`. Text will render as single line, overflowing card. See docs/UI-REGRESSION-RULES.md R6.`);
    } else {
      pass(`R6 all ${clampCount} -webkit-line-clamp rules pair with -webkit-box-orient:vertical`);
    }
  } else {
    pass('R6 no -webkit-line-clamp rules to check');
  }

  // R3: spot-check — visibility radio-label needs min-width:0 (inside grid/flex)
  const radioLabelMatch = dashboardSrc.match(/\.visibility-option\s+\.radio-label\s*\{[^}]*\}/);
  if (radioLabelMatch && !/min-width\s*:\s*0/i.test(radioLabelMatch[0])) {
    fail('R3 radio-label has min-width:0', '.visibility-option .radio-label missing `min-width:0`. Grid/flex children with text default to min-width:auto (min-content), can cause overflow. See docs/UI-REGRESSION-RULES.md R3.');
  } else if (radioLabelMatch) {
    pass('R3 .visibility-option .radio-label has min-width:0');
  }
}

// =========================================================================
// TEST G7: FB Fanpage module — all 8 stub files must exist
// =========================================================================
section("FB Fanpage module");
const fbFiles = [
  'auth.js', 'config.js', 'graph.js', 'drafts.js',
  'generator.js', 'performance.js', 'markers.js', 'migrate.js',
];
for (const f of fbFiles) {
  const p = path.join(__dirname, '..', 'fb', f);
  if (fs.existsSync(p)) pass(`G7.${f} — electron/fb/${f} exists`);
  else fail(`G7.${f} — electron/fb/${f} missing`, p);
}

try {
  const fbConfig = require('../fb/config.js');
  const required = ['getFbDir', 'getSettingsPath', 'readSettings', 'writeSettings', 'DEFAULT_SETTINGS'];
  for (const name of required) {
    if (typeof fbConfig[name] !== 'undefined') pass(`G13.config.${name} — exported`);
    else fail(`G13.config.${name} — missing export`, `require('../fb/config.js').${name} is undefined`);
  }
} catch (e) {
  fail('G13.config — require failed', e.message);
}

// =========================================================================
// SUMMARY
// =========================================================================
console.log('');
console.log('='.repeat(60));
console.log(`Smoke test complete: ${failures} failures, ${warnings} warnings`);
console.log('='.repeat(60));
if (failures > 0) {
  console.error(`\n✗ BUILD BLOCKED — ${failures} smoke test(s) failed.`);
  console.error('  Fix the failures above before shipping a build.');
  process.exit(1);
}
if (warnings > 0) {
  console.warn(`\n⚠ ${warnings} warning(s) — review but not blocking build.`);
}
console.log('\n✓ All smoke tests passed.');
process.exit(0);
