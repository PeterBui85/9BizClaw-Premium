'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

let app;
try { app = require('electron').app; } catch {}

function getGogConfigDir() {
  if (app) return path.join(app.getPath('userData'), 'gog');
  const homedir = require('os').homedir();
  if (process.platform === 'darwin') return path.join(homedir, 'Library', 'Application Support', 'modoro-claw', 'gog');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming'), 'modoro-claw', 'gog');
  return path.join(homedir, '.config', 'modoro-claw', 'gog');
}

function getGogBinaryPath() {
  const vendorDir = (() => {
    if (!app || !app.isPackaged) return path.join(__dirname, '..', 'vendor');
    return path.join(process.resourcesPath, 'vendor');
  })();
  const bin = process.platform === 'win32'
    ? path.join(vendorDir, 'gog', 'gog.exe')
    : path.join(vendorDir, 'gog', 'gog');

  if (!fs.existsSync(bin)) return null;

  if (process.platform !== 'win32') {
    try {
      fs.accessSync(bin, fs.constants.X_OK);
    } catch {
      try { fs.chmodSync(bin, 0o755); } catch {}
    }
  }
  return bin;
}

function getGogAccount() {
  try {
    const p = path.join(getGogConfigDir(), 'account.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8')).email || '';
  } catch { return ''; }
}

function saveGogAccount(email) {
  const dir = getGogConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'account.json'), JSON.stringify({ email }));
}

function gogEnv() {
  return {
    ...process.env,
    GOG_CONFIG_DIR: getGogConfigDir(),
    GOG_JSON: '1',
    GOG_TIMEZONE: 'Asia/Ho_Chi_Minh',
    GOG_ACCOUNT: getGogAccount(),
  };
}

function gogExecSync(args, timeoutMs = 15000) {
  const bin = getGogBinaryPath();
  if (!bin) throw new Error('gog binary not found');
  const stdout = execFileSync(bin, args, {
    env: gogEnv(),
    timeout: timeoutMs,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  try { return JSON.parse(stdout); } catch {
    return { error: 'Unexpected output', raw: stdout.slice(0, 2000) };
  }
}

async function gogExec(args, timeoutMs = 15000) {
  return gogSpawnAsync(args, timeoutMs);
}

function gogSpawnAsync(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const bin = getGogBinaryPath();
    if (!bin) return reject(new Error('gog binary not found'));
    const child = spawn(bin, args, { env: gogEnv(), windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout?.on('data', d => stdout += d);
    child.stderr?.on('data', d => stderr += d);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Timeout after ' + (timeoutMs / 1000) + 's'));
    }, timeoutMs);
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr || `exit code ${code}`));
      try { resolve(JSON.parse(stdout)); } catch {
        resolve({ ok: true, raw: stdout.slice(0, 2000) });
      }
    });
    child.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

// --- Auth ---

function authStatus() {
  try {
    const result = gogExecSync(['auth', 'status'], 10000);
    const email = getGogAccount();
    return { connected: !!email, email, services: ['calendar', 'gmail', 'drive', 'contacts', 'tasks'], raw: result };
  } catch {
    return { connected: false, email: '', services: [] };
  }
}

function registerCredentials(clientSecretPath) {
  return gogExecSync(['auth', 'credentials', clientSecretPath], 10000);
}

async function connectAccount(email) {
  const result = await gogSpawnAsync(
    ['auth', 'add', email, '--services', 'calendar,gmail,drive,contacts,tasks'],
    120000
  );
  saveGogAccount(email);
  return result;
}

function disconnectAccount() {
  const email = getGogAccount();
  if (email) {
    try { gogExecSync(['auth', 'remove', email], 10000); } catch {}
  }
  const accountFile = path.join(getGogConfigDir(), 'account.json');
  try { fs.unlinkSync(accountFile); } catch {}
  return { ok: true };
}

// --- Calendar ---

async function listEvents(from, to) {
  const args = ['calendar', 'events', 'list'];
  if (from) args.push('--from', from);
  if (to) args.push('--to', to);
  return gogExec(args);
}

async function createEvent(summary, start, end, attendees) {
  const args = ['calendar', 'events', 'create', '--summary', summary, '--start', start, '--end', end];
  if (attendees) {
    const list = Array.isArray(attendees) ? attendees.join(',') : attendees;
    args.push('--attendees', list);
  }
  return gogExec(args);
}

async function deleteEvent(eventId) {
  return gogExec(['calendar', 'events', 'delete', eventId]);
}

async function getFreeBusy(from, to) {
  return gogExec(['calendar', 'freebusy', '--from', from, '--to', to]);
}

async function getFreeSlots(date, workStart, workEnd, slotMinutes) {
  workStart = workStart || '08:00';
  workEnd = workEnd || '18:00';
  slotMinutes = parseInt(slotMinutes) || 30;
  const from = date + 'T' + workStart + ':00';
  const to = date + 'T' + workEnd + ':00';
  const busy = await getFreeBusy(from, to);
  const busyPeriods = (busy.calendars || busy.data || [])
    .flatMap(c => c.busy || [])
    .map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start - b.start);

  const slots = [];
  let cursor = new Date(from);
  const endTime = new Date(to);
  const slotMs = slotMinutes * 60000;
  while (cursor.getTime() + slotMs <= endTime.getTime()) {
    const slotEnd = new Date(cursor.getTime() + slotMs);
    const conflict = busyPeriods.some(b => cursor < b.end && slotEnd > b.start);
    if (!conflict) slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
    cursor = new Date(cursor.getTime() + slotMs);
  }
  return { slots };
}

// --- Gmail ---

async function listInbox(max) {
  return gogExec(['gmail', 'search', '--query', 'in:inbox', '--max', String(max || 20)]);
}

async function readEmail(id) {
  return gogExec(['gmail', 'get', id]);
}

async function sendEmail(to, subject, body) {
  return gogExec(['gmail', 'send', '--to', to, '--subject', subject, '--body', body], 30000);
}

async function replyEmail(id, body) {
  return gogExec(['gmail', 'reply', id, '--body', body], 30000);
}

// --- Drive ---

async function listFiles(query, max) {
  const args = query ? ['drive', 'search', query, '--max', String(max || 20)] : ['drive', 'ls', '--max', String(max || 20)];
  return gogExec(args);
}

async function uploadFile(filePath, folderId) {
  const args = ['drive', 'upload', filePath];
  if (folderId) args.push('--parent', folderId);
  return gogExec(args, 60000);
}

async function downloadFile(fileId, destPath) {
  return gogExec(['drive', 'download', fileId, destPath], 60000);
}

async function shareFile(fileId, email, role) {
  return gogExec(['drive', 'share', fileId, '--email', email, '--role', role || 'reader']);
}

// --- Contacts ---

async function listContacts(query) {
  return query ? gogExec(['contacts', 'search', query]) : gogExec(['contacts', 'list']);
}

async function createContact(name, phone, email) {
  const args = ['contacts', 'create', '--name', name];
  if (phone) args.push('--phone', phone);
  if (email) args.push('--email', email);
  return gogExec(args);
}

// --- Tasks ---

async function listTasks(listId) {
  const args = ['tasks', 'list'];
  if (listId) args.push('--list', listId);
  return gogExec(args);
}

async function createTask(title, due, listId) {
  const args = ['tasks', 'add', title];
  if (due) args.push('--due', due);
  if (listId) args.push('--list', listId);
  return gogExec(args);
}

async function completeTask(taskId) {
  return gogExec(['tasks', 'done', taskId]);
}

module.exports = {
  getGogBinaryPath, getGogConfigDir, getGogAccount,
  gogExec, gogExecSync, gogSpawnAsync, gogEnv,
  authStatus, registerCredentials, connectAccount, disconnectAccount,
  listEvents, createEvent, deleteEvent, getFreeBusy, getFreeSlots,
  listInbox, readEmail, sendEmail, replyEmail,
  listFiles, uploadFile, downloadFile, shareFile,
  listContacts, createContact, listTasks, createTask, completeTask,
};
