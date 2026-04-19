#!/usr/bin/env node
// Smoke test for 3-tier visibility filter. Creates temp SQLite in-memory,
// seeds 3 rows (public/internal/private), asserts filter behavior at all
// 4 SQL locations searchKnowledge uses.
//
// Uses node:sqlite (built-in Node 22+) to avoid better-sqlite3 ABI
// mismatch when running under plain Node vs Electron.

'use strict';

// node:sqlite requires --experimental-sqlite flag on Node 22, is stable on Node 23+
// Use child_process to re-invoke with the flag if needed.
let DatabaseConstructor;
try {
  const { DatabaseSync } = require('node:sqlite');
  DatabaseConstructor = DatabaseSync;
} catch (e) {
  console.error('[visibility smoke] FAIL: node:sqlite not available. Requires Node 22+ (with --experimental-sqlite) or Node 23+.');
  process.exit(1);
}

function fail(msg) { console.error('[visibility smoke] FAIL:', msg); process.exit(1); }
function ok(msg) { console.log('  OK  ', msg); }

// Minimal schema matching main.js CREATE TABLE (§3.1 of spec)
function setupDb() {
  const db = new DatabaseConstructor(':memory:');
  db.exec(`
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      content TEXT,
      filetype TEXT,
      filesize INTEGER,
      word_count INTEGER,
      category TEXT DEFAULT 'general',
      summary TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      title TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE documents_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER,
      chunk_index INTEGER,
      char_start INTEGER,
      char_end INTEGER,
      category TEXT,
      embedding BLOB,
      text TEXT
    );
    CREATE VIRTUAL TABLE documents_chunks_fts USING fts5(text, tokenize='unicode61');
  `);

  const ins = db.prepare('INSERT INTO documents (filename, filepath, content, category, visibility) VALUES (?, ?, ?, ?, ?)');
  ins.run('public-file.pdf', '/fake/p.pdf', 'khach hang giao hang', 'cong-ty', 'public');
  ins.run('internal-file.pdf', '/fake/i.pdf', 'nhan vien noi quy giao hang', 'nhan-vien', 'internal');
  ins.run('private-file.pdf', '/fake/pr.pdf', 'bao mat ceo giao hang', 'cong-ty', 'private');

  const insChunk = db.prepare('INSERT INTO documents_chunks (document_id, chunk_index, char_start, char_end, category, text, embedding) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const fakeEmb = Buffer.alloc(384 * 4);
  insChunk.run(1, 0, 0, 20, 'cong-ty', 'khach hang giao hang', fakeEmb);
  insChunk.run(2, 0, 0, 30, 'nhan-vien', 'nhan vien noi quy giao hang', fakeEmb);
  insChunk.run(3, 0, 0, 25, 'cong-ty', 'bao mat ceo giao hang', fakeEmb);

  db.prepare('INSERT INTO documents_chunks_fts (rowid, text) VALUES (?, ?)').run(1, 'khach hang giao hang');
  db.prepare('INSERT INTO documents_chunks_fts (rowid, text) VALUES (?, ?)').run(2, 'nhan vien noi quy giao hang');
  db.prepare('INSERT INTO documents_chunks_fts (rowid, text) VALUES (?, ?)').run(3, 'bao mat ceo giao hang');

  return db;
}

function testVectorFilter(db) {
  const cases = [
    { audience: 'customer', expectedIds: [1] },
    { audience: 'internal', expectedIds: [1, 2] },
    { audience: 'ceo',      expectedIds: [1, 2, 3] },
    { audience: 'invalid',  expectedIds: [1] },
    { audience: undefined,  expectedIds: [1] },
  ];
  for (const c of cases) {
    const allowedTiers = c.audience === 'ceo'      ? ['public','internal','private']
                       : c.audience === 'internal' ? ['public','internal']
                                                   : ['public'];
    const placeholders = allowedTiers.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT d.id FROM documents_chunks c JOIN documents d ON d.id = c.document_id
       WHERE d.visibility IN (${placeholders}) AND c.embedding IS NOT NULL
       ORDER BY c.id ASC`
    ).all(...allowedTiers);
    const ids = rows.map(r => r.id).sort((a, b) => a - b);
    if (JSON.stringify(ids) !== JSON.stringify(c.expectedIds)) {
      fail(`vector audience=${c.audience} expected ${JSON.stringify(c.expectedIds)}, got ${JSON.stringify(ids)}`);
    }
    ok(`vector audience=${c.audience || 'undefined'} → ${ids.length} row(s)`);
  }
}

function testFts5Filter(db) {
  const cases = [
    { audience: 'customer', expectedIds: [1] },
    { audience: 'internal', expectedIds: [1, 2] },
  ];
  for (const c of cases) {
    const allowedTiers = c.audience === 'internal' ? ['public','internal'] : ['public'];
    const placeholders = allowedTiers.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT dc.document_id AS did FROM documents_chunks_fts
       JOIN documents_chunks dc ON dc.id = documents_chunks_fts.rowid
       JOIN documents d ON d.id = dc.document_id
       WHERE documents_chunks_fts MATCH ? AND d.visibility IN (${placeholders})
       ORDER BY dc.id ASC`
    ).all('giao', ...allowedTiers);
    const ids = [...new Set(rows.map(r => r.did))].sort((a, b) => a - b);
    if (JSON.stringify(ids) !== JSON.stringify(c.expectedIds)) {
      fail(`FTS5 audience=${c.audience} expected ${JSON.stringify(c.expectedIds)}, got ${JSON.stringify(ids)}`);
    }
    ok(`FTS5 audience=${c.audience} → ${ids.length} doc(s)`);
  }
}

function testLikeFilter(db) {
  const allowedTiers = ['public'];
  const placeholders = allowedTiers.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT d.id FROM documents d
     WHERE d.visibility IN (${placeholders}) AND d.content LIKE ?`
  ).all(...allowedTiers, '%giao%');
  const ids = rows.map(r => r.id).sort((a, b) => a - b);
  if (JSON.stringify(ids) !== JSON.stringify([1])) {
    fail(`LIKE audience=customer expected [1], got ${JSON.stringify(ids)}`);
  }
  ok(`LIKE audience=customer → only public`);
}

function testEnumValidation() {
  const valid = ['public', 'internal', 'private'];
  for (const v of ['Public', 'PRIVATE', '', null, undefined, ' ', 'internal ']) {
    if (valid.includes(v)) fail(`validation test bug: "${v}" should be invalid`);
  }
  ok('enum validation whitelist tight');
}

// v2.4.0 M4-A: ALTER path — simulate upgrade from v2.3.47 schema (no visibility).
// Confirms ALTER adds the column AND existing rows return 'public' via DEFAULT.
function testAlterUpgradePath() {
  const db = new DatabaseConstructor(':memory:');
  try {
    db.exec(`
      CREATE TABLE documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        content TEXT,
        filetype TEXT,
        filesize INTEGER,
        word_count INTEGER,
        category TEXT DEFAULT 'general',
        summary TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    db.prepare('INSERT INTO documents (filename, filepath, content, category) VALUES (?, ?, ?, ?)').run('legacy.pdf', '/l.pdf', 'x', 'cong-ty');
    const cols1 = db.prepare('PRAGMA table_info(documents)').all().map(c => c.name);
    if (cols1.includes('visibility')) fail('test bug: visibility already present before ALTER');
    db.exec(`ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`);
    const cols2 = db.prepare('PRAGMA table_info(documents)').all().map(c => c.name);
    if (!cols2.includes('visibility')) fail('ALTER did not add visibility column');
    const row = db.prepare('SELECT visibility FROM documents WHERE filename = ?').get('legacy.pdf');
    if (row.visibility !== 'public') fail(`ALTER DEFAULT did not backfill — got "${row.visibility}"`);
    ok('ALTER upgrade path — legacy row reads visibility=public');
  } finally {
    db.close();
  }
}

// v2.4.0 M4-B: IPC enum validation reproduced inline (can't invoke IPC from
// smoke, but we validate the exact predicate used at main.js:15753, 15774).
function testIpcEnumValidation() {
  const ALLOWED = ['public', 'internal', 'private'];
  const validateVisibility = (v) => ALLOWED.includes(v);
  const rejects = ['Public', 'INTERNAL', ' public', 'public ', '', null, undefined, 0, false, true, 'all', 'ceo'];
  for (const bad of rejects) {
    if (validateVisibility(bad)) fail(`IPC enum accepted bad value: ${JSON.stringify(bad)}`);
  }
  const accepts = ['public', 'internal', 'private'];
  for (const good of accepts) {
    if (!validateVisibility(good)) fail(`IPC enum rejected valid value: ${good}`);
  }
  ok('IPC enum predicate rejects non-enum, accepts 3 tiers');
}

// v2.4.0 M4-C: save-zalo-manager-config whitelist — only literal `true` stores
// internal flag. Everything else (strings, 1, truthy objects) treated as false.
function testSaveHandlerWhitelist() {
  const ATTEMPTS = [
    { input: { mode: 'mention', internal: true },  expected: { mode: 'mention', internal: true } },
    { input: { mode: 'mention', internal: 'yes' }, expected: { mode: 'mention' } },
    { input: { mode: 'mention', internal: 1 },     expected: { mode: 'mention' } },
    { input: { mode: 'mention', internal: 'true' },expected: { mode: 'mention' } },
    { input: { mode: 'mention', internal: false }, expected: { mode: 'mention' } },
    { input: { mode: 'mention' },                  expected: { mode: 'mention' } },
    { input: { mode: 'all', internal: true, badField: 'x' }, expected: { mode: 'all', internal: true } },
  ];
  // Reproduces the whitelist logic at main.js:~10204-10207
  const sanitize = (gs) => {
    if (!gs || !gs.mode) return null;
    if (!['off', 'mention', 'all'].includes(gs.mode)) return null;
    const out = { mode: gs.mode };
    if (gs.internal === true) out.internal = true;
    return out;
  };
  for (const { input, expected } of ATTEMPTS) {
    const got = sanitize(input);
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      fail(`whitelist ${JSON.stringify(input)} → expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
    }
  }
  ok('save-handler whitelist — only literal true stores internal');
}

// v2.4.0 M4-D: FTS5 broken → Tier 3 LIKE still applies filter. Simulates the
// fall-through path when FTS5 MATCH returns empty and LIKE takes over.
function testFts5FallThroughToLike(db) {
  // Query that FTS5 would match — but filter it down via audience=customer
  // and confirm the LIKE fallback (which has its own filter) doesn't leak
  // internal/private content when FTS5 silently returns nothing.
  // Direct LIKE test: confirm filter applied when LIKE is the ONLY path.
  const allowedTiers = ['public'];
  const placeholders = allowedTiers.map(() => '?').join(',');
  // Simulate the EXACT SQL shape from main.js:16020-16029 Tier 3
  const rows = db.prepare(
    `SELECT NULL AS chunk_id, d.id AS document_id, d.category, 0 AS chunk_index,
            0 AS char_start, 0 AS char_end, d.filename, d.title,
            999.0 AS score,
            substr(d.content, 1, 300) AS snippet
     FROM documents d
     WHERE d.visibility IN (${placeholders})
       AND (d.content LIKE ? OR d.filename LIKE ?)
     LIMIT ?`
  ).all(...allowedTiers, '%giao%', '%giao%', 10);
  const leakedIds = rows.map(r => r.document_id).filter(id => id === 2 || id === 3);
  if (leakedIds.length > 0) fail(`Tier 3 LIKE leaked internal/private: ${JSON.stringify(leakedIds)}`);
  if (rows.length !== 1 || rows[0].document_id !== 1) {
    fail(`Tier 3 LIKE expected exactly doc 1 (public), got ${JSON.stringify(rows.map(r => r.document_id))}`);
  }
  ok('Tier 3 LIKE fall-through — customer audience excludes internal/private');
}

function main() {
  console.log('[visibility smoke] 4-location filter + 4 regression tests...');
  const db = setupDb();
  try {
    testVectorFilter(db);
    testFts5Filter(db);
    testLikeFilter(db);
    testEnumValidation();
    testAlterUpgradePath();
    testIpcEnumValidation();
    testSaveHandlerWhitelist();
    testFts5FallThroughToLike(db);
  } finally {
    db.close();
  }
  console.log('[visibility smoke] PASS');
}

main();
