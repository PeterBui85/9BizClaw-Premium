# Skill Library Dedup — Hybrid Restructure (Approach 1.5)

**Date:** 2026-05-15
**Status:** Approved by user 2026-05-15
**Scope:** Resolve 4 cross-file conflicts in `skills/` without restructuring folders.
**Out of scope:** Folder reorganization (`policy/` + `api/` + `industry/`) — deferred until after Approach 1.5 lands and is verified in production.

## Problem

The shipped skill library has 29 active `.md` files (excluding `_archived/`). Audit on 2026-05-15 revealed 4 cross-file conflicts where the same rule lives in multiple places, so changing it requires N edits and risks N-1 stale copies:

1. **Zalo defense rules vỡ thành 3 file.** `zalo-customer-care.md` (25 situations), `zalo-reply-rules.md` (19 triggers), `zalo-group.md` (group-only rules) all describe "khi nhận tin Zalo thì làm gì". Format rules (≤3 câu, ≤80 từ, Dạ/ạ, no emoji) repeated in all three.
2. **`send-zalo.md` is duplicated inside `telegram-ceo.md`** verbatim — the "GỬI ZALO TỪ TELEGRAM" section of `telegram-ceo.md` reproduces the entire `send-zalo.md` body.
3. **`facebook-image.md` vs `marketing/{facebook,zalo}-post-workflow.md`.** Marketing workflows have frontmatter `replaces: facebook-image.md (phần Facebook|Zalo)` but the original file still exists and is still referenced by INDEX/AGENTS, creating two sources of truth for "post to Facebook" / "post to Zalo".
4. **`google-sheet.md` is a tiny subset of `google-workspace.md`.** Two files, same domain.

Real production impact: the emoji-context-split rule (no emoji for CEO chat / emoji allowed in marketing content) had to be propagated to multiple files yesterday; the customer's bot still got it wrong (screenshot evidence — bot refused emoji in a marketing post).

## Architecture context

Bot loading model (verified by reading `electron/lib/chat.js`, `electron/lib/skill-manager.js`, AGENTS.md):

- **`AGENTS.md`** is always in context (~24KB).
- **Shipped skills under `skills/`** are NOT auto-loaded each turn. AGENTS.md tells bot "Đọc `skills/X` khi vào section Y"; bot reads on demand via `workspace/read` tool.
- **User skills under `user-skills/`** ARE lazy-matched against the rawBody every turn (`matchActiveSkills`) and injected as `<active-user-skills>` block. Independent system; not affected by this refactor unless user-skills `appliesTo` references our renamed paths.

Consequence: rename or delete a shipped skill ⇒ must update every AGENTS.md / INDEX.md / `skill-builder.md` decision-tree reference to its old path, or the bot will try to read a non-existent file and silently degrade.

## Design

Stay inside existing folder structure (`skills/operations/`, `skills/marketing/`, root for industry). Four merges:

### Merge 1: Zalo policy consolidation (3 → 1)

Create `skills/operations/zalo.md` (~7KB) combining the three Zalo behavior files. Layout:

1. Phạm vi bot (làm gì / không làm gì) ← `zalo-customer-care`
2. Phòng thủ (table 19 trigger — keep zalo-reply-rules' newer + tighter "BẮT BUỘC" escalation keywords) ← `zalo-reply-rules`
3. Format tin (≤3 câu, ≤80 từ, Dạ/ạ, no emoji) ← `zalo-reply-rules`
4. Giọng văn / NHẦM GIỚI TÍNH / NGOÀI GIỜ / ẢNH / OVER-APOLOGIZE ← `zalo-reply-rules`
5. Nhóm Zalo (3 chế độ, @mention, bot detection 6 tín hiệu) ← `zalo-group`
6. First greeting idempotent (write-then-send) ← `zalo-group`
7. Rate limit nhóm ← `zalo-group`
8. Memory khách hàng (frontmatter, append, trim) ← `zalo-customer-care`
9. Khách quay lại (first / >7 ngày / >30 ngày) ← `zalo-customer-care`
10. Khiếu nại + escalate (BẮT BUỘC keyword cho detector) ← `zalo-reply-rules`
11. Checklist mỗi reply ← `zalo-reply-rules`

Delete `zalo-customer-care.md`, `zalo-reply-rules.md`, `zalo-group.md`.

**Conflict resolution rule:** when same concept exists in 2+ source files, keep the more recent / more strict version. `zalo-reply-rules` is the canonical source for format + defense; `zalo-customer-care` is canonical for memory + scope; `zalo-group` is canonical for group-specific (modes + first greeting + bot detection + rate limit).

### Merge 2: Drop `send-zalo.md`

`telegram-ceo.md` lines 29-50 already contain the full content of `send-zalo.md`. Delete `send-zalo.md`. Update routing tables to point to `telegram-ceo.md`.

### Merge 3: `facebook-image.md` → `image-generation.md`

Rename and trim. New file name reflects what it actually does (image gen + brand assets), no longer hints at Facebook-specific posting (that lives in `marketing/facebook-post-workflow.md`).

- Rename file
- Strip lines 88-89 (pointers to marketing/) — INDEX.md covers this
- Keep image-gen API + brand-assets API + image-skill creation flow

### Merge 4: `google-sheet.md` → `google-workspace.md`

Add a section "Đọc Google Sheet công khai (không cần OAuth, dùng CSV endpoint)" to `google-workspace.md`. Delete `google-sheet.md`.

## Reference updates required

| File | Lines |
|---|---|
| `AGENTS.md` | 5 path renames (zalo-reply-rules → zalo, facebook-image → image-generation, send-zalo → telegram-ceo, google-sheet pointer removed if any) |
| `skills/INDEX.md` | 5 row edits (3 zalo rows → 1, send-zalo row removed, facebook-image renamed, google-sheet row removed) |
| `skills/operations/skill-builder.md` | 4 decision-tree row updates (3 zalo paths → 1, facebook-image → image-generation) |
| User-skills `_registry.json` `appliesTo` | Migration on read in `_sanitizeRegistry`: map `operations/zalo-reply-rules|zalo-customer-care|zalo-group` → `operations/zalo`, `operations/facebook-image` → `operations/image-generation`. Production may have entries. |

## Net change

- 29 active `.md` files → 24
- ~5KB dedup
- 4 cross-file conflicts resolved
- Folder structure unchanged
- Total touchpoints: ~22 (much smaller than full restructure ~65)

## Verification

1. After every merge: `grep -rn "<old path>" --include='*.md'` returns 0 (no stale references)
2. Smoke test: `npm run smoke` must pass (it checks AGENTS.md key rules)
3. Manual: send 2 sample CEO Telegram messages exercising "Zalo reply" and "send-zalo from telegram" flows, verify bot reads the correct merged file (check by observing tool calls)

## Risks

- AGENTS.md edit miss → bot reads non-existent skill file → degraded reply silently. Mitigation: grep-verify after edits.
- User-skills `appliesTo` migration: write the migration in `_sanitizeRegistry` so it happens automatically on next registry read.
- `zalo.md` becomes the single largest operations skill (~7KB). Still under the 10KB content limit for skill files.

## Follow-up (Approach 2, deferred)

After Approach 1.5 is verified in production for a few days and no breakage observed, evaluate whether the 3-zone folder restructure (`policy/` + `api/` + `industry/`) is worth ~50 additional path renames. Decision deferred to the user.
