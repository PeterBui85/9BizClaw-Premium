# WhatsApp Integration — Design Spec (Revision 3 — MVP scope)

**Version target:** MODOROClaw v2.4.0
**Branch:** `feat/whatsapp-optional` (from `main` @ v2.3.44)
**Est:** 2 tuần dev + 3 ngày test + ship
**Author:** devops@modoro.com.vn
**Date:** 2026-04-16
**Revision:** 3 (MVP scope — drop all source patches, native config only)

## Revision history

- **R1:** Rejected. Assumed TS source patching (plugin ships JS).
- **R2:** Rejected. 4 new HIGH: fake CLI commands, wrong patch target, `allowFrom=[]` semantic conflict with `dmPolicy`.
- **R3:** MVP scope cut. Drop all JS patches (blocklist/dedup/system-msg/output-filter). Native plugin config only. LLM rule fallback for 3 edge cases.

## 1. Goal

Ship WhatsApp channel (optional) trong v2.4.0 với minimum viable feature set — chỉ dùng **native plugin config**, KHÔNG patch source. Scope cắt để ship trong 2 tuần, chấp nhận 3 filter edge cases qua LLM rule thay vì code gate.

## 2. Scope

### 2.1. IN (v2.4.0)

- Wizard optional step "Kết nối WhatsApp" (QR scan)
- Dashboard sidebar + tab WhatsApp (clone Zalo structure)
- 2-mode: Tự động trả lời (auto) | Chỉ đọc + tóm tắt cuối ngày (read)
- Group mode toggle: mention-only | reply-all | off
- Pause/resume toggle
- Outbound `sendWhatsApp()` + triple-channel `sendCeoAlert()`
- Per-user + per-group memory (clone Zalo `memory/`)
- Memory view modal
- Phone-ban mitigation: random delay 2-5s, rate cap 100/giờ, SIM warning trong wizard
- AGENTS.md rules mở rộng cho WhatsApp (Vietnamese diacritics, first-greeting, bot-vs-bot, pause honor, system event drop, blocklist check)

### 2.2. OUT (defer v2.5.0+)

- Code-level blocklist gate (LLM rule in AGENTS.md only)
- Code-level sender dedup (LLM rule in AGENTS.md only)
- Code-level system-msg filter (LLM rule in AGENTS.md only)
- Output filter plugin-side patch (plugin already calls `sanitizeAssistantVisibleText`; MODOROClaw `filterSensitiveOutput` runs on bot-initiated sends via `sendWhatsApp` wrapper)
- Facebook Messenger (no plugin built-in)
- Lark/Feishu (wrong fit)
- Multi-account WhatsApp
- WhatsApp Cloud API (defer v2.5.0+ cho enterprise khách)

### 2.3. Accepted risks

- **LLM có thể lách blocklist rule**: CEO add JID vào `whatsapp-blocklist.json`, nhưng bot đọc file qua AGENTS.md rule, không phải code gate. Risk: 1-5% LLM forget rule và reply. Mitigation: wizard UX hiển thị rule cho CEO "blocklist effectiveness: depends on AI compliance, not guaranteed".
- **LLM có thể reply system event**: group add/remove/rename → AGENTS.md rule nhắc bot im lặng. Risk similar.
- **Duplicate message 3s window**: plugin có dedup internal hay không chưa verify (O-3). Nếu không có → AGENTS.md rule "nếu thấy 2 tin giống hệt trong 5s, chỉ reply 1 lần".

## 3. Foundation — verified from tarball

- `openclaw@2026.4.14` ship sẵn `@openclaw/whatsapp` plugin (baileys 7.0.0-rc.9)
- Plugin ship compiled JS ESM, KHÔNG minified (tên biến preserved)
- **Auth path**: `resolveWhatsAppAuthDir({cfg, accountId:'default'}).authDir` — gọi in-process, không hardcode
- **Readiness**: `hasAnyWhatsAppAuth()` exported từ `accounts-*.js`
- **Native features used**:
  - `dmPolicy: "open"|"disabled"|"pairing"` — chính thức gate cho DM
  - `allowFrom` whitelist (leave empty for all-allow default)
  - `groupRequireMention: true|false` — mention-only gate group
  - `groupAllowFrom` — whitelist group JIDs
  - `DEFAULT_WHATSAPP_MEDIA_MAX_MB = 50` (default OK, không override)
  - `sanitizeAssistantVisibleText` — plugin tự sanitize output khi reply
- **Multi-account schema (bắt buộc)**: `channels.whatsapp.accounts.<id>` + `defaultAccount`
- **Outbound**: `openclaw message send --channel whatsapp --account default -t <jid> -m <text> --json`
- **Status**: `openclaw channels status --probe --json` (parse WhatsApp section)
- **Login**: `openclaw channels login --channel whatsapp` (spawn subprocess, capture QR từ stdout — cần verify TTY requirement)

## 4. Architecture

### 4.1. Process layout

```
Electron main (MODOROClaw)
  └── Gateway subprocess (openclaw.mjs gateway run)
        ├── telegram plugin
        ├── openzalo plugin (custom fork)
        └── @openclaw/whatsapp plugin (built-in) — native config only
              └── baileys WebSocket → WhatsApp servers
```

### 4.2. Directory layout

```
~/.openclaw/
├── openclaw.json                    # channels.whatsapp.accounts.default
└── oauth/whatsapp/default/          # baileys session — plugin tự manage

<workspace>/
├── memory/
│   ├── whatsapp-users/
│   └── whatsapp-groups/
└── config/
    ├── whatsapp-mode.txt            # auto | read
    ├── whatsapp-blocklist.json      # LLM rule reads this
    ├── whatsapp-group-settings.json # __default + per-group override
    ├── whatsapp-paused.json
    └── whatsapp-saved-dmpolicy.json # save original when pause/read, restore on resume/auto
```

### 4.3. Data flow inbound (native gate only)

```
WhatsApp server → baileys WS → plugin inbound
  → dmPolicy check (native) — if "disabled" → drop before dispatch
  → allowFrom check (native) — if set + not match → drop
  → groupRequireMention check (native) — if true + no mention → drop
  → dispatch to agent runtime
  → agent reads AGENTS.md rules (mode, blocklist, pause, system-event rules)
  → agent reply (or silent per rule)
  → plugin sanitizeAssistantVisibleText → baileys send
```

### 4.4. Data flow outbound (bot-initiated)

```
sendCeoAlert(msg) → Promise.allSettled([
  sendTelegram(msg),
  sendZalo(msg),
  sendWhatsApp(msg)  # NEW
])

sendWhatsApp(msg):
  isChannelPaused check
  filterSensitiveOutput (19 shared patterns)
  split into chunks (2000 char cap)
  for each chunk:
    random delay 2-5s (ban mitigation)
    spawnOpenClawSafe(['message', 'send', '--channel', 'whatsapp',
                       '--account', 'default', '-t', ownerJid,
                       '-m', chunk, '--json'])
```

## 5. Components

### 5.1. Plugin enablement — `ensureDefaultConfig()`

Config default (heal mỗi boot):

```js
if (!config.channels.whatsapp) {
  config.channels.whatsapp = {
    enabled: false,            // default OFF — không load plugin khi khách không dùng
    defaultAccount: "default",
    accounts: {
      default: {
        enabled: false,
        dmPolicy: "open",      // chính thức gate; "disabled" khi mode=read/pause
        allowFrom: [],         // empty = allow all (plugin semantics verified)
        groupRequireMention: false,
        groupAllowFrom: [],    // empty = allow all groups
        groupPolicy: "open"
      }
    }
  };
  changed = true;
}

// Migration guard — nếu user có config từ R1/R2 với shape cũ
const waAcc = config.channels.whatsapp?.accounts?.default;
if (waAcc && waAcc.dmPolicy === undefined) {
  waAcc.dmPolicy = "open";
  changed = true;
}
```

**IMPORTANT (from O-7):** TẤT CẢ config mutations trong runtime (mode toggle, pause/resume) PHẢI đi qua `writeOpenClawConfigIfChanged()` helper IN-PROCESS, KHÔNG shell out `openclaw config set`. Lý do: CLI subprocess = external write → trigger gateway reload cascade (bug đã thấy trong openzalo v2.3.x "Gateway is restarting" loop). Pattern đã có sẵn trong `main.js`.

### 5.2. Wizard — optional step

File: `electron/ui/wizard.html`

Thêm step 5 (sau Zalo, trước Done): **"Kết nối kênh khác (không bắt buộc)"**

```
Kênh khác (không bắt buộc)
Bạn có thể bỏ qua. Kết nối sau từ Dashboard.

Lưu ý WhatsApp:
 - Nên dùng SIM có lịch sử >3 tháng
 - Có thể dùng số phụ nếu lo ngại
 - Không broadcast, chỉ reply khách đến
 - Filter blocklist/system-event phụ thuộc AI, không đảm bảo 100%

[ ] WhatsApp              [Kết nối]
[ ] Facebook (sắp có...)   disabled

[Bỏ qua] [Tiếp tục]
```

**QR flow (O-8 block):**
- Click "Kết nối" → spawn `openclaw channels login --channel whatsapp` subprocess với `shell:false`
- Monitor stdout stream → detect QR ASCII / base64 / image hint
- Nếu plugin require TTY (likely vì `qrcode-terminal` in deps) → use `node-pty` to spawn with pseudo-TTY, capture terminal output, convert ASCII QR block → `<pre>` trong modal HTML
- Verify QR refresh cadence (default ~20s baileys)

**Verification test for O-8 (do first in impl phase):**
```bash
openclaw channels login --channel whatsapp --account default
# Capture: does it emit QR bytes to stdout? Require TTY? Exit when done?
```

### 5.3. Dashboard tab

File: `electron/ui/dashboard.html`

Clone `page-zalo` structure:
- Sidebar item "WhatsApp" với dot state
- Page header: account name (E.164 from `jidToE164`) + connected since + pause toggle
- 4 sub-tabs: Liên hệ | Nhóm | Cài đặt | Bộ nhớ
- Mode radio: Tự động trả lời | Chỉ đọc + tóm tắt cuối ngày
- Group default dropdown: mention-only | reply-all | off
- Blocklist UI: add/remove JIDs (writes `whatsapp-blocklist.json`, AGENTS.md reads)
- Group list với per-group mode override
- Bộ nhớ tab: list user + group files với view modal

Khi `enabled: false` hoặc chưa login → CTA "Kết nối WhatsApp" → QR modal.

### 5.4. Channel readiness probe

```js
async function probeWhatsAppReady() {
  try {
    const res = await spawnOpenClawSafe(
      ['channels', 'status', '--probe', '--json'],
      { timeout: 6000 }
    );
    if (res.exitCode !== 0) return { ready: false, error: 'cli-failed' };
    const data = JSON.parse(res.stdout);
    const wa = (data.channels || []).find(c => c.id === 'whatsapp');
    if (!wa) return { ready: false, error: 'not-registered' };
    return {
      ready: wa.connected === true,
      jid: wa.jid,
      phone: wa.phone,
      accountId: wa.accountId || 'default',
      error: wa.error || null
    };
  } catch (e) {
    // Fallback: filesystem check
    try {
      const authDir = path.join(os.homedir(), '.openclaw', 'oauth', 'whatsapp', 'default');
      const credsPath = path.join(authDir, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const mtime = fs.statSync(credsPath).mtime;
        if (Date.now() - mtime.getTime() < 7 * 24 * 60 * 60 * 1000) {
          return { ready: true, error: 'probe-fallback-fs' };
        }
      }
    } catch {}
    return { ready: false, error: 'probe-failed' };
  }
}
```

Broadcast extends `startChannelStatusBroadcast()` từ dual → triple channel.

### 5.5. `sendWhatsApp()` outbound

```js
async function sendWhatsApp(text) {
  if (isChannelPaused('whatsapp')) return false;
  const filtered = filterSensitiveOutput(text);
  if (!filtered) return false;

  const ownerJid = await getWhatsAppOwnerJid();
  if (!ownerJid) {
    await appendMissedAlert('whatsapp', text);
    return false;
  }

  // Rate cap: 100 outbound/hour
  if (checkWhatsAppRateCap()) {
    log('[sendWhatsApp] rate cap hit — skip');
    await appendMissedAlert('whatsapp-rate-capped', text);
    return false;
  }

  const chunks = splitLongMessage(filtered, 2000);

  for (let i = 0; i < chunks.length; i++) {
    try {
      if (i > 0) await sleep(2000 + Math.random() * 3000);
      const res = await spawnOpenClawSafe([
        'message', 'send',
        '--channel', 'whatsapp',
        '--account', 'default',
        '-t', ownerJid,
        '-m', chunks[i],
        '--json'
      ], { timeout: 10000, allowCmdShellFallback: false });
      if (res.exitCode !== 0) throw new Error(res.stderr || 'send failed');
      incrementWhatsAppRateCounter();
    } catch (e) {
      log('[sendWhatsApp] send failed:', e.message);
      return false;
    }
  }
  return true;
}

async function getWhatsAppOwnerJid() {
  // Tier 1: cached from last successful probe
  if (global._waOwnerJidCache && Date.now() - global._waOwnerJidCache.at < 3600_000) {
    return global._waOwnerJidCache.jid;
  }
  // Tier 2: parse creds.json from auth dir
  try {
    const authDir = path.join(os.homedir(), '.openclaw', 'oauth', 'whatsapp', 'default');
    const credsPath = path.join(authDir, 'creds.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const jid = creds.me?.id || creds.account?.details?.accountNumber;
    if (jid) {
      global._waOwnerJidCache = { jid, at: Date.now() };
      return jid;
    }
  } catch {}
  // Tier 3: probe
  const status = await probeWhatsAppReady();
  if (status.ready && status.jid) {
    global._waOwnerJidCache = { jid: status.jid, at: Date.now() };
    return status.jid;
  }
  return null;
}
```

### 5.6. `sendCeoAlert()` triple channel

```js
async function sendCeoAlert(text) {
  const results = await Promise.allSettled([
    sendTelegram(text),
    sendZalo(text),
    sendWhatsApp(text)
  ]);
  const anyOk = results.some(r => r.status === 'fulfilled' && r.value === true);
  if (!anyOk) {
    await appendMissedAlert('all-channels-failed', text);
  }
  return anyOk;
}
```

### 5.7. Mode / pause (in-process config mutation)

**Mode switching:**
```js
async function setWhatsAppMode(mode) {  // 'auto' | 'read'
  const config = readOpenClawConfig();
  const acc = config.channels?.whatsapp?.accounts?.default;
  if (!acc) return false;

  if (mode === 'read') {
    // Save current dmPolicy if not already saved
    if (!existsSavedDmPolicy('whatsapp')) {
      saveDmPolicy('whatsapp', acc.dmPolicy || 'open');
    }
    acc.dmPolicy = 'disabled';
  } else {
    const saved = loadSavedDmPolicy('whatsapp');
    acc.dmPolicy = saved || 'open';
    clearSavedDmPolicy('whatsapp');
  }

  writeOpenClawConfigIfChanged(config);  // byte-equal helper — skip if unchanged
  fs.writeFileSync(path.join(workspace, 'config', 'whatsapp-mode.txt'), mode);

  // Trigger gateway in-process reload via existing heal pattern
  // (do NOT shell out config set)
}
```

**Pause:**
```js
async function pauseWhatsApp(minutes) {
  // Dual protection:
  // 1. File-based pause (existing pattern, sendWhatsApp checks)
  fs.writeFileSync(
    path.join(workspace, 'config', 'whatsapp-paused.json'),
    JSON.stringify({ until: Date.now() + minutes * 60000 })
  );
  // 2. dmPolicy flip (stops plugin from dispatching inbound to agent at all)
  //    Save current, set disabled — mirrors setWhatsAppMode('read')
  const config = readOpenClawConfig();
  const acc = config.channels?.whatsapp?.accounts?.default;
  if (acc) {
    if (!existsSavedDmPolicy('whatsapp-pause')) {
      saveDmPolicy('whatsapp-pause', acc.dmPolicy || 'open');
    }
    acc.dmPolicy = 'disabled';
    writeOpenClawConfigIfChanged(config);
  }
}

async function resumeWhatsApp() {
  try { fs.unlinkSync(path.join(workspace, 'config', 'whatsapp-paused.json')); } catch {}
  const saved = loadSavedDmPolicy('whatsapp-pause');
  if (saved) {
    const config = readOpenClawConfig();
    const acc = config.channels?.whatsapp?.accounts?.default;
    if (acc) {
      acc.dmPolicy = saved;
      writeOpenClawConfigIfChanged(config);
      clearSavedDmPolicy('whatsapp-pause');
    }
  }
}
```

Persistence files (`whatsapp-saved-dmpolicy.json`) used để save+restore original policy khi unpause/un-read-mode.

### 5.8. Memory

Clone Zalo pattern:
- `appendWhatsAppUserSummary(jid, summary)` → `memory/whatsapp-users/<jid>.md`, trim 50KB
- `appendWhatsAppGroupSummary(groupJid, summary)` → `memory/whatsapp-groups/<groupJid>.md`, trim 50KB
- `seedWorkspace()` tạo dirs (both fresh install AND upgrade — `seedWorkspace()` re-run on version bump)
- Group memory view modal clone từ Zalo

### 5.9. Watchdog + auto-reconnect

Extend watchdog loop (existing pattern, NO cascade kill):

```js
const waStatus = await probeWhatsAppReady();
if (!waStatus.ready && global._waWasConnected) {
  if (!global._waReconnectStartedAt) {
    global._waReconnectStartedAt = Date.now();
    log('[watchdog] WhatsApp disconnected — silent reconnect');
  }
  const downMs = Date.now() - global._waReconnectStartedAt;
  if (downMs > 5 * 60 * 1000 && !global._waAlertSent) {
    global._waAlertSent = true;
    await sendTelegram('[Cảnh báo WhatsApp] Kết nối đã mất >5 phút. Có thể cần scan QR lại. Mở Dashboard > WhatsApp.');
  }
} else if (waStatus.ready) {
  global._waWasConnected = true;
  global._waReconnectStartedAt = null;
  global._waAlertSent = false;
}
```

### 5.10. Preload + IPC (10 bridges)

- `probeWhatsAppReady()`
- `pauseWhatsApp(minutes)` / `resumeWhatsApp()` / `getWhatsAppPauseStatus()`
- `setWhatsAppMode(mode)` / `getWhatsAppMode()`
- `getWhatsAppContacts()` / `getWhatsAppGroups()` / `getWhatsAppGroupMemory(jid)` / `getWhatsAppUserMemory(jid)`
- `updateWhatsAppBlocklist(jids)` / `updateWhatsAppGroupMode(jid, mode)` / `updateWhatsAppDefaultGroupMode(mode)`
- `openWhatsAppQrLogin()` / `logoutWhatsApp()`

### 5.11. AGENTS.md rules (v44 → v45)

Section "Kênh WhatsApp":

**Common rules (y hệt Zalo):**
- Vietnamese có dấu bắt buộc
- Không trích dẫn "theo tài liệu"
- First-greeting idempotency (write-then-send)
- Bot-vs-bot detection (6 signals)
- Pause: đọc `whatsapp-paused.json`, nếu chưa expire → im lặng

**MVP-specific rules (vì không có code gate):**
- **Blocklist**: đọc `config/whatsapp-blocklist.json`, nếu sender JID trong list → im lặng
- **System events**: nếu message có hint "X đã được thêm vào nhóm" / "X đã rời nhóm" / group subject/icon changed → im lặng
- **Duplicate**: nếu thấy tin giống hệt từ cùng sender trong 5 giây gần nhất → chỉ reply 1 lần
- **Mode read**: đọc `config/whatsapp-mode.txt`, nếu "read" → im lặng (backup to native `dmPolicy: disabled`)

### 5.12. Phone-ban mitigation

1. Wizard warning card về SIM history
2. `sendWhatsApp()` random delay 2-5s multi-chunk
3. Rate cap hard limit 100 outbound/hour/account
4. AGENTS.md: vary response wording
5. Plugin `blurb` built-in: "recommend a separate phone + eSIM"
6. Rate cap overflow → `sendCeoAlert` warn CEO "WhatsApp rate limit approached — consider dedicated number"

## 6. Reliability (Rule #1 compliance)

- `ensureDefaultConfig()` heal `channels.whatsapp` mỗi boot (migration guard included)
- `seedWorkspace()` tạo `memory/whatsapp-*`, `config/whatsapp-*` templates — **re-run on version bump for existing installs** (confirmed in main.js — seedWorkspace idempotent)
- Runtime config mutations via in-process `writeOpenClawConfigIfChanged` only — NEVER shell out `openclaw config set`
- `RESET.bat` xóa runtime → `seedWorkspace()` re-seed
- Smoke test extends: verify openclaw version pin (existing mechanism via PINNING.md), verify `hasAnyWhatsAppAuth` export exists trong installed plugin (sanity check plugin API intact)
- **NO patches** in R3 → no anchor fragility, no file discovery, no version drift risk from openclaw upgrades

## 7. Testing

### 7.1. Unit
- `sendWhatsApp` split logic (500/2500/6000 chars) + delay enforcement
- Rate cap enforcement (100 in 60min → 101st fails)
- `sendCeoAlert` 3-channel with 0/1/2/3 failures
- `setWhatsAppMode('read')` → config dmPolicy becomes disabled, saved state correct
- `setWhatsAppMode('auto')` after read → dmPolicy restored từ saved
- `pauseWhatsApp(10)` → dmPolicy disabled + file written; `resumeWhatsApp()` → dmPolicy restored + file deleted

### 7.2. Integration (dev test number)
- Fresh install skip WhatsApp → onboard OK, sidebar "chưa kết nối"
- Fresh install connect WhatsApp → QR → login → nhắn bot → reply OK
- Existing install → click sidebar "Kết nối" → modal QR → login → tab populates
- Mode read: khách nhắn → bot im lặng; openclaw.log shows plugin dropped via dmPolicy
- Pause 10m: khách nhắn → bot im; auto-resume sau 10m → reply
- Group mention-only: @mention → reply; no mention → im (native)
- Blocklist (LLM rule): add JID → khách nhắn → test bot có respect rule không (known 1-5% FP rate)

### 7.3. Soak test (3 ngày, dev account)
- Continuous 72h, daily Electron restart
- Session persist OK
- Memory files ≤50KB
- No gateway restart storms (verify `openclaw.json.bak*` không spawn)
- Watchdog alert fires khi manually kill WA session

### 7.4. E2E (1 CEO volunteer — 48h dry run)
- CEO có SIM >6 tháng
- Monitor: `ceo-alerts-missed.log`, `security-output-filter.jsonl`, `openclaw.log`, WhatsApp account status
- Triple alert verify: Telegram + Zalo + WhatsApp cùng nhận boot ping

## 8. Rollback

- Branch `feat/whatsapp-optional` từ main
- Soft rollback: `ensureDefaultConfig()` patch `channels.whatsapp.enabled = false` qua auto-update
- Hard rollback: v2.4.1 revert WhatsApp code
- Cherry-pick main hotfixes vào branch

## 9. Migration

- Fresh install: none needed
- v2.3.44 → v2.4.0 upgrade:
  1. Auto-update fires
  2. Restart → `ensureDefaultConfig()` adds `channels.whatsapp.accounts.default` (enabled:false, dmPolicy:open)
  3. `seedWorkspace()` adds `memory/whatsapp-*`, `config/whatsapp-*` templates
  4. Dashboard shows sidebar item "chưa kết nối"
  5. Zero disruption Zalo/Telegram

## 10. Open questions (reduced from R2)

**Must close before impl plan:**

**O-A:** `openclaw channels login --channel whatsapp` stdout QR capture — require TTY? Test:
```bash
# Run inside Electron-spawned subprocess (not terminal) and check if QR appears
openclaw channels login --channel whatsapp --account default --json 2>&1
```
Outcomes:
- QR in stdout as ASCII → capture + render in `<pre>` modal
- QR requires TTY → use `node-pty` with PTY handle
- QR as PNG file written to disk → read file + convert base64

**O-B:** `openclaw channels status --probe --json` output format — verify field names (`connected`, `jid`, `phone`, `accountId`) match what my probe code expects. Test:
```bash
openclaw channels status --probe --json
```

**O-C:** Does plugin fire sync/async reload when `dmPolicy` changes in-process vs shell-out? If `writeOpenClawConfigIfChanged()` write triggers file-watcher → reload. Need verification that in-process writes do NOT cascade like CLI subprocess did (pattern từ openzalo v2.3.x fix).

**Can defer:**
- Blocklist LLM rule FP rate tuning (observed in production)
- Per-group allowFrom whitelist UI (v2.4.1 polish)

## 11. Success criteria

1. Fresh install skip WhatsApp → onboard <3 phút, zero WhatsApp UI interrupt
2. Fresh install connect WhatsApp → QR → bot reply in <5 min total
3. v2.3.44 → v2.4.0 upgrade → 24h zero disruption Zalo/Telegram
4. Concurrent 3-channel (Telegram+Zalo+WhatsApp) 1h → 0 cross-talk, 0 leak
5. Watchdog kill WhatsApp → auto-reconnect 30s-5min → no gateway kill
6. `ceo-alerts-missed.log` empty after 72h soak
7. Smoke test pass (openclaw pin + WhatsApp plugin API intact)
8. CEO 48h ban check → account remains active

## 12. Timeline

**Week 1 (3 ngày kỹ thuật + 2 ngày UI):**
- Day 1: `ensureDefaultConfig` schema + wizard step HTML + in-process config mutation helpers
- Day 2: `probeWhatsAppReady` + `sendWhatsApp` + `sendCeoAlert` triple + rate cap
- Day 3: Close O-A, O-B, O-C via manual testing; fix findings
- Day 4-5: Dashboard page + sidebar + 4 sub-tabs (Liên hệ, Nhóm, Cài đặt, Bộ nhớ)

**Week 2 (2 ngày feature + 3 ngày test + ship):**
- Day 6: AGENTS.md v45 rules + memory handlers + view modal
- Day 7: Watchdog integration + preload bridges + pause/mode toggle UI
- Day 8-9: Integration tests + E2E dev account
- Day 10: Ship v2.4.0 (EXE + Mac DMG)

---

**Next step:** close O-A, O-B, O-C qua manual test → dispatch reviewer R3 → approve → invoke writing-plans skill.
