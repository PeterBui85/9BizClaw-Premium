# Google Calendar Integration — CEO-owned OAuth Credentials

**Date:** 2026-04-19
**Version:** v2.4.0 (target)
**Supersedes:** [docs/superpowers/specs/2026-04-10-google-calendar-design.md](./2026-04-10-google-calendar-design.md) (MODORO-shared-key model, abandoned)
**Status:** Design approved, pending spec review + plan

## Mục tiêu

CEO dùng Google Calendar của mình để:
- Xem + quản lý sự kiện trực tiếp trong Dashboard 9BizClaw
- Chat với bot qua Telegram để tạo/sửa/xóa sự kiện ("thêm lịch mai 2pm họp Huy")
- Không phụ thuộc vào MODORO cho OAuth verification — CEO tự tạo Google Cloud project riêng, không chia sẻ credentials với ai

Thay thế feature "Lịch hẹn" local hiện tại (v2.3.48) bằng Google Calendar integration.

## Scope

**Trong phạm vi v2.4.0:**
- Tier 2a — Dashboard list/CRUD events
- Tier 2b — Bot CRUD events via Telegram chat (CEO-facing, marker-based)
- 6-step CEO setup wizard with GCP deep-links + credential validation
- Migration of local `appointments.json` → `.learnings/` archive

**Hoãn sang spec riêng:**
- Tier 1 — Dashboard `<webview>` embed of Google Calendar (skip — phone app good enough)
- Tier 3 — Customer-facing Zalo auto-booking (needs separate threat model + conversational flow design)
- Multi-calendar support (CEO có thể có work + personal calendar — v1 chỉ hỗ trợ 1 calendar primary)
- Staff calendar sharing

## Architecture

```
electron/gcal/              (mostly existing, ~800 lines, placeholder creds)
├── auth.js                 OAuth2 flow + token persist via safeStorage
├── calendar.js             freebusy, events.list/insert/update/delete
├── config.js               working hours, calendar ID, reminder defaults
└── credentials.js          NEW — read/write CEO's CLIENT_ID + SECRET

electron/main.js additions:
  + ipcMain 'gcal-save-credentials' {clientId, clientSecret}
  + ipcMain 'gcal-validate-credentials' → pings token endpoint
  + ipcMain 'gcal-create-event', 'gcal-update-event', 'gcal-delete-event',
             'gcal-list-events', 'gcal-get-freebusy'
  + interceptGcalMarkers(text) → called BEFORE sendTelegram/sendZalo output filter
  + cleanup of legacy appointment IPC handlers + cron reminders

electron/ui/dashboard.html:
  - DELETE local appointments page body (~lines 2573-2624 + helpers)
  + REPLACE with Google Calendar page (same #page-calendar, same sidebar slot)
  + INSERT 6-step setup wizard (modal, first-run + "Kết nối lại")

workspace files:
  + gcal-credentials.enc    safeStorage-encrypted CLIENT_ID + SECRET
  + gcal-tokens.enc         safeStorage-encrypted access + refresh tokens
  + gcal-config.json        workingHours, calendarId, slotDuration, reminderMinutes
  + logs/gcal-actions.jsonl audit — every bot marker + API call + result
  + .learnings/appointments-archive-YYYY-MM-DD.md   migration output
  + .learnings/appointments-migrated.flag           idempotency marker
```

### Invariants

1. **Zero hardcoded OAuth secrets.** `auth.js` reads CLIENT_ID + SECRET from `gcal-credentials.enc` at runtime. If file missing → refuse OAuth start, show wizard instead. The placeholder at `auth.js:21-22` (from 2026-04-10 spec) is removed.
2. **CEO is sole user of the OAuth app.** Refresh tokens persist indefinitely (Production mode in GCP).
3. **All bot-initiated calendar writes emit audit event before execution.** Marker text preserved in `logs/gcal-actions.jsonl` for forensic trace.
4. **No customer-facing surface in v1.** Zalo inbound path does NOT receive calendar markers. Only CEO Telegram.
5. **Single CRUD path.** Both Dashboard forms and bot markers hit the same IPC handlers — same validation, same audit, same rate limits.

## OAuth2 — CEO-owned credentials

**Model:** Each CEO creates their own Google Cloud project + OAuth 2.0 client. MODORO does not ship any Google-issued secrets.

**Consequences:**
- No Google verification needed at MODORO side — app scopes apply per-CEO to their own OAuth client
- OAuth consent screen shows CEO's project name + CEO's email as developer (not MODORO branded)
- Must use **Production** mode, not Testing mode. Testing mode expires refresh tokens after 7 days — unacceptable for daily-use calendar automation. Production mode (for CEO's own OAuth client, used only by CEO themselves) does NOT require Google review for sensitive scopes because the app is effectively "internal-use" even though technically marked External.

**Scopes requested (minimal):**
```
https://www.googleapis.com/auth/calendar.events     (create/update/delete events)
https://www.googleapis.com/auth/calendar.readonly   (list + freebusy)
```

No Drive, no Gmail, no contacts. Only calendar.

**Redirect URI:** `http://127.0.0.1:20199/gcal/callback` (same as 2026-04-10 spec — keeps local callback server unchanged).

## Setup wizard (6 steps)

Modal dialog triggered by "Kết nối Google Calendar" button on Lịch hẹn tab when not connected. Each step has:
- Vietnamese instructions
- Deep-link button that opens the exact GCP console URL in external browser
- Annotated screenshot
- "Đã làm xong" progress advance
- No step advance possible without confirmation of completion

**Step 1/6 — Tạo Google Cloud project**
- Deep-link: `https://console.cloud.google.com/projectcreate`
- Instructions: đặt tên project bất kỳ, bấm Create, chờ ~30s

**Step 2/6 — Bật Calendar API**
- Deep-link: `https://console.cloud.google.com/apis/library/calendar-json.googleapis.com`
- Click Enable, chờ 10-20s

**Step 3/6 — Cấu hình OAuth consent screen**
- Deep-link: `https://console.cloud.google.com/apis/credentials/consent`
- Chọn External. App name (bất kỳ). Support email + developer email = của CEO.
- **CRITICAL: ở màn Summary, bấm "PUBLISH APP"** (Production mode). Xác nhận.

**Step 4/6 — Tạo OAuth Client ID**
- Deep-link: `https://console.cloud.google.com/apis/credentials/oauthclient`
- Application type = **Web application**
- Authorized redirect URIs = `http://127.0.0.1:20199/gcal/callback` (copy button in wizard)
- Bấm Create → Google shows popup with CLIENT_ID + SECRET

**Step 5/6 — Dán Client ID + Secret + Validate**
- Two text inputs
- "Kiểm tra" button → `gcal-validate-credentials` IPC
- Validation: POST `https://oauth2.googleapis.com/token` with grant_type=refresh_token + dummy refresh token
  - Returns 401 `invalid_client` → credentials wrong → show error, allow retry
  - Returns 400 `invalid_grant` → credentials valid (the refresh token is fake, but client auth passed) → green check, advance
  - Network error → show "Không kết nối được Google — kiểm tra mạng"
- Stored to `gcal-credentials.enc` on advance

**Step 6/6 — Đăng nhập Google**
- "Mở cửa sổ đăng nhập Google" button
- Opens real OAuth consent flow (CEO grants calendar scopes to CEO's own app)
- Redirect callback stores refresh_token to `gcal-tokens.enc`
- Wizard closes, Dashboard refreshes to show live events

**Estimated time:** 15-20 min for CEO who's never seen GCP console. Deep-links remove the "navigate GCP" friction which is 60%+ of total time.

## Dashboard UX

Same sidebar slot (`#page-calendar`), same icon (calendar), same label (Lịch hẹn). Body replaced.

### Not connected state

- Big illustration (calendar + Google logo)
- Headline: "Bot 9BizClaw dùng lịch Google Calendar riêng của sếp — không có dữ liệu nào gửi về MODORO"
- Primary CTA: "Kết nối Google Calendar →" (launches wizard)
- Sub-text: "Cần ~15 phút một lần duy nhất để thiết lập"

### Connected state

Header row:
- Connected email (e.g., `anh@company.com`) + green dot
- Calendar name: primary (or selected)
- Working hours: 08:00–18:00 (from config)
- Buttons: Làm mới, + Thêm, Cài đặt (gear), Ngắt kết nối

2-column layout:
- **Left** — Event list grouped: Hôm nay (N), Sắp tới 7 ngày (N), Đã qua (collapsed by default)
- **Right** — Detail pane for selected event: title, date/time, duration, guests, location, description, [Mở trong Google] [Sửa] [Xóa]

### Create/Edit modal

Fields:
- Tiêu đề (required)
- Bắt đầu: date picker + time picker (local timezone, default workspace timezone)
- Thời lượng: 15/30/60/90/120 + custom minutes
- Guests: comma-separated emails (optional)
- Location: text (optional)
- Mô tả: textarea (optional)

Save → `gcal-create-event` or `gcal-update-event` IPC → refresh list.

### Settings submodal

- Calendar dropdown (populated from `gcal-list-calendars`)
- Working hours sliders (start/end, 24h format)
- Default slot duration (15/30/45/60)
- Default reminder minutes (5/10/15/30/60)
- Saves to `gcal-config.json`

## Bot markers + command grammar

### Marker format

5 markers, all JSON-in-brackets, all emitted by bot as part of its reply text:

```
[[GCAL_CREATE: {"summary":"...","start":"ISO","durationMin":N,"location":"...","guests":["a@b.com"]}]]
[[GCAL_LIST: {"dateFrom":"ISO","dateTo":"ISO","limit":10}]]
[[GCAL_UPDATE: {"eventId":"abc","patch":{"start":"ISO","summary":"..."}}]]
[[GCAL_DELETE: {"eventId":"abc"}]]
[[GCAL_FREEBUSY: {"dateFrom":"ISO","dateTo":"ISO"}]]
```

### Interception pipeline

Order in `sendTelegram()` (similar for future Zalo but NOT in v1):
```
1. interceptGcalMarkers(text)  ← NEW, runs first
2. stripTelegramMarkdown(text)
3. filterSensitiveOutput(text)
4. split >4096 chunks
5. HTTP POST to Telegram
```

`interceptGcalMarkers`:
1. Regex `/\[\[GCAL_(CREATE|LIST|UPDATE|DELETE|FREEBUSY):\s*(\{[^\]]+\})\]\]/g`
2. For each match, JSON.parse the payload
3. If parse fails → replace marker with "⚠️ Bot thử gọi Google Calendar nhưng cú pháp lỗi — sếp thử lại.", log raw marker to `logs/gcal-actions.jsonl`
4. If parse OK → call corresponding IPC handler, format result as Vietnamese text, replace marker
5. Log every marker + result to audit jsonl

### AGENTS.md additions (v48 → v49)

New section "## Google Calendar — dùng markers [[GCAL_X: ...]]" with:
- 5 marker signatures
- Vietnamese date parsing rules:
  - "mai 2pm" → next day 14:00 local
  - "thứ 5 tuần sau" → Thursday of next week (Monday-first)
  - "14h ngày 25" → 25th of current month 14:00
  - "sáng" = 09:00, "trưa" = 12:00, "chiều" = 14:00, "tối" = 19:00
- Ambiguity rule: if date/time/duration missing or ambiguous → bot asks 1 clarifying question BEFORE emitting marker
- Destructive action rule: DELETE + UPDATE require explicit CEO confirmation in prior turn. Bot must not emit destructive marker on first mention. Audit trail records confirmation dialog.

### Example flows

**Create:**
```
CEO: "thêm lịch họp Huy"
Bot: "Dạ sếp muốn họp ngày nào, mấy giờ, bao nhiêu phút ạ?"
CEO: "ngày mai 2pm 30 phút"
Bot emits: [[GCAL_CREATE: {"summary":"Họp Huy","start":"2026-04-20T14:00:00+07:00","durationMin":30}]]
main.js replaces with: "Đã tạo lịch 20/04 14:00 'Họp Huy' · link: https://calendar.google.com/event?eid=..."
```

**List:**
```
CEO: "lịch tuần này?"
Bot: [[GCAL_LIST: {"dateFrom":"2026-04-19","dateTo":"2026-04-26","limit":20}]]
main.js replaces with: "Tuần này có 8 lịch: Thứ 2 09:00 Họp team • Thứ 3 14:00 Tư vấn Huy • ..."
```

**Update with confirmation:**
```
CEO: "dời cuộc họp Huy sang 4pm"
Bot: "Dạ có 1 cuộc với Huy ngày 22/04 14:00. Sếp xác nhận dời sang 16:00 cùng ngày?"
CEO: "ừ"
Bot: [[GCAL_UPDATE: {"eventId":"xyz","patch":{"start":"2026-04-22T16:00:00+07:00","end":"2026-04-22T17:00:00+07:00"}}]]
main.js: "Đã dời cuộc 'Tư vấn Huy' sang 22/04 16:00–17:00."
```

**Ambiguous → clarify:**
```
CEO: "xóa lịch họp"
Bot: "Sếp muốn xóa cuộc nào ạ? Tuần này có 3 lịch liên quan: [list]"
CEO: "cuộc với Huy thứ 5"
Bot: "Xác nhận xóa 'Tư vấn Huy' 22/04 14:00?"
CEO: "ok"
Bot: [[GCAL_DELETE: {"eventId":"xyz"}]]
main.js: "Đã xóa 'Tư vấn Huy' 22/04 14:00."
```

## Migration (soft replace)

On first boot after v2.4.0 upgrade, `seedWorkspace` runs `migrateLocalAppointments()`:

1. Check: `appointments.json` exists AND `.learnings/appointments-migrated.flag` does not
2. If yes:
   - Read legacy file
   - Write `.learnings/appointments-archive-YYYY-MM-DD.md` with human-readable format (events grouped by date)
   - Delete `appointments.json`
   - Create `.learnings/appointments-migrated.flag` for idempotency
   - Emit `auditLog('appointments_migrated', { count: N, archivePath })`
   - Queue one-time Dashboard toast: "Lịch hẹn cũ đã được lưu vào .learnings/ — kết nối Google Calendar để tạo lịch mới."
3. Legacy appointment reminder cron removed from `startCronJobs()`. Google Calendar phone notifications replace it.

**Rollback:** if merchant downgrades to v2.3.48 (or earlier), appointments.json is gone. `.learnings/appointments-archive-*.md` survives. Release note warns: "Sau upgrade, lịch hẹn cũ chuyển sang archive. Downgrade không phục hồi — kết nối Google Calendar rồi tạo lại."

## Secret storage

| File | Content | Storage | Sensitivity |
|------|---------|---------|-------------|
| `gcal-credentials.enc` | CLIENT_ID + CLIENT_SECRET | `safeStorage.encryptString` | Medium — impersonates CEO's OAuth app, scoped by consent |
| `gcal-tokens.enc` | access_token + refresh_token | `safeStorage.encryptString` | **High** — refresh token = full account access until revoked |
| `gcal-config.json` | calendarId, workingHours, slotDuration, reminderMinutes | plain JSON | None |

**safeStorage fallback:** on Linux without keyring, `safeStorage.isEncryptionAvailable()` returns false. Fall back to plain JSON at `gcal-credentials.plain` + `gcal-tokens.plain`. Boot warning fires: "⚠ Google Calendar credentials stored unencrypted — Linux keyring not available. CEO có thể chọn disconnect nếu không muốn lưu plain."

**Locations:** all in `getWorkspace()` (Windows `%APPDATA%/9bizclaw/`, Mac `~/Library/Application Support/9bizclaw/`). Uninstaller wipes.

**Disconnect flow:** CEO clicks "Ngắt kết nối" → `gcal-disconnect` IPC deletes all 3 files → UI returns to "Not connected" state → `auditLog('gcal_disconnected')`.

## Error handling

| Failure | Detection | CEO UX |
|---------|-----------|--------|
| CLIENT_ID typo | Step 5 validation: 401 invalid_client | Red inline error: "Client ID không hợp lệ" |
| Refresh token revoked | Next API call: 400 invalid_grant | Dashboard banner: "Kết nối hết hạn. Kết nối lại →" |
| API quota exceeded | 403 userRateLimitExceeded | "Google đang giới hạn — thử lại sau." (both Dashboard + bot reply) |
| Network offline | ENOTFOUND / ECONNREFUSED | Dashboard dot red. Bot: "Không gọi được Google, sếp thử lại sau." NO silent retry queue. |
| Marker syntax malformed | JSON.parse throws | Marker scrubbed. CEO: "⚠️ Cú pháp sai — thử lại." Raw marker logged. |
| Event deleted externally mid-update | 404 Not Found | "Lịch này đã bị xóa trên Google — sếp tạo mới nếu cần." |
| Clock drift >10 min | OAuth token validation fails with clock_skew | "Đồng hồ máy sếp lệch — vào Settings → Date & time → tick 'Set automatically'." |

## Testing plan

### Unit smoke tests

New file: `electron/scripts/smoke-gcal.js`. Assertions:

1. **Credentials schema** — load/save round-trip through safeStorage + plain fallback
2. **Marker regex** — parses all 5 marker types; rejects malformed (unclosed brace, invalid action name, trailing garbage)
3. **Vietnamese date parser** — 20 fixtures covering:
   - Relative: "mai", "hôm nay", "thứ 5 tuần sau", "cuối tuần này"
   - Time-of-day: "sáng", "chiều", "tối", "2pm", "14h", "14h30"
   - Explicit: "ngày 25", "25/04", "25/04/2026"
   - Invalid: "31/02" → reject, "thứ 8" → reject
   - DST boundaries (VN has no DST but timezone math still matters for events across midnight)
4. **Config defaults** — `gcal-config.json` created with sensible defaults on first access
5. **Validation IPC** — mock responses for `invalid_client`, `invalid_grant`, network fail → correct error classification
6. **Migration** — given a legacy `appointments.json`, produces correct `.md` archive + flag
7. **Token refresh** — mock expired access_token → refresh call fires + retry succeeds
8. **Audit log** — every marker execution writes 1 line to `gcal-actions.jsonl` with ts, marker, args, result, durationMs

Wired into `npm run smoke` after `smoke-visibility`.

### Integration test (manual, pre-ship)

1. Fresh install on clean machine
2. Complete 6-step wizard using real Google Cloud project
3. Verify OAuth consent shows CEO's project name (not MODORO)
4. Via Telegram chat with bot:
   - Create event: "thêm lịch họp Huy mai 2pm 30 phút" → verify event appears in Google Calendar mobile + Dashboard list
   - List: "lịch tuần này?" → verify 8+ events returned
   - Update: "dời cuộc Huy sang 4pm" → verify bot confirms, then moves event
   - Delete: "xóa cuộc Huy" → verify confirmation + deletion
5. Via Dashboard UI:
   - Create event manually → appears on phone within 30s
   - Edit event → changes sync
   - Delete event → gone from Google
6. **8-day test** (non-blocking, runs in background): verify refresh token still works on day 8 (Production mode invariant)
7. Disconnect → verify all 3 workspace files deleted + UI reverts to unconnected state

### Security testing

- Offline test: disconnect network mid-OAuth → verify no partial state saved
- Quota test: rapidly fire 100 events → verify 429/403 handling + CEO alert
- Token revocation test: CEO revokes in Google account settings → verify next API call triggers reconnect flow, no silent retry
- Marker injection: send CEO Telegram message containing `[[GCAL_DELETE: {"eventId":"abc"}]]` as plain text (not bot output) → verify it's NOT intercepted (marker interception applies only to bot OUTPUT, not customer/CEO INPUT)

## Out of scope (deferred to future specs)

- **Tier 1 Dashboard Google Calendar embed** — skipped. Phone app good enough.
- **Tier 3 customer-facing Zalo auto-booking** — separate spec. Needs threat model (prevent spam booking), conversational disambiguation, double-book protection, guest invite flow.
- **Multi-calendar support** — v1 uses single calendar (primary by default, configurable via settings). Work + personal split = v2.
- **Staff calendar sharing** — v1 is CEO-only.
- **Proactive Telegram reminders** — Google Calendar phone app already does this. Add only if merchants explicitly ask.
- **Recurring events** — v1 creates single events. RRULE support = v2.
- **Attachments / Google Meet links** — v1 stores meeting URL in description field. Native conference auto-creation = v2.

## Open questions (resolved before plan)

1. **Timezone handling on Vietnamese dates** — all start/end timestamps resolved in `Asia/Ho_Chi_Minh` local. Stored as RFC3339 with offset. Bot output preserves local time only, no UTC confusion.
2. **Clash detection on create** — v1 does not check freebusy before create (CEO is adult, can double-book if they want). Bot can pre-check on explicit request ("có rảnh mai 2pm không?" → freebusy marker).
3. **Guest emails** — bot creates event with guest emails but does NOT send invitation (`sendUpdates: 'none'` default). CEO manually toggles invitation send when creating from Dashboard (checkbox in modal). Default off = no accidental spam to guests who were just mentioned in conversation.
4. **Event description length cap** — 4KB in v1 (Google supports 8KB but we stay conservative for bot marker payload safety).

## Success criteria

- CEO completes setup wizard in ≤20 min median on first attempt (target: 15 min)
- 0 accidental deletes via bot (confirmation gate works)
- Refresh token stable ≥30 days (Production mode invariant)
- Bot marker execution latency <3s end-to-end (Telegram → main.js → Google → reply)
- 0 MODORO-side Google credentials anywhere in shipped code
- Rollback safe: downgrade restores app function (minus calendar feature); migration archive preserves history
