# Skill Dedup Hybrid — Implementation Plan

**Goal:** Execute the design in `docs/superpowers/specs/2026-05-15-skill-dedup-hybrid-design.md` — collapse 4 cross-file skill conflicts into single sources of truth without changing folder structure.

**Tech:** Just `.md` files + a 5-line migration in `electron/lib/skill-manager.js` for user-skills `appliesTo`.

---

## Task 1: Build merged `zalo.md`

**Files:**
- Create: `skills/operations/zalo.md`
- Source-merge from: `zalo-customer-care.md`, `zalo-reply-rules.md`, `zalo-group.md`

- [ ] Step 1: Read all 3 source files (already done in brainstorming; have full content in context)
- [ ] Step 2: Write `zalo.md` with this section order:
  1. Phạm vi bot (làm gì / không) — from zalo-customer-care
  2. Phòng thủ (table 19 trigger) — from zalo-reply-rules
  3. Format tin (≤3 câu, ≤80 từ, Dạ/ạ, no emoji) — from zalo-reply-rules
  4. Giọng văn (Dạ/ạ chính xác, nhầm giới tính, ngoài giờ, ảnh, over-apologize) — from zalo-reply-rules
  5. CONFIRM ĐƠN/GIÁ/LỊCH — CẤM TRÊN ZALO — from zalo-reply-rules
  6. Nhóm Zalo (3 mode, @mention, bot detection 6 tín hiệu) — from zalo-group
  7. First greeting idempotent (write-then-send) — from zalo-group
  8. Rate limit nhóm — from zalo-group
  9. Memory khách hàng — from zalo-customer-care
  10. Khách quay lại (first / >7d / >30d) — from zalo-customer-care
  11. Khiếu nại + escalate (BẮT BUỘC keyword) — from zalo-reply-rules
  12. Checklist mỗi reply — from zalo-reply-rules
- [ ] Step 3: Delete `zalo-customer-care.md`, `zalo-reply-rules.md`, `zalo-group.md`
- [ ] Step 4: Verify: `ls skills/operations/zalo*` shows only `zalo.md`

## Task 2: Drop `send-zalo.md`

- [ ] Step 1: Verify `telegram-ceo.md` still has the "GỬI ZALO TỪ TELEGRAM" section with group + individual flows
- [ ] Step 2: `rm skills/operations/send-zalo.md`

## Task 3: Rename `facebook-image.md` → `image-generation.md`

- [ ] Step 1: Read `facebook-image.md`
- [ ] Step 2: Rewrite as `image-generation.md` — same content minus lines 88-89 pointers; update title/heading from "Facebook + Tạo ảnh + Tài sản thương hiệu" → "Tạo ảnh + Tài sản thương hiệu"
- [ ] Step 3: Delete `facebook-image.md`

## Task 4: Merge `google-sheet.md` → `google-workspace.md`

- [ ] Step 1: Read `google-sheet.md` content
- [ ] Step 2: Append a "## Đọc Google Sheet công khai (không cần OAuth)" section to `google-workspace.md` carrying the public CSV pattern
- [ ] Step 3: Delete `google-sheet.md`

## Task 5: Update `AGENTS.md` path references

- [ ] Step 1: Find all references to deleted/renamed paths:
  ```
  grep -n -E "skills/operations/(zalo-(customer-care|reply-rules|group)|send-zalo|facebook-image|google-sheet)" AGENTS.md
  ```
- [ ] Step 2: Apply renames:
  - `operations/zalo-customer-care.md` → `operations/zalo.md`
  - `operations/zalo-reply-rules.md` → `operations/zalo.md`
  - `operations/zalo-group.md` → `operations/zalo.md`
  - `operations/facebook-image.md` → `operations/image-generation.md`
  - `operations/send-zalo.md` row in routing table → point to `operations/telegram-ceo.md`
- [ ] Step 3: Re-grep to confirm 0 stale references

## Task 6: Rewrite `INDEX.md`

- [ ] Step 1: In the "Vận hành bot" table, collapse 3 Zalo rows into 1: `| Zalo (CSKH + nhóm + reply rules) | zalo.md | ... |`
- [ ] Step 2: Remove row `Gửi tin Zalo | send-zalo.md` (covered by telegram-ceo row)
- [ ] Step 3: Rename row `Facebook + Tạo ảnh | facebook-image.md` → `Tạo ảnh + Brand assets | image-generation.md`
- [ ] Step 4: Remove row `Đọc Google Sheet (public) | google-sheet.md` (covered by google-workspace row)
- [ ] Step 5: Update count line `Vận hành bot (18 skills)` → 14
- [ ] Step 6: Update footer `Tổng: 29 skill cơ bản` → `Tổng: 24 skill cơ bản`

## Task 7: Update `skill-builder.md` decision tree

Decision tree rows that point to renamed/deleted skills:

- [ ] Update "khi khách Zalo hỏi..." → `operations/zalo` (was `operations/zalo-reply-rules`)
- [ ] Update "khi chăm sóc khách Zalo" → `operations/zalo` (was `operations/zalo-customer-care`)
- [ ] Update "khi tạo ảnh" → `operations/image-generation` (was `operations/facebook-image`)
- [ ] Remove or merge the row for "khi nhắn Zalo từ chat CEO" if it points to `send-zalo`
- [ ] Also update line 97 example `["operations/zalo-reply-rules"]` → `["operations/zalo"]`

## Task 8: Migrate user-skills `appliesTo` paths in `_sanitizeRegistry`

**Files:**
- Modify: `electron/lib/skill-manager.js` (function `_sanitizeRegistry`)

- [ ] Step 1: Add `_APPLIESTO_PATH_MIGRATIONS` constant near top of file:

```js
// 2026-05-15: skill consolidation — old appliesTo references map to new paths.
// Read-time migration so existing user-skills don't break silently.
const _APPLIESTO_PATH_MIGRATIONS = {
  'operations/zalo-reply-rules': 'operations/zalo',
  'operations/zalo-customer-care': 'operations/zalo',
  'operations/zalo-group': 'operations/zalo',
  'operations/facebook-image': 'operations/image-generation',
  'operations/send-zalo': 'operations/telegram-ceo',
  'operations/google-sheet': 'operations/google-workspace',
};
```

- [ ] Step 2: In the `appliesTo` filter line of `_sanitizeRegistry`, apply the map:
```js
appliesTo: Array.isArray(s.appliesTo)
  ? s.appliesTo
      .filter(x => typeof x === 'string')
      .map(x => _APPLIESTO_PATH_MIGRATIONS[x] || x)
  : [],
```
- [ ] Step 3: Dedupe the resulting array (multiple old refs may all map to `operations/zalo`):
```js
.map(x => _APPLIESTO_PATH_MIGRATIONS[x] || x)
.filter((x, i, arr) => arr.indexOf(x) === i),
```

## Task 9: Smoke + grep audit

- [ ] Step 1: `npm run smoke` (must pass)
- [ ] Step 2: Final grep — these should all return 0 outside `_archived/` and the spec/plan docs:
  ```
  grep -rn "operations/zalo-customer-care" --include='*.md' . | grep -v _archived | grep -v docs/superpowers
  grep -rn "operations/zalo-reply-rules" --include='*.md' . | grep -v _archived | grep -v docs/superpowers
  grep -rn "operations/zalo-group" --include='*.md' . | grep -v _archived | grep -v docs/superpowers
  grep -rn "operations/send-zalo" --include='*.md' . | grep -v _archived | grep -v docs/superpowers
  grep -rn "operations/facebook-image" --include='*.md' . | grep -v _archived | grep -v docs/superpowers
  grep -rn "operations/google-sheet" --include='*.md' . | grep -v _archived | grep -v docs/superpowers
  ```
- [ ] Step 3: `npm run map:generate` (regenerate system-map.json after .js change)

## Commit (when user says ship)

Don't commit until user explicitly says. Per `feedback_dont_build_without_asking`.
