# Google Sheets Format API + Zalo Follow-up Tracking Sheet

## Summary

Expose `gog` CLI's existing `sheets format`, `sheets freeze`, `sheets create` commands via new API routes. Then build a `zalo-followup-sheet.md` skill for auto-generating formatted CRM tracking sheets from Zalo customer memory.

## Discovery: `gog` CLI already supports formatting

The `gog` binary (v0.13.0) has these sheet commands we haven't exposed yet:

- `gog sheets create <title> [--sheets=tab1,tab2] [--parent=folderId]` — create spreadsheet
- `gog sheets format <id> <range> --format-json='{"textFormat":{"bold":true},...}'` — apply CellFormat JSON
- `gog sheets freeze <id> --rows=1 [--cols=0] [--sheet=name]` — freeze rows/columns
- `gog sheets number-format <id> <range>` — number formatting
- `gog sheets add-tab <id> <tabName>` — add tab

All use the same OAuth flow already wired in `google-api.js` via `gogExec()`.

## Part 1: New API routes in `google-routes.js` + methods in `google-api.js`

### Routes to add

```
POST /api/google/sheets/create   body: {title, sheets?, parent?}
POST /api/google/sheets/format   body: {spreadsheetId, range, formatJson}
POST /api/google/sheets/freeze   body: {spreadsheetId, rows?, cols?, sheet?}
```

### Methods in `google-api.js`

```js
async function createSheet(title, tabNames, parentFolderId) {
  const args = ['sheets', 'create', title, '-j'];
  if (tabNames) args.push('--sheets=' + tabNames);
  if (parentFolderId) args.push('--parent=' + parentFolderId);
  return gogExec(args, 15000);
}

async function formatSheet(spreadsheetId, range, formatJson) {
  return gogExec(['sheets', 'format', spreadsheetId, range,
    '--format-json=' + JSON.stringify(formatJson), '-j', '-y'], 15000);
}

async function freezeSheet(spreadsheetId, rows, cols, sheetName) {
  const args = ['sheets', 'freeze', spreadsheetId, '-j', '-y'];
  if (rows !== undefined) args.push('--rows=' + rows);
  if (cols !== undefined) args.push('--cols=' + cols);
  if (sheetName) args.push('--sheet=' + sheetName);
  return gogExec(args, 15000);
}
```

### Route handlers in `google-routes.js`

```js
if (urlPath === '/sheets/create') {
  if (blockZaloMutation('Google Sheets create')) return;
  if (!params.title) return jsonResp(res, 400, { error: 'title required' });
  const r = await googleApi.createSheet(params.title, params.sheets, params.parent);
  return jsonResp(res, 200, r);
}
if (urlPath === '/sheets/format') {
  if (blockZaloMutation('Google Sheets format')) return;
  if (!params.spreadsheetId || !params.range || !params.formatJson)
    return jsonResp(res, 400, { error: 'spreadsheetId, range, formatJson required' });
  const r = await googleApi.formatSheet(params.spreadsheetId, params.range, params.formatJson);
  return jsonResp(res, 200, r);
}
if (urlPath === '/sheets/freeze') {
  if (blockZaloMutation('Google Sheets freeze')) return;
  if (!params.spreadsheetId) return jsonResp(res, 400, { error: 'spreadsheetId required' });
  const r = await googleApi.freezeSheet(params.spreadsheetId, params.rows, params.cols, params.sheet);
  return jsonResp(res, 200, r);
}
```

## Part 2: Skill `zalo-followup-sheet.md`

### Trigger

CEO says: "tổng hợp khách Zalo", "báo cáo khách vào Sheet", "follow-up sheet", "danh sách khách cần chăm"

### Columns (Standard CRM)

| Col | Header | Width hint |
|-----|--------|------------|
| A | Ngày | narrow |
| B | Tên khách | medium |
| C | SĐT | narrow |
| D | Nội dung hỏi | wide |
| E | Trạng thái | narrow |
| F | Nhân viên follow-up | medium |
| G | Ghi chú | wide |
| H | Hẹn liên hệ lại | narrow |

### Memory file format (`memory/zalo-users/<senderId>.md`)

```markdown
# Tên Khách Hàng
phone: 0909123456
---
## 2026-05-19
Khách hỏi về gói Bizclaw 6 tháng, đã gửi báo giá demo.
Chờ khách xác nhận.
```

Extraction: `#` line = customer name, `phone:` line = SĐT, latest `##` section = conversation summary, "chờ"/"pending"/"hẹn" keywords = pending status.

### Workflow (5 steps)

1. **Read** `memory/zalo-users/*.md` via workspace API — filter files modified within date range (default: today)
2. **Extract** customer name, phone, summary, pending status from each file
3. **Create or find Sheet** — if CEO specifies an existing Sheet, use it. Otherwise: `POST /api/google/sheets/create {"title":"Theo dõi khách Zalo YYYY-MM-DD"}`
4. **Write header + data** via `POST /api/google/sheets/update` (header row) then `POST /api/google/sheets/append` (data rows)
5. **Format:**
   - `POST /api/google/sheets/freeze {"spreadsheetId":"<id>","rows":1}`
   - `POST /api/google/sheets/format {"spreadsheetId":"<id>","range":"A1:H1","formatJson":{"textFormat":{"bold":true,"foregroundColorStyle":{"rgbColor":{"red":1,"green":1,"blue":1}}},"backgroundColor":{"red":0.1,"green":0.21,"blue":0.36}}}` (white bold on dark blue header)

### Cron integration

CEO: "mỗi tối 8h tổng hợp khách Zalo vào Sheet" → `[WORKFLOW]` cron runs steps 1-5 daily, appending to same Sheet or creating daily sheets.

## Part 3: Update `google-workspace.md`

Add new routes to the skill docs:
- `POST /api/google/sheets/create` — tạo Google Sheet mới
- `POST /api/google/sheets/format` — format cells (bold, color, borders via CellFormat JSON)
- `POST /api/google/sheets/freeze` — freeze rows/columns

Add examples mapping:
- "tạo Google Sheet mới" → POST /api/google/sheets/create
- "format header đậm nền xanh" → POST /api/google/sheets/format
- "freeze dòng đầu" → POST /api/google/sheets/freeze

## Files to modify

- `electron/lib/google-api.js` — add `createSheet()`, `formatSheet()`, `freezeSheet()`
- `electron/lib/google-routes.js` — add 3 route handlers
- `skills/operations/google-workspace.md` — add new route docs
- `skills/operations/zalo-followup-sheet.md` — new skill (create)
- `skills/INDEX.md` — add entry
- `AGENTS.md` — add trigger "tổng hợp khách Zalo"
