# Overnight Bug Sweep — Handoff

**Updated:** 2026-06-02 ~09:05 AM UTC+7

## Build Status

**Your 8:22 AM exe does NOT include the manual fixes.** The exe was built before the fixes were applied.

| File | Fix Applied | Included in 8:22 AM exe |
|------|-------------|------------------------|
| `electron/lib/gateway.js` | lastError on spawn error | NO |
| `electron/lib/config.js` | req cleanup + BOM guard | NO |
| `electron/lib/cron-api.js` | listener leak + silent catches | NO |
| `electron/lib/channels.js` | getWorkspace null guards (2 CRITICAL) | NO |
| `electron/lib/nine-router.js` | res.on('error') missing | NO |
| `electron/scripts/check-zalo-account-settings.js` | JSON.parse try/catch | NO |
| `electron/scripts/migrate-licenses-to-supabase.js` | empty catch → warn | NO |
| `electron/lib/dashboard-ipc.js` | workspace null guards (auto-fixed) | NO |
| `electron/lib/fb-schedule.js` | workspace null guard (auto-fixed) | YES |
| `electron/lib/runtime-installer.js` | workspace null guard (auto-fixed) | YES |
| `electron/lib/zalo-memory.js` | workspace null guards (auto-fixed) | YES |
| `electron/lib/zalo-menu.js` | workspace null guard (auto-fixed) | YES |

**To rebuild with all fixes:**
```
cd D:\claw\electron
npm run build:win
```

## Sweeper Status

**Current 5-hour sweep running:** YES
**Shell ID:** 826819
**PID:** 22652
**Started:** ~09:01 AM UTC+7 (~02:01 UTC)
**Session ID:** 1780366079460
**Will finish:** ~02:01 PM UTC+7 (~07:01 UTC)
**Output files:** `D:\claw\bug-sweep-1780366079460.json` and `.md`

**IMPORTANT FIX:** The sweeper crashed with OOM (out of memory) in earlier runs because the `findings` array accumulated entries across all passes (~245 bugs × ~60,000 passes). Fixed by replacing the array with a `findingsMap` keyed by `file:line:bugType` — now it stays stable at ~245 entries regardless of pass count.

**Sweeper health:** Stable. ~250ms per pass, ~240 passes per minute, ~14,400 passes per hour.

## What was done tonight

### Bug Fixes Applied (Confirmed Real Bugs)

| File | Line | Bug | Severity | Status |
|------|------|-----|----------|--------|
| `electron/lib/gateway.js` | 904 | `lastError` never set on spawn error — crash diagnostics always showed empty string | HIGH | ✅ FIXED |
| `electron/lib/config.js` | 1193 | `req.on('error')` called `resolve(null)` without cleaning up req | MEDIUM | ✅ FIXED |
| `electron/lib/config.js` | 547 | `existing.charCodeAt(0)` throws on empty string — BOM strip crashes on empty file | MEDIUM | ✅ FIXED |
| `electron/lib/cron-api.js` | 3542 | Server `listening` listener leaked across retry attempts — multiple handlers on same event | HIGH | ✅ FIXED |
| `electron/lib/channels.js` | 762 | `getWorkspace()` null → `path.join(null, ...)` crash in missed-alert disk log | CRITICAL | ✅ FIXED |
| `electron/lib/channels.js` | 1113 | `getWorkspace()` null → `path.join(null, ...)` crash in `resolveAllowedMediaRoots` | CRITICAL | ✅ FIXED |
| `electron/lib/cron-api.js` | 1575, 1688, 2665, 2687, 2689, 2753, 2770, 2772, 2804, 2853, 2855, 3105, 3151 | 12× silent `.catch(() => {})` on CEO/skill alerts — failures completely invisible | MEDIUM | ✅ FIXED (→ `console.warn`) |
| `electron/lib/nine-router.js` | 668 | `res.on('error')` missing — HTTP stream errors leave Promise hanging forever | MEDIUM | ✅ FIXED |
| `electron/scripts/check-zalo-account-settings.js` | 23 | `readJson()` helper with no try/catch | MEDIUM | ✅ FIXED |
| `electron/scripts/migrate-licenses-to-supabase.js` | 130, 135 | 2× empty `catch {}` silently swallowing Supabase parse errors | MEDIUM | ✅ FIXED (→ `console.warn`) |

### Auto-Fixes Applied by Sweeper (Pass 1)

The sweeper also auto-fixed these on the first pass:

| File | Line | Bug | Severity | Status |
|------|------|-----|----------|--------|
| `electron/lib/dashboard-ipc.js` | 1589 | Missing null guard for workspace path | HIGH | ✅ FIXED |
| `electron/lib/dashboard-ipc.js` | 1686 | Missing null guard for workspace path | HIGH | ✅ FIXED |
| `electron/lib/dashboard-ipc.js` | 4267 | Missing null guard for workspace path | HIGH | ✅ FIXED |
| `electron/lib/fb-schedule.js` | 44 | Missing null guard for workspace path | HIGH | ✅ FIXED |
| `electron/lib/runtime-installer.js` | 1698 | Missing null guard for workspace path | HIGH | ✅ FIXED |
| `electron/lib/zalo-memory.js` | 320, 321 | Missing null guard for workspace path | HIGH | ✅ FIXED |
| `electron/lib/zalo-menu.js` | 40 | Missing null guard for workspace path | HIGH | ✅ FIXED |

### Bugs Identified But Not Fixed (False Positives — Agent Reports Corrected)

| File | Agent Report | Reality |
|------|-------------|---------|
| `electron/lib/cron-api.js:2262` | execSync without try/catch | **Already has try/catch** (lines 2258–2263) |
| `electron/lib/nine-router.js:164` | JSON.parse without try/catch | **Already inside try block** (lines 159–175) |
| `electron/lib/nine-router.js:240` | JSON.parse without try/catch | **_tryCreate() called inside outer try/catch** |
| `electron/lib/cron.js:1716` | runCronViaSessionOrFallback missing await | **Has .catch() handler — fire-and-forget by design** |
| `electron/lib/cron.js:1881` | JSON.parse without try/catch | **Already inside try block** |
| `electron/lib/cron.js:2036` | trackChannelBootTimer unbounded growth | **Function doesn't exist in this file** |
| `electron/scripts/license-manager.js:654` | execSync without try/catch | **Already inside try/catch** (lines 652–655) |
| `migrate-licenses-to-supabase.js:99` | data.files assumption | **Already inside try/catch** (lines 96–106) |

### Files Scanned — All Clean

| File/Dir | Result |
|----------|--------|
| `electron/main.js` | Clean — all catches are appropriate |
| `electron/preload.js` | Clean — no catch blocks at all |
| `electron/lib/openclaw-json.js` | JSON.parse has no own try/catch, but callers handle it |
| `electron/lib/zalo-memory.js` | Clean — all timers properly cleared |
| `electron/lib/vendor-patches.js` | Clean — all operations wrapped |
| `electron/lib/workspace.js` | Clean — all operations wrapped |
| `electron/tests/` | Clean — all files properly structured |

## Overnight Sweep Script

**Location:** `electron/scripts/autonomous-bug-sweep.js`

### To run for 5 hours (dry-run, just reports):
```bash
cd D:/claw
node electron/scripts/autonomous-bug-sweep.js --minutes=300
```

### To run for 5 hours (LIVE — writes fixes):
```bash
cd D:/claw
node electron/scripts/autonomous-bug-sweep.js --minutes=300 --apply
```

### To test for 30 minutes first:
```bash
node electron/scripts/autonomous-bug-sweep.js --minutes=30 --apply
```

### Output files:
- `bug-sweep-<sessionId>.json` — Full machine-readable report
- `bug-sweep-<sessionId>.md` — Human-readable markdown report

### What the script scans for:
1. JSON.parse without try/catch
2. execSync without try/catch
3. Silent `.catch(() => {})` on CEO alerts (auto-fixes these)
4. Missing null guards for workspace paths (auto-fixes these)
5. Wrong equality (== instead of ===)
6. setTimeout with non-function argument
7. Unbounded array growth
8. Event emitter leaks
9. Double negation / logical inversion

## What the script CANNOT find (requires human analysis)

These types of bugs require deep code understanding and were found manually:

- **Race conditions** in async event handlers
- **Logical errors** (wrong branching, off-by-one in complex loops)
- **Security vulnerabilities** (SQL injection, path traversal)
- **Memory leaks** in closure captures over time
- **Protocol-level bugs** (wrong API field names, missing headers)
- **Business logic errors** (wrong threshold values, incorrect state transitions)
- **Integration bugs** (wrong order of operations, missing await)

## Remaining known issues to investigate

These were identified but need deeper analysis before fixing:

1. **`channels.js` — `_gwLogDiagCache` stale for 60 seconds**: The gateway diagnostic cache could serve stale data for up to 60 seconds after new errors appear. The cache should be invalidated when `listener-owner.json` or `credentials.json` changes.

2. **`cron.js` — `global._cronInFlight` used inconsistently**: The Map stores `true` (boolean) for morning/evening crons but `Date.now()` (number) for weekly-gateway-restart. Future code that reads values expecting timestamps will get wrong results.

3. **`cron.js` — recursive `safeWatch` race**: When a rename event fires, `onChange()` is called synchronously before the new `fs.watch` is re-registered. This creates a brief window where changes could be missed.

4. **`channels.js` — swallowed JSON.parse in sticky-chatid**: The `persistStickyChatId` and `loadStickyChatId` functions silently swallow JSON.parse errors. Corrupt sticky-chatid files go unnoticed.

5. **`channels.js` — silent fail-closed `readZaloMediaPolicy`**: If reading `openclaw.json` fails, the function silently returns default policy (maxMb: 25, no roots). Custom `mediaMaxMb` and `mediaLocalRoots` settings are ignored without any warning.

## Notes for tomorrow morning

- **Rebuild first** (`npm run build:win`) — your 8:22 AM exe is missing all manual fixes
- The sweeper is running in background (Shell ID: 826819, PID 22652) and will finish ~2:01 PM UTC+7
- Check `D:\claw\bug-sweep-1780366079460.md` for the human-readable report after it finishes
- The sweeper is conservative — it only auto-fixes silent catches and missing null guards
- All other findings go into the report for human review
- Most important findings are in the CRITICAL/HIGH severity buckets
