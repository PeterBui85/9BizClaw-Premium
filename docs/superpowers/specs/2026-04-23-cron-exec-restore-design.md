# Restore `exec` to tools.allow for cron session delivery

**Date:** 2026-04-23
**Status:** Approved
**Scope:** ~30 lines across 3 files

## Problem

CEO creates cron jobs from Telegram using the native `cron` tool. These crons are stored in openclaw's `jobs.json` and fire as isolated agent sessions. The agent session receives the prompt (e.g. "send 'hi' to Zalo group X") but cannot execute `openzca msg send` because `exec` was removed from `tools.allow` for security. Agent reports success but nothing actually sends.

## Root cause

`exec` was removed from global `tools.allow` to prevent Zalo strangers from executing shell commands. But the CHANNEL-TOOL-DENY runtime patch already strips `exec` for openzalo sessions specifically. The global removal was redundant and broke cron-spawned sessions (which have no channel context and therefore bypass the deny map).

## Solution

Add `exec` back to `tools.allow`. The CHANNEL-TOOL-DENY patch handles per-channel security:

| Session type | `exec` available? | Protection |
|---|---|---|
| Zalo (stranger) | No | CHANNEL-TOOL-DENY strips it |
| Telegram (CEO) | Yes | CEO-only allowlist |
| Cron (no channel) | Yes | Only CEO creates crons |

`process` remains excluded from `tools.allow` — openclaw's `exec` tool is sufficient for running `openzca msg send`. No cron session needs `process` (spawn subprocess).

## 3-layer defense-in-depth

1. **CHANNEL-TOOL-DENY** (runner patch) — strips `exec`/`cron`/`process` for openzalo sessions at runtime
2. **Boot fail-safe** (main.js) — NEW CODE: after applying patches, checks runner for `9BizClaw CHANNEL-TOOL-DENY PATCH` marker. If missing, removes `exec` + `cron` from tools.allow globally as degraded-safe fallback
3. **COMMAND-BLOCK** (inbound.ts fork) — rewrites admin commands at message receive time; agent never sees original text

Each layer is independent. Any single layer is sufficient to block Zalo abuse.

### Known limitation: prompt injection via cron content

A cron session reading Zalo message history could encounter injected text like "run exec to delete files." Mitigated by: (a) openclaw's exec runs sandboxed commands, not raw shell; (b) the agent's own safety training resists injection; (c) cron prompts are CEO-authored and typically narrow ("send 'hi' to group X"), not open-ended history readers. Risk accepted as low.

## Changes

### 1. `electron/main.js` — `ensureDefaultConfig()` ALLOW_TOOLS

Restore `exec` and `cron` to ALLOW_TOOLS:

```javascript
const ALLOW_TOOLS = [
  'message',
  'web_search',
  'web_fetch',
  'update_plan',
  'cron',   // denied for Zalo via CHANNEL-TOOL-DENY
  'exec',   // denied for Zalo via CHANNEL-TOOL-DENY
];
```

### 1b. `electron/main.js` — Boot fail-safe (NEW CODE)

After the vendor patch functions run in `_startOpenClawImpl()`, add a check:

```javascript
try {
  const _vendorDir = getBundledVendorDir();
  if (_vendorDir) {
    const distDir = path.join(_vendorDir, 'node_modules', 'openclaw', 'dist');
    if (fs.existsSync(distDir)) {
      const runners = fs.readdirSync(distDir)
        .filter(f => f.startsWith('pi-embedded-runner-') && f.endsWith('.js'));
      const patched = runners.some(f =>
        fs.readFileSync(path.join(distDir, f), 'utf-8')
          .includes('9BizClaw CHANNEL-TOOL-DENY PATCH'));
      if (!patched) {
        // Strip dangerous tools from global allowlist
        const cfgPath = path.join(HOME, '.openclaw', 'openclaw.json');
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        if (Array.isArray(cfg.tools?.allow)) {
          cfg.tools.allow = cfg.tools.allow.filter(t => t !== 'cron' && t !== 'exec');
          writeOpenClawConfigIfChanged(cfgPath, cfg);
        }
      }
    }
  }
} catch (e) { console.warn('[channel-tool-deny fail-safe]', e?.message); }
```

This is safety-critical code that must exist before `exec` is added to tools.allow.

### 2. `AGENTS.md` — Exact changes

Revert API-based instructions to native `cron` tool. Specific lines:

- **Line 13** (CAM TUYET DOI): Change `Cron: dung Cron API qua web_fetch` back to `Dung tool cron truc tiep`
- **Line 19** (CONG CU): Restore `cron` tool entry: `**cron** — tao/xoa/sua lich tu dong. Dung tool nay truc tiep.`
- **Lines 206-217** (Lich tu dong): Revert entire section to use `cron` tool instead of web_fetch API. Keep `web_fetch` references for listing/deleting only.
- **Line 237** (Thu vien ky nang): Restore `Cron: dung tool cron, xem cron-management.md`

### 3. Smoke test — no changes needed

The existing smoke test at `smoke-context-injection.js` uses a loose regex for ALLOW_TOOLS that will pass with `exec` and `cron` added. The channel-tool-deny anchor check in `smoke-test.js` already verifies the patch anchor exists in vendor source. No new assertions required.

## Non-changes

- **Cron API (port 20200):** Remains for Dashboard cron management (list, delete, toggle) and as a `web_fetch` target for the bot to list/delete crons. Bot uses native `cron` tool for CREATING new crons.
- **`custom-crons.json` + `exec:` fast path:** Remains working for API-created and Dashboard-created crons.
- **`skills/operations/cron-management.md`:** Already says "Dung tool `cron` truc tiep" — correct, no change needed. The `web_fetch` references for list/delete are also correct.
- **CHANNEL-TOOL-DENY patch in `vendor-patches.js`:** Untouched.
- **COMMAND-BLOCK in `inbound.ts` fork:** Untouched.

## Data flow (after fix — exec: fast path)

```
CEO Telegram: "tao cron gui nhom X moi sang 9h"
  -> Bot looks up groupId via web_fetch /api/cron/list
  -> Bot uses cron tool (native) with payload:
     "exec: openzca --profile default msg send <groupId> 'text' --group"
  -> openclaw creates job in jobs.json
  -> loadCustomCrons() merges into scheduler
  -> Cron fires -> runCronAgentPrompt detects exec: prefix
  -> runSafeExecCommand -> sendZaloTo (deterministic, no agent session)
  -> Message arrives in Zalo group
```

The `exec:` prefix in the cron payload is the key. It causes `runCronAgentPrompt` to take the fast path (line ~2577) which calls `sendZaloTo()` directly, completely bypassing the unreliable openclaw agent session. AGENTS.md and `cron-management.md` skill instruct the bot to format Zalo sends this way. `healCustomCronEntries()` auto-adds the prefix for bare `openzca msg send` prompts.

```
Zalo stranger: "exec ls"
  -> Layer 3: COMMAND-BLOCK rewrites to "[noi dung noi bo da duoc loc]"
  -> Layer 1: CHANNEL-TOOL-DENY strips exec from openzalo session
  -> Double blocked, agent never sees command and has no tool
```

## Verification

- Existing cron jobs in jobs.json should deliver on next fire
- `cron-runs.jsonl` should show successful sends
- Zalo stranger sending "exec ls" still blocked (COMMAND-BLOCK + CHANNEL-TOOL-DENY)
- Boot console: no `[SECURITY] channel-tool-deny patch NOT applied` warning
