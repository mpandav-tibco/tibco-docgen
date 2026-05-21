import { DocModel, BW6SharedLibDoc } from '../../model';
import { safeId, escHtml, dedupePalettes, parsePalette, groupConnections, categoryIcon, getAppDisplayName, groupFlowsByParent } from './helpers';

export function extractTagMeta(model: DocModel): { edition: string; symbolicName: string; bwVersion: string; profiles: string[]; appModules: string[] } {
  const tags = model.app.tags ?? [];
  const edition = tags[0] ?? 'BW';
  const symbolicName = tags[1] ?? '';
  const bwVersion = tags[2] && !tags[2].startsWith('profile:') && !tags[2].startsWith('module:') ? tags[2] : '';
  const profiles = tags.filter(t => t.startsWith('profile:')).map(t => t.slice(8));
  const appModules = tags.filter(t => t.startsWith('module:')).map(t => t.slice(7));
  return { edition, symbolicName, bwVersion, profiles, appModules };
}

/** Short badge for topbar — "🐳 Containers" / "🏢 AppSpace" */
export function deploymentTargetTopbar(model: DocModel): string {
  const target = model.app.deploymentTarget;
  if (target === 'container') return `<span class="deploy-target-container" title="TIBCO BusinessWorks Container Edition — Docker/Kubernetes">🐳 Containers</span>`;
  if (target === 'appspace')  return `<span class="deploy-target-appspace"  title="TIBCO BusinessWorks Enterprise Edition — AppSpace on-prem">🏢 AppSpace</span>`;
  return '';
}

/** Plain text for the info grid — "BW6CE" / "BW6" */
export function deploymentTargetText(model: DocModel): string {
  const target = model.app.deploymentTarget;
  if (target === 'container') return 'BW6CE';
  if (target === 'appspace')  return 'BW6';
  return '';
}

export function renderSharedLibSidebarSection(lib: BW6SharedLibDoc, activePage: string): string {
  const libId = safeId(lib.id);
  const processLinks = lib.flows.map(f => {
    const pId = safeId(f.id);
    const active = activePage === `sharedlibs/${libId}/processes/${pId}` ? ' active' : '';
    return `<a href="sharedlibs/${libId}/processes/${pId}.html" class="sb-item sb-i3${active}">📄 ${escHtml(f.name)}</a>`;
  }).join('\n');

  return `<div class="sb-item sb-i1 folder-header" style="color:#a5b4fc">📦 ${escHtml(lib.name)} <span class="sb-root-ver">v${escHtml(lib.version)}</span></div>
  <div class="sb-item sb-i2 dim">📁 Processes <span class="sb-count">${lib.flows.length}</span></div>
  ${processLinks}
  ${lib.connections.length > 0 ? `<a href="sharedlibs/${libId}/resources.html" class="sb-item sb-i2${activePage === `sharedlibs/${libId}/resources` ? ' active' : ''}">🔌 Resources <span class="sb-count">${lib.connections.length}</span></a>` : `<div class="sb-item sb-i2 dim">🔌 Resources (0)</div>`}
  ${lib.schemas.length > 0 ? `<a href="sharedlibs/${libId}/schemas.html" class="sb-item sb-i2${activePage === `sharedlibs/${libId}/schemas` ? ' active' : ''}">📐 Schemas <span class="sb-count">${lib.schemas.length}</span></a>` : `<div class="sb-item sb-i2 dim">📐 Schemas (0)</div>`}
  ${lib.properties.length > 0 ? `<a href="sharedlibs/${libId}/properties.html" class="sb-item sb-i2${activePage === `sharedlibs/${libId}/properties` ? ' active' : ''}">⚙️ Properties <span class="sb-count">${lib.properties.length}</span></a>` : ''}`;
}

export function sbSection(title: string, count: number | null, body: string, startCollapsed = false): string {
  const c = startCollapsed ? ' collapsed' : '';
  const countBadge = count !== null ? `<span class="sb-count">${count}</span>` : '';
  return `<div class="sb-section${c}">
  <div class="sb-section-toggle sb-item folder-header">${title} ${countBadge}<span class="sb-caret">▾</span></div>
  <div class="sb-section-body">`;
}
export const sbSectionEnd = `</div></div>`;

export function renderSidebar(model: DocModel, activePage: string): string {
  const conns = model.connections;
  const schemas = model.schemas;
  const specs = model.specs ?? [];
  const palettes = dedupePalettes((model.app.imports ?? []).filter(Boolean).map(parsePalette));
  const props = model.properties;
  const { edition, symbolicName, profiles, appModules } = extractTagMeta(model);
  const sharedLibs = model.bw6SharedLibs ?? [];

  // Per-process links (grouped flows share one sidebar entry)
  const flowLinks = Array.from(groupFlowsByParent(model.flows).entries()).map(([key, flows]) => {
    const isGrouped = flows.length > 1 || flows[0].id !== key;
    const pId = safeId(key);
    const active = activePage === `processes/${pId}` ? ' active' : '';
    const icon = isGrouped ? '📋' : '📄';
    const displayName = isGrouped
      ? (key.split(/[./\\]/).filter(Boolean).pop() ?? key)
      : flows[0].name;
    return `<a href="processes/${pId}.html" class="sb-item sb-i2${active}">${icon} ${escHtml(displayName)}</a>`;
  }).join('\n');

  // Resources tree
  const connGroups = groupConnections(conns);
  let connTree = '';
  if (conns.length === 0) {
    connTree = `<div class="sb-item sb-i2 dim">(none)</div>`;
  } else {
    for (const [cat, cs] of connGroups) {
      const icon = categoryIcon(cat);
      const active = activePage === 'resources' ? ' active' : '';
      connTree += `<div class="sb-item sb-i2 dim">📁 ${cat}</div>`;
      for (const c of cs) {
        connTree += `<a href="resources.html" class="sb-item sb-i3${active}">${icon} ${escHtml(c.name)}</a>`;
      }
    }
  }

  // Service Descriptor links
  const specLinks = specs.map(s => {
    const active = activePage === `service-descriptors/${s.id}` ? ' active' : '';
    return `<a href="service-descriptors.html#spec-${escHtml(s.id)}" class="sb-item sb-i2${active}">📃 ${escHtml(s.name)}</a>`;
  }).join('\n');

  // Profile links
  const profileLinks = profiles.map(p => {
    const active = activePage === `properties-${p}` ? ' active' : '';
    return `<a href="properties-${p}.html" class="sb-item sb-i2${active}">📋 ${escHtml(p)}</a>`;
  }).join('\n');

  return `<div class="sidebar">
  <div class="sb-root">
    <span>📦</span>
    <span class="sb-root-name">${escHtml(getAppDisplayName(model))}</span>
    <span class="sb-root-ver">v${escHtml(model.app.version)}</span>
  </div>
  <div style="padding:8px 10px;border-bottom:1px solid #1a3484">
    <input type="text" placeholder="Filter…" oninput="filterSidebar(this.value)" autocomplete="off"
      style="width:100%;background:#122d6e;border:1px solid #1a3484;border-radius:4px;color:#93c5fd;font-size:12px;padding:5px 8px;outline:none;">
  </div>

  <a href="index.html" class="sb-item${activePage === 'index' ? ' active' : ''}">🏠 Overview</a>

  <hr class="sb-divider"/>

  ${sbSection('📁 Processes', model.flows.length, '')}
  <a href="processes.html" class="sb-item sb-i1${activePage === 'processes' ? ' active' : ''}">≡ All Processes</a>
  ${flowLinks}
  ${sbSectionEnd}

  <hr class="sb-divider"/>

  ${specs.length > 0 ? `${sbSection('📋 Service Descriptors', specs.length, '')}
  <a href="service-descriptors.html" class="sb-item sb-i1${activePage === 'service-descriptors' ? ' active' : ''}">≡ All Descriptors</a>
  ${specLinks}
  ${sbSectionEnd}<hr class="sb-divider"/>` : ''}

  ${sbSection('📐 Schemas', schemas.length, '')}
  ${schemas.length === 0
    ? `<div class="sb-item sb-i1 dim">(none)</div>`
    : schemas.map(s => `<a href="schemas.html#schema-${safeId(s.name)}" class="sb-item sb-i1${activePage === 'schemas' ? ' active' : ''}">📄 ${escHtml(s.name)}</a>`).join('')}
  ${sbSectionEnd}

  <hr class="sb-divider"/>

  ${sbSection('📁 Resources', conns.length, '')}
  ${connTree}
  ${sbSectionEnd}

  <hr class="sb-divider"/>

  ${sbSection('⚙️ Configuration', null, '')}
  <a href="properties.html" class="sb-item sb-i1${activePage === 'properties' ? ' active' : ''}">⚙️ Module Properties <span class="sb-count">${props.length}</span></a>
  <a href="palettes.html" class="sb-item sb-i1${activePage === 'palettes' ? ' active' : ''}">🧩 Used Palettes <span class="sb-count">${palettes.length}</span></a>
  ${(model.moduleSharedVars?.length ?? 0) + (model.jobSharedVars?.length ?? 0) > 0
    ? `<a href="shared-vars.html" class="sb-item sb-i1${activePage === 'shared-vars' ? ' active' : ''}">🔄 Shared Variables <span class="sb-count">${(model.moduleSharedVars?.length ?? 0) + (model.jobSharedVars?.length ?? 0)}</span></a>` : ''}
  ${profiles.length >= 2 ? `<a href="substvar-diff.html" class="sb-item sb-i1${activePage === 'substvar-diff' ? ' active' : ''}">📊 Profile Comparison</a>` : ''}
  ${profiles.length > 0 ? `<div class="sb-item sb-i1 dim" style="font-size:11px;color:#64748b;padding-top:4px">Config Profiles</div>${profileLinks}` : ''}
  ${sbSectionEnd}

  ${(model.restBindings?.length ?? 0) > 0 ? `
  <hr class="sb-divider"/>
  ${sbSection('🌐 API Surface', model.restBindings!.length, '')}
  <a href="api-surface.html" class="sb-item sb-i1${activePage === 'api-surface' ? ' active' : ''}">🌐 REST Services</a>
  ${sbSectionEnd}` : ''}

  <hr class="sb-divider"/>

  ${sbSection('🔍 Analysis', null, '')}
  <a href="qa.html" class="sb-item sb-i1${activePage === 'qa' ? ' active' : ''}">🔍 QA Analysis${(model.violations?.length ?? 0) > 0 ? ` <span class="sb-count" style="background:${(model.violations ?? []).some(v => v.severity === 'error') ? '#fee2e2;color:#dc2626' : '#fef3c7;color:#d97706'}">${model.violations!.length}</span>` : ' <span class="sb-count" style="background:#d1fae5;color:#065f46">✓</span>'}</a>
  <a href="cross-refs.html" class="sb-item sb-i1${activePage === 'cross-refs' ? ' active' : ''}">🔗 Cross-References</a>
  ${sbSectionEnd}

  ${sharedLibs.length > 0 ? `
  <hr class="sb-divider"/>
  ${sbSection('🗂 Shared Libraries', sharedLibs.length, '', false)}
  ${sharedLibs.map(lib => renderSharedLibSidebarSection(lib, activePage)).join('\n')}
  ${sbSectionEnd}` : ''}

  <hr class="sb-divider"/>

  ${sbSection('📄 Downloads', null, '')}
  <a href="../markdown/index.md" target="_blank" class="sb-item sb-i1">📝 Markdown</a>
  <a href="../json/model.json" target="_blank" class="sb-item sb-i1">⬇ JSON Model</a>
  ${sbSectionEnd}
</div>`;
}
