# Evening Report via Gateway sessions.send

## Problem

Evening/morning reports are delivered by ephemeral cron agents (spawned by `runCronAgentPrompt()`). CEO's reply goes to the gateway agent — a completely separate session. The gateway has zero context of what was proposed, forcing an ugly "ok 1"/"ok 2" numbered-command UX with a JSON file handoff (`evening-context.json`).

## Discovery

Sessions are **isolated per sender/channel**. Each Zalo customer, Zalo group, and CEO Telegram gets its own `sessionKey` (e.g. `agent:main:telegram:direct:<chatId>`). Injecting a cron prompt into the CEO's session does NOT affect any customer session.

The gateway exposes `sessions.send` via WebSocket RPC, callable via CLI:
```
openclaw gateway call sessions.send --params '{"key":"<sessionKey>","message":"<prompt>"}'
```

## Design

### Core change

Replace `runCronAgentPrompt()` with `sendToGatewaySession()` for all agent-mode crons (evening, morning, custom). The prompt is injected into the CEO's existing Telegram gateway session. The agent that generates the report IS the agent that receives CEO's reply — full conversational continuity.

### New functions in main.js

**`getGatewayAuthToken()`** — reads `gateway.auth.token` from `openclaw.json`, falls back to `OPENCLAW_GATEWAY_TOKEN` env var.

**`getCeoSessionKey()`** — builds `agent:main:telegram:direct:<chatId>` using chatId from `getTelegramConfigWithRecovery()`.

**`sendToGatewaySession(sessionKey, message)`** — calls `spawnOpenClawSafe(['gateway', 'call', 'sessions.send', '--params', JSON.stringify({key, message}), '--json'])`. Returns true on exit 0, false otherwise. Reuses existing `findNodeBin()`, `spawnOpenClawSafe()` infrastructure. Timeout 60s.

### Modified cron handlers

Evening, morning, and custom agent-mode cron handlers change from:
```js
await runCronAgentPrompt(prompt, { label });
```
to:
```js
const sessionKey = getCeoSessionKey();
const token = getGatewayAuthToken();
if (sessionKey && token) {
  const ok = await sendToGatewaySession(sessionKey, prompt);
  if (!ok) await runCronAgentPrompt(prompt, { label }); // fallback
} else {
  await runCronAgentPrompt(prompt, { label }); // fallback
}
```

Fallback to `runCronAgentPrompt()` ensures zero-risk — worst case CEO gets the old-style report.

### Prompt files

Move prompts out of main.js into dedicated files:
- `electron/prompts/evening-briefing.md`
- `electron/prompts/morning-briefing.md`
- `electron/prompts/weekly-report.md`

`buildEveningSummaryPrompt()` reads the template, injects data blocks (history, memory insights, knowledge gaps), returns the final string. All prompts use proper Vietnamese diacritics.

### Evening prompt rewrite

Key shifts:
- Role: "cố vấn kinh doanh" not "bot báo cáo"
- Structure: adaptive (skip empty sections) not rigid 3-part template
- Priority: revenue impact > risk > opportunity > knowledge gaps
- Actions: natural conversation ("ừ nhắc đi") not numbered commands ("ok 1")
- Session-aware: "em làm luôn trong cuộc trò chuyện này"
- Mobile-aware: "CEO đọc trên điện thoại cuối ngày"

### AGENTS.md changes (v70)

- Remove "1-tap — CEO reply ngắn sau báo cáo tối" section (numbered commands)
- Remove `logs/evening-context.json` from workspace read whitelist docs
- Add simpler rule in Telegram section: "Sau báo cáo sáng/tối, CEO có thể reply tự nhiên để duyệt đề xuất. Em có đầy đủ context — hiểu ý từ ngôn ngữ tự nhiên, không cần lệnh."
- Keep `/api/knowledge/add`, `/api/zalo/send`, `/api/cron/create` docs (bot still uses these to execute)

### Removed code

- `evening-context.json` write block in `buildEveningSummaryPrompt()` (~25 lines)
- `logs/evening-context.json` from workspace API read whitelist
- "ok 1"/"ok 2" prompt instructions

### Not changed

- `runCronAgentPrompt()` stays (fallback + non-agent group-message crons)
- Cron API server stays (bot executes actions via `web_fetch`)
- `/api/knowledge/add` endpoint stays
- Data scanning logic in `buildEveningSummaryPrompt()` stays (memory, audit log, knowledge gaps)
- Morning data scanning logic (stays, gets same prompt externalization)

## Files

| File | Change |
|------|--------|
| `electron/main.js` | Add `sendToGatewaySession()`, `getGatewayAuthToken()`, `getCeoSessionKey()`. Modify cron handlers. Remove evening-context.json write. Read prompt from file. |
| `electron/prompts/evening-briefing.md` | New — evening prompt template |
| `electron/prompts/morning-briefing.md` | New — morning prompt template |
| `electron/prompts/weekly-report.md` | New — weekly prompt template |
| `AGENTS.md` | Remove 1-tap section, add natural-reply rule, bump v70 |

## Risks

- **Gateway down when cron fires** — fallback to `runCronAgentPrompt()`. Heartbeat ensures gateway is alive.
- **SessionKey wrong** — chatId derivation is battle-tested (3-tier recovery). SessionKey format `agent:main:telegram:direct:<chatId>` matches openclaw's documented convention.
- **Auth token missing** — fallback to `runCronAgentPrompt()`.
- **openclaw CLI changes `gateway call` syntax** — same risk class as existing `spawnOpenClawSafe()` usage. Pin openclaw version mitigates.
