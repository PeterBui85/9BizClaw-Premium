# Facebook Multi-Page Management — Design Spec

**Date:** 2026-06-01
**Status:** Reviewed (PM + UI/UX + Spec reviewer)
**Scope:** Multi-token, multi-fanpage support for posting, scheduling, insights, and bot safety.
**Phases:** 2 (Phase 1 = backend + bot safety, Phase 2 = Dashboard UI)

---

## Problem

The app manages ONE Facebook fanpage. `fb-config.json` stores a single `{pageId, accessToken, pageName}`. `verifyToken()` already calls `/me/accounts` and fetches all pages but auto-picks the first one. CEOs often manage 4-8 fanpages across multiple Facebook accounts. Current architecture cannot support this.

## Requirements (from brainstorming)

1. **Two connection modes:** (a) one token → multiple pages, (b) multiple tokens → each with its own pages
2. **Per-message explicit page targeting:** Bot MUST know which page to post to. CEO names the page in every command. No default fallback — refuse if ambiguous.
3. **Tên ngắn (short name):** CEO-defined per page, optional. Bot matches tên ngắn first, then Facebook page name. When `shortName` is null, bot uses and accepts `pageName` as the reference.
4. **Dashboard UI (Phase 2):** Alert-first overview of all pages. Connection via modal. Detail view for per-page management.
5. **Per-page insights:** No cross-page aggregation.
6. **Scale:** 4-8 pages typical, up to ~25 from the API limit.
7. **"List my pages" bot command:** CEO can ask the bot what pages are connected at any time.

---

## 1. Data Model

### `fb-config.json` (new shape)

```json
{
  "tokens": [
    {
      "id": "tok_<8hex>",
      "userToken": "<safeStorage encrypted>",
      "userName": "Huy Bui",
      "isLegacy": false,
      "connectedAt": "2026-06-01T09:00:00Z",
      "pageIds": ["page_<8hex>", "page_<8hex>"]
    }
  ],
  "pages": [
    {
      "id": "page_<8hex>",
      "tokenId": "tok_<8hex>",
      "pageId": "123456789",
      "pageAccessToken": "<safeStorage encrypted>",
      "pageName": "MODORO Coffee",
      "pageAvatarUrl": "https://graph.facebook.com/123456789/picture?type=small",
      "shortName": "cafe",
      "category": "Food & Beverage",
      "enabled": true,
      "connectedAt": "2026-06-01T09:00:00Z"
    }
  ]
}
```

**Field notes:**
- `id` prefix (`tok_`/`page_`) + 8 hex chars from SHA-256 of the source ID. Stable across reconnects.
- `tokenId` links each page back to its parent token. Used for token-level operations (refresh, disconnect all pages from a token).
- `shortName` replaces "alias". Optional. CEO sets it in Dashboard page detail (NOT during connection — see Section 2).
- `pageAccessToken` is the per-page token extracted from `/me/accounts` response. Each page has its own — independent expiry.
- `pageAvatarUrl` fetched from Graph API at connection time (`/{pageId}/picture?type=small`). Used in Dashboard instead of generic letter avatar.
- `enabled` allows toggling a page off without disconnecting (preserves schedules in paused state).
- `isLegacy` on tokens marks entries migrated from old single-page config where only page token was stored (no user token available for page discovery).

### Migration (existing single-page installs)

On first load, if `fb-config.json` has old shape (`{pageId, accessToken, pageName, connectedAt}`):
1. Generate `tok_` ID, wrap existing token: `{id: generated, userToken: null, userName: "Tài khoản cũ", isLegacy: true, pageIds: [pageId]}`
   - **Note:** the old config only stored the page access token, not the user token. `isLegacy: true` marks this token entry as incomplete — it cannot discover new pages. CEO must paste a fresh User Token via Dashboard to unlock multi-page discovery.
2. Generate `page_` ID, move page fields into `pages[]` with `tokenId` reference, `shortName: null`, `enabled: true`
3. Backfill `targetPageId` on all existing `fb-scheduled-posts.json` entries. If file absent (fresh install), skip.
4. Write atomically via `writeFbConfigIfChanged()`. Old shape backed up to `fb-config.backup.json`.

### `fb-scheduled-posts.json` (updated)

Each schedule entry gains:
- `targetPageId` (required) — FK to `pages[].id`. Publish phase refuses if missing or unresolved.

Existing schedules without `targetPageId` are backfilled during migration (single page → that page's new ID).

---

## 2. Connection Flow (Phase 2 — Dashboard)

### UI: Modal ("Kết nối tài khoản Facebook")

Triggered by "+ Thêm tài khoản" button on the overview page.

**Steps in one modal (streamlined — NO tên ngắn step here):**
1. CEO pastes User Access Token into input field
2. App calls `GET /me/accounts?fields=id,name,access_token,tasks,category,picture{url}&limit=25` using the pasted token
3. Modal shows discovered pages with checkbox toggles. Only pages with `CREATE_CONTENT` in `tasks` are selectable. Others shown dimmed with explanation "Không có quyền đăng bài".
4. CEO clicks "Kết nối N fanpage"
5. Backend: create `tok_` entry, create `page_` entries for each selected page (with `pageAvatarUrl` from the API response), encrypt tokens via safeStorage, write via `writeFbConfigIfChanged()`

**Tên ngắn is set AFTER connection**, not during. Each newly connected page shows "Chưa đặt tên ngắn — Đặt tên để bot nhận diện" as an inline prompt in the page detail view. This removes cognitive load from the connection flow. Example hint: `VD: "cafe"` + tooltip: "Khi anh nhắn: đăng lên cafe — bot hiểu là MODORO Coffee".

**Duplicate detection:** If a `pageId` already exists in `pages[]` (from a previous token), show warning "Fanpage này đã được kết nối qua tài khoản [X]". Allow reconnecting (updates the token source) but never create duplicate page entries.

**Token validation errors:** Invalid token → "Token không hợp lệ. Vui lòng kiểm tra lại." No pages with `CREATE_CONTENT` → "Token này không có quyền đăng bài trên fanpage nào."

### Backend: `connectToken(userToken)` in `fb-publisher.js`

```
1. Call /me?fields=name to get account holder name
2. Call /me/accounts?fields=id,name,access_token,tasks,category,picture{url}&limit=25
3. Filter pages with CREATE_CONTENT task
4. Return { userName, pages: [{pageId, pageName, pageAccessToken, category, avatarUrl}] }
```

Dashboard IPC handler `connect-fb-token` calls this, then the renderer shows the page selector. On confirmation, `save-fb-pages` IPC handler writes to `fb-config.json`.

---

## 3. Dashboard UI (Phase 2)

### Overview Page (`#page-facebook`)

**Design principles (from UI/UX review):**
- Alert-first: surface problems before inventory. CEO opens FB tab to check if things are working, not to count pages.
- Match existing dashboard patterns (vertical layout, no novel 2-column grids).
- Use real page avatars from Graph API, not generic letter circles.
- Every clickable element must have visible affordance (hover state, chevron).

**Header:** "Fanpage của bạn" + subtitle "N fanpage · M tài khoản" + "+ Thêm tài khoản" button.

**Alert banner (if any page needs attention):**
Shown above the page list when any page has token issues. Example: "1 fanpage cần gia hạn token · 1 fanpage token đã hết hạn" with direct action links.

**Page list** (vertical, full-width rows — NOT a card grid):
Each row shows:
- Page avatar (real from `pageAvatarUrl`, fallback: first 2 letters of pageName)
- Facebook page name (bold) + "Tên ngắn: [value]" or "Chưa đặt tên ngắn" subtitle
- Status: inline text, not just a dot:
  - Green: "Đang hoạt động"
  - Yellow: "Token sắp hết hạn — còn N ngày" + "Gia hạn" action link
  - Red: "Token đã hết hạn" + "Kết nối lại" action link
  - Gray: "Đã tắt"
- Right side: "N lịch đăng" count + chevron `>`
- Disabled pages dimmed to 40% opacity
- Hover: background highlight + cursor pointer

### Page Detail View

Accessed by clicking a row. Shows "← Tất cả fanpage" back link at top.

**Stacked vertical layout** (NOT 2-column split — matches existing dashboard, avoids cramped columns):

1. **Thông tin** (compact summary row):
   - Avatar + Tên Facebook + Tên ngắn (editable inline, with example hint `VD: "cafe"`) + Tài khoản nguồn + Token status + Số người theo dõi

2. **Lịch đăng bài (N):**
   - List of schedules bound to this page with time, label, enabled/disabled toggle

3. **Bài đăng gần đây:**
   - Last 5 posts with caption preview, timestamp, engagement count

4. **Hành động:**
   - "Nhắn Telegram để đăng bài" (secondary style — posting lives in Telegram, not Dashboard)
   - "Tạo lịch đăng" — create schedule bound to THIS page
   - "Xem thống kê" — insights for THIS page
   - "Tắt fanpage" (danger, right-aligned) — sets `enabled: false`

### Connection Modal

See Section 2 above. Rendered as overlay. Available from overview header AND from page detail view (global action).

### Empty States

- **No pages connected (fresh install):** Centered message: "Chưa kết nối fanpage nào" + "+ Thêm tài khoản" primary button + 5-step guide below (same as current).
- **All pages disabled:** Banner: "Tất cả fanpage đã tắt. Bật lại để tiếp tục đăng bài." with per-page "Bật" action.
- **Token just expired:** Page row shows red status with inline "Kết nối lại" action. Alert banner at top summarizes.

---

## 4. API Changes (`cron-api.js`)

### Modified endpoints

All existing `/api/fb/*` endpoints gain required `pageId` query param:

| Endpoint | Change |
|---|---|
| `GET /api/fb/post` | Add `pageId` (required). 400 if missing. Lookup page in config, use its `pageAccessToken`. |
| `GET /api/fb/insights` | Add `pageId` (required). Returns insights for that specific page. |
| `GET /api/fb/recent` | Add `pageId` (required). Returns recent posts for that page. |
| `GET /api/fb/verify` | Add `pageId` (optional). If provided, verify that page's token. If omitted, verify ALL pages in parallel (`Promise.allSettled`) and return array of `{pageId, valid, error}`. Called by Dashboard on tab open (with 5-minute in-memory cache, invalidated on `save-fb-pages`). NOT called on boot — token verification is lazy. |

### New endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /api/fb/pages` | GET | Returns `[{id, pageId, pageName, shortName, enabled, tokenStatus}]` — the page list for bot use |
| `POST /api/fb/connect` | POST | Body: `{userToken}`. Returns discovered pages. |
| `POST /api/fb/pages/save` | POST | Body: `{tokenId, pages: [{pageId, shortName, enabled}]}`. Saves selected pages. Invalidates verify cache. |

### New IPC handlers (`dashboard-ipc.js`)

| Handler | Purpose |
|---|---|
| `connect-fb-token` | Paste token → discover pages |
| `save-fb-pages` | Save selected pages from connection modal |
| `get-fb-pages` | Get all pages for overview list |
| `get-fb-page-detail` | Get single page detail (info + schedules + recent posts + follower count). Follower count fetched via `/{pageId}?fields=followers_count`, cached in memory 5 min. |
| `update-fb-page` | Edit shortName, toggle enabled |
| `disconnect-fb-token` | Remove a token and all its pages. **Pre-disconnect check:** count pending schedules for affected pages. If any: return `{pendingCount, pageNames}` and require CEO confirmation via Dashboard dialog: "Anh đang có N lịch đăng cho fanpage [X, Y] sẽ bị hủy. Xác nhận ngắt kết nối?" |
| `get-fb-tokens` | List connected tokens (for token management) |

---

## 5. Bot Safety — "Never Post to Wrong Page"

### Page Resolution Protocol (mandatory step 0 in every post/schedule flow)

The bot MUST resolve the target page BEFORE any posting action. This is a code-level gate, not just an AGENTS.md rule.

**Resolution logic (in order):**
1. Extract page reference from CEO message (e.g., "post to cafe", "đăng lên MODORO")
2. Match against `shortName` (case-insensitive, exact match). shortName match takes priority — if CEO has shortName "cafe" and a different page's name contains "cafe" as substring, the shortName wins with no ambiguity.
3. If no shortName match → match against `pageName` (case-insensitive, substring)
4. **No match → REFUSE:** "Không tìm thấy fanpage '[X]'. Các fanpage hiện có:\n- [shortName]: [pageName]\n- [pageName] (chưa đặt tên ngắn)" — always list all pages with their references so CEO can correct immediately.
5. **Multiple matches → REFUSE:** "Có [N] fanpage khớp: [list]. Anh muốn đăng lên fanpage nào?"
6. **Match found but page disabled → REFUSE:** "Fanpage '[X]' đã được tắt. Bật lại trong Dashboard để đăng bài."

**Code enforcement:** `/api/fb/post` returns 400 if `pageId` is missing. The bot cannot bypass this — no default page, no fallback.

### "List my pages" bot command

AGENTS.md adds a `fb_list_pages` capability: CEO says "fanpage của anh" / "danh sách fanpage" / "em ơi anh có page nào" → bot calls `GET /api/fb/pages` → responds with formatted list:
```
Các fanpage đã kết nối:
1. MODORO Coffee (tên ngắn: cafe) — đang hoạt động
2. 9Biz Technology (tên ngắn: 9biz) — đang hoạt động
3. Spa Thanh Xuan — chưa đặt tên ngắn, đang hoạt động
```

### Schedule binding

- Every schedule has `targetPageId` (required). Dashboard schedule creator shows page dropdown.
- Publish phase: `getPageById(schedule.targetPageId)` → if page missing/disabled → skip + CEO alert via Telegram: "Lịch đăng [label] bị bỏ qua — fanpage [name] không còn hoạt động."
- Bot creating schedule via chat: same resolution protocol. Must name the page. `targetPageId` passed to `/api/fb/schedule/create`.

### AGENTS.md updates

Add to Capability Router and Facebook rules:
- `fb_list_pages` capability trigger → `GET /api/fb/pages`
- Page resolution is step 0 before any FB action
- Bot MUST include resolved page name in Telegram preview: "Đăng lên **[Page Name]** ([tên ngắn])?"
- Confirmation echo after posting: "Đã đăng lên **[Page Name]**."

### Skill update (`skills/marketing/facebook-post-workflow.md`)

Add new "Bước 0 — Xác định fanpage" section:
- Call `GET /api/fb/pages` to get available pages
- Match CEO's page reference using resolution logic
- Include `pageId` in all subsequent API calls (including `/api/fb/schedule/create?...&pageId=<id>`)
- Preview message must show target page name prominently

---

## 6. `fb-publisher.js` Changes

### `connectToken(userToken)` — NEW
Calls `/me` + `/me/accounts` (with `picture{url}` field), returns discovered pages with their page access tokens and avatar URLs.

### `verifyToken(token)` — MODIFIED
No longer auto-selects first page. Returns full page list. Caller decides which page(s) to use.

### `postText(pageId, token, message)` — UNCHANGED
Already parameterized by pageId. Just needs correct token lookup.

### `postPhoto(pageId, token, message, imageBuffer)` — UNCHANGED
Same — already parameterized.

### `getPageToken(pageId)` — NEW
Looks up `fb-config.json`, finds page by ID, decrypts and returns its `pageAccessToken`. Throws if page not found or disabled.

### `resolvePageByName(query)` — NEW
Implements the resolution logic from Section 5. Returns:
- `{page, reason: 'found'}` — unique match
- `{page: null, reason: 'not_found'}` — no match
- `{page: null, matches: [...], reason: 'ambiguous'}` — multiple matches
- `{page, reason: 'disabled'}` — matched but page is disabled

The `reason` field lets callers produce the correct Vietnamese refusal message without re-deriving the failure mode.

---

## 7. `fb-schedule.js` Changes

### Schedule creation
- `targetPageId` is required in schedule config. Validation rejects schedules without it.
- Dashboard schedule form: page dropdown (populated from `getPages()`) is a required field.
- Bot chat schedule creation: `pageId` param added to `/api/fb/schedule/create`.

### Phase 1 (generate)
- Lookup target page before generating. If page disabled → skip + alert.
- Telegram preview includes page name: "Bài cho **MODORO Coffee** (cafe) — lúc 08:00"

### Phase 2 (publish)
- Lookup target page. If missing/disabled → skip + alert.
- Use `getPageToken(targetPageId)` to get the correct token for posting.
- Facebook 190/OAuthException (token expired) → mark page token as expired in config, skip publish, send CEO alert with context:
  - Normal token: "Token fanpage [name] đã hết hạn. Vào Dashboard → Facebook để kết nối lại."
  - Legacy token (`isLegacy: true`): "Token fanpage [name] đã hết hạn. Cần dán User Token mới (không phải Page Token cũ) trong Dashboard → Facebook."
- Post-publish confirmation includes page name.

### Telegram command parser
- "fb ok" happy path (exactly one pending post across all pages) → approve it, same as current behavior. No change.
- "fb ok" when multiple pages have pending posts → disambiguate with numbered list:
  ```
  Có 3 bài đang chờ duyệt:
  1. MODORO Coffee (cafe) — "Menu mùa hè..."
  2. 9Biz Technology (9biz) — "Giới thiệu tính năng mới..."
  3. Spa Thanh Xuân — "Khuyến mãi tháng 6..."
  Nhắn số (1, 2, 3) hoặc "tất cả" để duyệt.
  ```

---

## 8. Migration Strategy

### Automatic (on first load after update)

1. Detect old `fb-config.json` shape (has `pageId` at root, no `tokens`/`pages` arrays)
2. Migrate to new shape:
   - `tokens[0]` = `{id: generated, userToken: null, userName: "Tài khoản cũ", isLegacy: true, pageIds: [pageId]}`
   - `pages[0]` = `{id: generated, tokenId: tokens[0].id, pageId: old pageId, pageAccessToken: old accessToken, pageName: old pageName, pageAvatarUrl: null, shortName: null, enabled: true}`
3. Backfill `targetPageId` on all existing `fb-scheduled-posts.json` entries. If file absent (fresh install), skip.
4. Write atomically via `writeFbConfigIfChanged()`. Old shape backed up to `fb-config.backup.json`.

Migration lives in `workspace.js` alongside existing `loadFbConfig()`/`saveFbConfig()`.

### Manual step required after migration
CEO should open Dashboard → Facebook → click the migrated page → set a tên ngắn. Bot will use the Facebook page name as reference until then.

---

## 9. Phasing

### Phase 1: Backend + Bot Safety (no Dashboard UI changes)

**Goal:** Deliver the "never post to wrong page" guarantee and multi-page Telegram chat UX.

**Files:**
| File | Change |
|---|---|
| `electron/lib/fb-publisher.js` | `connectToken()`, `getPageToken()`, `resolvePageByName()`, modify `verifyToken()` |
| `electron/lib/fb-schedule.js` | `targetPageId` enforcement, page lookup in both phases, disambiguate pending approvals, `pageId` in schedule create |
| `electron/lib/cron-api.js` | `pageId` param on all `/api/fb/*` routes, new `GET /api/fb/pages` endpoint |
| `electron/lib/workspace.js` | `loadFbConfig()`/`saveFbConfig()` handle new shape + migration + backup |
| `AGENTS.md` | Page resolution step 0, `fb_list_pages` capability, updated routing |
| `skills/marketing/facebook-post-workflow.md` | "Bước 0 — Xác định fanpage" section, `pageId` in all API calls |
| `skills/operations/facebook-insights.md` | Note that `pageId` is now required |

**What CEO gets:** Multi-page support via Telegram chat. Can add pages via existing Dashboard token input (single page at a time, same as today). Bot refuses ambiguous page targets. "fb ok" disambiguation works. Schedule creation requires naming a page.

### Phase 2: Dashboard UI Redesign

**Goal:** Full multi-token connection flow, alert-first overview, page detail view.

**Files:**
| File | Change |
|---|---|
| `electron/ui/dashboard.html` | Rewrite `#page-facebook`: alert banner, page list rows, page detail view, connection modal (taste-skill guided) |
| `electron/preload.js` | New bridges for 7 IPC handlers |
| `electron/lib/dashboard-ipc.js` | New IPC handlers: `connect-fb-token`, `save-fb-pages`, `get-fb-pages`, `get-fb-page-detail`, `update-fb-page`, `disconnect-fb-token`, `get-fb-tokens` |
| `electron/lib/cron-api.js` | `POST /api/fb/connect`, `POST /api/fb/pages/save` |

**What CEO gets:** Multi-token connection in one modal, real page avatars, alert-first overview with token health, inline tên ngắn editing, disconnect with pending-schedule warning, token expiry countdown with action links.

---

## 10. UI Language Reference

All Dashboard labels in proper Vietnamese with diacritics:

| English concept | Vietnamese label |
|---|---|
| Short name / alias | Tên ngắn |
| Connect account | Kết nối tài khoản |
| Your fanpages | Fanpage của bạn |
| Add account | Thêm tài khoản |
| Active | Đang hoạt động |
| Token expiring (with countdown) | Token sắp hết hạn — còn N ngày |
| Token expired | Token đã hết hạn |
| Renew token | Gia hạn |
| Reconnect | Kết nối lại |
| Disabled | Đã tắt |
| Enable | Bật |
| Schedules | Lịch đăng bài |
| Recent posts | Bài đăng gần đây |
| Followers | Người theo dõi |
| Posts today | Bài hôm nay |
| Interactions | Lượt tương tác |
| Message Telegram to post | Nhắn Telegram để đăng bài |
| Create schedule | Tạo lịch đăng |
| View stats | Xem thống kê |
| Disable page | Tắt fanpage |
| Not yet named (with CTA) | Chưa đặt tên ngắn — Đặt tên để bot nhận diện |
| Short name example | VD: "cafe" |
| Short name tooltip | Khi anh nhắn: đăng lên cafe — bot hiểu là [Page Name] |
| Page not found | Không tìm thấy fanpage |
| Discovered pages | Tìm thấy N fanpage |
| No post permission | Không có quyền đăng bài |
| Disconnect confirmation | Anh đang có N lịch đăng cho fanpage [X, Y] sẽ bị hủy. Xác nhận ngắt kết nối? |
| No pages connected | Chưa kết nối fanpage nào |
| All pages disabled | Tất cả fanpage đã tắt. Bật lại để tiếp tục đăng bài. |
| List pages (bot) | Các fanpage đã kết nối |

---

## 11. Non-Goals (explicitly out of scope)

- Facebook OAuth login flow (keep manual token paste)
- Cross-page post aggregation or bulk posting
- Cross-page schedule view (per-page only; expect as first follow-up request)
- Automatic token refresh (CEO re-pastes when expired)
- Per-page brand assets (all pages share the brand-assets pool)
- Per-page AGENTS.md rules (one bot personality for all pages)
- Bulk operations (pause all, test all tokens) — defer
- Page reordering in Dashboard — defer
- Renaming tên ngắn via Telegram chat — defer (Dashboard-only for now)
