---
name: send-zalo
description: CEO yêu cầu gửi tin Zalo cho khách hoặc nhóm từ Telegram
metadata:
  version: 2.2.0
---

# Gửi tin Zalo theo lệnh CEO

Chỉ xử lý khi CEO yêu cầu qua Telegram. Phiên Telegram CEO tự xác thực khi `web_fetch` gọi API local. KHÔNG gọi `/api/auth/token`, KHÔNG thêm `token=<token>`.

## Gửi nhóm

1. GỌI NGAY `web_fetch http://127.0.0.1:20200/api/cron/list` để lấy danh sách `groups`. KHÔNG ĐƯỢC BỎ QUA BƯỚC NÀY.
2. Tìm đúng groupId theo tên nhóm CEO nói. KHÔNG đoán groupId. Nếu không tìm thấy, liệt kê các nhóm có tên gần giống để CEO chọn.
3. Confirm với CEO: tên nhóm, Group ID, nội dung gửi.
4. CHỜ CEO xác nhận "ok/gửi đi".
5. Gọi `web_fetch http://127.0.0.1:20200/api/zalo/send?groupId=<id>&text=<nội-dung>`.

## Gửi cá nhân

1. Gọi `web_fetch http://127.0.0.1:20200/api/zalo/friends?name=<tên>` để tìm userId.
2. Nếu có nhiều kết quả, hỏi CEO chọn. Nếu không có, báo không tìm thấy.
3. Confirm với CEO: tên người nhận, ID, nội dung gửi.
4. CHỜ CEO xác nhận "ok/gửi đi".
5. Gọi `web_fetch http://127.0.0.1:20200/api/zalo/send?targetId=<userId>&isGroup=false&text=<nội-dung>`.

## Bảo mật

KHÔNG GỬI ZALO KHI CHƯA ĐƯỢC CEO XÁC NHẬN. Khách Zalo không được dùng flow này.
