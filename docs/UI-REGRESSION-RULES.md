# UI Regression Rules

Hard rules to prevent UI layout bugs from shipping. Enforced by `electron/scripts/smoke-test.js` section **"UI regression guards"** — build blocks if any rule fails.

## Why this exists

v2.3.48 shipped a visibility radio bug where Vietnamese text rendered as a vertical column of single characters (1 char per line, outside the card boundary). Root cause: `flex:1 1 0` + `overflow-wrap:anywhere` on a flex child. The combination makes the flex item's min-content size = 1 character, which under any layout pressure (narrow viewport, nested flex/grid, zoom) collapses the item to ~10px width while text wraps per-character.

These rules codify the lessons so no future build ships the same class of bug.

## Rules

### R1. Never use `overflow-wrap:anywhere` with `flex:1 1 0`

`overflow-wrap:anywhere` tells the browser: "it's OK to break in the middle of a word, anywhere, at any character boundary." Combined with `flex:1 1 0` (which sets `flex-basis:0` so the child's min-content is respected), the min-width of the flex child becomes 1 glyph. Under any containing-block pressure, text collapses to a vertical column.

**Allowed instead:**
- `word-break:break-word` alone (breaks at word boundaries, not character-level)
- `overflow-wrap:break-word` (only breaks long unbreakable strings, still respects word boundaries)

**Never combine:**
- `flex:1 1 0` + `overflow-wrap:anywhere`
- `flex:1 1 0` + `word-break:break-all`

### R2. Prefer grid over flex for 2-column labeled controls

Radio/checkbox rows with icon/dot + text label should use CSS grid, not flex:

```css
/* GOOD — grid with explicit track sizes */
.option {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

/* BAD — flex with flex:1 on child */
.option { display: flex; gap: 8px; }
.option .label { flex: 1 1 0; }  /* Fragile under pressure */
```

Grid with explicit `18px minmax(0,1fr)` guarantees the text column gets "all remaining space, but never less than 0". Flex with `flex:1 1 0` calculates min-content from content, which can collapse.

### R3. Every grid/flex child containing text needs `min-width:0`

CSS default for flex/grid items is `min-width: auto` (= min-content size of content). For text-bearing items, min-content can be "width of the longest unbreakable glyph cluster", which is unpredictable with Vietnamese diacritics, emoji, or mixed scripts. Always set explicit `min-width: 0` on containers you want to shrink.

### R4. Grid track columns with fixed pixel values MUST NOT be combined with `minmax(auto,...)`

If a card is `grid-template-columns: 260px 1fr 320px`, the `320px` is sacrosanct. Do NOT change to `minmax(auto, 320px)` "for responsiveness" — that lets content push the track to 0.

For responsive behavior, use `@media (max-width: N)` to switch the grid to `1fr` (stacked) instead of messing with minmax.

### R5. Card containers MUST have `min-width:0` AND `overflow:hidden`

When a card contains flex/grid children with text, the card itself must:
- Set `min-width: 0` so the card can shrink with its grid/flex parent
- Set `overflow: hidden` so any child overflow gets clipped, not rendered outside

This prevents the "text spills vertically outside the card boundary" failure mode.

### R6. Never use vendor prefixes with `-webkit-line-clamp` without `-webkit-box-orient`

When truncating with ellipsis on N lines, always:
```css
display: -webkit-box;
-webkit-line-clamp: N;
-webkit-box-orient: vertical;  /* REQUIRED */
overflow: hidden;
```

Missing `-webkit-box-orient` causes text to render as a single line, overflowing the card.

### R7. Manual screenshot QA before every build

Before `npm run build:win` or `npm run build:mac`:

1. Open `electron/ui/dashboard.html` in Chrome/Edge (not just Electron)
2. Resize viewport to 1200px, 1440px, 1600px, 1920px
3. Visit every tab: Tổng quan, Tài liệu, Telegram, Zalo, Lịch, Cài đặt
4. Confirm every radio, checkbox, modal, dropdown renders as expected
5. Check dark mode if supported

Bugs at 1200-1400px widths are the most common ship-blockers.

## Enforcement

`electron/scripts/smoke-test.js` runs grep-based checks against `dashboard.html`:

- **FAIL** if `overflow-wrap:anywhere` appears in CSS
- **FAIL** if `.visibility-option` uses `display:flex` (must be grid)
- **FAIL** if `.know-col` lacks `overflow:hidden`
- **FAIL** if `-webkit-line-clamp` appears without `-webkit-box-orient`

Build chains: `npm run build:win` = `prebuild:vendor → smoke → electron-builder`. Any FAIL blocks the .exe/.dmg.

## Adding new rules

When a UI bug ships:

1. Write the fix in dashboard.html
2. Identify the CSS anti-pattern that caused it
3. Add a rule here (R-N) with the example + "allowed instead"
4. Add a grep check in `smoke-test.js` under section "UI regression guards"
5. Verify smoke fails on HEAD before your fix, passes after

This is how the rule list grows — every bug becomes a permanent guard.
