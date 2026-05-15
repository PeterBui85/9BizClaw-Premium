# 9BizClaw v2.4 — Hướng Dẫn Sử Dụng & Xử Lý Sự Cố Toàn Diện

> Tài liệu này dành cho bot hỗ trợ khách hàng 9BizClaw. Mọi thông tin đều dựa trên trạng thái thực tế của phần mềm phiên bản 2.4.x.

---

## PHẦN 1: TỔNG QUAN SẢN PHẨM

### 9BizClaw là gì?

9BizClaw là phần mềm trợ lý AI dành cho chủ doanh nghiệp Việt Nam. Phần mềm chạy trên máy tính cá nhân (Windows hoặc Mac), kết nối với Telegram và Zalo để:

- Tự động trả lời khách hàng trên Zalo (hỗ trợ sản phẩm, tư vấn, giá cả)
- Nhận lệnh và gửi báo cáo cho CEO qua Telegram
- Chạy lịch tự động (báo cáo sáng, tối, tuần, tháng, nhắc khách chưa trả lời)
- Quản lý tài liệu doanh nghiệp (PDF, Word, Excel — bot tự đọc và dùng khi trả lời)
- Tạo ảnh AI, đăng bài Facebook Fanpage
- Kết nối Google Workspace (Gmail, Calendar, Sheets, Drive, Docs, Contacts, Tasks)

**Toàn bộ dữ liệu lưu trên máy tính của bạn.** Không gửi lên cloud của 9Biz. Không cần tài khoản online nào ngoài ChatGPT (miễn phí hoặc Plus đều được).

### Dành cho ai?

- Chủ doanh nghiệp vừa và nhỏ tại Việt Nam
- Chủ shop, chủ salon/spa, chủ nhà hàng, chủ chuỗi cửa hàng
- Giám đốc công ty BĐS, giáo dục, sản xuất, thương mại, dịch vụ
- Bất kỳ CEO nào muốn tự động hóa CSKH + báo cáo + marketing

### Yêu cầu hệ thống

| Yêu cầu | Chi tiết |
|----------|----------|
| Hệ điều hành | Windows 10 trở lên hoặc macOS 11 trở lên |
| RAM | Tối thiểu 4GB, khuyến nghị 8GB |
| Dung lượng đĩa | ~300MB cho app + ~170MB tải lần đầu |
| Kết nối mạng | Cần internet khi cài đặt lần đầu và khi bot hoạt động |
| Tài khoản ChatGPT | Miễn phí hoặc Plus (cả hai đều hoạt động) |
| Telegram | Cần tài khoản Telegram + tạo bot qua BotFather |
| Zalo | Cần tài khoản Zalo đang đăng nhập trên cùng máy |

### Tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| Tự động trả lời Zalo | Bot trả lời khách hàng về sản phẩm, giá cả, chính sách |
| Quản lý qua Telegram | CEO ra lệnh, nhận báo cáo, kiểm soát bot mọi lúc |
| Lịch tự động (Cron) | 8 lịch có sẵn + tạo thêm không giới hạn |
| Tài liệu doanh nghiệp | Upload PDF/Word/Excel → bot tự đọc và dùng |
| 26 kỹ năng có sẵn | Vận hành, marketing, theo ngành (BĐS, F&B, spa...) |
| Tạo ảnh AI | Tạo ảnh thương hiệu, poster, banner |
| Facebook Fanpage | Đăng bài lên Fanpage qua lệnh Telegram |
| Google Workspace | Gmail, Calendar, Sheets, Drive, Docs, Contacts, Tasks |
| Ghi nhớ khách hàng | Bot tự ghi lại tên, sở thích, lịch sử để phục vụ tốt hơn |
| Escalation tự động | Chuyển vấn đề phức tạp cho CEO |
| Dashboard quản lý | Bảng điều khiển trực quan trên máy |

---

## PHẦN 2: CÀI ĐẶT VÀ THIẾT LẬP LẦN ĐẦU

### Tải về và cài đặt

**Windows:**
1. Mở file `.exe` đã nhận từ 9Biz (khoảng 50-80MB)
2. Chờ cài đặt hoàn tất (1-2 phút)
3. Ứng dụng tự mở sau khi cài xong

**macOS:**
1. Mở file `.dmg` (khoảng 140MB)
2. Kéo icon 9BizClaw vào thư mục Applications
3. Mở 9BizClaw từ Applications
4. Nếu macOS chặn: vào System Settings → Privacy & Security → nhấn "Open Anyway"

### Lần chạy đầu tiên — Tải runtime

Lần đầu mở app, bạn thấy **màn hình splash** với thanh tiến trình. App cần tải thêm:

- Node.js runtime (~20MB)
- Các gói cần thiết (~145MB)
- Tổng: ~170MB

**Thời gian:** 2-10 phút tùy tốc độ mạng.

Sau khi tải xong, app chuyển sang **Wizard thiết lập** (4 bước).

### Chi tiết màn hình splash (tải runtime lần đầu)

**Thanh tiêu đề:** "9BizClaw — Đang cài đặt" với chấm trạng thái nhấp nháy + nút Thu nhỏ + Đóng

**Bố cục:**
- **Phần trên:** Logo 9BizClaw + phần trăm tiến độ lớn (0% → 100%) + thanh tiến trình ngang màu cam
- **Phần giữa:** 6 bước cài đặt, mỗi bước hiện icon tròn số + tiêu đề + mô tả chi tiết

**6 bước hiển thị:**

| Bước | Tiêu đề | Mô tả khi chạy |
|------|---------|-----------------|
| 1 | Node.js Runtime | "Đang kiểm tra hệ thống..." → "Đang tải Node.js v22..." |
| 2 | Cài đặt packages | "Đang cài openclaw, 9router, openzca..." |
| 3 | Plugin Zalo | "Đang cài plugin modoro-zalo..." |
| 4 | gogcli | "Đang tải gogcli (Google Workspace)..." |
| 5 | Mô hình AI | "Kiểm tra mô hình AI..." |
| 6 | Hoàn tất | "Cài đặt xong!" |

**Trạng thái mỗi bước (màu sắc):**
- **Xám** = chưa đến lượt (số xám nhạt)
- **Cam** = đang chạy (nền cam, chữ đậm, spinner quay)
- **Xanh lá** = xong (dấu tích ✓ xanh)
- **Đỏ** = lỗi (icon đỏ + thông báo lỗi)

**Khi gặp lỗi:** Hiện panel chẩn đoán tự động với 7 mục kiểm tra:
1. Kết nối Internet — tự phát hiện lỗi DNS, timeout, network
2. Quyền ghi thư mục — tự phát hiện permission denied
3. Dung lượng ổ đĩa — tự phát hiện disk full
4. Node.js runtime — tự phát hiện node not found
5. Phần mềm diệt virus — tự phát hiện file bị khóa (EBUSY)
6. Tường lửa / Proxy — tự phát hiện SSL, firewall, proxy 407/403
7. Xcode Command Line Tools (chỉ Mac) — tự phát hiện thiếu Xcode CLT

Mỗi mục: ✓ xanh = OK, ✗ đỏ = có vấn đề. Có nút **"Thử lại"** và **"Thoát"**.

Có nút **"Chi tiết kỹ thuật"** mở rộng để xem thông báo lỗi đầy đủ (gửi cho support nếu cần).

### Lỗi thường gặp khi tải runtime lần đầu

**Thanh tiến trình đứng im (mạng chậm hoặc bị chặn)**
- Kiểm tra kết nối internet
- Nếu đang dùng VPN hoặc proxy công ty, thử tắt VPN
- Nếu dùng mạng công ty có firewall, đảm bảo `registry.npmjs.org` không bị chặn

**Báo "Connection refused" hoặc "ETIMEDOUT"**
- Mạng bị firewall chặn kết nối đến server tải
- Thử đổi mạng (dùng 4G điện thoại chia sẻ hotspot)
- App sẽ tự thử lại 3 lần

**Báo "Disk full" hoặc "ENOSPC"**
- Ổ đĩa không đủ dung lượng
- Giải phóng ít nhất 500MB trên ổ C: (Windows) hoặc ổ chính (Mac)

**Báo "Permission denied" hoặc "EACCES"**
- Không đủ quyền ghi file
- Windows: thử chạy app bằng cách chuột phải → "Run as administrator"
- Mac: kiểm tra quyền thư mục Applications

**Báo "EBUSY" hoặc "File in use" (chỉ Windows)**
- Windows Defender đang quét file trong quá trình cài
- Thêm thư mục `%APPDATA%\9bizclaw` vào danh sách Exclusions của Windows Security
- Hoặc chờ 30 giây rồi thử lại — app tự retry 4 lần

**Báo "CERT_HAS_EXPIRED" hoặc lỗi SSL**
- Mạng công ty có proxy chặn HTTPS
- Liên hệ IT công ty hoặc đổi sang mạng khác

### Wizard thiết lập — Bước 1: Thông tin cơ bản

**Tiêu đề trên màn hình:** "Chào mừng đến với 9BizClaw"

Nhập 4 thông tin:

1. **Họ và tên anh/chị** (bắt buộc)
   - Tên CEO hoặc chủ doanh nghiệp
   - Ví dụ: "Nguyễn Văn A"

2. **Tên công ty / cửa hàng** (không bắt buộc)
   - Tên doanh nghiệp của bạn

3. **Tên trợ lý ảo** (không bắt buộc)
   - Đặt tên riêng cho bot
   - Để trống thì bot tự xưng "em"
   - Ví dụ: "Momo", "Linh", "Claw"
   - Khách Zalo sẽ thấy bot tự giới thiệu bằng tên này

4. **Trợ lý gọi anh/chị là** (bắt buộc)
   - Cách bot xưng hô khi nhắn bạn qua Telegram
   - Ví dụ: "anh", "chị", "sếp", "thầy", "cô", "giám đốc"

**Lỗi có thể gặp:**
- Bỏ trống họ tên → hiện lỗi "Vui lòng nhập họ tên của anh/chị."
- Bỏ trống cách xưng hô → hiện lỗi "Vui lòng nhập cách trợ lý gọi anh/chị."

**Ghi chú cuối trang:** "Thông tin chi tiết về sản phẩm, dịch vụ, khách hàng sẽ được anh/chị tải lên qua Dashboard → Knowledge sau khi hoàn tất cài đặt."

### Wizard thiết lập — Bước 2: Kết nối trí tuệ nhân tạo

**Tiêu đề trên màn hình:** "Kết nối trí tuệ nhân tạo"

Bot cần kết nối với ChatGPT để hoạt động. Gồm 2 phần:

**Phần 1 — Kết nối ChatGPT:**
1. Nhấn nút **"Kết nối ChatGPT"**
2. Trình duyệt mặc định mở trang kết nối
3. Đăng nhập bằng tài khoản ChatGPT của bạn (miễn phí hoặc Plus đều được)
4. Nhấn **"Connect"** bên cạnh ChatGPT trên trang đó
5. Quay lại app

Nếu thấy trang đăng nhập 9Router thay vì ChatGPT: nhập mật khẩu **123456** rồi tiếp tục.

**Phần 2 — Kiểm tra kết nối:**
1. Nhấn nút **"Kiểm tra kết nối"**
2. **Thành công:** Hiện "ChatGPT đã kết nối. Model [tên model] sẵn sàng." (chữ xanh lá)
3. **Thất bại:** Hiện "Chưa tìm thấy kết nối ChatGPT."

**Lỗi thường gặp bước 2:**

| Triệu chứng | Nguyên nhân | Cách khắc phục |
|-------------|-------------|----------------|
| "Chưa tìm thấy kết nối ChatGPT. Nhấn 'Kết nối ChatGPT' ở trên, đăng nhập trên trình duyệt, rồi quay lại nhấn 'Kiểm tra kết nối'." | Chưa đăng nhập ChatGPT trên trình duyệt | Làm theo đúng hướng dẫn trong thông báo |
| "Chưa kết nối ChatGPT. Nhấn 'Kết nối ChatGPT' rồi 'Kiểm tra kết nối' ở trên." (khi nhấn Tiếp tục mà chưa kết nối) | Cố bỏ qua bước 2 | Phải hoàn tất kết nối ChatGPT trước — không bỏ qua được |
| Trang kết nối không mở | Trình duyệt mặc định bị chặn hoặc chưa cài | Cài Chrome hoặc Edge làm trình duyệt mặc định |
| Lỗi 500 khi kiểm tra | Lỗi kỹ thuật 9Router nội bộ | Đóng app, mở lại, thử bước 2 lần nữa. App tự sửa lần thử tiếp. Nếu vẫn 500 sau 3 lần: liên hệ support |
| Không mở được trang kết nối | App chưa khởi động xong | Chờ 10-15 giây rồi thử lại |

**Tất cả các bước wizard đều bắt buộc — không bỏ qua được bước nào.** Chỉ có thể chuyển sang bước 3 khi "Kiểm tra kết nối" thành công (hiện chữ xanh). Nút "Quay lại" có trên bước 2 và 3 để quay về bước trước.

### Wizard thiết lập — Bước 3: Kết nối Telegram

**Tiêu đề trên màn hình:** "Kết nối Telegram để dùng 9BizClaw mọi lúc, mọi nơi"

Bước này có nhiều màn hình con. Thời gian ước tính: ~2 phút.

**Màn hình 3.1 — Giới thiệu lợi ích:**
- Nhận báo cáo doanh nghiệp hàng ngày trên điện thoại
- Hỏi đáp với trợ lý ngay trên Telegram, không cần mở app
- Cảnh báo quan trọng gửi tức thì (khách mới, sự cố, cron)
- Ghi chú: "An toàn 100% — Toàn bộ dữ liệu lưu trên máy anh/chị, không gửi lên cloud."
- Nhấn **"Bắt đầu kết nối"** để tiếp

**Màn hình 3.2 — Tạo Bot Telegram qua BotFather:**

Gồm 4 bước nhỏ:

Bước 3.2.1 — Mở BotFather:
- Nhấn **"Mở trong App"** (mở Telegram trên máy) hoặc **"Mở trên Web"** (mở t.me/BotFather trên trình duyệt)
- Nhấn "Tôi đã mở rồi"

Bước 3.2.2 — Tạo bot mới:
- Trong chat với BotFather, gõ: `/newbot`
- BotFather hỏi **tên hiển thị** — đặt tên bạn muốn. Ví dụ: "Trợ Lý của Anh Tuấn"
- BotFather hỏi **username** — phải kết thúc bằng "bot". Ví dụ: "troly_anh_tuan_bot"
- BotFather gửi lại tin nhắn chứa **Mã kết nối** (Bot Token) — dòng dài dạng: `7104958362:BBHxR93kLmNpQwErTyUiOp`
- **Sao chép toàn bộ dòng mã này** (nhấn vào để copy)

Bước 3.2.3 — Dán Mã kết nối:
- Quay lại app, dán token vào ô **"Dán Mã kết nối từ BotFather..."**
- App kiểm tra tự động:
  - Hợp lệ: hiện dấu tích xanh + "Mã hợp lệ."
  - Không hợp lệ: hiện viền đỏ + "Mã này không đúng định dạng. Anh/chị copy lại từ BotFather giúp em."
- Định dạng đúng: 8-12 chữ số, dấu hai chấm, 35 ký tự chữ + số

Bước 3.2.4 — Kích hoạt bot:
- Trong tin nhắn BotFather, nhấn vào **link bot** (dạng t.me/TenBotCuaBan)
- Trang bot mở ra → nhấn nút **"Start"**
- **Sẽ KHÔNG có phản hồi gì — đúng rồi, không cần lo**
- Quay lại app, nhấn **"Đã nhấn Start, tiếp tục"**

**Màn hình 3.3 — Lấy Mã nhận diện (User ID):**

Bước 3.3.1 — Mở @userinfobot:
- Nhấn "Mở trong App" hoặc "Mở trên Web" → mở chat với @userinfobot

Bước 3.3.2 — Lấy ID:
- Gõ `/start` trong chat với @userinfobot
- Bot trả về thông tin của bạn, trong đó có dòng **Id:** với dãy số (ví dụ: `5738291046`)
- Nhấn vào dãy số để copy

Bước 3.3.3 — Dán mã:
- Quay lại app, dán dãy số vào ô **"Dán dãy số (VD: 5738291046)"**
- App kiểm tra: chỉ chấp nhận 7-12 chữ số
- Nếu sai: "Mã nhận diện chỉ gồm số (7-12 chữ số). Kiểm tra lại nhé."

**Màn hình 3.4 — Kiểm tra kết nối:**

Khi chạy: hiện spinner + "Đang gửi tin nhắn thử..." + "Đang gửi tới Telegram của anh/chị để xác nhận kết nối."

- **Thành công:** Icon tích xanh + "Kết nối thành công!" + "Em vừa gửi tin vào Telegram của anh/chị. Mở Telegram xem nhé." + nút "Hoàn tất thiết lập →"
- **Thất bại:** Icon cảnh báo cam + "Chưa nhận được tin?" + "Kiểm tra vài điều rồi thử lại:" kèm checklist:
  - ☐ Đã nhấn Start trong Trợ Lý chưa?
  - ☐ Mã kết nối có thể bị thiếu ký tự
  - ☐ Mã nhận diện có thể không đúng
  - Nút **"Thử lại"** + nút **"Quay lại sửa"** (quay về bước 3.2)

Nếu token không hợp lệ (Telegram API từ chối): "Bot Token chưa hợp lệ — Telegram trả lỗi: [chi tiết lỗi]. Anh kiểm tra lại Token rồi thử tiếp."

**Lỗi thường gặp bước 3:**

| Triệu chứng | Nguyên nhân | Cách khắc phục |
|-------------|-------------|----------------|
| Tin thử không đến Telegram | Chưa nhấn Start trên bot | Mở lại link bot → nhấn Start → quay lại thử lại |
| "Mã không đúng định dạng" | Copy thiếu ký tự từ BotFather | Copy lại TOÀN BỘ dòng token (bao gồm cả phần số trước dấu hai chấm và phần sau) |
| "Mã nhận diện chỉ gồm số" | Copy nhầm username thay vì số ID | Gõ lại `/start` trong @userinfobot, copy đúng dòng "Id:" (chỉ số, không chữ) |
| Không tìm thấy @userinfobot | Telegram hạn chế tìm kiếm | Tìm "userinfobot" (viết liền) trong thanh tìm kiếm Telegram |
| BotFather không phản hồi | Telegram bị lỗi tạm thời | Chờ 1-2 phút rồi thử lại. BotFather là bot chính thức của Telegram, luôn hoạt động |

**Chỉ có thể chuyển sang bước 4 khi tin thử gửi thành công.**

### Wizard thiết lập — Bước 4: Hoàn tất

**Tiêu đề trên màn hình:** "Sẵn sàng hoạt động"

Hiển thị tóm tắt 3 dòng:
- Người dùng: [tên bạn]
- AI: Đã kết nối (xanh lá)
- Telegram: Đã kết nối (xanh lá)

Nhấn **"Khởi động trợ lý"** → chuyển sang Dashboard.

**Bước tiếp theo sau wizard:** Mở Telegram → tìm bot vừa tạo → gửi bất kỳ tin nhắn nào → trợ lý trả lời trong vài giây.

---

## PHẦN 3: BẢNG ĐIỀU KHIỂN (DASHBOARD)

Dashboard là giao diện chính để quản lý bot, mở ra sau khi hoàn tất wizard. Thanh bên trái là menu các tab.

### Thanh bên trái (Sidebar)

**Phần trên:** Trạng thái bot + nút điều khiển
- **Chấm trạng thái:** Xanh lá (đang chạy) / Đỏ (đã dừng) / Xám nhấp nháy (đang kiểm tra)
- **Chữ:** "Đang kiểm tra..." khi khởi động, sau đó hiện trạng thái

**Menu chính (theo thứ tự từ trên xuống):**
- Tổng quan
- Chat
- **Kênh** (tiêu đề nhóm, mở rộng):
  - Telegram (có chấm xanh/đỏ/xám bên phải = trạng thái kết nối)
  - Zalo (có chấm xanh/đỏ/xám bên phải = trạng thái kết nối)
  - Facebook
  - Google
- **Trợ lý AI** (tiêu đề nhóm):
  - Tài liệu
  - Tính cách bot
  - Skills
  - Tài sản hình ảnh
  - AI Models
- **Tự động hóa** (tiêu đề nhóm):
  - Lịch tự động
- **Cài đặt** (tiêu đề nhóm):
  - Giao diện: 3 nút radio "Sáng" / "Tối" / "Hệ thống" + checkbox "Ẩn xuống tray khi mở"
  - Nâng cao: mở cấu hình nâng cao
  - Kiểm tra cập nhật

**Chấm trạng thái Telegram/Zalo trên sidebar:**
- **Xanh lá + phát sáng** = kênh sẵn sàng nhận tin
- **Đỏ + phát sáng** = kênh mất kết nối
- **Xám + nhấp nháy** = đang kiểm tra kết nối

### Tab "Tổng quan"

Trang đầu khi mở Dashboard:

- **Lời chào:** Hiện tên CEO, trạng thái bot (online/offline)
- **3 thẻ thống kê:**
  - "Khách mới Zalo hôm nay" — số khách Zalo nhắn lần đầu
  - "Sự kiện hôm nay" — số event bot ghi nhận
  - "Cron OK hôm nay" — số lịch tự động chạy thành công
- **"Bot đã học"** — những gì bot ghi nhớ từ hội thoại gần đây
- **"Lịch hôm nay"** — lịch tự động sắp chạy
- **"Hoạt động gần đây"** (bên phải) — log sự kiện: khởi động, cron chạy, tin bị lọc...

Nếu mới cài: "Chưa có hoạt động" là bình thường — sẽ xuất hiện sau khi bot bắt đầu nhận tin.

Auto-refresh mỗi 30 giây khi đang ở tab này.

### Tab "Chat"

Giao diện nhắn tin trực tiếp với bot ngay trong app (không cần mở Telegram).

- Nhập tin nhắn vào ô "Nhập tin nhắn..." ở dưới
- Nhấn Enter hoặc nút gửi (Shift+Enter để xuống dòng)
- Bot trả lời ngay trong cửa sổ chat
- Lịch sử chat được lưu tự động, giữ lại khi đóng/mở app

**Khi chưa có tin nhắn nào (empty state):**
- Tiêu đề: "Chat"
- Phụ đề: "Trò chuyện trực tiếp với trợ lý AI"
- 3 gợi ý nhanh (prompt chips): "Báo cáo hôm nay", "Kiểm tra đơn hàng", "Tình hình Zalo" — nhấn vào để gửi nhanh

### Tab "Telegram"

Quản lý kênh Telegram:

**Trạng thái kết nối:** Chấm xanh = sẵn sàng, chấm đỏ = mất kết nối, chấm xám = đang kiểm tra

**Nút thao tác:**
- **"Kiểm tra"** — Kiểm tra lại kết nối ngay
- **"Đổi tài khoản"** — Thay Bot Token và User ID
- **"Tạm dừng"** — Dừng bot tạm thời. Chọn thời gian: 15 phút, 30 phút, 1 giờ, 2 giờ, 8 giờ, 24 giờ
- **"Tiếp tục"** — Bật lại bot sau khi tạm dừng

Khi tạm dừng, hiện banner: "Bot Telegram đang tạm dừng. [thời gian còn lại]"

**Cài đặt bên trái:**

| Cài đặt | Tùy chọn |
|---------|----------|
| Người lạ nhắn tin | Trả lời bình thường / Chào + hướng dẫn liên hệ CEO / Bỏ qua |
| Hành vi nhóm mới | Chỉ khi @mention / Mọi tin nhắn / Tắt |
| Giới hạn lịch sử | 10 tin / 20 tin / 30 tin / 50 tin (tối đa) |
| Thời gian gộp tin | 0s / 1s / 2s / 3s (mặc định) / 4s / 5s |

"Thời gian gộp tin" giúp gom nhiều tin nhắn gửi liền thành 1 để bot trả lời gọn hơn.

Nhấn **"Lưu cấu hình"** sau khi thay đổi.

**Khả năng bot (phần giữa):** Hiển thị chip các tính năng bot có thể làm qua Telegram — CSKH Zalo, Báo cáo, Tra cứu tài liệu, Quản lý cron, Gửi tin Zalo, Tạm dừng bot, Marketing, Cố vấn C-Level, Nhớ khách hàng, Đọc hình ảnh, Escalate CEO.

**Câu lệnh mẫu (phần dưới):** Danh sách lệnh CEO có thể gửi qua Telegram, chia theo nhóm: Báo cáo, Cron, Khách hàng, Hệ thống, Marketing, Cố vấn. Có nút copy để sao chép nhanh.

### Tab "Zalo"

Quản lý kênh Zalo:

**Trạng thái kết nối:** Chấm xanh = listener đang chạy, chấm đỏ = listener dừng

**Toggle chính:** "Bật Zalo" — bật/tắt kênh Zalo hoàn toàn.
Cảnh báo khi bật/tắt: "Thay đổi sẽ khởi động lại gateway. Telegram sẽ gián đoạn 10-15 giây."

**Nút thao tác:** Refresh, Đổi tài khoản, Tạm dừng / Tiếp tục (giống Telegram)

**Cài đặt bên trái:**

| Cài đặt | Tùy chọn |
|---------|----------|
| Chế độ trả lời | Tự động trả lời / Chỉ đọc + tóm tắt cuối ngày |
| Người lạ nhắn tin | Trả lời bình thường / Chỉ chào 1 lần / Không trả lời |
| Hành vi nhóm mới | @mention (chỉ reply khi tag) / Mọi tin / Tắt |
| Gộp tin khách | 0s / 1s / 2s / 3s (mặc định) / 4s / 5s |

**Tab "Nhóm" (bên phải):**
Danh sách nhóm Zalo bot tham gia. Mỗi nhóm có 3 chế độ:
- **Xanh = mọi tin** — bot trả lời tất cả tin trong nhóm
- **Vàng = @mention** — bot chỉ trả lời khi được tag tên
- **Đỏ = tắt** — bot im lặng trong nhóm

Có nút "Bật tất cả" và "Tắt tất cả" để thao tác hàng loạt.
Có ô tìm kiếm: "Tìm nhóm..."

**Tab "Bạn bè" (bên phải):**
Danh sách bạn bè Zalo. Bật/tắt từng người.
Hiện số lượng: "Đang tắt: [số]"
Có nút "Bật tất cả" / "Tắt tất cả"
Có ô tìm kiếm: "Tìm theo tên hoặc số điện thoại..."

### Tab "Facebook"

Kết nối và đăng bài lên Facebook Fanpage:

- **Trạng thái:** Hiện tên Fanpage đã kết nối (hoặc "Chưa kết nối")
- **Ô nhập** (dạng mật khẩu — ký tự bị che): "Paste Page Access Token từ Meta Business Suite"
- **Nút "Kết nối":** Xác thực token
- **Hướng dẫn chi tiết:** Mở rộng để xem cách lấy Page Access Token:
  - Bước 0: Tạo Fanpage (nếu chưa có) tại facebook.com/pages/create
  - Bước 1: Tạo Facebook App tại developers.facebook.com/apps/creation
  - Bước 2: Thêm permissions trong App Dashboard (pages_manage_posts)

### Tab "Google" (Google Workspace)

Kết nối Google Account. Có 8 tab con:

| Tab | Chức năng |
|-----|----------|
| Lịch | Xem Google Calendar theo tháng/tuần/ngày, tạo sự kiện mới |
| Email | Đọc/gửi email qua Gmail |
| Tài liệu | Duyệt Google Drive |
| Docs | Đọc/ghi Google Docs |
| Sheets | Đọc/ghi Google Sheets |
| Liên hệ | Google Contacts |
| Công việc | Google Tasks |
| Cài đặt | Cấu hình kết nối OAuth |

**Yêu cầu:** Cần thiết lập Google Cloud Desktop OAuth client + bật Drive API và Sheets API. Hướng dẫn có trong tab Cài đặt.

**Tab Lịch:** Hiện full calendar, nút "Tạo sự kiện" (nhập tiêu đề, thời gian, người tham dự). Empty state: "Không có sự kiện trong khung thời gian này."

### Tab "Tài liệu" (Knowledge)

Upload tài liệu doanh nghiệp để bot tự đọc và dùng khi trả lời khách.

**3 thư mục:**
- Công ty — Giới thiệu, chính sách, quy định
- Sản phẩm — Catalog, bảng giá, thông số kỹ thuật
- Nhân viên — Thông tin nội bộ (không chia sẻ với khách)

**Upload file:**
1. Chọn thư mục bên trái
2. Chọn mức hiển thị:
   - **Công khai** (mặc định) — bot dùng khi trả lời khách
   - **Nội bộ** — chỉ CEO + nhân viên thấy
   - **Chỉ mình tôi** — chỉ CEO qua Telegram
3. Kéo file vào vùng upload hoặc nhấn để chọn file
4. Hỗ trợ: PDF, Word (.docx), Excel (.xlsx), TXT, CSV, JPG, PNG
5. Kích thước tối đa: 100MB mỗi file
6. Bot tự tóm tắt nội dung sau khi upload (chờ vài giây)

Mỗi file hiện **badge mức hiển thị** bên cạnh tên: "Công khai" (xám), "Nội bộ" (vàng), "Chỉ mình tôi" (đỏ).

**Ghi chú dưới vùng upload:** "Bot tự đọc và nhớ nội dung file..."

### Tab "Tính cách bot" (Persona Mix)

Tùy chỉnh cách bot giao tiếp với khách:

**Giọng bot + giới tính:**
- Em (nữ trẻ) — bot xưng "em", giọng nữ trẻ
- Em (nam trẻ) — bot xưng "em", giọng nam trẻ
- Chị (trung niên) — bot xưng "chị"
- Anh (trung niên) — bot xưng "anh"
- Mình (trung tính) — bot xưng "mình"

**Cách gọi khách:**
- Anh/chị — lịch sự, phổ biến nhất
- Quý khách — trang trọng (spa, khách sạn)
- Mình — thân mật (shop thời trang, F&B)

**Tính cách (chọn 3-5 trong 15):**
Sáng tạo, Thực tế, Linh hoạt, Chỉn chu, Chu đáo, Kiên nhẫn, Năng động, Điềm tĩnh, Chủ động, Ấm áp, Đồng cảm, Thẳng thắn, Chuyên nghiệp, Thân thiện, Tinh tế

**Độ trang trọng:** Thanh trượt 1-10
- 1 = "Rất thân mật" (dùng từ lóng, emoji)
- 10 = "Rất trang trọng" (lịch sự, formal)

### Tab "Skills" (Kỹ năng)

Xem và quản lý kỹ năng bot:

- **Bên trái:** Danh sách kỹ năng (26 có sẵn + tùy chỉnh CEO tạo)
- **Bên phải:** Chi tiết kỹ năng được chọn
- **Nút tạo mới:** Tạo kỹ năng tùy chỉnh
- **Nút xóa:** Xóa kỹ năng tùy chỉnh (không xóa được kỹ năng có sẵn)
- **Tìm kiếm:** Tìm kỹ năng theo tên

### Tab "Tài sản hình ảnh"

Quản lý hình ảnh thương hiệu, 3 phần:

1. **Tài sản thương hiệu** — Logo, mascot, style reference cho tạo ảnh AI. Nút "Upload"
2. **Hình sản phẩm cho Zalo** — Ảnh sản phẩm bot gửi cho khách khi hỏi. Nút "Upload sản phẩm"
3. **Ảnh AI và Knowledge hình ảnh** — Ảnh AI đã tạo, ảnh upload qua Knowledge, PDF pages OCR. Nút "Upload PDF/ảnh" + "Làm mới"

### Tab "AI Models" (9Router)

Quản lý AI provider, model, API key:

- Giao diện web 9Router nhúng trong app
- **Mật khẩu mặc định: `123456`** (hiển thị rõ ở header tab)
- Nút **"Reload"** — tải lại giao diện
- Nút **"Mở trong browser"** — mở tại http://127.0.0.1:20128/

### Tab "Lịch tự động" (Schedules)

Quản lý lịch bot chạy tự động:

- **Tiêu đề:** "Lịch tự động" / "Lịch bot chạy hàng ngày"
- **Danh sách lịch:** Hiện tất cả cron (có sẵn + tự tạo)
- **Mỗi lịch:** Thời gian, nội dung, nút bật/tắt, xóa, test fire
- **Nút làm mới:** Reload danh sách

### Cài đặt (góc dưới thanh bên trái)

- **Giao diện:** Sáng / Tối / Theo hệ thống + toggle "Thu nhỏ xuống khay hệ thống"
- **Nâng cao:** Cấu hình nâng cao
- **Kiểm tra cập nhật:** Kiểm tra phiên bản mới

### Menu hỗ trợ (nút tròn góc dưới phải Dashboard)

5 tùy chọn:
- **Liên hệ 9Biz** — Mở nhóm Telegram hỗ trợ
- **Xem lại hướng dẫn sử dụng** — Chạy lại wizard hướng dẫn
- **Xuất dữ liệu (backup)** — Sao lưu toàn bộ workspace thành 1 file
- **Khôi phục từ file** — Phục hồi từ file backup đã xuất
- **Xóa sạch dữ liệu (Factory Reset)** — Xóa hết dữ liệu, bắt đầu lại từ đầu.
  - Xác nhận 2 lớp: nhấn nút → popup yêu cầu gõ "xóa" (hoặc "xoa" cho bàn phím không dấu) → nút xóa mới bật
  - **Sẽ xóa:** workspace, config, phiên Zalo, token Telegram, key 9Router, token Google OAuth
  - Nút xóa màu đỏ — không thể hoàn tác

---

## PHẦN 4: TELEGRAM — KÊNH CỦA CEO

### Telegram dùng để làm gì trong 9BizClaw?

Telegram là kênh chính để CEO điều khiển bot:

- Nhận báo cáo doanh nghiệp hàng ngày (sáng, tối, tuần, tháng)
- Ra lệnh cho bot (tạo lịch tự động, gửi tin Zalo, đăng Facebook, tạo ảnh)
- Nhận cảnh báo (khách mới, cron thất bại, escalation từ khách Zalo)
- Hỏi đáp với trợ lý AI mọi lúc mọi nơi
- Gửi tin nhắn Zalo cho khách/nhóm thông qua Telegram (không cần mở app)

### Cách bắt đầu dùng

Sau wizard:
1. Mở Telegram trên điện thoại hoặc máy tính
2. Tìm bot bạn vừa tạo (tên đặt ở wizard)
3. Gửi bất kỳ tin nhắn nào (ví dụ: "Chào bot")
4. Bot sẽ trả lời trong vài giây (lần đầu có thể mất 30-60 giây để gateway khởi động)

### Ví dụ lệnh CEO gửi qua Telegram

**Báo cáo:**
- "Tóm tắt hôm nay"
- "Báo cáo tuần này"
- "Có gì mới không?"

**Quản lý lịch tự động:**
- "Tạo cron gửi nhóm KHÁCH VIP mỗi sáng 9h: Chào buổi sáng!"
- "Xem danh sách cron"
- "Xóa cron báo cáo sáng"
- "Test cron báo cáo tối"

**Gửi tin Zalo từ Telegram:**
- "Nhắn Zalo cho Nguyễn Văn A: Em gửi báo giá ạ"
- "Gửi nhóm NHÂN VIÊN: Họp 3h chiều nay"

**Quản lý hệ thống:**
- "Tạm dừng bot 30 phút"
- "Tiếp tục bot"
- "Trạng thái hệ thống"

**Marketing:**
- "Tạo ảnh banner giảm giá 50%"
- "Đăng bài Facebook: Khuyến mãi cuối tuần..."

**Google Workspace:**
- "Đọc email mới"
- "Tạo sự kiện Calendar ngày mai 10h: Họp khách hàng"
- "Đọc Sheet doanh thu tháng 5"

### Trạng thái kết nối Telegram

Trên Dashboard → tab Telegram:
- **Chấm xanh** + "Sẵn sàng nhận tin · @tên_bot · kiểm tra HH:MM:SS" = hoạt động bình thường
- **Chấm đỏ** + thông báo lỗi = mất kết nối
- **Chấm xám** + "Đang kiểm tra kết nối..." = đang kiểm tra

Trạng thái tự kiểm tra lại mỗi 45 giây. Nhấn "Kiểm tra" để kiểm tra ngay.

### Tạm dừng và tiếp tục Telegram

**Tạm dừng:** Dashboard → Telegram → nút "Tạm dừng" → chọn thời gian
- Trong thời gian tạm dừng: bot KHÔNG trả lời tin nhắn Telegram
- Banner hiện: "Bot Telegram đang tạm dừng. [thời gian còn lại]"
- Tự bật lại sau hết thời gian

**Tiếp tục sớm:** Nhấn nút "Tiếp tục" trên banner

---

## PHẦN 5: ZALO — KÊNH KHÁCH HÀNG

### Zalo dùng để làm gì trong 9BizClaw?

Zalo là kênh bot tự động trả lời khách hàng:

- Tư vấn sản phẩm, giá cả, chính sách
- Hỗ trợ khách đặt hàng, đặt lịch, hỏi thông tin
- Chào khách mới, follow-up khách cũ
- Quản lý nhóm Zalo (trả lời trong nhóm)
- Chuyển vấn đề phức tạp cho CEO (escalation)

### Kết nối Zalo

Zalo kết nối tự động qua plugin openzca:
- App tự phát hiện phiên Zalo trên máy
- Không cần scan QR lại sau lần đầu
- Phiên Zalo duy trì ổn định

### 3 chế độ bạn bè

Cài đặt trên Dashboard → Zalo → "Người lạ nhắn tin":
- **Trả lời bình thường** (mặc định) — Bot trả lời mọi tin nhắn từ bạn bè
- **Chỉ chào 1 lần** — Bot chào lần đầu, sau đó im lặng
- **Không trả lời** — Bot hoàn toàn im lặng

Ngoài ra, trên tab "Bạn bè" có thể bật/tắt từng người cụ thể.

### 3 chế độ nhóm

Cài đặt trên Dashboard → Zalo → tab "Nhóm":
- **Xanh = Mọi tin** — Bot trả lời tất cả tin nhắn trong nhóm
- **Vàng = @mention** — Bot chỉ trả lời khi được tag tên
- **Đỏ = Tắt** — Bot im lặng hoàn toàn trong nhóm

Nút "Bật tất cả" / "Tắt tất cả" để thao tác hàng loạt.

**Đổi tài khoản Zalo (popup "Đăng nhập Zalo"):**
- Tiêu đề: "Đăng nhập Zalo"
- Hướng dẫn: "Mở app Zalo trên điện thoại, vào Quét QR và quét mã bên dưới"
- Hiện mã QR để quét
- Nút "Làm mới" (refresh QR nếu hết hạn)
- Nút "Đóng"

**Hồ sơ khách (popup khi nhấn vào tên bạn bè):**
- Hiện thông tin khách: tên, lịch sử tóm tắt, tags
- Nút "Xóa hồ sơ (archive)" để lưu trữ

### Blocklist (danh sách chặn)

Chặn người dùng Zalo cụ thể qua Dashboard. Người bị chặn không nhận được bất kỳ phản hồi nào từ bot, bot không xử lý tin nhắn của họ.

### Cách bot hành xử trên Zalo

**Bot CHỈ hỗ trợ về sản phẩm và dịch vụ của doanh nghiệp.** Bot sẽ KHÔNG:
- Viết code, dịch thuật, viết bài
- Tư vấn pháp lý, y tế, tài chính
- Giải toán, làm bài tập
- Thảo luận chính trị, tôn giáo
- Tiết lộ thông tin nội bộ (file, cấu hình, lệnh bot)

Khi khách hỏi ngoài phạm vi: "Dạ em chỉ hỗ trợ sản phẩm và dịch vụ công ty thôi ạ."

**Phong cách trả lời:**
- Ngắn gọn: 1-2 câu mỗi tin
- Tiếng Việt có dấu đầy đủ
- Giọng thân thiện, chuyên nghiệp (tùy Persona Mix)
- Không bao giờ nhắc đến file, tool, API, AGENTS.md hay bất kỳ chi tiết kỹ thuật nào
- Tra cứu tài liệu Knowledge trước khi trả lời — nếu không tìm thấy: "Dạ cái này em chưa có thông tin chính thức ạ"

**Escalation tự động:** Khi gặp khiếu nại, đàm phán giá, hợp đồng, vấn đề phức tạp → bot nói với khách "Để em báo sếp xử lý" → gửi thông báo cho CEO qua Telegram.

**Ghi nhớ khách:** Bot tự ghi lại tên, lịch sử hội thoại, sở thích, tags. Lần sau khách nhắn, bot dùng thông tin cũ. Bot KHÔNG nhắc với khách rằng "em đã ghi nhớ" — tự nhiên sử dụng thông tin.

**Bảo mật:** Bot KHÔNG BAO GIỜ tiết lộ thông tin khách A cho khách B.

### Tạm dừng và tiếp tục Zalo

Giống Telegram: Dashboard → Zalo → nút "Tạm dừng" → chọn thời gian. Bot im lặng trong thời gian tạm dừng. Tự bật lại sau.

---

## PHẦN 6: TỰ ĐỘNG HÓA (CRON / LỊCH TỰ ĐỘNG)

### Lịch tự động là gì?

Cron (lịch tự động) là công việc bot chạy định kỳ mà không cần CEO ra lệnh. Ví dụ: gửi báo cáo mỗi sáng, nhắc nhóm mỗi tuần, follow-up khách chưa trả lời.

### 8 lịch có sẵn

| Lịch | Mô tả |
|------|-------|
| Báo cáo sáng | Tóm tắt hoạt động qua đêm + lịch hôm nay → gửi CEO qua Telegram |
| Tóm tắt tối | Tóm tắt hoạt động cả ngày |
| Báo cáo tuần | Tóm tắt tuần vừa qua |
| Báo cáo tháng | Tóm tắt tháng vừa qua |
| Theo dõi khách | Phát hiện khách chưa reply > 48h → follow-up |
| Heartbeat | Kiểm tra bot còn hoạt động |
| Thiền | Nhắc CEO nghỉ ngơi (tùy chỉnh) |
| Dọn bộ nhớ | Lưu trữ hồ sơ cũ, dọn dẹp file tạm |

Cron có sẵn cấu hình trong Dashboard → Lịch tự động.

### Tạo lịch tự động mới

CEO tạo qua Telegram chat. Ví dụ:

- "Tạo cron gửi nhóm KHÁCH VIP mỗi sáng 9h: Chào buổi sáng các anh chị! Hôm nay shop có gì mới?"
- "Tạo cron nhắc nhóm NHÂN VIÊN lúc 8h sáng thứ 2: Nhớ nộp báo cáo tuần"
- "Tạo cron mỗi 2 giờ kiểm tra đơn hàng mới và báo cáo"

**Hai loại cron:**
1. **Tin cố định** — Bot gửi đúng nội dung bạn nhập (không thay đổi mỗi lần)
2. **Agent mode** — Bot chạy AI để tạo nội dung mới mỗi lần (ví dụ: tóm tắt tin mới, phân tích dữ liệu)

Bot tự phân biệt dựa trên nội dung lệnh.

### Quản lý lịch tự động

**Trên Dashboard → tab "Lịch tự động":**
- Xem danh sách tất cả cron
- Bật/tắt từng cron
- Xóa cron
- Test fire — chạy thử ngay lập tức

**Qua Telegram:**
- "Xem danh sách cron"
- "Xóa cron [tên]"
- "Tắt cron [tên]"
- "Bật cron [tên]"
- "Test cron [tên]"

### Cron gửi nhóm Zalo

CEO có thể tạo cron gửi nội dung định kỳ vào nhóm Zalo:
- Chỉ rõ tên nhóm khi tạo
- Nếu 2 nhóm trùng tên: app yêu cầu chỉ rõ nhóm nào (hiện 4 số cuối groupId)
- Bot xác nhận lại nhóm + nội dung trước khi lưu

---

## PHẦN 7: TÀI LIỆU (KNOWLEDGE)

### Cách hoạt động

1. Upload file vào tab Tài liệu trên Dashboard
2. Bot tự đọc và tóm tắt nội dung (chờ vài giây đến 1 phút tùy kích thước)
3. Khi khách Zalo hỏi về sản phẩm/dịch vụ, bot tra cứu tài liệu để trả lời chính xác
4. Bot KHÔNG bịa thông tin — nếu không tìm thấy: "Dạ cái này em chưa có thông tin chính thức ạ" rồi escalate cho CEO

### 3 thư mục và mức hiển thị

| Thư mục | Dùng cho | Khách thấy không? |
|---------|---------|-------------------|
| Công ty | Giới thiệu, chính sách, giờ mở cửa, địa chỉ | Có (nếu file Công khai) |
| Sản phẩm | Bảng giá, catalog, thông số kỹ thuật | Có (nếu file Công khai) |
| Nhân viên | Thông tin nội bộ, quy trình nội bộ | Không (chỉ CEO) |

| Mức hiển thị | Ai xem được |
|-------------|-------------|
| Công khai | Bot dùng khi trả lời khách Zalo + CEO Telegram |
| Nội bộ | Chỉ CEO + nhân viên |
| Chỉ mình tôi | Chỉ CEO qua Telegram |

### Định dạng file hỗ trợ

PDF, Word (.docx), Excel (.xlsx), TXT, CSV, JPG, PNG. Tối đa 100MB mỗi file.

---

## PHẦN 8: KỸ NĂNG BOT (26 SKILLS)

Bot có 26 kỹ năng có sẵn chia 3 nhóm. Hệ thống tự kích hoạt kỹ năng phù hợp khi nhận tin nhắn — CEO không cần bật/tắt thủ công.

### Vận hành bot (15 kỹ năng)

| # | Kỹ năng | Mô tả |
|---|---------|-------|
| 1 | Zalo (CSKH + nhóm + reply rules) | Xử lý MỌI tin Zalo — bộ lọc phòng thủ 19 trigger + format + nhóm + memory + escalate |
| 2 | Quản lý lịch tự động | Tạo/sửa/xóa cron, lên lịch gửi tin định kỳ |
| 3 | Tra cứu kiến thức | Tìm kiếm tài liệu doanh nghiệp để trả lời khách chính xác |
| 4 | Theo dõi khách hàng | Follow-up khách chưa phản hồi > 48 giờ hoặc khách có tag hot/lead |
| 5 | Quản lý kênh | Tạm dừng/tiếp tục Telegram + Zalo, quản lý blocklist |
| 6 | Hành vi veteran | Nhận diện khách cũ, điều chỉnh giọng theo vùng miền + tier khách |
| 7 | Kênh CEO Telegram | Tư duy cố vấn + gửi tin Zalo từ Telegram (nhóm/cá nhân) |
| 8 | Workspace API | Đọc/ghi file nội bộ workspace |
| 9 | CEO File API | Đọc/ghi file trên máy CEO (Excel, JSON, text) |
| 10 | Bộ nhớ CEO | Lưu/tìm/xóa ghi nhớ của bot qua lệnh CEO |
| 11 | Tạo ảnh + Brand assets | Tạo ảnh AI, quản lý logo/mascot/ảnh sản phẩm |
| 12 | Google Workspace | Gmail, Calendar, Drive, Docs, Sheets, Contacts, Tasks |
| 13 | Chuỗi workflow | Nối nhiều thao tác tự động (Sheet → ảnh → Facebook; Sheet → Zalo) |
| 14 | Tạo skill mới | CEO tạo kỹ năng tùy chỉnh qua chat hoặc Dashboard |
| 15 | Sinh script tự động | Tạo Python/Node script cho tác vụ lặp lại (Excel, scrape, OCR...) |

### Marketing (2 kỹ năng)

| # | Kỹ năng | Mô tả |
|---|---------|-------|
| 16 | Zalo Post Workflow | Tạo ảnh AI rồi gửi vào nhóm Zalo — chỉ CEO Telegram |
| 17 | Facebook Post Workflow | Tạo ảnh AI rồi đăng lên Fanpage — chỉ CEO Telegram |

### Theo ngành (9 kỹ năng)

| # | Kỹ năng | Mô tả |
|---|---------|-------|
| 18 | Quản lý lịch hẹn CEO | Lịch hẹn khách, tự động nhắc, push Zalo group |
| 19 | Bất động sản | Môi giới BĐS, dự án, hợp đồng, công chứng, tracking thanh toán |
| 20 | Công nghệ / IT | SaaS, sprint, SLA, hỗ trợ kỹ thuật, release notes |
| 21 | Dịch vụ (spa/salon/clinic) | Đặt lịch, nhắc tái sử dụng, chứng chỉ hành nghề |
| 22 | F&B | Mở/đóng cửa checklist, đặt bàn, menu, khuyến mãi |
| 23 | Giáo dục / Đào tạo | Lịch học, tuyển sinh, học phí, phụ huynh, tiến độ lớp |
| 24 | Sản xuất | Đơn sản xuất, nguyên liệu, QC, BHXH, kiểm kê |
| 25 | Thương mại / Bán lẻ | Tồn kho, đơn hàng, đổi trả, NCC, doanh thu |
| 26 | Tổng quát (đa ngành) | Công việc chung không thuộc ngành cụ thể |

### Tạo kỹ năng tùy chỉnh

CEO có thể dạy bot kỹ năng mới:

**Qua Telegram:**
1. Nhắn "tạo skill mới" cho bot
2. Bot hỏi: tên skill, mô tả, quy trình cụ thể
3. Bot đề xuất tất cả thông tin cùng lúc → CEO xác nhận 1 lần
4. Skill tự kích hoạt khi khách hỏi đúng chủ đề

**Qua Dashboard:**
Dashboard → Skills → nút tạo mới → nhập thông tin → lưu

Kỹ năng tùy chỉnh CEO tạo sẽ hiện ở tab Skills bên cạnh 26 kỹ năng có sẵn.

---

## PHẦN 9: TÍNH NĂNG NÂNG CAO

### Tạo ảnh AI

CEO gửi qua Telegram: "tạo ảnh [mô tả chi tiết]"

Quy trình:
1. Bot tạo ảnh AI dựa trên brand assets đã upload (logo, mascot, sản phẩm)
2. Gửi preview cho CEO qua Telegram
3. CEO xác nhận → gửi Zalo hoặc đăng Facebook

Bot KHÔNG tự ý tạo ảnh cho khách Zalo — chỉ CEO mới dùng được tính năng này.

### Đăng bài Facebook Fanpage

CEO gửi qua Telegram: "đăng bài Facebook: [nội dung bài viết]"

Yêu cầu:
- Đã kết nối Facebook Fanpage trên Dashboard
- Cần Facebook App + Page Access Token

Quy trình:
1. Bot soạn bài → hiện preview cho CEO
2. CEO xác nhận "đăng đi" → bot đăng lên Fanpage
3. Bot báo lại link bài đăng thành công

Bot KHÔNG bao giờ tự ý đăng — luôn đợi CEO xác nhận.

### Google Workspace

Kết nối Google Account để sử dụng qua Telegram:

- **Gmail:** "Đọc email mới" / "Gửi email cho abc@gmail.com: ..."
- **Calendar:** "Tạo sự kiện ngày mai 10h: Họp khách hàng" / "Lịch tuần này"
- **Sheets:** "Đọc Sheet doanh thu tháng 5" / "Thêm hàng vào Sheet..."
- **Drive:** "Tìm file báo cáo Q1"
- **Contacts:** "Tìm số điện thoại Anh Tùng"

Yêu cầu: Google Cloud Desktop OAuth client + Drive API + Sheets API enabled. Hướng dẫn có trong Dashboard → Google → tab Cài đặt.

### Escalation (chuyển vấn đề cho CEO)

Khi khách Zalo gặp vấn đề bot không giải quyết được:

1. Bot trả lời khách: "Để em báo sếp xử lý, sếp sẽ liên hệ lại mình sớm nhất ạ"
2. Bot gửi thông báo cho CEO qua Telegram (và Zalo nếu cấu hình)
3. CEO nhận: tên khách + nội dung vấn đề + ID cuộc hội thoại

**Bot tự escalate khi gặp:**
- Khiếu nại, tranh chấp
- Đàm phán giá
- Hợp đồng, tài chính
- Vấn đề kỹ thuật phức tạp
- Thông tin không có trong tài liệu Knowledge
- Spam (3+ lần liên tiếp)

### Follow-up tự động

Cron chạy hàng ngày (mặc định 09:30), tự phát hiện khách chưa trả lời > 48 giờ hoặc có tag "hot"/"lead":
- Gửi tin nhắn nhắc nhẹ cho khách
- Báo cho CEO biết danh sách khách cần follow-up

### Vision (đọc hình ảnh)

Bot hỗ trợ đọc ảnh khách gửi qua Zalo:
- Khách gửi ảnh sản phẩm → bot nhận diện và tư vấn
- Khách gửi ảnh lỗi/hỏng → bot ghi nhận và escalate

---

## PHẦN 10: KÍCH HOẠT BẢN QUYỀN

### Màn hình kích hoạt — bố cục chi tiết

Khi mở app chưa có license (hoặc license hết hạn), hiện màn hình 2 nửa:

**Nửa trái (~60%):** Nền tối, logo 9BizClaw, tiêu đề "Unlock all Premium features", mô tả: "Activating your license gives you unlimited access to all Premium features including AI assistant, customer management, and automated business reports." Ghi chú: "Your license is tied to your computer."

**Nửa phải (~40%):** Form kích hoạt:
- Tiêu đề: "Activate License"
- Hướng dẫn: "Paste the license key you received from 9Biz to activate your Premium edition"
- **Ô nhập key** (textarea nhiều dòng, font monospace) — placeholder: `CLAW-eyJlIjoiZW1haWxAZXhhb...`
- **Machine ID** hiện bên dưới — nhấn vào để copy (hiện "đã copy!" rồi đổi lại sau 2 giây)
- **Nút "Kích hoạt"** — mặc định xám/tắt, chỉ bật khi key có ít nhất 20 ký tự
- Liên hệ: tech@modoro.com.vn

**Góc phải trên:** Nút toggle sáng/tối (đổi giao diện)

### Cách kích hoạt

1. Nhận license key từ đội ngũ 9Biz (dạng `CLAW-eyJlIjoiZW1haWxA...`)
2. Dán key vào ô nhập (nút "Kích hoạt" tự bật lên khi key đủ dài)
3. Nhấn **"Kích hoạt"** hoặc Enter
4. Chờ spinner quay — xác thực (cần internet lần đầu)
5. **Thành công:** Hiện "Kích hoạt thành công. Đang chuyển hướng..." (chữ xanh)
   - Nếu chưa thiết lập: tự mở Wizard
   - Nếu đã thiết lập trước đó: tự mở Dashboard

Sau khi kích hoạt lần đầu, app hoạt động offline không cần internet cho phần license.

### Lỗi kích hoạt thường gặp

| Thông báo lỗi (chữ đỏ dưới nút) | Ý nghĩa | Cách xử lý |
|----------------------------------|---------|-----------|
| "Key không hợp lệ. Vui lòng kiểm tra lại." | Key sai hoặc copy thiếu ký tự | Copy lại toàn bộ key (từ CLAW- đến hết), đảm bảo không thiếu/thừa ký tự |
| "Key đã hết hạn. Liên hệ hỗ trợ để gia hạn." | License đã hết hạn | Liên hệ tech@modoro.com.vn để gia hạn |
| "Key này đã được bind tới máy khác. Liên hệ tech@modoro.com.vn để chuyển máy." | Key đã kích hoạt trên máy khác | Liên hệ support kèm Machine ID cũ + mới để chuyển máy |
| "Key đã bị thu hồi. Liên hệ hỗ trợ." | Key đã bị hủy bởi admin | Liên hệ tech@modoro.com.vn |
| "Không ghi được license. Kiểm tra quyền truy cập thư mục." | Không ghi được file license | Chạy app với quyền Administrator (Windows) hoặc kiểm tra quyền thư mục (Mac) |

### Chuyển sang máy tính mới

License khóa theo phần cứng máy (hostname + MAC address + platform). Khi đổi máy:

1. Trên máy cũ: ghi lại Machine ID (hiện trên màn hình kích hoạt hoặc Dashboard)
2. Trên máy mới: mở app → ghi lại Machine ID mới
3. Gửi email cho tech@modoro.com.vn kèm: email đăng ký + Machine ID cũ + Machine ID mới
4. Support chuyển license → kích hoạt lại trên máy mới

**Lưu ý:** KHÔNG copy file `license.json` sang máy khác — file này được mã hóa theo phần cứng, sẽ bị từ chối trên máy khác.

### License hết hạn

Khi hết hạn:
- App hiện lại màn hình kích hoạt
- Bot ngừng hoạt động
- Dữ liệu (tài liệu, memory, cấu hình) vẫn giữ nguyên
- Gia hạn xong → mọi thứ hoạt động lại bình thường

---

## PHẦN 11: XỬ LÝ SỰ CỐ TOÀN DIỆN

Phần này liệt kê tất cả triệu chứng thường gặp, nguyên nhân thật, và cách khắc phục đã được kiểm chứng.

### Bot không trả lời tin nhắn Telegram

| # | Nguyên nhân | Cách nhận biết | Cách khắc phục |
|---|-----------|----------------|----------------|
| 1 | App chưa khởi động xong | Mở app < 60 giây | Chờ 30-60 giây sau khi mở app rồi thử lại |
| 2 | Token Telegram sai | Dashboard → Telegram → chấm đỏ | Dashboard → Telegram → "Đổi tài khoản" → nhập lại token từ BotFather |
| 3 | Chưa nhấn Start trên bot | Gửi tin nhưng không có phản hồi gì | Mở bot trên Telegram → nhấn nút Start |
| 4 | ChatGPT chưa kết nối | Dashboard → tổng quan → bot offline | Chạy lại wizard bước 2 hoặc Dashboard → AI Models → kết nối lại |
| 5 | Bot đang tạm dừng | Dashboard → Telegram → banner "đang tạm dừng" | Nhấn "Tiếp tục" trên Dashboard |
| 6 | Mạng internet đứt | Không load được gì trên trình duyệt | Kiểm tra kết nối mạng |
| 7 | Gateway đang restart | Bot reply "Gateway is restarting. Please wait..." | Chờ 30 giây. Nếu lặp liên tục → đóng app hoàn toàn → mở lại |

### Bot không trả lời tin nhắn Zalo

| # | Nguyên nhân | Cách nhận biết | Cách khắc phục |
|---|-----------|----------------|----------------|
| 1 | Zalo listener chưa chạy | Dashboard → Zalo → chấm đỏ | Nhấn Refresh. Nếu vẫn đỏ → đóng app mở lại |
| 2 | Kênh Zalo bị tắt | Dashboard → Zalo → toggle "Bật Zalo" đang tắt | Bật toggle (lưu ý: gateway restart 10-15 giây) |
| 3 | Người gửi bị chặn | Người nằm trong blocklist | Kiểm tra blocklist trên Dashboard → Zalo |
| 4 | Chế độ nhóm = Tắt | Nhóm có chấm đỏ | Đổi chế độ nhóm sang @mention hoặc Mọi tin |
| 5 | Chế độ bạn bè = Không trả lời | Tên người gửi bị tắt trên tab Bạn bè | Bật lại trên Dashboard → Zalo → Bạn bè |
| 6 | Bot đang tạm dừng | Banner "Bot Zalo đang tạm dừng" | Nhấn "Tiếp tục" |
| 7 | Listener cần thời gian khởi động | Mở app < 15 giây + Zalo chấm xám | Chờ 15-30 giây — chấm tự chuyển xanh |
| 8 | Tin nhắn ngoài phạm vi | Khách hỏi viết code/dịch thuật/pháp lý | Bot đúng khi im lặng — chỉ hỗ trợ sản phẩm/dịch vụ |

### Gateway restart liên tục

**Triệu chứng:** Bot trả lời "Gateway is restarting" nhiều lần, không trả lời nội dung thật.

**Nguyên nhân gốc:** Heartbeat phát hiện gateway chậm → kill → restart → chậm lại → kill... (vòng lặp).

**Cách khắc phục:**
1. Đóng app **hoàn toàn** — bao gồm cả icon trong khay hệ thống (system tray)
2. Chờ 5 giây
3. Mở lại app
4. Chờ 60 giây để gateway khởi động hoàn chỉnh
5. Nếu vẫn lặp sau 3 lần restart: Factory Reset → thiết lập lại

### Lỗi 500 khi thiết lập AI (bước 2 wizard)

**Triệu chứng:** Nhấn "Kiểm tra kết nối" → lỗi 500 hoặc không phản hồi.

**Nguyên nhân:** 9Router gặp lỗi kỹ thuật nội bộ (thường do better-sqlite3 không tương thích CPU).

**Cách khắc phục:**
1. Đóng app, mở lại, thử bước 2 lần nữa — app có auto-fix tích hợp
2. Nếu vẫn 500 sau 2-3 lần: nhấn nút **"Mở thư mục log"** (nếu hiện) → gửi file `9router.log` cho support
3. **Vị trí log:** Windows: `%APPDATA%\modoro-claw\logs\9router.log` — Mac: `~/Library/Application Support/modoro-claw/logs/9router.log`

### Tin nhắn Zalo bị chia đôi hoặc bị cắt

**Triệu chứng:** Bot gửi 1 tin nhưng khách nhận 2 tin (nửa đầu + nửa sau), hoặc chỉ nhận phần đầu.

**Nguyên nhân:** Tin dài hơn giới hạn Zalo. App tự chia nhỏ (tối đa 780 ký tự/tin, 800ms giữa mỗi tin).

**Nếu vẫn bị cắt:** Cập nhật app lên phiên bản mới nhất. Tăng "Gộp tin khách" lên 3-5 giây trên Dashboard.

### Knowledge tab — upload xong nhưng file không hiện

**Triệu chứng:** Upload thành công (không báo lỗi) nhưng danh sách file trống.

**Nguyên nhân:** Database nội bộ gặp lỗi tương thích. File đã lưu trên đĩa nhưng database không hiện.

**Cách khắc phục:**
1. Đóng app, mở lại — app tự sửa database mỗi lần khởi động
2. File vẫn lưu trên đĩa, sẽ tự xuất hiện sau khi database được sửa
3. Nếu sau 2 lần restart vẫn không hiện: liên hệ support

### Knowledge tab — PDF báo lỗi extract

**Triệu chứng:** Upload PDF → lỗi "PDF extract failed: DOMMatrix is not defined"

**Cách khắc phục:** Cập nhật app. Hoặc convert PDF sang Word (.docx) hoặc TXT trước khi upload.

### Cron không chạy trên macOS (máy ngủ hoặc đóng nắp)

**Triệu chứng:** Lịch tự động được cấu hình nhưng không fire khi MacBook đóng nắp.

**Nguyên nhân:** macOS App Nap suspend ứng dụng nền.

**Trạng thái:** App v2.4+ có powerSaveBlocker tích hợp chống App Nap. Nếu vẫn bị:
- System Settings → Battery → bỏ tick "Prevent automatic sleeping when the display is off"
- Luôn giữ app mở (có thể thu nhỏ, không cần focus)

### Cron gửi nhầm nhóm Zalo

**Triệu chứng:** CEO tạo cron cho nhóm A, tin đến nhóm B.

**Nguyên nhân:** Hai nhóm có tên giống hoặc trùng nhau.

**Trạng thái:** App v2.4+ có 3 lớp bảo vệ:
1. Từ chối tạo cron nếu tên nhóm trùng — yêu cầu đổi tên nhóm hoặc chỉ rõ ID
2. Kiểm tra chéo groupId ↔ groupName — reject nếu mismatch
3. Hiển thị 4 số cuối groupId để CEO xác nhận trước khi lưu

### Bot trả lời tin nhắn hệ thống trong nhóm Zalo

**Triệu chứng:** Bot reply "X đã thêm Y vào nhóm", "X đã rời nhóm", v.v.

**Trạng thái:** App có bộ lọc code-level cho 9 pattern tin hệ thống Zalo (thêm/rời nhóm, đổi tên nhóm, pin tin, đổi ảnh đại diện...). Cập nhật app lên phiên bản mới nhất nếu vẫn gặp.

### Bot trả lời 2 lần cho cùng 1 tin Zalo

**Triệu chứng:** Khách gửi 1 tin, bot reply 2 tin giống hệt.

**Nguyên nhân:** Zalo đôi khi gửi trùng sự kiện (network retry).

**Trạng thái:** App có bộ dedup — nếu cùng senderId + cùng nội dung trong vòng 3 giây → drop tin trùng. Cập nhật app nếu vẫn gặp.

### Bot Zalo phản hồi bot khác (bot-loop)

**Triệu chứng:** 2 bot trong nhóm Zalo reply qua lại liên tục.

**Trạng thái:** App có 6 tín hiệu phát hiện bot: prefix tự động, template lặp, không có đại từ nhân xưng, reply < 2 giây, format dữ liệu, FAQ template. Nếu vẫn loop: tắt chế độ nhóm cho nhóm đó (đỏ = tắt).

### Bot Zalo nói "chuyển cho sếp" nhưng CEO không nhận gì

**Triệu chứng:** Bot hứa chuyển cho CEO nhưng CEO không nhận alert.

**Trạng thái:** App v2.4+ có bộ phát hiện escalation 9 pattern + bot được hướng dẫn dùng cụm từ chuẩn. CEO nhận alert qua Telegram + Zalo trong 30 giây.

Nếu vẫn không nhận:
1. Kiểm tra Telegram kết nối (chấm xanh trên Dashboard)
2. Nếu cả 2 kênh mất kết nối: alert ghi vào `logs/ceo-alerts-missed.log` — kiểm tra khi có mạng lại

### Mật khẩu 9Router / AI Models không đăng nhập được

**Mật khẩu mặc định:** `123456`

Nếu không vào được:
1. Kiểm tra đúng mật khẩu: `123456` (không dấu cách, không chữ hoa)
2. Nhấn **Reload** trên Dashboard → tab AI Models
3. Nếu vẫn không được: đóng app mở lại (app reset password về mặc định mỗi lần khởi động)

### App bị Windows Defender / SmartScreen chặn

**Triệu chứng:** "Windows protected your PC" khi mở app.

**Cách xử lý:**
1. Nhấn **"More info"**
2. Nhấn **"Run anyway"**
3. Chỉ cần làm 1 lần — Windows ghi nhớ

### App bị macOS Gatekeeper chặn

**Triệu chứng:** "9BizClaw can't be opened because the developer cannot be verified"

**Cách xử lý:**
1. System Settings → Privacy & Security
2. Cuộn xuống → nhấn **"Open Anyway"** bên cạnh thông báo 9BizClaw

### Cron agent trả về kết quả trống hoặc CEO nhận prompt thay vì kết quả

**Triệu chứng:** CEO nhận câu lệnh gốc thay vì kết quả AI.

**Nguyên nhân:** Cron chạy ở chế độ tin cố định thay vì agent mode.

**Cách khắc phục:** Khi tạo cron qua Telegram, nói rõ: "tóm tắt" hoặc "phân tích" hoặc "kiểm tra" — bot sẽ hiểu cần dùng AI agent.

### Thanh tiến trình cài đặt đứng im > 10 phút

**Cách khắc phục theo thứ tự:**
1. Kiểm tra internet (mở trình duyệt thử)
2. Tắt VPN/proxy nếu có
3. Đóng app hoàn toàn → mở lại (app tự retry từ chỗ dừng)
4. Nếu dùng mạng công ty: hỏi IT bỏ chặn `registry.npmjs.org` và `nodejs.org`
5. Thử dùng 4G điện thoại chia sẻ hotspot

### Dashboard hiện "Chưa có hoạt động" sau khi cài xong

**Bình thường** khi mới cài. Hoạt động sẽ hiện sau khi:
- Bot nhận/gửi tin nhắn đầu tiên
- Cron chạy lần đầu
- Gateway khởi động xong (log event "gateway_ready")

Kiểm tra: `logs/audit.jsonl` có entry `gateway_ready` không.

### Không thể embed 9Router hoặc OpenClaw trong Dashboard (webview trắng)

**Triệu chứng:** Tab AI Models hoặc OpenClaw hiện trắng.

**Nguyên nhân cũ:** X-Frame-Options header chặn iframe. App v2.4+ strip header cho local origins.

**Nếu vẫn trắng:** Nhấn nút **"Mở trong browser"** để dùng giao diện trên trình duyệt riêng.

### Lỗi khi sleep/resume trên Windows (cron bị miss)

**Triệu chứng:** Máy Windows ngủ (sleep) rồi thức dậy, cron lẽ ra phải chạy trong lúc ngủ bị bỏ qua.

**Trạng thái:** App v2.4+ có **sleep catch-up** — khi máy thức dậy, app quét lại khoảng thời gian bị miss và chạy bù các cron đã lỡ.

---

## PHẦN 12: CÂU HỎI THƯỜNG GẶP (FAQ)

### Cài đặt và thiết lập

**Cần internet không?**
Cần internet khi: cài đặt lần đầu (170MB), khi bot hoạt động (kết nối ChatGPT + Telegram + Zalo). KHÔNG cần internet cho: mở Dashboard, xem cài đặt, xem file Knowledge đã upload.

**ChatGPT miễn phí được không?**
Được. ChatGPT miễn phí hoạt động bình thường. ChatGPT Plus cho phản hồi nhanh hơn nhưng không bắt buộc.

**Dùng Claude / Gemini / Ollama thay ChatGPT được không?**
9Router hỗ trợ nhiều AI provider. Mặc định dùng ChatGPT. Cấu hình provider khác: Dashboard → AI Models → đăng nhập → thêm provider.

**Sau wizard, bao lâu bot sẵn sàng?**
30-60 giây để gateway khởi động. Sau đó bot sẵn sàng nhận tin.

**Cài trên nhiều máy được không?**
Mỗi license key khóa theo 1 máy. Cần license riêng cho mỗi máy, hoặc liên hệ support chuyển máy.

### Sử dụng hàng ngày

**Có cần mở app liên tục không?**
Có. Bot chỉ hoạt động khi app đang mở (có thể thu nhỏ xuống khay hệ thống, không cần focus).

**Bot có hoạt động khi tắt màn hình?**
Có, miễn app vẫn chạy. Mac có bộ chống App Nap tích hợp.

**Bot trả lời chậm (>30 giây)?**
Phụ thuộc: tốc độ ChatGPT, mạng, độ phức tạp câu hỏi. Bình thường: 3-10 giây. Nếu > 30 giây: kiểm tra internet và trạng thái ChatGPT.

**Bot có đọc ảnh khách gửi không?**
Có. Bot hỗ trợ vision — phân tích ảnh khách Zalo gửi và trả lời về nội dung ảnh.

**Dữ liệu có an toàn không?**
Toàn bộ dữ liệu lưu trên máy bạn. Không gửi lên cloud của 9Biz. Hội thoại đi qua ChatGPT (theo chính sách bảo mật OpenAI).

**Bot có tiết lộ thông tin nội bộ cho khách không?**
Không. Bot có bộ lọc output — chặn file path, API key, nội dung kỹ thuật, suy luận tiếng Anh. Tài liệu "Nội bộ" hoặc "Chỉ mình tôi" không bao giờ chia sẻ với khách.

### Zalo

**Bot có tự reply nhóm Zalo không?**
Tùy cài đặt: Mọi tin = reply tất cả, @mention = chỉ khi tag, Tắt = im lặng. Cấu hình trên Dashboard → Zalo → tab Nhóm.

**Khách spam nhóm, bot reply hết à?**
Không. Bot có bộ lọc phòng thủ 19 trigger — phát hiện spam, trashtalk, bot khác, tin hệ thống → im lặng hoặc escalate.

**Bot có nhớ khách cũ không?**
Có. Bot ghi nhớ tên, lịch sử, sở thích. Lần sau nhắn: bot dùng thông tin cũ tự nhiên (không nhắc "em đã ghi nhớ").

**Bot chào khách mới bao nhiêu lần?**
1 lần duy nhất (first greeting). Sau đó không chào lại.

### Cron / Lịch tự động

**Cron có chạy khi app tắt không?**
Không. Cron chỉ chạy khi app đang mở.

**Tạo cron gửi nhóm Zalo được không?**
Được. Nhắn Telegram: "tạo cron gửi nhóm [tên nhóm] mỗi sáng 9h: [nội dung]"

**Giới hạn số cron?**
Không giới hạn. Tần suất tối thiểu: 5 phút/lần.

**Cron có chạy bù sau khi máy ngủ không?**
Có (Windows). App phát hiện sleep gap → chạy bù cron đã lỡ.

### Facebook

**Bot có tự đăng Facebook không?**
Không bao giờ tự ý. Luôn đợi CEO xác nhận trước khi publish.

**Cần gì để kết nối Facebook?**
Fanpage + Facebook App (tạo tại developers.facebook.com) + Page Access Token. Hướng dẫn: Dashboard → Facebook.

### Bản quyền

**License hết hạn thì sao?**
App hiện màn hình kích hoạt. Bot ngừng. Dữ liệu vẫn giữ. Gia hạn xong → hoạt động lại.

**Đổi máy thì sao?**
Liên hệ tech@modoro.com.vn kèm Machine ID cũ + mới.

**Mất key thì sao?**
Liên hệ tech@modoro.com.vn kèm email đã đăng ký. Support cấp lại.

### Khắc phục nhanh

**Cách nhanh nhất sửa hầu hết lỗi?**
Đóng app hoàn toàn (cả icon khay hệ thống) → mở lại. App tự phát hiện và sửa nhiều lỗi khi khởi động lại.

**Factory Reset ở đâu?**
Nút tròn góc dưới phải Dashboard → "Xóa sạch dữ liệu". Gõ "xóa" để xác nhận. Xóa hết, phải thiết lập lại.

**Backup dữ liệu?**
Nút tròn góc dưới phải → "Xuất dữ liệu (backup)". Phục hồi: cùng menu → "Khôi phục từ file".

**Liên hệ hỗ trợ?**
- Email: tech@modoro.com.vn
- Telegram: nhóm hỗ trợ 9Biz (link trong Dashboard → menu hỗ trợ → "Liên hệ 9Biz")

---

## PHỤ LỤC: GIỚI HẠN CỦA BOT

Bot 9BizClaw **KHÔNG** làm được những việc sau trên kênh Zalo (khách hàng):

- Viết code, dịch thuật, viết bài văn
- Tư vấn pháp lý, y tế, tài chính
- Giải toán, làm bài tập
- Thảo luận chính trị, tôn giáo
- Truy cập URL bên ngoài, tải file
- Tạo/sửa/xóa lịch tự động
- Thay đổi cấu hình hệ thống
- Tiết lộ thông tin nội bộ (file, API, cấu hình)
- Chiến lược kinh doanh, nghiên cứu thị trường

Khi khách hỏi ngoài phạm vi: "Dạ em chỉ hỗ trợ sản phẩm và dịch vụ công ty thôi ạ."

Các tính năng nâng cao (tạo ảnh, đăng Facebook, quản lý cron, Google Workspace, tạo skill...) chỉ CEO dùng được qua Telegram.
