#!/usr/bin/env node
/**
 * Structural verification: skill documentation vs actual API routes.
 * Runs offline — no app needed. Parses skill .md files for API URLs,
 * then checks param names against a truth table extracted from cron-api.js.
 */

const fs = require('fs');
const path = require('path');

// ─── TRUTH TABLE (from cron-api.js code review) ───
const API_TRUTH = {
  '/api/zalo/send': {
    requiredOneOf: [['groupId', 'targetId', 'groupName', 'friendName']],
    required: ['text'],
    optional: ['isGroup', 'caption'],
  },
  '/api/zalo/send-media': {
    requiredOneOf: [['groupId', 'targetId', 'groupName', 'friendName']],
    requiredOneOfParams: [['mediaId', 'imagePath', 'filePath', 'path']],
    banned: ['mediaPath'],
    optional: ['caption', 'text', 'message', 'isGroup', 'allowInternalGenerated', 'allowInternal'],
  },
  '/api/zalo/friends': {
    optional: ['name', 'q'],
  },
  '/api/zalo/groups': {
    optional: ['name', 'q'],
  },
  '/api/zalo/ready': {},
  '/api/image/generate': {
    required: ['prompt'],
    optional: ['assets', 'size', 'targetId', 'isGroup', 'caption', 'autoSendTelegram', 'waitMs'],
  },
  '/api/image/generate-and-send-zalo': {
    required: ['prompt'],
    requiredOneOf: [['groupId', 'groupName', 'targetId', 'friendName']],
    optional: ['assets', 'size', 'caption', 'isGroup'],
  },
  '/api/image/status': {
    required: ['jobId'],
  },
  '/api/image/skills': {
    optional: ['name'],
  },
  '/api/image/preferences': {},
  '/api/telegram/send-photo': {
    required: ['imagePath'],
    optional: ['caption'],
  },
  '/api/fb/verify': {},
  '/api/fb/insights': {
    optional: ['days', 'limit'],
  },
  '/api/fb/post': {
    optional: ['preview', 'imagePath', 'message', 'approvalNonce'],
  },
  '/api/fb/recent': {
    optional: ['limit'],
  },
  '/api/fb/schedule/create': {
    required: ['postTime'],
    optional: ['leadMinutes', 'prompt', 'caption', 'label', 'imageSize', 'assetNames', 'autoPost'],
  },
  '/api/fb/schedule/list': {},
  '/api/fb/schedule/delete': { required: ['id'] },
  '/api/fb/schedule/approve': { required: ['id'] },
  '/api/fb/schedule/reject': { required: ['id'] },
  '/api/fb/schedule/edit-caption': { required: ['id', 'caption'] },
  '/api/fb/schedule/regenerate': { required: ['id'] },
  '/api/fb/schedule/telegram-command': { required: ['text'] },
  '/api/brand-assets/list': {},
  '/api/brand-assets/save': {
    required: ['name', 'base64'],
  },
  '/api/brand-assets/import': {
    requiredOneOf: [['path', 'filePath']],
    optional: ['name'],
  },
  '/api/google/gmail/attachment': {
    required: ['id', 'attachmentId'],
    optional: ['name', 'filename', 'outDir'],
  },
  '/api/cron/list': {},
  '/api/cron/create': {
    optional: ['label', 'cronExpr', 'oneTimeAt', 'groupId', 'groupIds', 'groupName', 'targetId', 'friendName', 'isGroup', 'content', 'mode', 'prompt'],
  },
  '/api/cron/delete': { required: ['id'] },
  '/api/cron/toggle': { required: ['id'], optional: ['enabled'] },
  '/api/cron/replace': { optional: ['deleteIds', 'creates'] },
  '/api/cron/audit': {},
  '/api/memory/write': { required: ['type', 'content'], optional: ['source'] },
  '/api/memory/search': { required: ['query'], optional: ['limit'] },
  '/api/memory/context': { required: ['query'], optional: ['channel', 'actorId', 'taskType', 'intent', 'scopeHints', 'limit'] },
  '/api/memory/delete': { required: ['id'] },
  '/api/memory/list': { optional: ['limit'] },
  '/api/memory/count': {},
  '/api/ceo-rules/write': { required: ['content'], optional: ['senderId'] },
  '/api/workspace/read': { required: ['path'] },
  '/api/workspace/append': { required: ['path', 'content'] },
  '/api/workspace/list': {},
  '/api/file/read': { required: ['path'] },
  '/api/file/write': { required: ['path', 'content'] },
  '/api/file/list': { required: ['path'] },
  '/api/file/search': { required: ['query'], optional: ['path', 'limit'] },
  '/api/file/open': { required: ['path'] },
  '/api/file/rename': { required: ['path', 'newName'] },
  '/api/file/copy': { required: ['path', 'dest'] },
  '/api/file/delete': { required: ['path'] },
  '/api/file/download': { required: ['path'] },
  '/api/knowledge/add': { required: ['category', 'title', 'content'] },
  '/api/exec': { required: ['command'], optional: ['timeout', 'cwd'] },
  '/api/report/daily': { optional: ['date'] },
  '/api/order/create': {},
  '/api/order/list': {},
  '/api/order/update': {},
  '/api/order/status': {},
  '/api/order/summary': {},
  '/api/inventory/adjust': {},
  '/api/inventory/check': {},
  '/api/inventory/alerts': {},
  '/api/inventory/set-min': {},
  '/api/leave/request': {},
  '/api/leave/list': {},
  '/api/leave/approve': {},
  '/api/leave/summary': {},
  '/api/user-skills/list': {},
  '/api/user-skills/create': { required: ['name', 'content'] },
  '/api/user-skills/update': { required: ['id'] },
  '/api/user-skills/delete': { required: ['id'] },
  '/api/user-skills/toggle': { required: ['id'] },
  '/api/user-skills/restore': { required: ['id'] },
  '/api/user-skills/check-conflict': {},
  '/api/skill/exec': { required: ['skillId', 'script'] },
  '/api/skill/test-exec': { required: ['code', 'runtime'] },
  '/api/skill/python-status': {},
  '/api/skill/python-install': {},
  '/api/media/list': {},
  '/api/media/search': {},
  '/api/media/upload': {},
  '/api/media/describe': {},
  '/api/system/info': {},
  '/api/capabilities': {},
  '/api/zalo-crm/export': {},
  '/api/google/status': {},
  '/api/google/health': {},
  '/api/google/calendar/events': {},
  '/api/google/calendar/create': {},
  '/api/google/calendar/update': {},
  '/api/google/calendar/delete': {},
  '/api/google/calendar/freebusy': {},
  '/api/google/calendar/free-slots': {},
  '/api/google/gmail/inbox': {},
  '/api/google/gmail/read': {},
  '/api/google/gmail/send': {},
  '/api/google/gmail/reply': {},
  '/api/google/drive/list': {},
  '/api/google/drive/upload': {},
  '/api/google/drive/download': {},
  '/api/google/drive/share': {},
  '/api/google/docs/list': {},
  '/api/google/docs/info': {},
  '/api/google/docs/read': {},
  '/api/google/docs/create': {},
  '/api/google/docs/write': {},
  '/api/google/docs/insert': {},
  '/api/google/docs/find-replace': {},
  '/api/google/docs/export': {},
  '/api/google/contacts/list': {},
  '/api/google/contacts/search': {},
  '/api/google/contacts/create': {},
  '/api/google/tasks/lists': {},
  '/api/google/tasks/list': {},
  '/api/google/tasks/create': {},
  '/api/google/tasks/complete': {},
  '/api/google/sheets/list': {},
  '/api/google/sheets/metadata': {},
  '/api/google/sheets/get': {},
  '/api/google/sheets/update': {},
  '/api/google/sheets/append': {},
  '/api/google/sheets/create': {},
  '/api/google/sheets/create-formatted': {},
  '/api/google/sheets/format': {},
  '/api/google/sheets/freeze': {},
  '/api/google/sheets/number-format': {},
  '/api/google/appscript/run': {},
};

// ─── EXTRACT API CALLS FROM SKILL FILES ───
function extractApiCalls(content, filePath) {
  const calls = [];
  // Match URLs like http://127.0.0.1:20200/api/...
  const urlRe = /https?:\/\/127\.0\.0\.1:20200(\/api\/[^\s"'?&]+)(?:\?([^\s"'`]+))?/g;
  let m;
  while ((m = urlRe.exec(content)) !== null) {
    const endpoint = m[1].replace(/[).,;:`]+$/g, '');
    const queryStr = m[2] || '';
    const params = {};
    if (queryStr) {
      // Parse query params, handling URL-encoded values
      const parts = queryStr.split('&');
      for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq > 0) {
          const key = decodeURIComponent(part.substring(0, eq));
          // Skip placeholder values like <id>, <prompt>, etc.
          params[key] = part.substring(eq + 1);
        }
      }
    }
    // Also extract params from POST body in nearby text
    const lineIdx = content.lastIndexOf('\n', m.index);
    const nextLines = content.substring(m.index, Math.min(m.index + 500, content.length));
    const bodyMatch = nextLines.match(/body="?\{([^}]+)\}"?/);
    if (bodyMatch) {
      const bodyKeys = bodyMatch[1].match(/"([^"]+)"\s*:/g);
      if (bodyKeys) {
        for (const bk of bodyKeys) {
          const key = bk.replace(/[":]/g, '').trim();
          if (key) params[key] = '<body>';
        }
      }
    }
    calls.push({
      endpoint,
      params: Object.keys(params),
      raw: m[0].substring(0, 120),
      line: content.substring(0, m.index).split('\n').length,
    });
  }
  return calls;
}

// ─── VERIFY ───
function verify(calls, filePath) {
  const issues = [];
  for (const call of calls) {
    const truth = API_TRUTH[call.endpoint];
    if (!truth) {
      if (call.endpoint.endsWith('/*')) {
        const prefix = call.endpoint.slice(0, -1);
        if (Object.keys(API_TRUTH).some(k => k.startsWith(prefix))) continue;
      }
      // Check if it's a prefix match (e.g., /api/fb/schedule/*)
      const parentPath = call.endpoint.replace(/\/[^/]+$/, '/*');
      if (!Object.keys(API_TRUTH).some(k => call.endpoint.startsWith(k.replace('/*', '')))) {
        issues.push({
          severity: 'ERROR',
          file: filePath,
          line: call.line,
          endpoint: call.endpoint,
          msg: `Endpoint NOT FOUND in API truth table`,
        });
      }
      continue;
    }
    // Check banned params
    if (truth.banned) {
      for (const bp of truth.banned) {
        if (call.params.includes(bp)) {
          issues.push({
            severity: 'CRITICAL',
            file: filePath,
            line: call.line,
            endpoint: call.endpoint,
            msg: `BANNED param "${bp}" used — API will reject. Use "${truth.required?.join('" or "')}" instead.`,
          });
        }
      }
    }
  }
  return issues;
}

// ─── MAIN ───
const skillsDir = path.join(__dirname, '..', 'skills');
const files = [];

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archived') continue;
      walkDir(fp);
    } else if (entry.name.endsWith('.md')) {
      files.push(fp);
    }
  }
}
walkDir(skillsDir);

let totalCalls = 0;
let totalIssues = 0;
const allIssues = [];

console.log('=== SKILL API DOCUMENTATION VERIFICATION ===\n');
console.log(`Scanning ${files.length} skill files...\n`);

for (const fp of files) {
  const content = fs.readFileSync(fp, 'utf-8');
  const relPath = path.relative(path.join(__dirname, '..'), fp);
  const calls = extractApiCalls(content, relPath);
  if (calls.length === 0) continue;
  totalCalls += calls.length;
  const issues = verify(calls, relPath);
  if (issues.length > 0) {
    allIssues.push(...issues);
    totalIssues += issues.length;
  }
  console.log(`  ${relPath}: ${calls.length} API calls, ${issues.length} issues`);
}

console.log(`\n--- SUMMARY ---`);
console.log(`Files scanned: ${files.length}`);
console.log(`API calls found: ${totalCalls}`);
console.log(`Issues found: ${totalIssues}`);

if (allIssues.length > 0) {
  console.log(`\n--- ISSUES ---\n`);
  for (const iss of allIssues) {
    console.log(`[${iss.severity}] ${iss.file}:${iss.line}`);
    console.log(`  Endpoint: ${iss.endpoint}`);
    console.log(`  ${iss.msg}\n`);
  }
} else {
  console.log(`\n  ALL SKILL DOCS MATCH API TRUTH TABLE\n`);
}

// ─── LIVE TEST COMMANDS (for when app is running) ───
console.log('--- LIVE TEST COMMANDS (run when app is open) ---\n');
const liveTests = [
  { label: 'Capabilities (smoke)', cmd: 'curl -s http://127.0.0.1:20200/api/capabilities' },
  { label: 'Cron list', cmd: 'curl -s http://127.0.0.1:20200/api/cron/list' },
  { label: 'Zalo ready', cmd: 'curl -s http://127.0.0.1:20200/api/zalo/ready' },
  { label: 'FB verify', cmd: 'curl -s http://127.0.0.1:20200/api/fb/verify' },
  { label: 'FB insights', cmd: 'curl -s "http://127.0.0.1:20200/api/fb/insights?days=7"' },
  { label: 'Brand assets list', cmd: 'curl -s http://127.0.0.1:20200/api/brand-assets/list' },
  { label: 'Zalo group search', cmd: 'curl -s "http://127.0.0.1:20200/api/zalo/groups?name=Demo"' },
  { label: 'Image skills', cmd: 'curl -s http://127.0.0.1:20200/api/image/skills' },
  { label: 'User skills list', cmd: 'curl -s http://127.0.0.1:20200/api/user-skills/list' },
  { label: 'send-media BANNED param (expect 400)', cmd: 'curl -s "http://127.0.0.1:20200/api/zalo/send-media?mediaPath=test.png&groupId=123"' },
  { label: 'send-media generated image path shape', cmd: 'curl -s "http://127.0.0.1:20200/api/zalo/send-media?groupId=123&imagePath=brand-assets/generated/example.png&allowInternalGenerated=true"' },
  { label: 'Memory list', cmd: 'curl -s http://127.0.0.1:20200/api/memory/list' },
  { label: 'Report daily', cmd: 'curl -s http://127.0.0.1:20200/api/report/daily' },
  { label: 'Google status', cmd: 'curl -s http://127.0.0.1:20200/api/google/status' },
  { label: 'System info', cmd: 'curl -s http://127.0.0.1:20200/api/system/info' },
];
for (const t of liveTests) {
  console.log(`# ${t.label}`);
  console.log(`${t.cmd}\n`);
}

process.exit(totalIssues > 0 ? 1 : 0);
