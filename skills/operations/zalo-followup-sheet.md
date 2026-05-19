---
name: zalo-followup-sheet
description: Tổng hợp khách hàng Zalo vào Google Sheet có format CRM để nhân viên follow-up
metadata:
  version: 1.0.0
---

# Tổng hợp khách Zalo → Google Sheet

CHỈ CEO Telegram. Khách Zalo → "Dạ đây là thông tin nội bộ ạ."

## Khi nào dùng

CEO nói: "tổng hợp khách Zalo", "báo cáo khách vào Sheet", "follow-up sheet", "danh sách khách cần chăm", "xuất khách hàng ra Sheet"

## Cột (Standard CRM)

| Col | Header | Ghi chú |
|-----|--------|---------|
| A | Ngày | YYYY-MM-DD |
| B | Tên khách | Từ memory file header hoặc friend list displayName |
| C | SĐT | Từ openzca friend list phoneNumber. Format 84xxx → 0xxx. Cột TEXT để giữ số 0 |
| D | Nội dung hỏi | Tóm tắt hội thoại gần nhất từ memory file |
| E | Trạng thái | Mặc định "Mới" |
| F | Nhân viên follow-up | Để trống cho CEO/nhân viên điền |
| G | Ghi chú | Tóm tắt từ memory file (pending, hẹn, khiếu nại) |
| H | Hẹn liên hệ lại | Ngày hẹn nếu có trong memory |

## Quy trình (5 bước)

### Bước 1: Lấy danh sách khách Zalo

Đọc `memory/zalo-users/` qua workspace API:
```
web_fetch url="http://127.0.0.1:20200/api/workspace/list?dir=memory/zalo-users" method=GET
```

Lọc file theo ngày modified (mặc định: hôm nay). Mỗi file: filename = senderId, dòng đầu `#` = tên khách, nội dung = hội thoại.

Đọc nội dung từng file:
```
web_fetch url="http://127.0.0.1:20200/api/workspace/read?path=memory/zalo-users/<senderId>.md" method=GET
```

### Bước 2: Lấy SĐT từ friend list

Đọc danh sách bạn bè Zalo (có sẵn phoneNumber cho mỗi friend):
```
web_fetch url="http://127.0.0.1:20200/api/zalo/friends" method=GET
```

Match `senderId` từ bước 1 với `userId` trong friend list → lấy `phoneNumber`.

Chuyển `84xxxxxxxxx` → `0xxxxxxxxx`:
- Bỏ prefix `84` nếu số có 11+ ký tự và bắt đầu bằng `84`
- Thêm `0` ở đầu

### Bước 3: Tạo hoặc tìm Sheet

- CEO chỉ định Sheet có sẵn → dùng spreadsheetId đó
- Không chỉ định → tạo mới:
```
web_fetch url="http://127.0.0.1:20200/api/google/sheets/create" method=POST body="{\"title\":\"Theo dõi khách Zalo YYYY-MM-DD\"}"
```

### Bước 4: Ghi dữ liệu

**Quan trọng: set cột SĐT thành TEXT TRƯỚC khi ghi data** để giữ số 0 đầu:
```
web_fetch url="http://127.0.0.1:20200/api/google/sheets/number-format" method=POST body="{\"spreadsheetId\":\"<id>\",\"range\":\"Sheet1!C:C\",\"type\":\"TEXT\"}"
```

Ghi header:
```
web_fetch url="http://127.0.0.1:20200/api/google/sheets/update" method=POST body="{\"spreadsheetId\":\"<id>\",\"range\":\"Sheet1!A1:H1\",\"values\":[[\"Ngày\",\"Tên khách\",\"SĐT\",\"Nội dung hỏi\",\"Trạng thái\",\"Nhân viên follow-up\",\"Ghi chú\",\"Hẹn liên hệ lại\"]]}"
```

Ghi data rows:
```
web_fetch url="http://127.0.0.1:20200/api/google/sheets/append" method=POST body="{\"spreadsheetId\":\"<id>\",\"range\":\"Sheet1!A2:H2\",\"values\":[[\"2026-05-19\",\"Nguyễn Văn An\",\"0909123456\",\"Hỏi gói 6 tháng\",\"Mới\",\"\",\"Chờ xác nhận\",\"2026-05-21\"]]}"
```

### Bước 5: Format đẹp

Freeze header:
```
web_fetch url="http://127.0.0.1:20200/api/google/sheets/freeze" method=POST body="{\"spreadsheetId\":\"<id>\",\"rows\":1}"
```

Header bold trắng trên nền xanh đậm:
```
web_fetch url="http://127.0.0.1:20200/api/google/sheets/format" method=POST body="{\"spreadsheetId\":\"<id>\",\"range\":\"Sheet1!A1:H1\",\"formatJson\":{\"textFormat\":{\"bold\":true,\"foregroundColorStyle\":{\"rgbColor\":{\"red\":1,\"green\":1,\"blue\":1}}},\"backgroundColor\":{\"red\":0.1,\"green\":0.21,\"blue\":0.36}},\"formatFields\":\"textFormat.bold,textFormat.foregroundColorStyle,backgroundColor\"}"
```

Text wrap toàn bộ:
```
web_fetch url="http://127.0.0.1:20200/api/google/sheets/format" method=POST body="{\"spreadsheetId\":\"<id>\",\"range\":\"Sheet1!A1:H100\",\"formatJson\":{\"wrapStrategy\":\"WRAP\"},\"formatFields\":\"wrapStrategy\"}"
```

### Kết quả

Gửi CEO link Google Sheet:
> Em đã tổng hợp N khách vào Sheet: [link]
> Nhân viên mở Sheet → điền cột "Nhân viên follow-up" và cập nhật "Trạng thái" để theo dõi.

## Cron tự động

CEO: "mỗi tối 8h tổng hợp khách Zalo vào Sheet" → tạo cron với prefix `[WORKFLOW]`. Mỗi ngày append thêm khách mới vào cùng Sheet (nếu CEO chỉ định) hoặc tạo Sheet mới theo ngày.

Đọc `skills/operations/cron-management.md` cho cách tạo cron.
