# DEVLOG

Daily development log. Each entry records what was shipped, not how.

---

## 2026-05-30

**FB schedule: one-time dated posts (fix "7 bài đăng dồn 1 ngày")**
- Root cause: `fb-scheduled-posts.json` only modeled recurring posts (postTime + daysOfWeek → `MM HH * * *`). A multi-day plan became N recurring schedules, each firing every day → all posts dumped on the same day.
- Added optional `postDate` (YYYY-MM-DD) → date-pinned cron `MM HH DD M *`, fires exactly once (generate phase shifts to prev day on midnight-cross, handles month/year edges), past dates skipped.
- One-time schedule **auto-deletes** after its publish phase runs (any outcome) + after immediate/late approve.
- create/update endpoints validate postDate (must be today+); immediate-generate guarded to same-day only.
- Skill `facebook-post-workflow.md`: "HAI loại lịch" table; multi-day plan = N one-time schedules (never N recurring).

**FB schedule: wrong brand asset guard**
- Confirmed code does NOT fuzzy-pick (`findMediaAsset` exact-match; `loadAssets` skips on miss) — wrong-asset was an AI decision.
- Code guard: every CEO preview (normal + autoPost) now echoes `assetSummaryLine(assetNames)` — the asset filename or "(không dùng)" — so a wrong/unwanted asset is caught at the human gate (esp. scheduled posts).
- Skill hardening: default NO asset; only attach when CEO names one / sends image; exact match or ASK; confirm step echoes exact filename; scheduled posts must not auto-attach.
- Regression guard added to `smoke-test.js` (postDate cron generation). Local test `electron/scripts/test-fb-postdate.js` (gitignored).

**RAG model splash re-appeared every boot ("Một số file chưa tải được")**
- Root cause: `model-downloader.js` EXPECTED_SIZES were oversized round-number guesses (2KB/5KB/100KB/450MB). The 95% truncation guard (`isModelDownloaded`/`getMissingFiles`) flagged every COMPLETE file as truncated → re-download splash every launch; model was actually fully downloaded. The 450MB guess was the full fp32 model.onnx size, not the quantized file.
- Fix: EXPECTED_SIZES set to authoritative HF sizes at the pinned revision (17082730 / 443 / 658 / 167 / 118308185); TOTAL_SIZE auto-recomputes (~129MB). Truncation guard preserved (in fact strengthened). Smoke guard + gitignored regression test `test-model-sizes.js`.
- Follow-up (not done): boot logs "RAG model download complete" + proceeds even on a genuine partial download failure (fail-quiet) — low severity, grep fallback exists.

**Brand-asset upload "không hiện" — diagnosed, no new code**
- The installed build (May 29 18:08) predates commit a413ee5a (May 29 23:12, audience:ceo). On that build `list-brand-assets` fail-closes to 'customer' so internal brand assets are hidden → upload writes to disk but shows nothing. Already fixed in source; reproduced current-source round-trip OK. Needs rebuild.

**Rebuild as v2.4.10 (no bump, per CEO)** — replaces the deleted 2.4.10 release with the fixed artifact (FB schedule, brand-asset guard, RAG model sizes; + already-in-source audience:ceo). Version intentionally kept at 2.4.10.
- Risk: same-version NSIS install can be skipped on machines already on 2.4.10 → uninstall the old 2.4.10 (or clear Code Cache) before testing.
- Not pushed/shipped — local build only, awaiting CEO.

---

## 2026-05-28

**v2.4.10 released** (tag b126bbd9)

- GitHub Release: https://github.com/PeterBui85/9BizClaw-Premium/releases/tag/v2.4.10
- Windows EXE 144.5 MB, macOS arm64 DMG 175.4 MB, macOS x64 DMG 181.1 MB (notarized)
- Mac build run #26528258590 — both arm64 + x64 success
- Drive folder created: v2.4.10/ under release parent (binaries need manual drag-drop)

**Brain semantic linking deferred**
- Plan written: docs/superpowers/plans/2026-05-28-brain-semantic-linking.md
- Phase 1 scope: TF-IDF + Vietnamese tokenization, doc-doc/group-doc/learning-doc collectors, default hide membership-only nodes
- Not in v2.4.10. ~1 day effort.

**Guard fixes (during build)**
- check-api-doc-drift.js: skip `*-backlog.md` files (planned routes are not implementation drift)
- check-anthropic-doc-runtime.js: bsdtar needs `--force-local` on Windows for `C:\` paths

---

## 2026-05-22

**v2.4.7 committed** (7707a263, EXE 142.9 MB)

**Memory redesign**
- Dynamic budget (2K-10K chars based on AGENTS.md size)
- Type-priority with surplus flow (corrections/rules always outrank tasks)
- Notable-only cron writes (90% memory noise reduction)
- CEO observation protocol in ceo-memory-api.md (8 signal types, silent auto-learn)
- Forward trimming fix, empty state fix, task retention 14→30 days

**AGENTS.md trim (32K→28K) + v104**
- Moved 5.5K Zalo content to zalo.md with pointers
- Kept inline: escalation keywords, bot detection, firstGreeting

**Skill creation fix**
- Added `skill_builder` trigger to Capability Router
- Removed explicit headers from 6 POST calls in skill-builder.md

**ChatGPT Importer tab** — new Dashboard tab for session import

**Zalo fixes (5)**
- "Tắt tất cả" sentinel `['__NONE__']`
- Group auto-prompt on enable (0 active groups)
- /approve leak blocked (exec ban + Layer L output filter)
- Channel detection via sender ID format (≥16 digits = Zalo)
- Follow-up: 48h→24h, 9→22 PENDING_HINTS

**FB cron toggle** — `toggle-fb-schedule` IPC handler

**Product docs** — 9bizclaw-product-knowledge.md + sales-playbook.md rewrite

**Customer reports** — docs/customer-reports.md tracking process established (6 entries)

**Pending next build — file access control (3-layer defense-in-depth)**
- Layer 1: `<file-access-policy>` injection in inbound.ts + tag neutralization
- Layer 2: sensitive path blocklist + visibility check in /api/file/read
- Layer 3: AGENTS.md v105 Zalo read_file ban
- Critical scoping bug caught in code review, fixed before ship
- Known limitation: native read_file tool has no code-level interception (LLM-persuasion only)

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

2026-05-27 — v2.4.10 shipped, v2.4.11 backlog captured in docs/v2.4.11-backlog.md

---

## 2026-05-29

**Code review of pending changeset (3 blockers + 4 cleanups) — commit 8272de74**
- Model switch ninerouter/main→ninerouter/zalo moved out of pre-9Router `ensureDefaultConfig` (probe ran before 9Router/combo existed → never fired on cold boot) into `ensureZaloModelDefault()`, called post-9Router-ready in gateway.js
- Verified new config keys (`heartbeat.every`, `maxConcurrent`, `session.dmScope`) against openclaw 2026.4.14 strict schema — all legal
- `stopIdleMemoryTimer` wired into `_beforeQuitCleanup`
- Idle-memory trigger fixed to openclaw's real marker `telegram inbound:` (old `[telegram] sendMessage ok` had wrong brackets → never matched) + always-on `[session-freeze] prompt CACHE` proxy
- Removed orphan prompts (meditation-prompt.md, afternoon-nudge.md), stale `meditation` dashboard icon; added `cron_skipped` activity label

**CLI shims — openclaw / 9router / node / npm in any terminal**
- `ensureCliShims()` (electron/lib/cli-shims.js): generates shims in `userData/bin/` + prepends to user PATH, auto on every machine, no admin
- Standalone shims hardcode the bundled node absolute path → work with zero system Node (npm `.bin` shims failed without it)
- Drive/space-safe: all paths resolved at runtime from `userData` (always C: — no `app.setPath`) and quoted → D:\ install + spaces OK
- Hardened Windows PATH write: User-scope `SetEnvironmentVariable` (no setx truncation), length guard, verify-after-write, `WM_SETTINGCHANGE` broadcast; `claw-node`/`claw-npm` aliases so a system Node is never hijacked
- installer.nsh uninstall cleanup; smoke-test guard for quoting/drive-safety; 2-lens adversarial review + hardening

**3-tier document visibility audit (công khai/nội bộ/chỉ CEO) + fail-closed hardening**
- Audit (6-agent + manual): customer-facing RAG path is SAFE — private/internal docs cannot reach a Zalo customer (RAG server coerces audience to never-`ceo`, all 4 SQL paths filter `visibility IN (tiers) AND enabled=1`, Zalo audience is customer/internal-only from CEO disk config, file-read blocks non-public for non-telegram, COMMAND-BLOCK). Display label↔enum mapping consistent; upload validates enum at 2 layers.
- Fixed 5 fail-open seams → fail-closed: (1) media-library audience normalize (was fail-OPEN: audience∉{customer,internal} returned private); (2) cron-api `/api/media/*` clamp `params.audience`; (3) file-read infers visibility from folder when DB row missing (was `if (row && …)` fail-open); (4) legacy `search-documents` IPC now filters `visibility IN ('public')` (was enabled-only; IPC unused in UI); (5) `set-knowledge-visibility` made atomic — move file first, abort on move fail, roll back file on DB-write fail (was DB-first + swallowed move error → DB/folder divergence).
- Kept default visibility `public` per CEO. Added smoke-visibility guards (incl. media fail-closed behavior test) + updated media-library contract. 2-lens adversarial verify: clean.

**Internal Zalo users treated as customers (CEO bug) — behavior frame fix**
- Root cause (systematic-debugging): a Zalo user marked "Nội bộ" set `__audience='internal'` (RAG tier + file-access only), but inbound.ts injected the `[Câu hỏi khách hàng …]` customer fence UNCONDITIONALLY on all 3 paths → agent ran the sales persona. No internal-user behavior existed in AGENTS.md either.
- Fix (code-level marker > LLM-rule, mirrors gender-hint): inbound.ts hoists `__frameTag` (default customer fence) next to `__audience`; when internal, swaps to `[NGƯỜI NỘI BỘ … hành xử như đồng nghiệp nội bộ, KHÔNG bán hàng, dùng tài liệu Công khai+Nội bộ, VẪN cấm "Chỉ CEO"/đường dẫn/hồ sơ khách khác]`, used in all 3 rawBody rewrites (RAG hit/miss/catch). Customers unchanged; internal NOT escalated to CEO tier.
- Propagation: `MODORO_ZALO_FORK_VERSION` v1.0.9→v1.0.10 (re-copies inbound.ts) + AGENTS.md "Người nội bộ" section + version 108→109 (workspace.js re-seed) so the fix reaches the existing CEO install/workspace.
- Tests: 4 smoke assertions + full smoke 0/0 + module/capability contracts + inbound.ts JS-syntax check. 2-lens adversarial verify: clean.
