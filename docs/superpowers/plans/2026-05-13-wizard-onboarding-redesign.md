# Wizard Onboarding Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the wizard from 6 steps to 4 — remove personality/Zalo steps, redesign Telegram with mock response previews, add 9Router auto-login.

**Architecture:** Single-file wizard (`wizard.html`) with inline CSS + JS. One IPC handler extension in `dashboard-ipc.js`. No new files created. All changes are deletions or in-place edits.

**Tech Stack:** Electron, vanilla HTML/CSS/JS, IPC via `ipcMain.handle`

**Spec:** `docs/superpowers/specs/2026-05-13-wizard-onboarding-redesign.md`

---

## Chunk 1: HTML Structure — Remove old steps, rewrite new ones

### Task 1: Remove Step 1b HTML and its CSS

**Files:**
- Modify: `electron/ui/wizard.html:976-1085` (step-1b HTML section)
- Modify: `electron/ui/wizard.html:692-906` (persona CSS block)

- [ ] **Step 1: Delete step-1b HTML section**

Remove the entire `<section class="wz-step" id="step-1b">` block (lines 976–1085). This includes: ceo-title field (will be re-added to step 1), industry dropdown, voice chips, trait chips, formality slider, custom greetings, pronouns radio cards, and the mix preview bubble.

- [ ] **Step 2: Delete persona/mix CSS**

Remove all `.wz-persona-*` styles (lines 692–806) and `.wz-mix-*` styles (lines 811–896). These are only used by step 1b.

- [ ] **Step 3: Verify step-1b is fully gone**

Search wizard.html for `step-1b`, `wz-persona`, `wz-mix-` — should return zero matches.

---

### Task 2: Add ceo-title field to Step 1

**Files:**
- Modify: `electron/ui/wizard.html:964-973` (step-1 section, after bot-name field)

- [ ] **Step 1: Insert ceo-title field after bot-name**

After the bot-name `<div class="wz-field">` block (ends around line 968) and before the help text `<p>` (line 970), insert:

```html
<div class="wz-field" style="margin-top:8px">
  <label class="wz-label">Trợ lý gọi anh/chị là <span style="color:var(--danger)">*</span></label>
  <input type="text" class="wz-input" id="ceo-title" placeholder="Ví dụ: anh, chị, sếp, thầy, cô, giám đốc">
  <p class="wz-help">Bot sẽ dùng cách xưng hô này khi nhắn anh/chị qua Telegram.</p>
</div>
```

- [ ] **Step 2: Verify ceo-title renders in step 1**

Open wizard.html in Electron dev mode — step 1 should show 4 fields: CEO name, company, bot name, ceo-title.

---

### Task 3: Remove Zalo step (step-4) HTML

**Files:**
- Modify: `electron/ui/wizard.html:1216-1285` (step-4 HTML section)

- [ ] **Step 1: Delete step-4 HTML section**

Remove the entire `<section class="wz-step" id="step-4">` block (lines 1216–1285). This includes: Zalo QR login card, QR container, success badge, zalo mode radio cards, and hidden fb inputs.

- [ ] **Step 2: Verify step-4 is gone**

Search for `step-4`, `zalo-btn`, `zalo-qr` — should only appear in JS code (which we'll clean up in Task 7).

---

### Task 4: Simplify Step 2 (9Router) HTML

**Files:**
- Modify: `electron/ui/wizard.html:1087-1142` (step-2 HTML section)

- [ ] **Step 1: Replace step-2 content**

Replace the entire inner content of `<section class="wz-step" id="step-2">` with:

```html
<h2>Kết nối trí tuệ nhân tạo</h2>
<p class="wz-step-desc">Trợ lý cần kết nối với ChatGPT. Tài khoản miễn phí hoặc Plus đều dùng được.</p>

<div class="wz-instruction">
  <div class="wz-instruction-head">
    <div class="wz-instruction-num">1</div>
    <div class="wz-instruction-title">Kết nối ChatGPT</div>
  </div>
  <div class="wz-instruction-body">
    <p>Nhấn nút bên dưới — trang kết nối ChatGPT sẽ mở ra.</p>
    <p>Nhấn <strong>Connect</strong> bên cạnh <strong>ChatGPT</strong> và đăng nhập bằng tài khoản ChatGPT của anh/chị.</p>
  </div>
  <div style="margin-top:14px;padding-left:40px">
    <button class="wz-btn wz-btn-primary" onclick="openChatGPTConnect()" id="open-chatgpt-btn" type="button">
      Kết nối ChatGPT
    </button>
    <p id="login-fallback-hint" class="wz-hidden" style="margin-top:8px;font-size:12px;color:var(--text-tertiary)">Nếu thấy trang đăng nhập, nhập mật khẩu: <strong style="font-family:monospace;user-select:all">123456</strong></p>
  </div>
</div>

<div class="wz-instruction">
  <div class="wz-instruction-head">
    <div class="wz-instruction-num">2</div>
    <div class="wz-instruction-title">Xác nhận kết nối</div>
  </div>
  <div class="wz-instruction-body">
    <p>Sau khi đăng nhập ChatGPT xong, quay lại đây và nhấn nút bên dưới.</p>
  </div>
  <div style="margin-top:14px;padding-left:40px">
    <button class="wz-btn wz-btn-secondary" onclick="verifyChatGPTConnection()" id="verify-chatgpt-btn" type="button">
      Kiểm tra kết nối
    </button>
    <div id="router-auto-result" class="wz-hidden" style="margin-top:12px"></div>
  </div>
</div>

<input type="hidden" id="router-api-key" value="">
<input type="hidden" id="router-model" value="main">
```

Note: The old "Mở trang 9Router" login button (step 1 of 3) is removed. "Kết nối ChatGPT" button now calls `openChatGPTConnect()` which auto-logins before opening the codex page.

---

### Task 5: Redesign Step 3 (Telegram) HTML

**Files:**
- Modify: `electron/ui/wizard.html:1144-1214` (step-3 HTML section)

- [ ] **Step 1: Add new CSS classes for telegram step**

Add these styles inside the `<style>` block (after the `.wz-alert` styles, around line 580):

```css
/* ===== Telegram step — Part A/B cards + mock bubbles ===== */
.wz-tg-part {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px 28px;
  margin-bottom: 20px;
}
.wz-tg-part-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}
.wz-tg-badge {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 12px;
  border-radius: 99px;
  color: white;
  letter-spacing: 0.3px;
}
.wz-tg-badge.blue { background: #3b82f6; }
.wz-tg-badge.purple { background: #a855f7; }

.wz-tg-substep {
  display: flex;
  gap: 14px;
  margin-bottom: 20px;
}
.wz-tg-substep-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.wz-tg-substep-num.blue { background: rgba(59,130,246,0.15); color: #3b82f6; }
.wz-tg-substep-num.purple { background: rgba(168,85,247,0.15); color: #a855f7; }
.wz-tg-substep-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.wz-tg-substep-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
  line-height: 1.6;
}
.wz-tg-substep-action {
  margin-left: 42px;
  margin-top: 8px;
  margin-bottom: 20px;
}
.wz-tg-substep-action .wz-field {
  margin-top: 16px;
  margin-bottom: 0;
}

/* Mock Telegram bubble */
.wz-tg-bubble {
  background: var(--surface-hover, #1e2c3a);
  border-radius: 12px 12px 12px 4px;
  padding: 14px 16px;
  max-width: 520px;
  margin: 10px 0;
  user-select: none;
}
html[data-theme="light"] .wz-tg-bubble {
  background: #e8f0fe;
}
.wz-tg-bubble-sender {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 8px;
}
.wz-tg-bubble-body {
  font-size: 13px;
  color: var(--text);
  line-height: 1.7;
}
.wz-tg-highlight {
  display: inline-block;
  margin: 6px 0;
  padding: 8px 12px;
  background: rgba(59,130,246,0.12);
  border: 2px solid rgba(59,130,246,0.35);
  border-radius: 8px;
  position: relative;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 13px;
  color: var(--accent);
  letter-spacing: 0.3px;
  word-break: break-all;
}
.wz-tg-highlight.purple {
  background: rgba(168,85,247,0.12);
  border-color: rgba(168,85,247,0.35);
  color: #a855f7;
}
.wz-tg-highlight-badge {
  position: absolute;
  top: -9px;
  right: 8px;
  background: #3b82f6;
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 99px;
  letter-spacing: 0.3px;
  font-family: inherit;
}
.wz-tg-highlight.purple .wz-tg-highlight-badge {
  background: #a855f7;
}

/* VIỆC 1 / VIỆC 2 task callouts */
.wz-tg-tasks {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  margin-bottom: 4px;
}
.wz-tg-task {
  flex: 1;
  padding: 10px 14px;
  border-radius: 10px;
}
.wz-tg-task.blue {
  background: rgba(59,130,246,0.06);
  border: 1px solid rgba(59,130,246,0.18);
}
.wz-tg-task.yellow {
  background: rgba(251,191,36,0.06);
  border: 1px solid rgba(251,191,36,0.18);
}
.wz-tg-task-label {
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 3px;
}
.wz-tg-task.blue .wz-tg-task-label { color: #3b82f6; }
.wz-tg-task.yellow .wz-tg-task-label { color: #fbbf24; }
.wz-tg-task-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
```

- [ ] **Step 2: Replace step-3 HTML content**

Replace the entire inner content of `<section class="wz-step" id="step-3">` with:

```html
<h2>Kết nối Telegram</h2>
<p class="wz-step-desc">Telegram là kênh anh/chị nhận thông báo và điều khiển trợ lý. Làm theo 2 phần bên dưới.</p>

<!-- ===== PART A — Tạo Bot Telegram ===== -->
<div class="wz-tg-part">
  <div class="wz-tg-part-header">
    <span class="wz-tg-badge blue">PART A</span>
    <span style="font-size:16px;font-weight:700;color:var(--text)">Tạo Bot Telegram</span>
  </div>

  <!-- A.1 Open BotFather -->
  <div class="wz-tg-substep">
    <div class="wz-tg-substep-num blue">1</div>
    <div>
      <div class="wz-tg-substep-title">Mở @BotFather trên Telegram</div>
      <div class="wz-tg-substep-desc">Nhấn nút bên dưới — Telegram tự mở chat với BotFather.</div>
    </div>
  </div>
  <div class="wz-tg-substep-action">
    <button class="wz-btn wz-btn-secondary" onclick="openBotFather()" type="button">
      <span data-icon="send" data-icon-size="14"></span> Mở @BotFather
    </button>
    <a href="#" onclick="openBotFatherWeb(); return false;" style="font-size:12px;color:var(--text-muted);text-decoration:underline;cursor:pointer;margin-left:10px">Mở trình duyệt</a>
  </div>

  <!-- A.2 Send /newbot -->
  <div class="wz-tg-substep">
    <div class="wz-tg-substep-num blue">2</div>
    <div>
      <div class="wz-tg-substep-title">Gửi <span class="wz-kbd">/newbot</span> và đặt tên</div>
      <div class="wz-tg-substep-desc">BotFather hỏi tên bot — đặt tên bất kỳ (VD: "Trợ Lý ABC").<br>Sau đó đặt username kết thúc bằng <span style="font-family:monospace;color:var(--text)">bot</span> (VD: <span style="font-family:monospace;color:var(--text)">tro_ly_abc_bot</span>).</div>
    </div>
  </div>

  <!-- A.3 Copy token + click bot link -->
  <div class="wz-tg-substep">
    <div class="wz-tg-substep-num blue">3</div>
    <div>
      <div class="wz-tg-substep-title">Copy token và nhấn vào link bot</div>
      <div class="wz-tg-substep-desc">BotFather trả lời như bên dưới. Anh/chị cần làm 2 việc:</div>
    </div>
  </div>
  <div class="wz-tg-substep-action">
    <!-- Mock BotFather bubble -->
    <div class="wz-tg-bubble">
      <div class="wz-tg-bubble-sender">BotFather</div>
      <div class="wz-tg-bubble-body">
        Done! Congratulations on your new bot. You will find it at <span style="color:var(--accent);text-decoration:underline">t.me/TroLyABCbot</span>. You can now add a description, about section and profile picture for your bot...
        <div style="margin-top:10px">Use this token to access the HTTP API:</div>
        <div class="wz-tg-highlight">
          7104958362:BBHxR93kLmNpQwErTyUiOpAsDfGhJkLzXcV
          <span class="wz-tg-highlight-badge">COPY DÒNG NÀY</span>
        </div>
        <div>Keep your token <strong>secure</strong> and <strong>store it safely</strong>...</div>
      </div>
    </div>

    <!-- Two task callouts -->
    <div class="wz-tg-tasks">
      <div class="wz-tg-task blue">
        <div class="wz-tg-task-label">VIỆC 1</div>
        <div class="wz-tg-task-desc">Copy dòng token (được đánh dấu xanh) và dán vào ô bên dưới</div>
      </div>
      <div class="wz-tg-task yellow">
        <div class="wz-tg-task-label">VIỆC 2</div>
        <div class="wz-tg-task-desc">Nhấn vào link <strong style="color:var(--accent)">t.me/TenBotCuaBan</strong> rồi nhấn <strong>Start</strong> để kích hoạt bot</div>
      </div>
    </div>

    <!-- Token input -->
    <div class="wz-field" style="margin-top:16px;margin-bottom:0">
      <label class="wz-label">Bot Token</label>
      <div class="wz-field-secure">
        <input type="password" class="wz-input" id="tg-token" placeholder="Dán token từ BotFather" autocomplete="off">
        <button class="wz-toggle-vis" onclick="toggleWzVis('tg-token', this)" type="button" title="Hiện / ẩn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- ===== PART B — Lấy User ID ===== -->
<div class="wz-tg-part">
  <div class="wz-tg-part-header">
    <span class="wz-tg-badge purple">PART B</span>
    <span style="font-size:16px;font-weight:700;color:var(--text)">Lấy User ID</span>
  </div>

  <!-- B.1 Open userinfobot -->
  <div class="wz-tg-substep">
    <div class="wz-tg-substep-num purple">1</div>
    <div>
      <div class="wz-tg-substep-title">Mở @userinfobot trên Telegram</div>
      <div class="wz-tg-substep-desc">Nhấn nút bên dưới — Telegram mở chat với userinfobot.</div>
    </div>
  </div>
  <div class="wz-tg-substep-action">
    <button class="wz-btn wz-btn-secondary" onclick="openUserInfoBot()" type="button">
      <span data-icon="user" data-icon-size="14"></span> Mở @userinfobot
    </button>
    <a href="#" onclick="openUserInfoBotWeb(); return false;" style="font-size:12px;color:var(--text-muted);text-decoration:underline;cursor:pointer;margin-left:10px">Mở trình duyệt</a>
  </div>

  <!-- B.2 Send /start and copy ID -->
  <div class="wz-tg-substep">
    <div class="wz-tg-substep-num purple">2</div>
    <div>
      <div class="wz-tg-substep-title">Gửi <span class="wz-kbd">/start</span> và copy dãy số ID</div>
      <div class="wz-tg-substep-desc">userinfobot trả lời như bên dưới — copy dãy số được đánh dấu:</div>
    </div>
  </div>
  <div class="wz-tg-substep-action">
    <!-- Mock userinfobot bubble -->
    <div class="wz-tg-bubble">
      <div class="wz-tg-bubble-sender">userinfobot</div>
      <div class="wz-tg-bubble-body" style="line-height:1.8">
        @NguyenVanA<br>
        Id: <span class="wz-tg-highlight purple" style="display:inline;padding:1px 6px;margin:0;font-size:13px">5738291046<span class="wz-tg-highlight-badge" style="top:-8px;right:-54px">COPY SỐ NÀY</span></span><br>
        First: Nguyễn Văn A<br>
        Lang: vi
      </div>
    </div>

    <!-- User ID input -->
    <div class="wz-field" style="margin-top:16px;margin-bottom:0">
      <label class="wz-label">User ID</label>
      <div class="wz-field-secure">
        <input type="password" class="wz-input" id="tg-user-id" placeholder="Dán dãy số ID (ví dụ: 5738291046)" autocomplete="off">
        <button class="wz-toggle-vis" onclick="toggleWzVis('tg-user-id', this)" type="button" title="Hiện / ẩn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- Test button -->
<button class="wz-btn wz-btn-primary" id="test-tg-btn" onclick="testTelegram()" type="button" style="margin-bottom:16px">
  <span data-icon="send" data-icon-size="14"></span> Test kết nối Telegram
</button>
<div id="tg-test-result" class="wz-hidden"></div>
```

---

### Task 6: Update Step 5 → Step 4 (summary/done)

**Files:**
- Modify: `electron/ui/wizard.html:1287-1306` (step-5 HTML section)

- [ ] **Step 1: Rename step-5 section id to step-4**

Change `id="step-5"` to `id="step-4"` in the section tag. The HTML content remains the same (success icon, heading, summary div, launch button, tip).

---

## Chunk 2: JS Logic — Step navigation, validation, finishSetup, auto-login

### Task 7: Update wizard JS state and navigation

**Files:**
- Modify: `electron/ui/wizard.html` — JS `<script>` block (lines 1373–1966)

- [ ] **Step 1: Update STEP_ORDER and STEP_META**

Replace lines 1374–1387:

```js
let currentStep = 1;
const STEP_ORDER = [1, 2, 3, 4];
const STEP_META = {
  1: { eyebrow: 'Bước 1 / 4', headline: 'Chào mừng đến với 9BizClaw', subhead: 'Nhập thông tin cơ bản để cá nhân hóa trợ lý AI cho doanh nghiệp của anh/chị.' },
  2: { eyebrow: 'Bước 2 / 4', headline: 'Kết nối trí tuệ nhân tạo', subhead: 'Trợ lý cần kết nối với ChatGPT để hoạt động. Chỉ cần 1 click.' },
  3: { eyebrow: 'Bước 3 / 4', headline: 'Kết nối Telegram', subhead: 'Telegram là kênh anh/chị nhận thông báo và điều khiển trợ lý.' },
  4: { eyebrow: 'Hoàn tất', headline: 'Sẵn sàng hoạt động', subhead: 'Trợ lý AI đã được thiết lập xong.' },
};
```

- [ ] **Step 2: Remove old state variables**

Delete these lines (they were used by step 1b / step 4):

```js
let selectedTone = 'friendly';
let selectedPronouns = 'em-anh-chi';
let zaloMode = 'auto';
```

- [ ] **Step 3: Update setProgress() — step numbering and button labels**

Replace `setProgress` function. Key changes:
- Back button hidden on step 1 and step 4 (was step 5)
- "Hoàn tất thiết lập" on step 3 (was step 4)
- Next button hidden on step 4 (was step 5)

```js
function setProgress(step) {
  const idx = stepIdx(step);
  const total = STEP_ORDER.length;
  const pct = Math.round(((idx + 1) / total) * 100);
  const fill = document.getElementById('progress-fill');
  const stepLabel = document.getElementById('progress-step');
  const pctLabel = document.getElementById('progress-percent');
  if (fill) fill.style.width = (pct < 10 ? 10 : pct) + '%';
  if (stepLabel) stepLabel.textContent = `Bước ${idx + 1} trong ${total}`;
  if (pctLabel) pctLabel.textContent = pct + '%';

  const meta = STEP_META[step];
  if (meta) {
    document.getElementById('brand-eyebrow').textContent = meta.eyebrow;
    document.getElementById('brand-headline').textContent = meta.headline;
    document.getElementById('brand-subhead').textContent = meta.subhead;
  }

  const backBtn = document.getElementById('nav-back');
  backBtn.style.display = idx === 0 || step === 4 ? 'none' : 'inline-flex';

  const nextBtn = document.getElementById('nav-next');
  if (step === 3) nextBtn.textContent = 'Hoàn tất thiết lập';
  else if (step === 4) nextBtn.style.display = 'none';
  else { nextBtn.textContent = 'Tiếp tục'; nextBtn.style.display = 'inline-flex'; }
}
```

- [ ] **Step 4: Update navNext() — new validation logic**

Replace `navNext` function. Key changes:
- Step 1 validates ceo-name + ceo-title
- Step 2 validates `_aiModelReady`
- Step 3 validates token + user ID, then calls `finishSetup()`
- No step 4 validation (it's the done step)
- No step 1b or Zalo checks

```js
async function navNext() {
  const ci = stepIdx(currentStep);
  const next = STEP_ORDER[ci + 1];
  if (!next) return;

  if (currentStep === 1) {
    const name = document.getElementById('ceo-name').value.trim();
    if (!name) { markFieldError('ceo-name'); return showError('Vui lòng nhập họ tên của anh/chị.'); }
    const title = document.getElementById('ceo-title').value.trim();
    if (!title) { markFieldError('ceo-title'); return showError('Vui lòng nhập cách trợ lý gọi anh/chị.'); }
  }
  if (currentStep === 2) {
    if (!window._aiModelReady) return showError('Chưa kết nối ChatGPT. Nhấn "Kết nối ChatGPT" rồi "Kiểm tra kết nối" ở trên.');
  }
  if (currentStep === 3) {
    const t = document.getElementById('tg-token').value.trim();
    const u = document.getElementById('tg-user-id').value.trim();
    if (!t) { markFieldError('tg-token'); return showError('Chưa có Bot Token. Làm theo hướng dẫn Part A ở trên.'); }
    if (!u) { markFieldError('tg-user-id'); return showError('Chưa có User ID. Làm theo hướng dẫn Part B ở trên.'); }
    if (!/^\d{5,15}$/.test(u)) { markFieldError('tg-user-id'); return showError('User ID chỉ gồm chữ số (ví dụ: 5738291046).'); }
    finishSetup();
    return;
  }

  showStep(next);
}
```

---

### Task 8: Rewrite finishSetup() with hardcoded defaults

**Files:**
- Modify: `electron/ui/wizard.html` — `finishSetup()` function (lines 1810–1911)

- [ ] **Step 1: Replace finishSetup()**

Key changes vs old:
- Hardcode `industry`, `tone`, `pronouns`, `personaMix` (no DOM reads for removed elements)
- Still call `saveZaloMode('auto')` with hardcoded default
- Summary card: no Zalo row
- Shows `step-4` instead of `step-5`

```js
async function finishSetup() {
  const name = document.getElementById('ceo-name').value.trim();
  const company = document.getElementById('company').value.trim();
  const tgToken = document.getElementById('tg-token').value.trim();
  const tgUserId = document.getElementById('tg-user-id').value.trim();
  const routerKey = document.getElementById('router-api-key').value.trim();
  const routerModel = document.getElementById('router-model').value.trim() || 'auto';
  const ceoTitle = document.getElementById('ceo-title').value.trim() || name;
  const botName = (document.getElementById('bot-name')?.value || '').trim();

  if (!name || !tgToken || !tgUserId) return showError('Thiếu thông tin. Quay lại kiểm tra các bước trước.');
  if (!/^\d{5,15}$/.test(tgUserId)) return showError('User ID Telegram không hợp lệ.');
  if (!routerKey) return showError('Thiếu API key AI. Quay lại bước AI để lấy.');

  const finishBtn = document.getElementById('nav-next');
  finishBtn.disabled = true;
  finishBtn.classList.add('loading');

  try {
    await withTimeout(window.claw.saveWizardConfig([
      { key: 'gateway.mode', value: 'local' },
      { key: 'channels.telegram.botToken', value: tgToken },
      { key: 'channels.telegram.allowFrom', value: [parseInt(tgUserId, 10)] },
      { key: 'channels.telegram.dmPolicy', value: 'allowlist' },
    ]));

    await withTimeout(window.claw.setBatchConfig([{
      path: 'models.providers.ninerouter',
      value: {
        baseUrl: 'http://127.0.0.1:20128/v1',
        apiKey: routerKey,
        api: 'openai-completions',
        models: [{ id: 'main', name: 'Main Combo (tự động fallback)' }]
      }
    }]));
    await withTimeout(window.claw.saveWizardConfig([
      { key: 'agents.defaults.model', value: `ninerouter/${routerModel}` },
    ]));

    await withTimeout(window.claw.saveBusinessProfile({
      companyName: company, ceoName: name,
    }));

    const personaMix = {
      voice: 'em-nu-tre',
      customer: 'anh-chi',
      traits: ['am-ap', 'chu-dao', 'chuyen-nghiep'],
      formality: 5,
      greeting: '',
      closing: '',
      phrases: '',
    };
    await withTimeout(window.claw.savePersonalization({
      industry: 'tong-quat',
      tone: 'friendly',
      pronouns: 'em-anh-chi',
      ceoTitle,
      botName,
      personaMix,
    }));

    await withTimeout(window.claw.saveZaloMode('auto'));
  } catch (err) {
    showError('Thiết lập chưa hoàn tất. Chi tiết: ' + (err?.message || String(err)));
    finishBtn.disabled = false; finishBtn.classList.remove('loading');
    return;
  }

  finishBtn.disabled = false; finishBtn.classList.remove('loading');

  const summary = document.getElementById('summary');
  summary.innerHTML = `
    <div class="wz-summary-row">
      <div class="wz-summary-icon">${icon('user',16)}</div>
      <div class="wz-summary-label">Người dùng</div>
      <div class="wz-summary-value">${esc(name)}${company ? ' — ' + esc(company) : ''}</div>
    </div>
    <div class="wz-summary-row">
      <div class="wz-summary-icon">${icon('cpu',16)}</div>
      <div class="wz-summary-label">AI</div>
      <div class="wz-summary-value" style="color:var(--success)">Đã kết nối</div>
    </div>
    <div class="wz-summary-row">
      <div class="wz-summary-icon">${icon('send',16)}</div>
      <div class="wz-summary-label">Telegram</div>
      <div class="wz-summary-value" style="color:var(--success)">Đã kết nối</div>
    </div>
  `;
  showStep(4);
}
```

---

### Task 9: Delete dead JS code

**Files:**
- Modify: `electron/ui/wizard.html` — JS `<script>` block

- [ ] **Step 1: Delete persona mix JS functions**

Remove these functions entirely:
- `syncMixUI()` (lines 1562–1576)
- `updateGreetingPlaceholder()` (lines 1578–1586)
- `bindMixChips()` (lines 1588–1624)
- `updateMixPreview()` (lines 1626–1651)
- The `personaMix` variable at line 1552–1560 (now hardcoded inside `finishSetup()`)

- [ ] **Step 2: Delete Zalo JS functions**

Remove these functions entirely:
- `refreshZaloQR()` (lines 1751–1767)
- `setupZalo()` (lines 1769–1807)
- The `_refreshQRPoll` and `_zaloPollInterval` variables (lines 1750, 1768)

- [ ] **Step 3: Delete open9RouterLogin()**

Remove `open9RouterLogin()` (line 1654–1656). It opened the 9Router login page — no longer needed.

- [ ] **Step 4: Update DOMContentLoaded init**

In the DOMContentLoaded handler (lines 1948–1966), remove calls to:
- `bindMixChips()`
- `syncMixUI()`
- `updateMixPreview()`

Keep: `mountIcons()`, `bindChoices()`, `setProgress(1)`, theme restore, 9Router pre-start.

- [ ] **Step 5: Update openChatGPTConnect() for auto-login**

Replace the `openChatGPTConnect()` function (lines 1658–1668):

```js
async function openChatGPTConnect() {
  const btn = document.getElementById('open-chatgpt-btn');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const res = await window.claw.setup9RouterAuto({ openCodexAuthed: true });
    if (res.loginFailed) {
      document.getElementById('login-fallback-hint').classList.remove('wz-hidden');
    }
  } catch (e) {
    showError('Không mở được trang kết nối. Chi tiết: ' + (e.message || e));
  }
  btn.disabled = false; btn.classList.remove('loading');
}
```

---

### Task 10: Fix input + eye icon alignment

**Files:**
- Modify: `electron/ui/wizard.html` — CSS `<style>` block (lines 236–245)

- [ ] **Step 1: Override `.wz-field-secure` alignment CSS**

Replace the existing `.wz-field-secure` CSS (lines 236–245) with:

```css
.wz-field-secure { display:flex; align-items:stretch; gap:8px; }
.wz-field-secure .wz-input {
  flex:1; height:48px; box-sizing:border-box;
  padding: 0 16px; line-height: 48px;
}
.wz-toggle-vis {
  width:44px; height:48px; flex-shrink:0; border:1px solid var(--border); border-radius:10px;
  background:var(--surface); cursor:pointer; display:flex; align-items:center;
  justify-content:center; color:var(--text-muted); transition:border-color 0.15s, color 0.15s;
  box-sizing:border-box; padding:0;
}
```

Key fix: `align-items: stretch` on the flex container + explicit `line-height: 48px` on input.

---

## Chunk 3: Backend — 9Router auto-login IPC

### Task 11: Extend `setup-9router-auto` with `openCodexAuthed`

**Files:**
- Modify: `electron/lib/dashboard-ipc.js:182-192` (inside the `setup-9router-auto` handler)

- [ ] **Step 1: Add openCodexAuthed branch**

After the existing `if (opts.ensureRunning)` block (line 192), and before the `if (opts.detectChatGPT)` block (line 194), add:

```js
// --- openCodexAuthed: auto-login 9router and open codex page ---
if (opts.openCodexAuthed) {
  if (!getRouterProcess()) {
    console.log('[setup-9router-auto] openCodexAuthed — starting 9router');
    start9Router();
  }
  const ready = await waitFor9RouterReady(15000);
  if (!ready) return { success: false, error: '9Router không khởi động được.' };

  let loginFailed = false;
  try {
    const http = require('http');
    const loginData = JSON.stringify({ password: '123456' });
    const cookieValue = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port: 20128, path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginData) },
        timeout: 5000,
      }, (res) => {
        const cookies = res.headers['set-cookie'] || [];
        const authCookie = cookies.find(c => c.startsWith('auth_token='));
        if (authCookie) {
          const val = authCookie.split('=')[1].split(';')[0];
          resolve(val);
        } else {
          reject(new Error('no auth_token cookie in response'));
        }
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('login timeout')); });
      req.write(loginData);
      req.end();
    });

    const { session: electronSession } = require('electron');
    const ses = electronSession.fromPartition('persist:embed-9router');
    await ses.cookies.set({
      url: 'http://127.0.0.1:20128',
      name: 'auth_token',
      value: cookieValue,
      path: '/',
    });
    console.log('[setup-9router-auto] openCodexAuthed — cookie injected');
  } catch (loginErr) {
    console.warn('[setup-9router-auto] openCodexAuthed — login failed:', loginErr.message);
    loginFailed = true;
  }

  const { BrowserWindow } = require('electron');
  const codexWin = new BrowserWindow({
    width: 1100, height: 750,
    webPreferences: { partition: 'persist:embed-9router' },
  });
  codexWin.loadURL('http://127.0.0.1:20128/dashboard/providers/codex');
  return { success: true, windowOpened: true, loginFailed };
}
```

- [ ] **Step 2: Verify the IPC extension compiles**

Run the app in dev mode. Click "Kết nối ChatGPT" in wizard step 2 — BrowserWindow should open to codex page, auto-authenticated.

---

## Chunk 4: Final verification

### Task 12: End-to-end walkthrough

- [ ] **Step 1: Fresh wizard test**

Reset app state and walk through wizard:
1. Step 1: Enter name, company, bot name, ceo-title → "Tiếp tục"
2. Step 2: Click "Kết nối ChatGPT" → BrowserWindow opens codex page (no password) → connect ChatGPT → close window → click "Kiểm tra kết nối" → green success → "Tiếp tục"
3. Step 3: Follow Part A (BotFather → /newbot → copy token → paste → click bot link → /start). Follow Part B (userinfobot → /start → copy ID → paste). Click "Test kết nối" → success → "Hoàn tất thiết lập"
4. Step 4: Summary shows name + AI + Telegram (no Zalo row) → "Khởi động trợ lý" → dashboard loads

- [ ] **Step 2: Verify input alignment**

On step 3, token and user ID input fields should be perfectly aligned with their eye toggle buttons. No vertical offset.

- [ ] **Step 3: Verify mock bubbles are not selectable**

Try to select/copy text inside the mock BotFather and userinfobot bubbles — should be blocked by `user-select: none`.

- [ ] **Step 4: Verify defaults are saved correctly**

After wizard completes, check:
- `~/.openclaw/openclaw.json` has telegram config
- `IDENTITY.md` has ceo-title
- `active-persona.json` has hardcoded defaults (voice: em-nu-tre, traits: [am-ap, chu-dao, chuyen-nghiep], etc.)
- `zalo-mode.txt` contains "auto"

- [ ] **Step 5: Commit**

```
git add electron/ui/wizard.html electron/lib/dashboard-ipc.js
git commit -m "feat: wizard onboarding redesign — 4 steps, auto-login 9Router, Telegram A/B"
```
