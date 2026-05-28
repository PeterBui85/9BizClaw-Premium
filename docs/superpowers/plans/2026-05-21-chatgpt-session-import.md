# ChatGPT Session Import — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fallback login for 9router when ChatGPT OAuth OTP fails. User pastes JSON from `chatgpt.com/api/auth/session` → app writes to 9router db.json → restarts 9router.

**Architecture:** Single IPC handler `import-chatgpt-session` shared by wizard (step 2 fallback) and dashboard (9Router page). Direct db.json write + 9router restart. No combo creation — wizard user clicks existing "Kiểm tra kết nối" after import.

**Tech Stack:** Electron IPC, Node.js `fs`/`path`/`crypto`, base64url JWT decode

---

## Task 1: IPC Handler — `import-chatgpt-session`

**Files:**
- Modify: `electron/lib/dashboard-ipc.js:5549` (add before closing brace of `registerAllIpcHandlers`)

- [ ] **Step 1: Add the IPC handler**

Add before the closing `}` of `registerAllIpcHandlers()` (~line 5549 in `dashboard-ipc.js`). Uses `appDataDir` (already imported at line 24), `stop9Router`/`start9Router` (already imported at line 38), `fs`/`path`/`crypto` (already available).

```js
  // ── ChatGPT session import (fallback when OAuth OTP fails) ──
  ipcMain.handle('import-chatgpt-session', async (_event, { sessionJson }) => {
    try {
      let session;
      try { session = JSON.parse(sessionJson); } catch { return { success: false, error: 'JSON không hợp lệ — hãy copy toàn bộ nội dung từ chatgpt.com/api/auth/session' }; }

      const accessToken = session.accessToken;
      if (!accessToken || typeof accessToken !== 'string' || accessToken.length < 50) {
        return { success: false, error: 'Thiếu accessToken — hãy copy toàn bộ nội dung trang, không chỉ một phần' };
      }

      // Decode JWT payload (base64url, no signature verification)
      let jwtPayload = {};
      try {
        const parts = accessToken.split('.');
        if (parts.length === 3) jwtPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
      } catch { /* non-JWT token — proceed without metadata */ }

      const authClaims = jwtPayload['https://api.openai.com/auth'] || {};
      const profileClaims = jwtPayload['https://api.openai.com/profile'] || {};
      const email = session.user?.email || profileClaims.email || '';
      if (!email) return { success: false, error: 'Không tìm thấy email trong session — JSON có thể không đúng định dạng' };

      const planType = authClaims.chatgpt_plan_type || 'unknown';
      const expiresIn = (jwtPayload.exp && jwtPayload.iat) ? (jwtPayload.exp - jwtPayload.iat) : 864000;

      const entry = {
        id: crypto.randomUUID(),
        provider: 'codex',
        authType: 'oauth',
        name: email,
        priority: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        email,
        accessToken,
        refreshToken: session.refreshToken || null,
        expiresAt: session.expires || (jwtPayload.exp ? new Date(jwtPayload.exp * 1000).toISOString() : null),
        idToken: null,
        testStatus: 'active',
        expiresIn,
        providerSpecificData: {
          chatgptAccountId: authClaims.chatgpt_account_id || null,
          chatgptPlanType: planType,
        },
        lastUsedAt: null,
        consecutiveUseCount: 0,
        lastError: null,
        errorCode: null,
        lastErrorAt: null,
        backoffLevel: 0,
      };

      // Read + initialize db.json (same template as setup-9router-auto ~line 568)
      const dbPath = path.join(appDataDir(), '9router', 'db.json');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      let db = {};
      if (fs.existsSync(dbPath)) {
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf-8')); } catch { db = {}; }
      }
      if (!Array.isArray(db.providerConnections)) db.providerConnections = [];
      if (!Array.isArray(db.combos)) db.combos = [];
      if (!Array.isArray(db.apiKeys)) db.apiKeys = [];
      if (!db.settings) db.settings = {};
      if (!Array.isArray(db.providerNodes)) db.providerNodes = [];
      if (!db.proxyPools) db.proxyPools = [];
      if (!db.modelAliases) db.modelAliases = {};
      if (!db.mitmAlias) db.mitmAlias = {};
      if (!db.pricing) db.pricing = {};

      // Replace existing codex provider with same email, or append
      const existingIdx = db.providerConnections.findIndex(p => p.provider === 'codex' && p.email === email);
      if (existingIdx >= 0) {
        const existing = db.providerConnections[existingIdx];
        entry.id = existing.id;
        entry.createdAt = existing.createdAt;
        entry.priority = existing.priority;
        db.providerConnections[existingIdx] = entry;
      } else {
        const maxPriority = db.providerConnections.reduce((m, p) => Math.max(m, p.priority || 0), 0);
        entry.priority = maxPriority + 1;
        db.providerConnections.push(entry);
      }

      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');

      // Restart 9router to pick up new config
      try {
        stop9Router();
        await new Promise(r => setTimeout(r, 1200));
        start9Router();
      } catch (e) { console.warn('[import-chatgpt] 9router restart warning:', e?.message); }

      return { success: true, email, planType };
    } catch (e) {
      console.error('[import-chatgpt-session]', e);
      return { success: false, error: 'Không ghi được cấu hình 9router: ' + (e?.message || String(e)) };
    }
  });
```

- [ ] **Step 2: Verify handler compiles**

Run: `node -e "require('./electron/lib/dashboard-ipc.js')"` — should not throw. (May warn about missing Electron context, but no syntax errors.)

- [ ] **Step 3: Commit**

```bash
git add electron/lib/dashboard-ipc.js
git commit -m "feat: add import-chatgpt-session IPC handler — direct db.json write"
```

---

## Task 2: Preload Bridge

**Files:**
- Modify: `electron/preload.js:34` (add after `setup9RouterAuto` line)

- [ ] **Step 1: Add bridge**

After line 34 (`setup9RouterAuto: (opts) => ipcRenderer.invoke('setup-9router-auto', opts),`), add:

```js
  importChatGPTSession: (sessionJson) => ipcRenderer.invoke('import-chatgpt-session', sessionJson),
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.js
git commit -m "feat: add importChatGPTSession preload bridge"
```

---

## Task 3: Wizard Step 2 — Fallback Import UI

**Files:**
- Modify: `electron/ui/wizard.html:1308` (after closing `</div>` of instruction card #1, before instruction card #2)

- [ ] **Step 1: Add collapsible fallback panel HTML**

Insert after line 1308 (`</div>` closing instruction card #1), before line 1310 (`<div class="wz-instruction">` for card #2):

```html
            <!-- Fallback: paste ChatGPT session JSON when OAuth fails -->
            <div style="padding-left:40px;margin-bottom:16px">
              <a href="#" id="session-import-toggle" onclick="event.preventDefault(); document.getElementById('session-import-panel').classList.toggle('wz-hidden'); this.textContent = document.getElementById('session-import-panel').classList.contains('wz-hidden') ? 'Đăng nhập không được?' : 'Ẩn hướng dẫn import'" style="font-size:13px;color:var(--text-tertiary);text-decoration:underline;text-underline-offset:3px">Đăng nhập không được?</a>
              <div id="session-import-panel" class="wz-hidden" style="margin-top:12px">
                <div class="wz-instruction" style="margin-bottom:0">
                  <div class="wz-instruction-head">
                    <div class="wz-instruction-num" style="background:var(--warning);color:var(--bg)">!</div>
                    <div class="wz-instruction-title">Import thủ công</div>
                  </div>
                  <div class="wz-instruction-body">
                    <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;color:var(--text-secondary)">
                      <li>Mở <strong>chatgpt.com</strong> trên trình duyệt, đăng nhập bình thường</li>
                      <li>Vào địa chỉ <code style="background:var(--surface);padding:1px 6px;border-radius:4px;user-select:all">chatgpt.com/api/auth/session</code></li>
                      <li>Bấm <strong>Ctrl+A</strong> rồi <strong>Ctrl+C</strong> (copy toàn bộ)</li>
                      <li>Quay lại đây, dán vào ô bên dưới</li>
                    </ol>
                    <textarea id="session-json-input" rows="4" class="wz-input" style="margin-top:12px;font-family:monospace;font-size:12px;resize:vertical" placeholder='Dán nội dung JSON vào đây...'></textarea>
                    <div id="session-import-status" style="margin-top:8px;font-size:12px;min-height:18px"></div>
                    <button id="session-import-btn" class="wz-btn wz-btn-primary" type="button" disabled style="margin-top:10px" onclick="doSessionImport()">Import tài khoản</button>
                  </div>
                </div>
              </div>
            </div>
```

- [ ] **Step 2: Add JS handlers**

Add after the `verifyChatGPTConnection()` function (~line 2045 in wizard.html):

```js
      // ── ChatGPT session import (fallback) ──
      (function() {
        const textarea = document.getElementById('session-json-input');
        const status = document.getElementById('session-import-status');
        const btn = document.getElementById('session-import-btn');
        let _parsedSession = null;

        textarea.addEventListener('input', function() {
          _parsedSession = null;
          btn.disabled = true;
          status.textContent = '';
          status.style.color = '';
          const raw = textarea.value.trim();
          if (!raw) return;
          try {
            const s = JSON.parse(raw);
            if (!s.accessToken || typeof s.accessToken !== 'string' || s.accessToken.length < 50) {
              status.style.color = 'var(--danger)';
              status.textContent = 'Thiếu accessToken — hãy copy toàn bộ nội dung trang';
              return;
            }
            // Extract email + plan from JWT
            let email = s.user?.email || '';
            let plan = '';
            try {
              const parts = s.accessToken.split('.');
              if (parts.length === 3) {
                const p = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
                const auth = p['https://api.openai.com/auth'] || {};
                const profile = p['https://api.openai.com/profile'] || {};
                if (!email) email = profile.email || '';
                plan = auth.chatgpt_plan_type || '';
              }
            } catch {}
            if (!email) {
              status.style.color = 'var(--danger)';
              status.textContent = 'Không tìm thấy email trong session';
              return;
            }
            _parsedSession = s;
            btn.disabled = false;
            status.style.color = 'var(--success)';
            status.innerHTML = esc(email) + (plan ? ' (' + esc(plan) + ')' : '');
          } catch {
            status.style.color = 'var(--danger)';
            status.textContent = 'JSON không hợp lệ';
          }
        });

        window.doSessionImport = async function() {
          if (!_parsedSession) return;
          btn.disabled = true;
          btn.classList.add('loading');
          try {
            const res = await window.claw.importChatGPTSession(JSON.stringify(_parsedSession));
            if (res.success) {
              status.style.color = 'var(--success)';
              status.innerHTML = '&#10003; Import thành công — ' + esc(res.email) + (res.planType && res.planType !== 'unknown' ? ' (' + esc(res.planType) + ')' : '');
              document.getElementById('session-import-panel').classList.add('wz-hidden');
              document.getElementById('session-import-toggle').textContent = 'Đăng nhập không được?';
              showError(''); // clear any previous errors
              const result = document.getElementById('router-auto-result');
              result.classList.remove('wz-hidden');
              result.className = 'wz-alert success';
              result.innerHTML = '<span style="flex-shrink:0;margin-top:1px">' + icon('check',18) + '</span><div><strong>Import thành công.</strong> Nhấn "Kiểm tra kết nối" bên dưới để tiếp tục.</div>';
            } else {
              status.style.color = 'var(--danger)';
              status.textContent = res.error || 'Import thất bại';
              btn.disabled = false;
            }
          } catch (e) {
            status.style.color = 'var(--danger)';
            status.textContent = e.message || 'Lỗi import';
            btn.disabled = false;
          }
          btn.classList.remove('loading');
        };
      })();
```

- [ ] **Step 3: Test in dev**

Run the app (`RUN.bat` or `npm start`). In wizard step 2:
1. Click "Đăng nhập không được?" → panel expands
2. Paste valid session JSON → shows email + plan in green
3. Click "Import tài khoản" → success message + panel collapses
4. Click "Kiểm tra kết nối" → should detect the imported provider

- [ ] **Step 4: Commit**

```bash
git add electron/ui/wizard.html
git commit -m "feat: wizard step 2 — ChatGPT session import fallback UI"
```

---

## Task 4: Dashboard 9Router Page — Import Button + Panel

**Files:**
- Modify: `electron/ui/dashboard.html:3514` (add button in header) and `~3519` (add collapsible panel)

- [ ] **Step 1: Add import button to page header**

In `dashboard.html`, line 3514 — inside the header `<div style="margin-left:auto;...">`, add a new button before the help button:

```html
            <button class="btn btn-secondary btn-small" id="chatgpt-import-toggle-btn" onclick="toggleChatGPTImportPanel()" style="display:inline-flex;align-items:center;gap:6px"><span data-icon="download" data-icon-size="14"></span>Import ChatGPT</button>
```

- [ ] **Step 2: Add collapsible import panel**

After line 3519 (closing `</div>` of page-header), before line 3520 (`<div class="embed-wrap"`):

```html
        <div id="chatgpt-import-panel" class="hide" style="padding:16px 20px;background:var(--surface-alt, var(--surface));border-bottom:1px solid var(--border)">
          <div style="max-width:560px">
            <h4 style="margin:0 0 10px;font-size:14px;font-weight:600;color:var(--text)">Import tài khoản ChatGPT</h4>
            <ol style="margin:0 0 12px;padding-left:20px;font-size:13px;line-height:1.7;color:var(--text-secondary)">
              <li>Mở <strong>chatgpt.com</strong> trên trình duyệt, đăng nhập bình thường</li>
              <li>Vào <code style="background:var(--bg);padding:1px 6px;border-radius:4px;user-select:all">chatgpt.com/api/auth/session</code></li>
              <li>Bấm <strong>Ctrl+A</strong> rồi <strong>Ctrl+C</strong></li>
              <li>Dán vào ô bên dưới</li>
            </ol>
            <textarea id="dash-session-json" rows="3" class="input" style="width:100%;font-family:monospace;font-size:12px;resize:vertical" placeholder="Dán nội dung JSON vào đây..."></textarea>
            <div id="dash-session-status" style="margin-top:6px;font-size:12px;min-height:18px"></div>
            <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
              <button id="dash-session-import-btn" class="btn btn-primary btn-small" disabled onclick="doDashSessionImport()">Import tài khoản</button>
              <button class="btn btn-secondary btn-small" onclick="toggleChatGPTImportPanel()">Hủy</button>
            </div>
          </div>
        </div>
```

- [ ] **Step 3: Add JS handlers**

Add in the `<script>` section of dashboard.html (near other 9Router-related functions):

```js
    // ── ChatGPT session import (dashboard) ──
    function toggleChatGPTImportPanel() {
      const panel = document.getElementById('chatgpt-import-panel');
      panel.classList.toggle('hide');
      if (!panel.classList.contains('hide')) {
        document.getElementById('dash-session-json').value = '';
        document.getElementById('dash-session-status').textContent = '';
        document.getElementById('dash-session-import-btn').disabled = true;
      }
    }
    (function() {
      let _parsed = null;
      document.addEventListener('DOMContentLoaded', () => {
        const ta = document.getElementById('dash-session-json');
        if (!ta) return;
        const st = document.getElementById('dash-session-status');
        const btn = document.getElementById('dash-session-import-btn');
        ta.addEventListener('input', () => {
          _parsed = null; btn.disabled = true; st.textContent = ''; st.style.color = '';
          const raw = ta.value.trim();
          if (!raw) return;
          try {
            const s = JSON.parse(raw);
            if (!s.accessToken || typeof s.accessToken !== 'string' || s.accessToken.length < 50) {
              st.style.color = 'var(--danger)'; st.textContent = 'Thiếu accessToken'; return;
            }
            let email = s.user?.email || '';
            let plan = '';
            try {
              const parts = s.accessToken.split('.');
              if (parts.length === 3) {
                const p = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
                email = email || (p['https://api.openai.com/profile'] || {}).email || '';
                plan = (p['https://api.openai.com/auth'] || {}).chatgpt_plan_type || '';
              }
            } catch {}
            if (!email) { st.style.color = 'var(--danger)'; st.textContent = 'Không tìm thấy email'; return; }
            _parsed = s; btn.disabled = false;
            st.style.color = 'var(--success)'; st.textContent = email + (plan ? ' (' + plan + ')' : '');
          } catch { st.style.color = 'var(--danger)'; st.textContent = 'JSON không hợp lệ'; }
        });
      });
      window.doDashSessionImport = async function() {
        if (!_parsed) return;
        const btn = document.getElementById('dash-session-import-btn');
        const st = document.getElementById('dash-session-status');
        btn.disabled = true;
        st.style.color = 'var(--text-tertiary)'; st.textContent = 'Đang import...';
        try {
          const res = await window.claw.importChatGPTSession(JSON.stringify(_parsed));
          if (res.success) {
            st.style.color = 'var(--success)'; st.textContent = 'Import thành công — ' + res.email + (res.planType && res.planType !== 'unknown' ? ' (' + res.planType + ')' : '');
            setTimeout(() => { toggleChatGPTImportPanel(); reloadEmbed('9router'); }, 1500);
          } else {
            st.style.color = 'var(--danger)'; st.textContent = res.error || 'Import thất bại';
            btn.disabled = false;
          }
        } catch (e) {
          st.style.color = 'var(--danger)'; st.textContent = e.message || 'Lỗi import';
          btn.disabled = false;
        }
      };
    })();
```

- [ ] **Step 4: Test in dev**

Run the app. Go to Dashboard → 9Router tab:
1. Click "Import ChatGPT" button → panel slides down
2. Paste valid session JSON → email shows in green
3. Click "Import tài khoản" → success → panel closes → webview reloads
4. Click "Hủy" → panel closes without action

- [ ] **Step 5: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat: dashboard 9Router page — ChatGPT session import panel"
```
