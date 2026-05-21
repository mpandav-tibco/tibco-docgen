import * as path from 'path';
import * as fs from 'fs';
import { DocModel, FlowDoc, TriggerDoc, ConnectionDoc, PropertyDoc, SchemaDoc, SpecDoc, QAViolation } from '../model';
import { renderFlowSVG } from '../svg/flow-renderer';
import { renderBW6HTML } from './html-bw6';
import { buildFlogoIconRegistry, defaultFlogoExtensionDirs, FlogoIconRegistry } from '../flogo-icons';
import { BW6IconRegistry } from '../bw6-icons';

const CSS = `
:root {
  --brand:         #1a56db;
  --brand-dark:    #1048c0;
  --brand-glow:    #1a56db22;
  --sidebar-bg:    #0c2461;
  --sidebar-fg:    #93c5fd;
  --sidebar-hover: #1a3484;
  --sidebar-active:#60a5fa;
  --header-bg:     #0c2461;
  --header-fg:     #ffffff;
  --content-bg:    #f4f6f9;
  --card-bg:       #ffffff;
  --border:        #e2e8f0;
  --text:          #0f172a;
  --text-muted:    #64748b;
  --link:          #1a56db;
  --tag-bg:        #dbeafe;
  --tag-fg:        #1e40af;
  --success:       #16a34a;
  --mono:          'Cascadia Code', 'Consolas', monospace;
  --sidebar-w:     270px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; font-family: 'Segoe UI', system-ui, sans-serif; color: var(--text); background: var(--content-bg); }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Layout */
.shell { display: flex; height: 100vh; overflow: hidden; }
.sidebar { width: var(--sidebar-w); flex-shrink: 0; background: var(--sidebar-bg); color: var(--sidebar-fg); display: flex; flex-direction: column; overflow-y: auto; }
.sidebar::-webkit-scrollbar { width: 4px; }
.sidebar::-webkit-scrollbar-thumb { background: #1a3484; border-radius: 2px; }
.sidebar-drag { width: 5px; flex-shrink: 0; background: transparent; cursor: col-resize; z-index: 10; transition: background 0.15s; }
.sidebar-drag:hover { background: var(--brand); }
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.topbar { background: var(--header-bg); color: var(--header-fg); padding: 0 20px; height: 48px; display: flex; align-items: center; flex-shrink: 0; border-bottom: 1px solid #1a3484; }
.topbar-brand { display: flex; align-items: center; gap: 9px; }
.brand-wordmark { display: flex; flex-direction: column; }
.brand-name { font-size: 15px; font-weight: 700; background: linear-gradient(90deg, #93c5fd 0%, #bfdbfe 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; line-height: 1.1; }
.brand-tagline { font-size: 9px; color: #64748b; letter-spacing: 0.12em; text-transform: uppercase; line-height: 1; }
.topbar-meta { margin-left: auto; display: flex; gap: 10px; align-items: center; font-size: 11px; color: #94a3b8; }
.edition-badge { background: #1a56db30; color: #93c5fd; padding: 2px 9px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; }

/* Content */
.content { flex: 1; overflow-y: auto; padding: 28px 36px; }
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

/* Sidebar navigation */
.sb-root { padding: 12px; border-bottom: 1px solid #1a3484; }
.sb-root-name { font-size: 13px; font-weight: 700; color: #e2e8f0; display: block; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sb-root-sub  { font-size: 10px; color: #64748b; }
.sb-filter { padding: 8px 10px; border-bottom: 1px solid #1a3484; }
.sb-filter input { width: 100%; background: #122d6e; border: 1px solid #1a3484; border-radius: 4px; color: #93c5fd; font-size: 12px; padding: 5px 8px; outline: none; }
.sb-filter input::placeholder { color: #4a6698; }
.sb-filter input:focus { border-color: var(--brand); }
.sb-item { display: flex; align-items: center; padding: 5px 12px; font-size: 12.5px; color: var(--sidebar-fg); gap: 6px; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
a.sb-item:hover { background: var(--sidebar-hover); color: #e2e8f0; text-decoration: none; }
a.sb-item.active { color: #60a5fa; font-weight: 600; background: #122d6e; border-left: 3px solid #60a5fa; padding-left: 9px; }
.sb-item.folder-header { color: #e2e8f0; font-weight: 600; font-size: 11px; padding-top: 10px; padding-bottom: 3px; letter-spacing: 0.07em; text-transform: uppercase; cursor: default; }
.sb-item.sub { padding-left: 22px; }
.sb-count { margin-left: auto; flex-shrink: 0; font-size: 10px; background: #1a3484; padding: 1px 5px; border-radius: 8px; color: #64748b; }
.sb-divider { border: none; border-top: 1px solid #1a3484; margin: 4px 0; }

.page-header { margin-bottom: 32px; }
.page-header h1 { font-size: 26px; font-weight: 700; color: var(--text); }
.page-header .meta { color: var(--text-muted); font-size: 13px; margin-top: 6px; display: flex; gap: 16px; flex-wrap: wrap; }
.page-header .meta span { display: flex; align-items: center; gap: 4px; }

.breadcrumb { font-size: 12px; color: var(--text-muted); margin-bottom: 16px; }
.breadcrumb a { color: var(--text-muted); }
.breadcrumb a:hover { color: var(--brand); }

.section { margin-bottom: 40px; }
.section h2 { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 16px;
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 8px; border-bottom: 2px solid var(--border); }
.section h3 { font-size: 14px; font-weight: 600; color: var(--text); margin: 20px 0 10px; }

/* Cards */
.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px #0000000d; }
.card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
.card-title { font-size: 15px; font-weight: 600; color: var(--text); }
.card-desc { font-size: 13px; color: var(--text-muted); margin-top: 4px; }

/* Diagram */
.diagram-wrap {
  background: #fafbfc;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  overflow-x: auto;
}
.diagram-wrap svg { display: block; max-width: 100%; }

/* Tables */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { background: #f1f5f9; text-align: left; padding: 8px 12px;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted); border-bottom: 2px solid var(--border); }
td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #f8fafc; }
td.mono { font-family: var(--mono); font-size: 12px; color: #4a5568; }
td.ref { font-family: var(--mono); font-size: 11px; color: var(--text-muted); }

/* Tags / Badges */
.badge { display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge-red { background: #fee2e2; color: #991b1b; }
.badge-blue { background: #dbeafe; color: #1e40af; }
.badge-green { background: #dcfce7; color: #166534; }
.badge-orange { background: #ffedd5; color: #9a3412; }
.badge-purple { background: #f3e8ff; color: #6b21a8; }
.badge-gray { background: #f1f5f9; color: #475569; }

/* Stats grid */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 14px; margin-bottom: 24px; }
.stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; cursor: pointer; display: block; text-decoration: none; color: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
.stat-card:hover { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-glow); text-decoration: none; }
.stat-card .stat-icon { font-size: 22px; margin-bottom: 6px; }
.stat-card .val { font-size: 28px; font-weight: 700; color: var(--brand); }
.stat-card .lbl { font-size: 11px; font-weight: 600; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.06em; }

/* Flow links within sidebar */
.flow-link { display: block; padding: 5px 12px 5px 22px; font-size: 12px; color: var(--sidebar-fg); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.flow-link:hover { color: #e2e8f0; background: var(--sidebar-hover); text-decoration: none; }

/* Trigger type chips */
.type-chip { font-family: var(--mono); font-size: 11px; padding: 2px 8px;
  background: #0f172a; color: #94a3b8; border-radius: 4px; }

/* Activity type badge — larger, colour-coded, used in detail cards */
.act-type {
  display: inline-flex; align-items: center;
  font-family: var(--mono); font-size: 13px; font-weight: 600;
  padding: 4px 12px; border-radius: 6px; letter-spacing: 0.2px;
}
.act-type-noop    { background: #dcfce7; color: #14532d; }
.act-type-log     { background: #dbeafe; color: #1e3a8a; }
.act-type-rest    { background: #ffedd5; color: #7c2d12; }
.act-type-mapper  { background: #fce7f3; color: #831843; }
.act-type-flow    { background: #ede9fe; color: #3b0764; }
.act-type-return  { background: #f1f5f9; color: #334155; }
.act-type-timer   { background: #fef9c3; color: #713f12; }
.act-type-kafka   { background: #e0e7ff; color: #1e1b4b; }
.act-type-db      { background: #ccfbf1; color: #134e4a; }
.act-type-llm     { background: #d1fae5; color: #064e3b; }
.act-type-default { background: #f1f5f9; color: #475569; }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

/* Responsive */
@media (max-width: 768px) {
  nav { display: none; }
  main { padding: 20px; }
}

/* Print */
@media print {
  .layout { display: block; }
  header { position: static; }
  nav { display: none; }
  main { overflow: visible; }
  .diagram-wrap { page-break-inside: avoid; }
}

/* Expand / Collapse activity cards */
.act-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 0; margin-bottom: 12px; scroll-margin-top: 24px; overflow: hidden; }
.act-card-header { display: flex; align-items: center; gap: 12px; padding: 14px 20px; cursor: pointer; user-select: none; flex-wrap: wrap; border-bottom: 1px solid transparent; transition: background 0.15s, border-color 0.15s; }
.act-card-header:hover { background: #f0f6ff; }
.act-card[data-expanded="true"] .act-card-header { border-bottom-color: var(--border); }
.act-card-chevron { font-size: 13px; color: var(--text-muted); transition: transform 0.22s ease; flex-shrink: 0; }
.act-card[data-expanded="false"] .act-card-chevron { transform: rotate(-90deg); }
.act-card-body { padding: 14px 20px 16px; overflow: hidden; max-height: 4000px; transition: max-height 0.3s cubic-bezier(0.4,0,0.2,1), padding 0.3s; }
.act-card[data-expanded="false"] .act-card-body { max-height: 0; padding-top: 0; padding-bottom: 0; }
.btn-sm { font-size: 11px; font-weight: 600; padding: 4px 10px; border: 1px solid var(--border); border-radius: 4px; background: white; color: var(--text-muted); cursor: pointer; font-family: inherit; transition: border-color 0.15s, color 0.15s; }
.btn-sm:hover { border-color: var(--brand); color: var(--brand); }

/* Activity hover tooltip */
#act-tip {
  position: fixed;
  display: none;
  background: #1e2532;
  color: #e2e8f0;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 12px;
  max-width: 280px;
  pointer-events: none;
  z-index: 9999;
  box-shadow: 0 4px 16px #0005;
  line-height: 1.6;
}
#act-tip .tip-name { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
#act-tip .tip-type { font-size: 11px; color: #94a3b8; font-family: monospace; }
#act-tip .tip-desc { border-top: 1px solid #334155; margin-top: 8px; padding-top: 8px; font-size: 11px; color: #cbd5e1; }
.activity { cursor: pointer; }
`;

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(text: string, variant: 'red'|'blue'|'green'|'orange'|'purple'|'gray' = 'gray'): string {
  return `<span class="badge badge-${variant}">${esc(text)}</span>`;
}

function shortRef(ref: string): string {
  return ref.replace(/^#/, '').split('/').pop() ?? ref;
}

function formatSettingValue(value: unknown): string {
  const s = String(value);
  const m = s.match(/^=\$property\[["'](.+?)["']\]$/);
  if (m) {
    return `<span class="badge badge-orange">App Property</span> <code style="font-size:12px;">"${esc(m[1])}"</code>`;
  }
  return `<code style="font-size:12px;">${esc(s)}</code>`;
}

function triggerBadge(ref: string): string {
  const r = ref.toLowerCase();
  if (r.includes('rest') || r.includes('http')) return badge('REST/HTTP', 'blue');
  if (r.includes('timer'))                       return badge('Timer', 'orange');
  if (r.includes('kafka'))                       return badge('Kafka', 'purple');
  if (r.includes('rabbitmq') || r.includes('amqp')) return badge('AMQP', 'purple');
  if (r.includes('mqtt'))                        return badge('MQTT', 'green');
  if (r.includes('ems') || r.includes('jms'))   return badge('EMS/JMS', 'purple');
  return badge(shortRef(ref), 'gray');
}

function activityTypeBadge(ref: string): string {
  const r = ref.toLowerCase();
  const label = shortRef(ref);
  let cls = 'act-type-default';
  if (r.includes('noop') || r.includes('start'))              cls = 'act-type-noop';
  else if (r.includes('log'))                                  cls = 'act-type-log';
  else if (r.includes('rest') || r.includes('http'))          cls = 'act-type-rest';
  else if (r.includes('mapper') || r.includes('map'))         cls = 'act-type-mapper';
  else if (r.includes('subflow') || r.includes('invoke') || r.includes('flow') || r.includes('callprocess')) cls = 'act-type-flow';
  else if (r.includes('return') || r.includes('reply') || r.includes('actreturn') || r.includes('api.end') || r.includes('sendreply')) cls = 'act-type-return';
  else if (r.includes('timer'))                               cls = 'act-type-timer';
  else if (r.includes('kafka') || r.includes('amqp') || r.includes('ems') || r.includes('jms')) cls = 'act-type-kafka';
  else if (r.includes('jdbc') || r.includes('sql') || r.includes('query') || r.includes('insert') || r.includes('postgres') || r.includes('mysql')) cls = 'act-type-db';
  else if (r.includes('llm') || r.includes('claude') || r.includes('openai') || r.includes('agentactivity')) cls = 'act-type-llm';
  return `<span class="act-type ${cls}">${esc(label)}</span>`;
}

function friendlyConnectorName(ref: string): string {
  const r = ref.toLowerCase();
  if (r.includes('rest') || r.includes('http')) return 'REST / HTTP';
  if (r.includes('timer'))                       return 'Timer';
  if (r.includes('kafka'))                       return 'Kafka';
  if (r.includes('rabbitmq') || r.includes('amqp')) return 'RabbitMQ / AMQP';
  if (r.includes('mqtt'))                        return 'MQTT';
  if (r.includes('ems') || r.includes('jms'))   return 'TIBCO EMS / JMS';
  if (r.includes('jdbc') || r.includes('sql'))  return 'JDBC / Database';
  return shortRef(ref);
}

function renderMappingTable(mappings: Record<string, unknown>): string {
  const entries = Object.entries(mappings).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!entries.length) return '';
  const rows = entries.map(([k, v]) =>
    `<tr><td style="width:200px;">${esc(k)}</td><td>${formatSettingValue(v)}</td></tr>`
  ).join('');
  return `<table><thead><tr><th>Parameter</th><th>Value / Expression</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSidebar(model: DocModel, activePath: string = '', depth: number = 0): string {
  const pref = depth > 0 ? '../'.repeat(depth) : '';
  const act = (href: string) => activePath === href ? ' active' : '';

  const flowLinks = model.flows
    .map(f => {
      const href = `flows/${safeId(f.id)}.html`;
      return `<a href="${pref}${href}" class="flow-link sb-filterable${activePath === href ? ' active' : ''}">📄 ${esc(f.name)}</a>`;
    }).join('\n');

  const violations = model.violations ?? [];
  const qaCount = violations.length;
  const qaHasError = violations.some(v => v.severity === 'error');
  const qaBadge = qaCount > 0
    ? `<span class="sb-count" style="background:${qaHasError ? '#fee2e2;color:#dc2626' : '#fef3c7;color:#d97706'}">${qaCount}</span>`
    : `<span class="sb-count" style="background:#d1fae5;color:#065f46">✓</span>`;

  return `<div class="sidebar">
  <div class="sb-root">
    <span class="sb-root-name">📄 ${esc(model.app.name)}</span>
    <span class="sb-root-sub">Flogo · v${esc(model.app.version)}</span>
  </div>
  <div class="sb-filter">
    <input type="text" placeholder="Filter…" oninput="filterSidebar(this.value)" autocomplete="off">
  </div>
  <a href="${pref}index.html" class="sb-item${act('index.html')}">🏠 Overview</a>
  <hr class="sb-divider"/>
  <div class="sb-item folder-header">Flows <span class="sb-count">${model.flows.length}</span></div>
  <a href="${pref}flows.html" class="sb-item sub${act('flows.html')}">⚡ All Flows</a>
  ${flowLinks}
  <hr class="sb-divider"/>
  <div class="sb-item folder-header">Configuration</div>
  <a href="${pref}triggers.html" class="sb-item sub${act('triggers.html')}">🎯 Triggers <span class="sb-count">${model.triggers.length}</span></a>
  <a href="${pref}connections.html" class="sb-item sub${act('connections.html')}">🔌 Connections <span class="sb-count">${model.connections.length}</span></a>
  <a href="${pref}properties.html" class="sb-item sub${act('properties.html')}">⚙️ Properties <span class="sb-count">${model.properties.length}</span></a>
  <a href="${pref}schemas.html" class="sb-item sub${act('schemas.html')}">📐 Schemas <span class="sb-count">${model.schemas.length}</span></a>
  <a href="${pref}specs.html" class="sb-item sub${act('specs.html')}">📋 API Specs <span class="sb-count">${model.specs.length}</span></a>
  <a href="${pref}extensions.html" class="sb-item sub${act('extensions.html')}">🧩 Extensions <span class="sb-count">${(model.app.imports ?? []).length}</span></a>
  <hr class="sb-divider"/>
  <div class="sb-item folder-header">Analysis</div>
  <a href="${pref}qa.html" class="sb-item sub${act('qa.html')}">🔍 QA Analysis ${qaBadge}</a>
  <hr class="sb-divider"/>
  <div class="sb-item folder-header">Downloads</div>
  <a href="${pref}index.md" target="_blank" class="sb-item sub">📝 Markdown</a>
  <a href="${pref}model.json" target="_blank" class="sb-item sub">⬇ JSON Model</a>
</div>`;
}

function renderTopbar(model: DocModel): string {
  return `<div class="topbar">
  <div class="topbar-brand">
    <span style="font-size:22px;line-height:1">📄</span>
    <div class="brand-wordmark">
      <span class="brand-name">DocGen</span>
      <span class="brand-tagline">Integration Docs</span>
    </div>
  </div>
  <div class="topbar-meta">
    <span class="edition-badge">TIBCO Flogo</span>
    <span>${new Date(model.generatedAt).toLocaleString()}</span>
  </div>
</div>`;
}

function page(model: DocModel, title: string, breadcrumb: string, body: string, activePath: string = '', depth: number = 0): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)} — ${esc(model.app.name)}</title>
  <style>${CSS}</style>
</head>
<body>
<div class="shell">
  ${renderSidebar(model, activePath, depth)}
  <div class="sidebar-drag" id="sidebarDrag"></div>
  <div class="main">
    ${renderTopbar(model)}
    <div class="content">
      <div class="breadcrumb">${breadcrumb}</div>
      ${body}
    </div>
  </div>
</div>
<div id="act-tip"></div>
<script>
(function() {
  // Resizable sidebar
  var drag = document.getElementById('sidebarDrag');
  var sidebar = document.querySelector('.sidebar');
  var STORAGE_KEY = 'flogo-docs-sidebar-w';
  var MIN_W = 160, MAX_W = 520;
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
function filterSidebar(q) {
  var lq = q.toLowerCase();
  document.querySelectorAll('.sb-filterable').forEach(function(el) {
    el.style.display = (!lq || el.textContent.toLowerCase().includes(lq)) ? '' : 'none';
  });
}
(function() {
  var tip = document.getElementById('act-tip');
  var current = null;
  function move(x, y) {
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = x + 18;
    var top  = y - 10;
    if (left + tw > window.innerWidth  - 8) left = x - tw - 12;
    if (top  + th > window.innerHeight - 8) top  = y - th - 4;
    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
  }
  function showForElement(el, x, y) {
    if (el.classList.contains('activity')) {
      var name = el.dataset.name || '';
      var type = el.dataset.type || '';
      var ref  = el.dataset.ref  || '';
      var desc = el.dataset.desc || '';
      tip.innerHTML =
        '<div class="tip-name">' + name + '</div>' +
        '<div class="tip-type">' + type + ' &nbsp;·&nbsp; <span style="opacity:0.6">' + ref + '</span></div>' +
        (desc ? '<div class="tip-desc">' + desc + '</div>' : '');
    } else {
      var type2   = el.dataset.type  || 'normal';
      var label2  = el.dataset.label || '';
      var cond2   = el.dataset.condition || '';
      var from2   = el.dataset.from || '';
      var to2     = el.dataset.to   || '';
      var typeBadge = type2 === 'conditional'
        ? '<span style="background:#ffedd5;color:#7c2d12;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600;">conditional</span>'
        : '<span style="background:#f1f5f9;color:#475569;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600;">normal</span>';
      tip.innerHTML =
        '<div class="tip-name" style="font-size:11px;font-weight:400;color:#94a3b8;margin-bottom:4px;">' + from2 + ' → ' + to2 + '</div>' +
        '<div style="margin-bottom:4px;">' + typeBadge + (label2 ? ' <span style="color:#94a3b8;margin-left:4px;">' + label2 + '</span>' : '') + '</div>' +
        (cond2 ? '<div class="tip-desc" style="font-family:monospace;font-size:11px;word-break:break-all;">' + cond2 + '</div>' : '');
    }
    tip.style.display = 'block';
    move(x, y);
  }
  document.addEventListener('mouseover', function(e) {
    var el = e.target && e.target.closest && (e.target.closest('.activity') || e.target.closest('.flow-link'));
    if (!el) return;
    if (el === current) return;
    current = el;
    showForElement(el, e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', function(e) {
    if (!current) return;
    move(e.clientX, e.clientY);
  });
  document.addEventListener('mouseout', function(e) {
    var el = e.target && e.target.closest && (e.target.closest('.activity') || e.target.closest('.flow-link'));
    if (!el) return;
    var to = e.relatedTarget;
    if (to && to.closest && (to.closest('.activity') === el || to.closest('.flow-link') === el)) return;
    current = null;
    tip.style.display = 'none';
  });
})();

function toggleCard(card) {
  var expanded = card.getAttribute('data-expanded') === 'true';
  card.setAttribute('data-expanded', expanded ? 'false' : 'true');
}
function toggleAllCards(expand) {
  document.querySelectorAll('.act-card').forEach(function(c) {
    c.setAttribute('data-expanded', expand ? 'true' : 'false');
  });
}
</script>
</body>
</html>`;
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function classifyImport(mod: string): { kind: string; variant: 'blue'|'green'|'orange'|'purple'|'gray'|'red' } {
  const m = mod.toLowerCase();
  if (m.includes('/trigger/'))    return { kind: 'Trigger',     variant: 'orange' };
  if (m.includes('/activity/'))   return { kind: 'Activity',    variant: 'blue'   };
  if (m.includes('/function/'))   return { kind: 'Function',    variant: 'purple' };
  if (m.includes('/connection/') || m.includes('/connector/')) return { kind: 'Connection', variant: 'green' };
  if (m.includes('flow'))         return { kind: 'Flow Engine', variant: 'gray'   };
  return { kind: 'Extension', variant: 'gray' };
}

interface ConnectorSummary {
  name: string;
  source: 'tibco' | 'core' | 'custom';
  count: number;
  refs: string[];
}

function summariseImports(imports: string[]): ConnectorSummary[] {
  const tibco = new Map<string, string[]>();
  const coreRefs: string[] = [];
  const customRefs: string[] = [];

  for (const raw of imports) {
    // strip leading alias like "rest_1 github.com/..."
    const mod = raw.trim().replace(/^\S+\s+(github\.)/, '$1');

    if (mod.startsWith('github.com/tibco/')) {
      // extract logical connector name: .../src/app/{Name}/...
      const m = mod.match(/\/src\/app\/([^/]+)/);
      const name = m ? m[1] : (mod.split('/')[2] ?? mod);
      if (!tibco.has(name)) tibco.set(name, []);
      tibco.get(name)!.push(mod);
    } else if (mod.startsWith('github.com/project-flogo/')) {
      coreRefs.push(mod);
    } else {
      customRefs.push(mod);
    }
  }

  const result: ConnectorSummary[] = [];
  for (const [name, refs] of tibco) {
    result.push({ name, source: 'tibco', count: refs.length, refs });
  }
  if (coreRefs.length)   result.push({ name: 'Flogo Core Framework', source: 'core',   count: coreRefs.length,   refs: coreRefs });
  if (customRefs.length) result.push({ name: `Custom Extension${customRefs.length > 1 ? 's' : ''}`, source: 'custom', count: customRefs.length, refs: customRefs });
  return result;
}

// ─── Application Architecture Diagram ────────────────────────────────────────

function renderArchitectureSVG(model: DocModel, iconRegistry?: FlogoIconRegistry): string {
  const { flows, triggers, connections } = model;

  // Build trigger→flow and flow→connection wiring
  const flowMap = new Map(flows.map(f => [f.id, f]));

  // Map: flowId → trigger names
  const flowTriggers = new Map<string, string[]>();
  for (const t of triggers) {
    for (const h of t.handlers) {
      if (!h.flowRef) continue;
      if (!flowTriggers.has(h.flowRef)) flowTriggers.set(h.flowRef, []);
      flowTriggers.get(h.flowRef)!.push(t.name);
    }
  }

  // Map: flowId → connection names used (via conn:// refs in raw activity settings)
  const flowConns = new Map<string, Set<string>>();
  for (const f of flows) {
    const conns = new Set<string>();
    for (const act of f.activities) {
      deepSearchSettings(act.settings, (val: string) => {
        const m = val.match(/conn:\/\/([^"'\s,}]+)/g);
        if (m) m.forEach(ref => {
          const id = ref.replace('conn://', '');
          const c = connections.find(c => c.id === id || c.name === id);
          if (c) conns.add(c.name);
        });
      });
    }
    if (conns.size > 0) flowConns.set(f.id, conns);
  }

  // Layout constants
  const COL_TRIG_X = 40;
  const COL_FLOW_X = 340;
  const COL_CONN_X = 640;
  const NODE_W = 200;
  const NODE_H = 52;
  const ROW_GAP = 16;
  const FONT = "'Segoe UI','Arial',sans-serif";

  // Collect unique trigger names and connection names
  const trigNames   = [...new Set(triggers.map(t => t.name))];
  const connNames   = [...new Set(connections.map(c => c.name))];

  const totalRows = Math.max(trigNames.length, flows.length, connNames.length, 1);
  const svgH = totalRows * (NODE_H + ROW_GAP) + 100;
  const svgW = COL_CONN_X + NODE_W + 60;

  function nodeY(index: number, total: number, colTotal: number): number {
    const blockH = colTotal * (NODE_H + ROW_GAP);
    const startY = Math.max(60, (svgH - blockH) / 2);
    return startY + index * (NODE_H + ROW_GAP);
  }

  const trigPosMap = new Map<string, number>(); // name → y center
  const flowPosMap = new Map<string, number>(); // id → y center
  const connPosMap = new Map<string, number>(); // name → y center

  // Render triggers column — each node links to triggers.html
  const trigNodes = trigNames.map((name, i) => {
    const y = nodeY(i, trigNames.length, trigNames.length);
    const cy = y + NODE_H / 2;
    trigPosMap.set(name, cy);
    const trig = triggers.find(t => t.name === name)!;
    const iconURI = iconRegistry?.get(trig.ref);
    const iconEl = iconURI
      ? `<image href="${iconURI}" x="${COL_TRIG_X + 8}" y="${y + (NODE_H - 24) / 2}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="${COL_TRIG_X + 20}" y="${y + NODE_H / 2 + 6}" text-anchor="middle" font-family="${FONT}" font-size="16">🎯</text>`;
    const label = name.length > 22 ? name.slice(0, 21) + '…' : name;
    const trigType = shortRefStr(trig.ref);
    return `
    <a href="triggers.html" style="cursor:pointer" title="${esc(name)}">
      <g class="arch-node">
        <rect x="${COL_TRIG_X}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8"
              fill="#fff7ed" stroke="#f97316" stroke-width="1.5" filter="url(#arch-shadow)"/>
        ${iconEl}
        <text x="${COL_TRIG_X + 40}" y="${y + NODE_H / 2 - 4}" font-family="${FONT}" font-size="12" font-weight="700" fill="#7c2d12">${esc(label)}</text>
        <text x="${COL_TRIG_X + 40}" y="${y + NODE_H / 2 + 12}" font-family="${FONT}" font-size="10" fill="#ea580c">${esc(trigType)}</text>
      </g>
    </a>`;
  }).join('\n');

  // Render flows column — each node links to its individual flow page
  const flowNodes = flows.map((f, i) => {
    const y = nodeY(i, flows.length, flows.length);
    const cy = y + NODE_H / 2;
    flowPosMap.set(f.id, cy);
    const label = f.name.length > 22 ? f.name.slice(0, 21) + '…' : f.name;
    const hasTrig = flowTriggers.has(f.id);
    const bg = hasTrig ? '#f0f9ff' : '#f8fafc';
    const stroke = hasTrig ? '#0284c7' : '#94a3b8';
    const textColor = hasTrig ? '#0c4a6e' : '#475569';
    return `
    <a href="flows/${safeId(f.id)}.html" style="cursor:pointer" title="${esc(f.name)}">
      <g class="arch-node">
        <rect x="${COL_FLOW_X}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8"
              fill="${bg}" stroke="${stroke}" stroke-width="1.5" filter="url(#arch-shadow)"/>
        <text x="${COL_FLOW_X + 10}" y="${y + NODE_H / 2 - 4}" font-family="${FONT}" font-size="16">⚡</text>
        <text x="${COL_FLOW_X + 34}" y="${y + NODE_H / 2 - 4}" font-family="${FONT}" font-size="12" font-weight="700" fill="${textColor}">${esc(label)}</text>
        <text x="${COL_FLOW_X + 34}" y="${y + NODE_H / 2 + 12}" font-family="${FONT}" font-size="10" fill="#64748b">${f.activities.length} activities · ${f.links.length} transitions</text>
      </g>
    </a>`;
  }).join('\n');

  // Render connections column — each node links to connections.html
  const connNodes = connNames.map((name, i) => {
    const y = nodeY(i, connNames.length, connNames.length);
    const cy = y + NODE_H / 2;
    connPosMap.set(name, cy);
    const conn = connections.find(c => c.name === name)!;
    const iconURI = iconRegistry?.get(conn.ref);
    const iconEl = iconURI
      ? `<image href="${iconURI}" x="${COL_CONN_X + 8}" y="${y + (NODE_H - 24) / 2}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="${COL_CONN_X + 20}" y="${y + NODE_H / 2 + 6}" text-anchor="middle" font-family="${FONT}" font-size="16">🔌</text>`;
    const label = name.length > 22 ? name.slice(0, 21) + '…' : name;
    return `
    <a href="connections.html" style="cursor:pointer" title="${esc(name)}">
      <g class="arch-node">
        <rect x="${COL_CONN_X}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8"
              fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5" filter="url(#arch-shadow)"/>
        ${iconEl}
        <text x="${COL_CONN_X + 40}" y="${y + NODE_H / 2 - 4}" font-family="${FONT}" font-size="12" font-weight="700" fill="#14532d">${esc(label)}</text>
        <text x="${COL_CONN_X + 40}" y="${y + NODE_H / 2 + 12}" font-family="${FONT}" font-size="10" fill="#15803d">${esc(conn.type)}</text>
      </g>
    </a>`;
  }).join('\n');

  // Draw arrows: trigger → flow
  const trigArrows = triggers.flatMap(t =>
    t.handlers
      .filter(h => h.flowRef && flowPosMap.has(h.flowRef))
      .map(h => {
        const ty = trigPosMap.get(t.name) ?? 0;
        const fy = flowPosMap.get(h.flowRef) ?? 0;
        const x1 = COL_TRIG_X + NODE_W;
        const x2 = COL_FLOW_X;
        const cx = (x1 + x2) / 2;
        return `<path d="M ${x1} ${ty} C ${cx} ${ty}, ${cx} ${fy}, ${x2} ${fy}"
          fill="none" stroke="#f97316" stroke-width="1.5"
          marker-end="url(#arch-arrow-trig)" opacity="0.8"/>`;
      })
  ).join('\n');

  // Draw arrows: flow → connection
  const connArrows: string[] = [];
  for (const [flowId, connSet] of flowConns) {
    const fy = flowPosMap.get(flowId) ?? 0;
    for (const connName of connSet) {
      const cy = connPosMap.get(connName);
      if (cy === undefined) continue;
      const x1 = COL_FLOW_X + NODE_W;
      const x2 = COL_CONN_X;
      const cx = (x1 + x2) / 2;
      connArrows.push(`<path d="M ${x1} ${fy} C ${cx} ${fy}, ${cx} ${cy}, ${x2} ${cy}"
        fill="none" stroke="#0284c7" stroke-width="1.5"
        marker-end="url(#arch-arrow-conn)" opacity="0.7"/>`);
    }
  }

  // Column header labels
  const headerY = 32;
  const headers = `
    <text x="${COL_TRIG_X + NODE_W / 2}" y="${headerY}" text-anchor="middle"
          font-family="${FONT}" font-size="11" font-weight="700" fill="#9a3412"
          letter-spacing="0.8">TRIGGERS</text>
    <line x1="${COL_TRIG_X}" y1="${headerY + 6}" x2="${COL_TRIG_X + NODE_W}" y2="${headerY + 6}"
          stroke="#f97316" stroke-width="1.5"/>
    <text x="${COL_FLOW_X + NODE_W / 2}" y="${headerY}" text-anchor="middle"
          font-family="${FONT}" font-size="11" font-weight="700" fill="#0c4a6e"
          letter-spacing="0.8">FLOWS</text>
    <line x1="${COL_FLOW_X}" y1="${headerY + 6}" x2="${COL_FLOW_X + NODE_W}" y2="${headerY + 6}"
          stroke="#0284c7" stroke-width="1.5"/>
    <text x="${COL_CONN_X + NODE_W / 2}" y="${headerY}" text-anchor="middle"
          font-family="${FONT}" font-size="11" font-weight="700" fill="#14532d"
          letter-spacing="0.8">CONNECTIONS</text>
    <line x1="${COL_CONN_X}" y1="${headerY + 6}" x2="${COL_CONN_X + NODE_W}" y2="${headerY + 6}"
          stroke="#16a34a" stroke-width="1.5"/>`;

  if (flows.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80">
      <text x="200" y="45" text-anchor="middle" font-family="${FONT}" font-size="13" fill="#94a3b8">No flows defined</text>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <defs>
    <filter id="arch-shadow" x="-10%" y="-20%" width="120%" height="150%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#00000018"/>
    </filter>
    <marker id="arch-arrow-trig" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,1 L0,7 L8,4 z" fill="#f97316"/>
    </marker>
    <marker id="arch-arrow-conn" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,1 L0,7 L8,4 z" fill="#0284c7"/>
    </marker>
    <style>
      .arch-node { transition: opacity .15s; }
      a:hover .arch-node { opacity: .82; }
      a:hover .arch-node rect { stroke-width: 2.5; }
    </style>
  </defs>
  <rect width="${svgW}" height="${svgH}" fill="#fafbfc" rx="10" stroke="#e2e8f0" stroke-width="1"/>
  ${headers}
  ${trigArrows}
  ${connArrows.join('\n')}
  ${trigNodes}
  ${flowNodes}
  ${connNodes}
</svg>`;
}

function shortRefStr(ref: string): string {
  return ref.replace(/^#/, '').split('/').pop() ?? ref;
}

function deepSearchSettings(obj: unknown, cb: (v: string) => void): void {
  if (!obj) return;
  if (typeof obj === 'string') { cb(obj); return; }
  if (Array.isArray(obj)) { obj.forEach(v => deepSearchSettings(v, cb)); return; }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) deepSearchSettings(v, cb);
  }
}

function renderOverview(model: DocModel, iconRegistry?: FlogoIconRegistry): string {
  const archSVG = renderArchitectureSVG(model, iconRegistry);
  const { app, flows, triggers, connections, properties } = model;
  const connectors = summariseImports(app.imports ?? []);
  const connectorRows = connectors.map(c => {
    const sourceBadge = c.source === 'tibco'
      ? badge('OOTB TIBCO', 'red')
      : c.source === 'core'
      ? badge('Flogo Core', 'gray')
      : badge('Custom', 'purple');
    const detail = c.source === 'custom'
      ? `<span style="color:var(--text-muted);font-size:11px;">${c.count} module${c.count > 1 ? 's' : ''} — <a href="extensions.html">view details</a></span>`
      : c.source === 'core'
      ? `<span style="color:var(--text-muted);font-size:11px;">${c.count} module${c.count > 1 ? 's' : ''}</span>`
      : `<span style="color:var(--text-muted);font-size:11px;">${c.count} module${c.count > 1 ? 's' : ''}</span>`;
    return `<tr>
      <td style="font-weight:600;">${esc(c.name)}</td>
      <td>${sourceBadge}</td>
      <td>${detail}</td>
    </tr>`;
  }).join('\n');

  const tagBadges = (app.tags ?? []).map(t => badge(t, 'blue')).join(' ');

  return page(model, app.name, `<a href="index.html">Overview</a>`, `
  <div class="page-header">
    <h1>${esc(app.name)}</h1>
    ${app.description ? `<p style="margin-top:8px;color:#475569;">${esc(app.description)}</p>` : ''}
    ${tagBadges ? `<div style="margin-top:10px;">${tagBadges}</div>` : ''}
    <table style="margin-top:16px;width:auto;min-width:360px;">
      <tbody>
        <tr><td style="width:130px;color:var(--text-muted);font-size:11px;font-weight:700;text-transform:uppercase;padding:5px 12px 5px 0;border:none;">Version</td><td style="padding:5px 0;border:none;font-size:13px;">${esc(app.version)}</td></tr>
        ${app.appModel ? `<tr><td style="color:var(--text-muted);font-size:11px;font-weight:700;text-transform:uppercase;padding:5px 12px 5px 0;border:none;">App Model</td><td style="padding:5px 0;border:none;font-size:13px;">${esc(app.appModel)}</td></tr>` : ''}
        <tr><td style="color:var(--text-muted);font-size:11px;font-weight:700;text-transform:uppercase;padding:5px 12px 5px 0;border:none;">Source File</td><td style="padding:5px 0;border:none;font-size:13px;font-family:var(--mono);">${esc(app.sourceFile)}</td></tr>
        <tr><td style="color:var(--text-muted);font-size:11px;font-weight:700;text-transform:uppercase;padding:5px 12px 5px 0;border:none;">Product</td><td style="padding:5px 0;border:none;">${badge(model.product, 'red')}</td></tr>
        <tr><td style="color:var(--text-muted);font-size:11px;font-weight:700;text-transform:uppercase;padding:5px 12px 5px 0;border:none;">Generated By</td><td style="padding:5px 0;border:none;font-size:13px;">${esc(model.generatedBy)}</td></tr>
        <tr><td style="color:var(--text-muted);font-size:11px;font-weight:700;text-transform:uppercase;padding:5px 12px 5px 0;border:none;">Generated At</td><td style="padding:5px 0;border:none;font-size:13px;">${new Date(model.generatedAt).toLocaleString()}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="stats-grid">
    <a href="flows.html" class="stat-card"><div class="stat-icon">⚡</div><div class="val">${flows.length}</div><div class="lbl">Flows</div></a>
    <a href="triggers.html" class="stat-card"><div class="stat-icon">🎯</div><div class="val">${triggers.length}</div><div class="lbl">Triggers</div></a>
    <a href="connections.html" class="stat-card"><div class="stat-icon">🔌</div><div class="val">${connections.length}</div><div class="lbl">Connections</div></a>
    <a href="properties.html" class="stat-card"><div class="stat-icon">⚙️</div><div class="val">${properties.length}</div><div class="lbl">Properties</div></a>
    <a href="flows.html" class="stat-card"><div class="stat-icon">📊</div><div class="val">${flows.reduce((n, f) => n + f.activities.length, 0)}</div><div class="lbl">Activities</div></a>
  </div>

  <div class="section">
    <h2>🏗 Application Architecture</h2>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">
      High-level wiring of triggers → flows → connections in this application.
    </p>
    <div class="diagram-wrap" style="overflow-x:auto;">${archSVG}</div>
  </div>

  <div class="section">
    <h2>📦 Flows</h2>
    <table>
      <thead><tr><th>Flow Name</th><th>Activities</th><th>Links</th><th>Description</th></tr></thead>
      <tbody>
      ${flows.map(f => `<tr>
        <td><a href="flows/${safeId(f.id)}.html">${esc(f.name)}</a></td>
        <td>${f.activities.length}</td>
        <td>${f.links.length}</td>
        <td>${esc(f.description || '—')}</td>
      </tr>`).join('\n')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>🎯 Triggers</h2>
    <table>
      <thead><tr><th>Name</th><th>Type</th><th>Handlers</th></tr></thead>
      <tbody>
      ${triggers.map(t => `<tr>
        <td><a href="triggers.html#trigger-${safeId(t.id)}">${esc(t.name)}</a></td>
        <td>${triggerBadge(t.ref)}</td>
        <td>${t.handlers.map(h => `<a href="flows/${safeId(h.flowRef)}.html">${esc(h.name)}</a>`).join(', ')}</td>
      </tr>`).join('\n')}
      </tbody>
    </table>
  </div>

  ${connections.length ? `<div class="section">
    <h2>🔌 Connections</h2>
    <table>
      <thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead>
      <tbody>
      ${connections.map(c => `<tr>
        <td><a href="connections.html#connection-${safeId(c.id)}">${esc(c.name)}</a></td>
        <td>${badge(c.type, 'blue')}</td>
        <td>${esc(c.description || '—')}</td>
      </tr>`).join('\n')}
      </tbody>
    </table>
  </div>` : ''}

  ${connectorRows ? `<div class="section">
    <h2>🧩 Connectors in Use</h2>
    <table>
      <thead><tr><th>Connector / Package</th><th>Source</th><th>Modules</th></tr></thead>
      <tbody>${connectorRows}</tbody>
    </table>
    <p style="margin-top:10px;font-size:12px;color:var(--text-muted);">
      <a href="extensions.html">View full extension &amp; module details →</a>
    </p>
  </div>` : ''}
  `, 'index.html', 0);
}

function renderFlowPage(model: DocModel, flow: FlowDoc, iconRegistry?: FlogoIconRegistry): string {
  const svg = renderFlowSVG(flow, { activityLinks: true, iconRegistry });
  const actRows = flow.activities.map(a => `<tr id="activity-${safeId(a.id)}" style="scroll-margin-top:24px;">
    <td><a href="#activity-${safeId(a.id)}"><code>${esc(a.id)}</code></a></td>
    <td>${esc(a.name)}</td>
    <td><span class="type-chip">${esc(shortRef(a.ref))}</span></td>
    <td class="ref">${esc(a.ref)}</td>
    <td>${esc(a.description || '—')}</td>
  </tr>`).join('\n');

  const linkRows = flow.links.map(l => `<tr>
    <td><code>${esc(l.from)}</code></td>
    <td>→</td>
    <td><code>${esc(l.to)}</code></td>
    <td>${l.type === 'expression' ? badge('conditional', 'orange') : badge('normal', 'gray')}</td>
    <td>${l.condition ? `<code style="font-size:11px;">${esc(l.condition)}</code>` : '—'}</td>
  </tr>`).join('\n');

  const inputRows = (flow.metadata?.input ?? []).map(f => `<tr>
    <td>${esc(f.name)}</td>
    <td class="mono">${esc(f.type)}</td>
    <td>${f.required ? badge('required', 'red') : badge('optional', 'gray')}</td>
  </tr>`).join('\n');

  const outputRows = (flow.metadata?.output ?? []).map(f => `<tr>
    <td>${esc(f.name)}</td>
    <td class="mono">${esc(f.type)}</td>
  </tr>`).join('\n');

  return page(model, flow.name,
    `<a href="../index.html">Overview</a> / <a href="../flows.html">Flows</a> / ${esc(flow.name)}`,
    `
  <div class="page-header">
    <h1>⚡ ${esc(flow.name)}</h1>
    <div class="meta">
      <span>ID: <code>${esc(flow.id)}</code></span>
      <span>${flow.activities.length} activities</span>
      <span>${flow.links.length} transitions</span>
    </div>
    ${flow.description ? `<p style="margin-top:10px;color:#475569;">${esc(flow.description)}</p>` : ''}
  </div>

  <div class="section">
    <h2>📊 Flow Diagram</h2>
    <div class="diagram-wrap">${svg}</div>
  </div>

  ${(inputRows || outputRows) ? `<div class="section">
    <h2>📋 Flow Interface</h2>
    ${inputRows ? `<h3>Input Parameters</h3>
    <table><thead><tr><th>Name</th><th>Type</th><th>Required</th></tr></thead>
    <tbody>${inputRows}</tbody></table>` : ''}
    ${outputRows ? `<h3>Output Parameters</h3>
    <table><thead><tr><th>Name</th><th>Type</th></tr></thead>
    <tbody>${outputRows}</tbody></table>` : ''}
  </div>` : ''}

  <div class="section">
    <h2>🧩 Activities</h2>
    <table>
      <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Ref</th><th>Description</th></tr></thead>
      <tbody>${actRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>🔗 Transitions</h2>
    <table>
      <thead><tr><th>From</th><th></th><th>To</th><th>Type</th><th>Condition</th></tr></thead>
      <tbody>${linkRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>🔍 Activity Details
      <div style="margin-left:auto;display:flex;gap:6px;">
        <button class="btn-sm" onclick="toggleAllCards(true)">Expand All</button>
        <button class="btn-sm" onclick="toggleAllCards(false)">Collapse All</button>
      </div>
    </h2>
    ${flow.activities.map(a => {
      const hasSettings = a.settings && Object.keys(a.settings).length > 0;
      const hasInput    = a.input    && Object.keys(a.input).length > 0;
      const settingsTable = hasSettings
        ? `<div style="margin-top:12px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Configuration</div>${renderMappingTable(a.settings!)}</div>`
        : '';
      const inputTable = hasInput
        ? `<div style="margin-top:12px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Input Mappings</div>${renderMappingTable(a.input!)}</div>`
        : '';
      const isEmpty = !hasSettings && !hasInput;
      return `<div id="activity-${safeId(a.id)}" class="act-card" data-expanded="true" scroll-margin-top="24px">
        <div class="act-card-header" onclick="toggleCard(this.closest('.act-card'))">
          <span class="act-card-chevron">▾</span>
          ${activityTypeBadge(a.ref)}
          <span style="font-weight:700;font-size:15px;color:#1d4ed8;">${esc(a.name)}</span>
          <span class="ref" style="font-size:11px;margin-left:auto;">${esc(a.id)}</span>
        </div>
        <div class="act-card-body">
          ${a.description ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${esc(a.description)}</div>` : ''}
          ${isEmpty ? '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">No configuration or input mappings defined.</div>' : ''}
          ${settingsTable}
          ${inputTable}
        </div>
      </div>`;
    }).join('\n')}
  </div>
  `, `flows/${safeId(flow.id)}.html`, 1);
}

function renderFlowsIndex(model: DocModel, iconRegistry?: FlogoIconRegistry): string {
  const cards = model.flows.map(f => {
    const svg = renderFlowSVG(f, { iconRegistry });
    return `<div class="card">
    <div class="card-header">
      <div>
        <div class="card-title"><a href="flows/${safeId(f.id)}.html">${esc(f.name)}</a></div>
        <div class="card-desc">${esc(f.description || 'No description')}</div>
      </div>
      <div style="text-align:right;font-size:12px;color:var(--text-muted)">
        ${f.activities.length} activities · ${f.links.length} transitions
      </div>
    </div>
    <div class="diagram-wrap">${svg}</div>
  </div>`;
  }).join('\n');

  return page(model, 'Flows', `<a href="index.html">Overview</a> / Flows`, `
  <div class="page-header"><h1>⚡ Flows</h1>
    <div class="meta"><span>${model.flows.length} total flows</span></div>
  </div>
  ${cards}`, 'flows.html', 0);
}

function renderHandlerConnectionString(settings: Record<string, unknown> | undefined): string {
  if (!settings) return '—';
  // Common fields across trigger types
  const method = settings['Method'] ?? settings['method'] ?? '';
  const path = settings['Path'] ?? settings['path'] ?? settings['Endpoint'] ?? '';
  const scheduler = settings['Scheduler Options'] ?? settings['Cron Expression'] ?? '';
  const topic = settings['Topic'] ?? settings['topic'] ?? settings['Queue'] ?? settings['queue'] ?? '';
  const server = settings['Server'] ?? settings['server'] ?? settings['Bootstrap Servers'] ?? '';

  const parts: string[] = [];
  if (method) parts.push(`<span class="badge badge-blue">${esc(String(method))}</span>`);
  if (path)   parts.push(`<code style="font-size:12px;">${esc(String(path))}</code>`);
  if (scheduler) parts.push(`<code style="font-size:12px;">${esc(String(scheduler))}</code>`);
  if (topic)  parts.push(`<span class="badge badge-purple">${esc(String(topic))}</span>`);
  if (server) parts.push(`<code style="font-size:12px;">${esc(String(server))}</code>`);
  return parts.length ? parts.join(' ') : '—';
}

function renderTriggersPage(model: DocModel): string {
  const triggerCards = model.triggers.map(t => {
    const triggerSettings = Object.entries(t.settings ?? {});

    const handlerCards = t.handlers.map(h => {
      const connStr = renderHandlerConnectionString(h.settings);
      const handlerSettingsTable = (() => {
        const entries = Object.entries(h.settings ?? {});
        if (!entries.length) return '';
        const rows = entries.map(([k, v]) => `<tr><td style="width:200px;">${esc(k)}</td><td>${formatSettingValue(v)}</td></tr>`).join('');
        return `<div style="margin-top:12px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Handler Settings</div>
        <table><thead><tr><th>Setting</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      })();
      const inputTable = h.input && Object.keys(h.input).length
        ? `<div style="margin-top:12px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Flow Input Mappings <span style="font-weight:400;font-style:italic;text-transform:none;">(trigger → flow)</span></div>${renderMappingTable(h.input)}</div>`
        : '';
      const outputTable = h.output && Object.keys(h.output).length
        ? `<div style="margin-top:12px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Flow Output Mappings <span style="font-weight:400;font-style:italic;text-transform:none;">(flow → response)</span></div>${renderMappingTable(h.output)}</div>`
        : '';

      return `<div style="background:#f8fafc;border:1px solid var(--border);border-radius:6px;padding:14px 16px;margin-bottom:12px;">
        <div style="margin-bottom:10px;">
          <a href="flows/${safeId(h.flowRef)}.html" style="font-weight:700;font-size:14px;">⚡ ${esc(h.name)}</a>
          <span style="font-size:11px;color:var(--text-muted);margin-left:10px;">→ flow: ${esc(h.flowRef.replace('flow:', ''))}</span>
        </div>
        ${connStr !== '—' ? `<div style="margin-bottom:8px;">${connStr}</div>` : ''}
        ${h.description ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${esc(h.description)}</div>` : ''}
        ${handlerSettingsTable}
        ${inputTable}
        ${outputTable}
      </div>`;
    }).join('');

    const settingsRows = triggerSettings.map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td>${formatSettingValue(v)}</td></tr>`
    ).join('');

    return `<div class="card" id="trigger-${safeId(t.id)}" style="margin-bottom:28px;scroll-margin-top:24px;">
    <div class="card-header">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div class="card-title" style="font-size:17px;">${esc(t.name)}</div>
        ${triggerBadge(t.ref)}
      </div>
    </div>

    <table style="margin-bottom:4px;">
      <tbody>
        <tr>
          <td style="width:140px;color:var(--text-muted);font-size:12px;font-weight:600;text-transform:uppercase;border:none;padding:5px 12px 5px 0;">ID</td>
          <td class="mono" style="border:none;padding:5px 0;">${esc(t.id)}</td>
        </tr>
        <tr>
          <td style="color:var(--text-muted);font-size:12px;font-weight:600;text-transform:uppercase;border:none;padding:5px 12px 5px 0;">Connector</td>
          <td style="border:none;padding:5px 0;">${esc(friendlyConnectorName(t.ref))} <span class="ref" style="margin-left:8px;font-size:11px;">${esc(t.ref)}</span></td>
        </tr>
        ${t.description ? `<tr>
          <td style="color:var(--text-muted);font-size:12px;font-weight:600;text-transform:uppercase;border:none;padding:5px 12px 5px 0;">Description</td>
          <td style="border:none;padding:5px 0;">${esc(t.description)}</td>
        </tr>` : ''}
        <tr>
          <td style="color:var(--text-muted);font-size:12px;font-weight:600;text-transform:uppercase;border:none;padding:5px 12px 5px 0;">Handlers</td>
          <td style="border:none;padding:5px 0;">${t.handlers.length}</td>
        </tr>
      </tbody>
    </table>

    ${settingsRows ? `<h3 style="margin:16px 0 8px;">Trigger Settings</h3>
    <table>
      <thead><tr><th>Setting</th><th>Value</th></tr></thead>
      <tbody>${settingsRows}</tbody>
    </table>` : ''}

    <h3 style="margin:16px 0 8px;">Handlers</h3>
    ${handlerCards}
  </div>`;
  }).join('\n');

  return page(model, 'Triggers', `<a href="index.html">Overview</a> / Triggers`, `
  <div class="page-header"><h1>🎯 Triggers</h1>
    <div class="meta"><span>${model.triggers.length} trigger${model.triggers.length !== 1 ? 's' : ''}</span>
    <span>${model.triggers.reduce((n, t) => n + t.handlers.length, 0)} handlers total</span></div>
  </div>
  ${triggerCards}
  `, 'triggers.html', 0);
}

function renderConnectionsPage(model: DocModel): string {
  if (!model.connections.length) {
    return page(model, 'Connections', `<a href="index.html">Overview</a> / Connections`, `
    <div class="page-header"><h1>🔌 Connections</h1></div>
    <p style="color:var(--text-muted)">No connections defined in this application.</p>`, 'connections.html', 0);
  }

  const connCards = model.connections.map(c => {
    const settingsRows = Object.entries(c.settings ?? {}).map(([k, v]) =>
      `<tr><td style="width:200px;">${esc(k)}</td><td>${formatSettingValue(v)}</td></tr>`
    ).join('');

    return `<div class="card" id="connection-${safeId(c.id)}" style="margin-bottom:28px;scroll-margin-top:24px;">
    <div class="card-header">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div class="card-title" style="font-size:17px;">${esc(c.name)}</div>
        ${badge(c.type, 'blue')}
      </div>
    </div>

    <table style="margin-bottom:4px;">
      <tbody>
        <tr>
          <td style="width:140px;color:var(--text-muted);font-size:12px;font-weight:600;text-transform:uppercase;border:none;padding:5px 12px 5px 0;">ID</td>
          <td class="mono" style="border:none;padding:5px 0;">${esc(c.id)}</td>
        </tr>
        <tr>
          <td style="color:var(--text-muted);font-size:12px;font-weight:600;text-transform:uppercase;border:none;padding:5px 12px 5px 0;">Connector Ref</td>
          <td class="ref" style="border:none;padding:5px 0;">${esc(c.ref)}</td>
        </tr>
        ${c.description ? `<tr>
          <td style="color:var(--text-muted);font-size:12px;font-weight:600;text-transform:uppercase;border:none;padding:5px 12px 5px 0;">Description</td>
          <td style="border:none;padding:5px 0;">${esc(c.description)}</td>
        </tr>` : ''}
      </tbody>
    </table>

    ${settingsRows ? `<h3 style="margin:16px 0 8px;">Connection Settings</h3>
    <table>
      <thead><tr><th>Setting</th><th>Value</th></tr></thead>
      <tbody>${settingsRows}</tbody>
    </table>` : '<p style="color:var(--text-muted);font-size:13px;margin-top:12px;">No settings configured.</p>'}
  </div>`;
  }).join('\n');

  return page(model, 'Connections', `<a href="index.html">Overview</a> / Connections`, `
  <div class="page-header"><h1>🔌 Connections</h1>
    <div class="meta"><span>${model.connections.length} connection${model.connections.length !== 1 ? 's' : ''}</span></div>
  </div>
  ${connCards}`, 'connections.html', 0);
}

function renderPropertiesPage(model: DocModel): string {
  if (!model.properties.length) {
    return page(model, 'Properties', `<a href="index.html">Overview</a> / Properties`, `
    <div class="page-header"><h1>⚙️ App Properties</h1></div>
    <p style="color:var(--text-muted)">No properties defined in this application.</p>`, 'properties.html', 0);
  }
  const rows = model.properties.map(p => `<tr>
    <td>${esc(p.name)}</td>
    <td class="mono">${esc(p.type)}</td>
    <td class="mono">${p.value !== undefined ? esc(String(p.value)) : '—'}</td>
    <td>${esc(p.description || '—')}</td>
  </tr>`).join('\n');

  return page(model, 'Properties', `<a href="index.html">Overview</a> / Properties`, `
  <div class="page-header"><h1>⚙️ App Properties</h1>
    <div class="meta"><span>${model.properties.length} properties</span></div>
  </div>
  <div class="section">
    <table>
      <thead><tr><th>Name</th><th>Type</th><th>Value</th><th>Description</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`, 'properties.html', 0);
}

function placeholder(icon: string, title: string, detail: string): string {
  return `<div style="background:#f8fafc;border:1px dashed var(--border);border-radius:8px;padding:40px;text-align:center;">
    <div style="font-size:36px;margin-bottom:14px;">${icon}</div>
    <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:8px;">${title}</div>
    <div style="font-size:13px;color:var(--text-muted);max-width:420px;margin:0 auto;">${detail}</div>
  </div>`;
}

function extractSchemaProperties(
  schemaStr: string
): Array<{ path: string; type: string; format?: string; required: boolean }> {
  try {
    const s = JSON.parse(schemaStr);
    const results: Array<{ path: string; type: string; format?: string; required: boolean }> = [];
    function walk(node: Record<string, unknown>, prefix: string, reqSet: Set<string>) {
      const props = node['properties'] as Record<string, Record<string, unknown>> | undefined;
      if (!props) return;
      for (const [k, v] of Object.entries(props)) {
        const fullPath = prefix ? `${prefix}.${k}` : k;
        const t = String(v['type'] ?? 'any');
        const fmt = v['format'] ? String(v['format']) : undefined;
        results.push({ path: fullPath, type: t, format: fmt, required: reqSet.has(k) });
        if (t === 'object' && v['properties']) walk(v as Record<string, unknown>, fullPath, new Set((v['required'] as string[]) ?? []));
        if (t === 'array' && v['items'] && (v['items'] as Record<string, unknown>)['properties']) {
          walk(v['items'] as Record<string, unknown>, `${fullPath}[]`, new Set(((v['items'] as Record<string, unknown>)['required'] as string[]) ?? []));
        }
      }
    }
    walk(s, '', new Set((s['required'] as string[]) ?? []));
    return results;
  } catch { return []; }
}

function specTypeBadge(type: string): string {
  const t = type.toLowerCase();
  if (t === 'grpc' || t === 'protobuf') return badge('gRPC', 'purple');
  if (t === 'openapi' || t === 'swagger') return badge('OpenAPI', 'blue');
  if (t === 'graphql' || t === 'gql')    return badge('GraphQL', 'red');
  return badge(type, 'gray');
}

function renderSchemasPage(model: DocModel): string {
  if (!model.schemas.length) {
    return page(model, 'Schemas', `<a href="index.html">Overview</a> / Schemas`, `
    <div class="page-header"><h1>📐 Schemas</h1></div>
    ${placeholder('📐', 'No named schemas defined',
      'This application does not define any reusable named schemas. Schemas appear here when the app defines top-level schema objects referenced by flows via <code>schema://name</code>.')}`, 'schemas.html', 0);
  }

  const schemaCards = model.schemas.map(s => {
    const props = extractSchemaProperties(s.value);
    const propRows = props.map(p => `<tr>
      <td style="font-family:var(--mono);font-size:12px;">${esc(p.path)}</td>
      <td>${badge(p.type + (p.format ? ` (${p.format})` : ''), p.type === 'string' ? 'blue' : p.type === 'number' || p.type === 'integer' || p.type === 'float64' ? 'orange' : p.type === 'boolean' ? 'green' : p.type === 'array' ? 'purple' : 'gray')}</td>
      <td>${p.required ? badge('required', 'red') : ''}</td>
    </tr>`).join('');

    return `<div class="card" id="schema-${safeId(s.name)}" style="margin-bottom:24px;scroll-margin-top:24px;">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-weight:700;font-size:16px;color:#1d4ed8;">${esc(s.name)}</span>
          ${badge(s.type, 'gray')}
        </div>
      </div>
      ${props.length ? `
      <table>
        <thead><tr><th>Field Path</th><th>Type</th><th>Required</th></tr></thead>
        <tbody>${propRows}</tbody>
      </table>` : ''}
      <details style="margin-top:12px;">
        <summary style="cursor:pointer;font-size:12px;color:var(--text-muted);user-select:none;">View raw JSON schema</summary>
        <pre style="margin-top:8px;background:#f1f5f9;border:1px solid var(--border);border-radius:6px;padding:12px;font-size:11px;overflow-x:auto;white-space:pre-wrap;">${esc((() => { try { return JSON.stringify(JSON.parse(s.value), null, 2); } catch { return s.value; } })())}</pre>
      </details>
    </div>`;
  }).join('\n');

  return page(model, 'Schemas', `<a href="index.html">Overview</a> / Schemas`, `
  <div class="page-header">
    <h1>📐 Schemas</h1>
    <div class="meta"><span>${model.schemas.length} named schema${model.schemas.length !== 1 ? 's' : ''}</span></div>
  </div>
  ${schemaCards}`, 'schemas.html', 0);
}

function renderSpecsPage(model: DocModel): string {
  if (!model.specs.length) {
    return page(model, 'API Specs', `<a href="index.html">Overview</a> / API Specs`, `
    <div class="page-header"><h1>📋 API Specifications</h1></div>
    ${placeholder('📋', 'No API specs defined',
      'This application does not embed any API specifications. Specs appear here when the app includes gRPC proto files, OpenAPI documents, or GraphQL schemas referenced via <code>spec://id</code>.')}`, 'specs.html', 0);
  }

  const specCards = model.specs.map(s => {
    const lang = s.type.toLowerCase().includes('grpc') ? 'protobuf'
               : s.type.toLowerCase().includes('graphql') ? 'graphql'
               : 'yaml';
    return `<div class="card" id="spec-${safeId(s.id)}" style="margin-bottom:24px;scroll-margin-top:24px;">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font-weight:700;font-size:16px;color:#1d4ed8;">${esc(s.name)}</span>
          ${specTypeBadge(s.type)}
          <span class="ref" style="font-size:11px;">ID: ${esc(s.id)}</span>
        </div>
      </div>
      <pre style="background:#0f172a;color:#e2e8f0;border-radius:6px;padding:16px;font-size:12px;overflow-x:auto;white-space:pre;font-family:var(--mono);line-height:1.6;">${esc(s.content)}</pre>
    </div>`;
  }).join('\n');

  return page(model, 'API Specs', `<a href="index.html">Overview</a> / API Specs`, `
  <div class="page-header">
    <h1>📋 API Specifications</h1>
    <div class="meta"><span>${model.specs.length} spec${model.specs.length !== 1 ? 's' : ''}</span></div>
  </div>
  ${specCards}`, 'specs.html', 0);
}

function renderExtensionsPage(model: DocModel): string {
  const imports = model.app.imports ?? [];
  if (!imports.length) {
    return page(model, 'Extensions & Connectors', `<a href="index.html">Overview</a> / Extensions &amp; Connectors`, `
    <div class="page-header"><h1>🧩 Extensions &amp; Connectors in Use</h1></div>
    <p style="color:var(--text-muted)">No extensions or connectors imported in this application.</p>`, 'extensions.html', 0);
  }

  const rows = imports.map(mod => {
    const { kind, variant } = classifyImport(mod);
    const parts = mod.split('/');
    const shortName = parts[parts.length - 1];
    const org = parts.slice(0, 2).join('/');
    return `<tr>
      <td style="font-weight:600;">${esc(shortName)}</td>
      <td>${badge(kind, variant)}</td>
      <td class="ref">${esc(org)}</td>
      <td class="mono" style="font-size:11px;">${esc(mod)}</td>
    </tr>`;
  }).join('\n');

  return page(model, 'Extensions & Connectors',
    `<a href="index.html">Overview</a> / Extensions &amp; Connectors`, `
  <div class="page-header">
    <h1>🧩 Extensions &amp; Connectors in Use</h1>
    <div class="meta"><span>${imports.length} modules</span></div>
  </div>
  <div class="section">
    <table>
      <thead><tr><th>Name</th><th>Kind</th><th>Organization</th><th>Full Module Path</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`, 'extensions.html', 0);
}

// ─── QA Analysis page ─────────────────────────────────────────────────────────

function renderFlogoQAPage(model: DocModel): string {
  const violations = model.violations ?? [];
  const errors   = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  const infos    = violations.filter(v => v.severity === 'info');

  function ruleCount() { return 43; }

  const flogoAttributionBar = `<div style="display:flex;align-items:center;gap:8px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:8px 14px;margin-bottom:18px;font-size:12px;color:#0369a1">
  <span>ℹ</span>
  <span>Rules are based on the <a href="https://github.com/mpandav-tibco/flogo-sonar" target="_blank" rel="noopener" style="color:#0369a1;font-weight:600">TIBCO Flogo Sonar Plugin</a> — an open-source static analysis ruleset for Flogo quality, security and maintainability.</span>
</div>`;

  if (violations.length === 0) {
    return page(model, 'QA Analysis', '<a href="index.html">Overview</a> / QA Analysis',
      `<div class="page-header"><h1>✅ QA Analysis</h1></div>
${flogoAttributionBar}
<div class="section" style="border-left:4px solid #22c55e;background:#f0fdf4;padding:24px;border-radius:8px">
  <p style="color:#16a34a;font-weight:600;font-size:15px">No violations found — this application passes all ${ruleCount()} quality checks.</p>
  <p style="color:#4ade80;font-size:13px;margin-top:6px">Rules checked: Security (16), Reliability (11), Maintainability (16)</p>
</div>`, 'qa.html', 0);
  }

  const statsGrid = `<div class="stats-grid" style="margin-bottom:20px">
  <div class="stat-card" style="border-color:#ef4444;background:#fef2f2">
    <div class="val" style="color:#dc2626">${errors.length}</div><div class="lbl">Errors</div>
  </div>
  <div class="stat-card" style="border-color:#f59e0b;background:#fffbeb">
    <div class="val" style="color:#d97706">${warnings.length}</div><div class="lbl">Warnings</div>
  </div>
  <div class="stat-card" style="border-color:#3b82f6;background:#eff6ff">
    <div class="val" style="color:#2563eb">${infos.length}</div><div class="lbl">Info</div>
  </div>
  <div class="stat-card">
    <div class="val">${violations.length}</div><div class="lbl">Total</div>
  </div>
</div>`;

  function severityBadge(v: QAViolation): string {
    if (v.severity === 'error')   return `<span class="badge" style="background:#fee2e2;color:#dc2626;min-width:54px;text-align:center">ERROR</span>`;
    if (v.severity === 'warning') return `<span class="badge" style="background:#fef3c7;color:#d97706;min-width:54px;text-align:center">WARN</span>`;
    return `<span class="badge" style="background:#dbeafe;color:#1d4ed8;min-width:54px;text-align:center">INFO</span>`;
  }

  function renderGroup(title: string, icon: string, items: QAViolation[], borderColor: string): string {
    if (items.length === 0) return '';
    const rows = items.map(v => `<tr>
      <td>${severityBadge(v)}</td>
      <td style="font-family:monospace;font-size:12px;color:#64748b;white-space:nowrap">${esc(v.ruleId)}</td>
      <td>${esc(v.message)}</td>
      <td style="color:#64748b;font-size:12px">${esc(v.location)}</td>
      <td style="color:#64748b;font-size:12px">${v.detail ? esc(v.detail) : '—'}</td>
    </tr>`).join('');
    return `<div class="section" style="border-top:3px solid ${borderColor}">
  <h2>${icon} ${esc(title)} <span style="font-weight:400;color:var(--text-muted)">(${items.length})</span></h2>
  <table><thead><tr><th style="width:70px">Severity</th><th style="width:90px">Rule</th><th>Message</th><th>Location</th><th>Detail</th></tr></thead>
  <tbody>${rows}</tbody></table>
</div>`;
  }

  return page(model, 'QA Analysis', '<a href="index.html">Overview</a> / QA Analysis',
    `<div class="page-header">
  <h1>🔍 QA Analysis</h1>
  <div class="meta">${violations.length} violation${violations.length !== 1 ? 's' : ''} · ${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}, ${infos.length} info</div>
</div>
${flogoAttributionBar}
${statsGrid}
${renderGroup('Errors', '🔴', errors, '#ef4444')}
${renderGroup('Warnings', '🟡', warnings, '#f59e0b')}
${renderGroup('Info', '🔵', infos, '#3b82f6')}`, 'qa.html', 0);
}

export function renderHTML(model: DocModel, outputDir: string, options?: { bw6Icons?: BW6IconRegistry }): void {
  if (model.product === 'bw6') { renderBW6HTML(model, outputDir, { bw6Icons: options?.bw6Icons }); return; }

  const flowsDir = path.join(outputDir, 'flows');
  if (!fs.existsSync(flowsDir)) fs.mkdirSync(flowsDir, { recursive: true });

  // Build Flogo icon registry from OOTB VS Code extension
  let iconRegistry: FlogoIconRegistry | undefined;
  try {
    const extDirs = defaultFlogoExtensionDirs();
    if (extDirs.length > 0) {
      iconRegistry = buildFlogoIconRegistry(extDirs);
    }
  } catch { /* icon registry is optional */ }

  fs.writeFileSync(path.join(outputDir, 'index.html'), renderOverview(model, iconRegistry), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'flows.html'), renderFlowsIndex(model, iconRegistry), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'triggers.html'), renderTriggersPage(model), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'connections.html'), renderConnectionsPage(model), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'properties.html'), renderPropertiesPage(model), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'schemas.html'), renderSchemasPage(model), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'specs.html'), renderSpecsPage(model), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'extensions.html'), renderExtensionsPage(model), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'qa.html'), renderFlogoQAPage(model), 'utf8');

  for (const flow of model.flows) {
    const flowFile = path.join(flowsDir, `${safeId(flow.id)}.html`);
    fs.writeFileSync(flowFile, renderFlowPage(model, flow, iconRegistry), 'utf8');
  }
}
