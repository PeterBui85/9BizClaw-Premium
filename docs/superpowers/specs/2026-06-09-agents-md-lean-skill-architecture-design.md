# AGENTS.md Lean + Agent-Decides Skill Loading — Design

- **Date:** 2026-06-09
- **Status:** Draft (v1 scope approved by CEO)
- **Owner:** Peter Bui / MODORO
- **Scope:** The bot's instruction architecture (`AGENTS.md` + skills), not app features.

## Problem

The seeded `AGENTS.md` is **445 lines / ~48 KB** (~12K tokens). It is loaded into the
agent's context on **every turn, for every customer, on every message** — even "mấy giờ
rồi". It mixes three things that have different growth rates:

1. **Policy/safety** (channel permissions, banned tools, prompt-injection defense) — nearly static.
2. **Capabilities** (per-feature procedures) — grows with every feature.
3. **Customer data** (persona, products, memory) — grows with every customer.

Because (2) is inlined, the always-on prompt grows **O(n) with features**: it is past the
40 KB ceiling memory note, wastes tokens at scale, and the more it grows the harder it is
for the model to pick the right behavior. Some procedure blocks are **duplicated** in
existing skill files (e.g. Document pipeline ↔ `skills/operations/document-creation.md`;
fanpage resolution ↔ `skills/marketing/facebook-post-workflow.md`).

## Goal

Make `AGENTS.md` lean and keep it lean as the skill catalog grows, **without regressing
routing reliability or safety**. The agent decides which skill to use (it understands
intent better than keyword matching); code keeps the hard safety boundary.

### Non-goals (v1 anti-features)

- **No semantic routing over the catalog yet** — defer to v2 (needed only once the catalog
  itself bloats, ~50+ skills).
- **No removal of the keyword-router table yet** — kept as a measured fallback in v1.
- **No decoupling of skill delivery from app version** — defer to v2.
- Not touching app features, channels, or the publish pipeline.

## Research summary (industry convergence)

The dominant pattern is **Anthropic Agent Skills — 3-level progressive disclosure**:

- **Level 1 (startup):** load only each skill's `name` + `description` (~50 tokens/skill).
  The `description` is the *selector* the model uses to decide relevance.
- **Level 2 (activation):** when the model judges a skill relevant, it reads the full
  `SKILL.md`.
- **Level 3+ (on-demand):** bundled files load only when needed.

Quantified `AGENTS.md` guidance (Augment Code study): **100–150 lines optimal**, max
**10–15 references**, "write skill descriptions as *selectors*, not *manuals*"; gains
**reverse past 150 lines**; stacking 30+ warnings reduces completeness ~20%.

Scaling caveat that fits us (>50 skills): the metadata/catalog layer itself becomes a
context problem → solved later by **semantic routing over the catalog** + **strict
activation thresholds** (load on explicit match, not adjacency). Anthropic's first
recommendation is **"start with evaluation."**

Sources:
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.augmentcode.com/blog/how-to-write-good-agents-dot-md-files
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

## Architecture

### The hard split

| Concern | Decided by | Lives in |
|---|---|---|
| Which skill/procedure to use | **The agent** (reads catalog → picks) | `skills/INDEX.md` catalog + `SKILL.md` files |
| Channel permissions, banned tools, anti-injection | **Code** (deterministic) | `inbound.ts` COMMAND-BLOCK, `tools.allow`, output filter |

Safety is never agent-decided. Capability selection always is.

### Three tiers applied to 9BizClaw

- **Tier 1 — Catalog (always-on):** `skills/INDEX.md` becomes the canonical catalog. Each
  skill: `name` + 1–2 line `dùng khi X, KHÔNG dùng khi Y`. AGENTS.md points to it and
  carries only the catalog entries the model needs to orient.
- **Tier 2 — Activation:** the agent reads the matched `SKILL.md` via an explicit load step
  (existing `read_file` / "Đọc skills/…" pattern, made first-class and consistent).
- **Tier 3 — On-demand:** skill-bundled files load as needed (already supported).

### AGENTS.md: keep vs move

**Keep (always-on core, target ≤ ~200 lines):**
identity, `CẤM TUYỆT ĐỐI`, channel permission matrix, prompt-injection defense, basic
routing, API-error handling, the catalog, and the keyword-router table **compressed** as a
fallback.

**Move out (already duplicated in skills) → leave a 1-line pointer:**
- Document creation pipeline (current lines 77–110) → `skills/operations/document-creation.md`
- Fanpage resolution (409–415) → `skills/marketing/facebook-post-workflow.md` (Bước 0)
- Zalo history detail (294–307) → a Zalo-history skill section
- Image/brand-asset detail (398–407) → split: image-generation detail →
  `skills/operations/image-generation.md`, but the Zalo `[[GUI_ANH]]` customer-facing
  marker rule (line 407) → `skills/operations/zalo.md` (it is Zalo behavior, not brand
  detail; mis-filing it under image-generation would break customer image sends).

For each moved block, **verify the destination skill already contains the detail** before
deletion; if a cross-cutting rule is unique to AGENTS.md (e.g. "create xlsx local then
`gog --convert`"), relocate it into the skill, do not drop it.

**Note on the keyword-router table:** despite its "AUTO-GENERATED" header, the live table
at `AGENTS.md:323-360` is in practice **hand-maintained** — its rows carry rich inline
action text (API calls for `fb_approve`, `cron_verbatim_confirm`, `zalo_product_image`,
etc.) that `generate-rules-routing.js` does not emit, and `<!-- trigger -->` comments exist
in only ~4 shipped files. v1 "compress as fallback" is unaffected, but v2 "remove the
keyword-router" must budget for migrating that hand-curated action text into skill
descriptions/bodies — it is not free regeneration.

## Eval harness (required, not optional)

A test set of `representative input → expected skill`. Runs in CI. This is what lets us
trust agent-decided routing as the catalog grows. Additionally, **log on real traffic when
the agent's chosen skill differs from the keyword-router's pick** — that agreement data is
the evidence used to decide when it is safe to remove the keyword-router in v2.

## Size-gate

A **net-new** CI check (same spirit as the existing `map:check`, but not yet plumbed —
to be added) that **fails the build if `AGENTS.md` exceeds the v1 budget (~22 KB)**.
Prevents silent re-bloat. Wiring location TBD (smoke step vs a dedicated script — see Open
questions).

## Deployment

Editing `AGENTS.md` requires bumping `CURRENT_AGENTS_MD_VERSION` (121 → 122) so the
workspace-refresh gate reaches existing installs (see
`project_skill_doc_deploy_needs_agents_version_bump`). Skills update through the existing
`skill-manager` path. Both Windows and macOS.

## Expected outcome

| | Lines | KB | Tokens/turn |
|---|---|---|---|
| Current | 445 | ~48 KB | ~12K |
| **v1 (this spec)** | ~180–200 | ~18–20 KB | ~5K |
| v2 (drop keyword-router, agent-only) | ~130–150 | ~13–15 KB | ~3.5K |

~60% less always-on context per turn in v1, multiplied across every message and customer.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Bot loses a procedure when a block is cut | Keep keyword-router fallback; verify skill contains the detail before deleting; eval set |
| Weak skill descriptions → misrouting on customer-facing tasks (FB post, file create) | Eval gate before ship; descriptions written as sharp selectors |
| Cutting a load-bearing safety rule | Safety blocks are explicitly out of scope for cutting |
| Re-bloat over time | Size-gate in CI |
| Deploy doesn't reach installs | Mandatory `CURRENT_AGENTS_MD_VERSION` bump in the same change |

## Success criteria

1. `AGENTS.md` ≤ ~20 KB and the bot's behavior is unchanged on the eval set (no routing regressions).
2. Size-gate active in CI.
3. Eval harness covers the high-traffic intents (Zalo CSKH, FB post/schedule, file creation, cron, Google).
4. Real-traffic logging of agent-vs-router agreement is in place (data for the v2 decision) —
   **best-effort for v1**: the inject-time (router) vs post-response (agent) correlation is
   non-trivial, so this may ship after the rest of v1 if the injection point is awkward.
5. Change deployed (version bumped) and verified on Windows + macOS.

## Rollout

- **v1 (this spec):** keep/move per above, build catalog, eval + size-gate, keyword-router as fallback.
- **v2 (later, gated on v1 eval data):** remove keyword-router (pure agent-decides), add semantic routing over the catalog when skill count warrants, decouple skill delivery from app version.

## Open questions

- Final v1 size budget for the gate: 20 KB vs 22 KB (start at 22 KB, tighten once stable).
- Where the eval harness runs (smoke step vs a dedicated `npm run eval:routing`).
