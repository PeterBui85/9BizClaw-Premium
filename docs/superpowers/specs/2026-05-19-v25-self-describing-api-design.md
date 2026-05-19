# v2.5 Self-Describing API Architecture

## Summary

Replace the 38-file skill system (200-line markdown API tutorials) with a self-registering route system + `/api/capabilities` endpoint. Bot discovers all available actions at session start. Skills become thin JSON recipes (10-30 lines) instead of procedural markdown (100-200 lines). AGENTS.md shrinks from 27KB to ~10KB. Zero breaking change for existing crons and URLs.

## Problem

Current architecture requires 4 file edits per new capability:
1. Backend route handler in `cron-api.js` or `google-routes.js`
2. Skill markdown file (100-200 lines of API tutorial)
3. AGENTS.md capability router trigger row
4. INDEX.md skill count + entry

This doesn't scale. 9 industry skills are empty wishlists because writing detailed procedures for every action is too expensive. `so-sach-don-gian.md` and `cong-no.md` have broken write paths because the skill references wrong APIs. The 15 workflow gaps identified in the audit (order pipeline, inventory, leave management, etc.) would each require another 200-line skill file.

## Architecture

### Layer 1: Route Registry (`electron/lib/api-registry.js`)

New module. All API routes self-register with metadata at load time.

```js
// api-registry.js
const _routes = new Map();
const _recipes = [];

function registerRoute({ id, method, path, params, description, channel, tags, handler }) {
  _routes.set(id, { id, method, path, params, description, channel: channel || 'all', tags: tags || [], handler });
}

function registerRecipe({ id, name, triggers, channel, description, steps }) {
  _recipes.push({ id, name, triggers, channel: channel || 'ceo_only', description, steps });
}

function getCapabilities() {
  return {
    version: require('../package.json').version,
    actions: [..._routes.values()].map(r => ({
      id: r.id, method: r.method, path: '/api' + r.path,
      params: r.params, description: r.description,
      channel: r.channel, tags: r.tags
    })),
    recipes: [..._recipes]
  };
}

function resolveHandler(method, urlPath) {
  for (const r of _routes.values()) {
    if (r.method === method && '/api' + r.path === urlPath) return r;
  }
  return null;
}

function loadUserRecipes(userSkillsDir) {
  // Scan user-skills/*.json, parse, add to _recipes
  // Called at boot and after skill-builder creates a new recipe
}

module.exports = { registerRoute, registerRecipe, getCapabilities, resolveHandler, loadUserRecipes };
```

### Layer 2: Route Registration (in domain files)

Each domain file registers its routes at require-time. Example for Google Sheets:

```js
// google-routes.js (new pattern)
const { registerRoute } = require('./api-registry');

registerRoute({
  id: 'sheets.list',
  method: 'GET',
  path: '/google/sheets/list',
  params: { max: { type: 'number', default: 20, description: 'Số sheet tối đa' } },
  description: 'Liệt kê Google Sheets gần đây',
  channel: 'ceo_only',
  tags: ['google', 'sheets'],
  handler: async (params) => googleApi.listSheets(params.max)
});

registerRoute({
  id: 'sheets.create',
  method: 'POST',
  path: '/google/sheets/create',
  params: {
    title: { type: 'string', required: true, description: 'Tên sheet' },
    sheets: { type: 'string', description: 'Tab names, comma-separated' },
    parent: { type: 'string', description: 'Drive folder ID' }
  },
  description: 'Tạo Google Sheet mới',
  channel: 'ceo_only',
  tags: ['google', 'sheets'],
  handler: async (params) => googleApi.createSheet(params.title, params.sheets, params.parent)
});

// ... all other Google routes self-register similarly
```

**Migration strategy:** Convert routes incrementally. The existing `if (urlPath === ...)` handlers stay working. New routes use `registerRoute()`. The HTTP server tries `resolveHandler()` first, falls back to the old if-chain. Over time, all routes migrate.

### Layer 3: `/api/capabilities` Endpoint

```
GET /api/capabilities
```

Returns the full catalog. No auth required (metadata only, no data). Response:

```json
{
  "version": "2.5.0",
  "actions": [
    {
      "id": "sheets.create",
      "method": "POST",
      "path": "/api/google/sheets/create",
      "params": {
        "title": { "type": "string", "required": true, "description": "Tên sheet" }
      },
      "description": "Tạo Google Sheet mới",
      "channel": "ceo_only",
      "tags": ["google", "sheets"]
    },
    {
      "id": "memory.write",
      "method": "POST",
      "path": "/api/memory/write",
      "params": {
        "type": { "type": "string", "required": true, "enum": ["rule","pattern","preference","fact","correction","task"] },
        "content": { "type": "string", "required": true, "maxLength": 500 }
      },
      "description": "Lưu ký ức bot",
      "channel": "ceo_only",
      "tags": ["memory"]
    }
  ],
  "recipes": [
    {
      "id": "zalo-followup-sheet",
      "name": "Tổng hợp khách Zalo vào Sheet",
      "triggers": ["tổng hợp khách", "follow-up sheet", "xuất khách ra Sheet"],
      "channel": "ceo_only",
      "description": "Scan memory/zalo-users → lấy SĐT từ friend list → tạo Sheet CRM có format",
      "steps": [
        { "action": "workspace.list", "params": { "dir": "memory/zalo-users" } },
        { "action": "zalo.friends" },
        { "action": "sheets.create", "params": { "title": "Theo dõi khách Zalo {{date}}" } },
        { "action": "sheets.numberFormat", "params": { "range": "C:C", "type": "TEXT" } },
        { "action": "sheets.update", "note": "write header + data rows" },
        { "action": "sheets.freeze", "params": { "rows": 1 } },
        { "action": "sheets.format", "note": "bold white header on dark blue bg, wrap all cells" }
      ]
    }
  ]
}
```

### Layer 4: Recipes (replaces skill markdown files)

Two sources:
1. **Shipped recipes** — registered via `registerRecipe()` in domain files or loaded from `skills/recipes/*.json`
2. **CEO recipes** — created by skill-builder, stored in `user-skills/<id>.json`, loaded at boot via `loadUserRecipes()`

Recipe format:
```json
{
  "id": "morning-inventory-report",
  "name": "Báo cáo tồn kho sáng",
  "triggers": ["tồn kho sáng", "kiểm kho"],
  "channel": "ceo_only",
  "steps": [
    { "action": "workspace.read", "params": { "path": "inventory.json" } },
    { "action": "sheets.append", "note": "ghi vào Sheet tồn kho" }
  ]
}
```

The LLM reads the recipe as a GUIDE, not a rigid script. It understands the intent, calls `web_fetch` for each action using the registered route, adapts to errors, and asks CEO for input when needed. The recipe is structured enough to be reliable but flexible enough for the LLM to handle edge cases.

### Layer 5: AGENTS.md Rewrite

Current AGENTS.md (27KB) shrinks to ~10KB by replacing:
- Capability Router table (15 rows) → "Đọc GET /api/capabilities"
- 38 skill file references → removed (capabilities + recipes replace them)
- Procedural instructions → kept only for behavior rules (Zalo defense, escalation, memory)

New AGENTS.md structure:
```markdown
# AGENTS.md

## Quy tắc cốt lõi (giữ nguyên)
- Xưng em, gọi anh/chị
- Không meta-commentary
- Không multi-message spam
- ...

## Khả năng bot
Lúc bắt đầu session, đọc: GET http://127.0.0.1:20200/api/capabilities
Response chứa:
- `actions`: tất cả API calls bot có thể dùng (id, route, params, description)
- `recipes`: workflows nhiều bước (triggers, steps = chuỗi action IDs)

Khi CEO yêu cầu:
1. Match trigger trong recipes → đọc recipe → thực hiện từng step
2. Không match recipe → tự compose từ actions available
3. Không match action nào → trả lời bằng kiến thức chung

Mỗi action gọi qua web_fetch với route trong capabilities. KHÔNG hardcode URL.

## Zalo phòng thủ (giữ nguyên)
Đọc skills/operations/zalo.md — 22 trigger phòng thủ...

## Bộ nhớ bot (giữ nguyên nhưng ngắn hơn)
TỰ ĐỘNG ghi memory sau mỗi task...

## Hồ sơ khách (giữ nguyên)
...
```

### Layer 6: Skill-Builder Update

When CEO creates a new skill via Telegram:
1. Bot reads `/api/capabilities` to see all available actions
2. Bot composes a recipe (JSON with action IDs) based on CEO's description
3. Bot saves to `user-skills/<id>.json`
4. `loadUserRecipes()` is called → recipe immediately available in `/api/capabilities`
5. Next CEO request matching the trigger → bot executes the recipe

### Layer 7: Backward Compatibility

| What | Change | CEO impact |
|------|--------|-----------|
| Existing `/api/*` URLs | No change — same paths, same params | Zero |
| Old cron prompts | Still work — bot has web_fetch, URLs unchanged | Zero |
| Old `user-skills/*.md` files | Stay on disk, bot falls back to reading them if no `.json` recipe found | Zero |
| Old AGENTS.md skill references | Replaced by capabilities bootstrap, but old triggers still match via recipe triggers | Zero |
| `web_fetch` tool | Still the primary mechanism — bot calls web_fetch with routes from capabilities | Zero |

### Layer 8: New Capabilities to Add (filling the 15 gaps)

With the registry system, each gap = a few `registerRoute()` calls + a recipe:

**Phase 1 (ship with v2.5):**

| Capability | Routes | Recipe |
|-----------|--------|--------|
| Order pipeline | `order.create`, `order.list`, `order.update`, `order.status` | order-management |
| Inventory | `inventory.check`, `inventory.adjust`, `inventory.alerts` | inventory-check |
| Leave/attendance | `leave.request`, `leave.list`, `attendance.summary` | leave-management |

**Phase 2 (post-v2.5):**
- Customer loyalty/birthdays
- Delivery tracking
- Team task management
- Contract expiry tracker
- Customer broadcast
- Supplier management

**Phase 3 (future):**
- Multi-branch reporting
- Simple payroll
- Cash flow projection

### Layer 9: Data Storage for New Capabilities

New capabilities (orders, inventory, leave) need data storage. Pattern: workspace JSON files managed via the Cron API routes.

```
workspace/
  orders.json          # [{id, customer, items, total, status, date}]
  inventory.json       # [{sku, name, qty, minQty, unit}]
  leave-requests.json  # [{employee, type, from, to, status, approvedBy}]
```

Routes do CRUD on these files with proper locking (same `withWriteLock` pattern as custom-crons.json). The bot never touches files directly — always through registered routes.

## Files to Create/Modify

**Create:**
- `electron/lib/api-registry.js` — route registry + capabilities endpoint
- `skills/recipes/*.json` — shipped recipes (one per workflow)
- New route files for gap capabilities (orders, inventory, leave)

**Modify:**
- `electron/lib/cron-api.js` — HTTP server uses `resolveHandler()` fallback
- `electron/lib/google-routes.js` — migrate routes to `registerRoute()`
- `electron/lib/skill-manager.js` — skill-builder creates JSON recipes
- `AGENTS.md` — rewrite to bootstrap from capabilities
- `skills/INDEX.md` — simplified, references recipes

**Keep (backward compat):**
- All existing `skills/operations/*.md` files — stay on disk, not deleted
- All existing `/api/*` URL paths — unchanged
- `custom-crons.json` — format unchanged
- `user-skills/*.md` — fallback if no `.json` recipe

## Success Criteria

1. Adding a new API action = ONE `registerRoute()` call. Bot discovers it automatically.
2. Adding a new workflow = ONE recipe JSON file. No AGENTS.md edit needed.
3. CEO-created skills produce JSON recipes that reference action IDs, not hardcoded URLs.
4. AGENTS.md < 12KB (down from 27KB).
5. All existing crons, URLs, and user skills keep working without modification.
6. Smoke tests pass with 0 failures.
