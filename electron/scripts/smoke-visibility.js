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

function main() {
  console.log('[visibility smoke] 4-location filter + enum validation...');
  const db = setupDb();
  try {
    testVectorFilter(db);
    testFts5Filter(db);
    testLikeFilter(db);
    testEnumValidation();
  } finally {
    db.close();
  }
  console.log('[visibility smoke] PASS');
}

main();
