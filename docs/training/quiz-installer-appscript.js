/**
 * 9BizClaw - Bài Kiểm Tra Cài Đặt
 *
 * Cách dùng:
 * 1. Mở https://script.google.com
 * 2. Tạo project mới
 * 3. Paste toàn bộ code này
 * 4. Nhấn Run > chọn createInstallerQuiz
 * 5. Cấp quyền khi được hỏi
 * 6. Xem log (Ctrl+Enter) để lấy link Google Form
 *
 * Mỗi câu hỏi khớp với 1 section trong installer-training.md.
 * Xem comment [Ref: Section X] trước mỗi câu.
 */

function createInstallerQuiz() {
  var form = FormApp.create('9BizClaw - Bài Kiểm Tra Kiến Thức Cài Đặt');
  form.setDescription(
    'Bài kiểm tra dành cho đội ngũ cài đặt 9BizClaw.\n' +
    'Thời gian: 10 phút | Số câu: 20\n' +
    'Đọc tài liệu đào tạo trước khi làm bài.'
  );
  form.setIsQuiz(true);
  form.setShuffleQuestions(false);

  form.addSectionHeaderItem()
    .setTitle('Thông tin')
    .setHelpText('Điền đầy đủ họ tên và số điện thoại');

  form.addTextItem().setTitle('Họ và tên').setRequired(true);
  form.addTextItem().setTitle('Số điện thoại').setRequired(true);

  // =====================================================
  // Phần 1: Chuẩn bị trước khi cài (Section 1)
  // =====================================================
  form.addSectionHeaderItem().setTitle('Phần 1: Chuẩn Bị Trước Khi Cài');

  // [Ref: Section 1 — bảng 5 thứ bắt buộc]
  var q1 = form.addMultipleChoiceItem();
  q1.setTitle('1. CEO cần chuẩn bị bao nhiêu thứ BẮT BUỘC trước khi cài 9BizClaw?');
  q1.setPoints(1);
  q1.setChoices([
    q1.createChoice('3 thứ', false),
    q1.createChoice('4 thứ', false),
    q1.createChoice('5 thứ', true),
    q1.createChoice('6 thứ', false)
  ]);
  q1.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! 5 thứ: Telegram, Zalo, ChatGPT, máy tính, license key.').build());
  q1.setFeedbackForIncorrect(FormApp.createFeedback().setText('Sai. 5 thứ bắt buộc: Telegram, Zalo, ChatGPT, máy tính, license key.').build());

  // [Ref: Section 1 — hàng 2: "trên chính máy tính... Zalo trên điện thoại KHÔNG đủ"]
  var q2 = form.addMultipleChoiceItem();
  q2.setTitle('2. CEO nói "Zalo tôi cài trên điện thoại rồi". Vậy có cài 9BizClaw được chưa?');
  q2.setPoints(1);
  q2.setChoices([
    q2.createChoice('Được, chỉ cần có tài khoản Zalo là đủ', false),
    q2.createChoice('Chưa — Zalo phải đang đăng nhập trên chính máy tính sẽ cài 9BizClaw', true),
    q2.createChoice('Được, app sẽ tự kết nối Zalo từ điện thoại', false),
    q2.createChoice('Chưa — phải gỡ Zalo trên điện thoại trước', false)
  ]);
  q2.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Zalo phải đang đăng nhập trên cùng máy tính sẽ cài 9BizClaw.').build());

  // [Ref: Section 1 — hàng 5 + Section 3: format CLAW-]
  var q3 = form.addMultipleChoiceItem();
  q3.setTitle('3. License key của 9BizClaw bắt đầu bằng cụm từ nào?');
  q3.setPoints(1);
  q3.setChoices([
    q3.createChoice('KEY-', false),
    q3.createChoice('9BIZ-', false),
    q3.createChoice('CLAW-', true),
    q3.createChoice('LICENSE-', false)
  ]);
  q3.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Format: CLAW-eyJlIjoiZW1haWxA...').build());

  // =====================================================
  // Phần 2: Cài đặt & Splash (Section 2)
  // =====================================================
  form.addSectionHeaderItem().setTitle('Phần 2: Cài Đặt & Màn Hình Splash');

  // [Ref: Section 2 — "Mất 2-10 phút tuỳ tốc độ mạng"]
  var q4 = form.addMultipleChoiceItem();
  q4.setTitle('4. Lần đầu mở app, app cần tải thêm dữ liệu. Mất khoảng bao lâu?');
  q4.setPoints(1);
  q4.setChoices([
    q4.createChoice('Dưới 30 giây', false),
    q4.createChoice('2-10 phút tuỳ tốc độ mạng', true),
    q4.createChoice('30 phút trở lên', false),
    q4.createChoice('Không cần mạng, cài offline được', false)
  ]);
  q4.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Cần internet ổn định, mất 2-10 phút tuỳ mạng.').build());

  // [Ref: Section 2 — "app có nút Thử lại (tự retry 4 lần). Đợi 30 giây"]
  var q5 = form.addMultipleChoiceItem();
  q5.setTitle('5. App đang tải lần đầu thì bị lỗi, hiện nút "Thử lại". Nên làm gì?');
  q5.setPoints(1);
  q5.setChoices([
    q5.createChoice('Nhấn "Thử lại" ngay lập tức', false),
    q5.createChoice('Đợi khoảng 30 giây rồi nhấn "Thử lại" (app tự retry tối đa 4 lần)', true),
    q5.createChoice('Đóng app và cài lại từ đầu', false),
    q5.createChoice('Liên hệ support ngay', false)
  ]);
  q5.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Đợi 30 giây trước khi thử lại. App tự retry 4 lần.').build());

  // [Ref: Section 7 — "upload file bảng giá vào Dashboard > tab Tài liệu > thư mục Sản phẩm"]
  var q6 = form.addMultipleChoiceItem();
  q6.setTitle('6. CEO muốn bot biết giá sản phẩm để trả lời khách Zalo. Hướng dẫn CEO làm gì?');
  q6.setPoints(1);
  q6.setChoices([
    q6.createChoice('Nhắn giá cho bot qua Telegram', false),
    q6.createChoice('Upload file bảng giá vào tab Tài liệu trong Dashboard', true),
    q6.createChoice('Gửi file cho support để nhập giùm', false),
    q6.createChoice('Bot tự biết giá, không cần làm gì', false)
  ]);
  q6.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Dashboard > tab Tài liệu > thư mục Sản phẩm > upload file bảng giá (PDF/Word/Excel).').build());

  // [Ref: Section 6 — "Windows SmartScreen: More info > Run anyway"]
  var q7 = form.addMultipleChoiceItem();
  q7.setTitle('7. Windows SmartScreen hiện cảnh báo "Windows protected your PC". Làm gì?');
  q7.setPoints(1);
  q7.setChoices([
    q7.createChoice('Tắt Windows Defender hoàn toàn', false),
    q7.createChoice('Nhấn "More info" rồi nhấn "Run anyway"', true),
    q7.createChoice('Cài lại bằng quyền Administrator', false),
    q7.createChoice('Tải lại file cài đặt từ nguồn khác', false)
  ]);
  q7.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Chỉ cần "More info" > "Run anyway". KHÔNG cần tắt Defender.').build());

  // =====================================================
  // Phần 3: License (Section 3)
  // =====================================================
  form.addSectionHeaderItem().setTitle('Phần 3: License');

  // [Ref: Section 3 — "Khoá theo phần cứng máy (hardware lock) — KHÔNG copy sang máy khác"]
  var q8 = form.addMultipleChoiceItem();
  q8.setTitle('8. License key 9BizClaw có đặc điểm gì cần nhớ nhất?');
  q8.setPoints(1);
  q8.setChoices([
    q8.createChoice('Có thể dùng trên nhiều máy', false),
    q8.createChoice('Khoá theo phần cứng máy (hardware lock) — KHÔNG copy sang máy khác được', true),
    q8.createChoice('Tự động gia hạn mỗi năm', false),
    q8.createChoice('Chỉ cần nhớ 6 ký tự đầu', false)
  ]);
  q8.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Key khoá theo phần cứng, KHÔNG thể copy sang máy khác.').build());

  // [Ref: Section 3 — bảng lỗi: "Bind tới máy khác → liên hệ support để reset"]
  var q9 = form.addMultipleChoiceItem();
  q9.setTitle('9. App báo "Bind tới máy khác" khi nhập license key. Nghĩa là gì?');
  q9.setPoints(1);
  q9.setChoices([
    q9.createChoice('Key sai, cần mua key mới', false),
    q9.createChoice('Key đã dùng trên máy cũ — liên hệ support để reset', true),
    q9.createChoice('Máy không đủ cấu hình', false),
    q9.createChoice('Key hết hạn, cần gia hạn', false)
  ]);
  q9.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Key khoá theo phần cứng. Đã dùng trên máy khác thì phải liên hệ support reset.').build());

  // =====================================================
  // Phần 4: Wizard (Section 4)
  // =====================================================
  form.addSectionHeaderItem().setTitle('Phần 4: Wizard Cài Đặt');

  // [Ref: Section 4 — "Wizard 4 Bước"]
  var q10 = form.addMultipleChoiceItem();
  q10.setTitle('10. Wizard cài đặt có bao nhiêu bước?');
  q10.setPoints(1);
  q10.setChoices([
    q10.createChoice('3 bước', false),
    q10.createChoice('4 bước', true),
    q10.createChoice('5 bước', false),
    q10.createChoice('6 bước', false)
  ]);
  q10.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! 4 bước: Thông tin cơ bản, Kết nối ChatGPT, Kết nối Telegram, Hoàn tất.').build());

  // [Ref: Section 4 Bước 3 — "tìm @BotFather > gửi /newbot"]
  var q11 = form.addMultipleChoiceItem();
  q11.setTitle('11. Để tạo bot Telegram, CEO cần tìm ai trên Telegram?');
  q11.setPoints(1);
  q11.setChoices([
    q11.createChoice('@telegrambot', false),
    q11.createChoice('@BotFather', true),
    q11.createChoice('@9bizclaw_bot', false),
    q11.createChoice('@userinfobot', false)
  ]);
  q11.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Tìm @BotFather, gửi /newbot, đặt tên + username kết thúc bằng "bot".').build());

  // [Ref: Section 4 Bước 3 — "tìm @userinfobot > gửi /start > copy dãy số ID"]
  var q12 = form.addMultipleChoiceItem();
  q12.setTitle('12. Để lấy User ID trên Telegram, CEO cần tìm ai?');
  q12.setPoints(1);
  q12.setChoices([
    q12.createChoice('@BotFather', false),
    q12.createChoice('@userinfobot', true),
    q12.createChoice('@getmyid_bot', false),
    q12.createChoice('@telegram', false)
  ]);
  q12.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Tìm @userinfobot, gửi /start, copy dãy số ID.').build());

  // [Ref: Section 4 Bước 3 — "Token đúng format: 1234567890:ABCdefGHI..."]
  var q13 = form.addMultipleChoiceItem();
  q13.setTitle('13. Token Telegram đúng format nào?');
  q13.setPoints(1);
  q13.setChoices([
    q13.createChoice('Chỉ có chữ cái và số', false),
    q13.createChoice('Số + dấu : + chữ (VD: 1234567890:ABCdefGHI...)', true),
    q13.createChoice('Chỉ có số', false),
    q13.createChoice('Bắt đầu bằng TG-', false)
  ]);
  q13.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Format: 1234567890:ABCdefGHI... Copy TOÀN BỘ dòng.').build());

  // [Ref: Section 4 Bước 2 + Section 6 — "Đóng app, mở lại (app có auto-fix). Vẫn 500 sau 3 lần: gửi log"]
  var q14 = form.addMultipleChoiceItem();
  q14.setTitle('14. Nếu bước 2 (Thiết lập AI) bị lỗi 500, bước ĐẦU TIÊN nên làm gì?');
  q14.setPoints(1);
  q14.setChoices([
    q14.createChoice('Liên hệ support ngay', false),
    q14.createChoice('Đóng app, mở lại (app có auto-fix)', true),
    q14.createChoice('Cài lại toàn bộ', false),
    q14.createChoice('Xoá file config', false)
  ]);
  q14.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Đóng mở lại, app tự sửa. Vẫn 500 sau 3 lần thì gửi log cho support.').build());

  // =====================================================
  // Phần 5: Xác nhận & Bàn giao (Section 5 + 7)
  // =====================================================
  form.addSectionHeaderItem().setTitle('Phần 5: Xác Nhận & Bàn Giao');

  // [Ref: Section 5 — "Proof thật sự là bot trả lời tin nhắn"]
  var q15 = form.addMultipleChoiceItem();
  q15.setTitle('15. Wizard hiện "Hoàn tất" rồi. Vậy cài xong chưa?');
  q15.setPoints(1);
  q15.setChoices([
    q15.createChoice('Xong rồi, Wizard nói Hoàn tất là xong', false),
    q15.createChoice('Xong rồi, Dashboard mở được là xong', false),
    q15.createChoice('Chưa — phải gửi tin cho bot trên Telegram, bot trả lời mới là xong', true),
    q15.createChoice('Xong rồi, thấy chấm xanh trên sidebar là xong', false)
  ]);
  q15.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Wizard chỉ lưu cấu hình. Phải thử gửi tin cho bot, bot trả lời mới thật sự xong.').build());
  q15.setFeedbackForIncorrect(FormApp.createFeedback().setText('Sai. Wizard chỉ lưu cấu hình thôi. Phải gửi tin VÀ bot trả lời mới là cài xong.').build());

  // [Ref: Section 5 — "Chờ 30-60 giây (lần đầu gateway cần khởi động)"]
  var q16 = form.addMultipleChoiceItem();
  q16.setTitle('16. Gửi tin cho bot lần đầu, chờ bao lâu thì mới nên lo?');
  q16.setPoints(1);
  q16.setChoices([
    q16.createChoice('5 giây', false),
    q16.createChoice('10 giây', false),
    q16.createChoice('30-60 giây', true),
    q16.createChoice('5 phút', false)
  ]);
  q16.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Lần đầu gateway cần khởi động, chờ 30-60 giây.').build());

  // [Ref: Section 5 — checklist "App đã mở chưa? Đã nhấn /start chưa?"]
  var q17 = form.addMultipleChoiceItem();
  q17.setTitle('17. Bot im re sau 60 giây. Check gì trước?');
  q17.setPoints(1);
  q17.setChoices([
    q17.createChoice('Cài lại app', false),
    q17.createChoice('App có đang mở không + đã nhấn /start trên bot Telegram chưa', true),
    q17.createChoice('Đổi mạng wifi', false),
    q17.createChoice('Liên hệ support ngay', false)
  ]);
  q17.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Kiểm tra app đang mở, đã /start, chấm Telegram xanh hay đỏ trên Dashboard.').build());

  // [Ref: Section 7 — "3 việc tối thiểu"]
  var q18 = form.addMultipleChoiceItem();
  q18.setTitle('18. Cài xong, trước khi tắt remote phải làm xong mấy việc?');
  q18.setPoints(1);
  q18.setChoices([
    q18.createChoice('1 việc', false),
    q18.createChoice('2 việc', false),
    q18.createChoice('3 việc', true),
    q18.createChoice('5 việc', false)
  ]);
  q18.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! 3 việc: Bot trả lời Telegram, CEO biết cách dùng cơ bản, Nhắc để máy mở.').build());

  // =====================================================
  // Phần 6: Dữ liệu & Vận hành (Section 7 + 9)
  // =====================================================
  form.addSectionHeaderItem().setTitle('Phần 6: Dữ Liệu & Vận Hành');

  // [Ref: Section 7 — "CEO hỏi dữ liệu có lên mạng không → 100% trên máy anh/chị"]
  var q19 = form.addMultipleChoiceItem();
  q19.setTitle('19. CEO hỏi: "Dữ liệu chat khách hàng có lên mạng không?" Trả lời sao?');
  q19.setPoints(1);
  q19.setChoices([
    q19.createChoice('"Có, lưu trên cloud của 9Biz để backup"', false),
    q19.createChoice('"100% trên máy anh/chị, không ai ngoài anh/chị truy cập được"', true),
    q19.createChoice('"Lưu trên server Telegram"', false),
    q19.createChoice('"Tuỳ cài đặt, mặc định lên cloud"', false)
  ]);
  q19.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Dữ liệu 100% trên máy, không lên cloud, không ai ngoài CEO truy cập.').build());

  // [Ref: Section 7 — "Mac đóng nắp = sleep = bot và lịch tự động ngừng hoạt động"]
  var q20 = form.addMultipleChoiceItem();
  q20.setTitle('20. CEO xài MacBook, hay gập máy khi về nhà. Cần dặn gì?');
  q20.setPoints(1);
  q20.setChoices([
    q20.createChoice('Không ảnh hưởng gì, bot vẫn chạy bình thường', false),
    q20.createChoice('Đóng nắp = Mac sleep = bot và lịch tự động ngừng hoạt động', true),
    q20.createChoice('Nên tắt hẳn máy mỗi tối cho máy nghỉ', false),
    q20.createChoice('Chỉ ảnh hưởng Zalo, Telegram vẫn chạy', false)
  ]);
  q20.setFeedbackForCorrect(FormApp.createFeedback().setText('Đúng! Mac đóng nắp = sleep = cron mất. Nhắc CEO: Energy Saver > tắt sleep, hoặc để nắp mở.').build());

  form.setConfirmationMessage('Đã hoàn thành bài kiểm tra!');
  form.setCollectEmail(true);
  form.setLimitOneResponsePerUser(true);
  form.setAllowResponseEdits(false);
  form.setPublishingSummary(false);

  Logger.log('Form đã tạo thành công!');
  Logger.log('Link chỉnh sửa: ' + form.getEditUrl());
  Logger.log('Link làm bài:   ' + form.getPublishedUrl());
}
