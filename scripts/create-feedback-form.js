/**
 * Google Apps Script — paste vào https://script.google.com rồi Run > createFeedbackForm
 * Tạo 1 Google Form feedback cho khách premium 9BizClaw
 */

function createFeedbackForm() {
  const form = FormApp.create('9BizClaw — Phản hồi sử dụng');
  form.setDescription('Cảm ơn anh/chị đã sử dụng 9BizClaw Premium. Mọi ý kiến đều giúp chúng tôi cải thiện sản phẩm.');
  form.setConfirmationMessage('Cảm ơn anh/chị! Phản hồi đã được ghi nhận.');
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);

  // 1. Tên / công ty
  form.addTextItem()
    .setTitle('Tên anh/chị hoặc tên công ty')
    .setRequired(true);

  // 2. Đánh giá tổng thể
  form.addScaleItem()
    .setTitle('Anh/chị đánh giá 9BizClaw bao nhiêu điểm?')
    .setBounds(1, 5)
    .setLabels('Chưa hài lòng', 'Rất hài lòng')
    .setRequired(true);

  // 3. Tính năng hay dùng nhất
  form.addCheckboxItem()
    .setTitle('Tính năng nào anh/chị dùng nhiều nhất?')
    .setChoiceValues([
      'Trả lời tự động Zalo',
      'Trả lời tự động Telegram',
      'Đặt lịch gửi tin (Cron)',
      'Quản lý kiến thức (Knowledge)',
      'Đăng bài Facebook tự động',
      'Kết nối AI (ChatGPT / Claude)',
    ])
    .setRequired(true);

  // 4. Gặp lỗi gì chưa
  form.addMultipleChoiceItem()
    .setTitle('Anh/chị có gặp lỗi nào khi sử dụng không?')
    .setChoiceValues([
      'Chưa gặp lỗi',
      'Bot không trả lời',
      'Bot trả lời sai / lạc đề',
      'Ứng dụng bị treo / crash',
      'Cài đặt gặp khó khăn',
    ])
    .showOtherOption(true)
    .setRequired(true);

  // 5. Góp ý tự do
  form.addParagraphTextItem()
    .setTitle('Anh/chị có góp ý gì thêm không?')
    .setRequired(false);

  Logger.log('Form URL (gửi cho khách): ' + form.getPublishedUrl());
  Logger.log('Form URL (xem response):  ' + form.getEditUrl());
}
