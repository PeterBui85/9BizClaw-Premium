# Facebook Campaign Batch Posting — Design

**Date:** 2026-06-07
**Status:** Approved (brainstorm)
**Scope:** Fix bugs A, B, D from the v2.4.10 customer transcript (chị Huê, 14-post Ideal Namecard campaign). Bug C (campaign under-count) was already fixed in v2.4.11 by the `fb-post-history.jsonl` ledger; this design completes its grouping gap.

## Problem

A 14-post Facebook campaign on v2.4.10 failed in four ways, all rooted in **per-post, fire-time approval**:

- **A** — "fb ok"/"duyệt" replied *"không có bài Facebook nào đang chờ duyệt"* even after a preview was sent. Confirmed cause: `collectActive()`/`resolve()` ([fb-schedule.js:1675-1707](../../../electron/lib/fb-schedule.js)) only surface a pending if its schedule still exists in `fb-scheduled-posts.json`. A one-time schedule auto-deletes after its publish phase, and an off-schedule/ad-hoc preview never creates a matching live schedule → the pending is orphaned and unreachable. (`approvePending` already tolerates a missing schedule and publishes from the pending, so only *discovery* is broken.)
- **B** — an already-approved banner was regenerated at preview time → wrong image posted. The regeneration guard ([fb-schedule.js:416-419](../../../electron/lib/fb-schedule.js)) only covers the cron generate phase; "reuse the approved asset" is otherwise an AGENTS.md instruction the agent can violate.
- **D** — captions said "bài 9/10" while the campaign was 14 posts. Not a code bug (captions are stored verbatim); the agent invents the index/total per post with no authoritative source.
- **C** (already fixed) — the v2.4.11 ledger records every post's terminal outcome, but `campaignId` is never populated at schedule-create, so a campaign can't be grouped/counted as one unit.

## Root cause and the better approach

All four come from approving each post **individually at the moment it fires** (preview → "fb ok" → maybe regenerate → post). That model has many failure points spread across time.

The chosen design eliminates the model rather than patching it:

> **Draft the whole campaign → CEO reviews once → on approval, create all the scheduled jobs in advance with content frozen → they post themselves and report back.**

One approval for the batch, then deterministic execution. This kills A/B/D at the root:

| Bug | Why it disappears |
|---|---|
| A | No fire-time per-post approval exists → nothing to miss. |
| B | Banners are generated and **frozen** at plan time; the job posts the stored file, never regenerates. |
| C | Each job carries a `campaignId` → the ledger groups the whole campaign trivially. |
| D | The plan defines post 1..N → numbering is authoritative, written once. |

## Goals

- A CEO can approve a multi-post FB campaign in **one review**, after which posts publish automatically on schedule with the exact reviewed banner + caption.
- Each scheduled post is **self-sufficient and frozen**: it carries its image path, caption, target page, campaign id, and index/total; it never regenerates.
- After each post publishes, the CEO gets **one line + the Fanpage link** (post-then-notify).
- Campaign status ("đã đăng / còn chờ") is answerable by filtering the ledger by `campaignId`.
- The legacy per-post one-off flow keeps working, with a small fix so its approval discovery is no longer broken (Bug A safety net).

## Non-goals (deliberately out of scope)

- No merge of the ad-hoc `/api/fb/post` (in-memory nonce) channel with the schedule queue. Campaigns no longer use the ad-hoc channel; the one-off scan-disk fix covers the schedule-pending path only.
- No new fire-time preview/approval UI. Campaign approval is up-front on the plan.
- No change to the publish-to-Graph-API mechanism, double-post prevention, or token handling.
- No retention/cleanup redesign (existing 7-day pending TTL stays).

## Architecture

Three layers; only the middle (scheduler) needs real new code.

```
CEO ──"đăng chiến dịch N bài …"──▶ AGENT (campaign skill)
        1. draft plan: N × {date, time, caption(with index/total), banner}
        2. generate + FREEZE all banners now → durable campaign-assets dir
        3. write ONE review artifact (workspace .md listing all posts + image paths)
        4. CEO reviews once → "ok"
        5. batch-create N schedules (loop /api/fb/schedule/create) with:
             imagePath(frozen) + autoPost + campaignId + postIndex/postTotal
                                   │
                                   ▼
SCHEDULER (fb-schedule.js)  per job, at postTime:
        - generate phase SKIPPED (imagePath present) — no regeneration
        - publish frozen image + caption to the target Fanpage
        - append to ledger WITH campaignId
        - notify CEO: "Đã đăng bài k/N — <fanpage link>"
```

### Component 1 — Frozen, pre-approved schedule (the only real code change)

Extend the schedule object and `/api/fb/schedule/create` ([fb-schedule.js:1214-1316](../../../electron/lib/fb-schedule.js)) with optional fields:

- `imagePath` — absolute path to a pre-rendered, frozen banner. When present, `prompt` is **not required** and the generate phase is skipped.
- `campaignId` — string grouping the posts of one campaign.
- `postIndex`, `postTotal` — the authoritative position in the campaign.

Behavior:
- **Validation:** require `prompt` OR `imagePath` (not neither). If `imagePath` is set, verify the file exists at create time; reject with a clear error if missing.
- **Generate phase** (`handleGenerate`): if `imagePath` is set, skip `imageGen` entirely — create the pending with `imagePath` already filled and status ready-to-publish; do **not** send a fire-time preview/heads-up (the campaign was pre-approved). This is also the Bug B fix: a frozen path is reused verbatim, never regenerated.
- **Publish phase** (`_publishPendingImpl`): unchanged except it now posts the frozen image and, on success, sends the post-then-notify line including `postIndex/postTotal` and the Fanpage URL.
- **Ledger** (`appendFbPostHistory`, [fb-schedule.js:70-92](../../../electron/lib/fb-schedule.js)): the record already includes `campaignId` (line 80, `schedule?.campaignId || pending.campaignId`) but **not** `postIndex/postTotal` — those must be **added to the record shape**, sourced from the pending first (`pending.postIndex ?? schedule?.postIndex`, same for total). This matters because a one-time schedule is auto-deleted by publish time, so `appendFbPostHistory(pending, schedule)` is frequently called with `schedule == null`.

Because of that auto-delete, the new fields **must propagate into the pending object** ([fb-schedule.js:443-458](../../../electron/lib/fb-schedule.js)) at generate time — not just live on the schedule — so `campaignId`, `postIndex`, and `postTotal` survive into the ledger even when the schedule is gone. The post stays fully self-sufficient.

### Component 2 — Campaign skill (the plan layer)

New `skills/marketing/facebook-campaign.md`, referenced from AGENTS.md:
- Build the full plan from the CEO brief: for each post, decide date, time, caption (**with the correct `bài k/N` from the plan, never invented**), and banner.
- Generate **all** banners up front via the existing image API and store them in a **durable** campaign-assets directory (survives the multi-day gap until each post fires) — not a temp/scratch dir.
- Write **one** review artifact to the workspace (a `.md` under e.g. `content-pack/fb-campaign-<id>.md`) listing every post: index/total, date/time, caption, banner image path. Reply to CEO with a short summary + the file path (per the "no 20-message dump" rule).
- On CEO approval, generate a single `campaignId` and loop `/api/fb/schedule/create` once per post with: `postDate`, `postTime`, `caption`, `targetPageId`, `imagePath` (frozen), `autoPost:true`, `campaignId`, `postIndex`, `postTotal`. Report which posts were created (and any that failed) in one final message.
- Campaign status reports filter the ledger (`/api/fb/schedule/history`) by `campaignId` and reconcile against `/api/fb/schedule/list` (pending), per the existing v2.4.11 reconciliation rule.

AGENTS.md: route "đăng chiến dịch / loạt N bài" to this campaign flow instead of per-post ad-hoc posting; bump `CURRENT_AGENTS_MD_VERSION` + the stamp so installs refresh.

### Component 3 — Bug A safety net for one-off posts (per "gộp")

Make per-post approval discovery read the durable pending files instead of requiring a live schedule:
- `collectActive()` — enumerate pending files on disk via the existing `listPendingForDate(date)` ([fb-schedule.js:356](../../../electron/lib/fb-schedule.js)) across the date window, filter to active status (`pending`/`approved`/`regenerating`), dedup by scheduleId (today wins). Enrich with the schedule if it still exists (for `label`), else use a stored fallback `label`.
- `resolve(specificId)` — load the pending by id+date; drop the `&& schedule` requirement (line 1699). Return `{found:{pending, schedule: schedule||null, date}}`.
- Response/disambiguation strings fall back to `pending.label || pending.scheduleId` when the schedule is gone.
- Store `label` on the pending at generate time so orphaned pendings still read well.

`approvePending` already publishes from the pending when the schedule is missing ([fb-schedule.js:971-982](../../../electron/lib/fb-schedule.js)), so no change is needed there.

## Data model

Schedule (and its derived pending) gains: `imagePath?`, `campaignId?`, `postIndex?`, `postTotal?`, and (pending only) a stored `label`. All optional and backward-compatible — existing schedules/pendings without them behave exactly as today.

## Error handling

- **Frozen image missing at post time** (file deleted/moved during the multi-day window) → skip that post, record a `skipped` ledger entry, notify CEO "bài k/N: ảnh không còn, cần tạo lại". Do not crash the run.
- **Machine off at post time** for a one-time job → existing behavior (missed generate/publish) + a "tạo lại nếu cần" notice; the frozen design makes re-creation a verbatim re-post.
- **Partial batch-create** → the agent reports exactly which posts were created and which failed; created jobs are independent and still fire.
- **`imagePath` set but file absent at create time** → reject create with a clear error (fail fast, before the campaign is half-built).
- All file/ledger writes stay best-effort + logged (match existing fb-schedule conventions); a ledger-append failure never blocks the actual post.

## Testing

- **Frozen schedule skips generate:** a schedule with `imagePath` set and no `prompt` → generate phase does not call image-gen, pending carries the exact `imagePath`, no fire-time preview is sent.
- **Frozen asset is never regenerated (Bug B):** after create with `imagePath`, the published image path equals the frozen path byte-for-byte.
- **Batch grouping (Bug C):** N schedules created with the same `campaignId` → ledger records all carry that `campaignId`; a status query filtered by `campaignId` returns the full N with correct published/pending split.
- **Numbering authoritative (Bug D):** captions created from a plan carry `bài k/N` matching `postIndex/postTotal`; nothing invents a different total.
- **One-off approval discovery (Bug A):** a pending whose schedule has been deleted is still surfaced by `collectActive()` and approved by "fb ok" → publishes from the pending; disambiguation list shows the fallback label.
- **Create validation:** create with neither `prompt` nor `imagePath` → 400; with `imagePath` pointing at a missing file → 400.
- **Post-then-notify:** a published campaign post sends exactly one CEO line containing `bài k/N` and the Fanpage URL.

Tests follow the repo convention: `electron/scripts/check-fb-*.js` style + additions to the existing FB checks, runnable under system node and wired into `npm run smoke`.

## Anti-features (left out on purpose)

- No ad-hoc/schedule channel unification.
- No fire-time preview for campaign posts (one up-front review only).
- No server-rendered caption templating — numbering comes from the plan the agent writes.
- No new durable store; reuse `fb-scheduled-posts.json`, `fb-pending/`, and `fb-post-history.jsonl`.

## Cross-cutting implementation notes (carried into the plan)

- **Cross-platform paths (HARD rule — Windows + macOS):** `imagePath` is an absolute path under `userData`, which differs per OS. Store and compare it consistently; normalize separators in the file-exists checks at create and post time. A campaign created on one machine is not expected to post from another, so absolute paths are acceptable — but the checks must not assume `/` vs `\`.
- **`collectActive()` dedup tie-break:** when the same `scheduleId` has an active pending on more than one date, "today wins" means: prefer `todayStr()`, then `tomorrowStr()`, then yesterday (the existing date-window order). Make this explicit so the numbered disambiguation list is stable.
- **AGENTS.md deploy:** the campaign routing + skill reference only reach installed bots if `CURRENT_AGENTS_MD_VERSION` (electron/lib/workspace.js) **and** the line-1 stamp are bumped together. List this as its own plan task so it is not dropped.

## Open items to confirm during planning

- Exact durable directory for frozen campaign banners (verify the image API's output location is persistent, or copy into a `fb-campaign-assets/<campaignId>/` dir).
- Whether to add a thin `/api/fb/campaign/create` batch endpoint vs. the agent looping `/api/fb/schedule/create` (default: loop — no new endpoint, smaller surface).
