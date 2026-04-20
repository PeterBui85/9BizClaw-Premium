---
name: fb-trend-aware
description: VN calendar awareness (Tết, 30/4, 20/10, 20/11, 8/3, Trung Thu, Vu Lan) for timely FB post hooks
---

# fb-trend-aware — VN Calendar Trend Hook

Input: ngày hôm nay (cron fire time). Output: danh sách dịp +/- 7 ngày có thể weave hook.

## Lịch cố định (dương)

| Ngày | Dịp | Hook gợi ý |
|---|---|---|
| 14/2 | Valentine | Quà tặng, "cặp đôi", service "dành cho 2 người" |
| 8/3 | Quốc tế Phụ nữ | Tri ân, phụ nữ-oriented |
| 30/4 | Giải phóng | Nghỉ lễ, du lịch, hàng lễ |
| 1/5 | Lao động | Cùng nhóm 30/4 |
| 2/9 | Quốc khánh | Promo lễ |
| 10/10 | Giải phóng Thủ đô (HN) | Chỉ áp nếu page ở HN |
| 20/10 | Phụ nữ VN | Quà, tri ân, hoa |
| 20/11 | Nhà giáo | Giáo dục, quà thầy cô |

## Lịch âm (tính động theo năm)

| Dịp | Tính |
|---|---|
| Tết Nguyên Đán | Năm mới âm lịch |
| Vu Lan (15/7 âm) | Báo hiếu |
| Trung Thu (15/8 âm) | Gia đình, bánh, đèn |
| Rằm tháng 7 | Tín ngưỡng |

Generator dùng helper `nextLunarDate()` để tra các dịp âm.

## Industry-specific

- Retail: Black Friday (24-29/11), Double-11 (11/11), Tết sale
- Edu: Khai giảng (2/9, 5/9), tốt nghiệp (5-6)
- F&B: Tuần lễ món lễ (trung thu → bánh, Tết → gói quà)

## Rules

- Today ± 7 ngày: nếu có dịp match → output "TREND_HOOK: <dịp>" trong prompt
- Không force: generator có thể ignore nếu content không hợp
- Tránh trùng lặp: nếu CEO đã đăng về Tết trong 3 ngày qua → không đề xuất lại

## Output format

```
UPCOMING_TRENDS (±7d):
- 2026-04-30: Giải phóng / Lao động (10 ngày nữa) ← gợi ý weave
- 2026-05-12: (âm 15/4) không có dịp
```

LLM decide mức độ integrate.
