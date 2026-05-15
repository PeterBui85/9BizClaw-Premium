# Skills — Thư viện kỹ năng

Bot TỰ ĐỘNG đọc INDEX này và chọn skill phù hợp MỖI KHI CEO yêu cầu.

## Cách hoạt động
1. CEO nhắn yêu cầu qua Telegram
2. Bot đọc INDEX → match keyword → đọc skill file tương ứng
3. Bot follow quy trình trong skill → output chất lượng cao

## Vận hành bot (15 skills) — `skills/operations/`

| Skill | File | Khi nào dùng |
|---|---|---|
| Zalo (CSKH + nhóm + reply rules) | `zalo.md` | MỌI tin Zalo — phạm vi + 19 trigger phòng thủ + format + nhóm + memory + escalate |
| Quản lý lịch tự động | `cron-management.md` | Tạo/sửa/xóa cron, lên lịch gửi tin |
| Tra cứu kiến thức | `knowledge-base.md` | Tra cứu tài liệu để trả lời khách |
| Theo dõi khách hàng | `follow-up.md` | Follow-up khách chưa phản hồi |
| Quản lý kênh | `channel-control.md` | Tạm dừng/tiếp tục kênh, blocklist |
| Hành vi veteran | `veteran-behavior.md` | Persona, tier khách, cultural, tone match |
| Kênh CEO Telegram | `telegram-ceo.md` | Tư duy cố vấn + gửi Zalo từ Telegram (group/cá nhân) |
| Workspace API | `workspace-api.md` | Đọc/ghi/list file nội bộ port 20200 |
| CEO File API | `ceo-file-api.md` | Đọc/ghi/list/exec file trên máy CEO |
| Bộ nhớ CEO | `ceo-memory-api.md` | Lưu/tìm/xóa ký ức qua API |
| Tạo ảnh + Brand assets | `image-generation.md` | Tạo ảnh AI, brand assets, skill ảnh mẫu |
| Google Workspace | `google-workspace.md` | Gmail/Calendar/Drive/Docs/Sheets (OAuth) + đọc Sheet công khai (CSV) |
| Chuỗi workflow | `workflow-chains.md` | Kết hợp nhiều API thành chuỗi tự động |
| Tạo skill mới | `skill-builder.md` | CEO tạo/sửa/xóa skill tùy chỉnh qua chat |
| Sinh script tự động | `script-generator/SKILL.md` | Tạo Python/Node script cho task lặp lại của CEO (Excel/Sheet/OCR/scrape/...) |

## Marketing (2 skills) — `skills/marketing/`

| Skill | File | Khi nào dùng |
|---|---|---|
| Zalo Post Workflow | `zalo-post-workflow.md` | Tạo ảnh AI rồi gửi nhóm Zalo — CHỈ CEO Telegram |
| Facebook Post Workflow | `facebook-post-workflow.md` | Tạo ảnh AI rồi đăng Fanpage — CHỈ CEO Telegram |

## Theo ngành (9 skills) — `skills/`

| Skill | File | Khi nào dùng |
|---|---|---|
| Quản lý lịch hẹn CEO | `appointments.md` | Lịch hẹn khách, nhắc, push Zalo group |
| Bất động sản | `bat-dong-san.md` | Môi giới BĐS, dự án, hợp đồng, công chứng |
| Công nghệ / IT | `cong-nghe.md` | SaaS, sprint, SLA, hỗ trợ kỹ thuật |
| Dịch vụ (spa/salon/clinic) | `dich-vu.md` | Đặt lịch, nhắc tái sử dụng, chứng chỉ hành nghề |
| F&B | `fnb.md` | Mở/đóng cửa checklist, đặt bàn, menu, khuyến mãi |
| Giáo dục / Đào tạo | `giao-duc.md` | Lịch học, tuyển sinh, học phí, phụ huynh |
| Sản xuất | `san-xuat.md` | Đơn sản xuất, nguyên liệu, QC, BHXH |
| Thương mại / Bán lẻ | `thuong-mai.md` | Tồn kho, đơn hàng, đổi trả, NCC |
| Tổng quát (đa ngành) | `tong-quat.md` | Công việc chung không thuộc ngành cụ thể |

## Mẫu ảnh (CEO tạo) — `skills/image-templates/`

CEO tạo skill ảnh qua Telegram ("tạo skill ảnh mới"). Gọi `GET /api/image/skills` để xem danh sách.

## Skill tùy chỉnh (CEO tạo) — `user-skills/`

CEO tạo skill riêng qua Telegram ("tạo skill mới"). Đọc `skill-builder.md` cho quy trình. Hệ thống tự động inject skill phù hợp (theo trigger keyword match) vào tin nhắn của khách trước khi bot xử lý — bot KHÔNG cần tự đọc file skill.

---

**Tổng: 26 skill cơ bản + mẫu ảnh + skill tùy chỉnh CEO tạo** cho chủ doanh nghiệp Việt Nam.
Skill cũ (advisory, board, SOC2, Twitter, marketing SaaS) đã chuyển vào `skills/_archived/` — vẫn truy cập được nếu cần.
