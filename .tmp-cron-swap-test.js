// Test cron group-swap defenses. Uses synthetic groups.json with a deliberate
// duplicate Vietnamese name to exercise the ambiguity + cross-check paths.
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock Electron BEFORE anything requires it.
fs.writeFileSync('.tmp-elec.js', `module.exports={BrowserWindow:{getAllWindows:()=>[]},ipcMain:{handle:()=>{}},app:{getPath:(k)=>process.cwd(),getName:()=>'9bizclaw',whenReady:()=>Promise.resolve(),isPackaged:false}};`);
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(req, parent, ...rest) {
  if (req === 'electron') return require.resolve('./.tmp-elec.js');
  return origResolve.call(this, req, parent, ...rest);
};

// Seed a fake openzca groups.json BEFORE cron-api loads.
// Two of these share the name "LỊCH CÁ NHÂN" — the exact prod swap case.
const zcaDir = path.join(os.homedir(), '.openzca', 'profiles', 'default', 'cache');
fs.mkdirSync(zcaDir, { recursive: true });
const groupsPath = path.join(zcaDir, 'groups.json');
const groupsBackup = fs.existsSync(groupsPath) ? fs.readFileSync(groupsPath, 'utf-8') : null;
fs.writeFileSync(groupsPath, JSON.stringify([
  { groupId: 'g-personal-aaa1', name: 'LỊCH CÁ NHÂN' },
  { groupId: 'g-personal-bbb2', name: 'LỊCH CÁ NHÂN' },          // duplicate name
  { groupId: 'g-numina-cccc',   name: 'LỊCH KH NUMINA' },
  { groupId: 'g-unique-dddd',   name: 'Khách hàng VIP Đà Nẵng' },
]));

const http = require('http');
let _port = 0;
let _token = '';
function rq(method, p, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const auth = _token ? { 'Authorization': 'Bearer ' + _token } : {};
    const r = http.request({ hostname: '127.0.0.1', port: _port, path: p, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...auth, ...headers }, timeout: 15000 }, (res) => {
      let chunks = ''; res.on('data', c => chunks += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); } catch { resolve({ status: res.statusCode, body: chunks }); } });
    });
    r.on('error', (e) => resolve({ status: 0, body: null, error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: null, error: 'timeout' }); });
    r.write(data); r.end();
  });
}

(async () => {
  // Suppress sendCeoAlert / sendTelegram side effects.
  process.env._9BIZ_SUPPRESS_TG = '1';

  const { startCronApi, getCronApiPort, getCronApiToken } = require('./electron/lib/cron-api');
  startCronApi();
  await new Promise(r => setTimeout(r, 500));
  _port = getCronApiPort();
  _token = getCronApiToken();
  if (!_port) { console.error('cron-api did not bind'); process.exit(2); }

  let PASS = 0, FAIL = 0;
  const check = (n, ok, d='') => { if (ok) { PASS++; console.log('PASS:', n); } else { FAIL++; console.log('FAIL:', n, '|', d); } };

  const H = { 'X-Source-Channel': 'telegram' };
  const futureISO = new Date(Date.now() + 2 * 60 * 60_000).toISOString(); // keep Z so JS parses as UTC

  // ── 1. Agent-mode cron with AMBIGUOUS groupName → must 400 with candidates ──
  const r1 = await rq('POST', '/api/cron/create', {
    mode: 'agent', label: 'amb-name', prompt: 'test',
    groupName: 'LỊCH CÁ NHÂN', oneTimeAt: futureISO,
  }, H);
  check('ambiguous groupName rejected (400)', r1.status === 400 && /matches 2 groups/.test(r1.body?.error || ''),
    JSON.stringify(r1.body));

  // ── 2. Agent-mode with groupId + groupName MISMATCH → must 400 ──
  const r2 = await rq('POST', '/api/cron/create', {
    mode: 'agent', label: 'mismatch', prompt: 'test',
    groupId: 'g-numina-cccc', groupName: 'LỊCH CÁ NHÂN', oneTimeAt: futureISO,
  }, H);
  check('groupId/groupName mismatch rejected (400)', r2.status === 400 && /mismatch|matches \d+ groups/i.test(r2.body?.error || ''),
    JSON.stringify(r2.body));

  // ── 3. Agent-mode with groupId only (unambiguous) → 200, stored correctly ──
  // ── 3. STRICT MODE 2026-05-15: groupId WITHOUT groupName → must 400 ──
  const r3 = await rq('POST', '/api/cron/create', {
    mode: 'agent', label: 'id-only', prompt: 'test ok',
    groupId: 'g-personal-aaa1', oneTimeAt: futureISO,
  }, H);
  check('groupId-only rejected by strict mode (400)',
    r3.status === 400 && /BOTH groupId and groupName/i.test(r3.body?.error || ''),
    JSON.stringify(r3.body));

  // ── 3b. groupId + matching groupName (the prod-incident-prevention path) ──
  const r3b = await rq('POST', '/api/cron/create', {
    mode: 'agent', label: 'id-only-fixed', prompt: 'test ok',
    groupId: 'g-personal-aaa1', groupName: 'LỊCH CÁ NHÂN', oneTimeAt: futureISO,
  }, H);
  check('groupId+matching groupName happy path (200)',
    r3b.status === 200 && r3b.body?.entry?.zaloTarget?.id === 'g-personal-aaa1',
    JSON.stringify(r3b.body));

  // ── 4. STRICT MODE: groupName WITHOUT groupId → must 400 ──
  const r4 = await rq('POST', '/api/cron/create', {
    mode: 'agent', label: 'name-only', prompt: 'test ok',
    groupName: 'LỊCH KH NUMINA', oneTimeAt: futureISO,
  }, H);
  check('groupName-only rejected by strict mode (400)',
    r4.status === 400 && /BOTH groupName and groupId/i.test(r4.body?.error || ''),
    JSON.stringify(r4.body));

  // ── 5. Agent-mode groupId + matching groupName → 200, no double-binding ──
  const r5 = await rq('POST', '/api/cron/create', {
    mode: 'agent', label: 'id+name-match', prompt: 'test ok',
    groupId: 'g-unique-dddd', groupName: 'Khách hàng VIP Đà Nẵng', oneTimeAt: futureISO,
  }, H);
  check('matching id+name accepted (200)',
    r5.status === 200 && r5.body?.entry?.zaloTarget?.id === 'g-unique-dddd',
    JSON.stringify(r5.body));

  // ── 5b. targetId + isGroup:true without groupName → must 400 (B-I2 fix) ──
  const r5b = await rq('POST', '/api/cron/create', {
    mode: 'agent', label: 'targetid-no-name', prompt: 'test',
    targetId: 'g-unique-dddd', isGroup: true, oneTimeAt: futureISO,
  }, H);
  check('targetId+isGroup without groupName rejected (400)',
    r5b.status === 400 && /requires groupName/i.test(r5b.body?.error || ''),
    JSON.stringify(r5b.body));

  // ── 6. Text-mode (legacy) with ambiguous groupName → 409 ──
  const r6 = await rq('POST', '/api/cron/create', {
    label: 'legacy-amb', content: 'hello',
    groupId: 'LỊCH CÁ NHÂN',   // legacy path treats this as id-or-name
    oneTimeAt: futureISO,
  }, H);
  check('legacy text-mode ambiguous name rejected (409)',
    r6.status === 409 && /matches 2 groups/.test(r6.body?.error || ''),
    JSON.stringify(r6.body));

  // ── 7. Text-mode with valid groupId + groupName → 200 ──
  const r7 = await rq('POST', '/api/cron/create', {
    label: 'legacy-ok', content: 'hello',
    groupId: 'g-unique-dddd', groupName: 'Khách hàng VIP Đà Nẵng', oneTimeAt: futureISO,
  }, H);
  check('legacy text-mode happy path with both fields (200)', r7.status === 200, JSON.stringify(r7.body));

  // ── 7b. Text-mode with groupId only → must 400 (strict mode) ──
  const r7b = await rq('POST', '/api/cron/create', {
    label: 'legacy-id-only', content: 'hello',
    groupId: 'g-unique-dddd', oneTimeAt: futureISO,
  }, H);
  check('legacy text-mode groupId-only rejected (400)',
    r7b.status === 400 && /BOTH groupId and groupName/i.test(r7b.body?.error || ''),
    JSON.stringify(r7b.body));

  // ── 8. /api/cron/audit endpoint ──
  // First create a deliberately-mismatched cron (bypassing strict mode by
  // talking to the loader directly). We do this by inserting a fake entry
  // into custom-crons.json via the file system. Then call /api/cron/audit.
  const ws = path.dirname(groupsPath).replace(/\\/g, '/').replace(/.openzca.+$/, '');
  // Simpler: just call audit with current crons (those from this test) and
  // verify it returns 0 findings for our well-formed entries. (The wrong-
  // binding detection requires legacy crons in custom-crons.json which we
  // don't have in synthetic test.)
  const r8 = await rq('GET', '/api/cron/audit', null, H);
  check('cron audit endpoint reachable (200)', r8.status === 200 && typeof r8.body?.totalCrons === 'number',
    JSON.stringify(r8.body).slice(0, 200));
  check('cron audit returns findings array', r8.status === 200 && Array.isArray(r8.body?.findings),
    JSON.stringify(r8.body).slice(0, 200));

  // Cleanup: delete all crons we created (best effort)
  for (const r of [r3b, r5, r7]) {
    const cid = r.body?.id;
    if (cid) await rq('POST', '/api/cron/delete', { id: cid }, H);
  }

  // Restore groups.json
  if (groupsBackup === null) {
    try { fs.unlinkSync(groupsPath); } catch {}
  } else {
    fs.writeFileSync(groupsPath, groupsBackup);
  }

  console.log(`\nSummary: PASS=${PASS} FAIL=${FAIL}`);
  process.exit(FAIL > 0 ? 1 : 0);
})();
