# ADR-001: Pure Runtime Install

**Date:** 2026-04-01
**Status:** Accepted

## Context

The installer shipped Node.js + npm packages bundled (~300 MB). This caused:
- Large DMG/EXE sizes (~300 MB)
- ABI mismatch between bundled Node and Electron version
- No way to update Node or packages without rebuilding the app
- CI had to build and ship platform-specific binaries for every Node version

## Decision

**Pure runtime model**: The installer ships only the `modoro-zalo` plugin (~2 MB). On first launch, a splash screen downloads:
- Node.js v22.22.2 (~20 MB)
- npm packages: openclaw, openzca, 9router, docx, pptxgenjs, xlsx, pdfkit (~145 MB)
- MinGit (~30 MB)
- gogcli v0.13.0 (~5 MB)
- Python 3.11.9 embed (amd64) (~15 MB)
- Total first-launch download: ~170 MB
- Installed app size: DMG ~140 MB, EXE ~50-80 MB

Files downloaded to `userData/vendor/`.

## Consequences

**Positive:**
- App size reduced ~60%
- Node/packages can be updated independently of app version
- ABI mismatch resolved: `better-sqlite3` rebuilds against correct Electron headers
- Developer machine doesn't need matching Node version to build

**Negative:**
- First-launch takes 2-5 minutes (vs ~30s before)
- Requires internet connection on first run
- `prebuild-vendor.js` no longer ships vendor-bundle.tar in the installer (only in dev tar builds)
- Windows builds take 10-20 minutes longer (npm install runs in CI, not bundled)

## Implementation

- `runtime-installer.js` handles download/verify/install of all runtime components
- `conflict-detector.js` detects existing Node installations and offers guidance
- `boot.js:getBundledVendorDir()` returns `null` on pure-runtime builds (triggers installer)
- `electron-builder.yml` extraResources ships only `modoro-zalo` plugin
