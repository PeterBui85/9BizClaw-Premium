# ChatGPT Importer Tab — Design Spec

**Date:** 2026-05-22
**Status:** Draft

---

## Problem

ChatGPT session import is buried inside the 9Router page as a collapsible toggle button. Users don't discover it. The wizard has the same feature but only shows during onboarding. Need a dedicated, visible tab for post-setup import/re-import.

## Goal

Add a "ChatGPT Import" sub-tab to the `config` rail in Dashboard, next to "AI Models". Same functionality as the wizard fallback and existing 9Router panel — user pastes JSON from `chatgpt.com/api/auth/session`, system writes to 9router db.json, restarts 9router.

## What Already Exists (reuse, don't rebuild)

- **IPC handler:** `import-chatgpt-session` in `electron/lib/dashboard-ipc.js` (~line 5554)
- **Preload bridge:** `window.claw.importChatGPTSession(jsonString)` in `electron/preload.js`
- **Parse + UI logic:** Inside `dashboard.html` lines 6389-6453 — `toggleChatGPTImportPanel()`, JSON parse, JWT decode, status display, import button
- **3-strategy write:** API full → API minimal → direct db.json write + restart 9router

## Design

### Tab placement

Add to `RAIL_GROUPS.config` in dashboard.html:

```javascript
config: { pages: ['skills','persona-mix','chatgpt-import','9router','openclaw'], tabs: [
  { page: 'skills', icon: 'zap', label: 'Skills' },
  { page: 'persona-mix', icon: 'sparkles', label: 'Tính cách' },
  { page: 'chatgpt-import', icon: 'download', label: 'ChatGPT' },
  { page: '9router', icon: 'cpu', label: 'AI Models', action: 'openAiModelsBrowser' },
  { page: 'openclaw', icon: 'terminal', label: 'OpenClaw' },
]}
```

Position: between "Tính cách" and "AI Models". Label: "ChatGPT" (short, fits tab bar).

### Page HTML

New `<div class="page" id="page-chatgpt-import">` placed before `page-9router` in the DOM. Contains:

1. **Page header** — icon + title "Import tài khoản ChatGPT" + subtitle explaining purpose
2. **Instructions** — same 4-step instructions as existing panel (open chatgpt.com, go to auth/session URL, Ctrl+A/Ctrl+C, paste)
3. **Textarea** — paste area for JSON
4. **Status line** — shows email + plan type after parse, or error
5. **Import button** — calls existing `window.claw.importChatGPTSession()`
6. **Success state** — shows green confirmation, silently calls `reloadEmbed('9router')` in background so 9router page reflects new provider when user navigates there. No page redirect.

### JS logic

The existing IIFE (lines 6399-6453) binds to element IDs `dash-session-json`, `dash-session-status`, `dash-session-import-btn`. The new tab page uses different element IDs to avoid collision with the existing 9Router panel (which stays for backward compat):

- `chatgpt-tab-json` (textarea)
- `chatgpt-tab-status` (status line)
- `chatgpt-tab-import-btn` (button)

New self-contained IIFE with same parse logic, referencing new IDs. On success: show green status + "Import thành công" + silently `reloadEmbed('9router')`, no page redirect.

**NOTE:** All user-facing strings MUST use Vietnamese with full diacritics (à á ả ã ạ, ê, ô, ơ, ư, đ).

### Keyboard shortcut

Add to `commands` array:
```javascript
{ id: 'page-chatgpt-import', label: 'Mở ChatGPT Import', keywords: 'chatgpt import session' }
```

### What stays unchanged

- The existing collapsible panel in 9Router page stays (backward compat, users who know it)
- IPC handler, preload bridge, 3-strategy write — all unchanged
- No new backend code needed

## Files Changed

| File | Change |
|---|---|
| `electron/ui/dashboard.html` | Add page div, RAIL_GROUPS entry, tab entry, JS IIFE, keyboard shortcut |

## Verification

1. Open Dashboard > config rail > "ChatGPT" tab visible between "Tinh cach" and "AI Models"
2. Paste valid session JSON > shows email + plan type in green
3. Click "Import tai khoan" > shows "Dang import..." > shows success
4. Ctrl+K > type "chatgpt" > command appears
5. 9Router page > existing "Import ChatGPT" toggle still works independently
