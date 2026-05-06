---
name: workspace-api
description: Workspace API port 20200 — doc/ghi/list file noi bo
metadata:
  version: 3.0.0
  added: customer-memory-write, ceo-rules-write endpoints
---

# Workspace API — doc/ghi file noi bo

Cung server port 20200. Phien Telegram CEO tu xac thuc khi `web_fetch` goi API local. KHONG doc `cron-api-token.txt`, KHONG them `token=<token>`.

## Doc file (khong can token)

```
web_fetch http://127.0.0.1:20200/api/workspace/read?path=.learnings/LEARNINGS.md
```

Whitelist: `LEARNINGS.md`, `.learnings/LEARNINGS.md`, `memory/*.md`, `memory/zalo-users/*.md`, `memory/zalo-groups/*.md`, `knowledge/*/index.md`, `IDENTITY.md`, `schedules.json`, `custom-crons.json`, `logs/cron-runs.jsonl`.

## Ghi hồ sơ khách hàng

```
web_fetch "http://127.0.0.1:20200/api/customer-memory/write?senderId=<zalo-id>&content=<noi-dung>"
```

- `senderId`: Zalo ID (18-19 so)
- `content`: noi dung append, max 2000 bytes
- Chi ghi vao `memory/zalo-users/<senderId>.md` — append-only
- CEO notify Telegram sau moi lan ghi (tru daily-cron)
- Audit: `logs/customer-memory-writes.jsonl`

## Ghi rule tu CEO (CHINH)

```
web_fetch "http://127.0.0.1:20200/api/ceo-rules/write?content=<noi-dung-rule>"
```

**API TU DONG phan loai va ghi vao dung file — bot chi can truyen content:**

| Noi dung | Duoc ghi vao |
|---|---|
| Rule ban hang: giam gia, VIP, upsell, shipping, policy | `knowledge/sales-playbook.md` |
| Loi sai/nham: "bot lam sai", "nham roi" | `.learnings/ERRORS.md` |
| Bai hoc/nho: "tu dong phai", "moi khi" | `.learnings/LEARNINGS.md` |
| Mau cau tra loi: script, template reply | `knowledge/scripts/<slug>.md` |
| Rule rieng cua khach (co ID) | `memory/zalo-users/<id>.md` |

- Append-only, max 4000 bytes
- CEO xac nhan qua Telegram sau khi ghi
- Audit: `logs/ceo-rules-writes.jsonl`
- Skip neu cung content da ton tai (idempotent)

## Append vao LEARNINGS.md (chi dung cho learnings, khong dung cho rule)

```
web_fetch http://127.0.0.1:20200/api/workspace/append?path=.learnings/LEARNINGS.md&content=L-042+...
```

Max 2000 bytes. Chi LEARNINGS.md.

## Them Knowledge FAQ

```
web_fetch http://127.0.0.1:20200/api/knowledge/add?category=san-pham&title=Chinh+sach+tra+gop&content=Noi+dung+FAQ
```

Category: `cong-ty`, `san-pham`, `nhan-vien`. Append vao `knowledge/<category>/index.md`.

## Liet ke file

```
web_fetch http://127.0.0.1:20200/api/workspace/list?dir=memory/zalo-users/
```

Whitelist: `.learnings/`, `memory/`, `memory/zalo-users/`, `memory/zalo-groups/`, `knowledge/*/`.

## Bao mat

- System files (AGENTS.md, IDENTITY.md, SOUL.md, skills/, prompts/) bi chan o muc API
- Prompt injection da duoc sanitize truoc khi ghi
- CEO giam sat: notification Telegram + audit log
- Idempotent: khong ghi trung noi dung
