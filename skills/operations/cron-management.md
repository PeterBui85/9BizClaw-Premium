---
name: cron-management
description: Tạo/sửa/xóa lịch tự động (cron) khi CEO yêu cầu qua Telegram, bằng API nội bộ
metadata:
  version: 2.3.0
---

# Quản lý lịch tự động (Cron) qua API nội bộ

## Phạm vi

CHỈ thực hiện khi CEO yêu cầu qua Telegram. Khách hàng Zalo KHÔNG được tạo/sửa/xóa cron.

## Cách thực hiện

Bot dùng `web_fetch` gọi `http://127.0.0.1:20200/api/cron/*`.
KHÔNG ghi `custom-crons.json` trực tiếp. API tự validate và ghi file.

Phiên Telegram CEO tự xác thực khi gọi API local. KHÔNG gọi `/api/auth/token`, KHÔNG thêm `token=<token>`, KHÔNG đọc file token.

## Bước 1: Hiểu yêu cầu CEO

CEO nói: "tạo lịch gửi nhóm X mỗi sáng 9h nội dung Y".
Bot cần xác định:
- Nhóm/người nhận: tên nhóm hoặc groupId
- Thời gian: giờ/ngày/tần suất
- Nội dung: text gửi đi
- Loại: lặp lại (`cronExpr`) hay một lần (`oneTimeAt`)

## Bước 2: Tra cứu nhóm

```
web_fetch http://127.0.0.1:20200/api/cron/list
```

Response JSON chứa:
- `groups: [{ id, name }, ...]` để tìm groupId theo tên nhóm CEO nói.
- `crons: [...]` danh sách cron hiện có.

TUYỆT ĐỐI KHÔNG đoán groupId.

## Bước 3: Confirm với CEO trước khi tạo

Nói rõ: "Em sẽ tạo lịch [label] chạy lúc [giờ] gửi nhóm [tên nhóm]. Anh xác nhận nhé?"
CHỜ CEO trả lời xác nhận trước khi gọi create/delete/toggle.

## Bước 4: Gọi API tạo cron

Quy tắc URL:
- Dùng `+` thay khoảng trắng.
- `content` hoặc `prompt` đặt cuối URL.
- Ký tự đặc biệt: `&` -> `%26`, `"` -> `%22`, `%` -> `%25`.
- Prompt agent mode phải viết tiếng Việt có dấu đầy đủ.

**BẮT BUỘC: mọi cron group PHẢI truyền cả `groupId` VÀ `groupName`.** API cross-check để chặn bind sai nhóm (sự cố thật 2026-05-15: cron bị bind vào "LỊCH KH NUMINA" trong khi prompt nói "LỊCH CÁ NHÂN"). Nếu chỉ truyền `groupId`, API trả 400 + nhắc thêm groupName.

Lặp lại một nhóm:
```
web_fetch http://127.0.0.1:20200/api/cron/create?label=Chào+sáng&cronExpr=0+9+*+*+1-5&groupId=123456&groupName=Khách+VIP&content=Chào+buổi+sáng!
```

Lặp lại nhiều nhóm (groupIds + groupName phải khớp 1-1 hoặc gọi nhiều lần riêng biệt):
```
# Khuyến nghị: gọi 3 lần riêng cho 3 nhóm, mỗi lần có cả id+name
```

Lịch một lần:
```
web_fetch http://127.0.0.1:20200/api/cron/create?label=Thông+báo&oneTimeAt=2026-04-22T09:00:00&groupId=123456&groupName=Tên+nhóm&content=Nội+dung!
```

Agent mode:
```
web_fetch http://127.0.0.1:20200/api/cron/create?label=Báo+cáo+sáng&cronExpr=0+8+*+*+*&groupId=123456&groupName=Tên+nhóm&mode=agent&prompt=Tổng+hợp+hoạt+động+hôm+qua+và+gửi+báo+cáo+ngắn+gọn
```

## Bước 4b: Soát lại cron cũ bị bind sai (audit)

CEO hỏi "kiểm tra cron có bind đúng nhóm không?" hoặc nghi ngờ cron gửi sai nhóm → gọi:
```
web_fetch http://127.0.0.1:20200/api/cron/audit
```
Trả về `{totalCrons, flagged, findings}`. Mỗi `finding` có các `issues`:
- `label_drift` — nhóm bị đổi tên trên Zalo, stored label cũ
- `unknown_groupId` — nhóm đã bị xóa hoặc cache groups.json rỗng
- `prompt_mentions_other_group` — prompt nhắc đến tên nhóm KHÁC stored target (nghi ngờ bind sai từ lúc tạo)

Báo CEO danh sách cron flagged + đề xuất: (a) `delete + tạo lại` đúng, hoặc (b) `toggle enabled=false` tạm tắt trong khi xác minh.

## Bước 5: Xác nhận cron đã tạo (BẮT BUỘC)

Sau khi gọi create, PHẢI kiểm tra response:
1. Response có `"success":true` → tiếp bước 2.
2. Response có `"error":` → báo CEO lỗi cụ thể, KHÔNG nói "đã tạo".
3. Gọi `web_fetch http://127.0.0.1:20200/api/cron/list` — tìm cron vừa tạo trong danh sách.
4. CHỈ nói "đã tạo thành công" khi thấy cron trong list. Nếu không thấy → báo CEO "tạo không thành công".

TUYỆT ĐỐI KHÔNG nói "đã tạo" nếu chưa verify qua /api/cron/list.

## Xóa / tạm dừng / bật lại

```
web_fetch http://127.0.0.1:20200/api/cron/delete?id=<cronId>
web_fetch http://127.0.0.1:20200/api/cron/toggle?id=<cronId>&enabled=false
```

Mọi thao tác phải confirm CEO trước.

## Sửa / thay nhiều cron

KHÔNG xóa từng cron rồi mới tạo lại. Nếu bước tạo lại lỗi, cron cũ sẽ mất.

Dùng route atomic:

```
web_fetch url="http://127.0.0.1:20200/api/cron/replace" method=POST body="{\"deleteIds\":[\"cron_cũ\"],\"creates\":[{\"label\":\"Báo cáo mới\",\"cronExpr\":\"0 8 * * *\",\"groupId\":\"123456\",\"mode\":\"agent\",\"prompt\":\"Tổng hợp hoạt động hôm qua và gửi báo cáo ngắn gọn\"}]}" headers="{\"Content-Type\":\"application/json\"}"
```

Chỉ báo đã cập nhật khi response có:
- `success:true`
- `transactional:true`
- `createdIds` đủ số cron mới

Nếu route trả lỗi, API tự giữ nguyên cron cũ và bot phải báo rõ lỗi cho CEO.

## Lưu ý

- Label tiếng Việt đầy đủ dấu, KHÔNG emoji.
- GroupId phải tồn tại, API tự validate.
- API chỉ bind localhost và xác thực nội bộ; Zalo customers KHÔNG truy cập được.
- Token nội bộ không hiện trong prompt, không hardcode.
- Write mutex: API serialize mọi write.
