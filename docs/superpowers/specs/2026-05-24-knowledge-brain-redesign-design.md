# Knowledge Brain Redesign — Hybrid Search + Doc-Only Graph

**Date:** 2026-05-24
**Status:** Approved (brainstorming)
**Approach:** C — Query-time Semantic Retrieval

## Problem

1. **Brain view noise:** 5 node types (Customer, Group, Doc, Learning, Skill) — CEO mở lên thấy Zalo contacts, không thấy knowledge structure. Giá trị chính phải là mối liên quan giữa tài liệu.
2. **Siloed categories:** Bot hardcode routing (hỏi SP → san-pham/index.md). Cross-category queries miss context.
3. **Token waste:** Bot đọc full index.md mỗi query (~6-9K tokens) dù chỉ cần 1-2 chunks relevant.
4. **Flat index:** index.md là danh sách file + summary, không có relationship info.

## Design

### 1. Unified Semantic Search (Bot side)

Replace AGENTS.md category routing table with single search rule:

```
## Knowledge doanh nghiệp
Khi khách hỏi về sản phẩm, giá, công ty, nhân sự, chính sách, hoặc bất kỳ thông tin doanh nghiệp:
1. Gọi web_fetch("http://127.0.0.1:20129/search?q=<câu hỏi>")
2. Kết quả trả về top chunks relevant nhất (cross tất cả danh mục)
3. Trả lời dựa trên chunks đó
4. Nếu web_fetch trả về lỗi kết nối (RAG server chưa start) → đọc knowledge/*/index.md
5. Nếu search trả về 0 kết quả → "Em chưa có thông tin này, để em hỏi sếp"
```

**Backend** (`knowledge.js`): `searchKnowledge()` **already exists** (lines 1570-1819) with:
- RRF (Reciprocal Rank Fusion) merging of semantic embeddings + FTS5
- Tier 2 AI query rewriting, price filter support, media search merge
- HTTP server on port 20129

**What changes:** No changes to search algorithm itself. The change is in **AGENTS.md routing** — stop hardcoding per-category file reads, route all knowledge queries through the existing `searchKnowledge()` via the HTTP RAG server (port 20129). Bot uses `web_fetch http://127.0.0.1:20129/search?q=<query>` instead of `read_file knowledge/san-pham/index.md`.

**RAG server boot dependency:** RAG server (port 20129) must be ready before gateway accepts first message. Add `waitForRagReady()` to boot sequence (same pattern as `waitFor9RouterReady()`): poll `GET http://127.0.0.1:20129/health` with 60-iteration loop × 1s. Gateway start waits for RAG health OK. Fallback: if RAG never ready after 60s, gateway starts anyway — bot uses index.md fallback per AGENTS.md rule #4.

**Token savings:** ~6-9K/query (reading 3 full index.md files) → ~1-2K/query (top-K relevant chunks from RAG server). ~70-80% reduction.

**Visibility enforcement (SECURITY):** `searchKnowledge()` must accept `channel` param:
- `channel = "zalo"` → filter `WHERE visibility = 'public'` at DB query level. Zalo strangers NEVER see `noi-bo` or `ceo-only` docs
- `channel = "telegram"` → return all visibility levels (CEO only uses Telegram)
- Filter is at SQL WHERE clause level, NOT post-filter — prevents data leak even if result set is large
- RAG HTTP endpoint: `GET /search?q=<query>&channel=<zalo|telegram>`
- AGENTS.md rule passes channel automatically (gateway injects channel context into agent)

**Relevance floor:** Search returns `min(topK, chunks_above_floor)`:
- Top-K ceiling = 10
- Minimum relevance score floor = 0.25 (RRF score)
- If 0 chunks above floor → return empty → bot says "em chưa có thông tin"
- Prevents noise pollution: 10 chunks at score 0.1-0.2 are worse than 0 chunks (LLM hallucinates from noise)

### 2. Brain View — Document-Only Graph

**Nodes = Documents only.** Per node:
- File name (truncated if long)
- Category badge (color-coded per category)
- Node size proportional to file size

**Edges = similarity relationships:**
- Source: new `computeDocRelationships()` in `brain-graph.js`
  - Similarity = **max cosine similarity between any 2 chunks** of 2 documents (not mean pooling — mean pooling dilutes heterogeneous docs like "chính sách công ty" covering 5 topics)
  - Performance: cap at 200 docs (most recent). With ~10 chunks/doc = 2000 chunks, worst case ~2M cosine ops — completes in <5s on CPU
  - Stores result in `documents.related_docs` column (JSON: `[{"docId": 5, "score": 0.78}]`)
  - Uses separate `_relationshipBuildInProgress` flag — does NOT set `_backfillInProgress` (avoids degrading search during rebuild)
- Threshold: > 0.65 default, configurable via `rag-config.json` key `brainEdgeThreshold`
- Edge thickness proportional to similarity score
- Hover tooltip: shared keywords between 2 docs

**Layout:** Force-directed (D3.js, existing). Category gravity clusters docs. Cross-category edges pull clusters together.

**Interactions:**
- Click node → right panel: summary, category, related docs ranked by score
- Filter toolbar: filter by category
- Search: find doc by name

**Rebuild triggers:**
- Upload new doc → incremental (compute relationships for that doc only)
- Delete doc → remove node + edges
- Full rebuild every 30 minutes (background)

**Removed:** Customer, Group, Skill, Learning nodes. All membership/co-membership/escalation edges.

### 3. Hybrid Categories

**Storage:** `knowledge/_categories.json`
```json
[
  { "id": "cong-ty", "label": "Công ty", "builtin": true, "color": "#3b82f6" },
  { "id": "san-pham", "label": "Sản phẩm", "builtin": true, "color": "#ef4444" },
  { "id": "nhan-vien", "label": "Nhân viên", "builtin": true, "color": "#10b981" }
]
```

- CEO creates custom categories from Dashboard Knowledge tab
- Auto-generate id (kebab-case) + random color + create folder
- Delete: custom only, move files to another category or delete
- Bot search ignores categories — query all chunks. Category is metadata for Brain + Dashboard UI only.

### 4. Index.md Slim-down

Per-category index.md reduced to:
```markdown
# Tài liệu: Sản phẩm

| File | Tóm tắt |
|---|---|
| bang-gia-2026.pdf | Bảng giá toàn bộ sản phẩm Q2/2026 |

Cập nhật: 2026-05-24 · 2 tài liệu
```

Purpose: fallback only (embedding model not loaded yet). No relationship info — lives in embedding space.

### 4b. Chunking Quality Upgrade

Current chunking (500-char Vietnamese sentence splitting) breaks tables, bullet lists, and loses header context. Chunking quality determines ~80% of retrieval accuracy — more than search algorithm choice.

**Changes to chunking in `knowledge.js`:**

1. **Header propagation:** Detect markdown/document headings (`#`, `##`, bold lines). Prepend nearest heading to every chunk as context prefix. Chunk "12 tháng, đổi trả trong 7 ngày" becomes "[Chính sách bảo hành] 12 tháng, đổi trả trong 7 ngày" — bot knows which product/policy the chunk belongs to.

2. **Table preservation:** Detect table structures (markdown `|...|`, tab-separated, CSV-like rows). Never split between table rows. If table exceeds chunk size, split at row boundaries and prepend table header row to each chunk.

3. **Minimum chunk size:** 200 chars. Orphan chunks below 200 chars merge into previous chunk. Prevents tiny fragments that embed poorly.

4. **Max chunk size:** 800 chars (up from 500). Vietnamese business docs have dense paragraphs — 500 chars often cuts mid-sentence. 800 chars with sentence-boundary splitting keeps complete thoughts together.

**Migration:** Re-chunk existing documents on first boot (after DB migration). Delete old chunks, re-insert with new strategy. Embeddings recomputed via `backfillKnowledgeEmbeddings()`.

### 4c. Document Staleness Detection

When CEO uploads file with similar name to existing doc in same category:

1. Fuzzy match filename against existing docs (Levenshtein distance < 3 OR shared prefix > 60%)
2. If match found → IPC prompt to Dashboard: "Thay thế [old-file] hay giữ cả hai?"
3. Replace → soft-delete old doc: `UPDATE documents SET deprecated = 1 WHERE id = ?`. Search filter: `WHERE deprecated = 0`
4. Keep both → no action, both remain searchable
5. Deprecated docs excluded from Brain graph edges

DB migration adds: `ALTER documents ADD COLUMN IF NOT EXISTS deprecated INTEGER DEFAULT 0`

### 5. Migration (v2.4.x → v2.5.0)

**Detection:** brain-graph.json has node type "customer" → needs migration.

**Steps (automatic on first boot):**
1. DB: `ALTER documents ADD COLUMN IF NOT EXISTS related_docs TEXT` (JSON: `[{"docId": N, "score": 0.XX}]`)
2. DB: `ALTER documents ADD COLUMN IF NOT EXISTS deprecated INTEGER DEFAULT 0`
3. Re-chunk existing documents with new chunking strategy (header propagation, table preservation, 200-800 char range). Recompute embeddings via `backfillKnowledgeEmbeddings()`
4. Run `computeDocRelationships()` for all existing docs (max chunk similarity, max 200 docs)
5. Rewrite index.md files to slim format (overwrite, not delete). Backup old index.md as `index.md.pre-v25` for rollback
6. Rebuild brain-graph.json with Doc nodes only
7. AGENTS.md: find routing table by regex matching `| Hỏi SP/giá` rows + `## NGUỒN DUY NHẤT` heading → replace with search rule. No markers needed — pattern match is sufficient
8. Create `_categories.json` from 3 builtins + auto-discover custom folders (scan `knowledge/*/` for dirs with `files/` subfolder)

**Rollback:** Embeddings + DB untouched. Restore AGENTS.md routing via `git checkout AGENTS.md`. Rename `index.md.pre-v25` back to `index.md`. Zero file movement, zero data loss.

**Edge cases:**
- Fresh install: skip migration, seed normally
- DB missing embeddings: FTS5 fallback for search, Brain waits for backfill
- Pre-existing custom folders: auto-discovered into `_categories.json`

### 6. Regression Risks

| Risk | Mitigation |
|---|---|
| Bot accuracy drops | A/B comparison log: old routing + new search for first 50 queries |
| Fresh install no embeddings | FTS5 fallback → slim index.md fallback. Never return empty when data exists on disk |
| Brain empty after upgrade | If 0 doc nodes after rebuild → keep old graph + show "Updating..." banner |
| index.md format change breaks callers | Grep all index.md readers before changing. Currently: AGENTS.md + backfillKnowledgeFromDisk() |
| AGENTS.md tool name drift | Search rule uses web_fetch to RAG server (port 20129), not openclaw tool — decoupled from tool name changes |
| RAG server not ready at boot | waitForRagReady() poll loop (60s max). Fallback: bot reads index.md per AGENTS.md rule #4 |
| Cron prompts hardcode file paths | Cron agent uses search, not file paths. Review existing custom cron prompts |
| backfillKnowledgeFromDisk() misses custom categories | Read from _categories.json instead of hardcoded 3 |
| collectDocNodes() hardcodes 3 categories | Update to read from _categories.json — same fix as backfill |
| Pairwise similarity O(n^2) on large doc sets | Cap at 200 docs (most recent). Doc-level mean pooling, not chunk-level |
| _backfillInProgress degrades search during rebuild | Use separate _relationshipBuildInProgress flag |
| Rollback: slim index.md has less info than old | Backup old index.md as index.md.pre-v25 before overwriting |
| Zalo stranger extracts internal docs | Visibility filter at SQL WHERE level: zalo → public only. SECURITY must-fix |
| Stale doc chunks return outdated info | Soft-delete (deprecated=1) on replace. Search filters deprecated=0 |
| Noise chunks pollute LLM context | Relevance floor 0.25 — return 0 chunks rather than low-score noise |
| Re-chunking breaks existing embeddings | Full re-embed after re-chunk. Migration step 3 handles this |
| Table/list data split across chunks | New chunking: table preservation, header propagation, 200-800 char range |

### 7. Pre-build Testing

Three smoke scripts, runnable without Electron (Node + mock-electron):

**`smoke-knowledge-search.js`** — Hybrid search accuracy:
- Seed test DB with 10-15 docs cross-category
- 20 queries (exact product name, semantic, cross-category)
- Compare hybrid vs old category routing
- Pass: hybrid >= old on all queries, cross-category hits > 0

**`smoke-brain-graph.js`** — Doc-only graph:
- Seed docs with known similarity (2 close, 2 far)
- Rebuild graph → verify: only Doc nodes, edges between close docs, no edges between far docs

**`smoke-migration.js`** — Upgrade path:
- Create fake workspace with old-format data
- Run migration → verify: _categories.json created, index.md slimmed, brain-graph Doc-only, files untouched

**Live comparison mode (optional, 1 week):**
- Bot uses old routing (production)
- Each query also runs hybrid search silently → log to `logs/knowledge-search-comparison.jsonl`
- CEO reviews log → confirm search is better → flip switch

Wire all smoke tests into `npm run smoke` chain.

### 8. Observability

Log every knowledge query to `logs/knowledge-queries.jsonl`:
```json
{
  "ts": "2026-05-24T09:12:00Z",
  "query": "gia iPhone 15",
  "channel": "zalo",
  "chunks_returned": 3,
  "top_score": 0.82,
  "min_score": 0.41,
  "docs_matched": ["bang-gia-2026.pdf", "chinh-sach-bao-hanh.docx"],
  "fallback_used": false,
  "visibility_filter": "public"
}
```

**Metrics (computable from log):**
- Queries/day, avg relevance score, fallback rate (RAG server unavailable)
- "Search miss" rate: queries returning 0 chunks when docs exist in category
- Visibility filter enforcement: count of queries where non-public docs were correctly excluded

**Dashboard integration (phase 2):** Knowledge health card on Overview page showing query volume + avg score + fallback rate. Not required for v2.5.0 launch — log file is sufficient for debugging.

**Log rotation:** Same as existing `audit.jsonl` — tail 64KB, rotate on size.

## Files Changed

| File | Change |
|---|---|
| `electron/lib/knowledge.js` | Slim `rewriteKnowledgeIndex()`, add visibility filter + relevance floor to `searchKnowledge()`, upgrade chunking (header propagation, table preservation, 200-800 char), staleness detection, query logging |
| `electron/lib/brain-graph.js` | Rewrite: Doc nodes only, similarity edges, remove Customer/Group/Skill/Learning |
| `electron/ui/brain.js` | Update renderer: category colors, doc-only layout, remove type filters |
| `electron/main.js` | Migration logic, `_categories.json` seeding, IPC for custom categories |
| `electron/ui/dashboard.html` | Knowledge tab: create/delete category UI. Brain toolbar: category filters |
| `electron/preload.js` | IPC bridges for category CRUD |
| `AGENTS.md` | Replace routing table with search rule |
| `electron/scripts/smoke-knowledge-search.js` | New |
| `electron/scripts/smoke-brain-graph.js` | New |
| `electron/scripts/smoke-migration.js` | New |
