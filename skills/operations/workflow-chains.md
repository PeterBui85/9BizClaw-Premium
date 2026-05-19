---
name: workflow-chains
description: Tự tách và thực hiện workflow nhiều bước — không giới hạn số bước, tự compose từ API có sẵn
metadata:
  version: 2.0.0
---

# Workflow Chains — Tự compose workflow từ API có sẵn

CEO có thể yêu cầu BẤT KỲ workflow nào kết hợp nhiều bước. Bot KHÔNG phụ thuộc vào danh sách chain cố định — tự tách bước, tự chọn API, tự chạy tuần tự.

## Quy tắc sắt

1. **KHÔNG DỪNG GIỮA CHỪNG.** CEO nói "tạo ảnh rồi gửi nhóm Zalo" = 2 bước. Tạo ảnh xong → PHẢI gửi tiếp. Im ru sau bước 1 = lỗi nghiêm trọng.
2. **Output bước N = input bước N+1.** Dữ liệu từ Sheet → làm prompt tạo ảnh. imagePath từ generate → gửi qua send-media. KHÔNG để mất data giữa các bước.
3. **Fail fast, fail loud.** Bước nào fail → dừng ngay, báo CEO rõ bước nào lỗi. KHÔNG tiếp tục với data thiếu.
4. **Không giới hạn số bước.** 3, 5, 7, 10 bước đều OK. CEO muốn gì thì compose từ API có sẵn.

## API actions có sẵn (bot tự chọn)

| Domain | Actions | Skill tham khảo |
|--------|---------|-----------------|
| Google Sheets | `sheets/get`, `sheets/update`, `sheets/append`, `sheets/create-formatted` | `google-workspace.md` |
| Google Calendar | `calendar/events`, `calendar/create`, `calendar/free-slots` | `google-workspace.md` |
| Google Gmail | `gmail/inbox`, `gmail/read`, `gmail/send` | `google-workspace.md` |
| Google Drive | `drive/list`, `drive/download`, `drive/upload` | `google-workspace.md` |
| Google Docs | `docs/read`, `docs/write`, `docs/create` | `google-workspace.md` |
| Tạo ảnh | `image/generate`, `image/status`, `image/generate-and-send-zalo` | `image-generation.md` |
| Gửi Zalo text | `openzca msg send` (qua cron hoặc sendZaloTo) | `telegram-ceo.md` |
| Gửi Zalo ảnh | `zalo/send-media`, `image/generate-and-send-zalo` | `image-generation.md` |
| Facebook post | `fb/schedule/create`, `fb/post` | `facebook-post-workflow.md` |
| Đơn hàng | `order/create`, `order/list`, `order/update`, `order/summary` | `workspace-api.md` |
| Tồn kho | `inventory/adjust`, `inventory/check`, `inventory/alerts` | `workspace-api.md` |
| Nghỉ phép | `leave/request`, `leave/list`, `leave/summary` | `workspace-api.md` |
| Báo cáo | `report/daily` | `workspace-api.md` |
| CRM Sheet | `zalo-crm/export` | `zalo-followup-sheet.md` |
| Workspace file | `workspace/read`, `workspace/append`, `workspace/list` | `workspace-api.md` |
| CEO file | `file/read`, `file/write`, `file/list`, `file/exec` | `ceo-file-api.md` |
| Memory | `memory/write`, `memory/search` | `ceo-memory-api.md` |
| Cron | `cron/create`, `cron/list`, `cron/delete` | `cron-management.md` |

## Cách thực hiện (bất kỳ workflow nào)

### Bước 0: Phân tích + liệt kê

Tách yêu cầu CEO thành bước, chọn API cho mỗi bước, liệt kê:

> Em hiểu yêu cầu gồm 4 bước:
> 1. Đọc nội dung từ Google Sheet "Lịch đăng bài"
> 2. Lấy nội dung hôm nay → soạn prompt tạo ảnh
> 3. Tạo ảnh gửi vào nhóm Zalo "Khách VIP"
> 4. Ghi lại trạng thái "đã gửi" vào Sheet
>
> Em làm luôn nhé?

CEO confirm → chạy. CEO sửa → điều chỉnh.

### Bước 1-N: Chạy tuần tự

Mỗi bước:
1. Gọi API → đợi response thành công
2. Trích data cần thiết từ response (imagePath, spreadsheetId, content...)
3. Dùng data đó cho bước tiếp theo
4. Báo CEO ngắn gọn kết quả từng bước (KHÔNG đợi hết chain mới báo)

### Bước cuối: Tổng kết

> Xong 4/4 bước:
> 1. Sheet: đọc 5 dòng lịch đăng bài
> 2. Prompt: soạn xong từ nội dung "Khuyến mãi tuần 3"
> 3. Ảnh: đã tạo + gửi nhóm "Khách VIP"
> 4. Sheet: cập nhật trạng thái "đã gửi"

## Quy tắc gửi ảnh Zalo (hay quên)

**CẢNH BÁO: Đây là lỗi phổ biến nhất trong workflow.**

- Tạo ảnh xong PHẢI gửi tiếp nếu CEO yêu cầu. KHÔNG im ru.
- Gửi ẢNH THẬT, không gửi đường dẫn file dưới dạng text.
- Dùng `generate-and-send-zalo` (atomic, 1 call) HOẶC poll `image/status` → lấy `imagePath` → gọi `zalo/send-media`.
- Đọc `skills/operations/image-generation.md` mục "Gửi ảnh vào nhóm Zalo SAU KHI tạo xong" cho chi tiết.

## Ví dụ workflow 5+ bước

CEO: "Đọc Sheet tồn kho, lọc mặt hàng sắp hết, tạo ảnh cảnh báo, gửi nhóm Kho, rồi ghi log vào Sheet báo cáo"

→ 5 bước:
1. `sheets/get` → đọc Sheet tồn kho
2. Lọc items có qty < minQty → soạn nội dung cảnh báo
3. `image/generate-and-send-zalo` → tạo ảnh cảnh báo + gửi nhóm Kho
4. `sheets/append` → ghi log vào Sheet báo cáo (ngày, số items cảnh báo, đã gửi nhóm)
5. Reply CEO: "Em đã gửi cảnh báo tồn kho (3 items sắp hết) vào nhóm Kho + ghi log Sheet."

## Cron workflow

CEO muốn chain chạy tự động → tạo cron agent mode với prefix `[WORKFLOW]`:
```
web_fetch POST /api/cron/create body={"label":"Cảnh báo tồn kho sáng","cronExpr":"0 8 * * 1-5","groupId":"123","groupName":"Nhóm Kho","mode":"agent","prompt":"[WORKFLOW] Đọc Sheet tồn kho, lọc hàng sắp hết, tạo ảnh cảnh báo gửi nhóm Kho, ghi log Sheet báo cáo"}
```

**Gửi ảnh trong cron:** LUÔN dùng agent mode. KHÔNG dùng `content` với đường dẫn file.

## An toàn

- KHÔNG chain từ Zalo customer — chỉ CEO Telegram/Dashboard
- Bước nào cần confirm CEO (gửi email, đăng Facebook, xóa dữ liệu) → hỏi trước khi chạy
- Bước đọc data (Sheet, email, memory) → chạy luôn không cần hỏi
