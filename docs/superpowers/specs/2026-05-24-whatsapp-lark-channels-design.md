# WhatsApp + Lark Channel Integration — Design Spec

**Date:** 2026-05-24
**Status:** Draft (R2 — post architecture review)
**Scope:** Dashboard UI for 2 new channels + shared inbound defense middleware + WhatsApp customer-grade security

---

## 1. Problem

9BizClaw supports Telegram + Zalo. Vietnamese SME customers also use WhatsApp (international clients) and Lark/Feishu (internal teams). OpenClaw 2026.4.14 ships both channel plugins. We need Dashboard UI to connect them and security middleware to protect customer-facing WhatsApp.

## 2. Goals

- CEO connects WhatsApp/Lark via Dashboard (QR scan, same as Zalo)
- WhatsApp has same security as Zalo (command block, output filter, dedup, system msg filter, escalation)
- Lark is internal-only (lighter security)
- Shared defense middleware serves WhatsApp now, Zalo migrates later (v3.0)
- Architecture scales to 10+ channels without copy-paste

## 3. Non-Goals

- Migrate Zalo patches to shared middleware (v3.0)
- WhatsApp Business API (Cloud API) — Baileys Web only
- Facebook Messenger
- Wizard changes
- Cross-channel customer identity merge (v3.0)
- Cron delivery to WhatsApp/Lark (v1 Telegram+Zalo only, documented as limitation)

---

## 4. Architecture

### 4.1 Dual-path (hooks primary, fork fallback)

```
[Decision gate: spike result]
    |
    ├─ Hooks work ──→ Path A: OpenClaw hooks
    │                  ~/.openclaw/hooks/inbound-defense/
    │                  handler.js calls lib/inbound-defense.js
    │
    └─ Hooks fail ──→ Path B: WhatsApp plugin fork
                       electron/packages/modoro-whatsapp/
                       inbound.ts patches (same as modoro-zalo)
```

**Both paths use the same `lib/inbound-defense.js` module.** Path A calls it from a hook handler. Path B calls it from forked inbound.ts source. The defense logic is identical — only the integration point differs.

**Zalo stays unchanged.** Existing inbound.ts patches remain. No refactoring.

### 4.2 Channel Registry (scale pattern)

**File:** `electron/lib/channel-registry.js` — NEW

Instead of 8 IPC handlers per channel × N channels, a single registry drives all channels:

```javascript
const CHANNELS = {
  telegram: {
    id: 'telegram', label: 'Telegram', icon: 'brand-telegram',
    probe: probeTelegramReady,
    role: 'ceo',           // full access
    hasAllowlist: false,
    hasPause: true,
  },
  zalo: {
    id: 'modoro-zalo', label: 'Zalo', icon: 'brand-zalo',
    probe: probeZaloReady,
    role: 'customer',       // restricted
    hasAllowlist: true,
    hasPause: true,
  },
  whatsapp: {
    id: 'whatsapp', label: 'WhatsApp', icon: 'brand-whatsapp',
    probe: probeWhatsAppReady,
    pluginPkg: '@openclaw/whatsapp',  // auto-install on first connect
    role: 'customer',
    hasAllowlist: true,
    hasPause: true,
    loginChannel: 'whatsapp',
  },
  lark: {
    id: 'feishu', label: 'Lark', icon: 'brand-lark',
    probe: probeLarkReady,
    role: 'internal',       // full access, no defense filters
    hasAllowlist: false,
    hasPause: true,
    loginChannel: 'feishu',
  },
};
```

**Generic IPC handlers** (registered once, not per channel):

```javascript
ipcMain.handle('channel:ready',   (e, { ch }) => CHANNELS[ch].probe());
ipcMain.handle('channel:connect', (e, { ch }) => connectChannel(ch));
ipcMain.handle('channel:disconnect', (e, { ch }) => disconnectChannel(ch));
ipcMain.handle('channel:config:get', (e, { ch }) => getChannelConfig(ch));
ipcMain.handle('channel:config:save', (e, { ch, config }) => saveChannelConfig(ch, config));
ipcMain.handle('channel:pause',   (e, { ch, minutes }) => pauseChannel(ch, minutes));
ipcMain.handle('channel:resume',  (e, { ch }) => resumeChannel(ch));
ipcMain.handle('channel:pause-status', (e, { ch }) => getChannelPauseStatus(ch));
```

**8 generic handlers** instead of 8 × N. Adding a new channel = add entry to `CHANNELS` object + probe function. Zero new IPC/preload work.

**Preload:** 8 generic bridges:
```javascript
channelReady: (ch) => ipcRenderer.invoke('channel:ready', { ch }),
channelConnect: (ch) => ipcRenderer.invoke('channel:connect', { ch }),
// ...
```

**Backward compat:** Existing Telegram/Zalo-specific IPC handlers stay (181 handlers). New generic handlers serve WhatsApp/Lark and future channels. Migrate Telegram/Zalo to generic pattern in v3.0.

### 4.3 Shared Inbound Defense Module

**File:** `electron/lib/inbound-defense.js`

**Strategy pattern** — channel-specific logic in config objects, not branches:

```javascript
const CHANNEL_DEFENSE = {
  whatsapp: {
    systemMsgDetector: (msg) => msg.messageStubType != null,
    systemMsgStubTypes: new Set([1, 27, 28, 32, 33, 34]),
    commandPatterns: SHARED_COMMAND_PATTERNS,  // same 8 patterns as Zalo
    dedupWindowMs: 3000,
    dedupMaxEntries: 500,
    botLoopEnabled: true,
    outputFilterLevel: 'full',    // all 71 patterns
    allowlistFile: 'whatsapp-allowlist.json',
  },
  feishu: {
    systemMsgDetector: (msg) => msg.type === 'system',
    commandPatterns: [],           // internal — no blocking
    dedupWindowMs: 3000,
    dedupMaxEntries: 200,
    botLoopEnabled: false,
    outputFilterLevel: 'light',   // API keys only
    allowlistFile: null,
  },
  // Future: discord, line, etc. — just add config object
};

module.exports = {
  runInboundDefense(channel, msg),     // orchestrator — runs all filters in order
  runOutboundDefense(channel, text),   // output filter
  registerChannelDefense(channelId, config),  // for plugins to register at runtime
  clearDedup(),
};
```

`runInboundDefense` returns `{ action: 'pass' | 'drop' | 'rewrite', reason?, body? }`. Orchestrator runs filters in fixed order: systemMsg → allowlist → dedup → commandBlock → botLoop. First `drop` wins.

No god module — each channel is a config object, shared logic is the pipeline.

### 4.4 WhatsApp System Message Detection

WhatsApp `messageStubType` enum (from Baileys):
- 1: CHANGE_EJECTED
- 27: GROUP_PARTICIPANT_ADD
- 28: GROUP_PARTICIPANT_REMOVE
- 32: GROUP_CHANGE_SUBJECT
- 33: GROUP_CHANGE_ICON
- 34: GROUP_CHANGE_DESCRIPTION

Simple Set lookup — no regex, no i18n.

### 4.5 Outbound Rate Limiting (WhatsApp only)

Vendor `baileys-antiban` into `electron/vendor/baileys-antiban/` (committed, pinned commit hash). Do NOT use npm install — supply chain risk too high in this space.

Features used: `wrapSocket()` for Gaussian jitter, warm-up ramp, health monitoring.

Config in openclaw.json `channels.whatsapp.rateLimiting`:
```json
{ "enabled": true, "warmupDays": 7, "maxPerHour": 80, "typingDelayMs": [800, 2500] }
```

### 4.6 Customer Memory

| Channel | Memory dir | Trim cap | Phone normalization |
|---------|-----------|----------|-------------------|
| WhatsApp users | `memory/whatsapp-users/<e164>.md` | 50KB | Always E.164: strip leading 0, ensure +country code |
| WhatsApp groups | `memory/whatsapp-groups/<groupId>.md` | 50KB | N/A |
| Lark | None | N/A | N/A (internal) |

**Rename functions for channel-agnostic use:**
- `appendPerCustomerSummaries()` → `appendCustomerSummary(channel, senderId, data)` (wrapper, calls existing Zalo path for backward compat)
- `trimZaloMemoryFile()` → `trimCustomerMemoryFile(filePath, maxBytes)` (already channel-agnostic internally)

**Known limitation (v1):** Same customer on WhatsApp + Zalo = 2 separate memory files. Cross-channel identity merge is v3.0 scope (phone number matching + CEO tagging).

### 4.7 Cron Delivery

**v1: WhatsApp/Lark cron delivery NOT supported.** Crons deliver to Telegram (CEO) and Zalo (groups/users) only. `deliverCronResultToZalo()` and `sendTelegram()` stay unchanged.

**v2 (future):** Add `deliverCronResultToChannel(channel, replyText, target, label)` abstraction that routes to the correct send function. Requires `whatsappTarget` field in custom-crons.json schema.

### 4.8 CEO Notification Channel Attribution

`sendCeoAlert()` messages to Telegram must include channel source:

```
[WhatsApp] Khách "Chị Lan" (+84901234567) hỏi giá sản phẩm
[Lark] Nguyễn Văn A hỏi về quy trình
```

Escalation scanner output includes `[channel]` prefix. CEO knows which app to reply on.

---

## 5. Dashboard UI

### 5.1 Channel Pages

Two new pages in Kênh tab. Dashboard renders from `CHANNELS` registry — not hardcoded HTML per channel.

**page-whatsapp:**
- Header: icon, "WhatsApp", status pill
- Connection card: "Kết nối" → auto-install plugin if missing → QR modal → scan → gateway restart
- Config: dmPolicy dropdown, pause/resume
- Security badge: "Kênh khách hàng — bảo mật cấp cao"

**page-lark:**
- Header: icon, "Lark", status pill
- Connection card: "Kết nối" → QR modal → scan → gateway restart
- Config: pause/resume only
- Badge: "Kênh nội bộ"

### 5.2 Status Probes

**Primary probe (cheap, every tick):** Check config `channels.<id>.enabled` + session file exists.

**Deep probe (every 5th tick, ~4 min):** Spawn `openclaw channels status --channel <name> --probe --json` if CLI supports it. If not → primary probe only.

Probes registered dynamically from `CHANNELS` registry in `startChannelStatusBroadcast()`. No hardcoded channel list.

### 5.3 IPC + Preload

8 generic handlers + 8 generic bridges (see Section 4.2). Zero per-channel code. Adding channel 5, 6, 7... = config object only.

---

## 6. Config Changes

### ensureDefaultConfig()

```javascript
// WhatsApp — only if plugin installed
if (pluginInstalled('@openclaw/whatsapp')) {
  if (!config.channels.whatsapp) config.channels.whatsapp = {};
  const wa = config.channels.whatsapp;
  if (wa.enabled === undefined) { wa.enabled = false; changed = true; }
  if (!wa.dmPolicy) { wa.dmPolicy = 'pairing'; changed = true; }
  if (!wa.allowFrom) { wa.allowFrom = []; changed = true; }
}

// Feishu/Lark — built-in
if (!config.channels.feishu) config.channels.feishu = {};
const feishu = config.channels.feishu;
if (feishu.enabled === undefined) { feishu.enabled = false; changed = true; }
```

### AGENTS.md additions

Add to "An toàn + Phân quyền kênh" section:

```
**WhatsApp = CSKH** (cùng quyền Zalo). Command-block, output filter, allowlist, memory per customer.
KHÔNG exec, write_file, cron. Input-level blocked (COMMAND-BLOCK). Escalate CEO qua Telegram.
Bot reply kèm [WhatsApp] prefix khi escalate để CEO biết kênh nào.

**Lark = Nội bộ.** Full quyền như CEO Telegram. Không command-block, không output filter.
```

Measured impact: +180 chars to AGENTS.md (current 26K → 26.2K). Acceptable.

---

## 7. Dependencies

| Package | Purpose | Size | Source | License |
|---------|---------|------|--------|---------|
| `@openclaw/whatsapp` | WhatsApp Baileys plugin | 85KB | npm (auto-install) | Apache 2.0 |
| `baileys-antiban` | Outbound rate limiting | ~15KB | **Vendored** (pinned commit) | MIT |
| Feishu | Built-in openclaw | 0 | Included | N/A |

`baileys-antiban` is vendored at `electron/vendor/baileys-antiban/` with pinned commit hash. Not installed via npm. Source audited for credential exfiltration.

---

## 8. File Changes Summary

| File | Changes |
|------|---------|
| `electron/lib/channel-registry.js` | NEW — channel config registry + generic IPC handlers |
| `electron/lib/inbound-defense.js` | NEW — shared defense middleware (strategy pattern) |
| `electron/hooks/inbound-defense/` | NEW — openclaw hook (or fork, based on spike) |
| `electron/vendor/baileys-antiban/` | NEW — vendored rate limiter |
| `electron/lib/channels.js` | Add `probeWhatsAppReady()`, `probeLarkReady()`, dynamic broadcast |
| `electron/lib/config.js` | Add WhatsApp + Feishu to `ensureDefaultConfig()` |
| `electron/lib/dashboard-ipc.js` | Register generic channel IPC handlers from registry |
| `electron/preload.js` | Add 8 generic channel bridges |
| `electron/ui/dashboard.html` | Add 2 page divs, dynamic rendering from registry |
| `electron/lib/workspace.js` | Seed `memory/whatsapp-users/`, `memory/whatsapp-groups/` |
| `electron/lib/conversation.js` | Rename Zalo-specific memory functions to channel-agnostic |
| `AGENTS.md` | Add WhatsApp/Lark channel security rules |

---

## 9. Testing

- Smoke: module load, IPC parity, hook/fork file exists, channel registry valid
- Smoke: inbound-defense.js unit tests (systemMsg, commandBlock, dedup, botLoop per channel config)
- Manual: connect WhatsApp QR → send msg → bot replies → defense filters active
- Manual: connect Lark QR → send msg → bot replies (no command block)
- Security: WhatsApp customer "tạo cron" → command blocked, response sanitized
- Security: bot reply with file path → output filter blocks
- Security: WhatsApp escalation → CEO gets `[WhatsApp]` prefix on Telegram
- Scale: 4 channel probes run in <2s total (primary probe, not CLI spawn)

---

## 10. Risks

| Risk | Mitigation |
|------|-----------|
| WhatsApp ban | `baileys-antiban` vendored, warm-up ramp, Gaussian jitter |
| OpenClaw hooks don't work | **Spike first.** Fallback: WhatsApp plugin fork (modoro-whatsapp) |
| QR flow in Electron | Fallback: CLI instructions in terminal |
| Feishu admin approval | Setup guide documents requirement |
| Phone normalization | E.164 mandatory, strip leading 0, validate format |
| `baileys-antiban` supply chain | Vendored + audited, not npm installed |
| Meta blocks Baileys | Contingency: WhatsApp Cloud API migration (official, paid) |

### 10.1 Prerequisites (must complete before implementation)

1. **Spike: OpenClaw hooks** — create test hook, verify `message:received` fires. Decision: hooks (Path A) or fork (Path B).
2. **Spike: WhatsApp QR** — run `openclaw channels login --channel whatsapp`, capture QR format.
3. **Spike: Feishu QR** — run `openclaw channels login --channel feishu`, verify flow.
4. **Audit: baileys-antiban** — read source, pin commit, check for exfil patterns, vendor into repo.

### 10.2 Known Limitations (v1)

- Cron delivery: Telegram + Zalo only. WhatsApp/Lark crons not supported.
- Cross-channel identity: same customer on WhatsApp + Zalo = 2 separate memory files.
- WhatsApp contacts list: not in v1 Dashboard (future).
- Zalo migration to shared middleware: v3.0.

### 10.3 Scale Projection

| Channels | IPC handlers | Probe time | Defense configs |
|----------|-------------|------------|----------------|
| 4 (current + WA + Lark) | 8 generic + 181 legacy | <2s | 2 objects |
| 7 (+Discord, Line, Signal) | 8 generic + 181 legacy | <3s | 5 objects |
| 10 | 8 generic + 181 legacy | <4s | 8 objects |

Architecture holds at 10+ channels. Zero new IPC per channel. Defense = config object per channel.
