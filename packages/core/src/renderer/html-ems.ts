import * as path from 'path';
import * as fs from 'fs';
import type {
  EMSModel, EMSDestination, EMSFactory, EMSDurable, EMSBridge,
  EMSUser, EMSGroup, EMSACLEntry, EMSRoute, EMSTransport, EMSStore,
  EMSLiveConnection, EMSLiveConsumer, EMSLiveProducer,
} from '../ems-model';

// ─── Utilities ────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeId(s: string): string { return s.replace(/[^a-zA-Z0-9_-]/g, '_'); }

function badge(text: string, cls: string): string {
  return `<span class="badge ${cls}">${escHtml(text)}</span>`;
}

function factoryTypeBadge(t: string): string {
  const t2 = t.toLowerCase();
  if (t2.startsWith('xa'))  return badge(t, 'badge-xa');
  if (t2 === 'topic')       return badge('Topic', 'badge-topic');
  if (t2 === 'queue')       return badge('Queue', 'badge-queue');
  return badge(t, 'badge-generic');
}

function modeBadge(mode: EMSModel['sourceMode']): string {
  if (mode === 'rest')  return `<span class="badge" style="background:#d1fae5;color:#065f46">REST Proxy</span>`;
  if (mode === 'admin') return `<span class="badge" style="background:#dbeafe;color:#1e3a8a">tibemsadmin</span>`;
  return `<span class="badge" style="background:#f1f5f9;color:#334155">Config Files</span>`;
}

function permIcon(on?: boolean): string {
  return on ? '<span style="color:#16a34a;font-size:14px">✓</span>' : '<span style="color:#e2e8f0;font-size:14px">·</span>';
}

function numBadge(n: number, zero = false): string {
  if (n === 0 && !zero) return '<span style="color:#94a3b8">0</span>';
  return `<span style="font-weight:600;color:var(--brand)">${n}</span>`;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
:root {
  --brand:       #1a56db;
  --brand-dark:  #1048c0;
  --brand-glow:  #1a56db22;
  --header-bg:   #0c2461;
  --sidebar-bg:  #0c2461;
  --sidebar-fg:  #93c5fd;
  --hover:       #1a3484;
  --content-bg:  #f4f6f9;
  --card-bg:     #ffffff;
  --border:      #e2e8f0;
  --text:        #0f172a;
  --text-muted:  #64748b;
  --link:        #1a56db;
  --mono:        'Cascadia Code', 'Consolas', monospace;
  --sidebar-w:   270px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; font-family: 'Segoe UI', system-ui, sans-serif; color: var(--text); background: var(--content-bg); }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }

.shell { display: flex; height: 100vh; overflow: hidden; }
.sidebar { width: var(--sidebar-w); flex-shrink: 0; background: var(--sidebar-bg); color: var(--sidebar-fg); display: flex; flex-direction: column; overflow-y: auto; }
.sidebar::-webkit-scrollbar { width: 4px; }
.sidebar::-webkit-scrollbar-thumb { background: #1a3484; border-radius: 2px; }
.sidebar-drag { width: 5px; flex-shrink: 0; background: transparent; cursor: col-resize; z-index: 10; transition: background 0.15s; }
.sidebar-drag:hover { background: var(--brand); }
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.topbar { background: var(--header-bg); color: #fff; padding: 0 20px; height: 48px; display: flex; align-items: center; flex-shrink: 0; border-bottom: 1px solid #1a3484; }
.brand-wordmark { display: flex; flex-direction: column; gap: 0; margin-left: 9px; }
.brand-name { font-size: 15px; font-weight: 700; background: linear-gradient(90deg, #93c5fd 0%, #bfdbfe 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; line-height: 1.1; }
.brand-tagline { font-size: 9px; font-weight: 400; color: #64748b; letter-spacing: 0.12em; text-transform: uppercase; line-height: 1; }
.topbar-meta { margin-left: auto; display: flex; gap: 10px; align-items: center; }
.edition-badge { background: #1a56db30; color: #93c5fd; padding: 2px 9px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; }
.content { flex: 1; overflow-y: auto; padding: 28px 36px; }
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-thumb { background: #93c5fd44; border-radius: 3px; }

/* Sidebar */
.sb-root { padding: 14px 12px 10px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #1a3484; }
.sb-root-name { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.sb-item { display: flex; align-items: center; padding: 5px 14px; font-size: 12.5px; color: var(--sidebar-fg); cursor: default; gap: 6px; text-decoration: none; white-space: nowrap; }
a.sb-item:hover { background: var(--hover); color: #e2e8f0; text-decoration: none; }
a.sb-item.active { color: #60a5fa; font-weight: 600; background: #122d6e; }
.sb-count { margin-left: auto; flex-shrink: 0; font-size: 10px; background: #1a3484; padding: 1px 6px; border-radius: 8px; color: #64748b; }
.sb-divider { border: none; border-top: 1px solid #1a3484; margin: 4px 0; }
.sb-section-header { padding: 6px 14px 2px; font-size: 10px; font-weight: 700; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.08em; }

/* Cards */
.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 22px; margin-bottom: 20px; }
.card-title { font-size: 15px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }

/* App overview card */
.overview-card { background: linear-gradient(135deg, #1a56db0d 0%, #0c246108 100%); border: 1px solid #bfdbfe; border-radius: 10px; padding: 22px 26px; margin-bottom: 24px; }
.overview-title { font-size: 22px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.overview-sub { font-family: var(--mono); font-size: 12px; color: var(--text-muted); margin-bottom: 14px; }
.overview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px 20px; font-size: 13px; }
.overview-row { display: flex; gap: 6px; }
.overview-label { color: var(--text-muted); white-space: nowrap; font-size: 12px; }
.overview-value { color: var(--text); font-weight: 500; font-size: 12px; }

/* Stats */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 14px; margin-bottom: 24px; }
.stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px 18px; display: block; text-decoration: none; color: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
a.stat-card:hover { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-glow); text-decoration: none; }
.stat-card .stat-icon { font-size: 22px; margin-bottom: 6px; }
.stat-card .val { font-size: 28px; font-weight: 700; color: var(--brand); }
.stat-card .lbl { font-size: 11px; font-weight: 600; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.06em; }

/* Tables */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { background: #f1f5f9; color: var(--brand-dark); font-weight: 600; padding: 9px 13px; text-align: left; white-space: nowrap; }
td { padding: 8px 13px; border-bottom: 1px solid var(--border); vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #f8fafc; }
.td-mono { font-family: var(--mono); font-size: 12px; }
.td-muted { color: var(--text-muted); font-size: 12px; }
.td-center { text-align: center; }

/* Badges */
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge-generic  { background: #ede9fe; color: #5b21b6; }
.badge-topic    { background: #d1fae5; color: #064e3b; }
.badge-queue    { background: #dbeafe; color: #1e3a8a; }
.badge-xa       { background: #fef3c7; color: #92400e; }
.badge-ssl      { background: #fce7f3; color: #831843; }
.badge-wildcard { background: #fef9c3; color: #713f12; font-size: 10px; }
.badge-prop     { background: #f3e8ff; color: #6b21a8; font-size: 10px; }
.badge-admin    { background: #fee2e2; color: #991b1b; font-size: 10px; }
.badge-user     { background: #dbeafe; color: #1e3a8a; font-size: 10px; }
.badge-group    { background: #d1fae5; color: #064e3b; font-size: 10px; }
.badge-live     { background: #dcfce7; color: #166534; font-size: 10px; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }

/* Destination cards */
.dest-card { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px; overflow: hidden; }
.dest-card-header { display: flex; align-items: center; gap: 8px; padding: 9px 14px; background: #f8fafc; cursor: pointer; user-select: none; }
.dest-card-header:hover { background: #f1f5f9; }
.dest-card-body { padding: 10px 14px; display: none; font-size: 12px; }
.dest-card[data-expanded="true"] .dest-card-body { display: block; }
.dest-chevron { font-size: 10px; color: var(--text-muted); transition: transform 0.2s; width: 12px; }
.dest-card[data-expanded="true"] .dest-chevron { transform: rotate(90deg); }
.dest-name { font-weight: 600; font-size: 13px; font-family: var(--mono); }
.dest-stats { margin-left: auto; display: flex; gap: 10px; font-size: 11px; color: var(--text-muted); }
.dest-stat { display: flex; align-items: center; gap: 3px; }

/* Props grid */
.prop-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }

/* Page header */
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
.page-header .meta { font-size: 12px; color: var(--text-muted); margin-top: 5px; }
.breadcrumb { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.breadcrumb a { color: var(--brand); }
.empty-state { text-align: center; padding: 40px; color: var(--text-muted); }
.empty-state .icon { font-size: 32px; margin-bottom: 10px; }

/* Server config */
.cfg-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.cfg-table td { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.cfg-table tr:last-child td { border-bottom: none; }
.cfg-table td:first-child { color: var(--text-muted); font-weight: 500; width: 32%; font-family: var(--mono); white-space: nowrap; }

/* Toggle buttons */
.toggle-bar { display: flex; gap: 8px; margin-bottom: 14px; }
.toggle-btn { padding: 4px 12px; border-radius: 5px; border: 1px solid var(--border); background: var(--card-bg); color: var(--text-muted); font-size: 12px; cursor: pointer; }
.toggle-btn:hover { background: #dbeafe; color: var(--brand); border-color: var(--brand); }
.section-link { font-size: 12px; color: var(--brand); margin-left: auto; }
.section-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }

/* Bridge */
.bridge-arrow { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.bridge-arrow:last-child { border-bottom: none; }
.bridge-src { font-family: var(--mono); font-weight: 600; }
.bridge-arrow-icon { color: var(--brand); font-size: 16px; }
.bridge-targets { display: flex; flex-direction: column; gap: 4px; }
.bridge-target { font-family: var(--mono); font-size: 12px; display: flex; align-items: center; gap: 6px; }

/* ACL matrix */
.acl-perm { text-align: center; padding: 6px 8px !important; }

/* Live data alert */
.live-alert { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; font-size: 12px; color: #166534; display: flex; align-items: center; gap: 8px; }
`;

// ─── JS ───────────────────────────────────────────────────────────────────────

const JS = `
function filterSidebar(q) {
  var lq = q.toLowerCase();
  document.querySelectorAll('.sb-item').forEach(function(el) {
    el.style.display = (!lq || el.textContent.toLowerCase().includes(lq)) ? '' : 'none';
  });
}
(function() {
  var drag = document.querySelector('.sidebar-drag');
  var sidebar = document.querySelector('.sidebar');
  var MIN_W = 160, MAX_W = 520;
  var STORAGE_KEY = 'ems-docs-sidebar-w';
  function setW(w) {
    w = Math.max(MIN_W, Math.min(MAX_W, w));
    document.documentElement.style.setProperty('--sidebar-w', w + 'px');
    try { localStorage.setItem(STORAGE_KEY, w); } catch(e) {}
  }
  try { var s = parseInt(localStorage.getItem(STORAGE_KEY)||'',10); if(!isNaN(s)) setW(s); } catch(e) {}
  if (drag && sidebar) {
    var startX=0, startW=0, dragging=false;
    drag.addEventListener('mousedown', function(e) { startX=e.clientX; startW=sidebar.getBoundingClientRect().width; dragging=true; document.body.style.cursor='col-resize'; document.body.style.userSelect='none'; e.preventDefault(); });
    document.addEventListener('mousemove', function(e) { if(dragging) setW(startW+(e.clientX-startX)); });
    document.addEventListener('mouseup', function() { dragging=false; document.body.style.cursor=''; document.body.style.userSelect=''; });
  }
})();
function toggleDest(card) {
  var exp = card.getAttribute('data-expanded') === 'true';
  card.setAttribute('data-expanded', exp ? 'false' : 'true');
}
function toggleAllDests(expand) {
  document.querySelectorAll('.dest-card').forEach(function(c) { c.setAttribute('data-expanded', expand?'true':'false'); });
}
function filterTable(inputEl, tableId) {
  var q = inputEl.value.toLowerCase();
  document.querySelectorAll('#' + tableId + ' tbody tr').forEach(function(row) {
    row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
  });
}
`;

// ─── Page shell ───────────────────────────────────────────────────────────────

function page(activePage: string, sidebarHtml: string, content: string, serverName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escHtml(serverName)} — EMS Docs</title>
  <style>${CSS}</style>
</head>
<body>
<div class="shell" id="shell">
${sidebarHtml}
<div class="sidebar-drag"></div>
<div class="main">
  <div class="topbar">
    <span style="font-size:20px">⚡</span>
    <div class="brand-wordmark">
      <span class="brand-name">DocGen</span>
      <span class="brand-tagline">Integration Docs</span>
    </div>
    <div class="topbar-meta">
      <span class="edition-badge">TIBCO EMS</span>
    </div>
  </div>
  <div class="content">${content}</div>
</div>
</div>
<script>${JS}</script>
</body>
</html>`;
}

function renderSidebar(model: EMSModel, activePage: string): string {
  const isLive = model.sourceMode !== 'files';
  const liveTag = isLive ? ` <span class="badge-live badge" style="font-size:9px">LIVE</span>` : '';

  function item(id: string, icon: string, label: string, count?: number): string {
    const active = activePage === id ? ' active' : '';
    const href = id === 'index' ? 'index.html' : `${id}.html`;
    const cnt = count !== undefined ? `<span class="sb-count">${count}</span>` : '';
    return `<a href="${href}" class="sb-item${active}">${icon} ${label}${liveTag && count && count > 0 ? '' : ''} ${cnt}</a>`;
  }

  const sourceLabel = model.sourceMode === 'rest' ? `REST: ${model.sourceUrl ?? ''}` :
                      model.sourceMode === 'admin' ? `Admin: ${model.sourceUrl ?? ''}` :
                      model.sourceDir ?? '';

  return `<div class="sidebar">
  <div class="sb-root">
    <span>📨</span>
    <div style="flex:1;min-width:0">
      <div class="sb-root-name" style="overflow:hidden;text-overflow:ellipsis">${escHtml(model.server.serverName)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:1px">${model.sourceMode.toUpperCase()}${isLive ? ' · LIVE' : ''}</div>
    </div>
  </div>
  <div style="padding:8px 10px;border-bottom:1px solid #1a3484">
    <input type="text" placeholder="Filter…" oninput="filterSidebar(this.value)" autocomplete="off"
      style="width:100%;background:#122d6e;border:1px solid #1a3484;border-radius:4px;color:#93c5fd;font-size:12px;padding:5px 8px;outline:none;">
  </div>
  ${item('index', '🏠', 'Overview')}
  <hr class="sb-divider"/>
  <div class="sb-section-header">Destinations</div>
  ${item('queues',    '📬', 'Queues',    model.queues.filter(q => !q.isWildcard).length)}
  ${item('topics',    '📢', 'Topics',    model.topics.filter(t => !t.isWildcard).length)}
  <hr class="sb-divider"/>
  <div class="sb-section-header">Messaging</div>
  ${item('factories', '🏭', 'Connection Factories', model.factories.length)}
  ${item('durables',  '📌', 'Durable Subscribers',  model.durables.length)}
  ${item('bridges',   '🌉', 'Bridges',   model.bridges.length)}
  ${model.routes.length > 0 || model.sourceMode !== 'files' ? item('routes', '🔗', 'Routes', model.routes.length) : ''}
  <hr class="sb-divider"/>
  <div class="sb-section-header">Security</div>
  ${item('users',  '👤', 'Users',  model.users.length)}
  ${item('groups', '👥', 'Groups', model.groups.length)}
  ${item('acls',   '🔐', 'ACL Permissions', model.acls.length)}
  <hr class="sb-divider"/>
  <div class="sb-section-header">Infrastructure</div>
  ${item('transports', '🔌', 'Transports', model.transports.length)}
  ${item('stores',     '🗄', 'Stores',     model.stores.length)}
  ${isLive && model.liveConnections ? item('connections', '🖧', 'Live Connections', model.liveConnections.length) : ''}
  <hr class="sb-divider"/>
  ${item('server', '⚙️', 'Server Config')}
</div>`;
}

// ─── Destination card ─────────────────────────────────────────────────────────

function renderDestCard(dest: EMSDestination): string {
  const props = Object.entries(dest.properties);
  const propChips = props.map(([k, v]) =>
    `<span class="badge badge-prop">${escHtml(k)}${v !== 'true' ? `=${escHtml(v)}` : ''}</span>`
  ).join(' ');

  const hasLiveStats = dest.pendingMessages !== undefined || dest.consumerCount !== undefined;
  const liveStats = hasLiveStats ? `
  <div style="display:flex;gap:16px;font-size:12px;color:var(--text-muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
    ${dest.pendingMessages !== undefined ? `<span>📩 Pending: <strong style="color:var(--text)">${dest.pendingMessages}</strong></span>` : ''}
    ${dest.consumerCount !== undefined ? `<span>👥 Consumers: <strong style="color:var(--text)">${dest.consumerCount}</strong></span>` : ''}
    ${dest.producerCount !== undefined ? `<span>📤 Producers: <strong style="color:var(--text)">${dest.producerCount}</strong></span>` : ''}
  </div>` : '';

  const body = props.length > 0 || hasLiveStats
    ? `${props.length > 0 ? `<div class="prop-chips">${propChips}</div>` : ''}${liveStats}`
    : `<span style="color:#94a3b8;font-size:12px">No additional properties</span>`;

  const wildcardBadge = dest.isWildcard ? `<span class="badge badge-wildcard">wildcard</span>` : '';
  const pendingBadge = dest.pendingMessages ? `<span style="font-size:11px;color:#d97706;margin-left:auto">📩 ${dest.pendingMessages}</span>` : '';

  return `<div class="dest-card" data-expanded="false">
  <div class="dest-card-header" onclick="toggleDest(this.parentElement)">
    <span class="dest-chevron">▶</span>
    <span class="dest-name">${escHtml(dest.name)}</span>
    ${wildcardBadge}
    ${pendingBadge}
  </div>
  <div class="dest-card-body">${body}</div>
</div>`;
}

// ─── Overview page ────────────────────────────────────────────────────────────

function renderOverview(model: EMSModel): string {
  const { server, queues, topics, factories, durables, bridges, users, groups, acls, routes, transports, stores } = model;
  const isLive = model.sourceMode !== 'files';
  const li = model.liveServerInfo;

  const keyProps = [
    { label: 'Server',          value: li?.host ?? server.serverName },
    { label: 'Listen',          value: li?.listenUrl ?? server.listenUrl ?? server.properties['listen'] ?? '—' },
    { label: 'Version',         value: li?.version ?? '—' },
    { label: 'Uptime',          value: li?.uptime ?? '—' },
    { label: 'License',         value: li?.license ?? '—' },
    { label: 'Authorization',   value: server.authorization ?? server.properties['authorization'] ?? '—' },
    { label: 'Max Connections', value: server.maxConnections ?? '0 (unlimited)' },
    { label: 'Generated',       value: new Date(model.generatedAt).toLocaleString() },
  ].filter(r => r.value && r.value !== '—');

  const overviewGrid = keyProps.map(r =>
    `<div class="overview-row"><span class="overview-label">${escHtml(r.label)}:</span><span class="overview-value td-mono">${escHtml(r.value)}</span></div>`
  ).join('');

  const liveAlert = isLive ? `<div class="live-alert">🟢 <strong>Live snapshot</strong> — data fetched from ${escHtml(model.sourceUrl ?? '')} via ${model.sourceMode === 'rest' ? 'EMS REST Proxy' : 'tibemsadmin'}. Generated ${new Date(model.generatedAt).toLocaleString()}.</div>` : '';

  // Live rate cards if available
  const liveRates = li && (li.msgRateIn || li.msgRateOut) ? `
  <div style="display:flex;gap:12px;margin-top:12px;font-size:12px">
    ${li.msgRateIn  ? `<div style="background:#dbeafe;border-radius:6px;padding:6px 12px"><span style="color:#1e3a8a">📥 In rate:</span> <strong>${li.msgRateIn}/s</strong></div>` : ''}
    ${li.msgRateOut ? `<div style="background:#d1fae5;border-radius:6px;padding:6px 12px"><span style="color:#064e3b">📤 Out rate:</span> <strong>${li.msgRateOut}/s</strong></div>` : ''}
    ${li.msgMemory  ? `<div style="background:#fef9c3;border-radius:6px;padding:6px 12px"><span style="color:#713f12">💾 Msg memory:</span> <strong>${li.msgMemory}</strong></div>` : ''}
  </div>` : '';

  const statsHtml = `<div class="stats-grid">
  <a href="queues.html" class="stat-card"><div class="stat-icon">📬</div><div class="val">${queues.filter(q=>!q.isWildcard).length}</div><div class="lbl">Queues</div></a>
  <a href="topics.html" class="stat-card"><div class="stat-icon">📢</div><div class="val">${topics.filter(t=>!t.isWildcard).length}</div><div class="lbl">Topics</div></a>
  <a href="factories.html" class="stat-card"><div class="stat-icon">🏭</div><div class="val">${factories.length}</div><div class="lbl">Factories</div></a>
  <a href="durables.html" class="stat-card"><div class="stat-icon">📌</div><div class="val">${durables.length}</div><div class="lbl">Durables</div></a>
  <a href="bridges.html" class="stat-card"><div class="stat-icon">🌉</div><div class="val">${bridges.length}</div><div class="lbl">Bridges</div></a>
  <a href="users.html" class="stat-card"><div class="stat-icon">👤</div><div class="val">${users.length}</div><div class="lbl">Users</div></a>
  <a href="groups.html" class="stat-card"><div class="stat-icon">👥</div><div class="val">${groups.length}</div><div class="lbl">Groups</div></a>
  <a href="acls.html" class="stat-card"><div class="stat-icon">🔐</div><div class="val">${acls.length}</div><div class="lbl">ACL Rules</div></a>
  <a href="routes.html" class="stat-card"><div class="stat-icon">🔗</div><div class="val">${routes.length}</div><div class="lbl">Routes</div></a>
  <a href="transports.html" class="stat-card"><div class="stat-icon">🔌</div><div class="val">${transports.length}</div><div class="lbl">Transports</div></a>
  <a href="stores.html" class="stat-card"><div class="stat-icon">🗄</div><div class="val">${stores.length}</div><div class="lbl">Stores</div></a>
  ${isLive && model.liveConnections ? `<a href="connections.html" class="stat-card"><div class="stat-icon">🖧</div><div class="val">${model.liveConnections.length}</div><div class="lbl">Connections</div></a>` : ''}
</div>`;

  const sourceInfo = model.sourceDir ?? model.sourceUrl ?? '';

  return `<div class="page-header"><h1>🏠 Overview</h1></div>
${liveAlert}
<div class="overview-card">
  <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:8px">
    <div class="overview-title" style="flex:1">📨 ${escHtml(server.serverName)}</div>
    ${modeBadge(model.sourceMode)}
  </div>
  <div class="overview-sub">${escHtml(sourceInfo)}</div>
  <div class="overview-grid">${overviewGrid}</div>
  ${liveRates}
</div>
${statsHtml}
<div class="card">
  <div class="card-title">📬 Destinations at a glance <a href="queues.html" class="section-link">All queues →</a></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px">
    <div><strong>Queues (${queues.filter(q=>!q.isWildcard).length})</strong>
      ${queues.slice(0,8).map(q=>`<div style="padding:3px 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:12px">${escHtml(q.name)}${q.pendingMessages?` <span style="color:#d97706">📩${q.pendingMessages}</span>`:''}</div>`).join('')}
      ${queues.length>8?`<div style="font-size:11px;color:var(--text-muted);padding-top:4px">…and ${queues.length-8} more. <a href="queues.html">View all</a></div>`:''}
    </div>
    <div><strong>Topics (${topics.filter(t=>!t.isWildcard).length})</strong>
      ${topics.slice(0,8).map(t=>`<div style="padding:3px 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:12px">${escHtml(t.name)}</div>`).join('')}
      ${topics.length>8?`<div style="font-size:11px;color:var(--text-muted);padding-top:4px">…and ${topics.length-8} more. <a href="topics.html">View all</a></div>`:''}
    </div>
  </div>
</div>`;
}

// ─── Queues / Topics pages ────────────────────────────────────────────────────

function renderDestPage(model: EMSModel, type: 'queue' | 'topic'): string {
  const dests = type === 'queue' ? model.queues : model.topics;
  const icon = type === 'queue' ? '📬' : '📢';
  const title = type === 'queue' ? 'Queues' : 'Topics';
  const isLive = model.sourceMode !== 'files';

  if (!dests.length) return `<div class="page-header"><h1>${icon} ${title}</h1></div><div class="empty-state"><div class="icon">${icon}</div><p>No ${title.toLowerCase()} defined</p></div>`;

  const wildcards = dests.filter(d => d.isWildcard);
  const named = dests.filter(d => !d.isWildcard);

  if (isLive && named.length > 0) {
    // Live mode: show as table with stats
    const rows = named.map(d => `<tr>
      <td class="td-mono">${escHtml(d.name)}</td>
      <td class="td-center">${numBadge(d.pendingMessages ?? 0)}</td>
      <td class="td-center">${numBadge(d.inTransitCount ?? 0)}</td>
      <td class="td-center">${numBadge(d.consumerCount ?? 0)}</td>
      <td class="td-center">${numBadge(d.producerCount ?? 0)}</td>
      <td>${Object.entries(d.properties).map(([k,v])=>`<span class="badge badge-prop">${escHtml(k)}${v!=='true'?'='+escHtml(v):''}</span>`).join(' ')||'<span style="color:#94a3b8">—</span>'}</td>
    </tr>`).join('');

    return `<div class="page-header"><h1>${icon} ${title}</h1><div class="meta">${named.length} named · ${wildcards.length} wildcard · <span class="badge-live badge">LIVE STATS</span></div></div>
<div class="card">
  <table id="dest-table">
    <thead><tr><th>Name</th><th>Pending</th><th>In-Transit</th><th>${type==='queue'?'Consumers':'Subscribers'}</th><th>${type==='queue'?'Producers':'Publishers'}</th><th>Properties</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
${wildcards.length > 0 ? `<div class="section-title">🌐 Wildcard Patterns</div>${wildcards.map(renderDestCard).join('')}` : ''}`;
  }

  return `<div class="page-header"><h1>${icon} ${title}</h1><div class="meta">${named.length} named ${title.toLowerCase()} · ${wildcards.length} wildcard patterns</div></div>
<div class="toggle-bar">
  <button class="toggle-btn" onclick="toggleAllDests(true)">Expand All</button>
  <button class="toggle-btn" onclick="toggleAllDests(false)">Collapse All</button>
</div>
${wildcards.length > 0 ? `<div class="section-title">🌐 Wildcard Patterns</div>${wildcards.map(renderDestCard).join('')}<br/>` : ''}
<div class="section-title">Named ${title}</div>
${named.map(renderDestCard).join('')}`;
}

// ─── Factories page ───────────────────────────────────────────────────────────

function renderFactoriesPage(model: EMSModel): string {
  const { factories } = model;
  if (!factories.length) return `<div class="page-header"><h1>🏭 Connection Factories</h1></div><div class="empty-state"><div class="icon">🏭</div><p>No connection factories defined</p></div>`;

  const cards = factories.map(f => {
    const allProps = Object.entries(f.properties).filter(([k]) => !['type','url','clientID'].includes(k));
    const propsTable = allProps.length > 0
      ? `<table class="cfg-table"><tbody>${allProps.map(([k,v]) => `<tr><td>${escHtml(k)}</td><td class="td-mono">${escHtml(v)}</td></tr>`).join('')}</tbody></table>`
      : '';

    return `<div class="card">
  <div class="card-title">🏭 <span class="td-mono">${escHtml(f.name)}</span> ${factoryTypeBadge(f.factoryType)} ${f.ssl ? '<span class="badge badge-ssl">🔒 SSL/TLS</span>' : ''}</div>
  <dl style="display:grid;grid-template-columns:140px 1fr;gap:6px 14px;font-size:13px;margin-bottom:${allProps.length ? 14 : 0}px">
    <dt style="color:var(--text-muted)">URL</dt><dd class="td-mono" style="font-weight:500">${escHtml(f.url)}</dd>
    <dt style="color:var(--text-muted)">Type</dt><dd>${factoryTypeBadge(f.factoryType)}</dd>
    ${f.clientId ? `<dt style="color:var(--text-muted)">Client ID</dt><dd class="td-mono">${escHtml(f.clientId)}</dd>` : ''}
  </dl>
  ${propsTable}
</div>`;
  }).join('');

  return `<div class="page-header"><h1>🏭 Connection Factories</h1><div class="meta">${factories.length} factories defined</div></div>${cards}`;
}

// ─── Durables page ────────────────────────────────────────────────────────────

function renderDurablesPage(model: EMSModel): string {
  const { durables } = model;
  if (!durables.length) return `<div class="page-header"><h1>📌 Durable Subscribers</h1></div><div class="empty-state"><div class="icon">📌</div><p>No durable subscribers defined</p></div>`;

  const rows = durables.map(d => `<tr>
    <td class="td-mono">${escHtml(d.topic)}</td>
    <td class="td-mono">${escHtml(d.name)}</td>
    <td class="td-mono td-muted">${d.clientId ? escHtml(d.clientId) : '—'}</td>
    <td>${d.shared ? '<span class="badge badge-generic">shared</span>' : ''}</td>
    <td>${Object.entries(d.properties).map(([k,v]) => `<span class="badge badge-prop">${escHtml(k)}${v!=='true'?'='+escHtml(v):''}</span>`).join(' ') || '<span style="color:#94a3b8">—</span>'}</td>
  </tr>`).join('');

  return `<div class="page-header"><h1>📌 Durable Subscribers</h1><div class="meta">${durables.length} durable subscriptions</div></div>
<div class="card"><table><thead><tr><th>Topic</th><th>Durable Name</th><th>Client ID</th><th>Shared</th><th>Properties</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ─── Bridges page ─────────────────────────────────────────────────────────────

function renderBridgesPage(model: EMSModel): string {
  const { bridges } = model;
  if (!bridges.length) return `<div class="page-header"><h1>🌉 Bridges</h1></div><div class="empty-state"><div class="icon">🌉</div><p>No bridges defined</p></div>`;

  const cards = bridges.map(b => {
    const srcBadge = b.sourceType === 'topic' ? badge('topic', 'badge-topic') : badge('queue', 'badge-queue');
    const targets = b.targets.map(t => {
      const tBadge = t.type === 'topic' ? badge('topic', 'badge-topic') : badge('queue', 'badge-queue');
      const sel = t.selector ? ` <span class="badge badge-prop">selector="${escHtml(t.selector)}"</span>` : '';
      return `<div class="bridge-target">${tBadge} <span class="td-mono">${escHtml(t.name)}</span>${sel}</div>`;
    }).join('');

    return `<div class="card"><div class="bridge-arrow">
  <div style="flex:1"><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Source</div>
    <div style="display:flex;align-items:center;gap:8px">${srcBadge} <span class="bridge-src">${escHtml(b.sourceName)}</span></div>
  </div>
  <div class="bridge-arrow-icon" style="font-size:24px">→</div>
  <div style="flex:1"><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Target(s)</div>
    <div class="bridge-targets">${targets}</div>
  </div>
</div></div>`;
  }).join('');

  return `<div class="page-header"><h1>🌉 Bridges</h1><div class="meta">${bridges.length} bridge definition${bridges.length !== 1 ? 's' : ''}</div></div>${cards}`;
}

// ─── Routes page ──────────────────────────────────────────────────────────────

function renderRoutesPage(model: EMSModel): string {
  const { routes } = model;
  if (!routes.length) return `<div class="page-header"><h1>🔗 Routes</h1></div><div class="empty-state"><div class="icon">🔗</div><p>No routes defined</p></div>`;

  const rows = routes.map(r => {
    const extraProps = Object.entries(r.properties).filter(([k]) => !['url','enabled'].includes(k));
    return `<tr>
    <td class="td-mono" style="font-weight:600">${escHtml(r.name)}</td>
    <td class="td-mono">${escHtml(r.url)}</td>
    <td>${r.enabled ? '<span class="badge" style="background:#d1fae5;color:#065f46">enabled</span>' : '<span class="badge" style="background:#fee2e2;color:#991b1b">disabled</span>'}</td>
    <td class="td-muted">${extraProps.map(([k,v])=>`${escHtml(k)}=${escHtml(v)}`).join(', ') || '—'}</td>
  </tr>`;
  }).join('');

  return `<div class="page-header"><h1>🔗 Routes</h1><div class="meta">${routes.length} inter-server route${routes.length !== 1 ? 's' : ''}</div></div>
<div class="card"><table><thead><tr><th>Route Name</th><th>Remote URL</th><th>Status</th><th>Config</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ─── Users page ───────────────────────────────────────────────────────────────

function renderUsersPage(model: EMSModel): string {
  const { users, groups } = model;
  if (!users.length) return `<div class="page-header"><h1>👤 Users</h1></div><div class="empty-state"><div class="icon">👤</div><p>No users found${model.sourceMode === 'files' ? ' in users.conf' : ''}</p></div>`;

  // Build user → groups map for cross-reference
  const userGroups: Record<string, string[]> = {};
  for (const g of groups) {
    for (const m of g.members) {
      if (!userGroups[m]) userGroups[m] = [];
      userGroups[m].push(g.name);
    }
  }

  const rows = users.map(u => {
    const memberOf = [...(u.groups ?? []), ...(userGroups[u.name] ?? [])];
    const uniqueGroups = [...new Set(memberOf)];
    return `<tr>
    <td class="td-mono" style="font-weight:600">${escHtml(u.name)}</td>
    <td>${u.isAdmin ? '<span class="badge badge-admin">Admin</span>' : '<span class="badge badge-user">User</span>'}</td>
    <td class="td-muted">${u.description ? escHtml(u.description) : '—'}</td>
    <td>${uniqueGroups.map(g => `<a href="groups.html"><span class="badge badge-group">${escHtml(g)}</span></a>`).join(' ') || '<span style="color:#94a3b8">—</span>'}</td>
  </tr>`;
  }).join('');

  return `<div class="page-header"><h1>👤 Users</h1><div class="meta">${users.length} user${users.length !== 1 ? 's' : ''} · ${users.filter(u=>u.isAdmin).length} admin</div></div>
<div class="card"><table><thead><tr><th>Username</th><th>Role</th><th>Description</th><th>Member Of</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ─── Groups page ──────────────────────────────────────────────────────────────

function renderGroupsPage(model: EMSModel): string {
  const { groups } = model;
  if (!groups.length) return `<div class="page-header"><h1>👥 Groups</h1></div><div class="empty-state"><div class="icon">👥</div><p>No groups found${model.sourceMode === 'files' ? ' in groups.conf' : ''}</p></div>`;

  const cards = groups.map(g => {
    const members = g.members.map(m =>
      `<span class="badge badge-user" style="margin:2px">${escHtml(m)}</span>`
    ).join('');
    return `<div class="card">
  <div class="card-title">👥 <span style="font-family:var(--mono)">${escHtml(g.name)}</span>
    <span class="sb-count" style="font-size:12px;margin-left:6px">${g.members.length} member${g.members.length!==1?'s':''}</span>
  </div>
  ${g.description ? `<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">${escHtml(g.description)}</p>` : ''}
  <div style="display:flex;flex-wrap:wrap;gap:4px">${members || '<span style="color:#94a3b8;font-size:12px">No members</span>'}</div>
</div>`;
  }).join('');

  return `<div class="page-header"><h1>👥 Groups</h1><div class="meta">${groups.length} group${groups.length !== 1 ? 's' : ''}</div></div>${cards}`;
}

// ─── ACLs page ────────────────────────────────────────────────────────────────

function renderACLsPage(model: EMSModel): string {
  const { acls } = model;
  if (!acls.length) return `<div class="page-header"><h1>🔐 ACL Permissions</h1></div><div class="empty-state"><div class="icon">🔐</div><p>No ACL rules found${model.sourceMode === 'files' ? ' in acl_list' : ''}</p></div>`;

  const permCols = ['publish', 'subscribe', 'durable', 'browse', 'create', 'delete', 'admin'] as const;

  const rows = acls.map(a => {
    const principalBadge = a.principalType === 'group' ? badge(a.principal, 'badge-group')
      : a.principalType === 'all' ? badge('@all', 'badge-generic')
      : badge(a.principal, 'badge-user');

    const destBadge = a.destType === 'queue' ? badge('Q', 'badge-queue')
      : a.destType === 'topic' ? badge('T', 'badge-topic')
      : '';

    const permCells = permCols.map(p =>
      `<td class="acl-perm td-center">${permIcon((a.permissions as Record<string, boolean | undefined>)[p])}</td>`
    ).join('');

    return `<tr>
    <td>${principalBadge}</td>
    <td>${destBadge} <span class="td-mono">${escHtml(a.destination)}</span></td>
    ${permCells}
  </tr>`;
  }).join('');

  return `<div class="page-header"><h1>🔐 ACL Permissions</h1><div class="meta">${acls.length} permission rule${acls.length !== 1 ? 's' : ''}</div></div>
<div class="card">
  <table>
    <thead><tr>
      <th>Principal</th><th>Destination</th>
      ${permCols.map(p => `<th style="text-align:center">${p.charAt(0).toUpperCase() + p.slice(1)}</th>`).join('')}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ─── Transports page ──────────────────────────────────────────────────────────

function renderTransportsPage(model: EMSModel): string {
  const { transports } = model;
  if (!transports.length) return `<div class="page-header"><h1>🔌 Transports</h1></div><div class="empty-state"><div class="icon">🔌</div><p>No transports found${model.sourceMode === 'files' ? ' in transports.conf' : ''}</p></div>`;

  const cards = transports.map(t => {
    const typeBadge = t.type === 'ssl' ? badge('SSL/TLS', 'badge-ssl')
      : t.type === 'https' ? badge('HTTPS', 'badge-ssl')
      : badge(t.type.toUpperCase(), 'badge-queue');
    const extraProps = Object.entries(t.properties).filter(([k]) => !['port','enabled','type'].includes(k));
    return `<div class="card">
  <div class="card-title">🔌 <span class="td-mono">${escHtml(t.name)}</span> ${typeBadge}
    ${t.enabled ? '' : '<span class="badge" style="background:#fee2e2;color:#991b1b">disabled</span>'}
  </div>
  <dl style="display:grid;grid-template-columns:120px 1fr;gap:5px 14px;font-size:13px">
    ${t.port ? `<dt style="color:var(--text-muted)">Port</dt><dd class="td-mono" style="font-weight:600">${t.port}</dd>` : ''}
    <dt style="color:var(--text-muted)">Protocol</dt><dd>${typeBadge}</dd>
    ${extraProps.map(([k,v]) => `<dt style="color:var(--text-muted)">${escHtml(k)}</dt><dd class="td-mono">${escHtml(v)}</dd>`).join('')}
  </dl>
</div>`;
  }).join('');

  return `<div class="page-header"><h1>🔌 Transports</h1><div class="meta">${transports.length} transport configuration${transports.length !== 1 ? 's' : ''}</div></div>${cards}`;
}

// ─── Stores page ──────────────────────────────────────────────────────────────

function renderStoresPage(model: EMSModel): string {
  const { stores } = model;
  if (!stores.length) return `<div class="page-header"><h1>🗄 Stores</h1></div><div class="empty-state"><div class="icon">🗄</div><p>No stores found${model.sourceMode === 'files' ? ' in stores.conf' : ''}</p></div>`;

  const rows = stores.map(s => {
    const typeBadge = s.type === 'file' ? badge('File', 'badge-generic')
      : s.type === 'async-db' ? badge('Async DB', 'badge-xa')
      : badge(s.type, 'badge-xa');
    const extraProps = Object.entries(s.properties).filter(([k]) => !['type','file','path'].includes(k));
    return `<tr>
    <td class="td-mono" style="font-weight:600">${escHtml(s.name)}</td>
    <td>${typeBadge}</td>
    <td class="td-mono">${s.path ? escHtml(s.path) : '<span style="color:#94a3b8">—</span>'}</td>
    <td class="td-muted">${extraProps.map(([k,v])=>`${escHtml(k)}=${escHtml(v)}`).join(', ') || '—'}</td>
  </tr>`;
  }).join('');

  return `<div class="page-header"><h1>🗄 Stores</h1><div class="meta">${stores.length} message store${stores.length !== 1 ? 's' : ''}</div></div>
<div class="card"><table><thead><tr><th>Store Name</th><th>Type</th><th>Path</th><th>Config</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ─── Live Connections page ────────────────────────────────────────────────────

function renderConnectionsPage(model: EMSModel): string {
  const connections = model.liveConnections ?? [];
  const consumers  = model.liveConsumers ?? [];
  const producers  = model.liveProducers ?? [];

  const connRows = connections.map(c => `<tr>
    <td class="td-mono">${escHtml(c.id)}</td>
    <td class="td-mono">${escHtml(c.user)}</td>
    <td class="td-mono">${escHtml(c.host)}</td>
    <td>${escHtml(c.type)}</td>
    <td>${c.uptime ? escHtml(c.uptime) : '—'}</td>
    <td class="td-center">${numBadge(c.sessions ?? 0)}</td>
  </tr>`).join('');

  const consRows = consumers.map(c => `<tr>
    <td class="td-mono">${escHtml(c.destination)}</td>
    <td>${c.destType === 'topic' ? badge('topic','badge-topic') : badge('queue','badge-queue')}</td>
    <td class="td-muted">${c.durableName ? escHtml(c.durableName) : '—'}</td>
    <td class="td-muted">${c.selector ? escHtml(c.selector) : '—'}</td>
  </tr>`).join('');

  const prodRows = producers.map(p => `<tr>
    <td class="td-mono">${escHtml(p.destination)}</td>
    <td>${p.destType === 'topic' ? badge('topic','badge-topic') : badge('queue','badge-queue')}</td>
    <td class="td-center">${numBadge(p.messageCount ?? 0)}</td>
  </tr>`).join('');

  return `<div class="page-header"><h1>🖧 Live Connections</h1><div class="meta">Snapshot at ${new Date(model.generatedAt).toLocaleString()} · <span class="badge-live badge">LIVE DATA</span></div></div>
${connections.length > 0 ? `<div class="card">
  <div class="card-title">🖧 Active Connections (${connections.length})</div>
  <table><thead><tr><th>ID</th><th>User</th><th>Host</th><th>Type</th><th>Uptime</th><th>Sessions</th></tr></thead>
  <tbody>${connRows}</tbody></table>
</div>` : '<div class="empty-state"><p>No active connections</p></div>'}
${consumers.length > 0 ? `<div class="card">
  <div class="card-title">📥 Active Consumers (${consumers.length})</div>
  <table><thead><tr><th>Destination</th><th>Type</th><th>Durable</th><th>Selector</th></tr></thead>
  <tbody>${consRows}</tbody></table>
</div>` : ''}
${producers.length > 0 ? `<div class="card">
  <div class="card-title">📤 Active Producers (${producers.length})</div>
  <table><thead><tr><th>Destination</th><th>Type</th><th>Messages Sent</th></tr></thead>
  <tbody>${prodRows}</tbody></table>
</div>` : ''}`;
}

// ─── Server config page ───────────────────────────────────────────────────────

function renderServerPage(model: EMSModel): string {
  const SKIP = new Set(['password', 'Password']);
  const props = Object.entries(model.server.properties).filter(([k]) => !SKIP.has(k));
  const cfgFiles = Object.entries(model.server.configFiles);
  const li = model.liveServerInfo;

  const liveSection = li ? `<div class="card">
  <div class="card-title">🟢 Live Server Info <span class="badge-live badge">LIVE</span></div>
  <table class="cfg-table"><tbody>
    ${li.version  ? `<tr><td>Version</td><td class="td-mono">${escHtml(li.version)}</td></tr>` : ''}
    ${li.uptime   ? `<tr><td>Uptime</td><td>${escHtml(li.uptime)}</td></tr>` : ''}
    ${li.host     ? `<tr><td>Host</td><td class="td-mono">${escHtml(li.host)}</td></tr>` : ''}
    ${li.listenUrl? `<tr><td>Listen URL</td><td class="td-mono">${escHtml(li.listenUrl)}</td></tr>` : ''}
    ${li.connections != null ? `<tr><td>Connections</td><td>${li.connections}</td></tr>` : ''}
    ${li.queues != null ? `<tr><td>Queue Count</td><td>${li.queues}</td></tr>` : ''}
    ${li.topics != null ? `<tr><td>Topic Count</td><td>${li.topics}</td></tr>` : ''}
    ${li.msgMemory ? `<tr><td>Message Memory</td><td>${escHtml(li.msgMemory)}</td></tr>` : ''}
    ${li.license  ? `<tr><td>License</td><td class="td-muted">${escHtml(li.license)}</td></tr>` : ''}
    ${li.startTime? `<tr><td>Start Time</td><td>${escHtml(li.startTime)}</td></tr>` : ''}
  </tbody></table>
</div>` : '';

  return `<div class="page-header"><h1>⚙️ Server Configuration</h1><div class="meta">${escHtml(model.server.serverName)} · ${modeBadge(model.sourceMode)}</div></div>
${liveSection}
${cfgFiles.length > 0 ? `<div class="card"><div class="card-title">📁 Referenced Configuration Files</div>
<table class="cfg-table"><tbody>${cfgFiles.map(([k,v])=>`<tr><td>${escHtml(k)}</td><td class="td-mono">${escHtml(v)}</td></tr>`).join('')}</tbody></table></div>` : ''}
${props.length > 0 ? `<div class="card"><div class="card-title">⚙️ Server Properties</div>
<table class="cfg-table"><tbody>${props.map(([k,v])=>`<tr><td>${escHtml(k)}</td><td class="td-mono">${v||'<span style="color:#94a3b8">—</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}

// ─── renderEMSHTML ────────────────────────────────────────────────────────────

export function renderEMSHTML(model: EMSModel, outputDir: string): void {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const isLive = model.sourceMode !== 'files';

  const pages: Array<{ id: string; fn: () => string }> = [
    { id: 'index',       fn: () => renderOverview(model) },
    { id: 'queues',      fn: () => renderDestPage(model, 'queue') },
    { id: 'topics',      fn: () => renderDestPage(model, 'topic') },
    { id: 'factories',   fn: () => renderFactoriesPage(model) },
    { id: 'durables',    fn: () => renderDurablesPage(model) },
    { id: 'bridges',     fn: () => renderBridgesPage(model) },
    { id: 'routes',      fn: () => renderRoutesPage(model) },
    { id: 'users',       fn: () => renderUsersPage(model) },
    { id: 'groups',      fn: () => renderGroupsPage(model) },
    { id: 'acls',        fn: () => renderACLsPage(model) },
    { id: 'transports',  fn: () => renderTransportsPage(model) },
    { id: 'stores',      fn: () => renderStoresPage(model) },
    { id: 'server',      fn: () => renderServerPage(model) },
  ];

  if (isLive && model.liveConnections) {
    pages.push({ id: 'connections', fn: () => renderConnectionsPage(model) });
  }

  for (const p of pages) {
    const sb = renderSidebar(model, p.id);
    const html = page(p.id, sb, p.fn(), model.server.serverName);
    fs.writeFileSync(path.join(outputDir, `${p.id}.html`), html, 'utf8');
  }
}
