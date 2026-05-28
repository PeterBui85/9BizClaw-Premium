# 9BizClaw Free Build — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Create a separate Free EXE by stripping premium features from the main build. No encryption, no server, no freemium gating logic. Just remove the code and tabs.

**Architecture:** Fork from `main` into `free` branch. Delete premium modules + UI tabs. Ship as separate EXE with different product name/appId.

---

## What to strip

| Remove | Files/UI | Why |
|--------|----------|-----|
| Facebook | `electron/lib/fb-schedule.js`, `fb-publisher.js`, Dashboard Facebook tab, `skills/marketing/facebook-post-workflow.md` | Premium only |
| Google Workspace | `electron/lib/google-api.js`, `google-routes.js`, Dashboard Google tab, `skills/operations/google-workspace.md` | Premium only |
| Brain graph | `electron/lib/brain-graph.js`, `brain-layout-worker.js`, Dashboard Brain rail, `graphology` deps | Premium only |
| Appointments | `electron/lib/appointments.js`, Dashboard appointments UI | Premium only |
| License system | `electron/lib/license.js`, `electron/ui/license.html`, license check in `main.js` | No license needed |

## What to KEEP

| Keep | Why |
|------|-----|
| Telegram bot | Core free feature |
| Zalo bot (DM + groups) | Core free feature |
| AI agent (9Router/ChatGPT) | Core free feature |
| Cron jobs | Core free feature |
| Knowledge documents | Core free feature |
| Persona/personality | Core free feature |
| Chat tab | Core free feature |
| Backup/restore | Core free feature |
| ChatGPT session import | Needed for AI setup |
| Output filter + security | Always needed |
| All skills (except FB/Google/Brain specific) | Core free feature |

---

## Task 1: Create `free` branch

- [ ] `git checkout -b free main`
- [ ] Change `package.json`: `"name": "9bizclaw-free"`, `"productName": "9BizClaw Free"`
- [ ] Change `build.appId`: `"vn.9biz.claw.free"` (separate install, won't conflict with premium)
- [ ] Remove `"membership": true` if present

---

## Task 2: Remove premium modules

- [ ] Delete `electron/lib/fb-schedule.js`
- [ ] Delete `electron/lib/fb-publisher.js`
- [ ] Delete `electron/lib/google-api.js`
- [ ] Delete `electron/lib/google-routes.js`
- [ ] Delete `electron/lib/brain-graph.js`
- [ ] Delete `electron/lib/brain-layout-worker.js`
- [ ] Delete `electron/lib/appointments.js`
- [ ] Delete `electron/lib/license.js`
- [ ] Delete `electron/lib/license-public.pem`
- [ ] Delete `electron/ui/license.html`

---

## Task 3: Fix imports that reference deleted modules

Every `require()` of a deleted module must be removed or stubbed. Check each:

### `electron/main.js`
- [ ] Remove `require('./lib/appointments')` (line ~152) and all `_appointments.*` calls
- [ ] Remove `require('./lib/fb-schedule')` (line ~203) and all `fbSchedule.*` calls
- [ ] Remove license check block in `createWindow` (tier detection)
- [ ] Remove license revalidation interval
- [ ] Remove `brain-graph` require in setTimeout
- [ ] Remove `google-api.cleanupGogProcesses()` in before-quit
- [ ] Remove `startAppointmentDispatcher()` call
- [ ] Remove `cleanupAppointmentTimers()` call

### `electron/lib/dashboard-ipc.js`
- [ ] Remove `require('./appointments')` and all appointment IPC handlers
- [ ] Remove `require('./fb-schedule')` / `require('./fb-publisher')` lazy requires in FB IPC handlers
- [ ] Remove `require('./google-api')` / `require('./google-routes')` lazy requires in Google IPC handlers
- [ ] Remove `require('./brain-graph')` lazy require in brain IPC handler
- [ ] Remove `require('./license')` and license IPC handlers (activate, deactivate, get-status)
- [ ] Remove all FB schedule IPC handlers (get-fb-schedules, delete-fb-schedule, save-fb-config, verify-fb-token, get-fb-recent-posts)
- [ ] Remove all Google IPC handlers
- [ ] Remove brain-graph rebuild handler
- [ ] Remove appointment IPC handlers (list, create, update, delete)

### `electron/lib/cron.js`
- [ ] Remove `require('./fb-schedule')` (line ~16) and FB cron registration block
- [ ] Keep all other crons (morning, evening, custom, heartbeat, etc.)

### `electron/lib/cron-api.js`
- [ ] Remove `require('./fb-schedule')` (line ~11)
- [ ] Remove `require('./google-routes')` (line ~127)
- [ ] Remove `/api/google/*` route handling
- [ ] Remove `/api/fb/*` route handling
- [ ] Remove `require('./fb-publisher')` lazy requires
- [ ] Keep all other routes (zalo, file, workspace, cron, exec, etc.)

### `electron/lib/config.js`
- [ ] Remove license-related config in `ensureDefaultConfig`
- [ ] Remove Facebook channel config healing
- [ ] Remove Google channel config
- [ ] Keep Telegram + Zalo config

### `electron/lib/channels.js`
- [ ] Check for any FB/Google references — likely none (channels.js handles Telegram + Zalo only)

### `electron/lib/backup.js`
- [ ] Remove FB/Google/Brain/Appointments from backup collector manifest (if referenced)

---

## Task 4: Remove premium tabs from Dashboard

### `electron/ui/dashboard.html`
- [ ] Remove `brain` rail item from sidebar
- [ ] Remove `facebook` and `google` from `RAIL_GROUPS.channels.tabs` and `.pages`
- [ ] Remove `page-facebook` HTML section
- [ ] Remove `page-brain` HTML section
- [ ] Remove any Google-specific page sections
- [ ] Remove any appointment-related UI
- [ ] Remove FB schedule display in cron list
- [ ] Remove `loadFacebookTab()` JS function
- [ ] Remove `loadBrainTab()` / brain graph JS
- [ ] Remove Google-related JS functions
- [ ] Keep: Overview, Chat, Kênh (Telegram + Zalo only), Nội dung, Cấu hình

### `electron/ui/wizard.html`
- [ ] Remove Facebook setup step (if any)
- [ ] Remove Google setup step (if any)
- [ ] Keep: Telegram, AI (9Router/ChatGPT), Zalo, Business profile, Persona

---

## Task 5: Remove premium skills

- [ ] Delete `skills/marketing/facebook-post-workflow.md`
- [ ] Delete `skills/operations/google-workspace.md`
- [ ] Remove FB/Google triggers from AGENTS.md routing table
- [ ] Keep all other skills

---

## Task 6: Remove premium dependencies (optional, reduces EXE size)

- [ ] Check if `graphology` and `graphology-layout-forceatlas2` are only used by brain-graph
- [ ] If yes, `npm uninstall graphology graphology-layout-forceatlas2`
- [ ] Check for any other deps only used by deleted modules

---

## Task 7: Update smoke tests

- [ ] Update `scripts/check-module-contracts.js` — remove deleted modules from expected list
- [ ] Update `scripts/smoke-test.js` — remove FB/Google/Brain/Appointments assertions
- [ ] Update guard scripts that reference deleted files
- [ ] Run `npm run smoke` — must pass with 0 failures

---

## Task 8: Build + Test

- [ ] `node scripts/generate-system-map.js`
- [ ] `npm run smoke` — 0 failures
- [ ] `npm run build:win` — produces `9BizClaw Free Setup X.Y.Z.exe`
- [ ] Install on clean machine
- [ ] Verify: Telegram works, Zalo works, AI works, Cron works, Knowledge works
- [ ] Verify: No Facebook/Google/Brain tabs visible
- [ ] Verify: No errors in main.log referencing deleted modules

---

## Build identity

| Field | Premium | Free |
|-------|---------|------|
| `name` | `9bizclaw` | `9bizclaw-free` |
| `productName` | `9BizClaw` | `9BizClaw Free` |
| `appId` | `vn.9biz.claw` | `vn.9biz.claw.free` |
| `APPDATA dir` | `9bizclaw` | `9bizclaw-free` |
| Installer name | `9BizClaw Setup X.Y.Z.exe` | `9BizClaw Free Setup X.Y.Z.exe` |

Different `appId` = can install side by side. Different APPDATA = no config conflicts.

---

## Notes

- No freemium branch code needed (no premium-loader, premium-session, encrypt-premium, tier-choice, proxy stubs)
- No Supabase dependency for free build
- AGENTS.md on free build should NOT mention Facebook/Google/Brain features
- Free build can share the same 9Router/ChatGPT account setup flow (including session import fallback)
