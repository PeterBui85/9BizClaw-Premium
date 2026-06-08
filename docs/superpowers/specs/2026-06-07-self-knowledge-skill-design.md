# Self-knowledge skill for 9BizClaw — design

**Date:** 2026-06-07
**Status:** Approved (brainstorming) → ready for implementation plan

## Problem

When the Premium CEO asks the bot about itself on Telegram ("9BizClaw làm được gì?", "em là ai?", "giới thiệu"), there is no skill describing 9BizClaw's own product. The bot improvises from scattered AGENTS.md context, producing four failure modes:

1. **Overpromises** — claims features that don't exist / exaggerates → erodes trust when the CEO tries it and it fails.
2. **Undersells / forgets** — doesn't know its own full feature set → the CEO never discovers capabilities they pay for.
3. **Vague / generic** — fluffy "I'm an AI assistant" answers instead of concrete "đây là việc em làm được, đây là cách dùng".
4. **No how-to bridge** — even when a feature is named, the exact trigger phrase isn't given.

## Goal

A single, hand-written, trigger-matched skill that is the bot's **truest self-model**: accurate, complete at the right altitude, concrete, action-bridged, and honestly bounded — so the bot answers the Premium CEO truthfully about its own capabilities, identity, and limits.

## Audience

The **Premium CEO on Telegram** only. Not prospects (no sales pitch), not Zalo end-customers.

## Scope

Capabilities + product identity + explicit limits (the most complete self-model).

## Non-goals (anti-features — deliberately left out)

- **No exhaustive 40-skill list** — that is `skills/INDEX.md`'s job. This skill stays at the 5-category/value altitude and points to INDEX.md as the live source of truth. Prevents duplication and drift.
- **No pricing / sales pitch** — audience is the existing Premium CEO, not prospects.
- **No always-on injection** — read on-demand only, to respect the AGENTS.md ~40K budget.
- **No auto-generation / build step** — kept as a plain hand-written doc; freshness is enforced by a Claude-memory HARD rule (see Maintenance).

## Design

### File & wiring

- **New skill:** `skills/operations/gioi-thieu.md` (title "Giới thiệu 9BizClaw").
- **Category:** Hệ Thống. Add `'operations/gioi-thieu': 'Hệ Thống'` to the `SKILL_CATEGORY` map in `electron/lib/skill-manager.js`.
- **Index:** add one row to the Hệ Thống table in `skills/INDEX.md`.
- **Routing:** one line in `AGENTS.md` so self-questions match this skill.
- **Deploy reach (also a build gate):** bump `CURRENT_AGENTS_MD_VERSION` in `electron/lib/workspace.js:36` (currently 117) AND the `modoroclaw-agents-version:` stamp on `AGENTS.md` line 1 — both together. `electron/scripts/smoke-skill-runtime.js:228-234` fails the build if the two diverge, so this is mandatory, not optional. (`electron/tests/workspace.test.js:84` hardcodes a self-referential `110` — leave it alone.)
- **Trigger:** read on-demand (NOT shipped/always-injected), like other `operations/*` skills.

### Trigger phrases (CEO Telegram)

"9bizclaw là gì", "em là ai", "em/bạn làm được gì", "giới thiệu", "có những tính năng gì", "hướng dẫn dùng", "bắt đầu từ đâu", "trợ lý này làm gì".

### Content — five parts (ordered to fix the four failure modes)

1. **Tôi là ai** (identity, stable) — 9BizClaw là trợ lý AI cho CEO doanh nghiệp Việt; app desktop; CEO điều khiển qua Telegram, bot phục vụ khách qua Zalo + Facebook; do MODORO làm; mô hình Premium.
2. **Tôi làm được gì** (capabilities, *category-level*) — the 5 groups (Hệ Thống, Marketing, Sale, CSKH, Vận hành); each: 1-line value + 1–2 flagship real examples + the trigger phrase. Ends with *"danh sách đầy đủ ở `skills/INDEX.md`"*.
3. **Cách dùng** (how-to bridge) — chat-first: chỉ cần nhắn yêu cầu tự nhiên qua Telegram, bot tự chọn skill. 3–4 concrete example phrases.
4. **Tôi CHƯA làm được gì** (hard limits — stops overpromising) — honest bounds: không tự gọi điện khách; không phải CRM/phần mềm kế toán đầy đủ; Zalo/FB giới hạn theo nền tảng; không tự build/đổi version; chỉ thao tác trong phạm vi được cấp.
5. **Quy tắc khi CEO hỏi về em** — trả lời cụ thể + ví dụ + trigger; KHÔNG bịa tính năng; không chắc → nói "hiện chưa có" thay vì đoán.

### Style constraints (per project rules)

- Vietnamese with full diacritics, never `\uXXXX` escapes.
- No emojis in CEO-facing text (premium aesthetic).
- Xưng hô follows IDENTITY.md (channel = Telegram, CEO).

## Maintenance / source of truth

- Capabilities stay at category level → most feature changes need no edit; INDEX.md carries the exhaustive live list.
- A change to a **capability area** needs a touch; a change to a **hard limit** ALWAYS needs an edit.
- HARD memory rule (`feedback_update_self_knowledge_skill.md`): every new/changed/removed feature MUST update this self-model skill in the same batch, with the version bump so it reaches installs.

## Testing / verification

- Add the skill to the customer-memory / skill checks if applicable (e.g. `electron/scripts/check-*`), or at minimum verify `skill-manager.js` lists `operations/gioi-thieu` under Hệ Thống and that INDEX.md totals are updated.
- Manual: from the Telegram CEO test bot, send "9bizclaw làm được gì?" and confirm the reply is concrete, bounded (no invented features), and includes how-to triggers.

## Affected files

- `skills/operations/gioi-thieu.md` (new)
- `skills/INDEX.md` (Hệ Thống row; header count 9→10; footer "Tổng: 40 → 41" + keep prose consistent)
- `electron/lib/skill-manager.js` (`SKILL_CATEGORY` entry)
- `AGENTS.md` (routing line + bump `modoroclaw-agents-version:` stamp on line 1)
- `electron/lib/workspace.js:36` (bump `CURRENT_AGENTS_MD_VERSION`, in lockstep with the AGENTS.md stamp)
