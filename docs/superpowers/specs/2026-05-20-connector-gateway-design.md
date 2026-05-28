# Connector Gateway Design

## Context

MODOROClaw customers need to connect the AI bot to external APIs (Shopify, CRM, accounting, etc.). Today, each integration is hand-built (Google Workspace via gogcli, Zalo via openzca). This doesn't scale.

The connector gateway lets customers configure arbitrary external APIs via Dashboard UI. The bot calls them through a local proxy that injects auth credentials. The AI never sees raw API keys.

## Architecture

**Approach B — New `connector.js` module, routes delegated from cron-api.js.** Same pattern as `google-routes.js`. Reuses existing HTTP server on port 20200, existing Bearer token auth, existing vendor-patches.js token injection. Zero new infrastructure.

## Data Model

### Connector config — `{workspace}/config/connectors.json`

```json
{
  "version": 1,
  "connectors": [
    {
      "id": "shopify",
      "name": "Shopify Store",
      "baseUrl": "https://my-store.myshopify.com/admin/api/2024-01",
      "authType": "bearer",
      "enabled": true,
      "readOnly": true,
      "timeoutMs": 30000,
      "headers": { "Content-Type": "application/json" },
      "template": "shopify",
      "createdAt": "2026-05-20T10:00:00Z",
      "updatedAt": "2026-05-20T10:00:00Z"
    }
  ]
}
```

### Credentials — `{workspace}/config/connector-secrets.json`

Encrypted via Electron `safeStorage` (same pattern as Facebook token in workspace.js).

```json
{
  "shopify": {
    "token": "<base64 safeStorage encrypted>",
    "headerName": "X-Shopify-Access-Token"
  }
}
```

### Validation rules

- `id`: `[a-z0-9-]` only, max 40 chars (no path traversal)
- `baseUrl`: must start with `https://` (reject HTTP). Must pass `BLOCKED_HOSTS` check (no private/internal IPs). Validated at save time AND at proxy time (defense-in-depth against config file tampering).
- `authType`: `"bearer"` or `"header"`
- `bearer` → injects `Authorization: Bearer <token>`
- `header` → injects `{headerName}: <token>`
- `updatedAt`: ISO timestamp, set on every save/toggle

## Proxy Flow

Bot calls: `web_fetch http://127.0.0.1:20200/api/connect/shopify/orders.json?status=open`

1. **Route match** in cron-api.js: `urlPath.startsWith('/api/connect/')` → delegate to `connector.js:handleConnectorRoute()`
2. **Parse**: extract connector ID (`shopify`) and remaining path (`/orders.json`)
3. **Lookup**: read `connectors.json`, find matching enabled connector
4. **Read-only gate**: if `readOnly: true` and method is POST/PUT/DELETE → 403
5. **SSRF check**: validate resolved baseUrl hostname against `BLOCKED_HOSTS` regex (defense-in-depth — also checked at save time)
6. **Rate limit check**: increment per-connector per-minute counter. If >30 → 429 with `Retry-After` header
7. **Decrypt credentials** from `connector-secrets.json` via `safeStorage`
8. **Build outbound request**: `GET https://my-store.myshopify.com/admin/api/2024-01/orders.json?status=open` with auth header + extra `headers` from config
9. **Proxy**: Node.js native `https.request()`, timeout from config (default 30s), **`maxRedirects: 0`** (never follow redirects)
10. **Redirect handling**: If upstream returns 3xx, return `{ "redirect": true, "status": <code>, "location": "<url>" }` to caller. Auth credentials are NOT forwarded.
11. **Response cap**: stream max 2MB, truncate with warning if exceeded
12. **Non-JSON handling**: If response Content-Type is not `application/json`, wrap text body in `{ "raw": "<text>", "contentType": "<type>" }`. Binary content-types return error without streaming body.
13. **Audit**: `auditLog('connector_proxy', { connector, path, method, status })`. Never log bodies or credentials.
14. **Return**: JSON to bot

POST/PUT forwarding: vendor-patches.js auto-POST conversion already converts query params to JSON body for localhost calls. The connector proxy forwards that body to the external API.

## Management API

On same port 20200, same Bearer auth (CEO-only via `_requireCeoTelegram()`, same as all other cron-api.js routes). Bot proxy routes (`/api/connect/...`) also use the same Bearer auth — bot gets the token from `cron-api-token.txt`.

- `GET /api/connectors` — list all connectors with status and `updatedAt` (no credentials exposed)
- `POST /api/connectors/test/{id}` — HEAD request to baseUrl with auth. If HEAD returns 405, retry with GET. Return success/error with status code and latency.

## Bot Discovery

Two layers:

1. **Skill file** `user-skills/connector-api.md` — auto-generated whenever connectors change. Lists available connectors, their IDs, and what they do. Bot reads at session start.
2. **Runtime endpoint** `GET /api/connectors` — live status, always current.

Skill file example:

```markdown
---
name: connector-api
appliesTo: []
---
## API Connectors

Khi CEO hỏi về dữ liệu từ hệ thống bên ngoài (đơn hàng, khách hàng, tồn kho...):

1. Xem danh sách connector: `web_fetch http://127.0.0.1:20200/api/connectors`
2. Gọi API: `web_fetch http://127.0.0.1:20200/api/connect/{id}/{path}`

### Connector hiện có:
- **shopify** (Shopify Store) — đọc đơn hàng, sản phẩm, khách hàng. Chỉ đọc.
```

## Dashboard UI

New sidebar item "Tích hợp". Single page:

- **Connector list**: cards with name, baseUrl (truncated), status dot (green/gray), auth type badge. Click to edit.
- **"Thêm kết nối" button**: inline form:
  - Mẫu (select: Tùy chỉnh / Shopify / HubSpot — template pre-fills fields)
  - Tên kết nối (text → becomes ID slug)
  - URL cơ sở (text, validated HTTPS)
  - Xác thực (select: Bearer Token / API Key Header)
  - Token / API Key (password input, masked after save)
  - Header name (shown only for API Key Header type)
  - Chỉ đọc (toggle, default on)
  - "Kiểm tra kết nối" button
  - "Lưu" / "Xóa" buttons

## Templates

Shipped as a JS object in `connector.js`:

```js
const TEMPLATES = {
  shopify: {
    name: 'Shopify Store',
    baseUrl: 'https://{store}.myshopify.com/admin/api/2024-01',
    authType: 'header',
    headerName: 'X-Shopify-Access-Token',
    placeholder: 'Thay {store} bằng tên shop của bạn',
  },
  hubspot: {
    name: 'HubSpot CRM',
    baseUrl: 'https://api.hubapi.com',
    authType: 'bearer',
  },
};
```

## Security

- Credentials encrypted at rest via Electron `safeStorage` (OS-level keychain)
- Credentials never logged, never in AGENTS.md, never in bot responses
- HTTPS-only baseUrls (HTTP rejected at config save time)
- **SSRF protection**: baseUrl validated against `BLOCKED_HOSTS` regex (same as cron-api.js line 1857) at both config save time AND proxy time. Rejects `127.*`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `0.*`, `localhost`, `::1`. Prevents bot from using connector proxy to reach internal services.
- **No redirect following**: Proxy returns redirect status (301/302/307/308) as-is to the caller with the `Location` header in the response body. Never follows redirects — prevents credential leak via auth header sent to redirect target.
- Response body capped at 2MB
- Request timeout 30s default, configurable per connector
- Connector ID restricted to `[a-z0-9-]` — no path traversal
- Read-only default — CEO must explicitly enable writes per connector
- All proxy calls audited via existing `auditLog()` to `audit.jsonl` (event type `connector_proxy`, fields: connector id, method, path, status code — no bodies or credentials)
- **Non-JSON responses**: If upstream returns non-JSON content-type, proxy wraps raw text in `{ "raw": "<text>", "contentType": "<type>" }`. Binary responses return `{ "error": "binary response not supported", "contentType": "<type>", "status": <code> }`.
- **Rate limiting**: Max 30 requests per connector per minute (in-memory counter, reset each minute). Returns 429 with retry-after header when exceeded.
- **safeStorage machine binding**: `connector-secrets.json` is encrypted via Electron `safeStorage` which uses OS-level keychain (DPAPI on Windows, Keychain on Mac). Copying the workspace to another machine results in decryption failure — credentials must be re-entered. This is the same trade-off as Facebook token storage in `workspace.js`.

## Files

| File | Change | Lines |
|------|--------|-------|
| `electron/lib/connector.js` | NEW — config CRUD, credential encrypt/decrypt, HTTP proxy, SSRF guard, rate limiter, redirect blocking, non-JSON wrapping, skill generation, templates | ~350 |
| `electron/lib/cron-api.js` | Route delegation + management endpoints | ~10 |
| `electron/lib/dashboard-ipc.js` | 5 IPC handlers (list, save, delete, test, toggle) | ~80 |
| `electron/preload.js` | 5 bridge functions | ~6 |
| `electron/ui/dashboard.html` | Sidebar item + page + form | ~150 |
| `electron/lib/workspace.js` | Seed `config/` dir at boot | ~3 |
| `user-skills/connector-api.md` | Auto-generated at runtime | — |

## IPC Handlers

- `list-connectors` → returns connectors list with status
- `save-connector` → create or update config + encrypted credentials, regenerate skill
- `delete-connector` → remove config + credentials, regenerate skill
- `test-connector` → proxy HEAD request, return success/error
- `toggle-connector` → enable/disable, regenerate skill

## Verification

1. Add a connector via Dashboard (e.g., Shopify template with test token)
2. "Kiểm tra kết nối" button → green success
3. Bot calls `web_fetch http://127.0.0.1:20200/api/connectors` → sees the connector listed
4. Bot calls `web_fetch http://127.0.0.1:20200/api/connect/shopify/orders.json` → gets proxied response with auth injected
5. Check `logs/audit.jsonl` → entry with event `connector_proxy`, method, path, status
6. Verify `connector-secrets.json` has encrypted (not plaintext) token
7. Disable connector → bot gets 404 on proxy call
8. Toggle `readOnly: false` → bot can POST through the proxy
