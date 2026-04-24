# First-Time Channel Guide Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Zalo bot slip-ups by showing an unskippable guide + safety checklist when CEO first opens Zalo/Telegram tabs.

**Architecture:** Full-screen overlay in dashboard.html triggered on first tab click. Backend IPC provides persona summary, chat simulator (gateway API proxy), and guide-completed state. Wizard-complete handler writes `guide-pending` pause to block bot before guide completion.

**Tech Stack:** Electron IPC, dashboard.html (vanilla JS/CSS), main.js Node backend, gateway HTTP API on port 18789.

---

## Chunk 1: Backend + Preload

### Task 1: Wizard-complete — write guide-pending pause

**Files:**
- Modify: `electron/main.js:16297-16329` (wizard-complete handler, Zalo pause section)

- [ ] **Step 1: Modify wizard-complete to write guide-pending pause**

In the wizard-complete IPC handler (~line 16297), BEFORE `startOpenClaw()` is called, change the pause logic. Currently it writes `reason: 'default-disabled'` when no Zalo credentials found. Change to:

1. ALWAYS write `zalo-paused.json` with `reason: 'guide-pending'` synchronously, regardless of whether Zalo credentials exist
2. This ensures the bot is paused before gateway starts

Find the block at ~line 16297-16329 that handles `hasZaloCredsNow`. Replace with:

```javascript
// ALWAYS pause Zalo until CEO completes first-time guide (spec: guide-pending)
// Write SYNCHRONOUSLY before startOpenClaw() to prevent race window
const guidePausePath = _getPausePath('zalo');
if (guidePausePath) {
  try {
    fs.writeFileSync(guidePausePath, JSON.stringify({
      permanent: true,
      reason: 'guide-pending',
      pausedAt: new Date().toISOString()
    }, null, 2));
    console.log('[wizard-complete] wrote guide-pending pause');
  } catch (e) {
    console.error('[wizard-complete] failed to write guide-pending pause:', e?.message);
  }
}
// Still enable the channel in config (bot is paused by file, not disabled)
if (hasZaloCredsNow) {
  // existing logic to set channels.openzalo.enabled = true
}
```

- [ ] **Step 2: Verify isChannelPaused handles guide-pending**

Read `isChannelPaused()` at ~line 9796. Confirm it checks `data.permanent` — since guide-pending sets `permanent: true`, it's already handled. No change needed.

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat(guide): write guide-pending pause in wizard-complete before gateway start"
```

### Task 2: New IPC endpoints in main.js

**Files:**
- Modify: `electron/main.js` (add 4 IPC handlers near existing IPC handlers)
- Modify: `electron/preload.js` (add 4 bridge methods)

- [ ] **Step 1: Add `check-guide-needed` IPC handler**

Add near the other IPC handlers (after `get-knowledge-counts` handler ~line 14587):

```javascript
ipcMain.handle('check-guide-needed', async (_e, { channel }) => {
  const ws = getWorkspace();
  if (!ws) return { needed: false };

  // Fast path: server-side completion flag
  const guideFile = path.join(ws, 'guide-completed.json');
  try {
    if (fs.existsSync(guideFile)) {
      const data = JSON.parse(fs.readFileSync(guideFile, 'utf-8'));
      if (data[channel]) return { needed: false };
    }
  } catch {}

  // Primary signal: guide-pending pause file
  const pausePath = _getPausePath(channel);
  if (pausePath && channel === 'zalo') {
    try {
      if (fs.existsSync(pausePath)) {
        const data = JSON.parse(fs.readFileSync(pausePath, 'utf-8'));
        if (data.reason === 'guide-pending') return { needed: true };
      }
    } catch {}
  }

  // No guide-pending pause = upgrade or already completed. Skip guide.
  // Write completion flag so we don't re-check next time.
  try {
    let existing = {};
    if (fs.existsSync(guideFile)) {
      existing = JSON.parse(fs.readFileSync(guideFile, 'utf-8'));
    }
    existing[channel] = true;
    existing.completedAt = existing.completedAt || new Date().toISOString();
    fs.writeFileSync(guideFile, JSON.stringify(existing, null, 2));
  } catch {}

  return { needed: false };
});
```

- [ ] **Step 2: Add `get-persona-summary` IPC handler**

```javascript
ipcMain.handle('get-persona-summary', async () => {
  const ws = getWorkspace();
  if (!ws) return { botName: '', companyName: '', tone: '' };

  let botName = '', companyName = '', tone = '';

  // Read from IDENTITY.md
  try {
    const idPath = path.join(ws, 'IDENTITY.md');
    if (fs.existsSync(idPath)) {
      const content = fs.readFileSync(idPath, 'utf-8');
      const nameMatch = content.match(/(?:Tên bot|Bot name)[:\s]*(.+)/i);
      const compMatch = content.match(/(?:Công ty|Company|Tên công ty)[:\s]*(.+)/i);
      const toneMatch = content.match(/(?:Giọng điệu|Tone|Cách xưng hô)[:\s]*(.+)/i);
      if (nameMatch) botName = nameMatch[1].trim();
      if (compMatch) companyName = compMatch[1].trim();
      if (toneMatch) tone = toneMatch[1].trim();
    }
  } catch {}

  // Fallback from openclaw.json
  if (!botName || !companyName) {
    try {
      const configPath = path.join(HOME, '.openclaw', 'openclaw.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (!botName && config.agents?.defaults?.name) botName = config.agents.defaults.name;
        if (!companyName && config.agents?.defaults?.companyName) companyName = config.agents.defaults.companyName;
      }
    } catch {}
  }

  return { botName, companyName, tone };
});
```

- [ ] **Step 3: Add `test-bot-message` IPC handler**

This calls the gateway HTTP API directly — never routes to Zalo.

```javascript
ipcMain.handle('test-bot-message', async (_e, { message }) => {
  if (!message || typeof message !== 'string') return { ok: false, error: 'empty_message' };
  const http = require('http');

  // Check gateway is alive first
  const alive = await isGatewayAlive(5000);
  if (!alive) return { ok: false, error: 'gateway_not_running' };

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: 'default',
      messages: [{ role: 'user', content: message }],
      stream: false
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: 18789,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 45000
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const reply = data?.choices?.[0]?.message?.content || '';
          resolve({ ok: true, reply });
        } catch {
          resolve({ ok: false, error: 'parse_error' });
        }
      });
    });

    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(postData);
    req.end();
  });
});
```

- [ ] **Step 4: Add `confirm-zalo-go-live` IPC handler**

```javascript
ipcMain.handle('confirm-zalo-go-live', async () => {
  const ws = getWorkspace();
  if (!ws) return { ok: false, error: 'no_workspace' };

  // 1. Remove guide-pending pause
  const pausePath = _getPausePath('zalo');
  if (pausePath) {
    try { fs.unlinkSync(pausePath); } catch {}
  }

  // 2. Ensure channel enabled
  try {
    const configPath = path.join(HOME, '.openclaw', 'openclaw.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.channels?.openzalo) {
        config.channels.openzalo.enabled = true;
        writeOpenClawConfigIfChanged(configPath, config);
      }
    }
  } catch {}

  // 3. Write guide-completed.json
  const guideFile = path.join(ws, 'guide-completed.json');
  try {
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(guideFile, 'utf-8')); } catch {}
    existing.zalo = true;
    existing.completedAt = existing.completedAt || new Date().toISOString();
    fs.writeFileSync(guideFile, JSON.stringify(existing, null, 2));
  } catch {}

  console.log('[guide] Zalo go-live confirmed — pause removed, channel enabled');
  return { ok: true };
});
```

- [ ] **Step 5: Add preload bridges**

In `electron/preload.js`, add inside the `contextBridge.exposeInMainWorld('claw', {...})` block:

```javascript
checkGuideNeeded: (channel) => ipcRenderer.invoke('check-guide-needed', { channel }),
getPersonaSummary: () => ipcRenderer.invoke('get-persona-summary'),
testBotMessage: (message) => ipcRenderer.invoke('test-bot-message', { message }),
confirmZaloGoLive: () => ipcRenderer.invoke('confirm-zalo-go-live'),
```

- [ ] **Step 6: Commit**

```bash
git add electron/main.js electron/preload.js
git commit -m "feat(guide): add IPC endpoints for guide check, persona, chat simulator, go-live"
```

---

## Chunk 2: Guide UI — HTML + CSS

### Task 3: Guide overlay HTML structure

**Files:**
- Modify: `electron/ui/dashboard.html` (add overlay divs + CSS)

- [ ] **Step 1: Add guide overlay CSS**

Add in the `<style>` section of dashboard.html (after existing modal CSS ~line 285):

```css
/* === FIRST-TIME GUIDE OVERLAY === */
.guide-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: #0a0a0a; color: #e5e5e5;
  display: none; flex-direction: column;
  font-family: system-ui, -apple-system, sans-serif;
  overflow-y: auto;
}
.guide-overlay.show { display: flex; }
.guide-inner {
  max-width: 600px; width: 100%; margin: 0 auto;
  padding: 48px 32px; flex: 1; display: flex; flex-direction: column;
}
.guide-progress { display: flex; gap: 4px; margin-bottom: 32px; }
.guide-progress-seg {
  height: 3px; flex: 1; background: #27272a; border-radius: 2px;
  transition: background 0.3s;
}
.guide-progress-seg.done { background: #3b82f6; }
.guide-step-label {
  font-size: 12px; color: #71717a; text-transform: uppercase;
  letter-spacing: 1px; margin-bottom: 8px;
}
.guide-title {
  font-size: 22px; font-weight: 600; color: #f5f5f5;
  margin: 0 0 16px 0;
}
.guide-text { color: #a1a1aa; line-height: 1.7; margin: 0 0 20px 0; }
.guide-card {
  background: #18181b; border: 1px solid #27272a; border-radius: 8px;
  padding: 16px; margin-bottom: 10px;
}
.guide-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.guide-card-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.guide-card-title { font-weight: 600; color: #f5f5f5; }
.guide-card-desc { color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 0; }
.guide-note {
  background: #1e1b4b; border: 1px solid #3730a3; border-radius: 8px;
  padding: 12px; margin-top: 16px;
}
.guide-note p { color: #a5b4fc; font-size: 13px; margin: 0; line-height: 1.5; }
.guide-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 24px; gap: 12px;
}
.guide-btn {
  padding: 10px 28px; border-radius: 6px; font-size: 14px;
  font-weight: 500; border: none; cursor: pointer; transition: opacity 0.2s;
}
.guide-btn-primary { background: #3b82f6; color: white; }
.guide-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.guide-btn-back {
  background: transparent; color: #71717a; border: 1px solid #27272a;
}
/* Checklist items */
.guide-check {
  border-radius: 8px; padding: 14px 16px; margin-bottom: 10px;
  display: flex; align-items: center; gap: 12px;
}
.guide-check.done { background: #052e16; border: 1px solid #166534; }
.guide-check.pending { background: #18181b; border: 1px solid #f59e0b; }
.guide-check-icon {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; flex-shrink: 0;
}
.guide-check.done .guide-check-icon { background: #22c55e; color: #fff; }
.guide-check.pending .guide-check-icon {
  background: #27272a; border: 2px solid #f59e0b;
}
.guide-golive {
  padding: 12px 32px; border-radius: 6px; font-size: 15px;
  font-weight: 600; border: none; cursor: pointer;
}
.guide-golive:disabled { background: #27272a; color: #71717a; cursor: not-allowed; }
.guide-golive:not(:disabled) { background: #3b82f6; color: white; }
/* Chat simulator */
.guide-chat { flex: 1; display: flex; flex-direction: column; margin-top: 16px; }
.guide-chat-messages {
  flex: 1; overflow-y: auto; padding: 12px 0;
  max-height: 240px; min-height: 120px;
}
.guide-chat-msg {
  max-width: 75%; padding: 10px 14px; margin-bottom: 12px;
  font-size: 14px; line-height: 1.6;
}
.guide-chat-msg.user {
  background: #1d4ed8; color: white; border-radius: 12px 12px 2px 12px;
  margin-left: auto;
}
.guide-chat-msg.bot {
  background: #18181b; border: 1px solid #27272a; color: #e5e5e5;
  border-radius: 12px 12px 12px 2px;
}
.guide-chat-msg.bot .bot-label {
  font-size: 11px; color: #71717a; margin-bottom: 4px;
}
.guide-chat-input {
  display: flex; gap: 8px; border-top: 1px solid #27272a; padding-top: 12px;
}
.guide-chat-input input {
  flex: 1; background: #18181b; border: 1px solid #27272a; border-radius: 6px;
  padding: 10px 14px; color: #e5e5e5; font-size: 14px; outline: none;
}
.guide-chat-chips {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;
}
.guide-chat-chip {
  background: #1e293b; border: 1px solid #334155; color: #93c5fd;
  padding: 6px 12px; border-radius: 16px; font-size: 12px; cursor: pointer;
}
.guide-chat-chip:hover { background: #334155; }
.guide-verdict {
  display: flex; gap: 8px; justify-content: center; margin: 16px 0 4px;
}
.guide-verdict-btn {
  padding: 8px 20px; border-radius: 6px; font-size: 13px;
  font-weight: 500; cursor: pointer; border: none;
}
.guide-verdict-good { background: #052e16; border: 1px solid #166534; color: #86efac; }
.guide-verdict-bad { background: #451a03; border: 1px solid #92400e; color: #fbbf24; }
```

- [ ] **Step 2: Add guide overlay HTML**

Add just before `</body>` in dashboard.html:

```html
<!-- FIRST-TIME GUIDE OVERLAY -->
<div class="guide-overlay" id="guide-zalo-overlay">
  <div class="guide-inner">
    <div class="guide-progress" id="guide-zalo-progress"></div>
    <div class="guide-step-label" id="guide-zalo-step-label"></div>
    <div id="guide-zalo-content"></div>
    <div class="guide-footer" id="guide-zalo-footer"></div>
  </div>
</div>
<div class="guide-overlay" id="guide-telegram-overlay">
  <div class="guide-inner">
    <div class="guide-progress" id="guide-telegram-progress"></div>
    <div class="guide-step-label" id="guide-telegram-step-label"></div>
    <div id="guide-telegram-content"></div>
    <div class="guide-footer" id="guide-telegram-footer"></div>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat(guide): add guide overlay HTML structure and CSS"
```

### Task 4: Guide JS — step definitions + navigation

**Files:**
- Modify: `electron/ui/dashboard.html` (add JS in `<script>` section)

- [ ] **Step 1: Add Zalo guide step definitions**

Add in the `<script>` section of dashboard.html (near the end, before closing `</script>`):

```javascript
// === FIRST-TIME CHANNEL GUIDE ===
const ZALO_GUIDE_STEPS = [
  {
    title: 'Chào mừng',
    render: () => `
      <h2 class="guide-title">Chào mừng đến trang quản lý Zalo</h2>
      <p class="guide-text">Bot sẽ tự động trả lời khách hàng qua Zalo thay anh. Trước khi bật, anh cần hiểu từng chức năng bên dưới để đảm bảo bot hoạt động đúng ý.</p>
      <div class="guide-note"><p>Hướng dẫn này chỉ hiện một lần. Bot đang tạm dừng — khách nhắn tin sẽ KHÔNG nhận được trả lời cho đến khi anh hoàn thành hướng dẫn.</p></div>
    `
  },
  {
    title: 'Chế độ trả lời',
    render: () => `
      <h2 class="guide-title">Chế độ trả lời</h2>
      <p class="guide-text">Bot Zalo có 2 chế độ hoạt động:</p>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#22c55e"></div><span class="guide-card-title">Tự động trả lời</span></div>
        <p class="guide-card-desc">Khách nhắn tin &rarr; bot đọc &rarr; bot trả lời ngay. Phù hợp khi đã có tài liệu Knowledge đầy đủ.</p>
      </div>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#eab308"></div><span class="guide-card-title">Chỉ đọc</span></div>
        <p class="guide-card-desc">Khách nhắn tin &rarr; bot đọc &rarr; bot KHÔNG trả lời, chỉ ghi nhận. Gửi tóm tắt cuối ngày cho anh.</p>
      </div>
      <div class="guide-note"><p>Mặc định: Tự động trả lời. Anh có thể đổi bất kỳ lúc nào ở tab Zalo.</p></div>
    `
  },
  {
    title: 'Chính sách người lạ',
    render: () => `
      <h2 class="guide-title">Chính sách người lạ</h2>
      <p class="guide-text">Khi một người chưa có trong danh bạ Zalo nhắn tin, bot xử lý theo chính sách anh chọn:</p>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#22c55e"></div><span class="guide-card-title">Trả lời bình thường</span></div>
        <p class="guide-card-desc">Bot trả lời tất cả mọi người, kể cả người lạ. Phù hợp khi muốn tiếp khách mới qua Zalo.</p>
      </div>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#eab308"></div><span class="guide-card-title">Chào 1 lần</span></div>
        <p class="guide-card-desc">Bot gửi 1 câu chào duy nhất, sau đó im. Anh tự quyết định có muốn tiếp tục không.</p>
      </div>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#ef4444"></div><span class="guide-card-title">Bỏ qua</span></div>
        <p class="guide-card-desc">Bot hoàn toàn không trả lời người lạ. Chỉ phục vụ người đã có trong danh bạ.</p>
      </div>
      <div class="guide-note"><p>Anh có thể đổi bất kỳ lúc nào ở mục "Người lạ" trong trang Zalo.</p></div>
    `
  },
  {
    title: 'Nhóm Zalo',
    render: () => `
      <h2 class="guide-title">Nhóm Zalo</h2>
      <p class="guide-text">Bot có thể tham gia trả lời trong các nhóm Zalo. Mỗi nhóm có 3 chế độ:</p>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#eab308"></div><span class="guide-card-title">Chỉ khi @mention</span></div>
        <p class="guide-card-desc">Bot chỉ trả lời khi được @ tên trong nhóm. An toàn nhất cho nhóm khách hàng.</p>
      </div>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#22c55e"></div><span class="guide-card-title">Tất cả tin nhắn</span></div>
        <p class="guide-card-desc">Bot trả lời mọi tin nhắn trong nhóm. Phù hợp cho nhóm hỗ trợ nội bộ.</p>
      </div>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#ef4444"></div><span class="guide-card-title">Tắt</span></div>
        <p class="guide-card-desc">Bot không trả lời trong nhóm này.</p>
      </div>
      <div class="guide-note"><p>Quản lý từng nhóm riêng ở tab "Nhóm" trong trang Zalo.</p></div>
    `
  },
  {
    title: 'Tạm dừng & Tiếp quản',
    render: () => `
      <h2 class="guide-title">Tạm dừng & Tiếp quản</h2>
      <p class="guide-text">Khi anh muốn tự tay trả lời khách, có 2 cách dừng bot:</p>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#3b82f6"></div><span class="guide-card-title">Nút "Tạm dừng" trên Dashboard</span></div>
        <p class="guide-card-desc">Tạm dừng toàn bộ kênh Zalo. Bot im hoàn toàn cho đến khi anh bấm "Tiếp tục".</p>
      </div>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#22c55e"></div><span class="guide-card-title">Gõ /tamdung trong Zalo</span></div>
        <p class="guide-card-desc">Anh đang chat với khách trên Zalo, gõ <strong>/tamdung</strong> ngay trong cuộc chat &rarr; bot im cho cuộc chat đó. Gõ <strong>/tieptuc</strong> để bot hoạt động lại. Tự động hết hiệu lực sau 1 tiếng.</p>
      </div>
      <div class="guide-note"><p>Đây là cách anh tiếp quản bất kỳ cuộc chat nào mà không cần mở Dashboard.</p></div>
    `
  },
  {
    title: 'Chặn người dùng',
    render: () => `
      <h2 class="guide-title">Chặn người dùng</h2>
      <p class="guide-text">Nếu có người gửi tin rác hoặc anh không muốn bot trả lời:</p>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#ef4444"></div><span class="guide-card-title">Thêm vào danh sách chặn</span></div>
        <p class="guide-card-desc">Bot hoàn toàn bỏ qua tin nhắn của người bị chặn. Quản lý ở tab "Bạn bè" trong trang Zalo.</p>
      </div>
      <div class="guide-note"><p>Chặn chỉ áp dụng cho tin nhắn riêng (DM). Trong nhóm, bot vẫn trả lời bình thường để không ảnh hưởng đến các thành viên khác.</p></div>
    `
  },
  {
    title: 'Bộ lọc bảo vệ',
    render: () => `
      <h2 class="guide-title">Bộ lọc bảo vệ</h2>
      <p class="guide-text">Bot có bộ lọc tự động bảo vệ thông tin nhạy cảm:</p>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#22c55e"></div><span class="guide-card-title">Tự động lọc trước khi gửi</span></div>
        <p class="guide-card-desc">Đường dẫn file hệ thống, API key, dữ liệu cấu hình nội bộ — tất cả được lọc trước khi gửi cho khách. Khách không bao giờ thấy thông tin kỹ thuật.</p>
      </div>
      <div class="guide-card">
        <div class="guide-card-header"><div class="guide-card-dot" style="background:#3b82f6"></div><span class="guide-card-title">Không cần cấu hình</span></div>
        <p class="guide-card-desc">Bộ lọc hoạt động tự động ngay khi bot bật. Anh không cần làm gì thêm.</p>
      </div>
    `
  },
  {
    title: 'Kiểm tra trước khi bật',
    render: (state) => renderZaloChecklist(state)
  }
];

const TELEGRAM_GUIDE_STEPS = [
  {
    title: 'Chào mừng',
    render: () => `
      <h2 class="guide-title">Chào mừng đến trang Telegram</h2>
      <p class="guide-text">Đây là kênh riêng của anh — chỉ anh sử dụng. Mọi thứ anh gửi ở đây bot đều đọc và trả lời.</p>
      <div class="guide-note"><p>Khách hàng không thấy kênh Telegram. Anh có thể thoải mái ra lệnh, hỏi báo cáo, quản lý bot từ đây.</p></div>
    `
  },
  {
    title: 'Lệnh cơ bản',
    render: () => `
      <h2 class="guide-title">Lệnh cơ bản</h2>
      <p class="guide-text">Anh có thể ra lệnh cho bot bằng tiếng Việt tự nhiên. Một số ví dụ:</p>
      <div class="guide-card">
        <p class="guide-card-desc"><strong>Hỏi báo cáo:</strong> "Hôm nay có bao nhiêu khách nhắn Zalo?"</p>
      </div>
      <div class="guide-card">
        <p class="guide-card-desc"><strong>Quản lý bot:</strong> "Tạm dừng Zalo 30 phút" hoặc "Bật lại Zalo"</p>
      </div>
      <div class="guide-card">
        <p class="guide-card-desc"><strong>Gửi tin nhóm:</strong> "Gửi nhóm BĐS: Chào mọi người, tuần này có dự án mới"</p>
      </div>
      <div class="guide-note"><p>Xem đầy đủ các lệnh ở bảng bên dưới sau khi hoàn thành hướng dẫn này.</p></div>
    `
  },
  {
    title: 'Cron & Báo cáo',
    render: () => `
      <h2 class="guide-title">Lịch tự động (Cron)</h2>
      <p class="guide-text">Anh có thể đặt lịch để bot tự động thực hiện công việc:</p>
      <div class="guide-card">
        <p class="guide-card-desc"><strong>Báo cáo sáng:</strong> "Mỗi sáng 7:30, gửi cho anh tóm tắt tin nhắn Zalo hôm qua"</p>
      </div>
      <div class="guide-card">
        <p class="guide-card-desc"><strong>Nhắc nhóm:</strong> "Mỗi thứ 2, gửi nhóm Sale: Nhớ cập nhật báo cáo tuần"</p>
      </div>
      <div class="guide-card">
        <p class="guide-card-desc"><strong>Báo cáo tối:</strong> "Mỗi tối 18:00, tổng kết hoạt động hôm nay"</p>
      </div>
      <div class="guide-note"><p>Tạo cron bằng cách nhắn Telegram cho bot. Bot sẽ xác nhận lịch và bắt đầu chạy tự động.</p></div>
    `
  },
  {
    title: 'Hoàn tất',
    render: () => `
      <h2 class="guide-title">Hoàn tất</h2>
      <p class="guide-text">Anh đã hiểu cách sử dụng kênh Telegram. Bấm "Đã hiểu" để bắt đầu sử dụng.</p>
      <div class="guide-note"><p>Anh có thể xem lại hướng dẫn này bất kỳ lúc nào ở phần cài đặt trang Telegram.</p></div>
    `
  }
];
```

- [ ] **Step 2: Add checklist renderer + chat simulator logic**

```javascript
// Zalo checklist state
let _guideCheckState = { persona: false, knowledge: false, test: false };
let _guideChatMessages = [];
let _guideChatTestPassed = false;

function renderZaloChecklist(state) {
  const s = _guideCheckState;
  const allDone = s.persona && s.knowledge && s.test;
  return `
    <h2 class="guide-title">Kiểm tra trước khi bật</h2>
    <p class="guide-text">Hoàn thành 3 bước bên dưới để bật bot tự động trả lời khách hàng qua Zalo.</p>

    <div class="guide-check ${s.persona ? 'done' : 'pending'}">
      <div class="guide-check-icon">${s.persona ? '&#10003;' : ''}</div>
      <div style="flex:1">
        <div style="font-weight:600;color:#f5f5f5;font-size:14px">Xác nhận thông tin công ty</div>
        <div style="font-size:12px;margin-top:2px;color:${s.persona ? '#86efac' : '#fbbf24'}" id="guide-persona-detail">${s.persona ? _guidePersonaText : 'Đang tải...'}</div>
      </div>
      ${s.persona ? '' : '<button class="guide-btn guide-btn-primary" style="padding:6px 16px;font-size:12px" onclick="guideConfirmPersona()">Xác nhận</button>'}
    </div>

    <div class="guide-check ${s.knowledge ? 'done' : 'pending'}">
      <div class="guide-check-icon">${s.knowledge ? '&#10003;' : ''}</div>
      <div style="flex:1">
        <div style="font-weight:600;color:#f5f5f5;font-size:14px">Upload tài liệu Knowledge</div>
        <div style="font-size:12px;margin-top:2px;color:${s.knowledge ? '#86efac' : '#fbbf24'}" id="guide-knowledge-detail">${s.knowledge ? _guideKnowledgeText : 'Đang kiểm tra...'}</div>
      </div>
      ${s.knowledge ? '' : '<button class="guide-btn guide-btn-primary" style="padding:6px 16px;font-size:12px" onclick="guideOpenKnowledge()">Mở Knowledge</button>'}
    </div>

    <div class="guide-check ${s.test ? 'done' : 'pending'}">
      <div class="guide-check-icon">${s.test ? '&#10003;' : ''}</div>
      <div style="flex:1">
        <div style="font-weight:600;color:#f5f5f5;font-size:14px">Gửi tin test</div>
        <div style="font-size:12px;margin-top:2px;color:${s.test ? '#86efac' : '#fbbf24'}">${s.test ? 'Đã xác nhận bot trả lời tốt' : 'Thử nghiệm bot trước khi cho trả lời khách thật'}</div>
      </div>
      ${s.test ? '' : '<button class="guide-btn guide-btn-primary" style="padding:6px 16px;font-size:12px" onclick="guideOpenChat()">Test ngay</button>'}
    </div>

    <div id="guide-chat-area" style="display:none">
      <div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:16px;margin-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <div style="font-weight:600;font-size:14px;color:#f5f5f5">Thử nghiệm bot</div>
            <div style="font-size:12px;color:#71717a">Gửi câu hỏi giả lập — bot trả lời y hệt như trả lời khách Zalo thật</div>
          </div>
          <div style="font-size:11px;color:#71717a;background:#27272a;padding:4px 10px;border-radius:4px">Không gửi Zalo thật</div>
        </div>
        <div class="guide-chat-chips">
          <span class="guide-chat-chip" onclick="guideSendChat('Xin chào')">Xin chào</span>
          <span class="guide-chat-chip" onclick="guideSendChat('Sản phẩm giá bao nhiêu?')">Sản phẩm giá bao nhiêu?</span>
          <span class="guide-chat-chip" onclick="guideSendChat('Viết code Python cho tôi')">Viết code Python cho tôi</span>
        </div>
        <div class="guide-chat-messages" id="guide-chat-messages"></div>
        <div class="guide-chat-input">
          <input id="guide-chat-input" type="text" placeholder="Hoặc gõ câu hỏi tự do..." onkeydown="if(event.key==='Enter')guideSendChat()">
          <button class="guide-btn guide-btn-primary" style="padding:8px 16px" onclick="guideSendChat()">Gửi</button>
        </div>
      </div>
    </div>

    <div style="background:#1c1917;border:1px solid #44403c;border-radius:8px;padding:12px;margin-top:16px">
      <p style="color:#a8a29e;font-size:13px;margin:0;line-height:1.5">Bot đang tạm dừng. Khách nhắn tin sẽ KHÔNG nhận được trả lời cho đến khi anh hoàn thành 3 bước trên và bấm "Bật bot".</p>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-top:24px">
      <button class="guide-golive" ${allDone ? '' : 'disabled'} onclick="guideGoLive()">Bật bot trả lời khách</button>
    </div>
  `;
}

let _guidePersonaText = '';
let _guideKnowledgeText = '';

async function guideLoadChecklistData() {
  // Load persona
  try {
    const p = await window.claw.getPersonaSummary();
    _guidePersonaText = [p.botName, p.companyName, p.tone].filter(Boolean).join(' · ') || 'Chưa cấu hình';
  } catch { _guidePersonaText = 'Không tải được'; }

  // Load knowledge counts
  try {
    const counts = await window.claw.getKnowledgeCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total > 0) {
      _guideCheckState.knowledge = true;
      _guideKnowledgeText = total + ' tài liệu đã upload';
    } else {
      _guideKnowledgeText = 'Chưa có tài liệu nào — bot sẽ trả lời bừa';
    }
  } catch { _guideKnowledgeText = 'Không kiểm tra được'; }
}

function guideConfirmPersona() {
  _guideCheckState.persona = true;
  guideRenderCurrentStep();
}

function guideOpenKnowledge() {
  // Switch to knowledge tab, then come back
  switchPage('knowledge');
  // Hide guide temporarily
  document.getElementById('guide-zalo-overlay').classList.remove('show');
  // Set a flag to re-show guide when switching back to Zalo
  _guideReturnToZalo = true;
}
let _guideReturnToZalo = false;

function guideOpenChat() {
  const area = document.getElementById('guide-chat-area');
  if (area) area.style.display = 'block';
}

async function guideSendChat(text) {
  const input = document.getElementById('guide-chat-input');
  const msg = text || (input && input.value.trim());
  if (!msg) return;
  if (input) input.value = '';

  // Add user message
  const msgsEl = document.getElementById('guide-chat-messages');
  msgsEl.innerHTML += '<div class="guide-chat-msg user">' + escapeHtml(msg) + '</div>';
  msgsEl.scrollTop = msgsEl.scrollHeight;

  // Show loading
  msgsEl.innerHTML += '<div class="guide-chat-msg bot" id="guide-chat-loading"><div class="bot-label">Bot đang trả lời...</div></div>';
  msgsEl.scrollTop = msgsEl.scrollHeight;

  try {
    const result = await window.claw.testBotMessage(msg);
    const loadingEl = document.getElementById('guide-chat-loading');
    if (loadingEl) loadingEl.remove();

    if (result.ok && result.reply) {
      msgsEl.innerHTML += '<div class="guide-chat-msg bot"><div class="bot-label">Bot trả lời:</div>' + escapeHtml(result.reply) + '</div>';
      // Show verdict buttons
      msgsEl.innerHTML += `<div class="guide-verdict" id="guide-verdict-btns">
        <button class="guide-verdict-btn guide-verdict-good" onclick="guideVerdictGood()">Trả lời tốt</button>
        <button class="guide-verdict-btn guide-verdict-bad" onclick="guideVerdictBad()">Chưa ổn, thử lại</button>
      </div>`;
    } else {
      const errMsg = result.error === 'gateway_not_running'
        ? 'Bot đang khởi động, vui lòng chờ...'
        : result.error === 'timeout'
          ? 'Bot phản hồi quá lâu, thử lại sau'
          : 'Bot gặp lỗi, thử lại sau';
      msgsEl.innerHTML += '<div class="guide-chat-msg bot"><div class="bot-label">Lỗi:</div>' + errMsg + '</div>';
    }
  } catch (e) {
    const loadingEl = document.getElementById('guide-chat-loading');
    if (loadingEl) loadingEl.remove();
    msgsEl.innerHTML += '<div class="guide-chat-msg bot"><div class="bot-label">Lỗi:</div>Không kết nối được bot</div>';
  }
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function guideVerdictGood() {
  _guideCheckState.test = true;
  _guideChatTestPassed = true;
  const btns = document.getElementById('guide-verdict-btns');
  if (btns) btns.innerHTML = '<span style="color:#86efac;font-size:13px">Đã xác nhận</span>';
  guideRenderCurrentStep();
}

function guideVerdictBad() {
  const btns = document.getElementById('guide-verdict-btns');
  if (btns) btns.innerHTML = '<span style="color:#fbbf24;font-size:13px">Thử thêm câu khác hoặc sửa Knowledge rồi test lại</span>';
}

async function guideGoLive() {
  try {
    const result = await window.claw.confirmZaloGoLive();
    if (result.ok) {
      localStorage.setItem('zalo-guide-complete', '1');
      document.getElementById('guide-zalo-overlay').classList.remove('show');
    }
  } catch (e) {
    console.error('[guide] go-live failed:', e);
  }
}
```

- [ ] **Step 3: Add guide navigation engine**

```javascript
// Guide navigation engine (shared for Zalo + Telegram)
let _guideCurrentStep = {};
let _guideTimers = {};

function guideInit(channel) {
  const steps = channel === 'zalo' ? ZALO_GUIDE_STEPS : TELEGRAM_GUIDE_STEPS;
  const savedStep = parseInt(localStorage.getItem(channel + '-guide-step') || '0', 10);
  _guideCurrentStep[channel] = Math.min(savedStep, steps.length - 1);
  guideRender(channel);
  document.getElementById('guide-' + channel + '-overlay').classList.add('show');

  if (channel === 'zalo') {
    guideLoadChecklistData().then(() => {
      if (_guideCurrentStep[channel] === steps.length - 1) guideRenderCurrentStep();
    });
  }
}

function guideRender(channel) {
  const steps = channel === 'zalo' ? ZALO_GUIDE_STEPS : TELEGRAM_GUIDE_STEPS;
  const step = _guideCurrentStep[channel];
  const total = steps.length;

  // Progress bar
  const progEl = document.getElementById('guide-' + channel + '-progress');
  progEl.innerHTML = Array.from({ length: total }, (_, i) =>
    '<div class="guide-progress-seg ' + (i <= step ? 'done' : '') + '"></div>'
  ).join('');

  // Step label
  document.getElementById('guide-' + channel + '-step-label').textContent =
    'Bước ' + (step + 1) + ' / ' + total;

  // Content
  document.getElementById('guide-' + channel + '-content').innerHTML =
    steps[step].render(_guideCheckState);

  // Footer (except checklist step which has its own buttons)
  const footerEl = document.getElementById('guide-' + channel + '-footer');
  const isLastStep = step === total - 1;
  const isFirstStep = step === 0;

  if (channel === 'zalo' && isLastStep) {
    footerEl.innerHTML = ''; // Checklist has its own Go Live button
  } else if (channel === 'telegram' && isLastStep) {
    footerEl.innerHTML = `
      <button class="guide-btn guide-btn-back" onclick="guideBack('${channel}')">Quay lại</button>
      <button class="guide-btn guide-btn-primary" id="guide-next-btn-${channel}" disabled onclick="guideFinishTelegram()">Đã hiểu</button>
    `;
    guideStartTimer(channel);
  } else {
    footerEl.innerHTML = `
      ${isFirstStep ? '<div></div>' : '<button class="guide-btn guide-btn-back" onclick="guideBack(\'' + channel + '\')">Quay lại</button>'}
      <button class="guide-btn guide-btn-primary" id="guide-next-btn-${channel}" disabled onclick="guideNext('${channel}')">Tiếp tục (3s)</button>
    `;
    guideStartTimer(channel);
  }

  // Save step
  localStorage.setItem(channel + '-guide-step', String(step));
}

function guideRenderCurrentStep() {
  const channel = 'zalo';
  const steps = ZALO_GUIDE_STEPS;
  const step = _guideCurrentStep[channel];
  document.getElementById('guide-' + channel + '-content').innerHTML =
    steps[step].render(_guideCheckState);
}

function guideStartTimer(channel) {
  const btn = document.getElementById('guide-next-btn-' + channel);
  if (!btn) return;
  let remaining = 3;
  btn.disabled = true;
  const isFinish = btn.textContent.includes('Đã hiểu');
  btn.textContent = (isFinish ? 'Đã hiểu' : 'Tiếp tục') + ' (' + remaining + 's)';

  if (_guideTimers[channel]) clearInterval(_guideTimers[channel]);
  _guideTimers[channel] = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(_guideTimers[channel]);
      btn.disabled = false;
      btn.textContent = isFinish ? 'Đã hiểu' : 'Tiếp tục';
    } else {
      btn.textContent = (isFinish ? 'Đã hiểu' : 'Tiếp tục') + ' (' + remaining + 's)';
    }
  }, 1000);
}

function guideNext(channel) {
  const steps = channel === 'zalo' ? ZALO_GUIDE_STEPS : TELEGRAM_GUIDE_STEPS;
  if (_guideCurrentStep[channel] < steps.length - 1) {
    _guideCurrentStep[channel]++;
    guideRender(channel);
  }
}

function guideBack(channel) {
  if (_guideCurrentStep[channel] > 0) {
    _guideCurrentStep[channel]--;
    guideRender(channel);
  }
}

async function guideFinishTelegram() {
  localStorage.setItem('telegram-guide-complete', '1');
  // Write server-side flag
  try { await window.claw.checkGuideNeeded('telegram'); } catch {}
  // Actually we need a separate IPC to mark telegram complete
  // For now, set localStorage and hide
  document.getElementById('guide-telegram-overlay').classList.remove('show');
}

// Hook into switchPage to trigger guide on first tab click
const _origSwitchPage = switchPage;
switchPage = async function(page) {
  _origSwitchPage(page);

  // Return to Zalo guide after Knowledge upload
  if (page === 'zalo' && _guideReturnToZalo) {
    _guideReturnToZalo = false;
    // Re-check knowledge counts
    await guideLoadChecklistData();
    guideRenderCurrentStep();
    document.getElementById('guide-zalo-overlay').classList.add('show');
    return;
  }

  // Check if guide needed for Zalo
  if (page === 'zalo' && !localStorage.getItem('zalo-guide-complete')) {
    try {
      const result = await window.claw.checkGuideNeeded('zalo');
      if (result.needed) {
        guideInit('zalo');
      } else {
        localStorage.setItem('zalo-guide-complete', '1');
      }
    } catch {}
  }

  // Check if guide needed for Telegram
  if (page === 'telegram' && !localStorage.getItem('telegram-guide-complete')) {
    try {
      const result = await window.claw.checkGuideNeeded('telegram');
      if (result.needed) {
        guideInit('telegram');
      } else {
        localStorage.setItem('telegram-guide-complete', '1');
      }
    } catch {}
  }
};
```

- [ ] **Step 4: Add Telegram guide completion IPC**

In `electron/main.js`, add handler for marking Telegram guide complete:

```javascript
ipcMain.handle('mark-guide-complete', async (_e, { channel }) => {
  const ws = getWorkspace();
  if (!ws) return { ok: false };
  const guideFile = path.join(ws, 'guide-completed.json');
  try {
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(guideFile, 'utf-8')); } catch {}
    existing[channel] = true;
    existing.completedAt = existing.completedAt || new Date().toISOString();
    fs.writeFileSync(guideFile, JSON.stringify(existing, null, 2));
  } catch {}
  return { ok: true };
});
```

In `electron/preload.js`:
```javascript
markGuideComplete: (channel) => ipcRenderer.invoke('mark-guide-complete', { channel }),
```

Update `guideFinishTelegram()` in dashboard.html:
```javascript
async function guideFinishTelegram() {
  localStorage.setItem('telegram-guide-complete', '1');
  try { await window.claw.markGuideComplete('telegram'); } catch {}
  document.getElementById('guide-telegram-overlay').classList.remove('show');
}
```

- [ ] **Step 5: Add "Xem lại hướng dẫn" replay buttons**

In the Zalo page header area (~line 2275), add:
```html
<span style="font-size:12px;color:#71717a;cursor:pointer;margin-left:auto" onclick="guideReplay('zalo')">Xem lại hướng dẫn</span>
```

In the Telegram page header area (~line 1975), add:
```html
<span style="font-size:12px;color:#71717a;cursor:pointer;margin-left:auto" onclick="guideReplay('telegram')">Xem lại hướng dẫn</span>
```

```javascript
function guideReplay(channel) {
  localStorage.removeItem(channel + '-guide-complete');
  localStorage.removeItem(channel + '-guide-step');
  _guideCurrentStep[channel] = 0;
  if (channel === 'zalo') {
    _guideCheckState = { persona: false, knowledge: false, test: false };
    _guideChatTestPassed = false;
  }
  guideInit(channel);
}
```

- [ ] **Step 6: Commit**

```bash
git add electron/ui/dashboard.html electron/main.js electron/preload.js
git commit -m "feat(guide): complete first-time channel guide with 8 Zalo steps + 4 Telegram steps"
```

---

## Chunk 3: Integration + Testing

### Task 5: Smoke test + manual verification

**Files:**
- Modify: `electron/scripts/smoke-test.js` (add guide anchor check)

- [ ] **Step 1: Add smoke test for guide overlay existence**

In `smoke-test.js`, add a check that `dashboard.html` contains the guide overlay divs:

```javascript
// [first-time guide overlay]
const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'ui', 'dashboard.html'), 'utf-8');
const hasZaloGuide = dashHtml.includes('id="guide-zalo-overlay"');
const hasTelegramGuide = dashHtml.includes('id="guide-telegram-overlay"');
const hasGuideCSS = dashHtml.includes('.guide-overlay');
if (!hasZaloGuide || !hasTelegramGuide || !hasGuideCSS) {
  fail('guide-overlay', 'Missing guide overlay elements in dashboard.html');
} else {
  pass('guide-overlay');
}
```

- [ ] **Step 2: Run smoke test**

```bash
cd c:/Users/buitu/Desktop/claw/electron && node scripts/smoke-test.js
```

Expected: PASS for guide-overlay + all existing tests pass.

- [ ] **Step 3: Manual test checklist**

1. **Fresh install simulation:**
   - Run RESET.bat
   - Run RUN.bat, complete wizard with Zalo QR scan
   - Dashboard loads → click "Zalo" tab
   - Expected: full-screen guide appears, 8 steps
   - Step through each step — "Tiếp tục" button disabled for 3 seconds per step
   - Cannot skip, cannot close
   - Step 8: checklist with 3 items
   - Confirm persona → green check
   - Click "Mở Knowledge" → switches to Knowledge tab → upload a file → click back to Zalo → guide re-appears with knowledge check green
   - Click "Test ngay" → chat opens → type "xin chào" → bot replies → click "Trả lời tốt"
   - "Bật bot trả lời khách" button turns blue → click → guide disappears
   - Zalo tab shows normal content
   - Refresh app → Zalo tab opens normally (no guide)

2. **Telegram tab:**
   - Click "Telegram" tab first time → 4-step guide
   - Step through → click "Đã hiểu" → guide disappears
   - Refresh → no guide

3. **Upgrade simulation:**
   - Start app with existing data (no RESET)
   - Click Zalo tab → NO guide (upgrade path detected)
   - Click Telegram tab → NO guide

4. **Replay:**
   - Click "Xem lại hướng dẫn" → guide shows again
   - For Zalo replay: checklist does NOT re-pause bot (replay is educational only)

- [ ] **Step 4: Commit**

```bash
git add electron/scripts/smoke-test.js
git commit -m "test(guide): add smoke test for guide overlay anchors"
```
