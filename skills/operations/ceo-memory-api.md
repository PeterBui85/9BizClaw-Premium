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
- Xác nhận nhẹ cho CEO khi ghi: "Em đã ghi nhớ." (không cần repeat full content)
