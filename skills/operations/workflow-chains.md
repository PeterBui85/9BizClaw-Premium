---
name: workflow-chains
description: Kết hợp nhiều capability theo chuỗi khi CEO yêu cầu multi-domain workflow
metadata:
  version: 1.0.0
---

# Workflow Chains — Kết hợp nhiều khả năng

**Khi CEO yêu cầu kết hợp nhiều domain** (VD: "đọc Sheet rồi tạo ảnh đăng Facebook", "lấy dữ liệu rồi gửi nhóm Zalo"):

## Nguyên tắc

1. **Tách thành bước rõ ràng** — mỗi bước = 1 API call, confirm kết quả trước khi bước tiếp
2. **KHÔNG gộp** — không gọi 2 API cùng lúc, không đoán kết quả bước 1 để feed vào bước 2
3. **Fail fast** — bước nào fail → dừng ngay, báo CEO rõ bước nào lỗi, không tiếp tục
4. **Mỗi bước đọc skill tương ứng** — bước Google Sheet → đọc `skills/operations/google-workspace.md`, bước tạo ảnh → đọc `skills/operations/facebook-image.md`

## Quy trình

### Bước 0: Phân tích yêu cầu

Tách yêu cầu CEO thành danh sách bước, liệt kê cho CEO xác nhận:

> Em hiểu yêu cầu gồm 3 bước:
> 1. Đọc dữ liệu từ Google Sheet "Doanh thu T5"
> 2. Tạo ảnh báo cáo dựa trên số liệu
> 3. Đăng lên Facebook fanpage
>
> Anh xác nhận em làm luôn?

### Bước 1-N: Thực hiện tuần tự

Mỗi bước:
1. Đọc skill file tương ứng
2. Gọi API theo đúng hướng dẫn trong skill
3. Xác nhận kết quả thành công (response OK, có data/jobId/proof)
4. Dùng output làm input cho bước kế tiếp
5. Báo CEO kết quả từng bước ngắn gọn

### Bước cuối: Tổng kết

Báo CEO tóm tắt toàn bộ chain:
> Xong 3/3 bước:
> - Sheet: đọc 12 dòng doanh thu
> - Ảnh: tạo xong (đã gửi preview Telegram)
> - Facebook: đã đăng, post ID: 123456

## Các chain phổ biến

| Yêu cầu CEO | Bước 1 | Bước 2 | Bước 3 |
|---|---|---|---|
| "Đọc Sheet rồi đăng Facebook" | Google Sheets get | Image generate | Facebook post |
| "Tạo ảnh gửi nhóm Zalo" | Brand assets list | Image generate-and-send-zalo | — |
| "Đọc email rồi tóm tắt gửi Telegram" | Gmail read | — (tóm tắt) | — (reply trực tiếp) |
| "Lấy dữ liệu Sheet gửi nhóm Zalo" | Google Sheets get | Zalo send | — |

## Cron workflow

Khi CEO muốn chain chạy tự động theo lịch, tạo cron với prompt mô tả đầy đủ chain. Prompt cron nên bắt đầu bằng `[WORKFLOW]` để đánh dấu đây là multi-step.

Đọc `skills/operations/cron-management.md` cho cách tạo cron.

## Giới hạn

- Tối đa 5 bước/chain — quá phức tạp → khuyên CEO dùng tool chuyên dụng
- Nếu bước nào cần tính toán phức tạp (lương, thuế, thống kê) → khuyên CEO dùng Google Sheets cho phần tính, bot chỉ đọc kết quả
- KHÔNG chain từ Zalo customer — chỉ CEO Telegram/Dashboard
