# Higgsfield MCP Integration — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.
> **Deferred** — write-now, build-later. Spec: `docs/superpowers/specs/2026-06-04-higgsfield-mcp-integration-design.md`.

**Goal:** Full Higgsfield creative platform (image/video/Soul/marketing/virality, 29 MCP tools) for the CEO via Telegram, through OpenClaw's MCP client, CEO-only, co-equal with free-Veo3.

**Already proven (don't re-litigate):** hosted MCP `https://mcp.higgsfield.ai/mcp` + OAuth device flow (`fnf-device-auth.higgsfield.ai/authorize`→`/token`→`/refresh`) + token → `initialize`/`tools/list` = 29 tools. All endpoints/shapes are in the spec.

---

## Task 0 (GATING): resolve the OpenClaw MCP token mechanism
**Files:** read `electron/node_modules/openclaw/dist/**` (no edits).
- [ ] Inspect the `mcpServers` config schema for OpenClaw 2026.4.14: does an entry support `{ url, type:"streamable-http", headers:{Authorization:"Bearer …"} }`, or does it require OpenClaw to run its own OAuth (auth-code/PKCE)?
- [ ] Decide the token-wiring branch:
  - **(a) static header** → we own device-flow + refresh, inject `Authorization` header. (preferred)
  - **(b) OpenClaw-owns-OAuth** → locate OpenClaw's MCP credential store + write our device-flow tokens in its format.
- [ ] Document the decision at the top of `lib/higgsfield-auth.js`. **Everything below assumes (a); adjust task 3 if (b).**

## Task 1: `lib/higgsfield-auth.js` — device flow + token lifecycle
**Files:** create `electron/lib/higgsfield-auth.js`; test `electron/scripts/check-higgsfield-auth.js`.
- [ ] Port the working poller from this session. Functions: `startDeviceFlow()`, `pollToken(deviceCode, interval, expiresAt)`, `loadCreds()`, `refreshIfNeeded()` (uses `/refresh` before the ~60-min access expiry), `isConnected()`.
- [ ] Token store `<userData>/higgsfield-creds.json` (mode 600 intent; add `higgsfield-creds.json` to repo `.gitignore`; do NOT add to SACRED_DIRS — credentials are re-obtainable + must not land in plaintext backups). Never log token values.
- [ ] HTTP via the same approach that worked (global `fetch` is fine; module loads under Electron Node 18 — no node:sqlite, pure fetch+fs, so no ABI concern).
- [ ] Tests: device-flow request body shape; token parse/store; `refreshIfNeeded` triggers near expiry; `isConnected` false when no creds. Stub `fetch`.

## Task 2: cron-api endpoints (CEO-Telegram gated)
**Files:** modify `electron/lib/cron-api.js`.
- [ ] `POST /api/higgsfield/connect` → `startDeviceFlow()`, return `{verification_uri}`, kick a background poll that stores creds on success + (task 3) injects the mcpServers entry. Behind the existing CEO-Telegram auth gate; NOT in PUBLIC_ROUTES.
- [ ] `GET /api/higgsfield/status` → connected? + `balance` (call the MCP `balance` tool with the token). 
- [ ] (Optional) `POST /api/higgsfield/disconnect` → delete creds + remove the mcpServers entry.

## Task 3: OpenClaw config injection (survives ensureDefaultConfig)
**Files:** modify `electron/main.js` (`ensureDefaultConfig`/the config heal) + wherever openclaw.json is written.
- [ ] When `higgsfield-auth.isConnected()`: inject a `mcpServers` entry for `https://mcp.higgsfield.ai/mcp` (streamable-http + current Bearer header per Task 0(a)) via `writeOpenClawConfigIfChanged()` (byte-equal guard; NEVER raw/PowerShell edit). When not connected: ensure it's absent.
- [ ] `ensureDefaultConfig`'s "delete unrecognized keys" heal MUST preserve this entry (whitelist `mcpServers`). Verify `healOpenClawConfigInline` doesn't strip it.
- [ ] On token refresh (Task 1), update the header via the same writer (byte-equal → no needless gateway restart).
- [ ] Test: creds present → entry injected + survives a heal pass; creds absent → entry omitted.

## Task 4 (LOAD-BEARING): CEO-only security isolation
**Files:** tool-gate / `tools.allow` scoping; verify `electron/packages/modoro-zalo/src/inbound.ts` tool set; smoke guard.
- [ ] Ensure Higgsfield MCP tools are available ONLY on the CEO Telegram channel — never on a Zalo customer turn (a customer must not invoke `generate_image` and burn CEO credits, nor any Higgsfield tool).
- [ ] Add a smoke/guard test asserting a Zalo-channel turn's available tool set EXCLUDES all `higgsfield`/MCP tools. This is the must-pass test.
- [ ] If fork source changes, bump `MODORO_ZALO_FORK_VERSION`.

## Task 5: AGENTS.md routing (CEO section)
**Files:** `AGENTS.md` + `electron/lib/workspace.js` (bump CURRENT_AGENTS_MD_VERSION + header).
- [ ] Add a Higgsfield section (CEO Telegram): intent → tool map (image/video/Soul/marketing/virality/clipper/reframe/upscale). Co-equal with free-Veo3 (offer both; Higgsfield for premium models/4K/Soul-consistency/marketing-studio). ALWAYS check `balance` before a paid generation; surface cost; never overspend; honest when not connected ("CEO chưa kết nối Higgsfield — gõ 'kết nối Higgsfield'").
- [ ] Bump AGENTS version (both constant + header, in sync).

## Task 6: runtime verify + build
- [ ] Extend `verify-runtime.js`: with a token, `initialize` + `tools/list` against the MCP under the Electron runtime → 200/29 tools.
- [ ] Wire `check-higgsfield-auth.js` + the security guard into smoke.
- [ ] Full `npm run build:win`; smoke 0 failures; runtime gate green.

## Anti-features (do NOT)
- No `@higgsfield/cli` (binary download fails on proxy/AV networks). No Zalo-customer exposure. No bundled credits. No auto-connect.

## Risks
- Task 0 outcome (static header vs OpenClaw-OAuth) branches Task 3. Resolve first.
- Token expiry mid-session → refresh daemon must keep the header current; stale token = MCP 401 (the bot should surface "kết nối Higgsfield hết hạn, kết nối lại").
