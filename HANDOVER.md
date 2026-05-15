# MODOROClaw v2.4.4 — Handover (May 12–15, 2026)

> **Branch:** `main` — all work uncommitted in working tree
> **Status:** NOT shipped. v2.4.4 tag unchanged. Do NOT build/push unless Peter explicitly says so.
> **Last commit:** `0689d32` (chore: regenerate system map)

---

## 1. What was built (committed, May 12–14)

### 1.1 User Skills System (May 14, 8 commits)
Full skill lifecycle: create via Telegram chat or Dashboard, store in `user-skills/`, conflict detection against shipped skills.

- **`electron/lib/skill-manager.js`** — registry CRUD, `matchActiveSkills(rawBody, {scope})`, shipped skill scanner, `_APPLIESTO_PATH_MIGRATIONS` (62 entries), Anthropic folder layout support (`<id>/SKILL.md` + `scripts/*.py`)
- **`/api/user-skills/*`** HTTP endpoints in `cron-api.js` for Telegram-side creation
- **7 IPC handlers + 7 preload bridges** for Dashboard CRUD
- **Dashboard Skills tab** — view shipped (26) + CRUD user skills, conflict check UI
- **AGENTS.md v99** — skill cooperation rules, creation instructions
- **Path traversal guard** on `getUserSkillContent`
- **`seedWorkspace()`** creates `user-skills/` on fresh install

### 1.2 Native In-App Chat (May 14, 4 commits)
Replaced webview-based chat with native send/receive via openclaw agent CLI.

- **`electron/lib/chat.js`** — `sendChatMessage()` spawns `openclaw agent --json`, `getChatHistory()` reads session jsonls, `_parseAgentJsonOutput()` handles 3 stdout formats, lazy user-skill injection via `_injectActiveSkills()`
- **IPC + preload** — `send-chat-message`, `get-chat-history`
- **Dashboard** — chat UI with optimistic user bubble, typing indicator, 20s history poll, error states (boot/gateway/no-chatid), auto-scroll
- **Removed** prewarm/webview chat code

### 1.3 Wizard Redesign (May 13, 1 commit)
6 steps → 4 steps. Sidebar frequency-based layout.

### 1.4 ChatGPT Cookie Bridge (May 14, 2 commits)
Opens ChatGPT connect URL in default browser via cookie-bridge redirect. Port guard ensures cron-api is started first.

### 1.5 v2.4.4 Baseline Fixes (May 12–13, 4 commits)
- Facebook anti-shadow-ban (post interval enforcement)
- `web_fetch` block regex widened in `inbound.ts`
- EBUSY resilience for temp dir cleanup in skill-runner
- Calendar dark mode (CSP font-src, FC variable overrides)
- Cron API logging, splash overflow, brand assets, blocklist defaults
- License obfuscation build step, repo owner update

---

## 2. What was built (uncommitted, May 15)

### 2.1 Skill Library Consolidation (29 → 26 skills)
- **Merged:** `zalo-customer-care.md` + `zalo-reply-rules.md` + `zalo-group.md` → `zalo.md` (8.5KB)
- **Merged:** `google-sheet.md` into `google-workspace.md`
- **Renamed:** `facebook-image.md` → `image-generation.md`
- **Deleted:** `send-zalo.md` (duplicate of `telegram-ceo.md`)
- **Deleted:** 12 template gallery skills (marketing/, content/, finance/, strategy/) — these were never shipped, template gallery feature deferred
- **Updated:** `skills/INDEX.md` (15 ops + 2 marketing + 9 industry = 26)
- **Updated:** `capabilities/*.contract.json` ownerSource references
- **Updated:** `AGENTS.md` routing table for renamed skills

### 2.2 Two Rounds of Multi-Agent Code Review (18 subagents total)
Round 1: 7 reviewers + 2 overseers → 7 critical findings (all real, 0 hallucinations)
Round 2: 7 reviewers + 2 overseers → 4 critical findings (all real, 0 hallucinations)
All findings fixed. See section 3 for details.

### 2.3 Cron Group Swap Fix (customer prod incident)
**Incident:** CEO instructed bot to create cron for Group A, bot bound to Group B (both named "LICH CA NHAN").

**3-layer fix in `cron-api.js`:**
1. **Ambiguous-name 409 guard** with NFC Unicode normalization — rejects when groupName matches 2+ groups
2. **id↔name cross-check** — rejects groupId/groupName mismatch (400)
3. **STRICT MODE** — agent-mode cron MUST provide BOTH `groupId` AND `groupName` (400 if either missing)

**Plus:**
- `/api/cron/audit` endpoint scans existing crons for prompt-vs-stored target mismatch
- CEO echo with last-4 of groupId for visual confirmation
- `targetId + isGroup:true` without groupName → 400 (closes B-I2 bypass)
- Test: `.tmp-cron-swap-test.js` (12/12 pass)

### 2.4 Cron-API Auth Gate Hardened
- Global default-deny `_requireCeoTelegram()` — BOTH `X-Source-Channel: telegram` AND `Authorization: Bearer <token>` with `crypto.timingSafeEqual`
- PUBLIC_ROUTES allowlist for `/api/auth/token` and `/api/capabilities` only
- 404 response stripped of endpoint list (was leaking attack surface)

### 2.5 Windows Sleep Cron Catch-Up (`cron.js`)
- `replayMissedCrons(sinceMs)` — walks sleep gap minute-by-minute with hand-rolled cron expression matcher
- `_seedRecentFiresFromAudit()` — crash idempotency from tail of `audit.jsonl`
- `_withKnowledgeLock()` — separate lock from `_withCustomCronLock`
- Zalo pause check before agent spawn

### 2.6 `matchActiveSkills` Scope Filtering (`skill-manager.js`)
- New `opts.scope` parameter filters by `appliesTo` — prevents cross-channel skill injection
- `inbound.ts` passes Zalo-relevant scopes
- Standalone skills (empty appliesTo) match every scope
- `persistAppliesToMigrationIfNeeded()` — one-shot boot migration for 62 renamed paths

### 2.7 9Router API Key Sync (`nine-router.js`)
- **Bug:** In-app Chat returned "HTTP 401: Invalid API key" — openclaw.json had stale API key
- **Fix:** `ensure9RouterApiKeySync()` reads 9Router `db.json`, compares to openclaw.json, syncs if mismatch
- Called in `start9Router()` after `ensure9RouterDefaultPassword()`

### 2.8 Chat History Persistence (`chat.js`)
- **Bug:** Chat history reset after ~15min — `purgeAgentSessions()` wipes the session jsonls that `getChatHistory()` was reading from
- **Fix:** Dedicated `logs/chat-history.jsonl` in workspace — append on every send/reply, read from there instead
- 512KB cap with automatic trim (drops oldest half)
- Dashboard dedup: `_chatLastSeenTs = Date.now()` after send completes — prevents poll from re-rendering optimistic bubbles

### 2.9 Misc Fixes from Reviews
- `fb-publisher.js`: `enforcePostInterval` re-reads `_loadLastPostAt()` from disk (multi-instance fix)
- `runtime-installer.js`: `cleanNpmStagingDirs` uses positive regex instead of deny-list
- `channels.js`: Layer K output filter — 2 new patterns for Vietnamese process acks
- `inbound.ts`: user-skill content read checks folder layout before flat layout; `__usScopes` Set for Zalo filtering
- `wizard.html`: Step 3 enforces `testTelegram(token, chatId)` before `finishSetup()`
- `workspace.js`: AGENTS.md version bumped 99→101; piggyback file backup before overwrite
- `dashboard-ipc.js`: Various fixes from review
- `smoke-test.js`: Updated assertions

---

## 3. Files touched (uncommitted) — 59 files, +2990/−5957 lines

**Core backend (critical):**
| File | Lines changed | What |
|------|--------------|------|
| `electron/lib/cron-api.js` | +569 | Strict mode, auth gate, audit endpoint, group resolution |
| `electron/lib/skill-manager.js` | +838 | Migration map, scope filter, folder layout, pruning fix |
| `electron/lib/cron.js` | +258 | Sleep catch-up, audit seed, knowledge lock, pause check |
| `electron/lib/chat.js` | +222 | JSONL persistence, trim, no more session dependency |
| `electron/packages/modoro-zalo/src/inbound.ts` | +223 | Scope filter, folder-aware skill read, web_fetch block |
| `electron/lib/workspace.js` | +122 | AGENTS.md v101, piggyback backup, boot migration |
| `electron/lib/dashboard-ipc.js` | +104 | Review fixes |
| `electron/lib/nine-router.js` | +43 | API key sync |

**Frontend:**
| File | Lines changed | What |
|------|--------------|------|
| `electron/ui/dashboard.html` | +356 | Chat dedup, review fixes |
| `electron/ui/wizard.html` | +14 | Telegram token guard |

**Skills (net deletion):**
| File | What |
|------|------|
| `skills/operations/zalo.md` | NEW — merged from 3 files |
| `skills/operations/google-workspace.md` | NEW — merged google-sheet into it |
| 12 marketing/content/finance/strategy skills | DELETED — template gallery deferred |
| `skills/INDEX.md` | Updated 29→26 |

---

## 4. Test artifacts (can be deleted)

```
.tmp-e2e.js                  — skill exec e2e test
.tmp-cron-swap-test.js       — cron group swap defense test (12/12 pass)
.tmp-elec.js, .tmp-elec2.js, .tmp-elec3.js — mock Electron modules
.tmp-e2e-out.log, .tmp-e2e-run1.log, etc.  — test output logs
```

---

## 5. Known issues / next steps

| Priority | Issue | Detail |
|----------|-------|--------|
| **P0** | Chat 401 root cause was API key drift | `ensure9RouterApiKeySync()` added but hasn't been tested in production yet. If 401 recurs, check `logs/9router.log` for key rotation events |
| **P1** | Chat history is empty until first in-app send | Existing Telegram conversations are NOT backfilled into `chat-history.jsonl`. Only in-app chat sends are logged. Could add a one-time backfill from sessions before first purge |
| **P1** | `npm run map:generate` needed | Uncommitted lib changes require system map regen before build |
| **P2** | Skills tab redesign | Design spec written (`2026-05-14-skills-tab-chevrons-design.md`) but NOT implemented — 3-panel layout like Claude Code |
| **P2** | Template gallery deferred | 12 marketing/content skills deleted. Template gallery feature spec exists (`2026-05-13-template-gallery-design.md`) but not built |
| **P3** | `purgeAgentSessions` still wipes sessions | Cron prompts that use `extractConversationHistory()` lose context after purge. Not urgent — cron uses 24h sinceMs window so it re-reads from remaining files |

---

## 6. Build checklist (when ready to ship)

```
1. npm run map:generate          # regen system map after lib changes
2. node electron/scripts/smoke-test.js  # full smoke
3. node .tmp-cron-swap-test.js   # cron defense regression
4. Manual: open Dashboard → Chat → send "hi" → verify reply (no 401)
5. Manual: restart app → Chat → verify history persists
6. Manual: Skills tab → verify 26 shipped skills listed
7. git add <specific files>      # NOT git add -A
8. git commit
9. npm run build:win             # local artifact only, NOT shipped
```

---

## 7. Architecture decisions made

1. **Chat history as JSONL, not SQLite** — simpler, no ABI issues, append-only is natural for chat. Trim by dropping oldest half when >512KB.
2. **Strict mode for cron group binding** — requiring both groupId+groupName is intentionally strict. Agent must confirm the group it's targeting. No silent fallback.
3. **Skill scope filtering at inbound.ts level** — prevents Zalo customers from triggering CEO-only skills. Code-level defense, not LLM-rule-level.
4. **Session purge preserved as-is** — didn't change `purgeAgentSessions()` behavior because it serves a real purpose (context reset for agent). Chat just reads from a different file now.
5. **Template gallery skills deleted** — they were uncommitted template content, not production skills. Will rebuild when template gallery feature is implemented.
