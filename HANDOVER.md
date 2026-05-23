# 9BizClaw — Session Handover (May 21-22, 2026)

> **Branch:** `main` | **Version:** v2.4.6
> **Status:** Windows EXE on Drive. Mac DMGs built on GitHub Actions (need download + upload).
> **Google Drive v2.4.6 folder ID:** `17wQ1sGoKk3jHtKu6Zg6rnYOByUSgIv5P`

---

## MUST DO NEXT SESSION (Blocking)

### 1. Verify ChatGPT session import on Mac — MUST WORK 100%
- **Problem:** Chưa confirm được trên Mac thật. Windows OK.
- **How import works:** User paste JSON from `chatgpt.com/api/auth/session` → IPC handler parse → 3-strategy write (API full → API minimal → file write) → restart 9router → user clicks "Kiểm tra kết nối"
- **Mac concern:** 9router API rejects `codex` provider type (tested). Strategies 1+2 WILL fail. Strategy 3 (direct file write to `~/Library/Application Support/9router/db.json`) is the ONLY path. Mac app has NO App Sandbox (`entitlements.mac.plist` confirmed), so file write SHOULD work. But NEEDS REAL MAC TEST.
- **If file write also fails on Mac:** Need alternative approach — possibly use 9router's backup import mechanism, or write a temp backup file and trigger 9router import.
- **Test steps:** Install Mac DMG → wizard step 2 → click "Đăng nhập không được?" → paste session JSON → click "Import tài khoản" → should show success → click "Kiểm tra kết nối" → should detect ChatGPT account
- **Files:** `electron/lib/dashboard-ipc.js` (IPC handler ~line 5554), `electron/ui/wizard.html` (fallback panel ~line 1310), `electron/ui/dashboard.html` (9Router page import panel ~line 3515)

### 2. Verify clickable link chatgpt.com/api/auth/session opens browser
- **Problem:** Link uses `window.claw.openExternal('https://chatgpt.com/api/auth/session')` via onclick. On Mac, needs testing.
- **Where:** `wizard.html:1322` and `dashboard.html:3526`
- **Test:** Click the link → should open in external browser (Chrome/Safari)

### 3. Upload Mac DMGs to Google Drive
- **DMGs built from commit `a1255449` (latest)**
- **Download:** `gh run download <run-id> --repo PeterBui85/9BizClaw-Premium --dir mac-dmg`
- **Upload:** `$gog drive upload --account buituanhuy85@gmail.com --parent 17wQ1sGoKk3jHtKu6Zg6rnYOByUSgIv5P <file.dmg>`
- Old v2.4.5 DMGs still in v2.4.5 folder — leave them

---

## Shipped in v2.4.6

| # | Feature/Fix | Files | Status |
|---|-------------|-------|--------|
| 1 | ChatGPT session import (wizard fallback + dashboard panel) | `dashboard-ipc.js`, `preload.js`, `wizard.html`, `dashboard.html` | Done, needs Mac verify |
| 2 | Robust JSON parser (BOM strip, control chars, extract from prefix text) | `wizard.html`, `dashboard.html`, `dashboard-ipc.js` | Done |
| 3 | Clickable chatgpt.com/api/auth/session link (openExternal) | `wizard.html:1322`, `dashboard.html:3526` | Done, needs Mac verify |
| 4 | Backup import dialog accepts .9bizclaw-backup + .tar | `dashboard-ipc.js:4654` | Done |
| 5 | tools.fetch → tools.web.fetch migration (fix gateway crash) | `config.js:794-806` | Done |
| 6 | crypto.randomUUID fix (was `crypto.randomUUID()` without require) | `dashboard-ipc.js:5584` | Done |
| 7 | 3-strategy import: API full → API minimal → file write | `dashboard-ipc.js:5611-5646` | Done |
| 8 | 9router restart after db.json write (external writes not auto-detected) | `dashboard-ipc.js:5642` | Done |
| 9 | CEO override — bypass blocklist + pause when CEO commands Zalo send | `channels.js:885,1136`, `cron-api.js:1580,1641` | Done |
| 10 | AGENTS.md: CẤM TỰ TỪ CHỐI GỬI ZALO + CEO override rule | `AGENTS.md:25,244` | Done |
| 11 | AGENTS.md: image gen — save CEO inline image before generating | `skills/operations/image-generation.md:29-33` | Done |
| 12 | Telegram streaming progress mode restored (nested object format) | `config.js:653-658`, whitelist `config.js:689` | Done |
| 13 | ceoOverride `allow` var scoping crash fix (was ReferenceError) | `channels.js:914,1161` | Done |
| 14 | Version bump 2.4.5 → 2.4.6 | `package.json:3` | Done |

---

## Code Review Results (5 parallel agents, all completed)

### Review 1 — Security: 0 CRITICAL, 1 IMPORTANT, 3 LOW
- **IMPORTANT:** `ceoOverride` not propagated to inner re-check functions (`sendOneChunk` at channels.js:979, `doSend` at channels.js:1197). Long messages split into chunks — chunk 2+ gets blocked by inner blocklist/pause re-check. Fails closed (not a vulnerability). Fix: pass `ceoOverride` into closures.
- LOW: Token stored as plaintext in db.json (inherent to 9router design, acceptable for local desktop app)
- LOW: tools.fetch migration doesn't preserve custom timeout (always sets 600s, acceptable)
- LOW: Streaming config contradicts old CLAUDE.md docs

### Review 2 — Cross-platform: 0 CRITICAL, 2 IMPORTANT, 4 LOW
- **IMPORTANT:** Mac instructions say "Ctrl+A / Ctrl+C" but Mac uses Cmd. Fix: detect platform or show both.
- **IMPORTANT:** HANDOVER.md + CLAUDE.md still reference old scalar streaming format. Needs update.
- LOW: Main process missing control char strip (renderer already does it before IPC)
- LOW: 9router restart 1200ms delay tight for Mac SIGKILL escalation (1500ms)

### Review 3 — Error handling: 0 CRITICAL, 2 IMPORTANT, 2 LOW
- **IMPORTANT:** No input size limit on sessionJson — 10MB paste would freeze main process. Fix: add 100KB guard.
- **IMPORTANT:** Streaming `{ mode: "progress" }` forced on every boot — user can't opt out. By design (CEO wants progress).
- LOW: Strategy 3 reports success even if 9router restart fails
- LOW: 20s combined API timeout before falling through to file write

### Review 4 — Hallucination: PASS
0 missing APIs. Every endpoint in AGENTS.md verified to exist in cron-api.js or fb-schedule.js.

### Review 5 — Schema consistency: 1 CRITICAL (pre-existing), 2 IMPORTANT, 2 LOW
- **CRITICAL (pre-existing, NOT from this session):** `messages.inbound.debounceMs` per-channel key written by `set-inbound-debounce` IPC but stripped by `TELEGRAM_VALID_FIELDS` whitelist on next boot. Debounce slider in Dashboard is effectively broken on restart.
- **IMPORTANT:** `set-batch-config` can write arbitrary keys bypassing whitelists
- LOW: `tools.fetch` deletion uses truthy check instead of `in` operator

---

## Pending Review Fixes (not blocking, for next session)

1. **ceoOverride inner re-check** — `channels.js:979` and `channels.js:1197` — pass `ceoOverride` into `sendOneChunk` and `doSend` closures
2. **Input size limit** — `dashboard-ipc.js:5554` — add `sessionJson.length > 100000` guard
3. **Mac Cmd key** — `wizard.html:1323`, `dashboard.html:3527` — detect platform or show "Ctrl+A / Cmd+A"
4. **Control char strip in main process** — `dashboard-ipc.js:5558` — add `.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '')`
5. **Debounce whitelist** — `config.js:680` — add `'messages'` to `TELEGRAM_VALID_FIELDS` (pre-existing)

---

## How Auto-Mode Works

**Pure AGENTS.md rules, no code.** Bot sees `[AUTO-MODE]` tag in prompt → LLM follows different behavior rules.

**Rules (AGENTS.md lines 9-18):**
- KHÔNG hỏi confirm — LÀM LUÔN mọi tool calls
- Narrate tiến trình trên Telegram sau MỖI bước xong
- Nội dung gửi Zalo/email/FB phải sạch (không lẫn process description)
- Bước fail → báo CEO ngay, BỎ QUA, tiếp bước sau
- Rule "KHÔNG GỬI TIN ZALO MÀ CHƯA XÁC NHẬN" KHÔNG ÁP DỤNG
- Rule "đăng Facebook phải preview" KHÔNG ÁP DỤNG

### Cron Pipeline (fire → agent → deliver)
1. **Schedule fires** (`cron.js` job scheduler)
2. **Check Zalo pause** — if cron targets Zalo and paused, skip
3. **Inject `[AUTO-MODE]`** (`cron.js:445-450`) — wrap prompt, append Zalo delivery instruction if group target
4. **Self-test** (`selfTestOpenClawAgent`, `cron.js:66-127`) — verify CLI healthy, cache 30min
5. **Run agent** (`runCronAgentPrompt`, `cron.js:358-524`) — `spawnOpenClawSafe(['agent', '--message', prompt, '--json', '--channel', 'telegram', '--to', chatId])`, retry 3x, timeout 10min
6. **Parse output** (`parseAgentJsonOutput`, `cron.js:143-161`) — extract `text` + `mediaUrls` from JSON
7. **Deliver to Zalo** (`deliverCronResultToZalo`, `cron.js:193-223`) — strip process acks, send via `sendZaloTo`
8. **Write memory** — auto-save task completion record
9. **Journal** (`cron-runs.jsonl`) — phase: ok/retry/fail, duration, exit code

### Tools Available to Agent
```
ALLOWED: message, web_search, web_fetch, update_plan, read_file, list_files,
         search_files, write_file, apply_patch, exec, memory, pdf,
         sessions_spawn, sessions_yield, sessions_send, subagents,
         sessions_list, sessions_history, session_status, agents_list
BANNED:  cron, process, image_generate, canvas, tts
```
- `web_fetch` to `127.0.0.1:20200` = internal API (image gen, Zalo send, cron CRUD, brand assets, etc.)
- `exec` = shell commands (mainly `openzca msg send` for Zalo delivery)
- `sessions_spawn` + `subagents` = parallel agent sessions (available but no AGENTS.md rules yet)
- `image_generate` BANNED → must use `/api/image/generate` via `web_fetch`
- `cron` BANNED → must use `/api/cron/create` via `web_fetch`

### Cron Entry Format (`custom-crons.json`)
```json
{
  "id": "cron_1234567890_abc123",
  "label": "Báo cáo sáng",
  "prompt": "Tổng hợp hoạt động hôm qua...",
  "mode": "agent",
  "enabled": true,
  "cronExpr": "0 8 * * *",
  "groupId": "123456789",
  "zaloTarget": { "id": "123456789", "isGroup": true, "label": "Nhóm demo" },
  "createdAt": "2026-05-21T10:00:00Z"
}
```

### Multi-Step Workflow Composition
Bot chains API calls via `web_fetch`. Available actions:
- Google: `sheets/get|update|append|create-formatted`, `calendar/events|create|free-slots`, `gmail/inbox|read|send`
- Image: `image/generate`, `image/generate-and-send-zalo`
- Zalo: `zalo/send`, `zalo/send-media`, `openzca msg send`
- Facebook: `fb/schedule/create`, `fb/post`, `fb/verify`
- Data: `order/create|list`, `inventory/adjust|check`, `memory/write|search`
- Cron: `cron/create|list|delete|toggle`

### Test Prompts
`docs/training/test-prompts-auto-mode.md` — 8 prompts:
1. Báo cáo tuần (8 steps) — email + calendar + Sheet + FB + email + Zalo
2. Ra mắt sản phẩm (9 steps) — description + FB + email + Sheet + Zalo + JD + skill + cron
3. CRM Pipeline (8 steps) — email filter + Sheet + follow-up + Zalo + telesales + appointment + cron
4. Content Calendar (9 steps) — web research + 7 posts + Sheet + FB + Zalo + email + cron
5. Tạo ảnh + gửi Zalo (6 steps) — image + Zalo group + banner + cron
6. Ảnh Facebook + preview (5 steps) — verify + image + preview + post
7. Gửi Zalo text + ảnh (4 steps) — write + image + send-media + text
8. Skill builder + cron (6 steps) — 2 skills + list + recurring cron + one-time cron + verify

### Memory System Redesign (Urgent)
- **Problem:** 10/10 memories are `task` type (cron logs). No rules, preferences, corrections, patterns. Bot "nhớ" nhưng nhớ toàn thứ vô ích.
- **Root cause:** Cron auto-write floods memory with task entries. CEO chưa dạy rules. Bot không chủ động detect patterns.
- **Fixes needed:**
  1. Giảm cron task noise — chỉ ghi task memory cho NOTABLE outcomes, không phải mỗi lần fire
  2. Tăng task retention 14 → 30 ngày (CEO hỏi "tuần trước làm gì" → có data)
  3. AGENTS.md quá to (27K, budget 20K) → trim xuống 18K, dành space cho memory
  4. Dynamic memory budget: `available = 35000 - agents_base_size`
  5. Smart selection: corrections > rules > patterns > preferences > recent tasks
  6. Bot chủ động detect patterns từ conversations (evening summary đã có logic nhưng cần tune)
- **Architecture:** Audit full ở session 2026-05-22, kết quả trong subagent output
- **Files:** `ceo-memory.js` (engine), `cron.js:475` (task write), `workspace.js:735` (injection), `conversation.js:291` (pattern detection)

### Parallel Execution (Future)
- `sessions_spawn` + `subagents` in tools.allow but no AGENTS.md rules
- Idea: bot detects independent steps → spawn parallel → combine results
- Example: steps 1-3 sequential (depend) → steps 4-7 parallel (independent) → step 8 last
- Currently all steps sequential — 8 steps × 2min = 16min, parallel target = 4-5min

---

## Product Ideas (discussed, not started)

### Subagent parallel tasks for auto-mode
- CEO gives 8-step [AUTO-MODE] prompt → bot currently runs sequentially (16 min)
- Idea: bot spawns subagents for independent steps (4-5 min)
- `sessions_spawn` + `subagents` already in tools.allow
- Needs AGENTS.md rules: when to spawn parallel vs sequential
- Example: steps 1-3 sequential (depend on each other) → steps 4-7 parallel (independent) → step 8 last

### Image auto-save (code level)
- AGENTS.md rule done (bot should save CEO's inline image before generating)
- Code-level auto-detect NOT done — would need vendor-patch or channel hook to auto-download Telegram photos → save to brand-assets
- Current workaround: AGENTS.md instructs bot to call `POST /api/brand-assets/save` with base64

---

## Architecture Notes (for context)

### ChatGPT Session Import — Full Flow
```
User pastes JSON from chatgpt.com/api/auth/session
  → wizard.html / dashboard.html textarea (renderer)
  → client-side parse: BOM strip + control chars + extract {…} + validate accessToken + decode JWT
  → shows email + plan type in green
  → user clicks "Import tài khoản"
  → IPC: window.claw.importChatGPTSession(jsonString)
  → preload.js: ipcRenderer.invoke('import-chatgpt-session', { sessionJson })
  → dashboard-ipc.js handler:
    Strategy 1: POST full entry to 9router /api/providers → FAILS (9router rejects 'codex')
    Strategy 2: POST minimal {provider,name,apiKey} → FAILS (9router rejects 'codex')
    Strategy 3: Read db.json → upsert providerConnections → write db.json → restart 9router → SUCCESS
  → return { success, email, planType }
  → wizard shows success alert: "Nhấn Kiểm tra kết nối bên dưới"
  → user clicks "Kiểm tra kết nối" (existing button)
  → setup9RouterAuto({ detectChatGPT: true }) detects codex provider → creates combo → syncs API key
```

### 9router Provider Types
- `codex` (OAuth, ChatGPT) — NOT creatable via API, only via OAuth web UI or direct db.json write
- `openai` (API key) — creatable via POST /api/providers
- `ollama` (API key) — creatable via POST /api/providers
- `openrouter` (API key) — creatable via POST /api/providers

### Key Paths
- 9router db.json: Win `%APPDATA%\9router\db.json`, Mac `~/Library/Application Support/9router/db.json`
- openclaw.json: `~/.openclaw/openclaw.json`
- App data: Win `%APPDATA%\9bizclaw\`, Mac `~/Library/Application Support/9bizclaw/`
- Installed app: Win `%LOCALAPPDATA%\Programs\9BizClaw\`, Mac `/Applications/9BizClaw.app`

### Streaming Config (openclaw 2026.4.14)
- **Valid format:** `channels.telegram.streaming: { mode: "progress" }` (nested object)
- **Invalid:** `channels.telegram.streaming: "progress"` (scalar string — rejected by validator)
- **Whitelist:** `streaming` must be in `TELEGRAM_VALID_FIELDS` set in config.js
- **Global:** `agents.defaults.blockStreamingDefault: "off"` (don't block streaming)

---

## Build Commands

```bash
# Windows EXE
cd electron && node scripts/generate-system-map.js && npm run build:win

# Mac DMG (GitHub Actions)
git push peter main && git tag -d v2.4.6 && git tag v2.4.6 && git push peter v2.4.6 --force

# Download Mac DMGs
gh run download <run-id> --repo PeterBui85/9BizClaw-Premium --dir mac-dmg

# Upload to Google Drive (v2.4.6 folder: 17wQ1sGoKk3jHtKu6Zg6rnYOByUSgIv5P)
GOG="$APPDATA/9bizclaw/vendor/gog/gog.exe"
$GOG drive upload --account buituanhuy85@gmail.com --parent 17wQ1sGoKk3jHtKu6Zg6rnYOByUSgIv5P <file>

# Force-copy asar to installed app (bypass NSIS upgrade issues)
Copy-Item "dist\win-unpacked\resources\app.asar" "$env:LOCALAPPDATA\Programs\9BizClaw\resources\app.asar" -Force

# Clear Chromium Code Cache (if same-version upgrade doesn't take effect)
Remove-Item -Recurse -Force "$env:APPDATA\9bizclaw\Code Cache"
```

---

## Lessons Learned

1. **ALWAYS bump version** when rebuilding — NSIS + Chromium Code Cache make same-version upgrades unreliable
2. **Never clear all Electron cache** — only `Code Cache`, not `Cache/` or `GPUCache/` (those contain state like wizard-complete)
3. **Test on real platform** — Mac file write, sandbox, keyboard shortcuts can't be verified from Windows
4. **9router API rejects `codex`** — OAuth providers can only be added via direct db.json write or 9router's own OAuth UI
5. **`tools.fetch` → `tools.web.fetch`** — openclaw 2026.4.14 schema change, old key crashes gateway
6. **Streaming must be nested object** — `{ mode: "progress" }` not scalar `"progress"`
7. **`TELEGRAM_VALID_FIELDS` whitelist** — any new config key for Telegram MUST be added to the whitelist in config.js or `_stripUnknownFields` will delete it on next boot
8. **Inner re-check functions** in channels.js don't inherit outer `ceoOverride` — long messages split into chunks get blocked at chunk 2+
