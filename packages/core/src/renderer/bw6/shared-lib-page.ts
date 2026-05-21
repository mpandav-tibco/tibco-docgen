import { DocModel, BW6SharedLibDoc, FlowDoc } from '../../model';
import {
  escHtml,
  safeId,
  paletteForActivity,
  humanTypeForActivity,
  palCls,
  paletteShortDisplay,
  transTypeBadge,
  renderBW6Value,
  buildFlowTriggerMap,
  buildProcessLinkResolver,
  dedupePalettes,
  parsePalette,
  categoryFromType,
  categoryIcon,
  groupConnections,
} from './helpers';
import { page } from './page-shell';
import { renderBW6FlowSVG } from '../../svg/flow-renderer';
import { renderSharedLibSidebarSection } from './sidebar';
import { getIconRegistry } from './icon-registry';
import { generateFlowDescription } from './process-page';

export function renderSharedLibIndex(lib: BW6SharedLibDoc): string {
  const palettes = dedupePalettes(lib.palettes.filter(Boolean).map(parsePalette));
  const processRows = lib.flows.map(f => `<tr>
    <td><a href="processes/${safeId(f.id)}.html">📄 ${escHtml(f.name)}</a></td>
    <td>${f.activities.length}</td>
    <td>${f.links.length}</td>
    <td class="td-muted">${escHtml(f.description || '—')}</td>
  </tr>`).join('');

  const statsHtml = `<div class="stats-grid">
  <div class="stat-card"><div class="val">${lib.flows.length}</div><div class="lbl">Processes</div></div>
  <div class="stat-card"><div class="val">${lib.connections.length}</div><div class="lbl">Resources</div></div>
  <div class="stat-card"><div class="val">${lib.schemas.length}</div><div class="lbl">Schemas</div></div>
  <div class="stat-card"><div class="val">${lib.properties.length}</div><div class="lbl">Properties</div></div>
</div>`;

  const infoCard = `<div class="app-info-card" style="border-color:#818cf8;background:linear-gradient(135deg,#818cf808 0%,#6366f108 100%)">
  <div class="app-info-header">
    <div>
      <div class="app-info-title" style="color:#4338ca">📚 ${escHtml(lib.name)}</div>
      <div class="app-info-subtitle">${escHtml(lib.id)}</div>
    </div>
    <span class="badge pal-api" style="margin-left:auto;background:#e0e7ff;color:#3730a3">SharedLib · ${escHtml(lib.edition)}</span>
  </div>
  ${lib.description ? `<div class="app-info-desc">${escHtml(lib.description)}</div>` : ''}
  <div class="app-info-grid">
    <div class="app-info-row"><span class="app-info-label">ID:</span><span class="app-info-value td-mono">${escHtml(lib.id)}</span></div>
    <div class="app-info-row"><span class="app-info-label">Version:</span><span class="app-info-value">${escHtml(lib.version)}</span></div>
  </div>
</div>`;

  const processesCard = lib.flows.length > 0 ? `<div class="card">
  <div class="card-title">🔄 Processes</div>
  <table><thead><tr><th>Process</th><th>Activities</th><th>Transitions</th><th>Description</th></tr></thead>
  <tbody>${processRows}</tbody></table>
</div>` : '';

  const palettesCard = palettes.length > 0 ? `<div class="card">
  <div class="card-title">🧩 Required Palettes</div>
  <table><thead><tr><th>Palette</th><th>Bundle ID</th></tr></thead>
  <tbody>${palettes.map(p => `<tr>
    <td><span class="badge ${palCls(p.shortName)}">${escHtml(p.displayName)}</span></td>
    <td class="td-mono">${escHtml(p.bundleId)}</td>
  </tr>`).join('')}</tbody></table>
</div>` : '';

  return `<div class="breadcrumb"><a href="../../index.html">Application</a> › Shared Libraries</div>
<div class="page-header"><h1>📚 ${escHtml(lib.name)}</h1>
<div class="meta">Shared Library · ${escHtml(lib.id)} v${escHtml(lib.version)}</div>
</div>
${infoCard}
${statsHtml}
${processesCard}
${palettesCard}`;
}

export function renderSharedLibProcessPage(model: DocModel, lib: BW6SharedLibDoc, flow: FlowDoc): string {
  const linkResolver = buildProcessLinkResolver(model, 'sharedlib', safeId(lib.id));
  const svgHtml = renderBW6FlowSVG(flow, { activityLinks: true, linkResolver, iconRegistry: getIconRegistry() });

  const libFaultIds = new Set<string>();
  for (const link of flow.links) {
    if (link.type === 'error') libFaultIds.add(link.to);
  }
  let libFaultChanged = true;
  while (libFaultChanged) {
    libFaultChanged = false;
    for (const link of flow.links) {
      if (libFaultIds.has(link.from) && !libFaultIds.has(link.to)) { libFaultIds.add(link.to); libFaultChanged = true; }
    }
  }

  const actCards = flow.activities.map((act, i) => {
    const typeId2 = act.typeId;
    const pal = paletteForActivity(act.ref, act.name, typeId2);
    const humanType = humanTypeForActivity(act.ref, act.name, typeId2);
    const nameLower = act.name.toLowerCase();
    const isStartEnd = nameLower === 'start' || nameLower === 'end';
    const isFaultHandler = libFaultIds.has(act.id);
    const expanded = !isStartEnd;

    const SKIP_DISPLAY_KEYS2 = new Set(['expression', 'expressionLanguage', 'xpdlId']);
    const displaySettings2 = act.settings
      ? Object.fromEntries(Object.entries(act.settings).filter(([k]) => !SKIP_DISPLAY_KEYS2.has(k)))
      : {};
    const rawExpression2 = (act.settings?.['expression'] as string | undefined);

    let configHtml = '';
    if (Object.keys(displaySettings2).length > 0) {
      configHtml = `<div class="cfg-section-label">Configuration</div><table class="cfg-table">` +
        Object.entries(displaySettings2).map(([k, v]) =>
          `<tr><td>${escHtml(k)}</td><td>${renderBW6Value(v)}</td></tr>`
        ).join('') + `</table>`;
    }
    let mappingsHtml2 = '';
    if (act.input && Object.keys(act.input).length > 0) {
      const rows = Object.entries(act.input).map(([target, source]) => {
        const srcStr = String(source);
        const srcRendered = srcStr.startsWith("bw:getModuleProperty(")
          ? `<span class="module-prop-ref">${escHtml(srcStr)}</span>`
          : `<span class="map-source">${escHtml(srcStr)}</span>`;
        return `<tr><td class="map-target" title="${escHtml(target)}">${escHtml(target)}</td><td>${srcRendered}</td></tr>`;
      }).join('');
      mappingsHtml2 = `<div class="mapping-section">
  <div class="mapping-label">↔ Input Mappings</div>
  <table class="mapping-table">
    <thead><tr><th>Target</th><th>Source Expression</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
    } else if (rawExpression2) {
      const decoded2 = rawExpression2
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&').replace(/&#xa;/g, '\n').replace(/&#xA;/g, '\n');
      mappingsHtml2 = `<div class="mapping-section">
  <div class="mapping-label">↔ Input Mapping (XSLT)</div>
  <pre class="expr-pre">${escHtml(decoded2)}</pre>
</div>`;
    } else if (!isStartEnd) {
      mappingsHtml2 = `<div class="mapping-section">
  <div class="mapping-label">↔ Input Mappings</div>
  <p style="color:var(--text-muted);font-size:12px;padding:4px 0">(no mapping)</p>
</div>`;
    }
    if (!configHtml && !mappingsHtml2) {
      configHtml = `<p style="color:var(--text-muted);font-size:12px;padding:4px 0">(no configuration)</p>`;
    }

    let outputHtml2 = '';
    if (act.output && act.output.length > 0) {
      const fieldPills = act.output.map(f => `<span class="output-field-pill">${escHtml(f)}</span>`).join('');
      outputHtml2 = `<div class="mapping-section">
  <div class="mapping-label">↗ Output Fields</div>
  <div class="output-fields">${fieldPills}</div>
</div>`;
    }

    const faultBadge = isFaultHandler ? `<span class="fault-handler-badge">⚠ Fault Handler</span>` : '';
    return `<div class="act-card${isFaultHandler ? ' fault-handler' : ''}" id="activity-${safeId(act.id)}" data-expanded="${expanded}">
  <div class="act-card-header" onclick="toggleCard(this.closest('.act-card'))">
    <span class="act-chevron">▶</span>
    <span class="act-pal-badge badge ${palCls(pal)}">${escHtml(paletteShortDisplay(pal))} › ${escHtml(humanType)}</span>
    <span class="act-name">${escHtml(act.name)}</span>
    ${act.description ? `<span class="act-desc">${escHtml(act.description)}</span>` : ''}
    ${faultBadge}
    <span class="act-card-idx">#${i + 1}</span>
  </div>
  <div class="act-card-body">${configHtml}${mappingsHtml2}${outputHtml2}</div>
</div>`;
  }).join('\n');

  const transRows = flow.links.map(l => `<tr>
    <td>${escHtml(l.from)}</td>
    <td>${escHtml(l.to)}</td>
    <td>${transTypeBadge(l.type)}</td>
    <td>${l.condition ? `<code style="font-size:11px;font-family:var(--mono)">${escHtml(l.condition)}</code>` : '<span style="color:#94a3b8">—</span>'}</td>
  </tr>`).join('');

  const slibDescText = flow.description || generateFlowDescription(flow);
  return `<div class="breadcrumb">
  <a href="../../index.html">Application</a> › <a href="../index.html">📚 ${escHtml(lib.name)}</a> › ${escHtml(flow.name)}
</div>
<div class="page-header">
  <h1>📄 ${escHtml(flow.name)}</h1>
  <div class="meta">Processes/${escHtml(flow.name)}.bwp · ${flow.activities.length} activities · ${flow.links.length} transitions</div>
  ${slibDescText ? `<div class="desc">${escHtml(slibDescText)}</div>` : ''}
</div>
<div class="section-title">📊 Process Diagram
  <button class="toggle-btn" onclick="exportProcessPNG('${escHtml(flow.name)}')" style="margin-left:auto;display:flex;align-items:center;gap:5px">📷 Export PNG</button>
</div>
<div class="diagram-box" id="diagram-box-main">${svgHtml}</div>

<div class="section-title">🔧 Activities (${flow.activities.length})</div>
<div class="toggle-bar">
  <button class="toggle-btn" onclick="toggleAllCards(true)">Expand All</button>
  <button class="toggle-btn" onclick="toggleAllCards(false)">Collapse All</button>
</div>
${actCards}

<div class="section-title" style="margin-top:20px">↔️ Transitions (${flow.links.length})</div>
${flow.links.length > 0
  ? `<div class="card" style="padding:0;overflow:hidden">
      <table><thead><tr><th>From</th><th>To</th><th>Type</th><th>Condition</th></tr></thead>
      <tbody>${transRows}</tbody></table>
    </div>`
  : `<p style="color:var(--text-muted)">No transitions defined</p>`}`;
}

export function renderSharedLibResourcesPage(lib: BW6SharedLibDoc): string {
  if (lib.connections.length === 0) {
    return `<div class="breadcrumb"><a href="../../index.html">Application</a> › <a href="index.html">📚 ${escHtml(lib.name)}</a></div>
<div class="page-header"><h1>🔌 Shared Resources</h1></div>
<div class="empty-state"><div class="icon">🔌</div><p>No shared resources</p></div>`;
  }
  const groups = groupConnections(lib.connections);
  let content = '';
  for (const [cat, cs] of groups) {
    const icon = categoryIcon(cat);
    const cards = cs.map(c => {
      const settings = c.settings ?? {};
      const settingsHtml = Object.keys(settings).length > 0
        ? `<table class="cfg-table">` + Object.entries(settings).map(([k, v]) =>
            `<tr><td>${escHtml(k)}</td><td>${renderBW6Value(v)}</td></tr>`).join('') + `</table>`
        : `<p style="color:var(--text-muted);font-size:13px">(no configuration)</p>`;
      return `<div class="card" style="margin-bottom:14px">
  <div class="card-title">${icon} ${escHtml(c.name)} <span class="badge ${palCls(categoryFromType(c.ref))}" style="margin-left:8px;font-size:11px">${escHtml(c.type)}</span></div>
  ${settingsHtml}
</div>`;
    }).join('');
    content += `<div class="resource-group"><h3>${icon} ${cat}</h3>${cards}</div>`;
  }
  return `<div class="breadcrumb"><a href="../../index.html">Application</a> › <a href="index.html">📚 ${escHtml(lib.name)}</a></div>
<div class="page-header"><h1>🔌 Shared Resources</h1><div class="meta">${lib.connections.length} resource${lib.connections.length !== 1 ? 's' : ''}</div></div>
${content}`;
}

export function renderSharedLibSchemasPage(lib: BW6SharedLibDoc): string {
  if (lib.schemas.length === 0) {
    return `<div class="breadcrumb"><a href="../../index.html">Application</a> › <a href="index.html">📚 ${escHtml(lib.name)}</a></div>
<div class="page-header"><h1>📐 Schemas</h1></div>
<div class="empty-state"><div class="icon">📐</div><p>No XSD schemas</p></div>`;
  }
  const summaryRows = lib.schemas.map(s => {
    const nsMatch = s.value.match(/targetNamespace\s*=\s*["']([^"']+)["']/);
    const ns = nsMatch?.[1] ?? '—';
    const elemCount = (s.value.match(/<[^:]*:?element\b/g) ?? []).length;
    return `<tr><td>${escHtml(s.name)}</td><td class="td-mono">${escHtml(ns)}</td><td>${elemCount}</td></tr>`;
  }).join('');
  const schemaCards = lib.schemas.map(s => `<div class="schema-card" data-expanded="false">
  <div class="schema-card-header" onclick="toggleSchema(this.closest('.schema-card'))">
    <span class="act-chevron">▶</span>
    <span style="font-weight:600">${escHtml(s.name)}</span>
  </div>
  <div class="schema-card-body"><pre class="schema-pre">${escHtml(s.value)}</pre></div>
</div>`).join('\n');
  return `<div class="breadcrumb"><a href="../../index.html">Application</a> › <a href="index.html">📚 ${escHtml(lib.name)}</a></div>
<div class="page-header"><h1>📐 Schemas</h1><div class="meta">${lib.schemas.length} XSD schema${lib.schemas.length !== 1 ? 's' : ''}</div></div>
<div class="card">
  <div class="card-title">Summary</div>
  <table><thead><tr><th>File</th><th>Namespace</th><th>Elements</th></tr></thead><tbody>${summaryRows}</tbody></table>
</div>
${schemaCards}`;
}

export function renderSharedLibPropertiesPage(lib: BW6SharedLibDoc): string {
  if (lib.properties.length === 0) {
    return `<div class="breadcrumb"><a href="../../index.html">Application</a> › <a href="index.html">📚 ${escHtml(lib.name)}</a></div>
<div class="page-header"><h1>⚙️ Properties</h1></div>
<div class="empty-state"><div class="icon">⚙️</div><p>No properties defined</p></div>`;
  }
  const rows = lib.properties.map(p => `<tr>
    <td class="td-mono">${escHtml(p.name)}</td>
    <td>${escHtml(p.type || 'String')}</td>
    <td>${renderBW6Value(p.value)}</td>
    <td class="td-muted">${escHtml(p.description ?? '—')}</td>
  </tr>`).join('');
  return `<div class="breadcrumb"><a href="../../index.html">Application</a> › <a href="index.html">📚 ${escHtml(lib.name)}</a></div>
<div class="page-header"><h1>⚙️ Properties</h1><div class="meta">${lib.properties.length} module properties</div></div>
<div class="card" style="padding:0;overflow:hidden">
  <table><thead><tr><th>Name</th><th>Type</th><th>Value</th><th>Description</th></tr></thead>
  <tbody>${rows}</tbody></table>
</div>`;
}
