# Icon Rail Sidebar Redesign — Design Spec

## Goal

Replace the 12-item vertical sidebar with a 60px icon rail (6 items) + sub-tab bar. Reduces cognitive load, looks premium (Slack/Discord level), and groups related pages logically.

## Context

- **Current:** 220px sidebar with 12 items, 3 section headers. Too many items — CEO's eyes glaze over.
- **After:** 60px icon rail (6 items with tiny labels) + Chrome-style sub-tabs in content area for grouped pages.
- **Benchmark:** Slack (icon rail with labels), Discord (icon rail), Figma (icon rail + detail panel).
- **Constraint:** No page content changes. Only navigation wrapper changes.

## Architecture

### Files to modify

| File | Changes |
|------|---------|
| `electron/ui/dashboard.html` | Replace sidebar HTML + CSS + JS. Add sub-tab bar. Update `switchPage()`. |

No backend changes. No IPC changes. No preload changes. Pure frontend.

## Design

### Rail items (6)

| # | Lucide icon | Label (9px) | Pages inside | Sub-tabs? |
|---|-------------|-------------|--------------|-----------|
| 1 | `home` | Tổng quan | overview | No |
| 2 | `messages-square` | Chat | chat | No |
| 3 | `radio` | Kênh | telegram, zalo, facebook | Yes: Telegram · Zalo · Facebook |
| 4 | `library` | Nội dung | knowledge, image-assets, schedules | Yes: Tài liệu · Hình ảnh · Lịch |
| 5 | `settings` | Cấu hình | skills, persona-mix, google, 9router | Yes: Skills · Tính cách · Google · AI |
| 6 | (bottom) | — | theme toggle, app prefs | No (existing settings area) |

### Rail CSS

```css
.rail {
  width: 64px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
  flex-shrink: 0;
}
.rail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  border-radius: 8px;
  width: 56px;
  cursor: pointer;
  transition: background .15s;
  position: relative;
}
.rail-item:hover { background: var(--surface-hover, rgba(255,255,255,0.06)); }
.rail-item.active { background: var(--accent-soft, rgba(200,167,90,0.1)); }
.rail-item .rail-icon { /* Lucide SVG 18px */ }
.rail-item .rail-label {
  font-size: 9px;
  font-weight: 500;
  color: var(--text-muted);
  white-space: nowrap;
}
.rail-item.active .rail-label { color: var(--text); }
.rail-item.active .rail-icon svg { stroke: var(--text); }
```

### Status badge on "Kênh" icon

```css
.rail-badge {
  position: absolute;
  top: 3px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 2px solid var(--surface);
}
.rail-badge.online { background: #22c55e; }
.rail-badge.offline { background: #ef4444; }
```

Composite logic: both Telegram + Zalo ready → green. Any not ready → red.

### Sub-tab bar

Appears at top of content area for rail items 3-5. Hidden for items 1-2.

```css
.content-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  padding: 0 16px;
  flex-shrink: 0;
}
.content-tab {
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all .15s;
  display: flex;
  align-items: center;
  gap: 6px;
}
.content-tab:hover { color: var(--text); }
.content-tab.active {
  color: var(--text);
  font-weight: 600;
  border-bottom-color: var(--accent);
}
```

Each sub-tab has a small Lucide icon + label. Telegram/Zalo tabs also show inline status dot.

### Navigation logic

```javascript
// Rail groups define which pages belong to which rail item
const RAIL_GROUPS = {
  overview: { pages: ['overview'], tabs: null },
  chat:     { pages: ['chat'], tabs: null },
  channels: { pages: ['telegram','zalo','facebook'], tabs: [
    { page: 'telegram', icon: 'brand-telegram', label: 'Telegram' },
    { page: 'zalo', icon: 'brand-zalo', label: 'Zalo' },
    { page: 'facebook', icon: 'brand-facebook', label: 'Facebook' },
  ]},
  content:  { pages: ['knowledge','image-assets','schedules'], tabs: [
    { page: 'knowledge', icon: 'book-open', label: 'Tài liệu' },
    { page: 'image-assets', icon: 'image', label: 'Hình ảnh' },
    { page: 'schedules', icon: 'calendar', label: 'Lịch tự động' },
  ]},
  config:   { pages: ['skills','persona-mix','google','9router'], tabs: [
    { page: 'skills', icon: 'zap', label: 'Skills' },
    { page: 'persona-mix', icon: 'sparkles', label: 'Tính cách' },
    { page: 'google', icon: 'brand-google', label: 'Google' },
    { page: '9router', icon: 'cpu', label: 'AI Models' },
  ]},
};

function switchToRail(railId, subPage) {
  // 1. Highlight active rail item
  // 2. If group has tabs: render sub-tab bar, show first tab or subPage
  // 3. If no tabs: show page directly, hide sub-tab bar
  // 4. View Transition for content crossfade
}
```

`switchPage('telegram')` still works — it finds which rail group contains 'telegram', activates that rail item, shows sub-tabs, selects 'telegram' tab.

### Rail HTML

```html
<div class="rail">
  <div class="rail-logo">9B</div>
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
    <span class="rail-badge online" id="rail-badge-channels"></span>
  </div>
  <div class="rail-item" data-rail="content" onclick="switchToRail('content')">
    <span class="rail-icon" data-icon="library"></span>
    <span class="rail-label">Nội dung</span>
  </div>
  <div class="rail-item" data-rail="config" onclick="switchToRail('config')">
    <span class="rail-icon" data-icon="settings"></span>
    <span class="rail-label">Cấu hình</span>
  </div>
  <div style="flex:1"></div>
  <!-- Theme toggle + settings at bottom (existing) -->
</div>
```

### Sub-tab bar HTML (dynamic, rendered by JS)

```html
<div class="content-tabs" id="content-tabs" style="display:none">
  <!-- Populated by switchToRail() -->
</div>
```

### What stays the same

- All `.page` content divs — untouched
- `switchPage(page)` function — enhanced but backward-compatible
- View Transitions API — still wraps page switches
- Motion animations — still apply
- Channel status broadcast — still works (updates rail badge instead of sidebar dots)
- All IPC handlers — unchanged

### Icons to add to ICONS map

| Name | Needed for |
|------|-----------|
| `radio` | Kênh rail item |
| `library` | Nội dung rail item |
| `settings` | Cấu hình rail item |

### Responsive

- Min window width 1024px (unchanged)
- Rail always visible (64px)
- Content area gets remaining width
- Sub-tabs wrap on narrow windows

## Migration

- First load: sidebar replaced with rail. No data migration needed.
- `localStorage` keys for sidebar collapse state → irrelevant (removed)
- Guide system (`guideInit`) references sidebar items by `data-page` → update selectors to use rail items

## Out of Scope

- Drag-reorder rail items
- Custom rail item colors/badges
- Rail item context menus
- Persistent sub-tab memory (always opens first tab in group)
- Mobile/tablet layout

## Success Criteria

1. Rail shows 6 items with 9px labels — CEO knows what each item is without hovering
2. Clicking "Kênh" shows sub-tabs: Telegram · Zalo · Facebook
3. Channel status badge on "Kênh" icon (green/red composite)
4. Sub-tabs for Nội dung (Tài liệu · Hình ảnh · Lịch) and Cấu hình (Skills · Tính cách · Google · AI)
5. `switchPage('telegram')` still works from external callers (cron detail, guides)
6. All existing page content unchanged
7. View Transitions still work on page/tab switches
8. Dark + light themes correct via CSS variables
