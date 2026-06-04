---
name: workspace-api
description: Workspace API port 20200 — đọc/ghi/list file nội bộ
metadata:
  version: 3.2.0
  added: customer-memory-write, ceo-rules-write endpoints
---

# Workspace API — đọc/ghi file nội bộ

⚠️ **QUAN TRỌNG: Tất cả nội dung tiếng Việt trong workspace này phải viết CÓ DẤU đầy đủ.**
Sai dấu hoặc không dấu → context bị sai → bot trả lời không đúng.
Hướng dẫn đúng: "khách hỏi về giao hàng nhanh" chứ KHÔNG "khach hoi ve giao hang".

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

## Hồ sơ khách hàng Zalo — TỰ ĐỘNG (không gọi API)

Hồ sơ khách Zalo (`memory/zalo-users/<id>.md`) được **hệ thống tự động cập nhật** từ
lịch sử chat thật (`lib/customer-memory-updater.js`, quét mỗi 3 phút). **KHÔNG** cần
và **KHÔNG** được gọi API để ghi — endpoint cũ `/api/customer-memory/write` đã bị bỏ.

Nếu CEO muốn **dặn thêm** một thông tin về khách (tên, sở thích cụ thể), dùng endpoint
ghi rule bên dưới — hệ thống tự định tuyến "khách + tên/id" vào `memory/zalo-users/<id>.md`.

## Ghi rule từ CEO (CHÍNH)

```
web_fetch "http://127.0.0.1:20200/api/ceo-rules/write?content=<nội-dung-rule>"
```

**⚠️ TIẾNG VIỆT CÓ DẤU BẮT BUỘC:**
- ĐÚNG: "khách hỏi về giao hàng nhanh thì trả lời có và báo thời gian"
- SAI: "khach hoi ve giao hang nhanh thi tra loi co va bao thoi gian"
- Không dấu → context sai → bot không học đúng, trả lời sai

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
# Cron: tạo/list/xóa
web_fetch "http://127.0.0.1:20200/api/cron/create?label=<tên>&cronExpr=<cron>&groupId=<id>&content=<nội-dung>"
web_fetch http://127.0.0.1:20200/api/cron/list
web_fetch http://127.0.0.1:20200/api/cron/delete?id=<cronId>

# Google Sheets
web_fetch "http://127.0.0.1:20200/api/google/sheets/append?spreadsheetId=<id>&range=Sheet1&valuesJson=[[\"Ngày\",\"Danh mục\",\"Giá trị\"]]"
```

## Quản lý đơn hàng

```
POST /api/order/create     {"customer":"Tên","items":[{"name":"SP","qty":1,"price":100000}],"note":""}
GET  /api/order/list       ?status=pending&from=2026-05-01
POST /api/order/update     {"orderId":"ORD-...","status":"confirmed","note":"Đã xác nhận"}
GET  /api/order/summary    ?from=2026-05-01&to=2026-05-31
```

Lifecycle: `new` -> `confirmed` -> `paid` -> `delivered` -> `completed` | `cancelled`

## Quản lý tồn kho

```
POST /api/inventory/adjust {"sku":"SP001","name":"Tên SP","qty":10,"type":"in","note":"Nhập kho"}
GET  /api/inventory/check  ?sku=SP001  (hoặc không param = toàn bộ)
GET  /api/inventory/alerts (SP dưới mức tối thiểu)
```

## Nghỉ phép / Chấm công

```
POST /api/leave/request    {"employee":"Linh","type":"annual","from":"2026-05-20","to":"2026-05-21","note":""}
GET  /api/leave/list       ?month=2026-05&employee=Linh
GET  /api/leave/summary    ?month=2026-05
```

## ⚠️ Nhắc nhở về tiếng Việt

Tất cả nội dung ghi vào workspace phải **CÓ DẤU đầy đủ**. Nếu ghi không dấu (ví dụ: "trả lời khách nhanh"), context bị sai → bot trả lời không đúng. Luôn dùng đầy đủ dấu: â, ă, ê, ô, ơ, ư, ơ, ư, ạ, ả, ấ, ầ, ẩ, ẫ, ậ, ắ, ằ, ẳ, ẵ, ặ, ế, ề, ể, ễ, ệ, ớ, ờ, ở, ỡ, ợ, ứ, ừ, ử, ữ, ự.
