# 9BizClaw Multi-Agent Platform — Design Spec

**Date**: 2026-05-21
**Status**: Draft
**Author**: MODORO Tech Corp
**Scope**: Agent Profile System + Plugin Interface + Channel Abstraction + Connector Gateway + 9bizclaw Distribution

---

## 1. Problem Statement

MODOROClaw currently runs a single AI agent per installation. The 9BizClaw product line requires selling 9 specialized agents (67 workflows) to SME customers a la carte via 9bizclaw.com. Three architectural bottlenecks block this:

1. **AGENTS.md monolith** (30KB) — cannot hold rules for multiple agents within LLM context budget
2. **Monkey-patching** (23 PATCH blocks in inbound.ts) — no formal plugin API for extensibility
3. **Hardcoded channels** — adding a new messaging channel requires editing 7+ files

## 2. Goals

- Customers buy individual agents from 9bizclaw.com and install them into their MODOROClaw instance
- Multiple agents run simultaneously — router dispatches messages to the right agent
- Adding a new skill, plugin, or channel connector is a single-module operation, not a multi-file surgery
- Existing MODOROClaw functionality (Zalo chatbot, Telegram, cron, escalation) continues working unchanged

## 3. Non-Goals

- Real-time multi-agent collaboration (agents don't talk to each other)
- Multi-tenant SaaS (each customer has their own local installation)
- Agent marketplace with user-generated content (MODORO is sole publisher)
- Parallel gateway instances (single gateway, multiple agent profiles)

## 4. Architecture Overview

```
Message In (Zalo/Telegram/FB Messenger/...)
    |
    v
Channel Registry (lib/channel-registry.js)
    |
    v
Plugin Hook: before-filter
    | (blocklist, dedup, system-msg filter)
    v
Plugin Hook: before-dispatch
    | (pause check, output filter)
    v
Router Agent (lib/agent-router.js)
    | LLM classify intent → agentId (haiku, ~200 tokens)
    | Thread binding cache (reuse existing subagent-bindings.ts)
    v
Profile Loader (lib/profile-loader.js)
    | Load profiles/<agentId>/AGENTS.md + skills + knowledge
    v
OpenClaw Gateway (existing)
    | Process with agent-specific context
    v
Plugin Hook: after-reply
    | (escalation scan, memory write, analytics)
    v
Plugin Hook: before-send
    | (output filter, coalesce, split)
    v
Channel Registry → send via correct channel
```

## 5. Phase 1: Agent Profile System

### 5.1 Profile Registry

**File**: `lib/agent-profiles.js`

Profile index stored at `{workspace}/profiles/_index.json`:
```json
{
  "version": 1,
  "schemaVersion": 1,
  "defaultAgentId": "assistant",
  "agents": {
    "assistant": {
      "name": "Trợ lý tổng hợp",
      "version": "1.0.0",
      "tier": "free",
      "installedAt": "2026-05-21T00:00:00Z",
      "enabled": true
    },
    "sales": {
      "name": "Agent Bán Hàng",
      "version": "1.0.0",
      "tier": "basic",
      "installedAt": "2026-05-21T00:00:00Z",
      "enabled": true
    }
  }
}
```

**API**:
- `listProfiles(workspace)` → `{ id, name, version, tier, enabled }[]`
- `getProfile(workspace, agentId)` → profile metadata + paths
- `installProfile(workspace, clawpkgPath)` → extract, validate manifest, register
- `uninstallProfile(workspace, agentId)` → stop active crons (lookup by `agentId` tag in cron handle map → call `.stop()` + `.destroy()` on each), remove files, deregister. Cron handles are registered with `{ agentId }` metadata when created by `startCronJobs()` so they can be found for cleanup.
- `enableProfile(workspace, agentId)` / `disableProfile(workspace, agentId)`
- `migrateIndex(workspace)` — reads `schemaVersion`, applies migrations sequentially (1→2, 2→3, etc.). Called on every boot before reading index.

### 5.2 Profile Directory Structure

```
{workspace}/profiles/
  _index.json
  assistant/
    manifest.json
    AGENTS.md          # max 10KB — focused rules for this agent only
    skills/
      quote-generator.md
      follow-up-auto.md
    knowledge/
      templates/       # industry-specific templates
    schedules.json     # default crons for this agent
  sales/
    manifest.json
    AGENTS.md
    skills/
    knowledge/
    schedules.json
```

### 5.3 Manifest Format

```json
{
  "id": "sales",
  "name": "Agent Bán Hàng",
  "description": "Không có doanh thu = không có doanh nghiệp",
  "version": "1.0.0",
  "tier": "basic",
  "author": "MODORO",
  "appliesTo": ["zalo", "telegram"],
  "requiredPlugins": [],
  "requiredConnectors": [],
  "price": { "type": "addon", "vnd": 0 },
  "signature": "<ed25519-signature>",
  "checksum": "<sha256-of-zip>"
}
```

### 5.4 Router Agent

**File**: `lib/agent-router.js`

**Where the router sits**: The router runs INSIDE the modoro-zalo fork (inbound.ts), not as a separate process. It is injected as a single code block that runs BEFORE the existing `resolveAgentRoute()` call at inbound.ts:1880. The router reads the thread binding or calls LLM classify, then sets the `agentId` which `resolveAgentRoute()` respects via the existing subagent binding system.

Concretely: the router calls `bindModoroZaloSubagentSession()` (existing, subagent-bindings.ts) to bind the current thread to the resolved agentId. The existing `resolveAgentIdFromSessionKey()` at inbound.ts:132 then picks up this binding and routes to the correct agent session.

**Routing strategy** (in priority order):
1. **Thread binding** (existing `subagent-bindings.ts`): if this conversation thread is already bound to an agent, reuse it. Avoids re-classification for ongoing conversations.
2. **LLM classification**: call haiku/flash model via 9Router (localhost:20128) with a lightweight prompt listing available agents and their descriptions. Model returns agentId. Cost: ~200 tokens, ~500ms.
3. **Default fallback**: if classification fails or no agents match, route to `defaultAgentId` from `_index.json`.

**Router classification prompt** (~2KB): Auto-generated from `_index.json` on boot and on profile install/uninstall. Stored in memory (not on disk). Sent as system prompt in a direct HTTP POST to 9Router (`localhost:20128/v1/chat/completions`, model=haiku, max_tokens=50). This is a standalone API call, NOT a gateway agent session — the router does not use the OpenClaw agent pipeline for classification.

**Thread binding TTL**: Default 30 minutes. The router passes `ttlMs: 30 * 60 * 1000` directly to `bindModoroZaloSubagentSession()`, bypassing the config-driven `ttlHours` resolution. Router bindings are tagged with `label: 'agent-router'` to distinguish from other subagent bindings. Non-router bindings keep their existing 24h TTL from `DEFAULT_THREAD_BINDING_TTL_HOURS`.

**Single-agent optimization**: If only 1 agent is installed, skip classification entirely. Direct dispatch. No binding created.

### 5.5 Profile Loader

**File**: `lib/profile-loader.js`

**Context injection mechanism**: OpenClaw gateway reads AGENTS.md from the path configured in `agents.defaults.workspace` (openclaw.json). The profile loader works by writing a **composite AGENTS.md** to the workspace root before each agent session. This file is assembled from:

1. Read `profiles/<agentId>/AGENTS.md` (agent-specific rules, max 10KB)
2. Collect all `.md` files from `profiles/<agentId>/skills/` (active skills)
3. Read `profiles/<agentId>/knowledge/` index references
4. Prepend shared workspace context (SOUL.md, IDENTITY.md, COMPANY.md — per-installation, not per-agent)
5. Write composite to `{workspace}/AGENTS.md` (the path gateway reads)

**Concurrency safety**: OpenClaw gateway runs on a single-threaded Node.js event loop. The gateway's `agent-runner.runtime.js` processes inbound messages sequentially — each message goes through the full agent pipeline (context assembly → LLM call → tool execution → reply) before the next message starts. This is verified by the existing `deferGatewayRestartUntilIdle` mechanism which tracks in-flight replies as a counter, confirming at most one agent run at a time.

Given sequential processing: Profile Loader writes composite AGENTS.md BEFORE the gateway's agent-runner reads it (the write happens in the inbound plugin hook `on-route`, which fires before the gateway dispatches to the agent). Because only one message is in-flight at a time, there is no write-read interleaving. A simple `_lastWrittenAgentId` check avoids redundant rewrites when consecutive messages route to the same agent.

**Caching**: Profile content cached in memory after first load. Cache invalidated on profile install/uninstall/update. File watcher on `profiles/` directory.

### 5.6 Migration from Current Architecture

The existing single-agent setup migrates automatically:
1. On first boot after update: create `profiles/assistant/` directory
2. **Copy** (not move) current `AGENTS.md` → `profiles/assistant/AGENTS.md`. The workspace root `AGENTS.md` is kept as-is — it is the file the gateway reads, and Profile Loader will overwrite it with composite content when needed.
3. Copy current user-skills to `profiles/assistant/skills/`
4. Create `_index.json` with `defaultAgentId: "assistant"`
5. Router skips classification (single-agent optimization) — Profile Loader writes the single profile's AGENTS.md to workspace root, which is identical to the original. Zero behavior change.
6. Existing behavior is 100% preserved. Migration is idempotent (re-running is safe).

### 5.7 Shared vs Per-Agent Resources

| Resource | Scope | Rationale |
|---|---|---|
| AGENTS.md | Per-agent | Different rules per agent |
| Skills (.md) | Per-agent | Agent-specific capabilities |
| Knowledge templates | Per-agent | Industry-specific content |
| Schedules (cron) | Per-agent | Different delivery schedules |
| SOUL.md | Shared | Company personality is global |
| IDENTITY.md | Shared | CEO identity is global |
| COMPANY.md | Shared | Company info is global |
| Memory (zalo-users/*.md) | Shared (Phase 1) | All agents see customer history. Profile Loader injects ONLY the relevant customer's memory file into context, not all files. Memory file size capped at 50KB (existing). Future: add agent tags per section for selective loading. |
| openclaw.json | Shared | Gateway config is global |

## 6. Phase 2: Plugin Interface

### 6.1 Hook System

**File**: `lib/plugin-manager.js`

Replace inbound.ts monkey-patches with a formal hook pipeline. Plugins register handlers for named hooks, executed in priority order.

**Hook points**:

| Hook | When | Purpose | Current patches replaced |
|---|---|---|---|
| `before-filter` | After message received, before any processing | Drop spam, blocked senders, system msgs | blocklist, system-msg, dedup |
| `before-dispatch` | Before routing to agent | Pause check, rate limit | channel pause |
| `on-route` | During agent routing | Router agent classification | (new) |
| `after-reply` | After agent generates reply | Escalation detection, memory append | escalation scan, memory write |
| `before-send` | Before sending reply to channel | Output filter, coalesce, split | output filter, deliver-coalesce, long-msg split |
| `on-send-error` | When send fails | Error logging, CEO alert | error handlers |

**Hook execution model**:
```javascript
// lib/plugin-manager.js
class PluginManager {
  hooks = {};  // { hookName: [{ pluginId, handler, priority }] }

  register(pluginId, hookName, handler, priority = 100) {
    // Lower priority number = runs first
    if (!this.hooks[hookName]) this.hooks[hookName] = [];
    this.hooks[hookName].push({ pluginId, handler, priority });
    this.hooks[hookName].sort((a, b) => a.priority - b.priority);
  }

  unregisterAll(pluginId) {
    for (const hookName of Object.keys(this.hooks)) {
      this.hooks[hookName] = this.hooks[hookName].filter(h => h.pluginId !== pluginId);
    }
  }

  async execute(hookName, context) {
    for (const { pluginId, handler } of this.hooks[hookName]) {
      try {
        const result = await handler(context);
        if (result?.action === 'drop') return { dropped: true, by: pluginId };
        if (result?.action === 'replace') context.message = result.message;
      } catch (err) {
        console.error(`[plugin] ${pluginId} hook ${hookName} error:`, err.message);
        // Continue to next handler — one plugin crash must not break the chain
      }
    }
    return { dropped: false };
  }
}
```

**Hook context object** (passed to every handler):
```javascript
{
  message: { senderId, rawBody, isGroup, threadId, channel },
  workspace: '/path/to/workspace',
  agentId: 'sales',       // set after on-route
  reply: '...',            // set after agent reply
  metadata: {}             // plugins can attach arbitrary data
}
```

### 6.2 Plugin Format

```
{workspace}/plugins/
  zalo-blocklist/
    manifest.json
    index.js
  sender-dedup/
    manifest.json
    index.js
  output-filter/
    manifest.json
    index.js
```

**manifest.json**:
```json
{
  "id": "zalo-blocklist",
  "name": "Zalo Blocklist",
  "version": "1.0.0",
  "hooks": ["before-filter"],
  "channels": ["zalo"],
  "priority": 10
}
```

**index.js** contract:
```javascript
module.exports = {
  activate(pluginManager, workspace) {
    pluginManager.register('zalo-blocklist', 'before-filter', async (ctx) => {
      const blocklist = readBlocklist(workspace);
      if (blocklist.includes(ctx.message.senderId)) {
        return { action: 'drop', reason: 'blocklisted' };
      }
    }, 10);
  },
  deactivate(pluginManager) {
    pluginManager.unregisterAll('zalo-blocklist');
  }
};
```

### 6.3 Migration from Monkey-Patches

Each of the 23 existing patches converts to a plugin. Migration is incremental — patches and plugins can coexist during transition:

| Current Patch | Plugin ID | Hook | Priority |
|---|---|---|---|
| BLOCKLIST PATCH | `zalo-blocklist` | before-filter | 10 |
| SYSTEM-MSG PATCH | `zalo-system-msg` | before-filter | 20 |
| SENDER-DEDUP PATCH | `zalo-sender-dedup` | before-filter | 30 |
| COMMAND-BLOCK PATCH | `zalo-command-block` | before-filter | 40 |
| OUTPUT-FILTER (send.ts) | `output-filter` | before-send | 10 |
| DELIVER-COALESCE v4 | `deliver-coalesce` | before-send | 20 |
| Long message split | `message-split` | before-send | 30 |
| ESCALATION-DETECT | `escalation-detect` | after-reply | 10 |
| Channel pause | `channel-pause` | before-dispatch | 10 |

Remaining patches (output filter patterns, process-ack strip, etc.) follow the same pattern.

### 6.4 Plugin Discovery in inbound.ts

**Fork strategy**: modoro-zalo is already a permanent fork of openzalo (shipped as `electron/packages/modoro-zalo/`). The fork is copied to `~/.openclaw/extensions/modoro-zalo/` on every boot by `_ensureZaloPluginImpl()`. We commit the hook dispatch calls directly into the forked `inbound.ts` and `send.ts` source. This is NOT monkey-patching — it is a permanent source change to our fork.

The key change is in `inbound.ts`: instead of 23 injected code blocks, there are hook dispatch calls at each hook point:

```typescript
// inbound.ts — AFTER migration (permanent source change in fork)
const hookResult = await pluginManager.execute('before-filter', { message, ... });
if (hookResult.dropped) return;

// ... existing routing logic ...

const routeResult = await pluginManager.execute('on-route', { message, ... });

// ... agent processing ...

await pluginManager.execute('after-reply', { message, reply, ... });
await pluginManager.execute('before-send', { message, reply, ... });
```

The `ensureZalo*Fix()` runtime injection functions in main.js are removed one-by-one as each patch is converted to a plugin. During transition, both systems coexist: unconverted patches still inject at runtime, converted plugins run via hooks. The `pluginManager` instance is passed to inbound.ts via the plugin runtime context (same pattern as `core.channel.routing`).

## 7. Phase 3: Channel Abstraction

### 7.1 Channel Interface

**File**: `lib/channel-interface.js`

```javascript
class Channel {
  constructor(id, config) {
    this.id = id;
    this.config = config;
  }

  // Send a message to a recipient
  async send(to, text, options = {}) { throw new Error('not implemented'); }

  // Health check — is the channel ready to receive/send?
  async probe() { return { ready: false, error: 'not implemented' }; }

  // Register message handler (optional — only for channels not backed by an OpenClaw plugin)
  onMessage(handler) { /* no-op by default */ }

  // Channel-specific output filter patterns (merged with global patterns)
  getOutputFilterPatterns() { return []; }

  // Pause/resume support
  getPauseFilePath() { return `${this.id}-paused.json`; }
}
```

### 7.2 Channel Registry

**File**: `lib/channel-registry.js`

```javascript
class ChannelRegistry {
  channels = {};

  register(channel) {
    this.channels[channel.id] = channel;
    // Auto-wire:
    // - IPC handlers: check-{id}-ready, pause-{id}, resume-{id}, send-{id}-test
    // - Probe in startChannelStatusBroadcast()
    // - Dashboard sidebar entry
  }

  get(id) { return this.channels[id]; }
  list() { return Object.values(this.channels); }
  async probeAll() { /* parallel probe all channels */ }
  async sendVia(channelId, to, text, options) { /* route to correct channel */ }
}
```

### 7.3 Existing Channels Refactored

**`lib/channels/telegram.js`**:
- Wraps existing `probeTelegramReady()`, `sendTelegram()` logic
- `probe()` calls Telegram `getMe` API
- `send()` calls `sendMessage` API with retry
- `onMessage()` — not needed (gateway handles Telegram via openclaw plugin)

**`lib/channels/zalo-personal.js`**:
- Wraps existing `probeZaloReady()`, `sendZalo()` logic
- `probe()` uses process-first, lock-file-fallback pattern (existing)
- `send()` uses multi-message split for >2000 chars (existing)
- `onMessage()` — handled by openzalo plugin, not this channel

### 7.4 New Channels (added via Channel + Plugin)

Adding Facebook Messenger requires:
1. `lib/channels/facebook-messenger.js` — implements Channel interface
2. `plugins/facebook-messenger/index.js` — registers hooks for FB-specific behavior
3. Register in channel-registry at startup

That's **2 files** instead of the current **7+ files**. The Channel Registry auto-wires IPC handlers, probes, and Dashboard UI.

### 7.5 Dashboard Dynamic Rendering

Dashboard sidebar and channel pages render from `channelRegistry.list()` instead of hardcoded HTML. Each channel provides:
- `id`, `name`, `icon` — for sidebar
- `probe()` result — for status dot (green/red/grey)
- `config` — for settings page

## 8. Phase 3b: Connector Gateway

### 8.1 Architecture

Extends the existing Cron API server (port 20200, `lib/cron-api.js`) with connector routes. No separate process — reuses existing HTTP server, Bearer token auth, and localhost binding. Agents call connectors via `web_fetch` tool (already in tools.allow).

**File**: `lib/connector-routes.js` (route handlers, mounted on existing cron-api server)
**Directory**: `connectors/` (individual connector modules)

```
Agent sends: web_fetch http://127.0.0.1:20200/api/connector/google-sheets/read-range
    |
    v
Cron API server (port 20200, existing — extended with connector routes)
    | Route: /api/connector/<connector-id>/<action>
    | Auth: rotating token (existing cron-api-token.txt)
    v
connectors/google-sheets/index.js
    | OAuth token from workspace/connectors/google-sheets/auth.json
    v
Google Sheets API
```

### 8.2 Connector Module Format

```javascript
// connectors/google-sheets/index.js
module.exports = {
  id: 'google-sheets',
  name: 'Google Sheets',
  requiresOAuth: true,
  oauthConfig: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  actions: {
    'read-range': async (params, auth) => {
      // params: { spreadsheetId, range }
      // auth: { access_token, refresh_token }
      // returns: { values: [[...]] }
    },
    'write-range': async (params, auth) => {},
    'list-sheets': async (params, auth) => {}
  }
};
```

### 8.3 OAuth Flow

1. Customer clicks "Connect Google Sheets" in Dashboard
2. Dashboard opens OAuth consent screen in browser
3. Callback to `http://localhost:20200/oauth/callback/<connector-id>`
4. Connector Gateway stores tokens in `workspace/connectors/<id>/auth.json`
5. Auto-refresh on expiry

### 8.4 Priority Connectors (based on workflow analysis)

| Connector | Workflows Unblocked | Build Effort |
|---|---|---|
| Google Sheets | 4.1, 4.3, 4.8, 6.5, 8.8, 9.8 (6 WFs) | Medium |
| CRM: KiotViet | 1.5, 1.7, 3.7, 3.9, 5.10, 6.5 (6 WFs) | Hard |
| Facebook Page | 5.2 (1 WF, extends existing FB schedule) | Medium |
| Email/SMTP | 2.5 (1 WF) | Easy |

## 9. Phase 4: 9bizclaw Distribution

### 9.1 Package Format (.clawpkg)

A `.clawpkg` file is a ZIP archive containing:
```
<package-id>/
  manifest.json       # metadata, signature, checksum
  workspace/          # files to install (profiles/ or plugins/)
  icon.png            # 256x256 icon for store listing
  README.md           # description for store page
```

Signature: Ed25519. For Phase 1, reuses the license keypair (same `license-public.pem` bundled in app). Risk acknowledged: a key compromise exposes both licensing and distribution. Phase 2 improvement: generate a separate package-signing keypair and bundle `package-public.pem` alongside `license-public.pem`.

### 9.2 Install Flow

1. Download `.clawpkg` from `https://9bizclaw.com/api/packages/<id>/download`
2. Verify Ed25519 signature against bundled public key
3. Verify SHA-256 checksum
4. Check license: customer's plan must include the package tier
5. Extract to temp directory first (`{workspace}/.tmp-install/`)
6. Validate manifest, check dependencies
7. Move atomically to target directory (`profiles/`, `plugins/`, or `connectors/`). On failure, temp directory is cleaned up — no orphaned files.
8. Register in respective registry
9. Restart affected subsystem (router for agents, hook pipeline for plugins)

### 9.3 License Integration

Extend existing `validate_premium_session` Supabase function:
- `features` array returned in session validation response. **Schema change required**: add `features jsonb DEFAULT '[]'::jsonb` column to `activations` table. Then update `validate_premium_session` SQL function to return `v_activation.features` instead of the current hardcoded literal on line 81 (`'["facebook","google","brain","appointments"]'::jsonb`). This change is NOT yet implemented — it is a prerequisite for Phase 4. Each activation record will store its entitled features based on the customer's purchased plan.
- Each agent/plugin `manifest.json` includes a `featureFlag` field (e.g., `"featureFlag": "agent-sales"`). Install checks: `features.includes(package.manifest.featureFlag)`.
- License manager UI (`license-manager.js`) updated to set features per activation when issuing/editing keys.
- Existing tables: `activations` (add `features` column), `build_keys`, `session_validations` (in `supabase/migrations/001_premium_session.sql`).

### 9.4 Dashboard Store Tab

New Dashboard tab "Cửa hàng" showing:
- Grid of available agents/plugins with icon, name, price, installed status
- Filter by category (agent vs plugin vs connector)
- Install/uninstall buttons
- Source: static JSON catalog bundled with app, updated on app update. Not a live API (offline-first). Known limitation: adding a new agent to the store requires shipping a new app build. Future improvement: fetch catalog from CDN with local fallback.

## 10. Testing Strategy

### Unit Tests
- Profile CRUD operations (install, uninstall, enable, disable)
- Hook execution order and drop/replace semantics
- Channel interface contract compliance
- Connector action routing and auth refresh

### Integration Tests
- Full message flow: receive → route → agent → reply → send
- Multi-agent routing accuracy (test with 3+ profiles)
- Plugin hook chain with multiple plugins registered
- Connector OAuth flow end-to-end

### Migration Tests
- Fresh install: profiles/ created correctly, single-agent optimization works
- Upgrade from current version: existing AGENTS.md migrated to profiles/assistant/
- All 23 patches converted to plugins: behavior identical to pre-migration

### Performance Tests
- Hook pipeline total latency: <50ms for all hooks at each hook point (with 9+ plugins registered)
- Router LLM classification: <1000ms p95 via 9Router haiku
- Profile Loader composite AGENTS.md write: <20ms (cached profile, mutex acquisition included)
- Channel probe: <6s per channel (existing Telegram getMe timeout)

## 11. Risk Assessment

| Risk | Mitigation |
|---|---|
| Router LLM misclassifies intent | Thread binding cache (30min TTL) + manual re-route command + fallback to default agent |
| Plugin hook performance overhead | Hooks are async but sequential within a hook point. Benchmark: <50ms total for all hooks at each point |
| inbound.ts migration breaks existing patches | Incremental migration: convert 1 patch at a time, test, repeat. Patches and plugins coexist during transition |
| AGENTS.md context budget exceeded | Per-agent max 10KB enforced at install time. Router AGENTS.md is auto-generated ~2KB |
| Customer installs incompatible plugin | manifest.json declares `requiredPlugins` and `appliesTo` channels. Install validates dependencies |
| Connector OAuth tokens expire | Auto-refresh built into connector gateway. Probe endpoint returns auth status. Dashboard shows warning if expired |

## 12. Success Criteria

1. Customer installs Agent Ban Hang from Dashboard Store → agent active, routing works, Zalo messages about sales go to sales agent
2. Customer installs Google Sheets connector → links their spreadsheet → Agent Tai Chinh reads daily revenue automatically
3. Developer adds new channel (Facebook Messenger) by creating 2 files, no changes to existing code
4. All 23 inbound.ts patches migrated to plugins with zero behavior change
5. Fresh install and upgrade-from-current both work without manual intervention
