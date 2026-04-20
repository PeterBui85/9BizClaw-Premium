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
  auth.js          - OAuth flow + safeStorage token wrap
  config.js        - page settings, cron time
  graph.js         - Graph API helpers: postToFeed, uploadPhoto, fetchInsights, fetchRecentPosts
  drafts.js        - pending-fb-drafts/*.json read/write + approval lifecycle
  generator.js     - context → skills → draft pipeline
  performance.js   - Insights cron worker + history rewrite
  markers.js       - [[FB_PUBLISH]], [[FB_SKIP]], [[FB_EDIT]], [[SKILL_LIST]] + neutralize
  migrate.js       - workspace path compat + owner-field migration for cron
```

### Workspace Files (Seeded)

```
skills/fb-post-writer.md             (seeded by seedWorkspace)
skills/fb-industry-voice.md
skills/fb-repetition-avoider.md
skills/fb-trend-aware.md
skills/fb-ab-variant.md
memory/fb-performance-history.md     (seeded empty, grows per post)
config/fb-post-settings.json         (cron time, auto-publish toggle, default angle)
logs/fb-posts-log.jsonl              (created lazily)
pending-fb-drafts/                   (created lazily)
pending-insights-checks.json         (created lazily)
```

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

Each cron row shows: name / schedule / status / actions (pause/test/edit/delete for non-system).

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
1. Read both JSON files
2. For entries missing `owner`: infer from `name` prefix (e.g., `zalo_*` → zalo, `fb_*` → facebook, others → system)
3. Write back with owner field
4. Idempotent: if all entries already have owner, no-op

## Wizard + Auth

CEO-owned Meta Developer app, Dev Mode (no App Review needed since CEO is the app admin).

### Wizard Step Flow (added to end of wizard.html flow)

```
Bước 1/6: [Open Meta Developers] button → developers.facebook.com
Bước 2/6: Create App → Type "Business" → Name "9BizClaw-<CEO_name>"
Bước 3/6: Dashboard → Add Product "Facebook Login for Business"
          Paste OAuth redirect URI:
          ┌─ http://localhost:18791/fb-callback ─[Copy]
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

1. `buildAuthUrl(appId, state)` — FB authorize URL with 3 scopes + CSRF state
2. `startCallbackServer()` — temp HTTP server on port 18791, returns `{tokens, ready}` (ready fires after listen succeeds)
3. Callback handler: verify state from `_pendingOauthStates` Map (10-min TTL), extract `code`
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
- `startCallbackServer()` returns `{tokens, ready}` not bare Promise — eliminates listen-vs-openExternal race (pattern fixed in GCal)

### Failure Modes

- Redirect URI mismatch (CEO pasted wrong) → FB error page → wizard shows "Check Step 3 URL matches exactly"
- Revoked token (CEO removed app from their FB) → Dashboard banner "Reconnect FB" + disable FB tab controls
- Missing scope after OAuth (user unchecked permission in consent screen) → error toast + wizard restart prompt

## Daily Generator Pipeline

Cron `fb-draft-generator` fires default 07:30 (configurable via Dashboard → Settings).

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

### Skill Stack (Injected into System Prompt in Order)

| Skill | Responsibility |
|---|---|
| `fb-post-writer` | Hook structure (first 2 lines before "See more"), 80-200 words sweet spot, CTA placement, **NO emojis by default** (override per-task only), conversational VN tone |
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
- Patch handles `callback_query` updates (Telegram sends these when user taps inline button)
- Callback data format: `fb:<action>:<draftId>:<variant?>` (e.g., `fb:publish:2026-04-20:main`)
- Patch forwards callback_query via IPC to main.js (`fb-telegram-callback`)
- main.js checks prefix `fb:` → calls `fb/drafts.js` handler
- `answerCallbackQuery` (ACK) within 1s to prevent Telegram spinner timeout
- After publish: `editMessageText` to "Đã đăng Main lúc 19:00 | Post ID: xxx | Xem: https://fb.com/..."

### Undo Window

60 seconds after publish: edited digest includes inline button `[ Undo ]`:
- Tap within 60s → call Graph API `DELETE /{postId}` + remove from log
- After 60s: button disappears from edited message, no undo possible

### Dashboard FB Tab (Desktop Fallback)

- Cards per draft: full text + image preview + editable textarea + image picker (from `knowledge/san-pham/files/` dropdown or local upload)
- Buttons: "Đăng ngay" / "Lên lịch giờ X" (time picker) / "Bỏ"
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

Chart library: custom SVG or Chart.js (~25KB minified). Don't add large dep.

### Failure Modes

- Post deleted between publish and check: skip, log "post not found", remove from queue
- Rate limit hit: backoff + retry +1h (shift `checkAt`), max 24h retry
- Insights not available yet (<1h after publish): shift `checkAt` +1h
- Scope `pages_read_engagement` revoked: banner "Reconnect FB to enable Performance Loop"

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

### Output-Side Defense (main.js-level)

`interceptFbMarkers()` function runs on every bot reply before send:
- If marker present AND `channel === 'telegram'` AND senderId matches CEO's allowed chat ID → execute
- If marker present BUT wrong channel/sender → drop marker text, audit log, do not execute

Defense-in-depth: input-side + output-side + source-channel validation.

## Failure Modes (Summary Table)

| Scenario | Handling |
|---|---|
| Token revoked/expired | Boot check + weekly cron `fb-token-check`. Invalid → Dashboard banner "Reconnect FB", morning cron skip + Telegram alert 1x/day |
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
[ ] Disconnect FB (revoke token in Meta) → banner appears within 1 boot cycle
[ ] Reconnect flow preserves historic pending-fb-drafts and performance history
```

## Rollout

1. Smoke test `scripts/smoke-test.js` must PASS 100% before `npm run build:win` or `build:mac:*`
2. Manual E2E on 1 Mac (Apple Silicon) + 1 Windows fresh install
3. FB tab disabled in UI if `%APPDATA%/9bizclaw/fb/config.json` missing → CEO opts in via wizard step
4. EXE/DMG distributed via Telegram/Zalo to premium CEOs (existing distribution plan)

## Version

- `package.json` stays at `2.3.48` per user directive
- `AGENTS.md` version stamp bumped `v23 → v24` to trigger `seedWorkspace()` piggyback re-seed of:
  - 5 new skill templates
  - `memory/fb-performance-history.md` (empty seed)
  - `config/fb-post-settings.json` (defaults)
  - Updated `AGENTS.md` with FB-related rules (skill commands, marker neutralization references)
- UI/about: "9BizClaw v2.3.48 — Facebook Update"

## Out of Scope / Phase 2 Candidates

- Messenger inbox customer care (auto-reply, AI triage)
- Comment reply on FB posts
- Personal FB posting via Playwright (brittle, risk of account ban)
- Instagram / WhatsApp cross-posting
- Auto-image generation (DALL-E / Imagen integration)
- Unified content calendar (merge GCal events + FB posts in FullCalendar view)
- Multi-Page support (CEO manages >1 Page — current scope: 1 Page per install)
- Scheduled post (vs post-now) — Graph API supports but adds UI complexity; defer

## Open Questions

None at spec-write time; all key decisions resolved during brainstorming session 2026-04-20.
