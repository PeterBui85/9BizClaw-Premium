# 9BizClaw v2.4.4 — Cơ sở kiến thức xử lý sự cố

> Bot hỗ trợ tra cứu bằng keyword từ tin nhắn khách: error code, triệu chứng tiếng Việt, tên màn hình.
> Mỗi mục: Triệu chứng → Nguyên nhân → Cách sửa → Nếu vẫn lỗi.

---

## A. CÀI ĐẶT LẦN ĐẦU (MÀN HÌNH SPLASH)

Khi mở app lần đầu, màn hình splash tải Node.js (~20MB) + packages (~145MB) + gogcli (~5MB). Tổng ~170MB. Cần internet ổn định.

### A1. Splash đứng im — thanh % không tăng
**Keyword:** splash đứng, không chạy, đứng im, không tải
**Nguyên nhân:** Mạng chậm hoặc bị chặn.
**Sửa:**
1. Kiểm tra internet — mở trình duyệt vào web bất kỳ
2. Tắt VPN nếu đang bật
3. Thử dùng 4G hotspot từ điện thoại
4. Nếu mạng công ty: hỏi IT mở `registry.npmjs.org` và `nodejs.org`
**Nếu vẫn lỗi:** Nhấn **Copy lỗi** trên splash → gửi support.

### A2. ETIMEDOUT / Connection refused / ECONNREFUSED
**Keyword:** ETIMEDOUT, connection refused, ECONNREFUSED, ENETUNREACH, timeout
**Hiển thị:** "Kết nối quá chậm hoặc timeout" hoặc "Máy chủ từ chối kết nối"
**Sửa:**
1. Đổi mạng (4G hotspot)
2. Tắt VPN
3. Mạng công ty: hỏi IT mở `registry.npmjs.org`, `nodejs.org`, `github.com`
4. App tự retry 4 lần — chờ 2-3 phút
**Nếu vẫn lỗi:** Copy lỗi → gửi support kèm tên nhà mạng.

### A3. ENOSPC / Disk full / Ổ đĩa đầy
**Keyword:** ENOSPC, disk full, no space, ổ đĩa đầy, không đủ dung lượng
**Hiển thị:** "Ổ đĩa gần đầy. Giải phóng ít nhất 500 MB"
**Sửa:**
1. Dọn ổ C: (Windows) hoặc ổ chính (Mac) — xóa file tạm, dọn thùng rác
2. Cần ít nhất **500MB** trống
3. Kiểm tra: Windows chuột phải ổ C: → Properties; Mac: Apple → About This Mac → Storage
**Nếu vẫn lỗi:** Xóa folder `%APPDATA%\9bizclaw\vendor` rồi mở lại app.

### A4. EACCES / Permission denied / Không có quyền
**Keyword:** EACCES, permission denied, access denied, không có quyền, EPERM
**Hiển thị:** "Không có quyền ghi vào thư mục"
**Sửa:**
- **Windows:** Chuột phải 9BizClaw → "Run as administrator"
- **Mac:** System Preferences → Security & Privacy → cho phép 9BizClaw
- **Máy công ty:** Liên hệ IT cấp quyền ghi `%APPDATA%` (Win) / `~/Library/Application Support/` (Mac)

### A5. EBUSY / File in use / Bị khóa (Windows)
**Keyword:** EBUSY, file in use, resource busy, bị khóa, locked
**Hiển thị:** "File đang bị khóa (thường do Windows Defender quét)"
**Sửa:**
1. Chờ 30 giây — app tự retry 4 lần
2. Thêm thư mục vào Exclusions: Windows Security → Virus & threat protection → Exclusions → Add Folder → `C:\Users\[tên]\AppData\Roaming\9bizclaw`
3. Đóng app, mở lại

### A6. SSL / Certificate / Chứng chỉ lỗi
**Keyword:** CERT_HAS_EXPIRED, SSL, certificate, UNABLE_TO_VERIFY, chứng chỉ, self-signed
**Hiển thị:** "Chứng chỉ TLS hết hạn" hoặc "Lỗi xác thực chứng chỉ TLS"
**Sửa:**
1. Kiểm tra ngày giờ máy tính — phải đúng
2. Mạng công ty có proxy HTTPS: liên hệ IT
3. Thử mạng khác (4G hotspot)

### A7. DNS / Không phân giải được
**Keyword:** ENOTFOUND, DNS, getaddrinfo, không phân giải
**Hiển thị:** "Không phân giải được địa chỉ máy chủ"
**Sửa:**
1. Đổi DNS: dùng Google DNS 8.8.8.8 hoặc Cloudflare 1.1.1.1
2. Windows: Control Panel → Network → Change adapter → IPv4 → DNS
3. Mac: System Preferences → Network → Advanced → DNS
4. Thử mạng khác

### A8. npm cert error / npm SSL
**Keyword:** npm ERR! code CERT, npm cert, npm SSL, strict-ssl
**Hiển thị:** "npm không xác thực được chứng chỉ — có thể do proxy corporate"
**Sửa:**
1. Nếu mạng công ty có proxy: hỏi IT
2. Hoặc thử mạng 4G hotspot
3. App sẽ tự cấu hình npm ssl sau khi đổi mạng

### A9. npm ECONNRESET / Mạng bị ngắt giữa chừng
**Keyword:** ECONNRESET, reset kết nối, socket hang up
**Hiển thị:** "npm bị reset kết nối — proxy hoặc mạng không ổn định"
**Sửa:** Mạng không ổn định. App tự retry. Nếu lặp → đổi mạng.

### A10. SHA256 không khớp / File download bị sửa
**Keyword:** SHA256, hash, checksum, không khớp, corrupt
**Hiển thị:** "Node.js archive SHA256 không khớp sau 2 lần tải"
**Nguyên nhân:** Proxy/firewall sửa nội dung file tải về, hoặc file bị hỏng.
**Sửa:**
1. Đổi mạng — proxy đang can thiệp vào download
2. Tắt VPN
3. Thử 4G hotspot

### A11. Node.js giải nén lỗi
**Keyword:** giải nén, extract, extraction failed, tar, zip
**Hiển thị:** "Không giải nén được Node.js"
**Sửa:**
1. Kiểm tra dung lượng ổ đĩa (cần 500MB trống)
2. Antivirus có thể chặn giải nén → thêm Exclusions (xem A5)
3. Đóng app, mở lại — app tự xóa file hỏng và tải lại

### A12. npm install timeout (>15 phút)
**Keyword:** timed out, 900s, quá lâu, 15 phút
**Hiển thị:** "npm install timed out after 900s"
**Sửa:** Mạng quá chậm. Đổi sang mạng nhanh hơn (Wi-Fi 5GHz hoặc 4G).

### A13. npm install đứng (không output 90 giây)
**Keyword:** hung, no output, đứng, treo
**Hiển thị:** "npm install hung — no output for 90s"
**Sửa:** App tự kill process và retry. Nếu lặp → antivirus đang quét. Thêm Exclusions (xem A5).

### A14. Package version sai sau cài
**Keyword:** verification failed, expected version, version mismatch
**Hiển thị:** "Verification failed for [package]: expected [ver]"
**Sửa:** Xóa folder `%APPDATA%\9bizclaw\vendor\node_modules` → mở lại app để cài lại.

### A15. Plugin modoro-zalo không tìm thấy
**Keyword:** modoro-zalo not found, plugin missing
**Hiển thị:** "modoro-zalo plugin not found"
**Nguyên nhân:** File cài đặt (.exe/.dmg) bị lỗi.
**Sửa:** Tải lại file cài đặt mới nhất từ support.

### A16. gogcli tải lỗi
**Keyword:** gogcli, google workspace cli
**Hiển thị:** "Không tải được gogcli"
**Sửa:** Không nghiêm trọng — Google Workspace features sẽ không hoạt động nhưng bot vẫn chạy bình thường. Đóng app mở lại để thử tải lại.

### A17. Cài xong nhưng lần sau mở phải cài lại
**Keyword:** cài lại, lặp lại, mỗi lần mở
**Nguyên nhân:** Antivirus xóa file trong `vendor/`, hoặc ổ đĩa đầy không ghi được marker file.
**Sửa:**
1. Thêm `%APPDATA%\9bizclaw` vào Exclusions antivirus (xem A5)
2. Kiểm tra dung lượng ổ đĩa (xem A3)

### A18. "Installation already in progress"
**Keyword:** already in progress, đang cài
**Sửa:** App đang cài ở cửa sổ khác. Đóng tất cả → mở lại 1 lần.

---

## B. KÍCH HOẠT LICENSE

### B1. "Key không hợp lệ" / Invalid key
**Keyword:** key không hợp lệ, invalid key, sai key
**Sửa:**
1. Key đúng format: `CLAW-...` (chữ hoa + số + dấu gạch)
2. Copy từ email gốc — KHÔNG gõ tay
3. Không có dấu cách ở đầu/cuối
4. Thử paste vào Notepad trước để kiểm tra

### B2. "Key đã hết hạn" / Expired
**Keyword:** hết hạn, expired, key hết
**Sửa:** Liên hệ support để gia hạn hoặc mua key mới. Email: tech@modoro.com.vn

### B3. "Key đã được kích hoạt trên máy khác" / Machine mismatch
**Keyword:** máy khác, machine mismatch, already activated, đã kích hoạt
**Nguyên nhân:** Key bị khóa vào phần cứng máy cũ (hardware lock).
**Sửa:** Liên hệ support để reset key — cung cấp email đăng ký + tên máy cũ.

### B4. "Key đã bị thu hồi" / Revoked
**Keyword:** thu hồi, revoked, bị khóa
**Sửa:** Liên hệ support. Email: tech@modoro.com.vn

### B5. "Không ghi được license" / Write failed
**Keyword:** write failed, không ghi được, không lưu
**Nguyên nhân:** Không có quyền ghi vào thư mục app data.
**Sửa:** Windows: Run as administrator. Mac: kiểm tra quyền thư mục.

### B6. "Không kết nối được máy chủ" / Offline
**Keyword:** offline, không kết nối, server, máy chủ
**Hiển thị:** "Không kết nối được máy chủ kiểm tra bản quyền"
**Sửa:** Kiểm tra internet. Kích hoạt cần mạng để verify key lần đầu.

### B7. License file bị sửa / seal_broken
**Keyword:** seal broken, tampered, bị sửa
**Nguyên nhân:** File `license.json` bị chỉnh sửa hoặc copy từ máy khác.
**Sửa:** Xóa file `license.json` → mở app → nhập key lại.
- Windows: `%APPDATA%\9bizclaw\license.json`
- Mac: `~/Library/Application Support/9bizclaw/license.json`

---

## C. WIZARD THIẾT LẬP

### C1. Bước 1 — Không biết lấy Telegram Bot Token
**Keyword:** token, BotFather, lấy token, token ở đâu, tạo bot
**Hướng dẫn:**
1. Mở Telegram → tìm **@BotFather** (có dấu tick xanh)
2. Gửi `/newbot`
3. Đặt tên bot (VD: "Trợ Lý ABC")
4. Đặt username (VD: `troly_abc_bot` — PHẢI kết thúc bằng `bot`)
5. BotFather gửi token dạng `1234567890:ABCdefGHI...` → copy TOÀN BỘ
6. Paste vào ô "Bot Token" trong wizard

### C2. Bước 1 — "Token không hợp lệ"
**Keyword:** token không hợp lệ, token sai, invalid token
**Sửa:**
1. BotFather → `/mybots` → chọn bot → API Token → copy lại
2. Copy TOÀN BỘ dòng (số + dấu : + chữ)
3. Không có dấu cách đầu/cuối
4. Format đúng: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

### C3. Bước 1 — "Chưa có Mã nhận diện (User ID)"
**Keyword:** user ID, mã nhận diện, ID Telegram, lấy ID
**Hướng dẫn lấy Telegram User ID:**
1. Mở Telegram → tìm **@userinfobot**
2. Gửi `/start` → bot trả về User ID (dãy số ~10 chữ số)
3. Copy dãy số đó → paste vào ô "User ID" trong wizard

### C4. Bước 1 — "User ID chỉ gồm chữ số"
**Keyword:** user ID sai, chữ số, format ID
**Sửa:** User ID chỉ có số (VD: `5738291046`). Không có chữ, không có @.

### C5. Bước 2 — Lỗi 500 khi thiết lập AI
**Keyword:** lỗi 500, 500, thiết lập AI, 9Router lỗi, AI không phản hồi
**Hiển thị:** Nhấn "Kiểm tra kết nối" → lỗi 500.
**Nguyên nhân:** 9Router (proxy AI) lỗi nội bộ — thường do better-sqlite3 không tương thích CPU.
**Sửa:**
1. Đóng app, mở lại → thử bước 2 lần nữa (app có auto-fix)
2. Nếu vẫn 500 sau 3 lần: nhấn **"Mở thư mục log"** → gửi `9router.log` cho support
3. Vị trí log: Windows `%APPDATA%\9bizclaw\logs\9router.log` / Mac `~/Library/Application Support/9bizclaw/logs/9router.log`

### C6. Bước 2 — "Đang kết nối..." chạy mãi
**Keyword:** đang kết nối, chạy mãi, loading, xoay mãi
**Sửa:**
1. Chờ 30-60 giây (9Router cần thời gian khởi động lần đầu)
2. Nếu > 2 phút: đóng app → mở lại → thử bước 2 lại
3. Kiểm tra mạng internet

### C7. Bước 2 — "Chưa tìm thấy kết nối ChatGPT"
**Keyword:** chưa tìm thấy, ChatGPT chưa kết nối, đăng nhập ChatGPT
**Hiển thị:** "Chưa tìm thấy kết nối ChatGPT. Nhấn Kết nối ChatGPT..."
**Sửa:**
1. Nhấn nút "Kết nối ChatGPT" → trình duyệt mở trang đăng nhập
2. Đăng nhập tài khoản ChatGPT (miễn phí hoặc Plus đều được)
3. Sau khi đăng nhập xong → quay lại app → nhấn "Kiểm tra kết nối"
4. Nếu dùng nhiều trình duyệt: đảm bảo đăng nhập trên trình duyệt MẶC ĐỊNH

### C8. Bước 2 — Ollama key lỗi 401
**Keyword:** 401, unauthorized, key sai, Ollama lỗi
**Hiển thị:** "Ollama trả về 401"
**Sửa:**
1. Vào ollama.com/settings/keys → tạo key mới
2. Copy key mới → paste lại trong wizard
3. Nếu chắc chắn key đúng: có thể firewall/Cloudflare chặn → thử đổi mạng (4G, VPN khác)

### C9. Bước 2 — "Ollama không có model nào"
**Keyword:** không có model, empty, rỗng, chưa subscribe
**Hiển thị:** "Key hợp lệ nhưng không có model nào"
**Sửa:** Tài khoản Ollama chưa subscribe gói. Vào ollama.com → chọn gói → thử lại.

### C10. Bước 2 — "Ollama rate limit 429"
**Keyword:** 429, rate limit, quá nhiều request, too many
**Hiển thị:** "Ollama trả về 429 (rate limit)"
**Sửa:** Đợi 1-2 phút rồi thử lại. Nếu lặp → đang dùng quá nhiều thiết bị cùng lúc.

### C11. Bước 2 — "Captive portal" / Mạng Wi-Fi quán cafe
**Keyword:** captive portal, Wi-Fi khách sạn, quán cafe, trang đăng nhập
**Hiển thị:** "Phản hồi không đúng định dạng — có thể đang ở mạng captive portal"
**Sửa:** Mở trình duyệt → đăng nhập Wi-Fi → quay lại app thử lại. Hoặc dùng 4G.

### C12. Bước 3 — Zalo QR không hiện
**Keyword:** QR không hiện, QR trống, Zalo QR, bước 3
**Sửa:**
1. Chờ 10-15 giây — cần thời gian khởi động
2. Nhấn "Refresh QR" nếu có
3. Đóng app → mở lại → wizard tự quay lại bước 3

### C13. Bước 3 — Quét QR nhưng lỗi
**Keyword:** quét QR lỗi, QR không nhận, scan QR
**Sửa:**
1. Zalo trên điện thoại phải đang mở và đã đăng nhập
2. Tắt Zalo Web/PC trên máy khác (chỉ 1 phiên web/PC)
3. Refresh QR → quét lại

### C14. Bước 4 — "Thiếu thông tin" / "Thiết lập chưa hoàn tất"
**Keyword:** thiếu thông tin, chưa hoàn tất, bước 4 lỗi
**Sửa:** Quay lại kiểm tra các bước trước — có bước nào bỏ qua hoặc chưa kết nối.

---

## D. BOT KHÔNG TRẢ LỜI

### D1. Bot Telegram im lặng
**Keyword:** Telegram im lặng, bot không trả lời, không reply, Telegram không phản hồi
**Kiểm tra theo thứ tự:**
1. App đã mở chưa? → Mở 9BizClaw trên máy tính
2. Dashboard → sidebar → chấm Telegram **xanh** chưa? → Nếu đỏ: kiểm tra token (bước 3 wizard)
3. Đã nhấn **/start** trên bot Telegram chưa? → Mở bot → nhấn Start
4. Bot đang tạm dừng? → Dashboard → Telegram → bấm "Tiếp tục"
5. Gateway restart? → Đóng app hoàn toàn (cả system tray) → chờ 5s → mở lại → chờ 60s
6. ChatGPT/AI đã kết nối? → Dashboard → AI Models → kiểm tra

### D2. Bot Zalo im lặng
**Keyword:** Zalo im lặng, Zalo không trả lời, khách nhắn không reply
**Kiểm tra theo thứ tự:**
1. Dashboard → Zalo → chấm **xanh** chưa? → Nếu đỏ: đóng app mở lại
2. Kênh Zalo bật chưa? → Dashboard → toggle Zalo = **Bật**
3. Khách bị chặn? → Dashboard → Zalo → Blocklist → kiểm tra
4. Chế độ nhóm = Tắt? → Đổi sang **@mention** hoặc **Mọi tin**
5. Chế độ bạn bè? → Dashboard → Zalo → Bạn bè → kiểm tra toggle
6. Bot tạm dừng? → Dashboard → Zalo → bấm "Tiếp tục"
7. Vừa mở app? → Chờ 15-30 giây cho listener khởi động

### D3. Bot trả lời "Gateway is restarting"
**Keyword:** gateway restarting, đang restart, please wait, khởi động lại
**Sửa:**
1. Đóng app **hoàn toàn** — cả icon trong system tray (Windows) hoặc dock (Mac)
2. Chờ 5 giây
3. Mở lại → chờ 60 giây
4. Nếu lặp 3+ lần: chụp màn hình console → gửi support

### D4. Bot trả lời rất chậm (> 30 giây)
**Keyword:** chậm, lâu, 30 giây, mất lâu, slow
**Giải thích:** Tin nhắn đầu tiên trong phiên luôn chậm hơn (~20-30s) vì bot cần khởi tạo. Tin tiếp theo sẽ nhanh hơn (~5-15s nhờ session freeze cache).
**Nếu luôn chậm:**
1. Kiểm tra mạng internet
2. AI provider (ChatGPT/Ollama) có thể đang quá tải
3. Đóng app → mở lại để reset session

### D5. Bot reply tiếng Anh hoặc nội dung lạ
**Keyword:** tiếng Anh, English, nội dung lạ, trả lời sai
**Sửa:** Đóng app → mở lại. Nếu vẫn lỗi: liên hệ support (có thể file AGENTS.md bị sửa).

### D6. "Mất kết nối mạng — đang khởi động lại..."
**Keyword:** mất kết nối, tự khởi động lại, network, reconnect
**Giải thích:** App tự phát hiện mạng đứt và restart. Đây là hành vi bình thường.
**Nếu lặp quá nhiều:** Kiểm tra mạng internet ổn định. Nếu mạng OK mà vẫn lặp: đóng app mở lại.

### D7. "Đã thử khởi động lại nhiều lần — đợi 10 phút"
**Keyword:** nhiều lần, 10 phút, rate limit, đợi
**Nguyên nhân:** App restart quá nhiều lần trong 1 giờ (>5 lần) → tự cooldown 10 phút.
**Sửa:** Chờ 10 phút. Nếu vẫn lỗi sau 10 phút → đóng app hoàn toàn → kiểm tra mạng → mở lại.

### D8. Zalo listener thoát / chấm đỏ
**Keyword:** listener thoát, Zalo đỏ, Zalo chấm đỏ, reconnecting
**Hiển thị:** "Listener đã thoát" hoặc chấm Zalo chuyển đỏ
**Sửa:**
1. App tự reconnect trong 1-3 giây
2. Nếu đỏ kéo dài > 30 giây: đóng app → mở lại
3. Kiểm tra Zalo trên điện thoại vẫn đang đăng nhập

---

## E. DASHBOARD

### E1. Dashboard trang trắng
**Keyword:** trang trắng, blank, không hiện gì, white screen
**Sửa:** Đóng app → mở lại. Nếu vẫn trắng: xóa thư mục Cache trong `%APPDATA%\9bizclaw\` (Win) / `~/Library/Application Support/9bizclaw/` (Mac).

### E2. Tab 9Router / OpenClaw hiện trắng
**Keyword:** 9Router trắng, OpenClaw trắng, webview trắng, iframe lỗi
**Sửa:** Đóng app → mở lại. Nếu vẫn lỗi → cập nhật lên version mới nhất.

### E3. Tab AI Models — "combo rỗng" / không có model
**Keyword:** combo rỗng, không có model, AI Models trống
**Hiển thị:** Console có "combo 'main' has 0 models"
**Sửa:** Dashboard → AI Models → kiểm tra kết nối ChatGPT/Ollama. Nếu chưa kết nối → chạy lại wizard bước 2.

---

## F. CRON / LỊCH TỰ ĐỘNG

### F1. Báo cáo sáng/tối không gửi
**Keyword:** báo cáo không gửi, cron không chạy, sáng không gửi, tối không gửi
**Kiểm tra:**
1. App đang mở trên máy tính? → Cron chỉ chạy khi app mở
2. Dashboard → Lịch → cron tương ứng **enabled** (bật)?
3. Máy tính có sleep/hibernate lúc giờ cron? → Để máy không sleep
4. Mac đóng nắp? → Cron miss khi Mac sleep (dù đã có powerSaveBlocker)

### F2. Cron fail — "require is not defined"
**Keyword:** require is not defined, ReferenceError, cron lỗi require
**Nguyên nhân:** Session freeze patches phiên bản cũ dùng `require()` trong ESM.
**Sửa:** Cập nhật app lên version **>= 2.4.4**. Lỗi đã được fix.

### F3. Cron fail — "session file locked"
**Keyword:** session file locked, timeout 10000ms, locked, file lock
**Nguyên nhân:** File lock từ lần chạy trước bị crash.
**Sửa:** Đóng app → mở lại. Lock file tự xóa khi restart.

### F4. Cron fail — "thất bại sau 3 lần"
**Keyword:** thất bại sau 3 lần, 3 retries, retry failed
**Sửa:**
1. Kiểm tra mạng internet
2. Kiểm tra AI provider đã kết nối (Dashboard → AI Models)
3. Đóng app → mở lại
4. Nếu vẫn fail: copy error từ Telegram → gửi support

### F5. Cron Zalo bị chặn — "Zalo đang tạm dừng"
**Keyword:** cron bị chặn, Zalo tạm dừng, cron Zalo không gửi
**Sửa:** Dashboard → Zalo → bấm "Tiếp tục" để bỏ tạm dừng.

### F6. schedules.json bị lỗi
**Keyword:** schedules.json corrupt, lỗi JSON, lịch bị hỏng
**Hiển thị:** "Cảnh báo: schedules.json bị lỗi JSON"
**Sửa:** App tự backup file hỏng và fall back về lịch mặc định. Vào Dashboard → Lịch để kiểm tra lại.

---

## G. KNOWLEDGE / TÀI LIỆU

### G1. Upload PDF lỗi "DOMMatrix is not defined"
**Keyword:** DOMMatrix, PDF lỗi, PDF extract failed
**Sửa:** Cập nhật app — version mới dùng pdf-parse 1.1.1 (đã fix).

### G2. Upload file nhưng không thấy trong danh sách
**Keyword:** upload xong không thấy, file biến mất, danh sách trống
**Nguyên nhân:** Database (better-sqlite3) bị lỗi ABI. File vẫn còn trên ổ đĩa.
**Sửa:** Đóng app → mở lại (app tự fix ABI mismatch + backfill từ disk).

### G3. Knowledge tab trống sau update
**Keyword:** knowledge trống, tài liệu biến mất, mất tài liệu
**Sửa:** File vẫn còn trên disk. Mở lại app → hệ thống tự backfill.

### G4. Upload file quá lớn
**Keyword:** quá lớn, file size, giới hạn, limit
**Giới hạn:** Tối đa 10MB/file. Nếu file lớn hơn → chia nhỏ hoặc tóm tắt trước khi upload.

### G5. "Ổ đĩa đầy — không lưu được chỉ mục"
**Keyword:** ổ đĩa đầy, không lưu, RAG, chỉ mục
**Sửa:** Giải phóng 500MB → khởi động lại app.

---

## H. FACEBOOK

### H1. "Token Facebook trống" / Chưa kết nối
**Keyword:** Facebook chưa kết nối, token trống, chưa kết nối Facebook
**Sửa:** Dashboard → Facebook → "Kết nối Fanpage" → đăng nhập Facebook → chọn Fanpage.

### H2. "Không tìm thấy Fanpage có quyền"
**Keyword:** không tìm thấy Fanpage, quyền, permission, Fanpage
**Nguyên nhân:** Token không có quyền publish trên Fanpage.
**Sửa:** Kết nối lại → khi Facebook hỏi quyền → tick **tất cả** quyền cho Fanpage.

### H3. Post Facebook lỗi
**Keyword:** post lỗi, đăng bài lỗi, Graph API error, Facebook API
**Sửa:**
1. Kiểm tra token còn hợp lệ: Dashboard → Facebook → "Kiểm tra kết nối"
2. Nếu hết hạn: kết nối lại
3. Nếu rate limit (429): đợi 10 phút rồi thử lại

### H4. "CEO chưa duyệt trước giờ đăng"
**Keyword:** chưa duyệt, skipped, bỏ qua, chưa approve
**Giải thích:** Bài Facebook lên lịch nhưng CEO chưa reply "fb ok" trước giờ đăng → bài bị skip.
**Sửa:** Reply "fb ok" trên Telegram để duyệt. Duyệt muộn vẫn đăng được (đăng ngay).

### H5. Không nhận được preview ảnh Facebook
**Keyword:** preview không nhận, ảnh không gửi, fb preview
**Nguyên nhân:** Lead time mặc định 30 phút. Preview gửi 30 phút trước giờ đăng.
**Sửa:** Tạo lịch cách giờ đăng ít nhất 30 phút. Hoặc tạo lịch sát giờ → preview gửi ngay.

---

## I. GOOGLE WORKSPACE

### I1. "Google API chưa được bật"
**Keyword:** API chưa bật, Google API, enable API
**Hiển thị:** "Google API cho [service] chưa được bật trong Google Cloud"
**Sửa:** Vào Google Cloud Console → APIs & Services → Enable API → bật API cần dùng (Gmail, Calendar, Drive...).

### I2. File OAuth JSON sai loại
**Keyword:** OAuth JSON, service account, Desktop app, client_secret
**Hiển thị:** "File này là Service Account JSON" hoặc "không đúng loại"
**Sửa:** Cần tạo **OAuth Client ID** loại **Desktop app** (không phải Service Account):
1. Google Cloud Console → Credentials → Create → OAuth Client ID
2. Application type: **Desktop app**
3. Download JSON → upload vào Dashboard → Google

### I3. "gog binary not found"
**Keyword:** gog not found, gogcli, Google không hoạt động
**Nguyên nhân:** gogcli chưa được tải (bỏ qua lúc cài đặt hoặc tải fail).
**Sửa:** Đóng app → mở lại (app tự tải lại gogcli). Nếu vẫn lỗi: kiểm tra mạng.

---

## J. MAC RIÊNG

### J1. "9BizClaw.app is damaged" / Không mở được
**Keyword:** damaged, bị hỏng, không mở được, app is damaged, quarantine
**Nguyên nhân:** macOS Gatekeeper chặn app chưa notarize (bản unsigned).
**Sửa:**
1. Mở **Terminal** (Applications → Utilities → Terminal)
2. Chạy lệnh: `xattr -dr com.apple.quarantine /Applications/9BizClaw.app`
3. Nhấn Enter → mở lại app

### J2. Cron bị miss khi Mac sleep / đóng nắp
**Keyword:** cron miss, Mac sleep, đóng nắp, App Nap
**Giải thích:** App đã có powerSaveBlocker nhưng khi Mac sleep hoàn toàn (đóng nắp) thì mọi timer đều dừng.
**Sửa:**
1. Để Mac không sleep: System Preferences → Energy Saver → Prevent computer from sleeping
2. Hoặc để nắp mở (có thể tắt màn hình)

### J3. "Bad CPU type in executable" (Intel Mac)
**Keyword:** bad CPU type, Intel, x64, arm64
**Nguyên nhân:** Cài bản arm64 (Apple Silicon) trên máy Intel hoặc ngược lại.
**Sửa:** Tải đúng bản: Apple Silicon (M1/M2/M3/M4) = arm64, Intel (trước 2020) = x64.

### J4. Mac không tìm thấy Node.js khi mở từ Finder
**Keyword:** Node not found, Finder, không tìm thấy Node
**Nguyên nhân:** Mở app từ Finder không có shell PATH (nvm/volta không load).
**Sửa:** App đã có tự động tìm Node ở nhiều vị trí. Nếu vẫn lỗi → cài Node từ nodejs.org (không qua nvm).

### J5. Xcode Command Line Tools
**Keyword:** Xcode, xcode-select, Command Line Tools, CLT
**Hiển thị:** macOS hiện hộp thoại "Install Xcode Command Line Tools"
**Sửa:** Nhấn **"Install"** trong hộp thoại macOS. Đợi 2-5 phút. App tự tiếp tục sau khi cài xong. Nếu bỏ qua: app vẫn hoạt động (dùng git shim thay thế).

---

## K. WINDOWS RIÊNG

### K1. Windows Defender chặn cài đặt / chạy app
**Keyword:** Windows Defender, antivirus, bị chặn, SmartScreen
**Sửa:**
1. Windows Security → Virus & threat protection → Manage settings → Exclusions
2. Add Folder → `C:\Users\[tên]\AppData\Roaming\9bizclaw`
3. Nếu SmartScreen chặn khi mở: "More info" → "Run anyway"

### K2. App không tự khởi động cùng Windows
**Keyword:** tự khởi động, startup, mở máy, khởi động cùng Windows
**Sửa:** Dashboard → Cài đặt → bật "Tự khởi động cùng Windows" (nếu có).

### K3. Nhiều process node.exe chạy
**Keyword:** nhiều process, node.exe, task manager, chạy nhiều
**Giải thích:** Bình thường — 9BizClaw chạy 3-4 process Node (gateway, 9Router, openzca, cron agent). Không phải lỗi.

---

## L. CẬP NHẬT

### L1. Cách cập nhật
**Keyword:** cập nhật, update, nâng cấp, version mới
1. Tải file cài đặt mới từ support
2. Chạy file — ghi đè app cũ, **giữ nguyên** toàn bộ dữ liệu
3. Wizard KHÔNG hiện lại — chỉ hiện lần đầu

### L2. Mất dữ liệu sau cập nhật?
**Keyword:** mất dữ liệu, mất memory, mất tài liệu, mất config
**Trả lời:** KHÔNG. Dữ liệu (memory, knowledge, config, lịch sử) nằm ở `%APPDATA%\9bizclaw\` (Win) / `~/Library/Application Support/9bizclaw/` (Mac), không bị ghi đè khi cài app mới.

### L3. Migration từ v2.3.x lên v2.4.x
**Keyword:** migration, nâng cấp 2.3, chuyển đổi
**Giải thích:** App tự phát hiện version cũ → backup dữ liệu → chuyển sang runtime install mới. Quá trình tự động, không cần thao tác.
**Nếu migration lỗi:** Dữ liệu đã được backup. Liên hệ support kèm file log.

---

## M. THÔNG TIN CHO SUPPORT

### Vị trí file — Windows
| Thứ | Đường dẫn |
|-----|-----------|
| App | `C:\Users\[tên]\AppData\Local\Programs\modoro-claw\` |
| Dữ liệu + Vendor | `C:\Users\[tên]\AppData\Roaming\9bizclaw\` |
| Logs | `...\9bizclaw\logs\` |
| Config | `C:\Users\[tên]\.openclaw\openclaw.json` |
| Zalo | `C:\Users\[tên]\.openzca\profiles\default\` |
| License | `...\9bizclaw\license.json` |

### Vị trí file — Mac
| Thứ | Đường dẫn |
|-----|-----------|
| App | `/Applications/9BizClaw.app/` |
| Dữ liệu + Vendor | `~/Library/Application Support/9bizclaw/` |
| Logs | `.../9bizclaw/logs/` |
| Config | `~/.openclaw/openclaw.json` |
| Zalo | `~/.openzca/profiles/default/` |
| License | `.../9bizclaw/license.json` |

### Log files quan trọng
| File | Chứa gì | Khi nào cần |
|------|---------|------------|
| `main.log` | Electron main process | App crash, boot lỗi |
| `openclaw.log` | Gateway AI agent | Bot không reply, chậm |
| `9router.log` | AI proxy | Wizard bước 2 lỗi 500 |
| `openzca.log` | Zalo listener | Zalo không kết nối |
| `audit.jsonl` | Lịch sử hoạt động | Debug cron, events |
| `cron-runs.jsonl` | Kết quả cron | Cron fail |
| `ceo-alerts-missed.log` | Alert CEO thất bại | CEO không nhận cảnh báo |

### Cách lấy log gửi support
1. Mở thư mục logs:
   - **Windows:** nhấn `Win+R` → gõ `%APPDATA%\9bizclaw\logs` → Enter
   - **Mac:** Finder → Go → Go to Folder → `~/Library/Application Support/9bizclaw/logs`
2. Nén (zip) toàn bộ thư mục `logs`
3. Gửi file zip cho support qua email: **tech@modoro.com.vn**

### Factory Reset (xóa sạch, cài lại từ đầu)
**CHỈ dùng khi support yêu cầu:**
1. Đóng app
2. Xóa thư mục: `%APPDATA%\9bizclaw\` (Win) / `~/Library/Application Support/9bizclaw/` (Mac)
3. Xóa thư mục: `%USERPROFILE%\.openclaw\` (Win) / `~/.openclaw/` (Mac)
4. Mở app — sẽ hiện wizard như lần đầu cài
