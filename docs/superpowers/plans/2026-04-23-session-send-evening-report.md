# Session-Send Evening Report — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver evening/morning/weekly reports through the CEO's gateway Telegram session via `sessions.send`, enabling natural conversational replies instead of numbered "ok 1" commands.

**Architecture:** Cron fires → main.js builds prompt from template file + scanned data → `sendToGatewaySession()` injects prompt into CEO's Telegram session via `openclaw gateway call sessions.send` CLI subprocess → agent generates report in-session → CEO replies naturally → same agent executes. Falls back to `runCronAgentPrompt()` on failure.

**Tech Stack:** Node.js (Electron main process), openclaw CLI (`gateway call`), existing `spawnOpenClawSafe()` infra.

**Spec:** `docs/superpowers/specs/2026-04-23-session-send-evening-report-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `electron/main.js` | Modify | Add 3 new functions, modify 5 cron handlers, remove evening-context.json write, load prompts from files |
| `electron/prompts/evening-briefing.md` | Create | Evening prompt template with `{{time}}`, `{{historyBlock}}`, `{{memoryInsights}}`, `{{knowledgeGaps}}` placeholders |
| `electron/prompts/morning-briefing.md` | Create | Morning prompt template |
| `electron/prompts/weekly-report.md` | Create | Weekly prompt template |
| `AGENTS.md` | Modify | Remove 1-tap section, add natural-reply rule, bump v70 |
| `electron/scripts/smoke-test.js` | Modify | Add prompt-file existence check |

---

## Chunk 1: Prompt template files + loading

### Task 1: Create evening prompt template

**Files:**
- Create: `electron/prompts/evening-briefing.md`

- [ ] **Step 1: Create the prompts directory and evening template**

```markdown
Em la co van kinh doanh so mot cua anh — nguoi duy nhat nhin duoc
toan bo hoi thoai voi khach hang hom nay. Bay gio la {{time}}, cuoi ngay.

Chat loc data tho ben duoi thanh 1 tin nhan Telegram ma anh doc
trong 30 giay, biet ngay hom nay the nao va can lam gi.

{{historyBlock}}
{{memoryInsights}}
{{knowledgeGaps}}

Uu tien theo tac dong kinh doanh:
1. Deal / doanh thu — khach sap chot, don lon, thanh toan
2. Rui ro — khach phan nan, hua chua thuc hien, follow-up qua han
3. Co hoi — san pham hoi nhieu, khach moi tiem nang
4. Kien thuc — cau hoi bot chua tra loi, lo hong can bo sung

Cau truc linh hoat — CHI viet muc co data:

Mo dau: 1 cau tong ket sac ben, khong loi chao.
VD: "12 khach nhan, 2 deal nong, 1 khach can nhac gap."

Tung item: insight + de xuat hanh dong cu the.
Em co the thuc hien ngay trong cuoc tro chuyen nay: gui Zalo nhac
khach, them FAQ vao Knowledge, tao lich gui nhom. Anh dong y thi
em lam luon — khong can go lenh, khong can so thu tu.

VD: "Chi Lan hua ghe thu 6, chua thay quay lai — em nhac chi ay khong?"
→ anh reply "u nhac di" → em gui Zalo ngay.

Ket: viec cho ngay mai neu co, 1 dong.

Ngay yen ak (it/khong tin nhan):
"Hom nay khong co gi dang chu y." + 1 de xuat chu dong neu co
(VD: "Tuan nay chua gui gi cho nhom VIP — anh muon em soan tin khong?").
Khong keo dai, khong liet ke muc trong.

Quy tac tuyet doi:
- Chi insight co data chung minh. Bia = loi nghiem trong nhat.
- Tieng Viet co dau. Khong emoji. Telegram khong render markdown
  phuc tap — chi dung bold va xuong dong.
- Ngan gon, anh doc tren dien thoai cuoi ngay met.
- Khong meta ("dua tren du lieu", "em xin tom tat"). Di thang.
- Khong hoi nguoc. Khong muc trong. Khong danh so bat anh reply so.
```

IMPORTANT: The file must be saved with proper Vietnamese diacritics (UTF-8). The template above is shown without diacritics for plan readability — the actual file MUST use full diacritics. Copy the approved prompt from the brainstorming session (the version with "cố vấn kinh doanh số một", "chắt lọc", "sắc bén", etc.).

- [ ] **Step 2: Verify file exists and is UTF-8**

Run: `file electron/prompts/evening-briefing.md`
Expected: UTF-8 text

### Task 2: Create morning prompt template

**Files:**
- Create: `electron/prompts/morning-briefing.md`

- [ ] **Step 1: Extract current morning prompt from `electron/main.js:8924-8936` into template file**

The morning prompt already has proper diacritics. Extract the string literal, replace the `${timeStr || '07:30'}` with `{{time}}` and `${historyBlock}` with `{{historyBlock}}`. Save to file.

### Task 3: Create weekly prompt template

**Files:**
- Create: `electron/prompts/weekly-report.md`

- [ ] **Step 1: Extract current weekly prompt from `electron/main.js:9076-9087` into template file**

Same pattern — replace interpolated variables with `{{varName}}` placeholders.

### Task 4: Wire prompt loading into build functions

**Files:**
- Modify: `electron/main.js:8917-8937` (`buildMorningBriefingPrompt`)
- Modify: `electron/main.js:8939-9063` (`buildEveningSummaryPrompt`)
- Modify: `electron/main.js:9065-9087` (`buildWeeklyReportPrompt`)

- [ ] **Step 1: Add `loadPromptTemplate(name)` helper near top of prompt section (~line 8910)**

```js
function loadPromptTemplate(name) {
  const candidates = [
    path.join(__dirname, 'prompts', name),
    path.join(process.resourcesPath || __dirname, 'prompts', name),
  ];
  for (const p of candidates) {
    try { return fs.readFileSync(p, 'utf-8'); } catch {}
  }
  return null;
}
```

- [ ] **Step 2: Rewrite `buildEveningSummaryPrompt()` to use template**

Keep all the data scanning logic (memory insights, knowledge gaps, history extraction). Replace the hardcoded return string with:

```js
const template = loadPromptTemplate('evening-briefing.md');
if (template) {
  return template
    .replace('{{time}}', timeStr || '21:00')
    .replace('{{historyBlock}}', historyBlock)
    .replace('{{memoryInsights}}', memoryInsights)
    .replace('{{knowledgeGaps}}', knowledgeGaps);
}
// Fallback: inline prompt (in case template file missing in dev)
return `Bây giờ là ${timeStr || '21:00'} ...`;
```

- [ ] **Step 3: Remove the `evening-context.json` write block (~line 9011-9038)**

Delete the entire `// Save context for 1-tap execution` try/catch block. No longer needed — agent has session context.

- [ ] **Step 4: Rewrite `buildMorningBriefingPrompt()` same pattern**

- [ ] **Step 5: Rewrite `buildWeeklyReportPrompt()` same pattern**

- [ ] **Step 6: Add prompt files to electron-builder extraResources**

Check `package.json` build config. Add `prompts/` directory to the files/extraResources list so it ships with the EXE/DMG.

- [ ] **Step 7: Commit**

```bash
git add electron/prompts/ electron/main.js electron/package.json
git commit -m "refactor: externalize cron prompts to electron/prompts/ with diacritics"
```

---

## Chunk 2: Gateway session injection

### Task 5: Add `getGatewayAuthToken()`

**Files:**
- Modify: `electron/main.js` (add near `getTelegramConfigWithRecovery` ~line 9480)

- [ ] **Step 1: Implement the function**

```js
function getGatewayAuthToken() {
  if (process.env.OPENCLAW_GATEWAY_TOKEN) return process.env.OPENCLAW_GATEWAY_TOKEN;
  try {
    const configPath = path.join(HOME, '.openclaw', 'openclaw.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config?.gateway?.auth?.token || null;
  } catch { return null; }
}
```

### Task 6: Add `getCeoSessionKey()`

**Files:**
- Modify: `electron/main.js` (right after `getGatewayAuthToken`)

- [ ] **Step 1: Implement the function**

```js
async function getCeoSessionKey() {
  try {
    const { chatId } = await getTelegramConfigWithRecovery();
    if (!chatId) return null;
    return `agent:main:telegram:direct:${chatId}`;
  } catch { return null; }
}
```

### Task 7: Add `sendToGatewaySession()`

**Files:**
- Modify: `electron/main.js` (right after `getCeoSessionKey`)

- [ ] **Step 1: Implement the function**

```js
async function sendToGatewaySession(sessionKey, message) {
  try {
    const params = JSON.stringify({ key: sessionKey, message });
    const result = await spawnOpenClawSafe(
      ['gateway', 'call', 'sessions.send', '--params', params, '--json'],
      { timeoutMs: 60000, allowCmdShellFallback: false }
    );
    console.log('[sessions.send] delivered to', sessionKey.slice(0, 30) + '...');
    return true;
  } catch (e) {
    console.warn('[sessions.send] failed, will fallback:', e?.message || e);
    return false;
  }
}
```

Note: `allowCmdShellFallback: false` because the JSON params may contain special characters that cmd.exe would mangle.

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "feat: add sendToGatewaySession() via openclaw gateway call sessions.send"
```

---

## Chunk 3: Wire cron handlers + cleanup

### Task 8: Add helper to wrap session-send-with-fallback

**Files:**
- Modify: `electron/main.js` (right after `sendToGatewaySession`)

- [ ] **Step 1: Add `runCronViaSessionOrFallback()` helper**

```js
async function runCronViaSessionOrFallback(prompt, opts = {}) {
  const sessionKey = await getCeoSessionKey();
  const token = getGatewayAuthToken();
  if (sessionKey && token) {
    const ok = await sendToGatewaySession(sessionKey, prompt);
    if (ok) return true;
    console.log('[cron] sessions.send failed, falling back to runCronAgentPrompt');
  }
  return runCronAgentPrompt(prompt, opts);
}
```

This avoids duplicating the fallback pattern in every handler.

### Task 9: Update evening cron handler

**Files:**
- Modify: `electron/main.js:12700-12705`

- [ ] **Step 1: Replace `runCronAgentPrompt` with `runCronViaSessionOrFallback`**

Change line 12702:
```js
// Before:
await runCronAgentPrompt(prompt, { label: 'evening-summary' });
// After:
await runCronViaSessionOrFallback(prompt, { label: 'evening-summary' });
```

### Task 10: Update morning cron handler

**Files:**
- Modify: `electron/main.js:12678-12680`

- [ ] **Step 1: Same replacement**

Change line 12679:
```js
await runCronViaSessionOrFallback(prompt, { label: 'morning-briefing' });
```

### Task 11: Update weekly cron handler

**Files:**
- Modify: `electron/main.js:12884-12886`

- [ ] **Step 1: Same replacement**

Change line 12885:
```js
await runCronViaSessionOrFallback(prompt, { label: 'weekly-report' });
```

### Task 12: Update custom agent-mode cron handlers

**Files:**
- Modify: `electron/main.js:13015` (one-time agent cron)
- Modify: `electron/main.js:13069` (one-time healed agent cron)
- Modify: `electron/main.js:13104` (recurring custom cron)

- [ ] **Step 1: For each `runCronAgentPrompt(c.prompt, ...)` in custom cron handlers, check if cron has `mode === 'agent'`. If yes, use `runCronViaSessionOrFallback`. If no (exec: fast path), keep `runCronAgentPrompt`.**

The exec: fast path crons (group message sends) don't benefit from session injection — they bypass the agent entirely. Only agent-mode crons should use sessions.send.

```js
// For agent-mode custom crons:
if (c.prompt && !c.prompt.startsWith('exec:')) {
  await runCronViaSessionOrFallback(c.prompt, { label: c.label || c.id });
} else {
  await runCronAgentPrompt(c.prompt, { label: c.label || c.id });
}
```

### Task 13: Update test-cron IPC handler

**Files:**
- Modify: `electron/main.js:9332`

- [ ] **Step 1: Same pattern for the test-cron IPC handler**

```js
const ok = await runCronViaSessionOrFallback(c.prompt, { label: `TEST — ${c.label || c.id}` });
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "feat: wire all agent-mode crons through sessions.send with fallback"
```

---

## Chunk 4: AGENTS.md cleanup + smoke test

### Task 14: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Bump version to 70**

```
<!-- modoroclaw-agents-version: 70 -->
```

- [ ] **Step 2: Remove the entire "1-tap" section (lines 230-252)**

Delete from `## 1-tap — CEO reply ngắn sau báo cáo tối` through the line before `## Workspace API`.

- [ ] **Step 3: Add natural-reply rule to Telegram section**

After `**Quản lý Zalo** → docs/zalo-manage-reference.md.` (around line 209), add:

```
**Sau báo cáo sáng/tối:** CEO có thể reply tự nhiên để duyệt đề xuất. Em có đầy đủ context trong cuộc trò chuyện — hiểu ý từ ngôn ngữ tự nhiên, thực hiện bằng API nội bộ (Knowledge, Zalo, Cron). Không cần CEO gõ lệnh hay số.
```

- [ ] **Step 4: Remove `logs/evening-context.json` from workspace API whitelist docs (line 258)**

Change the whitelist line to remove `logs/evening-context.json`.

- [ ] **Step 5: Remove `logs/evening-context.json` from workspace API read whitelist in main.js**

Remove the regex `/^logs\/evening-context\.json$/` from the `ALLOWED` array in the `/api/workspace/read` handler.

### Task 15: Add prompt file existence to smoke test

**Files:**
- Modify: `electron/scripts/smoke-test.js`

- [ ] **Step 1: Add check in the "Workspace templates" section**

```js
for (const pf of ['evening-briefing.md', 'morning-briefing.md', 'weekly-report.md']) {
  const pp = path.join(__dirname, '..', 'prompts', pf);
  if (!fs.existsSync(pp)) fail(`prompt template missing: prompts/${pf}`);
  else ok(`prompt template ${pf}`);
}
```

- [ ] **Step 2: Run smoke tests**

Run: `node electron/scripts/smoke-test.js`
Expected: 0 failures, prompt template checks PASS

- [ ] **Step 3: Run context injection smoke test**

Run: `node electron/scripts/smoke-context-injection.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md electron/main.js electron/scripts/smoke-test.js
git commit -m "chore: remove 1-tap numbered commands, add natural-reply rule, smoke prompt templates"
```

---

## Verification

After all tasks:

1. `node electron/scripts/smoke-test.js` — 0 failures
2. `node electron/scripts/smoke-context-injection.js` — PASS
3. `ls electron/prompts/` — 3 .md files present
4. `grep "1-tap" AGENTS.md` — no matches
5. `grep "evening-context" electron/main.js` — no matches (except maybe comments)
6. `grep "ok 1" electron/main.js` — no matches
7. `grep "sessions.send" electron/main.js` — present in `sendToGatewaySession`
8. `grep "runCronViaSessionOrFallback" electron/main.js` — present in all cron handlers
