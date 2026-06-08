# Facebook Campaign Batch Posting — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-post fire-time Facebook approval with a campaign batch model — CEO approves the whole campaign once, then N pre-approved one-time jobs auto-post their **frozen** banners on schedule and report back — fixing bugs A (preview not approvable), B (banner regenerated), D (wrong numbering), and completing C (campaign grouping).

**Architecture:** Most of the publish path is already frozen-image-ready (it posts `pending.imagePath` verbatim, skips+notifies on a missing image, and notifies after publish). The work concentrates in: extending the schedule + create route with frozen-image fields, making `handleGenerate` skip generation for frozen posts, carrying campaign fields into the pending + ledger, decoupling approval discovery from a live schedule (bug A), and a new campaign skill + AGENTS route. Testable decisions are extracted into small dependency-injected pure helpers, matching the repo's `check-*.js` smoke convention.

**Tech Stack:** Node.js (CommonJS), Electron main process, `node:assert` smoke-check scripts wired into `electron/package.json`'s `smoke` script. No `npm test`; tests run with system node.

**Spec:** [2026-06-07-fb-campaign-batch-design.md](../specs/2026-06-07-fb-campaign-batch-design.md)

---

## Conventions for this codebase (read before starting)

- **No `npm test`.** Tests are `electron/scripts/check-*.js`, run with system node, wired into `cd electron && npm run smoke`. Run one with `cd electron && node scripts/check-<name>.js`.
- **`fb-schedule.js` has no `wsOverride` seam** and its core functions touch the workspace, cron, image-gen, Telegram, and the Graph API — not unit-testable end-to-end. So this plan **extracts the testable decisions into small pure, dependency-injected helpers** (`_validateImageSource`, `_isFrozenPost`, `_buildFbHistoryRecord`, `collectActivePendings`) and tests those directly. Wiring that can't be unit-tested gets a **source-marker assertion** + manual verification (the repo already does this, e.g. the sqlite-runtime guard in `check-customer-memory-updater.js`).
- **Backward compatibility is mandatory:** every new field is optional; existing schedules/pendings without them must behave exactly as today. A test asserts this.
- **Two version numbers, do not conflate:** `CURRENT_AGENTS_MD_VERSION` (electron/lib/workspace.js) is the AGENTS.md doc-sync counter — bump it (and the line-1 stamp) so the new routing reaches installs. The product version (2.4.x) is the CEO's call — do **not** touch it.
- **Do not commit or push** unless the CEO explicitly asks. Commit steps are written for readiness; pause for go-ahead. Verify branch with `git branch --show-current` first (HARD rule).
- **Cross-platform (HARD rule):** `imagePath` is an absolute path under `userData` (differs per OS). Use `fs.existsSync` (separator-agnostic) for checks; never hand-split on `/` or `\`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `electron/lib/fb-schedule.js` | Frozen-image fields + create-route validation; `handleGenerate` frozen-skip; pending carries campaign fields; ledger record adds index/total; notify-after enrich; `collectActive`/`resolve` disk-scan (bug A). Extract 4 pure helpers. | Modify |
| `electron/scripts/check-fb-campaign.js` | Smoke/contract test for the 4 extracted helpers + backward-compat. | Create |
| `electron/package.json` | Add `check-fb-campaign.js` to the `smoke` script. | Modify |
| `skills/marketing/facebook-campaign.md` | Agent flow: draft plan → freeze banners to a durable dir → one review artifact → batch-create frozen autoPost jobs (campaignId + index/total) → report from ledger by campaignId. | Create |
| `AGENTS.md` | Route "đăng chiến dịch N bài" → campaign flow; bump version stamp. | Modify |
| `electron/lib/workspace.js` | Bump `CURRENT_AGENTS_MD_VERSION`. | Modify |
| `docs/generated/system-map.{json,txt}` | Regenerate after editing lib + routes. | Modify (generated) |

---

## Chunk 1: Frozen-image schedule core (code)

### Task 1: Create-route validation — `prompt` OR `imagePath`

**Files:**
- Modify: `electron/lib/fb-schedule.js` (create route ~1214-1316; add helper near other pure helpers ~line 64)
- Test: `electron/scripts/check-fb-campaign.js` (Create)
- Modify: `electron/package.json` (smoke)

- [ ] **Step 1: Write the failing test**

Create `electron/scripts/check-fb-campaign.js`:

```javascript
'use strict';
// Unit tests for the Facebook campaign-batch helpers in lib/fb-schedule.js.
// Run with system node. Covers the dependency-injected pure helpers:
// _validateImageSource, _isFrozenPost, _buildFbHistoryRecord, collectActivePendings.

const assert = require('node:assert');
const fb = require('../lib/fb-schedule');

// --- _validateImageSource: require prompt OR imagePath; imagePath must exist ---
{
  const exists = (p) => p === '/frozen/ok.png';
  assert.deepStrictEqual(fb._validateImageSource({ prompt: 'draw a cat' }, exists), { ok: true });
  assert.deepStrictEqual(fb._validateImageSource({ imagePath: '/frozen/ok.png' }, exists), { ok: true });
  assert.strictEqual(fb._validateImageSource({}, exists).ok, false, 'neither prompt nor imagePath → error');
  const missing = fb._validateImageSource({ imagePath: '/frozen/gone.png' }, exists);
  assert.strictEqual(missing.ok, false, 'imagePath set but file missing → error');
  assert.ok(/không tồn tại|missing|not found/i.test(missing.error), 'error explains missing file');
  console.log('_validateImageSource OK');
}

console.log('\nAll fb-campaign helper tests passed.');
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd electron && node scripts/check-fb-campaign.js`
Expected: FAIL — `fb._validateImageSource is not a function`.

- [ ] **Step 3: Implement the helper**

In `electron/lib/fb-schedule.js`, after `getFbHistoryPath()` (line 63), add:

```javascript
// Validate the image source for a schedule-create request. A post needs EITHER a
// generation prompt OR a pre-rendered frozen imagePath (campaign posts). If an
// imagePath is given, the file must already exist (fail fast — don't half-build a
// campaign). fileExists is injected so this is unit-testable without a workspace.
function _validateImageSource(params, fileExists) {
  const hasPrompt = !!(params && params.prompt);
  const hasImage = !!(params && params.imagePath);
  if (!hasPrompt && !hasImage) {
    return { ok: false, error: 'prompt hoặc imagePath là bắt buộc (cần prompt để tạo ảnh, hoặc imagePath ảnh đã có sẵn)' };
  }
  if (hasImage && !fileExists(params.imagePath)) {
    return { ok: false, error: `imagePath không tồn tại: ${params.imagePath}` };
  }
  return { ok: true };
}
```

Export it: in `module.exports`, under the `// Data` group, add a test-helpers line at the end of the exports object (before the closing `}`):

```javascript
  // Pure helpers exported for tests
  _validateImageSource,
```

- [ ] **Step 4: Wire it into the create route**

In the create route, replace the hard `prompt` requirement (line 1218):

```javascript
    if (!prompt) { jsonResp(res, 400, { success: false, error: 'prompt required' }); return true; }
```
with:
```javascript
    const _imgCheck = _validateImageSource(params, (p) => { try { return require('fs').existsSync(p); } catch { return false; } });
    if (!_imgCheck.ok) { jsonResp(res, 400, { success: false, error: _imgCheck.error }); return true; }
```

And in the `newSchedule` object (line 1268-1284), make `prompt` tolerant of absence and add the new fields:
```javascript
      prompt: prompt ? String(prompt) : '',
```
add after `targetPageId,`:
```javascript
      imagePath: params.imagePath ? String(params.imagePath) : null,
      campaignId: params.campaignId ? String(params.campaignId) : null,
      postIndex: Number.isFinite(parseInt(params.postIndex, 10)) ? parseInt(params.postIndex, 10) : null,
      postTotal: Number.isFinite(parseInt(params.postTotal, 10)) ? parseInt(params.postTotal, 10) : null,
```

- [ ] **Step 5: Run to verify the test passes + module loads**

Run: `cd electron && node scripts/check-fb-campaign.js && node -e "require('./lib/fb-schedule'); console.log('loads OK')"`
Expected: `_validateImageSource OK` … `All fb-campaign helper tests passed.` then `loads OK`.

- [ ] **Step 6: Wire the check into smoke**

In `electron/package.json` `"smoke"`, insert ` && node scripts/check-fb-campaign.js` anywhere in the `check-*` cluster **before the first `npm run guard:*`** (the chain already has several `check-*.js` after `check-zalo-group-history-archive.js` — e.g. `check-zalo-daily-digest.js`; placement among them doesn't matter, only that it runs before `guard:*`). Verify after: `cd electron && node -e "const s=require('./package.json').scripts.smoke; console.log(s.includes('check-fb-campaign.js') && s.indexOf('check-fb-campaign.js') < s.indexOf('guard:') ? 'OK placed before guards' : 'FIX placement')"` → `OK placed before guards`.

- [ ] **Step 7: Commit** (pause for CEO go-ahead; confirm branch first)

```bash
git branch --show-current
git add electron/lib/fb-schedule.js electron/scripts/check-fb-campaign.js electron/package.json
git commit -m "feat(fb-campaign): frozen-image create validation (prompt OR imagePath)"
```

### Task 2: `handleGenerate` skips generation for frozen posts

**Files:**
- Modify: `electron/lib/fb-schedule.js` (`_isFrozenPost` helper near line 64; `_handleGenerateInner` ~400-545; pending object ~443-458)
- Test: `electron/scripts/check-fb-campaign.js`

- [ ] **Step 1: Add the failing helper test**

In `check-fb-campaign.js`, before the final `console.log('\nAll fb-campaign...`, add:

```javascript
// --- _isFrozenPost: true only when schedule carries a frozen imagePath ---
{
  assert.strictEqual(fb._isFrozenPost({ imagePath: '/x.png' }), true);
  assert.strictEqual(fb._isFrozenPost({ prompt: 'draw' }), false);
  assert.strictEqual(fb._isFrozenPost({}), false);
  assert.strictEqual(fb._isFrozenPost(null), false);
  console.log('_isFrozenPost OK');
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd electron && node scripts/check-fb-campaign.js`
Expected: FAIL — `fb._isFrozenPost is not a function`.

- [ ] **Step 3: Implement `_isFrozenPost` + export**

After `_validateImageSource`, add:
```javascript
// A "frozen" post carries a pre-rendered banner (campaign posts). Its image is
// chosen + approved at plan time, so the generate phase must reuse it as-is and
// never regenerate (Bug B). Pure → unit-testable.
function _isFrozenPost(schedule) {
  return !!(schedule && schedule.imagePath);
}
```
Add `  _isFrozenPost,` to the test-helpers export group.

- [ ] **Step 4: Add the frozen branch in `_handleGenerateInner`**

In `_handleGenerateInner`, after the existing-pending guard (ends line 419) and BEFORE `const prompt = schedule.prompt || '';` (line 432), insert:

```javascript
  // Frozen campaign post: image already chosen + approved at plan time. Skip image
  // generation entirely (Bug B: never regenerate an approved asset). For autoPost
  // (the campaign default) write an already-approved pending and send NO fire-time
  // heads-up — the campaign was pre-approved and we post-then-notify at publish.
  if (_isFrozenPost(schedule)) {
    const fileOk = (() => { try { return fs.existsSync(schedule.imagePath); } catch { return false; } })();
    const frozen = {
      scheduleId, date,
      status: fileOk ? (schedule.autoPost ? 'approved' : 'pending') : 'skipped',
      imagePath: schedule.imagePath,
      caption: schedule.caption || '',
      prompt: schedule.prompt || '',
      targetPageId: schedule.targetPageId || null,
      campaignId: schedule.campaignId || null,
      postIndex: Number.isFinite(schedule.postIndex) ? schedule.postIndex : null,
      postTotal: Number.isFinite(schedule.postTotal) ? schedule.postTotal : null,
      label: schedule.label || null,
      generatedAt: new Date().toISOString(),
      approvedAt: (fileOk && schedule.autoPost) ? new Date().toISOString() : null,
      publishedAt: null, postId: null, postUrl: null,
      error: fileOk ? null : 'Ảnh đóng băng không tồn tại trước giờ đăng',
      autoPost: !!schedule.autoPost,
    };
    savePending(frozen);
    if (!fileOk) {
      if (_sendTelegram) { try { await _sendTelegram(`[FB Campaign] "${schedule.label}" — ảnh đóng băng đã mất, bỏ qua bài này. Tạo lại nếu cần.`); } catch {} }
      return;
    }
    // Non-autoPost frozen post → still preview (reusing the frozen image, never regenerating).
    if (!schedule.autoPost && _sendTelegramPhoto) {
      try { await _sendTelegramPhoto(schedule.imagePath, `[FB Preview] "${schedule.label}"\nCaption:\n${frozen.caption}\n\nTrả lời "fb ok" để duyệt, "fb hủy" để bỏ.`); } catch {}
    }
    return;
  }
```

Also add the campaign fields + `label` to the **non-frozen** pending object (line 443-458) so ordinary posts also carry them when present:
```javascript
    autoPost: !!schedule.autoPost,
    label: schedule.label || null,
    campaignId: schedule.campaignId || null,
    postIndex: Number.isFinite(schedule.postIndex) ? schedule.postIndex : null,
    postTotal: Number.isFinite(schedule.postTotal) ? schedule.postTotal : null,
```

- [ ] **Step 5: Run helper test + module load**

Run: `cd electron && node scripts/check-fb-campaign.js && node -e "require('./lib/fb-schedule'); console.log('loads OK')"`
Expected: `_isFrozenPost OK` + all prior + `loads OK`.

- [ ] **Step 6: Source-marker guard for the frozen-skip wiring**

In `check-fb-campaign.js`, add:
```javascript
// --- wiring guard: handleGenerate honors the frozen branch (can't unit-test the
//     cron/imageGen/telegram path; pin the source so it can't silently regress) ---
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'fb-schedule.js'), 'utf8');
  assert.ok(/_isFrozenPost\(schedule\)/.test(src), 'handleGenerate must branch on _isFrozenPost');
  assert.ok(src.includes('Bug B: never regenerate'), 'frozen branch comment present (skip-generate intent)');
  console.log('frozen-skip wiring guard OK');
}
```

Run: `cd electron && node scripts/check-fb-campaign.js`
Expected: all sections OK.

- [ ] **Step 7: Commit** (pause for go-ahead)

```bash
git add electron/lib/fb-schedule.js electron/scripts/check-fb-campaign.js
git commit -m "feat(fb-campaign): handleGenerate reuses frozen banner, skips regeneration (Bug B)"
```

### Task 3: Ledger record carries `postIndex`/`postTotal`

**Files:**
- Modify: `electron/lib/fb-schedule.js` (`appendFbPostHistory` ~70-92)
- Test: `electron/scripts/check-fb-campaign.js`

- [ ] **Step 1: Add the failing test**

In `check-fb-campaign.js`, add:
```javascript
// --- _buildFbHistoryRecord: carries campaignId + postIndex/postTotal, with the
//     pending winning over a (possibly auto-deleted) schedule ---
{
  const pending = {
    scheduleId: 'fb_1', date: '2026-06-09', status: 'published',
    postId: 'p1', postUrl: 'https://fb/p1', publishedAt: '2026-06-09T13:30:00Z',
    targetPageId: 'PAGE', campaignId: 'camp_X', postIndex: 3, postTotal: 14, label: 'Bài 3',
  };
  // schedule == null simulates a one-time schedule auto-deleted by publish time
  const rec = fb._buildFbHistoryRecord(pending, null);
  assert.strictEqual(rec.campaignId, 'camp_X', 'campaignId from pending when schedule gone');
  assert.strictEqual(rec.postIndex, 3);
  assert.strictEqual(rec.postTotal, 14);
  assert.strictEqual(rec.status, 'published');
  assert.strictEqual(rec.postUrl, 'https://fb/p1');
  assert.strictEqual(rec.label, 'Bài 3', 'label falls back to pending when schedule gone');
  // schedule present overrides label/campaignId
  const rec2 = fb._buildFbHistoryRecord(pending, { id: 'fb_1', label: 'Sched Label', campaignId: 'camp_X', postDate: '2026-06-09' });
  assert.strictEqual(rec2.label, 'Sched Label');
  // BACKWARD-COMPAT: a legacy pending with no campaign fields → nulls, never undefined/crash
  const legacy = fb._buildFbHistoryRecord({ scheduleId: 'old', date: '2026-06-01', status: 'published', postId: 'x' }, null);
  assert.strictEqual(legacy.campaignId, null);
  assert.strictEqual(legacy.postIndex, null);
  assert.strictEqual(legacy.postTotal, null);
  assert.strictEqual(legacy.status, 'published');
  console.log('_buildFbHistoryRecord OK');
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd electron && node scripts/check-fb-campaign.js`
Expected: FAIL — `fb._buildFbHistoryRecord is not a function`.

- [ ] **Step 3: Extract + extend the record builder**

In `appendFbPostHistory` (line 70-92), replace the inline `const rec = {...}` (lines 74-87) with a call to a new exported pure helper, and define the helper above `appendFbPostHistory`:

```javascript
// Build one ledger record from a pending (+ optional schedule). Pure → testable.
// Pending wins over schedule because a one-time schedule is usually auto-deleted by
// publish time, so appendFbPostHistory is often called with schedule == null.
function _buildFbHistoryRecord(pending, schedule) {
  return {
    t: new Date().toISOString(),
    scheduleId: pending.scheduleId || schedule?.id || null,
    label: schedule?.label || pending.label || null,
    date: pending.date || null,
    postDate: schedule?.postDate || pending.date || null,
    campaignId: schedule?.campaignId || pending.campaignId || null,
    postIndex: Number.isFinite(pending.postIndex) ? pending.postIndex : (Number.isFinite(schedule?.postIndex) ? schedule.postIndex : null),
    postTotal: Number.isFinite(pending.postTotal) ? pending.postTotal : (Number.isFinite(schedule?.postTotal) ? schedule.postTotal : null),
    status: pending.status || 'unknown',
    postId: pending.postId || null,
    postUrl: pending.postUrl || null,
    publishedAt: pending.publishedAt || null,
    targetPageId: pending.targetPageId || schedule?.targetPageId || null,
    error: pending.error || null,
  };
}
```

Then in `appendFbPostHistory`, the body becomes:
```javascript
function appendFbPostHistory(pending, schedule) {
  try {
    const p = getFbHistoryPath();
    if (!p || !pending) return;
    const rec = _buildFbHistoryRecord(pending, schedule);
    fs.appendFileSync(p, JSON.stringify(rec) + '\n', 'utf-8');
  } catch (e) {
    console.warn('[fb-schedule] appendFbPostHistory failed:', e?.message);
  }
}
```

Add `  _buildFbHistoryRecord,` to the test-helpers export group.

> Note the `t` field uses `new Date()`. That's fine in the runtime; the test only asserts the campaign/status fields, never `t`.
> **Intentional behavior delta:** `postDate` now falls back to `pending.date` (current code is `schedule?.postDate || null`). This is deliberate — a one-time schedule is auto-deleted by publish time, so without the fallback the ledger would lose the date for exactly the campaign posts we care about. Benign for existing posts (schedule present → unchanged).

- [ ] **Step 4: Run to verify it passes**

Run: `cd electron && node scripts/check-fb-campaign.js`
Expected: `_buildFbHistoryRecord OK` + all prior.

- [ ] **Step 5: Commit** (pause for go-ahead)

```bash
git add electron/lib/fb-schedule.js electron/scripts/check-fb-campaign.js
git commit -m "feat(fb-campaign): ledger records postIndex/postTotal (campaignId grouping, Bug C)"
```

### Task 4: Notify-after-publish enriched with `bài k/N`

**Files:**
- Modify: `electron/lib/fb-schedule.js` (publish success notify ~820-823)

- [ ] **Step 1: Edit the notify line**

In `_publishPendingImpl`, the success notify block (line 820-824) currently sends `Đã đăng "label" lên page thành công. url`. Change it to append the campaign position when present:

```javascript
      if (_sendTelegram) {
        try {
          const pgLabel = publishPageName ? ` lên **${publishPageName}**` : '';
          const seq = (Number.isFinite(pending.postIndex) && Number.isFinite(pending.postTotal)) ? ` (bài ${pending.postIndex}/${pending.postTotal})` : '';
          await _sendTelegram(`[FB Schedule] Đã đăng "${schedule?.label || pending.label || pending.scheduleId}"${seq}${pgLabel} thành công.\n${result.postUrl || ''}`);
        } catch {}
      }
```

- [ ] **Step 2: Verify module loads**

Run: `cd electron && node -e "require('./lib/fb-schedule'); console.log('loads OK')"`
Expected: `loads OK`.

- [ ] **Step 3: Commit** (pause for go-ahead)

```bash
git add electron/lib/fb-schedule.js
git commit -m "feat(fb-campaign): post-then-notify includes bài k/N"
```

---

## Chunk 2: Bug A — approval discovery decoupled from a live schedule

### Task 5: Disk-scan `collectActive` + tolerant `resolve`

**Files:**
- Modify: `electron/lib/fb-schedule.js` (`collectActivePendings` module-level helper near `listPendingForDate` ~371; `handleTelegramCommand` `collectActive`/`resolve` ~1675-1707; null-safe response strings ~1652/1717/1731)
- Test: `electron/scripts/check-fb-campaign.js`

- [ ] **Step 1: Add the failing test**

In `check-fb-campaign.js`, add:
```javascript
// --- collectActivePendings: disk-scan; surfaces an ORPHANED pending (no live
//     schedule) — the Bug A fix. Dependency-injected listPendingForDateFn. ---
{
  const byDate = {
    '2026-06-09': [
      { scheduleId: 'fb_live', date: '2026-06-09', status: 'pending' },
      { scheduleId: 'fb_orphan', date: '2026-06-09', status: 'approved' }, // schedule deleted
      { scheduleId: 'fb_done', date: '2026-06-09', status: 'published' },   // not active
    ],
    '2026-06-10': [],
    '2026-06-08': [],
  };
  const listFn = (d) => byDate[d] || [];
  const schedules = [{ id: 'fb_live', label: 'Live one' }]; // fb_orphan intentionally absent
  const active = fb.collectActivePendings(['2026-06-09', '2026-06-10', '2026-06-08'], schedules, listFn);
  const ids = active.map(a => a.pending.scheduleId).sort();
  assert.deepStrictEqual(ids, ['fb_live', 'fb_orphan'], 'active = pending+approved; published excluded; orphan INCLUDED');
  const orphan = active.find(a => a.pending.scheduleId === 'fb_orphan');
  assert.strictEqual(orphan.schedule, null, 'orphan has no live schedule but is still surfaced');
  const live = active.find(a => a.pending.scheduleId === 'fb_live');
  assert.strictEqual(live.schedule.label, 'Live one', 'live pending enriched with its schedule');
  console.log('collectActivePendings OK');
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd electron && node scripts/check-fb-campaign.js`
Expected: FAIL — `fb.collectActivePendings is not a function`.

- [ ] **Step 3: Implement the module-level helper**

After `listPendingForDate` (line 371), add:
```javascript
// Collect active pendings by SCANNING THE PENDING FILES ON DISK (not by iterating
// live schedules). This is the Bug A fix: a one-time schedule auto-deletes after it
// publishes, and an orphaned/late pending must still be approvable. Enrich with the
// schedule if it still exists (for label), else schedule=null — approvePending and
// publish already work from the pending alone. Deps injected for unit testing.
// dates order = priority (today, tomorrow, yesterday) → first wins per scheduleId.
function collectActivePendings(dates, schedules, listPendingForDateFn) {
  const seen = new Map();
  for (const date of dates) {
    for (const pending of listPendingForDateFn(date)) {
      if (!pending) continue;
      if (pending.status === 'pending' || pending.status === 'approved' || pending.status === 'regenerating') {
        if (!seen.has(pending.scheduleId)) {
          const schedule = schedules.find(s => s.id === pending.scheduleId) || null;
          seen.set(pending.scheduleId, { pending, schedule, date });
        }
      }
    }
  }
  return [...seen.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.pending.scheduleId < b.pending.scheduleId ? -1 : 1;
  });
}
```
Add `  collectActivePendings,` to the test-helpers export group.

- [ ] **Step 4: Rewire `handleTelegramCommand`'s `collectActive` + `resolve`**

In `handleTelegramCommand`, replace the nested `collectActive` body (lines 1675-1689) with a thin delegate:
```javascript
  function collectActive() {
    return collectActivePendings(dates, schedules, listPendingForDate);
  }
```
And in `resolve(specificId)`, drop the `&& schedule` requirement so an orphaned pending resolves (lines 1696-1701):
```javascript
    if (specificId) {
      for (const date of dates) {
        const pending = loadPending(specificId, date);
        if (pending) {
          const schedule = schedules.find(s => s.id === specificId) || null;
          return { found: { pending, schedule, date } };
        }
      }
      return { notFound: true };
    }
```

- [ ] **Step 5: Null-safe the response/disambiguation labels**

There are **FIVE** `.schedule.label` references inside the command handler + `_fbDisambig` — lines **1652, 1717, 1731, 1732, 1741**. ALL must become null-safe, or an orphaned (schedule=null) pending will throw and defeat the Bug A fix. Do not stop at the first three.

First grep to confirm the full set, then edit each:
```bash
cd electron && grep -n "\.schedule\.label" lib/fb-schedule.js
```
Apply the same `schedule?.label || pending.label || scheduleId` fallback to each:
- line ~1652 (`_fbDisambig` map): `capSnippet || \`"${x.schedule?.label || x.pending.label || x.pending.scheduleId}"\``
- line ~1717: `Đã duyệt và đăng "${r.found.schedule?.label || r.found.pending.label || r.found.pending.scheduleId}" thành công.`
- line ~1731 and ~1732: `${target.schedule?.label || target.pending.label || target.pending.scheduleId}` in both the "duyệt và đăng" and the "Đã duyệt" responses.
- line ~1741 (`label: entry.schedule.label`): `label: entry.schedule?.label || entry.pending.label || entry.pending.scheduleId`

The grep in Step 7's guard asserts zero raw `.schedule.label` remain.

- [ ] **Step 6: Run helper test + module load**

Run: `cd electron && node scripts/check-fb-campaign.js && node -e "require('./lib/fb-schedule'); console.log('loads OK')"`
Expected: `collectActivePendings OK` + all prior + `loads OK`.

- [ ] **Step 7: Source-marker guard for the rewire**

In `check-fb-campaign.js`, add:
```javascript
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'fb-schedule.js'), 'utf8');
  assert.ok(/collectActivePendings\(dates, schedules, listPendingForDate\)/.test(src), 'handleTelegramCommand must use the disk-scan collector');
  // Positive assertion on the post-edit form (robust to reformatting): resolve()
  // tolerates a missing schedule.
  assert.ok(/schedules\.find\(s => s\.id === specificId\) \|\| null/.test(src), 'resolve must tolerate a missing schedule (|| null)');
  // No raw `.schedule.label` may remain — every one must be null-safe (`.schedule?.label`).
  assert.ok(!/[^?]\.schedule\.label/.test(src), 'all .schedule.label references must be null-safe (.schedule?.label)');
  console.log('bug-A discovery wiring guard OK');
}
```

Run: `cd electron && node scripts/check-fb-campaign.js`
Expected: all sections OK.

- [ ] **Step 8: Commit** (pause for go-ahead)

```bash
git add electron/lib/fb-schedule.js electron/scripts/check-fb-campaign.js
git commit -m "fix(fb-campaign): approve from disk pendings even if schedule deleted (Bug A)"
```

---

## Chunk 3: Campaign skill + AGENTS routing + integration

### Task 6: Campaign skill + AGENTS route + version bump

**Files:**
- Create: `skills/marketing/facebook-campaign.md`
- Modify: `AGENTS.md` (route + version stamp line 1)
- Modify: `electron/lib/workspace.js` (`CURRENT_AGENTS_MD_VERSION`)

- [ ] **Step 1: Write the campaign skill**

Create `skills/marketing/facebook-campaign.md` describing the deterministic flow (match the concise style + Vietnamese-with-diacritics of the existing `skills/marketing/facebook-post-workflow.md`):

```markdown
# Chiến dịch Facebook (nhiều bài) — duyệt 1 lần, đăng tự động

Dùng khi CEO yêu cầu một LOẠT bài Facebook (chiến dịch N bài), không phải 1 bài lẻ.
Nguyên tắc: CEO duyệt TOÀN BỘ plan 1 lần, sau đó hệ thống tự đăng từng bài đúng giờ
bằng đúng ảnh + caption đã duyệt. KHÔNG duyệt lại từng bài.

## Quy trình

1. **Dựng plan đầy đủ.** Với mỗi bài: ngày, giờ, caption (GHI ĐÚNG "bài k/N" theo
   thứ tự plan — KHÔNG tự bịa số/tổng), và mô tả ảnh. N = tổng số bài CEO nêu.
2. **Tạo + ĐÓNG BĂNG tất cả banner NGAY khi làm plan.** Gọi `/api/image/generate`
   cho từng bài, lưu file vào thư mục BỀN (không phải temp) — ví dụ
   `fb-campaign-assets/<campaignId>/bai-k.png` qua `/api/file/write` nếu cần — và
   GIỮ đường dẫn tuyệt đối. Ảnh đã duyệt KHÔNG bao giờ tạo lại.
3. **Viết 1 artifact review duy nhất** vào workspace (vd
   `content-pack/fb-campaign-<campaignId>.md`) liệt kê mọi bài: k/N, ngày/giờ,
   caption, đường dẫn ảnh. Reply CEO: tóm tắt ngắn + đường dẫn file. KHÔNG dump
   từng bài thành nhiều tin.
4. **Chờ CEO duyệt** ("ok"/"duyệt"). Nếu CEO sửa bài nào → cập nhật plan + ảnh bài đó.
5. **Tạo lịch hàng loạt.** Sinh 1 `campaignId`. Với mỗi bài gọi
   `POST /api/fb/schedule/create` với: `postDate`, `postTime`, `caption`,
   `targetPageId`, `imagePath`=<ảnh đóng băng>, `autoPost=true`, `campaignId`,
   `postIndex`=k, `postTotal`=N. (Có `imagePath` → hệ thống KHÔNG tạo ảnh mới, đăng
   đúng ảnh đó.) Báo CEO 1 tin: đã tạo mấy bài, bài nào lỗi (nếu có).
6. **Sau đó im.** Mỗi bài tự đăng đúng giờ; hệ thống tự nhắn CEO "Đã đăng bài k/N + link".

## Báo cáo tiến độ chiến dịch
Khi CEO hỏi "đăng mấy bài rồi / còn mấy bài": đối chiếu HAI nguồn —
`GET /api/fb/schedule/history` (đã đăng, lọc theo `campaignId`) và
`GET /api/fb/schedule/list` (còn chờ). đã đăng = số record `published` cùng
`campaignId`; còn chờ = số lịch còn lại. TUYỆT ĐỐI không báo từ 1 nguồn.

## Anti-features
- KHÔNG preview/duyệt từng bài lúc đăng (đã duyệt cả plan).
- KHÔNG tạo lại ảnh cho bài đã lên lịch.
- KHÔNG tự bịa "bài X/Y" — số lấy từ plan.
```

- [ ] **Step 2: Add the AGENTS.md route + bump version**

In `AGENTS.md`, find the Facebook section (grep `facebook_scheduled` / the FB capability trigger near line 326). Add a routing line for campaigns, e.g.:
```
- **Chiến dịch / loạt nhiều bài Facebook** ("đăng chiến dịch N bài", "lên lịch loạt bài", "series N bài") → Đọc `skills/marketing/facebook-campaign.md` và theo quy trình duyệt-1-lần + tạo lịch đóng băng. KHÔNG đăng kiểu từng bài ad-hoc cho chiến dịch.
```
Bump line 1 stamp `<!-- modoroclaw-agents-version: N -->` to N+1 (read the current value first).

In `electron/lib/workspace.js`, bump `const CURRENT_AGENTS_MD_VERSION = N;` to the same N+1 (read current value first; it must match the stamp).

- [ ] **Step 3: Verify version match + api-doc-drift**

Run:
```bash
cd electron && node -e "const w=require('fs').readFileSync('lib/workspace.js','utf8'); const a=require('fs').readFileSync('../AGENTS.md','utf8'); const wv=(w.match(/CURRENT_AGENTS_MD_VERSION = (\d+)/)||[])[1]; const av=(a.match(/modoroclaw-agents-version: (\d+)/)||[])[1]; console.log('workspace', wv, 'AGENTS', av, wv===av ? 'MATCH' : 'MISMATCH'); }" 2>/dev/null || node -e "const fs=require('fs'); const wv=(fs.readFileSync('lib/workspace.js','utf8').match(/CURRENT_AGENTS_MD_VERSION = (\d+)/)||[])[1]; const av=(fs.readFileSync('../AGENTS.md','utf8').match(/modoroclaw-agents-version: (\d+)/)||[])[1]; console.log('workspace',wv,'AGENTS',av, wv===av?'MATCH':'MISMATCH')"
node scripts/check-api-doc-drift.js
```
Expected: `MATCH`, and api-doc-drift PASS (the new route references `/api/fb/schedule/create` + `/api/fb/schedule/history`, which already exist).

- [ ] **Step 4: Commit** (pause for go-ahead)

```bash
git add skills/marketing/facebook-campaign.md AGENTS.md electron/lib/workspace.js
git commit -m "feat(fb-campaign): campaign skill + AGENTS route (duyệt 1 lần, đăng đóng băng) + version bump"
```

### Task 7: System map + full smoke

**Files:**
- Modify: `docs/generated/system-map.{json,txt}` (regenerated)

- [ ] **Step 1: Regenerate the system map**

Run: `cd electron && npm run map:generate`
Expected: writes `docs/generated/system-map.{json,txt}`.

- [ ] **Step 2: Full smoke**

Run: `cd electron && npm run smoke`
Expected: PASS end-to-end, including `check-fb-campaign.js`, `guard:facebook` (`check-facebook-publisher.js`), and `guard:architecture` (`map:check` passes because Step 1 regenerated the map). The known `better-sqlite3 NODE_MODULE_VERSION` warning under system node is harmless.

- [ ] **Step 3: Manual end-to-end sanity (recommended)**

With the app running + FB connected, drive a 2-post mini-campaign via the agent:
- Confirm the review artifact lists both posts with frozen image paths and correct `bài 1/2`, `bài 2/2`.
- After "ok", confirm two schedules created with the same `campaignId` and `autoPost:true`.
- Force one post's time (or wait) → confirm it posts the **frozen** image (not a regenerated one), the ledger record has `campaignId`+`postIndex/postTotal`, and CEO gets "Đã đăng bài 1/2 — <link>".
- Delete a one-off schedule that has an active pending, then "fb ok" → confirm it still publishes from the pending (Bug A).

- [ ] **Step 4: Commit the regenerated map** (pause for go-ahead)

```bash
git add docs/generated/system-map.json docs/generated/system-map.txt
git commit -m "chore(fb-campaign): regenerate system map"
```

---

## Definition of done

- `cd electron && npm run smoke` passes, including `check-fb-campaign.js`.
- A frozen-image schedule (`imagePath` set, no `prompt`) skips image generation and posts the exact frozen file; an already-approved campaign banner is never regenerated (Bug B).
- Batch-created schedules sharing a `campaignId` produce ledger records carrying that `campaignId` + `postIndex/postTotal`; a status query filtered by `campaignId` reconciles the full N (Bug C grouping).
- Campaign captions show `bài k/N` from the plan, never invented (Bug D).
- A pending whose schedule was deleted is still surfaced by `collectActive` and approved/published via "fb ok" (Bug A).
- Post-then-notify sends one CEO line with `bài k/N` + Fanpage link.
- Existing single-post schedules (no new fields) behave exactly as before (backward compatible).
- DM/zalo code and the publish-to-Graph mechanism are unchanged.

## Anti-features (deliberately not built)

- No ad-hoc `/api/fb/post` ↔ schedule-queue unification.
- No fire-time preview/approval for campaign posts (one up-front plan review).
- No server-rendered caption templating — numbering comes from the plan.
- No new durable store or batch endpoint (reuse `/api/fb/schedule/create` in a loop, existing pending/ledger files).
```
