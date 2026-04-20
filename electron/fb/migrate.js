// electron/fb/migrate.js
// Spec: docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md
// Responsibility: cron owner field migration (one-shot, marker-gated via workspace-state.json)

'use strict';

const fs = require('fs');
const path = require('path');

function migrateCronOwnerFields(workspace) {
  if (!workspace) return { migrated: false, reason: 'no-workspace' };
  const statePath = path.join(workspace, 'workspace-state.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf-8')); } catch {}
  if (state['cron-owner-migrated-v1']) return { migrated: false, reason: 'already-migrated' };

  const targets = [
    path.join(workspace, 'schedules.json'),
    path.join(workspace, 'custom-crons.json'),
  ];
  let anyChange = false;
  for (const tp of targets) {
    try {
      if (!fs.existsSync(tp)) continue;
      const arr = JSON.parse(fs.readFileSync(tp, 'utf-8'));
      if (!Array.isArray(arr)) continue;
      let changed = false;
      for (const entry of arr) {
        if (typeof entry.owner === 'string' && entry.owner) continue;
        const name = String(entry.id || entry.name || '').toLowerCase();
        if (name.startsWith('zalo') || name.includes('cookie') || name.includes('cookies')) entry.owner = 'zalo';
        else if (name.startsWith('fb') || name.startsWith('facebook')) entry.owner = 'facebook';
        else if (name === 'heartbeat' || name.includes('watchdog')) entry.owner = 'system';
        else if (name === 'morning' || name === 'evening' || name.includes('report')) entry.owner = 'zalo';  // default business-owned
        else if (name.includes('memory-cleanup')) entry.owner = 'system';
        else entry.owner = 'ceo';
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(tp, JSON.stringify(arr, null, 2) + '\n', 'utf-8');
        anyChange = true;
      }
    } catch (e) {
      console.warn('[migrateCronOwnerFields] failed on', tp, ':', e.message);
    }
  }
  state['cron-owner-migrated-v1'] = true;
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  } catch (e) {
    console.warn('[migrateCronOwnerFields] state write failed:', e.message);
  }
  return { migrated: true, anyChange };
}

module.exports = { migrateCronOwnerFields };
