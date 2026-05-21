import { DocModel } from '../../model';
import {
  escHtml,
  safeId,
  dedupePalettes,
  parsePalette,
  categoryFromType,
  categoryIcon,
  renderBW6Value,
  palCls,
  groupConnections,
} from './helpers';
import { page } from './page-shell';

export function buildResourceUsageMap(model: DocModel): Map<string, string[]> {
  const usage = new Map<string, string[]>();
  const allFlows = [
    ...model.flows.map(f => ({ flow: f, prefix: '' })),
    ...(model.bw6SharedLibs ?? []).flatMap(l => l.flows.map(f => ({ flow: f, prefix: `${l.name}/` }))),
  ];
  for (const { flow, prefix } of allFlows) {
    for (const act of flow.activities) {
      if (!act.settings) continue;
      for (const v of Object.values(act.settings)) {
        const s = String(v ?? '');
        for (const conn of model.connections) {
          const key = conn.id;
          if (s.includes(conn.name) || s.includes(conn.id)) {
            const list = usage.get(key) ?? [];
            const label = prefix + flow.name;
            if (!list.includes(label)) list.push(label);
            usage.set(key, list);
          }
        }
      }
    }
  }
  return usage;
}

export function renderBW6ResourcesPage(model: DocModel): string {
  if (model.connections.length === 0) {
    return `<div class="page-header"><h1>🔌 Shared Resources</h1></div>
<div class="empty-state"><div class="icon">🔌</div><p>No shared resources defined</p></div>`;
  }

  const usageMap = buildResourceUsageMap(model);
  const groups = groupConnections(model.connections);
  let content = '';
  for (const [cat, cs] of groups) {
    const icon = categoryIcon(cat);
    const resourceCards = cs.map(c => {
      const settings = c.settings ?? {};
      let settingsHtml = '';
      if (Object.keys(settings).length > 0) {
        settingsHtml = `<table class="cfg-table">` +
          Object.entries(settings).map(([k, v]) =>
            `<tr><td>${escHtml(k)}</td><td>${renderBW6Value(v)}</td></tr>`
          ).join('') + `</table>`;
      } else {
        settingsHtml = `<p style="color:var(--text-muted);font-size:13px">(no configuration)</p>`;
      }
      const usedByProcesses = usageMap.get(c.id) ?? [];
      const usedByHtml = `<div style="margin-top:8px">
  <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:4px">USED BY PROCESSES</div>
  ${usedByProcesses.length > 0
    ? usedByProcesses.map(p => `<a href="processes/${safeId(p)}.html" style="display:inline-block;margin:2px 4px 2px 0;font-size:11px;padding:1px 6px;background:#e0f2fe;color:#075985;border-radius:4px;text-decoration:none">📄 ${escHtml(p)}</a>`).join('')
    : '<span style="font-size:11px;color:var(--text-muted)">—</span>'}
</div>`;
      return `<div class="card" style="margin-bottom:14px">
  <div class="card-title">${icon} ${escHtml(c.name)} <span class="badge ${palCls(categoryFromType(c.ref))}" style="margin-left:8px;font-size:11px">${escHtml(c.type)}</span></div>
  ${c.description ? `<p style="color:var(--text-muted);font-size:13px;margin-bottom:10px">${escHtml(c.description)}</p>` : ''}
  ${settingsHtml}
  ${usedByHtml}
</div>`;
    }).join('');

    content += `<div class="resource-group">
  <h3>${icon} ${cat} <span class="sb-count" style="background:#e8f5f3;color:var(--brand)">${cs.length}</span></h3>
  ${resourceCards}
</div>`;
  }

  return `<div class="page-header">
  <h1>🔌 Shared Resources</h1>
  <div class="meta">${model.connections.length} resource${model.connections.length !== 1 ? 's' : ''}</div>
</div>
${content}`;
}

// ─── Module Properties page ───────────────────────────────────────────────────

export function renderBW6PropertiesPage(model: DocModel): string {
  if (model.properties.length === 0) {
    return `<div class="page-header"><h1>⚙️ Module Properties</h1></div>
<div class="empty-state"><div class="icon">⚙️</div><p>No module properties / substitution variables defined</p></div>`;
  }

  const rows = model.properties.map(p => `<tr>
    <td class="td-mono">${escHtml(p.name)}</td>
    <td>${escHtml(p.type || 'String')}</td>
    <td>${renderBW6Value(p.value)}</td>
    <td class="td-muted">${escHtml(p.description ?? '—')}</td>
  </tr>`).join('');

  return `<div class="page-header">
  <h1>⚙️ Module Properties</h1>
  <div class="meta">${model.properties.length} substitution variable${model.properties.length !== 1 ? 's' : ''}</div>
</div>
<div class="card" style="padding:0;overflow:hidden">
  <table><thead><tr><th>Name</th><th>Type</th><th>Value</th><th>Description</th></tr></thead>
  <tbody>${rows}</tbody></table>
</div>`;
}

// ─── Palettes page ────────────────────────────────────────────────────────────

export function renderBW6PalettesPage(model: DocModel): string {
  const palettes = dedupePalettes((model.app.imports ?? []).filter(Boolean).map(parsePalette));
  if (palettes.length === 0) {
    return `<div class="page-header"><h1>🧩 Palettes</h1></div>
<div class="empty-state"><div class="icon">🧩</div><p>No palette dependencies found in MANIFEST.MF</p></div>`;
  }

  const rows = palettes.map(p => `<tr>
    <td><span class="badge ${palCls(p.shortName)}">${escHtml(p.displayName)}</span></td>
    <td class="td-mono">${escHtml(p.bundleId)}</td>
  </tr>`).join('');

  return `<div class="page-header">
  <h1>🧩 Palettes</h1>
  <div class="meta">${palettes.length} palette${palettes.length !== 1 ? 's' : ''} installed</div>
</div>
<div class="card" style="padding:0;overflow:hidden">
  <table><thead><tr><th>Palette</th><th>Bundle ID</th></tr></thead>
  <tbody>${rows}</tbody></table>
</div>`;
}

// ─── Schemas page ─────────────────────────────────────────────────────────────

export function renderBW6SchemasPage(model: DocModel): string {
  if (model.schemas.length === 0) {
    return `<div class="page-header"><h1>📐 Schemas</h1></div>
<div class="empty-state"><div class="icon">📐</div><p>No XSD schemas found in Schemas/ directory</p></div>`;
  }

  const summaryRows = model.schemas.map(s => {
    const nsMatch = s.value.match(/targetNamespace\s*=\s*["']([^"']+)["']/);
    const ns = nsMatch?.[1] ?? '—';
    const elemCount = (s.value.match(/<[^:]*:?element\b/g) ?? []).length;
    return `<tr style="cursor:pointer" onclick="(function(){var c=document.getElementById('schema-${safeId(s.name)}');if(c){c.setAttribute('data-expanded','true');c.scrollIntoView({behavior:'smooth',block:'start'})}})()">
      <td><a href="#schema-${safeId(s.name)}" style="color:var(--link)">${escHtml(s.name)}</a></td>
      <td class="td-mono">${escHtml(ns)}</td>
      <td>${elemCount}</td>
    </tr>`;
  }).join('');

  const schemaCards = model.schemas.map(s => {
    const nsMatch = s.value.match(/targetNamespace\s*=\s*["']([^"']+)["']/);
    const ns = nsMatch?.[1] ?? '';
    const elemCount = (s.value.match(/<[^:]*:?element\b/g) ?? []).length;
    return `<div class="schema-card" id="schema-${safeId(s.name)}" data-expanded="false">
  <div class="schema-card-header" onclick="toggleSchema(this.closest('.schema-card'))">
    <span class="act-chevron">▶</span>
    <span style="font-weight:600">${escHtml(s.name)}</span>
    ${ns ? `<span style="color:var(--text-muted);font-size:12px;margin-left:8px">${escHtml(ns)}</span>` : ''}
    <span style="margin-left:auto;font-size:11px;color:var(--text-muted)">${elemCount} element${elemCount !== 1 ? 's' : ''}</span>
  </div>
  <div class="schema-card-body">
    <pre class="schema-pre">${escHtml(s.value)}</pre>
  </div>
</div>`;
  }).join('\n');

  return `<div class="page-header">
  <h1>📐 Schemas</h1>
  <div class="meta">${model.schemas.length} XSD schema${model.schemas.length !== 1 ? 's' : ''}</div>
</div>
<div class="card">
  <div class="card-title">Summary</div>
  <table><thead><tr><th>File</th><th>Namespace</th><th>Elements</th></tr></thead>
  <tbody>${summaryRows}</tbody></table>
</div>
<div class="section-title">Schema Files</div>
${schemaCards}`;
}

// ─── Shared Variables page ───────────────────────────────────────────────────

export function renderBW6SharedVarsPage(model: DocModel): string {
  const msv = model.moduleSharedVars ?? [];
  const jsv = model.jobSharedVars ?? [];
  const total = msv.length + jsv.length;

  if (total === 0) {
    return `<div class="page-header"><h1>🔄 Shared Variables</h1></div>
<div class="empty-state"><div class="icon">🔄</div>
<p>No shared variables defined in module.msv or module.jsv.<br>
Module Shared Variables persist across process instances in the same module.<br>
Job Shared Variables are shared across activities within a single job (process instance).</p></div>`;
  }

  function renderTable(vars: typeof msv, title: string, icon: string, color: string): string {
    if (vars.length === 0) return '';
    const rows = vars.map(v => `<tr>
      <td class="td-mono">${escHtml(v.name)}</td>
      <td><span class="badge pal-api">${escHtml(v.type)}</span></td>
      <td>${renderBW6Value(v.value ?? '')}</td>
      <td class="td-muted">${escHtml(v.description ?? '—')}</td>
    </tr>`).join('');
    return `<div class="card" style="border-top:3px solid ${color};margin-bottom:16px">
  <div class="card-title">${icon} ${escHtml(title)} <span style="font-weight:400;color:var(--text-muted)">(${vars.length})</span></div>
  <table><thead><tr><th>Name</th><th>Type</th><th>Default Value</th><th>Description</th></tr></thead>
  <tbody>${rows}</tbody></table>
</div>`;
  }

  return `<div class="page-header">
  <h1>🔄 Shared Variables</h1>
  <div class="meta">${total} variable${total !== 1 ? 's' : ''} · ${msv.length} module-scoped · ${jsv.length} job-scoped</div>
</div>
${renderTable(msv, 'Module Shared Variables', '📦', '#00897b')}
${renderTable(jsv, 'Job Shared Variables', '⚙️', '#7c3aed')}`;
}
