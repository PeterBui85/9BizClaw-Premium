// electron/fb/config.js
// Spec: docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md
// Responsibility: fb-post-settings.json read/write + path resolution

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_SETTINGS = {
  cronTime: '07:30',
  quietHours: null,        // { start: '22:00', end: '07:00' } or null
  defaultAngle: null,      // 'educational' | 'story' | 'question' | null
};

const APP_DIR_NAME = '9bizclaw';

function getAppDataRoot() {
  if (process.env['9BIZ_WORKSPACE']) return process.env['9BIZ_WORKSPACE'];
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_DIR_NAME);
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, APP_DIR_NAME);
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(xdg, APP_DIR_NAME);
}

function getFbDir() {
  const dir = path.join(getAppDataRoot(), 'fb');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

function getSettingsPath() {
  return path.join(getAppDataRoot(), 'config', 'fb-post-settings.json');
}

function readSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Object.assign({}, DEFAULT_SETTINGS, parsed);
  } catch {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}

function writeSettings(settings) {
  const merged = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  const p = getSettingsPath();
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch {}
  fs.writeFileSync(p, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

module.exports = {
  DEFAULT_SETTINGS,
  getFbDir,
  getSettingsPath,
  readSettings,
  writeSettings,
};
