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
| Customer chat (Zalo/FB) | Piggyback on the existing `customer-memory-updater` tick (same transcript read) → also emit task candidates | Yes (1 call, shared) |
| CEO Telegram | Small extractor over the CEO session ("nhớ làm X", "tuần này lo Y") | Yes |
| System (bot-generated) | Code hooks at the failure point: cron failed, Zalo dropped, license expiring, customer un-followed-up | **No — deterministic** |

CEO manual entry is supported (typed on Dashboard or "thêm việc" on Telegram) but
is not a harvested source.

Design rationale for "piggyback + reconcile" over a standalone harvester: the
memory updater already reads the same Zalo transcripts on a tick. A second
independent LLM pass over the same text is wasted tokens (project Rule 5: use the
model only for judgment, let code answer what code can). System tasks are facts,
not judgment → pure code. One periodic reconcile pass re-scores priority and
detects completion across the whole store.

## Architecture

```
todos.json  (in <workspace>, atomic write + lock + 60s tick)
            modeled on follow-up.js (proven: _writeChain lock, per-item persist,
            ipcInFlightCount drain guard, 24h purge)
  ├─ HARVEST
  │    customer  → hook in customer-memory-updater.js (shared read, +task output)
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

Ports/infra reuse: tasks are CEO-tier data, exposed via the existing Cron API
under the central `_requireCeoTelegram` gate (new `/api/todos/*` routes) so the
agent reads/writes them the same authenticated way as cron/memory. No new port,
no new server.

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
  dedupeKey     string            // customerId + normalized-intent hash
  createdAt, updatedAt, closedAt
  closedReason? 'bot-detected-done'|'ceo-done'|'ceo-skip'|'expired'
}
```

`dedupeKey` is the mechanism that makes re-scanning all sessions safe: the same
intent never double-creates; a resolved intent flips its existing task to `xong`
rather than spawning a new one.

## Surfaces in detail

**Spotlight (primary):** a single generated sentence, e.g.
> "Sáng nay có 2 việc cần anh quyết: trả giá cho chị Lan (đơn ~2tr, chờ 2 ngày)
> và duyệt bài FB. 5 việc khác em xử lý rồi."

Then the top-3 cards (title + priorityReason + signals + 1-tap action if any).
Full list is a drill-down, not the default view.

**Dashboard page** `Việc cần làm`: spotlight + top-3 + collapsible full list with
status filter. No emoji, premium aesthetic, proper Vietnamese. CEO can tick
done / hoãn / bỏ / add, each via IPC → `/api/todos/*`.

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

1. **Store + schema + CRUD + both surfaces.** todos.json (follow-up.js pattern),
   `/api/todos/*` routes behind CEO gate, Dashboard `Việc cần làm` page with
   spotlight+top-3, Telegram commands, manual create/close/snooze. The spotlight
   sentence is generated from whatever tasks exist. End-to-end usable with manual
   tasks only. **← spec + build first.**
2. **System-task hooks.** Deterministic emit at cron/channels/license failure
   sites. High value, no LLM, proves the "bot surfaces problems" half.
3. **Customer + CEO extraction.** Piggyback memory-updater for customer intents;
   CEO-session extractor. The AI harvest.
4. **Priority scoring + bot action/propose loop.** AI priority-with-reason over
   signals; internal-auto / customer-propose autonomy; self-close detection.

## Open questions for the plan stage (Slice 1)

- Exact `/api/todos/*` route set and param shapes (mirror `/api/cron/*`).
- Spotlight sentence generation: template-with-fills (cheap, deterministic) vs a
  tiny LLM call. Lean template for Slice 1; AI polish can come with Slice 4.
- Dashboard page placement in the existing nav (`dashboard.html`).
- Backup manifest must include `todos.json` (project rule: data-storing features
  update the backup manifest).
- Self-knowledge skill must describe this feature (project rule: every new
  feature updates the bot's self-model in the same batch).

## Conformance to project rules

- Chat-first: Telegram control is in Slice 1, not deferred.
- Propose-first: customer-facing tasks never auto-send.
- No emoji to CEO; proper Vietnamese dấu; premium aesthetic.
- Reuse-first: builds on follow-up.js store pattern, customer-memory-updater
  extraction, Cron API auth gate, existing 1-tap confirm flow.
- Code answers what code can (system tasks, dedupe, signals); AI only for
  judgment (which intent is a task, priority reason).
