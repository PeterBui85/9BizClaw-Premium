'use strict';
// Verify the memory/data/zalo feature works IN THE PRODUCTION RUNTIME (Electron's
// Node 18 + electron-ABI native modules), not system node. This is the harness that
// would have caught the node:sqlite bug (node:sqlite is absent in Node 18).
//
// RUN:  ELECTRON_RUN_AS_NODE=1 npx electron electron/scripts/verify-runtime.js
//   (ELECTRON_RUN_AS_NODE makes the electron binary behave as a Node interpreter
//    on its bundled Node 18, with electron-ABI better-sqlite3 resolvable.)
//
// It reads REAL data (the live openzca SQLite + workspace) read-only — it writes
// nothing to live data (sacred snapshot goes to a temp dir that is deleted).

const path = require('path');
const os = require('os');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); cond ? pass++ : fail++; return cond; };

console.log('=== 9BizClaw runtime verification (production ABI) ===');
console.log('node version:', process.versions.node, '| electron:', process.versions.electron || '(not electron)');

// 1. Confirm this IS the production runtime (Node 18, no node:sqlite).
ok(process.versions.node.startsWith('18.'), 'runtime is Node 18 (Electron 28 main) — got ' + process.versions.node);
let hasNodeSqlite = false; try { require('node:sqlite'); hasNodeSqlite = true; } catch {}
ok(!hasNodeSqlite, 'node:sqlite is ABSENT here (this is exactly why the feature must use better-sqlite3)');

// 2. better-sqlite3 loads under this ABI.
let Database = null;
try { Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3')); ok(true, 'better-sqlite3 loads (electron ABI)'); }
catch (e) { ok(false, 'better-sqlite3 load FAILED: ' + e.message); }

// 3. The feature module loads without throwing in this runtime.
let u = null;
try { u = require(path.join(__dirname, '..', 'lib', 'customer-memory-updater')); ok(true, 'customer-memory-updater.js loads in production runtime'); }
catch (e) { ok(false, 'customer-memory-updater load FAILED: ' + e.message); }

// 4. openDb opens the REAL openzca SQLite + readNewDmMessages returns real messages.
if (u) {
  try {
    const db = u.openDb('default');
    if (!db) {
      ok(false, 'openDb returned null — ~/.openzca/profiles/default/messages.sqlite missing (connect Zalo first)');
    } else {
      const selfId = u.readSelfId(db, 'default');
      ok(!!selfId, 'readSelfId from real db: ' + (selfId || '(empty)'));
      const threads = u.readNewDmMessages(db, 'default', selfId, {}, 0); // baseline 0 = read all (verify only)
      let total = 0; for (const e of threads.values()) total += e.msgs.length;
      ok(true, 'readNewDmMessages on REAL db: ' + threads.size + ' DM thread(s), ' + total + ' message(s) readable');
      try { db.close(); } catch {}
    }
  } catch (e) { ok(false, 'real DB read FAILED: ' + e.message); }
}

// 5. Sacred snapshot of REAL workspace data (to a temp dir, then deleted).
try {
  const sd = require(path.join(__dirname, '..', 'lib', 'sacred-data'));
  const realWs = path.join(os.homedir(), 'AppData', 'Roaming', '9bizclaw');
  if (!fs.existsSync(realWs)) {
    ok(false, 'workspace not found at ' + realWs + ' (run the app once first)');
  } else {
    const dest = path.join(os.tmpdir(), 'verify-sacred-' + process.pid);
    const r = sd._snapshotTo(realWs, dest, 'verify');
    const zu = (r.counts && r.counts['memory/zalo-users']) || 0;
    ok(zu > 0 || (r.counts && Object.keys(r.counts).length > 0), 'sacred snapshot of REAL data: ' + JSON.stringify(r.counts || r));
    fs.rmSync(dest, { recursive: true, force: true });
  }
} catch (e) { ok(false, 'sacred snapshot FAILED: ' + e.message); }

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES: ' + fail) + '  (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
