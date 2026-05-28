const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, LevelFormat, ExternalHyperlink,
  TabStopType, TabStopPosition, PageBreak
} = require(__dirname + "/../electron/node_modules/docx");

// Anthropic DOCX skill: Use docx-js, DXA widths, ShadingType.CLEAR, proper numbering
// Color scheme: Navy + Teal + Accent
const NAVY = "1E2761";
const TEAL = "1C7293";
const ACCENT = "00C9A7";
const LIGHT_BG = "F0F7FA";
const WHITE = "FFFFFF";
const DARK = "1E293B";
const MUTED = "64748B";
const BORDER_COLOR = "CBD5E1";

const CONTENT_WIDTH = 9360; // US Letter - 1" margins each side (1440*2 = 2880)

function border(color = BORDER_COLOR) {
  return { style: BorderStyle.SINGLE, size: 4, color };
}
function cellBorders(color = BORDER_COLOR) {
  const b = border(color);
  return { top: b, bottom: b, left: b, right: b };
}
function noBorder() {
  const b = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: b, bottom: b, left: b, right: b };
}
function spacing(before = 0, after = 0) {
  return { before, after };
}
function cellMargins() {
  return { top: 80, bottom: 80, left: 120, right: 120 };
}
function makeRun(text, opts = {}) {
  return new TextRun({ text, font: "Arial", size: 22, color: DARK, ...opts });
}
function makePara(children, opts = {}) {
  return new Paragraph({ children, spacing: spacing(60, 60), ...opts });
}
function hdrCell(text, widthDxa, bgColor = NAVY) {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    borders: cellBorders(BORDER_COLOR),
    shading: { fill: bgColor, type: ShadingType.CLEAR },
    margins: cellMargins(),
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, font: "Arial", size: 20, bold: true, color: WHITE })],
      alignment: AlignmentType.CENTER,
      spacing: spacing(0, 0)
    })]
  });
}
function dataCell(text, widthDxa, opts = {}) {
  const { bg = WHITE, bold = false, color = DARK, align = AlignmentType.LEFT } = opts;
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    borders: cellBorders(BORDER_COLOR),
    shading: { fill: bg, type: ShadingType.CLEAR },
    margins: cellMargins(),
    children: [new Paragraph({
      children: [new TextRun({ text, font: "Arial", size: opts.size || 20, bold, color })],
      alignment: align,
      spacing: spacing(0, 0)
    })]
  });
}

const borderlessPara = (children, opts = {}) =>
  new Paragraph({ children, spacing: spacing(0, 0), ...opts });

const divider = () => new Paragraph({
  children: [],
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 1 } },
  spacing: spacing(80, 80)
});

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22, color: DARK } }
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 40, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: TEAL },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 }
      },
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "numbered",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "9BIZCLAW", font: "Arial", size: 18, bold: true, color: NAVY }),
              new TextRun({ text: "\t", font: "Arial", size: 18 }),
              new TextRun({ text: "BÁO GIÁ DỊCH VỤ", font: "Arial", size: 18, color: MUTED }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 1 } },
            spacing: spacing(0, 120)
          })
        ]
      })
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "9BizClaw - Giải pháp AI cho doanh nghiệp  |  ", font: "Arial", size: 16, color: MUTED }),
              new TextRun({ children: ["Trang ", PageNumber.CURRENT], font: "Arial", size: 16, color: MUTED }),
              new TextRun({ text: " / ", font: "Arial", size: 16, color: MUTED }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: MUTED }),
            ],
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 1 } },
            spacing: spacing(120, 0)
          })
        ]
      })
    },
    children: [

      // ===== COVER =====
      new Paragraph({ children: [], spacing: spacing(480, 0) }),
      new Paragraph({
        children: [new TextRun({ text: "BÁO GIÁ DỊCH VỤ", font: "Arial", size: 56, bold: true, color: NAVY })],
        spacing: spacing(0, 120)
      }),
      new Paragraph({
        children: [new TextRun({ text: "9BIZCLAW - GIẢI PHÁP AI TỰ ĐỘNG HÓA DOANH NGHIỆP", font: "Arial", size: 24, color: TEAL })],
        spacing: spacing(0, 0)
      }),
      divider(),
      new Paragraph({ children: [], spacing: spacing(240, 0) }),

      // Info table (customer + quote info)
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 4680, type: WidthType.DXA },
                borders: noBorder(),
                shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
                margins: cellMargins(),
                children: [
                  new Paragraph({ children: [new TextRun({ text: "KHÁCH HÀNG", font: "Arial", size: 18, bold: true, color: MUTED })], spacing: spacing(0, 60) }),
                  new Paragraph({ children: [new TextRun({ text: "Công ty TNHH An Phát", font: "Arial", size: 22, bold: true, color: DARK })], spacing: spacing(0, 40) }),
                  new Paragraph({ children: [new TextRun({ text: "Người liên hệ: Ông Nguyễn Văn Minh", font: "Arial", size: 20, color: DARK })], spacing: spacing(0, 20) }),
                  new Paragraph({ children: [new TextRun({ text: "Email: minh@anphat.vn  |  Tel: 0901 234 567", font: "Arial", size: 20, color: DARK })], spacing: spacing(0, 20) }),
                  new Paragraph({ children: [new TextRun({ text: "Địa chỉ: 123 Nguyễn Trãi, Quận 1, TP.HCM", font: "Arial", size: 20, color: DARK })], spacing: spacing(0, 0) }),
                ]
              }),
              new TableCell({
                width: { size: 4680, type: WidthType.DXA },
                borders: noBorder(),
                shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
                margins: cellMargins(),
                children: [
                  new Paragraph({ children: [new TextRun({ text: "THÔNG TIN BÁO GIÁ", font: "Arial", size: 18, bold: true, color: MUTED })], spacing: spacing(0, 60) }),
                  new Paragraph({ children: [new TextRun({ text: "Số báo giá: ", font: "Arial", size: 20, color: DARK }), new TextRun({ text: "BG-2026-001", font: "Arial", size: 20, bold: true, color: NAVY })], spacing: spacing(0, 20) }),
                  new Paragraph({ children: [new TextRun({ text: "Ngày: ", font: "Arial", size: 20, color: DARK }), new TextRun({ text: "25/05/2026", font: "Arial", size: 20, color: DARK })], spacing: spacing(0, 20) }),
                  new Paragraph({ children: [new TextRun({ text: "Hiệu lực: ", font: "Arial", size: 20, color: DARK }), new TextRun({ text: "30 ngày kể từ ngày báo giá", font: "Arial", size: 20, color: DARK })], spacing: spacing(0, 20) }),
                  new Paragraph({ children: [new TextRun({ text: "NV kinh doanh: ", font: "Arial", size: 20, color: DARK }), new TextRun({ text: "Nguyễn Văn A - 9BizClaw", font: "Arial", size: 20, color: DARK })], spacing: spacing(0, 0) }),
                ]
              })
            ]
          })
        ]
      }),
      new Paragraph({ children: [], spacing: spacing(360, 0) }),

      // ===== SECTION 1: PHẠM VI CÔNG VIỆC =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "1. Phạm vi công việc", font: "Arial", size: 40, bold: true, color: NAVY })], spacing: spacing(360, 200) }),
      new Paragraph({ children: [new TextRun({ text: "9BizClaw cung cấp các dịch vụ sau theo gói Growth (6 tháng):", font: "Arial", size: 22, color: DARK })], spacing: spacing(0, 120) }),
      new Paragraph({ numbering: { reference: "numbered", level: 0 }, children: [new TextRun({ text: "Triển khai AI Agent trên nền tảng Telegram với khả năng tự động hóa quy trình bán hàng", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 60) }),
      new Paragraph({ numbering: { reference: "numbered", level: 0 }, children: [new TextRun({ text: "Kết nối Google Workspace (Sheets, Docs, Drive) để tự động tạo báo cáo hàng tuần", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 60) }),
      new Paragraph({ numbering: { reference: "numbered", level: 0 }, children: [new TextRun({ text: "Tích hợp Zalo Official và Email Marketing để gửi thông báo tự động", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 60) }),
      new Paragraph({ numbering: { reference: "numbered", level: 0 }, children: [new TextRun({ text: "Đào tạo nhân sự sử dụng và vận hành hệ thống (2 buổi online)", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 60) }),
      new Paragraph({ numbering: { reference: "numbered", level: 0 }, children: [new TextRun({ text: "Hỗ trợ kỹ thuật 24/7 qua Telegram và Email", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 0) }),

      // ===== SECTION 2: BẢNG GIÁ =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "2. Chi phí dịch vụ", font: "Arial", size: 40, bold: true, color: NAVY })], spacing: spacing(360, 200) }),
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [4200, 2000, 1560, 1600],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              hdrCell("Mô tả dịch vụ", 4200, NAVY),
              hdrCell("Đơn vị", 2000, NAVY),
              hdrCell("Đơn giá (VND)", 1560, NAVY),
              hdrCell("Thành tiền (VND)", 1600, NAVY),
            ]
          }),
          new TableRow({ children: [dataCell("Gói Growth - 6 tháng", 4200), dataCell("1 bộ", 2000, { align: AlignmentType.CENTER }), dataCell("5,990,000", 1560, { align: AlignmentType.RIGHT }), dataCell("35,940,000", 1600, { align: AlignmentType.RIGHT, bold: true, color: NAVY })] }),
          new TableRow({ children: [dataCell("Setup & triển khai ban đầu", 4200, { bg: LIGHT_BG }), dataCell("1 lần", 2000, { align: AlignmentType.CENTER, bg: LIGHT_BG }), dataCell("3,000,000", 1560, { align: AlignmentType.RIGHT, bg: LIGHT_BG }), dataCell("3,000,000", 1600, { align: AlignmentType.RIGHT, bold: true, color: NAVY, bg: LIGHT_BG })] }),
          new TableRow({ children: [dataCell("Đào tạo nhân sự (2 buổi)", 4200), dataCell("2 buổi", 2000, { align: AlignmentType.CENTER }), dataCell("Miễn phí", 1560, { align: AlignmentType.CENTER }), dataCell("0", 1600, { align: AlignmentType.RIGHT })] }),
          new TableRow({ children: [dataCell("API Zalo Official + Email Integration", 4200, { bg: LIGHT_BG }), dataCell("6 tháng", 2000, { align: AlignmentType.CENTER, bg: LIGHT_BG }), dataCell("Miễn phí", 1560, { align: AlignmentType.CENTER, bg: LIGHT_BG }), dataCell("0", 1600, { align: AlignmentType.RIGHT, bg: LIGHT_BG })] }),
          new TableRow({ children: [
            new TableCell({ width: { size: 4200, type: WidthType.DXA }, borders: cellBorders(BORDER_COLOR), shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: cellMargins(), children: [new Paragraph({ children: [new TextRun({ text: "TỔNG CỘNG (chưa VAT)", font: "Arial", size: 20, bold: true, color: WHITE })], alignment: AlignmentType.LEFT, spacing: spacing(0, 0) })] }),
            new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: cellBorders(BORDER_COLOR), shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: cellMargins(), children: [new Paragraph({ children: [new TextRun({ text: "", font: "Arial", size: 20 })], alignment: AlignmentType.CENTER, spacing: spacing(0, 0) })] }),
            new TableCell({ width: { size: 1560, type: WidthType.DXA }, borders: cellBorders(BORDER_COLOR), shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: cellMargins(), children: [new Paragraph({ children: [new TextRun({ text: "", font: "Arial", size: 20 })], alignment: AlignmentType.CENTER, spacing: spacing(0, 0) })] }),
            new TableCell({ width: { size: 1600, type: WidthType.DXA }, borders: cellBorders(BORDER_COLOR), shading: { fill: ACCENT, type: ShadingType.CLEAR }, margins: cellMargins(), children: [new Paragraph({ children: [new TextRun({ text: "38,940,000", font: "Arial", size: 20, bold: true, color: DARK })], alignment: AlignmentType.RIGHT, spacing: spacing(0, 0) })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ width: { size: 4200, type: WidthType.DXA }, columnSpan: 3, borders: cellBorders(BORDER_COLOR), shading: { fill: LIGHT_BG, type: ShadingType.CLEAR }, margins: cellMargins(), children: [new Paragraph({ children: [new TextRun({ text: "VAT 10%", font: "Arial", size: 20, color: DARK })], alignment: AlignmentType.RIGHT, spacing: spacing(0, 0) })] }),
            new TableCell({ width: { size: 1600, type: WidthType.DXA }, borders: cellBorders(BORDER_COLOR), shading: { fill: LIGHT_BG, type: ShadingType.CLEAR }, margins: cellMargins(), children: [new Paragraph({ children: [new TextRun({ text: "3,894,000", font: "Arial", size: 20, bold: true, color: NAVY })], alignment: AlignmentType.RIGHT, spacing: spacing(0, 0) })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ width: { size: 4200, type: WidthType.DXA }, columnSpan: 3, borders: cellBorders(BORDER_COLOR), shading: { fill: NAVY, type: ShadingType.CLEAR }, margins: cellMargins(), children: [new Paragraph({ children: [new TextRun({ text: "TỔNG THANH TOÁN (đã VAT)", font: "Arial", size: 22, bold: true, color: WHITE })], alignment: AlignmentType.RIGHT, spacing: spacing(0, 0) })] }),
            new TableCell({ width: { size: 1600, type: WidthType.DXA }, borders: cellBorders(BORDER_COLOR), shading: { fill: ACCENT, type: ShadingType.CLEAR }, margins: cellMargins(), children: [new Paragraph({ children: [new TextRun({ text: "42,834,000", font: "Arial", size: 22, bold: true, color: DARK })], alignment: AlignmentType.RIGHT, spacing: spacing(0, 0) })] }),
          ]}),
        ]
      }),
      new Paragraph({ children: [], spacing: spacing(200, 0) }),

      // ===== SECTION 3: ĐIỀU KHOẢN =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "3. Điều khoản thanh toán", font: "Arial", size: 40, bold: true, color: NAVY })], spacing: spacing(360, 200) }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Thanh toán trước 50% khi ký hợp đồng, 50% còn lại sau khi triển khai xong (dự kiến 5 ngày làm việc)", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 60) }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Thanh toán qua chuyển khoản ngân hàng theo thông tin tài khoản trong hợp đồng", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 60) }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Báo giá có hiệu lực trong 30 ngày kể từ ngày phát hành", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 0) }),

      // ===== SECTION 4: CAM KẾT =====
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "4. Cam kết của 9BizClaw", font: "Arial", size: 40, bold: true, color: NAVY })], spacing: spacing(360, 200) }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Hệ thống hoạt động 24/7 với uptime cam kết 99.5%/tháng", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 60) }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Dữ liệu khách hàng được bảo mật theo tiêu chuẩn ISO 27001", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 60) }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Bảo hành sửa lỗi miễn phí trong suốt thời gian hợp đồng", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 60) }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: "Cập nhật tính năng mới và nâng cấp AI Agent định kỳ", font: "Arial", size: 22, color: DARK })], spacing: spacing(60, 0) }),

      // ===== PAGE BREAK + SIGNATURE =====
      new Paragraph({ children: [new PageBreak()], spacing: spacing(0, 0) }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "5. Xác nhận đồng ý", font: "Arial", size: 40, bold: true, color: NAVY })], spacing: spacing(360, 200) }),
      new Paragraph({ children: [new TextRun({ text: "Khi xác nhận đồng ý báo giá này, quý khách đồng ý với các điều khoản và điều kiện đã nêu trên.", font: "Arial", size: 22, color: DARK })], spacing: spacing(0, 300) }),

      // Signature table
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 4680, type: WidthType.DXA },
                borders: noBorder(),
                children: [
                  new Paragraph({ children: [new TextRun({ text: "ĐẠI DIỆN KHÁCH HÀNG", font: "Arial", size: 18, bold: true, color: MUTED })], alignment: AlignmentType.CENTER, spacing: spacing(0, 400) }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký và ghi rõ họ tên)", font: "Arial", size: 18, italic: true, color: MUTED })], alignment: AlignmentType.CENTER, spacing: spacing(0, 80) }),
                  new Paragraph({ children: [new TextRun({ text: "", font: "Arial", size: 22 })], alignment: AlignmentType.CENTER, spacing: spacing(0, 0) }),
                  new Paragraph({ children: [new TextRun({ text: "", font: "Arial", size: 22 })], alignment: AlignmentType.CENTER, spacing: spacing(0, 80) }),
                  new Paragraph({ children: [new TextRun({ text: "Nguyễn Văn Minh", font: "Arial", size: 22, bold: true, color: DARK })], alignment: AlignmentType.CENTER, spacing: spacing(0, 0) }),
                ]
              }),
              new TableCell({
                width: { size: 4680, type: WidthType.DXA },
                borders: noBorder(),
                children: [
                  new Paragraph({ children: [new TextRun({ text: "ĐẠI DIỆN 9BIZCLAW", font: "Arial", size: 18, bold: true, color: MUTED })], alignment: AlignmentType.CENTER, spacing: spacing(0, 400) }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký và ghi rõ họ tên)", font: "Arial", size: 18, italic: true, color: MUTED })], alignment: AlignmentType.CENTER, spacing: spacing(0, 80) }),
                  new Paragraph({ children: [new TextRun({ text: "", font: "Arial", size: 22 })], alignment: AlignmentType.CENTER, spacing: spacing(0, 0) }),
                  new Paragraph({ children: [new TextRun({ text: "", font: "Arial", size: 22 })], alignment: AlignmentType.CENTER, spacing: spacing(0, 80) }),
                  new Paragraph({ children: [new TextRun({ text: "Nguyễn Văn A", font: "Arial", size: 22, bold: true, color: DARK })], alignment: AlignmentType.CENTER, spacing: spacing(0, 0) }),
                ]
              })
            ]
          })
        ]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("C:\\Users\\buitu\\Desktop\\claw\\scripts\\demo-bao-gia-anthropic.docx", buf);
  console.log("Done: demo-bao-gia-anthropic.docx");
}).catch(e => { console.error(e); process.exit(1); });
