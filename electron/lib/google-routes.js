'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const googleApi = require('./google-api');

function isHomedirPathSafe(p) {
  if (!p || typeof p !== 'string') return false;
  const fs = require('fs');
  const absolute = path.resolve(p);
  let resolved = absolute;
  try { resolved = fs.realpathSync(absolute); } catch {
    let cursor = absolute;
    const missingParts = [];
    while (!fs.existsSync(cursor)) {
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      missingParts.unshift(path.basename(cursor));
      cursor = parent;
    }
    try { resolved = path.join(fs.realpathSync(cursor), ...missingParts); } catch { resolved = absolute; }
  }
  let home;
  try { home = fs.realpathSync(require('os').homedir()); } catch { home = path.resolve(require('os').homedir()); }
  const blocked = ['.ssh', '.gnupg', '.env', 'credentials', 'credential', 'secret', 'private', 'token', 'auth', 'oauth', 'keyring', 'keychain', '.key'];
  const norm = s => s.toLowerCase().replace(/\\/g, '/');
  const lower = norm(resolved);
  if (blocked.some(b => lower.includes(b))) return false;
  const relative = path.relative(home, resolved);
  if (relative && (relative.startsWith('..') || path.isAbsolute(relative))) return false;
  if (!relative && norm(resolved) !== norm(home)) return false;
  return true;
}

function columnToNumber(col) {
  let n = 0;
  for (const ch of String(col || '').toUpperCase()) {
    if (ch < 'A' || ch > 'Z') return 0;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

function numberToColumn(n) {
  let out = '';
  let x = Number(n) || 0;
  while (x > 0) {
    const mod = (x - 1) % 26;
    out = String.fromCharCode(65 + mod) + out;
    x = Math.floor((x - mod) / 26);
  }
  return out || 'A';
}

function normalizeSheetValues(params) {
  const raw = params.valuesJson !== undefined ? params.valuesJson : params.values;
  if (raw === undefined || raw === null || raw === '') return raw;
  if (Array.isArray(raw)) {
    if (raw.some(row => !Array.isArray(row))) {
      return { ok: false, error: 'values must be a JSON 2D array, for example [["Ngày","Danh mục"],["",""]]' };
    }
    return { ok: true, values: raw };
  }
  if (typeof raw !== 'string') return { ok: true, values: raw };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, values: trimmed };
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed) || parsed.some(row => !Array.isArray(row))) {
        return { ok: false, error: 'values must be a JSON 2D array, for example [["Ngày","Danh mục"],["",""]]' };
      }
      return { ok: true, values: parsed };
    } catch (e) {
      return { ok: false, error: 'values must be valid JSON: ' + e.message };
    }
  }
  return { ok: true, values: raw };
}

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

function isLocalPayloadFileSafe(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const absolute = path.resolve(filePath);
  if (isHomedirPathSafe(absolute)) return true;
  try {
    const resolved = fs.realpathSync(absolute);
    const tmp = fs.realpathSync(os.tmpdir());
    const relative = path.relative(tmp, resolved);
    return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative));
  } catch {
    return false;
  }
}

function readJsonPayloadFile(filePath, label) {
  if (!isLocalPayloadFileSafe(filePath)) {
    return { ok: false, error: `${label} blocked by path validation` };
  }
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 2 * 1024 * 1024) {
      return { ok: false, error: `${label} is too large (max 2MB)` };
    }
    return { ok: true, value: JSON.parse(stripBom(fs.readFileSync(filePath, 'utf8')).trim()) };
  } catch (e) {
    return { ok: false, error: `${label} must be a readable JSON file: ${e.message}` };
  }
}

function parseJsonArrayParam(name, raw, options = {}) {
  if (raw === undefined || raw === null || raw === '') {
    if (options.required) return { ok: false, error: `${name} required` };
    return { ok: true, value: undefined };
  }
  if (Array.isArray(raw)) return { ok: true, value: raw };
  if (typeof raw !== 'string') return { ok: false, error: `${name} must be a JSON array` };
  const trimmed = stripBom(raw).trim();
  if (!trimmed) {
    if (options.required) return { ok: false, error: `${name} required` };
    return { ok: true, value: undefined };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return { ok: false, error: `${name} must be a JSON array` };
    return { ok: true, value: parsed };
  } catch (e) {
    return { ok: false, error: `${name} must be valid JSON: ${e.message}` };
  }
}

function normalizeTextColumnRef(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return { ok: true, value: numberToColumn(value + 1) };
  }
  const text = String(value || '').trim();
  if (!text) return { ok: true, value: null };
  if (/^\d+$/.test(text)) return { ok: true, value: numberToColumn(Number(text) + 1) };
  if (/^[A-Za-z]+$/.test(text)) return { ok: true, value: text.toUpperCase() };
  return { ok: false, error: `invalid text column ${JSON.stringify(value)}` };
}

function normalizeCreateFormattedPayload(params = {}) {
  let merged = { ...params };
  const payloadFile = params.payloadFile || params.payloadPath;
  if (payloadFile) {
    const file = readJsonPayloadFile(payloadFile, 'payloadFile');
    if (!file.ok) return file;
    if (!file.value || typeof file.value !== 'object' || Array.isArray(file.value)) {
      return { ok: false, error: 'payloadFile must contain a JSON object' };
    }
    merged = { ...file.value, ...params };
  }

  const dataFile = merged.dataFile || merged.dataPath;
  if (dataFile) {
    const file = readJsonPayloadFile(dataFile, 'dataFile');
    if (!file.ok) return file;
    merged.data = file.value;
  }

  const title = String(merged.title || '').trim();
  if (!title) return { ok: false, error: 'title required' };

  const headersResult = parseJsonArrayParam('headers', merged.headers, { required: true });
  if (!headersResult.ok) return headersResult;
  if (!headersResult.value.length || headersResult.value.some(cell => Array.isArray(cell))) {
    return { ok: false, error: 'headers must be a non-empty JSON array of cells' };
  }
  const headers = headersResult.value.map(cell => cell === null || cell === undefined ? '' : String(cell));

  const dataResult = parseJsonArrayParam('data', merged.data === undefined ? [] : merged.data);
  if (!dataResult.ok) return dataResult;
  const data = dataResult.value || [];
  if (!Array.isArray(data) || data.some(row => !Array.isArray(row))) {
    return { ok: false, error: 'data must be a JSON 2D array' };
  }

  const textColumnsResult = parseJsonArrayParam('textColumns', merged.textColumns === undefined ? [] : merged.textColumns);
  if (!textColumnsResult.ok) return textColumnsResult;
  const textColumns = [];
  for (const col of textColumnsResult.value || []) {
    const normalized = normalizeTextColumnRef(col);
    if (!normalized.ok) return normalized;
    if (normalized.value) textColumns.push(normalized.value);
  }

  const style = merged.style === 'minimal' ? 'minimal' : (merged.style === 'report' ? 'report' : 'standard');
  return {
    ok: true,
    title,
    headers,
    data,
    style,
    textColumns,
    parent: merged.parent,
  };
}

function fitSheetRangeToValues(range, values) {
  if (!Array.isArray(values) || !values.length) return range;
  const rowCount = values.length;
  const colCount = Math.max(1, ...values.map(row => Array.isArray(row) ? row.length : 1));
  const text = String(range || '');
  const match = text.match(/^(.*!|)(\$?)([A-Z]+)(\$?)(\d+)(?::(\$?)([A-Z]+)(\$?)(\d+))?$/i);
  if (!match) return range;
  const prefix = match[1] || '';
  const startCol = match[3].toUpperCase();
  const startRow = parseInt(match[5], 10);
  const currentEndCol = (match[7] || startCol).toUpperCase();
  const currentEndRow = parseInt(match[9] || match[5], 10);
  const minEndColNumber = columnToNumber(startCol) + colCount - 1;
  const endCol = numberToColumn(Math.max(columnToNumber(currentEndCol), minEndColNumber));
  const endRow = Math.max(currentEndRow, startRow + rowCount - 1);
  return `${prefix}${startCol}${startRow}:${endCol}${endRow}`;
}

module.exports = handleGoogleRoute;
module.exports.isHomedirPathSafe = isHomedirPathSafe;
module.exports.normalizeSheetValues = normalizeSheetValues;
module.exports.fitSheetRangeToValues = fitSheetRangeToValues;
module.exports.normalizeCreateFormattedPayload = normalizeCreateFormattedPayload;
module.exports._test = { normalizeSheetValues, fitSheetRangeToValues, normalizeCreateFormattedPayload };

async function handleGoogleRoute(urlPath, params, req, res, jsonResp) {
  try {
    const sourceChannel = String(req.headers['x-source-channel'] || req.headers['x-9bizclaw-agent-channel'] || '').toLowerCase();
    const isZalo = sourceChannel === 'zalo';
    const blockZaloMutation = (label) => {
      if (!isZalo) return false;
      jsonResp(res, 403, { error: `${label} not allowed from Zalo channel` });
      return true;
    };

    if (urlPath === '/status') {
      return jsonResp(res, 200, await googleApi.authStatus());
    }
    if (urlPath === '/health') {
      return jsonResp(res, 200, await googleApi.serviceHealth());
    }
    if (urlPath === '/calendar/events') {
      const r = await googleApi.listEvents(params.from, params.to, params.calendarId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/calendar/create') {
      if (isZalo) return jsonResp(res, 403, { error: 'Google Calendar create not allowed from Zalo channel' });
      if (!params.summary || !params.start || !params.end) return jsonResp(res, 400, { error: 'summary, start, end required' });
      const r = await googleApi.createEvent(params.summary, params.start, params.end, params.attendees, params.calendarId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/calendar/update') {
      if (isZalo) return jsonResp(res, 403, { error: 'Google Calendar update not allowed from Zalo channel' });
      if (!params.eventId) return jsonResp(res, 400, { error: 'eventId required' });
      const updates = {
        summary: params.summary,
        start: params.start,
        end: params.end,
        description: params.description,
        location: params.location,
        attendees: params.attendees,
        sendUpdates: params.sendUpdates,
      };
      const hasUpdate = Object.entries(updates).some(([key, value]) => key !== 'sendUpdates' && value !== undefined);
      if (!hasUpdate) return jsonResp(res, 400, { error: 'at least one update field required' });
      const r = await googleApi.updateEvent(params.eventId, updates, params.calendarId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/calendar/delete') {
      if (isZalo) return jsonResp(res, 403, { error: 'Google Calendar delete not allowed from Zalo channel' });
      if (!params.eventId) return jsonResp(res, 400, { error: 'eventId required' });
      const r = await googleApi.deleteEvent(params.eventId, params.calendarId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/calendar/freebusy') {
      if (!params.from || !params.to) return jsonResp(res, 400, { error: 'from and to required' });
      const r = await googleApi.getFreeBusy(params.from, params.to);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/calendar/free-slots') {
      if (!params.date) return jsonResp(res, 400, { error: 'date required (YYYY-MM-DD)' });
      const r = await googleApi.getFreeSlots(params.date, params.workStart, params.workEnd, params.slotMinutes);
      return jsonResp(res, 200, r);
    }
    // Gmail
    if (urlPath === '/gmail/inbox') {
      const r = await googleApi.listInbox(params.max);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/gmail/read') {
      if (!params.id) return jsonResp(res, 400, { error: 'id required' });
      const r = await googleApi.readEmail(params.id);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/gmail/attachment') {
      if (!params.id || !params.attachmentId) return jsonResp(res, 400, { error: 'id and attachmentId required' });
      const r = await googleApi.downloadGmailAttachment(params.id, params.attachmentId, {
        name: params.name || params.filename,
        mimeType: params.mimeType || params.contentType,
        scan: params.scan === '1' || params.scan === 'true',
      });
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/gmail/send') {
      if (isZalo) return jsonResp(res, 403, { error: 'Gmail send not allowed from Zalo channel' });
      if (!params.to || !params.subject || !params.body) return jsonResp(res, 400, { error: 'to, subject, body required' });
      const r = await googleApi.sendEmail(params.to, params.subject, params.body);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/gmail/reply') {
      if (isZalo) return jsonResp(res, 403, { error: 'Gmail reply not allowed from Zalo channel' });
      if (!params.id || !params.body) return jsonResp(res, 400, { error: 'id, body required' });
      const r = await googleApi.replyEmail(params.id, params.body);
      return jsonResp(res, 200, r);
    }
    // Drive
    if (urlPath === '/drive/list') {
      const r = await googleApi.listFiles(params.query, params.max);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/drive/upload') {
      if (blockZaloMutation('Google Drive upload')) return;
      if (!params.filePath) return jsonResp(res, 400, { error: 'filePath required' });
      if (!isHomedirPathSafe(params.filePath)) return jsonResp(res, 403, { error: 'filePath blocked by path validation' });
      const r = await googleApi.uploadFile(params.filePath, params.folderId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/drive/download') {
      if (blockZaloMutation('Google Drive download')) return;
      if (!params.fileId || !params.destPath) return jsonResp(res, 400, { error: 'fileId and destPath required' });
      if (!isHomedirPathSafe(params.destPath)) return jsonResp(res, 403, { error: 'destPath blocked by path validation' });
      const r = await googleApi.downloadFile(params.fileId, params.destPath, params.format);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/drive/share') {
      if (blockZaloMutation('Google Drive share')) return;
      if (!params.fileId || !params.email) return jsonResp(res, 400, { error: 'fileId and email required' });
      const r = await googleApi.shareFile(params.fileId, params.email, params.role);
      return jsonResp(res, 200, r);
    }
    // Docs
    if (urlPath === '/docs/list') {
      const r = await googleApi.listDocs(params.max);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/docs/info') {
      if (!params.docId) return jsonResp(res, 400, { error: 'docId required' });
      const r = await googleApi.getDocInfo(params.docId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/docs/read') {
      if (!params.docId) return jsonResp(res, 400, { error: 'docId required' });
      const r = await googleApi.readDoc(params.docId, params);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/docs/create') {
      if (isZalo) return jsonResp(res, 403, { error: 'Google Docs create not allowed from Zalo channel' });
      if (!params.title) return jsonResp(res, 400, { error: 'title required' });
      if (params.file && !isHomedirPathSafe(params.file)) return jsonResp(res, 403, { error: 'file blocked by path validation' });
      const r = await googleApi.createDoc(params.title, params);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/docs/write') {
      if (isZalo) return jsonResp(res, 403, { error: 'Google Docs write not allowed from Zalo channel' });
      if (!params.docId) return jsonResp(res, 400, { error: 'docId required' });
      if (params.text === undefined && !params.file) return jsonResp(res, 400, { error: 'text or file required' });
      if (params.file && !isHomedirPathSafe(params.file)) return jsonResp(res, 403, { error: 'file blocked by path validation' });
      const r = await googleApi.writeDoc(params.docId, params);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/docs/insert') {
      if (isZalo) return jsonResp(res, 403, { error: 'Google Docs insert not allowed from Zalo channel' });
      if (!params.docId) return jsonResp(res, 400, { error: 'docId required' });
      if (params.content === undefined && !params.file) return jsonResp(res, 400, { error: 'content or file required' });
      if (params.file && !isHomedirPathSafe(params.file)) return jsonResp(res, 403, { error: 'file blocked by path validation' });
      const r = await googleApi.insertDoc(params.docId, params.content, params);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/docs/find-replace') {
      if (isZalo) return jsonResp(res, 403, { error: 'Google Docs find-replace not allowed from Zalo channel' });
      if (!params.docId || !params.find) return jsonResp(res, 400, { error: 'docId and find required' });
      if (params.contentFile && !isHomedirPathSafe(params.contentFile)) return jsonResp(res, 403, { error: 'contentFile blocked by path validation' });
      const r = await googleApi.findReplaceDoc(params.docId, params.find, params.replace, params);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/docs/export') {
      if (!params.docId) return jsonResp(res, 400, { error: 'docId required' });
      if (params.out && !isHomedirPathSafe(params.out)) return jsonResp(res, 403, { error: 'out blocked by path validation' });
      const r = await googleApi.exportDoc(params.docId, params);
      return jsonResp(res, 200, r);
    }
    // Contacts
    if (urlPath === '/contacts/list' || urlPath === '/contacts/search') {
      const r = await googleApi.listContacts(params.query);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/contacts/create') {
      if (blockZaloMutation('Google Contacts create')) return;
      if (!params.name) return jsonResp(res, 400, { error: 'name required' });
      const r = await googleApi.createContact(params.name, params.phone, params.email);
      return jsonResp(res, 200, r);
    }
    // Tasks
    if (urlPath === '/tasks/lists') {
      const r = await googleApi.listTaskLists(params.max);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/tasks/list') {
      const r = await googleApi.listTasks(params.listId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/tasks/create') {
      if (blockZaloMutation('Google Tasks create')) return;
      if (!params.title) return jsonResp(res, 400, { error: 'title required' });
      const r = await googleApi.createTask(params.title, params.due, params.listId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/tasks/complete') {
      if (blockZaloMutation('Google Tasks complete')) return;
      if (!params.taskId) return jsonResp(res, 400, { error: 'taskId required' });
      const r = await googleApi.completeTask(params.taskId, params.listId);
      return jsonResp(res, 200, r);
    }
    // Sheets
    if (urlPath === '/sheets/list') {
      const r = await googleApi.listSheets(params.max);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/sheets/metadata') {
      if (!params.spreadsheetId) return jsonResp(res, 400, { error: 'spreadsheetId required' });
      const r = await googleApi.getSheetMetadata(params.spreadsheetId);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/sheets/get') {
      if (!params.spreadsheetId || !params.range) return jsonResp(res, 400, { error: 'spreadsheetId and range required' });
      const r = await googleApi.getSheet(params.spreadsheetId, params.range, params);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/sheets/update') {
      if (blockZaloMutation('Google Sheets update')) return;
      if (!params.spreadsheetId || !params.range) return jsonResp(res, 400, { error: 'spreadsheetId and range required' });
      const parsedValues = normalizeSheetValues(params);
      if (parsedValues && !parsedValues.ok) return jsonResp(res, 400, { error: parsedValues.error });
      const values = parsedValues ? parsedValues.values : params.values;
      const range = fitSheetRangeToValues(params.range, values);
      const r = await googleApi.updateSheet(params.spreadsheetId, range, values, params);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/sheets/append') {
      if (blockZaloMutation('Google Sheets append')) return;
      if (!params.spreadsheetId || !params.range) return jsonResp(res, 400, { error: 'spreadsheetId and range required' });
      const parsedValues = normalizeSheetValues(params);
      if (parsedValues && !parsedValues.ok) return jsonResp(res, 400, { error: parsedValues.error });
      const values = parsedValues ? parsedValues.values : params.values;
      const r = await googleApi.appendSheet(params.spreadsheetId, params.range, values, params);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/sheets/create') {
      if (blockZaloMutation('Google Sheets create')) return;
      if (!params.title) return jsonResp(res, 400, { error: 'title required' });
      const r = await googleApi.createSheet(params.title, params.sheets, params.parent);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/sheets/format') {
      if (blockZaloMutation('Google Sheets format')) return;
      if (!params.spreadsheetId || !params.range || !params.formatJson || !params.formatFields)
        return jsonResp(res, 400, { error: 'spreadsheetId, range, formatJson, formatFields required' });
      const r = await googleApi.formatSheet(params.spreadsheetId, params.range, params.formatJson, params.formatFields);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/sheets/freeze') {
      if (blockZaloMutation('Google Sheets freeze')) return;
      if (!params.spreadsheetId) return jsonResp(res, 400, { error: 'spreadsheetId required' });
      const r = await googleApi.freezeSheet(params.spreadsheetId, params.rows, params.cols, params.sheet);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/sheets/number-format') {
      if (blockZaloMutation('Google Sheets number-format')) return;
      if (!params.spreadsheetId || !params.range || !params.type)
        return jsonResp(res, 400, { error: 'spreadsheetId, range, type required' });
      const r = await googleApi.numberFormatSheet(params.spreadsheetId, params.range, params.type);
      return jsonResp(res, 200, r);
    }
    if (urlPath === '/sheets/create-formatted') {
      if (blockZaloMutation('Google Sheets create-formatted')) return;
      const normalizedPayload = normalizeCreateFormattedPayload(params);
      if (!normalizedPayload.ok) return jsonResp(res, 400, { error: normalizedPayload.error });
      const { title, headers, data, style, textColumns, parent } = normalizedPayload;

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
        const lastCol = numberToColumn(headers.length);
        const range = 'Sheet1!A1:' + lastCol + allRows.length;
        await googleApi.updateSheet(sid, range, allRows);

        // Step 4: Apply style
        const s = style === 'standard' ? 'crm' : style;
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
    // Apps Script, useful for automations around Google Sheets/AppSheet data.
    if (urlPath === '/appscript/run') {
      if (blockZaloMutation('Google Apps Script run')) return;
      if (!params.scriptId || !params.functionName) return jsonResp(res, 400, { error: 'scriptId and functionName required' });
      const r = await googleApi.runAppScript(params.scriptId, params.functionName, params.params, params.devMode);
      return jsonResp(res, 200, r);
    }
    return jsonResp(res, 404, {
      error: 'unknown google route: ' + urlPath,
      hint: 'Valid routes: /status, /health, /gmail/inbox, /gmail/read, /gmail/attachment, /gmail/send, /gmail/reply, /calendar/events, /calendar/create, /calendar/update, /calendar/delete, /calendar/free-busy, /calendar/free-slots, /drive/list, /drive/upload, /drive/download, /drive/share, /docs/list, /docs/info, /docs/read, /docs/create, /docs/write, /docs/insert, /docs/find-replace, /docs/export, /sheets/list, /sheets/metadata, /sheets/get, /sheets/update, /sheets/create, /sheets/create-formatted, /sheets/format, /sheets/freeze, /sheets/number-format, /contacts/list, /contacts/create, /tasks/lists, /tasks/list, /tasks/create, /tasks/complete, /apps-script/run',
    });
  } catch (e) {
    return jsonResp(res, 500, { error: e.message });
  }
};
