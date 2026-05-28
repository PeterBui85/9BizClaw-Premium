# Smart Zalo Memory System v2 — Design Spec

**Date:** 2026-05-22
**Status:** Draft

---

## Problem

Current memory system is an audit trail, not working context. Bot is amnesiac during conversations — never reads customer history before responding. Everyone treated identically regardless of relationship type. Group memory created once, never updated. No deal tracking, no proactive follow-ups.

## Goals

1. Auto-classify contacts by relationship type (client/employee/partner/vip/unknown) from message history
2. Per-type memory schemas with relevant fields for each relationship
3. Real-time memory injection — bot reads contact profile BEFORE every response
4. Deal stage auto-tracking for clients (lead → prospect → negotiating → customer → churned)
5. Group intelligence — daily auto-update with topics, active members, decisions
6. Proactive behaviors — follow-ups, stale deals, contract expiry, VIP alerts
7. Migration — batch classify all existing contacts on first boot

## Implementation Phases

| Phase | Components | Time |
|---|---|---|
| **1 (core)** | Classification + schemas + real-time injection | 2-3 days |
| **2 (tracking)** | Deal stage tracking + group intelligence | 2 days |
| **3 (proactive)** | Proactive behaviors + migration batch | 2 days |

---

## Phase 1: Classification + Schemas + Real-Time Injection

### 1.1 Contact Classifier

**When it runs:**
- First message from new/unclassified contact (no `type:` in frontmatter)
- Monthly re-scan cron for all contacts (detect relationship changes)
- CEO override via Dashboard or Telegram ("nguoi nay la nhan vien")

**How it works:**
1. Extract last 100 messages from conversation history for this contact via `extractConversationHistoryRaw({ senderId, maxMessages: 100 })`
2. Send to 9Router LLM with classification prompt:
   ```
   Phan loai nguoi nay dua tren lich su tin nhan. Chi tra ve 1 trong: client, employee, partner, vip, unknown.
   Giai thich ngan gon ly do.
   Tin nhan:
   [messages]
   ```
3. Parse response → update frontmatter `type:` field
4. If `unknown` after 5+ messages → default to `client` (most common Zalo contact)

**Detection signals per type:**

| Type | Signals in messages |
|---|---|
| `client` | Hoi gia, san pham, dat hang, khieu nai, "muon mua", "bao nhieu" |
| `employee` | Noi bo, task, bao cao, "sep oi", "em da lam xong", xin nghi |
| `partner` | Hop dong, dai ly, B2B, "cong ty chung toi", "hop tac" |
| `vip` | CEO tag manual, OR deal value > threshold, OR repeat purchase 3+ |
| `unknown` | New contact, < 5 messages, no clear signals |

**File:** New function `classifyContact(senderId)` in `electron/lib/zalo-memory.js`

### 1.2 Per-Type Memory Schemas

Each contact type gets type-specific frontmatter fields added to `memory/zalo-users/<senderId>.md`.

**Base fields (all types):**
```yaml
---
name: Ten Khach
zaloName: Ten Zalo
type: client
lastSeen: 2026-05-22T14:30:00Z
msgCount: 47
gender: M
tags: []
groups: []
---
```

**Client-specific fields:**
```yaml
stage: lead|prospect|negotiating|customer|churned
interests: ["iPhone 15", "phu kien"]
priceDiscussed: "25.9tr"
satisfaction: high|medium|low
nextFollowUp: 2026-05-25
dealValue: 25900000
purchaseCount: 3
lastPurchase: 2026-05-10
```

**Employee-specific fields:**
```yaml
role: "Nhan vien kinh doanh"
department: "Sales"
responsibilities: ["bao gia", "CSKH Zalo"]
currentTasks: ["follow-up khach Minh Tu"]
```

**Partner-specific fields:**
```yaml
company: "ABC Corp"
partnerRole: "Giam doc kinh doanh"
contractStatus: active|negotiating|expired
contractExpiry: 2026-12-31
lastMeeting: 2026-05-20
```

**Schema enforcement:** `updateContactProfile(senderId, fields)` validates fields against type schema. Rejects invalid fields (e.g., `stage` for employee). Existing untyped profiles get `type: unknown` on migration.

**File:** Extend `electron/lib/zalo-memory.js` with schema definitions and `updateContactProfile()`.

### 1.3 Real-Time Memory Injection

**The core change.** On every Zalo inbound message, inject contact memory into the message context before bot processes it.

**Injection point:** `electron/packages/modoro-zalo/src/inbound.ts` — after the existing USER-SKILLS-INJECT PATCH, before the message reaches the AI agent.

**Injection logic:**
1. Read `memory/zalo-users/<senderId>.md` (skip if not found — new contact)
2. Parse frontmatter → extract type + key fields
3. Build context string based on type:

**Client injection template:**
```
<customer-context>
Ten: Minh Tu | Loai: Khach hang | Stage: negotiating
Quan tam: iPhone 15, phu kien | Gia da ban: 25.9tr
Lan cuoi: 20/05 — hoi giam gia, chua chot
Follow-up: 25/05
---
## 2026-05-20
- Khach hoi gia iPhone 15 — em bao 25.9tr, khach do du
- Khach muon giam 2tr — em escalate CEO
</customer-context>
```

**Employee injection template:**
```
<employee-context>
Ten: Lan | Loai: Nhan vien | Bo phan: Sales
Nhiem vu hien tai: follow-up 3 khach, bao cao tuan
---
## 2026-05-21
- Lan bao cao da chot 2 don, con 1 khach chua tra loi
</employee-context>
```

**Partner injection template:**
```
<partner-context>
Ten: Ong Duc | Loai: Doi tac | Cong ty: ABC Corp
Hop dong: active, het han 31/12/2026
---
## 2026-05-15
- Thao luan gia dai ly mua — chua chot
</partner-context>
```

**Unknown injection template:**
```
<contact-context>
Ten: Nguoi Moi | Chua phan loai
(Khong co lich su)
</contact-context>
```

4. Prepend context block to rawBody (same pattern as `<active-user-skills>`)
5. Budget: max 1500 chars for injection (frontmatter summary + last 2-3 dated sections)

**AGENTS.md update:** Add rule telling bot how to use `<customer-context>` / `<employee-context>` / etc.:
```
Khi thay block <customer-context> hoac <employee-context> hoac <partner-context> o dau tin — day la ho so nguoi dang nhan. DOC KY va dieu chinh reply theo:
- client: ban hang, cham soc, reference lich su mua
- employee: chuyen nghiep, task-oriented
- partner: formal, business-focused
- KHONG nhac "em thay trong ho so" — phai tu nhien nhu tu biet san
```

**File:** New patch `ensureZaloMemoryInjectionFix()` in `electron/main.js`, injecting into `inbound.ts`.

### 1.4 Nightly Profile Enrichment

Extend existing `appendPerCustomerSummaries()` to also update frontmatter fields:

After summarizing the day's conversation, LLM also extracts:
- New interests detected
- Satisfaction signals (positive/negative)
- Stage change signals (for clients)
- Task updates (for employees)
- Deal value mentions

These get written to frontmatter via `updateContactProfile()`.

**File:** Modify `electron/lib/conversation.js:appendPerCustomerSummaries()`

---

## Phase 2: Deal Stage Tracking + Group Intelligence

### 2.1 Deal Stage Auto-Tracking (clients only)

**Stage transitions detected from conversation:**

| From | Signal | To |
|---|---|---|
| `unknown/none` | "hoi gia", "san pham gi", "bao nhieu" | `lead` |
| `lead` | Bot gui bao gia, hoac khach xem bao gia | `prospect` |
| `lead` | 14 ngay khong tuong tac | `churned` |
| `prospect` | "dat qua", "giam duoc ko", "suy nghi" | `negotiating` |
| `prospect` | 14 ngay khong tuong tac | `churned` |
| `negotiating` | "ok chot", "chuyen khoan", "dat hang" | `customer` |
| `negotiating` | 21 ngay khong tuong tac | `churned` |
| `customer` | 60 ngay khong tuong tac | `churned` |

**Implementation:** After each customer DM, check for stage transition keywords. If detected, update frontmatter and notify CEO via Telegram: "Khach [ten] chuyen tu [stage_cu] sang [stage_moi]."

**File:** New function `detectStageTransition(senderId, messages)` in `electron/lib/zalo-memory.js`. Called from nightly `appendPerCustomerSummaries()` AND optionally from real-time injection patch.

### 2.2 Group Intelligence

**Extend nightly cron to update group memory** alongside customer memory.

`appendPerGroupSummaries(ws, dateStr, sinceMs)` — new function in `conversation.js`:
1. Extract group messages from last 24h
2. Group by `threadId`
3. For each group with 3+ messages: LLM summarize:
   - Topics discussed
   - Active members (who spoke)
   - Decisions/commitments
   - Group mood/sentiment
4. Append dated section to `memory/zalo-groups/<groupId>.md`
5. Update frontmatter: lastActivity, topicsSummary

**Group type classification** (same as contact classification):
- `customer_group` — product questions, support, sales
- `internal` — team chat, tasks, operations
- `partner_group` — B2B discussions, contracts

**Group memory injection:** When bot replies in group, inject group profile (same pattern as DM injection but using `<group-context>` tag).

**File:** New function in `electron/lib/conversation.js`, called from `writeDailyMemoryJournal()`.

---

## Phase 3: Proactive Behaviors + Migration

### 3.1 Proactive Follow-Up Alerts

Enhance existing `scanZaloFollowUpCandidates()` with type-aware logic:

| Type | Trigger | Alert to CEO |
|---|---|---|
| `client` at `negotiating` | 7+ days stale | "Khach [ten] dang dam phan 7 ngay roi, chua chot. Follow-up?" |
| `client` at `prospect` | 5+ days stale | "Khach [ten] da xem bao gia 5 ngay, chua phan hoi" |
| `vip` | 14+ days inactive | "VIP [ten] khong tuong tac 14 ngay. Nen hoi tham?" |
| `employee` | Pending task 3+ days | "NV [ten] co task chua hoan thanh 3 ngay" |
| `partner` | Contract expiry < 30 days | "Hop dong [cong ty] het han trong [N] ngay" |

**CEO gets daily digest** (morning cron) of all pending follow-ups, sorted by priority.

**File:** Extend `electron/lib/cron.js:scanZaloFollowUpCandidates()`

### 3.2 Migration — Batch Classify Existing Contacts

**One-time batch job on first boot after update:**

1. Scan all `memory/zalo-users/*.md` files
2. For each without `type:` in frontmatter:
   a. Extract last 100 messages from history
   b. LLM classify → write `type:` + inferred fields
3. Batch 5 contacts in parallel
4. Progress log: `[migration] classified 47/120 contacts`
5. Mark migration complete in `app-prefs.json`

**Idempotent:** Skip contacts that already have `type:` field. Re-runnable on crash.

**File:** New function `migrateContactTypes()` in `electron/lib/zalo-memory.js`, called from `app.whenReady()`.

### 3.3 Group Migration

Same pattern — scan all `memory/zalo-groups/*.md`, classify as `customer_group|internal|partner_group`, backfill frontmatter.

---

## Files Changed

| File | Change | Phase |
|---|---|---|
| `electron/lib/zalo-memory.js` | classifyContact, updateContactProfile, schemas, detectStageTransition, migrateContactTypes | 1, 2, 3 |
| `electron/packages/modoro-zalo/src/inbound.ts` | Memory injection patch (read profile, build context, prepend to rawBody) | 1 |
| `electron/main.js` | ensureZaloMemoryInjectionFix() patch | 1 |
| `electron/lib/conversation.js` | Extend appendPerCustomerSummaries for frontmatter enrichment + new appendPerGroupSummaries | 1, 2 |
| `AGENTS.md` | Add rules for <customer-context> etc. tags | 1 |
| `skills/operations/zalo.md` | Update memory section with type-aware behavior | 1 |
| `electron/lib/cron.js` | Type-aware follow-up scanner, daily digest, monthly re-classify cron | 2, 3 |
| `electron/ui/dashboard.html` | Contact type badge/filter in Zalo manager, group memory viewer | 2 |

## Verification Plan

**Phase 1:**
1. New Zalo DM → bot auto-classifies as `client` → frontmatter updated
2. Same customer messages again → bot response references past conversation naturally
3. CEO tags someone as `employee` → bot switches to professional tone
4. Check injection: gateway log shows `<customer-context>` in processed rawBody

**Phase 2:**
5. Client asks about price → stage moves to `lead` → CEO notified
6. Group has 5+ messages today → nightly cron writes group summary

**Phase 3:**
7. Client at `negotiating` for 8 days → CEO gets follow-up alert
8. Migration: 50 existing contacts auto-classified, progress logged
