# HANDOFF — AGENTS.md size reduction (dedup + skill-offload)

**Date:** 2026-06-01
**Branch:** `main`
**Author of work:** Claude (pair session with CEO)
**Status:** ✅ Edits complete & verified mechanically + live. ⏳ NOT shipped — version bump (109→110) deliberately deferred to CEO go-ahead. Nothing committed.

---

## 0. TL;DR (read this first)

The workspace bootstrap file `AGENTS.md` had grown to ~35k chars and was crowding two budgets. Two safe passes were applied:

1. **Dedup pass** — removed verbatim-duplicated rules. 41,185 → 39,832 bytes.
2. **Skill-offload pass** — moved task-specific detail out of the always-loaded `AGENTS.md` into on-demand skill files it already (or now) points to. **Final: 30,244 chars / 35,647 bytes / 355 lines** (was 35,024 chars / 40,769 bytes at HEAD).

**No rule was deleted** — everything moved was relocated into a skill file the bot loads on-demand for that capability. Verified by a 13-point coverage check (all pass) and a **live test** proving the bot reads the exact skill the Capability Router points to.

**Concrete win beyond size:** the injected CEO-memory budget was pinned at its 2,000-char floor because `AGENTS.md` exceeded the budget; it is now **un-throttled to 4,756 chars**.

**To ship:** bump the internal AGENTS content-version `109 → 110` in **4 places** (§7), regen system-map, run smoke tests, then build/release per normal CEO-approved flow. This is the internal `modoroclaw-agents-version`, **NOT** the app version (2.4.x) — do not touch the app version.

---

## 1. The problem

`AGENTS.md` is the workspace bootstrap prompt loaded into the single openclaw gateway agent that serves all channels (Telegram CEO, Zalo, WhatsApp, Lark). It had doubled from ~17k chars (May 12) to ~35k (May 29) through feature accretion — each new capability appended its own rule block **inline** instead of into a skill file.

Two budgets were affected:
- **Per-file bootstrap budget** — `AGENTS_MD_BOOTSTRAP_MAX_CHARS = 40000` floor ([electron/lib/config.js:51](electron/lib/config.js#L51)). At 40,769 bytes the file tripped the "risk of tail truncation" warn ([electron/lib/ceo-memory.js:896-902](electron/lib/ceo-memory.js#L896)).
- **Injected CEO-memory budget** — `getMemoryBudget = 35000 − len(AGENTS.md)`, floored at 2000, capped at 10000 ([electron/lib/ceo-memory.js:836-845](electron/lib/ceo-memory.js#L836)). With `AGENTS.md` over 35k, `available` went negative → memory pinned at the **2,000-char floor**. This was a live degradation: the bot's injected CEO memory was being starved by AGENTS.md bloat.

---

## 2. Key technical findings (discovered this session — important for anyone continuing)

### 2.1 The 40k limit is a FLOOR, not a hard cap
`resolveBootstrapMaxCharsForContext` = `clamp(contextTokens × 3 × 0.10, 40000, 120000)` ([config.js:121-124](electron/lib/config.js#L121)). On large-context models the per-file budget is up to 120k. So the file was not hard-truncated on premium models — but the 35k memory-budget threshold and the 40k warn are the practical ceilings to stay under.

### 2.2 The LIVE workspace is `%APPDATA%\9bizclaw\`, NOT `modoro-claw\`
- Live AGENTS.md: `C:\Users\buitu\AppData\Roaming\9bizclaw\AGENTS.md`
- Live skills: `C:\Users\buitu\AppData\Roaming\9bizclaw\skills\`
- openclaw runtime: `C:\Users\buitu\AppData\Roaming\9bizclaw\vendor\node_modules\openclaw\`
- `%APPDATA%\modoro-claw\` is **legacy/stale** (only `brand-assets/` + `gog/` left). The product userData dir is now `9bizclaw` (matches the license note path).
- The repo `d:\claw\AGENTS.md` and `d:\claw\skills\` are the **template source**, seeded into the live workspace on version bump.

### 2.3 Skills are loaded ON-DEMAND — verified live, this is the linchpin
The whole offload depends on the bot actually loading skill files when a capability fires. **Verified empirically** (see §6): handling a "công nợ" request, the live bot ran:
```
exec: powershell Get-Content '...\9bizclaw\skills\operations\cong-no.md'   ← read the skill
web_fetch /api/workspace/read?path=cong-no.md
```
Findings:
- Skills are **read on-demand** via `exec` (PowerShell `Get-Content`) and/or `web_fetch /api/workspace/read`. They are **NOT** read via the `read_file` tool, and **NOT** bootstrap-injected wholesale.
- The full `skills/` tree is **161 files / ~1.4M chars** — far larger than openclaw's total bootstrap cap (`bootstrapTotalMaxChars`, ≤800k), confirming skills cannot all be preloaded.
- **The bot reliably reads the exact skill file the Capability Router names.** This is what makes the offload safe: a new pointer to `document-creation.md` is read by the identical mechanism, provided the file exists in the workspace.
- Session transcripts live at: `C:\Users\buitu\.openclaw\agents\main\sessions\*.jsonl` (one active file per session; reset files suffixed `.jsonl.reset.<ts>`).

### 2.4 Deploy is atomic via one version gate
`seedWorkspace` re-seeds `AGENTS.md` AND refreshes the whole `skills/` tree **inside the same version-gated branch** (`existingVersion < CURRENT_AGENTS_MD_VERSION`) — [electron/lib/workspace.js:284](electron/lib/workspace.js#L284) (gate) and [:343-428](electron/lib/workspace.js#L343) (skill refresh + backup). So bumping the version pushes the trimmed `AGENTS.md` AND the new/edited skills together — **no window where AGENTS.md points at a skill file that isn't present.** Existing user files are preserved; orphans (files removed from template) are purged; CEO-created subdirs and `_archived/` are protected.

---

## 3. What was done

### Pass 1 — Dedup (verbatim-duplicated rules removed; one copy kept at most actionable spot)
- Merged two overlapping memory sections ("Bộ nhớ bot (CEO Memory)" + "Memory OS v2") into one, folding unique triggers (`correction`, `rule`, `pattern`, "ghi nhớ", observe-after-conversation) into the survivor.
- "Tạo Sheet = xlsx local → `gog drive upload --convert`" was stated ~4×; kept the Document-pipeline copy, removed the rest.
- "Gửi tin sau mỗi bước" was stated 3×; compressed the Telegram-section copy to a pointer.
- Fixed the stale skill-table pointer ("Bộ nhớ bot" → "Memory OS v2").

### Pass 2 — Skill-offload (task-specific detail → on-demand skill files)
Classification rule used (only **B** moved; **A** stays, **C** kept inline per CEO decision):
- **A (stays inline):** always-on rules and routing machinery — Skill-loading contract, Capability Router table, Routing table, all hard safety/prohibitions, prompt-injection defense, message hygiene, API-error/anti-fabrication, AUTO-MODE core, proactive-memory triggers (not keyword-gated).
- **B (moved):** task-specific detail already behind an existing `Đọc skills/...` pointer.
- **C (kept inline — CEO chose NOT to move):** Zalo security detail (scope refusals, permission boundaries).

**CEO decisions captured:** (1) doc detail → a **new MODORO-owned** skill (not the vendored Anthropic SKILL.md files, to avoid upstream-drift risk). (2) Bucket C left inline.

---

## 4. Files changed (all uncommitted in working tree)

| File | Change | Size |
|---|---|---|
| `AGENTS.md` | Trimmed (both passes) + router rewired. **Version still 109 — NOT bumped.** | 30,244 chars / 35,647 bytes / 355 lines |
| `skills/operations/document-creation.md` | **NEW.** Holds moved doc detail: CREATE/EDIT steps, per-format tool detail, PPTX special rules, runtime `test-exec` rule, upload pattern, Sheets/Docs/Slides quality notes. References the Anthropic SKILL.md files for deep API. | 3,478 chars |
| `skills/operations/zalo.md` | Appended `## NGƯỜI NỘI BỘ` section (internal-person behavior switch, moved from AGENTS.md). Placed right after `## PHẠM VI BOT`. | 13,032 chars |
| `skills/operations/image-generation.md` | Appended `## Trả ảnh cho CEO` (mediaUrls / no-auto-attach rules, moved from AGENTS.md). | 8,195 chars |

**AGENTS.md edits in detail:**
- Document-creation pipeline section → collapsed to a 4-line CREATE stub + pointer to `document-creation.md`.
- "Google Sheets / Docs / Slides" section → removed (folded into `document-creation.md`).
- Image section → kept pointer + the hard guard "CẤM dùng native image_generation tool"; removed redundant lines (already in `image-generation.md`) + the moved "Trả ảnh".
- "Người nội bộ" Zalo subsection → collapsed to a 1-line summary + pointer to `zalo.md`.
- Capability Router rows `docx_create/docx_edit/xlsx_create/xlsx_edit/pptx_create/pdf_create` → repointed from the Anthropic SKILL.md files to `skills/operations/document-creation.md`.
- Skill-loading table doc rows → consolidated to point at `document-creation.md` (deep API: anthropic-docx/pptx/xlsx/pdf).

---

## 5. Current metrics

| | chars | bytes |
|---|---|---|
| AGENTS.md at HEAD (668e2865) | 35,024 | 40,769 |
| After this session | **30,244** | **35,647** |
| Net reduction | **−4,780** | **−5,122** |

- Memory budget now = `35000 − 30244` = **4,756 chars** (was floored at 2,000). ✅ un-throttled.
- Under the 40k warn floor. ✅

---

## 6. Verification done

### Mechanical — coverage check (13/13 pass)
Re-runnable from repo root (`d:\claw`). Asserts (a) every moved rule still exists in its destination skill, and (b) AGENTS.md still points to each destination, and (c) hard guards/stubs remain inline:

```bash
pass=0; fail=0
chk(){ if grep -qF "$2" "$1" 2>/dev/null; then echo "  OK   $3"; pass=$((pass+1)); else echo "  FAIL $3"; fail=$((fail+1)); fi; }
echo "== moved rules EXIST in destinations =="
chk skills/operations/document-creation.md "Quy tắc Anthropic PPTX đặc biệt" "doc: PPTX rules"
chk skills/operations/document-creation.md "Runtime JS cho file Office/PDF" "doc: runtime exec"
chk skills/operations/document-creation.md "Google Sheet mới" "doc: Sheet-create"
chk skills/operations/document-creation.md "Sửa file có sẵn (EDIT)" "doc: EDIT steps"
chk skills/operations/zalo.md "BỎ hẳn persona bán hàng" "zalo: internal-person"
chk skills/operations/zalo.md "NGƯỜI NỘI BỘ" "zalo: section header"
chk skills/operations/image-generation.md "KHÔNG BAO GIỜ tự động đính kèm" "img: trả ảnh"
echo "== AGENTS.md still POINTS to destinations =="
chk AGENTS.md "skills/operations/document-creation.md" "router→doc skill"
chk AGENTS.md "skills/operations/zalo.md" "→zalo.md"
chk AGENTS.md "skills/operations/image-generation.md" "→image-generation.md"
echo "== hard guards/stubs stay inline =="
chk AGENTS.md "CẤM dùng native image_generation tool" "guard: no native image tool"
chk AGENTS.md "gog drive upload <file> --convert" "stub: CREATE flow"
chk AGENTS.md "marker \`[NGƯỜI NỘI BỘ" "stub: internal-person pointer"
echo "RESULT: $pass passed, $fail failed"
```
Last run: **13 passed, 0 failed.** Also confirmed: MEMORY-CONTEXT markers intact at tail; no orphaned `anthropic-*SKILL.md` refs left in the router.

### Live — skill-load mechanism (see §2.3)
Sent a real capability prompt to the live bot via the CEO test client and inspected the transcript. The bot read the exact skill the router named (`cong-no.md`) on-demand. This proves the offload's premise. **Not yet exercised end-to-end: `document-creation.md` specifically** (would require deploying the trimmed files to the live workspace — see §8 optional test). It is structurally identical to `cong-no.md`, which works.

**Test client:** `d:\claw\scripts\telegram-test-user.py` (Telethon, MTProto user session). Requires **Python 3.12** (`py -3.12`). Usage:
```bash
export NODE_ENV=test    # per project guard before any test script
py -3.12 scripts/telegram-test-user.py "<prompt>" --timeout 360 --idle-timeout 300
```
Cautions (from project memory): first inbound after gateway idle can be a cache miss (~minutes) → use a long `--idle-timeout`; the script uses an existing authenticated session — **never trigger Telegram login/OAuth**; don't run heavy local workflows while waiting (they starve the bot).

---

## 7. HOW TO SHIP (the version bump — atomic, do all together)

The trim only reaches existing installs when the internal content-version increments. Bump `109 → 110` in **all of these** (smoke tests assert they stay in sync):

1. `AGENTS.md:1` — `<!-- modoroclaw-agents-version: 110 -->`
2. `electron/lib/workspace.js:36` — `const CURRENT_AGENTS_MD_VERSION = 110;`
3. `electron/scripts/smoke-skill-runtime.js:164` — regex `modoroclaw-agents-version:\s*110` **and** `CURRENT_AGENTS_MD_VERSION\s*=\s*110` (one line, two patterns; messages on 165/167 say "109" too — update for clarity).
4. `electron/scripts/smoke-test.js:2195` — regex `modoroclaw-agents-version:\s*110` (messages on 2196/2198 mention 109; update). NOTE: this test also asserts `agentsMd.includes('Người nội bộ')` — the trimmed AGENTS.md **still contains** "Người nội bộ" (the stub header), so it stays green.

Then, per project conventions (from memory):
- **Regen system-map before tagging** — source edits drift `docs/generated/system-map.*`; CI `map:check` fails the Mac build otherwise. Use the `build` skill or the project's system-map regen command, commit the regen.
- **Run smoke tests** — `electron/scripts/smoke-test.js` + `smoke-skill-runtime.js` must pass (they gate the build).
- **Do NOT bump the app version** (stays 2.4.x). This is the internal agents-version only.
- **Do NOT release/tag/upload without explicit CEO "ship/release"** (hard project rule). Building an EXE/DMG ≠ shipping.

On next launch of any existing install: the version gate fires → `AGENTS.md` re-seeded (old one backed up to `.learnings/AGENTS-backup-v109-<ts>.md`) + `skills/` refreshed (adds `document-creation.md`, updates `zalo.md` + `image-generation.md`), CEO files preserved.

---

## 8. WHAT REMAINS (CEO's call)

### Option A — Full new-content live test (belt-and-suspenders)
Validate `document-creation.md` end-to-end before shipping:
1. Back up live `9bizclaw\AGENTS.md`.
2. Copy repo `AGENTS.md` → live workspace; copy `skills/operations/document-creation.md` → live workspace (additive, no overwrite); copy edited `zalo.md` + `image-generation.md`.
3. Send `"tạo file word báo giá test cho khách A"` via the test client; confirm the bot reads `document-creation.md` (check transcript) and produces a docx + Drive link.
4. Revert `AGENTS.md` to the backup afterward unless shipping.
- **Side effects:** temporarily modifies the live workspace + creates one test Google Drive file (deletable). Latency: minutes.

### Option B — Ship now (§7)
The mechanism is proven (§2.3, §6) and the change is reversible; going straight to the version bump is reasonable.

---

## 9. ROLLBACK

- **Pre-ship (now):** `git checkout AGENTS.md skills/operations/zalo.md skills/operations/image-generation.md && rm skills/operations/document-creation.md`. Nothing is committed.
- **Post-ship:** revert the 4 version pins to `109` (or `git revert` the commit). Existing installs keep the v110 workspace copy until a higher version seeds; the version gate only re-seeds on `<`. Each re-seed also wrote a backup to `.learnings/AGENTS-backup-v<old>-<ts>.md`.

---

## 10. STRATEGIC CONTEXT (why this approach, and the bigger question)

The CEO asked whether a **multi-agent** architecture (a main router agent delegating to sub-agents, each with its own workspace/AGENTS.md) would fix the size problem. Conclusions reached this session:

- **The size problem is a discipline problem, not a missing-architecture problem.** AGENTS.md is already a router that delegates to on-demand skill files; bloat happened because new features were inlined instead of offloaded. The fix is to finish using the delegation mechanism that already exists (this work) — **not** a rebuild. A multi-agent rebuild would not cure the habit; you'd just have N files bloating instead of 1.
- **Per-capability sub-agents are NOT worth it** — on-demand skill loading already achieves the context savings without spawn latency or losing conversation context.
- **Per-channel agents (CEO-Telegram vs Zalo-customer) ARE a strong future idea — but motivated by security/persona isolation, not size.** Today one agent + one `tools.allow` serves all channels; isolation is band-aided with input-level `COMMAND-BLOCK` rewriting and 3-layer output filters. Real per-channel agents would never even hold `exec`/`cron` for customer channels. **Feasibility caveat:** the current openclaw integration is single-agent (one `agents.defaults`; no per-channel agent mapping or sub-agent-spawn primitive was found). It would require either multiple gateway instances per role (operationally heavy) or openclaw natively supporting named agents + channel routing (must be verified against the installed openclaw version). Treat as a separate, larger initiative.

### Remaining offload headroom
This pass was conservative (bucket B only, ~−4.8k). To go further toward ~25k you'd move bucket C (Zalo security detail) into the always-loaded `zalo.md` (safe: code-backed by COMMAND-BLOCK + always loaded for the Zalo channel) — CEO declined for now. The non-movable core (Capability Router table, routing tables, hard safety, AUTO-MODE) is load-bearing and should stay.

---

## 11. KEY CODE REFERENCES

| Concern | Location |
|---|---|
| AGENTS.md per-file bootstrap floor (40000) + clamp | [config.js:51](electron/lib/config.js#L51), [:121-124](electron/lib/config.js#L121) |
| openclaw bootstrap budgets set on `agents.defaults` | [config.js:162-171](electron/lib/config.js#L162) |
| Injected memory budget = 35000 − len(AGENTS.md), floor 2000 | [ceo-memory.js:836-845](electron/lib/ceo-memory.js#L836) |
| MEMORY-CONTEXT marker injection (indexOf, position-independent) | [ceo-memory.js:874-885](electron/lib/ceo-memory.js#L874) |
| 40k tail-truncation warn | [ceo-memory.js:896-902](electron/lib/ceo-memory.js#L896) |
| Content-version constant + regex | [workspace.js:36-37](electron/lib/workspace.js#L36) |
| Version gate (re-seed when existing < current) | [workspace.js:284](electron/lib/workspace.js#L284) |
| Skill-tree refresh coupled to the gate (+ backups, orphan purge) | [workspace.js:343-428](electron/lib/workspace.js#L343) |
| Smoke assertions hardcoding 109 | [smoke-skill-runtime.js:164](electron/scripts/smoke-skill-runtime.js#L164), [smoke-test.js:2195](electron/scripts/smoke-test.js#L2195) |

---

## 12. OPEN QUESTIONS / CAUTIONS

- **`document-creation.md` not yet tested end-to-end live** (only the mechanism via `cong-no.md`). Low risk (structurally identical), but Option A in §8 closes it.
- **AUTO-MODE reliability is the one place on-demand skill loading is most fragile** (the bot must not reply text mid-workflow). The offload deliberately left AUTO-MODE and all always-on rules inline. Don't offload those.
- **`modoro-claw` vs `9bizclaw`:** if you script anything against the live workspace, use `%APPDATA%\9bizclaw\`. `modoro-claw` is stale.
- **Behavioral golden-set** (a fixed ~15-25 prompt suite run before/after) was scoped but not built into a permanent harness; the §6 live test was a single representative probe. Worth formalizing if more offload passes follow.
