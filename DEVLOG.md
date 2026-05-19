# DEVLOG

Daily development log. Each entry records what was shipped, not how.

---

## 2026-05-19

**Zalo tab redesign**
- Removed sidebar, merged toggle + 4 settings into 1 compact toolbar
- Split screen: groups left + friends right, both visible simultaneously
- Fixed friend list loading bug: spinner states, 8s timeout, auto-retry + cache refresh
- Wired `onZaloCacheRefreshed` event for auto-reload

**Brain tab fixes**
- Added 3 semantic edge collectors (wikilink, co-membership, knowledge) — 648 edges (was 429)
- Fixed edge rendering: color-coded by type, scale correctly with zoom
- Fixed node click: drag-vs-click detection (5px threshold), side panel now opens
- Fixed filter chip counts (class name mismatch), toolbar overlays canvas
- Boot build now notifies UI when graph ready

**CEO Backup feature (NEW)**
- `electron/lib/backup.js` — collect from 5 sources, AES-256-GCM + scrypt encrypt, tar archive
- 4 IPC handlers + preload bridges, styled password modal in dashboard
- Concurrency guard, process restart after backup, input validation
- Smoke tests for all 6 exports

**Hermes-style memory injection (NEW)**
- `task` type in ceo_memories table — cron writes task entries after each run
- CEO-MEMORY.md content injected into AGENTS.md `<memory-context>` tags — guaranteed in system prompt
- ceo-nudge.js detects task completion in conversations, auto-writes memory
- 14-day retention trim for task entries
- Evening + morning reports read from ceo_memories (was reading empty session files)

**Cron Zalo process description leak fix**
- Prompt-level instruction for Zalo-targeted crons (DONE sentinel)
- Transport-layer `_stripZaloProcessText()` in `sendZaloTo()` — catches ALL paths
- `process-desc-vi` pattern added to Layer K (channels.js + send.ts)

**Other fixes**
- scrypt maxmem 256MB (was hitting 32MB default limit)
- Pause banner HTML fix (missing `>` on both Telegram + Zalo banners)
- Dead CSS cleanup (`.tg-sidebar`, `.zalo-col-help`)

**Brain tab UI polish**
- Search bar narrowed to 180px (was stretching full width), filter chips breathe
- Refresh button alignment fixed (flex-shrink:0)
- Node size cap 12→7, default zoom padding 60→100px — less cluttered initial view
- Hit test radius 15→20px — clicks register more reliably
- Toggle button ("Dung") in sidebar toned down (transparent bg when running)

**OpenClaw webview persist fix**
- Webview compositing ignores CSS display:none — added explicit visibility toggle in switchPage()
- Both openclaw and 9router webviews hidden when not on their page

**Tour guide system review + 6 fixes**
- CRITICAL: Telegram guide step 2 targeted `.tg-cmds` (deleted UI) — retargeted to `.tg-info-grid`
- Tooltip fallback positioning overlapped highlighted element — now forces below/above target rect
- Walkthrough early return left stale highlight — now hides + centers card
- Walkthrough not dismissed on manual page switch — added to switchPage()
- scrollIntoView smooth→instant (was racing with tooltip positioning)
- walkthroughSkip() now resets highlight/spotlight state

**Docs updated (4 files)**
- 9bizclaw-sanpham.md, 9BizClaw-Premium-Handbook.md, 9bizclaw-congty.md, 9bizclaw-support-kb.md
- "26 ky nang" hardcoded count removed (skills are dynamic)
- blocklist→allowlist across all 4 files (v2.4.4 model)
- Sidebar structure updated to current icon-rail with Brain tab
- Brain tab description added to sanpham + handbook
- Backup described as encrypted (password-protected)
- File size limit corrected in support KB

**Installer checklist spec (NEW)**
- 5-milestone remote install workflow for CSKH team
- Pre-session prep checklist (7 items customer prepares before Zoom)
- Google Sheet tracking (1 row per customer, Pass/Fail per milestone)
- Spec at docs/superpowers/specs/2026-05-19-installer-checklist-design.md

**Skills installed**
- `/zoom-out` — map unfamiliar code areas (from mattpocock/skills)
- `/improve-codebase-architecture` — find deepening opportunities (from mattpocock/skills)

**Build:** 9BizClaw Setup 2.4.4.exe — 143.5 MB

---

## 2026-05-18

**Bug fixes (14)**
- Zalo plugin regex mojibake — `\u` escapes in regex literals → `new RegExp('\\uXXXX')` ASCII-safe
- Plugin source path — check `process.resourcesPath/modoro-zalo/` before vendor fallback
- Allowlist v2 inbound + outbound — empty allowlist = allow all DMs
- `friend request` → `friend add` (openzca 0.1.57→0.1.59 CLI rename)
- Stranger AI rate limit removed (was 1/10min)
- Gateway + 9Router kill: wmic `%var%` cmd.exe expansion → PowerShell Get-CimInstance
- npm install timeout 90s→180s + `--loglevel http`
- openzca 0.1.57→0.1.59 (Zalo WS protocol fix)
- Circuit breaker in monitor.ts (8 fast fails → 5min cooldown)
- Stranger policy seed: only writes on fresh install
- Zalo auto-refresh after QR scan
- Fork version bumped to v1.0.4

**Telegram tab cleanup**
- Removed dead settings (stranger policy, group mode, history limit)
- Removed 12 example commands + 14 capability chips
- Replaced with 2 info cards (connection + config/debounce)

**Brain tab (NEW)**
- `brain-graph.js` (670 lines) — 5 node collectors, 3 edge collectors, ForceAtlas2 layout
- `brain-layout-worker.js` — standalone ForceAtlas2 worker
- `brain.js` (653 lines) — Canvas 2D renderer, zoom/pan, filter chips, search, side panel
- 3 IPC handlers + 4 preload bridges
- Boot wiring: 15s delay + 30min interval rebuild

**Vendor:** openzca 0.1.57→0.1.59

**Build:** EXE built + uploaded to Google Drive

---

## 2026-05-16

**Security**
- Removed `exec` from tools.allow — bot was self-patching AGENTS.md
- Anti-social-engineering + anti-prompt-injection hardening
- Close 2 security gaps from 100-test adversarial run
- 13 issues fixed from 8-reviewer pre-ship audit

**Facebook auto-post**
- Critical fix: approval never received (409 conflict + no routing)
- Schedule default lead 120→30min + immediate generate when near postTime
- Late approve + self-patch ban

**Features**
- Excel skill — read/edit/create .xlsx on CEO's machine
- 8 new VN SME skills (cong no, so sach, ban hang, bao gia, kich ban, tuyen dung, bao cao, cham cong)
- Prefix cache TTL extended to 1hr
- Mac unsigned build workflow

**Build:** v2.4.4 committed

---

## 2026-05-14

**User Skills system**
- `skill-manager.js` — registry CRUD, conflict detection, shipped skill awareness
- 7 skill IPC handlers + 7 preload bridges
- Dashboard Skills tab — view shipped + CRUD user skills
- Telegram skill creation via `/api/user-skills/*` HTTP endpoints
- AGENTS.md v99 — skill cooperation + creation instructions

**In-app native chat**
- `chat.js` backend — send, history, IPC
- Native chat UI replacing OpenClaw webview
- ChatGPT connect via cookie-bridge redirect

**Wizard redesign**
- 6→4 steps + sidebar frequency-based layout

---

## 2026-05-13

- Wizard 6→4 steps + sidebar frequency-based redesign
- System map regeneration for v2.4.4

---

## 2026-05-12

- Calendar dark mode — CSP font-src, FC variable overrides
- Cron API logging, splash overflow, brand assets, blocklist defaults
- Dashboard overview — replace customer list with inline memory card
- v2.4.3 — image skill templates, AGENTS.md v98 split, cron dedup
- Repo owner update + license obfuscation build step

---

## 2026-05-11

**Hermes CEO memory system**
- Hot tier CEO-MEMORY.md + cold SQLite with embeddings
- Layer K process ack filter
- FTS5 init failure no longer kills DB

**Mac build reliability**
- npm install hang fix — spawn() timeout, git shim pipe bug, Xcode CLT fallback
- git shim strips --no-replace-objects (npm 10.x compatibility)

**Performance**
- Cut 5 worst startup offenders (3-8s faster boot)
- Image prompt builder + preference persistence

**Other**
- AGENTS.md v96 — master salesman methodology
- Code-level Zalo honorific enforcement (GENDER-HINT PATCH v1)
- 10 edge case fixes from deep code review

---

## 2026-05-10

- Preflight boot verification + contract guards
- Remove redundant heartbeat cron (fast watchdog superior)
- v2.4.2 build

---

## 2026-05-09

- v2.4.1 — HEARTBEAT leak fix, codex image gen hardening
- Layer J output filter — block raw API/HTTP errors from Zalo
- Block "Gateway is restarting" from reaching Zalo
- Windows PATH case sensitivity breaks MinGit fix
- Splash cancel race fix
- v2.4.0 installer reliability — MinGit, splash hard-stop, cron dedup
