# Nha Khoa Pack Content — Stub Spec

**Status:** STUB — full design pending. Spec defers detailed design until Pack Platform v0 ships, because all dental content rides on the platform's pack contract.

**Created:** 2026-05-28
**Depends on:**
- [`2026-05-28-pack-platform-v0-design.md`](2026-05-28-pack-platform-v0-design.md) — pack contract, dispatcher, flows, SOP RAG, channel adapter
- [`2026-05-28-pack-license-and-update-design.md`](2026-05-28-pack-license-and-update-design.md) — paid pack activation + daily updates

**Sequenced as:** spec #3 of 3 in the Nha Khoa workflow pack decomposition (see [umbrella](2026-05-28-nha-khoa-workflow-pack-design.md))

## Scope

A concrete pack that implements dental-clinic customer-service workflows on top of the Pack Platform. Sold as a paid add-on. Vietnamese-first content. Single pack `id: "nha-khoa"` shipped with one manifest, one render pipeline, one license. The umbrella spec's sections 1, 7, 8, 9 hold the source-of-truth content snapshot that will be re-specced in detail here when its turn comes.

### Content surface

**Slash commands (target: 14):**
- `/menu` — bắt đầu chính
- `/datlich` — đặt lịch khám
- `/doilich` — đổi lịch
- `/huy` — huỷ lịch
- `/dichvu` — bảng giá dịch vụ + mô tả ngắn
- `/khuyenmai` — chương trình hiện hành
- `/diachi` — chi nhánh + bản đồ
- `/giochay` — giờ làm việc + giờ trống hôm nay/tuần
- `/nhasi` — danh sách bác sĩ + chuyên môn
- `/baohanh` — chính sách bảo hành phục hình
- `/hoso` — kiểm tra lịch sử của khách (yêu cầu SĐT)
- `/hoidap` — FAQ phân theo chuyên môn
- `/dangkitukien` — đăng ký nhận tư vấn từ chuyên gia
- `/lienhe` — gọi nhanh / Zalo nhanh / chỉ đường

Each command is a `.json` slot definition + optional `.md` template + optional `pack.js` hook entry (full schema in Platform v0 §3, §4.4–§4.5).

**Flows (target: 7):**
1. `dat-lich-moi` — slot fill: tên + SĐT + chi nhánh + dịch vụ + bác sĩ (optional) + thời gian + ghi chú
2. `doi-lich` — lookup hồ sơ → chọn lịch cần đổi → slot fill thời gian mới
3. `huy-lich` — lookup → xác nhận → ghi log → notify clinic
4. `khao-sat-truoc-kham` — pre-visit triage (5 câu): mức độ đau, vị trí, đã uống thuốc gì, dị ứng, lần khám gần nhất
5. `tu-van-niengrang` — multi-turn: tuổi → tình trạng → ngân sách → kiểu mong muốn → đề xuất gói
6. `tu-van-implant` — tương tự niềng nhưng decision tree khác
7. `dang-ki-bao-hanh` — sau phục hình: chụp ảnh + ngày làm + bác sĩ → ghi hồ sơ bảo hành

Each flow has slot validators (using zod from the platform's whitelist), one-line confirmation step, completion hook that writes to `memory/zalo-users/<id>.md` and the clinic's appointment ledger.

**Cron jobs (target: 3):**
- `nhac-lich-truoc-1-ngay` — daily 09:00, scan appointments for tomorrow, send Zalo reminder per customer with `/doilich`, `/huy` shortcuts
- `nhac-lich-2-gio-truoc` — every 30 min, scan appointments where `startAt - now ∈ [2h, 2.5h]`
- `chao-buoi-sang-staff` — daily 07:30, send to clinic staff group: today's appointment list grouped by chair/doctor

All crons reuse `electron/lib/cron.js` API; no new schedulers. Pack declares them in `lich-tu-dong/*.json`.

**Persona (`tinh-cach/personality.md`):**
- Xưng "em" gọi khách "anh/chị" theo default
- Giọng ấm áp, không quá vui, tôn trọng nỗi đau răng
- Mặc định KHÔNG dùng emoji (theo CLAUDE.md HARD rule cho UI/chat)
- **Optional override:** `tinhCach.dungEmoji: true` trong wizard nếu chủ phòng khám muốn dùng emoji nhẹ trong marketing post Zalo broadcast (NOT customer chat). Toggle áp dụng cho FB/Zalo post composer, không phải agent chat.
- Câu mở đầu mẫu: "Em chào anh/chị, mình cần Phòng khám hỗ trợ gì ạ?"

**SOPs (target: 8 specialties × 1 core file = 8 files in `quy-trinh-chuan/_co-ban/`, plus deeper RAG-only files in `quy-trinh-chuan/`):**
- `nieng-rang.md`, `implant.md`, `tay-trang.md`, `boc-rang-su.md`, `nho-rang-khon.md`, `tre-em.md`, `nha-chu.md`, `noi-nha.md`
- Each core file ≤ 15KB (platform §5.1 hard limit)
- Deeper detail (price ranges, full procedure walkthroughs, contraindications) lives in non-`_co-ban/` files and reaches the agent via RAG topK=4 retrieval per Platform v0 §5

**Forced escalation patterns (`chuyen-tiep/forced-patterns.json`):**
- Pain words: "đau quá", "nhức nhối", "không chịu nổi", "đau dữ"
- Emergency: "chảy máu nhiều", "sưng to", "không ăn được", "sốt"
- Aggressive: explicit profanity list, threats of complaint, "lừa đảo"
- Legal/refund: "trả tiền lại", "kiện", "luật sư"
- These trigger dispatcher step 1.5 forced-escalation per Platform v0 §6.1

### Wizard install pages

Pack declares `wizard.pages[]` in manifest. v0 dental needs 3 pages:
1. **Thông tin phòng khám:** tên, số CN, địa chỉ từng CN, giờ làm việc per CN, SĐT hotline
2. **Danh sách bác sĩ + chuyên môn:** dynamic table (add/remove rows), each row = tên + chuyên môn (multi-select 8 specialties) + lịch trực (optional)
3. **Cài đặt giao tiếp:** xưng hô default, `dungEmoji` toggle (default false), `chuyenTiep.zaloGroupId`, `chuyenTiep.telegramGroupId`, default `flow.timeoutPhut: 30`

Pages render Mustache-bindable form fields; submit writes to `tenant-config.json`.

### Mustache extractor usage (per Platform v0 §4.5)

Examples used in dental commands:
- `{{customer.ten}}` — sender's name from `memory/zalo-users/<id>.md` front-matter
- `{{config.tenPhongKham}}` — tenant config
- `{{config.danhSachChiNhanh:enum:config:chiNhanhs:ten}}` — slot extractor pulling enum values from config array's `ten` field for branch selection
- `{{config.danhSachBacSi:enum:config:bacSis:ten}}` — same for doctor list
- `{{enum:literal:nhẹ,vừa,nặng,cấp cứu}}` — pain level enum

### Persona-specific code-block injection

Dental persona injects into the gateway agent's system prompt (via Platform v0 SOP loader hook):
- Core context: "Em là trợ lý của Phòng khám {{config.tenPhongKham}}..."
- Triage rule: "Nếu khách mô tả đau cấp tính (mức 'nặng' hoặc 'cấp cứu'), em không cố trấn an dài, em chuyển ngay anh chị staff..."
- No-diagnosis rule: "Em không bao giờ chẩn đoán bệnh qua chat. Em mô tả khả năng + đề nghị đặt lịch."

## Out of scope (for this spec)

- Insurance/BHYT integration
- E-prescription
- Phone-call integration
- POS/billing system sync
- Multi-clinic franchise mode (multi-tenant within one install)
- Patient records EHR-grade storage (this pack stores only contact + appointment history)
- Voice messages from Zalo customers (text-only v0)
- Image upload triage ("gửi ảnh răng để em xem giúp") — defer to v1 per CLAUDE.md vision-safety constraints
- Web booking widget (Zalo + Telegram only in v0)

## CLAUDE.md compliance (dental-specific reminders)

- Vietnamese with proper diacritics in ALL content files, NEVER `\uXXXX` escapes
- No emoji in customer chat (per persona default); emoji only allowed if `tinhCach.dungEmoji: true` AND context is marketing broadcast composer (NOT agent reply)
- No second Telegram poller — alerts to clinic staff group go through existing `sendTelegram()` via gateway
- All tenant config writes go through `writeOpenClawConfigIfChanged` if they touch `openclaw.json`; pack-specific config lives in `%APPDATA%/9bizclaw/packs/nha-khoa/tenant-config.json` and never touches `openclaw.json`
- Wizard install flow uses Platform v0 §7.3 install action; never PowerShell

## Acceptance criteria (preview — to be expanded in full spec)

- All 14 commands respond within 3 seconds of Zalo message
- Booking flow completes in ≤ 6 turns for first-time customer
- Returning customer (`/hoso` lookup matches SĐT) auto-fills name + branch
- Reminder cron at 09:00 sends to 100% of next-day appointments with delivery confirmation logged
- Pain trigger words from forced-patterns.json escalate to staff within 1 dispatcher cycle (≤ 500ms)
- SOP retrieval pulls topK=4 dental-tagged docs only (RAG filter `source` starts with `pack:nha-khoa:`)
- Wizard install completes in ≤ 5 minutes for a 2-branch, 4-doctor clinic
- License revocation disables pack within 24h (inherited from license spec)
- Auto-update at 03:00 swaps content without dropping any in-progress flows (state persists per Platform v0 §4.4)
- No emoji appears in any customer-facing chat reply unless `dungEmoji: true` AND message routes through broadcast composer

## Design pending

Full spec deferred until Pack Platform v0 ships AND License + Auto-Update is at least at full-spec state. The umbrella spec's sections 1, 7, 8, 9 are preserved as the brainstorm-source-of-truth content snapshot that will be re-specced in detail here when its turn comes.

## Open questions for full spec

1. Slot validators per command — exact zod schemas for SĐT (10 digits Vietnamese formats), date/time (relative parsing "thứ 5 tuần sau"), service codes
2. Appointment ledger storage shape — JSON in `%APPDATA%/9bizclaw/packs/nha-khoa/appointments.jsonl`, or SQLite table extending the existing Knowledge DB?
3. How to handle multi-branch routing when a customer doesn't specify which branch — geolocation guess, ask explicitly, or use customer history?
4. Doctor preference persistence — across visits? Per service type?
5. Dental persona override at wizard time (clinic with younger demographic wants slightly different voice) — single toggle vs full persona swap?
6. Bilingual support (Vietnamese + Anglo names, e.g., "Dr. Smith") — pack-level setting or auto-detect?
7. /dangkitukien output destination — into staff group? Into a separate Google Sheet/Form? CEO Telegram?
8. Cron `chao-buoi-sang-staff` content — full appointment list or summary stats + link to dashboard?
