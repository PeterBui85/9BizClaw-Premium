#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const XLSX = require('xlsx');
const zaloMenu = require('../lib/zalo-menu');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-menu-dry-run-'));

function fail(message) {
  console.error('[zalo-menu-dry-run] FAIL ' + message);
  process.exit(1);
}

try {
  zaloMenu.init({ getWorkspace: () => tmpRoot });

  const catalog = zaloMenu.loadCatalog();
  assert.ok(Array.isArray(catalog.items), 'catalog items should be an array');
  assert.ok(catalog.items.some(item => item.slug === 'premium'), 'default catalog should include premium');

  const premium = zaloMenu.dryRunCommand('/menu premium');
  assert.equal(premium.handled, true, '/menu premium should be handled');
  assert.match(premium.text, /\*\*9BizClaw Premium\*\*/);
  assert.doesNotMatch(premium.text, /SePay|QR|chuyển khoản|số tài khoản/i, 'v1 output must exclude payment language');

  const quote = zaloMenu.dryRunCommand('/baogia premium');
  assert.equal(quote.handled, true, '/baogia premium should be handled');
  assert.match(quote.text, /Bảng giá/i);

  const natural = zaloMenu.dryRunCommand('menu premium');
  assert.equal(natural.handled, false, 'manual text without slash should not dispatch');

  const duplicate = zaloMenu.validateCatalog({
    items: [
      { slug: 'premium', title: 'A', description: 'A', priceLabel: 'A', enabled: true },
      { slug: 'premium', title: 'B', description: 'B', priceLabel: 'B', enabled: true },
    ],
  });
  assert.equal(duplicate.ok, false, 'duplicate slugs should fail validation');

  const wb = XLSX.utils.book_new();
  const rows = [
    ['slug', 'category', 'title', 'subtitle', 'description', 'priceLabel', 'ctaLabel', 'ctaCommand', 'sortOrder', 'enabled'],
    ['trial', 'Demo', 'Gói dùng thử', 'Test import', 'Mô tả import', '0đ', 'Xem premium', '/menu premium', 1, 'true'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Menu');
  const importPath = path.join(tmpRoot, 'menu-import.xlsx');
  XLSX.writeFile(wb, importPath);

  const preview = zaloMenu.previewImport(importPath);
  assert.equal(preview.ok, true, 'xlsx preview should be valid');
  assert.equal(preview.items.length, 1);
  assert.equal(preview.items[0].slug, 'trial');

  const applied = zaloMenu.applyImport(importPath);
  assert.equal(applied.ok, true, 'xlsx import should apply');
  assert.equal(zaloMenu.loadCatalog().items[0].slug, 'trial');

  console.log('[zalo-menu-dry-run] PASS');
} catch (e) {
  fail(e && e.stack ? e.stack : String(e));
} finally {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
}
