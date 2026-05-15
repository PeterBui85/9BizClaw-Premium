---
name: so-sach-don-gian
description: So sach thu chi don gian — ghi hang ngay, bao cao tuan/thang cho CEO
metadata:
  version: 1.0.0
---

# So sach thu chi don gian

## Nguyen tac

CEO noi 1 cau — bot ghi NGAY. Khong hoi lai.
Thieu thong tin → gia dinh hop ly + ghi "[gia dinh: X]".
Luu file: `workspace/so-sach.md`. Append-only, co ngay thang.
Day la so thu chi, KHONG phai ke toan — don gian de CEO doc.

## Ghi thu chi

CEO: "hom nay thu 15 trieu chi 8 trieu" / "ban 3 thung son 4.5tr"

Bot NGAY LAP TUC:
1. Doc `workspace/so-sach.md` (tao moi neu chua co)
2. Suy luan khoan muc tu ngau canh (SOUL.md biet nganh + san pham)
3. Append theo format bang
4. Xac nhan:

```
Da ghi ngay 2026-05-16:
| Khoan muc      | Thu        | Chi       | Ghi chu     |
|----------------|-----------|-----------|-------------|
| Ban hang       | 15,000,000 |           | [gia dinh: doanh thu ban hang] |
| Chi phi        |            | 8,000,000 | [gia dinh: chi phi hoat dong]  |

Lai trong ngay: 7,000,000
```

Neu CEO noi cu the ("chi 2tr tien dien, 1tr5 tien nuoc") → tach rieng tung dong.

## Bao cao tuan

CEO: "bao cao thu chi tuan nay" / "tuan nay loi bao nhieu"

Bot doc file, loc 7 ngay gan nhat:
- Bang: Ngay | Thu | Chi | Chenh lech
- Tong tuan: thu, chi, lai
- Highlight: ngay thu cao nhat, ngay chi nhieu nhat

## Bao cao thang

CEO: "thang nay thu chi the nao" / "bao cao thang 5"

Tuong tu bao cao tuan nhung nhom theo tuan:
- Tong thang: thu, chi, lai
- Bang theo tuan: Tuan | Thu | Chi | Lai
- Top 3 khoan chi lon nhat

## Nhac ghi so

CEO nhac den tien/mua/ban nhung KHONG yeu cau ghi → KHONG tu dong ghi, chi nhac nhe: "Anh co muon em ghi vao so thu chi khong?"
Morning report kem: "Hom qua anh chua ghi thu chi — anh nho ghi nha."

## Format file `workspace/so-sach.md`

```markdown
# So thu chi

## 2026-05-16
| Khoan muc | Thu | Chi | Ghi chu |
|-----------|-----|-----|---------|
| Ban hang | 15,000,000 | | Son noi that |
| Chi phi hoat dong | | 8,000,000 | Nhap nguyen lieu |

## 2026-05-17
| Khoan muc | Thu | Chi | Ghi chu |
|-----------|-----|-----|---------|
| Ban hang | 4,500,000 | | 3 thung son |
| Tien dien | | 2,000,000 | |
| Tien nuoc | | 1,500,000 | |
```

Moi ngay 1 section. Moi dong 1 giao dich. Thu va Chi tach cot rieng.

## Sua so

CEO: "hom qua ghi sai, thu 15tr chu khong phai 12tr"

Bot:
1. Tim dong can sua trong file
2. Sua truc tiep (KHONG append dong moi)
3. Xac nhan: "Da sua: thu 12,000,000 → 15,000,000 ngay 15/05"

## Luu y

- Tien Viet Nam, format co dau phay ngan (15,000,000)
- KHONG tinh thue, KHONG phan biet doanh thu/loi nhuan gop — chi thu va chi
- KHONG tu dong phan loai phuc tap — giu nguyen cach CEO noi
- Neu CEO noi "lo 5 trieu thang nay" → hoi lai "Anh muon ghi khoan chi 5 trieu hay la nhan xet chung?"
- Cuoi thang nhac: "Anh review so thu chi thang nay khong? Em tom tat cho anh."
