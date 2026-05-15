# User Skills System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let CEOs create custom skills (rules, overrides, workflows) via Telegram chat or Dashboard that cooperate with shipped skills and avoid conflicts.

**Architecture:** Zero-injection model. AGENTS.md gets a small instruction (~200 chars) pointing to `user-skills/`. Bot reads registry on demand, `read_file`s relevant skills. New `skill-manager.js` handles CRUD, conflict detection, slugification. Local HTTP API on port 20200 enables Telegram creation via `web_fetch`.

**Tech Stack:** Node.js (native http server), Electron IPC, vanilla JS Dashboard, markdown skill files.

**Spec:** `docs/superpowers/specs/2026-05-14-user-skills-system-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `electron/lib/skill-manager.js` | **(new)** Registry CRUD, atomic writes (reuses `writeJsonAtomic` from util.js), conflict detection (Layer 1), shipped skill scanner, Vietnamese→ASCII slugify, chain-based lock |
| `electron/lib/cron-api.js` | Add 6 `/api/user-skills/*` routes (delegates to skill-manager) |
| `electron/lib/workspace.js` | Seed `user-skills/` dir + empty `_registry.json` + add to `backupWorkspace()` |
| `electron/lib/dashboard-ipc.js` | 7 IPC handlers INSIDE `registerAllIpcHandlers()` function (delegates to skill-manager) |
| `electron/preload.js` | 7 new bridges |
| `electron/ui/dashboard.html` | Skills tab (sidebar + page + JS) |
| `AGENTS.md` | Skill instructions + creation flow (version bump 98→99) |

---

## Chunk 1: Core — skill-manager.js + workspace seeding

### Task 1: Create skill-manager.js — registry CRUD

**Files:**
- Create: `electron/lib/skill-manager.js`

- [ ] **Step 1: Create skill-manager.js with registry read/write + chain-based lock**

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./util');

function getUserSkillsDir() {
  const { getWorkspace } = require('./workspace');
  const ws = getWorkspace();
  if (!ws) return null;
  return path.join(ws, 'user-skills');
}

function getRegistryPath() {
  const dir = getUserSkillsDir();
  return dir ? path.join(dir, '_registry.json') : null;
}

function readRegistry() {
  const p = getRegistryPath();
  if (!p) return { version: 1, skills: [] };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    // Attempt recovery from writeJsonAtomic tmp files
    const dir = path.dirname(p);
    if (fs.existsSync(dir)) {
      const tmps = fs.readdirSync(dir).filter(f => f.startsWith('_registry.json.tmp.'));
      for (const tmp of tmps.sort().reverse()) {
        try {
          const recovered = JSON.parse(fs.readFileSync(path.join(dir, tmp), 'utf-8'));
          fs.writeFileSync(p, JSON.stringify(recovered, null, 2), 'utf-8');
          console.warn('[skill-manager] recovered registry from', tmp);
          try { fs.unlinkSync(path.join(dir, tmp)); } catch {}
          return recovered;
        } catch {}
      }
    }
    console.error('[skill-manager] registry corrupt:', e.message);
    try {
      const logDir = path.join(path.dirname(dir), 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, 'skill-errors.log'),
        `${new Date().toISOString()} registry corrupt: ${e.message}\n`, 'utf-8');
    } catch {}
    return { version: 1, skills: [] };
  }
}

function writeRegistry(registry) {
  const p = getRegistryPath();
  if (!p) return;
  writeJsonAtomic(p, registry);
}

// Chain-based lock — same pattern as _withCustomCronLock in cron.js:1983
let _skillWriteChain = Promise.resolve();
async function withSkillLock(fn) {
  let release;
  const gate = new Promise(r => { release = r; });
  const prev = _skillWriteChain;
  _skillWriteChain = gate;
  await prev;
  try { return await fn(); } finally { release(); }
}
```

- [ ] **Step 2: Add slugify + namespace collision check**

Append to `skill-manager.js`:

```javascript
function slugify(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || ('skill-' + Date.now());
}

function getShippedSkillIds() {
  const { getWorkspace } = require('./workspace');
  const ws = getWorkspace();
  if (!ws) return new Set();
  const skillsDir = path.join(ws, 'skills');
  const ids = new Set();
  function scan(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '_archived') continue;
      if (entry.isDirectory()) scan(path.join(dir, entry.name), (prefix ? prefix + '/' : '') + entry.name);
      else if (entry.name.endsWith('.md')) ids.add((prefix ? prefix + '/' : '') + entry.name.replace(/\.md$/, ''));
    }
  }
  scan(skillsDir, '');
  return ids;
}

function validateNoCollision(id) {
  const shipped = getShippedSkillIds();
  if (shipped.has(id)) return `Skill id "${id}" conflicts with a shipped skill. Choose a different name.`;
  return null;
}
```

- [ ] **Step 3: Add CRUD operations**

Append to `skill-manager.js`:

```javascript
function sanitizeContent(raw) {
  return String(raw || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#+\s/gm, '')
    .slice(0, 500);
}

async function createUserSkill({ name, type, appliesTo, trigger, content }) {
  return withSkillLock(async () => {
    const registry = readRegistry();
    if (registry.skills.length >= 100) throw new Error('Too many skills (max 100). Delete some first.');

    const id = slugify(name);
    const collision = validateNoCollision(id);
    if (collision) throw new Error(collision);
    if (registry.skills.find(s => s.id === id)) throw new Error(`Skill "${id}" already exists.`);

    const dir = getUserSkillsDir();
    if (!dir) throw new Error('Workspace not available');

    const sanitized = sanitizeContent(content);
    const mdContent = `# ${String(name).replace(/^#+\s/gm, '')}\n\n## Khi nào áp dụng\n${String(trigger || '').replace(/^#+\s/gm, '')}\n\n## Nội dung\n${sanitized}\n`;
    fs.writeFileSync(path.join(dir, id + '.md'), mdContent, 'utf-8');

    const entry = {
      id,
      name: String(name),
      type: type || 'custom',
      appliesTo: Array.isArray(appliesTo) ? appliesTo : [],
      trigger: String(trigger || ''),
      summary: sanitized.slice(0, 120),
      enabled: true,
      createdAt: new Date().toISOString(),
      createdVia: 'telegram-chat',
    };
    registry.skills.push(entry);
    writeRegistry(registry);
    return entry;
  });
}

async function updateUserSkill(id, updates) {
  return withSkillLock(async () => {
    const registry = readRegistry();
    const idx = registry.skills.findIndex(s => s.id === id);
    if (idx === -1) throw new Error(`Skill "${id}" not found.`);

    const skill = registry.skills[idx];
    if (updates.name !== undefined) skill.name = String(updates.name);
    if (updates.type !== undefined) skill.type = updates.type;
    if (updates.appliesTo !== undefined) skill.appliesTo = Array.isArray(updates.appliesTo) ? updates.appliesTo : [];
    if (updates.trigger !== undefined) skill.trigger = String(updates.trigger);

    if (updates.content !== undefined) {
      const dir = getUserSkillsDir();
      const sanitized = sanitizeContent(updates.content);
      const mdContent = `# ${skill.name}\n\n## Khi nào áp dụng\n${skill.trigger}\n\n## Nội dung\n${sanitized}\n`;
      fs.writeFileSync(path.join(dir, id + '.md'), mdContent, 'utf-8');
      skill.summary = sanitized.slice(0, 120);
    }
    writeRegistry(registry);
    return skill;
  });
}

async function deleteUserSkill(id) {
  return withSkillLock(async () => {
    const registry = readRegistry();
    const idx = registry.skills.findIndex(s => s.id === id);
    if (idx === -1) throw new Error(`Skill "${id}" not found.`);
    registry.skills.splice(idx, 1);
    writeRegistry(registry);
    const dir = getUserSkillsDir();
    const mdPath = path.join(dir, id + '.md');
    try { if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath); } catch {}
    return { deleted: id };
  });
}

async function toggleUserSkill(id, enabled) {
  return withSkillLock(async () => {
    const registry = readRegistry();
    const skill = registry.skills.find(s => s.id === id);
    if (!skill) throw new Error(`Skill "${id}" not found.`);
    skill.enabled = !!enabled;
    writeRegistry(registry);
    return skill;
  });
}

function listUserSkills() {
  return readRegistry().skills;
}

function getUserSkillContent(id) {
  const dir = getUserSkillsDir();
  if (!dir) return null;
  const p = path.join(dir, id + '.md');
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}
```

- [ ] **Step 4: Add conflict detection (Layer 1 keyword)**

Append to `skill-manager.js`:

```javascript
function checkConflict({ content, appliesTo, trigger }) {
  const registry = readRegistry();
  const activeSkills = registry.skills.filter(s => s.enabled);
  const conflicts = [];
  const newWords = new Set((content + ' ' + trigger).toLowerCase().split(/\s+/).filter(w => w.length > 2));

  for (const skill of activeSkills) {
    const reasons = [];
    if (appliesTo && appliesTo.length > 0 && skill.appliesTo && skill.appliesTo.length > 0) {
      const overlap = appliesTo.filter(a => skill.appliesTo.includes(a));
      if (overlap.length > 0) {
        const skillWords = new Set((skill.summary + ' ' + skill.trigger).toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const common = [...newWords].filter(w => skillWords.has(w));
        if (common.length >= 2) reasons.push(`Same target (${overlap.join(', ')}) with overlapping keywords: ${common.slice(0, 5).join(', ')}`);
      }
    }
    if (trigger && skill.trigger && trigger.toLowerCase() === skill.trigger.toLowerCase()) {
      reasons.push('Identical trigger pattern');
    }
    if (reasons.length > 0) conflicts.push({ skillId: skill.id, skillName: skill.name, reasons });
  }
  return conflicts;
}
```

- [ ] **Step 5: Add shipped skills scanner + exports**

Append to `skill-manager.js`:

```javascript
function listShippedSkills() {
  const { getWorkspace } = require('./workspace');
  const ws = getWorkspace();
  if (!ws) return [];
  const skillsDir = path.join(ws, 'skills');
  const results = [];
  const categoryMap = {
    operations: 'Vận hành', marketing: 'Marketing', content: 'Nội dung',
    finance: 'Tài chính', strategy: 'Chiến lược',
    'image-templates': 'Mẫu hình ảnh',
  };

  function scan(dir, category) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '_archived' || entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name), categoryMap[entry.name] || entry.name);
      } else if (entry.name.endsWith('.md')) {
        const filePath = path.join(dir, entry.name);
        let name = entry.name.replace(/\.md$/, '');
        try {
          const firstLine = fs.readFileSync(filePath, 'utf-8').split('\n').find(l => l.trim());
          if (firstLine) name = firstLine.replace(/^#+\s*/, '').trim() || name;
        } catch {}
        results.push({
          id: (category && category !== 'Ngành' ? path.basename(dir) + '/' : '') + entry.name.replace(/\.md$/, ''),
          name,
          category: category || 'Ngành',
          source: 'shipped',
        });
      }
    }
  }
  scan(skillsDir, '');
  return results;
}

function getShippedSkillContent(relPath) {
  const { getWorkspace } = require('./workspace');
  const ws = getWorkspace();
  if (!ws) return null;
  const p = path.join(ws, 'skills', relPath + '.md');
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

module.exports = {
  createUserSkill, updateUserSkill, deleteUserSkill, toggleUserSkill,
  listUserSkills, getUserSkillContent,
  checkConflict,
  listShippedSkills, getShippedSkillContent,
  slugify, getUserSkillsDir,
};
```

- [ ] **Step 6: Commit**

```bash
git add electron/lib/skill-manager.js
git commit -m "feat: add skill-manager.js — registry CRUD, conflict detection, shipped scanner"
```

### Task 2: Seed user-skills/ in workspace.js + backup

**Files:**
- Modify: `electron/lib/workspace.js`

- [ ] **Step 1: Add user-skills directory seeding**

After the CEO-MEMORY.md block (~line 407 in `seedWorkspace()`), add:

```javascript
  // Seed user-skills/ directory (custom CEO skills — never in templateDirs)
  const userSkillsDir = path.join(ws, 'user-skills');
  if (!fs.existsSync(userSkillsDir)) {
    try { fs.mkdirSync(userSkillsDir, { recursive: true }); } catch {}
  }
  const skillRegistryPath = path.join(userSkillsDir, '_registry.json');
  if (!fs.existsSync(skillRegistryPath)) {
    try { fs.writeFileSync(skillRegistryPath, JSON.stringify({ version: 1, skills: [] }, null, 2), 'utf-8'); } catch {}
  }
```

- [ ] **Step 2: Add user-skills to backupWorkspace()**

In `backupWorkspace()` (~line 954), find the `copyDirIfExists` loop that backs up directories. Add `'user-skills'` to the array:

```javascript
// Find the array containing: 'memory', 'knowledge', 'skills', 'prompts', ...
// Add 'user-skills' to it
```

- [ ] **Step 3: Commit**

```bash
git add electron/lib/workspace.js
git commit -m "feat: seed user-skills/ on fresh install + add to backup"
```

---

## Chunk 2: API endpoints + AGENTS.md integration

### Task 3: Add /api/user-skills/* routes to cron-api.js

**Files:**
- Modify: `electron/lib/cron-api.js`

- [ ] **Step 1: Add require at top of file**

```javascript
const skillManager = require('./skill-manager');
```

- [ ] **Step 2: Add route block before the 404 fallback**

The last route before the 404 `else` is `/api/internal/agent-deliver-zalo` (~line 2153). Insert the new routes just before the 404 `else` block (~line 2155):

```javascript
    // === User Skills API ===
    } else if (urlPath === '/api/user-skills/list' && (req.method === 'GET' || req.method === 'POST')) {
      try {
        const skills = skillManager.listUserSkills();
        return jsonResp(res, 200, { skills });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }

    } else if (urlPath === '/api/user-skills/create' && req.method === 'POST') {
      try {
        const { name, type, appliesTo, trigger, content } = params;
        if (!name || !content) return jsonResp(res, 400, { error: 'name and content required' });
        const conflicts = skillManager.checkConflict({ content, appliesTo: appliesTo || [], trigger: trigger || '' });
        const entry = await skillManager.createUserSkill({ name, type, appliesTo, trigger, content });
        return jsonResp(res, 200, { success: true, entry, conflicts });
      } catch (e) { return jsonResp(res, e.message.includes('already exists') || e.message.includes('conflicts with') ? 409 : 500, { error: e.message }); }

    } else if (urlPath === '/api/user-skills/update' && req.method === 'POST') {
      try {
        const { id, name, type, appliesTo, trigger, content } = params;
        if (!id) return jsonResp(res, 400, { error: 'id required' });
        const skill = await skillManager.updateUserSkill(id, { name, type, appliesTo, trigger, content });
        return jsonResp(res, 200, { success: true, skill });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }

    } else if (urlPath === '/api/user-skills/delete' && req.method === 'POST') {
      try {
        const { id } = params;
        if (!id) return jsonResp(res, 400, { error: 'id required' });
        const result = await skillManager.deleteUserSkill(id);
        return jsonResp(res, 200, { success: true, ...result });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }

    } else if (urlPath === '/api/user-skills/toggle' && req.method === 'POST') {
      try {
        const { id, enabled } = params;
        if (!id) return jsonResp(res, 400, { error: 'id required' });
        const skill = await skillManager.toggleUserSkill(id, enabled !== false && enabled !== 'false');
        return jsonResp(res, 200, { success: true, skill });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }

    } else if (urlPath === '/api/user-skills/check-conflict' && req.method === 'POST') {
      try {
        const { content, appliesTo, trigger } = params;
        const conflicts = skillManager.checkConflict({ content: content || '', appliesTo: appliesTo || [], trigger: trigger || '' });
        return jsonResp(res, 200, { conflicts });
      } catch (e) { return jsonResp(res, 500, { error: e.message }); }
```

**Note:** No token auth required — cron-api already uses localhost-only binding (line 448). Token auth was removed from all endpoints.

- [ ] **Step 3: Verify via curl**

```bash
curl http://127.0.0.1:20200/api/user-skills/list
curl -X POST http://127.0.0.1:20200/api/user-skills/create -H "Content-Type: application/json" -d "{\"name\":\"Test Rule\",\"type\":\"rule\",\"trigger\":\"test\",\"content\":\"test content\"}"
curl http://127.0.0.1:20200/api/user-skills/list
curl -X POST http://127.0.0.1:20200/api/user-skills/delete -H "Content-Type: application/json" -d "{\"id\":\"test-rule\"}"
```

- [ ] **Step 4: Commit**

```bash
git add electron/lib/cron-api.js
git commit -m "feat: add /api/user-skills/* HTTP endpoints for Telegram skill creation"
```

### Task 4: Add skill instructions to AGENTS.md

**Files:**
- Modify: `AGENTS.md` + `electron/lib/workspace.js`

**IMPORTANT:** The version bump and AGENTS.md template changes MUST be committed atomically. If the version is bumped but the template is stale, `seedWorkspace()` would overwrite AGENTS.md with the old template (missing skill instructions).

- [ ] **Step 1: Bump CURRENT_AGENTS_MD_VERSION in workspace.js**

In `electron/lib/workspace.js` line 35, change:
```javascript
const CURRENT_AGENTS_MD_VERSION = 98;
```
to:
```javascript
const CURRENT_AGENTS_MD_VERSION = 99;
```

- [ ] **Step 2: Add cooperation instruction to AGENTS.md**

Insert AFTER the `## Skill loading — BẮT BUỘC` section (after line ~46, after the routing table ends):

```markdown
## Skill tùy chỉnh

CEO có thể tạo skill riêng. File: user-skills/_registry.json
Khi thực hiện task → đọc registry bằng read_file user-skills/_registry.json → nếu có skill với `appliesTo` trùng task hiện tại hoặc `type: rule` với `enabled: true` → read_file skill đó từ user-skills/{id}.md.
Skill tùy chỉnh BỔ SUNG cho skill hệ thống, không thay thế.
Luôn tuân thủ cả skill hệ thống LẪN skill tùy chỉnh.
```

- [ ] **Step 3: Add skill creation instruction to AGENTS.md**

Insert AFTER the `## Lệnh Telegram` or equivalent CEO-command section (where Telegram CEO commands are documented):

```markdown
## Tạo skill tùy chỉnh (chỉ CEO qua Telegram)

Khi CEO ra lệnh tạo rule/skill/quy tắc mới ("Từ giờ...", "Rule:...", "Tạo skill:...", "Khi khách hỏi X thì..."):
1. Đọc skill hiện có: web_fetch GET http://127.0.0.1:20200/api/user-skills/list
2. So sánh skill mới với skill hiện có — phát hiện mâu thuẫn logic hoặc trùng chức năng
3. Trình bày skill mới cho CEO xác nhận (tên, loại, nội dung, conflict nếu có)
4. Sau khi CEO OK: web_fetch POST http://127.0.0.1:20200/api/user-skills/create
   Body JSON: {"name": "...", "type": "rule|override|workflow|custom", "appliesTo": [...], "trigger": "...", "content": "..."}
5. Xác nhận đã lưu.

Khi CEO yêu cầu xóa/sửa/tắt skill: dùng /api/user-skills/update, /delete, /toggle tương ứng.
```

- [ ] **Step 4: Commit (atomic — version bump + template together)**

```bash
git add AGENTS.md electron/lib/workspace.js
git commit -m "feat: AGENTS.md v99 — skill cooperation + creation instructions"
```

---

## Chunk 3: Dashboard IPC + Preload + Tab UI

### Task 5: Add IPC handlers in dashboard-ipc.js

**Files:**
- Modify: `electron/lib/dashboard-ipc.js`

**IMPORTANT:** All IPC handlers in this file are INSIDE the `registerAllIpcHandlers()` function (lines 163–5142). New handlers must go inside this function body, before its closing brace at line ~5142. Do NOT place them outside the function.

- [ ] **Step 1: Add skill IPC handlers inside registerAllIpcHandlers()**

Add before the closing `}` of `registerAllIpcHandlers()` (~line 5142). Use inline `require` to avoid early-load issues:

```javascript
  // ================================
  // User Skills — Dashboard CRUD
  // ================================

  ipcMain.handle('list-all-skills', async () => {
    try {
      const sm = require('./skill-manager');
      const shipped = sm.listShippedSkills();
      const user = sm.listUserSkills();
      return { shipped, user };
    } catch (e) {
      console.error('[list-all-skills]', e?.message);
      return { shipped: [], user: [] };
    }
  });

  ipcMain.handle('get-skill-detail', async (_event, id, source) => {
    try {
      const sm = require('./skill-manager');
      if (source === 'shipped') return sm.getShippedSkillContent(id);
      return sm.getUserSkillContent(id);
    } catch (e) { return null; }
  });

  ipcMain.handle('create-user-skill', async (_event, data) => {
    const sm = require('./skill-manager');
    return sm.createUserSkill(data);
  });

  ipcMain.handle('update-user-skill', async (_event, id, data) => {
    const sm = require('./skill-manager');
    return sm.updateUserSkill(id, data);
  });

  ipcMain.handle('delete-user-skill', async (_event, id) => {
    const sm = require('./skill-manager');
    return sm.deleteUserSkill(id);
  });

  ipcMain.handle('toggle-user-skill', async (_event, id, enabled) => {
    const sm = require('./skill-manager');
    return sm.toggleUserSkill(id, enabled);
  });

  ipcMain.handle('check-skill-conflict', async (_event, data) => {
    try {
      const sm = require('./skill-manager');
      const layer1 = sm.checkConflict(data);
      // Layer 2: LLM semantic check via 9Router (15s timeout)
      let layer2 = null;
      if (layer1.length === 0) {
        try {
          const http = require('http');
          const allSkills = sm.listUserSkills().filter(s => s.enabled);
          if (allSkills.length > 0) {
            const prompt = `Các quy tắc hiện có:\n${allSkills.map(s => `- ${s.name}: ${s.summary}`).join('\n')}\n\nQuy tắc mới:\n${data.content}\n\nCó mâu thuẫn logic hay trùng chức năng không? Trả lời JSON: {"hasConflict":bool,"description":"..."}`;
            const body = JSON.stringify({ model: 'gpt-5-mini', max_tokens: 200, messages: [{ role: 'user', content: prompt }] });
            layer2 = await new Promise((resolve) => {
              const timer = setTimeout(() => resolve(null), 15000);
              const req = http.request({ hostname: '127.0.0.1', port: 20128, path: '/v1/chat/completions', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
                let d = '';
                res.on('data', c => { d += c; });
                res.on('end', () => { clearTimeout(timer); try { const r = JSON.parse(d); const txt = r.choices?.[0]?.message?.content || ''; resolve(JSON.parse(txt)); } catch { resolve(null); } });
              });
              req.on('error', () => { clearTimeout(timer); resolve(null); });
              req.end(body);
            });
          }
        } catch {}
      }
      return { conflicts: layer1, semantic: layer2 };
    } catch (e) { return { conflicts: [], semantic: null, error: e.message }; }
  });
```

- [ ] **Step 2: Commit**

```bash
git add electron/lib/dashboard-ipc.js
git commit -m "feat: add 7 skill IPC handlers (Layer 1 + Layer 2 conflict detection)"
```

### Task 6: Add preload bridges

**Files:**
- Modify: `electron/preload.js`

- [ ] **Step 1: Add 7 skill bridges**

Inside the `contextBridge.exposeInMainWorld('claw', { ... })` block (line 3), add after the existing bridges (e.g., after the Persona mix bridges ~line 218):

```javascript
  // User Skills
  listAllSkills: () => ipcRenderer.invoke('list-all-skills'),
  getSkillDetail: (id, source) => ipcRenderer.invoke('get-skill-detail', id, source),
  createUserSkill: (data) => ipcRenderer.invoke('create-user-skill', data),
  updateUserSkill: (id, data) => ipcRenderer.invoke('update-user-skill', id, data),
  deleteUserSkill: (id) => ipcRenderer.invoke('delete-user-skill', id),
  toggleUserSkill: (id, enabled) => ipcRenderer.invoke('toggle-user-skill', id, enabled),
  checkSkillConflict: (data) => ipcRenderer.invoke('check-skill-conflict', data),
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.js
git commit -m "feat: add 7 skill preload bridges"
```

### Task 7: Add Skills tab to Dashboard

**Files:**
- Modify: `electron/ui/dashboard.html`

- [ ] **Step 1: Add sidebar menu item after Persona (persona-mix) item (~line 2614)**

```html
        <div class="sidebar-menu-item" data-page="skills" onclick="switchPage('skills')">
          <span class="icon" data-icon="zap"></span><span class="label">Skills</span>
        </div>
```

- [ ] **Step 2: Add page container after Persona page (~line 3333)**

```html
      <!-- PAGE: Skills -->
      <div class="page" id="page-skills">
        <div class="page-header">
          <span class="page-icon" data-icon="zap" data-icon-size="26"></span>
          <div>
            <h2>Skills</h2>
            <div class="page-sub">Quản lý skill hệ thống và tùy chỉnh</div>
          </div>
        </div>

        <div id="skills-user-section">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h3 style="margin:0;font-size:15px;font-weight:600;color:var(--text-primary)">Tùy chỉnh</h3>
            <button class="btn btn-sm" onclick="showCreateSkillForm()" style="font-size:13px">+ Tạo mới</button>
          </div>
          <div id="skills-create-form" style="display:none" class="card" >
            <div style="margin-bottom:8px"><label style="font-size:12px;color:var(--text-secondary)">Tên skill</label><input id="skill-name" class="input" placeholder="VD: Tone chuyên nghiệp cho Facebook" style="width:100%;margin-top:4px"></div>
            <div style="margin-bottom:8px"><label style="font-size:12px;color:var(--text-secondary)">Loại</label><select id="skill-type" class="input" style="width:100%;margin-top:4px"><option value="rule">Rule (quy tắc chung)</option><option value="override">Override (tùy chỉnh skill hệ thống)</option><option value="workflow">Workflow (quy trình)</option><option value="custom">Custom</option></select></div>
            <div style="margin-bottom:8px"><label style="font-size:12px;color:var(--text-secondary)">Áp cho skill hệ thống (bỏ trống = standalone)</label><select id="skill-applies-to" class="input" style="width:100%;margin-top:4px"><option value="">Standalone</option></select></div>
            <div style="margin-bottom:8px"><label style="font-size:12px;color:var(--text-secondary)">Khi nào áp dụng</label><input id="skill-trigger" class="input" placeholder="VD: khi đăng bài Facebook" style="width:100%;margin-top:4px"></div>
            <div style="margin-bottom:8px"><label style="font-size:12px;color:var(--text-secondary)">Nội dung (tối đa 500 ký tự)</label><textarea id="skill-content" class="input" rows="4" maxlength="500" placeholder="VD: Xưng chúng tôi, tone chuyên nghiệp, không dùng emoji" style="width:100%;margin-top:4px;resize:vertical"></textarea></div>
            <div id="skill-conflict-warning" style="display:none;padding:8px 12px;background:var(--warning-bg, #fff3cd);border-radius:6px;margin-bottom:8px;font-size:13px;color:var(--warning-text, #856404)"></div>
            <div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" onclick="saveNewSkill()">Lưu</button><button class="btn btn-sm" onclick="hideCreateSkillForm()">Hủy</button></div>
          </div>
          <div id="skills-user-list"></div>
          <div id="skills-user-empty" style="display:none;padding:24px;text-align:center;color:var(--text-secondary);font-size:14px">Chưa có skill tùy chỉnh. Tạo mới hoặc nhắn qua Telegram.</div>
        </div>

        <div id="skills-system-section" style="margin-top:24px">
          <h3 style="margin:0 0 12px;font-size:15px;font-weight:600;color:var(--text-primary)">Hệ thống</h3>
          <div id="skills-system-list"></div>
        </div>
      </div>
```

- [ ] **Step 3: Add switchPage handler for skills**

Inside `switchPage()` (~line 4964), after the persona-mix block:

```javascript
      if (page === 'skills') loadSkills();
```

- [ ] **Step 4: Add JavaScript for Skills page**

Add before the closing `</script>` tag. Note: do NOT redefine `esc()` — it already exists at line 4344. Use `escAttr()` (line 4345) for onclick attributes.

```javascript
    // === Skills Tab ===
    async function loadSkills() {
      if (!window.claw || !window.claw.listAllSkills) return;
      try {
        const { shipped, user } = await window.claw.listAllSkills();
        renderUserSkills(user || []);
        renderShippedSkills(shipped || []);
        populateAppliesToDropdown(shipped || []);
      } catch (e) { console.error('loadSkills', e); }
    }

    function renderUserSkills(skills) {
      const list = document.getElementById('skills-user-list');
      const empty = document.getElementById('skills-user-empty');
      if (!skills.length) { list.innerHTML = ''; empty.style.display = ''; return; }
      empty.style.display = 'none';
      list.innerHTML = skills.map(s => `
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <span style="font-weight:600;font-size:14px;color:var(--text-primary)">${esc(s.name)}</span>
              <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--badge-bg, #e8e8e8);color:var(--text-secondary);margin-left:6px">${esc(s.type)}</span>
              ${s.appliesTo && s.appliesTo.length ? `<span style="font-size:11px;color:var(--text-secondary);margin-left:6px">${esc(s.appliesTo.join(', '))}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <label class="toggle-switch" style="margin:0"><input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="toggleSkill('${escAttr(s.id)}', this.checked)"><span class="toggle-slider"></span></label>
              <button class="btn btn-sm btn-danger" onclick="deleteSkill('${escAttr(s.id)}', '${escAttr(s.name)}')" style="font-size:12px;padding:2px 8px">Xóa</button>
            </div>
          </div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${esc(s.summary || '')}</div>
        </div>
      `).join('');
    }

    function renderShippedSkills(skills) {
      const list = document.getElementById('skills-system-list');
      const grouped = {};
      for (const s of skills) {
        const cat = s.category || 'Khác';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(s);
      }
      list.innerHTML = Object.entries(grouped).map(([cat, items]) => `
        <details style="margin-bottom:8px">
          <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text-secondary);padding:6px 0">${esc(cat)} (${items.length})</summary>
          <div style="padding-left:12px">${items.map(s => `
            <div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--text-primary)">${esc(s.name)}</div>
          `).join('')}</div>
        </details>
      `).join('');
    }

    function populateAppliesToDropdown(shipped) {
      const sel = document.getElementById('skill-applies-to');
      if (!sel) return;
      const first = sel.querySelector('option[value=""]');
      sel.innerHTML = '';
      if (first) sel.appendChild(first);
      for (const s of shipped) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name + ' (' + s.category + ')';
        sel.appendChild(opt);
      }
    }

    function showCreateSkillForm() { document.getElementById('skills-create-form').style.display = ''; }
    function hideCreateSkillForm() {
      document.getElementById('skills-create-form').style.display = 'none';
      document.getElementById('skill-conflict-warning').style.display = 'none';
      ['skill-name','skill-trigger','skill-content'].forEach(id => { document.getElementById(id).value = ''; });
    }

    async function saveNewSkill() {
      const name = document.getElementById('skill-name').value.trim();
      const type = document.getElementById('skill-type').value;
      const appliesTo = document.getElementById('skill-applies-to').value;
      const trigger = document.getElementById('skill-trigger').value.trim();
      const content = document.getElementById('skill-content').value.trim();
      if (!name || !content) return alert('Cần nhập tên và nội dung.');
      try {
        const result = await window.claw.createUserSkill({
          name, type, appliesTo: appliesTo ? [appliesTo] : [], trigger, content
        });
        if (result && result.id) { hideCreateSkillForm(); loadSkills(); }
      } catch (e) { alert('Lỗi: ' + (e.message || e)); }
    }

    async function deleteSkill(id, name) {
      if (!confirm('Xóa skill "' + name + '"?')) return;
      try { await window.claw.deleteUserSkill(id); loadSkills(); } catch (e) { alert('Lỗi: ' + e.message); }
    }

    async function toggleSkill(id, enabled) {
      try { await window.claw.toggleUserSkill(id, enabled); } catch (e) { alert('Lỗi: ' + e.message); loadSkills(); }
    }
```

- [ ] **Step 5: Verify — open Dashboard, Skills tab loads, CRUD works**

- [ ] **Step 6: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat: Dashboard Skills tab — view shipped + CRUD user skills"
```

---

## Chunk 4: Integration verification

### Task 8: End-to-end verification

- [ ] **Step 1: Fresh install test**

Run RESET.bat → RUN.bat → verify:
- `user-skills/` dir exists with empty `_registry.json`
- Dashboard Skills tab shows shipped skills grouped by category
- "Tùy chỉnh" section shows empty state

- [ ] **Step 2: Dashboard CRUD test**

Dashboard → Skills → "+ Tạo mới" → fill form → save:
- Skill appears in "Tùy chỉnh" with card layout
- `_registry.json` has entry, `.md` file exists
- Toggle off/on works, delete removes skill

- [ ] **Step 3: API test (simulates Telegram bot)**

```bash
curl -X POST http://127.0.0.1:20200/api/user-skills/create -H "Content-Type: application/json" -d "{\"name\":\"Tone chuyên nghiệp cho Facebook\",\"type\":\"override\",\"appliesTo\":[\"operations/facebook-image\"],\"trigger\":\"khi đăng bài Facebook\",\"content\":\"Xưng chúng tôi. Tone chuyên nghiệp. Không dùng emoji.\"}"
```

Verify: 200 response, skill visible in Dashboard.

- [ ] **Step 4: Conflict test**

Create two skills with same `appliesTo` + overlapping keywords. API returns `conflicts` array (non-blocking).

- [ ] **Step 5: App upgrade test**

Bump `CURRENT_AGENTS_MD_VERSION` to 100 → restart → verify:
- AGENTS.md recreated from template (with skill instructions)
- `user-skills/` untouched (registry + .md files preserved)
- Dashboard still shows user skills

- [ ] **Step 6: Namespace collision test**

```bash
curl -X POST http://127.0.0.1:20200/api/user-skills/create -H "Content-Type: application/json" -d "{\"name\":\"fnb\",\"type\":\"custom\",\"content\":\"test\"}"
```

Should return 409 with collision error (fnb.md is a shipped skill).

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: User Skills System — complete implementation"
```
