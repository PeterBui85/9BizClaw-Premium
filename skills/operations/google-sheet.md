---
name: google-sheet
description: Đọc dữ liệu từ Google Sheet công khai (public) qua CSV endpoint
metadata:
  version: 1.0.0
---

# Đọc Google Sheet công khai

## Điều kiện bắt buộc

Sheet PHẢI được chia sẻ công khai: File > Share > Anyone with link > Viewer.
Nếu sheet là private, endpoint trả về trang HTML đăng nhập Google thay vì CSV.

## Trích spreadsheet ID từ URL

URL Google Sheet có dạng:
`https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid=0`

Lấy phần `{SHEET_ID}` giữa `/d/` và `/edit` (hoặc `/gviz` hoặc bất kỳ path nào sau đó).

## CSV endpoint

**Sheet mặc định (tab đầu tiên):**
```
https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv
```

**Tab cụ thể theo tên:**
```
https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={SHEET_NAME}
```

`{SHEET_NAME}` cần URL-encode nếu có dấu tiếng Việt hoặc khoảng trắng.

## Cách đọc

1. Dùng web fetch tool để GET URL CSV ở trên
2. Kết quả là plain text CSV — dòng đầu là header
3. Parse: tách dòng theo `\n`, tách cột theo dấu phẩy
4. Giá trị có dấu phẩy hoặc xuống dòng bên trong sẽ được bao trong dấu ngoặc kép `"..."`
5. Dấu ngoặc kép trong giá trị được escape thành `""`

## Xử lý lỗi

| Tình huống | Dấu hiệu |
|---|---|
| Sheet chưa public | Response là HTML (có `<html`, `accounts.google.com`) thay vì CSV |
| Sheet không tồn tại | HTTP 404 |
| Tab không tồn tại | Response rỗng hoặc lỗi `#N/A` |

Khi gặp lỗi, thông báo rõ cho CEO và hướng dẫn cách chia sẻ sheet (Anyone with link > Viewer).

## Cache

KHÔNG fetch lại cùng sheet trong vòng 5 phút kể từ lần fetch trước.
Chỉ fetch lại sớm hơn nếu CEO yêu cầu rõ ràng ("cập nhật lại", "đọc lại", "refresh").

Ghi nhớ sheet ID + thời điểm fetch cuối để kiểm tra.

## Trường hợp sử dụng

- Bảng giá sản phẩm, báo giá dịch vụ
- Danh sách tồn kho, hàng hóa
- Danh sách khách hàng, liên hệ
- Catalog sản phẩm, menu
- Bảng chấm công, lương
- Kế hoạch công việc, timeline

## Lưu ý

- Chỉ đọc được sheet PUBLIC — không có cách vượt qua quyền truy cập
- Dữ liệu trả về là snapshot tại thời điểm fetch, không phải real-time
- Sheet quá lớn (>10,000 dòng) có thể trả về chậm — cảnh báo CEO nếu cần
