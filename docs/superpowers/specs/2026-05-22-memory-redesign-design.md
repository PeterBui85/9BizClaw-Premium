# Memory System Redesign + AGENTS.md Trim — Design Spec

**Date:** 2026-05-22
**Status:** Draft
**Branch:** main
**Version:** v2.4.6

---

## Problem Statement

The CEO memory system is broken in two ways:

1. **AGENTS.md is 32K chars** — exceeds the 20K effective budget. Bot can't reliably follow all rules.
2. **Memory is 100% noise** — 10/10 memories are `task` type (cron logs). No rules, preferences, corrections, patterns. Bot "remembers" but remembers only logs, not learnings about the CEO.
3. **Bot doesn't learn the CEO** — memory only writes on explicit triggers ("ghi nho", "tu gio...") or cron auto-write. Bot never observes CEO behavior and infers preferences, priorities, or decision patterns.

## Goals

1. Trim AGENTS.md from 32K to ~26K by moving duplicated Zalo content to `zalo.md`
2. Reduce memory noise 90% (notable-only task writes)
3. Dynamic memory budget that grows as AGENTS.md shrinks
4. Type-priority selection so corrections/rules always outrank tasks
5. CEO deep learning — bot actively observes conversations and builds CEO profile over time

## Non-Goals

- Pattern detection threshold changes (evening summary 3->2 customers) — next iteration
- Real-time pattern detection during conversation — complex, separate design
- Memory UI in Dashboard — future feature
- Memory compaction/dedup algorithm — future optimization

---

## Part A: AGENTS.md Zalo Trim

### What moves to `skills/operations/zalo.md`

| AGENTS.md Section | Lines | Size | Why safe to move |
|---|---|---|---|
| Phong cach tu van ban hang (11 rules) | 190-204 | ~2K | Sales rules only apply during Zalo conversations. zalo.md loads for EVERY Zalo message (AGENTS.md line 207). |
| Ho so khach API detail | 212-224 | ~1.2K | Customer profile API only used during Zalo conversations. zalo.md already has simpler MEMORY section — merge. |
| Ho so nhom format | 226-227 | ~0.2K | Group memory is Zalo-only. zalo.md already has NHOM ZALO section. |
| Group reply rules | 229-239 | ~1K | **FULLY DUPLICATED** in zalo.md lines 99-153 (even more detailed). Safe to remove. |
| Follow-up/Escalate details | 249-261 | ~1K | Escalation procedure is Zalo customer flow. zalo.md line 182-184 has partial — expand. |

**Estimated gross savings: ~5.5K chars.** Replacement pointers add ~500 chars back. Net savings: ~5K. AGENTS.md goes from ~32K to ~27K.

### What stays inline in AGENTS.md

- **Blocklist** (line 169-170) — 1 line, too small to move
- **PHAM VI NHIEM VU** (lines 172-183) — security boundary, MUST be inline always
- **Hoi truoc, lam sau** (lines 185-188) — cross-references Telegram behavior
- **Gio lam / Pause** (lines 241-247) — cross-channel (Telegram + Zalo + Dashboard)
- **PHONG THU + FORMAT pointer** (line 207) — already just a pointer

### AGENTS.md inline replacement

Each removed section becomes a 1-line pointer:

```markdown
### Phong cach tu van ban hang
Doc `skills/operations/zalo.md` muc "PHONG CACH TU VAN BAN HANG".

### Ho so khach / Ho so nhom
Doc `skills/operations/zalo.md` muc "MEMORY KHACH HANG".

### Group — khi nao reply
Doc `skills/operations/zalo.md` muc "NHOM ZALO".

### Follow-up / Escalate
Doc `skills/operations/zalo.md` muc "KHIEU NAI" va "ESCALATE".
```

### Changes to `skills/operations/zalo.md`

**Add new section** "PHONG CACH TU VAN BAN HANG" — the 11 sales rules from AGENTS.md lines 190-203. Place after GIONG VAN section (line 94).

**Expand existing** MEMORY KHACH HANG section (line 155) with:
- API endpoint: `POST /api/customer-memory/write` with `{ senderId, content }`
- senderId source clarification (from conversation context, NOT from text)
- Audit trail: `logs/customer-memory-writes.jsonl`
- CEO notify behavior (except daily-cron summaries)

**Add new section** HO SO NHOM with frontmatter format: name, lastActivity, memberCount, body structure.

**Expand existing** KHIEU NAI section (line 180) with full escalation trigger list:
- khieu nai, dam phan gia, tai chinh/hop dong, ky thuat phuc tap, ngoai Knowledge, spam >=3
- Follow-up queue: `follow-up-queue.json`, 60s CEO notify
- Khach dat lich: hoi ngay/gio/noi dung, escalate CEO, KHONG tu tao

### Verification

After trim, test these scenarios:
1. Zalo DM from customer asking about product price — bot loads zalo.md, follows sales playbook
2. Zalo group message — bot follows group rules from zalo.md
3. Customer complaint — bot escalates with correct keyword, CEO gets alert
4. Customer profile update — bot uses correct API endpoint from zalo.md

---

## Part B: Memory Engine Fixes

### B1. Notable-only task writes

**File:** `electron/lib/cron.js` lines 474-482

**Current:** Every cron success writes a `type: 'task'` memory unconditionally.

**New:** Only write task memory for notable outcomes in the SUCCESS path (code === 0):
- Cron was **one-time** (`oneTimeAt` field present in cron entry) — captures unique events
- Reply was **empty or anomalous** (replyText is empty or < 10 chars) — captures anomalies

Normal recurring cron success with real content → **no memory write**. The cron journal (`cron-runs.jsonl`) still records every execution for audit.

**Failed crons** (code !== 0) already have separate handling: they alert CEO via Telegram (`sendCeoAlert`) and log to `ceo-alerts-missed.log`. They do NOT write to ceo-memory — no change needed, and no memory write added.

**Implementation:**

```javascript
// cron.js ~line 474 (inside the res.code === 0 success branch)
// Only write memory for NOTABLE outcomes — not every routine success
const isOneTime = !!(cronEntry && cronEntry.oneTimeAt);
const isNotable = isOneTime || !replyText || replyText.length < 10;
if (isNotable) {
  const { writeMemory } = require('./ceo-memory');
  const replyPreview = (replyText || '').slice(0, 120).replace(/\n/g, ' ');
  writeMemory({
    type: 'task',
    content: '[' + new Date().toLocaleDateString('vi-VN') + '] Cron "' + niceLabel + '": ' + (replyPreview || 'hoan thanh'),
    source: 'auto',
  }).catch(function(e) { console.warn('[cron-memory] write failed:', e?.message); });
}
```

### B2. Task retention 14 -> 30 days

**File:** `electron/lib/ceo-memory.js` line 229

**Change:** `14 * 86400000` -> `30 * 86400000`

With notable-only writes (~1-2 entries/day vs 5+), 30 days = ~30-60 entries max. Well within budget.

### B3. Dynamic memory budget

**File:** `electron/lib/ceo-memory.js` line 301

**Two distinct budgets exist — both need updating:**

| Constant | Current | Purpose | Location |
|---|---|---|---|
| `HOT_TIER_MAX_CHARS` | 8000 | Cap for CEO-MEMORY.md file content | `regenerateCeoMemoryFile()` |
| `MEMORY_MAX_CHARS` | 2000 | Cap for what gets injected into AGENTS.md | `injectMemoryIntoAgentsMd()` |

**Change:** Replace only `MEMORY_MAX_CHARS` (the injection cap) with a dynamic function. `HOT_TIER_MAX_CHARS` stays at 8000 — the file can be large, only the injection into AGENTS.md is budget-sensitive.

```javascript
const MEMORY_MIN_CHARS = 2000;
const MEMORY_BUDGET_CAP = 10000;
const TOTAL_CONTEXT_BUDGET = 35000;

function getMemoryBudget(agentsPath) {
  try {
    // Use string length (chars), not fs.statSync (bytes).
    // Vietnamese UTF-8 diacritics make byte count != char count.
    const agentsContent = fs.readFileSync(agentsPath, 'utf-8');
    const agentsChars = agentsContent.length;
    const available = TOTAL_CONTEXT_BUDGET - agentsChars;
    return Math.max(MEMORY_MIN_CHARS, Math.min(MEMORY_BUDGET_CAP, available));
  } catch {
    return MEMORY_MIN_CHARS;
  }
}
```

**After Zalo trim (AGENTS.md ~27K chars):** budget = min(10000, 35000 - 27000) = 8000 chars.
**Floor:** 2000 chars (even if AGENTS.md somehow grows to 33K+).
**Cap:** 10000 chars (even if AGENTS.md shrinks to 10K).

**Wiring:** `injectMemoryIntoAgentsMd()` calls `getMemoryBudget(agentsPath)` instead of using `MEMORY_MAX_CHARS`. The `regenerateCeoMemoryFile()` function continues using `HOT_TIER_MAX_CHARS` (8000) for the file — unchanged.

### B4. Type-priority selection

**File:** `electron/lib/ceo-memory.js` function `regenerateCeoMemoryFile()` (line 237)

**Current:** All types mixed, sorted by `effective_score` descending. Tasks crowd out everything.

**New algorithm:**

```
Fill HOT_TIER_MAX_CHARS (8000) budget in strict type order:
1. corrections — all entries, SOFT cap 30% of budget
2. rules      — all entries, SOFT cap 30% of budget
3. patterns   — top N by recency, SOFT cap 20% of budget
4. preferences — all entries, SOFT cap 10% of budget
5. facts      — top N by recency, remaining space
6. tasks      — whatever space is left (often zero — and that's fine)

Within each type: sort by effective_score DESC (same as current).
SOFT cap means: preferred max per type, but if a type uses less than its cap,
the unused budget flows down to the next types via the totalChars check.
```

This ensures corrections and rules ALWAYS appear in the file, even if there are 100 task entries. Tasks only appear if there's space after all higher-priority types.

**Type heuristic for CEO observations:** If actionable for future behavior -> `rule` or `preference`. If context for understanding -> `fact`. If CEO explicitly corrected bot -> `correction`.

**Implementation sketch:**

```javascript
function regenerateCeoMemoryFile() {
  trimOldTaskEntries();
  const db = getMemoryDb();
  if (!db) return;
  
  const now = Date.now();
  const allRows = db.prepare('SELECT ...').all();
  
  // Score and group by type
  const byType = { correction: [], rule: [], pattern: [], preference: [], fact: [], task: [] };
  for (const r of allRows) {
    const daysSince = (now - new Date(r.updated_at).getTime()) / 86400000;
    r.effective = Math.max(0, r.relevance_score - 0.02 * daysSince);
    if (byType[r.type]) byType[r.type].push(r);
  }
  // Sort each type by effective score
  for (const arr of Object.values(byType)) {
    arr.sort((a, b) => b.effective - a.effective);
  }
  
  // Fill budget by type priority (SOFT caps — unused space flows down)
  const typePriority = ['correction', 'rule', 'pattern', 'preference', 'fact', 'task'];
  const typeSoftCaps = { correction: 0.30, rule: 0.30, pattern: 0.20, preference: 0.10, fact: 1.0, task: 1.0 };
  const groups = {};
  let totalChars = 0;
  
  for (const type of typePriority) {
    const softCap = HOT_TIER_MAX_CHARS * typeSoftCaps[type];
    let typeChars = 0;
    groups[type] = [];
    for (const r of byType[type]) {
      if (totalChars + r.content.length > HOT_TIER_MAX_CHARS) break; // hard overall limit
      if (typeChars + r.content.length > softCap) break; // soft per-type limit
      groups[type].push(r.content);
      totalChars += r.content.length + 3;
      typeChars += r.content.length + 3;
    }
  }
  
  // ... rest of file generation (labels, markdown output) unchanged
  // NOTE: HOT_TIER_MAX_CHARS (8000) is for the file. The dynamic getMemoryBudget()
  // is used separately in injectMemoryIntoAgentsMd() to cap what goes into AGENTS.md.
}
```

---

## Part C: CEO Deep Learning

### Concept

The bot should act like a smart executive assistant who quietly learns the CEO over time — not from explicit teaching, but from observing normal conversation.

### What the bot observes

| Signal | Memory type | Example content |
|---|---|---|
| CEO approves/rejects bot's suggestion | `preference` | "CEO thich bao cao dang bullet ngan, khong thich paragraph dai" |
| CEO corrects implicitly (rephrases, does differently) | `correction` | "Khi gui bao gia, CEO muon kem deadline chuyen khoan, khong chi gia" |
| CEO reveals business priority | `fact` | "CEO dang tap trung mo rong kenh Zalo thang 5/2026" |
| CEO mentions customer with emotion/urgency | `fact` | "Khach Minh Tu la VIP — CEO luon hoi tham truoc" |
| CEO's recurring instruction pattern | `rule` | "CEO luon muon confirm truoc khi gui nhom >50 nguoi" |
| CEO's working rhythm | `preference` | "CEO thuong nhan lenh buoi sang 7-8h, review ket qua 17-18h" |
| CEO's communication style preference | `preference` | "CEO muon report ngan 3-5 dong, khong narrative" |
| CEO teaches business knowledge | `fact` | "Bao hanh chinh hang 12 thang, mo rong them 6 thang cho VIP" |

### RULE: Always write when taught — NEVER wait to be asked

**Every time CEO teaches the bot something — whether explicitly ("tu gio lam the nay") or implicitly (corrects by doing differently, shows preference by reacting) — the bot MUST write memory IMMEDIATELY in the same turn.** Do NOT wait for CEO to say "ghi nho". The teaching IS the trigger.

Examples of "CEO teaching":
- "Dung gui nhom sau 9h toi" -> `rule` IMMEDIATELY
- "Bao hanh 12 thang, VIP them 6 thang" -> `fact` IMMEDIATELY
- CEO rephrases bot's report shorter -> `preference` IMMEDIATELY (CEO wants shorter reports)
- "Khach Minh Tu la doi tac chien luoc" -> `fact` IMMEDIATELY
- CEO rejects bot's suggested reply style -> `correction` IMMEDIATELY

### When to observe (beyond explicit teaching)

- CEO **approves or rejects** a bot proposal -> decision pattern
- CEO **rephrases or redoes** something bot did -> implicit correction
- CEO **mentions business context** unprompted (deadline, goal, priority) -> fact
- CEO **gives instruction about a person/customer** -> relationship fact
- Multi-turn conversation **ends** (CEO moves on) -> summarize what was learned
- **NOT** after routine acks ("ok", "duoc", "gui di") — those are commands, not learning signals
- **NOT** for one-time operational details ("gui nhom ABC cai nay") — that's a task, not a pattern

### Content quality rules

- Memory must be an **insight**, not a log: "CEO thich format ngan" (good) vs "CEO nhan luc 8h" (bad)
- Vietnamese with full diacritics, under 200 chars
- Before writing, **search memory** for existing similar entry — update relevance instead of duplicating
- Write silently (THAO TAC IM) — NEVER say "em vua ghi nho rang anh thich..."
- Exception: when CEO **explicitly** says "ghi nho / nho gium", confirm lightly: "Em da ghi nho." (existing behavior in ceo-memory-api.md line 45). Auto-observations are ALWAYS silent.
- Write in same turn as the observation — don't wait

### Implementation: expand `skills/operations/ceo-memory-api.md`

Add new section "QUAN SAT CEO — Tu dong hoc tu hoi thoai" after the existing API docs. This section instructs the bot on:

1. What signals to watch for (table above)
2. When to write (clear signals only)
3. How to write (search first, quality rules, silent)
4. What NOT to write (routine acks, one-time operations)

### Implementation: update AGENTS.md memory section

Current lines 317-325 expand to include observation trigger:

```markdown
## Bo nho bot (CEO Memory)
Doc `skills/operations/ceo-memory-api.md` — luu/tim/xoa ky uc qua API noi bo.
**TU DONG ghi — KHONG doi CEO bao:**
- Hoan thanh task → ghi `task` ngay
- CEO sua loi bot → ghi `correction` ngay
- CEO dan quy tac → ghi `rule` ngay
- Viec pending → ghi `task` voi prefix "[PENDING]"
- CEO noi "ghi nho/nho gium" → ghi ngay loai phu hop

**TU DONG quan sat — KHONG doi CEO bao:**
Sau moi cuoc hoi thoai CEO, tu hoi: "Minh vua hoc duoc gi ve sep?"
Doc `skills/operations/ceo-memory-api.md` muc "Quan sat CEO" cho quy trinh chi tiet.
```

This adds ~200 chars to AGENTS.md but the pointer routes to the detailed protocol in the skill file.

---

## Files Changed

| File | Change type | Risk |
|---|---|---|
| `AGENTS.md` | Remove ~5K net Zalo content, add memory observation trigger, add skill_builder trigger to Router, replace with pointers | Medium |
| `skills/operations/zalo.md` | Add sales playbook, expand customer memory, expand escalation | Low (additive) |
| `skills/operations/ceo-memory-api.md` | Add CEO Observation Protocol section (~1.5K) | Low (additive) |
| `skills/operations/skill-builder.md` | Remove explicit `headers` from 6 POST web_fetch calls | Low |
| `electron/lib/ceo-memory.js` | Dynamic budget, type-priority selection, 30-day retention | Medium (core engine) |
| `electron/lib/cron.js` | Notable-only task writes (lines 474-482) | Low (reduces writes) |

## Risk Mitigation

1. **zalo.md merge** — sections get clear headers matching AGENTS.md pointer text. No content lost.
2. **AGENTS.md pointers** — use same pattern as 10+ existing sections that already say "Doc skills/...". Bot already follows this.
3. **Memory backward-compat** — existing memories keep their scores. Only selection algorithm changes. No data deleted.
4. **Dynamic budget fallback** — if AGENTS.md size unreadable, falls back to 2000 chars (current behavior).
5. **Task retention extension** — 14->30 days only extends, never deletes valid memories earlier.
6. **Rollback plan** — if bot fails on Zalo after trim (zalo.md not loading properly), revert AGENTS.md from git to restore inline content. The moved content exists in both places during the transition commit — reverting AGENTS.md is a 1-command fix.

---

## Part D: Fix Skill Creation (Broken)

### Root Cause

Two bugs prevent CEO from creating custom skills via Telegram chat.

**Bug 1: Missing trigger in Capability Router table (AGENTS.md lines 279-307)**

The Capability Router is the bot's primary routing — line 273 says "LUAT SAT." But skill creation keywords are NOT in the table. The skill builder section exists at line 314 but is OUTSIDE the trigger table. With 32K AGENTS.md, the bot doesn't connect CEO's message to this section.

Missing triggers: "tao skill", "day em", "them rule", "tu gio khi X thi Y", "nho giup anh la"

**Bug 2: Explicit `headers` in skill-builder.md may override auto-injected auth**

Cron management (works) uses no explicit headers:
```
web_fetch http://127.0.0.1:20200/api/cron/create?label=...&content=...
```
Gateway auto-injects `x-9bizclaw-agent-channel: telegram` + `Authorization: Bearer <token>`.

Skill builder (broken) uses explicit headers:
```
web_fetch url="..." method=POST body="{...}" headers="{\"Content-Type\":\"application/json\"}"
```
If openclaw's web_fetch replaces rather than merges headers, explicit `Content-Type` drops the auth headers -> 403.

### Fix 1: Add trigger to Capability Router

Add row to the trigger table in AGENTS.md:

```
| "tao skill", "day em quy trinh", "them rule moi", "tu gio khi", "tao quy tac" | `skill_builder` | `skills/operations/skill-builder.md` |
```

### Fix 2: Remove explicit headers from skill-builder.md

Change all web_fetch calls in skill-builder.md to NOT set explicit `headers`. The gateway auto-injects Content-Type for POST requests with body. Match the cron-management.md pattern.

Before:
```
web_fetch url="http://127.0.0.1:20200/api/user-skills/create" method=POST body="{...}" headers="{\"Content-Type\":\"application/json\"}"
```

After:
```
web_fetch url="http://127.0.0.1:20200/api/user-skills/create" method=POST body="{...}"
```

Apply to all 6 web_fetch POST calls in skill-builder.md (create, update, delete, toggle, restore, check-conflict).

### Files

| File | Change |
|---|---|
| `AGENTS.md` | Add skill_builder trigger row to Capability Router table |
| `skills/operations/skill-builder.md` | Remove explicit `headers` from all POST web_fetch calls |

### Verification

1. CEO sends "tao skill moi: khi khach hoi gia iPhone luon bao co khuyen mai" on Telegram
2. Bot reads skill-builder.md (verify via gateway log showing read_file call)
3. Bot proposes all fields, CEO confirms
4. web_fetch to /api/user-skills/create returns 200 (not 403)
5. Telegram receives system confirmation: "Da tao skill ..."
6. Send Zalo DM mentioning "gia iPhone" -> bot applies custom skill in reply

## Verification Plan

After implementation:

1. **Zalo trim:** Send Zalo DM asking about product -> bot follows sales playbook from zalo.md
2. **Memory noise:** Run 3 recurring crons -> check `ceo-memory` table: should have 0 new task entries (all routine success)
3. **Type priority:** Manually write 1 correction + 1 rule + 5 tasks -> regenerate CEO-MEMORY.md -> correction and rule appear first
4. **Dynamic budget:** Check CEO-MEMORY.md size after trim -> should be ~8K chars (not 2K)
5. **CEO observation:** Have multi-turn Telegram conversation with implicit preference signal -> check if bot writes preference memory
