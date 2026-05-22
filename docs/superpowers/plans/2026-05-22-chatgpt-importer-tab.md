# ChatGPT Importer Tab — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated "ChatGPT" sub-tab to the config rail in Dashboard for importing ChatGPT session credentials.

**Architecture:** Single file change to `electron/ui/dashboard.html`. Reuses existing IPC handler (`import-chatgpt-session`), preload bridge (`importChatGPTSession`), and 3-strategy write logic. New page div + JS IIFE with separate element IDs to avoid collision with existing 9Router panel.

**Spec:** `docs/superpowers/specs/2026-05-22-chatgpt-importer-tab-design.md`

---

### Task 1: Add ChatGPT Importer tab to Dashboard

**Files:**
- Modify: `electron/ui/dashboard.html`

- [ ] **Step 1: Read dashboard.html to locate insertion points**

Read these sections:
- `RAIL_GROUPS` object (~line 4927) — add page + tab entry
- Before `page-9router` div (~line 3510) — insert new page div
- ChatGPT import JS logic (~line 6389) — reference for new IIFE
- Keyboard shortcuts `commands` array (~line 9493) — add entry

- [ ] **Step 2: Update RAIL_GROUPS**

In the `config` rail, add `'chatgpt-import'` to pages array and a new tab entry. Change:
```javascript
config:   { pages: ['skills','persona-mix','9router','openclaw'], tabs: [
  { page: 'skills', icon: 'zap', label: 'Skills' },
  { page: 'persona-mix', icon: 'sparkles', label: 'Tính cách' },
  { page: '9router', icon: 'cpu', label: 'AI Models', action: 'openAiModelsBrowser' },
  { page: 'openclaw', icon: 'terminal', label: 'OpenClaw' },
]},
```
To:
```javascript
config:   { pages: ['skills','persona-mix','chatgpt-import','9router','openclaw'], tabs: [
  { page: 'skills', icon: 'zap', label: 'Skills' },
  { page: 'persona-mix', icon: 'sparkles', label: 'Tính cách' },
  { page: 'chatgpt-import', icon: 'download', label: 'ChatGPT' },
  { page: '9router', icon: 'cpu', label: 'AI Models', action: 'openAiModelsBrowser' },
  { page: 'openclaw', icon: 'terminal', label: 'OpenClaw' },
]},
```

- [ ] **Step 3: Add page HTML**

Insert new page div BEFORE `<div class="page" id="page-9router">`. Use the existing import panel (lines 3521-3537) as reference but as a full page with different element IDs:

```html
      <div class="page" id="page-chatgpt-import">
        <div class="page-header">
          <span class="page-icon" data-icon="download" data-icon-size="26"></span>
          <div><h2>Import tài khoản ChatGPT</h2><div class="page-sub">Dán session JSON từ chatgpt.com để kết nối tài khoản ChatGPT Plus/Pro với bot</div></div>
        </div>
        <div style="padding:24px 28px;max-width:600px">
          <ol style="margin:0 0 16px;padding-left:20px;font-size:13px;line-height:1.8;color:var(--text-secondary)">
            <li>Mở <strong>chatgpt.com</strong> trên trình duyệt, đăng nhập bình thường</li>
            <li>Vào <a href="#" onclick="event.preventDefault(); window.claw.openExternal('https://chatgpt.com/api/auth/session')" style="color:var(--accent);text-decoration:underline;text-underline-offset:3px;cursor:pointer">chatgpt.com/api/auth/session</a></li>
            <li>Bấm <strong>Ctrl+A</strong> rồi <strong>Ctrl+C</strong></li>
            <li>Dán vào ô bên dưới</li>
          </ol>
          <textarea id="chatgpt-tab-json" rows="4" class="input" style="width:100%;font-family:monospace;font-size:12px;resize:vertical" placeholder="Dán nội dung JSON vào đây..."></textarea>
          <div id="chatgpt-tab-status" style="margin-top:8px;font-size:12px;min-height:18px"></div>
          <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
            <button id="chatgpt-tab-import-btn" class="btn btn-primary" disabled onclick="doChatGPTTabImport()">Import tài khoản</button>
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Add JS IIFE for the new tab**

Insert after the existing ChatGPT import IIFE (after line ~6453). New self-contained IIFE with same parse logic but using the new element IDs:

```javascript
    // ── ChatGPT session import (dedicated tab) ──
    (function() {
      let _parsed = null;
      document.addEventListener('DOMContentLoaded', () => {
        const ta = document.getElementById('chatgpt-tab-json');
        if (!ta) return;
        const st = document.getElementById('chatgpt-tab-status');
        const btn = document.getElementById('chatgpt-tab-import-btn');
        ta.addEventListener('input', () => {
          _parsed = null; btn.disabled = true; st.textContent = ''; st.style.color = '';
          let raw = ta.value.replace(/^\xEF\xBB\xBF/, '').replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '').trim();
          if (!raw) return;
          const first = raw.indexOf('{'); const last = raw.lastIndexOf('}');
          if (first >= 0 && last > first) raw = raw.substring(first, last + 1);
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
          } catch (err) {
            st.style.color = 'var(--danger)'; st.textContent = 'JSON không hợp lệ: ' + (err.message || '').substring(0, 80);
          }
        });
      });
      window.doChatGPTTabImport = async function() {
        if (!_parsed) return;
        const btn = document.getElementById('chatgpt-tab-import-btn');
        const st = document.getElementById('chatgpt-tab-status');
        btn.disabled = true;
        st.style.color = 'var(--text-tertiary)'; st.textContent = 'Đang import...';
        try {
          const res = await window.claw.importChatGPTSession(JSON.stringify(_parsed));
          if (res.success) {
            st.style.color = 'var(--success)';
            st.textContent = 'Import thành công — ' + res.email + (res.planType && res.planType !== 'unknown' ? ' (' + res.planType + ')' : '');
            btn.textContent = 'Đã import';
            try { reloadEmbed('9router'); } catch {}
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

- [ ] **Step 5: Add keyboard shortcut**

In the `commands` array (~line 9493), add after the `page-9router` entry:
```javascript
{ id: 'page-chatgpt-import', label: 'Mở ChatGPT Import', keywords: 'chatgpt import session' },
```

- [ ] **Step 6: Verify**

Open Dashboard > config rail > confirm "ChatGPT" tab visible between "Tính cách" and "AI Models". Click it > page shows import form. Paste test JSON > should parse and show email.
