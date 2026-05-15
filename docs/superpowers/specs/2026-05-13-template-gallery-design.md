# Template Gallery — "Menu Nha Hang" Design

> **Status:** Draft — brainstorming paused, to be continued
> **Date:** 2026-05-13
> **Context:** Sprint 1 most important feature. #1 customer complaint: "don't know what the app can do"

## Problem

20 premium customers + 4 signature customers. CEO opens app after wizard → doesn't know what's possible → messages Peter for help. App has 32+ skills, powerful cron system, image generation — but zero discoverability.

## Key Insights from Brainstorming

- **Aha moment:** Image + post creation (CEO sees bot generate image + caption → "oh it can do THAT")
- **CEO profile:** Vietnamese SMB, phone-first, Zalo-centric, prefers asking over exploring, mix of tech comfort
- **Failure mode:** CEO messages Peter directly for help → Peter = the manual
- **Proactive bot messages = too aggressive.** Don't push, let them discover.
- **Approach chosen: "Menu nha hang"** — problem-based template gallery, not feature-based

## Architecture

New dashboard tab: "Tu dong hoa" — right after Overview in sidebar.

```
templates.json (static catalog, ships with app)
    ↓
Dashboard renders cards grouped by pain category
    ↓
CEO clicks "Bat ngay" or "Thu ngay"
    ↓
Activation handler:
  - Cron template  → writes to custom-crons.json + restarts scheduler
  - Skill template → activates skill in skills/active.md
  - On-demand      → opens Telegram/Chat with pre-filled prompt
    ↓
Status pill shows: "Dang chay" / "Chua bat"
```

Each template card: pain headline (Vietnamese CEO language) + 1-2 sentence description + preview thumbnail + "Bat ngay" / "Thu ngay" button + status + tag (Tu dong / Khi can / Hang ngay / Hang tuan / Hang thang)

Templates are static JSON shipped with app. Activation state per-customer in `active-templates.json`.

## Full Template Catalog (58 templates)

### KHACH HANG & CHAM SOC (7)

| # | Pain (CEO thay) | Bot lam gi | Loai | Skill |
|---|---|---|---|---|
| 1 | Khach nhan tin ma chua ai tra loi | Tu dong tra loi Zalo theo FAQ + kien thuc da upload | Tu dong | zalo.md ✓ (was zalo-customer-care.md, merged 2026-05-15) |
| 2 | Khach cu lau khong quay lai | Quet danh sach khach chua reply 48h, nhac CEO tren Telegram | Hang ngay 9:30 | follow-up.md ✓ |
| 3 | Khach khieu nai ma nhan vien xu ly cham | Phat hien khieu nai tu dong, chuyen tiep CEO ngay | Tu dong | escalation.js ✓ |
| 4 | Khong biet khach nao la VIP, khach nao moi | Ghi nhan lich su mua hang, tu dong tag VIP/hot/moi | Tu dong | veteran-behavior.md ✓ |
| 5 | Khach hoi gia san pham ma nhan vien khong co mat | Bot tra loi gia tu tai lieu da upload | Tu dong | knowledge-base.md ✓ |
| 6 | Muon gui khao sat hai long sau mua | Bot gui form khao sat sau 3 ngay mua hang | Khi can | CAN TAO |
| 7 | Khach nhac lai 3-4 lan ma chua ai xu ly | Phat hien yeu cau lap lai, escalate CEO + danh dau urgent | Tu dong | CAN TAO |

### NOI DUNG & MARKETING (11)

| # | Pain | Bot lam gi | Loai | Skill |
|---|---|---|---|---|
| 8 | Muon dang bai moi ngay ma khong co thoi gian | Tao anh + bai viet, CEO duyet tren Telegram, tu dong dang | Hang ngay | facebook-post-workflow.md ✓ |
| 9 | Can content cho Zalo nhom khach hang | Tao anh + noi dung, gui vao nhom Zalo theo lich | Hang ngay | zalo-post-workflow.md ✓ |
| 10 | Viet caption, quang cao ma khong biet viet hay | Viet copy ban hang, headline, CTA chuyen nghiep | Khi can | copywriting/SKILL.md ✓ |
| 11 | Can email gioi thieu san pham moi cho khach cu | Tao chuoi email 3-5 bai, gui tu dong theo lich | Khi can | email-sequence/SKILL.md ✓ |
| 12 | Khong biet tuan nay dang gi, thang nay dang gi | Len lich noi dung tuan/thang theo nganh | Khi can | content-strategy/SKILL.md ✓ |
| 13 | Muon chay quang cao Google/Facebook ma khong biet cach | Tu van chien luoc quang cao, target, ngan sach | Khi can | paid-ads/SKILL.md ✓ |
| 14 | Muon ra mat san pham moi ma khong co ke hoach | Len chien luoc launch: teaser, pre-order, D-day, post-launch | Khi can | launch-strategy/SKILL.md ✓ |
| 15 | Bai viet nghe nhu AI, khong tu nhien | Humanize noi dung cho giong nguoi that | Khi can | content-humanizer.md ✓ |
| 16 | Can anh san pham dep ma khong co designer | Tao anh bang AI theo brand guidelines | Khi can | image-generation.md ✓ (was facebook-image.md, renamed 2026-05-15) |
| 17 | Doi thu dang lam gi, minh khong biet | Phan tich doi thu, so sanh diem manh/yeu | Khi can | CAN TAO |
| 18 | Website khong len Google | Phan tich SEO, goi y tu khoa, toi uu noi dung | Khi can | CAN TAO |

### BAN HANG & BAO GIA (7)

| # | Pain | Bot lam gi | Loai | Skill |
|---|---|---|---|---|
| 19 | Khach hoi bao gia ma phai lam thu cong tung lan | Tao bao gia tu dong tu bang gia + thong tin khach | Khi can | CAN TAO |
| 20 | Khong biet thang nay ban duoc bao nhieu | Tong hop doanh thu tu don hang, bao cao trend | Hang tuan | CAN TAO |
| 21 | Khong biet khach nao sap mua, khach nao bo | Cham diem lead dua tren tan suat lien he + lich su | Tu dong | CAN TAO |
| 22 | Pipeline ban hang khong ai theo doi | Theo doi trang thai deal: moi → dang dam phan → chot → mat | Khi can | CAN TAO |
| 23 | Khong biet gia nao la tot nhat cho san pham | Phan tich gia doi thu + chi phi → goi y gia toi uu | Khi can | pricing-strategy/SKILL.md ✓ |
| 24 | Nhan vien quen follow-up khach da gui bao gia | Nhac tu dong sau 3 ngay gui bao gia chua co phan hoi | Tu dong | CAN TAO |
| 25 | Muon du bao doanh thu thang sau | Du bao dua tren data ban hang 3 thang gan nhat | Hang thang | CAN TAO |

### TAI CHINH & KE TOAN (7)

| # | Pain | Bot lam gi | Loai | Skill |
|---|---|---|---|---|
| 26 | Cuoi thang khong biet lai hay lo | Tong hop thu chi, tinh lai/lo, so sanh voi thang truoc | Hang thang | finance-bundle.md ✓ |
| 27 | Khong biet tien mat con bao nhieu, bao lau het | Tinh runway, burn rate, canh bao khi con < 3 thang | Hang tuan | finance-lead.md ✓ |
| 28 | Tinh luong nhan vien moi thang mat nua ngay | Tinh luong = luong co ban + phu cap + thuong - khau tru. Xuat bang luong | Hang thang | CAN TAO |
| 29 | Quen tra hoa don, nha cung cap nhac hoai | Nhac han thanh toan hoa don truoc 3 ngay | Tu dong | CAN TAO |
| 30 | Khong biet chi phi nao dang tang bat thuong | Theo doi chi phi theo hang muc, canh bao khi vuot 120% so voi thang truoc | Hang tuan | CAN TAO |
| 31 | Cuoi nam khong biet chuan bi thue the nao | Tong hop so lieu, nhac deadline nop thue, checklist chuan bi | Hang nam | CAN TAO |
| 32 | Muon biet doanh thu / chi phi theo tung san pham | Phan tich P&L theo san pham/dich vu | Khi can | CAN TAO |

### NHAN SU & DOI NGU (6)

| # | Pain | Bot lam gi | Loai | Skill |
|---|---|---|---|---|
| 33 | Tinh luong hang thang mat thoi gian | Tinh luong co ban + OT + phu cap + BHXH + thue TNCN | Hang thang | CAN TAO |
| 34 | Nhan vien xin nghi ma khong biet con bao nhieu phep | Theo doi ngay phep, tu dong tru khi duyet | Khi can | CAN TAO |
| 35 | Tuyen nguoi moi ma khong biet viet JD | Tao JD chuyen nghiep theo vi tri + nganh | Khi can | CAN TAO |
| 36 | Nhan vien moi vao khong biet lam gi ngay dau | Tao checklist onboarding 30/60/90 ngay | Khi can | CAN TAO |
| 37 | Khong biet nhan vien nao dang lam tot, ai can ho tro | Tong hop KPI, danh gia hieu suat doi ngu | Hang thang | CAN TAO |
| 38 | Muon dao tao nhan vien ma khong co tai lieu | Tao ke hoach dao tao theo vi tri + ky nang can thiet | Khi can | CAN TAO |

### VAN HANH & QUY TRINH (6)

| # | Pain | Bot lam gi | Loai | Skill |
|---|---|---|---|---|
| 39 | Nhan vien lam khac nhau, khong co quy trinh chuan | Viet SOP tu dong theo mo ta cong viec | Khi can | CAN TAO |
| 40 | Muon ve quy trinh nhung khong biet bat dau | Tao so do quy trinh (flowchart dang text) tu mo ta | Khi can | CAN TAO |
| 41 | Hang ton kho sap het ma khong ai biet | Canh bao khi ton kho duoi muc toi thieu | Tu dong | CAN TAO |
| 42 | Nha cung cap giao hang tre hoai | Theo doi lich giao hang, nhac khi tre han | Tu dong | CAN TAO |
| 43 | Chat luong san pham khong dong deu | Tao bang kiem chat luong theo san pham/dich vu | Khi can | CAN TAO |
| 44 | Cong viec lap di lap lai ma van lam thu cong | Tu dong hoa workflow: trigger → action → bao cao | Khi can | workflow-chains.md ✓ |

### QUAN LY & BAO CAO CEO (7)

| # | Pain | Bot lam gi | Loai | Skill |
|---|---|---|---|---|
| 45 | Sang den van phong khong biet hom nay lam gi | Bao cao sang: lich hop, viec can lam, so lieu quan trong | Hang ngay 7:30 | morning cron ✓ |
| 46 | Cuoi ngay khong biet da lam duoc gi | Tom tat cuoi ngay: hoan thanh, ton dong, can xu ly | Hang ngay 21:00 | evening cron ✓ |
| 47 | Cuoi tuan khong biet tong quan | Bao cao tuan: khach moi, doanh thu, noi bat, uu tien tuan sau | Hang tuan | weekly cron ✓ |
| 48 | Cuoi thang khong co so lieu de hop | Bao cao thang: trend, so sanh, ke hoach thang sau | Hang thang | monthly cron ✓ |
| 49 | Muon ghi nho y tuong nhung hay quen | Bot ghi nho moi thu CEO noi, nhac lai khi lien quan | Tu dong | ceo-memory.js ✓ |
| 50 | Can doc file nhanh ma khong co thoi gian | Tom tat PDF/Word/Excel trong 30 giay | Khi can | knowledge-base.md ✓ |
| 51 | Can biet Google Sheet dang co gi | Doc va tom tat Google Sheet | Khi can | google-workspace.md ✓ (public CSV section, merged 2026-05-15) |

### CHIEN LUOC & PHAT TRIEN (7)

| # | Pain | Bot lam gi | Loai | Skill |
|---|---|---|---|---|
| 52 | Khong biet diem manh diem yeu cong ty minh | Phan tich SWOT day du, goi y hanh dong | Khi can | CAN TAO |
| 53 | Muon nghien cuu thi truong truoc khi mo rong | Phan tich thi truong, xu huong, co hoi theo nganh | Khi can | CAN TAO |
| 54 | Can viet business plan de vay von | Tao business plan chuyen nghiep theo chuan ngan hang | Khi can | CAN TAO |
| 55 | Muon mo them chi nhanh ma khong biet nen hay khong | Phan tich mo rong: chi phi, rui ro, thoi gian hoa von | Khi can | CAN TAO |
| 56 | Muon nhuong quyen nhung khong co mo hinh | Tao mo hinh franchise: phi, dieu kien, quy trinh | Khi can | CAN TAO |
| 57 | Can thuyet trinh cho nha dau tu | Tao pitch deck: van de, giai phap, thi truong, tai chinh | Khi can | CAN TAO |
| 58 | Muon danh gia doi tac truoc khi hop tac | Phan tich doi tac: tai chinh, uy tin, rui ro | Khi can | CAN TAO |

## Summary

| Category | Total | Co san | Can tao |
|---|---|---|---|
| Khach hang & Cham soc | 7 | 5 | 2 |
| Noi dung & Marketing | 11 | 9 | 2 |
| Ban hang & Bao gia | 7 | 1 | 6 |
| Tai chinh & Ke toan | 7 | 2 | 5 |
| Nhan su & Doi ngu | 6 | 0 | 6 |
| Van hanh & Quy trinh | 6 | 1 | 5 |
| Quan ly & Bao cao | 7 | 7 | 0 |
| Chien luoc & Phat trien | 7 | 0 | 7 |
| **TONG** | **58** | **25** | **33** |

## TODO (design not finished)

- [ ] Template JSON data format
- [ ] Activation handler design (cron vs skill vs on-demand)
- [ ] Dashboard UI layout
- [ ] Preview/thumbnail system
- [ ] First-launch redirect to gallery
- [ ] Industry-specific template filtering (F&B vs retail vs services)
