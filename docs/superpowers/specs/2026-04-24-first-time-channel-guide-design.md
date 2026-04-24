# First-Time Channel Guide — Design Spec

## Goal

Prevent bot slip-ups on Zalo (customer-facing) by forcing CEO to read a full guide and pass a safety checklist before the bot starts auto-replying. Telegram gets a lighter guide (CEO-only channel, no gate).

## Trigger

- CEO clicks the "Zalo" or "Telegram" tab in Dashboard **for the first time** (post-wizard).
- Full-screen overlay covers the entire tab. No X button, no Skip.
- Not part of the wizard flow — wizard completes normally, CEO lands on Dashboard, clicks tab -> guide appears.
- After completion: server-side flag `guide-completed.json` written + `localStorage` cache set. Guide never shows again. "Xem lai huong dan" button available in tab settings.

## Zalo Guide — 8 Steps + Checklist Gate

### Step 1: Chao mung
"Day la trang quan ly kenh Zalo. Bot se tu dong tra loi khach hang qua Zalo. Truoc khi bat, anh can hieu tung chuc nang ben duoi."

### Step 2: Che do tra loi
Explain two modes:
- **Tu dong tra loi**: Khach nhan tin -> bot doc -> bot tra loi ngay. Phu hop khi da co Knowledge day du.
- **Chi doc**: Khach nhan tin -> bot doc -> bot KHONG tra loi, chi ghi nhan. Gui tom tat cuoi ngay.

Note: "Mac dinh: Tu dong tra loi. Anh co the doi bat ky luc nao o tab Zalo."

### Step 3: Chinh sach nguoi la
Three policies when a non-friend messages:
- **Tra loi binh thuong** (green) — Bot tra loi tat ca, ke ca nguoi la
- **Chao 1 lan** (yellow) — Bot gui 1 cau chao, sau do im
- **Bo qua** (red) — Bot khong tra loi nguoi la

Note: "Anh co the doi bat ky luc nao o muc 'Nguoi la' trong trang Zalo."

### Step 4: Nhom Zalo
Group behavior modes:
- **@mention only** — Bot chi tra loi khi duoc @ ten
- **Tat ca tin nhan** — Bot tra loi moi tin trong nhom
- **Tat** — Bot khong tra loi trong nhom nay

Note: "Quan ly tung nhom rieng o tab 'Nhom' trong trang Zalo."

### Step 5: Tam dung & Tiep quan
Two mechanisms:
- **Nut "Tam dung" tren Dashboard** — Tam dung toan bo kenh Zalo
- **Go `/tamdung` trong Zalo** — Anh dang chat voi khach, go `/tamdung` ngay trong cuoc chat -> bot im cho cuoc chat do. Go `/tieptuc` de bot hoat dong lai. Tu dong het hieu luc sau 1 tieng.

Note: "Day la cach anh tiep quan bat ky cuoc chat nao ma khong can mo Dashboard."

### Step 6: Chan nguoi dung
- Them nguoi vao danh sach chan -> bot hoan toan bo qua tin nhan cua ho
- Quan ly o tab "Ban be" trong trang Zalo

### Step 7: Bo loc bao ve
- Bot tu dong loc thong tin nhay cam truoc khi gui cho khach (duong dan file, API key, du lieu noi bo)
- Khach khong bao gio thay thong tin ky thuat hoac noi bo cong ty
- Khong can cau hinh — hoat dong tu dong

### Step 8: Checklist Gate

Three mandatory items before bot goes live:

#### 8a. Xac nhan thong tin cong ty
- Display current persona: bot name, company name, tone
- CEO confirms "Dung roi" or edits inline
- Data source: IDENTITY.md + wizard config
- Pass condition: CEO clicks confirm button

#### 8b. Upload tai lieu Knowledge
- Show current Knowledge file count per category
- If 0 files: warning "Bot chua co kien thuc, se tra loi bua"
- Link to Knowledge tab to upload
- Pass condition: at least 1 file exists in any Knowledge category
- Auto-check: IPC call `get-knowledge-counts`, sum > 0
- Accepted risk: CEO can upload a low-quality file to pass the gate. This is acceptable — we cannot force good content, only ensure content EXISTS.

#### 8c. Chat simulator test
- Chat window opens inline in the checklist step
- 3 pre-written sample questions as clickable chips:
  - "Xin chao" — tests greeting/tone
  - "San pham gia bao nhieu?" — tests Knowledge retrieval
  - "Viet code Python cho toi" — tests out-of-scope rejection
- Free-text input for custom questions
- CEO evaluates: "Tra loi tot" (green) or "Chua on, thu lai" (yellow)
- Pass condition: CEO clicks "Tra loi tot" at least once

**Chat simulator backend:**
- New IPC `test-bot-message` receives `{message: string}` from renderer
- Main process calls gateway HTTP API: `POST http://127.0.0.1:18789/api/sessions` to create a test session, then sends message via the sessions API
- Response is returned to renderer via IPC — **never routed to any Zalo/Telegram channel**
- The gateway API is a direct HTTP call from main process, not through the openzalo plugin pipeline. No risk of Zalo delivery.

**Chat simulator edge cases:**
- Gateway not running: show "Bot dang khoi dong, vui long cho..." + auto-retry every 3s, timeout after 60s with "Khong ket noi duoc bot. Vui long khoi dong lai ung dung."
- Gateway returns error (500, timeout >30s): show "Bot gap loi, thu lai sau" with retry button
- Empty response from bot: show "Bot khong tra loi — co the chua co tai lieu Knowledge"
- CEO clicks "Chua on": no pass, CEO can iterate (edit Knowledge -> re-test)

#### Go Live Button
- "Bat bot tra loi khach" — disabled (gray) until all 3 items green
- When enabled (blue): click triggers `confirm-zalo-go-live` IPC which:
  1. Deletes `zalo-paused.json` (removes guide-pending pause)
  2. Sets `channels.openzalo.enabled = true` via `writeOpenClawConfigIfChanged()`
  3. Writes `guide-completed.json` with `{zalo: true, completedAt: ISO}` (server-side flag)
  4. Returns `{ok: true}` to renderer
- Renderer sets `localStorage` flag and removes guide overlay

## Telegram Guide — 4 Steps, No Gate

### Step 1: Chao mung
"Day la kenh Telegram — chi anh (CEO) su dung. Moi thu anh gui o day bot deu doc va tra loi."

### Step 2: Lenh co ban
Overview of command categories with examples. Explain the copy button.

### Step 3: Cron & Bao cao
How scheduled messages work: create from Telegram, bot executes and sends results.

### Step 4: Hoan tat
"Da hieu" button. No checklist, no gate. Telegram is CEO-only, no customer risk.
Writes `guide-completed.json` with `{telegram: true}` field added.

## UX Rules

- **Timed "Tiep tuc" button**: appears after 3-second delay per step. Grayed out with countdown "(3s)" -> "(2s)" -> "(1s)" -> active blue.
- **No X, no Skip**: overlay has no close mechanism except completing all steps.
- **Progress bar**: 8-segment bar (Zalo) or 4-segment (Telegram) at top, fills as steps complete.
- **Step counter**: "Buoc N / M" label below progress bar.
- **Back button**: allowed — CEO can revisit previous steps. No forward skip.
- **Step persistence**: current step saved in `localStorage` (`zalo-guide-step` / `telegram-guide-step`). If CEO closes app mid-guide, resumes from saved step on next launch. Steps 1-7 are educational (no state), step 8 checklist items are re-verified via IPC on resume.
- **Persist**: server-side `guide-completed.json` is authoritative source. `localStorage` is fast cache. Both set on completion.
- **Replay**: "Xem lai huong dan" button in tab settings area. Clears localStorage flag, re-shows guide on next tab click (does NOT re-pause bot — replay is educational only).

## Safety Mechanism

- After wizard completes with Zalo login: bot is auto-paused (`zalo-paused.json` with `reason: 'guide-pending'`, no TTL — indefinite until CEO completes guide)
- **Critical ordering**: `zalo-paused.json` MUST be written SYNCHRONOUSLY before `startOpenClaw()` is called in the wizard-complete handler. This prevents any race window where the gateway starts before the pause is in place.
- The `guide-pending` pause is a new pause reason, distinct from manual pause (`reason: 'manual'`) or timed pause (has TTL). `isChannelPaused()` must treat `guide-pending` as permanently paused (no TTL expiry).
- Bot stays paused regardless of how long CEO takes to open Zalo tab
- Only cleared when CEO completes all 8 steps + checklist gate + clicks "Bat bot"
- If CEO never opens Zalo tab: bot never replies. Zero slip-up risk.

## Upgrade Path — CEO Update From Older Version

CEO updating from v2.3.47 or earlier already has a configured bot. Guide and auto-pause must NOT activate for them.

**Key invariant:** An upgrade NEVER pauses a previously-working bot. The `guide-pending` pause reason is ONLY written by the wizard-complete handler for fresh installs.

**Detection — primary signal:** `zalo-paused.json` with `reason: 'guide-pending'`.
- If this file exists with this reason -> guide IS needed (fresh install, wizard just ran)
- If this file does not exist, or exists with a different reason -> guide is NOT needed
- This is the authoritative signal. All other checks are secondary confirmation.

**Implementation:** On first Zalo/Telegram tab click:
1. Check `localStorage` flag -> if set, show normal tab (fast path)
2. If not set, check server-side `guide-completed.json` via IPC `check-guide-needed`:
   - If `guide-completed.json` exists with `{zalo: true}` -> set localStorage, show normal tab
   - If `zalo-paused.json` exists with `reason: 'guide-pending'` -> show guide (fresh install)
   - Otherwise (no guide file, no guide-pending pause) -> this is an upgrade. Set localStorage + write `guide-completed.json`, show normal tab
3. Same logic for Telegram with `{telegram: true}` field

**Edge cases:**
- CEO manually paused bot before update: `zalo-paused.json` has `reason: 'manual'`. Guide skips (no `guide-pending`). Manual pause respected, guide does not interfere.
- CEO waits hours after wizard before opening Zalo tab: `guide-pending` pause is indefinite, no TTL. Guide still shows. Bot still paused. Safe.
- `localStorage` cleared (app data reset, Electron storage corruption): falls back to server-side `guide-completed.json`. If that file exists, guide skips.

## Implementation Scope

All changes in `electron/ui/dashboard.html` (guide overlay UI + JS logic) and `electron/main.js` (auto-pause after wizard, chat simulator IPC, knowledge count check, guide-completed flag).

No new files needed — guide is rendered as a full-screen overlay div inside the existing dashboard page, toggled by JS based on guide state.

### New files (runtime, auto-created):
- `guide-completed.json` — `{zalo: boolean, telegram: boolean, completedAt: string}` in workspace

### IPC endpoints needed:
- `check-guide-needed` — returns `{needed: boolean}` based on guide-completed.json + pause file state
- `get-persona-summary` — returns `{botName, companyName, tone}` from IDENTITY.md + config
- `test-bot-message` — sends message to gateway HTTP API, returns bot response text (never routes to Zalo/Telegram)
- `confirm-zalo-go-live` — clears guide-pending pause, enables channel, writes guide-completed.json

### Existing IPC reused:
- `get-knowledge-counts` — already exists, returns file counts per category

## UI Text Language

All Vietnamese text in the guide steps above is written without diacritics for spec readability. The implementation MUST use proper Vietnamese diacritics (e.g., "Chao mung" -> "Chao mung" in spec, but rendered as "Chào mừng" in UI). The implementer should translate each step's content to properly accented Vietnamese.
