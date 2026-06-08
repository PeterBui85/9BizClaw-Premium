# Chiến dịch Facebook (nhiều bài) — duyệt 1 lần, đăng tự động

Dùng khi CEO yêu cầu một LOẠT bài Facebook (chiến dịch N bài), không phải 1 bài lẻ.
Nguyên tắc: CEO duyệt TOÀN BỘ plan 1 lần, sau đó hệ thống tự đăng từng bài đúng giờ
bằng đúng ảnh + caption đã duyệt. KHÔNG duyệt lại từng bài.

## Quy trình

1. **Dựng plan đầy đủ.** Với mỗi bài: ngày, giờ, caption (GHI ĐÚNG "bài k/N" theo
   thứ tự plan — KHÔNG tự bịa số/tổng), và mô tả ảnh. N = tổng số bài CEO nêu.
2. **Tạo + ĐÓNG BĂNG tất cả banner NGAY khi làm plan.** Gọi `/api/image/generate`
   cho từng bài, lưu file vào thư mục BỀN (không phải temp) — ví dụ
   `fb-campaign-assets/<campaignId>/bai-k.png` qua `/api/file/write` nếu cần — và
   GIỮ đường dẫn tuyệt đối. Ảnh đã duyệt KHÔNG bao giờ tạo lại.
3. **Viết 1 artifact review duy nhất** vào workspace (vd
   `content-pack/fb-campaign-<campaignId>.md`) liệt kê mọi bài: k/N, ngày/giờ,
   caption, đường dẫn ảnh. Reply CEO: tóm tắt ngắn + đường dẫn file. KHÔNG dump
   từng bài thành nhiều tin.
4. **Chờ CEO duyệt** ("ok"/"duyệt"). Nếu CEO sửa bài nào → cập nhật plan + ảnh bài đó.
5. **Tạo lịch hàng loạt.** Sinh 1 `campaignId`. Với mỗi bài gọi
   `POST /api/fb/schedule/create` với: `postDate`, `postTime`, `caption`,
   `targetPageId`, `imagePath`=<ảnh đóng băng>, `autoPost=true`, `campaignId`,
   `postIndex`=k, `postTotal`=N. (Có `imagePath` → hệ thống KHÔNG tạo ảnh mới, đăng
   đúng ảnh đó.) Báo CEO 1 tin: đã tạo mấy bài, bài nào lỗi (nếu có).
6. **Sau đó im.** Mỗi bài tự đăng đúng giờ; hệ thống tự nhắn CEO "Đã đăng bài k/N + link".

## Báo cáo tiến độ chiến dịch
Khi CEO hỏi "đăng mấy bài rồi / còn mấy bài": đối chiếu HAI nguồn —
`GET /api/fb/schedule/history` (đã đăng, lọc theo `campaignId`) và
`GET /api/fb/schedule/list` (còn chờ). đã đăng = số record `published` cùng
`campaignId`; còn chờ = số lịch còn lại. TUYỆT ĐỐI không báo từ 1 nguồn.

## Anti-features
- KHÔNG preview/duyệt từng bài lúc đăng (đã duyệt cả plan).
- KHÔNG tạo lại ảnh cho bài đã lên lịch.
- KHÔNG tự bịa "bài X/Y" — số lấy từ plan.
