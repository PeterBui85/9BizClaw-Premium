# Zalo Escalation CEO Alert — Better Context

Date: 2026-05-31
Status: Spec review v2

## Goal

Improve the Telegram alert sent to the CEO when a Zalo conversation escalates.

Current alert is too weak:
- group escalation can show a long group ID instead of the group name;
- the CEO cannot see which group member triggered the escalation;
- the alert does not clearly say why escalation happened;
- repeated escalation from the same group/customer can spam the CEO.

The new alert must be readable in a few seconds, identify the business context, and never block escalation just because enrichment fails.

## Approved Scope

Implement:

1. Show Zalo group name, not raw ID.
2. For group escalation, show the exact group member who triggered the bot reply when available.
3. Add a deterministic reason label.
4. Coalesce repeated escalations from the same group/customer and reason within a 5-minute window.

Out of scope:
- Telegram quick-reply that forwards CEO response back to Zalo.
- Dashboard UI changes.
- Non-Zalo escalation channels.

## CEO Alert Format

Group escalation:

```text
[Khiếu nại] Nhóm "Khách Sỉ HN" cần sếp xử lý
Người nhắn: Anh Tuấn
Nội dung: "shop giao sai hàng 3 lần rồi, tôi muốn gặp quản lý"
Bot trả lời: "Dạ để em báo sếp ạ"
14:32 · Zalo nhóm (…3266)
```

Direct-message escalation:

```text
[Ngoài phạm vi] Nguyễn Văn A cần sếp xử lý
Nội dung: "bên em có làm hợp đồng phân phối độc quyền không?"
Bot trả lời: "Dạ để em báo sếp ạ"
14:32 · Zalo khách (…7812)
```

Repeated escalation digest:

```text
[Cập nhật] Nhóm "Khách Sỉ HN" tiếp tục cần sếp xử lý
Lý do: Khiếu nại
Người nhắn mới nhất: Anh Tuấn
Nội dung mới nhất: "tôi cần quản lý gọi lại ngay"
Bot trả lời mới nhất: "Dạ em đã chuyển sếp ạ"
Ghi chú: escalate thêm 2 lần trong 5 phút
14:36 · Zalo nhóm (…3266)
```

No emojis. Keep wording short and premium.

## Data Sources

### Group display name

Resolve group display name in this order:

1. `~/.openzca/profiles/default/cache/groups.json`
   - Must support both shapes already handled by `electron/lib/cron-api.js`:
     - top-level array: `[...]`
     - wrapped object: `{ "groups": [...] }`
   - ID: `String(g.groupId || g.id || '')`
   - name: `g.name || g.groupName || ''`
2. `workspace/memory/zalo-groups/<groupId>.md`
   - first markdown heading (`# ...`).
3. fallback: `Nhóm Zalo (…1234)`.

Do not show the full group ID in the visible CEO alert. Show only last 4 digits in the footer.

### Direct-message display name

Resolve direct-message name in this order:

1. `workspace/memory/zalo-users/<userId>.md` heading.
2. `entry.senderName` if present.
3. fallback: `Khách Zalo (…1234)`.

## Exact Sender Attribution

### Problem

The current escalation queue is written in `electron/packages/modoro-zalo/src/send.ts`, which is outbound code. It only knows:
- target thread ID;
- whether target is a group;
- bot reply body.

The inbound sender lives in `electron/packages/modoro-zalo/src/inbound.ts`:
- `message.senderId`
- `message.senderName`
- `message.threadId`
- `message.isGroup`
- original customer text.

A simple `latestByThread` global map is not exact enough: two group messages can overlap, and the later inbound can overwrite the earlier sender before the earlier bot reply is delivered.

### Design: AsyncLocalStorage handoff

Use a process-local `AsyncLocalStorage` handoff to attach inbound context to the async outbound delivery call chain.

**Single shared instance (critical).** The store must be created exactly once and shared between `inbound.ts` and `send.ts`. Both modules reference the SAME instance via globalThis, or `getStore()` always returns null:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
(globalThis as any).__mcEscalationContextStore ??= new AsyncLocalStorage();
const __mcEscalationAsyncLocalStorage = (globalThis as any).__mcEscalationContextStore;
```

In `inbound.ts`:

1. Capture immutable original customer text near the FIRST `rawBody` initialization (~inbound.ts:479), BEFORE any RAG/command-block/neutralize rewrite:

```ts
const __escOriginalRawBodyPreview = String(rawBody || '').slice(0, 500);
```

2. Do not store or expose this context yet. The message may still be dropped later by the interleaved gates (allowlist, dedup, rate-limit, pause, zalo-mode, missing-mention, command-block, etc.).

3. Build the escalation context concretely **just before `ctxPayload = core.channel.reply.finalizeInboundContext(...)` (~inbound.ts:2360)** — this point is past ALL early-return gates and the command-block rewrite, so dropped/blocked/system messages never reach it, and `__escOriginalRawBodyPreview` still holds the original (non-`[nội dung nội bộ đã được lọc]`) text:

```ts
const __escCtx = {
  t: new Date().toISOString(),
  targetId: outboundTarget,
  threadId: message.threadId,
  isGroup: !!message.isGroup,
  senderId: String(message.senderId || ''),
  senderName: message.senderName || '',
  customerMsg: __escOriginalRawBodyPreview,
};
```

4. Wrap the outbound delivery in the shared store. **CRITICAL — the wrap boundary:** the DELIVER-COALESCE buffer means the final text chunk (the one most likely to contain the escalation phrase "để em báo sếp") is often sent by the trailing `await __mcFlush()` at ~inbound.ts:2594, OUTSIDE the `dispatchReplyWithBufferedBlockDispatcher` call. The `als.run(...)` MUST enclose BOTH the dispatch call AND the trailing `__mcFlush()`. AsyncLocalStorage propagates through awaits, the 400ms `setTimeout` flush, and callbacks scheduled WITHIN the run scope, so a single wrap around the whole dispatch+flush block is correct:

```ts
await __mcEscalationAsyncLocalStorage.run(__escCtx, async () => {
  const dispatchResult = await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({ ... });
  await __mcFlush(); // MUST be inside run() — this sends the buffered final chunk
  // ...post-dispatch group-history cleanup may stay inside or outside
});
```

Apply the same wrap to the two other delivery paths:
- the ACP command reply path (`deliverAndRememberModoroZaloReply` after `acpCommandResult.handled`);
- the bound-ACP path (`runModoroZaloAcpBoundTurn` + deliver).

Only the TEXT send function (`sendTextModoroZalo`) contains the escalation scanner; the media send path does not need wrapping (escalation phrasing is always text).

The same store must be visible to `send.ts` via `(globalThis as any).__mcEscalationContextStore`.

In `send.ts`:

- When the escalation scanner matches, read:

```ts
const ctx = (globalThis as any).__mcEscalationContextStore?.getStore?.();
```

(Same `globalThis.__mcEscalationContextStore` instance created in `inbound.ts` — do NOT `new AsyncLocalStorage()` here, that would be a separate instance whose `getStore()` is always null.)

- Only use it if fresh (`<= 10 minutes`) and target ID matches the outbound target.
- Add to the queue entry:

```json
{
  "senderId": "...",
  "senderName": "...",
  "customerMsg": "...",
  "contextAgeMs": 1234
}
```

Fallback:
- If AsyncLocalStorage is missing/empty/stale/mismatched, omit `Người nhắn` and let `escalation.js` fall back to the existing recent-conversation lookup for `customerMsg`.
- Escalation must still send.

### Messages that must not be captured

Do not attach escalation context for messages dropped by code-level gates:
- Zalo system messages;
- duplicate sender-dedup drops;
- rate-limited drops;
- channel paused/disabled;
- Zalo mode `read`/`daily` drops;
- missing-mention group drops;
- unauthorized command/control drops;
- allowlist/blocklist drops;
- command-block rewrites.

Implementation note: capture original text early, but only create/run the AsyncLocalStorage context after all these return gates. If command-block rewrites the customer text to `[nội dung nội bộ đã được lọc]`, do not attach the original text to the escalation context.

### DM keying

Do not key DM context by `senderId` alone. Use the exact outbound target ID that `send.ts` will see:

- group: `g:<outboundTarget>`
- DM: `d:<outboundTarget>`

Keep `senderId` as a field, not the lookup key.

## Delivery Truthfulness

Current `send.ts` writes `escalation-queue.jsonl` before the actual Zalo send. That can alert the CEO with `Bot trả lời` even if the message never reached the customer.

New behavior:

1. Scanner may detect escalation before send and hold a pending escalation object in memory.
2. After `runOpenzcaAccountCommand()` succeeds, append queue entry with:

```json
{ "deliveryStatus": "sent" }
```

3. If `runOpenzcaAccountCommand()` fails, append queue entry with:

```json
{ "deliveryStatus": "failed", "deliveryError": "..." }
```

Alert wording:

- `sent`: `Bot trả lời: "..."`
- `failed`: `Bot định trả lời nhưng gửi lỗi: "..."`

This is fail-loud and avoids lying to the CEO.

## Escalation Reason Labels

Reason must be deterministic. No model call.

Preferred source:
1. `reasonCode` written by `send.ts` from the matched escalation pattern class.
2. If missing, classify from `customerMsg` first.
3. If still unknown, classify from `trigger` / `botReply`.

Reason codes and labels:

- `complaint` → `Khiếu nại`
  - customer text contains: `khiếu nại`, `phản ánh`, `bức xúc`, `giao sai`, `lừa`, `không hài lòng`, `quá tệ`, `hoàn tiền`.
- `human_request` → `Khách đòi gặp người`
  - contains: `gặp sếp`, `gặp quản lý`, `gọi quản lý`, `người thật`, `nhân viên gọi`, `CEO`.
- `out_of_scope` → `Ngoài phạm vi`
  - trigger/bot reply contains: `ngoài khả năng`, `không thuộc phạm vi`, `vượt thẩm quyền`.
- `decision_needed` → `Cần quyết định`
  - contains: `cần sếp`, `cần quản lý`, `xem xét`, `quyết định`, `duyệt`.
- fallback → `Cần sếp xử lý`.

Precedence:
`complaint` > `human_request` > `decision_needed` > `out_of_scope` > fallback.

## Coalescing Repeated Escalations

### Requirement

Do not delay the first escalation alert. CEO must know immediately.

Coalescing only applies to repeats after the first alert.

### State

Persist coalescing state in:

```text
workspace/logs/escalation-coalesce-state.json
```

State shape:

```json
{
  "g:123:complaint": {
    "targetKey": "g:123",
    "reasonLabel": "Khiếu nại",
    "windowStart": "2026-05-31T07:32:00.000Z",
    "expiresAt": "2026-05-31T07:37:00.000Z",
    "count": 2,
    "entries": [ ...original queue entries... ],
    "senderNames": ["Anh Tuấn", "Chị Mai"],
    "latestEntry": { ... }
  }
}
```

Key:
- group: `g:<entry.to>:<reasonLabel>`
- DM: `d:<entry.to>:<reasonLabel>`

If a group repeat has a different sender, keep it in the same target+reason digest but render:

```text
Người liên quan: Anh Tuấn, Chị Mai
Người nhắn mới nhất: Chị Mai
```

If reason differs, send a separate immediate alert and separate coalescing window.

### Processing algorithm

For each new queue entry:

1. Compute target key + reason label.
2. If no active coalesce state exists for the key:
   - send the alert immediately;
   - create state with `count = 0`, `windowStart = entry.t`, `expiresAt = entry.t + 5 minutes`.
3. If active state exists and `entry.t <= expiresAt`:
   - do not send immediately;
   - append original line to state;
   - increment `count`;
   - update `latestEntry` and senderNames.
4. On every poll, flush expired states:
   - if `count > 0`, send one `[Cập nhật]` digest;
   - if `count === 0`, delete state silently.

Window type: fixed window from the first alert. It does not slide on each repeat.

### Crash / retry behavior

- Keep existing crash-safe rename-to-`.processing.<pid>` pattern for queue processing.
- Write `escalation-coalesce-state.json` atomically (temp file + rename), matching the codebase convention for state writes.
- On `startEscalationChecker()` startup, flush any coalesce states whose `expiresAt` is already in the past (crash recovery): emit the digest if `count > 0`, then delete — same spirit as the existing orphan `.processing.*` recovery already in `startEscalationChecker()`.
- On failed immediate alert: requeue that original line and do not create/update coalesce state.
- On failed digest alert: requeue all original lines stored in that digest state and keep/delete state carefully so entries are not lost. Simpler acceptable behavior: append all stored original JSONL lines back to `escalation-queue.jsonl`, then delete the state.
- Malformed JSON line: write to `logs/escalation-dead-letter.jsonl` with parse error and continue processing valid lines. Do not block the queue.

## Sanitization

All dynamic alert fields are untrusted:
- group name;
- customer/user name;
- sender name;
- customer message;
- bot reply;
- delivery error;
- reason label.

Add helper:

```js
sanitizeAlertField(value, maxLen)
```

Rules:
- String-cast.
- Strip control characters.
- Strip emojis (CEO alert text rule: no emojis).
- Collapse whitespace/newlines to single spaces.
- Replace straight quotes inside field with smart-safe or escaped variant, or leave them but ensure field remains one line.
- Trim.
- Cap length with `...`.

Suggested caps:
- group/user/sender name: 80 chars.
- customer message: 240 chars.
- bot reply: 300 chars.
- delivery error: 160 chars.

No field may inject a fake line like `Bot trả lời:` by containing newlines.

## Files to Change

### `electron/packages/modoro-zalo/src/inbound.ts`

- Add AsyncLocalStorage store setup if not already present.
- Capture original raw preview early.
- Build escalation context only after all early-return gates and before dispatch.
- Wrap all outbound delivery paths in the AsyncLocalStorage context:
  - ACP command reply path;
  - bound ACP path;
  - normal reply pipeline deliver path.

### `electron/packages/modoro-zalo/src/send.ts`

- Convert escalation patterns from bare regex array to pattern objects with `reasonCode`.
- Build a pending escalation object when scanner matches.
- Read AsyncLocalStorage context and include sender/customer fields if fresh and matching.
- Append `escalation-queue.jsonl` after send succeeds (`deliveryStatus: sent`) or in catch (`deliveryStatus: failed`).

Bump fork:
- `.fork-version`: `modoro-zalo-v1.0.14` → `modoro-zalo-v1.0.15`
- `electron/lib/zalo-plugin.js`: same value.

### `electron/lib/escalation.js`

Refactor alert rendering into helpers:

- `loadZaloGroupsMap()`
- `resolveZaloGroupName(ws, groupId)`
- `resolveZaloUserName(ws, userId, entry)`
- `shortId(id)`
- `sanitizeAlertField(value, maxLen)`
- `classifyEscalationReason(entry)`
- `renderEscalationAlert(batch, { digest })`
- `coalesceEscalationEntries(entries, windowMs)` or equivalent state-based helpers
- `loadCoalesceState()` / `saveCoalesceState()`

Keep `processEscalationQueue()` as orchestration.

### `electron/scripts/smoke-test.js`

Add no-network smoke guards / helper tests for:

1. `send.ts` writes `senderId`, `senderName`, `customerMsg`, `deliveryStatus` into escalation queue entries.
2. `send.ts` writes queue after send success and writes failed status in catch.
3. `.fork-version` matches `MODORO_ZALO_FORK_VERSION` after bump.
4. `escalation.js` parses `groups.json` both as array and `{ groups: [...] }`.
5. `escalation.js` footer uses last-4 ID only; full group ID is not visible in alert text.
6. reason classification from customerMsg has precedence over trigger fallback.
   - include a case asserting a complaint that mentions "gặp CEO"/"giám đốc" still labels `Khiếu nại` (complaint > human_request precedence), not `Khách đòi gặp người`.
7. sanitization strips newlines/control chars/emoji and caps length.
8. coalescing sends first alert immediately and digest only for repeats within 5 minutes.
9. failed digest requeues original lines.
10. malformed JSON goes to dead-letter and does not block valid entries.

If helpers are exported under `_test`, prefer direct tests over brittle source-grep checks.

## Success Criteria

A Zalo group escalation alerts the CEO with:

- real group name when available;
- exact triggering sender from AsyncLocalStorage when available;
- clear reason label;
- latest customer message;
- honest bot delivery status;
- last-4 ID only, never full raw ID in visible alert footer;
- repeated escalations grouped into one digest within 5 minutes.

Regression constraints:

- If enrichment fails, alert still sends.
- If CEO alert fails, entries are requeued.
- If group name cannot be resolved, alert uses `Nhóm Zalo (…1234)`.
- If sender cannot be resolved, alert omits `Người nhắn` rather than blocking escalation.
- Tests do not send Telegram/Zalo messages.
- No emojis in CEO alert text.
