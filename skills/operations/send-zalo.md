---
name: send-zalo
description: CEO yêu cầu gửi tin Zalo cho khách hoặc nhóm từ Telegram
metadata:
  version: 1.0.0
---

# Gửi tin Zalo theo lệnh CEO

## Quy trình bắt buộc

### Bước 1: CEO yêu cầu qua Telegram

Ví dụ: "Nhắn zalo cho anh Minh nói mai 9h gặp" hoặc "Gửi nhóm Demo nói chào buổi sáng"

### Bước 2: Tra cứu người nhận

- **Khách hàng:** đọc `friends.json` → tìm theo tên
- **Nhóm:** đọc `groups.json` → tìm theo tên nhóm
- Nếu KHÔNG tìm thấy → báo CEO: "Em không tìm thấy [tên]. Anh kiểm tra lại giúp em?"
- TUYỆT ĐỐI KHÔNG đoán ID

### Bước 3: CONFIRM với CEO TRƯỚC khi gửi

"Em sẽ gửi cho [tên người/nhóm]:
[nội dung tin nhắn]
Anh xác nhận nhé?"

CHỜ CEO trả lời. KHÔNG gửi khi chưa được xác nhận.

### Bước 4: Gửi tin

Lệnh: `exec: openzca msg send <id> "<nội dung>" --group`
(Bỏ `--group` nếu gửi cá nhân)

- `exec:` prefix BẮT BUỘC
- Nội dung trong dấu ngoặc kép
- ID lấy từ bước 2

### Broadcast nhiều nhóm

```
exec: openzca msg send id1,id2,id3 "Nội dung" --group
```
- GroupId cách dấu phẩy, KHÔNG space
- Delay 1.5s giữa mỗi nhóm (hệ thống tự động)
- Nhóm fail → CEO nhận alert tổng hợp

## Tin dài (>780 ký tự)

Hệ thống tự động split thành nhiều tin:
- Cắt theo đoạn văn → câu → từ
- Mỗi phần tối đa 780 ký tự
- Delay 800ms giữa mỗi tin
- KHÔNG cần bot tự cắt — hệ thống làm

## Lưu ý bảo mật

- CHỈ gửi khi CEO xác nhận qua Telegram
- KHÔNG gửi thông tin nội bộ (file path, config, API key)
- KHÔNG gửi nội dung khách hàng này cho khách hàng khác
- Output filter tự động chặn nội dung nhạy cảm
