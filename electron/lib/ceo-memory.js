'use strict';
const fs = require('fs');
const path = require('path');

let _db = null;
const CURRENT_MODEL_VERSION = 'e5-small-v1';
const MAX_CONTENT_LENGTH = 500;
const HOT_TIER_MAX_CHARS = 8000;
const VALID_TYPES = ['rule', 'pattern', 'preference', 'fact', 'correction', 'task'];
const VALID_SOURCES = ['nudge', 'ceo_correction', 'evening_summary', 'manual', 'auto'];

function getMemoryDb() {
  if (_db) return _db;
  try {
    const { getWorkspace } = require('./workspace');
    const ws = getWorkspace();
    if (!ws) return null;
    const dbPath = path.join(ws, 'memory.db');
    const Database = require('better-sqlite3');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('busy_timeout = 5000');
    _ensureSchema(_db);
    return _db;
  } catch (e) {
    console.error('[ceo-memory] db init failed:', e?.message);
    return null;
  }
}

function _ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ceo_memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'nudge',
      embedding BLOB,
      relevance_score REAL NOT NULL DEFAULT 1.0,
      model_version TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ceo_mem_type ON ceo_memories(type);
    CREATE INDEX IF NOT EXISTS idx_ceo_mem_score ON ceo_memories(relevance_score DESC);
  `);
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS ceo_memory_fts USING fts5(content, tokenize='unicode61')`);
  } catch (e) {
    console.warn('[ceo-memory] FTS5 unavailable, search will use embeddings only:', e?.message);
  }
}

// ---------------------------------------------------------------------------
//  CRUD
// ---------------------------------------------------------------------------

async function writeMemory({ type, content, source = 'nudge' }) {
  if (!VALID_TYPES.includes(type)) throw new Error('invalid type: ' + type);
  if (!content || typeof content !== 'string') throw new Error('content required');
  const cleaned = content.replace(/^#{1,3}\s+/gm, '').trim();
  if (cleaned.length > MAX_CONTENT_LENGTH) throw new Error('content too long (max ' + MAX_CONTENT_LENGTH + ')');
  if (source && !VALID_SOURCES.includes(source)) source = 'manual';

  const db = getMemoryDb();
  if (!db) throw new Error('memory db unavailable');

  const id = 'mem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  const score = type === 'correction' ? 1.5 : 1.0;

  let embeddingBlob = null;
  try {
    const { embedText, vecToBlob } = require('./knowledge');
    const vec = await embedText(cleaned, false);
    embeddingBlob = vecToBlob(vec);
  } catch (e) {
    console.warn('[ceo-memory] embedding failed, storing without vector:', e?.message);
  }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO ceo_memories (id, type, content, source, embedding, relevance_score, model_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, type, cleaned, source, embeddingBlob, score, embeddingBlob ? CURRENT_MODEL_VERSION : null, now, now);

    const rowid = db.prepare('SELECT rowid FROM ceo_memories WHERE id = ?').get(id)?.rowid;
    if (rowid != null) {
      db.prepare('INSERT INTO ceo_memory_fts (rowid, content) VALUES (?, ?)').run(rowid, cleaned);
    }
  })();

  _scheduleRegeneration();
  return { id, created_at: now };
}

function deleteMemory(id) {
  const db = getMemoryDb();
  if (!db) throw new Error('memory db unavailable');

  const row = db.prepare('SELECT rowid FROM ceo_memories WHERE id = ?').get(id);
  if (!row) return { deleted: false, reason: 'not found' };

  db.transaction(() => {
    db.prepare('DELETE FROM ceo_memory_fts WHERE rowid = ?').run(row.rowid);
    db.prepare('DELETE FROM ceo_memories WHERE id = ?').run(id);
  })();

  _scheduleRegeneration();
  return { deleted: true };
}

// ---------------------------------------------------------------------------
//  Hybrid search: FTS5 keyword + e5-small cosine + virtual relevance decay
// ---------------------------------------------------------------------------

async function searchMemory(query, { limit = 5, bumpRelevance = true } = {}) {
  const db = getMemoryDb();
  if (!db) return [];
  if (!query || typeof query !== 'string') return [];

  const now = Date.now();
  const allRows = db.prepare(
    'SELECT id, type, content, source, embedding, relevance_score, model_version, created_at, updated_at FROM ceo_memories'
  ).all();
  if (allRows.length === 0) return [];

  const ftsScores = {};
  try {
    const ftsQuery = '"' + query.replace(/"/g, '""') + '"';
    const ftsRows = db.prepare(
      `SELECT m.id, fts.rank FROM ceo_memory_fts fts
       JOIN ceo_memories m ON m.rowid = fts.rowid
       WHERE ceo_memory_fts MATCH ? ORDER BY fts.rank LIMIT 50`
    ).all(ftsQuery);
    for (const r of ftsRows) {
      ftsScores[r.id] = 1.0 / (1.0 + Math.abs(r.rank));
    }
  } catch (e) {
    console.warn('[ceo-memory] FTS5 search failed, using embedding only:', e?.message);
  }

  const cosineScores = {};
  try {
    const { embedText, blobToVec, cosineSim } = require('./knowledge');
    const queryVec = await embedText(query, true);
    for (const row of allRows) {
      if (row.embedding) {
        const vec = blobToVec(row.embedding);
        cosineScores[row.id] = Math.max(0, cosineSim(queryVec, vec));
      }
    }
  } catch (e) {
    console.warn('[ceo-memory] embedding search failed, using FTS only:', e?.message);
  }

  const scored = allRows.map(row => {
    const daysSince = (now - new Date(row.updated_at).getTime()) / 86400000;
    const effectiveRelevance = Math.max(0, row.relevance_score - 0.02 * daysSince);
    const fts = ftsScores[row.id] || 0;
    const cos = cosineScores[row.id] || 0;
    const score = 0.4 * fts + 0.4 * cos + 0.2 * effectiveRelevance;
    return { id: row.id, type: row.type, content: row.content, source: row.source, score, created_at: row.created_at };
  });

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit).filter(r => r.score > 0);

  if (bumpRelevance && results.length > 0) {
    const bumpStmt = db.prepare('UPDATE ceo_memories SET relevance_score = MIN(relevance_score + 0.1, 5.0), updated_at = ? WHERE id = ?');
    const nowIso = new Date().toISOString();
    for (const r of results) {
      bumpStmt.run(nowIso, r.id);
    }
    _scheduleRegeneration();
  }

  return results;
}

// ---------------------------------------------------------------------------
//  List / count / last
// ---------------------------------------------------------------------------

function listMemories({ limit = 100 } = {}) {
  const db = getMemoryDb();
  if (!db) return [];
  const now = Date.now();
  const rows = db.prepare(
    'SELECT id, type, content, source, relevance_score, created_at, updated_at FROM ceo_memories ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
  return rows.map(r => {
    const daysSince = (now - new Date(r.updated_at).getTime()) / 86400000;
    return { ...r, effective_score: Math.max(0, r.relevance_score - 0.02 * daysSince) };
  });
}

function getMemoryCount() {
  const db = getMemoryDb();
  if (!db) return 0;
  return db.prepare('SELECT COUNT(*) as cnt FROM ceo_memories').get()?.cnt || 0;
}

function getLastMemoryAt() {
  const db = getMemoryDb();
  if (!db) return null;
  return db.prepare('SELECT created_at FROM ceo_memories ORDER BY created_at DESC LIMIT 1').get()?.created_at || null;
}

// ---------------------------------------------------------------------------
//  CEO-MEMORY.md regeneration (debounced 2s)
// ---------------------------------------------------------------------------

let _regenTimer = null;

function _scheduleRegeneration() {
  if (_regenTimer) clearTimeout(_regenTimer);
  _regenTimer = setTimeout(() => {
    _regenTimer = null;
    try { regenerateCeoMemoryFile(); } catch (e) {
      console.error('[ceo-memory] regeneration failed:', e?.message);
    }
  }, 2000);
}

function trimOldTaskEntries() {
  const db = getMemoryDb();
  if (!db) return;
  try {
    // Purge ALL auto-generated task entries (cron logs are noise, not memory)
    const result = db.prepare("DELETE FROM ceo_memories WHERE type = 'task' AND source = 'auto'").run();
    if (result.changes > 0) console.log(`[ceo-memory] purged ${result.changes} auto-task entries`);
    // Keep manually-created tasks but trim old ones (>14 days)
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    db.prepare("DELETE FROM ceo_memories WHERE type = 'task' AND created_at < ?").run(cutoff);
  } catch (e) {
    console.warn('[ceo-memory] trim old tasks error:', e?.message);
  }
}

function regenerateCeoMemoryFile() {
  trimOldTaskEntries();
  const db = getMemoryDb();
  if (!db) return;
  const { getWorkspace } = require('./workspace');
  const ws = getWorkspace();
  if (!ws) return;

  const now = Date.now();
  const allRows = db.prepare('SELECT id, type, content, relevance_score, updated_at FROM ceo_memories').all();

  const byType = { correction: [], rule: [], pattern: [], preference: [], fact: [], task: [] };
  for (const r of allRows) {
    const daysSince = (now - new Date(r.updated_at).getTime()) / 86400000;
    r.effective = Math.max(0, r.relevance_score - 0.02 * daysSince);
    if (byType[r.type]) byType[r.type].push(r);
  }
  for (const arr of Object.values(byType)) {
    arr.sort((a, b) => b.effective - a.effective);
  }

  const typePriority = ['correction', 'rule', 'pattern', 'preference', 'fact', 'task'];
  const typeSoftCaps = { correction: 0.30, rule: 0.25, pattern: 0.15, preference: 0.15, fact: 0.07, task: 0.08 };
  const groups = {};
  let totalChars = 0;

  let surplus = 0;
  for (const type of typePriority) {
    const baseCap = HOT_TIER_MAX_CHARS * typeSoftCaps[type];
    const effectiveCap = baseCap + surplus;
    let typeChars = 0;
    groups[type] = [];
    for (const r of byType[type]) {
      if (totalChars + r.content.length > HOT_TIER_MAX_CHARS) break;
      if (typeChars + r.content.length > effectiveCap) break;
      groups[type].push(r.content);
      totalChars += r.content.length + 3;
      typeChars += r.content.length + 3;
    }
    surplus += baseCap - typeChars;
  }

  const typeLabels = {
    correction: 'Quy tắc đã sửa',
    rule: 'Quy tắc đã học',
    preference: 'Sở thích của sếp',
    pattern: 'Patterns khách hàng',
    fact: 'Sự kiện quan trọng',
    task: 'Việc đã làm gần đây',
  };

  let md = '# Bộ nhớ bot\n\n';
  for (const type of ['correction', 'rule', 'preference', 'pattern', 'fact', 'task']) {
    if (groups[type]?.length) {
      md += `## ${typeLabels[type]}\n`;
      for (const line of groups[type]) {
        md += `- ${line}\n`;
      }
      md += '\n';
    }
  }

  if (totalChars === 0) {
    md += '_Chưa có gì. Bot sẽ tự học từ cuộc hội thoại với sếp._\n';
  }

  const filePath = path.join(ws, 'CEO-MEMORY.md');
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  if (md.trim() !== current.trim()) {
    fs.writeFileSync(filePath, md, 'utf-8');
    console.log('[ceo-memory] CEO-MEMORY.md regenerated (' + totalChars + ' chars, ' + allRows.length + ' memories total)');
  }
  injectMemoryIntoAgentsMd();
}

// ---------------------------------------------------------------------------
//  AGENTS.md memory injection
// ---------------------------------------------------------------------------

const MEMORY_SECTION_START = '<!-- MEMORY-CONTEXT-START -->';
const MEMORY_SECTION_END = '<!-- MEMORY-CONTEXT-END -->';
const MEMORY_MIN_CHARS = 2000;
const MEMORY_BUDGET_CAP = 10000;
const TOTAL_CONTEXT_BUDGET = 35000;

function getMemoryBudget(agentsPath) {
  try {
    const agentsContent = fs.readFileSync(agentsPath, 'utf-8');
    const agentsChars = agentsContent.length;
    const available = TOTAL_CONTEXT_BUDGET - agentsChars;
    return Math.max(MEMORY_MIN_CHARS, Math.min(MEMORY_BUDGET_CAP, available));
  } catch {
    return MEMORY_MIN_CHARS;
  }
}

function injectMemoryIntoAgentsMd() {
  try {
    const { getWorkspace } = require('./workspace');
    const ws = getWorkspace();
    if (!ws) return;
    const agentsPath = path.join(ws, 'AGENTS.md');
    if (!fs.existsSync(agentsPath)) return;

    const ceoMemPath = path.join(ws, 'CEO-MEMORY.md');
    let memContent = '';
    if (fs.existsSync(ceoMemPath)) {
      memContent = fs.readFileSync(ceoMemPath, 'utf-8').trim();
    }
    if (!memContent || memContent.includes('Chưa có gì')) memContent = '';

    const memBudget = getMemoryBudget(agentsPath);
    if (memContent.length > memBudget) {
      const lines = memContent.split('\n');
      let trimmed = '';
      for (let i = 0; i < lines.length; i++) {
        const candidate = trimmed ? trimmed + '\n' + lines[i] : lines[i];
        if (candidate.length > memBudget) break;
        trimmed = candidate;
      }
      memContent = trimmed.trim();
    }

    const section = memContent
      ? `\n\n${MEMORY_SECTION_START}\n<memory-context>\n${memContent}\n</memory-context>\n${MEMORY_SECTION_END}`
      : `\n\n${MEMORY_SECTION_START}\n${MEMORY_SECTION_END}`;

    let agents = fs.readFileSync(agentsPath, 'utf-8');
    const startIdx = agents.indexOf(MEMORY_SECTION_START);
    const endIdx = agents.indexOf(MEMORY_SECTION_END);
    if (startIdx !== -1 && endIdx !== -1) {
      agents = agents.slice(0, startIdx) + section.trim() + agents.slice(endIdx + MEMORY_SECTION_END.length);
    } else {
      agents = agents.trimEnd() + section;
    }

    const current = fs.readFileSync(agentsPath, 'utf-8');
    if (agents !== current) {
      fs.writeFileSync(agentsPath, agents, 'utf-8');
    }
  } catch (e) {
    console.warn('[ceo-memory] inject into AGENTS.md failed:', e?.message);
  }
}

// ---------------------------------------------------------------------------
//  Exports
// ---------------------------------------------------------------------------

function cleanupCeoMemoryTimers() {
  if (_regenTimer) { clearTimeout(_regenTimer); _regenTimer = null; }
  if (_db) { try { _db.close(); } catch {} _db = null; }
}

module.exports = {
  getMemoryDb,
  writeMemory,
  deleteMemory,
  searchMemory,
  listMemories,
  getMemoryCount,
  getLastMemoryAt,
  regenerateCeoMemoryFile,
  scheduleRegeneration: _scheduleRegeneration,
  cleanupCeoMemoryTimers,
  injectMemoryIntoAgentsMd,
  getMemoryBudget,
  CURRENT_MODEL_VERSION,
  MAX_CONTENT_LENGTH,
  HOT_TIER_MAX_CHARS,
  VALID_TYPES,
  VALID_SOURCES,
};
