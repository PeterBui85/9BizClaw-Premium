# Facebook Messenger Channel (Polling) — Design Spec

**Status:** Draft v1
**Date:** 2026-06-02
**Target branch:** `feat/workflow-pack` (Pack Platform — this is a new channel adapter)
**Depends on:** Pack Platform v0 (`2026-05-28-pack-platform-v0-design.md` §9 Channel Adapter), existing FB posting infra (`electron/lib/fb-publisher.js`, `fb-config.json`).

---

## 1. Goal

Let the bot answer customers who message the business **Facebook Page** inbox, with full channel parity to Zalo (per-customer memory, escalation, output filter), flowing through the **same shared pack dispatcher** as every other channel.

## 2. Locked decisions (from brainstorm 2026-06-02)

- **Surface:** Fanpage inbox. Bot replies **as the Page** (page name/avatar). Not personal Messenger.
- **Transport:** **Polling** Graph API. No webhooks.
- **Hosting:** **We never host.** No relay, no vendor cloud, no data transiting us. Each desktop talks straight to Graph API with the customer's own **page access token** — the same token flow already used for posting, with the `pages_messaging` scope added.
- **Why not webhooks:** webhooks need a public endpoint = someone hosts. Ruled out. Polling works behind NAT with zero infra, and the Graph budget self-balances (`200 × engaged_users` calls/24h scales with traffic).

## 3. Architecture

FB Messenger is a **channel adapter + an inbound poller**, mirroring Zalo's two halves but with no subprocess (the page token *is* the session — unlike `openzca`).

```
Facebook Page inbox
      |  (poll GET /me/conversations every N s, per page)
   fb-messenger.js  poller  --->  builds InboundMessage  --->  dispatcher.handle(msg)
      ^                                                              |
      |  send(threadId, reply)                                       v  reply text
   facebook-adapter.js  <----------------------------------  pack flow / agent
      |  (POST /me/messages, messaging_type=RESPONSE, page token)
Facebook Page inbox
```

- **Inbound poller** (`electron/lib/fb-messenger.js`): an in-process timer (same style as `fb-schedule.js`). For each enabled page, polls conversations, diffs against a per-conversation cursor, normalizes new inbound into the `InboundMessage` shape (§9.1 of pack spec), and calls `dispatcher.handle(message)`.
- **Channel adapter** (`electron/lib/adapters/facebook-adapter.js`): implements `ChannelAdapter` (`id: 'facebook'`, `send/pause/resume/isReady`). Registers in `channelAdapterRegistry` at boot, exactly like `zalo-adapter.js`.

No new platform code. Packs opt in with `kenh: ["zalo", "facebook"]`.

## 4. Components

| File | Role |
|---|---|
| `electron/lib/fb-messenger.js` | Poller + Graph API send/read calls (`getConversations`, `getMessagesSince`, `sendMessage`). Reuses the HTTP client + token plumbing from `fb-publisher.js`. |
| `electron/lib/adapters/facebook-adapter.js` | `ChannelAdapter` wrapper over `fb-messenger.sendMessage` + `pauseChannel('facebook',…)` + readiness probe. |
| `electron/lib/workspace.js` | Extend `fb-config.json` per-page with `messengerEnabled` + cursor state. |
| `electron/main.js` | `startFacebookMessenger()` in boot sequence (after `startEscalationChecker()`, mirror of Zalo). Adaptive poll scheduler. |
| `memory/fb-users/<psid>.md` | Per-customer memory, mirror of `memory/zalo-users/`. Size-capped (reuse `trimZaloMemoryFile`). |

## 5. Inbound flow

1. Poller calls `GET /{page-id}/conversations?platform=messenger&fields=participants,updated_time,messages.limit(5){message,from,created_time,id}` with the page token.
2. For each conversation whose `updated_time` is newer than the stored cursor, take messages where `from.id !== pageId` (customer messages) newer than `last_seen_message_id`.
3. Build `InboundMessage`: `{ channel:'facebook', customerId:'fb:'+psid, threadId:psid, isGroup:false, fromOwner:false, rawBody:text, timestamp }`. (Messenger page DMs are 1:1; group threads out of scope for v1.)
4. **Per-sender dedup** (reuse the 3s same-text guard pattern from Zalo) — Graph polling can re-surface a message across overlapping polls.
5. `await dispatcher.handle(message)` → pack command / flow / agent produces reply.
6. Advance cursor (store newest `message.id` per conversation) **after** successful dispatch, write-then-process safe order.

## 6. Outbound flow

- Adapter `send(threadId, reply)` → `POST /{page-id}/messages` `{ recipient:{id:threadId}, messaging_type:'RESPONSE', message:{text} }` with the page token.
- Reply is always a **RESPONSE** to the customer's last message → inside the 24h standard messaging window (resets on every customer message), so no policy issue for normal CS.
- **Output filter Layer K** applied before send (reuse `channels.js` filter — same as Zalo/Telegram).
- **Long-message split** + 800ms gap (reuse Zalo split helper). Messenger text limit ~2000 chars/message.
- `buttons` field → numbered-text degradation (same rule as Zalo adapter, pack spec §9.2). (Quick-reply buttons deferred.)

## 7. Config (`fb-config.json` extension)

Per page, add:
```jsonc
{
  "pageId": "123",
  "pageAccessToken": "...",   // already present for posting; must now carry pages_messaging scope
  "messengerEnabled": true,   // NEW — opt this page's inbox into auto-reply
  "messengerCursors": {        // NEW — per-conversation last-seen, persisted
    "<psid>": { "lastMsgId": "...", "updatedTime": "..." }
  }
}
```
No new token entry — the existing page token gains `pages_messaging`.

## 8. Polling strategy (adaptive, per page)

- **Active window:** a conversation that received a message in the last 2 min → that page polls every **5 s**.
- **Idle:** no activity for 2 min → back off to **30 s**; after 10 min idle → **60 s**.
- One shared scheduler round-robins all enabled pages so N pages don't fan out N timers.
- Rationale: spends Graph budget where conversation actually is; `200 × engaged_users` budget comfortably covers this for any realistic SME (see brainstorm math). 1–3 pages is the sweet spot; 5+ pages is where a webhook relay would help — explicitly **out of scope** here (we never host).

## 9. Readiness probe

`isReady()` → `GET /{page-id}?fields=id,name` with the page token (cheap, proves token valid + page reachable). Surface in Dashboard sidebar dot like Telegram/Zalo. A token missing `pages_messaging` → not ready, with actionable error.

## 10. Anti-features / out of scope

- **No webhooks, no relay, no vendor hosting** (hard constraint).
- **No personal-Messenger / cookie automation** (ban risk; page token only).
- **No group threads** in v1 (page DMs are 1:1 in practice).
- **No proactive/outside-24h messaging** (no message tags, no broadcasts) — replies only.
- **No quick-reply/persistent-menu UI** in v1 (numbered-text buttons only).
- **No 5+-page low-latency path** — that needs a host we won't run.

## 11. Open item — App Review (the real long-pole)

Replying as a Page via Graph API requires the **`pages_messaging`** permission, which needs **Meta App Review (Advanced Access)** on the FB App the page tokens are minted from. This is per-App, one-time, and is the gating dependency before any of this works in production. Track separately from the code work.

## 12. Verify

- Token with `pages_messaging` set on a test page → `isReady()` green within ~2 s of boot.
- Customer DMs the page → reply arrives within one poll interval (~5 s during active window).
- 15-round back-and-forth → every reply lands, no dedupe drops, no rate-limit error.
- Reply that is only a process-ack → Layer K blocks it (same as Zalo).
- Escalation phrase in reply → lands in `escalation-queue.jsonl` → CEO alerted on Telegram.
