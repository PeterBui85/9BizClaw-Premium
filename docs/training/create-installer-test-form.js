// Paste vào https://script.google.com > New Project > chạy function createInstallerTest()
// Form tự tạo với auto-grade + shuffle + pass 80%

function createInstallerTest() {
  var form = FormApp.create('9BizClaw — Bài Kiểm Tra Cài Đặt');
  form.setDescription('15 câu hỏi thiết yếu. Cần đúng 12/15 (80%) để đạt.\nĐọc kỹ tài liệu trước khi làm.\nThời gian: 10 phút.');
  form.setIsQuiz(true);
  form.setShuffleQuestions(true);
  form.setCollectEmail(true);
  form.setLimitOneResponsePerUser(false);
  form.setRequireLogin(false);

  var questions = [
    {
      q: 'Trước khi cài đặt, CEO cần chuẩn bị sẵn những gì BẮT BUỘC?',
      opts: [
        'Telegram, Zalo, ChatGPT, máy tính Win10+/Mac11+, license key',
        'Telegram, Zalo, ChatGPT, máy tính, logo công ty, bảng giá',
        'Telegram, ChatGPT, máy tính, license key (Zalo không bắt buộc)',
        'Chỉ cần máy tính và license key, còn lại thiết lập sau'
      ],
      correct: 0,
      explain: '5 thứ bắt buộc: Telegram, Zalo (đăng nhập trên cùng máy), ChatGPT, máy tính (Win10+/Mac11+, 4GB RAM, 500MB trống), license key.'
    },
    {
      q: 'Lần đầu mở app, màn hình splash tải bao nhiêu dữ liệu và cần bao lâu?',
      opts: [
        '~50MB, 1 phút',
        '~170MB (Node.js + packages + gogcli), 2-10 phút tuỳ mạng',
        '~500MB (AI model + runtime), 15-30 phút',
        '~170MB nhưng không cần internet vì đã có trong file cài'
      ],
      correct: 1,
      explain: 'Splash tải Node.js (~20MB) + npm packages (~145MB) + gogcli (~5MB) = ~170MB. Cần internet ổn định.'
    },
    {
      q: 'Splash screen báo "EBUSY / File in use". Bạn làm gì?',
      opts: [
        'Tắt hoàn toàn Windows Defender rồi cài lại',
        'Thêm thư mục %APPDATA%\\9bizclaw vào Windows Security Exclusions',
        'Đóng app, chờ 5 phút rồi mở lại',
        'Xoá thư mục %APPDATA%\\9bizclaw rồi cài lại'
      ],
      correct: 1,
      explain: 'EBUSY thường do Windows Defender đang quét file. Chỉ cần thêm Exclusions, KHÔNG cần tắt hoàn toàn Defender.'
    },
    {
      q: 'License key 9BizClaw có đặc điểm gì quan trọng nhất mà installer PHẢI biết?',
      opts: [
        'Key dùng được trên nhiều máy, chỉ cần copy file license.json',
        'Key khoá theo phần cứng máy (hardware lock) — không thể copy sang máy khác',
        'Key chỉ cần nhập 1 lần, sau đó hoạt động vĩnh viễn không cần internet',
        'Key có thể chia sẻ cho nhiều nhân viên cùng công ty'
      ],
      correct: 1,
      explain: 'License khoá theo phần cứng (hostname + MAC + platform). Copy sang máy khác => seal broken.'
    },
    {
      q: 'Wizard bước 3: CEO cần làm gì để kết nối Telegram?',
      opts: [
        'Đăng nhập Telegram trên máy tính là đủ',
        'Tạo bot qua @BotFather (lấy token) + lấy User ID qua @userinfobot + kiểm tra tin thử',
        'Gửi số điện thoại cho 9Biz để họ tạo bot',
        'Chỉ cần nhập số điện thoại Telegram vào app'
      ],
      correct: 1,
      explain: '3 việc: (1) @BotFather > /newbot > lấy token (2) @userinfobot > lấy User ID (3) kiểm tra tin thử.'
    },
    {
      q: 'Wizard bước 2 báo lỗi 500 khi "Thiết lập AI". Xử lý thế nào?',
      opts: [
        'Liên hệ support ngay lập tức',
        'Đóng app, mở lại (app có auto-fix). Vẫn 500 sau 3 lần: gửi 9router.log cho support',
        'Cài lại Windows',
        'Xoá toàn bộ thư mục 9bizclaw và cài từ đầu'
      ],
      correct: 1,
      explain: 'Lỗi 500 thường do better-sqlite3. App có auto-fix khi đóng mở lại.'
    },
    {
      q: 'Sau wizard xong, CEO gửi tin Telegram nhưng bot KHÔNG trả lời. Bước kiểm tra ĐẦU TIÊN?',
      opts: [
        'Xoá app cài lại',
        'Kiểm tra app đã mở chưa + chờ 60 giây (gateway cần khởi động lần đầu)',
        'Đổi ChatGPT Plus',
        'Đổi mạng sang 5G'
      ],
      correct: 1,
      explain: 'Tin đầu tiên mất 30-60 giây vì gateway khởi động. Chờ 60s trước khi làm gì khác.'
    },
    {
      q: 'Wizard hoàn tất. Bạn cần kiểm tra gì để XÁC NHẬN cài đặt thành công?',
      opts: [
        'Chỉ cần wizard hiện "Hoàn tất" là đủ',
        'Mở Telegram > gửi tin cho bot > chờ 30-60 giây > bot trả lời = thành công',
        'Kiểm tra thư mục cài đặt có đủ file không',
        'Khởi động lại máy tính rồi mở app lại'
      ],
      correct: 1,
      explain: 'Proof thật sự là bot trả lời tin nhắn. Chờ 30-60s lần đầu vì gateway cần khởi động.'
    },
    {
      q: 'File dữ liệu người dùng (memory, knowledge, config) nằm ở đâu trên Windows?',
      opts: [
        'C:\\Program Files\\9BizClaw\\',
        'C:\\Users\\[tên]\\Desktop\\9BizClaw\\',
        'C:\\Users\\[tên]\\AppData\\Roaming\\9bizclaw\\',
        'C:\\Users\\[tên]\\Documents\\9BizClaw\\'
      ],
      correct: 2,
      explain: 'Dữ liệu tại %APPDATA%\\9bizclaw\\. Không bị ghi đè khi cập nhật app.'
    },
    {
      q: 'Hệ điều hành chặn mở app (Windows SmartScreen hoặc macOS Gatekeeper). Xử lý thế nào?',
      opts: [
        'Tải lại file cài đặt từ nguồn khác',
        'Windows: More info > Run anyway. Mac: Terminal chạy xattr -dr com.apple.quarantine [đường dẫn app]',
        'Tắt tường lửa (firewall) của hệ điều hành',
        'Liên hệ support để lấy bản có chữ ký số'
      ],
      correct: 1,
      explain: 'SmartScreen và Gatekeeper chặn app chưa ký. Không cần tắt firewall — chỉ cần cho phép chạy 1 lần.'
    },
    {
      q: 'CEO báo "Key không hợp lệ" khi kích hoạt. Kiểm tra gì?',
      opts: [
        'Liên hệ support để đổi key mới',
        'Key bắt đầu bằng CLAW-, copy TOÀN BỘ từ email gốc (không gõ tay), không có dấu cách đầu/cuối',
        'Thử restart máy tính',
        'Tắt Windows Defender'
      ],
      correct: 1,
      explain: 'Format đúng: CLAW-... Copy từ email gốc, KHÔNG gõ tay. Không có dấu cách thừa.'
    },
    {
      q: 'Cài đặt xong, bạn cần bàn giao những gì cho CEO trước khi rời đi?',
      opts: [
        'Chỉ cần đảm bảo app mở được là đủ',
        'Xác nhận bot trả lời Telegram + hướng dẫn gửi tin thử + nhắc để máy mở (thu nhỏ tray)',
        'Gửi email tổng kết kèm mật khẩu các tài khoản',
        'Cài thêm phần mềm diệt virus để bảo vệ app'
      ],
      correct: 1,
      explain: '3 việc tối thiểu: (1) bot reply Telegram OK, (2) CEO biết cách dùng cơ bản, (3) nhắc app phải mở để cron chạy.'
    },
    {
      q: 'CEO lo "mất máy thì mất hết dữ liệu". Bạn giải thích thế nào?',
      opts: [
        'Dữ liệu tự đồng bộ lên cloud, không lo mất',
        'Dữ liệu lưu trên máy — hướng dẫn CEO dùng "Xuất backup" trong Dashboard định kỳ',
        'License key là backup, nhập lại là có hết dữ liệu',
        '9BizClaw tự backup mỗi ngày lên Google Drive'
      ],
      correct: 1,
      explain: 'Dữ liệu 100% trên máy, KHÔNG lên cloud. Dashboard có nút "Xuất dữ liệu (backup)". Khuyên CEO backup định kỳ.'
    },
    {
      q: 'Khi nào installer NÊN liên hệ tech@modoro.com.vn thay vì tự xử lý?',
      opts: [
        'Bất cứ khi nào CEO gặp lỗi',
        'Sau khi đã đóng mở app 2-3 lần mà vẫn lỗi, lỗi license, splash lỗi sau 3 lần "Thử lại"',
        'Chỉ khi CEO yêu cầu',
        'Khi chưa cài được trong 5 phút đầu tiên'
      ],
      correct: 1,
      explain: 'Liên hệ khi: (1) đóng mở 2-3 lần vẫn lỗi (2) lỗi license (3) splash lỗi sau 3 lần Thử lại.'
    },
    {
      q: 'Mạng công ty có firewall chặn splash screen (ETIMEDOUT). Giải pháp nhanh nhất?',
      opts: [
        'Nhờ IT mở tất cả port',
        'Dùng hotspot 4G điện thoại cho lần tải đầu tiên (~170MB), sau đó dùng mạng công ty bình thường',
        'Cài VPN',
        'Đợi đến khi về nhà cài'
      ],
      correct: 1,
      explain: 'Hotspot 4G là nhanh nhất. Chỉ cần internet ổn định cho ~170MB lần đầu.'
    }
  ];

  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    var item = form.addMultipleChoiceItem();
    item.setTitle(q.q);
    item.setRequired(true);
    item.setPoints(1);

    var choices = [];
    for (var j = 0; j < q.opts.length; j++) {
      if (j === q.correct) {
        choices.push(item.createChoice(q.opts[j], true));
      } else {
        choices.push(item.createChoice(q.opts[j], false));
      }
    }
    item.setChoices(choices);
    item.setFeedbackForCorrect(FormApp.createFeedback().setText(q.explain).build());
    item.setFeedbackForIncorrect(FormApp.createFeedback().setText('Sai. Đọc lại tài liệu rồi thử lại.').build());
  }

  form.setPublishingSummary(false);
  form.setShowLinkToRespondAgain(true);

  Logger.log('Form đã tạo thành công!');
  Logger.log('URL chỉnh sửa: ' + form.getEditUrl());
  Logger.log('URL gửi cho installer: ' + form.getPublishedUrl());
  Logger.log('');
  Logger.log('Bước tiếp theo:');
  Logger.log('1. Mở URL chỉnh sửa');
  Logger.log('2. Settings > Quizzes > kiểm tra "Release grade" = "After manual review"');
  Logger.log('3. Copy URL gửi cho installer để làm bài');
}
