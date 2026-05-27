---
name: facebook-insights
description: Đọc chỉ số Facebook Fanpage (views, engagement, follows) — CHỈ CEO Telegram
metadata:
  version: 1.2.0
---

# Facebook Insights — Đọc Chỉ Số Fanpage

**CHỈ CEO Telegram.** Khách Zalo hỏi → "Dạ thông tin này là nội bộ em không chia sẻ được."

**Khi CEO hỏi: "insights Facebook", "chỉ số Facebook", "báo cáo Fanpage", "thống kê Facebook", "reach Facebook", "bài nào hay nhất", "xem insights Fanpage"**

---

## Xác Thực

Trong phiên Telegram CEO, `web_fetch` tới `http://127.0.0.1:20200` tự động gắn header nội bộ.
- KHÔNG gọi `/api/auth/token`
- KHÔNG tự thêm `token=<token>`
- Fanpage token phải có quyền `read_insights` đã được bật/cấp quyền. `pages_read_engagement` chỉ là fallback cho dữ liệu engagement cơ bản; `read_insights` là quyền chính để đọc metrics.

---

## Lấy Insights — 1 API call

```
web_fetch url="http://127.0.0.1:20200/api/fb/insights?days=7" method=GET
```

**Response thành công** (`valid: true`):

```
{
  "valid": true,
  "pageName": "9BClaw Demo",
  "pageId": "1134927823027871",
  "since": "18/05/2026",
  "until": "25/05/2026",
  "hasInsights": true,
  "metrics": {
    "page_media_view": { "current": 156, "previous": 0, "daily": [10,0,0,0,0,0,146] },
    "page_post_engagements": { "current": 12, "previous": 0, "daily": [...] },
    "page_follows": { "current": 0, "previous": 0, "daily": [] },
    "page_views_total": { "current": 156, "previous": 0, "daily": [...] },
    "page_followers": { "current": 0, "previous": 0, "daily": [] }
  },
  "metricErrors": {},
  "recentPosts": [
    { "message": "Tiêu đề bài...", "created_time": "2026-05-22T08:59:47+0000",
      "likes": 0, "comments": 0, "shares": 0,
      "url": "https://www.facebook.com/..." }
  ],
  "tokenValid": true,
  "hasInsightsPermission": true,
  "permissions": { "read_insights": true, "pages_read_engagement": true },
  "tokenName": "Bui Tuan Huy"
}
```

**Metric hiện tại:** Từ thay đổi Meta tháng 11/2025, dùng `page_media_view` thay cho impressions và `page_follows` thay cho page fans. API có alias `page_views_total` và `page_followers` để format cũ không vỡ.

**Nếu Page có ít người theo dõi (0 fan)**: Facebook có thể không trả dữ liệu insights. Response vẫn trả về `recentPosts` và `tokenValid`. Chỉ số nào thiếu thì bỏ qua.

**Nếu `hasInsightsPermission: false`**: báo CEO token chưa có quyền `read_insights`, cần cấp lại Page token sau khi App Review/Business app đã bật quyền này.

**Response lỗi**:
- `valid: false` + `error: "Facebook chưa kết nối."` → "Fanpage chưa được kết nối. Vào Dashboard > Facebook > Kết nối Fanpage."
- HTTP 500 → "Lỗi hệ thống khi đọc insights, thử lại sau nhé."

---

## Trích Xuất

Từ `metrics`, lấy `current` cho từng chỉ số. Bảng hiển thị:

| Chỉ số | Từ đâu |
|---|---|
| `page_media_view` | Lượt xem nội dung/trang |
| `page_post_engagements` | Tương tác (bình luận/chia sẻ/like) |
| `page_follows` | Người theo dõi trang |
| `page_views_total` | Alias của `page_media_view` |
| `page_followers` | Alias của `page_follows` |

**Tính xu hướng %** (nếu `previous > 0`):
```
trend = ((current - previous) / previous * 100).toFixed(1)
```
Hiển thị: `+12.5%` hoặc `-5.0%`

**Nếu chỉ số không có trong metrics** (Page 0 fan, Facebook không trả): BỎ QUA, không hiển thị hàng đó.

---

## Format Trả Lời

TIẾNG VIỆT CÓ DẤU, có bảng.

**Nếu có dữ liệu** (`hasInsights: true`):

> **Fanpage: 9BClaw Demo**
> Thời gian: 18/05 — 25/05/2026
>
> | Chỉ số | 7 ngày | Xu hướng |
> |---|---|---|
> | Lượt xem trang | 156 | +12.5% |
> | Người đọc khác nhau | 98 | +8.0% |
> | Số người tiếp cận | 89 | +15.0% |
> | Tương tác bài đăng | 12 | - |
> | Người theo dõi | 0 | — |
>
> **Bài gần nhất (22/05/2026):**
> "Xu hướng AI nổi bật..."
> 0 like · 0 bình luận · 0 chia sẻ
> [Xem bài](https://www.facebook.com/...)
>
> Token: còn hợp lệ

**Nếu không có dữ liệu** (`hasInsights: false`, Page 0 fan):

> **Fanpage: 9BClaw Demo**
>
> Trang chưa có người theo dõi — Facebook chưa trả dữ liệu chỉ số.
> Các chỉ số (views, engagement, follows) sẽ hiển thị sau khi Facebook trả dữ liệu thực sự.
>
> **Bài gần nhất (22/05/2026):**
> "Xu hướng AI nổi bật..."
> 0 like · 0 bình luận · 0 chia sẻ
> [Xem bài](https://www.facebook.com/...)
>
> Token: còn hợp lệ

Hiển thị 1-2 bài mới nhất từ `recentPosts`. Chỉ lấy `recentPosts[0]` và `recentPosts[1]` (nếu có).

---

## Checklist

- [ ] Đã gọi `/api/fb/insights` (không gọi Graph API trực tiếp)
- [ ] Đã kiểm tra `valid` trong response
- [ ] Nếu `hasInsights: false` → dùng format "Trang chưa có người theo dõi"
- [ ] Nếu `hasInsights: true` → hiển thị bảng chỉ số + xu hướng
- [ ] Đã hiển thị 1-2 bài gần nhất từ `recentPosts`
- [ ] Đã kiểm tra `tokenValid` — nếu `false` cảnh báo CEO
- [ ] Trả lời TIẾNG VIỆT CÓ DẤU
