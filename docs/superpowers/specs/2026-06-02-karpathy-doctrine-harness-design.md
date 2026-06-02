# Karpathy Doctrine + Council Harness — Design

**Date:** 2026-06-02
**Status:** Approved (design), pending implementation plan
**Author:** Peter Bui (with Claude Code)

## Goal

Adopt Andrej Karpathy's software-development practices — his code-style rules,
his generation-verification workflow, and his llm-council review pattern — into
this user's Claude Code setup (global `~/.claude`) and the `claw`/9BizClaw repo,
to improve development output.

The build is deliberately **lean**: copying Karpathy faithfully means honoring
his core principle (minimalism, fight abstraction, reject bloat). A sprawling
multi-artifact harness would betray the thing being copied.

## Scope

Three net-new artifacts. No hooks, no new dependencies, no `settings.json`
changes, no changes to existing skills.

1. `~/.claude/karpathy-doctrine.md` — global rules file (code-style + workflow).
2. `~/.claude/skills/karpathy-council/SKILL.md` — single-model, subagent-fanout
   diff-review skill (`/karpathy-council`).
3. `d:/claw/llms.txt` — agent-native repo summary at the claw repo root.

### Explicitly out of scope (YAGNI)

- Multi-model / external-API council (user chose single Claude model via subagents).
- Diff-size enforcement hook in `settings.json`.
- `/karpathy-mode` and `/vibe-guard` skills.
- A new dev-facing `AGENTS.md` (claw's `AGENTS.md` is the bot persona; dev rules
  stay in `CLAUDE.md`). `llms.txt` documents this distinction instead.
- Curl-docs / `/status` endpoint retrofit beyond what `llms.txt` references.

## Sources (verified during research)

- nanochat README + discussion #1 (no config objects / factories / if-then-else
  monsters; "readable, commented, clean and accessible").
- micrograd / nanoGPT / llm.c / microgpt (one-concern files, WHY+shape comments,
  minimal deps, README states anti-features).
- "Software Is Changing (Again)", YC AI Startup School, June 2025 (autonomy
  slider, keep AI on a leash, reject 10k-line diffs, small incremental chunks,
  generation-verification loop made fast, precise prompt → fast verification).
- Vibe-coding tweet (Feb 2025) + 1-year retrospective (Feb 2026): vibe coding =
  throwaway/prototype only; production = agentic engineering with oversight.
- llm-council repo (Nov 2025): 3-stage — fan to N models → blind-rank
  (anonymized, anti-sycophancy) → chairman synthesis.
- Context-engineering tweet (June 2025): context window is engineered, not a
  "prompt".
- LLM psychology: jagged intelligence, anterograde amnesia (state lives outside
  the model), gullibility (treat external text as untrusted; code-level blocks
  over LLM-instruction blocks).

## What the user already has (do not duplicate)

- Global 12-rule `CLAUDE.md` (Simplicity First, Surgical Changes, Think Before
  Coding, Goal-Driven) ≈ Karpathy's simplicity/surgical ethos.
- `docs/generated/system-map.txt` ≈ a context builder.
- `inbound.ts` COMMAND-BLOCK patch ≈ gullibility / code-level-block principle.
- superpowers `verification-before-completion`, `requesting-code-review` ≈ verify
  gate / review discipline.

The doctrine file therefore **only adds Karpathy-specific rules not already
covered** and cross-references the 12 rules rather than restating them
(per Rule 7 — surface conflicts, don't blend).

---

## Component 1 — `~/.claude/karpathy-doctrine.md`

**Location:** `~/.claude/karpathy-doctrine.md`
**Wiring:** imported from `~/.claude/CLAUDE.md` via `@karpathy-doctrine.md`
(same mechanism already used for `@RTK.md`).
**Length:** ~1 page. Concise; no restating of the 12 rules.

### Contents

**Code style (Karpathy-specific):**
1. One concern per file; readable top-to-bottom as a narrative. A file growing
   large is a signal it does too much.
2. No config objects, model factories, or type-dispatch if-else chains. Use
   top-of-file constants with CLI/param override.
3. Comments explain WHY, never WHAT. The single exception: shape/contract
   annotations (e.g. tensor/array shapes, units, invariants).
4. Minimal dependencies. When adding one, justify why the stdlib/existing option
   won't do.
5. README / module header states **anti-features** — what was deliberately left
   out and why.
6. Actively fight AI bloat: no speculative abstraction, no copy-paste blocks,
   prefer deleting over adding. (Karpathy: agents "bloat abstractions… it's a mess.")
7. Naming: standard short abbreviations where idiomatic; leading underscore for
   private/internal.

**Workflow:**
8. Keep diffs small and reviewable (~200-line soft ceiling). Bigger → split and
   verify each chunk before building on it.
9. Autonomy slider: match autonomy granted to task risk.
10. Define verifiable success criteria before coding (precise spec → fast
    verification; vague spec → verification fails → wasted cycle).
11. Generation-verification loop: human verifies every chunk; invest in making
    verification fast.
12. Vibe-coding only on throwaway/spike branches, never `main`/production.
13. Context = architecture: curate the context window deliberately; don't dump.

**Footer:** "Before merging non-trivial work, run `/karpathy-council`."

### Conflict handling
Where a doctrine rule overlaps a 12-rule entry, the doctrine cross-references it
("see CLAUDE.md Rule N") instead of restating. No blended/contradictory guidance.

---

## Component 2 — `/karpathy-council` skill

**Location:** `~/.claude/skills/karpathy-council/SKILL.md`
**Trigger:** user types `/karpathy-council` (typically before merge / on review
request). Optional arg `--fix` to apply the blocking set; optional arg to point
at a specific diff range (default: branch vs merge-base, else staged, else
working tree).

**Mechanism — mirrors llm-council's 3 stages, single Claude model:**

### Stage 1 — Generate (parallel fan-out)
- Capture the diff. Default selection order: branch-vs-base → staged → working tree.
  If all three are empty, emit a clear "nothing to review" message and exit (no
  silent no-op).
- Dispatch **4 parallel reviewer subagents**, each a distinct lens (diversity, not
  redundancy):
  - **(a) Correctness / bugs** — logic errors, edge cases, broken contracts.
  - **(b) Karpathy-style violations** — config objects, over-abstraction, a file
    doing too much, missing WHY-comments, missing anti-features note, AI bloat.
  - **(c) Security / gullibility** — injection surfaces, code-level vs
    LLM-instruction blocks (directly relevant to claw's `inbound.ts` patches and
    channel command isolation).
  - **(d) Reuse / dead-code / diff-size** — duplication, orphaned code,
    oversized diff that should be split.
- Each reviewer returns structured findings (`file:line`, severity, rationale)
  plus a brief overall assessment. Reviewers run on **Sonnet** by default (cheap,
  scoped); user-overridable to Opus.

### Stage 2 — Rank / consolidate
- Pool all findings; dedup overlapping items; drop low-confidence or
  self-refuted findings. (Mono-model, so blind cross-ranking adds little
  anti-sycophancy value; the value is lens diversity + chairman dedup.)

### Stage 3 — Chairman synthesis
- One chairman pass (inherits session model, default Opus) produces a prioritized
  verdict:
  - **Blocking** — must fix before merge.
  - **Consider** — optional improvements.
  - **Fine** — explicitly noted as acceptable.
- Output is concise and Karpathy-terse, with `file:line` references.
- If `--fix`: apply the **Blocking** set only, then report what changed. If two
  Blocking fixes touch the same file/region, apply sequentially and re-verify;
  surface any conflict rather than silently overwriting.

**Implementation note:** the fan-out uses the Agent tool (4 parallel reviewer
subagents) + a synthesis pass. The Workflow tool is an acceptable alternative if
the user later wants deterministic orchestration, but is not required for v1.

**Model intent:** all subagents are Claude ("1 model"). Reviewer tier (Sonnet)
vs chairman tier (Opus) is a cost optimization, not a multi-vendor council.

---

## Component 3 — `d:/claw/llms.txt`

**Location:** `d:/claw/llms.txt` (repo root).
**Length:** ~1 page, plain Markdown. No HTML, no nav chrome.

### Contents
- **One sentence:** what 9BizClaw / MODOROClaw is (Electron desktop AI assistant
  for Vietnamese SME CEOs; Telegram + Zalo channels; pure runtime-install model).
- **Key modules map:** short list, links `docs/generated/system-map.txt` as the
  full machine-readable map (reuse existing artifact).
- **Run / build:** `RUN.bat`, `RESET.bat`, `npm run build:win` (per CLAUDE.md).
- **Localhost services with `curl` examples:** cron API `:20200`
  (`/api/cron/list` etc.), 9router `:20128`, gateway `:18789`. Replaces
  GUI-only knowledge with agent-runnable calls. Implementer must verify each
  endpoint/port against current source before writing the example (ports/paths
  may have drifted).
- **Anti-features:** what the repo deliberately does not do (e.g. no bundled
  vendor shipped — pure runtime install; no second Telegram poller; no PowerShell
  writes to `openclaw.json`).
- **Gotchas pointer:** "see CLAUDE.md sections" (gateway restart race, config
  write race, better-sqlite3 ABI, NSIS same-version trap).
- **For-agents clarification:** `AGENTS.md` is the **bot's runtime persona**, not
  dev-agent guidance; dev rules for working on this repo live in `CLAUDE.md`.

---

## Success criteria

1. `~/.claude/karpathy-doctrine.md` exists, is imported by `CLAUDE.md`, fits ~1
   page, and adds no rule that merely restates an existing 12-rule entry.
2. `/karpathy-council` runs on a sample diff: dispatches 4 lensed reviewers,
   produces a Blocking/Consider/Fine verdict with `file:line` refs. `--fix`
   applies only Blocking items.
3. `d:/claw/llms.txt` exists at repo root with the seven sections above; every
   localhost service has a working `curl` example; the AGENTS.md-vs-CLAUDE.md
   distinction is stated.
4. No new dependencies, hooks, or `settings.json` changes introduced.
5. Nothing committed/built without explicit user request.

## Open questions / risks

- **Council token cost:** 4 reviewers + chairman per run. Mitigated by Sonnet
  reviewers. Acceptable for pre-merge use, not per-edit.
- **`@karpathy-doctrine.md` import:** confirm global `CLAUDE.md` import syntax
  resolves (it already uses `@RTK.md`, so the pattern is proven).
- **Skill discoverability:** `/karpathy-council` must appear in the user-invocable
  skills list; verify after creation.
