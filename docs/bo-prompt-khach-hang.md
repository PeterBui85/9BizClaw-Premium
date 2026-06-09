<!--
TRANG BÌA — khi convert sang PDF, đặt khối này thành 1 trang riêng.
Thay [LOGO] bằng file logo MODORO. Căn giữa toàn bộ.
-->

<div align="center">

&nbsp;

&nbsp;

**[ LOGO MODORO ]**

&nbsp;

# BỘ PROMPT 9BIZCLAW

### Thư viện câu lệnh mẫu dành cho các anh chị Premium

&nbsp;

Sao chép · Dán vào Telegram · Bot tự làm

&nbsp;

&nbsp;

&nbsp;

Phát triển bởi MODORO

Hỗ trợ: tech@modoro.com.vn

</div>

<div style="page-break-after: always;"></div>

---

# Bộ Prompt 9BizClaw

### Thư viện câu lệnh mẫu dành cho các anh chị Premium

Tất cả câu lệnh trong tài liệu này đều chạy được thật trên bản 9BizClaw đã cài. Không có tính năng phịa. Anh chị chỉ cần sao chép, dán vào Telegram, thay phần trong ngoặc vuông bằng thông tin của mình.

---

## Cách dùng tài liệu này

1. **Sao chép** một câu lệnh trong khung.
2. **Thay** mọi chỗ `[trong ngoặc vuông]` bằng thông tin thật của anh chị: tên khách, tên nhóm Zalo, sản phẩm, giá, ngày giờ.
3. **Dán vào Telegram** gửi cho bot. Bot tự chọn đúng kỹ năng và làm.

Anh chị không cần nhớ cú pháp, không cần lệnh đặc biệt. Nói tự nhiên cũng được — các câu mẫu chỉ để chạy nhanh và chắc.

### Hai quy ước nên biết

- **Bot luôn xác nhận trước khi gửi ra ngoài.** Mọi việc gửi Zalo cho khách, đăng Facebook, gửi email đều được bot trình nội dung và chờ anh chị duyệt ("ok" / "gửi đi"). Bot không tự ý gửi.
- **Muốn bot chạy một mạch nhiều bước, không hỏi lại từng bước**, thêm `[AUTO-MODE]` vào đầu câu lệnh (xem mục 8). Dùng cho các quy trình dài, đã tin tưởng.

> App phải đang mở thì bot mới làm việc. Thu nhỏ xuống khay hệ thống được, nhưng đừng tắt.

---

## Nguyên tắc quan trọng nhất: dạy một lần, bot nhớ mãi

Một tin nhắn lẻ chỉ có tác dụng cho lần đó — **nói xong là bot quên**. Muốn bot làm đúng mãi về sau, đừng nhắc lại mỗi lần; hãy bảo bot **ghi lại**. Có hai cách ghi, dùng đúng chỗ:

**1. Tạo skill — cho cách bot ĐỐI ĐÁP VỚI KHÁCH (quan trọng nhất với Zalo)**

Khách Zalo nhắn bất kỳ lúc nào, kể cả khi anh chị đang ngủ. Cách trả lời phải nằm sẵn trong một "skill" thì bot mới áp dụng tự động cho mọi khách. Đây là lý do **không thể dạy CSKH bằng tin nhắn thường** — phải tạo skill.

```
Tạo skill: khi khách Zalo hỏi [tình huống], bot trả lời [cách xử lý].
```
Bot sẽ đề xuất sẵn tên + trigger + nội dung, anh chị xem rồi nhắn "ok". Skill có hiệu lực ngay, áp cho mọi khách về sau, không cần bật lại.

**2. Lưu bộ nhớ — cho SỞ THÍCH CỦA ANH CHỊ và SỰ THẬT DOANH NGHIỆP**

Dùng cho thứ phục vụ chính anh chị (không phải lời khách thấy): phong cách báo cáo, thông tin công ty, ghi chú về một khách cụ thể.

```
Nhớ giùm anh: [điều cần nhớ].
```

**Quy tắc chọn nhanh:** điều này KHÁCH sẽ thấy/nghe → **tạo skill**. Điều này chỉ MÌNH ANH CHỊ hoặc bot cần biết → **lưu bộ nhớ**.

---

## 0. Ba việc nên làm đầu tiên

**Nạp tài liệu để bot trả lời khách đúng**
```
Anh vừa tải bảng giá và thông tin sản phẩm lên tab Tài liệu. Em đọc và dùng để trả lời khách Zalo nhé.
```
(Trước đó: vào Dashboard › tab Tài liệu › upload file bảng giá / catalogue dạng PDF, Word hoặc Excel.)

**Thử gửi một tin Zalo**
```
Nhắn Zalo cho [tên người trong danh bạ]: Chào anh/chị, em là trợ lý của shop ạ.
```

**Đặt một lịch tự động đầu tiên**
```
Tạo lịch mỗi sáng 8h gửi nhóm [tên nhóm Zalo]: Chào cả nhà, chúc một ngày bán hàng thật tốt!
```

---

## 1. Chăm sóc khách trên Zalo (CSKH)

Đây là phần quan trọng nhất để dạy bot. Bot trực Zalo 24/7 và tự trả lời khách. Muốn bot trả lời ĐÚNG Ý anh chị mãi về sau, hãy **dạy bằng skill** thay vì nhắc từng lần. Mỗi câu lệnh dưới đây dạy bot một việc và bot nhớ luôn.

### 1A. Dạy bot cách trả lời khách (tạo skill — nhớ mãi)

**Chào khách mới**
```
Tạo skill: khi khách Zalo nhắn lần đầu, chào thân thiện, xưng [cách xưng hô của shop], hỏi khách cần gì để tư vấn.
```

**Báo giá kèm thông điệp riêng của shop**
```
Tạo skill: khi khách Zalo hỏi giá [sản phẩm/nhóm sản phẩm], báo giá rồi nói thêm [ưu đãi / điểm mạnh, ví dụ: đang có khuyến mãi tặng kèm].
```

**Trả lời chính sách cố định (bảo hành, đổi trả, giao hàng)**
```
Tạo skill: khi khách Zalo hỏi về [bảo hành / đổi trả / phí giao hàng], trả lời đúng chính sách: [nêu chính sách của anh chị].
```

**Xử lý phàn nàn theo cách của shop**
```
Tạo skill: khi khách Zalo phàn nàn về [tình huống, ví dụ: giao chậm], xin lỗi, [hướng xử lý của shop], rồi báo anh nếu khách vẫn chưa hài lòng.
```

**Khi nào im lặng nhường lại cho anh chị**
```
Tạo skill: khi khách Zalo hỏi [chủ đề nhạy cảm, ví dụ: ép giá quá sâu / khiếu nại lớn], bot không tự quyết, trả lời "để em báo anh/chị" và báo anh trên Telegram.
```

**Câu hỏi hay gặp (FAQ) của ngành/shop**
```
Tạo skill: khi khách Zalo hỏi [câu hỏi hay gặp], trả lời [câu trả lời chuẩn]. (Lặp lại cho từng câu hỏi anh chị muốn dạy.)
```

> Sau mỗi câu, bot trình bản đề xuất (tên, trigger, nội dung). Anh chị nhắn "ok" là xong; muốn sửa thì nói chỗ cần sửa. Skill áp dụng ngay cho mọi khách.

### 1B. Ghi nhớ từng khách (bộ nhớ)

**Lưu thông tin một khách**
```
Nhớ giùm anh: khách [tên khách] thích [sở thích / nhu cầu], ngân sách khoảng [số tiền], hay mua [mặt hàng].
```

**Tra lại một khách**
```
Khách [tên khách] trước giờ đã hỏi và mua những gì?
```

### 1C. Theo dõi và tổng hợp (hỏi nhanh khi cần)

**Khách nào đang chờ mình**
```
Khách Zalo nào chưa được trả lời?
```

**Khách im lặng cần follow-up**
```
Liệt kê khách Zalo chưa phản hồi quá 2 ngày để anh follow-up.
```

**Soạn tin nhắc khéo một khách**
```
Soạn giúp anh một tin nhắn Zalo nhắc nhẹ khách [tên khách] đã hỏi giá [sản phẩm] hôm trước mà chưa chốt. Giọng thân thiện, không hối thúc.
```

**Tổng hợp khách Zalo ra Google Sheet (CRM)**
```
Tổng hợp tất cả khách Zalo trong tuần này ra một Google Sheet: tên, nội dung quan tâm, ngày nhắn, trạng thái.
```

> Trong nhóm Zalo, anh chị chọn được 3 chế độ trả lời (chỉ khi được nhắc tên / trả lời mọi tin / im lặng) trong Dashboard › Zalo.

---

## 2. Bán hàng (Sale)

**Dạy bot chính sách giá và chiết khấu (nhớ mãi)**
```
Tạo skill: mỗi khi báo giá hoặc soạn báo giá, áp đúng chính sách chiết khấu của shop: [ví dụ: mua từ 10 sản phẩm giảm 5%, từ 50 sản phẩm giảm 10%, khách cũ giảm thêm 2%].
```

**Soạn báo giá và xuất file Word**
```
Soạn báo giá cho khách [tên khách]: [số lượng] [sản phẩm] đơn giá [giá], áp dụng chiết khấu [nếu có]. Xuất file Word giúp anh.
```

**Kịch bản bán hàng theo sản phẩm**
```
Viết kịch bản bán hàng cho [sản phẩm/dịch vụ]: mở đầu, giới thiệu giá trị, cách xử lý khi khách chê đắt, và câu chốt đơn.
```

**Xử lý lời từ chối cụ thể**
```
Khách nói "[lời từ chối, ví dụ: để anh suy nghĩ thêm]". Em gợi ý 3 cách phản hồi để giữ cơ hội chốt.
```

**Kịch bản telesales gọi khách tiềm năng**
```
Viết kịch bản gọi điện tư vấn [sản phẩm/dịch vụ] cho khách mới: lời mở đầu trong 15 giây, 3 câu hỏi tìm nhu cầu, và cách đặt lịch gặp.
```

**Đặt lịch hẹn với khách (có nhắc trước giờ)**
```
Đặt lịch hẹn khách [tên khách] vào [ngày] lúc [giờ], nội dung [nội dung gặp]. Nhắc anh trước giờ hẹn.
```

> Bot không tự gọi điện cho khách. Bot soạn kịch bản, ghi lịch hẹn và nhắc anh chị gọi.

---

## 3. Marketing và nội dung

**Dạy bot giọng thương hiệu (nhớ mãi)**
```
Nhớ giùm anh: giọng thương hiệu của shop là [ví dụ: thân thiện, gần gũi]; luôn xưng "[cách xưng hô]"; tránh [điều cần tránh]. Áp dụng cho mọi bài viết và caption về sau.
```

**Viết bài bán hàng (nhiều phiên bản để chọn)**
```
Viết 3 phiên bản bài bán hàng cho [sản phẩm/chương trình khuyến mãi], giọng người thật, có hook mạnh ở câu đầu, để anh chọn đăng Zalo/Facebook.
```

**Tạo ảnh quảng cáo có chữ tiếng Việt**
```
Tạo một ảnh poster quảng cáo [nội dung khuyến mãi], tông màu [màu], có dòng chữ tiếng Việt "[câu khẩu hiệu]". Gửi anh xem trước.
```

**Tạo ảnh rồi gửi thẳng nhóm Zalo**
```
Tạo một ảnh chào buổi sáng đẹp, ấm áp, có chữ "[lời chào]", rồi gửi kèm lời chào đó vào nhóm Zalo [tên nhóm].
```

**Đăng Facebook Fanpage (bot chờ duyệt rồi mới đăng)**
```
Soạn bài Facebook cho [nội dung, ví dụ: khai trương chi nhánh mới / sản phẩm mới], có lời kêu gọi inbox tư vấn. Cho anh xem trước rồi đăng lên Fanpage.
```

**Tạo ảnh kèm bài rồi đăng Facebook**
```
Tạo ảnh banner [chủ đề, ví dụ: ưu đãi cuối tuần] rồi đăng lên Facebook Fanpage kèm caption "[nội dung caption]". Gửi anh xem trước khi đăng.
```

**Lên chiến dịch nhiều bài Facebook theo lịch**
```
Lên chiến dịch [số] bài Facebook trong [số] ngày tới về [chủ đề]. Trình cho anh duyệt cả kế hoạch một lần, rồi tự lên lịch đăng.
```

**Lên lịch nội dung cả tuần ra Google Sheet**
```
Lên kế hoạch 7 bài đăng (thứ 2 đến chủ nhật) cho [lĩnh vực kinh doanh], mỗi ngày một chủ đề. Ghi đầy đủ caption vào một Google Sheet để anh copy dùng dần.
```

**Đọc chỉ số Fanpage**
```
Tuần này Fanpage chạy thế nào? Lượt tiếp cận, tương tác, bài nào tốt nhất?
```

> Việc đăng Facebook phụ thuộc quyền của trang anh chị đã kết nối. Đăng Zalo nhóm cần Zalo đang đăng nhập trong app.

---

## 4. Vận hành hằng ngày

**Ghi sổ thu chi**
```
Ghi thu: [tên khách / nguồn] thanh toán [số tiền] cho [đơn / lý do].
```
```
Ghi chi: [lý do, ví dụ: nhập hàng] [số tiền].
```
```
Thu chi tuần này thế nào?
```

**Tạo tài liệu xuất ra file (Word / Excel / PowerPoint / PDF)**
```
Tạo file Excel theo dõi [nội dung, ví dụ: chi phí marketing] với các cột: [liệt kê cột].
```
```
Tạo slide giới thiệu công ty [tên công ty] khoảng [số] trang, có phần sản phẩm và liên hệ.
```

**Tuyển dụng nhanh**
```
Tạo mô tả công việc tuyển [vị trí], kèm bài đăng tuyển cho nhóm Facebook và 5 câu hỏi phỏng vấn.
```

---

## 5. Google Workspace

**Email (cần kết nối Google trước)**
```
Đọc giúp anh các email quan trọng mới nhất, bỏ qua spam.
```
```
Soạn email gửi [địa chỉ email], tiêu đề "[tiêu đề]", nội dung: [nội dung]. Cho anh xem trước khi gửi.
```

**Lịch (Google Calendar)**
```
Tuần này anh có những lịch gì?
```
```
Tạo sự kiện [ngày] lúc [giờ]: [nội dung cuộc hẹn].
```

**Google Sheet**
```
Đọc Sheet này rồi tóm tắt giúp anh: [dán link Google Sheet]
```
```
Thêm một dòng vào Sheet [tên sheet]: [các giá trị theo cột].
```

**Drive**
```
Tìm trên Drive file [từ khóa tên file].
```

---

## 6. Tự động hóa bằng lịch (Cron)

Đây là sức mạnh lớn nhất: đặt một lần, bot tự chạy mỗi ngày.

**Tin cố định gửi định kỳ**
```
Tạo lịch mỗi sáng 9h gửi nhóm Zalo [tên nhóm]: [nội dung tin].
```

**Bot tự tạo nội dung mới mỗi lần chạy**
```
Tạo lịch mỗi sáng 8h tự tóm tắt tin tức ngành [ngành của anh chị] rồi gửi nhóm [tên nhóm].
```
```
Tạo lịch mỗi sáng tự tạo một ảnh chào ngày mới rồi gửi nhóm [tên nhóm].
```

**Nhắc việc nội bộ**
```
Tạo lịch mỗi thứ 2 lúc 8h nhắc nhóm [tên nhóm nhân viên]: Nhớ nộp báo cáo tuần.
```

**Quản lý các lịch đã đặt**
```
Liệt kê tất cả lịch tự động đang chạy.
```
```
Tắt lịch [tên/mô tả lịch].
```
```
Xóa lịch [tên/mô tả lịch].
```
```
Chạy thử ngay lịch [tên/mô tả lịch].
```

---

## 7. Quản lý những gì đã dạy bot

Sau khi dạy (mục 1, 2, 3), anh chị xem lại, sửa hoặc gỡ bất cứ lúc nào. Bot có thể giữ tới 100 skill.

**Xem danh sách skill đã tạo**
```
Liệt kê tất cả kỹ năng (skill) đang có.
```

**Sửa một skill**
```
Sửa skill [tên skill]: đổi nội dung thành [nội dung mới].
```

**Tạm tắt / bật lại một skill**
```
Tạm tắt skill [tên skill].
```
```
Bật lại skill [tên skill].
```

**Xóa một skill (vẫn khôi phục được)**
```
Xóa skill [tên skill].
```
```
Khôi phục skill [tên skill] anh vừa xóa.
```

**Xem bot đang nhớ gì về một chủ đề**
```
Em đang nhớ gì về [chủ đề / khách / chính sách]?
```

> Mẹo: trước khi tạo skill mới cho một tình huống, hỏi "đã có skill nào cho [tình huống] chưa?" để tránh tạo trùng.

---

## 8. Quy trình nhiều bước chạy một mạch (AUTO-MODE)

Thêm `[AUTO-MODE]` vào đầu để bot làm hết các bước, không dừng hỏi từng bước. Dùng cho quy trình anh chị đã tin tưởng.

**Gói ra mắt sản phẩm mới**
```
[AUTO-MODE]
Ra mắt sản phẩm mới: [tên sản phẩm], giá [giá], dành cho [đối tượng khách].
1. Viết mô tả sản phẩm hấp dẫn
2. Soạn bài quảng cáo Facebook và đăng Fanpage
3. Tạo Google Sheet theo dõi chiến dịch ra mắt
4. Gửi thông báo ra mắt vào nhóm Zalo [tên nhóm]
5. Tạo kỹ năng: khi khách hỏi về [tên sản phẩm] thì báo giá [giá] và nêu điểm nổi bật
```

**Gói chăm sóc khách tiềm năng**
```
[AUTO-MODE]
Quy trình chăm khách tiềm năng:
1. Đọc các email mới, lọc ra khách có nhu cầu
2. Tạo Google Sheet "Khách tiềm năng" cột: Tên, Liên hệ, Nhu cầu, Ngày, Trạng thái
3. Ghi khách vào Sheet
4. Soạn email follow-up tổng hợp gửi [email của anh chị]
5. Gửi danh sách khách mới vào nhóm Zalo [tên nhóm]
```

> Ngay cả ở chế độ AUTO-MODE, bot vẫn báo lại tiến trình và kết quả. Nếu một bước lỗi, bot dừng và nói rõ.

---

## 9. Những việc bot CHƯA làm được

Nói thật để anh chị không kỳ vọng sai:

- **Không tự gọi điện thoại cho khách.** Bot soạn kịch bản và nhắc lịch, anh chị gọi.
- **Không phải phần mềm kế toán hay CRM đầy đủ.** Bot ghi chép gọn và xuất Google Sheet, không thay sổ sách chuyên sâu.
- **Zalo và Facebook chạy trong giới hạn nền tảng.** Zalo cần đăng nhập trong app; Facebook theo quyền của trang đã kết nối.
- **Không tự cập nhật hay cài đặt phiên bản mới** — phần đó do đội MODORO thực hiện.
- **Chỉ làm trong phạm vi anh chị đã cấp.** Việc ngoài phạm vi, bot báo lại chứ không tự làm liều.
- **Skill theo từng ngành** (bất động sản, F&B, spa, giáo dục...) không có sẵn trong bản chuẩn — đội MODORO tặng riêng theo ngành của anh chị khi cần.

---

## Mẹo dùng hiệu quả

- **Dạy một lần, đừng nhắc lại từng lần.** Việc gì muốn bot làm đúng mãi — nhất là cách trả lời khách Zalo — hãy bảo bot tạo skill hoặc nhớ giùm. Tin nhắn lẻ sẽ trôi đi.
- **Càng cụ thể, kết quả càng đúng.** Ghi rõ tên khách, tên nhóm, sản phẩm, giá, ngày giờ.
- **Đặt lịch tự động cho việc lặp lại.** Chào nhóm buổi sáng, tin khuyến mãi định kỳ, theo dõi khách — đặt một lần, dùng mãi.
- **Nạp đủ tài liệu sản phẩm** thì bot trả lời khách Zalo càng chuẩn.
- **Tin tưởng dần rồi mới dùng AUTO-MODE** cho các quy trình dài.

---

*9BizClaw — Trợ lý AI cho chủ doanh nghiệp Việt. Phát triển bởi MODORO, dành riêng cho các anh chị Premium.*

*Hỗ trợ: tech@modoro.com.vn · Nhóm hỗ trợ trong app (Dashboard › menu hỗ trợ › Liên hệ 9Biz)*
