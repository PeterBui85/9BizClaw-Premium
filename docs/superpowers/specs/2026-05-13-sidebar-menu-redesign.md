# Sidebar Menu Redesign

**Date:** 2026-05-13
**Status:** Approved
**File:** `electron/ui/dashboard.html`

## Goal

Reorganize sidebar from 3 flat sections into frequency-based layout: daily-use items at top, channels collapsible, content/automation/settings grouped logically. Structure accommodates future features (CRM, WhatsApp, TikTok, Workflow).

## Current → New Structure

**Current (3 sections, 15 items):**
- Điều khiển: Tổng quan, Chat, Lịch tự động, Tài liệu, Tài sản hình ảnh, Tính cách bot
- Kênh: Telegram, Zalo, Facebook, Google
- Cài đặt: AI Models, Cài đặt nâng cao, Giao diện, Ẩn xuống tray, Kiểm tra cập nhật

**New (5 groups, 14 items):**

### Top Level (no header, always visible)
| Item | data-page |
|------|-----------|
| Tổng quan | overview |
| Chat | chat |

### Kênh (collapsible, default expanded)
| Item | data-page | Note |
|------|-----------|------|
| Telegram | telegram | ready dot |
| Zalo | zalo | ready dot |
| Facebook | facebook | |
| Google | google | |

### Trợ lý AI (static header)
| Item | data-page |
|------|-----------|
| Tài liệu | knowledge |
| Tính cách bot | persona-mix |
| Tài sản hình ảnh | image-assets |
| AI Models | 9router |

### Tự động hóa (static header)
| Item | data-page |
|------|-----------|
| Lịch tự động | schedules |

### Cài đặt (static header)
| Item | data-page |
|------|-----------|
| Giao diện | theme |
| Nâng cao | advanced |
| Cập nhật | update |

## What Changed

- **Moved:** Tài liệu, Tính cách bot, Tài sản hình ảnh → "Trợ lý AI" group (was "Điều khiển")
- **Moved:** AI Models → "Trợ lý AI" group (was "Cài đặt")
- **Moved:** Lịch tự động → "Tự động hóa" group (was "Điều khiển")
- **Removed from sidebar:** "Ẩn xuống tray" toggle → moved into Cài đặt page content
- **Renamed header:** "Điều khiển" → removed (top items have no header)
- **Renamed header:** "Kênh" → kept, now collapsible
- **New header:** "Trợ lý AI", "Tự động hóa"

## What Didn't Change

- All existing `data-page` values and `switchPage()` targets unchanged
- Ready dot indicators for Telegram/Zalo unchanged
- Active page highlight (accent background + left border) unchanged
- Channel icon colors/styling unchanged — keep existing brand colors and icon states exactly as-is
- Page content unchanged — only sidebar order/grouping

## Collapsible Kênh Section

- Chevron icon (▸/▾) on the "Kênh" header
- Click toggles visibility of channel items
- State persisted in `localStorage['sidebar-channels-collapsed']`
- Default: expanded
- Only Kênh is collapsible — other groups have ≤4 items

## "Ẩn xuống tray" Toggle

Currently a sidebar item with inline toggle. Move into the existing Cài đặt/Giao diện page content as a toggle row below the theme picker. Same `localStorage` key and `ipcRenderer` call — only the DOM location changes. Not a sidebar menu item anymore.

## Future Feature Slots

When ready, add these items — no structural changes needed:
- **CRM** → after Chat in top level
- **WhatsApp** → in Kênh group after Facebook
- **TikTok** → in Kênh group after WhatsApp
- **Workflow** → in Tự động hóa group after Lịch tự động

Items not shown until feature is implemented. No disabled/placeholder items.

## CSS Changes

- `.sidebar-menu-header` → keep existing style for static headers
- `.sidebar-menu-header.collapsible` → add cursor:pointer, chevron icon
- `.sidebar-channel-items` → wrapper div for channel items, toggleable via `display:none`
- Top-level items (Tổng quan, Chat): no header above them, standard `.sidebar-menu-item`

## JS Changes

- `toggleChannelSection()` — new function: toggle collapse, persist to `localStorage['sidebar-channels-collapsed']`
- Add to existing `DOMContentLoaded` init: read localStorage, apply collapsed state on load. If the current active page is inside a collapsed group, force-expand that group (user must always see the active item).
- Remove "Ẩn xuống tray" toggle from sidebar markup
- Reorder existing `sidebar-menu-item` divs (no new pages, no new switchPage targets)

## Files Changed

| File | Change |
|------|--------|
| `electron/ui/dashboard.html` | Reorder sidebar items, add collapsible Kênh, move tray toggle to settings page, add CSS + JS |
