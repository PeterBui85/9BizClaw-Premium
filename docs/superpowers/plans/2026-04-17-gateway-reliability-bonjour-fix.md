# Gateway Reliability — Bonjour Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate gateway bonjour crash loop + cooldown-bypass bug + tune boot grace / thresholds / transient-network handling on MODOROClaw customer machines.

**Architecture:** 4 surgical edits to `electron/main.js`. Disable openclaw bonjour via official env var + config (Part 1). Fix cosmetic cooldown by centralizing check in `startOpenClaw()` wrapper (Part 2). Relax watchdog constants to accommodate 64–76s boot times (Part 3). Add transient-network cooldown for pricing-timeout exits (Part 4). No source patching of openclaw. Additive + gated.

**Tech Stack:** Electron 28 / Node 18 / openclaw 2026.4.14 vendor package.

**Spec:** [docs/superpowers/specs/2026-04-17-gateway-reliability-bonjour-fix-design.md](../specs/2026-04-17-gateway-reliability-bonjour-fix-design.md)

**Testing approach:** Gateway spawn logic has no unit test harness. Verification is manual (local dev run + customer build verification). Each task specifies exact log lines to grep for.

**No new branch:** This is urgent customer hotfix. Work on main, commit per task, build + ship as single v2.3.45 build after all 4 tasks land.

---

## File Structure

**Modified files (1):**
- `electron/main.js` — four surgical edits at known line ranges

**No new files. No test files** (Electron spawn logic is not unit-testable here; verification = run app + inspect log).

---

## Chunk 1: The 4 code edits

### Task 1: Disable bonjour (Part 1)

**Files:**
- Modify: `electron/main.js` around line 6147 (gateway spawn enrichedEnv) + inside `ensureDefaultConfig()` (search for function start)

**Why:** Gateway log shows `[bonjour] watchdog detected non-announced service` exit code 1 every 3–5 min. openclaw 2026.4.14 supports `OPENCLAW_DISABLE_BONJOUR=1` env var + `discovery.mdns.mode = "off"` config (verified at vendor `server.impl-BbJvXoPb.js:19982, :20261`).

- [ ] **Step 1: Add env var at gateway spawn**

Find the gateway spawn's `enrichedEnv = { ...process.env }` (around line 6147 in `_startOpenClawImpl`). After the existing `9BIZ_WORKSPACE` delete+set block, add:

```js
// Disable openclaw's mDNS/bonjour — causes crash loops on some Windows machines
// when mDNS watchdog sees its own stale record. openclaw 2026.4.14 official
// env var (verified at vendor server.impl-BbJvXoPb.js:20261).
enrichedEnv.OPENCLAW_DISABLE_BONJOUR = "1";
```

- [ ] **Step 2: Add config heal in `ensureDefaultConfig`**

Locate `ensureDefaultConfig()`. After the existing `channels.openzalo` / `dmPolicy` heals, add:

```js
// Defense-in-depth: config layer in case env var fails to propagate (e.g.,
// cron-agent subprocess spawn that doesn't inherit enrichedEnv).
if (!config.discovery) config.discovery = {};
if (!config.discovery.mdns) config.discovery.mdns = {};
if (config.discovery.mdns.mode !== "off") {
  config.discovery.mdns.mode = "off";
  changed = true;
}
```

- [ ] **Step 3: Verify locally**

```bash
cd c:/Users/buitu/Desktop/claw/electron
npm start
```

Wait for `[startOpenClaw] gateway WS ready on :18789 after Nms`. In a separate terminal:

```bash
grep -i bonjour "$APPDATA/9bizclaw/logs/openclaw.log" | head -20
```

Expected: **zero hits**. If any `[bonjour]` line appears, env var or config did not propagate.

- [ ] **Step 4: Commit**

```bash
git add electron/main.js
git commit -m "fix(gateway): disable openclaw bonjour via official env+config

Bonjour watchdog was crashing gateway every 3-5 min on customer
machines (LINH-BABY). Use openclaw 2026.4.14 official disable path —
no source patch.

Layer A: OPENCLAW_DISABLE_BONJOUR=1 env var at gateway spawn
Layer B: discovery.mdns.mode=off in openclaw.json

Verified env var in vendor server.impl-BbJvXoPb.js:20261."
```

---

### Task 2: Fix cooldown bypass (Part 2)

**Files:**
- Modify: `electron/main.js` — `startOpenClaw()` wrapper (around line 5765)

**Why:** Log shows `[restart-guard] waiting 5min for mDNS TTL` followed by restart 1–6s later. `_bonjourCooldownUntil` is set at line 6562 but only checked inside fast-watchdog at line 12628. All other call sites (heartbeat, IPC, boot) bypass it. Centralize at the single choke point.

- [ ] **Step 1: Locate `startOpenClaw()` wrapper**

Open [electron/main.js](../../../electron/main.js). Find the wrapper that starts at approximately line 5765 — the function that guards `_startOpenClawInFlight` and delegates to `_startOpenClawImpl()`.

- [ ] **Step 2: Add cooldown check inside wrapper**

Immediately after the `if (_startOpenClawInFlight) return;` line, BEFORE the `_startOpenClawInFlight = true;` assignment, insert:

```js
// [restart-guard A1 fix] Check bonjour + network cooldowns at the single
// choke point. Previously _bonjourCooldownUntil was set but only checked
// in fast-watchdog — all other call sites bypassed it silently.
const now = Date.now();
const bonjourUntil = global._bonjourCooldownUntil || 0;
const networkUntil = global._networkCooldownUntil || 0;
const cooldownUntil = Math.max(bonjourUntil, networkUntil);
if (cooldownUntil > now) {
  const remaining = Math.ceil((cooldownUntil - now) / 1000);
  const reason = bonjourUntil >= networkUntil ? 'bonjour' : 'network';
  console.log(`[startOpenClaw] ${reason} cooldown active — skipping (${remaining}s remaining)`);
  return;
}
```

- [ ] **Step 3: Verify locally (two trigger paths)**

Open Electron DevTools (Ctrl+Shift+I). Force cooldown:

```js
// In main-process access via DevTools: use window.claw bridge if exposed,
// else test via main process log. Simpler: edit main.js temporarily to set
// global._bonjourCooldownUntil = Date.now() + 30000 on boot, then observe.
// For this task, manual test acceptable: set via REPL if available, then
// trigger TWO different paths to confirm wrapper catches both:
//   Path A (IPC): click "Khởi động lại gateway" button in Dashboard
//   Path B (heartbeat simulation): wait for heartbeat cron firing, OR
//   manually call main-process function via ipcMain test stub
```

Expected main.log line for BOTH paths: `[startOpenClaw] bonjour cooldown active — skipping 30s remaining`. If only one path shows it, wrapper is not the single choke point and the review assumption is wrong — stop and investigate.

- [ ] **Step 4: Commit**

```bash
git add electron/main.js
git commit -m "fix(gateway): centralize cooldown check in startOpenClaw wrapper

_bonjourCooldownUntil was cosmetic — only checked in fast-watchdog.
All other call sites (heartbeat, IPC, boot) bypassed it silently,
causing log to claim '5min wait' while actually restarting in 1-6s.

Move check to startOpenClaw() wrapper — the single choke point for
12+ call sites. Also covers _networkCooldownUntil (Task 4)."
```

---

### Task 3: Grace + threshold tuning (Part 3)

**Files:**
- Modify: `electron/main.js` — fast-watchdog constants (line 12610, 12614, 12628)
- Modify: `electron/main.js` — heartbeat threshold (line 13540)
- Modify: `electron/main.js` — `isGatewayAlive` timeout default (grep for `function isGatewayAlive`)

**Why:** LINH-BABY shows boot 64–76s (85% of current 90s grace). One slow boot crosses grace. Probe 10s misses AI-completion-busy gateway. Dead threshold 3 fails too tight for cloud model cold starts.

- [ ] **Step 1: Fast-watchdog bootGrace 90s → 180s**

Line 12610, change:
```js
if (global._gatewayStartedAt && (Date.now() - global._gatewayStartedAt) < 90000) {
```
to:
```js
if (global._gatewayStartedAt && (Date.now() - global._gatewayStartedAt) < 180000) {
```
Update comment on line 12608-12609 to reflect new value.

- [ ] **Step 2: Fast-watchdog probe timeout 10s → 15s**

Lines 12614 + 12620, change both `isGatewayAlive(10000)` to `isGatewayAlive(15000)`.

- [ ] **Step 3: Fast-watchdog dead threshold 3 → 5 fails**

Line 12628, change `_fwGatewayFailCount >= 3` to `_fwGatewayFailCount >= 5`. Update comment 12626-12627.

- [ ] **Step 4: Heartbeat dead threshold 2 → 3 fails**

Line 13540 (and surrounding logic — search for `consecutive failures` in heartbeat handler). Change 2-fail restart to 3-fail restart. Update log string.

- [ ] **Step 5: `isGatewayAlive` default timeout 8s → 15s**

Line 3636 (`function isGatewayAlive(timeoutMs = 8000)`). Change default parameter `timeoutMs = 8000` to `timeoutMs = 15000`.

- [ ] **Step 6: Verify locally**

Restart app. Watch log — expect `[fast-watchdog]` messages silent for ~3 min even on cloud-model cold start.

- [ ] **Step 7: Commit**

```bash
git add electron/main.js
git commit -m "fix(gateway): tune watchdog grace + thresholds for slow machines

Customer LINH-BABY shows boot 64-76s (85% of old 90s grace). Slow SSD
+ Defender scan crosses grace easily. Cloud model cold start holds
gateway 30-60s, causing probe timeout at 10s → false-positive dead.

- fast-watchdog bootGrace 90s → 180s
- fast-watchdog probe timeout 10s → 15s
- fast-watchdog dead threshold 3 → 5 fails
- heartbeat dead threshold 2 → 3 fails
- isGatewayAlive default 8s → 15s

Trade-off: real-dead detection 1-2min → 3-5min. Zalo listener PID +
30-min heartbeat still catch long outages."
```

---

### Task 4: Pricing-timeout transient cooldown (Part 4)

**Files:**
- Modify: `electron/main.js` around line 6554 (where `isBonjourConflict` is computed)

**Why:** Log shows `[model-pricing] pricing bootstrap failed: TimeoutError` causes gateway exit code 1. Currently triggers immediate restart → wastes 68s boot cycle. Detect + 60s cooldown.

- [ ] **Step 1: Add transient-network detection at gateway exit**

Locate line 6554 area where `isBonjourConflict` is computed from `lastError`. Immediately after the bonjour handling block (around line 6562-6565), add:

```js
const isTransientNetwork =
  String(lastError || '').includes('pricing bootstrap failed') ||
  String(lastError || '').includes('TimeoutError');
if (isTransientNetwork && !isBonjourConflict) {
  global._networkCooldownUntil = Date.now() + 60_000;
  console.log('[restart-guard] transient network exit — waiting 60s before restart');
}
```

- [ ] **Step 2: Verify locally**

Pricing endpoint verified in vendor source at `usage-format-D9hTKwOA.js:48` → `https://openrouter.ai/api/v1/models`. Block it via either:

**Option A (hosts file, Windows requires Admin):**
```
Add to C:\Windows\System32\drivers\etc\hosts:
127.0.0.1 openrouter.ai
```
Flush DNS: `ipconfig /flushdns`. Restart MODOROClaw.

**Option B (Windows Firewall outbound rule by process):**
Control Panel → Windows Defender Firewall → Advanced → Outbound Rules → New Rule → Program: `%APPDATA%\9bizclaw\vendor\node\node.exe` → Block → Name "MODOROClaw test block". Delete rule after test.

Expected (requires Task 2 already landed):
1. Gateway exits with `pricing bootstrap failed: TimeoutError`
2. Log: `[restart-guard] transient network exit — waiting 60s before restart`
3. Next `startOpenClaw()` logs: `[startOpenClaw] network cooldown active — skipping Ns remaining`

**Cleanup:** Remove hosts entry OR delete firewall rule. Confirm `curl https://openrouter.ai/api/v1/models` returns 200 before shipping.

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "fix(gateway): transient-network cooldown for pricing-timeout exits

openclaw model-pricing fetch can TimeoutError on flaky network, crashes
gateway code 1. Current behavior = immediate restart → 68s boot wasted
→ likely to fail again on same timeout.

Set _networkCooldownUntil=now+60s on detection. Cooldown check in
startOpenClaw() wrapper (Task 2) handles both bonjour + network."
```

---

### Task 5: Smoke + local verify + build

**Files:**
- `electron/package.json` — version bump

- [ ] **Step 1: Run smoke-test**

```bash
cd c:/Users/buitu/Desktop/claw/electron
npm run smoke
```

Expected: exit 0. Vendor pins match, openclaw `--help` exits 0, plugin patch anchors match.

- [ ] **Step 2: Manual verification — 5min observation**

```bash
npm start
```

Wait 5 minutes then grep:
```bash
grep -i bonjour "$APPDATA/9bizclaw/logs/main.log"
grep "restart-guard" "$APPDATA/9bizclaw/logs/main.log"
grep "Gateway dead" "$APPDATA/9bizclaw/logs/main.log"
```

Expected: zero hits on all three. If any hit: Phase 1 root-cause investigation before proceeding.

- [ ] **Step 3: Bump version**

Edit `electron/package.json` — bump `version` to `2.3.45`.

- [ ] **Step 4: Build Windows**

```bash
cd c:/Users/buitu/Desktop/claw/electron
npm run build:win
```

Expected: `dist/9BizClaw Setup 2.3.45.exe` exists, size ~370 MB, smoke in chain passed.

- [ ] **Step 5: Commit version bump**

```bash
git add electron/package.json
git commit -m "chore(release): v2.3.45 — gateway reliability fixes

- disable bonjour (Task 1)
- fix cooldown bypass (Task 2)
- tune watchdog grace + thresholds (Task 3)
- transient-network cooldown (Task 4)

Local 5min smoke OK. Ready for customer deploy review."
```

**STOP HERE. Do not deploy.** Hand off to CEO for build review before deploy (user feedback: "always review before build/ship"). Proceed to Task 6 only after CEO approval.

---

### Task 6: Deploy to LINH-BABY (separate gate)

**Files:** No edits. Operational action only.

**Pre-flight:**

- [ ] **Step 1: Confirm deploy window**

Contact LINH-BABY operator. Confirm:
- Customer is not in active sales conversation (no pending Zalo/Telegram threads mid-reply)
- Acceptable to have 3–5 min bot downtime for install + first boot
- Operator is available to observe post-install boot

Do NOT deploy during business hours if active conversations are ongoing. If unsure, defer to next idle window (nights/weekends).

- [ ] **Step 2: Transfer build**

Transfer `dist/9BizClaw Setup 2.3.45.exe` to customer machine via chosen channel (Drive link, USB, etc.).

- [ ] **Step 3: Install + first boot observation**

On customer machine:
1. Close existing MODOROClaw
2. Run `9BizClaw Setup 2.3.45.exe`
3. Open app, wait for gateway ready
4. Watch sidebar channel dots — expect Telegram + Zalo both green within 2 min
5. Send 1 test message on Telegram + 1 on Zalo → confirm bot replies

- [ ] **Step 4: 1h + 24h observation**

Collect `%APPDATA%\9bizclaw\logs\main.log` at T+1h and T+24h. Grep for:
- `bonjour` (expect zero)
- `restart-guard` (expect zero)
- `Gateway dead` (expect zero)
- `[startOpenClaw] gateway WS ready` (expect exactly 1 occurrence per Electron launch unless user manually restarts)

If any regression: revert v2.3.44 on customer machine, collect full log, root-cause before next attempt.

---

## Rollback

Each task is one commit. Rollback = `git revert <sha>` of any task that regresses. No persistent state introduced — all changes are in-memory / config-idempotent.

## Out of scope (deferred)

- Smoke-test assertion that `pricing bootstrap failed` / `TimeoutError` strings still appear in vendor source (reviewer note, non-blocker)
- Fixing openclaw's 64–76s TypeScript cold-compile time (upstream)
- Reducing vendor extract time (already handled by prebuild-vendor)
