# Lich tu dong — Tham khao chi tiet

## File cau hinh

- `schedules.json` — built-in cron jobs (bot KHONG duoc ghi)
- `custom-crons.json` — CEO-created cron jobs (bot DUOC ghi khi CEO yeu cau)

## Built-in schedules

| Job | Thoi gian | Mo ta |
|-----|-----------|-------|
| morning | 07:30 | Bao cao sang |
| evening | 21:00 | Bao cao toi |
| weekly | T2 08:00 | Tong ket tuan |
| monthly | ngay-1 08:30 | Tong ket thang |
| zalo-followup | 09:30 | Follow up Zalo |
| heartbeat | 30 phut | Kiem tra he thong |
| meditation | 01:00 | Don dep |
| memory-cleanup | CN 02:00 | Don dep memory (OFF) |

## Tao / sua / xoa custom cron

Bot DUOC GHI `custom-crons.json` khi CEO yeu cau qua Telegram.

### Format JSON bat buoc

```json
[
  {
    "id": "unique-id-slug",
    "label": "Ten hien thi (tieng Viet, khong emoji)",
    "cronExpr": "0 9 * * 1-5",
    "prompt": "exec: openzca msg send <groupId> \"<noi dung>\" --group",
    "enabled": true
  }
]
```

### Quy trinh tao cron

1. CEO nhan Telegram: "tao cron gui nhom X moi sang 9h noi dung Y"
2. Bot doc `custom-crons.json` hien tai (co the rong `[]`)
3. Bot tra `groups.json` lay groupId theo ten nhom CEO noi
4. Bot CONFIRM voi CEO truoc khi ghi: "Em se tao cron [label] chay luc [gio] gui [ten nhom]. Anh xac nhan nhe?"
5. CEO xac nhan -> bot APPEND entry moi vao array hien tai, ghi lai file
6. He thong tu dong reload cron trong vai giay

### Gui nhieu nhom (broadcast)

GroupId cach nhau dau phay, KHONG co khoang trang:

```json
{
  "id": "morning-broadcast",
  "label": "Chao sang nhom khach",
  "cronExpr": "0 9 * * 1-5",
  "prompt": "exec: openzca msg send 111,222,333 \"Chao buoi sang! Chuc anh chi ngay tot lanh.\" --group",
  "enabled": true
}
```

Delay 1.5s giua moi nhom. Neu co nhom fail, CEO nhan alert tong hop.

### Sua / xoa cron

- **Sua:** Bot doc file, tim entry theo `id`, thay doi field can thiet, ghi lai.
- **Xoa:** Bot doc file, loai bo entry theo `id`, ghi lai.
- **Tam dung:** Set `"enabled": false` (khong xoa).
- Moi thao tac deu phai CONFIRM voi CEO truoc.

### cronExpr vi du

- `0 9 * * 1-5` = 9h thu 2-6
- `0 */2 8-18 * * *` = nhac 2h ban ngay (6 fields voi giay)
- `0 9 * * 1` = T2 9am
- `0 15 * * 1-5` = 15h thu 2-6
- `0 7 1 * *` = 7h ngay 1 moi thang

### Luu y

- `id` phai unique, dung slug (chu thuong, gach ngang, khong dau)
- `label` tieng Viet, KHONG emoji
- `prompt` bat dau bang `exec: ` de chay truc tiep, khong qua agent
- GroupId phai ton tai trong `groups.json` (tra truoc khi ghi)
- File watcher tu detect thay doi va reload cron — KHONG can restart app
