# Zalo History Retention — Design

**Date:** 2026-06-08
**Status:** Draft — needs CEO approval on the approach (no implementation yet)
**Depends on:** `2026-06-04-zalo-history-archive-design.md`,
`2026-06-06-zalo-group-history-design.md`,
`2026-06-07-zalo-inbound-at-landing-capture-design.md`,
`2026-06-04-sacred-data-protection-design.md`

## Problem

The durable Zalo archives (`zalo-history/<owner>/<peer>.jsonl` for DMs,
`zalo-group-history/<owner>/<group>.jsonl` for groups) are **append-only and
unbounded** — there is no retention, no rotation, no size cap. Every inbound
message (now captured at-landing, including off-allowlist senders) is appended
forever. Two writers append concurrently: the at-landing writer (plugin process)
and the 3-min poller (main process).

For a busy CEO account — many DM peers + active groups over months/years — the
archive grows without limit. The CEO asked: **store message history in a
memory-efficient way.** This spec designs that, deferred for later
implementation.

### Scale reality (why this is "reduce risk," not "fire")

One archived line is JSON text ~100–250 bytes (no media bytes — media is stored
as paths/URLs, never inlined). Rough envelope:

- 1 chatty peer, 5,000 msgs ≈ 0.7–1.2 MB.
- 100 peers × 3,000 msgs ≈ 45–75 MB.
- A heavy account over a year could reach a few hundred MB.

So this is **not** an emergency — text is cheap. It is a "bound the unbounded"
hardening so a long-lived install never balloons, **without** sacrificing the
ground-truth guarantee.

## The hard constraint (the crux)

`zalo-history` is a **SACRED_DIR** ([sacred-data.js:20](../../../electron/lib/sacred-data.js#L20))
and both archive modules pin an explicit invariant: *append-only, existing lines
are never rewritten* ([zalo-history-archive.js:120](../../../electron/lib/zalo-history-archive.js#L120)).
Naive retention (delete old lines / rewrite the file in place) collides with this
on four fronts:

1. **Sacred invariant + static guard.** Any `fs` write/unlink/rewrite inside a
   sacred path trips `check-sacred-data-guard.js`; it must be explicitly marked
   `// SACRED-OK` and justified. Deleting messages is exactly what the SACRED
   layer exists to prevent.
2. **Two lock-free concurrent appenders.** The active `<id>.jsonl` is appended by
   both the plugin and the poller with no shared lock. Rewriting/truncating that
   file in place races with an in-flight append → corruption.
3. **Digest fast-skip by mtime.** `zalo-daily-digest._readWindow` skips a file
   whose `mtime` predates the window ([zalo-daily-digest.js:71](../../../electron/lib/zalo-daily-digest.js#L71)).
   Any rewrite bumps `mtime`, defeating that optimization.
4. **Sacred backup hardlink dedup.** `_snapshotTo` hardlinks files unchanged by
   size+mtime ([sacred-data.js:243](../../../electron/lib/sacred-data.js#L243)).
   Rewrites churn that — and, more importantly, the external snapshots **still
   hold the full pre-prune history**, so live-side deletion does not actually
   reclaim space in backups until those snapshots rotate out (20-snapshot window).

**Consequence:** deletion-based retention reclaims less than it looks (backups
keep everything) while spending the SACRED "never lose a customer message"
guarantee. That guarantee is the whole reason the archive exists separate from
openzca's SQLite.

## Goals

- Put a **hard upper bound** on live archive size (per file and/or per account).
- **Lose no message** if at all avoidable — prefer shrinking the *encoding* over
  deleting the *content*.
- Stay **race-safe** with the two concurrent appenders (never rewrite the active
  file in place).
- Keep all existing readers working unchanged in behavior: `/api/zalo/history`,
  `/api/zalo/group/history`, the daily digest, the customer-memory poller.
- Respect SACRED: any in-sacred operation is marked, audited
  (`appendSacredAudit`), and never resurrected-away by heal-on-boot.

## Non-goals (deliberately out)

- **No change to capture.** Append paths (at-landing + poller) are untouched.
- **No cloud/cold-storage tiering.** Local only.
- **No per-message redaction / GDPR-style erase.** This is bulk aging, not
  selective deletion.
- **No search index.** Readers stay time-windowed / tail-limited as today.
- **Not making `zalo-group-history` sacred** — see Open finding below; that is a
  separate fix, flagged not bundled.

## Approaches considered

### A — Time/size line-pruning (rewrite in place) — NOT recommended
Keep last N months or last N MB per file; rewrite dropping older lines.
- Reclaims live space directly.
- **Breaks the append-only invariant, races the active file, churns mtime/backups,
  and deletes ground-truth that backups still retain anyway.** Highest risk,
  lowest real payoff. Rejected as the primary mechanism.

### B — Rotate cold segments + gzip (recommended)
Treat each archive file like a rotating log:
- The **active** file stays `<id>.jsonl`, plain text, appended exactly as today —
  **never touched by retention** (no race, no invariant break for the live file).
- When the active file crosses `ROTATE_BYTES`, **atomically rename** it
  `<id>.jsonl` → `<id>.<seq>.jsonl` (rename is atomic on one filesystem; a
  concurrent append lands in either the renamed file or the freshly-created next
  `<id>.jsonl` — no corruption, at most one message in an adjacent segment, still
  read back in order).
- A separate, low-frequency pass **gzips** rotated segments older than
  `COMPRESS_AFTER` → `<id>.<seq>.jsonl.gz`. gzip on this JSONL is ~85–90%
  reduction. **No message is deleted** — only re-encoded.
- Readers concatenate `<id>.jsonl` + all `<id>.<seq>.jsonl[.gz]` in sequence
  order. This is the only reader-side change.
- Optional, **CEO-controlled** hard cap: if total segments for one id exceed
  `MAX_SEGMENTS`, the oldest `.gz` segment may be deleted — **off by default**,
  and only ever deletes already-compressed cold segments, with a `SACRED-OK`
  audit line. Deletion is opt-in, never the default path.

Why B over A: bounds size, preserves ground-truth, never rewrites the racy active
file, and compressed segments get backed up compressed (space wins in backups too,
unlike A).

### C — Monitor-only (disk report + CEO alert), defer pruning
Add a size census + a CEO alert when an account's archive crosses a threshold;
implement no pruning yet. Cheapest, zero risk, but does not actually bound size —
just surfaces it. Reasonable as **phase 0** before B.

**Recommendation:** ship **C as phase 0** (cheap visibility) and **B as phase 1**
(rotate+gzip, deletion opt-in). Avoid A entirely.

## Architecture (Approach B)

```
append (unchanged) ─────────────► <id>.jsonl            (active, plain, hot)
                                       │  size ≥ ROTATE_BYTES
                       retention pass  ▼  (atomic rename)
                                   <id>.<seq>.jsonl       (cold, plain)
                                       │  age ≥ COMPRESS_AFTER
                                       ▼  (gzip, then unlink plain)
                                   <id>.<seq>.jsonl.gz    (cold, compressed)
                                       │  segments > MAX_SEGMENTS  (opt-in)
                                       ▼
                                   delete oldest .gz      (SACRED-OK + audit)

read = concat( all <id>.<seq>.jsonl[.gz] by seq, then <id>.jsonl )
```

### Constants (top-of-file, CLI/opts override — per karpathy-doctrine §2)
- `ROTATE_BYTES = 5 * 1024 * 1024` (5 MB active-file cap before rotation).
- `COMPRESS_AFTER_MS = 7 * DAY_MS` (gzip segments older than 7 days).
- `MAX_SEGMENTS = 0` (0 = never delete; CEO sets >0 to enable the hard cap).
- A single scheduling cadence (reuse the existing cron / poller tick — no new
  timer infra).

### New module
`electron/lib/zalo-history-retention.js` — one concern: rotate, compress, and
(opt-in) cap. It operates over **both** archive roots via the existing
`archiveRoot` / `groupArchiveRoot` + `listAccounts`/`listCustomers` /
`listGroupAccounts`/`listGroups` helpers (no duplicated traversal). It does
**not** import the append paths — capture and retention stay decoupled.

### Reader change (the only behavioral touch)
`readHistory` and `readGroupHistory` (and the digest's `_readWindow`) gain a
segment-aware read: enumerate `<id>.jsonl` + `<id>.*.jsonl` + `<id>.*.jsonl.gz`,
sort by `<seq>`, gunzip `.gz` on the fly (`zlib.gunzipSync`), concatenate
oldest→newest, then apply the existing tail/window logic. Because today there is
exactly one file (seq absent), the change is backward-compatible: a no-segment id
reads identically.

### SACRED interaction
- `zalo-history` stays sacred. Rotation (rename) and compression (write `.gz`,
  unlink the plain segment) are in-sacred ops → marked `// SACRED-OK` with a
  one-line reason and an `appendSacredAudit({op, file})` entry.
- **Heal-on-boot is safe:** heal only restores *missing* files and never
  overwrites live ones, and its census compares file **counts**, not sizes — a
  rotated/compressed/pruned set won't trigger false "data loss" restores or
  alerts. Verify: rotating `a.jsonl`→`a.1.jsonl.gz` changes the filename, so the
  count census must treat a segment set as the same logical thread (see Testing).
- The external snapshots naturally pick up compressed segments → backup space
  shrinks too (unlike Approach A).

## Open finding (flag, do not bundle)

`zalo-group-history` is **absent from `SACRED_DIRS`/`SACRED_SEGMENTS`**
([sacred-data.js:16-38](../../../electron/lib/sacred-data.js#L16-L38)) while
`zalo-history` is present. Group transcripts are therefore **not** backed up or
heal-protected today. This is a pre-existing gap, orthogonal to retention but
adjacent: retention should treat both archives uniformly, and group history
arguably belongs in SACRED. Recommend a **separate** one-line change to add
`zalo-group-history` to the sacred set, decided on its own — not silently folded
into this spec.

## Error handling

- Retention is best-effort and **never throws into any caller** (own try/catch +
  log), same discipline as the archive modules.
- A failed rename/gzip leaves the prior state intact (atomic rename; gzip writes
  `.gz` then unlinks plain only on success).
- A corrupt `.gz` on read is skipped with a log (reader returns the rest), never
  throws — mirrors the existing per-line `JSON.parse` tolerance.
- Opt-in deletion only ever removes an already-`.gz` segment that is **not** the
  active file and **not** the newest segment.

## Testing (Rule 9 — tests encode WHY)

`electron/lib/zalo-history-retention.test.js` + reader tests:

- **Rotate at threshold:** appending past `ROTATE_BYTES` produces `<id>.1.jsonl`
  and a fresh empty `<id>.jsonl`; no line lost across the boundary.
- **Concurrent-append safety:** simulate an append landing during rotation →
  message present in exactly one segment, read-back total unchanged (the WHY:
  two lock-free writers must never drop or corrupt a message).
- **Compress preserves content:** gzip a segment, read back via the segment-aware
  reader → identical message sequence to pre-compression (no message deleted —
  the ground-truth guarantee).
- **Reader concat order:** `<id>.2.jsonl.gz` + `<id>.3.jsonl` + active `<id>.jsonl`
  read back strictly chronological, tail-limit still correct.
- **Backward-compat:** a single legacy `<id>.jsonl` (no segments) reads identically
  to today.
- **Opt-in cap off by default:** `MAX_SEGMENTS=0` never deletes; with `>0`, only
  the oldest `.gz` is removed and an audit line is written.
- **Heal census unaffected:** a rotated/compressed thread does not trip a
  heal-on-boot "data loss" restore or count-mismatch alert.
- **Digest window correctness** after rotation: an in-window message in a cold
  segment is still returned (the mtime fast-skip must consider segment mtimes,
  not just the active file's).

## Verification / success criteria

- After many appends, an account's live archive is bounded by
  `ROTATE_BYTES × (segments) ` with cold segments compressed ~85–90%; **no
  message is unreadable**.
- `/api/zalo/history`, `/api/zalo/group/history`, the digest, and the
  customer-memory poller return the same content as before for the same window.
- Concurrent append during a retention pass never drops/corrupts a message
  (stress test).
- Sacred guard passes (`check-sacred-data-guard.js`); all in-sacred ops are
  `SACRED-OK` + audited; heal-on-boot stays quiet.
- With `MAX_SEGMENTS=0` (default) the system is **lossless** — purely a
  space-encoding change.
- `MODORO_ZALO_FORK_VERSION` unaffected (retention is main-process only; no
  plugin change). `npm run smoke` clean.

## Anti-features (restated)

No in-place rewrite of the active file, no deletion by default, no cloud tiering,
no search index, no capture-path change, no per-message redaction, no new timer
infra, no new dependency (`zlib` is stdlib).
