# Karpathy Doctrine + Council Harness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Karpathy's code-style + workflow rules, a single-model subagent diff-review skill, and an agent-native `llms.txt` to this user's Claude Code setup.

**Architecture:** Three net-new files plus one edit. Global rules live in `~/.claude/karpathy-doctrine.md` (imported by `CLAUDE.md`). A `/karpathy-council` skill fans out 4 lensed Claude subagents over the current diff and synthesizes a Blocking/Consider/Fine verdict. The `claw` repo gets an `llms.txt` summary at root.

**Tech Stack:** Markdown rule/skill files, Claude Code Skill system, `git diff`, Agent (subagent) fan-out. No new dependencies, hooks, or settings.json changes.

**Spec:** `docs/superpowers/specs/2026-06-02-karpathy-doctrine-harness-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `~/.claude/karpathy-doctrine.md` (create) | The 13 Karpathy-specific rules (code-style + workflow). |
| `~/.claude/CLAUDE.md` (modify) | Import the doctrine + register the `/karpathy-council` skill. |
| `~/.claude/skills/karpathy-council/SKILL.md` (create) | The 3-stage single-model council diff review. |
| `d:/claw/llms.txt` (create) | Agent-native repo summary at claw root. |

**Verification commands:** written in Unix syntax — run them via the **Bash tool** (available on this machine). PowerShell fallbacks: `wc -l` → `(Get-Content f | Measure-Object -Line).Lines`; `grep -n X f` → `Select-String X f`; `head -N f` → `Get-Content f -TotalCount N`.

**Commit policy:** `~/.claude/` is global config (not the claw repo). `llms.txt` and the spec/plan live in the claw repo, currently on `main` with a large pre-existing uncommitted diff. Per the user's standing rule, **do NOT commit anything without an explicit go-ahead.** Commit steps below are marked `(DEFERRED)`.

---

## Chunk 1: Doctrine, wiring, council, llms.txt

### Task 1: Create the doctrine file

**Files:**
- Create: `~/.claude/karpathy-doctrine.md`

- [ ] **Step 1: Write the file**

```markdown
# Karpathy Doctrine

Adds Karpathy-specific practice on top of the 12 rules already in CLAUDE.md.
Does NOT restate them — cross-references instead.
Sources: nanochat / nanoGPT / micrograd / llm.c; "Software Is Changing (Again)"
(YC AI Startup School, Jun 2025); llm-council; the vibe-coding retrospective.

## Code style
1. **One concern per file.** It should read top-to-bottom as a narrative. A file
   growing large is a signal it does too much — split it. (extends Rule 2)
2. **No config objects, factories, or type-dispatch if/else chains.** Use
   top-of-file constants with param/CLI override instead.
3. **Comments explain WHY, never WHAT.** Sole exception: shape / contract / unit /
   invariant annotations.
4. **Minimal dependencies.** Adding one requires a one-line justification of why
   the stdlib or an existing option won't do.
5. **State anti-features.** Each README / module header names what was
   deliberately left out and why.
6. **Fight AI bloat.** No speculative abstraction, no copy-paste blocks, prefer
   deleting over adding. (Karpathy: agents "bloat abstractions… it's a mess.")
7. **Naming:** idiomatic short abbreviations; leading underscore for private.

## Workflow
8. **Small, reviewable diffs.** ~200-line soft ceiling. Bigger → split and verify
   each chunk before building on the next. Never accept a giant diff unread.
9. **Autonomy slider.** Match autonomy granted to task risk: trivial = run;
   risky = chunk + human gate.
10. **Verifiable success criteria before coding.** Precise spec → fast verify;
    vague spec → verify fails → wasted cycle. (extends Rule 4)
11. **Generation-verification loop, made fast.** Verify every chunk; invest in
    making verification quick.
12. **Vibe-coding only on throwaway / spike branches.** Never main / production.
13. **Context = architecture.** Curate the context window deliberately; don't
    dump. CLAUDE.md is architecture, not a note.

> Before merging non-trivial work, run `/karpathy-council`.
```

- [ ] **Step 2: Verify the file exists and is ~1 page**

Run: `wc -l ~/.claude/karpathy-doctrine.md`
Expected: ~40 lines, file present.

---

### Task 2: Wire doctrine + council into global CLAUDE.md

**Files:**
- Modify: `~/.claude/CLAUDE.md` (the `@RTK.md` import region, near top)

- [ ] **Step 1: Add the import + skill registration**

Locate the existing line `@RTK.md` (near the top, after the graphify block).
Insert this block immediately ABOVE `@RTK.md`:

```markdown
# karpathy-council
- **karpathy-council** (`~/.claude/skills/karpathy-council/SKILL.md`) - single-model subagent diff review. Trigger: `/karpathy-council`
When the user types `/karpathy-council`, invoke the Skill tool with `skill: "karpathy-council"` before doing anything else.

@karpathy-doctrine.md
```

(Use the Edit tool. `old_string` = `@RTK.md`, `new_string` = the block above followed by `@RTK.md`.)

- [ ] **Step 2: Verify both imports are present**

Run: `grep -nE "karpathy-doctrine|karpathy-council" ~/.claude/CLAUDE.md`
Expected: at least the `@karpathy-doctrine.md` import line and the registration block.

---

### Task 3: Create the /karpathy-council skill

**Files:**
- Create: `~/.claude/skills/karpathy-council/SKILL.md`

- [ ] **Step 1: Write the skill file**

```markdown
---
name: karpathy-council
description: Single-model multi-subagent diff review (Karpathy llm-council pattern). 4 lensed Claude reviewers over the current diff, then a chairman verdict (Blocking/Consider/Fine). Trigger /karpathy-council. Optional --fix applies blocking items.
trigger: /karpathy-council
---

# Karpathy Council — diff review

A mono-model port of Karpathy's llm-council: diversity comes from distinct
review lenses, not multiple vendors. Run before merging non-trivial work.

## Args
- (none): review branch-vs-base, else staged, else working tree.
- `--fix`: after the verdict, apply ONLY the Blocking items, then report changes.
- `<git range>`: explicit range, e.g. `main..HEAD`.

## Stage 1 — capture the diff
Try in order; first non-empty wins:
1. `base=$(git merge-base HEAD @{u} 2>/dev/null || git merge-base HEAD main 2>/dev/null); git diff "$base"...HEAD`
2. `git diff --staged`
3. `git diff`
If all three are empty → print "Nothing to review." and stop.

## Stage 2 — fan out 4 reviewers (parallel, model: sonnet)
Dispatch 4 subagents in ONE message. Each gets the full diff plus its lens, and
returns findings as a list of `{file:line, severity (blocking|consider|fine), why}`
plus a one-line overall take.

- **Lens A — Correctness / bugs:** logic errors, edge cases, broken contracts, races.
- **Lens B — Karpathy-style:** config objects, over-abstraction, a file doing too
  much, missing WHY-comments, missing anti-features note, AI bloat / copy-paste.
- **Lens C — Security / gullibility:** injection surfaces, externally-sourced text
  trusted, LLM-instruction blocks where CODE-level blocks are required (esp. claw
  `inbound.ts` / channel command isolation).
- **Lens D — Reuse / dead-code / diff-size:** duplication, orphaned code, an
  oversized diff that should be split.

## Stage 3 — chairman synthesis (you, the main agent)
Pool all findings. Dedup overlaps. Drop low-confidence / self-refuted items.
Produce, Karpathy-terse, no padding:

- **Blocking** — must fix before merge (`file:line` + one-line why)
- **Consider** — optional improvements
- **Fine** — explicitly noted as acceptable

If `--fix`: apply Blocking only. If two fixes touch the same file/region, apply
sequentially and re-verify; surface conflicts rather than silently overwriting.
```

- [ ] **Step 2: Verify the skill is registered**

Run: `cat ~/.claude/skills/karpathy-council/SKILL.md | head -5`
Expected: frontmatter with `name: karpathy-council` and `trigger: /karpathy-council`.

- [ ] **Step 3: Smoke-test the skill on a real diff**

In a session: type `/karpathy-council` while the claw working tree has changes.
Expected: 4 reviewer subagents dispatch, then a Blocking/Consider/Fine verdict
with `file:line` refs. (If the working tree is clean, expect "Nothing to review.")

---

### Task 4: Create claw llms.txt

**Files:**
- Create: `d:/claw/llms.txt`

- [ ] **Step 1: Verify the localhost ports/paths against current source**

Run (confirm before writing examples — ports may have drifted):
```
grep -rnE "20200|20128|18789" electron/lib electron/main.js 2>/dev/null | head
```
Expected: cron API on 20200, 9router on 20128, gateway on 18789. Adjust the
draft below if any differ.

- [ ] **Step 2: Write llms.txt**

```markdown
# 9BizClaw / MODOROClaw — llms.txt

Electron desktop AI assistant for Vietnamese SME CEOs. Auto-replies on Telegram
and Zalo through an openclaw gateway. Pure runtime-install model: Node + npm
packages download on first run into userData/vendor/.

## Run / build
- `RUN.bat`  — start the app (dev)
- `RESET.bat` — simulate a fresh install
- `cd electron && npm run build:win` — build the Windows EXE

## Key modules
Full machine-readable map: `docs/generated/system-map.txt`.
- `electron/main.js` — app boot, gateway spawn, runtime patches (large; the patch
  catalog is documented in CLAUDE.md).
- `electron/lib/` — channels, cron, config, fb-publisher, media-library, …
- `electron/packages/modoro-zalo/` — Zalo plugin fork (`inbound.ts`, `send.ts`).

## Localhost services (agents: use curl, not the GUI)
- Cron API — http://127.0.0.1:20200 (token in `cron-api-token.txt`, rotates each boot)
  `curl http://127.0.0.1:20200/api/cron/list`
- 9router — http://127.0.0.1:20128
  `curl -X POST http://127.0.0.1:20128/api/auth/login -H "Content-Type: application/json" -d '{"password":"123456"}'`
- Gateway (openclaw) — http://127.0.0.1:18789
  `curl http://127.0.0.1:18789/v1/models`

## Anti-features (deliberately not done)
- No bundled vendor shipped — pure runtime install.
- No second Telegram getUpdates poller — the gateway is the only poller (two = 409
  Conflict = lost messages).
- No PowerShell writes to `openclaw.json` — Node `writeOpenClawConfigIfChanged`
  only (PowerShell -Encoding utf8 adds a BOM + mojibake).

## Gotchas
See CLAUDE.md: gateway "restart loop", config write race, better-sqlite3 ABI
mismatch, NSIS same-version trap, boot cold-start latency.

## For agents
- Dev rules for working on THIS repo live in `CLAUDE.md` (root + `electron/`).
- `AGENTS.md` is the BOT's runtime persona (the Telegram/Zalo assistant), NOT
  dev-agent guidance. Do not follow it when writing code.
```

- [ ] **Step 3: Verify the file exists**

Run: `head -3 d:/claw/llms.txt`
Expected: the title line and the one-sentence description.

---

### Task 5: Commit (DEFERRED — only on explicit user go-ahead)

The global `~/.claude/` files are not in the claw repo (commit them separately
only if that directory is version-controlled and the user asks).

For the claw repo (`llms.txt` + spec + plan), **wait for explicit approval**, then:

```bash
git add llms.txt docs/superpowers/specs/2026-06-02-karpathy-doctrine-harness-design.md docs/superpowers/plans/2026-06-02-karpathy-doctrine-harness.md
git commit -m "docs: add Karpathy doctrine harness (llms.txt, spec, plan)"
```

(Do not run until the user says to commit. Confirm `git branch --show-current` first.)

---

## Verification summary (success criteria from spec)

1. `~/.claude/karpathy-doctrine.md` exists, imported by CLAUDE.md, ~1 page, no rule that merely restates a 12-rule entry.
2. `/karpathy-council` runs on a sample diff → 4 lensed reviewers → Blocking/Consider/Fine verdict with `file:line`. `--fix` applies only Blocking.
3. `d:/claw/llms.txt` exists with all seven sections; every localhost service has a verified `curl` example; the AGENTS.md-vs-CLAUDE.md distinction is stated.
4. No new dependencies, hooks, or settings.json changes.
5. Nothing committed/built without explicit user request.
