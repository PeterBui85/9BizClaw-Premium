'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { writeJsonAtomic } = require('./util');

let getWorkspaceFn = () => {
  const { getWorkspace } = require('./workspace');
  return getWorkspace();
};

const TEMPLATE_SHEET = 'Menu';
const README_SHEET = 'Huong dan';

const DEFAULT_ITEMS = [
  {
    slug: 'starter',
    category: 'Gói nền tảng',
    title: '9BizClaw Starter',
    subtitle: 'Bắt đầu tự động hóa bán hàng và CSKH',
    description: 'Quản lý chat đa kênh, mẫu trả lời bán hàng, lịch nhắc cơ bản và kho tri thức doanh nghiệp.',
    priceLabel: 'Miễn phí khi cài đặt lần đầu',
    ctaLabel: 'Gõ /menu premium để xem gói nâng cấp',
    ctaCommand: '/menu premium',
    sortOrder: 10,
    enabled: true,
  },
  {
    slug: 'premium',
    category: 'Gói vận hành',
    title: '9BizClaw Premium',
    subtitle: 'Dành cho CEO muốn có trợ lý AI vận hành hằng ngày',
    description: 'Bao gồm Zalo/Facebook/Telegram, quản lý khách hàng, tự động hóa lịch nội dung, tài liệu doanh nghiệp và báo cáo vận hành.',
    priceLabel: 'Giá niêm yết: 24 triệu. Giá mua sớm: 12 triệu.',
    ctaLabel: 'Gõ /baogia premium để xem bảng giá',
    ctaCommand: '/baogia premium',
    sortOrder: 20,
    enabled: true,
  },
  {
    slug: 'signature',
    category: 'Gói triển khai riêng',
    title: '9BizClaw Signature',
    subtitle: 'Thiết kế quy trình riêng theo ngành và đội ngũ',
    description: 'Tư vấn workflow, dựng bộ lệnh nội bộ, chuẩn hóa dữ liệu, đào tạo đội ngũ và bàn giao quy trình vận hành.',
    priceLabel: 'Báo giá theo phạm vi triển khai',
    ctaLabel: 'Liên hệ tư vấn để chốt phạm vi',
    ctaCommand: '',
    sortOrder: 30,
    enabled: true,
  },
];

function init(opts = {}) {
  if (typeof opts.getWorkspace === 'function') getWorkspaceFn = opts.getWorkspace;
}

function getMenuDir() {
  const ws = getWorkspaceFn();
  if (!ws) throw new Error('workspace not found');
  return path.join(ws, 'data', 'zalo-menu');
}

function getCatalogPath() {
  return path.join(getMenuDir(), 'catalog.json');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultCatalog() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: clone(DEFAULT_ITEMS),
  };
}

function stripAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function slugify(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function normalizeBool(value, defaultValue = true) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return defaultValue;
  const s = stripAccents(value).toLowerCase().trim();
  if (['0', 'false', 'no', 'n', 'off', 'tat', 'khong'].includes(s)) return false;
  if (['1', 'true', 'yes', 'y', 'on', 'bat', 'co'].includes(s)) return true;
  return defaultValue;
}

function normalizeItem(raw, index = 0) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const title = String(source.title || '').trim();
  const slug = slugify(source.slug || title);
  return {
    slug,
    category: String(source.category || '').trim(),
    title,
    subtitle: String(source.subtitle || '').trim(),
    description: String(source.description || '').trim(),
    priceLabel: String(source.priceLabel || '').trim(),
    ctaLabel: String(source.ctaLabel || '').trim(),
    ctaCommand: String(source.ctaCommand || '').trim(),
    sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : index + 1,
    enabled: normalizeBool(source.enabled, true),
  };
}

function validateCatalog(input) {
  const errors = [];
  const warnings = [];
  const catalog = {
    version: Number(input && input.version) || 1,
    updatedAt: new Date().toISOString(),
    items: [],
  };
  const items = Array.isArray(input?.items) ? input.items : [];
  const seen = new Set();
  items.forEach((raw, index) => {
    const item = normalizeItem(raw, index);
    const label = `Dòng ${index + 1}`;
    if (!item.slug) errors.push(`${label}: thiếu slug hoặc title để tạo slug`);
    if (!item.title) errors.push(`${label}: thiếu title`);
    if (!item.description) warnings.push(`${label}: thiếu description`);
    if (!item.priceLabel) warnings.push(`${label}: thiếu priceLabel`);
    if (item.slug && seen.has(item.slug)) errors.push(`${label}: slug bị trùng (${item.slug})`);
    if (item.slug) seen.add(item.slug);
    catalog.items.push(item);
  });
  if (catalog.items.length === 0) errors.push('Catalog phải có ít nhất 1 dòng menu');
  catalog.items.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, 'vi');
  });
  return { ok: errors.length === 0, errors, warnings, catalog };
}

function loadCatalog() {
  const filePath = getCatalogPath();
  if (!fs.existsSync(filePath)) {
    const seed = defaultCatalog();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeJsonAtomic(filePath, seed);
    return seed;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const checked = validateCatalog(parsed);
  if (!checked.ok) {
    const err = new Error(checked.errors.join('; '));
    err.validation = checked;
    throw err;
  }
  return checked.catalog;
}

function saveCatalog(input) {
  const checked = validateCatalog(input || {});
  if (!checked.ok) return checked;
  writeJsonAtomic(getCatalogPath(), checked.catalog);
  return checked;
}

function activeItems(catalog = loadCatalog()) {
  return (catalog.items || [])
    .filter(item => item.enabled !== false)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.title.localeCompare(b.title, 'vi');
    });
}

function findItem(slug, catalog = loadCatalog()) {
  const normalized = slugify(slug || '');
  return activeItems(catalog).find(item => item.slug === normalized) || null;
}

function stripMenuMarkdown(text) {
  return String(text || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .trim();
}

function renderList(catalog = loadCatalog()) {
  const items = activeItems(catalog);
  const lines = ['**Menu Zalo 9BizClaw**', ''];
  items.forEach((item, index) => {
    lines.push(`**${index + 1}. ${item.title}**`);
    if (item.subtitle) lines.push(item.subtitle);
    if (item.priceLabel) lines.push(`Giá: ${item.priceLabel}`);
    lines.push(`Lệnh: /menu ${item.slug}`);
    lines.push('');
  });
  lines.push('Gõ /menu premium hoặc /baogia premium để xem chi tiết mẫu.');
  return lines.join('\n').trim();
}

function renderDetail(item) {
  const lines = [`**${item.title}**`];
  if (item.subtitle) lines.push(item.subtitle);
  if (item.category) lines.push(`Nhóm: ${item.category}`);
  lines.push('');
  if (item.description) lines.push(item.description);
  if (item.priceLabel) {
    lines.push('');
    lines.push(`**Giá**`);
    lines.push(item.priceLabel);
  }
  if (item.ctaLabel) {
    lines.push('');
    lines.push(item.ctaLabel);
  }
  return lines.join('\n').trim();
}

function renderQuote(item) {
  const lines = [`**Bảng giá ${item.title}**`];
  if (item.priceLabel) lines.push(item.priceLabel);
  if (item.subtitle) lines.push(item.subtitle);
  if (item.description) {
    lines.push('');
    lines.push(item.description);
  }
  lines.push('');
  lines.push('Bảng giá này chỉ là thông tin gói, chưa bao gồm bước thanh toán.');
  if (item.ctaLabel) lines.push(item.ctaLabel);
  return lines.join('\n').trim();
}

function dryRunCommand(command, catalog = loadCatalog()) {
  const raw = String(command || '').trim();
  const match = raw.match(/^\/(menu|sp|baogia)(?:\s+([a-z0-9_-]+))?$/i);
  if (!match) {
    return {
      handled: false,
      command: raw,
      text: 'Chưa khớp lệnh menu. Thử /menu, /menu premium hoặc /baogia premium.',
      plainText: 'Chưa khớp lệnh menu. Thử /menu, /menu premium hoặc /baogia premium.',
    };
  }
  const action = match[1].toLowerCase();
  const slug = match[2] || '';
  let text;
  if (!slug && action !== 'baogia') {
    text = renderList(catalog);
  } else {
    const item = findItem(slug || 'premium', catalog);
    if (!item) {
      text = `Không tìm thấy mục "${slug}".\nGõ /menu để xem danh sách đang bật.`;
    } else {
      text = action === 'baogia' ? renderQuote(item) : renderDetail(item);
    }
  }
  return {
    handled: true,
    command: raw,
    text,
    plainText: stripMenuMarkdown(text),
  };
}

function canonicalHeader(header) {
  return stripAccents(header)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const HEADER_MAP = {
  slug: ['slug', 'ma', 'mamenu', 'magoi', 'id'],
  category: ['category', 'nhom', 'nhommenu', 'nhomgoi'],
  title: ['title', 'ten', 'tengoi', 'tenmenu', 'name'],
  subtitle: ['subtitle', 'motangan', 'tagline', 'subtitleline'],
  description: ['description', 'mota', 'chitiet', 'noidung'],
  priceLabel: ['pricelabel', 'gia', 'banggia', 'giaban'],
  ctaLabel: ['ctalabel', 'keugoi', 'hanhdong', 'nutgoi'],
  ctaCommand: ['ctacommand', 'lenh', 'command', 'lenhzalo'],
  sortOrder: ['sortorder', 'thutu', 'sapxep'],
  enabled: ['enabled', 'bat', 'hienthi', 'trangthai'],
};

function normalizeImportRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    const canonical = canonicalHeader(key);
    for (const [target, aliases] of Object.entries(HEADER_MAP)) {
      if (aliases.includes(canonical)) {
        normalized[target] = value;
        break;
      }
    }
  }
  return normalizeItem(normalized);
}

function readImportRows(filePath) {
  if (!filePath || typeof filePath !== 'string') throw new Error('Thiếu file XLSX');
  const ext = path.extname(filePath).toLowerCase();
  if (!['.xlsx', '.xls'].includes(ext)) throw new Error('Chỉ hỗ trợ .xlsx hoặc .xls');
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.includes(TEMPLATE_SHEET) ? TEMPLATE_SHEET : wb.SheetNames[0];
  if (!sheetName) throw new Error('File không có sheet dữ liệu');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false });
  return rows
    .map(normalizeImportRow)
    .filter(item => item.slug || item.title || item.description || item.priceLabel);
}

function previewImport(filePath) {
  try {
    const items = readImportRows(filePath);
    const checked = validateCatalog({ items });
    return { ...checked, items: checked.catalog.items };
  } catch (e) {
    return { ok: false, errors: [e.message || String(e)], warnings: [], items: [] };
  }
}

function applyImport(filePath) {
  const preview = previewImport(filePath);
  if (!preview.ok) return preview;
  return saveCatalog({ items: preview.items });
}

function buildTemplateWorkbookBuffer() {
  const wb = XLSX.utils.book_new();
  const rows = [
    ['slug', 'category', 'title', 'subtitle', 'description', 'priceLabel', 'ctaLabel', 'ctaCommand', 'sortOrder', 'enabled'],
    ...DEFAULT_ITEMS.map(item => [
      item.slug,
      item.category,
      item.title,
      item.subtitle,
      item.description,
      item.priceLabel,
      item.ctaLabel,
      item.ctaCommand,
      item.sortOrder,
      item.enabled ? 'true' : 'false',
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), TEMPLATE_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Hướng dẫn'],
    ['Mỗi dòng là một mục menu Zalo. Giữ slug không dấu, ví dụ premium.'],
    ['Các cột có thể nhập tiếng Việt hoặc tiếng Anh; hệ thống sẽ map các cột phổ biến.'],
    ['V1 chỉ tạo nội dung menu và dry-run. Không cấu hình thanh toán, QR, chuyển khoản hoặc SePay.'],
  ]), README_SHEET);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  init,
  getCatalogPath,
  defaultCatalog,
  loadCatalog,
  saveCatalog,
  validateCatalog,
  dryRunCommand,
  previewImport,
  applyImport,
  buildTemplateWorkbookBuffer,
};
