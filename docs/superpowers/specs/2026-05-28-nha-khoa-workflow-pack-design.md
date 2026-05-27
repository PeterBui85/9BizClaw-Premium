# Nha Khoa Workflow Pack — Design Spec

**Status:** Draft v1
**Date:** 2026-05-28
**Author:** Brainstorm session (CEO + Claude)
**Supersedes:** `docs/superpowers/specs/2026-05-27-zalo-menu-ui-brainstorm-design.md` (folds dispatcher into pack infrastructure)
**Implements:** First production workflow pack on the 9BizClaw pack platform

---

## 1. Problem Statement

9BizClaw today is a single-tenant AI assistant for one CEO running one business. The same architecture (Telegram + Zalo gateways, openclaw agent, AGENTS.md persona) can be packaged into reusable **workflow packs** — domain-specific bundles of personas, slash commands, conversational flows, SOPs, scheduled jobs, and escalation logic that a clinic, gym, salon, or shop installs into their copy of MODOROClaw and runs as their virtual receptionist.

This spec defines:

1. The **pack platform** (folder format, manifest, lifecycle, distribution, licensing, channel abstraction).
2. The **first concrete pack — Nha khoa (dental)** — covering a full clinic with all specialties.

The dental pack is the proving ground for the platform; gym is next.

### Out of scope for v1

- Gym pack (separate spec follows).
- WhatsApp adapter (channel adapter contract is defined; implementation deferred to v1.5).
- Multi-tenant SaaS (each install serves one clinic on the clinic's PC).
- Marketplace UI (bundled + private repo install for v1; marketplace deferred to v2).
- Tenant content overrides (CEO editing pack files directly — deferred to v1.1).
- Decision-tree flows (slot-filling only for v1).

---

## 2. Architecture

### 2.1 Per-channel pipelines, shared services

```
┌─ MODOROClaw process ────────────────────────────────────────┐
│                                                              │
│  ┌─ Per-channel pipelines (parallel) ──────────────────────┐│
│  │  Zalo gateway :18789      Telegram gateway :18790       ││
│  │       │                         │                        ││
│  │  Zalo adapter             Telegram adapter              ││
│  │       │                         │                        ││
│  │  inbound pipeline         inbound pipeline              ││
│  │  (dedup, rate-limit,      (rate-limit, command-block,   ││
│  │   command-block, ...)      ...)                          ││
│  │       │                         │                        ││
│  │  >>> shared dispatcher (command + flow router) <<<      ││
│  └─────────────────────────────────────────────────────────┘│
│                          │                                   │
│  ┌─ Shared services ─────┴─────────────────────────────────┐│
│  │  Pack registry  | Identity      | Cron                  ││
│  │  Audit          | Knowledge RAG | Flow runtime          ││
│  │  SOP loader     | Escalation    | License/entitlement   ││
│  │  Tenant config  | CEO control plane                     ││
│  └─────────────────────────────────────────────────────────┘│
│                          │                                   │
│  workspace/                                                  │
│    packs/nha-khoa/        # installed pack (read-only)      │
│    config/tenant.json     # wizard output → Mustache vars   │
│    state/                                                    │
│      flows/               # active flow state per customer  │
│      paused-topics.json   # post-escalation freeze table    │
│    CUSTOMERS/             # per-customer files              │
│    GROUPS/                # per-Zalo-group state            │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Channel isolation principle

Each channel runs its **own gateway process, its own agent runtime, its own inbound pipeline**, on its own port. Channels do NOT cross-talk on the wire. Cross-channel coordination happens only through shared services (e.g., an escalation triggered on Zalo lands in both a Telegram staff group and a Zalo staff group via the escalation router, but each delivery goes through the respective channel's adapter and gateway).

Benefit: a slow Zalo turn does not block a Telegram turn. A Zalo gateway crash does not take Telegram down.

### 2.3 Pack/channel/tenant separation

- **Pack** (read-only): content, flows, SOPs, persona templates, manifest. Lives in `packs/<pack-id>/`.
- **Tenant** (per-install): the clinic's specific config — name, hours, dentists, services, prices, group IDs. Lives in `config/tenant.json`.
- **Channel**: how customers reach the bot. Pack declares `kenh: ["zalo"]`; v1.5 adds `"whatsapp"`.

Each pack version × tenant config → rendered content via Mustache at install time → resolved files written under `packs/<pack-id>-rendered/`. Gateway loads rendered files.

### 2.4 Single-tenant assumption

Each MODOROClaw installation serves exactly one business. Selling to two clinics = two installations. Multi-tenant routing is **out of scope** for the pack platform.

---

## 3. Pack Folder Structure

Vietnamese folder/file names everywhere the clinic owner (CEO) might browse, edit, or be aware of. Pure code stays English-shaped.

```
packs/nha-khoa/
  manifest.json
  cau-hinh.schema.json              # JSON Schema → wizard auto-generates form
  vi-du-cau-hinh.json               # filled-in example for docs
  HUONG-DAN.md                      # what this pack does, how to install, FAQ

  tinh-cach/                        # persona templates (Mustache)
    SOUL.md                         # personality, tone, hard refusals
    IDENTITY.md                     # name, role, language
    AGENTS.md.tmpl                  # main agent system prompt template

  lenh/                             # one .md per slash command (Mustache)
    menu.md
    dich-vu.md
    bao-gia.md
    lich-kham.md
    doi-lich.md
    huy-lich.md
    gio-mo-cua.md
    dia-chi.md
    lien-he.md
    bao-che.md
    khuyen-mai.md
    bao-hanh.md
    thanh-toan.md
    help.md

  quy-trinh/                        # slot-filling flow definitions
    dat-lich.json
    doi-lich.json
    huy-lich.json
    bao-gia.json
    khai-thac-tien-su.json
    hau-phau-checkin.json
    nhac-lich.json

  quy-trinh-chuan/                  # SOPs (RAG-indexed) + core (always-loaded)
    _co-ban/                        # always-loaded, < 15KB total
      cap-cuu-trieu-chung.md
      quy-tac-leo-thang.md
      tu-choi-thanh-toan.md
      khong-tu-van-y-khoa.md
    tong-quat/                      # general dentistry (cleaning, fillings, ...)
    chinh-nha/                      # orthodontics
    cay-ghep/                       # implants
    tham-my/                        # cosmetic (whitening, veneers, ...)
    noi-nha/                        # endodontics
    nha-khoa-nhi/                   # pediatric
    nha-chu/                        # periodontics
    phau-thuat-mieng/               # oral surgery

  kien-thuc/                        # long-form reference (RAG-indexed)
    ve-phong-kham.md                # CEO's brand voice doc (template)
    quy-dinh-noi-bo.md              # internal clinic policies

  lich-tu-dong/                     # cron templates
    nhac-lich-kham.json
    hau-phau-checkin.json
    gui-khuyen-mai.json

  chuyen-tiep/                      # escalation
    the-canh-bao.md                 # card template sent to staff groups
    topics.json                     # topic classifier keywords/intents

  ham-tuy-chinh/                    # optional custom hooks (pack-author code)
    pack.js                         # exports { findSlot, validateSdt, ... }

  ngon-ngu/                         # UI strings (errors, confirmations)
    vi.json
```

### 3.1 Manifest schema

`manifest.json`:

```json
{
  "id": "nha-khoa",
  "ten": "Nha khoa — Quản lý toàn diện",
  "moTa": "Lễ tân ảo cho phòng khám nha khoa: đặt lịch, báo giá, nhắc hẹn, hậu phẫu",
  "phienBan": "1.0.0",
  "kenh": ["zalo"],
  "banQuyen": {
    "loai": "tra-phi",
    "prefix": "CLAW-PACK-NHA-KHOA-"
  },
  "yeuCau": {
    "phienBanApp": "2.5.0"
  },
  "tienIch": {
    "timSlot": "ham-tuy-chinh/pack.js#findSlot",
    "validateSdt": "ham-tuy-chinh/pack.js#validateSdt"
  },
  "quyen": [
    "doc-khach-hang",
    "ghi-khach-hang",
    "gui-zalo",
    "gui-telegram"
  ]
}
```

Keys with no diacritics (camelCase Vietnamese) are valid JavaScript identifiers, so code can read `manifest.phienBan` directly.

### 3.2 Pack content invariants

- All `.md` and `.json.tmpl` files MAY contain `{{mustache.vars}}` referencing tenant config fields.
- All file names are stable; renaming a file = breaking change requiring a major version bump.
- `manifest.json` and `cau-hinh.schema.json` MUST validate against pack platform's meta-schema (shipped in app).
- Pack content MUST NOT reference absolute paths outside the pack folder.
- `ham-tuy-chinh/pack.js` (if present) runs in a Node VM sandbox with restricted module access (`require` whitelist: `dayjs`, `lodash`, `zod`).

---

## 4. Dispatcher and Flow Runtime

### 4.1 Pipeline injection

The pack dispatcher slots into the existing modoro-zalo `inbound.ts` pipeline between `msg-length-gate` and `vision-safety`. Injection uses the established idempotent marker pattern:

```ts
// === 9BizClaw PACK-DISPATCHER PATCH v1 ===
const __pkDispatch = (globalThis as any).__packDispatcher;
if (__pkDispatch && typeof __pkDispatch.handle === "function") {
  const result = await __pkDispatch.handle(message);
  if (result?.handled) return;
}
// === END 9BizClaw PACK-DISPATCHER PATCH v1 ===
```

`global.__packDispatcher` is registered by `electron/lib/dispatcher.js` at boot, after pack-registry loads.

### 4.2 Dispatcher decision order

For every inbound message that survives prior filters:

```
1. paused-topic check
   if paused-topics.json has entry for {channel,customerId} AND
      message matches a paused topic (via topic classifier) →
        reply with stand-by line, return handled=true
2. active flow check
   if state/flows/<channel>:<customerId>.json exists (and not expired) →
        flow-runtime.tick(state, message), return handled=true
3. whole-line slash command
   if message.rawBody.trim() matches /^\/[a-zA-Z0-9_-]+(\s|$)/ AND
      command exists in any active pack's lenh/ registry →
        render command file with vars, send, return handled=true
4. flow trigger match
   if message text matches a flow's "kichHoat" pattern (intent or phrase) →
        start flow, ask first slot, return handled=true
5. fallthrough
   return handled=false  → LLM agent gets the message
```

### 4.3 Whole-line slash match (refinement of earlier dispatcher rule)

The match is **whole-line**, not substring. Specifically, after `trim()`:

- First token must start with `/`.
- First token must match `/^\/[a-zA-Z0-9_-]+$/` (no diacritics in command names).
- Command name (before any arg) must exist in the pack's `lenh/` directory.

Examples:

| Input | Matches? | Why |
|---|---|---|
| `/lichkham` | yes | leading slash, command exists |
| `/bg 9b` | yes | leading slash, `/bg` exists, arg `9b` passed |
| `tôi muốn biết về sản phẩm` | no | substring "sanpham" present but no leading slash |
| `xin chào /lichkham` | no | slash not at start |
| ` /lichkham` | yes | leading whitespace stripped by `trim()` |
| `/LichKham` | no | case-sensitive; commands are lowercase |
| `/khongtontai` | no | does not exist in `lenh/` |

### 4.4 Slot-filling flow runtime

```js
// electron/lib/flow-runtime.js
async function tick(channel, customerId, message) {
  const state = await loadFlowState(channel, customerId);
  if (!state) return null;

  if (matchesCancel(message, state)) return cancelFlow(state);
  if (matchesEscalate(message, state)) return escalateFlow(state);

  const slot = nextEmptySlot(state);
  if (!slot) return await completeFlow(state);  // all slots full → run hook

  const extracted = await extractSlot(slot, message, llm);  // see §4.5
  if (extracted.value === null) {
    state.attempts[slot.ten] = (state.attempts[slot.ten] || 0) + 1;
    if (state.attempts[slot.ten] >= 3) return escalateFlow(state);  // stuck
    return ask(slot.hoi);
  }

  const validation = await validateSlot(slot, extracted.value);
  if (!validation.ok) return askWithHint(slot, validation.hint);

  state.values[slot.ten] = extracted.value;
  await saveFlowState(channel, customerId, state);

  const next = nextEmptySlot(state);
  if (next) return ask(next.hoi);

  return await completeFlow(state);
}
```

Flow state file (`workspace/state/flows/zalo:123456.json`):

```json
{
  "flowId": "dat-lich",
  "packId": "nha-khoa",
  "startedAt": "2026-05-28T03:21:00Z",
  "lastInteractionAt": "2026-05-28T03:23:15Z",
  "timeoutAt": "2026-05-28T03:53:15Z",
  "values": {
    "dichVu": "cay-ghep",
    "ngay": "2026-06-02"
  },
  "attempts": { "buoi": 1 },
  "history": [
    { "role": "bot", "text": "Dạ anh/chị muốn đặt dịch vụ gì ạ?", "at": "..." },
    { "role": "user", "text": "Cấy implant", "at": "..." }
  ]
}
```

Expiry sweep runs every 5 minutes; expired flow state moves to `workspace/state/flows/_expired/` (kept 7 days for debugging, then deleted).

### 4.5 Slot extraction

Each slot has a `validate` field naming an extractor strategy:

| Strategy | Implementation |
|---|---|
| `enum:<field-path>` | LLM picks one of the enum values from tenant config (e.g., `enum:dichVu.ma\|dichVu.ten`) |
| `ngay-trong-tuong-lai` | LLM extracts ISO date, validate date > now |
| `ho-ten-vi` | LLM extracts name; regex validates Vietnamese full name (2-5 words, no digits) |
| `sdt-vn` | LLM extracts phone; regex validates Vietnamese phone format |
| `enum:sang,chieu` | LLM picks between literal options |
| `custom:<hook>` | Pack-provided JS hook in `ham-tuy-chinh/pack.js` |

Extraction is a single LLM call per slot, with prompt:

```
Trích xuất giá trị cho field "{slotName}" từ tin nhắn người dùng.
Field type: {strategy}
{enum list if applicable}
Tin nhắn: "{message}"
Trả về JSON: { "value": "...", "confidence": 0.0-1.0 } hoặc { "value": null }
```

Confidence < 0.6 → treat as null → re-ask. Implementation goes through 9router (cheapest available model).

### 4.6 Flow completion hook

After all slots filled, `completeFlow(state)` runs:

1. If flow has `hoanThanh.hook`, call it with state.values. Hook may return:
   - `{ confirm: "...text..." }` → bot sends confirm message and waits for next inbound to finalize.
   - `{ done: true, reply: "..." }` → bot sends final reply, deletes state.
   - `{ escalate: { topic, to } }` → escalate per §6.
2. If no hook, send `hoanThanh.fallback.say` and (if `escalate: true`) escalate.

---

## 5. SOP Hybrid Loading

### 5.1 Core (always-loaded)

`quy-trinh-chuan/_co-ban/*.md` are concatenated into the rendered `AGENTS.md` at install time. Total budget: ≤ 15KB. Contains: emergency triage, escalation rules, payment refusal script, "no medical advice" hard refusal.

These are always in the LLM's context for every turn. No retrieval, no opt-out.

### 5.2 Retrieved (RAG)

`quy-trinh-chuan/<specialty>/*.md` + `kien-thuc/*.md` are indexed into the per-tenant Knowledge SQLite at pack install. Each row tagged `source = pack:nha-khoa` so pack removal cleans up cleanly.

Per LLM turn (after pipeline filters, before agent call):

```js
const embedding = await embed(message.text);
const hits = await knowledgeDb.vectorSearch({
  embedding,
  topK: 4,
  threshold: 0.55,
  filter: { source: { startsWith: "pack:" } }
});
const retrieved = hits.map(h => `### ${h.title}\n${h.body}`).join("\n\n");
systemPrompt = baseSystemPrompt + "\n\n### Quy trình liên quan:\n" + retrieved;
```

If 0 hits clear threshold → skip the retrieved section entirely (LLM works from core SOPs alone).

### 5.3 Reuse of Knowledge tab infrastructure

The existing Knowledge tab already has SQLite + embedding pipeline (per `electron/main.js:autoFixBetterSqlite3` + Knowledge IPC handlers). Pack install adds rows to the same DB tagged with `source = pack:<pack-id>`. CEO's own Knowledge uploads use `source = ceo-upload`. Both share retrieval.

---

## 6. Escalation System

### 6.1 Trigger sources

1. **Flow completion hook** returns `escalate: { topic, to }`.
2. **LLM autonomous decision** — bot uses a tool-call `escalate(topic, reason, snippet)` available in its tool registry.
3. **Explicit slash command** — customer or owner sends `/goisep <reason>`.
4. **Code-detected pattern** — output filter Layer K-equivalent for inbound: if customer message contains aggression / complaint keywords, force escalation regardless of LLM decision.

### 6.2 Routing

```
triggerEscalation({channel, customerId, topic, reason, snippet}) →
  1. write workspace/state/escalation-queue.jsonl entry
  2. write workspace/state/paused-topics.json:
       { "zalo:<id>": { topics: [topic], escalatedAt, escalationId, reason } }
  3. processEscalationQueue poller (every 30s) reads queue:
     for each entry:
       a. format card via chuyen-tiep/the-canh-bao.md template (Mustache)
       b. send to Telegram staff group:
            sendTelegramTo(tenant.chuyenTiep.telegramGroupId, card)
       c. send to Zalo staff group:
            sendZaloTo(tenant.chuyenTiep.zaloGroupId, card)
       d. mark entry processed (move to escalation-archive.jsonl)
       e. audit log entry "escalation_dispatched"
```

### 6.3 Paused-topics enforcement

`escalation-router.js` exposes `isTopicPaused(channel, customerId, message) → boolean`. Topic classification:

```js
function classifyTopic(message) {
  // 1. Try regex/keyword from pack's chuyen-tiep/topics.json
  for (const [topic, patterns] of Object.entries(topicsJson)) {
    if (patterns.some(p => new RegExp(p, "i").test(message.text))) return topic;
  }
  // 2. Fallback: cheap LLM classifier (single call, returns topic name)
  return await llmClassify(message.text, Object.keys(topicsJson));
}
```

`topics.json` example:

```json
{
  "bao-hanh":      ["bảo hành", "đảm bảo", "hỏng", "rớt răng sứ", "implant bị"],
  "khieu-nai":     ["khiếu nại", "tệ quá", "không hài lòng", "đòi tiền lại"],
  "thanh-toan":    ["thanh toán", "hóa đơn", "tính tiền sai", "thừa tiền"],
  "y-khoa":        ["đau quá", "sưng to", "chảy máu nhiều", "không thở được"],
  "dat-lich":      ["đặt lịch", "đổi lịch", "hủy lịch", "lịch hẹn"]
}
```

Dispatcher (§4.2 step 1):

```js
if (isTopicPaused(...)) {
  await reply("Em đã báo lễ tân hỗ trợ rồi ạ, anh/chị đợi chút em báo lại nhé.");
  return { handled: true };
}
```

### 6.4 Resume protocol

Staff sends in Zalo staff group OR Telegram staff group:

```
/tieptuc <customerName-or-id>
```

Bot looks up by name in `CUSTOMERS/` index or by ID directly, removes entry from `paused-topics.json`, audit-logs `escalation_resolved`. Bot resumes normal handling on next customer message.

Auto-resume fallback: if `escalatedAt` is older than 24 hours AND no `/tieptuc` received, bot auto-resumes but writes a `escalation_auto_resumed` audit entry and pings the Telegram staff group with "Khách hàng X đã hỏi lại sau 24h — em tiếp tục trả lời, mọi người xem có cần can thiệp không."

### 6.5 Staff group security

The Zalo staff group is a **separate** Zalo conversation that the bot is a member of (CEO's Zalo account is in it). Bot writes to it via `sendZaloTo(groupId)`. Bot does NOT respond to messages in the staff group EXCEPT for `/tieptuc` commands (handled by dispatcher just like any other slash command, but with an additional check: command is only registered if `message.threadId === tenant.chuyenTiep.zaloGroupId`).

---

## 7. Tenant Config and Install Wizard

### 7.1 Config shape

`workspace/config/tenant.json` after wizard completion:

```json
{
  "phongKham": {
    "ten": "Nha khoa An Bình",
    "diaChi": "123 Nguyễn Trãi, Q.1, TP.HCM",
    "googleMaps": "https://maps.app.goo.gl/...",
    "dienThoai": "0901234567",
    "hotline": "1900xxxx",
    "website": "https://anbinh-dental.vn"
  },
  "gioMoCua": {
    "thuHaiToSau": "08:00-20:00",
    "thuBay": "08:00-17:00",
    "chuNhat": "nghi",
    "ngayLeNghi": ["01-01", "30-04", "01-05", "02-09"]
  },
  "nhanSu": {
    "chuPhongKham": { "ten": "BS. Nguyễn Văn A", "telegram": "@anbsang" },
    "leTan": [{ "ten": "Chị Hương", "zalo": "0907..." }],
    "bacSi": [
      { "ten": "BS. Trần Thị B", "chuyenMon": ["chinh-nha", "tham-my"], "lichLam": "T2-T6 sáng" },
      { "ten": "BS. Lê Văn C", "chuyenMon": ["cay-ghep", "phau-thuat-mieng"], "lichLam": "T2-T7" }
    ]
  },
  "dichVu": [
    { "ma": "kham-tu-van", "ten": "Khám và tư vấn", "gia": "miễn phí" },
    { "ma": "cao-voi",     "ten": "Cạo vôi răng",   "gia": "200,000đ" },
    { "ma": "tay-trang",   "ten": "Tẩy trắng răng", "gia": "1,500,000đ" },
    { "ma": "tram-rang",   "ten": "Trám răng",      "gia": "300,000đ - 500,000đ" },
    { "ma": "boc-su",      "ten": "Bọc răng sứ",    "gia": "3,000,000đ - 12,000,000đ",
      "bienThe": [
        { "ten": "Cercon Zirconia", "gia": "4,500,000đ" },
        { "ten": "Lava Plus",       "gia": "8,000,000đ" }
      ]
    },
    { "ma": "cay-ghep", "ten": "Cấy ghép Implant", "gia": "18,000,000đ - 35,000,000đ",
      "bienThe": [
        { "ten": "Hàn Quốc Osstem",  "gia": "18,000,000đ" },
        { "ten": "Thụy Sĩ Straumann","gia": "35,000,000đ" }
      ]
    }
  ],
  "chuyenTiep": {
    "telegramGroupId": "-100xxxxx",
    "zaloGroupId":     "g.xxxx"
  },
  "kenhKhachHang": {
    "zalo": {
      "danhSachNhom": ["g.aaaa", "g.bbbb"],
      "danhSachDM":   ["0907123...", "0908456..."]
    }
  },
  "thanhToan": {
    "nganHang":  { "ten": "Vietcombank", "soTK": "0011234567", "chuTK": "NHA KHOA AN BINH" },
    "momoQR":    "qr-momo.png",
    "vietqrUrl": "https://img.vietqr.io/image/..."
  },
  "chinhSach": {
    "datCoc":        { "yeuCau": true, "soTienToiThieu": 500000 },
    "phiHuyMuon":    { "ap": true, "truocBaoNhieuGio": 24, "phiPhanTram": 50 },
    "nhacLichTruoc": { "soNgay": 1, "gio": "08:00" },
    "khuyenMaiOptIn": false
  },
  "tinhCach": {
    "phongCach":   "am-ap-chuyen-nghiep",
    "cachXungHo":  "anh-chi",
    "dungEmoji":   false
  }
}
```

### 7.2 Wizard steps

Dashboard → "Workflows" tab → "Cài nha khoa":

| Bước | Nội dung |
|---|---|
| 1 | Nhập mã kích hoạt → verify Ed25519 signature + hardware-bind |
| 2 | Thông tin phòng khám (tên, địa chỉ, SĐT, hotline, web, Google Maps URL) |
| 3 | Giờ mở cửa + ngày lễ |
| 4 | Nhân sự (chủ Telegram handle, lễ tân, bác sĩ + chuyên môn + lịch làm) |
| 5 | Danh sách dịch vụ + giá (table editor; import từ XLSX tùy chọn) |
| 6 | Kênh chuyển tiếp (Telegram group ID, Zalo staff group ID) + nút "Test gửi tin" |
| 7 | Kênh khách hàng (allowlist nhóm Zalo + DM khách bot được trả lời) |
| 8 | Thanh toán (TK ngân hàng, MoMo QR upload, VietQR URL) |
| 9 | Chính sách (cọc, phí hủy muộn, nhắc lịch trước, opt-in khuyến mãi) |
| 10 | Tính cách bot (phong cách, cách xưng hô, dùng emoji không) |
| 11 | Xem trước → Cài đặt |

Wizard form auto-generated from `cau-hinh.schema.json` (JSON Schema dialect with custom `x-vi-label` + `x-vi-hint` extensions for Vietnamese labels and help text).

### 7.3 Install action (last wizard step)

```
1. Write workspace/config/tenant.json
2. Mustache-render every file in pack matching *.md, *.json.tmpl:
     input = pack file
     vars  = tenant.json
     output = packs/nha-khoa-rendered/<same-relative-path>
3. Concatenate rendered tinh-cach/SOUL.md + IDENTITY.md + quy-trinh-chuan/_co-ban/*.md
     → write rendered AGENTS.md to workspace
4. Index quy-trinh-chuan/<specialty>/*.md + kien-thuc/*.md into Knowledge SQLite:
     source = "pack:nha-khoa"
     for each file: chunk → embed → INSERT
5. Register pack's lenh/* with global.__packDispatcher
6. Register pack's quy-trinh/* with global.__flowRuntime
7. Register pack's lich-tu-dong/* with cron scheduler (all default OFF)
8. Restart Zalo gateway (graceful — drain in-flight requests, max 60s)
9. Smoke test: send "/menu" to bot via IPC; expect response
10. Mark pack status = "active" in pack-registry.json
11. Show success page; offer "Bật cron nhắc lịch khám" toggle
```

---

## 8. Content Authoring (Mustache + JS Hooks)

### 8.1 Mustache examples

`lenh/menu.md`:

```markdown
Dạ chào anh/chị, đây là menu dịch vụ tại {{phongKham.ten}}:

{{#dichVu}}
• {{ten}} — {{gia}}
{{/dichVu}}

Để biết thêm chi tiết:
/bg <tên dịch vụ>  → báo giá
/lichkham          → đặt lịch
/lienhe            → liên hệ trực tiếp
```

`lenh/gio-mo-cua.md`:

```markdown
Dạ phòng khám {{phongKham.ten}} mở cửa:

- Thứ 2 đến Thứ 6: {{gioMoCua.thuHaiToSau}}
- Thứ 7: {{gioMoCua.thuBay}}
- Chủ nhật: {{#equal gioMoCua.chuNhat "nghi"}}nghỉ{{/equal}}{{^equal gioMoCua.chuNhat "nghi"}}{{gioMoCua.chuNhat}}{{/equal}}

Anh/chị cần đặt lịch khám, gõ /lichkham giúp em ạ.
```

(`{{#equal a b}}...{{/equal}}` is a custom Mustache helper registered by pack-loader.)

`quy-trinh/dat-lich.json`:

```json
{
  "id": "dat-lich",
  "ten": "Đặt lịch khám",
  "kichHoat": ["/lichkham", "intent:dat-lich"],
  "slots": [
    { "ten": "dichVu",    "hoi": "Dạ anh/chị muốn đặt dịch vụ gì ạ? (ví dụ: cạo vôi, bọc sứ, cấy ghép...)", "validate": "enum:dichVu.ma|dichVu.ten" },
    { "ten": "ngay",      "hoi": "Lịch hẹn ngày nào ạ?", "validate": "ngay-trong-tuong-lai" },
    { "ten": "buoi",      "hoi": "Anh/chị tiện sáng hay chiều ạ?", "validate": "enum:sang,chieu" },
    { "ten": "hoTen",     "hoi": "Cho em xin tên đầy đủ ạ.", "validate": "ho-ten-vi" },
    { "ten": "dienThoai", "hoi": "Số điện thoại của mình ạ?", "validate": "sdt-vn" }
  ],
  "hoanThanh": {
    "hook": "timSlot",
    "fallback": {
      "say": "Em ghi nhận yêu cầu rồi ạ. Lễ tân sẽ gọi xác nhận trong ít phút.",
      "escalate": { "topic": "dat-lich", "to": ["telegram", "zalo-staff"] }
    },
    "confirm": "Em thấy có slot {{proposed.gio}} ngày {{proposed.ngay}} với {{proposed.bacSi.ten}}. Anh/chị xác nhận giúp em ạ?"
  },
  "exits": {
    "huy":      "Dạ em hủy yêu cầu nhé ạ.",
    "escalate": "Để em báo lễ tân hỗ trợ ngay ạ."
  },
  "timeoutPhut": 30
}
```

### 8.2 JS hook contract

`ham-tuy-chinh/pack.js`:

```js
module.exports = {
  // Called when dat-lich flow finishes all slots
  // values = { dichVu, ngay, buoi, hoTen, dienThoai }
  // ctx = { tenant, lib: { dayjs, lodash } }
  // return { done, reply, confirm, escalate }
  async findSlot(values, ctx) {
    const today = ctx.lib.dayjs();
    // ... clinic's appointment-finding logic
    return {
      confirm: true,
      proposed: {
        gio: "10:30",
        ngay: values.ngay,
        bacSi: { ten: "BS. Trần Thị B" }
      }
    };
  },

  validateSdt(text) {
    const cleaned = text.replace(/\s+/g, "");
    if (!/^(0|\+84)\d{9,10}$/.test(cleaned)) return { ok: false, hint: "Số điện thoại không hợp lệ ạ. Mình cho em số 10-11 chữ số nhé." };
    return { ok: true, value: cleaned };
  }
};
```

Hook runs in `vm.createContext` with whitelist:

```js
const vm = require("vm");
const allowed = { dayjs: require("dayjs"), lodash: require("lodash"), zod: require("zod") };
const ctx = vm.createContext({ require: name => allowed[name] || (() => { throw new Error("module not whitelisted"); }) });
```

Hook timeout: 3 seconds per call (terminate + treat as null return).

---

## 9. V1 Commands and Flows

### 9.1 Commands (14)

| Command | File | Type | Description |
|---|---|---|---|
| `/menu` | `lenh/menu.md` | static | Full menu from `dichVu` list |
| `/dichvu` (alias `/sp`) | `lenh/dich-vu.md` | static | List services with short descriptions |
| `/bg <service>` | `lenh/bao-gia.md` | flow | Price quote (triggers `bao-gia` flow with prefilled `service`) |
| `/lichkham` | `lenh/lich-kham.md` | flow | Triggers `dat-lich` flow |
| `/doi` | `lenh/doi-lich.md` | flow | Triggers `doi-lich` flow |
| `/huy` | `lenh/huy-lich.md` | flow | Triggers `huy-lich` flow |
| `/giodb` | `lenh/gio-mo-cua.md` | static | Opening hours |
| `/diachi` | `lenh/dia-chi.md` | static | Address + Maps |
| `/lienhe` | `lenh/lien-he.md` | static | Phone + hotline + socials |
| `/baoche` | `lenh/bao-che.md` | static | Emergency / after-hours contact |
| `/khuyenmai` | `lenh/khuyen-mai.md` | static | Current promotions |
| `/baohanh` | `lenh/bao-hanh.md` | static | Warranty info |
| `/thanhtoan` | `lenh/thanh-toan.md` | static | Payment methods + QR |
| `/help` | `lenh/help.md` | static | Auto-generated help (lists all commands above) |

### 9.2 Flows (7)

1. **`dat-lich`** — service → date → time-of-day → name → phone → propose slot → confirm
2. **`doi-lich`** — appointment lookup → new date+time → confirm
3. **`huy-lich`** — appointment lookup → confirm → optional reason
4. **`bao-gia`** — service → variant (if applicable) → return price range + offer "muốn tư vấn cụ thể? để em báo BS gọi lại"
5. **`khai-thac-tien-su`** — triggered automatically after `dat-lich` completes for high-risk procedures (`cay-ghep`, `chinh-nha`, `phau-thuat-mieng`): medical history Q&A, allergies, current medications → save to `CUSTOMERS/<id>/tien-su.md`
6. **`hau-phau-checkin`** — cron-triggered DM N days post-procedure: "Hôm nay anh/chị thấy thế nào ạ?" → branching based on response (pain → escalate; fine → log and end)
7. **`nhac-lich`** — cron-triggered DM 1 day before appointment: confirm attendance → if "không đi được" → trigger `doi-lich` flow inline

### 9.3 Cron templates (3)

`lich-tu-dong/nhac-lich-kham.json`:

```json
{
  "id": "nhac-lich-kham",
  "ten": "Nhắc lịch khám 1 ngày trước",
  "cronExpr": "0 8 * * *",
  "macDinh": "off",
  "moTa": "Mỗi sáng 8h, bot DM tất cả khách có lịch khám ngày hôm sau để xác nhận hoặc đổi lịch.",
  "trigger": "flow:nhac-lich"
}
```

`lich-tu-dong/hau-phau-checkin.json`:

```json
{
  "id": "hau-phau-checkin",
  "ten": "Hậu phẫu checkin 2-7-30 ngày",
  "cronExpr": "0 18 * * *",
  "macDinh": "off",
  "moTa": "Mỗi tối 18h, bot DM khách đã làm thủ thuật cách đây 2, 7, 30 ngày để hỏi tình trạng.",
  "trigger": "flow:hau-phau-checkin"
}
```

`lich-tu-dong/gui-khuyen-mai.json`:

```json
{
  "id": "gui-khuyen-mai",
  "ten": "Gửi khuyến mãi hàng tuần",
  "cronExpr": "0 9 * * 1",
  "macDinh": "off",
  "moTa": "Thứ 2 hàng tuần 9h sáng, gửi khuyến mãi hiện tại cho khách đã opt-in.",
  "trigger": "broadcast:khuyen-mai",
  "requireOptIn": "chinhSach.khuyenMaiOptIn"
}
```

All defaults are off — CEO toggles per-cron in Dashboard. `requireOptIn` makes cron only fire for customers whose memory file has `optIn.khuyenMai = true`.

---

## 10. Distribution and Licensing

### 10.1 Repository

Private repo: `PeterBui85/9BizClaw-Packs-Private`.

```
9BizClaw-Packs-Private/
  nha-khoa/
    src/                    # authored content
    build.js                # zip + Ed25519 sign
    CHANGELOG.md
  phong-gym/                # next pack
    src/, build.js, CHANGELOG.md
  shared/
    keys/                   # Ed25519 private key (offline-only machine)
    licenses-issued.jsonl   # all keys issued, for audit
    revoked-keys.json       # mirrored to Gist
```

### 10.2 Release artifacts

Each pack version → GitHub Release tagged `<pack-id>-v<version>` (e.g., `nha-khoa-v1.0.0`):

```
nha-khoa-v1.0.0.zip
nha-khoa-v1.0.0.zip.sig
nha-khoa-v1.0.0.manifest.json   # standalone, for browsing
```

`.sig` is the Ed25519 signature of the zip's SHA-256, signed by the pack-platform private key. App ships the corresponding public key in source.

### 10.3 License key format

```
CLAW-PACK-NHA-KHOA-{base64url(payload || signature)}

payload = {
  pack: "nha-khoa",
  email: "anbinh-dental@gmail.com",
  issued: "2026-05-28",
  expires: "2027-05-28",
  machineId: "a1b2c3..."   // optional pre-binding
}
signature = Ed25519(payload, pack-platform private key)
```

Verified by `electron/lib/pack-license.js` (mirrors existing `electron/lib/license.js`). Hardware seal works the same: HMAC over `(key + storedMachineId + activatedAt + email)`, stored in `%APPDATA%/9bizclaw/pack-licenses/<pack-id>.json`.

### 10.4 Lifecycle

```
INSTALL:
  1. CEO enters key in Dashboard → verifyPackKey(key) → hardware-bind
  2. fetchLatestRelease("nha-khoa") using customer's provisioned GitHub token
  3. download nha-khoa-v1.0.0.zip + .sig
  4. verifyZipSignature(zip, sig, publicKey)
  5. extract to packs/nha-khoa-staging/
  6. run wizard
  7. on wizard submit: render → swap staging → packs/nha-khoa/
  8. index + register + restart gateway

UPDATE (daily cron at 03:00):
  for each pack with active license:
    latest = GET /repos/.../releases | filter tag prefix
    if latest.tag > installed.version AND license still valid:
      download + verify
      re-render against existing tenant.json
      atomic swap (rename packs/nha-khoa → packs/nha-khoa-prev,
                    rename packs/nha-khoa-new → packs/nha-khoa,
                    rm -rf packs/nha-khoa-prev)
      restart gateway
      sendCeoAlert("Pack nha-khoa đã cập nhật lên v1.0.1. Xem changelog: ...")
      audit "pack_updated"

DEACTIVATE (license revoked or expired):
  at every gateway boot, for each installed pack:
    if license invalid:
      mark pack status = "deactivated" in pack-registry.json
      replace all command handlers with deactivation message:
        "Tính năng này đã hết hiệu lực. Vui lòng liên hệ MODORO để gia hạn."
      stop flow runtime for that pack
      disable all crons for that pack
      KEEP tenant data (CUSTOMERS/, GROUPS/, history, knowledge entries)
      sendCeoAlert("Pack nha-khoa đã bị vô hiệu hóa. Lý do: ...")

UNINSTALL (CEO action):
  Dashboard → "Workflows" → pack row → "Gỡ pack" → confirm dialog:
    Q: Giữ dữ liệu khách hàng?  [Có / Không]
  if "Có":
    move packs/nha-khoa to packs/_archive/nha-khoa-vX.X.X-archived-YYYYMMDD/
  if "Không":
    rm packs/nha-khoa
    rm CUSTOMERS related to pack (CEO confirms again with sample list)
    DELETE FROM knowledge_db WHERE source = "pack:nha-khoa"
  unregister dispatcher / runtime / crons
  restart gateway
```

### 10.5 Revocation

Mirrors existing app license revocation: `~/.claw-license-revoked.jsonl` + GitHub Gist (`revoked-keys.json`). App checks Gist every 24h. Revoked pack license → next gateway boot deactivates the pack.

### 10.6 Free packs

Manifests can declare `banQuyen.loai = "mien-phi"`. The migrated default Zalo menu (from old `data/zalo-menu/catalog.json`) is a free pack — no license check, distributed from a public repo OR bundled in installer.

---

## 11. Channel Adapter

### 11.1 Interface

`electron/lib/channel-adapter.d.ts`:

```ts
export interface InboundMessage {
  channel: 'zalo' | 'telegram' | 'whatsapp';
  customerId: string;       // channel-scoped, e.g. "zalo:123", "wa:+84901..."
  threadId: string;         // DM or group identifier
  isGroup: boolean;
  fromOwner: boolean;       // CEO bypass for command-block
  rawBody: string;
  media?: { type: 'image' | 'video' | 'audio' | 'file'; url: string; mime: string; sha256: string };
  timestamp: number;
}

export interface OutboundReply {
  text?: string;
  media?: { localPath: string; caption?: string };
  buttons?: { label: string; value: string }[];   // channel-dependent
  meta?: Record<string, unknown>;
}

export interface ChannelAdapter {
  id: string;
  send(threadId: string, reply: OutboundReply): Promise<void>;
  pause(threadId: string, minutes: number): Promise<void>;
  resume(threadId: string): Promise<void>;
  isReady(): Promise<{ ready: boolean; error?: string }>;
}
```

### 11.2 V1 implementation

`electron/lib/adapters/zalo-adapter.ts` wraps existing `sendZaloTo`, `pauseChannel('zalo', ...)`, `probeZaloReady()`. No new wire-level code.

### 11.3 V1.5 extension

`electron/lib/adapters/whatsapp-adapter.ts` implements the same interface against WhatsApp Business Cloud API. Pack manifests declare `kenh: ["zalo", "whatsapp"]` to opt in. Adapter registers itself with channel-adapter registry at boot.

---

## 12. File-by-File Change Map

```
NEW:
  electron/lib/pack-loader.js              # discover, install, render, swap, uninstall
  electron/lib/pack-license.js             # Ed25519 verify + hardware seal
  electron/lib/pack-registry.js            # in-memory map: pack-id → active dispatcher entries
  electron/lib/flow-runtime.js             # slot-filling state machine
  electron/lib/slot-extractor.js           # LLM-backed slot value extraction
  electron/lib/sop-loader.js               # core preload + RAG retrieval against Knowledge SQLite
  electron/lib/escalation-router.js        # queue, paused-topics, topic classifier
  electron/lib/channel-adapter.ts          # interface definition (.d.ts)
  electron/lib/adapters/zalo-adapter.ts    # wraps existing sendZaloTo / pauseZalo / probe
  electron/lib/dispatcher.js               # whole-line slash + flow trigger router
  electron/ui/workflows-tab.html           # Dashboard "Workflows" tab markup
  electron/ui/workflows-wizard.html        # 11-step install wizard
  electron/scripts/pack-build.js           # author tool (used in pack repo, not shipped to end-user)

MODIFY:
  electron/packages/modoro-zalo/src/inbound.ts
    + inject `9BizClaw PACK-DISPATCHER PATCH v1` marker between msg-length-gate and vision-safety
    + calls global.__packDispatcher.handle(message); if handled, return

  electron/main.js
    + boot: pack-registry.loadAll() after openclaw boot, before startCronJobs
    + IPC handlers:
        pack:list                    → enumerate installed packs + status
        pack:install-from-key (key)  → activate + download + extract
        pack:wizard-submit (config)  → render + index + register
        pack:uninstall (id, keepData) → archive / delete
        pack:update-check            → manual trigger of daily cron
        pack:test (id, command-or-flow) → CEO-only smoke test in test mode
    + register pack crons via existing cron scheduler
    + flow state directory: workspace/state/flows/, sweeper every 5 min

  electron/preload.js
    + add window.claw.packs bridge for the 6 IPC handlers above

  electron/ui/dashboard.html
    + add "Workflows" sidebar nav item
    + hide existing #zalo-menu-pane (kept as deprecated for 1 release, then removed)

  data/zalo-menu/catalog.json
    + on first boot after upgrade: pack-loader migrates this into packs/_menu-default/
      as a free pack with one /menu command. Source file then deprecated.

NEW external (private repo PeterBui85/9BizClaw-Packs-Private):
  nha-khoa/src/                            # full pack content as defined in §3
  nha-khoa/build.js                        # zip + sign
  shared/keys/                             # Ed25519 key generation (offline machine only)
```

---

## 13. Acceptance Criteria (Dental v1)

1. Clinic owner completes wizard install in under 10 minutes end-to-end on a fresh MODOROClaw install.
2. All 14 commands respond with tenant-customized content (verified by sending each one in test Zalo DM).
3. All 7 flows complete a happy path end-to-end in test Zalo conversation.
4. Escalation: triggering `/goisep` or autonomous escalate causes a card to land in both the Telegram staff group and the Zalo staff group within 30 seconds.
5. Paused-topic enforcement: after escalation, customer pushing the same topic gets the stand-by line; pushing a different topic gets normal flow handling.
6. Daily reminder cron, when enabled, fires at the configured time and delivers reminders to all customers with appointments the next day.
7. License revocation: revoking the key causes the pack to deactivate within the next gateway boot (or 24h, whichever comes first); tenant data is preserved.
8. Pack update: bumping the pack to v1.0.1 with a CHANGELOG entry → daily check picks it up → re-renders → atomic swap → CEO receives Telegram notification.
9. Free menu fallback: even without a dental pack license, the migrated default menu pack still serves `/menu` from the old `catalog.json` data.
10. RAG: at least 30% of LLM replies in a 20-turn test conversation include content traceable to a `quy-trinh-chuan/` file (verified via log inspection of the retrieved-SOPs section).
11. CEO test mode: `/test dat-lich` from the CEO's Zalo runs the flow in a sandboxed conversation that does not write to real CUSTOMERS/ files.

---

## 14. Open Questions and Deferrals

| # | Question | Provisional answer | Resolution |
|---|---|---|---|
| 1 | Slot extractor LLM choice (existing 9router agent vs dedicated cheap call) | Cheap-first via 9router default model; fall back to main agent on extractor confidence < 0.6 | Deferred to implementation plan |
| 2 | Vector index location | Reuse Knowledge SQLite with `source` tag | Confirmed in spec |
| 3 | Tenant content overrides | Not in v1; v1.1 adds `packs/<id>-overrides/` directory | Deferred to v1.1 |
| 4 | Command-name collisions across multiple installed packs | V1 is single-pack-only; v2 adds explicit priority + namespacing (e.g. `/nha-khoa:menu`) | Deferred to v2 |
| 5 | Tenant config schema versioning | Add `schemaMigrations` map to manifest; pack-loader runs migrations on update | Deferred to first real update |
| 6 | Pack signing key rotation | Ship a bundle of accepted public keys; rotate by adding new key + dual-sign for one cycle | Deferred until breach scenario |
| 7 | Zalo staff group resume protocol | V1 ships `/tieptuc <name-or-id>` only; v1.1 adds natural-language understanding ("ok cho khách Hùng tiếp tục") | Deferred to v1.1 |
| 8 | What if pack.js hook hangs (infinite loop, slow network) | VM timeout 3 seconds → terminate → treat as null return → fallback path | Confirmed in spec |
| 9 | Multi-language packs | V1 Vietnamese only; `ngon-ngu/` folder structure supports `en.json`, `id.json` etc. when needed | Deferred indefinitely |
| 10 | Pack hot-reload (no gateway restart) | V1 always restarts gateway on install/update; v1.5 may add hot-reload for content-only changes | Deferred to v1.5 |

---

## 15. Migration from Earlier Zalo Menu Spec

The earlier spec at `docs/superpowers/specs/2026-05-27-zalo-menu-ui-brainstorm-design.md` defined the slash-command dispatcher as a standalone Zalo Menu feature. This spec **supersedes and absorbs** it:

- The dispatcher is no longer Zalo-menu-specific; it is pack infrastructure usable by any pack.
- The earlier `data/zalo-menu/catalog.json` v2 schema is replaced by pack-level definitions (`lenh/*.md` files + manifest).
- On first boot after the pack platform ships, a migration step converts `catalog.json` items into a free `_menu-default` pack so the menu keeps working without the dental pack.
- The Dashboard "Zalo Menu" pane is replaced by the "Workflows" tab.

The dental pack is the first concrete consumer of the dispatcher + flow runtime + SOP loader; gym pack will be the second.

---

## Appendix A — Vietnamese Glossary for Internal Terms

| English internal term | Vietnamese surface term (when CEO sees it) |
|---|---|
| Workflow pack | Bộ quy trình |
| Slash command | Lệnh tắt |
| Flow / slot-filling | Quy trình hội thoại |
| SOP | Quy trình chuẩn |
| Escalation | Chuyển tiếp lễ tân |
| Tenant config | Cấu hình phòng khám |
| Dispatcher | Bộ điều phối lệnh |
| Manifest | Mô tả gói |
| License key | Mã kích hoạt |
| Cron | Lịch tự động |
| Knowledge / RAG | Kho kiến thức |
| Channel adapter | Cổng kênh |
| Customer Zalo group | Nhóm Zalo khách |
| Staff Zalo group | Nhóm Zalo nội bộ |

---

## Appendix B — Pack Author Workflow

For MODORO Tech building a new pack:

1. `git clone PeterBui85/9BizClaw-Packs-Private`
2. `cp -R nha-khoa phong-gym` → rename, edit manifest
3. Author content in `src/` (markdown, JSON, optional `pack.js`)
4. `node build.js` → produces `phong-gym-v1.0.0.zip` + `.sig`
5. Test locally: copy zip to a dev MODOROClaw install, install via dev-only `Workflows → Install from zip` button
6. Iterate
7. When ready: `git push`, draft GitHub Release tagged `phong-gym-v1.0.0`, upload artifacts
8. Issue licenses via `node license-manager.js --issue-pack phong-gym customer@example.com`
9. Customer enters key in their Dashboard → pack downloads + installs

---
