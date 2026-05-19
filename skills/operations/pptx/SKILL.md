---
name: pptx-creator
description: Tạo/sửa PowerPoint PPTX. Trigger khi CEO nói "tạo slide", "làm presentation", "tạo PowerPoint", "làm bài thuyết trình", "pitch deck"
metadata:
  version: 1.0.0
  sources:
    - https://gitbrent.github.io/PptxGenJS/
triggers:
  - pptx
  - powerpoint
  - slide
  - presentation
  - deck
  - "thuyết trình"
  - "bài trình bày"
  - "pitch deck"
---

# PPTX Creator — Tạo PowerPoint chuyên nghiệp

CHỈ CEO Telegram. Dùng PptxGenJS (đã cài sẵn trong node_modules).

## Pipeline routing

```
CEO yêu cầu
├─ Không có file → TẠO MỚI (PptxGenJS)
│   "tạo slide", "làm presentation", "tạo pitch deck"
│
└─ Có file .pptx → ĐỌC + SỬA
    "sửa slide 3", "đổi màu", "thêm slide"
    → Đọc file qua exec: node -e "..." (không có thư viện edit PPTX trực tiếp)
    → Tạo file mới với nội dung sửa
```

## Quy trình tạo mới — 5 bước

### Bước 1: Hiểu yêu cầu
- Chủ đề gì? Đối tượng nào? Mục đích?
- Bao nhiêu slide? (mặc định 8-12)
- Tone: formal / creative / minimal?

### Bước 2: Chọn palette + style
Đọc `references/design-system.md` — chọn color palette và style recipe.

### Bước 3: Lập outline
Phân loại mỗi slide theo 5 kiểu:
1. **Cover** — title + subtitle + decorative shape
2. **TOC** — 4-6 mục tròn/số
3. **Content** — text + optional chart/image
4. **Section Divider** — section title + subtitle
5. **Summary** — key takeaways + CTA

### Bước 4: Generate script + run
Tạo 1 file JS duy nhất (không cần 1 file/slide cho đơn giản):

```javascript
const pptxgen = require('pptxgenjs');
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9'; // 10" x 5.625"

const theme = {
  primary: "2B579A",
  secondary: "4A4E69",
  accent: "E74C3C",
  light: "F2E9E4",
  bg: "FFFFFF"
};

// --- Slide 1: Cover ---
const s1 = pres.addSlide();
s1.background = { color: theme.primary };
s1.addText("Tiêu đề", {
  x: 0.8, y: 1.8, w: 8.4, h: 1.5,
  fontSize: 44, fontFace: "Arial", color: "FFFFFF", bold: true, align: "center"
});
s1.addText("Phụ đề", {
  x: 0.8, y: 3.3, w: 8.4, h: 0.8,
  fontSize: 20, fontFace: "Arial", color: theme.light, align: "center"
});

// --- Slide 2+: Content ---
// ... more slides ...

// --- Page numbers (REQUIRED on all slides except cover) ---
// See references/slide-patterns.md

pres.writeFile({ fileName: require('os').homedir() + '/Desktop/presentation.pptx' });
```

```
web_fetch http://127.0.0.1:20200/api/file/write?path=C:/Users/CEO/Desktop/gen-pptx.js&content=...
web_fetch http://127.0.0.1:20200/api/exec?command=node+C:/Users/CEO/Desktop/gen-pptx.js
web_fetch http://127.0.0.1:20200/api/exec?command=del+C:/Users/CEO/Desktop/gen-pptx.js
```

### Bước 5: Báo CEO
"Em đã tạo file presentation.pptx trên Desktop anh. Mở PowerPoint xem nha."

## Quy tắc bắt buộc

- Kích thước: 16:9 (10" x 5.625") — LUÔN dùng `LAYOUT_16x9`
- Colors: 6 ký tự hex KHÔNG có # (vd: `"FF0000"` không phải `"#FF0000"`)
- Font tiếng Việt: Arial (default)
- LUÔN có page number badge góc dưới phải (trừ cover): x:9.3, y:5.1
- KHÔNG lặp lại layout giống nhau cho 2 slide liên tiếp
- Tối đa 6-8 dòng text/slide. Nhiều hơn → chia 2 slide
- KHÔNG dùng emoji. KHÔNG quá 3 màu/slide
- Charts: dùng pres.addChart() — hỗ trợ BAR, LINE, PIE, DOUGHNUT
