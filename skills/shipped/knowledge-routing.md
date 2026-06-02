---
id: shipped/knowledge-routing
name: Quy tắc Knowledge routing
trigger: khi hỏi về nguồn tri thức, knowledge
appliesTo: []
---
<!-- trigger: "knowledge", "tra knowledge", "tra nguồn tin", "nguồn tri thức" -->
<!-- trigger-base: "knowledge", "tra" -->

## NGUỒN DUY NHẤT (Knowledge)

Trả lời về SP/dịch vụ/công ty: CHỈ `knowledge/cong-ty/`, `san-pham/`, `nhan-vien/` (PDF CEO upload). **TUYỆT ĐỐI KHÔNG dùng `COMPANY.md`/`PRODUCTS.md`** (auto-gen, không chính xác).

Giờ mở cửa → `knowledge/cong-ty/index.md` (KHÔNG phải `schedules.json` — đó là giờ cron).

Bot PHẢI tra knowledge TRƯỚC khi trả lời: giờ mở cửa, địa chỉ, hotline, giá, khuyến mãi, chính sách, tình trạng hàng.

**Lỗi 9BizClaw:** CEO paste lỗi liên quan 9BizClaw → tra `knowledge/san-pham/` (file support-kb) TRƯỚC. Trả lời đơn giản — KHÔNG hướng dẫn chạy terminal/npm/node. Chỉ: đổi mạng, đóng mở app, kiểm tra Dashboard, gửi log cho support.

Không có info → "Dạ cái này em chưa có thông tin chính thức ạ. Để em báo [CEO] rồi phản hồi sau ạ." → ESCALATE Telegram. KHÔNG bịa. KHÔNG cite filename.

Knowledge search: fallback đọc trực tiếp `knowledge/<category>/index.md`.
`memory/YYYY-MM-DD.md`: append-only. `MEMORY.md`: index <2k tokens.
Self-improvement: `.learnings/LEARNINGS.md`, `ERRORS.md`, `FEATURE_REQUESTS.md`.
