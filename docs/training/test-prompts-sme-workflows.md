# Test Prompts — Vietnamese SME CEO Workflows

> Realistic daily workflows based on research into Vietnamese SME pain points.
> Each prompt simulates what a real CEO of a 5-50 person company would ask their AI assistant.
> Test: paste into Telegram, verify bot completes without asking confirm (AUTO-MODE) or handles gracefully (interactive).

---

## Prompt 1: Morning Inbox Triage (Interactive — most common daily task)

```
Sáng rồi, check giúp anh:
1. Có email nào quan trọng không?
2. Lịch hôm nay có gì?
3. Tóm tắt ngắn gọn cho anh
```

**Check:**
- [ ] Bot đọc Gmail, lọc spam, tóm tắt email quan trọng
- [ ] Bot đọc Calendar, liệt kê cuộc họp hôm nay
- [ ] Trả lời gọn trong 1 tin, không hỏi thêm
- [ ] Tiếng Việt có dấu, không emoji

---

## Prompt 2: Công nợ khách hàng — nhắc thanh toán (Interactive)

```
Soạn giúp anh tin nhắn nhắc thanh toán cho khách Nguyễn Văn An, công nợ 45 triệu, quá hạn 15 ngày. Giọng lịch sự nhưng chắc chắn. Gửi qua Zalo cho khách đó.
```

**Check:**
- [ ] Bot soạn tin nhắn nhắc nợ tiếng Việt, tone chuyên nghiệp
- [ ] Hỏi confirm trước khi gửi Zalo (vì không phải AUTO-MODE)
- [ ] Sau khi CEO "ok" → gửi Zalo thật
- [ ] Không lộ thông tin nội bộ (số tiền chính xác OK vì gửi cho đúng khách)

---

## Prompt 3: Content Marketing — tuần (AUTO-MODE, 6 bước)

```
[AUTO-MODE]
Lên content Facebook tuần này cho công ty mình.
1. Tìm 3 xu hướng đang hot trên mạng liên quan đến ngành mình
2. Viết 3 bài Facebook, mỗi bài bám 1 xu hướng, có hashtag
3. Tạo Google Sheet "Content tuần" ghi: ngày đăng, tiêu đề, caption, trạng thái
4. Đăng bài đầu tiên lên Fanpage ngay
5. Gửi kế hoạch 3 bài vào nhóm Zalo modoro-claw demo
6. Ghi nhớ: đã lên content tuần này
```

**Check:**
- [ ] Bot tìm xu hướng bằng web_search
- [ ] 3 bài Facebook có hashtag, tone phù hợp brand
- [ ] Google Sheet được tạo với đủ cột
- [ ] Bài 1 đăng lên Fanpage (hoặc báo lỗi FB nếu chưa kết nối)
- [ ] Nhóm Zalo nhận kế hoạch
- [ ] Không hỏi confirm (AUTO-MODE)

---

## Prompt 4: Báo cáo doanh thu ngày (Interactive)

```
Hôm qua bán được gì? Tổng hợp từ email và ghi chú cho anh. Nếu không có dữ liệu thật thì dùng demo: 15 đơn Shopee tổng 12.5 triệu, 8 đơn Facebook tổng 6.8 triệu, 3 đơn Zalo tổng 4.2 triệu.
```

**Check:**
- [ ] Bot thử đọc email/data thật trước
- [ ] Nếu không có → dùng data demo như yêu cầu
- [ ] Trả lời format bảng gọn: kênh, số đơn, doanh thu, tổng
- [ ] Có nhận xét ngắn (kênh nào mạnh nhất)

---

## Prompt 5: Xử lý khiếu nại khách hàng (Interactive)

```
Khách tên Trần Thị Bình nhắn Zalo nói hàng bị lỗi, muốn đổi. Soạn giúp anh tin nhắn xin lỗi và hẹn đổi hàng trong 3 ngày. Gửi cho khách đó qua Zalo.
```

**Check:**
- [ ] Bot soạn tin xin lỗi chuyên nghiệp, hẹn đổi hàng 3 ngày
- [ ] Hỏi CEO confirm nội dung + người nhận trước khi gửi
- [ ] Gửi Zalo sau khi CEO ok
- [ ] Không gửi nhầm nhóm, gửi đúng cá nhân

---

## Prompt 6: HR — Tổng hợp nghỉ phép tháng (AUTO-MODE, 5 bước)

```
[AUTO-MODE]
Tổng hợp nhân sự tháng này.
1. Đọc email tìm đơn xin nghỉ phép trong tháng
2. Tạo Google Sheet "Nghỉ phép tháng 5" cột: Tên, Ngày nghỉ, Lý do, Trạng thái
3. Ghi dữ liệu vào Sheet (nếu không có thật, dùng demo: 3 nhân viên, mỗi người nghỉ 1-2 ngày)
4. Gửi tóm tắt vào nhóm Zalo modoro-claw demo
5. Ghi nhớ: đã tổng hợp nghỉ phép tháng 5
```

**Check:**
- [ ] Bot đọc email tìm "xin nghỉ", "nghỉ phép"
- [ ] Sheet được tạo đúng format
- [ ] Demo data hợp lý nếu không có thật
- [ ] Zalo nhóm nhận tóm tắt
- [ ] Không hỏi confirm

---

## Prompt 7: Gửi báo giá cho khách (Interactive)

```
Khách Lê Hoàng hỏi báo giá sản phẩm. Soạn báo giá gồm 3 gói: Basic 990k/tháng, Pro 2.990k/năm, Enterprise 9.900k/năm. Liệt kê tính năng mỗi gói. Gửi qua Zalo cho khách.
```

**Check:**
- [ ] Bot soạn báo giá 3 gói, format đẹp
- [ ] Giá đúng, có đơn vị (VND/tháng, VND/năm)
- [ ] Hỏi confirm trước khi gửi
- [ ] Gửi Zalo đúng người

---

## Prompt 8: Đặt hàng nhà cung cấp (Interactive)

```
Nhắn cho nhà cung cấp Minh Phát (Zalo) hỏi giá mới nhất 100 thùng sản phẩm A, giao trong tuần này. Nếu giá dưới 500k/thùng thì xác nhận đặt luôn, trên 500k thì hỏi lại anh.
```

**Check:**
- [ ] Bot soạn tin nhắn hỏi giá chuyên nghiệp
- [ ] Hỏi confirm trước khi gửi (vì không AUTO-MODE)
- [ ] Logic điều kiện giá: dưới 500k auto, trên 500k hỏi lại CEO
- [ ] Ghi nhớ context cho follow-up

---

## Prompt 9: Tuyển dụng — đăng tin + soạn JD (AUTO-MODE, 5 bước)

```
[AUTO-MODE]
Đang cần tuyển 1 nhân viên bán hàng online, lương 8-12 triệu, làm việc tại Quận 1, HCM.
1. Viết JD tuyển dụng ngắn gọn, có yêu cầu và quyền lợi
2. Đăng bài tuyển dụng lên Facebook Fanpage
3. Soạn email gửi buituanhuy85@gmail.com tiêu đề "JD Nhân viên bán hàng" kèm JD đầy đủ
4. Gửi JD vào nhóm Zalo modoro-claw demo nhờ share
5. Ghi nhớ: đang tuyển nhân viên bán hàng
```

**Check:**
- [ ] JD có: vị trí, mô tả, yêu cầu, quyền lợi, lương, địa điểm
- [ ] Facebook đăng OK (hoặc báo lỗi nếu chưa kết nối)
- [ ] Email gửi OK
- [ ] Zalo nhóm nhận JD
- [ ] Không hỏi confirm

---

## Prompt 10: Cuối ngày — tóm tắt + kế hoạch ngày mai (Interactive)

```
Tóm tắt những gì đã xảy ra hôm nay cho anh: email quan trọng, tin Zalo, cuộc họp. Rồi gợi ý 3 việc cần ưu tiên ngày mai.
```

**Check:**
- [ ] Bot đọc email, calendar, conversation history
- [ ] Tóm tắt theo mục: email, Zalo, họp
- [ ] 3 gợi ý ngày mai cụ thể, actionable
- [ ] Giọng ngắn gọn, không kéo dài

---

## Scoring

Mỗi prompt test 4 tiêu chí:
- **Hoàn thành** (0-3): bot làm xong bao nhiêu bước?
- **Chính xác** (0-3): nội dung đúng, không hallucinate?
- **Tuân thủ** (0-3): AUTO-MODE không hỏi / Interactive có confirm?
- **Chất lượng** (0-3): tiếng Việt chuẩn, tone phù hợp, format đẹp?

Tổng: /120 điểm (10 prompts × 12 điểm)
