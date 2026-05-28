# 9BizClaw Freemium Model Implementation Plan (v2)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all-or-nothing premium gate into freemium funnel — single EXE, Free tier (Telegram+Zalo+AI+Cron+Knowledge forever), Premium tier (+ FB, Google, Brain, Appointments) with server-issued encrypted module decryption.

**Architecture:** 1 EXE ships both tiers. Premium modules (7 JS files) are AES-256-GCM encrypted at build time, replaced by 1-line proxy stubs that delegate to `global.__premium`. On boot, app checks tier: free users get stubs via proxy, premium users get decrypt key from Supabase Edge Function and modules are compiled into memory. Dashboard sidebar shows free features + locked premium + Coming Soon categories.

**Tech Stack:** Electron 28, Node crypto (AES-256-GCM, 12-byte IV), Supabase Edge Functions (Deno), javascript-obfuscator, existing Ed25519 license system + sbFetch.

**Spec:** `docs/superpowers/specs/2026-05-20-freemium-model-design.md`

**Branch:** `freemium` (create from `main`)

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `electron/lib/premium-loader.js` | Decrypt .enc → `module._compile` into memory; generate proxy stubs; provide `getPremiumStub()` |
| `electron/lib/premium-session.js` | Validate session via existing `sbFetch`, cache with machine-bound HMAC, offline grace (72h) |
| `electron/scripts/encrypt-premium.js` | Build-time: obfuscate → AES-256-GCM encrypt → write .enc + overwrite .js with proxy stubs |
| `electron/ui/tier-choice.html` | First-launch choice screen: Free vs Premium |
| `supabase/functions/validate-session/index.ts` | Edge Function: verify license (by key hash), return per-build decrypt key |

### Modified files
| File | What changes |
|------|-------------|
| `electron/main.js:329-340` | Replace `isMembershipBuild` gate with tier detection + premium module loading |
| `electron/main.js:864-902` | Revalidation: session TTL check, graceful downgrade |
| `electron/lib/license.js` | Export `readLicense`, `sbFetch`, `keyHash`, `_getAppDataDir` for reuse |
| `electron/ui/dashboard.html:2586-2636` | Sidebar: locked Premium section + Coming Soon collapsible categories + upgrade button |
| `electron/ui/dashboard.html` (JS) | `initTierUI()`, locked click → modal overlay, analytics |
| `electron/ui/license.html` | Add `?mode=upgrade` support + "Dung ban Free" fallback link |
| `electron/preload.js:271-273` | Add IPC bridges: `getTier`, `chooseFree`, `trackLockedClick`, `onTierChanged` |
| `electron/package.json:4` | Remove `"membership": true`, add `encrypt-premium` script |
| `electron/lib/updates.js:42` | Free users: use Supabase public version endpoint; Premium: use session-provided GitHub token |
| `electron/scripts/build-win.js:51` | Add encrypt-premium step after obfuscate, add cleanup in finally |

### Premium modules (7 files → encrypted .enc + proxy stubs)
| Module group | Files | Top-level require sites |
|-------------|-------|------------------------|
| facebook | `fb-schedule.js`, `fb-publisher.js` | main.js:195, cron.js:16, cron-api.js:11 |
| google | `google-api.js`, `google-routes.js` | google-routes.js:3 (internal) |
| brain | `brain-graph.js`, `brain-layout-worker.js` | None (lazy + fork) |
| appointments | `appointments.js` | main.js:144, dashboard-ipc.js:70 |

### Proxy stub architecture (solves the 30+ require crash)

Every premium `.js` file gets REPLACED at build time with a 1-line proxy:

```js
// electron/lib/fb-schedule.js (PROXY STUB — real code is in fb-schedule.enc)
module.exports = global.__premium?.facebook || require('./premium-loader').getPremiumStub('facebook');
```

**Why this works:**
- All 30+ existing `require('./fb-schedule')` calls load the proxy → reads `global.__premium.facebook` → returns real decrypted module (premium) or stub (free)
- Zero refactoring of main.js, dashboard-ipc.js, cron.js, cron-api.js
- `global.__premium` is set BEFORE any module loading in the boot flow (early in `app.whenReady`)

**Special case: `brain-layout-worker.js`** — forked via `child_process.fork()`, not `require()`. Cannot be encrypted because `fork()` needs a .js file on disk. Solution: keep `brain-layout-worker.js` as-is (not encrypted). It contains only layout math (graphology force-atlas2), no business logic worth protecting. `brain-graph.js` (the coordinator) IS encrypted — without it, the worker is useless.

**Special case: `google-routes.js` line 3** — `const googleApi = require('./google-api')`. This is a top-level require of one premium module by another. The proxy stub handles this: when `google-routes.js` (proxy) loads, it reads `global.__premium.google`. When `google-api.js` (proxy) loads, it also reads `global.__premium.google`. Both resolve to the same decrypted module OR both return stubs.

---

## Chunk 1: Premium Loader + Proxy Stubs

### Task 1: Create `premium-loader.js`

**Files:**
- Create: `electron/lib/premium-loader.js`

- [ ] **Step 1: Write premium-loader.js**

```js
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Module = require('module');

// Map feature group → files to decrypt (excluding brain-layout-worker which is forked, not required)
const PREMIUM_MODULES = {
  facebook: ['fb-schedule.js', 'fb-publisher.js'],
  google: ['google-api.js', 'google-routes.js'],
  brain: ['brain-graph.js'],
  appointments: ['appointments.js'],
};

const _loaded = {};

function _decryptBuffer(encBuf, keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  // AES-256-GCM standard: 12-byte IV
  const iv = encBuf.subarray(0, 12);
  const authTag = encBuf.subarray(12, 28);
  const ciphertext = encBuf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function loadPremiumModule(featureName, decryptKey) {
  if (_loaded[featureName]) return _loaded[featureName];
  const files = PREMIUM_MODULES[featureName];
  if (!files) throw new Error('Unknown premium module: ' + featureName);

  const combined = {};
  for (const file of files) {
    const encPath = path.join(__dirname, file.replace(/\.js$/, '.enc'));
    if (!fs.existsSync(encPath)) {
      console.warn('[premium-loader] ' + encPath + ' not found, returning stub');
      return getPremiumStub(featureName);
    }
    try {
      const encBuf = fs.readFileSync(encPath);
      const source = _decryptBuffer(encBuf, decryptKey).toString('utf-8');
      const mod = new Module(file, module);
      mod.filename = path.join(__dirname, file);
      mod.paths = Module._nodeModulePaths(path.dirname(mod.filename));
      mod._compile(source, mod.filename);
      Object.assign(combined, mod.exports);
    } catch (e) {
      console.error('[premium-loader] failed to load ' + file + ':', e.message);
      return getPremiumStub(featureName);
    }
  }
  _loaded[featureName] = combined;
  return combined;
}

function getPremiumStub(featureName) {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'available') return false;
      if (prop === 'reason') return 'premium_required';
      if (prop === 'feature') return featureName;
      // Return no-op function for any method call — prevents crashes when
      // free-tier code calls a premium function (e.g. startAppointmentDispatcher)
      return function premiumStubMethod() {
        console.log('[premium] ' + featureName + '.' + String(prop) + '() — premium required');
        return undefined;
      };
    },
  });
}

function loadAllPremium(decryptKey) {
  const result = {};
  for (const name of Object.keys(PREMIUM_MODULES)) {
    result[name] = loadPremiumModule(name, decryptKey);
  }
  return result;
}

function loadAllStubs() {
  const result = {};
  for (const name of Object.keys(PREMIUM_MODULES)) {
    result[name] = getPremiumStub(name);
  }
  return result;
}

module.exports = { PREMIUM_MODULES, loadPremiumModule, getPremiumStub, loadAllPremium, loadAllStubs };
```

Key design decisions:
- **Proxy-based stubs**: `getPremiumStub` returns a JS Proxy that returns no-op functions for any property access. This means `startAppointmentDispatcher()` in free mode silently no-ops instead of crashing on `undefined is not a function`.
- **12-byte IV**: NIST standard for AES-256-GCM (not 16).
- **Per-file try/catch**: one bad `.enc` file only stubs that feature group, not all premium.
- **`brain-layout-worker.js` excluded**: forked, not required.

- [ ] **Step 2: Verify module loads**

Run: `node -e "const pl = require('./electron/lib/premium-loader'); const s = pl.loadAllStubs(); console.log(s.facebook.available, s.facebook.startSomething())"`
Expected: `false undefined` (Proxy returns false for `available`, no-op function for anything else)

- [ ] **Step 3: Commit**

```bash
git add electron/lib/premium-loader.js
git commit -m "feat(freemium): premium-loader — decrypt .enc modules, Proxy-based stubs for free tier"
```

### Task 2: Create `premium-session.js` — reuse existing sbFetch

**Files:**
- Create: `electron/lib/premium-session.js`
- Modify: `electron/lib/license.js` (export `readLicense`, `sbFetch`, `keyHash`, `_getAppDataDir`)

- [ ] **Step 1: Export helpers from license.js**

In `electron/lib/license.js`, add to `module.exports` (line 510-513):

```js
module.exports = {
  getMachineId, checkLicenseStatus, activateLicense,
  revalidateLicense, clearLicense, maskKey, verifyLicenseKey,
  // Added for premium-session:
  readLicense, keyHash, sbFetch: sbFetch, getAppDataDir: _getAppDataDir,
};
```

- [ ] **Step 2: Write premium-session.js**

```js
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const license = require('./license');

const REFRESH_TTL_MS = 4 * 60 * 60 * 1000;   // 4h — server call refresh interval
const OFFLINE_GRACE_MS = 72 * 60 * 60 * 1000; // 72h — keep premium if offline

function _cachePath() {
  return path.join(license.getAppDataDir(), '9bizclaw', 'premium-session.enc');
}

function _sealKey(machineId) {
  return crypto.createHash('sha256').update('ps-seal:' + machineId).digest();
}

function _encrypt(data, machineId) {
  const key = _sealKey(machineId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf-8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

function _decrypt(buf, machineId) {
  const key = _sealKey(machineId);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf-8'));
}

function readCache(machineId) {
  try {
    const buf = fs.readFileSync(_cachePath());
    if (buf.length < 29) return null; // corrupt/empty
    return _decrypt(buf, machineId);
  } catch { return null; }
}

function writeCache(data, machineId) {
  try {
    const dir = path.dirname(_cachePath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(_cachePath(), _encrypt(data, machineId));
  } catch (e) {
    console.error('[premium-session] cache write failed:', e.message);
  }
}

function clearCache() {
  try { fs.unlinkSync(_cachePath()); } catch {}
}

async function validateSession(machineId, appVersion, buildId) {
  // 1. Check cache — valid if within refresh TTL
  const cached = readCache(machineId);
  if (cached && Date.now() < cached.refreshAt) {
    return { ...cached, fromCache: true };
  }

  // 2. Read full key from license file (NOT masked)
  const licenseData = license.readLicense();
  if (!licenseData?.key) throw new Error('no_license_key');
  const kh = license.keyHash(licenseData.key);

  // 3. Call Supabase via existing sbFetch pattern
  let serverResult;
  try {
    serverResult = await license.sbFetch(
      'rpc/validate_premium_session', 'POST',
      { key_hash: kh, machine_id: machineId, app_version: appVersion, build_id: buildId || null }
    );
  } catch (e) {
    // Network error — check offline grace
    if (cached && Date.now() < cached.offlineGraceAt) {
      console.log('[premium-session] offline, using cached session (grace period)');
      return { ...cached, fromCache: true, offline: true };
    }
    throw new Error('server_unreachable');
  }

  if (!serverResult || serverResult.error) {
    const err = serverResult?.error || 'unknown';
    // If server says revoked/expired, clear cache
    if (err === 'revoked' || err === 'expired') clearCache();
    throw new Error(err);
  }

  // 4. Build session object
  const session = {
    decryptKey: serverResult.decrypt_key,
    features: serverResult.features,
    githubToken: serverResult.github_token || null,
    refreshAt: Date.now() + REFRESH_TTL_MS,
    offlineGraceAt: Date.now() + OFFLINE_GRACE_MS,
    validatedAt: Date.now(),
  };
  writeCache(session, machineId);
  return session;
}

module.exports = { validateSession, readCache, writeCache, clearCache, REFRESH_TTL_MS, OFFLINE_GRACE_MS };
```

Key design decisions:
- **Reuses `license.sbFetch`** — no duplicate Supabase connection setup. Credentials stay in license.js.
- **Reads FULL key from `readLicense()`** — not from `checkLicenseStatus()` which returns masked key.
- **Sends key HASH** (`keyHash`), not raw key — matches existing security pattern.
- **12-byte IV** for cache encryption.
- **72h offline grace**: cached session keeps working up to 72h after last successful validation. Separate from 4h refresh TTL. CEO at a factory site without internet → premium works for 3 days.
- **Corrupt cache**: `buf.length < 29` check catches 0-byte and truncated files.
- **Uses Supabase RPC** (`rpc/validate_premium_session`) instead of Edge Function — simpler, same infrastructure.

- [ ] **Step 3: Commit**

```bash
git add electron/lib/premium-session.js electron/lib/license.js
git commit -m "feat(freemium): premium-session — server validation via sbFetch, 72h offline grace"
```

---

## Chunk 2: Boot Flow + Tier Detection

### Task 3: Wire tier detection into main.js

**Files:**
- Modify: `electron/main.js:329-340` (license gate)
- Modify: `electron/main.js:864-902` (revalidation)
- Modify: `electron/package.json:4` (remove membership)

- [ ] **Step 1: Add app-config helpers near top of main.js**

After the requires section, add:

```js
function _appConfigPath() {
  const license = require('./lib/license');
  return path.join(license.getAppDataDir(), '9bizclaw', 'app-config.json');
}
function _readAppConfig() {
  try { return JSON.parse(fs.readFileSync(_appConfigPath(), 'utf-8')); } catch { return {}; }
}
function _writeAppConfig(patch) {
  const cur = _readAppConfig();
  const merged = { ...cur, ...patch };
  fs.mkdirSync(path.dirname(_appConfigPath()), { recursive: true });
  fs.writeFileSync(_appConfigPath(), JSON.stringify(merged, null, 2));
  return merged;
}
```

- [ ] **Step 2: Set `global.__premium` EARLY — before any module loads**

CRITICAL: `global.__premium` must be set to stubs BEFORE `require('./lib/dashboard-ipc')` or any other module that imports premium modules. Add at the VERY TOP of main.js (after `const` imports of non-premium modules, BEFORE any premium module require):

```js
// Initialize premium stubs immediately — proxy stubs in premium .js files read this
const premiumLoader = require('./lib/premium-loader');
global.__premium = premiumLoader.loadAllStubs();
global.__premiumTier = 'free'; // default, upgraded later if license valid
```

This must be placed BEFORE line 144 (`require('./lib/appointments')`) and line 195 (`require('./lib/fb-schedule')`). When those requires run, the proxy stubs read `global.__premium.appointments` → gets the Proxy stub (no-op functions).

- [ ] **Step 3: Replace license gate (lines 329-340) with tier detection**

Delete the `isMembershipBuild` block. Replace with:

```js
  // ── Tier detection (replaces old membership gate) ──
  const license = require('./lib/license');
  const premiumSession = require('./lib/premium-session');
  const ls = license.checkLicenseStatus();
  const appCfg = _readAppConfig();

  if (ls.status === 'valid') {
    // Premium license found — validate session, decrypt modules
    try {
      const manifest = (() => { try { return require('./lib/premium-manifest.json'); } catch { return {}; } })();
      const mid = ls.machineId || license.getMachineId();
      const session = await premiumSession.validateSession(mid, app.getVersion(), manifest.buildId);
      global.__premium = premiumLoader.loadAllPremium(session.decryptKey);
      global.__premiumTier = 'premium';
      global.__premiumSession = session;
      console.log('[boot] premium tier, features:', session.features);
    } catch (e) {
      // Server failed + no cache/grace → downgrade to free (stubs already loaded)
      global.__premiumTier = 'free';
      global.__premiumDowngradeReason = e.message;
      console.warn('[boot] premium key valid but session failed — free mode:', e.message);
    }
  } else if (ls.status === 'expired' || ls.status === 'invalid' || ls.status === 'locked') {
    // Expired/invalid key — show license page (with option to use free)
    console.log('[boot] license status:', ls.status, '-> license.html');
    ctx.mainWindow.loadFile(path.join(__dirname, 'ui', 'license.html'));
    return;
  } else if (appCfg.freeChosen) {
    // Returning free user — stubs already loaded
    console.log('[boot] free tier (returning user)');
  } else {
    // First launch — show tier choice
    console.log('[boot] first launch -> tier-choice.html');
    ctx.mainWindow.loadFile(path.join(__dirname, 'ui', 'tier-choice.html'));
    return;
  }
```

NOTE: `createWindow` must be async (or this block wrapped in an async IIFE) because `validateSession` is async. Check existing code — if createWindow is already sync, wrap the tier detection block.

- [ ] **Step 4: Update revalidation loop (lines ~864-902)**

Inside the existing 2-hour interval, add session refresh:

```js
if (global.__premiumTier === 'premium') {
  try {
    const mid = license.getMachineId();
    const manifest = (() => { try { return require('./lib/premium-manifest.json'); } catch { return {}; } })();
    const session = await premiumSession.validateSession(mid, app.getVersion(), manifest.buildId);
    if (!session.fromCache) {
      // Fresh validation — re-decrypt modules in case key rotated
      // Note: _loaded cache in premium-loader means same-key decryption is a no-op
      global.__premium = premiumLoader.loadAllPremium(session.decryptKey);
      global.__premiumSession = session;
    }
  } catch (e) {
    console.warn('[revalidation] premium session refresh failed:', e.message);
    // Don't immediately downgrade — offline grace in premium-session handles this
    // Only downgrade if validateSession threw (means both server + cache + grace all failed)
    global.__premiumTier = 'free';
    global.__premium = premiumLoader.loadAllStubs();
    global.__premiumDowngradeReason = e.message;
    if (ctx.mainWindow) ctx.mainWindow.webContents.send('tier-changed', { tier: 'free', reason: e.message });
  }
}
```

NOTE on mid-operation downgrade: the `tier-changed` event lets the renderer show a modal warning. In-flight premium operations may return undefined from stub functions, but Proxy stubs are designed to no-op gracefully (not crash).

- [ ] **Step 5: Add IPC handlers**

```js
ipcMain.handle('get-tier', () => ({
  tier: global.__premiumTier || 'free',
  downgradeReason: global.__premiumDowngradeReason || null,
}));

ipcMain.handle('choose-free', () => {
  const cfg = _writeAppConfig({ freeChosen: true, freeChosenAt: new Date().toISOString() });
  // Check if wizard already completed — don't re-run wizard for returning users
  const configured = fs.existsSync(path.join(getWorkspace(), 'openclaw.json'));
  if (configured) {
    ctx.mainWindow.loadFile(path.join(__dirname, 'ui', 'dashboard.html'));
  } else {
    ctx.mainWindow.loadFile(path.join(__dirname, 'ui', 'wizard.html'));
  }
});
```

- [ ] **Step 6: Add preload bridges**

In `electron/preload.js` near line 273:

```js
getTier: () => ipcRenderer.invoke('get-tier'),
chooseFree: () => ipcRenderer.invoke('choose-free'),
onTierChanged: (cb) => ipcRenderer.on('tier-changed', (_e, data) => cb(data)),
```

- [ ] **Step 7: Remove `membership` from package.json**

Delete `"membership": true,` from `electron/package.json` line 4.

- [ ] **Step 8: Commit**

```bash
git add electron/main.js electron/preload.js electron/package.json
git commit -m "feat(freemium): tier detection boot flow — premium decrypt or free stubs"
```

---

## Chunk 3: Tier Choice + Upgrade UI

### Task 4: Create `tier-choice.html`

**Files:**
- Create: `electron/ui/tier-choice.html`

- [ ] **Step 1: Create tier-choice.html**

Two-column layout matching existing `license.html` aesthetic. Left: brand panel with logo. Right: two cards (Free / Premium). Must use proper Vietnamese diacritics throughout.

Free card: lists Telegram, Zalo, AI, Cron, Tri thức. Button calls `window.claw.chooseFree()`.
Premium card: lists everything + FB, Google, Brain, Lịch hẹn. Button navigates to `license.html?from=tier-choice`.

- [ ] **Step 2: Update license.html for upgrade mode**

Add to `electron/ui/license.html`:

1. Parse `?mode=upgrade` and `?from=tier-choice` query params
2. If `from=tier-choice`: show "Dùng bản Free" link at bottom → calls `window.claw.chooseFree()`
3. If `mode=upgrade`: after successful activation, show "Khởi động lại để kích hoạt Premium" button that calls `window.claw.restartApp()` (existing IPC) instead of backup/wizard choice
4. If expired license: show "Dùng bản Free thay vì gia hạn" link → calls `window.claw.chooseFree()`

- [ ] **Step 3: Add preload bridge for chooseFree**

Already added in Task 3 Step 6. Verify it exists.

- [ ] **Step 4: Commit**

```bash
git add electron/ui/tier-choice.html electron/ui/license.html
git commit -m "feat(freemium): tier choice screen + license.html upgrade mode"
```

---

## Chunk 4: Dashboard Sidebar Gating

### Task 5: Add premium locked items + Coming Soon

**Files:**
- Modify: `electron/ui/dashboard.html` (sidebar + CSS + JS)

- [ ] **Step 1: Convert existing brain rail item to premium-gated**

The existing `brain` rail item at line 2617 needs `data-premium="true"` added. The `initTierUI()` function will toggle its locked state based on tier. Do NOT duplicate the item.

Similarly, any existing Facebook-related pages/tabs need `data-premium="true"`.

- [ ] **Step 2: Add new premium items after config rail item (line 2624)**

```html
      <!-- Premium items (new) -->
      <div class="rail-item rail-locked" data-rail="google-workspace" data-premium="true" onclick="handleLockedClick('google')" title="Google Workspace">
        <span class="rail-icon" data-icon="grid-3x3"></span>
        <span class="rail-label">Google</span>
        <span class="rail-lock-badge"></span>
      </div>
      <div class="rail-item rail-locked" data-rail="appointments" data-premium="true" onclick="handleLockedClick('appointments')" title="Lịch hẹn">
        <span class="rail-icon" data-icon="calendar-check"></span>
        <span class="rail-label">Lịch hẹn</span>
        <span class="rail-lock-badge"></span>
      </div>

      <!-- Coming Soon -->
      <div class="rail-divider"><span>Coming Soon</span></div>
      <div id="coming-soon-nav"></div>
```

Add `data-premium="true"` to the EXISTING brain rail item (line 2617) and any Facebook rail items.

- [ ] **Step 3: Add CSS for locked items + Coming Soon**

```css
.rail-locked { opacity: 0.4; }
.rail-locked:hover { opacity: 0.6; }
.rail-lock-badge { width: 8px; height: 8px; background: var(--text-muted); mask: url("data:...lock-svg...") center/contain no-repeat; }
.rail-divider { padding: 12px 12px 4px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); opacity: 0.5; }
.rail-coming-group { }
.rail-coming-header { padding: 4px 12px; font-size: 10px; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 4px; }
.rail-coming-header:hover { color: var(--text); }
.rail-coming-items { display: none; padding-left: 8px; }
.rail-coming-group.expanded .rail-coming-items { display: block; }
.rail-coming-item { padding: 3px 12px; font-size: 10px; color: var(--text-muted); opacity: 0.35; cursor: pointer; }
.rail-coming-item:hover { opacity: 0.55; }
.upgrade-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.upgrade-modal { background: var(--surface); border-radius: 12px; padding: 32px; max-width: 400px; width: 90%; }
.rail-upgrade-btn { margin: 8px 12px; padding: 6px; font-size: 10px; border-radius: 6px; border: 1px solid var(--accent); color: var(--accent); background: transparent; cursor: pointer; }
```

- [ ] **Step 4: Add Coming Soon data + render**

```js
const COMING_SOON = [
  { name: 'Kênh chat', items: ['Messenger', 'WhatsApp', 'Instagram DM', 'Zalo OA', 'LINE'] },
  { name: 'Quảng cáo', items: ['Facebook Ads', 'Google Ads', 'TikTok Ads', 'Zalo Ads'] },
  { name: 'Truyền thông', items: ['TikTok Auto Post', 'YouTube/Reels', 'LinkedIn', 'X (Twitter)'] },
  { name: 'Sàn TMĐT', items: ['Shopee', 'TikTok Shop', 'Lazada'] },
  { name: 'Bán hàng & CRM', items: ['Pipeline quản lý deal', 'Follow-up tự động', 'CRM khách hàng', 'Báo cáo doanh số'] },
  { name: 'Tài chính', items: ['Thu chi hằng ngày', 'Báo cáo P&L', 'Theo dõi công nợ', 'Cashflow forecast'] },
  { name: 'Vận hành', items: ['SOP & Quy trình', 'Inventory tracker', 'Checklist vận hành'] },
  { name: 'Nhân sự', items: ['Tuyển dụng & JD', 'Onboarding plan', 'KPI & Performance'] },
  { name: 'Chiến lược', items: ['SWOT / Porter 5', 'OKR builder', 'Business plan'] },
  { name: 'Tăng trưởng', items: ['Pitch deck', 'Franchise model', 'Valuation'] },
];

function renderComingSoon() {
  const el = document.getElementById('coming-soon-nav');
  if (!el) return;
  el.textContent = '';
  COMING_SOON.forEach(cat => {
    const group = document.createElement('div');
    group.className = 'rail-coming-group';
    const header = document.createElement('div');
    header.className = 'rail-coming-header';
    header.textContent = cat.name;
    header.addEventListener('click', () => group.classList.toggle('expanded'));
    group.appendChild(header);
    const items = document.createElement('div');
    items.className = 'rail-coming-items';
    cat.items.forEach(name => {
      const item = document.createElement('div');
      item.className = 'rail-coming-item';
      item.textContent = name;
      item.dataset.feature = name;
      item.addEventListener('click', () => showUpgradeModal(name, true));
      items.appendChild(item);
    });
    group.appendChild(items);
    el.appendChild(group);
  });
}
```

NOTE: Uses `textContent` and `createElement` (not `innerHTML`) to avoid XSS.

- [ ] **Step 5: Add locked click handler + upgrade modal (overlay, not page replace)**

```js
function handleLockedClick(feature) {
  window.claw.trackLockedClick(feature);
  showUpgradeModal(feature, false);
}

const FEATURE_DESC = {
  facebook: 'Lên lịch đăng Facebook tự động, duyệt bài qua Telegram, quản lý brand assets.',
  google: 'Kết nối Google Calendar, Gmail, Sheets, Docs, Drive — đồng bộ dữ liệu doanh nghiệp.',
  brain: 'Đồ thị tri thức AI — kết nối và trực quan hóa tất cả dữ liệu khách hàng, sản phẩm, nhóm.',
  appointments: 'Quản lý lịch hẹn, nhắc nhở tự động qua Telegram và Zalo.',
};

function showUpgradeModal(feature, isComingSoon) {
  // Remove existing modal if any
  document.querySelector('.upgrade-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'upgrade-modal-overlay';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  const modal = document.createElement('div');
  modal.className = 'upgrade-modal';

  const badge = isComingSoon ? '<div style="font-size:10px;color:var(--accent);margin-bottom:8px">SẮP TỚI</div>' : '';
  const desc = FEATURE_DESC[feature] || 'Tính năng sắp ra mắt.';

  modal.innerHTML = badge +
    '<h3 style="margin:0 0 8px">' + _escHtml(feature) + '</h3>' +
    '<p style="color:var(--text-muted);font-size:13px;margin:0 0 16px">' + _escHtml(desc) + '</p>' +
    '<p style="font-size:13px;margin:0 0 16px">Tính năng này cần Premium.</p>' +
    '<button class="btn btn-primary" style="width:100%;margin-bottom:8px" onclick="openInlineUpgrade()">Nhập key Premium</button>' +
    '<p style="text-align:center;font-size:11px;color:var(--text-muted)">Liên hệ: 08.1900.0790</p>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function _escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function openInlineUpgrade() {
  window.claw.trackUpgradeClick();
  // Navigate to license.html in upgrade mode
  window.location.href = 'license.html?mode=upgrade';
}
```

- [ ] **Step 6: `initTierUI()` — toggle sidebar based on tier**

```js
async function initTierUI() {
  const { tier } = await window.claw.getTier();
  document.querySelectorAll('[data-premium="true"]').forEach(el => {
    if (tier === 'premium') {
      el.classList.remove('rail-locked');
      el.querySelector('.rail-lock-badge')?.remove();
      // Re-enable normal navigation
      const rail = el.dataset.rail;
      el.onclick = () => switchToRail(rail);
    }
    // If free: already has rail-locked class from HTML
  });

  // Show/hide upgrade button
  const btn = document.getElementById('upgrade-btn');
  if (btn) btn.style.display = tier === 'free' ? '' : 'none';

  renderComingSoon();

  // Listen for mid-session tier changes
  window.claw.onTierChanged(({ tier: newTier, reason }) => {
    if (newTier === 'free') {
      // Re-lock premium items via CSS class (don't remove DOM elements)
      document.querySelectorAll('[data-premium="true"]').forEach(el => {
        el.classList.add('rail-locked');
      });
      // Show banner
      showUpgradeModal('Premium', false);
    }
  });
}
// Call in DOMContentLoaded
```

- [ ] **Step 7: Add upgrade button to sidebar footer**

Before theme buttons in rail-bottom:

```html
<button class="rail-upgrade-btn" id="upgrade-btn" onclick="openInlineUpgrade()" style="display:none">Nâng cấp Premium</button>
```

- [ ] **Step 8: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat(freemium): dashboard sidebar — locked premium, Coming Soon, upgrade modal"
```

### Task 6: Analytics tracking

**Files:**
- Modify: `electron/main.js` (IPC handlers)
- Modify: `electron/preload.js`

- [ ] **Step 1: Add analytics IPC handlers**

```js
let _analytics = null;
function _analyticsPath() { return path.join(license.getAppDataDir(), '9bizclaw', 'analytics.json'); }
function _loadAnalytics() {
  if (_analytics) return _analytics;
  try { _analytics = JSON.parse(fs.readFileSync(_analyticsPath(), 'utf-8')); } catch { _analytics = { lockedClicks: {}, upgradeClicks: 0 }; }
  return _analytics;
}
function _saveAnalytics() {
  try { fs.mkdirSync(path.dirname(_analyticsPath()), { recursive: true }); fs.writeFileSync(_analyticsPath(), JSON.stringify(_analytics, null, 2)); } catch {}
}

ipcMain.handle('track-locked-click', (_e, feature) => {
  const a = _loadAnalytics();
  a.lockedClicks[feature] = (a.lockedClicks[feature] || 0) + 1;
  _saveAnalytics();
});

ipcMain.handle('track-upgrade-click', () => {
  const a = _loadAnalytics();
  a.upgradeClicks = (a.upgradeClicks || 0) + 1;
  _saveAnalytics();
});
```

- [ ] **Step 2: Add preload bridges**

```js
trackLockedClick: (f) => ipcRenderer.invoke('track-locked-click', f),
trackUpgradeClick: () => ipcRenderer.invoke('track-upgrade-click'),
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.js electron/preload.js
git commit -m "feat(freemium): analytics tracking for locked feature clicks"
```

---

## Chunk 5: Build-Time Encryption

### Task 7: Create `encrypt-premium.js`

**Files:**
- Create: `electron/scripts/encrypt-premium.js`

- [ ] **Step 0: Install javascript-obfuscator devDependency FIRST**

```bash
cd electron && npm install --save-dev javascript-obfuscator
```

- [ ] **Step 1: Write encrypt-premium.js**

```js
#!/usr/bin/env node
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LIB = path.join(__dirname, '..', 'lib');

// Files to encrypt — brain-layout-worker.js is EXCLUDED (forked via child_process, needs .js on disk)
const PREMIUM_FILES = [
  'fb-schedule.js', 'fb-publisher.js',
  'google-api.js', 'google-routes.js',
  'brain-graph.js',
  'appointments.js',
];

// Map filename → feature group (for proxy stubs)
const FILE_TO_GROUP = {
  'fb-schedule.js': 'facebook', 'fb-publisher.js': 'facebook',
  'google-api.js': 'google', 'google-routes.js': 'google',
  'brain-graph.js': 'brain',
  'appointments.js': 'appointments',
};

function obfuscate(source, filename) {
  try {
    const JO = require('javascript-obfuscator');
    return JO.obfuscate(source, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.5,
      stringArray: true,
      stringArrayEncoding: ['base64'],
      stringArrayThreshold: 0.5,
      target: 'node',
    }).getObfuscatedCode();
  } catch (e) {
    console.warn('[encrypt] obfuscation failed for ' + filename + ': ' + e.message);
    return source;
  }
}

function encrypt(source, key) {
  const iv = crypto.randomBytes(12); // 12-byte IV (NIST standard for GCM)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(source, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]); // 12 + 16 + ciphertext
}

function main() {
  const keyBuf = process.env.BUILD_ENCRYPT_KEY
    ? Buffer.from(process.env.BUILD_ENCRYPT_KEY, 'base64')
    : crypto.randomBytes(32);

  const buildId = crypto.randomBytes(8).toString('hex');
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  const keyB64 = keyBuf.toString('base64');

  for (const file of PREMIUM_FILES) {
    const srcPath = path.join(LIB, file);
    if (!fs.existsSync(srcPath)) { console.error('[encrypt] MISSING: ' + srcPath); process.exit(1); }
    const source = fs.readFileSync(srcPath, 'utf-8');
    const obf = obfuscate(source, file);
    const encBuf = encrypt(obf, keyBuf);

    // Write .enc
    fs.writeFileSync(path.join(LIB, file.replace(/\.js$/, '.enc')), encBuf);

    // OVERWRITE .js with proxy stub (not delete — all require() calls still work)
    const group = FILE_TO_GROUP[file];
    fs.writeFileSync(srcPath,
      "// PROXY STUB — real code in " + file.replace('.js', '.enc') + "\n" +
      "module.exports = global.__premium?." + group + " || require('./premium-loader').getPremiumStub('" + group + "');\n"
    );

    console.log('[encrypt] ' + file + ' -> .enc (' + encBuf.length + 'B) + proxy stub');
  }

  // Write manifest (shipped in asar — no key)
  fs.writeFileSync(path.join(LIB, 'premium-manifest.json'), JSON.stringify({
    buildId, version: pkg.version,
    modules: PREMIUM_FILES.map(f => f.replace(/\.js$/, '')),
    encryptedAt: new Date().toISOString(),
  }, null, 2));

  // Write key file (CI reads this, NOT shipped — excluded via .gitignore + build.files)
  const keyFilePath = path.join(__dirname, '..', 'build-encrypt-key.json');
  fs.writeFileSync(keyFilePath, JSON.stringify({ buildId, version: pkg.version, encryptKey: keyB64 }));

  console.log('[encrypt] Done: buildId=' + buildId + ', key in build-encrypt-key.json');
}

main();
```

Key changes from v1:
- **Overwrites .js with proxy stubs** instead of deleting — all require() calls work
- **12-byte IV** (NIST standard)
- **brain-layout-worker.js excluded** (forked, not required)
- **Key file outside lib dir** (not shipped in asar)
- **javascript-obfuscator installed BEFORE this step runs**

- [ ] **Step 2: Add .gitignore entries**

```
electron/build-encrypt-key.json
electron/lib/*.enc
electron/lib/premium-manifest.json
```

- [ ] **Step 3: Add build.files exclusion in package.json**

In `electron/package.json` build.files array, add:

```json
"!build-encrypt-key.json"
```

- [ ] **Step 4: Add encrypt-premium npm script**

```json
"encrypt-premium": "node scripts/encrypt-premium.js"
```

- [ ] **Step 5: Commit**

```bash
git add electron/scripts/encrypt-premium.js electron/package.json .gitignore
git commit -m "feat(freemium): encrypt-premium — obfuscate + AES-256-GCM + proxy stubs"
```

### Task 8: Update build scripts

**Files:**
- Modify: `electron/scripts/build-win.js`
- Modify: `electron/package.json` (Mac build scripts)

- [ ] **Step 1: Update build-win.js**

After line 51 (obfuscate), before line 52 (try/electron-builder), add encrypt step. Update finally block to restore both obfuscated AND encrypted files:

```js
run(npmCmd, ['run', 'prebuild:modoro-zalo']);
run(npmCmd, ['run', 'smoke']);
run(process.execPath, ['scripts/obfuscate.js']);
run(process.execPath, ['scripts/encrypt-premium.js']);
try {
  run(npxCmd, ['electron-builder', '--win']);
} finally {
  // Restore obfuscated files
  const restore = spawnSync(process.execPath, ['scripts/obfuscate.js', '--restore'], {
    cwd: ROOT, env: process.env, stdio: 'inherit', shell: false,
  });
  if (restore.status !== 0) console.warn('[build-win] obfuscate --restore failed');
  // Restore encrypted premium files (proxy stubs → original source)
  const premFiles = ['fb-schedule.js', 'fb-publisher.js', 'google-api.js', 'google-routes.js', 'brain-graph.js', 'appointments.js'];
  const gitRestore = spawnSync('git', ['checkout', '--', ...premFiles.map(f => 'lib/' + f)], {
    cwd: ROOT, stdio: 'inherit', shell: false,
  });
  if (gitRestore.status !== 0) console.warn('[build-win] git restore premium files failed');
  // Clean up .enc and manifest
  for (const f of premFiles) {
    try { fs.unlinkSync(path.join(ROOT, 'lib', f.replace('.js', '.enc'))); } catch {}
  }
  try { fs.unlinkSync(path.join(ROOT, 'lib', 'premium-manifest.json')); } catch {}
  try { fs.unlinkSync(path.join(ROOT, 'build-encrypt-key.json')); } catch {}
}
```

- [ ] **Step 2: Update Mac build scripts**

In package.json, update mac build commands:

```
Before: ... && npm run smoke && npm run obfuscate && electron-builder ...
After:  ... && npm run smoke && npm run obfuscate && npm run encrypt-premium && electron-builder ...
```

Add cleanup to the finally chain:

```bash
npm run deobfuscate; git checkout -- lib/fb-schedule.js lib/fb-publisher.js lib/google-api.js lib/google-routes.js lib/brain-graph.js lib/appointments.js 2>/dev/null; rm -f lib/*.enc lib/premium-manifest.json build-encrypt-key.json 2>/dev/null
```

- [ ] **Step 3: Commit**

```bash
git add electron/scripts/build-win.js electron/package.json
git commit -m "feat(freemium): build scripts — encrypt after obfuscate, cleanup in finally"
```

---

## Chunk 6: Server + Updates

### Task 9: Create Supabase RPC function + tables

**Files:**
- Create: `supabase/migrations/001_premium_session.sql`
- Create: `supabase/functions/validate-session/index.ts` (or use RPC — see below)

- [ ] **Step 1: Create tables**

```sql
-- Build keys (populated by CI after each build)
CREATE TABLE IF NOT EXISTS build_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  build_id text NOT NULL UNIQUE,
  app_version text NOT NULL,
  encrypt_key text NOT NULL,
  created_at timestamptz DEFAULT now()
);
-- No UNIQUE on app_version — multiple builds per version are allowed
-- Lookup: prefer build_id (exact), fallback latest row for app_version
CREATE INDEX idx_bk_version ON build_keys(app_version, created_at DESC);

-- Session validations (rate limiting + analytics)
CREATE TABLE IF NOT EXISTS session_validations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash text NOT NULL,
  machine_id text NOT NULL,
  app_version text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_sv_keyhash_day ON session_validations(key_hash, created_at);

-- Supabase RPC function (called by premium-session.js via sbFetch)
CREATE OR REPLACE FUNCTION validate_premium_session(
  p_key_hash text,
  p_machine_id text,
  p_app_version text,
  p_build_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_activation record;
  v_key record;
  v_count int;
BEGIN
  -- Rate limit: 10/day per key
  SELECT count(*) INTO v_count FROM session_validations
    WHERE key_hash = p_key_hash AND created_at > now() - interval '1 day';
  IF v_count >= 10 THEN
    RETURN jsonb_build_object('error', 'rate_limited');
  END IF;

  -- Check activation
  SELECT * INTO v_activation FROM activations WHERE key_hash = p_key_hash LIMIT 1;
  IF v_activation IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_key');
  END IF;
  IF v_activation.revoked THEN
    RETURN jsonb_build_object('error', 'revoked');
  END IF;
  IF v_activation.machine_id IS NOT NULL AND v_activation.machine_id != p_machine_id THEN
    RETURN jsonb_build_object('error', 'machine_mismatch');
  END IF;
  IF v_activation.valid_until IS NOT NULL AND v_activation.valid_until < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  -- Look up decrypt key: prefer build_id, fallback to latest for version
  IF p_build_id IS NOT NULL THEN
    SELECT * INTO v_key FROM build_keys WHERE build_id = p_build_id;
  END IF;
  IF v_key IS NULL THEN
    SELECT * INTO v_key FROM build_keys WHERE app_version = p_app_version ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('error', 'unsupported_version');
  END IF;

  -- Log validation
  INSERT INTO session_validations (key_hash, machine_id, app_version) VALUES (p_key_hash, p_machine_id, p_app_version);

  -- Return session
  RETURN jsonb_build_object(
    'decrypt_key', v_key.encrypt_key,
    'features', '["facebook","google","brain","appointments"]'::jsonb,
    'github_token', current_setting('app.github_releases_token', true)
  );
END;
$$;
```

NOTE: Uses `activations` table (existing name from license.js), NOT `license_activations`. The `github_token` is stored as a Supabase app config setting (`ALTER DATABASE ... SET app.github_releases_token = '...'`), not hardcoded.

- [ ] **Step 2: Commit**

```bash
git add supabase/
git commit -m "feat(freemium): Supabase RPC validate_premium_session + build_keys table"
```

### Task 10: Update `updates.js` for private repo

**Files:**
- Modify: `electron/lib/updates.js`

- [ ] **Step 1: Add auth token from premium session**

```js
function _getGitHubToken() {
  // Premium users: token from session cache
  if (global.__premiumSession?.githubToken) return global.__premiumSession.githubToken;
  return null;
}

// In _checkForUpdatesOnce, update headers:
const token = _getGitHubToken();
const headers = {
  'User-Agent': '9BizClaw/' + current,
  'Accept': 'application/vnd.github.v3+json',
};
if (token) headers['Authorization'] = 'token ' + token;
```

Free users: no token → GitHub API returns 404 for private repo → `checkForUpdates` returns null silently. Free users discover updates via the website or when they upgrade.

Alternative (better UX): add a Supabase table `app_releases` with `{ version, download_url, release_notes }`. The update checker queries this table (via sbFetch, works for all users, no GitHub token needed). Implement this if free-user update awareness is important.

- [ ] **Step 2: Commit**

```bash
git add electron/lib/updates.js
git commit -m "feat(freemium): updates.js uses session GitHub token for private repo"
```

### Task 11: CI key upload

**Files:**
- Modify: `.github/workflows/build-win.yml` and `build-mac.yml`

- [ ] **Step 1: Add upload step after electron-builder**

```yaml
- name: Upload build key to Supabase
  if: success()
  run: |
    node -e "
      const kf = require('./electron/build-encrypt-key.json');
      const url = '${{ secrets.SUPABASE_URL }}';
      const key = '${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}';
      fetch(url + '/rest/v1/build_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
        body: JSON.stringify({ build_id: kf.buildId, app_version: kf.version, encrypt_key: kf.encryptKey }),
      }).then(r => { if (!r.ok) throw new Error(r.status); console.log('Build key uploaded'); })
        .catch(e => { console.error('Upload failed:', e); process.exit(1); });
    "
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/
git commit -m "feat(freemium): CI uploads per-build encrypt key to Supabase"
```

---

## Chunk 7: Testing

### Task 12: E2E verification

- [ ] **Step 1: Test encrypt + decrypt cycle locally**

```bash
cd electron
node scripts/encrypt-premium.js
# Verify: 6 .enc files exist, 6 .js files are now proxy stubs, brain-layout-worker.js unchanged
node -e "const pl = require('./lib/premium-loader'); const kf = require('./build-encrypt-key.json'); const m = pl.loadAllPremium(kf.encryptKey); console.log(Object.keys(m), typeof m.facebook.loadSchedules)"
# Expected: ['facebook', 'google', 'brain', 'appointments'] 'function'
```

- [ ] **Step 2: Restore originals**

```bash
git checkout -- lib/fb-schedule.js lib/fb-publisher.js lib/google-api.js lib/google-routes.js lib/brain-graph.js lib/appointments.js
rm -f lib/*.enc lib/premium-manifest.json build-encrypt-key.json
```

- [ ] **Step 3: Test boot flow states**

| State | How to simulate | Expected |
|-------|----------------|----------|
| Fresh install | Delete `%APPDATA%/9bizclaw/` | tier-choice.html |
| Free returning | Set `freeChosen: true` in app-config.json | dashboard (free, locked sidebar) |
| Premium + server up | Valid license.json + mock server | dashboard (premium, all unlocked) |
| Premium + server down | Valid license.json + no network + no cache | dashboard (free, downgrade banner) |
| Premium + cached | Valid license.json + no network + valid cache | dashboard (premium, from cache) |
| Expired license | Expired key in license.json | license.html with "Dùng bản Free" link |

- [ ] **Step 4: Test sidebar UX**

- Click locked premium item → modal overlay appears (not page replace)
- Click Coming Soon category → expands/collapses
- Click Coming Soon item → modal with "Sắp tới" badge
- Click "Nâng cấp Premium" → navigates to license.html?mode=upgrade
- Press Escape or click outside modal → modal closes

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(freemium): implementation complete — tested all boot states"
```

---

## Dependency Graph

```
Task 0: npm install javascript-obfuscator
Task 1: premium-loader.js         ─┐
Task 2: premium-session.js         ├─> Task 3: main.js boot flow
                                    │
Task 4: tier-choice + license.html ─┘
                                    │
Task 5: dashboard sidebar          ─── (needs Task 3 for getTier IPC)
Task 6: analytics                  ─── (needs Task 5)
                                    │
Task 7: encrypt-premium.js         ─── (independent, needs Task 0)
Task 8: build scripts              ─── (needs Task 7)
Task 9: Supabase RPC               ─── (independent)
Task 10: updates.js                ─── (needs Task 3 for __premiumSession)
Task 11: CI upload                 ─── (needs Task 7 + 9)
Task 12: E2E test                  ─── (needs all above)
```

**Parallel groups:**
- Group A (Tasks 1+2, then 3+4): Backend core + boot flow
- Group B (Tasks 7+8): Build encryption
- Group C (Task 9): Server
- Sequential after A: Tasks 5→6, Task 10
- Sequential after B+C: Task 11
- Final: Task 12

## Issues Fixed From v1

| # | Issue | Fix |
|---|-------|-----|
| 1 | Top-level require crash | Proxy stubs — .js files overwritten with 1-line proxies |
| 2 | build-win.js cleanup | git checkout + cleanup in finally block |
| 3 | brain-layout-worker fork | Excluded from encryption (layout math only) |
| 4 | Raw license key sent | Send key_hash via sbFetch (matches existing pattern) |
| 5 | checkLicenseStatus masked key | Use readLicense() for full key |
| 6 | Migration for existing users | Uses existing `activations` table name |
| 7 | 4h offline too aggressive | 72h offline grace period |
| 8 | 16-byte IV | 12-byte IV (NIST standard) |
| 9 | module._compile not isolated | Per-file try/catch, individual feature stubs |
| 10 | UNIQUE on app_version | Removed — multiple builds per version OK |
| 11 | Free users can't update | Falls back gracefully; consider Supabase releases table |
| 12 | 30+ inline require() | Proxy stubs handle ALL require() calls |
| 13 | devDep install order | Step 0 installs before encrypt script runs |
| 14 | Duplicate Supabase client | Reuses license.js sbFetch |
| 15 | Rate limit client unaware | 72h grace prevents lockout |
| 16 | build-encrypt-key.json in asar | Excluded via build.files + .gitignore |
| 17 | Shared APPDATA path | Reuses license.js _getAppDataDir |
| 18 | Config write race | Simple read-modify-write (acceptable for boot-time-only config) |
| 19 | innerHTML XSS | createElement + textContent |
| 20 | Upgrade replaces page | Modal overlay instead |
| 21 | window.location leaves dashboard | Still navigates for license.html (acceptable — restart required anyway) |
| 22 | Mid-operation downgrade | Proxy stubs no-op gracefully + tier-changed event |
| 23 | stale _loaded cache | Documented — same build = same key, acceptable |
| 24 | CI key step contradiction | Single approach: read from build-encrypt-key.json |
| 25 | Hardcoded features | TODO: read from activation record in future |
| 27 | Generic error handling | Structured errors from validateSession (revoked/expired/rate_limited) |
| 28 | choose-free skips completed wizard | Checks configured flag before routing |
| 29 | No back from license.html | ?from=tier-choice param adds back link |
| 30 | Unused MAX_DAILY_CALLS | Removed |
| 34 | Spec says splash.html | Plan creates tier-choice.html (spec to be updated) |
| 35 | DOM removal prevents re-lock | CSS class toggle instead of element removal |
