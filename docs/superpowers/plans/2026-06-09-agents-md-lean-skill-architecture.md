# AGENTS.md Lean + Agent-Decides Skill Loading — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the seeded `AGENTS.md` from ~48 KB to ~18–20 KB by moving duplicated per-feature procedures into on-demand skills (agent decides via a sharp catalog), while keeping safety code-enforced and routing reliability non-regressed.

**Architecture:** Build the verification guardrails FIRST (size-gate + routing eval), then make `skills/INDEX.md` the canonical selector-catalog, then cut the duplicated procedure blocks out of `AGENTS.md` leaving 1-line pointers — verifying after every cut that the eval set and size-gate still pass. Keep the keyword-router table (compressed) as a fallback in v1.

**Tech Stack:** Node.js (build/CI scripts under `electron/scripts/`), `node --test` (existing test runner), markdown (`AGENTS.md`, `skills/**`).

**Spec:** `docs/superpowers/specs/2026-06-09-agents-md-lean-skill-architecture-design.md`

---

## File Structure

- `electron/scripts/check-agents-md-size.js` — **new.** Fails if `AGENTS.md` > budget. Wired into `build:win` + `smoke`.
- `electron/tests/agents-md-size.test.js` — **new.** Unit test for the size-checker logic.
- `electron/scripts/eval-routing.js` — **new.** Deterministic catalog/coverage checks (CI) + optional LLM input→skill eval (on-demand).
- `electron/tests/routing-catalog.test.js` — **new.** Asserts every routed intent resolves to an existing skill with a non-empty selector description, and every `Đọc skills/…` pointer in `AGENTS.md` resolves to a real file.
- `skills/INDEX.md` — **modify.** Becomes the canonical catalog: each skill = `name` + `dùng khi X, KHÔNG dùng khi Y`.
- `AGENTS.md` — **modify.** Replace duplicated procedure blocks with pointers; compress router table.
- `skills/operations/zalo.md` — **modify.** Receive the `[[GUI_ANH]]` marker rule if not already present.
- `electron/lib/workspace.js:36` — **modify.** Bump `CURRENT_AGENTS_MD_VERSION` 121 → 122.

---

## Chunk 1: Guardrails (verify before cutting)

### Task 1: AGENTS.md size-gate

**Files:**
- Create: `electron/scripts/check-agents-md-size.js`
- Test: `electron/tests/agents-md-size.test.js`
- Modify: `electron/package.json` (add to `smoke` chain or a `check:agents-size` script)

- [ ] **Step 1: Write the failing test**

```js
// electron/tests/agents-md-size.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { checkSize } = require('../scripts/check-agents-md-size.js');

test('passes when under budget', () => {
  assert.deepEqual(checkSize(10_000, 22_528), { ok: true, bytes: 10_000, budget: 22_528 });
});
test('fails when over budget', () => {
  const r = checkSize(30_000, 22_528);
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run it, verify it fails** — `node --test electron/tests/agents-md-size.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement**

```js
// electron/scripts/check-agents-md-size.js
'use strict';
const fs = require('fs');
const path = require('path');
// Gate = 22 KB ceiling; TARGET after Chunk 3 = 18-20 KB. 21 KB passes the gate and is
// fine — tighten the ceiling in a follow-up once stable (spec open question).
// CI/DEV-ONLY: runs against the source-tree AGENTS.md during smoke/build. NEVER run inside
// the packaged app (scripts/ is asar-packed; AGENTS.md ships to workspace-templates/).
const BUDGET_BYTES = 22 * 1024;

function checkSize(bytes, budget = BUDGET_BYTES) {
  return { ok: bytes <= budget, bytes, budget };
}

function main() {
  const p = path.join(__dirname, '..', '..', 'AGENTS.md');
  const bytes = fs.statSync(p).size;
  const r = checkSize(bytes);
  if (!r.ok) {
    console.error(`[agents-size] AGENTS.md ${r.bytes}B exceeds budget ${r.budget}B — move detail into skills (see spec 2026-06-09).`);
    process.exit(1);
  }
  console.log(`[agents-size] OK ${r.bytes}B / ${r.budget}B`);
}

if (require.main === module) main();
module.exports = { checkSize, BUDGET_BYTES };
```

- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Wire into CI** — add `node scripts/check-agents-md-size.js` to the `smoke` script in `electron/package.json` (runs in `build:win`). Note: gate starts RED until Chunk 3 lands; keep it as a separate `check:agents-size` script first, flip into `smoke` at the end of Chunk 3.
- [ ] **Step 6: Commit** — `git commit -m "feat(agents): size-gate for AGENTS.md (spec 2026-06-09)"`

### Task 2: Routing catalog/coverage check (deterministic, CI)

**Files:**
- Create: `electron/scripts/eval-routing.js`
- Test: `electron/tests/routing-catalog.test.js`

- [ ] **Step 1: Write the failing test** — assert helpers exist and behave:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { extractSkillPointers, missingFiles, intentsWithoutDescription } = require('../scripts/eval-routing.js');

test('extractSkillPointers finds "Đọc skills/..." references', () => {
  const md = 'foo\nĐọc `skills/operations/zalo.md` mục X\n';
  assert.deepEqual(extractSkillPointers(md), ['skills/operations/zalo.md']);
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `eval-routing.js`:
  - `extractSkillPointers(md)` → all `skills/...md` paths referenced in `AGENTS.md`.
  - `missingFiles(paths, repoRoot)` → those that don't exist on disk.
  - `intentsWithoutDescription(indexMd)` → catalog entries in `skills/INDEX.md` missing a `dùng khi …` selector line.
  - `main()`: fail (exit 1) if any AGENTS.md pointer is dangling OR any catalog entry lacks a selector description. Print a summary.
- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Run `node scripts/eval-routing.js`** against current repo; record the baseline list of gaps (do NOT fix catalog yet — that's Chunk 2). Keep this script OUT of `smoke` until Chunk 2 closes the gaps.
- [ ] **Step 6: Commit** — `git commit -m "feat(agents): routing catalog/coverage checker"`

### Task 3: Agent-vs-router agreement logging (real-traffic evidence for v2)

**Files:**
- Modify: the inbound skill-injection path (the same place custom skills are matched, per `inbound.ts`/`channels`), read-only logging only.

- [ ] **Step 1:** Identify where a turn's selected skill is known. NOTE the real difficulty: the keyword-router pick is known at INJECT time, but the agent's actual pick is only knowable POST-response — correlating both for one turn is the hard part. Add a fire-and-forget log line `{t, channel, agentPicked, keywordRouterPicked, agree}` appended to the **userData workspace** `.learnings/routing-agreement.jsonl` (via the workspace path resolver — NOT the repo `.learnings/`, which is only a seed template). NO behavior change — logging only.
- [ ] **Step 2:** Verify it never throws into the message path (wrap in try/catch).
- [ ] **Step 3: Commit** — `git commit -m "chore(agents): log agent-vs-router routing agreement (v2 evidence)"`

> **Task 3 is BEST-EFFORT for v1** (the inject-time vs post-response correlation is non-trivial). If the injection point is awkward, ship v1 without it and flag to human — spec success criterion #4 is downgraded to best-effort accordingly.

---

## Chunk 2: Canonical selector-catalog

### Task 4: Make `skills/INDEX.md` the catalog

**Files:**
- Modify: `skills/INDEX.md`

- [ ] **Step 1:** List every skill currently referenced by `AGENTS.md` (router table 323-360 + the `Đọc skills/…` pointers). Use `node scripts/eval-routing.js` output from Task 2.
- [ ] **Step 2:** For each, write/verify a catalog entry: `name` + one line `dùng khi <intent cụ thể>, KHÔNG dùng khi <near-miss>`. Selectors, not manuals (spec). Vietnamese with dấu.
- [ ] **Step 3: Verify** — `node scripts/eval-routing.js` → `intentsWithoutDescription` empty; `missingFiles` empty.
- [ ] **Step 4: Commit** — `git commit -m "feat(skills): INDEX.md as canonical selector-catalog"`

---

## Chunk 3: Slim AGENTS.md (cut duplicates → pointers)

> After EACH task below: run `node scripts/eval-routing.js` (no dangling pointers) and re-read the destination skill to confirm it contains the moved detail. Commit per task so any regression is bisectable.

### Task 5: Document pipeline (lines 77–110) → pointer

**Files:** Modify `AGENTS.md`; verify `skills/operations/document-creation.md`.

- [ ] **Step 1:** Confirm `skills/operations/document-creation.md` contains the full CREATE/EDIT pipeline (reviewer verified it is a near-verbatim copy). If any unique line is missing there (e.g. the `gog --convert` rule), add it to the skill FIRST.
- [ ] **Step 2:** Replace `AGENTS.md` lines 77–110 with a 1–2 line pointer + ensure the router rows (docx/xlsx/pptx/pdf) and `skills/INDEX.md` point to both the anthropic skill AND `document-creation.md`.
- [ ] **Step 3: Verify** — eval-routing passes; manually confirm a "tạo báo giá word" path still reaches the procedure via catalog/router.
- [ ] **Step 4: Commit** — `git commit -m "refactor(agents): move document pipeline to skill (dedup)"`

### Task 6: Fanpage resolution (409–415) → pointer

- [ ] Confirm `skills/marketing/facebook-post-workflow.md` "Bước 0 — Xác định fanpage" (line 43) covers it → replace AGENTS.md block with pointer → eval → commit.

### Task 7: Zalo history detail (294–307) → skill

- [ ] Move the endpoint detail + the anti-fabrication guard ("KHÔNG bịa nút UI không tồn tại") into a Zalo-history skill section; leave a pointer. **Preserve the anti-fabrication guard verbatim** (customer-incident lesson). → eval → commit.

### Task 8: Image/brand block (398–407) → split

- [ ] image-generation detail → `skills/operations/image-generation.md`; the Zalo `[[GUI_ANH]]` customer-marker rule → `skills/operations/zalo.md` (confirm present there first). Leave pointers. → eval → commit.

### Task 9: Compress keyword-router table (323–360)

- [ ] Keep the table as fallback but trim verbose inline action text into the referenced skills where duplicated; keep only the trigger→skill mapping + the few rows that carry irreplaceable inline API calls (`fb_approve`, `cron_verbatim_confirm`). → eval → commit.

### Task 10: Bump version + final verification

**Files:** Modify `electron/lib/workspace.js:36`.

- [ ] **Step 1:** `CURRENT_AGENTS_MD_VERSION` 121 → 122. **If Chunk 3 is ever reverted, revert this bump too** — else installs get a v122 stamp with old content.
- [ ] **Step 2:** Flip the size-gate into `smoke` (Task 1, Step 5) and add `eval-routing` to `smoke`. (This resolves the spec open question "eval in smoke vs separate script" → in `smoke`.)
- [ ] **Step 3: Verify** — run `cd electron && node scripts/generate-system-map.js && npm run smoke`. Expect: size-gate PASS (AGENTS.md ≤ 22 KB), eval-routing PASS, all existing smoke green.
- [ ] **Step 4:** Measure: print final `AGENTS.md` bytes/lines; confirm ~18–20 KB.
- [ ] **Step 5: Commit** — `git commit -m "refactor(agents): slim AGENTS.md to ~20KB + bump AGENTS version to 122"`

---

## Done criteria (from spec)

- `AGENTS.md` ≤ ~20 KB; eval-routing + size-gate green in `smoke`.
- No `Đọc skills/…` pointer is dangling; every routed intent has a skill + selector description.
- Anti-fabrication / safety guards preserved verbatim.
- `CURRENT_AGENTS_MD_VERSION` bumped; behavior verified on Windows (and macOS via CI when built).

## Out of scope (v2)

Remove keyword-router (migrate its hand-curated action text into skills), semantic routing over the catalog, decouple skill delivery from app version, live-LLM input→skill eval as a gating step.
