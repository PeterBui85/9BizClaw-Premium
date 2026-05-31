# Customer Reports

Tracking customer-reported issues. Each entry: date, symptom, root cause, fix, status.

---

## 2026-05-31 — Cài đặt/update lỗi "Không tải được Node.js: fetch failed" (máy có proxy / AV chặn HTTPS)

- **Symptom (CEO, ảnh màn hình):** macOS — "Cài đặt gặp lỗi", checklist "Kết nối Internet ✗", chi tiết "Không tải được Node.js: fetch failed" — dù mạng mạnh, web vào bình thường. "Update thôi mà".
- **Root cause:** runtime installer tải Node qua undici `fetch`, bỏ qua proxy hệ thống + keychain macOS (chỉ tin CA đóng sẵn của Node). Máy sau proxy công ty hoặc phần mềm diệt virus giải mã HTTPS → trình duyệt vào được (tin CA của AV/proxy) nhưng `fetch` không → "fetch failed". `e.cause` (lý do thật) bị vứt bỏ; splash regex gán "fetch failed" → "Kết nối Internet ✗" (đoán mò, KHÔNG test mạng thật). URL + version Node đã verify đúng (không phải 404). "Update" mà phải tải vì mô hình runtime tải Node lần đầu (migrate từ bản cũ / thiếu marker).
- **Fix (2.4.10):** tải theo thứ tự `fetch → Electron net.fetch (tôn trọng proxy + keychain như trình duyệt) → curl/PowerShell`; surface `e.cause` + hint hành động được; splash thôi đổ lỗi Internet cho "fetch failed". Smoke guard. Build lại EXE + Mac DMG.
- **Workaround tức thì (không cần bản mới):** bật 4G hotspot điện thoại → Thử lại; hoặc tắt mục quét HTTPS/SSL của phần mềm diệt virus.
- **Status:** FIXED in 2.4.10 (release + Drive cập nhật).

## 2026-05-31 — Lịch tự động mặc định không tắt được

- **Symptom (CEO):** "fix gấp lịch tự động mặc định ko tắt đc" — tắt lịch mặc định (báo cáo sáng/tối...) trong Dashboard nhưng nó vẫn chạy / tự bật lại.
- **Root cause:** `save-schedules` IPC (dashboard-ipc.js) có guard `if (Array.isArray(schedules)) return error` — từ chối array. Nhưng `schedules.json` là array ở mọi nơi (loadSchedules yêu cầu array, get-schedules trả array, UI currentSchedules là array). Mỗi lần tắt → save trả `success:false` không ghi file → `restartCronJobs()` không chạy → reload thì `enabled:false` mất, cron vẫn fire. Regression từ 2026-05-08.
- **Fix:** đảo guard thành `if (!Array.isArray(schedules)) return error`. Cộng 2 hardening cùng class (add-cron không ép `enabled=true`; save-business-profile không ghi đè all-enabled khi file lỗi). 3 smoke guard. Verified bằng workflow 8 agent.
- **Status:** FIXED in 2.4.10 (rebuilt EXE + DMG, release + Drive cập nhật).

## 2026-05-31 — Cron jobs fail: "gateway closed (1006) → falling back to embedded", exit -9

**Reporter:** Customer (Dương Quang Long bot, user Senquocte03)
**Symptom:** `morning-briefing` completed only 4/7 steps (errors 1,2,4); `afternoon-nudge` (14:30) and `evening-summary` (21:30) failed after 3 retries — `Exit code: -9`, `Gateway agent failed; falling back to embedded: Error: gateway closed (1006 abnormal closure (no close frame))`, `ws://127.0.0.1:18789`, `[session-freeze] bootstrap CACHE MISS — cold`.
**Root cause (systematic-debugging, from source — could NOT reproduce the customer machine):**
- `-9` = process killed by a signal (`boot.js:641` reports `-9` when `code===null && sig`). The cron spawn passes no abort signal, so the only killer is the **10-min cron timeout** (`CRON_AGENT_TIMEOUT_MS`, `boot.js:626` SIGTERM→SIGKILL).
- Chain: cron runs → gateway WS drops (1006) → openclaw falls back to a **cold embedded** run ("CACHE MISS — cold") → slow (cold start + reasoning model) → exceeds 10-min timeout → SIGKILL (-9) → all 3 retries hit the same cold path → fail. Morning's 4/7 = intermittent gateway availability (some steps got through).
- **Fixable gap (still in current source):** cron does NOT ensure the gateway is warm before running, retries re-spawn the same doomed cold-embedded path, and there were no diagnostics to confirm the cause.
**Fix (2026-05-31, `electron/lib/cron.js`):**
1. `ensureGatewayWarmForCron()` at the top of `runCronViaSessionOrFallback` — if `isGatewayAlive(15s)` is false (truly dead; won't false-positive a busy gateway), `startOpenClaw()` first (re-entrant-guarded; no-op if up) so the cron uses the warm gateway instead of cold-embedded.
2. `isGatewayDropErr()` classifier; on that failure between retries, re-warm the gateway instead of re-spawning the same cold path.
3. Diagnostics: cron journal + CEO alert now record `gatewayDrop` + an actionable Vietnamese explanation so the next occurrence is confirmable.
**Status:** Fixed in source 2026-05-31 (smoke 0). **Caveat:** could not reproduce the customer machine, so the exact trigger (gateway dead vs alive-but-busy) is unconfirmed; the fix addresses the most likely cause + adds resilience + makes the next report diagnosable. If "alive-but-busy", the deeper lever is the slow-model latency. Pending rebuild + ship to customer.

---

## 2026-05-30 — Verification audit of prior fixes (several were overclaims)

**Reporter:** CEO (release-note verification request) + multi-agent reachability audit + live Telegram tests
**Finding:** "Code exists ≠ feature works." Audited prior customer-reported fixes for end-to-end reachability and found gaps that needed real fixes (all fixed 2026-05-30, pending rebuild):
- **`/approve` leak (v2.4.7 fix was incomplete):** Layer L output-filter patterns were added to `channels.js` (Electron-side) but NOT to the gateway live-reply path. Real Zalo customer replies go through `modoro-zalo/src/send.ts`, which had only Layer K → `/approve`/`Get-Content` could still leak. FIXED: mirrored Layer L into `send.ts` (fork v1.0.13).
- **Cron ENAMETOOLONG (v2.4.8 description was wrong):** the documented "write to temp file + `--message-file`" was never implemented and is NOT possible — openclaw has no `--message-file`/`--params @file`/stdin input. BOTH the CLI (`--message`) and session-send (`--params`) paths carry the prompt in argv (32KB Windows limit), and the session path was UNCAPPED. FIXED: `capCronPromptBytes()` now applied to both paths; ENAMETOOLONG stays in `isFatalErr` as a safety net. (Very long weekly reports are summarized from the first ~24KB — a platform argv limit, not a crash.)
- **Cron "Config invalid" (v2.4.8):** static pre-spawn heal did not strip `channels.telegram.messages`, so the first cron run still failed before retry-heal recovered it. FIXED: static heal now removes it (prevents the first failure).
- **MemoryOS auto-learn never ran:** `ceo_memories` empty for days — idle timer reset by every gateway run. FIXED: periodic watcher. (Not a customer report but CEO-facing.)
- Latency (CEO-observed ~35 min replies): **CORRECTED root cause** — NOT inherent model speed. A re-test while the machine was idle showed the SAME "tóm tắt Zalo" task (3 tool calls: read skill → exec → read Zalo memory) complete in **74s** (vs 33 min during the incident), and a 0-tool nudge in **7.3s**. The 33–39 min spike was **machine contention** from a concurrent 32-agent verification workflow + heavy tool-call load running on the same host (starved 9router/gateway/model) + cold-start. The earlier "55–83s/turn" direct measurement was also taken under that contention. So latency is NOT a product bug; normal warm replies are ~1 min or faster. (Reducing `bootstrapTotalMaxChars` 270K is still worth it for token cost, but not for latency.)

---

## 2026-05-22 — Skill creation broken ("ai cũng báo là đang lỗi hết")

**Reporter:** Multiple customers
**Symptom:** CEO tries to create custom skill via Telegram chat → bot doesn't know how / returns 403 error
**Root cause (2 bugs):**
1. Missing trigger in AGENTS.md Capability Router table — "tạo skill" keywords not routed to skill-builder.md
2. Explicit `headers` in skill-builder.md web_fetch calls may override auto-injected auth → 403
**Fix:** Added skill_builder trigger row to Router + removed explicit headers from 6 POST calls
**Status:** Fixed in v2.4.6 build, pending ship

---

## 2026-05-22 — Zalo "Tắt tất cả" button enables all instead of disabling

**Reporter:** CEO (internal)
**Symptom:** Pressing "Tắt tất cả" in Zalo friends list enables all DMs instead of blocking all
**Root cause:** `toggleAllFriends(false)` set `userAllowlist = []`. inbound.ts treats empty allowlist as "allow ALL" (backwards compat). Empty array = no filter = everyone gets through.
**Fix:** Changed to `userAllowlist = ['__NONE__']` sentinel — non-empty array, no real ID matches, deny-all behavior.
**Status:** Fixed in v2.4.7 build, pending ship

---

## 2026-05-22 — Zalo mode turned ON but bot not responding in groups

**Reporter:** Customer
**Symptom:** Customer turned on Zalo bot mode in Dashboard, but bot does not respond to group messages
**Root cause:** `zalo-group-settings.json` defaults to `__default: { mode: 'off' }`. Groups NOT explicitly in the file are silently dropped (inbound.ts line 985-989). Customer enabled the main toggle but didn't know they need to enable groups separately.
**Fix:** Auto-prompt when enabling Zalo with 0 active groups: "Bật bot cho tất cả N nhóm (chế độ @mention)?" — Yes = `setAllGroupsMode('mention')`. Added to `onZaloEnabledToggle()` in dashboard.html.
**Status:** Fixed in v2.4.7, pending rebuild

---

## 2026-05-22 — Bot leaks internal /approve command to Zalo customer (CRITICAL)

**Reporter:** CEO (observed in live Zalo conversation)
**Symptom:** When customer asks about product, bot replies "Anh duyệt giúp em lệnh này để em đọc đúng tài liệu" and shows `/approve 271048e7 allow-once` with PowerShell `Get-Content` command to read `skills/operations/zalo.md` and `knowledge/san-pham/index.md`. Customer sees internal file paths and approval mechanism.
**Root cause:** Bot uses `exec` tool (PowerShell Get-Content) to read 2 files in one call instead of `read_file`. `exec` requires approval → approval prompt goes to current channel (Zalo customer) instead of CEO. Zalo customer sees `/approve` command + internal file paths.
**Fix (2-layer):**
1. AGENTS.md rule: "CẤM TUYỆT ĐỐI khi đang trả lời Zalo: Bot KHÔNG ĐƯỢC dùng exec tool. Dùng read_file."
2. Output filter Layer L: 4 new patterns catch `/approve`, `allow-once`, `Get-Content`, "duyệt giúp em" — blocked before reaching customer.
**Status:** Fixed in v2.4.7, pending rebuild

---

## 2026-05-22 — Bot cannot summarize today's Zalo conversations (CRITICAL UX)

**Reporter:** CEO (Peter Bui) testing live
**Symptom:** CEO asks "hôm nay em đã nhắn zalo với ai" and "tóm tắt zalo cho anh". Bot replies "chưa thấy phát sinh cuộc nhắn Zalo" despite real Zalo activity today.
**Root cause:** `extractConversationHistory()` in conversation.js can't identify which messages are Zalo vs Telegram. Session JSONL files have no `event.origin` field. Fallback parsing looks for `From:` / `Channel:` format but actual metadata is JSON blocks. All messages get `channel: 'unknown'` → when filtering for `channels: ['modoro-zalo']`, nothing matches → "no Zalo messages found".
**Fix:** Added sender ID format detection in conversation.js: parse `"sender_id": "XXXX"` from metadata JSON blocks. Zalo IDs are 16-19 digits, Telegram IDs are 8-12 digits (per AGENTS.md). Also extracts sender name from `"sender": "..."` pattern. Channel detection now works without needing `event.origin`.
**Status:** Fixed in v2.4.7, pending rebuild

---

## 2026-05-22 — Knowledge visibility bypass via read_file (SECURITY)

**Reporter:** Internal security audit
**Symptom:** Documents marked "Nội bộ" or "Chỉ mình tôi" in Knowledge tab are still accessible to Zalo customers if the bot is tricked into using `read_file` or `list_files` tools directly — bypassing the RAG search visibility filter.
**Root cause:** The 3-tier visibility system (public/internal/private) only enforces at the RAG search API level (`searchKnowledge({ audience })`). The bot's native `read_file`/`list_files` tools read directly from disk, never touching the DB visibility column.
**Fix (3-layer defense-in-depth):**
1. Code: `<file-access-policy>` block injected into inbound.ts rawBody — instructs AI to not use read_file for sensitive paths when serving Zalo
2. API: `/api/file/read` adds sensitive path blocklist + DB visibility check for knowledge files
3. AGENTS.md v105: Updated Zalo rule — use `<kb-doc>` only, CẤM read_file for knowledge/memory/logs
**Status:** Implemented, pending rebuild

---

## 2026-05-23 — Cron "Config invalid" channels.telegram additional properties

**Reporter:** Customer (Tro Ly TC bot)
**Symptom:** All cron jobs fail with "channels.telegram: invalid config: must NOT have additional properties". 3 retries exhausted.
**Root cause:** `set-inbound-debounce` IPC wrote `channels.telegram.messages.inbound.debounceMs` — `messages` not in openclaw Telegram schema. Pre-spawn healer only runs static cleanup (no stderr), misses dynamic fields on first attempt.
**Fix:** (1) Remove per-channel debounce writes, use global `config.messages.inbound.debounceMs` only. (2) Add `messages` to Telegram legacy key cleanup. (3) For v2.5.0: pre-spawn `--version` probe to catch config errors before first cron attempt.
**Status:** Fix applied in v2.4.8, not yet shipped

---

## 2026-05-23 — Cron "spawn ENAMETOOLONG" on Windows

**Reporter:** Customer (IT_Bot)
**Symptom:** Cron weekly-report fails with exit code -1, "spawn ENAMETOOLONG". Retried 3 times, same error each time.
**Root cause:** Weekly report prompt grows to 30-50KB+ (7 days summaries + history + memory). Passed via `--message` CLI arg → Windows CreateProcess 32KB limit exceeded. No pre-spawn size check, no file-based fallback.
**Fix:** For v2.5.0: (1) Write prompt to temp file when >20KB, pass `--message-file` instead. (2) Add `ENAMETOOLONG` to `isFatalErr()` to avoid 3 wasteful retries. (3) Cap prompt template substitutions.
**Status:** Fixed in v2.4.8

---

## 2026-05-23 — Cron evening report not delivered to CEO

**Reporter:** Customer (BKE)
**Symptom:** Evening 21:00 cron report fires successfully (agent runs, no errors) but CEO never receives the report on Telegram.
**Root cause (2 failures):**
1. Path 1 (`sessions.send`): `getCeoSessionKey()` constructs `agent:main:telegram:direct:<chatId>` but OpenClaw 2026.4.14 defaults `session.dmScope` to `"main"` → actual session key is `agent:main:main` → session not found → fail silently
2. Path 2 (fallback `--json`): Agent output parsed correctly but only delivered to Zalo targets. Telegram-only crons had no delivery → report lost
**Fix:** (1) `getCeoSessionKey()` reads `session.dmScope` from openclaw.json, returns correct key format. (2) Fallback path calls `sendTelegram(replyText)` when no zaloTarget.
**Status:** Fixed in v2.4.8
