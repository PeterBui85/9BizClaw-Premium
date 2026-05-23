# Latency Optimization: Debounce Default + Zalo Combo Reliability

**Date:** 2026-05-23
**Status:** Approved
**Scope:** 2 changes — debounce default + combo creation timing

## Problem

Bot reply latency perceived as too slow. Root cause analysis found 3 stacked delays:

| Layer | Current value | Contribution |
|-------|--------------|--------------|
| Inbound debounce | **3000ms** | Largest — every message waits 3s before processing |
| AI processing | 2-10s | Model dependent, not controllable here |
| DELIVER-COALESCE | 400ms | Working correctly, no change needed |

Debounce was raised from OpenClaw default (700ms) to 3000ms for "CEO experience" but this penalizes all customers.

## Solution

Change inbound debounce default from `3000` to `0` in `ensureDefaultConfig()`.

### File: `electron/lib/config.js` line 828

**Before:**
```js
config.messages.inbound.debounceMs = 3000;
```

**After:**
```js
config.messages.inbound.debounceMs = 0;
```

Update comment on line 821-824 to reflect new default.

### Behavior

- **Fresh install:** Bot replies immediately upon receiving message (0ms wait)
- **Existing installs:** No change — field already exists, `=== undefined` guard skips
- **Customer override:** Dashboard dropdown (Telegram + Zalo) already supports 0/1000/2000/3000/4000/5000ms

### Trade-off

Customer sends 3 messages in 2 seconds → bot replies 3 times separately instead of batching into 1 turn. Acceptable because:
1. Natural conversational behavior
2. Customer can increase debounce via Dashboard if they prefer batching
3. Instant reply is better UX default for customer service bots

## Coalesce (DELIVER-COALESCE)

**No change.** Currently 400ms, working correctly. Customers receive 1 merged message per AI response. Verified functional.

## Fix 2: 9Router Zalo Combo Not Created on Fresh Install

### Problem

`ensure9RouterZaloCombo()` (nine-router.js:179) runs at line 319 in `start9Router()` — **before** 9Router process is spawned. On fresh install, 9Router hasn't created `db.json` yet → line 182 `if (!fs.existsSync(dbPath)) return` exits silently → Zalo combo never created.

Inconsistent behavior: works on restart (db.json exists from previous run), fails on fresh install.

### File: `electron/lib/nine-router.js` line 179-198

**Fix:** Move `ensure9RouterZaloCombo()` call to **after** `waitFor9RouterReady()` succeeds (9Router is up, db.json guaranteed to exist). Add retry: if db.json still missing, wait 2s and retry once.

**Before (in start9Router, line 319):**
```
ensure9RouterZaloCombo();      // ← runs BEFORE spawn, db.json may not exist
// ... spawn 9Router ...
// ... waitFor9RouterReady() ...
```

**After (in gateway.js boot sequence, after waitFor9RouterReady):**
```
// ... spawn 9Router ...
// ... waitFor9RouterReady() returns true ...
ensure9RouterZaloCombo();      // ← runs AFTER 9Router is up, db.json exists
```

Also in `ensure9RouterZaloCombo()` itself:
- Remove early `return` on missing db.json → instead wait 2s + retry once
- Log clearly: `[9router] zalo combo: db.json not found, retrying in 2s...`
- On final failure: log warning visible in Dashboard

### Behavior

- **Fresh install:** 9Router starts → db.json created → combo injected → Zalo uses fast model from first message
- **Existing installs:** Combo already exists → idempotent skip (no change)
- **Update:** Same as existing — db.json persists across updates

## Out of Scope

- Model routing optimization (future work)
- Typing indicator
- Boot latency (already <30s target)
