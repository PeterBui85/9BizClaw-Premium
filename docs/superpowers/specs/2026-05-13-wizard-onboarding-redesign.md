# Wizard Onboarding Redesign

**Date:** 2026-05-13
**Status:** Draft
**File:** `electron/ui/wizard.html` + `electron/main.js` + `electron/preload.js`

## Goal

Simplify the wizard from 6 steps to 4. Remove personality customization and Zalo setup. Make Telegram instructions impossible to miss. Remove 9Router password friction.

## New Flow

| Step | Title | Fields / Actions |
|------|-------|-----------------|
| 1 | Thông tin cơ bản | CEO name*, company, bot name, ceo-title* |
| 2 | Thiết lập AI | One-click ChatGPT connect (auto-login 9Router), verify |
| 3 | Kết nối Telegram | Part A: create bot (3 sub-steps) + Part B: get user ID (2 sub-steps) |
| 4 | Sẵn sàng | Summary + launch button |

## What's Removed

- **Step 1b entirely:** industry dropdown, bot voice, personality traits (15 options), formality slider, customer pronouns, custom greetings/closing/phrases, persona preview
- **Step 4 (Zalo):** QR login, zalo mode selection, all zalo-related wizard UI
- **9Router password entry:** no more manual login step
- **9Router as separate step 1 of 3:** collapsed into single action

## What's Moved

- `ceo-title` field ("Trợ lý gọi anh/chị là") moves from step 1b into step 1

## Step 1: Thông tin cơ bản

**Layout:**
- Row: CEO name (required) + Company name (optional) — side by side
- Bot name (optional) — full width
- ceo-title (required) — full width, subtle highlight border to draw attention
- Help text: "Thông tin chi tiết về sản phẩm, dịch vụ sẽ được tải lên qua Dashboard → Knowledge sau khi hoàn tất."

**Defaults for removed fields (hardcoded in JS, NOT via DOM fallback from missing elements):**
- `industry`: `'tong-quat'`
- `tone`: `'friendly'`
- `pronouns`: `'em-anh-chi'`
- `personaMix.voice`: `'em-nu-tre'`
- `personaMix.customer`: `'anh-chi'`
- `personaMix.traits`: `['am-ap', 'chu-dao', 'chuyen-nghiep']`
- `personaMix.formality`: `5`
- `personaMix.greeting`: `''`
- `personaMix.closing`: `''`
- `personaMix.phrases`: `''`

**Zalo mode default:** `finishSetup()` still calls `saveZaloMode('auto')` with a hardcoded default so `zalo-mode.txt` exists on fresh install. Consumers of this file expect it to exist.

**Validation:** CEO name not empty, ceo-title not empty.

## Step 2: Thiết lập AI (9Router)

**Layout:** Two instruction cards:
1. "Kết nối ChatGPT" — primary button, opens codex page auto-authenticated
2. "Xác nhận kết nối" — secondary button, verifies ChatGPT is connected

**Auto-login mechanism (extend existing `setup-9router-auto` with `{ openCodexAuthed: true }`):**
1. Main process ensures 9Router is running (existing `ensureRunning` path)
2. Main process calls `POST http://127.0.0.1:20128/api/auth/login` with `{ password: '123456' }` — raw HTTP call (not via `nineRouterApi()` which uses CLI token auth)
3. Extracts `auth_token` from `Set-Cookie` response header
4. Opens new `BrowserWindow` using **`partition: 'persist:embed-9router'`** (same session as dashboard's embedded 9Router webview — critical for cookie alignment)
5. Before navigation, injects auth cookie via `session.fromPartition('persist:embed-9router').cookies.set({ url: 'http://127.0.0.1:20128', name: 'auth_token', value: '<token>' })`
6. Navigates to `http://127.0.0.1:20128/dashboard/providers/codex`
7. User sees codex page directly, no login prompt

**IPC return contract:**
- Success: `{ success: true, windowOpened: true }`
- Partial (login failed but window opened): `{ success: true, windowOpened: true, loginFailed: true }`
- Failure (9Router not running): `{ success: false, error: '...' }`

**Fallback:** If programmatic login fails, BrowserWindow still opens to codex URL. Wizard shows inline hint: "Nếu thấy trang đăng nhập, nhập mật khẩu: **123456**"

**Hidden fields:** `router-api-key` and `router-model` hidden inputs remain. Populated by `verifyChatGPTConnection()` as before — unchanged data flow.

**Validation:** `window._aiModelReady === true`. While verification is in-flight, "Tiếp tục" button shows "Đang kiểm tra..." disabled state.

## Step 3: Kết nối Telegram

**Layout:** Two visually distinct sections (Part A blue, Part B purple) with a critical callout between them.

### Part A — Tạo Bot Telegram

Three numbered sub-steps:

**Sub-step 1:** "Mở @BotFather trên Telegram"
- Description text
- **Button "Mở @BotFather" directly below this sub-step** (not at section bottom)
- "Mở trình duyệt" fallback link

**Sub-step 2:** "Gửi `/newbot` và đặt tên"
- Instructions for naming bot + username ending in `bot`

**Sub-step 3:** "Copy token và nhấn vào link bot"
- **Mock Telegram bubble** (CSS `user-select: none` to prevent accidental copy of fake data) showing BotFather response with fake data:
  - Bot link: `t.me/TroLyABCbot`
  - Token: `7104958362:BBHxR93kLmNpQwErTyUiOpAsDfGhJkLzXcV` (highlighted with "COPY DÒNG NÀY" badge)
- Two action callouts side-by-side:
  - VIỆC 1: Copy token → paste into input below
  - VIỆC 2: Click bot link → press Start to activate bot

**Token input field** with visibility toggle (fix alignment bug — see below)

### Critical Callout (between Part A and Part B)

Removed — the "press Start" instruction is now embedded in Part A sub-step 3 as "VIỆC 2", which is more natural since the bot link comes from BotFather's response.

### Part B — Lấy User ID

Two numbered sub-steps:

**Sub-step 1:** "Mở @userinfobot trên Telegram"
- Description text
- **Button "Mở @userinfobot" directly below this sub-step**
- "Mở trình duyệt" fallback link

**Sub-step 2:** "Gửi `/start` và copy dãy số ID"
- **Mock Telegram bubble** showing userinfobot response with fake data:
  - Username: `@NguyenVanA`
  - Id: `5738291046` (highlighted with "COPY SỐ NÀY" badge)
  - Name: `Nguyễn Văn A`

**User ID input field** with visibility toggle

### Test Button

"Test kết nối Telegram" primary button at bottom — sends test message to user's Telegram. **Test is optional** — user can proceed without testing (same as current behavior).

**Validation:** Bot token not empty, User ID matches `/^\d{5,15}$/`

## Step 4: Sẵn sàng

**Layout:**
- Success icon + heading
- Summary card: name, AI status, Telegram status (no Zalo row)
- "Khởi động trợ lý" primary button
- Success tip: "Mở Telegram và gửi tin nhắn cho bot vừa tạo."

## Bug Fix: Input + Eye Icon Alignment

**Problem:** `.wz-field-secure` input and `.wz-toggle-vis` button render misaligned in Electron despite both having `height:48px; box-sizing:border-box`.

**Fix:** Normalize both elements explicitly:
```css
.wz-field-secure .wz-input,
.wz-toggle-vis {
  height: 48px;
  box-sizing: border-box;
  line-height: 1;
  padding-top: 0;
  padding-bottom: 0;
  vertical-align: middle;
}
.wz-field-secure .wz-input {
  padding: 0 16px;
}
```

## JS Changes

### Step array
```js
// Old: [1, '1b', 2, 3, 4, 5]
// New:
const STEPS = [1, 2, 3, 4];
```

### Progress calculation
```js
// 4 steps: 25% per step
```

### Brand panel text
Update `brandData` map for 4 steps:

| Step | Eyebrow | Headline | Subhead |
|------|---------|----------|---------|
| 1 | Bước 1 / 4 | Chào mừng đến với 9BizClaw | Nhập thông tin cơ bản để cá nhân hóa trợ lý AI cho doanh nghiệp của anh/chị. |
| 2 | Bước 2 / 4 | Kết nối trí tuệ nhân tạo | Trợ lý cần kết nối với ChatGPT để hoạt động. Chỉ cần 1 click. |
| 3 | Bước 3 / 4 | Kết nối Telegram | Telegram là kênh anh/chị nhận thông báo và điều khiển trợ lý. |
| 4 | Hoàn tất | Sẵn sàng hoạt động | Trợ lý AI đã được thiết lập xong. |

### `finishSetup()` changes
- Still collects ceo-name, company, bot-name, ceo-title from DOM
- **Hardcode** (not DOM fallback) defaults: industry=`'tong-quat'`, tone=`'friendly'`, pronouns=`'em-anh-chi'`, full personaMix object including `customer:'anh-chi'`
- Still reads `router-api-key` and `router-model` from hidden inputs (unchanged)
- Still calls `saveZaloMode('auto')` with hardcoded default (file must exist)
- Skip Zalo QR/login-related config
- Summary card: no Zalo row
- Industry `'tong-quat'` means only `tong-quat.md` skill/SOP files get copied by `save-personalization` handler

### `navNext()` validation
- Step 1: CEO name + ceo-title not empty
- Step 2: `_aiModelReady === true`
- Step 3: token not empty + user ID regex

### 9Router auto-login (extend existing `setup-9router-auto`)
- Add `{ openCodexAuthed: true }` option to existing `setup-9router-auto` IPC handler
- No new IPC — consistent with existing pattern (`ensureRunning`, `detectChatGPT`)

### Removed functions
- All persona mix JS (chip selection, trait toggles, formality slider, preview bubble)
- `setupZalo()`, `findZaloQR()`, `checkZaloLogin()`, `refreshZaloQR()` wizard-specific calls
- Zalo mode radio handlers

## CSS Changes

- Remove `.wz-persona-*`, `.wz-mix-*` styles (no longer used)
- Add Part A / Part B visual treatment (colored left border or badge)
- Add mock Telegram bubble styles
- Fix `.wz-field-secure` alignment
- Add `.wz-callout-task` for VIỆC 1 / VIỆC 2 side-by-side boxes

## Files Changed

| File | Change |
|------|--------|
| `electron/ui/wizard.html` | Remove steps 1b + 4, merge ceo-title into step 1, redesign step 3, simplify step 2, update JS |
| `electron/lib/dashboard-ipc.js` | Extend `setup-9router-auto` with `openCodexAuthed` option |
| `electron/preload.js` | No new bridges needed (reuses existing `setup9RouterAuto`) |

## Out of Scope

- Dashboard settings page for personality fields (future work)
- Zalo setup from Dashboard (already exists at Dashboard → Zalo)
- Any changes to non-wizard pages
