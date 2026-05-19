---
name: docx-creator
description: Tạo/sửa/format file Word DOCX chuyên nghiệp. Trigger khi CEO nói "tạo file word", "làm báo giá", "soạn hợp đồng", "viết báo cáo", "format file", "làm đẹp file word", "xuất file docx"
metadata:
  version: 1.0.0
triggers:
  - word
  - docx
  - "báo giá"
  - "hợp đồng"
  - "báo cáo"
  - "đề xuất"
  - proposal
  - report
  - contract
  - "file word"
  - "soạn văn bản"
  - "xuất file"
---

# DOCX Creator — Tạo văn bản Word chuyên nghiệp

CHỈ trigger khi CEO nói rõ "file Word", "file docx", "xuất file". Nếu CEO chỉ nói "báo giá" không nhắc file → dùng skill báo-giá.

CHỈ CEO Telegram. Khách Zalo → "Dạ đây là thông tin nội bộ ạ."

## Pipeline routing

```
CEO yêu cầu
├─ Không có file input → Pipeline A: TẠO MỚI
│   "viết báo giá", "soạn hợp đồng", "tạo báo cáo", "làm proposal"
│   → Đọc references/aesthetic-recipes.md chọn template phù hợp
│   → Generate Node.js script với docx@9.6.1
│
└─ Có file input (.docx)
    ├─ Sửa nội dung → Pipeline B: SỬA
    │   "thêm mục X", "đổi tên công ty", "cập nhật giá"
    │   → Đọc file bằng /api/file/read → sửa → ghi lại
    │
    └─ Format/làm đẹp → Pipeline C: FORMAT
        "format lại", "làm đẹp", "đổi font", "chỉnh margin"
        → Đọc file → áp dụng style từ aesthetic recipe → ghi lại
```

## Quy trình 4 bước

### Bước 1: Xác định loại văn bản
- Báo giá / invoice → recipe **Modern Corporate**
- Hợp đồng / công văn → recipe **Vietnamese Business**
- Báo cáo / proposal → recipe **Modern Corporate**
- Creative brief / pitch → recipe **Minimal Modern**

### Bước 2: Đọc references
```
read_file skills/operations/docx/references/node-docx-api.md
read_file skills/operations/docx/references/aesthetic-recipes.md
```

### Bước 3: Generate + run script
```javascript
// Tạo script tại workspace
const script = `
const { Document, Packer, ... } = require('docx');
// ... code từ reference ...
`;
// Ghi script
web_fetch http://127.0.0.1:20200/api/file/write?path=C:/Users/CEO/Desktop/gen-doc.js&content=...
// Chạy script
web_fetch http://127.0.0.1:20200/api/exec?command=node+C:/Users/CEO/Desktop/gen-doc.js
// Xóa script temp
web_fetch http://127.0.0.1:20200/api/exec?command=del+C:/Users/CEO/Desktop/gen-doc.js
```

### Bước 4: Báo CEO
"Em đã tạo file [tên-file].docx trên Desktop anh. Mở Word xem nha."

## Quy tắc

- LUÔN lưu file lên Desktop CEO: `require('os').homedir() + '/Desktop/'`
- LUÔN dùng tiếng Việt có dấu trong nội dung văn bản
- KHÔNG dùng emoji trong văn bản
- KHÔNG dùng font decorative — chỉ Calibri, Arial, hoặc Times New Roman
- Số tiền: format 1,000,000 VND (dấu phẩy ngăn hàng)
- Ngày: dd/MM/yyyy
- LUÔN có header (tên công ty) và footer (số trang)
