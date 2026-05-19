# Chat UI Redesign — "ChatGPT-class" Design Spec

## Goal

Transform the in-app chat from a bland text-only messenger into a ChatGPT-class experience — markdown rendering, file upload, streaming feel, smart prompts, action buttons — while keeping Layout B (no sidebar, no sessions).

## Context

- **Current state:** Plain text bubbles, 3 static prompt chips, no markdown, no file upload, no copy/retry, polling-based (20s)
- **Benchmark:** ChatGPT Free (centered layout, no sidebar)
- **Use case:** CEO uses alongside Telegram — complement for on-desktop work
- **Constraint:** No sessions/conversations (single chat history). "New Chat" sets a timestamp marker — messages before it hidden from view, file kept as backup.
- **Hard rules:** No emoji in UI (Lucide icons only). Vietnamese diacritics required. Premium aesthetic.

## Architecture

### Dependencies (new)

| Package | Size (gzip) | Purpose | Loading method |
|---------|-------------|---------|----------------|
| `marked` | ~8KB | Markdown to HTML | `<script src>` in dashboard.html |
| `DOMPurify` | ~7KB | Sanitize rendered HTML (XSS prevention) | `<script src>` in dashboard.html |

**No highlight.js** — use CSS-only code block styling (monospace font + background). Saves 15KB and avoids complexity. Code blocks are rare in CEO chat.

**Loading:** Renderer is sandboxed (`contextIsolation: true`, no `require()`). Libraries loaded via `<script src="../node_modules/marked/marked.min.js">` and `<script src="../node_modules/dompurify/dist/purify.min.js">` — same pattern as fullcalendar.

### Files to modify

| File | Changes |
|------|---------|
| `electron/ui/dashboard.html` | Chat page HTML + CSS rewrite, new JS functions |
| `electron/lib/chat.js` | Add `clearChatHistory()`, file upload handling |
| `electron/preload.js` | Add `uploadChatFile`, `clearChatHistory`, `logChatFeedback` bridges |
| `electron/lib/dashboard-ipc.js` | Add `upload-chat-file`, `clear-chat-history`, `log-chat-feedback` IPC handlers |
| `electron/package.json` | Add `marked`, `dompurify` to dependencies |

## Design

### 1. Layout (Layout B — no sidebar)

```
+----------------------------------------------+
| [9B] 9BizClaw                  [Xoa] [+ Moi] |  <- top bar
+----------------------------------------------+
|                                               |
|  [9B] Bot message with **markdown**           |  <- left-aligned, avatar
|       - bullet lists                          |
|       code blocks (monospace bg)              |
|       [Copy] [Thu lai] [+1] [-1]              |  <- Lucide icons
|       9:32 SA                                 |
|                                               |
|                    User message -------[user] |  <- right-aligned, accent
|                                        9:33   |
|                                               |
|  [9B] ... dang xu ly...                       |  <- typing indicator
|                                               |
+----------------------------------------------+
| [clip] Nhap tin nhan...                  [->] |  <- input bar
|         Keo tha file vao day                  |
+----------------------------------------------+
```

### 2. Markdown Rendering (XSS-safe)

```javascript
function renderMarkdown(text) {
  const rawHtml = marked.parse(text, { breaks: true, gfm: true });
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['p','br','strong','em','del','ul','ol','li','h1','h2','h3',
                   'h4','code','pre','blockquote','table','thead','tbody','tr',
                   'th','td','a','img'],
    ALLOWED_ATTR: ['href','src','alt','class'],
    ADD_ATTR: ['target'],
  });
}
```

- Bot messages: rendered via `marked` + `DOMPurify` into `.innerHTML`
- User messages: `textContent` only (no markdown, no XSS risk)
- Links: `target="_blank"` + `rel="noopener"`
- Images from `mediaUrls`: rendered as `<img>` AFTER markdown content, max-width 320px (existing behavior preserved)

### 3. Message Components

**Bot message:**
```html
<div class="chat-msg bot">
  <div class="chat-avatar">9B</div>
  <div class="chat-body">
    <div class="chat-content markdown-body">
      <!-- DOMPurify-sanitized markdown HTML -->
    </div>
    <div class="chat-media"><!-- mediaUrls images if any --></div>
    <div class="chat-actions">
      <button class="chat-action" data-action="copy" title="Copy">
        <span class="icon" data-icon="clipboard"></span> Copy
      </button>
      <button class="chat-action" data-action="retry" title="Thu lai">
        <span class="icon" data-icon="refresh-cw"></span> Thu lai
      </button>
      <button class="chat-action" data-action="like" title="Tot">
        <span class="icon" data-icon="thumbs-up"></span>
      </button>
      <button class="chat-action" data-action="dislike" title="Chua tot">
        <span class="icon" data-icon="thumbs-down"></span>
      </button>
    </div>
    <div class="chat-time">9:32 SA</div>
  </div>
</div>
```

**User message:**
```html
<div class="chat-msg user">
  <div class="chat-bubble-user"><!-- textContent, no innerHTML --></div>
  <div class="chat-time">9:33 SA</div>
</div>
```

All icons use Lucide `data-icon` system (no emoji).

### 4. Streaming Simulation

Response arrives complete from backend. Simulated streaming by sentence chunks (not word-by-word — faster, less annoying):

```javascript
async function streamBotReply(fullText, container) {
  const sentences = fullText.split(/(?<=[.!?\n])\s+/);
  let accumulated = '';
  for (const sentence of sentences) {
    accumulated += (accumulated ? ' ' : '') + sentence;
    container.innerHTML = renderMarkdown(accumulated);
    scrollChatToBottom();
    await sleep(60 + Math.random() * 40); // 60-100ms per sentence
  }
  container.innerHTML = renderMarkdown(fullText);
}
```

- ~60-100ms per sentence (not per word) — a 10-sentence reply takes ~0.6-1s total animation
- Cursor element (`|`) shown at end during streaming, removed when complete
- **Polling paused** during streaming (`clearInterval(_chatPollTimer)`, restored after)

### 5. Smart Prompt Chips (Empty State)

2x2 grid with Lucide icons + descriptions:

| Chip | Icon (Lucide) | Description |
|------|---------------|-------------|
| Bao cao hom nay | `bar-chart-2` | Khach moi, doanh thu, cron |
| Zalo chua tra loi | `message-circle` | Khach cho phan hoi, follow-up |
| Cong no qua han | `banknote` | Don hang chua thanh toan |
| Soan bao gia | `file-text` | Tao file Word/PDF cho khach |

Chips disappear after first message. Clicking fills input + auto-sends.

### 6. File Upload (Drag & Drop)

**Supported:** PDF, DOCX, XLSX, JPG, PNG, TXT (max 10MB)

**Frontend flow:**
1. CEO drags file onto chat area OR clicks paperclip icon (Lucide `paperclip`)
2. Drop zone: dashed border `var(--accent)`, "Tha file vao day" text
3. Event handlers: `dragover` (prevent default + show zone), `dragleave` (hide), `drop` (process file)
4. Show file name in user bubble: "[ten-file.pdf] + optional text"
5. Send to backend via IPC

**Backend IPC handler (`upload-chat-file`):**
```javascript
ipcMain.handle('upload-chat-file', async (_ev, { filePath, fileName }) => {
  try {
    // Validate
    if (!fileName || /[\/\\]/.test(fileName) || fileName.includes('..')) {
      return { error: 'Invalid filename' };
    }
    const stat = fs.statSync(filePath);
    if (stat.size > 10 * 1024 * 1024) {
      return { error: 'File qua lon (toi da 10MB)' };
    }
    const allowed = ['.pdf','.docx','.xlsx','.jpg','.jpeg','.png','.txt'];
    const ext = path.extname(fileName).toLowerCase();
    if (!allowed.includes(ext)) {
      return { error: 'Dinh dang khong ho tro' };
    }
    // Copy to uploads dir
    const uploadsDir = path.join(getWorkspace(), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const dest = path.join(uploadsDir, safeName);
    fs.copyFileSync(filePath, dest);
    return { path: dest, name: fileName };
  } catch (e) {
    return { error: e.message };
  }
});
```

### 7. Action Buttons

Visible on hover (desktop), always visible on last message. All use Lucide icons.

| Button | Icon | Action |
|--------|------|--------|
| Copy | `clipboard` | `navigator.clipboard.writeText(rawText)` — raw text, not HTML |
| Thu lai | `refresh-cw` | Store last user msg in `data-user-msg` on bot bubble. Retry = re-send that text. Remove current bot response, show typing. |
| +1 | `thumbs-up` | Log to `chat-feedback.jsonl`: `{ ts, role:'feedback', rating:'positive', msgTs }` |
| -1 | `thumbs-down` | Log to `chat-feedback.jsonl`: `{ ts, role:'feedback', rating:'negative', msgTs }` |

**Feedback IPC:** `log-chat-feedback` handler appends JSONL line to `<workspace>/logs/chat-feedback.jsonl`.

### 8. Top Bar

| Element | Position | Action |
|---------|----------|--------|
| Bot avatar + "9BizClaw" + "Tro ly AI doanh nghiep" | Left | Static |
| "Xoa lich su" (Lucide `trash-2`) | Right | IPC `clear-chat-history` → truncates `chat-history.jsonl` → clears DOM |
| "+ Chat moi" (Lucide `plus`) | Right | Sets `_chatNewChatTs = Date.now()` → clears DOM → `loadChatHistory` filters messages older than marker |

**Clear history IPC:**
```javascript
ipcMain.handle('clear-chat-history', async () => {
  try {
    const p = path.join(getWorkspace(), 'logs', 'chat-history.jsonl');
    if (fs.existsSync(p)) fs.writeFileSync(p, '', 'utf-8');
    return { success: true };
  } catch (e) { return { error: e.message }; }
});
```

### 9. Input Bar

- Rounded pill shape (`border-radius: 20px`)
- Lucide `paperclip` icon left (opens native file picker via `dialog.showOpenDialog`)
- Auto-expanding textarea (max 200px)
- Lucide `arrow-right` in accent circle right (send button)
- Disabled + opacity during bot processing
- Hint: "Keo tha file vao day" below input (10px, muted)
- Enter = send, Shift+Enter = newline (unchanged)

### 10. Colors & Theme

All colors use CSS variables from dashboard theme. NO hardcoded hex values.

| Element | CSS |
|---------|-----|
| Bot avatar background | `var(--accent)` |
| User bubble | `var(--accent)` with white text |
| Bot text | `var(--text)` on `var(--bg)` |
| Code blocks | `var(--surface)` background, `var(--text-secondary)` text, monospace |
| Action buttons | `var(--text-muted)`, `var(--border)` border |
| Timestamps | `var(--text-muted)` 10px |
| Input bar | `var(--surface)` background, `var(--border)` border |

### 11. Preserved Behaviors

These existing features MUST remain unchanged:
- `_injectActiveSkills(text)` — skill injection before agent call
- 600s agent timeout
- `chat-history.jsonl` format (role, text, ts, mediaUrls)
- 512KB history file size cap with auto-trim
- Error display with localized messages (BOOT_IN_PROGRESS, no_chat_id, etc.)
- `_chatSending` guard against double-send
- 20s polling for new messages (paused during streaming, resumed after)
- `mediaUrls` image rendering (max 320px, below markdown content)

### 12. Suggested Follow-ups (Premium Feature #1)

After each bot response, the bot returns 2-3 suggested follow-up questions. Rendered as clickable chips below the action buttons.

**Backend:** `chat.js` parses bot response for suggestions. The agent is instructed (via AGENTS.md) to include a `[SUGGESTIONS]` block at the end of every reply:

```
[SUGGESTIONS]
- Nhac no anh A ngay
- Chi tiet 3 khach moi
- So sanh voi tuan truoc
[/SUGGESTIONS]
```

`chat.js` strips this block from the displayed text and returns it separately:
```javascript
function extractSuggestions(text) {
  const match = text.match(/\[SUGGESTIONS\]\n([\s\S]*?)\n\[\/SUGGESTIONS\]/);
  if (!match) return { cleanText: text, suggestions: [] };
  const suggestions = match[1].split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean);
  return { cleanText: text.replace(match[0], '').trim(), suggestions };
}
```

**Frontend:** Rendered as chips below the bot message:
```html
<div class="chat-suggestions">
  <button class="chat-suggestion-chip" onclick="sendChatPrompt(this.textContent)">
    Nhac no anh A ngay
  </button>
  <button class="chat-suggestion-chip" onclick="sendChatPrompt(this.textContent)">
    Chi tiet 3 khach moi
  </button>
</div>
```

CSS: pills with `var(--border)` outline, `var(--text-secondary)` text, hover accent highlight. Only shown on the LAST bot message (previous suggestions hidden).

**AGENTS.md rule addition:**
```
**Chat trong app:** Moi reply PHAI ket thuc bang block [SUGGESTIONS] chua 2-3 goi y follow-up. 
Goi y phai cu the, hanh dong duoc, lien quan den noi dung vua tra loi. KHONG goi y chung chung.
```

### 13. Inline Action Buttons in Bot Responses (Premium Feature #2)

When the bot suggests an action (send Zalo, create file, approve), it returns an `[ACTIONS]` block:

```
Anh Nguyen Van A qua han 3 ngay — 5,200,000 VND.

[ACTIONS]
- Gui nhac Zalo|send_zalo_reminder:nguyen_van_a
- Bo qua|dismiss
- Xem chi tiet don|view_order:nguyen_van_a
[/ACTIONS]
```

**Backend parsing:**
```javascript
function extractActions(text) {
  const match = text.match(/\[ACTIONS\]\n([\s\S]*?)\n\[\/ACTIONS\]/);
  if (!match) return { cleanText: text, actions: [] };
  const actions = match[1].split('\n').map(l => {
    const [label, action] = l.replace(/^-\s*/, '').split('|');
    return { label: label.trim(), action: (action || '').trim() };
  }).filter(a => a.label);
  return { cleanText: text.replace(match[0], '').trim(), actions };
}
```

**Frontend:** Rendered as prominent buttons:
```html
<div class="chat-action-cards">
  <button class="chat-action-card" onclick="handleChatAction('send_zalo_reminder:nguyen_van_a')">
    <span class="icon" data-icon="send"></span> Gui nhac Zalo
  </button>
  <button class="chat-action-card secondary" onclick="handleChatAction('dismiss')">
    Bo qua
  </button>
</div>
```

**Action handling:** `handleChatAction(action)` maps action strings to chat messages:
- `send_zalo_reminder:id` → sends "gui Zalo nhac [id]" as new user message
- `dismiss` → sends "bo qua" 
- `view_order:id` → sends "xem chi tiet don [id]"

The action essentially auto-types and sends a follow-up message. No new backend API needed — the existing chat pipeline handles it.

CSS: primary action = accent background + white text (like a real button). Secondary = outline only.

### 14. Stop Generating + Progress Context (Premium Feature #3)

During the 10-600 second wait for bot response, show:
1. What the bot is doing (progress context)
2. A cancel button

**Progress context:** The `sendChatMessage` backend already logs to console what the agent is doing. Extend it to emit progress events:

```javascript
// In chat.js, during agent spawn:
const agentProcess = spawn(...);
agentProcess.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  // Parse openclaw agent stderr for tool use signals
  if (text.includes('[tools]')) {
    const toolMatch = text.match(/\[tools\]\s+(\w+)/);
    if (toolMatch) _lastToolUse = toolMatch[1];
  }
});
```

**Frontend:** Replace static typing dots with contextual status:
```html
<div class="chat-msg bot typing">
  <div class="chat-avatar">9B</div>
  <div class="chat-typing-body">
    <span></span><span></span><span></span>
    <span class="chat-typing-label">Dang doc bao gia...</span>
    <button class="chat-stop-btn" onclick="stopChatGeneration()">
      <span class="icon" data-icon="square"></span> Dung lai
    </button>
  </div>
</div>
```

**Stop mechanism:** 
```javascript
function stopChatGeneration() {
  if (_chatAgentProcess) {
    _chatAgentProcess.kill('SIGTERM');
    _chatSending = false;
    removeChatTyping();
    appendChatError('Da dung theo yeu cau.');
  }
}
```

Backend needs to expose the agent process handle or a kill signal:
- New IPC: `stop-chat-generation` → kills the running agent process
- `chat.js` stores `_currentAgentProcess` and exposes kill via IPC

**Progress label mapping:**
| Agent tool | Display text |
|------------|-------------|
| `web_fetch` | "Dang goi API..." |
| `read_file` | "Dang doc file..." |
| `exec` | "Dang chay lenh..." |
| `web_search` | "Dang tim kiem..." |
| `message` | "Dang gui tin nhan..." |
| (default) | "Dang suy nghi..." |

### 15. Animations

Uses existing motion system from dashboard:
- Message entrance: `fadeUp 0.2s ease` (existing keyframe)
- Typing dots: existing `chatDot` keyframes
- Streaming cursor: `blink 1s infinite` (new, simple)
- Action buttons: `opacity 0 -> 1` on `.chat-msg:hover`
- Send button press: `transform: scale(0.97)` (existing from motion system)
- Drop zone: `border-color` transition 0.2s

## Out of Scope

- Conversation sessions / threads / resume
- Voice input/output
- Real-time WebSocket (polling is fine)
- Bot-initiated push messages
- Message search / editing / deletion
- highlight.js (CSS-only code styling)
- Responsive mobile breakpoints (Electron desktop only, min 1024px)

## Success Criteria

1. Bot replies render markdown (bold, lists, code blocks, tables) — XSS-safe via DOMPurify
2. Code blocks have monospace styling + copy button
3. File drag-drop works (PDF, DOCX, XLSX, images) with validation
4. Streaming by-sentence animation (~1s total, not per-word)
5. Copy/Retry/Thumbs buttons on every bot message (Lucide icons, no emoji)
6. Smart prompt chips (2x2 grid) on empty state
7. All colors use CSS variables — correct in both dark and light themes
8. Existing behaviors preserved (skill injection, timeout, history format, error states)
9. **Suggested follow-ups** — 2-3 clickable chips after each bot response
10. **Inline action buttons** — bot can send "Gui Zalo" / "Duyet" / "Xem chi tiet" buttons CEO clicks
11. **Stop generating + progress** — CEO sees what bot is doing + can cancel mid-generation
