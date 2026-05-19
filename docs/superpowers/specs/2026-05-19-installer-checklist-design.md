# 9BizClaw Installer Checklist — 5 Milestones

> Spec for remote installation workflow (Zoom/TeamViewer). NV 9Biz guides customer through 5 verifiable milestones. Tracked in Google Sheet (1 row per customer).

---

## Context

- **Who uses this:** NV ky thuat 9Biz, remote qua Zoom/TeamViewer
- **Goal:** Customer can use 9BizClaw independently after the session — no follow-up needed
- **Tracking:** Google Sheet, 1 row per customer, 5 milestone columns (Pass/Fail + notes)
- **Version:** 9BizClaw v2.4.4

## Sheet Structure

| Khach hang | NV | Ngay cai | Pre-session | M1: App | M2: AI+TG | M3: Zalo | M4: Knowledge | M5: Independence | Ghi chu / Blocker |
|---|---|---|---|---|---|---|---|---|---|

Each milestone cell: `Pass` or `Fail — [ly do]`. Filter Fail to find customers needing follow-up.

---

## Pre-session: Khach hang chuan bi truoc buoi cai

NV gui danh sach nay cho khach TRUOC buoi hen Zoom/TeamViewer:

- [ ] License key `CLAW-...` (nhan tu 9Biz)
- [ ] Telegram da cai tren dien thoai hoac may tinh (telegram.org)
- [ ] Zalo desktop da cai VA dang nhap tren may se cai 9BizClaw
- [ ] Tai khoan ChatGPT (dang ky tai chatgpt.com — mien phi hoac Plus)
- [ ] It nhat 1 file tai lieu doanh nghiep (bang gia, catalog, gioi thieu cong ty) — PDF/Word/Excel
- [ ] 500MB dung luong trong tren o dia
- [ ] Mang internet on dinh (tranh mang cong ty co firewall neu co the)

**Neu khach thieu muc nao — giai quyet TRUOC khi bat dau cai, khong lam giua session.**

---

## Milestone 1: App chay, runtime san sang

### NV lam
- Gui file .exe cho khach (qua Drive/Telegram/Zalo)
- Huong dan chay installer, cho splash screen tai runtime (~170MB, 2-10 phut)
- Neu loi: doc panel chan doan tu dong, xu ly:
  - Mang cham/bi chan: doi mang 4G hotspot
  - Windows Defender lock file: them `%APPDATA%\9bizclaw` vao Exclusions
  - Permission denied: chay Run as Administrator
  - O dia day: giai phong 500MB

### Proof
Dashboard hien ra, khong con splash screen. Sidebar co logo 9BizClaw + cham trang thai.

### Blocker thuong gap
- Firewall cong ty chan `registry.npmjs.org` — doi mang
- Antivirus xoa file vendor — them Exclusions
- EBUSY — cho 30s, app tu retry

**NHAC NGAY SAU M1:** "App phai luon mo (thu nho xuong tray OK, KHONG dong). Dong app = bot ngung hoat dong hoan toan."

### Thoi gian uoc tinh: 5-15 phut

---

## Milestone 2: AI + Telegram ket noi

### NV lam

**License activation:**
- Khach paste key `CLAW-...` vao o nhap
- Nhan "Kich hoat" — cho xac thuc

**Wizard buoc 1 — Thong tin co ban:**
- Ho va ten CEO (bat buoc)
- Ten cong ty (khong bat buoc)
- Ten tro ly ao (khong bat buoc, de trong = bot xung "em")
- Tro ly goi anh/chi la (bat buoc): anh, chi, sep, giam doc...

**Wizard buoc 2 — Ket noi ChatGPT:**
- Nhan "Ket noi ChatGPT" — browser mo trang dang nhap
- Neu browser hien trang dang nhap 9Router (o nhap mat khau): nhap `123456` roi tiep tuc
- Khach dang nhap tai khoan ChatGPT (mien phi hoac Plus)
- Nhan "Connect" tren trang do
- Quay lai app, nhan "Kiem tra ket noi"
- Thanh cong: chu xanh "ChatGPT da ket noi. Model [ten] san sang."
- Loi 500: dong app, cho 30-60 giay, mo lai, thu lai buoc 2 (app tu fix ABI loi lan dau restart). Toi da 3 lan

**Wizard buoc 3 — Ket noi Telegram:**
- Huong dan khach tao bot qua @BotFather: `/newbot` → dat ten → dat username (ket thuc bang "bot")
- Copy TOAN BO token (so + dau : + chu) → paste vao app
- Lay User ID qua @userinfobot: `/start` → copy day so
- Paste User ID vao app
- **QUAN TRONG:** Khach PHAI nhan Start tren bot Telegram truoc khi test. Day la buoc hay quen nhat. Se KHONG co phan hoi — dung roi
- App gui tin thu → khach kiem tra Telegram

**Wizard buoc 4 — Hoan tat:**
- Nhan "Khoi dong tro ly"

### Proof
Khach mo Telegram, gui "Chao bot" cho bot vua tao. Bot tra loi trong 30-60 giay (lan dau co the len 2 phut neu gateway dang khoi dong). NV cho toi da 2 phut truoc khi coi la that bai. Xac nhan khach nhan duoc tin.

### Blocker thuong gap
- Token copy thieu ky tu — copy lai tu BotFather
- Chua nhan Start tren bot — mo lai link bot, nhan Start
- Loi 500 buoc 2 — dong mo app (auto-fix), toi da 3 lan
- "Chua tim thay ket noi ChatGPT" — dang nhap dung browser mac dinh

### Thoi gian uoc tinh: 10-20 phut

---

## Milestone 3: Zalo hoat dong

### NV lam
- Xac nhan khach dang dang nhap Zalo desktop tren may tinh nay. Neu chua: huong dan cai Zalo desktop (zalo.me) + dang nhap
- Dashboard → Kenh → Zalo: xac nhan cham xanh (listener running)
- Neu cham do/xam: cho 15-30s, hoac dong mo app
- Huong dan khach cau hinh Zalo:
  - **Che do tra loi:** Tu dong (mac dinh) hoac Chi doc + tom tat cuoi ngay
  - **Chinh sach nguoi la:** Tra loi binh thuong / Chao 1 lan / Bo qua
  - **Che do nhom moi:** @mention (an toan nhat) / Moi tin / Tat
- Huong dan allowlist: tab Ban be — bat/tat tung nguoi
- **Truoc khi test:** vao tab Ban be, xac nhan nguoi thu da duoc bat (toggle xanh). Allowlist mac dinh co the tat — bat nguoi thu truoc

### Proof
NV hoac khach nho ai do nhan Zalo cho tai khoan khach. Bot tra loi. Neu khong co nguoi thu — NV nhan Zalo cho khach tu Zalo ca nhan cua NV, khach xac nhan bot reply.

### Blocker thuong gap
- Zalo chua dang nhap tren may — khach mo Zalo truoc
- Cham do keo dai > 30s — dong mo app
- Nguoi thu nam ngoai allowlist — bat toggle trong tab Ban be
- Nhom Zalo o che do Tat — doi sang @mention hoac Moi tin

### Thoi gian uoc tinh: 5-10 phut

---

## Milestone 4: Knowledge — bot tra loi tu tai lieu that

### NV lam
- Dashboard → Noi dung → Tai lieu
- Huong dan khach upload it nhat 1 file:
  - Bang gia / catalog → thu muc "San pham"
  - Gioi thieu cong ty → thu muc "Cong ty"
- Ho tro: PDF, Word (.docx), Excel (.xlsx), TXT, CSV, JPG, PNG
- Cho bot tom tat (vai giay den 1 phut)
- Giai thich 3 muc hien thi:
  - **Cong khai** — bot dung khi tra loi khach Zalo
  - **Noi bo** — chi CEO + nhan vien
  - **Chi minh toi** — chi CEO qua Telegram

### Proof
Khach hoi bot tren Telegram: "Gia san pham X?" (san pham co trong file vua upload). Bot tra loi dung gia tu tai lieu, khong bia.

### Blocker thuong gap
- PDF scan khong extract duoc text — convert sang Word truoc khi upload
- Bot tra loi "em chua co thong tin" — cho them 30s cho index xong, hoi lai
- File qua nang — chia nho hoac tom tat truoc

### Thoi gian uoc tinh: 5-10 phut

---

## Milestone 5: Khach tu dung — independence test

### NV yeu cau khach TU LAM 3 viec (khong huong dan, chi quan sat):

**Viec 1 — Tam dung bot Zalo:**
- Dashboard → Kenh → Zalo → nhan "Tam dung"
- Xac nhan banner hien "Bot Zalo dang tam dung"
- Nhan "Tiep tuc" de bat lai

**Viec 2 — Xem tong quan:**
- Dashboard → Tong quan
- Khach doc duoc loi chao, thay hoat dong gan day

**Viec 3 — Gui lenh Telegram:**
- Khach tu go tren Telegram: "Tom tat hom nay" hoac "Trang thai bot"
- Bot tra loi

### Proof
Khach hoan thanh ca 3 viec khong can hoi NV. Neu ket 1 trong 3 — NV huong dan lai roi cho khach thu lan 2.

### Sau milestone 5 — NV ket thuc session:
- Nhac khach: "App can mo lien tuc, thu nho xuong tray la du"
- Nhac khach: nut ho tro (?) goc duoi phai — Lien he 9Biz, xem lai huong dan
- Nhac khach: "Upload them tai lieu bat ky luc nao vao tab Tai lieu"
- Ghi note tren Sheet: thoi gian cai, blocker gap phai, can follow-up khong

### Thoi gian uoc tinh: 5 phut

---

## Tong thoi gian uoc tinh: 30-60 phut moi khach

| Milestone | Thoi gian | Ty le blocker |
|-----------|-----------|---------------|
| M1: App + runtime | 5-15 phut | Cao (mang, antivirus) |
| M2: AI + Telegram | 10-20 phut | Trung binh (token copy, ChatGPT login) |
| M3: Zalo | 5-10 phut | Thap (thuong pass neu M1-M2 ok) |
| M4: Knowledge | 5-10 phut | Thap (chi can 1 file) |
| M5: Independence | 5 phut | Rat thap |

## Deliverable

Google Sheet template voi:
- Header row: Khach hang | NV | Ngay cai | M1 | M2 | M3 | M4 | M5 | Ghi chu
- Data validation: M1-M5 dropdown "Pass" / "Fail"
- Conditional formatting: Fail = do, Pass = xanh
- Filter view: "Khach can follow-up" = bat ky M nao = Fail
