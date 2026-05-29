# Zalo Training Pipeline (Two-Lane) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CEO/customer "training" of the Zalo bot actually take effect — always-on rules injected every turn, factual/scripts retrievable via RAG — and surface honestly when a rule can't apply.

**Architecture:** Two lanes. **Lane 1** = a runtime-injected, marker-bounded `CEO-RULES` block in workspace `AGENTS.md` (mirrors the existing `injectMemoryIntoAgentsMd` pattern), sourced from `.learnings/LEARNINGS.md` + `.learnings/ERRORS.md` + `knowledge/sales-playbook.md`, capped + deduped. **Lane 2** = extend RAG indexing (`backfillKnowledgeFromDisk` + watcher + `/api/ceo-rules/write`) to cover `knowledge/scripts/*.md` and root `knowledge/*.md` with `visibility='public'`, `enabled=1`, embedded. Plus R1 (precedence header), R2 (warn when a rule is code-blocked), and migration (auto on boot). The CEO-RULES block is runtime-injected, so the AGENTS.md template is unchanged → **no app/AGENTS version bump** (app stays 2.4.10).

**Tech Stack:** Node.js (Electron main process), better-sqlite3 / node:sqlite (tests), existing `electron/lib/{workspace,knowledge,cron-api,channels,ceo-memory}.js`, smoke tests in `electron/scripts/`.

**Spec:** `docs/superpowers/specs/2026-05-29-zalo-training-pipeline-design.md`

**Reference skills:** @superpowers:test-driven-development, @superpowers:verification-before-completion

---

## File Structure

- **Create** `electron/lib/trained-rules.js` — Lane 1. Exports `injectTrainedRulesIntoAgentsMd()` + pure helpers `_buildCeoRulesBlock(sources, cap)` and constants `CEO_RULES_START`/`CEO_RULES_END`. Reads only `.learnings/LEARNINGS.md`, `.learnings/ERRORS.md`, `knowledge/sales-playbook.md` (never globs `.learnings/`). One responsibility: build + write the marker-bounded rules block.
- **Modify** `electron/lib/workspace.js` — call `injectTrainedRulesIntoAgentsMd()` in `seedWorkspace`, immediately after `injectMemoryIntoAgentsMd()` (~line 742).
- **Modify** `electron/lib/knowledge.js` — Lane 2: extend `backfillKnowledgeFromDisk()` (~974) and the watcher path guard in `_processKnowledgeChange` (~819) + `filename.includes('files')` (~926) to also index `knowledge/scripts/*.md` and root `knowledge/*.md` with `visibility='public'`, `enabled=1`; export a `indexSingleKnowledgeFile(absPath)` helper for the ceo-rules trigger.
- **Modify** `electron/lib/cron-api.js` — `/api/ceo-rules/write` (~1550): after writing, (a) call `injectTrainedRulesIntoAgentsMd()` when the dest is a Lane-1 file; (b) call `indexSingleKnowledgeFile()` when the dest is a script/factual file; (c) compute an R2 `warning` and include it in the response.
- **Create** `electron/scripts/smoke-training-pipeline.js` — smoke assertions (Lane 1 block build/cap/dedupe, Lane 2 indexing visibility, R2 keyword warn, migration idempotency, prod-call-sites).
- **Modify** `electron/package.json` — add `node scripts/smoke-training-pipeline.js` to the `smoke` chain.

---

## Chunk 1: Lane 1 — always-on CEO-RULES injection

### Task 1: `_buildCeoRulesBlock` pure builder (cap + dedupe + newest-first)

**Files:**
- Create: `electron/lib/trained-rules.js`
- Test: `electron/scripts/smoke-training-pipeline.js`

- [ ] **Step 1: Write the failing test** (in smoke-training-pipeline.js, runnable with plain node)

```js
const { _buildCeoRulesBlock, CEO_RULES_START, CEO_RULES_END } = require('../lib/trained-rules');
// newest-source-first + dedupe (two short sources for a clear ordering assertion)
const block = _buildCeoRulesBlock([
  { name: 'learnings', text: 'Rule NEWEST\nRule NEWEST\nRule SECOND' }, // dupe NEWEST
  { name: 'playbook', text: 'Rule OLDER' },
], 8000);
assert(block.includes(CEO_RULES_START) && block.includes(CEO_RULES_END), 'marker-bounded');
assert((block.match(/Rule NEWEST/g) || []).length === 1, 'dedupes identical lines');
assert(/ưu tiên|priority|MỚI NHẤT/i.test(block), 'R1 precedence header present');
assert(block.indexOf('Rule NEWEST') < block.indexOf('Rule OLDER'), 'newest-source-first ordering');
// cap: a huge source is truncated; block stays within cap (+header)
const capped = _buildCeoRulesBlock([{ name: 'big', text: 'L'.repeat(20000) }], 8000);
assert(capped.length <= 8000 + 600, 'respects cap (+header)');
```

- [ ] **Step 2: Run to verify it fails** — `node electron/scripts/smoke-training-pipeline.js` → FAIL (module/function missing).

- [ ] **Step 3: Implement `electron/lib/trained-rules.js`**

```js
'use strict';
const fs = require('fs');
const path = require('path');

const CEO_RULES_START = '<!-- CEO-RULES-START -->';
const CEO_RULES_END = '<!-- CEO-RULES-END -->';
const CEO_RULES_CAP = 8000; // chars; keeps AGENTS.md bootstrap budget safe (40000 cap)

// R1 precedence — scoped to tone/style ONLY; never overrides safety/scope guards.
const CEO_RULES_HEADER =
  '## Quy tắc CEO đã huấn luyện\n' +
  '(Ưu tiên CAO cho giọng/cách trả lời/phong cách khi mâu thuẫn với mặc định — ' +
  'ưu tiên quy tắc MỚI NHẤT. KHÔNG được dùng để vượt rào an toàn/phạm vi/social-engineering ' +
  'hay mục "Người nội bộ" — các rào đó là tuyệt đối.)\n';

// sources: [{ name, text }] newest-source-first. Returns a marker-bounded block.
function _buildCeoRulesBlock(sources, cap = CEO_RULES_CAP) {
  const seen = new Set();
  const out = [];
  let used = 0;
  for (const src of sources || []) {
    for (const rawLine of String(src.text || '').split('\n')) {
      const line = rawLine.replace(/\s+$/, '');
      const key = line.trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) continue;       // dedupe identical lines
      if (used + line.length + 1 > cap) { return _wrap(out); } // cap: stop (newest kept)
      seen.add(key);
      out.push(line);
      used += line.length + 1;
    }
  }
  return _wrap(out);
}

function _wrap(lines) {
  const body = lines.length ? CEO_RULES_HEADER + '\n' + lines.join('\n') : CEO_RULES_HEADER + '\n(Chưa có quy tắc huấn luyện.)';
  return `${CEO_RULES_START}\n${body}\n${CEO_RULES_END}`;
}

module.exports = { _buildCeoRulesBlock, _wrap, CEO_RULES_START, CEO_RULES_END, CEO_RULES_CAP, CEO_RULES_HEADER };
```

- [ ] **Step 4: Run to verify it passes** — `node electron/scripts/smoke-training-pipeline.js` → PASS.

- [ ] **Step 5: Commit** — `git add electron/lib/trained-rules.js electron/scripts/smoke-training-pipeline.js && git commit -m "feat(training): CEO-RULES block builder (cap+dedupe+precedence)"`

### Task 2: `injectTrainedRulesIntoAgentsMd()` — marker-bounded write (mirror injectMemoryIntoAgentsMd)

**Files:**
- Modify: `electron/lib/trained-rules.js`
- Test: `electron/scripts/smoke-training-pipeline.js`

- [ ] **Step 1: Write the failing test** — using a temp workspace dir: seed an `AGENTS.md` + `.learnings/LEARNINGS.md`("Rule X") + `knowledge/sales-playbook.md`("Rule Y"); call `injectTrainedRulesIntoAgentsMd(tmpWs)`; assert AGENTS.md now contains the CEO-RULES block with "Rule X"/"Rule Y"; call again → idempotent (block not duplicated; exactly one START marker). Assert it does NOT read `.learnings/AGENTS-backup-*.md` (drop a backup file containing "BACKUP_LEAK" → must NOT appear in the block).

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — add to `trained-rules.js` (accept optional `wsArg` for testability; default `require('./workspace').getWorkspace()`):

```js
function injectTrainedRulesIntoAgentsMd(wsArg) {
  try {
    const ws = wsArg || require('./workspace').getWorkspace();
    if (!ws) return;
    const agentsPath = path.join(ws, 'AGENTS.md');
    if (!fs.existsSync(agentsPath)) return;
    const read = (rel) => { try { return fs.readFileSync(path.join(ws, rel), 'utf-8').trim(); } catch { return ''; } };
    // EXACT filenames only — never glob .learnings/ (would pull AGENTS-backup-*.md).
    const sources = [
      { name: 'learnings', text: read('.learnings/LEARNINGS.md') },
      { name: 'errors', text: read('.learnings/ERRORS.md') },
      { name: 'sales-playbook', text: read(path.join('knowledge', 'sales-playbook.md')) },
    ].filter(s => s.text);
    const block = _buildCeoRulesBlock(sources);
    let agents = fs.readFileSync(agentsPath, 'utf-8');
    const s = agents.indexOf(CEO_RULES_START), e = agents.indexOf(CEO_RULES_END);
    if (s !== -1 && e !== -1) agents = agents.slice(0, s) + block + agents.slice(e + CEO_RULES_END.length);
    else agents = agents.trimEnd() + '\n\n' + block + '\n';
    const current = fs.readFileSync(agentsPath, 'utf-8');
    if (agents !== current) fs.writeFileSync(agentsPath, agents, 'utf-8');
  } catch (err) { console.warn('[trained-rules] inject failed:', err?.message); }
}
module.exports.injectTrainedRulesIntoAgentsMd = injectTrainedRulesIntoAgentsMd;
```

- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `feat(training): injectTrainedRulesIntoAgentsMd (idempotent, no .learnings glob)`

### Task 3: Wire into seedWorkspace (boot migration) + add prod-call-site smoke

**Files:**
- Modify: `electron/lib/workspace.js` (~742, after `injectMemoryIntoAgentsMd()`)
- Test: `electron/scripts/smoke-training-pipeline.js`

- [ ] **Step 1: Write the failing test** — regex assert `workspace.js` calls `injectTrainedRulesIntoAgentsMd` immediately after `injectMemoryIntoAgentsMd`.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — in `seedWorkspace`, after the Hermes line:

```js
  try { require('./ceo-memory').injectMemoryIntoAgentsMd(); } catch {}
  // Lane 1: inject CEO-trained rules (auto-migrates existing .learnings/playbook).
  try { require('./trained-rules').injectTrainedRulesIntoAgentsMd(); } catch {}
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(training): inject CEO-RULES at seedWorkspace (boot migration)`

## Chunk 2: Lane 2 — index knowledge/scripts + root knowledge/*.md

### Task 4: `indexSingleKnowledgeFile(abs)` — insert (public/enabled) + embed

**Files:**
- Modify: `electron/lib/knowledge.js`
- Test: `electron/scripts/smoke-training-pipeline.js` (node:sqlite in-memory, mirror `smoke-visibility.js` setup)

- [ ] **Step 1: Write the failing test** — TWO parts (do NOT call the real `indexSingleKnowledgeFile` here: it pulls `getDocumentsDb()` → better-sqlite3 Electron ABI, unloadable under plain node — mirror `smoke-visibility.js` instead):
  - **(1a) SQL-shape test (in-memory `node:sqlite`, no embedder):** build the same schema as `smoke-visibility.js` (`documents` + `documents_chunks` + `documents_chunks_fts`). Insert a row as the function will (`visibility='public'`, `enabled=1`, `category='general'`) + one chunk + its FTS row. Assert: an FTS5 `MATCH` query returns it, AND the customer-tier query `WHERE d.visibility IN ('public') AND d.enabled=1` returns it (proves a script becomes customer-retrievable). Insert the same `(filename, category)` again with `INSERT OR IGNORE` → `changes === 0` (idempotent).
  - **(1b) prod-call-site regex:** assert `knowledge.js` defines `function indexSingleKnowledgeFile(` that binds `visibility`/`'public'`, `enabled`, and calls `indexDocumentChunks(`.

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `indexSingleKnowledgeFile(abs, { category = 'general' } = {})` in knowledge.js** — insert the document row with `visibility='public'`, `enabled=1` via `INSERT OR IGNORE` on `(filename, category)` (`idx_documents_filename_cat`, knowledge.js:520); if a row was inserted, call the EXISTING per-document chunker **`indexDocumentChunks(db, docId, category, content)`** (knowledge.js:392 — the same one `_processKnowledgeChange` uses at ~879; it populates `documents_chunks` + `documents_chunks_fts` and needs NO embedder, so FTS retrieval works immediately). Then fire `backfillKnowledgeEmbeddings()` (batch, ~293) non-blocking + non-fatal to add semantic vectors when the embedder is ready. Do NOT use `backfillDocumentChunks` (it is a whole-DB batch op, not per-file).
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(knowledge): indexSingleKnowledgeFile (public/enabled, idempotent)`

### Task 5: Extend backfill + watcher to scan scripts/ + root knowledge/*.md

**Files:**
- Modify: `electron/lib/knowledge.js` (`backfillKnowledgeFromDisk` ~974-990; `_processKnowledgeChange` path guard ~819; watcher `filename.includes('files')` ~926)
- Test: `electron/scripts/smoke-training-pipeline.js`

- [ ] **Step 1: Write the failing test** — factor the scan-dir list into a pure, testable helper `_trainingScanDirs(ws)` and assert it includes `knowledge/scripts` and the knowledge root (for top-level `*.md`), both tagged `visibility:'public'`, AND that the existing per-category `files/{public,noi-bo,ceo-only}` entries are still present (no regression). Separately assert `getKnowledgeCategories()` does NOT return `'scripts'` (a regex/source check that the category enumeration excludes `scripts`).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — CRITICAL: `knowledge/scripts/` and root `knowledge/*.md` (e.g. `sales-playbook.md`) live at the knowledge ROOT, NOT under a category. Do NOT use `getKnowledgeDir(cat)/scripts`.
  - In `backfillKnowledgeFromDisk`, after the per-category loop, add a separate scan of `path.join(ws,'knowledge','scripts')` (`*.md`) and top-level `knowledge/*.md` files, inserting with `visibility:'public'`, `category:'general'`, via the same `INSERT OR IGNORE` path. Reuse `indexSingleKnowledgeFile` from Task 4 for each.
  - Exclude `scripts` from being treated as a category: `getKnowledgeCategories()` does `readdirSync` and would otherwise return `scripts` as a phantom category. Add `scripts` (and `files`) to its exclusion list so `getKnowledgeDir('scripts')` is never created/scanned as a category.
  - Watcher: loosen the path guards — the `filename.includes('files')` check (~926) and the category-extraction regex `knowledge\/([a-z0-9-]+)\/files\//` (~824) in `_processKnowledgeChange` — to also accept `knowledge/scripts/*.md` and root `knowledge/*.md`. For these (no `/files/` segment) supply `category = 'general'` (the `documents.category` column is NOT NULL and `rewriteKnowledgeIndex(category)` needs it). Visibility resolves correctly via the existing `inferVisibilityFromPath` (returns `'public'` when there is no `/files/(public|noi-bo|ceo-only)/` segment).
  - Keep existing `files/{public,noi-bo,ceo-only}` behavior intact (regression test in Step 1 + the smoke-visibility suite).
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(knowledge): index scripts/ + root knowledge md as public`

## Chunk 3: `/api/ceo-rules/write` — refresh + index + R2 warning

### Task 6: After write, refresh Lane 1 + index Lane 2

**Files:**
- Modify: `electron/lib/cron-api.js` (~1616-1638, after `fs.appendFileSync`)
- Test: `electron/scripts/smoke-training-pipeline.js` (prod-call-site regex)

- [ ] **Step 1: Write the failing test** — regex assert the handler, after append, calls `injectTrainedRulesIntoAgentsMd` for Lane-1 dests (`.learnings/`, `sales-playbook.md`) and `indexSingleKnowledgeFile` for `knowledge/scripts/`.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — after the append + audit, before the response:

```js
try {
  if (destFile.startsWith('.learnings/') || destFile === 'knowledge/sales-playbook.md') {
    require('./trained-rules').injectTrainedRulesIntoAgentsMd();
  } else if (destFile.startsWith('knowledge/scripts/')) {
    await require('./knowledge').indexSingleKnowledgeFile(destPath);
  }
} catch (e) { console.warn('[ceo-rules] post-write refresh failed:', e?.message); }
```

Placement: on the SUCCESS path, after `fs.appendFileSync` + audit (~1617-1630), before the response. The `skipped-duplicate` early-return (~1608) intentionally does NOT refresh/index — the rule already exists and was already injected/indexed on its first write, so a no-op is correct.

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(ceo-rules): refresh CEO-RULES + index scripts on write`

### Task 7: R2 — warn when a rule is code-blocked (warn-only)

**Files:**
- Modify: `electron/lib/cron-api.js` (response object ~1638)
- Test: `electron/scripts/smoke-training-pipeline.js`

- [ ] **Step 1: Write the failing test** — a pure `_trainabilityWarning(text)` helper: input "bot phải biết viết code cho khách" → returns a non-empty warning mentioning code/scope block; input "trả lời ngắn gọn, đừng chào mời" → returns null (in-scope). Curated keyword list mirrors COMMAND-BLOCK / out-of-scope groups (`viết code`, `dịch thuật`, `viết bài`, `làm marketing`, `giải toán`, cron/admin) + output-filter strip patterns. Conservative: unsure → null.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** `_trainabilityWarning(text)` + include `warning` in the JSON response when non-null. Compute the warning EARLY in the handler (right after the `content`/size checks, BEFORE the duplicate-check early-return) so a CEO re-training an already-blocked rule still gets warned. The smoke assertion that keeps the curated list in sync MUST pick a token that genuinely appears in `electron/packages/modoro-zalo/src/inbound.ts` COMMAND-BLOCK source (so drift detection is real, not a self-referential check).
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(ceo-rules): R2 warn-only when a rule is code-blocked`

## Chunk 4: Wire smoke into the build + full verification

### Task 8: Add smoke to the chain + full gate

**Files:**
- Modify: `electron/package.json` (`smoke` script)

- [ ] **Step 1:** Add `&& node scripts/smoke-training-pipeline.js` to the `smoke` chain (before `guard:architecture`).
- [ ] **Step 2: Run** `node electron/scripts/check-module-contracts.js` → 0 failures (new module loads).
- [ ] **Step 3: Run** `npm --prefix electron run smoke` → all green (incl. smoke-training-pipeline + smoke-visibility regression).
- [ ] **Step 4: Manual verify** — CEO trains "đừng chào mời, trả lời ngắn" via `/api/ceo-rules/write` → AGENTS.md gains a CEO-RULES line → next Zalo turn the bot follows it. CEO trains "viết code cho khách" → response includes the R2 warning. A `knowledge/scripts/x.md` becomes RAG-retrievable for a customer.
- [ ] **Step 5: Commit** — `test(training): wire smoke-training-pipeline into smoke chain`

---

## Notes / constraints
- **App version stays 2.4.10.** The CEO-RULES block is runtime-injected (not in the AGENTS.md template), so no AGENTS version-stamp bump → avoids the 3-place sync footgun (spec §7.1 #7). If any task DOES edit the AGENTS.md template, sync `AGENTS.md` stamp + `workspace.js CURRENT_AGENTS_MD_VERSION` + `scripts/smoke-skill-runtime.js` together.
- **Migration is automatic:** Task 3 (boot inject) activates existing `.learnings`/`sales-playbook`; Task 5 (backfill) indexes existing `knowledge/scripts/*.md`. Idempotent.
- **Out of scope (intentional):** AI provider / 9Router OAuth refresh (handled separately); R3 output-filter reconciliation is warn+document only (R2), not auto-rewrite.
- **Delivery:** lib changes → needs a new EXE build to reach users; bump version at ship time (NSIS same-version skip).
