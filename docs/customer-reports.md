# Customer Reports

Tracking customer-reported issues. Each entry: date, symptom, root cause, fix, status.

---

## 2026-06-11 — Mac: Google Workspace không kết nối được — "secret not found in keyring (refresh token missing)"

- **Reporter:** CEO (chuyển tiếp từ khách dùng máy Mac).
- **Symptom (khách Mac):** Upload OAuth Client JSON, bấm Connect, duyệt trên web → "Authorization received. Finishing…" rồi báo **"Secret not found in keyring (refresh token missing). Run: gog auth add <email>"**. Lúc khởi động app còn hiện popup **hỏi mật khẩu Keychain** dù chưa kết nối gogcli. Khách từng cài bản cũ trước đó. KHÔNG tái hiện trên máy CEO.
- **Đã thử, KHÔNG được:** (A) revoke quyền tại myaccount.google.com/permissions rồi connect lại; (B) xoá keychain item `gogcli` + reconnect + "Always Allow".
- **Root cause:** gog (gogcli v0.13.0) lưu refresh token vào **OS keyring** — macOS Keychain. Binary gog là bản tải runtime, **không ký** (unsigned); macOS gắn quyền truy cập Keychain theo *hash binary cụ thể*, nên gog tải lại/đổi bản → mất quyền đọc item cũ (do bản cài cũ tạo) → mọi read trả "secret not found in keyring". Popup Keychain lúc boot = `gog auth status` chạy lúc khởi động chạm Keychain. Vì token không bao giờ ghi/đọc được nên revoke ở Google vô tác dụng. (Bệnh tương tự tồn tại trên Windows: blob > 2560 byte của Credential Manager + 15 scope.)
- **Fix (`electron/lib/google-api.js`, v2.4.13):**
  1. **Ép gog dùng file token store mã hoá** thay OS keyring: `gogEnv()` set `GOG_KEYRING_BACKEND=file` + `GOG_KEYRING_PASSWORD` (passphrase random/ một-lần/ một-máy, lưu `<userData>/gog/.keyring-pass`, đã nằm trong backup). Token nằm ở `<userData>/gog/keyring` — không Keychain, không ACL theo binary, giống nhau Win/Mac. Popup Keychain lúc boot cũng biến mất.
  2. **`--force-consent`** trong `connectAccount()` → Google luôn cấp lại refresh token kể cả tài khoản đã grant trước đó (gogcli: `--force-consent` → `prompt=consent`).
  - Guard mới trong `check-google-workspace-audit-fixes.js` (chạy trong `smoke`/build). Xác nhận trên binary v0.13.0 thật: cờ + file backend đều chạy. Backup không cần sửa (đã gom cả `userData/gog/`).
- **Khách phải làm:** cài v2.4.13, mở app → upload lại JSON (nếu cần) → **Connect** → duyệt. Không cần thao tác keychain/CLI nữa.
- **Status:** FIXED in source (v2.4.13), pending Mac DMG rebuild + ship.

---

## 2026-06-01 — Mac: app không bật lên (bị kill ngay sau boot)

- **Symptom (khách Mac arm64):** Cài bản mới nhất (2.4.10), mở app → cửa sổ không hiện. Terminal chạy trực tiếp → boot log bình thường cho đến `[boot] cold-start: killing stale gateway on :18789` → `zsh: killed`. `pkill -9` tất cả processes cũng vô ích — chúng lập tức tái xuất.
- **Root cause (2 lớp):**
  1. **`openclaw gateway run` tự đăng ký macOS Launch Agent** (`~/Library/LaunchAgents/ai.openclaw.gateway.plist`) → `launchd` giữ gateway sống vĩnh viễn. Mỗi lần Electron kill → launchd restart ngay → orphan gateway luôn tồn tại trên :18789.
  2. **`killPort()` self-kill bug**: `lsof -ti :18789` trả về **mọi PID** có connection tới port, bao gồm cả Electron process (vì `isGatewayAlive()` vừa tạo HTTP client socket). `process.kill(ownPid, 'SIGKILL')` → app tự giết mình.
  - Kết hợp: launchd tạo orphan bất tử + killPort tự sát = crash loop vô tận.
- **Fix (3 lớp, `electron/lib/gateway.js`):**
  1. `unloadOpenClawLaunchAgent()` — cold boot detect + `launchctl bootout` + xóa plist. Gọi TRƯỚC orphan detection.
  2. `killPort()` exclude `process.pid` khỏi kill list (defense-in-depth).
  3. Gateway spawn set `OPENCLAW_NO_DAEMON=1` + `OPENCLAW_NO_LAUNCH_AGENT=1` env vars để ngăn openclaw tạo lại plist.
- **Workaround tức thì:** `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.plist && pkill -9 -f openclaw && pkill -9 -f 9router` rồi mở lại app.
- **Status:** Fixed in source. Pending rebuild + ship. Verified: khách chạy workaround → app boot thành công, gateway ready 7s, cron OK, Zalo listener running.

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

---

## 2026-06-04 — Bot forgot customer name + CEO-taught behavior after update

**Reporter:** Customer CEO (via founder) — "có con đến tên nó còn không nhớ", "công cụ anh đã dạy nó quên"; one customer mắng vốn.
**Symptom:** After an app update the bot stopped remembering a customer's name and appeared to forget CEO-taught behavior. Separately, when a customer asked it to read Zalo history, the bot fabricated a non-existent "Bật lưu lịch sử tin nhắn / message DB" Dashboard flow.
**Root cause (3 compounding):**
1. Every AGENTS version-bump ran `purgeAgentSessions()` → wiped ALL chat sessions on each update (conversation memory + daily-cron source gone).
2. The bot never read the stored customer profile into replies (file-access blocked memory reads; only a 1-line name/gender hint injected) → blind to saved data.
3. The per-customer memory mechanism relied on the LLM voluntarily calling `/api/customer-memory/write` — it had NEVER fired (audit log absent) → profiles stayed empty.
The "message DB" answer was a pure LLM hallucination — no such UI existed.
**Fix (v2.4.11, 2026-06-04):** (1) removed session-purge on version-bump; (2) code-injects the sender's own profile (name+facts) into every reply; (3) replaced the LLM-self-call with a code-enforced 3-min extractor (`customer-memory-updater`) that builds each customer's profile from openzca SQLite; (4) added a verbatim ground-truth history archive + `/api/zalo/history` endpoint; (5) AGENTS.md anti-hallucination section forbidding invented UI; (6) Sacred-Data 4-layer protection so customer data can never be lost on update/reset.
**Status:** Fixed in v2.4.11 (build 2026-06-04). Verified live (Minh test extracted + remembered). Pending CEO live-confirm after reinstall.

---

## 2026-06-05 — Bot báo "route tạo skill không tồn tại" khi khách tạo skill qua Telegram

- **Symptom (khách CEO):** Khách nhắn bot tạo skill/rule qua Telegram. Bot trả lời "route nội bộ tạo skill đang không có trên máy lúc này… route tạo skill và check conflict trả về không tồn tại" rồi không tạo được. Danh sách user skill thì đọc được (rỗng).
- **Root cause:** Các route `/api/user-skills/create` + `/check-conflict` là **POST-only**; chỉ `/api/user-skills/list` nhận GET. Agent (LLM) "dò" route bằng GET trước khi dùng → POST-only route rơi xuống 404 `{"error":"not found"}` chung → bot hiểu nhầm là "route không tồn tại". Routes vẫn hoạt động bình thường với POST (reproduce live: GET create→404, POST check-conflict→200). Không phải lỗi version (routes có ở v2.4.9/2.4.10/2.4.11).
- **Fix (v2.4.11, `electron/lib/cron-api.js`):** thêm guard trả **405 method_not_allowed** kèm thông điệp "chỉ nhận POST — gọi lại bằng web_fetch method=POST, đừng GET để dò route" cho 6 route user-skills POST-only, thay vì rơi xuống 404. Agent nhận feedback rõ ràng → retry bằng POST.
- **Status:** Fixed in source. Pending rebuild + ship.

## 2026-06-05 — Khách Zalo bị gọi sai tên ("anh Modoro" thay vì "anh Lâm")

- **Symptom:** Khách Zalo tên hiển thị "Lâm Modoro" (Lâm = tên người, Modoro = brand). Bot xưng hô "anh Modoro" (sai) — phải là "anh Lâm".
- **Root cause (`electron/packages/modoro-zalo/src/inbound.ts` ~1423-1450):** `__ghCallName` mặc định = **token cuối** ("Modoro"). Vòng quét tìm tên gọi đúng (khớp danh sách tên VN → "Lâm") nằm **bên trong `if (!__ghGender)`**. Khi Zalo đã cung cấp gender (rất phổ biến), `__ghGender` có sẵn → vòng quét bị bỏ qua → giữ nguyên token cuối "Modoro".
- **Fix:** quét tên gọi (call-name) **luôn chạy**, không chỉ khi chưa biết gender; nhưng phải tránh regress tên truyền thống ("Nguyễn Văn Minh" → "Minh"). Heuristic cần CEO chốt. Chưa apply.
- **Status:** Root-caused. Fix heuristic chờ CEO chốt.

## 2026-06-05 — Khách Zalo vẫn dùng gpt-5.4 (combo main) thay vì combo zalo (cx/gpt-5.2)

- **Symptom:** Reply cho khách Zalo dùng `ninerouter/main` (gpt-5.4, đắt) thay vì `ninerouter/zalo` (cx/gpt-5.2, rẻ). Xác nhận từ session transcript: turn 10:00 ghi `provider:ninerouter, model:main`.
- **Root cause:** Per-channel routing v2.4.11 đặt `channels.modelByChannel.modoro-zalo = {"*":"ninerouter/zalo"}`. Nhưng openclaw `resolveChannelModelOverride` (vendor `model-overrides-CvsNtZ-p.js:105`) bail sớm: `if (keys.length === 0 && parentKeys.length === 0) return null` — với tin nhắn **1:1 (direct DM)** không có groupId/parent-conversation, cả keys & parentKeys rỗng → return null **trước khi** xét wildcard `"*"`. Mọi chat khách Zalo đều là DM → override không bao giờ áp dụng → fallback về `agents.defaults.model` = main. Không phải session-pin (`modelOverride` undefined), không phải session cũ. Telegram "có vẻ đúng" chỉ vì model mong muốn của nó trùng default (main).
- **Fix:** `modelByChannel."*"` không chạy cho DM. Config-only trong CÙNG workspace (bindings + agent riêng) cũng KHÔNG đủ — theo CTO (2026-06-05), combo khác cho Zalo chỉ chạy nếu **tách workspace riêng** (AGENTS.md/memory/sessions/plugin wiring riêng). Đây là việc kiến trúc, không phải config tweak. Xem memory `project_zalo_per_channel_model_needs_workspace`.
- **Status:** Root-caused. DEFERRED — cần scope project "Zalo workspace riêng". Telegram/default giữ combo main; Zalo tạm thời vẫn main cho tới khi làm.

## 2026-06-05 — [SECURITY DEBT, logged + deferred] Zalo agent có exec/read/write tool toàn cục

- **Finding (internal, không phải khách báo):** Global `tools.allow` trong openclaw.json cấp `exec`, `read_file`, `write_file`, `apply_patch` cho MỌI channel — kể cả Zalo (không có per-channel removal; `config.js:1016` xoá `tools.deny`). Phòng vệ Zalo hiện chỉ là **deny-list ở mức input** (COMMAND-BLOCK trong inbound.ts chặn message khách chứa `exec:`, các pattern gọi API nội bộ, `child_process`, "chạy lệnh") + policy mức prompt — KHÔNG gỡ tool khỏi agent.
- **Exposure:** Một prompt-injection né được từ khoá bị chặn có thể khiến Zalo agent chạy `exec` → đọc `cron-api-token.txt` → giả mạo call CEO cron-api (`X-Source-Channel: telegram` + Bearer) ghi skill/memory/file/cron, hoặc chạy shell tuỳ ý. Impact cao (chiếm bot CEO), độ khó trung bình. Trái với chủ trương CLAUDE.md ("cron/process/read/write BANNED khỏi Zalo").
- **Lưu ý về helper:** `skills/operations/local-api.js` KHÔNG mở rộng lỗ hổng này (Zalo exec đã có thể cat-token + curl sẵn) — chỉ *ghi rõ* câu lệnh leo thang trong file workspace Zalo đọc được.
- **Fix đúng (deferred theo CEO):** gỡ `exec`/`write_file`/`apply_patch`/`read_file` khỏi Zalo agent ở **mức tool** (Zalo chỉ còn `message` + `web_fetch` GET + RAG). Giải quyết tự nhiên bằng hướng tách Zalo agent/workspace riêng (cùng project với routing model rẻ). Memory: `project_zalo_exec_tool_exposure`.
- **Status:** LOGGED, DEFERRED — CEO quyết sau.

## 2026-06-05 — Khách "sếp Huê": bot báo thiếu bài trong chiến dịch FB 14 bài (chỉ thấy 5 chờ đăng)

- **Symptom:** Chiến dịch 14 bài FB. Bot báo chỉ còn 5 bài chờ đăng (bài 3-7), "vừa đăng bài 9", các bài còn lại "không còn trong lịch chờ, chưa kết luận được đã đăng hay chưa". Đếm thiếu, lệch mốc.
- **Root cause (kiến trúc, mọi máy):** Mỗi bài là 1 schedule one-time trong `fb-scheduled-posts.json`; bài one-time **tự xoá khỏi lịch ngay sau khi đăng** (`fb-schedule.js` deleteScheduleById, line ~506). Bot báo cáo từ `/api/fb/schedule/list` — route này CHỈ trả bài CHƯA chạy. Nên với chiến dịch nhiều bài, bot chỉ thấy phần đuôi đang chờ (5/14), không bao giờ thấy bài đã đăng, không đối chiếu được tổng. Lịch sử đăng có lưu trong pending file (`status:published`) nhưng KHÔNG có route nào liệt kê được (chỉ `/pending?id=` theo từng id).
- **Fix (v2.4.11):** (1) ledger bền `fb-post-history.jsonl` — ghi mọi kết quả đăng (published/skip/lỗi) tại `publishPending` trước khi schedule bị xoá; (2) route mới `GET /api/fb/schedule/history` liệt kê ledger; (3) `facebook-post-workflow.md` BẮT BUỘC đối chiếu `/list` (chờ) + `/history` (đã đăng) so với tổng CEO nhắc, không báo từ 1 nguồn.
- **Status:** Fixed in source + build. Pending reinstall + verify.

## 2026-06-05 — Tính năng đọc/tạo file Word (.docx) hỏng — thiếu module 'underscore'

- **Symptom (internal, phát hiện khi audit):** Log lỗi `Cannot find module 'underscore'` khi dùng mammoth (đọc/convert .docx).
- **Root cause (packaging, mọi máy):** `asarUnpack` unpack `**/mammoth/**` nhưng KHÔNG unpack các dep của mammoth (underscore, @xmldom/xmldom, base64-js, dingbat-to-unicode, lop, path-is-absolute) → mammoth chạy unpacked không resolve được dep nằm trong asar.
- **Fix (v2.4.11):** bỏ `**/mammoth/**` khỏi asarUnpack → mammoth + toàn bộ dep nằm chung trong asar, resolve bình thường (`**/*.node` vẫn unpack native). Verified trong artifact: mammoth/underscore có trong app.asar, không còn ở app.asar.unpacked.
- **Status:** Fixed in source + build. Pending reinstall.

---

## 2026-06-09 — Cron tới giờ không gửi được ảnh — "CEO Telegram only" (403)

- **Reporter:** anh Song Quang
- **Symptom:** Lịch tự động (cron) tới giờ không gửi được ảnh vào Zalo — API trả `{"error":"CEO Telegram only."}` (403).
- **Root cause:** Tiến trình `agent` do cron spawn không gắn được thẻ `X-9BizClaw-Agent-Channel: telegram` + Bearer token vào web_fetch nội bộ (audit: `channel=none` / `bad_token`) — phụ thuộc cách OpenClaw luồn `--channel` + đọc file token, mong manh. Gate `_requireCeoTelegram` chặn đúng luật; lỗi nằm ở khâu cấp credential cho cron-agent. Default-deny nên KHI rớt auth là cron mất TOÀN BỘ quyền (gửi Zalo, đăng FB, đọc Drive/Sheets, exec...), không chỉ gửi ảnh.
- **Fix (v2.4.12):** cron/CEO agent nhận token qua env `BIZCLAW_CRON_API_TOKEN` (boot.js, chỉ spawn `agent` — tiến trình CEO-trust, không phục vụ Zalo); web_fetch patch đọc env trước, độc lập channel-threading; marker v3→v4. Verify: e2e 4/4 (env→header→gate 200; không env→403), smoke pass, karpathy-council 0-blocking. Token chỉ vào tiến trình CEO-trust → khách Zalo vẫn bị nhốt.
- **Status:** Fixed in source + build v2.4.12.

## 2026-06-09 — Bài Facebook lên lịch mất ảnh trước giờ đăng

- **Reporter:** chị Huê (báo lỗi Facebook)
- **Symptom:** Bài Facebook đã duyệt ảnh nhưng tới giờ đăng thì thiếu/mất ảnh.
- **Root cause:** image-gen tự dọn ảnh (giữ 20 mới nhất) → xóa nhầm banner đã duyệt của bài lên lịch trước giờ đăng (dangling reference).
- **Fix (v2.4.12):** bỏ auto-delete — mọi ảnh AI tạo được giữ lại trong `brand-assets/generated/` (anti-feature có chủ đích). Đánh đổi: thư mục phình; chỉ thêm cap sau này nếu đĩa thành vấn đề, và cap PHẢI loại trừ ảnh còn được tham chiếu bởi bài lên lịch.
- **Status:** Fixed in source + build v2.4.12.

## 2026-06-09 — Góp ý: thư mục ảnh AI đã tạo

- **Reporter:** chị Nương (góp ý)
- **Note:** Góp ý liên quan thư mục/đường dẫn ảnh AI đã tạo. v2.4.12 giữ lại toàn bộ ảnh trong `brand-assets/generated/` (không tự xóa) nên ảnh đã tạo luôn còn để tra/đăng lại.
- **Status:** Acknowledged (gắn với fix giữ ảnh v2.4.12).

## 2026-06-10 — Khách (máy Mac): file Excel thưởng/phạt hỏng, không mở được + lưu vào thư mục ẩn

- **Reporter:** khách chạy bản Mac (yêu cầu bot tạo file Excel thưởng/phạt, lưu ra Desktop).
- **Symptom:** File `Reward_Penalty.xlsx` 9bizclaw tạo bị corrupt, Excel không mở được. Bot báo đã lưu ở `/Users/mac/Library/Application Support/9bizclaw/media/Reward_Penalty.xlsx` và TỪ CHỐI ghi ra Desktop ("path không nằm trong thư mục được phép"). Câu trả lời tiếng Việt còn bị méo, lẫn ký tự Nga.
- **Root cause (kiến trúc, mọi máy — lộ rõ trên Mac):**
  1. `.xlsx` là binary (zip) nhưng bot ghi bằng tool ghi-TEXT (native `write_file` của OpenClaw, hoặc `/api/file/write` ghi `String(content)` utf-8). utf-8 bóp méo mọi byte ≥ 0x80 → vỡ zip → corrupt. Đường binary-safe duy nhất (`skill-runner` → `XLSX.writeFile`) KHÔNG được dùng.
  2. Bot dùng native `write_file` (sandbox vào workspace=media) → file rơi vào `~/Library/.../media/` (Library ẩn mặc định trên Mac) và TỪ CHỐI Desktop, dù CEO Telegram có full quyền ghi mọi nơi qua skill-runner / `/api/file/write` path tuyệt đối.
  3. (Phụ) Output tiếng Việt lỗi, lẫn tiếng Nga — chất lượng output model, theo dõi riêng.
- **Fix (source, chưa build):** (a) Code guard `/api/file/write` chặn ghi `.xlsx/.xlsm/.xls/.docx/.pptx/.pdf` qua đường text + thêm `encoding:"base64"` binary-safe ([cron-api.js](../electron/lib/cron-api.js)); (b) AGENTS.md BẮT BUỘC tạo Office/PDF qua skill-runner `XLSX.writeFile(<absolute path>)` ghi thẳng tới vị trí CEO muốn (kể cả Desktop), cấm native `write_file`/text cho binary; (c) bump AGENTS 122→123 + workspace.js để deploy tới máy khách; (d) smoke assertion khoá guard.
- **Status:** Fixing in source — chưa build/ship.
