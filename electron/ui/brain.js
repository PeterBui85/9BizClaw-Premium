/**
 * brain.js — Canvas 2D graph renderer for the Brain tab.
 *
 * Loaded via <script src="brain.js"></script> in dashboard.html.
 * Renderer-only (contextIsolation: true). Accesses backend via window.claw.* bridges.
 *
 * Expected DOM elements (created in dashboard.html):
 *   #brain-canvas          — <canvas>
 *   #brain-panel           — side panel container
 *   #brain-panel-close     — close button inside panel
 *   #brain-panel-dot       — colored dot in panel header
 *   #brain-panel-label     — node label text
 *   #brain-panel-type      — type tag
 *   #brain-panel-links     — chips container for connected nodes
 *   #brain-panel-content   — markdown content preview
 *   #brain-panel-action    — action button
 *   #brain-search          — search input
 *   #brain-stats           — bottom-left stats text
 *   #brain-refresh         — refresh button
 *   .brain-filter-chip     — filter chips with data-type attribute
 *   #brain-zoom-in         — zoom in button
 *   #brain-zoom-out        — zoom out button
 *
 * Globals from dashboard.html: showToast(msg, type), marked, DOMPurify
 */

/* ── Module state ──────────────────────────────────────────────── */

var _brainNodes = [];
var _brainEdges = [];
var _brainStats = null;
var _brainNodeMap = {};          // id → node
var _brainAdjacency = {};        // id → [{node, edge}]

var _brainScale = 1;
var _brainOffsetX = 0;
var _brainOffsetY = 0;

var _brainSelectedId = null;
var _brainHoveredNode = null;
var _brainSearchMatches = null;  // Set of node IDs or null
var _brainFilters = {            // true = visible
  customer: true,
  group: true,
  doc: true,
  learning: true,
  skill: true
};

var _brainRafPending = false;
var _brainPanning = false;
var _brainPanStartX = 0;
var _brainPanStartY = 0;
var _brainPanStartOX = 0;
var _brainPanStartOY = 0;
var _brainRefreshing = false;
var _brainInitialized = false;

/* ── Color constants ───────────────────────────────────────────── */

var BRAIN_COLORS = {
  customer: '#eab308',
  group:    '#818cf8',
  doc:      '#f87171',
  learning: '#94a3b8',
  skill:    '#a78bfa'
};

var BRAIN_BG = '#1a1a2e';

/* ── Coordinate transforms ─────────────────────────────────────── */

function screenToGraph(sx, sy) {
  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return { x: 0, y: 0 };
  var rect = canvas.getBoundingClientRect();
  var cx = sx - rect.left;
  var cy = sy - rect.top;
  return {
    x: (cx - _brainOffsetX) / _brainScale,
    y: (cy - _brainOffsetY) / _brainScale
  };
}

function graphToScreen(gx, gy) {
  return {
    x: gx * _brainScale + _brainOffsetX,
    y: gy * _brainScale + _brainOffsetY
  };
}

/* ── Load graph data ───────────────────────────────────────────── */

async function loadBrainGraph() {
  var data = null;
  try {
    data = await window.claw.getBrainGraph();
  } catch (e) {
    console.error('[brain] getBrainGraph failed:', e);
  }

  if (!data || !data.nodes) {
    _brainNodes = [];
    _brainEdges = [];
    _brainStats = null;
  } else {
    _brainNodes = data.nodes || [];
    _brainEdges = data.edges || [];
    _brainStats = data.stats || null;
  }

  // Build lookup maps
  _brainNodeMap = {};
  _brainAdjacency = {};
  for (var i = 0; i < _brainNodes.length; i++) {
    var n = _brainNodes[i];
    _brainNodeMap[n.id] = n;
    _brainAdjacency[n.id] = [];
  }
  for (var j = 0; j < _brainEdges.length; j++) {
    var e = _brainEdges[j];
    if (_brainAdjacency[e.source]) _brainAdjacency[e.source].push({ node: _brainNodeMap[e.target], edge: e });
    if (_brainAdjacency[e.target]) _brainAdjacency[e.target].push({ node: _brainNodeMap[e.source], edge: e });
  }

  _brainSelectedId = null;
  _brainHoveredNode = null;
  _brainSearchMatches = null;

  _updateFilterCounts();
  _updateBrainStats();

  if (!_brainInitialized) {
    _initBrainCanvas();
    _brainInitialized = true;
  }

  _fitGraphToView();
  _requestBrainRender();
}

/* ── Canvas init + event binding ───────────────────────────────── */

function _initBrainCanvas() {
  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return;

  _resizeBrainCanvas();
  window.addEventListener('resize', _resizeBrainCanvas);

  canvas.addEventListener('wheel', _onBrainWheel, { passive: false });
  canvas.addEventListener('mousedown', _onBrainMouseDown);
  canvas.addEventListener('mousemove', _onBrainMouseMove);
  canvas.addEventListener('mouseup', _onBrainMouseUp);
  canvas.addEventListener('mouseleave', _onBrainMouseLeave);
  canvas.addEventListener('click', _onBrainClick);

  // Listen for rebuild completion
  if (window.claw.onBrainGraphRebuilt) {
    window.claw.onBrainGraphRebuilt(function() {
      _brainRefreshing = false;
      var btn = document.getElementById('brain-refresh');
      if (btn) btn.classList.remove('spinning');
      loadBrainGraph();
      showToast('Brain graph đã cập nhật xong', 'success');
    });
  }
}

function _resizeBrainCanvas() {
  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return;
  var parent = canvas.parentElement;
  if (!parent) return;
  var dpr = window.devicePixelRatio || 1;
  var w = parent.clientWidth;
  var h = parent.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  _requestBrainRender();
}

/* ── Fit graph to view ─────────────────────────────────────────── */

function _fitGraphToView() {
  var canvas = document.getElementById('brain-canvas');
  if (!canvas || _brainNodes.length === 0) return;

  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < _brainNodes.length; i++) {
    var n = _brainNodes[i];
    if (!_brainFilters[n.type]) continue;
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  if (!isFinite(minX)) return;

  var dpr = window.devicePixelRatio || 1;
  var cw = canvas.width / dpr;
  var ch = canvas.height / dpr;
  var graphW = maxX - minX || 1;
  var graphH = maxY - minY || 1;
  var padding = 100;

  _brainScale = Math.min((cw - padding * 2) / graphW, (ch - padding * 2) / graphH);
  _brainScale = Math.max(0.05, Math.min(5, _brainScale));

  var cx = (minX + maxX) / 2;
  var cy = (minY + maxY) / 2;
  _brainOffsetX = cw / 2 - cx * _brainScale;
  _brainOffsetY = ch / 2 - cy * _brainScale;
}

/* ── Render ────────────────────────────────────────────────────── */

function _requestBrainRender() {
  if (_brainRafPending) return;
  _brainRafPending = true;
  requestAnimationFrame(function() {
    _brainRafPending = false;
    renderGraph();
  });
}

function renderGraph() {
  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var cw = canvas.width / dpr;
  var ch = canvas.height / dpr;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = BRAIN_BG;
  ctx.fillRect(0, 0, cw, ch);

  // Empty state
  if (_brainNodes.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Chưa có dữ liệu. Bot sẽ tự động xây dựng bộ não khi có khách hàng.', cw / 2, ch / 2);
    ctx.restore();
    return;
  }

  // Apply transform
  ctx.translate(_brainOffsetX, _brainOffsetY);
  ctx.scale(_brainScale, _brainScale);

  // Build visible set
  var visibleSet = {};
  for (var i = 0; i < _brainNodes.length; i++) {
    var n = _brainNodes[i];
    if (_brainFilters[n.type]) visibleSet[n.id] = true;
  }

  // Draw edges
  var edgeColors = { membership: '#6366f1', reference: '#f59e0b', escalation: '#ef4444', semantic: '#22c55e' };
  var edgePx = 1 / _brainScale;
  for (var j = 0; j < _brainEdges.length; j++) {
    var e = _brainEdges[j];
    if (!visibleSet[e.source] || !visibleSet[e.target]) continue;
    var src = _brainNodeMap[e.source];
    var tgt = _brainNodeMap[e.target];
    if (!src || !tgt) continue;

    var isConnected = _brainSelectedId && (e.source === _brainSelectedId || e.target === _brainSelectedId);
    var alpha = isConnected ? 0.9 : Math.min(0.5, 0.15 + (e.weight || 1) * 0.08);
    var eColor = edgeColors[e.type] || '#6b7280';

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.strokeStyle = isConnected ? '#a5b4fc' : eColor;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = isConnected ? edgePx * 2 : edgePx;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Draw nodes
  for (var k = 0; k < _brainNodes.length; k++) {
    var node = _brainNodes[k];
    if (!visibleSet[node.id]) continue;

    var radius = Math.max(2, Math.min(7, Math.sqrt(node.size || 4))) / _brainScale;
    var color = BRAIN_COLORS[node.type] || '#94a3b8';
    var isSearch = _brainSearchMatches && _brainSearchMatches.has(node.id);
    var isSelected = node.id === _brainSelectedId;

    // Search glow
    if (isSearch) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Node circle
    ctx.beginPath();
    var drawRadius = isSearch ? radius * 2 : radius;
    ctx.arc(node.x, node.y, drawRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Selected ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, drawRadius + 2 / _brainScale, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / _brainScale;
      ctx.stroke();
    }
  }

  // Hovered node label
  if (_brainHoveredNode && visibleSet[_brainHoveredNode.id]) {
    var hn = _brainHoveredNode;
    var fontSize = Math.max(10, 12 / _brainScale);
    ctx.font = 'bold ' + fontSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';

    var labelText = hn.label || hn.id;
    var metrics = ctx.measureText(labelText);
    var labelX = hn.x + 8 / _brainScale;
    var labelY = hn.y - 6 / _brainScale;
    var padH = 4 / _brainScale;
    var padW = 6 / _brainScale;

    // Label background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    var rx = labelX - padW;
    var ry = labelY - fontSize - padH;
    var rw = metrics.width + padW * 2;
    var rh = fontSize + padH * 2;
    var cr = 3 / _brainScale;
    ctx.moveTo(rx + cr, ry);
    ctx.lineTo(rx + rw - cr, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + cr);
    ctx.lineTo(rx + rw, ry + rh - cr);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - cr, ry + rh);
    ctx.lineTo(rx + cr, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - cr);
    ctx.lineTo(rx, ry + cr);
    ctx.quadraticCurveTo(rx, ry, rx + cr, ry);
    ctx.fill();

    // Label text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, labelX, labelY);
  }

  ctx.restore();
}

/* ── Hit testing ───────────────────────────────────────────────── */

function _hitTestBrainNode(sx, sy) {
  var g = screenToGraph(sx, sy);
  var hitRadius = 20 / _brainScale;
  var closest = null;
  var closestDist = Infinity;

  for (var i = 0; i < _brainNodes.length; i++) {
    var n = _brainNodes[i];
    if (!_brainFilters[n.type]) continue;
    var dx = n.x - g.x;
    var dy = n.y - g.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var nodeR = Math.max(2, Math.min(7, Math.sqrt(n.size || 4))) / _brainScale;
    if (dist < hitRadius + nodeR && dist < closestDist) {
      closestDist = dist;
      closest = n;
    }
  }
  return closest;
}

/* ── Mouse events ──────────────────────────────────────────────── */

function _onBrainWheel(ev) {
  ev.preventDefault();
  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return;
  var rect = canvas.getBoundingClientRect();
  var mx = ev.clientX - rect.left;
  var my = ev.clientY - rect.top;

  var delta = ev.deltaY > 0 ? 0.9 : 1.1;
  var newScale = _brainScale * delta;
  newScale = Math.max(0.1, Math.min(10, newScale));

  // Zoom toward cursor
  _brainOffsetX = mx - (mx - _brainOffsetX) * (newScale / _brainScale);
  _brainOffsetY = my - (my - _brainOffsetY) * (newScale / _brainScale);
  _brainScale = newScale;

  _requestBrainRender();
}

var _brainDragDist = 0;
var _brainMouseDownHit = null;

function _onBrainMouseDown(ev) {
  if (ev.button !== 0) return;
  _brainDragDist = 0;
  _brainPanStartX = ev.clientX;
  _brainPanStartY = ev.clientY;
  _brainPanStartOX = _brainOffsetX;
  _brainPanStartOY = _brainOffsetY;
  _brainMouseDownHit = _hitTestBrainNode(ev.clientX, ev.clientY);
  _brainPanning = true;
  var canvas = document.getElementById('brain-canvas');
  if (canvas) canvas.style.cursor = _brainMouseDownHit ? 'pointer' : 'grabbing';
}

function _onBrainMouseMove(ev) {
  if (_brainPanning) {
    var dx = ev.clientX - _brainPanStartX;
    var dy = ev.clientY - _brainPanStartY;
    _brainDragDist = Math.sqrt(dx * dx + dy * dy);
    _brainOffsetX = _brainPanStartOX + dx;
    _brainOffsetY = _brainPanStartOY + dy;
    _requestBrainRender();
    return;
  }

  var hit = _hitTestBrainNode(ev.clientX, ev.clientY);
  var canvas = document.getElementById('brain-canvas');
  if (hit) {
    if (canvas) canvas.style.cursor = 'pointer';
    if (_brainHoveredNode !== hit) {
      _brainHoveredNode = hit;
      _requestBrainRender();
    }
  } else {
    if (canvas) canvas.style.cursor = 'default';
    if (_brainHoveredNode) {
      _brainHoveredNode = null;
      _requestBrainRender();
    }
  }
}

function _onBrainMouseUp(ev) {
  if (!_brainPanning) return;
  _brainPanning = false;
  var canvas = document.getElementById('brain-canvas');
  if (canvas) canvas.style.cursor = 'default';

  // Click vs drag: if moved < 5px, treat as click
  if (_brainDragDist < 5) {
    // Undo any micro-pan
    _brainOffsetX = _brainPanStartOX;
    _brainOffsetY = _brainPanStartOY;
    var hit = _brainMouseDownHit || _hitTestBrainNode(ev.clientX, ev.clientY);
    if (hit) {
      _brainSelectedId = hit.id;
      openBrainPanel(hit.id);
    } else {
      _brainSelectedId = null;
      closeBrainPanel();
    }
    _requestBrainRender();
  }
}

function _onBrainMouseLeave() {
  _brainPanning = false;
  if (_brainHoveredNode) {
    _brainHoveredNode = null;
    _requestBrainRender();
  }
}

function _onBrainClick() {}

/* ── Zoom buttons ──────────────────────────────────────────────── */

function brainZoomIn() {
  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return;
  var dpr = window.devicePixelRatio || 1;
  var cx = (canvas.width / dpr) / 2;
  var cy = (canvas.height / dpr) / 2;
  var newScale = Math.min(10, _brainScale * 1.3);
  _brainOffsetX = cx - (cx - _brainOffsetX) * (newScale / _brainScale);
  _brainOffsetY = cy - (cy - _brainOffsetY) * (newScale / _brainScale);
  _brainScale = newScale;
  _requestBrainRender();
}

function brainZoomOut() {
  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return;
  var dpr = window.devicePixelRatio || 1;
  var cx = (canvas.width / dpr) / 2;
  var cy = (canvas.height / dpr) / 2;
  var newScale = Math.max(0.1, _brainScale / 1.3);
  _brainOffsetX = cx - (cx - _brainOffsetX) * (newScale / _brainScale);
  _brainOffsetY = cy - (cy - _brainOffsetY) * (newScale / _brainScale);
  _brainScale = newScale;
  _requestBrainRender();
}

/* ── Filter chips ──────────────────────────────────────────────── */

function toggleBrainFilter(type) {
  _brainFilters[type] = !_brainFilters[type];
  var chips = document.querySelectorAll('.brain-chip');
  chips.forEach(function(chip) {
    if (chip.dataset.type === type) {
      chip.classList.toggle('off', !_brainFilters[type]);
    }
  });
  _requestBrainRender();
}

function _updateFilterCounts() {
  var counts = { customer: 0, group: 0, doc: 0, learning: 0, skill: 0 };
  for (var i = 0; i < _brainNodes.length; i++) {
    var t = _brainNodes[i].type;
    if (counts[t] !== undefined) counts[t]++;
  }
  var types = Object.keys(counts);
  for (var j = 0; j < types.length; j++) {
    var el = document.getElementById('brain-count-' + types[j]);
    if (el) el.textContent = counts[types[j]];
  }
}

/* ── Stats display ─────────────────────────────────────────────── */

function _updateBrainStats() {
  var el = document.getElementById('brain-stats');
  if (!el) return;
  var nc = _brainStats ? _brainStats.nodes : _brainNodes.length;
  var ec = _brainStats ? _brainStats.edges : _brainEdges.length;
  el.textContent = nc + ' nodes · ' + ec + ' edges';
}

/* ── Search ────────────────────────────────────────────────────── */

function searchBrainGraph(query) {
  if (!query || !query.trim()) {
    _brainSearchMatches = null;
    _requestBrainRender();
    return;
  }

  // Normalize: strip diacritics for fuzzy matching
  var norm = _stripDiacritics(query.trim().toLowerCase());
  var matches = new Set();

  for (var i = 0; i < _brainNodes.length; i++) {
    var n = _brainNodes[i];
    if (!_brainFilters[n.type]) continue;
    var label = _stripDiacritics((n.label || '').toLowerCase());
    if (label.indexOf(norm) !== -1) {
      matches.add(n.id);
    }
  }

  _brainSearchMatches = matches.size > 0 ? matches : null;

  // Auto-fit camera to matching nodes
  if (matches.size > 0) {
    _fitToNodes(matches);
  }

  _requestBrainRender();
}

function _stripDiacritics(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function _fitToNodes(idSet) {
  var canvas = document.getElementById('brain-canvas');
  if (!canvas) return;

  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  var count = 0;
  for (var i = 0; i < _brainNodes.length; i++) {
    var n = _brainNodes[i];
    if (!idSet.has(n.id)) continue;
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
    count++;
  }
  if (count === 0 || !isFinite(minX)) return;

  var dpr = window.devicePixelRatio || 1;
  var cw = canvas.width / dpr;
  var ch = canvas.height / dpr;
  var padding = 80;

  if (count === 1) {
    // Center on single node with moderate zoom
    _brainScale = 2;
    _brainOffsetX = cw / 2 - minX * _brainScale;
    _brainOffsetY = ch / 2 - minY * _brainScale;
  } else {
    var graphW = maxX - minX || 1;
    var graphH = maxY - minY || 1;
    _brainScale = Math.min((cw - padding * 2) / graphW, (ch - padding * 2) / graphH);
    _brainScale = Math.max(0.1, Math.min(10, _brainScale));
    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;
    _brainOffsetX = cw / 2 - cx * _brainScale;
    _brainOffsetY = ch / 2 - cy * _brainScale;
  }
}

/* ── Side panel ────────────────────────────────────────────────── */

async function openBrainPanel(nodeId) {
  var panel = document.getElementById('brain-panel');
  if (!panel) return;

  var node = _brainNodeMap[nodeId];
  if (!node) return;

  panel.classList.add('open');

  // Header
  var dot = document.getElementById('brain-panel-dot');
  if (dot) dot.style.background = BRAIN_COLORS[node.type] || '#94a3b8';

  var labelEl = document.getElementById('brain-panel-label');
  if (labelEl) labelEl.textContent = node.label || node.id;

  var typeEl = document.getElementById('brain-panel-type');
  if (typeEl) {
    var typeLabels = {
      customer: 'Khách hàng',
      group: 'Nhóm',
      doc: 'Tài liệu',
      learning: 'Học hỏi',
      skill: 'Kỹ năng'
    };
    typeEl.textContent = typeLabels[node.type] || node.type;
  }

  // Connected nodes chips
  var linksEl = document.getElementById('brain-panel-chips');
  if (linksEl) {
    linksEl.innerHTML = '';
    var adj = _brainAdjacency[nodeId] || [];
    for (var i = 0; i < adj.length && i < 20; i++) {
      var linked = adj[i].node;
      if (!linked) continue;
      var chip = document.createElement('span');
      chip.className = 'bpl-chip';
      chip.textContent = linked.label || linked.id;
      chip.style.borderColor = BRAIN_COLORS[linked.type] || '#94a3b8';
      chip.style.color = BRAIN_COLORS[linked.type] || '#94a3b8';
      chip.dataset.nodeId = linked.id;
      chip.addEventListener('click', _onLinkChipClick);
      linksEl.appendChild(chip);
    }
    if (adj.length === 0) {
      linksEl.innerHTML = '<span class="brain-panel-empty">Không có liên kết</span>';
    }
  }

  // Fetch detail content
  var contentEl = document.getElementById('brain-panel-content');
  if (contentEl) {
    contentEl.innerHTML = '<span class="brain-panel-loading">...</span>';
    try {
      var detail = await window.claw.getBrainNodeDetail(nodeId);
      if (detail && detail.content) {
        var truncated = detail.content.length > 500
          ? detail.content.substring(0, 500) + '...'
          : detail.content;
        var html = DOMPurify.sanitize(marked.parse(truncated));
        contentEl.innerHTML = html;
      } else {
        contentEl.innerHTML = '<span class="brain-panel-empty">Không có nội dung</span>';
      }
    } catch (err) {
      contentEl.innerHTML = '<span class="brain-panel-empty">Không tải được nội dung</span>';
    }
  }

  // Action button
  var actionEl = document.getElementById('brain-panel-action');
  if (actionEl) {
    var actionMap = {
      customer: { label: 'Mở trong Zalo', page: 'zalo' },
      group:    { label: 'Mở trong Zalo', page: 'zalo' },
      doc:      { label: 'Mở trong Knowledge', page: 'knowledge' },
      learning: null,
      skill:    null
    };
    var action = actionMap[node.type];
    if (action) {
      actionEl.textContent = action.label;
      actionEl.style.display = '';
      actionEl.onclick = function() {
        if (typeof switchPage === 'function') switchPage(action.page);
      };
    } else {
      actionEl.style.display = 'none';
    }
  }
}

function closeBrainPanel() {
  var panel = document.getElementById('brain-panel');
  if (panel) panel.classList.remove('open');
}

function _onLinkChipClick(ev) {
  var nodeId = ev.currentTarget.dataset.nodeId;
  if (!nodeId || !_brainNodeMap[nodeId]) return;

  var node = _brainNodeMap[nodeId];
  _brainSelectedId = nodeId;

  // Center camera on linked node
  var canvas = document.getElementById('brain-canvas');
  if (canvas) {
    var dpr = window.devicePixelRatio || 1;
    var cw = canvas.width / dpr;
    var ch = canvas.height / dpr;
    _brainOffsetX = cw / 2 - node.x * _brainScale;
    _brainOffsetY = ch / 2 - node.y * _brainScale;
  }

  openBrainPanel(nodeId);
  _requestBrainRender();
}

/* ── Refresh ───────────────────────────────────────────────────── */

function refreshBrainGraph() {
  if (_brainRefreshing) return;
  _brainRefreshing = true;

  var btn = document.getElementById('brain-refresh');
  if (btn) btn.classList.add('spinning');

  window.claw.rebuildBrainGraph().catch(function(err) {
    console.error('[brain] rebuildBrainGraph failed:', err);
    _brainRefreshing = false;
    if (btn) btn.classList.remove('spinning');
    showToast('Không thể cập nhật Brain graph', 'error');
  });
}
