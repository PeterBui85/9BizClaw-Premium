/**
 * Google Calendar config — read/write gcal-config.json in workspace.
 *
 * Default: { workingHours: { start: "08:00", end: "18:00" },
 *            slotDurationMinutes: 30, daysAhead: 7, reminderMinutes: 15 }
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  workingHours: { start: '08:00', end: '18:00' },
  slotDurationMinutes: 30,
  daysAhead: 7,
  reminderMinutes: 15,
};

function getWorkspace() {
  if (process.env.MODORO_WORKSPACE) return process.env.MODORO_WORKSPACE;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'modoro-claw');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'modoro-claw');
  }
  return path.join(home, '.config', 'modoro-claw');
}

function configPath() {
  return path.join(getWorkspace(), 'gcal-config.json');
}

// One-time migration for merchants who connected under the pre-v2.4.0 path.
// Runs the first time read() is called and the new path is empty but the
// old path has data. Idempotent — subsequent reads find the new file and
// skip. Deletes the old file after copy so subsequent downgrade surfaces
// the same "Lịch hẹn" empty state everywhere.
function _migrateLegacyConfigOnce() {
  const newPath = configPath();
  if (fs.existsSync(newPath)) return;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const legacy = path.join(home, '.openclaw', 'gcal-config.json');
  if (!fs.existsSync(legacy)) return;
  try {
    try { fs.mkdirSync(path.dirname(newPath), { recursive: true }); } catch {}
    const content = fs.readFileSync(legacy, 'utf-8');
    fs.writeFileSync(newPath, content);
    try { fs.unlinkSync(legacy); } catch {}
  } catch {}
}

function read() {
  _migrateLegacyConfigOnce();
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    // Merge with defaults so missing fields are always present
    return { ...DEFAULTS, ...parsed, workingHours: { ...DEFAULTS.workingHours, ...(parsed.workingHours || {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(cfg) {
  // Merge order: DEFAULTS < existing saved config < new partial patch.
  // Partial writes must not clobber prior fields (e.g. saving
  // slotDurationMinutes alone keeps reminderMinutes the user set earlier).
  const existing = read();
  const merged = {
    ...DEFAULTS,
    ...existing,
    ...cfg,
    workingHours: {
      ...DEFAULTS.workingHours,
      ...(existing.workingHours || {}),
      ...(cfg.workingHours || {}),
    },
  };
  const filePath = configPath();
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch {}
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

module.exports = { read, write, DEFAULTS };
