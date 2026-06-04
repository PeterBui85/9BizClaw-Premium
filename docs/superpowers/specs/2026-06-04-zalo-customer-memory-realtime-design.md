# Zalo Customer Memory — code-enforced, near-real-time profile updates

Date: 2026-06-04
Status: Design (spec-review round 2)

## Problem

The per-customer CRM profile (`memory/zalo-users/<id>.md` — sở thích, quyết định,
tính cách) is supposed to update *silently after every reply* via
`POST /api/customer-memory/write` (instructed in `skills/operations/zalo.md`).

It has **never worked**: the audit log `logs/customer-memory-writes.jsonl` does
not exist on a live install → the bot has called that endpoint **zero times**.
The mechanism relies on the LLM voluntarily firing a side-effect during a sales
reply, and the LLM consistently drops it. The only fallback is the daily journal
cron (07:30 / 21:00) — batch, coarse summary, not an incrementally-built profile.
Net effect: customer profiles stay empty.

This is the `project_rule_injection_scale` failure: an LLM rule where code-level
enforcement is required.

## Goal

Customer profiles update **reliably** within **~3 minutes** of a customer
finishing a message burst — built incrementally (preferences/decisions accumulate)
— without relying on the LLM to remember a side-effect, and without a token bill
the CEO "can't bear".

## Non-goals (anti-features — deliberately NOT built)

- **No DM historical backfill.** Proven this session: zca-js exposes only
  `getGroupChatHistory` — no DM history API. Old 1-1 messages before capture-is-on
  are unrecoverable. DMs are forward-capture only.
- **No group profiles here.** This is the per-customer (DM) CRM profile. Group
  summaries keep using `seedGroupHistorySummary`.
- **No cross-conversation semantic search / RAG.** Out of scope.
- **Not per-message real-time.** Debounced to ~3 min for token economy.
- **No mass backfill on upgrade.** Existing customers are NOT re-processed.

## Ground truth — openzca SQLite (verified on a live install)

- Path: `~/.openzca/profiles/<profile>/messages.sqlite` (Windows:
  `%USERPROFILE%\.openzca\profiles\<profile>\messages.sqlite`). Default profile
  name is `default` (resolve from the app's channel config; fall back `default`).
- Opened with Node's built-in **`node:sqlite` `DatabaseSync`** in `{ readOnly:true }`
  mode — NOT better-sqlite3 (openzca uses node:sqlite; the app's better-sqlite3 is
  ABI-pinned to Electron and must not be pointed at this file).
- Table `messages` (verified columns): `profile`, `scope_thread_id`, `thread_type`
  ('user' | 'group'), `msg_id`, `sender_id`, `sender_name`, `to_id`,
  `timestamp_ms` (INTEGER — the cursor), `msg_type`, `content_text`, `source`.
- Self (CEO/bot) id: `self_profiles.user_id` (one row). Inbound customer message =
  `sender_id != selfId`. Outbound (bot/CEO) = `sender_id == selfId`.
- `messages` already accumulates live (source='listen') once `db enable` is on.
- Every query binds `WHERE profile = ?` with the resolved profile name (the same
  value passed to `db enable` — `default` unless the app's channel config overrides
  it). The SQLite file is shared across profiles, so this filter is mandatory.
- Cursor compare is strict `timestamp_ms > lastProcessedTs`. Init sets
  `migrationBaselineTs = Date.now()`; a message landing in that same millisecond is
  theoretically missed — accepted (sub-ms boundary, negligible). Code comment notes it.

## Architecture — 4 isolated units, one job each

| Unit | Lives in | Responsibility | Smart? |
|---|---|---|---|
| 1. Raw store | openzca SQLite `messages` | Persist every msg verbatim (openzca does this once enabled) | no |
| 2. Trigger | `lib/customer-memory-updater.js` (new) | Poll SQLite for threads with new substantive DM messages; decide WHEN | no — deterministic CODE |
| 3. Extractor | 9Router call, model `ninerouter/main` | new msgs + existing profile → fact JSON | **yes — LLM** |
| 4. Merge+write | `lib/customer-memory-updater.js` | Validate, accumulate, dedupe, persist under lock, audit | no — deterministic CODE |

The LLM does only the intelligence (messy chat → facts). Everything that must be
*reliable* (when, retry, parse, merge, persist) is code. Inversion of the broken
LLM-side-effect design.

## Parameters (CEO-chosen)

```
POLL_INTERVAL_MS        = 180_000   // 3 min — latency target
SETTLE_MS               = 45_000    // skip a thread whose newest msg is < 45s old (mid-burst)
EXTRACTOR_MODEL         = 'ninerouter/main'   // combo gpt-5.4 + gpt-5.5
MAX_EXTRACTIONS_PER_DAY = 500       // global safety valve (persisted; fail-loud on breach)
PROFILE_MAX_BYTES       = 50 * 1024 // reuse existing trimZaloMemoryFile cap (NOT 2KB)
```

## Token economy (model is NOT cheaper → volume control is everything)

1. **CODE skip-gate (no LLM call).** For the new messages in a thread, if NO
   inbound (`sender_id != selfId`) message is substantive — i.e. all are stickers,
   emoji-only, system/`msg_type` non-text, or `content_text` trimmed ≤ 4 chars /
   in a stop-set (`ok`,`alo`,`ừ`,`dạ`,`vâng`) — **skip extraction**. Still bump
   `lastSeen`/`msgCount`/`lastProcessedTs` (free file metadata). Removes most turns.
2. **Debounce** via 3-min poll + `SETTLE_MS`. A 5-msg burst collapses to 1 call.
3. **Per-thread throttle** — ≤ 1 extraction / thread / tick (inherent → ≤ 1/3min).
4. **Incremental input** — only msgs since `lastProcessedTs` + the *compact* current
   profile. Never the whole conversation.
5. **Tight output** — JSON, all fields optional, "omit if unsure" (~150 out-tokens).
6. **Global daily cap** `MAX_EXTRACTIONS_PER_DAY`; on breach `log()` loudly + skip.

Estimate: 50 active conversations/day → ~15 extractions/day after the skip-gate.

## Data flow — customer sends 5 messages

```
Customer sends msg 1..5 within 30s
  ├─ openzca writes 5 rows to messages.sqlite (source='listen') immediately
  └─ bot replies as normal (separate path, untouched)

customer-memory-updater tick (every 3 min):
  1. cursor = max lastProcessedTs across threads we'll consider
     SELECT scope_thread_id, MAX(timestamp_ms) mx
       FROM messages
      WHERE profile=? AND thread_type='user' AND timestamp_ms > effectiveBaseline
      GROUP BY scope_thread_id
     → keep threads where mx > effectiveLastProcessed(thread)
  2. settled? (now - mx) > SETTLE_MS → proceed, else defer to next tick
  3. read new msgs: WHERE scope_thread_id=? AND timestamp_ms > lastProcessedTs
                    ORDER BY timestamp_ms   (capture maxTs = newest row read)
  4. CODE skip-gate: any substantive inbound msg?
        no  → bump lastSeen/msgCount; state[thread].lastProcessedTs = maxTs; DONE (no LLM)
        yes → continue
  5. LLM extract (model=main, ONE call): in = new msgs + compact profile;
        out (FROZEN schema) = {
          summary?: string,           // 1-2 sentence rolling summary (replaces)
          personality?: string[],     // accumulate
          preferences?: string[],     // accumulate
          decisions?:  string[],      // accumulate
          tags?: string[]             // accumulate (deduped)
        }  // omit any field if unsure; never fabricate
  6. CODE mergeProfile(existing, facts): summary replaces; the four arrays
     accumulate with content-based dedup (normalize = lowercase+trim+collapse-ws;
     drop if normalized form already present). Trim file to PROFILE_MAX_BYTES via
     trimZaloMemoryFile.
  7. CODE write under withMemoryFileLock(path) (conversation.js lock — same lock
     the daily cron + dashboard + old endpoint use); append one line to
     logs/customer-memory-writes.jsonl (audit). Set lastSeen=now, msgCount += N.
  8. state[thread].lastProcessedTs = maxTs; persist state file.
  9. extractionCount++ (persisted, per-day).

→ Dashboard (reads zalo-users/<id>.md) shows new sở thích/quyết định on refresh
```

5 messages dồn dập = **1 LLM call**. 5 across 3 settled turns = 3 calls (incremental).

## State — `zalo-profile-sync-state.json` (workspace root)

```json
{ "migrationBaselineTs": 1780500000000,
  "extractionDay": "2026-06-04",
  "extractionCount": 12,
  "threads": { "<senderId>": { "lastProcessedTs": 1780543732928 } } }
```
- `effectiveLastProcessed(thread) = threads[thread]?.lastProcessedTs ?? migrationBaselineTs`
  → threads with no entry see only messages after baseline (no backfill).
- `extractionDay`/`extractionCount` persist the daily cap across restarts; reset
  when the calendar day changes.
- Sole source of truth for the trigger; resilient across restarts.

## Reuse — exactly what, to avoid the prior reviewer's confusion

- `mergeProfile()` is **new code**. It does NOT reuse the old
  `/api/customer-memory/write` handler body (that handler is raw `appendFileSync`,
  no structured merge — we deliberately replace that approach).
- Reused by name: `withMemoryFileLock` + profile-path helpers + `trimZaloMemoryFile`
  from `conversation.js`; `call9Router` from `zalo-plugin.js`; the audit-log path
  `logs/customer-memory-writes.jsonl` (so the audit finally gets entries).

## Migration (idempotent; **no backfill spike**)

On app boot, `customerMemoryUpdater.init()`:
1. Ensure openzca persistence on: run `db status`; if `enabled:false`, spawn the
   openzca CLI to enable it — `spawn(findNodeBin(), [openzcaCliJs, '--profile',
   <profile>, 'db', 'enable'], { shell:false, windowsHide:true })`. Idempotent.
   (`findNodeBin` per boot.js; `openzcaCliJs` per `findOpenzcaCliJs` in zalo-plugin.js.)
2. If `zalo-profile-sync-state.json` is missing → create it with
   `migrationBaselineTs = Date.now()`. Critical guard: existing ~487 customers are
   NOT re-processed (would be hundreds of LLM calls). Only messages after baseline
   count.
3. Existing profiles untouched; enriched going forward.
4. Daily journal cron (07:30/21:00) unchanged — runs in parallel as the coarse
   layer. Also fix its misleading "cập nhật sau mỗi tương tác" wording in the
   seeded skeleton.

## Interfaces — `lib/customer-memory-updater.js`

- `init()` — migration + register the 3-min interval. Called once at boot.
- `tick()` — one poll cycle (exported for tests / manual "update now" button).
- `readNewDmMessages(db, profile, baseline, state)` → `Map<threadId, {msgs, maxTs}>`.
  Pure read; node:sqlite readOnly.
- `extractForThread(senderId, newMsgs, compactProfile)` → facts | null. The LLM
  call + JSON parse/validate against the frozen schema. Testable with stubbed
  call9Router.
- `mergeProfile(existing, facts)` → newContent. Pure deterministic; unit-tested.

## Error handling (fail-loud, at-least-once)

- Extractor fails / times out / malformed JSON → discard, `log()`, leave
  `lastProcessedTs` UNCHANGED → next tick re-reads the same msgs (now > SETTLE_MS,
  so retried immediately). Safe because `mergeProfile` dedup is content-based, so a
  re-run does not duplicate facts (near-duplicate phrasings may slip through — an
  accepted, low-cost imperfection; noted explicitly).
- `messages.sqlite` missing (fresh install before first message) or schema
  unreadable → skip tick, `log()`. Never crash, never guess schema.
- Daily cap breached → `log()` loudly, skip extraction until the day rolls over.
- All file writes go through `withMemoryFileLock` → no race with dashboard/cron.

## Testing (intent, not just behavior)

- `mergeProfile`: new facts accumulate; content-dup dropped; old preserved; summary
  replaces; cap enforced. WHY: profile must grow, never lose prior facts, never bloat.
- skip-gate: sticker/emoji/"ok" inbound burst → 0 LLM calls, metadata still bumped.
  WHY: token economy is load-bearing.
- migration: fresh empty state + 487 existing files → 0 extractions on first tick.
  WHY: the upgrade-spike guard is the whole point of the baseline.
- 5-msg burst → exactly 1 extraction; 3 settled turns → 3. WHY: debounce correctness.
- at-least-once: extractor throws → lastProcessedTs unchanged → next tick retries,
  no dup facts. WHY: reliability is the entire reason this feature exists.
- direction: outbound-only burst (bot/CEO messages, sender==self) → no extraction.
  WHY: we profile the customer, not our own replies.
