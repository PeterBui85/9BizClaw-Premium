# 9BizClaw — project guide for Claude Code

Electron desktop app for Vietnamese SME CEOs. The CEO controls the bot via Telegram; the bot serves customers via Zalo (and Facebook). AI runs through an embedded OpenClaw gateway + 9Router + a local Cron API.

- **Coding rules** live in global `~/.claude/CLAUDE.md` (12-rule template) + `~/.claude/karpathy-doctrine.md` — not repeated here.
- **Detailed bug post-mortems, license-system reference, changelog:** `docs/fix-history.md` (NOT auto-loaded — read on demand when working in that area).

## Architecture — pure runtime install (v2.4.0+)
- Installer ships only the `modoro-zalo` plugin (~2 MB). On first launch a splash screen downloads Node v22 + npm packages (~145 MB) + gogcli into `userData/vendor/`. EXE ~50-80 MB, DMG ~140 MB.
- RAG model (~129 MB, multilingual-e5-small) is lazy-downloaded when the Knowledge tab opens.
- `boot.js:getBundledVendorDir()` → `userData/vendor/` once installed, else `null` (triggers the installer). `ensureVendorExtracted()` is a no-op stub (pure runtime).
- **Build:** `npm run build:win` (= `scripts/build-win.js`: prebuild → generate-system-map → smoke → obfuscate → electron-builder → restore → fix-artifact-name → bundle-check). NSIS `oneClick:true` — reinstalling the **same version always overwrites** (no uninstall needed).
- **Key files:** `electron/main.js` (boot, plugin patches, IPC, channels), `electron/lib/{runtime-installer,migration,model-downloader,channels,cron,knowledge,license}.js`, `electron/ui/dashboard.html` (~12k lines — always Grep + offset-read, never full-read).
- **Ports:** gateway 18789, 9Router 20128, local Cron API 20200.

## Plugin-patch model
The app re-injects its fixes into the OpenClaw/OpenZalo plugins on every `startOpenClaw()` via `ensure*Fix()` functions in `main.js`, using idempotent string markers in `~/.openclaw/extensions/.../inbound.ts` (plus the `modoro-zalo` fork copied from `electron/packages/modoro-zalo/`). When you change a patch, bump its marker version; when you edit the fork source, bump `MODORO_ZALO_FORK_VERSION`.

## Live invariants — do NOT re-break these
- **openclaw.json:** write only via `writeOpenClawConfigIfChanged()` (in-process, byte-equal). NEVER edit it with PowerShell (UTF-16 BOM corruption), and NEVER `openclaw config set channels.*` via CLI — an external write triggers a gateway restart mid-reply. `ensureDefaultConfig()` heals it every boot.
- **blockStreaming:** keep `false` per-channel (`channels.openzalo`, `channels.telegram`). NEVER set `agents.defaults.blockStreaming` — the schema rejects it; `ensureDefaultConfig()` deletes it.
- **Telegram:** NEVER add a 2nd `getUpdates` poller (409 Conflict drops messages). The gateway already polls; route commands gateway → AGENTS.md → `web_fetch` → internal API.
- **Output filter:** block patterns are mirrored in `electron/lib/channels.js` (`_outputFilterPatterns`) AND `electron/packages/modoro-zalo/src/send.ts` (`__ofBlockPatterns`). Edit BOTH.
- **Zalo security:** `cron`/`process`/`read`/`write` are BANNED from `tools.allow`; Zalo admin commands are rewritten away at code level in inbound.ts COMMAND-BLOCK before reaching the agent. Don't add banned tools to `tools.allow`.
- **Spawns:** resolve node via `findNodeBin()` (absolute path) and use `shell:false` for any prompt containing newlines — `shell:true` + a newline arg truncates on cmd.exe.
- **Pinned deps:** `pdf-parse@1.1.1` (2.x needs DOMMatrix, absent in Electron main). `better-sqlite3` is pinned to Electron's ABI — `npm run smoke` runs under system node, so it logs a *harmless* `NODE_MODULE_VERSION` mismatch; the packaged app uses the correct binary.
- **openclaw schema drift:** `healOpenClawConfigInline()` parses `Unrecognized key` errors from stderr and deletes them — self-heals future schema breaks on first failure.

## FB schedule (v2.4.4)
- Default lead 60 min; a schedule created close to post-time generates the preview immediately.
- Approval: CEO replies "fb ok" → AI agent calls `POST /api/fb/schedule/telegram-command {text:"ok"}`. Late approval still publishes (skipped → approved → publish).
- The `_peekTelegramUpdates` poller is DISABLED — routing goes through AGENTS.md (see the Telegram invariant above).
