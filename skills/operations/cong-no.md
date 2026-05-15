---
name: cong-no
description: Theo doi cong no khach hang — ghi no, tra no, nhac no, canh bao qua han
metadata:
  version: 1.0.0
---

# Theo doi cong no

## Nguyen tac

CEO noi 1 cau — bot xuat ket qua NGAY. Khong hoi lai.
Thieu thong tin → gia dinh hop ly + ghi "[gia dinh: X — anh sua neu khac]".
Luu file: `workspace/cong-no.md`. Append-only, co ngay thang.

## Ghi no moi

CEO: "ghi no anh Tuan 5 trieu" / "Tuan no 5tr tien hang"

Bot NGAY LAP TUC:
1. Doc `workspace/cong-no.md` (tao moi neu chua co)
2. Append dong moi theo format bang ben duoi
3. Gia dinh:
   - Han tra: +30 ngay tu hom nay (neu CEO khong noi)
   - Ghi chu: suy tu ngau canh ("tien hang", "tien cong", ...)
   - Ngay no: hom nay
4. Xac nhan:

```
Da ghi:
| Ten      | So tien    | Ngay no    | Han tra    | Ghi chu   |
|----------|-----------|------------|------------|-----------|
| Anh Tuan | 5,000,000 | 2026-05-16 | 2026-06-15 | Tien hang |
[gia dinh: han 30 ngay — anh sua neu khac]
```

## Tra no (mot phan hoac toan bo)

CEO: "anh Tuan tra 3 trieu" / "Tuan thanh toan het"

Bot:
1. Doc file, tim dong cua "Tuan" con no
2. Ghi dong moi voi so tien am (tra): `-3,000,000`
3. Tinh con lai, bao CEO:

```
Anh Tuan da tra 3,000,000. Con no lai: 2,000,000 (han 2026-06-15).
```

Neu tra het → ghi `DA THANH TOAN` vao ghi chu.

## Xem tong hop cong no

CEO: "ai dang no minh?" / "bao cao cong no"

Bot doc file, tong hop theo tung nguoi, chi hien khoan CON NO:
- Bang: Ten | Tong no | Da tra | Con lai | Han gan nhat | Trang thai
- Trang thai: `Trong han` / `SAP QUA HAN` (<7 ngay) / `QUA HAN` (+ so ngay)
- Dong cuoi: tong con no + so khoan sap/qua han

## Soan tin nhac no

CEO: "nhac anh Tuan tra no" / "soan tin nhac Chi Lan"

Bot soan tin nhac: than thien, khong gay ap luc, nhac so tien + khoan gi + ngay.
Hoi CEO: "Anh gui qua Zalo/goi dien, hoac de em gui giup?"

## Canh bao tu dong

Khi CEO hoi bat ky cau gi lien quan cong no, bot kem canh bao neu co:
- No qua han (qua ngay han tra): **CANH BAO** + so ngay qua han
- Sap qua han (<7 ngay): **LUU Y**
- No lon (>20 trieu 1 nguoi): ghi chu "[khoan lon — anh theo doi sat]"

## Format file `workspace/cong-no.md`

```markdown
# So cong no

## 2026-05-16
| Ten | So tien | Loai | Han tra | Ghi chu |
|-----|---------|------|---------|---------|
| Anh Tuan | 5,000,000 | NO | 2026-06-15 | Tien hang |

## 2026-05-18
| Anh Tuan | -3,000,000 | TRA | — | Chuyen khoan |
```

Moi dong la 1 giao dich. `NO` = ghi no moi, `TRA` = tra no. Tong no = SUM theo ten.

## Luu y

- KHONG lam phuc tap — day la so no, khong phai ke toan
- Tien Viet Nam, khong can don vi ngoai te
- Ten nguoi: giu nguyen cach CEO goi (anh Tuan, chi Lan, Minh, ...)
- Neu CEO noi "xoa no anh Tuan" → ghi `TRA` toan bo + ghi chu "CEO xoa no"
