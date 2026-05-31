# CEO Memory Capture v1 — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Capture CEO memories reliably by CODE (not by the LLM deciding to call an API), so `ceo_memories` actually fills and the bot grows with the CEO.

**Architecture:** A pure module `ceo-memory-capture.js` produces facts from a transcript (Layer-1 deterministic regex + Layer-2 code-triggered `call9Router` whose JSON is parsed in code). A second function `captureAndStore` runs the dedup + write loop with **all I/O dependency-injected** (`writeMemory`, `searchMemory`, `readExistingMemories`, `modelCall`) so it is fully unit-testable under plain `node` (no better-sqlite3 / Electron ABI needed). `conversation.js._runIdleMemoryExtraction` wires the real deps and calls `captureAndStore`. Injection (CEO-MEMORY.md → AGENTS.md) is UNCHANGED.

**Tech Stack:** Node CommonJS; standalone `pass()/fail()` test scripts (no jest) run via `node` + `npm run smoke`; `call9Router` (nine-router.js); `ceo_memories` via `writeMemory`/`searchMemory` (ceo-memory.js).

**Spec:** `docs/superpowers/specs/2026-05-31-ceo-memory-native-first-design.md`. Native openclaw memory = phase-2 (out of scope).

---

## File Structure
- **Create** `electron/lib/ceo-memory-capture.js` — `captureFromConversation(text,{existingMemories,modelCall})` (pure) + `captureAndStore(text,{modelCall,writeMemory,searchMemory,readExistingMemories,onMissed})` (DI'd I/O). MUST NOT `require` conversation.js, ceo-memory.js, or any DB.
- **Create** `electron/scripts/check-ceo-memory-capture.js` — unit guard (PLAIN node; DI'd: stubbed modelCall + in-memory write/search mocks). Wired into `npm run smoke`. Covers the LOGIC (Layer1/Layer2/dedup/skip/missed/type-filter), no DB.
- **Create** `electron/scripts/eval-ceo-memory.js` — real-DB eval (under **Electron**; temp `MODORO_WORKSPACE`; stubs ONLY modelCall; real `writeMemory`/`searchMemory`/`regenerateCeoMemoryFile`; asserts CEO-MEMORY.md recall + no-dup). NOT in the node smoke chain — run via `npx electron scripts/eval-ceo-memory.js`.
- **Modify** `electron/lib/conversation.js` — `_runIdleMemoryExtraction` calls `captureAndStore` with real deps; **remove** the `if (!_runCronAgentPromptFn) return;` guard (line ~620); grep+resolve the now-dead `setIdleMemoryRunCronAgent` caller.
- **Modify** `electron/package.json` — add `guard:ceo-memory` (the **node unit check only**, not the Electron eval) to the `smoke` chain.
- **Modify** `AGENTS.md` — replace the "CHỦ ĐỘNG GHI NHỚ" block with one line.
- **Regenerate** `docs/generated/system-map.*` (last, before smoke).

---

## Chunk 1: Component A — pure capture (`ceo-memory-capture.js`)

### Task 1: Layer-1 deterministic extraction

**Files:** Create `electron/lib/ceo-memory-capture.js`; Create `electron/scripts/check-ceo-memory-capture.js`

- [ ] **Step 1: Write the failing test** (`check-ceo-memory-capture.js`)

```js
process.env.NODE_ENV = 'test';
const assert = require('assert');
const { captureFromConversation } = require('../lib/ceo-memory-capture');
let passed = 0, failed = 0;
const ok = (n, c) => { if (c) { console.log('  PASS', n); passed++; } else { console.log('  FAIL', n); failed++; } };

(async () => {
  // Layer 1: explicit preference is captured deterministically (no model)
  const r = await captureFromConversation('Anh: anh thích trả lời ngắn gọn nha em', { modelCall: async () => '[]' });
  const pref = r.facts.find(f => f.type === 'preference' && /ngắn gọn/i.test(f.content));
  ok('layer1 captures explicit preference', !!pref && pref.confidence === 1);
  // Emittable-type guard: never emits task/task_state (writeMemory skips them for source auto)
  ok('no task/task_state types', !r.facts.some(f => f.type === 'task' || f.type === 'task_state'));

  console.log(`\n[check-ceo-memory-capture] ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd electron && node scripts/check-ceo-memory-capture.js`
Expected: FAIL — `Cannot find module '../lib/ceo-memory-capture'`.

- [ ] **Step 3: Minimal implementation** (`ceo-memory-capture.js`)

```js
'use strict';
// Pure CEO-memory capture. NO require of ceo-memory.js / conversation.js / DB.
const { call9Router } = require('./nine-router');

// Emittable = types safe to write for source 'auto'. Excludes `task` (writeMemory
// returns {skipped:true} for source 'auto' + 'task', ceo-memory.js:376) and `task_state`
// (excluded by editorial choice — conversational CEO facts aren't task-state), plus any
// non-VALID_TYPES (which _normalizeType THROWS on).
const EMITTABLE = new Set(['rule', 'pattern', 'preference', 'fact', 'correction', 'procedure', 'entity_note']);

function _norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

function _layer1(text) {
  const facts = [];
  const lines = String(text || '').split(/\r?\n/);
  const PREF = /(anh|em)\s+(thích|ưa|muốn|chỉ\s*muốn|ghét|không\s*thích|đừng|không\s*được|chớ)\s+(.{3,120})/i;
  const ALWAYS = /(luôn\s*luôn|lúc\s*nào\s*cũng|bao\s*giờ\s*cũng)\s+(.{3,120})/i;
  const CORR = /(sai\s*rồi|không\s*phải).{0,40}(mà\s*là|phải\s*là)\s+(.{3,120})/i;
  const LATER = /(lần\s*sau|từ\s*giờ|từ\s*nay)\s+(.{3,120})/i;
  for (const ln of lines) {
    if (PREF.test(ln) || ALWAYS.test(ln)) facts.push({ type: 'preference', content: _norm(ln).slice(0, 200), confidence: 1 });
    else if (CORR.test(ln) || LATER.test(ln)) facts.push({ type: 'correction', content: _norm(ln).slice(0, 200), confidence: 1 });
  }
  return facts;
}

async function captureFromConversation(text, { existingMemories = '', modelCall = call9Router } = {}) {
  const errors = [];
  const facts = _layer1(text);
  // Layer 2 added in Task 2.
  return { facts: facts.filter(f => EMITTABLE.has(f.type)), errors };
}

module.exports = { captureFromConversation, EMITTABLE, _layer1, _norm };
```

- [ ] **Step 4: Run to verify it passes**
Run: `cd electron && node scripts/check-ceo-memory-capture.js`
Expected: PASS (2 passed, 0 failed).

- [ ] **Step 5: Commit**
```bash
git add electron/lib/ceo-memory-capture.js electron/scripts/check-ceo-memory-capture.js
git commit -m "feat(memory): ceo-memory-capture Layer-1 deterministic extraction"
```

### Task 2: Layer-2 code-triggered LLM extraction + parse + type filter

**Files:** Modify `electron/lib/ceo-memory-capture.js`; Modify `electron/scripts/check-ceo-memory-capture.js`

- [ ] **Step 1: Add failing tests** (append in the async IIFE before the summary)

```js
  // Layer 2: parse valid JSON facts, assign confidence 0.7, drop non-emittable types
  const stub = async () => JSON.stringify([
    { type: 'fact', content: 'Công ty bán lẻ thời trang' },
    { type: 'decision', content: 'should be dropped (not VALID_TYPES)' },
    { type: 'task', content: 'should be dropped (auto-skip type)' },
  ]);
  const r2 = await captureFromConversation('Anh: shop mình bán thời trang', { modelCall: stub });
  ok('layer2 keeps valid fact', r2.facts.some(f => f.type === 'fact' && f.confidence === 0.7));
  ok('layer2 drops decision/task', !r2.facts.some(f => ['decision', 'task'].includes(f.type)));
  // Malformed model output: no throw, Layer-1 facts still returned, error recorded
  const r3 = await captureFromConversation('Anh: anh thích trả lời ngắn gọn', { modelCall: async () => 'not json{' });
  ok('malformed model output is safe', r3.facts.some(f => f.type === 'preference') && r3.errors.length >= 1);
```

- [ ] **Step 2: Run to verify the new asserts fail**
Run: `cd electron && node scripts/check-ceo-memory-capture.js`
Expected: FAIL (layer2 asserts fail — Layer 2 not implemented).

- [ ] **Step 3: Implement Layer 2** — replace the `captureFromConversation` body's "Layer 2 added in Task 2." comment:

```js
  let raw;
  try {
    const prompt =
      'Trích các thông tin MỚI đáng nhớ về CEO từ hội thoại dưới đây. ' +
      'CHỈ trả JSON array [{"type","content"}]; type ∈ ' + [...EMITTABLE].join('|') + '. ' +
      'Rỗng [] nếu không có gì mới. KHÔNG ghi lại điều đã có.\n\n' +
      '--- ĐÃ NHỚ ---\n' + String(existingMemories).slice(0, 4000) + '\n--- HỘI THOẠI ---\n' + String(text).slice(0, 8000);
    raw = await modelCall(prompt, { maxTokens: 600, temperature: 0.1, timeoutMs: 20000 });
  } catch (e) { errors.push('modelCall: ' + (e && e.message || e)); return { facts: facts.filter(f => EMITTABLE.has(f.type)), errors }; }
  try {
    const m = String(raw || '').match(/\[[\s\S]*\]/); // salvage the JSON array
    const arr = m ? JSON.parse(m[0]) : [];
    for (const it of (Array.isArray(arr) ? arr : [])) {
      const type = String(it && it.type || '').trim();
      const content = _norm(it && it.content).slice(0, 200);
      if (content && EMITTABLE.has(type)) facts.push({ type, content, confidence: 0.7 });
    }
  } catch (e) { errors.push('parse: ' + (e && e.message || e)); }
```

- [ ] **Step 4: Run to verify all pass**
Run: `cd electron && node scripts/check-ceo-memory-capture.js`
Expected: PASS (5 passed, 0 failed).

- [ ] **Step 5: Commit**
```bash
git add electron/lib/ceo-memory-capture.js electron/scripts/check-ceo-memory-capture.js
git commit -m "feat(memory): ceo-memory-capture Layer-2 LLM extraction (code-parsed, type-filtered)"
```

---

## Chunk 2: Component B/C — `captureAndStore` + eval

### Task 3: `captureAndStore` (DI'd I/O) + unit tests (dedup, skip, missed)

**Files:** Modify `electron/lib/ceo-memory-capture.js`; Modify `electron/scripts/check-ceo-memory-capture.js`

- [ ] **Step 1: Add failing tests**

```js
  // captureAndStore: writes hard facts, dedups exact re-emission, logs skipped + missed
  const db = []; const missed = [];
  const deps = {
    modelCall: async () => '[]',
    readExistingMemories: async () => '',
    searchMemory: async (q) => db.filter(r => _norm(r.content).toLowerCase() === _norm(q).toLowerCase()).map(r => ({ ...r })),
    writeMemory: async ({ type, content, source }) => {
      if (source === 'auto' && (type === 'task' || type === 'task_state')) return { skipped: true };
      db.push({ type, content, source }); return { id: db.length };
    },
    onMissed: (m) => missed.push(m),
  };
  const a = await captureAndStore('Anh: anh thích trả lời ngắn gọn', deps);
  ok('captureAndStore writes the preference', db.some(r => /ngắn gọn/i.test(r.content) && r.type === 'preference' && r.source === 'auto'));
  const before = db.length;
  await captureAndStore('Anh: anh thích trả lời ngắn gọn', deps); // exact re-emission
  ok('dedup: no duplicate row on identical re-run', db.length === before);
```

- [ ] **Step 2: Run to verify fail**
Run: `cd electron && node scripts/check-ceo-memory-capture.js`
Expected: FAIL — `captureAndStore is not defined` (and add `captureAndStore` to the require at top of the test).

- [ ] **Step 3: Implement `captureAndStore`** (add to `ceo-memory-capture.js`, export it)

```js
async function captureAndStore(text, deps = {}) {
  const {
    modelCall = call9Router,
    readExistingMemories = async () => '',
    searchMemory,
    writeMemory,
    onMissed = () => {},
  } = deps;
  if (typeof writeMemory !== 'function' || typeof searchMemory !== 'function') throw new Error('captureAndStore: writeMemory/searchMemory required');
  const existingMemories = await readExistingMemories().catch(() => '');
  const { facts, errors } = await captureFromConversation(text, { existingMemories, modelCall });
  let written = 0, skipped = 0, deduped = 0;
  for (const fact of facts) {
    try {
      const hits = await searchMemory(fact.content, { scopes: ['ceo'], limit: 3 }).catch(() => []);
      const dup = (hits || []).some(h => h.type === fact.type && _norm(h.content).toLowerCase() === _norm(fact.content).toLowerCase());
      if (dup) { deduped++; continue; }
      const r = await writeMemory({ type: fact.type, content: fact.content, scope: 'ceo', source: fact.type === 'correction' ? 'ceo_correction' : 'auto' });
      if (r && r.skipped) { skipped++; onMissed({ type: fact.type, content: fact.content, reason: 'skipped' }); }
      else written++;
    } catch (e) { onMissed({ type: fact.type, content: fact.content, error: String(e && e.message || e) }); }
  }
  return { written, skipped, deduped, errors };
}
// add captureAndStore to module.exports
```

- [ ] **Step 4: Run to verify pass** — `cd electron && node scripts/check-ceo-memory-capture.js` → PASS (7 passed).
- [ ] **Step 5: Commit**
```bash
git add electron/lib/ceo-memory-capture.js electron/scripts/check-ceo-memory-capture.js
git commit -m "feat(memory): captureAndStore with dedup + skip/missed handling (DI'd I/O)"
```

### Task 4: Eval harness (`eval-ceo-memory.js`) — REAL ops, per spec §4C

The DI'd LOGIC (dedup/skip/missed/type-filter) is already covered by `check-ceo-memory-capture.js` under plain node (Tasks 1-3, in smoke). This eval covers what mocks cannot: the **REAL** `writeMemory`/`_normalizeType`/`searchMemory` + `regenerateCeoMemoryFile()` → CEO-MEMORY.md, so a VALID_TYPES/sensitivity/regenerate regression is caught (spec §4C). Because `ceo-memory.js` uses better-sqlite3 (Electron ABI), this eval runs **under Electron** (`npx electron scripts/eval-ceo-memory.js`), NOT plain node, and uses a **temp workspace** (env `MODORO_WORKSPACE`) so it never touches the CEO's real `memory.db`.

**Files:** Create `electron/scripts/eval-ceo-memory.js`

- [ ] **Step 1: Write the eval** (real ops in a throwaway workspace; only `modelCall` stubbed)

```js
process.env.NODE_ENV = 'test';
const fs = require('fs'); const os = require('os'); const path = require('path');
// Throwaway workspace so the REAL ceo_memories DB + CEO-MEMORY.md are isolated.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ceomem-eval-'));
process.env.MODORO_WORKSPACE = tmp; fs.mkdirSync(path.join(tmp, 'logs'), { recursive: true });
const assert = require('assert');
const { captureAndStore } = require('../lib/ceo-memory-capture');
const ceoMem = require('../lib/ceo-memory');            // REAL writeMemory/searchMemory/regenerate
const _norm = s => String(s || '').replace(/\s+/g, ' ').trim();

const HARD = ['anh thích trả lời ngắn gọn', 'anh ghét nói dài dòng', 'đừng gửi báo cáo sau 22h']; // all sensitivity-clean
const transcript = HARD.map(h => 'Anh: ' + h).join('\n') + '\nAnh: shop mình bán mỹ phẩm';
const missed = [];
const deps = {
  modelCall: async () => JSON.stringify([{ type: 'fact', content: 'Shop bán mỹ phẩm' }]),  // 1 soft fact
  readExistingMemories: async () => { try { return fs.readFileSync(path.join(tmp, 'CEO-MEMORY.md'), 'utf-8'); } catch { return ''; } },
  searchMemory: ceoMem.searchMemory,
  writeMemory: ceoMem.writeMemory,
  onMissed: m => missed.push(m),
};
(async () => {
  await captureAndStore(transcript, deps);
  await ceoMem.regenerateCeoMemoryFile();                // SYNCHRONOUS regenerate (avoid debounce race)
  const md = fs.readFileSync(path.join(tmp, 'CEO-MEMORY.md'), 'utf-8').toLowerCase();
  for (const h of HARD) assert(md.includes(_norm(h).toLowerCase().slice(0, 20)), 'CEO-MEMORY.md missing hard fact: ' + h);
  const rows1 = (await ceoMem.searchMemory('trả lời ngắn gọn', { scopes: ['ceo'], limit: 10 })).length;
  await captureAndStore(transcript, deps);               // identical re-run
  const rows2 = (await ceoMem.searchMemory('trả lời ngắn gọn', { scopes: ['ceo'], limit: 10 })).length;
  assert.strictEqual(rows2, rows1, 'duplicate rows created on re-run (dedup failed)');
  assert.strictEqual(missed.length, 0, 'unexpected missed/skipped: ' + JSON.stringify(missed));
  console.log('[eval-ceo-memory] PASS — hard facts injected:', HARD.length, '| no duplicates on re-run');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(e => { console.error('[eval-ceo-memory] FAIL', e.message); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} process.exit(1); });
```

- [ ] **Step 2: Run under Electron** — `cd electron && npx electron scripts/eval-ceo-memory.js` → `[eval-ceo-memory] PASS`. (Plain `node` will fail with the better-sqlite3 ABI error — that's expected; the eval needs the Electron runtime.)
- [ ] **Step 3: Commit**
```bash
git add electron/scripts/eval-ceo-memory.js
git commit -m "test(memory): real-DB eval for ceo-memory capture (recall + injection + dedup)"
```

---

## Chunk 3: Wire into runtime + retire + verify

### Task 5: Wire `conversation.js._runIdleMemoryExtraction` → `captureAndStore`

**Files:** Modify `electron/lib/conversation.js` (`_runIdleMemoryExtraction` ~line 618; guard ~620; the `_runCronAgentPromptFn(prompt,...)` call ~647)

- [ ] **Step 1:** Read `_runIdleMemoryExtraction` in full. Confirm current line numbers (they shift).
- [ ] **Step 2:** Replace the body so it: gathers `history` (existing `extractConversationHistory`), then:
```js
const { captureAndStore } = require('./ceo-memory-capture');
const ceoMem = require('./ceo-memory');
const fs = require('fs'); const path = require('path');
const res = await captureAndStore(history, {
  modelCall: call9Router,
  readExistingMemories: async () => { try { return fs.readFileSync(path.join(getWorkspace(), 'CEO-MEMORY.md'), 'utf-8'); } catch { return ''; } },
  searchMemory: ceoMem.searchMemory,
  writeMemory: ceoMem.writeMemory,
  onMissed: (m) => { try { fs.appendFileSync(path.join(getWorkspace(), 'logs', 'memory-missed.log'), JSON.stringify({ t: new Date().toISOString(), ...m }) + '\n'); } catch {} },
});
console.log('[idle-memory] captured', res.written, 'written,', res.deduped, 'deduped,', res.skipped, 'skipped');
try { auditLog('idle_memory_extract', { written: res.written, deduped: res.deduped, skipped: res.skipped }); } catch {}
```
- [ ] **Step 3:** **Remove** the `if (!_runCronAgentPromptFn) return;` guard (it gated on the old cron-agent fn). Keep the watcher's settled/throttle/force gating.
- [ ] **Step 3b:** `Grep` the repo for `setIdleMemoryRunCronAgent` (esp. `main.js`/`dashboard-ipc.js`). If its only purpose was wiring `_runCronAgentPromptFn` for the now-removed path, delete the setter + its call + the `_runCronAgentPromptFn` var (dead code); if another caller relies on it, leave it and note why. Verify with `node --check` on every file touched.
- [ ] **Step 4: Syntax check** — `cd electron && node --check lib/conversation.js` → OK.
- [ ] **Step 5: Commit**
```bash
git add electron/lib/conversation.js
git commit -m "feat(memory): wire idle watcher to code-driven captureAndStore (drop LLM-POST path)"
```

### Task 6: Retire AGENTS.md rule + wire test into smoke

**Files:** Modify `AGENTS.md`; Modify `electron/package.json`

- [ ] **Step 1:** In `AGENTS.md`: (a) replace the "**CHỦ ĐỘNG GHI NHỚ (BẮT BUỘC)**" block (lines ~404-411 — re-grep the exact span first; from the `**CHỦ ĐỘNG GHI NHỚ` line through the last sub-bullet before the next blank line) with the single line `(Ký ức được code tự ghi tự động — không cần bot tự gọi API.)`; (b) also retire the residual capture instruction at line ~402 ("Khi CEO dạy quy trình lặp lại, ghi `type: procedure` bằng `/api/memory/write`…") — drop the `/api/memory/write` directive there. **KEEP** the Capability-Router row (~line 322) — it is a routing hint, not an autonomous-capture instruction. Goal: no AGENTS.md line tells the bot to POST for autonomous memory capture ("exactly one capture path", spec §9).
- [ ] **Step 2:** In `electron/package.json`, add `"guard:ceo-memory": "node scripts/check-ceo-memory-capture.js"` (node unit check ONLY — the real-DB eval runs under Electron, not the node smoke chain) and append `&& npm run guard:ceo-memory` to the `smoke` script (after the last existing step).
- [ ] **Step 3: Run** — `cd electron && npm run guard:ceo-memory` → PASS. (Separately, the Electron eval: `npx electron scripts/eval-ceo-memory.js` → PASS.)
- [ ] **Step 4: Commit**
```bash
git add AGENTS.md electron/package.json
git commit -m "chore(memory): retire LLM-POST AGENTS rule; wire ceo-memory guard into smoke"
```

### Task 7: Regenerate system-map + full smoke

- [ ] **Step 1:** `cd electron && node scripts/generate-system-map.js`
- [ ] **Step 2:** `cd electron && npm run smoke` → EXIT 0 (the new `guard:ceo-memory` node check passes; the dev-only better-sqlite3 ABI warnings come from OTHER smoke steps' ceo-memory DB init, not this guard — they don't fail smoke).
- [ ] **Step 3: Commit**
```bash
git add docs/generated/system-map.json docs/generated/system-map.txt
git commit -m "chore(system-map): regenerate after ceo-memory capture v1"
```

### Task 8: Live verification (post-build, manual)
- [ ] After a build+install (or source run), CEO sends a preference via Telegram ("anh thích trả lời ngắn gọn"); wait for the watcher window (settled ≥20m / force 6h); confirm a row appears in `ceo_memories` (or `CEO-MEMORY.md`); next session the bot honors it. (Behavior check — not part of the deterministic eval.)

---

## Notes
- **Two test layers:** `check-ceo-memory-capture.js` (DI'd, plain `node`, in `npm run smoke` — fast logic coverage of Layer1/Layer2/dedup/skip/missed, no DB) + `eval-ceo-memory.js` (REAL `ceo-memory.js` ops under **Electron** + temp `MODORO_WORKSPACE` — catches VALID_TYPES/sensitivity/regenerate regressions + the CEO-MEMORY.md injection assertion, per spec §4C). Production wires the real ops.
- **Fail-loud:** `onMissed` logs both throws and `{skipped:true}` no-writes to `logs/memory-missed.log`.
- **Injection unchanged:** no edits to `regenerateCeoMemoryFile`/AGENTS injection beyond retiring the POST rule.
- **Diacritics:** dedup compares lowercased + whitespace-collapsed content WITHOUT stripping Vietnamese accents.
