# CEO Backup — Single Encrypted .zip

## Goal
One-click backup of ALL CEO data across 4 locations into a single encrypted file. Restore works for both machine transfer and same-machine reset.

## Data Collection Manifest

### Workspace (`%APPDATA%/9bizclaw/`)
**Include:**
- `memory/` (recursive) — zalo-users/, zalo-groups/, people/, projects/, daily logs
- `knowledge/` (recursive) — cong-ty/, san-pham/, nhan-vien/ + files/
- `skills/` (recursive) — all CEO-created + templates
- `user-skills/` (recursive) — CEO-created skills + _registry.json
- `prompts/` (recursive) — custom CEO prompts
- `tools/` (recursive) — tool templates + CEO customizations
- `docs/` (recursive) — documentation
- `personas/` (recursive) — persona templates + CEO custom mixes
- `media-assets/` (recursive) — brand/, product/, generated/
- `brand-assets/` (recursive)
- `documents/` (recursive)
- `.learnings/` (recursive)
- `config/` (recursive)
- `fb-pending/` (recursive) — pending FB post approvals
- `memory.db` — Hermes CEO memory (ceo_memories table) + knowledge embeddings
- `memory.db-wal`, `memory.db-shm` — WAL files (needed for consistent DB state)
- `CEO-MEMORY.md` — hot-tier Hermes cache
- Root `.md` files: AGENTS, SOUL, IDENTITY, COMPANY, PRODUCTS, USER, MEMORY, BOOTSTRAP, TOOLS
- Root `.json` configs: schedules, custom-crons, active-persona, zalo-group-settings, zalo-blocklist, zalo-allowlist, zalo-stranger-policy, shop-state, fb-config, fb-scheduled-posts, google-workspace, media-library, app-prefs, setup-complete, follow-up-queue, license.json

**Skip:** `logs/`, `backups/`, `vendor/`, `node_modules/`, `brain-graph.json`, `.machine-id`

**Pre-backup step:** Run `PRAGMA wal_checkpoint(TRUNCATE)` on memory.db to flush WAL into main file before copying.

### OpenClaw (`~/.openclaw/`)
**Include:** `openclaw.json`, `modoroclaw-sticky-*.json` (chatid, zalo-enabled, zalo-config), `identity/` (recursive), `cron/jobs.json` (CEO-created crons via Telegram)

**Skip:** `agents/`, `media/`, `extensions/`, `logs/`, `*.bak*`

### Openzca (`~/.openzca/`)
**Include:** `profiles.json`, `profiles/default/credentials.json`, `profiles/default/listener-owner.json`, `profiles/default/cache/friends.json`, `profiles/default/cache/groups.json`

**Skip:** rest of `cache/`, `logs/`

### 9Router (`%APPDATA%/9router/`)
**Include:** `db.json`

**Skip:** everything else

### Provider keys (`%APPDATA%/`)
**Include:** `modoroclaw-provider-keys.json` (CEO's AI provider API keys, lives at appdata root)

## Backup Format
```
9bizclaw-backup-YYYY-MM-DD.9bizclaw-backup  (AES-256-GCM encrypted)
  └── inner zip:
      ├── manifest.json
      ├── workspace/
      ├── openclaw/
      ├── openzca/
      ├── 9router/
      └── provider-keys/
```

`manifest.json`:
```json
{
  "version": 1,
  "app": "9bizclaw",
  "appVersion": "2.4.4",
  "minRestoreVersion": "2.4.4",
  "createdAt": "ISO",
  "machine": "hostname",
  "platform": "win32",
  "fileCount": 500,
  "sizeBytes": 5000000,
  "sections": { "workspace": 480, "openclaw": 5, "openzca": 3, "9router": 1, "provider-keys": 1 }
}
```

## Encryption
- AES-256-GCM via Node.js `crypto`
- Password → 256-bit key via `scrypt` (N=2^17, r=8, p=1)
- Format: `[16-byte salt][12-byte IV][encrypted zip bytes][16-byte auth tag]`
- File extension: `.9bizclaw-backup`

## UI
Settings page in Dashboard — 2 actions:

**Sao luu:** Button → password dialog → `dialog.showSaveDialog` → stop gateway → WAL checkpoint → collect → compress → encrypt → done toast

**Khoi phuc:** Button → file picker → password dialog → decrypt → parse manifest → version check (reject if app < minRestoreVersion) → preview dialog → CEO confirm → stop gateway → restore to temp dir → atomic swap (rename old → `.pre-restore-backup`, rename temp → workspace) → restart app. On failure: swap back old dir.

## Restore Safety
1. **Stop all child processes** (gateway, 9router, openzca) before restore
2. **Temp-dir restore**: extract to `workspace.restore-tmp/`, then atomic rename swap
3. **Rollback on failure**: if swap fails, rename `.pre-restore-backup` back to original
4. **Version gate**: reject restore if running app version < manifest.minRestoreVersion

## Restore Notes
- **Zalo:** credentials.json is session-based, may need QR re-scan on new machine
- **Telegram:** token restores automatically via openclaw.json
- **9Router:** API keys restore from db.json
- **License:** license.json backed up but machine-bound seal will fail on new machine → CEO re-activates with same key
- **Facebook:** fb-config.json accessToken is encrypted via Electron safeStorage (DPAPI/Keychain) — won't decrypt on different machine. CEO re-authenticates FB on new machine.
- **Brain graph:** regenerated automatically on boot (15s delay)
- **setup-complete.json:** restored as-is. Wizard won't re-run. CEO uses Settings to reconfigure if needed.

## Implementation Files
- `electron/lib/backup.js` — collect, encrypt, decrypt, restore logic
- `electron/lib/dashboard-ipc.js` — 3 handlers: `create-backup`, `restore-backup-preview`, `restore-backup-apply`
- `electron/preload.js` — 3 bridges
- `electron/ui/dashboard.html` — Settings page UI (2 buttons + dialogs)
- `electron/package.json` — add `archiver` + `unzipper`

## Size Estimate
~5-10MB compressed for typical CEO with 458 contacts, 4 knowledge docs, 12 skills, 6 crons.
