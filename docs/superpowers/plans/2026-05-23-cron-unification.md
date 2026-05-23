# Cron Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unban `cron` tool, rewrite all instruction paths to use it instead of old Cron API, extend `loadCustomCrons()` to parse `delivery` field, ship migration skill.

**Architecture:** Phase 1 (Tasks 1-4) moves `cron` to REQUIRED_TOOLS, updates smoke test, rewrites 6 skill/instruction files. Phase 2 (Tasks 5-6) extends cron.js to parse delivery info from jobs.json, then ships a migration skill. All work on branch `2.5.0`.

**Tech Stack:** Node.js, Electron main process, Markdown skill files, node-cron

**Spec:** `docs/superpowers/specs/2026-05-23-cron-unification-design.md`

**Branch:** `2.5.0` (already created)

---

## Chunk 1: Phase 1 — Unban `cron` tool + instruction path rewrite

### Task 1: Move `cron` from BANNED_TOOLS to REQUIRED_TOOLS

**Files:**
- Modify: `electron/lib/config.js:760-771`

- [ ] **Step 1: Add `'cron'` to REQUIRED_TOOLS array**

In `electron/lib/config.js`, find the REQUIRED_TOOLS array (line 760) and add `'cron'` at the end:

```javascript
// Before (line 760-766):
const REQUIRED_TOOLS = [
  'message', 'web_search', 'web_fetch', 'update_plan',
  'read_file', 'list_files', 'search_files', 'write_file', 'apply_patch',
  'exec', 'memory', 'pdf',
  'sessions_spawn', 'sessions_yield', 'sessions_send', 'subagents',
  'sessions_list', 'sessions_history', 'session_status', 'agents_list',
];

// After:
const REQUIRED_TOOLS = [
  'message', 'web_search', 'web_fetch', 'update_plan',
  'read_file', 'list_files', 'search_files', 'write_file', 'apply_patch',
  'exec', 'memory', 'pdf', 'cron',
  'sessions_spawn', 'sessions_yield', 'sessions_send', 'subagents',
  'sessions_list', 'sessions_history', 'session_status', 'agents_list',
];
```

- [ ] **Step 2: Remove `'cron'` from BANNED_TOOLS array**

Same file, find the BANNED_TOOLS array (line 771):

```javascript
// Before:
const BANNED_TOOLS = ['cron', 'process', 'image_generate', 'canvas', 'tts'];

// After:
const BANNED_TOOLS = ['process', 'image_generate', 'canvas', 'tts'];
```

- [ ] **Step 3: Update the comment above BANNED_TOOLS**

```javascript
// Before (line 767):
// cron — BANNED: conflicts with our cron-api (port 20200) with auth + custom logic

// After:
// cron — UNBANNED v2.5.0: COMMAND-BLOCK covers Zalo, agent uses native cron tool
```

- [ ] **Step 4: Commit**

```bash
git add electron/lib/config.js
git commit -m "feat: unban cron tool — move from BANNED_TOOLS to REQUIRED_TOOLS"
```

---

### Task 2: Update smoke test security assertion

**Files:**
- Modify: `electron/scripts/smoke-test.js:1661-1695`

- [ ] **Step 1: Rewrite TEST 19 section**

Replace the entire TEST 19 block (lines 1661-1695) with:

```javascript
// =========================================================================
// TEST 19: Security — tools.allow hardened list in config.js
// cron unbanned (v2.5.0) — COMMAND-BLOCK covers Zalo input.
// process remains banned — no natural-language COMMAND-BLOCK patterns yet.
// =========================================================================
section('Security: tools.allow hardening');
try {
  const cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'config.js'), 'utf-8');
  const bannedTools = ['process'];
  for (const tool of bannedTools) {
    if (!cfgSrc.includes(`'${tool}'`)) {
      fail(`tools.allow security`, `config.js does not reference '${tool}' at all — it should be in BANNED_TOOLS`);
    }
  }
  if (!/BANNED_TOOLS.*=.*\[/.test(cfgSrc)) {
    fail('tools.allow BANNED_TOOLS', 'config.js missing BANNED_TOOLS array');
  } else {
    pass('tools.allow BANNED_TOOLS array present');
  }
  if (!/REQUIRED_TOOLS.*=.*\[/.test(cfgSrc)) {
    fail('tools.allow REQUIRED_TOOLS', 'config.js missing REQUIRED_TOOLS array');
  } else {
    const reqMatch = cfgSrc.match(/REQUIRED_TOOLS\s*=\s*\[([^\]]+)\]/);
    if (reqMatch) {
      const reqStr = reqMatch[1];
      const leaked = bannedTools.filter(t => reqStr.includes(`'${t}'`));
      if (leaked.length > 0) {
        fail('tools.allow contamination', `REQUIRED_TOOLS contains BANNED items: [${leaked.join(', ')}]`);
      } else {
        pass('REQUIRED_TOOLS clean (no banned tools)');
      }
      const requiredTools = ['cron', 'exec', 'memory'];
      for (const tool of requiredTools) {
        if (!reqStr.includes(`'${tool}'`)) {
          fail(`tools.allow required`, `REQUIRED_TOOLS missing '${tool}'`);
        }
      }
      pass('REQUIRED_TOOLS contains cron, exec, memory');
    }
  }
} catch (e) { fail('tools.allow security', 'config.js read failed: ' + e.message); }
```

- [ ] **Step 2: Run smoke test**

Run: `cd electron && npm run smoke`
Expected: All tests pass including updated TEST 19.

- [ ] **Step 3: Commit**

```bash
git add electron/scripts/smoke-test.js
git commit -m "test: update smoke test — cron now in REQUIRED_TOOLS, process stays banned"
```

---

### Task 3: Rewrite `cron-management.md` skill to use native `cron` tool

**Files:**
- Modify: `skills/operations/cron-management.md` (full rewrite)

- [ ] **Step 1: Rewrite the skill file**

Replace entire contents of `skills/operations/cron-management.md` with:

```markdown
---
name: cron-management
description: Tạo/sửa/xóa lịch tự động (cron) khi CEO yêu cầu qua Telegram, bằng cron tool
metadata:
  version: 3.0.0
---

# Quản lý lịch tự động (Cron) bằng cron tool

## Phạm vi

CHỈ thực hiện khi CEO yêu cầu qua Telegram. Khách hàng Zalo KHÔNG được tạo/sửa/xóa cron.

## Cách thực hiện

Bot dùng `cron` tool trực tiếp. KHÔNG gọi web_fetch tới API cron cũ.

## Bước 1: Hiểu yêu cầu CEO

CEO nói: "tạo lịch gửi nhóm X mỗi sáng 9h nội dung Y".
Bot cần xác định:
- Nhóm/người nhận: tên nhóm hoặc groupId
- Thời gian: giờ/ngày/tần suất
- Nội dung: text gửi đi
- Loại: lặp lại (cronExpr) hay một lần (oneTimeAt)

## Bước 2: Tra cứu nhóm

Dùng `cron` tool list để xem cron hiện có.
Tra nhóm Zalo: `web_fetch http://127.0.0.1:20200/api/zalo/friends?name=<ten>` (endpoint vẫn hoạt động).

TUYỆT ĐỐI KHÔNG đoán groupId.

## Bước 3: Confirm với CEO trước khi tạo

Nói rõ: "Em sẽ tạo lịch [label] chạy lúc [giờ] gửi nhóm [tên nhóm]. Anh xác nhận nhé?"
CHỜ CEO trả lời xác nhận trước khi tạo/xóa.

## Bước 4: Tạo cron bằng cron tool

Dùng `cron` tool với các tham số:
- `name`: label tiếng Việt đầy đủ dấu
- `schedule`: cronExpr (5-field) hoặc ISO datetime cho một lần
- `tz`: "Asia/Ho_Chi_Minh" (BẮT BUỘC)
- `enabled`: true

**Agent mode** (bot tự suy luận):
- `message`: prompt tiếng Việt mô tả việc cần làm

**Fixed mode** (gửi text cố định tới nhóm Zalo):
- `message`: `exec: openzca --profile default msg send <groupId> "<content>" --group`
- KHÔNG dùng natural-language prompt cho nội dung cố định — LLM có thể thay đổi.

**Gửi ảnh vào nhóm Zalo:** LUÔN dùng agent mode. KHÔNG dùng exec với đường dẫn file.
- `message`: `[WORKFLOW] Tạo 1 ảnh poster chào buổi sáng rồi gửi vào nhóm <tên nhóm>`

**Lịch một lần:** dùng schedule kind "at" với ISO datetime.

**Broadcast nhiều nhóm:** tạo 1 cron riêng cho mỗi nhóm.

## Bước 5: Xác nhận cron đã tạo (BẮT BUỘC)

Sau khi tạo, dùng `cron` tool list để verify cron xuất hiện trong danh sách.
CHỈ nói "đã tạo thành công" khi thấy cron trong list.

## Xóa / tạm dừng / bật lại

Dùng `cron` tool delete hoặc toggle.
Mọi thao tác phải confirm CEO trước.

## Lưu ý

- Label tiếng Việt đầy đủ dấu
- Timezone LUÔN "Asia/Ho_Chi_Minh"
- GroupId phải tồn tại — tra trước khi tạo
- Zalo customers KHÔNG truy cập được cron tool (COMMAND-BLOCK)
```

- [ ] **Step 2: Commit**

```bash
git add skills/operations/cron-management.md
git commit -m "feat: rewrite cron-management skill — use native cron tool instead of API"
```

---

### Task 4: Update remaining skill files + deprecate cron-reference

**Files:**
- Modify: `skills/operations/workspace-api.md:74-77`
- Modify: `skills/marketing/zalo-post-workflow.md:55`
- Modify: `skills/operations/telegram-ceo.md:26`
- Modify: `skills/operations/workflow-chains.md:40,97-102`
- Modify: `docs/cron-reference.md:1` (add deprecation header)

- [ ] **Step 1: Update `workspace-api.md` — replace cron API examples**

Find lines 74-77 and replace:

```markdown
# Before:
# Cron: tạo/list/xóa
web_fetch "http://127.0.0.1:20200/api/cron/create?label=<tên>&cronExpr=<cron>&groupId=<id>&content=<nội-dung>"
web_fetch http://127.0.0.1:20200/api/cron/list
web_fetch http://127.0.0.1:20200/api/cron/delete?id=<cronId>

# After:
# Cron: tạo/list/xóa — dùng cron tool trực tiếp (KHÔNG dùng web_fetch API cũ)
# Xem chi tiết: skills/operations/cron-management.md
```

- [ ] **Step 2: Update `zalo-post-workflow.md` — replace group lookup**

Find line 55 and replace:

```markdown
# Before:
- **Nhóm nào?** (tên nhóm hoặc ID) → tra `/api/cron/list` lấy `groupId`

# After:
- **Nhóm nào?** (tên nhóm hoặc ID) → tra `web_fetch http://127.0.0.1:20200/api/zalo/friends?name=<ten>` lấy `groupId`
```

Also find line 99 and replace similarly:

```markdown
# Before:
- `groupId` — lấy từ `/api/cron/list` (tra bằng tên nhóm)

# After:
- `groupId` — lấy từ `web_fetch http://127.0.0.1:20200/api/zalo/friends?name=<ten>` (tra bằng tên nhóm)
```

- [ ] **Step 3: Update `telegram-ceo.md` — replace group lookup**

Find line 26 and replace:

```markdown
# Before:
1. Tra cứu nhóm: `web_fetch http://127.0.0.1:20200/api/cron/list` — lấy danh sách `groups` với `id` + `name`

# After:
1. Tra cứu nhóm: `web_fetch http://127.0.0.1:20200/api/zalo/friends?name=<ten>` — lấy danh sách bạn bè/nhóm với `id` + `name`
```

- [ ] **Step 4: Update `workflow-chains.md` — replace cron references**

Find line 40 and replace:

```markdown
# Before:
| Cron | `cron/create`, `cron/list`, `cron/delete` | `cron-management.md` |

# After:
| Cron | `cron` tool (create, list, delete) | `cron-management.md` |
```

Find lines 97-102 and replace:

```markdown
# Before:
CEO muốn chain chạy tự động → tạo cron agent mode với prefix `[WORKFLOW]`:
\```
web_fetch POST /api/cron/create body={"label":"Cảnh báo tồn kho sáng","cronExpr":"0 8 * * 1-5","groupId":"123","groupName":"Nhóm Kho","mode":"agent","prompt":"[WORKFLOW] Đọc Sheet tồn kho, lọc hàng sắp hết, tạo ảnh cảnh báo gửi nhóm Kho, ghi log Sheet báo cáo"}
\```

**Gửi ảnh trong cron:** LUÔN dùng agent mode. KHÔNG dùng `content` với đường dẫn file.

# After:
CEO muốn chain chạy tự động → tạo cron agent mode với prefix `[WORKFLOW]` bằng `cron` tool:
- name: "Cảnh báo tồn kho sáng"
- schedule: "0 8 * * 1-5"
- tz: "Asia/Ho_Chi_Minh"
- message: "[WORKFLOW] Đọc Sheet tồn kho, lọc hàng sắp hết, tạo ảnh cảnh báo gửi nhóm Kho, ghi log Sheet báo cáo"

**Gửi ảnh trong cron:** LUÔN dùng agent mode. KHÔNG dùng exec với đường dẫn file.
```

- [ ] **Step 5: Add deprecation header to `docs/cron-reference.md`**

Add at line 1 (before existing content):

```markdown
> **DEPRECATED v2.5.0** — Dùng `cron` tool trực tiếp. Xem `skills/operations/cron-management.md`. File này giữ lại cho reference cũ.

---

```

- [ ] **Step 6: Run smoke test**

Run: `cd electron && npm run smoke`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add skills/operations/workspace-api.md skills/marketing/zalo-post-workflow.md skills/operations/telegram-ceo.md skills/operations/workflow-chains.md docs/cron-reference.md
git commit -m "feat: update 5 skill files — replace cron API references with cron tool"
```

---

## Chunk 2: Phase 2 — delivery field parsing + migration skill

### Task 5: Extend `loadCustomCrons()` to parse `delivery` field from jobs.json

**Files:**
- Modify: `electron/lib/cron.js:1604-1611`

- [ ] **Step 1: Add delivery field parsing**

In `electron/lib/cron.js`, find the `openclawEntries.push({` block (line 1604-1611) and replace with:

```javascript
// Before (line 1604-1611):
        openclawEntries.push({
          id: 'oc_' + j.id,
          label: j.name || 'OpenClaw cron',
          cronExpr: schedExpr,
          prompt: j.payload?.text || j.payload?.message || '',
          enabled: j.enabled !== false,
          source: 'openclaw',
        });

// After:
        const isZalo = j.delivery?.channel === 'zalo';
        const isGroup = isZalo && j.delivery?.isGroup !== false;
        openclawEntries.push({
          id: 'oc_' + j.id,
          label: j.name || 'OpenClaw cron',
          cronExpr: schedExpr,
          prompt: j.payload?.text || j.payload?.message || '',
          enabled: j.enabled !== false,
          source: 'openclaw',
          zaloTarget: isZalo ? { id: j.delivery.to, isGroup } : undefined,
          groupId: isGroup ? j.delivery.to : undefined,
          telegramTarget: j.delivery?.channel === 'telegram' ? j.delivery.to : undefined,
        });
```

- [ ] **Step 2: Verify existing tests pass**

Run: `cd electron && npm run smoke`
Expected: All tests pass. This change is additive — existing crons without `delivery` get `undefined` for the new fields, which is the current behavior.

- [ ] **Step 3: Manual verification**

Verify the scheduler uses `zaloTarget` from loaded entries. Trace the data flow:
1. `loadCustomCrons()` returns entries with `zaloTarget`
2. `_startCronJobsInner()` passes `c.zaloTarget` to `runCronAgentPrompt()` (line 2130, 2243)
3. `runCronAgentPrompt()` uses `zaloTarget` for delivery (line 448, 470)

This chain is already wired — we're just populating `zaloTarget` where it was previously `undefined`.

- [ ] **Step 4: Commit**

```bash
git add electron/lib/cron.js
git commit -m "feat: parse delivery field from OpenClaw jobs.json — preserve Zalo targets"
```

---

### Task 6: Create migration skill

**Files:**
- Create: `skills/operations/cron-migration/SKILL.md`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p skills/operations/cron-migration
```

- [ ] **Step 2: Write the SKILL.md file**

Create `skills/operations/cron-migration/SKILL.md` with:

```markdown
---
name: cron-migration
description: Chuyển cron cũ (custom-crons.json) sang hệ thống cron mới (OpenClaw native)
trigger:
  - migrate cron
  - chuyển cron
  - gộp lịch
  - migration cron
metadata:
  version: 1.0.0
---

# Chuyển cron cũ sang hệ thống mới

## Khi nào áp dụng

CEO muốn chuyển cron cũ (custom-crons.json) sang hệ thống cron mới (OpenClaw native).

## Quy trình

### Bước 1: Đọc cron cũ

- Đọc file `custom-crons.json` trong workspace
- Liệt kê từng cron cho CEO xem: tên, lịch, nội dung, nhóm đích
- Nếu file rỗng hoặc không tồn tại: báo "Không có cron cũ cần chuyển"

### Bước 2: Xác nhận

- Hỏi CEO: "Anh muốn chuyển tất cả hay chọn từng cái?"
- Chờ CEO confirm trước khi tiếp

### Bước 3: Tạo cron mới (từng cái một, disable trước khi tạo)

Với MỖI cron CEO đồng ý chuyển, thực hiện ĐÚNG THỨ TỰ:

1. **Tắt cron cũ trước**: sửa `custom-crons.json`, set `enabled: false` cho cron đang chuyển (tránh chạy trùng)
2. **Tạo cron mới** bằng `cron` tool:
   - Giữ nguyên label, cronExpr, enabled state (enabled: true cho cron mới)
   - Timezone: LUÔN set `tz: "Asia/Ho_Chi_Minh"` (cron cũ chạy theo giờ hệ thống VN)
   - Agent mode (có prompt, KHÔNG có content/groupId): giữ nguyên prompt
   - Fixed mode (có content + groupId): dùng format `exec:` để gửi deterministic:
     ```
     exec: openzca --profile default msg send <groupId> "<content>" --group
     ```
     KHÔNG dùng natural-language prompt (LLM non-deterministic, có thể thay đổi nội dung).
   - One-time (oneTimeAt): dùng schedule kind "at"
   - Broadcast (groupIds array): tạo 1 cron riêng cho mỗi group
3. **Ghi ID cron mới tạo** vào file tạm `cron-migration-state.json` (cần cho rollback)
4. Báo CEO: "Đã tạo [tên] — lịch [expr]"

CEO sẽ nhận thông báo Telegram mỗi khi cron mới được tạo — đó là bình thường.

### Bước 4: Backup và dọn dẹp

- Rename `custom-crons.json` → `custom-crons.json.backup`
- Báo CEO: "Đã chuyển X/Y cron. File cũ backup tại custom-crons.json.backup"

### Bước 5: Verify

- Dùng `cron` tool liệt kê tất cả cron hiện tại
- Xác nhận với CEO: "Đây là danh sách cron sau khi chuyển: [list]. Đúng chưa?"

### Hoàn tác

Nếu CEO nói "hoàn tác" hoặc "rollback":
- Đọc `cron-migration-state.json` để lấy danh sách ID cron mới đã tạo
- Xóa TỪNG cron mới bằng `cron` tool (dùng danh sách ID từ file, KHÔNG dùng trí nhớ agent)
- Rename `custom-crons.json.backup` → `custom-crons.json`
- Set lại `enabled: true` cho các cron cũ đã bị tắt
- Xóa `cron-migration-state.json`
- Báo: "Đã hoàn tác. Cron cũ đã khôi phục."
- Nếu rollback lỗi giữa chừng: báo CEO ID cron còn lại cần xóa thủ công qua Dashboard

### Lưu ý

- KHÔNG tự động chạy migration khi không được yêu cầu
- KHÔNG xóa custom-crons.json trước khi backup
- Nếu bất kỳ lỗi nào xảy ra: dừng, báo CEO, không tiếp tục
- Cron built-in (schedules.json) KHÔNG nằm trong scope migration này
```

- [ ] **Step 3: Run smoke test**

Run: `cd electron && npm run smoke`
Expected: All tests pass. Skill file is a new .md — no runtime changes.

- [ ] **Step 4: Commit**

```bash
git add skills/operations/cron-migration/SKILL.md
git commit -m "feat: add cron-migration skill — customer-triggered migration from custom-crons.json to native cron tool"
```

---

## Pre-implementation prerequisites (manual, before shipping to customers)

These are NOT automated tasks. They must be done by a human before v2.5.0 ships:

1. **Verify `cron` tool output format**: Run `openclaw agent --message "create a test cron that runs every hour"`, read `~/.openclaw/cron/jobs.json`, confirm field names match spec (payload.message vs payload.text, schedule.expr vs schedule.cron, delivery field existence).

2. **Verify timezone behavior**: Create a cron via tool with and without explicit `tz` field. Confirm what timezone node-cron uses for the new entry.

3. **Test migration on a staging customer**: Run the migration skill on a test workspace with 3-5 crons of mixed types (agent mode, fixed mode, broadcast, one-time). Verify all fire correctly. Test rollback.
