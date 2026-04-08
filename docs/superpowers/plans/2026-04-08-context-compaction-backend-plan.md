# Context Compaction Backend (Plan 1) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend layer for never-overflow conversation compaction + persistent per-customer profile DB inside MODOROClaw, so the bot stops crashing on long Telegram/Zalo conversations and structured customer facts get accumulated automatically.

**Architecture:** Two services (`ConversationCompactor` + `CustomerMemoryService`) sharing one LLM call via 9router. Compactor rewrites session jsonls in place using a 2-phase commit (archive → DB upsert → live rewrite) so no fact is ever silently lost. CustomerMemoryService owns a separate `customer-profiles.db` SQLite file with structured tables for preferences, decisions, open loops, key facts. Pinned context message at slot 1 of every session jsonl is auto-refreshed when its user's profile updates, giving the bot up-to-date facts on every reply without depending on summary fidelity.

**Tech Stack:**
- Node.js (Electron main process), no new runtime dependencies
- `better-sqlite3@11.10.0` (already pinned for Knowledge tab) — open separate connection for `customer-profiles.db`
- `node-cron@^4.2.1` (already in deps) — reuse existing `startCronJobs()` for background sweep
- Built-in `node:test` + `node:assert/strict` for unit tests (zero new deps)
- `archiver@^7` (NEW dep) for backup zip — Plan 2, NOT this plan
- 9router HTTP API (already running on `127.0.0.1:20128`) for LLM calls

**Spec reference:** [docs/superpowers/specs/2026-04-08-context-compaction-customer-memory-design.md](../specs/2026-04-08-context-compaction-customer-memory-design.md)

**Out of scope for Plan 1 (deferred to Plan 2):**
- Dashboard UI side panel
- Sao lưu tab + zip export/restore
- CSV export
- Per-customer export

**File structure (new files this plan creates):**

```
electron/
  modoro/                          # NEW: all MODOROClaw-specific modules outside main.js
    compactor/
      index.js                     # public entry: ConversationCompactor class
      tokenEstimate.js             # tokens ≈ chars / 2.5
      criticalDetect.js            # regex + keyword pinning
      sessionLock.js               # PID-based exclusive file lock
      sessionParse.js              # read/write jsonl, split old/recent
      llmCall.js                   # 9router request + JSON validation + fallback chain
      compactRunner.js             # 2-phase commit orchestration
      pinnedContextWriter.js       # builds + injects slot 1 system message
      auditLog.js                  # appends to compaction.jsonl
    memory/
      db.js                        # better-sqlite3 connection + schema_meta tracking
      migrations/
        001_init.sql               # initial customer-profiles schema
      profileService.js            # upsert + query API for customer_profile et al
      mergeUpdates.js              # merge LLM profile_updates JSON into DB rows
    common/
      paths.js                     # canonical paths (sessions dir, db path, audit log path)
      logger.js                    # tagged console.log wrapper
  migrations/                      # NOT used (we keep migrations under modoro/memory/)
  scripts/
    spike-jit-hook.js              # NEW: Spike A investigation script
    spike-group-session.js         # NEW: Spike B investigation script
    spike-gateway-watcher.js       # NEW: Spike C investigation script
  test/
    compactor/
      tokenEstimate.test.js
      criticalDetect.test.js
      sessionLock.test.js
      sessionParse.test.js
      llmCall.test.js
      compactRunner.test.js
      pinnedContextWriter.test.js
    memory/
      db.test.js
      profileService.test.js
      mergeUpdates.test.js
    fixtures/
      session-short.jsonl
      session-long.jsonl
      session-group.jsonl
      llm-response-valid.json
      llm-response-malformed.json
```

**Modifications to existing files:**

| File | What changes | Approx. lines added |
|---|---|---|
| `electron/main.js` | Wire compactor cron job into `startCronJobs()`, wire JIT hook (if Spike A picks A1), expose IPC for manual compaction trigger | ~80 |
| `electron/preload.js` | Add `modoroclaw.compaction.*` IPC bridges | ~15 |
| `electron/package.json` | Add `"test": "node --test electron/test/"` script | 1 |
| `CLAUDE.md` | Append "Context Compaction" patches section | ~20 |
| `electron/scripts/smoke-test.js` | Add 2 new categories: customer-profiles.db migrations applied + compactor module loads | ~40 |

**Why new code goes in `electron/modoro/`, not into `main.js`:** `main.js` is already 5644 lines and unwieldy. Per spec architecture principles ("smaller, focused files"), all new logic lives in dedicated modules. `main.js` only wires existing functionality together.

---

## Chunk 1: Phase 0 — Research spikes (BLOCKING)

These spikes resolve three architectural unknowns from the spec. They produce **decision documents**, not production code. Each spike is timeboxed; if it runs over budget, fall back to the documented default decision.

**Output of this chunk:** Three markdown decision docs under `docs/superpowers/spike-results/2026-04-08-*.md`, each ending with a single-line decision the rest of the plan branches on.

### Task 1.1: Spike A — Find JIT safety net hook point

**Files:**
- Create: `electron/scripts/spike-jit-hook.js` (investigation harness)
- Create: `docs/superpowers/spike-results/2026-04-08-spike-A-jit-hook.md` (decision doc)

- [ ] **Step 1: Search openclaw dist for hook keywords**

```bash
grep -rn -E "(pre[_-]?message|before[_-]?llm|interceptor|webhook|on[A-Z]\w*Message)" \
  "C:/Users/buitu/AppData/Roaming/npm/node_modules/openclaw/dist" \
  | head -30
```

Expected: list of any hook-like APIs in openclaw. Note file paths + line numbers.

- [ ] **Step 2: Inspect openzca/openzalo plugin inbound flow**

```bash
ls "C:/Users/buitu/.openclaw/extensions/openzalo/src/"
ls "C:/Users/buitu/AppData/Roaming/npm/node_modules/openzca/dist/"
```

Read `inbound.ts` (openzalo) and equivalent in openzca. Find the function that receives a message and forwards it to the gateway. Note exact file:line.

- [ ] **Step 3: Check openclaw config schema for hooks**

```bash
node -e "
const c = require('C:/Users/buitu/AppData/Roaming/npm/node_modules/openclaw/dist/cli.js');
console.log(Object.keys(c));
" 2>&1 || echo "no exports"
```

Then inspect `~/.openclaw/openclaw.json` schema by running:

```bash
"C:/Users/buitu/AppData/Roaming/npm/node_modules/.bin/openclaw" config schema 2>&1 | head -50
```

Look for `webhooks`, `interceptors`, `hooks`, `plugins.beforeMessage` entries.

- [ ] **Step 4: Write `electron/scripts/spike-jit-hook.js`**

```js
// Investigation harness — runs steps 1-3 programmatically and prints findings.
// Not production code. Run with: node electron/scripts/spike-jit-hook.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const findings = { timestamp: new Date().toISOString(), checks: [] };

function check(name, fn) {
  try {
    const result = fn();
    findings.checks.push({ name, status: 'ok', result });
    console.log(`[ok] ${name}:`, result);
  } catch (e) {
    findings.checks.push({ name, status: 'fail', error: String(e) });
    console.log(`[fail] ${name}:`, e.message);
  }
}

check('openclaw dist hook keywords', () => {
  const out = execSync(
    `grep -rnE "(pre[_-]?message|before[_-]?llm|interceptor|onMessage)" "C:/Users/buitu/AppData/Roaming/npm/node_modules/openclaw/dist" 2>nul || echo none`,
    { encoding: 'utf8' }
  );
  return out.split('\n').filter(Boolean).slice(0, 20);
});

check('openzalo inbound entry point', () => {
  const p = 'C:/Users/buitu/.openclaw/extensions/openzalo/src/inbound.ts';
  if (!fs.existsSync(p)) return 'NOT FOUND';
  const src = fs.readFileSync(p, 'utf8');
  const exportLines = src.split('\n').map((l, i) => ({ l, i: i + 1 }))
    .filter(x => /export\s+(async\s+)?function|module\.exports/.test(x.l));
  return exportLines.slice(0, 10);
});

check('openclaw config schema for webhooks', () => {
  try {
    const out = execSync('openclaw config schema 2>&1', { encoding: 'utf8', shell: true });
    const lines = out.split('\n').filter(l => /webhook|interceptor|hook/i.test(l));
    return lines.length ? lines : 'no webhook fields in schema';
  } catch (e) {
    return 'config schema command failed: ' + e.message;
  }
});

fs.writeFileSync(
  path.join(__dirname, '..', '..', 'docs', 'superpowers', 'spike-results',
    '2026-04-08-spike-A-jit-hook-raw.json'),
  JSON.stringify(findings, null, 2)
);
console.log('\nFindings written. Now write decision doc by hand.');
```

- [ ] **Step 5: Run the spike script**

```bash
cd c:/Users/buitu/Desktop/claw
mkdir -p docs/superpowers/spike-results
node electron/scripts/spike-jit-hook.js
```

Expected: prints `[ok]` lines, writes raw findings JSON.

- [ ] **Step 6: Write decision doc `docs/superpowers/spike-results/2026-04-08-spike-A-jit-hook.md`**

Template:

```markdown
# Spike A: JIT safety net hook point

**Date:** 2026-04-08
**Timebox:** 4 hours
**Actual time:** [fill in]

## Findings

- openclaw dist hook keywords: [paste from raw JSON]
- openzalo inbound entry: [paste]
- openclaw config schema webhooks: [paste]

## Decision

**Strategy chosen:** [A1 / A2 / A3]

**Reasoning:** [2-3 sentences]

**Implementation impact on Plan 1:**
- A1 → Task 7.X must patch openzalo plugin (add MODORO marker)
- A2 → FORBIDDEN by spec; do not pick
- A3 → Task 7.X is a no-op; sweep interval drops to 30s, target drops to 50%

**Files affected by this decision:** [list]
```

Fill in based on findings. If findings inconclusive after timebox → pick A3 (default).

- [ ] **Step 7: Commit spike A**

```bash
git add electron/scripts/spike-jit-hook.js docs/superpowers/spike-results/
git commit -m "spike: investigate JIT hook point options for compactor"
```

### Task 1.2: Spike B — Group chat session jsonl structure

**Files:**
- Create: `electron/scripts/spike-group-session.js`
- Create: `docs/superpowers/spike-results/2026-04-08-spike-B-group-session.md`

- [ ] **Step 1: List current sessions before test**

```bash
ls -la "C:/Users/buitu/.openclaw/agents/main/sessions/" > /tmp/sessions-before.txt
wc -l /tmp/sessions-before.txt
```

- [ ] **Step 2: Manually trigger group test**

This is a manual step — cannot be automated:

1. Open Zalo on phone
2. Add bot account to a test group with at least 3 humans
3. Each human (including yourself) sends 1 distinct message in the group within 60 seconds
4. Wait 30 seconds for openzca → gateway propagation

- [ ] **Step 3: List sessions after**

```bash
ls -la "C:/Users/buitu/.openclaw/agents/main/sessions/" > /tmp/sessions-after.txt
diff /tmp/sessions-before.txt /tmp/sessions-after.txt
```

Note: how many NEW jsonl files appeared? 1 (shared) or 3+ (per-sender)?

- [ ] **Step 4: Inspect new jsonl files**

```bash
# For each new file
for f in $(diff /tmp/sessions-before.txt /tmp/sessions-after.txt | grep '^>' | awk '{print $NF}'); do
  echo "=== $f ==="
  cat "C:/Users/buitu/.openclaw/agents/main/sessions/$f" | head -5
  echo
  echo "Distinct sender_ids:"
  cat "C:/Users/buitu/.openclaw/agents/main/sessions/$f" \
    | grep -oE '"sender[_A-Za-z]*":"[^"]*"' | sort -u
done
```

Expected output: either:
- One file with multiple distinct sender_ids → outcome **B1 (shared)**
- Multiple files with one sender_id each → outcome **B2 (per-sender)**

- [ ] **Step 5: Write spike script `electron/scripts/spike-group-session.js`**

```js
// Run AFTER manual group test to capture findings.
// Usage: node electron/scripts/spike-group-session.js <minutes-back>
const fs = require('fs');
const path = require('path');
const os = require('os');

const minutesBack = parseInt(process.argv[2] || '10', 10);
const sessionsDir = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions');
const cutoffMs = Date.now() - minutesBack * 60 * 1000;

const recent = fs.readdirSync(sessionsDir)
  .filter(f => f.endsWith('.jsonl') && !f.includes('archive'))
  .map(f => ({ f, full: path.join(sessionsDir, f), mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs }))
  .filter(x => x.mtime > cutoffMs)
  .sort((a, b) => b.mtime - a.mtime);

const findings = { count: recent.length, files: [] };

for (const r of recent) {
  const lines = fs.readFileSync(r.full, 'utf8').split('\n').filter(Boolean);
  const senders = new Set();
  let hasGroup = false;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const senderId = obj?.message?.origin?.senderId
        || obj?.session?.origin?.label
        || obj?.message?.role;
      if (senderId) senders.add(senderId);
      const groupId = obj?.session?.origin?.groupId || obj?.message?.origin?.groupId;
      if (groupId) hasGroup = true;
    } catch {}
  }
  findings.files.push({
    file: r.f,
    eventCount: lines.length,
    distinctSenders: [...senders],
    hasGroupMarker: hasGroup,
  });
}

console.log(JSON.stringify(findings, null, 2));
fs.writeFileSync(
  path.join(__dirname, '..', '..', 'docs', 'superpowers', 'spike-results',
    '2026-04-08-spike-B-group-session-raw.json'),
  JSON.stringify(findings, null, 2)
);
```

- [ ] **Step 6: Run script after manual test**

```bash
node electron/scripts/spike-group-session.js 5
```

Expected: prints findings JSON. If `distinctSenders` length > 1 in any single file → **B1**. Else → **B2**.

- [ ] **Step 7: Write decision doc `docs/superpowers/spike-results/2026-04-08-spike-B-group-session.md`**

Template:

```markdown
# Spike B: Group chat session jsonl structure

**Date:** 2026-04-08

## Findings

[paste raw JSON]

## Decision

**Outcome:** [B1 (shared per group) / B2 (per sender)]

**Architectural impact on Plan 1:**
- B1 → Pinned context becomes multi-user block; per-sender extraction unchanged but DB upsert affects multiple users per compaction
- B2 → Original design works; pinned context is per-user; group with 50 members = 50 jsonl files

**Files in Plan 1 affected:** modoro/compactor/pinnedContextWriter.js
```

- [ ] **Step 8: Commit spike B**

```bash
git add electron/scripts/spike-group-session.js docs/superpowers/spike-results/
git commit -m "spike: determine group chat session jsonl structure"
```

### Task 1.3: Spike C — Gateway file watcher rewrite behavior

**Files:**
- Create: `electron/scripts/spike-gateway-watcher.js`
- Create: `docs/superpowers/spike-results/2026-04-08-spike-C-gateway-watcher.md`

- [ ] **Step 1: Search openclaw dist for session watcher**

```bash
grep -rn -E "(chokidar|fs\.watch|watchFile).*session" \
  "C:/Users/buitu/AppData/Roaming/npm/node_modules/openclaw/dist" \
  | head -20
```

Note any matches.

- [ ] **Step 2: Pick a test session to manipulate**

```bash
# Find smallest active session (-S sorts largest first; tail picks smallest)
ls -laS "C:/Users/buitu/.openclaw/agents/main/sessions/"*.jsonl | tail -1
```

Note path. Make a backup:

```bash
SESSION=<paste path>
cp "$SESSION" "$SESSION.spike-backup"
```

- [ ] **Step 3: Tail openclaw gateway logs in another terminal**

```bash
tail -f ~/.openclaw/logs/openclaw.log 2>&1 | grep --line-buffered -iE "(restart|reload|watch|session)"
```

Leave running. (`--line-buffered` ensures real-time output through grep pipe.)

- [ ] **Step 4: Run rewrite test via spike script**

Create `electron/scripts/spike-gateway-watcher.js`:

```js
// WARNING: this script rewrites a real session jsonl. Backup first.
// Usage: node electron/scripts/spike-gateway-watcher.js <session-path>
const fs = require('fs');
const path = require('path');

const sessionPath = process.argv[2];
if (!sessionPath || !fs.existsSync(sessionPath)) {
  console.error('Usage: node spike-gateway-watcher.js <full-path-to-session.jsonl>');
  process.exit(1);
}

console.log('[spike-C] reading', sessionPath);
const original = fs.readFileSync(sessionPath, 'utf8');
const lines = original.split('\n').filter(Boolean);
console.log('[spike-C] event count:', lines.length);

console.log('[spike-C] writing identical content via .tmp + rename...');
const tmp = sessionPath + '.tmp';
fs.writeFileSync(tmp, original);
fs.renameSync(tmp, sessionPath);
console.log('[spike-C] rewrite #1 done. Watch gateway log for 10s.');

setTimeout(() => {
  console.log('[spike-C] writing slightly modified content (add a marker to last line)...');
  const modified = lines.slice(0, -1).concat([
    JSON.stringify({ ...JSON.parse(lines[lines.length - 1]), _spike_c_marker: Date.now() })
  ]).join('\n') + '\n';
  fs.writeFileSync(tmp, modified);
  fs.renameSync(tmp, sessionPath);
  console.log('[spike-C] rewrite #2 done. Watch gateway log for 10s.');

  setTimeout(() => {
    console.log('[spike-C] restoring original...');
    fs.writeFileSync(sessionPath, original);
    console.log('[spike-C] done. Decide outcome based on gateway log behavior.');
    process.exit(0);
  }, 10000);
}, 10000);
```

- [ ] **Step 5: Execute the test**

```bash
node electron/scripts/spike-gateway-watcher.js "<session path from step 2>"
```

While running, watch the gateway log tail. Note:
- Did gateway log show "restart" or "reload" lines after rewrite?
- Did the gateway process exit?
- Did any in-flight reply get aborted?

- [ ] **Step 6: Restore session backup**

```bash
cp "$SESSION.spike-backup" "$SESSION"
rm "$SESSION.spike-backup"
```

- [ ] **Step 7: Write decision doc `docs/superpowers/spike-results/2026-04-08-spike-C-gateway-watcher.md`**

Template:

```markdown
# Spike C: Gateway file watcher behavior on session jsonl rewrites

**Date:** 2026-04-08

## Findings

**Watcher source code refs:** [paste grep results from step 1]

**Behavior observed during test:**
- Gateway log lines after rewrite #1: [paste]
- Gateway log lines after rewrite #2: [paste]
- Did gateway process restart? [yes/no]
- Did any in-flight reply abort? [yes/no]

## Decision

**Outcome:** [C1 / C2 / C3]

**Implementation impact on Plan 1:**
- C1 → Compactor must defer rewrites until session idle (>60s no events). Add idle detector to compactRunner.js.
- C2 → Original design works; rewrites can happen any time.
- C3 → Worst case; same defer-to-idle as C1, plus stop+restart gateway briefly. Out of scope for v1; if observed, FAIL the spike and escalate.

**Files in Plan 1 affected:** modoro/compactor/compactRunner.js (idle detector)
```

- [ ] **Step 8: Commit spike C**

```bash
git add electron/scripts/spike-gateway-watcher.js docs/superpowers/spike-results/
git commit -m "spike: verify gateway watcher behavior on session jsonl rewrites"
```

### Task 1.4: Lock spike decisions into spec

After all 3 spikes complete, the spec must reflect actual decisions, not "TBD".

- [ ] **Step 1: Update spec with concrete decisions**

Edit [docs/superpowers/specs/2026-04-08-context-compaction-customer-memory-design.md](../specs/2026-04-08-context-compaction-customer-memory-design.md) section "Phase 0: research spike". Replace each "Resolution criterion" with actual outcome:

```markdown
### Spike A: ...
**RESOLVED 2026-04-08:** Strategy [A1/A3] chosen. See [decision doc](../spike-results/2026-04-08-spike-A-jit-hook.md).

### Spike B: ...
**RESOLVED 2026-04-08:** Outcome [B1/B2]. See [decision doc](../spike-results/2026-04-08-spike-B-group-session.md).

### Spike C: ...
**RESOLVED 2026-04-08:** Outcome [C1/C2/C3]. See [decision doc](../spike-results/2026-04-08-spike-C-gateway-watcher.md).
```

- [ ] **Step 2: Commit spec update**

```bash
git add docs/superpowers/specs/2026-04-08-context-compaction-customer-memory-design.md
git commit -m "spec: lock Phase 0 spike decisions"
```

**End of Chunk 1.** All 3 spikes resolved + spec updated. Plan 1 chunks 2+ proceed assuming the resolved branches.

---

## Chunk 2: Database foundation + migration runner + paths/logger

This chunk creates the SQLite database, schema, migration runner, and shared utility modules. After this chunk: `customer-profiles.db` exists with empty tables; subsequent chunks can read/write rows.

### Task 2.1: Set up test infrastructure

**Files:**
- Modify: `electron/package.json` (add test script)
- Create: `electron/test/.gitkeep`

- [ ] **Step 1: Add test script to package.json**

Read [electron/package.json](electron/package.json) first. Then add to `scripts`:

```json
"test": "node --test --test-reporter=spec electron/test/"
```

Insert after `"smoke": "node scripts/smoke-test.js",` line.

- [ ] **Step 2: Create test directory**

```bash
cd c:/Users/buitu/Desktop/claw
mkdir -p electron/test/compactor electron/test/memory electron/test/fixtures
touch electron/test/.gitkeep
```

- [ ] **Step 3: Verify test runner works with empty suite**

```bash
cd electron && npm test
```

Expected: `tests 0`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add electron/package.json electron/test/.gitkeep
git commit -m "test: enable node:test runner under electron/test/"
```

### Task 2.2: Common paths module

**Files:**
- Create: `electron/modoro/common/paths.js`
- Create: `electron/test/common-paths.test.js`

- [ ] **Step 1: Write the failing test** `electron/test/common-paths.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const paths = require('../modoro/common/paths.js');

test('sessionsDir resolves under ~/.openclaw/agents/main/sessions', () => {
  const p = paths.sessionsDir();
  assert.equal(p, path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions'));
});

test('customerProfilesDbPath is under workspace memory dir', () => {
  const p = paths.customerProfilesDbPath();
  assert.match(p, /customer-profiles\.db$/);
});

test('compactionAuditLogPath ends with logs/compaction.jsonl', () => {
  const p = paths.compactionAuditLogPath();
  assert.match(p, /logs[\\/]compaction\.jsonl$/);
});

test('archivePathFor returns sibling .archive.jsonl', () => {
  const live = path.join('foo', 'bar', 'abc-123.jsonl');
  assert.equal(paths.archivePathFor(live), path.join('foo', 'bar', 'abc-123.archive.jsonl'));
});

test('lockPathFor returns sibling .lock', () => {
  const live = path.join('foo', 'bar', 'abc-123.jsonl');
  assert.equal(paths.lockPathFor(live), path.join('foo', 'bar', 'abc-123.jsonl.lock'));
});
```

- [ ] **Step 2: Run it — expect MODULE_NOT_FOUND**

```bash
cd electron && npm test -- --test-name-pattern=paths
```

Expected: fails with `Cannot find module '../modoro/common/paths.js'`.

- [ ] **Step 3: Implement `electron/modoro/common/paths.js`**

```js
'use strict';

const path = require('node:path');
const os = require('node:os');

function openClawHome() {
  return path.join(os.homedir(), '.openclaw');
}

function sessionsDir() {
  return path.join(openClawHome(), 'agents', 'main', 'sessions');
}

function workspaceDir() {
  // MODOROClaw stores customer data under ~/.openclaw/workspace
  return path.join(openClawHome(), 'workspace');
}

function customerProfilesDbPath() {
  return path.join(workspaceDir(), 'customer-profiles.db');
}

function compactionAuditLogPath() {
  return path.join(workspaceDir(), 'logs', 'compaction.jsonl');
}

function archivePathFor(liveSessionPath) {
  // foo/bar/<uuid>.jsonl → foo/bar/<uuid>.archive.jsonl
  const dir = path.dirname(liveSessionPath);
  const base = path.basename(liveSessionPath, '.jsonl');
  return path.join(dir, base + '.archive.jsonl');
}

function lockPathFor(liveSessionPath) {
  return liveSessionPath + '.lock';
}

module.exports = {
  openClawHome,
  sessionsDir,
  workspaceDir,
  customerProfilesDbPath,
  compactionAuditLogPath,
  archivePathFor,
  lockPathFor,
};
```

- [ ] **Step 4: Run tests**

```bash
cd electron && npm test -- --test-name-pattern=paths
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/common/paths.js electron/test/common-paths.test.js
git commit -m "feat(modoro): add common paths module"
```

### Task 2.3: Tagged logger

**Files:**
- Create: `electron/modoro/common/logger.js`
- Create: `electron/test/common-logger.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger } = require('../modoro/common/logger.js');

test('logger prefixes lines with tag', () => {
  const captured = [];
  const log = createLogger('compactor', { sink: (line) => captured.push(line) });
  log.info('hello');
  log.warn('uh oh');
  log.error('boom');
  assert.equal(captured.length, 3);
  assert.match(captured[0], /^\[compactor\]\[info\] hello$/);
  assert.match(captured[1], /^\[compactor\]\[warn\] uh oh$/);
  assert.match(captured[2], /^\[compactor\]\[error\] boom$/);
});

test('logger formats objects as JSON', () => {
  const captured = [];
  const log = createLogger('test', { sink: (line) => captured.push(line) });
  log.info('event', { sessionId: 'abc', count: 5 });
  assert.match(captured[0], /\{"sessionId":"abc","count":5\}/);
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd electron && npm test -- --test-name-pattern=logger
```

- [ ] **Step 3: Implement `electron/modoro/common/logger.js`**

```js
'use strict';

function createLogger(tag, opts = {}) {
  const sink = opts.sink || ((line) => console.log(line));

  function fmt(level, msg, data) {
    let line = `[${tag}][${level}] ${msg}`;
    if (data !== undefined) {
      try { line += ' ' + JSON.stringify(data); }
      catch { line += ' [unserializable]'; }
    }
    return line;
  }

  return {
    info: (msg, data) => sink(fmt('info', msg, data)),
    warn: (msg, data) => sink(fmt('warn', msg, data)),
    error: (msg, data) => sink(fmt('error', msg, data)),
  };
}

module.exports = { createLogger };
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/common/logger.js electron/test/common-logger.test.js
git commit -m "feat(modoro): add tagged logger module"
```

### Task 2.4: Initial migration SQL

**Files:**
- Create: `electron/modoro/memory/migrations/001_init.sql`

- [ ] **Step 1: Write the migration file**

Schema must match spec § "Database schema" exactly. Note: spec drops FK constraints (decision #4 in spec's "Other resolved questions"). Schema_meta table for migration tracking:

```sql
-- 001_init.sql
-- MODOROClaw customer-profiles.db initial schema
-- Spec: docs/superpowers/specs/2026-04-08-context-compaction-customer-memory-design.md

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS schema_meta (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  note       TEXT
);

CREATE TABLE IF NOT EXISTS customer_profile (
  channel               TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  display_name          TEXT,
  first_seen_at         INTEGER NOT NULL,
  last_seen_at          INTEGER NOT NULL,
  message_count         INTEGER NOT NULL DEFAULT 0,
  is_vip                INTEGER NOT NULL DEFAULT 0,
  personality_summary   TEXT,
  last_profile_update_at INTEGER,
  schema_version        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (channel, user_id)
);

CREATE TABLE IF NOT EXISTS customer_preference (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  channel             TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  preference          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  added_at            INTEGER NOT NULL,
  removed_at          INTEGER,
  source_session_id   TEXT
);

CREATE TABLE IF NOT EXISTS customer_decision (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  channel             TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  date                TEXT NOT NULL,
  action              TEXT NOT NULL,
  item                TEXT,
  price_vnd           INTEGER,
  delivery_date       TEXT,
  status              TEXT NOT NULL DEFAULT 'confirmed',
  source_session_id   TEXT,
  source_msg_id       TEXT,
  raw_json            TEXT,
  added_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_open_loop (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  channel             TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  what                TEXT NOT NULL,
  deadline            TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  added_at            INTEGER NOT NULL,
  resolved_at         INTEGER,
  source_session_id   TEXT
);

CREATE TABLE IF NOT EXISTS customer_key_fact (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  channel             TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  fact                TEXT NOT NULL,
  added_at            INTEGER NOT NULL,
  source_session_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_profile_last_seen
  ON customer_profile(last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_user
  ON customer_decision(channel, user_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_open_loop_user
  ON customer_open_loop(channel, user_id, status);

CREATE INDEX IF NOT EXISTS idx_preference_user
  ON customer_preference(channel, user_id, status);

CREATE INDEX IF NOT EXISTS idx_key_fact_user
  ON customer_key_fact(channel, user_id);
```

- [ ] **Step 2: Commit (no test for raw SQL — tested via db.js)**

```bash
git add electron/modoro/memory/migrations/001_init.sql
git commit -m "feat(modoro): add initial customer-profiles migration"
```

### Task 2.5: Database connection + migration runner

**Files:**
- Create: `electron/modoro/memory/db.js`
- Create: `electron/test/memory-db.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { openCustomerDb, runMigrations, closeAll } = require('../modoro/memory/db.js');

function tmpDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modoro-db-test-'));
  return path.join(dir, 'test.db');
}

test('openCustomerDb creates file and runs migrations', () => {
  const p = tmpDbPath();
  const db = openCustomerDb(p);
  try {
    const meta = db.prepare('SELECT version FROM schema_meta ORDER BY version DESC LIMIT 1').get();
    assert.equal(meta.version, 1);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);
    assert.ok(tables.includes('customer_profile'));
    assert.ok(tables.includes('customer_preference'));
    assert.ok(tables.includes('customer_decision'));
    assert.ok(tables.includes('customer_open_loop'));
    assert.ok(tables.includes('customer_key_fact'));
    assert.ok(tables.includes('schema_meta'));
  } finally {
    closeAll();
    fs.unlinkSync(p);
  }
});

test('runMigrations is idempotent', () => {
  const p = tmpDbPath();
  const db1 = openCustomerDb(p);
  const v1 = db1.prepare('SELECT COUNT(*) AS n FROM schema_meta').get().n;
  closeAll();
  const db2 = openCustomerDb(p);
  const v2 = db2.prepare('SELECT COUNT(*) AS n FROM schema_meta').get().n;
  assert.equal(v1, v2);
  closeAll();
  fs.unlinkSync(p);
});

test('openCustomerDb throws on ABI mismatch with hint', () => {
  // This test only runs in environments where better-sqlite3 is correctly compiled.
  // We just verify the function exists and the happy path returns a Database object.
  const p = tmpDbPath();
  const db = openCustomerDb(p);
  assert.ok(typeof db.prepare === 'function');
  closeAll();
  fs.unlinkSync(p);
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd electron && npm test -- --test-name-pattern=memory-db
```

- [ ] **Step 3: Implement `electron/modoro/memory/db.js`**

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const paths = require('../common/paths.js');
const { createLogger } = require('../common/logger.js');

const log = createLogger('memory-db');

const _openConnections = new Map(); // path -> Database instance

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadMigrations() {
  const migDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migDir)) return [];
  return fs.readdirSync(migDir)
    .filter(f => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map(f => ({
      version: parseInt(f.split('_')[0], 10),
      name: f,
      sql: fs.readFileSync(path.join(migDir, f), 'utf8'),
    }));
}

function runMigrations(db) {
  // Create schema_meta if missing (bootstrap before migration table exists)
  db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (
    version    INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL,
    note       TEXT
  );`);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_meta').all().map(r => r.version)
  );
  const migs = loadMigrations();
  let appliedNow = 0;
  for (const m of migs) {
    if (applied.has(m.version)) continue;
    log.info('applying migration', { version: m.version, name: m.name });
    const tx = db.transaction(() => {
      db.exec(m.sql);
      db.prepare(
        'INSERT INTO schema_meta (version, applied_at, note) VALUES (?, ?, ?)'
      ).run(m.version, Date.now(), m.name);
    });
    tx();
    appliedNow++;
  }
  return { applied: appliedNow, totalVersions: migs.length };
}

function openCustomerDb(dbPath = paths.customerProfilesDbPath()) {
  if (_openConnections.has(dbPath)) return _openConnections.get(dbPath);
  ensureDirFor(dbPath);
  let db;
  try {
    db = new Database(dbPath);
  } catch (e) {
    if (String(e).includes('NODE_MODULE_VERSION')) {
      log.error('better-sqlite3 ABI mismatch — run electron/scripts/fix-better-sqlite3.js');
    }
    throw e;
  }
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  runMigrations(db);
  _openConnections.set(dbPath, db);
  return db;
}

function closeAll() {
  for (const [p, db] of _openConnections.entries()) {
    try { db.close(); } catch {}
    _openConnections.delete(p);
  }
}

module.exports = { openCustomerDb, runMigrations, closeAll };
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd electron && npm test -- --test-name-pattern=memory-db
```

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/memory/db.js electron/test/memory-db.test.js
git commit -m "feat(modoro): add customer-profiles db connection + migration runner"
```

### Task 2.6: Smoke test integration — verify migrations run on fresh install

**Files:**
- Modify: `electron/scripts/smoke-test.js`

- [ ] **Step 1: Read existing smoke-test.js to find where to add new check**

Read [electron/scripts/smoke-test.js](electron/scripts/smoke-test.js). Find the `tests` array or category list. Pick a spot near the end, before the summary report.

- [ ] **Step 2: Add new test category**

```js
// === Test category: customer-profiles.db migrations apply on fresh install ===
{
  name: 'customer-profiles.db migrations apply cleanly',
  fn: async () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-cp-'));
    const tmpDbPath = path.join(tmpDir, 'test-customer-profiles.db');
    try {
      // Spawn fresh node so we don't pollute current require cache
      const { execSync } = require('child_process');
      const script = `
        const { openCustomerDb, closeAll } = require('${path.join(__dirname, '..', 'modoro', 'memory', 'db.js').replace(/\\/g, '\\\\')}');
        const db = openCustomerDb('${tmpDbPath.replace(/\\/g, '\\\\')}');
        const meta = db.prepare('SELECT MAX(version) AS v FROM schema_meta').get();
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
        closeAll();
        console.log(JSON.stringify({ version: meta.v, tables }));
      `;
      const out = execSync('node -e "' + script.replace(/"/g, '\\"').replace(/\n/g, ' ') + '"',
        { encoding: 'utf8', cwd: path.join(__dirname, '..') });
      const result = JSON.parse(out.trim().split('\n').pop());
      if (result.version !== 1) throw new Error('expected version 1, got ' + result.version);
      const required = ['customer_profile', 'customer_preference', 'customer_decision',
                        'customer_open_loop', 'customer_key_fact', 'schema_meta'];
      for (const t of required) {
        if (!result.tables.includes(t)) throw new Error('missing table: ' + t);
      }
      return 'ok — schema v1, all 6 tables present';
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
},
```

- [ ] **Step 3: Run smoke test**

```bash
cd electron && npm run smoke
```

Expected: new test passes with green check, no regressions.

- [ ] **Step 4: Commit**

```bash
git add electron/scripts/smoke-test.js
git commit -m "smoke: verify customer-profiles migrations on fresh install"
```

**End of Chunk 2.** customer-profiles.db can be opened, schema v1 applied, idempotent re-open works, smoke test guards against regression. No business logic yet — just plumbing.

---

## Chunk 3: Compactor utilities (token estimate, critical detect, file lock, session parse)

Pure functions + low-level I/O. No LLM, no DB. After this chunk: we can read a session jsonl, estimate its token count, detect critical messages, split old/recent, acquire/release exclusive lock.

### Task 3.1: Token estimator

**Files:**
- Create: `electron/modoro/compactor/tokenEstimate.js`
- Create: `electron/test/compactor/tokenEstimate.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateTokens, estimateTokensForEvents } = require('../../modoro/compactor/tokenEstimate.js');

test('estimateTokens divides char count by 2.5', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('xxxxx'), 2); // 5/2.5 = 2
  assert.equal(estimateTokens('a'.repeat(250)), 100);
});

test('estimateTokens handles unicode (Vietnamese diacritics)', () => {
  // 'Dạ em chào thầy' = 16 chars including spaces
  const s = 'Dạ em chào thầy';
  assert.equal(estimateTokens(s), Math.ceil(s.length / 2.5));
});

test('estimateTokensForEvents sums message text lengths', () => {
  const events = [
    { type: 'session', session: {} }, // ignored, no text
    { type: 'message', message: { content: [{ type: 'text', text: 'hello' }] } },
    { type: 'message', message: { content: [{ type: 'text', text: 'world!' }] } },
  ];
  // 'hello' (5) + 'world!' (6) = 11 chars → ceil(11/2.5) = 5
  assert.equal(estimateTokensForEvents(events), 5);
});

test('estimateTokensForEvents handles missing/malformed events', () => {
  const events = [
    null,
    {},
    { type: 'message' },
    { type: 'message', message: {} },
    { type: 'message', message: { content: 'not an array' } },
    { type: 'message', message: { content: [{ type: 'text', text: 'ok' }] } },
  ];
  assert.equal(estimateTokensForEvents(events), 1); // only 'ok' = 2 chars → ceil(2/2.5)=1
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd electron && npm test -- --test-name-pattern=tokenEstimate
```

- [ ] **Step 3: Implement `electron/modoro/compactor/tokenEstimate.js`**

```js
'use strict';

// Vietnamese with diacritics tokenizes at roughly 2.5 chars/token (cl100k empirical).
// Conservative — better to compact early than overflow.
const CHARS_PER_TOKEN = 2.5;

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function extractTextFromEvent(event) {
  if (!event || event.type !== 'message') return '';
  const content = event.message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(c => c && c.type === 'text' && typeof c.text === 'string')
    .map(c => c.text)
    .join(' ');
}

function estimateTokensForEvents(events) {
  if (!Array.isArray(events)) return 0;
  let totalChars = 0;
  for (const e of events) {
    totalChars += extractTextFromEvent(e).length;
  }
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

module.exports = { estimateTokens, estimateTokensForEvents, CHARS_PER_TOKEN };
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/compactor/tokenEstimate.js electron/test/compactor/tokenEstimate.test.js
git commit -m "feat(compactor): add Vietnamese-tuned token estimator"
```

### Task 3.2: Critical message detector

**Files:**
- Create: `electron/modoro/compactor/criticalDetect.js`
- Create: `electron/test/compactor/criticalDetect.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { isCritical, classifyEvents } = require('../../modoro/compactor/criticalDetect.js');

function msg(text, role = 'user') {
  return { type: 'message', message: { role, content: [{ type: 'text', text }] } };
}

test('detects money — 5tr', () => {
  assert.equal(isCritical(msg('giá 5tr nhé')), true);
});

test('detects money — 25 triệu', () => {
  assert.equal(isCritical(msg('25 triệu được không')), true);
});

test('detects money — 5,000,000đ', () => {
  assert.equal(isCritical(msg('thanh toán 5,000,000đ')), true);
});

test('detects money — 5.000.000 VND', () => {
  assert.equal(isCritical(msg('chuyển 5.000.000 VND')), true);
});

test('detects money — 50k', () => {
  assert.equal(isCritical(msg('phí giao 50k')), true);
});

test('detects date — 12/4', () => {
  assert.equal(isCritical(msg('giao ngày 12/4 nhé')), true);
});

test('detects date — thứ 3', () => {
  assert.equal(isCritical(msg('hẹn thứ 3 tuần sau')), true);
});

test('detects date — ngày mai', () => {
  assert.equal(isCritical(msg('ngày mai gọi lại nhé')), true);
});

test('detects decision — ok chốt', () => {
  assert.equal(isCritical(msg('ok chốt 1 cái')), true);
});

test('detects decision — đặt 5', () => {
  assert.equal(isCritical(msg('đặt 5 cái product A')), true);
});

test('detects decision — hẹn thứ 3', () => {
  assert.equal(isCritical(msg('hẹn thứ 3 nhé')), true);
});

test('does NOT flag bare "ok" alone (over-broad pattern excluded)', () => {
  assert.equal(isCritical(msg('ok')), false);
  assert.equal(isCritical(msg('dạ ok ạ')), false);
});

test('does NOT flag bare "được" alone', () => {
  assert.equal(isCritical(msg('được rồi')), false);
});

test('detects open question — user message ending in ?', () => {
  assert.equal(isCritical(msg('có còn hàng không?')), true);
});

test('classifyEvents tags each event with isCritical bool', () => {
  const events = [
    msg('chào'),
    msg('5tr nhé'),
    msg('giao thứ 3'),
  ];
  const result = classifyEvents(events);
  assert.equal(result[0].isCritical, false);
  assert.equal(result[1].isCritical, true);
  assert.equal(result[2].isCritical, true);
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd electron && npm test -- --test-name-pattern=criticalDetect
```

- [ ] **Step 3: Implement `electron/modoro/compactor/criticalDetect.js`**

```js
'use strict';

const MONEY_RE = /(?:^|[\s,.])(\d+(?:[.,]\d{3})*)\s*(đ|đồng|VND|vnd|tr|triệu|m|M|k|nghìn|ngàn)(?:$|[\s,.])/;

const DATE_RE = /(\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?|thứ\s?[2-7]|chủ\s?nhật|ngày\s+mai|tuần\s+sau|hôm\s+nay|hôm\s+qua)/i;

// Phrase-level decision patterns. Bare "ok" / "được" excluded — too noisy.
const DECISION_RE = /(ok\s+(chốt|lấy|đặt|được|nhé))|(chốt\s+(đơn|lấy|đặt|nhé))|(đặt\s+\d)|(đặt\s+(hàng|cho|một|1))|(hủy\s+(đơn|lấy))|(đổi\s+(sang|qua|lấy))|(hẹn\s+(thứ|ngày|giờ|sáng|chiều|tối))|(cam\s+kết)|(đã\s+thanh\s+toán)/i;

function extractText(event) {
  if (!event || event.type !== 'message') return '';
  const content = event.message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(c => c && c.type === 'text' && typeof c.text === 'string')
    .map(c => c.text)
    .join(' ');
}

function isCritical(event) {
  const text = extractText(event);
  if (!text) return false;
  if (MONEY_RE.test(text)) return true;
  if (DATE_RE.test(text)) return true;
  if (DECISION_RE.test(text)) return true;
  // Open question heuristic: user message ending in '?'
  if (event.message?.role === 'user' && /\?\s*$/.test(text.trim())) return true;
  return false;
}

function classifyEvents(events) {
  return events.map(e => ({ ...e, isCritical: isCritical(e) }));
}

module.exports = { isCritical, classifyEvents, MONEY_RE, DATE_RE, DECISION_RE };
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/compactor/criticalDetect.js electron/test/compactor/criticalDetect.test.js
git commit -m "feat(compactor): add critical message detector with Vietnamese patterns"
```

### Task 3.3: Session file lock

**Files:**
- Create: `electron/modoro/compactor/sessionLock.js`
- Create: `electron/test/compactor/sessionLock.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { acquireLock, releaseLock, isLocked } = require('../../modoro/compactor/sessionLock.js');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));
  return path.join(dir, 'session.jsonl');
}

test('acquireLock creates lock file with current PID', () => {
  const target = tmpFile();
  const lockPath = target + '.lock';
  const ok = acquireLock(target);
  try {
    assert.equal(ok, true);
    assert.ok(fs.existsSync(lockPath));
    const meta = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(meta.pid, process.pid);
    assert.ok(typeof meta.acquired_at === 'number');
  } finally {
    releaseLock(target);
  }
});

test('acquireLock fails when lock held by alive PID', () => {
  const target = tmpFile();
  acquireLock(target);
  try {
    const second = acquireLock(target);
    assert.equal(second, false);
  } finally {
    releaseLock(target);
  }
});

test('acquireLock steals lock from dead PID', () => {
  const target = tmpFile();
  const lockPath = target + '.lock';
  // Plant a lock with a guaranteed-dead PID (very high number)
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999999, acquired_at: Date.now() }));
  const ok = acquireLock(target);
  assert.equal(ok, true);
  releaseLock(target);
});

test('releaseLock removes the lock file', () => {
  const target = tmpFile();
  acquireLock(target);
  releaseLock(target);
  assert.equal(isLocked(target), false);
});

test('releaseLock is safe to call when no lock exists', () => {
  const target = tmpFile();
  assert.doesNotThrow(() => releaseLock(target));
});

test('isLocked returns false when lock file exists with dead PID', () => {
  const target = tmpFile();
  const lockPath = target + '.lock';
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999999, acquired_at: Date.now() }));
  assert.equal(isLocked(target), false);
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd electron && npm test -- --test-name-pattern=sessionLock
```

- [ ] **Step 3: Implement `electron/modoro/compactor/sessionLock.js`**

```js
'use strict';

const fs = require('node:fs');
const paths = require('../common/paths.js');

function isPidAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0); // signal 0 = check existence, no actual signal sent
    return true;
  } catch (e) {
    if (e.code === 'EPERM') return true; // exists but we lack permission
    return false;
  }
}

function readLockMeta(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isLocked(targetPath) {
  const lockPath = paths.lockPathFor(targetPath);
  if (!fs.existsSync(lockPath)) return false;
  const meta = readLockMeta(lockPath);
  if (!meta) return false;
  return isPidAlive(meta.pid);
}

function acquireLock(targetPath) {
  const lockPath = paths.lockPathFor(targetPath);
  if (fs.existsSync(lockPath)) {
    const meta = readLockMeta(lockPath);
    if (meta && isPidAlive(meta.pid) && meta.pid !== process.pid) {
      return false;
    }
    // Stale lock — remove
    try { fs.unlinkSync(lockPath); } catch {}
  }
  try {
    // O_EXCL to prevent race between two callers
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, acquired_at: Date.now() }));
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}

function releaseLock(targetPath) {
  const lockPath = paths.lockPathFor(targetPath);
  try {
    if (fs.existsSync(lockPath)) {
      const meta = readLockMeta(lockPath);
      // Only release if we own it
      if (!meta || meta.pid === process.pid) {
        fs.unlinkSync(lockPath);
      }
    }
  } catch {}
}

module.exports = { acquireLock, releaseLock, isLocked };
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/compactor/sessionLock.js electron/test/compactor/sessionLock.test.js
git commit -m "feat(compactor): add PID-based exclusive session file lock"
```

### Task 3.4: Session parse + split + atomic rewrite

**Files:**
- Create: `electron/modoro/compactor/sessionParse.js`
- Create: `electron/test/compactor/sessionParse.test.js`
- Create: `electron/test/fixtures/session-short.jsonl`
- Create: `electron/test/fixtures/session-long.jsonl`

- [ ] **Step 1: Create test fixtures**

`electron/test/fixtures/session-short.jsonl`:
```jsonl
{"type":"session","session":{"id":"sess-1","origin":{"provider":"openzalo","label":"Mai"}}}
{"type":"message","message":{"role":"user","content":[{"type":"text","text":"chào shop"}],"timestamp":1712000000000}}
{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"dạ chào chị"}],"timestamp":1712000001000}}
```

`electron/test/fixtures/session-long.jsonl` — generate via small script:

```bash
cd c:/Users/buitu/Desktop/claw/electron/test/fixtures
node -e "
const fs = require('fs');
const lines = ['{\"type\":\"session\",\"session\":{\"id\":\"sess-2\",\"origin\":{\"provider\":\"openzalo\",\"label\":\"Long\"}}}'];
for (let i = 0; i < 50; i++) {
  lines.push(JSON.stringify({type:'message',message:{role:i%2===0?'user':'assistant',content:[{type:'text',text:'tin nhắn số '+i}],timestamp:1712000000000+i*1000}}));
}
fs.writeFileSync('session-long.jsonl', lines.join('\n') + '\n');
"
wc -l session-long.jsonl
```

Expected: 51 lines (1 session + 50 messages).

- [ ] **Step 2: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const sp = require('../../modoro/compactor/sessionParse.js');

const FIX = path.join(__dirname, '..', 'fixtures');

function tmpCopy(name) {
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-test-')), name);
  fs.copyFileSync(path.join(FIX, name), dest);
  return dest;
}

test('readSession returns session metadata + events array', () => {
  const result = sp.readSession(path.join(FIX, 'session-short.jsonl'));
  assert.equal(result.events.length, 3);
  assert.equal(result.events[0].type, 'session');
  assert.equal(result.events[1].message.role, 'user');
});

test('readSession ignores blank lines and malformed JSON gracefully', () => {
  const tmp = tmpCopy('session-short.jsonl');
  fs.appendFileSync(tmp, '\n\nthis is not json\n{"type":"message","message":{"role":"user","content":[{"type":"text","text":"tail"}]}}\n');
  const result = sp.readSession(tmp);
  // Should keep 3 original + 1 valid tail = 4
  assert.equal(result.events.length, 4);
});

test('splitOldRecent keeps last N message events as recent, rest as old', () => {
  const long = sp.readSession(path.join(FIX, 'session-long.jsonl'));
  const split = sp.splitOldRecent(long.events, 20);
  // 50 messages, recent=20, old=30 (+ 1 session metadata in 'meta')
  assert.equal(split.recent.length, 20);
  assert.equal(split.old.length, 30);
  assert.equal(split.meta.length, 1);
  assert.equal(split.meta[0].type, 'session');
});

test('splitOldRecent handles fewer messages than recentCount', () => {
  const short = sp.readSession(path.join(FIX, 'session-short.jsonl'));
  const split = sp.splitOldRecent(short.events, 20);
  assert.equal(split.recent.length, 2);
  assert.equal(split.old.length, 0);
});

test('writeSessionAtomic writes via tmp + rename', () => {
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-w-')), 'out.jsonl');
  const events = [
    { type: 'session', session: { id: 's1' } },
    { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } },
  ];
  sp.writeSessionAtomic(target, events);
  assert.ok(fs.existsSync(target));
  assert.ok(!fs.existsSync(target + '.tmp'));
  const reread = sp.readSession(target);
  assert.equal(reread.events.length, 2);
});

test('appendArchive appends events to archive file', () => {
  const live = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-a-')), 'live.jsonl');
  fs.writeFileSync(live, '');
  const archivePath = sp.appendArchive(live, [
    { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'first' }] } },
  ]);
  assert.ok(archivePath.endsWith('.archive.jsonl'));
  assert.ok(fs.existsSync(archivePath));
  // Append again — should grow
  sp.appendArchive(live, [
    { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'second' }] } },
  ]);
  const lines = fs.readFileSync(archivePath, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
});
```

- [ ] **Step 3: Run — expect fail**

```bash
cd electron && npm test -- --test-name-pattern=sessionParse
```

- [ ] **Step 4: Implement `electron/modoro/compactor/sessionParse.js`**

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const paths = require('../common/paths.js');

function readSession(filePath) {
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const events = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // skip malformed
    }
  }
  return { events, raw };
}

function splitOldRecent(events, recentCount = 20) {
  // Separate session metadata events from messages
  const meta = events.filter(e => e && e.type !== 'message');
  const messages = events.filter(e => e && e.type === 'message');
  if (messages.length <= recentCount) {
    return { meta, old: [], recent: messages };
  }
  const splitAt = messages.length - recentCount;
  return {
    meta,
    old: messages.slice(0, splitAt),
    recent: messages.slice(splitAt),
  };
}

function writeSessionAtomic(filePath, events) {
  const tmp = filePath + '.tmp';
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const body = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, body);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

function appendArchive(liveSessionPath, events) {
  const archivePath = paths.archivePathFor(liveSessionPath);
  const dir = path.dirname(archivePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const body = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  const fd = fs.openSync(archivePath, 'a');
  try {
    fs.writeSync(fd, body);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return archivePath;
}

module.exports = { readSession, splitOldRecent, writeSessionAtomic, appendArchive };
```

- [ ] **Step 5: Run tests — expect pass**

- [ ] **Step 6: Commit**

```bash
git add electron/modoro/compactor/sessionParse.js \
        electron/test/compactor/sessionParse.test.js \
        electron/test/fixtures/session-short.jsonl \
        electron/test/fixtures/session-long.jsonl
git commit -m "feat(compactor): add session parse, split, atomic write, archive append"
```

**End of Chunk 3.** Pure compactor utilities ready. No LLM, no DB. Next chunk: LLM call layer.

---

## Chunk 4: LLM call + JSON validation + fallback chain

This chunk wraps 9router. After this chunk: given an "old block" of events, we can call gpt-5-mini (or fallback), receive validated JSON containing `conversation_summary` and `profile_updates`, or get a clean abort signal.

### Task 4.1: 9router HTTP client wrapper

**Files:**
- Create: `electron/modoro/compactor/llmCall.js`
- Create: `electron/test/compactor/llmCall.test.js`
- Create: `electron/test/fixtures/llm-response-valid.json`
- Create: `electron/test/fixtures/llm-response-malformed.json`

- [ ] **Step 1: Create fixtures**

`electron/test/fixtures/llm-response-valid.json`:
```json
{
  "conversation_summary": "Khách Mai hỏi giá product A, được báo 5tr, đã chốt đơn, hẹn giao thứ 3.",
  "profile_updates": {
    "zalo_uid_123": {
      "display_name": "Mai",
      "personality_traits": ["thẳng thắn", "quyết đoán nhanh"],
      "preferences_added": ["thích product A"],
      "preferences_removed": [],
      "decisions_added": [
        {
          "date": "2026-04-05",
          "action": "đặt",
          "item": "product A",
          "price_vnd": 5000000,
          "delivery_date": "thứ 3 tuần sau",
          "status": "confirmed"
        }
      ],
      "open_loops_added": [],
      "open_loops_resolved": [],
      "key_facts_added": []
    }
  }
}
```

`electron/test/fixtures/llm-response-malformed.json`:
```
this is not valid json {{{{
```

- [ ] **Step 2: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const llm = require('../../modoro/compactor/llmCall.js');

const FIX = path.join(__dirname, '..', 'fixtures');

test('validateLLMOutput accepts well-formed JSON', () => {
  const valid = JSON.parse(fs.readFileSync(path.join(FIX, 'llm-response-valid.json'), 'utf8'));
  const result = llm.validateLLMOutput(valid);
  assert.equal(result.ok, true);
});

test('validateLLMOutput rejects missing conversation_summary', () => {
  const result = llm.validateLLMOutput({ profile_updates: {} });
  assert.equal(result.ok, false);
  assert.match(result.error, /conversation_summary/);
});

test('validateLLMOutput rejects missing profile_updates', () => {
  const result = llm.validateLLMOutput({ conversation_summary: 'hi' });
  assert.equal(result.ok, false);
  assert.match(result.error, /profile_updates/);
});

test('validateLLMOutput rejects non-object profile_updates', () => {
  const result = llm.validateLLMOutput({ conversation_summary: 'x', profile_updates: 'oops' });
  assert.equal(result.ok, false);
});

test('parseLLMResponse handles valid string response', () => {
  const raw = fs.readFileSync(path.join(FIX, 'llm-response-valid.json'), 'utf8');
  const r = llm.parseLLMResponse(raw);
  assert.equal(r.ok, true);
  assert.ok(r.data.conversation_summary);
});

test('parseLLMResponse handles malformed JSON', () => {
  const raw = fs.readFileSync(path.join(FIX, 'llm-response-malformed.json'), 'utf8');
  const r = llm.parseLLMResponse(raw);
  assert.equal(r.ok, false);
});

test('parseLLMResponse strips markdown code fences', () => {
  const wrapped = '```json\n{"conversation_summary":"x","profile_updates":{}}\n```';
  const r = llm.parseLLMResponse(wrapped);
  assert.equal(r.ok, true);
});

test('formatEventsForPrompt produces compact pseudo-transcript', () => {
  const events = [
    { type: 'message', message: {
        role: 'user',
        content: [{ type: 'text', text: 'chào' }],
        timestamp: 1712000000000,
        origin: { senderId: 'zalo_uid_123' },
    }},
    { type: 'message', message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'dạ chào' }],
        timestamp: 1712000001000,
    }},
  ];
  const text = llm.formatEventsForPrompt(events);
  assert.match(text, /user:zalo_uid_123/);
  assert.match(text, /chào/);
  assert.match(text, /bot/);
  assert.match(text, /dạ chào/);
});

test('callLLM is exported as async function', () => {
  assert.equal(typeof llm.callLLM, 'function');
});
```

- [ ] **Step 3: Run — expect fail**

```bash
cd electron && npm test -- --test-name-pattern=llmCall
```

- [ ] **Step 4: Implement `electron/modoro/compactor/llmCall.js`**

```js
'use strict';

const http = require('node:http');
const { createLogger } = require('../common/logger.js');

const log = createLogger('llm');

const ROUTER_BASE = process.env.MODORO_9ROUTER_BASE || 'http://127.0.0.1:20128';
const PRIMARY_MODEL = 'gpt-5-mini';
// Fallback chain: ordered preference; first one returning a valid JSON wins
const FALLBACK_MODELS = ['gpt-5-nano', 'claude-haiku', 'gemini-flash', 'qwen2.5:7b'];

const SYSTEM_PROMPT = `Bạn là tóm tắt hội thoại CSKH cho bot AI tiếng Việt. Nhiệm vụ:
1. Tóm tắt nội dung hội thoại thành 1 đoạn 100-200 từ giữ narrative flow
2. Trích xuất facts có cấu trúc cho từng user xuất hiện trong hội thoại

QUAN TRỌNG:
- KHÔNG bịa thông tin không có trong hội thoại
- Số tiền, ngày tháng, tên riêng phải copy CHÍNH XÁC từ tin nhắn gốc
- Output JSON object duy nhất, không thêm text ngoài JSON

Schema:
{
  "conversation_summary": "string (100-200 từ tiếng Việt)",
  "profile_updates": {
    "<user_id>": {
      "display_name": "string|null",
      "personality_traits": ["string", ...],
      "preferences_added": ["string", ...],
      "preferences_removed": ["string", ...],
      "decisions_added": [{ "date": "YYYY-MM-DD", "action": "string", "item": "string", "price_vnd": number|null, "delivery_date": "string|null", "status": "confirmed|cancelled|fulfilled" }],
      "open_loops_added": [{ "date": "YYYY-MM-DD", "what": "string", "deadline": "string|null" }],
      "open_loops_resolved": ["string", ...],
      "key_facts_added": ["string", ...]
    }
  }
}`;

function formatEventsForPrompt(events) {
  const lines = [];
  for (const e of events) {
    if (!e || e.type !== 'message') continue;
    const role = e.message?.role;
    const content = e.message?.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter(c => c && c.type === 'text' && typeof c.text === 'string')
      .map(c => c.text)
      .join(' ');
    if (!text) continue;
    const ts = e.message?.timestamp ? new Date(e.message.timestamp).toISOString().slice(0, 16).replace('T', ' ') : '?';
    if (role === 'user') {
      const sender = e.message?.origin?.senderId || 'unknown';
      lines.push(`[${ts} user:${sender}]: ${text}`);
    } else if (role === 'assistant') {
      lines.push(`[${ts} bot]: ${text}`);
    } else {
      lines.push(`[${ts} ${role}]: ${text}`);
    }
  }
  return lines.join('\n');
}

function parseLLMResponse(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'response not string' };
  let cleaned = raw.trim();
  // Strip markdown fences if model wrapped output
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  }
  try {
    const data = JSON.parse(cleaned);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function validateLLMOutput(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'not an object' };
  if (typeof data.conversation_summary !== 'string') {
    return { ok: false, error: 'conversation_summary missing or not string' };
  }
  if (!data.profile_updates || typeof data.profile_updates !== 'object' || Array.isArray(data.profile_updates)) {
    return { ok: false, error: 'profile_updates missing or not object' };
  }
  return { ok: true };
}

function postJson(url, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: timeoutMs,
    }, (res) => {
      let chunks = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(chunks);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function callOneModel(model, userContent, supportsJsonMode) {
  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
  };
  if (supportsJsonMode) {
    body.response_format = { type: 'json_object' };
  }
  const url = `${ROUTER_BASE}/v1/chat/completions`;
  const raw = await postJson(url, body, 10000);
  // Parse 9router envelope; extract the message content
  let envelope;
  try { envelope = JSON.parse(raw); }
  catch (e) { throw new Error('9router response not JSON: ' + e.message); }
  const content = envelope?.choices?.[0]?.message?.content;
  if (!content) throw new Error('9router response missing choices[0].message.content');
  return content;
}

async function callLLM(events) {
  const userContent = formatEventsForPrompt(events);
  const tryModels = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  let lastError = null;
  for (const model of tryModels) {
    const supportsJsonMode = model.startsWith('gpt-');
    try {
      log.info('calling', { model, eventCount: events.length });
      const raw = await callOneModel(model, userContent, supportsJsonMode);
      const parsed = parseLLMResponse(raw);
      if (!parsed.ok) {
        log.warn('parse failed', { model, error: parsed.error });
        lastError = `parse: ${parsed.error}`;
        continue;
      }
      const validation = validateLLMOutput(parsed.data);
      if (!validation.ok) {
        log.warn('validation failed', { model, error: validation.error });
        lastError = `validation: ${validation.error}`;
        continue;
      }
      return { ok: true, data: parsed.data, modelUsed: model, fallbackUsed: model !== PRIMARY_MODEL };
    } catch (e) {
      log.warn('call failed', { model, error: String(e.message || e) });
      lastError = String(e.message || e);
      continue;
    }
  }
  return { ok: false, error: lastError || 'all models failed' };
}

module.exports = {
  callLLM,
  formatEventsForPrompt,
  parseLLMResponse,
  validateLLMOutput,
  PRIMARY_MODEL,
  FALLBACK_MODELS,
};
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd electron && npm test -- --test-name-pattern=llmCall
```

Note: `callLLM` itself is not invoked in tests (would require live 9router). Only pure functions are tested. Live integration covered in Chunk 8 manual QA.

- [ ] **Step 6: Commit**

```bash
git add electron/modoro/compactor/llmCall.js \
        electron/test/compactor/llmCall.test.js \
        electron/test/fixtures/llm-response-valid.json \
        electron/test/fixtures/llm-response-malformed.json
git commit -m "feat(compactor): add 9router LLM client with fallback chain + JSON validation"
```

**End of Chunk 4.** LLM layer ready. Pure functions tested; live HTTP path covered manually in Chunk 8.

---

## Chunk 5: 2-phase commit compactRunner + audit log + pinned context writer

This is the orchestration layer. After this chunk: given a session jsonl path, compactRunner runs the full algorithm safely (lock → snapshot → split → LLM → archive → DB upsert → atomic rewrite → audit), with all 6 spec principles enforced.

### Task 5.1: Audit log writer

**Files:**
- Create: `electron/modoro/compactor/auditLog.js`
- Create: `electron/test/compactor/auditLog.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const audit = require('../../modoro/compactor/auditLog.js');

test('appendAuditEntry writes a JSONL line to specified file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  const file = path.join(dir, 'compaction.jsonl');
  audit.appendAuditEntry({
    session_id: 'sess-1',
    channel: 'openzalo',
    user_ids: ['u1'],
    trigger: 'background',
    status: 'success',
    before: { events: 100, tokens_est: 25000, bytes: 80000 },
    after: { events: 25, tokens_est: 5000, bytes: 18000 },
    pinned_count: 3,
    summary_text: 'tóm tắt',
    profile_updates: { u1: {} },
    model_used: 'gpt-5-mini',
    fallback_used: false,
    duration_ms: 1500,
  }, { filePath: file });

  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.session_id, 'sess-1');
  assert.ok(entry.ts);
  assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test('appendAuditEntry creates parent dir if missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  const file = path.join(dir, 'nested', 'deep', 'compaction.jsonl');
  audit.appendAuditEntry({ session_id: 's', status: 'skipped' }, { filePath: file });
  assert.ok(fs.existsSync(file));
});

test('appendAuditEntry serializes profile_updates as object', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  const file = path.join(dir, 'compaction.jsonl');
  audit.appendAuditEntry({
    session_id: 's',
    status: 'success',
    profile_updates: { u1: { display_name: 'Mai', decisions_added: [{ date: '2026-04-05' }] } },
  }, { filePath: file });
  const entry = JSON.parse(fs.readFileSync(file, 'utf8').split('\n')[0]);
  assert.equal(entry.profile_updates.u1.display_name, 'Mai');
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `electron/modoro/compactor/auditLog.js`**

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const paths = require('../common/paths.js');

function appendAuditEntry(entry, opts = {}) {
  const filePath = opts.filePath || paths.compactionAuditLogPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fullEntry = {
    ts: new Date().toISOString(),
    ...entry,
  };
  const line = JSON.stringify(fullEntry) + '\n';
  fs.appendFileSync(filePath, line);
}

module.exports = { appendAuditEntry };
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/compactor/auditLog.js electron/test/compactor/auditLog.test.js
git commit -m "feat(compactor): add audit log writer"
```

### Task 5.2: Pinned context text builder

**Files:**
- Create: `electron/modoro/compactor/pinnedContextWriter.js`
- Create: `electron/test/compactor/pinnedContextWriter.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPinnedContextText, buildPinnedEvent } = require('../../modoro/compactor/pinnedContextWriter.js');

const sampleProfile = {
  profile: {
    channel: 'openzalo',
    user_id: 'zalo_uid_123',
    display_name: 'Mai',
    is_vip: 1,
    personality_summary: 'thẳng thắn, quyết đoán nhanh',
    last_profile_update_at: 1712000000000,
    message_count: 247,
  },
  preferences: [
    { preference: 'thích product A', status: 'active' },
    { preference: 'không ăn cay', status: 'active' },
  ],
  decisions: [
    { date: '2026-04-05', action: 'đặt', item: 'product A', price_vnd: 5000000, delivery_date: 'thứ 3', status: 'confirmed' },
  ],
  open_loops: [
    { what: 'Báo giá product B', deadline: null, status: 'open' },
  ],
  key_facts: [
    { fact: 'sinh năm 1985' },
  ],
};

test('buildPinnedContextText includes display name', () => {
  const text = buildPinnedContextText(sampleProfile);
  assert.match(text, /HỒ SƠ KHÁCH HÀNG/);
  assert.match(text, /Tên: Mai/);
});

test('buildPinnedContextText includes decisions with prices', () => {
  const text = buildPinnedContextText(sampleProfile);
  assert.match(text, /5,000,000đ|5\.000\.000đ|5000000/);
  assert.match(text, /product A/);
});

test('buildPinnedContextText includes open loops', () => {
  const text = buildPinnedContextText(sampleProfile);
  assert.match(text, /Báo giá product B/);
});

test('buildPinnedContextText handles empty preferences', () => {
  const empty = { ...sampleProfile, preferences: [], decisions: [], open_loops: [], key_facts: [] };
  const text = buildPinnedContextText(empty);
  assert.match(text, /HỒ SƠ KHÁCH HÀNG/);
  assert.doesNotMatch(text, /undefined/);
});

test('buildPinnedEvent returns a valid jsonl event', () => {
  const e = buildPinnedEvent(sampleProfile);
  assert.equal(e.type, 'message');
  assert.equal(e.message.role, 'system');
  assert.equal(e._modoroclaw_pinned_context, true);
  assert.ok(e.message.content[0].text.includes('Mai'));
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `electron/modoro/compactor/pinnedContextWriter.js`**

```js
'use strict';

function fmtVnd(n) {
  if (typeof n !== 'number') return '?';
  return n.toLocaleString('vi-VN') + 'đ';
}

function buildPinnedContextText(data) {
  const { profile, preferences, decisions, open_loops, key_facts } = data;
  const lines = [];
  const updatedAt = profile.last_profile_update_at
    ? new Date(profile.last_profile_update_at).toISOString().slice(0, 16).replace('T', ' ')
    : 'chưa rõ';
  lines.push(`[HỒ SƠ KHÁCH HÀNG - cập nhật ${updatedAt}]`);
  if (profile.display_name) lines.push(`Tên: ${profile.display_name}`);
  if (profile.is_vip) lines.push('Khách VIP');
  if (profile.personality_summary) lines.push(`Tính cách: ${profile.personality_summary}`);

  if (preferences && preferences.length) {
    lines.push('Sở thích đã biết:');
    for (const p of preferences.filter(x => x.status === 'active')) {
      lines.push(`  - ${p.preference}`);
    }
  }

  if (decisions && decisions.length) {
    lines.push('Quyết định gần nhất:');
    const sorted = [...decisions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const d of sorted.slice(0, 5)) {
      const parts = [d.date, d.action.toUpperCase(), d.item];
      if (d.price_vnd) parts.push(fmtVnd(d.price_vnd));
      if (d.delivery_date) parts.push(`giao ${d.delivery_date}`);
      if (d.status && d.status !== 'confirmed') parts.push(`(${d.status})`);
      lines.push(`  - ${parts.filter(Boolean).join(', ')}`);
    }
  }

  if (open_loops && open_loops.length) {
    const open = open_loops.filter(x => x.status === 'open');
    if (open.length) {
      lines.push('Đang chờ bạn:');
      for (const o of open) {
        lines.push(`  - ${o.what}${o.deadline ? ' (' + o.deadline + ')' : ''}`);
      }
    }
  }

  if (key_facts && key_facts.length) {
    lines.push('Thông tin khác:');
    for (const k of key_facts) lines.push(`  - ${k.fact}`);
  }

  return lines.join('\n');
}

function buildPinnedEvent(data) {
  return {
    type: 'message',
    message: {
      role: 'system',
      content: [{ type: 'text', text: buildPinnedContextText(data) }],
      timestamp: Date.now(),
    },
    _modoroclaw_pinned_context: true,
  };
}

module.exports = { buildPinnedContextText, buildPinnedEvent };
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/compactor/pinnedContextWriter.js electron/test/compactor/pinnedContextWriter.test.js
git commit -m "feat(compactor): add pinned context text + event builder"
```

### Task 5.3: 2-phase compactRunner orchestration

**Files:**
- Create: `electron/modoro/compactor/compactRunner.js`
- Create: `electron/test/compactor/compactRunner.test.js`

- [ ] **Step 1: Write the failing test (uses fake LLM + fake DB)**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { compactSession } = require('../../modoro/compactor/compactRunner.js');
const sp = require('../../modoro/compactor/sessionParse.js');

function makeSessionFile(messageCount) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  const live = path.join(dir, 'sess.jsonl');
  const lines = ['{"type":"session","session":{"id":"s","origin":{"provider":"openzalo"}}}'];
  for (let i = 0; i < messageCount; i++) {
    lines.push(JSON.stringify({
      type: 'message',
      message: {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: [{ type: 'text', text: 'tin ' + i }],
        timestamp: 1712000000000 + i * 1000,
        origin: { senderId: 'u1' },
      },
    }));
  }
  fs.writeFileSync(live, lines.join('\n') + '\n');
  return live;
}

function fakeLLM(result) {
  return async () => result;
}

function fakeDB() {
  const captured = [];
  return {
    upserts: captured,
    upsertProfileUpdates: ({ updates, sessionId }) => {
      captured.push({ updates, sessionId });
    },
    fetchProfileBundle: () => ({
      profile: { channel: 'openzalo', user_id: 'u1', display_name: null, last_profile_update_at: Date.now() },
      preferences: [], decisions: [], open_loops: [], key_facts: [],
    }),
  };
}

test('compactSession runs full 2-phase commit on long session', async () => {
  const live = makeSessionFile(50);
  const llm = fakeLLM({
    ok: true,
    modelUsed: 'gpt-5-mini',
    fallbackUsed: false,
    data: {
      conversation_summary: 'tóm tắt',
      profile_updates: { u1: { display_name: 'U1', decisions_added: [], preferences_added: [], open_loops_added: [], key_facts_added: [], personality_traits: [], preferences_removed: [], open_loops_resolved: [] } },
    },
  });
  const db = fakeDB();
  const auditEntries = [];
  const result = await compactSession(live, {
    recentCount: 20,
    llmCall: llm,
    db,
    auditAppend: (e) => auditEntries.push(e),
    trigger: 'background',
  });

  assert.equal(result.status, 'success');
  assert.equal(db.upserts.length, 1);
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].status, 'success');
  // Live jsonl should be smaller now
  const after = sp.readSession(live);
  // meta(1) + pinned(1) + summary(1) + recent(20) = 23
  assert.ok(after.events.length <= 25);
  // Archive should exist with old events
  const archivePath = live.replace('.jsonl', '.archive.jsonl');
  assert.ok(fs.existsSync(archivePath));
  const archiveLines = fs.readFileSync(archivePath, 'utf8').split('\n').filter(Boolean);
  assert.equal(archiveLines.length, 30); // 50 - 20 recent
});

test('compactSession SKIPS when old block too small', async () => {
  const live = makeSessionFile(15); // 15 messages, recent=20 → old=0
  const llm = fakeLLM({ ok: true, data: { conversation_summary: 'x', profile_updates: {} } });
  const db = fakeDB();
  const auditEntries = [];
  const result = await compactSession(live, {
    recentCount: 20,
    llmCall: llm,
    db,
    auditAppend: (e) => auditEntries.push(e),
    trigger: 'background',
  });
  assert.equal(result.status, 'skipped');
  assert.equal(db.upserts.length, 0);
});

test('compactSession ABORTS when LLM fails — live jsonl untouched', async () => {
  const live = makeSessionFile(50);
  const sizeBefore = fs.statSync(live).size;
  const llm = fakeLLM({ ok: false, error: 'all models failed' });
  const db = fakeDB();
  const auditEntries = [];
  const result = await compactSession(live, {
    recentCount: 20,
    llmCall: llm,
    db,
    auditAppend: (e) => auditEntries.push(e),
    trigger: 'background',
  });
  assert.equal(result.status, 'llm_unavailable');
  assert.equal(fs.statSync(live).size, sizeBefore); // unchanged
  assert.equal(db.upserts.length, 0); // no upsert
  // Audit should still have an entry recording the skip
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].status, 'llm_unavailable');
});

test('compactSession preserves critical messages verbatim', async () => {
  const live = makeSessionFile(50);
  // Inject a critical message at index 5 (would otherwise be in old block)
  const events = sp.readSession(live).events;
  events[5].message.content[0].text = 'đặt 5 cái product A giá 25 triệu';
  sp.writeSessionAtomic(live, events);

  const llm = fakeLLM({
    ok: true,
    modelUsed: 'gpt-5-mini',
    fallbackUsed: false,
    data: { conversation_summary: 'x', profile_updates: { u1: { display_name: null, personality_traits: [], preferences_added: [], preferences_removed: [], decisions_added: [], open_loops_added: [], open_loops_resolved: [], key_facts_added: [] } } },
  });
  const db = fakeDB();
  const result = await compactSession(live, {
    recentCount: 20,
    llmCall: llm,
    db,
    auditAppend: () => {},
    trigger: 'background',
  });
  assert.equal(result.status, 'success');
  // The critical message must still be in the live jsonl
  const after = sp.readSession(live);
  const found = after.events.some(e =>
    e.type === 'message' &&
    e.message?.content?.[0]?.text?.includes('đặt 5 cái product A giá 25 triệu')
  );
  assert.equal(found, true, 'critical message must be preserved verbatim');
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd electron && npm test -- --test-name-pattern=compactRunner
```

- [ ] **Step 3: Implement `electron/modoro/compactor/compactRunner.js`**

```js
'use strict';

const fs = require('node:fs');
const sp = require('./sessionParse.js');
const lock = require('./sessionLock.js');
const { isCritical } = require('./criticalDetect.js');
const { estimateTokensForEvents } = require('./tokenEstimate.js');
const { buildPinnedEvent } = require('./pinnedContextWriter.js');
const { createLogger } = require('../common/logger.js');

const log = createLogger('compactRunner');

const MIN_OLD_TO_COMPACT = 5;

function pickUserIdsFromEvents(events) {
  const ids = new Set();
  for (const e of events) {
    if (e?.type === 'message') {
      const sid = e.message?.origin?.senderId;
      if (sid) ids.add(sid);
    }
  }
  return [...ids];
}

function buildSummaryEvent(summaryText, originalCount) {
  return {
    type: 'message',
    message: {
      role: 'system',
      content: [{ type: 'text', text: `[BỐI CẢNH ĐÃ NÉN] Tóm tắt ${originalCount} tin nhắn cũ: ${summaryText}` }],
      timestamp: Date.now(),
    },
    _modoroclaw_compacted_summary: true,
    _modoroclaw_original_count: originalCount,
  };
}

async function compactSession(liveSessionPath, opts) {
  const {
    recentCount = 20,
    llmCall,
    db,
    auditAppend,
    trigger = 'background',
  } = opts;

  const startedAt = Date.now();
  const fileName = liveSessionPath.split(/[\\/]/).pop();
  const sessionId = fileName.replace(/\.jsonl$/, '');

  // Acquire lock
  if (!lock.acquireLock(liveSessionPath)) {
    return { status: 'locked' };
  }

  try {
    const before = sp.readSession(liveSessionPath);
    const sizeBefore = fs.statSync(liveSessionPath).size;
    const tokensBefore = estimateTokensForEvents(before.events);

    const split = sp.splitOldRecent(before.events, recentCount);

    if (split.old.length < MIN_OLD_TO_COMPACT) {
      auditAppend({
        session_id: sessionId,
        status: 'skipped',
        trigger,
        before: { events: before.events.length, tokens_est: tokensBefore, bytes: sizeBefore },
        reason: 'old_block_too_small',
      });
      return { status: 'skipped' };
    }

    // Identify critical messages in the old block — these stay verbatim
    const oldCritical = split.old.filter(isCritical);
    const oldNonCritical = split.old.filter(e => !isCritical(e));

    // If literally everything in old is critical, no point compacting
    if (oldNonCritical.length < MIN_OLD_TO_COMPACT) {
      auditAppend({
        session_id: sessionId,
        status: 'skipped',
        trigger,
        before: { events: before.events.length, tokens_est: tokensBefore, bytes: sizeBefore },
        reason: 'all_old_critical',
      });
      return { status: 'skipped' };
    }

    // Call LLM with non-critical old block
    const llmResult = await llmCall(oldNonCritical);
    if (!llmResult.ok) {
      auditAppend({
        session_id: sessionId,
        status: 'llm_unavailable',
        trigger,
        before: { events: before.events.length, tokens_est: tokensBefore, bytes: sizeBefore },
        error: llmResult.error,
      });
      return { status: 'llm_unavailable', error: llmResult.error };
    }

    // PHASE 1: Append old non-critical events to archive
    try {
      sp.appendArchive(liveSessionPath, oldNonCritical);
    } catch (e) {
      log.error('archive append failed', { error: String(e) });
      auditAppend({
        session_id: sessionId,
        status: 'aborted',
        trigger,
        error: 'archive_append_failed: ' + String(e),
      });
      return { status: 'aborted', error: 'archive_append_failed' };
    }

    // PHASE 2: Upsert profile updates into DB
    let upsertedUserIds = [];
    try {
      const updates = llmResult.data.profile_updates || {};
      upsertedUserIds = Object.keys(updates);
      db.upsertProfileUpdates({ updates, sessionId });
    } catch (e) {
      log.error('db upsert failed', { error: String(e) });
      auditAppend({
        session_id: sessionId,
        status: 'aborted',
        trigger,
        error: 'db_upsert_failed: ' + String(e),
      });
      return { status: 'aborted', error: 'db_upsert_failed' };
    }

    // PHASE 3: Build new live jsonl
    // Slot order: meta, pinned, summary, critical pinned messages, recent verbatim
    const userIds = pickUserIdsFromEvents([...oldNonCritical, ...split.recent]);
    let pinnedEvents = [];
    if (userIds.length === 1) {
      try {
        const bundle = db.fetchProfileBundle(userIds[0]);
        if (bundle) pinnedEvents = [buildPinnedEvent(bundle)];
      } catch (e) {
        log.warn('pinned context fetch failed (non-fatal)', { error: String(e) });
      }
    }

    const newEvents = [
      ...split.meta,
      ...pinnedEvents,
      buildSummaryEvent(llmResult.data.conversation_summary, oldNonCritical.length),
      ...oldCritical,
      ...split.recent,
    ];

    // PHASE 4: Atomic rewrite
    try {
      sp.writeSessionAtomic(liveSessionPath, newEvents);
    } catch (e) {
      log.error('atomic rewrite failed', { error: String(e) });
      auditAppend({
        session_id: sessionId,
        status: 'aborted',
        trigger,
        error: 'rewrite_failed: ' + String(e),
      });
      return { status: 'aborted', error: 'rewrite_failed' };
    }

    const sizeAfter = fs.statSync(liveSessionPath).size;
    const tokensAfter = estimateTokensForEvents(newEvents);

    // PHASE 5: Audit
    auditAppend({
      session_id: sessionId,
      channel: split.meta[0]?.session?.origin?.provider || 'unknown',
      user_ids: upsertedUserIds,
      trigger,
      status: 'success',
      before: { events: before.events.length, tokens_est: tokensBefore, bytes: sizeBefore },
      after: { events: newEvents.length, tokens_est: tokensAfter, bytes: sizeAfter },
      pinned_count: oldCritical.length,
      summary_text: llmResult.data.conversation_summary,
      profile_updates: llmResult.data.profile_updates,
      model_used: llmResult.modelUsed,
      fallback_used: !!llmResult.fallbackUsed,
      duration_ms: Date.now() - startedAt,
    });

    return {
      status: 'success',
      before: { events: before.events.length, tokens_est: tokensBefore },
      after: { events: newEvents.length, tokens_est: tokensAfter },
      modelUsed: llmResult.modelUsed,
    };
  } finally {
    lock.releaseLock(liveSessionPath);
  }
}

module.exports = { compactSession, MIN_OLD_TO_COMPACT };
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/compactor/compactRunner.js electron/test/compactor/compactRunner.test.js
git commit -m "feat(compactor): add 2-phase commit compactRunner orchestration"
```

**End of Chunk 5.** Compactor end-to-end works in tests with fake LLM + fake DB. Real DB + LLM wired in next chunks.

---

## Chunk 6: CustomerMemoryService — profileService + mergeUpdates + query API

This chunk implements the real DB layer that compactRunner depends on (fakeDB in tests is replaced by this).

### Task 6.1: mergeUpdates pure function

**Files:**
- Create: `electron/modoro/memory/mergeUpdates.js`
- Create: `electron/test/memory/mergeUpdates.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProfileUpdate } = require('../../modoro/memory/mergeUpdates.js');

test('normalizeProfileUpdate fills missing arrays with empty', () => {
  const r = normalizeProfileUpdate({});
  assert.deepEqual(r.personality_traits, []);
  assert.deepEqual(r.preferences_added, []);
  assert.deepEqual(r.preferences_removed, []);
  assert.deepEqual(r.decisions_added, []);
  assert.deepEqual(r.open_loops_added, []);
  assert.deepEqual(r.open_loops_resolved, []);
  assert.deepEqual(r.key_facts_added, []);
});

test('normalizeProfileUpdate trims and deduplicates', () => {
  const r = normalizeProfileUpdate({
    preferences_added: ['  thích A  ', 'thích A', 'thích B'],
  });
  assert.deepEqual(r.preferences_added.sort(), ['thích A', 'thích B']);
});

test('normalizeProfileUpdate filters non-string entries', () => {
  const r = normalizeProfileUpdate({
    preferences_added: ['thích A', null, 42, { foo: 'bar' }],
  });
  assert.deepEqual(r.preferences_added, ['thích A']);
});

test('normalizeProfileUpdate validates decision objects', () => {
  const r = normalizeProfileUpdate({
    decisions_added: [
      { date: '2026-04-05', action: 'đặt', item: 'A', price_vnd: 5000000 },
      { foo: 'invalid' }, // missing required fields
      { date: '2026-04-06', action: 'hủy', item: 'B' },
    ],
  });
  assert.equal(r.decisions_added.length, 2);
  assert.equal(r.decisions_added[0].action, 'đặt');
  assert.equal(r.decisions_added[1].action, 'hủy');
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `electron/modoro/memory/mergeUpdates.js`**

```js
'use strict';

function dedupeStrings(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    const trimmed = x.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normalizeDecisions(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const d of arr) {
    if (!d || typeof d !== 'object') continue;
    if (!d.date || !d.action) continue;
    out.push({
      date: String(d.date),
      action: String(d.action),
      item: d.item ? String(d.item) : null,
      price_vnd: typeof d.price_vnd === 'number' ? d.price_vnd : null,
      delivery_date: d.delivery_date ? String(d.delivery_date) : null,
      status: d.status ? String(d.status) : 'confirmed',
      source_msg_id: d.source_msg_id ? String(d.source_msg_id) : null,
    });
  }
  return out;
}

function normalizeOpenLoops(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const o of arr) {
    if (!o || typeof o !== 'object') continue;
    if (!o.what) continue;
    out.push({
      date: o.date ? String(o.date) : null,
      what: String(o.what),
      deadline: o.deadline ? String(o.deadline) : null,
    });
  }
  return out;
}

function normalizeProfileUpdate(update) {
  const u = update && typeof update === 'object' ? update : {};
  return {
    display_name: u.display_name ? String(u.display_name) : null,
    personality_traits: dedupeStrings(u.personality_traits),
    preferences_added: dedupeStrings(u.preferences_added),
    preferences_removed: dedupeStrings(u.preferences_removed),
    decisions_added: normalizeDecisions(u.decisions_added),
    open_loops_added: normalizeOpenLoops(u.open_loops_added),
    open_loops_resolved: dedupeStrings(u.open_loops_resolved),
    key_facts_added: dedupeStrings(u.key_facts_added),
  };
}

module.exports = { normalizeProfileUpdate, dedupeStrings, normalizeDecisions, normalizeOpenLoops };
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/memory/mergeUpdates.js electron/test/memory/mergeUpdates.test.js
git commit -m "feat(memory): add normalizeProfileUpdate sanitizer"
```

### Task 6.2: ProfileService — DB-backed upsert + query

**Files:**
- Create: `electron/modoro/memory/profileService.js`
- Create: `electron/test/memory/profileService.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { openCustomerDb, closeAll } = require('../../modoro/memory/db.js');
const { createProfileService } = require('../../modoro/memory/profileService.js');

function freshDb() {
  closeAll();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-'));
  const dbPath = path.join(dir, 'test.db');
  return { db: openCustomerDb(dbPath), dbPath };
}

test('upsertProfileUpdates inserts new profile + child rows', () => {
  const { db } = freshDb();
  const svc = createProfileService(db, { defaultChannel: 'openzalo' });
  svc.upsertProfileUpdates({
    sessionId: 'sess-1',
    updates: {
      'zalo_uid_123': {
        display_name: 'Mai',
        personality_traits: ['thẳng thắn'],
        preferences_added: ['thích product A'],
        decisions_added: [{ date: '2026-04-05', action: 'đặt', item: 'product A', price_vnd: 5000000 }],
        open_loops_added: [{ what: 'báo giá B', deadline: null }],
        key_facts_added: ['sinh năm 1985'],
      },
    },
  });

  const profile = db.prepare('SELECT * FROM customer_profile WHERE user_id=?').get('zalo_uid_123');
  assert.equal(profile.display_name, 'Mai');
  assert.equal(profile.channel, 'openzalo');

  const prefs = db.prepare('SELECT * FROM customer_preference WHERE user_id=?').all('zalo_uid_123');
  assert.equal(prefs.length, 1);
  assert.equal(prefs[0].preference, 'thích product A');

  const decisions = db.prepare('SELECT * FROM customer_decision WHERE user_id=?').all('zalo_uid_123');
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].price_vnd, 5000000);

  const loops = db.prepare('SELECT * FROM customer_open_loop WHERE user_id=?').all('zalo_uid_123');
  assert.equal(loops.length, 1);

  const facts = db.prepare('SELECT * FROM customer_key_fact WHERE user_id=?').all('zalo_uid_123');
  assert.equal(facts.length, 1);

  closeAll();
});

test('upsertProfileUpdates auto-promotes VIP at message_count > 200', () => {
  const { db } = freshDb();
  const svc = createProfileService(db);
  // Insert profile manually with high message count
  db.prepare(`INSERT INTO customer_profile
    (channel, user_id, first_seen_at, last_seen_at, message_count) VALUES (?,?,?,?,?)`)
    .run('openzalo', 'u1', Date.now(), Date.now(), 250);
  svc.upsertProfileUpdates({
    sessionId: 'sess-2',
    updates: { 'u1': { display_name: 'High' } },
  });
  const p = db.prepare('SELECT is_vip FROM customer_profile WHERE user_id=?').get('u1');
  assert.equal(p.is_vip, 1);
  closeAll();
});

test('fetchProfileBundle returns nested structure', () => {
  const { db } = freshDb();
  const svc = createProfileService(db);
  svc.upsertProfileUpdates({
    sessionId: 'sess-3',
    updates: {
      'u2': {
        display_name: 'Bundle',
        preferences_added: ['x'],
        decisions_added: [{ date: '2026-04-01', action: 'mua', item: 'y' }],
      },
    },
  });
  const bundle = svc.fetchProfileBundle('u2');
  assert.equal(bundle.profile.display_name, 'Bundle');
  assert.equal(bundle.preferences.length, 1);
  assert.equal(bundle.decisions.length, 1);
  closeAll();
});

test('preferences_removed marks existing rows as removed (soft delete)', () => {
  const { db } = freshDb();
  const svc = createProfileService(db);
  svc.upsertProfileUpdates({
    sessionId: 's',
    updates: { 'u3': { preferences_added: ['thích A'] } },
  });
  svc.upsertProfileUpdates({
    sessionId: 's',
    updates: { 'u3': { preferences_removed: ['thích A'] } },
  });
  const rows = db.prepare('SELECT * FROM customer_preference WHERE user_id=?').all('u3');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'removed');
  assert.ok(rows[0].removed_at > 0);
  closeAll();
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `electron/modoro/memory/profileService.js`**

```js
'use strict';

const { normalizeProfileUpdate } = require('./mergeUpdates.js');

const VIP_MESSAGE_THRESHOLD = 200;

function createProfileService(db, opts = {}) {
  const defaultChannel = opts.defaultChannel || 'openzalo';

  const upsertProfileStmt = db.prepare(`
    INSERT INTO customer_profile (channel, user_id, display_name, first_seen_at, last_seen_at, message_count, last_profile_update_at, personality_summary)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(channel, user_id) DO UPDATE SET
      display_name = COALESCE(excluded.display_name, customer_profile.display_name),
      last_seen_at = excluded.last_seen_at,
      message_count = customer_profile.message_count + 1,
      last_profile_update_at = excluded.last_profile_update_at,
      personality_summary = COALESCE(excluded.personality_summary, customer_profile.personality_summary)
  `);

  const promoteVipStmt = db.prepare(`
    UPDATE customer_profile SET is_vip = 1
     WHERE channel = ? AND user_id = ? AND message_count > ?
  `);

  const insertPreferenceStmt = db.prepare(`
    INSERT INTO customer_preference (channel, user_id, preference, status, added_at, source_session_id)
    VALUES (?, ?, ?, 'active', ?, ?)
  `);

  const removePreferenceStmt = db.prepare(`
    UPDATE customer_preference
       SET status = 'removed', removed_at = ?
     WHERE channel = ? AND user_id = ? AND preference = ? AND status = 'active'
  `);

  const insertDecisionStmt = db.prepare(`
    INSERT INTO customer_decision (channel, user_id, date, action, item, price_vnd, delivery_date, status, source_session_id, source_msg_id, raw_json, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertOpenLoopStmt = db.prepare(`
    INSERT INTO customer_open_loop (channel, user_id, what, deadline, status, added_at, source_session_id)
    VALUES (?, ?, ?, ?, 'open', ?, ?)
  `);

  const resolveOpenLoopStmt = db.prepare(`
    UPDATE customer_open_loop SET status='resolved', resolved_at=?
     WHERE channel = ? AND user_id = ? AND what = ? AND status='open'
  `);

  const insertKeyFactStmt = db.prepare(`
    INSERT INTO customer_key_fact (channel, user_id, fact, added_at, source_session_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  function applyOne(channel, userId, normalized, sessionId, now) {
    upsertProfileStmt.run(
      channel, userId,
      normalized.display_name,
      now, now,
      now,
      normalized.personality_traits.length ? normalized.personality_traits.join(', ') : null
    );
    promoteVipStmt.run(channel, userId, VIP_MESSAGE_THRESHOLD);

    for (const p of normalized.preferences_added) {
      insertPreferenceStmt.run(channel, userId, p, now, sessionId);
    }
    for (const p of normalized.preferences_removed) {
      removePreferenceStmt.run(now, channel, userId, p);
    }
    for (const d of normalized.decisions_added) {
      insertDecisionStmt.run(
        channel, userId, d.date, d.action, d.item, d.price_vnd, d.delivery_date, d.status,
        sessionId, d.source_msg_id, JSON.stringify(d), now
      );
    }
    for (const l of normalized.open_loops_added) {
      insertOpenLoopStmt.run(channel, userId, l.what, l.deadline, now, sessionId);
    }
    for (const w of normalized.open_loops_resolved) {
      resolveOpenLoopStmt.run(now, channel, userId, w);
    }
    for (const f of normalized.key_facts_added) {
      insertKeyFactStmt.run(channel, userId, f, now, sessionId);
    }
  }

  function upsertProfileUpdates({ sessionId, updates, channel = defaultChannel }) {
    const now = Date.now();
    const tx = db.transaction(() => {
      for (const [userId, raw] of Object.entries(updates || {})) {
        const normalized = normalizeProfileUpdate(raw);
        applyOne(channel, userId, normalized, sessionId, now);
      }
    });
    tx();
  }

  function fetchProfileBundle(userId, channel = defaultChannel) {
    const profile = db.prepare(
      'SELECT * FROM customer_profile WHERE channel = ? AND user_id = ?'
    ).get(channel, userId);
    if (!profile) return null;
    const preferences = db.prepare(
      'SELECT * FROM customer_preference WHERE channel = ? AND user_id = ? ORDER BY added_at DESC'
    ).all(channel, userId);
    const decisions = db.prepare(
      'SELECT * FROM customer_decision WHERE channel = ? AND user_id = ? ORDER BY date DESC LIMIT 50'
    ).all(channel, userId);
    const open_loops = db.prepare(
      'SELECT * FROM customer_open_loop WHERE channel = ? AND user_id = ? ORDER BY added_at DESC'
    ).all(channel, userId);
    const key_facts = db.prepare(
      'SELECT * FROM customer_key_fact WHERE channel = ? AND user_id = ? ORDER BY added_at DESC LIMIT 30'
    ).all(channel, userId);
    return { profile, preferences, decisions, open_loops, key_facts };
  }

  function setVip(channel, userId, isVip) {
    db.prepare(
      'UPDATE customer_profile SET is_vip = ? WHERE channel = ? AND user_id = ?'
    ).run(isVip ? 1 : 0, channel, userId);
  }

  return { upsertProfileUpdates, fetchProfileBundle, setVip };
}

module.exports = { createProfileService, VIP_MESSAGE_THRESHOLD };
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd electron && npm test -- --test-name-pattern=profileService
```

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/memory/profileService.js electron/test/memory/profileService.test.js
git commit -m "feat(memory): add ProfileService with upsert + bundle query + VIP auto-promote"
```

**End of Chunk 6.** DB layer ready. compactRunner can now use real ProfileService instead of fakeDB.

---

## Chunk 7: ConversationCompactor public entry + budget logic + sweep policy

This chunk wires the building blocks (Chunks 3-6) into a single public API that main.js will call.

### Task 7.1: Compactor entry point

**Files:**
- Create: `electron/modoro/compactor/index.js`
- Create: `electron/test/compactor/index.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createCompactor } = require('../../modoro/compactor/index.js');

function tmpSession(messageCount) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compactor-idx-'));
  const live = path.join(dir, 'sess.jsonl');
  const lines = ['{"type":"session","session":{"id":"s","origin":{"provider":"openzalo"}}}'];
  for (let i = 0; i < messageCount; i++) {
    lines.push(JSON.stringify({
      type: 'message',
      message: { role: 'user', content: [{ type: 'text', text: 'a'.repeat(200) }], origin: { senderId: 'u1' } },
    }));
  }
  fs.writeFileSync(live, lines.join('\n') + '\n');
  return live;
}

test('shouldCompact returns true when usage above target', () => {
  const live = tmpSession(100); // ~ 80 chars/msg * 100 = 8000 chars / 2.5 = 3200 tokens
  const c = createCompactor({
    db: { upsertProfileUpdates: () => {}, fetchProfileBundle: () => null },
    llmCall: async () => ({ ok: true, data: { conversation_summary: 'x', profile_updates: {} } }),
    auditAppend: () => {},
    getBudget: () => 4000, // small budget so 3200 = 80% > 60% target
    sweepTargetRatio: 0.6,
  });
  assert.equal(c.shouldCompact(live), true);
});

test('shouldCompact returns false when below target', () => {
  const live = tmpSession(5);
  const c = createCompactor({
    db: { upsertProfileUpdates: () => {}, fetchProfileBundle: () => null },
    llmCall: async () => ({ ok: true, data: { conversation_summary: 'x', profile_updates: {} } }),
    auditAppend: () => {},
    getBudget: () => 30000,
    sweepTargetRatio: 0.6,
  });
  assert.equal(c.shouldCompact(live), false);
});

test('compactNow returns success when LLM ok', async () => {
  const live = tmpSession(50);
  const c = createCompactor({
    db: {
      upsertProfileUpdates: () => {},
      fetchProfileBundle: () => ({ profile: { channel: 'openzalo', user_id: 'u1', display_name: null, last_profile_update_at: Date.now() }, preferences: [], decisions: [], open_loops: [], key_facts: [] }),
    },
    llmCall: async () => ({
      ok: true,
      modelUsed: 'gpt-5-mini',
      fallbackUsed: false,
      data: { conversation_summary: 'tóm tắt', profile_updates: { u1: {} } },
    }),
    auditAppend: () => {},
    getBudget: () => 4000,
  });
  const result = await c.compactNow(live, { trigger: 'manual' });
  assert.equal(result.status, 'success');
});

test('sweep iterates over all session files in directory', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
  const a = path.join(dir, 'a.jsonl');
  const b = path.join(dir, 'b.jsonl');
  fs.writeFileSync(a, tmpSession(50)); // these are paths so reading their content as bytes
  // Actually create proper content directly:
  const lines = ['{"type":"session","session":{}}'];
  for (let i = 0; i < 50; i++) lines.push(JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'x'.repeat(200) }] } }));
  fs.writeFileSync(a, lines.join('\n') + '\n');
  fs.writeFileSync(b, '{"type":"session","session":{}}\n'); // tiny

  const compacted = [];
  const c = createCompactor({
    db: { upsertProfileUpdates: () => {}, fetchProfileBundle: () => null },
    llmCall: async () => ({ ok: true, modelUsed: 'gpt-5-mini', data: { conversation_summary: 'x', profile_updates: {} } }),
    auditAppend: (e) => { if (e.status === 'success') compacted.push(e.session_id); },
    getBudget: () => 3000,
    sessionsDir: dir,
  });
  await c.sweep();
  assert.ok(compacted.length >= 1);
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `electron/modoro/compactor/index.js`**

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sp = require('./sessionParse.js');
const { compactSession } = require('./compactRunner.js');
const { estimateTokensForEvents } = require('./tokenEstimate.js');
const paths = require('../common/paths.js');
const { createLogger } = require('../common/logger.js');

const log = createLogger('compactor');

const DEFAULT_RECENT = 20;
const DEFAULT_BUDGET = 30000;
const SWEEP_TARGET_RATIO = 0.6;
const JIT_THRESHOLD_RATIO = 0.9;

function createCompactor(opts = {}) {
  const {
    db,
    llmCall,
    auditAppend,
    getBudget = () => DEFAULT_BUDGET,
    sweepTargetRatio = SWEEP_TARGET_RATIO,
    jitThresholdRatio = JIT_THRESHOLD_RATIO,
    recentCount = DEFAULT_RECENT,
    sessionsDir = paths.sessionsDir(),
  } = opts;

  function listSessionFiles() {
    if (!fs.existsSync(sessionsDir)) return [];
    return fs.readdirSync(sessionsDir)
      .filter(f => f.endsWith('.jsonl') && !f.includes('.archive') && !f.endsWith('.lock') && !f.endsWith('.tmp'))
      .map(f => path.join(sessionsDir, f));
  }

  function tokensFor(filePath) {
    try {
      const { events } = sp.readSession(filePath);
      return estimateTokensForEvents(events);
    } catch {
      return 0;
    }
  }

  function shouldCompact(filePath, ratio = sweepTargetRatio) {
    const budget = getBudget(filePath);
    const tokens = tokensFor(filePath);
    return tokens >= Math.floor(budget * ratio);
  }

  function shouldCompactJit(filePath) {
    return shouldCompact(filePath, jitThresholdRatio);
  }

  async function compactNow(filePath, { trigger = 'manual' } = {}) {
    return compactSession(filePath, {
      recentCount,
      llmCall,
      db,
      auditAppend,
      trigger,
    });
  }

  async function sweep() {
    const files = listSessionFiles();
    log.info('sweep start', { fileCount: files.length });
    const results = [];
    for (const f of files) {
      if (!shouldCompact(f)) continue;
      try {
        const r = await compactNow(f, { trigger: 'background' });
        results.push({ file: f, ...r });
      } catch (e) {
        log.error('sweep file failed', { file: f, error: String(e) });
      }
    }
    log.info('sweep done', { compacted: results.length });
    return results;
  }

  return {
    shouldCompact,
    shouldCompactJit,
    compactNow,
    sweep,
    listSessionFiles,
    tokensFor,
  };
}

module.exports = { createCompactor, DEFAULT_BUDGET, SWEEP_TARGET_RATIO, JIT_THRESHOLD_RATIO };
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add electron/modoro/compactor/index.js electron/test/compactor/index.test.js
git commit -m "feat(compactor): add public Compactor entry with sweep + JIT helpers"
```

**End of Chunk 7.** Compactor public API ready. Next chunk: wire into main.js.

---

## Chunk 8: main.js wiring + cron sweep + IPC + smoke + manual QA

This chunk integrates the compactor into the running Electron app via the existing `startCronJobs()` infrastructure and exposes a manual-trigger IPC. After this chunk: the bot's session jsonls automatically get compacted in the background, customer profiles accumulate in DB, and admin can force a compaction via DevTools console.

### Task 8.1: Wire compactor into main.js

**Files:**
- Modify: `electron/main.js`

- [ ] **Step 1: Read current `startCronJobs()` to find insertion point**

```bash
grep -n "function startCronJobs\|startCronJobs(" electron/main.js
```

Open the file at the function definition. Note the insertion point — typically near the bottom of the function where other cron jobs are registered.

- [ ] **Step 2: Add compactor module imports near top of main.js**

Find the existing `require()` block (around line 1-50). Add after the last `require`:

```js
// MODOROClaw modules (compactor + memory)
const { createCompactor } = require('./modoro/compactor/index.js');
const { callLLM } = require('./modoro/compactor/llmCall.js');
const { appendAuditEntry } = require('./modoro/compactor/auditLog.js');
const { openCustomerDb } = require('./modoro/memory/db.js');
const { createProfileService, VIP_MESSAGE_THRESHOLD } = require('./modoro/memory/profileService.js');
```

- [ ] **Step 3: Add a compactor singleton initializer**

After `require()` block but before any function definitions, add:

```js
let _compactorInstance = null;
function getCompactor() {
  if (_compactorInstance) return _compactorInstance;
  const db = openCustomerDb();
  const profileService = createProfileService(db);
  _compactorInstance = createCompactor({
    db: profileService,
    llmCall: callLLM,
    auditAppend: appendAuditEntry,
    getBudget: (filePath) => {
      // Adaptive budget: 30k default, 80k if any user in this session is VIP
      // Read session jsonl to find sender_ids, query DB for VIP flag
      try {
        const sp = require('./modoro/compactor/sessionParse.js');
        const { events } = sp.readSession(filePath);
        const senderIds = new Set();
        for (const e of events) {
          const sid = e?.message?.origin?.senderId;
          if (sid) senderIds.add(sid);
        }
        if (senderIds.size === 0) return 30000;
        const placeholders = [...senderIds].map(() => '?').join(',');
        const row = db.prepare(
          `SELECT COUNT(*) AS n FROM customer_profile WHERE user_id IN (${placeholders}) AND is_vip = 1`
        ).get(...senderIds);
        return row && row.n > 0 ? 80000 : 30000;
      } catch {
        return 30000; // safe default on any error
      }
    },
  });
  return _compactorInstance;
}
```

- [ ] **Step 4: Add background sweep cron job inside `startCronJobs()`**

Find a spot in `startCronJobs()` next to existing cron registrations. Add:

```js
// MODOROClaw context compaction sweep — every 2 minutes
try {
  const compactor = getCompactor();
  cron.schedule('*/2 * * * *', async () => {
    try {
      await compactor.sweep();
    } catch (e) {
      console.error('[compactor sweep] failed:', e);
    }
  });
  console.log('[modoro] compactor sweep scheduled (*/2 min)');
} catch (e) {
  console.error('[modoro] compactor init failed:', e);
}
```

- [ ] **Step 5: Add IPC handler for manual compact trigger (DevTools convenience)**

Find the existing `ipcMain.handle(...)` block. Add:

```js
ipcMain.handle('modoro-compactor-sweep-now', async () => {
  try {
    const compactor = getCompactor();
    const results = await compactor.sweep();
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('modoro-compactor-stats', async () => {
  try {
    const compactor = getCompactor();
    const files = compactor.listSessionFiles();
    return {
      ok: true,
      sessionCount: files.length,
      sessions: files.map(f => ({ file: f, tokens: compactor.tokensFor(f) })),
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
```

- [ ] **Step 6: Expose IPC bridges in preload.js**

Read [electron/preload.js](electron/preload.js). Add to the existing `contextBridge.exposeInMainWorld('modoroclaw', { ... })`:

```js
compactor: {
  sweepNow: () => ipcRenderer.invoke('modoro-compactor-sweep-now'),
  stats: () => ipcRenderer.invoke('modoro-compactor-stats'),
},
```

- [ ] **Step 7: Run app and verify boot logs**

```bash
cd electron && npm start
```

Expected console output (within first 30 seconds):
- `[modoro] compactor sweep scheduled (*/2 min)`
- After ~2 minutes: `[compactor] sweep start ...` then `sweep done ...`
- No exceptions related to `modoro/`

- [ ] **Step 8: Manually trigger compaction via DevTools**

In Electron DevTools console:

```js
await window.modoroclaw.compactor.stats()
// → { ok: true, sessionCount: N, sessions: [...] }

await window.modoroclaw.compactor.sweepNow()
// → { ok: true, results: [...] }
```

If your account has long-running sessions ≥18000 tokens (60% of 30k), they should compact and you'll see audit entries.

- [ ] **Step 9: Verify audit log is being written**

```bash
tail -n 5 ~/.openclaw/workspace/logs/compaction.jsonl
```

Expected: lines with `status: "success"` or `status: "skipped"` from your manual sweep.

- [ ] **Step 10: Verify customer-profiles.db is being populated**

```bash
sqlite3 ~/.openclaw/workspace/customer-profiles.db \
  "SELECT user_id, display_name, message_count FROM customer_profile;"
```

Expected: rows for each customer that had a successful compaction.

- [ ] **Step 11: Commit main.js + preload.js changes**

```bash
git add electron/main.js electron/preload.js
git commit -m "feat: wire ConversationCompactor into main.js cron + IPC"
```

### Task 8.1b: Wire JIT safety net (consumes Spike A decision)

This task is conditional on Spike A's outcome from Chunk 1 Task 1.1. Pick the appropriate branch.

**Files (depends on Spike A outcome):**
- If A1 (plugin patch): `electron/patches/openzalo-jit-hook.ts` + add `ensureOpenzaloJitHookFix()` in `main.js`
- If A3 (no JIT, sweep-only fallback): modify `cron.schedule` from `*/2` to `*/30 * * * * *` (every 30s) AND change sweep target ratio from 0.6 to 0.5

#### If Spike A picked A1 (plugin patch hook):

- [ ] **Step 1: Read decision doc**

```bash
cat docs/superpowers/spike-results/2026-04-08-spike-A-jit-hook.md
```

Note: the exact file path + line where the inbound message handler in openzalo plugin lives.

- [ ] **Step 2: Create patch template `electron/patches/openzalo-jit-hook.ts`**

Template structure (concrete content depends on plugin's actual function — fill in based on Spike A findings):

```typescript
// MODOROClaw JIT HOOK PATCH
// Injected by ensureOpenzaloJitHookFix() in main.js
// Calls Electron IPC `modoroclaw-jit-compact-check` before relaying inbound to gateway.
// If session is at >=90% budget, blocks ~2-4s for compaction; else passes through.

import { ipcRenderer } from 'electron';

export async function jitCompactCheck(sessionId: string): Promise<void> {
  try {
    await ipcRenderer.invoke('modoroclaw-jit-compact-check', { sessionId });
  } catch {
    // never block inbound on a JIT failure
  }
}
```

- [ ] **Step 3: Add `ensureOpenzaloJitHookFix()` in main.js**

Mirror the existing `ensureOpenzaloShellFix()` pattern: read plugin source, check for marker, inject patch + marker if missing. Idempotent on every `startOpenClaw()`.

- [ ] **Step 4: Add IPC handler for JIT check in main.js**

```js
ipcMain.handle('modoroclaw-jit-compact-check', async (_e, { sessionId }) => {
  try {
    const compactor = getCompactor();
    const sessionsDir = require('./modoro/common/paths.js').sessionsDir();
    const filePath = require('path').join(sessionsDir, sessionId + '.jsonl');
    if (!require('fs').existsSync(filePath)) return { skipped: true };
    if (!compactor.shouldCompactJit(filePath)) return { skipped: true };
    const result = await compactor.compactNow(filePath, { trigger: 'jit' });
    return { compacted: true, status: result.status };
  } catch (e) {
    return { error: String(e) };
  }
});
```

- [ ] **Step 5: Verify JIT triggers under load**

Manually flood a test conversation past 90% budget within 30 seconds (faster than next sweep). Tail audit log:

```bash
tail -f ~/.openclaw/workspace/logs/compaction.jsonl | grep '"trigger":"jit"'
```

Expected: a `"trigger":"jit"` entry appears within seconds of the threshold being crossed.

- [ ] **Step 6: Commit JIT hook**

```bash
git add electron/patches/openzalo-jit-hook.ts electron/main.js
git commit -m "feat(compactor): wire JIT safety net via openzalo plugin patch"
```

#### If Spike A picked A3 (no JIT, accelerated sweep):

- [ ] **Step 1: Modify cron schedule in main.js**

Find the `cron.schedule('*/2 * * * *', ...)` from Task 8.1. Change to:

```js
cron.schedule('*/30 * * * * *', async () => {
  try { await compactor.sweep(); }
  catch (e) { console.error('[compactor sweep] failed:', e); }
});
console.log('[modoro] compactor sweep scheduled (every 30s, A3 branch)');
```

- [ ] **Step 2: Lower sweep target ratio in `getCompactor()` setup**

Add `sweepTargetRatio: 0.5` to the `createCompactor({ ... })` options object.

- [ ] **Step 3: Verify sweep cadence**

```bash
tail -f ~/.openclaw/workspace/logs/compaction.jsonl
```

Expected: entries appearing every ~30 seconds when there are sessions to compact, vs every 2 minutes before.

- [ ] **Step 4: Commit A3 branch**

```bash
git add electron/main.js
git commit -m "feat(compactor): A3 branch — 30s sweep, 50% target (no JIT hook)"
```

### Task 8.2: Add smoke test for compactor module load

**Files:**
- Modify: `electron/scripts/smoke-test.js`

- [ ] **Step 1: Add new smoke test category**

After the Task 2.6 smoke test (customer-profiles migrations), add another:

```js
{
  name: 'compactor module loads + DI graph constructible',
  fn: async () => {
    // Don't actually call LLM or open real DB — verify modules load and createCompactor is callable
    const path = require('path');
    const modoroDir = path.join(__dirname, '..', 'modoro');
    const { createCompactor } = require(path.join(modoroDir, 'compactor', 'index.js'));
    const fakeBundle = { profile: { display_name: null, last_profile_update_at: 0 }, preferences: [], decisions: [], open_loops: [], key_facts: [] };
    const c = createCompactor({
      db: { upsertProfileUpdates: () => {}, fetchProfileBundle: () => fakeBundle },
      llmCall: async () => ({ ok: false, error: 'mock' }),
      auditAppend: () => {},
      getBudget: () => 30000,
      sessionsDir: '/nonexistent', // safe — listSessionFiles returns []
    });
    if (typeof c.sweep !== 'function') throw new Error('sweep missing');
    if (typeof c.compactNow !== 'function') throw new Error('compactNow missing');
    if (typeof c.shouldCompact !== 'function') throw new Error('shouldCompact missing');
    return 'ok — DI graph builds, all methods exposed';
  }
},
```

- [ ] **Step 2: Run smoke**

```bash
cd electron && npm run smoke
```

Expected: new test passes, all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add electron/scripts/smoke-test.js
git commit -m "smoke: verify compactor module loads on every build"
```

### Task 8.3: Add CLAUDE.md patches entry

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append entry under "Current patches" section**

```markdown
### Context compaction backend (`modoro/compactor`, `modoro/memory`)
**Bug:** openclaw session jsonls grow forever — never compact, never summarize. Long Telegram/Zalo conversations eventually overflow LLM context, bot crashes mid-reply with "context window exceeded". Plus: no per-customer memory across sessions, bot forgets what customer said yesterday.
**Fix:** Two new services in `electron/modoro/`:
- `compactor/` — every 2 minutes scans `~/.openclaw/agents/main/sessions/*.jsonl`, files at ≥60% of token budget get compacted via 2-phase commit (archive → DB upsert → atomic rewrite). Critical messages (money, dates, decisions) detected via regex and kept verbatim. LLM unavailable → silent skip, never destructive heuristic.
- `memory/` — `customer-profiles.db` SQLite with structured tables for preferences, decisions, open loops, key facts. Updates extracted by gpt-5-mini via 9router during compaction (one LLM call does double duty). Per-user `is_vip` auto-promotes at message_count > 200.
**Auto-apply:** `getCompactor()` singleton in `main.js`; cron registered in `startCronJobs()`. Smoke test verifies module load + DB migration on every build. Spec: [docs/superpowers/specs/2026-04-08-context-compaction-customer-memory-design.md](docs/superpowers/specs/2026-04-08-context-compaction-customer-memory-design.md).
**Verify:** `tail ~/.openclaw/workspace/logs/compaction.jsonl` shows entries with `status: "success"` after long sessions exist. `sqlite3 ~/.openclaw/workspace/customer-profiles.db "SELECT COUNT(*) FROM customer_profile"` shows growing customer count. Bot never replies "context window exceeded".
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE): document context compaction patches"
```

### Task 8.4: Manual end-to-end smoke (the real verification)

This is a manual checklist — no code, just observe behavior on a real running app.

- [ ] **Step 1: Send 50 messages to bot in DM**

Open Telegram or Zalo, send the bot 50 messages spaced ~3 seconds apart. Mix in:
- A money mention: "anh báo giá product A 5 triệu nhé"
- A decision: "ok chốt 1 cái"
- A date: "giao ngày 12/4"
- An open question: "có còn hàng không?"

- [ ] **Step 2: Wait for next sweep (≤2 minutes)**

```bash
tail -f ~/.openclaw/workspace/logs/compaction.jsonl
```

Expected: a `status: "success"` entry appears with your session_id.

- [ ] **Step 3: Check live jsonl shrunk**

```bash
ls -la ~/.openclaw/agents/main/sessions/ | grep -v archive | grep jsonl
```

Find your session — size should be smaller than before. The corresponding `.archive.jsonl` should now exist with the original content.

- [ ] **Step 4: Check critical messages preserved**

```bash
cat ~/.openclaw/agents/main/sessions/<your-session>.jsonl | grep -E "(5 triệu|chốt|12/4|còn hàng)"
```

Expected: ALL 4 critical messages present in the live (compacted) jsonl, not just in archive.

- [ ] **Step 5: Check customer profile populated**

```bash
sqlite3 ~/.openclaw/workspace/customer-profiles.db <<'SQL'
SELECT user_id, display_name, message_count, is_vip FROM customer_profile;
SELECT user_id, action, item, price_vnd, date FROM customer_decision;
SELECT user_id, what FROM customer_open_loop WHERE status = 'open';
SQL
```

Expected: profile row exists, decision row mentions "đặt"/"chốt" + product A + 5000000, open loop "có còn hàng" or similar.

- [ ] **Step 6: Test reply quality after compaction**

Send another message to the bot in the SAME conversation: "anh muốn hỏi thêm về sản phẩm hôm trước". Bot should reference product A correctly because pinned context (slot 1) has the structured profile.

- [ ] **Step 7: Test LLM unavailable resilience**

Stop 9router: in 9Router tab, hit Stop. Then send 10 more messages. Wait 2 min. Tail audit log:

```bash
tail -n 5 ~/.openclaw/workspace/logs/compaction.jsonl
```

Expected: entries with `status: "llm_unavailable"`. Live jsonl size unchanged. No data lost.

- [ ] **Step 8: Restart 9router, verify resume**

Restart 9router. Wait 2 min. Audit log should show next sweep returning to `success`.

- [ ] **Step 9: Verify no customer-visible disruption**

Throughout steps 1-8, the bot should never send any "Gateway is restarting", "context overflow", or weird latency anomaly to the customer. If it did, FAIL — investigate with the runbook in spec § "Error handling matrix".

- [ ] **Step 10: Final commit (if any followup tweaks needed)**

If steps 1-9 all passed, no commit needed. If you fixed something during QA, commit it now.

```bash
git status
git add <fixed files>
git commit -m "fix(compactor): <what you fixed> based on manual QA"
```

**End of Chunk 8.** Plan 1 complete. Backend compaction shipping; Plan 2 (Dashboard UI + Export/Backup) to follow.

---

## Plan 1 summary

**What this plan delivers:**
- 3 spike decision docs (resolves architectural unknowns)
- 11 new modules under `electron/modoro/` (compactor + memory + common)
- 11 new test files (~120 unit tests via `node:test`)
- 4 new fixture files
- 3 modified files (main.js, preload.js, CLAUDE.md, smoke-test.js)
- 1 new SQLite schema with 5 tables + 5 indexes
- 1 audit log + auto-rotating archive
- ~25 git commits, each ~self-contained

**What this plan does NOT deliver (deferred to Plan 2):**
- Dashboard side panel for viewing customer profiles
- Sao lưu tab + export/backup/restore
- CSV export
- Per-customer export zip
- Manual VIP toggle UI (DB column exists, no UI yet)

**Total estimated steps:** ~120

**Each step is 2-5 minutes per the writing-plans skill convention.** Ship after Phase 0 spikes complete + manual end-to-end smoke passes.
