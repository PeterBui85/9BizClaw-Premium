# Zalo Menu — Full UI + Backend Design Spec

Date: 2026-05-27
Status: **Authoritative.** Supersedes [2026-05-27-zalo-menu-dry-run-ui-design.md](2026-05-27-zalo-menu-dry-run-ui-design.md) and the previous brainstorm-UI-only iteration of this file. Built from the CEO brainstorm picture, which shows a working **chatbot command system**, not a product catalog.

---

## 0. TL;DR

The Zalo Menu is a **per-group slash-command dispatcher** with templated responses and a CEO-facing admin console:

- A customer types `/sanpham` in a Zalo group → bot looks up the catalog → checks the customer's current group is allowed → checks the command is `active` → renders the response template (substituting `@name`, `@phone`, `@group`, etc.) → sends. The AI agent is **bypassed** for matched commands.
- `/help` is a built-in special command whose response is auto-generated from the catalog, filtered to commands available in the caller's group.
- The Dashboard provides a 2-pane admin UI: a sortable, searchable, group-filtered command table on the left; a live Zalo bubble preview on the right showing the rendered `/help` (or any selected command) for a chosen group.
- Admin can `Tải mẫu XLSX`, `Import XLSX`, and `Dry-run` from the page top-right. Dry-run renders the simulated response without sending to Zalo.
- Implementation lives mostly in `modoro-zalo` plugin (the inbound interceptor + renderer) plus `electron/lib/zalo-menu.js` (catalog persistence + IPC) plus a new admin pane in `dashboard.html`.

---

## 1. Mental Model Shift

The current implementation treats menu items as a **product catalog** with `slug/title/subtitle/priceLabel/ctaLabel/ctaCommand`. The brainstorm picture treats them as **commands**: the slash command IS the identity, every command has a single response body, an audience (group scope), and an on/off switch. Price, CTAs, subtitle are gone.

| Concept | Old (current code) | New (brainstorm) |
|---|---|---|
| Identity | `slug` ("ban-buon-iphone-pro") | `command` (`/sanpham`) — slash-prefixed, 1-32 chars |
| Audience | None — all items global | `group` per command: `"Tất cả nhóm"` (sentinel) or an exact Zalo group name |
| Lifecycle | Always live | `status: "active" \| "paused"` per command, toggleable |
| Display | Subtitle + price + CTA in admin card | One title line + one description line in admin table |
| Response | Concatenated catalog fields | Single `body` field, supports `@variables` |
| Routing | None — UI-only | Real dispatcher inside `modoro-zalo` inbound pipeline |

The picture's right-panel preview ("Dưới đây là các câu lệnh bạn có thể sử dụng: /sanpham : Xem danh sách...") is the **live rendering of `/help`** for the currently selected group. That right panel is not "look at this product card" — it's "this is exactly what the customer will receive."

---

## 2. Functional Model

### 2.1 Definitions

- **Command**: a single row in the catalog. Triggered by an exact slash string.
- **Audience / group scope**: a label that controls which Zalo group(s) the command responds in.
- **`Tất cả nhóm`** (sentinel): the only string that means "match in every group AND in DMs". Stored as the literal Vietnamese string in JSON to keep the data layer human-readable.
- **Status**: `active` means the command fires when invoked; `paused` means it is silently ignored (no response, no LLM fallback).
- **Body**: the response text the bot sends. Supports `@variables` (see §4).
- **`/help`**: the only **built-in** command. It cannot be deleted. Its body is dynamically generated; admin only edits the intro/outro text (see §3.4).
- **Dispatcher**: code path that intercepts an inbound Zalo message, detects a slash command, finds a matching catalog entry, and short-circuits the normal LLM flow.

### 2.2 Customer-facing contract

When a customer types `<token>` in a Zalo conversation (DM or group), one of these outcomes occurs:

1. **`<token>` is not a slash command** (does not match `^/[a-z0-9_-]{1,32}$`, case-insensitive): pipeline continues to the LLM agent as today.
2. **`<token>` matches an `active` catalog command whose group includes the current conversation**: bot sends the rendered body and **stops**. No LLM dispatch.
3. **`<token>` matches an `active` command but the current conversation's group is NOT in scope**: bot is silent. The command behaves as if it does not exist for this audience.
4. **`<token>` matches a `paused` command**: bot is silent (paused = "off", not "broken"). Same as case 3.
5. **`<token>` is `/help`** (or `/menu` as alias): bot sends the auto-generated help listing, filtered by current group.
6. **`<token>` looks like a slash command but matches nothing**: bot is silent. (We do NOT say `"Lệnh không tồn tại"` — that gives away the catalog surface and adds noise to groups.)

Behaviors 3/4/6 all collapse to "silent ignore" — same observable behavior — so a probing customer cannot distinguish "paused" from "wrong group" from "unknown".

### 2.3 Aliases and case

- Slash detection: `^/` prefix, then `[a-z0-9_-]{1,32}`. Matching is **case-insensitive on the command** (stored lowercase, lowered on lookup).
- Trim trailing whitespace and any single trailing punctuation `.,!?` before matching, so `/sanpham.` and `/sanpham!` still fire.
- A leading mention (`@bot /sanpham`) is supported: if the body starts with an `@<word>` token followed by a slash command, strip the mention before matching.
- Multi-line bodies: only the **first line** is checked for a command. `"/sanpham\nthêm cho tôi cái này"` triggers `/sanpham`; the rest is discarded (the dispatcher does not pass remainder text to the body — body is purely template-rendered).

### 2.4 Routing precedence (per-message inbound order)

The command dispatcher runs **inside** the existing `modoro-zalo` inbound pipeline at a specific slot:

```
inbound message
  ├── friendship system text drop          (existing)
  ├── per-sender dedup                     (existing — SENDER-DEDUP PATCH)
  ├── group system event drop              (existing — SYSTEM-MSG PATCH)
  ├── command-block rewrite                (existing — COMMAND-BLOCK PATCH)
  ├── media-only type filter               (existing)
  ├── per-sender/group rate limit          (existing — RATE-LIMIT PATCH)
  ├── msg-length-gate                      (existing — MSG-LENGTH-GATE PATCH)
  ├── **menu-dispatch**                    ← NEW slot
  ├── vision-safety prefix                 (existing)
  ├── bot-loop-breaker                     (existing)
  ├── out-of-scope filter (DMs only)       (existing)
  └── LLM agent dispatch                   (existing)
```

The menu dispatcher sits **after** all defensive guards (so a paused/silent command still benefits from dedup, rate limits, and command-block) and **before** the LLM. If the dispatcher emits a response, the function `return`s and the LLM never sees the message.

### 2.5 Group resolution rule

For an inbound message:

- `currentGroupName` = group display name when `message.isGroup` is true, looked up from the Zalo group memory directory (`memory/zalo-groups/<threadId>.md` front-matter `name:` field). Falls back to `threadId` if memory file missing.
- For DMs: `currentGroupName = "(DM)"` (special non-matching sentinel).
- A catalog row matches the current message when:
  - `row.group === "Tất cả nhóm"` (always matches), OR
  - `row.group === currentGroupName` (exact match), OR
  - `row.group === "(DM)"` AND the message is a DM (this is how an admin scopes a command to DMs only).

There is no wildcard, no group ID matching, no fuzzy matching. CEO sees and types human-readable group names; we match those literal strings. If the CEO renames a group in Zalo, the admin re-selects the new name in the editor — explicit beats implicit.

---

## 3. Variables (`@name`, `@phone`, …)

### 3.1 Recognized variables

Variables in `body` are replaced at render time. Recognized tokens (case-sensitive, must be preceded by a non-word boundary):

| Variable | Resolution source | Fallback |
|---|---|---|
| `@name` | First name of the sender. Pulled from `memory/zalo-users/<senderId>.md` front-matter `name:` field. If missing, use the Zalo display name's first whitespace-separated token. | `"bạn"` |
| `@fullname` | Full display name. From `memory/zalo-users/<senderId>.md` `fullname:`, falls back to the raw Zalo display name. | `"bạn"` |
| `@phone` | From `memory/zalo-users/<senderId>.md` `phone:`. | `"[chưa cập nhật]"` |
| `@group` | Current group's display name (resolved per §2.5). | `"(chat riêng)"` for DMs |
| `@time` | Current time in `Asia/Ho_Chi_Minh`, format `HH:mm`. | always available |
| `@date` | Current date in `Asia/Ho_Chi_Minh`, format `DD/MM/YYYY`. | always available |

Unrecognized `@token` strings (e.g., `@unknown`) are **left literal** in the output, not stripped, so admin can spot typos in dry-run.

### 3.2 Render rules

- Substitution is single-pass (resolved values are NOT re-rendered, so `@name` resolving to `"@something"` won't recurse).
- Word boundary: `@name` matches only when followed by a non-word character or end of string. `@names` is NOT replaced.
- Resolved values are escaped to plain text (no Markdown/HTML interpretation) since Zalo renders plain text.
- The renderer is pure: same input + same memory state → same output. No randomness.

### 3.3 `/help` special variable

`/help` body may include `{{commands}}` placeholder (double-braces, distinct from `@var`). At render time, this expands to a bulleted list of commands available in the caller's group. See §3.4 for the format.

### 3.4 `/help` body template

Stored shape (in catalog) for the built-in `/help`:

```
{{intro}}

{{commands}}

{{outro}}
```

- `intro` default: `Dưới đây là các câu lệnh bạn có thể sử dụng:` (CEO can edit via the editor modal).
- `commands` is auto-expanded to a list. Each line:
  - `• /<cmd> : <description>`
  - Order matches catalog display order.
  - Excludes `/help` itself.
  - Excludes paused commands.
  - Includes only commands whose `group` matches the caller's group (per §2.5).
- `outro` default: `Gõ câu lệnh để nhận thông tin nhanh chóng nhé!` (editable).

If the filtered command list is empty, `{{commands}}` renders as `Hiện chưa có lệnh nào dành cho nhóm này.` and the intro/outro still show.

`/menu` is registered as a **silent alias** for `/help` (no separate row). It cannot be edited or deleted.

---

## 4. Data Model

### 4.1 Storage location

- File: `data/zalo-menu/catalog.json` (existing path — keep). Symlinked / copied to the agent workspace as needed by existing logic.
- Schema version bumped: `version: 1` → `version: 2`. A one-shot migration on load handles v1 in place.

### 4.2 v2 catalog schema

```jsonc
{
  "version": 2,
  "updatedAt": "2026-05-27T10:30:00.000Z",
  "intro": "Dưới đây là các câu lệnh bạn có thể sử dụng:",   // /help intro (editable)
  "outro": "Gõ câu lệnh để nhận thông tin nhanh chóng nhé!",  // /help outro (editable)
  "items": [
    {
      "id": "cmd_a1b2c3",                  // stable opaque ID (used by IPC ops)
      "command": "/sanpham",               // REQUIRED. ^/[a-z0-9_-]{1,32}$ . Unique within catalog.
      "title": "Sản phẩm",                 // REQUIRED. Max 80 chars.
      "description": "Danh sách sản phẩm nổi bật",  // REQUIRED. Max 160 chars.
      "body": "Chào @name, dưới đây là sản phẩm của chúng tôi...",  // REQUIRED. Max 4000 chars.
      "group": "Tất cả nhóm",              // REQUIRED. Sentinel or exact Zalo group name or "(DM)".
      "status": "active",                  // "active" | "paused". Default "active".
      "order": 0,                          // integer, redundant with array index but explicit.
      "createdAt": "2026-05-27T08:00:00.000Z",
      "updatedAt": "2026-05-27T10:30:00.000Z",
      "_legacy": {                         // present only post-migration; OPTIONAL.
        "slug": "sanpham",
        "subtitle": "...",
        "priceLabel": "...",
        "ctaLabel": "...",
        "ctaCommand": "..."
      }
    }
  ]
}
```

### 4.3 Migration v1 → v2

In `electron/lib/zalo-menu.js`, on first read after upgrade:

1. If `catalog.version === 1`, iterate `items`:
   - `command` ← `"/" + slug` (slugified, lowercased).
   - `title` ← existing `title`.
   - `description` ← existing `subtitle` or first 160 chars of `description` (legacy field).
   - `body` ← existing `description` (legacy field) if non-empty, else `title + ' — ' + (subtitle || '')`.
   - `group` ← `"Tất cả nhóm"` (no group concept in v1).
   - `status` ← `"active"`.
   - `_legacy` ← `{ slug, subtitle, priceLabel, ctaLabel, ctaCommand }`.
2. Add top-level `intro` / `outro` defaults.
3. Set `version: 2` and write atomically.
4. Log `[zalo-menu] migrated catalog v1 → v2 (N items)` to console.

The built-in `/help` row is **not** stored in `items` — it is computed on demand by the dispatcher. Storing it would risk admin deleting it.

### 4.4 Validation rules (enforced server-side on save)

- `command`: must start with `/`, body matches `^/[a-z0-9_-]{1,32}$` after lowering, **must not equal `/help` or `/menu`** (reserved).
- Uniqueness: no two catalog rows share the same `command` (case-insensitive).
- `title`: 1-80 chars, trimmed.
- `description`: 1-160 chars, trimmed.
- `body`: 1-4000 chars, trimmed. Must not contain control chars (existing CONTROL_CHAR_RE rule).
- `group`: 1-80 chars, trimmed. Must be the sentinel `"Tất cả nhóm"`, the sentinel `"(DM)"`, or match an existing Zalo group name (soft warning if mismatch, hard-block only on empty).
- `status`: enum `active`/`paused`.

On validation failure, IPC returns `{ ok: false, error: "..." }` with a human-readable Vietnamese reason. Modal displays it inline.

---

## 5. Backend Architecture

### 5.1 Module map

| Module | Role |
|---|---|
| [electron/lib/zalo-menu.js](../../../electron/lib/zalo-menu.js) | Catalog persistence (read/write JSON), validation, XLSX template/import, v1→v2 migration. **Pure node, no Electron deps.** |
| `electron/lib/zalo-menu-render.js` (NEW) | Variable substitution + `/help` `{{commands}}` expansion. Pure function: `render(item, context) → string`. |
| `electron/lib/zalo-menu-dispatch.js` (NEW) | Pure parser: `parseCommand(rawBody) → { command, residue } | null` and `lookup(catalog, command, currentGroupName) → item | null | '__help__'`. |
| [electron/lib/dashboard-ipc.js](../../../electron/lib/dashboard-ipc.js) | Registers IPC handlers (list/save/delete/toggle/reorder/dry-run/import/template). Calls into `zalo-menu.js`. |
| [electron/packages/modoro-zalo/src/inbound.ts](../../../electron/packages/modoro-zalo/src/inbound.ts) | Existing pipeline. A new patch (`MENU-DISPATCH PATCH v1`) is injected at the slot defined in §2.4. |
| `electron/lib/zalo-menu-patch.js` (NEW or extend existing `ensureZalo*Fix` style) | Idempotent patch installer that injects the menu dispatcher into `inbound.ts` after `npm install` of the openzalo extension. Same pattern as `ensureZaloSenderDedupFix`, `ensureZaloOutputFilterFix`, etc. |
| [electron/preload.js](../../../electron/preload.js) | New bridge methods for the IPC contract. |
| [electron/ui/dashboard.html](../../../electron/ui/dashboard.html) | Replace `#zalo-menu-pane` markup + JS with the redesign. |

### 5.2 The dispatcher (injected into `inbound.ts`)

The patch installer writes a TypeScript block into `inbound.ts` at the slot defined in §2.4. The block:

```ts
// === 9BizClaw MENU-DISPATCH PATCH v1 ===
// Intercept slash commands before AI dispatch. Renders catalog responses with
// variable substitution. Silent on miss/paused/wrong-group. Bypasses LLM entirely.
if (rawBody && !message.fromOwner /* CEO bypass: see §5.5 */) {
  try {
    const __mdFirstLine = rawBody.split(/\r?\n/)[0].trim();
    // Strip leading mention if present (e.g. "@bot /sanpham")
    const __mdStripped = __mdFirstLine.replace(/^@\S+\s+/, "");
    // Trim trailing single punctuation
    const __mdCleaned = __mdStripped.replace(/[.,!?]$/, "").trim();
    const __mdMatch = /^\/([a-z0-9_-]{1,32})$/i.exec(__mdCleaned);
    if (__mdMatch) {
      const __mdCmd = "/" + __mdMatch[1].toLowerCase();
      // Read catalog from a known workspace-relative path. Resolution
      // mirrors existing zalo-paused.json lookup (see OUT-OF-SCOPE).
      const __mdCatalogPath = /* resolve via env + platform fallbacks */;
      const __mdCatalog = JSON.parse(require("node:fs").readFileSync(__mdCatalogPath, "utf-8"));
      const __mdGroupName = message.isGroup
        ? /* lookup group name from memory/zalo-groups */
        : "(DM)";
      // Built-in: /help, /menu → render help listing
      if (__mdCmd === "/help" || __mdCmd === "/menu") {
        const __mdRendered = /* render(__mdCatalog, "__help__", { group: __mdGroupName, ... }) */;
        await sendReply(__mdRendered);
        return;
      }
      const __mdItem = (__mdCatalog.items || []).find(
        (it: any) => String(it.command || "").toLowerCase() === __mdCmd
                  && it.status === "active"
                  && (it.group === "Tất cả nhóm"
                      || it.group === __mdGroupName
                      || (it.group === "(DM)" && !message.isGroup))
      );
      if (__mdItem) {
        const __mdRendered = /* render(__mdItem.body, ctx) */;
        await sendReply(__mdRendered);
        runtime.log?.(`modoro-zalo: MENU-DISPATCH fired ${__mdCmd} for ${message.senderId}`);
        return;
      }
      // Slash-shaped but no match → silent ignore (per §2.2 case 6)
      if (__mdFirstLine.startsWith("/")) {
        runtime.log?.(`modoro-zalo: MENU-DISPATCH unknown ${__mdCmd} from ${message.senderId} — silent`);
        return;
      }
    }
  } catch (e) {
    runtime.error?.(`modoro-zalo: MENU-DISPATCH error: ${String(e)}`);
    // On any error, fall through to LLM — never lose the message.
  }
}
// === END MENU-DISPATCH PATCH v1 ===
```

Key properties:

- **Idempotent install**: marker comment is checked before injection. Bumping the version marker (`v1` → `v2`) forces re-injection.
- **Fail open**: any error in dispatcher → fall through to LLM. We never lose a customer message because of a buggy regex or a missing catalog file.
- **No side effects on miss**: a non-matching slash command silently returns; no LLM dispatch, no audit, no toast. This avoids noise in groups when customers accidentally type `/abc`.
- **`sendReply` adapter**: the patch uses the same delivery mechanism as the existing `deliverAndRememberOpenzaloReply` path so output filter (Layer K) + per-sender dedup still apply. See §5.6.
- **Resolution of `__mdCatalogPath`**: same multi-path lookup pattern used by `zalo-paused.json` in the OUT-OF-SCOPE block — checks `process.env['9BIZ_WORKSPACE']`, then platform-specific `%APPDATA%`/`Library/Application Support`, then `~/.openclaw/workspace`.

### 5.3 Renderer module

`electron/lib/zalo-menu-render.js`:

```js
function renderCommand(item, ctx) {
  // ctx = { name, fullname, phone, group, time, date }
  return String(item.body || '').replace(
    /@(name|fullname|phone|group|time|date)\b/g,
    (_, k) => ctx[k] ?? FALLBACKS[k]
  );
}

function renderHelp(catalog, ctx) {
  const intro = (catalog.intro || DEFAULT_INTRO).replace(/@(name|fullname|...)/g, ...);
  const outro = (catalog.outro || DEFAULT_OUTRO).replace(...);
  const items = (catalog.items || [])
    .filter(it => it.status === 'active')
    .filter(it => it.group === 'Tất cả nhóm'
                || it.group === ctx.group
                || (it.group === '(DM)' && ctx.group === '(DM)'))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const lines = items.length
    ? items.map(it => `• ${it.command} : ${it.description}`).join('\n')
    : 'Hiện chưa có lệnh nào dành cho nhóm này.';
  return `${intro}\n\n${lines}\n\n${outro}`;
}
```

Same module is used by the dispatcher (inside inbound.ts, via a tsc-compiled or hand-mirrored copy) AND by the IPC dry-run handler.

For the dispatcher inside `inbound.ts` (which is patched TypeScript inside the modoro-zalo plugin), the rendering helper is **inlined** at patch-injection time rather than imported. This avoids cross-package require paths from inside the plugin source.

### 5.4 Dry-run IPC

```
ipcMain.handle('dry-run-zalo-menu', async (_e, { command, groupName, senderId }) => {
  const catalog = readCatalog();
  const ctx = await buildContext({ senderId, groupName });
  if (!command || command === '/help' || command === '/menu') {
    return { ok: true, text: renderHelp(catalog, ctx) };
  }
  const item = catalog.items.find(it => it.command.toLowerCase() === command.toLowerCase());
  if (!item) return { ok: false, error: 'Lệnh không tồn tại trong catalog.' };
  if (item.status === 'paused') return { ok: false, error: 'Lệnh đang tạm dừng.' };
  if (item.group !== 'Tất cả nhóm' && item.group !== groupName) {
    return { ok: false, error: `Lệnh không áp dụng cho nhóm "${groupName}".` };
  }
  return { ok: true, text: renderCommand(item, ctx) };
});
```

Dry-run **never** sends to Zalo. It only renders and returns text. Calling it writes one audit entry: `{ event: 'zalo_menu_dry_run', command, group: groupName }`.

The dry-run context (`senderId`) defaults to a synthetic sample: `name = "Khách hàng mẫu"`, `phone = "[chưa cập nhật]"`, `fullname = "Khách hàng mẫu"`. The admin can optionally pick a real customer from a dropdown to render with their actual memory data (V2 — not required for v1).

### 5.5 CEO bypass

The dispatcher must **not** fire for CEO messages — CEO typing `/sanpham` to test should reach the LLM agent so the bot can route via normal admin paths. Bypass logic:

- Skip dispatcher when `message.fromOwner === true` (existing OpenZalo flag for CEO's own Zalo).
- Skip dispatcher when the channel is Telegram (the dispatcher only injects into the Zalo plugin's `inbound.ts`; Telegram path is untouched).

For convenience, the Dashboard's "Dry-run" button is the CEO-facing way to test commands, so the customer-side bypass is the right default.

### 5.6 Output filter integration

Bot responses to menu commands must pass through the existing Layer K output filter (the `__ofBlockPatterns` array in `send.ts`) so a malicious admin can't accidentally publish secrets via a command body. Implementation: the menu dispatcher calls `sendReply()` through the same path `deliverAndRememberOpenzaloReply` uses today — Layer K runs on every outbound, so we inherit it automatically.

The renderer itself does **no** filtering — that's send.ts's job — but the editor modal SHOULD warn (not block) when admin types a body that contains patterns Layer K would strip (e.g., file paths, API keys). Inline warning, not a hard block, since legitimate Vietnamese product copy is what we want.

### 5.7 Dedup, rate limit, bot-loop interaction

- **Dedup (SENDER-DEDUP PATCH)**: runs **before** the menu dispatcher (per §2.4), so duplicate `/sanpham` within 3s → only the first one fires. Good.
- **Rate limit (RATE-LIMIT PATCH)**: same — runs before. A customer spamming `/sanpham` 30 times in a minute gets 20 commands fired then the rest dropped. Same as LLM behavior. Good.
- **Bot-loop-breaker**: runs **after** the menu dispatcher in §2.4. **BUT**: the dispatcher `return`s early before this code runs, so bot-loop-breaker would never see menu fires. That's correct — a customer can't accidentally trigger an infinite menu loop because the bot only responds to slash commands, and bots don't typically type `/sanpham`.
- **Per-command soft rate limit**: in addition to the global rate limit, a single sender should not get the same command response more than once per 60s. Track a tiny in-memory map `__mcMenuLastFire = Map<senderId+command, timestamp>` inside the dispatcher; on hit, silently ignore.

### 5.8 Audit logging

Each fired command writes to `~/.openclaw/workspace/logs/audit.jsonl`:

```json
{ "ts": "ISO", "event": "zalo_menu_fired", "command": "/sanpham", "senderId": "12345", "groupName": "Nhóm VIP", "isDm": false }
```

Per-command throttled drop:

```json
{ "ts": "ISO", "event": "zalo_menu_throttled", "command": "/sanpham", "senderId": "12345" }
```

Unknown slash:

```json
{ "ts": "ISO", "event": "zalo_menu_unknown", "command": "/abc", "senderId": "12345", "isDm": true }
```

These flow into the existing Dashboard "Hoạt động gần đây" stream with Vietnamese labels.

---

## 6. UI Spec

The Menu sub-tab pane (`#zalo-menu-pane`) becomes a vertical stack: page action bar → 2-column grid.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Action bar ............... [Tải mẫu XLSX] [Import XLSX] [▶ Dry-run]      │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────┐ ┌─────────────────────────────────┐ │
│ │ Danh sách menu       [+ Thêm]    │ │ Xem trước Zalo  [Chọn nhóm ▾]   │ │
│ │ Thử nghiệm menu câu lệnh ...     │ │ Xem trước nội dung sẽ gửi ...   │ │
│ │ [search] [group filter]          │ │ ┌──────────────────────────┐    │ │
│ │ ┌────────────────────────────┐   │ │ │ Zalo bubble preview      │    │ │
│ │ │ Menu / Câu lệnh │ Nhóm │ … │   │ │ │ ...                      │    │ │
│ │ │ ≡  /help  Trợ giúp …       │   │ │ │                          │    │ │
│ │ │ ≡  /sanpham Sản phẩm …     │   │ │ │                    10:30 │    │ │
│ │ │ ...                        │   │ │ └──────────────────────────┘    │ │
│ │ └────────────────────────────┘   │ │ Biến khả dụng                   │ │
│ │ Hiển thị 1 – 7 của 7 menu  ◀1▶   │ │ [@name][@phone][@group][@time]…│ │
│ └──────────────────────────────────┘ │ Lưu ý: Đây là nội dung xem ...  │ │
│                                      └─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Page action bar (`.zm-actionbar`)

Right-aligned, gap 8px, no border. Three buttons:

| Button | Class | Style | Icon | Handler |
|---|---|---|---|---|
| `Tải mẫu XLSX` | `btn btn-secondary btn-small` | outlined surface | `download` (14) | `downloadZaloMenuTemplate()` |
| `Import XLSX` | `btn btn-secondary btn-small` | outlined surface | `upload` (14) | `importZaloMenuXlsx()` |
| `Dry-run` | `btn btn-primary zm-btn-amber` | filled `--accent` | `play` (14) | `dryRunZaloMenu()` |

Dry-run is the visual primary (amber accent), matching the brainstorm picture.

### 6.2 Grid (`.zm-grid`)

- `grid-template-columns: minmax(540px, 1.35fr) minmax(420px, 1fr); gap: 16px;`
- Below 1180px viewport: `grid-template-columns: 1fr` (stack).
- Both panels: `background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px;`.

### 6.3 Left panel — `Danh sách menu`

#### 6.3.1 Header

- Title: `Danh sách menu` — 16px / 750.
- Subtitle: `Thử nghiệm menu câu lệnh và phản hồi` — 13px / muted.
- Right side: `+ Thêm menu` button → opens editor modal (§6.5) in create mode.

#### 6.3.2 Toolbar

Row below header:

- Search input `#zm-search`:
  - Placeholder `Tìm menu...`. Leading magnifier icon (14px) absolutely positioned.
  - Debounced 120ms. Filters by case-insensitive substring over `command`, `title`, `description`.
  - Width `flex:1; max-width:320px; min-width:200px;`.
- Group filter `#zm-group-filter`:
  - Default value `Tất cả nhóm`.
  - Options: `Tất cả nhóm` + every group name found in current rows + every group reported by `list-zalo-groups` IPC. Deduped.
  - Width `min-width:170px`.

#### 6.3.3 Table (CSS grid `<div>`s, not `<table>`)

- Column template: `28px 220px 1fr 160px 100px 36px`
- Columns: drag handle, command chip, title+description stack (header label `Menu / Câu lệnh` spans the 2 visual columns), group name, status pill, kebab.
- Row height: ~60px.
- Header row: bottom border `1px solid var(--border)`. Header text: `11.5px / 650 / var(--text-muted)`.
- Data rows: padding `14px 8px`; bottom border separator; hover `background:var(--surface-hover)`; cursor pointer (clicking opens editor).
- Description clamps to 2 lines via `-webkit-line-clamp`.

##### 6.3.3.1 Command chip (`.zm-cmd-chip`)

- `display:inline-flex; padding:4px 10px; border-radius:6px;`
- `background:var(--surface-elevated); border:1px solid var(--border);`
- `font-family:var(--font-mono, ui-monospace, monospace); font-size:13px; font-weight:600;`
- Text: full slash command (`/help`, `/sanpham`, ...).

##### 6.3.3.2 Group cell

- Plain text, 13px, `var(--text-secondary)`. Shows the literal group name. Sentinel `"Tất cả nhóm"` is shown as-is. DMs show `"Chat riêng"` (translated from internal `"(DM)"`).

##### 6.3.3.3 Status pill (`.zm-status-pill`)

- Padding `3px 10px`, radius 999px, font 12px / 600.
- `active` → "Hoạt động" — `background:rgba(34,197,94,.15); color:var(--success); border:1px solid rgba(34,197,94,.35);`
- `paused` → "Tạm dừng" — `background:var(--surface-elevated); color:var(--text-muted); border:1px solid var(--border-strong);`
- Clickable. Optimistic toggle + `toggle-zalo-menu-status` IPC. On error: revert + toast `Không đổi trạng thái được`.

##### 6.3.3.4 Kebab (`⋮`)

28×28 button, `more-vertical` 16px icon. Dropdown items:

- `Sửa` — open editor modal in edit mode.
- `Nhân bản` — duplicate row (append `-copy` to command; if collision, `-copy-2`, etc.). New ID, status copied.
- divider
- `Tạm dừng` / `Bật lại` — toggle status (label depends on current).
- divider
- `Xóa` — danger, red text. `confirm()` before delete. Disabled (and shown grayed out with tooltip "Lệnh hệ thống") for `/help`. *(Note: `/help` is rendered as a synthetic row at top of table; see §6.3.4.)*

##### 6.3.3.5 Drag handle

Native HTML5 DnD or SortableJS. Drag = whole row, but the trigger zone is the handle cell only. On drop: optimistic re-render + `reorder-zalo-menu` IPC (array of IDs). The `/help` synthetic row is NOT draggable and is always pinned at index 0.

#### 6.3.4 The `/help` synthetic row

The built-in `/help` is shown in the table for discoverability, but it does NOT live in `catalog.items`. The table render code prepends a synthetic row:

```
{
  id: '__help__',
  command: '/help',
  title: 'Trợ giúp',
  description: 'Hiển thị danh sách các câu lệnh có thể sử dụng',
  group: 'Tất cả nhóm',
  status: 'active',
  builtin: true
}
```

Synthetic row behavior:

- No drag handle (cell empty).
- Status pill is non-clickable (`/help` is always active).
- Kebab menu shows only `Sửa intro/outro` (opens a specialized editor — see §6.5.2) and `Xem trước` (selects the row for preview).
- Cannot be deleted or duplicated.
- Always rendered first in the table regardless of search/filter (unless search explicitly mismatches; in that case, hide).

#### 6.3.5 Pagination

- Footer row, `padding-top:12px; border-top:1px solid var(--border);`.
- Left: `Hiển thị 1 – N của M menu` text (computed from filtered set).
- Right: `<  1  2  >` controls. Active page button: `background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent);`.
- Page size: 10.
- Hide controls if total ≤ 10.

#### 6.3.6 Empty state

If filtered set is empty:

- Icon `list` 28px muted.
- Title `Không tìm thấy menu nào` (or `Chưa có menu nào` for true-empty catalog).
- Subtitle hint pointing to `+ Thêm menu` or `Import XLSX`.

### 6.4 Right panel — `Xem trước Zalo`

#### 6.4.1 Header

- Title `Xem trước Zalo` (16px / 750).
- Subtitle `Xem trước nội dung sẽ gửi đến người dùng` (13px / muted).
- Right side: group selector `#zm-preview-group` with label `Chọn nhóm để xem`.

#### 6.4.2 Selected command (implicit)

The right panel renders **whichever row the admin most recently clicked in the table**, defaulting to the synthetic `/help` row on first load. There is no dedicated command selector in the right panel header — selection is implicit, driven by row click.

When the admin clicks any row in the left table:
- That row gets a subtle left-edge highlight `border-left:3px solid var(--accent);`.
- The right panel re-renders using that row's `body` (or for `/help`, the auto-generated listing).

To return to `/help` preview: click the synthetic `/help` row.

#### 6.4.3 Bubble (`.zm-preview-card`)

- `background:var(--surface-elevated); border:1px solid var(--border); border-radius:14px; padding:16px 18px 12px; position:relative;`.
- Header row:
  - `.zm-preview-brand` — 36×36 rounded square `border-radius:10px; background:#0084FF;` centered text `Zalo` white 11px/700.
  - `.zm-preview-title` — to the right, command title (e.g., `Trợ giúp`) 15px/700.
- Body:
  - `.zm-preview-body` — `font-size:13.5px; color:var(--text); line-height:1.55; white-space:pre-wrap; word-break:break-word;`
  - For `/help`: renders intro + bulleted command list + outro (per §3.4). Each bullet shows a small `.zm-cmd-chip` (size variant `padding:2px 8px; font-size:12.5px;`) inline.
  - For other commands: renders the rendered body (variables substituted using a synthetic sample customer context, group from `#zm-preview-group`).
- Timestamp `.zm-preview-time`: absolute bottom-right, 11px muted, value `HH:MM` updated on each render.

#### 6.4.4 Variables strip (`.zm-vars`)

Below the bubble:

- Section title `Biến khả dụng` 13px/650.
- Chips: `@name @fullname @phone @group @time @date` — same monospace small-chip style as command chips.
- Each chip: click copies the token to clipboard, toast `Đã copy @name`.

#### 6.4.5 Disclaimer

Bottom: `Lưu ý: Đây là nội dung xem trước. Kết quả thực tế có thể khác đôi chút tùy theo thiết bị và phiên bản Zalo.` 11.5px muted.

### 6.5 Editor modal

#### 6.5.1 Standard command editor

Reuses the existing dashboard modal frame. Title: `Thêm menu mới` / `Sửa menu`. Fields in order:

| Field | Type | Required | Notes |
|---|---|---|---|
| `Câu lệnh` | text input, monospace, leading `/` visible as a non-editable prefix | yes | Live validation: regex, uniqueness, reserved-word check. Error text appears below input in red. |
| `Tiêu đề` | text input | yes | Max 80. Live char counter. |
| `Mô tả ngắn` | textarea 2 rows | yes | Max 160. Shown in table line 2 and in `/help` bullet. |
| `Nội dung trả lời` | textarea 8 rows | yes | Max 4000. **Has a sidebar of variable chips** for one-click insertion at cursor. Live preview pane to the right (or below on narrow modal). |
| `Nhóm áp dụng` | select | yes | Options: `Tất cả nhóm` (default), `(Chat riêng — DM)`, then live Zalo groups. |
| `Trạng thái` | toggle switch | yes | Default `Hoạt động`. |

Footer: `Hủy` (secondary) / `Lưu` (primary). On submit: IPC `save-zalo-menu-item` → on success close modal + refresh table + refresh preview.

The "live preview pane" inside the editor is the same `.zm-preview-card` style as the main right panel, scaled down. Updates on every keystroke (200ms debounce).

#### 6.5.2 `/help` editor (specialized)

Opened only via the synthetic `/help` row's kebab → `Sửa intro/outro`. Fields:

- `Câu mở đầu` (intro) — textarea 2 rows.
- `Câu kết` (outro) — textarea 2 rows.
- Live preview pane showing the rendered `/help` for "Tất cả nhóm".

No command/title/description/group/status fields — those are fixed for `/help`.

### 6.6 Selectors / ID contract

| Element | Selector |
|---|---|
| Pane | `#zalo-menu-pane` (keep existing) |
| Action bar | `.zm-actionbar` |
| Grid | `.zm-grid` |
| Left panel | `.zm-panel.zm-panel-list` |
| Search | `#zm-search` |
| Group filter | `#zm-group-filter` |
| Add button | `#zm-add-btn` |
| Table head | `.zm-table-head` |
| Table body | `#zm-table-body` |
| Pagination text | `#zm-pagination-info` |
| Pagination nav | `#zm-pagination-nav` |
| Right panel | `.zm-panel.zm-panel-preview` |
| Preview group select | `#zm-preview-group` |
| Preview card | `#zm-preview-card` |
| Preview title | `#zm-preview-title` |
| Preview body | `#zm-preview-body` |
| Preview time | `#zm-preview-time` |
| Vars strip | `#zm-vars` |
| Import banner | `#zm-import-state` |
| Editor modal | `#zm-editor-modal` |

---

## 7. IPC Contract

All IPC handlers are registered in `electron/lib/dashboard-ipc.js`.

| IPC name | Direction | Args | Returns | Notes |
|---|---|---|---|---|
| `list-zalo-menu` | renderer→main | `{}` | `{ ok, items, groups, intro, outro }` | `groups` = live list from Zalo group manager + sentinels. |
| `save-zalo-menu-item` | renderer→main | `{ id?, command, title, description, body, group, status }` | `{ ok, item } \| { ok:false, error }` | Upsert. New `id` if missing. |
| `delete-zalo-menu-item` | renderer→main | `{ id }` | `{ ok }` | Rejects `id === '__help__'`. |
| `toggle-zalo-menu-status` | renderer→main | `{ id }` | `{ ok, status }` | Flips active/paused. Rejects `__help__`. |
| `reorder-zalo-menu` | renderer→main | `{ ids: string[] }` | `{ ok }` | Replaces order. `__help__` not in list. |
| `dry-run-zalo-menu` | renderer→main | `{ command?, groupName?, senderId? }` | `{ ok, text } \| { ok:false, error }` | See §5.4. |
| `save-zalo-menu-help` | renderer→main | `{ intro?, outro? }` | `{ ok }` | Updates top-level intro/outro. |
| `import-zalo-menu-xlsx` | renderer→main | `{ filePath }` | `{ ok, importedCount, errors }` | See §8. |
| `download-zalo-menu-template` | renderer→main | `{}` | `{ ok, savedPath }` | Writes template to user-picked path. |
| `list-zalo-groups` | renderer→main | `{}` | `{ ok, groups: string[] }` | Source of truth for group filter dropdowns. Reads from `memory/zalo-groups/*.md` front-matter. |

All handlers wrap their body in try/catch and return `{ ok: false, error: '<vi>' }` on failure. None throw across the IPC boundary.

---

## 8. XLSX Template & Import

### 8.1 Template structure

Sheet `Menu` columns, in order:

| Column | Required | Example | Notes |
|---|---|---|---|
| `command` | yes | `/sanpham` | Must start with `/`. |
| `title` | yes | `Sản phẩm` | |
| `description` | yes | `Danh sách sản phẩm nổi bật` | |
| `body` | yes | `Chào @name, dưới đây là sản phẩm...` | Multi-line supported. |
| `group` | yes | `Tất cả nhóm` | Sentinel, `(DM)`, or exact group name. |
| `status` | no | `active` | Defaults to `active`. Accepts `Hoạt động` and `Tạm dừng` aliases. |

Sheet `Huong dan` (Vietnamese instructions): explains each column, the variable list, and the reserved-word rules.

### 8.2 Import behavior

- Max 5MB, 500 rows, 20 columns (existing limits in `zalo-menu.js`).
- Validation pass FIRST, write pass SECOND. If any row fails, **no** changes are written. Banner shows all errors at once: `Dòng 3: command trùng. Dòng 7: thiếu group. ...`
- On success: banner `Đã import N menu. Catalog đã được cập nhật.` Table + preview re-render.
- Import replaces the whole `items` list. Intro/outro are preserved. (Future: offer a "merge" mode — out of scope for v1.)

---

## 9. Dry-run semantics

The `Dry-run` page-top button:

1. Reads the currently selected row in the left table (defaults to `/help` synthetic row).
2. Reads `#zm-preview-group` value.
3. Calls `dry-run-zalo-menu` IPC with `{ command, groupName, senderId: null }`.
4. Updates `#zm-preview-body` with returned text, `#zm-preview-time` with current `HH:MM`.
5. Writes one audit entry: `{ event: 'zalo_menu_dry_run', command, group }`.

Dry-run NEVER:
- Sends any Zalo message.
- Calls Zalo API.
- Calls the LLM.

Dry-run ALWAYS:
- Runs through the same renderer used at customer message time.
- Uses synthetic customer context (no real customer data leaks into the preview unless admin explicitly picks one in V2).

---

## 10. States & Edge Cases

| Scenario | Behavior |
|---|---|
| Catalog file missing | Renderer returns the no-commands `/help` ("Hiện chưa có lệnh nào..."). Admin pane shows empty state. Dispatcher silently no-ops. |
| Catalog JSON malformed | Boot logs error to `config-errors.log`. Dispatcher fails open → LLM still handles all messages. Admin pane shows error banner with "Khôi phục từ backup" button (reads `catalog.json.bak.*` if present). |
| Two rows with same `command` (data corruption) | Renderer picks the FIRST in array order. Save IPC rejects creating duplicates. Admin pane shows red banner: `Phát hiện trùng lệnh: /xxx — vui lòng đổi tên 1 trong 2`. |
| Renaming a Zalo group | Existing catalog rows with the old name silently fail to match (per §2.5). Editor modal flags rows whose `group` is not in the current `list-zalo-groups` set with a soft warning. |
| Customer types `/sanpham extra text` | First-line match strips to `/sanpham`. Extra text discarded. Bot responds with the template (no use of remainder text). |
| Customer types `Hello /sanpham` | First line does NOT start with `/`. Dispatcher does not fire. Message goes to LLM. |
| Customer types `/SANPHAM` | Case-insensitive match → fires. Logs lowered command. |
| Customer rapidly fires same command | Per-command per-sender throttle (§5.7): 1 fire / 60s / sender / command. Subsequent calls drop silently. |
| Customer in group whose name is exactly `Tất cả nhóm` | Cosmic-edge case. Renderer treats the literal sentinel as the catch-all, so this group would match every command. Defensive: editor modal blocks naming a custom group `Tất cả nhóm` in the group select (filter it out). If a Zalo group already has that name, log a warning at boot. |
| Body contains `@phone` for a sender with no phone | Renders `[chưa cập nhật]`. Command still ships. |
| Dispatcher exception (catalog read, regex, render) | Try/catch wraps the entire patch block. On error: log to runtime + audit, fall through to LLM. Customer never sees an error. |
| `/help` body's `{{commands}}` placeholder is removed by admin | Renderer still appends the auto list at the end (with default intro/outro). Admin warning in the `/help` editor: `Bạn đã xóa {{commands}} — hệ thống sẽ tự nối vào cuối`. |
| Customer is also CEO (CEO's Zalo account = bot account) | `message.fromOwner === true` short-circuits the dispatcher (§5.5). CEO's `/sanpham` goes to LLM. |

---

## 11. Acceptance Criteria

1. **UI parity**: Menu sub-tab renders identically to the brainstorm picture at 1440×900 light theme. Visible rows: synthetic `/help` + the 6 example commands from the picture (`/sanpham`, `/khuyenmai`, `/gioithieu`, `/lienhe`, `/hoidap`, `/baohanh`) when seeded by `Import XLSX` of the template with the example rows.
2. **Three top buttons** positioned page-top-right in order `Tải mẫu XLSX`, `Import XLSX`, `Dry-run`, with `Dry-run` in amber accent.
3. **Status toggle**: clicking a row's pill persists state across Electron restart.
4. **Group filter**: changing `#zm-group-filter` filters table rows; changing `#zm-preview-group` changes the preview content. The two are independent.
5. **Reorder**: dragging a row updates catalog order and persists. Reload preserves order.
6. **Editor validation**: trying to save a row with command `/help` is blocked with `"/help" là lệnh hệ thống.`. Duplicate command is blocked with `Câu lệnh đã tồn tại.`. Invalid format is blocked with `Câu lệnh phải bắt đầu bằng "/" và chỉ chứa chữ thường, số, "-" hoặc "_".`.
7. **Variables**: clicking any chip in the variables strip copies to clipboard. Inserting `@name` in a body and dry-running shows `bạn` for a synthetic context.
8. **Dispatcher live test (Zalo end-to-end)**: from a non-CEO Zalo account in a group named `Khách hàng`, typing `/hoidap` (when `status: paused`) → bot silent. Setting status to `active` and re-typing → bot responds with the rendered body.
9. **Group scope live test**: a command with `group: "Nhóm VIP"` does NOT respond when typed in a different group. Same command responds correctly when typed in a group whose memory file's `name:` is `Nhóm VIP`.
10. **`/help` live test**: typing `/help` in `Khách hàng` group shows only the commands available to `Tất cả nhóm` + `Khách hàng`. Typing `/menu` shows the same content (alias).
11. **Fail-open**: deleting/corrupting `catalog.json` → bot continues to respond to non-slash messages via LLM. Slash commands silently no-op.
12. **Audit**: every successful menu fire writes one `zalo_menu_fired` entry. Visible in Dashboard `Hoạt động gần đây` within 30s of firing.
13. **Output filter**: a body containing `${process.env.HOME}/secret.txt` is stripped by Layer K before reaching Zalo. Editor modal shows a yellow warning when admin types such a body.
14. **Dark theme**: layout and contrast hierarchy match the light theme.
15. **CEO bypass**: typing `/sanpham` from CEO's own Zalo account goes to the LLM agent, not the dispatcher.

---

## 12. File-by-file Change Map

| File | Change |
|---|---|
| [data/zalo-menu/catalog.json](../../../data/zalo-menu/catalog.json) | Seed remains empty `{ version: 2, items: [], intro, outro }`. Migration auto-runs on first load if v1 found. |
| [electron/lib/zalo-menu.js](../../../electron/lib/zalo-menu.js) | Add v1→v2 migration. Replace catalog field rules per §4.4. Add `intro`/`outro` getters/setters. Update XLSX template per §8.1. Add CRUD by `id`, `reorder(ids)`, `toggleStatus(id)`. Drop `category/subtitle/priceLabel/ctaLabel/ctaCommand` from the validated field set (kept under `_legacy`). |
| `electron/lib/zalo-menu-render.js` *(new)* | Pure renderer: `renderCommand(item, ctx)`, `renderHelp(catalog, ctx)`. Used by IPC dry-run. Mirrored (inlined) into the inbound.ts patch. |
| `electron/lib/zalo-menu-dispatch.js` *(new)* | Pure parser/lookup: `parseSlash(text)`, `lookup(catalog, cmd, currentGroup)`. Same module-mirror situation as renderer. |
| [electron/lib/dashboard-ipc.js](../../../electron/lib/dashboard-ipc.js) | Register all IPC from §7. Remove the v2.4.10 short-circuit stubs. |
| [electron/preload.js](../../../electron/preload.js) | Add bridge methods for the new IPC. |
| [electron/main.js](../../../electron/main.js) | Add `ensureZaloMenuDispatchFix()` to the `_startOpenClawImpl` boot sequence, alongside the existing `ensureZalo*Fix` functions. Use the established marker-comment idempotency pattern. |
| [electron/packages/modoro-zalo/src/inbound.ts](../../../electron/packages/modoro-zalo/src/inbound.ts) | Target for the menu-dispatch patch (§5.2). Position: after MSG-LENGTH-GATE, before VISION-SAFETY. |
| [electron/ui/dashboard.html](../../../electron/ui/dashboard.html) | Replace `#zalo-menu-pane` markup + styles + JS per §6. Remove `display:none` and the disabled-feature comments. Add editor modal `#zm-editor-modal`. |
| [docs/qc/zalo-menu-smoke-test-plan.md](../../qc/zalo-menu-smoke-test-plan.md) | Replace with the acceptance criteria from §11 as a checklist. |
| [CLAUDE.md](../../../CLAUDE.md) | Add a `Zalo menu dispatcher v1` entry summarizing the new patch + its slot in the inbound pipeline + the fail-open behavior. |

---

## 13. Out of Scope (V1)

- No payment / SePay integration.
- No image / sticker bodies — text only.
- No command **arguments**: `/baogia premium` is V2. V1 matches `^/[a-z0-9_-]{1,32}$` exactly.
- No Telegram parity — V1 is Zalo-only. The same catalog could later drive Telegram, but `inbound.ts` patch is in `modoro-zalo` plugin only.
- No per-customer name lookup for the dry-run preview ("dry-run as customer X") — synthetic context only.
- No analytics dashboard (how many times each command was fired). Audit log captures it; surfacing it is V2.
- No merge-mode XLSX import — V1 replaces the whole list.

---

## 14. Open Questions

Defaults chosen below if no answer given:

1. **`/menu` alias**: should it behave identically to `/help`, or open a different view (e.g., a categorized menu)? *Default: identical alias.*
2. **`{{commands}}` placement**: should admin be able to put `{{commands}}` anywhere in the `/help` body (middle of intro), or is it always at "between intro and outro"? *Default: between intro and outro. The `/help` editor only exposes intro + outro fields, with the commands list rendered automatically in between.*
3. **DM-only commands**: should the editor expose `"(DM)"` as a selectable group, or keep DM scoping implicit (e.g., a separate "Chỉ chat riêng" checkbox)? *Default: explicit `"(Chat riêng — DM)"` option in the group select, stored internally as `"(DM)"`.*
4. **Per-command throttle window**: 60s per-sender per-command. Too tight? Too loose? *Default: 60s.*
5. **Reserved commands**: only `/help` and `/menu` are reserved. Should we also reserve `/start`, `/stop`, `/admin`, etc. for future system use? *Default: reserve only `/help` and `/menu` in v1. Future reserves can be added later — admins won't lose existing commands because we'll grandfather them.*
6. **Group rename handling**: when a Zalo group is renamed, should we auto-update all catalog rows that reference the old name? *Default: no auto-update. Surface a soft warning in the editor for orphaned `group` values. Manual fix only — explicit beats implicit.*
7. **Output filter warning vs block in the editor**: should the editor block save when body contains Layer K patterns, or just warn? *Default: warn only. Layer K is the runtime safety net; the editor should not refuse valid Vietnamese product copy that happens to contain a code-looking substring.*
