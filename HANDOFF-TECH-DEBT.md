# Tech Debt Cleanup — Handoff

**Date:** 2026-06-01
**Branch:** `tech-debt-2026`
**Worktree:** `D:\claw-td`
**Status:** Plan approved, execution not started

---

## What Was Done

8 subagents explored the codebase in parallel, assessing technical debt across all layers. Findings were synthesized into a 79-item debt inventory across 14 categories. An approved plan was designed and written.

---

## Current Codebase State

### Readable Files (confirmed)
- `electron/ui/dashboard.html` — **~12,374 lines**. Single file with: 3 inline `<script>` blocks (~9,000 lines of JS), 3 inline `<style>` blocks (~1,050 lines of CSS), 100+ `onclick=` handlers, ~30 global JS variables. Main script block starts at line 4534. External vendor scripts at lines 29-31, 12370-12372.
- `electron/ui/styles.css` — **621 lines**. Shared stylesheet for wizard + non-dashboard pages. Dark + light theme CSS variables.
- `electron/ui/brain.js` — **847 lines**. Force-directed graph renderer using d3-force, d3-zoom, d3-drag, Tween.js.
- `electron/main.js` — **1,157 lines**. Single entry point. Imports from `./lib/*`, registers IPC handlers, creates window/tray, runs async boot sequence. No domain separation.
- `electron/lib/cron.js` — **~2,913 lines**. Could NOT be fully read. Cron scheduling, `_stripProcessAcks()`, cron journal (`logs/cron-runs.jsonl`). Appends without write mutex.
- `electron/lib/cron-api.js` — **~3,448 lines**. Could NOT be fully read. All internal API routes: Zalo, Facebook, Workspace, Media, Cron, Image, Orders, Inventory, Leave, Google, Diagnostics, Health.
- `electron/lib/runtime-installer.js` — **~2,171 lines**. Runtime Node.js download/install. Error classification (14 codes), triple-path download fallback, SHA256 verification, exponential backoff retry.
- `electron/scripts/smoke-test.js` — **3,248 lines**. No test framework. Raw Node.js script using `process.exit(0/1)`. Validates vendor packages, config schema, CLI flags, patch anchors, AGENTS.md content.
- `skills/INDEX.md` — **89 lines**. Declares 39 basic skills + 6 API composites across operations/marketing/industry categories.
- `skills/anthropic-docx/SKILL.md` — **595 lines**. Verbatim Anthropic documentation.
- `skills/anthropic-xlsx/SKILL.md` — **297 lines**. Verbatim Anthropic documentation.
- `AGENTS.md` — **418 lines**. Version tag: `modoroclaw-agents-version: 110`.
- `skills/_archived/` — **82 dead skill files**.

### Non-existent (checked)
- `CHANGELOG.md` — does NOT exist
- `docs/adr/` — does NOT exist
- `electron/src/main.js` — does NOT exist
- `.test.ts` / `.test.js` files in `electron/lib/` — none found
- `docs/generated/system-map.txt` — counts MATCH `system-map.json` (not stale as originally reported; both show 143 routes, 207 IPC, 200 bridges, 18 pages)

### Package.json State
- `electron/package.json` — **NO `test` script**. Dev: `@electron/notarize`, `docx`, `electron`, `electron-builder`, `javascript-obfuscator`. Prod: `better-sqlite3@11.10.0`, `pdf-parse@1.1.1`, `@xenova/transformers`, `pptxgenjs`, `xlsx`, `mammoth`, `dompurify`, `fullcalendar`, `marked`, `node-cron`, `graphology`, `graphology-layout-forceatlas2`.
- `electron/package-lock.json` — does NOT exist. `prebuild-vendor.js` explicitly runs `npm install --no-package-lock`.
- `.github/workflows/` — **3 Mac-only workflows**: `build-mac.yml`, `build-mac-release.yml`, `build-mac-unsigned.yml`. **NO Windows CI.**

### README.md
Says **v2.4.2** — codebase is v2.4.10 (per `electron/package.json`).

### Modoro-zalo Plugin
- `electron/packages/modoro-zalo/` — npm workspace NOT declared. Build uses raw `fs.copyFileSync` from `prebuild-modoro-zalo.js`. No TypeScript compilation step. `.ts` files shipped as source.
- `.fork-version` says **1.0.14**. `package.json` says **1.0.0**. Out of sync.
- `dist/modoro-zalo/` not explicitly gitignored (root `dist/` pattern doesn't cover `electron/dist/`).
- 21 `.test.ts` files exist with good quality tests (proper mocking, cleanup, behavior-focused).

### `dist/modoro-zalo/src` Test Files
No `.test.ts` files confirmed in `dist/modoro-zalo/src/` — tests are TypeScript-only, not compiled.

---

## Technical Debt Inventory (79 items)

### CRITICAL (14)
1. Zero main-process tests (207 IPC handlers, 143 API routes, all channel logic)
2. Runtime patching as core architecture — 8 regex-based string injections into source files, any openzalo update can silently break all of them
3. Output filter triplicated across 3 files (`channels.js`, `send.ts`, `cron.js`) with non-identical content
4. Dashboard monolith: 12,374-line single file, all JS inline, ~30 global vars, 100+ onclick handlers
5. Anthropic skill verbatim copy-paste (~1,500 lines across 5 packages, references non-shipped `python scripts/` paths)
6. `cron.js` unreadable at scale (2,913 lines, could not be audited)
7. `cron-api.js` unreadable at scale (3,448 lines, could not be audited)
8. Windows build has zero CI
9. `main.js` partially unread (1,157 lines confirmed, but may have grown — may be larger than scanned)
10. Cron journal (`logs/cron-runs.jsonl`) has no write mutex — concurrent writes can interleave JSON lines
11. `seedWorkspace()` has broad `catch {}` swallowing partial failures
12. `openclaw.json.bak` rotation is opaque (handled by openclaw binary, not this codebase)
13. `license.js` could not be fully audited (175,000+ chars) — `SERVICE_KEY` location in scripts unverified
14. 46 skill files reference `scripts/` paths that don't ship in the runtime bundle

### HIGH (23)
- `cron-api.js` is 3,448 lines of linear code with no domain separation
- `channels.js` output filter triplication (Layer K patterns)
- Blocklist/pause/allowlist checked 3 different ways across 3 files
- Media send duplicated between `channels.js` and `send.ts`
- ~~3 overlapping XLSX skills (`excel.md`, `anthropic-xlsx`, `minimax-xlsx`)~~ — DONE: minimax-* deleted, anthropic-* clean
- ~~`skills/_archived/` has 82 dead skill files~~ — DONE: _archived/ deleted
- ~~README.md says v2.4.2, codebase is v2.4.10~~ — DONE: README fixed to v2.4.11 in CHANGELOG.md update
- 70 design specs with no implemented/abandoned status tracking
- No ADR directory for major architectural decisions
- 400+ untracked build artifacts + `.commit-msg.txt` staged
- 2 `versions.json` loaders with silent drift risk
- `runtime-installer.js` extraction partial-failure leaves corrupt `vendor/node/`
- `installation-recovery.js` duplicate error classification, class instantiated but not wired to actions
- `fix-better-sqlite3.js` silent `process.exit(0)` on failure, arch fallback uses host arch not target
- `model-downloader.js` size-only integrity check (95% threshold, not SHA256)
- `npm postinstall` runs in CI redundantly (CI already runs postinstall checks in dedicated steps)
- Mac CI duplicated in 3 workflows (~80% identical code)
- Mac signing silently skipped if `SIGN_AVAILABLE` env var unset
- Conflict-detector.js largely disconnected from boot flow
- Migration has no pre-flight disk space check
- Promise-chain mutex in `config.js` is not a true mutex
- Telegram botToken stored in plaintext `openclaw.json`

### MEDIUM (28)
- No JSON Schema enforced for `openclaw.json`
- Schema healer only removes keys, never adds missing required fields
- Migration loop possible if cleanup fails repeatedly
- 13 deps in electron/ with no SBOM, no automated CVE scanning
- 59 npm scripts in electron/ with no documentation
- `prebuild-vendor.js` has hand-rolled tar parser
- Heavy `if (process.platform === 'win32')` branching throughout
- Linux runtime install non-functional despite code presence
- Lark/WhatsApp channels documented as live but implementation status unclear
- AGENTS.md has 3 redundant routing tables (Skill loading, Routing, Capability Router)
- `skill-manager.js` has 100-entry dead migration lookup table
- Anthropic skills not adapted to actual runtime tooling
- Windows builds waste ~10-20 min on unused `vendor-bundle.tar`
- `dist/modoro-zalo/` is raw copy, not compiled output
- `wmic` deprecated command used in process detection
- Hardcoded magic numbers across 20+ files
- MIN_NODE_VERSION (22.14) lower than pinned version (22.22.2) — dead code
- Commented-out code in several files
- Windows ACL hardening for `openclaw.json` skipped without elevation

### LOW (14)
- License revocation Gist uses single token with no ACL
- Ed25519 revocation fails open after 24h cache expiry
- `notarize-mac.js` is dead code in CI (CI uses `xcrun notarytool` directly)
- `build:mac:universal` is blocked by `ALLOW_UNSAFE_UNIVERSAL=1` guard — dead code
- No long-term artifact storage (14-day retention)
- No project-specific Cursor rules (only generic template)
- Vendor meta `created_at` makes builds non-deterministic
- `corepack` shims removal only runs on Darwin
- `fix-artifact-name.js` silently skips files older than 10 minutes
- Smoke tests use string searches on source — brittle

---

## Approved Plan

Full plan at: `c:\Users\buitu\.cursor\plans\9bizclaw_tech_debt_cleanup_e4032d43.plan.md`

### Execution setup
```bash
# In D:\claw (not in the worktree):
git worktree add -b tech-debt-2026 D:\claw-td master

# Open D:\claw-td in a new Cursor window.
# All work happens in D:\claw-td.
# D:\claw (master) is untouched.
```

### Phase 1 — Foundation (no test infra needed, run in any order)
| # | Sub-project | What |
|---|---|---|
| A5 | Test infrastructure | Add `npm test` to `electron/package.json`, create `electron/tests/` with 5 test files using Node.js built-in `node:test` |
| H1 | Windows CI | New `.github/workflows/build-win.yml` — `npm install` + `npm test` + `npm run build:win` |
| E | Docs foundation | ~~Create `CHANGELOG.md`, fix README.md version~~ — DONE in v2.4.11: CHANGELOG.md created, README fixed to v2.4.11, 5 ADRs in docs/adr/, system-map regenerated |
| F | Security audit | Verify `SERVICE_KEY` is env-var, add `.env.example`, audit all token storage |
| D | Skills cleanup | ~~Delete 3 `minimax-*` broken skills + `_archived/`~~ — DONE: minimax-{docx,pdf,xlsx} + _archived deleted. Anthropic skills audited clean. |
| H2 | Git hygiene | Add `electron/dist/` to `.gitignore`, commit `.commit-msg.txt` |
| H3 | Tooling hygiene | Add `package-lock.json` to electron/, skip `vendor-bundle.tar` on Windows, document MIN_NODE_VERSION mismatch |

### Phase 2 — Structural (after `npm test` runs, before high-risk refactors)
| # | Sub-project | What |
|---|---|---|
| H | Dashboard split | Extract inline JS → `electron/ui/js/` (5 files), inline CSS → `styles.css`, event delegation, state object, replace `alert()` with toast |
| I | Plugin workspace | Add npm workspaces, sync `.fork-version` to `package.json`, add `tsc --noEmit` to CI |
| J | Core code audit | Fully read `cron.js`, `cron-api.js`, `main.js`; document all global state and async ops; add `// SAFETY:` comments |

### Phase 3 — High-Risk Refactors (after Phase 2 stable)
| # | Sub-project | What |
|---|---|---|
| K | Runtime patch elimination | Create `electron/lib/patches/output-filter.js` as single source of truth; update `channels.js`, `send.ts`, `cron.js` to import from it; convert 8 string-injection patches into `registerPatches()` functions |
| L | Build polish | Consolidate 3 Mac workflows into 1 parameterized; add SBOM generation; remove dead `notarize-mac.js`; validate `vendor-meta.json` freshness |

### PR
Single PR from `tech-debt-2026` → `master` after all phases complete.

---

## Constraints

- **Test framework:** Node.js built-in `node:test` (matches modoro-zalo's existing approach)
- **Smoke tests:** Keep as build-time guards in `smoke-test.js`; new tests go in `electron/tests/`
- **New CI workflow:** Extend existing `build-mac.yml` pattern, don't replace `build-win.js`
- **PR strategy:** Single PR at the end, not rolling per phase
- **Dashboard refactor:** No UI redesign — only extraction and organization. Keep all functionality identical.

---

## What Was Not Explored (Known Gaps)

1. **`electron/lib/license.js`** — Could not be fully read (175,000+ chars). Full audit needed.
2. **`electron/lib/cron.js`** — Could not be fully read (~2,913 lines). Full audit needed.
3. **`electron/lib/cron-api.js`** — Could not be fully read (~3,448 lines). Full audit needed.
4. **`electron/main.js`** — Line count confirmed at 1,157 but file may have grown since scan.
5. **Sub-agent `7d3e669c`** (Skills System) — Hit rate limit and did not complete. Skills debt assessment is based on partial data.
6. **`electron/lib/workspace.js`** — Mentioned in debt report but not fully explored in sub-agents. Contains `seedWorkspace()`, `getWorkspace()`, `initFileLogger()`.

---

## Sub-agent Transcripts

Full transcripts of the 7 completed sub-agents are available at:
`C:\Users\buitu\.cursor\projects\d-claw\agent-transcripts\3ca5c4e8-7e4c-4e8f-814a-c46afd780a53\subagents\`

Completed sub-agents (7 of 8):
- `21e80e72` — Channel Integrations
- `d55e5152` — Dashboard UI
- `25716a05` — Skills System
- `15a26442` — modoro-zalo plugin
- `2a15e87f` — Build System
- `2cdbca13` — Test Coverage
- `7d4b4b16` — Electron/main.js + lib

Failed sub-agent:
- `7d3e669c` — Skills System (rate-limited)
