# Facebook Multi-Page — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-page Facebook support via backend + bot safety. No Dashboard UI changes. CEO manages multiple fanpages through Telegram chat with guaranteed page targeting.

**Architecture:** Extend `fb-config.json` from single-page `{pageId, accessToken}` to multi-token/multi-page `{tokens: [...], pages: [...]}`. Add `resolvePageByName()` for bot page resolution, `pageId` enforcement on all `/api/fb/*` routes, `targetPageId` on schedules. Auto-migrate existing single-page installs.

**Tech Stack:** Node.js (Electron main process), Electron safeStorage for token encryption, Facebook Graph API v25.0

**Spec:** [2026-06-01-facebook-multi-page-design.md](../specs/2026-06-01-facebook-multi-page-design.md) — Phase 1 only

---

## File Structure

| File | Responsibility | Change Type |
|---|---|---|
| `electron/lib/workspace.js` | fb-config read/write/migrate, ID generation, safe writer | Modify |
| `electron/lib/fb-publisher.js` | Graph API calls, page resolution, token lookup | Modify |
| `electron/lib/fb-schedule.js` | Schedule creation/publish with `targetPageId`, disambiguation | Modify |
| `electron/lib/cron-api.js` | HTTP API routes with `pageId` enforcement | Modify |
| `AGENTS.md` | Bot rules: page resolution step 0, `fb_list_pages` capability | Modify |
| `skills/marketing/facebook-post-workflow.md` | "Bước 0 — Xác định fanpage" section | Modify |
| `skills/operations/facebook-insights.md` | Note `pageId` required | Modify |

---

## Chunk 1: Data Model + Migration (workspace.js)

### Task 1: Add multi-page config helpers to workspace.js

**Files:**
- Modify: `electron/lib/workspace.js:149-187` (fb config section)

**Context:** Currently `readFbConfig()` reads a flat `{pageId, accessToken, pageName}` and decrypts the single `accessToken`. `writeFbConfig()` encrypts and writes. We need: (a) new shape with `tokens[]` and `pages[]` where each page has its own encrypted token, (b) auto-migration from old shape, (c) a safe writer that skips no-op writes, (d) ID generation.

- [ ] **Step 1: Read current `readFbConfig()` and `writeFbConfig()` in workspace.js**

Read `electron/lib/workspace.js` lines 149-187 to understand exact current implementation.

- [ ] **Step 2: Add `generateFbId(prefix, sourceId)` helper**

Add above `getFbConfigPath()` (~line 148):

```js
function generateFbId(prefix, sourceId) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(String(sourceId)).digest('hex').slice(0, 8);
  return `${prefix}_${hash}`;
}
```

- [ ] **Step 3: Rewrite `readFbConfig()` to handle both old and new shapes**

Replace the existing `readFbConfig()` (lines 151-172). The new version:
1. Reads and parses the file
2. Detects old shape (has `accessToken` at root, no `pages` array)
3. If old shape: calls `migrateFbConfig(cfg)` which returns new shape + triggers backup
4. If new shape: decrypts each `pages[].pageAccessToken` and each `tokens[].userToken`
5. Returns the config with all tokens decrypted

Key: migration is triggered lazily on first read, not on app boot.

- [ ] **Step 4: Implement `migrateFbConfig(oldCfg)`**

Add a new function that:
1. Backs up old config to `fb-config.backup.json` in the workspace
2. Generates `tok_` ID from old `pageId`
3. Generates `page_` ID from old `pageId`
4. Builds new shape: `{tokens: [{id, userToken: null, userName: "Tài khoản cũ", isLegacy: true, pageIds: [pageInternalId], connectedAt: oldCfg.connectedAt || new Date().toISOString()}], pages: [{id: pageInternalId, tokenId, pageId: oldCfg.pageId, pageAccessToken: oldCfg.accessToken, pageName: oldCfg.pageName, pageAvatarUrl: null, shortName: null, category: null, enabled: true, connectedAt: oldCfg.connectedAt || new Date().toISOString()}]}`
5. Calls `backfillScheduleTargetPageId(pageInternalId)` to add `targetPageId` to existing schedules
6. Writes new config via `writeFbConfigMultiPage()`
7. Returns the new config (decrypted)

- [ ] **Step 5: Implement `backfillScheduleTargetPageId(pageInternalId)`**

Read `fb-scheduled-posts.json` from workspace. If file exists, add `targetPageId: pageInternalId` to every schedule entry that lacks one. Write back. If file doesn't exist, skip (fresh install).

- [ ] **Step 6: Rewrite `writeFbConfig()` for multi-page shape**

Replace existing `writeFbConfig()`. The new version:
1. Deep-clones the config
2. Encrypts each `pages[].pageAccessToken` via safeStorage
3. Encrypts each `tokens[].userToken` via safeStorage (skip if null — legacy tokens)
4. Serializes with `JSON.stringify(toWrite, null, 2) + '\n'`
5. Compares byte-for-byte with existing file content — skip write if identical (same pattern as `writeOpenClawConfigIfChanged`)
6. Writes only if changed

- [ ] **Step 7: Add page lookup helpers**

Add these utility functions:

```js
function getFbPageById(config, pageInternalId) {
  if (!config || !config.pages) return null;
  return config.pages.find(p => p.id === pageInternalId) || null;
}

function getFbPageToken(config, pageInternalId) {
  const page = getFbPageById(config, pageInternalId);
  if (!page) throw new Error(`FB page not found: ${pageInternalId}`);
  if (!page.enabled) throw new Error(`FB page disabled: ${page.pageName}`);
  if (!page.pageAccessToken) throw new Error(`FB page token missing: ${page.pageName}`);
  return { pageId: page.pageId, token: page.pageAccessToken, pageName: page.pageName };
}

function getTokenById(config, tokenId) {
  if (!config || !config.tokens) return null;
  return config.tokens.find(t => t.id === tokenId) || null;
}
```

- [ ] **Step 8: Update `module.exports`**

Add to the exports object (~line 1206): `generateFbId`, `getFbPageById`, `getFbPageToken`, `getTokenById`.

- [ ] **Step 9: Verify migration manually**

Create a test `fb-config.json` with old shape in a temp workspace dir, call `readFbConfig()`, verify:
- Returns new shape with `tokens[]` and `pages[]`
- `fb-config.backup.json` created
- `pages[0].pageAccessToken` matches old `accessToken`
- `tokens[0].isLegacy === true`
- `tokens[0].userToken === null`

Run: `node -e "..."` one-liner from `electron/` dir.

- [ ] **Step 10: Commit**

```bash
git add electron/lib/workspace.js
git commit -m "feat(fb): multi-page config model + auto-migration from single-page shape"
```

---

## Chunk 2: Publisher + Page Resolution (fb-publisher.js)

### Task 2: Add `connectToken()` to fb-publisher.js

**Files:**
- Modify: `electron/lib/fb-publisher.js:308-340` (near verifyToken)

**Context:** `connectToken()` is the backend for the Dashboard connection modal (Phase 2), but we add it now so the data layer is complete. It calls `/me` + `/me/accounts` and returns all pages with CREATE_CONTENT permission.

- [ ] **Step 1: Read current `verifyToken()` implementation**

Read `electron/lib/fb-publisher.js` lines 300-340 for exact code.

- [ ] **Step 2: Add `connectToken(userToken)` function**

Add after `verifyToken()`:

```js
async function connectToken(userToken) {
  const meResp = await graphRequest('GET', '/me?fields=name', userToken);
  const accountsResp = await graphRequest('GET', '/me/accounts?fields=id,name,access_token,tasks,category,picture{url}&limit=25', userToken);
  if (!accountsResp.data || !Array.isArray(accountsResp.data)) {
    return { userName: meResp.name || 'Unknown', pages: [] };
  }
  const pages = accountsResp.data
    .filter(p => p && p.access_token && hasPageCreateContentTask(p.tasks))
    .map(p => ({
      pageId: p.id,
      pageName: p.name,
      pageAccessToken: p.access_token,
      category: p.category || null,
      avatarUrl: p.picture && p.picture.data ? p.picture.data.url : null,
    }));
  return { userName: meResp.name || 'Unknown', pages };
}
```

- [ ] **Step 3: Modify `verifyToken()` to return all pages**

Change the `.find()` on line ~316 to `.filter()`. Return `{ valid: true, pages: [{pageId, pageName, pageToken}, ...] }` instead of the old single-page shape. For the fallback path (direct page token, no `/me/accounts` data): wrap the single page into the same array format: `{ valid: true, pages: [{pageId: meData.id, pageName: meData.name, pageToken: token}] }`. This ensures ALL callers receive a consistent `pages[]` array regardless of token type.

- [ ] **Step 4: Commit**

```bash
git add electron/lib/fb-publisher.js
git commit -m "feat(fb): connectToken() + verifyToken() returns all pages"
```

### Task 3: Add `resolvePageByName()` to fb-publisher.js

**Files:**
- Modify: `electron/lib/fb-publisher.js` (add new function + export)

**Context:** This is the core page resolution logic. CEO says "post to cafe" → resolve to exactly one page or refuse. The function reads `fb-config.json` and matches against `shortName` (exact) then `pageName` (substring).

- [ ] **Step 1: Implement `resolvePageByName(query)`**

```js
function resolvePageByName(query) {
  const { readFbConfig } = require('./workspace');
  const cfg = readFbConfig();
  if (!cfg || !cfg.pages || cfg.pages.length === 0) {
    return { page: null, reason: 'not_found' };
  }

  const q = query.trim().toLowerCase();
  const enabledPages = cfg.pages.filter(p => p.enabled);

  // 1. Exact shortName match (case-insensitive)
  const shortNameMatch = enabledPages.filter(p => p.shortName && p.shortName.toLowerCase() === q);
  if (shortNameMatch.length === 1) return { page: shortNameMatch[0], reason: 'found' };
  if (shortNameMatch.length > 1) return { page: null, matches: shortNameMatch, reason: 'ambiguous' };

  // 2. Substring pageName match (case-insensitive)
  const nameMatch = enabledPages.filter(p => p.pageName && p.pageName.toLowerCase().includes(q));
  if (nameMatch.length === 1) return { page: nameMatch[0], reason: 'found' };
  if (nameMatch.length > 1) return { page: null, matches: nameMatch, reason: 'ambiguous' };

  // 3. Check disabled pages for better error message
  const allPages = cfg.pages;
  const disabledMatch = allPages.filter(p => !p.enabled && (
    (p.shortName && p.shortName.toLowerCase() === q) ||
    (p.pageName && p.pageName.toLowerCase().includes(q))
  ));
  if (disabledMatch.length > 0) return { page: disabledMatch[0], reason: 'disabled' };

  return { page: null, reason: 'not_found' };
}
```

- [ ] **Step 2: Add `listPages()` helper**

```js
function listPages() {
  const { readFbConfig } = require('./workspace');
  const cfg = readFbConfig();
  if (!cfg || !cfg.pages) return [];
  return cfg.pages.map(p => ({
    id: p.id,
    pageId: p.pageId,
    pageName: p.pageName,
    shortName: p.shortName || null,
    enabled: p.enabled,
    tokenId: p.tokenId,
  }));
}
```

- [ ] **Step 3: Update exports**

Add `connectToken`, `resolvePageByName`, `listPages` to `module.exports`.

- [ ] **Step 4: Verify no circular require**

Check that `workspace.js` does NOT require `fb-publisher.js`. The inline `require('./workspace')` in `resolvePageByName()` introduces a new dependency direction (fb-publisher → workspace). This is safe only if workspace does not require fb-publisher back. Grep `workspace.js` for `require.*fb-publisher` — must return 0 results.

- [ ] **Step 5: Add `tokenStatus` to `listPages()` output**

Enhance `listPages()` to check each page's token validity. For each page, check `page.pageAccessToken` exists and `page.tokenExpired !== true`. Return `tokenStatus: 'ok' | 'expired' | 'missing'` per page. This field is needed by the `/api/fb/pages` endpoint and specified in the spec.

- [ ] **Step 6: Verify resolution logic manually**

Quick test in `d:\tmp\fb-test-resolve\`: write a temp `fb-config.json` with 3 pages (one with shortName "cafe", one without, one disabled). Call `resolvePageByName("cafe")` → expect `found`. Call with "nonexistent" → expect `not_found`. Call with a substring matching 2 pages → expect `ambiguous`.

- [ ] **Step 7: Commit**

```bash
git add electron/lib/fb-publisher.js
git commit -m "feat(fb): resolvePageByName() + listPages() for multi-page targeting"
```

---

## Chunk 3: API Routes (cron-api.js)

### Task 4: Add `pageId` enforcement to existing FB routes

**Files:**
- Modify: `electron/lib/cron-api.js:2853-2963` (FB route handlers)

**Context:** Currently `/api/fb/post`, `/api/fb/insights`, `/api/fb/recent` all read the global `readFbConfig()` for a single page. We add a required `pageId` param and look up the page's token from the multi-page config.

- [ ] **Step 1: Read current `/api/fb/post` handler**

Read `electron/lib/cron-api.js` lines 2850-2925 for exact implementation.

- [ ] **Step 2: Modify `/api/fb/post` to require `pageId`**

At the top of the handler:
1. Read `params.pageId`. If missing → `return jsonResp(res, 400, { error: 'pageId is required' })`
2. Call `workspace.getFbPageToken(cfg, params.pageId)` to get `{pageId, token, pageName}`
3. Use the returned Facebook numeric `pageId` and `token` instead of `cfg.pageId` and `cfg.accessToken` throughout
4. Update the approval fingerprint: use the Facebook numeric `pageId` from `getFbPageToken()` (not the internal `page_<hex>` param) to maintain fingerprint semantics

- [ ] **Step 3: Modify `/api/fb/insights` to require `pageId`**

Same pattern: read `params.pageId`, 400 if missing, lookup page token, pass to `fbPub.getInsights()`.

- [ ] **Step 4: Modify `/api/fb/recent` to require `pageId`**

Same pattern for the recent posts handler.

- [ ] **Step 5: Modify `/api/fb/verify` to accept optional `pageId`**

If `params.pageId` provided: verify that specific page's token.
If omitted: verify ALL pages in parallel via `Promise.allSettled()`, return array of `{pageId, pageName, valid, error}`.

- [ ] **Step 6: Commit**

```bash
git add electron/lib/cron-api.js
git commit -m "feat(fb): pageId enforcement on /api/fb/post, insights, recent, verify"
```

### Task 5: Add `/api/fb/pages` endpoint

**Files:**
- Modify: `electron/lib/cron-api.js` (add new route near existing FB routes)

- [ ] **Step 1: Add the handler**

In the route dispatch section (near line 2853), add. Note: this route is protected by the existing cron-api auth token guard that applies to all routes in this dispatcher — verify that the guard fires before this handler, or add explicit token validation.

```js
} else if (urlPath === '/api/fb/pages') {
  const fbPub = require('./fb-publisher');
  const pages = fbPub.listPages();
  return jsonResp(res, 200, { pages });
}
```

This is the endpoint the bot calls for `fb_list_pages` capability and for page resolution during posting. Returns `[{id, pageId, pageName, shortName, enabled, tokenId, tokenStatus}]` per spec.

- [ ] **Step 2: Commit**

```bash
git add electron/lib/cron-api.js
git commit -m "feat(fb): GET /api/fb/pages endpoint for page listing"
```

---

## Chunk 4: Schedule Multi-Page (fb-schedule.js)

### Task 6: Add `targetPageId` to schedule creation

**Files:**
- Modify: `electron/lib/fb-schedule.js:1072-1164` (schedule create route)

- [ ] **Step 1: Read current schedule creation code**

Read `electron/lib/fb-schedule.js` lines 1072-1164.

- [ ] **Step 2: Add `targetPageId` to schedule creation**

In the `newSchedule` object construction (~line 1117-1132):
1. At the top of the handler, add `const cfg = workspace.readFbConfig();` (not present in current code — must be added)
2. Read `params.targetPageId`
3. If missing → return error: `{ error: 'targetPageId is required — specify which fanpage this schedule targets' }`
4. Validate: call `workspace.getFbPageById(cfg, params.targetPageId)` — if null → return error: `{ error: 'Page not found: <id>' }`
5. Add `targetPageId` to the schedule object

- [ ] **Step 3: Copy `targetPageId` into pending objects**

In `handleGenerate()` (~line 368-382 where the `pending` object literal is built), add `targetPageId: schedule.targetPageId` to the pending object. Note: the function is called `handleGenerate`, not `_handleGenerateInner` — read the actual code to confirm the function name before editing.

- [ ] **Step 4: Commit**

```bash
git add electron/lib/fb-schedule.js
git commit -m "feat(fb): targetPageId required on schedule creation"
```

### Task 7: Update publish phase to use per-page tokens

**Files:**
- Modify: `electron/lib/fb-schedule.js:622-810` (publish logic)

- [ ] **Step 1: Read current publish implementation**

Read `electron/lib/fb-schedule.js` lines 620-720 for the publish flow.

- [ ] **Step 2: Replace global config lookup with per-page token lookup**

At the top of `_publishPendingImpl()` (which already reads `const cfg = readFbConfig()` at line 623 — use this same `cfg` object throughout):
1. Read `pending.targetPageId` (set in Task 6 step 3)
2. If missing AND `schedule.targetPageId` also missing → this is an un-migrated schedule. Skip publish, send CEO alert: "Lịch đăng [label] bị bỏ qua — không có fanpage mục tiêu. Xóa và tạo lại lịch này."
3. Use `const targetPageId = pending.targetPageId || schedule.targetPageId`
4. Call `workspace.getFbPageToken(cfg, targetPageId)` to get `{pageId, token, pageName}`
5. If page not found/disabled → skip publish, send CEO alert: "Lịch đăng [label] bị bỏ qua — fanpage [name] không còn hoạt động."
6. Replace `cfg.pageId` and `cfg.accessToken` with the looked-up `pageId` and `token` values in `fbPub.postPhoto()` and `fbPub.postText()` calls

- [ ] **Step 3: Add OAuthException handling**

After the `postPhoto`/`postText` calls, catch Facebook 190/OAuthException errors specifically:
1. Mark page token as expired in config (read config, set `pages[i].tokenExpired = true`, write back)
2. Check if token is legacy via `workspace.getTokenById(cfg, page.tokenId)`
3. Send differentiated CEO alert:
   - Normal: "Token fanpage [name] đã hết hạn. Vào Dashboard → Facebook để kết nối lại."
   - Legacy: "Token fanpage [name] đã hết hạn. Cần dán User Token mới (không phải Page Token cũ) trong Dashboard → Facebook."

- [ ] **Step 4: Add page name to Telegram preview in generate phase**

In `_handleGenerateInner()`, modify the Telegram preview message to include the target page name:
Find the preview message construction and prepend: `"Bài cho **${pageName}** (${shortName || ''}) — lúc ${schedule.postTime}"`.

- [ ] **Step 5: Add page name to post-publish confirmation**

After successful publish, if a Telegram notification is sent, include: `"Đã đăng lên **${pageName}**."`.

- [ ] **Step 6: Commit**

```bash
git add electron/lib/fb-schedule.js
git commit -m "feat(fb): per-page token lookup in publish + OAuthException handling"
```

### Task 8: Disambiguate "fb ok" for multiple pending pages

**Files:**
- Modify: `electron/lib/fb-schedule.js:1422-1466` (Telegram command parser area) and the approval handler

- [ ] **Step 1: Read current approval flow**

Read `electron/lib/fb-schedule.js` around the `parseTelegramCommand()` function and the handler that processes "fb ok" to understand how single-pending approval works.

- [ ] **Step 2: Find the approval handler that processes parsed commands**

Search for where `parseTelegramCommand` result is consumed and approval is applied. Read that section.

- [ ] **Step 3: Add multi-pending disambiguation**

In the approval handler:
1. When action is `approve` and no specific `scheduleId`:
   - Get all pending posts across all schedules
   - If exactly 1 → approve it (unchanged behavior)
   - If 0 → respond: "Không có bài nào đang chờ duyệt."
   - If >1 → respond with numbered list:
     ```
     Có N bài đang chờ duyệt:
     1. [pageName] ([shortName]) — "[caption preview 30 chars]..."
     2. ...
     Nhắn số (1, 2, ...) hoặc "tất cả" để duyệt.
     ```
2. Add number-based selection: if CEO replies "1" or "2", call `collectActive()` again (deterministic sort by date+scheduleId), index into the result at position N-1, approve that specific pending post. **State is stateless** — the numbered list is reconstructed from `collectActive()` on each reply, which always returns the same order for the same set of pending posts.
3. Add "tất cả" / "all" to approve all pending posts via loop over `collectActive()` results

- [ ] **Step 4: Update `parseTelegramCommand()` to recognize numbered replies**

Add a pattern to recognize `^[0-9]+$` as a `selectPending` action with `index: parseInt(text)`, and `^(tất cả|tat ca|all)$` as `approveAll`. Also find and replace the existing `_fbDisambig()` function (if present ~line 1470-1473) with the new numbered-list format that includes page names and caption previews.

- [ ] **Step 4b: Wire numbered reply handler**

In the handler that dispatches on `cmd.action`, add a case for `selectPending`: call `collectActive()` (same deterministic sort as the disambiguation message), validate `cmd.index` is in range (1 to N), approve the entry at `active[cmd.index - 1]`. For `approveAll`: loop and approve all.

- [ ] **Step 5: Commit**

```bash
git add electron/lib/fb-schedule.js
git commit -m "feat(fb): disambiguate 'fb ok' when multiple pages have pending posts"
```

---

## Chunk 5: AGENTS.md + Skills

### Task 9: Update AGENTS.md with page resolution rules

**Files:**
- Modify: `AGENTS.md:264-298` (Capability Router) and `AGENTS.md:323-324` (FB rules)

- [ ] **Step 1: Read current FB sections in AGENTS.md**

Read `AGENTS.md` lines 264-270 (router), lines 20-22 (AUTO-MODE), lines 322-325 (FB rules).

- [ ] **Step 2: Add `fb_list_pages` to Capability Router**

After line 270 (fb_approve row), add a new row:

```
| "danh sách fanpage", "fanpage của anh", "em ơi anh có page nào", "list pages", "xem fanpage" | `fb_list_pages` | Gọi `GET /api/fb/pages` → format response: "Các fanpage đã kết nối:\n1. [pageName] (tên ngắn: [shortName]) — [status]\n2. ..." Nếu shortName null → "(chưa đặt tên ngắn)". Status = đang hoạt động / token hết hạn / đã tắt |
```

- [ ] **Step 3: Add Page Resolution Protocol to FB rules section**

After the existing FB posting rules (~line 323), add:

```markdown
### Xác định fanpage (Bước 0 — BẮT BUỘC trước MỌI thao tác Facebook)

Trước khi đăng bài, tạo lịch, hoặc xem insights:
1. Gọi `GET /api/fb/pages` lấy danh sách fanpage
2. Nếu CEO đã nêu tên page → match tên ngắn (exact) rồi tên Facebook (substring)
3. Nếu chỉ có 1 page → dùng page đó, XÁC NHẬN với CEO: "Đăng lên **[Page Name]** ([tên ngắn])?"
4. Nếu không match hoặc nhiều match → HỎI: "Anh muốn đăng lên fanpage nào?" kèm danh sách
5. KHÔNG BAO GIỜ đoán page. KHÔNG BAO GIỜ dùng page mặc định khi có >1 page.
6. Truyền `pageId` vào MỌI API call: `/api/fb/post?pageId=...`, `/api/fb/insights?pageId=...`, `/api/fb/schedule/create?...&targetPageId=...`
7. Sau khi đăng: xác nhận "Đã đăng lên **[Page Name]**."
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "feat(fb): page resolution protocol + fb_list_pages in AGENTS.md"
```

### Task 10: Update facebook-post-workflow.md skill

**Files:**
- Modify: `skills/marketing/facebook-post-workflow.md`

- [ ] **Step 1: Read current Phase 0 (verify) section**

Read `skills/marketing/facebook-post-workflow.md` lines 40-55.

- [ ] **Step 2: Add "Bước 0 — Xác định fanpage" before current Phase 0**

Insert before the token verify phase:

```markdown
## Bước 0 — Xác định fanpage

Trước mọi thao tác, xác định CEO muốn đăng lên fanpage nào.

1. Gọi `GET /api/fb/pages` — nhận danh sách `[{id, pageId, pageName, shortName, enabled}]`
2. Nếu chỉ có 1 page enabled → dùng page đó, xác nhận: "Đăng lên **[pageName]**?"
3. Nếu CEO đã nêu tên (VD: "đăng lên cafe") → match `shortName` (exact, case-insensitive) → fallback `pageName` (substring)
4. Không match → "Không tìm thấy fanpage '[X]'. Các fanpage hiện có: [danh sách]"
5. Nhiều match → "Có N fanpage khớp: [danh sách]. Anh muốn đăng lên page nào?"
6. Page disabled → "Fanpage '[X]' đã tắt. Bật lại trong Dashboard."

Lưu `pageId` đã chọn, truyền vào MỌI API call tiếp theo.
```

- [ ] **Step 3: Update Phase 0 (verify) to pass `pageId`**

Change the verify call from `GET /api/fb/verify` to `GET /api/fb/verify?pageId=<resolved_pageId>`.

- [ ] **Step 4: Update Phase 4 (post) to include `pageId`**

All `/api/fb/post` calls gain `&pageId=<resolved_pageId>`.

- [ ] **Step 5: Update scheduled post creation examples**

All `/api/fb/schedule/create` calls gain `&targetPageId=<resolved_pageId>`.

- [ ] **Step 6: Commit**

```bash
git add skills/marketing/facebook-post-workflow.md
git commit -m "feat(fb): add Bước 0 page resolution + pageId in all API calls"
```

### Task 11: Update facebook-insights.md skill

**Files:**
- Modify: `skills/operations/facebook-insights.md`

- [ ] **Step 1: Read current file**

Read `skills/operations/facebook-insights.md` lines 25-35.

- [ ] **Step 2: Add `pageId` to the API call example**

Change:
```
web_fetch url="http://127.0.0.1:20200/api/fb/insights?days=7"
```
To:
```
web_fetch url="http://127.0.0.1:20200/api/fb/insights?pageId=<pageId>&days=7"
```

Add a note: "**Bắt buộc:** Phải xác định fanpage trước (xem Bước 0 trong facebook-post-workflow.md). Truyền `pageId` đã xác định vào API call."

- [ ] **Step 3: Commit**

```bash
git add skills/operations/facebook-insights.md
git commit -m "feat(fb): pageId required in insights API call"
```

---

## Chunk 6: Integration Verification

### Task 12: End-to-end smoke verification

**Files:**
- No new files. Manual verification against running app.

- [ ] **Step 1: Verify migration path**

Create a test `fb-config.json` in old format at the workspace. Start the app (or run `readFbConfig()` in a Node REPL). Verify:
- Config auto-migrates to new shape
- `fb-config.backup.json` exists
- `tokens[0].isLegacy === true`
- Existing schedules gain `targetPageId`

- [ ] **Step 2: Verify `/api/fb/pages` endpoint**

```bash
curl http://127.0.0.1:20200/api/fb/pages
```
Expected: `{ pages: [{ id, pageId, pageName, shortName, enabled, tokenId }] }`

- [ ] **Step 3: Verify `/api/fb/post` rejects without `pageId`**

```bash
curl "http://127.0.0.1:20200/api/fb/post?message=test"
```
Expected: 400 `{ error: 'pageId is required' }`

- [ ] **Step 4: Verify `/api/fb/post` accepts valid `pageId` (preview mode)**

```bash
curl "http://127.0.0.1:20200/api/fb/post?pageId=<valid_id>&message=test&preview=true"
```
Expected: 200 with preview response including `approvalNonce`. This uses the existing preview mode (not a real post) to verify the page token lookup works without actually posting to Facebook.

- [ ] **Step 5: Verify `resolvePageByName` returns correct results**

From Node REPL in `electron/`:
```js
const fb = require('./lib/fb-publisher');
console.log(fb.resolvePageByName('cafe'));       // → {page: {...}, reason: 'found'}
console.log(fb.resolvePageByName('nonexistent')); // → {page: null, reason: 'not_found'}
```

- [ ] **Step 6: Verify AGENTS.md has all new rules**

Search AGENTS.md for: "Xác định fanpage", "fb_list_pages", "pageId". All must be present.

- [ ] **Step 7: Verify skill files have `pageId` in API calls**

Search `facebook-post-workflow.md` for `pageId` — must appear in verify, post, and schedule create calls.
Search `facebook-insights.md` for `pageId` — must appear in insights call.

- [ ] **Step 8: Verify "fb ok" disambiguation**

If there are 2+ schedules with pending posts: send "fb ok" via the Telegram command parser. Expected: numbered list response with page names and caption previews. Send "1" → expected: approves the first pending post. Send "tất cả" → expected: approves all.

If only 1 pending post: send "fb ok" → expected: approves it directly (unchanged behavior).

- [ ] **Step 9: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix(fb): integration fixups from smoke verification"
```
