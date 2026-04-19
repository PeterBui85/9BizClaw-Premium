/**
 * Google Calendar — CEO-supplied OAuth credentials storage.
 *
 * Encrypted via electron.safeStorage when available (Mac Keychain, Windows
 * DPAPI, Linux libsecret). Falls back to plain JSON with a boot warning
 * on Linux without keyring. Files live in workspace dir (modoro-claw).
 *
 * Exports: save({clientId, clientSecret}), load() -> {...}|null, clear().
 * isStoredPlain() for UI to warn CEO.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function getWorkspace() {
  // Prefer env override (set by main.js + smoke tests).
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

function encPath() { return path.join(getWorkspace(), 'gcal-credentials.enc'); }
function plainPath() { return path.join(getWorkspace(), 'gcal-credentials.plain'); }

// Lazy-load safeStorage so this module is importable from smoke (non-Electron).
function trySafeStorage() {
  try {
    const electron = require('electron');
    if (electron && electron.safeStorage && electron.safeStorage.isEncryptionAvailable()) {
      return electron.safeStorage;
    }
  } catch {}
  return null;
}

function save({ clientId, clientSecret }) {
  if (typeof clientId !== 'string' || !clientId.includes('.apps.googleusercontent.com')) {
    throw new Error('invalid clientId format');
  }
  if (typeof clientSecret !== 'string' || clientSecret.length < 10) {
    throw new Error('invalid clientSecret format');
  }
  const ws = getWorkspace();
  try { fs.mkdirSync(ws, { recursive: true }); } catch {}
  const payload = JSON.stringify({ clientId, clientSecret });
  const safe = trySafeStorage();
  if (safe) {
    const buf = safe.encryptString(payload);
    fs.writeFileSync(encPath(), buf);
    // Clear any stale plain file from a prior session
    try { fs.unlinkSync(plainPath()); } catch {}
  } else {
    fs.writeFileSync(plainPath(), payload, { encoding: 'utf-8', mode: 0o600 });
    try { fs.unlinkSync(encPath()); } catch {}
  }
}

function load() {
  const safe = trySafeStorage();
  if (safe) {
    try {
      const buf = fs.readFileSync(encPath());
      const payload = safe.decryptString(buf);
      return JSON.parse(payload);
    } catch {
      // Fall through to plain — merchant may have downgraded keyring
    }
  }
  try {
    const payload = fs.readFileSync(plainPath(), 'utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function clear() {
  try { fs.unlinkSync(encPath()); } catch {}
  try { fs.unlinkSync(plainPath()); } catch {}
}

function isStoredPlain() {
  try { fs.accessSync(plainPath()); return true; } catch { return false; }
}

module.exports = { save, load, clear, isStoredPlain };
