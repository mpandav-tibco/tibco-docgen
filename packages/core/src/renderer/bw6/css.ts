const CSS = `
:root {
  --brand:          #1a56db;
  --brand-dark:     #1048c0;
  --brand-glow:     #1a56db22;
  --sidebar-bg:     #0c2461;
  --sidebar-fg:     #93c5fd;
  --sidebar-hover:  #1a3484;
  --sidebar-active: #60a5fa;
  --header-bg:      #0c2461;
  --header-fg:      #ffffff;
  --content-bg:     #f4f6f9;
  --card-bg:        #ffffff;
  --border:         #e2e8f0;
  --text:           #0f172a;
  --text-muted:     #64748b;
  --link:           #1a56db;
  --mono:           'Cascadia Code', 'Consolas', monospace;
  --sidebar-w:      270px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; font-family: 'Segoe UI', system-ui, sans-serif; color: var(--text); background: var(--content-bg); }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Layout */
.shell { display: flex; height: 100vh; overflow: hidden; }
.sidebar { width: var(--sidebar-w, 270px); flex-shrink: 0; background: var(--sidebar-bg); color: var(--sidebar-fg); display: flex; flex-direction: column; overflow-y: auto; }
.sidebar::-webkit-scrollbar { width: 4px; }
.sidebar::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
/* Resizable sidebar drag handle */
.sidebar-drag { width: 5px; flex-shrink: 0; background: transparent; cursor: col-resize; position: relative; z-index: 10; transition: background 0.15s; }
.sidebar-drag:hover, .sidebar-drag.dragging { background: var(--brand); }
.sidebar-drag::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 2px; height: 32px; background: #334155; border-radius: 1px; }
.sidebar-drag:hover::after, .sidebar-drag.dragging::after { background: var(--brand); }
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.topbar { background: var(--header-bg); color: var(--header-fg); padding: 0 20px; height: 48px; display: flex; align-items: center; flex-shrink: 0; border-bottom: 1px solid #1a3484; }
.topbar-brand { display: flex; align-items: center; gap: 9px; }
.topbar-brand .brand-icon { font-size: 20px; line-height: 1; }
.topbar-brand .brand-wordmark { display: flex; flex-direction: column; gap: 0; }
.topbar-brand .brand-name { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; background: linear-gradient(90deg, #93c5fd 0%, #bfdbfe 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; line-height: 1.1; }
.topbar-brand .brand-tagline { font-size: 9px; font-weight: 400; color: #475569; letter-spacing: 0.12em; text-transform: uppercase; line-height: 1; }
.topbar-meta { font-size: 11px; color: #94a3b8; margin-left: auto; display: flex; gap: 10px; align-items: center; }
.edition-badge { background: #1a56db30; color: #93c5fd; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; }
.edition-badge-bwce { background: #111827; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; }
.deploy-badge-container { background: #00897b22; border-radius: 6px; padding: 3px 8px; border: 1px solid #00897b30; display: inline-flex; align-items: center; gap: 6px; }
.deploy-badge-container { flex-shrink: 0; }
.deploy-target-container { background: #1e3a5f22; border: 1px solid #1e3a5f40; border-radius: 6px; padding: 2px 8px; font-size: 10px; font-weight: 700; color: #60a5fa; }
.deploy-target-appspace  { background: #fffbeb; border: 1px solid #fbbf2440; border-radius: 6px; padding: 2px 8px; font-size: 10px; font-weight: 700; color: #b45309; }
.content { flex: 1; overflow-y: auto; padding: 28px 36px; }
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-thumb { background: #b2dfdb; border-radius: 3px; }

/* Sidebar — BW6 Project Explorer tree */
.sb-root { padding: 14px 12px 10px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #1a3484; }
.sb-root-name { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.sb-root-ver  { font-size: 10px; color: #64748b; margin-left: 4px; }

.sb-item { display: flex; align-items: center; padding: 4px 12px; font-size: 12.5px; color: var(--sidebar-fg); cursor: default; gap: 5px; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
a.sb-item { cursor: pointer; }
a.sb-item:hover { background: var(--sidebar-hover); color: #e2e8f0; text-decoration: none; }
a.sb-item.active { color: #60a5fa; font-weight: 600; background: #122d6e; }
.sb-item.folder-header { color: #e2e8f0; font-weight: 600; font-size: 12px; padding-top: 8px; padding-bottom: 4px; }
.sb-item.dim { color: #475569; font-size: 12px; }

.sb-i1 { padding-left: 24px; }
.sb-i2 { padding-left: 38px; }
.sb-i3 { padding-left: 52px; }

.sb-count { margin-left: auto; flex-shrink: 0; font-size: 10px; background: #1a3484; padding: 1px 5px; border-radius: 8px; color: #64748b; }
.sb-divider { border: none; border-top: 1px solid #1a3484; margin: 4px 0; }

/* Cards */
.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 22px; margin-bottom: 20px; }
.card-title { font-size: 15px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }

/* App info card */
.app-info-card { background: linear-gradient(135deg, #1a56db08 0%, #1048c005 100%); border: 1px solid #bfdbfe; border-radius: 10px; padding: 22px 26px; margin-bottom: 24px; }
.app-info-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
.app-info-title { font-size: 20px; font-weight: 700; color: var(--text); }
.app-info-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; font-family: var(--mono); }
.app-info-desc { font-size: 13px; color: var(--text-muted); font-style: italic; margin-bottom: 14px; line-height: 1.5; }
.app-info-grid { display: grid; grid-template-columns: 1fr; gap: 6px 0; font-size: 12px; }
.app-info-row { display: flex; gap: 6px; }
.app-info-label { color: var(--text-muted); white-space: nowrap; }
.app-info-value { color: var(--text); font-weight: 500; }

/* Stats grid */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 14px; margin-bottom: 24px; }
.stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px 18px; transition: border-color 0.15s, box-shadow 0.15s; display: block; text-decoration: none; color: inherit; }
a.stat-card:hover { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-glow); text-decoration: none; }
.stat-card .stat-icon { font-size: 22px; margin-bottom: 6px; }
.stat-card .val { font-size: 26px; font-weight: 700; color: var(--brand); }
.stat-card .lbl { font-size: 11px; font-weight: 600; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.06em; }

/* Page header */
.page-header { margin-bottom: 28px; }
.page-header h1 { font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.page-header .meta { font-size: 12px; color: var(--text-muted); margin-top: 5px; }
.page-header .desc { font-size: 13px; color: var(--text-muted); margin-top: 6px; font-style: italic; }
.breadcrumb { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.breadcrumb a { color: var(--brand); }

/* Tables */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { background: #f1f5f9; color: var(--brand-dark); font-weight: 600; padding: 9px 13px; text-align: left; white-space: nowrap; }
td { padding: 8px 13px; border-bottom: 1px solid var(--border); vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #f8fafc; }
.td-mono { font-family: var(--mono); font-size: 12px; }
.td-muted { color: var(--text-muted); }

/* Badges */
.badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge-starter { display: inline-block; padding: 2px 9px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.trans-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.trans-always  { background: #f1f5f9; color: #475569; }
.trans-error   { background: #fee2e2; color: #991b1b; }
.trans-cond    { background: #fff7ed; color: #92400e; }
.trans-default { background: #e0e7ff; color: #3730a3; }

/* Palette colour classes */
.pal-rest       { background: #ffedd5; color: #7c2d12; }
.pal-soap       { background: #ede9fe; color: #4c1d95; }
.pal-restx      { background: #fed7aa; color: #7c2d12; }
.pal-jdbc       { background: #ccfbf1; color: #134e4a; }
.pal-ems        { background: #e0e7ff; color: #1e1b4b; }
.pal-log        { background: #dbeafe; color: #1e3a8a; }
.pal-general    { background: #fce7f3; color: #831843; }
.pal-timer      { background: #fef9c3; color: #713f12; }
.pal-api        { background: #f1f5f9; color: #334155; }
.pal-sharedvar  { background: #e0f2fe; color: #075985; }
.pal-error      { background: #fee2e2; color: #991b1b; }
.pal-service    { background: #ede9fe; color: #4c1d95; }
.pal-subprocess { background: #f3e8ff; color: #6b21a8; }
.pal-file       { background: #ecfdf5; color: #065f46; }
.pal-xml        { background: #f0fdf4; color: #166534; }
/* Technology connector palettes */
.pal-kafka       { background: #fde8e8; color: #9b1c1c; }
.pal-sap         { background: #dbeafe; color: #1e40af; }
.pal-salesforce  { background: #e0f2fe; color: #0369a1; }
.pal-aws         { background: #fef3c7; color: #92400e; }
.pal-servicenow  { background: #d1fae5; color: #065f46; }
.pal-adb         { background: #f5f3ff; color: #5b21b6; }
/* Output fields */
.output-fields { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0; }
.output-field-pill { display: inline-block; background: #e0f2fe; color: #0369a1; font-size: 11px; font-family: var(--mono); padding: 2px 8px; border-radius: 10px; border: 1px solid #bae6fd; }
/* Fault-handler activity card highlight */
.act-card.fault-handler { border-left: 3px solid #dc2626; }
.act-card.fault-handler .act-card-header { background: #fff5f5; }
.act-card.fault-handler .act-card-header:hover { background: #fee2e2; }
.fault-handler-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #fee2e2; color: #991b1b; margin-left: auto; flex-shrink: 0; }

/* Subst var */
.subst-ref { background: #fef3c7; color: #92400e; padding: 1px 5px; border-radius: 3px; font-family: var(--mono); font-size: 11px; white-space: nowrap; }
.encrypted { background: #f1f5f9; color: #475569; padding: 1px 6px; border-radius: 3px; font-size: 11px; }

/* Input mappings table */
.mapping-section { margin-top: 10px; }
.mapping-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px; display: flex; align-items: center; gap: 5px; }
.mapping-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.mapping-table th { text-align: left; padding: 4px 10px; font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; background: #f0f7f6; border-bottom: 1px solid var(--border); }
.mapping-table td { padding: 4px 10px; border-bottom: 1px solid #f0f7f6; vertical-align: top; word-break: break-all; }
.mapping-table tr:last-child td { border-bottom: none; }
.mapping-table .map-target { font-family: var(--mono); font-size: 11px; color: #0f5f5f; width: 40%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.mapping-table .map-source { font-family: var(--mono); font-size: 11px; color: #1e40af; }
.module-prop-ref { background: #ede9fe; color: #4c1d95; padding: 1px 5px; border-radius: 3px; font-family: var(--mono); font-size: 11px; white-space: nowrap; }

/* Activity cards */
.act-card { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px; overflow: hidden; }
.act-card-header { display: flex; align-items: center; gap: 8px; padding: 9px 14px; background: #f8fcfb; cursor: pointer; user-select: none; }
.act-card-header:hover { background: #edf7f5; }
.act-chevron { font-size: 10px; color: var(--text-muted); transition: transform 0.2s; width: 12px; flex-shrink: 0; }
.act-card[data-expanded="true"] .act-chevron { transform: rotate(90deg); }
.act-card-body { padding: 10px 14px; display: none; }
.act-card[data-expanded="true"] .act-card-body { display: block; }
.act-card-idx { margin-left: auto; font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.act-name { font-weight: 600; font-size: 13px; }
.act-desc { font-size: 11px; color: var(--text-muted); margin-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }
.act-pal-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 500; flex-shrink: 0; }

/* Process starter card */
.starter-card { border: 1px solid #86efac; border-radius: 8px; background: #f0fdf4; padding: 18px 22px; margin-bottom: 20px; }
.starter-card h3 { color: #166534; font-size: 14px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.starter-kv { display: grid; grid-template-columns: 140px 1fr; gap: 5px 14px; font-size: 13px; margin-bottom: 10px; }
.starter-kv dt { color: var(--text-muted); font-weight: 500; }
.starter-kv dd { color: var(--text); }

/* Diagram */
.diagram-box { border: 1px solid var(--border); border-radius: 8px; overflow: auto; background: #fafbfc; padding: 8px; margin-bottom: 22px; max-height: 420px; }
.diagram-box svg { display: block; }

/* Schemas */
.schema-pre { background: #1e293b; color: #e2e8f0; padding: 14px; border-radius: 6px; font-family: var(--mono); font-size: 12px; overflow-x: auto; margin-top: 8px; white-space: pre-wrap; word-break: break-all; max-height: 380px; overflow-y: auto; }
.schema-card { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 10px; overflow: hidden; }
.schema-card-header { padding: 9px 14px; background: #f8fcfb; cursor: pointer; display: flex; align-items: center; gap: 10px; }
.schema-card-header:hover { background: #edf7f5; }
.schema-card-body { padding: 10px 14px; display: none; }
.schema-card[data-expanded="true"] .schema-card-body { display: block; }

/* SVG tooltips */
.svg-tooltip { position: fixed; z-index: 999; background: #0f1e2e; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px; font-size: 12px; pointer-events: none; display: none; max-width: 300px; line-height: 1.6; box-shadow: 0 4px 16px #0006; }
.svg-tooltip .tip-name { font-weight: 700; color: #5eead4; }
.svg-tooltip .tip-type { color: #94a3b8; font-size: 11px; }
.svg-tooltip .tip-desc { margin-top: 4px; color: #cbd5e1; font-style: italic; }
.svg-tooltip .tip-cond { font-family: var(--mono); font-size: 11px; background: #1e3a5f; padding: 2px 5px; border-radius: 3px; color: #fbbf24; }
.diagram-box .activity { cursor: pointer !important; }
.diagram-box .flow-link { cursor: pointer; }

/* Sidebar collapsible sections */
.sb-section {}
.sb-section-toggle { display: flex; align-items: center; width: 100%; cursor: pointer; user-select: none; }
.sb-section-toggle:hover { background: var(--sidebar-hover); }
.sb-section-toggle .sb-caret { margin-left: auto; font-size: 9px; color: #64748b; transition: transform 0.2s; flex-shrink: 0; padding-right: 10px; }
.sb-section.collapsed .sb-caret { transform: rotate(-90deg); }
.sb-section-body { overflow: hidden; }
.sb-section.collapsed .sb-section-body { display: none; }

/* Misc */
.toggle-bar { display: flex; gap: 8px; margin-bottom: 14px; }
.toggle-btn { padding: 4px 12px; border-radius: 5px; border: 1px solid var(--border); background: var(--card-bg); color: var(--text-muted); font-size: 12px; cursor: pointer; }
.toggle-btn:hover { background: #e8f5f3; color: var(--brand); border-color: var(--brand); }
.section-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sub-handler-section { margin-bottom: 16px; }
.sub-handler-header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--sidebar-bg); color: #e2e8f0; border-radius: 8px; cursor: pointer; user-select: none; margin-bottom: 0; }
.sub-handler-header:hover { background: var(--sidebar-hover); }
.sub-handler-chevron { font-size: 11px; display: inline-block; transition: transform 0.2s; min-width: 14px; }
.sub-handler-name { font-size: 15px; font-weight: 600; }
.sub-handler-meta { font-size: 12px; color: #93c5fd; margin-left: auto; }
.sub-handler-body { padding-top: 16px; }
.sub-handler-section[data-expanded="false"] .sub-handler-body { display: none; }
.sub-handler-section[data-expanded="false"] .sub-handler-chevron { transform: rotate(-90deg); }
.cfg-section-label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 10px 2px; }
.cfg-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.cfg-table td { padding: 5px 10px; border-bottom: 1px solid #e8f5f3; vertical-align: top; }
.cfg-table tr:last-child td { border-bottom: none; }
.cfg-table td:first-child { color: var(--text-muted); font-weight: 500; width: 36%; font-family: var(--mono); white-space: nowrap; }
.expr-pre { font-family: var(--mono); font-size: 11px; background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 200px; }
.resource-group { margin-bottom: 24px; }
.resource-group h3 { font-size: 14px; color: var(--brand-dark); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.empty-state { text-align: center; padding: 40px; color: var(--text-muted); }
.empty-state .icon { font-size: 32px; margin-bottom: 10px; }
.empty-state p { font-size: 14px; }
.section-link { font-size: 12px; color: var(--brand); margin-left: auto; }
`;

const JS = `
function filterSidebar(q) {
  var lq = q.toLowerCase();
  document.querySelectorAll('.sb-item.sb-i2, .sb-item.sb-i3').forEach(function(el) {
    el.style.display = (!lq || el.textContent.toLowerCase().includes(lq)) ? '' : 'none';
  });
}
(function() {
  // ── Sidebar section toggles ──────────────────────────────────────────────
  document.querySelectorAll('.sb-section-toggle').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var section = btn.closest('.sb-section');
      if (section) section.classList.toggle('collapsed');
    });
  });

  // ── Resizable sidebar ────────────────────────────────────────────────────
  var drag = document.getElementById('sidebarDrag');
  var sidebar = document.querySelector('.sidebar');
  var shell = document.getElementById('shell');
  var MIN_W = 160, MAX_W = 520;
  var STORAGE_KEY = 'bw6docs-sidebar-w';

  function setSidebarWidth(w) {
    w = Math.max(MIN_W, Math.min(MAX_W, w));
    document.documentElement.style.setProperty('--sidebar-w', w + 'px');
    try { localStorage.setItem(STORAGE_KEY, w); } catch(e) {}
  }

  // Restore saved width
  try {
    var saved = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10);
    if (!isNaN(saved)) setSidebarWidth(saved);
  } catch(e) {}

  if (drag && sidebar) {
    var startX = 0, startW = 0;
    drag.addEventListener('mousedown', function(e) {
      startX = e.clientX;
      startW = sidebar.getBoundingClientRect().width;
      drag.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!drag.classList.contains('dragging')) return;
      setSidebarWidth(startW + (e.clientX - startX));
    });
    document.addEventListener('mouseup', function() {
      drag.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }
})();

function exportProcessPNG(name, boxId) {
  var box = (boxId ? document.getElementById(boxId) : null) || document.getElementById('diagram-box-main') || document.querySelector('.diagram-box');
  if (!box) return;
  var svg = box.querySelector('svg');
  if (!svg) return;
  var clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  var svgStr = new XMLSerializer().serializeToString(clone);
  var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var img = new Image();
  img.onload = function() {
    var scale = 2;
    var canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth  * scale;
    canvas.height = img.naturalHeight * scale;
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(function(pngBlob) {
      var a = document.createElement('a');
      a.download = (name || 'process') + '.png';
      a.href = URL.createObjectURL(pngBlob);
      a.click();
    }, 'image/png');
  };
  img.onerror = function() { URL.revokeObjectURL(url); alert('PNG export failed. Try a different browser.'); };
  img.src = url;
}
function toggleCard(card) {
  var exp = card.getAttribute('data-expanded') === 'true';
  card.setAttribute('data-expanded', exp ? 'false' : 'true');
}
function toggleAllCards(expand) {
  document.querySelectorAll('.act-card').forEach(function(c) {
    c.setAttribute('data-expanded', expand ? 'true' : 'false');
  });
}
function toggleSchema(card) {
  var exp = card.getAttribute('data-expanded') === 'true';
  card.setAttribute('data-expanded', exp ? 'false' : 'true');
}
function toggleSubHandler(section) {
  var exp = section.getAttribute('data-expanded') !== 'false';
  section.setAttribute('data-expanded', exp ? 'false' : 'true');
}
(function() {
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var tip = document.createElement('div');
  tip.className = 'svg-tooltip';
  document.body.appendChild(tip);
  function showTip(e, html) {
    tip.innerHTML = html;
    tip.style.display = 'block';
    moveTip(e);
  }
  function moveTip(e) {
    var x = e.clientX + 16, y = e.clientY - 10;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > window.innerWidth - 10) x = e.clientX - tw - 16;
    if (y + th > window.innerHeight - 10) y = e.clientY - th - 10;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  document.querySelectorAll('.activity[data-id]').forEach(function(el) {
    el.style.cursor = 'pointer';
    el.addEventListener('mouseenter', function(e) {
      var name = el.getAttribute('data-name') || '';
      var type = el.getAttribute('data-type') || '';
      var desc = el.getAttribute('data-desc') || '';
      var html = '<div class="tip-name">' + esc(name) + '</div>';
      if (type) html += '<div class="tip-type">' + esc(type) + '</div>';
      if (desc) html += '<div class="tip-desc">' + esc(desc) + '</div>';
      html += '<div style="margin-top:6px;font-size:10px;color:#475569">Click to jump to details</div>';
      showTip(e, html);
    });
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', hideTip);
  });

  document.querySelectorAll('.flow-link').forEach(function(el) {
    el.addEventListener('mouseenter', function(e) {
      var from = el.getAttribute('data-from') || '';
      var to = el.getAttribute('data-to') || '';
      var label = el.getAttribute('data-label') || '';
      var cond = el.getAttribute('data-condition') || '';
      var type = el.getAttribute('data-type') || '';
      var html = '<div class="tip-name">' + esc(from) + ' <span style="color:#64748b">→</span> ' + esc(to) + '</div>';
      if (label) html += '<div class="tip-type">Label: ' + esc(label) + '</div>';
      if (cond) html += '<div class="tip-type">Condition: <span class="tip-cond">' + esc(cond) + '</span></div>';
      if (type && type !== 'normal') html += '<div class="tip-type">Type: ' + esc(type) + '</div>';
      showTip(e, html);
    });
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', hideTip);
  });
})();
`;

export const BW6_CSS: string = `<style>${CSS}</style>`;
export const BW6_JS: string = `<script>${JS}</script>`;
