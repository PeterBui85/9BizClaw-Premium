# Spec v1: Code-driven CEO Memory Capture for 9BizClaw

**Date:** 2026-05-31
**Status:** Re-sequenced after spec-review (CEO chose "B first" — reliable code-driven v1; native openclaw memory moved to a **phase-2 investigation**, NOT in v1). Spec-review iteration 3.
**Scope (v1):** CEO memory over Telegram only. Local-only. Fully under our control — no dependency on unverified openclaw internals.

## TL;DR (vi)
Hiện bot "dạ vâng" nhưng KHÔNG ghi nhớ (lệ thuộc LLM tự gọi `POST /api/memory/write` → `ceo_memories` rỗng nhiều ngày). v1 sửa bằng **đường code-driven hoàn toàn**: code tự trích (deterministic + 1 lần gọi model do code điều khiển, code tự parse + ghi), không nhờ LLM tự giác. Chạy ngay trên `ceo_memories` + inject CEO-MEMORY.md sẵn có. **Native memory openclaw** (canh bạc nhiều ẩn số) → tách thành **spike nghiên cứu phase-2**, không chặn v1.

## 1. Problem
Capture currently depends on the LLM *choosing* to call `POST /api/memory/write` (plus an idle-extraction agent that also asks the LLM to POST). Verified 2026-05-30/31: `ceo_memories` empty for days; the CEO said "anh thích trả lời ngắn gọn", the bot acknowledged, nothing was stored. Root cause: capture relies on LLM voluntariness — unreliable (repo rule `project_rule_injection_scale`: code-level guards at the pipeline point, not LLM rules). Goal: capture that is reliable (code-driven), grows with the CEO, local/private, and proven by an eval.

## 2. Decision (re-sequenced)
- **v1 = code-driven capture** — fully specifiable + testable now, no openclaw-internal dependency.
- **Native openclaw memory = phase-2 investigation** (a research spike documented separately; adopt only if it proves out). Out of v1. This keeps v1 100%-controllable per the "must work" requirement.
- **Injection UNCHANGED:** keep the existing `CEO-MEMORY.md → AGENTS.md` injection (already "Hermes-style"). v1 changes only **capture**, so there is no double-injection / `INJECT_MODE` complexity.

## 3. Verified anchors (grounding — all exist in source)
- `call9Router(prompt, { maxTokens, temperature, timeoutMs })` — `electron/lib/nine-router.js` (used in conversation.js:6, ceo-nudge.js:156, cron.js:15). The model-call seam for extraction.
- `writeMemory(opts)` — `ceo-memory.js:372`; `source` coerced to `VALID_SOURCES` (line 375): `['nudge','ceo_correction','evening_summary','manual','auto','workflow','system']`. v1 uses **`'auto'`** (preference/fact) and **`'ceo_correction'`** (correction) — both valid; no schema change.
- `searchMemory(query, { limit, bumpRelevance, scopes, channel })` — `ceo-memory.js:476`; used for dedup (relevance-boost an existing row instead of inserting a duplicate).
- `_runIdleMemoryExtraction()` — `conversation.js:618` (the periodic watcher fixed earlier this session). Line 647 currently calls `_runCronAgentPromptFn(prompt, {label:'idle-memory-extract'})` (the "ask the agent to POST" path) — **this is the line v1 replaces.**
- Notify hook `_memoryWriteNotifyCeo`/`notifyCeoMemoryWrite` (conversation.js:10-14) — v1 writes must NOT trigger it (no CEO spam).

## 4. v1 Components

### Component A — `ceo-memory-capture.js` (new, pure, testable)
`async function captureFromConversation(text, { existingMemories = [], modelCall = call9Router } = {}) → { facts: [{ type, content, confidence }], errors: [] }`
- **Emittable types (hard constraint):** every returned `type` MUST be in the **writable set** `rule|pattern|preference|fact|correction|procedure|entity_note`. (`writeMemory`'s `_normalizeType` THROWS on a type outside VALID_TYPES — e.g. the old prompt's `decision`; AND `writeMemory` SILENTLY returns `{skipped:true}` for `source:'auto'` + `type` in `task|task_state` (ceo-memory.js:376) — so this module must NOT emit `task`/`task_state` either, else the fact is silently dropped.) The module coerces/skips any type outside the writable set before returning.
- **No imports:** this module must NOT `require` conversation.js, ceo-memory.js, or the DB — it is pure (only `modelCall` injected) so its unit test loads it in isolation under `NODE_ENV=test`.
- **Layer 1 — deterministic (always runs, no model):** regex over the transcript's CEO content lines (matches message content, not a role field):
  - preference: `anh (thích|ưa|muốn|chỉ muốn) …`, `anh (ghét|không thích|đừng|không được|chớ) …`, `(luôn|lúc nào cũng|bao giờ cũng) …` → `{type:'preference', confidence:1}`.
  - correction: `(sai rồi|không phải).*(mà là|phải là) …`, `lần sau …` → `{type:'correction', confidence:1}`.
- **Layer 2 — code-triggered LLM (best-effort):** ONE `modelCall` with a strict structured-JSON prompt (return `[{type,content}]` of NEW memorable facts, `type` constrained to VALID_TYPES; include `existingMemories` so it only adds new/evolving; empty array if none). **Code parses the model's TEXT** (salvage-or-skip; never relies on the model calling a tool) and **drops any fact whose `type` ∉ VALID_TYPES**. Parse failure → push to `errors`, return Layer-1 facts anyway. Layer-2 facts get `confidence: 0.7` (LLM-derived, below Layer-1's 1.0). Confidence is a **ranking signal only** (writeMemory weights it ~0.12 in search scoring; it does NOT gate writes or injection) — do not add a confidence threshold.
- `modelCall` is injectable so the eval can stub it deterministically. No DB access inside this module — it only produces facts; the caller writes them.
- **Sensitivity (downstream behavior to know):** `writeMemory` routes content with sensitive tokens (phone, email, 'mật khẩu'/'password', 12–19-digit runs) to `status:'pending_review'` via `classifySensitivity` (ceo-memory.js:170) — excluded from `searchMemory` + injection until reviewed. This is intended (don't auto-surface secrets). Deterministic Layer-1 preferences like "trả lời ngắn gọn" are sensitivity-clean, so they inject normally.

### Component B — wire into `_runIdleMemoryExtraction` (conversation.js)
Replace the line-647 POST-prompt with the steps below. ALSO **remove the `if (!_runCronAgentPromptFn) return;` guard (conversation.js:620)** — the new path uses `call9Router` directly, not the injected cron-agent fn, so that guard would otherwise dead-block extraction whenever the setter wasn't called. (`setIdleMemoryRunCronAgent`/`_runCronAgentPromptFn` may be deleted if no other caller uses them; the watcher no longer depends on them.)
1. `history` = the formatted CEO Telegram transcript (string from `extractConversationHistory`). `existingMemories` for the Layer-2 prompt (so it avoids re-emitting known facts) = the **current CEO-MEMORY.md text**, read via `fs.readFileSync(path.join(getWorkspace(), 'CEO-MEMORY.md'), 'utf-8')` in a try/catch → `''` on missing file. Do NOT use `searchMemory('')` — it returns `[]` on an empty/non-string query (ceo-memory.js:479 guard).
2. `{ facts, errors } = await captureFromConversation(history, { existingMemories, modelCall: call9Router })`.
3. For each fact, in its **own try/catch** (one throwing fact — bad type or DB error — must NOT abort the rest):
   - **Dedup (concrete, deterministic):** `hits = await searchMemory(fact.content, { scopes:['ceo'], limit:3 })` (non-empty query → works). SKIP the write if any hit has the SAME `type` AND a **normalized-content match** = lowercased + whitespace-collapsed equal, **Vietnamese diacritics PRESERVED** (per repo rule — never strip accents). (`searchMemory` boosts the matched row via `bumpRelevance`, so a skip still refreshes recency.) NOTE: searchMemory hits expose `score` (a composite 0-1), NOT `relevance`, and `score` rarely reaches a high cutoff — so normalized-content equality, not a score threshold, is the dedup signal. Otherwise write.
   - **Write:** `const r = await writeMemory({ type: fact.type, content: fact.content, scope:'ceo', source: fact.type==='correction' ? 'ceo_correction' : 'auto' })`. NO `notifyCeo` arg — `writeMemory` itself never notifies the CEO (the notify hook `notifyCeoMemoryWrite` is fired only by other callers); Component B simply does not call it, so it is anti-spam by omission.
   - **Detect silent skip:** if `r?.skipped` is truthy (a no-write, NOT a throw — the try/catch won't catch it), log to `logs/memory-missed.log` with `reason:'skipped'`. A skip is not a success (fail-loud). [The emittable-type constraint in Component A already prevents the known `task`/`source:'auto'` skip; this is defense-in-depth.]
4. **Fail-loud:** on a per-fact throw (DB unavailable, etc.), append a JSON line to `logs/memory-missed.log` `{t, type, content, error}` (don't silently drop) — a forensic post-mortem log. Surfacing it in the Dashboard overview is optional/phase-2 (not a v1 unit).
- Keep the watcher's existing trigger gating (settled / throttle / force) — only the inner mechanism changes.

### Component C — Eval (`electron/scripts/eval-ceo-memory.js`, `NODE_ENV=test`)
- Fixture transcript with 5 facts: **3 hard** (explicit "anh thích/ghét/đừng…", incl. short-reply) + 2 soft. All **sensitivity-clean** (no phone/email/password/long-digit) so none route to `pending_review` and the injection assertion is valid.
- `modelCall` **stubbed** with a fixed fixture response → deterministic.
- Assert: **100% of the 3 hard facts** written to `ceo_memories` (guaranteed by Layer 1 even if the stub returns nothing); **no duplicate rows** on a second run (dedup); the regenerated CEO-MEMORY.md contains the 3 hard facts.
- Uses the **REAL** `writeMemory`/`_normalizeType` + `searchMemory` (only `modelCall` is stubbed) so a future VALID_TYPES change that would break Layer-2 output, or a dedup regression, is caught here.
- Before asserting CEO-MEMORY.md contents, the eval calls `regenerateCeoMemoryFile()` **synchronously** — regeneration is normally debounced via `_scheduleRegeneration` (ceo-memory.js:426), so the eval forces it to avoid a flaky race.
- Behavior-change ("bot answers short") = **separate live check** post-build, not in this deterministic eval.

## 5. Injection (unchanged)
`ceo_memories → regenerateCeoMemoryFile() → CEO-MEMORY.md → AGENTS.md` stays exactly as-is. One injection path. No native, no `INJECT_MODE`.

## 6. Retire / minimize
- `_runIdleMemoryExtraction`'s POST-prompt path → **replaced** by Components A+B (no parallel system: this IS the one capture path).
- AGENTS.md "CHỦ ĐỘNG GHI NHỚ" rule → replace the block with a single one-line note: "(Ký ức được code tự ghi tự động — không cần bot tự gọi API.)" (exact target so the AGENTS.md edit is unambiguous; respects the 40K limit).
- `/api/memory/write` → kept as a write primitive only (no longer relied upon for capture).

## 7. Data flow
CEO Telegram conversation → watcher `_runIdleMemoryExtraction` fires (settled/throttle/force) → `captureFromConversation` (Layer 1 deterministic + Layer 2 code-parsed LLM) → dedup → `writeMemory` → `ceo_memories` → CEO-MEMORY.md → AGENTS.md (next session). No step depends on the LLM voluntarily calling an API.

## 8. Error handling / fail-safe
- Layer 2 LLM returns malformed/empty → Layer 1 still captures hard facts; errors recorded, not thrown.
- `writeMemory` throws (DB unavailable / bad type) → per-fact try/catch isolates it (rest still captured) + JSON line to `logs/memory-missed.log` `{t,type,content,error}` (fail-loud, surfaced).
- Dedup prevents duplicate rows across runs/layers.
- `modelCall` timeout (call9Router timeoutMs) → caught → Layer-1-only result.

## 9. Success criteria
- Eval: 100% of 3 hard facts in `ceo_memories`, no duplicates, CEO-MEMORY.md contains them, deterministic (stubbed model).
- `npm run smoke` exits 0 (+ regenerate system-map after edits).
- Live (post-build): CEO states a preference → within the watcher window → `ceo_memories` has it → next session the bot honors it.
- Exactly one capture path; injection unchanged.

## 10. Risks
- Layer-1 regex misses nuanced phrasing → Layer 2 (LLM) covers softer cases; both dedup'd.
- **Dedup is best-effort:** `searchMemory` returns top-3 by composite `score` + filters rows lacking a retrieval signal, so an EXACT re-emission is caught (FTS) but a paraphrase may slip and create a second row. Acceptable for v1 (the eval uses a stubbed fixed model → exact re-emission → deterministically verifies the exact-match dedup path).
- Layer 2 cost = one `call9Router` per watcher fire (throttled 2h / forced 6h) → bounded.
- Watcher never fires on a 24/7-busy bot → mitigated by the force-every-6h already added; Layer 1 is cheap.
- `call9Router` slow/unavailable → caught; Layer 1 still runs.

## 11. Out of scope (v1)
- **Native openclaw memory (memory-core/active-memory)** → phase-2, specified in its OWN spec — including: a measurable spike PASS/FAIL gate; the strict `additionalProperties:false` plugin schema (a single unknown subkey breaks validation); an `ensureDefaultConfig` whitelist/heal for the `memory` block; and native-vs-custom coexistence/dedup. NONE of that is in this v1 spec — **v1 has zero native dependency**, so those concerns do not block v1.
- Per-customer (Zalo) memory; behavior-enforcement loop; cloud providers (private-data posture).

## 12. Incremental order
1. Component A (`ceo-memory-capture.js`) + unit test of Layer 1 regex + Layer 2 parse (stubbed model).
2. Component C eval scaffold.
3. Component B wire into `_runIdleMemoryExtraction` (replace POST-prompt) + dedup + fail-loud.
4. Run eval → assert recall/dedup/injection.
5. Retire AGENTS rule to a note; smoke (regen system-map).
6. Build + live behavior-verify.
7. (Phase 2, separate) native-memory investigation spike.

## Sources
- `docs/reports/hermes-memory-research.md`
- Verified anchors: `call9Router` (nine-router.js), `writeMemory`/`VALID_SOURCES` (ceo-memory.js:372/10/375), `searchMemory` (ceo-memory.js:476), `_runIdleMemoryExtraction` (conversation.js:618/647), notify hook (conversation.js:10-14).
