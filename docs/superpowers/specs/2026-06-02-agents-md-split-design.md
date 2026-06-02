# AGENTS.md Split & Domain Rules System — Design Spec

**Date:** 2026-06-02
**Status:** Draft

## Problem (recap from plan)

- **A:** AGENTS.md is 40K+ chars — hard to navigate, noisy git diffs, multiple contributors step on each other
- **D:** Every new feature requires manually updating AGENTS.md — people forget, rules get out of sync with code

---

## What the System Actually Does (Ground Truth)

### Bootstrap (OpenClaw)

OpenClaw's `bootstrap-files-*.js` reads a **fixed, closed set** of files every turn:

```
AGENTS.md, SOUL.md, USER.md, IDENTITY.md, COMPANY.md,
BOOTSTRAP.md, TOOLS.md, MEMORY.md, knowledge/*/index.md
```

There is **zero conditional logic** — no tag-matching, no context-keyword triggers. It reads the same files every turn. `contextInjection: "always"` means "re-read them every turn" vs "skip on repeat turns." All-or-nothing.

### Per-turn Conditional Injection

The **only** working per-turn conditional injection is `<active-user-skills>` built by `skill-manager.js`:

```javascript
// electron/lib/chat.js:118-123
function _injectActiveSkills(text) {
  const block = buildSkillInjectionBlock(text, { scope: 'operations/telegram-ceo' });
  if (!block) return text;
  return `<active-user-skills>\n${block}\n</active-user-skills>\n\n${text}`;
}
```

Trigger matching uses two strategies:

- **Token match**: any trigger word >= 4 chars must appear as a standalone token
- **Bigram match**: any 2-word phrase must appear consecutively

Skills are filtered by `appliesTo` scope. Skills with empty `appliesTo` are **standalone** and match everywhere.

### The Skill Matching Has Two Independent Implementations

**Critical finding:** There are two separate skill-matching code paths in the codebase:

1. `**skill-manager.js`** — `matchActiveSkills()` + `buildSkillInjectionBlock()`. Used by `chat.js` for CEO Telegram chat. Single source of truth.
2. `**inbound.ts`** (Zalo customer messages) — an **inline, duplicate implementation** of the same logic. Reads `user-skills/_registry.json` directly. Has its own stop word list, its own bigram tokenizer, and its own scope filter set. It does NOT call `skill-manager.js`.

This means:

- Shipped domain skills registered in `skill-manager.js` fire on **CEO Telegram chat**
- They do **NOT** fire on **Zalo customer messages** unless `inbound.ts` is updated

---

## Architecture: Shipped Domain Skills + Auto-Generated Routing

### Two-layer delivery model

```
Layer 1 — AGENTS.md (~12K chars, always present)
  Bootstrap-only. Contains universal rules only:
  - ĐỊNH NGHĨA (IM LẶNG, THAO TÁC IM)
  - CẤM TUYỆT ĐỐI (prohibitions)
  - Vệ sinh tin nhắn (message hygiene)
  - An toàn + Phân quyền kênh (permissions model)
  - Skill routing table (auto-generated from skill triggers)
  - Skill loading instructions (skills/INDEX.md, skill discovery)

Layer 2 — Domain shipped skills (~5-15K per topic, auto-injected)
  Shipped skills registered in skill registry.
  Matched by trigger keywords via <active-user-skills>.
  Fires on BOTH CEO Telegram chat AND Zalo customer inbound
  (via unified skill-manager.js call in both paths).
```

### Key architectural decision: unify skill matching

**Option A (chosen):** `inbound.ts` calls `skill-manager.js`'s `matchActiveSkills()` instead of its own inline implementation. Single source of truth for all trigger matching. Shipped skills registered in the registry fire on both CEO Telegram and Zalo inbound.

This requires:

1. Export `matchActiveSkills` and `buildSkillInjectionBlock` from `skill-manager.js` (already done)
2. `inbound.ts` replaces its inline matching block with a call to `buildSkillInjectionBlock`
3. Stop word lists, bigram tokenizers, and scope filter sets are kept in ONE place (`skill-manager.js`) — no duplication

**Why not Option B (write to user-skills registry):** Would create redundancy — same skills exist in two places. More fragile, harder to reason about.

---

## Shipped Domain Skills

### Skills to create


| Skill ID                    | Content source              | `appliesTo` | Key triggers                            |
| --------------------------- | --------------------------- | ----------- | --------------------------------------- |
| `shipped/auto-mode-rules`   | AGENTS.md AUTO-MODE section | `[]`        | `"[AUTO-MODE]"`, `"auto-mode"`          |
| `shipped/zalo-behavior`     | AGENTS.md Zalo section      | `[]`        | `"zalo"`, `"khách zalo"`, `"nhóm zalo"` |
| `shipped/telegram-behavior` | AGENTS.md Telegram section  | `[]`        | `"telegram"`, `"nhắn zalo"`             |
| `shipped/facebook-behavior` | AGENTS.md Facebook section  | `[]`        | `"facebook"`, `"fanpage"`, `"đăng fb"`  |
| `shipped/knowledge-routing` | AGENTS.md Knowledge section | `[]`        | `"knowledge"`, `"tra knowledge"`        |


All use `appliesTo: []` (standalone) — they match everywhere, triggered purely by keyword presence in the message.

### Skill registry integration

**File: `electron/lib/skill-manager.js`**

Add a `SHIPPED_DOMAIN_SKILLS` array and a `registerShippedSkills()` function. Called at boot. Shipped skills are always enabled, never editable or deletable from the Dashboard.

```javascript
const SHIPPED_DOMAIN_SKILLS = [
  {
    id: 'shipped/auto-mode-rules',
    name: 'Quy tắc AUTO-MODE',
    type: 'rule',
    appliesTo: [],
    trigger: 'khi prompt có tag [AUTO-MODE]',
    summary: 'Quy tắc khi chạy cron/workflow tự động: không confirm, reply discipline, disambiguation.',
    enabled: true,
    shipped: true,
  },
  // ...
];

function registerShippedSkills() {
  const registry = readRegistry();
  for (const skill of SHIPPED_DOMAIN_SKILLS) {
    const exists = registry.skills.some(s => s.id === skill.id);
    if (!exists) {
      registry.skills.push(skill);
    } else {
      const idx = registry.skills.findIndex(s => s.id === skill.id);
      registry.skills[idx] = { ...registry.skills[idx], ...skill }; // update in-place
    }
  }
  writeRegistry(registry);
}
```

Skill content (the actual rules text) lives in `skills/shipped/{id}.md`. Read by `getSkillContent()` the same way user skill content is read.

### Skill content structure

Each shipped skill file starts with YAML frontmatter for the registry:

```markdown
---
id: shipped/zalo-behavior
name: Quy tắc hành vi Zalo
trigger: khi nhắn về kênh Zalo
appliesTo: []
---
<!-- trigger: "zalo", "khách zalo", "nhóm zalo" -->
<!-- trigger-base: "zalo" -->
```

Two trigger comment types:

- `<!-- trigger: ... -->` — high-specificity phrases that definitively indicate the topic
- `<!-- trigger-base: "zalo" -->` — single keywords that catch any message mentioning the channel. These are used for the routing table generation and ensure the skill fires even when the CEO never uses the exact phrase.

### What stays in AGENTS.md (universal only)

```
ĐỊNH NGHĨA — IM LẶNG, THAO TÁC IM
CẤM TUYỆT ĐỐI — absolute prohibitions (always-on)
Vệ sinh tin nhắn — message hygiene (always-on)
An toàn + Phân quyền kênh — permissions model (always-on)
Routing table — AUTO-GENERATED from skill triggers
Skill loading instructions — reference to skills/INDEX.md
```

### What moves to shipped skills

```
AUTO-MODE section       → skills/shipped/auto-mode-rules.md
Zalo section            → skills/shipped/zalo-behavior.md
Telegram section        → skills/shipped/telegram-behavior.md
Facebook section        → skills/shipped/facebook-behavior.md
Knowledge section       → skills/shipped/knowledge-routing.md
```

---

## Auto-Generated Routing Table

**Problem:** The capability router table in AGENTS.md is hardcoded. When someone adds a skill, they must manually add an entry.

**Solution:** `electron/scripts/generate-rules-routing.js` scans `skills/`, extracts `<!-- trigger: ... -->` comments, and generates the routing table. Run as part of workspace seed and smoke test.

```javascript
// electron/scripts/generate-rules-routing.js
// Reads all skills/**/*.md and skills/**/SKILL.md
// Extracts <!-- trigger: "..." --> comments
// Returns [{ file, triggers }] for each skill
// Smoke test: warns if a skill has no trigger and is not referenced elsewhere
// Smoke test: warns if a skill in the routing table has no trigger comment
module.exports = { scanSkills, extractTriggers };
```

**Rules for skill authors:**

- Add `<!-- trigger: "high-specificity phrase", "another phrase" -->` to the skill file
- For routing table coverage, also add `<!-- trigger-base: "keyword" -->` for single-word triggers
- No AGENTS.md edit needed — routing table auto-regenerates

---

## Technical Decisions

### 1. Injection block cap — raise to 20KB

`buildSkillInjectionBlock()` caps total injected skill content at 5KB. Shipped domain rules are 5-15KB each, and multiple rules can fire on a single message (Zalo + Knowledge + AUTO-MODE). Silent truncation at 5KB risks dropping critical rules without any signal.

**Decision:** Raise the cap to **20KB** specifically for shipped rule skills (`type: 'rule'`). The cap is a safeguard against runaway injection, not a hard budget constraint — 20KB is well within model context limits.

Implementation: pass a `hint: 'shipped-rule'` option to `buildSkillInjectionBlock()` that raises the per-block limit.

### 2. Per-skill content limit — raise to 20KB

`SKILL_CONTENT_MAX` is 10KB. AGENTS.md sections being extracted (Zalo behavior, Telegram, Facebook, etc.) are each likely larger than 10KB. The API would reject them with 413.

**Decision:** Raise `SKILL_CONTENT_MAX` to **20KB** for shipped rule skills. User-created skills retain the 10KB limit to encourage concise writing.

Implementation: `createUserSkill` / `updateUserSkill` enforces 10KB. `registerShippedSkills` writes content without this check (shipped skill files are template-controlled, not CEO-authored).

### 3. Conflict detection includes shipped skills

`checkConflict()` only compares user skills against each other. Shipped skills are invisible to it.

**Decision:** Extend `checkConflict()` to flag when a new or updated user skill significantly overlaps with a shipped skill (same `appliesTo` scope, overlapping content keywords, overlapping trigger phrases). Show a warning in the API response but do not block creation.

Implementation: Add shipped skills to the conflict scan in `checkConflict()`. Result includes `{ warning: 'overlaps_with_shipped', shippedSkill: 'shipped/zalo-behavior' }` alongside the existing user-skill conflict array.

### 4. Dashboard read-only treatment for shipped skills

Shipped skills registered in `_registry.json` appear in the Dashboard skill list UI. The `shipped: true` flag exists but the UI does not yet distinguish them.

**Decision:** Dashboard renders shipped skills with:

- A "hệ thống" badge (distinct from user skill badges)
- Edit button hidden or disabled (content is template-controlled)
- Delete button hidden or disabled
- Toggle (enable/disable) remains functional — allows disabling a shipped rule if needed

Implementation: Dashboard reads `shipped` field from registry entries. Conditionally renders action buttons.

### 5. `registerShippedSkills()` called at boot

**Decision:** Call `registerShippedSkills()` at the end of `seedWorkspace()` in `workspace.js`, alongside the existing `persistAppliesToMigrationIfNeeded()` call.

```javascript
// workspace.js — end of seedWorkspace()
try { require('./skill-manager').persistAppliesToMigrationIfNeeded(); } catch (e) { ... }
try { require('./skill-manager').registerShippedSkills(); } catch (e) { ... }
```

### 6. `skills/shipped/` in workspace template

**Decision:** Add `skills/shipped/` directory to the workspace template. Shipped skill files (`auto-mode-rules.md`, `zalo-behavior.md`, etc.) are part of the install, not generated at runtime. Template seeding creates the directory and files alongside other `skills/` subdirs.

Update the cleanup whitelist in `workspace.js` orphan cleanup to include `'shipped'`.

### 7. `appliesTo: []` confirmed correct

`appliesTo: []` means standalone — the skill fires on every scope. For CEO Telegram chat (`scope: 'operations/telegram-ceo'`) and Zalo inbound (`scope: 'operations/zalo'`), standalone skills match both. Channel rules fire whenever the CEO mentions the channel keyword, which is the intended behavior.

**Decision:** Domain rules use `appliesTo: []`. No scope restriction needed.

---

## Migration Strategy

**Phase 1:** Create shipped skills + registry integration + routing generator. Content stays in both places (AGENTS.md + skill files). Zero behavioral change.

**Phase 2:** Remove duplicate content from AGENTS.md, one section at a time. Test after each removal. Triggers verified via smoke test.

**Phase 3:** AGENTS.md reaches target ~12K. Routing table auto-generated. Adding a feature = write skill file + add trigger comment.

---

## Rules for Adding New Things Later

### Adding a new shipped domain skill

1. Write `skills/shipped/{name}.md` with actual rules content
2. Add YAML frontmatter (`id`, `name`, `trigger`, `appliesTo: []`)
3. Add `<!-- trigger: "phrase1", "phrase2" -->` and `<!-- trigger-base: "keyword" -->` comments
4. Add entry to `SHIPPED_DOMAIN_SKILLS` in `skill-manager.js`
5. Run routing generator — table auto-updates
6. No AGENTS.md edit

### Adding a new procedural skill

1. Write `skills/{category}/{name}.md` or `skills/{category}/{name}/SKILL.md`
2. Add `<!-- trigger: "action phrase" -->` comment
3. If it needs an AGENTS.md routing entry, the auto-generator picks it up
4. If it needs a "Đọc skills/..." instruction in AGENTS.md, add that one line manually (procedural skills are read on-demand, not auto-injected)

### Adding a new routing entry for existing skill

1. Add `<!-- trigger: "new phrase" -->` to the skill file
2. Run routing generator (or it runs in smoke test)
3. Done. No AGENTS.md edit.

### What is forbidden (enforced by convention + smoke test)

- Adding verbose behavioral rules directly to AGENTS.md without also creating a shipped skill
- Editing the routing table manually in AGENTS.md (it's auto-generated)
- Registering shipped skills anywhere except `SHIPPED_DOMAIN_SKILLS` in `skill-manager.js`

---

## CEO User Skills — Unaffected

The `user-skills/` system is completely separate from shipped skills:

- `user-skills/_registry.json` + `user-skills/{id}.md` — CEO-created skills
- `skill-manager.js` registry + `skills/shipped/` — shipped domain rules

The `validateNoCollision()` function prevents a CEO from creating a user skill with the same ID as a shipped skill. Both can fire on the same message — they complement each other (shipped = WHAT, user = HOW, per the existing design).

Existing CEO user skills work unchanged.

---

## Behavioral Parity Analysis

**Q: Does injecting domain rules via `<active-user-skills>` vs bootstrap behave differently?**
A: Marginal risk. `<active-user-skills>` is prepended to the user's message, not inserted as system context. The LLM may give slightly less weight to user-message rules vs bootstrap. Mitigation: universal rules (prohibitions, hygiene, permissions) stay in AGENTS.md bootstrap where weight is highest. Domain rules in user message are guidance.

**Q: What if trigger matching misses and no skill fires?**
A: In Phase 1, the agent falls back to AGENTS.md (content still there). In Phase 2+, this would be a regression. Mitigation: `trigger-base` keywords (single words like "zalo", "telegram") ensure skills fire on any message mentioning the channel. `<!-- trigger-base -->` is checked first — if the base keyword matches, the skill always fires regardless of other trigger phrases.

**Q: Does this affect CEO's existing user skills?**
A: No. User skills and shipped skills are completely separate systems. They both use `<active-user-skills>` injection, so if both match the same message, the agent receives both. This is by design.

**Q: What about Zalo customer inbound vs CEO Telegram?**
A: After Option A unification, shipped skills fire on BOTH channels. The single `skill-manager.js` implementation is called from both `chat.js` (CEO Telegram) and `inbound.ts` (Zalo inbound). Same trigger matching, same shipped skills, same content.

---

## Files Changed


| File                                           | Change                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron/scripts/generate-rules-routing.js`   | **(new)** scan skills for triggers, return routing data                                                                                                  |
| `electron/lib/skill-manager.js`                | Add `SHIPPED_DOMAIN_SKILLS` + `registerShippedSkills()`; raise injection cap to 20KB for rule skills; extend `checkConflict()` to include shipped skills |
| `electron/lib/cron-api.js`                     | Merge shipped skills into conflict scan results; surface `overlaps_with_shipped` warning                                                                 |
| `electron/lib/workspace.js`                    | Add `skills/shipped/` to template + cleanup whitelist; call `registerShippedSkills()` at boot                                                            |
| `electron/packages/modoro-zalo/src/inbound.ts` | Replace inline skill matching with call to `buildSkillInjectionBlock()` from `skill-manager.js`                                                          |
| `frontend/` (Dashboard skill list)             | Render `shipped: true` entries as read-only with "hệ thống" badge; hide edit/delete, keep toggle                                                         |
| `skills/shipped/auto-mode-rules.md`            | **(new)** extracted from AGENTS.md AUTO-MODE section                                                                                                     |
| `skills/shipped/zalo-behavior.md`              | **(new)** extracted from AGENTS.md Zalo section                                                                                                          |
| `skills/shipped/telegram-behavior.md`          | **(new)** extracted from AGENTS.md Telegram section                                                                                                      |
| `skills/shipped/facebook-behavior.md`          | **(new)** extracted from AGENTS.md Facebook section                                                                                                      |
| `skills/shipped/knowledge-routing.md`          | **(new)** extracted from AGENTS.md Knowledge section                                                                                                     |
| `electron/scripts/smoke-skill-runtime.js`      | Add trigger extraction check; warn if skill has no trigger                                                                                               |
| `electron/scripts/check-context-budget.js`     | Add shipped skills to budget accounting                                                                                                                  |
| `AGENTS.md`                                    | Slim down to universal rules + auto-generated routing; bump version                                                                                      |


---

## Verification

1. `npm run smoke` passes — all existing tests green
2. Smoke test: every shipped skill has at least one trigger comment
3. Smoke test: routing table generation produces same table as current hardcoded version (regression check)
4. Smoke test: `inbound.ts` produces same `<active-user-skills>` output as `chat.js` for same input message (equivalence check)
5. AGENTS.md size: ~12K after Phase 1 content removal (from ~40K)
6. Phase 1: zero behavioral change (all content still present in AGENTS.md, ship skills parallel)
7. Trigger matching fires on both CEO Telegram chat and Zalo customer inbound (Option A unification verified)

---

## What this does NOT solve

- CEO-MEMORY.md context injection (~5-15K per turn) — separate problem
- Skill file quality — wrong/outdated info still needs manual update
- `inbound.ts` stop word list drift vs `skill-manager.js` — resolved by Option A (single implementation), but must be verified after migration

