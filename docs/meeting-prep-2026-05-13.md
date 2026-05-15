# Meeting Prep — Sprint 1 Kickoff — 2026-05-13

## #1. Review + don gian hoa cai dat

**Hien tai: 6 buoc**

| Buoc | Noi dung | Do kho | Van de |
|------|---------|--------|--------|
| 1/6 | Thong tin co ban (ten, cong ty) | Thap | OK |
| 2/6 | Ca nhan hoa theo nganh (15 trait, voice, pronoun) | CAO | 15 trait button qua nhieu, CEO khong hieu tung cai. Advanced customization an trong details tag |
| 3/6 | Ket noi AI (9Router + ChatGPT) | CAO | "9Router" la gi? CEO phai mo localhost, nhap password 123456, roi OAuth ChatGPT — nhay qua lai 3 cua so |
| 4/6 | Ket noi Telegram (tao bot + lay user ID) | CAO | Phai vao BotFather, copy token dai, vao userinfobot, copy ID, gui /start — nhay 3+ lan giua app va Telegram |
| 5/6 | Ket noi Zalo (QR code, optional) | Trung binh | OK — quet QR don gian |
| 6/6 | Xac nhan + khoi dong | Thap | OK |

**De xuat don gian hoa:**
- Buoc 2: Thay 15 trait bang 3-5 preset ("Than thien", "Chuyen nghiep", "Nang dong"). CEO chon 1, xong.
- Buoc 3: An 9Router. Tu dong khoi dong ngam. CEO chi can click "Ket noi ChatGPT" → OAuth → xong. Khong can biet 9Router la gi.
- Buoc 4: Tu dong hoa viec gui /start. Hoac: hien video huong dan ngan 30s thay vi text dai.
- Gom buoc 1+2 thanh 1 buoc (thong tin + nganh). Giam tu 6 → 4-5 buoc.

---

## #2. Sap xep lai menu sidebar

**Hien tai:**
```
Dieu khien
  Tong quan
  Chat
  Lich tu dong
  Tai lieu
  Tai san hinh anh
  Tinh cach bot

Kenh
  Telegram
  Zalo
  Facebook
  Google

Cai dat
  AI Models
  Cai dat nang cao
  Giao dien
  An xuong tray
  Kiem tra cap nhat
```

**De xuat moi (theo yeu cau boss):**
```
Tong quan                    ← trang chinh

Chat                         ← cua so chat rieng (xem #3)

Kenh
  Telegram      (co san)
  Zalo          (co san)
  WhatsApp      (SAP CO — hien "Coming soon" de ban hang)

Tich hop
  Facebook      (co san)
  Google        (co san)
  Shopee        (SAP CO — "Coming soon")
  Lazada        (SAP CO — "Coming soon")
  TikTok Shop   (SAP CO — "Coming soon")
  CRM           (SAP CO — "Coming soon")

Tu dong hoa
  Lich tu dong  (co san)
  Kha nang      (MOI — template gallery tu spec 2026-05-13)

Kien thuc
  Tai lieu      (co san)
  Tai san hinh anh (co san)
  Tinh cach bot (co san, doi ten thanh "Ca nhan hoa")

Cai dat
  AI Models
  Cap nhat
  Giao dien
```

**Luu y:** WhatsApp chua co code. Shopee/Lazada/TikTok/CRM chua co code. Hien thi "Coming soon" voi icon xam + badge de tao ky vong khi ban hang.

---

## #3. Cua so Chat doc lap (giong Claw-X)

**Hien tai:** Chat la 1 tab webview trong dashboard, load `http://127.0.0.1:18789/chat` (OpenClaw Gateway).

**Can lam:** Tach Chat thanh cua so rieng (BrowserWindow), CEO co the mo song song voi Dashboard. Hoac: giu embedded + them nut "Mo cua so rieng".

**Do kho:** Thap — chi can tao BrowserWindow moi voi cung partition `persist:embed-openclaw`. ~4 file thay doi (main.js, preload.js, dashboard.html, co the them chat-window.html).

**Thoi gian:** 1-2 ngay.

---

## #4. Tao tai khoan MODORO tren ClawHub

**ClawHub la gi:** Marketplace chinh thuc cua OpenClaw (clawhub.ai). 52.7K tools, 180K users, 12M downloads. Giong npm cho AI skills.

**Cach lam:**
1. Dang nhap clawhub.ai bang GitHub (tai khoan `PeterBui85` hoac tao tai khoan MODORO)
2. Cai CLI: `npm install -g clawhub`
3. `clawhub login`
4. Publish skill: `clawhub skill publish ./skills/copywriting/`

**Format skill:** Thu muc voi `SKILL.md` + YAML frontmatter (name, description, version). MIT-0 license.

**Skills co the publish free cho cong dong:**
- copywriting, copy-editing, social-content, content-strategy
- email-sequence, paid-ads, launch-strategy, pricing-strategy
- content-humanizer, brand-guidelines
- finance-bundle, finance-lead
- change-management

**Hanh dong:** Tao acc MODORO tren ClawHub → publish 10-15 skill free → tang gia tri thuong hieu + thu hut nguoi dung.

---

## #5. Chuan hoa Bo nao, Skill, Plugin — Audit day du

### Bo nao (Brain files)

| File | Chuc nang | Trang thai |
|------|----------|------------|
| AGENTS.md | Routing + rules chinh | CO — v98, 19.7KB |
| SOUL.md | Persona + giong noi | CO |
| IDENTITY.md | Ten, cong ty, xung ho | CO |
| USER.md | Thong tin CEO | CO |
| COMPANY.md | Thong tin doanh nghiep | CO |
| PRODUCTS.md | San pham/dich vu | CO |
| MEMORY.md | Bo nho dai han | CO |
| TOOLS.md | Cong cu kha dung | CO |
| BOOTSTRAP.md | Khoi dong instructions | CO |

**Ket luan:** Bo nao day du, da chuan hoa.

### Skills (46 file, 32 active)

| Nhom | Co san | Can tao | Chi tiet |
|------|--------|---------|----------|
| Khach hang & Cham soc | 5 | 2 | Thieu: khao sat hai long, phat hien yeu cau lap lai |
| Noi dung & Marketing | 9 | 2 | Thieu: SEO, phan tich doi thu |
| Ban hang & Bao gia | 1 | 6 | Thieu: bao gia, pipeline, lead scoring, du bao, follow-up bao gia, sales report |
| Tai chinh & Ke toan | 2 | 5 | Thieu: tinh luong, hoa don, chi phi bat thuong, thue, P&L theo SP |
| Nhan su | 0 | 6 | Thieu: TOAN BO (luong, phep, JD, onboarding, KPI, dao tao) |
| Van hanh | 1 | 5 | Thieu: SOP, quy trinh, ton kho, nha cung cap, chat luong |
| Quan ly & Bao cao | 7 | 0 | DAY DU |
| Chien luoc | 0 | 7 | Thieu: TOAN BO (SWOT, thi truong, business plan, franchise, pitch deck) |
| **TONG** | **25** | **33** | **39% coverage** |

### Plugin

| Plugin | Trang thai | Ghi chu |
|--------|-----------|---------|
| modoro-zalo (OpenZalo) | CO — baked in | Zalo auto-reply, group, blocklist |
| 9Router | CO — vendor | AI model proxy (ChatGPT, Gemini, Claude) |
| OpenClaw Gateway | CO — vendor | Core AI agent engine |
| Facebook Graph API | CO — lib | fb-publisher.js + fb-schedule.js |
| Google Sheets | CO — lib | google-routes.js |
| Google Calendar | CHUA CO | Chi co auth framework, 0 endpoint |
| Google Gmail | MỘT PHẦN | Routing co, API chua day du |
| WhatsApp | CHUA CO | 0 code |
| Shopee/Lazada/TikTok | CHUA CO | 0 code |
| CRM | CHUA CO | Chi co memory file, khong co DB |

---

## #6. Video huong dan su dung

**De xuat noi dung (3-5 video ngan, moi video 3-5 phut):**

1. **Cai dat 9BizClaw** (5 phut)
   - Download → cai dat → mo app → wizard 4 buoc
   - Ket noi ChatGPT, Telegram, Zalo

2. **Tao bai viet + anh Facebook/Zalo** (3 phut)
   - Nhan Telegram "tao bai viet ve [san pham]"
   - Bot tao anh + caption → CEO duyet → dang

3. **Cai dat tu dong hoa** (3 phut)
   - Bat bao cao sang/toi
   - Tao cron gui nhom Zalo
   - Follow-up khach tu dong

4. **Upload tai lieu doanh nghiep** (2 phut)
   - Upload PDF/Word vao tab Tai lieu
   - Bot hoc va tra loi khach dua tren noi dung

5. **Quan ly Zalo** (3 phut)
   - Tu dong tra loi khach
   - Block nguoi spam
   - Chuyen tiep khieu nai cho CEO

**Cong cu quay:** OBS Studio (free) hoac Loom. Nhung vao installer hoac goi link tu Dashboard.

---

## #7. Huong dan cai dat dinh ky cho Premium

**Format:** Zoom/Google Meet, 30-45 phut, 2 lan/thang (thu 3 + thu 5 tuan 2 va 4)

**Lich trinh moi buoi:**
- 10 phut: Demo cai dat tu dau den xong
- 15 phut: CEO tu cai tren may minh (co ho tro truc tuyen)
- 10 phut: Hoi dap
- 5 phut: Huong dan buoc tiep theo (upload tai lieu, bat tu dong hoa)

**Nguoi lam:** Huy hoac Tai

**Cong cu:** Google Calendar invite tu dong khi mua Premium. Link Zoom co dinh.

---

## #9. Chuong trinh chia se Skill dinh ky

**Format:** Livestream hoac Zoom, 30 phut, 2 lan/thang

**Noi dung moi buoi:**
- Demo 2-3 skill moi (tu ClawHub hoac tu phat trien)
- Use case thuc te voi khach hang
- Q&A

**Muc dich:** Tang gia tri cho khach Premium hien tai + thu hut khach moi

---

## #10. Dao tao Installer

**Doi tuong:** Doi ngu cai dat 9BizClaw cho khach hang

**Noi dung dao tao:**
- Module 1: Cai dat + wizard (1h)
- Module 2: Ca nhan hoa theo nganh (1h)
- Module 3: Xu ly loi thuong gap (1h) — EBUSY, 9Router 500, Zalo QR het han
- Module 4: Demo cho khach — flow "tao anh + bai viet" (1h)
- Module 5: Handover + bao cao (30 phut)

**Tai lieu:** Checklist cai dat + FAQ loi thuong gap + video tham khao

---

## #11. Tu dong duyet don 99k + tro ly rieng

**Hien tai:** Duyet don thu cong.

**Can lam:**
- Tich hop cong thanh toan (VNPay/Momo/bank transfer) → tu dong xac nhan
- Khi thanh toan xong → tu dong tao license key (dung generate-license.js hien tai)
- Setup 1 instance 9BizClaw rieng cho lop 99k voi skill set gioi han
- Hoac: tao tier "Basic" trong license system (hien chi co premium + enterprise)

**Do kho:** Trung binh — phan lon la tich hop payment gateway + tu dong hoa license.

---

## #12. Cap nhat thong tin khach hang len CRM

**Hien tai:** Thong tin khach nam trong:
- memory/zalo-users/*.md (per-customer notes)
- License records (~/.claw-license-issued.jsonl)
- Khong co CRM tap trung

**Can lam:**
- Chon CRM (HubSpot free / Zoho / Salesforce Essentials / tu xay)
- Export du lieu khach hien tai tu license log + memory files
- Dong bo dinh ky hoac realtime

---

## #13. Buoi trao doi CRM cho ben anh Phuc

**Nguoi lam:** Lam + Tai

**De xuat agenda:**
- Gioi thieu CRM da chon
- Demo import du lieu khach
- Thong nhat quy trinh cap nhat
- Phan quyen truy cap
