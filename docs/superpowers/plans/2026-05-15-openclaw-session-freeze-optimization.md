# OpenClaw Session Freeze Optimization Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce per-message response time from ~30s to ~5s for turn 2+ by freezing the system prompt per session and leveraging LLM prefix caching — the same architecture that makes Hermes Agent fast.

**Architecture:** Patch 3 layers of the openclaw vendor code to cache what's currently rebuilt on every agent run: (1) bootstrap file contents, (2) auth credential sync, (3) tool resolution. Patches are applied on every boot via `ensureOpenclawSessionFreezePatches()`, similar to existing vendor patches (inbound.ts, openzca.ts).

**Tech Stack:** Node.js, openclaw vendor dist files (minified JS), Electron main process

---

## Problem Statement

openclaw embedded agent runner rebuilds the system prompt from scratch on **every message**:

| Component | Per-run cost | What it does |
|-----------|-------------|--------------|
| Bootstrap file read | ~5-10s | Reads AGENTS.md (19KB) + BOOTSTRAP.md + SOUL.md + TOOLS.md + IDENTITY.md from disk |
| Auth-profiles sync | ~10-15s | Syncs OAuth credentials from external CLI tools (Codex, Qwen, etc.) |
| Tool resolution | ~3-5s | Loads all tools from plugins, applies 7-step policy pipeline |
| System prompt build | ~2-3s | Assembles full prompt from all above inputs |
| **Total overhead** | **~25-35s** | Before the model even sees the message |

Hermes Agent solves this by freezing the system prompt at session start. Subsequent turns reuse the frozen prompt → LLM prefix cache hits → 2-5s per turn.

## Current Architecture (what we're patching)

```
Message arrives
  → runEmbeddedPiAgent()                    [pi-embedded-runner-*.js:8191]
    → resolveBootstrapContextForRun()        [bootstrap-files-*.js:183]     ← reads ALL files from disk
    → loadAuthProfileStoreForAgent()         [store-*.js:898]               ← syncs external CLI creds
    → getAllOpenClawTools() + policy filter   [pi-embedded-runner:5525-5620] ← resolves all tools
    → buildEmbeddedSystemPrompt()            [pi-embedded-runner:5747-5796] ← full prompt rebuild
    → createSystemPromptOverride()           [pi-embedded-runner:5828]      ← creates closure
    → LLM API call                                                          ← 21K+ tokens, no cache hit
```

## Target Architecture (after patches)

```
Session start (first message from customer)
  → runEmbeddedPiAgent()
    → resolveBootstrapContextForRun()  → CACHE result in global Map (key: workspace path, invalidate on mtime change)
    → loadAuthProfileStoreForAgent()   → SKIP external CLI sync (use cached store, 1hr TTL)
    → tools resolution                 → CACHE result in global Map (invalidate on config change)
    → buildEmbeddedSystemPrompt()      → CACHE result (key: hash of all inputs)
    → LLM API call                     → 21K tokens, prompt cached by provider

Turn 2+ (same session)
  → runEmbeddedPiAgent()
    → resolveBootstrapContextForRun()  → CACHE HIT (mtime unchanged) → ~0ms
    → loadAuthProfileStoreForAgent()   → CACHE HIT (within 1hr TTL) → ~0ms
    → tools resolution                 → CACHE HIT (config unchanged) → ~0ms
    → buildEmbeddedSystemPrompt()      → CACHE HIT (same inputs) → ~0ms
    → LLM API call                     → prefix cache HIT → ~3-5s
```

## Vendor Files to Patch

All files are in `%APPDATA%/9bizclaw/vendor/node_modules/openclaw/dist/`:

| File | Hash suffix | What to patch |
|------|------------|---------------|
| `bootstrap-files-7QKOlnOX.js` | 7QKOlnOX | Add mtime-based in-memory cache for `resolveBootstrapFilesForRun()` |
| `store-DitZv6Qf.js` | DitZv6Qf | Extend auth cache TTL from 15min → 1hr, add `syncExternalCli: false` default |
| `pi-embedded-runner-C72h-nWV.js` | C72h-nWV | Add tool resolution cache, system prompt cache |

**Critical risk:** Vendor file names contain content hashes. If openclaw updates, file names change and patches fail silently. Mitigation: patch function uses content-based anchors (search for specific code patterns), not file names. Log loud warnings on patch failure.

## Patch Application Strategy

Same pattern as existing patches (`ensureZaloBlocklistFix`, `ensureOpenzaloForceOneMessageFix`, etc.):

1. `ensureOpenclawSessionFreezePatches()` called in `_startOpenClawImpl()` after `ensureDefaultConfig()`
2. Reads each vendor file, checks for marker comment `// MODOROCLAW SESSION-FREEZE PATCH`
3. If not present, applies patch via string replacement (anchor-based, not line-number-based)
4. Writes patched file back
5. Logs success/failure

---

## Chunk 1: Bootstrap File Cache

### Task 1: Design the cache data structure

**Files:**
- Modify: `electron/lib/vendor-patches.js` (or create if doesn't exist)

The cache stores bootstrap file contents keyed by workspace path, invalidated when any file's mtime changes.

```javascript
// Global cache — survives across agent runs within same process
// Key: workspace path
// Value: { files: [...], mtimes: { 'AGENTS.md': 1234567890, ... }, cachedAt: Date.now() }
const _bootstrapCache = new Map();

function getCachedBootstrapFiles(workspaceDir) {
  const cached = _bootstrapCache.get(workspaceDir);
  if (!cached) return null;
  
  // Check if any file mtime changed
  const fs = require('fs');
  const path = require('path');
  for (const [filename, cachedMtime] of Object.entries(cached.mtimes)) {
    try {
      const stat = fs.statSync(path.join(workspaceDir, filename));
      if (stat.mtimeMs !== cachedMtime) return null; // invalidate
    } catch { return null; }
  }
  return cached.files;
}

function setCachedBootstrapFiles(workspaceDir, files, mtimes) {
  _bootstrapCache.set(workspaceDir, { files, mtimes, cachedAt: Date.now() });
}
```

- [ ] **Step 1:** Create `electron/lib/openclaw-perf-patches.js` with the cache data structure above
- [ ] **Step 2:** Verify file loads: `node -e "require('./electron/lib/openclaw-perf-patches.js')"`

### Task 2: Patch `bootstrap-files-*.js` to use cache

**Files:**
- Modify: `electron/lib/openclaw-perf-patches.js`

The patch wraps `resolveBootstrapFilesForRun()` (line 183 in `bootstrap-files-7QKOlnOX.js`) with a caching layer.

**Anchor pattern to find:**
```javascript
async function resolveBootstrapContextForRun(params) {
```

**Patch strategy:** Insert cache check BEFORE the original function body. If cache hit, return cached result. If miss, let original run, then cache the result.

```javascript
// Injected code (prepended inside function body):
const __mcCached = global.__mcBootstrapCache?.get(params.workspaceDir);
if (__mcCached) {
  const fs = require('fs');
  let __mcValid = true;
  for (const [f, mt] of Object.entries(__mcCached.mtimes)) {
    try { if (fs.statSync(f).mtimeMs !== mt) { __mcValid = false; break; } } catch { __mcValid = false; break; }
  }
  if (__mcValid) return __mcCached.result;
}
```

And AFTER the original return, cache the result:
```javascript
// Injected code (wrapping return):
const __mcResult = /* original return value */;
if (!global.__mcBootstrapCache) global.__mcBootstrapCache = new Map();
// ... store result with mtimes
return __mcResult;
```

- [ ] **Step 3:** Write the patch function `patchBootstrapFileCache()` in `openclaw-perf-patches.js`
- [ ] **Step 4:** Find the exact anchor strings by reading the actual vendor file
- [ ] **Step 5:** Test patch application on a copy of the vendor file
- [ ] **Step 6:** Verify patched file still loads: `node -e "require(patched_file)"`

### Task 3: Wire patch into boot sequence

**Files:**
- Modify: `electron/lib/gateway.js` (~line 290, inside `_startOpenClawImpl`)

- [ ] **Step 7:** Import and call `patchBootstrapFileCache()` in `_startOpenClawImpl` after `ensureDefaultConfig()`
- [ ] **Step 8:** Test: restart app, check console for `[session-freeze] bootstrap cache patch applied`
- [ ] **Step 9:** Measure: send 2 messages, check if second message skips bootstrap file reads (add timing log)
- [ ] **Step 10:** Commit

---

## Chunk 2: Auth Profile Cache Extension

### Task 4: Patch `store-*.js` to skip external CLI sync

**Files:**
- Modify: `electron/lib/openclaw-perf-patches.js`

The auth-profiles sync reads OAuth credentials from external CLI tools on every run. This is the single biggest time sink (~10-15s).

**Two-part fix:**
1. Extend cache TTL from 900,000ms (15min) → 3,600,000ms (1hr)
2. Skip `syncExternalCliCredentials()` after first successful sync per boot

**Anchor pattern in `store-*.js`:**
```javascript
if (Date.now() - cached.syncedAtMs >= 9e5) return null;
```
Replace `9e5` with `36e5` (1 hour).

**Anchor pattern for sync skip:**
```javascript
if (shouldSyncExternalCliCredentials(options)) syncExternalCliCredentialsTimed(
```
Wrap with: `if (!global.__mcAuthSyncedOnce) { ... global.__mcAuthSyncedOnce = true; }`

- [ ] **Step 11:** Write `patchAuthProfileCache()` in `openclaw-perf-patches.js`
- [ ] **Step 12:** Find exact anchor strings in vendor file
- [ ] **Step 13:** Test patch on vendor file copy
- [ ] **Step 14:** Wire into boot sequence
- [ ] **Step 15:** Measure: check `[agents/auth-profiles] synced` appears only ONCE per boot, not per message
- [ ] **Step 16:** Commit

---

## Chunk 3: Tool Resolution Cache

### Task 5: Cache tool resolution results

**Files:**
- Modify: `electron/lib/openclaw-perf-patches.js`

Tool resolution (loading all plugins + applying 7-step policy pipeline) runs per message. The tool set rarely changes — only when config is modified.

**Strategy:** Cache the resolved tool list in a global Map. Invalidate when `openclaw.json` mtime changes.

**Anchor in `pi-embedded-runner-*.js` (~line 5525):**
```javascript
// Tool assembly section — look for getAllOpenClawTools or equivalent
```

This is the most complex patch because tool resolution is deeply integrated. **Simpler approach:** cache at the `applyToolPolicyPipeline` level — cache the input/output of the 7-step pipeline.

- [ ] **Step 17:** Identify exact tool resolution code path in vendor file
- [ ] **Step 18:** Write `patchToolResolutionCache()` — cache policy pipeline results
- [ ] **Step 19:** Test: second message should skip tool resolution (add timing log)
- [ ] **Step 20:** Commit

---

## Chunk 4: System Prompt Freeze

### Task 6: Cache the assembled system prompt per session

**Files:**
- Modify: `electron/lib/openclaw-perf-patches.js`

If bootstrap cache hits + auth cache hits + tool cache hits → system prompt inputs are identical → system prompt output is identical → cache the entire assembled prompt.

**Strategy:** After `buildEmbeddedSystemPrompt()` returns, hash the result and cache it. On next run, if all input caches hit, skip the entire prompt assembly.

**Anchor in `pi-embedded-runner-*.js` (~line 5828):**
```javascript
let systemPromptText = createSystemPromptOverride(appendPrompt)();
```

Wrap with:
```javascript
// Check if prompt is same as last time (global cache)
const __mcPromptHash = require('crypto').createHash('md5').update(appendPrompt).digest('hex');
if (global.__mcLastPromptHash === __mcPromptHash && global.__mcLastPromptText) {
  systemPromptText = global.__mcLastPromptText;
} else {
  systemPromptText = createSystemPromptOverride(appendPrompt)();
  global.__mcLastPromptHash = __mcPromptHash;
  global.__mcLastPromptText = systemPromptText;
}
```

This ensures the LLM provider sees the EXACT same system prompt on consecutive turns → prefix cache hit.

- [ ] **Step 21:** Write `patchSystemPromptFreeze()` in `openclaw-perf-patches.js`
- [ ] **Step 22:** Test: send 3 messages, verify prompt hash is same across messages
- [ ] **Step 23:** Verify LLM provider cache hit (check `usage.cache_read_input_tokens` in response if available)
- [ ] **Step 24:** Commit

---

## Chunk 5: Integration + Measurement

### Task 7: Combine all patches and measure end-to-end

**Files:**
- Modify: `electron/lib/openclaw-perf-patches.js` (main export)
- Modify: `electron/lib/gateway.js` (call site)

- [ ] **Step 25:** Create `ensureOpenclawSessionFreezePatches()` that calls all 4 patch functions
- [ ] **Step 26:** Add `OPENCLAW_TRACE_BOOT=1` to gateway env for timing diagnostics
- [ ] **Step 27:** Full boot + 3 message test:
  - Message 1 (cold): expect ~30s (all caches miss)
  - Message 2 (warm): expect ~5-8s (all caches hit + prefix cache)
  - Message 3 (warm): expect ~3-5s (fully cached)
- [ ] **Step 28:** Compare with baseline (before patches)
- [ ] **Step 29:** Update smoke test to verify patches are applied
- [ ] **Step 30:** Commit

### Task 8: Resilience + rollback

**Files:**
- Modify: `electron/lib/openclaw-perf-patches.js`

- [ ] **Step 31:** Add `MODOROCLAW_DISABLE_SESSION_FREEZE=1` env var to skip all patches (emergency escape hatch)
- [ ] **Step 32:** Add patch version markers so patches auto-reapply on openclaw update
- [ ] **Step 33:** Add loud console warnings when patch anchors not found (vendor file changed)
- [ ] **Step 34:** Test: set `MODOROCLAW_DISABLE_SESSION_FREEZE=1`, verify patches not applied, response time is back to ~30s
- [ ] **Step 35:** Commit

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| openclaw update changes vendor file names/content | HIGH (every update) | Patches fail silently | Content-based anchors + loud warnings + auto-reapply |
| Stale bootstrap cache serves outdated AGENTS.md | LOW (mtime check catches edits) | Bot uses old instructions | mtime-based invalidation, max 60s staleness |
| Stale auth cache causes 401 | LOW (1hr TTL, first sync always runs) | First message fails | First-sync always runs, TTL just extends cache |
| Stale tool cache misses new tool | LOW (config change invalidates) | Tool unavailable until restart | Config mtime invalidation |
| System prompt hash collision | NEGLIGIBLE (MD5 on 40KB+ text) | Wrong prompt cached | SHA-256 if paranoid |
| Cached prompt breaks provider-specific transforms | MEDIUM | Wrong prompt format | Cache AFTER provider transform, not before |

## Expected Results

| Metric | Before | After (turn 2+) | Improvement |
|--------|--------|-----------------|-------------|
| Bootstrap file read | ~5-10s | ~0ms (mtime check only) | **100%** |
| Auth-profiles sync | ~10-15s | ~0ms (cache hit) | **100%** |
| Tool resolution | ~3-5s | ~0ms (cache hit) | **100%** |
| System prompt build | ~2-3s | ~0ms (hash match) | **100%** |
| LLM inference (21K tokens) | ~5-15s | ~3-5s (prefix cache) | **50-70%** |
| **Total per-message** | **~30s** | **~3-5s** | **~85-90%** |

## Dependencies

- Requires understanding of openclaw vendor dist file structure (minified, hash-suffixed)
- Patches must be tested against current vendor version (`openclaw@2026.4.14`)
- If CEO changes AGENTS.md or config mid-session, cache invalidates and next message is slow (expected, correct behavior)
- LLM prefix caching depends on provider support (OpenAI ✓, Anthropic ✓, Gemini ✓, Ollama ✗)

## Out of Scope

- Parallel gateway (separate architectural project)
- openclaw upstream contribution (we're patching locally)
- Hermes Agent migration (different framework entirely)
- Reducing AGENTS.md size (complementary but independent optimization)
