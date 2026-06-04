# Zalo Ground-Truth History Archive

Date: 2026-06-04
Status: Design (CEO-approved intent; build + runtime-verify)

## Purpose
A permanent, append-only, raw archive of every Zalo message — the **ground truth**
for future reference ("cho xem nguyên văn chat với khách X"). Distinct from the
per-customer FACTS *summary* (which the bot injects per reply); this is the full
verbatim record.

## Hard requirements (CEO)
1. **Readable on demand** — bot answers "full chat with customer X".
2. **Survives Zalo account switch** — never wiped when the CEO re-logs a different
   Zalo account.
3. **Per-account separation** — if the same customer is a contact of two accounts,
   after switching they have **two separate records** (account A's chat with X is
   never mixed with account B's chat with X).

## Why a separate store (not openzca's messages.sqlite)
openzca's `messages.sqlite` is per-openzca-profile, mutable, and may be reset/replaced
on account re-login → not durable across an account switch. So we keep our OWN
append-only mirror, keyed by the owner account, in a durable location.

## Storage
`<userData>/zalo-history/<ownerAccountId>/<customerId>.jsonl`
- `ownerAccountId` = `self_profiles.user_id` (the CEO Zalo account at capture time).
  This is what makes account-switch produce separate records (req 3) — a new account
  = a new `<ownerAccountId>` subfolder; the old account's folder is untouched (req 2).
- `customerId` = `scope_thread_id` (the customer/peer thread id).
- One raw message per line (append-only, never rewritten):
  `{ msgId, ts, senderId, senderName, dir: 'in'|'out', msgType, text }`.
- Dedup by `msgId` (a small in-memory/seen set per file tail; never double-append).
- **`zalo-history` is added to `SACRED_DIRS`** → backed up to the external sacred
  store, protected by the build-guard, survives factory-reset (req 2 reinforced).

## Capture (sync)
Extend `customer-memory-updater.tick()`: after `readNewDmMessages`, for EVERY new
message in each thread (not just substantive — full ground truth), append to
`archive(currentSelfId, threadId)`. The archive append happens INDEPENDENT of the
skip-gate / extraction (trivial msgs are still archived). `currentSelfId` is read
fresh each tick (already done), so messages are always tagged with the live account.
Group messages (`thread_type='group'`) are out of scope here (DM ground truth only).

## Read
`GET /api/zalo/history?senderId=<customerId>[&account=<ownerAccountId>][&limit=N]`
(cron-api; CEO-Telegram auth gated like other endpoints):
- default `account` = current `selfId`; `limit` default e.g. 200 (most recent N).
- returns `{ account, senderId, count, messages: [...] }` (raw lines, newest-last).
- `GET /api/zalo/history/accounts` → list owner accounts present (for "show across
  accounts"). Per-account by default; never merges accounts (req 3).

## Bot route (AGENTS.md)
Intent "xem/đọc/cho xem nguyên văn lịch sử (chat) với khách X", "full chat với X":
→ resolve name→senderId (friends cache, existing pattern) → `web_fetch GET
/api/zalo/history?senderId=...` → bot summarizes/quotes the transcript. State the
limit: history exists only from when capture was enabled (no pre-capture backfill —
Zalo platform limit), and is per-account.

## Module — `lib/zalo-history-archive.js`
- `archiveRoot()` → `<userData>/zalo-history`.
- `appendMessages(ownerAccountId, customerId, rows)` → dedup by msgId, append jsonl.
- `readHistory(customerId, { account, limit })` → array of messages.
- `listAccounts()`, `listCustomers(ownerAccountId)`.
- Pure path helpers exported for tests + the runtime harness.

## Migration / compat
- New dir; nothing to migrate. Existing FACTS summaries (`zalo-users`) unchanged —
  they remain the per-reply injection (current-account convenience). The archive is
  additive (the verbatim ground truth).
- (Open, NOT in this build: also account-namespacing the FACTS *summary* profiles.
  Deferred — the archive already gives per-account ground truth; revisit if needed.)

## Anti-features
- No pre-capture backfill (Zalo has no DM history API — established). Ground truth =
  forward from capture-enabled.
- No cross-account merge (req 3 — always separate).
- Not encrypted (local-only, same as other workspace data).

## Verification (the standard now)
- Unit tests (node): append+dedup; account-namespacing (same customer, 2 accounts →
  2 files); read returns transcript; sacred-guard includes `zalo-history`.
- **Runtime harness** (`verify-runtime.js`, ELECTRON_RUN_AS_NODE): append a msg under
  Electron Node 18, read it back, confirm the file lands under
  `zalo-history/<account>/<customer>.jsonl`.
- Live: after reinstall, `GET /api/zalo/history?senderId=<Minh>` returns Minh's raw
  transcript; ask the bot "cho xem chat với Minh" → it quotes the messages.
