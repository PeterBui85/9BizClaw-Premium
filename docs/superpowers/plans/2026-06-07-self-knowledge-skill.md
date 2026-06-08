# Self-knowledge Skill Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the bot a truthful self-model so it answers the Premium CEO accurately about 9BizClaw's own capabilities, identity, and limits.

**Architecture:** One hand-written, trigger-matched Vietnamese skill file (`skills/operations/gioi-thieu.md`) at the 5-category/value altitude that points to `skills/INDEX.md` for the exhaustive list. Plus small wiring: category map entry, INDEX row + counts, an AGENTS.md routing pointer, and a lockstep version bump so it reaches installs.

**Tech Stack:** Markdown skill docs; `electron/lib/skill-manager.js` (category map); `electron/lib/workspace.js` (version constant); `electron/scripts/smoke-skill-runtime.js` (build gate).

**Spec:** `docs/superpowers/specs/2026-06-07-self-knowledge-skill-design.md`

**Commit policy:** Per the CEO's standing rule, do NOT commit per-task. Do all edits, verify, then a SINGLE commit only when the CEO says go (Task 6).

---

## Chunk 1: Skill content + wiring

### Task 1: Create the self-knowledge skill file

**Files:**
- Create: `skills/operations/gioi-thieu.md`

- [ ] **Step 1: Write the skill content**

Full Vietnamese diacritics, no emojis, no `\uXXXX` escapes. Content:

```markdown
# Giới thiệu 9BizClaw — Em là ai, em làm được gì

> Đọc skill này khi CEO hỏi về chính trợ lý/sản phẩm: "9BizClaw là gì", "em là ai",
> "em/bạn làm được gì", "giới thiệu", "có tính năng gì", "hướng dẫn dùng", "bắt đầu từ đâu".
> Nguyên tắc: nói ĐÚNG những gì em làm được, có ví dụ, có cách dùng. KHÔNG hứa tính năng không có.

## 1. Em là ai
9BizClaw là trợ lý AI dành cho chủ doanh nghiệp Việt. Em chạy như một ứng dụng trên máy của
anh/chị. Anh/chị điều khiển em qua Telegram; em thay anh/chị chăm sóc khách trên Zalo và đăng
bài Facebook. Em do đội ngũ MODORO phát triển, dành riêng cho các anh chị Premium.

## 2. Em làm được gì
Em chia việc thành 5 nhóm. Đây là phần tinh gọn — danh sách đầy đủ ở `skills/INDEX.md`.

- **Marketing** — viết bài bán hàng, tạo ảnh AI, đăng Zalo/Facebook.
  Ví dụ: "viết bài bán combo sáng rồi tạo ảnh đăng nhóm Zalo".
- **Sale** — kịch bản bán hàng, xử lý từ chối, soạn báo giá xuất file Word.
  Ví dụ: "soạn báo giá 50 thùng nước cho khách A".
- **CSKH** — trực Zalo trả lời khách, theo dõi khách chưa phản hồi, tổng hợp khách ra Google Sheet.
  Ví dụ: "tổng hợp khách Zalo hôm nay ra Sheet".
- **Vận hành** — lịch tự động, công nợ, thu chi, báo cáo ngày, tạo file Word/Excel/PDF/PowerPoint.
  Ví dụ: "8h sáng mỗi ngày gửi báo cáo doanh thu cho anh".
- **Hệ Thống** — quản lý kênh, bộ nhớ, Google Workspace (Gmail/Calendar/Drive), tạo skill riêng.
  Ví dụ: "tạo skill chốt đơn theo cách của shop em".

Muốn xem hết: bảo em "liệt kê tất cả tính năng" — em mở `skills/INDEX.md`.

## 3. Cách dùng
Chỉ cần nhắn yêu cầu tự nhiên qua Telegram, em tự chọn đúng kỹ năng và làm. Không cần lệnh,
không cần nhớ cú pháp. Ví dụ:
- "Viết 3 bài đăng Facebook bán món mới."
- "Nhắc anh 17h gửi tin khuyến mãi cho nhóm khách VIP."
- "Khách hỏi giá đổ sỉ thì trả lời sao?"
- "Báo cáo hôm nay thế nào?"

## 4. Em CHƯA làm được gì (nói thật để anh/chị không kỳ vọng sai)
- Em không tự gọi điện thoại cho khách.
- Em không phải phần mềm kế toán hay CRM đầy đủ — em ghi chép gọn và xuất Sheet, không thay sổ sách chuyên sâu.
- Zalo và Facebook chạy trong giới hạn của nền tảng (Zalo cần đăng nhập, Facebook theo quyền trang).
- Em không tự cập nhật phiên bản hay build ứng dụng — việc đó do MODORO làm.
- Em chỉ thao tác trong phạm vi anh/chị đã cấp; việc ngoài phạm vi em báo lại, không tự làm liều.

## 5. Khi anh/chị hỏi về em
- Trả lời cụ thể: việc làm được + một ví dụ + câu để kích hoạt.
- Không chắc có tính năng nào đó thì nói "hiện chưa có" thay vì đoán.
- Không phóng đại. Thà nói ít mà đúng.
```

- [ ] **Step 2: Verify the file has correct diacritics and no escapes**

Run: `node -e "const s=require('fs').readFileSync('skills/operations/gioi-thieu.md','utf8'); if(/\\\\u[0-9a-fA-F]{4}/.test(s)) throw new Error('unicode escape found'); console.log('ok, '+s.length+' chars')"`
Expected: `ok, <N> chars` (no throw).

---

### Task 2: Wire the skill into the category map

**Files:**
- Modify: `electron/lib/skill-manager.js` (the `SKILL_CATEGORY` object, Hệ Thống block ~line 1094-1107)

- [ ] **Step 1: Add the category entry**

In the `// Hệ Thống` block of `SKILL_CATEGORY`, add a line (keep alongside the other `operations/*` Hệ Thống entries):

```javascript
  'operations/gioi-thieu': 'Hệ Thống',
```

- [ ] **Step 2: Verify the category entry landed** (the map is module-private, so assert on file content)

Run: `node -e "const s=require('fs').readFileSync('electron/lib/skill-manager.js','utf8'); if(!s.includes(\"'operations/gioi-thieu': 'Hệ Thống'\")) throw new Error('entry missing'); console.log('category entry ok')"`
Expected: `category entry ok`.

---

### Task 3: Add the INDEX.md row and update counts

**Files:**
- Modify: `skills/INDEX.md` (Hệ Thống table; section header count; footer total)

- [ ] **Step 1: Add the table row** under the Hệ Thống table (`## Hệ Thống`), e.g. right after the "Kênh CEO Telegram" row:

```markdown
| Giới thiệu 9BizClaw | `operations/gioi-thieu.md` | CEO hỏi "9BizClaw là gì", "em làm được gì", "giới thiệu", "có tính năng gì" — bot tự mô tả đúng năng lực, danh tính, giới hạn |
```

- [ ] **Step 2: Update the section header count** — change `## Hệ Thống (9 skills)` to `## Hệ Thống (10 skills)`.

- [ ] **Step 3: Update the footer total** — change `**Tổng: 40 skill cơ bản (5 nhóm)...` to `**Tổng: 41 skill cơ bản (5 nhóm)...`, keeping the surrounding prose consistent.

- [ ] **Step 4: Verify counts are consistent**

Run: `node -e "const s=require('fs').readFileSync('skills/INDEX.md','utf8'); if(!s.includes('Hệ Thống (10 skills)')||!s.includes('Tổng: 41')) throw new Error('counts not updated'); if(!s.includes('operations/gioi-thieu.md')) throw new Error('row missing'); console.log('INDEX ok')"`
Expected: `INDEX ok`.

---

### Task 4: Add the AGENTS.md routing pointer

**Files:**
- Modify: `AGENTS.md` (under `## Thư viện kỹ năng — BẮT BUỘC`, ~line 387)

- [ ] **Step 1: Add a one-line pointer** so self-questions reliably route to the skill. After the "Skill thực tế..." line, add:

```markdown
**CEO hỏi về chính em/9BizClaw** ("là gì", "làm được gì", "giới thiệu", "có tính năng gì") → đọc `skills/operations/gioi-thieu.md`. Nói đúng năng lực thật, KHÔNG hứa tính năng không có.
```

- [ ] **Step 2: Verify the pointer landed**

Run: `node -e "const s=require('fs').readFileSync('AGENTS.md','utf8'); if(!s.includes('operations/gioi-thieu.md')) throw new Error('pointer missing'); console.log('AGENTS pointer ok')"`
Expected: `AGENTS pointer ok`.

---

### Task 5: Bump the AGENTS.md version in lockstep (build gate)

**Files:**
- Modify: `electron/lib/workspace.js:36` (`CURRENT_AGENTS_MD_VERSION`)
- Modify: `AGENTS.md:1` (`modoroclaw-agents-version:` stamp)

> Both MUST move together to the SAME number, or `smoke-skill-runtime.js:228-234` fails the build. Do NOT touch `electron/tests/workspace.test.js:84` (self-referential `110`).

- [ ] **Step 1: Bump the constant** — `electron/lib/workspace.js:36` from `const CURRENT_AGENTS_MD_VERSION = 117;` to `= 118;`.

- [ ] **Step 2: Bump the AGENTS.md stamp** — `AGENTS.md` line 1 from `<!-- modoroclaw-agents-version: 117 -->` to `118`.

- [ ] **Step 3: Verify they match**

Run: `node -e "const fs=require('fs'); const v=fs.readFileSync('electron/lib/workspace.js','utf8').match(/CURRENT_AGENTS_MD_VERSION = (\d+)/)[1]; const a=fs.readFileSync('AGENTS.md','utf8').match(/modoroclaw-agents-version:\s*(\d+)/)[1]; if(v!==a) throw new Error('mismatch '+v+' vs '+a); console.log('versions match: '+v)"`
Expected: `versions match: 118`.

---

### Task 6: Verify end-to-end, then commit (gated on CEO go-ahead)

**Files:** none (verification + commit)

- [ ] **Step 1: Run the skill-runtime smoke test** (the build gate that checks the version sync + skill listing)

Run: `node electron/scripts/smoke-skill-runtime.js`
Expected: passes (no version-mismatch error; `operations/gioi-thieu` present).

- [ ] **Step 2: (Optional, if a workspace is seeded) confirm the skill lists under Hệ Thống** via the dashboard skill list or `listShippedSkills()` output — Hệ Thống shows 10 skills including "Giới thiệu 9BizClaw".

- [ ] **Step 3: Manual smoke via the Telegram CEO test bot** (NODE_ENV=test guard; Python 3.12). Ask "9bizclaw làm được gì?" and confirm the reply is concrete, bounded (no invented features), and includes how-to triggers.

Run: `python scripts/telegram-test-user.py "9bizclaw làm được gì?" --timeout 90 --idle-timeout 300`
Expected: a reply matching the 5-part self-model; first inbound after boot may be slow (cold start).

- [ ] **Step 4: Commit — ONLY after the CEO says go.** Single batched commit:

```bash
git add skills/operations/gioi-thieu.md skills/INDEX.md electron/lib/skill-manager.js AGENTS.md electron/lib/workspace.js docs/superpowers/specs/2026-06-07-self-knowledge-skill-design.md docs/superpowers/plans/2026-06-07-self-knowledge-skill.md
git commit -m "feat: self-knowledge skill so the bot describes 9BizClaw truthfully"
```

---

## Notes
- This is documentation/content, so there is no unit-test-first cycle; verification is the smoke test + the manual bot check.
- HARD maintenance rule (in Claude memory, `feedback_update_self_knowledge_skill.md`): any future feature change must update `gioi-thieu.md` in the same batch and bump the version in lockstep.
