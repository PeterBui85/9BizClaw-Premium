# Zalo Inbound At-Landing Capture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every inbound Zalo message (DM + group, including off-allowlist senders) to the durable archive the instant it reaches the plugin — independent of openzca's database.

**Architecture:** A new ESM/TS helper `src/history-capture.ts` in the modoro-zalo plugin appends each inbound message to `<ws>/zalo-history/<ownerId>/<peer>.jsonl` (DM) or `<ws>/zalo-group-history/<ownerId>/<group>.jsonl` (group), reusing the exact line shape of the Node `zalo-history-archive._toLine`. `handleModoroZaloInbound` calls it before any filter (allowlist/command-block/owner-takeover). The existing 3-min poller stays as backup; both dedup by `msgId`.

**Tech Stack:** TypeScript (ESM, run via `tsx`), node:test, Node `fs`. The plugin compiles/copies via `prebuild:modoro-zalo`.

**Spec:** `docs/superpowers/specs/2026-06-07-zalo-inbound-at-landing-capture-design.md`

**Branch:** `feat/zalo-group-history`. Per-task commits below; the CEO may run in no-commit mode (skip the commit steps, keep the TDD loop).

**Shell note:** run commands via the **Bash tool** (POSIX; `&&` and `cd x && y` valid). On PowerShell replace `&&` with `;` and `cd` first.

## File structure

- **Create** `electron/packages/modoro-zalo/src/history-capture.ts` — pure `buildLine()` mapping + best-effort `captureInbound()` fs writer. One concern: at-landing archive append.
- **Create** `electron/packages/modoro-zalo/src/history-capture.test.ts` — node:test unit tests.
- **Modify** `electron/packages/modoro-zalo/src/inbound.ts` — import + one call in `handleModoroZaloInbound` after the empty-body guard.
- **Modify** `electron/lib/zalo-plugin.js:26` — bump `MODORO_ZALO_FORK_VERSION`.
- **Modify** `electron/packages/modoro-zalo/src/.fork-version` — bump to match (second source of truth; a smoke guard fails if it drifts from the JS constant).
- **Modify** `electron/lib/customer-memory-updater.js` — (Chunk 3) additive owner-id mismatch detection (layer-3 defense).

---

## Chunk 1: history-capture helper + tests

Read first for the canonical line shape this must mirror:
`electron/lib/zalo-history-archive.js` — `_toLine(row, ownerAccountId)` produces
`{ msgId, ts, senderId, senderName, dir, msgType, text }`, `dir = senderId === ownerId ? 'out' : 'in'`, `ID_RE = /^[A-Za-z0-9_-]{1,64}$/`, `_existingMsgIds` tail-dedup (256 KB).

### Task 1: pure `buildLine()` + parity test against `_toLine`

**Files:**
- Create: `electron/packages/modoro-zalo/src/history-capture.ts`
- Create: `electron/packages/modoro-zalo/src/history-capture.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { buildLine } from "./history-capture.js";

// The Node archive module is CommonJS; load _toLine as the canonical golden shape.
const require = createRequire(import.meta.url);
const zha = require("../../../lib/zalo-history-archive.js");

test("buildLine matches _toLine for an inbound peer message", () => {
  const golden = zha._toLine(
    { msg_id: "m1", timestamp_ms: 1000, sender_id: "peer", sender_name: "An", msg_type: "", content_text: "chào shop" },
    "self001",
  );
  const line = buildLine({
    ownerId: "self001",
    message: { messageId: "x", msgId: "m1", senderId: "peer", senderName: "An", text: "chào shop", timestamp: 1000, mediaPaths: [], mediaUrls: [] },
  });
  assert.deepStrictEqual(line, golden);
});

test("buildLine derives dir='out' for an owner-sent message", () => {
  const line = buildLine({
    ownerId: "self001",
    message: { messageId: "x", msgId: "m2", senderId: "self001", senderName: "Shop", text: "dạ", timestamp: 1001, mediaPaths: [], mediaUrls: [] },
  });
  assert.strictEqual(line.dir, "out");
});

test("buildLine: msgId falls back to cliMsgId then messageId; media → msgType 'media'", () => {
  const a = buildLine({ ownerId: "s", message: { messageId: "mm", cliMsgId: "c1", senderId: "p", text: "", timestamp: 5, mediaPaths: ["/x.jpg"], mediaUrls: [] } });
  assert.strictEqual(a.msgId, "c1", "cliMsgId preferred over messageId when msgId absent");
  assert.strictEqual(a.msgType, "media", "media present → 'media'");
  const b = buildLine({ ownerId: "s", message: { messageId: "mm", senderId: "p", text: "hi", timestamp: 5, mediaPaths: [], mediaUrls: [] } });
  assert.strictEqual(b.msgId, "mm", "messageId used when msgId+cliMsgId absent");
  assert.strictEqual(b.msgType, "", "text → ''");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd electron/packages/modoro-zalo && node --import tsx --test src/history-capture.test.ts`
Expected: FAIL — cannot find `./history-capture.js` / `buildLine` not exported.

- [ ] **Step 3: Implement `buildLine` (+ module scaffolding)**

Create `electron/packages/modoro-zalo/src/history-capture.ts`:

```ts
// At-landing archive capture for inbound Zalo messages. WHY this duplicates the
// Node zalo-history-archive line shape in TS: the plugin runs in a separate
// process; writing straight to disk makes capture independent of the Electron
// main process AND of openzca's database (db enable / messages.sqlite), which is
// the layer that fails on real machines. The Node module stays the canonical
// reader; only the line shape + id rule are mirrored here, pinned by a parity test.
//
// Anti-features: no backfill (forward-only), no openzca calls, no outbound capture
// here (inbound only), no read/summary logic. Not independent of the openzca
// listener — that delivers the message; we only remove the DB dependency.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEDUP_TAIL_BYTES = 256 * 1024;

export type CaptureMessage = {
  messageId: string;
  msgId?: string;
  cliMsgId?: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  mediaPaths?: string[];
  mediaUrls?: string[];
};

export type CaptureParams = {
  ownerId: string;   // botUserId — the owner's Zalo self id (archive namespace)
  threadId: string;  // DM: resolved directPeerId; group: message.threadId
  isGroup: boolean;
  message: CaptureMessage;
  log?: (m: string) => void;
};

function isSafeId(id: unknown): boolean {
  return ID_RE.test(String(id == null ? "" : id));
}

// Pure mapping to the archive line shape — mirrors zalo-history-archive._toLine.
// `dir` derived from owner identity; `msgType` is best-effort ('' | 'media') since
// the inbound payload carries no openzca msg_type (no reader branches on it).
export function buildLine(p: { ownerId: string; message: CaptureMessage }): {
  msgId: string; ts: number; senderId: string; senderName: string;
  dir: "in" | "out"; msgType: string; text: string;
} {
  const m = p.message;
  const senderId = String(m.senderId == null ? "" : m.senderId);
  const hasMedia = (m.mediaPaths?.length || 0) > 0 || (m.mediaUrls?.length || 0) > 0;
  return {
    msgId: String(m.msgId || m.cliMsgId || m.messageId || ""),
    ts: Number(m.timestamp) || 0,
    senderId,
    senderName: String(m.senderName == null ? "" : m.senderName),
    dir: senderId === String(p.ownerId) ? "out" : "in",
    msgType: hasMedia ? "media" : "",
    text: String(m.text == null ? "" : m.text),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd electron/packages/modoro-zalo && node --import tsx --test src/history-capture.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add electron/packages/modoro-zalo/src/history-capture.ts electron/packages/modoro-zalo/src/history-capture.test.ts
git commit -m "feat(zalo-capture): buildLine mapping mirroring _toLine + parity test"
```

### Task 2: `captureInbound()` — workspace resolve, path-safety, dedup, append

**Files:**
- Modify: `electron/packages/modoro-zalo/src/history-capture.ts`
- Modify: `electron/packages/modoro-zalo/src/history-capture.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { captureInbound } from "./history-capture.js";

function tmpWs(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "zic-test-"));
  process.env["9BIZ_WORKSPACE"] = d;
  return d;
}
function readLines(file: string): any[] {
  return fs.readFileSync(file, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

test("captureInbound: DM message → zalo-history/<owner>/<peer>.jsonl, dir 'in'", () => {
  const ws = tmpWs();
  const ok = captureInbound({
    ownerId: "self001", threadId: "peerA", isGroup: false,
    message: { messageId: "x", msgId: "m1", senderId: "peerA", senderName: "An", text: "hi", timestamp: 1000 },
  });
  assert.strictEqual(ok, true);
  const file = path.join(ws, "zalo-history", "self001", "peerA.jsonl");
  const lines = readLines(file);
  assert.strictEqual(lines.length, 1);
  assert.deepStrictEqual(lines[0], { msgId: "m1", ts: 1000, senderId: "peerA", senderName: "An", dir: "in", msgType: "", text: "hi" });
  fs.rmSync(ws, { recursive: true, force: true });
});

test("captureInbound: group → zalo-group-history path", () => {
  const ws = tmpWs();
  captureInbound({
    ownerId: "self001", threadId: "grp1", isGroup: true,
    message: { messageId: "x", msgId: "g1", senderId: "mem", senderName: "M", text: "yo", timestamp: 2000 },
  });
  assert.ok(fs.existsSync(path.join(ws, "zalo-group-history", "self001", "grp1.jsonl")));
  fs.rmSync(ws, { recursive: true, force: true });
});

test("captureInbound: off-allowlist sender is still captured (helper is allowlist-agnostic)", () => {
  const ws = tmpWs();
  // 'Voi' is not in any allowlist; the helper neither knows nor cares.
  const ok = captureInbound({
    ownerId: "self001", threadId: "voi", isGroup: false,
    message: { messageId: "x", msgId: "v1", senderId: "voi", senderName: "Voi", text: "anh ơi", timestamp: 3000 },
  });
  assert.strictEqual(ok, true);
  assert.ok(fs.existsSync(path.join(ws, "zalo-history", "self001", "voi.jsonl")));
  fs.rmSync(ws, { recursive: true, force: true });
});

test("captureInbound: dedup by msgId (redelivery) → one line", () => {
  const ws = tmpWs();
  const m = { messageId: "x", msgId: "d1", senderId: "p", senderName: "P", text: "once", timestamp: 5 };
  captureInbound({ ownerId: "s", threadId: "p", isGroup: false, message: m });
  const second = captureInbound({ ownerId: "s", threadId: "p", isGroup: false, message: m });
  assert.strictEqual(second, false, "redelivery returns false");
  assert.strictEqual(readLines(path.join(ws, "zalo-history", "s", "p.jsonl")).length, 1);
  fs.rmSync(ws, { recursive: true, force: true });
});

test("captureInbound: unsafe owner/thread id → no write, returns false", () => {
  const ws = tmpWs();
  assert.strictEqual(captureInbound({ ownerId: "../evil", threadId: "p", isGroup: false, message: { messageId: "x", msgId: "1", senderId: "p", text: "h", timestamp: 1 } }), false);
  assert.strictEqual(captureInbound({ ownerId: "s", threadId: "../evil", isGroup: false, message: { messageId: "x", msgId: "1", senderId: "p", text: "h", timestamp: 1 } }), false);
  assert.ok(!fs.existsSync(path.join(ws, "zalo-history")), "no folder created for bad ids");
  fs.rmSync(ws, { recursive: true, force: true });
});

test("captureInbound: missing ownerId (botUserId unset) → no write", () => {
  const ws = tmpWs();
  assert.strictEqual(captureInbound({ ownerId: "", threadId: "p", isGroup: false, message: { messageId: "x", msgId: "1", senderId: "p", text: "h", timestamp: 1 } }), false);
  fs.rmSync(ws, { recursive: true, force: true });
});

test("captureInbound: no usable msgId → no write", () => {
  const ws = tmpWs();
  assert.strictEqual(captureInbound({ ownerId: "s", threadId: "p", isGroup: false, message: { messageId: "", senderId: "p", text: "h", timestamp: 1 } }), false);
  fs.rmSync(ws, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd electron/packages/modoro-zalo && node --import tsx --test src/history-capture.test.ts`
Expected: FAIL — `captureInbound` not exported.

- [ ] **Step 3: Implement** — append to `history-capture.ts`:

```ts
// Resolve <ws>. Same chain as inbound.ts owner-takeover block: env → per-platform
// app-data. Full chain (not env-only) so it works when 9BIZ_WORKSPACE is unset.
function resolveWorkspace(): string {
  const env = process.env["9BIZ_WORKSPACE"];
  if (env) return env;
  const home = os.homedir();
  const appDir = "9bizclaw";
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", appDir);
  if (process.platform === "win32") {
    const ad = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(ad, appDir);
  }
  const cfg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(cfg, appDir);
}

// Existing msgIds in the file tail (dedup). Mirrors zalo-history-archive._existingMsgIds.
function existingMsgIds(file: string): Set<string> {
  const seen = new Set<string>();
  let raw: string;
  try {
    const size = fs.statSync(file).size;
    if (size > DEDUP_TAIL_BYTES) {
      const fd = fs.openSync(file, "r");
      try {
        const buf = Buffer.alloc(DEDUP_TAIL_BYTES);
        const n = fs.readSync(fd, buf, 0, DEDUP_TAIL_BYTES, size - DEDUP_TAIL_BYTES);
        raw = buf.toString("utf-8", 0, n);
      } finally { fs.closeSync(fd); }
      const nl = raw.indexOf("\n");
      if (nl >= 0) raw = raw.slice(nl + 1);
    } else {
      raw = fs.readFileSync(file, "utf-8");
    }
  } catch { return seen; }
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try { const o = JSON.parse(line); if (o && o.msgId != null) seen.add(String(o.msgId)); } catch {}
  }
  return seen;
}

// Append one inbound message to the durable archive at landing. Best-effort:
// never throws. Returns true iff a line was written. Skips (returns false) on
// unsafe/missing ids or no usable msgId — the poller backup still captures those.
export function captureInbound(p: CaptureParams): boolean {
  try {
    if (!isSafeId(p.ownerId) || !isSafeId(p.threadId)) return false;
    const line = buildLine({ ownerId: p.ownerId, message: p.message });
    if (!line.msgId) return false;
    const ws = resolveWorkspace();
    if (!ws) return false;
    const root = p.isGroup ? "zalo-group-history" : "zalo-history";
    const dir = path.join(ws, root, p.ownerId);
    const file = path.join(dir, p.threadId + ".jsonl");
    if (existingMsgIds(file).has(line.msgId)) return false;
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(line) + "\n", "utf-8");
    return true;
  } catch (e: any) {
    p.log?.(`modoro-zalo: history capture failed (non-blocking): ${e?.message}`);
    return false;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd electron/packages/modoro-zalo && node --import tsx --test src/history-capture.test.ts`
Expected: PASS — all tests (3 from Task 1 + 7 here).

- [ ] **Step 5: Commit**

```bash
git add electron/packages/modoro-zalo/src/history-capture.ts electron/packages/modoro-zalo/src/history-capture.test.ts
git commit -m "feat(zalo-capture): captureInbound — path-safe, deduped, DB-independent append"
```

---

## Chunk 2: wire the hook + fork version bump + build

### Task 3: call `captureInbound` in `handleModoroZaloInbound` (before all filters)

**Files:**
- Modify: `electron/packages/modoro-zalo/src/inbound.ts`

- [ ] **Step 1: Read the insertion site**

Read `electron/packages/modoro-zalo/src/inbound.ts:455-490`. Confirm: `botUserId` is in the destructured params (line ~463); `directPeerId` (465-472) and `targetThreadId` (473) are computed; `rawBody` (479) + empty-body guard `if (!rawBody && !hasMedia) return;` (481-483). The capture call goes **immediately after** line 483 (so we have body or media) and **before** the friendship-system drop (484).

- [ ] **Step 2: Add the import** near the other `./*.js` imports at the top of `inbound.ts`:

```ts
import { captureInbound } from "./history-capture.js";
```

- [ ] **Step 3: Insert the capture call** right after the empty-body guard (after line 483):

```ts
  // === 9BizClaw AT-LANDING CAPTURE v1 ===
  // Record EVERY inbound message to the durable archive the instant it lands —
  // BEFORE allowlist / command-block / owner-takeover — so off-allowlist senders
  // are captured and recording survives openzca DB failures. Best-effort; never
  // blocks or throws into the reply path. Keyed by botUserId (owner self id);
  // skips cleanly if that is missing (poller backup still captures).
  try {
    captureInbound({
      ownerId: botUserId || "",
      threadId: targetThreadId,
      isGroup: message.isGroup,
      message,
      log: runtime.log,
    });
  } catch {}
```

- [ ] **Step 4: Type-check + run the package test suite** (confirms inbound.ts still compiles under tsx and nothing regressed)

Run: `cd electron/packages/modoro-zalo && node --import tsx --test src/*.test.ts src/**/*.test.ts`
Expected: PASS, including the new `history-capture.test.ts`. (If tsx reports a type error in inbound.ts, fix the call signature.)

- [ ] **Step 5: Commit**

```bash
git add electron/packages/modoro-zalo/src/inbound.ts
git commit -m "feat(zalo-capture): capture every inbound at landing, before the allowlist gate"
```

### Task 4: bump fork version + rebuild plugin + electron smoke

**Files:**
- Modify: `electron/lib/zalo-plugin.js:26`
- Modify: `electron/packages/modoro-zalo/src/.fork-version`

- [ ] **Step 1: Bump the fork version in BOTH sources** (required so the patch reaches existing installs; a smoke guard at `smoke-test.js:2191` fails if the two drift)

  - In `electron/lib/zalo-plugin.js:26`, change `const MODORO_ZALO_FORK_VERSION = 'modoro-zalo-v1.0.19';` to `'modoro-zalo-v1.0.20'`.
  - In `electron/packages/modoro-zalo/src/.fork-version`, change the single line `modoro-zalo-v1.0.19` to `modoro-zalo-v1.0.20` (no trailing newline change — match the existing file format).

- [ ] **Step 2: Rebuild the plugin fork** (compiles/copies modoro-zalo source to the packaged fork)

Run: `cd electron && npm run prebuild:modoro-zalo`
Expected: completes without error; the fork copy includes `history-capture.ts` and the edited `inbound.ts`.

- [ ] **Step 3: Run the electron smoke suite**

Run: `cd electron && npm run smoke`
Expected: PASS (the `better-sqlite3 NODE_MODULE_VERSION` warning under system node is the known-harmless artifact per CLAUDE.md). If `map:check` fails due to unrelated WIP route drift, that is pre-existing and not caused by this change — note it, do not regen others' routes.

- [ ] **Step 4: Commit**

```bash
git add electron/lib/zalo-plugin.js electron/packages/modoro-zalo/src/.fork-version
git commit -m "chore(zalo-capture): bump MODORO_ZALO_FORK_VERSION to v1.0.20"
```

---

## Chunk 3: owner-id verification + runtime mismatch detection

The archive is keyed by `botUserId`; the poller/read side key by `self_profiles.user_id`. These are the same Zalo uid from two sources (spec §Owner-id). This chunk makes a divergence impossible-to-miss.

### Task 5: live-session verification gate (manual, blocking)

**Files:** none (verification step).

- [ ] **Step 1:** On a machine with a logged-in Zalo account, confirm the two id sources agree:
  - `botUserId` source: the value passed into `handleModoroZaloInbound` (from `openzca me id`, monitor.ts).
  - poller source: `self_profiles.user_id` (what `customer-memory-updater.readSelfId` returns).
  Run the openzca CLI `db me info --json` and compare its id to the `selfId` the monitor resolves, and to the folder names that appear under `<ws>/zalo-history/`.
- [ ] **Step 2:** If they match (expected) → done, the namespace converges. If they differ → STOP and surface to the CEO; do not ship until reconciled (the at-landing writer would otherwise split the archive). Record the finding in `.learnings/` per project convention.
- [ ] **Step 3 (DM key convergence):** also confirm the *per-thread* key converges — on one live DM, check that the at-landing filename `<ws>/zalo-history/<owner>/<directPeerId>.jsonl` matches the basename the poller writes (the poller keys DM files by `scope_thread_id`). If `directPeerId !== scope_thread_id` for a DM, the same conversation splits across two basenames (the layer-3 detector only watches owner-folder names, not per-customer filenames). Expected to match; flag if not.

### Task 6: runtime mismatch detection in the poller (defense in depth)

**Files:**
- Modify: `electron/lib/customer-memory-updater.js`

- [ ] **Step 1: Write the failing test** — add to `electron/scripts/check-customer-memory-updater.js` as a self-contained **synchronous** block near the top-level sync tests (NOT inside the async IIFE chain), since `detectOwnerIdMismatch` is synchronous:

```js
// --- owner-id mismatch detection: a zalo-history folder whose id != selfId alerts once ---
{
  const cmu = require('../lib/customer-memory-updater');
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cmu-ownercheck-'));
  // self is 'self001' but an at-landing writer created a folder under 'other999'
  fs.mkdirSync(path.join(ws, 'zalo-history', 'other999'), { recursive: true });
  fs.mkdirSync(path.join(ws, 'zalo-history', 'self001'), { recursive: true });
  const alerts = [];
  const mism = cmu.detectOwnerIdMismatch({ wsOverride: ws, selfId: 'self001', alert: (m) => alerts.push(m) });
  assert.strictEqual(mism, true, 'mismatch detected');
  assert.strictEqual(alerts.length, 1, 'alerted once');
  assert.ok(/other999/.test(alerts[0]), 'alert names the stray owner id');
  // no-mismatch case
  const ws2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cmu-ownercheck2-'));
  fs.mkdirSync(path.join(ws2, 'zalo-history', 'self001'), { recursive: true });
  const a2 = [];
  assert.strictEqual(cmu.detectOwnerIdMismatch({ wsOverride: ws2, selfId: 'self001', alert: (m) => a2.push(m) }), false);
  assert.strictEqual(a2.length, 0, 'no alert when only selfId folder present');
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(ws2, { recursive: true, force: true });
  console.log('detectOwnerIdMismatch OK');
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd electron && node scripts/check-customer-memory-updater.js`
Expected: FAIL — `cmu.detectOwnerIdMismatch is not a function`.

- [ ] **Step 3: Implement** — add to `electron/lib/customer-memory-updater.js` and export it:

```js
// Defense in depth (spec §Owner-id layer 3): the at-landing writer keys archive
// folders by botUserId; the poller keys by self_profiles.user_id. If a folder
// appears under zalo-history/ whose id != the current selfId, the two sources have
// diverged → a silent split. Surface it loudly + alert the CEO once. Read-only.
let _ownerMismatchAlerted = false;
function detectOwnerIdMismatch({ wsOverride, selfId, alert } = {}) {
  try {
    const fs = require('fs');
    const path = require('path');
    const { getWorkspace } = require('./workspace');
    const ws = wsOverride || getWorkspace();
    if (!ws || !selfId) return false;
    const root = path.join(ws, 'zalo-history');
    let names = [];
    try { names = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return false; }
    const stray = names.filter(n => n !== String(selfId));
    if (stray.length === 0) return false;
    const msg = `[Trí nhớ khách] Phát hiện kho lịch sử Zalo bị tách: thư mục theo id khác (${stray.join(', ')}) so với tài khoản hiện tại (${selfId}). Có thể tin nhắn đang lưu vào 2 nơi.`;
    if (typeof alert === 'function') alert(msg);
    else if (!_ownerMismatchAlerted) { _ownerMismatchAlerted = true; _alertCeo(msg); }
    console.warn('[customer-memory] owner-id split detected:', stray.join(', '), 'vs', selfId);
    return true;
  } catch { return false; }
}
```

Add `detectOwnerIdMismatch` to `module.exports`.

- [ ] **Step 4: Call it once from `tick()`** — after `selfId` is resolved and before the DM loop (so it runs each poll but only alerts once via the `_ownerMismatchAlerted` latch). Insert near where `selfId` is read in `tick()`:

```js
  try { if (selfId) detectOwnerIdMismatch({ selfId }); } catch {}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd electron && node scripts/check-customer-memory-updater.js`
Expected: PASS — `detectOwnerIdMismatch OK`.

- [ ] **Step 6: Commit**

```bash
git add electron/lib/customer-memory-updater.js electron/scripts/check-customer-memory-updater.js
git commit -m "feat(zalo-capture): detect+alert on archive owner-id split (defense in depth)"
```

---

## Definition of done

- Inbound DM + group messages — including off-allowlist senders — are appended to the durable archive at landing, with **openzca's DB disabled/broken**.
- The written line is byte-identical in shape to `_toLine` (parity test green); `dir` derived; redelivery deduped.
- Capture happens before the allowlist/command-block/owner-takeover filters; never blocks or throws into the reply path.
- `MODORO_ZALO_FORK_VERSION` bumped to v1.0.20; `prebuild:modoro-zalo` clean; package tests + electron smoke green (modulo unrelated WIP map drift).
- Owner-id sources verified equal on a live session; a future split is detected + alerted.

## Notes for the implementer

- Do NOT add backfill / `db sync` / any openzca call — this is forward-only, DB-independent capture (spec anti-features).
- Do NOT capture outbound here (inbound only, per the CEO's scope).
- The poller stays as backup; both writers dedup by `msgId`. A rare cross-process duplicate line is tolerated (spec §Coexistence) — do not add cross-process locking.
- `better-sqlite3` ABI warning under system node is expected and harmless.
- Per repo rules: do not build the EXE or push unless the CEO explicitly asks.
