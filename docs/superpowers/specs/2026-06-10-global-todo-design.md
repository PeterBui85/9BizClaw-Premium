# Global To-Do (`Việc cần làm`) — design

Date: 2026-06-10
Status: design approved (brainstorm), Slice 1 to be planned next
Branch context: fix/cron-agent-auth-full-authority

## Problem

The CEO operates the bot across many surfaces — CEO chat on Telegram, customers
on Zalo/FB, and the bot's own background jobs (cron, channels, license). Intent
and obligations are scattered: a customer asks for a quote and is forgotten, a
cron fails silently, the CEO says "remember to do X" mid-conversation. There is
no single place that answers *"what actually needs attention right now, and in
what order?"*

## What this is NOT (anti-features — stated deliberately)

- **NOT a fourth inbox.** The failure mode of every to-do list is becoming a
  ranked pile of guilt next to the CEO's already-unread Zalo/Telegram/FB. If a
  normal day surfaces 30 CEO items, the feature has failed. **Subtraction is the
  product**: the bot's success metric is *how few* items remain for the CEO after
  it auto-handles everything it safely can.
- **NOT a flat ranked grid.** The primary surface is a one-sentence spotlight +
  top-3, not a scrollable list. A list invites scanning; a sentence forces a
  decision. The full list lives behind the spotlight for drill-down.
- **NOT auto-acting on customers.** The bot never sends a customer message or
  posts publicly on its own from a task. Customer-facing tasks are surfaced as a
  drafted action for one-tap CEO approval (propose-first invariant).
- **NOT a generic project manager.** No assignees, no sub-tasks, no Gantt. Scope
  is "things this one CEO must decide or the bot must do," nothing more (YAGNI).

## Core principles (the why)

1. **Subtract, don't accumulate.** Internal work the bot can do (restart a failed
   cron, draft a due report, gather data) never becomes a CEO task — it shows as
   "đã lo giúp anh rồi" (handled), or doesn't show at all. Customer items become a
   one-tap proposal, not a chore.
2. **Priority = consequence-of-delay in business terms, not abstract importance.**
   What makes a CEO realize urgency is money on the table, a relationship cooling,
   or a fire spreading — never the word "important." The priority label is just
   shorthand for a plain-Vietnamese reason sentence.
3. **AI decides priority, but ALWAYS shows its reason anchored to objective
   signals** (amount, how long pending, VIP status, deadline). Pure unexplained AI
   scoring is inconsistent run-to-run and kills trust the first time it says "Cao"
   for something trivial. Same signals → same score → CEO learns to trust it.
4. **Self-closing.** The bot re-scans and marks a task done when it detects the
   underlying intent was resolved (quote was sent, call was made). CEO can always
   override. No manual graveyard-cleaning required.

## Sources (where tasks come from)

| Source | Extraction | LLM? |
|---|---|---|
| Customer chat (Zalo/FB) | Share the existing `customer-memory-updater` tick's transcript read; the extractor prompt is **expanded to return an additional `tasks[]` field** alongside facts | Yes (1 call, shared) |
| CEO Telegram | Small extractor over the CEO session ("nhớ làm X", "tuần này lo Y") | Yes |
| System (bot-generated) | Code hooks at the failure point: cron failed, Zalo dropped, license expiring, customer un-followed-up | **No — deterministic** |

CEO manual entry is supported (typed on Dashboard or "thêm việc" on Telegram) but
is not a harvested source.

Design rationale for "shared-read + reconcile" over a standalone harvester: the
memory updater already reads the same Zalo transcripts on a tick. A second
independent LLM pass over the same text is wasted tokens (project Rule 5: use the
model only for judgment, let code answer what code can). System tasks are facts,
not judgment → pure code. One periodic reconcile pass re-scores priority and
detects completion across the whole store.

**Honest cost of the shared LLM call (not a free "piggyback"):** the customer
extractor (`customer-memory-updater.js` `extractForThread` + its prompt) currently
returns `{name, summary, personality[], preferences[], decisions[], tags[]}` only.
Emitting `tasks[]` in the SAME call means **expanding that prompt's output schema**
— a change to a security-sensitive function that carries careful data-fence guards
against customer text spoofing OpenClaw markers. This creates a real schema
coupling between the memory extractor and the todo store, not a clean bolt-on.
Slice 3 acceptance therefore REQUIRES: (a) the data-fence/marker-strip security
model of the extractor is preserved unchanged; (b) the existing
`check-customer-memory-updater.js` guards still pass; (c) a `tasks[]` parse failure
degrades to "no tasks", never corrupts fact extraction. If that coupling proves
risky at plan time, the fallback is a separate scoped LLM call gated to threads the
memory tick flags as "active since last todo scan" — still avoiding a blind
full-corpus pass.

## Architecture

```
todos.json  (in <workspace>, atomic write, 60s reconcile tick)
  ├─ HARVEST
  │    customer  → customer-memory-updater.js shared read + expanded tasks[] (Slice 3)
  │    ceo       → extractor over CEO Telegram session
  │    system    → code emits task at the failure site (cron.js, channels.js, license.js)
  ├─ RECONCILE tick
  │    re-score priority (AI + signals), detect done, dedupe by dedupeKey
  ├─ BOT ACTION loop
  │    internal task      → bot auto-runs, logs, marks done (shows as "handled")
  │    customer-facing    → bot drafts proposedAction, sets status=chờ duyệt,
  │                          surfaces to CEO for 1-tap approve (never auto-sends)
  └─ SURFACES
       Dashboard "Việc cần làm" page  (spotlight sentence + top-3 + drill-down)
       Telegram   ("việc hôm nay?", "xong việc X", "hoãn X", "thêm việc ...")
```

**Concurrency / write-safety (corrects an earlier "copy follow-up.js" assumption).**
`follow-up.js` does NOT provide a general mutex: `_followUpQueueLock` is a plain
boolean guarding only its own tick loop, and `queueFollowUpSafe` writes via a
separate `_writeChain` promise — the two don't serialize against each other (it
compensates with a mid-loop re-read merge). For todos.json, where a multi-second
reconcile tick (priority scoring / re-scan) can race a CEO close/snooze edit, that
is not safe enough. **Mandate instead:** ALL writes to todos.json — reconcile tick,
HTTP route, AND Dashboard IPC — go through ONE promise-serialization lock, modeled
on `cron.js` `_withCustomCronLock` (a real serializing chain), plus `writeJsonAtomic`
for the write itself, plus a `_tickInFlight` boolean so overlapping ticks skip
(as `customer-memory-updater.js` does). The tick increments `ctx.ipcInFlightCount`
around its work so before-quit drain waits for it.

**Two access paths, one store (corrects "IPC → /api/todos/*").** The Telegram agent
reaches tasks over HTTP `/api/todos/*` behind the central `_requireCeoTelegram`
gate (same authenticated path as `/api/cron/*`). The Dashboard reaches tasks over
Electron `ipcMain` handlers (same as every other Dashboard feature) — it does NOT
go through the HTTP server. Design the operation set ONCE (list/get/add/close/
snooze/approve) over shared store functions, then expose it twice: HTTP routes +
IPC handlers. No new port, no new server.

## Data model (draft)

```
Task {
  id            string            // stable unique
  source        'zalo'|'fb'|'telegram'|'system'|'manual'
  origin        { customerId?, customerName?, channel?, sessionId? }
  title         string            // short Vietnamese, proper dấu, no emoji
  detail        string            // optional fuller context
  customerFacing boolean          // gates autonomy: false→bot may auto-do
  status        'mở'|'đang làm'|'chờ duyệt'|'xong'|'hoãn'|'bỏ'
  priority      'cao'|'trung'|'thấp'
  priorityReason string           // plain-VN sentence (the realization artifact)
  signals       { amount?, pendingSinceMs?, vip?, deadline? }  // anchors the score
  proposedAction? { kind, payload }   // for customer-facing, pre-drafted for 1-tap
  dedupeKey     string            // per-source, see below
  createdAt, updatedAt, closedAt
  closedReason? 'bot-detected-done'|'ceo-done'|'ceo-skip'|'expired'|'source-gone'
}
```

`dedupeKey` makes re-scanning all sessions safe: the same intent never
double-creates; a resolved intent flips its existing task to `xong` rather than
spawning a new one. It is **constructed per source** (a single "customerId + intent
hash" formula breaks for non-customer tasks and is unstable across re-scans):

- `zalo` / `fb`: `"<source>:<customerId>:<categoryKey>"` where `categoryKey` is a
  small FIXED enum the extractor must classify into (e.g. `bao-gia`, `goi-lai`,
  `gui-mau`, `chot-don`, `khieu-nai`, `khac`) — NOT a hash of the LLM's free-text
  intent. Hashing free text is unstable: "muốn báo giá" vs "hỏi báo giá" hash
  differently and would re-create the task every tick. One open quote-request per
  customer per category = one task; good enough, and stable.
- `system`: fully deterministic, no LLM — `"system:<failureType>:<resourceId>"`
  (e.g. `system:cron_failed:cron_abc123`, `system:license_expiring:<keyHash>`).
- `telegram`: `"telegram:<sessionId>:<slug(title)>"`; near-duplicate CEO asks may
  occasionally double-create — acceptable, CEO can merge/close.
- `manual`: no dedupe — manual entries always create.

**Orphaned source.** If a task's `origin.customerId` profile file no longer exists
(customer archived/deleted), self-close detection SKIPS the task (leaves it open;
deleting a customer is not a task-completion signal). The CEO may still close it
manually; a tick may mark it `bỏ`/`source-gone` only after an explicit retention
window, never silently on first missing-file.

## Surfaces in detail

**Spotlight (primary):** a single generated sentence, e.g.
> "Sáng nay có 2 việc cần anh quyết: trả giá cho chị Lan (đơn ~2tr, chờ 2 ngày)
> và duyệt bài FB. 5 việc khác em xử lý rồi."

Then the top-3 cards (title + priorityReason + signals + 1-tap action if any).
Full list is a drill-down, not the default view.

**Dashboard page** `Việc cần làm`: spotlight + top-3 + collapsible full list with
status filter. No emoji, premium aesthetic, proper Vietnamese. CEO can tick
done / hoãn / bỏ / add, each via an Electron `ipcMain` handler (see "Two access
paths, one store" — Dashboard uses IPC, NOT the HTTP routes).

**Telegram (chat-first, equal in Slice 1):**
- "việc hôm nay?" / "việc gì cần làm?" → spotlight sentence + top-3
- "xong việc <…>" → close
- "hoãn việc <…>" / "bỏ việc <…>"
- "thêm việc <…>" → manual create
- Approving a proposed customer-facing action reuses the existing 1-tap confirm
  pattern (like FB "ok" / cron "ĐĂNG").

## Autonomy (locked)

- **Internal, non-customer** (draft report, gather data, restart failed job,
  remind CEO): bot does it, logs, marks done. Shows as handled, not as a chore.
- **Customer-facing** (send Zalo/FB, post publicly): bot drafts `proposedAction`,
  sets `chờ duyệt`, asks CEO. Never auto-sends. Honors channel pause + all output
  filters already in place.

## Slices (each independently shippable)

1. **Store + schema + CRUD + both surfaces.** todos.json with the serialized-write
   lock + atomic-write + `_tickInFlight` described in Architecture; HTTP
   `/api/todos/*` behind the CEO gate AND parallel Dashboard `ipcMain` handlers over
   shared store functions; Dashboard `Việc cần làm` page; Telegram commands; manual
   create/close/snooze. **Slice 1 spotlight is a DETERMINISTIC COUNT STUB only** —
   e.g. "Có N việc cần làm" (no `priorityReason`, no AI ranking; those fields are
   empty until Slice 4). This avoids building priority-display logic prematurely.
   End-to-end usable with manual tasks. **← spec + build first.**
2. **System-task hooks.** Deterministic emit at cron/channels/license failure
   sites. High value, no LLM, proves the "bot surfaces problems" half.
3. **Customer + CEO extraction.** Expand the memory extractor schema to emit
   `tasks[]` (see the "honest cost" note under Sources — preserves the data-fence
   security model + existing guards); CEO-session extractor. The AI harvest.
4. **Priority scoring + bot action/propose loop.** AI priority-with-reason over
   signals; the real business-meaningful spotlight sentence; internal-auto /
   customer-propose autonomy; self-close detection.

### Slice 1 acceptance criteria (firm, not optional)

- **Bootstrap:** if `todos.json` does not exist → treat as empty list, no error.
  If `getWorkspace()` returns null (pre-init) → every read/write no-ops gracefully
  (mirror `follow-up.js` `getFollowUpQueuePath` null-guard). Dashboard page and
  "việc hôm nay?" must not crash on first boot before any task exists.
- **Backup manifest includes `todos.json`** (project rule: data-storing features
  update the backup manifest).
- **Self-knowledge skill updated** to describe `Việc cần làm` (project rule: every
  new/changed feature updates the bot's self-model in the same batch).
- **Tests** (mirror `check-customer-memory-updater.js`: inject a fixture workspace
  path): dedupeKey collision-prevention per source; first-run/null-workspace
  bootstrap; concurrent tick-vs-IPC write safety (no lost CEO edit); Telegram
  command parsing. Tests encode WHY (a dropped CEO close = a re-surfaced chore).

## Open questions for the plan stage (Slice 1)

- Exact `/api/todos/*` route set + param shapes, and the matching IPC channel names
  (mirror `/api/cron/*` and existing `dashboard-ipc.js` handlers).
- Dashboard page placement in the existing nav (`dashboard.html`).
- The fixed `categoryKey` enum for customer dedupe (drafted above; finalize at plan).
- `slug(title)` definition for the `telegram` dedupeKey (lowercase + dấu-strip +
  first-N-words?) — must be stable across restarts.
- Confirm `ctx.ipcInFlightCount` + before-quit drain infra already exists (it does
  for follow-up.js); reuse it, don't reinvent.

## Conformance to project rules

- Chat-first: Telegram control is in Slice 1, not deferred.
- Propose-first: customer-facing tasks never auto-send.
- No emoji to CEO; proper Vietnamese dấu; premium aesthetic.
- Reuse-first: builds on `_withCustomCronLock` serialized-write pattern +
  `writeJsonAtomic`, the customer-memory-updater extractor (expanded schema),
  the Cron API auth gate, and the existing 1-tap confirm flow.
- Code answers what code can (system tasks, dedupe, signals); AI only for
  judgment (which intent is a task, priority reason).
