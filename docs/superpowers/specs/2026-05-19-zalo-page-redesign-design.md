# Zalo Page Redesign — Filtered Segments + Visual Hierarchy

## Problem

The Zalo management page shows 112 groups and 451 friends in flat lists with equal visual weight. Every item has a red "Tat" badge (noise when 100% share the same state), 5 interactive controls per row, and no way to quickly see what's active. CEO visits this page weekly to review and toggle specific items — the page should be optimized for scanning 20-50 active items, not scrolling through 500+.

## Design Summary

**Approach B: Filtered Segments.** Add segment tabs per column (`Dang bat` | `Tat ca` | `Noi bo`), default to "Dang bat" showing only active items. Simplify per-row controls. Remove visual noise from inactive state.

## Changes

### 1. Segment Tabs

Each column (Groups, Friends) gets a 3-tab segment control below the column header:

| Tab | Shows | Count badge |
|-----|-------|-------------|
| **Dang bat** (default) | Only active groups/friends | Active count |
| **Tat ca** | All items, active on top, divider, inactive below at 45% opacity | Total count |
| **Noi bo** | Only internal-flagged items | Internal count |

**Tab styling:** Reuse the existing `.gw-tab` underline pattern (border-bottom:2px) rather than introducing a new pill-segment component. Active tab gets `border-bottom: 2px solid var(--accent)` + white text. Counts shown inline as small secondary text.

**State persistence:** Local JS variable per column. Always resets to "Dang bat" on page load — no disk/config persistence needed.

**"Tat ca" tab layout:** Active items sorted to top. Visual divider line with text "Da tat" separates active from inactive. Inactive rows rendered at reduced opacity (see Section 5). Two separate pagination counters: one for the active section, one for the inactive section. Each section loads 30 items/batch independently with its own "Xem them" button.

**Search behavior:** Search query is cleared on tab switch. This prevents confusing zero-result states when a query matches items in one tab but not another.

**Tab switch transitions:** List content fades in with `opacity 0→1` over 150ms on tab change. Scroll position resets to top.

### 2. Column Header

Current: `Nhom 112` with separate bulk buttons.
New: `Nhom` **112** `· 28 bat` — total count in bold/larger weight, active count in green smaller weight. Visual hierarchy distinguishes universe (112) from filtered subset (28). No bulk action buttons in header.

**Bulk actions relocated:** Inside the "Tat ca" tab, small text links "Bat tat ca" / "Tat tat ca" appear below the search bar for both groups and friends columns. Not in the default "Dang bat" view (where they're meaningless — everything shown is already active).

### 3. Row Card Redesign — Groups

**Remove:**
- Red "Tat" badge (default state = no badge)
- Existing `zc-badge` element (mode is now visible via pill selector — badge is redundant)
- "Noi bo" checkbox

**Keep/change:**
- Left border color: green (`all` mode), yellow (`mention` mode), none (off)
- Avatar + name + member count meta line (unchanged)
- **Mode selector:** Dropdown replaced with inline pill group showing all 3 states: `Tat | @mention | Moi tin`. Current state highlighted with color fill. One-click to switch via `onclick="setGroupMode(groupId, 'mention')"` (pass mode as string argument, not `this.value`). Labels match existing Vietnamese UI vocabulary. Compact sizing: each pill ~40px, total ~130px. On windows <1400px wide, pill labels shorten to `X | @ | M`.
- **"Noi bo" tag:** Purple "NB" tag inline with name text. Minimum click target 24x20px (padded beyond visual bounds). `onclick="updateGroupInternal(groupId, !current)"`. Replaces checkbox.
- **Memory button:** Compact icon button, only rendered when group has memory content.

### 4. Row Card Redesign — Friends

**Remove:**
- Red "Tat" badge
- "Noi bo" checkbox

**Keep/change:**
- Left border color: green (enabled), none (disabled)
- Avatar + name + last-message-time meta line
- **Toggle switch:** Stays as-is (on/off is binary for friends)
- **"Noi bo" tag:** Same purple "NB" inline tag as groups
- **Memory button:** Same compact icon, only when content exists

### 5. Inactive Row Treatment

In the "Tat ca" tab only:
- Inactive rows render at 55% opacity (not 45% — dark theme needs higher floor for WCAG readability)
- Hover raises to 80% opacity
- No left border color
- Memory button still shown if content exists (CEO may need to review memory of inactive groups/friends)
- Mode pill selector still functional (can re-enable from inactive state)

In the "Dang bat" tab: inactive rows not rendered at all.

In the "Noi bo" tab: all internal-flagged items shown at full opacity regardless of active/inactive state. This avoids the same item looking different across tabs.

**Row disappearance on state change:** When a mode change causes a row to leave the current tab's filter (e.g., setting a group to "Tat" while on "Dang bat"), the row fades out over 300ms, then is removed from DOM. A brief toast confirms the action: "Da tat [group name]". The row is immediately visible in the "Tat ca" tab if CEO switches.

### 6. Toolbar Cleanup

Current toolbar has 5 dropdowns in a flat row. No change to controls, but improve grouping:

- Toggle switch (master on/off) — leftmost, separated by vertical divider
- Labeled groups: each dropdown gets uppercase 10px label above it
- Existing controls: Che do, Nguoi la, Nhom moi, Gop tin — unchanged

### 7. Warning Banner

Yellow "Tat ca ban be da tat" banner: trigger unchanged (shown when active friend count = 0). Appears above the split columns, below toolbar.

### 8. Empty States

- "Dang bat" tab with 0 active items: centered message "Chua bat nhom/ban be nao. Chuyen sang tab 'Tat ca' de bat."
- "Noi bo" tab with 0 internal items: centered message "Chua danh dau noi bo nao."
- Search with 0 results: "Khong tim thay" (unchanged).

## Data Flow

No new IPC calls needed. All filtering is client-side using existing data:

- **Active groups:** `zaloMgrConfig.groupSettings[id].mode !== 'off'` (or missing = off per `__default`)
- **Active friends:** `zaloMgrConfig.userAllowlist.includes(userId)`
- **Internal groups:** `zaloMgrConfig.groupSettings[id].internal === true`
- **Internal friends:** `zaloMgrConfig.userSettings[id]?.internal === true`

Counts computed once in `renderZaloGroups()` / `renderZaloFriends()` and cached. Internal friend count derived by iterating `Object.values(zaloMgrConfig.userSettings).filter(s => s.internal)` — O(n) over a small object, computed alongside existing render logic.

## Files Changed

| File | Change |
|------|--------|
| `electron/ui/dashboard.html` | Segment tabs HTML, row card template rewrite, CSS for segments/pills/tags/opacity, JS filter logic per tab |

Single-file change. No backend/IPC/preload modifications.

## Testing

1. Open Zalo page with mix of active/inactive groups+friends
2. Default "Dang bat" tab shows only active items with green/yellow borders
3. Switch to "Tat ca" — active on top, divider, inactive dimmed below
4. Switch to "Noi bo" — only internal-flagged items
5. Click pill selector on group row — mode changes, row may move between tabs
6. Click "NB" tag — toggles internal flag, count updates
7. Search works within active tab filter
8. Pagination works within filtered results
9. Warning banner appears when 0 friends active
10. Fresh install (0 active) — empty state message with hint to switch tab
