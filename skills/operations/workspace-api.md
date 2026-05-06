---
name: workspace-api
description: Workspace API port 20200 — đọc/ghi/list file nội bộ
metadata:
  version: 3.1.0
  added: customer-memory-write, ceo-rules-write endpoints, diacritic enforcement
---

# Workspace API — đọc/ghi file nội bộ

⚠️ **QUAN TRỌNG: Tất cả nội dung tiếng Việt trong workspace này phải viết CÓ DẤU đầy đủ.**
Viết không dấu (ví dụ: "khach hoi ve giao hang") → bị API reject.
Hướng dẫn đúng: "khách hỏi về giao hàng nhanh".

## Server nội bộ

- **Port:** 20200
- **Auth:** Phiên Telegram CEO tự xác thực khi `web_fetch` gọi API local
- **⚠️ KHÔNG** đọc `cron-api-token.txt`, **KHÔNG** thêm `token=<token>` vào URL

## Đọc file (không cần token)

```
web_fetch http://127.0.0.1:20200/api/workspace/read?path=.learnings/LEARNINGS.md
```

**Whitelist paths:**
- `LEARNINGS.md`, `.learnings/LEARNINGS.md`
- `memory/*.md`, `memory/zalo-users/*.md`, `memory/zalo-groups/*.md`
- `knowledge/*/index.md`
- `IDENTITY.md`, `schedules.json`, `custom-crons.json`
- `logs/cron-runs.jsonl`

## Ghi hồ sơ khách hàng

```
web_fetch "http://127.0.0.1:20200/api/customer-memory/write?senderId=<zalo-id>&content=<nội-dung>"
```

**Parameters:**
- `senderId`: Zalo ID (18-19 số)
- `content`: **⚠️ TIẾNG VIỆT CÓ DẤU** — ví dụ: "khách hỏi về giao hàng nhanh", **KHÔNG phải** "khach hoi ve giao hang nhanh". Tối đa 2000 bytes.

**Kết quả:** Chỉ ghi vào `memory/zalo-users/<senderId>.md` — append-only (không ghi đè). CEO được notify qua Telegram sau mỗi lần ghi. Audit log: `logs/customer-memory-writes.jsonl`.

## Ghi rule từ CEO (CHÍNH)

```
web_fetch "http://127.0.0.1:20200/api/ceo-rules/write?content=<nội-dung-rule>"
```

**⚠️ TIẾNG VIỆT CÓ DẤU BẮT BUỘC:**
- ĐÚNG: "khách hỏi về giao hàng nhanh thì trả lời có và báo thời gian"
- SAI: "khach hoi ve giao hang nhanh thi tra loi co va bao thoi gian"
- Không dấu → bị API reject ngay lập tức

**API tự động phân loại và ghi vào đúng file:**
| Loại rule | File đích |
|-----------|-----------|
| Rule bán hàng / khách hàng | `knowledge/sales-playbook.md` |
| Lesson / học được / nhớ / tự động | `.learnings/LEARNINGS.md` |
| Lỗi / sai / bot nhầm | `.learnings/ERRORS.md` |
| Mẫu câu / script / reply template | `knowledge/scripts/<slug>.md` |

**Constraints:**
- Append-only — không ghi đè
- Tối đa 4000 bytes
- Idempotency: ghi trùng nội dung trong cùng ngày → skip
- CEO confirm qua Telegram sau khi ghi thành công

## Các endpoints khác

```
# Tạo cron
web_fetch "http://127.0.0.1:20200/api/cron/create?label=<tên>&cronExpr=<cron>&groupId=<id>&content=<nội-dung>"

# Danh sách cron
web_fetch http://127.0.0.1:20200/api/cron/list

# Xóa cron
web_fetch http://127.0.0.1:20200/api/cron/delete?id=<cronId>

# Google Sheets
web_fetch "http://127.0.0.1:20200/api/google/sheets/append?spreadsheetId=<id>&range=Sheet1&valuesJson=[[\"Ngày\",\"Danh mục\",\"Giá trị\"]]"
```

## ⚠️ Nhắc nhở về tiếng Việt

Tất cả nội dung ghi vào workspace phải **CÓ DẤU đầy đủ**. Nếu bạn ghi nội dung không dấu (ví dụ: "trả lời khách nhanh"), bot sẽ bị reject hoặc context sẽ sai. Luôn dùng đầy đủ dấu: â, ă, ê, ô, ơ, ư, ơ, ư, ạ, ả, ấ, ầ, ẩ, ẫ, ậ, ắ, ằ, ẳ, ẵ, ặ, ế, ề, ể, ễ, ệ, ớ, ờ, ở, ỡ, ợ, ứ, ừ, ử, ữ, ự.
