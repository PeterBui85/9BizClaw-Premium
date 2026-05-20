# Test Prompts — AUTO-MODE (8-10 bước)

> Copy từng prompt, paste vào Telegram gửi cho bot. Bot phải tự chạy hết không hỏi confirm.
> Sau mỗi test, check: Facebook Fanpage, nhóm Zalo modoro-claw demo, email, Google Sheet.

---

## Prompt 1: Báo cáo tháng (8 bước)

```
[AUTO-MODE]
Báo cáo tháng 5/2026 cho CEO Bùi Tuấn Huy, công ty 9Biz.
1. Đọc 10 email quan trọng nhất (công việc, khách, lịch — bỏ spam)
2. Xem Google Calendar tháng 5 đếm số cuộc họp
3. Tổng hợp báo cáo tháng: email highlights, số họp, nhận xét
4. Tạo Google Sheet "Báo cáo tháng 5" ghi: mục, số liệu, ghi chú
5. Viết bài Facebook "Tháng 5 của 9Biz" tone chuyên nghiệp, đăng Fanpage
6. Soạn email tóm tắt gửi buituanhuy85@gmail.com tiêu đề "Báo cáo tháng 5/2026"
7. Gửi tóm tắt ngắn vào nhóm Zalo modoro-claw demo
8. Ghi nhớ: đã hoàn thành báo cáo tháng 5/2026
```

---

## Prompt 2: Ra mắt sản phẩm (9 bước)

```
[AUTO-MODE]
Ra mắt sản phẩm mới 9BizClaw Enterprise — phiên bản doanh nghiệp lớn, giá 9.900.000/năm, hỗ trợ multi-user 10 tài khoản, API tích hợp ERP/CRM, SLA 99.9%, hotline 24/7. Dành cho giám đốc công ty 50+ nhân viên.
1. Viết mô tả sản phẩm Enterprise chi tiết 500 từ
2. Viết bài quảng cáo Facebook storytelling về Enterprise, đăng Fanpage
3. Soạn email ra mắt chuyên nghiệp gửi buituanhuy85@gmail.com tiêu đề "Ra mắt 9BizClaw Enterprise"
4. Tạo Google Sheet "Enterprise Launch" ghi: ngày, kênh, nội dung, status
5. Gửi thông báo ra mắt vào nhóm Zalo modoro-claw demo
6. Viết JD tuyển Enterprise Sales Manager + 5 câu hỏi phỏng vấn, gửi nhóm Zalo modoro-claw demo
7. Soạn bài tuyển dụng Enterprise Sales, đăng Facebook
8. Tạo skill: khi khách Zalo hỏi Enterprise thì giới thiệu gói 9.900.000/năm
9. Tạo cron mỗi 3 ngày đăng Facebook bài quảng cáo Enterprise góc nhìn khác nhau
```

---

## Prompt 3: CRM Pipeline (8 bước)

```
[AUTO-MODE]
Quy trình CRM pipeline tự động. Công ty 9Biz, sản phẩm 9BizClaw, giá 2.990.000/năm.
1. Đọc 5 email gần nhất, lọc khách tiềm năng
2. Tạo Google Sheet "CRM Pipeline" cột: Tên, Email, Nhu cầu, Nguồn, Ngày, Trạng thái
3. Ghi khách vào Sheet (nếu không tìm thấy khách thật, dùng 3 khách demo: Nguyễn Văn An — hỏi giá, Trần Thị Bình — muốn xem demo, Lê Hoàng — so sánh đối thủ)
4. Soạn email follow-up tổng hợp gửi buituanhuy85@gmail.com tiêu đề "Follow-up khách tiềm năng tuần này"
5. Gửi danh sách khách mới kèm ghi chú vào nhóm Zalo modoro-claw demo
6. Viết kịch bản telesales 9BizClaw (mở đầu, giới thiệu, xử lý phản đối, chốt), gửi nhóm Zalo modoro-claw demo
7. Đặt lịch hẹn follow-up khách Nguyễn Văn An ngày mai 10h sáng
8. Tạo cron mỗi sáng 8h tự đọc email mới, lọc khách tiềm năng, báo nhóm Zalo modoro-claw demo
```

---

## Prompt 4: Content Calendar (9 bước)

```
[AUTO-MODE]
Tạo content calendar tuần tới cho 9BizClaw — trợ lý AI cho CEO SME Việt Nam, giọng chuyên nghiệp hiện đại.
1. Tìm 5 xu hướng AI và công nghệ hot nhất tuần này trên web
2. Lên kế hoạch 7 bài Facebook (thứ 2 đến chủ nhật), mỗi bài bám 1 xu hướng kết hợp 9BizClaw
3. Tạo Google Sheet "Content Calendar tuần 21" cột: Thứ, Ngày, Tiêu đề, Xu hướng bám, Caption đầy đủ
4. Ghi đầy đủ 7 bài vào Sheet (caption viết sẵn, copy paste được luôn)
5. Lấy bài thứ 2 (ngày mai), đăng lên Facebook Fanpage ngay
6. Gửi kế hoạch content tuần vào nhóm Zalo modoro-claw demo (tóm tắt 7 bài: thứ + tiêu đề)
7. Soạn email gửi buituanhuy85@gmail.com tiêu đề "Content plan tuần 21" kèm tóm tắt
8. Tạo cron mỗi sáng 8h tự đọc Sheet content calendar, lấy bài hôm nay, đăng Facebook, gửi nhóm Zalo modoro-claw demo
9. Ghi nhớ: content calendar tuần 21 đã tạo, cron tự động đăng mỗi sáng 8h
```

---

## Kết quả mong đợi mỗi test

Bot tự chạy hết KHÔNG hỏi "anh confirm không?" — vì có tag `[AUTO-MODE]`.

Check sau mỗi test:
- [ ] Telegram: bot reply tiến trình hoặc DONE
- [ ] Facebook Fanpage: bài mới xuất hiện
- [ ] Zalo nhóm modoro-claw demo: tin nhắn mới
- [ ] Email buituanhuy85@gmail.com: email mới
- [ ] Google Sheet: sheet mới được tạo
- [ ] Cron: Dashboard hiện cron mới

Nếu bot vẫn hỏi confirm → AGENTS.md chưa load bản v102. Restart app 1 lần nữa.
