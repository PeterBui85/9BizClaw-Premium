# Zalo Customer Image-Send (Approach Y) — Implementation Plan

> **For agentic workers:** Implement top-to-bottom. Steps use checkbox (`- [ ]`) syntax.
> **NOTE — commits deferred:** per the CEO's hard rule (never commit without explicit ask), this plan contains NO git commits. All work stays uncommitted for CEO review. Verify with tests/smoke only.

**Goal:** When a Zalo customer asks for a product image, the bot sends it — by emitting a marker the plugin executes server-side, with no new cron-API auth surface.

**Architecture:** The agent appends `[[GUI_ANH: <keywords>]]` to its reply. The modoro-zalo plugin's coalesced-delivery choke point (`__mcDoDeliver` in inbound.ts) strips the marker from the customer-facing text (always) and, if present, calls the cron-API media search server-to-server (trusted, reads the token file) then sends up to 10 public product images to the CURRENT conversation via the plugin's own `sendMediaModoroZalo`, paced ~1s apart.

**Tech Stack:** TypeScript fork (`packages/modoro-zalo/src/`, runs as TS via tsx — no compile), Node 22 `fetch`, the existing cron-API (`/api/media/search`, port 20200).

**Spec:** `docs/superpowers/specs/2026-06-08-zalo-customer-image-send-design.md`

---

## Chunk 1: Plugin marker logic + send orchestration + wiring

> **Council fix (file split):** the PURE parser lives in `image-marker.ts` with NO IO imports, and the IO orchestration lives in a separate `image-send.ts` (imports `send.js`). This keeps the unit test from loading `send.ts` at import time (avoids a tsx harness break) and is one-concern-per-file.

### Task 1: Pure marker parser (`image-marker.ts`)

**Files:**
- Create: `electron/packages/modoro-zalo/src/image-marker.ts`  (PURE — no imports except none)
- Test: `electron/packages/modoro-zalo/src/image-marker.test.ts`

- [ ] **Step 1: Write the failing test** (`image-marker.test.ts`)

```ts
import { test } from "node:test";
import assert from "node:assert";
import { parseImageMarker, MAX_CUSTOMER_IMAGES } from "./image-marker.js";

test("no marker → text unchanged, query null", () => {
  const r = parseImageMarker("Dạ bên em có sản phẩm X giá 1tr ạ.");
  assert.strictEqual(r.query, null);
  assert.strictEqual(r.cleaned, "Dạ bên em có sản phẩm X giá 1tr ạ.");
});

test("marker at end → stripped from text, query extracted", () => {
  const r = parseImageMarker("Dạ đây là ảnh giao diện ạ.\n[[GUI_ANH: giao diện 9bizclaw]]");
  assert.strictEqual(r.query, "giao diện 9bizclaw");
  assert.ok(!r.cleaned.includes("GUI_ANH"), "marker must be stripped");
  assert.ok(r.cleaned.includes("ảnh giao diện"), "real text kept");
});

test("marker mid-sentence is stripped", () => {
  const r = parseImageMarker("Ảnh đây [[GUI_ANH: menu]] ạ");
  assert.strictEqual(r.query, "menu");
  assert.ok(!r.cleaned.includes("["));
});

test("malformed/unclosed marker never leaks, no send", () => {
  const r = parseImageMarker("Xem ảnh [[GUI_ANH: bảng giá");
  assert.strictEqual(r.query, null, "unclosed → no send");
  assert.ok(!r.cleaned.includes("GUI_ANH"), "fragment stripped");
});

test("multiple markers: first drives query, all stripped", () => {
  const r = parseImageMarker("a [[GUI_ANH: x]] b [[GUI_ANH: y]] c");
  assert.strictEqual(r.query, "x");
  assert.ok(!r.cleaned.includes("GUI_ANH"));
});

test("empty query marker → null", () => {
  const r = parseImageMarker("hi [[GUI_ANH: ]]");
  assert.strictEqual(r.query, null);
});

test("cap constant is 10", () => { assert.strictEqual(MAX_CUSTOMER_IMAGES, 10); });
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd electron/packages/modoro-zalo && node --import tsx --test src/image-marker.test.ts`
Expected: FAIL (module not found / parseImageMarker undefined).

- [ ] **Step 3: Implement `image-marker.ts` (pure parser + constants)**

```ts
// Customer image-send marker (Approach Y, 2026-06-08) — PURE parse only.
//
// The agent appends [[GUI_ANH: <keywords>]] to its reply when a Zalo customer
// wants a product image. This module extracts the keywords + strips the marker
// so it NEVER reaches the customer. The IO (search + send) lives in image-send.ts
// so this stays import-side-effect-free and unit-testable in bare tsx.
//
// Anti-features: no IO here; no config-object; constants overridable only by edit
// (no per-channel override in v1 — YAGNI).

export const MAX_CUSTOMER_IMAGES = 10;

// Closed marker: captures keywords. `[^\]\n]` keeps it single-line + bounded.
const MARKER_RE = /\[\[\s*GUI_ANH\s*:\s*([^\]\n]*?)\s*\]\]/i;
// Strip closed markers AND any unclosed `[[GUI_ANH: ...` fragment (to end of
// line) so a streaming-split marker can never leak to the customer.
const MARKER_STRIP_RE = /\[\[\s*GUI_ANH\s*:[^\]\n]*?\]\]|\[\[\s*GUI_ANH\s*:[^\n]*/gi;

export function parseImageMarker(text: string): { cleaned: string; query: string | null } {
  const raw = String(text ?? "");
  const m = raw.match(MARKER_RE);
  const q = m && m[1] ? m[1].trim() : "";
  const cleaned = raw.replace(MARKER_STRIP_RE, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, query: q || null };
}
```

- [ ] **Step 4: Run test, verify it passes** (same command as Step 2). Expected: all PASS.

---

### Task 2: Server-side image send orchestration (`image-send.ts`)

**Files:** Create `electron/packages/modoro-zalo/src/image-send.ts`

- [ ] **Step 1: Write `deliverCustomerImages` (IO; no throw — best-effort)**

```ts
// Customer image send IO (Approach Y). Reuses the audited cron-API search guard
// (audience=customer → product/public only) server-side, then sends to the
// CURRENT conversation via the plugin's own session. Never throws.
import * as fs from "node:fs";
import * as path from "node:path";
import { sendMediaModoroZalo } from "./send.js";
import { MAX_CUSTOMER_IMAGES } from "./image-marker.js";

const CRON_API_PORT = 20200;     // matches lib/cron-api.js module constant
const IMAGE_PACING_MS = 1000;    // avoid Zalo throttle on multi-image bursts
const ALLOWED_REL_PREFIX = "media-assets";  // only ever send from the media library

type RuntimeLike = { log?: (m: string) => void; error?: (m: string) => void };

export async function deliverCustomerImages(params: {
  query: string;
  to: string;                 // formatted outbound target of THIS conversation
  account: any;
  cfg: any;
  runtime: RuntimeLike;
}): Promise<number> {
  const { query, to, account, cfg, runtime } = params;
  const ws = process.env["9BIZ_WORKSPACE"];
  if (!ws) { runtime.error?.("[image-send] no 9BIZ_WORKSPACE — skip"); return 0; }

  let token = "";
  try { token = fs.readFileSync(path.join(ws, "cron-api-token.txt"), "utf-8").trim(); } catch {}
  if (!token) { runtime.error?.("[image-send] no cron-api token — skip"); return 0; }

  let results: any[] = [];
  try {
    const url = `http://127.0.0.1:${CRON_API_PORT}/api/media/search`
      + `?q=${encodeURIComponent(query)}&audience=customer&limit=${MAX_CUSTOMER_IMAGES}`;
    const resp = await fetch(url, {
      headers: { "X-Source-Channel": "telegram", "Authorization": `Bearer ${token}` },
    });
    const data: any = await resp.json();
    results = Array.isArray(data?.results) ? data.results : [];
  } catch (e) { runtime.error?.(`[image-send] search failed: ${String(e)}`); return 0; }

  if (results.length === 0) { runtime.log?.(`[image-send] no image for query`); return 0; }

  const mediaAssetsRoot = path.join(ws, ALLOWED_REL_PREFIX);
  const roots = [
    ...(Array.isArray(account?.config?.mediaLocalRoots) ? account.config.mediaLocalRoots : []),
    mediaAssetsRoot,
  ];
  let sent = 0;
  const picks = results.slice(0, MAX_CUSTOMER_IMAGES);
  for (let i = 0; i < picks.length; i++) {
    const rel = String(picks[i]?.relPath || "").replace(/\\/g, "/");
    // Containment guard: relPath comes from path.relative(workspace, ...) so it
    // can in principle point anywhere in the workspace. Only ever send from the
    // media library, and never let a path escape the workspace.
    if (!rel || rel.split("/")[0] !== ALLOWED_REL_PREFIX) { runtime.error?.("[image-send] skip non-media-assets relPath"); continue; }
    const abs = path.join(ws, rel);
    if (abs !== mediaAssetsRoot && !abs.startsWith(mediaAssetsRoot + path.sep)) { runtime.error?.("[image-send] skip out-of-root path"); continue; }
    try {
      await sendMediaModoroZalo({ cfg, account, to, mediaPath: abs, mediaLocalRoots: roots });
      sent++;
      if (i < picks.length - 1) await new Promise((r) => setTimeout(r, IMAGE_PACING_MS));
    } catch (e) { runtime.error?.(`[image-send] send failed: ${String(e)}`); }
  }
  return sent;
}
```

- [ ] **Step 2: Type-check** — Run: `cd electron/packages/modoro-zalo && npx tsc --noEmit` (expect no NEW errors from image-send.ts; pre-existing errors elsewhere are out of scope). If `tsc` config absent, skip — tsx runs untyped.

---

### Task 3: Wire the marker into the delivery choke point (`inbound.ts`)

**Files:** Modify `electron/packages/modoro-zalo/src/inbound.ts`
- Import site: line 102 (alongside `sendMediaModoroZalo` import)
- Hook site: `__mcDoDeliver` (lines ~2566–2608), next to the existing EMOJI-STRIP mutation

- [ ] **Step 1: Add the imports** (after line 102)

```ts
import { parseImageMarker } from "./image-marker.js";
import { deliverCustomerImages } from "./image-send.js";
```

- [ ] **Step 2: Hook `__mcDoDeliver`** — strip marker (always), deliver text, then fire images. Replace the body of `__mcDoDeliver` so the marker is handled right after the emoji-strip and the image send happens AFTER the text deliver:

```ts
  const __mcDoDeliver = async (payload: any) => {
    // EMOJI-STRIP (existing) — keep as-is.
    if (payload?.text) {
      payload.text = payload.text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
    }
    // 9BizClaw IMAGE-MARKER: strip [[GUI_ANH: ...]] from the customer-facing text
    // (ALWAYS, even if the send later fails) and remember the query to fire after.
    let __imgQuery: string | null = null;
    if (payload?.text) {
      const { cleaned, query } = parseImageMarker(payload.text);
      payload.text = cleaned;
      __imgQuery = query;
    }
    // DELIVER-RETRY (existing) — deliver the (now clean) text. Keep existing body.
    try {
      await deliverAndRememberModoroZaloReply({ payload, target: outboundTarget, sessionKey: route.sessionKey, account, cfg, runtime, statusSink });
    } catch (__drErr: any) {
      const __drMsg = String(__drErr?.message || __drErr || "");
      const __drTransient = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|spawn|killed|signal/i.test(__drMsg);
      if (__drTransient) {
        runtime.log?.(`modoro-zalo: deliver failed (transient: ${__drMsg.slice(0, 120)}) — retrying in 2s`);
        await new Promise(r => setTimeout(r, 2000));
        try { await deliverAndRememberModoroZaloReply({ payload, target: outboundTarget, sessionKey: route.sessionKey, account, cfg, runtime, statusSink }); runtime.log?.("modoro-zalo: deliver retry succeeded"); }
        catch (__drRetryErr: any) { runtime.error?.(`modoro-zalo: deliver retry also failed: ${String(__drRetryErr?.message || __drRetryErr).slice(0, 200)}`); }
      } else { runtime.error?.(`modoro-zalo: deliver failed (non-transient): ${__drMsg.slice(0, 200)}`); }
    }
    // After the text is out, send the requested product image(s) to THIS
    // conversation. Best-effort: never block or throw into the deliver path.
    if (__imgQuery) {
      try {
        const n = await deliverCustomerImages({ query: __imgQuery, to: outboundTarget, account, cfg, runtime });
        runtime.log?.(`[image-marker] sent ${n} image(s) for "${__imgQuery}"`);
      } catch (e) { runtime.error?.(`[image-marker] deliver error: ${String(e)}`); }
    }
  };
```

- [ ] **Step 3: Run the fork test suite** — Run: `cd electron/packages/modoro-zalo && npm test`. Expected: PASS (existing + new image-marker tests).

---

### Task 4: Output-filter safety net (both mirrors)

The marker is stripped at `__mcDoDeliver` before delivery; this is defense-in-depth so a marker can NEVER reach a customer via any send path. STRIP (do not block).

**Files:**
- Modify `electron/packages/modoro-zalo/src/send.ts` — `sendTextModoroZalo`, right after `const body = text.trim();` (line ~396)
- Modify `electron/lib/channels.js` — `filterSensitiveOutput` (the `_outputFilterPatterns` mirror)

- [ ] **Step 1 (send.ts):** before the output-filter block, strip any marker fragment:

```ts
  // 9BizClaw IMAGE-MARKER SAFETY: a [[GUI_ANH: ...]] marker must never reach a
  // customer even if the deliver-path strip was bypassed. Strip, do not block.
  const bodyNoMarker = body.replace(/\[\[\s*GUI_ANH\s*:[^\]\n]*?\]\]|\[\[\s*GUI_ANH\s*:[^\n]*/gi, "").replace(/[ \t]{2,}/g, " ").trim();
```
Then use `bodyNoMarker` in place of `body` for the rest of `sendTextModoroZalo`. (If `bodyNoMarker` is empty → return `{ messageId: "empty", kind: "text" }` like the existing empty-body guard.)

- [ ] **Step 2 (channels.js):** in `filterSensitiveOutput`, at the very top of the function, **reassign the same `text` variable** that the downstream block-pattern loop tests (so the stripped version is what gets scanned AND returned): add `text = String(text).replace(/\[\[\s*GUI_ANH\s*:[^\]\n]*?\]\]|\[\[\s*GUI_ANH\s*:[^\n]*/gi, '');` as the first statement. Verify the loop below uses this same `text` variable (it does — `_outputFilterPatterns.forEach(p => ... p.re.test(text))`).

- [ ] **Step 3:** Run `cd electron && node -c lib/channels.js` (syntax OK) and `cd electron/packages/modoro-zalo && npm test`.

---

## Chunk 2: Instructions, versions, guard, docs

### Task 5: Rewrite the agent instruction (marker, not API call)

**Files:**
- Modify `AGENTS.md` (the customer-image rule ~line 407 + the routing-table row ~line 326) + bump stamp `<!-- modoroclaw-agents-version: 120 -->`
- Modify `skills/operations/zalo.md` (§GỬI ẢNH, lines ~225–239)
- Modify `electron/lib/workspace.js:36` — `CURRENT_AGENTS_MD_VERSION = 120`

- [ ] **Step 1 (AGENTS.md §407):** replace the "call `/api/media/search` + `/api/zalo/send-media`" instruction with:

> **GỬI ẢNH CHO KHÁCH ZALO (sản phẩm / bảng giá / menu):** Khi khách Zalo muốn xem ảnh sản phẩm, bảng giá, báo giá, menu/thực đơn hoặc catalogue → viết câu trả lời text bình thường (đứng độc lập, KHÔNG hứa "đang gửi") VÀ thêm vào CUỐI câu trả lời một marker trên dòng riêng: `[[GUI_ANH: <từ khóa ảnh khách cần>]]`. Hệ thống sẽ tự tìm và gửi tối đa 10 ảnh công khai phù hợp cho đúng khách/nhóm này. KHÔNG tự gọi API, KHÔNG bịa "đã gửi ảnh", KHÔNG dán đường dẫn file. Nếu không có ảnh phù hợp, hệ thống bỏ qua — câu text vẫn gửi.

- [ ] **Step 2 (AGENTS.md routing row ~326):** keep the trigger keywords, change the action column to: `→ thêm marker [[GUI_ANH: <từ khóa>]] vào cuối reply (xem skills/operations/zalo.md §GỬI ẢNH).`

- [ ] **Step 3 (zalo.md §GỬI ẢNH):** replace the 2-step web_fetch instruction with the same marker instruction (mirror §407, with examples: `[[GUI_ANH: bảng giá]]`, `[[GUI_ANH: ảnh giao diện app]]`). State the limit (max 10, public product only) and the anti-features (no API call, no fabricated send).

- [ ] **Step 4:** bump the AGENTS.md stamp to 120 and `workspace.js` `CURRENT_AGENTS_MD_VERSION = 120`.

- [ ] **Step 5:** Run `cd electron && node scripts/check-skill-categorization.js` (ensure no skill-index drift). Expected: PASS.

### Task 6: Bump the fork version (both files, in sync)

**Files:** `electron/lib/zalo-plugin.js:26` + `electron/packages/modoro-zalo/src/.fork-version`

- [ ] **Step 1:** set both to `modoro-zalo-v1.0.21`.
- [ ] **Step 2:** Run `cd electron && node scripts/check-zalo-listener-recovery.js` (reads fork source) → PASS.

### Task 7: Smoke-wired wiring guard

**Files:** Create `electron/scripts/check-zalo-image-marker.js`; add to `guard:architecture` chain in `electron/package.json` (mirror how `guard:zalo-listener` is wired).

- [ ] **Step 1:** Write a source-pattern guard (read files as text, like `check-zalo-listener-recovery.js`) asserting:
  - `image-marker.ts` exists, exports `parseImageMarker` + `MAX_CUSTOMER_IMAGES`, and imports NOTHING from `./send` (purity — keeps the unit test clean).
  - `image-send.ts` exists, exports `deliverCustomerImages`, uses `audience=customer`, reads `cron-api-token.txt` (assert NO hardcoded 48-hex token literal), and contains the `media-assets` relPath containment guard.
  - `inbound.ts` imports `parseImageMarker` (from image-marker) and `deliverCustomerImages` (from image-send), and calls both.
  - `send.ts` AND `channels.js` both contain a `GUI_ANH` strip.
  - `MAX_CUSTOMER_IMAGES = 10`.
  - `MODORO_ZALO_FORK_VERSION` in `lib/zalo-plugin.js` equals the `.fork-version` file content (in-sync guard).
  Fail with explicit per-assertion messages.
- [ ] **Step 2:** Run `cd electron && node scripts/check-zalo-image-marker.js` → PASS.
- [ ] **Step 3 (EXPLICIT package.json edit):** In `electron/package.json`, find the `guard:architecture` script (a single long `&&`-chain) and append ` && node scripts/check-zalo-image-marker.js` to its end. Because `smoke` ends with `npm run guard:architecture`, the new guard then runs inside `npm run smoke` automatically. (Do NOT also add it to the `smoke` string — that would double-run it.) Verify with `node -e "const p=require('./package.json'); console.log(p.scripts['guard:architecture'].includes('check-zalo-image-marker'))"` → `true`.
- [ ] **Step 4:** Re-run `cd electron && npm run guard:architecture` → PASS (confirms the new guard is wired and the chain still passes).

### Task 8: Self-knowledge + DEVLOG + system-map

**Files:** `skills/operations/gioi-thieu.md`, `DEVLOG.md`, `docs/generated/system-map.*`

- [ ] **Step 1:** `gioi-thieu.md` — ensure the CSKH capability line truthfully states the bot sends product/menu/bảng-giá images to Zalo customers on request (update only if it claims otherwise).
- [ ] **Step 2:** `DEVLOG.md` — append a 2026-06-08 entry: image-send fix (Approach Y: marker + plugin server-side send; no cron-API auth hole), + the listener_dead hotfix (asymmetric cache TTL; root cause = contention), AGENTS 119→120, fork v1.0.20→v1.0.21.
- [ ] **Step 3:** Run `cd electron && npm run map:generate` to refresh the system map.

### Task 9: Full verification

- [ ] **Step 1:** Run `cd electron && npm run smoke`. Expected: EXIT 0 (incl. `check-zalo-image-marker`, `check-zalo-listener-recovery`, `map:check`). The `better-sqlite3` ABI warning is benign.
- [ ] **Step 2:** Run `cd electron/packages/modoro-zalo && npm test`. Expected: all PASS.
- [ ] **Step 3:** Report a summary; leave everything UNCOMMITTED for CEO review. Do NOT build/commit/push/release.

## Anti-features (out of scope)
No new cron-API endpoint/auth for Zalo; no NLP intent-detection in code; no live send during implementation (delivery already proven); no order/appointment flow; no video.
