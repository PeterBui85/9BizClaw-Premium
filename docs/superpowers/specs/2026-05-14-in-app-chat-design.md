# In-App Native Chat — Design Spec

## Goal

Replace the OpenClaw webview chat (`page-chat` in dashboard.html) with a native HTML/CSS/JS chat UI that syncs bidirectionally with Telegram. CEO can chat with the AI assistant from the desktop app and see the same conversation on Telegram (and vice versa).

## Decisions

- **Layout:** Full-width chat (no sidebar). Clean, focused like iMessage/Telegram desktop.
- **Send method:** HTTP POST to gateway `/api/v1/chat` (existing endpoint). No streaming — request/response.
- **Sync:** Two-way. In-app messages go through gateway with `channel: 'telegram'` so they appear in Telegram too. Telegram messages appear in-app via history polling.
- **History refresh:** Poll every 20s while chat page is open.
- **Source labels:** None. All messages look the same regardless of origin.
- **No streaming:** Agent response arrives as complete text after gateway finishes processing.

## Architecture

### Send Flow

```
CEO types message
    |
    v
dashboard.html JS --> IPC 'send-chat-message'
    |
    v
chat.js: sendChatMessage(text)
    |
    v
rejectIfBooting() guard — returns { success: false, error: 'BOOT_IN_PROGRESS', message: '...' } if gateway still starting
    |
    v
HTTP POST http://127.0.0.1:18789/api/v1/chat
  headers: { Authorization: Bearer <token from getGatewayAuthToken()>, Content-Type: application/json }
  body: { message: text, channel: 'telegram' }
  timeout: 120s
    |
    v
Gateway processes message in CEO's agent session
    |
    v
Response body (JSON string) — parse with fallback chain (see Gateway Response below)
    |
    v
Extract reply text --> IPC reply --> render bot bubble
    |
    (simultaneously)
    v
Gateway delivers response to Telegram (two-way sync)
```

### Gateway Response Format

The gateway returns a JSON string. Parse with the same fallback chain used by `parseAgentJsonOutput()` in `cron.js`:

1. `result.payloads[0].text` — standard OpenClaw response shape `{ result: { payloads: [{ text: "...", mediaUrls: [...] }] } }`
2. `payloads[0].text` — alternate nesting
3. `result.text` — simplified shape
4. Raw string — if not valid JSON, treat the body as plain text reply

Error cases: HTTP 4xx/5xx with `{ error: "..." }` body, or network failure (ECONNREFUSED when gateway offline).

**Note on `triggerGatewayMessage()`:** The existing function in `gateway.js` POSTs to the same endpoint but with a 5s timeout (unsuitable for chat). Rather than duplicating that code, `chat.js` can call it with an extended timeout if refactored, or implement its own POST with the 120s timeout. The 5s vs 120s difference is intentional — `triggerGatewayMessage` is fire-and-forget for nudges, chat needs full agent processing time.

### History Flow

```
Chat page opened / 20s poll tick
    |
    v
IPC 'get-chat-history'
    |
    v
chat.js: getChatHistory()
    |
    v
extractConversationHistoryRaw({ maxMessages: 50, channels: ['telegram'] })
  reads: ~/.openclaw/agents/main/sessions/*.jsonl
    |
    v
Returns [{ role, text (capped 500 chars), ts (epoch ms), channel, sender }, ...]
    |
    v
Dedup: track last-seen timestamp (max ts from previous poll).
  On subsequent polls, only append messages with ts > lastSeenTs.
  Full re-render only on first load.
    |
    v
Render message bubbles
```

**Note on field names:** `extractConversationHistoryRaw()` returns `ts` (epoch ms), NOT `timestamp`. The `text` field is capped at 500 characters by the extraction function. The UI maps `ts` → display time via `new Date(ts).toLocaleTimeString()`.

## File Structure

### New: `electron/lib/chat.js`

Single module with 3 exports:

- **`sendChatMessage(text)`** — Checks `rejectIfBooting()` from `gateway.js` first (maps `{ success: false }` → `{ ok: false, error: 'BOOT_IN_PROGRESS' }`). Then POSTs to gateway `/api/v1/chat`. Auth token via `getGatewayAuthToken()` from `channels.js`. Parses response with fallback chain (see Gateway Response Format). Returns `{ ok: true, reply: string }` or `{ ok: false, error: string }`. Timeout 120s.
- **`getChatHistory(maxMessages = 50)`** — Calls `extractConversationHistoryRaw()` from `conversation.js`. Returns array of `{ role, text, ts, channel, sender }`. Filters to Telegram channel messages only. Note: `text` is capped at 500 chars by the extraction function.
- **`registerChatIpc()`** — Registers two `ipcMain.handle` handlers: `send-chat-message` and `get-chat-history`. Called from `registerAllIpcHandlers()`.

### Modify: `electron/preload.js`

Add two bridges:

```javascript
sendChatMessage: (text) => ipcRenderer.invoke('send-chat-message', text),
getChatHistory: () => ipcRenderer.invoke('get-chat-history'),
```

### Modify: `electron/ui/dashboard.html`

Replace the `#page-chat` content (currently a webview wrapper) with native chat UI:

**CSS:**
- `.chat-container` — full height flex column
- `.chat-messages` — scrollable message area, `flex: 1`, `overflow-y: auto`
- `.chat-bubble` — message bubble base
- `.chat-bubble.user` — right-aligned, accent background (#e53935), white text
- `.chat-bubble.bot` — left-aligned, surface background, secondary text color
- `.chat-bubble .chat-time` — small timestamp text below bubble
- `.chat-input-bar` — bottom bar with input + send button
- `.chat-empty` — empty state with suggested prompts
- `.chat-loading` — typing indicator (3 animated dots)

**HTML structure:**
```html
<div class="page-panel" id="page-chat">
  <div class="page-header">
    <h2>Chat</h2>
    <span class="chat-status" id="chat-status"></span>
  </div>
  <div class="chat-container">
    <div class="chat-messages" id="chat-messages">
      <!-- empty state or message bubbles -->
    </div>
    <div class="chat-input-bar">
      <textarea id="chat-input" rows="1" placeholder="Nhập tin nhắn..."
                onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMsg()}"></textarea>
      <button id="chat-send-btn" onclick="sendChatMsg()">
        <!-- send icon SVG -->
      </button>
    </div>
  </div>
</div>
```

**JS functions:**
- `sendChatMsg()` — reads input, clears it, appends user bubble, shows loading indicator, calls `window.claw.sendChatMessage(text)`, appends bot bubble with response, removes loading
- `loadChatHistory()` — calls `window.claw.getChatHistory()`, dedup via `_chatLastSeenTs`, renders new bubbles only, scrolls to bottom
- `startChatPoll()` — `setInterval(loadChatHistory, 20000)` when chat page is active, `clearInterval` when navigating away
- `renderChatBubble(role, text, ts)` — creates DOM elements for a single message. MUST use `textContent` (not `innerHTML`) to prevent XSS from message content
- `scrollChatToBottom()` — smooth scroll to newest message

**Empty state:**
```
"Bắt đầu trò chuyện với trợ lý AI"
[Suggested prompt buttons: "Báo cáo hôm nay", "Kiểm tra đơn hàng", "Tình hình Zalo"]
```

Clicking a suggested prompt sends it as a message.

## Edge Cases

- **Gateway not running:** `sendChatMessage` returns `{ ok: false, error: 'gateway_offline' }`. UI shows inline error "Trợ lý chưa sẵn sàng. Vui lòng chờ bot khởi động."
- **Gateway booting:** `rejectIfBooting()` returns `{ success: false, error: 'BOOT_IN_PROGRESS' }`. UI shows "Hệ thống đang khởi động, vui lòng chờ..."
- **Long response time:** Loading indicator stays visible. No timeout UI — the 120s HTTP timeout handles it.
- **Empty history:** Show empty state with suggested prompts.
- **Poll while sending:** Poll skips if a send is in flight (simple `_chatSending` flag).
- **Message too long:** No client-side limit. Gateway handles its own limits.
- **Dedup on poll:** Each poll compares `ts` values against `_chatLastSeenTs`. Only new messages are appended. Prevents flicker and duplicate DOM nodes.
- **Output filter:** Bot replies pass through the existing `filterSensitiveOutput()` on the gateway side. No additional filtering needed in chat.js.

## What Gets Removed

- The `<webview>` element for OpenClaw chat in `#page-chat`
- The `ensureEmbedLoaded('chat')` call path
- The chat prewarm logic (no longer needed — native UI loads instantly)
- Related CSS for `.embed-wrap` specific to chat (keep for 9router/openclaw embeds)

## What Stays Unchanged

- OpenClaw gateway webview (`page-openclaw`) — still uses webview
- 9Router webview (`page-9router`) — still uses webview
- `triggerGatewayMessage()` in gateway.js — still used by other callers
- Session JSONL files — read-only access, no writes
- Telegram bot integration — unchanged, gateway handles it
- `filterSensitiveOutput()` in channels.js — already applied on gateway side

## Testing

- Send message in app → bot replies → same message appears in Telegram
- Send message in Telegram → within 20s appears in app chat history
- Gateway offline → error message shown, no crash
- Gateway booting → "đang khởi động" message shown
- Fresh install (no history) → empty state with suggested prompts
- Multiple rapid sends → messages queue correctly, no duplicates
- Poll dedup → same messages not re-rendered on each poll tick
