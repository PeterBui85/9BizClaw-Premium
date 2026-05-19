---
name: zalo-followup-sheet
description: Tổng hợp khách hàng Zalo vào Google Sheet có format CRM để nhân viên follow-up
metadata:
  version: 2.0.0
---

# Tổng hợp khách Zalo ra Google Sheet

CHỈ CEO Telegram. Khách Zalo -> "Dạ đây là thông tin nội bộ ạ."

## Khi nào dùng

CEO nói: "tổng hợp khách Zalo", "báo cáo khách vào Sheet", "follow-up sheet", "danh sách khách cần chăm", "xuất khách hàng ra Sheet"

## Cách dùng (1 API call)

```
web_fetch url="http://127.0.0.1:20200/api/zalo-crm/export" method=POST body="{\"dateRange\":\"today\"}" headers="{\"Content-Type\":\"application/json\"}"
```

Response: `{spreadsheetId, spreadsheetUrl, customersExported, customers: [{name, phone, summary}]}`

Gửi CEO link Sheet + số khách exported.

## Tuỳ chọn

| Param | Ý nghĩa |
|-------|---------|
| `dateRange` | `"today"` (mặc định) hoặc `"all"` |
| `spreadsheetId` | Ghi vào Sheet có sẵn thay vì tạo mới |
| `title` | Tên Sheet tùy chỉnh |

## Lỗi thường gặp

- `"Google not connected"` -> báo CEO: "Anh mở Dashboard > Google Workspace > Cài đặt để kết nối."
- `"No customers found"` -> "Không có khách Zalo mới trong khoảng thời gian này."

## Cron tự động

CEO: "mỗi tối 8h tổng hợp khách Zalo vào Sheet" -> tạo cron agent mode. Đọc `skills/operations/cron-management.md`.
