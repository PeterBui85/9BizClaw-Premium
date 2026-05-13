# Sidebar Menu Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize dashboard sidebar into frequency-based layout with collapsible channels section.

**Architecture:** Single-file change to `electron/ui/dashboard.html`. Reorder existing sidebar-menu-item divs, add new section headers, wrap channel items in a collapsible container with localStorage persistence. Move tray toggle from standalone sidebar item into the theme-mode-card.

**Tech Stack:** HTML, inline CSS, inline JS (Electron renderer)

**Spec:** `docs/superpowers/specs/2026-05-13-sidebar-menu-redesign.md`

---

## Chunk 1: Sidebar Restructure

### Task 1: Reorder sidebar HTML

**Files:**
- Modify: `electron/ui/dashboard.html:2574-2641` (sidebar-menu div)

The current sidebar-menu div contains 3 sections (Điều khiển, Kênh, Cài đặt). Replace its entire inner content with the new 5-group layout.

- [ ] **Step 1: Replace sidebar-menu inner HTML**

Replace lines 2575–2641 (everything inside `<div class="sidebar-menu">`) with:

```html
<!-- Top level — no header -->
<div class="sidebar-menu-item active" data-page="overview" onclick="switchPage('overview')">
  <span class="icon" data-icon="home"></span><span class="label">Tổng quan</span>
</div>
<div class="sidebar-menu-item" data-page="chat" onclick="switchPage('chat')">
  <span class="icon" data-icon="messages-square"></span><span class="label">Chat</span>
</div>

<!-- Kênh — collapsible -->
<div class="sidebar-menu-header collapsible" onclick="toggleChannelSection()">
  Kênh
  <span class="sidebar-chevron"></span>
</div>
<div class="sidebar-channel-items" id="sidebar-channel-items">
  <div class="sidebar-menu-item" data-page="telegram" onclick="switchPage('telegram')">
    <span class="icon" data-icon="brand-telegram"></span><span class="label">Telegram</span>
    <span class="ready-dot" id="ready-dot-telegram" data-state="checking" title="Đang kiểm tra..."></span>
  </div>
  <div class="sidebar-menu-item" data-page="zalo" onclick="switchPage('zalo')">
    <span class="icon" data-icon="brand-zalo"></span><span class="label">Zalo</span>
    <span class="ready-dot" id="ready-dot-zalo" data-state="checking" title="Đang kiểm tra..."></span>
  </div>
  <div class="sidebar-menu-item" data-page="facebook" onclick="switchPage('facebook')">
    <span class="icon" data-icon="brand-facebook"></span><span class="label">Facebook</span>
  </div>
  <div class="sidebar-menu-item" data-page="google" onclick="switchPage('google')">
    <span class="icon" data-icon="brand-google"></span><span class="label">Google</span>
  </div>
</div>

<!-- Trợ lý AI -->
<div class="sidebar-menu-header">Trợ lý AI</div>
<div class="sidebar-menu-item" data-page="knowledge" onclick="switchPage('knowledge')">
  <span class="icon" data-icon="book-open"></span><span class="label">Tài liệu</span>
</div>
<div class="sidebar-menu-item" data-page="persona-mix" onclick="switchPage('persona-mix')">
  <span class="icon" data-icon="sparkles"></span><span class="label">Tính cách bot</span>
</div>
<div class="sidebar-menu-item" data-page="image-assets" onclick="switchPage('image-assets')">
  <span class="icon" data-icon="image"></span><span class="label">Tài sản hình ảnh</span>
</div>
<div class="sidebar-menu-item" data-page="9router" onclick="openAiModelsBrowser()">
  <span class="icon" data-icon="cpu"></span><span class="label">AI Models</span>
</div>

<!-- Tự động hóa -->
<div class="sidebar-menu-header">Tự động hóa</div>
<div class="sidebar-menu-item" data-page="schedules" onclick="switchPage('schedules')">
  <span class="icon" data-icon="calendar"></span><span class="label">Lịch tự động</span>
</div>

<!-- Cài đặt -->
<div class="sidebar-menu-header">Cài đặt</div>
<div class="sidebar-menu-item theme-mode-card" title="Chọn giao diện sạch cho Dashboard">
  <div class="theme-mode-title">
    <span class="icon" id="theme-toggle-icon" data-icon="gem"></span>
    <span class="label" id="theme-toggle-label">Giao diện</span>
  </div>
  <div class="theme-mode-control" role="group" aria-label="Chọn giao diện">
    <button type="button" class="theme-mode-option" data-theme-mode="light" onclick="setThemeMode('light')">Sáng</button>
    <button type="button" class="theme-mode-option" data-theme-mode="dark" onclick="setThemeMode('dark')">Tối</button>
    <button type="button" class="theme-mode-option" data-theme-mode="system" onclick="setThemeMode('system')">Hệ thống</button>
  </div>
  <div class="theme-tray-toggle">
    <span style="color:var(--text-muted);font-size:12px;white-space:normal;line-height:1.3">Ẩn xuống tray khi mở</span>
    <label class="toggle-switch" style="margin-left:auto">
      <input type="checkbox" id="pref-start-minimized">
      <span class="toggle-slider"></span>
    </label>
  </div>
</div>
<div class="sidebar-menu-item" onclick="openAdvancedSettings()">
  <span class="icon" data-icon="settings-2"></span><span class="label">Nâng cao</span>
</div>
<div class="sidebar-menu-item" onclick="manualCheckUpdate()" id="check-update-btn" title="Kiểm tra cập nhật">
  <span class="icon" data-icon="refresh-cw"></span>
  <span class="label" id="check-update-label">Kiểm tra cập nhật</span>
</div>
```

Key changes from current markup:
- Removed "Điều khiển" header — top items (Tổng quan, Chat) have no header
- Kênh header gains `.collapsible` class + chevron span, channel items wrapped in `#sidebar-channel-items` div
- "Tài liệu", "Tính cách bot", "Tài sản hình ảnh" moved from Điều khiển → new "Trợ lý AI" section
- "AI Models" moved from Cài đặt → "Trợ lý AI" section
- "Lịch tự động" moved from Điều khiển → new "Tự động hóa" section
- "Ẩn xuống tray" toggle moved from standalone sidebar-menu-item into `.theme-tray-toggle` div inside theme-mode-card
- "Cài đặt nâng cao" label shortened to "Nâng cao"
- Removed inline `style="margin-top:2px"` from theme-mode-card, nâng cao, cập nhật (gap handled by parent flex)
- All `data-page` values, `onclick` handlers, `id` attributes, icon `data-icon` values, ready-dot markup UNCHANGED

- [ ] **Step 2: Verify no duplicate IDs or lost elements**

Run grep to confirm:
- `id="ready-dot-telegram"` appears exactly once
- `id="ready-dot-zalo"` appears exactly once
- `id="pref-start-minimized"` appears exactly once
- `id="check-update-btn"` appears exactly once
- All 10 `data-page` values present: overview, chat, telegram, zalo, facebook, google, knowledge, persona-mix, image-assets, schedules

---

### Task 2: Add collapsible CSS

**Files:**
- Modify: `electron/ui/dashboard.html` — add CSS after existing `.sidebar-menu-item.disabled:hover` rule (around line 687)

- [ ] **Step 1: Add collapsible styles**

Insert after the `.sidebar-menu-item.disabled:hover { background:transparent; }` line:

```css
.sidebar-menu-header.collapsible { cursor:pointer; display:flex; align-items:center; justify-content:space-between; user-select:none; }
.sidebar-menu-header.collapsible:hover { color:var(--text); }
.sidebar-chevron::after { content:'▾'; }
.sidebar-menu-header.collapsible.collapsed .sidebar-chevron::after { content:'▸'; }
.sidebar-channel-items.collapsed { display:none; }
.theme-tray-toggle { display:flex; align-items:center; gap:10px; padding-top:8px; margin-top:4px; border-top:1px solid var(--border); }
```

`.collapsed` class is toggled on BOTH `#sidebar-channel-items` AND `.sidebar-menu-header.collapsible` by `toggleChannelSection()`.

---

### Task 3: Add collapsible JS

**Files:**
- Modify: `electron/ui/dashboard.html` — add JS in the `<script>` section, near other sidebar/init code

- [ ] **Step 1: Add toggleChannelSection function**

Add near other sidebar-related functions (before or after `switchPage`):

```js
function toggleChannelSection() {
  const items = document.getElementById('sidebar-channel-items');
  const header = document.querySelector('.sidebar-menu-header.collapsible');
  if (!items || !header) return;
  const collapsed = !items.classList.contains('collapsed');
  items.classList.toggle('collapsed', collapsed);
  header.classList.toggle('collapsed', collapsed);
  try { localStorage.setItem('sidebar-channels-collapsed', collapsed ? '1' : ''); } catch(e) {}
}
```

- [ ] **Step 2: Add init logic to DOMContentLoaded**

Find the existing `DOMContentLoaded` listener (or the inline init block that runs on load) and add at the end:

```js
// Sidebar channel collapse — restore from localStorage
(function initSidebarCollapse() {
  const saved = localStorage.getItem('sidebar-channels-collapsed');
  if (saved === '1') {
    const items = document.getElementById('sidebar-channel-items');
    const header = document.querySelector('.sidebar-menu-header.collapsible');
    const channelPages = ['telegram', 'zalo', 'facebook', 'google'];
    const activeInChannels = channelPages.includes(currentPage);
    if (!activeInChannels && items && header) {
      items.classList.add('collapsed');
      header.classList.add('collapsed');
    }
  }
})();
```

This handles the force-expand edge case: if active page is a channel page, ignore saved collapsed state.

- [ ] **Step 3: Verify**

Open Dashboard in Electron:
1. All sidebar items visible in correct order and groups
2. Click "Kênh" header → channel items collapse, chevron changes to ▸
3. Click again → expands, chevron ▾
4. Collapse → restart Electron → channels still collapsed
5. Navigate to Telegram page → collapse should auto-expand (force-expand)
6. Theme card shows theme buttons + tray toggle below
7. All page navigation works (click each sidebar item)
8. Channel icons retain their original brand colors
9. Ready dots for Telegram/Zalo display correctly

- [ ] **Step 4: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "refactor: reorganize dashboard sidebar — frequency-based layout with collapsible channels"
```
