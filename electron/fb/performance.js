// electron/fb/performance.js
// Spec: docs/superpowers/specs/2026-04-20-fb-fanpage-posting-autonomy-design.md
// Responsibility: Insights cron worker + history append + trim policy

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const fbGraph = require('./graph');

function _workspace() {
  if (process.env['9BIZ_WORKSPACE']) return process.env['9BIZ_WORKSPACE'];
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', '9bizclaw');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), '9bizclaw');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), '9bizclaw');
}

const _queuePath = () => path.join(_workspace(), 'pending-insights-checks.json');
const _historyPath = () => path.join(_workspace(), 'memory', 'fb-performance-history.md');
const _postsLogPath = () => path.join(_workspace(), 'logs', 'fb-posts-log.jsonl');

function _readQueue() {
  try { return JSON.parse(fs.readFileSync(_queuePath(), 'utf-8')); } catch { return []; }
}
function _writeQueue(q) {
  try {
    fs.writeFileSync(_queuePath(), JSON.stringify(q, null, 2) + '\n', 'utf-8');
  } catch (e) {
    console.error('[fb performance] queue write failed:', e.message);
  }
}

function queueInsightsCheck(postId, publishedAt) {
  if (!postId) return;
  const q = _readQueue();
  const t = new Date(publishedAt || new Date()).getTime();
  const t24 = new Date(t + 24 * 3600_000).toISOString();
  const t7d = new Date(t + 7 * 24 * 3600_000).toISOString();
  q.push({ postId, checkAt: t24, type: '24h' });
  q.push({ postId, checkAt: t7d, type: '7d' });
  _writeQueue(q);
}

function _findPostMetaInLog(postId) {
  try {
    const raw = fs.readFileSync(_postsLogPath(), 'utf-8');
    const lines = raw.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.postId === postId) return entry;
      } catch {}
    }
  } catch {}
  return null;
}

function _extractReactionsTotal(graphData) {
  const metric = (graphData?.data || []).find((m) => m.name === 'post_reactions_by_type_total');
  if (!metric?.values?.[0]?.value) return 0;
  const v = metric.values[0].value;
  if (typeof v === 'object') return Object.values(v).reduce((s, n) => s + (Number(n) || 0), 0);
  return Number(v) || 0;
}
function _extractImpressions(graphData) {
  const m = (graphData?.data || []).find((x) => x.name === 'post_impressions');
  return Number(m?.values?.[0]?.value || 0);
}
function _extractEngaged(graphData) {
  const m = (graphData?.data || []).find((x) => x.name === 'post_engaged_users');
  return Number(m?.values?.[0]?.value || 0);
}

async function runInsightsSweep({ pageToken }) {
  const q = _readQueue();
  const now = Date.now();
  const remaining = [];
  for (const entry of q) {
    if (new Date(entry.checkAt).getTime() > now) {
      remaining.push(entry);
      continue;
    }
    try {
      let metrics;
      if (entry.type === '24h') {
        const r = await fbGraph.fetchInsights(entry.postId, pageToken, [
          'post_reactions_by_type_total',
        ]);
        metrics = { t: '24h', data: r };
      } else {
        const r = await fbGraph.fetchInsights(entry.postId, pageToken, [
          'post_impressions', 'post_impressions_unique', 'post_clicks',
          'post_engaged_users', 'post_reactions_by_type_total',
        ]);
        metrics = { t: '7d', data: r };
      }
      const meta = _findPostMetaInLog(entry.postId) || {};
      appendPerformanceEntry(entry.postId, metrics, meta);
    } catch (e) {
      if (e.status === 400 || e.code === 100) {
        const retries = (entry._retries || 0) + 1;
        if (retries < 24) {
          remaining.push({ ...entry, _retries: retries, checkAt: new Date(now + 3600_000).toISOString() });
        } else {
          console.warn('[fb performance] giving up on', entry.postId, entry.type);
        }
      } else {
        remaining.push(entry);  // transient, retry next sweep
      }
    }
  }
  _writeQueue(remaining);
}

function appendPerformanceEntry(postId, metrics, meta = {}) {
  const hp = _historyPath();
  let content = '';
  try { content = fs.readFileSync(hp, 'utf-8'); } catch { content = '# FB Post Performance History\n\n'; }

  const reactions = _extractReactionsTotal(metrics.data);
  const impressions = _extractImpressions(metrics.data);
  const engaged = _extractEngaged(metrics.data);

  const date = meta.date || (meta.t ? meta.t.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const angle = meta.angle || 'unknown';

  const section = `\n## ${date} | ${angle} | ${postId}\n\n` +
    `### ${metrics.t}\nReactions: ${reactions} | Impressions: ${impressions} | Engaged: ${engaged}\n\n` +
    `<!-- raw: ${JSON.stringify(metrics.data || metrics).slice(0, 500)} -->\n\n---\n`;

  try {
    fs.mkdirSync(path.dirname(hp), { recursive: true });
    fs.writeFileSync(hp, content + section, 'utf-8');
  } catch (e) {
    console.error('[fb performance] history write failed:', e.message);
    return;
  }
  trimFbPerformanceHistory();
}

function trimFbPerformanceHistory(maxBytes = 50 * 1024) {
  const hp = _historyPath();
  let content;
  try { content = fs.readFileSync(hp, 'utf-8'); } catch { return; }
  if (Buffer.byteLength(content) <= maxBytes) return;

  // Parse sections: split by "## " heading, keep header + sections.
  const parts = content.split(/^## /m);  // parts[0] is file header + anything before first ##
  const header = parts[0];
  const sections = parts.slice(1).map((s) => '## ' + s);  // re-add prefix

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 84);  // 12 weeks

  const keptVerbose = [];
  const oldByMonth = {};
  for (const sec of sections) {
    const dateMatch = sec.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) { keptVerbose.push(sec); continue; }
    const d = new Date(dateMatch[1]);
    if (d >= cutoff) {
      keptVerbose.push(sec);
    } else {
      const monthKey = dateMatch[1].slice(0, 7);
      oldByMonth[monthKey] = (oldByMonth[monthKey] || 0) + 1;
    }
  }
  const rollupLines = Object.keys(oldByMonth).sort().map((m) => `## ${m} — ${oldByMonth[m]} posts (summary collapsed)\n`);
  const newContent = header + rollupLines.join('\n') + (rollupLines.length ? '\n' : '') + keptVerbose.join('');
  try {
    fs.writeFileSync(hp, newContent, 'utf-8');
  } catch (e) {
    console.error('[fb performance] trim write failed:', e.message);
  }
}

function readRecentPerformance() {
  try { return fs.readFileSync(_historyPath(), 'utf-8'); } catch { return null; }
}

module.exports = {
  queueInsightsCheck, runInsightsSweep, appendPerformanceEntry,
  trimFbPerformanceHistory, readRecentPerformance,
};
