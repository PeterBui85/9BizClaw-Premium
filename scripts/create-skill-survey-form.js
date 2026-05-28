/**
 * Google Apps Script — paste vào https://script.google.com rồi Run > createSkillSurveyForm
 * Tạo 1 Google Form khảo sát skill mà khách premium 9BizClaw cần
 * Kết quả: biết khách cần gì → tạo skill gửi cho họ
 */

function createSkillSurveyForm() {
  const form = FormApp.create('9BizClaw — Khảo sát nhu cầu Skill AI');
  form.setDescription(
    'Chào anh/chị! 9BizClaw có thể tạo các "skill" (kỹ năng) riêng cho bot của anh/chị — giúp bot xử lý nghiệp vụ chuyên sâu hơn. ' +
    'Khảo sát này giúp chúng tôi hiểu nhu cầu của anh/chị để ưu tiên phát triển skill phù hợp nhất.'
  );
  form.setConfirmationMessage('Cảm ơn anh/chị! Chúng tôi sẽ liên hệ khi skill phù hợp sẵn sàng.');
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);

  // ── 1. Thông tin cơ bản ──
  form.addSectionHeaderItem()
    .setTitle('Thông tin doanh nghiệp');

  form.addTextItem()
    .setTitle('Tên anh/chị hoặc tên công ty')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Zalo hoặc SĐT liên hệ')
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Ngành nghề kinh doanh chính của anh/chị?')
    .setChoiceValues([
      'Bán lẻ / Shop online (thời trang, mỹ phẩm, phụ kiện...)',
      'F&B (quán ăn, cafe, trà sữa, nhà hàng...)',
      'Spa / Thẩm mỹ / Làm đẹp',
      'Bất động sản',
      'Giáo dục / Đào tạo / Trung tâm ngoại ngữ',
      'Y tế / Phòng khám / Dược phẩm',
      'Du lịch / Khách sạn / Homestay',
      'Xây dựng / Nội thất / Kiến trúc',
      'Logistics / Vận chuyển / Kho bãi',
      'Công nghệ / Phần mềm / IT Services',
      'Bảo hiểm / Tài chính',
      'Nông nghiệp / Thực phẩm sạch',
      'In ấn / Quảng cáo / Truyền thông',
      'Dịch vụ pháp lý / Kế toán',
      'Fitness / Phòng gym / Yoga',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Quy mô doanh nghiệp của anh/chị?')
    .setChoiceValues([
      'Cá nhân / Freelancer',
      '1-5 nhân viên',
      '6-20 nhân viên',
      '21-50 nhân viên',
      'Trên 50 nhân viên',
    ])
    .setRequired(true);

  // ── 2. Skill bán hàng & CSKH ──
  form.addSectionHeaderItem()
    .setTitle('Skill Bán hàng & Chăm sóc khách hàng')
    .setHelpText('Bot có thể làm những việc này tự động. Chọn tất cả những gì anh/chị cần.');

  form.addCheckboxItem()
    .setTitle('Skill bán hàng nào anh/chị muốn bot có?')
    .setChoiceValues([
      'Tư vấn sản phẩm theo nhu cầu khách (hỏi → gợi ý phù hợp)',
      'Báo giá tự động theo bảng giá (khách hỏi → bot trả giá ngay)',
      'Tiếp nhận đơn hàng qua Zalo (khách đặt → bot ghi đơn)',
      'Upsell / cross-sell thông minh (gợi ý sản phẩm liên quan)',
      'Xử lý đổi trả / bảo hành (khách báo lỗi → bot hướng dẫn)',
      'Chăm sóc khách cũ (nhắc mua lại, chúc sinh nhật, khuyến mãi riêng)',
      'Phân loại khách VIP / thường / mới tự động',
      'Thu thập đánh giá / review từ khách sau mua',
      'Trả lời FAQ tự động (giờ mở cửa, địa chỉ, chính sách)',
      'Xử lý khiếu nại cấp 1 (xin lỗi, ghi nhận, chuyển sếp)',
    ])
    .showOtherOption(true)
    .setRequired(true);

  // ── 3. Skill marketing ──
  form.addSectionHeaderItem()
    .setTitle('Skill Marketing & Nội dung')
    .setHelpText('Bot tạo nội dung, đăng bài, chạy chiến dịch tự động.');

  form.addCheckboxItem()
    .setTitle('Skill marketing nào anh/chị muốn bot có?')
    .setChoiceValues([
      'Viết bài đăng Facebook tự động (theo lịch hoặc theo lệnh)',
      'Tạo hình ảnh / banner khuyến mãi bằng AI',
      'Soạn tin nhắn khuyến mãi gửi nhóm Zalo',
      'Tạo kịch bản livestream bán hàng',
      'Viết caption Instagram / TikTok',
      'Tạo email marketing / newsletter',
      'Lập kế hoạch nội dung theo tuần / tháng',
      'Phân tích đối thủ cạnh tranh',
      'Tạo landing page / giới thiệu sản phẩm',
      'Theo dõi và tóm tắt xu hướng ngành',
    ])
    .showOtherOption(true)
    .setRequired(false);

  // ── 4. Skill vận hành ──
  form.addSectionHeaderItem()
    .setTitle('Skill Vận hành & Quản lý')
    .setHelpText('Bot hỗ trợ công việc nội bộ, báo cáo, quản lý.');

  form.addCheckboxItem()
    .setTitle('Skill vận hành nào anh/chị muốn bot có?')
    .setChoiceValues([
      'Báo cáo doanh số hàng ngày / tuần / tháng',
      'Quản lý tồn kho (cảnh báo hết hàng, nhập thêm)',
      'Quản lý lịch hẹn / đặt lịch tự động (spa, phòng khám, salon)',
      'Chấm công / theo dõi nhân viên',
      'Tạo báo giá / hợp đồng tự động',
      'Quản lý công nợ (nhắc thanh toán, theo dõi)',
      'Tổng hợp đơn hàng cuối ngày',
      'Theo dõi vận chuyển / trạng thái giao hàng',
      'Tạo tờ trình / đề xuất mua hàng nội bộ',
      'Lập kế hoạch công việc / to-do cho team',
    ])
    .showOtherOption(true)
    .setRequired(false);

  // ── 5. Skill chuyên ngành ──
  form.addSectionHeaderItem()
    .setTitle('Skill chuyên ngành')
    .setHelpText('Skill riêng cho từng lĩnh vực. Chọn những gì liên quan đến ngành anh/chị.');

  form.addCheckboxItem()
    .setTitle('F&B (quán ăn, cafe, nhà hàng)')
    .setChoiceValues([
      'Nhận order qua Zalo (món, số lượng, ghi chú)',
      'Gửi menu / bảng giá tự động khi khách hỏi',
      'Quản lý đặt bàn / đặt phòng',
      'Khuyến mãi combo / happy hour tự động',
      'Xử lý phản hồi về chất lượng món ăn',
    ])
    .showOtherOption(true)
    .setRequired(false);

  form.addCheckboxItem()
    .setTitle('Spa / Thẩm mỹ / Làm đẹp')
    .setChoiceValues([
      'Đặt lịch hẹn tự động (khách chọn ngày giờ qua Zalo)',
      'Tư vấn liệu trình theo da / nhu cầu',
      'Nhắc lịch tái khám / tái hẹn',
      'Gửi khuyến mãi sinh nhật / khách thân thiết',
      'Quản lý feedback sau dịch vụ',
    ])
    .showOtherOption(true)
    .setRequired(false);

  form.addCheckboxItem()
    .setTitle('Bất động sản')
    .setChoiceValues([
      'Lọc khách theo nhu cầu (khu vực, giá, diện tích)',
      'Gửi thông tin dự án / căn hộ phù hợp tự động',
      'Đặt lịch xem nhà / xem dự án',
      'Theo dõi tiến độ khách (quan tâm → xem → cọc → ký)',
      'Tính lãi vay / trả góp cho khách',
    ])
    .showOtherOption(true)
    .setRequired(false);

  form.addCheckboxItem()
    .setTitle('Giáo dục / Đào tạo')
    .setChoiceValues([
      'Tư vấn khóa học theo trình độ / mục tiêu',
      'Đăng ký học online qua Zalo',
      'Nhắc lịch học / bài tập / thi',
      'Gửi tài liệu / bài giảng tự động',
      'Thu học phí và nhắc thanh toán',
    ])
    .showOtherOption(true)
    .setRequired(false);

  form.addCheckboxItem()
    .setTitle('Y tế / Phòng khám')
    .setChoiceValues([
      'Đặt lịch khám tự động',
      'Nhắc lịch tái khám / uống thuốc',
      'Trả lời câu hỏi sức khỏe cơ bản (theo tài liệu bác sĩ)',
      'Gửi kết quả xét nghiệm / đơn thuốc',
      'Quản lý hồ sơ bệnh nhân cơ bản',
    ])
    .showOtherOption(true)
    .setRequired(false);

  form.addCheckboxItem()
    .setTitle('Du lịch / Khách sạn / Homestay')
    .setChoiceValues([
      'Báo giá phòng / tour tự động',
      'Nhận đặt phòng qua Zalo',
      'Gửi lịch trình tour chi tiết',
      'Tư vấn điểm đến theo sở thích / ngân sách',
      'Xử lý hủy / đổi lịch đặt phòng',
    ])
    .showOtherOption(true)
    .setRequired(false);

  form.addCheckboxItem()
    .setTitle('Bán lẻ / Shop online')
    .setChoiceValues([
      'Tra cứu đơn hàng / tình trạng giao hàng',
      'Xử lý đổi size / đổi màu',
      'Cảnh báo flash sale / hàng mới về cho khách quan tâm',
      'Tạo đơn tự động từ tin nhắn Zalo',
      'Đồng bộ đơn Shopee / Lazada / TikTok Shop',
    ])
    .showOtherOption(true)
    .setRequired(false);

  // ── 6. Mức độ ưu tiên ──
  form.addSectionHeaderItem()
    .setTitle('Ưu tiên của anh/chị');

  form.addScaleItem()
    .setTitle('Mức độ cần thiết của skill mới (1 = chưa gấp, 5 = cần gấp)')
    .setBounds(1, 5)
    .setLabels('Chưa gấp', 'Cần gấp lắm')
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Anh/chị muốn bot hỗ trợ kênh nào nhất?')
    .setChoiceValues([
      'Zalo cá nhân (chat 1-1 với khách)',
      'Zalo nhóm (nhóm khách hàng, nhóm nội bộ)',
      'Telegram (quản lý, ra lệnh)',
      'Facebook (fanpage, messenger)',
      'Tất cả các kênh',
    ])
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('Mô tả công việc cụ thể mà anh/chị muốn bot làm giúp (nếu có)')
    .setHelpText('Ví dụ: "Mỗi khi khách hỏi giá thì bot tự tra bảng giá theo file Excel của tôi" hoặc "Bot tự gửi tin chúc mừng sinh nhật khách VIP"')
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle('Hiện tại anh/chị đang mất nhiều thời gian nhất cho việc gì?')
    .setHelpText('Giúp chúng tôi hiểu đâu là skill cần ưu tiên nhất cho anh/chị.')
    .setRequired(false);

  Logger.log('Form URL (gửi cho khách): ' + form.getPublishedUrl());
  Logger.log('Form URL (xem response):  ' + form.getEditUrl());
}
