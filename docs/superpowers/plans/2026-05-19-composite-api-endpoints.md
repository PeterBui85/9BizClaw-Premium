# Composite API Endpoints + Gap Capabilities Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 3 composite endpoints (sheets, zalo-crm, report) + 3 gap capability modules (orders, inventory, leave) + fix broken skills + add missing triggers. All curl-testable before bot uses them.

**Architecture:** Each new capability is a standalone module (`electron/lib/<name>.js`) that exports handler functions. Routes registered in `cron-api.js`. Composite endpoints call existing `googleApi.*` functions internally. Data stored in workspace JSON files with `withWriteLock` for concurrency safety.

**Tech Stack:** Node.js, existing `gogExec()` for Google API, `fs` for workspace JSON, existing `withWriteLock` pattern from cron.js.

---

## Task 1: Order Manager Module

**Files:**
- Create: `electron/lib/order-manager.js`
- Modify: `electron/lib/cron-api.js` — register 5 routes

- [ ] **Step 1: Create `order-manager.js`**

```js
'use strict';
const fs = require('fs');
const path = require('path');

let _getWorkspace;
function init(deps) { _getWorkspace = deps.getWorkspace; }

function _ordersPath() {
  const ws = _getWorkspace();
  return ws ? path.join(ws, 'orders.json') : null;
}

function _readOrders() {
  const p = _ordersPath();
  if (!p || !fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}

function _writeOrders(orders) {
  const p = _ordersPath();
  if (!p) throw new Error('workspace not available');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(orders, null, 2) + '\n', 'utf-8');
}

function _nextId(orders) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const todayOrders = orders.filter(o => o.id && o.id.startsWith('ORD-' + today));
  const seq = String(todayOrders.length + 1).padStart(3, '0');
  return 'ORD-' + today + '-' + seq;
}

function createOrder({ customer, items, note, total }) {
  if (!customer || !items || !items.length) throw new Error('customer and items required');
  const orders = _readOrders();
  const order = {
    id: _nextId(orders),
    customer,
    items: items.map(i => ({
      name: i.name || '',
      qty: Number(i.qty) || 1,
      price: Number(i.price) || 0,
    })),
    total: total != null ? Number(total) : items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.price) || 0), 0),
    status: 'new',
    note: note || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  orders.push(order);
  _writeOrders(orders);
  return order;
}

function listOrders({ status, from, to, limit } = {}) {
  let orders = _readOrders();
  if (status) orders = orders.filter(o => o.status === status);
  if (from) orders = orders.filter(o => o.createdAt >= from);
  if (to) orders = orders.filter(o => o.createdAt <= to + 'T23:59:59Z');
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (limit) orders = orders.slice(0, Number(limit));
  return orders;
}

function updateOrder({ orderId, status, note, payment }) {
  if (!orderId) throw new Error('orderId required');
  const orders = _readOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order) throw new Error('order not found: ' + orderId);
  if (status) order.status = status;
  if (note !== undefined) order.note = note;
  if (payment !== undefined) order.payment = payment;
  order.updatedAt = new Date().toISOString();
  _writeOrders(orders);
  return order;
}

function getOrderStatus({ orderId }) {
  if (!orderId) throw new Error('orderId required');
  const orders = _readOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order) return { found: false };
  return { found: true, ...order };
}

function orderSummary({ from, to }) {
  const orders = listOrders({ from, to });
  const byStatus = {};
  let totalRevenue = 0;
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (o.status === 'paid' || o.status === 'delivered' || o.status === 'completed') {
      totalRevenue += o.total || 0;
    }
  }
  return { total: orders.length, byStatus, totalRevenue, from, to };
}

module.exports = { init, createOrder, listOrders, updateOrder, getOrderStatus, orderSummary };
```

- [ ] **Step 2: Register order routes in `cron-api.js`**

After the existing route handlers, add:

```js
// === Order Management ===
const orderManager = require('./order-manager');
orderManager.init({ getWorkspace });

} else if (urlPath === '/api/order/create') {
  if (req.method !== 'POST') return jsonResp(res, 405, { error: 'POST required' });
  try {
    const result = orderManager.createOrder(params);
    return jsonResp(res, 200, result);
  } catch (e) { return jsonResp(res, 400, { error: e.message }); }

} else if (urlPath === '/api/order/list') {
  const result = orderManager.listOrders(params);
  return jsonResp(res, 200, { orders: result, count: result.length });

} else if (urlPath === '/api/order/update') {
  if (req.method !== 'POST') return jsonResp(res, 405, { error: 'POST required' });
  try {
    const result = orderManager.updateOrder(params);
    return jsonResp(res, 200, result);
  } catch (e) { return jsonResp(res, 400, { error: e.message }); }

} else if (urlPath === '/api/order/status') {
  const result = orderManager.getOrderStatus(params);
  return jsonResp(res, 200, result);

} else if (urlPath === '/api/order/summary') {
  const result = orderManager.orderSummary(params);
  return jsonResp(res, 200, result);
}
```

- [ ] **Step 3: Verify**

```bash
curl -X POST http://127.0.0.1:20200/api/order/create -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"customer":"Test Corp","items":[{"name":"Widget","qty":10,"price":50000}]}'
```

---

## Task 2: Inventory Manager Module

**Files:**
- Create: `electron/lib/inventory-manager.js`
- Modify: `electron/lib/cron-api.js` — register 4 routes

- [ ] **Step 1: Create `inventory-manager.js`**

Same pattern as order-manager. Functions: `adjustStock({sku, name, qty, type, note})`, `checkStock({sku})`, `getAlerts()`, `setMinQty({sku, minQty})`. Data in `workspace/inventory.json`. Stock adjustment creates an entry with `type: "in"|"out"` and updates the running total. Alerts return items where `currentQty < minQty`.

- [ ] **Step 2: Register inventory routes in `cron-api.js`**

```
POST /api/inventory/adjust  — adjust stock (in/out)
GET  /api/inventory/check   — check stock (single SKU or all)
GET  /api/inventory/alerts  — items below min threshold
POST /api/inventory/set-min — set minimum qty threshold
```

- [ ] **Step 3: Verify with curl**

---

## Task 3: Leave Manager Module

**Files:**
- Create: `electron/lib/leave-manager.js`
- Modify: `electron/lib/cron-api.js` — register 4 routes

- [ ] **Step 1: Create `leave-manager.js`**

Same pattern. Functions: `requestLeave({employee, type, from, to, note})`, `listLeave({month, employee})`, `approveLeave({requestId, approvedBy})`, `leaveSummary({month})`. Data in `workspace/leave-requests.json`. Auto-ID: `LV-YYYYMMDD-NNN`.

- [ ] **Step 2: Register leave routes in `cron-api.js`**

```
POST /api/leave/request  — create leave request
GET  /api/leave/list     — list by month/employee
POST /api/leave/approve  — approve a request
GET  /api/leave/summary  — monthly summary
```

- [ ] **Step 3: Verify with curl**

---

## Task 4: Composite `sheets/create-formatted` Endpoint

**Files:**
- Modify: `electron/lib/google-routes.js` — add handler
- Modify: `electron/lib/google-api.js` — use existing functions

- [ ] **Step 1: Add route handler in `google-routes.js`**

After the existing `/sheets/format` handler:

```js
if (urlPath === '/sheets/create-formatted') {
  if (blockZaloMutation('Google Sheets create-formatted')) return;
  const { title, headers, data, style, textColumns, parent } = params;
  if (!title || !headers) return jsonResp(res, 400, { error: 'title and headers required' });

  try {
    // Step 1: Create sheet
    const created = await googleApi.createSheet(title, null, parent);
    const sid = typeof created === 'string' ? created : (created.spreadsheetId || JSON.parse(created).spreadsheetId);

    // Step 2: Set text columns BEFORE writing data (preserves leading zeros)
    if (textColumns && textColumns.length) {
      for (const col of textColumns) {
        await googleApi.numberFormatSheet(sid, 'Sheet1!' + col + ':' + col, 'TEXT');
      }
    }

    // Step 3: Write data
    const allRows = [headers, ...(data || [])];
    const lastCol = String.fromCharCode(64 + headers.length);
    const range = 'Sheet1!A1:' + lastCol + allRows.length;
    await googleApi.updateSheet(sid, range, allRows);

    // Step 4: Apply style
    const s = style || 'crm';
    if (s === 'crm' || s === 'report') {
      // Freeze header
      await googleApi.freezeSheet(sid, 1);
      // Header style
      const headerRange = 'Sheet1!A1:' + lastCol + '1';
      if (s === 'crm') {
        await googleApi.formatSheet(sid, headerRange,
          { textFormat: { bold: true, foregroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } } }, backgroundColor: { red: 0.1, green: 0.21, blue: 0.36 } },
          'textFormat.bold,textFormat.foregroundColorStyle,backgroundColor');
      } else {
        await googleApi.formatSheet(sid, headerRange,
          { textFormat: { bold: true }, backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 } },
          'textFormat.bold,backgroundColor');
      }
      // Wrap all cells
      const fullRange = 'Sheet1!A1:' + lastCol + '100';
      await googleApi.formatSheet(sid, fullRange,
        { wrapStrategy: 'WRAP' }, 'wrapStrategy');
    }

    const url = 'https://docs.google.com/spreadsheets/d/' + sid + '/edit';
    return jsonResp(res, 200, { spreadsheetId: sid, spreadsheetUrl: url, rowsWritten: (data || []).length });
  } catch (e) {
    return jsonResp(res, 500, { error: 'create-formatted failed: ' + e.message });
  }
}
```

- [ ] **Step 2: Verify with curl**

---

## Task 5: Composite `zalo-crm/export` Endpoint

**Files:**
- Modify: `electron/lib/cron-api.js` — add handler

- [ ] **Step 1: Add handler in `cron-api.js`**

```js
} else if (urlPath === '/api/zalo-crm/export') {
  if (req.method !== 'POST') return jsonResp(res, 405, { error: 'POST required' });
  try {
    const ws = getWorkspace();
    if (!ws) return jsonResp(res, 500, { error: 'workspace not available' });

    // 1. Read memory files
    const memDir = path.join(ws, 'memory', 'zalo-users');
    if (!fs.existsSync(memDir)) return jsonResp(res, 200, { customersExported: 0, customers: [] });
    const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md'));

    // Filter by date if specified
    const dateRange = params.dateRange || 'all';
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    let filtered = files;
    if (dateRange === 'today') {
      filtered = files.filter(f => {
        try {
          const stat = fs.statSync(path.join(memDir, f));
          return stat.mtime.toISOString().slice(0, 10) === todayStr;
        } catch { return false; }
      });
    }

    // 2. Read friend list for phone numbers
    const friendsPath = path.join(getZcaCacheDir(), 'friends.json');
    let friends = [];
    try { friends = JSON.parse(fs.readFileSync(friendsPath, 'utf-8')); } catch {}
    const phoneMap = {};
    for (const f of friends) {
      const uid = String(f.userId || f.userKey || '');
      if (uid && f.phoneNumber) {
        let phone = String(f.phoneNumber).replace(/\D/g, '');
        if (phone.startsWith('84') && phone.length >= 11) phone = '0' + phone.slice(2);
        phoneMap[uid] = phone;
      }
    }

    // 3. Extract customer data
    const customers = [];
    for (const file of filtered) {
      try {
        const senderId = file.replace('.md', '');
        const content = fs.readFileSync(path.join(memDir, file), 'utf-8');
        const lines = content.split('\n');
        const nameLine = lines.find(l => l.startsWith('# '));
        const name = nameLine ? nameLine.slice(2).trim() : senderId;
        const phone = phoneMap[senderId] || '';
        // Get latest section summary
        const sections = content.split(/\n## /);
        const latest = sections.length > 1 ? sections[sections.length - 1].slice(0, 200).replace(/\n/g, ' ').trim() : '';
        const isPending = /chờ|pending|hẹn|liên hệ lại/i.test(content);
        customers.push({
          senderId, name, phone,
          summary: latest.slice(0, 150),
          status: isPending ? 'Đang xử lý' : 'Mới',
          date: todayStr,
        });
      } catch {}
    }

    // 4. Create formatted sheet if Google connected
    let sheetResult = null;
    if (customers.length > 0) {
      try {
        const { handleGoogleRoute } = require('./google-routes');
        const headers = ['Ngày', 'Tên khách', 'SĐT', 'Nội dung hỏi', 'Trạng thái', 'Nhân viên follow-up', 'Ghi chú', 'Hẹn liên hệ lại'];
        const data = customers.map(c => [c.date, c.name, c.phone, c.summary, c.status, '', '', '']);
        const title = params.title || ('Theo dõi khách Zalo ' + todayStr);
        const sid = params.spreadsheetId;

        // Use the composite endpoint internally
        if (sid) {
          // Append to existing sheet
          const googleApi = require('./google-api');
          await googleApi.appendSheet(sid, 'Sheet1!A2:H2', data);
          sheetResult = { spreadsheetId: sid, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + sid + '/edit', rowsWritten: data.length };
        } else {
          // Create new formatted sheet via internal call
          const googleApi = require('./google-api');
          const created = await googleApi.createSheet(title);
          const newSid = typeof created === 'string' ? created : (created.spreadsheetId || JSON.parse(created).spreadsheetId);
          await googleApi.numberFormatSheet(newSid, 'Sheet1!C:C', 'TEXT');
          const lastCol = String.fromCharCode(64 + headers.length);
          await googleApi.updateSheet(newSid, 'Sheet1!A1:' + lastCol + (data.length + 1), [headers, ...data]);
          await googleApi.freezeSheet(newSid, 1);
          await googleApi.formatSheet(newSid, 'Sheet1!A1:' + lastCol + '1',
            { textFormat: { bold: true, foregroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } } }, backgroundColor: { red: 0.1, green: 0.21, blue: 0.36 } },
            'textFormat.bold,textFormat.foregroundColorStyle,backgroundColor');
          await googleApi.formatSheet(newSid, 'Sheet1!A1:' + lastCol + '100', { wrapStrategy: 'WRAP' }, 'wrapStrategy');
          sheetResult = { spreadsheetId: newSid, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + newSid + '/edit', rowsWritten: data.length };
        }
      } catch (e) {
        sheetResult = { error: 'Sheet creation failed: ' + e.message + '. Google Workspace có thể chưa kết nối.' };
      }
    }

    return jsonResp(res, 200, {
      customersExported: customers.length,
      customers: customers.map(c => ({ name: c.name, phone: c.phone, summary: c.summary })),
      sheet: sheetResult,
    });
  } catch (e) {
    return jsonResp(res, 500, { error: 'zalo-crm export failed: ' + e.message });
  }
}
```

- [ ] **Step 2: Verify with curl**

---

## Task 6: Composite `report/daily` Endpoint

**Files:**
- Modify: `electron/lib/cron-api.js` — add handler

- [ ] **Step 1: Add handler**

Reads from: `so-sach.md` (revenue), `cong-no.md` (receivables), `memory/zalo-users/` (customer count), `cron-runs.jsonl` (cron stats), `follow-up-queue.json` (pending follow-ups). Returns aggregated JSON.

```js
} else if (urlPath === '/api/report/daily') {
  try {
    const ws = getWorkspace();
    if (!ws) return jsonResp(res, 500, { error: 'workspace not available' });
    const date = params.date || new Date().toISOString().slice(0, 10);
    const report = { date, revenue: {}, customers: {}, crons: {}, highlights: [], sources: [] };

    // Revenue from so-sach.md
    try {
      const ssPath = path.join(ws, 'so-sach.md');
      if (fs.existsSync(ssPath)) {
        const content = fs.readFileSync(ssPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.includes(date));
        let income = 0, expense = 0;
        for (const l of lines) {
          const amountMatch = l.match(/(\d[\d,.]*)/);
          const amount = amountMatch ? parseInt(amountMatch[1].replace(/[,.]/g, ''), 10) : 0;
          if (/thu|income|bán|revenue/i.test(l)) income += amount;
          if (/chi|expense|mua|cost/i.test(l)) expense += amount;
        }
        report.revenue = { income, expense, net: income - expense };
        report.sources.push('so-sach.md');
      }
    } catch {}

    // Customer count from memory
    try {
      const memDir = path.join(ws, 'memory', 'zalo-users');
      if (fs.existsSync(memDir)) {
        const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md'));
        const newToday = files.filter(f => {
          try { return fs.statSync(path.join(memDir, f)).mtime.toISOString().slice(0, 10) === date; } catch { return false; }
        }).length;
        report.customers = { total: files.length, newToday };
        report.sources.push('memory/zalo-users/');
      }
    } catch {}

    // Cron stats from journal
    try {
      const cronLog = path.join(ws, 'logs', 'cron-runs.jsonl');
      if (fs.existsSync(cronLog)) {
        const content = fs.readFileSync(cronLog, 'utf-8');
        const lines = content.split('\n').filter(l => l.includes(date));
        let fired = 0, failed = 0;
        for (const l of lines) {
          try {
            const entry = JSON.parse(l);
            if (entry.phase === 'ok') fired++;
            if (entry.phase === 'fail') failed++;
          } catch {}
        }
        report.crons = { fired, failed };
        report.sources.push('cron-runs.jsonl');
      }
    } catch {}

    // Pending follow-ups
    try {
      const fupPath = path.join(ws, 'follow-up-queue.json');
      if (fs.existsSync(fupPath)) {
        const queue = JSON.parse(fs.readFileSync(fupPath, 'utf-8'));
        report.customers.pendingFollowUp = Array.isArray(queue) ? queue.length : 0;
        report.sources.push('follow-up-queue.json');
      }
    } catch {}

    // Receivables from cong-no.md
    try {
      const cnPath = path.join(ws, 'cong-no.md');
      if (fs.existsSync(cnPath)) {
        const content = fs.readFileSync(cnPath, 'utf-8');
        const unpaidLines = content.split('\n').filter(l => /chưa|nợ|pending|unpaid/i.test(l));
        report.receivables = { unpaidCount: unpaidLines.length };
        report.sources.push('cong-no.md');
      }
    } catch {}

    return jsonResp(res, 200, report);
  } catch (e) {
    return jsonResp(res, 500, { error: 'daily report failed: ' + e.message });
  }
}
```

- [ ] **Step 2: Verify with curl**

---

## Task 7: Fix broken skills + add missing triggers

**Files:**
- Modify: `skills/operations/so-sach-don-gian.md`
- Modify: `skills/operations/cong-no.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Fix `so-sach-don-gian.md`** — add exact workspace API write calls
- [ ] **Step 2: Fix `cong-no.md`** — same fix
- [ ] **Step 3: Add 10 missing Capability Router triggers to AGENTS.md**

---

## Task 8: Rewrite all 38 skill files

**Files:**
- Modify: all 38 files in `skills/operations/`, `skills/marketing/`, `skills/*.md`

Guidelines:
- **API-heavy skills (17):** Shrink to 20-30 lines. Reference composite endpoints where available. Keep exact `web_fetch` calls but fewer of them.
- **Behavioral skills (14):** Keep as markdown. Improve thin ones with concrete examples. Ensure Vietnamese diacritics throughout.
- **Content-template skills (7):** Keep templates. Fix broken file paths. Ensure workspace API references are correct.

- [ ] **Step 1: Rewrite API-heavy skills** (one by one)
- [ ] **Step 2: Improve behavioral skills**
- [ ] **Step 3: Fix content-template skills**

---

## Task 9: Smoke tests + system map + build

- [ ] **Step 1: Add smoke tests** for order-manager, inventory-manager, leave-manager
- [ ] **Step 2: Regenerate system map**
- [ ] **Step 3: Run full smoke**
- [ ] **Step 4: Build EXE**
- [ ] **Step 5: Commit + push + tag**
