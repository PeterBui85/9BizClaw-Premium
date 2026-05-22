# Test Prompts — AUTO-MODE

> Copy từng prompt, paste vào Telegram gửi cho bot. Bot phải tự chạy hết không hỏi confirm.
> Sau mỗi test, check: Facebook Fanpage, nhóm Zalo modoro-claw demo, email, Google Sheet, Dashboard cron.
>
> **Thời gian:** Tất cả cron/lịch hẹn đặt GẦN (5-15 phút) để verify ngay trong session test.
> Trước khi test, ghi lại giờ hiện tại để tính thời gian cron fire.

---

## Prompt 1: Báo cáo tuần (8 bước)

```
[AUTO-MODE]
Báo cáo tuần này cho CEO Bùi Tuấn Huy, công ty 9Biz.
1. Đọc 10 email quan trọng nhất tuần này (công việc, khách, lịch — bỏ spam)
2. Xem Google Calendar tuần này đếm số cuộc họp
3. Tổng hợp báo cáo tuần: email highlights, số họp, nhận xét
4. Tạo Google Sheet "Báo cáo tuần" ghi: mục, số liệu, ghi chú
5. Viết bài Facebook "Tuần này của 9Biz" tone chuyên nghiệp, đăng Fanpage
6. Soạn email tóm tắt gửi buituanhuy85@gmail.com tiêu đề "Báo cáo tuần"
7. Gửi tóm tắt ngắn vào nhóm Zalo modoro-claw demo
8. Ghi nhớ: đã hoàn thành báo cáo tuần
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
9. Tạo cron mỗi 15 phút gửi nhóm Zalo modoro-claw demo 1 góc nhìn mới về Enterprise (XÓA sau khi verify 1 lần fire)
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
7. Đặt lịch hẹn follow-up khách Nguyễn Văn An hôm nay lúc 4 giờ chiều
8. Tạo cron mỗi 10 phút tự đọc email mới, lọc khách tiềm năng, báo nhóm Zalo modoro-claw demo (XÓA sau khi verify 1 lần fire)
```

---

## Prompt 4: Content Calendar (9 bước)

```
[AUTO-MODE]
Tạo content calendar tuần này cho 9BizClaw — trợ lý AI cho CEO SME Việt Nam, giọng chuyên nghiệp hiện đại.
1. Tìm 5 xu hướng AI và công nghệ hot nhất tuần này trên web
2. Lên kế hoạch 7 bài Facebook (thứ 2 đến chủ nhật), mỗi bài bám 1 xu hướng kết hợp 9BizClaw
3. Tạo Google Sheet "Content Calendar" cột: Thứ, Ngày, Tiêu đề, Xu hướng bám, Caption đầy đủ
4. Ghi đầy đủ 7 bài vào Sheet (caption viết sẵn, copy paste được luôn)
5. Lấy bài hôm nay, đăng lên Facebook Fanpage ngay
6. Gửi kế hoạch content tuần vào nhóm Zalo modoro-claw demo (tóm tắt 7 bài: thứ + tiêu đề)
7. Soạn email gửi buituanhuy85@gmail.com tiêu đề "Content plan tuần này" kèm tóm tắt
8. Tạo cron mỗi 10 phút tự đăng 1 bài Facebook từ Sheet content calendar và gửi nhóm Zalo modoro-claw demo (XÓA sau khi verify 1 lần fire)
9. Ghi nhớ: content calendar đã tạo, cron tự động đăng đã set
```

---

## Prompt 5: Tạo ảnh + gửi Zalo nhóm (6 bước) — TARGET: image + Zalo delivery

```
[AUTO-MODE]
Chiến dịch ảnh cho nhóm Zalo.
1. Tạo 1 ảnh poster động lực, tone ấm, có chữ tiếng Việt "Ngày mới, Thành công mới"
2. Gửi ảnh VÀ caption "Chào cả nhà! Ngày mới tràn đầy năng lượng nha" vào nhóm Zalo modoro-claw demo — ảnh và chữ cùng 1 tin nhắn
3. Tạo thêm 1 ảnh banner quảng cáo 9BizClaw ngang 1792x1024, tone xanh dương chuyên nghiệp
4. Gửi ảnh banner kèm caption "9BizClaw — Trợ lý AI cho CEO thông minh" vào nhóm Zalo modoro-claw demo
5. Tạo cron mỗi 10 phút tạo ảnh động lực mới và gửi vào nhóm Zalo modoro-claw demo (XÓA sau khi verify 1 lần fire)
6. Ghi nhớ: đã setup cron ảnh động lực cho nhóm demo
```

**Check:**
- [ ] Nhóm Zalo: 2 ảnh mới, mỗi ảnh kèm caption trong CÙNG 1 tin nhắn (không tách text riêng ảnh riêng)
- [ ] Ảnh 1: poster đứng 1024x1024, có chữ tiếng Việt có dấu
- [ ] Ảnh 2: banner ngang 1792x1024
- [ ] Cron: Dashboard hiện cron agent mode, fire trong 10 phút
- [ ] Bot KHÔNG nói "asset not public", "media path outside", hay gửi đường dẫn file dưới dạng text

---

## Prompt 6: Ảnh Facebook + preview + đăng (5 bước) — TARGET: FB image workflow end-to-end

```
[AUTO-MODE]
Đăng bài Facebook quảng cáo 9BizClaw ngay bây giờ.
1. Kiểm tra kết nối Fanpage
2. Tạo ảnh poster vuông 9BizClaw, phong cách minimalist, có chữ "AI cho CEO"
3. Gửi preview ảnh qua Telegram cho tôi xem
4. Đăng lên Fanpage với caption: "9BizClaw — Trợ lý AI giúp CEO Việt Nam quản lý doanh nghiệp thông minh hơn mỗi ngày. Inbox để tư vấn miễn phí."
5. Ghi nhớ: đã đăng bài quảng cáo 9BizClaw hôm nay
```

**Check:**
- [ ] Telegram: nhận preview ảnh trước khi đăng
- [ ] Facebook Fanpage: bài mới với ảnh + caption
- [ ] Bot dùng đúng flow: generate → send-photo → fb/post?preview=true → fb/post?approvalNonce
- [ ] Bot KHÔNG bỏ qua bước preview, KHÔNG gửi ảnh vào Zalo

---

## Prompt 7: Gửi Zalo text + ảnh có sẵn (4 bước) — TARGET: send-media với mediaId

```
[AUTO-MODE]
Tạo nội dung và ảnh giới thiệu sản phẩm mới, gửi cho nhóm Zalo modoro-claw demo.
1. Viết 1 đoạn giới thiệu sản phẩm 9BizClaw Premium, 200 ký tự, giọng chuyên nghiệp
2. Tạo 1 ảnh poster 9BizClaw Premium phong cách sang trọng, tone vàng đen
3. Gửi ảnh vừa tạo kèm đoạn giới thiệu vào nhóm Zalo modoro-claw demo — chữ và ảnh CÙNG 1 tin nhắn
4. Gửi thêm 1 tin nhắn text riêng "Inbox để nhận báo giá chi tiết ạ" vào cùng nhóm
```

**Check:**
- [ ] Nhóm Zalo: tin 1 = ảnh + caption chung 1 msg, tin 2 = text riêng
- [ ] Bot dùng atomic endpoint hoặc generate → poll status → send-media?mediaId=...&allowInternalGenerated=true&caption=...
- [ ] Bot KHÔNG gửi imagePath/mediaPath, KHÔNG gửi đường dẫn file

---

## Prompt 8: Skill builder + cron phức tạp (6 bước) — TARGET: user-skills + cron agent

```
[AUTO-MODE]
Setup tự động hóa chăm sóc khách Zalo mới.
1. Tạo skill: khi khách Zalo mới nhắn lần đầu, chào hỏi thân thiện và hỏi nhu cầu
2. Tạo skill: khi khách hỏi giá 9BizClaw, báo 2.990.000/năm và liệt kê 3 tính năng nổi bật
3. Liệt kê tất cả skill đang có để verify 2 skill vừa tạo
4. Tạo cron mỗi 10 phút gửi nhóm Zalo modoro-claw demo tóm tắt hoạt động hôm nay (XÓA sau khi verify 1 lần fire)
5. Tạo cron một lần lúc [GIỜ HIỆN TẠI + 5 PHÚT] gửi nhóm Zalo modoro-claw demo "Test cron one-time!"
6. Liệt kê cron để verify
```

**Check:**
- [ ] User skills: 2 skill mới hiện trong list
- [ ] Cron: 1 recurring (mỗi 10 phút) + 1 one-time (5 phút nữa) hiện trong Dashboard
- [ ] One-time cron fire đúng giờ → nhóm Zalo nhận "Test cron one-time!"
- [ ] Recurring cron fire trong 10 phút → nhóm Zalo nhận tóm tắt
- [ ] Bot verify bằng list sau mỗi tạo, KHÔNG nói "đã tạo" mà không check

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
