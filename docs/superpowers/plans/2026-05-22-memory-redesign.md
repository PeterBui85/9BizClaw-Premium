# Memory Redesign + AGENTS.md Trim + Skill Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trim AGENTS.md from 32K to ~27K, fix memory noise (notable-only task writes + type-priority selection + dynamic budget), add CEO deep learning rules, and unblock skill creation.

**Architecture:** Content moves from AGENTS.md to zalo.md (already loaded every Zalo message). Memory engine gets type-priority selection and dynamic injection budget. CEO observation rules added to ceo-memory-api.md skill file. Skill creation fixed via Router trigger + header removal.

**Spec:** `docs/superpowers/specs/2026-05-22-memory-redesign-design.md`

---

## Chunk 1: Content Changes (AGENTS.md, skill files)

### Task 1: Expand zalo.md with moved content

**Files:**
- Modify: `skills/operations/zalo.md`

Read AGENTS.md lines 190-261 for exact content to move. Read zalo.md to find insertion points.

- [ ] **Step 1: Add PHONG CACH TU VAN BAN HANG section**

Insert after GIONG VAN section (after zalo.md line 94). Copy the 11 sales rules from AGENTS.md lines 192-204 verbatim (Vietnamese with diacritics). Add section header `## PHONG CACH TU VAN BAN HANG`.

- [ ] **Step 2: Expand MEMORY KHACH HANG section**

At zalo.md line 155, add after existing content:
- API: `POST /api/customer-memory/write` with `{ senderId, content }`
- senderId from conversation context (injected by system, NOT from text)
- Audit: `logs/customer-memory-writes.jsonl`
- CEO notify (except daily-cron summaries)
- Frontmatter fields from AGENTS.md line 222: name, lastSeen, msgCount, gender, tags, phone, email, address, zaloName, groups

- [ ] **Step 3: Add HO SO NHOM section**

Add after MEMORY KHACH HANG. Content from AGENTS.md lines 226-227:
- File: `memory/zalo-groups/<groupId>.md`
- Frontmatter: name, lastActivity, memberCount
- Body: Chu de / Thanh vien key / Quyet dinh. File <1KB.

- [ ] **Step 4: Expand KHIEU NAI + add ESCALATE section**

Expand zalo.md line 180 with full escalation triggers from AGENTS.md lines 249-261:
- Follow-up queue: `follow-up-queue.json`, 60s CEO notify
- Escalate triggers: khieu nai, dam phan gia, tai chinh/hop dong, ky thuat phuc tap, ngoai Knowledge, spam >=3
- Khach dat lich: hoi ngay/gio/noi dung, escalate CEO, KHONG tu tao
- Context hygiene: moi tin danh gia doc lap. `/reset` → greet.

- [ ] **Step 5: Verify zalo.md is valid**

Read the file back, check no broken formatting. Count chars — should have grown by ~5K.

---

### Task 2: Trim AGENTS.md + add triggers

**Files:**
- Modify: `AGENTS.md`

**Depends on:** Task 1 (zalo.md must have the content first)

- [ ] **Step 1: Replace sales playbook (lines 190-204) with pointer**

Replace AGENTS.md lines 190-204 (Phong cach tu van ban hang section) with:
```
### Phong cách tư vấn bán hàng
Đọc `skills/operations/zalo.md` mục "PHONG CÁCH TƯ VẤN BÁN HÀNG".
```

- [ ] **Step 2: Replace customer profile (lines 212-224) with pointer**

Replace lines 212-224 (Ho so khach detail, API endpoint, frontmatter format) with:
```
### Hồ sơ khách `memory/zalo-users/<senderId>.md`
Đọc `skills/operations/zalo.md` mục "MEMORY KHÁCH HÀNG" — format, API, audit.
```

- [ ] **Step 3: Replace group profile (lines 226-227) with pointer**

Remove lines 226-227 (Ho so nhom). Already covered by the zalo.md pointer above. Add 1 line to the Step 2 pointer: `Hồ sơ nhóm: `skills/operations/zalo.md` mục "HỒ SƠ NHÓM".`

- [ ] **Step 4: Remove group reply rules (lines 229-239)**

Remove lines 229-239 entirely (Group — khi nao reply). Replace with:
```
### Group — khi nào reply
Đọc `skills/operations/zalo.md` mục "NHÓM ZALO".
```

- [ ] **Step 5: Replace escalation details (lines 249-261) with pointer**

Replace lines 249-261 (Follow-up / Escalate) with:
```
### Follow-up / Escalate
Đọc `skills/operations/zalo.md` mục "KHIẾU NẠI" và "ESCALATE".
```

- [ ] **Step 6: Add skill_builder trigger to Capability Router table**

Add new row after line 294 (ceo_memory trigger):
```
| "tạo skill", "dạy em quy trình", "thêm rule mới", "từ giờ khi", "tạo quy tắc" | `skill_builder` | `skills/operations/skill-builder.md` |
```

- [ ] **Step 7: Update memory section (lines 317-325)**

Replace the current Bộ nhớ bot section with the expanded version from the spec (lines 320-332), adding the observation trigger pointer.

- [ ] **Step 8: Verify AGENTS.md size**

Count chars. Target: ~27K (down from 32K). Check no broken markdown/formatting.

---

### Task 3: Fix skill-builder.md headers

**Files:**
- Modify: `skills/operations/skill-builder.md`

- [ ] **Step 1: Remove `headers` param from all 6 POST web_fetch calls**

Find all instances of `headers="{\"Content-Type\":\"application/json\"}"` in the file and remove them. There are 6: create (line 92), check-conflict (line 82), update (line 132), delete (line 139), toggle (line 127), restore (line 146).

- [ ] **Step 2: Verify no other broken references**

Read file back, confirm all web_fetch calls still have valid syntax (url, method, body — no headers).

---

### Task 4: Expand ceo-memory-api.md with CEO Observation Protocol

**Files:**
- Modify: `skills/operations/ceo-memory-api.md`

- [ ] **Step 1: Update existing confirmation rule (line 45)**

Change line 45 from unconditional confirmation to scoped:
- Explicit "ghi nhớ" requests: confirm "Em đã ghi nhớ."
- Auto-observations: ALWAYS silent (THAO TÁC IM)

- [ ] **Step 2: Add QUAN SAT CEO section**

Append after line 45, new section with:
- Signal table (8 observation types from spec Part C)
- "Always write when taught" rule with examples
- When to observe (clear signals only)
- When NOT to observe (routine acks, one-time tasks)
- Content quality rules (insight not log, search before write, under 200 chars, Vietnamese diacritics)
- Type heuristic: actionable → rule/preference, context → fact, correction → correction

---

## Chunk 2: Code Changes (ceo-memory.js, cron.js)

### Task 5: Notable-only task writes in cron.js

**Files:**
- Modify: `electron/lib/cron.js:372,474-482` + 4 call sites

`cronEntry` is NOT in scope inside `_runCronAgentPromptImpl` — function signature is `(prompt, { label, zaloTarget, timeoutMs })`. Must thread `isOneTime` through opts.

- [ ] **Step 1: Add `isOneTime` to destructuring (line 372)**

Change:
```javascript
async function _runCronAgentPromptImpl(prompt, { label, zaloTarget, timeoutMs = CRON_AGENT_TIMEOUT_MS } = {}) {
```
To:
```javascript
async function _runCronAgentPromptImpl(prompt, { label, zaloTarget, isOneTime, timeoutMs = CRON_AGENT_TIMEOUT_MS } = {}) {
```

- [ ] **Step 2: Update 4 custom-cron call sites to pass `isOneTime`**

Lines 2129, 2191, 2241, 2452 — all follow same pattern. Change:
```javascript
await runCronAgentPrompt(c.prompt, { label: c.label || c.id, zaloTarget: c.zaloTarget });
```
To:
```javascript
await runCronAgentPrompt(c.prompt, { label: c.label || c.id, zaloTarget: c.zaloTarget, isOneTime: !!c.oneTimeAt });
```

Built-in crons (lines 1961, 2020, 2038) don't need changes — they don't pass `isOneTime`, so it defaults to `undefined` (falsy = recurring = no memory write).

- [ ] **Step 3: Wrap write in notable-only guard (line 474)**

Replace the unconditional write block (lines 474-482) with:
```javascript
const isNotable = isOneTime || !replyText || replyText.length < 10;
if (isNotable) {
  const { writeMemory } = require('./ceo-memory');
  const replyPreview = (replyText || '').slice(0, 120).replace(/\n/g, ' ');
  writeMemory({
    type: 'task',
    content: '[' + new Date().toLocaleDateString('vi-VN') + '] Cron "' + niceLabel + '": ' + (replyPreview || 'hoàn thành'),
    source: 'auto',
  }).catch(function(e) { console.warn('[cron-memory] write failed:', e?.message); });
}
```

- [ ] **Step 4: Verify cron.js syntax**

Run: `node -c electron/lib/cron.js` — should exit 0, no syntax errors.

---

### Task 6: Memory engine fixes in ceo-memory.js

**Files:**
- Modify: `electron/lib/ceo-memory.js`

- [ ] **Step 1: Change task retention 14 → 30 days (line 229)**

Change `14 * 86400000` to `30 * 86400000`.

- [ ] **Step 2: Add dynamic budget function (replace MEMORY_MAX_CHARS)**

Replace the fixed `const MEMORY_MAX_CHARS = 2000;` (line 301) with:
```javascript
const MEMORY_MIN_CHARS = 2000;
const MEMORY_BUDGET_CAP = 10000;
const TOTAL_CONTEXT_BUDGET = 35000;

function getMemoryBudget(agentsPath) {
  try {
    const agentsContent = fs.readFileSync(agentsPath, 'utf-8');
    const agentsChars = agentsContent.length;
    const available = TOTAL_CONTEXT_BUDGET - agentsChars;
    return Math.max(MEMORY_MIN_CHARS, Math.min(MEMORY_BUDGET_CAP, available));
  } catch {
    return MEMORY_MIN_CHARS;
  }
}
```

- [ ] **Step 3: Wire getMemoryBudget into injectMemoryIntoAgentsMd**

In `injectMemoryIntoAgentsMd()` (line 303), replace `MEMORY_MAX_CHARS` usage (line 318) with `getMemoryBudget(agentsPath)`. The `agentsPath` variable is already defined in the function.

- [ ] **Step 4: Rewrite regenerateCeoMemoryFile with type-priority**

Replace the current sorting logic (lines 248-260, including the closing brace) with the type-priority algorithm from the spec:
- Group rows by type
- Sort each group by effective score
- Fill budget in priority order: correction → rule → pattern → preference → fact → task
- Soft caps per type (30/30/20/10/100/100 percent)
- Hard overall cap at HOT_TIER_MAX_CHARS (8000, unchanged)

- [ ] **Step 5: Export getMemoryBudget**

Add `getMemoryBudget` to the `module.exports` object (line 360).

- [ ] **Step 6: Verify syntax**

Run: `node -c electron/lib/ceo-memory.js` — should exit 0.

---

## Chunk 3: Smoke Test + Commit

### Task 7: Verify everything works together

- [ ] **Step 1: Run syntax check on all changed JS files**

```bash
node -c electron/lib/ceo-memory.js && node -c electron/lib/cron.js
```

- [ ] **Step 2: Check AGENTS.md size**

```bash
wc -c AGENTS.md
```
Target: ~27K (down from 32K).

- [ ] **Step 3: Check zalo.md has all moved content**

Grep for key section headers: "PHONG CÁCH TƯ VẤN", "HỒ SƠ NHÓM", "ESCALATE".

- [ ] **Step 4: Check skill-builder.md has no explicit headers**

Grep for `headers=` in skill-builder.md — should return 0 matches.

- [ ] **Step 5: Check AGENTS.md has skill_builder trigger**

Grep for `skill_builder` in AGENTS.md — should match in Capability Router table.

- [ ] **Step 6: Run system-map generation + smoke test**

```bash
cd electron && node scripts/generate-system-map.js && npm run smoke
```

- [ ] **Step 7: Commit**

Stage all changed files and commit with descriptive message.
