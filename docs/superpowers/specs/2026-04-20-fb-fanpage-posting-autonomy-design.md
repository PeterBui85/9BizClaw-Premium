---
name: fb-fanpage-posting-autonomy-design
status: draft
version: v2.3.48 (Facebook Update)
date: 2026-04-20
author: Peter Bui <devops@modoro.com.vn>
supersedes: docs/superpowers/specs/2026-04-09-facebook-all-in-one-design.md (posting portion only)
---

# Facebook Fanpage Posting Autonomy — Design Spec

> **For agentic workers:** REQUIRED: Use `superpowers:writing-plans` to convert this spec into an implementation plan before writing code.

## Overview

CEO-owned Meta Developer App (Dev Mode, no App Review). Bot autonomously generates daily FB post drafts at 7:30am, delivers via Telegram with inline buttons, CEO approves with a single tap, bot publishes via Graph API. Posts get Insights-tracked at 24h + 7d for a performance loop that feeds back into next-day generation quality.

Supersedes the April 9 spec for the posting portion only. Explicitly excludes Messenger customer care, comment reply, and personal FB for v2.3.48.

## Goals

- CEO can ship 1 quality FB post per day without typing a caption
- Bot learns the Page's audience over 4-6 weeks via Performance Loop
- Zero ops burden on MODORO (no relay servers, no webhooks, no hosting)
- Consistent with existing patterns: CEO-owned OAuth (GCal), Telegram marker protocol, cron jobs, local-first

## Non-Goals

- Messenger inbox reply (customer care)
- Comment reply on FB posts
- Personal Facebook posting (Playwright)
- Instagram / WhatsApp cross-posting
- Centralized MODORO Meta App (requires App Review → blocked 2-3 months)
- Auto-image generation (phase 2 candidate, not required for MVP)

## Architecture

```
[CEO's Meta Developer App — Dev Mode, CEO-owned]
   │ (Page Access Token, encrypted via safeStorage)
   ▼
[9BizClaw local runtime]
   │
   ├─ 7:30am cron "fb-draft-generator":
   │    ├─ Read context: AGENTS.md, COMPANY/PRODUCTS.md, industry/active.md,
   │    │                memory/{last 7 days}, GCal next 7d,
   │    │                fb-performance-history.md, last 14d FB posts (Graph API)
   │    ├─ Apply 5 skills: post-writer → industry-voice → rep-avoider → trend-aware → ab-variant
   │    ├─ Generate 1 main draft + 2 variants (JSON)
   │    └─ Write pending-fb-drafts/{today}.json + Telegram digest with inline buttons
   │
   ├─ CEO taps inline button → callback_query → openclaw patch → IPC main.js
   │    → fb/drafts.js handler → Graph API POST /{pageId}/feed
   │      (image: POST /photos first → attach media_fbid)
   │
   └─ Per-post Insights cron: fire 24h + 7d after publish → fetch metrics
      → append fb-performance-history.md → feedback into next generator run
```

### Module Layout

Mirrors `electron/gcal/` convention shipped in v2.3.48.

```
electron/fb/
  auth.js          - OAuth flow + safeStorage token wrap + port fallback 18791..18795
  config.js        - page settings, cron time, pause-aware logic
  graph.js         - Graph API v21.0 helpers: postToFeed, uploadPhoto, fetchInsights, fetchRecentPosts, debugToken
  drafts.js        - pending-fb-drafts/*.json read/write + approval lifecycle + undo window
  generator.js     - context → skills (single concatenated prompt) → draft pipeline
  performance.js   - Insights cron worker + history rewrite + trim policy
  markers.js       - [[FB_PUBLISH]], [[FB_SKIP]], [[FB_EDIT]], [[SKILL_*]] interceptors + source-channel validation
  migrate.js       - owner-field migration for schedules.json + custom-crons.json (one-shot, idempotent via flag file)
```

`migrate.js` is called from `seedWorkspace()` exactly once per `seedWorkspace()` run; idempotency enforced by reading/writing marker `cron-owner-migrated-v1` in `workspace-state.json`. No legacy path migration (9bizclaw dir rename was handled in v2.3.48 via `_legacyWorkspaceModoroClaw()` in `gcal/migrate.js`).

Graph API version pinned to **v21.0** in `graph.js` constant `GRAPH_API_VERSION = 'v21.0'`; all endpoint URLs interpolate this. Rationale: pinning prevents silent breakage when Meta deprecates older versions. Upgrade cadence: review on each Meta quarterly release, bump explicitly after smoke-test pass on new version.

### Workspace Files (Seeded)

```
skills/INDEX.md                      (UPDATED: +5 fb-* rows under Marketing section)
skills/fb-post-writer.md             (NEW, seeded by seedWorkspace)
skills/fb-industry-voice.md          (NEW)
skills/fb-repetition-avoider.md      (NEW)
skills/fb-trend-aware.md             (NEW)
skills/fb-ab-variant.md              (NEW)
memory/fb-performance-history.md     (seeded empty, grows per post, trimmed per policy)
config/fb-post-settings.json         (cron time, auto-publish toggle, default angle, quiet hours)
logs/fb-posts-log.jsonl              (created lazily)
pending-fb-drafts/                   (created lazily)
pending-insights-checks.json         (created lazily)
pending-undo.json                    (created lazily; per-post undo state, entries expire T+60s)
```

INDEX.md addition is a diff, not a full rewrite — append 5 rows under existing `### Marketing` section (or a new `### Facebook Marketing` subsection). `seedWorkspace()` applies the updated INDEX.md via the existing AGENTS.md version piggyback (v23 → v24).

### Encrypted Token Store (`%APPDATA%/9bizclaw/fb/`)

```
config.json       - { appId, pageId, pageName, grantedAt, scopes: [...] }
token.enc         - Page Access Token, Electron safeStorage (DPAPI/Keychain)
app-secret.enc    - App Secret, safeStorage (needed for /debug_token calls)
```

## Cron Dashboard Redesign

Current "Lịch tự động" tab in Dashboard is a flat list. Redesign: group by `owner` tag.

```
Filter pills: [All] [Zalo] [Facebook] [CEO] [System]

ZALO
  • Morning report            07:00  ON
  • Zalo cookie refresh       Every 6h ON
  • Customer memory snapshot  23:00  ON

FACEBOOK (NEW)
  • Draft generator           07:30  ON
  • Insights 24h              per-post
  • Insights 7d               per-post
  • Token validity check      Mon 08:00 ON

CEO CUSTOM
  • Gọi anh A thứ 3           15:00  ON
  • [+ Thêm lịch]

SYSTEM (read-only)
  • Gateway heartbeat         Every 30min ON
  • Cron watchdog             Every 5min  ON
```

Each cron row shows: name / schedule / status / actions (pause/test/edit/delete for non-system rows, plus **"Sửa nhóm"** action for all non-system rows to correct owner misclassification from the migration heuristic).

**"Sửa nhóm" handler**: opens small picker UI (Zalo / Facebook / Telegram / CEO / System labels) → on selection, IPC `set-cron-owner` → main.js updates the appropriate JSON (schedules.json for built-in names, custom-crons.json for user-created) via `writeOpenClawConfigIfChanged`-style byte-equal guard → Dashboard re-renders with new group.

### Data Schema Changes

Add `owner` field to each cron entry in `schedules.json` (built-in) and `custom-crons.json` (user):

```json
{
  "name": "zalo_morning_report",
  "time": "07:00",
  "owner": "zalo",  // NEW: "zalo" | "facebook" | "telegram" | "ceo" | "system"
  "handler": "morningReport"
}
```

### Migration

On `seedWorkspace()` run, migrate existing entries:
1. **Primary idempotency gate**: check `workspace-state.json` for marker `cron-owner-migrated-v1`. If present → return immediately, no re-migration.
2. Read both JSON files
3. For entries missing `owner`: infer from `name` prefix (e.g., `zalo_*` → zalo, `fb_*` → facebook, others → system)
4. Write back with owner field
5. Set marker `cron-owner-migrated-v1: true` in `workspace-state.json`
6. **Secondary safety**: even without marker (e.g., workspace-state.json corrupted), the inference step itself is no-op when all entries already have `owner` — so worst case is a redundant file write, not data corruption.

## Wizard + Auth

CEO-owned Meta Developer app, Dev Mode (no App Review needed since CEO is the app admin).

### Wizard Step Flow (added to end of wizard.html flow)

```
Bước 1/6: [Open Meta Developers] button → developers.facebook.com
Bước 2/6: Create App → Type "Business" → Name "9BizClaw-<CEO_name>"
Bước 3/6: Dashboard → Add Product "Facebook Login for Business"
          Paste 5 OAuth redirect URIs vào field "Valid OAuth Redirect URIs"
          (mỗi dòng 1 URI) — Meta không support wildcard nên cần list cả 5:
          ┌─ http://localhost:18791/fb-callback
          │  http://localhost:18792/fb-callback
          │  http://localhost:18793/fb-callback
          │  http://localhost:18794/fb-callback
          │  http://localhost:18795/fb-callback        [Copy tất cả]
Bước 4/6: Settings → Basic → copy App ID + App Secret into 9BizClaw fields
Bước 5/6: [Connect with Facebook] → FB login → grant → redirect
Bước 6/6: Pick Page from dropdown → Save
```

### Permissions Requested

- `pages_show_list` — list Pages CEO admins
- `pages_manage_posts` — publish posts + upload photos + scheduled posts
- `pages_read_engagement` — Page Insights (Performance Loop)

### OAuth Flow (Code)

Mirrors `gcal/auth.js` pattern with its listen-vs-openExternal race fix.

1. `buildAuthUrl(appId, state, port)` — FB authorize URL with 3 scopes + CSRF state + dynamic port (used in redirect URI)
2. `startCallbackServer()` — attempts to bind ports **18791..18795** in order until one succeeds. Returns `{tokens, ready, port}`. If all 5 ports busy → error with actionable message "Vui lòng đóng ứng dụng khác đang dùng port 18791-18795 rồi thử lại". GCal uses port 18790; FB port range is disjoint to avoid collision.

**Meta redirect URI constraint** (important — Meta does NOT support wildcard URIs): Wizard Step 3 must instruct CEO to paste **all 5 candidate redirect URIs** into the Meta App's "Valid OAuth Redirect URIs" field (one per line), covering the full fallback range:
```
http://localhost:18791/fb-callback
http://localhost:18792/fb-callback
http://localhost:18793/fb-callback
http://localhost:18794/fb-callback
http://localhost:18795/fb-callback
```
At OAuth time, `buildAuthUrl(appId, state, port)` passes the actually-bound port's URI. Without all 5 pre-registered, a fallback-port bind produces "URL blocked: This redirect failed because the redirect URI is not white-listed in the app's client OAuth settings." Wizard Step 3 UI should render this as 5 copyable lines with a single "Copy tất cả" button.
3. Callback handler: verify state from `_pendingOauthStates` Map (10-min TTL, per-flow), extract `code`
4. `exchangeCodeForToken(code, appId, appSecret)` → short-lived user token (1h)
5. `exchangeLongLived(userToken, appId, appSecret)` → long-lived user token (60d)
6. `fetchPageTokens(longUserToken)` GET `/me/accounts` → array of `{ pageId, name, access_token, tasks[] }`
7. Wizard UI renders dropdown → CEO picks → `storePageToken(pageId, token)`

### Token Properties

**Page Access Token from long-lived User Token on a Business-type app is non-expiring** per Meta docs (Feb 2024+). Defensive safeguards:

- `fb-token-check` cron weekly Monday 08:00: GET `/debug_token?input_token=<pageToken>` → check `is_valid`. If invalid → banner "Reconnect FB" + disable FB tab controls.
- On app start: same check, alert if invalid.

### Security Notes

- App Secret stored local-only with `safeStorage.encryptString()` (Windows DPAPI / macOS Keychain)
- Output filter extended: add regex `access_token=[^&\s]+` and `client_secret=[^&\s]+` patterns to `_outputFilterPatterns` + injected TS in Zalo output filter
- CSRF state Map per-flow with 10-min TTL
- `startCallbackServer()` returns `{tokens, ready, port}` not bare Promise — eliminates listen-vs-openExternal race (pattern fixed in GCal)
- Non-expiring Page Access Token claim source: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/#pagetokens (Long-Lived Page Access Tokens section). Spec valid as of Feb 2024 Meta docs; implementer should re-verify at implementation time.

### Failure Modes

- Redirect URI mismatch (CEO pasted wrong) → FB error page → wizard shows "Check Step 3 URL matches exactly"
- Revoked token (CEO removed app from their FB) → Dashboard banner "Reconnect FB" + disable FB tab controls
- Missing scope after OAuth (user unchecked permission in consent screen) → error toast + wizard restart prompt

## Daily Generator Pipeline

Cron `fb-draft-generator` fires default 07:30 (configurable via Dashboard → Settings).

### Pause-Aware Behavior

- If `telegram-paused.json` active at cron fire time: still generate draft + persist `pending-fb-drafts/{today}.json` (state `pending-digest-queued`). Do not send Telegram digest.
- On Telegram resume (`resumeChannel('telegram')`): scan `pending-fb-drafts/` for `pending-digest-queued` entries, send consolidated catch-up digest "Có N draft FB chờ duyệt từ khi sếp pause" with buttons still functional.
- If both Telegram + Dashboard unreachable (shouldn't happen but defensive): draft persists, CEO sees on next Dashboard open.
- If generator itself fails entirely (LLM down after retries): do NOT send "no draft today" message (noise). Log to `logs/fb-generator-errors.jsonl` + single Telegram alert after 2 consecutive fail days.

### Pipeline Execution

### Context Inputs

| Source | Use |
|---|---|
| `AGENTS.md`, `IDENTITY.md` | Voice guidelines, CEO name |
| `knowledge/cong-ty/index.md` | Company brand info |
| `knowledge/san-pham/index.md` | Products to promote |
| `industry/active.md` | Industry-specific tone |
| `memory/{today-1..7}.md` | Recent events, customer feedback |
| GCal events next 7 days | Upcoming events for hook opportunities |
| `memory/fb-performance-history.md` | Performance Loop feedback |
| Graph API `/me/posts?since={14d}&fields=message,created_time` | Actual published posts, avoid repetition |

### Skill Stack Execution Model

**Single concatenated system prompt, ONE LLM call.** All 5 skills are loaded into one system prompt in the order listed below. This is a single-shot generation, not a chained pipeline. Cost: 1 prompt per morning (not 5). Latency: ~3-5s typical.

### Skill Stack (Injected into System Prompt in Order)

| Skill | Responsibility |
|---|---|
| `fb-post-writer` | Hook structure (first 2 lines before "See more"), 80-200 words sweet spot, CTA placement, conversational VN tone. **Emoji rule** — 9BizClaw UI / Telegram digests / internal output: NEVER emoji (CLAUDE.md feedback rule). FB caption text that CEO publishes to their Page: emojis allowed ONLY IF CEO explicitly requests per-task ("viết bài vui có emoji") — default is still no-emoji plain copy. Two-context distinction is codified in this skill file. |
| `fb-industry-voice` | Read `industry/active.md`, adjust tone/examples: F&B playful + visual-heavy / SaaS professional + benefit-focused / Edu warm + authoritative / Retail urgency / Real Estate data-driven |
| `fb-repetition-avoider` | Extract topics/angles/products/CTAs from last 14 days Graph API + performance history. Hard rule: don't post same product 2 days in a row. Instruction: "Last 3 posts used angles X — use different angle" |
| `fb-trend-aware` | VN calendar: Fixed (Tết, 30/4, 1/5, 2/9, 20/10, 20/11, 8/3, 14/2), Lunar (Rằm tháng 7, Vu Lan, Trung Thu, Tết Nguyên Đán), Industry-specific (Black Friday, back-to-school). If today±7d matches → suggest light hook integration |
| `fb-ab-variant` | From same topic: Main (strongest expected angle from history) + Variant A (contrasting angle) + Variant B (< 80 words punchy). Each variant has different hook, not just reworded text |

### Output JSON Schema (`pending-fb-drafts/{YYYY-MM-DD}.json`)

```json
{
  "generatedAt": "2026-04-20T07:30:00+07:00",
  "date": "2026-04-20",
  "main": {
    "id": "2026-04-20-main",
    "angle": "educational",
    "message": "Sếp có biết 80% khách chọn iPhone vì camera...",
    "imageHint": "knowledge/san-pham/files/iPhone-15-Pro.jpg",
    "suggestedTimes": ["19:00", "12:00"],
    "hashtags": ["#iPhone15Pro"],
    "status": "pending"
  },
  "variants": [
    {
      "id": "2026-04-20-a",
      "angle": "question",
      "message": "Bạn mua iPhone vì camera hay pin?",
      "imageHint": null,
      "suggestedTimes": ["19:00"],
      "hashtags": [],
      "status": "pending"
    },
    {
      "id": "2026-04-20-b",
      "angle": "story",
      "message": "Hôm qua anh khách ghé shop...",
      "imageHint": "knowledge/san-pham/files/iPhone-15-Pro-lifestyle.jpg",
      "suggestedTimes": ["12:00"],
      "hashtags": [],
      "status": "pending"
    }
  ]
}
```

### Schema Contract

**`variants` array size**: min 0, max 2. Generator may return empty array if the content-safety filter trimmed all variants or if the LLM declined to produce multiple angles. UI handles all three cases gracefully:
- 0 variants → show only Main (2 buttons: Đăng Main, Bỏ hôm nay)
- 1 variant → show Main + Variant A (3 action buttons)
- 2 variants → show Main + A + B (4 action buttons)

**`status` enum** (applies to each `main` and each `variants[i]`):
- `pending` — initial state, awaiting CEO action
- `pending-digest-queued` — generated while Telegram paused, digest not yet sent
- `approved` — CEO tapped approve, not yet published (in-app scheduling window)
- `published` — Graph API POST succeeded, postId recorded
- `skipped` — CEO explicitly skipped, or expired after 7 days backlog
- `failed` — Graph API POST failed after retry exhaustion

### Prompt Budget

Target ≤ 32k tokens (9router routes to gpt-5-mini or similar with 32k context):

- AGENTS.md ~5k
- 5 skill docs ~10k total
- Performance history summary ~3k
- Memory last 7 days ~5k
- Knowledge selective sections ~3k
- **Total ~26k, safely under limit**

## Approval UX

**Primary: Telegram inline buttons.** No command memorization required.

### Morning Digest Message

```
Sáng sếp. Hôm nay có 1 draft + 2 variant để duyệt.

[Main] Educational — khuyến nghị
"Sếp có biết 80% khách chọn iPhone vì camera..."
Ảnh: iPhone-15-Pro.jpg  |  Giờ đăng tối ưu: 19:00

[Variant A] Question
"Bạn mua iPhone vì camera hay pin?"

[Variant B] Story (ngắn)
"Hôm qua anh khách ghé shop..."

[ Đăng Main ]  [ Variant A ]  [ Variant B ]
[ Bỏ hôm nay ] [ Sửa trên Dashboard ]
```

### Button Callback Handling

- Patch openclaw Telegram plugin: `ensureTelegramCallbackFix()` (idempotent via marker `9BizClaw TELEGRAM-CALLBACK PATCH v1`)
- **Call-site**: invoked from `_startOpenClawImpl()` in `main.js`, same ordering as `ensureZaloBlocklistFix`, `ensureZaloGcalNeutralizeFix` (per CLAUDE.md Rule #1). Smoke guard G9b verifies literal string `ensureTelegramCallbackFix()` appears inside `_startOpenClawImpl`'s body in main.js source.
- Patch-failure resilience: wrapped in try/catch; on `TELEGRAM_CALLBACK_ANCHOR_MISSING` → audit log + CEO alert + continue boot with callback handling DISABLED (inline buttons still render but taps are no-ops; free-text fallback still works). Output-side marker interceptor still runs.
- Patch handles `callback_query` updates (Telegram sends these when user taps inline button)
- Callback data format: `fb:<action>:<draftId>[:<variant>]` where `<action>` ∈ {`publish`, `skip`, `undo`, `edit`}. Examples: `fb:publish:2026-04-20:main`, `fb:skip:2026-04-20`, `fb:undo:<postId>`, `fb:edit:2026-04-20`. Telegram callback_data limit is 64 bytes — current format is well under (longest ≈ 35 bytes). If future variant IDs grow, use a short hash instead of full timestamp.
- Patch forwards callback_query via IPC to main.js (`fb-telegram-callback`)
- main.js checks prefix `fb:` → calls `fb/drafts.js` handler
- `answerCallbackQuery` (ACK) within 1s to prevent Telegram spinner timeout
- After publish: `editMessageText` to "Đã đăng Main lúc 19:00 | Post ID: xxx | Xem: https://fb.com/..."

### Undo Window

60 seconds after publish: edited digest includes inline button `[ Undo ]`.

**State persistence** (survives process restart):
- On publish → append to `pending-undo.json`:
  ```json
  [{ "postId": "abc", "chatId": 12345, "messageId": 67890, "expiresAt": "2026-04-20T19:01:00+07:00" }]
  ```
- Expiry worker runs every 10 seconds: for entries with `expiresAt <= now` → `editMessageText` removing the Undo button (UX correctness) → remove entry from JSON → cron cleanup done.
- On boot: worker immediately scans list, removes already-expired entries.
- Tap `[ Undo ]` within 60s → lookup entry by `postId` → if not expired → Graph API `DELETE /{postId}` + remove from log + edit digest to "Đã hủy lúc HH:MM". If entry missing (already expired or cleared) → `answerCallbackQuery` with "Quá thời gian hủy".

This eliminates the "button visible but handler stateless" race when the process restarts mid-window.

### Dashboard FB Tab (Desktop Fallback)

- Cards per draft: full text + image preview + editable textarea + image picker (from `knowledge/san-pham/files/` dropdown or local upload)
- Buttons: "Đăng ngay" / "Lên lịch giờ X" (time picker, in-app scheduling only — see note) / "Bỏ"

**Scheduling clarification:** "Lên lịch giờ X" means the app stores the approved draft with a target publish time in `pending-scheduled-posts.json`; a cron job fires at the target time and calls Graph API `POST /{pageId}/feed` at that moment. This is **NOT** Meta's native `scheduled_publish_time` parameter (which would require `pages_manage_posts` + schedule-specific flow and couples ship dates to Meta's scheduler). Local-only scheduling keeps the post queue inspectable + cancellable without Graph round-trips, and matches existing 9BizClaw cron patterns.
- Shared backing store with Telegram path (same `pending-fb-drafts/*.json`) → state syncs both directions
- If CEO edits textarea then approves → updated text used for publish

### Free Text Fallback (Graceful)

Short reply like "ok", "a", "bỏ" → LLM agent parses via AGENTS.md rule → emits marker:
- `[[FB_PUBLISH: {"id":"2026-04-20-main", "variant":"main"}]]`
- `[[FB_SKIP: {"id":"2026-04-20"}]]`

main.js intercepts marker → executes same handler as button path.

### Dashboard Deep Link (from Telegram "Sửa" button)

- Callback triggers: `browserWindow.focus()` (brings Electron to front)
- Navigate to FB tab + scroll to `#fb-draft-{id}` anchor
- If window closed: `createWindow()` first, then navigate after ready

### Zalo Channel

Digest FB sent to Telegram ONLY (not dual-channel via `sendCeoAlert`). Reasons:
- Zalo doesn't support inline buttons (OpenZalo plugin, not Zalo OA)
- Zalo is customer-facing — CEO internal comms belong on Telegram
- Simpler single-source-of-truth

If CEO has no Telegram configured: Dashboard-only workflow, banner message on FB tab.

## Performance Loop

### Post-Publish Flow

1. Post to FB via `graph.js:postToFeed()` → append `fb-posts-log.jsonl`:
   ```json
   {"postId":"abc", "publishedAt":"2026-04-20T19:00:00+07:00", "draftId":"2026-04-20-main", "angle":"educational", "imageHint":"iPhone-15-Pro.jpg"}
   ```
2. Queue 2 Insights checks in `pending-insights-checks.json` (persistent, survives restart):
   ```json
   [
     {"postId":"abc", "checkAt":"2026-04-21T19:00:00+07:00", "type":"24h"},
     {"postId":"abc", "checkAt":"2026-04-27T19:00:00+07:00", "type":"7d"}
   ]
   ```
3. Worker cron every 15min scans list, fires past-due checks, removes on success.

### Metrics Fetch

| Check | Endpoint | Fields |
|---|---|---|
| 24h | `/{postId}?fields=reactions.summary(true),comments.summary(true),shares` | Aggregated reaction/comment/share counts |
| 7d | `/{postId}/insights?metric=post_impressions,post_impressions_unique,post_clicks,post_engaged_users,post_reactions_by_type_total` | Full reach + engagement rate |

Rate limit: ~60 Insights calls/month (2 checks × 30 posts) vs 200/hour quota → negligible.

### History Size + Trim Policy

- Each post adds ~400 bytes (24h section + 7d section + header).
- Daily posting × 12 months ≈ 150 KB → exceeds comfortable budget for LLM prompt injection.
- `trimFbPerformanceHistory()` runs after every Insights append:
  - Keep **last 12 weeks verbose** (full per-post sections).
  - For older entries: collapse each calendar month into a rolling-summary paragraph (avg engagement per angle, top 3 posts of month, remove detailed 24h/7d blocks).
  - Target file size ≤ 50 KB (matches existing `trimZaloMemoryFile` cap pattern per CLAUDE.md).
- Front-matter header + oldest rolling summaries always preserved; only verbose middle-aged entries collapse on each trim pass.

### History Format (`memory/fb-performance-history.md`)

```markdown
# FB Post Performance History

## 2026-04-20 | Main | Educational | 19:00

Message: "Sếp có biết 80% khách..."
Image: iPhone-15-Pro.jpg | Hashtags: #iPhone15Pro

### 24h
Reactions 47 (42 like, 3 love, 2 haha) | Comments 8 | Shares 3

### 7d
Impressions 4,320 | Reach 3,810 | Engaged users 112 | Engagement rate 2.8%

---

## 2026-04-19 | Main | Story | 12:00
...
```

### Feedback to Generator (Next Cycle)

`generator.js` reads history before building prompt, computes 4-week rolling stats, injects as LEARNED_PATTERNS section:

```
LEARNED_PATTERNS for this Page (last 4 weeks):
- Educational posts: avg 4.2% engagement (4 posts) ← best angle
- Story: 3.1% (2 posts)
- Question: 2.8% (1 post)
- Best time: 19:00 (+45% reach vs 12:00)
- Best weekday: Tuesday (+30% engagement)
- Hashtag #iPhone15 drove 3x CTR on product posts
```

LLM reasons over markdown directly — no separate ML model required. This is the Performance Loop payoff: after 4-6 weeks, drafts are tuned to the specific Page's audience.

### Dashboard FB Tab — Performance Section

- 4-week rolling chart (reactions, comments, shares, impressions over time)
- Heatmap: day-of-week × hour-of-day engagement
- Card "Top post 30 days" with preview + metrics
- "AI Learning Log" plain-language summary: "Bot đã học: Educational cho Page này hiệu quả gấp 1.5x Story. 19:00 thứ 3-4 là giờ vàng."

Chart library: **custom SVG**. Rationale: Chart.js is actually ~60KB gzipped (spec originally misstated 25KB — Chart.js is larger). Premium aesthetic rule (CLAUDE.md feedback) prefers minimal dependencies. Custom inline SVG components (line chart + heatmap + bar) are straightforward for the 3 simple visualizations required, and keep the build lean. If implementation proves the custom path non-trivial, fall back to Chart.js as a named dependency in `electron/package.json` — but default is custom SVG.

### Failure Modes

- Post deleted between publish and check: skip, log "post not found", remove from queue
- Rate limit hit: backoff + retry +1h (shift `checkAt`), max 24h retry
- Insights not available yet (<1h after publish): shift `checkAt` +1h
- Scope `pages_read_engagement` revoked: banner "Reconnect FB to enable Performance Loop". Applies to BOTH 24h and 7d checks — both endpoints require this scope (24h via `reactions.summary`/`comments.summary`, 7d via `/insights`).

## /skill Command Fix (Bundled)

Current state: AGENTS.md line 248 lists `/skill` as available command but no rule maps `/skill` → action. LLM guesses → "I don't know these skills."

Fix bundled in v2.3.48 FB update:

1. AGENTS.md add rule: "CEO types `/skill` → emit marker `[[SKILL_LIST]]`. CEO types `/skill <name>` → emit `[[SKILL_ACTIVATE: {name}]]`. CEO types `/skill off` → emit `[[SKILL_DEACTIVATE]]`."
2. `main.js` intercept:
   - `[[SKILL_LIST]]` → read `skills/INDEX.md`, format as grouped category reply, send to channel
   - `[[SKILL_ACTIVATE: {name}]]` → validate name exists in INDEX, write `skills/active.md` with path, confirm
   - `[[SKILL_DEACTIVATE]]` → remove `skills/active.md`, confirm
3. Bump AGENTS.md version stamp `v23 → v24` (triggers `seedWorkspace` piggyback re-seed)

Effort estimate: 30 minutes code + test. Zero new dependencies.

## Input-Side Security (Marker Neutralization)

Customers messaging via Zalo/Telegram must not trigger FB publish via prompt injection. Same threat model as GCal markers shipped in v2.3.48.

### Pattern (Reuses `ensureZaloGcalNeutralizeFix` Structure)

Add `ensureZaloFbNeutralizeFix()` in `main.js`:
- Injects filter block into `openzalo/src/inbound.ts` after BLOCKLIST patch anchor
- Rewrite `[[FB_` → `[FB-blocked-` in customer-inbound messages before AI dispatch
- Idempotent via marker `9BizClaw FB-NEUTRALIZE PATCH v1`
- Auto-re-apply on every `startOpenClaw()`
- **Patch-failure resilience**: wrapped in try/catch. On `FB_NEUTRALIZE_ANCHOR_MISSING` (upstream openzalo changed anchor text) → audit log + `sendCeoAlert()` 1x/day + continue boot with **input-side defense DISABLED**. Output-side `interceptFbMarkers` still runs (defense-in-depth partial — not full bypass). Matches the v2.3.48 hotfix pattern for `ensureZaloGcalNeutralizeFix`.

### Output-Side Defense (main.js-level)

`interceptFbMarkers(replyText, meta)` runs on every bot reply BEFORE send. `meta` is populated in the existing bot-reply pipeline where `interceptGcalMarkers` already plugs in (shipped v2.3.48 — see `main.js` `sendTelegram` and `sendZalo` paths). FB interceptor piggybacks the same plumbing: `meta = { channel: 'telegram'|'zalo', chatId: <number>|null, senderUserId: <string>|null }`.

**Source-channel validation:**
- CEO's chat ID source-of-truth: `getTelegramConfigWithRecovery()` (existing helper in main.js — checks `channels.telegram.allowFrom[0]`, falls back to sticky chat ID cache, then to `getUpdates` scan). Returns `{ chatId, error? }`.
- If marker found AND `meta.channel === 'telegram'` AND `meta.chatId === resolved CEO chatId` → execute
- If marker found but ANY condition fails (wrong channel, wrong chat, chatId lookup returned null) → **fail-closed**: drop marker text from reply, append audit entry to `logs/fb-marker-denied.jsonl` with full context, do not execute. Never fail-open.
- Chat ID lookup fails entirely (all 3 tiers in `getTelegramConfigWithRecovery` fail) → drop marker + audit + alert CEO (cron-style) "Không xác định được chat ID CEO → marker bị chặn. Kiểm tra Telegram config."

Defense-in-depth: input-side + output-side + source-channel validation. Even if one layer fails, others block execution.

## Helpers Summary

| Helper | File | Call-site | Responsibility |
|---|---|---|---|
| `ensureTelegramCallbackFix()` | `electron/main.js` | `_startOpenClawImpl()` (same ordering as existing `ensureZaloBlocklistFix`) | Patch openclaw Telegram plugin to forward `callback_query` events via IPC |
| `ensureZaloFbNeutralizeFix()` | `electron/main.js` | `_startOpenClawImpl()` after `ensureZaloGcalNeutralizeFix` | Inject TS filter into openzalo inbound.ts rewriting `[[FB_` → `[FB-blocked-` |
| `interceptFbMarkers(replyText, meta)` | `electron/fb/markers.js` | Plugged into `sendTelegram` + `sendZalo` pipelines (same plumbing as `interceptGcalMarkers`) | Parse `[[FB_*]]` markers in bot reply, validate source channel/chatId, execute or drop with audit |
| `trimFbPerformanceHistory()` | `electron/fb/performance.js` | Called after every Insights append in `appendPerformanceEntry()` | Collapse entries older than 12 weeks into monthly rollups, cap file ≤ 50 KB |
| `migrateCronOwnerFields()` | `electron/fb/migrate.js` | `seedWorkspace()` (once, gated by `cron-owner-migrated-v1` marker) | Infer `owner` field from name prefix, write back to schedules.json + custom-crons.json |
| `fetchInsights(postId, type)` | `electron/fb/graph.js` | Insights cron worker every 15min | Call Graph v21.0 endpoints, handle rate limit backoff + shift-retry |
| `debugToken(pageToken)` | `electron/fb/graph.js` | Boot + weekly `fb-token-check` cron | Validate token liveness, trigger banner on revocation |
| `startCallbackServer()` | `electron/fb/auth.js` | Wizard FB step "Connect with Facebook" button | Bind port 18791..18795, receive OAuth code, return `{tokens, ready, port}` |

## Failure Modes (Summary Table)

| Scenario | Handling |
|---|---|
| Token revoked/expired | 3 detection paths (defense-in-depth): (1) Boot check on app start — `debugToken()` once; (2) Weekly cron `fb-token-check` every Monday 08:00; (3) **On-demand**: any publish that returns HTTP 401/403 immediately triggers `debugToken()` → if invalid, Dashboard banner "Reconnect FB" + morning cron skip + Telegram alert 1x/day. On-demand path closes the weekly-check lag window (up to 7 days between scheduled checks). |
| Graph API down / network fail | Generator retry 3x with exponential backoff (1s, 4s, 16s) → still fail → Telegram alert "không gen được draft hôm nay, em thử lại sáng mai" |
| Post publish HTTP 400/403 | Dashboard toast + log. Rate limit (429) → retry +15min. Image upload fail → fallback to text-only post with warn |
| LLM gen fail (9router down) | Retry once with simpler prompt → still fail → Telegram alert to CEO |
| Insights not ready (<1h) | Shift `checkAt` +1h in queue, max 24h retry |
| Mid-operation crash | `pending-insights-checks.json` persistent → worker resumes on boot, fires past-due immediately |
| 3+ day approval backlog | `pending-fb-drafts/` accumulates, Dashboard badge count on FB tab, day 4 Telegram nudge "3 draft chưa duyệt, em dọn hết không?" |
| CEO approves wrong variant | 60s undo window via inline button → Graph API DELETE. After 60s: log only |
| Sensitive info in generated draft | Reuse existing `filterSensitiveOutput()` 19-pattern list on draft text BEFORE publish |
| Customer prompt injection `[[FB_PUBLISH]]` | `ensureZaloFbNeutralizeFix` input patch + output-side source-channel check |

## Testing

### Smoke Test Additions (`scripts/smoke-test.js`)

New guards (blocking build if any fail):

```
G7:  electron/fb/ has 7 files (auth, graph, generator, drafts, performance, markers, config)
G8:  5 skill templates present in source + listed in extraResources workspace-templates
G9:  ensureTelegramCallbackFix marker present in openclaw Telegram plugin inbound after patch application
G9b: literal string `ensureTelegramCallbackFix()` appears inside _startOpenClawImpl body in electron/main.js source (call-site wiring check, runs on source file before patch application)
G10: ensureZaloFbNeutralizeFix marker present in openzalo inbound.ts
G11: Dashboard FB tab required DOM IDs present (fb-drafts-list, fb-compose, fb-performance-chart, fb-status-bar)
G12: Workspace templates list includes memory/fb-performance-history.md + config/fb-post-settings.json
G13: fb/ exports importable without orphan refs: postToFeed, uploadPhoto, fetchInsights, fetchRecentPosts, debugToken
G14: /skill handler wired (AGENTS.md rule present + main.js marker interceptor for [[SKILL_LIST]], [[SKILL_ACTIVATE]], [[SKILL_DEACTIVATE]])
```

### Manual QA Checklist (Fresh Install on Windows + Mac)

```
[ ] Wizard FB step: Meta Developers deep-link opens external browser
[ ] Paste App ID + Secret + redirect URI accepts correct values
[ ] OAuth round-trip completes on localhost:18791 (no race failures)
[ ] Pages dropdown shows Pages CEO administrates
[ ] token.enc + app-secret.enc files exist, NOT readable plain text (verify cat shows binary)
[ ] Cron 07:30 fires (test by temporarily setting time to now+2min)
[ ] Morning digest appears on Telegram with 3 variants, NO emojis
[ ] Inline buttons render on mobile + desktop Telegram
[ ] Tap "Đăng Main" → real post appears on FB Page within 5s
[ ] Digest message edited to "Đã đăng Main lúc HH:MM | Post ID: xxx" after publish
[ ] 24h after publish: Insights cron fetches metrics, appends fb-performance-history.md
[ ] Dashboard FB tab: drafts list, compose box, performance chart all render
[ ] /skill command (bundled fix) lists skill categories from INDEX.md
[ ] /skill advisory/ceo-advisor activates (writes skills/active.md)
[ ] /skill off clears active.md
[ ] Customer sends `[[FB_PUBLISH: {...}]]` via Zalo → does NOT trigger publish (verified in logs)
[ ] Random Telegram chat (NOT CEO chat ID) sends `[[FB_PUBLISH: {...}]]` → marker dropped from reply, `logs/fb-marker-denied.jsonl` entry created, no publish
[ ] Disconnect FB (revoke token in Meta) → banner appears within 1 boot cycle
[ ] Reconnect flow preserves historic pending-fb-drafts and performance history
[ ] Fresh install, SKIP FB wizard step → FB tab shows "Kết nối Facebook" empty state, other features (Zalo/Telegram/GCal) unaffected, no crash on boot or first use
[ ] Telegram paused at 07:30 → draft generated (state=pending-digest-queued), no digest sent; on resume → catch-up digest appears with functional buttons
[ ] Port 18791 occupied by other process during wizard → callback server binds to 18792 automatically, redirect URI in wizard Step 3 shows updated port
[ ] Cron migration: fresh install, then post-install simulated v23→v24 upgrade → schedules.json entries all have `owner` field, marker `cron-owner-migrated-v1` in workspace-state.json, migration runs only once
[ ] Undo window race: publish post → force-quit 9BizClaw within 30s → relaunch → digest still shows [Undo] button, tap works if within 60s, gracefully disabled with "Quá thời gian hủy" message if after 60s
```

## Rollout

1. Smoke test `scripts/smoke-test.js` must PASS 100% before `npm run build:win` or `build:mac:*`
2. Manual E2E on 1 Mac (Apple Silicon) + 1 Windows fresh install
3. FB tab disabled in UI if `%APPDATA%/9bizclaw/fb/config.json` missing → CEO opts in via wizard step
4. EXE/DMG distributed via Telegram/Zalo to premium CEOs (existing distribution plan)

## Version

- `package.json` stays at `2.3.48` per user directive
- `AGENTS.md` version stamp bumped `v23 → v24` to trigger `seedWorkspace()` piggyback re-seed of:
  - 5 new skill templates (fb-post-writer, fb-industry-voice, fb-repetition-avoider, fb-trend-aware, fb-ab-variant)
  - Updated `skills/INDEX.md` with 5 new rows
  - `memory/fb-performance-history.md` (empty seed)
  - `config/fb-post-settings.json` (full default shape: `{ "cronTime": "07:30", "quietHours": null, "defaultAngle": null }`)

  **Fields dropped from earlier drafts**: `autoPublish` and `autoPublishApprovedAt` removed — approval is always CEO-initiated in MVP (tap button or Dashboard click). No auto-publish-after-timeout feature. Re-add to config shape only when that feature is explicitly scoped for phase 2.
  - Updated `AGENTS.md` containing the rules enumerated below
- UI/about: "9BizClaw v2.3.48 — Facebook Update"

### AGENTS.md v24 Delta (Enumerated)

The v23 → v24 bump adds these rules (required for plan to be writable):

1. **Command mapping — `/skill`**: "User types `/skill` → emit marker `[[SKILL_LIST]]`. `/skill <name>` → `[[SKILL_ACTIVATE: {name}]]`. `/skill off` → `[[SKILL_DEACTIVATE]]`."
2. **Command mapping — FB approval**: "User types short reply on Telegram in response to FB morning digest (`ok`, `yes`, `đăng`, `a`, `b`, `bỏ`, `skip`, `không`, `sửa`) → parse intent → emit `[[FB_PUBLISH: {id, variant}]]` for approve, `[[FB_SKIP: {id}]]` for skip, `[[FB_EDIT: {id}]]` for edit (triggers Dashboard focus + scroll to draft)."
3. **FB marker protocol declaration**: Publicly document `[[FB_PUBLISH]]`, `[[FB_SKIP]]`, `[[FB_EDIT]]` markers as bot-to-CEO protocol (analog to existing `[[GCAL_*]]` section). Customer inbound from Zalo containing these markers is neutralized by `ensureZaloFbNeutralizeFix` — documented explicitly so bot itself does not attempt to honor them in reply to customer messages.
4. **Pause-aware cron**: "FB draft generator cron at 07:30 respects `telegram-paused.json`. If Telegram paused: generate + persist as `pending-digest-queued`, do not send digest. Send catch-up digest on channel resume."
5. **Digest quiet hours**: "Default quiet hours none. If `config/fb-post-settings.json.quietHours` set, do not send digest during that window — delay to end of quiet window + 1 minute."
6. **Post emoji rule clarification**: Reiterate the two-context rule — emoji in 9BizClaw-produced UI/digests/alerts: NEVER. Emoji in FB caption CEO publishes: allowed only if CEO explicitly asks per-task.

## Out of Scope / Phase 2 Candidates

- Messenger inbox customer care (auto-reply, AI triage)
- Comment reply on FB posts
- Personal FB posting via Playwright (brittle, risk of account ban)
- Instagram / WhatsApp cross-posting
- Auto-image generation (DALL-E / Imagen integration)
- Unified content calendar (merge GCal events + FB posts in FullCalendar view)
- Multi-Page support (CEO manages >1 Page — current scope: 1 Page per install)
- Native Meta scheduled-post (`scheduled_publish_time` parameter) — in-app cron-based scheduling is supported (see "Scheduling clarification" in Approval UX), but native Meta scheduling is out of scope

## Open Questions

None at spec-write time; all key decisions resolved during brainstorming session 2026-04-20.
