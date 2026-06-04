# Zalo Customer Memory — code-enforced, near-real-time profile updates

Date: 2026-06-04
Status: Design (awaiting spec review + CEO approval)

## Problem

The per-customer CRM profile (`memory/zalo-users/<id>.md` — sở thích, quyết định,
tính cách) is supposed to update *silently after every reply* via
`POST /api/customer-memory/write` (instructed in `skills/operations/zalo.md`).

It has **never worked**: the audit log `logs/customer-memory-writes.jsonl` does
not exist on a live install → the bot has called that endpoint **zero times**.
The mechanism relies on the LLM voluntarily firing a side-effect during a
sales reply, and the LLM consistently drops it. The only fallback is the daily
journal cron (07:30 / 21:00), which is batch and writes a coarse summary, not an
incrementally-built profile. Net effect: customer profiles stay empty.

This is the `project_rule_injection_scale` failure: an LLM rule where code-level
enforcement is required.

## Goal

Customer profiles update **reliably** and **within ~3 minutes** of a customer
finishing a message burst — built incrementally (preferences/decisions accumulate)
— without relying on the LLM to remember a side-effect, and without a token bill
the CEO "can't bear".

## Non-goals (anti-features — deliberately NOT built)

- **No DM historical backfill.** Proven this session: zca-js exposes only
  `getGroupChatHistory` — there is **no DM history API**. Old 1-1 messages from
  before capture-is-on are unrecoverable. We capture forward only for DMs.
- **No group profiles here.** This feature is the per-customer (DM) CRM profile.
  Group summaries keep using the existing `seedGroupHistorySummary` path.
- **No cross-conversation semantic search / RAG** over chats. Out of scope.
- **Not literally real-time** (per-message). Debounced to ~3 min — deliberate, for
  token economy.
- **No mass backfill on upgrade.** Existing customers are NOT re-processed.

## Architecture — 4 isolated units, one job each

| Unit | Lives in | Responsibility | Smart? |
|---|---|---|---|
| 1. Raw store | openzca SQLite (`messages.sqlite`) | Persist every inbound+outbound message verbatim | no (storage) |
| 2. Trigger | `lib/customer-memory-updater.js` (new) | Poll for threads with new substantive messages; decide WHEN to extract | no — deterministic CODE |
| 3. Extractor | 9Router call, model `ninerouter/main` | Read new msgs + existing profile → structured fact JSON | **yes — LLM judgment** |
| 4. Merge+write | `lib/customer-memory-updater.js` | Validate JSON, accumulate into profile, bump lastSeen/msgCount, audit | no — deterministic CODE |

The LLM does only the part that needs intelligence (reading messy chat → facts).
Everything that must be *reliable* (when to run, retry, parse, merge, persist) is
code. This is the inversion of the current broken design.

## Parameters (CEO-chosen)

```
POLL_INTERVAL_MS      = 180_000   // 3 min — the latency target
SETTLE_MS             = 45_000    // skip a thread whose newest msg is < 45s old (mid-burst)
EXTRACTOR_MODEL       = 'ninerouter/main'   // combo gpt-5.4 + gpt-5.5
MAX_EXTRACTIONS_PER_DAY = 500     // global safety valve (fail-loud if exceeded)
PROFILE_MAX_BYTES     = 2048      // existing trimZaloMemoryFile cap
```

## Token economy (the hero — model is NOT cheaper, so volume control matters)

Layered, cheapest gate first:

1. **CODE skip-gate (no LLM call at all).** For the new messages in a thread, if
   ALL are trivial — stickers, emoji-only, system events, or text ≤ a few chars
   with no substance (`ok`, `alo`, `ừ`, `dạ`) — skip extraction entirely. Still
   bump `lastSeen`/`msgCount`/`lastProcessedTs` (pure file metadata, free). This
   removes the majority of turns.
2. **Debounce via 3-min poll + SETTLE gate.** A 5-message burst collapses into one
   extraction. Mid-burst threads wait for the next tick.
3. **Per-thread throttle.** At most one extraction per thread per tick (inherent),
   i.e. ≤ once / 3 min / customer.
4. **Incremental input.** Send only messages since `lastProcessedTs` + the existing
   *compact* profile — never the whole conversation.
5. **Tight output.** JSON, every field optional, "omit if unsure" → ~150 out-tokens.
6. **Global daily cap** `MAX_EXTRACTIONS_PER_DAY`; on breach, `log()` loudly + skip
   (never silently overrun — surfaces the breach).

Estimate: a 50-active-conversation/day shop → ~15 extractions/day after the
skip-gate, ~1k in + 150 out each. Negligible on the CEO's hosted ChatGPT.

## Data flow — customer sends 5 messages

```
Customer sends msg 1..5 within 30s
  ├─ openzca persists 5 rows to messages.sqlite immediately (ground truth)
  └─ bot replies as normal (separate path, untouched)

customer-memory-updater tick (every 3 min):
  1. Query messages.sqlite (read-only): threadIds with max(ts) > baselineTs
     and > state[thread].lastProcessedTs
  2. For this thread: newest msg age > SETTLE_MS?  (settled) → proceed, else defer
  3. Read the new messages (since lastProcessedTs) + current profile
  4. CODE skip-gate: any substantive customer message?
        no  → bump lastSeen/msgCount/lastProcessedTs, DONE (no LLM)
        yes → continue
  5. LLM extract (model=main, ONE call):
        in:  new msgs + compact existing profile
        out: { summary?, personality?[], preferences?[], decisions?[], tags?[] }
  6. CODE merge: accumulate (keep old + add non-duplicate new), dedupe,
     trim to PROFILE_MAX_BYTES; update lastSeen=now, msgCount += N
  7. Write profile + append logs/customer-memory-writes.jsonl (audit)
  8. state[thread].lastProcessedTs = ts(msg 5)

→ Dashboard (reads zalo-users/<id>.md) shows new sở thích/quyết định next refresh
```

5 messages dồn dập = **1 LLM call**. 5 messages over 3 separate turns = 3 calls
(incremental). Profile grows logically, never waits for the 21:00 cron.

## State

`zalo-profile-sync-state.json` (workspace root):
```json
{ "migrationBaselineTs": 1780500000000,
  "<senderId>": { "lastProcessedTs": 1780543732928, "lastExtractTs": 1780543700000 } }
```
- `effectiveLastProcessed(thread) = state[thread]?.lastProcessedTs ?? migrationBaselineTs`
  → threads with no entry are treated as "nothing before baseline" (no backfill).
- Single source of truth for the trigger; resilient across restarts.

## Migration (idempotent; **no backfill spike**)

On app boot, `customerMemoryUpdater.init()`:
1. Ensure openzca SQLite persistence is on — run `db enable` if `db status` says
   `enabled:false` (idempotent; one-time per install).
2. If `zalo-profile-sync-state.json` is missing → create it with
   `migrationBaselineTs = now`. This is the critical guard: existing 487 customers
   are NOT re-processed (would be hundreds of LLM calls = "không chịu nổi"). Only
   messages that arrive after the update count.
3. Existing profiles left untouched; enriched going forward.
4. Daily journal cron (07:30 / 21:00) is unchanged — runs in parallel as the
   coarse daily layer. Fix its misleading "cập nhật sau mỗi tương tác" wording.

## Reading messages.sqlite

Read-only query via `better-sqlite3` (already bundled). Thin, fail-safe: if the
openzca schema is unrecognized, `log()` and skip the tick (never crash, never
guess). Schema-coupling is the main risk → wrapped + version-tolerant.

## Interfaces

`lib/customer-memory-updater.js`:
- `init()` — migration + register the 3-min interval. Called once at boot.
- `tick()` — one poll cycle (exported for tests / manual trigger).
- `extractForThread(senderId, newMsgs, profile)` — the LLM call + parse. Pure-ish;
  testable with a stubbed 9Router.
- `mergeProfile(existing, facts)` — deterministic merge. Pure; unit-tested.

Reuses: `call9Router` (zalo-plugin.js), profile path helpers + `trimZaloMemoryFile`
(conversation.js), the `/api/customer-memory/write` merge/audit logic.

## Error handling

- Extractor fails / times out → leave `lastProcessedTs` unchanged → retried next
  tick (at-least-once; merge is idempotent on dedupe).
- Malformed JSON from LLM → discard, log, do not write garbage.
- Daily cap breached → log loudly, skip until next day.
- SQLite unreadable → skip tick, log.

## Testing (intent, not just behavior)

- `mergeProfile`: new facts accumulate, duplicates dropped, old preserved, cap
  enforced. (WHY: profile must grow, never lose prior facts, never bloat.)
- skip-gate: sticker/emoji/"ok" burst → 0 LLM calls but metadata bumped. (WHY:
  token economy is load-bearing.)
- migration: empty state + 487 existing files → 0 extractions on first tick.
  (WHY: the upgrade-spike guard is the whole point of the baseline.)
- 5-message burst → exactly 1 extraction; 3 turns → 3. (WHY: debounce correctness.)
- at-least-once: extractor throws → lastProcessedTs unchanged → next tick retries.
