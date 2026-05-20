# 9BizClaw — Agenda Training Tối 19/05/2026

> Tài liệu cho trainer. In ra hoặc mở trên máy để follow theo.
> Thời gian: ~90 phút | Đối tượng: Đội ngũ cài đặt

---

## Phần 0 — Mở đầu (5 phút)

- [ ] Chào hỏi, điểm danh
- [ ] Giới thiệu mục tiêu buổi học:
  - Biết cài 9BizClaw từ A-Z cho khách hàng
  - Biết xử lý lỗi thường gặp
  - Biết demo tính năng cho CEO
  - Cuối buổi: làm bài kiểm tra online

---

## Phần 1 — Tổng Quan Sản Phẩm (10 phút)

### 9BizClaw là gì?
- Trợ lý AI cho CEO doanh nghiệp nhỏ
- Chạy 100% trên máy khách — KHÔNG cloud, KHÔNG lo rò rỉ dữ liệu
- 2 kênh chính: Telegram (CEO điều khiển) + Zalo (khách hàng tương tác)

### Kiến trúc đơn giản (vẽ lên bảng hoặc slide)
```
CEO (Telegram) ──> 9BizClaw (máy CEO) ──> Zalo (khách hàng)
                        |
                    ChatGPT (AI)
                        |
                    Google Workspace
```

### Điểm bán hàng khi nói với CEO
- "Dữ liệu 100% trên máy anh/chị, không ai truy cập được"
- "Bot tự trả lời khách Zalo 24/7, chỉ cần để máy mở"
- "Điều khiển mọi thứ bằng Telegram, không cần mở app"
- "Tự tạo ảnh, đăng Facebook, đọc Sheet, gửi email"

---

## Phần 2 — Quy Trình Cài Đặt (25 phút)

### 2.1 Chuẩn bị (3 phút)

**5 thứ BẮT BUỘC** — nhắn CEO chuẩn bị TRƯỚC buổi remote:

| # | Cần chuẩn bị | Check |
|---|-------------|-------|
| 1 | Telegram đã cài | [ ] |
| 2 | Zalo đang đăng nhập trên máy | [ ] |
| 3 | ChatGPT đã đăng ký (chatgpt.com) | [ ] |
| 4 | Máy tính: Win 10+ hoặc Mac 11+, 8GB RAM, CPU 4 nhân trở lên, 500MB trống | [ ] |
| 5 | License key (CLAW-...) | [ ] |

> Mẹo: Nhắn trước 1 ngày cho CEO chuẩn bị. Không có = mất thời gian trong buổi remote.

### 2.2 Cài đặt + Splash (5 phút)

- Windows: mở .exe, chờ 1-2 phút
- Mac: mở .dmg, kéo vào Applications
- Lần đầu: tải thêm ~170MB (2-10 phút tuỳ mạng)
- **6 bước splash**: Node.js > Packages > Plugin Zalo > gogcli > Mô hình AI > Hoàn tất
- Màu: Xám (chưa) > Cam (đang chạy) > Xanh (xong) > Đỏ (lỗi)

**LỖI THƯỜNG GẶP — thuộc lòng 4 lỗi này:**

| Lỗi | Xử lý nhanh |
|-----|-------------|
| EBUSY | Thêm Exclusions vào Windows Security (KHÔNG tắt Defender) |
| ETIMEDOUT | Chuyển sang hotspot 4G |
| EACCES | Run as admin (Win) / Security & Privacy (Mac) |
| SmartScreen | "More info" > "Run anyway" |

> Demo: Mở màn hình Security > Exclusions > Add folder %APPDATA%\9bizclaw

### 2.3 License (3 phút)

- Format: `CLAW-eyJlIjoiZW1haWxA...`
- **KHOÁ THEO PHẦN CỨNG** — không copy sang máy khác được
- Copy TOÀN BỘ từ email — KHÔNG gõ tay
- Không có dấu cách thừa ở đầu/cuối
- Mẹo: paste vào Notepad trước để kiểm tra

### 2.4 Wizard 4 bước (10 phút)

**Bước 1 — Thông tin cơ bản**
- Họ tên CEO, tên công ty, tên bot, cách xưng hô
- Nhanh, 1 phút

**Bước 2 — Kết nối ChatGPT** (QUAN TRỌNG)
- Nhấn "Kết nối ChatGPT" > đăng nhập > "Connect"
- Quay lại app > "Kiểm tra kết nối" > chữ xanh
- Lỗi 500: đóng mở lại 3 lần. Vẫn lỗi: gửi 9router.log cho support

**Bước 3 — Kết nối Telegram** (QUAN TRỌNG NHẤT)
- 3 việc:
  1. @BotFather > /newbot > đặt tên (kết thúc "bot") > copy token
  2. @userinfobot > /start > copy số ID
  3. Kiểm tra: app gửi tin thử — CEO phải nhận được

> Demo: Mở Telegram, làm từng bước, nhấn mạnh copy TOÀN BỘ token

**Bước 4 — Hoàn tất**
- Nhấn "Khởi động trợ lý"
- CHƯA XONG! Phải xác nhận ở bước tiếp

### 2.5 Xác nhận thành công (4 phút)

**PROOF THẬT SỰ = BOT TRẢ LỜI TIN NHẮN**

- [ ] Gửi tin bất kỳ cho bot trên Telegram
- [ ] Chờ 30-60 giây (lần đầu)
- [ ] Bot trả lời = THÀNH CÔNG
- [ ] Dashboard > sidebar > chấm Telegram XANH

> Nhấn mạnh: Wizard "Hoàn tất" chỉ là cấu hình đã lưu. Proof = bot reply.

---

## Phần 3 — Demo Tính Năng Cho CEO (20 phút)

> Mục đích: cài xong, ở lại thêm 10-15 phút demo nhanh qua remote
> cho CEO thấy giá trị. CEO thấy bot làm được = tin tưởng = giữ dùng app.

### 3.1 Trả lời khách Zalo (3 phút)
- Mở Telegram > nhắn: "Trả lời khách thế nào?"
- Bot giải thích cách hoạt động
- Nhấn mạnh: bot chỉ trả lời dựa trên tài liệu đã upload

### 3.2 Gửi tin Zalo từ Telegram (3 phút)
- Demo: "Nhắn Zalo cho [tên]: Chào anh/chị"
- Bot xác nhận tên > CEO reply "ok" > gửi
- Nhấn mạnh: bot LUÔN hỏi xác nhận trước khi gửi

### 3.3 Tạo lịch tự động — Cron (5 phút)
- Demo: "Tạo cron mỗi sáng 9h gửi nhóm [tên]: Chào buổi sáng!"
- Bot xác nhận nhóm + giờ > CEO OK > xong
- Demo: "Danh sách cron" — cho CEO thấy lịch đã tạo

### 3.4 Google Workspace (3 phút)
- Demo nhanh 1-2 cái: "Đọc email mới", "Đọc Sheet [tên]"
- Nhấn mạnh: cần kết nối Google trước (Dashboard > Google)

### 3.5 Tạo ảnh AI (3 phút)
- Demo: "Tạo banner giảm giá 50%"
- Bot tạo ảnh > preview > CEO OK
- Nhấn mạnh: bot tự dùng logo/ảnh đã upload trong tab Tài sản

### 3.6 Báo cáo (3 phút)
- Demo: "Báo cáo hôm nay" hoặc "Hôm nay thế nào?"
- Bot tổng hợp: tin nhắn, khách mới, cron đã chạy

---

## Phần 4 — Bàn Giao & Lưu Ý (10 phút)

### Checklist bàn giao — 3 việc TỐI THIỂU

| # | Việc | Đã làm |
|---|------|--------|
| 1 | Bot trả lời Telegram (đã test) | [ ] |
| 2 | CEO biết gửi tin cho bot | [ ] |
| 3 | Nhắc CEO để máy mở (không tắt app) | [ ] |

### Lưu ý quan trọng

- **Mac đóng nắp = sleep = cron mất.** Nhắc CEO: Energy Saver > tắt sleep
- **Dữ liệu 100% trên máy.** Nhắc CEO: Dashboard > Xuất backup định kỳ
- **Update app KHÔNG mất dữ liệu** — dữ liệu nằm riêng trong AppData
- **Mất máy = mất dữ liệu** nếu chưa backup. License key KHÔNG phải backup
- **App phải mở** để bot và cron hoạt động. Có thể thu nhỏ xuống tray

### Khi nào gọi support (tech@modoro.com.vn)

- Đóng mở 3 lần vẫn lỗi
- Lỗi license (hết hạn, chuyển máy)
- Splash lỗi sau 3 lần "Thử lại"
- Gửi kèm: mô tả lỗi + ảnh chụp + OS version

---

## Phần 5 — Bài Kiểm Tra (15 phút)

- [ ] Gửi link Google Form cho học viên
- [ ] 20 câu trắc nghiệm, 10 phút
- [ ] Đạt: 16/20 (80%)
- [ ] Câu hỏi bao gồm:
  - Chuẩn bị trước khi cài (3 câu)
  - Cài đặt & Splash (5 câu)
  - License (2 câu)
  - Wizard (5 câu)
  - Xác nhận & Bàn giao (3 câu)
  - Dữ liệu & Bảo mật (2 câu)

> Sau khi tạo Form từ Apps Script: copy link > gửi vào nhóm

---

## Phần 6 — Hỏi Đáp & Kết Thúc (5 phút)

- [ ] Giải đáp thắc mắc
- [ ] Nhắc lịch thực hành (nếu có)
- [ ] Gửi tài liệu tham khảo:
  - File training (installer-training.pdf)
  - Use cases (9bizclaw-use-cases.md)
  - Hướng dẫn sử dụng (HUONG-DAN-SU-DUNG.pdf)

---

## Mẹo Cho Trainer

1. **Demo thật, không dùng slide.** Share màn hình, cài thật, làm từng bước. Học viên nhớ lâu hơn.
2. **Làm chậm bước Wizard.** Đây là phần học viên hay sai — đặc biệt bước 3 Telegram.
3. **Nhắc đi nhắc lại:** "Copy TOÀN BỘ, KHÔNG gõ tay" (license + token).
4. **Kết thúc bằng demo Zalo reply.** CEO thấy bot tự trả lời = ấn tượng mạnh nhất.
5. **Chuẩn bị sẵn 1 license key test** để demo trên máy của mình.
