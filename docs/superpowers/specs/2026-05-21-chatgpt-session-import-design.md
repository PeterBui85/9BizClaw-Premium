# ChatGPT Session Import — Design Spec

> **Date:** 2026-05-21
> **Goal:** Fallback login for 9router when ChatGPT OAuth OTP fails (common in Vietnam). User pastes JSON from `chatgpt.com/api/auth/session` → app converts to 9router provider format → writes to db.json → restarts 9router.

---

## Architecture

Single IPC handler `import-chatgpt-session` shared by two UI entry points. Direct db.json write + 9router restart. No API calls.

```
[Wizard step 2 fallback]  ──┐
                             ├──> preload bridge ──> IPC handler ──> db.json write ──> restart 9router
[Dashboard 9Router page]  ──┘
```

---

## Data Conversion

### Input: `chatgpt.com/api/auth/session`

```json
{
  "user": {
    "id": "user-xxx",
    "name": "Name",
    "email": "user@gmail.com",
    "idp": "google-oauth2"
  },
  "expires": "2026-06-20T...",
  "accessToken": "eyJhbG...",
  "authProvider": "google-oauth2"
}
```

### Output: 9router `providerConnections[]` entry

```json
{
  "id": "<crypto.randomUUID()>",
  "provider": "codex",
  "authType": "oauth",
  "name": "<user.email>",
  "priority": "<max existing priority + 1, or 1 if first>",
  "isActive": true,
  "createdAt": "<now ISO>",
  "updatedAt": "<now ISO>",
  "email": "<user.email>",
  "accessToken": "<accessToken>",
  "refreshToken": "<refreshToken if present in session JSON, else null>",
  "expiresAt": "<expires>",
  "idToken": null,
  "testStatus": "active",
  "expiresIn": "<JWT exp - iat (original token lifetime in seconds)>",
  "providerSpecificData": {
    "chatgptAccountId": "<from JWT payload>",
    "chatgptPlanType": "<from JWT payload>"
  },
  "lastUsedAt": null,
  "consecutiveUseCount": 0,
  "lastError": null,
  "errorCode": null,
  "lastErrorAt": null,
  "backoffLevel": 0
}
```

**Notes:**
- `refreshToken`: Session endpoint may or may not include it. Extract if present — enables 9router auto-renewal. If absent, session expires in ~10 days and user must re-import.
- `idToken`: Session endpoint doesn't return this. Set null — 9router stores it from OAuth flow but doesn't require it for API calls.
- `expiresIn`: Compute from JWT claims `exp - iat` (original lifetime), NOT `exp - now` (which becomes stale immediately).
- `priority`: Use `Math.max(...existing.map(p => p.priority || 0)) + 1` to avoid collision.

### JWT extraction (accessToken)

Base64url-decode the JWT payload (middle segment, use `Buffer.from(segment, 'base64url')`) to extract:
- `https://api.openai.com/auth.chatgpt_account_id` → `providerSpecificData.chatgptAccountId`
- `https://api.openai.com/auth.chatgpt_plan_type` → `providerSpecificData.chatgptPlanType`
- `https://api.openai.com/profile.email` → `email` (fallback if `user.email` missing)
- `exp` and `iat` → compute `expiresIn = exp - iat`

No signature verification — just metadata extraction.

---

## IPC Handler: `import-chatgpt-session`

**Location:** `electron/lib/dashboard-ipc.js`

**Input:** `{ sessionJson: string }`

**Steps:**
1. `JSON.parse(sessionJson)` — reject if malformed
2. Validate: must have `accessToken` (string, length > 50) and either `user.email` or email from JWT
3. Decode JWT payload (base64url) → extract `chatgptAccountId`, `chatgptPlanType`, email, `exp`, `iat`
4. Build provider connection object (format above). Include `refreshToken` from session if present.
5. Read `db.json` via inline `path.join(appDataDir(), '9router', 'db.json')` (matches existing pattern in dashboard-ipc.js). Initialize missing keys (`providerConnections`, `combos`, `apiKeys`, `settings`, etc.) using same template as `setup-9router-auto` handler.
6. Find existing codex provider in `db.providerConnections[]`:
   - If exists with same email → **replace** (update accessToken, refreshToken, expiresAt, updatedAt)
   - If exists with different email → **append** new entry (priority = max + 1)
   - If none → **append**
7. Write db.json back
8. Stop 9router → wait 1s → start 9router
9. Return `{ success: true, email, planType }`

**Removed:**
- Provider key backup (`modoroclaw-provider-keys.json`) — re-injection writes to `apiKey`, useless for OAuth.
- Combo creation / `detectChatGPT` — wizard user clicks "Kiểm tra kết nối" after import (existing step 2.2). Dashboard users manage combos via 9router web UI.

**Error cases:**
- Invalid JSON → `{ success: false, error: 'JSON không hợp lệ' }`
- Missing accessToken → `{ success: false, error: 'Thiếu accessToken' }`
- db.json read/write fail → `{ success: false, error: 'Không ghi được cấu hình 9router' }`

---

## Preload Bridge

```js
importChatGPTSession: (sessionJson) => ipcRenderer.invoke('import-chatgpt-session', sessionJson)
```

---

## UI: Wizard Step 2 Fallback

**Placement:** Below existing instruction card #1 ("Kết nối ChatGPT"), as a new collapsible section.

**Trigger:** Link text "Đăng nhập không được?" — click toggles the panel.

**Collapsed state:** Just the link, no visual weight.

**Expanded panel (instruction card style):**
1. Numbered instructions:
   - Mở `chatgpt.com` trên trình duyệt, đăng nhập bình thường
   - Vào địa chỉ `chatgpt.com/api/auth/session`
   - Bấm Ctrl+A rồi Ctrl+C (copy toàn bộ)
   - Quay lại đây, dán vào ô bên dưới
2. Textarea (monospace, 4 rows)
3. Status line below textarea:
   - On paste + valid: green text showing email + plan type (e.g. "huybui@gmail.com (Plus)")
   - On paste + invalid: red text "JSON không hợp lệ"
4. Button: "Import tài khoản" (disabled until valid paste)

**On success:** Show success alert with email + plan type. Auto-collapse the fallback panel. User then clicks "Kiểm tra kết nối" (existing step 2.2) to verify + create combo — same flow as after normal OAuth.

---

## UI: Dashboard 9Router Page

**Placement:** Button in page header row, alongside "Tải lại" and "Mở trong trình duyệt".

**Button:** "Import ChatGPT" (secondary style, small).

**Click:** Toggles inline panel below the header (above webview). Same layout as wizard: instructions + textarea + status + import button.

**On success:** Toast notification + `reloadEmbed('9router')` to refresh the webview.

---

## Security

- Token stored in db.json (same location as normal OAuth flow)
- No token sent to external servers
- Textarea content not logged
- Token expires naturally (~10 days); user re-imports when needed

---

## Files to Modify

| File | Change |
|------|--------|
| `electron/lib/dashboard-ipc.js` | Add `import-chatgpt-session` IPC handler |
| `electron/preload.js` | Add `importChatGPTSession` bridge |
| `electron/ui/wizard.html` | Add fallback collapsible panel in step 2 |
| `electron/ui/dashboard.html` | Add import button + panel in 9Router page header |
| `electron/lib/nine-router.js` | No changes needed — db.json path computed inline |

## Known Existing Issue

`detectChatgptPlusOAuth()` in `nine-router.js` reads `cfg.providers` but real data is in `cfg.providerConnections`. Not blocking for this feature (we use GET `/api/providers` HTTP endpoint instead), but worth fixing separately.
