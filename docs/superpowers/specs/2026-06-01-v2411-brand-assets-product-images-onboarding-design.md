# Spec v2.4.11 — Brand Assets, Product Images, Premium Onboarding

**Date:** 2026-06-01
**Status:** Post-brainstorm. Spec written from 11:20 AM brainstorming decisions.
**Brainstorm session:** `8435e3cc-021c-455d-b59b-220808fd1f51` (partial, cut off during design presentation before spec written)

---

## TL;DR (vi)

v2.4.11 có 3 feature mới:

1. **Brand assets (tài sản thương hiệu)** — upload logo/mascot/template → vision tự sinh mô tả nháp + tags để bot gợi ý khi tạo ảnh. **Cấm tuyệt đối** gửi cho khách.

2. **Hình ảnh sản phẩm (multi-channel)** — đổi tên "Hình sản phẩm cho Zalo" → "Hình ảnh sản phẩm"; batch upload nhiều ảnh cùng lúc với tags chung; vision mô tả "siêu kỹ" (đặc tính, giá, màu, bao bì, góc chụp); bot search và gửi tối đa 5 ảnh cho khách khi match đủ chắc; không chắc → hỏi 1 câu phân giải.

3. **Premium onboarding 7 ngày** — sau wizard setup xong, 7 ngày tiếp theo gợi ý năng lực Premium (Dashboard + Telegram). Bán cá nhân hóa (khung cố định, text thay theo ngành + trạng thái đã setup). Không bắt buộc.

---

## 1. Problem (why this matters)

### 1A — Brand assets: bot không biết gợi ý khi tạo ảnh

Hiện CEO upload brand assets (logo, mascot) nhưng bot không có cách gợi ý asset phù hợp khi CEO yêu cầu tạo ảnh. Không có metadata → gợi ý bừa hoặc không gợi. Brand assets lộn vào kết quả khi khách xin hình → sai hoặc leak thương hiệu.

### 1B — Hình ảnh sản phẩm: quality không đủ, UX batch không có, vision mô tả chung chung

- Vision prompt hiện tại quá chung, không bắt đặc tính sản phẩm/giá/màu/bao bì/góc chụp.
- Không hỗ trợ upload nhiều ảnh cùng lúc → CEO phải upload từng ảnh.
- Tên tab "Hình sản phẩm cho Zalo" hàm ý chỉ dùng cho Zalo, thực tế cần dùng đa kênh.
- Không có ngưỡng match → bot có thể gửi nhầm ảnh.

### 1C — Premium onboarding: CEO không biết bot làm được gì

Sau khi setup xong, CEO không có hướng dẫn step-by-step về năng lực Premium. Không biết tạo slide, đăng Facebook tự động, tạo plan marketing, tạo báo giá. Kết quả: CEO dùng 20% tính năng.

---

## 2. Decisions Made (brainstorm — 2026-06-01)

### 2A — Brand Assets

| Decision | Answer |
|---|---|
| Mô tả tạo khi nào | Upload xong → vision tự đọc → lưu nháp `needs_review` → bot dùng được ngay |
| Gửi cho khách | **Cấm tuyệt đối** — brand assets không bao giờ xuất hiện trong search gửi khách |
| Source | `type=brand`, `visibility=internal` cố định |
| Mục đích duy nhất | Reference để tạo ảnh (image-gen suggestion) |

### 2B — Hình ảnh sản phẩm

| Decision | Answer |
|---|---|
| Source | `type=product` + `knowledge_image` |
| Match bắt buộc | **Cả tags/aliases (từ khóa) VÀ description (semantic)** — cả 2 đều phải match |
| Số ảnh max | **5 ảnh/lần** |
| Upload batch | Tags/aliases chung cho cả batch (optional) + vision siêu kỹ từng ảnh |
| Vision siêu kỹ | Mô tả: đặc tính sản phẩm, giá nhìn thấy, màu, biến thể, bao bì, góc chụp, "cụm từ khách hay hỏi" |
| Match uncertain | Hỏi 1 câu phân giải (ví dụ "anh/chị muốn bảng giá hay hình mẫu thực tế?") |
| No match | Text reply + "có thể chuyển sếp" |
| Visibility | `visibility=public` cố định (không cần lựa chọn) |

### 2C — Premium Onboarding

| Decision | Answer |
|---|---|
| Kênh | Dashboard + Telegram (Dashboard là trung tâm, Telegram nhắc nhẹ mỗi ngày) |
| Start trigger | Wizard setup xong / app sẵn sàng lần đầu |
| Personalization | Bán cá nhân hóa — khung 7 ngày cố định, text thay theo ngành + trạng thái đã setup |
| Format | Dashboard card "Ngày N/7" + CTA; Telegram 1 tin/ngày rất ngắn + CTA (không spam) |
| Bắt buộc? | Không — chỉ gợi ý |

---

## 3. Architecture

### 3A — Brand Assets

```
Brand Asset Upload
  → save to brand-assets/ + register media-asset (type=brand, visibility=internal)
  → async vision.describeMediaAsset() (brand-specific prompt: màu sắc, typography, bố cục, reference usage)
  → auto-generate tags/aliases từ mô tả
  → status = needs_review (bot dùng được) hoặc ready (CEO đã duyệt)
  → API "gợi ý brand assets cho prompt" → chỉ trả type=brand → dùng cho image-gen

Guard: search/gửi khách (zalo/send-media, media/search) LỌC OUT type=brand hoàn toàn
```

### 3B — Hình ảnh sản phẩm

```
CEO Upload (batch)
  → modal: tags/aliases chung cho batch (optional) + SKU prefix (optional)
  → lưu từng ảnh: type=product, visibility=public cố định, tags từ batch
  → async vision.describeMediaAsset() (product-specific: siêu kỹ đặc tính, giá, màu, bao bì, góc chụp, cụm từ KH
  → status: indexing → ready

Bot Search (khách xin hình)
  → query match: tags/aliases (từ khóa) + description (semantic) — cả 2 phải match
  → score + ngưỡng: tối thiểu để gửi
  → match mạnh (1 kết quả): gửi tối đa 5 ảnh
  → match uncertain (>1 gần giống): hỏi 1 câu phân giải
  → match yếu: text reply + "có thể chuyển sếp"
```

### 3C — Premium Onboarding 7 Ngày

```
Trigger: wizard setup complete → set premiumOnboarding.startedAt
Dashboard: card "Ngày N/7: [tiêu đề]" + CTA
Telegram: 1 tin/ngày rất ngắn + keyword → CEO nhắn keyword để thực hiện

Day framework (bán cá nhân hóa theo ngành + trạng thái setup):
  Day 1: "Bot của bạn đã live — đây là những gì em làm được"
  Day 2: "Thử: nhờ em soạn bài đăng Facebook"
  Day 3: "Thử: upload tài liệu sản phẩm để bot trả lời đúng"
  Day 4: "Thử: đặt báo cáo sáng mỗi ngày"
  Day 5: "Thử: nhờ em tạo plan marketing 1 tuần"
  Day 6: "Thử: nhờ em tạo slide báo giá"
  Day 7: "Bot đã sẵn sàng — khám phá tính năng nâng cao"
```

---

## 4. Data Model

### 4A — Brand Assets (tài sản thương hiệu)

```json
{
  "id": "uuid",
  "title": "Logo chính",
  "type": "brand",
  "visibility": "internal",
  "tags": ["logo", "primary"],
  "aliases": ["logo chính", "emblem"],
  "description": "Logo vector màu chính thức...",
  "status": "needs_review",
  "uploadedAt": "2026-06-01T00:00:00Z"
}
```

### 4B — Product Images (hình ảnh sản phẩm)

```json
{
  "id": "uuid",
  "title": "iPhone 15 Pro Max - Màu Titan Tự Nhiên",
  "type": "product",
  "visibility": "public",
  "tags": ["iphone 15", "điện thoại", "apple"],
  "aliases": ["smartphone", "điện thoại apple"],
  "sku": "IPH15PM-TITAN-NAT",
  "description": "iPhone 15 Pro Max màu Titan Tự Nhiên, 256GB...",
  "status": "indexing",
  "uploadedAt": "2026-06-01T00:00:00Z"
}
```

### 4C — Premium Onboarding State

```json
{
  "premiumOnboarding": {
    "startedAt": "2026-06-01T00:00:00Z",
    "currentDay": 3,
    "dismissed": false
  }
}
```

---

## 5. Files to Change

### Phase 1 — UI Batch Upload + Copy Change

| File | Change |
|---|---|
| `electron/ui/dashboard.html` | Đổi "Hình sản phẩm cho Zalo" → "Hình ảnh sản phẩm" + mô tả đa kênh |
| `electron/ui/dashboard.html` | Upload flow: batch upload → modal tags chung → upload từng ảnh với tags batch |
| `electron/ui/dashboard.html` | Thêm tab "Tài sản thương hiệu" (list + upload + gợi ý khi tạo ảnh) |
| `electron/preload.js` | IPC bridges cho brand assets: list, upload, delete, describe, suggest-for-prompt |
| `electron/lib/dashboard-ipc.js` | IPC handlers cho brand assets CRUD |

### Phase 2 — Vision Prompts + Search Safety

| File | Change |
|---|---|
| `electron/lib/media-library.js` | `describeMediaAsset()` tách prompt theo `type` (brand vs product) |
| `electron/lib/media-library.js` | Product vision: mô tả siêu kỹ đặc tính, giá, màu, bao bì, góc chụp, cụm từ KH hay hỏi |
| `electron/lib/media-library.js` | `searchMediaAssets()`: thêm ngưỡng match, filter type=product cho use-case khách |
| `electron/lib/media-library.js` | ENFORCE: type=brand không bao giờ trong kết quả gửi khách |

### Phase 3 — Premium Onboarding 7 Ngày

| File | Change |
|---|---|
| `electron/lib/dashboard-ipc.js` | Lưu `premiumOnboarding.startedAt` khi wizard complete |
| `electron/ui/dashboard.html` | Card "Ngày N/7" trên Overview |
| `electron/lib/cron-api.js` hoặc `electron/lib/premium-onboarding.js` | Telegram nudge logic: 1 tin/ngày, semi-personalized |

---

## 6. Acceptance Criteria

### 6A — Brand Assets

- [ ] Upload brand asset → vision tạo mô tả nháp trong ~30s
- [ ] Mô tả brand asset có: màu sắc, typography, bố cục, reference usage
- [ ] API gợi ý brand asset cho prompt tạo ảnh → trả đúng asset
- [ ] Query "logo" từ flow gửi khách → không trả kết quả

### 6B — Hình ảnh sản phẩm

- [ ] Upload 10 ảnh batch cùng lúc → tất cả có tags chung
- [ ] Vision mô tả siêu kỹ: chứa đặc tính, giá, màu, bao bì, góc chụp, cụm từ KH
- [ ] Search "bảng giá" → match đúng ảnh bảng giá
- [ ] Search "màu đen 256gb" → match đúng biến thể
- [ ] Match nhiều gần giống → hỏi 1 câu phân giải
- [ ] Match yếu → text + "có thể chuyển sếp"

### 6C — Premium Onboarding

- [ ] Wizard setup xong → Day 1 hiển thị trên Dashboard
- [ ] Dashboard hiện "Ngày N/7" với CTA
- [ ] Telegram nhận 1 tin/ngày rất ngắn (không spam)
- [ ] Nội dung bán cá nhân theo ngành + trạng thái setup
- [ ] Onboarding không bắt buộc (CEO có thể skip)

---

## 7. Anti-Patterns to Avoid

- **Không** dùng vision prompt chung cho brand và product — phải tách prompt riêng.
- **Không** gửi brand assets cho khách — filter ở mọi tầng (search, API, UI).
- **Không** batch ảnh quá 20 file/lần — giới hạn để tránh timeout.
- **Không** dùng search result score thấp để tự quyết định gửi — phải có ngưỡng + fallback hỏi CEO.
- **Không** spam Telegram onboarding — 1 tin/ngày, nội dung rất ngắn.
