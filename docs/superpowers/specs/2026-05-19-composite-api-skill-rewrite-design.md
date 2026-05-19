# Composite API Endpoints + Skill Rewrite

## Summary

Build 6 composite API endpoints that replace multi-call workflows with single calls. Fix 2 broken skills. Add 7 missing routing triggers. Create 3 new capability endpoints for the top gaps (orders, inventory, leave). Rewrite all 38 skill files to be shorter and more accurate. Zero breaking change.

## Problem

17 of 38 skills are "API-heavy" — they instruct the bot to make 4-7+ sequential `web_fetch` calls. Each call needs exact URL, JSON body, params, and error handling described in the skill file. This makes skills 150-200 lines long and fragile. The bot wastes tokens on plumbing instead of thinking.

## Approach: Smarter APIs, Not New Architecture

Move complexity from LLM instructions INTO the server. The bot calls ONE endpoint, the server handles the multi-step workflow internally. Skills shrink from 200 lines to 20-30 lines.

No new architecture. No registry system. No JSON recipes. Keep markdown skills. Keep `web_fetch`. Keep all existing URLs.

## Part 1: Composite Endpoints (high-impact)

### 1.1 `POST /api/sheets/create-formatted`

Replaces the 7-call sheet creation workflow (create → numberFormat → update → append → freeze → format → format).

```json
Request:
{
  "title": "Theo dõi khách Zalo 2026-05-19",
  "headers": ["Ngày", "Tên khách", "SĐT", "Nội dung", "Trạng thái", "NV follow-up", "Ghi chú", "Hẹn"],
  "data": [
    ["2026-05-19", "Nguyễn Văn An", "0909123456", "Hỏi gói 6 tháng", "Mới", "", "Chờ xác nhận", "2026-05-21"]
  ],
  "style": "crm",
  "textColumns": ["C"],
  "parent": "optional-folder-id"
}

Response:
{
  "spreadsheetId": "1bD4...",
  "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/1bD4.../edit",
  "rowsWritten": 1
}
```

**Styles** (server-side presets):
- `crm` — dark blue header, white bold text, freeze row 1, alternating row colors, wrap all, thin borders
- `report` — gray header, freeze row 1, auto-width
- `plain` — just data, no formatting
- `custom` — pass `headerBg`, `headerFg`, `freezeRows` etc. for full control

**Implementation:** In `google-routes.js`, the handler:
1. Calls `googleApi.createSheet(title, null, parent)`
2. For each column in `textColumns`: calls `googleApi.numberFormatSheet(id, col+':'+col, 'TEXT')`
3. Calls `googleApi.updateSheet(id, range, [headers, ...data])`
4. Calls `googleApi.freezeSheet(id, 1)`
5. Applies style preset (header format, alternating colors, borders, wrap)
6. Returns `{ spreadsheetId, spreadsheetUrl, rowsWritten }`

All error handling is server-side. Bot sees one call, one result.

### 1.2 `POST /api/zalo-crm/export`

Replaces the entire `zalo-followup-sheet.md` 5-step workflow.

```json
Request:
{
  "dateRange": "today",
  "spreadsheetId": "optional-existing-sheet",
  "title": "optional-new-sheet-title"
}

Response:
{
  "spreadsheetId": "1bD4...",
  "spreadsheetUrl": "https://...",
  "customersExported": 4,
  "customers": [
    { "name": "Nguyễn Văn An", "phone": "0909123456", "summary": "Hỏi gói 6 tháng" }
  ]
}
```

**Implementation:** Server-side handler:
1. Reads `memory/zalo-users/*.md` files, filters by date
2. Reads friends cache (`friends.json`) to get phone numbers
3. Extracts customer name, phone, summary, pending status from each memory file
4. Calls `sheets/create-formatted` internally with style `crm` + the extracted data
5. Returns result with link

### 1.3 `POST /api/report/daily`

Replaces `bao-cao-ngay.md` 6+ source reads.

```json
Request:
{
  "type": "daily",
  "date": "2026-05-19"
}

Response:
{
  "date": "2026-05-19",
  "revenue": { "income": 15000000, "expense": 3200000, "net": 11800000 },
  "customers": { "newToday": 3, "pendingFollowUp": 2 },
  "crons": { "fired": 5, "failed": 0 },
  "highlights": ["Khách Nguyễn Văn An hỏi gói 6 tháng", "Cron báo giá đã chạy OK"],
  "sources": ["so-sach.md", "cong-no.md", "memory/zalo-users/", "cron-runs.jsonl"]
}
```

**Implementation:** Reads from so-sach.md, cong-no.md, memory/zalo-users/ (recent), follow-up-queue.json, cron-runs.jsonl, audit.jsonl. Aggregates into structured summary. Bot just formats the response for CEO.

## Part 2: New Gap Capabilities

### 2.1 Order Pipeline — `POST /api/order/*`

Data stored in `workspace/orders.json`.

```
POST /api/order/create    { customer, items: [{name, qty, price}], note? }
GET  /api/order/list      ?status=pending&from=2026-05-01&to=2026-05-19
POST /api/order/update     { orderId, status?, note?, payment? }
GET  /api/order/status     ?orderId=ORD-20260519-001
GET  /api/order/summary    ?from=2026-05-01&to=2026-05-31
```

Order lifecycle: `new` → `confirmed` → `paid` → `delivered` → `completed` | `cancelled`

Each order auto-generates an ID: `ORD-YYYYMMDD-NNN`.

### 2.2 Inventory — `POST /api/inventory/*`

Data stored in `workspace/inventory.json`.

```
POST /api/inventory/adjust   { sku, name?, qty, type: "in"|"out", note? }
GET  /api/inventory/check    ?sku=SP001  (or no params = full list)
GET  /api/inventory/alerts   (items below minQty threshold)
POST /api/inventory/set-min  { sku, minQty }
```

### 2.3 Leave/Attendance — `POST /api/leave/*`

Data stored in `workspace/leave-requests.json`.

```
POST /api/leave/request    { employee, type: "annual"|"sick"|"personal", from, to, note? }
GET  /api/leave/list       ?month=2026-05&employee=Linh
POST /api/leave/approve    { requestId, approvedBy? }
GET  /api/leave/summary    ?month=2026-05
```

## Part 3: Fix Broken Skills

### 3.1 `so-sach-don-gian.md` — fix write path

Current: says "ghi vào workspace/so-sach.md" but doesn't provide the API call.
Fix: Add exact `web_fetch POST /api/workspace/write` call with path and content params.

### 3.2 `cong-no.md` — fix write path

Same issue. Add exact workspace API write call.

### 3.3 Add 7 missing Capability Router triggers to AGENTS.md

| Trigger | Skill |
|---------|-------|
| "báo cáo ngày/tuần", "hôm nay thế nào" | bao-cao-ngay.md |
| "sổ sách", "thu chi", "ghi thu", "ghi chi" | so-sach-don-gian.md |
| "công nợ", "ai nợ", "khách nợ" | cong-no.md |
| "kịch bản", "mẫu trả lời", "script bán" | kich-ban-ban-hang.md |
| "checklist", "danh sách kiểm tra" | checklist-van-hanh.md |
| "tuyển dụng", "JD", "đăng tuyển" | tuyen-dung-nhanh.md |
| "lịch hẹn", "appointment", "đặt lịch" | appointments.md |

### 3.4 Add triggers for new capabilities

| Trigger | Endpoint |
|---------|----------|
| "ghi đơn", "đơn hàng", "order" | order/* |
| "tồn kho", "kiểm kho", "nhập hàng", "xuất hàng" | inventory/* |
| "xin nghỉ", "nghỉ phép", "chấm công", "attendance" | leave/* |

## Part 4: Skill Rewrite Guidelines

Every skill gets rewritten following these rules:

### API-heavy skills (17 skills) — SHRINK

Before (200 lines):
```markdown
## Bước 1: Kiểm tra Google connected
web_fetch url="http://127.0.0.1:20200/api/google/status" method=GET
Nếu lỗi → báo CEO kết nối Google Workspace...

## Bước 2: Set cột SĐT thành TEXT
web_fetch url="http://127.0.0.1:20200/api/google/sheets/number-format" method=POST body=...

## Bước 3: Ghi header
web_fetch url="http://127.0.0.1:20200/api/google/sheets/update" method=POST body=...
[... 5 more steps ...]
```

After (20 lines):
```markdown
## Tạo Sheet theo dõi khách

CEO muốn tổng hợp khách Zalo vào Sheet:
web_fetch POST /api/zalo-crm/export body={"dateRange":"today"}

Kết quả chứa spreadsheetUrl + danh sách khách. Gửi link cho CEO.

Nếu CEO muốn Sheet riêng: thêm spreadsheetId vào body.
Nếu lỗi "Google not connected": báo CEO mở Dashboard > Google Workspace > Cài đặt.
```

### Behavioral skills (19 skills) — KEEP, IMPROVE

Keep as markdown. Fix the thin ones (veteran-behavior 18 lines → 40 lines with examples). Fix industry skills with at least 3 concrete examples per industry. Don't try to make them API calls.

### Content-template skills (7 skills) — KEEP, FIX BROKEN PATHS

Keep as markdown templates. Fix `so-sach` and `cong-no` write paths. Ensure Vietnamese diacritics throughout.

## Part 5: Backward Compatibility

- ALL existing `/api/*` URLs unchanged — old crons keep working
- Old skill files stay on disk — old cron prompts referencing them still work
- New composite endpoints are ADDITIVE — new URLs alongside old ones
- `orders.json`, `inventory.json`, `leave-requests.json` created on first use (no migration needed)
- AGENTS.md changes are ADDITIVE (new trigger rows, not removed rows)

## Files to Create

| File | Purpose |
|------|---------|
| `electron/lib/composite-routes.js` | All composite endpoint handlers |
| `electron/lib/order-manager.js` | Order CRUD + lifecycle |
| `electron/lib/inventory-manager.js` | Inventory CRUD + alerts |
| `electron/lib/leave-manager.js` | Leave CRUD + attendance |

## Files to Modify

| File | Change |
|------|--------|
| `electron/lib/cron-api.js` | Register composite + gap routes |
| `electron/lib/google-routes.js` | Add `/sheets/create-formatted` handler |
| `AGENTS.md` | Add 10 missing triggers, add new capability references |
| All 38 skill files | Rewrite per guidelines above |
| `skills/INDEX.md` | Update counts, add new skills |

## Testing Strategy

Every composite endpoint is curl-testable BEFORE the bot uses it:

```bash
# Test sheets create-formatted
curl -X POST http://127.0.0.1:20200/api/sheets/create-formatted \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","headers":["A","B"],"data":[["1","2"]],"style":"crm"}'

# Test order create
curl -X POST http://127.0.0.1:20200/api/order/create \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"customer":"Test Corp","items":[{"name":"Widget","qty":10,"price":50000}]}'

# Test daily report
curl -X POST http://127.0.0.1:20200/api/report/daily \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"daily","date":"2026-05-19"}'
```

If curl works → web_fetch works → bot works. No integration surprises.

## Smoke Tests

Add to `smoke-test.js`:
- Verify composite-routes.js exports all handlers
- Verify order-manager.js exports CRUD functions
- Verify inventory-manager.js exports CRUD functions
- Verify leave-manager.js exports CRUD functions
- Verify new routes registered in cron-api.js
