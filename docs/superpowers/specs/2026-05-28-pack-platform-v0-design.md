# Pack Platform v0 — Design Spec

**Status:** Draft v1
**Date:** 2026-05-28
**Author:** Brainstorm session (CEO + Claude), reviewer pass (2026-05-28)
**Parent (superseded):** [`2026-05-28-nha-khoa-workflow-pack-design.md`](2026-05-28-nha-khoa-workflow-pack-design.md)
**Siblings (deferred):**
- [`2026-05-28-pack-license-and-update-design.md`](2026-05-28-pack-license-and-update-design.md) — Ed25519 per-pack license + daily update cron (plugs in on top of this spec)
- [`2026-05-28-nha-khoa-pack-content-design.md`](2026-05-28-nha-khoa-pack-content-design.md) — first concrete pack content (depends on this spec)

---

## 1. Problem Statement

9BizClaw today is a single-tenant AI assistant for one CEO running one business. The same architecture (Telegram + Zalo gateways, openclaw agent, AGENTS.md persona) can be packaged into reusable **workflow packs** — domain-specific bundles of personas, slash commands, conversational flows, SOPs, scheduled jobs, and escalation logic that a business (clinic, gym, salon, shop) installs into their copy of MODOROClaw and runs as their virtual receptionist.

This spec defines **only the platform**: the folder format, manifest, lifecycle, dispatcher, flow runtime, SOP loader, escalation framework, channel adapter, content-authoring contract, install wizard contract, and the migration of the empty `data/zalo-menu/catalog.json` into a free `_menu-default` pack.

License enforcement and pack content are out of scope (see sibling specs).

### Out of scope for v0

- License enforcement (sibling spec).
- Auto-update daily cron (sibling spec).
- Concrete pack content (dental, gym, etc. — sibling specs).
- Multi-tenant SaaS (each install serves one business on its own PC).
- Marketplace UI (bundled + private repo install for v1; marketplace deferred).
- Tenant content overrides (CEO editing pack files directly — deferred to v1.1).
- Decision-tree flows (slot-filling only for v1).
- WhatsApp adapter (channel adapter interface is defined; implementation deferred to v1.5).

### Constraints (from CLAUDE.md + auto-memory, must hold)

- **No emojis in UI/CEO-facing text** (HARD). Pack content for end-customer chat MAY contain emoji (separately governed by each pack).
- **Never create a second Telegram `getUpdates` poller.** All Telegram delivery goes through existing `sendTelegram` / `sendTelegramTo` helpers (gateway is the sole poller).
- **Never use PowerShell to write `openclaw.json`.** All `openclaw.json` writes go through the in-process Node helper `writeOpenClawConfigIfChanged` (CLAUDE.md "Gateway is restarting mid-reply" history).
- **Vietnamese-first for clinic-owner-visible artifacts.** Folder names, file names, manifest field labels: Vietnamese (camelCase, no diacritics) where the business owner browses, edits, or is aware. Pure code stays English-shaped.

---

## 2. Architecture

### 2.1 Per-channel pipelines, shared services

```
+- MODOROClaw process -----------------------------------------+
|                                                              |
|  +- Per-channel pipelines (parallel) -----------------------+|
|  |  Zalo gateway :18789      Telegram gateway :18790        ||
|  |       |                         |                        ||
|  |  Zalo adapter             Telegram adapter               ||
|  |       |                         |                        ||
|  |  inbound pipeline         inbound pipeline               ||
|  |  (dedup, rate-limit,      (rate-limit, command-block,    ||
|  |   command-block, ...)      ...)                          ||
|  |       |                         |                        ||
|  |  >>> shared dispatcher (global.__packDispatcher) <<<     ||
|  +----------------------------------------------------------+|
|                          |                                   |
|  +- Shared services -----+---------------------------------+|
|  |  Pack registry  | Identity      | Cron                  ||
|  |  Audit          | Knowledge RAG | Flow runtime          ||
|  |  SOP loader     | Escalation    | Channel adapter reg.  ||
|  |  Tenant config  | CEO control plane                     ||
|  +----------------------------------------------------------+|
|                          |                                   |
|  workspace/                                                  |
|    packs/<pack-id>/        # installed pack (read-only)      |
|    packs/<pack-id>-rendered/  # Mustache output (read-only)  |
|    config/tenants/<pack-id>.json  # per-pack wizard output   |
|    state/                                                    |
|      flows/               # active flow state per customer   |
|      paused-topics.json   # post-escalation freeze table     |
|      escalation-queue.jsonl    # see §6                      |
|    pack-registry.json     # in-memory map persisted to disk  |
+--------------------------------------------------------------+
```

### 2.2 Channel isolation principle

Each channel runs its **own gateway process, its own agent runtime, its own inbound pipeline**, on its own port. Channels do NOT cross-talk on the wire. Cross-channel coordination happens only through shared services (e.g., an escalation triggered on Zalo lands in both a Telegram staff group and a Zalo staff group via the escalation router, but each delivery goes through the respective channel's adapter and gateway).

**Caveat:** The dispatcher itself is a **process-global singleton** (`global.__packDispatcher`). Pack install/uninstall mutates dispatcher state and requires gateway restart, which affects both channels. This is the explicit source of cross-channel coupling. It is acceptable for v0 because install/update is rare and operator-initiated.

Benefit: a slow Zalo turn does not block a Telegram turn. A Zalo gateway crash does not take Telegram down.

### 2.3 Pack / channel / tenant separation

- **Pack** (read-only): content, flows, SOPs, persona templates, manifest. Lives in `packs/<pack-id>/`.
- **Tenant** (per-install, per-pack): the business's specific config — name, hours, staff, services, prices, group IDs. Lives in `config/tenants/<pack-id>.json`. Each pack has its own tenant file (a single MODOROClaw install runs at most one tenanted pack of a given kind, but multiple different packs may coexist).
- **Channel**: how customers reach the bot. Pack declares `kenh: ["zalo"]`; v1.5 adds `"whatsapp"`.

Each pack version × tenant config → rendered content via Mustache at install time → resolved files written under `packs/<pack-id>-rendered/`. Gateway loads rendered files; the un-rendered pack source is never read at runtime.

### 2.4 Single-tenant assumption

Each MODOROClaw installation serves exactly one business. Selling to two businesses = two installations. Multi-tenant routing is out of scope.

---

## 3. Pack Folder Structure

Vietnamese folder/file names everywhere the business owner might browse, edit, or be aware of. Pure code stays English-shaped. The structure below is the **contract** every pack must conform to; concrete file lists are pack-specific.

```
packs/<pack-id>/
  manifest.json
  cau-hinh.schema.json              # JSON Schema -> wizard auto-generates form
  vi-du-cau-hinh.json               # filled-in example for docs
  HUONG-DAN.md                      # what this pack does, how to install, FAQ

  tinh-cach/                        # persona templates (Mustache)
    SOUL.md                         # personality, tone, hard refusals
    IDENTITY.md                     # name, role, language
    AGENTS.md.tmpl                  # main agent system prompt template

  lenh/                             # one .md per slash command (Mustache)
    <command-name>.md  ...

  quy-trinh/                        # slot-filling flow definitions
    <flow-id>.json  ...

  quy-trinh-chuan/                  # SOPs (RAG-indexed) + core (always-loaded)
    _co-ban/                        # always-loaded; size cap enforced (§5.1)
      *.md
    <specialty-folder>/             # specialty SOPs (RAG-indexed)
      *.md

  kien-thuc/                        # long-form reference (RAG-indexed)
    *.md

  lich-tu-dong/                     # cron templates
    <cron-id>.json  ...

  chuyen-tiep/                      # escalation
    the-canh-bao.md                 # card template sent to staff groups
    topics.json                     # topic classifier keywords/intents

  ham-tuy-chinh/                    # optional custom hooks (pack-author code)
    pack.js                         # exports named functions

  ngon-ngu/                         # UI strings (errors, confirmations)
    vi.json
```

### 3.1 Manifest schema

`manifest.json` (every field required unless marked optional):

```json
{
  "id": "nha-khoa",
  "ten": "Nha khoa — Quản lý toàn diện",
  "moTa": "Lễ tân ảo cho phòng khám nha khoa",
  "phienBan": "1.0.0",
  "kenh": ["zalo"],
  "banQuyen": {
    "loai": "tra-phi",                 // "tra-phi" | "mien-phi"
    "prefix": "CLAW-PACK-NHA-KHOA-"    // license key prefix; ignored if mien-phi
  },
  "yeuCau": {
    "phienBanApp": "2.5.0"             // semver minimum app version
  },
  "tienIch": {                          // optional; pack-author-provided hooks
    "<hook-name>": "ham-tuy-chinh/pack.js#<exported-fn-name>"
  },
  "quyen": [                            // permission scope for sandbox
    "doc-khach-hang",
    "ghi-khach-hang",
    "gui-zalo",
    "gui-telegram"
  ]
}
```

Keys with no diacritics (camelCase Vietnamese) are valid JavaScript identifiers; code reads `manifest.phienBan` directly.

### 3.2 Pack content invariants

- All `.md`, `.json.tmpl`, `.md.tmpl` files MAY contain `{{mustache.vars}}` referencing tenant config fields.
- All file names are stable; renaming a file = breaking change requiring a major-version bump.
- `manifest.json` and `cau-hinh.schema.json` MUST validate against the pack platform's meta-schema (shipped in app at `electron/schemas/pack-manifest.schema.json` and `electron/schemas/pack-config.meta.schema.json`).
- Pack content MUST NOT reference absolute paths outside the pack folder.
- `ham-tuy-chinh/pack.js` (if present) runs in a Node VM context (§8.2).
- Pack ID matches `/^[a-z][a-z0-9-]{2,31}$/` (lowercase, dash-separated, 3-32 chars).

---

## 4. Dispatcher and Flow Runtime

### 4.1 Pipeline injection

The pack dispatcher slots into the existing `electron/packages/modoro-zalo/src/inbound.ts` pipeline between `msg-length-gate` and `vision-safety`. Injection uses the established idempotent marker pattern (consistent with `ZALO-OWNER-PATCH-V2`, `DELIVER-COALESCE`, `COMMAND-BLOCK` precedents in CLAUDE.md):

```ts
// === 9BizClaw PACK-DISPATCHER PATCH v1 ===
const __pkDispatch = (globalThis as any).__packDispatcher;
if (__pkDispatch && typeof __pkDispatch.handle === "function") {
  const result = await __pkDispatch.handle(message);
  if (result?.handled) return;
}
// === END 9BizClaw PACK-DISPATCHER PATCH v1 ===
```

`global.__packDispatcher` is registered by `electron/lib/dispatcher.js` at boot, after `pack-loader.loadAll()`. Patch is re-injected idempotently on every `startOpenClaw()` (consistent with existing patch precedents).

Telegram is owner-only in v0 — Telegram inbound is handled inside the gateway via existing agent flow; dispatcher is **not** wired into Telegram inbound in v0. (Pack staff-group commands like `/tieptuc` are recognized via a dedicated thread-scoped path inside the escalation router; see §6.5.)

### 4.2 Dispatcher decision order

For every Zalo inbound message that survives prior filters:

```
1. paused-topic check
   if paused-topics.json has entry for {channel,customerId} AND
      message matches a paused topic (via topic classifier §6.3) ->
        reply with stand-by line, return handled=true
2. active flow check
   if state/flows/<channel>:<customerId>.json exists (and not expired) ->
        flow-runtime.tick(state, message), return handled=true
3. slash command (first-token match — see §4.3)
   if first-token rule passes AND command exists in any active pack's
      lenh/ registry ->
        render command file with vars, send, return handled=true
4. flow trigger match
   if message text matches a flow's "kichHoat" pattern (intent or phrase) ->
        start flow, ask first slot, return handled=true
5. fallthrough
   return handled=false  -> LLM agent gets the message
```

### 4.3 Slash command match rule

Match is **first-token-based** (not substring, not whole-line-equality). After `message.rawBody.trim()`:

- Split on whitespace into `[token0, ...args]`.
- `token0` MUST match `/^\/[a-zA-Z0-9_-]+$/` (no diacritics in command names; case-sensitive; lowercase by convention).
- `token0` without the leading slash MUST exist in some active pack's `lenh/` directory.
- Remaining `args` are passed to the command renderer as a Mustache var `args` (string array).

Examples:

| Input | Matches? | Why |
|---|---|---|
| `/menu` | yes | leading slash, `menu` exists, no args |
| `/bg 9b` | yes | leading slash, `bg` exists, args=`["9b"]` |
| `tôi muốn biết về sản phẩm` | no | substring "sanpham" present but no leading slash |
| `xin chào /menu` | no | slash not at start |
| ` /menu` | yes | leading whitespace stripped by `trim()` |
| `/Menu` | no | case-sensitive; commands are lowercase |
| `/khongtontai` | no | does not exist in any `lenh/` |
| `/menu extra args here` | yes | only token0 must match command regex; args ignored |

### 4.4 Slot-filling flow runtime

```js
// electron/lib/flow-runtime.js
async function tick(channel, customerId, message) {
  const state = await loadFlowState(channel, customerId);
  if (!state) return null;

  if (matchesCancel(message, state)) return cancelFlow(state);
  if (matchesEscalate(message, state)) return escalateFlow(state);

  const slot = nextEmptySlot(state);
  if (!slot) return await completeFlow(state);  // all slots full -> hook

  const extracted = await extractSlot(slot, message, llm);  // §4.5
  if (extracted.value === null) {
    state.attempts[slot.ten] = (state.attempts[slot.ten] || 0) + 1;
    if (state.attempts[slot.ten] >= 3) return escalateFlow(state);
    return ask(slot.hoi);
  }

  const validation = await validateSlot(slot, extracted.value);
  if (!validation.ok) return askWithHint(slot, validation.hint);

  state.values[slot.ten] = extracted.value;
  state.lastInteractionAt = nowIso();
  // timeoutAt is recomputed on every state save: lastInteractionAt + timeoutPhut
  state.timeoutAt = addMinutes(state.lastInteractionAt, state.timeoutPhut);
  await saveFlowState(channel, customerId, state);

  const next = nextEmptySlot(state);
  if (next) return ask(next.hoi);

  return await completeFlow(state);
}
```

**Flow state file** (`workspace/state/flows/zalo:123456.json`):

```json
{
  "flowId": "dat-lich",
  "packId": "nha-khoa",
  "startedAt": "2026-05-28T03:21:00Z",
  "lastInteractionAt": "2026-05-28T03:23:15Z",
  "timeoutAt": "2026-05-28T03:53:15Z",
  "timeoutPhut": 30,
  "values": { "dichVu": "cay-ghep", "ngay": "2026-06-02" },
  "attempts": { "buoi": 1 },
  "history": [
    { "role": "bot", "text": "...", "at": "..." },
    { "role": "user", "text": "...", "at": "..." }
  ]
}
```

**Timeout semantics (clarified):**
- `timeoutPhut` is set once when the flow starts, from the flow definition's `timeoutPhut` field.
- `timeoutAt` is **recomputed on every state save** as `lastInteractionAt + timeoutPhut`. A slow but engaged customer does NOT lose flow state mid-flow — every reply extends the deadline.
- Idle expiry sweep runs every 5 minutes; any flow state with `timeoutAt < now()` is moved to `workspace/state/flows/_expired/` (kept 7 days for debugging, then auto-deleted).

### 4.5 Slot extraction

Each slot has a `validate` field naming an extractor strategy. **Strategy syntax (clarified):**

| Strategy form | Meaning |
|---|---|
| `enum:literal:val1,val2,val3` | LLM picks one of literal values (comma-separated) |
| `enum:config:<field-path>` | LLM picks one of the values found at `tenant.<field-path>` (which must resolve to an array of `{ma,ten}` objects or strings) |
| `enum:config:<field-path>:<key>` | Same as above but extracts only the named key from each item (e.g., `enum:config:dichVu:ma`) |
| `ngay-trong-tuong-lai` | LLM extracts ISO date; validate `date > now()` |
| `ho-ten-vi` | LLM extracts name; regex validates Vietnamese full name (2-5 words, no digits) |
| `sdt-vn` | LLM extracts phone; regex validates Vietnamese phone format |
| `custom:<hook-name>` | Pack-provided JS hook in `ham-tuy-chinh/pack.js` (see §8.2) |

Reviewer fix: the earlier draft mixed `|` and `,` as separators in the same row. Replaced with a single, explicit form (`enum:literal:` for literal lists, `enum:config:` for tenant-config lookups, `:<key>` suffix when extracting a sub-key).

Extraction is a single LLM call per slot, with prompt:

```
Trích xuất giá trị cho field "{slotName}" từ tin nhắn người dùng.
Field type: {strategy}
{enum list if applicable}
Tin nhắn: "{message}"
Trả về JSON: { "value": "...", "confidence": 0.0-1.0 } hoặc { "value": null }
```

Confidence < 0.6 → treat as null → re-ask. Implementation goes through 9router (cheapest available model from 9router routing rules).

### 4.6 Flow completion hook

After all slots filled, `completeFlow(state)` runs:

1. If flow has `hoanThanh.hook`, call it with `state.values` and `ctx` (§8.2). Hook may return:
   - `{ confirm: "...text..." }` → bot sends confirm message and waits for next inbound to finalize.
   - `{ done: true, reply: "..." }` → bot sends final reply, deletes state.
   - `{ escalate: { topic, to } }` → escalate per §6.
2. If no hook (or hook timeout / throw), send `hoanThanh.fallback.say` and (if `hoanThanh.fallback.escalate` truthy) escalate.

---

## 5. SOP Hybrid Loading

### 5.1 Core (always-loaded)

`quy-trinh-chuan/_co-ban/*.md` are concatenated into the rendered `AGENTS.md` at install time. Total core budget: **15 KB after Mustache render**.

**Budget enforcement (clarified):**
- Install-time check: pack-loader sums the rendered sizes of all `_co-ban/*.md` files. If > 15 KB → **install rejected** with a clear error: "Pack `<id>` core SOPs exceed 15 KB (got NN KB). Move oversize files into a specialty folder for RAG retrieval."
- This is hard rejection, not truncation. Pack authors get a deterministic signal at build/install time.
- The 15 KB cap is documented in `HUONG-DAN.md` boilerplate for pack authors.

### 5.2 Retrieved (RAG)

`quy-trinh-chuan/<specialty>/*.md` + `kien-thuc/*.md` are indexed into the per-tenant Knowledge SQLite at pack install. Each row tagged `source = pack:<pack-id>` so pack removal cleans up cleanly.

**Vector search dependency (pinned):**
- v0 uses **plain cosine similarity in JavaScript** over embeddings stored as `Float32Array` blobs in SQLite — no native vector extension required.
- Reuses the existing Knowledge tab's embedding pipeline (per `electron/main.js:autoFixBetterSqlite3` + Knowledge IPC handlers + `electron/lib/knowledge-*.js`). New code: `electron/lib/sop-loader.js` adds a `vectorSearch({embedding, topK, threshold, filter})` helper that does an in-memory ranked scan over the filtered subset.
- Performance budget: scan of ~5,000 chunks per turn < 50 ms on the reference dev machine. If a pack has more, the SOP loader pre-filters by metadata tags before scoring (configured via `manifest.tienIch.sopPreFilter` if present).
- Rationale: avoids `sqlite-vec`/`sqlite-vss` ABI lock-in (which would re-introduce the better-sqlite3 ABI risk class CLAUDE.md already battled). Migration to a native vector extension is deferred until corpus size or latency justifies it.

**RAG injection point (clarified):**

The retrieval happens inside the **gateway agent's prompt-assembly path**, not in `inbound.ts` and not in the dispatcher. Concretely:

- `electron/lib/sop-loader.js` exports `augmentSystemPrompt(basePrompt, message) → augmentedPrompt`.
- The gateway agent's existing system-prompt assembly (in modoro-zalo's agent boot path) calls this helper.
- If `global.__packRegistry` has zero active packs → helper returns `basePrompt` unchanged.

```js
// inside the gateway agent's per-turn prompt assembly
const embedding = await embed(message.text);
const hits = await sopLoader.vectorSearch({
  embedding,
  topK: 4,
  threshold: 0.55,
  filter: { source: { startsWith: "pack:" } }
});
const retrieved = hits.map(h => `### ${h.title}\n${h.body}`).join("\n\n");
systemPrompt = baseSystemPrompt + (retrieved ? `\n\n### Quy trình liên quan:\n${retrieved}` : "");
```

If 0 hits clear the threshold → no `Quy trình liên quan:` section is added (LLM works from core SOPs alone).

### 5.3 Reuse of Knowledge tab infrastructure

The existing Knowledge tab already has SQLite + embedding pipeline (better-sqlite3 ABI-pinned to electron-v119; see CLAUDE.md "Knowledge DB path fix + better-sqlite3 ABI mismatch"). Pack install adds rows to the same DB with `source = pack:<pack-id>`. CEO's own Knowledge uploads continue to use `source = ceo-upload`. Both share retrieval.

---

## 6. Escalation Framework

This section defines the **mechanism**; pack-specific topic taxonomies and staff group IDs live in pack manifests + tenant config.

### 6.1 Trigger sources

| # | Source | Where it lives |
|---|---|---|
| 1 | Flow completion hook returns `escalate` | `flow-runtime.js` (§4.6) |
| 2 | LLM autonomous decision via tool-call `escalate(topic, reason, snippet)` | Registered in agent tool registry by pack-loader at install |
| 3 | Explicit slash command `/goisep <reason>` (or pack-defined synonym) | Standard `lenh/` command pointing at escalation router |
| 4 | Code-detected pattern (forced escalation, no LLM involved) | `escalation-router.js` `preCheckForcedEscalation(message)` called from dispatcher step 1.5 (between paused-topic check and active-flow check) |

**Source #4 contract (clarified):**
- Each pack may ship a `chuyen-tiep/forced-patterns.json` file with an array of regex patterns.
- At dispatcher step 1.5 (added explicitly for this), for each active pack, every regex is tested against `message.rawBody`.
- First match wins → `escalation-router.triggerEscalation({...})` is called → `return { handled: true }`.
- If no patterns match → continue with step 2 of §4.2.
- This path runs **before** the active-flow check, so a flow-in-progress with a forced-escalation trigger word still escalates.

### 6.2 Routing

```
triggerEscalation({channel, customerId, topic, reason, snippet}) ->
  1. write workspace/state/escalation-queue.jsonl entry
  2. write/update workspace/state/paused-topics.json:
       { "<channel>:<customerId>": { topics: [topic], escalatedAt, escalationId, reason } }
  3. processEscalationQueue poller (every 30s) reads queue:
     for each entry:
       a. format card via active pack's chuyen-tiep/the-canh-bao.md template (Mustache)
       b. send to Telegram staff group:
            sendTelegramTo(tenant.chuyenTiep.telegramGroupId, card)
       c. send to Zalo staff group:
            sendZaloTo(tenant.chuyenTiep.zaloGroupId, card)
       d. mark entry processed (move to escalation-archive.jsonl)
       e. audit log entry "escalation_dispatched"
```

**Reuse of existing infrastructure:** `processEscalationQueue` already exists in `electron/main.js` for the dental escalation MVP (per CLAUDE.md "Zalo escalation auto-forward to CEO"). Platform v0 generalizes it to be pack-aware (reads pack id off the queue entry, picks the card template from that pack's `chuyen-tiep/the-canh-bao.md` rendered file). The existing 30s polling cadence and audit-log shape are preserved. No second Telegram poller is created — the existing `sendTelegramTo` helper sends through the gateway, which is the sole Telegram poller (CLAUDE.md constraint).

### 6.3 Topic classification

`escalation-router.js` exposes `isTopicPaused(channel, customerId, message) → boolean`. Classification order:

```js
function classifyTopic(message, packTopicsJson) {
  // 1. Regex/keyword from active pack's chuyen-tiep/topics.json
  for (const [topic, patterns] of Object.entries(packTopicsJson)) {
    if (patterns.some(p => new RegExp(p, "i").test(message.text))) return topic;
  }
  // 2. Fallback: cheap LLM classifier (single call, returns topic name or null)
  return await llmClassify(message.text, Object.keys(packTopicsJson));
}
```

Dispatcher step 1:

```js
if (await isTopicPaused(channel, customerId, message)) {
  await reply("Em đã báo lễ tân hỗ trợ rồi ạ, anh/chị đợi chút em báo lại nhé.");
  return { handled: true };
}
```

(Pack may override the stand-by line via `ngon-ngu/vi.json` key `paused_standby`.)

### 6.4 Resume protocol

Staff sends in Zalo staff group OR Telegram staff group:

```
/tieptuc <customerName-or-id>
```

Bot looks up by name (CUSTOMERS index, fuzzy match) or by raw ID, removes the entry from `paused-topics.json`, and audit-logs `escalation_resolved`. Bot resumes normal handling on the next customer message.

**Auto-resume fallback:** if `escalatedAt` is older than 24 hours AND no `/tieptuc` was received, bot auto-resumes but writes an `escalation_auto_resumed` audit entry and pings the Telegram staff group: "Khách hàng X đã hỏi lại sau 24h — em tiếp tục trả lời, mọi người xem có cần can thiệp không."

### 6.5 Staff-group command thread-scoping

**Reviewer-flagged risk:** a customer DM-ing `/tieptuc Hùng` would otherwise resume their own paused topic.

**Fix:** `/tieptuc` is **not** registered in the regular `lenh/` registry. Instead:

- `escalation-router.js` exposes `handleStaffGroupMessage(message) → { handled }`.
- The dispatcher (§4.2) gets a **step 0** (before paused-topic check) that runs only when `message.isGroup && (message.threadId === tenant.chuyenTiep.zaloGroupId)`:

  ```js
  if (message.isGroup && message.threadId === activeTenant.chuyenTiep.zaloGroupId) {
    const result = await escalationRouter.handleStaffGroupMessage(message);
    if (result.handled) return result;
    // Bot does NOT respond to other staff-group messages (silent observer).
    return { handled: true };
  }
  ```
- Telegram-side `/tieptuc` is wired into the existing Telegram message handler in `main.js` with the same `threadId === tenant.chuyenTiep.telegramGroupId` check.

This makes staff-group commands physically unreachable from customer DMs: the command name `tieptuc` is never registered in the dispatcher's general command table, so even if a customer types `/tieptuc Hùng` in a DM, the dispatcher's slash-command lookup (§4.2 step 3) returns "command not found" and falls through to the LLM.

---

## 7. Tenant Config and Install Wizard

### 7.1 Config shape

`workspace/config/tenants/<pack-id>.json` is the wizard output. Schema is **pack-defined** via `cau-hinh.schema.json`; the platform only requires a few common fields (the rest are pack-specific).

**Platform-required top-level keys:**

```json
{
  "phongKham": { ... },          // or "doanhNghiep" / "phong-gym" / ... — pack picks
  "chuyenTiep": {
    "telegramGroupId": "-100xxx",
    "zaloGroupId": "g.xxx"
  },
  "kenhKhachHang": {
    "zalo": {
      "danhSachNhom": [],
      "danhSachDM": []
    }
  },
  "tinhCach": { ... }            // persona overrides; pack-defined sub-schema
}
```

The platform-level schema (`electron/schemas/pack-config.meta.schema.json`) validates only:
- `chuyenTiep` shape (string IDs, both required when pack declares `kenh: ["zalo"]`).
- `kenhKhachHang.zalo.danhSach*` are arrays of strings.

Everything else is delegated to the pack's `cau-hinh.schema.json`.

### 7.2 Wizard contract

Dashboard → "Workflows" tab → "Cài <pack>" launches the wizard. Wizard pages are **auto-generated** from `cau-hinh.schema.json` (JSON Schema dialect with custom extensions):

- `x-vi-label` → Vietnamese label override.
- `x-vi-hint` → Vietnamese help text.
- `x-vi-page` → group fields into named pages (`"page": "phong-kham"`, `"page": "chuyen-tiep"`, etc.).
- `x-test-button` (string) → renders a "Test" button next to the field; clicking calls `pack:wizard-test-field` IPC with the field path.

Generic page order (every pack):

| Step | Page |
|---|---|
| 1 | Activation key (only for `banQuyen.loai === "tra-phi"`; skipped for free packs) |
| 2..N | Pack-defined pages from `x-vi-page` groupings |
| N+1 | "Chuyển tiếp" page (staff groups) — required by platform |
| N+2 | "Tính cách bot" page — pack-defined sub-schema |
| Last | Xem trước → Cài đặt |

### 7.3 Install action

```
1. Write workspace/config/tenants/<pack-id>.json
2. Mustache-render every file in packs/<pack-id>/ matching *.md, *.md.tmpl, *.json.tmpl, AGENTS.md.tmpl:
     input = pack file
     vars  = tenant.json
     output = packs/<pack-id>-rendered/<same-relative-path>
3. If pack provides quy-trinh-chuan/_co-ban/*.md, concatenate rendered SOUL.md + IDENTITY.md + _co-ban/*.md
     -> write rendered AGENTS-pack-<pack-id>.md to workspace
     -> registry merges these into the gateway's primary AGENTS.md at boot
4. Index quy-trinh-chuan/<specialty>/*.md + kien-thuc/*.md into Knowledge SQLite:
     source = "pack:<pack-id>"
     for each file: chunk -> embed -> INSERT
5. Register pack's lenh/* with global.__packDispatcher
6. Register pack's quy-trinh/* with global.__flowRuntime
7. Register pack's lich-tu-dong/* with cron scheduler (all default OFF)
8. Stop pack-affected gateways gracefully (drain in-flight, max 60s):
     - openzalo gateway (always, since v0 packs all declare kenh: ["zalo"])
     - Telegram gateway is NOT restarted (v0 packs do not change Telegram routing)
9. Atomically swap rendered output into place (Windows-safe ordering — see §10 of license spec)
10. Start gateway back up
11. Smoke test: send "/<help-command>" to bot via internal IPC; expect non-error response
12. Mark pack status = "active" in pack-registry.json
13. Show success page; offer "Bật cron" toggles for each registered cron
```

**`openclaw.json` writes:** All config writes performed during install (e.g., adding pack-installed allowlist entries) MUST go through `electron/lib/openclaw-config.js:writeOpenClawConfigIfChanged` (CLAUDE.md "Gateway is restarting mid-reply" rule). Pack install MUST NOT shell out to `openclaw config set` or write the file directly with `fs.writeFileSync`. PowerShell is never used for `openclaw.json`.

---

## 8. Content Authoring (Mustache + JS Hooks)

### 8.1 Mustache

Pack content uses **Mustache** (logic-less templating) with two custom helpers registered by pack-loader:

| Helper | Syntax | Semantics |
|---|---|---|
| equal | `{{#equal a "literal"}}...{{/equal}}` | True branch when `a` deep-equals literal |
| each-section | `{{#section.name}}...{{/section.name}}` | Standard Mustache iteration |

Variables resolve against the tenant config object. Mustache safely escapes HTML by default; pack content uses `{{{triple}}}` for already-safe markdown blocks.

### 8.2 JS hook contract

`ham-tuy-chinh/pack.js`:

```js
module.exports = {
  // Called when a flow finishes all slots
  // values = slot values
  // ctx    = { tenant, lib: { dayjs, lodash, zod }, log: (msg) => void }
  // return = { done, reply, confirm, escalate }
  async <hookName>(values, ctx) {
    // ...
  }
};
```

**Sandbox model (clarified threat model):**

- **Threat model: pack authors are trusted (MODORO Tech writes all packs).** The VM context is a defense-in-depth guard, not a hard isolation boundary. We are not protecting against malicious pack code; we are protecting against accidental footguns (`process.exit`, large module loads, infinite loops).
- Hook runs in `vm.createContext` with:
  - `require` whitelist: `dayjs`, `lodash`, `zod`. Any other module name throws.
  - No `process`, `Buffer`, `globalThis`, `__dirname`, `__filename` exposed (whitelist via explicit `vm.createContext({...allowed})`).
  - Wall-clock timeout 3 seconds per call (terminated; treated as `{ done: true, reply: ctx.lib.fallback || "Em xin lỗi, em đang bận, mình đợi em tí ạ." }`).
- This is **not** a security sandbox against malicious code. If MODORO ever opens pack authoring to third parties, isolation must be re-designed (worker_threads + `--experimental-permission`, or a separate child process).

**Why not stronger isolation in v0?** Pack authors are MODORO-internal; the simpler VM context catches accidents and keeps the code-review surface small. Reviewer recommendation: explicitly stating this threat model up front prevents the spec from claiming security guarantees it doesn't deliver.

---

## 9. Channel Adapter

### 9.1 Interface

`electron/lib/channel-adapter.d.ts` (TypeScript declaration; the implementation files are `.js`):

```ts
export interface InboundMessage {
  channel: 'zalo' | 'telegram' | 'whatsapp';
  customerId: string;       // channel-scoped, e.g. "zalo:123", "wa:+84901..."
  threadId: string;         // DM or group identifier
  isGroup: boolean;
  fromOwner: boolean;       // CEO bypass for command-block
  rawBody: string;
  media?: { type: 'image' | 'video' | 'audio' | 'file'; url: string; mime: string; sha256: string };
  timestamp: number;
}

export interface OutboundReply {
  text?: string;
  media?: { localPath: string; caption?: string };
  buttons?: { label: string; value: string }[];   // see §9.2 fallback
  meta?: Record<string, unknown>;
}

export interface ChannelAdapter {
  id: 'zalo' | 'telegram' | 'whatsapp';
  send(threadId: string, reply: OutboundReply): Promise<void>;
  pause(threadId: string, minutes: number): Promise<void>;
  resume(threadId: string): Promise<void>;
  isReady(): Promise<{ ready: boolean; error?: string }>;
}
```

### 9.2 `buttons` field — graceful degradation

Zalo (via the openzalo plugin) does NOT support interactive buttons. v0 adapters MUST implement the following degradation when `reply.buttons` is non-empty:

- **Zalo adapter:** Render buttons as a numbered text list appended to `reply.text`:
  ```
  <reply.text>

  1. <buttons[0].label>
  2. <buttons[1].label>
  ...
  ```
  Send as a single text message. The `buttons` semantics (numbered choices) are then handled by the dispatcher's next-turn input parsing (a numeric reply matching a button index → resolves to that button's `value`).
- **Telegram adapter (when wired in a later version):** Render as inline keyboard.
- **WhatsApp adapter (v1.5):** Render as quick-reply buttons if media+template path is available; else fall back to numbered text (same as Zalo).

This is enforced by the adapter; flow definitions and command files can use `buttons` uniformly.

### 9.3 V0 implementation

`electron/lib/adapters/zalo-adapter.js` wraps existing `sendZaloTo`, `pauseChannel('zalo', ...)`, `probeZaloReady()`. No new wire-level code. The wrapping is purely structural: it implements the `ChannelAdapter` interface and registers itself in `channelAdapterRegistry` at boot.

### 9.4 V1.5 extension

`electron/lib/adapters/whatsapp-adapter.js` implements the same interface against WhatsApp Business Cloud API. Pack manifests declare `kenh: ["zalo", "whatsapp"]` to opt in. Adapter registers itself at boot. No change to the platform is required when this lands.

---

## 10. `_menu-default` Migration

**Trigger:** runs lazily on first open of the "Workflows" tab in Dashboard, **not** on app boot. Rationale (reviewer recommendation): a pack-platform bug during boot must not brick existing v2.4.x users. Lazy migration means a broken migration shows an error in the Workflows tab without affecting any other channel/feature.

**Source:** `data/zalo-menu/catalog.json`. Current content: `{"version":1,"updatedAt":"...","items":[]}` (empty array).

**Migration behavior:**
- If `items` is **empty** → migration creates a placeholder `_menu-default` pack with a single `/menu` command whose body says: "Phòng khám/Doanh nghiệp chưa cài đặt menu. Mở Dashboard → Workflows để cài pack." Pack status = `active` (free pack). No commands wired beyond `/menu`.
- If `items` is non-empty (some user has been editing the legacy schema in between) → each item becomes a `lenh/<id>.md` file in the `_menu-default` pack. Then a one-line "Workflows hiện đại có ở đây →" link is left in the Dashboard's old menu pane to nudge users.

**Side effects:** After successful migration, the `_menu-default` pack appears in the Workflows tab. `data/zalo-menu/catalog.json` is renamed to `data/zalo-menu/catalog.json.migrated.<ISO-DATE>` (kept for rollback). It is NOT deleted in v0.

The old Dashboard `#zalo-menu-pane` is hidden after migration; it is removed entirely one release later.

---

## 11. File-by-File Change Map

**File-extension convention:** All `electron/lib/*` files are `.js` (matches existing convention: `electron/lib/license.js`, `attachment-security.js`, etc.). TypeScript declaration files (`.d.ts`) are used **only** for type contracts shared between code and pack-author documentation. No `.ts` source files in `electron/lib/` (the modoro-zalo package has its own TS build under `electron/packages/modoro-zalo/`; nothing in this spec touches it beyond the inbound.ts patch).

```
NEW (platform v0):
  electron/lib/pack-loader.js              # discover, install, render, swap, uninstall
  electron/lib/pack-registry.js            # in-memory map: pack-id -> active dispatcher entries; persisted to workspace/pack-registry.json
  electron/lib/dispatcher.js               # first-token slash + flow trigger router (global.__packDispatcher)
  electron/lib/flow-runtime.js             # slot-filling state machine
  electron/lib/slot-extractor.js           # LLM-backed slot value extraction (calls 9router)
  electron/lib/sop-loader.js               # core preload + in-memory cosine search over Knowledge SQLite rows
  electron/lib/escalation-router.js        # generalized version of existing processEscalationQueue; queue + paused-topics + topic classifier + thread-scoped staff command handler
  electron/lib/channel-adapter.d.ts        # TypeScript interface definition (declarations only)
  electron/lib/adapters/zalo-adapter.js    # wraps existing sendZaloTo / pauseChannel('zalo') / probeZaloReady; implements ChannelAdapter
  electron/lib/openclaw-config.js          # writeOpenClawConfigIfChanged extraction (already exists inline in main.js; spec extracts to its own module for pack-loader to import)
  electron/schemas/pack-manifest.schema.json
  electron/schemas/pack-config.meta.schema.json
  electron/ui/workflows-tab.html           # Dashboard "Workflows" tab markup
  electron/ui/workflows-wizard.html        # generic wizard host; per-pack pages auto-generated from cau-hinh.schema.json
  electron/scripts/pack-build.js           # author tool (used in pack repo, NOT shipped to end-user)

MODIFY:
  electron/packages/modoro-zalo/src/inbound.ts
    + inject `9BizClaw PACK-DISPATCHER PATCH v1` marker between msg-length-gate and vision-safety
    + calls global.__packDispatcher.handle(message); if handled, return
    (idempotent patch in ensure*Fix() pattern — see CLAUDE.md precedents)

  electron/main.js
    + boot: pack-loader.loadAll() after openclaw boot, before startCronJobs
    + extract writeOpenClawConfigIfChanged to electron/lib/openclaw-config.js (callers still work)
    + generalize processEscalationQueue: read pack id from queue entry, pick card template from pack's rendered chuyen-tiep/the-canh-bao.md
    + IPC handlers:
        pack:list                          -> enumerate installed packs + status
        pack:install-from-folder (id)      -> for v0, install from packs/_staging/<id>/; license-locked install is the sibling-spec
        pack:wizard-submit (id, config)    -> render + index + register
        pack:uninstall (id, keepData)      -> archive / delete
        pack:wizard-test-field (id, path)  -> e.g. test Zalo group send
        pack:run-menu-migration            -> manual trigger of §10 migration
    + register pack crons via existing cron scheduler
    + flow state directory: workspace/state/flows/, sweeper every 5 min

  electron/preload.js
    + add window.claw.packs bridge for the 6 IPC handlers above

  electron/ui/dashboard.html
    + add "Workflows" sidebar nav item
    + keep existing #zalo-menu-pane for one release; after §10 migration, hide it; remove entirely in v0.1
```

---

## 12. Acceptance Criteria

1. **Pack discovery:** putting a valid pack folder under `packs/<id>/` and restarting the app makes the pack appear in the Workflows tab with status = `installed` (not yet active until wizard runs).
2. **Dispatcher slash command:** a registered command (e.g. `/menu`) sent to bot via test Zalo DM responds with the rendered command file content; an unregistered command (`/khongtontai`) falls through to the LLM.
3. **First-token rule:** `/menu` matches; `xin chào /menu` does NOT match (falls through); `/Menu` does NOT match.
4. **Flow lifecycle:** triggering a flow via `/<cmd>` walks through all slots, validates each, calls the completion hook, and clears flow state. A `/huy` mid-flow exits cleanly.
5. **Flow timeout:** an inactive flow state with `timeoutAt < now()` is swept into `_expired/` within 5 minutes. An actively-progressing flow (one reply per minute for 60 minutes) does NOT expire because `timeoutAt` is recomputed on every reply.
6. **SOP RAG:** with one specialty SOP file indexed, a relevant test query returns it in the retrieved set (logged in the system prompt); an unrelated query (e.g., "thời tiết hôm nay thế nào") returns no hits and the system prompt has no `Quy trình liên quan:` block.
7. **Core SOP budget enforcement:** a pack with `_co-ban/` totaling > 15 KB after render is rejected at install with a clear error.
8. **Escalation:** triggering `/goisep` (or autonomous escalate) causes a card to land in both the configured Telegram staff group and Zalo staff group within 30 seconds. Audit log has `escalation_dispatched` entry.
9. **Forced-pattern escalation:** a customer message matching a pattern in `chuyen-tiep/forced-patterns.json` triggers escalation immediately, bypassing any in-progress flow.
10. **Paused-topic enforcement:** after escalation, the same customer pushing the same topic gets the stand-by line; pushing a different topic gets normal handling. After 24 hours with no `/tieptuc`, bot auto-resumes and logs `escalation_auto_resumed`.
11. **Thread-scoped `/tieptuc`:** sending `/tieptuc Hùng` from a customer DM falls through to the LLM (command-not-found). Sending the same string from inside the configured staff group resolves the escalation.
12. **`openclaw.json` integrity:** monitor `~/.openclaw/logs/config-audit.jsonl` during pack install — no `argv:["...openclaw.mjs","config","set",...]` entries appear. All config writes are in-process via `writeOpenClawConfigIfChanged`.
13. **No second Telegram poller:** `pgrep -f "getUpdates"` (or Windows equivalent) shows exactly one Telegram polling process before and after pack install.
14. **Menu migration (empty source):** opening the Workflows tab on a fresh install with the default empty `data/zalo-menu/catalog.json` creates an `_menu-default` pack with a placeholder `/menu` command and renames the source file with `.migrated.<ISO>` suffix.
15. **Menu migration (non-empty source):** opening the Workflows tab with non-empty `items` migrates each into a `lenh/<id>.md` file; sending `/<one-of-the-ids>` in test Zalo DM responds with the migrated content.
16. **Channel adapter `buttons` degradation:** a command that returns `buttons` is rendered as a numbered text list when sent via the Zalo adapter; a numeric reply matching a button index is resolved to that button's `value` on the next turn.

---

## 13. Open Questions and Deferrals

| # | Question | Provisional answer | Resolution |
|---|---|---|---|
| 1 | Slot extractor LLM choice | Cheapest 9router model; fall back to main agent at confidence < 0.6 | Locked in §4.5; tune in implementation plan |
| 2 | Vector index location | Reuse Knowledge SQLite with `source` tag; cosine in JS | Locked in §5.2 |
| 3 | Tenant content overrides | Not in v0; v1.1 adds `packs/<id>-overrides/` directory | Deferred |
| 4 | Command-name collisions across multiple installed packs | V0 is single-pack-active-at-a-time per pack-id; cross-pack same-named commands rejected at second pack's install. v1 will add explicit `/pack:command` namespacing. | Deferred |
| 5 | Tenant config schema versioning | `schemaMigrations` map in manifest; pack-loader runs migrations on update | Deferred to license spec (auto-update) |
| 6 | Pack hot-reload (no gateway restart) | V0 always restarts gateway on install/update; v1.5 may add hot-reload for content-only changes | Deferred |
| 7 | Multi-language packs | V0 Vietnamese only; `ngon-ngu/` folder structure supports `en.json`, `id.json` etc. when needed | Deferred indefinitely |
| 8 | Pack uninstall during in-flight flow | V0: refuse uninstall if any active flow state references the pack; CEO must wait or force-cancel | Locked |
| 9 | Telegram dispatcher wiring | V0: only Zalo runs through dispatcher; Telegram is owner-only path | Deferred; revisit when first non-owner Telegram pack lands |

---

## Appendix A — Vietnamese Glossary for Internal Terms

| English internal term | Vietnamese surface term (when CEO sees it) |
|---|---|
| Workflow pack | Bộ quy trình |
| Slash command | Lệnh tắt |
| Flow / slot-filling | Quy trình hội thoại |
| SOP | Quy trình chuẩn |
| Escalation | Chuyển tiếp lễ tân |
| Tenant config | Cấu hình phòng khám / doanh nghiệp |
| Dispatcher | Bộ điều phối lệnh |
| Manifest | Mô tả gói |
| License key | Mã kích hoạt |
| Cron | Lịch tự động |
| Knowledge / RAG | Kho kiến thức |
| Channel adapter | Cổng kênh |
| Customer Zalo group | Nhóm Zalo khách |
| Staff Zalo group | Nhóm Zalo nội bộ |

---

## Appendix B — Pack Author Workflow (for MODORO Tech)

For MODORO Tech building a new pack:

1. `git clone PeterBui85/9BizClaw-Packs-Private`
2. `cp -R nha-khoa <new-pack-id>` → rename, edit `manifest.json`.
3. Author content in `src/` (markdown, JSON, optional `pack.js`).
4. `node build.js` → produces `<pack-id>-v<version>.zip` (signing is added in the license spec).
5. Test locally: copy zip to a dev MODOROClaw install, install via dev-only "Workflows → Install from folder" button.
6. Iterate.
7. (License spec) When ready: `git push`, draft GitHub Release tagged `<pack-id>-v<version>`, upload artifacts.

---

## Appendix C — Reviewer Issue Resolution Trace

| Reviewer issue | Resolution |
|---|---|
| Scope: 3 subsystems pretending to be 1 | This spec is now the platform-only subset; license + dental content split out. |
| §4.2/§4.3 whole-line vs first-token ambiguity | §4.3 uses "first-token-based" rule with explicit token-split semantics. |
| §4.4 timeout recomputation unclear | §4.4 explicitly recomputes `timeoutAt` on every state save. |
| §4.5 enum strategy `|` vs `,` mix | §4.5 has single explicit syntax (`enum:literal:` / `enum:config:`). |
| §5.1 budget enforcement unclear | §5.1 specifies hard install-rejection on > 15 KB. |
| §5.2 vector search API undefined | §5.2 pins to in-memory cosine over SQLite rows; no native extension. |
| §5.2 RAG injection point conflict | §5.2 specifies the gateway agent's prompt-assembly path, NOT inbound.ts. |
| §6.1 code-detected escalation undefined | §6.1 row 4 + dispatcher step 1.5 + `forced-patterns.json`. |
| §6.5 `/tieptuc` security | `/tieptuc` is NOT in general `lenh/` registry; dispatched only when `threadId === staffGroupId`. |
| §7.3 wizard restart vs channel isolation | §7.3 step 8 restarts only Zalo gateway in v0 (packs declare `kenh:["zalo"]`); §2.2 caveat acknowledges process-global dispatcher coupling. |
| §8.2 `vm.createContext` sandbox claim too strong | §8.2 explicitly states "pack authors trusted; this is defense-in-depth, not security isolation". |
| §10 atomic swap on Windows | Deferred to license spec where auto-update lives; for v0 manual install, restart-then-swap-then-start ordering is in §7.3. |
| §10.6 empty catalog migration | §10 (this spec): empty → placeholder `_menu-default` pack with `/menu` saying "chưa cài đặt". |
| §11.1 `buttons` cross-channel | §9.2 specifies numbered-text fallback for Zalo. |
| File extension inconsistency | §11: all `electron/lib/*` is `.js`; `.d.ts` only for type contracts. |
| CLAUDE.md never PowerShell openclaw.json | §7.3 + §11 enforce `writeOpenClawConfigIfChanged` only. |
| CLAUDE.md no second Telegram poller | §6.2 reuses existing `sendTelegramTo` (gateway is sole poller). |
| CLAUDE.md no emoji conflict with `tinhCach.dungEmoji` | `tinhCach.dungEmoji` is a pack-level (dental, gym, etc.) concern, not platform. Moved to dental spec; platform manifest schema does not include this toggle. |
| Reviewer: defer migration off boot path | §10: lazy migration on first Workflows tab open. |
| Reviewer: telemetry / rollback section | Deferred to license spec (auto-update is where rollback matters); v0 install is operator-driven with the `.migrated.<ISO>` source-file rename as the manual rollback aid. |

---

**End of Pack Platform v0 spec.**
