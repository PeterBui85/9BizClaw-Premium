# 9BizClaw Premium — Sổ Tay Hướng Dẫn

---

## Chương 1: Chào Mừng

### Cảm ơn anh/chị đã chọn 9BizClaw Premium

9BizClaw là trợ lý AI dành riêng cho chủ doanh nghiệp Việt Nam. Không phải chatbot kịch bản cứng — đây là trợ lý thông minh, hiểu ngữ cảnh, tự học từ tài liệu doanh nghiệp của anh/chị và trả lời khách hàng như một nhân viên thật.

### Triết lý sản phẩm

**Dữ liệu là của anh/chị.** Toàn bộ thông tin — hội thoại khách hàng, tài liệu, cấu hình — lưu trên máy tính của anh/chị. Không gửi lên cloud của 9Biz. Không ai ngoài anh/chị truy cập được.

**AI chạy trên máy bạn.** 9BizClaw kết nối trực tiếp với ChatGPT (tài khoản miễn phí hoặc Plus của anh/chị). Phần mềm đóng vai trò "bộ não điều phối" — nhận tin từ Zalo/Telegram, tra cứu tài liệu doanh nghiệp, và trả lời khách bằng giọng phù hợp với thương hiệu.

### Anh/chị sẽ có gì

| Tính năng | Mô tả |
|-----------|-------|
| Tự động trả lời Zalo | Bot CSKH 24/7, trả lời dựa trên tài liệu doanh nghiệp thật |
| Quản lý qua Telegram | Ra lệnh, nhận báo cáo, kiểm soát bot mọi lúc mọi nơi |
| 8 lịch tự động | Báo cáo sáng/tối/tuần/tháng, follow-up khách, health check |
| Lịch tự động riêng | Tạo không giới hạn: gửi nhóm Zalo, nhắc nhân viên, kiểm đơn |
| Tài liệu doanh nghiệp | Upload PDF/Word/Excel — bot tự đọc và dùng khi trả lời khách |
| Kỹ năng có sẵn + tùy chỉnh | Vận hành, marketing, theo ngành (BĐS, F&B, spa, IT, giáo dục...) |
| Tạo ảnh AI | Banner, poster, ảnh sản phẩm — dùng logo và brand assets của bạn |
| Đăng Facebook Fanpage | Soạn bài + đăng lên Fanpage qua lệnh Telegram |
| Google Workspace | Gmail, Calendar, Sheets, Drive, Docs, Contacts, Tasks |
| Ghi nhớ khách hàng | Bot tự ghi tên, sở thích, lịch sử — phục vụ tốt hơn mỗi lần |
| Escalation thông minh | Tự chuyển vấn đề phức tạp cho anh/chị qua Telegram |
| Dashboard quản lý | Bảng điều khiển trực quan, xem mọi thứ trong 1 màn hình |

### Liên hệ hỗ trợ

| Kênh | Chi tiết |
|------|----------|
| Email kỹ thuật | tech@modoro.com.vn |
| Nhóm Telegram | Link trong app — Dashboard, menu hỗ trợ, "Liên hệ 9Biz" |

---

## Chương 2: Cài Đặt & Kích Hoạt

### Chuẩn bị trước khi cài

Trước khi bắt đầu, anh/chị chuẩn bị sẵn:

| # | Cần chuẩn bị | Chi tiết |
|---|-------------|----------|
| 1 | Tài khoản Telegram | Cài Telegram trên điện thoại hoặc máy tính (telegram.org) |
| 2 | Tài khoản Zalo | Đang đăng nhập Zalo trên cùng máy sẽ cài 9BizClaw |
| 3 | Tài khoản ChatGPT | Đăng ký tại chatgpt.com (miễn phí hoặc Plus đều được) |
| 4 | Máy tính | Windows 10+ hoặc macOS 11+, tối thiểu 4GB RAM, 500MB trống |
| 5 | License key | Dạng `CLAW-eyJlIjoiZW1haWxA...` — nhận từ 9Biz |

**Không bắt buộc nhưng nên có sẵn:**
- Tên công ty, địa chỉ, số hotline
- File bảng giá hoặc catalog sản phẩm (PDF/Word/Excel)
- Logo công ty (JPG/PNG)

### Tải về và cài đặt

**Windows:**
1. Mở file `.exe` nhận từ 9Biz
2. Chờ cài đặt (1-2 phút)
3. App tự mở sau khi xong

**macOS:**
1. Mở file `.dmg`
2. Kéo icon 9BizClaw vào thư mục Applications
3. Mở 9BizClaw từ Applications
4. Nếu macOS chặn: System Settings — Privacy & Security — nhấn "Open Anyway"

### Lần chạy đầu tiên — Tải runtime

Lần đầu mở app, anh/chị thấy **màn hình cài đặt** với thanh tiến trình. App cần tải thêm các thành phần (~170MB, mất 2-10 phút tùy mạng).

**Màn hình hiển thị 6 bước:**

| Bước | Tên | Ý nghĩa |
|------|-----|---------|
| 1 | Node.js Runtime | Tải engine xử lý |
| 2 | Cài đặt packages | Tải các gói phần mềm cần thiết |
| 3 | Plugin Zalo | Cài plugin kết nối Zalo |
| 4 | gogcli | Cài công cụ Google Workspace |
| 5 | Mô hình AI | Kiểm tra kết nối AI |
| 6 | Hoàn tất | Sẵn sàng |

**Mỗi bước có 4 trạng thái màu:**
- Xám = chưa đến lượt
- Cam = đang chạy (spinner quay)
- Xanh lá = hoàn tất (dấu tích)
- Đỏ = có lỗi

**Nếu gặp lỗi:** App hiện bảng chẩn đoán tự động (7 mục kiểm tra) + nút "Thử lại". Xem Chương 6 để biết chi tiết cách xử lý.

> **Mẹo:** Nếu mạng công ty có firewall, thử dùng hotspot 4G điện thoại cho lần tải đầu tiên.

### Kích hoạt license

Sau khi tải runtime xong (hoặc khi mở app lần đầu), anh/chị thấy màn hình kích hoạt:

1. **Dán license key** vào ô nhập (ô lớn, font monospace). Placeholder gợi ý: `CLAW-eyJlIjoiZW1haWxAZXhhb...`
2. **Machine ID** hiện sẵn bên dưới — nhấn vào để copy (dùng khi cần chuyển máy sau này)
3. Nhấn **"Kích hoạt"** (nút chỉ bật khi key đủ dài)
4. Chờ xác thực (cần internet lần đầu)
5. Thành công — app tự chuyển sang Wizard thiết lập

**Lỗi thường gặp khi kích hoạt:**

| Thông báo | Ý nghĩa | Cách xử lý |
|-----------|---------|-----------|
| "Key không hợp lệ" | Copy thiếu hoặc thừa ký tự | Copy lại toàn bộ key từ `CLAW-` đến hết |
| "Key đã hết hạn" | License hết thời hạn | Liên hệ tech@modoro.com.vn để gia hạn |
| "Bind tới máy khác" | Key đã dùng trên máy cũ | Liên hệ tech@modoro.com.vn kèm Machine ID cũ + mới |

> **Quan trọng:** License khóa theo phần cứng máy. Khi đổi máy mới, liên hệ support để chuyển — không copy file được.

### Wizard thiết lập — 4 bước

Sau kích hoạt, app chạy Wizard 4 bước. Mỗi bước đều bắt buộc — không bỏ qua được.

**Bước 1 — Thông tin cơ bản**

| Ô nhập | Bắt buộc? | Ví dụ |
|--------|-----------|-------|
| Họ và tên | Có | Nguyễn Văn A |
| Tên công ty | Không | Shop Thời Trang ABC |
| Tên trợ lý ảo | Không | Momo, Linh (để trống = bot xưng "em") |
| Trợ lý gọi anh/chị là | Có | anh, chị, sếp, giám đốc |

**Bước 2 — Kết nối ChatGPT**

1. Nhấn **"Kết nối ChatGPT"** — trình duyệt mở trang đăng nhập
2. Đăng nhập ChatGPT, nhấn "Connect"
3. Quay lại app, nhấn **"Kiểm tra kết nối"**
4. Thành công: hiện chữ xanh "ChatGPT đã kết nối. Model [tên] sẵn sàng."

> **Mẹo:** Cả ChatGPT miễn phí và Plus đều hoạt động. Plus cho phản hồi nhanh hơn nhưng không bắt buộc.

**Bước 3 — Kết nối Telegram (quan trọng nhất)**

Bước này có nhiều màn hình con, nhưng tóm gọn 3 việc:

**Việc 1: Tạo bot Telegram**
- Mở Telegram, tìm @BotFather
- Gõ `/newbot`, đặt tên hiển thị và username (kết thúc bằng "bot")
- BotFather gửi lại **Mã kết nối** (Bot Token) — dạng `7104958362:BBHxR93kLm...`
- Copy toàn bộ dòng mã này, dán vào app

**Việc 2: Lấy User ID**
- Mở Telegram, tìm @userinfobot
- Gõ `/start` — bot trả về dãy số ID (ví dụ: `5738291046`)
- Copy dãy số, dán vào app

**Việc 3: Kiểm tra**
- App gửi tin thử đến Telegram của anh/chị
- Mở Telegram kiểm tra — thấy tin = thành công
- Không thấy? Kiểm tra: đã nhấn Start trên bot chưa? Token copy đủ chưa? User ID đúng chưa?

**Bước 4 — Hoàn tất**

Hiển thị tóm tắt: tên, AI đã kết nối, Telegram đã kết nối. Nhấn **"Khởi động trợ lý"** — xong.

**Ngay sau wizard:** Mở Telegram, tìm bot vừa tạo, gửi bất kỳ tin nào. Bot trả lời trong 30-60 giây (lần đầu gateway cần khởi động).

---

## Chương 3: Khám Phá Dashboard

Dashboard là "phòng điều khiển" của anh/chị. Mở app là thấy Dashboard.

### Bố cục tổng quan

**Thanh bên trái (icon rail):**
- Phía trên: logo 9BizClaw + chấm trạng thái bot (xanh = đang chạy, đỏ = dừng, xám = kiểm tra) + nút bật/dừng
- **6 mục chính từ trên xuống:**
  - **Tổng quan** — thống kê, hoạt động, lịch
  - **Chat** — nhắn trực tiếp với bot trong app
  - **Kênh** — sub-tabs: Telegram, Zalo, Facebook, Google (có chấm trạng thái kết nối riêng)
  - **Nội dung** — sub-tabs: Tài liệu, Tính cách bot, Skills, Tài sản hình ảnh, AI Models, Lịch tự động
  - **Brain** — đồ thị tri thức (knowledge graph) hiện khách hàng, nhóm, tài liệu dưới dạng node
  - **Cấu hình** — giao diện, nâng cao, cập nhật

**Góc dưới phải:** Nút tròn menu hỗ trợ — Liên hệ 9Biz, Xem lại hướng dẫn, Xuất backup, Khôi phục, Factory Reset.

### Tab "Tổng quan" — Trang chủ

Mở Dashboard là thấy tab này. Hiển thị:

- **Lời chào** với tên anh/chị + trạng thái bot
- **3 thẻ thống kê:** Khách mới Zalo hôm nay | Sự kiện hôm nay | Cron OK hôm nay
- **"Bot đã học"** — những gì bot ghi nhớ từ hội thoại gần đây
- **"Lịch hôm nay"** — lịch tự động sắp chạy
- **"Hoạt động gần đây"** — log: khởi động, cron, tin bị lọc...

Tự cập nhật mỗi 30 giây.

### Tab "Chat" — Nhắn trực tiếp với bot

Giao diện chat ngay trong app. Không cần mở Telegram.

- Nhập tin nhắn — Enter để gửi (Shift+Enter xuống dòng)
- Lịch sử lưu tự động, giữ khi đóng mở app
- Khi chưa có tin: hiện 3 gợi ý nhanh — "Báo cáo hôm nay", "Kiểm tra đơn hàng", "Tình hình Zalo"

### Tab "Telegram" — Kênh điều khiển

Đây là "remote control" của anh/chị. Quản lý:

- **Trạng thái kết nối** — chấm xanh + tên bot + thời gian kiểm tra
- **Tạm dừng / Tiếp tục** — dừng bot 15 phút đến 24 giờ
- **Đổi tài khoản** — thay token và user ID

**Cài đặt Telegram:**

| Cài đặt | Tùy chọn | Ý nghĩa |
|---------|----------|---------|
| Người lạ nhắn tin | Trả lời / Chào + hướng dẫn / Bỏ qua | Cách bot xử lý người không phải anh/chị |
| Hành vi nhóm | @mention / Mọi tin / Tắt | Bot reply trong group Telegram |
| Giới hạn lịch sử | 10-50 tin | Bao nhiêu tin cũ bot nhớ trong 1 phiên |
| Gộp tin | 0-5 giây | Gom nhiều tin gửi liền thành 1 |

**Câu lệnh mẫu:** Danh sách lệnh có sẵn, nhấn copy để dùng nhanh.

### Tab "Zalo" — Kênh khách hàng

Nơi quản lý cách bot tương tác với khách trên Zalo:

- **Bật/Tắt Zalo** — toggle chính (lưu ý: bật/tắt sẽ khởi động lại gateway, Telegram gián đoạn 10-15 giây)
- **Tạm dừng / Tiếp tục** — dừng bot tạm thời

**3 chế độ bạn bè:**
- Trả lời bình thường (mặc định)
- Chỉ chào 1 lần — bot chào khi nhận tin đầu tiên, sau đó im
- Không trả lời

**3 chế độ nhóm (tab "Nhóm"):**
- **Xanh = Mọi tin** — bot reply tất cả trong nhóm
- **Vàng = @mention** — chỉ reply khi được tag
- **Đỏ = Tắt** — im lặng

Có nút "Bật tất cả" / "Tắt tất cả" và ô tìm kiếm.

**Tab "Bạn bè":** Bật/tắt từng người. Tìm theo tên hoặc số điện thoại.

**Allowlist:** Từ v2.4.4, Zalo DM dùng mô hình allowlist — chỉ người trong danh sách mới nhận phản hồi từ bot. Bật/tắt từng người ở tab Bạn bè.

### Tab "Tài liệu" — Dạy bot kiến thức

Đây là nơi anh/chị "dạy" bot về doanh nghiệp:

**3 thư mục:**
- **Công ty** — giới thiệu, chính sách, giờ mở cửa, địa chỉ
- **Sản phẩm** — bảng giá, catalog, thông số kỹ thuật
- **Nhân viên** — thông tin nội bộ (bot không chia sẻ với khách)

**Upload:** Kéo file vào hoặc nhấn chọn. Hỗ trợ PDF, Word, Excel, TXT, CSV, JPG, PNG. Tối đa 100MB/file.

**3 mức hiển thị:**
- **Công khai** — bot dùng khi trả lời khách Zalo
- **Nội bộ** — chỉ anh/chị và nhân viên
- **Chỉ mình tôi** — chỉ anh/chị qua Telegram

Bot tự đọc và tóm tắt sau khi upload. Khi khách hỏi, bot tra cứu tài liệu trước — không bịa.

> **Mẹo:** Upload bảng giá ngay sau wizard. Đây là file quan trọng nhất — bot sẽ trả lời giá chính xác thay vì nói "em chưa có thông tin".

### Tab "Tính cách bot"

Tùy chỉnh cách bot giao tiếp:

**Giọng bot:** Em (nữ trẻ) | Em (nam trẻ) | Chị (trung niên) | Anh (trung niên) | Mình (trung tính)

**Gọi khách:** Anh/chị | Quý khách | Mình

**Tính cách (chọn 3-5):** Sáng tạo, Thực tế, Linh hoạt, Chỉn chu, Chu đáo, Kiên nhẫn, Năng động, Điềm tĩnh, Chủ động, Ấm áp, Đồng cảm, Thẳng thắn, Chuyên nghiệp, Thân thiện, Tinh tế

**Độ trang trọng:** Thanh trượt 1 (rất thân mật) đến 10 (rất trang trọng)

> **Gợi ý:** Shop thời trang/F&B: "Em nữ trẻ" + "Mình" + Thân thiện, Năng động, Ấm áp + trang trọng 3-4. Spa/clinic: "Em nữ trẻ" + "Anh/chị" + Chu đáo, Tinh tế, Chuyên nghiệp + trang trọng 6-7. BĐS: "Anh trung niên" + "Anh/chị" + Chuyên nghiệp, Thẳng thắn, Chủ động + trang trọng 7-8.

### Tab "Lịch tự động"

Quản lý lịch bot chạy định kỳ. Xem chi tiết ở Chương 4.

### Các tab khác

| Tab | Chức năng |
|-----|----------|
| Skills | Xem kỹ năng có sẵn + tạo kỹ năng tùy chỉnh |
| Tài sản hình ảnh | Upload logo, mascot, ảnh sản phẩm cho tạo ảnh AI |
| AI Models | Quản lý AI provider qua 9Router (mật khẩu mặc định: `123456`) |
| Brain | Đồ thị tri thức — hiện 582+ nodes (khách hàng, nhóm, tài liệu, kỹ năng) dưới dạng knowledge graph. Lọc theo loại, tìm kiếm, xem liên kết giữa các entities |
| Facebook | Kết nối Fanpage + đăng bài |
| Google | Calendar, Gmail, Sheets, Drive, Docs, Contacts, Tasks |
| Cài đặt | Giao diện (Sáng/Tối/Hệ thống), ẩn xuống tray, nâng cao, cập nhật |

---

## Chương 4: Sử Dụng Hàng Ngày

### 10 lệnh Telegram CEO nên biết

Mở Telegram, tìm bot, gửi tin nhắn bình thường — không cần cú pháp đặc biệt.

| # | Mục đích | Gửi gì | Ví dụ |
|---|---------|--------|-------|
| 1 | Báo cáo nhanh | "Tóm tắt hôm nay" | "Hôm nay có gì mới?" |
| 2 | Gửi tin Zalo | "Nhắn Zalo cho [tên]: [nội dung]" | "Nhắn Zalo cho chị Lan: Em gửi báo giá ạ" |
| 3 | Gửi nhóm Zalo | "Gửi nhóm [tên]: [nội dung]" | "Gửi nhóm NHÂN VIÊN: Họp 3h chiều nay" |
| 4 | Tạo lịch tự động | "Tạo cron [mô tả]" | "Tạo cron gửi nhóm VIP mỗi sáng 9h: Chào buổi sáng!" |
| 5 | Xem lịch | "Danh sách cron" | "Xem lịch tự động" |
| 6 | Tạm dừng bot | "Tạm dừng 30 phút" | "Pause bot 2 tiếng" |
| 7 | Tạo ảnh | "Tạo ảnh [mô tả]" | "Tạo banner giảm giá 50% cuối tuần" |
| 8 | Đăng Facebook | "Đăng Facebook: [nội dung]" | "Đăng bài Facebook: Khai trương chi nhánh mới!" |
| 9 | Tra tài liệu | "Bảng giá sản phẩm X" | "Giá iPhone 15 Pro?" |
| 10 | Hệ thống | "Trạng thái" | "Bot đang chạy không?" |

> **Lưu ý:** Bot luôn xác nhận trước khi gửi tin Zalo hoặc đăng Facebook. Anh/chị reply "ok" hoặc "gửi đi" để xác nhận.

### Zalo: Bot tự trả lời khách như thế nào

Khi khách nhắn Zalo:
1. Bot nhận tin, tra cứu tài liệu Knowledge
2. Trả lời ngắn gọn (1-2 câu), tiếng Việt có dấu, đúng giọng Persona Mix
3. Nếu không tìm thấy thông tin: "Dạ cái này em chưa có thông tin chính thức ạ" rồi chuyển cho anh/chị qua Telegram
4. Nếu gặp khiếu nại/vấn đề phức tạp: "Để em báo sếp xử lý" rồi gửi alert qua Telegram

**Bot CHỈ hỗ trợ sản phẩm và dịch vụ.** Khách hỏi viết code, tư vấn pháp lý, giải toán — bot từ chối lịch sự.

**Bot ghi nhớ khách:** Tên, lịch sử, sở thích — lần sau phục vụ tốt hơn. Bot không nhắc "em đã ghi nhớ" — dùng tự nhiên.

**Bot phòng thủ:** Tự phát hiện spam, bot khác, tin hệ thống nhóm, trashtalk — im lặng thay vì reply bừa.

### Upload tài liệu — Dạy bot kiến thức

**Nên upload ngay sau wizard:**

| Ưu tiên | File | Upload vào | Mức hiển thị |
|---------|------|-----------|-------------|
| 1 | Bảng giá / Catalog | Sản phẩm | Công khai |
| 2 | Giới thiệu công ty / Chính sách | Công ty | Công khai |
| 3 | Hotline / Địa chỉ / Giờ mở cửa | Công ty | Công khai |
| 4 | Thông tin nhân sự | Nhân viên | Nội bộ |

Bot tự đọc và tóm tắt mỗi file sau khi upload. Chờ vài giây đến 1 phút tùy kích thước. Sau đó, hỏi thử bot: "Giá sản phẩm X?" — bot sẽ trả lời dựa trên tài liệu.

### Tạo lịch tự động

**8 lịch có sẵn:**

| Lịch | Chức năng |
|------|----------|
| Báo cáo sáng | Tóm tắt hoạt động qua đêm + lịch hôm nay |
| Tóm tắt tối | Tóm tắt cả ngày |
| Báo cáo tuần | Tóm tắt tuần |
| Báo cáo tháng | Tóm tắt tháng |
| Theo dõi khách | Phát hiện khách chưa reply > 48 giờ |
| Heartbeat | Kiểm tra bot còn sống |
| Thiền | Nhắc nghỉ ngơi |
| Dọn bộ nhớ | Lưu trữ hồ sơ cũ |

**Tạo lịch riêng qua Telegram:**

Nhắn bot mô tả tự nhiên. Ví dụ:
- "Tạo cron gửi nhóm KHÁCH VIP mỗi sáng 9h: Chào các anh chị! Shop hôm nay có sản phẩm mới."
- "Tạo cron nhắc nhóm NHÂN VIÊN mỗi thứ 2 lúc 8h: Nhớ nộp báo cáo tuần."
- "Tạo cron mỗi 2 giờ kiểm tra đơn hàng mới"

**Hai loại:**
- **Tin cố định** — gửi đúng nội dung anh/chị nhập (không thay đổi)
- **Agent mode** — bot chạy AI tạo nội dung mới mỗi lần (tóm tắt, phân tích)

Bot tự phân biệt. Nếu anh/chị nói "kiểm tra" hoặc "tóm tắt" = agent mode. Nếu nói nội dung cụ thể = tin cố định.

**Quản lý:** Dashboard — Lịch tự động: xem, bật/tắt, xóa, test fire (chạy thử ngay).

> **Lưu ý:** Lịch tự động chỉ chạy khi app đang mở. Có thể thu nhỏ xuống khay hệ thống (tray) — không cần để cửa sổ focus.

### Gửi tin Zalo từ Telegram

Anh/chị không cần mở Zalo trên máy tính để nhắn khách. Từ Telegram:

- **Nhắn cá nhân:** "Nhắn Zalo cho Nguyễn Văn B: Anh ơi đơn hàng đã giao rồi ạ"
- **Nhắn nhóm:** "Gửi nhóm ĐỒNG NGHIỆP: Nhớ checkin sáng mai nha"

Bot tự tìm liên hệ, xác nhận tên + nội dung, chờ anh/chị reply "gửi đi" rồi mới gửi.

### Tạo ảnh AI và đăng Facebook

**Tạo ảnh:** Nhắn Telegram: "Tạo ảnh poster giảm giá 30% mùa hè"
- Bot tạo ảnh dựa trên brand assets đã upload (logo, sản phẩm)
- Gửi preview cho anh/chị
- Xác nhận — gửi Zalo hoặc đăng Facebook

**Đăng Facebook:** Nhắn Telegram: "Đăng bài Facebook: Khai trương chi nhánh mới tại Quận 7!"
- Cần kết nối Fanpage trước (Dashboard — Facebook)
- Bot soạn bài, preview, chờ xác nhận rồi mới đăng

---

## Chương 5: Khai Thác Nâng Cao

### Kỹ năng có sẵn

Bot tự kích hoạt kỹ năng phù hợp khi nhận tin — không cần bật/tắt thủ công.

**Vận hành (15 kỹ năng):**

| Kỹ năng | Mô tả ngắn |
|---------|-----------|
| Zalo CSKH | Trả lời khách, bộ lọc phòng thủ, format, escalate |
| Quản lý cron | Tạo/sửa/xóa lịch tự động |
| Tra cứu kiến thức | Tìm tài liệu trả lời khách |
| Theo dõi khách | Follow-up khách chưa reply |
| Quản lý kênh | Pause/resume, allowlist |
| Veteran | Nhận diện khách cũ, điều chỉnh giọng |
| Telegram CEO | Cố vấn + gửi Zalo từ Telegram |
| Workspace API | Đọc/ghi file nội bộ |
| CEO File API | Đọc/ghi file trên máy |
| Bộ nhớ bot | Lưu/tìm ghi nhớ |
| Tạo ảnh | Ảnh AI + brand assets |
| Google Workspace | Gmail/Calendar/Sheets/Drive/Docs |
| Workflow chains | Nối nhiều thao tác tự động |
| Tạo skill mới | CEO tạo kỹ năng riêng |
| Sinh script | Python/Node cho task lặp lại |

**Marketing (2):** Zalo Post Workflow (ảnh + gửi nhóm), Facebook Post Workflow (ảnh + đăng Fanpage)

**Theo ngành (9):**

| Ngành | Phù hợp cho |
|-------|------------|
| Lịch hẹn | Salon, clinic, dịch vụ có booking |
| Bất động sản | Môi giới, dự án, hợp đồng |
| Công nghệ / IT | SaaS, sprint, SLA, hỗ trợ kỹ thuật |
| Dịch vụ (spa/salon) | Đặt lịch, nhắc tái sử dụng |
| F&B | Đặt bàn, menu, khuyến mãi, checklist |
| Giáo dục | Lịch học, tuyển sinh, học phí |
| Sản xuất | Đơn hàng, nguyên liệu, QC |
| Thương mại / Bán lẻ | Tồn kho, đơn hàng, đổi trả |
| Tổng quát | Công việc chung đa ngành |

### Tạo kỹ năng tùy chỉnh

Anh/chị có thể dạy bot quy trình riêng. Nhắn Telegram: "tạo skill mới"

Bot sẽ hỏi: tên, mô tả, quy trình chi tiết. Bot đề xuất tất cả cùng lúc — anh/chị xác nhận 1 lần là xong.

Ví dụ: tạo skill "Báo giá combo" — khi khách hỏi combo, bot tự tính giá theo công thức anh/chị định sẵn.

### Google Workspace

Kết nối Google Account để dùng qua Telegram:

| Lệnh | Ví dụ |
|-------|-------|
| Đọc email | "Đọc email mới" |
| Gửi email | "Gửi email cho abc@gmail.com: ..." |
| Xem lịch | "Lịch tuần này" |
| Tạo sự kiện | "Tạo sự kiện ngày mai 10h: Họp khách" |
| Đọc Sheet | "Đọc Sheet doanh thu tháng 5" |

Yêu cầu: thiết lập Google Cloud OAuth (hướng dẫn trong Dashboard — Google — Cài đặt).

### Workflow chains

Nối nhiều thao tác thành chuỗi tự động. Ví dụ:
- "Đọc Sheet doanh thu rồi tạo ảnh báo cáo đăng Facebook"
- "Lấy danh sách khách VIP từ Sheet rồi gửi tin nhóm Zalo"

Nhắn Telegram mô tả chuỗi — bot tự thực hiện từng bước.

---

## Chương 6: Xử Lý Sự Cố

### Cách nhanh nhất sửa hầu hết lỗi

**Đóng app hoàn toàn** (bao gồm cả icon ở khay hệ thống / system tray) rồi **mở lại**. Chờ 60 giây. App tự phát hiện và sửa nhiều lỗi khi khởi động.

Cách này xử lý được: bot không reply, gateway restart, Knowledge không hiện, cron không chạy.

### Bot không trả lời tin nhắn

**Trên Telegram:**

| Kiểm tra | Cách xử lý |
|----------|-----------|
| App mới mở < 60 giây | Chờ 60 giây rồi thử lại |
| Dashboard — Telegram — chấm đỏ | Token sai — "Đổi tài khoản" nhập lại token |
| Chưa nhấn Start trên bot | Mở bot trên Telegram — nhấn Start |
| ChatGPT chưa kết nối | Dashboard — AI Models — kết nối lại |
| Đang tạm dừng (banner hiện) | Nhấn "Tiếp tục" |
| Bot reply "Gateway is restarting" | Chờ 30 giây. Lặp nhiều lần: đóng mở app |

**Trên Zalo:**

| Kiểm tra | Cách xử lý |
|----------|-----------|
| Dashboard — Zalo — chấm đỏ | Nhấn Refresh. Vẫn đỏ: đóng mở app |
| Toggle "Bật Zalo" đang tắt | Bật lên (gateway restart 10-15 giây) |
| Người gửi không trong allowlist | Kiểm tra Zalo → Bạn bè → bật toggle người đó |
| Nhóm đang ở chế độ Tắt (đỏ) | Đổi sang @mention hoặc Mọi tin |
| Bạn bè đang tắt | Bật lại trên tab Bạn bè |
| Đang tạm dừng | Nhấn "Tiếp tục" |
| App mới mở < 30 giây | Chờ 15-30 giây, chấm tự chuyển xanh |

### Lỗi khi cài đặt (splash screen)

| Triệu chứng | Nguyên nhân | Cách xử lý |
|-------------|-------------|-----------|
| Thanh tiến trình đứng im | Mạng chậm hoặc bị chặn | Kiểm tra internet, tắt VPN, thử hotspot 4G |
| "EBUSY" / "File in use" | Windows Defender quét file | Thêm %APPDATA%\9bizclaw vào Exclusions |
| "Permission denied" | Thiếu quyền ghi | Chạy app quyền Administrator |
| "Disk full" | Ổ đĩa đầy | Giải phóng 500MB |
| "CERT_HAS_EXPIRED" | Proxy công ty chặn HTTPS | Đổi mạng hoặc liên hệ IT |
| Lỗi sau "Thử lại" 3 lần | Lỗi nghiêm trọng | Gửi ảnh chụp lỗi cho tech@modoro.com.vn |

### Lỗi license

| Thông báo | Cách xử lý |
|-----------|-----------|
| "Key không hợp lệ" | Copy lại toàn bộ key từ CLAW- đến hết |
| "Key đã hết hạn" | Liên hệ tech@modoro.com.vn gia hạn |
| "Bind tới máy khác" | Liên hệ tech@modoro.com.vn + Machine ID cũ + mới |
| "Đã bị thu hồi" | Liên hệ tech@modoro.com.vn |
| "Không ghi được" | Chạy quyền Administrator |

### Các sự cố khác

| Sự cố | Cách xử lý |
|-------|-----------|
| Gateway restart liên tục | Đóng hết (cả tray) — mở lại — chờ 60 giây |
| Lỗi 500 wizard bước 2 | Đóng mở lại. App tự sửa. Vẫn 500: gửi log cho support |
| Zalo tin bị chia đôi | App tự chia tin dài. Tăng "Gộp tin" lên 3-5 giây |
| Upload Knowledge không hiện | DB tạm lỗi. Đóng mở lại — file tự hiện |
| PDF lỗi extract | Convert sang Word/TXT trước khi upload |
| Cron không chạy trên Mac | App có chống App Nap. Nếu vẫn bị: Settings — Battery |
| Cron nhầm nhóm | App yêu cầu xác nhận nếu trùng tên nhóm |
| 9Router không đăng nhập | Mật khẩu mặc định: 123456. Đóng mở nếu cần |
| Windows chặn app | More info — Run anyway |
| macOS chặn app | System Settings — Privacy — Open Anyway |
| Màn hình trắng | Đóng mở lại. Nghiêm trọng: Factory Reset |

### Khi nào liên hệ support

Liên hệ tech@modoro.com.vn khi:
- Đã thử đóng mở app 2-3 lần mà vẫn lỗi
- Lỗi license (hết hạn, chuyển máy, thu hồi)
- Splash screen lỗi sau 3 lần "Thử lại"
- Cần hướng dẫn tính năng nâng cao

Kèm theo: mô tả lỗi + ảnh chụp màn hình + hệ điều hành (Windows/Mac).

---

## Chương 7: Câu Hỏi Thường Gặp

### Cài đặt & Thiết lập

**Cần internet không?**
Cần khi: cài đặt lần đầu (170MB), khi bot hoạt động (ChatGPT + Telegram + Zalo). Không cần cho: mở Dashboard, xem cài đặt, xem file Knowledge.

**ChatGPT miễn phí được không?**
Được. Plus cho phản hồi nhanh hơn nhưng không bắt buộc.

**Dùng Claude / Gemini thay ChatGPT được không?**
9Router hỗ trợ nhiều provider. Cấu hình: Dashboard — AI Models.

**Cài trên nhiều máy?**
Mỗi license khóa 1 máy. Cần license riêng hoặc liên hệ chuyển máy.

### Sử dụng hàng ngày

**Cần mở app liên tục?**
Có. Bot chỉ chạy khi app mở. Thu nhỏ xuống tray là đủ.

**Bot trả lời chậm?**
Bình thường 3-10 giây. Hơn 30 giây: kiểm tra internet và ChatGPT.

**Bot đọc ảnh khách gửi được không?**
Có. Bot hỗ trợ vision — phân tích ảnh Zalo và trả lời.

**Dữ liệu an toàn không?**
Dữ liệu lưu 100% trên máy anh/chị. Hội thoại đi qua ChatGPT theo chính sách OpenAI.

**Bot tiết lộ thông tin nội bộ cho khách không?**
Không. Bộ lọc output chặn file path, API key, nội dung kỹ thuật. File "Nội bộ"/"Chỉ mình tôi" không bao giờ chia sẻ khách.

### Zalo

**Bot có tự reply nhóm không?**
Tùy chế độ: Mọi tin = reply tất cả, @mention = khi tag, Tắt = im. Cài đặt trên Dashboard — Zalo — tab Nhóm.

**Khách spam, bot reply hết?**
Không. Bot có 19 trigger phòng thủ — phát hiện spam, bot khác, tin hệ thống, trashtalk — tự im lặng.

**Bot nhớ khách cũ?**
Có. Ghi nhớ tên, lịch sử, sở thích. Dùng tự nhiên, không nhắc "em đã ghi nhớ".

### Lịch tự động

**Cron chạy khi app tắt không?**
Không. App phải mở (thu nhỏ tray OK).

**Tạo cron gửi nhóm Zalo?**
Được. Nhắn Telegram: "tạo cron gửi nhóm [tên] mỗi sáng 9h: [nội dung]"

**Cron chạy bù sau khi máy ngủ?**
Có (Windows). App phát hiện sleep gap và chạy bù.

### Bản quyền

**License hết hạn?**
App hiện màn hình kích hoạt. Dữ liệu giữ nguyên. Gia hạn xong hoạt động lại.

**Đổi máy?**
Liên hệ tech@modoro.com.vn + Machine ID cũ + mới.

**Mất key?**
Liên hệ tech@modoro.com.vn + email đã đăng ký.

### Backup & Khôi phục

**Backup?**
Menu hỗ trợ (nút tròn dưới phải) — "Xuất dữ liệu (backup)".

**Phục hồi?**
Cùng menu — "Khôi phục từ file" — chọn file backup.

**Factory Reset?**
Cùng menu — "Xóa sạch dữ liệu" — gõ "xóa" xác nhận. Xóa hết, bắt đầu lại.

---

## Phụ lục A: Lệnh Telegram — Quick Reference

| Lệnh | Ví dụ |
|-------|-------|
| Báo cáo | "Tóm tắt hôm nay" / "Báo cáo tuần" |
| Gửi Zalo | "Nhắn Zalo cho [tên]: [nội dung]" |
| Gửi nhóm | "Gửi nhóm [tên]: [nội dung]" |
| Tạo cron | "Tạo cron [mô tả tự nhiên]" |
| Xem cron | "Danh sách cron" |
| Xóa cron | "Xóa cron [tên]" |
| Test cron | "Test cron [tên]" |
| Tạm dừng | "Tạm dừng 30 phút" |
| Tiếp tục | "Tiếp tục bot" |
| Trạng thái | "Trạng thái hệ thống" |
| Tạo ảnh | "Tạo ảnh [mô tả]" |
| Đăng FB | "Đăng Facebook: [nội dung]" |
| Email | "Đọc email mới" |
| Lịch | "Lịch tuần này" |
| Sheet | "Đọc Sheet [tên]" |
| Tạo skill | "Tạo skill mới" |

## Phụ lục B: Thông Tin Liên Hệ

| Kênh | Chi tiết |
|------|----------|
| Email kỹ thuật | tech@modoro.com.vn |
| Nhóm Telegram | Link trong Dashboard — menu hỗ trợ — "Liên hệ 9Biz" |
| Website | 9bizclaw.com |

---

*9BizClaw Premium — Trợ Lý AI Doanh Nghiệp*
*MODORO Tech Corp*
