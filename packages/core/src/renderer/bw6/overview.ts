import { DocModel, FlowDoc } from '../../model';
import {
  escHtml,
  safeId,
  paletteFromType,
  humanizeType,
  palCls,
  starterBadge,
  dedupePalettes,
  parsePalette,
  buildFlowTriggerMap,
  renderBW6Value,
  paletteDisplayName,
  categoryFromType,
  categoryIcon,
  paletteShortDisplay,
  groupConnections,
  getAppDisplayName,
  groupFlowsByParent,
} from './helpers';
import { page, generateAppDescription } from './page-shell';
import { extractTagMeta, deploymentTargetTopbar, deploymentTargetText, renderSidebar } from './sidebar';

// ─── Architecture Diagram ────────────────────────────────────────────────────

export function renderArchDiagramSVG(model: DocModel): string {
  const triggerMap = buildFlowTriggerMap(model);
  const sharedLibs = model.bw6SharedLibs ?? [];

  // Layout constants
  const COL_W = 180;   // column width
  const NODE_H = 36;   // node height
  const NODE_W = 170;  // node width
  const PAD_Y  = 24;   // vertical padding in column
  const GAP_Y  = 10;   // gap between nodes
  const COL_GAP = 80;  // horizontal gap between columns

  // Columns: Triggers | Processes | Resources & SharedLibs
  // Build nodes
  interface ArchNode { id: string; label: string; sublabel?: string; cls: string; y: number; col: number; }
  const triggerNodes: ArchNode[] = [];
  const processNodes: ArchNode[] = [];
  const resourceNodes: ArchNode[] = [];

  // Group flows by parent (same logic as HTML/sidebar)
  const flowGroups = groupFlowsByParent(model.flows);
  const flowIdToGroupKey = new Map<string, string>();
  for (const [key, groupFlows] of flowGroups) {
    for (const f of groupFlows) flowIdToGroupKey.set(f.id, key);
  }

  // Collect trigger nodes (one per process GROUP that has a trigger)
  const triggeredGroupKeys = new Set<string>();
  for (const t of model.triggers) {
    for (const h of t.handlers) {
      const groupKey = flowIdToGroupKey.get(h.flowRef) ?? h.flowRef;
      if (!triggeredGroupKeys.has(groupKey)) {
        triggeredGroupKeys.add(groupKey);
        const pal = paletteFromType(t.ref);
        const label = humanizeType(t.ref).replace(/Activity$/, '').slice(0, 22);
        triggerNodes.push({ id: `trig-${safeId(groupKey)}`, label, sublabel: t.name, cls: palCls(pal), y: 0, col: 0 });
      }
    }
  }

  // REST / SOAP service binding starters from module.bwm.
  // Group bindings by process GROUP key so each group gets exactly one starter node.
  const flowByShortName = new Map<string, FlowDoc>();
  for (const f of model.flows) {
    const short = f.name.split(/[./\\]/).filter(Boolean).pop() ?? f.name;
    flowByShortName.set(short.toLowerCase(), f);
    flowByShortName.set(f.name.toLowerCase(), f);
    // Also index by the full flow ID so restBindings.processName (which equals the group key) can resolve
    const idShort = f.id.split(/[./\\]/).filter(Boolean).pop() ?? f.id;
    if (!flowByShortName.has(idShort.toLowerCase())) flowByShortName.set(idShort.toLowerCase(), f);
    if (!flowByShortName.has(f.id.toLowerCase())) flowByShortName.set(f.id.toLowerCase(), f);
  }
  // Also index by group key (processName in restBindings equals the group key for grouped flows)
  for (const [key, groupFlows] of flowGroups) {
    const keyShort = key.split(/[./\\]/).filter(Boolean).pop() ?? key;
    if (!flowByShortName.has(keyShort.toLowerCase())) flowByShortName.set(keyShort.toLowerCase(), groupFlows[0]);
    if (!flowByShortName.has(key.toLowerCase())) flowByShortName.set(key.toLowerCase(), groupFlows[0]);
  }
  // Map: groupKey → binding info (first binding wins for label, collect all paths)
  const bindingByGroup = new Map<string, { label: string; paths: string[]; cls: string }>();
  for (const b of model.restBindings ?? []) {
    let boundFlow: FlowDoc | undefined;
    if (b.processName) {
      const shortProc = b.processName.split(/[./\\]/).filter(Boolean).pop() ?? b.processName;
      boundFlow = flowByShortName.get(shortProc.toLowerCase())
               ?? flowByShortName.get(b.processName.toLowerCase());
    }
    if (!boundFlow) continue;
    const groupKey = flowIdToGroupKey.get(boundFlow.id) ?? boundFlow.id;

    const existing = bindingByGroup.get(groupKey);
    const isSOAP = b.bindingType === 'soap';
    const pathLabel = b.path || b.basePath || '/';
    if (existing) {
      if (!existing.paths.includes(pathLabel)) existing.paths.push(pathLabel);
    } else {
      const label = isSOAP ? 'SOAP Service' : 'REST Service';
      const cls   = isSOAP ? 'pal-soap' : 'pal-rest';
      bindingByGroup.set(groupKey, { label, paths: [pathLabel], cls });
      if (!triggeredGroupKeys.has(groupKey)) {
        triggeredGroupKeys.add(groupKey);
        triggerNodes.push({ id: `svc-${safeId(groupKey)}`, label, sublabel: pathLabel.slice(0, 22), cls, y: 0, col: 0 });
      }
    }
  }

  // Process nodes — one per group
  for (const [key, groupFlows] of flowGroups) {
    const isGrouped = groupFlows.length > 1 || groupFlows[0].id !== key;
    const displayName = isGrouped ? (key.split(/[./\\]/).filter(Boolean).pop() ?? key) : groupFlows[0].name;
    const totalActs = groupFlows.reduce((s, f) => s + f.activities.length, 0);
    const sublabel = isGrouped ? `${groupFlows.length} operations` : `${totalActs} activities`;
    processNodes.push({ id: `proc-${safeId(key)}`, label: displayName.slice(0, 24), sublabel, cls: 'pal-subprocess', y: 0, col: 1 });
  }

  // Resource nodes
  const connGroups = groupConnections(model.connections);
  for (const [cat, cs] of connGroups) {
    for (const c of cs) {
      resourceNodes.push({ id: `res-${safeId(c.id)}`, label: c.name.slice(0, 22), sublabel: cat, cls: palCls(categoryFromType(c.ref || c.type)), y: 0, col: 2 });
    }
  }
  // SharedLib nodes in col 2
  for (const lib of sharedLibs) {
    resourceNodes.push({ id: `lib-${safeId(lib.id)}`, label: lib.name.slice(0, 22), sublabel: `SharedLib v${lib.version}`, cls: 'pal-service', y: 0, col: 2 });
  }

  // Assign Y positions
  let tY = PAD_Y, pY = PAD_Y, rY = PAD_Y;
  for (const n of triggerNodes) { n.y = tY; tY += NODE_H + GAP_Y; }
  for (const n of processNodes) { n.y = pY; pY += NODE_H + GAP_Y; }
  for (const n of resourceNodes) { n.y = rY; rY += NODE_H + GAP_Y; }

  const totalH = Math.max(tY, pY, rY) + PAD_Y;
  const col0X = 20;
  const col1X = col0X + COL_W + COL_GAP;
  const col2X = col1X + COL_W + COL_GAP;
  const totalW = col2X + COL_W + 20;

  // Build group-key → trigger node map
  const trigNodeByGroup = new Map<string, ArchNode>();
  for (const t of model.triggers) {
    for (const h of t.handlers) {
      const groupKey = flowIdToGroupKey.get(h.flowRef) ?? h.flowRef;
      const n = triggerNodes.find(n => n.id === `trig-${safeId(groupKey)}`);
      if (n) trigNodeByGroup.set(groupKey, n);
    }
  }
  for (const [groupKey] of bindingByGroup) {
    const n = triggerNodes.find(n => n.id === `svc-${safeId(groupKey)}`);
    if (n) trigNodeByGroup.set(groupKey, n);
  }

  function colX(col: number): number { return [col0X, col1X, col2X][col] ?? col0X; }
  function nodeCY(n: ArchNode): number { return n.y + NODE_H / 2; }

  // Draw edges: trigger / service-binding → process group
  let edges = '';
  for (const [groupKey, trig] of trigNodeByGroup) {
    const proc = processNodes.find(n => n.id === `proc-${safeId(groupKey)}`);
    if (!proc) continue;
    const x1 = colX(0) + NODE_W, y1 = nodeCY(trig);
    const x2 = col1X, y2 = nodeCY(proc);
    const mx = (x1 + x2) / 2;
    edges += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#00897b44" stroke-width="1.5" marker-end="url(#arrow)"/>`;
  }

  // Draw edges: process group → resources
  const drawnProcRes = new Set<string>();
  for (const [groupKey, groupFlows] of flowGroups) {
    const proc = processNodes.find(n => n.id === `proc-${safeId(groupKey)}`);
    if (!proc) continue;
    const usedCats = new Set<string>();
    for (const f of groupFlows) {
      for (const act of f.activities) usedCats.add(categoryFromType(act.ref));
      for (const pal of f.usedPalettes ?? []) {
        if (pal === 'jdbc' || pal === 'sql')                   usedCats.add('JDBC');
        if (pal === 'ems'  || pal === 'jms')                   usedCats.add('EMS');
        if (pal === 'kafka')                                    usedCats.add('Kafka');
        if (pal === 'rest' || pal === 'http' || pal === 'httpconnector') usedCats.add('REST');
        if (pal === 'file')                                     usedCats.add('File');
      }
    }
    for (const [cat, cs] of connGroups) {
      if (!usedCats.has(cat)) continue;
      for (const c of cs) {
        const resNode = resourceNodes.find(n => n.id === `res-${safeId(c.id)}`);
        if (!resNode) continue;
        const edgeKey = proc.id + ':' + resNode.id;
        if (drawnProcRes.has(edgeKey)) continue;
        drawnProcRes.add(edgeKey);
        const x1 = col1X + NODE_W, y1 = nodeCY(proc);
        const x2 = col2X, y2 = nodeCY(resNode);
        const mx = (x1 + x2) / 2;
        edges += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#64748b33" stroke-width="1.5" marker-end="url(#arrow-gray)"/>`;
      }
    }
    // callProcess → sharedLib
    for (const f of groupFlows) {
      for (const act of f.activities) {
        const ref = (act.settings?.processRef ?? act.settings?.processName ?? '') as string;
        if (!ref) continue;
        for (const lib of sharedLibs) {
          const libNode = resourceNodes.find(n => n.id === `lib-${safeId(lib.id)}`);
          if (!libNode) continue;
          const isInLib = lib.flows.some(lf => lf.id === ref || lf.id.endsWith('.' + ref) || ref.endsWith('.' + lf.name));
          if (!isInLib) continue;
          const edgeKey = proc.id + ':' + libNode.id;
          if (drawnProcRes.has(edgeKey)) continue;
          drawnProcRes.add(edgeKey);
          const x1 = col1X + NODE_W, y1 = nodeCY(proc);
          const x2 = col2X, y2 = nodeCY(libNode);
          const mx = (x1 + x2) / 2;
          edges += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#a78bfa44" stroke-width="1.5" marker-end="url(#arrow-purple)"/>`;
        }
      }
    }
  }

  // REST-bound process groups → HttpConnector resources (server binding → its configuration resource)
  for (const [groupKey] of bindingByGroup) {
    const proc = processNodes.find(n => n.id === `proc-${safeId(groupKey)}`);
    if (!proc) continue;
    for (const c of model.connections) {
      if (!(c.ref ?? '').toLowerCase().includes('httpconnector')) continue;
      const resNode = resourceNodes.find(n => n.id === `res-${safeId(c.id)}`);
      if (!resNode) continue;
      const edgeKey = proc.id + ':' + resNode.id;
      if (drawnProcRes.has(edgeKey)) continue;
      drawnProcRes.add(edgeKey);
      const x1 = col1X + NODE_W, y1 = nodeCY(proc);
      const x2 = col2X, y2 = nodeCY(resNode);
      const mx = (x1 + x2) / 2;
      edges += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#64748b33" stroke-width="1.5" marker-end="url(#arrow-gray)"/>`;
    }
  }

  // Draw nodes
  function renderNode(n: ArchNode, linkHref?: string): string {
    const x = colX(n.col), y = n.y;
    const inner = `
      <rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="6" ry="6"
        fill="white" stroke="#d1ede9" stroke-width="1.5"/>
      <text x="${x + 10}" y="${y + 15}" font-family="Segoe UI,system-ui,sans-serif" font-size="11" font-weight="600" fill="#0f2922">
        ${escHtml(n.label)}
      </text>
      ${n.sublabel ? `<text x="${x + 10}" y="${y + 28}" font-family="Segoe UI,system-ui,sans-serif" font-size="9.5" fill="#64748b">${escHtml(n.sublabel)}</text>` : ''}`;
    // Only allow safe relative paths — block javascript:, data:, and protocol-relative URLs
    const safeHref = linkHref && /^[a-zA-Z0-9_./-]+\.html(#[a-zA-Z0-9_-]*)?$/.test(linkHref) ? linkHref : null;
    if (safeHref) return `<a href="${escHtml(safeHref)}" style="cursor:pointer">${inner}</a>`;
    return inner;
  }

  // Column headers
  const headers = `
    <text x="${col0X + NODE_W/2}" y="16" text-anchor="middle" font-family="Segoe UI,system-ui,sans-serif" font-size="10" font-weight="700" fill="#00897b" letter-spacing="0.05em">STARTERS</text>
    <text x="${col1X + NODE_W/2}" y="16" text-anchor="middle" font-family="Segoe UI,system-ui,sans-serif" font-size="10" font-weight="700" fill="#00897b" letter-spacing="0.05em">PROCESSES</text>
    <text x="${col2X + NODE_W/2}" y="16" text-anchor="middle" font-family="Segoe UI,system-ui,sans-serif" font-size="10" font-weight="700" fill="#00897b" letter-spacing="0.05em">RESOURCES &amp; LIBS</text>`;

  const nodesSvg = [
    ...triggerNodes.map(n => renderNode(n)),
    ...processNodes.map(n => renderNode(n, `processes/${safeId(n.id.replace('proc-', ''))}.html`)),
    ...resourceNodes.map(n => renderNode(n, 'resources.html')),
  ].join('\n');

  return `<svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="display:block;min-width:${totalW}px">
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#00897b88"/>
      </marker>
      <marker id="arrow-gray" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8"/>
      </marker>
      <marker id="arrow-purple" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#a78bfa"/>
      </marker>
    </defs>
    ${headers}
    ${edges}
    ${nodesSvg}
  </svg>`;
}

function renderArchDiagram(model: DocModel): string {
  return `<div class="card" style="margin-bottom:20px">
  <div class="card-title">🏗️ Application Architecture</div>
  <div style="overflow-x:auto">
  ${renderArchDiagramSVG(model)}
  </div>
</div>`;
}

export function renderBW6Index(model: DocModel): string {
  const triggerMap = buildFlowTriggerMap(model);
  const palettes = dedupePalettes((model.app.imports ?? []).filter(Boolean).map(parsePalette));
  const { edition, symbolicName, bwVersion, profiles, appModules } = extractTagMeta(model);
  const generatedAt = new Date(model.generatedAt).toLocaleString();
  const sharedLibs = model.bw6SharedLibs ?? [];
  const specs = model.specs ?? [];
  const appDisplayName = getAppDisplayName(model);

  // App info card
  const profilesHtml = profiles.length > 0
    ? `<div class="app-info-row"><span class="app-info-label">Profiles:</span><span class="app-info-value">${profiles.map(p => `<a href="properties-${p}.html" class="badge pal-general" style="font-size:10px;text-decoration:none">${escHtml(p)}</a>`).join(' ')}</span></div>`
    : '';
  const modulesHtml = appModules.length > 1
    ? `<div class="app-info-row"><span class="app-info-label">Modules:</span><span class="app-info-value">${appModules.map(m => `<span class="badge pal-api" style="font-size:10px">${escHtml(m)}</span>`).join(' ')}</span></div>`
    : '';
  const appCard = `<div class="app-info-card">
  <div class="app-info-header">
    <div>
      <div class="app-info-title">${escHtml(appDisplayName)}</div>
      ${symbolicName ? `<div class="app-info-subtitle">${escHtml(symbolicName)}</div>` : ''}
    </div>
    <div style="margin-left:auto;display:flex;gap:6px;align-items:center;flex-shrink:0">
      ${deploymentTargetTopbar(model)}
      <span class="${(edition === 'BWCE' || edition === 'bwcf') ? 'edition-badge-bwce' : 'edition-badge'}">TIBCO ${escHtml(edition)}</span>
    </div>
  </div>
  ${model.app.description ? `<div class="app-info-desc">${escHtml(model.app.description)}</div>` : `<div class="app-info-desc" style="font-style:italic;color:var(--text-muted)">${escHtml(generateAppDescription(model))}</div>`}
  <div class="app-info-grid">
    <div class="app-info-row"><span class="app-info-label">ID:</span><span class="app-info-value td-mono">${escHtml(symbolicName || model.app.sourceFile)}</span></div>
    ${bwVersion ? `<div class="app-info-row"><span class="app-info-label">BW Version:</span><span class="app-info-value td-mono">${escHtml(bwVersion)}</span></div>` : ''}
    <div class="app-info-row"><span class="app-info-label">Version:</span><span class="app-info-value">${escHtml(model.app.version)}</span></div>
    ${model.app.deploymentTarget ? `<div class="app-info-row"><span class="app-info-label">Deployment:</span><span class="app-info-value">${deploymentTargetText(model)}</span></div>` : ''}
    ${sharedLibs.length > 0 ? `<div class="app-info-row"><span class="app-info-label">Shared Libs:</span><span class="app-info-value">${sharedLibs.map(l => `<span class="badge" style="background:#e0e7ff;color:#3730a3;font-size:10px">📚 ${escHtml(l.name)}</span>`).join(' ')}</span></div>` : ''}
    ${profilesHtml}
    ${modulesHtml}
    <div class="app-info-row"><span class="app-info-label">Generated:</span><span class="app-info-value">${escHtml(generatedAt)}</span></div>
    <div class="app-info-row"><span class="app-info-label">Author:</span><span class="app-info-value">${escHtml(model.generatedBy || '—')}</span></div>
  </div>
</div>`;

  // Group flows for accurate counts (same grouping as sidebar / HTML output)
  const processGroups = groupFlowsByParent(model.flows);
  const processGroupCount = processGroups.size;
  const pgFlowIdToKey = new Map<string, string>();
  for (const [key, gFlows] of processGroups) {
    for (const f of gFlows) pgFlowIdToKey.set(f.id, key);
  }

  // Count GROUPS that have any kind of starter (trigger handler OR REST/SOAP binding)
  const startedGroupKeys = new Set<string>();
  for (const t of model.triggers) {
    for (const h of t.handlers) startedGroupKeys.add(pgFlowIdToKey.get(h.flowRef) ?? h.flowRef);
  }
  for (const b of model.restBindings ?? []) {
    if (b.processName) {
      // processName equals the group key for grouped flows (e.g. "...bookstore.Books")
      const key = pgFlowIdToKey.get(b.processName) ?? b.processName;
      startedGroupKeys.add(key);
    }
  }
  const starterCount = startedGroupKeys.size;

  // Stats (each card is a link to the relevant page)
  const statsHtml = `<div class="stats-grid">
  <a href="processes.html" class="stat-card"><div class="stat-icon">📄</div><div class="val">${processGroupCount}</div><div class="lbl">Processes</div></a>
  <a href="processes.html" class="stat-card"><div class="stat-icon">▶</div><div class="val">${starterCount}</div><div class="lbl">Starters</div></a>
  <a href="resources.html" class="stat-card"><div class="stat-icon">🔌</div><div class="val">${model.connections.length}</div><div class="lbl">Resources</div></a>
  <a href="properties.html" class="stat-card"><div class="stat-icon">⚙️</div><div class="val">${model.properties.length}</div><div class="lbl">Properties</div></a>
  <a href="schemas.html" class="stat-card"><div class="stat-icon">📐</div><div class="val">${model.schemas.length}</div><div class="lbl">Schemas</div></a>
  ${specs.length > 0 ? `<a href="service-descriptors.html" class="stat-card"><div class="stat-icon">📃</div><div class="val">${specs.length}</div><div class="lbl">Descriptors</div></a>` : ''}
  ${sharedLibs.length > 0 ? `<div class="stat-card"><div class="stat-icon">📦</div><div class="val" style="color:#4338ca">${sharedLibs.length}</div><div class="lbl">Shared Libs</div></div>` : ''}
</div>`;

  // Processes table — one row per group (same grouping as sidebar / processes.html)
  const processRows = Array.from(processGroups.entries()).map(([key, gFlows]) => {
    const isGrouped = gFlows.length > 1 || gFlows[0].id !== key;
    const href = `processes/${safeId(key)}.html`;
    if (isGrouped) {
      const displayName = key.split(/[./\\]/).filter(Boolean).pop() ?? key;
      const subNames = gFlows.map(f => f.id.includes('/') ? f.id.split('/').slice(1).join('/') : f.name).join(', ');
      const totalActs  = gFlows.reduce((s, f) => s + f.activities.length, 0);
      const totalLinks = gFlows.reduce((s, f) => s + f.links.length, 0);
      return `<tr>
        <td><a href="${href}">📋 ${escHtml(displayName)}</a> <span style="color:var(--text-muted);font-size:11px">(${escHtml(subNames)})</span></td>
        <td><span style="color:#94a3b8">—</span></td>
        <td>${totalActs}</td>
        <td>${totalLinks}</td>
        <td class="td-muted">Composite process</td>
      </tr>`;
    }
    const f = gFlows[0];
    const trigger = triggerMap.get(f.id);
    const starterHtml = trigger ? starterBadge(trigger.ref) : '<span style="color:#94a3b8">—</span>';
    return `<tr>
      <td><a href="${href}">📄 ${escHtml(f.name)}</a></td>
      <td>${starterHtml}</td>
      <td>${f.activities.length}</td>
      <td>${f.links.length}</td>
      <td class="td-muted">${escHtml(f.description || '—')}</td>
    </tr>`;
  }).join('');

  const processesCard = `<div class="card">
  <div class="card-title">🔄 Processes <a href="processes.html" class="section-link">View all →</a></div>
  <table><thead><tr><th>Process</th><th>Starter</th><th>Activities</th><th>Transitions</th><th>Description</th></tr></thead>
  <tbody>${processRows}</tbody></table>
</div>`;

  // Palettes — proper table (no badges)
  const paletteRows = palettes.map(p => `<tr>
    <td><span class="badge ${palCls(p.shortName)}">${escHtml(p.displayName)}</span></td>
    <td class="td-mono">${escHtml(p.bundleId)}</td>
  </tr>`).join('');

  const palettesCard = palettes.length > 0 ? `<div class="card">
  <div class="card-title">🧩 Used Palettes <a href="palettes.html" class="section-link">View all →</a></div>
  <table><thead><tr><th>Palette</th><th>Bundle ID</th></tr></thead>
  <tbody>${paletteRows}</tbody></table>
</div>` : '';

  // Service descriptors summary
  const specsSummaryCard = specs.length > 0 ? `<div class="card">
  <div class="card-title">📋 Service Descriptors <a href="service-descriptors.html" class="section-link">View all →</a></div>
  <table><thead><tr><th>File</th><th>Type</th><th>Title</th><th>Operations</th></tr></thead>
  <tbody>${specs.map(s => {
    const typeBadge = s.type === 'wsdl'
      ? `<span class="badge" style="background:#dbeafe;color:#1e3a8a">WSDL</span>`
      : `<span class="badge" style="background:#d1fae5;color:#065f46">OpenAPI</span>`;
    return `<tr><td><a href="service-descriptors.html#spec-${s.id}">${escHtml(s.name)}</a></td><td>${typeBadge}</td><td>${escHtml(s.title ?? s.name)}</td><td>${s.endpoints?.length ?? 0}</td></tr>`;
  }).join('')}</tbody></table>
</div>` : '';

  // Resources
  const resourceGroups = groupConnections(model.connections);
  let resourceHtml = '';
  if (model.connections.length === 0) {
    resourceHtml = '<p style="color:var(--text-muted)">No shared resources defined</p>';
  } else {
    for (const [cat, cs] of resourceGroups) {
      const icon = categoryIcon(cat);
      const rows = cs.map(c => `<tr>
        <td>${icon} <a href="resources.html">${escHtml(c.name)}</a></td>
        <td><span class="badge ${palCls(categoryFromType(c.ref))}">${escHtml(c.type)}</span></td>
        <td class="td-muted">${escHtml(c.description ?? '—')}</td>
      </tr>`).join('');
      resourceHtml += `<div class="resource-group">
<h3>${icon} ${cat}</h3>
<table><thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>
</div>`;
    }
  }

  const resourcesCard = `<div class="card">
  <div class="card-title">🔌 Shared Resources <a href="resources.html" class="section-link">View all →</a></div>
  ${resourceHtml}
</div>`;

  const archDiagram = (model.flows.length > 0) ? renderArchDiagram(model) : '';

  return `<div class="page-header"><h1>🏠 Overview</h1></div>
${appCard}
${statsHtml}
${archDiagram}
${processesCard}
${resourcesCard}
${specsSummaryCard}
${palettesCard}`;
}
