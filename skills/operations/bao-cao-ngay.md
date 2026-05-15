---
name: bao-cao-ngay
description: Báo cáo ngày/tuần cho CEO — tổng hợp từ workspace, đọc 30 giây
metadata:
  version: 1.0.0
---

# Báo cáo ngày cho CEO

## Nguyên tắc

CEO nói "báo cáo hôm nay" → tổng hợp NGAY từ workspace data. Không hỏi lại.
Thiếu data → nói rõ thiếu gì + hướng dẫn bổ sung 1 câu.
Format: đọc trên điện thoại 30 giây. Bullet, con số, không văn vẻ.

## Nguồn data

Đọc qua `web_fetch http://127.0.0.1:20200/api/workspace/read?path=<path>`:

| Path | Nội dung |
|------|----------|
| `so-sach.md` | Thu chi hàng ngày |
| `cong-no.md` | Nợ phải thu, quá hạn |
| `follow-up-queue.json` | Khách cần theo dõi |
| `memory/zalo-users/*.md` | Hồ sơ khách, lịch sử |
| `logs/cron-runs.jsonl` | Kết quả cron |
| `schedules.json` | Lịch sắp tới |

## Format báo cáo ngày

```
BÁO CÁO NGÀY [dd/mm/yyyy]

THU CHI
- Thu: [tổng] ([N giao dịch])
- Chi: [tổng] ([N giao dịch])
- Ròng: [thu - chi]

KHÁCH MỚI
- [N] khách Zalo mới
- [tên]: [1 dòng nhu cầu/trạng thái]

FOLLOW-UP TỒN
- [N] khách cần follow
- [tên]: chờ [N] ngày — [chủ đề]

CẢNH BÁO
- [nội dung: nợ quá hạn, khách chưa phản hồi lâu]

VIỆC MAI
- [từ lịch hẹn + follow-up sắp hạn]
```

## Format báo cáo tuần

CEO nói "tuần này thế nào":

```
BÁO CÁO TUẦN [dd/mm — dd/mm]

TỔNG QUAN: Thu [X] | Chi [Y] | Ròng [Z] | So tuần trước [+/-]
KHÁCH: Mới [N] | Quay lại [N] | Follow-up tồn [N]
CÔNG NỢ: Phải thu [X] | Đã thu [Y] | Quá hạn [N] khoản
CRON: [N] thành công | [N] lỗi
ĐÁNG CHÚ Ý: [2-3 insight: khách hot, xu hướng, vấn đề]
```

## Thiếu data

| Tình huống | Xử lý |
|------------|-------|
| Không có `so-sach.md` | "Anh chưa ghi thu chi. Nhắn 'thu X chi Y' để em cập nhật." |
| Không có `cong-no.md` | Bỏ section, không nhắc |
| `memory/zalo-users/` trống | "Không có khách mới." |
| Tất cả trống | "Chưa có data. Bắt đầu bằng nhắn thu chi hoặc ghi công nợ." |

## Quy tắc

- Số tiền: dấu chấm (5.000.000). Phần trăm: 1 số lẻ (+12.5%)
- Không mở đầu "Em xin báo cáo..." — số liệu thẳng
- Không bịa số. Không có data = nói không có
- Xuất hết, không hỏi "anh muốn xem mục nào"
- CEO hỏi thêm ("chi tiết khách mới") → drill down ngay
- Tiếng Việt có dấu đầy đủ

## Cron tự động

CEO nói "báo cáo mỗi sáng" → tạo cron agent mode:

```
web_fetch "http://127.0.0.1:20200/api/cron/create?label=Báo+cáo+sáng&cronExpr=30+7+*+*+*&mode=agent&prompt=Đọc+workspace+tổng+hợp+báo+cáo+ngày+hôm+qua+cho+CEO.+Format+theo+skill+bao-cao-ngay."
```
