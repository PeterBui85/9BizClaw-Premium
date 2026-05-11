# Startup Performance Optimization — Design Spec

**Goal:** Cut perceived lag across cold boot, wizard completion, and in-app startup by targeting the 5 worst offenders. No architectural restructuring — surgical fixes only.

**Approach:** Parallelize + defer the 5 operations that account for ~80% of startup lag.

---

## Fix 1: Defer `initEmbedder()` to after window visible

**File:** `electron/main.js:825`

**Current:** `initEmbedder()` runs synchronously before `createWindow()` (line 847). Loads multilingual-e5-small model. 100-500ms cost. Nothing between 825-847 depends on embedder being ready.

**Change:** Move to `setTimeout(() => { try { initEmbedder(); } catch (e) { ... } }, 0)` after `createWindow()`. Knowledge search lazy-inits via `_ensureEmbedderInit()` in knowledge.js anyway.

**Saves:** 100-500ms on cold boot to window.

**Risk:** None. Embedder is lazy-initialized on first knowledge search call regardless.

---

## Fix 2: Fire-and-forget memory DB rebuild

**File:** `electron/lib/gateway.js:318-324`

**Current:** `await execFilePromise(nodeBin, [rebuildScript], { timeout: 10000 })` blocks for 1-3s. Lines 333+ (orphan kill) don't depend on rebuild output. Rebuild result is logged but never consumed.

**Change:** Remove `await`. Assign to a variable for error logging but don't block:
```js
execFilePromise(nodeBin, [rebuildScript], { timeout: 10000 })
  .catch(e => console.error('Memory DB rebuild failed:', e.message));
```

**Saves:** 1-3s on every boot.

**Risk:** Low. Rebuild is a cache warm-up. If it completes after gateway starts, the gateway still functions — memory DB is read lazily.

---

## Fix 3: Defer `bootDiagRunFullCheck()` to background

**File:** `electron/main.js:830`

**Current:** Runs synchronously before `createWindow()`. Spawns `where node`, does 20+ `fs.existsSync` checks, reads config files. 100-300ms. Return value is never consumed.

**Change:** Move to `setTimeout(() => { try { bootDiagRunFullCheck(); } catch (e) { ... } }, 2000)` after `createWindow()`. Diagnostic log still written, just 2s later.

**Saves:** 100-300ms on cold boot to window.

**Risk:** None. Diagnostic is write-only, never read during boot.

---

## Fix 4: Non-blocking wizard-complete credential poll

**File:** `electron/lib/dashboard-ipc.js:4010-4019`

**Current:** After `seedWorkspace()`, polls `credentials.json` up to 6x500ms = 3s before navigating to dashboard. Blocks UI transition.

**Change:** Move the credential poll, `cleanupOrphanZaloListener()`, and RAG config prefill into the existing fire-and-forget IIFE (line 4045). Navigate to dashboard immediately after `seedWorkspace()` + `markOnboardingComplete()`.

New handler flow:
1. `seedWorkspace()` (sync, 200-500ms — unavoidable, creates dirs)
2. `markOnboardingComplete()` (sync, <5ms)
3. `clearTimeout(navGuard)` + load dashboard.html + maximize
4. Return immediately
5. Fire-and-forget IIFE: credential poll → `cleanupOrphanZaloListener` → RAG prefill → `ensureZaloPlugin` → `startOpenClaw` → etc.

**Saves:** Up to 3s on wizard completion.

**Risk:** Low. Zalo login state is picked up by channel status broadcast within seconds. RAG config prefill runs before `startOpenClaw` in the IIFE so it's ready when gateway starts.

---

## Fix 5: Adaptive orphan gateway kill loop

**File:** `electron/lib/gateway.js:347`

**Current:** 30 iterations x 500ms = 15s max. Fixed delay regardless of whether port frees fast or slow.

**Change:** Three-phase adaptive delay:
- Phase 1: 10 iterations x 200ms = 2s (fast check — covers 80% of cases)
- Phase 2: 10 iterations x 500ms = 5s (medium)
- Phase 3: 10 iterations x 1000ms = 10s (slow, Defender-heavy machines)

Total: 30 iterations, 17s max, but median case (port frees in 1-3s) resolves in 2s instead of 3s.

**Saves:** ~1-2s median on boots with an orphan gateway.

**Risk:** None. Same number of total checks, same logic, just faster initial probing.

---

## Expected cumulative gains

| Phase | Before | After | Saved |
|-------|--------|-------|-------|
| Cold boot to window | 3-10s | 1.5-8s | 200-800ms |
| Memory rebuild block | 1-3s | 0s (parallel) | 1-3s |
| Wizard to dashboard | 3-6s | 0.2-0.5s | 2.5-5.5s |
| Orphan kill (when present) | 2-15s | 1-17s | ~1-2s median |
| **Total perceived** | **~5-15s typical** | **~2-10s typical** | **~3-8s** |

## Files modified

- `electron/main.js` — lines 825, 830 (defer initEmbedder + bootDiag)
- `electron/lib/gateway.js` — lines 318-324 (fire-and-forget rebuild), 347 (adaptive loop)
- `electron/lib/dashboard-ipc.js` — lines 4005-4039 (reorder wizard-complete)

## Testing

- Cold boot: window visible time should decrease measurably. Console `[boot] T+Nms` timeline still logs all events.
- Wizard: after clicking final step, dashboard loads immediately. Sidebar dots update as channels come up (existing broadcast mechanism).
- Orphan kill: restart Electron while gateway running → console shows fast phase1 resolution.
