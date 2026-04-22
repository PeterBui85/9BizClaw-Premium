---
name: cron-management
description: Tạo/sửa/xóa lịch tự động (cron) khi CEO yêu cầu qua Telegram — qua API nội bộ
metadata:
  version: 2.1.0
---

# Quản lý lịch tự động (Cron) — qua API nội bộ

## Phạm vi

CHỈ thực hiện khi CEO yêu cầu qua Telegram. Khách hàng Zalo KHÔNG được tạo/sửa/xóa cron.

## Cách thực hiện — web_fetch API + token auth

Bot dùng tool `web_fetch` gọi `http://127.0.0.1:20200/api/cron/*`.
KHÔNG ghi `custom-crons.json` trực tiếp. API tự validate và ghi file.

## Bước 1: Hiểu yêu cầu CEO

CEO nói: "tạo lịch gửi nhóm X mỗi sáng 9h nội dung Y"
Bot cần xác định:
- **Nhóm/người nhận:** tên nhóm hoặc groupId
- **Thời gian:** giờ/ngày/tần suất
- **Nội dung:** text gửi đi
- **Loại:** lặp lại (cronExpr) hay một lần (oneTimeAt)

## Bước 2: Lấy token + tra cứu nhóm

```
web_fetch http://127.0.0.1:20200/api/cron/list
```

Response JSON chứa:
- `token` — 48 hex chars, thay đổi mỗi lần app khởi động. **BẮT BUỘC** kèm `token=<token>` trong URL cho mọi lệnh create/delete/toggle.
- `groups: [{ id, name }, ...]` — tìm groupId theo tên nhóm CEO nói.
- `crons: [...]` — danh sách cron hiện có.

TUYỆT ĐỐI KHÔNG đoán groupId.

## Bước 4: Confirm với CEO TRƯỚC khi tạo

"Em sẽ tạo lịch [label] chạy lúc [giờ] gửi nhóm [tên nhóm]. Anh xác nhận nhé?"
CHỜ CEO trả lời.

## Bước 5: Gọi API tạo cron

### Quy tắc URL — BẮT BUỘC

- Dùng `+` thay khoảng trắng
- **`content` phải là tham số CUỐI CÙNG trong URL**
- Ký tự đặc biệt: `&` → `%26`, `"` → `%22`, `%` → `%25`

### Lịch lặp lại — 1 nhóm

```
web_fetch http://127.0.0.1:20200/api/cron/create?label=Chào+sáng&cronExpr=0+9+*+*+1-5&groupId=123456&token=<token>&content=Chào+buổi+sáng!
```

### Lịch lặp lại — nhiều nhóm (broadcast)

```
web_fetch http://127.0.0.1:20200/api/cron/create?label=Broadcast&cronExpr=0+9+*+*+1-5&groupIds=111,222,333&token=<token>&content=Chào+buổi+sáng!
```

### Lịch một lần (oneTimeAt)

```
web_fetch http://127.0.0.1:20200/api/cron/create?label=Thông+báo&oneTimeAt=2026-04-22T09:00:00&groupId=123456&token=<token>&content=Nội+dung!
```

## Xóa / tạm dừng / bật lại

```
web_fetch http://127.0.0.1:20200/api/cron/delete?token=<token>&id=<cronId>
web_fetch http://127.0.0.1:20200/api/cron/toggle?token=<token>&id=<cronId>&enabled=false
```

Mọi thao tác phải confirm CEO trước.

## Lưu ý

- Label tiếng Việt đầy đủ dấu, KHÔNG emoji
- GroupId phải tồn tại (API tự validate)
- API chỉ bind localhost + token auth — Zalo customers KHÔNG truy cập được
- Token rotates mỗi lần khởi động app — không thể hardcode
- Write mutex: API serialize mọi write
