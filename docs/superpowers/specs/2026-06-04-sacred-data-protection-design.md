# Sacred Data Protection — never lose customer data on update/migration/reset

Date: 2026-06-04
Status: Design (CEO approved; build with careful per-layer review)

## Problem

Paying customers' bots "forgot" customer names + CEO-taught behavior after an app
update. Root causes found this session (already patched): version-bump purged ALL
chat sessions (`workspace.js:672`), and the bot never read customer profiles into
replies. But patches-per-hole are not enough — the CEO requires it be **impossible
to lose customer data** going forward, no matter what bug/update/migration/reset.

## Goal

Customer/CEO-generated data survives every code path. Losing it must require
multiple independent layers to fail simultaneously (defense-in-depth), not a single
bug. Honest framing: not literally "100%", but no single fault loses data
unrecoverably.

## Sacred set (the data that is irreplaceable)

Single source of truth: `electron/lib/sacred-data.js` exports `SACRED_DIRS` +
`SACRED_FILES` (workspace-relative):
```
SACRED_DIRS = [
  'memory/zalo-users', 'memory/zalo-groups',
  'memory/whatsapp-users', 'memory/whatsapp-groups',
  'user-skills',
]
SACRED_FILES = [
  'CEO-MEMORY.md', 'so-sach.md', 'cong-no.md',
  'schedules.json', 'custom-crons.json',
  'zalo-blocklist.json', 'zalo-allowlist.json',
  'user-skills/_registry.json',
]
```
(Daily journals `memory/YYYY-MM-DD.md` are protected-by-backup but not in the
no-overwrite guard — they are regenerable. USER.md is seeded+merged, already
create-if-missing; the profile section is covered by persona.js marker-merge.)

## 4 independent layers

### Layer 1 — Build-guard (prevention; the keystone)
`electron/scripts/check-sacred-data-guard.js`, wired into `npm run smoke`.
Statically scans `electron/**.js` + `electron/packages/**/*.ts` for **destructive
fs ops** — `rmSync`, `unlinkSync`, `rmdirSync`, `rm(`, and bulk
`writeFileSync`/`copyFileSync` — whose path expression contains a sacred segment
(any of the SACRED_DIRS leaf names, e.g. `zalo-users`, `user-skills`). FAILS the
build if such a call appears **outside an allowlist** of files that are permitted
to touch sacred data:
```
ALLOWLIST = [
  'lib/customer-memory-updater.js',   // merge (append-only, locked)
  'lib/conversation.js',              // appendPerCustomerSummaries (locked)
  'lib/dashboard-ipc.js',             // CEO note add/edit + factory-reset (must snapshot first)
  'lib/sacred-data.js',               // the backup/restore engine itself
  'lib/backup.js',                    // manifest backups
]
```
For each allowlisted destructive op the guard ALSO asserts a nearby
`// SACRED-OK: <reason>` marker comment, so every exception is deliberate and
documented. Net effect: a new code path that could wipe customer data turns the
build red immediately (caught the inbound.ts path-traversal class too).

Heuristic, not a proof — it is the first net, backed by Layers 2-4.

### Layer 2 — Auto-backup before any destructive op + daily
`sacred-data.js` exports `snapshotSacred(reason)`:
- Copies every existing SACRED_DIR/SACRED_FILE into
  `backups/sacred/<YYYY-MM-DDTHH-mm-ss>-<reason>/` (mirroring relative paths).
- Writes a `manifest.json` (file list + counts + timestamp + reason).
- Retains the most recent **N=20** sacred snapshots + always keeps the **oldest
  successful** one (so a slow corruption can't roll all backups past the good state).
Call sites (mandatory):
- `factory-reset` handler (`dashboard-ipc.js`) — snapshot BEFORE the `rmSync`. Even
  "xóa" is recoverable.
- `seedWorkspace` version-bump path — snapshot before the overwrite cascade.
- Migration entry (`migration.js`) — snapshot before any move/cleanup.
- A daily cron (reuse the cron system) — one snapshot/day.

### Layer 3 — Boot self-heal / restore
On boot, `sacred-data.js` `healSacredOnBoot()`:
- For each SACRED_DIR: compare live file count vs the newest snapshot's count.
- If live is **missing or has fewer files than the newest snapshot** (data shrank),
  RESTORE the missing files from the snapshot (never overwrite a newer live file —
  union-restore: only add files present in backup but absent live) AND send a loud
  CEO alert ("Phát hiện mất N hồ sơ khách — đã tự khôi phục từ backup <ts>").
- Never deletes live data; only re-adds missing.

### Layer 4 — Detection / fail-loud + audit
- `healSacredOnBoot` logs a one-line census every boot (counts per sacred dir).
- Any drop vs the last census → `sendCeoAlert` (never silent).
- Every write into a sacred path (via the allowlisted APIs) appends to
  `logs/sacred-writes.jsonl` (who/what/when) for forensics.

## Interfaces — `electron/lib/sacred-data.js`
- `SACRED_DIRS`, `SACRED_FILES` — constants (the one source of truth).
- `snapshotSacred(reason)` → `{ dir, counts }`. Locked, idempotent-safe.
- `healSacredOnBoot()` → `{ restored, census }`. Called once at boot (before gateway).
- `listSnapshots()` / `restoreFrom(snapshotDir)` — manual recovery helpers.
- `isSacredPath(relPath)` — used by the guard + callers.

## Wiring
- `main.js` boot: `healSacredOnBoot()` early (after workspace ensured, before gateway).
- `dashboard-ipc.js` factory-reset: `snapshotSacred('factory-reset')` before wipe.
- `workspace.js` version-bump: `snapshotSacred('version-bump')` before cascade.
- `package.json` smoke: add `check-sacred-data-guard.js`.
- Daily cron: `snapshotSacred('daily')`.

## Anti-features
- Not encryption/cloud backup (local snapshots only — out of scope).
- Not protecting regenerable data (daily journals beyond backup, RAG index).
- Guard is heuristic (line-proximity), not full taint analysis — Layers 2-4 cover gaps.

## Testing (intent)
- guard: a fixture file with `fs.rmSync(...zalo-users...)` outside allowlist → guard FAILS.
  Same call inside an allowlisted file WITH `// SACRED-OK` → passes. WHY: prevention must bite.
- snapshotSacred: creates timestamped copy + manifest; retains N, keeps oldest.
- healSacredOnBoot: live dir with 2 files, backup with 5 → restores the 3 missing,
  never touches the 2 live, alerts. WHY: shrink = auto-recover, never silent.
- factory-reset snapshots before wipe → data recoverable from backup. WHY: even
  intentional wipe must be reversible.
