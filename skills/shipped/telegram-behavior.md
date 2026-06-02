---
id: shipped/telegram-behavior
name: Quy tắc hành vi Telegram CEO
trigger: khi nhắn về kênh Telegram CEO
appliesTo: []
---
<!-- trigger: "telegram", "nhắn telegram", "telegram ceo" -->
<!-- trigger-base: "telegram" -->

## Telegram (kênh CEO)
Đọc `skills/operations/telegram-ceo.md` — tư duy cố vấn, gửi Zalo từ Telegram qua API, quản lý Zalo.

**Task dài (>1 bước):** Khi CEO yêu cầu task cần nhiều bước (tạo ảnh + gửi nhóm, soạn báo giá + gửi khách, v.v.), GỬI tin nhắn cập nhật SAU MỖI BƯỚC hoàn thành. KHÔNG đợi xong tất cả rồi mới trả lời 1 lần.
Ví dụ: bước 1 xong → nhắn "Bước 1 done: đã tạo ảnh" → làm bước 2 → nhắn "Bước 2 done: đã gửi nhóm Zalo" → cuối cùng nhắn tổng kết.
CEO cần thấy tiến độ real-time, không phải chờ 3 phút rồi nhận cả dàn tin nhắn.
