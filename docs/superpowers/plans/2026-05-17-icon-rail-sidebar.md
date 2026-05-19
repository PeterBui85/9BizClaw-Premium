# Icon Rail Sidebar — Implementation Plan (v2, post-review)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 12-item 220px sidebar with a 64px icon rail (6 items + tiny labels) and Chrome-style sub-tabs for grouped pages.

**Architecture:** Pure frontend change in dashboard.html. Replace sidebar HTML with rail. Migrate bot controls (toggle, status, version, update) into rail header. Move settings into Cấu hình sub-tab. Add sub-tab bar for grouped pages. Rewrite `switchPage()` to route through rail groups.

**Tech Stack:** HTML, CSS, vanilla JS. Existing Lucide icon system. Existing CSS variables.

**Spec:** `docs/superpowers/specs/2026-05-17-icon-rail-sidebar-design.md`

---

## Critical Migration Targets (from review)

These sidebar elements MUST have new homes in the rail layout:

| Element | Current location | New location |
|---------|-----------------|-------------|
| `#status-dot` + `#status-text` | Sidebar header | Rail: small dot on logo, tooltip shows text |
| `#toggle-btn` (start/stop bot) | Sidebar below status | Rail: click logo to toggle, or small button below logo |
| `#sidebar-version` | Brand text area | Rail: tooltip on logo hover "9BizClaw v2.4.4" |
| `#update-banner` | Brand text area | Rail: orange dot on logo when update available + notification on click |
| Theme 3-way control | Sidebar "Cài đặt" section | Cấu hình sub-tab: new "Giao diện" sub-tab, or popover from rail bottom |
| Tray toggle (`#pref-start-minimized`) | Sidebar "Cài đặt" | Cấu hình → Giao diện sub-tab |
| "Nâng cao" button | Sidebar "Cài đặt" | Cấu hình sub-tab |
| "Kiểm tra cập nhật" | Sidebar "Cài đặt" | Cấu hình sub-tab |
| `#gateway-token-box` | Sidebar bottom | Keep as-is but move to main-content area (it's a floating panel) |

## JS References to Update (from review)

| Code | Line | What to fix |
|------|------|------------|
| `switchPage()` queries `.sidebar-menu-item` | ~5192 | Replace with rail-item active toggle |
| `_updateSidebarIndicator()` | ~5107 | Remove entirely (rail has no sliding indicator) |
| Ctrl+1-9 shortcut queries `.sidebar-menu-item[data-page]` | ~9424 | Query `.rail-item[data-rail]` instead |
| `WALKTHROUGH_STEPS` targets `.sidebar-logo`, `[data-page=*]` | ~8962-8994 | Update to `.rail-logo`, `[data-rail=*]` |
| `sidebar-channels-collapsed` localStorage restore | ~6376 | Remove dead code |
| `applyChannelStatus` sets `ready-dot-telegram/zalo` | ~7811 | Keep IDs, also update rail badge |
| `openAiModelsBrowser()` on 9router | ~2779 | Keep external browser behavior via special-case in sub-tab click |
| Google `switchPage` wrapper | ~11061 | Test compatibility with new switchToRail flow |

## Missing Pages in RAIL_GROUPS (from review)

| Page | Decision |
|------|----------|
| `page-openclaw` | Add to `config` group as 5th sub-tab "OpenClaw" |
| `page-shop-state` | Hidden page — handle in switchPage fallback |
| `page-calendar` | Hidden page — handle in switchPage fallback |

---

## RAIL_GROUPS (updated)

```javascript
const RAIL_GROUPS = {
  overview: { pages: ['overview'], tabs: null },
  chat:     { pages: ['chat'], tabs: null },
  channels: { pages: ['telegram','zalo','facebook'], tabs: [
    { page: 'telegram', icon: 'brand-telegram', label: 'Telegram', statusId: 'ready-dot-telegram' },
    { page: 'zalo', icon: 'brand-zalo', label: 'Zalo', statusId: 'ready-dot-zalo' },
    { page: 'facebook', icon: 'brand-facebook', label: 'Facebook' },
  ]},
  content:  { pages: ['knowledge','image-assets','schedules'], tabs: [
    { page: 'knowledge', icon: 'book-open', label: 'Tài liệu' },
    { page: 'image-assets', icon: 'image', label: 'Hình ảnh' },
    { page: 'schedules', icon: 'calendar', label: 'Lịch tự động' },
  ]},
  config:   { pages: ['skills','persona-mix','google','9router','openclaw'], tabs: [
    { page: 'skills', icon: 'zap', label: 'Skills' },
    { page: 'persona-mix', icon: 'sparkles', label: 'Tính cách' },
    { page: 'google', icon: 'brand-google', label: 'Google' },
    { page: '9router', icon: 'cpu', label: 'AI Models', action: 'openAiModelsBrowser' },
    { page: 'openclaw', icon: 'terminal', label: 'OpenClaw' },
  ]},
};
```

## Rail HTML (updated with migrated elements)

```html
<div class="rail" id="main-rail">
  <!-- Logo + bot status -->
  <div class="rail-header">
    <div class="rail-logo" id="rail-logo" onclick="toggleBot()" title="9BizClaw v—">
      9B
      <span class="rail-status-dot stopped" id="status-dot"></span>
    </div>
    <div id="update-banner-rail" style="display:none" onclick="startUpdate()">
      <span class="rail-update-dot"></span>
    </div>
  </div>

  <!-- Nav items -->
  <div class="rail-item active" data-rail="overview" onclick="switchToRail('overview')">
    <span class="rail-icon" data-icon="home"></span>
    <span class="rail-label">Tổng quan</span>
  </div>
  <div class="rail-item" data-rail="chat" onclick="switchToRail('chat')">
    <span class="rail-icon" data-icon="messages-square"></span>
    <span class="rail-label">Chat</span>
  </div>
  <div class="rail-item" data-rail="channels" onclick="switchToRail('channels')">
    <span class="rail-icon" data-icon="radio"></span>
    <span class="rail-label">Kênh</span>
    <span class="rail-badge checking" id="rail-badge-channels"></span>
  </div>
  <div class="rail-item" data-rail="content" onclick="switchToRail('content')">
    <span class="rail-icon" data-icon="library"></span>
    <span class="rail-label">Nội dung</span>
  </div>
  <div class="rail-item" data-rail="config" onclick="switchToRail('config')">
    <span class="rail-icon" data-icon="settings"></span>
    <span class="rail-label">Cấu hình</span>
  </div>

  <div class="rail-spacer"></div>

  <!-- Settings area (bottom) -->
  <div class="rail-bottom">
    <div class="rail-theme-btns">
      <button class="rail-theme-btn" data-theme-mode="light" onclick="setThemeMode('light')" title="Sáng">☀</button>
      <button class="rail-theme-btn" data-theme-mode="dark" onclick="setThemeMode('dark')" title="Tối">🌙</button>
      <button class="rail-theme-btn" data-theme-mode="system" onclick="setThemeMode('system')" title="Hệ thống">💻</button>
    </div>
    <div class="rail-version" id="sidebar-version">v—</div>
  </div>
</div>
```

Note: Theme buttons use text symbols (not emoji — replace with mini Lucide icons: `sun`, `moon`, `monitor`). Version reuses same ID `sidebar-version` for backward compat with existing JS.

## Execution Order

1. Add missing icons (`radio`, `library`, `terminal`)
2. Write rail CSS + sub-tab CSS (keep old sidebar CSS temporarily)
3. Replace sidebar HTML with rail HTML (migrate all elements)
4. Add sub-tab bar `<div>` before first `.page`
5. Add `RAIL_GROUPS` + `switchToRail()` + `switchSubTab()`
6. Update `switchPage()` body: remove `.sidebar-menu-item` queries, add rail-group auto-resolve
7. Remove `_updateSidebarIndicator()` calls
8. Update Ctrl+1-9 handler to use `[data-rail]`
9. Update `WALKTHROUGH_STEPS` targets
10. Update `applyChannelStatus` to also set rail badge
11. Move `#gateway-token-box` outside sidebar (into main-content)
12. Remove dead sidebar CSS + JS
13. Smoke test + manual verify
