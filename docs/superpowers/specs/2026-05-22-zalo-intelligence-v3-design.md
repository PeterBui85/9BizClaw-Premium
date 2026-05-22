# Zalo Intelligence v3 — Full Redesign

**Date:** 2026-05-22
**Status:** Draft
**Supersedes:** `smart-zalo-memory-design.md`, `smart-zalo-memory-v2-design.md`

---

## Problem

Bot has 23 defensive security layers but ZERO offensive intelligence. Every Zalo conversation is processed as if bot has never met the person before. No memory injection, no contact classification, no real-time learning, no proactive behavior.

## Architecture: 5 Intelligence Layers at 1 Injection Point

All intelligence converges at `inbound.ts ~line 2195` where `rawBody` is finalized. One patch, 5 layers.

```
Message arrives → 23 security gates → INTELLIGENCE INJECTION → context-aware AI → filtered reply → LEARN
                                        ↑
                              L1: Identity (who?)
                              L2: Context (history?)
                              L3: Adaptation (how to respond?)
                              L4: Learning (what to remember?)
                              L5: Proactive (what to flag?)
```

## Verified Constraints (tested 2026-05-22)

- `openzca db` disabled by default — must enable on boot
- `openzca db sync all` gets group history but 0 DMs (Zalo API limit)
- DMs accumulate only via live listener
- Channel detection in conversation.js: fixed today (sender ID format)
- Customer profiles exist at `memory/zalo-users/<senderId>.md` — written nightly, never read during conversations

---

## L1: Identity Layer — WHO is this person?

### On every inbound message:

1. Read `memory/zalo-users/<senderId>.md` if exists
2. Parse frontmatter: name, type, stage, lastSeen, msgCount, tags, interests
3. If file doesn't exist → new contact, create stub immediately:
   ```yaml
   ---
   name: [from senderName]
   zaloName: [from senderName]
   type: unknown
   firstSeen: [now]
   lastSeen: [now]
   msgCount: 1
   ---
   ```
4. Update `lastSeen` and increment `msgCount` on every message (write-through, debounced 5s)

### For group messages additionally:

5. Read `memory/zalo-groups/<threadId>.md` if exists
6. Parse: name, type (customer_group/internal/partner_group), lastActivity, topics

### Contact classification (deferred):

7. After `msgCount >= 5` and `type === 'unknown'`: nightly cron classifies via LLM
8. Reads `openzca db friend messages <userId> --limit 100 --json` for history
9. LLM prompt → returns `{type, confidence, reason}`
10. CEO can override via Telegram: "nguoi nay la nhan vien"

**File changes:** New function `readContactIdentity(senderId)` in `electron/lib/zalo-memory.js`. Called from inbound.ts injection patch.

---

## L2: Context Layer — WHAT happened before?

### Build context block from profile:

1. Extract frontmatter summary (1 line: name, type, stage, interests)
2. Extract last 2-3 dated sections (most recent conversation summaries)
3. For groups: extract group topics + last activity summary
4. Budget: max 1500 chars total for context block

### Context block format:

```
<contact-intelligence>
[Tên: Minh Tú | Loại: client | Stage: negotiating | Quan tâm: iPhone 15, phụ kiện]
[Lần cuối: 20/05 — hỏi giảm giá, chưa chốt]
---
## 2026-05-20
- Khách hỏi giá iPhone 15 — em báo 25.9tr, khách do dự
- Khách muốn giảm 2tr — em escalate CEO
## 2026-05-18
- Khách hỏi bảo hành — em báo 12 tháng
</contact-intelligence>
```

### Supplement from openzca DB (if available):

If profile has < 2 dated sections AND openzca DB enabled:
- Query `openzca db friend messages <userId> --limit 20 --json` (fast, cached)
- Extract last 5 messages as raw context
- Append to context block (below profile sections)

**File changes:** New function `buildContactContext(senderId, isGroup, threadId)` in `electron/lib/zalo-memory.js`. Returns string or empty.

---

## L3: Adaptation Layer — HOW should I respond?

### Type-based directive injected into context block:

```
[DIRECTIVE: type=client → Bán hàng, chăm sóc, reference lịch sử mua. Dùng sales playbook.]
[DIRECTIVE: type=employee → Chuyên nghiệp, task-oriented, hỗ trợ công việc.]
[DIRECTIVE: type=partner → Formal, business-focused, tôn trọng quan hệ đối tác.]
[DIRECTIVE: type=vip → Ưu tiên tuyệt đối, proactive follow-up, white-glove.]
[DIRECTIVE: type=unknown → CSKH mặc định. Qualify qua 2-3 tin đầu.]
```

### Stage-based behavior (clients only):

| Stage | Bot behavior |
|---|---|
| `lead` | Paint after-state, don't push price too early |
| `prospect` | Follow up on báo giá, answer concerns |
| `negotiating` | Handle objections, offer alternatives, know when to escalate |
| `customer` | Upsell, check satisfaction, nurture loyalty |
| `churned` | Re-engage gently, ask what happened |

### AGENTS.md rules:

Add to AGENTS.md (replaces the smaller `<contact-context>` rule we designed earlier):

```markdown
## Hồ sơ liên lạc — tự động inject

Khi thấy block `<contact-intelligence>` ở đầu tin:
- ĐỌC KỸ frontmatter summary + lịch sử gần đây
- Reference lịch sử TỰ NHIÊN: "Lần trước anh hỏi về X..." — KHÔNG nói "em thấy trong hồ sơ"
- Theo [DIRECTIVE] để điều chỉnh giọng văn và chiến lược
- Không có block = khách mới hoàn toàn, CSKH mặc định
```

**File changes:** `AGENTS.md` + `skills/operations/zalo.md` — type-aware behavior rules.

---

## L4: Learning Layer — WHAT did I learn?

### Real-time updates (every message, not nightly):

1. **lastSeen + msgCount** — update on every inbound (debounced 5s write)
2. **Interests** — if bot detects product mention in customer message, append to frontmatter `interests` array
3. **Stage transitions** — detect keywords (see table below), update frontmatter `stage`
4. **Sentiment signal** — if customer tone shifts (complaint, frustration), add tag `needs-attention`

### Stage detection keywords:

| Signal | Transition |
|---|---|
| "giá bao nhiêu", "sản phẩm gì" | → `lead` |
| Bot gửi báo giá | → `prospect` |
| "đắt quá", "giảm được ko", "suy nghĩ" | → `negotiating` |
| "ok chốt", "chuyển khoản", "đặt hàng" | → `customer` |
| 30 ngày không tương tác | → `churned` |

### Nightly enrichment (extend existing):

5. `appendPerCustomerSummaries()` runs as before — LLM summary per customer
6. NEW: also updates frontmatter fields (interests, satisfaction, stage) from summary
7. NEW: classification for unclassified contacts with 5+ messages

### CEO observation (already designed today):

8. Bot observes CEO Telegram conversations → writes preferences, corrections, rules
9. Scoped: explicit "ghi nhớ" = confirm, auto-observations = silent

**File changes:** Extend inbound.ts injection patch to write lastSeen/msgCount. New `detectStageTransition()` in `zalo-memory.js`. Extend `appendPerCustomerSummaries()`.

---

## L5: Proactive Layer — WHAT should I flag?

### Follow-up scanner (improved today):

- 24h stale threshold (was 48h)
- 22 PENDING_HINTS patterns (was 9)
- Runs daily at 9:30 via cron

### NEW: Real-time proactive checks in injection patch:

During the injection (before AI processes), check:

1. **VIP alert:** if `type === 'vip'` → flag in context: `[VIP — ưu tiên trả lời]`
2. **Stale deal:** if `stage === 'negotiating'` and `lastSeen` > 5 days → flag: `[Deal đang stale 5 ngày — cân nhắc follow-up]`
3. **Return customer:** if `lastSeen` > 14 days → flag: `[Khách quay lại sau 14 ngày — chào ấm]`
4. **Repeat complaint:** if last summary contains "khiếu nại" or negative sentiment → flag: `[Khách có issue chưa resolve]`

These flags appear INSIDE the `<contact-intelligence>` block — the AI sees them and adjusts behavior.

### NEW: CEO morning digest (extend morning briefing cron):

Add to morning report:
- Top 5 follow-up candidates (from scanner)
- Deal stage changes yesterday
- VIP activity
- New customers count
- Negative sentiment alerts

**File changes:** Proactive flags in injection patch. Extend morning briefing prompt in `cron.js`.

---

## Boot Prerequisites

### On every app boot (in `_startOpenClawImpl`, `electron/lib/gateway.js`):

```javascript
// 1. Enable openzca DB persistence (idempotent)
await spawnOpenzca(['--profile', 'default', 'db', 'enable']);

// 2. Deep sync (background, non-blocking)
spawnOpenzca(['--profile', 'default', 'db', 'sync', 'all', '--count', '200', '--json'])
  .catch(e => console.warn('[boot] openzca db sync failed (non-fatal):', e?.message));
```

Use existing `findOpenzcaCliJs()` from `electron/lib/zalo-plugin.js` for CLI path resolution. Add `--profile default` to all commands.

---

## The Injection Patch (single entry point for L1-L5)

### Location: `electron/packages/modoro-zalo/src/inbound.ts`

Baked directly into source (NOT runtime injection — per review finding that runtime `ensureZalo*Fix()` pattern is deprecated).

### Position: After USER-SKILLS-INJECT PATCH (line ~1437), before message reaches agent.

### Pseudocode:

```typescript
// === 9BizClaw INTELLIGENCE INJECTION ===
try {
  const ws = process.env['9BIZ_WORKSPACE'] || "";
  if (ws && message.senderId) {
    const sender = String(message.senderId);
    
    // L1: Identity — read or create profile
    const profilePath = path.join(ws, "memory", "zalo-users", sender + ".md");
    let profile = readOrCreateProfile(profilePath, message.senderName);
    
    // L1: Update lastSeen + msgCount (debounced write)
    debouncedUpdateProfile(profilePath, { lastSeen: new Date().toISOString(), msgCount: (profile.msgCount || 0) + 1 });
    
    // L2: Context — build from profile + optional openzca supplement
    let ctx = buildFrontmatterSummary(profile); // 1 line: name, type, stage, interests
    ctx += buildRecentSections(profileContent, 2); // last 2 dated sections
    
    // L2: Group context (if group message)
    if (message.isGroup) {
      const groupCtx = readGroupProfile(ws, message.threadId);
      if (groupCtx) ctx += "\n[Nhóm: " + groupCtx + "]";
    }
    
    // L3: Adaptation — type-based directive
    ctx += "\n[DIRECTIVE: type=" + (profile.type || 'unknown') + " → " + getDirective(profile.type) + "]";
    
    // L4: Stage detection (clients only)
    if (profile.type === 'client') {
      const newStage = detectStageFromMessage(rawBody, profile.stage);
      if (newStage && newStage !== profile.stage) {
        debouncedUpdateProfile(profilePath, { stage: newStage });
        ctx += "\n[Stage: " + profile.stage + " → " + newStage + "]";
      }
    }
    
    // L5: Proactive flags
    if (profile.type === 'vip') ctx += "\n[VIP — ưu tiên trả lời]";
    const staleDays = daysSince(profile.lastSeen);
    if (profile.stage === 'negotiating' && staleDays > 5) ctx += "\n[Deal stale " + staleDays + " ngày]";
    if (staleDays > 14) ctx += "\n[Khách quay lại sau " + staleDays + " ngày — chào ấm]";
    
    // Inject (max 1500 chars)
    if (ctx.length > 1500) ctx = ctx.slice(0, 1500);
    rawBody = "<contact-intelligence>\n" + ctx.trim() + "\n</contact-intelligence>\n\n" + rawBody;
  }
} catch (e) { /* fail open */ }
// === END 9BizClaw INTELLIGENCE INJECTION ===
```

---

## Implementation Phases

| Phase | Layers | What | Time |
|---|---|---|---|
| **1** | L1 + L2 | Boot sync + profile read/create + context injection into rawBody | 2 days |
| **2** | L3 | Type directives in AGENTS.md + zalo.md | 0.5 day |
| **3** | L4 | Real-time lastSeen/msgCount + stage detection + nightly classification | 2 days |
| **4** | L5 | Proactive flags in injection + morning digest enhancement | 1 day |

Phase 1 alone makes the bot contextually aware. Each subsequent phase adds intelligence.

---

## Files Changed

| File | Change | Phase |
|---|---|---|
| `electron/lib/gateway.js` | Boot: openzca db enable + sync | 1 |
| `electron/lib/zalo-memory.js` | readOrCreateProfile, buildContactContext, detectStageTransition, classifyContact | 1, 3 |
| `electron/packages/modoro-zalo/src/inbound.ts` | Intelligence injection patch (L1-L5 combined) | 1 |
| `AGENTS.md` | `<contact-intelligence>` rules + type directives | 2 |
| `skills/operations/zalo.md` | Type-aware behavior guidance | 2 |
| `electron/lib/conversation.js` | Extend appendPerCustomerSummaries with frontmatter updates | 3 |
| `electron/lib/cron.js` | Nightly classification job + morning digest enhancement | 3, 4 |

## Migration

- Boot: `openzca db enable` idempotent. First sync pulls available history.
- Existing `memory/zalo-users/*.md` preserved — new fields added progressively.
- New profiles auto-created on first message (stub with `type: unknown`).
- AGENTS.md v104+ handles template overwrite.
- Inbound.ts patch baked into source — ships with `modoro-zalo` plugin via `extraResources`.

## Verification

1. Boot → console: `[boot] openzca db sync done`
2. Zalo DM from known contact → `<contact-intelligence>` block in gateway log
3. Bot references past conversation naturally
4. New contact → stub profile created immediately
5. After 5+ messages → nightly cron classifies → `type: client`
6. Client at negotiating for 6 days → proactive flag in context
7. CEO asks "tóm tắt zalo" → conversation history correctly shows Zalo messages (channel detection fix)
