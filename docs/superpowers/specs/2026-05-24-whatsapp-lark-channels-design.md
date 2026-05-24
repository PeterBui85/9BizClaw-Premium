# WhatsApp + Lark Channel Integration — Design Spec

**Date:** 2026-05-24
**Status:** Approved
**Scope:** Dashboard UI for 2 new channels + shared inbound defense middleware + WhatsApp customer-grade security

---

## 1. Problem

9BizClaw supports Telegram + Zalo. Vietnamese SME customers also use WhatsApp (international clients) and Lark/Feishu (internal teams). OpenClaw 2026.4.14 ships both channel plugins. We need Dashboard UI to connect them and security middleware to protect customer-facing WhatsApp.

## 2. Goals

- CEO connects WhatsApp/Lark via Dashboard (QR scan, same as Zalo)
- WhatsApp has same security as Zalo (command block, output filter, dedup, system msg filter, escalation)
- Lark is internal-only (lighter security)
- Shared defense middleware serves WhatsApp now, replaces Zalo patches later
- No changes to existing Zalo inbound.ts patches (keep working as-is)

## 3. Non-Goals

- Migrate Zalo patches to shared middleware (future v3.0)
- WhatsApp Business API (Cloud API) — Baileys Web only for now
- Facebook Messenger channel
- Wizard changes

## 4. Architecture

```
Inbound message (any channel)
    |
    v
OpenClaw channel plugin (built-in routing)
    |
    v
[Zalo path]                    [WhatsApp/Lark path]
modoro-zalo fork               OpenClaw hooks system
inbound.ts patches             ~/.openclaw/hooks/inbound-defense/
(unchanged)                    handler calls lib/inbound-defense.js
    |                              |
    v                              v
Agent processes                Agent processes
    |                              |
    v                              v
send.ts patches                message_sending hook
(unchanged)                    outputFilter() from lib/inbound-defense.js
    |                              |
    v                              v
Reply sent                     Reply sent
```

### 4.1 Shared Inbound Defense Module

**File:** `electron/lib/inbound-defense.js`

Exports channel-agnostic defense functions. Each returns `{ action: 'pass' | 'drop', reason? }`.

```javascript
module.exports = {
  // Inbound filters (run before agent dispatch)
  filterSystemMessage(channel, msg),    // drop group join/leave/rename
  filterCommandInjection(channel, body), // rewrite admin commands
  filterDuplicateSender(channel, senderId, body), // 3s dedup window
  filterBotLoop(channel, body),         // 6-signal bot detection
  checkAllowlist(channel, senderId),    // per-channel allowlist

  // Outbound filters (run before send)
  filterOutput(channel, text),          // block CoT, process acks, sensitive paths

  // Lifecycle
  clearDedup(),                         // prune dedup map (called on interval)
};
```

**Channel-specific config:**

| Function | WhatsApp | Lark | Zalo (future) |
|----------|----------|------|---------------|
| systemMsgFilter | `messageStubType` enum (WhatsApp native) | Feishu event types | Vietnamese regex (existing) |
| commandBlock | Same 8 admin patterns as Zalo | Disabled (internal) | Same (existing patches) |
| senderDedup | 3s window, 500 entry cap | 3s window | Same (existing patch) |
| botLoopDetect | 6 signals | Disabled (internal) | Same (existing AGENTS.md) |
| allowlist | `whatsapp-allowlist.json` | None (open) | `zalo-allowlist.json` (existing) |
| outputFilter | Full 71 patterns | Light (API keys only) | Full (existing send.ts) |

### 4.2 OpenClaw Hook Integration

**Directory:** `~/.openclaw/hooks/inbound-defense/`

```
hooks/inbound-defense/
  HOOK.md          # frontmatter: events: [message:received, message_sending]
  handler.js       # loads lib/inbound-defense.js, calls filters, returns drop/pass
```

**handler.js** reads channel from hook context, calls defense functions, returns `{ cancel: true }` on drop. Installed by `ensureDefaultConfig()` on boot — copied from `electron/hooks/inbound-defense/` template.

### 4.3 WhatsApp System Message Detection

WhatsApp exposes `messageStubType` (numeric enum) for system events. No regex needed.

Key stub types to filter:
- 1: CHANGE_EJECTED (removed from group)
- 27: GROUP_PARTICIPANT_ADD
- 28: GROUP_PARTICIPANT_REMOVE
- 32: GROUP_CHANGE_SUBJECT (rename)
- 33: GROUP_CHANGE_ICON
- 34: GROUP_CHANGE_DESCRIPTION

### 4.4 Outbound Rate Limiting (WhatsApp only)

Install `baileys-antiban` as dependency. Wire via `wrapSocket()` in the WhatsApp plugin startup. Config:

```json
"channels.whatsapp.rateLimiting": {
  "enabled": true,
  "warmupDays": 7,
  "maxPerHour": 80,
  "typingDelayMs": [800, 2500]
}
```

Not in shared middleware — specific to Baileys socket layer.

### 4.5 Customer Memory

| Channel | Memory dir | Trim cap |
|---------|-----------|----------|
| WhatsApp | `memory/whatsapp-users/<phone>.md` | 50KB (same as Zalo) |
| WhatsApp groups | `memory/whatsapp-groups/<groupId>.md` | 50KB |
| Lark | None (internal, no per-user tracking) | N/A |

Memory write/trim uses existing `appendPerCustomerSummaries()` + `trimZaloMemoryFile()` pattern, parameterized by channel.

## 5. Dashboard UI

### 5.1 Channel Pages

Two new pages in Kênh tab sidebar, cloned from Telegram pattern:

**page-whatsapp:**
- Header: icon, title "WhatsApp", status pill (green/red/grey)
- Connection card: "Kết nối" button → spawns `openclaw channels login --channel whatsapp` → QR modal → scan → restart gateway
- Auto-install: first click runs `openclaw plugins install @openclaw/whatsapp` if not present
- Config card: dmPolicy dropdown (open/allowlist/pairing), pause/resume button
- Friends/contacts list (future — not v1)

**page-lark:**
- Header: icon, title "Lark", status pill
- Connection card: "Kết nối" → `openclaw channels login --channel feishu` → QR modal
- Config card: pause/resume only (no allowlist — internal)
- Simpler than WhatsApp (no security controls needed)

### 5.2 Status Probes

**`probeWhatsAppReady()`** — spawn `openclaw channels status --channel whatsapp --probe --json`, parse `ready` field. Fallback: check `~/.openclaw/oauth/whatsapp/default/creds.json` exists.

**`probeLarkReady()`** — spawn `openclaw channels status --channel feishu --probe --json`. Fallback: check feishu config in openclaw.json `channels.feishu.enabled === true`.

Both registered in `startChannelStatusBroadcast()` for live status dots.

### 5.3 IPC Handlers (per channel)

| IPC | WhatsApp | Lark |
|-----|----------|------|
| `check-{ch}-ready` | probe | probe |
| `connect-{ch}` | login + QR flow | login + QR flow |
| `disconnect-{ch}` | remove session | remove session |
| `get-{ch}-config` | read openclaw.json | read openclaw.json |
| `save-{ch}-config` | write dmPolicy etc | write enabled |
| `pause-{ch}` | file-based | file-based |
| `resume-{ch}` | file-based | file-based |
| `get-{ch}-pause-status` | read file | read file |

Total: 8 IPC handlers per channel = 16 new handlers.

### 5.4 Preload Bridges

8 bridges per channel = 16 new bridges. Naming: `checkWhatsAppReady()`, `connectWhatsApp()`, etc.

## 6. Config Changes

### ensureDefaultConfig() additions

```javascript
// WhatsApp — only if plugin installed
if (pluginInstalled('@openclaw/whatsapp')) {
  if (!config.channels.whatsapp) config.channels.whatsapp = {};
  const wa = config.channels.whatsapp;
  if (wa.enabled === undefined) { wa.enabled = false; changed = true; }
  if (!wa.dmPolicy) { wa.dmPolicy = 'pairing'; changed = true; }
  if (!wa.allowFrom) { wa.allowFrom = []; changed = true; }
}

// Feishu/Lark — built-in, always available
if (!config.channels.feishu) config.channels.feishu = {};
const feishu = config.channels.feishu;
if (feishu.enabled === undefined) { feishu.enabled = false; changed = true; }
```

### AGENTS.md additions

Add WhatsApp to security routing table:
```
**WhatsApp = CSKH** (same as Zalo). Command-block, output filter, allowlist. Memory per customer.
**Lark = Nội bộ.** Full quyền như CEO Telegram.
```

## 7. Dependencies

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `@openclaw/whatsapp` | WhatsApp Baileys plugin | 85KB | Apache 2.0 |
| `baileys-antiban` | Outbound rate limiting | ~15KB | MIT |
| Feishu | Built-in openclaw | 0 (included) | N/A |

WhatsApp plugin installed on first connect via `openclaw plugins install`. Not bundled in EXE.

## 8. File Changes Summary

| File | Changes |
|------|---------|
| `electron/lib/inbound-defense.js` | NEW — shared defense middleware |
| `electron/hooks/inbound-defense/HOOK.md` | NEW — openclaw hook definition |
| `electron/hooks/inbound-defense/handler.js` | NEW — hook handler |
| `electron/lib/channels.js` | Add `probeWhatsAppReady()`, `probeLarkReady()`, register in broadcast |
| `electron/lib/config.js` | Add WhatsApp + Feishu to `ensureDefaultConfig()` |
| `electron/lib/dashboard-ipc.js` | Add 16 IPC handlers |
| `electron/preload.js` | Add 16 bridges |
| `electron/ui/dashboard.html` | Add 2 page divs, 2 RAIL_GROUPS entries, QR modal, JS handlers |
| `AGENTS.md` | Add WhatsApp/Lark channel security rules |
| `electron/lib/workspace.js` | Seed `memory/whatsapp-users/`, `memory/whatsapp-groups/` |

## 9. Testing

- Smoke: module load, IPC parity check (existing), hook file exists
- Manual: connect WhatsApp via QR → send message → bot replies → verify defense filters
- Manual: connect Lark via QR → send message → bot replies (no command block)
- Security: WhatsApp customer sends "tạo cron" → command blocked
- Security: WhatsApp bot reply contains file path → output filter blocks

## 10. Risks

| Risk | Mitigation |
|------|-----------|
| WhatsApp ban from aggressive sending | `baileys-antiban` rate limiter + warm-up ramp. Pin exact version, verify source, vendor the ~15KB package. npm audit in CI. |
| OpenClaw hook system undocumented | **Primary: spike test first.** Run `openclaw hooks list` + create test hook before committing. If hooks don't work → fallback to WhatsApp plugin fork (same pattern as modoro-zalo). |
| QR flow doesn't work in Electron modal | Fallback: show instructions to run CLI in terminal |
| Feishu requires enterprise admin approval | Document in setup guide — CEO needs Feishu admin access |
| Probe CLI may not exist | `openclaw channels status --probe` may not be in 2026.4.14. Primary probe: check config `channels.whatsapp.enabled` + session file existence + gateway WS connection status. |
| Phone number normalization | WhatsApp uses E.164 (`+84xxx`). Memory filenames must normalize to E.164 to prevent duplicates (`+84` vs `84` vs `0`). |
| Disconnect cleanup | WhatsApp: delete `creds.json` + call Baileys logout + disable config. Lark: revoke token + disable config. Gateway queued replies for disconnected channel → drop with warning log. |

### 10.1 Implementation Prerequisites

Before starting implementation:
1. **Spike: OpenClaw hooks** — create a test hook at `~/.openclaw/hooks/test/`, verify `message:received` fires. If not → switch to fork approach.
2. **Spike: WhatsApp QR** — run `openclaw channels login --channel whatsapp` manually, verify QR output format (text/image/URL) for Electron rendering.
3. **Vendor audit: baileys-antiban** — verify source repo, pin exact commit hash, check for credential exfiltration patterns.

### 10.2 Channel Status Broadcast Integration

`startChannelStatusBroadcast()` in channels.js currently hardcodes `['telegram', 'zalo']`. Adding WhatsApp + Lark requires:
- Add to `Promise.all` probe array
- Add grace-period tracking maps per channel
- Extend IPC payload shape: `{ telegram, zalo, whatsapp, lark }`
- Dashboard `onChannelStatus` handler must render new dots

### 10.3 Zalo Migration Note

The shared middleware's `{ action, reason }` return shape differs from Zalo's early-return patches in inbound.ts. Migrating Zalo to the shared module is non-trivial (requires rewriting patch injection, not wrapping). This is explicitly a v3.0 effort.
