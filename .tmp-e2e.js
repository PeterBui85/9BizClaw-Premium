process.env.NODE_ENV = 'test';
require('fs').writeFileSync('.tmp-elec.js', `module.exports={BrowserWindow:{getAllWindows:()=>[]},ipcMain:{handle:()=>{}},app:{getPath:()=>process.cwd(),getName:()=>'9bizclaw',whenReady:()=>Promise.resolve()}};`);
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(req, parent, ...rest) {
  if (req === 'electron') return require.resolve('./.tmp-elec.js');
  return origResolve.call(this, req, parent, ...rest);
};
const http = require('http');
let _port = 20200;
let _token = '';
function rq(method, path, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const auth = _token ? { 'Authorization': 'Bearer ' + _token } : {};
    const r = http.request({ hostname: '127.0.0.1', port: _port, path, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...auth, ...headers }, timeout: 30000 }, (res) => {
      let chunks = ''; res.on('data', c => chunks += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); } catch { resolve({ status: res.statusCode, body: chunks }); } });
    });
    r.on('error', (e) => resolve({ status: 0, body: null, error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: null, error: 'timeout' }); });
    r.write(data); r.end();
  });
}

(async () => {
  const { startCronApi, getCronApiPort, getCronApiToken } = require('./electron/lib/cron-api');
  startCronApi();
  await new Promise(r => setTimeout(r, 500));
  _port = getCronApiPort();
  _token = getCronApiToken();
  let PASS = 0, FAIL = 0;
  const check = (n, ok, d='') => { if (ok) { PASS++; console.log('PASS:', n); } else { FAIL++; console.log('FAIL:', n, '|', d); } };

  for (const s of ((await rq('POST', '/api/user-skills/list', null, { 'X-Source-Channel': 'telegram' })).body?.skills || [])) {
    if (s.id.startsWith('e2e-')) await rq('POST', '/api/user-skills/delete', { id: s.id }, { 'X-Source-Channel': 'telegram' });
  }

  const create = await rq('POST', '/api/user-skills/create', {
    name: 'E2E LTV',
    trigger: 'tính LTV',
    content: 'run calc',
    scripts: [{ filename: 'calc.py', runtime: 'python', code: 'import sys\nprint(f"LTV={sys.argv[1] if len(sys.argv) > 1 else 0}")' }],
  }, { 'X-Source-Channel': 'telegram' });
  const sid = create.body?.entry?.id;
  check('create has scripts', (create.body?.entry?.scripts || []).length === 1);

  const exec = await rq('POST', '/api/skill/exec', { skillId: sid, script: 'calc', args: ['9999'] }, { 'X-Source-Channel': 'telegram' });
  console.log('Full exec response:', JSON.stringify(exec, null, 2));

  await rq('POST', '/api/user-skills/delete', { id: sid }, { 'X-Source-Channel': 'telegram' });
  console.log(`\nSummary: PASS=${PASS} FAIL=${FAIL}`);
  process.exit(FAIL > 0 ? 1 : 0);
})();
