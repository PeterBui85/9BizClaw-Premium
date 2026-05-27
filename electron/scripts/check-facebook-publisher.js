#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const fbPublisher = require(path.join(__dirname, '..', 'lib', 'fb-publisher'));

const failures = [];

function assert(name, condition, detail) {
  if (!condition) failures.push(`${name}: ${detail || 'assertion failed'}`);
}

const t = fbPublisher._test || {};
assert('exports hasPageCreateContentTask', typeof t.hasPageCreateContentTask === 'function', 'missing helper');
assert('accepts classic Page create task', t.hasPageCreateContentTask?.(['CREATE_CONTENT']) === true);
assert('accepts profile-plus Page create task', t.hasPageCreateContentTask?.(['PROFILE_PLUS_CREATE_CONTENT']) === true);
assert('rejects read-only Page tasks', t.hasPageCreateContentTask?.(['MESSAGING', 'ANALYZE']) === false);
assert('exports getInsights', typeof fbPublisher.getInsights === 'function', 'missing insights reader');
assert('exports hasPageInsightsPermission', typeof t.hasPageInsightsPermission === 'function', 'missing insights permission helper');
assert('accepts read_insights permission', t.hasPageInsightsPermission?.(['read_insights']) === true);
assert('accepts pages_read_engagement permission fallback', t.hasPageInsightsPermission?.(['pages_read_engagement']) === true);
assert('rejects publish-only permissions for insights', t.hasPageInsightsPermission?.(['pages_manage_posts']) === false);
assert('uses current Facebook views metric', Array.isArray(t.insightsMetrics) && t.insightsMetrics.includes('page_media_view'));
assert('uses current Facebook follows metric', Array.isArray(t.insightsMetrics) && t.insightsMetrics.includes('page_follows'));
assert('does not query deprecated page impressions metric', !t.insightsMetrics?.includes('page_impressions'));
assert('does not query deprecated page fans metric', !t.insightsMetrics?.includes('page_fans'));

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'ui', 'dashboard.html'), 'utf8');
const cronApi = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cron-api.js'), 'utf8');
const agents = fs.readFileSync(path.join(__dirname, '..', '..', 'AGENTS.md'), 'utf8');
assert(
  'dashboard guides adding permissions in App Dashboard',
  dashboard.includes('Quản lý mọi thứ trên Trang') && dashboard.includes('Business Asset User Profile Access'),
  'missing App Dashboard permission setup guidance'
);
assert(
  'dashboard guides Page token via Graph API Explorer',
  dashboard.includes('Lấy mã truy cập Trang') && dashboard.includes('Generate Access Token'),
  'missing Graph API Explorer page token guidance'
);
assert(
  'cron api requires approval nonce for Facebook post',
  cronApi.includes('approvalNonce') && cronApi.includes('preview=1') && cronApi.includes('isAutoMode') && cronApi.includes('if (!isAutoMode)'),
  'posting endpoint must require a CEO-approved preview nonce except explicit AUTO-MODE'
);
const facebookWorkflow = fs.readFileSync(path.join(__dirname, '..', '..', 'skills', 'marketing', 'facebook-post-workflow.md'), 'utf8');
assert(
  'cron api exposes Facebook insights endpoint',
  cronApi.includes("urlPath === '/api/fb/insights'"),
  'missing /api/fb/insights route'
);
assert(
  'bot instructions include Facebook approval flow',
  (agents.includes('preview Telegram') || agents.includes('approvalNonce')) &&
    (agents.includes('/api/fb/post') || agents.includes('send-photo')),
  'AGENTS.md must tell the bot to preview before posting'
);
assert(
  'bot instructions document AUTO-MODE Facebook bypass',
  agents.includes('autoMode=1') &&
    agents.includes('KHÔNG ÁP DỤNG') &&
    facebookWorkflow.includes('AUTO-MODE') &&
    facebookWorkflow.includes('autoMode=1') &&
    facebookWorkflow.includes('KHÔNG gọi preview'),
  'AUTO-MODE must bypass Facebook preview/approval in both AGENTS.md and facebook-post-workflow.md'
);
const facebookInsightsSkillPath = path.join(__dirname, '..', '..', 'skills', 'operations', 'facebook-insights.md');
const facebookInsightsSkill = fs.existsSync(facebookInsightsSkillPath) ? fs.readFileSync(facebookInsightsSkillPath, 'utf8') : '';
assert(
  'Facebook insights skill teaches read_insights',
  facebookInsightsSkill.includes('read_insights') && facebookInsightsSkill.includes('/api/fb/insights'),
  'skill must document read_insights and the local insights endpoint'
);

if (failures.length) {
  console.error('[facebook-publisher] FAIL');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}

console.log('[facebook-publisher] PASS Page token task validation and setup guidance');
