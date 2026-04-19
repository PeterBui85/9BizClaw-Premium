/**
 * Migration: legacy local appointments.json → .learnings/appointments-archive-<date>.md
 *
 * Idempotent via .learnings/appointments-migrated.flag. Runs inside
 * seedWorkspace on first boot after v2.4.0 upgrade. Rollback explicitly
 * unsupported at data layer — archive .md is the permanent record.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

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

function formatDateVI(iso) {
  // "2026-04-22T14:00:00+07:00" → "22/04/2026"
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function formatTimeVI(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildArchive(appts) {
  // Group by day. Skip entries with unparseable start (corrupt JSON tolerance).
  const byDay = {};
  const skipped = [];
  for (const a of appts) {
    if (!a || typeof a !== 'object' || !a.start) { skipped.push(a); continue; }
    const d = new Date(a.start);
    if (isNaN(d.getTime())) { skipped.push(a); continue; }
    const dayKey = formatDateVI(a.start);
    (byDay[dayKey] = byDay[dayKey] || []).push(a);
  }
  let md = '# Lịch hẹn cũ (local, pre-v2.4.0)\n\n';
  md += `Xuất ngày ${formatDateVI(new Date().toISOString())}. CEO có thể re-enter thủ công vào Google Calendar nếu cần.\n\n`;
  if (skipped.length) {
    md += `_Bỏ qua ${skipped.length} entry lỗi (thiếu start hoặc start không hợp lệ). Xem \`appointments.json.bak\` trong workspace nếu cần khôi phục._\n\n`;
  }
  const sortedDays = Object.keys(byDay).sort((a, b) => {
    const [da, ma, ya] = a.split('/').map(Number);
    const [db, mb, yb] = b.split('/').map(Number);
    return new Date(ya, ma-1, da) - new Date(yb, mb-1, db);
  });
  for (const day of sortedDays) {
    md += `## ${day}\n`;
    for (const a of byDay[day]) {
      const s = formatTimeVI(a.start);
      // end may be missing/invalid — format defensively
      const endParsed = a.end ? new Date(a.end) : null;
      const e = (endParsed && !isNaN(endParsed.getTime())) ? formatTimeVI(a.end) : '??:??';
      md += `- ${s}–${e} **${a.title || '(không tên)'}**`;
      if (a.notes) md += ` · ghi chú: ${a.notes}`;
      md += '\n';
    }
    md += '\n';
  }
  return md;
}

function migrateLocalAppointments() {
  const ws = getWorkspace();
  const apptFile = path.join(ws, 'appointments.json');
  const learningsDir = path.join(ws, '.learnings');
  const flagPath = path.join(learningsDir, 'appointments-migrated.flag');

  // Idempotent: skip if flag exists
  if (fs.existsSync(flagPath)) {
    return { migrated: false, reason: 'flag_present' };
  }
  if (!fs.existsSync(apptFile)) {
    // No legacy data — write flag so we don't re-check forever
    try { fs.mkdirSync(learningsDir, { recursive: true }); } catch {}
    fs.writeFileSync(flagPath, JSON.stringify({ ts: Date.now(), count: 0, reason: 'no_legacy' }, null, 2));
    return { migrated: false, reason: 'no_legacy_file' };
  }

  let appts;
  try {
    const raw = fs.readFileSync(apptFile, 'utf-8');
    appts = JSON.parse(raw);
    if (!Array.isArray(appts)) appts = [];
  } catch (e) {
    return { migrated: false, reason: 'parse_failed', error: e.message };
  }

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const archivePath = path.join(learningsDir, `appointments-archive-${dateStr}.md`);

  try { fs.mkdirSync(learningsDir, { recursive: true }); } catch {}
  fs.writeFileSync(archivePath, buildArchive(appts), 'utf-8');
  // Preserve the raw legacy file alongside the archive for recoverability —
  // .bak so backup tools pick it up, and CEO can re-parse if archive is
  // ever found to have skipped entries.
  try { fs.renameSync(apptFile, apptFile + '.bak'); } catch { try { fs.unlinkSync(apptFile); } catch {} }
  fs.writeFileSync(flagPath, JSON.stringify({ ts: Date.now(), count: appts.length, archivePath }, null, 2));

  return { migrated: true, count: appts.length, archivePath };
}

module.exports = { migrateLocalAppointments };
