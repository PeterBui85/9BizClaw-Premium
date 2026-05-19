# Hermes-Style Memory Injection Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Bot nhớ mọi task + quyết định across sessions. Memory content inline trong system prompt, zero LLM dependency.

**Architecture:** Hermes-proven pattern — `ceo_memories` table → regenerate CEO-MEMORY.md → append content vào cuối AGENTS.md wrapped `<memory-context>`. `contextInjection=always` guarantee visible mỗi turn. Cap 2000 chars.

**Retention layered:** (1) task entries > 14 days hard-deleted from SQLite, (2) remaining entries scored + capped at HOT_TIER_MAX_CHARS=8000 for CEO-MEMORY.md, (3) injected section further capped at MEMORY_MAX_CHARS=2000 for AGENTS.md.

**Safety:** Writing AGENTS.md does NOT trigger gateway restart (gateway watches only openclaw.json). `seedWorkspace()` deletes+recreates AGENTS.md on upgrade — injection must run LAST.

---

## Task 1: Add `task` type + auto-write triggers

**Files:**
- Modify: `electron/lib/ceo-memory.js`
- Modify: `electron/lib/cron.js`

- [ ] **Step 1: Add `task` to VALID_TYPES + VALID_SOURCES**

```js
// ceo-memory.js
const VALID_TYPES = ['rule', 'pattern', 'preference', 'fact', 'correction', 'task'];
const VALID_SOURCES = ['nudge', 'ceo_correction', 'evening_summary', 'manual', 'auto'];
```

- [ ] **Step 2: Add `task` to BOTH typeLabels AND the rendering iteration array**

CRITICAL: both must be updated or task entries are silently excluded.

```js
const typeLabels = {
  correction: 'Quy tắc đã sửa',
  rule: 'Quy tắc đã học',
  preference: 'Sở thích của sếp',
  pattern: 'Patterns khách hàng',
  fact: 'Sự kiện quan trọng',
  task: 'Việc đã làm gần đây',
};

// The iteration array (line ~259) MUST also include 'task':
for (const type of ['correction', 'rule', 'preference', 'pattern', 'fact', 'task']) {
```

- [ ] **Step 3: Write memory after successful cron run**

In `cron.js`, after `journalCronRun({ phase: 'ok', ... })` inside `_runCronAgentPromptImpl`:

```js
try {
  const { writeMemory } = require('./ceo-memory');
  const replyPreview = (replyText || '').slice(0, 120).replace(/\n/g, ' ');
  writeMemory({
    type: 'task',
    content: `[${new Date().toLocaleDateString('vi-VN')}] Cron "${niceLabel}": ${replyPreview || 'hoàn thành'}`,
    source: 'auto',
  }).catch(e => console.warn('[cron-memory] write failed:', e?.message));
} catch (e) { console.warn('[cron-memory] require failed:', e?.message); }
```

Note: `writeMemory` is async — use `.catch()` not `await` (non-blocking, don't delay cron pipeline).

- [ ] **Step 4: Verify smoke passes**

Run: `cd electron && npm run smoke`

---

## Task 2: Inject memory into AGENTS.md

**Files:**
- Modify: `electron/lib/ceo-memory.js` — add `injectMemoryIntoAgentsMd()`
- Modify: `electron/lib/workspace.js` — call injection LAST in `seedWorkspace()`

- [ ] **Step 1: Add injection function in ceo-memory.js**

```js
const MEMORY_SECTION_START = '<!-- MEMORY-CONTEXT-START -->';
const MEMORY_SECTION_END = '<!-- MEMORY-CONTEXT-END -->';
const MEMORY_MAX_CHARS = 2000;

function injectMemoryIntoAgentsMd() {
  try {
    const ws = getWorkspace();
    if (!ws) return;
    const agentsPath = path.join(ws, 'AGENTS.md');
    if (!fs.existsSync(agentsPath)) return;

    const ceoMemPath = path.join(ws, 'CEO-MEMORY.md');
    let memContent = '';
    if (fs.existsSync(ceoMemPath)) {
      memContent = fs.readFileSync(ceoMemPath, 'utf-8').trim();
    }
    if (!memContent || memContent.includes('Chưa có gì')) memContent = '';

    // Cap — keep tail (most recent entries)
    if (memContent.length > MEMORY_MAX_CHARS) {
      const lines = memContent.split('\n');
      let trimmed = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const candidate = lines[i] + '\n' + trimmed;
        if (candidate.length > MEMORY_MAX_CHARS) break;
        trimmed = candidate;
      }
      memContent = trimmed.trim();
    }

    const section = memContent
      ? `\n\n${MEMORY_SECTION_START}\n<memory-context>\n${memContent}\n</memory-context>\n${MEMORY_SECTION_END}`
      : `\n\n${MEMORY_SECTION_START}\n${MEMORY_SECTION_END}`;

    let agents = fs.readFileSync(agentsPath, 'utf-8');
    const startIdx = agents.indexOf(MEMORY_SECTION_START);
    const endIdx = agents.indexOf(MEMORY_SECTION_END);
    if (startIdx !== -1 && endIdx !== -1) {
      agents = agents.slice(0, startIdx) + section.trim() + agents.slice(endIdx + MEMORY_SECTION_END.length);
    } else {
      agents = agents.trimEnd() + section;
    }

    const current = fs.readFileSync(agentsPath, 'utf-8');
    if (agents !== current) {
      fs.writeFileSync(agentsPath, agents, 'utf-8');
    }
  } catch (e) {
    console.warn('[ceo-memory] inject into AGENTS.md failed:', e?.message);
  }
}
```

- [ ] **Step 2: Chain injection after CEO-MEMORY.md regeneration**

In the existing `_regenerateCeoMemoryMd()` debounce callback, add at the end:
```js
injectMemoryIntoAgentsMd();
```

- [ ] **Step 3: Call injection LAST in seedWorkspace()**

CRITICAL ordering: must be AFTER all template copies, AFTER Zalo mode re-application. Add as the very last operation:
```js
// Last line of seedWorkspace(), after all template refreshes
try { require('./ceo-memory').injectMemoryIntoAgentsMd(); } catch {}
```

- [ ] **Step 4: Export injectMemoryIntoAgentsMd**

- [ ] **Step 5: Verify smoke + check AGENTS.md size < 40,000 chars**

Run: `cd electron && npm run smoke`

---

## Task 3: Write triggers for conversations (ceo-nudge.js)

**Files:**
- Modify: `electron/lib/ceo-nudge.js`

- [ ] **Step 1: Add task detection in nudge transcript analysis**

In `_runMemoryNudge()`, AFTER the existing transcript extraction (line ~106-107) and BEFORE the LLM analysis call, check the transcript for task completion patterns:

```js
// Task completion detection — write to memory if conversation involved completing something
const transcriptLower = (transcript || '').toLowerCase();
const taskPatterns = ['đã tạo', 'đã làm', 'đã gửi', 'đã xong', 'hoàn thành', 'đã lưu', 'đã upload', 'đã cập nhật'];
const matchedTask = taskPatterns.find(p => transcriptLower.includes(p));
if (matchedTask) {
  try {
    // Extract first 150 chars of the bot's last reply as summary
    const lastBotReply = (transcript.match(/assistant[:\s]+([\s\S]{10,200}?)(?:\n(?:user|human)|$)/i) || [])[1] || '';
    if (lastBotReply) {
      writeMemory({
        type: 'task',
        content: `[${new Date().toLocaleDateString('vi-VN')}] ${lastBotReply.slice(0, 150).replace(/\n/g, ' ').trim()}`,
        source: 'auto',
      }).catch(e => console.warn('[nudge-memory] task write failed:', e?.message));
    }
  } catch {}
}
```

Note: uses `transcript` variable (exists in scope), not `replyText` (doesn't exist).

- [ ] **Step 2: Verify smoke**

Run: `cd electron && npm run smoke`

---

## Task 4: Memory retention — trim old task entries

**Files:**
- Modify: `electron/lib/ceo-memory.js`

- [ ] **Step 1: Add task retention at top of regeneration**

```js
function trimOldTaskEntries() {
  const db = getMemoryDb();
  if (!db) return;
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  try {
    db.prepare("DELETE FROM ceo_memories WHERE type = 'task' AND created_at < ?").run(cutoff);
  } catch (e) {
    console.warn('[ceo-memory] trim old tasks error:', e?.message);
  }
}
```

Call at the top of `_regenerateCeoMemoryMd()`:
```js
trimOldTaskEntries();
```

- [ ] **Step 2: Verify smoke**

Run: `cd electron && npm run smoke`

---

## Task 5: Fix evening report to read from ceo_memories

**Files:**
- Modify: `electron/lib/cron.js` — `buildEveningSummaryPrompt`

- [ ] **Step 1: ADD ceo_memories reading alongside existing history sources**

This is ADDITIVE — keep existing `extractConversationHistory` + `memoryInsights` calls. Add a new `taskHistory` block:

```js
let taskHistory = '';
try {
  const { listMemories } = require('./ceo-memory');
  const memories = listMemories({ limit: 20 });
  if (memories && memories.length > 0) {
    const recent = memories.filter(m => {
      const age = Date.now() - new Date(m.created_at).getTime();
      return age < 48 * 3600000;
    });
    if (recent.length > 0) {
      taskHistory = '\n\n--- HOẠT ĐỘNG 48H QUA (từ bộ nhớ bot) ---\n' +
        recent.map(m => `- [${m.type}] ${m.content}`).join('\n') +
        '\n--- HẾT ---\n\n';
    }
  }
} catch {}
```

Insert `taskHistory` into the return string alongside `historyBlock`, `memoryInsights`, `knowledgeGaps`.

- [ ] **Step 2: Verify smoke**

Run: `cd electron && npm run smoke`

---

## Task 6: Smoke tests + build

**Files:**
- Modify: `electron/scripts/smoke-test.js`

- [ ] **Step 1: Add memory injection smoke tests**

```js
section('Memory injection');
try {
  const cm = require('../lib/ceo-memory');
  if (typeof cm.injectMemoryIntoAgentsMd !== 'function') fail('memory', 'injectMemoryIntoAgentsMd not exported');
  if (typeof cm.writeMemory !== 'function') fail('memory', 'writeMemory not exported');
  // Verify task type is in rendering loop
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'ceo-memory.js'), 'utf-8');
  if (!src.includes("'task'") || !/'task'/.test(src.match(/for\s*\(\s*const\s+type\s+of\s+\[([^\]]+)\]/)?.[1] || '')) {
    fail('memory', 'task type missing from rendering iteration array');
  }
  pass('memory injection exports + task type intact');
} catch (e) {
  fail('memory injection', e.message);
}
```

- [ ] **Step 2: Run full smoke + map:generate**

Run: `cd electron && npm run smoke && npm run map:generate`

- [ ] **Step 3: Build EXE**

Run: `cd electron && npm run build:win`
