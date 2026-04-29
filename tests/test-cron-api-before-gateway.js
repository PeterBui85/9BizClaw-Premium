const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

const startOpenClawIdx = source.indexOf('async function startOpenClaw(opts = {})');
assert(startOpenClawIdx !== -1, 'startOpenClaw() not found');

const spawnIdx = source.indexOf('const r = await _startOpenClawImpl(opts);', startOpenClawIdx);
assert(spawnIdx !== -1, '_startOpenClawImpl() call not found inside startOpenClaw()');

const seedIdx = source.indexOf('seedWorkspace();', startOpenClawIdx);
const cronApiIdx = source.indexOf('startCronApi();', startOpenClawIdx);
assert(seedIdx !== -1 && seedIdx < spawnIdx, 'startOpenClaw() must seed workspace before gateway spawn');
assert(cronApiIdx !== -1 && cronApiIdx < spawnIdx, 'startOpenClaw() must start/inject cron API token before gateway spawn');
assert(seedIdx < cronApiIdx, 'workspace seed must happen before cron API token injection');

const cacheCommentIdx = source.indexOf('OpenClaw snapshots bootstrap files per sessionKey', startOpenClawIdx);
assert(cacheCommentIdx !== -1 && cacheCommentIdx < spawnIdx, 'missing explanation for pre-gateway cron API token injection');

const authCheckIdx = source.indexOf('if (needsToken && params.token !== _cronApiToken)');
assert(authCheckIdx !== -1, 'cron API auth gate not found');
const authLogIdx = source.indexOf("[cron-api] auth failed:", authCheckIdx);
assert(authLogIdx !== -1, 'cron API auth failures must be logged without exposing token value');

console.log('PASS: cron API token is prepared before OpenClaw gateway spawn');
