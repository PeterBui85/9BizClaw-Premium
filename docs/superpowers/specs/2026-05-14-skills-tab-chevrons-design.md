# Skills Tab Redesign + Dashboard Chevrons — Design Spec

## Goal

Two changes in one spec:

1. **Skills tab**: Replace the flat card list + `<details>` grouped system skills with a Claude Code-style 2-column layout (skill list panel + detail panel).
2. **Chevrons**: Replace all Unicode `▾`/`▸` arrows and native `<details>` disclosure triangles across the dashboard with animated SVG chevrons that rotate on expand/collapse.

## Decisions

- **No toggle switch** — user skills don't have an enable/disable toggle in the list view. The delete button stays.
- **No markdown renderer library** — skill content displayed as preformatted text with light styling (headers bold, code blocks monospaced). Adding a full markdown parser (marked.js, etc.) would bloat the dashboard for minimal gain.
- **Single file change** — all work is in `dashboard.html` (CSS + HTML + JS). No backend changes needed — IPC handlers `list-all-skills`, `get-skill-detail`, `create-user-skill`, `delete-user-skill` already exist in `dashboard-ipc.js` with preload bridges in `preload.js`.
- **No new preload bridges needed** — `window.claw.listAllSkills()` and `window.claw.getSkillDetail(id, source)` already wired.

## Part 1: Skills Tab 2-Column Layout

### Layout Structure

```
+----------------------------------------------------------------------+
| [zap icon] Skills                                                      |
|   Quản lý skill hệ thống và tùy chỉnh                                |
+----------------------------------------------------------------------+
| SKILL LIST (left, 280px)         | DETAIL PANEL (right, flex:1)       |
|                                  |                                     |
| [+ Tạo mới]                     | Skill Name                          |
|                                  | category · shipped/user             |
| Tùy chỉnh (3)           ⌄      | ─────────────────────────            |
|   ● Tone chuyên nghiệp FB      | Khi nào áp dụng:                    |
|   ● Quy trình chốt đơn         |   "khi đăng bài Facebook"           |
|   ● Custom greeting             |                                     |
|                                  | Nội dung:                           |
| Vận hành (5)             ⌄      | ┌───────────────────────────────┐   |
|   ○ Xử lý đơn hàng             | │ Xưng chúng tôi, tone chuyên  │   |
|   ○ Chăm sóc khách hàng        | │ nghiệp, không dùng emoji...  │   |
|   ○ Kiểm tra tồn kho           | └───────────────────────────────┘   |
|   ○ Quản lý khiếu nại          |                                     |
|   ○ Theo dõi vận chuyển         | [Xóa skill]  (user skills only)     |
|                                  |                                     |
| Marketing (3)            ⌄      |                                     |
|   ○ Viết caption                |                                     |
|   ○ Kế hoạch content            |                                     |
|   ○ Phân tích đối thủ           |                                     |
+----------------------------------+-------------------------------------+
```

**Legend:** `●` = user skill (filled dot), `○` = shipped skill (open dot)

### Left Panel — Skill List

**Container:** `.skills-list-panel` — fixed width `280px`, `border-right: 1px solid var(--border)`, `overflow-y: auto`, full height of `.skills-layout`.

**"+ Tạo mới" button:** Top of the list panel, right-aligned. Same `btn btn-sm` style. Opens the create form inline (replaces the detail panel temporarily, or slides down within the list — see Create Flow below).

**User skills section:**
- Header: "Tùy chỉnh" + count badge + SVG chevron (collapsible)
- Each item: `.skill-list-item` — `padding: 8px 12px`, `cursor: pointer`, `border-radius: 6px`, `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` (Vietnamese names with diacritics can be wide)
- Hover: `background: var(--surface-hover, var(--bg))`
- Active/selected: `background: var(--accent); color: #fff`
- Shows: filled circle dot (CSS `::before`, 6px, `var(--accent)`) + skill name
- If no user skills: "Chưa có skill tùy chỉnh" muted text

**System skills sections:**
- Grouped by category (from `listAllSkills().shipped`)
- Each category: header with name + count badge + SVG chevron (collapsible)
- Each item: same `.skill-list-item` but with open circle dot (border only, no fill)
- Categories collapsed by default (user can expand)

**Selection:** Clicking any skill item sets it as active (`.skill-list-item.active`) and loads its detail in the right panel via `window.claw.getSkillDetail(id, source)`.

### Right Panel — Detail View

**Container:** `.skills-detail-panel` — `flex: 1`, `padding: 24px`, `overflow-y: auto`.

**Empty state** (no skill selected):
```
Chọn một skill từ danh sách bên trái để xem chi tiết
```
Centered, muted text, with a subtle icon (zap or file-text).

**Loaded state — user skill:**

```
[Skill Name]                                          [Xóa]
rule · tùy chỉnh
────────────────────────────────────────────────────────
Khi nào áp dụng
  khi đăng bài Facebook

Áp cho
  Viết caption (Marketing)

Nội dung
┌─────────────────────────────────────────────────────┐
│ Xưng chúng tôi, tone chuyên nghiệp, không dùng    │
│ emoji. Hashtag tối đa 5 cái.                       │
└─────────────────────────────────────────────────────┘
```

- **Name:** `font-size: 18px; font-weight: 600`
- **Metadata row:** `font-size: 12px; color: var(--text-secondary)` — shows type badge + "tùy chỉnh" source label
- **Divider:** `1px solid var(--border)`
- **Sections** ("Khi nào áp dụng", "Áp cho", "Nội dung"): label in `font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px`, value below in normal text
- **Content block:** `background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-size: 13px; white-space: pre-wrap; font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace; line-height: 1.6`
- **Delete button:** `btn btn-sm btn-danger` in the top-right corner of the detail header

**Loaded state — shipped skill:**

Different from user skills — shipped skill objects only have `{ id, name, category, source }` (no `trigger`, `appliesTo`, `type`, `summary`). The detail panel shows:
- **Name:** same styling as user skills
- **Metadata row:** category name + "hệ thống" source label (no type badge — shipped skills don't have one)
- **Divider**
- **Content block only** — the full `.md` file content from `window.claw.getSkillDetail(id, 'shipped')`. No "Khi nào áp dụng" or "Áp cho" sections (these fields don't exist on shipped skills).
- No delete button
- If content is long, it scrolls within the detail panel (the panel itself is `overflow-y: auto`)

### Create Flow

When "Tạo mới" is clicked:
1. The detail panel shows the create form (same fields as current: name, type, applies-to, trigger, content)
2. Form has "Lưu" + "Hủy" buttons
3. On save: calls `window.claw.createUserSkill(data)`, stores `result.id`, reloads skill list via `loadSkills()`, then calls `selectSkill(result.id, 'user')` to auto-select the new skill
4. On cancel: returns to previous selection (or empty state)

The create form markup is the existing `#skills-create-form` content, moved into the detail panel context.

### Delete Flow

When "Xóa" is clicked in the detail panel:
1. Confirm dialog: `confirm('Xóa skill "name"?')`
2. Calls `window.claw.deleteUserSkill(id)`
3. Reloads skill list
4. Selection after delete: if other user skills exist, select the first one. If no user skills remain, select the first shipped skill. If no skills at all, show empty state.

### Data Flow

```
Page opens / switchPage('skills')
    |
    v
loadSkills()
    |
    v
window.claw.listAllSkills()
    |
    v
Returns { shipped: [{id, name, category, source}], user: [{id, name, type, summary, enabled, trigger, appliesTo}] }
    |
    v
renderSkillList(shipped, user)  — builds left panel
    |
    (auto-select first user skill if any, else first shipped)
    v
selectSkill(id, source)
    |
    v
window.claw.getSkillDetail(id, source)
    |
    v
Returns: string (markdown content for shipped) or string (content for user)
    |
    v
renderSkillDetail(skillMeta, content, source)  — builds right panel
```

**Critical: metadata vs content split.** `window.claw.getSkillDetail(id, source)` returns a raw string (the `.md` file content) — NOT a structured object. The metadata fields (trigger, appliesTo, type for user skills; category for shipped skills) come from the skill object in the cached `listAllSkills()` result. `selectSkill()` must look up the full skill object from the cached list and pass it to `renderSkillDetail(skillMeta, content, source)` alongside the content string. Store the list result in a module-level variable `_skillsCache = { shipped, user }`.

**User skill metadata:** `listAllSkills().user[n]` has `{ id, name, type, summary, trigger, appliesTo, enabled, createdAt, createdVia }`. The `.md` content (from `getSkillDetail`) is the body text.

**Shipped skill metadata:** `listAllSkills().shipped[n]` has only `{ id, name, category, source }` — no `trigger`, no `appliesTo`, no `type`. The detail panel must NOT render those sections for shipped skills.

**XSS safety:** All user-generated content (skill names, triggers, content) must be escaped with the existing `esc()` helper before inserting into HTML, matching the codebase pattern.

## Part 2: Unified SVG Chevron Component

### Current State (to be replaced)

| Location | Current arrow | Mechanism |
|----------|--------------|-----------|
| Sidebar "Kênh" header | `▾`/`▸` via `.sidebar-chevron::after` | CSS `content` swap on `.collapsed` class |
| Skills system categories | Native `<details>` triangle | Browser default disclosure triangle |
| Persona "Tùy chỉnh nâng cao" | Native `<details>` triangle | Browser default disclosure triangle |
| Facebook token guide | Native `<details>` triangle | Browser default disclosure triangle |

### SVG Chevron Design

**Inline SVG** (not external file — keeps everything in dashboard.html):

```html
<svg class="chevron-icon" viewBox="0 0 16 16" width="16" height="16">
  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

This is a down-pointing chevron (`⌄`). When collapsed, it rotates `-90deg` to point right (`>`).

### CSS

```css
.chevron-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
  color: var(--text-muted);
}

/* Collapsed state: rotated to point right */
.chevron-collapsed .chevron-icon,
.collapsed .chevron-icon {
  transform: rotate(-90deg);
}

/* Details/summary: sync with native open state */
details:not([open]) > summary .chevron-icon {
  transform: rotate(-90deg);
}
```

**Default state:** Points down (expanded). **Collapsed:** Rotates to point right. This matches the mental model: down = "content below is visible", right = "content is hidden, click to expand".

### Where Chevrons Apply

1. **Sidebar "Kênh" section** (`dashboard.html:2609`)
   - Replace: `<span class="sidebar-chevron"></span>`
   - With: inline SVG chevron
   - Remove: `.sidebar-chevron::after` CSS rules (lines 710-711)

2. **Skills list category headers** (rendered by JS in `renderSkillList`)
   - Each category header gets an inline SVG chevron
   - Click toggles `.chevron-collapsed` class on the header + hides/shows the item list below

3. **Persona "Tùy chỉnh nâng cao"** (`dashboard.html:3335`)
   - Replace native `<details>/<summary>` with custom collapsible using SVG chevron
   - OR: keep `<details>/<summary>` but inject SVG into `<summary>` and hide native triangle via `summary::-webkit-details-marker { display: none; }` + `summary { list-style: none; }`

4. **Facebook token guide** (`dashboard.html:3713`)
   - Same treatment as persona: hide native triangle, inject SVG chevron into `<summary>`

### Approach: Keep `<details>` + Hide Native Triangle

For locations 3 and 4, keep `<details>/<summary>` for accessibility and simplicity, but:

```css
/* Hide native disclosure triangle */
details summary::-webkit-details-marker { display: none; }
details summary { list-style: none; }

/* Style summary with chevron */
details summary {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
```

The SVG chevron is placed inside `<summary>` and animates based on `details[open]` state — no JS needed for the rotation.

## File Changes Summary

### Modify: `electron/ui/dashboard.html`

**CSS additions (~60 lines):**
- `.skills-layout` — flex container for the 2-column layout
- `.skills-list-panel` — left panel styles
- `.skills-detail-panel` — right panel styles
- `.skill-list-header` — category header with chevron
- `.skill-list-item` — individual skill row
- `.skill-list-item.active` — selected state
- `.skill-detail-name` — skill name in detail panel
- `.skill-detail-meta` — metadata row
- `.skill-detail-section` — section label + content
- `.skill-detail-content` — preformatted content block
- `.skill-detail-empty` — empty state
- `.chevron-icon` — SVG chevron base + transition
- Collapsed/details state selectors for chevron rotation
- `summary::-webkit-details-marker` hide + `summary { list-style: none }`

**CSS removals:**
- `.sidebar-chevron::after` rules (lines 710-711) — replaced by SVG

**HTML changes:**
- `#page-skills` inner content: replace flat sections with `.skills-layout > .skills-list-panel + .skills-detail-panel`
- Move create form into detail panel context
- Sidebar chevron: replace `<span class="sidebar-chevron"></span>` with inline SVG
- Persona `<summary>`: add SVG chevron inside
- Facebook guide `<summary>`: add SVG chevron inside

**JS changes (~80 lines):**
- `renderSkillList(shipped, user)` — replaces both `renderUserSkills` and `renderShippedSkills`. Builds the left panel with categorized items.
- `selectSkill(id, source)` — new function. Sets active item, calls `getSkillDetail`, calls `renderSkillDetail`.
- `renderSkillDetail(skillMeta, content, source)` — new function. Builds the right panel.
- `showCreateSkillInDetail()` — shows create form in detail panel
- `toggleSkillCategory(el)` — toggles category expand/collapse with chevron animation
- Update `loadSkills()` to call `renderSkillList` instead of separate render functions, and store result in `_skillsCache`
- `loadSkills()` must still call `populateAppliesToDropdown(shipped)` after `renderSkillList()` — the "Áp cho" dropdown in the create form needs it
- Remove: `renderUserSkills()`, `renderShippedSkills()` (replaced by unified `renderSkillList`)

**JS unchanged:**
- `populateAppliesToDropdown` — still needed for the create form, called from `loadSkills()`
- `saveNewSkill` — still calls `window.claw.createUserSkill()`
- `deleteSkill` — still calls `window.claw.deleteUserSkill()`

## Edge Cases

- **No skills at all** (fresh install, no shipped skills dir): Left panel shows "Chưa có skill nào", detail panel shows empty state.
- **Skill content is null** (file deleted on disk): Detail panel shows "Không đọc được nội dung skill" error text.
- **Very long skill content** (shipped skills can be 2000+ chars): Detail panel scrolls independently. Left panel stays fixed.
- **Category with 1 skill**: Still shows as collapsible category — consistent UX.
- **Sidebar section collapsed on page load**: Chevron starts in rotated state via `.collapsed` class (existing localStorage persistence unchanged). The `toggleChannelSection()` JS function needs no changes — it toggles `.collapsed` class which the new CSS `transform: rotate(-90deg)` selector already hooks into.
- **Window resize**: Left panel stays 280px, detail panel flexes. Below 600px viewport width, left panel could stack on top (optional — not critical for Electron desktop app).

## What Gets Removed

- `renderUserSkills()` function — replaced by `renderSkillList()`
- `renderShippedSkills()` function — replaced by `renderSkillList()`
- `.sidebar-chevron::after` CSS rules — replaced by SVG
- `<span class="sidebar-chevron"></span>` — replaced by SVG element
- Toggle switch markup in user skill cards — per user decision "no need for toggle switch"
- Native `<details>` disclosure triangles (hidden via CSS, replaced by SVG chevrons)

## What Stays Unchanged

- All IPC handlers in `dashboard-ipc.js` — already complete
- All preload bridges — already complete
- `skill-manager.js` — no changes needed
- `saveNewSkill()`, `deleteSkill()`, `toggleSkill()` JS functions — keep as-is (toggle still exists as IPC, just not shown in UI)
- Sidebar collapse/expand JS logic (`toggleChannelSection`, localStorage persistence)

## Testing

- Skills page shows 2-column layout on open
- Click user skill in left panel: detail panel shows name, type, trigger, content
- Click shipped skill: detail panel shows name, category, full markdown content
- Click "Tạo mới": detail panel shows create form
- Create + save skill: appears in user section, auto-selected
- Delete skill: removed from list, detail panel returns to empty or next skill
- Sidebar "Kênh" chevron: smooth rotation on click, state persists on page reload
- Skills category chevrons: smooth rotation, expand/collapse categories
- Persona advanced section: SVG chevron rotates, no native triangle visible
- Facebook guide section: SVG chevron rotates, no native triangle visible
- Theme switch (light/dark): all chevrons use `currentColor`, no hardcoded colors
