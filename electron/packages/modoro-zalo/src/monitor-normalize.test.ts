import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOpenzcaInboundPayload } from "./monitor-normalize.ts";

test("normalizes direct message and resolves dmPeerId", () => {
  const payload = {
    threadId: "20002",
    senderId: "10001",
    toId: "self-1",
    content: "hello",
    timestamp: 1_735_000_000,
    chatType: "user",
  };

  const normalized = normalizeOpenzcaInboundPayload(payload, "self-1");

  assert.ok(normalized);
  assert.equal(normalized?.isGroup, false);
  assert.equal(normalized?.senderId, "10001");
  assert.equal(normalized?.dmPeerId, "10001");
  assert.equal(normalized?.text, "hello");
});

test("passes self-message through (senderId === self id) pinned to selfId", () => {
  // Was dropped pre---self; now passed through so inbound.ts can capture/drop it.
  // Loop-safety is enforced in inbound.ts (the __tkIsOwner guard), not here.
  const payload = {
    threadId: "20002",
    senderId: "self-1",
    content: "echo",
    chatType: "user",
  };

  const normalized = normalizeOpenzcaInboundPayload(payload, "self-1");
  assert.ok(normalized);
  assert.equal(normalized?.senderId, "self-1");
});

test("passes self-message through (senderId sentinel 0) pinned to selfId", () => {
  const payload = {
    threadId: "20002",
    senderId: "0",
    content: "echo",
    chatType: "user",
  };

  const normalized = normalizeOpenzcaInboundPayload(payload, "self-1");
  assert.ok(normalized);
  assert.equal(normalized?.senderId, "self-1");
});

test("keeps owner /tamdung self-command and pins senderId to self id", () => {
  // CEO types /tamdung from the bot's own Zalo account → a self-message. It must
  // survive the self-drop so inbound.ts owner-takeover can pause the thread, and
  // it must key under the CUSTOMER (dmPeerId), not the owner.
  const payload = {
    threadId: "cust-9",
    senderId: "self-1",
    toId: "cust-9",
    content: "/tamdung",
    chatType: "user",
  };

  const normalized = normalizeOpenzcaInboundPayload(payload, "self-1");
  assert.ok(normalized);
  assert.equal(normalized?.senderId, "self-1");
  assert.equal(normalized?.dmPeerId, "cust-9");
  assert.equal(normalized?.text, "/tamdung");
});

test("keeps owner /tieptuc resume self-command flagged via fromMe", () => {
  const payload = {
    threadId: "cust-9",
    senderId: "0",
    toId: "cust-9",
    fromMe: true,
    content: "/tieptuc",
    chatType: "user",
  };

  const normalized = normalizeOpenzcaInboundPayload(payload, "self-1");
  assert.ok(normalized);
  assert.equal(normalized?.senderId, "self-1");
  assert.equal(normalized?.dmPeerId, "cust-9");
});

test("passes a non-command self-message through (CEO takeover reply, captured downstream)", () => {
  // With openzca --self the CEO's manual replies during takeover arrive as self-messages.
  // normalize now passes ALL self-messages through (pinned to selfId); inbound.ts decides
  // whether to capture (paused) or drop (the __tkIsOwner guard) — never dispatch. This is
  // what lets the bot learn what the CEO said during takeover.
  const payload = {
    threadId: "cust-9",
    senderId: "self-1",
    toId: "cust-9",
    content: "em là nhân viên hỗ trợ tên Vân",
    chatType: "user",
  };

  const normalized = normalizeOpenzcaInboundPayload(payload, "self-1");
  assert.ok(normalized);
  assert.equal(normalized?.senderId, "self-1");
  assert.equal(normalized?.dmPeerId, "cust-9");
  assert.equal(normalized?.text, "em là nhân viên hỗ trợ tên Vân");
});

test("drops self-message when self id is unknown (cannot prove owner)", () => {
  const payload = {
    threadId: "cust-9",
    senderId: "0",
    fromMe: true,
    content: "/tamdung",
    chatType: "user",
  };

  const normalized = normalizeOpenzcaInboundPayload(payload, undefined);
  assert.equal(normalized, null);
});

test("extracts mention ids from payload and metadata variants", () => {
  const payload = {
    threadId: "1426870657825641161",
    senderId: "1471383327500481391",
    chatType: "group",
    content: "@bot hi",
    mentionIds: ["555", 666],
    mentions: [{ uid: "777" }, { userId: 888 }],
    metadata: {
      mentions: [{ uid: "999" }],
      mentionList: [{ user_id: "111" }],
    },
  };

  const normalized = normalizeOpenzcaInboundPayload(payload, "self-1");
  assert.ok(normalized);
  assert.equal(normalized?.isGroup, true);
  assert.deepEqual(
    normalized?.mentionIds.slice().sort(),
    ["111", "555", "666", "777", "888", "999"].sort(),
  );
});

test("extracts normalized mention entities with spaced text", () => {
  const payload = {
    threadId: "1426870657825641161",
    senderId: "1471383327500481391",
    chatType: "group",
    content: "@Hà Thư /new",
    mentions: [{ uid: "bot-1", pos: 0, len: 8 }],
  };

  const normalized = normalizeOpenzcaInboundPayload(payload, "self-1");
  assert.ok(normalized);
  assert.equal(normalized?.mentions.length, 1);
  assert.deepEqual(normalized?.mentions[0], {
    uid: "bot-1",
    pos: 0,
    len: 8,
    text: "@Hà Thư",
  });
});
