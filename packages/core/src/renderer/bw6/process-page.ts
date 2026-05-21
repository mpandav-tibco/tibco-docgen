import { DocModel, FlowDoc, TriggerDoc } from '../../model';
import {
  escHtml,
  safeId,
  paletteForActivity,
  humanTypeForActivity,
  palCls,
  paletteShortDisplay,
  starterBadge,
  transTypeBadge,
  renderBW6Value,
  buildFlowTriggerMap,
  buildProcessLinkResolver,
  paletteFromType,
  humanizeType,
  groupFlowsByParent,
} from './helpers';
import { page } from './page-shell';
import { renderBW6FlowSVG } from '../../svg/flow-renderer';
import { getIconRegistry } from './icon-registry';

export { groupFlowsByParent };

// ─── Processes list page ──────────────────────────────────────────────────────

export function renderBW6ProcessesList(model: DocModel): string {
  const triggerMap = buildFlowTriggerMap(model);
  const groups = groupFlowsByParent(model.flows);

  const rows = Array.from(groups.entries()).map(([key, flows]) => {
    const isGrouped = flows.length > 1 || flows[0].id !== key;
    const href = `processes/${safeId(key)}.html`;

    if (isGrouped) {
      const displayKey = key.split(/[./\\]/).filter(Boolean).pop() ?? key;
      const subNames = flows.map(f => f.id.includes('/') ? f.id.split('/').slice(1).join('/') : f.name).join(', ');
      const totalActs  = flows.reduce((s, f) => s + f.activities.length, 0);
      const totalLinks = flows.reduce((s, f) => s + f.links.length, 0);
      return `<tr>
        <td><a href="${href}">📋 ${escHtml(displayKey)}</a>
          <span style="color:var(--text-muted);font-size:11px;margin-left:6px">(${escHtml(subNames)})</span></td>
        <td><span style="color:#94a3b8">—</span></td>
        <td>${totalActs}</td>
        <td>${totalLinks}</td>
        <td class="td-muted">${escHtml(`Composite process with ${flows.length} sub-handlers`)}</td>
      </tr>`;
    }

    const flow = flows[0];
    const trigger = triggerMap.get(flow.id);
    const starterHtml = trigger ? starterBadge(trigger.ref) : '<span style="color:#94a3b8">—</span>';
    const desc = flow.description || generateFlowDescription(flow, trigger);
    return `<tr>
      <td><a href="${href}">📄 ${escHtml(flow.name)}</a></td>
      <td>${starterHtml}</td>
      <td>${flow.activities.length}</td>
      <td>${flow.links.length}</td>
      <td class="td-muted">${escHtml(desc || '—')}</td>
    </tr>`;
  }).join('');

  const count = groups.size;
  return `<div class="page-header">
  <h1>🔄 Processes</h1>
  <div class="meta">${count} process${count !== 1 ? 'es' : ''}</div>
</div>
<div class="card" style="padding:0;overflow:hidden">
  <table><thead><tr><th>Process</th><th>Starter</th><th>Activities</th><th>Transitions</th><th>Description</th></tr></thead>
  <tbody>${rows}</tbody></table>
</div>`;
}

// ─── Shared description generator ────────────────────────────────────────────

export function generateFlowDescription(flow: FlowDoc, trigger?: TriggerDoc): string {
  const parts: string[] = [];

  // Starter type
  if (trigger) {
    const ref = trigger.ref.toLowerCase();
    if (ref.includes('rest') || ref.includes('http')) {
      parts.push('Exposes an HTTP/REST endpoint');
    } else if (ref.includes('ems') || ref.includes('jms')) {
      parts.push('Subscribes to an EMS/JMS message topic or queue');
    } else if (ref.includes('kafka')) {
      parts.push('Consumes messages from a Kafka topic');
    } else if (ref.includes('timer') || ref.includes('sleep')) {
      parts.push('Triggered by a timer schedule');
    } else if (ref.includes('jdbc')) {
      parts.push('Initiated by a JDBC database event');
    } else {
      parts.push('Started by an external event');
    }
  }

  // What palettes are used (unique readable names, exclude generic/internal ones)
  const EXCLUDE_PALS = new Set(['api', 'general', 'generalactivities', 'service', 'subprocess', 'sharedvar', 'error']);
  const usedPals = new Set<string>();
  for (const act of flow.activities) {
    const pal = paletteForActivity(act.ref, act.name, act.typeId);
    if (pal && !EXCLUDE_PALS.has(pal)) usedPals.add(pal);
  }
  const seenNames = new Set<string>();
  const palNames: string[] = [];
  for (const p of usedPals) {
    const display = paletteShortDisplay(p);
    if (!seenNames.has(display)) { seenNames.add(display); palNames.push(display); }
  }
  if (palNames.length > 0) parts.push(`uses ${palNames.join(', ')} activities`);

  // Error handling
  if (flow.links.some(l => l.type === 'error')) parts.push('includes error handling');

  // Sub-process calls
  if (flow.activities.some(a => a.ref.toLowerCase().includes('callprocess') || a.ref.toLowerCase().includes('subprocess'))) {
    parts.push('calls sub-processes');
  }

  if (parts.length === 0) return '';
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return [first, ...parts.slice(1)].join(', ') + '.';
}

// ─── Shared flow body renderer ────────────────────────────────────────────────

function renderFlowBody(
  model: DocModel,
  flow: FlowDoc,
  triggerMap: Map<string, TriggerDoc>,
  diagBoxId: string,
): string {
  const trigger = triggerMap.get(flow.id);
  const linkResolver = buildProcessLinkResolver(model, 'main');
  const svgHtml = renderBW6FlowSVG(flow, { activityLinks: true, linkResolver, iconRegistry: getIconRegistry() });

  // Identify fault-handler activities: those reachable via error links
  const faultActivityIds = new Set<string>();
  for (const link of flow.links) {
    if (link.type === 'error') faultActivityIds.add(link.to);
  }
  let faultChanged = true;
  while (faultChanged) {
    faultChanged = false;
    for (const link of flow.links) {
      if (faultActivityIds.has(link.from) && !faultActivityIds.has(link.to)) {
        faultActivityIds.add(link.to);
        faultChanged = true;
      }
    }
  }

  const actCards = flow.activities.map((act, i) => {
    const pal = paletteForActivity(act.ref, act.name, act.typeId);
    const humanType = humanTypeForActivity(act.ref, act.name, act.typeId);
    const nameLower = act.name.toLowerCase();
    const typeLower = (act.type ?? '').toLowerCase();
    const isStartEnd = nameLower === 'start' || nameLower === 'end' ||
                       typeLower.endsWith('.start') || typeLower.endsWith('.end');
    const isFaultHandler = faultActivityIds.has(act.id);
    const expanded = !isStartEnd;

    const SKIP_DISPLAY_KEYS = new Set(['expression', 'expressionLanguage', 'xpdlId']);
    const displaySettings = act.settings
      ? Object.fromEntries(Object.entries(act.settings).filter(([k]) => !SKIP_DISPLAY_KEYS.has(k)))
      : {};
    const rawExpression = (act.settings?.['expression'] as string | undefined);

    let configHtml = '';
    if (Object.keys(displaySettings).length > 0) {
      configHtml = `<div class="cfg-section-label">Configuration</div><table class="cfg-table">` +
        Object.entries(displaySettings).map(([k, v]) =>
          `<tr><td>${escHtml(k)}</td><td>${renderBW6Value(v)}</td></tr>`
        ).join('') + `</table>`;
    }
    if (!configHtml && !(act.input && Object.keys(act.input).length > 0) && !rawExpression) {
      configHtml = `<p style="color:var(--text-muted);font-size:12px;padding:4px 0">(no configuration)</p>`;
    }

    let mappingsHtml = '';
    if (act.input && Object.keys(act.input).length > 0) {
      const rows = Object.entries(act.input).map(([target, source]) => {
        const srcStr = String(source);
        const srcRendered = srcStr.startsWith("bw:getModuleProperty(")
          ? `<span class="module-prop-ref">${escHtml(srcStr)}</span>`
          : `<span class="map-source">${escHtml(srcStr)}</span>`;
        return `<tr><td class="map-target" title="${escHtml(target)}">${escHtml(target)}</td><td>${srcRendered}</td></tr>`;
      }).join('');
      mappingsHtml = `<div class="mapping-section">
  <div class="mapping-label">↔ Input Mappings</div>
  <table class="mapping-table">
    <thead><tr><th>Target</th><th>Source Expression</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
    } else if (rawExpression) {
      const decoded = rawExpression
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&').replace(/&#xa;/g, '\n').replace(/&#xA;/g, '\n');
      mappingsHtml = `<div class="mapping-section">
  <div class="mapping-label">↔ Input Mapping (XSLT)</div>
  <pre class="expr-pre">${escHtml(decoded)}</pre>
</div>`;
    } else if (!isStartEnd) {
      mappingsHtml = `<div class="mapping-section">
  <div class="mapping-label">↔ Input Mappings</div>
  <p style="color:var(--text-muted);font-size:12px;padding:4px 0">(no mapping)</p>
</div>`;
    }

    let outputHtml = '';
    if (act.output && act.output.length > 0) {
      const fieldPills = act.output.map(f =>
        `<span class="output-field-pill">${escHtml(f)}</span>`
      ).join('');
      outputHtml = `<div class="mapping-section">
  <div class="mapping-label">↗ Output Fields</div>
  <div class="output-fields">${fieldPills}</div>
</div>`;
    }

    const descHtml = act.description ? `<span class="act-desc">${escHtml(act.description)}</span>` : '';
    const faultBadge = isFaultHandler ? `<span class="fault-handler-badge">⚠ Fault Handler</span>` : '';

    return `<div class="act-card${isFaultHandler ? ' fault-handler' : ''}" id="activity-${safeId(act.id)}" data-expanded="${expanded}">
  <div class="act-card-header" onclick="toggleCard(this.closest('.act-card'))">
    <span class="act-chevron">▶</span>
    <span class="act-pal-badge badge ${palCls(pal)}">${escHtml(paletteShortDisplay(pal))} › ${escHtml(humanType)}</span>
    <span class="act-name">${escHtml(act.name)}</span>
    ${descHtml}
    ${faultBadge}
    <span class="act-card-idx">#${i + 1}</span>
  </div>
  <div class="act-card-body">${configHtml}${mappingsHtml}${outputHtml}</div>
</div>`;
  }).join('\n');

  const transRows = flow.links.map(l => {
    const condHtml = l.condition
      ? `<code style="font-size:11px;font-family:var(--mono)">${escHtml(l.condition)}</code>`
      : '<span style="color:#94a3b8">—</span>';
    return `<tr>
      <td>${escHtml(l.from)}</td>
      <td>${escHtml(l.to)}</td>
      <td>${transTypeBadge(l.type)}</td>
      <td>${condHtml}</td>
    </tr>`;
  }).join('');

  // Process Starter card
  let starterCardHtml = '';
  if (trigger) {
    const settingsRows = Object.entries(trigger.settings ?? {})
      .map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${renderBW6Value(String(v))}</td></tr>`)
      .join('');
    const configBlock = settingsRows
      ? `<div style="margin-top:10px"><table class="cfg-table">${settingsRows}</table></div>`
      : '';
    starterCardHtml = `
<div class="section-title">🚀 Process Starter</div>
<div class="starter-card">
  <h3>🚀 ${escHtml(trigger.name)}</h3>
  <dl class="starter-kv">
    <dt>Palette</dt><dd>${escHtml(paletteFromType(trigger.ref))}</dd>
    <dt>Activity Type</dt><dd>${escHtml(humanizeType(trigger.ref))}</dd>
    ${trigger.description ? `<dt>Description</dt><dd>${escHtml(trigger.description)}</dd>` : ''}
  </dl>
  ${configBlock}
</div>`;
  }

  return `<div class="section-title">📊 Process Diagram
  <button class="toggle-btn" onclick="exportProcessPNG('${escHtml(flow.name)}', '${diagBoxId}')" style="margin-left:auto;display:flex;align-items:center;gap:5px">📷 Export PNG</button>
</div>
<div class="diagram-box" id="${diagBoxId}">${svgHtml}</div>
${starterCardHtml}
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

// ─── Individual process page ──────────────────────────────────────────────────

export function renderBW6ProcessPage(model: DocModel, flow: FlowDoc, triggerMap: Map<string, TriggerDoc>): string {
  const trigger = triggerMap.get(flow.id);
  const starterBadgeHtml = trigger ? starterBadge(trigger.ref) : '';
  const descText = flow.description || generateFlowDescription(flow, trigger);

  return `<div class="breadcrumb">
  <a href="../index.html">Application</a> › <a href="../processes.html">Processes</a> › ${escHtml(flow.name)}
</div>
<div class="page-header">
  <h1>📄 ${escHtml(flow.name)} ${starterBadgeHtml}</h1>
  <div class="meta">Processes/${escHtml(flow.name)}.bwp · ${flow.activities.length} activities · ${flow.links.length} transitions</div>
  ${descText ? `<div class="desc">${escHtml(descText)}</div>` : ''}
</div>
${renderFlowBody(model, flow, triggerMap, 'diagram-box-main')}`;
}

// ─── Grouped process page (e.g. ModuleActivator with onStartup + onShutdown) ─

export function renderBW6GroupedProcessPage(model: DocModel, flows: FlowDoc[], triggerMap: Map<string, TriggerDoc>): string {
  const fullParent = flows[0].id.split('/')[0];
  const parentName = fullParent.split(/[./\\]/).filter(Boolean).pop() ?? fullParent;
  const totalActs  = flows.reduce((s, f) => s + f.activities.length, 0);
  const totalLinks = flows.reduce((s, f) => s + f.links.length, 0);

  const sections = flows.map((f, idx) => {
    const subName = f.id.includes('/') ? f.id.split('/').slice(1).join('/') : f.name;
    const diagBoxId = `diagram-box-${safeId(f.id)}`;
    return `<div class="sub-handler-section" data-expanded="true">
  <div class="sub-handler-header" onclick="toggleSubHandler(this.closest('.sub-handler-section'))">
    <span class="sub-handler-chevron">▼</span>
    <span class="sub-handler-name">⚙️ ${escHtml(subName)}</span>
    <span class="sub-handler-meta">${f.activities.length} activities · ${f.links.length} transitions</span>
  </div>
  <div class="sub-handler-body">
    ${renderFlowBody(model, f, triggerMap, diagBoxId)}
  </div>
</div>`;
  }).join('');

  return `<div class="breadcrumb">
  <a href="../index.html">Application</a> › <a href="../processes.html">Processes</a> › ${escHtml(parentName)}
</div>
<div class="page-header">
  <h1>📋 ${escHtml(parentName)}</h1>
  <div class="meta">${flows.length} sub-handlers · ${totalActs} activities · ${totalLinks} transitions</div>
</div>
${sections}`;
}
