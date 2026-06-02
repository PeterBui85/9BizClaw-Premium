---
name: document-creation
description: Tạo/sửa file DOCX/XLSX/PPTX/PDF bằng runtime bundled + upload Google Drive — CHỈ CEO Telegram
metadata:
  version: 1.0.0
  moved_from: AGENTS.md (Document creation pipeline + Google Sheets/Docs/Slides)
---

# Tạo / sửa tài liệu — DOCX / XLSX / PPTX / PDF

Đọc skill này khi CEO yêu cầu tạo hoặc sửa file Office/PDF. Deep JS API cho từng định dạng nằm trong skill Anthropic tương ứng (`skills/anthropic-docx/SKILL.md`, `skills/anthropic-pptx/SKILL.md`, `skills/anthropic-xlsx/SKILL.md`, `skills/anthropic-pdf/SKILL.md`) — đọc thêm khi cần chi tiết API.

## Tạo mới (CREATE)

1. Đọc skill file phù hợp (Anthropic skill) cho định dạng cần tạo.
2. Tạo file local bằng runtime bundled: DOCX `docx`, XLSX `xlsx`, PPTX `pptxgenjs`, PDF `pdfkit`. Chỉ dùng Python package khi đã kiểm tra sẵn runtime/thư viện.
3. Upload lên Google Drive: `gog drive upload <file> --convert --name=<tên> -y`
4. Trả link Google Sheets / Google Docs / **Google Slides** cho CEO. PPTX `--convert` → Google Slides link. XLSX `--convert` → Google Sheets link. DOCX `--convert` → Google Docs link. Workflow yêu cầu "link slide/sheet/doc" = PHẢI có link Drive đã convert, KHÔNG được chỉ trả local path.

**Google Sheet mới:** luôn tạo file `.xlsx` local trên máy bằng runtime bundled rồi upload/convert qua `gog drive upload <file.xlsx> --convert --name=<tên> -y`. KHÔNG tạo Sheet mới bằng `/api/google/sheets/create` hoặc `/api/google/sheets/create-formatted` trong task CEO. API Google Sheets chỉ dùng cho thao tác đơn giản trên Sheet đã có: đọc, sửa ô/vùng, append dòng, format, freeze, number-format, hoặc xóa khi có route xóa hợp lệ. File cần có header, freeze/filter/width/wrap cơ bản ngay trong XLSX trước khi upload.

## Sửa file có sẵn (EDIT)

- XLSX: `python scripts/xlsx_unpack.py` → unpack → edit XML → `python scripts/xlsx_pack.py`
- DOCX: `python-docx` load + modify + save
- PPTX: `pptxgenjs` load + modify + save

## Chi tiết tool

- XLSX: mặc định `xlsx` Node package bundled; `openpyxl` chỉ là advanced fallback khi Python package có sẵn
- DOCX: `docx` Node.js v9.6.1 bundled — đọc Anthropic `skills/anthropic-docx/SKILL.md` cho JS API, DXA widths, ShadingType.CLEAR
- PPTX: `pptxgenjs` v4 bundled — đọc Anthropic `skills/anthropic-pptx/SKILL.md` cho thiết kế slide đẹp, color palette
- PDF: mặc định `pdfkit` Node package bundled; `reportlab`/`pypdf` chỉ là advanced fallback khi Python package có sẵn

**Docs (Word):** Format chuyên nghiệp: heading, table, bullet points. KHÔNG plain text dump.
**Slides (PowerPoint):** Layout sạch, font nhất quán, slide master. KHÔNG đặt text tràn slide.

## Runtime JS cho file Office/PDF

KHÔNG dùng raw host exec `node -e` để `require("docx")`, `require("xlsx")`, `require("pptxgenjs")` hoặc `require("pdfkit")` vì host exec có thể không nhận bundled `NODE_PATH`. Dùng `POST /api/skill/test-exec` với `{ "runtime": "node", "code": "..." }`; skill runner tự inject bundled Node và `vendor/node_modules`.

## Quy tắc Anthropic PPTX đặc biệt

- MÀU không dùng `#` prefix (e.g. `"FF0000"` chứ không `"#FF0000"`)
- Shadow dùng `opacity` property, KHÔNG encode trong hex string
- `bullet: true` thay vì unicode bullet `•`
- `breakLine: true` giữa các text runs
- Shadow object KHÔNG reuse — luôn tạo fresh object mỗi lần

## Upload pattern

`gog drive upload <path> --convert --name=<display-name> -y`
- `.xlsx` + `--convert` → native Google Sheets (interactive)
- `.docx` + `--convert` → native Google Docs (editable)
