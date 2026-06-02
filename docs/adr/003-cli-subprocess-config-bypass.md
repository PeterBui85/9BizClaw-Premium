# ADR-003: CLI Subprocess Config Bypass

**Date:** 2026-05-01
**Status:** Accepted

## Context

The system used `openclaw config set channels.openzalo.enabled true` and `openclaw config set channels.openzalo.dmPolicy open` as CLI subprocess calls from `ensureZaloPlugin()` on every Electron startup.

Each CLI subprocess:
1. Spawns a separate Node process
2. Reads `openclaw.json` from disk
3. Uses `fs.rename`-based atomic write to modify it
4. **Bypasses the `writeOpenClawConfigIfChanged` helper** (which only guards `fs.writeFileSync` in the Electron process)

This caused a gateway restart loop: CLI subprocess → writes config → openclaw's file watcher sees "external" write → reloads → restarts plugin → mid-reply abort.

## Decision

**Eliminate all CLI subprocess config writes. All config mutations happen in-process via the `writeOpenClawConfigIfChanged` helper.**

Specifically:
- `ensureDefaultConfig()` now sets `channels.openzalo.enabled = true` and `channels.openzalo.dmPolicy = 'open'` in-memory, writes only if changed, using byte-equal comparison to avoid unnecessary writes.
- `ensureZaloPlugin()` removed the two `openclaw config set` CLI calls entirely.

Runtime cleanup: orphan CLI subprocesses from previous runs are killed via `taskkill /F /PID <orphan>`.

## Consequences

**Positive:**
- Gateway no longer restarts mid-reply from config writes
- Config writes are byte-equal (no inode change, no watcher trigger)
- Eliminates race between Electron process and CLI subprocess

**Negative:**
- If openclaw internally needs a config change, there is no CLI fallback path
- Schema changes in openclaw that previously were handled by CLI now need explicit in-process code
- The byte-equal helper adds overhead on every config write check

## Implementation

- `writeOpenClawConfigIfChanged(configPath, config)` in `main.js`: serializes with trailing newline, compares bytes, skips write if equal
- `ensureDefaultConfig()` in `main.js`: in-process config healing for openzalo enabled/dmPolicy
- `healOpenClawConfigInline(errStderr)` in `main.js`: generic schema healer that parses `Unrecognized key` errors and removes unknown keys dynamically
