# Zalo Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Zalo management page with filtered segment tabs, simplified row cards, and visual hierarchy to optimize for scanning 20-50 active items.

**Architecture:** Pure client-side UI change in a single file (`dashboard.html`). Add segment tabs per column with client-side filtering. Replace row card templates with pill selectors and inline tags. No backend/IPC changes.

**Tech Stack:** HTML/CSS/JS in Electron dashboard, existing CSS custom properties (`--bg`, `--border`, `--surface`, `--text-muted`, `--accent`).

**Spec:** `docs/superpowers/specs/2026-05-19-zalo-page-redesign-design.md`

---

## Chunk 1: CSS + HTML Structure

### Task 1: Add new CSS classes

**Files:**
- Modify: `electron/ui/dashboard.html` — CSS section (after line ~521, after existing `.zc-select:focus` rule)

- [ ] **Step 1: Add segment tab CSS**

Insert after the `.zc-select:focus` rule (line ~521):

```css
/* Zalo segment tabs — reuses .gw-tab underline pattern */
.zalo-segments { display:flex; gap:0; border-bottom:1.5px solid var(--border); margin-bottom:10px; flex-shrink:0; }
.zalo-seg { flex:0 0 auto; padding:7px 14px; font-size:12px; font-weight:500; color:var(--text-muted); background:none; border:none; border-bottom:2px solid transparent; cursor:pointer; transition:all .15s; white-space:nowrap; }
.zalo-seg:hover { color:var(--text); }
.zalo-seg.active { color:var(--text); border-bottom-color:var(--primary, var(--accent)); }
.zalo-seg .seg-count { font-size:10px; opacity:0.5; margin-left:4px; }
```

- [ ] **Step 2: Add pill selector CSS**

```css
/* Mode pill selector */
.zc-pills { display:flex; border-radius:6px; overflow:hidden; border:1px solid var(--border); flex-shrink:0; }
.zc-pill { padding:3px 10px; font-size:11px; font-weight:600; color:var(--text-muted); background:transparent; border:none; cursor:pointer; transition:all .15s; border-right:1px solid var(--border); }
.zc-pill:last-child { border-right:none; }
.zc-pill:hover { color:var(--text); background:rgba(255,255,255,0.04); }
.zc-pill.pill-green { color:#22c55e; background:rgba(34,197,94,0.12); }
.zc-pill.pill-yellow { color:#eab308; background:rgba(234,179,8,0.12); }
.zc-pill.pill-red { color:#ef4444; background:rgba(239,68,68,0.08); }
@media (max-width:1400px) { .zc-pill { padding:3px 7px; font-size:10px; } }
```

- [ ] **Step 3: Add NB tag CSS**

```css
/* Internal "NB" tag */
.zc-nb { display:inline-flex; padding:1px 6px; border-radius:4px; font-size:9px; font-weight:700; background:rgba(139,92,246,0.15); color:#a78bfa; cursor:pointer; min-width:24px; min-height:20px; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; letter-spacing:0.3px; }
.zc-nb:hover { background:rgba(139,92,246,0.25); }
```

- [ ] **Step 4: Add inactive row + transition CSS**

Replace existing `.zc-state-off` rules (lines ~516-518):
```css
/* OLD (remove):
.zc-state-off { border-left:4px solid #ef4444; opacity:0.7; }
.zc-state-off:hover { opacity:0.9; }
.zc-state-off .zc-badge { background:rgba(239,68,68,0.12); color:#dc2626; }
*/
```

Replace with:
```css
.zc-state-off { border-left:3px solid transparent; }
.zc-inactive { opacity:0.55; transition:opacity .15s; }
.zc-inactive:hover { opacity:0.8; }
/* Row fade-out animation */
.zc-fading { opacity:0; transition:opacity 0.3s ease-out; }
/* Tab switch fade-in */
.zalo-list-fade-in { animation:zaloFadeIn 150ms ease-out; }
@keyframes zaloFadeIn { from { opacity:0 } to { opacity:1 } }
/* Bulk action links in "Tat ca" tab */
.zalo-bulk-links { display:flex; gap:12px; margin-bottom:8px; flex-shrink:0; }
.zalo-bulk-link { font-size:11px; color:var(--text-muted); cursor:pointer; text-decoration:underline; background:none; border:none; padding:0; }
.zalo-bulk-link:hover { color:var(--text); }
/* Divider between active/inactive in "Tat ca" */
.zalo-divider { display:flex; align-items:center; gap:8px; margin:8px 0 6px; }
.zalo-divider-line { flex:1; height:1px; background:var(--border); }
.zalo-divider-text { font-size:10px; color:var(--text-muted); font-weight:600; letter-spacing:0.3px; }
```

- [ ] **Step 5: Commit CSS changes**

```bash
git add electron/ui/dashboard.html
git commit -m "style: add CSS for zalo page segment tabs, pill selector, NB tag, inactive treatment"
```

### Task 2: Restructure Zalo page HTML

**Files:**
- Modify: `electron/ui/dashboard.html` — Zalo page HTML (lines ~2865-2927)

- [ ] **Step 1: Update column headers + add segment tabs (Groups column)**

Replace the Groups column inner HTML (lines ~2898-2907). The new structure:

```html
<!-- LEFT: Groups -->
<div class="zalo-split-col">
  <div class="zalo-col-header" style="flex-shrink:0">
    <div style="font-size:13px"><span style="font-weight:700">Nhóm</span> <span id="zalo-mgr-group-count" style="font-weight:700;color:var(--text)">0</span> <span id="zalo-mgr-group-active-count" style="font-size:11px;color:#22c55e;font-weight:400"></span></div>
  </div>
  <div class="zalo-segments" id="zalo-group-segments">
    <button class="zalo-seg active" data-tab="active" onclick="switchZaloTab('groups','active')">Đang bật<span class="seg-count" id="zalo-seg-groups-active">0</span></button>
    <button class="zalo-seg" data-tab="all" onclick="switchZaloTab('groups','all')">Tất cả<span class="seg-count" id="zalo-seg-groups-all">0</span></button>
    <button class="zalo-seg" data-tab="internal" onclick="switchZaloTab('groups','internal')">Nội bộ<span class="seg-count" id="zalo-seg-groups-internal">0</span></button>
  </div>
  <input type="text" class="zalo-mgr-search" id="zalo-mgr-group-search" placeholder="Tìm nhóm..." oninput="renderZaloGroups()" style="flex-shrink:0">
  <div id="zalo-groups-bulk-links" class="zalo-bulk-links" style="display:none">
    <button class="zalo-bulk-link" onclick="setAllGroupsMode('mention')">Bật tất cả</button>
    <button class="zalo-bulk-link" onclick="setAllGroupsMode('off')">Tắt tất cả</button>
  </div>
  <div class="zalo-list-container">
    <div id="zalo-mgr-groups-list"><div class="zalo-list-loading"><div class="spinner"></div>Đang tải...</div></div>
  </div>
</div>
```

- [ ] **Step 2: Update column headers + add segment tabs (Friends column)**

Replace the Friends column inner HTML (lines ~2908-2925). The new structure:

```html
<!-- RIGHT: Friends -->
<div class="zalo-split-col">
  <div class="zalo-col-header" style="flex-shrink:0">
    <div style="font-size:13px"><span style="font-weight:700">Bạn bè</span> <span id="zalo-mgr-friend-count" style="font-weight:700;color:var(--text)">0</span> <span id="zalo-mgr-friend-active-count" style="font-size:11px;color:#22c55e;font-weight:400"></span></div>
  </div>
  <div class="zalo-segments" id="zalo-friend-segments">
    <button class="zalo-seg active" data-tab="active" onclick="switchZaloTab('friends','active')">Đang bật<span class="seg-count" id="zalo-seg-friends-active">0</span></button>
    <button class="zalo-seg" data-tab="all" onclick="switchZaloTab('friends','all')">Tất cả<span class="seg-count" id="zalo-seg-friends-all">0</span></button>
    <button class="zalo-seg" data-tab="internal" onclick="switchZaloTab('friends','internal')">Nội bộ<span class="seg-count" id="zalo-seg-friends-internal">0</span></button>
  </div>
  <input type="text" class="zalo-mgr-search" id="zalo-mgr-friend-search" placeholder="Tìm bạn bè..." oninput="clearTimeout(window._friendSearchTimer);window._friendSearchTimer=setTimeout(()=>renderZaloFriends(),150)" style="flex-shrink:0">
  <div id="zalo-friends-bulk-links" class="zalo-bulk-links" style="display:none">
    <button class="zalo-bulk-link" onclick="toggleAllFriends(true)">Bật tất cả</button>
    <button class="zalo-bulk-link" onclick="toggleAllFriends(false)">Tắt tất cả</button>
  </div>
  <div class="zalo-list-container">
    <div id="zalo-mgr-friends-list"><div class="zalo-list-loading"><div class="spinner"></div>Đang tải...</div></div>
  </div>
</div>
```

- [ ] **Step 3: Commit HTML restructure**

```bash
git add electron/ui/dashboard.html
git commit -m "refactor: restructure zalo page HTML with segment tabs and updated column headers"
```

---

## Chunk 2: JavaScript — Tab State + Filter Infrastructure

### Task 3: Add tab state variables and switchZaloTab()

**Files:**
- Modify: `electron/ui/dashboard.html` — JS section, near existing Zalo state variables (around line ~7046)

- [ ] **Step 1: Add tab state variables**

Insert after `let _zaloFriendsRendered = 0;` (around line ~7055):

```javascript
let _zaloGroupTab = 'active';   // 'active' | 'all' | 'internal'
let _zaloFriendTab = 'active';
```

- [ ] **Step 2: Add switchZaloTab() function**

Insert after the new variables:

```javascript
function switchZaloTab(column, tab) {
  const isGroups = column === 'groups';
  if (isGroups) _zaloGroupTab = tab; else _zaloFriendTab = tab;
  // Update segment UI
  const segContainer = document.getElementById(isGroups ? 'zalo-group-segments' : 'zalo-friend-segments');
  segContainer.querySelectorAll('.zalo-seg').forEach(s => s.classList.toggle('active', s.dataset.tab === tab));
  // Clear search on tab switch
  const searchInput = document.getElementById(isGroups ? 'zalo-mgr-group-search' : 'zalo-mgr-friend-search');
  if (searchInput) searchInput.value = '';
  // Show/hide bulk links (only in "all" tab)
  const bulkEl = document.getElementById(isGroups ? 'zalo-groups-bulk-links' : 'zalo-friends-bulk-links');
  if (bulkEl) bulkEl.style.display = tab === 'all' ? 'flex' : 'none';
  // Re-render with fade-in
  const listEl = document.getElementById(isGroups ? 'zalo-mgr-groups-list' : 'zalo-mgr-friends-list');
  if (listEl) {
    listEl.classList.remove('zalo-list-fade-in');
    void listEl.offsetWidth;
    listEl.classList.add('zalo-list-fade-in');
    listEl.parentElement.scrollTop = 0;
  }
  if (isGroups) renderZaloGroups(); else renderZaloFriends();
}
```

- [ ] **Step 3: Add helper — isGroupActive(groupId)**

```javascript
function _isGroupActive(groupId) {
  const mode = getZaloGroupMode(groupId);
  return mode !== 'off';
}
function _isGroupInternal(groupId) {
  return !!(zaloMgrConfig.groupSettings || {})[groupId]?.internal;
}
function _isFriendActive(userId) {
  return (zaloMgrConfig.userAllowlist || []).includes(userId);
}
function _isFriendInternal(userId) {
  return !!(zaloMgrConfig.userSettings || {})[userId]?.internal;
}
```

- [ ] **Step 4: Add count update helper**

```javascript
function _updateZaloSegCounts() {
  const activeGroups = zaloGroups.filter(g => _isGroupActive(g.groupId)).length;
  const internalGroups = zaloGroups.filter(g => _isGroupInternal(g.groupId)).length;
  const totalGroups = zaloGroups.length;
  const activeFriends = (zaloMgrConfig.userAllowlist || []).length;
  const internalFriends = Object.values(zaloMgrConfig.userSettings || {}).filter(u => u?.internal).length;
  const totalFriends = zaloFriends.length;
  // Segment counts
  const _s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  _s('zalo-seg-groups-active', activeGroups);
  _s('zalo-seg-groups-all', totalGroups);
  _s('zalo-seg-groups-internal', internalGroups);
  _s('zalo-seg-friends-active', activeFriends);
  _s('zalo-seg-friends-all', totalFriends);
  _s('zalo-seg-friends-internal', internalFriends);
  // Header counts
  _s('zalo-mgr-group-count', totalGroups);
  _s('zalo-mgr-group-active-count', activeGroups > 0 ? `· ${activeGroups} bật` : '');
  _s('zalo-mgr-friend-count', totalFriends);
  _s('zalo-mgr-friend-active-count', activeFriends > 0 ? `· ${activeFriends} bật` : '');
}
```

- [ ] **Step 5: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat: add zalo tab state, switchZaloTab, filter helpers, and count updater"
```

---

## Chunk 3: Row Card Templates

### Task 4: Rewrite _renderGroupItem()

**Files:**
- Modify: `electron/ui/dashboard.html` — `_renderGroupItem` function (lines ~7060-7091)

- [ ] **Step 1: Replace _renderGroupItem with new template**

Replace the entire function body (lines ~7060-7091) with:

```javascript
function _renderGroupItem(g, opts) {
  const inactive = opts?.inactive;
  const gSettings = (zaloMgrConfig.groupSettings || {})[g.groupId] || {};
  const mode = getZaloGroupMode(g.groupId);
  const avatarHtml = g.avatar
    ? `<img class="zc-avatar" src="${esc(g.avatar)}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"><span class="zc-avatar-fallback" style="display:none">${icon('users', 16)}</span>`
    : `<span class="zc-avatar-fallback">${icon('users', 16)}</span>`;
  const stateClass = mode === 'off' ? 'zc-state-off' : mode === 'all' ? 'zc-state-on' : 'zc-state-mention';
  const inactiveClass = inactive ? ' zc-inactive' : '';
  const summary = zaloGroupSummaries[g.groupId];
  const metaParts = [`${g.memberCount} thành viên`];
  if (g.desc) metaParts.push(g.desc);
  if (summary?.topics) metaParts.push(summary.topics);
  const nbTag = gSettings.internal
    ? `<span class="zc-nb" onclick="event.stopPropagation();updateGroupInternal('${escAttr(g.groupId)}', false)" title="Nội bộ — bấm để bỏ">NB</span>`
    : '';
  const pillOff = mode === 'off' ? ' pill-red' : '';
  const pillMention = mode === 'mention' ? ' pill-yellow' : '';
  const pillAll = mode === 'all' ? ' pill-green' : '';
  return `<div class="zc ${stateClass}${inactiveClass}" data-group-id="${escAttr(g.groupId)}">
    ${avatarHtml}
    <div class="zc-body">
      <div class="zc-name"><span class="zc-name-text" title="${escAttr(g.name)}">${esc(g.name)}</span>${nbTag}</div>
      <div class="zc-meta">${esc(metaParts.join(' · '))}</div>
    </div>
    <div class="zc-actions">
      ${summary?.hasContent ? `<button class="zc-summary-btn" onclick="viewGroupMemory('${escAttr(g.groupId)}', '${escAttr(g.name)}')" title="Xem tóm tắt nhóm">${icon('file-text', 14)}</button>` : ''}
      <div class="zc-pills">
        <button class="zc-pill${pillOff}" onclick="setGroupMode('${escAttr(g.groupId)}', 'off')">Tắt</button>
        <button class="zc-pill${pillMention}" onclick="setGroupMode('${escAttr(g.groupId)}', 'mention')">@mention</button>
        <button class="zc-pill${pillAll}" onclick="setGroupMode('${escAttr(g.groupId)}', 'all')">Mọi tin</button>
      </div>
    </div>
  </div>`;
}
```

Key changes: `<select>` → pill group with `onclick`, checkbox → NB tag (only rendered when `internal: true`, empty string otherwise — consistent with friends), `zc-badge` removed, `opts.inactive` adds `zc-inactive` class, `data-group-id` attribute for fade-out targeting. To mark a group as internal, CEO uses the "Nội bộ" tab or the existing `updateGroupInternal` function (accessible via context or future enhancement).

- [ ] **Step 2: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat: rewrite group row card with pill selector and NB tag"
```

### Task 5: Rewrite _renderFriendItem()

**Files:**
- Modify: `electron/ui/dashboard.html` — `_renderFriendItem` function (lines ~7343-7378)

- [ ] **Step 1: Replace _renderFriendItem with new template**

Replace the entire function body with:

```javascript
function _renderFriendItem(f, opts) {
  const inactive = opts?.inactive;
  const allowed = (zaloMgrConfig.userAllowlist || []).includes(f.userId);
  const uSettings = (zaloMgrConfig.userSettings || {})[f.userId] || {};
  const avatarHtml = f.avatar
    ? `<img class="zc-avatar" src="${esc(f.avatar)}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"><span class="zc-avatar-fallback" style="display:none">${icon('user', 16)}</span>`
    : `<span class="zc-avatar-fallback">${icon('user', 16)}</span>`;
  const stateClass = allowed ? 'zc-state-on' : 'zc-state-off';
  const inactiveClass = inactive ? ' zc-inactive' : '';
  const lastAct = f.lastActionTime ? new Date(f.lastActionTime) : null;
  const lastActLabel = lastAct ? (() => {
    const diff = Date.now() - lastAct.getTime();
    if (diff < 3600000) return Math.floor(diff/60000) + ' phút trước';
    if (diff < 86400000) return Math.floor(diff/3600000) + ' giờ trước';
    if (diff < 604800000) return Math.floor(diff/86400000) + ' ngày trước';
    return lastAct.toLocaleDateString('vi');
  })() : '';
  const metaParts = [];
  if (f.phoneNumber) metaParts.push(f.phoneNumber);
  if (lastActLabel) metaParts.push(lastActLabel);
  const nbTag = uSettings.internal
    ? `<span class="zc-nb" onclick="event.stopPropagation();updateUserInternal('${escAttr(f.userId)}', false)" title="Nội bộ — bấm để bỏ">NB</span>`
    : '';
  return `<div class="zc ${stateClass}${inactiveClass}" data-user-id="${escAttr(f.userId)}">
    ${avatarHtml}
    <div class="zc-body">
      <div class="zc-name">${esc(f.displayName)}${nbTag}</div>
      ${metaParts.length ? `<div class="zc-meta">${esc(metaParts.join(' · '))}</div>` : ''}
    </div>
    <div class="zc-actions">
      ${(uSettings.internal || allowed) && f.userId ? `<button type="button" class="zc-summary-btn" onclick="openZaloUserMemory('${escJs(f.userId)}', '${escJs(f.displayName)}')" title="Xem hồ sơ">${icon('file-text', 14)}</button>` : ''}
      <label class="toggle-switch"><input type="checkbox" ${allowed ? 'checked' : ''} onchange="toggleUserReply('${escAttr(f.userId)}', this.checked)"><span class="toggle-slider"></span></label>
    </div>
  </div>`;
}
```

Key changes: `zc-badge` removed, checkbox replaced with NB tag (only shown when internal), `data-user-id` attribute, `opts.inactive` support, memory button conditionally shown.

- [ ] **Step 2: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat: rewrite friend row card — remove badge, add NB tag, simplify controls"
```

---

## Chunk 4: Render Functions with Tab Filtering + Dual Pagination

### Task 6: Rewrite renderZaloGroups() with tab-aware filtering

**Files:**
- Modify: `electron/ui/dashboard.html` — `renderZaloGroups` (lines ~7115-7135), `_renderMoreGroups` (lines ~7092-7114)

- [ ] **Step 1: Add dual pagination state variables**

Near existing pagination vars, add:

```javascript
let _zaloGroupsActiveList = [];
let _zaloGroupsInactiveList = [];
let _zaloGroupsActiveRendered = 0;
let _zaloGroupsInactiveRendered = 0;
```

- [ ] **Step 2: Replace renderZaloGroups()**

```javascript
function renderZaloGroups() {
  const list = document.getElementById('zalo-mgr-groups-list');
  const q = (document.getElementById('zalo-mgr-group-search').value || '').toLowerCase();
  const tab = _zaloGroupTab;
  let filtered = zaloGroups.filter(g => !q || (g.name || '').toLowerCase().includes(q));
  // Tab filter
  if (tab === 'active') filtered = filtered.filter(g => _isGroupActive(g.groupId));
  else if (tab === 'internal') filtered = filtered.filter(g => _isGroupInternal(g.groupId));
  _updateZaloSegCounts();
  if (filtered.length === 0) {
    let msg;
    if (q) msg = 'Không tìm thấy nhóm.';
    else if (tab === 'active') msg = 'Chưa bật nhóm nào. Chuyển sang tab "Tất cả" để bật.';
    else if (tab === 'internal') msg = 'Chưa đánh dấu nội bộ nào.';
    else msg = 'Chưa có nhóm Zalo nào. Bấm "Làm mới" để đồng bộ.';
    list.innerHTML = '<div class="zalo-mgr-empty">' + msg + '</div>';
    return;
  }
  const modeOf = (g) => getZaloGroupMode(g.groupId);
  const priority = { all: 0, mention: 1, off: 2 };
  const sorted = [...filtered].sort((a, b) => {
    const pa = priority[modeOf(a)] ?? 3;
    const pb = priority[modeOf(b)] ?? 3;
    if (pa !== pb) return pa - pb;
    return (a.name || '').localeCompare(b.name || '');
  });
  list.innerHTML = '';
  if (tab === 'all') {
    _zaloGroupsActiveList = sorted.filter(g => _isGroupActive(g.groupId));
    _zaloGroupsInactiveList = sorted.filter(g => !_isGroupActive(g.groupId));
    _zaloGroupsActiveRendered = 0;
    _zaloGroupsInactiveRendered = 0;
    _renderMoreGroupsActive();
    if (_zaloGroupsInactiveList.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'zalo-divider';
      divider.id = 'zalo-groups-divider';
      divider.innerHTML = '<div class="zalo-divider-line"></div><span class="zalo-divider-text">Đã tắt</span><div class="zalo-divider-line"></div>';
      list.appendChild(divider);
      _renderMoreGroupsInactive();
    }
  } else {
    _zaloGroupsSorted = sorted;
    _zaloGroupsRendered = 0;
    _renderMoreGroups();
  }
}
```

- [ ] **Step 3: Add _renderMoreGroupsActive() and _renderMoreGroupsInactive()**

```javascript
function _renderMoreGroupsActive() {
  const list = document.getElementById('zalo-mgr-groups-list');
  if (!list) return;
  const batch = _zaloGroupsActiveList.slice(_zaloGroupsActiveRendered, _zaloGroupsActiveRendered + ZALO_GROUPS_PAGE_SIZE);
  const oldBtn = document.getElementById('zalo-groups-active-more');
  if (oldBtn) oldBtn.remove();
  const fragment = document.createDocumentFragment();
  const tmp = document.createElement('div');
  tmp.innerHTML = batch.map(g => _renderGroupItem(g)).join('');
  while (tmp.firstChild) fragment.appendChild(tmp.firstChild);
  _zaloGroupsActiveRendered += batch.length;
  const divider = document.getElementById('zalo-groups-divider');
  if (divider) list.insertBefore(fragment, divider);
  else list.appendChild(fragment);
  if (_zaloGroupsActiveRendered < _zaloGroupsActiveList.length) {
    const remaining = _zaloGroupsActiveList.length - _zaloGroupsActiveRendered;
    const btn = document.createElement('button');
    btn.id = 'zalo-groups-active-more';
    btn.className = 'btn btn-secondary';
    btn.style.cssText = 'width:100%;margin-top:6px;padding:8px;font-size:11px';
    btn.textContent = `Xem thêm ${Math.min(remaining, ZALO_GROUPS_PAGE_SIZE)} / ${remaining} còn lại`;
    btn.onclick = _renderMoreGroupsActive;
    if (divider) list.insertBefore(btn, divider);
    else list.appendChild(btn);
  }
}

function _renderMoreGroupsInactive() {
  const list = document.getElementById('zalo-mgr-groups-list');
  if (!list) return;
  const batch = _zaloGroupsInactiveList.slice(_zaloGroupsInactiveRendered, _zaloGroupsInactiveRendered + ZALO_GROUPS_PAGE_SIZE);
  const oldBtn = document.getElementById('zalo-groups-inactive-more');
  if (oldBtn) oldBtn.remove();
  const fragment = document.createDocumentFragment();
  const tmp = document.createElement('div');
  tmp.innerHTML = batch.map(g => _renderGroupItem(g, { inactive: true })).join('');
  while (tmp.firstChild) fragment.appendChild(tmp.firstChild);
  _zaloGroupsInactiveRendered += batch.length;
  list.appendChild(fragment);
  if (_zaloGroupsInactiveRendered < _zaloGroupsInactiveList.length) {
    const remaining = _zaloGroupsInactiveList.length - _zaloGroupsInactiveRendered;
    const btn = document.createElement('button');
    btn.id = 'zalo-groups-inactive-more';
    btn.className = 'btn btn-secondary';
    btn.style.cssText = 'width:100%;margin-top:6px;padding:8px;font-size:11px';
    btn.textContent = `Xem thêm ${Math.min(remaining, ZALO_GROUPS_PAGE_SIZE)} / ${remaining} còn lại`;
    btn.onclick = _renderMoreGroupsInactive;
    list.appendChild(btn);
  }
}
```

- [ ] **Step 4: Verify existing _renderMoreGroups() compatibility**

The existing `_renderMoreGroups()` is reused for "active" and "internal" tabs (single-list mode). It reads from `_zaloGroupsSorted` and `_zaloGroupsRendered` — both already declared at lines ~7058-7059 in the current codebase. No change needed — it calls `_renderGroupItem(g)` without opts, which defaults to `inactive: undefined` (falsy).

- [ ] **Step 5: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat: rewrite renderZaloGroups with tab-aware filtering and dual pagination"
```

### Task 7: Rewrite renderZaloFriends() with tab-aware filtering

**Files:**
- Modify: `electron/ui/dashboard.html` — `renderZaloFriends` (lines ~7402-7428), `_renderMoreFriends` (lines ~7379-7401)

- [ ] **Step 1: Add dual pagination state for friends**

```javascript
let _zaloFriendsActiveList = [];
let _zaloFriendsInactiveList = [];
let _zaloFriendsActiveRendered = 0;
let _zaloFriendsInactiveRendered = 0;
```

- [ ] **Step 2: Replace renderZaloFriends()**

```javascript
function renderZaloFriends() {
  const list = document.getElementById('zalo-mgr-friends-list');
  const q = (document.getElementById('zalo-mgr-friend-search').value || '').toLowerCase();
  const tab = _zaloFriendTab;
  let filtered = zaloFriends.filter(f => !q ||
    (f.displayName || '').toLowerCase().includes(q) ||
    (f.phoneNumber || '').toLowerCase().includes(q)
  );
  if (tab === 'active') filtered = filtered.filter(f => _isFriendActive(f.userId));
  else if (tab === 'internal') filtered = filtered.filter(f => _isFriendInternal(f.userId));
  _updateZaloSegCounts();
  if (filtered.length === 0) {
    let msg;
    if (q) msg = 'Không tìm thấy user.';
    else if (tab === 'active') msg = 'Chưa bật bạn bè nào. Chuyển sang tab "Tất cả" để bật.';
    else if (tab === 'internal') msg = 'Chưa đánh dấu nội bộ nào.';
    else msg = zaloFriends.length === 0 ? 'Chưa có bạn bè. Bấm "Làm mới" để đồng bộ từ Zalo.' : 'Không tìm thấy user.';
    list.innerHTML = '<div class="zalo-mgr-empty">' + msg + '</div>';
    // Update all-off banner
    const allOffBanner = document.getElementById('zalo-all-off-banner');
    if (allOffBanner) allOffBanner.style.display = (zaloMgrConfig.userAllowlist || []).length === 0 ? 'block' : 'none';
    return;
  }
  const sorted = [...filtered].sort((a, b) => {
    const aAllowed = _isFriendActive(a.userId);
    const bAllowed = _isFriendActive(b.userId);
    if (aAllowed !== bAllowed) return aAllowed ? -1 : 1;
    return (a.displayName || '').localeCompare(b.displayName || '');
  });
  list.innerHTML = '';
  if (tab === 'all') {
    _zaloFriendsActiveList = sorted.filter(f => _isFriendActive(f.userId));
    _zaloFriendsInactiveList = sorted.filter(f => !_isFriendActive(f.userId));
    _zaloFriendsActiveRendered = 0;
    _zaloFriendsInactiveRendered = 0;
    _renderMoreFriendsActive();
    if (_zaloFriendsInactiveList.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'zalo-divider';
      divider.id = 'zalo-friends-divider';
      divider.innerHTML = '<div class="zalo-divider-line"></div><span class="zalo-divider-text">Đã tắt</span><div class="zalo-divider-line"></div>';
      list.appendChild(divider);
      _renderMoreFriendsInactive();
    }
  } else {
    // Reuse existing single-list pagination vars (declared at line ~7053-7054)
    _zaloFriendsSorted = sorted;
    _zaloFriendsRendered = 0;
    _renderMoreFriends();
  }
  const allOffBanner = document.getElementById('zalo-all-off-banner');
  if (allOffBanner) allOffBanner.style.display = (zaloMgrConfig.userAllowlist || []).length === 0 ? 'block' : 'none';
}
```

- [ ] **Step 3: Add _renderMoreFriendsActive() and _renderMoreFriendsInactive()**

```javascript
function _renderMoreFriendsActive() {
  const list = document.getElementById('zalo-mgr-friends-list');
  if (!list) return;
  const batch = _zaloFriendsActiveList.slice(_zaloFriendsActiveRendered, _zaloFriendsActiveRendered + ZALO_FRIENDS_PAGE_SIZE);
  const oldBtn = document.getElementById('zalo-friends-active-more');
  if (oldBtn) oldBtn.remove();
  const fragment = document.createDocumentFragment();
  const tmp = document.createElement('div');
  tmp.innerHTML = batch.map(f => _renderFriendItem(f)).join('');
  while (tmp.firstChild) fragment.appendChild(tmp.firstChild);
  _zaloFriendsActiveRendered += batch.length;
  const divider = document.getElementById('zalo-friends-divider');
  if (divider) list.insertBefore(fragment, divider);
  else list.appendChild(fragment);
  if (_zaloFriendsActiveRendered < _zaloFriendsActiveList.length) {
    const remaining = _zaloFriendsActiveList.length - _zaloFriendsActiveRendered;
    const btn = document.createElement('button');
    btn.id = 'zalo-friends-active-more';
    btn.className = 'btn btn-secondary';
    btn.style.cssText = 'width:100%;margin-top:6px;padding:8px;font-size:11px';
    btn.textContent = `Xem thêm ${Math.min(remaining, ZALO_FRIENDS_PAGE_SIZE)} / ${remaining} còn lại`;
    btn.onclick = _renderMoreFriendsActive;
    if (divider) list.insertBefore(btn, divider);
    else list.appendChild(btn);
  }
}

function _renderMoreFriendsInactive() {
  const list = document.getElementById('zalo-mgr-friends-list');
  if (!list) return;
  const batch = _zaloFriendsInactiveList.slice(_zaloFriendsInactiveRendered, _zaloFriendsInactiveRendered + ZALO_FRIENDS_PAGE_SIZE);
  const oldBtn = document.getElementById('zalo-friends-inactive-more');
  if (oldBtn) oldBtn.remove();
  const fragment = document.createDocumentFragment();
  const tmp = document.createElement('div');
  tmp.innerHTML = batch.map(f => _renderFriendItem(f, { inactive: true })).join('');
  while (tmp.firstChild) fragment.appendChild(tmp.firstChild);
  _zaloFriendsInactiveRendered += batch.length;
  list.appendChild(fragment);
  if (_zaloFriendsInactiveRendered < _zaloFriendsInactiveList.length) {
    const remaining = _zaloFriendsInactiveList.length - _zaloFriendsInactiveRendered;
    const btn = document.createElement('button');
    btn.id = 'zalo-friends-inactive-more';
    btn.className = 'btn btn-secondary';
    btn.style.cssText = 'width:100%;margin-top:6px;padding:8px;font-size:11px';
    btn.textContent = `Xem thêm ${Math.min(remaining, ZALO_FRIENDS_PAGE_SIZE)} / ${remaining} còn lại`;
    btn.onclick = _renderMoreFriendsInactive;
    list.appendChild(btn);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat: rewrite renderZaloFriends with tab-aware filtering and dual pagination"
```

---

## Chunk 5: Row Disappearance Animation + State Change Handlers

### Task 8: Add fade-out on state change + toast

**Files:**
- Modify: `electron/ui/dashboard.html` — `setGroupMode` (lines ~7296-7315), `toggleUserReply` (lines ~7431-7445)

- [ ] **Step 1: Replace setGroupMode() entirely**

Replace the entire `setGroupMode` function (search for `function setGroupMode(groupId, mode)`) with this complete replacement:

```javascript
function setGroupMode(groupId, mode) {
  const row = document.querySelector(`.zc[data-group-id="${groupId}"]`);
  const wasActive = _isGroupActive(groupId);
  if (!zaloMgrConfig.groupSettings) zaloMgrConfig.groupSettings = {};
  const prev = zaloMgrConfig.groupSettings[groupId] || {};
  zaloMgrConfig.groupSettings[groupId] = { ...prev, mode };
  if (!zaloMgrConfig.groupAllowFrom) zaloMgrConfig.groupAllowFrom = [];
  if (isOpenGroupMode()) {
    zaloMgrConfig.groupAllowFrom = zaloGroups.map(g => g.groupId);
    zaloMgrConfig.groupPolicy = 'allowlist';
  }
  const arr = zaloMgrConfig.groupAllowFrom;
  if (mode === 'off') {
    const i = arr.indexOf(groupId);
    if (i !== -1) arr.splice(i, 1);
  } else {
    if (!arr.includes(groupId)) arr.push(groupId);
  }
  const nowActive = _isGroupActive(groupId);
  const shouldFade = row && _zaloGroupTab === 'active' && wasActive && !nowActive;
  if (shouldFade) {
    const gName = row.querySelector('.zc-name-text')?.textContent || '';
    row.classList.add('zc-fading');
    setTimeout(() => { renderZaloGroups(); showToast(`Đã tắt ${gName}`, 'info'); }, 300);
  } else {
    renderZaloGroups();
  }
  autoSaveZaloManager();
}
```

- [ ] **Step 2: Modify toggleUserReply() similarly**

Add fade-out when disabling a friend while on "active" tab:

```javascript
function toggleUserReply(userId, checked) {
  const row = document.querySelector(`.zc[data-user-id="${userId}"]`);
  const wasActive = _isFriendActive(userId);
  const arr = zaloMgrConfig.userAllowlist || [];
  if (checked) {
    if (!arr.includes(userId)) arr.push(userId);
  } else {
    const i = arr.indexOf(userId);
    if (i !== -1) arr.splice(i, 1);
  }
  zaloMgrConfig.userAllowlist = arr;
  zaloUserAllowlistTouched = true;
  const nowActive = _isFriendActive(userId);
  const shouldFade = row && _zaloFriendTab === 'active' && wasActive && !nowActive;
  if (shouldFade) {
    const fName = row.querySelector('.zc-name')?.textContent || '';
    row.classList.add('zc-fading');
    setTimeout(() => { renderZaloFriends(); showToast(`Đã tắt ${fName.trim()}`, 'info'); }, 300);
  } else {
    renderZaloFriends();
  }
  const _aob = document.getElementById('zalo-all-off-banner');
  if (_aob) _aob.style.display = arr.length === 0 ? 'block' : 'none';
  autoSaveZaloManager();
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat: add fade-out animation and toast on row state change in active tab"
```

### Task 9: Wire up updateGroupInternal and updateUserInternal for NB tag

**Files:**
- Modify: `electron/ui/dashboard.html` — `updateGroupInternal` (lines ~7152-7164), `updateUserInternal` (lines ~7166-7181)

- [ ] **Step 1: Update both functions to re-render and update counts**

Add `_updateZaloSegCounts()` call at end of both `updateGroupInternal` and `updateUserInternal`, plus call the appropriate render function to refresh the NB tag state:

After the existing `autoSaveZaloManager()` call in each, add:
```javascript
_updateZaloSegCounts();
if (_zaloGroupTab === 'internal') renderZaloGroups(); // re-filter if viewing internal tab
```

(Same pattern for friends: `if (_zaloFriendTab === 'internal') renderZaloFriends();`)

- [ ] **Step 2: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "feat: wire NB tag toggle to re-render and update segment counts"
```

---

**Note — Spec Section 6 (Toolbar Cleanup):** Already implemented in current codebase. The toolbar has `.zs-label` uppercase labels above each dropdown and `.zalo-toolbar-sep` divider after the toggle switch. No changes needed.

---

## Chunk 6: Final Polish + Manual Testing

### Task 10: Remove stale CSS and verify

**Files:**
- Modify: `electron/ui/dashboard.html`

- [ ] **Step 1: Clean up old CSS**

Remove the now-unused `.zc-badge` color rules (the badge element is no longer rendered):
- `.zc-state-on .zc-badge` (line ~513)
- `.zc-state-mention .zc-badge` (line ~515)
- `.zc-state-off .zc-badge` (line ~518 — already replaced in Task 1)

Keep `.zc .zc-badge` base style (line ~509) for now in case other pages use it. Only remove the state-specific color rules.

- [ ] **Step 2: Commit**

```bash
git add electron/ui/dashboard.html
git commit -m "chore: remove stale zc-badge state CSS rules"
```

### Task 11: Manual verification

- [ ] **Step 1: Start dev server and open Dashboard → Zalo page**

Run: `npm start` in `electron/` directory.

- [ ] **Step 2: Verify default "Dang bat" tab**

Expected: Only active groups/friends shown. Green/yellow left borders. No "Tat" badges. Pill selector shows current mode highlighted.

- [ ] **Step 3: Verify "Tat ca" tab**

Expected: Active items on top, divider line "Đã tắt", inactive items below at 55% opacity. Two independent "Xem thêm" buttons if >30 items per section. Bulk links "Bật tất cả / Tắt tất cả" visible below search.

- [ ] **Step 4: Verify "Noi bo" tab**

Expected: Only internal-flagged items. All at full opacity. Purple "NB" tag visible.

- [ ] **Step 5: Verify row state change animation**

On "Dang bat" tab: click "Tắt" pill on a group → row fades out over 300ms → toast "Đã tắt [name]" appears. Switch to "Tat ca" tab → row visible in inactive section.

- [ ] **Step 6: Verify search + tab switch**

Type a search query → switch tab → search input cleared. Results respect tab filter.

- [ ] **Step 7: Verify empty states**

Disable all groups → "Dang bat" tab shows "Chưa bật nhóm nào. Chuyển sang tab "Tất cả" để bật." Warning banner appears for friends.

- [ ] **Step 8: Verify <1400px responsive**

Resize window below 1400px → pill labels should remain readable (smaller padding).

- [ ] **Step 9: Final commit if any fixes needed**

```bash
git add electron/ui/dashboard.html
git commit -m "fix: polish zalo page redesign after manual testing"
```
