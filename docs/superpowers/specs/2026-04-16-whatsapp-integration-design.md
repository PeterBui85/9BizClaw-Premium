# WhatsApp Integration — Design Spec

**Version target:** MODOROClaw v2.4.0
**Branch:** `feat/whatsapp-optional` (from `main` @ v2.3.44)
**Est:** 3-4 tuần dev + 1 tuần test + ship
**Author:** devops@modoro.com.vn
**Date:** 2026-04-16

---

## 1. Goal

Tích hợp WhatsApp làm kênh tùy chọn (optional) cho MODOROClaw, full parity với Zalo (DM + group, 2-mode auto/read, output filter, pause, blocklist, per-user memory, group memory view, dual-channel CEO alert), nhưng KHÔNG ép khách kết nối khi onboard. Khách không dùng WhatsApp vẫn onboard bình thường như hiện tại.

## 2. Non-Goals

- **Facebook Messenger**: out of scope v2.4.0 (không có plugin built-in, cần custom Graph API polling plugin — phase sau)
- **Lark/Feishu**: đã loại (enterprise model, không phù hợp thị trường VN của MODORO)
- **Multi-account WhatsApp**: chỉ 1 WhatsApp account/install (giống Zalo)
- **WhatsApp Business API**: không dùng (yêu cầu Meta verification, phí cao); chỉ WhatsApp Web unofficial qua baileys

## 3. Foundation — đã có sẵn

Check trên npm registry + tarball `openclaw@2026.4.14`:

- **Plugin `@openclaw/whatsapp` v2026.4.12** built-in trong openclaw core
- Dùng `@whiskeysockets/baileys@7.0.0-rc.9` (protocol-level WhatsApp Web, không cần Chromium)
- Đã có `auth-presence.js`, `persistedAuthState`, `setup-entry.js` — QR login flow, session persistence, reconnect, presence tracking
- Session lưu ở `~/.openclaw/extensions/whatsapp/` (plugin tự handle, pattern giống openzalo)
- Không cần build daemon riêng như openzca

Nghĩa là: MODOROClaw chỉ cần **enable + wire UI + wrap** (filter/pause/alert), KHÔNG cần viết core WhatsApp logic.

## 4. Architecture

### 4.1. Process layout

```
Electron main (MODOROClaw)
  └── Gateway process (openclaw.mjs gateway run)
        ├── telegram plugin
        ├── openzalo plugin (custom, ta duy trì)
        └── @openclaw/whatsapp plugin (built-in) ← THÊM MỚI
              └── baileys WebSocket → WhatsApp servers
```

Không có subprocess riêng cho WhatsApp — plugin chạy trong gateway process, giống telegram.

### 4.2. Directory layout

```
~/.openclaw/
├── openclaw.json                  # thêm section channels.whatsapp
├── extensions/whatsapp/            # plugin runtime state (session, creds)
└── logs/

<workspace>/
├── memory/
│   ├── zalo-users/
│   ├── zalo-groups/
│   ├── whatsapp-users/            ← MỚI
│   └── whatsapp-groups/           ← MỚI
├── config/
│   ├── zalo-mode.txt
│   ├── whatsapp-mode.txt          ← MỚI (auto|read)
│   ├── zalo-blocklist.json
│   ├── whatsapp-blocklist.json   ← MỚI
│   ├── zalo-group-settings.json
│   ├── whatsapp-group-settings.json ← MỚI
│   ├── telegram-paused.json
│   ├── zalo-paused.json
│   └── whatsapp-paused.json       ← MỚI
```

### 4.3. Data flow

**Inbound (khách → bot):**
```
WhatsApp server → baileys WS → @openclaw/whatsapp inbound handler
  → MODOROClaw ensureWhatsApp*Fix patches (blocklist, system-msg, mode gate, sender-dedup)
  → if mode=read → return (drop)
  → else → dispatch to agent runtime → reply
  → deliver callback (coalescing v4 pattern từ openzalo)
  → baileys send → khách
```

**Outbound (CEO alert / cron):**
```
sendCeoAlert(msg) → Promise.allSettled([
  sendTelegram(msg),    # existing
  sendZalo(msg),        # existing
  sendWhatsApp(msg)     # NEW
])
```

## 5. Components — chi tiết

### 5.1. Plugin enablement — `ensureDefaultConfig()`

Thêm vào main.js:

```js
// trong ensureDefaultConfig(), sau block zalo
if (!config.channels.whatsapp) {
  config.channels.whatsapp = {
    enabled: false,     // default OFF — CEO phải bật thủ công qua wizard/dashboard
    dmPolicy: "open",
    groupPolicy: "open"
  };
  changed = true;
}
// migration: nếu có key legacy cần strip, delete ở đây
```

Field `enabled: false` mặc định → plugin không load, không chiếm resource cho CEO không dùng WhatsApp.

### 5.2. Wizard — optional step

File: `electron/ui/wizard.html`

Thêm step 5 (giữa Zalo step 4 và Done step 6): **"Kết nối kênh khác (không bắt buộc)"**

UI:
```
[Tiêu đề] Kênh khác (không bắt buộc)
[Mô tả]    Bạn có thể bỏ qua bước này. Kết nối sau từ Dashboard.

[ ] WhatsApp          [Kết nối]     ← toggle checkbox + button
[ ] Facebook Messenger [Sắp có...]  ← disabled placeholder

[Bỏ qua] [Tiếp tục]
```

Flow:
- Click "Kết nối" WhatsApp → expand inline QR modal (giống Zalo wizard)
- Scan QR bằng điện thoại → plugin detect login success → update wizard state
- "Tiếp tục" bất kể đã kết nối hay chưa
- Wizard complete → `channels.whatsapp.enabled` bật hay không tùy checkbox

### 5.3. Dashboard tab

File: `electron/ui/dashboard.html`

**Sidebar item mới** (sau Zalo):
```
WhatsApp  [dot-xám "chưa kết nối"] / [dot-xanh tên account]
```

**Page `page-whatsapp`** clone structure từ `page-zalo`:
- Header: "WhatsApp · tên account · kiểm tra HH:MM"
- Ready pill + pause toggle
- 4 sub-tabs: Liên hệ | Nhóm | Cài đặt | Bộ nhớ
- Mode selector (Auto | Read-only) — giống Zalo

**"Kết nối" flow khi chưa login:**
- Page hiện CTA lớn "Kết nối WhatsApp" → click → modal QR
- QR refresh mỗi 20s (baileys protocol)
- Login OK → page reload full Zalo-like UI

### 5.4. Channel readiness probe

File: `electron/main.js`

```js
async function probeWhatsAppReady() {
  // Tier 1: check baileys session file exists
  const authDir = path.join(os.homedir(), '.openclaw', 'extensions', 'whatsapp', 'auth');
  if (!fs.existsSync(authDir)) return { ready: false, error: 'not-connected' };

  // Tier 2: probe plugin status qua gateway API
  // openclaw gateway expose /channels/whatsapp/status
  try {
    const res = await fetch('http://127.0.0.1:18789/channels/whatsapp/status', { timeout: 5000 });
    const data = await res.json();
    return {
      ready: data.connected === true,
      username: data.jid,
      lastSeen: data.lastSeen,
      error: data.connected ? null : data.error
    };
  } catch (e) {
    return { ready: false, error: 'gateway-unreachable' };
  }
}
```

Broadcast vào `startChannelStatusBroadcast()` — thêm WhatsApp vào 45s polling loop + boot phase fast polling.

### 5.5. `sendWhatsApp()` outbound

File: `electron/main.js`

```js
async function sendWhatsApp(text) {
  if (isChannelPaused('whatsapp')) return false;
  const filtered = filterSensitiveOutput(text);  // 19 shared patterns
  if (!filtered) return false;

  // Long message split — paragraph → sentence → word boundary, max 2000 chars/msg (WhatsApp limit)
  const chunks = splitLongMessage(filtered, 2000);
  const ownerJid = getWhatsAppOwnerJid();  // từ config hoặc plugin state
  if (!ownerJid) {
    fs.appendFileSync(path.join(workspace, 'logs', 'ceo-alerts-missed.log'),
      `${new Date().toISOString()} WhatsApp no owner: ${text.slice(0,200)}\n`);
    return false;
  }

  for (let i = 0; i < chunks.length; i++) {
    try {
      await fetch('http://127.0.0.1:18789/channels/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ to: ownerJid, text: chunks[i] })
      });
      if (i < chunks.length - 1) await sleep(800);  // rate limit
    } catch (e) {
      log('[sendWhatsApp] failed:', e.message);
      return false;
    }
  }
  return true;
}
```

### 5.6. `sendCeoAlert()` triple channel

File: `electron/main.js` — existing function, extend:

```js
async function sendCeoAlert(text) {
  const results = await Promise.allSettled([
    sendTelegram(text),
    sendZalo(text),
    sendWhatsApp(text)  // NEW
  ]);
  const anyOk = results.some(r => r.status === 'fulfilled' && r.value === true);
  if (!anyOk) {
    fs.appendFileSync(path.join(workspace, 'logs', 'ceo-alerts-missed.log'),
      `${new Date().toISOString()} ALL CHANNELS FAILED: ${text}\n`);
  }
  return anyOk;
}
```

Cron delivery tự hưởng triple delivery không cần đổi.

### 5.7. Inbound patches — `ensureWhatsApp*Fix()`

Plugin `@openclaw/whatsapp` inbound.ts tương đương openzalo. Cần inject các patch giống openzalo (pattern: read file → regex match anchor → inject block → idempotent qua marker).

**5.7.1. `ensureWhatsAppBlocklistFix()`** — drop messages từ senderId trong `whatsapp-blocklist.json`. Pattern y hệt `ensureZaloBlocklistFix`.

**5.7.2. `ensureWhatsAppModeFix()`** — read `config/whatsapp-mode.txt`, nếu `read` → drop all messages before AI dispatch. Pattern y hệt `ensureZaloModeFix`.

**5.7.3. `ensureWhatsAppGroupSettingsFix()`** — read `whatsapp-group-settings.json` với `__default` fallback, gate group messages theo mode (mention/all/off). Pattern y hệt `ensureZaloGroupSettingsFix` v6.

**5.7.4. `ensureWhatsAppSystemMsgFix()`** — drop group system events (thêm member, rời group, đổi tên group) trước AI dispatch. WhatsApp có protocol message type khác Zalo, cần detect qua `message.messageStubType` (baileys).

**5.7.5. `ensureWhatsAppSenderDedupFix()`** — per-sender Map với TTL 3s, drop duplicate message trong 3s window. Pattern y hệt `ensureZaloSenderDedupFix`.

**5.7.6. `ensureWhatsAppOutputFilterFix()`** — 19 shared CoT/leak patterns, drop reply nếu match. Pattern y hệt `ensureZaloOutputFilterFix`.

**5.7.7. `ensureWhatsAppForceOneMessageFix()`** — deliver-coalesce v4 (buffer multiple deliver calls trong 1 flush window, merge thành 1 message, error logging). Pattern y hệt openzalo v4.

Tất cả patches gọi trong `_startOpenClawImpl()` sau plugin install, idempotent qua markers.

**Order matters:** Các patch prepend code sau anchor — patch gọi LAST sẽ appear FIRST trong file (earliest exit). Order: blocklist → output-filter → sender-dedup → group-settings → system-msg → mode → deliver-coalesce (mode fire last = mode check happens first).

### 5.8. Per-user + per-group memory

File: `electron/main.js`

- `appendWhatsAppUserSummary(userId, summary)` — pattern y hệt `appendPerCustomerSummaries` cho Zalo. Trim 50KB cap qua `trimWhatsAppMemoryFile`.
- `seedWorkspace()` thêm `memory/whatsapp-users/` + `memory/whatsapp-groups/` vào directory creation.
- Group summary + modal view (clone Zalo implementation).

### 5.9. Watchdog + auto-reconnect

File: `electron/main.js`

Thêm vào existing watchdog loop:

```js
// sau Zalo listener check trong watchdog
const waStatus = await probeWhatsAppReady();
if (!waStatus.ready && wasConnectedRecently('whatsapp')) {
  // session expired hoặc phone offline
  if (!global._waReconnectStartedAt) {
    global._waReconnectStartedAt = Date.now();
    log('[watchdog] WhatsApp disconnected — silent auto-reconnect...');
  }
  const downMs = Date.now() - global._waReconnectStartedAt;
  if (downMs > 5 * 60 * 1000 && !global._waAlertSent) {
    global._waAlertSent = true;
    await sendTelegram('[Cảnh báo WhatsApp] Kết nối đã mất >5 phút. Có thể cần scan QR lại. Mở Dashboard > WhatsApp để check.');
  }
} else if (waStatus.ready && global._waReconnectStartedAt) {
  global._waReconnectStartedAt = null;
  global._waAlertSent = false;
  log('[watchdog] WhatsApp reconnected');
}
```

KHÔNG kill gateway khi WhatsApp down (learning từ Zalo watchdog cascade bug) — chỉ log + alert.

### 5.10. Preload + IPC bridges

File: `electron/preload.js`

Thêm 8 bridges mới:
- `probeWhatsAppReady()`
- `pauseWhatsApp(minutes)` / `resumeWhatsApp()` / `getWhatsAppPauseStatus()`
- `getWhatsAppFriends()` / `getWhatsAppGroups()` / `getWhatsAppGroupMemory(groupId)`
- `setWhatsAppMode(mode)` / `getWhatsAppMode()`
- `updateWhatsAppDefaultGroupMode(mode)` / `updateWhatsAppGroupMode(groupId, mode)`
- `updateWhatsAppBlocklist(userIds)`

Mỗi bridge tương ứng 1 IPC handler trong main.js.

### 5.11. AGENTS.md rules cho WhatsApp

File: `AGENTS.md` — extend v44 → v45:

- Section "Kênh WhatsApp" — rules y hệt Zalo: Vietnamese diacritics, anti-citation, first-greeting idempotency (write-then-send), bot-vs-bot detection (6 signals), system event drop (prose backup to code filter), pause honoring (read `whatsapp-paused.json`).
- Section "Knowledge doanh nghiệp" không đổi (shared).

## 6. Reliability — Rule #1 compliance

Tất cả patches + config mutations tuân Rule #1 fresh-install parity:

- `ensureDefaultConfig()` heal `channels.whatsapp` mỗi boot
- `ensureWhatsApp*Fix()` x7 patches re-apply mỗi `startOpenClaw()`, idempotent qua markers
- `seedWorkspace()` tạo `memory/whatsapp-*/`, `config/whatsapp-*` templates
- `RESET.bat` xóa runtime → `seedWorkspace()` re-seed
- Smoke test extends: verify `@openclaw/whatsapp` trong vendor, patch anchors còn match

## 7. Testing strategy

### 7.1. Unit (dev machine)
- Mock baileys events, test patch injection idempotency (run ensure*Fix 5 lần → file không phình)
- Test sendWhatsApp split logic với messages 500/2500/6000 chars
- Test sendCeoAlert với 3 channels, simulate 1/2/3 failures

### 7.2. Integration (dev WhatsApp account)
- Fresh install RESET.bat → RUN.bat → wizard skip WhatsApp → onboard OK, không có WhatsApp tab
- Fresh install → wizard tick WhatsApp → scan QR → login OK → nhắn bot → reply OK
- Existing install → Dashboard sidebar "WhatsApp · chưa kết nối" → click → modal QR → login → tab xuất hiện đầy đủ
- Test mode gate: set mode=read → khách nhắn → bot im lặng, log drop
- Test pause: pause 10 min → khách nhắn → bot im lặng, resume → reply
- Test group: thêm bot vào group WhatsApp → default mode=off → bot im → đổi mode=mention → chỉ reply khi mention → đổi all → reply mọi tin

### 7.3. E2E (CEO test account — dry run trước ship)
- Ship TestFlight-equivalent tới 1 CEO tình nguyện có WhatsApp account → 48h observation
- Monitor `ceo-alerts-missed.log`, `security-output-filter.jsonl`, `whatsapp.log`
- Verify triple alert fires đúng (Telegram + Zalo + WhatsApp cùng nhận được "boot ping")

### 7.4. Soak test
- Chạy 7 ngày liên tục, restart Electron mỗi 24h, verify:
  - Session persist qua restart (không phải scan lại QR)
  - Patches re-apply không error
  - Memory files không phình > 50KB
  - Watchdog không false-positive kill gateway

## 8. Rollback strategy

- Branch `feat/whatsapp-optional` tách biệt từ main
- Nếu critical bug xuất hiện post-ship:
  - Quick rollback: bump config `channels.whatsapp.enabled = false` qua auto-update config patch → existing install disable WhatsApp nhưng giữ app running
  - Hard rollback: ship v2.4.1 revert tất cả WhatsApp code → main
- Cherry-pick main hotfix vào branch khi branch đang dev (default pattern)

## 9. Migration — existing installs

Fresh install: không migration cần.

Existing v2.3.x install upgrade lên v2.4.0:
1. Auto-update fires
2. App restart → `ensureDefaultConfig()` thêm `channels.whatsapp` với `enabled: false`
3. `seedWorkspace()` tạo `memory/whatsapp-*/`, `config/whatsapp-*`
4. Dashboard load → sidebar thêm WhatsApp item "chưa kết nối"
5. CEO không bị ép làm gì — tùy click

Zero-disruption: existing Zalo/Telegram flow KHÔNG thay đổi.

## 10. Open questions

- [ ] `@openclaw/whatsapp` có expose HTTP endpoint `/channels/whatsapp/send` + `/status` không, hay plugin dùng internal message bus khác? → cần đọc plugin source để confirm integration API.
- [ ] QR refresh interval plugin default là bao nhiêu (20s giống Zalo, hay khác)?
- [ ] baileys protocol có queue tin nhắn khi session offline không, hay lost hoàn toàn như assumption?
- [ ] System message `messageStubType` values cần filter — cần reverse-engineer từ baileys source hoặc doc.
- [ ] Deliver-coalesce pattern có apply được cho baileys send API không, hay baileys tự coalesce đã?

**Cần investigation trước khi plan impl** — spawn agent đọc plugin source + baileys docs trong plan phase.

## 11. Success criteria

Ship v2.4.0 thành công khi:

1. Fresh install CEO không dùng WhatsApp → onboard trong <3 phút, không thấy WhatsApp UI interruption
2. Fresh install CEO dùng WhatsApp → scan QR trong wizard → bot reply được trong <5 phút total
3. Existing install upgrade v2.3.44 → v2.4.0 → zero disruption Zalo/Telegram trong 24h observation
4. 1 customer test account nhắn WhatsApp + Zalo + Telegram simultaneously trong 1 giờ → 0 cross-talk, 0 leaked messages, 0 output filter false positive
5. Watchdog test: kill WhatsApp session thủ công → auto-reconnect trong 30s-5min → KHÔNG kill gateway, KHÔNG disrupt Zalo/Telegram
6. `ceo-alerts-missed.log` trống sau 7 ngày soak test
7. Smoke test pass trên cả fresh + existing install

---

**Next step:** dispatch spec-document-reviewer subagent cho spec review loop.
