# Brain Tab — Knowledge Graph Design Spec

**Date:** 2026-05-18
**Status:** Draft (rev 3 — post-review round 2)
**Scope:** New Dashboard tab — interactive knowledge graph + Obsidian vault compatibility

---

## Goal

Give CEOs a visual "second brain" showing everything the bot knows — customers, groups, products, learnings — and how they connect. Dark force-directed graph (Gephi/Obsidian aesthetic). Data stored as Obsidian-compatible markdown with `[[wikilinks]]` so CEOs can also browse in Obsidian app.

## Audience

CEO-first (clean, Vietnamese, no jargon) with drill-down for power users.

## Non-goals

- Workflow/cron visualization (separate tab, separate spec)
- Real-time streaming updates (graph refreshes every 30 min, manual refresh available)
- Manual node/edge editing (all connections auto-generated)

---

## Data Model

### Nodes (~2500-3000 for typical CEO)

| Type | Source file | Color | Typical count | Size rule |
|------|-----------|-------|--------------|-----------|
| Customer | `memory/zalo-users/*.md` | Yellow `#eab308` | ~2000 | `msgCount` from frontmatter |
| Group | `memory/zalo-groups/*.md` | Blue `#818cf8` | ~100-200 | `memberCount` from frontmatter |
| Product/Doc | `knowledge/*/files/*.md` | Red `#f87171` | ~5-50 | `word_count` from SQLite |
| Learning | `.learnings/LEARNINGS.md` entries | Gray `#94a3b8` | ~10-50 | priority (high=larger) |
| Skill | `user-skills/_registry.json` | Purple `#a78bfa` | ~10-30 | fixed size (no invocation metric exists) |

### Edges (auto-generated)

| From → To | Detection method | Notes |
|-----------|-----------------|-------|
| Customer → Group | openzca `groups.json` cache (`memVerList` contains member IDs with `_0` suffix — strip via `id.split('_')[0]` to match user file IDs) | Primary source. `groups[]` in user frontmatter is unpopulated — do NOT use. |
| Customer → Product | `audit.jsonl` events where `event=rag_search` + session maps to customer (v1: skip if no senderId in audit; backfill when gateway adds senderId to RAG audit) | v1 may have 0 of these edges on existing installs. |
| Product → Learning | Learning text fuzzy-match against product/doc filenames | Simple substring match on learning body vs knowledge filenames. |
| Customer → Escalation | `audit.jsonl` entries with `event=escalation_forwarded` (persisted, unlike ephemeral queue) | Queue file is truncated after processing — use audit log instead. |

**Dropped from v1:**
- Customer → Customer (shared group membership): O(n^2) explosion (200 members = 19,900 edges per group). Revisit in v2 with a cap or sampling strategy.
- Group → Skill (`appliesTo` matching): `appliesTo` values don't map to group IDs. Revisit when skill invocation telemetry exists.

### Edge weight

Derived from interaction frequency where available. Default weight=1 for membership edges.

---

## Architecture

### Layer 1: Graph Builder (`electron/lib/brain-graph.js`)

New module. Runs on boot + every 30 minutes (non-blocking background task).

**Input sources:**
- `memory/zalo-users/*.md` — parse YAML frontmatter only (name, msgCount, gender, tags)
- `memory/zalo-groups/*.md` — parse YAML frontmatter (name, lastActivity, memberCount)
- `~/.openzca/profiles/default/cache/groups.json` — `memVerList` arrays for Customer→Group edges
- `knowledge/*/files/*.md` — list from `documents` table in SQLite
- `.learnings/LEARNINGS.md` — parse `### [date] ID: L-NNN` entries
- `user-skills/_registry.json` — parse skills array
- `logs/audit.jsonl` — tail last 64KB, scan for `escalation_forwarded` events

**Output:**
- `brain-graph.json` written to workspace (compact JSON, no pretty-print):
```json
{
  "version": 1,
  "generatedAt": "2026-05-18T12:00:00Z",
  "stats": { "nodes": 2583, "edges": 4721 },
  "nodes": [
    { "id": "user:1234567890", "type": "customer", "label": "Huy Bui", "size": 45, "x": 123.4, "y": 567.8, "meta": { "msgCount": 45, "gender": "M", "lastSeen": "2026-05-18" } }
  ],
  "edges": [
    { "source": "user:1234567890", "target": "group:5678", "weight": 1, "type": "membership" }
  ]
}
```

**Layout pre-computation:** ForceAtlas2 runs in a **child process** (`child_process.fork()`) to avoid blocking Electron main process for 3-5 seconds. The child receives the graph JSON, runs ForceAtlas2 synchronously, returns node positions, then exits. Node `x,y` coordinates are included in the output JSON. Renderer displays pre-positioned nodes immediately (<100ms).

The child script (`electron/lib/brain-layout-worker.js`) is a standalone Node script:
```
Input: graph JSON via IPC message
Process: graphology + ForceAtlas2 assign()
Output: { nodePositions: { [id]: {x, y} } } via IPC message
```

Parameters: `iterations: 200, barnesHutOptimize: true, scalingRatio: 2, gravity: 1`. For >2000 nodes, limit to `iterations: 100`.

**Performance target:** Build + layout for 2000 users + 200 groups in <5 seconds. Compact JSON output: ~300-600KB for 3000 nodes (no pretty-print, minimal meta).

### Layer 2: Wikilink Injector (separate from graph builder, runs after)

**Runs:** After graph build completes, as a separate async pass. NOT concurrent with graph build.

**Locking:** Uses the existing `withMemoryFileLock()` mutex (from `conversation.js`) for each file write. This prevents races with `appendPerCustomerSummaries()` and other memory file writers.

**Injection format:** Uses YAML frontmatter field (not HTML comments in body — avoids confusing the LLM agent):
```yaml
---
name: "Huy Bui"
zaloName: "Huy Bui"
lastSeen: "2026-05-18"
msgCount: 45
links:
  - "[[Nhóm: Kinh doanh]]"
  - "[[Tài liệu: 9BizClaw KB]]"
---
```
The `links` array in frontmatter is overwritten on each run (idempotent). Body content untouched.

**Rules:**
- Customer file → `links` includes `[[Nhóm: <name>]]` for each group from `groups.json` membership
- Knowledge file → `links` includes `[[Khách: <name>]]` for top-10 customers who queried it (when senderId becomes available in RAG audit)
- Learning entry → `links` in a separate `_learning-links.md` file (LEARNINGS.md is a single file, not per-entry — don't mutate it)

**Obsidian vault config:**
- Vault root = workspace path (from `getWorkspace()` — typically `%APPDATA%/9bizclaw/` on customer installs)
- Write `.obsidian/graph.json` ONLY if `.obsidian/` directory doesn't already exist (don't overwrite user's existing Obsidian config)
- If `.obsidian/` doesn't exist, create it with just `graph.json` color groups

### Layer 3: IPC Bridge

Three handlers in `electron/lib/dashboard-ipc.js`:

| Handler | Returns | Performance |
|---------|---------|-------------|
| `get-brain-graph` | Pre-built `brain-graph.json` contents | <10ms (file read) |
| `get-brain-node-detail(id)` | Full `.md` file content for side panel | <5ms (single file read) |
| `rebuild-brain-graph` | Triggers async rebuild, returns `{ started: true }`. Sends `brain-graph-rebuilt` event to renderer when done. In-flight guard prevents concurrent rebuilds. | <1ms (fire-and-forget) |

Preload bridges in `preload.js`:
```javascript
getBrainGraph: () => ipcRenderer.invoke('get-brain-graph'),
getBrainNodeDetail: (id) => ipcRenderer.invoke('get-brain-node-detail', id),
rebuildBrainGraph: () => ipcRenderer.invoke('rebuild-brain-graph'),
```

### Layer 4: Frontend Renderer (in `dashboard.html`)

**Dependencies:**

**CRITICAL:** `app.disableHardwareAcceleration()` is called on boot (prevents GPU driver crashes on some machines). This means WebGL is unavailable → Sigma.js (WebGL-only) cannot be used.

**Solution: Canvas 2D custom renderer.** With pre-computed node positions (x,y from graph builder), the renderer only needs to draw circles + lines on a `<canvas>`. No physics, no WebGL. This is ~200 lines of vanilla Canvas 2D code — no external graph rendering library needed in the renderer.

Graphology is still used in **Node main process** (graph builder) for data model + ForceAtlas2 layout. The renderer receives flat JSON and draws it directly.

```html
<!-- No graph library script tags needed in renderer -->
<!-- Canvas 2D rendering is ~200 lines in brain.js -->
```

**Added to `electron/package.json`:**
- `graphology` — graph data structure (used in Node only, graph builder)
- `graphology-layout-forceatlas2` — layout (used in Node only, graph builder)

**NOT added:** `sigma` — not needed (Canvas 2D renderer is custom, no WebGL dependency)

**New tab in rail:** "Brain" with brain/network icon.

**Page structure:**
```
┌─────────────────────────────────────────────────────┐
│ [Brain]  [Khách hàng 458] [Nhóm 118] ...  [🔍] [⟳] │  ← filter bar + refresh
├───────────────────────────────────┬──────────────────┤
│                                   │  Node detail     │
│     Sigma.js WebGL canvas         │  side panel      │
│     (pre-positioned nodes)        │  (280px)         │
│                                   │                  │
│  [592 nodes · 1847 edges]   [+][-]│  [Mở trong…]     │
└───────────────────────────────────┴──────────────────┘
```

**Filter bar:**
- Color-coded chips per node type with count. Click to toggle visibility.
- Search input: fuzzy match on node label. Matching nodes pulse, camera zooms to fit.
- Refresh button (⟳): calls `rebuildBrainGraph()`, shows spinner. Listens for `brain-graph-rebuilt` event → reloads graph data. Debounced (ignore rapid clicks via in-flight guard).

**Graph canvas:**
- Background: `#1a1a2e` (dark)
- Nodes arrive pre-positioned (x,y from JSON) — instant render, no layout computation
- Node hover: glow effect + label tooltip
- Node click: highlight connected edges + open side panel
- Edge rendering: thin (`0.5px`), gray (`#666`), opacity scaled by weight
- Zoom: mouse wheel + pinch. Pan: click-drag background.

**Side panel (280px, right):**
- Slides in on node click, hidden by default
- Header: colored dot + node label + type/size metadata
- "Liên kết" section: chips for connected nodes (click → navigate to that node in graph)
- "Nội dung" section: markdown preview of the `.md` file (truncated to 500 chars, "xem thêm" expands)
- Footer: action button ("Mở trong Knowledge tab" / "Mở trong Zalo tab" depending on type)

**JS extraction:** Brain tab JS (~500-800 lines) goes in a separate file `electron/ui/brain.js`, loaded via `<script src="brain.js"></script>`. Keeps `dashboard.html` from growing unboundedly.

---

## File Changes

| File | Change |
|------|--------|
| `electron/lib/brain-graph.js` | **New** — graph builder + wikilink injector (orchestrator) |
| `electron/lib/brain-layout-worker.js` | **New** — child process script for ForceAtlas2 layout computation |
| `electron/ui/brain.js` | **New** — Brain tab frontend (Sigma.js init, filters, side panel, search) |
| `electron/lib/dashboard-ipc.js` | Add 3 IPC handlers (`get-brain-graph`, `get-brain-node-detail`, `rebuild-brain-graph`) |
| `electron/preload.js` | Add 3 bridges |
| `electron/ui/dashboard.html` | Add Brain tab (rail item + page + CSS). JS in separate `brain.js` file. |
| `electron/package.json` | Add `graphology`, `graphology-layout-forceatlas2` (no sigma — Canvas 2D renderer is custom) |
| `electron/main.js` | Wire graph builder into boot (after `startOpenClaw`, non-blocking) + 30-min interval |

**No changes to:** inbound.ts, send.ts, AGENTS.md, vendor-patches.js, gateway.js, any existing tab.

---

## Performance Constraints

| Metric | Target |
|--------|--------|
| Graph build + layout (2000 nodes, Node main process) | <5s |
| `get-brain-graph` IPC response | <10ms |
| Initial render (2000 pre-positioned nodes) | <500ms |
| Zoom/pan framerate | 60fps (WebGL) |
| Memory footprint | <30MB for graph data |
| `brain-graph.json` file size (compact) | <600KB for 3000 nodes |

---

## Edge Cases

- **Fresh install (0 customers):** Show empty state: "Chưa có dữ liệu. Bot sẽ tự động xây dựng bộ não khi có khách hàng."
- **Large account (5000+ customers):** `barnesHutOptimize: true` + `iterations: 100`. Limit visible nodes to top 2000 by msgCount. Filter chips show "(hiện 2000/5000)".
- **No audit.jsonl (new install):** Escalation edges empty. Graph shows only membership edges. Fills over time.
- **Obsidian already configured:** Don't overwrite `.obsidian/` if it exists. Log: "existing Obsidian config preserved."
- **Corrupted memory file:** Skip node, log warning. Don't crash graph builder.
- **openzca groups.json missing (no QR scan yet):** Customer→Group edges empty. Graph shows isolated customer nodes.
- **sigma UMD build missing (future version):** Smoke test checks for `sigma/build/sigma.min.js`. Build fails early with clear error if missing.

---

## Testing

- Smoke test: graph builder produces valid JSON for workspace with 0, 10, 2000 nodes
- Smoke test: `brain-graph.json` parseable, all node IDs unique, all edge source/target exist
- Smoke test: wikilink injection is idempotent (run twice → same output)
- Smoke test: `sigma/build/sigma.min.js` exists in node_modules
- Smoke test: `graphology/dist/graphology.umd.min.js` exists in node_modules
- UI test: Brain tab renders without console errors, Sigma canvas initializes
- Performance test: graph builder completes in <5s for 2000-node synthetic dataset

---

## Review Log

**Rev 1 → Rev 2 fixes (spec review):**
- HIGH: Customer→Group edges: changed from `groups[]` frontmatter (empty) to openzca `groups.json` cache `memVerList`
- HIGH: Customer→Product edges: deferred to v2 (RAG audit logs lack senderId). Noted as backfill target.
- HIGH: Sigma.js loading: specified UMD builds + `<script>` tag paths. Pin sigma@^2.
- HIGH: Wikilink race conditions: added `withMemoryFileLock()` mutex. Changed from HTML comments to YAML frontmatter `links` field.
- MEDIUM: Removed `gateway.js` from file changes (no boot patch sequence there). Wired in `main.js` instead.
- MEDIUM: Skill node size: changed to fixed (no trigger count metric exists)
- MEDIUM: Customer→Customer edges: dropped from v1 (O(n^2) explosion)
- MEDIUM: Group→Skill edges: dropped from v1 (`appliesTo` doesn't map to group IDs)
- MEDIUM: ForceAtlas2 in renderer: moved to Node main process. Pre-compute x,y in graph builder. Renderer is display-only.
- LOW: Added `rebuild-brain-graph` IPC for manual refresh
- LOW: Compact JSON (no pretty-print) to stay under 600KB
- LOW: Brain tab JS extracted to `brain.js` (separate file)
- LOW: `.obsidian/` only created if not already present
- LOW: Escalation edges from `audit.jsonl` (persisted) not `escalation-queue.jsonl` (ephemeral)

**Rev 2 → Rev 3 fixes (review round 2):**
- HIGH: Sigma.js WebGL blocked by `disableHardwareAcceleration()` → switched to custom Canvas 2D renderer (~200 lines, no external lib)
- HIGH: `memVerList` entries have `_0` suffix → documented `id.split('_')[0]` stripping
- MEDIUM: ForceAtlas2 blocking main process → moved to `child_process.fork()` worker
- MEDIUM: Rebuild IPC no completion notification → added `brain-graph-rebuilt` push event + in-flight guard
- LOW: Vault root path corrected to use `getWorkspace()`
- LOW: Brain tab JS packaging confirmed (same `<script>` pattern as fullcalendar)
- LOW: Rebuild button debounced via in-flight guard

**Node ID → filepath mapping** (for `get-brain-node-detail`):
| Node ID prefix | File path |
|----------------|-----------|
| `user:<zaloId>` | `memory/zalo-users/<zaloId>.md` |
| `group:<groupId>` | `memory/zalo-groups/<groupId>.md` |
| `doc:<filename>` | `knowledge/<category>/files/<filename>` (lookup category from SQLite) |
| `learning:L-NNN` | `.learnings/LEARNINGS.md` (extract section by ID regex) |
| `skill:<skillId>` | `user-skills/<skillId>/SKILL.md` or `user-skills/<skillId>.md` |
