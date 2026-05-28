# 9BizClaw Multi-Agent Platform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable MODOROClaw to host multiple AI agent profiles, route messages via LLM classification, manage plugins via formal hooks, abstract channels, and distribute packages via 9bizclaw.com.

**Architecture:** Router + Sub-agents pattern. Router classifies intent via 9Router haiku call, binds thread to agentId via existing subagent-bindings. Profile Loader writes composite AGENTS.md to workspace root before gateway dispatch. Plugin Manager replaces 23 monkey-patches with hook pipeline. Channel Registry abstracts send/probe per channel.

**Tech Stack:** Node.js (Electron main process), TypeScript (modoro-zalo fork), node-cron, raw HTTP server (cron-api.js), Ed25519 (Node.js built-in `crypto.verify`), SQLite (better-sqlite3), adm-zip (new dep for .clawpkg extraction)

**Prerequisites:**
- `activations` table must exist in Supabase (created via dashboard or prior migration)
- `electron/tests/` directory will be created (new)
- Built-in plugins ship in `electron/plugins/` source, copied to `{workspace}/plugins/` on boot by seedWorkspace()

**Critical process boundary:** The gateway is spawned as a **separate child process** (`child_process.spawn(node, [openclaw.mjs, gateway, run])` in `gateway.js:544`). It has its own V8 isolate. `global` variables from the Electron main process are NOT accessible.

**Plugin Manager architecture:**
- `plugin-manager.js` is bundled as part of the **modoro-zalo fork** (`electron/packages/modoro-zalo/src/plugin-manager.ts`). It runs INSIDE the gateway process.
- The fork's `inbound.ts` imports and instantiates `PluginManager` at module scope. Plugins are loaded from `{workspace}/plugins/` (path obtained via `process.env['9BIZ_WORKSPACE']`, already set by gateway.js:571).
- The **router classification** (calling 9Router haiku) also runs inside the gateway process as a plugin on the `on-route` hook — it's NOT a separate Electron-side module. `agent-router.js` in `electron/lib/` is only used by the Electron main process for `refreshClassificationPrompt()` on boot and profile install/uninstall (to generate the prompt). The actual classification HTTP call happens from within inbound.ts via a `router-plugin`.
- Profile Loader's `writeCompositeIfNeeded()` runs inside the gateway process (triggered by the `on-route` hook). The workspace path comes from `process.env['9BIZ_WORKSPACE']`.

**Spec:** `docs/superpowers/specs/2026-05-21-multi-agent-platform-design.md`

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `electron/lib/agent-profiles.js` | Profile CRUD: install, uninstall, enable, disable, migrate, list |
| `electron/lib/profile-loader.js` | Assemble composite AGENTS.md from profile + shared context, write to workspace |
| `electron/lib/agent-router.js` | LLM intent classification via 9Router, thread binding management |
| `electron/packages/modoro-zalo/src/plugin-manager.ts` | Hook registration, execution, plugin lifecycle — runs inside gateway process |
| `electron/packages/modoro-zalo/src/router-plugin.ts` | Router classification plugin — calls 9Router haiku from within gateway |
| `electron/lib/channel-interface.js` | Base Channel class definition |
| `electron/lib/channel-registry.js` | Channel registration, auto-wire IPC/probes, sendVia routing |
| `electron/lib/channels/telegram.js` | Telegram Channel implementation (wraps existing) |
| `electron/lib/channels/zalo-personal.js` | Zalo Channel implementation (wraps existing) |
| `electron/lib/connector-routes.js` | Connector HTTP routes mounted on cron-api server |
| `electron/lib/package-installer.js` | .clawpkg download, verify signature, extract, register |
| `electron/tests/agent-profiles.test.js` | Unit tests for profile CRUD |
| `electron/tests/plugin-manager.test.js` | Unit tests for hook system |
| `electron/tests/agent-router.test.js` | Unit tests for routing logic |
| `electron/tests/profile-loader.test.js` | Unit tests for composite AGENTS.md assembly |
| `electron/tests/channel-registry.test.js` | Unit tests for channel abstraction |

### Modified Files

| File | Changes |
|---|---|
| `electron/lib/workspace.js` | Add `migrateToProfiles()` in `seedWorkspace()` |
| `electron/lib/cron.js` | Tag cron handles with `agentId`, expose handle map for cleanup |
| `electron/lib/cron-api.js` | Mount connector routes via `mountConnectorRoutes(server)` |
| `electron/lib/channels.js` | Extract `sendTelegram`/`sendZalo` logic into Channel classes |
| `electron/lib/dashboard-ipc.js` | Add profile management + store IPC handlers |
| `electron/main.js` | Wire profile system + plugin manager + channel registry in boot sequence |
| `electron/packages/modoro-zalo/src/inbound.ts` | Add hook dispatch calls at 6 hook points including `on-send-error` (permanent fork change) |
| `electron/packages/modoro-zalo/src/send.ts` | Add `before-send` + `on-send-error` hook dispatch (permanent fork change) |
| `electron/preload.js` | Add IPC bridges for profile management + store handlers |
| `electron/package.json` | Add `adm-zip` dependency for .clawpkg extraction |
| `electron/ui/dashboard.html` | Add Store tab, dynamic channel sidebar |
| `supabase/migrations/002_features_column.sql` | Add `features jsonb` column to `activations` table |

---

## Chunk 1: Agent Profile System (Phase 1)

### Task 1: Profile Registry — CRUD module

**Files:**
- Create: `electron/lib/agent-profiles.js`
- Create: `electron/tests/agent-profiles.test.js`

- [ ] **Step 1: Write failing tests for profile registry**

```javascript
// electron/tests/agent-profiles.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { listProfiles, getProfile, installProfileFromDir,
        uninstallProfile, enableProfile, disableProfile,
        migrateIndex } = require('../lib/agent-profiles');

let workspace;

function setup() {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'claw-test-'));
  fs.mkdirSync(path.join(workspace, 'profiles'), { recursive: true });
}
function teardown() {
  fs.rmSync(workspace, { recursive: true, force: true });
}

// Test 1: listProfiles returns empty on fresh workspace
setup();
assert.deepStrictEqual(listProfiles(workspace), []);
teardown();

// Test 2: installProfileFromDir creates profile + registers in index
setup();
const profileDir = path.join(os.tmpdir(), 'test-profile-sales');
fs.mkdirSync(profileDir, { recursive: true });
fs.writeFileSync(path.join(profileDir, 'manifest.json'), JSON.stringify({
  id: 'sales', name: 'Agent Sales', version: '1.0.0', tier: 'basic'
}));
fs.writeFileSync(path.join(profileDir, 'AGENTS.md'), '# Sales Agent Rules');
fs.mkdirSync(path.join(profileDir, 'skills'), { recursive: true });
installProfileFromDir(workspace, profileDir);
const profiles = listProfiles(workspace);
assert.strictEqual(profiles.length, 1);
assert.strictEqual(profiles[0].id, 'sales');
assert.strictEqual(profiles[0].enabled, true);
teardown();
fs.rmSync(profileDir, { recursive: true, force: true });

// Test 3: getProfile returns paths
setup();
// ... install sales first ...
const p = getProfile(workspace, 'sales');
assert.ok(p.agentsMdPath.endsWith('profiles/sales/AGENTS.md'));
teardown();

// Test 4: disableProfile sets enabled=false
// Test 5: enableProfile sets enabled=true
// Test 6: uninstallProfile removes dir + deregisters
// Test 7: migrateIndex is idempotent on schemaVersion 1
// Test 8: listProfiles returns only enabled when filter=true

console.log('All agent-profiles tests passed');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node electron/tests/agent-profiles.test.js`
Expected: FAIL — `Cannot find module '../lib/agent-profiles'`

- [ ] **Step 3: Implement agent-profiles.js**

```javascript
// electron/lib/agent-profiles.js
'use strict';
const fs = require('fs');
const path = require('path');

const INDEX_FILE = '_index.json';
const CURRENT_SCHEMA_VERSION = 1;

function indexPath(workspace) {
  return path.join(workspace, 'profiles', INDEX_FILE);
}

function readIndex(workspace) {
  const p = indexPath(workspace);
  if (!fs.existsSync(p)) {
    return { version: 1, schemaVersion: CURRENT_SCHEMA_VERSION, defaultAgentId: 'assistant', agents: {} };
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeIndex(workspace, index) {
  const p = indexPath(workspace);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(index, null, 2) + '\n', 'utf-8');
}

function migrateIndex(workspace) {
  const index = readIndex(workspace);
  // schemaVersion 1 is current — no migrations yet
  if (!index.schemaVersion) {
    index.schemaVersion = CURRENT_SCHEMA_VERSION;
    writeIndex(workspace, index);
  }
  return index;
}

function listProfiles(workspace, { enabledOnly = false } = {}) {
  const index = readIndex(workspace);
  return Object.entries(index.agents)
    .filter(([, a]) => !enabledOnly || a.enabled)
    .map(([id, a]) => ({ id, ...a }));
}

function getProfile(workspace, agentId) {
  const index = readIndex(workspace);
  const agent = index.agents[agentId];
  if (!agent) return null;
  const profileDir = path.join(workspace, 'profiles', agentId);
  return {
    ...agent,
    id: agentId,
    profileDir,
    agentsMdPath: path.join(profileDir, 'AGENTS.md'),
    skillsDir: path.join(profileDir, 'skills'),
    knowledgeDir: path.join(profileDir, 'knowledge'),
    schedulesPath: path.join(profileDir, 'schedules.json'),
    manifestPath: path.join(profileDir, 'manifest.json'),
  };
}

function installProfileFromDir(workspace, sourceDir) {
  const manifestPath = path.join(sourceDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('manifest.json not found');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (!manifest.id) throw new Error('manifest.id required');

  const targetDir = path.join(workspace, 'profiles', manifest.id);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.cpSync(sourceDir, targetDir, { recursive: true });

  const index = readIndex(workspace);
  index.agents[manifest.id] = {
    name: manifest.name || manifest.id,
    version: manifest.version || '0.0.0',
    tier: manifest.tier || 'free',
    installedAt: new Date().toISOString(),
    enabled: true,
  };
  writeIndex(workspace, index);
}

function uninstallProfile(workspace, agentId) {
  const index = readIndex(workspace);
  if (!index.agents[agentId]) return false;
  delete index.agents[agentId];
  if (index.defaultAgentId === agentId) {
    const remaining = Object.keys(index.agents);
    index.defaultAgentId = remaining[0] || 'assistant';
  }
  writeIndex(workspace, index);

  const profileDir = path.join(workspace, 'profiles', agentId);
  if (fs.existsSync(profileDir)) {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  return true;
}

function enableProfile(workspace, agentId) {
  const index = readIndex(workspace);
  if (!index.agents[agentId]) return false;
  index.agents[agentId].enabled = true;
  writeIndex(workspace, index);
  return true;
}

function disableProfile(workspace, agentId) {
  const index = readIndex(workspace);
  if (!index.agents[agentId]) return false;
  index.agents[agentId].enabled = false;
  writeIndex(workspace, index);
  return true;
}

module.exports = {
  listProfiles, getProfile, installProfileFromDir,
  uninstallProfile, enableProfile, disableProfile,
  migrateIndex, readIndex, CURRENT_SCHEMA_VERSION,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node electron/tests/agent-profiles.test.js`
Expected: `All agent-profiles tests passed`

- [ ] **Step 5: Commit**

```bash
git add electron/lib/agent-profiles.js electron/tests/agent-profiles.test.js
git commit -m "feat: add agent profile registry with CRUD + tests"
```

---

### Task 2: Profile Loader — composite AGENTS.md assembly

**Files:**
- Create: `electron/lib/profile-loader.js`
- Create: `electron/tests/profile-loader.test.js`

- [ ] **Step 1: Write failing tests for profile loader**

Tests should cover:
- `assembleComposite(workspace, agentId)` returns string with shared context + agent AGENTS.md + skills
- `writeCompositeIfNeeded(workspace, agentId)` skips write when `_lastWrittenAgentId` matches
- `writeCompositeIfNeeded(workspace, agentId)` writes when agentId changes
- `invalidateCache()` forces next write
- Composite respects 10KB max for agent AGENTS.md (truncate with warning)

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement profile-loader.js**

Core logic:
```javascript
// electron/lib/profile-loader.js
'use strict';
const fs = require('fs');
const path = require('path');
const { getProfile } = require('./agent-profiles');

const MAX_AGENT_MD_BYTES = 10 * 1024;
let _cache = {};  // { agentId: compositeString }
let _lastWrittenAgentId = null;

function assembleComposite(workspace, agentId) {
  if (_cache[agentId]) return _cache[agentId];

  const profile = getProfile(workspace, agentId);
  if (!profile) throw new Error(`Profile not found: ${agentId}`);

  const parts = [];

  // Shared context (per-installation)
  for (const shared of ['SOUL.md', 'IDENTITY.md', 'COMPANY.md']) {
    const p = path.join(workspace, shared);
    if (fs.existsSync(p)) parts.push(fs.readFileSync(p, 'utf-8').trim());
  }

  // Agent AGENTS.md (max 10KB)
  if (fs.existsSync(profile.agentsMdPath)) {
    let agentMd = fs.readFileSync(profile.agentsMdPath, 'utf-8');
    if (Buffer.byteLength(agentMd, 'utf-8') > MAX_AGENT_MD_BYTES) {
      console.warn(`[profile-loader] ${agentId} AGENTS.md exceeds 10KB, truncating`);
      agentMd = Buffer.from(agentMd, 'utf-8').subarray(0, MAX_AGENT_MD_BYTES).toString('utf-8');
      // Handle incomplete multi-byte char at boundary
      agentMd = agentMd.replace(/[�]$/, '');
    }
    parts.push(agentMd.trim());
  }

  // Agent skills
  if (fs.existsSync(profile.skillsDir)) {
    for (const f of fs.readdirSync(profile.skillsDir).filter(f => f.endsWith('.md'))) {
      parts.push(fs.readFileSync(path.join(profile.skillsDir, f), 'utf-8').trim());
    }
  }

  const composite = parts.join('\n\n---\n\n');
  _cache[agentId] = composite;
  return composite;
}

function writeCompositeIfNeeded(workspace, agentId) {
  if (_lastWrittenAgentId === agentId) return false;
  const composite = assembleComposite(workspace, agentId);
  const target = path.join(workspace, 'AGENTS.md');
  fs.writeFileSync(target, composite, 'utf-8');
  _lastWrittenAgentId = agentId;
  return true;
}

function invalidateCache(agentId) {
  if (agentId) { delete _cache[agentId]; }
  else { _cache = {}; }
  _lastWrittenAgentId = null;
}

module.exports = { assembleComposite, writeCompositeIfNeeded, invalidateCache };
```

- [ ] **Step 4: Run tests — PASS**
- [ ] **Step 5: Commit**

```bash
git add electron/lib/profile-loader.js electron/tests/profile-loader.test.js
git commit -m "feat: add profile loader — composite AGENTS.md assembly"
```

---

### Task 3: Agent Router — LLM classification + thread binding

**Files:**
- Create: `electron/lib/agent-router.js`
- Create: `electron/tests/agent-router.test.js`

- [ ] **Step 1: Write failing tests for router**

Tests should cover:
- `resolveAgent(workspace, threadKey, messageText)` returns cached agentId if thread bound
- Returns `defaultAgentId` when only 1 profile installed (single-agent optimization)
- Calls 9Router API when multiple profiles and no binding (mock HTTP)
- Falls back to `defaultAgentId` on classification error
- `generateClassificationPrompt(profiles)` produces correct system prompt

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement agent-router.js**

Core logic:
```javascript
// electron/lib/agent-router.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { listProfiles, readIndex } = require('./agent-profiles');

let _classificationPrompt = null;

function generateClassificationPrompt(profiles, workspace) {
  const agentList = profiles.map(p => {
    const manifest = _readManifestSafe(workspace, p.id);
    const desc = manifest?.description || p.name;
    return `- "${p.id}": ${desc}`;
  }).join('\n');
  return `You are a message router. Given a user message, respond with ONLY the agent ID that should handle it.\n\nAvailable agents:\n${agentList}\n\nRespond with just the agent ID, nothing else.`;
}

function _readManifestSafe(workspace, agentId) {
  try {
    const p = path.join(workspace, 'profiles', agentId, 'manifest.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { return null; }
}

function refreshClassificationPrompt(workspace) {
  const profiles = listProfiles(workspace, { enabledOnly: true });
  _classificationPrompt = generateClassificationPrompt(profiles, workspace);
}

async function classifyVia9Router(messageText) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'haiku',
      max_tokens: 50,
      messages: [
        { role: 'system', content: _classificationPrompt },
        { role: 'user', content: messageText.slice(0, 500) }
      ]
    });
    const req = http.request({
      hostname: '127.0.0.1', port: 20128,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const agentId = parsed.choices?.[0]?.message?.content?.trim()?.toLowerCase();
          resolve(agentId || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(body);
  });
}

async function resolveAgent(workspace, threadKey, messageText, { getBoundAgent, bindAgent } = {}) {
  const index = readIndex(workspace);
  const profiles = listProfiles(workspace, { enabledOnly: true });

  // Single-agent optimization
  if (profiles.length <= 1) {
    return profiles[0]?.id || index.defaultAgentId || 'assistant';
  }

  // Check existing thread binding
  if (getBoundAgent) {
    const bound = getBoundAgent(threadKey);
    if (bound) return bound;
  }

  // LLM classification
  if (!_classificationPrompt) refreshClassificationPrompt(workspace);
  const classified = await classifyVia9Router(messageText);
  const validIds = new Set(profiles.map(p => p.id));
  const agentId = (classified && validIds.has(classified)) ? classified : index.defaultAgentId;

  // Bind thread for future messages
  if (bindAgent) bindAgent(threadKey, agentId);

  return agentId;
}

module.exports = { resolveAgent, refreshClassificationPrompt, generateClassificationPrompt };
```

- [ ] **Step 4: Run tests — PASS**
- [ ] **Step 5: Commit**

```bash
git add electron/lib/agent-router.js electron/tests/agent-router.test.js
git commit -m "feat: add agent router — LLM classify + thread binding"
```

---

### Task 4: Migration — workspace.js integration

**Files:**
- Modify: `electron/lib/workspace.js` (add `migrateToProfiles()` call in `seedWorkspace()`)

- [ ] **Step 1: Write failing test for migration**

Test: given a workspace with existing `AGENTS.md` at root, calling `migrateToProfiles(workspace)` creates `profiles/assistant/AGENTS.md` (copy), `profiles/_index.json` with `defaultAgentId: "assistant"`. Second call is idempotent.

- [ ] **Step 2: Implement `migrateToProfiles()` in agent-profiles.js**

```javascript
function migrateToProfiles(workspace) {
  const indexP = indexPath(workspace);
  if (fs.existsSync(indexP)) return; // already migrated

  const profilesDir = path.join(workspace, 'profiles', 'assistant');
  fs.mkdirSync(profilesDir, { recursive: true });

  // Copy AGENTS.md
  const srcAgents = path.join(workspace, 'AGENTS.md');
  if (fs.existsSync(srcAgents)) {
    fs.copyFileSync(srcAgents, path.join(profilesDir, 'AGENTS.md'));
  }

  // Copy user-skills
  const srcSkills = path.join(workspace, 'user-skills');
  const dstSkills = path.join(profilesDir, 'skills');
  if (fs.existsSync(srcSkills)) {
    fs.cpSync(srcSkills, dstSkills, { recursive: true });
  }

  // Write manifest
  fs.writeFileSync(path.join(profilesDir, 'manifest.json'), JSON.stringify({
    id: 'assistant', name: 'Trợ lý tổng hợp', version: '1.0.0', tier: 'free'
  }, null, 2));

  // Write index
  writeIndex(workspace, {
    version: 1, schemaVersion: CURRENT_SCHEMA_VERSION,
    defaultAgentId: 'assistant',
    agents: {
      assistant: { name: 'Trợ lý tổng hợp', version: '1.0.0', tier: 'free',
                   installedAt: new Date().toISOString(), enabled: true }
    }
  });
}
```

- [ ] **Step 3: Wire into seedWorkspace() in workspace.js**

Add after existing seed logic: `const { migrateToProfiles } = require('./agent-profiles'); migrateToProfiles(workspace);`

- [ ] **Step 4: Run tests — PASS**
- [ ] **Step 5: Manual smoke test: `node -e "require('./electron/lib/workspace').seedWorkspace()"` — verify `profiles/` created**
- [ ] **Step 6: Commit**

```bash
git add electron/lib/agent-profiles.js electron/lib/workspace.js electron/tests/
git commit -m "feat: migrate existing AGENTS.md to profile system on boot"
```

---

### Task 5: Wire Phase 1 into boot sequence

**Files:**
- Modify: `electron/main.js` (boot sequence)
- Modify: `electron/lib/dashboard-ipc.js` (profile IPC handlers)

- [ ] **Step 1: Add profile IPC handlers in dashboard-ipc.js**

```javascript
// Append to dashboard-ipc.js
const { listProfiles, enableProfile, disableProfile,
        uninstallProfile } = require('./agent-profiles');
const { invalidateCache } = require('./profile-loader');
const { refreshClassificationPrompt } = require('./agent-router');

ipcMain.handle('list-profiles', async () => {
  return listProfiles(getWorkspace());
});

ipcMain.handle('enable-profile', async (event, agentId) => {
  const ok = enableProfile(getWorkspace(), agentId);
  if (ok) { invalidateCache(); refreshClassificationPrompt(getWorkspace()); }
  return ok;
});

ipcMain.handle('disable-profile', async (event, agentId) => {
  const ok = disableProfile(getWorkspace(), agentId);
  if (ok) { invalidateCache(); refreshClassificationPrompt(getWorkspace()); }
  return ok;
});

ipcMain.handle('uninstall-profile', async (event, agentId) => {
  const ok = uninstallProfile(getWorkspace(), agentId);
  if (ok) { invalidateCache(); refreshClassificationPrompt(getWorkspace()); }
  return ok;
});
```

- [ ] **Step 2: Initialize profile system in main.js boot**

In `app.whenReady()`, after `seedWorkspace()`:
```javascript
const { migrateIndex } = require('./lib/agent-profiles');
const { refreshClassificationPrompt } = require('./lib/agent-router');
migrateIndex(getWorkspace());
refreshClassificationPrompt(getWorkspace());
```

- [ ] **Step 3: Add preload.js bridges for profile IPC**

In `electron/preload.js`, add to `contextBridge.exposeInMainWorld('claw', { ... })`:
```javascript
listProfiles: () => ipcRenderer.invoke('list-profiles'),
enableProfile: (id) => ipcRenderer.invoke('enable-profile', id),
disableProfile: (id) => ipcRenderer.invoke('disable-profile', id),
uninstallProfile: (id) => ipcRenderer.invoke('uninstall-profile', id),
```

- [ ] **Step 4: Tag cron handles with agentId for cleanup**

In `electron/lib/cron.js`, modify `startCronJobs()`:
- Add `const _cronHandles = new Map();` (exported)
- When creating a cron job: `_cronHandles.set(jobKey, { handle, agentId: agentId || 'assistant' });`
- Add `stopCronsForAgent(agentId)` function: iterate `_cronHandles`, call `.stop()` on matching, delete from map
- Wire `stopCronsForAgent` into `uninstallProfile()` in agent-profiles.js

- [ ] **Step 5: Disable AGENTS.md version stamp overwrite when profile system active**

In `electron/lib/workspace.js`, in the `seedWorkspace()` function where it checks `AGENTS_MD_VERSION_RE`:
- Add guard: `if (fs.existsSync(path.join(workspace, 'profiles', '_index.json'))) return;` — skip the version-stamp template overwrite when profiles are active. The Profile Loader now owns the workspace AGENTS.md content.

- [ ] **Step 6: Full smoke test: RUN.bat → Dashboard loads → profiles/_index.json exists → `window.claw.listProfiles()` in DevTools returns 1 agent**
- [ ] **Step 7: Commit**

```bash
git add electron/main.js electron/lib/dashboard-ipc.js electron/preload.js electron/lib/cron.js electron/lib/workspace.js
git commit -m "feat: wire agent profiles into boot + dashboard IPC + cron tagging"
```

---

## Chunk 2: Plugin Interface (Phase 2)

### Task 6: Plugin Manager — hook system core (runs inside gateway process)

**Files:**
- Create: `electron/packages/modoro-zalo/src/plugin-manager.ts` (TypeScript, runs in gateway)
- Create: `electron/lib/plugin-manager.js` (plain JS re-export for Electron-side testing)
- Create: `electron/tests/plugin-manager.test.js`

**Note:** The PluginManager class lives in the modoro-zalo fork so it runs in the gateway process alongside inbound.ts. A plain JS copy/re-export in `electron/lib/` enables unit testing from the Electron side.

- [ ] **Step 1: Write failing tests**

Tests:
- `register()` adds handler, `execute()` calls it
- Priority ordering: lower number runs first
- `action: 'drop'` stops chain, returns `{ dropped: true, by: pluginId }`
- `action: 'replace'` mutates context.message
- Handler throwing error does NOT break chain (continues + logs)
- `unregisterAll(pluginId)` removes all hooks for that plugin
- Multiple plugins at same hook point: all called in order

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement plugin-manager.js**

Use the exact `PluginManager` class from the spec (Section 6.1), plus:
```javascript
function loadPluginsFromDir(pluginManager, workspace) {
  const pluginsDir = path.join(workspace, 'plugins');
  if (!fs.existsSync(pluginsDir)) return;
  for (const dir of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const indexPath = path.join(pluginsDir, dir.name, 'index.js');
    if (!fs.existsSync(indexPath)) continue;
    try {
      const plugin = require(indexPath);
      plugin.activate(pluginManager, workspace);
      console.log(`[plugin] activated: ${dir.name}`);
    } catch (err) {
      console.error(`[plugin] failed to activate ${dir.name}:`, err.message);
    }
  }
}
```

- [ ] **Step 4: Run tests — PASS**
- [ ] **Step 5: Commit**

```bash
git add electron/lib/plugin-manager.js electron/tests/plugin-manager.test.js
git commit -m "feat: add plugin manager — hook system with priority + error isolation"
```

---

### Task 7: Convert first 3 patches to plugins (blocklist, system-msg, dedup)

**Plugin deployment**: Plugin source lives in `electron/plugins/` (shipped with app). On boot, `seedWorkspace()` copies `electron/plugins/*` to `{workspace}/plugins/` (where `loadPluginsFromDir` reads them). This matches the existing pattern for workspace templates.

**Files:**
- Create: `electron/plugins/zalo-blocklist/manifest.json` + `index.js`
- Create: `electron/plugins/zalo-system-msg/manifest.json` + `index.js`
- Create: `electron/plugins/zalo-sender-dedup/manifest.json` + `index.js`
- Modify: `electron/lib/workspace.js` — add plugin copy step in `seedWorkspace()`

- [ ] **Step 1: Add plugin copy to seedWorkspace()**

In workspace.js, after profile migration: copy `electron/plugins/*` → `{workspace}/plugins/` (skip if already exists + same version in manifest).

- [ ] **Step 2: Extract blocklist logic from existing `ensureZaloBlocklistFix()` into plugin format**

```javascript
// electron/plugins/zalo-blocklist/index.js
const fs = require('fs');
const path = require('path');

module.exports = {
  activate(pm, workspace) {
    pm.register('zalo-blocklist', 'before-filter', async (ctx) => {
      if (ctx.message.channel !== 'zalo') return;
      const blocklistPath = path.join(workspace, 'zalo-blocklist.json');
      if (!fs.existsSync(blocklistPath)) return;
      try {
        const list = JSON.parse(fs.readFileSync(blocklistPath, 'utf-8'));
        if (Array.isArray(list) && list.includes(ctx.message.senderId)) {
          return { action: 'drop', reason: 'blocklisted' };
        }
      } catch {}
    }, 10);
  },
  deactivate(pm) { pm.unregisterAll('zalo-blocklist'); }
};
```

- [ ] **Step 2: Extract system-msg filter patterns into plugin**
- [ ] **Step 3: Extract sender-dedup logic into plugin**
- [ ] **Step 4: Write integration test: load all 3 plugins, send mock messages, verify correct drop/pass behavior**
- [ ] **Step 5: Commit**

```bash
git add electron/plugins/
git commit -m "feat: convert blocklist + system-msg + dedup patches to plugins"
```

---

### Task 8: Add hook dispatch calls to modoro-zalo fork

**Files:**
- Modify: `electron/packages/modoro-zalo/src/inbound.ts`
- Modify: `electron/packages/modoro-zalo/src/send.ts`

- [ ] **Step 1: Add PluginManager import + instantiation at module scope in inbound.ts**

The PluginManager runs INSIDE the gateway process (same V8 isolate as inbound.ts). No cross-process globals needed.

```typescript
// At top of inbound.ts (after existing imports)
import { PluginManager, loadPluginsFromDir } from './plugin-manager';
const pluginManager = new PluginManager();
const __workspace = process.env['9BIZ_WORKSPACE'] || '';
if (__workspace) loadPluginsFromDir(pluginManager, __workspace);
```

- [ ] **Step 2: Add `before-filter` hook call in inbound.ts message handler**

Insert AFTER raw body extraction, BEFORE first patch block:
```typescript
const hookResult = await pluginManager.execute('before-filter', {
  message: { senderId: message.senderId, rawBody, isGroup: message.isGroup,
             threadId: targetThreadId, channel: 'zalo' },
  workspace: __workspace,
  metadata: {}
});
if (hookResult.dropped) {
  runtime.log?.(`[hook] dropped by ${hookResult.by}`);
  return;
}
```

- [ ] **Step 3: Add `before-dispatch`, `on-route`, `after-reply`, `before-send`, `on-send-error` hooks at appropriate locations**

`on-send-error` goes in `send.ts` inside the catch block — wraps existing error handling.

- [ ] **Step 4: Create `router-plugin.ts` in modoro-zalo fork**

The router classification runs as a plugin on the `on-route` hook, inside the gateway process. It calls 9Router via HTTP (localhost:20128) for LLM classification and writes composite AGENTS.md via profile-loader logic.

- [ ] **Step 5: Smoke test: RUN.bat → send Zalo message → verify hooks fire (check gateway logs for `[plugin] activated`)**
- [ ] **Step 5: Remove the 3 corresponding `ensureZalo*Fix()` calls from main.js (since plugins now handle it)**
- [ ] **Step 6: Regression test: send blocked user message → still dropped. Send system msg in group → still dropped. Send duplicate → still dropped.**
- [ ] **Step 7: Commit**

```bash
git add electron/packages/modoro-zalo/src/inbound.ts electron/packages/modoro-zalo/src/send.ts electron/main.js
git commit -m "feat: add hook dispatch to modoro-zalo fork, migrate first 3 patches"
```

---

### Task 9: Convert remaining inbound.ts patches (14 patches)

**Full patch inventory** (inbound.ts, 22 total — 3 done in Task 7):

| # | Patch | Lines | Complexity | Plugin Hook |
|---|---|---|---|---|
| 1-3 | BLOCKLIST, SYSTEM-MSG, SENDER-DEDUP | — | Done in Task 7 | before-filter |
| 4 | COMMAND-BLOCK v4 | ~60 | Medium | before-filter |
| 5 | ALLOWLIST | ~40 | Low | before-filter |
| 6 | MEDIA-TYPE-FILTER | ~30 | Low | before-filter |
| 7 | RATE-LIMIT | ~25 | Low | before-filter |
| 8 | MSG-LENGTH-GATE | ~20 | Low | before-filter |
| 9 | BOT-LOOP-BREAKER | ~45 | Medium | before-filter |
| 10 | VISION-SAFETY | ~35 | Low | before-filter |
| 11 | PAUSE | ~30 | Low | before-dispatch |
| 12 | ZALO-MODE | ~40 | Medium | before-dispatch |
| 13 | INBOUND-AUDIT | ~25 | Low | after-reply |
| 14 | GS-HELPER | ~50 | Medium | on-route |
| 15 | US-HELPER | ~50 | Medium | on-route |
| 16 | OWNER-TAKEOVER | ~35 | Medium | on-route |
| 17 | SKILL-NEUTRALIZE | ~30 | Low | before-dispatch |
| 18 | FB-NEUTRALIZE | ~25 | Low | before-dispatch |
| 19 | GCAL-NEUTRALIZE | ~25 | Low | before-dispatch |
| 20 | GROUP-SETTINGS v8 | ~91 | **High** | before-dispatch |
| 21 | RAG v9 | ~137 | **High** | on-route |
| 22 | GENDER-HINT | ~30 | Low | before-dispatch |
| 23 | USER-SKILLS-INJECT v2 | ~152 | **High** | on-route |
| 24 | FRIEND-CHECK V5 | ~185 | **High** | before-filter |
| 25 | DELIVER-COALESCE v4 | ~120 | **High** | before-send |

**send.ts patches** (5 total):

| # | Patch | Plugin Hook |
|---|---|---|
| 26 | OUTPUT-FILTER v6 | before-send |
| 27 | ESCALATION-DETECT v2 | after-reply |
| 28-30 | GROUP-DETECT (x3: text, media, typing) | before-send |

- [ ] **Step 1: Batch LOW complexity patches (4-10, 17-19, 22) — create 1 plugin per patch**
- [ ] **Step 2: Convert COMMAND-BLOCK v4 → plugin (medium, ~60 lines)**
- [ ] **Step 3: Convert BOT-LOOP-BREAKER → plugin (medium, ~45 lines)**
- [ ] **Step 4: Convert FRIEND-CHECK V5 → plugin (high, ~185 lines — has async ZCA cache reads)**
- [ ] **Step 5: Convert GROUP-SETTINGS v8 → plugin (high, ~91 lines — reads groups.json config)**
- [ ] **Step 6: Convert RAG v9 → plugin (high, ~137 lines — knowledge injection pipeline)**
- [ ] **Step 7: Convert USER-SKILLS-INJECT v2 → plugin (high, ~152 lines — skill matching + injection)**
- [ ] **Step 8: Convert DELIVER-COALESCE v4 → plugin (high, ~120 lines — timer-based message buffering)**
- [ ] **Step 9: Convert send.ts patches: OUTPUT-FILTER v6, ESCALATION-DETECT v2, GROUP-DETECT (x3)**
- [ ] **Step 10: Remove ALL `ensureZalo*Fix()` runtime injection functions from main.js + zalo-plugin.js**
- [ ] **Step 11: Full regression test per patch: verify each behavior preserved. Key checks:**
  - Blocked sender → dropped
  - Group system message → dropped
  - Duplicate within 3s → dropped
  - Command pattern from Zalo → rewritten
  - Bot loop detected → broken
  - Output filter catches sensitive text → replaced
  - Escalation detected → forwarded to CEO
  - Deliver coalesce → multiple tokens merged into 1 message
- [ ] **Step 12: Commit**

```bash
git add electron/plugins/ electron/main.js electron/lib/zalo-plugin.js electron/packages/modoro-zalo/
git commit -m "feat: migrate all 28 inbound+send patches to plugin system"
```

---

## Chunk 3: Channel Abstraction + Connector Gateway (Phase 3)

### Task 10: Channel Interface + Registry

**Files:**
- Create: `electron/lib/channel-interface.js`
- Create: `electron/lib/channel-registry.js`
- Create: `electron/tests/channel-registry.test.js`

- [ ] **Step 1: Write failing tests for channel registry**

Tests:
- `register(channel)` adds channel, `get(id)` retrieves it
- `list()` returns all registered channels
- `probeAll()` calls `probe()` on each channel in parallel
- `sendVia(id, to, text)` delegates to correct channel's `send()`
- Unregistered channel ID in `sendVia` throws

- [ ] **Step 2: Implement channel-interface.js (base class from spec Section 7.1)**
- [ ] **Step 3: Implement channel-registry.js (from spec Section 7.2)**
- [ ] **Step 4: Run tests — PASS**
- [ ] **Step 5: Commit**

```bash
git add electron/lib/channel-interface.js electron/lib/channel-registry.js electron/tests/channel-registry.test.js
git commit -m "feat: add Channel base class + ChannelRegistry"
```

---

### Task 11: Refactor existing channels into Channel classes

**Files:**
- Create: `electron/lib/channels/telegram.js`
- Create: `electron/lib/channels/zalo-personal.js`
- Modify: `electron/lib/channels.js` (extract logic, delegate to classes)

- [ ] **Step 1: Create telegram.js — wraps existing `probeTelegramReady()` + `sendTelegram()` from channels.js**
- [ ] **Step 2: Create zalo-personal.js — wraps existing `probeZaloReady()` + `sendZalo()` from channels.js**
- [ ] **Step 3: Register both in channel-registry during boot (main.js)**
- [ ] **Step 4: Update `startChannelStatusBroadcast()` to use `channelRegistry.probeAll()`**
- [ ] **Step 5: Update `sendCeoAlert()` to use `channelRegistry.sendVia('telegram', ...)`**
- [ ] **Step 6: Smoke test: Dashboard shows channel status dots (green/red) as before**
- [ ] **Step 7: Commit**

```bash
git add electron/lib/channels/ electron/lib/channels.js electron/main.js
git commit -m "refactor: extract Telegram + Zalo into Channel classes"
```

---

### Task 12: Connector routes on cron-api server

**Files:**
- Create: `electron/lib/connector-routes.js`
- Create: `electron/connectors/google-sheets/index.js`
- Modify: `electron/lib/cron-api.js` (mount connector routes)

- [ ] **Step 1: Create connector-routes.js — route parser for `/api/connector/<id>/<action>`**

```javascript
// electron/lib/connector-routes.js
'use strict';
const fs = require('fs');
const path = require('path');

const _connectors = {};

function loadConnectors(connectorsDir) {
  if (!fs.existsSync(connectorsDir)) return;
  for (const dir of fs.readdirSync(connectorsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const indexPath = path.join(connectorsDir, dir.name, 'index.js');
    if (!fs.existsSync(indexPath)) continue;
    _connectors[dir.name] = require(indexPath);
  }
}

async function handleConnectorRequest(req, res, { workspace, token }) {
  // Parse: /api/connector/<connector-id>/<action>
  const match = req.url.match(/^\/api\/connector\/([^/]+)\/([^/?]+)/);
  if (!match) return false;

  const [, connectorId, action] = match;
  const connector = _connectors[connectorId];
  if (!connector) { res.writeHead(404); res.end(JSON.stringify({ error: 'connector_not_found' })); return true; }
  if (!connector.actions[action]) { res.writeHead(404); res.end(JSON.stringify({ error: 'action_not_found' })); return true; }

  // Read auth
  const authPath = path.join(workspace, 'connectors', connectorId, 'auth.json');
  let auth = {};
  if (fs.existsSync(authPath)) auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));

  // Parse body
  let body = '';
  for await (const chunk of req) body += chunk;
  const params = body ? JSON.parse(body) : {};

  try {
    const result = await connector.actions[action](params, auth);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
  return true;
}

module.exports = { loadConnectors, handleConnectorRequest };
```

- [ ] **Step 2: Mount in cron-api.js — add early `if (await handleConnectorRequest(req, res, opts)) return;` in request handler**
- [ ] **Step 3: Create Google Sheets connector stub (actions: read-range, write-range, list-sheets)**
- [ ] **Step 4: Add OAuth callback route stub**

In `connector-routes.js`, handle `GET /oauth/callback/<connector-id>?code=...`:
- Exchange `code` for tokens via connector's `oauthConfig.tokenUrl`
- Store tokens in `{workspace}/connectors/<connector-id>/auth.json`
- Return HTML page "Connected successfully — you can close this window"

- [ ] **Step 5: Test: `curl -X POST http://127.0.0.1:20200/api/connector/google-sheets/list-sheets -H "Authorization: Bearer <token>"` returns response**
- [ ] **Step 6: Commit**

```bash
git add electron/lib/connector-routes.js electron/connectors/ electron/lib/cron-api.js
git commit -m "feat: add connector routes on cron-api server + Google Sheets stub"
```

---

## Chunk 4: Distribution + Store (Phase 4)

### Task 13: Package installer (.clawpkg)

**Files:**
- Create: `electron/lib/package-installer.js`
- Create: `electron/tests/package-installer.test.js`

- [ ] **Step 1: Write failing tests**

Tests:
- `verifyPackage(zipPath)` validates Ed25519 signature + SHA-256 checksum
- `installPackage(workspace, zipPath)` extracts to temp dir, validates manifest, moves to target dir
- Failed validation cleans up temp dir
- Type detection: manifest.type='agent' → profiles/, 'plugin' → plugins/, 'connector' → connectors/

- [ ] **Step 2: Implement package-installer.js**

Uses Node.js built-in `crypto.verify()` with Ed25519 (same pattern as `electron/lib/license.js`). Uses `adm-zip` (add to `electron/package.json` devDependencies: `npm install adm-zip`) for ZIP extraction.

- [ ] **Step 2b: Add adm-zip dependency**
Run: `cd electron && npm install adm-zip`

- [ ] **Step 3: Run tests — PASS**
- [ ] **Step 4: Commit**

```bash
git add electron/lib/package-installer.js electron/tests/package-installer.test.js
git commit -m "feat: add .clawpkg installer with signature verification"
```

---

### Task 14: Supabase schema change — features column

**Files:**
- Create: `supabase/migrations/002_features_column.sql`

- [ ] **Step 1: Write migration**

**Prerequisite**: The `activations` table must already exist in Supabase (created via Supabase dashboard or a prior migration not in this repo). If it doesn't exist, create it first with at minimum: `id uuid PRIMARY KEY, key_hash text UNIQUE, machine_id text, email text, revoked boolean DEFAULT false, valid_until timestamptz`.

```sql
-- Add per-activation feature entitlements
ALTER TABLE activations ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '[]'::jsonb;

-- Update validate_premium_session to return per-activation features
CREATE OR REPLACE FUNCTION validate_premium_session(
  p_key_hash text, p_machine_id text, p_app_version text, p_build_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_activation record; v_key record; v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM session_validations
    WHERE key_hash = p_key_hash AND created_at > now() - interval '1 day';
  IF v_count >= 10 THEN RETURN jsonb_build_object('error', 'rate_limited'); END IF;

  SELECT * INTO v_activation FROM activations WHERE key_hash = p_key_hash LIMIT 1;
  IF v_activation IS NULL THEN RETURN jsonb_build_object('error', 'invalid_key'); END IF;
  IF v_activation.revoked THEN RETURN jsonb_build_object('error', 'revoked'); END IF;
  IF v_activation.machine_id IS NOT NULL AND v_activation.machine_id != p_machine_id THEN
    RETURN jsonb_build_object('error', 'machine_mismatch'); END IF;
  IF v_activation.valid_until IS NOT NULL AND v_activation.valid_until < now() THEN
    RETURN jsonb_build_object('error', 'expired'); END IF;

  IF p_build_id IS NOT NULL THEN SELECT * INTO v_key FROM build_keys WHERE build_id = p_build_id; END IF;
  IF v_key IS NULL THEN SELECT * INTO v_key FROM build_keys WHERE app_version = p_app_version ORDER BY created_at DESC LIMIT 1; END IF;
  IF v_key IS NULL THEN RETURN jsonb_build_object('error', 'unsupported_version'); END IF;

  INSERT INTO session_validations (key_hash, machine_id, app_version) VALUES (p_key_hash, p_machine_id, p_app_version);

  RETURN jsonb_build_object(
    'decrypt_key', v_key.encrypt_key,
    'features', COALESCE(v_activation.features, '[]'::jsonb),
    'github_token', current_setting('app.github_releases_token', true)
  );
END;
$$;
```

- [ ] **Step 2: Test locally with Supabase CLI: `supabase db push`**
- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_features_column.sql
git commit -m "feat: add features column to activations + update validate_premium_session"
```

---

### Task 15: Dashboard Store tab

**Files:**
- Modify: `electron/ui/dashboard.html` (add Store tab)
- Modify: `electron/lib/dashboard-ipc.js` (add store IPC handlers)
- Create: `electron/data/store-catalog.json` (static package catalog)

- [ ] **Step 1: Create static catalog**

```json
{
  "version": 1,
  "packages": [
    {
      "id": "agent-sales",
      "type": "agent",
      "name": "Agent Bán Hàng",
      "description": "Soạn báo giá, kịch bản bán hàng, follow-up tự động",
      "tier": "basic",
      "featureFlag": "agent-sales",
      "icon": "sales.png",
      "version": "1.0.0"
    }
  ]
}
```

- [ ] **Step 2: Add IPC handlers: `get-store-catalog`, `install-store-package`, `uninstall-store-package`**
- [ ] **Step 3: Add preload.js bridges for store IPC**

```javascript
getStoreCatalog: () => ipcRenderer.invoke('get-store-catalog'),
installStorePackage: (id) => ipcRenderer.invoke('install-store-package', id),
uninstallStorePackage: (id) => ipcRenderer.invoke('uninstall-store-package', id),
```

- [ ] **Step 4: Add Dashboard HTML: Store tab ("Cửa hàng") with grid layout, install/uninstall buttons**
- [ ] **Step 5: Convert sidebar channel entries to dynamic rendering from channelRegistry.list() (spec Section 7.5)**
- [ ] **Step 6: Smoke test: Dashboard → Store tab → shows catalog → Install button works. Sidebar shows channels dynamically.**
- [ ] **Step 7: Commit**

```bash
git add electron/ui/dashboard.html electron/lib/dashboard-ipc.js electron/data/store-catalog.json
git commit -m "feat: add Dashboard store tab with static catalog"
```

---

## Chunk 5: Integration + Smoke Test

### Task 16: End-to-end integration test

- [ ] **Step 1: Install a second agent profile (sales) alongside the default assistant**
- [ ] **Step 2: Send a Zalo message "tôi muốn báo giá" → verify router classifies to sales agent**
- [ ] **Step 3: Send a Zalo message "xin chào" → verify router classifies to default assistant**
- [ ] **Step 4: Verify thread binding: subsequent messages in same thread go to same agent without re-classification**
- [ ] **Step 5: Verify plugin hooks fire: blocked sender → dropped, system msg → dropped**
- [ ] **Step 6: Verify channel probes work via Dashboard**
- [ ] **Step 7: Verify connector route responds: `curl localhost:20200/api/connector/google-sheets/list-sheets`**
- [ ] **Step 8: Verify migration: delete profiles/ → restart → profiles/ recreated with assistant profile**
- [ ] **Step 9: Performance benchmarks**

Add `console.time`/`console.timeEnd` around each `pluginManager.execute()` call in inbound.ts/send.ts. Verify:
- Hook pipeline total per hook point: <50ms with 9+ plugins
- Router LLM classification (9Router call): <1000ms p95
- Profile Loader composite write: <20ms
- Channel probe: <6s per channel

- [ ] **Step 10: Commit integration test results**

```bash
git add electron/tests/ electron/lib/ electron/packages/
git commit -m "test: end-to-end multi-agent platform integration verified"
```
