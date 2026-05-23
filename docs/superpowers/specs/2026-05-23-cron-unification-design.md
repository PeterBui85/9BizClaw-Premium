# Cron Unification — Unban `cron` Tool + Migration Skill

> **Status**: Design approved 2026-05-23  
> **Goal**: Enable clawhub.ai skills/plugins that need `cron` tool. Eliminate redundant Cron API. Unify to OpenClaw native cron via customer-controlled migration skill.

---

## Background

9BizClaw banned `cron` and `process` from `tools.allow` early on because Zalo had no input-level protection. This forced building a parallel Cron API (HTTP server on port 20200, auth tokens, `custom-crons.json`) so the AI agent could create crons via `web_fetch` workaround.

Since v2.4.7, COMMAND-BLOCK provides 76 hard + 18 soft regex patterns that rewrite admin-like Zalo messages before the agent sees them.

**`cron` tool**: COMMAND-BLOCK has explicit patterns for cron operations (Vietnamese: "tạo cron", "xóa cron", "lịch hẹn", etc. + API URL patterns `127.0.0.1:20200`, `/api/cron/`). Tool-level ban is now redundant. **→ UNBAN.**

**`process` tool**: COMMAND-BLOCK only catches JS-syntax patterns (`process(`, `spawn(`, `child_process`). NO natural-language Vietnamese patterns exist (e.g., "chạy 1 process trong background", "tạo process mới"). Unbanning `process` without adding COMMAND-BLOCK patterns first would leave a real Zalo attack surface. **→ KEEP BANNED.** Add COMMAND-BLOCK patterns in a future PR before unbanning.

**Consequence of keeping `cron` banned**: Skills and plugins from clawhub.ai that use `cron` tool silently fail on 9BizClaw. This blocks the ecosystem compatibility goal.

---

## Architecture Decision

**Approach A — Agent-native, phased** (chosen):
- Phase 1: Unban `cron` tool (zero risk, immediate value)
- Phase 2: Ship migration skill (customer-controlled, safe)
- Phase 3: Migrate built-in crons to agent prompts (deferred)

**Rejected alternatives:**
- Big-bang auto-migration on boot — too risky for 40 production customers
- Hybrid scheduler (keep custom scheduler, drop API only) — "nửa vời", doesn't fully unify

---

## Phase 1: Unban `cron` Tool (v2.4.8)

### Changes

**1. `electron/lib/config.js` — Move `cron` from BANNED_TOOLS to REQUIRED_TOOLS**

The tool allowlist is computed as `REQUIRED_TOOLS.filter(t => !BANNED_TOOLS.includes(t))` (line 773). Simply removing `cron` from BANNED_TOOLS is NOT enough — it must also be ADDED to REQUIRED_TOOLS, otherwise it won't appear in `tools.allow`.

Before:
```javascript
const REQUIRED_TOOLS = [
  'message', 'web_search', 'web_fetch', 'update_plan',
  'read_file', 'list_files', 'search_files', 'write_file', 'apply_patch',
  'exec', 'memory', 'pdf',
];
const BANNED_TOOLS = ['cron', 'process', 'image_generate', 'canvas', 'tts'];
```

After:
```javascript
const REQUIRED_TOOLS = [
  'message', 'web_search', 'web_fetch', 'update_plan',
  'read_file', 'list_files', 'search_files', 'write_file', 'apply_patch',
  'exec', 'memory', 'pdf', 'cron',
];
const BANNED_TOOLS = ['process', 'image_generate', 'canvas', 'tts'];
```

**`process` stays banned** — no natural-language COMMAND-BLOCK patterns exist for it yet.

**2. `electron/scripts/smoke-test.js` — Update security assertion**

Line 1665-1674: Smoke test currently asserts `cron` is in BANNED_TOOLS. Must be updated to assert `cron` is in REQUIRED_TOOLS instead.

Before:
```javascript
const bannedTools = ['cron'];
```

After:
```javascript
const bannedTools = ['process'];
```

Add new assertion:
```javascript
const requiredTools = ['cron', 'exec', 'memory'];
for (const tool of requiredTools) {
  if (!cfgSrc.includes(`'${tool}'`)) {
    fail(`tools.allow required`, `config.js does not reference '${tool}' in REQUIRED_TOOLS`);
  }
}
```

**3. AGENTS.md — Add cron tool instruction, remove old API references**

Add to the bot rules section:
```
Bot có thể dùng `cron` tool trực tiếp để tạo, xóa, sửa lịch hẹn. Không cần gọi API nội bộ.
```

Remove all instructions about using `web_fetch` to call `127.0.0.1:20200/api/cron/*` from AGENTS.md (lines 26, 74, 233, 240 reference the API — only remove cron-specific references, keep `/api/zalo/*`, `/api/fb/*`, `/api/file/*` references intact).

**4. Rewrite `skills/operations/cron-management.md` — use `cron` tool instead of API**

This is the PRIMARY instruction file (12 references to old API). Must be fully rewritten to teach the agent to use the native `cron` tool for create/list/delete/toggle. The old `web_fetch` pattern is dead code after this change.

**5. Update 4 more skills that reference `/api/cron/*`**

| File | What to change |
|---|---|
| `skills/operations/workspace-api.md` | Replace 3 cron API examples with `cron` tool equivalents |
| `skills/marketing/zalo-post-workflow.md` | Group lookup: replace `/api/cron/list` with `cron` tool list or `/api/zalo/friends` |
| `skills/operations/telegram-ceo.md` | Group lookup: same as above |
| `skills/operations/workflow-chains.md` | Replace cron create example with `cron` tool |

**6. Mark `docs/cron-reference.md` as deprecated**

Add deprecation header: "DEPRECATED v2.4.8 — dùng `cron` tool trực tiếp. File này giữ lại cho reference cũ."
Do NOT delete yet — existing agent context may still reference it during transition.

**7. No runtime changes.** Cron API keeps running. custom-crons.json keeps working. schedules.json unchanged. All existing crons for 40 customers unaffected. Old API endpoints still function — they just won't be called by new instructions.

### Verification

- `npm run smoke` passes (updated assertion).
- Install a clawhub skill that uses `cron` tool → skill creates cron → cron fires → result delivered.
- Existing crons continue firing at correct times.
- Zalo customer sends "tạo cron" → COMMAND-BLOCK rewrites → agent doesn't see admin command.
- Zalo customer sends "chạy process" → agent does NOT have `process` tool (still banned).

### Risk: ~0

Only moving 1 string between two allowlists. `process` stays banned. Nothing removed or modified.

---

## Phase 2: Migration Skill (v2.4.8 or v2.4.9)

### Overview

Ship a skill `cron-migration` that customers trigger when ready. The skill guides the agent to migrate crons from `custom-crons.json` to OpenClaw native `cron` tool (→ `jobs.json`).

**Why skill, not auto-migration:**
- Customer chooses when to migrate — not forced on boot
- Customer sees each cron being migrated, can verify immediately
- If something goes wrong, customer is right there to intervene
- No boot-time race conditions with gateway
- No risk of breaking 40 customers simultaneously

### Prerequisite: Extend `loadCustomCrons()` to parse `delivery` field

**CRITICAL**: Before Phase 2 can ship, `loadCustomCrons()` in `electron/lib/cron.js` (lines 1594-1623) must be extended to parse the `delivery` field from `jobs.json`. Currently it only reads `schedule`, `payload`, `name`, `enabled` — the `delivery` field (channel + target) is silently dropped. Migrated crons targeting specific Zalo groups would lose their delivery info and fire without a target.

**Required change** (cron.js line 1604-1611):
```javascript
openclawEntries.push({
  id: 'oc_' + j.id,
  label: j.name || 'OpenClaw cron',
  cronExpr: schedExpr,
  prompt: j.payload?.text || j.payload?.message || '',
  enabled: j.enabled !== false,
  source: 'openclaw',
  // NEW: preserve delivery target from jobs.json
  zaloTarget: j.delivery?.channel === 'zalo' ? { id: j.delivery.to, isGroup: j.delivery.isGroup !== false } : undefined,
  groupId: (j.delivery?.channel === 'zalo' && j.delivery.isGroup !== false) ? j.delivery.to : undefined,
  telegramTarget: j.delivery?.channel === 'telegram' ? j.delivery.to : undefined,
});
```

### Prerequisite: Verify OpenClaw `cron` tool output format

Before writing migration skill, empirically verify what the `cron` tool actually writes to `jobs.json`:
1. Run `openclaw agent --message "create a test cron that runs every hour"` 
2. Read `~/.openclaw/cron/jobs.json`
3. Confirm field names match spec (`payload.message` vs `payload.text`, `schedule.expr` vs `schedule.cron`)

If format differs from this spec, update field mapping table before shipping skill.

### Skill File

**Location**: `skills/operations/cron-migration/SKILL.md`

**Trigger**: "migrate cron", "chuyển cron", "gộp lịch", "migration cron"

**Content** (instructions for the agent):

```markdown
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
- Với MỖI cron CEO đồng ý chuyển, thực hiện ĐÚNG THỨ TỰ:
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
- CEO sẽ nhận thông báo Telegram mỗi khi cron mới được tạo — đó là bình thường

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

### OpenClaw Native Cron Format Reference

The agent uses the `cron` tool which writes to `~/.openclaw/cron/jobs.json`:

```json
{
  "jobs": [{
    "id": "auto-generated-uuid",
    "name": "Label from custom-crons.json",
    "enabled": true,
    "schedule": {
      "kind": "cron",
      "expr": "30 7 * * *",
      "tz": "Asia/Ho_Chi_Minh"
    },
    "payload": {
      "kind": "isolated",
      "message": "Prompt content here"
    },
    "delivery": {
      "channel": "telegram",
      "to": "chatId"
    },
    "deleteAfterRun": false
  }]
}
```

Schedule types:
- Recurring: `{ "kind": "cron", "expr": "*/5 * * * *" }`
- One-time: `{ "kind": "at", "value": "2026-06-01T15:00:00+07:00" }`
- Interval: `{ "kind": "every", "value": "30m" }`

### Field Mapping: custom-crons.json → OpenClaw native

| custom-crons.json | jobs.json | Notes |
|---|---|---|
| `id` | `id` | New UUID generated |
| `label` | `name` | Direct map |
| `enabled` | `enabled` | Direct map |
| `cronExpr` | `schedule.expr` | Same 5-field cron format |
| `oneTimeAt` | `schedule.kind: "at"` | ISO datetime |
| `prompt` (agent mode) | `payload.message` | Direct map |
| `content` + `groupId` (fixed mode) | `payload.message` | `exec: openzca --profile default msg send <groupId> "<content>" --group` (deterministic) |
| `groupIds` (broadcast) | N entries | 1 cron per group |
| `zaloTarget.id` | `delivery.to` | Group or user ID |
| `zaloTarget.isGroup` | inferred from delivery | — |

### Cron API Deprecation Path

1. **v2.4.8**: Cron API keeps running. Migration skill shipped. New crons created via `cron` tool. `cron` tool added to REQUIRED_TOOLS.
2. **v2.5.0** (after most customers migrated): Log warning when Cron API cron endpoints receive requests. Add deprecation notice to AGENTS.md.
3. **v2.6.0** (separate design effort): Full port 20200 server refactor — migrate 75+ non-cron endpoints to IPC, THEN remove HTTP server. **This is OUT OF SCOPE for this spec.**

### Cron-specific cleanup (v2.5.0, after most customers migrated)

**Remove (cron-only, safe):**
- AGENTS.md: `web_fetch` Cron API instructions, token injection for cron
- `cron-reference.md` API docs (verify AGENTS.md does not reference it first)
- COMMAND-BLOCK patterns for `/api/cron/` (keep `127.0.0.1:20200` patterns — server still runs for non-cron endpoints)

**Keep (server stays for non-cron endpoints):**
- `electron/lib/cron-api.js` — HTTP server (75+ non-cron endpoints still active)
- `electron/lib/cron-api-token.js` — token utilities (used by non-cron endpoints)
- `cron-api-token.txt` generation (used by non-cron endpoints)
- `electron/lib/cron.js` — scheduler, delivery, retry, logging
- `deliverCronResultToZalo()` + `_stripProcessAcks()` — delivery pipeline
- `runCronAgentPrompt()` — agent execution with retry
- `journalCronRun()` — audit logging
- `replayMissedCrons()` — sleep/resume recovery
- Group validation logic
- Dashboard cron UI (reads jobs.json after migration)

**Move from cron-api.js to cron.js (before cron endpoints are removed):**
- `resolveCronZaloTarget()` — group name ambiguity detection, cross-check
- `loadGroupsMap()` — groups.json reader

---

## Phase 3: Built-in Cron Migration (Deferred)

> **NOT in scope for v2.4.8 or v2.5.0.** Implement after Phase 2 is stable for 2-4 weeks.

### Concept

Convert 8 built-in cron handlers (morning, evening, weekly, monthly, afternoon-nudge, zalo-followup, meditation, memory-cleanup) from Node.js prompt builders to static prompt templates. Agent uses `read_file`, `list_files`, `exec` to gather data instead of Node pre-processing.

### Prompt Template Strategy

Each handler becomes a `.md` file in `electron/prompts/` with agent instructions:

Example — morning briefing:
```
Tạo báo cáo sáng cho CEO. Thực hiện:
1. Đọc logs/audit.jsonl (50 dòng cuối) — tóm tắt hoạt động đêm qua
2. Đọc custom-crons.json hoặc liệt kê cron — liệt kê lịch hôm nay
3. Scan memory/zalo-users/ — tìm khách cần follow-up (chưa reply >24h)
4. Tóm tắt ngắn gọn, gửi CEO qua Telegram
Format: tiêu đề + 3-5 bullet points. Không emoji.
```

### Concerns (to address before implementing)

1. **Token cost**: Agent reads full files vs Node.js extracts. Mitigate with `read_file` limit param.
2. **Reliability**: Agent may timeout, refuse, or hallucinate. Keep failure alerting.
3. **Quality**: Current handlers produce consistent output. Agent output varies. Need A/B testing period.

### Migration mechanism

Same pattern as Phase 2: shipped skill `builtin-cron-migration`. CEO triggers when ready. Agent converts `schedules.json` entries to `jobs.json` entries with prompt templates.

---

## Safety Invariants (All Phases)

1. **No auto-migration**: Customer ALWAYS triggers migration manually via skill
2. **Backup before modify**: custom-crons.json → .backup before any rename
3. **Rollback available**: "hoàn tác" command reverses migration
4. **Existing crons keep running**: Until customer migrates, old system works identically
5. **No simultaneous risk**: Each customer migrates independently, at their own pace
6. **Failure alerting**: CEO gets Telegram alert if any cron fails to fire
7. **Audit trail**: All cron fires logged to cron-runs.jsonl regardless of system
8. **All instruction paths updated**: No skill, AGENTS.md rule, or reference doc still points agent at old Cron API (see Phase 1 changes 3–6)

---

## Known Risks & Mitigations (Phase 2)

### R1: Duplicate firing during migration window (HIGH)

**Problem**: While migration skill creates new crons in jobs.json, old crons in custom-crons.json are still loaded. `watchCustomCrons()` poller (2s interval) detects jobs.json change → `restartCronJobs()` → merges BOTH sources → same cron fires twice. Dedup (line 2226) uses MD5 of prompt text — but old prompt is raw Vietnamese, new prompt is `exec: openzca ...` → different hash → dedup miss.

**Mitigation**: Migration skill MUST disable old crons (set `enabled: false`) BEFORE creating new equivalents. Sequence per cron:
1. Set old cron `enabled: false` in custom-crons.json
2. Create new cron via `cron` tool
3. Verify new cron appears in list
4. After ALL crons migrated: rename custom-crons.json → .backup

### R2: Timezone mismatch (CRITICAL)

**Problem**: custom-crons.json has no timezone — `node-cron` fires in system timezone (typically Asia/Ho_Chi_Minh). OpenClaw native format has explicit `tz` field. If `cron` tool defaults to UTC, every migrated cron fires 7 hours late.

**Mitigation**: Before shipping Phase 2, empirically verify what timezone the `cron` tool uses. Migration skill MUST explicitly set `tz: "Asia/Ho_Chi_Minh"` when creating each cron.

### R3: CEO alert flood during migration (MEDIUM)

**Problem**: `watchCustomCrons()` sends `sendCeoAlert("Cron mới đã được lên lịch")` for every new cron ID (line 1700-1714). Migrating 20 crons → 20 Telegram alerts rapid-fire.

**Mitigation**: Migration skill should warn CEO upfront: "Anh sẽ nhận nhiều thông báo Telegram trong quá trình chuyển — đó là bình thường." Alternatively, temporarily suppress alerts during migration (set a flag, check in watcher).

### R4: `cron` tool may not write `delivery` field (HIGH)

**Problem**: Spec assumes `cron` tool writes `delivery: { channel, to }`. If the tool only writes `payload.message` and expects the agent to handle delivery in the prompt, Zalo-targeted crons lose their target silently.

**Mitigation**: Verify empirically before Phase 2 ships (see prerequisite). If `delivery` field not supported, fixed-mode crons must embed delivery in the prompt via `exec:` format (which already handles this).

### R5: Rollback not atomic (MEDIUM)

**Problem**: Rollback deletes new crons one by one via `cron` tool. Agent error midway (token limit, timeout) → partial state: some new crons deleted, some remain, plus old file restored → duplicates.

**Mitigation**: Skill must track migration state (list of created IDs) and persist to a temp file. Rollback reads this file, not agent memory. If rollback fails partway, file shows remaining IDs to retry.

---

## Appendix: Endpoint Inventory on Port 20200

**WARNING**: `cron-api.js` is misnamed — it is a 3122-line HTTP server hosting **75+ endpoints** across 15+ domains, NOT just cron. The file cannot be deleted without migrating ALL endpoints.

### Cron endpoints (replaced by `cron` tool after migration)

| Endpoint | Used by | Action needed |
|---|---|---|
| `/api/cron/create` | AI agent (web_fetch) | Replaced by `cron` tool |
| `/api/cron/list` | AI agent + Dashboard | Dashboard reads jobs.json directly |
| `/api/cron/delete` | AI agent + Dashboard | `cron` tool + Dashboard IPC |
| `/api/cron/toggle` | Dashboard | Dashboard writes jobs.json directly |
| `/api/cron/replace` | AI agent | `cron` tool (delete + create) |
| `/api/cron/audit` | AI agent | Keep as utility in cron.js or remove |

### Non-cron endpoints (MUST remain functional — full list TBD)

| Domain | Example endpoints | Used by |
|---|---|---|
| Facebook scheduling | `/api/fb/*` | AI agent + Dashboard |
| User skills | `/api/user-skills/*` | AI agent + Dashboard |
| File operations | `/api/file/read` | AI agent |
| Zalo operations | `/api/zalo/*` | AI agent + Dashboard |
| Workspace | `/api/workspace/*` | Dashboard |
| Image generation | `/api/image/*` | AI agent |
| Order management | `/api/order/*` | AI agent |
| Inventory | `/api/inventory/*` | AI agent |
| Memory | `/api/memory/*` | AI agent |
| Media | `/api/media/*` | AI agent |
| Telegram | `/api/telegram/*` | AI agent |
| Internal delivery | `/api/internal/*` | Gateway |
| Auth | `/api/auth/token` | Legacy (remove) |
| Capabilities | `/api/capabilities` | AI agent (remove — has tools natively) |

**Full endpoint audit required before v2.6.0.** Run `grep -c 'router\.\(get\|post\|put\|delete\)' electron/lib/cron-api.js` to get exact count.

**Resolution**: 
- **v2.4.8–v2.5.0**: HTTP server keeps running. Only cron endpoints become dead code (agent uses `cron` tool directly). No endpoints removed.
- **v2.6.0**: Migrate non-cron endpoints to IPC or separate service. THEN delete cron-api.js. This is a separate design effort.
