# In-App Onboarding — Redesign Spec

## Nguyên tắc

**App tự giải thích. CEO không cần học.**

Hai loại user:
- **Gói 100tr:** MODORO pre-configure mọi thứ. CEO mở → đã hoạt động. Onboarding = safety net.
- **Free/tự cài:** Empty state thông minh dẫn dắt. Không popup tour. Không manual dài.

## 1. Smart Empty States (thay checklist + tour)

Khi data rỗng, mỗi section TỰ BIẾN THÀNH hướng dẫn. Khi có data → hướng dẫn biến mất, hiện data thật.

### Overview page — fresh install

```
┌─────────────────────────────────────────────────┐
│ Chào buổi sáng anh Quốc              ● Đang chạy│
├─────────────────────────────────────────────────┤
│                                                  │
│         Bắt đầu dùng MODOROClaw                 │
│                                                  │
│   Mở Telegram, nhắn thử cho bot 1 câu bất kỳ.  │
│   Bot sẽ trả lời trong vài giây.                │
│                                                  │
│         [ Mở Telegram → ]                        │
│                                                  │
│   Chưa có Telegram? Hướng dẫn 30 giây ↗        │
│                                                  │
├─────────────────────────────────────────────────┤
│ Khách Zalo gần đây          Lịch hôm nay        │
│ Chưa có khách nào.          07:30 Báo cáo sáng  │
│ Khi khách nhắn Zalo,        17:00 Tóm tắt tối   │
│ bot tự trả lời và           Lịch tự động chạy   │
│ hiện tên ở đây.             mỗi ngày.           │
└─────────────────────────────────────────────────┘
```

**Sau khi CEO nhắn thử → stat cards hiện số thật → CTA biến mất → Overview bình thường.**

### Knowledge tab — empty

```
┌─────────────────────────────────────────────────┐
│ Tài liệu doanh nghiệp                          │
│                                                  │
│   Bot trả lời thông minh hơn khi có tài liệu.  │
│                                                  │
│   Thêm bảng giá, SOP, FAQ, catalog —            │
│   bot tự đọc và dùng khi khách hỏi.             │
│                                                  │
│   [ Thêm tài liệu đầu tiên ]                   │
│                                                  │
│   Hỗ trợ: PDF, Word, Excel, TXT, ảnh           │
└─────────────────────────────────────────────────┘
```

### Zalo tab — chưa kết nối

```
Zalo chưa kết nối.
Quét mã QR để bot nhận tin từ khách Zalo.
[ Quét QR → ]
```

### Zalo tab — đã kết nối, chưa có khách

```
Zalo đã kết nối. Đang chờ khách nhắn tin.
Khi khách nhắn, bot tự trả lời và hiện ở đây.
```

### Lịch tự động — empty custom crons

```
8 lịch mặc định đang chạy (báo cáo sáng, tóm tắt tối, ...).
Muốn thêm lịch mới? Nhắn bot trên Telegram:
"Nhắc anh uống nước mỗi 2 tiếng"
Bot sẽ tự tạo lịch.
```

## 2. Contextual Tooltips (thay tour popups)

Nút "?" nhỏ cạnh element phức tạp. Hover/click → tooltip 1 câu. Hiện mọi lúc, không chỉ lần đầu.

| Element | Tooltip |
|---|---|
| Stat "khách mới" | "Số khách Zalo mới nhắn tin hôm nay" |
| Stat "sự kiện" | "Tổng hoạt động bot ghi nhận hôm nay" |
| Nút "Dừng/Chạy" | "Tắt/bật bot. Khi dừng, bot không trả lời khách" |
| Dropdown "Chọn chủ Zalo" | "Bot nhận diện tài khoản này là chủ, trả lời khác với khách" |
| Toggle nhóm Zalo | "Tick nhóm nào bot được trả lời khi @mention" |
| "Lịch tự động" | "Bot chạy tự động theo giờ. Bấm vào để xem chi tiết" |
| Strategy dropdown (9Router) | "Cách bot chọn AI: lần lượt hoặc ưu tiên cái đầu tiên" |

**Implement:** CSS tooltip on `[data-tooltip]` attribute. No JS tour library needed.

```html
<span class="tooltip-trigger" data-tooltip="Số khách Zalo mới nhắn tin hôm nay">?</span>
```

```css
.tooltip-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--border); color: var(--text-muted);
  font-size: 10px; cursor: help; flex-shrink: 0;
}
.tooltip-trigger:hover::after {
  content: attr(data-tooltip);
  position: absolute; bottom: calc(100% + 6px); left: 50%;
  transform: translateX(-50%);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 8px 12px; font-size: 12px;
  color: var(--text); white-space: nowrap; max-width: 250px;
  white-space: normal; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 100;
}
```

## 3. Nút "Hỗ trợ" (thay help.html)

Không build help page lớn. Thay bằng:

### Nút cố định góc dưới phải

```
[ ? Hỗ trợ ]
```

Click → dropdown 3 options:
1. **Xem video hướng dẫn** → link YouTube/Loom (3 phút walkthrough)
2. **Liên hệ MODORO** → mở Zalo OA hoặc Telegram MODORO support
3. **Xem lại hướng dẫn** → reset empty states (clear localStorage → hiện lại CTA)

### Nút "Hướng dẫn" per-tab header

Mỗi tab header có nút nhỏ "Hướng dẫn" → mở 1 modal đơn giản với:
- 3-5 bullet points: tab này làm gì, cách dùng cơ bản
- 1 ảnh minh họa (screenshot)
- Nút "Đóng"

**Không phải help.html full page. Chỉ 1 modal nhỏ per tab.**

Content mỗi modal:

**Tổng quan:**
- Đây là trang chính, hiện hoạt động bot hôm nay
- Số khách mới, sự kiện, lịch sắp chạy
- Mục "Cần xử lý" hiện việc cần anh/chị xem

**Telegram:**
- Kênh chỉ huy — anh/chị ra lệnh, nhận báo cáo ở đây
- Gõ /menu trong Telegram để xem danh sách lệnh
- Bấm "Gửi tin test" để kiểm tra kết nối

**Zalo:**
- Bot tự trả lời khách nhắn Zalo
- Chọn "Chủ Zalo" để bot nhận diện anh/chị
- Tick nhóm nào bot được phép trả lời
- Nhân viên nhắn /pause khi muốn tự xử lý

**Tài liệu (Knowledge):**
- Thêm bảng giá, SOP, FAQ → bot thông minh hơn
- Bấm "Thêm" để tạo folder mới
- Bot tự đọc và dùng khi khách hỏi

**Lịch tự động:**
- 8 lịch mặc định đang chạy
- Nhắn bot trên Telegram để tạo lịch mới
- Bấm vào lịch để xem chi tiết hoặc test

## 4. Rename jargon

| Cũ (developer) | Mới (CEO) |
|---|---|
| Knowledge | Tài liệu |
| Upload | Thêm |
| Cron | Lịch tự động |
| Debug | Kiểm tra |
| Log | Hoạt động |
| Provider | Nhà cung cấp AI |
| Combo | Cấu hình AI |
| Gateway | Hệ thống |

**Áp dụng trong:** sidebar labels, page headers, button text, tooltips, empty states.

## 5. Post-onboarding nudges (tuần đầu)

Hiện banner nhẹ trên Overview khi detect CEO chưa dùng feature:

| Ngày | Condition | Nudge |
|---|---|---|
| 2 | Knowledge rỗng | "Bot sẽ trả lời tốt hơn nếu có tài liệu. Thêm bảng giá?" |
| 4 | Chưa tạo custom cron | "Muốn bot nhắc việc tự động? Nhắn Telegram: nhắc anh uống nước mỗi 2h" |
| 7 | Chưa chọn chủ Zalo | "Chọn tài khoản Zalo cá nhân để bot nhận diện anh là chủ" |

**Dismiss:** bấm "x" → không hiện lại nudge đó. Max 1 nudge/ngày.

**Detect "ngày":** đếm số ngày distinct có audit event (proxy cho "CEO đã dùng app N ngày").

## Implementation

### Files:
```
electron/ui/
├── dashboard.html   ← Smart empty states, tooltips, help modals, nudges
└── styles.css       ← Tooltip CSS, empty state CSS
electron/main.js     ← get-onboarding-status IPC, nudge logic
```

### Phase 1 (ship first, 3h):
- Smart empty states cho Overview, Knowledge, Zalo, Lịch tự động
- Tooltip CSS component + 10 tooltips trên elements quan trọng
- Nút "Hỗ trợ" góc dưới phải (3 options)

### Phase 2 (2h):
- Per-tab "Hướng dẫn" modal (7 modals, mỗi cái 5 bullets)
- Post-onboarding nudges (3 nudges, tuần đầu)

### Phase 3 (1h):
- Rename jargon across toàn app (sidebar, headers, buttons)
- Video walkthrough link (quay khi app ổn định)

## Không làm
- ~~help.html full page~~ → modal nhỏ per tab
- ~~Tour popups 14 bước~~ → tooltips + empty states
- ~~Checklist 5 bước~~ → smart empty states tự biến mất
