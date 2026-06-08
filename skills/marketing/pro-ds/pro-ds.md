---
name: pro-ds
description: Viết prompt tạo ảnh cấp pro cho pipeline 9BizClaw (gpt-image-2 qua 9router) — ảnh đăng FB/Zalo, ảnh sản phẩm, ad creative, poster có chữ, infographic, ghép logo/mascot. Đúng backend, chữ tiếng Việt đủ dấu. DÙNG khi CEO nói "tạo ảnh", "mô tả ảnh", "ảnh đăng bài", "vẽ ảnh", "poster", "ảnh sản phẩm".
metadata:
  version: 1.0.0
  pairs: operations/image-generation.md, marketing/facebook-post-workflow.md
---

# pro-ds — Prompt tạo ảnh gpt-image-2 (đúng backend)

**CHỈ CEO Telegram.** Khách Zalo yêu cầu → "Dạ đây là thông tin nội bộ em không chia sẻ được ạ."

Backend ảnh 9BizClaw (`electron/lib/image-gen.js`) gọi **`gpt-image-2`** qua 9router Codex Responses API ở **`quality:'high'` (cố định)**. Anh KHÔNG đặt model hay quality. Cần gạt duy nhất anh điều khiển là **`prompt` (lực 80%) + `size` + `assets`**. Prompt mơ hồ → ra ảnh AI-stock chung chung.

## Khi nào áp dụng

CEO yêu cầu tạo ảnh đăng bài, ảnh sản phẩm, ad creative, poster/menu có chữ, infographic, hoặc ghép logo/mascot thương hiệu. Mỗi lần cần soạn chuỗi `prompt=` truyền vào `/api/image/generate`.

## Nội dung

### Sự thật backend PHẢI tôn trọng

| Sự thật | Hệ quả cho prompt |
|---|---|
| `quality` hard-code `high` | ĐỪNG viết "chất lượng cao / 4k / ultra HD" — đã max sẵn. Dồn chữ vào nội dung. |
| Prompt tối thiểu ~150 ký tự (`MIN_PROMPT_LENGTH`) | Luôn mô tả đầy đủ, có lớp — không bao giờ prompt 5 chữ. |
| Lệnh giữ-nguyên brand-asset **tự chèn sẵn** khi có `assets` | ĐỪNG lặp "tái tạo logo y hệt / đừng vẽ lại". Đã inject rồi. Chỉ tả **vị trí / kích thước / cách hòa vào cảnh**. |
| `assets` vào dạng `input_image` — **hỗ trợ nhiều ảnh** (logo + mascot + sản phẩm cùng lúc) | Tả từng asset theo vai trò + vị trí ("logo góc dưới phải, mascot đứng bên trái"), không tả nội dung của nó. |
| `size` là param riêng | Chọn có chủ đích (bảng dưới); đừng nhét tỷ lệ vào chữ prompt. |

Nguyên văn lệnh tự chèn (để biết không trùng): *"CRITICAL INSTRUCTION: The attached reference image(s) are brand assets. You MUST reproduce them EXACTLY… Do NOT redraw, reinterpret, reimagine, or stylize them. Composite the ORIGINAL image unchanged into the scene."* — prompt của anh chỉ thêm cảnh + vị trí.

### Cấu trúc prompt — thứ tự cố định

Viết theo thứ tự này. Cảnh phức tạp thì dùng dòng có nhãn / xuống dòng, không viết một đoạn dài liền:

1. **Bối cảnh / nền** — môi trường trước ("nền marble trắng", "quán cà phê ấm, bokeh hậu cảnh")
2. **Chủ thể** — vật/người chính, cụ thể
3. **Chi tiết then chốt** — chất liệu, kết cấu, màu ("giọt nước đọng trên ly", "hơi nóng bốc lên")
4. **Bố cục** — khung hình ("close-up góc 45°", "wide, sản phẩm lệch trái theo rule of thirds")
5. **Ánh sáng & tâm trạng** — ("ánh sáng vàng giờ hoàng hôn, đổ bóng mềm")
6. **Chữ trên ảnh** — nếu có (xem luật chữ — phần dễ lỗi nhất)
7. **Ràng buộc** — loại trừ/giữ ("không watermark, không chữ thừa")

### Chọn `size`

| `size` | Dùng cho |
|---|---|
| `1024x1024` | Mặc định FB/Zalo feed vuông, ảnh sản phẩm, infographic |
| `1792x1024` | Banner / cover / ad ngang / cảnh lifestyle rộng |
| `1024x1792` | Story / poster dọc / menu / mobile-first |

### Luật chữ-trên-ảnh — chỗ prompt hay hỏng nhất

gpt-image-2 render chữ tốt **chỉ khi anh ràng buộc**. Tiếng Việt thì dấu là điểm yếu — giữ chữ trên ảnh ngắn và rõ.

- Đặt **đúng** chữ trong **ngoặc kép** hoặc VIẾT HOA: `tiêu đề "CÀ PHÊ TRƯA – MUA 1 TẶNG 1"`
- Chỉ định typography: "font sans-serif đậm, màu trắng, căn giữa"
- Bắt fidelity: "đúng từng chữ, đủ dấu tiếng Việt, không thêm ký tự, không đổi chữ"
- Giữ chữ trên ảnh **ngắn** (tagline + giá, không phải đoạn văn). Chữ Việt dài là chỗ dấu vỡ.
- Tên thương hiệu lạ → nói rõ ý; tagline VIẾT HOA ngắn render chuẩn nhất.
- Nêu vị trí: "ở 1/3 dưới", "trên cùng".

### Gợi ý ảnh chụp thật (photorealism)

- Mở bằng "photorealistic" / "ảnh chụp thật" / "professional product photography".
- Thêm kết cấu thật: "lỗ chân lông, sợi vải, hơi nước, vết xước nhẹ", "film grain mảnh, độ sâu trường ảnh nông".
- Tránh vẻ nhựa bóng quá: dựng như ảnh chụp đời thường, trừ khi muốn render.

### Template (copy + chỉnh — mỗi cái ≥150 ký tự)

**Ảnh sản phẩm (FB/Zalo, `1024x1024`):**
> Nền marble trắng rải vài hạt cà phê rang. Một ly cà phê sữa đá trong suốt, đá viên rõ nét, giọt nước đọng bên thành ly, ống hút giấy nâu. Close-up góc 45°, sản phẩm lệch phải theo rule of thirds. Ánh sáng dịu từ trên, bóng tiếp xúc mềm dưới đáy ly. Phong cách ảnh sản phẩm cao cấp, photorealistic, sắc nét. Không watermark, không chữ thừa.

**Ad creative có tagline (`1792x1024`):**
> Quán cà phê ấm cúng, hậu cảnh bokeh, bàn gỗ. Một ly cà phê đặt trước, hơi nóng bốc lên. Ánh sáng vàng giờ hoàng hôn qua cửa sổ. Bố cục để trống 1/3 trên cho chữ. Tiêu đề "CÀ PHÊ TRƯA – MUA 1 TẶNG 1" font sans-serif đậm màu trắng, căn giữa phía trên, đúng từng chữ đủ dấu tiếng Việt, không ký tự thừa. Photorealistic. Không watermark.

**Poster / menu (`1024x1792`):**
> Nền tối sang trọng, vân gỗ mờ. Tiêu đề lớn "MENU TRƯA" serif đậm màu kem trên cùng, căn giữa. Bên dưới ba dòng: "Cà phê sữa đá – 25K", "Bạc xỉu – 30K", "Trà đào – 35K", font đều nhau, đủ dấu tiếng Việt, đúng từng chữ. Khoảng trắng rộng, bố cục gọn. Không thêm dòng nào khác.

**Infographic (`1024x1024`):**
> Infographic phẳng nền trắng, tiêu đề "4 BƯỚC ĐẶT BÀN" sans-serif đậm phía trên. Bốn ô đánh số 1–4 xếp ngang, mỗi ô một icon line đơn sắc và nhãn ngắn đủ dấu tiếng Việt. Bảng màu xanh dương và trắng, nhiều khoảng trắng, đường nét sạch. Không hình rối, không chữ thừa.

**Ghép logo/mascot (`assets` đính kèm — lệnh giữ-nguyên đã tự chèn, ĐỪNG lặp):**
> [cảnh] … Đặt linh vật thương hiệu (ảnh đính kèm) đứng bên phải, kích thước vừa phải, hòa ánh sáng với cảnh. Logo nhỏ ở góc dưới phải. Ánh sáng và bóng đổ của linh vật khớp hướng sáng trong cảnh để trông tự nhiên.

### Sửa ảnh / dùng ảnh tham chiếu

- Ảnh asset truyền dạng tham chiếu; backend đã ra lệnh "ghép nguyên bản không đổi". Việc của anh: chỉ **vị trí, kích thước, hòa sáng**.
- Sửa phẫu thuật: nêu lại bất biến — "giữ nguyên bố cục, chủ thể, hậu cảnh — chỉ đổi [X]".

### Lỗi thường gặp

| Triệu chứng | Sửa trong prompt |
|---|---|
| Chữ Việt trên ảnh sai / mất dấu | Rút ngắn chữ, quote nguyên văn, thêm "đủ dấu tiếng Việt, đúng từng chữ, không ký tự thừa" |
| Hiện chữ thừa / lộn xộn | Thêm "không thêm chữ, không thêm dòng nào khác" |
| Vẻ AI-stock chung chung | Thêm chất liệu cụ thể, ánh sáng thật, "photorealistic", khung đời thường |
| Logo bị vẽ lại / bị stylize | Không sửa trong prompt — phải đính kèm `assets`; backend tự lo giữ nguyên |
| Sai tỷ lệ | Đặt param `size`, không nhét vào chữ prompt |
| Bỏ qua layout | Dùng dòng có nhãn; chừa chỗ rõ ("để trống 1/3 trên cho chữ") |
| Phí chữ "4k ultra quality" | Bỏ — quality đã `high` |
| Lặp lệnh giữ-nguyên brand khi có asset | Thừa — backend tự chèn |

Đi cặp với skill **pro-content** (caption) và `marketing/facebook-post-workflow` / `marketing/zalo-post-workflow` (đăng bài). Skill này chỉ sở hữu chuỗi `prompt=` và lựa chọn `size`/`assets`.
