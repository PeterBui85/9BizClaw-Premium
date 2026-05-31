# Báo cáo: Hermes Agent memory & cách tích hợp vào 9BizClaw

_Research 2026-05-30. Nguồn: tài liệu Nous Research Hermes Agent + đọc trực tiếp openclaw bundle + MemoryOS hiện tại của 9BizClaw._

## TL;DR (cho CEO)

- **Hermes Agent (Nous Research)** là agent tự cải thiện, và **openclaw — nền tảng 9BizClaw đang chạy — chính là dòng dõi Hermes** (skills Markdown+YAML, cron, SQLite sessions, Telegram).
- Hermes có **bộ nhớ tự động ở tầng RUNTIME** (prefetch trước mỗi lượt → sync sau mỗi lượt → extract khi hết phiên), **KHÔNG cần model tự gọi tool**.
- **openclaw bundle của 9BizClaw ĐÃ có sẵn cơ chế đó** (`memory-core` plugin + hook `session_end`/`compaction`/token-flush) — nhưng đang **NGỦ ĐÔNG** (openclaw.json chưa cấu hình `memory`, không có DB trên disk).
- 9BizClaw lại tự xây **MemoryOS riêng dựa vào model tự gọi `POST /api/memory/write`** → **không đáng tin** → `ceo_memories` rỗng nhiều ngày (đã verify hôm nay).
- **Hướng đi:** bỏ phụ thuộc model — **bật bộ nhớ native của openclaw (Option A)** hoặc **tự viết hook capture ở tầng code (Option B)**. Cả hai đều capture bằng CODE, không nhờ model.

---

## 1. Hermes memory thực sự hoạt động thế nào

Hermes có **2 tầng built-in + 1 tầng provider tùy chọn** (KHÔNG phải "3 tier cố định" như marketing):

**Tầng built-in (luôn bật, file Markdown, nạp "đông cứng" vào system prompt lúc mở phiên):**
- `MEMORY.md` (~2.200 ký tự / ~800 token) — ghi chú agent: quy ước, bài học.
- `USER.md` (~1.375 ký tự / ~500 token) — hồ sơ user: tên, sở thích, phong cách.
- Nạp "frozen snapshot" để **prefix-cache** ăn (ghi xuống đĩa ngay nhưng chỉ tái-inject ở phiên kế).
- **Quan trọng:** tầng này **do MODEL tự gọi `memory` tool** (add/replace/remove) — tức vẫn "model tự quyết ghi" (proactive nhưng model-driven). Đây KHÔNG phải auto thật sự.

**Tầng session-search:** mọi hội thoại lưu SQLite (`state.db`) + FTS5, model search khi cần ("hồi xưa mình nói gì").

**Tầng external provider (1 cái active tại 1 thời điểm) — ĐÂY là auto thật:**
Khi bật provider, **runtime** chạy vòng đời quanh mỗi lượt, **không model gọi tool**:
1. **PREFETCH** — lấy ký ức liên quan trước mỗi lượt (background, non-blocking).
2. **SYNC** — đẩy cặp hội thoại vào provider sau mỗi reply (tự động).
3. **EXTRACT** — chắt lọc ký ức khi hết phiên (provider hỗ trợ).

→ "Mỗi lượt framework gọi sync path để chunk/summarize/extract **mà model không phải nêu tên từng fact**."

**8–9 provider:** Honcho, OpenViking, Mem0, Hindsight, Holographic (local, zero-dep), RetainDB, ByteRover, Supermemory (+ Memori). Bật qua `hermes memory setup` / `memory.provider` trong config.

> Lưu ý độ tin cậy: tài liệu chính thức (hermes-agent.nousresearch.com) chặn client không-trình-duyệt (HTTP 401), một phần nội dung lấy từ Wayback — nếu cần câu chữ chính xác nên mở bằng trình duyệt thật. Một guide cộng đồng quảng cáo "auto-capture" nhưng phần triển khai lại nói built-in vẫn do model gọi tool → đừng nhầm 2 tầng.

## 2. openclaw bundle ĐÃ có native auto-memory (phát hiện chính)

Đọc trực tiếp `vendor/node_modules/openclaw/dist/plugin-sdk/...`:
- **`memory-core`** plugin + engine runtime, backend **`builtin` | `qmd`** (`types.memory.d.ts`).
- **Embedding providers** cắm được (local/remote) — `registerMemoryEmbeddingProvider`.
- **Auto-trigger ở RUNTIME (không model):**
  - Token-based flush — `shouldRunMemoryFlush()` khi token vượt ngưỡng.
  - Compaction flush — `runMemoryFlushIfNeeded()` khi nén hội thoại.
  - **`session_end` hook** — `PluginHookSessionEndEvent` (reason: new/reset/idle/daily/compaction/...).
- Bật bằng config `memory.backend`, `memory.qmd.update.onBoot`, `memory.qmd.sessions.enabled`...

**Trạng thái hiện tại (verified):** openclaw.json **không có key `memory`** + **không có DB memory-core/qmd trên disk** → tính năng này đang TẮT. 9BizClaw chưa từng dùng nó.

## 3. MemoryOS hiện tại của 9BizClaw — vì sao fail

- 3 tầng: hot (CEO-MEMORY.md inject AGENTS.md) + warm (`ceo_memories` SQLite + e5 embeddings + FTS5) + context builder (`/api/memory/context`).
- **Capture dựa 2 đường, CẢ HAI đều nhờ model tự giác:**
  1. AGENTS.md bảo bot "ghi nhớ NGAY qua `POST /api/memory/write`" — nhưng model chỉ "Ok" mà **không gọi**.
  2. Idle-extraction agent (conversation.js) — chạy trễ + prompt cũng nhờ model POST.
- **Bằng chứng:** `ceo_memories = 0 rows` nhiều ngày (verified). Phần INJECT (đọc) đã giống Hermes ("Hermes-style injection" trong repo) — **thiếu mỗi phần CAPTURE (ghi) tự động**.

## 4. Tích hợp vào 9BizClaw — 3 lựa chọn

| | Option A — Bật native memory-core openclaw | Option B — Tự viết hook capture code-level | Option C — Bật external provider Hermes |
|---|---|---|---|
| Cơ chế | Runtime openclaw tự flush/extract qua session_end/compaction | Hook ở pipeline 9BizClaw (sau reply / on session-end) tự trích + ghi `ceo_memories` bằng code | Mem0/Honcho/Holographic... auto sync_turn |
| Phụ thuộc model? | Không | Không | Không |
| Effort | **Thấp** (thêm config + restart + verify) | Trung bình (viết hook, tận dụng ceo-memory.js sẵn) | Cao (single-select, đa số cloud + deps) |
| Rủi ro | Chưa verify builtin backend chạy thật trong build này + có thể cần embedding config; có thể trùng MemoryOS cũ | Phải tự đảm bảo chất lượng trích xuất | Cloud/private-data + thêm dependency; Holographic local là ứng viên offline |

**Khuyến nghị:** 
1. **Spike Option A trước** (rẻ nhất): thêm block `memory` vào openclaw.json (qua `ensureDefaultConfig` + helper byte-equal, KHÔNG PowerShell), bật `sessions.enabled` + `onBoot`, restart, nhắn vài tin → kiểm `ceo_memories`/DB có tự ghi không.
2. Nếu builtin backend không chạy ngon → **Option B**: hook code-level ở điểm pipeline (đúng nguyên tắc repo "code-level guard > LLM rule") — ví dụ sau mỗi reply hoặc tại `session_end`, code tự phát hiện "anh thích/ghét/đừng…" + sự kiện đáng nhớ → ghi thẳng `ceo_memories`, không nhờ model.
3. Option C chỉ khi cần user-profiling mạnh + chấp nhận thêm hạ tầng.

Dù chọn A hay B: **giữ phần inject hiện có** (CEO-MEMORY.md → AGENTS.md đã là "Hermes-style", chạy tốt), chỉ thay phần **capture**.

## 5. Việc cần làm trước khi cam kết

- [ ] Verify `memory.backend: "builtin"` qua được schema-validator openclaw 2026.4.x (key `memory` là hợp lệ trong SDK types → khả năng cao OK).
- [ ] Spike: bật → restart → test → xem DB tự ghi.
- [ ] Quyết giữ/bỏ MemoryOS custom (ceo-memory.js + /api/memory/write) để tránh 2 hệ song song.

## Nguồn

- [Hermes Agent docs — memory & providers](https://hermes-agent.nousresearch.com/docs/)
- [Hermes Agent memory system deep-dive (glukhov.org)](https://www.glukhov.org/ai-systems/hermes/hermes-agent-memory-system/)
- [Hermes optimization guide (GitHub, LightRAG/providers)](https://github.com/OnlyTerp/hermes-optimization-guide)
- [Hermes Agent masterclass (Daily Dose of DS)](https://blog.dailydoseofds.com/p/hermes-agent-masterclass)
- openclaw bundle (đọc tại chỗ): `vendor/node_modules/openclaw/dist/plugin-sdk/src/config/types.memory.d.ts`, `.../plugins/hook-types.d.ts`, `.../auto-reply/reply/memory-flush.d.ts`
