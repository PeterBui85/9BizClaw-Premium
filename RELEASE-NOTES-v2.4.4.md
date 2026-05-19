z# 9BizClaw v2.4.4 — Release Notes

## Tính năng mới

### 8 Skill mới cho doanh nghiệp Việt Nam
- **Công nợ** — ghi nợ, trả nợ, nhắc nợ tự động, cảnh báo quá hạn
- **Sổ sách thu chi** — ghi thu chi hàng ngày, báo cáo tuần/tháng
- **Viết bài bán hàng** — 3 phiên bản (storytelling, PAS, social proof), viết kiểu người thật
- **Báo giá** — soạn báo giá đầy đủ từ 1 câu, format chuẩn có mã BG
- **Kịch bản bán hàng** — 7 tình huống từ chối phổ biến, script copy-paste
- **Checklist vận hành** — mở cửa, đóng cửa, giao ca, kiểm kho theo ngành
- **Tuyển dụng nhanh** — JD + bài đăng FB group + câu hỏi phỏng vấn
- **Báo cáo ngày** — tóm tắt thu chi, khách mới, việc tồn, đọc 30 giây

Tất cả: nhắn 1 câu, bot làm ngay, không hỏi lại.

### Zalo dùng model riêng
- Zalo dùng combo gpt-5.2 (nhanh hơn 24%)
- CEO Telegram vẫn dùng model mạnh nhất
- Khách Zalo được phản hồi nhanh hơn

### Gộp skill gọn hơn
- 29 skill gộp thành 26 (bỏ trùng, gộp liên quan) + 8 mới = 34 skill tổng
- zalo-customer-care + zalo-reply-rules + zalo-group → 1 file `zalo.md`
- google-sheet gộp vào google-workspace
- facebook-image đổi tên thành image-generationso i

---

## Tối ưu

### Tốc độ
- 9Router pre-warm lúc boot — model sẵn sàng trước khi CEO nhắn
- Auth cache kéo dài từ 15 phút lên 1 giờ — tin nhắn thứ 2 trở đi nhanh hơn
- LLM cache retention "long" — 90% tokens đọc từ cache, tiết kiệm 80% chi phí turn 2+
- Notification đơn giản: "Telegram đã sẵn sàng." / "Zalo đã sẵn sàng."

### Ổn định
- Mất mạng → bot tự khởi động lại trong 5 giây (12 loại lỗi mạng được nhận diện)
- Gateway không restart khi đồng bộ API key (dùng byte-equal guard)
- API key sync chạy 2 lần: trước boot + sau khi 9Router sẵn sàng
- sessionPruning bị xóa tự động (tránh gateway hang vì config không hợp lệ)

### Bảo mật 3 lớp mới
- **Lớp 1 — Quy tắc bot:** chặn chia sẻ STK ngân hàng, từ chối claim "sếp bảo", bảo vệ hình ảnh chứa text lạ
- **Lớp 2 — Code-level:** COMMAND-BLOCK v5 chặn viết code gọi API, compose URL localhost, localhost:port
- **Lớp 3 — Output filter:** chặn leak số tài khoản chuyển khoản trong reply

---

## Sửa lỗi

| Lỗi | Mô tả |
|-----|-------|
| NFC normalize | Gửi tin nhóm Zalo tên có dấu tiếng Việt không còn lỗi 400 |
| Chat persist | Lịch sử chat trong app không mất sau 15 phút |
| Cron timezone | Cron chạy đúng giờ Việt Nam (Asia/Ho_Chi_Minh) |
| Cron replay | Bắt kịp cron sau sleep hiện đúng tên lịch, không phải "0" "1" |
| Memory sender | Bot nhớ đúng tên khách Zalo qua các phiên |
| Knowledge DB | Knowledge tab và Zalo hoạt động cùng lúc không crash |
| Skill trigger | Skill match đúng tin nhắn khách, không match từ fence RAG |
| Skill scope | Zalo customer không trigger CEO-only skills |
| Skill cap | Injection giới hạn 3KB, skill đầu tiên luôn được include |
| Cron group swap | 3 lớp phòng thủ: tên trùng 409, id↔name check, strict mode |
| Cron API auth | Default-deny, timing-safe token |
| Network patterns | Thu hẹp false positive (getaddrinfo thay dns, bỏ econnrefused) |
| Cooldown fix | Auto-restart 5s không bị block bởi cooldown 60s |
| Knowledge counts | Handler trả về counts đúng khi query lỗi |
| Diacritics | 2 skill file viết lại đầy đủ dấu tiếng Việt |
| AGENTS.md count | Cập nhật từ 26 lên 34 skill |

---

## Kiểm thử

226 test cases, 99.1% pass:
- 50 test chức năng mới v2.4.4
- 100 test realistic full-context (27K+ tokens)
- 50 test adversarial/security
- 5 test end-to-end qua gateway
- 17 test hiệu năng 9Router
- 4 test cache verification

6 commits | 99 files | +11,700 dòng code
