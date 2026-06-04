#!/usr/bin/env node
'use strict';
// Smoke test: skill-runner + python-runtime + cron-api auth gate.
// Covers gaps surfaced by 2026-05-15 round-2 reviews — these subsystems had
// zero smoke coverage and contain security-sensitive code (Python stub
// detection, channel gate, Bearer token validation).
//
// Run via `npm run smoke` (wired into guard:architecture).

const path = require('path');
const fs = require('fs');
const os = require('os');

let PASS = 0, FAIL = 0;
function ok(name) { PASS++; console.log('  PASS', name); }
function bad(name, why) { FAIL++; console.error('  FAIL', name, '|', why); }

// ── 1. python-runtime: stub detection ──
{
  const py = require(path.join('..', 'lib', 'python-runtime.js'));
  // We can't unit-test the actual MS Store stub without Windows, but we can
  // verify the helper function exists + handles the empty case sanely.
  if (typeof py.detectSystemPython === 'function') ok('python-runtime exposes detectSystemPython');
  else bad('python-runtime exposes detectSystemPython', 'function missing');

  if (typeof py.ensurePython === 'function') ok('python-runtime exposes ensurePython');
  else bad('python-runtime exposes ensurePython', 'function missing');

  // EMBEDDED_PYTHON_VERSION must be pinned (not floating).
  const ver = py.EMBEDDED_PYTHON_VERSION;
  if (typeof ver === 'string' && /^3\.\d+\.\d+$/.test(ver)) ok('embedded Python version pinned (' + ver + ')');
  else bad('embedded Python version pinned', 'got: ' + ver);

  // Verify _isMsStoreStub regex (read source — function isn't exported).
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'python-runtime.js'), 'utf-8');
  if (/_isMsStoreStub/.test(src) && /WindowsApps.*python.*exe/i.test(src)) ok('MS Store stub guard present');
  else bad('MS Store stub guard present', 'guard helper missing');

  if (/_isMacCltStubMissing/.test(src) && /xcode-select/.test(src)) ok('Mac CLT stub guard present');
  else bad('Mac CLT stub guard present', 'guard helper missing');

  // Token regex narrowed to absolute paths only — never PATH-relative.
  if (/path\.isAbsolute\(p\)/.test(src)) ok('Python cache requires absolute path');
  else bad('Python cache requires absolute path', 'isAbsolute check missing');
}

// ── 2. skill-runner: filename validation regex ──
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'skill-runner.js'), 'utf-8');
  if (/_resolveRuntimeBin/.test(src) && /runScript/.test(src)) ok('skill-runner exposes runScript + _resolveRuntimeBin');
  else bad('skill-runner exposes runScript + _resolveRuntimeBin', 'missing');

  if (/_buildSafeEnv/.test(src) && /PYTHONIOENCODING/.test(src)) ok('skill-runner sets PYTHONIOENCODING=utf-8 in safe env');
  else bad('skill-runner sets PYTHONIOENCODING=utf-8 in safe env', 'env hardening missing');

  if (/setTimeout/.test(src) && /SIGTERM/.test(src) && /SIGKILL/.test(src)) ok('skill-runner enforces timeout with SIGTERM+SIGKILL');
  else bad('skill-runner enforces timeout with SIGTERM+SIGKILL', 'kill path missing');
}

// ── 3. cron-api auth gate ──
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cron-api.js'), 'utf-8');
  if (/_requireCeoTelegram/.test(src)) ok('cron-api defines _requireCeoTelegram helper');
  else bad('cron-api defines _requireCeoTelegram helper', 'helper missing');

  // Global gate must check non-public routes BEFORE any handler dispatch.
  // Google routes also gated by _requireCeoTelegram (merged gate).
  if (/PUBLIC_ROUTES/.test(src) && /if \(!PUBLIC_ROUTES\.has\(urlPath\)/.test(src)) ok('cron-api global default-deny gate present');
  else bad('cron-api global default-deny gate present', 'gate not wired');

  // Bearer regex must demand 48 hex (16 byte * 2 ascii each, plus +16 from extra randomBytes(24).toString).
  if (/Bearer\\s\+\(\[a-f0-9\]\{48\}\)/i.test(src) || /Bearer.*\[a-f0-9\]\{48\}/.test(src)) ok('cron-api Bearer regex matches 48-hex token');
  else bad('cron-api Bearer regex matches 48-hex token', 'regex missing or wrong length');

  // Timing-safe compare.
  if (/timingSafeEqual/.test(src)) ok('cron-api token compare uses timingSafeEqual');
  else bad('cron-api token compare uses timingSafeEqual', 'using == or === (timing channel)');

  // Old fail-open pattern must be gone.
  const oldFailOpen = /if \(_reqChannel && _reqChannel\.toLowerCase\(\) !== 'telegram'\)/g;
  const matches = src.match(oldFailOpen);
  // 1 match is OK (in the explanatory comment); >1 means old pattern still in code.
  if (!matches || matches.length <= 1) ok('cron-api fail-open channel check eliminated');
  else bad('cron-api fail-open channel check eliminated', `${matches.length} occurrences still in code`);
}

// ── 4. skill-manager: appliesTo migration + folder layout ──
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'skill-manager.js'), 'utf-8');
  const chatSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'chat.js'), 'utf-8');
  if (/_APPLIESTO_PATH_MIGRATIONS/.test(src) && /operations\/zalo-reply-rules.*operations\/zalo/.test(src)) {
    ok('skill-manager has appliesTo path migrations');
  } else bad('skill-manager has appliesTo path migrations', 'migration map missing');

  if (/persistAppliesToMigrationIfNeeded/.test(src)) ok('skill-manager has boot-time migration persistence');
  else bad('skill-manager has boot-time migration persistence', 'persist helper missing');

  if (/_yamlEscape/.test(src)) ok('skill-manager escapes YAML for SKILL.md frontmatter');
  else bad('skill-manager escapes YAML for SKILL.md frontmatter', 'no escape helper');

  // matchActiveSkills must support `opts.scope` for appliesTo filtering.
  if (/function matchActiveSkills\(rawBody, opts/.test(src) && /opts\.scope/.test(src)) {
    ok('matchActiveSkills accepts scope filter for appliesTo');
  } else bad('matchActiveSkills accepts scope filter for appliesTo', 'scope param not wired');

  if (/buildSkillInjectionBlock\(text,\s*\{\s*scope:\s*'operations\/telegram-ceo'\s*\}\)/.test(chatSrc)) {
    ok('app chat injects user-skills with CEO scope');
  } else bad('app chat injects user-skills with CEO scope', 'chat.js must not inject Zalo/marketing-scoped skills into app chat');

  // updateUserSkill must branch on layout.
  if (/skill\.layout === 'folder'/.test(src)) ok('updateUserSkill branches on layout');
  else bad('updateUserSkill branches on layout', 'layout-blind write');

  // _idRe must allow '/' in shipped skill IDs (shipped/auto-mode-rules, shipped/zalo-behavior).
  // The pattern is ^[a-z0-9][a-z0-9/-]{0,79}$. Check that the char class includes '/'.
  // Pattern: ^[first-char][rest-of-chars]{0,79}$
  const idReMatch = src.match(/const _idRe = \/(.+?)\/[,;]/);
  if (idReMatch) {
    const pattern = idReMatch[1];
    // Verify '/' is in the character class by checking for /-] (slash before -] or just /] at end).
    // Old buggy pattern: [a-z0-9-/] (ends with /]) — / was allowed but as invalid range 9-/
    // Fixed pattern:   [a-z0-9/-] (ends with /-]) — / is now last before ], no invalid range
    if (/\/-]/.test(pattern) || /\/]/.test(pattern)) {
      ok('_idRe allows shipped/ prefix (char class includes slash)');
    } else {
      bad('_idRe allows shipped/ prefix', 'slash not in _idRe character class — shipped/ IDs rejected');
    }
  } else {
    bad('_idRe allows shipped/ prefix', 'cannot find _idRe in source');
  }

  // _sanitizeRegistry must preserve shipped flag.
  if (/shipped:\s*!!s\.shipped/.test(src)) ok('_sanitizeRegistry preserves shipped flag');
  else bad('_sanitizeRegistry preserves shipped flag', 'shipped field dropped during sanitization');

  // YAML frontmatter regex must handle Windows CRLF (\\r?\\n).
  if (/\\r\?\\n/.test(src)) ok('YAML frontmatter stripper handles Windows CRLF');
  else bad('YAML frontmatter stripper handles Windows CRLF', 'CRLF not handled — shipped skill files may inject YAML frontmatter');

  // Folder format SKILL.md must persist `filename:` so restore can recover it.
  if (/fmLines\.push\(`\s+filename: \$\{_yamlEscape\(s\.filename\)\}`\)/.test(src)) {
    ok('_buildAnthropicSkillMd persists filename in YAML');
  } else bad('_buildAnthropicSkillMd persists filename in YAML', 'filename not written');

  // SHIPPED_DOMAIN_SKILLS must be exported (used by smoke + routing generator).
  if (/SHIPPED_DOMAIN_SKILLS/.test(src)) ok('skill-manager exports SHIPPED_DOMAIN_SKILLS');
  else bad('skill-manager exports SHIPPED_DOMAIN_SKILLS', 'registry missing');

  // registerShippedSkills() must be exported.
  if (/registerShippedSkills/.test(src)) ok('skill-manager exports registerShippedSkills');
  else bad('skill-manager exports registerShippedSkills', 'function missing');

  // buildSkillInjectionBlock cap is 20KB (not 5KB).
  if (/block\.length > 20000/.test(src)) ok('buildSkillInjectionBlock caps at 20KB');
  else bad('buildSkillInjectionBlock caps at 20KB', 'still at 5KB or missing');

  // checkConflict() includes shipped-skill overlap warning.
  if (/overlaps_with_shipped/.test(src)) ok('checkConflict flags overlaps_with_shipped');
  else bad('checkConflict flags overlaps_with_shipped', 'shipped overlap check missing');
}

// ── 4b. routing generator + trigger extraction ──
{
  const routingSrc = fs.readFileSync(path.join(__dirname, 'generate-rules-routing.js'), 'utf-8');
  if (/function extractTriggers/.test(routingSrc)) ok('generate-rules-routing exports extractTriggers');
  else bad('generate-rules-routing exports extractTriggers', 'function missing');

  if (/function scanSkills/.test(routingSrc)) ok('generate-rules-routing exports scanSkills');
  else bad('generate-rules-routing exports scanSkills', 'function missing');

  if (/function generateRoutingTable/.test(routingSrc)) ok('generate-rules-routing exports generateRoutingTable');
  else bad('generate-rules-routing exports generateRoutingTable', 'function missing');

  // Routing generator must skip _archived directories.
  if (/' _archived'/.test(routingSrc) || /_archived/.test(routingSrc)) ok('generate-rules-routing skips _archived dirs');
  else bad('generate-rules-routing skips _archived dirs', 'may recurse into archived skills');

  // Workspace seeds skills/shipped/ directory (so shipped skills get included in scanSkills).
  const wsSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'workspace.js'), 'utf-8');
  if (/'shipped'/.test(wsSrc) || /shipped/.test(wsSrc)) ok('workspace seeds skills/shipped/ (or at minimum, does not block it)');
  else bad('workspace seeds skills/shipped/', 'shipped dir may be cleaned as orphan');
}

// ── 5. cron.js sleep recovery + idempotency ──
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cron.js'), 'utf-8');
  if (/function replayMissedCrons/.test(src)) ok('cron has replayMissedCrons (Windows sleep catch-up)');
  else bad('cron has replayMissedCrons (Windows sleep catch-up)', 'function missing');

  if (/_seedRecentFiresFromAudit/.test(src)) ok('cron seeds recent fires from audit log (crash idempotency)');
  else bad('cron seeds recent fires from audit log (crash idempotency)', 'seed function missing');

  if (/_withKnowledgeLock/.test(src)) ok('cron has separate knowledge write lock (no cron-vs-knowledge starvation)');
  else bad('cron has separate knowledge write lock (no cron-vs-knowledge starvation)', 'lock not split');

  if (/isChannelPaused\('zalo'\)/.test(src)) ok('cron checks Zalo pause BEFORE agent run');
  else bad('cron checks Zalo pause BEFORE agent run', 'pause check missing');
}

// ── 6. Anthropic document skills routing ──
{
  const root = path.join(__dirname, '..', '..');
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf-8');
  const workspace = fs.readFileSync(path.join(__dirname, '..', 'lib', 'workspace.js'), 'utf-8');
  const requiredSkills = [
    'skills/anthropic-docx/SKILL.md',
    'skills/anthropic-xlsx/SKILL.md',
    'skills/anthropic-pptx/SKILL.md',
    'skills/anthropic-pdf/SKILL.md',
  ];
  for (const skillPath of requiredSkills) {
    if (fs.existsSync(path.join(root, skillPath))) ok('Anthropic skill exists: ' + skillPath);
    else bad('Anthropic skill exists: ' + skillPath, 'missing folder skill');
    if (agents.includes(skillPath)) ok('AGENTS routes document tasks to ' + skillPath);
    else bad('AGENTS routes document tasks to ' + skillPath, 'route missing');
  }
  const staleRoutes = [
    'skills/minimax-docx/SKILL.md',
    'skills/minimax-xlsx/SKILL.md',
    'skills/minimax-pdf/SKILL.md',
    'skills/pptx-generator/SKILL.md',
  ];
  const stale = staleRoutes.filter(route => agents.includes(route));
  if (stale.length === 0) ok('AGENTS no longer routes document tasks to MiniMax skills');
  else bad('AGENTS no longer routes document tasks to MiniMax skills', stale.join(', '));
  if (!/pptxgenjs`\s+v3/.test(agents)) ok('AGENTS does not claim pptxgenjs v3');
  else bad('AGENTS does not claim pptxgenjs v3', 'installed dependency is v4.x');
  const _amV = (agents.match(/modoroclaw-agents-version:\s*(\d+)/) || [])[1];
  const _wsV = (workspace.match(/CURRENT_AGENTS_MD_VERSION\s*=\s*(\d+)/) || [])[1];
  if (_amV && _wsV && _amV === _wsV && parseInt(_amV, 10) >= 110) {
    ok('AGENTS template version in sync (v' + _amV + ', >=110)');
  } else {
    bad('AGENTS template version in sync', `AGENTS.md (${_amV || 'none'}) and workspace.js (${_wsV || 'none'}) must match and be >=110`);
  }
}

// ── 7. inbound.ts skill injection via skill-manager.js (v3) ──
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'packages', 'modoro-zalo', 'src', 'inbound.ts'), 'utf-8');
  // v3: delegates to skill-manager.js — no inline trigger matching, no flat/folder resolution.
  if (/skill-manager\.js"/.test(src) && /__usSmPath/.test(src)) ok('inbound.ts loads skill-manager.js via require');
  else bad('inbound.ts loads skill-manager.js via require', 'skill-manager require missing');

  if (/buildSkillInjectionBlock/.test(src)) ok('inbound.ts calls buildSkillInjectionBlock');
  else bad('inbound.ts calls buildSkillInjectionBlock', 'buildSkillInjectionBlock call missing');

  // Scope is 'operations/zalo' for Zalo inbound channel.
  if (/scope:\s*'operations\/zalo'/.test(src)) ok('inbound.ts passes scope=operations/zalo to buildSkillInjectionBlock');
  else bad('inbound.ts passes scope=operations/zalo to buildSkillInjectionBlock', 'scope param missing');

  // v3 NO LONGER has inline scope set or inline content resolution.
  // The old `__usScopes` and `__folderSkillMd` variables are removed in v3.
  if (!/__usScopes/.test(src)) ok('inbound.ts v3: no inline __usScopes (scope handled by skill-manager.js)');
  else bad('inbound.ts v3: no inline __usScopes', 'old v2 __usScopes still present');

  if (!/__folderSkillMd/.test(src)) ok('inbound.ts v3: no inline __folderSkillMd (content resolved by skill-manager.js)');
  else bad('inbound.ts v3: no inline __folderSkillMd', 'old v2 inline content resolution still present');

  // v4: channel-scoped auth — only Telegram sessions get Bearer.
  const vp = fs.readFileSync(path.join(__dirname, '..', 'lib', 'vendor-patches.js'), 'utf-8');
  if (/agentChannel === .telegram./.test(vp) && /Bearer/.test(vp)) ok('vendor-patches injects Bearer for Telegram only (channel-scoped)');
  else bad('vendor-patches injects Bearer for Telegram only (channel-scoped)', 'channel check or Bearer missing in helper');
  if (/isTelegram\s*=\s*true/.test(vp)) bad('vendor-patches old isTelegram=true still present', 'security regression');
  else ok('vendor-patches isTelegram=true absent (old pattern removed)');
}

console.log('');
console.log(`[smoke-skill-runtime] ${PASS} passed, ${FAIL} failed`);
if (FAIL > 0) process.exit(1);
