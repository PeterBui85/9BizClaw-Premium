# Latency Optimization: Debounce + Zalo Combo Reliability — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce bot reply latency by eliminating 3s debounce default, and fix Zalo combo not being created on fresh install.

**Architecture:** Two independent changes — (1) constant change in config.js, (2) move combo creation call timing in gateway.js + add retry in nine-router.js.

**Tech Stack:** Electron main process, Node.js

---

## Task 1: Change debounce default from 3000ms to 0ms

**Files:**
- Modify: `electron/lib/config.js:821-829`

- [ ] **Step 1: Update comment and default value**

In `electron/lib/config.js`, replace lines 821-829:

```js
    // Inbound message batching: wait 3s for rapid messages from same sender,
    // then process all together as 1 turn. Prevents bot replying 3 times when
    // customer sends "anh ơi" + "giá bao nhiêu" + "có ship không" in 3 seconds.
    // OpenClaw default is 700ms. CEO experience is better at 3000ms.
    if (!config.messages) config.messages = {};
    if (!config.messages.inbound) config.messages.inbound = {};
    if (config.messages.inbound.debounceMs === undefined) {
      config.messages.inbound.debounceMs = 3000;
      changed = true;
    }
```

With:

```js
    // Inbound message batching: configurable via Dashboard dropdown (0-5000ms).
    // Default 0 = reply immediately. Customer can raise if they prefer batching.
    if (!config.messages) config.messages = {};
    if (!config.messages.inbound) config.messages.inbound = {};
    if (config.messages.inbound.debounceMs === undefined) {
      config.messages.inbound.debounceMs = 0;
      changed = true;
    }
```

- [ ] **Step 2: Verify change**

Run: `node -e "const c = require('fs').readFileSync('electron/lib/config.js','utf8'); const m = c.match(/debounceMs = (\d+)/); console.log('default:', m[1])"`

Expected: `default: 0`

- [ ] **Step 3: Run smoke test**

Run: `cd electron && node scripts/smoke-test.js`

Expected: all checks pass

---

## Task 2: Fix Zalo combo not created on fresh install

**Files:**
- Modify: `electron/lib/gateway.js:22` (add import)
- Modify: `electron/lib/gateway.js:471` (add call after 9Router ready)
- Modify: `electron/lib/nine-router.js:179-198` (add async retry logic)
- Modify: `electron/lib/nine-router.js:319` (remove pre-spawn call)

- [ ] **Step 1: Make `ensure9RouterZaloCombo` async with retry**

In `electron/lib/nine-router.js`, replace lines 176-198:

```js
// Create a "zalo" combo in 9Router's db.json if it doesn't exist yet.
// The zalo combo uses cx/gpt-5.2 (lighter, faster model for customer service).
// Idempotent: skips silently if a combo named "zalo" already exists.
function ensure9RouterZaloCombo() {
  try {
    const dbPath = get9RouterDbPath();
    if (!fs.existsSync(dbPath)) return;
    const raw = fs.readFileSync(dbPath, 'utf-8');
    const db = JSON.parse(raw);
    if (!Array.isArray(db.combos)) db.combos = [];
    if (db.combos.some(c => c && c.name === 'zalo')) return;
    const now = new Date().toISOString();
    db.combos.push({
      id: crypto.randomUUID(),
      name: 'zalo',
      models: ['cx/gpt-5.2'],
      createdAt: now,
      updatedAt: now,
    });
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
    console.log('[9router] created zalo combo (gpt-5.2)');
  } catch (e) { console.error('[9router] ensure zalo combo error:', e.message); }
}
```

With:

```js
// Create a "zalo" combo in 9Router's db.json if it doesn't exist yet.
// The zalo combo uses cx/gpt-5.2 (lighter, faster model for customer service).
// Idempotent: skips silently if a combo named "zalo" already exists.
// Async: retries once after 2s if db.json not yet created by 9Router.
async function ensure9RouterZaloCombo() {
  const _tryCreate = () => {
    const dbPath = get9RouterDbPath();
    if (!fs.existsSync(dbPath)) return 'missing';
    const raw = fs.readFileSync(dbPath, 'utf-8');
    const db = JSON.parse(raw);
    if (!Array.isArray(db.combos)) db.combos = [];
    if (db.combos.some(c => c && c.name === 'zalo')) return 'exists';
    const now = new Date().toISOString();
    db.combos.push({
      id: crypto.randomUUID(),
      name: 'zalo',
      models: ['cx/gpt-5.2'],
      createdAt: now,
      updatedAt: now,
    });
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
    console.log('[9router] created zalo combo (gpt-5.2)');
    return 'created';
  };
  try {
    const r = _tryCreate();
    if (r !== 'missing') return;
    console.log('[9router] zalo combo: db.json not found, retrying in 2s...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    const r2 = _tryCreate();
    if (r2 === 'missing') console.warn('[9router] zalo combo: db.json still missing after retry — combo not created');
  } catch (e) { console.error('[9router] ensure zalo combo error:', e.message); }
}
```

- [ ] **Step 2: Remove pre-spawn call from `start9Router()`**

In `electron/lib/nine-router.js` line 319, delete:

```js
    ensure9RouterZaloCombo();
```

The line between `ensure9RouterApiKeySync();` and `const rtkDbResult = ...` should now be empty (or just whitespace).

- [ ] **Step 3: Add import in gateway.js**

In `electron/lib/gateway.js` line 22, change:

```js
const { start9Router, stop9Router, getRouterProcess, ensure9RouterApiKeySync } = require('./nine-router');
```

To:

```js
const { start9Router, stop9Router, getRouterProcess, ensure9RouterApiKeySync, ensure9RouterZaloCombo } = require('./nine-router');
```

- [ ] **Step 4: Call `ensure9RouterZaloCombo()` after 9Router ready**

In `electron/lib/gateway.js` line 471, after the existing `ensure9RouterApiKeySync()` call:

```js
      try { ensure9RouterApiKeySync(); } catch (e) { console.warn('[boot] post-ready apiKeySync error:', e?.message); }
```

Add a new line right after it (before `break;`):

```js
      try { await ensure9RouterZaloCombo(); } catch (e) { console.warn('[boot] post-ready zaloCombo error:', e?.message); }
```

- [ ] **Step 5: Run smoke test**

Run: `cd electron && node scripts/smoke-test.js`

Expected: all checks pass

---

## Task 3: Verify both changes together

- [ ] **Step 1: Run full smoke test**

Run: `cd electron && node scripts/smoke-test.js`

Expected: all checks pass, no regressions

- [ ] **Step 2: Commit**

```bash
git add electron/lib/config.js electron/lib/nine-router.js electron/lib/gateway.js
git commit -m "feat: debounce default 0ms + fix zalo combo creation on fresh install"
```
