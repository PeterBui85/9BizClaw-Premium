---
title: Gateway reliability — bonjour crash loop + cooldown + grace fix
date: 2026-04-17
status: draft
---

# Gateway reliability — bonjour crash loop + cooldown bypass + boot grace fix

## Context

Customer machine LINH-BABY (MODORO-Auto PC) exhibits repeated gateway restart loop every 3–5 minutes. Each restart costs 64–76s of downtime during which the bot cannot respond. Over a 13-minute window observed on 2026-04-17, 4 full restart cycles consumed ~260s of bot unavailability.

Previous session applied a bonjour cooldown mechanism (`_bonjourCooldownUntil`) intended to wait 5 minutes for mDNS TTL to expire before restarting. Log evidence from the customer machine proves the cooldown is cosmetic — the restart path bypasses the check entirely.

openclaw 2026.4.14 ships an **official** way to disable bonjour via `OPENCLAW_DISABLE_BONJOUR=1` env var or `discovery.mdns.mode = "off"` config. Verified in vendor source at [server.impl-BbJvXoPb.js:19982 and :20261](../../../../AppData/Roaming/9bizclaw/vendor/node_modules/openclaw/dist/server.impl-BbJvXoPb.js). No source patching required.

## Log evidence (LINH-BABY, 2026-04-17)

**Cooldown bypass (Part 2):**
```
03:30:21 [restart-guard] bonjour conflict exit — waiting 5min for mDNS TTL before restart
03:30:27 [boot] T+0ms start9Router (parallel warmup)    ← 6 seconds later, not 5min
03:39:24 [restart-guard] bonjour conflict exit — waiting 5min for mDNS TTL before restart
03:39:25 [boot] T+0ms start9Router (parallel warmup)    ← 1 second later
```

**Boot times (Part 3):**
```
03:28:23 gateway WS ready on :18789 after 76195ms (70 probes)
03:31:36 gateway WS ready on :18789 after 67857ms (68 probes)
03:36:36 gateway WS ready on :18789 after 68932ms (65 probes)
03:40:31 gateway WS ready on :18789 after 64294ms (63 probes)
```
Range 64–76s. Current fast-watchdog bootGrace = 60s — boot would fail watchdog check during warmup on this machine if watchdog probe ran during grace window.

**Pricing bootstrap crash (Part 4):**
```
03:35:24 [fast-watchdog] Gateway dead (8 fails) — restarting
         lastError: [model-pricing] pricing bootstrap failed: TimeoutError
```
Gateway exited with code 1 because openclaw's model-pricing fetch timed out on flaky network. Currently treated as a hard failure → immediate restart → wastes another 68s boot cycle.

## Design — 4 parts

### Part 1 — Disable bonjour (root cause)

Two-layer defense, both using **official openclaw APIs** (no source patch):

**Layer A — env var at gateway spawn** (`_startOpenClawImpl` in [main.js](../../../electron/main.js)):
```js
enrichedEnv.OPENCLAW_DISABLE_BONJOUR = "1";
```

**Layer B — config in `ensureDefaultConfig()`:**
```js
if (!config.discovery) config.discovery = {};
if (!config.discovery.mdns) config.discovery.mdns = {};
if (config.discovery.mdns.mode !== "off") {
  config.discovery.mdns.mode = "off";
  changed = true;
}
```

**Why double-layer:**
- Env var protects gateway spawn path even if config is reset
- Config protects cron-agent subprocess spawns + CLI calls that don't inherit Electron's env
- If openclaw removes env var in future version, config still works
- If openclaw renames config key, env var still works

**Verify:** Gateway log MUST NOT contain `[bonjour] advertised`, `[bonjour] watchdog`, or `[bonjour] restarting advertiser` lines.

### Part 2 — Fix cooldown bypass (critical silent bug)

Current state: `_bonjourCooldownUntil` is set in the gateway-exit handler but checked only in fast-watchdog ([main.js:12628](../../../electron/main.js#L12628)). The heartbeat handler, IPC restart handler, and boot handler all bypass it. Log shows cosmetic "waiting 5min" message with actual restart 1–6 seconds later.

**Fix:** Centralize cooldown check in `startOpenClaw()` wrapper — the single choke point for all 12+ call sites.

```js
async function startOpenClaw() {
  if (_startOpenClawInFlight) return;

  const now = Date.now();
  const bonjourUntil = global._bonjourCooldownUntil || 0;
  const networkUntil = global._networkCooldownUntil || 0;
  const cooldownUntil = Math.max(bonjourUntil, networkUntil);

  if (cooldownUntil > now) {
    const remaining = Math.ceil((cooldownUntil - now) / 1000);
    const reason = bonjourUntil > networkUntil ? 'bonjour' : 'network';
    console.log(`[startOpenClaw] ${reason} cooldown active — skipping (${remaining}s remaining)`);
    return;
  }

  return _startOpenClawImpl();
}
```

After Part 1 lands, bonjour cooldown rarely triggers. But Part 2 is still required as safety net + correct behavior. Also covers Part 4's network cooldown.

**Verify:** Force a bonjour-style exit (kill gateway after setting `_bonjourCooldownUntil`). Confirm next `startOpenClaw()` call logs `bonjour cooldown active — skipping Ns remaining` and does not spawn.

### Part 3 — Boot grace + dead thresholds

Data from LINH-BABY shows 64–76s boot times. Other customer machines may be slower. Current thresholds are too aggressive for entry-level SSDs + Windows Defender real-time scan.

| Parameter | Current | New | Rationale |
|---|---|---|---|
| fast-watchdog bootGrace | 90s | 180s | Boot 76s observed on LINH-BABY is 85% of 90s grace — one slow boot crosses it; slower disks worse |
| fast-watchdog dead threshold | 3 fails | 5 fails | AI completion cloud model can hold gateway 30–60s |
| fast-watchdog probe timeout | 10s | 15s | Cloud model cold start first-token latency |
| heartbeat dead threshold | 2 fails | 3 fails | Same reason |
| `isGatewayAlive` timeout | 8s | 15s | Same reason |

**Trade-off:** Gateway truly dead now detected in 3–5 minutes (vs 1–2 minutes). Acceptable because:
- Real-dead cases are rare
- False-positive kills cost 64–76s boot each
- Zalo listener PID check + 30-min heartbeat still catch long outages

**Verify:** Simulate slow boot (delay gateway init 90s). Confirm fast-watchdog does not kill during grace window.

### Part 4 — Model-pricing timeout → transient network cooldown

Log evidence confirms `[model-pricing] pricing bootstrap failed: TimeoutError` causes openclaw to exit code 1. Currently restart-guard only recognizes bonjour exits. Adding network-class detection:

```js
// In gateway exit handler (where bonjour detection lives today)
const lastErrorStr = String(lastError || '');
const isTransientNetwork =
  lastErrorStr.includes('pricing bootstrap failed') ||
  lastErrorStr.includes('TimeoutError');

if (isTransientNetwork) {
  global._networkCooldownUntil = Date.now() + 60_000; // 60s
  console.log('[restart-guard] transient network exit — waiting 60s before restart');
}
```

60s cooldown is short because network blips clear quickly. The cooldown check in `startOpenClaw()` wrapper (Part 2) handles both `_bonjourCooldownUntil` and `_networkCooldownUntil`.

**Verify:** Block outbound HTTPS temporarily during boot → confirm gateway exits with pricing timeout → `_networkCooldownUntil` set → next `startOpenClaw()` waits 60s → then boots clean.

## Testing strategy

**Local dev:**
1. Smoke test — spawn gateway, grep gateway log for `bonjour` (expect zero hits)
2. Force bonjour cooldown — call `_bonjourCooldownUntil = Date.now() + 30000` then call `startOpenClaw()`. Confirm log says skipping, not spawning.
3. Delay gateway boot artificially (mock 90s) — confirm fast-watchdog does not kill during 180s grace
4. Block 9router HTTPS via hosts file → confirm pricing timeout → confirm 60s cooldown

**Customer regression:**
- Ship build to LINH-BABY
- Monitor log for 24h
- Expected: zero `[bonjour]` lines, zero `[restart-guard] ... exit` lines, gateway WS ready once per Electron lifecycle

## Fresh-install parity (CLAUDE.md Rule #1)

- Env var `OPENCLAW_DISABLE_BONJOUR=1` applied via `enrichedEnv` at every gateway spawn → every user, every boot
- `discovery.mdns.mode = "off"` merged via `ensureDefaultConfig()` → every fresh install, every restart
- Grace/threshold constants in source → shipped via build
- Cooldown check in `startOpenClaw()` wrapper → covers all 12+ call sites automatically

RESET.bat + RUN.bat flow: env var + config applied at first gateway spawn → fresh install has no bonjour, no cooldown bypass.

## Risk assessment

| Risk | Mitigation |
|---|---|
| openclaw upgrade renames env var | Config layer remains; detection if `[bonjour]` re-appears in log |
| openclaw upgrade adds different discovery mechanism | Config still sets `mdns.mode = "off"`; any new key discovered during upgrade review |
| Disabling bonjour breaks a feature we rely on | Bonjour is only used for LAN gateway discovery via mDNS. MODOROClaw uses local-only `127.0.0.1:18789` — no discovery needed. |
| 180s grace causes user to think app hangs | Sidebar channel dot shows "checking" state; wizard/UI feedback unchanged |
| Dead threshold 5 fails misses real dead gateway | 30-min heartbeat + Zalo listener PID check still catch long outages |
| Network cooldown blocks legitimate restart | 60s is short; if user clicks Restart, they can observe the skip message and wait |

## Out of scope

- Fixing openclaw's 64–76s TypeScript cold-compile time (upstream concern)
- Reducing vendor extract time (already handled by prebuild-vendor)
- Alternate gateway discovery mechanisms (Tailscale etc)

## Rollback plan

All changes are additive + gated. Rollback = revert 4 edits in main.js:
1. Remove `enrichedEnv.OPENCLAW_DISABLE_BONJOUR = "1"` line
2. Remove `discovery.mdns.mode` heal in `ensureDefaultConfig`
3. Remove cooldown check in `startOpenClaw()` wrapper
4. Remove network-class detection in exit handler
5. Revert threshold constants to old values

Build + ship. Reverts cleanly because no persistent state introduced.
