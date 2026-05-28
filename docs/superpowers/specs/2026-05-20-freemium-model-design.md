# 9BizClaw Freemium Model — Design Spec

**Date:** 2026-05-20
**Status:** Draft
**Goal:** Convert the all-or-nothing premium gate into a freemium funnel — Free users get full AI agent + Telegram/Zalo, Premium unlocks advanced channels + features. Single EXE, server-issued decrypt key for anti-crack.

## 1. Feature Tiers

| Feature | Free | Premium |
|---------|------|---------|
| Telegram bot | Full | Full |
| Zalo bot (DM + groups) | Full | Full |
| AI agent (9Router/ChatGPT) | Full | Full |
| Cron jobs (scheduled tasks) | Full | Full |
| Knowledge documents | Full | Full |
| Channel pause/resume | Full | Full |
| Persona/personality editor | Full | Full |
| Backup/restore | Full | Full |
| **Facebook scheduling** | Locked | Full |
| **Google Workspace** | Locked | Full |
| **Brain knowledge graph** | Locked | Full |
| **Appointments** | Locked | Full |

Free is powerful enough to run a real business (AI bot on Telegram + Zalo + cron + knowledge). Premium unlocks advanced integrations. Conversion driven by feature envy, not time pressure.

## 2. First Launch UX

```
App start
    |
    v
+-----------------------------------+
|  Splash: "Chao mung den 9BizClaw"  |
|                                   |
|  +-----------+  +------------+    |
|  |   FREE    |  |  PREMIUM   |    |
|  |           |  |            |    |
|  | Telegram  |  | Tat ca     |    |
|  | + Zalo    |  | kenh       |    |
|  | + AI      |  | + Brain    |    |
|  |           |  | + FB       |    |
|  | [Bat dau] |  | [Nhap key] |    |
|  +-----------+  +------------+    |
+-----------------------------------+
    |                    |
    v                    v
  wizard.html       license.html
  (skip FB/Google     (activate key)
   steps)                |
    |                    v
    |              post-activate:
    |              restore backup
    |              or wizard.html (full)
    |                    |
    v                    |
  dashboard.html <-------+
  (free mode)      (premium mode)
```

**Existing premium user:** boot -> `checkLicenseStatus()` -> valid -> server validate -> decrypt premium modules -> dashboard (premium). No splash.

**Existing free user:** boot -> no license, `freeChosen: true` in config -> dashboard (free). No splash.

**Upgrade path:** Sidebar "Nang cap Premium" -> inline license activation -> restart to decrypt modules.

## 3. Server Infrastructure

Existing Supabase instance (already used for license activations + revocation). Add 1 Edge Function:

```
POST /functions/v1/validate-session

Request:  { licenseKey, machineId, appVersion }
Response: {
  status: "ok",
  features: ["facebook", "google", "brain", "appointments"],
  decryptKey: "base64...",    // AES-256 per-build key
  expiresAt: "2026-05-20T16:00:00Z"  // 4h TTL
}

Errors:
  401 - key invalid/expired/revoked
  403 - machine mismatch
  429 - rate limit (max 10 calls/day per key)
```

**Key design decisions:**
- `decryptKey` is rotated per-build. Each EXE version ships with .enc files encrypted with that build's key. Server maps `appVersion` -> correct decrypt key. Old builds stop getting keys when deprecated. A leaked key from one build does not compromise future builds.
- Response cached locally 4h (not 24h — limits piracy window after revocation to 4h max).
- Cache file encrypted with machine-bound HMAC (same seal pattern as `license.json`). Copy cache to another machine = seal verification fails.
- Rate limit 10/day prevents brute-force.
- Free users never call this endpoint. Free mode needs no internet to boot (only for AI agent runtime).
- **Offline grace:** If server unreachable and cache expired, app downgrades to Free mode (not blocked). Premium features locked until next successful validation. User sees banner: "Khong ket noi duoc may chu. Cac tinh nang Premium tam khoa." Data intact, just features locked.

## 4. Encrypted Premium Modules

### Build time (`scripts/encrypt-premium.js`)

```
1. Generate BUILD_ENCRYPT_KEY = random 32 bytes (unique per build, stored in CI artifact for server upload)
2. For each premium module [facebook, google, brain, appointments]:
   - Read electron/lib/{name}.js
   - Run javascript-obfuscator (control flow flattening, string encoding) BEFORE encryption
   - Generate random 16-byte IV
   - AES-256-GCM encrypt (key=BUILD_ENCRYPT_KEY, iv=IV)
   - Write electron/lib/{name}.enc = IV(16B) + authTag(16B) + ciphertext
   - Delete electron/lib/{name}.js from build output
3. Write electron/lib/premium-manifest.json with { buildId, version }
4. Upload BUILD_ENCRYPT_KEY + buildId to Supabase (CI step, after electron-builder)
   Server stores: { buildId -> encryptKey, appVersion, createdAt }
```

### Runtime (`electron/lib/premium-loader.js`)

```
loadPremiumModule(name, decryptKey):
  1. Read {name}.enc from asar
  2. Split: IV (16B) + authTag (16B) + ciphertext
  3. AES-256-GCM decrypt into Buffer
  4. module._compile(decryptedSource, filename) -> return exports
  5. NEVER write decrypted source to disk

getPremiumStub(name):
  return { available: false, reason: 'premium_required' }
```

### Boot flow in main.js

```
if (plan === 'premium') {
  const session = await validateSession(key, machineId);
  for (const mod of session.features) {
    global.__premium[mod] = loadPremiumModule(mod, session.decryptKey);
  }
} else {
  for (const mod of PREMIUM_MODULES) {
    global.__premium[mod] = getPremiumStub(mod);
  }
}
```

**What a cracker sees** after `asar extract`:
```
electron/lib/facebook.enc    <- binary gibberish
electron/lib/google.enc      <- binary gibberish
electron/lib/brain.enc       <- binary gibberish
electron/lib/license.js      <- readable, no decrypt key
electron/main.js             <- readable, free features work
```

## 5. Dashboard Feature Gating UX

### Sidebar layout (Free mode)

```
-- Dang dung ------------------
  Tong quan
  Lich trinh
  Telegram
  Zalo
  Tri thuc
  Tinh cach

-- Premium --------------------
  Facebook            [locked]
  Google Workspace    [locked]
  Brain Graph         [locked]
  Lich hen            [locked]

-- Coming Soon ----------------
  Kenh chat
    Messenger          [locked]
    WhatsApp           [locked]
    Instagram DM       [locked]
    Zalo OA            [locked]
    LINE               [locked]

  Quang cao
    Facebook Ads       [locked]
    Google Ads         [locked]
    TikTok Ads         [locked]
    Zalo Ads           [locked]

  Truyen thong da kenh
    TikTok Auto Post   [locked]
    YouTube/Reels      [locked]
    LinkedIn           [locked]
    X (Twitter)        [locked]

  San TMDT
    Shopee             [locked]
    TikTok Shop        [locked]
    Lazada             [locked]

  Ban hang & CRM
    Pipeline quan ly deal  [locked]
    Follow-up tu dong      [locked]
    CRM khach hang         [locked]
    Bao cao doanh so       [locked]

  Tai chinh
    Thu chi hang ngay      [locked]
    Bao cao P&L            [locked]
    Theo doi cong no       [locked]
    Cashflow forecast      [locked]

  Van hanh
    SOP & Quy trinh        [locked]
    Inventory tracker      [locked]
    Checklist van hanh     [locked]

  Nhan su
    Tuyen dung & JD        [locked]
    Onboarding plan        [locked]
    KPI & Performance      [locked]

  Chien luoc
    SWOT / Porter 5        [locked]
    OKR builder            [locked]
    Business plan          [locked]

  Tang truong
    Pitch deck             [locked]
    Franchise model        [locked]
    Valuation              [locked]
------------------------------
  ^ Nang cap Premium
```

### Click locked Premium item

Shows upgrade panel with feature description + "Nhap key Premium" button + contact info.

### Click Coming Soon item

Same panel but with "Sap toi" badge. Static UI only — no backend code needed. When a feature ships, move from Coming Soon to Premium section + add .enc module.

### Coming Soon sidebar UX

~35 items grouped into 10 categories. Categories are **collapsed by default** — user sees category headers only, expand to see items. Prevents overwhelming the sidebar while still showing platform breadth.

### Premium mode sidebar

Premium section items unlocked (no lock icon). Coming Soon items still show "Sap toi" for both tiers.

### Upgrade flow from Dashboard

1. Click "Nang cap Premium" or any locked Premium item
2. Inline panel with key input (reuse license.html activation logic)
3. Activate -> server validate -> receive decrypt key
4. Prompt restart ("Khoi dong lai de kich hoat")
5. Restart -> boot with premium modules decrypted

## 6. Build Pipeline + Anti-crack

### Build chain change

```
Before: prebuild:modoro-zalo -> smoke -> electron-builder
After:  prebuild:modoro-zalo -> smoke -> encrypt-premium -> electron-builder
```

Smoke runs BEFORE encryption (smoke tests import premium modules as normal JS). Encryption is the last step before packaging.

### Anti-crack layers (5 layers)

| # | Layer | Defends against |
|---|-------|----------------|
| 1 | Encrypted .enc modules | asar extract -> only binary gibberish, no JS to patch |
| 2 | Server-issued decrypt key | Patch out license check -> still no key to decrypt modules |
| 3 | Machine-bound HMAC seal | Copy license.json / cache file to another PC -> seal fails |
| 4 | Supabase revocation | Share key online -> revoke instantly, key dies |
| 5 | Private GitHub repo | Source code not publicly accessible |

### Repo visibility

- `PeterBui85/9BizClaw-Premium` -> set Private on GitHub
- Update checker still works (GitHub API with token)
- CI/CD (GitHub Actions) works on private repos

### `package.json` change

Remove `membership: true` flag. Replace with runtime tier detection:
- No license file + `freeChosen: true` -> free mode
- Valid license + server session -> premium mode
- No license + no `freeChosen` flag -> show splash (first launch)

## 7. Constraints & Risks

**Constraints:**
- Single EXE distribution (no separate Free/Premium builds)
- Free users never need internet to boot (only for AI at runtime)
- Premium code must never exist as plaintext on free user's disk
- Must work with existing Supabase license infrastructure

**Risks:**
- **Memory dump attack:** Determined reverse engineer with legit key can dump decrypted modules from process memory via `--inspect` or heap dump. Mitigation: javascript-obfuscator applied BEFORE encryption (launch requirement, not deferred). Control flow flattening + string encoding makes dumped code very hard to read.
- **Key sharing in small circles:** If a few users share 1 key privately, hard to detect unless activation count monitored. Mitigation: Supabase tracks activations per key, alert on unusual machine count.
- **Server downtime:** If Supabase Edge Function is down and cache expired, app downgrades to Free (not blocked). 4h cache TTL means brief outages covered. Extended outage = Free mode with banner.
- **Build key leak:** If a build's encrypt key leaked, that build's .enc files are decryptable. Next build generates a new key automatically. Old builds can be deprecated server-side (stop returning key for that buildId).

## 8. Conversion Analytics

Track Free-to-Premium funnel (the entire business goal):

- **Supabase Edge Function** logs every `validate-session` call: `{ licenseKey, machineId, appVersion, timestamp }`
- **App telemetry** (opt-in, sent on boot if online):
  - `tier: free|premium`
  - `daysOnFree: N` (days since `freeChosen` was set)
  - `lockedFeatureClicks: { facebook: N, google: N, brain: N, ... }` (which locked items user clicked)
  - `upgradeButtonClicks: N`
- **Supabase dashboard** shows: total free users, total premium, conversion rate, avg days-to-convert, most-clicked locked features
- All telemetry anonymous (machineId hash, no PII). Disable via Settings if user opts out.

## 9. Files Changed / Created

**New files:**
- `scripts/encrypt-premium.js` — build-time encryption step
- `electron/lib/premium-loader.js` — runtime decrypt + module._compile
- `electron/lib/premium-manifest.json` — generated by encrypt step
- `electron/ui/splash.html` — Free/Premium choice screen
- Supabase Edge Function `validate-session`

**Modified files:**
- `electron/main.js` — boot flow: splash routing, tier detection, premium module loading, sidebar data
- `electron/ui/dashboard.html` — sidebar sections (Premium locked + Coming Soon), upgrade panel, feature gate UI
- `electron/ui/license.html` — reuse for inline upgrade flow
- `electron/preload.js` — new IPC bridges for tier/upgrade
- `electron/lib/license.js` — add `validateSession()`, remove `membership` flag logic
- `electron/package.json` — remove `membership: true`, add encrypt-premium to build scripts
- `build-win.yml` / `build-mac.yml` — add MASTER_ENCRYPT_KEY secret, add encrypt-premium step
