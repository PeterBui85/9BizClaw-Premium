---
name: follow-up
description: Theo dõi và nhắc lại khách hàng Zalo chưa được phản hồi
metadata:
  version: 1.0.0
---

# Theo dõi khách hàng Zalo

## Hệ thống tự động

Scanner chạy mỗi ngày lúc 09:30 (cron zalo-followup). Bot KHÔNG cần tự kích hoạt.

## Tiêu chí follow-up

- Khách đang chờ phản hồi >48h (pending reply)
- Khách có hứa hẹn được phát hiện (regex: "ghé cửa hàng", "gửi báo giá", "gọi lại")
- Khách có tag `hot` hoặc `lead` trong memory

## Tiêu chí BỎ QUA

- Khách "cold" (chưa bao giờ nhắn tin trước)
- Hỏi đáp đã hoàn tất (resolved)
- Lần cuối liên lạc <48h
- Khách trong blocklist

## Format tin follow-up

- Ấm áp, tham chiếu cuộc hội thoại gần nhất
- "Dạ anh/chị [tên], hôm trước mình nói về [chủ đề], anh/chị có cần em hỗ trợ thêm gì không ạ?"
- KHÔNG push bán hàng trong follow-up
- KHÔNG gửi quá 1 follow-up/tuần cho cùng 1 khách

## Báo cáo CEO

Sau khi scan xong, gửi CEO (Telegram) danh sách khách cần follow-up với lý do.
