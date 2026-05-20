# Tài Liệu Đào Tạo — Cài Đặt 9BizClaw

Đọc tài liệu này trước khi làm bài kiểm tra. Thời gian đọc: ~15 phút.

---

## 1. Chuẩn Bị Trước Khi Cài

CEO cần chuẩn bị sẵn **5 thứ bắt buộc** trước buổi remote:

| # | Cần chuẩn bị | Chi tiết |
|---|-------------|----------|
| 1 | Tài khoản Telegram | Cài Telegram trên điện thoại hoặc máy tính |
| 2 | Tài khoản Zalo | Đang đăng nhập Zalo **trên chính máy tính** sẽ cài 9BizClaw. Zalo trên điện thoại KHÔNG đủ — app cần kết nối Zalo desktop |
| 3 | Tài khoản ChatGPT | Đăng ký tại chatgpt.com (miễn phí hoặc Plus đều được) |
| 4 | Máy tính | Windows 10+ hoặc macOS 11+, tối thiểu 8GB RAM, CPU 4 nhân trở lên, 500MB trống |
| 5 | License key | Dạng `CLAW-eyJlIjoiZW1haWxA...` — nhận file .txt từ 9Biz. Mở file, copy TOÀN BỘ key, paste vào app |

**Không bắt buộc nhưng nên có sẵn:** Tên công ty, địa chỉ, số hotline, bảng giá sản phẩm (PDF/Word/Excel).

---

## 2. Cài Đặt & Màn Hình Splash

### Cài đặt

- **Windows:** Mở file `.exe` > chờ cài (1-2 phút) > app tự mở.
- **Mac:** Mở file `.dmg` > kéo icon vào Applications > mở app.

### Lần đầu mở app — Tải thêm dữ liệu

Lần đầu mở, app cần tải thêm dữ liệu để chạy được. Mất **2-10 phút** tuỳ tốc độ mạng. Cần internet ổn định trong lúc tải. Sau lần đầu, app chỉ cần mạng để kết nối ChatGPT/Telegram/Zalo.

**6 bước trên màn hình splash:**

| Bước | Tên | Ý nghĩa |
|------|-----|---------|
| 1 | Node.js Runtime | Tải engine xử lý |
| 2 | Cài đặt packages | Các gói phần mềm cần thiết |
| 3 | Plugin Zalo | Kết nối Zalo |
| 4 | gogcli | Công cụ Google Workspace |
| 5 | Mô hình AI | Kiểm tra kết nối AI |
| 6 | Hoàn tất | Sẵn sàng |

**Trạng thái màu:** Xám = chưa đến, Cam = đang chạy, Xanh lá = xong, Đỏ = lỗi.

### Lỗi thường gặp khi tải

| Lỗi | Nguyên nhân | Xử lý |
|-----|-------------|-------|
| **EBUSY / File in use** | Windows Defender đang quét file | Thêm thư mục `%APPDATA%\9bizclaw` vào Windows Security Exclusions. Chỉ cần thêm Exclusions, KHÔNG cần tắt Defender |
| **ETIMEDOUT** | Mạng bị chặn (firewall công ty) | Dùng hotspot 4G điện thoại cho lần tải đầu (~170MB) |
| **EACCES / Permission** | Không có quyền ghi | Windows: chạy "Run as administrator". Mac: cho phép trong Security & Privacy |
| **ENOSPC / Disk full** | Ổ đĩa đầy | Giải phóng ít nhất 500MB trên ổ C: (Win) hoặc ổ chính (Mac) |

**Mẹo:** Nếu lỗi, app có nút "Thử lại" (tự retry 4 lần). Đợi 30 giây trước khi làm gì khác.

---

## 3. Kích Hoạt License

### Đặc điểm quan trọng

- Format key: `CLAW-...` (chuỗi dài, bắt đầu bằng CLAW-)
- **Khoá theo phần cứng máy** (hardware lock) — KHÔNG copy sang máy khác được
- Mở file .txt nhận từ 9Biz, copy TOÀN BỘ key, paste vào app — **KHÔNG gõ tay** (dễ sai ký tự)
- Kiểm tra: không có dấu cách thừa ở đầu hoặc cuối (paste vào Notepad trước để kiểm tra)

### Lỗi thường gặp

| Thông báo | Cách xử lý |
|-----------|-----------|
| "Key không hợp lệ" | Mở lại file .txt, copy toàn bộ, không gõ tay, không có dấu cách thừa |
| "Key đã hết hạn" | Liên hệ tech@modoro.com.vn để gia hạn |
| "Bind tới máy khác" | Key đã dùng trên máy cũ — liên hệ support để reset |

---

## 4. Wizard 4 Bước

Sau kích hoạt, app chạy Wizard. Mỗi bước bắt buộc.

### Bước 1 — Thông tin cơ bản

Nhập: Họ tên CEO, tên công ty, tên trợ lý ảo (để trống = bot xưng "em"), cách xưng hô (anh/chị/sếp).

### Bước 2 — Kết nối ChatGPT

1. Nhấn "Kết nối ChatGPT" — trình duyệt mở trang đăng nhập
2. Đăng nhập ChatGPT > nhấn "Connect"
3. Quay lại app > nhấn "Kiểm tra kết nối"
4. Thành công: hiện chữ xanh "ChatGPT đã kết nối"

**Nếu lỗi 500:** Đóng app, mở lại (app có auto-fix). Vẫn 500 sau 3 lần: nhấn "Mở thư mục log" > gửi file `9router.log` cho tech@modoro.com.vn.

### Bước 3 — Kết nối Telegram (quan trọng nhất)

**3 việc:**

| Việc | Cách làm |
|------|----------|
| Tạo bot | Telegram > tìm @BotFather > gửi `/newbot` > đặt tên + username (kết thúc bằng "bot") > copy token |
| Lấy User ID | Telegram > tìm @userinfobot > gửi `/start` > copy dãy số ID |
| Kiểm tra | App gửi tin thử — CEO phải nhận được trên Telegram |

**Token đúng format:** `1234567890:ABCdefGHI...` (số + dấu : + chữ). Copy TOÀN BỘ dòng.

### Bước 4 — Hoàn tất

Hiện tóm tắt: tên, AI kết nối, Telegram kết nối. Nhấn "Khởi động trợ lý" — xong wizard.

---

## 5. Xác Nhận Cài Đặt Thành Công

Wizard hiện "Hoàn tất" chỉ nghĩa là cấu hình đã lưu. **Cài thành công hay chưa, phải thử gửi tin cho bot — bot trả lời mới là xong.**

### Checklist xác nhận

1. Mở Telegram > tìm bot vừa tạo > gửi bất kỳ tin nào
2. **Chờ 30-60 giây** (lần đầu gateway cần khởi động)
3. Bot trả lời = **thành công**
4. Mở Dashboard > sidebar > chấm Telegram **xanh** = sẵn sàng

**Nếu bot không trả lời sau 60 giây:**
- App đã mở chưa? (phải mở, có thể thu nhỏ xuống tray)
- Đã nhấn /start trên bot Telegram chưa?
- Dashboard > sidebar > chấm Telegram xanh hay đỏ?
- ChatGPT đã kết nối chưa? (kiểm tra bước 2 wizard)

---

## 6. Xử Lý Lỗi Thường Gặp

### EBUSY / File in use (Windows)

**Nguyên nhân:** Windows Defender quét file trong thư mục app.
**Xử lý:** Windows Security > Virus & threat protection > Exclusions > Add Folder > `C:\Users\[tên]\AppData\Roaming\9bizclaw`. Chỉ cần thêm Exclusions, KHÔNG cần tắt Defender.

### Lỗi 500 khi "Thiết lập AI" (Wizard bước 2)

**Nguyên nhân:** 9Router (proxy AI) lỗi nội bộ.
**Xử lý:** Đóng app > mở lại (app có auto-fix). Nếu vẫn 500 sau 3 lần: nhấn "Mở thư mục log" > gửi `9router.log` cho support.

### Windows SmartScreen chặn mở app

**Xử lý:** Khi thấy cảnh báo "Windows protected your PC": nhấn **"More info"** > nhấn **"Run anyway"**.

### macOS Gatekeeper chặn mở app

**Xử lý:** Mở Terminal > chạy: `xattr -dr com.apple.quarantine /Applications/9BizClaw.app` > mở lại app.

### Firewall chặn splash (ETIMEDOUT)

**Xử lý:** Dùng hotspot 4G điện thoại cho lần tải đầu (~170MB). Sau đó dùng mạng công ty bình thường.
Nếu phải dùng mạng công ty: nhờ IT mở `registry.npmjs.org`, `nodejs.org`, `github.com`.

### Key không hợp lệ

**Xử lý:**
1. Key bắt đầu bằng `CLAW-` — mở file .txt, copy TOÀN BỘ
2. KHÔNG gõ tay
3. Không có dấu cách thừa đầu/cuối
4. Thử paste vào Notepad kiểm tra trước

---

## 7. Bàn Giao Cho CEO

Trước khi kết thúc buổi remote, đảm bảo **3 việc tối thiểu:**

| # | Việc | Cách xác nhận |
|---|------|---------------|
| 1 | Bot trả lời Telegram | Gửi tin thử > bot reply trong 30-60 giây |
| 2 | CEO biết cách dùng cơ bản | Hướng dẫn: mở Telegram > gửi tin cho bot > nhận reply |
| 3 | Nhắc để máy mở | App phải mở để bot và cron hoạt động. Có thể thu nhỏ xuống system tray (khay hệ thống) |

**Lưu ý thêm:**
- **Mac đóng nắp = sleep = bot và lịch tự động ngừng hoạt động.** Nhắc CEO: vào Energy Saver > tắt sleep, hoặc để nắp mở khi muốn bot chạy 24/7.
- **CEO hỏi "dữ liệu có lên mạng không?"** → Trả lời: "100% trên máy anh/chị, không ai ngoài anh/chị truy cập được. Không lên cloud của 9Biz hay bất kỳ đâu."
- Hướng dẫn CEO dùng "Xuất backup" trong Dashboard định kỳ (Dashboard > menu hỗ trợ góc dưới phải).
- **CEO muốn bot biết giá sản phẩm:** Hướng dẫn upload file bảng giá (PDF/Word/Excel) vào **Dashboard > tab Tài liệu > thư mục Sản phẩm**. Bot sẽ tự đọc và trả lời khách Zalo dựa trên file này.

---

## 8. Khi Nào Liên Hệ Support

Liên hệ **tech@modoro.com.vn** khi:

| Tình huống | Vì sao cần support |
|------------|-------------------|
| Đóng mở app 2-3 lần vẫn lỗi | Auto-fix đã thử nhưng không được |
| Lỗi license (hết hạn, chuyển máy, thu hồi) | Cần reset key phía server |
| Splash lỗi sau 3 lần "Thử lại" | Lỗi nghiêm trọng hơn bình thường |
| Cần hướng dẫn tính năng nâng cao | Ngoài phạm vi cài đặt cơ bản |

**Gửi kèm khi liên hệ support:**
- Mô tả ngắn gọn lỗi
- Ảnh chụp màn hình lỗi
- Hệ điều hành (Windows/Mac, phiên bản)
- File log (nếu support yêu cầu): `%APPDATA%\9bizclaw\logs\` (Win) hoặc `~/Library/Application Support/9bizclaw/logs/` (Mac)

---

## 9. Thông Tin Quan Trọng

### Đường dẫn file

| Thứ | Windows | Mac |
|-----|---------|-----|
| Dữ liệu app | `%APPDATA%\9bizclaw\` | `~/Library/Application Support/9bizclaw/` |
| License | `%APPDATA%\9bizclaw\license.json` | `~/Library/Application Support/9bizclaw/license.json` |
| Logs | `%APPDATA%\9bizclaw\logs\` | `~/Library/Application Support/9bizclaw/logs/` |
| Config | `%USERPROFILE%\.openclaw\openclaw.json` | `~/.openclaw/openclaw.json` |

### Dữ liệu & Backup

- **Dữ liệu 100% trên máy** — KHÔNG gửi lên cloud của 9Biz. Không ai ngoài CEO truy cập được.
- **Cập nhật app KHÔNG mất dữ liệu** — dữ liệu nằm riêng (`%APPDATA%\9bizclaw\`), cài mới chỉ ghi đè app.
- **Backup:** Dashboard > menu hỗ trợ (góc dưới phải) > "Xuất dữ liệu (backup)". Khuyên CEO backup định kỳ vào USB hoặc cloud cá nhân.
- **Mất máy = mất dữ liệu** nếu chưa backup. License key KHÔNG phải backup — chỉ là bản quyền, không chứa dữ liệu.

### Liên hệ

| Kênh | Chi tiết |
|------|----------|
| Email kỹ thuật | tech@modoro.com.vn |
| Nhóm Telegram | Link trong app — Dashboard > menu hỗ trợ > "Liên hệ 9Biz" |
