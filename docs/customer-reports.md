# Customer Reports

Tracking customer-reported issues. Each entry: date, symptom, root cause, fix, status.

---

## 2026-05-22 — Skill creation broken ("ai cũng báo là đang lỗi hết")

**Reporter:** Multiple customers
**Symptom:** CEO tries to create custom skill via Telegram chat → bot doesn't know how / returns 403 error
**Root cause (2 bugs):**
1. Missing trigger in AGENTS.md Capability Router table — "tạo skill" keywords not routed to skill-builder.md
2. Explicit `headers` in skill-builder.md web_fetch calls may override auto-injected auth → 403
**Fix:** Added skill_builder trigger row to Router + removed explicit headers from 6 POST calls
**Status:** Fixed in v2.4.6 build, pending ship

---

## 2026-05-22 — Zalo "Tắt tất cả" button enables all instead of disabling

**Reporter:** CEO (internal)
**Symptom:** Pressing "Tắt tất cả" in Zalo friends list enables all DMs instead of blocking all
**Root cause:** `toggleAllFriends(false)` set `userAllowlist = []`. inbound.ts treats empty allowlist as "allow ALL" (backwards compat). Empty array = no filter = everyone gets through.
**Fix:** Changed to `userAllowlist = ['__NONE__']` sentinel — non-empty array, no real ID matches, deny-all behavior.
**Status:** Fixed in v2.4.7 build, pending ship

---

## 2026-05-22 — Zalo mode turned ON but bot not responding in groups

**Reporter:** Customer
**Symptom:** Customer turned on Zalo bot mode in Dashboard, but bot does not respond to group messages
**Root cause:** `zalo-group-settings.json` defaults to `__default: { mode: 'off' }`. Groups NOT explicitly in the file are silently dropped (inbound.ts line 985-989). Customer enabled the main toggle but didn't know they need to enable groups separately.
**Fix:** Auto-prompt when enabling Zalo with 0 active groups: "Bật bot cho tất cả N nhóm (chế độ @mention)?" — Yes = `setAllGroupsMode('mention')`. Added to `onZaloEnabledToggle()` in dashboard.html.
**Status:** Fixed in v2.4.7, pending rebuild

---

## 2026-05-22 — Bot leaks internal /approve command to Zalo customer (CRITICAL)

**Reporter:** CEO (observed in live Zalo conversation)
**Symptom:** When customer asks about product, bot replies "Anh duyệt giúp em lệnh này để em đọc đúng tài liệu" and shows `/approve 271048e7 allow-once` with PowerShell `Get-Content` command to read `skills/operations/zalo.md` and `knowledge/san-pham/index.md`. Customer sees internal file paths and approval mechanism.
**Root cause:** Bot uses `exec` tool (PowerShell Get-Content) to read 2 files in one call instead of `read_file`. `exec` requires approval → approval prompt goes to current channel (Zalo customer) instead of CEO. Zalo customer sees `/approve` command + internal file paths.
**Fix (2-layer):**
1. AGENTS.md rule: "CẤM TUYỆT ĐỐI khi đang trả lời Zalo: Bot KHÔNG ĐƯỢC dùng exec tool. Dùng read_file."
2. Output filter Layer L: 4 new patterns catch `/approve`, `allow-once`, `Get-Content`, "duyệt giúp em" — blocked before reaching customer.
**Status:** Fixed in v2.4.7, pending rebuild

---

## 2026-05-22 — Bot cannot summarize today's Zalo conversations (CRITICAL UX)

**Reporter:** CEO (Peter Bui) testing live
**Symptom:** CEO asks "hôm nay em đã nhắn zalo với ai" and "tóm tắt zalo cho anh". Bot replies "chưa thấy phát sinh cuộc nhắn Zalo" despite real Zalo activity today.
**Root cause:** `extractConversationHistory()` in conversation.js can't identify which messages are Zalo vs Telegram. Session JSONL files have no `event.origin` field. Fallback parsing looks for `From:` / `Channel:` format but actual metadata is JSON blocks. All messages get `channel: 'unknown'` → when filtering for `channels: ['modoro-zalo']`, nothing matches → "no Zalo messages found".
**Fix:** Added sender ID format detection in conversation.js: parse `"sender_id": "XXXX"` from metadata JSON blocks. Zalo IDs are 16-19 digits, Telegram IDs are 8-12 digits (per AGENTS.md). Also extracts sender name from `"sender": "..."` pattern. Channel detection now works without needing `event.origin`.
**Status:** Fixed in v2.4.7, pending rebuild
