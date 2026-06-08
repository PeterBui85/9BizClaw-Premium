# Zalo Inbound At-Landing Capture — Design

**Date:** 2026-06-07
**Status:** Approved (brainstorm)
**Approach:** A — direct file write from the plugin, at the moment a message lands

## Problem

A real customer (fresh install) asked the bot to summarize their Zalo message
history and got nothing. The bot then mis-diagnosed it as "allowlist drops →
not archived." The true gap is in **recording**:

- Recording today depends on openzca's database layer: `db enable` →
  `messages.sqlite` → a 3-min poller mirrors rows into our durable archive. That
  DB layer is unreliable on real machines (ABI mismatches, connection failures,
  empty on fresh installs) — when it fails, **nothing is recorded**, for both DMs
  and groups.
- There is no guarantee that messages from contacts the bot does **not**
  auto-reply to (off-allowlist, e.g. "Voi") are recorded for later reading.

The CEO's requirement, stated plainly: **every inbound Zalo message must be
recorded the moment it lands** — DM and group, including off-allowlist senders —
so it can be read/summarized on demand later. No going back to backfill from
Zalo's servers.

## Goals

- Record **every inbound** message (DM + group) to the durable JSONL archive at
  the instant it reaches the plugin, **before** the allowlist / command-block /
  owner-takeover filters — so off-allowlist senders are included and the original
  (pre-rewrite) text is what's stored.
- **Zero dependency on openzca's database** (`db enable` / `messages.sqlite` /
  `db sync`). The write is a plain `fs` append.
- Converge with the existing archive: same owner-account namespace and same line
  shape, dedup by `msgId` — so the new writer and the existing poller collapse to
  one record in the common case. (A rare cross-process duplicate line is possible
  and tolerated — see Coexistence + Error handling.)
- Never block or throw into the reply path (best-effort, fully guarded).

## Non-goals (deliberately out)

- **No backfill / no `db sync`** — capture is forward-only from this update
  onward. Messages that arrived before the update are not recovered.
- **No change to the read/summary side** — it already exists: per-scope
  `/api/zalo/history` (DM) and `/api/zalo/group/history` (group), the daily
  `/api/zalo/history/digest`, and the AGENTS.md routing that summarizes by
  default. This spec is **capture only**.
- **Outbound (shop reply) capture is NOT in this iteration.** The CEO asked for
  "all inbound." Outbound is already partially covered by the poller and is noted
  as a possible future symmetric add-on, not built here.
- **Not independent of openzca's listener.** openzca is the only thing connected
  to Zalo; it delivers the live message to the plugin. We piggyback on that
  stream — we drop the DB dependency, not the listener.
- No new openzca interaction of any kind.

## Architecture

```
Zalo ──(openzca listener)──> gateway ──> modoro-zalo plugin
                                              │
   handleModoroZaloInbound(message, account, botUserId, …)
                                              │  (early — BEFORE allowlist/command-block)
                                              ▼
                              captureInbound()   [src/history-capture.ts]
                                              │  fs append, dedup by msgId, path-safe
                                              ▼
   <ws>/zalo-history/<ownerId>/<peerId>.jsonl          (DM)
   <ws>/zalo-group-history/<ownerId>/<groupId>.jsonl   (group)
                                              ▲
                                              │  (backup, unchanged)
                              3-min poller (customer-memory-updater) — dedups by msgId
```

### Hook placement (`inbound.ts`)

In `handleModoroZaloInbound`, the capture call goes **immediately after** the
empty-body guard (i.e. once `directPeerId`/`targetThreadId` are computed and we
know the message has body text or media), and **before** the friendship-system
drop, owner-takeover, allowlist gate, group system-event drop, sender-dedup, and
command-block. Rationale:

- The allowlist gate, owner-takeover early-returns, system-event drop, and
  command-block all sit *after* this point, so capturing here is the only way to
  guarantee **off-allowlist senders** are recorded — which is the whole point.
- It reads the **raw `message.text`** (not the in-scope `rawBody`, which
  owner-takeover later mutates), so the original inbound text is what's stored.

**Consequence — captured set matches the poller, not the reply pipeline.** Because
we capture before those filters, the archive will contain things the *reply*
pipeline drops: group system events ("X đã thêm Y"), friendship-system events,
and owner control commands ("/tamdung"). This is **intentional and consistent**:
the existing poller already archives every `messages.sqlite` row (it does no such
filtering), so both writers record the same raw set, and the read/summary layer
(LLM) ignores the noise. We do **not** add selective filtering at capture — doing
so would make the at-landing writer diverge from the poller.

The call is wrapped so any failure logs and returns without affecting the reply
path. Media-only messages are captured (`text:''`).

### Owner-id namespacing (critical)

The archive is keyed by the owner's Zalo id (`self_profiles.user_id`), which the
poller and all read endpoints use. The plugin will use `botUserId` as the owner
id.

**Finding (from code):** these are the *same logical value from two sources*.
`botUserId` is the openzca account's own id, resolved via `openzca me id`
(monitor.ts) and passed in as `selfId`; the poller's key is `self_profiles.user_id`
read from the same openzca account (customer-memory-updater `readSelfId`). In the
normal case they are identical (the account's Zalo uid). The residual risk is a
**valid-but-different form** (e.g. `me id` returning a different representation
than the SQLite `user_id`) — which a path-safety check alone would NOT catch,
since both forms pass `^[A-Za-z0-9_-]{1,64}$`. So `_isSafeId` is necessary
(reject junk) but not sufficient (it can't detect a split). Three layers handle
this:

1. **Path-safety:** validate `botUserId` against `^[A-Za-z0-9_-]{1,64}$`
   (identical to `zalo-history-archive._isSafeId`). Missing/invalid → **skip** the
   at-landing write (poller backup still captures it). No crash, no escape.
2. **Hard verification gate (plan step):** on a live session, assert
   `openzca me id` === `self_profiles.user_id` before relying on `botUserId`.
   This is a blocking pre-ship check, not a runtime hope.
3. **Detectable mismatch at runtime (defense in depth):** the main-process poller
   already knows `self_profiles.user_id`. Add a one-time check that compares it to
   the owner-folder names present under `zalo-history/`; on a mismatch, log LOUD
   and alert the CEO (reuse the existing `_alertCeo`). A split becomes a surfaced
   alert, never a silent data fork.

### The helper (`src/history-capture.ts`)

A small, single-purpose module exporting `captureInbound(params)`. The call site
passes the **already-resolved** values (so the helper does no re-resolution):
`ownerId` (= `botUserId`), `threadId` (= the resolved `directPeerId` for DM, or
`message.threadId` for group), `isGroup`, and the relevant `message` fields.

- Resolves the workspace dir using the **full** fallback chain from `inbound.ts`'s
  owner-takeover block (`process.env['9BIZ_WORKSPACE']` → per-platform app-data
  path) — NOT the env-only variant (which silently no-ops when the env var is
  unset). Must resolve to the same dir as the main process `getWorkspace()`.
- Maps to the archive line shape `{ msgId, ts, senderId, senderName, dir, msgType, text }`:
  - `msgId = message.msgId || message.cliMsgId || message.messageId` (stable id
    for dedup).
  - `ts = message.timestamp`; `senderId = message.senderId`;
    `senderName = message.senderName || ''`.
  - **`dir` is derived, not hardcoded:** `senderId === ownerId ? 'out' : 'in'`
    (mirrors `_toLine`) — an owner message that reaches the inbound handler
    (e.g. owner typing in the thread) is labeled `'out'`, matching what the poller
    would write for the same `msgId`.
  - `text = message.text` (raw/original).
  - **`msgType` is best-effort, NOT value-identical to the poller.** `_toLine`
    copies openzca's raw `msg_type` string (`''`, `'webchat'`, `'image'`, …); the
    inbound payload has no such field. The helper sets a simple convention with a
    pinned constant: `''` for text, `'media'` when media is present. This is
    acceptable
    because **no reader branches on `msgType`** — a fact the plan verifies (the
    read endpoints and digest only use `text`/`dir`/`ts`/`senderName`). If any
    reader is found to switch on it, revisit.
- Routes to `<ws>/zalo-history/<ownerId>/<threadId>.jsonl` (DM) or
  `<ws>/zalo-group-history/<ownerId>/<threadId>.jsonl` (group), with `_isSafeId`
  validation on `ownerId` and `threadId` (skip if either fails).
- **Tail-dedup by `msgId`:** before appending, scan the file tail for the msgId
  (mirrors `_existingMsgIds`) so an openzca redelivery of the same message does
  not double-write *within this writer*.
- Append-only; never throws (try/catch + log via `runtime.log`).

This duplicates ~30 lines of `zalo-history-archive.js` in TypeScript — the
accepted cost of Approach A (the plugin runs in a separate process; writing
straight to disk is what makes capture independent of the Electron main process
*and* the openzca DB). The spec pins the line shape; `dir` is derived identically;
`msgType` is the one field that may differ in value (no reader depends on it).

### Coexistence with the poller

The 3-min poller stays unchanged as a backup. Both writers key by the same owner
id and each dedups by `msgId` against its own past appends, so overlap is
collapsed **in the common case**. If the poller's DB path is dead (the failure
case), the at-landing writer is the sole — and sufficient — recorder.

**Known limitation (cross-process duplicate):** the two writers are separate
processes appending the same file with no shared lock, each deduping by reading
the file tail before append. A narrow race (poller reads the tail just before the
plugin's append lands, or vice versa) can produce a duplicate line for one
`msgId`. This is rare (poller fires every 3 min; plugin writes at-landing) and
non-fatal — a transcript may show one line twice. The clean fix, if it ever
matters, is **read-side dedup by `msgId`** in `readHistory`/`readGroupHistory`
(idempotent, cheap); that is noted as future hardening and intentionally left out
of this capture-only iteration.

## Error handling

- Every capture call is wrapped; a failure logs and returns. The reply pipeline
  is never affected.
- Unsafe/empty owner id or thread id → skip silently (path-safety), poller backup
  remains.
- Corrupt tail during dedup read → treat as "not seen," append anyway (at worst a
  rare duplicate line, which readers tolerate).

## Testing

`src/history-capture.test.ts` (node:test, the package's existing test style):

- DM message → correct path + line shape (`dir:'in'`, all fields).
- Group message → group path.
- **Off-allowlist sender is captured** (call the hook/helper directly with a
  sender not in any allowlist → line is written). This is the core regression
  guard for the customer's bug.
- Tail-dedup: same `msgId` twice → one line.
- Path-safety: `../evil` owner/thread id → no write, no escape.
- Missing/invalid `botUserId` → no write (poller-backup path).
- **Value-parity (not just keys):** for a fixture inbound message, assert the
  written line's `msgId/ts/senderId/senderName/dir/text` equal what
  `_toLine` would produce for the equivalent row — including `dir` derivation
  (owner sender → `'out'`; peer → `'in'`). `msgType` is asserted only to be a
  string (the one field allowed to differ). This is the test that catches helper
  drift (Rule 9 — it must be able to fail when the mapping changes). Build the
  expected object from the **actual** `zalo-history-archive._toLine` output (a
  golden fixture), not a hand-written literal, so the test also fails if `_toLine`
  itself changes.

## Verification / success criteria

- An inbound message from an **off-allowlist** sender lands in
  `zalo-history/<ownerId>/<senderId>.jsonl` with **openzca's DB disabled/broken**.
- `readHistory` / the digest read that file back unchanged.
- A redelivered message does not create a duplicate line **within the at-landing
  writer** (cross-process dup with the poller is the acknowledged rare exception).
- `dir` is `'in'` for a peer sender and `'out'` for an owner sender, matching the
  poller's `_toLine`.
- `openzca me id` === `self_profiles.user_id` confirmed on a live session (or the
  skip fallback + LOUD mismatch alert engage cleanly).
- No reader (`/api/zalo/history`, `/api/zalo/group/history`, the digest,
  customer-memory extractor) branches on `msgType` — confirmed.
- `MODORO_ZALO_FORK_VERSION` bumped; `npm run smoke` clean.

## Anti-features (restated)

No backfill, no `db sync`, no openzca DB calls, no outbound capture (this
iteration), no read/summary changes, no new dependency beyond the openzca
listener that already delivers the message.
