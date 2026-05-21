import { DocModel, QAViolation, PropertyDoc, RestBindingDoc } from '../../model';
import { escHtml, safeId, palCls, renderBW6Value } from './helpers';
import { page } from './page-shell';

// ─── API Surface page (from module.bwm REST bindings) ────────────────────────

export function renderBW6ApiSurfacePage(model: DocModel): string {
  const bindings = model.restBindings ?? [];

  if (bindings.length === 0) {
    return `<div class="page-header"><h1>🌐 API Surface</h1></div>
<div class="empty-state"><div class="icon">🌐</div>
<p>No REST service bindings found in module.bwm.<br>
REST bindings are defined when a BW6 process is exposed as a REST service via the SCA composite descriptor.</p></div>`;
  }

  const METHOD_COLORS: Record<string, string> = {
    GET:    'background:#d1fae5;color:#065f46',
    POST:   'background:#dbeafe;color:#1e3a8a',
    PUT:    'background:#fef3c7;color:#92400e',
    DELETE: 'background:#fee2e2;color:#991b1b',
    PATCH:  'background:#f3e8ff;color:#6b21a8',
  };

  function methodBadge(method: string): string {
    const style = METHOD_COLORS[method.toUpperCase()] ?? 'background:#f1f5f9;color:#334155';
    return `<span class="badge" style="${style};min-width:54px;text-align:center;font-size:11px">${escHtml(method)}</span>`;
  }

  const totalOps = bindings.reduce((s, b) => s + b.operations.length, 0);

  const cards = bindings.map((b: RestBindingDoc) => {
    const fullPath = (b.basePath === '/' ? '' : b.basePath) + b.path;
    const procLink = b.processName
      ? (() => {
          const shortProc = b.processName.split(/[./]/).pop() ?? b.processName;
          const matchFlow = model.flows.find(f =>
            f.id === b.processName || f.id.endsWith('.' + shortProc) || f.name === shortProc);
          return matchFlow
            ? `<a href="processes/${safeId(matchFlow.id)}.html" style="color:var(--link)">${escHtml(shortProc)}</a>`
            : `<span style="color:var(--text-muted)">${escHtml(shortProc)}</span>`;
        })()
      : '';

    const opRows = b.operations.map(op => `<tr>
      <td>${methodBadge(op.method)}</td>
      <td class="td-mono" style="font-size:12px">${escHtml(fullPath)}</td>
      <td class="td-mono" style="font-size:12px;color:#475569">${escHtml(op.operationName)}</td>
      <td class="td-muted">${escHtml(op.notes ?? '—')}</td>
    </tr>`).join('');

    return `<div class="card" style="margin-bottom:16px">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
    <span style="font-weight:700;font-size:15px;color:var(--brand)">🌐 ${escHtml(b.serviceName)}</span>
    <code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:13px">${escHtml(fullPath)}</code>
    ${procLink ? `<span style="font-size:12px;color:var(--text-muted)">→ process: ${procLink}</span>` : ''}
  </div>
  <table><thead><tr><th style="width:70px">Method</th><th>Path</th><th>Operation</th><th>Notes</th></tr></thead>
  <tbody>${opRows}</tbody></table>
</div>`;
  }).join('');

  // Summary table
  const summaryRows = bindings.map((b: RestBindingDoc) => {
    const fullPath = (b.basePath === '/' ? '' : b.basePath) + b.path;
    return `<tr>
      <td style="font-weight:600">${escHtml(b.serviceName)}</td>
      <td class="td-mono">${escHtml(fullPath)}</td>
      <td>${b.operations.map(op => methodBadge(op.method)).join(' ')}</td>
      <td class="td-muted">${b.operations.length} operation${b.operations.length !== 1 ? 's' : ''}</td>
    </tr>`;
  }).join('');

  return `<div class="page-header">
  <h1>🌐 API Surface</h1>
  <div class="meta">${bindings.length} service${bindings.length !== 1 ? 's' : ''} · ${totalOps} operation${totalOps !== 1 ? 's' : ''}</div>
</div>
<div class="card" style="margin-bottom:16px">
  <div class="card-title">Services Overview</div>
  <table><thead><tr><th>Service</th><th>Base Path</th><th>Methods</th><th>Operations</th></tr></thead>
  <tbody>${summaryRows}</tbody></table>
</div>
<div class="section-title">Service Details</div>
${cards}`;
}

// ─── QA Violations page ──────────────────────────────────────────────────────

export function renderBW6QAPage(model: DocModel): string {
  const violations = model.violations ?? [];
  const errors   = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  const infos    = violations.filter(v => v.severity === 'info');

  const isFlogo = model.product === 'flogo';
  const sonarUrl = isFlogo ? 'https://github.com/mpandav-tibco/flogo-sonar' : 'https://github.com/TIBCOSoftware/sonar-bw';
  const sonarLabel = isFlogo ? 'TIBCO Flogo Sonar Plugin' : 'TIBCO BusinessWorks SonarQube Plugin';
  const sonarDesc = isFlogo ? 'Flogo quality, security and maintainability.' : 'BW6 quality, security and maintainability.';
  const attributionBar = `<div style="display:flex;align-items:center;gap:8px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:8px 14px;margin-bottom:18px;font-size:12px;color:#0369a1">
  <span>ℹ</span>
  <span>Rules are based on the <a href="${sonarUrl}" target="_blank" rel="noopener" style="color:#0369a1;font-weight:600">${sonarLabel}</a> — an open-source static analysis ruleset for ${sonarDesc}</span>
</div>`;

  if (violations.length === 0) {
    return `<div class="page-header"><h1>✅ QA Analysis</h1></div>
${attributionBar}
<div class="empty-state" style="border-color:#22c55e;background:#f0fdf4">
  <div class="icon">✅</div>
  <p style="color:#16a34a;font-weight:600">No violations found — this application passes all quality checks.</p>
</div>`;
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
      <td class="td-mono" style="color:var(--text-muted);white-space:nowrap">${escHtml(v.ruleId)}</td>
      <td>${escHtml(v.message)}</td>
      <td class="td-muted">${escHtml(v.location)}</td>
      <td class="td-muted">${v.detail ? escHtml(v.detail) : '—'}</td>
    </tr>`).join('');
    return `<div class="card" style="border-top:3px solid ${borderColor};margin-bottom:16px">
  <div class="card-title">${icon} ${escHtml(title)} <span style="font-weight:400;color:var(--text-muted)">(${items.length})</span></div>
  <table><thead><tr><th style="width:70px">Severity</th><th style="width:100px">Rule</th><th>Message</th><th>Location</th><th>Detail</th></tr></thead>
  <tbody>${rows}</tbody></table>
</div>`;
  }

  return `<div class="page-header">
  <h1>🔍 QA Analysis</h1>
  <div class="meta">${violations.length} violation${violations.length !== 1 ? 's' : ''} found · ${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}, ${infos.length} info</div>
</div>
${attributionBar}
${statsGrid}
${renderGroup('Errors', '🔴', errors, '#ef4444')}
${renderGroup('Warnings', '🟡', warnings, '#f59e0b')}
${renderGroup('Info', '🔵', infos, '#3b82f6')}`;
}

// ─── Cross-References page ────────────────────────────────────────────────────

export function renderBW6CrossRefsPage(model: DocModel): string {
  const xref = model.crossRefs;
  const hasData = xref && (
    Object.keys(xref.processCallsProcess).length > 0 ||
    Object.keys(xref.processUsesResource).length > 0 ||
    Object.keys(xref.resourceUsedByProcess).length > 0
  );

  if (!hasData) {
    return `<div class="page-header"><h1>🔗 Cross-References</h1></div>
<div class="empty-state"><div class="icon">🔗</div><p>No cross-reference dependencies detected.<br>Cross-references are extracted from Call Process activities and connection configuration fields.</p></div>`;
  }

  function listBadges(items: string[], href?: (s: string) => string): string {
    return items.map(s => href
      ? `<a href="${href(s)}" style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:4px;font-size:12px;text-decoration:none;display:inline-block">${escHtml(s)}</a>`
      : `<span style="background:#f1f5f9;color:#334155;padding:2px 8px;border-radius:4px;font-size:12px;display:inline-block">${escHtml(s)}</span>`
    ).join(' ');
  }

  // Process → subprocess
  const callsRows = Object.entries(xref!.processCallsProcess).map(([proc, called]) => `<tr>
    <td><a href="processes/${safeId(proc)}.html" style="color:var(--link)">${escHtml(proc)}</a></td>
    <td style="display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px">${listBadges(called, s => `processes/${safeId(s)}.html`)}</td>
  </tr>`).join('');

  // Process → resource
  const resRows = Object.entries(xref!.processUsesResource).map(([proc, ress]) => `<tr>
    <td><a href="processes/${safeId(proc)}.html" style="color:var(--link)">${escHtml(proc)}</a></td>
    <td style="display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px">${listBadges(ress)}</td>
  </tr>`).join('');

  // Reverse: resource → processes
  const revRows = Object.entries(xref!.resourceUsedByProcess).map(([res, procs]) => `<tr>
    <td><strong>${escHtml(res)}</strong></td>
    <td style="display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px">${listBadges(procs, s => `processes/${safeId(s)}.html`)}</td>
  </tr>`).join('');

  // Reverse: subprocess → callers
  const calledByRows = Object.entries(xref!.processCalledBy).map(([sub, callers]) => `<tr>
    <td><a href="processes/${safeId(sub)}.html" style="color:var(--link)">${escHtml(sub)}</a></td>
    <td style="display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px">${listBadges(callers, s => `processes/${safeId(s)}.html`)}</td>
  </tr>`).join('');

  const callsSection = callsRows ? `<div class="card" style="margin-bottom:16px">
  <div class="card-title">📞 Process → Sub-Process Calls</div>
  <table><thead><tr><th>Process</th><th>Calls</th></tr></thead><tbody>${callsRows}</tbody></table>
</div>` : '';

  const resSection = resRows ? `<div class="card" style="margin-bottom:16px">
  <div class="card-title">🔌 Process → Shared Resource Usage</div>
  <table><thead><tr><th>Process</th><th>Uses Resources</th></tr></thead><tbody>${resRows}</tbody></table>
</div>` : '';

  const revSection = revRows ? `<div class="card" style="margin-bottom:16px">
  <div class="card-title">↩️ Resource → Processes (Reverse)</div>
  <table><thead><tr><th>Resource</th><th>Used By</th></tr></thead><tbody>${revRows}</tbody></table>
</div>` : '';

  const calledBySection = calledByRows ? `<div class="card" style="margin-bottom:16px">
  <div class="card-title">↩️ Sub-Process → Callers (Reverse)</div>
  <table><thead><tr><th>Sub-Process</th><th>Called By</th></tr></thead><tbody>${calledByRows}</tbody></table>
</div>` : '';

  const totalEdges = Object.values(xref!.processCallsProcess).reduce((s, v) => s + v.length, 0) +
                     Object.values(xref!.processUsesResource).reduce((s, v) => s + v.length, 0);

  return `<div class="page-header">
  <h1>🔗 Cross-References</h1>
  <div class="meta">${totalEdges} dependency edge${totalEdges !== 1 ? 's' : ''} detected across ${model.flows.length} processes</div>
</div>
${callsSection}${calledBySection}${resSection}${revSection}`;
}

// ─── Substvar Diff page ───────────────────────────────────────────────────────

export function renderBW6SubstVarDiffPage(model: DocModel): string {
  const profiles = model.profileProperties ?? {};
  const profileNames = Object.keys(profiles).sort();

  if (profileNames.length < 2) {
    return `<div class="page-header"><h1>📊 Profile Comparison</h1></div>
<div class="empty-state"><div class="icon">📊</div><p>At least two configuration profiles (substvar files) are required for a diff view.<br>
Only ${profileNames.length === 0 ? 'none' : `"${profileNames[0]}"`} found.</p></div>`;
  }

  // Build union of all property names, preserve order from first profile
  const allNames = new Map<string, Set<string>>();
  for (const [pName, props] of Object.entries(profiles)) {
    for (const prop of props) {
      if (!allNames.has(prop.name)) allNames.set(prop.name, new Set());
      allNames.get(prop.name)!.add(pName);
    }
  }

  // Build lookup: profileName → name → value
  const lookup: Record<string, Record<string, string>> = {};
  for (const [pName, props] of Object.entries(profiles)) {
    lookup[pName] = {};
    for (const prop of props) lookup[pName][prop.name] = prop.value ?? '';
  }

  // Count diff rows
  let diffCount = 0;
  const rows: string[] = [];
  for (const [propName] of allNames) {
    const vals = profileNames.map(p => lookup[p]?.[propName] ?? '');
    const differs = new Set(vals).size > 1 || vals.some(v => !v);
    if (differs) diffCount++;

    const rowStyle = differs ? 'background:#fffbeb' : '';
    const cells = profileNames.map(p => {
      const val = lookup[p]?.[propName];
      if (val === undefined) return `<td style="background:#fef2f2;color:#dc2626;font-size:12px;font-style:italic">not defined</td>`;
      return `<td>${renderBW6Value(val)}</td>`;
    }).join('');

    rows.push(`<tr style="${rowStyle}">
      <td class="td-mono" style="font-size:12px">${escHtml(propName)}</td>
      ${cells}
      <td style="text-align:center">${differs ? `<span style="color:#d97706;font-size:16px">⚠</span>` : `<span style="color:#22c55e;font-size:16px">✓</span>`}</td>
    </tr>`);
  }

  const headerCells = profileNames.map(p => `<th style="text-align:left">${escHtml(p)}</th>`).join('');

  return `<div class="page-header">
  <h1>📊 Profile Comparison</h1>
  <div class="meta">${profileNames.length} profiles · ${allNames.size} properties · ${diffCount} differ</div>
</div>
<div class="card" style="margin-bottom:16px">
  <div class="card-title">Profiles Compared</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    ${profileNames.map(p => `<a href="properties-${escHtml(p)}.html" style="background:#e0f2fe;color:#0369a1;padding:4px 12px;border-radius:6px;font-size:13px;text-decoration:none">📄 ${escHtml(p)}.substvar</a>`).join('')}
  </div>
</div>
<div class="card" style="padding:0;overflow:auto">
  <table><thead><tr>
    <th style="min-width:220px">Property Name</th>
    ${headerCells}
    <th style="width:60px;text-align:center">Status</th>
  </tr></thead>
  <tbody>${rows.join('')}</tbody></table>
</div>`;
}

// ─── Service Descriptors page (WSDL + OpenAPI) ───────────────────────────────

export function renderBW6ServiceDescriptorsPage(model: DocModel): string {
  const specs = model.specs ?? [];
  if (specs.length === 0) {
    return `<div class="page-header"><h1>📋 Service Descriptors</h1></div>
<div class="empty-state"><div class="icon">📋</div><p>No service descriptors found in the Service Descriptors/ folder</p></div>`;
  }

  const summaryRows = specs.map(s => {
    const typeBadge = s.type === 'wsdl'
      ? `<span class="badge" style="background:#dbeafe;color:#1e3a8a">WSDL</span>`
      : s.type === 'openapi'
      ? `<span class="badge" style="background:#d1fae5;color:#065f46">OpenAPI</span>`
      : `<span class="badge pal-general">${escHtml(s.type)}</span>`;
    return `<tr style="cursor:pointer" onclick="(function(){var c=document.getElementById('spec-${s.id}');if(c){c.setAttribute('data-expanded','true');c.scrollIntoView({behavior:'smooth',block:'start'})}})()">
      <td><a href="#spec-${s.id}" style="color:var(--link)">${escHtml(s.name)}</a></td>
      <td>${typeBadge}</td>
      <td>${escHtml(s.title ?? s.name)}</td>
      <td class="td-mono">${escHtml(s.version ?? '—')}</td>
      <td>${s.endpoints?.length ?? 0}</td>
    </tr>`;
  }).join('');

  const specCards = specs.map(s => {
    const isWsdl = s.type === 'wsdl';
    const typeBadge = isWsdl
      ? `<span class="badge" style="background:#dbeafe;color:#1e3a8a">WSDL</span>`
      : s.type === 'openapi'
      ? `<span class="badge" style="background:#d1fae5;color:#065f46">OpenAPI</span>`
      : `<span class="badge pal-general">${escHtml(s.type)}</span>`;
    const metaHtml = [
      s.version ? `<span style="font-size:12px;color:var(--text-muted)">v${escHtml(s.version)}</span>` : '',
      s.basePath ? `<code style="font-size:12px;background:#f1f5f9;padding:1px 6px;border-radius:3px">${escHtml(s.basePath)}</code>` : '',
      s.wsdlTargetNamespace ? `<code style="font-size:11px;background:#f1f5f9;padding:1px 6px;border-radius:3px;color:#64748b">${escHtml(s.wsdlTargetNamespace)}</code>` : '',
    ].filter(Boolean).join('&nbsp;·&nbsp;');

    // WSDL structured view: portTypes + messages
    let structuredHtml = '';
    if (isWsdl && (s.wsdlPortTypes?.length || s.wsdlMessages?.length)) {
      const portTypeHtml = (s.wsdlPortTypes ?? []).map(pt => {
        const opRows = pt.operations.map(op => {
          const inMsg  = op.input  ? op.input.split(':').pop()  ?? op.input  : '—';
          const outMsg = op.output ? op.output.split(':').pop() ?? op.output : '—';
          return `<tr>
            <td style="font-weight:600;color:#1e3a8a">${escHtml(op.name)}</td>
            <td class="td-mono" style="font-size:11px;color:#475569">${escHtml(inMsg)}</td>
            <td class="td-mono" style="font-size:11px;color:#475569">${escHtml(outMsg)}</td>
          </tr>`;
        }).join('');
        return `<div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:700;color:var(--brand);margin-bottom:6px">portType: ${escHtml(pt.name)}</div>
          <table style="font-size:12px"><thead><tr><th>Operation</th><th>Input</th><th>Output</th></tr></thead>
          <tbody>${opRows}</tbody></table>
        </div>`;
      }).join('');

      const msgHtml = (s.wsdlMessages ?? []).map(msg => {
        const partRows = msg.parts.map(p => {
          const ref = p.element ?? p.type ?? '—';
          return `<tr><td class="td-mono" style="font-size:11px">${escHtml(p.name)}</td>
            <td class="td-mono" style="font-size:11px;color:#475569">${escHtml(ref.split(':').pop() ?? ref)}</td></tr>`;
        }).join('');
        return partRows
          ? `<div style="margin-bottom:6px">
              <span style="font-weight:600;font-size:12px">${escHtml(msg.name)}</span>
              <table style="font-size:12px;margin-top:4px"><thead><tr><th>Part</th><th>Element / Type</th></tr></thead>
              <tbody>${partRows}</tbody></table>
             </div>`
          : `<div style="font-size:12px;padding:4px 0"><span style="font-weight:600">${escHtml(msg.name)}</span> <span style="color:var(--text-muted)">(no parts)</span></div>`;
      }).join('');

      structuredHtml = `
        ${portTypeHtml ? `<div style="margin-bottom:14px"><div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Operations</div>${portTypeHtml}</div>` : ''}
        ${msgHtml ? `<div style="margin-bottom:14px"><div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Messages</div>${msgHtml}</div>` : ''}`;
    } else if (!isWsdl && s.endpoints && s.endpoints.length > 0) {
      structuredHtml = `<div style="margin-bottom:8px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Paths / Operations</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${s.endpoints.map(ep => `<code style="background:#f1f5f9;padding:2px 7px;border-radius:4px;font-size:12px;color:#334155">${escHtml(ep)}</code>`).join('')}</div>
      </div>`;
    }

    return `<div class="schema-card" id="spec-${s.id}" data-expanded="true">
  <div class="schema-card-header" onclick="toggleSchema(this.closest('.schema-card'))">
    <span class="act-chevron">▾</span>
    ${typeBadge}
    <span style="font-weight:600;margin-left:6px">${escHtml(s.title ?? s.name)}</span>
    <span style="color:var(--text-muted);font-size:12px;margin-left:6px">${escHtml(s.name)}</span>
    ${metaHtml ? `<span style="margin-left:auto">${metaHtml}</span>` : ''}
  </div>
  <div class="schema-card-body">
    ${structuredHtml}
    <div style="margin-top:10px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;font-weight:600">Source</div>
      <pre class="schema-pre">${escHtml(s.content)}</pre>
    </div>
  </div>
</div>`;
  }).join('\n');

  return `<div class="page-header">
  <h1>📋 Service Descriptors</h1>
  <div class="meta">${specs.length} service contract${specs.length !== 1 ? 's' : ''}</div>
</div>
<div class="card">
  <div class="card-title">Summary</div>
  <table><thead><tr><th>File</th><th>Type</th><th>Title</th><th>Version</th><th>Operations</th></tr></thead>
  <tbody>${summaryRows}</tbody></table>
</div>
<div class="section-title">Service Contracts</div>
${specCards}`;
}

// ─── Per-profile properties page ─────────────────────────────────────────────

export function renderBW6ProfilePropertiesPage(model: DocModel, profileName: string): string {
  const props: PropertyDoc[] = model.profileProperties?.[profileName] ?? [];
  const displayName = profileName.charAt(0).toUpperCase() + profileName.slice(1);
  if (props.length === 0) {
    return `<div class="page-header"><h1>📋 ${escHtml(displayName)} Profile</h1></div>
<div class="empty-state"><div class="icon">📋</div><p>No properties defined in the ${escHtml(profileName)} profile</p></div>`;
  }
  const rows = props.map(p => `<tr>
    <td class="td-mono">${escHtml(p.name)}</td>
    <td>${escHtml(p.type || 'String')}</td>
    <td>${renderBW6Value(p.value)}</td>
    <td class="td-muted">${escHtml(p.description ?? '—')}</td>
  </tr>`).join('');
  return `<div class="breadcrumb">
  <a href="index.html">Application</a> › <a href="properties.html">Module Properties</a> › ${escHtml(displayName)} Profile
</div>
<div class="page-header">
  <h1>📋 ${escHtml(displayName)} Profile</h1>
  <div class="meta">${props.length} propert${props.length !== 1 ? 'ies' : 'y'} in this profile</div>
</div>
<div class="card" style="padding:0;overflow:hidden">
  <table><thead><tr><th>Name</th><th>Type</th><th>Value</th><th>Description</th></tr></thead>
  <tbody>${rows}</tbody></table>
</div>`;
}
