# In-App Native Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the OpenClaw webview chat with a native HTML/CSS/JS chat UI that syncs bidirectionally with Telegram.

**Architecture:** New `electron/lib/chat.js` handles send (POST to gateway `/api/v1/chat`) and history (reads session JSONL files). Dashboard page `#page-chat` gets native chat bubbles, input bar, and polling. Webview/prewarm code removed.

**Tech Stack:** Electron IPC, vanilla JS/CSS, OpenClaw gateway HTTP API

**Spec:** `docs/superpowers/specs/2026-05-14-in-app-chat-design.md`

---

## Chunk 1: Backend + IPC

### Task 1: Create `electron/lib/chat.js`

**Files:**
- Create: `electron/lib/chat.js`
- Read: `electron/lib/gateway.js:174-186` (`rejectIfBooting`)
- Read: `electron/lib/channels.js:246-253` (`getGatewayAuthToken`)
- Read: `electron/lib/conversation.js:46-54` (`extractConversationHistoryRaw`)
- Read: `electron/lib/cron.js:120-138` (`parseAgentJsonOutput` — response parsing pattern)

- [ ] **Step 1: Create `electron/lib/chat.js` with `sendChatMessage`**

```javascript
'use strict';
const http = require('http');
const { rejectIfBooting } = require('./gateway');
const { getGatewayAuthToken } = require('./channels');
const { extractConversationHistoryRaw } = require('./conversation');

async function sendChatMessage(text) {
  const bootCheck = rejectIfBooting('send-chat-message');
  if (bootCheck) return { ok: false, error: bootCheck.error };

  const token = getGatewayAuthToken();
  if (!token) return { ok: false, error: 'no_gateway_token' };

  return new Promise((resolve) => {
    const payload = JSON.stringify({ message: text, channel: 'telegram' });
    const req = http.request({
      hostname: '127.0.0.1', port: 18789, path: '/api/v1/chat',
      method: 'POST', timeout: 120000,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200 || !d) {
          return resolve({ ok: false, error: 'gateway_error' });
        }
        const reply = _parseGatewayResponse(d);
        resolve({ ok: true, reply });
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'gateway_offline' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

function _parseGatewayResponse(body) {
  try {
    const parsed = JSON.parse(body);
    const payloads = parsed?.result?.payloads || parsed?.payloads || [];
    if (payloads.length > 0) return payloads[0].text || '';
    if (parsed?.result?.text) return parsed.result.text;
    if (parsed?.text) return parsed.text;
    return body;
  } catch {
    return body;
  }
}

function getChatHistory(maxMessages = 50) {
  return extractConversationHistoryRaw({ maxMessages, channels: ['telegram'] });
}

function registerChatIpc() {
  const { ipcMain } = require('electron');
  ipcMain.handle('send-chat-message', async (_ev, text) => {
    if (!text || typeof text !== 'string') return { ok: false, error: 'empty_message' };
    return sendChatMessage(text.trim());
  });
  ipcMain.handle('get-chat-history', async () => {
    return getChatHistory();
  });
}

module.exports = { sendChatMessage, getChatHistory, registerChatIpc };
```

- [ ] **Step 2: Verify module loads without error**

Run from `electron/` directory:
```powershell
node -e "try { require('./lib/chat'); console.log('OK') } catch(e) { console.error(e.message); process.exit(1) }"
```
Expected: `OK` (no crash). The require chain (`gateway`, `channels`, `conversation`) must resolve.

- [ ] **Step 3: Commit**

```bash
git add electron/lib/chat.js
git commit -m "feat(chat): add chat.js backend — send, history, IPC"
```

---

### Task 2: Wire IPC — preload bridges + handler registration

**Files:**
- Modify: `electron/preload.js` (add 2 bridges inside `contextBridge.exposeInMainWorld`)
- Modify: `electron/lib/dashboard-ipc.js:163` (call `registerChatIpc()` inside `registerAllIpcHandlers`)

- [ ] **Step 1: Add preload bridges**

In `electron/preload.js`, inside the `contextBridge.exposeInMainWorld('claw', { ... })` block, add:

```javascript
sendChatMessage: (text) => ipcRenderer.invoke('send-chat-message', text),
getChatHistory: () => ipcRenderer.invoke('get-chat-history'),
```

Add near the other IPC bridges (after existing entries like `getOverviewData`, `checkAllChannels`, etc.).

- [ ] **Step 2: Register IPC handlers in `dashboard-ipc.js`**

At the top of `electron/lib/dashboard-ipc.js`, add to the require section:

```javascript
const { registerChatIpc } = require('./chat');
```

Inside `registerAllIpcHandlers()` function body (near the top, after line ~168), add:

```javascript
registerChatIpc();
```

- [ ] **Step 3: Verify smoke test still passes**

```powershell
node electron/scripts/smoke-test.js
```

Expected: no new failures. The smoke test checks exports and IPC handler registration.

- [ ] **Step 4: Commit**

```bash
git add electron/preload.js electron/lib/dashboard-ipc.js
git commit -m "feat(chat): wire IPC bridges and handler registration"
```

---

## Chunk 2: Frontend — Native Chat UI

### Task 3: Replace `#page-chat` with native chat UI

**Files:**
- Modify: `electron/ui/dashboard.html:633-640` (replace `.chat-shell` CSS with chat bubble CSS)
- Modify: `electron/ui/dashboard.html:3595-3625` (replace page HTML)
- Modify: `electron/ui/dashboard.html:4987-4989` (update `switchPage` handler for chat)
- Modify: `electron/ui/dashboard.html:5825-5826` (remove `prewarmChatEmbed`)
- Modify: `electron/ui/dashboard.html:7066-7073` (remove bot-status chat embed logic)
- Modify: `electron/ui/dashboard.html:5742-5751` (remove 'chat' from `EMBED_URLS`/`EMBED_PARTITIONS`/`embedLoaded`)

- [ ] **Step 1: Replace `.chat-shell` CSS block (lines 633-640) with chat UI styles**

Remove these lines:
```css
.chat-shell { display:flex; ... }
.chat-shell-toolbar { ... }
.chat-shell-title { ... }
.chat-shell-sub { ... }
.chat-shell-actions { ... }
.chat-status-pill { ... }
.chat-status-pill::before { ... }
.chat-shell .embed-wrap { ... }
```

Replace with:
```css
.chat-container { display:flex; flex-direction:column; flex:1; min-height:0; border:1px solid var(--border); border-radius:12px; overflow:hidden; background:var(--surface); box-shadow:var(--shadow); }
.chat-messages { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:4px; }
.chat-bubble-group { display:flex; flex-direction:column; gap:2px; margin-bottom:12px; }
.chat-bubble-group.user { align-items:flex-end; }
.chat-bubble-group.bot { align-items:flex-start; }
.chat-bubble { max-width:70%; padding:10px 14px; font-size:13px; line-height:1.5; word-break:break-word; white-space:pre-wrap; }
.chat-bubble.user { background:var(--accent); color:#fff; border-radius:12px 12px 4px 12px; }
.chat-bubble.bot { background:var(--bg); color:var(--text-secondary); border-radius:12px 12px 12px 4px; border:1px solid var(--border); }
.chat-time { font-size:10px; color:var(--text-muted); margin-top:2px; padding:0 4px; }
.chat-input-bar { display:flex; align-items:flex-end; gap:8px; padding:12px; border-top:1px solid var(--border); background:var(--surface-elevated); flex-shrink:0; }
.chat-input-bar textarea { flex:1; resize:none; border:1px solid var(--border); border-radius:10px; padding:10px 14px; font-size:13px; color:var(--text); background:var(--bg); outline:none; font-family:inherit; max-height:120px; line-height:1.4; }
.chat-input-bar textarea:focus { border-color:var(--accent); }
.chat-send-btn { width:40px; height:40px; border-radius:10px; border:none; background:var(--accent); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:opacity .15s; }
.chat-send-btn:hover { opacity:.85; }
.chat-send-btn:disabled { opacity:.4; cursor:default; }
.chat-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; color:var(--text-muted); padding:40px 20px; text-align:center; }
.chat-empty-title { font-size:15px; font-weight:600; color:var(--text); }
.chat-empty-sub { font-size:13px; }
.chat-prompt-chips { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
.chat-prompt-chip { padding:8px 14px; border-radius:999px; border:1px solid var(--border); background:var(--surface); color:var(--text-secondary); font-size:12px; cursor:pointer; transition:border-color .15s, background .15s; }
.chat-prompt-chip:hover { border-color:var(--accent); background:var(--accent-soft, rgba(200,167,90,.06)); }
.chat-typing { display:flex; align-items:center; gap:4px; padding:10px 14px; }
.chat-typing span { width:6px; height:6px; border-radius:50%; background:var(--text-muted); animation:chatDot 1.4s infinite ease-in-out both; }
.chat-typing span:nth-child(1) { animation-delay:0s; }
.chat-typing span:nth-child(2) { animation-delay:.2s; }
.chat-typing span:nth-child(3) { animation-delay:.4s; }
@keyframes chatDot { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
.chat-error { padding:10px 14px; font-size:12px; color:var(--warning); background:rgba(229,57,53,.08); border-radius:8px; margin:8px 0; text-align:center; }
```

- [ ] **Step 2: Replace `#page-chat` HTML (lines 3595-3625)**

Remove the entire `<!-- PAGE: Chat (embedded OpenClaw chat UI) -->` block and replace with:

```html
<!-- PAGE: Chat (native in-app chat) -->
<div class="page" id="page-chat">
  <div class="page-header">
    <span class="page-icon" data-icon="messages-square" data-icon-size="26"></span>
    <div><h2>Chat</h2><div class="page-sub">Trò chuyện trực tiếp với trợ lý AI</div></div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:flex-start"></div>
  </div>
  <div class="chat-container">
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-bar">
      <textarea id="chat-input" rows="1" placeholder="Nhập tin nhắn..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMsg()}"></textarea>
      <button class="chat-send-btn" id="chat-send-btn" onclick="sendChatMsg()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add chat JS functions**

Add these functions in the `<script>` section of dashboard.html (after the page navigation block, around line 5015):

```javascript
// ============================================
//  NATIVE CHAT
// ============================================
let _chatLastSeenTs = 0;
let _chatSending = false;
let _chatPollTimer = null;
let _chatInitialized = false;

function renderChatEmpty() {
  var el = document.getElementById('chat-messages');
  el.innerHTML = '';
  var empty = document.createElement('div');
  empty.className = 'chat-empty';
  empty.innerHTML = '<div class="chat-empty-title">Chat</div>' +
    '<div class="chat-empty-sub">Bắt đầu trò chuyện với trợ lý AI</div>' +
    '<div class="chat-prompt-chips">' +
      '<div class="chat-prompt-chip" onclick="sendChatPrompt(this)">Báo cáo hôm nay</div>' +
      '<div class="chat-prompt-chip" onclick="sendChatPrompt(this)">Kiểm tra đơn hàng</div>' +
      '<div class="chat-prompt-chip" onclick="sendChatPrompt(this)">Tình hình Zalo</div>' +
    '</div>';
  el.appendChild(empty);
}

function sendChatPrompt(chip) {
  var text = chip.textContent;
  document.getElementById('chat-input').value = text;
  sendChatMsg();
}

function renderChatBubble(role, text, ts) {
  var group = document.createElement('div');
  group.className = 'chat-bubble-group ' + (role === 'user' ? 'user' : 'bot');
  var bubble = document.createElement('div');
  bubble.className = 'chat-bubble ' + (role === 'user' ? 'user' : 'bot');
  bubble.textContent = text;
  group.appendChild(bubble);
  if (ts) {
    var time = document.createElement('div');
    time.className = 'chat-time';
    time.textContent = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    group.appendChild(time);
  }
  return group;
}

function scrollChatToBottom() {
  var el = document.getElementById('chat-messages');
  requestAnimationFrame(function() { el.scrollTop = el.scrollHeight; });
}

function showChatTyping() {
  var el = document.getElementById('chat-messages');
  var existing = el.querySelector('.chat-typing-wrap');
  if (existing) return;
  var group = document.createElement('div');
  group.className = 'chat-bubble-group bot chat-typing-wrap';
  group.innerHTML = '<div class="chat-typing"><span></span><span></span><span></span></div>';
  el.appendChild(group);
  scrollChatToBottom();
}

function removeChatTyping() {
  var el = document.getElementById('chat-messages');
  var t = el.querySelector('.chat-typing-wrap');
  if (t) t.remove();
}

async function sendChatMsg() {
  var input = document.getElementById('chat-input');
  var text = (input.value || '').trim();
  if (!text || _chatSending) return;
  input.value = '';
  input.style.height = 'auto';

  // Remove empty state if present
  var empty = document.querySelector('#chat-messages .chat-empty');
  if (empty) empty.remove();

  // Append user bubble
  var el = document.getElementById('chat-messages');
  el.appendChild(renderChatBubble('user', text, Date.now()));
  scrollChatToBottom();

  // Show typing indicator + send
  _chatSending = true;
  document.getElementById('chat-send-btn').disabled = true;
  showChatTyping();

  try {
    var result = await window.claw.sendChatMessage(text);
    removeChatTyping();
    if (result.ok && result.reply) {
      el.appendChild(renderChatBubble('assistant', result.reply, Date.now()));
    } else {
      var errMsg = result.error === 'BOOT_IN_PROGRESS'
        ? 'Hệ thống đang khởi động, vui lòng chờ...'
        : result.error === 'gateway_offline'
          ? 'Trợ lý chưa sẵn sàng. Vui lòng chờ bot khởi động.'
          : 'Lỗi: ' + (result.error || 'unknown');
      var errDiv = document.createElement('div');
      errDiv.className = 'chat-error';
      errDiv.textContent = errMsg;
      el.appendChild(errDiv);
    }
  } catch (e) {
    removeChatTyping();
    var errDiv2 = document.createElement('div');
    errDiv2.className = 'chat-error';
    errDiv2.textContent = 'Lỗi kết nối: ' + (e.message || 'unknown');
    el.appendChild(errDiv2);
  }
  _chatSending = false;
  document.getElementById('chat-send-btn').disabled = false;
  scrollChatToBottom();
}

async function loadChatHistory() {
  if (_chatSending) return;
  try {
    var messages = await window.claw.getChatHistory();
    if (!messages || !messages.length) {
      if (!_chatInitialized) { renderChatEmpty(); _chatInitialized = true; }
      return;
    }
    var el = document.getElementById('chat-messages');
    var newMsgs = messages.filter(function(m) { return m.ts > _chatLastSeenTs; });
    if (!_chatInitialized) {
      // First load — render all
      el.innerHTML = '';
      messages.forEach(function(m) {
        el.appendChild(renderChatBubble(m.role, m.text, m.ts));
      });
      _chatLastSeenTs = messages[messages.length - 1].ts;
      _chatInitialized = true;
      scrollChatToBottom();
    } else if (newMsgs.length > 0) {
      // Incremental — append only new
      newMsgs.forEach(function(m) {
        el.appendChild(renderChatBubble(m.role, m.text, m.ts));
      });
      _chatLastSeenTs = newMsgs[newMsgs.length - 1].ts;
      scrollChatToBottom();
    }
  } catch (e) {
    console.warn('[chat] history load error:', e);
  }
}

function startChatPoll() {
  if (_chatPollTimer) return;
  loadChatHistory();
  _chatPollTimer = setInterval(loadChatHistory, 20000);
}

function stopChatPoll() {
  if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
}
```

- [ ] **Step 4: Update `switchPage` handler for chat**

In `switchPage()` function (line ~4987), replace:
```javascript
if (page === '9router' || page === 'openclaw' || page === 'chat') {
  ensureEmbedLoaded(page);
}
```
with:
```javascript
if (page === '9router' || page === 'openclaw') {
  ensureEmbedLoaded(page);
}
if (page === 'chat') {
  startChatPoll();
} else {
  stopChatPoll();
}
```

- [ ] **Step 5: Add auto-grow behavior for textarea**

Add after the chat functions:
```javascript
document.addEventListener('DOMContentLoaded', function() {
  var chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  }
});
```

- [ ] **Step 6: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat(chat): native chat UI — bubbles, input, polling, empty state"
```

---

## Chunk 3: Cleanup

### Task 4: Remove webview/prewarm code for chat

**Files:**
- Modify: `electron/ui/dashboard.html:622` (update comment — remove "Chat")
- Modify: `electron/ui/dashboard.html:5740` (update comment — remove "Chat")
- Modify: `electron/ui/dashboard.html:5742-5751` (remove `chat` from embed maps)
- Modify: `electron/ui/dashboard.html:5825-5827` (remove `prewarmChatEmbed`)
- Modify: `electron/ui/dashboard.html:7066-7073` (remove bot-status chat embed logic)
- Modify: `electron/scripts/check-openclaw-launchers.js:16-18` (remove chat prewarm checks)
- Modify: `electron/scripts/check-premium-theme-no-updates.js:30-31` (remove chat-shell + prewarm checks)

- [ ] **Step 1: Update section comments**

In `dashboard.html` line 622, change:
```css
/* Embedded web UI pages (9Router, OpenClaw, Chat) */
```
to:
```css
/* Embedded web UI pages (9Router, OpenClaw) */
```

Around line 5740, change:
```javascript
//  EMBEDDED WEB UI (9Router + OpenClaw + Chat)
```
to:
```javascript
//  EMBEDDED WEB UI (9Router + OpenClaw)
```

- [ ] **Step 2: Remove `chat` from embed maps**

In `dashboard.html` around line 5742, change:
```javascript
const embedLoaded = { '9router': false, 'openclaw': false, 'chat': false };
const EMBED_URLS = {
  '9router': 'http://127.0.0.1:20128/',
  'openclaw': 'http://127.0.0.1:18789/',
  'chat': 'http://127.0.0.1:18789/chat',
};
const EMBED_PARTITIONS = {
  '9router': 'persist:embed-9router',
  'openclaw': 'persist:embed-openclaw',
  'chat': 'persist:embed-openclaw',
};
```
to:
```javascript
const embedLoaded = { '9router': false, 'openclaw': false };
const EMBED_URLS = {
  '9router': 'http://127.0.0.1:20128/',
  'openclaw': 'http://127.0.0.1:18789/',
};
const EMBED_PARTITIONS = {
  '9router': 'persist:embed-9router',
  'openclaw': 'persist:embed-openclaw',
};
```

- [ ] **Step 3: Remove `prewarmChatEmbed` function**

Delete lines 5825-5827:
```javascript
function prewarmChatEmbed() {
  try { ensureEmbedLoaded('chat', { silent: true }); } catch (e) { console.warn('[embed] chat prewarm failed:', e); }
}
```

Also search for any call site of `prewarmChatEmbed()` and remove it.

- [ ] **Step 4: Remove bot-status chat embed auto-load**

Around line 7066-7073, remove the chat-specific embed logic:
```javascript
if (data.running && currentPage === 'chat') {
  if (!embedLoaded['chat']) ensureEmbedLoaded('chat', { silent: true });
  else {
    var chatWv = document.getElementById('iframe-chat');
    if (chatWv && chatWv.style.visibility === 'hidden') retryEmbed('chat');
  }
}
```

- [ ] **Step 5: Update smoke/check scripts**

In `electron/scripts/check-openclaw-launchers.js`, remove lines referencing chat prewarm (line 16-17):
```javascript
'prewarmChatEmbed',
"ensureEmbedLoaded('chat', { silent: true })",
```

In `electron/scripts/check-premium-theme-no-updates.js`, remove BOTH line 30 and 31:
```javascript
['clean chat shell class', 'chat-shell'],
['chat prewarm helper', 'prewarmChatEmbed'],
```

Replace with:
```javascript
['native chat container class', 'chat-container'],
```

Also update line 18 of check-openclaw-launchers.js — change:
```javascript
"if (page === '9router' || page === 'openclaw' || page === 'chat')",
```
to:
```javascript
"if (page === '9router' || page === 'openclaw')",
```

And add new check entries for the native chat:
```javascript
'sendChatMsg',
'loadChatHistory',
'startChatPoll',
```

- [ ] **Step 6: Run smoke test**

```powershell
node electron/scripts/smoke-test.js
```

Expected: PASS. Verify no references to removed functions.

- [ ] **Step 7: Commit**

```bash
git add electron/ui/dashboard.html electron/scripts/check-openclaw-launchers.js electron/scripts/check-premium-theme-no-updates.js
git commit -m "refactor(chat): remove webview/prewarm code, update check scripts"
```

---

## Chunk 4: Integration test + system map

### Task 5: Final verification

- [ ] **Step 1: Regenerate system map**

```powershell
cd electron; node scripts/generate-system-map.js; cd ..
```

- [ ] **Step 2: Run full smoke test**

```powershell
node electron/scripts/smoke-test.js
```

- [ ] **Step 3: Commit system map**

```bash
git add electron/SYSTEM_MAP.md
git commit -m "chore: regenerate system map for native chat"
```

- [ ] **Step 4: Build EXE**

```powershell
npm run build:win
```
