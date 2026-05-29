# Zalo Training Pipeline — Two-Lane Design

- **Date:** 2026-05-29
- **Status:** Design (approved in brainstorming, pending spec review)
- **Owner:** 9BizClaw
- **App version target:** see "Update / Delivery" (likely a version bump is required to install)

## 1. Problem

Customers report: *no matter how much they "train" the Zalo bot's behaviour, it has no effect* — the bot keeps replying the same way.

### Root cause (verified)

Two independent failures, both confirmed in code:

1. **Dead-letter training (broken pipe).** CEO trains via Telegram → `POST /api/ceo-rules/write` ([cron-api.js:1564-1585](../../../electron/lib/cron-api.js)) writes to:
   - `knowledge/sales-playbook.md` (default — sales/behaviour rules)
   - `knowledge/scripts/<slug>.md` (reply templates)
   - `.learnings/ERRORS.md`, `.learnings/LEARNINGS.md` (corrections/lessons)
   - `memory/zalo-users/<id>.md` (customer-specific)

   But the RAG indexer `backfillKnowledgeFromDisk()` ([knowledge.js:983-989](../../../electron/lib/knowledge.js)) **only scans `knowledge/<category>/files/{public,noi-bo,ceo-only}/`**. None of the training targets are under that tree, so they are **never inserted/embedded into the `documents` DB**. `searchKnowledge()` (RAG `/search` on port 20129) returns **zero** trained chunks. `/api/ceo-rules/write` also triggers no index/embed after writing — it just appends and replies "✅ đã lưu". And the file-access-policy ([inbound.ts:1264](../../../electron/packages/modoro-zalo/src/inbound.ts)) forbids the bot from reading `knowledge/`, `.learnings/`, `memory/` for customer turns, so there is no fallback. Trained content is written but unreachable.

2. **Wrong delivery mechanism for always-on rules.** Even if indexed, RAG retrieves by per-message semantic similarity (k=3). Always-on behaviour rules ("don't oversell", "no emoji", "be concise") rarely match a product question semantically, so they would still not surface reliably. Behaviour rules belong in the **always-injected bootstrap**, not RAG.

Confirmed non-cause: `agents.defaults.contextInjection = 'always'` ([config.js:885-887](../../../electron/lib/config.js)) — AGENTS.md **is** re-injected every turn, so "the bot forgets AGENTS.md" is NOT the problem.

## 2. Goals / Non-goals

**Goals**
- Make all four training types take effect **both when trained and when responding**:
  1. Behaviour rules / tone / do-don't (always-on)
  2. Reply scripts / templates (situational)
  3. Factual knowledge (products / prices / FAQ)
  4. Specific corrections / lessons (learnings)
- Retroactively activate training that already exists on users' disks (migration).
- Be honest when a rule **cannot** take effect (instead of silently saving it).

**Non-goals**
- Not removing the existing security guards (COMMAND-BLOCK, output filters, scope rules). They stay; the design works *with* them and surfaces their limits.
- Not changing per-customer memory (`memory/zalo-users/`) delivery — handled by the existing memory system; out of scope except where it overlaps.
- Not redesigning Dashboard knowledge upload (already indexed into `knowledge/<cat>/files/`).

## 3. Architecture — Two lanes + three responding guarantees

Match each training type to the delivery mechanism that fits it.

### Lane 1 — Always-on rules (inject every turn)
Sources: `.learnings/LEARNINGS.md` + `.learnings/ERRORS.md` + `knowledge/sales-playbook.md`.

- New function `injectTrainedRulesIntoAgentsMd()` aggregates these into a single marked block in the workspace `AGENTS.md`:
  ```
  <!-- CEO-RULES-START -->
  ## Quy tắc CEO đã huấn luyện (ưu tiên cao — áp dụng khi mâu thuẫn với mặc định, trong giới hạn an toàn)
  ... newest-first, deduped, capped ...
  <!-- CEO-RULES-END -->
  ```
- Runs **after the template refresh**, next to `ceo-memory.injectMemoryIntoAgentsMd()` ([workspace.js:741-742](../../../electron/lib/workspace.js)) so a version-bump re-seed of AGENTS.md does not wipe it.
- Because `contextInjection='always'`, this block reaches the agent on **every** Zalo turn.
- **Budget cap:** block ≤ ~6–8K chars; keep newest entries first; dedupe; trim oldest. Prevents blowing the AGENTS.md bootstrap budget (`AGENTS_MD_BOOTSTRAP_MAX_CHARS = 40000`).

### Lane 2 — Factual / scripts (RAG, fixed indexing)
- Extend `backfillKnowledgeFromDisk()` + the knowledge watcher to also scan/index/embed `knowledge/scripts/*.md` (and any `knowledge/*.md` at root). Dashboard uploads under `knowledge/<cat>/files/` keep working unchanged.
- `/api/ceo-rules/write`, when it writes a script/factual file, triggers an immediate index+embed of that file (no wait for the next boot backfill).

### Responding guarantees (close the loop — context ≠ applied)

These three are the difference between "trained" and "actually behaves differently":

**R1 — Precedence.** The `CEO-RULES` block header explicitly states it is **authoritative over default behaviour when they conflict, within safety/scope limits**, and "prefer the most recent CEO rule". Resolves the silent conflict between trained rules and baked-in AGENTS.md rules.

**R2 — Honest trainability boundary.** `/api/ceo-rules/write` classifies the rule and detects when it targets something the code layer will **hard-block** (scope expansion the COMMAND-BLOCK / out-of-scope filter rejects, or an output that the output filter strips). In that case it returns a **warning to the CEO** ("rule này sẽ KHÔNG có tác dụng vì bị chặn ở tầng code/scope — …") instead of a misleading "✅ đã lưu". This directly removes the "I trained it and nothing happened" silence.

**R3 — Output-filter reconciliation.** Document (and, where feasible, detect) which trained behaviours are stripped by the Zalo output filters (`channels.js` Layer K, `_stripZaloProcessText`, `send.ts` Layer K). At minimum, R2 warns when a trained reply pattern matches a strip rule, so the CEO is not surprised.

## 4. Components (purpose / interface / dependencies)

| Component | Purpose | Interface | Depends on |
|---|---|---|---|
| `injectTrainedRulesIntoAgentsMd()` (new, ceo-memory.js or workspace helper) | Build the `CEO-RULES` block in AGENTS.md | `() -> void`, idempotent (marker-bounded replace) | reads `.learnings/*.md`, `knowledge/sales-playbook.md`; budget cap util |
| Indexer/watcher extension (knowledge.js) | Index+embed `knowledge/scripts/` + `knowledge/*.md` root | extend `backfillKnowledgeFromDisk()` + watcher dir list | embedder, documents DB |
| `/api/ceo-rules/write` enhancement (cron-api.js) | (a) trigger Lane-1 re-inject + Lane-2 index after write; (b) R2 trainability warning | same HTTP endpoint, richer JSON response (`{success, file, warning?}`) | classifier, injectTrainedRules, indexer |
| Precedence header (AGENTS.md template + injected block) | R1 conflict resolution | static text in the block header | — |
| Migration pass (boot) | Activate existing dead-letter training | runs in `seedWorkspace` boot path, idempotent | injectTrainedRules + indexer |

Each unit is independently testable: the injector with fixture `.learnings`/playbook files; the indexer against a temp knowledge tree; the endpoint warning via classifier unit tests.

## 5. Data flow

```
TRAIN:  CEO (Telegram) -> /api/ceo-rules/write
           -> classify -> append to file (existing)
           -> [NEW] if always-on file: injectTrainedRulesIntoAgentsMd()   (Lane 1)
           -> [NEW] if script/factual: index+embed the file               (Lane 2)
           -> [NEW] if rule is hard-blocked by code/scope: return WARNING  (R2)

RESPOND (Zalo turn):
   bootstrap (AGENTS.md incl. CEO-RULES block, always-injected) ── always present (Lane 1, R1)
   + RAG /search (k) over indexed knowledge/scripts/factual ── retrieved by relevance (Lane 2)
   -> agent composes reply
   -> output filters (unchanged) ── R3 documents/limits what survives
```

## 6. Error handling / fail-safe
- Injector: marker-bounded write-if-changed; on read/parse failure, leave AGENTS.md unchanged (never corrupt bootstrap). Cap enforced even if source files are huge.
- Indexer: per-file try/catch; a bad file is skipped + logged, never aborts the batch (mirrors current backfill).
- `/api/ceo-rules/write`: write still succeeds even if re-inject/index fails (non-fatal), but the response surfaces the partial state so the CEO is not misled.
- Migration: idempotent; safe to run every boot.

## 7. Migration (existing dead-letter content)
On boot (idempotent):
- Lane 1: `injectTrainedRulesIntoAgentsMd()` reads whatever LEARNINGS/ERRORS/sales-playbook already exist → injected immediately. No re-training needed.
- Lane 2: backfill existing `knowledge/scripts/*.md` (+ root `knowledge/*.md`) into the documents DB + embed.
- Net: everything the CEO trained before this fix becomes effective after the update, automatically.

## 8. Update / Delivery
- New logic lives in lib (`knowledge.js`, `cron-api.js`, `ceo-memory.js`/`workspace.js`) → requires a **new EXE build**.
- After shipping, the `CEO-RULES` block self-maintains: regenerated from the user's own trained files every boot + after each `/api/ceo-rules/write`. AGENTS.md template changes reach existing workspaces via the version-stamp re-seed (`CURRENT_AGENTS_MD_VERSION`).
- **NSIS caveat:** installing over an existing same-version install is skipped. If shipping to machines already on the current version, the app version MUST be bumped for the EXE to install (decide at ship time).

## 9. Testing
- Smoke/unit: (a) `injectTrainedRulesIntoAgentsMd()` writes a marker-bounded block containing LEARNINGS/playbook content and respects the char cap + dedupe + newest-first; (b) indexer now covers `knowledge/scripts/` (a script file becomes RAG-retrievable in an in-memory DB); (c) migration on boot ingests pre-existing files; (d) `/api/ceo-rules/write` triggers re-inject/index and returns a `warning` for a hard-blocked rule; (e) precedence header text present in the injected block.
- Manual verify: CEO trains "đừng chào mời, trả lời ngắn" → next Zalo customer turn the bot follows it; CEO trains an out-of-scope rule → gets the R2 warning instead of a silent success.

## 10. Open questions / risks
- **R3 depth:** full reconciliation of every output-filter pattern vs every trainable reply is large; the spec commits to *warning* (R2) + *documentation*, not auto-rewriting filters. Confirm that's acceptable scope.
- **Lane-1 budget vs many rules:** if a CEO trains hundreds of rules, the cap drops the oldest. Acceptable? (Alternative: summarise/compact older rules — larger effort, deferred.)
- **Mid-session freeze:** confirm openclaw re-injects AGENTS.md each turn under session-freeze/compaction so a refresh-after-write applies on the next turn of an active conversation.
