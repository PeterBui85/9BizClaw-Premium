# Sheets Format API + Zalo Phone Display + Follow-up Sheet Skill

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Sheets formatting routes, show Zalo phone numbers in profile summaries, and build a skill that auto-generates formatted CRM tracking sheets from Zalo customer data.

**Architecture:** Wrap existing `gog` CLI commands (`sheets create`, `sheets format`, `sheets freeze`, `sheets number-format`) via new routes in `google-routes.js`. Enrich the Zalo profile modal with phone number. Build a `zalo-followup-sheet.md` skill file.

**Tech Stack:** `gog` CLI (v0.13.0), Google Sheets API v4 via `gogExec()`, existing IPC + preload bridge pattern.

---

## Task 1: Show phone number in Zalo profile modal

**Files:**
- Modify: `electron/ui/dashboard.html` — `openZaloUserMemory()` function (~line 8407)

- [ ] **Step 1: Pass phone number to modal opener**

In the friend list rendering (~line 7555), the `openZaloUserMemory` call only passes `userId` and `displayName`. Add `phoneNumber`:

```js
// ~line 7555: change onclick to pass phone
onclick="openZaloUserMemory('${escJs(f.userId)}', '${escJs(f.displayName)}', '${escJs(f.phoneNumber || '')}')"
```

- [ ] **Step 2: Update `openZaloUserMemory` to accept and display phone**

```js
// ~line 8407
async function openZaloUserMemory(senderId, displayName, phoneNumber) {
  // ... existing code ...
  // ~line 8416: update subtitle to include phone
  const subParts = ['ID: ' + senderId];
  if (phoneNumber) subParts.push(formatViPhone(phoneNumber));
  subEl.textContent = subParts.join(' · ');
```

- [ ] **Step 3: Add `formatViPhone` helper**

Before `openZaloUserMemory`, add:
```js
function formatViPhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/\D/g, '');
  if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
  return s;
}
```

This converts `84905800984` → `0905800984`.

- [ ] **Step 4: Also show phone in the meta section when memory loads**

In the `openZaloUserMemory` function, after `meta.gender` check (~line 8436), add:
```js
if (phoneNumber) metaParts.push(formatViPhone(phoneNumber));
```

- [ ] **Step 5: Verify**

Open Dashboard → Zalo tab → click profile icon on a friend → modal should show phone number in subtitle and meta line.

---

## Task 2: Add Google Sheets format routes

**Files:**
- Modify: `electron/lib/google-api.js` — add 3 methods
- Modify: `electron/lib/google-routes.js` — add 3 route handlers

- [ ] **Step 1: Add `createSheet()` to `google-api.js`**

After the existing `appendSheet` function:
```js
async function createSheet(title, tabNames, parentFolderId) {
  const args = ['sheets', 'create', title, '-j', '--no-input'];
  if (tabNames) args.push('--sheets=' + tabNames);
  if (parentFolderId) args.push('--parent=' + parentFolderId);
  return gogExec(args, 15000);
}
```

Export it.

- [ ] **Step 2: Add `formatSheet()` to `google-api.js`**

```js
async function formatSheet(spreadsheetId, range, formatJson, formatFields) {
  const args = ['sheets', 'format', spreadsheetId, range, '-j', '-y',
    '--format-json=' + (typeof formatJson === 'string' ? formatJson : JSON.stringify(formatJson)),
    '--format-fields=' + formatFields];
  return gogExec(args, 15000);
}
```

Export it.

- [ ] **Step 3: Add `freezeSheet()` and `numberFormatSheet()` to `google-api.js`**

```js
async function freezeSheet(spreadsheetId, rows, cols, sheetName) {
  const args = ['sheets', 'freeze', spreadsheetId, '-j', '-y'];
  if (rows !== undefined) args.push('--rows=' + rows);
  if (cols !== undefined) args.push('--cols=' + cols);
  if (sheetName) args.push('--sheet=' + sheetName);
  return gogExec(args, 15000);
}

async function numberFormatSheet(spreadsheetId, range, type) {
  return gogExec(['sheets', 'number-format', spreadsheetId, range, '-j', '-y', '--type=' + type], 15000);
}
```

Export both.

- [ ] **Step 4: Add route handlers in `google-routes.js`**

After the existing `/sheets/append` handler:

```js
if (urlPath === '/sheets/create') {
  if (blockZaloMutation('Google Sheets create')) return;
  if (!params.title) return jsonResp(res, 400, { error: 'title required' });
  const r = await googleApi.createSheet(params.title, params.sheets, params.parent);
  return jsonResp(res, 200, r);
}
if (urlPath === '/sheets/format') {
  if (blockZaloMutation('Google Sheets format')) return;
  if (!params.spreadsheetId || !params.range || !params.formatJson || !params.formatFields)
    return jsonResp(res, 400, { error: 'spreadsheetId, range, formatJson, formatFields required' });
  const r = await googleApi.formatSheet(params.spreadsheetId, params.range, params.formatJson, params.formatFields);
  return jsonResp(res, 200, r);
}
if (urlPath === '/sheets/freeze') {
  if (blockZaloMutation('Google Sheets freeze')) return;
  if (!params.spreadsheetId) return jsonResp(res, 400, { error: 'spreadsheetId required' });
  const r = await googleApi.freezeSheet(params.spreadsheetId, params.rows, params.cols, params.sheet);
  return jsonResp(res, 200, r);
}
if (urlPath === '/sheets/number-format') {
  if (blockZaloMutation('Google Sheets number-format')) return;
  if (!params.spreadsheetId || !params.range || !params.type)
    return jsonResp(res, 400, { error: 'spreadsheetId, range, type required' });
  const r = await googleApi.numberFormatSheet(params.spreadsheetId, params.range, params.type);
  return jsonResp(res, 200, r);
}
```

- [ ] **Step 5: Verify routes work**

Run bot, then test via curl:
```
curl -X POST http://127.0.0.1:20200/api/google/sheets/create -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d "{\"title\":\"Test API Sheet\"}"
```

---

## Task 3: Update `google-workspace.md` skill with new routes

**Files:**
- Modify: `skills/operations/google-workspace.md`

- [ ] **Step 1: Add new routes to the Sheets section**

After the existing `POST /api/google/sheets/append` entry (~line 46), add:

```markdown
- POST /api/google/sheets/create body: {title, sheets?, parent?} — tao Google Sheet moi
- POST /api/google/sheets/format body: {spreadsheetId, range, formatJson, formatFields} — format cells (CellFormat JSON + field mask)
- POST /api/google/sheets/freeze body: {spreadsheetId, rows?, cols?, sheet?} — freeze dong/cot
- POST /api/google/sheets/number-format body: {spreadsheetId, range, type} — dinh dang so (NUMBER|CURRENCY|PERCENT|DATE|TIME|TEXT)
```

- [ ] **Step 2: Add examples to mapping section**

```markdown
- "tao Google Sheet moi" → POST /api/google/sheets/create
- "format header dam nen xanh" → POST /api/google/sheets/format
- "freeze dong dau" → POST /api/google/sheets/freeze
- "cot SDT dang text" → POST /api/google/sheets/number-format type=TEXT
```

- [ ] **Step 3: Add formatting recipe for CRM-style sheets**

```markdown
## Recipe: Tao sheet CRM co format dep

1. `POST /api/google/sheets/create {"title":"Ten Sheet"}`
2. `POST /api/google/sheets/number-format {"spreadsheetId":"<id>","range":"C:C","type":"TEXT"}` (SDT giu so 0 dau)
3. `POST /api/google/sheets/update` — ghi header + data
4. `POST /api/google/sheets/freeze {"spreadsheetId":"<id>","rows":1}`
5. `POST /api/google/sheets/format {"spreadsheetId":"<id>","range":"A1:H1","formatJson":{"textFormat":{"bold":true,"foregroundColorStyle":{"rgbColor":{"red":1,"green":1,"blue":1}}},"backgroundColor":{"red":0.1,"green":0.21,"blue":0.36}},"formatFields":"textFormat.bold,textFormat.foregroundColorStyle,backgroundColor"}`
6. `POST /api/google/sheets/format {"spreadsheetId":"<id>","range":"A1:H100","formatJson":{"wrapStrategy":"WRAP"},"formatFields":"wrapStrategy"}`
```

---

## Task 4: Create `zalo-followup-sheet.md` skill

**Files:**
- Create: `skills/operations/zalo-followup-sheet.md`
- Modify: `skills/INDEX.md` — add entry
- Modify: `AGENTS.md` — add trigger

- [ ] **Step 1: Create skill file**

```markdown
---
name: zalo-followup-sheet
description: Tong hop khach hang Zalo vao Google Sheet co format CRM de nhan vien follow-up
metadata:
  version: 1.0.0
---

# Tong hop khach Zalo → Google Sheet

CHI CEO Telegram. Khach Zalo → "Da day la thong tin noi bo a."

## Khi nao dung

CEO noi: "tong hop khach Zalo", "bao cao khach vao Sheet", "follow-up sheet", "danh sach khach can cham", "xuat khach hang ra Sheet"

## Cot (Standard CRM)

| Col | Header | Ghi chu |
|-----|--------|---------|
| A | Ngay | YYYY-MM-DD |
| B | Ten khach | Tu memory file header |
| C | SDT | Tu openzca friend list (format 84xxx → 0xxx). Cot TEXT de giu so 0 |
| D | Noi dung hoi | Tom tat hoi thoai gan nhat |
| E | Trang thai | Mac dinh "Moi". Dropdown: Moi / Dang xu ly / Xong / Huy |
| F | Nhan vien follow-up | De trong cho CEO/nhan vien dien |
| G | Ghi chu | Tom tat tu memory file |
| H | Hen lien he lai | Ngay hen neu co trong memory |

## Quy trinh (5 buoc)

### Buoc 1: Lay danh sach khach Zalo

Doc `memory/zalo-users/*.md` qua workspace API. Loc file theo ngay (mac dinh: hom nay).
Moi file: filename = senderId, dong dau `#` = ten khach, noi dung = hoi thoai.

### Buoc 2: Lay SDT tu friend list

Goi `web_fetch GET http://127.0.0.1:20200/api/zalo/friends` (neu co route)
HOAC: doc du lieu tu buoc 1, match senderId voi danh sach ban be da cache.

Chuyen `84xxxxxxxxx` → `0xxxxxxxxx` cho format Viet Nam.

### Buoc 3: Tao hoac tim Sheet

- CEO chi dinh Sheet co san → dung spreadsheetId do
- Khong chi dinh → `POST /api/google/sheets/create {"title":"Theo doi khach Zalo YYYY-MM-DD"}`

### Buoc 4: Ghi du lieu

1. `POST /api/google/sheets/number-format {"spreadsheetId":"<id>","range":"C:C","type":"TEXT"}` — giu so 0 dau SDT
2. `POST /api/google/sheets/update` — ghi header row A1:H1
3. `POST /api/google/sheets/append` — ghi data rows

### Buoc 5: Format dep

1. `POST /api/google/sheets/freeze {"spreadsheetId":"<id>","rows":1}` — dong header
2. `POST /api/google/sheets/format` — header: bold trang, nen xanh dam
   ```json
   {"spreadsheetId":"<id>","range":"A1:H1",
    "formatJson":{"textFormat":{"bold":true,"foregroundColorStyle":{"rgbColor":{"red":1,"green":1,"blue":1}}},"backgroundColor":{"red":0.1,"green":0.21,"blue":0.36}},
    "formatFields":"textFormat.bold,textFormat.foregroundColorStyle,backgroundColor"}
   ```
3. `POST /api/google/sheets/format` — wrap text tat ca cells
   ```json
   {"spreadsheetId":"<id>","range":"A1:H100",
    "formatJson":{"wrapStrategy":"WRAP"},
    "formatFields":"wrapStrategy"}
   ```

### Ket qua

Gui CEO link Google Sheet. Bao tong: "Em da tong hop N khach vao Sheet [link]. Nhan vien mo Sheet → dien cot Nhan vien va Trang thai de theo doi."

## Cron

CEO: "moi toi 8h tong hop khach Zalo vao Sheet" → tao cron voi prefix `[WORKFLOW]`.
```

- [ ] **Step 2: Add to INDEX.md**

After the "Excel" row in the operations table:
```
| Tong hop khach Zalo → Sheet | `zalo-followup-sheet.md` | Xuat danh sach khach Zalo vao Google Sheet co format CRM |
```

Update count from 26 to 27, total from 37 to 38.

- [ ] **Step 3: Add trigger to AGENTS.md capability router**

After the `ceo_memory` trigger row:
```
| "tong hop khach Zalo", "xuat khach ra Sheet", "follow-up sheet", "bao cao khach vao Sheet" | `zalo_followup_sheet` | `skills/operations/zalo-followup-sheet.md` |
```

- [ ] **Step 4: Verify**

Tell bot via Telegram: "tong hop khach Zalo hom nay vao Google Sheet"
Expected: bot creates Sheet, writes data with formatted headers, returns link.

---

## Task 5: Regenerate system map + smoke test

**Files:**
- Modify: `docs/generated/system-map.json`
- Modify: `docs/generated/system-map.txt`

- [ ] **Step 1: Regenerate map**

```bash
cd electron && node scripts/generate-system-map.js
```

- [ ] **Step 2: Run smoke**

```bash
cd electron && npm run smoke
```

Expected: 0 failures.

- [ ] **Step 3: Commit all changes**

```bash
git add -A && git commit -m "feat: Google Sheets format API + Zalo phone in profile + follow-up sheet skill"
```
