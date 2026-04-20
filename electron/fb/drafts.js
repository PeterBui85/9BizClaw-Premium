// electron/fb/drafts.js
// Spec: docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md
// Responsibility: pending-fb-drafts/*.json lifecycle + status transitions + undo window

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DRAFT_STATUSES = [
  'pending', 'pending-digest-queued', 'approved',
  'published', 'skipped', 'failed',
];

function _workspaceDirInternal() {
  if (process.env['9BIZ_WORKSPACE']) return process.env['9BIZ_WORKSPACE'];
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', '9bizclaw');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), '9bizclaw');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), '9bizclaw');
}

function getWorkspaceDir() {
  return _workspaceDirInternal();
}

function _draftsDir() {
  const d = path.join(_workspaceDirInternal(), 'pending-fb-drafts');
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
  return d;
}

function getDraftPath(dateIsoOrLocal) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateIsoOrLocal)
    ? dateIsoOrLocal
    : new Date(dateIsoOrLocal).toISOString().slice(0, 10);
  return path.join(_draftsDir(), `${date}.json`);
}

function readDraftForDate(dateIsoOrLocal) {
  const p = getDraftPath(dateIsoOrLocal);
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function writeDraftForDate(dateIsoOrLocal, draftObj) {
  const p = getDraftPath(dateIsoOrLocal);
  fs.writeFileSync(p, JSON.stringify(draftObj, null, 2) + '\n', 'utf-8');
}

function markStatus(dateIsoOrLocal, variantId, newStatus) {
  if (!DRAFT_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  const d = readDraftForDate(dateIsoOrLocal);
  if (!d) return null;
  if (d.main?.id === variantId) d.main.status = newStatus;
  else {
    const v = (d.variants || []).find((x) => x.id === variantId);
    if (!v) return null;
    v.status = newStatus;
  }
  writeDraftForDate(dateIsoOrLocal, d);
  return d;
}

function listPendingDrafts() {
  try {
    const files = fs.readdirSync(_draftsDir()).filter((f) => f.endsWith('.json')).sort();
    return files.map((f) => {
      const d = JSON.parse(fs.readFileSync(path.join(_draftsDir(), f), 'utf-8'));
      return { date: f.replace('.json', ''), draft: d };
    }).filter(({ draft }) => {
      const mainPending = draft.main?.status && ['pending', 'pending-digest-queued'].includes(draft.main.status);
      const variantsPending = (draft.variants || []).some((v) => ['pending', 'pending-digest-queued'].includes(v.status));
      return mainPending || variantsPending;
    });
  } catch { return []; }
}

module.exports = {
  DRAFT_STATUSES,
  getDraftPath,
  getWorkspaceDir,
  readDraftForDate,
  writeDraftForDate,
  markStatus,
  listPendingDrafts,
};
