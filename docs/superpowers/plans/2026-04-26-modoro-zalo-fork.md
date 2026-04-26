# modoro-zalo Fork Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace runtime-patched @tuyenhx/openzalo with a self-contained modoro-zalo package. Full rename of all ~1,300 "openzalo" refs. Backward-compatible migration for v2.3.49 customers.

**Architecture:** Copy openzalo source into `electron/packages/modoro-zalo/`, bake 4 patched files inline, rename all refs. Rewrite `ensureZaloPlugin()` to copy from local package instead of vendor npm. `ensureDefaultConfig()` handles config migration. Remove all runtime patch injection.

**Tech Stack:** Electron, TypeScript (plugin source), Node.js (main process), openclaw plugin system

---

## Chunk 1: Create modoro-zalo Package

### Task 1: Copy openzalo source tree into packages/modoro-zalo

**Files:**
- Create: `electron/packages/modoro-zalo/` (entire directory tree)
- Source: `~/.openclaw/extensions/openzalo/` (runtime copy with patches applied)

- [ ] **Step 1: Create directory and copy all source files**

```powershell
# Copy from the PATCHED runtime extension (already has fork patches applied)
New-Item -ItemType Directory -Force -Path electron/packages/modoro-zalo
Copy-Item -Recurse -Force "$env:USERPROFILE/.openclaw/extensions/openzalo/*" electron/packages/modoro-zalo/
# Remove runtime artifacts
Remove-Item -Recurse -Force electron/packages/modoro-zalo/node_modules -ErrorAction SilentlyContinue
Remove-Item -Force electron/packages/modoro-zalo/.fork-version -ErrorAction SilentlyContinue
```

- [ ] **Step 2: Verify file count**

```powershell
(Get-ChildItem -Recurse electron/packages/modoro-zalo -Filter *.ts).Count
# Expected: ~70 .ts files (66 src + 3 root + 1 script)
```

- [ ] **Step 3: Commit raw copy**

```bash
git add electron/packages/modoro-zalo/
git commit -m "chore: raw copy of openzalo source into packages/modoro-zalo"
```

### Task 2: Rename all "openzalo" refs in the package

**Files:**
- Modify: ALL `.ts` files in `electron/packages/modoro-zalo/`
- Modify: `electron/packages/modoro-zalo/openclaw.plugin.json`
- Modify: `electron/packages/modoro-zalo/package.json`

The rename has 4 patterns applied in this order:
1. `"openzalo"` (string literals) → `"modoro-zalo"`
2. `Openzalo` (PascalCase in types/classes) → `ModoroZalo`
3. `openzalo` (camelCase in variables/functions) → `modoroZalo`
4. `OpenZalo` (display labels) → `Modoro Zalo`

- [ ] **Step 1: Rename string literals in all .ts files**

For each `.ts` file in `src/`, `scripts/`, and root:
- `"openzalo"` → `"modoro-zalo"` (channel ID, config keys, log prefixes)
- `'openzalo'` → `'modoro-zalo'`
- `` `openzalo` `` in template literals → `` `modoro-zalo` ``
- `channels.openzalo` → `channels["modoro-zalo"]` (config access in TS)
- `channels?.openzalo` → `channels?.["modoro-zalo"]`

Special care for channel.ts identity fields:
```typescript
id: "modoro-zalo",
sectionKey: "modoro-zalo",
channelKey: "modoro-zalo",
reload: { configPrefixes: ["channels.modoro-zalo"] },
```

- [ ] **Step 2: Rename PascalCase identifiers**

Across all .ts files:
- `OpenzaloProbe` → `ModoroZaloProbe`
- `OpenzaloChannelConfigSchema` → `ModoroZaloChannelConfigSchema`
- `ResolvedOpenzaloAccount` → `ResolvedModoroZaloAccount`
- `OpenzaloSenderId` → `ModoroZaloSenderId`
- All other `Openzalo*` type/class names → `ModoroZalo*`

- [ ] **Step 3: Rename camelCase identifiers**

Across all .ts files:
- `openzaloPlugin` → `modoroZaloPlugin`
- `openzaloMessageActions` → `modoroZaloMessageActions`
- `openzaloOnboardingAdapter` → `modoroZaloOnboardingAdapter`
- `resolveOpenzaloAccount` → `resolveModoroZaloAccount`
- `listOpenzaloAccountIds` → `listModoroZaloAccountIds`
- `resolveOpenzaloGroupMatch` → `resolveModoroZaloGroupMatch`
- `normalizeOpenzaloAllowEntry` → `normalizeModoroZaloAllowEntry`
- `parseOpenzaloTarget` → `parseModoroZaloTarget`
- `handleOpenzaloInbound` → `handleModoroZaloInbound`
- All other `openzalo*` function/variable names → `modoroZalo*`

- [ ] **Step 4: Rename display labels**

- `"OpenZalo"` → `"Modoro Zalo"` (UI-facing labels like channel label, docs)
- `openzaloSenderId` (user-facing ID label in channel.ts) → `modoroZaloSenderId`

- [ ] **Step 5: Update openclaw.plugin.json**

```json
{
  "id": "modoro-zalo",
  "channels": ["modoro-zalo"],
  "channelConfigs": {
    "modoro-zalo": { ... }
  }
}
```

All `"openzalo"` keys/values in the JSON schema → `"modoro-zalo"`.

- [ ] **Step 6: Update package.json**

```json
{
  "name": "modoro-zalo",
  "version": "1.0.0",
  "openclaw": {
    "channel": {
      "id": "modoro-zalo",
      "label": "Modoro Zalo",
      "docsPath": "/channels/modoro-zalo",
      "docsLabel": "modoro-zalo"
    },
    "install": {
      "localPath": "extensions/modoro-zalo"
    }
  }
}
```

Remove `@tuyenhx/openzalo` npm references. Remove `npmSpec`. Keep `peerDependencies` on openclaw.

- [ ] **Step 7: Verify no remaining "openzalo" refs in package**

```powershell
Select-String -Path electron/packages/modoro-zalo/src/*.ts -Pattern "openzalo" -CaseSensitive | Measure-Object
Select-String -Path electron/packages/modoro-zalo/src/*.ts -Pattern "Openzalo" -CaseSensitive | Measure-Object
Select-String -Path electron/packages/modoro-zalo/src/acp-local/*.ts -Pattern "openzalo" -CaseSensitive | Measure-Object
# Expected: 0 for all
```

- [ ] **Step 8: Commit**

```bash
git add electron/packages/modoro-zalo/
git commit -m "feat: rename all openzalo refs to modoro-zalo in package (~1,300 renames)"
```

---

## Chunk 2: Update main.js — Migration + Plugin Installer + Boot Sequence

### Task 3: Add config migration in ensureDefaultConfig()

**Files:**
- Modify: `electron/main.js:3547-3957` (ensureDefaultConfig function)

- [ ] **Step 1: Add migration block at top of openzalo config section (~line 3601)**

Insert BEFORE the existing `channels.openzalo` creation block:

```javascript
// --- modoro-zalo migration from v2.3.49 ---
if (config.channels && config.channels.openzalo && !config.channels['modoro-zalo']) {
  config.channels['modoro-zalo'] = JSON.parse(JSON.stringify(config.channels.openzalo));
  delete config.channels.openzalo;
  changed = true;
  console.log('[config] migrated channels.openzalo → channels["modoro-zalo"]');
}
if (config.plugins?.entries?.openzalo && !config.plugins?.entries?.['modoro-zalo']) {
  config.plugins.entries['modoro-zalo'] = config.plugins.entries.openzalo;
  delete config.plugins.entries.openzalo;
  changed = true;
}
if (Array.isArray(config.plugins?.allow)) {
  const idx = config.plugins.allow.indexOf('openzalo');
  if (idx !== -1) { config.plugins.allow[idx] = 'modoro-zalo'; changed = true; }
}
```

- [ ] **Step 2: Rename all config paths in ensureDefaultConfig**

Replace throughout the function (~lines 3601-3714):
- `config.channels.openzalo` → `config.channels['modoro-zalo']`
- `channels.openzalo` (in string literals / log messages) → `channels["modoro-zalo"]`
- `plugins.entries.openzalo` → `plugins.entries['modoro-zalo']`
- `'openzalo'` in plugins.allow → `'modoro-zalo'`

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: ensureDefaultConfig migration channels.openzalo → modoro-zalo"
```

### Task 4: Rewrite ensureZaloPlugin()

**Files:**
- Modify: `electron/main.js:6087-6101` (ensureZaloPlugin wrapper)
- Modify: `electron/main.js:6510-6633` (_ensureZaloPluginImpl)
- Modify: `electron/main.js:6037-6085` (ensureOpenzaloNodeModulesLink — to be removed/merged)

- [ ] **Step 1: Rewrite _ensureZaloPluginImpl**

New logic:
```javascript
async function _ensureZaloPluginImpl() {
  const extDir = path.join(homeDir, '.openclaw', 'extensions', 'modoro-zalo');
  const manifestPath = path.join(extDir, 'openclaw.plugin.json');
  const versionFile = path.join(extDir, '.fork-version');
  const currentVersion = 'modoro-zalo-v1.0.0';

  // Fast path: already installed with matching version
  if (fs.existsSync(manifestPath) && fs.existsSync(versionFile)) {
    try {
      if (fs.readFileSync(versionFile, 'utf8').trim() === currentVersion) {
        _zaloReady = true;
        return;
      }
    } catch {}
  }

  // Copy from packages/modoro-zalo/
  const srcDir = path.join(__dirname, 'packages', 'modoro-zalo');
  if (!fs.existsSync(path.join(srcDir, 'openclaw.plugin.json'))) {
    // Fallback: try vendor
    const vendorSrc = path.join(getBundledVendorDir(), 'node_modules', 'modoro-zalo');
    if (fs.existsSync(path.join(vendorSrc, 'openclaw.plugin.json'))) {
      copyDirSync(vendorSrc, extDir);
    } else {
      console.error('[modoro-zalo] package not found in packages/ or vendor/');
      return;
    }
  } else {
    copyDirSync(srcDir, extDir);
  }

  // Link node_modules (same pattern as before but for modoro-zalo)
  ensureModoroZaloNodeModulesLink(extDir);

  // Write version marker
  fs.writeFileSync(versionFile, currentVersion);
  console.log('[modoro-zalo] plugin installed to', extDir);

  // Cleanup old openzalo extension
  const oldExt = path.join(homeDir, '.openclaw', 'extensions', 'openzalo');
  if (fs.existsSync(oldExt)) {
    try { fs.rmSync(oldExt, { recursive: true, force: true }); } catch {}
    console.log('[modoro-zalo] cleaned up old extensions/openzalo/');
  }

  _zaloReady = true;
}
```

- [ ] **Step 2: Rename ensureOpenzaloNodeModulesLink → ensureModoroZaloNodeModulesLink**

At lines 6037-6085: rename function, update internal paths from `openzalo` → `modoro-zalo`.

- [ ] **Step 3: Remove applyOpenzaloFork call from boot sequence**

In `_startOpenClawImpl()` `_patchFns` array (~line 4442):
- Remove `applyOpenzaloFork` entry
- Remove `ensureOpenzaloNodeModulesLink` entry (now called inside `_ensureZaloPluginImpl`)
- Keep all non-openzalo patches (vision, pricing, prewarm, webfetch, openzca friend event)

- [ ] **Step 4: Remove applyOpenzaloFork wrapper function**

Delete the wrapper at ~line 4032 that calls `vendorPatches.applyOpenzaloFork()`.

- [ ] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat: rewrite ensureZaloPlugin for modoro-zalo package (no runtime patches)"
```

### Task 5: Rename remaining openzalo refs in main.js

**Files:**
- Modify: `electron/main.js` (~120 remaining references across IPC handlers, probes, send functions, log messages)

- [ ] **Step 1: Rename config paths in IPC handlers**

Key handlers to update:
- `get-zalo-manager-config` (~line 7495): `config.channels.openzalo` → `config.channels['modoro-zalo']`
- `save-zalo-manager-config` (~line 7533): all `channels.openzalo.*` paths
- `setup-zalo` (~line 6640): plugin path refs
- `check-zalo-ready` (~line 10867): any openzalo config reads
- All pause/resume handlers

- [ ] **Step 2: Rename in probe and send functions**

- `probeZaloReady()` (~line 10646): config reads, extension path refs
- `sendZaloTo()` (~line 10063): config reads (`channels.openzalo.enabled` etc.)
- `sendZalo()` (~line 9865): if any refs

- [ ] **Step 3: Rename log messages and comments**

- `[openzalo]` → `[modoro-zalo]` in all log strings
- Update comments referencing openzalo

- [ ] **Step 4: Rename extension path references**

All occurrences of:
- `extensions/openzalo` → `extensions/modoro-zalo`
- `@tuyenhx/openzalo` → `modoro-zalo`

- [ ] **Step 5: Verify no remaining openzalo refs in main.js**

```powershell
Select-String -Path electron/main.js -Pattern "openzalo" -AllMatches | Measure-Object
# Expected: 0 (or only in migration code that references old name)
```

Allowed exceptions: the migration block in `ensureDefaultConfig()` which references `channels.openzalo` to detect and migrate old config.

- [ ] **Step 6: Commit**

```bash
git add electron/main.js
git commit -m "feat: rename all openzalo refs in main.js to modoro-zalo (~120 renames)"
```

---

## Chunk 3: Build Scripts + Remaining Files + Cleanup

### Task 6: Update vendor-patches.js

**Files:**
- Modify: `electron/lib/vendor-patches.js:8,414-470,489-491`

- [ ] **Step 1: Remove openzalo fork code**

- Delete `OPENZALO_FORK_VERSION` constant (line 8)
- Delete `_copyForkFiles()` helper (lines 414-433)
- Delete `applyOpenzaloFork()` function (lines 435-470)
- Remove fork case from `applyAllVendorPatches()` (lines 489-491)

- [ ] **Step 2: Commit**

```bash
git add electron/lib/vendor-patches.js
git commit -m "chore: remove applyOpenzaloFork from vendor-patches (patches baked into modoro-zalo)"
```

### Task 7: Update prebuild-vendor.js

**Files:**
- Modify: `electron/scripts/prebuild-vendor.js:16,25,269,275,329,368-381`

- [ ] **Step 1: Replace @tuyenhx/openzalo with modoro-zalo in vendor bundling**

Key changes:
- Remove `'@tuyenhx/openzalo@2026.3.31'` from PINNED array (line 329)
- Remove `'@tuyenhx/openzalo': '2026.3.31'` from expected versions (line 269)
- Remove `'@tuyenhx/openzalo'` from version check (line 275)
- Add copy logic: after npm install, copy `electron/packages/modoro-zalo/` → `vendor/node_modules/modoro-zalo/`
- Update validation (lines 368-381): check for `modoro-zalo/openclaw.plugin.json` instead of `@tuyenhx/openzalo/openclaw.plugin.json`
- Update comments (lines 16, 25)

- [ ] **Step 2: Commit**

```bash
git add electron/scripts/prebuild-vendor.js
git commit -m "chore: prebuild-vendor copies modoro-zalo package instead of npm installing openzalo"
```

### Task 8: Update smoke-test.js

**Files:**
- Modify: `electron/scripts/smoke-test.js` (16+ references)

- [ ] **Step 1: Update all openzalo references**

- Remove `'@tuyenhx/openzalo': '2026.3.31'` from expected versions (line 62)
- Update config assertions: `openzalo` → `modoro-zalo` in channels/plugins (lines 187, 196-197)
- Update vendor source paths (lines 322-324): look for `modoro-zalo` instead of `@tuyenhx/openzalo`
- Update variable names: `openzaloSrc` → `modoroZaloSrc` (lines 326-339)
- Update patch anchor checks (lines 346-367): paths reference `packages/modoro-zalo/` instead of `patches/openzalo-fork/`
- Update error messages and warnings

- [ ] **Step 2: Commit**

```bash
git add electron/scripts/smoke-test.js
git commit -m "chore: smoke-test validates modoro-zalo instead of openzalo"
```

### Task 9: Update remaining files

**Files:**
- Modify: `electron/scripts/test-core.js` (11 refs)
- Modify: `tools/zalo-manage.js` (3 refs)
- Modify: `tools/send-zalo-safe.js` (2 refs)
- Modify: `RESET.bat` (comments only)
- Modify: `USER-RESET.bat` (line 36)
- Modify: `PINNING.md` (1 entry)
- Modify: `electron/ui/dashboard.html` (4 refs — `openZaloUserMemory` function)
- Modify: `AGENTS.md` (any openzalo refs)
- Modify: `CLAUDE.md` (patch documentation)

- [ ] **Step 1: Update test-core.js**

All `channels?.openzalo` and `channels.openzalo` → `channels?.['modoro-zalo']` and `channels['modoro-zalo']`. Update test labels.

- [ ] **Step 2: Update tools/zalo-manage.js and tools/send-zalo-safe.js**

`cfg?.channels?.openzalo` → `cfg?.channels?.['modoro-zalo']` in all occurrences.

- [ ] **Step 3: Update RESET.bat and USER-RESET.bat**

- RESET.bat: update comments mentioning openzalo
- USER-RESET.bat line 36: `call npm uninstall -g @tuyenhx/openzalo 2>nul` — either remove (no longer needed) or keep as cleanup for legacy installs

- [ ] **Step 4: Update PINNING.md**

Replace the `@tuyenhx/openzalo` row with:
```
| `modoro-zalo` | `1.0.0` | Self-owned Zalo channel plugin (fork of @tuyenhx/openzalo@2026.3.31) | Zalo channel disabled |
```

- [ ] **Step 5: Update dashboard.html**

Rename `openZaloUserMemory` → `openModoroZaloUserMemory` (or keep as-is since it's a UI function name about "opening Zalo user memory view", not a plugin reference). Decision: keep as-is — it describes the action, not the plugin.

- [ ] **Step 6: Update AGENTS.md and CLAUDE.md**

- AGENTS.md: replace any `openzalo` plugin references
- CLAUDE.md: update patch documentation to reference `modoro-zalo` package instead of `electron/patches/openzalo-fork/`

- [ ] **Step 7: Commit**

```bash
git add electron/scripts/test-core.js tools/zalo-manage.js tools/send-zalo-safe.js RESET.bat USER-RESET.bat PINNING.md AGENTS.md CLAUDE.md
git commit -m "chore: update remaining files for modoro-zalo rename"
```

### Task 10: Delete old patch files

**Files:**
- Delete: `electron/patches/openzalo-fork/` (4 files: channel.ts, inbound.ts, send.ts, openzca.ts)
- Delete: `electron/patches/openzalo-openzca.ts` (if still exists separately)

- [ ] **Step 1: Delete old patches**

```powershell
Remove-Item -Recurse -Force electron/patches/openzalo-fork/
Remove-Item -Force electron/patches/openzalo-openzca.ts -ErrorAction SilentlyContinue
```

- [ ] **Step 2: Commit**

```bash
git add -A electron/patches/
git commit -m "chore: delete electron/patches/openzalo-fork/ (merged into packages/modoro-zalo)"
```

### Task 11: Integration test

- [ ] **Step 1: Run smoke test**

```powershell
node electron/scripts/smoke-test.js
# Expected: all checks pass with modoro-zalo references
```

- [ ] **Step 2: Verify ensureDefaultConfig migration**

```powershell
# Simulate: create a mock openclaw.json with channels.openzalo, run ensureDefaultConfig,
# verify channels["modoro-zalo"] exists and channels.openzalo is deleted
node -e "
const fs = require('fs');
const p = require('path').join(process.env.USERPROFILE, '.openclaw', 'openclaw.json');
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log('channels.openzalo:', !!cfg.channels?.openzalo);
console.log('channels[\"modoro-zalo\"]:', !!cfg.channels?.['modoro-zalo']);
console.log('plugins.entries:', Object.keys(cfg.plugins?.entries || {}));
console.log('plugins.allow:', cfg.plugins?.allow);
"
```

- [ ] **Step 3: Verify plugin installation**

```powershell
# Check that extensions/modoro-zalo exists after boot
Test-Path "$env:USERPROFILE/.openclaw/extensions/modoro-zalo/openclaw.plugin.json"
# Expected: True

# Check old extension cleaned up
Test-Path "$env:USERPROFILE/.openclaw/extensions/openzalo"
# Expected: False
```

- [ ] **Step 4: Boot app and verify gateway loads modoro-zalo channel**

Start the Electron app. Check console for:
- `[config] migrated channels.openzalo → channels["modoro-zalo"]` (first boot only)
- `[modoro-zalo] plugin installed to ...`
- NO `applyOpenzaloFork` messages
- Gateway loads and Zalo probe shows ready

- [ ] **Step 5: Verify no remaining openzalo refs (except migration code)**

```powershell
# Search entire source tree (excluding node_modules, .git, docs/)
Select-String -Path electron/main.js,electron/lib/vendor-patches.js,electron/scripts/*.js,tools/*.js -Pattern "openzalo" -CaseSensitive | Where-Object { $_.Line -notmatch "migrat" }
# Expected: 0 matches (migration code is the only allowed exception)
```
