# Pack License & Auto-Update — Stub Spec

**Status:** STUB — full design pending. Spec defers detailed design until Pack Platform v0 ships, because licensing hooks attach to the platform's pack loader.

**Created:** 2026-05-28
**Depends on:** [`2026-05-28-pack-platform-v0-design.md`](2026-05-28-pack-platform-v0-design.md)
**Sequenced as:** spec #2 of 3 in the Nha Khoa workflow pack decomposition (see [umbrella](2026-05-28-nha-khoa-workflow-pack-design.md))

## Scope

Adds two cross-cutting capabilities to the Pack Platform once v0 ships:

### 1. Per-pack Ed25519 license

Each paid pack ships with a license key tied to the pack's `id` plus the customer's hardware fingerprint. Mirrors the existing app license system (`electron/lib/license.js`) so revocation, hardware seal, and verification logic stay consistent.

**Key shape:** `CLAW-PACK-<base64url(payload_json + 64-byte Ed25519 signature)>`

**Payload fields:**
- `packId` — must match the pack's manifest `id`
- `e` — customer email
- `i` — issue date (YYYY-MM-DD)
- `v` — expiry date (YYYY-MM-DD)
- `m` — (optional) pre-bound machine fingerprint

**Storage:** `%APPDATA%/9bizclaw/packs/<packId>/license.json` (NOT inside the pack folder — packs are replaceable; license must survive auto-update).

**Hardware seal:** HMAC over `(key + storedMachineId + activatedAt + email + packId)`. Identical algorithm to `electron/lib/license.js:verifySeal()` so the same hardware-binding guarantees apply.

**Revocation:** Reuses the shared `~/.claw-license-revoked.jsonl` + GitHub Gist (`huybt-peter/raw/revoked-keys.json`) infrastructure. Pack license hashes added to same list; pack loader checks Gist on the same 24h cache as app license.

**Pack loader integration point:** In Platform v0 §11.1 `electron/lib/pack-loader.js`, the `loadPack(packDir)` step rejects load if `banQuyen.canLicense === true` AND no valid license is found. Rejected packs do NOT register slash commands or flow triggers; they appear in the Workflows tab marked "Cần kích hoạt giấy phép" with an activation form.

**Activation UI:** New tab in Dashboard "Gói tính năng" lists installed packs + activation status; per-pack "Kích hoạt" button paste-prompt → calls IPC `activate-pack-license(packId, key)` → writes seal file → reloads pack.

### 2. Daily pack auto-update

Cron job at `03:00` local time checks for new versions of installed packs and downloads/swaps them in place.

**Update source:** Single signed manifest URL per pack, declared in the pack's `pack.json` as `tienIch.urlCapNhat`. Manifest contains: latest version, download URL (`.tar.gz` or `.zip`), SHA-256 hash, Ed25519 signature over `(packId + version + sha256)`.

**Update flow:**
1. For each installed pack, fetch its `urlCapNhat`
2. If `manifest.version > installed.phienBan` AND signature verifies AND license still valid:
   - Download to `%APPDATA%/9bizclaw/packs/<packId>.update.tmp/`
   - Verify SHA-256
   - Re-run Mustache render to `<packId>.update.rendered/`
   - Run install validator (same as fresh install: manifest schema, slot validators, SOP size budget)
   - On success: atomic swap (see below)
3. On any failure: leave existing pack untouched, log to `logs/pack-update.jsonl`, alert CEO via Telegram if 3 consecutive failures.

**Windows-safe atomic swap:**
- Cannot `fs.renameSync(active, backup)` if any handle is open inside `active/`
- Sequence: stop Zalo gateway → `rename active → backup-{timestamp}` → `rename update.rendered → active` → start Zalo gateway → on next-boot success, prune backups older than 7 days
- If rename fails on Windows due to file lock: retry 3× with 1s delay, then fall back to copy-then-delete (slower but reliable)
- Gateway downtime: ~3-5 seconds per pack updated; updates run sequentially, not parallel

**Migration safety:** Update manifest may include `migrate.js` script run with VM sandbox (same constraints as pack hooks per Platform v0 §8.2) — given `oldVersion`, `newVersion`, paths to old and new pack folders, and tenant state. Migration runs AFTER render but BEFORE swap; failure aborts the update.

**Disable per pack:** `tienIch.tuDongCapNhat: false` in manifest opts out of auto-update. UI toggle in Gói tính năng tab also writes this field.

## Out of scope (for this spec)

- Multi-tenant pack licenses (the platform is single-tenant per install)
- Differential updates (always full pack download)
- Pack rollback UI (manual: rename `backup-{timestamp}` folder back via Workflows tab is post-v1)
- Pack catalog / marketplace (a separate spec)
- Free vs paid pack distinction at the loader level (every pack declares `banQuyen.canLicense` itself; loader treats `false` as always-active)

## CLAUDE.md compliance

- License + Gist infrastructure already exists in `electron/lib/license.js`; pack license reuses same module's primitives (`signPayload`, `verifySeal`, `checkRevocation`)
- Daily cron added via existing cron infrastructure (NOT a new node-cron instance — extends `startCronJobs()` in `electron/main.js`)
- No second Telegram poller (alerts go through `sendCeoAlert()` which uses the existing `sendTelegram()` from the gateway)
- No PowerShell writes to `openclaw.json`
- Atomic swap touches `%APPDATA%` files only, never `openclaw.json`

## Acceptance criteria (preview — to be expanded in full spec)

- Pack with `banQuyen.canLicense: true` and no license shows "Cần kích hoạt" in Workflows tab; slash commands not registered
- Valid license activates pack within 2 seconds; commands available after Zalo gateway restart
- License copied between machines fails seal verification → rejected
- Daily cron at 03:00 detects new pack version, downloads, swaps; Zalo gateway downtime ≤10 seconds per pack
- Failed update leaves existing pack functional (no half-installed state)
- 3 consecutive update failures triggers CEO Telegram alert
- Revoked pack license disables pack within 24 hours (next Gist revalidation)
- `tuDongCapNhat: false` skips the pack in the daily check

## Design pending

Full spec deferred until Pack Platform v0 ships and we know the exact pack-loader API shape. The pieces above are the contract; the implementation details (exact IPC names, manifest URL format, download retry semantics, Gist cache key naming) will be finalized in the full spec, written after Platform v0 enters acceptance testing.

## Open questions for full spec

1. How does the loader behave during the update download window — should it temporarily allow the old version to keep running, or pause the pack? Decision affects Zalo customers mid-conversation.
2. Should pack license key length match app license (~200 chars) or be shorter for easier hand-typing? CEO paste-prompt UX vs security tradeoff.
3. Where does the developer signing key live? Same `~/.claw-license-gist.json` config, or separate `~/.claw-pack-signing.json`?
4. Pack revocation: per-key (one customer's license) or per-pack-version (all installs of v1.2.0 are revoked)? Both need to be supported eventually but v1 picks one.
5. Migration script API — what subset of Node APIs is allowed in the VM sandbox? Same allowlist as pack hooks, or broader because it runs once at update time?
