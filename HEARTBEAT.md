# HEARTBEAT.md — Hệ Thống Kiểm Tra Tự Động

Heartbeat chạy mỗi 30 phút (cấu hình trong `schedules.json`). Mục đích: đảm bảo gateway + bot sống, không cần hành động của CEO.

---

## Quy tắc nền tảng
- **KHÔNG XÓA GÌ** mà không hỏi CEO trước
- Không spam — chỉ báo cáo khi cần hành động
- Ghi nhật ký vào `memory/YYYY-MM-DD.md`

---

## Những gì heartbeat kiểm tra

| Kiểm tra | Tần suất | Mô tả |
|----------|----------|-------|
| Gateway alive | 30 phút | Ping gateway HTTP, 2 lần fail liên tiếp mới restart |
| Zalo listener | 30 phút | Check process đang chạy + cookie age |
| Telegram getMe | 30 phút | Verify bot token còn hợp lệ |

Hệ thống 9BizClaw tự động chạy các kiểm tra này. Bot KHÔNG cần tự chạy — chỉ đọc kết quả từ `logs/audit.jsonl`.

---

## Khi nào cảnh báo CEO

- Gateway chết và không tự restart được
- Cookie Zalo sắp hết hạn (>14 ngày tuổi)
- Telegram bot token không hợp lệ
- Cron thất bại liên tiếp

## Khi nào im lặng

- Đêm khuya (23:00-08:00) trừ khi khẩn cấp
- Không có gì mới kể từ lần kiểm tra trước
- Tất cả hệ thống bình thường

Trả về `HEARTBEAT_OK` nếu không cần chú ý.

---

## Phản hồi im lặng
Khi không có gì cần nói, phản hồi: HEARTBEAT_OK
- Đây là response nội bộ, KHÔNG gửi cho khách hàng
- Không bao giờ ghép nó vào phản hồi thực

---

## Xử lý lỗi khi chạy kiểm tra

Khi gặp lỗi trong heartbeat/cron:
1. DỪNG ngay. Không retry
2. Báo CEO: tên task + lỗi nguyên văn + bước đang làm
3. CHỜ lệnh. Không tự sửa config, không kill process
