# Changelog

All notable changes to 9BizClaw are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.4.11] — 2026-06-01

### Changed
- **AGENTS.md trim**: Reduced from ~35k chars to ~30k chars by moving task-specific detail into on-demand skill files. CEO-memory budget increased from 2,000 chars floor to 4,756 chars.
- Skills updated: `document-creation.md` (new), `zalo.md` (internal-person section added), `image-generation.md` (image return rules added).

### Added
- **Premium onboarding 7-day nudge**: New CEO guidance sequence starts after wizard setup. Each day 1-7 at 10:00 AM (if active), bot sends Telegram tip tailored to setup state. Tracks `onboarding-state.json`.
- Brand assets upload flow wired into Dashboard.

### Fixed
- Vendor bundle duplicate function declarations on cold rebuild (vendor-bundle.tar regenerated clean).

---

## [2.4.10] — 2026-05-31

### Fixed
- Mac crash loop: openclaw Launch Agent restart triggering SIGUSR1 watchdog loop.
- Auto-update UX refactor: clearer state management for update downloads.
- System-map regenerated with accurate IPC route and page counts.

---

## [2.4.4] — 2026-05

### Added
- Zalo DM gating uses allowlist model (`zalo-allowlist.json`) instead of blocklist.
- Facebook schedule architecture: CEO approves via `fb ok` command routed through AGENTS.md.
- Dashboard cron delete for OpenClaw-sourced crons.

---

## [2.4.0] — 2026-04

### Added
- **Pure runtime install**: No bundled Node.js in installer. Downloads Node v22.22.2 + npm packages (~165 MB) on first launch into `userData/vendor/`. DMG ~140 MB, EXE ~50-80 MB.
- **License system v2**: Ed25519 offline-signed keys, hardware lock (HMAC seal), revocation via GitHub Gist.
- Dashboard redesign: Overview page with greeting, activity feed, upcoming cron, CEO alerts.
- Mac App Nap prevention via `powerSaveBlocker`.
- Path B cron reliability v3: 6-layer defense (findNodeBin, spawnOpenClawSafe, gateway spawn, schema healer, chatId recovery, boot ordering).

### Fixed
- Bot reply latency 2-3 minutes after startup (9Router cold-start race).
- `maybeBuild9BizClawWebFetchHeaders` duplicate declarations from patched vendor bundle.
- 9Router better-sqlite3 arch mismatch on Mac arm64.
- 9Router default password (`123456`) login via `<webview>` session fix.
- Block streaming disabled per-channel (Telegram + Zalo).
- `blockStreaming` schema key removed (openclaw 2026.4.x renamed to `blockStreamingDefault`).
- DELIVER-COALESCE v4 with reliable split fix and group error surfacing.
- OpenZalo blocklist patch injected via `ensureZaloBlocklistFix()`.
- OpenZalo force-one-message fix with v4 marker upgrade path.
- Zalo system message code-level filter (9 Vietnamese patterns).
- Bot-vs-bot detection in AGENTS.md.
- First-greeting idempotency hardening.
- Cron self-test proactive CEO alert on failure.
- Corrupt pause file fails closed.
- Output filter false positive: diacritic threshold raised from 40 to 200 chars.
- Follow-up queue IPC write race fix.
- Zalo long message split (multi-chunk at paragraph/sentence/word boundary).
- Zalo memory file size cap (50 KB per-customer).
- Memory directories seeded on fresh install.
- `sendCeoAlert` last-resort disk log on Telegram failure.
- Per-sender dedup guard for Zalo double-delivery.
- `ensureDefaultConfig` write error surfaced to `config-errors.log`.
- 9router better-sqlite3 runtime auto-fix + wizard log link.

### Changed
- Boot sequence: `start9Router()` moved before patches + memory rebuild for parallel warmup.
- Pre-warm OAuth ping fired during boot to reduce first-reply latency.
- Cron heartbeat: 15s timeout, 2 consecutive failures required, reads schedule `time` field.

---

## [2.3.49] — 2026-03

### Added
- Zalo escalation auto-forward to CEO via `escalation-queue.jsonl`.
- SECURITY: Zalo channel admin command isolation — 8 admin patterns blocked at input level, `cron/exec` removed from tools.allow, rotating auth token for Cron API.

---

## [2.2.9]

### Added
- Dashboard Tổng quan redesign: greeting hero, activity feed, upcoming cron, CEO alerts.

---

## [2.2.8]

### Fixed
- OpenClaw webview blocked by X-Frame-Options — stripper now attached to all 3 sessions (default + 2 partition sessions).
