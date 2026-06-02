# Plan v2.4.11 — Brand Assets, Product Images, Premium Onboarding

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Spawn parallel subagents for independent chunks.

**Spec:** `docs/superpowers/specs/2026-06-01-v2411-brand-assets-product-images-onboarding-design.md`

**Goal:** 3 features: (A) brand assets auto-description + image-gen suggestion, (B) product images batch upload + vision siêu kỹ + safe search, (C) Premium onboarding 7 ngày.

**Architecture:** Reuse existing `media-assets/index.json` model; add `type=brand` for brand assets, `type=product` for product images. Vision `describeMediaAsset()` split by type. Onboarding state stored in workspace config.

---

## Phase 1 — UI: Batch Upload + Copy Change + Brand Assets Tab

### Task 1: Dashboard copy change + batch upload modal

**Files:** `electron/ui/dashboard.html`

- [ ] Change tab "Hình sản phẩm cho Zalo" → "Hình ảnh sản phẩm"
- [ ] Change sub-label: "Ảnh public để bot tự tìm và gửi đúng hình khi khách hỏi (Zalo/WhatsApp/Telegram...)"
- [ ] Change button: "Upload sản phẩm" → "Upload"
- [ ] Implement batch upload flow:
  1. File picker allows multi-select
  2. Modal opens: "Tags chung (tùy chọn)", "Tên gọi khác / aliases (tùy chọn)", "SKU prefix (tùy chọn)"
  3. Upload each file: call existing `upload-media-asset` IPC with batch tags merged per file
  4. Show progress per file
  5. Grid updates when all done

### Task 2: Brand Assets tab (new)

**Files:** `electron/ui/dashboard.html`, `electron/preload.js`, `electron/lib/dashboard-ipc.js`

- [ ] Add "Tài sản thương hiệu" tab in Dashboard
- [ ] Show list: title, preview, status (needs_review/ready)
- [ ] Upload flow: save to `brand-assets/` + register media-asset with `type=brand`, `visibility=internal`
- [ ] Trigger async vision on upload (brand-specific prompt)
- [ ] IPC handlers needed:
  - `list-brand-assets` — return all `type=brand` from media-assets index
  - `upload-brand-asset` — save + register
  - `describe-brand-asset` — trigger vision re-description
  - `suggest-brand-assets-for-prompt` — given a user prompt, return top matching brand assets with reasons
  - `delete-brand-asset` — remove from index + file

---

## Phase 2 — Backend: Vision Prompts + Search Safety

### Task 3: Split vision prompts by type

**Files:** `electron/lib/media-library.js`

- [ ] `describeMediaAsset(assetId)` — detect `type`:
  - `brand`: "Mô tả tài sản thương hiệu này để làm REFERENCE khi tạo ảnh: màu sắc chính, typography, bố cục, phong cách, đặc điểm nhận diện. Không bịa thông tin."
  - `product`: "Mô tả SẢN PHẨM này rất chi tiết: đặc tính kỹ thuật, giá nhìn thấy trên ảnh, màu sắc, biến thể, bao bì, góc chụp, đối tượng hỏi (ai mua?), và VIẾT 3-5 CỤM TỪ mà khách hàng hay dùng để hỏi về sản phẩm này."
  - `knowledge_image`: lightweight description only
- [ ] Auto-generate `tags`/`aliases` from description (simple keyword extraction: lowercase, remove stop words, deduplicate)

### Task 4: Enforce brand assets never in customer send path

**Files:** `electron/lib/media-library.js`, `electron/lib/channels.js` (or wherever Zalo/WhatsApp image send happens)

- [ ] `searchMediaAssets(query, { scope: 'customer' })` — explicitly filter `type=product` and `type=knowledge_image` only. Never return `type=brand`.
- [ ] Any `/api/zalo/send-media` with `assetQuery` parameter: ensure `type=brand` results are silently dropped from results.
- [ ] Any "send image by keyword" flow: add explicit `type IN ('product', 'knowledge_image')` filter.
- [ ] Add unit test: query "logo" from customer scope → empty result.

### Task 5: Match confidence + disambiguation

**Files:** `electron/lib/media-library.js`, bot agent (inbound patch)

- [ ] Scoring: match on `tags` (exact/partial) + `description` (semantic). Score = weighted sum.
- [ ] Threshold: if score < 0.4 → no auto-send
- [ ] If 0.4 ≤ score < 0.7 → ask 1 clarifying question
- [ ] If score ≥ 0.7 → send top 5 results
- [ ] If score = 0 → text reply + "có thể chuyển sếp"

---

## Phase 3 — Premium Onboarding 7 Ngày

### Task 6: Onboarding state tracking

**Files:** `electron/lib/dashboard-ipc.js`, workspace config

- [ ] When wizard setup completes: write `premiumOnboarding.startedAt = now()` to workspace config
- [ ] API: `GET /api/onboarding/status` → returns `{ day, title, body, cta, dismissed }`
- [ ] API: `POST /api/onboarding/dismiss` → set `dismissed: true`
- [ ] API: `POST /api/onboarding/advance` → advance to next day

### Task 7: Dashboard card

**Files:** `electron/ui/dashboard.html`

- [ ] On Overview tab: show "Premium — Ngày N/7" card when `premiumOnboarding.startedAt` is set and not dismissed
- [ ] Card shows: day title, description, CTA button
- [ ] CTA links to relevant Dashboard section or triggers a Telegram hint
- [ ] Card dismissible

### Task 8: Telegram nudge logic

**Files:** `electron/lib/cron-api.js` or new `electron/lib/premium-onboarding.js`

- [ ] Daily cron check: if today is day N and Telegram channel is connected, send nudge
- [ ] Nudge format: very short (1-2 sentences) + CTA keyword
- [ ] Semi-personalization: read workspace state (has product images? has knowledge? channels connected?) → inject context into day content
- [ ] Throttle: only 1 nudge per day, track last sent in workspace config

### Task 9: 7-Day Content Framework

**Files:** `electron/lib/premium-onboarding.js` (or inline in cron)

- [ ] Define 7-day content template:
  - Day 1: Bot live intro + what it can do
  - Day 2: Try drafting a Facebook post
  - Day 3: Upload product knowledge
  - Day 4: Set morning cron report
  - Day 5: Create marketing plan
  - Day 6: Generate a price list slide
  - Day 7: Unlock advanced features
- [ ] Each day: title, body (1-2 sentences), CTA keyword, Dashboard link

---

## Phase 4 — Integration + Verification

### Task 10: System map regen

- [ ] Run `node scripts/generate-system-map.js`
- [ ] Commit changed `docs/generated/system-map.*`

### Task 11: Smoke test

- [ ] Run `npm run smoke` — all tests must pass

---

## Chunk Assignment (for subagent parallelization)

| Subagent | Tasks |
|---|---|
| **Agent A** — UI | Tasks 1, 2, 7 |
| **Agent B** — Vision + Search | Tasks 3, 4, 5 |
| **Agent C** — Onboarding | Tasks 6, 8, 9 |

After all agents complete: Task 10 → Task 11 → report to CEO.
