# Smart Zalo Memory v2 — Design Spec (Phase 1 + 2)

**Date:** 2026-05-22
**Status:** Draft
**Supersedes:** `2026-05-22-smart-zalo-memory-design.md` (first draft, pre-testing)

---

## Problem

Bot is amnesiac during Zalo conversations — never reads customer history before responding. All contacts treated identically. No classification (client/employee/partner). Group memory dead after boot.

## Verified Constraints (tested 2026-05-22)

- `openzca db` persistence is **disabled by default** — must explicitly enable
- `openzca db sync all` pulls group history (142+ msgs) + friend metadata (6 friends) but **0 DM messages** (Zalo API limitation — DMs only accumulate via live listener)
- DM classification must be **deferred** until 5+ messages accumulate per contact
- `openzca db friend messages <userId>` works once DMs are in the DB
- Group messages available immediately — can use for group-level context

## Goals (Phase 1 + 2)

1. **Phase 1:** Boot enables openzca DB + syncs. Bot reads contact profile before every Zalo response (DM + group). Immediate memory injection.
2. **Phase 2:** Nightly cron auto-classifies contacts with 5+ DMs into types (client/employee/partner/vip). Bot adapts behavior per type.

## Non-Goals (Phase 3-6, future)

- Deal stage auto-tracking (lead → customer → churned)
- Group intelligence (daily group summary updates)
- Proactive follow-up alerts
- Per-type persona switching

---

## Phase 1: Boot Prerequisites + Real-Time Memory Injection

### 1.1 Boot: Enable openzca DB + Sync

**Where:** `electron/main.js`, inside `_startOpenClawImpl()` after `start9Router()` and before gateway spawn.

**What:**
```javascript
// 1. Enable DB persistence (idempotent — no-op if already enabled)
await spawnOpenzca(['db', 'enable']);

// 2. Deep sync: groups + friends + DM windows (background, non-blocking)
spawnOpenzca(['db', 'sync', 'all', '--count', '200', '--json'])
  .then(r => console.log('[boot] openzca db sync done:', r?.groupsSynced, 'groups,', r?.friendsSynced, 'friends'))
  .catch(e => console.warn('[boot] openzca db sync failed (non-fatal):', e?.message));
```

**`spawnOpenzca(args)` helper:** Uses the same `findNodeBin()` + vendor openzca path pattern as `spawnOpenClawSafe()`. Returns parsed JSON stdout. Timeout 60s. Non-fatal on failure (sync is best-effort).

**Migration:** On first boot after update, DB transitions from disabled → enabled. Subsequent boots: enable is no-op, sync is incremental (only new messages).

### 1.2 Real-Time Memory Injection

**The core change.** On every Zalo inbound message, inject contact memory into rawBody before bot processes it.

**Injection point:** `electron/packages/modoro-zalo/src/inbound.ts` — new patch `ensureZaloMemoryInjectionFix()` in `main.js`. Injected AFTER the existing USER-SKILLS-INJECT PATCH, BEFORE the message reaches the AI agent.

**Injection logic (TypeScript injected into inbound.ts):**

```typescript
// === 9BizClaw MEMORY-INJECT PATCH ===
try {
  const __mzFs = require("node:fs");
  const __mzPath = require("node:path");
  const __mzWs = process.env['9BIZ_WORKSPACE'] || "";
  if (__mzWs) {
    const __sender = String(message.senderId || "");
    if (__sender) {
      const __profilePath = __mzPath.join(__mzWs, "memory", "zalo-users", __sender + ".md");
      if (__mzFs.existsSync(__profilePath)) {
        try {
          const __raw = __mzFs.readFileSync(__profilePath, "utf-8");
          // Extract frontmatter
          const __fmMatch = __raw.match(/^---\n([\s\S]*?)\n---/);
          const __fm = __fmMatch ? __fmMatch[1] : "";
          // Extract last 2 dated sections (most recent context)
          const __sections = __raw.match(/\n## \d{4}-\d{2}-\d{2}\n[\s\S]*?(?=\n## \d{4}-\d{2}-\d{2}|$)/g) || [];
          const __recent = __sections.slice(-2).join("\n").trim();
          // Build context block (max 1500 chars)
          let __ctx = __fm;
          if (__recent) __ctx += "\n---\n" + __recent;
          if (__ctx.length > 1500) __ctx = __ctx.slice(0, 1500);
          if (__ctx.trim()) {
            rawBody = "<contact-context>\n" + __ctx.trim() + "\n</contact-context>\n\n" + rawBody;
          }
        } catch (__e) {
          runtime.log?.("modoro-zalo: memory inject read error: " + String(__e));
        }
      }
    }
  }
}  catch (__e) { /* fail open — no injection is safe */ }
// === END 9BizClaw MEMORY-INJECT PATCH ===
```

**Key design decisions:**
- **Fail open:** If profile doesn't exist or read fails, message passes through unchanged (no injection, not blocked)
- **Budget:** Max 1500 chars injected (frontmatter + last 2 dated sections). Keeps context tight.
- **Both DM + group:** Injection fires for every message regardless of isGroup. In groups, bot knows who each speaker is.
- **No new IPC/API:** Direct filesystem read in the gateway process (same as blocklist/allowlist patches). Fast, no round-trip.

### 1.3 AGENTS.md Rules for Contact Context

Add to AGENTS.md after the "Skill tuy chinh" section:

```markdown
## Ho so lien lac — tu dong inject

Khi thay block `<contact-context>` o dau tin — day la ho so nguoi dang nhan tin. BOT DOC KY va dieu chinh:
- Reference lich su tu nhien: "Lan truoc anh hoi ve X, hom nay em co tin moi..." — KHONG noi "em thay trong ho so"
- Neu co `type: client` → ban hang, cham soc, follow-up don hang, sales playbook
- Neu co `type: employee` → chuyen nghiep, task-oriented, ho tro cong viec noi bo
- Neu co `type: partner` → formal, business-focused, ton trong quan he doi tac
- Neu co `type: vip` → uu tien tuyet doi, proactive, white-glove service
- Khong co `type` hoac `type: unknown` → CSKH mac dinh (giong hien tai)
- KHONG BAO GIO noi "theo ho so cua anh" hay "em doc profile cua anh" — phai TU NHIEN nhu tu biet san
```

### 1.4 Nightly Profile Enrichment (extend existing)

Extend `appendPerCustomerSummaries()` in `conversation.js` to also:
1. Read `openzca db friend messages <userId> --since 24h --json` for richer summary context (supplements gateway session JSONL which may miss some messages)
2. Update `msgCount` in frontmatter (increment by today's message count)
3. Update `lastSeen` timestamp

This enriches profiles over time even without classification.

---

## Phase 2: Deferred Contact Classification

### 2.1 Classification Trigger

**Nightly cron** (new job in `startCronJobs()`):
1. Scan all `memory/zalo-users/*.md` files
2. For each: parse frontmatter, check `msgCount >= 5` AND no `type:` field (or `type: unknown`)
3. Collect up to 20 unclassified contacts per night

### 2.2 Classification Process

For each unclassified contact:
1. Read messages: `openzca db friend messages <userId> --limit 100 --json`
2. If 0 DM messages in DB: try `openzca db chat messages <chatId> --limit 100 --json` (chatId = userId for DMs)
3. If still 0: skip — not enough data yet
4. Build LLM prompt:

```
Phan loai moi quan he cua nguoi nay voi CEO dua tren lich su tin nhan.
Chi tra ve JSON: {"type": "client|employee|partner|unknown", "confidence": 0.0-1.0, "reason": "..."}

Dau hieu:
- client: hoi gia, san pham, dat hang, khieu nai, bao hanh
- employee: bao cao, task noi bo, xin nghi, "em da lam xong", "sep oi"
- partner: hop dong, dai ly, B2B, cong ty khac, "hop tac", "dai dien"

Tin nhan:
[messages as sender: content pairs]
```

5. Send to 9Router (temperature 0.1, max 200 tokens)
6. Parse response → write `type:` to frontmatter
7. If `confidence < 0.5` → keep as `unknown`, re-try next week
8. Batch 5 contacts at a time (parallel), max 20 per night

### 2.3 CEO Override

**Telegram command:** CEO says "nguoi nay la nhan vien" or "tag [ten] = partner" → bot updates frontmatter `type:` field via memory write API.

**Dashboard:** Future — contact type badge/dropdown in Zalo manager. Not in this phase.

### 2.4 Re-classification

Monthly cron re-scans contacts where:
- `type: unknown` and `msgCount` grew since last attempt
- `type` was set > 60 days ago and msgCount doubled (relationship may have changed)

---

## Files Changed

| File | Change | Phase |
|---|---|---|
| `electron/main.js` | `spawnOpenzca` helper + boot enable/sync + `ensureZaloMemoryInjectionFix()` | 1 |
| `electron/packages/modoro-zalo/src/inbound.ts` | Memory injection patch (via ensureZaloMemoryInjectionFix) | 1 |
| `AGENTS.md` | Add `<contact-context>` behavior rules (~300 chars) | 1 |
| `skills/operations/zalo.md` | Add note about memory injection awareness | 1 |
| `electron/lib/conversation.js` | Extend appendPerCustomerSummaries: openzca db supplement + msgCount update | 1 |
| `electron/lib/cron.js` | New nightly classification job | 2 |
| `electron/lib/zalo-memory.js` | `classifyContact()` function + schema validation | 2 |

## Migration

- **Boot:** `openzca db enable` is idempotent. First sync pulls all available data. No user action needed.
- **Existing profiles:** Preserved. New `type:` field added progressively by nightly cron. No breaking changes.
- **AGENTS.md v104:** Already handles template overwrite from today's session.
- **Version bump:** Included in current v2.4.7 build cycle.

## Verification

**Phase 1:**
1. Boot app → console shows `[boot] openzca db sync done: N groups, M friends`
2. Zalo DM from known contact → gateway log shows `<contact-context>` in processed rawBody
3. Bot response naturally references past conversations ("Lan truoc anh hoi ve iPhone...")
4. New contact with no profile → no injection, bot responds normally (fail open)

**Phase 2:**
5. Contact with 5+ DMs → nightly cron classifies → frontmatter shows `type: client`
6. Next DM → `<contact-context>` includes `type: client` → bot uses sales playbook tone
7. CEO says "nguoi nay la partner" → type overridden → next DM uses formal tone
