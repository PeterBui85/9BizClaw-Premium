const pptxgen = require(__dirname + "/../node_modules/pptxgenjs");

// Anthropic PPTX skill: Dark/light sandwich, bold color palettes, NO accent lines under titles
const DARK_BG = "0A1628";
const PRIMARY = "0F2A3D";
const SECONDARY = "1C7293";
const ACCENT = "00C9A7";
const LIGHT_BG = "F0F7FA";
const TEXT_LIGHT = "F8FAFC";
const TEXT_DARK = "1E293B";
const TEXT_MUTED = "64748B";
const CARD_BG = "FFFFFF";

function makeShadow() {
  return { type: "outer", color: "000000", blur: 8, offset: 3, angle: 135, opacity: 0.12 };
}

let pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = "9BizClaw - Giải pháp AI cho Doanh nghiệp";
pres.author = "9BizClaw";

// ===== SLIDE 1: COVER (dark) =====
let s1 = pres.addSlide();
s1.background = { color: DARK_BG };
s1.addShape("rect", { x: 0, y: 0, w: 0.15, h: 5.625, fill: { color: ACCENT }, line: { color: ACCENT } });
s1.addShape("ellipse", { x: 7.5, y: -1.5, w: 4, h: 4, fill: { color: SECONDARY, transparency: 80 }, line: { color: SECONDARY, transparency: 80 } });
s1.addShape("ellipse", { x: 8.5, y: 3.5, w: 3, h: 3, fill: { color: ACCENT, transparency: 85 }, line: { color: ACCENT, transparency: 85 } });
s1.addText("9BIZCLAW", { x: 0.6, y: 1.2, w: 6, h: 0.6, fontSize: 36, bold: true, color: TEXT_LIGHT, fontFace: "Arial Black", margin: 0, charSpacing: 4 });
s1.addText("Giải pháp AI\nTự động hóa\nDoanh nghiệp của bạn", { x: 0.6, y: 2.0, w: 7, h: 2.2, fontSize: 30, bold: true, color: TEXT_LIGHT, fontFace: "Arial", margin: 0 });
s1.addText("Telegram Bot thông minh - Sheet thông minh - Tự động hóa mọi quy trình", { x: 0.6, y: 4.3, w: 6.5, h: 0.4, fontSize: 12, color: ACCENT, fontFace: "Arial", margin: 0 });
s1.addShape("roundRect", { x: 0.6, y: 4.9, w: 2.2, h: 0.45, fill: { color: ACCENT }, line: { color: ACCENT }, rectRadius: 0.05 });
s1.addText("Khám phá ngay", { x: 0.6, y: 4.9, w: 2.2, h: 0.45, fontSize: 11, bold: true, color: DARK_BG, fontFace: "Arial", align: "center", valign: "middle", margin: 0 });

// ===== SLIDE 2: TOC (light) =====
let s2 = pres.addSlide();
s2.background = { color: LIGHT_BG };
s2.addShape("rect", { x: 0, y: 0, w: 10, h: 1.1, fill: { color: PRIMARY }, line: { color: PRIMARY } });
s2.addText("Nội dung", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 22, bold: true, color: TEXT_LIGHT, fontFace: "Arial", margin: 0 });
s2.addText("Những gì chúng ta sẽ trình bày hôm nay", { x: 0.5, y: 0.65, w: 9, h: 0.35, fontSize: 11, color: ACCENT, fontFace: "Arial", margin: 0 });
const tocItems = [
  { num: "01", title: "Thách thức", desc: "Vấn đề doanh nghiệp SME đang đối mặt" },
  { num: "02", title: "Giải pháp", desc: "9BizClaw AI Agent hoạt động như thế nào" },
  { num: "03", title: "Tính năng", desc: "Các chức năng cốt lõi của nền tảng" },
  { num: "04", title: "Case study", desc: "Kết quả thực tế từ khách hàng" },
  { num: "05", title: "Báo giá", desc: "Gói dịch vụ và mô hình pricing" },
];
tocItems.forEach((item, i) => {
  const y = 1.4 + i * 0.78;
  s2.addShape("ellipse", { x: 0.5, y, w: 0.55, h: 0.55, fill: { color: SECONDARY }, line: { color: SECONDARY } });
  s2.addText(item.num, { x: 0.5, y, w: 0.55, h: 0.55, fontSize: 13, bold: true, color: TEXT_LIGHT, fontFace: "Arial", align: "center", valign: "middle", margin: 0 });
  s2.addText(item.title, { x: 1.2, y: y - 0.02, w: 3, h: 0.35, fontSize: 16, bold: true, color: TEXT_DARK, fontFace: "Arial", margin: 0 });
  s2.addText(item.desc, { x: 1.2, y: y + 0.32, w: 5, h: 0.3, fontSize: 11, color: TEXT_MUTED, fontFace: "Arial", margin: 0 });
});
s2.addShape("rect", { x: 7.5, y: 1.4, w: 2.2, h: 3.8, fill: { color: PRIMARY, transparency: 10 }, line: { color: PRIMARY, transparency: 10 } });
s2.addShape("rect", { x: 7.7, y: 1.6, w: 2.2, h: 3.8, fill: { color: SECONDARY, transparency: 15 }, line: { color: SECONDARY, transparency: 15 } });

// ===== SLIDE 3: PROBLEM (dark) =====
let s3 = pres.addSlide();
s3.background = { color: DARK_BG };
s3.addShape("rect", { x: 0, y: 0, w: 10, h: 1.1, fill: { color: PRIMARY }, line: { color: PRIMARY } });
s3.addText("Thách thức", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 22, bold: true, color: TEXT_LIGHT, fontFace: "Arial", margin: 0 });
s3.addText("Doanh nghiệp SME đang lãng phí bao nhiêu?", { x: 0.5, y: 0.65, w: 9, h: 0.35, fontSize: 11, color: ACCENT, fontFace: "Arial", margin: 0 });
const problems = [
  { stat: "23 giờ", label: "Mỗi tuần", desc: "Dành cho công việc lặp đi lặp lại thủ công" },
  { stat: "67%", label: "Dữ liệu rời rạc", desc: "Excel, Zalo, Gmail - không kết nối được với nhau" },
  { stat: "3x", label: "Chi phí vận hành", desc: "So với doanh nghiệp số hóa tốt" },
];
problems.forEach((p, i) => {
  const x = 0.5 + i * 3.15;
  s3.addShape("rect", { x, y: 1.5, w: 2.95, h: 2.8, fill: { color: CARD_BG }, line: { color: CARD_BG }, shadow: makeShadow() });
  s3.addShape("rect", { x, y: 1.5, w: 2.95, h: 0.08, fill: { color: ACCENT }, line: { color: ACCENT } });
  s3.addText(p.stat, { x: x + 0.2, y: 1.7, w: 2.55, h: 0.8, fontSize: 32, bold: true, color: PRIMARY, fontFace: "Arial Black", margin: 0 });
  s3.addText(p.label, { x: x + 0.2, y: 2.5, w: 2.55, h: 0.4, fontSize: 13, bold: true, color: SECONDARY, fontFace: "Arial", margin: 0 });
  s3.addText(p.desc, { x: x + 0.2, y: 2.9, w: 2.55, h: 1.1, fontSize: 11, color: TEXT_MUTED, fontFace: "Arial", margin: 0 });
});
s3.addText("Vấn đề không phải thiếu công cụ - mà là thiếu một AI Agent thông minh kết nối tất cả.", { x: 0.5, y: 4.7, w: 9, h: 0.5, fontSize: 12, italic: true, color: TEXT_MUTED, fontFace: "Arial", align: "center", margin: 0 });

// ===== SLIDE 4: SOLUTION (light) =====
let s4 = pres.addSlide();
s4.background = { color: LIGHT_BG };
s4.addShape("rect", { x: 0, y: 0, w: 10, h: 1.1, fill: { color: PRIMARY }, line: { color: PRIMARY } });
s4.addText("Giải pháp", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 22, bold: true, color: TEXT_LIGHT, fontFace: "Arial", margin: 0 });
s4.addText("9BizClaw - AI Agent duy nhất bạn cần", { x: 0.5, y: 0.65, w: 9, h: 0.35, fontSize: 11, color: ACCENT, fontFace: "Arial", margin: 0 });
const cx = 5, cy = 3.2;
s4.addShape("ellipse", { x: cx - 1.2, y: cy - 1.2, w: 2.4, h: 2.4, fill: { color: PRIMARY }, line: { color: PRIMARY }, shadow: makeShadow() });
s4.addText("9BizClaw\nAI Agent", { x: cx - 1.2, y: cy - 0.6, w: 2.4, h: 1.2, fontSize: 14, bold: true, color: TEXT_LIGHT, fontFace: "Arial", align: "center", valign: "middle", margin: 0 });
s4.addShape("roundRect", { x: cx - 0.9, y: 1.35, w: 1.8, h: 0.55, fill: { color: SECONDARY }, line: { color: SECONDARY }, rectRadius: 0.08 });
s4.addText("Telegram", { x: cx - 0.9, y: 1.35, w: 1.8, h: 0.55, fontSize: 11, bold: true, color: TEXT_LIGHT, fontFace: "Arial", align: "center", valign: "middle", margin: 0 });
s4.addShape("roundRect", { x: 7.5, y: cy - 0.27, w: 1.8, h: 0.55, fill: { color: "34A853" }, line: { color: "34A853" }, rectRadius: 0.08 });
s4.addText("Google Sheets", { x: 7.5, y: cy - 0.27, w: 1.8, h: 0.55, fontSize: 11, bold: true, color: TEXT_LIGHT, fontFace: "Arial", align: "center", valign: "middle", margin: 0 });
s4.addShape("roundRect", { x: cx - 0.9, y: 4.3, w: 1.8, h: 0.55, fill: { color: ACCENT }, line: { color: ACCENT }, rectRadius: 0.08 });
s4.addText("Zalo / Email", { x: cx - 0.9, y: 4.3, w: 1.8, h: 0.55, fontSize: 11, bold: true, color: DARK_BG, fontFace: "Arial", align: "center", valign: "middle", margin: 0 });
s4.addShape("roundRect", { x: 0.5, y: cy - 0.27, w: 1.8, h: 0.55, fill: { color: "4285F4" }, line: { color: "4285F4" }, rectRadius: 0.08 });
s4.addText("Google Drive", { x: 0.5, y: cy - 0.27, w: 1.8, h: 0.55, fontSize: 11, bold: true, color: TEXT_LIGHT, fontFace: "Arial", align: "center", valign: "middle", margin: 0 });
s4.addText("Chỉ cần nhắn tin cho bot - mọi thứ được tự động hóa hoàn toàn", { x: 0.5, y: 5.05, w: 9, h: 0.4, fontSize: 12, bold: true, color: TEXT_DARK, fontFace: "Arial", align: "center", margin: 0 });

// ===== SLIDE 5: FEATURES (light) =====
let s5 = pres.addSlide();
s5.background = { color: LIGHT_BG };
s5.addShape("rect", { x: 0, y: 0, w: 10, h: 1.1, fill: { color: PRIMARY }, line: { color: PRIMARY } });
s5.addText("Tính năng", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 22, bold: true, color: TEXT_LIGHT, fontFace: "Arial", margin: 0 });
s5.addText("Mọi thứ bạn cần trong một Telegram Bot", { x: 0.5, y: 0.65, w: 9, h: 0.35, fontSize: 11, color: ACCENT, fontFace: "Arial", margin: 0 });
const features = [
  { icon: "S1", title: "Google Sheets Tự động", desc: "Tạo, format, cập nhật Sheet với dữ liệu thực. Hỗ trợ XLSX, DOCX, PPTX." },
  { icon: "S2", title: "Tư vấn Khách hàng", desc: "Quản lý phễu khách hàng, theo dõi giai đoạn, tự động nhắc nhở." },
  { icon: "S3", title: "Lên lịch & Cron", desc: "Tự động chạy tác vụ theo lịch. Báo cáo định kỳ gửi Zalo/Email." },
  { icon: "S4", title: "AI Agent Thông minh", desc: "Hiểu ngữ cảnh tiếng Việt, tự suy luận nhiều bước, gọi API chủ động." },
  { icon: "S5", title: "Office Documents", desc: "Tạo báo giá, hợp đồng, kế hoạch marketing bằng lệnh đơn giản." },
  { icon: "S6", title: "Kết nối Đa nền tảng", desc: "Google Workspace, Telegram, Zalo, Email - tất cả trong một bot." },
];
features.forEach((f, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = 0.5 + col * 3.1, y = 1.4 + row * 1.95;
  s5.addShape("rect", { x, y, w: 2.95, h: 1.8, fill: { color: CARD_BG }, line: { color: "E2E8F0", width: 0.5 }, shadow: makeShadow() });
  s5.addShape("rect", { x, y, w: 0.08, h: 1.8, fill: { color: ACCENT }, line: { color: ACCENT } });
  s5.addText(f.icon, { x: x + 0.2, y: y + 0.15, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: SECONDARY, fontFace: "Arial Black", margin: 0 });
  s5.addText(f.title, { x: x + 0.2, y: y + 0.65, w: 2.55, h: 0.4, fontSize: 12, bold: true, color: TEXT_DARK, fontFace: "Arial", margin: 0 });
  s5.addText(f.desc, { x: x + 0.2, y: y + 1.05, w: 2.55, h: 0.65, fontSize: 9.5, color: TEXT_MUTED, fontFace: "Arial", margin: 0 });
});

// ===== SLIDE 6: CASE STUDY (dark) =====
let s6 = pres.addSlide();
s6.background = { color: DARK_BG };
s6.addShape("rect", { x: 0, y: 0, w: 10, h: 1.1, fill: { color: PRIMARY }, line: { color: PRIMARY } });
s6.addText("Case Study", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 22, bold: true, color: TEXT_LIGHT, fontFace: "Arial", margin: 0 });
s6.addText("Kết quả thực tế từ khách hàng", { x: 0.5, y: 0.65, w: 9, h: 0.35, fontSize: 11, color: ACCENT, fontFace: "Arial", margin: 0 });
s6.addShape("rect", { x: 0.5, y: 1.5, w: 9, h: 2.6, fill: { color: CARD_BG }, line: { color: CARD_BG }, shadow: makeShadow() });
s6.addShape("rect", { x: 0.5, y: 1.5, w: 9, h: 0.08, fill: { color: ACCENT }, line: { color: ACCENT } });
s6.addText("Công ty TNHH Sản xuất & Thương mại An Phát", { x: 0.8, y: 1.7, w: 6, h: 0.4, fontSize: 14, bold: true, color: TEXT_DARK, fontFace: "Arial", margin: 0 });
s6.addText("Ngành: Sản xuất công nghiệp | Nhân sự: 45 người | Đã dùng 9BizClaw 6 tháng", { x: 0.8, y: 2.1, w: 8, h: 0.3, fontSize: 10, color: TEXT_MUTED, fontFace: "Arial", margin: 0 });
const results = [{ val: "-65%", label: "Thời gian vận hành" }, { val: "+180%", label: "Tỷ lệ chốt khách mới" }, { val: "4.5x", label: "ROI sau 6 tháng" }, { val: "0 lỗi", label: "Sheet tự động mỗi tuần" }];
results.forEach((r, i) => {
  const x = 0.8 + i * 2.25;
  s6.addText(r.val, { x, y: 2.55, w: 2, h: 0.65, fontSize: 26, bold: true, color: ACCENT, fontFace: "Arial Black", margin: 0 });
  s6.addText(r.label, { x, y: 3.2, w: 2, h: 0.4, fontSize: 11, color: TEXT_DARK, fontFace: "Arial", margin: 0 });
});
s6.addText('"9BizClaw đã thay thế 3 công cụ riêng lẻ. Giờ chỉ cần nhắn tin cho bot là xong hết."', { x: 0.5, y: 4.4, w: 9, h: 0.5, fontSize: 12, italic: true, color: TEXT_LIGHT, fontFace: "Arial", align: "center", margin: 0 });
s6.addText("— Ông Minh, Giám đốc An Phát", { x: 0.5, y: 4.9, w: 9, h: 0.3, fontSize: 10, color: ACCENT, fontFace: "Arial", align: "center", margin: 0 });

// ===== SLIDE 7: PRICING (light) =====
let s7 = pres.addSlide();
s7.background = { color: LIGHT_BG };
s7.addShape("rect", { x: 0, y: 0, w: 10, h: 1.1, fill: { color: PRIMARY }, line: { color: PRIMARY } });
s7.addText("Báo giá", { x: 0.5, y: 0.15, w: 9, h: 0.5, fontSize: 22, bold: true, color: TEXT_LIGHT, fontFace: "Arial", margin: 0 });
s7.addText("Chọn gói phù hợp với doanh nghiệp bạn", { x: 0.5, y: 0.65, w: 9, h: 0.35, fontSize: 11, color: ACCENT, fontFace: "Arial", margin: 0 });
const plans = [
  { name: "Starter", price: "2,990,000", features: ["1 Telegram Bot", "10 tự động hóa/tháng", "Google Sheets cơ bản", "Hỗ trợ chat"], highlight: false },
  { name: "Growth", price: "5,990,000", features: ["2 Telegram Bot", "50 tự động hóa/tháng", "Google Sheets + Docs", "Zalo + Email", "AI Agent nâng cao"], highlight: true },
  { name: "Enterprise", price: "Liên hệ", features: ["Không giới hạn", "Tất cả integrations", "AI Agent + MCP", "Hỗ trợ 24/7", "On-premise option"], highlight: false },
];
plans.forEach((plan, i) => {
  const x = 0.5 + i * 3.15;
  const bg = plan.highlight ? PRIMARY : CARD_BG;
  const fg = plan.highlight ? TEXT_LIGHT : TEXT_DARK;
  s7.addShape("rect", { x, y: 1.4, w: 2.95, h: 3.7, fill: { color: bg }, line: { color: plan.highlight ? PRIMARY : "E2E8F0", width: plan.highlight ? 2 : 0.5 }, shadow: makeShadow() });
  s7.addText(plan.name, { x: x + 0.2, y: 1.6, w: 2.55, h: 0.45, fontSize: 16, bold: true, color: plan.highlight ? ACCENT : fg, fontFace: "Arial", margin: 0 });
  s7.addText(plan.price, { x: x + 0.2, y: 2.1, w: 2.55, h: 0.6, fontSize: 24, bold: true, color: fg, fontFace: "Arial Black", margin: 0 });
  plan.features.forEach((f, j) => {
    s7.addText("\u2713  " + f, { x: x + 0.2, y: 2.85 + j * 0.4, w: 2.55, h: 0.35, fontSize: 10, color: fg, fontFace: "Arial", margin: 0 });
  });
});

// ===== SLIDE 8: CTA (dark) =====
let s8 = pres.addSlide();
s8.background = { color: DARK_BG };
s8.addShape("ellipse", { x: -2, y: -2, w: 6, h: 6, fill: { color: PRIMARY, transparency: 60 }, line: { color: PRIMARY, transparency: 60 } });
s8.addShape("ellipse", { x: 7, y: 3, w: 5, h: 5, fill: { color: SECONDARY, transparency: 80 }, line: { color: SECONDARY, transparency: 80 } });
s8.addText("Sẵn sàng\nTự động hóa\nDoanh nghiệp?", { x: 0.6, y: 1.2, w: 8, h: 2.2, fontSize: 34, bold: true, color: TEXT_LIGHT, fontFace: "Arial Black", margin: 0 });
s8.addText("Bắt đầu dùng thử miễn phí 14 ngày.\nKhông cần thẻ tín dụng. Không cam kết.", { x: 0.6, y: 3.5, w: 6, h: 0.8, fontSize: 14, color: TEXT_LIGHT, fontFace: "Arial", margin: 0 });
s8.addShape("roundRect", { x: 0.6, y: 4.4, w: 2.8, h: 0.55, fill: { color: ACCENT }, line: { color: ACCENT }, rectRadius: 0.05 });
s8.addText("Dùng thử miễn phí", { x: 0.6, y: 4.4, w: 2.8, h: 0.55, fontSize: 13, bold: true, color: DARK_BG, fontFace: "Arial", align: "center", valign: "middle", margin: 0 });
s8.addText("9BizClaw.com  |  @9BizClaw  |  contact@9bizclaw.com", { x: 0.6, y: 5.1, w: 9, h: 0.3, fontSize: 10, color: TEXT_MUTED, fontFace: "Arial", margin: 0 });

pres.writeFile({ fileName: "C:\\Users\\buitu\\Desktop\\claw\\scripts\\demo-san-pham-anthropic.pptx" })
  .then(() => console.log("Done: demo-san-pham-anthropic.pptx"))
  .catch(e => { console.error(e); process.exit(1); });
