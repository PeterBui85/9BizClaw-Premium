# Chat UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the in-app chat into a ChatGPT-class CEO experience with markdown rendering, file upload, streaming, follow-up suggestions, inline action buttons, and stop/progress indicator.

**Architecture:** Rewrite the chat page in dashboard.html (CSS + JS), extend chat.js backend with file upload + clear history + feedback + stop generation IPC handlers. Add `marked` + `DOMPurify` as `<script src>` dependencies. Parse `[SUGGESTIONS]` and `[ACTIONS]` blocks from bot responses. Add AGENTS.md rule for follow-ups.

**Tech Stack:** marked.js, DOMPurify, Lucide icons, existing CSS variables, existing IPC pattern

**Spec:** `docs/superpowers/specs/2026-05-17-chat-ui-redesign-design.md`

---

## File Map

| File | Responsibility | Action |
|------|---------------|--------|
| `electron/package.json` | Dependencies | Add `marked`, `dompurify` |
| `electron/ui/dashboard.html` | Chat UI (HTML + CSS + JS) | Rewrite chat section |
| `electron/lib/chat.js` | Chat backend (send, history, parse) | Add clear, upload, stop, parse suggestions/actions |
| `electron/preload.js` | IPC bridges | Add 4 new bridges |
| `electron/lib/dashboard-ipc.js` | IPC handlers | Add 3 new handlers |
| `AGENTS.md` | Bot rules | Add [SUGGESTIONS] rule |

---

## Chunk 1: Dependencies + Backend

### Task 1: Install dependencies

**Files:**
- Modify: `electron/package.json`

- [ ] **Step 1:** Install marked + dompurify

```bash
cd electron && npm install marked@15 dompurify@3 --save --no-audit --no-fund
```

- [ ] **Step 2:** Pin exact versions in package.json (remove ^ if present)

- [ ] **Step 3:** Verify loading works in Electron renderer context

```bash
node -e "require('marked'); console.log('marked OK')"
node -e "require('dompurify'); console.log('dompurify OK')"
```

- [ ] **Step 4:** Verify `<script src>` path exists

```bash
ls electron/node_modules/marked/marked.min.js
ls electron/node_modules/dompurify/dist/purify.min.js
```

- [ ] **Step 5:** Commit

### Task 2: Extend chat.js backend

**Files:**
- Modify: `electron/lib/chat.js`

- [ ] **Step 1:** Add `extractSuggestions(text)` function

```javascript
function extractSuggestions(text) {
  const match = text.match(/\[SUGGESTIONS\]\n([\s\S]*?)\n\[\/SUGGESTIONS\]/);
  if (!match) return { cleanText: text, suggestions: [] };
  const suggestions = match[1].split('\n')
    .map(l => l.replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 4);
  return { cleanText: text.replace(match[0], '').trim(), suggestions };
}
```

- [ ] **Step 2:** Add `extractActions(text)` function

```javascript
function extractActions(text) {
  const match = text.match(/\[ACTIONS\]\n([\s\S]*?)\n\[\/ACTIONS\]/);
  if (!match) return { cleanText: text, actions: [] };
  const actions = match[1].split('\n').map(l => {
    const [label, action] = l.replace(/^-\s*/, '').split('|');
    return { label: (label || '').trim(), action: (action || '').trim() };
  }).filter(a => a.label).slice(0, 4);
  return { cleanText: text.replace(match[0], '').trim(), actions };
}
```

- [ ] **Step 3:** Integrate parsing into `sendChatMessage` return value

In `sendChatMessage`, after extracting `reply` text, add:
```javascript
const { cleanText: t1, suggestions } = extractSuggestions(reply);
const { cleanText: finalReply, actions } = extractActions(t1);
// Store finalReply (without blocks) in history
// Return: { ok: true, reply: finalReply, mediaUrls, suggestions, actions }
```

- [ ] **Step 4:** Add `clearChatHistory()` export

```javascript
function clearChatHistory() {
  try {
    const p = path.join(getWorkspace(), 'logs', 'chat-history.jsonl');
    if (fs.existsSync(p)) fs.writeFileSync(p, '', 'utf-8');
    return { success: true };
  } catch (e) { return { error: e.message }; }
}
```

- [ ] **Step 5:** Add `_currentAgentProcess` tracking + `stopGeneration()`

```javascript
let _currentAgentProcess = null;

// Inside sendChatMessage, after spawning agent:
_currentAgentProcess = agentProcess;
// After response received:
_currentAgentProcess = null;

function stopGeneration() {
  if (_currentAgentProcess) {
    try { _currentAgentProcess.kill('SIGTERM'); } catch {}
    _currentAgentProcess = null;
    return { stopped: true };
  }
  return { stopped: false };
}
```

- [ ] **Step 6:** Export new functions

```javascript
module.exports = { sendChatMessage, getChatHistory, clearChatHistory, stopGeneration, registerChatIpc };
```

- [ ] **Step 7:** Commit

### Task 3: Add IPC handlers + preload bridges

**Files:**
- Modify: `electron/lib/dashboard-ipc.js`
- Modify: `electron/preload.js`

- [ ] **Step 1:** Add IPC handlers in dashboard-ipc.js

```javascript
ipcMain.handle('clear-chat-history', async () => {
  try { return chat.clearChatHistory(); }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('upload-chat-file', async (_ev, { filePath, fileName }) => {
  try {
    if (!fileName || /[\/\\]/.test(fileName) || fileName.includes('..'))
      return { error: 'Invalid filename' };
    const stat = fs.statSync(filePath);
    if (stat.size > 10 * 1024 * 1024) return { error: 'File quá lớn (tối đa 10MB)' };
    const allowed = ['.pdf','.docx','.xlsx','.jpg','.jpeg','.png','.txt'];
    if (!allowed.includes(path.extname(fileName).toLowerCase()))
      return { error: 'Định dạng không hỗ trợ' };
    const uploadsDir = path.join(getWorkspace(), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const dest = path.join(uploadsDir, safeName);
    fs.copyFileSync(filePath, dest);
    return { path: dest, name: fileName };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('log-chat-feedback', async (_ev, { rating, msgTs }) => {
  try {
    const p = path.join(getWorkspace(), 'logs', 'chat-feedback.jsonl');
    const entry = JSON.stringify({ ts: Date.now(), rating, msgTs }) + '\n';
    fs.appendFileSync(p, entry, 'utf-8');
    return { success: true };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('stop-chat-generation', async () => {
  try { return chat.stopGeneration(); }
  catch (e) { return { error: e.message }; }
});
```

- [ ] **Step 2:** Add preload bridges

```javascript
clearChatHistory: () => ipcRenderer.invoke('clear-chat-history'),
uploadChatFile: (filePath, fileName) => ipcRenderer.invoke('upload-chat-file', { filePath, fileName }),
logChatFeedback: (rating, msgTs) => ipcRenderer.invoke('log-chat-feedback', { rating, msgTs }),
stopChatGeneration: () => ipcRenderer.invoke('stop-chat-generation'),
```

- [ ] **Step 3:** Commit

### Task 4: Add AGENTS.md suggestions rule

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1:** Add rule in the "An toàn + Phân quyền kênh" section

```markdown
**Chat trong app:** Mỗi reply từ chat trong app (không phải Telegram/Zalo) PHẢI kết thúc bằng:
\```
[SUGGESTIONS]
- Gợi ý 1 cụ thể
- Gợi ý 2 cụ thể  
- Gợi ý 3 (tùy chọn)
[/SUGGESTIONS]
\```
Gợi ý phải cụ thể, hành động được, liên quan đến nội dung vừa trả lời. KHÔNG gợi ý chung chung.
Khi có đề xuất hành động (gửi Zalo, tạo file, duyệt...), thêm block:
\```
[ACTIONS]
- Nhãn nút|action_id
[/ACTIONS]
\```
```

- [ ] **Step 2:** Commit

---

## Chunk 2: Chat UI Rewrite (CSS + HTML)

### Task 5: Rewrite chat CSS

**Files:**
- Modify: `electron/ui/dashboard.html` (CSS section)

- [ ] **Step 1:** Replace all chat CSS (search for `.chat-container` through `.chat-prompt-chip`)

New CSS covers:
- `.chat-container` — full height flex column
- `.chat-top-bar` — top bar with avatar + buttons
- `.chat-messages` — scrollable message area, max-width 720px centered
- `.chat-msg.bot` — left-aligned with avatar
- `.chat-msg.user` — right-aligned accent bubble
- `.chat-avatar` — 28px rounded gradient square
- `.chat-body` — flex column for content + actions
- `.chat-content.markdown-body` — markdown styles (headings, lists, code, tables, blockquotes)
- `.chat-content pre code` — monospace, surface background, border-radius 8px, copy button header
- `.chat-actions` — row of icon buttons, opacity 0 → 1 on hover
- `.chat-action` — small outline button with Lucide icon
- `.chat-suggestions` — flex-wrap row of pill chips
- `.chat-suggestion-chip` — border pill, accent on hover
- `.chat-action-cards` — flex row of prominent buttons
- `.chat-action-card` — accent bg primary, outline secondary
- `.chat-typing-body` — dots + label + stop button
- `.chat-stop-btn` — small red outline button
- `.chat-time` — 10px muted timestamp
- `.chat-input-bar` — pill shape, paperclip left, send right
- `.chat-drop-zone` — dashed border overlay
- `.chat-empty` — centered logo + 2x2 grid chips

All using `var(--accent)`, `var(--bg)`, `var(--surface)`, `var(--border)`, `var(--text)`, `var(--text-muted)` — NO hardcoded colors.

- [ ] **Step 2:** Commit

### Task 6: Rewrite chat HTML structure

**Files:**
- Modify: `electron/ui/dashboard.html` (HTML section)

- [ ] **Step 1:** Replace `#page-chat` HTML

```html
<div class="page" id="page-chat">
  <div class="chat-container">
    <!-- Top bar -->
    <div class="chat-top-bar">
      <div class="chat-top-left">
        <div class="chat-avatar">9B</div>
        <div>
          <div class="chat-top-name">9BizClaw</div>
          <div class="chat-top-sub">Trợ lý AI doanh nghiệp</div>
        </div>
      </div>
      <div class="chat-top-right">
        <button class="chat-top-btn" onclick="clearChat()" title="Xóa lịch sử">
          <span class="icon" data-icon="trash-2"></span> Xóa
        </button>
        <button class="chat-top-btn" onclick="newChat()" title="Chat mới">
          <span class="icon" data-icon="plus"></span> Mới
        </button>
      </div>
    </div>
    <!-- Messages -->
    <div class="chat-messages" id="chat-messages"></div>
    <!-- Input bar -->
    <div class="chat-input-bar">
      <button class="chat-attach-btn" onclick="pickChatFile()" title="Đính kèm file">
        <span class="icon" data-icon="paperclip"></span>
      </button>
      <textarea id="chat-input" rows="1" placeholder="Nhập tin nhắn cho 9BizClaw..."
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMsg()}"></textarea>
      <button class="chat-send-btn" id="chat-send-btn" onclick="sendChatMsg()">
        <span class="icon" data-icon="arrow-right"></span>
      </button>
    </div>
    <div class="chat-input-hint">Kéo thả file vào đây để gửi cho bot</div>
    <!-- Drop zone overlay -->
    <div class="chat-drop-zone" id="chat-drop-zone">
      <span class="icon" data-icon="file-up" style="font-size:32px"></span>
      <div>Thả file vào đây</div>
      <div class="chat-drop-sub">PDF, Word, Excel, ảnh — tối đa 10MB</div>
    </div>
  </div>
</div>
```

- [ ] **Step 2:** Add `<script src>` tags for marked + DOMPurify (before closing `</body>`)

```html
<script src="../node_modules/marked/marked.min.js"></script>
<script src="../node_modules/dompurify/dist/purify.min.js"></script>
```

- [ ] **Step 3:** Commit

---

## Chunk 3: Chat JS Rewrite

### Task 7: Core rendering functions

**Files:**
- Modify: `electron/ui/dashboard.html` (JS section)

- [ ] **Step 1:** Add `renderMarkdown(text)` — marked + DOMPurify

```javascript
function renderMarkdown(text) {
  if (!window.marked || !window.DOMPurify) return escHtml(text);
  const raw = marked.parse(text, { breaks: true, gfm: true });
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p','br','strong','em','del','ul','ol','li','h1','h2','h3',
                   'h4','code','pre','blockquote','table','thead','tbody','tr',
                   'th','td','a','img'],
    ALLOWED_ATTR: ['href','src','alt','class','target'],
  });
}
```

- [ ] **Step 2:** Rewrite `renderChatBubble(role, text, ts, mediaUrls, suggestions, actions)`

Bot messages: avatar + markdown body + media + actions + suggestions + timestamp.
User messages: right-aligned plain text bubble + timestamp.
All icons via Lucide `data-icon`.

- [ ] **Step 3:** Add `streamBotReply(fullText, container)` — by-sentence streaming

```javascript
async function streamBotReply(fullText, container) {
  const sentences = fullText.split(/(?<=[.!?\n])\s+/);
  let accumulated = '';
  for (const s of sentences) {
    accumulated += (accumulated ? ' ' : '') + s;
    container.innerHTML = renderMarkdown(accumulated) + '<span class="chat-cursor">|</span>';
    scrollChatToBottom();
    await new Promise(r => setTimeout(r, 60 + Math.random() * 40));
  }
  container.innerHTML = renderMarkdown(fullText);
}
```

- [ ] **Step 4:** Commit

### Task 8: Rewrite sendChatMsg + loadChatHistory

**Files:**
- Modify: `electron/ui/dashboard.html` (JS section)

- [ ] **Step 1:** Rewrite `sendChatMsg()`

Flow:
1. Validate input
2. Remove empty state
3. Append user bubble (right-aligned, plain text)
4. Show typing indicator with "Đang suy nghĩ..." + stop button
5. Pause polling
6. Call `window.claw.sendChatMessage(text)`
7. Remove typing
8. Stream bot reply by sentence
9. Render suggestions chips (if any)
10. Render action buttons (if any)
11. Resume polling

- [ ] **Step 2:** Rewrite `loadChatHistory()`

Fix: pass `mediaUrls` to `renderChatBubble` (pre-existing bug).
Add: `_chatNewChatTs` filter (skip messages older than "New Chat" marker).

- [ ] **Step 3:** Add `renderChatEmpty()` — 2x2 grid with Lucide icons

4 chips: Báo cáo hôm nay, Zalo chưa trả lời, Công nợ quá hạn, Soạn báo giá.
Each with icon + title + description. Clicking auto-sends.

- [ ] **Step 4:** Commit

### Task 9: Premium features JS

**Files:**
- Modify: `electron/ui/dashboard.html` (JS section)

- [ ] **Step 1:** Add suggestion chips rendering

After bot message, if `suggestions.length > 0`:
```javascript
const chipRow = document.createElement('div');
chipRow.className = 'chat-suggestions';
for (const s of suggestions) {
  const chip = document.createElement('button');
  chip.className = 'chat-suggestion-chip';
  chip.textContent = s;
  chip.onclick = () => { sendChatPrompt(s); chipRow.remove(); };
  chipRow.appendChild(chip);
}
```

Only show on LAST bot message. Previous suggestions removed.

- [ ] **Step 2:** Add action buttons rendering

After bot message, if `actions.length > 0`:
```javascript
const actionRow = document.createElement('div');
actionRow.className = 'chat-action-cards';
for (const a of actions) {
  const btn = document.createElement('button');
  btn.className = 'chat-action-card' + (a.action === 'dismiss' ? ' secondary' : '');
  btn.innerHTML = `${a.label}`;
  btn.onclick = () => { handleChatAction(a); actionRow.remove(); };
  actionRow.appendChild(btn);
}
```

`handleChatAction(a)`: maps `a.action` to a user message and auto-sends.

- [ ] **Step 3:** Add stop generation + progress

Typing indicator shows tool-use label + stop button:
```javascript
function showChatTyping(label = 'Đang suy nghĩ...') {
  // ... existing dots + label text + stop button
}

function updateChatTypingLabel(label) {
  const el = document.querySelector('.chat-typing-label');
  if (el) el.textContent = label;
}

async function stopChatGeneration() {
  await window.claw.stopChatGeneration();
  removeChatTyping();
  // Append info message
}
```

- [ ] **Step 4:** Add copy/retry/feedback action handlers

```javascript
function handleChatMsgAction(btn, action, msgEl) {
  if (action === 'copy') {
    const raw = msgEl.querySelector('.chat-content')?.innerText || '';
    navigator.clipboard.writeText(raw);
    // Flash "Đã copy!" on button
  } else if (action === 'retry') {
    const userMsg = msgEl.dataset.userMsg;
    if (userMsg) { msgEl.remove(); sendChatPrompt(userMsg); }
  } else if (action === 'like' || action === 'dislike') {
    window.claw.logChatFeedback(action === 'like' ? 'positive' : 'negative', msgEl.dataset.ts);
    btn.style.color = 'var(--accent)';
  }
}
```

- [ ] **Step 5:** Commit

### Task 10: File upload (drag-drop + picker)

**Files:**
- Modify: `electron/ui/dashboard.html` (JS section)

- [ ] **Step 1:** Add drag-drop event handlers on `.chat-container`

```javascript
const chatContainer = document.querySelector('.chat-container');
chatContainer.addEventListener('dragover', (e) => {
  e.preventDefault(); e.stopPropagation();
  document.getElementById('chat-drop-zone').classList.add('active');
});
chatContainer.addEventListener('dragleave', (e) => {
  e.preventDefault();
  document.getElementById('chat-drop-zone').classList.remove('active');
});
chatContainer.addEventListener('drop', async (e) => {
  e.preventDefault(); e.stopPropagation();
  document.getElementById('chat-drop-zone').classList.remove('active');
  const file = e.dataTransfer.files[0];
  if (file) await uploadAndSendFile(file.path, file.name);
});
```

- [ ] **Step 2:** Add `pickChatFile()` — native file picker

```javascript
async function pickChatFile() {
  const result = await window.claw.pickFile();
  if (result?.filePath) await uploadAndSendFile(result.filePath, result.fileName);
}
```

- [ ] **Step 3:** Add `uploadAndSendFile(filePath, fileName)`

```javascript
async function uploadAndSendFile(filePath, fileName) {
  const result = await window.claw.uploadChatFile(filePath, fileName);
  if (result.error) { showToast(result.error, 'error'); return; }
  // Send message with file reference
  const msg = `[Đính kèm: ${fileName}]\nĐọc file này và tóm tắt nội dung cho anh.`;
  sendChatPrompt(msg);
}
```

- [ ] **Step 4:** Add `pickFile` IPC + preload bridge (if not exists)

Check if `pick-knowledge-file` can be reused. If not, add a simpler `pick-chat-file` handler.

- [ ] **Step 5:** Commit

---

## Chunk 4: Polish + Test

### Task 11: Smoke test + system map

- [ ] **Step 1:** Run full smoke test

```bash
cd electron && npm run smoke
```

Fix any failures (system map stale, missing exports, etc.)

- [ ] **Step 2:** Verify dashboard.html JS syntax

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('ui/dashboard.html','utf-8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);for(let i=0;i<m.length;i++){try{new Function(m[i].replace(/^<script[^>]*>/,'').replace(/<\/script>$/,''));}catch(e){console.error('Block',i,':',e.message);process.exit(1);}}console.log('JS OK');"
```

- [ ] **Step 3:** Regenerate system map

```bash
npm run map:generate
```

- [ ] **Step 4:** Manual test checklist

| Test | Expected |
|------|----------|
| Open Chat tab | Empty state with 2x2 prompt grid |
| Click "Báo cáo hôm nay" chip | Sends message, bot replies with markdown |
| Bot reply has bold/lists | Rendered properly, not raw `**text**` |
| Bot reply has code block | Monospace background + copy button |
| Hover bot message | Copy/Retry/Thumbs buttons appear |
| Click Copy | Text copied to clipboard, button flashes |
| Click Retry | Old response removed, re-sends |
| Drag PDF onto chat | Drop zone appears, file uploaded, bot reads |
| Click 📎 | File picker opens |
| Bot suggests follow-ups | 2-3 chips appear below response |
| Click suggestion chip | Sends as new message |
| Bot suggests action | "Gửi Zalo" button appears, click sends command |
| Long response | Streams by sentence, cursor blinks |
| Press "Dừng lại" during wait | Generation stops |
| Click "Xóa" top bar | History cleared |
| Click "+ Mới" top bar | Messages hidden, fresh start |
| Dark mode | All colors correct via CSS variables |
| Light mode | All colors correct via CSS variables |

- [ ] **Step 5:** Build EXE + test

```bash
npm run build:win
```

- [ ] **Step 6:** Commit final

---

## Risk Notes

- `marked` library loaded via `<script src>` — verify exact path in packaged asar (may need `asarUnpack` or relative path adjustment)
- `[SUGGESTIONS]` / `[ACTIONS]` blocks depend on AGENTS.md rule — LLM compliance ~70-80%. Graceful fallback: if blocks missing, no chips/buttons shown (not an error)
- Stop generation kills the agent process — any in-flight tool calls (web_fetch, exec) will be orphaned. Acceptable tradeoff for CEO UX.
- File upload creates `uploads/` dir — no auto-cleanup. Files persist until manual delete. Acceptable for CEO use (files are small, disk is large).
