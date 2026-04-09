# Facebook All-in-One — Design Spec

## Mục tiêu

CEO nói "đăng bài" → bot đăng. Khách nhắn Messenger → bot tự reply. Không cần server, không cần webhook, không cần biết code.

## Phase 1 (ship first)

### 1. Facebook Page — Graph API

**Đăng bài Page:**
- CEO ra lệnh Telegram: "đăng bài giới thiệu SP mới lên fanpage"
- Bot dùng copywriting skill → soạn text
- Bot dùng `image_generate` tool (nếu CEO yêu cầu ảnh)
- Bot gọi `POST /{page_id}/feed` hoặc `POST /{page_id}/photos` (có ảnh)
- Bot báo CEO: "Đã đăng, link: https://fb.com/..."

**Reply comment:**
- Polling `GET /{page_id}/feed?fields=comments{message,from,created_time}` mỗi 60s
- Comment mới → bot dùng AGENTS.md rules (customer support scope) → reply
- `POST /{comment_id}/comments` với reply text
- Log comment + reply vào `memory/fb-comments/YYYY-MM-DD.md`

**Messenger auto-reply (polling):**
- Polling `GET /{page_id}/conversations?fields=messages{message,from,created_time}` mỗi 30s
- Tin nhắn mới (trong 24h window) → bot process giống Zalo:
  - Đọc AGENTS.md rules
  - Đọc Knowledge
  - Xưng hô: đoán từ tên (giống Zalo)
  - Reply ngắn 1-3 câu (giống Zalo style)
  - Ghi hồ sơ khách `memory/fb-users/<psid>.md` (giống zalo-users/)
- `POST /me/messages` với reply
- 24h window: ngoài 24h → queue reply, nhắc CEO "khách X nhắn hơn 24h, cần Message Tag"

**Setup (Wizard step 5 + Dashboard tab):**
- Wizard: "Bạn có Facebook Page không?" → Có → OAuth login → chọn Page → lưu Page token
- Dashboard tab "Facebook": kết nối/đổi Page, xem inbox, xem comments, bật/tắt auto-reply
- Page Access Token cần permissions: `pages_manage_posts`, `pages_read_engagement`, `pages_messaging`, `pages_read_user_content`
- Token refresh: long-lived token (60 ngày), auto-refresh trước khi hết

### 2. Facebook cá nhân — Playwright (optional, CEO tự bật)

**Warning UI:**
```
⚠ Facebook cá nhân dùng browser automation.
Rủi ro: Facebook có thể tạm khóa tài khoản nếu phát hiện bot.
MODORO không chịu trách nhiệm nếu tài khoản bị hạn chế.
[  ] Tôi hiểu và muốn bật tính năng này
```

**Đăng bài FB cá nhân:**
- CEO ra lệnh: "đăng bài lên wall cá nhân"
- Playwright mở headless Chromium → navigate tới facebook.com
- Login: CEO đăng nhập 1 lần, cookie persist trong Electron userData
- Navigate tới composer → nhập text → attach ảnh (nếu có) → post
- Báo CEO: "Đã đăng lên wall cá nhân"

**Rate limiting:** max 3 bài/ngày, delay random 5-15 phút giữa các action, không thao tác ban đêm (0-6h).

**Cookie management:**
- Cookie lưu trong `~/.openclaw/fb-session/cookies.json`
- Hết hạn → nhắc CEO login lại (giống Zalo QR flow)
- KHÔNG lưu password

## Architecture

```
electron/
├── fb/
│   ├── graph.js          ← Graph API client (token management, request helper)
│   ├── page.js           ← Page: post, comment reply, comment polling
│   ├── messenger.js      ← Messenger: conversation polling, send reply
│   ├── browser.js        ← Playwright: FB cá nhân posting (optional)
│   └── types.js          ← Shared types/constants
├── main.js               ← IPC handlers, polling loops, Playwright lifecycle
├── preload.js            ← Bridges
└── ui/
    └── dashboard.html    ← Tab "Facebook"
```

## Database

Không cần DB mới. Lưu config trong `~/.openclaw/fb-config.json`:

```json
{
  "page": {
    "id": "123456789",
    "name": "My Business Page",
    "accessToken": "EAA...",
    "tokenExpiresAt": "ISO",
    "permissions": ["pages_manage_posts", "pages_messaging", ...],
    "autoReplyMessenger": true,
    "autoReplyComments": true,
    "pollingIntervalMs": 30000
  },
  "personal": {
    "enabled": false,
    "riskAccepted": false,
    "cookiePath": "~/.openclaw/fb-session/cookies.json",
    "dailyPostLimit": 3,
    "lastPostAt": null
  }
}
```

## IPC Handlers

| IPC | Input | Output |
|-----|-------|--------|
| fb-connect-page | — | Opens OAuth window, returns {pageId, pageName, token} |
| fb-disconnect-page | — | Clears token |
| fb-get-config | — | fb-config.json |
| fb-post-page | {text, imageUrl?} | {success, postId, postUrl} |
| fb-get-comments | {postId} | comments[] |
| fb-reply-comment | {commentId, text} | {success} |
| fb-get-messenger-inbox | — | conversations[] |
| fb-send-messenger | {recipientId, text} | {success} |
| fb-enable-personal | {riskAccepted} | {success} |
| fb-post-personal | {text, imagePath?} | {success} |
| fb-get-page-info | — | {name, followers, todayPosts} |

## Dashboard tab "Facebook"

```
+----------------------------------------------------------+
| Facebook                              [Kết nối Page]     |
| Quản lý fanpage và Messenger                             |
+----------------------------------------------------------+
|                                                          |
| Page: My Business Page          ● Đã kết nối            |
| 1,234 followers                                          |
|                                                          |
| ┌─────────────────────┬────────────────────────────────┐ |
| │ Messenger           │ Bài đăng gần đây              │ |
| │                     │                                │ |
| │ ● Nguyễn Huy 14:30 │ "Khuyến mãi tháng 4..."       │ |
| │   "Giá bao nhiêu?"  │  12 likes · 3 comments        │ |
| │ ● Lê Thảo 11:20    │                                │ |
| │   "Đặt lịch được    │ "Giới thiệu SP mới..."        │ |
| │    không?"           │  8 likes · 1 comment          │ |
| │                     │                                │ |
| └─────────────────────┴────────────────────────────────┘ |
|                                                          |
| Auto-reply Messenger: [ON]  Auto-reply Comment: [ON]    |
|                                                          |
| ┌──────────────────────────────────────────────────────┐ |
| │ Facebook cá nhân                         [Tắt]      │ |
| │ ⚠ Rủi ro: tài khoản có thể bị hạn chế             │ |
| └──────────────────────────────────────────────────────┘ |
+----------------------------------------------------------+
```

## AGENTS.md additions

```markdown
## Facebook (kênh khách hàng — giống Zalo)

Messenger Facebook = customer support, cùng rules Zalo. Bot phân biệt kênh:
- Tin từ Messenger → ghi `memory/fb-users/<psid>.md`
- Tin từ Zalo → ghi `memory/zalo-users/<senderId>.md`
- Escalate Telegram → ghi rõ "[từ Messenger]" hoặc "[từ Zalo]"

Comment reply: ngắn 1-2 câu, trả lời câu hỏi, mời inbox nếu phức tạp.

Đăng bài: CEO ra lệnh → dùng copywriting/content skill → post. KHÔNG tự đăng khi chưa được lệnh.
```

## OAuth Flow (Page kết nối)

1. CEO click "Kết nối Page" trong Dashboard
2. IPC `fb-connect-page` → open BrowserWindow tới:
   ```
   https://www.facebook.com/v25.0/dialog/oauth?
     client_id={app_id}&
     redirect_uri=https://localhost:20128/fb/callback&
     scope=pages_manage_posts,pages_read_engagement,pages_messaging,pages_read_user_content&
     response_type=code
   ```
3. CEO login Facebook → cho phép quyền → redirect back
4. Exchange code → access_token → exchange cho long-lived token (60 ngày)
5. `GET /me/accounts` → list Pages → CEO chọn Page
6. Lưu Page token vào fb-config.json
7. Bắt đầu polling loops

**Cần Facebook App:**
- MODORO tạo 1 Facebook App trên developers.facebook.com
- App ID + App Secret hardcode trong app (hoặc config)
- App cần qua App Review cho permissions (1-2 tuần)
- Hoặc: CEO ở chế độ "Development" (chỉ admin Page dùng được, không cần review)

## Polling loops

```javascript
// Messenger inbox — mỗi 30s
setInterval(async () => {
  const convos = await fbGraphGet(`/${pageId}/conversations?fields=messages.limit(5){message,from,created_time}`);
  for (const msg of newMessages) {
    if (isWithin24h(msg) && !alreadyReplied(msg)) {
      const reply = await processWithBot(msg); // Same pipeline as Zalo
      await fbGraphPost('/me/messages', { recipient: { id: msg.from.id }, message: { text: reply } });
    }
  }
}, 30000);

// Comments — mỗi 60s
setInterval(async () => {
  const posts = await fbGraphGet(`/${pageId}/feed?fields=comments.limit(10){message,from,created_time}`);
  for (const comment of newComments) {
    if (!alreadyReplied(comment)) {
      const reply = await processCommentWithBot(comment);
      await fbGraphPost(`/${comment.id}/comments`, { message: reply });
    }
  }
}, 60000);
```

## Playwright (FB cá nhân)

```javascript
// Chỉ khi CEO đã bật + accept risk
const { chromium } = require('playwright');
const browser = await chromium.launchPersistentContext(cookieDir, { headless: true });
const page = await browser.newPage();
await page.goto('https://www.facebook.com');
// Check login state via cookie
// Nếu chưa login → show BrowserWindow (headful) để CEO login → save cookies → close
// Đăng bài: navigate → composer → type → post
```

**Dependencies:**
- `playwright` hoặc `playwright-core` + bundled Chromium
- Tăng EXE ~80MB (Chromium binary)
- Hoặc: dùng Electron's built-in Chromium (webview tag) — zero extra size

**Better approach: dùng Electron webview thay Playwright:**
- `<webview>` tag với `partition="persist:fb-personal"` (cookie persist)
- Inject JavaScript vào webview để automate posting
- Không cần bundle Playwright/Chromium riêng
- Zero extra size

## Dependencies

| Package | Cần không | Size |
|---|---|---|
| `facebook-nodejs-business-sdk` | Có (Ads Phase 2, Page API helper) | ~5MB |
| `playwright` | KHÔNG — dùng Electron webview thay | 0 |

## Phases

| Phase | Features | Effort |
|---|---|---|
| **1** | Page post + Messenger polling + comment reply + Dashboard tab + Wizard step | 1 week |
| **2** | FB cá nhân via Electron webview + cookie management | 3 days |
| **3** | Ads management (create/manage via Marketing API) + analytics | 1 week |

## Testing

1. Tạo test Facebook Page → kết nối → đăng bài → verify trên FB
2. Nhắn Messenger từ account khác → bot reply trong 30s
3. Comment trên post → bot reply trong 60s
4. FB cá nhân: login → đăng bài → verify (Phase 2)
5. Token refresh: đợi hết hạn hoặc mock → auto-refresh
