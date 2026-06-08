import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildLine, captureInbound } from "./history-capture.js";

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
