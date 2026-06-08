# Zalo Group History Archive — Design

**Date:** 2026-06-06
**Status:** Approved (brainstorm)
**Approach:** A — mirror the existing DM archive architecture

## Problem

The app archives Zalo **DM** history as append-only JSONL and exposes it via
`/api/zalo/history`, so the bot (over Telegram) can read a customer's raw
transcript. **Group** chats have no equivalent: their raw messages exist only in
openzca's `messages.sqlite` (`thread_type='group'`), with no JSONL archive and no
API. The bot's only group-reading path is the seeded markdown summary
(`memory/zalo-groups/<groupId>.md`), so when the CEO asks "đọc nguyên văn nhóm
Installer", the agent calls the DM route, finds no DM file, and wrongly reports
"không thấy raw full".

Concretely: group `INSTALLER TEAM_ 9BIZ CLAW` (id `7290379638000003675`) has 25
raw messages sitting in SQLite that the bot cannot read back.

This is a design gap, not a data-loss problem — the raw group messages are
captured. We need a raw group transcript layer parallel to the DM one.

## Goals

- Append-only raw archive of group messages, one file per group per account.
- An API the bot can call to read a group's raw transcript (default 100 messages).
- Resolve a CEO-typed group **name** to a `groupId` (CEO never types raw IDs).
- One-shot backfill of existing SQLite group messages into the new archive.
- Keep the existing markdown group memory running in parallel (unchanged).

## Non-goals (deliberately left out)

- No change to DM archive code or `/api/zalo/history` (zero regression surface).
- No new group **summary** generation — markdown memory seeding stays as-is.
- No reading openzca's SQLite directly from the API (it is not our file; schema
  can drift, it can lock, it is wiped on app reset). The JSONL archive is our
  owned ground-truth, mirroring the DM decision.
- No retention/pruning policy in this iteration (same as DM archive today).

## Architecture

Four pieces, mirroring the DM stack one-to-one:

```
openzca messages.sqlite (thread_type='group')
        │
        │  (1) live poll pass in customer-memory-updater tick()
        ▼
zalo-group-history-archive.js  ── appendGroupMessages() / readGroupHistory()
        │
        ▼
<userData>/zalo-group-history/<accountId>/<groupId>.jsonl   ← owned ground truth
        │
        │  (3) read
        ▼
/api/zalo/group/history  (cron-api.js, CEO-gated)
        ▲
        │  groupName → groupId via loadGroupsMap()
        │
   AGENTS.md routing  ← (4) agent picks group route vs DM route
```

`(2)` one-shot backfill seeds the archive from SQLite before live polling has any
history.

### Storage layout

```
<userData>/
  zalo-history/            ← DM (existing, untouched)
    <accountId>/<customerId>.jsonl
  zalo-group-history/      ← Group (NEW)
    <accountId>/<groupId>.jsonl
    .backfilled            ← seal flag (one-shot backfill done)
```

`<userData>` = `require('./workspace').getWorkspace()` — the **same** root as the
DM archive (e.g. `%APPDATA%/MODOROClaw`). This is intentionally a *different*
location from the markdown memory (`agents.defaults.workspace`,
`%APPDATA%/modoro-claw`): the two archives live together, the two memory layers
live together. `<accountId>` = owner `selfId`, so the archive survives Zalo
account switches and never merges across accounts.

JSONL line schema — **identical** to DM (`_toLine` reused verbatim):

```json
{ "msgId": "...", "ts": 1717600000000, "senderId": "...",
  "senderName": "...", "dir": "in|out", "msgType": "text", "text": "..." }
```

`dir` = `'out'` if `senderId === selfId`, else `'in'`. In a group nearly all
messages are `'in'` (many senders); the bot's own posts are `'out'`. `senderName`
carries the per-message sender, which is what makes a group transcript readable;
`_toLine` coerces a null name to `''`, so when openzca has no resolved display
name the transcript falls back to the raw `senderId` at read/summarize time
rather than dropping the line.

## Components

### 1. `electron/lib/zalo-group-history-archive.js` (NEW, ~150 lines)

A near-clone of `zalo-history-archive.js`. Same append-only contract, same 256KB
tail dedup by `msgId`, same `_isSafeId` / `ID_RE` (`/^[A-Za-z0-9_-]{1,64}$/` —
19-digit group IDs fit), same null-coalescing `_toLine`. Only the base folder
changes: `archiveRoot()` → `<ws>/zalo-group-history`.

Exports:

| Function | Purpose |
|---|---|
| `appendGroupMessages(ws, account, groupId, rows)` | dedup + append raw rows |
| `readGroupHistory(ws, groupId, { account, limit })` | newest-last, default 100 |
| `listGroupAccounts(ws)` | owner-account subfolders present |
| `listGroups(ws, account)` | group ids archived under an account |
| `backfillFromSqlite(ws, opts)` | one-shot SQLite → JSONL (see §2) |

`_toLine`, `_isSafeId`, `ID_RE` are imported from `zalo-history-archive.js` and
re-exported — single source of truth, avoids the existing duplicate-`ID_RE` smell
the review flagged. (DM module already exports these helpers.)

**Why a separate file instead of generalizing the DM module:** the DM archive is
live, sacred (`// SACRED-OK`), and works. Cloning isolates all risk to new code;
refactoring the shared module would put a regression surface under the running DM
path for no functional gain. Shared *leaf* helpers (`_toLine`, `ID_RE`) are
imported, not copied, so they stay DRY without touching DM control flow.

### 2. Live append hook — `electron/lib/customer-memory-updater.js`

There is **no** existing group branch here; the DM reader hard-codes
`thread_type='user'`. The poll `tick()` already opens the read-only DB and
resolves `selfId` once per cycle — we add a second, independent pass:

- `readNewGroupMessages(db, profile, selfId, groupCursors, baselineTs)` — copy of
  `readNewDmMessages` with the single change `thread_type='group'`. Same tie-safe
  `(timestamp_ms, msg_id)` cursor logic, same returned
  `Map<groupId, { msgs, newCursor, oldestTs }>` (no `inboundN` needed).
- A **separate** cursor namespace `groupCursors` persisted alongside the DM
  cursors, so group polling never perturbs DM cursor state.
- After reading, for each group: `groupArchive.appendGroupMessages(ws, selfId,
  groupId, msgs)`. Nothing else — no summary, no memory write.

This reuses the open DB handle and selfId already in scope, adding no extra DB
open/close churn (which the code comments call out as Windows-sensitive during
account switches).

### 3. Backfill — one-shot, idempotent

`backfillFromSqlite(ws, { profile })` opens the SQLite read-only, selects all
`thread_type='group'` rows (same column set as the DM reader), groups by
`scope_thread_id`, and calls `appendGroupMessages` per group. Dedup by `msgId`
makes it safe to re-run.

Because a busy group can produce many messages between the same `msgId` and the
256KB dedup tail, the backfill appends **per group, oldest-first**, so a group's
own just-written ids stay inside its own tail window; on re-run the dedup reads
that group file's tail (not a shared file), keeping idempotency intact even for
high-velocity groups. (Planning: confirm the tail window covers the busiest group
seen in practice.)

Guarded by a seal file `<userData>/zalo-group-history/.backfilled` (content =
backfill version string, matching the migration-marker convention). Runs
**deferred after boot** via `setTimeout`, alongside the existing knowledge
backfills in `main.js` (`backfillKnowledgeFromDisk` etc.) — non-blocking,
non-fatal on error (log + continue). It does *not* hook into
`migration.runMigration` (that path is v2.3-upgrade-specific).

After backfill writes its files it stamps the seal; the live poll then only ever
appends *new* messages on top.

### 4. API — `electron/lib/cron-api.js`

Two new routes registered next to `/api/zalo/history` (same `urlPath ===` string
branch, same global default-deny CEO-Telegram gate — not added to
`PUBLIC_ROUTES`, so it inherits auth automatically):

```
GET /api/zalo/group/history?groupId=<id>|groupName=<name>&account=<id>&limit=100
GET /api/zalo/group/history/groups        → groups with an archive
```

Behavior of `/api/zalo/group/history`:

1. If `groupId` given → validate against `ID_RE`, use directly.
2. Else if `groupName` given → `loadGroupsMap()` → normalize (NFC + lowercase) →
   `byName`. If unique, use its id. If **ambiguous** (name shared by >1 group),
   respond `409` with the candidate `{id, name}` list, exactly like the cron
   ambiguous-name flow — the agent then re-asks the CEO which group.
3. `account` defaults to current `selfId`; `limit` default **100**, hard-capped
   at **500** to stop a 10k-message dump. (One constant, asserted by both the
   route and the cap test.)
4. Response: `{ account, groupId, groupName, count, messages }`, newest-last.

`/api/zalo/group/history/groups` returns archived groups joined with their names
from `loadGroupsMap().byId` so the CEO sees readable names, not raw IDs. Returned
unbounded — a CEO has at most tens of groups; no pagination this iteration.

### 5. AGENTS.md routing + version bump

The Zalo-history section (~line 298 of `AGENTS.md`) currently routes *all*
"đọc nguyên văn" requests to `/api/zalo/history?senderId=`. Add an explicit
branch:

- **khách lẻ / 1 người** → `/api/zalo/history?senderId=<senderId>` (unchanged).
- **nhóm / group / "nhóm X"** → `/api/zalo/group/history?groupName=<tên>` (or
  `groupId=`), default 100 messages; on a `409` ambiguous response, show the CEO
  the candidate list and ask which group.

Because edits to workspace docs only reach installed bots when the version bumps,
bump **both** `CURRENT_AGENTS_MD_VERSION` (`electron/lib/workspace.js:36`,
`114 → 115`) and the stamp on line 1 of `AGENTS.md`
(`<!-- modoroclaw-agents-version: 115 -->`). `seedWorkspace()` then refreshes the
doc on existing installs at next boot.

If `skills/operations/zalo.md` ("NHÓM ZALO" section) describes group reading, add
the same group-route pointer there for consistency. (Verify during planning.)

## Data flow (end to end)

**Live:** openzca writes a group message → SQLite → next `tick()` group pass reads
it past the group cursor → `appendGroupMessages` dedups + appends to
`<userData>/zalo-group-history/<selfId>/<groupId>.jsonl`.

**Read:** CEO (Telegram) "tóm tắt nhóm Installer hôm nay" → agent reads AGENTS.md
group branch → `web_fetch GET /api/zalo/group/history?groupName=Installer` →
`loadGroupsMap` resolves to `7290379638000003675` → `readGroupHistory` returns
last 100 lines → agent summarizes the `messages` array (newest last).

## Error handling

- Archive module: every public function catches + logs, never throws (matches DM
  module). Unsafe / out-of-range ids → return `[]` / no-op.
- Backfill: non-fatal; on any error, log and leave the seal unset so the next boot
  retries. Partial appends are safe (dedup).
- API: `groupId`/`groupName` missing or malformed → `400`; ambiguous name →
  `409` + candidates; no archive file → `200` with `count: 0` (not an error — the
  group may simply have no captured history yet).
- SQLite open failure (file missing, account switch mid-read) → reader returns an
  empty map; the live pass is a no-op that cycle.

## Testing

Reuse the DM archive's test approach (`ws` override → temp dir):

1. **Archive unit** — append dedups by `msgId`; 256KB tail boundary (a msgId in
   the kept tail is deduped, file > 256KB path exercised); `readGroupHistory`
   returns newest-last and honors `limit`; unsafe ids rejected; cross-account
   isolation (two `selfId`s never merge).
2. **`_toLine` parity** — a group row maps to the same shape as DM; `dir` is
   `'out'` only when `senderId === selfId`, `'in'` for other members. *Why it
   matters:* a transcript that mislabels who spoke is useless to the CEO.
3. **Live pass** — seed a temp SQLite with mixed `user`/`group` rows; one tick
   appends only group rows to the group archive and only user rows to the DM
   archive; group cursor advances independently of the DM cursor; a second tick
   with no new rows appends nothing.
4. **Backfill idempotency** — run twice over the same SQLite → file content
   identical (no duplicate lines); seal file present after first run; with the
   real `INSTALLER` group, all 25 messages land.
5. **API** — `groupId` happy path; `groupName` unique resolve; ambiguous name →
   `409` + candidates; `limit` cap enforced; auth gate (no CEO headers → denied);
   unknown group → `count: 0`.

## Open items to confirm during planning

- Exact persistence location/format of the group cursor state (piggyback on the
  DM cursor file vs. a sibling) — read `customer-memory-updater.js` cursor
  load/save to match its convention.
- Whether `skills/operations/zalo.md` also needs the group-route pointer.
- Confirm `loadGroupsMap()` is exported/usable from the route context (it lives in
  the same `cron-api.js`).
