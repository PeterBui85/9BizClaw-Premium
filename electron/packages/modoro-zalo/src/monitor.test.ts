import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { OPENZCA_LISTEN_ARGS } from "./listen-args.ts";
import {
  getOpenzcaCredentialsPath,
  sleepWithAbortOrCredentialChange,
} from "./monitor.ts";

test("openzca listen args use supervised raw mode", () => {
  assert.deepEqual(OPENZCA_LISTEN_ARGS, ["listen", "--raw", "--supervised"]);
  assert.equal(OPENZCA_LISTEN_ARGS.includes("--keep-alive"), false);
});

test("reconnect sleep wakes early when openzca credentials change", async () => {
  let reads = 0;
  const startedAt = Date.now();
  const result = await sleepWithAbortOrCredentialChange(
    1000,
    new AbortController().signal,
    () => (++reads >= 3 ? "v2" : "v1"),
    "v1",
    5,
  );

  assert.equal(result.reason, "credentials-changed");
  assert.equal(result.version, "v2");
  assert.ok(Date.now() - startedAt < 500);
});

test("openzca credentials path is profile-specific", () => {
  assert.match(
    getOpenzcaCredentialsPath("default", "C:\\Users\\CEO"),
    /[\\/]Users[\\/]CEO[\\/]\.openzca[\\/]profiles[\\/]default[\\/]credentials\.json$/,
  );
});

test("monitor resolves openzca self id on every listener reconnect", async () => {
  const source = await readFile(new URL("./monitor.ts", import.meta.url), "utf8");

  assert.doesNotMatch(
    source,
    /if\s*\(!selfId\)\s*\{[\s\S]{0,600}?runOpenzcaCommand/,
    "selfId must not be guarded by if (!selfId); account re-login can change the active Zalo identity",
  );
});
