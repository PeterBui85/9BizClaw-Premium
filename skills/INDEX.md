# Skills — Thư viện kỹ năng

Bot TỰ ĐỘNG đọc INDEX này và chọn skill phù hợp MỖI KHI CEO yêu cầu.

## Cách hoạt động
1. CEO nhắn yêu cầu qua Telegram
2. Bot đọc INDEX → match keyword → đọc skill file tương ứng
3. Bot follow quy trình trong skill → output chất lượng cao

Thư viện chia 5 nhóm: **Hệ Thống · Marketing · Sale · CSKH · Vận hành**.

### Chọn skill khi TRÙNG chủ đề (quan trọng)
Một số chủ đề có 2 loại skill — chọn theo NHU CẦU, không đọc cả hai:
- **Trả lời nhanh / việc hằng ngày trong chat** → dùng skill mỏng `operations/*` (vd "báo giá nhanh" → `operations/bao-gia.md`; "kịch bản bán hàng" → `operations/kich-ban-ban-hang.md`).
- **"Tạo bộ tài liệu chuẩn" / hợp đồng / SOP / chính sách / file formal xuất ra** → dùng gói `bb-*` tương ứng (vd "tạo hợp đồng bán hàng", "soạn SOP", "xây bộ tài liệu nhân sự" → `bb-sales` / `bb-operations` / `bb-people`).
- Mặc định khi không rõ: ưu tiên skill mỏng (nhanh, hợp chat). Chỉ mở gói `bb-*` khi CEO nói rõ cần tài liệu/bộ tài liệu chuẩn.
- Gói `bb-*` CHỈ chạy khi CEO yêu cầu qua Telegram. KHÔNG kích hoạt gói `bb-*` khi đang trả lời khách Zalo — kể cả khi khách dùng từ khóa trùng (vd "khiếu nại", "onboarding"); trả lời khách theo `operations/zalo.md`.

## Hệ Thống (10 skills)

| Skill | File | Khi nào dùng |
|---|---|---|
| Giới thiệu 9BizClaw | `operations/gioi-thieu.md` | CEO hỏi "9BizClaw là gì", "em làm được gì", "giới thiệu", "có tính năng gì" — bot tự mô tả đúng năng lực, danh tính, giới hạn |
| Kênh CEO Telegram | `operations/telegram-ceo.md` | Tư duy cố vấn + gửi Zalo từ Telegram (group/cá nhân) |
| Workspace API | `operations/workspace-api.md` | Đọc/ghi/list file nội bộ + đơn hàng + tồn kho + nghỉ phép |
| CEO File API | `operations/ceo-file-api.md` | Đọc/ghi/list/exec file trên máy CEO |
| Bộ nhớ CEO | `operations/ceo-memory-api.md` | Lưu/tìm/xóa ký ức qua API |
| Quản lý kênh | `operations/channel-control.md` | Tạm dừng/tiếp tục kênh, blocklist |
| Google Workspace | `operations/google-workspace.md` | Gmail/Calendar/Drive/Docs/Sheets (OAuth) + composite endpoints |
| Chuỗi workflow | `operations/workflow-chains.md` | Kết hợp nhiều API thành chuỗi tự động |
| Tạo skill mới | `operations/skill-builder.md` | CEO tạo/sửa/xóa skill tùy chỉnh qua chat |
| Sinh script tự động | `operations/script-generator/SKILL.md` | Tạo Python/Node script cho task lặp lại (Node.js fallback cho Mac) |

Quy tắc hành vi hệ thống (Zalo / Telegram / AUTO-MODE / Knowledge routing) nằm trong `skills/shipped/` — tự động inject, không cần gọi tay.

## Marketing (8 skills)

| Skill | File | Khi nào dùng |
|---|---|---|
| Zalo Post Workflow | `marketing/zalo-post-workflow.md` | Tạo ảnh AI rồi gửi nhóm Zalo — CHỈ CEO Telegram |
| Facebook Post Workflow | `marketing/facebook-post-workflow.md` | Tạo ảnh AI rồi đăng Fanpage (1 bài lẻ) — CHỈ CEO Telegram |
| Facebook Campaign (loạt N bài) | `marketing/facebook-campaign.md` | "đăng chiến dịch N bài", "lên lịch loạt bài Facebook", "series N bài" — duyệt CẢ plan 1 lần rồi tạo lịch đóng băng. KHÁC bài lẻ ở trên. |
| pro-content (viết content pro) | `marketing/pro-content/pro-content.md` | "viết bài", "content", "caption", "đăng bài", "viết quảng cáo", "soạn bài" — hook mạnh + framework, không giọng AI |
| pro-ds (prompt tạo ảnh pro) | `marketing/pro-ds/pro-ds.md` | "tạo ảnh", "mô tả ảnh", "ảnh đăng bài", "poster", "ảnh sản phẩm" — soạn prompt gpt-image-2 đúng backend, chữ Việt đủ dấu |
| Facebook Insights | `operations/facebook-insights.md` | Đọc chỉ số Fanpage bằng quyền `read_insights` |
| Tạo ảnh + Brand assets | `operations/image-generation.md` | Tạo ảnh AI, brand assets, skill ảnh mẫu |
| Bộ tài liệu Marketing | `bb-marketing/SKILL.md` | "kế hoạch marketing", "chiến lược content", "lịch nội dung", "chạy ads", "SEO", "email marketing", "brand guidelines" — sinh bộ tài liệu marketing chuẩn DN |

## Sale (4 skills)

| Skill | File | Khi nào dùng |
|---|---|---|
| Viết bài bán hàng | `operations/viet-bai-ban-hang.md` | Viết bài FB/Zalo bán hàng kiểu người thật, 3 phiên bản |
| Kịch bản bán hàng | `operations/kich-ban-ban-hang.md` | Script bán hàng + xử lý 7 tình huống từ chối |
| Soạn báo giá | `operations/bao-gia.md` | Soạn báo giá/proposal nhanh + xuất file Word |
| Bộ tài liệu Bán hàng | `bb-sales/SKILL.md` | "quy trình bán hàng", "kịch bản telesales", "sổ tay bán hàng", "pipeline", "chính sách đại lý", "hợp đồng bán hàng", "thiết lập CRM" — sinh bộ tài liệu kinh doanh chuẩn DN |

## CSKH (6 skills)

| Skill | File | Khi nào dùng |
|---|---|---|
| Zalo (CSKH + nhóm + reply rules) | `operations/zalo.md` | MỌI tin Zalo -- phạm vi + 22 trigger phòng thủ + format + nhóm + memory + escalate |
| Theo dõi khách hàng | `operations/follow-up.md` | Follow-up khách chưa phản hồi + truy vấn ad-hoc |
| Hành vi veteran | `operations/veteran-behavior.md` | Persona, tier khách, cultural, tone match |
| Tra cứu kiến thức | `operations/knowledge-base.md` | Tra cứu tài liệu để trả lời khách |
| Tổng hợp khách Zalo ra Sheet | `operations/zalo-followup-sheet.md` | 1 API call xuất khách Zalo vào CRM Sheet |
| Bộ tài liệu CSKH | `bb-customer/SKILL.md` | "quy trình chăm sóc KH", "xử lý khiếu nại", "onboarding khách", "NPS/CSAT", "loyalty", "referral", "hoàn tiền/bảo hành" — sinh bộ tài liệu CSKH chuẩn DN |

## Vận hành (15 skills)

| Skill | File | Khi nào dùng |
|---|---|---|
| Quản lý lịch tự động | `operations/cron-management.md` | Tạo/sửa/xóa cron, lên lịch gửi tin |
| Tạo/sửa tài liệu + link Drive | `operations/document-creation.md` | Orchestrator: tạo DOCX/XLSX/PPTX/PDF rồi `gog drive upload --convert` trả link Sheets/Docs/Slides. Engine từng định dạng = các skill `anthropic-*` bên dưới (đọc khi cần API chi tiết). |
| Checklist vận hành | `operations/checklist-van-hanh.md` | Mở/đóng cửa, giao ca, kiểm kho |
| Tuyển dụng nhanh | `operations/tuyen-dung-nhanh.md` | JD + bài đăng FB group + câu hỏi phỏng vấn |
| Theo dõi công nợ | `operations/cong-no.md` | Ghi nợ, trả nợ, nhắc nợ, cảnh báo quá hạn |
| Sổ sách đơn giản | `operations/so-sach-don-gian.md` | Thu chi hàng ngày, báo cáo tuần/tháng |
| Báo cáo ngày | `operations/bao-cao-ngay.md` | Tóm tắt ngày/tuần: 1 API call composite |
| Quản lý lịch hẹn | `appointments.md` | Lịch hẹn khách, nhắc, push Zalo group |
| Xử lý Excel | `anthropic-xlsx/SKILL.md` | Đọc, tóm tắt, sửa, tạo file .xlsx trên máy CEO |
| Tạo file Word/DOCX | `anthropic-docx/SKILL.md` | Tạo báo giá, hợp đồng, báo cáo, đề xuất dạng Word |
| Tạo PowerPoint/PPTX | `anthropic-pptx/SKILL.md` | Tạo slide thuyết trình, pitch deck, báo cáo PowerPoint |
| Tạo PDF | `anthropic-pdf/SKILL.md` | Tạo PDF báo cáo, hợp đồng, proposal có layout đẹp |
| Bộ tài liệu Vận hành | `bb-operations/SKILL.md` | "tạo SOP", "sổ tay vận hành", "quản lý kho", "đánh giá NCC", "nội quy văn phòng", "quản lý tài sản" — sinh bộ tài liệu vận hành chuẩn DN |
| Bộ tài liệu Tài chính | `bb-finance/SKILL.md` | "ngân sách", "cashflow forecast", "SOP kế toán", "báo cáo tài chính", "chính sách công nợ", "định giá", "phân tích hòa vốn" — sinh bộ tài liệu tài chính-kế toán chuẩn DN |
| Bộ tài liệu Nhân sự | `bb-people/SKILL.md` | "sơ đồ tổ chức", "viết JD", "quy trình tuyển dụng", "sổ tay nhân viên", "nội quy lao động", "KPI nhân viên", "quy chế lương thưởng" — sinh bộ tài liệu nhân sự chuẩn DN |

## Quản lý nghiệp vụ (qua API composite) -- tích hợp trong `operations/workspace-api.md`

| Nghiệp vụ | Endpoint | Trigger |
|---|---|---|
| Quản lý đơn hàng | `/api/order/*` | "ghi đơn", "đơn hàng", "order", "xem đơn" |
| Quản lý tồn kho | `/api/inventory/*` | "tồn kho", "kiểm kho", "nhập hàng", "xuất hàng" |
| Nghỉ phép / Chấm công | `/api/leave/*` | "xin nghỉ", "nghỉ phép", "chấm công" |
| Báo cáo tổng hợp | `/api/report/daily` | "báo cáo ngày", "hôm nay thế nào" |
| Xuất CRM Sheet | `/api/zalo-crm/export` | "tổng hợp khách Zalo", "xuất Sheet" |
| Tạo Sheet có format | local `.xlsx` → `gog drive upload --convert` | "tạo Sheet theo dõi", "tạo bảng" |

## Mẫu ảnh (CEO tạo) — `skills/image-templates/`

CEO tạo skill ảnh qua Telegram ("tạo skill ảnh mới"). Gọi `GET /api/image/skills` để xem danh sách.

## Skill tùy chỉnh (CEO tạo) — `user-skills/`

CEO tạo skill riêng qua Telegram ("tạo skill mới"). Đọc `operations/skill-builder.md` cho quy trình. Hệ thống tự động inject skill phù hợp (theo trigger keyword match) vào tin nhắn của khách trước khi bot xử lý — bot KHÔNG cần tự đọc file skill.

---

**Tổng: 43 skill cơ bản (5 nhóm: Hệ Thống 10 · Marketing 8 · Sale 4 · CSKH 6 · Vận hành 15) + 6 API composite + mẫu ảnh + skill tùy chỉnh CEO tạo.**
API composite (đơn hàng, tồn kho, nghỉ phép, báo cáo, CRM export, Sheet format) tích hợp sẵn trong `operations/workspace-api.md` -- không cần skill riêng, bot gọi trực tiếp.
Skill theo ngành nghề KHÔNG nằm trong bộ mặc định — tặng riêng khi khách quan tâm (mỗi doanh nghiệp một khác, đưa hết vào dễ nhầm lẫn).

6 "Bộ tài liệu" (`bb-sales`, `bb-customer`, `bb-marketing`, `bb-operations`, `bb-finance`, `bb-people`) là các gói sinh tài liệu vận hành chuẩn DN — mỗi gói có `SKILL.md` + thư mục `references/` chứa công thức tạo từng tài liệu (mô tả → câu hỏi thu thập → cấu trúc → prompt tạo). Nguồn: Business Builder của MODORO (Quốc MODORO), giấy phép MIT.
