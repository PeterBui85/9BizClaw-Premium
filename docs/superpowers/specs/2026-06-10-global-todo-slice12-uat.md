# Việc cần làm (Global To-Do) — Slice 1+2 User Acceptance Test

Date: 2026-06-10 · Branch: feat/global-todo-slice12
Spec: 2026-06-10-global-todo-design.md · Plan: 2026-06-10-global-todo-slice12.md

**Người nghiệm thu (acceptor):** CEO (anh Huy).
**Mục đích:** Xác nhận tính năng "Việc cần làm" (giai đoạn 1+2) chạy đúng như CEO mong đợi TRÊN APP THẬT, trước khi merge/ship.

Mỗi mục: làm theo các bước → so với "Kết quả mong đợi" → tick **Đạt** / **Chưa đạt** (ghi chú nếu chưa đạt).

---

## Phạm vi của lần nghiệm thu này (đọc trước khi test)

**CÓ trong Slice 1+2 (phải test):**
- Một danh sách việc chung, xem & quản lý trên **Dashboard** VÀ qua **Telegram**.
- CEO **tự thêm** việc; đánh dấu **Xong / Hoãn / Bỏ**.
- Việc **hệ thống tự xuất hiện**: cron lỗi, Zalo mất kết nối >5 phút (và **tự đóng** khi Zalo trở lại), license sắp hết hạn.
- Câu **tóm tắt** ở đầu trang = **đếm số việc** (vd "Có 5 việc cần làm, trong đó 3 việc hệ thống cần anh xem").
- Việc còn nguyên sau khi tắt/mở lại app; được sao lưu (backup).

**KHÔNG có trong Slice 1+2 (ĐỪNG test, sẽ làm ở giai đoạn sau — đánh "chưa đạt" ở đây là sai):**
- ❌ AI tự **xếp hạng độ ưu tiên** (Cao/Trung/Thấp) + giải thích lý do → Slice 4.
- ❌ Bot tự **đọc chat khách Zalo/FB** để tự sinh việc (vd "chị Lan hỏi giá chưa trả lời") → Slice 3.
- ❌ Bot tự **soạn sẵn tin cho khách** để CEO duyệt 1 chạm → Slice 4.
- ❌ Bot tự **đánh dấu xong** khi đoán việc đã xử lý (trừ 1 trường hợp DUY NHẤT: Zalo trở lại thì tự đóng việc "Zalo mất kết nối").

Ở giai đoạn này, câu tóm tắt chỉ ĐẾM việc — chưa "rọi sáng việc quan trọng nhất". Đó là đúng thiết kế, không phải lỗi.

---

## Chuẩn bị (preconditions)

- [ ] App 9BizClaw mở được, vào được Dashboard.
- [ ] Bot Telegram của CEO đang chạy (để test phần chat). **Lưu ý:** các bước Telegram là test TRÊN BOT THẬT — chỉ CEO tự làm trên máy mình, không ai khác chạy hộ.
- [ ] Biết vị trí file sao lưu (để kiểm tra mục G).

---

## A. Dashboard — xem danh sách

**A1 — Mở trang Việc cần làm**
- Bước: Mở Dashboard → bấm mục **"Việc cần làm"** trên thanh điều hướng.
- Kết quả mong đợi: Trang mở ra, có tiêu đề "Việc cần làm", một dòng tóm tắt, ô "Thêm việc mới...", và danh sách việc (hoặc dòng "Chưa có việc nào" nếu trống).
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**A2 — Câu tóm tắt đếm đúng số việc**
- Bước: Đếm số việc đang hiển thị, so với câu tóm tắt ở đầu.
- Kết quả mong đợi: Câu tóm tắt nói đúng tổng số việc; nếu có việc hệ thống thì nói thêm "trong đó N việc hệ thống cần anh xem". Tiếng Việt có dấu, **không có emoji**.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**A3 — Mỗi việc hiển thị đủ thông tin**
- Bước: Nhìn một thẻ việc bất kỳ.
- Kết quả mong đợi: Thấy tiêu đề việc, mô tả (nếu có), nhãn nguồn (Tự nhập / CEO / Hệ thống / Zalo / FB), và 3 nút **Xong / Hoãn / Bỏ**.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

## B. Dashboard — thêm & cập nhật việc

**B1 — Thêm việc tay**
- Bước: Gõ "Gọi nhà cung cấp bao bì" vào ô "Thêm việc mới..." → bấm **Thêm** (hoặc Enter).
- Kết quả mong đợi: Việc xuất hiện ngay trong danh sách, nhãn nguồn "Tự nhập", ô nhập trống lại.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**B2 — Thêm việc rỗng bị chặn**
- Bước: Để ô trống (hoặc chỉ dấu cách) → bấm **Thêm**.
- Kết quả mong đợi: Không tạo việc nào; không báo lỗi đỏ khó chịu.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**B3 — Đánh dấu Xong**
- Bước: Bấm **Xong** trên việc vừa thêm ở B1.
- Kết quả mong đợi: Có thông báo nhỏ "Đã cập nhật"; việc **biến mất** khỏi danh sách đang mở.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**B4 — Hoãn và Bỏ**
- Bước: Thêm 2 việc test. Bấm **Hoãn** việc 1, **Bỏ** việc 2.
- Kết quả mong đợi: Cả hai biến mất khỏi danh sách đang mở (việc hoãn/bỏ không còn nằm trong "đang cần làm").
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**B5 — Danh sách trống hiển thị đúng**
- Bước: Đóng/Xong hết mọi việc đang mở.
- Kết quả mong đợi: Danh sách hiện "Chưa có việc nào"; câu tóm tắt nói "Hiện chưa có việc nào cần làm."
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

## C. Telegram — hỏi & quản lý bằng chat (chat-first)

**C1 — Hỏi việc hôm nay**
- Bước: Nhắn bot trên Telegram: **"việc hôm nay?"** (hoặc "còn việc gì cần làm").
- Kết quả mong đợi: Bot trả về câu tóm tắt + vài việc đang mở. Tiếng Việt có dấu, không emoji.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**C2 — Thêm việc qua chat**
- Bước: Nhắn bot: **"thêm việc: đặt hoa khai trương thứ 7"**.
- Kết quả mong đợi: Bot xác nhận đã thêm; mở Dashboard thấy việc đó xuất hiện (nhãn nguồn CEO/Telegram).
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**C3 — Đánh dấu xong qua chat**
- Bước: Nhắn bot: **"xong việc đặt hoa khai trương"** (hoặc theo cách bot hướng dẫn).
- Kết quả mong đợi: Bot xác nhận; việc đó biến mất khỏi danh sách đang mở (kiểm tra lại trên Dashboard).
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**C4 — Hai nơi cùng một danh sách**
- Bước: Thêm 1 việc trên Dashboard → hỏi bot "việc hôm nay?".
- Kết quả mong đợi: Việc vừa thêm trên Dashboard cũng xuất hiện khi hỏi bot (cùng một kho dữ liệu).
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

## D. Việc hệ thống tự xuất hiện

> **Cách test khuyến nghị (vì cron lỗi / license sắp hết hạn khó ép thủ công):**
> Phần lõi (sinh việc + gộp trùng không spam) ĐÃ có test tự động (`check-todos.js`)
> và drift-guard. Mục D ở đây xác nhận **việc hệ thống hiện ra ĐÚNG trên Dashboard thật**.
> - **D1 + D3:** nhờ kỹ thuật chèn MỘT việc hệ thống thật vào workspace của CEO
>   (gọi đúng hàm `emitSystemTask` một lần) → CEO thấy thẻ "Hệ thống" hiện trên
>   Dashboard thật → bấm **Bỏ** để xoá thẻ test. ~10 giây, không giả gì trong code sản phẩm.
> - **D2 (Zalo):** Zalo vốn rớt kết nối thường xuyên → để **quan sát tự nhiên trong
>   ngày đầu chạy thật** (không cần ép 5 phút mất mạng). Đây là mục theo-dõi-hậu-merge.

**D1 — Cron lỗi sinh việc**
- Bước: Quan sát khi một cron (vd báo cáo sáng) thất bại 3 lần / lỗi nặng. (Khó ép thủ công — **quan sát tự nhiên**, hoặc nhờ kỹ thuật tạo 1 cron lỗi để test.)
- Kết quả mong đợi: Xuất hiện 1 việc "Cron ... lỗi, cần anh kiểm tra", nhãn nguồn "Hệ thống". Cron đó lỗi nhiều lần vẫn chỉ **1 việc** (không spam).
- [ ] Đạt  [ ] Chưa đạt  [ ] Chưa quan sát được — ghi chú: ___

**D2 — Zalo mất kết nối sinh việc, và TỰ ĐÓNG khi trở lại**
- Bước: Để Zalo rớt kết nối trên 5 phút (vd thoát mạng/đăng xuất Zalo), quan sát; rồi cho Zalo kết nối lại.
- Kết quả mong đợi: Sau >5 phút mất kết nối → xuất hiện việc "Zalo mất kết nối...". Khi Zalo trở lại → việc đó **tự đánh dấu xong** (đây là trường hợp tự-đóng DUY NHẤT của slice này).
- [ ] Đạt  [ ] Chưa đạt  [ ] Chưa quan sát được — ghi chú: ___

**D3 — License sắp hết hạn sinh việc**
- Bước: (Chỉ test được khi license còn ≤7 ngày, hoặc nhờ kỹ thuật mô phỏng.) Quan sát danh sách khi license gần hết hạn.
- Kết quả mong đợi: Xuất hiện 1 việc "License sắp hết hạn (còn N ngày)", nhãn "Hệ thống", chỉ **1 việc** dù mở app nhiều lần.
- [ ] Đạt  [ ] Chưa đạt  [ ] Chưa quan sát được — ghi chú: ___

## E. An toàn & đúng phạm vi (quan trọng)

**E1 — Bot KHÔNG tự gửi gì cho khách**
- Bước: Trong suốt quá trình test, kiểm tra: từ danh sách việc, bot có tự nhắn cho khách Zalo/FB nào không.
- Kết quả mong đợi: **Không hề**. Việc hệ thống/CEO chỉ để CEO xem. (Propose-first: ở slice này thậm chí chưa có đường gửi khách.)
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**E2 — Khách Zalo KHÔNG truy cập được danh sách**
- Bước: (Khái niệm — kỹ thuật xác nhận) Một lượt khách Zalo không thể xem/sửa danh sách việc của CEO.
- Kết quả mong đợi: Danh sách việc là **chỉ-CEO** (qua cổng xác thực Telegram-CEO). Khách Zalo không chạm tới được.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**E3 — Tiếng Việt chuẩn, không emoji**
- Bước: Đọc kỹ trang Dashboard + câu trả lời của bot.
- Kết quả mong đợi: Dấu tiếng Việt đầy đủ, đúng; **không có emoji** ở giao diện/tin nhắn cho CEO.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

## F. Bền vững dữ liệu

**F1 — Việc còn nguyên sau khi tắt/mở lại app**
- Bước: Thêm 2 việc → tắt hẳn app → mở lại → vào Việc cần làm.
- Kết quả mong đợi: 2 việc vẫn còn nguyên.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

**F2 — App mới (chưa từng có việc) không lỗi**
- Bước: (Máy/cài đặt mới chưa có file todos) Mở trang Việc cần làm lần đầu.
- Kết quả mong đợi: Hiện "Chưa có việc nào", không báo lỗi.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

## G. Sao lưu

**G1 — Việc nằm trong file sao lưu**
- Bước: Thêm vài việc → chạy chức năng sao lưu (backup) → kiểm tra nội dung sao lưu có `todos.json`.
- Kết quả mong đợi: File `todos.json` (danh sách việc) có trong bản sao lưu; phục hồi lại thì việc trở về.
- [ ] Đạt  [ ] Chưa đạt — ghi chú: ___

---

## Tiêu chí merge (definition of done cho lần nghiệm thu)

Cách tiếp cận (hybrid): merge dựa trên phần **xác định được chắc chắn**; phần khó ép
thủ công thì test rẻ hoặc theo dõi hậu-merge — không bịa lỗi để test.

- [ ] Tất cả mục **A, B, E, F** Đạt (lõi: xem/quản lý + an toàn + bền vững).
- [ ] Mục **C** (Telegram) Đạt — vì chat-first là yêu cầu của CEO.
- [ ] Mục **G** (sao lưu) Đạt.
- [ ] Mục **D1 hoặc D3** Đạt qua cách chèn-một-việc-thật (xác nhận việc hệ thống
      hiện đúng trên Dashboard). Lõi sinh-việc + chống-spam đã có test tự động nên
      chỉ cần xác nhận hiển thị 1 lần là đủ.
- [ ] Mục **D2** (Zalo tự-đóng): KHÔNG chặn merge — theo dõi & xác nhận trong ngày
      đầu chạy thật (Zalo rớt kết nối tự nhiên). Ghi lại khi đã quan sát được.
- [ ] Không có mục nào "Chưa đạt" mà chưa có hướng xử lý.

**Người nghiệm thu ký:** __________  **Ngày:** __________
**Kết luận:** [ ] Chấp nhận, cho merge   [ ] Cần sửa (liệt kê mục): __________
