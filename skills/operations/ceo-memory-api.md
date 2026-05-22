---
name: ceo-memory-api
description: Bot memory API — lưu/tìm/xóa ký ức qua Cron API port 20200
metadata:
  version: 1.0.0
---

# Bộ nhớ bot (CEO Memory)

Bot có thể lưu và truy xuất ký ức qua Cron API. Xác thực: phiên Telegram CEO tự gắn header nội bộ — KHÔNG đọc `cron-api-token.txt`, KHÔNG tự thêm `token=<token>`.

## Khi nào dùng — TỰ ĐỘNG, không đợi CEO bảo

Bot gọi `/api/memory/write` NGAY TRONG CÙNG TURN khi:
- **Hoàn thành task:** báo giá, tạo file, gửi nhóm, trả lời khách → `type: "task"`, content: `[ngày] mô tả ngắn`
- **CEO sửa lỗi:** "không phải vậy", "sai rồi" → `type: "correction"`
- **CEO dặn quy tắc:** "từ giờ...", "luôn...", "đừng..." → `type: "rule"`
- **Việc pending:** "mai gửi lại", "chờ khách confirm" → `type: "task"`, content: `[PENDING] mô tả`
- **CEO yêu cầu nhớ:** "ghi nhớ", "nhớ giùm" → type phù hợp
- **Phát hiện pattern khách:** nhiều khách hỏi cùng câu → `type: "pattern"`

KHÔNG IM LẶNG khi vừa làm xong việc. CEO có thể đi ngay sau khi nhắn — bot phải ghi trước khi session hết.

## Lưu ký ức

`POST http://127.0.0.1:20200/api/memory/write`
Body: `{"type":"rule","content":"Khách hỏi bảo hành → 12 tháng"}`
Type: `rule` | `pattern` | `preference` | `fact` | `correction`

## Tìm ký ức

`POST http://127.0.0.1:20200/api/memory/search`
Body: `{"query":"bảo hành","limit":5}`

## Xóa ký ức

`POST http://127.0.0.1:20200/api/memory/delete`
Body: `{"id":"mem_..."}`

## Lưu ý

- Ghi memory TRONG CÙNG TURN reply — không đợi turn sau, không đợi idle
- Content ngắn gọn, tiếng Việt có dấu, dưới 200 ký tự
- Hệ thống nudge vẫn chạy backup (5 phút idle) — nhưng bot nên ghi trước, nudge chỉ bổ sung
- CEO nói "ghi nhớ/nhớ giùm" → xác nhận: "Em đã ghi nhớ." Quan sát tự động (xem dưới) → THAO TÁC IM, KHÔNG nhắc CEO.

## QUAN SÁT CEO — Tự động học từ hội thoại

**LUẬT: Mỗi khi CEO dạy bot điều gì — dù nói thẳng hay gián tiếp — GHI NGAY trong cùng turn. KHÔNG đợi CEO bảo "ghi nhớ". Việc dạy LÀ trigger.**

### Tín hiệu cần quan sát

| Tín hiệu | Loại memory | Ví dụ |
|---|---|---|
| CEO duyệt/từ chối đề xuất | `preference` | "CEO thích báo cáo dạng bullet ngắn, không thích paragraph dài" |
| CEO sửa gián tiếp (diễn đạt lại, làm khác) | `correction` | "Khi gửi báo giá, CEO muốn kèm deadline chuyển khoản, không chỉ giá" |
| CEO tiết lộ ưu tiên kinh doanh | `fact` | "CEO đang tập trung mở rộng kênh Zalo tháng 5/2026" |
| CEO nhắc khách hàng với cảm xúc/khẩn cấp | `fact` | "Khách Minh Tú là VIP — CEO luôn hỏi thăm trước" |
| CEO lặp lại hướng dẫn nhiều lần | `rule` | "CEO luôn muốn confirm trước khi gửi nhóm >50 người" |
| Nhịp làm việc CEO | `preference` | "CEO thường nhắn lệnh buổi sáng 7-8h, review kết quả 17-18h" |
| Phong cách giao tiếp CEO thích | `preference` | "CEO muốn report ngắn 3-5 dòng, không narrative" |
| CEO dạy kiến thức doanh nghiệp | `fact` | "Bảo hành chính hãng 12 tháng, mở rộng thêm 6 tháng cho VIP" |

### Ví dụ "CEO dạy" — GHI NGAY

- "Đừng gửi nhóm sau 9h tối" → `rule` NGAY
- "Bảo hành 12 tháng, VIP thêm 6 tháng" → `fact` NGAY
- CEO diễn đạt lại report ngắn hơn → `preference` NGAY (CEO muốn report ngắn hơn)
- "Khách Minh Tú là đối tác chiến lược" → `fact` NGAY
- CEO từ chối style reply → `correction` NGAY

### Khi nào KHÔNG ghi

- "ok", "được", "gửi đi" — đây là LỆNH, không phải tín hiệu học
- "Gửi nhóm ABC cái này" — task một lần, không phải pattern
- Thông tin đã có trong memory (search trước khi ghi)

### Quy tắc chất lượng

- Memory phải là **insight**, không phải log: "CEO thích format ngắn" ✓ — "CEO nhắn lúc 8h" ✗
- Tiếng Việt có dấu đầy đủ, dưới 200 ký tự
- **Search memory TRƯỚC khi ghi** — nếu đã có entry tương tự, KHÔNG tạo mới
- Ghi THAO TÁC IM — KHÔNG BAO GIỜ nói "em vừa ghi nhớ rằng anh thích..."
- Ghi trong CÙNG TURN — không đợi turn sau

### Phân loại type

- Hành động được (ảnh hưởng hành vi tương lai) → `rule` hoặc `preference`
- Bối cảnh hiểu biết → `fact`
- CEO sửa lỗi bot → `correction`
