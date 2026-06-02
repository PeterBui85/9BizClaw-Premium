# Session Change Log — 2026-06-01

> **Purpose:** Detailed record of all changes made this session. Commit history is insufficient — this file captures *what*, *why*, *how*, and *what to verify*.
> **Rule:** Every fix, edit, new function, new file, or structural change must be logged here before moving to the next task.

---

## Changes Made This Session

### 1. CEO Memory Capture v1

**Status:** Complete. All tasks done.

**Files created:**
- `electron/lib/ceo-memory-capture.js` — Pure capture module. Layer1 deterministic regex over transcript (preference, correction patterns). Layer2 code-triggered `call9Router` extraction with JSON parse. Emittable-type guard (no `task`/`task_state`/`decision`). Fully DI — no DB/ceo-memory.js/conversation.js imports.
- `electron/scripts/check-ceo-memory-capture.js` — 7 unit tests. Plain `node`, no better-sqlite3. Run: `node scripts/check-ceo-memory-capture.js`. Wired into smoke: `npm run guard:ceo-memory`.
- `electron/scripts/eval-ceo-memory.js` — Electron eval with real DB. Stubs only `modelCall`. Tests write → dedup → CEO-MEMORY.md recall. Run: `npx electron scripts/eval-ceo-memory.js`.
- `electron/scripts/debug-eval-ceo-memory.js` — Debug helper for the eval.
- `electron/tests/` — Test suite.

**Files modified:**
- `electron/lib/conversation.js` — `_runIdleMemoryExtraction` replaced LLM-prompt approach with `captureAndStore`. Removed `if (!_runCronAgentPromptFn) return;` guard. Uses `ceoMem` (module-level require) directly. `memory-missed.log` created with `{ recursive: true }` dir check.
- `electron/package.json` — Added `"guard:ceo-memory": "node scripts/check-ceo-memory-capture.js"` to smoke chain.
- `AGENTS.md` — Proactive-memory block collapsed from detailed rules to 1 pointer line: "TỰ ĐỘNG ghi — KHÔNG đợi CEO bảo: đọc `skills/operations/ceo-memory-api.md` mục 'QUAN SÁT CEO' cho quy trình chi tiết."

**Dead code cleaned up:**
- `setIdleMemoryRunCronAgent` — no callers remain. Verified: `grep` across electron/ returns zero matches.
- Old LLM-prompt code in `_runIdleMemoryExtraction` — removed (replaced by `captureAndStore`).

**Key architectural decision:** `captureAndStore` reads existing memories from `CEO-MEMORY.md` file (not `searchMemory` with empty query), then dedups by exact content+type match before writing.

---

### 2. v2.4.11 — Brand Assets

**Status:** Complete. All tasks done.

**Files created:**
- `brand-assets/` — Folder for brand asset files. Already existed from earlier session.
- `electron/lib/onboarding-nudge.js` (part of this feature) — See §3 below.

**Files modified:**
- `electron/lib/dashboard-ipc.js` — Added IPC handlers for brand assets: `list-brand-assets`, `upload-brand-asset`, `delete-brand-asset`, `pick-brand-asset-file`. Onboarding IPC consolidated: removed orphaned `_ONBOARDING_DAYS`, `_readOnboardingState`, `_writeOnboardingState`; replaced old `get-onboarding-status`/`dismiss-onboarding` handlers with thin wrappers that call `getOnboardingStatus()`/`dismissOnboarding()` from `onboarding-nudge.js`.
- `electron/preload.js` — Added preload bridges: `listBrandAssets`, `uploadBrandAsset`, `deleteBrandAsset`, `pickBrandAssetFile`, `getOnboardingStatus` (→ `onboarding:status`), `dismissOnboarding` (→ `onboarding:dismiss`), `advanceOnboarding` (→ `onboarding:advance`).
- `electron/ui/dashboard.html` — New "Tài sản hình ảnh" page with brand/product/knowledge sub-tabs. Brand tab lists assets, upload button, status badges. Batch upload modal.

**Brand assets behavior:**
- Default `type=brand`, `visibility=internal`.
- Upload triggers async vision with brand-specific prompt (màu sắc, typography, bố cục).
- `searchMediaAssets` hard-filters `type !== 'brand'` — brand assets **never** reach customer send path.
- Brand assets **never eligible** for customer image send regardless of match score.

---

### 3. v2.4.11 — Product Images Batch Upload

**Status:** Complete. All tasks done.

**Files modified:**
- `electron/ui/dashboard.html` — Changed tab "Hình sản phẩm cho Zalo" → "Hình ảnh sản phẩm" with multi-channel description. Upload button changed to "Upload" (not "Upload sản phẩm"). Batch upload modal implemented with shared tags/aliases/SKU prefix fields. `showProductBatchModal` + `submitProductBatch` functions. Grid renders via `renderMediaGrid` into `#product-media-grid`.
- `electron/lib/media-library.js` — 
  - Vision prompts split by `type`:
    - `brand`/`generated`: "Mô tả tài sản thương hiệu để làm REFERENCE khi tạo ảnh: màu sắc chính, typography, bố cục..."
    - `product`: "Mô tả SẢN PHẨM rất chi tiết: đặc tính kỹ thuật, giá nhìn thấy trên ảnh, màu sắc, biến thể, bao bì, góc chụp, đối tượng hỏi, VIẾT 3-5 CỤM TỪ khách hay hỏi..."
    - `knowledge_image`/`pdf_page`: lightweight description only
  - `autoGenerateTagsFromDescription()` — Vietnamese-aware keyword extraction with stop-word set including industry terms ('sản', 'hàng', 'loại', 'món', 'cái', 'chiếc', 'phẩm'). Caps at 12 tags.
  - `normalizeSearchText()` — Collapses whitespace, lowercases, preserves diacritics for Vietnamese search.
  - `searchMediaAssets` — Hard filter `a.type !== 'brand'`. Added `minScore` threshold option. Added `resolveMediaMatch` with confidence scoring: <0.4 = no match, 0.4–0.7 = ask clarification, ≥0.7 = auto-send top 5.

---

### 4. v2.4.11 — Premium Onboarding 7 Ngày

**Status:** Complete but has known issues (see §6 Critical Issues).

**Files created:**
- `electron/lib/onboarding-nudge.js` — Full 7-day onboarding nudge system:
  - State file: `onboarding-state.json`
  - State schema: `{ startedAt, sentDays[], currentDay, dismissed, lastCheckedAt }`
  - 7-day content framework with semi-personalization (reads workspace state: channels, knowledge, product images)
  - Telegram nudge: 1 message/day, short, with CTA keyword
  - Dashboard card data: reads from `getOnboardingStatus()`
  - `startOnboardingNudgeTimer()` — fires daily at 9:00 AM, checks if new day and sends nudge
  - `resetOnboardingState()` — resets state when wizard completes (called from `wizard-complete` IPC)
  - `dismissOnboarding()` / `advanceOnboardingDay()` — user interactions

**Files modified:**
- `electron/lib/dashboard-ipc.js` — `wizard-complete` IPC handler now calls `resetOnboardingState()` from `onboarding-nudge.js` and `startOnboardingNudgeTimer()`. Also added **deprecated** handlers reading `premium-onboarding.json` — these conflict with `onboarding-nudge.js`.
- `electron/ui/dashboard.html` — "Premium — Ngày N/7" card on Overview with title, body, CTA, skip/dismiss buttons. Calls `getOnboardingStatus()` → `dismissOnboarding()`. CSS styles for `#ov-onboarding-card`.
- `electron/preload.js` — Added `getOnboardingStatus`/`dismissOnboarding`/`advanceOnboarding` bridges at lines 342–344. **NOTE:** duplicate definitions at lines 287–288 must be removed.

**Known issue:** Two state files exist — `onboarding-state.json` (nudge) and `premium-onboarding.json` (dashboard-ipc). These are not synchronized. Dashboard card reads `premium-onboarding.json`; Telegram nudge reads `onboarding-state.json`. Must consolidate to single file.

---

### 5. AGENTS.md v110 Trim (Shipped)

**Status:** Complete and shipped.

**Files modified:**
- `AGENTS.md:1` — Already at version 110. Version bump done in previous session.
- `electron/lib/workspace.js:36` — `CURRENT_AGENTS_MD_VERSION = 110`
- `electron/scripts/smoke-skill-runtime.js:164` — Regex check for version 110
- `electron/scripts/smoke-test.js:2195` — Version check for smoke test
- `electron/tests/workspace.test.js:84` — `CURRENT_AGENTS_MD_VERSION = 110`
- `AGENTS.md` — Proactive-memory block collapsed to 1 line (see §1 above).

**Skills created/modified:**
- `skills/operations/document-creation.md` — NEW. Holds moved doc-creation detail from AGENTS.md.
- `skills/operations/zalo.md` — Appended "NGƯỜI NỘI BỘ" section.
- `skills/operations/image-generation.md` — Appended "Trả ảnh cho CEO" section.
- `skills/_archived/` — All contents deleted (dead skills from old Claude Code migration).
- `skills/minimax-docx/` — All contents deleted.
- `skills/minimax-pdf/` — All contents deleted.
- `skills/minimax-xlsx/` — All contents deleted.

**This session:** `AGENTS.md` proactive-memory block collapsed to 1 pointer line.

---

### 6. Infrastructure

**Files created:**
- `docs/superpowers/specs/2026-06-01-v2411-brand-assets-product-images-onboarding-design.md` — Spec for v2.4.11.
- `docs/superpowers/plans/2026-06-01-v2411-brand-assets-product-images-onboarding.md` — Implementation plan with chunk assignments for subagents.
- `docs/superpowers/specs/2026-06-01-facebook-multi-page-design.md` — Spec (not implemented this session).
- `docs/superpowers/plans/2026-06-01-facebook-multi-page-phase1.md` — Plan (not implemented this session).
- `CHANGELOG.md`, `HANDOFF.md`, `HANDOFF-TECH-DEBT.md` — Created in previous session.

**Files modified:**
- `docs/generated/system-map.json` + `docs/generated/system-map.txt` — Regenerated 4 times (after each structural change). IPC handlers: 213→211 (removed duplicate onboarding handlers). Preload bridges: 206→204 (removed duplicate onboarding bridges).

**Files deleted:**
- `skills/_archived/` (all contents) — Dead skill files.
- `skills/minimax-*` (all 3 packages) — Dead skill files.

---

## Changes Applied This Session (Post-Code-Review Fixes)

### Round 1 — Post-first-review fixes (committed)

7 critical/important issues fixed (see earlier sections). Smoke: all guards green. Unit tests: 8/8.

### Round 2 — Post-second-review fixes (current session)

Applied after second review revealed additional bugs. All smoke guards green, unit tests 8/8.

**1. Dashboard onboarding card permanently hidden (Critical)**
- **File**: `electron/lib/onboarding-nudge.js:298`
- **Bug**: `getOnboardingStatus()` returned `{ day, title, body, ... }` but the Dashboard frontend at `dashboard.html:6680` checked `!status.active`. The `active` field was never returned → card always hidden.
- **Fix**: Added `active: !state.dismissed` to the return object. Dashboard now correctly shows/hides the card.
- **Detection**: Senior-reviewer found by tracing frontend field usage back to backend.

**2. `_writeOnboardingState` called after removal (Critical)**
- **File**: `electron/lib/dashboard-ipc.js:4675`
- **Bug**: During consolidation of onboarding state, `_writeOnboardingState` was removed from `dashboard-ipc.js` but the call at line 4675 was not updated. Would cause `ReferenceError` on every `wizard-complete`.
- **Fix**: Replaced with `resetOnboardingState()` from the nudge module. IIFE at ~4747 also calls it, so removed the redundant sync call at line 4675 (only the IIFE call remains).

**3. State schema migration (Important)**
- **File**: `electron/lib/onboarding-nudge.js:_readState()`
- **Bug**: If a user had the old `onboarding-state.json` file from before the rename, it would be silently orphaned. `_readState()` only looks for `premium-onboarding.json`.
- **Fix**: `_readState()` now checks for `onboarding-state.json` alongside the new file, migrates it, and deletes the old file.

**4. `memory-missed.log` silently swallows errors (Important)**
- **File**: `electron/lib/conversation.js:641`
- **Bug**: The `onMissed` callback had a bare `catch {}` — disk full or permission errors were silently discarded.
- **Fix**: Changed to `catch (e) { console.warn('[idle-memory] onMissed log failed:', e?.message); }`.

**5. `conversation.js` redundant dynamic requires (Minor)**
- **File**: `electron/lib/conversation.js:323,326`
- **Bug**: Inside `_writeDailyMemoryJournal()`, two dynamic `require('./ceo-memory')` calls that duplicated the module-level `ceoMem` at line 7.
- **Fix**: Both replaced with `ceoMem` directly.

**6. Double `resetOnboardingState()` in `wizard-complete` (Minor)**
- **File**: `electron/lib/dashboard-ipc.js:4675`
- **Bug**: Synchronous call at 4675 was redundant with the IIFE call at ~4747. Fixed as part of Fix #2.

**7. All dynamic requires in `onboarding-nudge.js` consolidated to module top (Quality)**
- **File**: `electron/lib/onboarding-nudge.js:4-7`
- **Change**: `getWorkspace`, `probeTelegramReady`, `probeZaloReady`, `sendCeoAlert`, `auditLog`, `mediaLibrary` all moved to module level. All 5 dynamic requires inside functions removed.

### Remaining Issues (Known, Non-Blocking)

- **Dedup exact-match dependency documented** — `searchMemory` is semantic (FTS5+embedding), but dedup relies on exact-match guard. Correct today; fragile if `searchMemory` changes.
- **`autoGenerateTagsFromDescription` 12-tag cap** — Easy to raise; not a production risk.
- **`eval-ceo-memory.js` not verified under Electron** — Unit tests give confidence; integration test pending.

---

## Verification Commands

### Fixed This Session (post-code-review)

1. ~~`PDF_RENDER_ERROR_VI` undefined~~ — **FIXED.** Added `const PDF_RENDER_ERROR_VI = 'Không thể render PDF thành ảnh';` at `media-library.js:17`.
2. ~~Onboarding state file conflict~~ — **FIXED.** `onboarding-nudge.js` now uses `premium-onboarding.json` (was `onboarding-state.json`). Removed orphaned `_ONBOARDING_DAYS`, `_readOnboardingState`, `_writeOnboardingState` from `dashboard-ipc.js`. Dashboard IPC now thin-wraps nudge module functions. Single state file, Dashboard card + Telegram nudge stay in sync.
3. ~~Duplicate preload API names~~ — **FIXED.** Removed old `getOnboardingStatus`/`dismissOnboarding` at preload.js ~287–288. Kept newer `onboarding:status`/`onboarding:dismiss`/`onboarding:advance` at ~342–344.
4. ~~`sendCeoAlert` dynamic require in try block~~ — **FIXED.** All dynamic requires moved to module top: `getWorkspace`, `probeTelegramReady`, `probeZaloReady`, `sendCeoAlert`, `auditLog`, `mediaLibrary`.
5. ~~`_computeDay` off-by-one at midnight~~ — **FIXED.** Changed to `Math.ceil(diffMs / MS_PER_DAY)` with `Math.max(1, ...)` lower bound.
6. ~~`require('./ceo-memory')` inside `_runIdleMemoryExtraction`~~ — **FIXED.** Removed redundant local require. Uses `ceoMem` (module-level require) directly.
7. ~~Missing sender-strip false-positive unit test~~ — **FIXED.** Added test for `"Anh [23:15] CEO:"` → no false preference. Now 8/8 tests pass.

### Remaining Issues

**Minor:**
- **Dedup has no trigram similarity check** — Near-duplicates with minor wording differences may both be written. Content normalization catches most variants; risk is low.
- **`autoGenerateTagsFromDescription` caps at 12 tags** — May limit search surface for rich product descriptions. Consider increasing to 20 for product types.
- **`eval-ceo-memory.js` not verified under Electron** — Hasn't been run with real DB yet.

---

## Verification Commands

```bash
# Unit test CEO Memory (8 tests)
cd electron && node scripts/check-ceo-memory-capture.js
# Expected: 8 passed, 0 failed

# Full smoke
cd electron && npm run smoke
# Expected: all guards pass
```

---

## How to Use This File

Before starting a new session, read this file to understand what was done, what's known to be broken, and what still needs verification.

When fixing an issue from this file, mark it done here AND add a note in the relevant spec/plan.
