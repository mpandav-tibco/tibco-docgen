"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderHTML = renderHTML;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const flow_renderer_1 = require("../svg/flow-renderer");
const CSS = `
:root {
  --brand: #d63b2f;
  --brand-dark: #a52714;
  --sidebar-bg: #1e2532;
  --sidebar-fg: #cbd5e1;
  --sidebar-hover: #2d3748;
  --sidebar-active: #d63b2f;
  --header-bg: #1e2532;
  --header-fg: #ffffff;
  --content-bg: #f8fafc;
  --card-bg: #ffffff;
  --border: #e2e8f0;
  --text: #1a202c;
  --text-muted: #64748b;
  --link: #d63b2f;
  --tag-bg: #fee2e2;
  --tag-fg: #991b1b;
  --success: #16a34a;
  --mono: 'Cascadia Code', 'Consolas', monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; font-family: 'Segoe UI', system-ui, sans-serif; color: var(--text); background: var(--content-bg); }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Layout */
.layout { display: flex; flex-direction: column; height: 100vh; }

header {
  background: var(--header-bg);
  color: var(--header-fg);
  padding: 0 24px;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  box-shadow: 0 2px 4px #0004;
}
header .logo { font-size: 18px; font-weight: 700; color: var(--brand); letter-spacing: -0.5px; }
header .logo span { color: #ffffff; }
header .subtitle { font-size: 12px; color: #94a3b8; margin-left: auto; }

.body { display: flex; flex: 1; overflow: hidden; }

/* Sidebar */
nav {
  width: 280px;
  background: var(--sidebar-bg);
  color: var(--sidebar-fg);
  overflow-y: auto;
  flex-shrink: 0;
  padding: 16px 0;
}
nav .section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #64748b;
  padding: 12px 20px 6px;
}
nav ul { list-style: none; }
nav ul li a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 20px;
  font-size: 13px;
  color: var(--sidebar-fg);
  border-left: 3px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
nav ul li a:hover { background: var(--sidebar-hover); text-decoration: none; }
nav ul li a.active { border-left-color: var(--brand); color: #fff; background: var(--sidebar-hover); }
nav ul li a .nav-icon { font-size: 14px; opacity: 0.7; }
nav .nav-count {
  margin-left: auto;
  background: #2d3748;
  color: #94a3b8;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
}

/* Content */
main { flex: 1; overflow-y: auto; padding: 32px 40px; }

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

/* Summary cards */
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 32px; }
.stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 16px 20px; box-shadow: 0 1px 3px #0000000d; }
.stat-card .value { font-size: 28px; font-weight: 700; color: var(--brand); }
.stat-card .label { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

/* Flow links within sidebar */
.flow-link { display: block; padding: 5px 20px 5px 36px; font-size: 12px; color: #94a3b8; }
.flow-link:hover { color: #fff; background: var(--sidebar-hover); }

/* Trigger type chips */
.type-chip { font-family: var(--mono); font-size: 11px; padding: 2px 8px;
  background: #0f172a; color: #94a3b8; border-radius: 4px; }

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
`;
function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function badge(text, variant = 'gray') {
    return `<span class="badge badge-${variant}">${esc(text)}</span>`;
}
function shortRef(ref) {
    return ref.replace(/^#/, '').split('/').pop() ?? ref;
}
function triggerBadge(ref) {
    const r = ref.toLowerCase();
    if (r.includes('rest') || r.includes('http'))
        return badge('REST/HTTP', 'blue');
    if (r.includes('timer'))
        return badge('Timer', 'orange');
    if (r.includes('kafka'))
        return badge('Kafka', 'purple');
    if (r.includes('rabbitmq') || r.includes('amqp'))
        return badge('AMQP', 'purple');
    if (r.includes('mqtt'))
        return badge('MQTT', 'green');
    return badge(shortRef(ref), 'gray');
}
function renderNav(model) {
    const flowLinks = model.flows
        .map(f => `<a href="flows/${safeId(f.id)}.html" class="flow-link">↳ ${esc(f.name)}</a>`)
        .join('\n');
    return `<nav>
  <div class="section-title">Application</div>
  <ul>
    <li><a href="index.html"><span class="nav-icon">🏠</span> Overview</a></li>
  </ul>
  <div class="section-title">Flows <span class="nav-count">${model.flows.length}</span></div>
  <ul>
    <li><a href="flows.html"><span class="nav-icon">⚡</span> All Flows <span class="nav-count">${model.flows.length}</span></a></li>
  </ul>
  ${flowLinks}
  <div class="section-title">Configuration</div>
  <ul>
    <li><a href="triggers.html"><span class="nav-icon">🎯</span> Triggers <span class="nav-count">${model.triggers.length}</span></a></li>
    <li><a href="connections.html"><span class="nav-icon">🔌</span> Connections <span class="nav-count">${model.connections.length}</span></a></li>
    <li><a href="properties.html"><span class="nav-icon">⚙️</span> Properties <span class="nav-count">${model.properties.length}</span></a></li>
  </ul>
  <div class="section-title">Documentation</div>
  <ul>
    <li><a href="index.md" target="_blank"><span class="nav-icon">📄</span> Markdown</a></li>
  </ul>
</nav>`;
}
function renderHeader(model) {
    return `<header>
  <div class="logo">TIBCO<span>docgen</span></div>
  <span style="color:#64748b;font-size:13px;margin-left:8px">|</span>
  <span style="color:#94a3b8;font-size:13px;">${esc(model.app.name)}</span>
  <div class="subtitle">Generated ${new Date(model.generatedAt).toLocaleString()}</div>
</header>`;
}
function page(model, title, breadcrumb, body) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)} — ${esc(model.app.name)}</title>
  <style>${CSS}</style>
</head>
<body>
<div class="layout">
  ${renderHeader(model)}
  <div class="body">
    ${renderNav(model)}
    <main>
      <div class="breadcrumb">${breadcrumb}</div>
      ${body}
    </main>
  </div>
</div>
</body>
</html>`;
}
function safeId(id) {
    return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
function renderOverview(model) {
    const { app, flows, triggers, connections, properties } = model;
    const imports = (app.imports ?? [])
        .map(i => `<tr><td class="mono">${esc(i)}</td></tr>`)
        .join('\n');
    const tagBadges = (app.tags ?? []).map(t => badge(t, 'blue')).join(' ');
    return page(model, app.name, `<a href="index.html">Overview</a>`, `
  <div class="page-header">
    <h1>${esc(app.name)}</h1>
    <div class="meta">
      <span>📦 Version ${esc(app.version)}</span>
      ${app.appModel ? `<span>🔖 App Model ${esc(app.appModel)}</span>` : ''}
      <span>🏷️ ${esc(app.sourceFile)}</span>
    </div>
    ${app.description ? `<p style="margin-top:12px;color:#475569;">${esc(app.description)}</p>` : ''}
    ${tagBadges ? `<div style="margin-top:10px;">${tagBadges}</div>` : ''}
  </div>

  <div class="stats">
    <div class="stat-card"><div class="value">${flows.length}</div><div class="label">Flows</div></div>
    <div class="stat-card"><div class="value">${triggers.length}</div><div class="label">Triggers</div></div>
    <div class="stat-card"><div class="value">${connections.length}</div><div class="label">Connections</div></div>
    <div class="stat-card"><div class="value">${properties.length}</div><div class="label">Properties</div></div>
    <div class="stat-card"><div class="value">${flows.reduce((n, f) => n + f.activities.length, 0)}</div><div class="label">Total Activities</div></div>
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
        <td>${esc(t.name)}</td>
        <td>${triggerBadge(t.ref)}</td>
        <td>${t.handlers.map(h => `<a href="flows/${safeId(h.flowRef)}.html">${esc(h.name)}</a>`).join(', ')}</td>
      </tr>`).join('\n')}
      </tbody>
    </table>
  </div>

  ${imports ? `<div class="section">
    <h2>📥 Imports</h2>
    <table><thead><tr><th>Module</th></tr></thead><tbody>${imports}</tbody></table>
  </div>` : ''}
  `);
}
function renderFlowPage(model, flow) {
    const svg = (0, flow_renderer_1.renderFlowSVG)(flow);
    const actRows = flow.activities.map(a => `<tr>
    <td><code>${esc(a.id)}</code></td>
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
    <td>—</td>
  </tr>`).join('\n');
    return page(model, flow.name, `<a href="../index.html">Overview</a> / <a href="../flows.html">Flows</a> / ${esc(flow.name)}`, `
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
    <table><thead><tr><th>Name</th><th>Type</th><th></th></tr></thead>
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
  `);
}
function renderFlowsIndex(model) {
    const cards = model.flows.map(f => {
        const svg = (0, flow_renderer_1.renderFlowSVG)(f);
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
  ${cards}`);
}
function renderTriggersPage(model) {
    const rows = model.triggers.flatMap(t => t.handlers.map(h => `<tr>
      <td>${esc(t.name)}</td>
      <td>${triggerBadge(t.ref)}</td>
      <td>${esc(h.name)}</td>
      <td><a href="flows/${safeId(h.flowRef)}.html">${esc(h.flowRef)}</a></td>
      <td class="ref">${esc(t.ref)}</td>
    </tr>`)).join('\n');
    const settingsCards = model.triggers.map(t => {
        const settings = Object.entries(t.settings ?? {});
        if (!settings.length)
            return '';
        return `<div class="card">
    <div class="card-header"><div class="card-title">${esc(t.name)}</div></div>
    <table>
      <thead><tr><th>Setting</th><th>Value</th></tr></thead>
      <tbody>${settings.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${esc(String(v))}</td></tr>`).join('')}</tbody>
    </table>
  </div>`;
    }).join('\n');
    return page(model, 'Triggers', `<a href="index.html">Overview</a> / Triggers`, `
  <div class="page-header"><h1>🎯 Triggers</h1>
    <div class="meta"><span>${model.triggers.length} triggers</span></div>
  </div>
  <div class="section">
    <h2>Trigger → Flow Bindings</h2>
    <table>
      <thead><tr><th>Trigger</th><th>Type</th><th>Handler</th><th>Flow</th><th>Ref</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${settingsCards ? `<div class="section"><h2>Trigger Settings</h2>${settingsCards}</div>` : ''}
  `);
}
function renderConnectionsPage(model) {
    if (!model.connections.length) {
        return page(model, 'Connections', `<a href="index.html">Overview</a> / Connections`, `
    <div class="page-header"><h1>🔌 Connections</h1></div>
    <p style="color:var(--text-muted)">No connections defined in this application.</p>`);
    }
    const rows = model.connections.map(c => `<tr>
    <td>${esc(c.name)}</td>
    <td>${badge(c.type, 'blue')}</td>
    <td class="ref">${esc(c.ref)}</td>
    <td>${esc(c.description || '—')}</td>
  </tr>`).join('\n');
    return page(model, 'Connections', `<a href="index.html">Overview</a> / Connections`, `
  <div class="page-header"><h1>🔌 Connections</h1>
    <div class="meta"><span>${model.connections.length} connections</span></div>
  </div>
  <div class="section">
    <table>
      <thead><tr><th>Name</th><th>Type</th><th>Ref</th><th>Description</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`);
}
function renderPropertiesPage(model) {
    if (!model.properties.length) {
        return page(model, 'Properties', `<a href="index.html">Overview</a> / Properties`, `
    <div class="page-header"><h1>⚙️ App Properties</h1></div>
    <p style="color:var(--text-muted)">No properties defined in this application.</p>`);
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
  </div>`);
}
function renderHTML(model, outputDir) {
    const flowsDir = path.join(outputDir, 'flows');
    if (!fs.existsSync(flowsDir))
        fs.mkdirSync(flowsDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'index.html'), renderOverview(model), 'utf8');
    fs.writeFileSync(path.join(outputDir, 'flows.html'), renderFlowsIndex(model), 'utf8');
    fs.writeFileSync(path.join(outputDir, 'triggers.html'), renderTriggersPage(model), 'utf8');
    fs.writeFileSync(path.join(outputDir, 'connections.html'), renderConnectionsPage(model), 'utf8');
    fs.writeFileSync(path.join(outputDir, 'properties.html'), renderPropertiesPage(model), 'utf8');
    for (const flow of model.flows) {
        const flowFile = path.join(flowsDir, `${safeId(flow.id)}.html`);
        fs.writeFileSync(flowFile, renderFlowPage(model, flow), 'utf8');
    }
}
//# sourceMappingURL=html.js.map