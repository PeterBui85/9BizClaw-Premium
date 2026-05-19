# Multi-Zalo Account Support — Design Spec

**Date:** 2026-05-18
**Status:** Draft
**Author:** Peter Bui + Claude

## Problem

MODOROClaw currently supports exactly one Zalo account. CEO needs 4-8 simultaneous accounts for: multiple businesses (each with own Zalo), staff members with their own Zalo, and personal/business separation. Each account requires its own AI personality, memory, knowledge base, and rules.

## Architecture: Orchestrator + Workers

One master Electron process manages N worker processes. Each worker is an isolated openclaw gateway with its own openzca listener. All workers share a single 9router AI backend (with round-robin across ChatGPT Plus accounts for parallelism).

```
Electron Master (dashboard + orchestrator)
  |
  +-- 9router (shared, 1 process, round-robin ChatGPT pool)
  |
  +-- Worker: biz-1
  |     +-- openclaw gateway (:18789)
  |     +-- openzca listener (profile: biz-1)
  |     +-- workspace: workers/biz-1/
  |
  +-- Worker: biz-2
  |     +-- openclaw gateway (:18790)
  |     +-- openzca listener (profile: biz-2)
  |     +-- workspace: workers/biz-2/
  |
  +-- Worker: personal
        +-- openclaw gateway (:18791)
        +-- openzca listener (profile: personal)
        +-- workspace: workers/personal/
```

### Why shared 9router works

9router's Node.js async I/O handles concurrent requests without blocking. The upstream bottleneck (ChatGPT Plus serialization) is solved by 9router's built-in round-robin across multiple ChatGPT accounts. N Plus accounts = N-way parallelism.

Workers hit `localhost:20128` and don't know or care about the pool.

## Directory Structure

```
%APPDATA%/modoro-claw/
  accounts.json              # worker registry
  shared/
    9router/                 # shared AI backend
  workers/
    biz-1/
      openclaw.json          # per-account gateway config
      AGENTS.md              # per-account personality + rules
      memory/
        zalo-users/
        zalo-groups/
      knowledge/
        cong-ty/
        san-pham/
        nhan-vien/
      logs/
      cron/
      extensions/
        modoro-zalo/
          src/inbound.ts     # per-account patches (blocklist, dedup, etc.)
    biz-2/
      ...
    personal/
      ...
  vendor/                    # shared Node.js + npm packages (read-only)
```

### accounts.json

```json
{
  "workers": [
    {
      "id": "biz-1",
      "label": "9Biz Solutions",
      "port": 18789,
      "openzcaProfile": "biz-1",
      "enabled": true,
      "createdAt": "2026-05-18T10:00:00Z"
    }
  ]
}
```

Port allocation: each worker's port is stored explicitly in `accounts.json` (not computed from index). On account creation, `allocatePort(base=18789)` scans existing workers' ports + probes with `net.createServer().listen(port)` to verify availability. If port is taken (EADDRINUSE), increment and retry up to 20 attempts. Port persists across restarts — never changes once assigned.

**Hard limit: 8 accounts max.** Enforced at account creation (`accounts.json` write rejects if `workers.length >= 8`). Rationale: 8 workers = ~940MB RAM + 8 gateway processes + 8 openzca listeners. Beyond this, resource pressure degrades all accounts. The limit is a constant, adjustable in a future version if demand justifies it.

## Per-Worker Isolation

### Isolated per worker:
- `openclaw.json` (gateway config, channel settings)
- `AGENTS.md` (personality, rules, tone)
- `zalo-blocklist.json` / `zalo-allowlist.json` (access control)
- `memory/zalo-users/` and `memory/zalo-groups/` (conversation history)
- `knowledge/` (document store)
- `custom-crons.json` (scheduled tasks)
- `escalation-queue.jsonl` (escalation tracking)
- `extensions/modoro-zalo/` (patched plugin copy)

### Shared across all workers:
- `vendor/` (Node.js + npm packages, read-only after initial install. Runtime-installer acquires a file lock `vendor/.install-lock` during updates; workers check lock before loading modules and wait up to 30s if locked.)
- 9router process + config (master monitors 9router health every 30s; auto-restart on crash with backoff. All workers lose AI temporarily during restart but recover automatically.)
- License (`%APPDATA%/9bizclaw/license.json`)
- Telegram channel (CEO receives alerts from ALL workers, tagged by account)

### Cron API ownership:
The Cron API (port 20200) is owned by the **master process**, not by individual workers. Master holds the single auth token and routes cron operations to the correct worker's `custom-crons.json` based on the `workerId` field in API requests. Workers do not bind port 20200.

## Worker Lifecycle

### Boot sequence:
1. Master starts 9router (shared)
2. Master reads `accounts.json`
3. For each enabled worker: `spawnWorker(account)` spawns openclaw gateway + openzca listener with isolated workspace
4. Dashboard connects to all workers for status

### Adding a new account:
1. CEO clicks "Add Zalo Account" in Dashboard
2. Master creates workspace (`workers/<id>/`) with template AGENTS.md, empty memory/knowledge
3. Master spawns openzca in QR-scan mode for the new profile
4. CEO scans QR — openzca writes session to `~/.openzca/profiles/<id>/`
5. Master starts the worker's gateway
6. Account appears in Dashboard

### Stopping/removing:
- Disable: stop gateway + listener, keep workspace
- Remove: stop + archive to `workers/.archived/<id>/`

### Crash recovery:
- Worker crash detected via process exit event
- Auto-restart with exponential backoff
- One worker crash does NOT affect others

## Patch Injection

Each worker gets its own `extensions/modoro-zalo/` directory. Existing patch functions (`ensureZaloBlocklistFix`, `ensureZaloSystemMsgFix`, `ensureZaloSenderDedupFix`, output filter, etc.) are parameterized to receive the worker's extension path instead of the global one.

Refactor: `ensureZaloBlocklistFix()` -> `ensureZaloBlocklistFix(workerPath)`

**Plugin copy safety:** `applyOpenzaloFork(workerPath)` copies from `packages/modoro-zalo/` source to the worker's `extensions/` dir. This runs **sequentially during master boot** (before any worker is spawned), not in parallel. Workers are only started after all patches are applied. Runtime-installer updates to `packages/` only happen on explicit app update (not during normal boot), so there is no concurrent write risk during steady-state operation.

## Health Monitoring

- Per-worker `isGatewayAlive(port, timeout=8000)` probes
- Per-profile `probeZaloReady(profileId)` checks listener PID
- Dashboard shows per-worker status with independent dots
- Boot phase fast polling per worker: [500, 3000, 6000, 10000, 15000, 20000, 25000, 30000]ms then 45s steady-state

## Escalation Routing

All workers funnel escalations to CEO's Telegram. Alert includes account label:

```
[biz-1] Khach Nguyen Van A can ho tro — de em bao sep
```

`sendCeoAlert(text, accountLabel)` prepends `[label]` to the message.

**Alert rate limiting:** `sendCeoAlert` is throttled to max 1 message per worker per 60s (per-worker token bucket). Boot pings are coalesced: instead of N boot pings, master sends one summary message: "MODOROClaw da san sang — 4/4 accounts online". Escalation alerts bypass throttle (always delivered immediately).

## Dashboard UI

### Sidebar layout:
```
Overview
---
Accounts
  * biz-1
  * biz-2
  o personal
---
Telegram
9Router
OpenClaw
Settings
```

### Account Overview page (landing):
All workers at a glance — status dot, message count today, active crons, last activity. One card per account. "Add Account" button.

### Per-account view (click account):
Sub-tabs: [Zalo] [Memory] [Knowledge] [Cron]
Reuses existing single-account pages, scoped to the worker's workspace.

### Single-account compatibility:
If `accounts.json` has exactly 1 worker, Dashboard shows current single-account layout without account switcher.

## Migration: Single -> Multi

**Strategy: copy-then-flag (atomic enough, reversible).**

1. Auto-detect existing workspace on first launch of multi-account version (presence of `openclaw.json` at root without `accounts.json`)
2. Create `workers/default/` directory
3. **Copy** (not move) workspace files into `workers/default/` — openclaw.json, AGENTS.md, memory/, knowledge/, custom-crons.json, escalation-queue.jsonl, extensions/
4. Write `accounts.json` with single "default" entry pointing to `~/.openzca/profiles/default/`
5. Write `migration-v1.json` manifest: `{ files: [...copied], timestamp, status: "complete" }`
6. Only after step 5 succeeds: rename old root files to `*.pre-multi-account` (not delete)

**Rollback:** If migration crashes mid-copy (disk full, permission error): no `migration-v1.json` exists, no `accounts.json` exists. Next launch re-detects as single-account and retries. Old files are untouched (copy, not move). If user wants to manually revert: delete `workers/` + `accounts.json`, rename `*.pre-multi-account` back.

**openzca profile lifecycle:** Profiles live at `~/.openzca/profiles/<id>/`. On account removal, master moves the profile to `~/.openzca/profiles/.archived/<id>/` alongside the worker workspace archival. Two workers cannot reference the same `openzcaProfile` — `accounts.json` write validates uniqueness.

## Resource Usage

| Config | RAM estimate |
|--------|-------------|
| 1 account (current) | ~300MB |
| 4 accounts | ~540MB (300 base + 3 x 80MB) |
| 8 accounts | ~860MB (300 base + 7 x 80MB) |

Each additional worker adds ~80MB (gateway process + openzca listener). 9router shared saves ~150MB per worker vs separate instances. These are estimates based on single-account profiling — actual usage scales with group count and message volume per account. Monitor with `process.memoryUsage()` per worker during testing; budget 2x for safety on 8-account deployments.

## Out of Scope

- Per-account Telegram channels (CEO has one Telegram, receives all alerts)
- Per-account 9router instances (shared is sufficient with round-robin)
- Web-based multi-tenant management (this is a desktop app)
- Cross-account message routing (accounts are fully isolated)

## Success Criteria

1. 4 Zalo accounts receive messages simultaneously, all reply within 10s (parallel)
2. Each account has distinct AGENTS.md personality — verified by tone difference in replies
3. Memory isolation — customer A in biz-1 has no memory bleed to biz-2
4. One worker crash does not affect other workers
5. Dashboard shows per-account status, all green within 30s of boot
6. Existing single-account users upgrade with zero manual migration
