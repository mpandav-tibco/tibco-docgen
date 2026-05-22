import { DocModel, FlowDoc, ActivityDoc } from '../../model';
import { BW6IconRegistry } from '../../bw6-icons';
import { renderArchDiagramSVG } from './overview';
import { renderBW6FlowSVG, renderFlowSVG } from '../../svg/flow-renderer';
import { escHtml, safeId, buildFlowTriggerMap, humanizeType, paletteFromType, groupFlowsByParent } from './helpers';

// ─── Utilities ────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return escHtml(String(s ?? ''));
}

function palBadge(palette: string): string {
  const colors: Record<string, string> = {
    Kafka: '#6366f1', JDBC: '#0d9488', EMS: '#4f46e5', REST: '#f97316',
    Log: '#3b82f6', Timer: '#f59e0b', Error: '#ef4444', 'Sub-Process': '#7c3aed',
    Service: '#6d28d9', General: '#64748b',
  };
  const bg = colors[palette] ?? '#64748b';
  return `<span style="background:${bg};color:#fff;padding:1px 6px;border-radius:3px;font-size:9pt;font-weight:600">${esc(palette)}</span>`;
}

function svgToFitPage(svgString: string): string {
  // Only strip width/height from the root <svg> element — NOT from child <image> or other elements.
  // A global replace would break <image width="..."> attributes and cause icons to overflow.
  return svgString
    .replace(/^(<svg[^>]*?)\s+width="[^"]*"/, '$1')
    .replace(/^(<svg[^>]*?)\s+height="[^"]*"/, '$1')
    .replace(/style="[^"]*min-width:[^"]*"/, 'style="display:block"');
}

function table(headers: string[], rows: string[][], compact = false): string {
  const thStyle = `style="background:#f1f5f9;padding:${compact ? '4px 8px' : '7px 10px'};text-align:left;font-size:${compact ? '9' : '10'}pt;font-weight:600;border:1px solid #e2e8f0;color:#374151"`;
  const tdStyle = `style="padding:${compact ? '4px 8px' : '6px 10px'};font-size:${compact ? '9' : '10'}pt;border:1px solid #e2e8f0;vertical-align:top"`;
  const head = `<tr>${headers.map(h => `<th ${thStyle}>${esc(h)}</th>`).join('')}</tr>`;
  const body = rows.map(r => `<tr>${r.map(c => `<td ${tdStyle}>${c}</td>`).join('')}</tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">${head}${body}</table>`;
}

function statBox(label: string, value: string | number, accent = '#00695c'): string {
  return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px 18px;text-align:center;min-width:100px;flex:1">
    <div style="font-size:22pt;font-weight:700;color:${accent}">${value}</div>
    <div style="font-size:9pt;color:#64748b;margin-top:2px">${label}</div>
  </div>`;
}

function sectionTitle(text: string, id?: string): string {
  return `<h2 id="${id ?? safeId(text)}" style="font-size:14pt;font-weight:700;color:#0f2922;border-bottom:2px solid #00897b;padding-bottom:6px;margin:0 0 16px">${esc(text)}</h2>`;
}

function subTitle(text: string, id?: string): string {
  return `<h3 id="${id ?? safeId(text)}" style="font-size:12pt;font-weight:600;color:#1d4ed8;margin:20px 0 10px">${esc(text)}</h3>`;
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function buildCoverPage(model: DocModel): string {
  const totalActs = model.flows.reduce((n, f) => n + f.activities.length, 0);
  const sharedLibs = model.bw6SharedLibs ?? [];
  const violations = model.violations ?? [];
  const errors = violations.filter(v => v.severity === 'error').length;
  const warnings = violations.filter(v => v.severity === 'warning').length;
  const qaColor = errors > 0 ? '#dc2626' : warnings > 0 ? '#d97706' : '#059669';
  const qaLabel = errors > 0 ? `${errors} Error${errors > 1 ? 's' : ''}` : warnings > 0 ? `${warnings} Warning${warnings > 1 ? 's' : ''}` : 'Clean';
  const generatedAt = new Date(model.generatedAt).toLocaleString();
  const profileNames = Object.keys(model.profileProperties ?? {});

  return `
<div class="cover-page">
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0f1e2e 100%);color:#fff;padding:40px 50px;border-radius:12px;margin-bottom:32px">
      <div style="font-size:11pt;letter-spacing:0.15em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px">${model.product === 'flogo' ? 'TIBCO Flogo' : 'TIBCO BusinessWorks 6'} — Application Documentation</div>
      <div style="font-size:28pt;font-weight:700;line-height:1.2;margin-bottom:12px">${esc(model.app.name)}</div>
      ${model.app.description ? `<div style="font-size:11pt;color:#cbd5e1;line-height:1.5">${esc(model.app.description)}</div>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:32px">
      <div style="padding:14px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <div style="font-size:9pt;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Document Metadata</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="font-size:10pt;color:#64748b;padding:3px 0;width:40%">Version</td><td style="font-size:10pt;font-weight:600;color:#1e293b">${esc(model.app.version)}</td></tr>
          <tr><td style="font-size:10pt;color:#64748b;padding:3px 0">Product</td><td style="font-size:10pt;font-weight:600;color:#1e293b">${model.product === 'flogo' ? 'TIBCO Flogo' : 'TIBCO BusinessWorks 6'}</td></tr>
          <tr><td style="font-size:10pt;color:#64748b;padding:3px 0">Generated</td><td style="font-size:10pt;font-weight:600;color:#1e293b">${esc(generatedAt)}</td></tr>
          <tr><td style="font-size:10pt;color:#64748b;padding:3px 0">Generated By</td><td style="font-size:10pt;font-weight:600;color:#1e293b">${esc(model.generatedBy)}</td></tr>
          ${profileNames.length > 0 ? `<tr><td style="font-size:10pt;color:#64748b;padding:3px 0">Profiles</td><td style="font-size:10pt;font-weight:600;color:#1e293b">${profileNames.map(p => esc(p)).join(', ')}</td></tr>` : ''}
        </table>
      </div>
      <div style="padding:14px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <div style="font-size:9pt;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Application Statistics</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="font-size:10pt;color:#64748b;padding:3px 0;width:60%">${model.product === 'flogo' ? 'Flows' : 'Processes'}</td><td style="font-size:10pt;font-weight:700;color:#00695c">${groupFlowsByParent(model.flows).size}</td></tr>
          <tr><td style="font-size:10pt;color:#64748b;padding:3px 0">Total Activities</td><td style="font-size:10pt;font-weight:700;color:#00695c">${totalActs}</td></tr>
          <tr><td style="font-size:10pt;color:#64748b;padding:3px 0">${model.product === 'flogo' ? 'Triggers' : 'Process Starters'}</td><td style="font-size:10pt;font-weight:700;color:#00695c">${model.triggers.length + (model.restBindings?.length ?? 0)}</td></tr>
          <tr><td style="font-size:10pt;color:#64748b;padding:3px 0">${model.product === 'flogo' ? 'Connections' : 'Shared Resources'}</td><td style="font-size:10pt;font-weight:700;color:#00695c">${model.connections.length}</td></tr>
          ${model.product !== 'flogo' ? `<tr><td style="font-size:10pt;color:#64748b;padding:3px 0">Schemas (XSD)</td><td style="font-size:10pt;font-weight:700;color:#00695c">${model.schemas.length}</td></tr>` : ''}
          ${model.product !== 'flogo' ? `<tr><td style="font-size:10pt;color:#64748b;padding:3px 0">Shared Libraries</td><td style="font-size:10pt;font-weight:700;color:#00695c">${sharedLibs.length}</td></tr>` : ''}
          <tr><td style="font-size:10pt;color:#64748b;padding:3px 0">QA Status</td><td style="font-size:10pt;font-weight:700;color:${qaColor}">${qaLabel}</td></tr>
        </table>
      </div>
    </div>
  </div>
  <div style="text-align:center;color:#94a3b8;font-size:9pt;padding-top:16px;border-top:1px solid #e2e8f0">
    Generated by TIBCO DocGen · ${esc(generatedAt)}
  </div>
</div>`;
}

// ─── Table of Contents ────────────────────────────────────────────────────────

function buildTOC(model: DocModel): string {
  const sharedLibs = model.bw6SharedLibs ?? [];
  const violations = model.violations ?? [];

  const isFlogo = model.product === 'flogo';
  const entries: Array<{ level: number; label: string; anchor: string }> = [
    { level: 1, label: 'Application Architecture', anchor: 'sec-arch' },
    { level: 1, label: 'Summary', anchor: 'sec-summary' },
    { level: 1, label: isFlogo ? 'Flows' : 'Processes', anchor: 'sec-processes' },
    ...Array.from(groupFlowsByParent(model.flows).entries()).map(([key, gFlows], i) => {
      const isGrouped = gFlows.length > 1 || gFlows[0].id !== key;
      const displayName = isGrouped ? (key.split(/[./\\]/).filter(Boolean).pop() ?? key) : gFlows[0].name;
      return { level: 2, label: `${i + 1}. ${displayName}`, anchor: `proc-${safeId(key)}` };
    }),
  ];
  if (model.connections.length > 0)
    entries.push({ level: 1, label: isFlogo ? 'Connections' : 'Shared Resources', anchor: 'sec-resources' });
  if (model.properties.length > 0) {
    entries.push({ level: 1, label: isFlogo ? 'Application Properties' : 'Module Properties', anchor: 'sec-properties' });
    for (const pn of Object.keys(model.profileProperties ?? {}))
      entries.push({ level: 2, label: `Profile: ${pn}`, anchor: `prof-${safeId(pn)}` });
  }
  if (model.schemas.length > 0)
    entries.push({ level: 1, label: 'Schemas (XSD)', anchor: 'sec-schemas' });
  if (model.specs.length > 0)
    entries.push({ level: 1, label: 'Service Descriptors', anchor: 'sec-specs' });
  if (sharedLibs.length > 0) {
    entries.push({ level: 1, label: 'Shared Libraries', anchor: 'sec-sharedlibs' });
    for (const lib of sharedLibs)
      entries.push({ level: 2, label: lib.name, anchor: `lib-${safeId(lib.id)}` });
  }
  if (violations.length > 0)
    entries.push({ level: 1, label: 'QA Report', anchor: 'sec-qa' });

  const rows = entries.map(e => {
    const indent = e.level === 2 ? 'padding-left:24px;' : '';
    const weight = e.level === 1 ? 'font-weight:600;' : '';
    return `<tr>
      <td style="${indent}${weight}font-size:10pt;padding:4px 8px;border-bottom:1px solid #f1f5f9">
        <a href="#${e.anchor}" style="color:#0369a1;text-decoration:none">${esc(e.label)}</a>
      </td>
    </tr>`;
  }).join('');

  return `
<div class="toc-page">
  ${sectionTitle('Table of Contents', 'toc')}
  <table style="width:100%;border-collapse:collapse">${rows}</table>
</div>`;
}

// ─── Architecture section ─────────────────────────────────────────────────────

function buildArchSection(model: DocModel): string {
  const archSvg = svgToFitPage(renderArchDiagramSVG(model));
  return `
<div class="section" id="sec-arch">
  ${sectionTitle('Application Architecture')}
  <div style="width:100%;overflow:hidden">${archSvg}</div>
</div>`;
}

// ─── Summary section ──────────────────────────────────────────────────────────

function buildSummarySection(model: DocModel): string {
  const totalActs = model.flows.reduce((n, f) => n + f.activities.length, 0);
  const sharedLibs = model.bw6SharedLibs ?? [];
  const triggerMap = buildFlowTriggerMap(model);
  const processGroups = groupFlowsByParent(model.flows);

  const processRows: string[][] = [];
  let gi = 0;
  for (const [key, gFlows] of processGroups) {
    gi++;
    const isGrouped = gFlows.length > 1 || gFlows[0].id !== key;
    if (isGrouped) {
      const displayName = key.split(/[./\\]/).filter(Boolean).pop() ?? key;
      const totalGroupActs  = gFlows.reduce((s, f) => s + f.activities.length, 0);
      const totalGroupLinks = gFlows.reduce((s, f) => s + f.links.length, 0);
      const subNames = gFlows.map(f => f.id.includes('/') ? f.id.split('/').slice(1).join('/') : f.name).join(', ');
      processRows.push([`${gi}`, `${esc(displayName)} <span style="font-size:8pt;color:#64748b">(${esc(subNames)})</span>`, '—', `${totalGroupActs}`, `${totalGroupLinks}`, 'Composite process']);
    } else {
      const flow = gFlows[0];
      const starterRef = triggerMap.get(flow.id)?.ref ?? '';
      const starterLabel = starterRef ? humanizeType(starterRef) : '—';
      processRows.push([`${gi}`, esc(flow.name), esc(starterLabel), `${flow.activities.length}`, `${flow.links.length}`, esc(flow.description || '—')]);
    }
  }

  return `
<div class="section" id="sec-summary">
  ${sectionTitle('Summary')}
  <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
    ${statBox(model.product === 'flogo' ? 'Flows' : 'Processes', processGroups.size)}
    ${statBox('Total Activities', totalActs)}
    ${statBox(model.product === 'flogo' ? 'Triggers' : 'Starters', model.triggers.length + (model.restBindings?.length ?? 0))}
    ${statBox(model.product === 'flogo' ? 'Connections' : 'Resources', model.connections.length)}
    ${model.product !== 'flogo' ? statBox('Schemas', model.schemas.length) : ''}
    ${model.product !== 'flogo' ? statBox('Shared Libs', sharedLibs.length) : ''}
  </div>
  ${table(['#', model.product === 'flogo' ? 'Flow Name' : 'Process Name', 'Starter', 'Activities', 'Transitions', 'Description'], processRows)}
</div>`;
}

// ─── Process sections ─────────────────────────────────────────────────────────

function getFaultIds(flow: FlowDoc): Set<string> {
  const errorTargets = new Set<string>();
  for (const l of flow.links) if (l.type === 'error') errorTargets.add(l.to);
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of flow.links) {
      if (errorTargets.has(l.from) && !errorTargets.has(l.to)) { errorTargets.add(l.to); changed = true; }
    }
  }
  return errorTargets;
}

function buildProcessSection(flow: FlowDoc, index: number, triggerMap: Map<string, { ref: string }>, product: string, iconRegistry?: BW6IconRegistry, addPageBreak = true): string {
  const starterRef = (triggerMap.get(flow.id) as { ref?: string })?.ref ?? '';
  const starterLabel = starterRef ? humanizeType(starterRef) : '—';
  const faultIds = getFaultIds(flow);
  const flowSvg = svgToFitPage(
    product === 'flogo'
      ? renderFlowSVG(flow, { activityLinks: false })
      : renderBW6FlowSVG(flow, { activityLinks: false, iconRegistry })
  );

  const SKIP_KEYS = new Set(['expression', 'expressionLanguage', 'xpdlId']);

  const actRows = flow.activities.map((a: ActivityDoc, i) => {
    const palette = paletteFromType(a.ref);
    const isFault = faultIds.has(a.id);
    return [
      `${i + 1}`,
      esc(a.name) + (isFault ? ' <span style="color:#dc2626;font-size:8pt">⚠ Fault</span>' : ''),
      palBadge(palette),
      esc(humanizeType(a.ref)),
      esc(a.description || '—'),
    ];
  });

  // Per-activity detail cards (configuration + input mappings) — always expanded in PDF
  const actDetails = flow.activities.map((a: ActivityDoc, i) => {
    const nameLower = a.name.toLowerCase();
    const typeLower = (a.type ?? '').toLowerCase();
    const isStartEnd = nameLower === 'start' || nameLower === 'end'
      || typeLower.endsWith('.start') || typeLower.endsWith('.end');
    if (isStartEnd) return '';

    const isFault = faultIds.has(a.id);
    const palette = paletteFromType(a.ref);
    const displaySettings = a.settings
      ? Object.fromEntries(Object.entries(a.settings).filter(([k]) => !SKIP_KEYS.has(k)))
      : {};
    const rawExpression = (a.settings?.['expression'] as string | undefined);

    let configHtml = '';
    if (Object.keys(displaySettings).length > 0) {
      const cfgRows = Object.entries(displaySettings).map(([k, v]) => {
        const val = v === null || v === undefined ? '' : String(v);
        return `<tr><td style="color:#64748b;padding:3px 8px;white-space:nowrap;font-size:9pt">${esc(k)}</td>`
          + `<td style="padding:3px 8px;font-size:9pt"><code style="background:#f1f5f9;padding:1px 4px;border-radius:3px">${esc(val)}</code></td></tr>`;
      }).join('');
      configHtml = `<div style="font-size:9pt;font-weight:600;color:#64748b;margin:6px 0 4px">Configuration</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:8px">${cfgRows}</table>`;
    }

    let mappingsHtml = '';
    if (a.input && Object.keys(a.input).length > 0) {
      const mapRows = Object.entries(a.input).map(([target, source]) => {
        const srcStr = String(source ?? '');
        return `<tr><td style="color:#0f172a;padding:3px 8px;font-size:9pt;max-width:200px;overflow:hidden">${esc(target)}</td>`
          + `<td style="padding:3px 8px;font-size:9pt"><code style="background:#f0fdf4;color:#15803d;padding:1px 4px;border-radius:3px">${esc(srcStr)}</code></td></tr>`;
      }).join('');
      mappingsHtml = `<div style="font-size:9pt;font-weight:600;color:#64748b;margin:6px 0 4px">↔ Input Mappings</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:8px">
  <thead><tr>
    <th style="text-align:left;padding:3px 8px;font-size:8.5pt;color:#94a3b8;border-bottom:1px solid #e2e8f0">Target</th>
    <th style="text-align:left;padding:3px 8px;font-size:8.5pt;color:#94a3b8;border-bottom:1px solid #e2e8f0">Source Expression</th>
  </tr></thead>
  <tbody>${mapRows}</tbody>
</table>`;
    } else if (rawExpression) {
      const decoded = rawExpression
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&').replace(/&#xa;/g, '\n').replace(/&#xA;/g, '\n');
      mappingsHtml = `<div style="font-size:9pt;font-weight:600;color:#64748b;margin:6px 0 4px">↔ Input Mapping (XSLT)</div>
<pre style="font-size:8pt;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px;overflow-x:auto;white-space:pre-wrap;margin-bottom:8px">${esc(decoded)}</pre>`;
    } else {
      mappingsHtml = `<p style="color:#94a3b8;font-size:9pt;margin:4px 0 8px">(no mapping)</p>`;
    }

    if (!configHtml && mappingsHtml.includes('no mapping')) return ''; // nothing to show

    const faultLabel = isFault
      ? ` <span style="color:#dc2626;font-size:8pt;font-weight:600">⚠ Fault</span>` : '';
    return `<div style="border:1px solid ${isFault ? '#fca5a5' : '#e2e8f0'};border-radius:6px;padding:10px 12px;margin-bottom:10px;background:${isFault ? '#fff5f5' : '#fff'};page-break-inside:avoid">
  <div style="font-size:10pt;font-weight:700;color:#1e293b;margin-bottom:4px">
    ${palBadge(palette)}
    <span style="margin-left:6px">${esc(a.name)}${faultLabel}</span>
    <span style="color:#94a3b8;font-size:9pt;font-weight:400;margin-left:6px">#${i + 1}</span>
  </div>
  ${a.description ? `<div style="color:#64748b;font-size:9pt;margin-bottom:6px">${esc(a.description)}</div>` : ''}
  ${configHtml}${mappingsHtml}
</div>`;
  }).join('');

  const tranRows = flow.links.map(l => {
    const color = l.type === 'error' ? '#dc2626' : l.type === 'expression' ? '#d97706' : '#374151';
    return [
      esc(l.from), esc(l.to),
      `<span style="color:${color};font-weight:600">${esc(l.type)}</span>`,
      l.condition ? `<code style="font-size:8pt;background:#f1f5f9;padding:1px 4px;border-radius:3px">${esc(l.condition)}</code>` : '—',
    ];
  });

  return `
<div class="section${addPageBreak ? ' process-section' : ''}" id="proc-${safeId(flow.id)}">
  ${subTitle(`${index}. ${flow.name}`, `proc-${safeId(flow.id)}`)}
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:10pt">
    <strong>${product === 'flogo' ? 'Flow ID' : 'Process ID'}:</strong> <code style="font-size:9pt">${esc(flow.id)}</code>
    &nbsp;·&nbsp; <strong>${product === 'flogo' ? 'Trigger' : 'Starter'}:</strong> ${esc(starterLabel)}
    &nbsp;·&nbsp; <strong>Activities:</strong> ${flow.activities.length}
    &nbsp;·&nbsp; <strong>Transitions:</strong> ${flow.links.length}
    ${flow.description ? `<br><span style="color:#64748b;margin-top:4px;display:block">${esc(flow.description)}</span>` : ''}
  </div>

  <div style="font-size:10pt;font-weight:600;color:#374151;margin-bottom:8px">${product === 'flogo' ? 'Flow Diagram' : 'Process Flow Diagram'}</div>
  <div style="width:100%;overflow:hidden;background:#fafafa;border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin-bottom:14px">
    ${flowSvg}
  </div>

  <div style="font-size:10pt;font-weight:600;color:#374151;margin-bottom:6px">Activities</div>
  ${table(['#', 'Name', 'Palette', 'Type', 'Description'], actRows, true)}

  ${actDetails ? `<div style="font-size:10pt;font-weight:600;color:#374151;margin:14px 0 8px">Activity Details</div>
  ${actDetails}` : ''}

  ${tranRows.length > 0 ? `<div style="font-size:10pt;font-weight:600;color:#374151;margin-bottom:6px">Transitions</div>
  ${table(['From', 'To', 'Type', 'Condition'], tranRows, true)}` : ''}
</div>`;
}

function buildGroupedProcessSection(key: string, flows: FlowDoc[], groupIndex: number, triggerMap: Map<string, { ref: string }>, product: string, iconRegistry?: BW6IconRegistry): string {
  const displayName = key.split(/[./\\]/).filter(Boolean).pop() ?? key;
  const totalActs  = flows.reduce((s, f) => s + f.activities.length, 0);
  const totalLinks = flows.reduce((s, f) => s + f.links.length, 0);
  const subNames = flows.map(f => f.id.includes('/') ? f.id.split('/').slice(1).join('/') : f.name).join(', ');
  const subSections = flows.map((flow, i) =>
    buildProcessSection(flow, i + 1, triggerMap, product, iconRegistry, false)
  ).join('\n');

  return `
<div class="section process-section" id="proc-${safeId(key)}">
  ${subTitle(`${groupIndex}. ${esc(displayName)}`)}
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:10pt">
    <strong>Process Group:</strong> <code style="font-size:9pt">${esc(key)}</code>
    &nbsp;·&nbsp; <strong>Sub-handlers:</strong> ${flows.length} (${esc(subNames)})
    &nbsp;·&nbsp; <strong>Total Activities:</strong> ${totalActs}
    &nbsp;·&nbsp; <strong>Total Transitions:</strong> ${totalLinks}
  </div>
  ${subSections}
</div>`;
}

// ─── Resources section ────────────────────────────────────────────────────────

function buildResourcesSection(model: DocModel): string {
  if (model.connections.length === 0) return '';
  const label = model.product === 'flogo' ? 'Connections' : 'Shared Resources';
  const rows = model.connections.map(c => [esc(c.name), esc(c.type || c.ref), esc(c.description || '—')]);
  return `
<div class="section" id="sec-resources">
  ${sectionTitle(label)}
  ${table(['Name', 'Type', 'Description'], rows)}
</div>`;
}

// ─── Properties section ───────────────────────────────────────────────────────

function buildPropertiesSection(model: DocModel): string {
  if (model.properties.length === 0) return '';
  const profileNames = Object.keys(model.profileProperties ?? {});

  const defaultRows = model.properties.map(p => [
    esc(p.name),
    esc(p.type),
    p.value !== undefined ? `<code style="font-size:9pt">${esc(String(p.value))}</code>` : '—',
    esc(p.description || '—'),
  ]);

  const profileSections = profileNames.map(pn => {
    const pp = (model.profileProperties ?? {})[pn] ?? [];
    const profRows = pp.map(p => [
      esc(p.name),
      esc(p.type),
      p.value !== undefined ? `<code style="font-size:9pt">${esc(String(p.value))}</code>` : '—',
    ]);
    return `
<div id="prof-${safeId(pn)}" style="margin-top:16px;page-break-inside:avoid">
  ${subTitle(`Profile: ${esc(pn)}`)}
  ${profRows.length > 0 ? table(['Name', 'Type', 'Value'], profRows, true) : '<p style="font-size:10pt;color:#64748b">No overrides.</p>'}
</div>`;
  }).join('');

  return `
<div class="section" id="sec-properties">
  ${sectionTitle(model.product === 'flogo' ? 'Application Properties' : 'Module Properties')}
  ${table(['Name', 'Type', 'Default Value', 'Description'], defaultRows, true)}
  ${profileNames.length > 0 ? `<div style="font-size:11pt;font-weight:700;color:#0f2922;border-bottom:1px solid #00897b;padding-bottom:4px;margin:20px 0 4px">Config Profile Overrides</div>${profileSections}` : ''}
</div>`;
}

// ─── Schemas section ──────────────────────────────────────────────────────────

function buildSchemasSection(model: DocModel): string {
  if (model.schemas.length === 0) return '';
  const rows = model.schemas.map(s => [esc(s.name), esc(s.type)]);
  return `
<div class="section" id="sec-schemas">
  ${sectionTitle('Schemas (XSD)')}
  ${table(['Schema Name', 'Type'], rows, true)}
</div>`;
}

// ─── Service Descriptors section ──────────────────────────────────────────────

function buildSpecsSection(model: DocModel): string {
  if (model.specs.length === 0) return '';

  const summaryRows = model.specs.map(s => [
    esc(s.title || s.name),
    esc(s.type.toUpperCase()),
    esc(s.version || '—'),
    esc(s.basePath || '—'),
  ]);

  const details = model.specs.map(s => {
    const meta: string[] = [];
    if (s.wsdlTargetNamespace) meta.push(`<strong>Namespace:</strong> <code style="font-size:8pt">${esc(s.wsdlTargetNamespace)}</code>`);
    if (s.basePath) meta.push(`<strong>Base Path:</strong> <code style="font-size:8pt">${esc(s.basePath)}</code>`);

    let portTypesHtml = '';
    if (s.wsdlPortTypes && s.wsdlPortTypes.length > 0) {
      portTypesHtml = s.wsdlPortTypes.map(pt => {
        const opRows = pt.operations.map(op => [esc(op.name), esc(op.input || '—'), esc(op.output || '—'), esc(op.fault || '—')]);
        return `<div style="font-size:9pt;font-weight:600;color:#374151;margin:10px 0 4px">Port Type: ${esc(pt.name)}</div>
${table(['Operation', 'Input', 'Output', 'Fault'], opRows, true)}`;
      }).join('');
    } else if (s.endpoints && s.endpoints.length > 0) {
      const epRows = s.endpoints.map(ep => [`<code style="font-size:8pt">${esc(ep)}</code>`]);
      portTypesHtml = table(['Endpoint'], epRows, true);
    }

    return `<div style="margin-bottom:16px;page-break-inside:avoid">
  <div style="font-size:11pt;font-weight:700;color:#1d4ed8;margin:14px 0 6px">${esc(s.title || s.name)} <span style="font-size:9pt;font-weight:400;color:#64748b">${esc(s.type.toUpperCase())}</span></div>
  ${meta.length > 0 ? `<div style="font-size:9pt;color:#475569;margin-bottom:6px">${meta.join(' &nbsp;·&nbsp; ')}</div>` : ''}
  ${portTypesHtml}
</div>`;
  }).join('');

  return `
<div class="section" id="sec-specs">
  ${sectionTitle('Service Descriptors')}
  ${table(['Title', 'Type', 'Version', 'Base Path'], summaryRows, true)}
  ${details}
</div>`;
}

// ─── Shared Libraries section ─────────────────────────────────────────────────

function buildSharedLibsSection(model: DocModel): string {
  const sharedLibs = model.bw6SharedLibs ?? [];
  if (sharedLibs.length === 0) return '';

  const libSections = sharedLibs.map(lib => {
    const flowRows = lib.flows.map((f, i) => [`${i + 1}`, esc(f.name), `${f.activities.length}`, `${f.links.length}`, esc(f.description || '—')]);
    return `
    <div id="lib-${safeId(lib.id)}" style="margin-bottom:20px">
      ${subTitle(`${lib.name} (v${lib.version})`)}
      ${lib.description ? `<p style="font-size:10pt;color:#64748b;margin:0 0 10px">${esc(lib.description)}</p>` : ''}
      ${flowRows.length > 0 ? table(['#', 'Process', 'Activities', 'Transitions', 'Description'], flowRows, true) : '<p style="font-size:10pt;color:#64748b">No processes.</p>'}
    </div>`;
  }).join('');

  return `
<div class="section" id="sec-sharedlibs">
  ${sectionTitle('Shared Libraries')}
  ${libSections}
</div>`;
}

// ─── QA section ───────────────────────────────────────────────────────────────

function buildQASection(model: DocModel): string {
  const violations = model.violations ?? [];
  if (violations.length === 0) return '';
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  const rows = violations.map(v => {
    const sColor = v.severity === 'error' ? '#dc2626' : '#d97706';
    return [
      `<span style="color:${sColor};font-weight:700">${esc(v.severity.toUpperCase())}</span>`,
      esc(v.ruleId),
      esc(v.location || '—'),
      esc(v.message),
      v.detail ? `<span style="font-size:9pt;color:#64748b">${esc(v.detail)}</span>` : '—',
    ];
  });
  const isFlogo = model.product === 'flogo';
  const sonarUrl = isFlogo ? 'https://github.com/mpandav-tibco/flogo-sonar' : 'https://github.com/TIBCOSoftware/sonar-bw';
  const sonarLabel = isFlogo ? 'TIBCO Flogo Sonar Plugin' : 'TIBCO BusinessWorks SonarQube Plugin';
  const sonarDesc = isFlogo ? 'Flogo quality, security &amp; maintainability.' : 'BW6 quality, security &amp; maintainability.';
  return `
<div class="section" id="sec-qa">
  ${sectionTitle('QA Report')}
  <div style="display:flex;align-items:center;gap:8px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;padding:6px 12px;margin-bottom:14px;font-size:9pt;color:#0369a1">
    <span>ℹ</span>
    <span>Rules based on the <a href="${sonarUrl}" style="color:#0369a1;font-weight:600">${sonarLabel}</a> — open-source static analysis for ${sonarDesc}</span>
  </div>
  <div style="display:flex;gap:12px;margin-bottom:16px">
    ${statBox('Errors', errors.length, errors.length > 0 ? '#dc2626' : '#059669')}
    ${statBox('Warnings', warnings.length, warnings.length > 0 ? '#d97706' : '#059669')}
    ${statBox('Total Issues', violations.length, violations.length > 0 ? '#7c3aed' : '#059669')}
  </div>
  ${table(['Severity', 'Rule ID', 'Location', 'Message', 'Detail'], rows, true)}
</div>`;
}

// ─── Print CSS ────────────────────────────────────────────────────────────────

const PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  @page { size: A4; margin: 18mm 15mm 18mm 15mm; }
  @page :first { margin-top: 15mm; }

  body {
    font-family: 'Segoe UI', Arial, 'Helvetica Neue', sans-serif;
    font-size: 10pt;
    color: #1e293b;
    background: #fff;
    margin: 0; padding: 0;
    line-height: 1.4;
  }

  /* Scale all SVGs to fit the page without cropping */
  svg {
    max-width: 100% !important;
    width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    display: block !important;
  }

  a { color: #0369a1; }

  /* Page break controls */
  .cover-page  { page-break-after: always; min-height: 80vh; display: flex; flex-direction: column; padding: 20px 0; }
  .toc-page    { page-break-after: always; }
  .section     { page-break-before: auto; margin-bottom: 24px; }
  .process-section { page-break-before: always; }

  /* Prevent tables and diagrams from splitting across pages */
  table { page-break-inside: auto; }
  tr    { page-break-inside: avoid; }
  .diagram-wrapper { page-break-inside: avoid; }

  h2 { page-break-after: avoid; }
  h3 { page-break-after: avoid; }
`;

// ─── Main export ──────────────────────────────────────────────────────────────

export function renderBW6PrintHTML(model: DocModel, bw6Icons?: BW6IconRegistry): string {
  const triggerMap = buildFlowTriggerMap(model);

  const cover    = buildCoverPage(model);
  const toc      = buildTOC(model);
  const arch     = buildArchSection(model);
  const summary  = buildSummarySection(model);
  const typedTriggerMap = triggerMap as Map<string, { ref: string }>;
  const processes = Array.from(groupFlowsByParent(model.flows).entries())
    .map(([key, gFlows], i) => {
      const isGrouped = gFlows.length > 1 || gFlows[0].id !== key;
      return isGrouped
        ? buildGroupedProcessSection(key, gFlows, i + 1, typedTriggerMap, model.product, bw6Icons)
        : buildProcessSection(gFlows[0], i + 1, typedTriggerMap, model.product, bw6Icons);
    })
    .join('\n');
  const resources   = buildResourcesSection(model);
  const properties  = buildPropertiesSection(model);
  const schemas     = buildSchemasSection(model);
  const specs       = buildSpecsSection(model);
  const sharedLibs  = buildSharedLibsSection(model);
  const qa          = buildQASection(model);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(model.app.name)} — Documentation</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
${cover}
${toc}
${arch}
${summary}
<div class="section" id="sec-processes">
  <h2 style="font-size:14pt;font-weight:700;color:#0f2922;border-bottom:2px solid #00897b;padding-bottom:6px;margin:0 0 4px">${model.product === 'flogo' ? 'Flows' : 'Processes'}</h2>
</div>
${processes}
${resources}
${properties}
${schemas}
${specs}
${sharedLibs}
${qa}
</body>
</html>`;
}
