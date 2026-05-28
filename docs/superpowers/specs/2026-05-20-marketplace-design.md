# MODOROClaw Marketplace — Design Spec

**Date**: 2026-05-20
**Status**: Draft
**Author**: MODORO team

## Overview

A marketplace where MODOROClaw users browse, purchase, and install **skills** (single capabilities) and **agents** (full workspace configurations) directly from the app or web. Web catalog for discovery/marketing, embedded in the Electron app via webview for seamless install.

**Business model**: Marketplace is an upsell menu for enterprise clients. Base app = 6M VND, custom packages up to 250M VND with additional skills, agents, and workflows. Phase 1: MODORO creates all content. Phase 2: approved partners can publish.

## Architecture Overview

```
[Web Catalog (Next.js SSG)]  ──hosted on──>  [Vercel]
        |                                        |
   [webview embed]                        [CDN: .clawpkg files]
        |                                        |
[Electron App: Marketplace tab]  ──download──>  [Install Engine]
        |                                        |
   [IPC bridge]                           [workspace/user-skills/]
        |
[marketplace-installer.js]
```

Three independent subsystems:
1. **Web Catalog** — Next.js SSG site, browsable on web and embedded in app
2. **Package Format** — `.clawpkg` zip standard for distributing skills and agents
3. **Install Engine** — Electron-side module that downloads, validates, and installs packages

## 1. Package Format (`.clawpkg`)

A `.clawpkg` is a zip archive containing a `manifest.json` and content files.

### Skill Package Structure

```
zalo-auto-reply-faq/
  manifest.json
  skill.md            # skill content (markdown)
  icon.png            # 256x256, marketplace listing
  screenshots/        # optional demo images
```

### Agent Package Structure

```
restaurant-bot/
  manifest.json
  workspace/
    AGENTS.md          # personality + rules
    skills/            # bundled skill .md files
    knowledge/         # knowledge templates (category folders + index.md stubs)
    schedules.json     # default cron schedule
    brand.json         # tone, language, constraints
    zalo-reply-rules.md  # optional: channel-specific rules
  icon.png
  screenshots/
```

### Manifest Schema

```json
{
  "id": "string (kebab-case, globally unique)",
  "type": "skill | agent",
  "name": "string (Vietnamese display name)",
  "version": "semver string",
  "description": "string (1-2 sentences)",
  "longDescription": "string (markdown, for detail page)",
  "category": "string (enum: customer-service, marketing, operations, sales, hr, finance, custom)",
  "industry": "string (optional, for agents: restaurant, retail, clinic, ...)",
  "author": "string",
  "authorType": "modoro | partner",
  "appliesTo": ["zalo", "telegram"],
  "price": {
    "type": "included | addon",
    "vnd": 0
  },
  "requires": {
    "minAppVersion": "semver string",
    "dependencies": ["other-package-id"]
  },
  "installTarget": "user-skills | workspace",
  "signature": "base64 Ed25519 signature of manifest+content hash",
  "checksum": "sha256 of zip contents"
}
```

### Size Limits

- Skill package: max 10 MB
- Agent package: max 50 MB
- Install engine rejects packages exceeding these limits before extraction.

### Signing

Packages signed with MODORO's Ed25519 private key (reuses the same key pair as the license system, but the signing operation is different — license signs JSON payloads, marketplace signs file content).

**What is signed**: The `signature` field is computed over a **canonical content hash**:
1. Serialize manifest JSON with `signature` and `checksum` fields removed, keys sorted alphabetically, no whitespace (`JSON.stringify(manifest, Object.keys(manifest).filter(k => k !== 'signature' && k !== 'checksum').sort())`)
2. For each content file in the zip (sorted by path), compute SHA-256 of file bytes
3. Concatenate: `manifest_canonical + "\n" + file1_path + ":" + file1_sha256 + "\n" + file2_path + ":" + file2_sha256 + ...`
4. SHA-256 the concatenated string → this is the **content hash**
5. Ed25519-sign the content hash with MODORO private key → base64 → `signature` field

The `checksum` field is the SHA-256 of the final zip file bytes (computed AFTER signing, independent of signature).

**Verification**: Install engine reconstructs the content hash from extracted files, verifies Ed25519 signature against MODORO public key. Reject if mismatch. Partner packages co-signed by MODORO after review.

## 2. Web Catalog

### Tech Stack

- **Framework**: Next.js 15 (App Router, Static Site Generation)
- **Content**: MDX files in `catalog/` directory (one folder per package)
- **Hosting**: Vercel (free tier sufficient for phase 1)
- **Search**: Client-side via Fuse.js (catalog < 100 items in phase 1)
- **Styling**: Tailwind CSS, premium aesthetic (Linear/Stripe quality, no emojis)
- **Language**: Vietnamese-first, UTF-8

### Catalog Source Structure

```
catalog/
  skills/
    zalo-auto-reply-faq/
      page.mdx           # rich description for web
      manifest.json       # same manifest shipped in .clawpkg
      icon.png
      screenshots/
  agents/
    restaurant-bot/
      page.mdx
      manifest.json
      icon.png
      screenshots/
      workspace/          # actual workspace template files
```

### Generated Artifacts

Build script (`scripts/catalog-build.js`) produces:
- `catalog.json` — full index of all packages with metadata (served as static asset)
- `*.clawpkg` — zip archives uploaded to CDN
- Static Next.js site deployed to Vercel

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing: hero + featured items + category grid |
| `/skills` | Browse skills, filter by category/channel |
| `/agents` | Browse agents, filter by industry |
| `/skills/[id]` | Skill detail: description, screenshots, price, install button |
| `/agents/[id]` | Agent detail: description, screenshots, included skills, price, install button |

### Install Button Behavior

The install button detects its context:

**In webview (Electron app)**:
```js
// Web catalog sends via IPC (webview uses ipc-message, not postMessage)
if (window.__claw_bridge) {
  window.__claw_bridge.requestInstall({
    packageId: 'zalo-auto-reply-faq',
    packageType: 'skill',
    version: '1.0.0',
    downloadUrl: 'https://cdn.clawhub.ai/pkg/zalo-auto-reply-faq-1.0.0.clawpkg'
  });
} else {
  // Browser context: show "Open in MODOROClaw app" message with download link
  showOpenInAppPrompt();
}
```

**`__claw_bridge`** is injected by the Electron webview's preload script via `contextBridge.exposeInMainWorld()`. Presence = running inside app. Absence = running in standalone browser → show download/open-app prompt instead of deep link (deep link deferred to Phase 2).

### Installed State Sync

On webview load, Electron injects installed package list via a dedicated preload script.

**Preload script** (`electron/lib/marketplace-preload.js`):
```js
const { contextBridge, ipcRenderer } = require('electron');
// contextBridge ensures no Node APIs leak to the remote page
contextBridge.exposeInMainWorld('__claw_bridge', {
  getInstalledPackages: () => ipcRenderer.invoke('marketplace-get-installed'),
  requestInstall: (pkg) => ipcRenderer.sendToHost('marketplace-install', pkg),
  onInstallResult: (cb) => {
    ipcRenderer.on('marketplace-install-result', (_, r) => cb(r));
    return () => ipcRenderer.removeAllListeners('marketplace-install-result');
  }
});
```

**Webview preload resolution**: The `<webview>` tag's `preload` attribute requires a `file://` URI pointing to an absolute path. At runtime, resolve via `path.join(app.getAppPath(), 'electron/lib/marketplace-preload.js')`. In ASAR-packaged builds, this file must be listed in `electron-builder`'s `asarUnpack` config (preload scripts cannot run from inside ASAR).

Web catalog queries `__claw_bridge.getInstalledPackages()` on load → renders "Installed v1.0.0" or "Update to v1.1.0" badges.

## 3. Electron App Integration

### New Dashboard Tab: "Marketplace"

Add `page-marketplace` tab in `dashboard.html`. The webview is created dynamically in JS (same pattern as existing 9Router/OpenClaw embeds) to resolve the preload path at runtime:

```js
function createMarketplaceWebview() {
  const wv = document.createElement('webview');
  wv.id = 'marketplace-webview';
  wv.setAttribute('partition', 'persist:embed-marketplace');
  wv.setAttribute('preload', 'file://' + window.claw.getMarketplacePreloadPath());
  wv.setAttribute('src', 'https://marketplace.clawhub.ai/');
  wv.className = 'embed-frame';
  document.getElementById('page-marketplace').appendChild(wv);
}
```

`getMarketplacePreloadPath()` exposed via preload bridge → resolves to absolute path of `marketplace-preload.js`.

### Webview Session

Register `persist:embed-marketplace` session in `installEmbedHeaderStripper()` for CORS handling (same pattern as 9Router/OpenClaw embeds).

### IPC Handlers (main process)

| Handler | Purpose |
|---------|---------|
| `marketplace-get-installed` | Returns `installed-packages.json` content |
| `marketplace-install` | Triggers download + validate + install flow |
| `marketplace-uninstall` | Removes package files, deregisters |
| `marketplace-check-updates` | Fetches `catalog.json`, compares versions |

### Deep Link Protocol (Phase 2 — deferred)

Not needed for Phase 1: all installs happen through the embedded webview bridge. Deep link (`claw://install?pkg=<id>&v=<version>`) is a Phase 2 feature for when users browse the web catalog in a standalone browser and want to trigger app install. Requires OS-level protocol registration (electron-builder nsis config on Windows, Info.plist on Mac) and is out of scope for initial release.

## 4. Install Engine

New module: `electron/lib/marketplace-installer.js`

### Install Flow

```
downloadPackage(url)
  → validateSignature(zipPath, publicKey)
  → extractToTemp(zipPath)
  → validateManifest(manifest)
  → checkCompatibility(manifest.requires)
  → installByType(type, extractedDir)
  → updateInstalledRegistry(manifest)
  → notifyWebview(result)
```

### Skill Install

1. Copy `skill.md` to `{workspace}/user-skills/{id}/skill.md`
2. Write `manifest.json` alongside
3. Register in `user-skills/_registry.json` via `skill-manager.js` APIs
4. Skill immediately available to agent on next message

### Agent Install

Agent install creates a **named profile**, NOT merging into existing workspace:

1. Create `{workspace}/profiles/{id}/` directory
2. Copy `workspace/` contents (AGENTS.md, skills/, knowledge/, schedules.json, brand.json) into profile dir
3. Register profile in `{workspace}/profiles/_index.json`:
   ```json
   {
     "profiles": [
       { "id": "restaurant-bot", "name": "Bot Nhà hàng", "installedAt": "...", "active": false }
     ],
     "activeProfile": null
   }
   ```

**Activation flow** (user triggers from Dashboard Marketplace tab → "Activate" button):
1. If another profile is active → deactivate first (step below)
2. Back up current workspace state: copy `AGENTS.md` → `AGENTS.md.backup`, `schedules.json` → `schedules.json.backup`
3. Copy profile's `AGENTS.md` → workspace `AGENTS.md` (full replace)
4. Copy profile's `skills/*.md` → workspace `user-skills/` (additive, no overwrite of existing)
5. Merge profile's `schedules.json` into workspace `schedules.json` (additive)
6. Seed profile's `knowledge/` templates into workspace `knowledge/` (additive, don't overwrite existing files)
7. Update `_index.json`: set `activeProfile: "restaurant-bot"`, mark profile `active: true`
8. Call `ensureDefaultConfig()` to heal any config drift

**Deactivation flow** (user triggers "Deactivate" or switches profile):
1. Restore `AGENTS.md.backup` → `AGENTS.md` (if backup exists)
2. Restore `schedules.json.backup` → `schedules.json` (if backup exists)
3. Skills added from profile remain in `user-skills/` (user can manually remove)
4. Update `_index.json`: clear `activeProfile`, mark profile `active: false`

**Interaction with `ensureDefaultConfig()`**: The boot-time config healer reads `AGENTS.md` but does not overwrite it (it only patches `openclaw.json`). An activated profile's `AGENTS.md` is stable across restarts.

Rationale: AGENTS.md is already 24K chars and at limit. Merging another agent's rules would exceed the 20K context budget. Profiles keep agents isolated and switchable.

### Uninstall

- Skill: remove `user-skills/{id}/`, deregister from `_registry.json`
- Agent: remove `profiles/{id}/`, deregister from `_index.json`
- Update `installed-packages.json`

### Update Detection

On app startup (or when Marketplace tab opened): fetch `catalog.json` from CDN, compare versions against `installed-packages.json`. If newer version exists → badge on Marketplace tab icon + "Update available" in package listing.

### Installed Packages Registry

`{workspace}/installed-packages.json`:
```json
{
  "packages": [
    {
      "id": "zalo-auto-reply-faq",
      "type": "skill",
      "version": "1.0.0",
      "installedAt": "2026-05-20T10:30:00Z",
      "manifestHash": "sha256:..."
    }
  ]
}
```

## 5. Offline Handling

- **Marketplace tab offline**: Electron listens for webview `did-fail-load` event → replaces webview content with local fallback HTML: "Marketplace cần kết nối internet. Các gói đã cài hoạt động bình thường offline." No service worker needed for Phase 1 (SSG pages are fast to load anyway; offline caching is a Phase 2 optimization).
- **Installed packages**: Fully offline. All files local in workspace.
- **catalog.json cache**: App caches last-fetched `catalog.json` in `{workspace}/.marketplace-cache/catalog.json` for update badge even when briefly offline.

## 6. Security

| Threat | Mitigation |
|--------|------------|
| Tampered package | Ed25519 signature verification before extract |
| Man-in-middle download | HTTPS + SHA-256 checksum in catalog.json |
| Malicious skill content | Skills are markdown (no executable code). Agent configs are JSON/MD only. `brand.json` schema is validated against a strict allowlist of keys (tone, language, constraints — all string values, no code interpolation). `schedules.json` validated against existing cron schema. |
| Unauthorized partner publish | All packages co-signed by MODORO key. Partners cannot self-publish. |
| Package replaces system files | Install engine validates `installTarget` — only writes to `user-skills/` or `profiles/`. Path traversal checks on zip extraction. |

## 7. Build & Publish Pipeline

For MODORO team (phase 1):

```bash
# 1. Author skill/agent in catalog/ directory
# 2. Full release (validate + build + sign + publish in one command)
npm run catalog:release  # runs: validate manifests → zip .clawpkg → sign → upload CDN → deploy Vercel
# Individual steps available for debugging:
npm run catalog:build    # validate manifests, zip .clawpkg, generate catalog.json
npm run catalog:sign     # signs each .clawpkg with MODORO private key
npm run catalog:publish  # upload .clawpkg to CDN + deploy Next.js to Vercel
```

### Partner Flow (phase 2, future)

1. Partner submits package via PR to catalog repo (or web upload form)
2. MODORO reviews: content quality, security, no conflicts
3. MODORO co-signs package
4. Merge + publish

## 8. Future Considerations (not in scope)

- **User accounts / purchase flow**: When monetization needed, add Supabase auth + payment gateway
- **Reviews / ratings**: User feedback on packages
- **Analytics**: Install counts, popular packages
- **Multi-workspace**: Multiple active agent profiles simultaneously
- **Auto-update**: Background package updates (currently manual check)
- **Telegram install**: "Install X" command via chat

## 9. File Map

### New Files

| File | Purpose |
|------|---------|
| `electron/lib/marketplace-installer.js` | Download, validate, install/uninstall packages |
| `electron/lib/marketplace-preload.js` | Webview preload: exposes `__claw_bridge` |
| `catalog/` (new repo or subdirectory) | Package source: MDX + manifests |
| `scripts/catalog-build.js` | Build pipeline: validate, zip, generate catalog.json |
| `scripts/catalog-sign.js` | Sign packages with Ed25519 key |
| `scripts/catalog-publish.js` | Upload to CDN + deploy |

### Modified Files

| File | Change |
|------|--------|
| `electron/ui/dashboard.html` | Add Marketplace tab (webview embed) |
| `electron/lib/dashboard-ipc.js` | Add marketplace IPC handlers |
| `electron/preload.js` | Add `getMarketplacePreloadPath()` bridge |
| `electron/main.js` | Add `persist:embed-marketplace` to header stripper, marketplace IPC message routing |
| `electron/lib/workspace.js` | Add `profiles/` directory to workspace seed |

## 10. Success Criteria

1. User opens Marketplace tab → sees catalog with skill/agent listings (Vietnamese)
2. User clicks "Install" on a skill → skill appears in bot's available skills within 5 seconds
3. User clicks "Install" on an agent → profile created, user can activate it
4. Installed packages survive app restart
5. Package with invalid signature is rejected with clear error message
6. Marketplace tab shows "Installed" badge for already-installed packages
7. Works offline for installed packages; graceful offline message for marketplace browsing
