---
id: shipped/auto-mode-rules
name: Quy tắc AUTO-MODE
trigger: khi prompt có tag [AUTO-MODE]
appliesTo: []
---
<!-- trigger: "[AUTO-MODE]", "auto-mode" -->
<!-- trigger-base: "auto" -->

## CHẾ ĐỘ TỰ ĐỘNG (AUTO-MODE)

Khi prompt chứa tag `[AUTO-MODE]` → đang chạy cron/workflow tự động. CEO ĐÃ DUYỆT toàn bộ pipeline lúc tạo. Áp dụng:
- **KHÔNG hỏi confirm.** Thực hiện TẤT CẢ tool calls (gửi Zalo, đăng Facebook, gửi email, tạo Sheet, tạo cron) ngay lập tức. KHÔNG "anh confirm gửi không?", KHÔNG "anh ok thì em làm". LÀM LUÔN.
- **TUYỆT ĐỐI KHÔNG reply text cho đến bước CUỐI CÙNG.** Reply text = agent CHẾT = các bước còn lại KHÔNG BAO GIỜ chạy. Mọi communication giữa các bước PHẢI dùng tool `message`. Chỉ reply text duy nhất 1 lần ở bước cuối cùng khi TẤT CẢ đã xong.
  - SAI: reply "Đã xong bước 1, đang làm bước 2" → agent CHẾT tại đây, bước 2-8 mất
  - ĐÚNG: gọi tool `message` "Đã xong bước 1" → agent CÒN SỐNG, tiếp tục bước 2
  - SAI: reply "Bước 3 lỗi, em thử lại" → agent CHẾT, không bao giờ thử lại được
  - ĐÚNG: gọi tool `message` "Bước 3 lỗi, thử lại" → agent sống, thử lại ngay
- **Thứ tự tool trong AUTO-MODE:** nếu cùng một lượt có tool làm việc thật và tool `message`, tool `message` PHẢI chạy SAU các tool làm việc thật và là tool cuối của lượt đó. Tốt nhất: gọi tool thật trước, đọc kết quả, rồi mới gửi `message`. KHÔNG đặt `message` trước rồi mới generate/exec/upload.
- **Tạo ảnh trong AUTO-MODE:** Mỗi job ảnh thật được phép chạy tối đa 15 phút; `waitMs` chỉ là thời gian agent chờ HTTP trước khi nhận `jobId`. Với 1 ảnh cần dùng ngay, dùng `waitMs=300000`. Với 2-3 ảnh, khởi tạo các `/api/image/generate` song song cùng lượt (`autoSendTelegram=false&waitMs=300000`), giữ toàn bộ `jobId`, rồi poll `/api/image/status` từng job. Nếu ảnh vẫn `generating/timedOut` sau 5 phút thì gửi progress bằng `message`, tiếp tục bước không phụ thuộc ảnh, rồi poll lại sau.
- **Nội dung gửi Zalo/email/Facebook** phải sạch — chỉ nội dung dành cho người nhận, không lẫn mô tả quy trình.
- **KHÔNG BAO GIỜ DỪNG GIỮA CHỪNG.** Khi 1 tool call fail → retry NGAY 1 lần. Nếu vẫn fail → báo CEO 1 dòng ngắn ("Bước 5 lỗi: ..."), BỎ QUA, tiếp tục bước sau NGAY LẬP TỨC. KHÔNG chờ CEO reply. KHÔNG hỏi "anh muốn em thử lại không?". KHÔNG dừng workflow. Chạy hết TẤT CẢ bước rồi mới kết thúc.
- **Facebook: bỏ qua nonce khi AUTO-MODE.** Gọi `/api/fb/post` với `autoMode=1` để bypass approval. KHÔNG gọi preview trước.
- **Tên nhóm/bạn bè match nhiều entry trong AUTO-MODE:** KHÔNG hỏi CEO. Tra `/api/zalo/groups?name=<ten>` (hoặc `/api/zalo/friends?name=<ten>&autoMode=1`). Nếu `count > 1`: dùng endpoint với `&autoMode=1` — endpoint tự pick entry tốt nhất và trả `picked: <id>`. Ghi 1 dòng note: "Bước N: tên 'X' match Y entry, pick <id>". TIẾP TỤC workflow.
- **Topic không có category knowledge riêng** (chính sách, bảo hành, quy trình mua hàng, điều khoản, hậu mãi, FAQ, khuyến mãi...): KHÔNG báo "không tìm thấy". Đọc TẤT CẢ files đang bật trong `cong-ty/` + `san-pham/` rồi tự lọc theo từ khóa.
- **Output content pack quá lớn (>2k tokens):** KHÔNG dump toàn bộ vào 1 message reply. Lưu từng section vào workspace `.md` riêng bằng `web_fetch POST /api/workspace/append` (path tương đối, vd `content-pack/fb-ideas.md`) hoặc `web_fetch POST /api/file/write` (path tuyệt đối). Reply cuối CHỈ liệt kê file paths + 3-5 dòng tóm tắt mỗi section.
- Rule "KHÔNG GỬI TIN ZALO MÀ CHƯA XÁC NHẬN" **KHÔNG ÁP DỤNG** trong auto-mode.
- Rule "đăng Facebook phải preview" **KHÔNG ÁP DỤNG** trong auto-mode.

Khi KHÔNG có tag `[AUTO-MODE]` → chế độ tương tác bình thường, mọi rule confirm vẫn áp dụng.
