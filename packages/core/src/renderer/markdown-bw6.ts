import * as path from 'path';
import * as fs from 'fs';
import { DocModel, FlowDoc, ActivityDoc, LinkDoc, QAViolation, RestBindingDoc, CrossRefDoc } from '../model';
import { BW6IconRegistry } from '../bw6-icons';
import { renderArchDiagramSVG } from './bw6/overview';
import { renderBW6FlowSVG } from '../svg/flow-renderer';
import { safeId, humanizeType, paletteFromType, groupFlowsByParent } from './bw6/helpers';
import { setIconRegistry, getIconRegistry } from './bw6/icon-registry';

// ─── Utilities ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escMd(s: string): string {
  return String(s).replace(/[[\]`*_\\]/g, '\\$&');
}

//"%%{DB_HOST}%%" → "${DB_HOST}"  (markdown-friendly substitution variable)
function renderSubstValue(v: string | undefined): string {
  if (!v) return '—';
  const s = String(v)
    .replace(/%%\{([^}]+)\}%%/g, '`$${$1}`')
    .replace(/^(?:#!|SECRET:).*/, '🔒 redacted');
  return esc(s);
}

// Detect fault handler activities via error-type links (transitive closure)
function getFaultActivityIds(flow: FlowDoc): Set<string> {
  const errorTargets = new Set<string>();
  for (const l of flow.links) {
    if (l.type === 'error') errorTargets.add(l.to);
  }
  // Transitive: anything reachable from an error target via always/expression links
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of flow.links) {
      if (errorTargets.has(l.from) && !errorTargets.has(l.to)) {
        errorTargets.add(l.to);
        changed = true;
      }
    }
  }
  return errorTargets;
}

// ─── App description (same heuristic as HTML renderer) ────────────────────────

function generateAppDescription(model: DocModel): string {
  const appName = model.app.name.replace(/\s+Module\s*$/i, '').trim() || model.app.name;

  const triggerRefs = model.triggers.map(t => (t.ref ?? '').toLowerCase());
  let integrationPattern = 'integration';
  let triggerDesc = '';
  if (triggerRefs.some(r => r.includes('kafka'))) {
    integrationPattern = 'event-driven integration';
    triggerDesc = 'consumes messages from Apache Kafka topics';
  } else if (triggerRefs.some(r => r.includes('rest') || r.includes('http'))) {
    integrationPattern = 'REST API service';
    triggerDesc = 'exposes REST/HTTP endpoints';
  } else if (triggerRefs.some(r => r.includes('timer') || r.includes('sleep'))) {
    integrationPattern = 'batch/scheduled integration';
    triggerDesc = 'runs on a scheduled timer';
  } else if (triggerRefs.some(r => r.includes('ems') || r.includes('jms'))) {
    integrationPattern = 'messaging integration';
    triggerDesc = 'consumes messages from EMS/JMS queues or topics';
  }

  const connRefs = model.connections.map(c => (c.ref ?? c.type ?? '').toLowerCase());
  const datastoreDescs: string[] = [];
  if (connRefs.some(r => r.includes('jdbc') || r.includes('sql'))) {
    datastoreDescs.push('a SQL database via JDBC');
  }
  if (connRefs.some(r => r.includes('kafka'))) {
    datastoreDescs.push('Apache Kafka messaging');
  }
  if (connRefs.some(r => r.includes('ems') || r.includes('jms'))) {
    datastoreDescs.push('EMS/JMS messaging');
  }

  let sentence1 = `${appName} is a TIBCO BusinessWorks ${integrationPattern}`;
  if (triggerDesc) sentence1 += ` that ${triggerDesc}`;
  if (datastoreDescs.length > 0) sentence1 += ` and integrates with ${datastoreDescs.join(' and ')}`;
  sentence1 += '.';

  const processCount = model.flows.length;
  const sharedLibs = model.bw6SharedLibs ?? [];
  let sentence2 = `The application implements ${processCount} core process${processCount !== 1 ? 'es' : ''}`;
  if (sharedLibs.length > 0) {
    const libNames = sharedLibs.map(l => l.name).join(', ');
    sentence2 += ` and leverages the ${libNames} shared librar${sharedLibs.length !== 1 ? 'ies' : 'y'} for reusable integration logic`;
  }
  sentence2 += '.';

  return `${sentence1} ${sentence2}`;
}

function sevIcon(s: string): string {
  return s === 'error' ? '🔴 ERROR' : s === 'warning' ? '🟡 WARNING' : 'ℹ️ INFO';
}

function countBySeverity(violations: QAViolation[]) {
  let errs = 0, warns = 0, infos = 0;
  for (const v of violations) {
    if (v.severity === 'error') errs++;
    else if (v.severity === 'warning') warns++;
    else infos++;
  }
  return { errs, warns, infos };
}

// ─── Table of Contents ────────────────────────────────────────────────────────

function tocAnchor(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
}

function buildTOC(model: DocModel): string {
  const { flows, connections, properties, schemas, specs, triggers } = model;
  const sharedLibs = model.bw6SharedLibs ?? [];
  const violations = model.violations ?? [];
  const restBindings = model.restBindings ?? [];
  const crossRefs = model.crossRefs;

  // Compute once — reused for both the TOC badge and the QA section
  const { errs, warns, infos } = countBySeverity(violations);

  // Compute once — sharedLibs traversed twice below otherwise
  const hasSharedLibFlows = sharedLibs.some(l => l.flows.length > 0);
  const hasSharedLibConns = sharedLibs.some(l => l.connections.length > 0);

  const lines: string[] = ['## Table of Contents', ''];
  let n = 1;

  lines.push(`${n++}. [Application Architecture](#application-architecture)`);
  lines.push(`${n++}. [Summary](#summary)`);
  lines.push(`${n++}. [Processes](#processes)`);
  for (const [key, groupFlows] of groupFlowsByParent(flows)) {
    const isGrouped = groupFlows.length > 1 || groupFlows[0].id !== key;
    const displayName = isGrouped ? (key.split(/[./\\]/).filter(Boolean).pop() ?? key) : groupFlows[0].name;
    lines.push(`   - [${escMd(displayName)}](#${tocAnchor(displayName)})`);
    if (isGrouped) {
      for (const f of groupFlows) {
        const subName = f.id.includes('/') ? f.id.split('/').slice(1).join('/') : f.name;
        lines.push(`     - [${escMd(subName)}](#${tocAnchor(displayName + '-' + subName)})`);
      }
    }
  }

  if (hasSharedLibFlows) lines.push(`${n++}. [Shared Library Processes](#shared-library-processes)`);
  if (connections.length > 0 || hasSharedLibConns) lines.push(`${n++}. [Shared Resources](#shared-resources)`);
  if (properties.length > 0) lines.push(`${n++}. [Module Properties](#module-properties)`);
  if (schemas.length > 0)    lines.push(`${n++}. [Schemas](#schemas)`);
  if (specs.length > 0)      lines.push(`${n++}. [Service Descriptors](#service-descriptors)`);
  if (triggers.length > 0)   lines.push(`${n++}. [Process Starters](#process-starters)`);
  if (model.app.imports && model.app.imports.length > 0) lines.push(`${n++}. [Installed Palettes](#installed-palettes)`);
  if (restBindings.length > 0) lines.push(`${n++}. [API Surface](#api-surface)`);

  if (violations.length > 0) {
    const badge = errs > 0 ? ` — ${errs} error${errs !== 1 ? 's' : ''}` : warns > 0 ? ` — ${warns} warning${warns !== 1 ? 's' : ''}` : ` — ${infos} info`;
    lines.push(`${n++}. [QA Analysis](#qa-analysis)${badge}`);
  }

  if (crossRefs && (
    Object.keys(crossRefs.processCallsProcess).length > 0 ||
    Object.keys(crossRefs.processUsesResource).length > 0
  )) {
    lines.push(`${n++}. [Cross-References](#cross-references)`);
  }

  lines.push('');
  return lines.join('\n');
}

// ─── API Surface section ──────────────────────────────────────────────────────

function renderApiSurfaceMd(bindings: RestBindingDoc[]): string {
  if (bindings.length === 0) return '';

  const totalOps = bindings.reduce((n, b) => n + b.operations.length, 0);
  const lines: string[] = [
    '## API Surface',
    '',
    `${bindings.length} service${bindings.length !== 1 ? 's' : ''} · ${totalOps} operation${totalOps !== 1 ? 's' : ''}`,
    '',
    '| Service | Base Path | Type | Operations |',
    '|---|---|---|---|',
  ];

  for (const b of bindings) {
    const type = (b.bindingType ?? 'REST').toUpperCase();
    const ops = b.operations.map(o => `\`${esc(o.operationName)}\``).join(', ');
    lines.push(`| ${esc(b.serviceName)} | \`${esc(b.basePath || b.path || '/')}\` | ${type} | ${ops} |`);
  }
  lines.push('');

  lines.push('### Service Details', '');
  for (const b of bindings) {
    const type = (b.bindingType ?? 'REST').toUpperCase();
    const processRef = b.processName ? ` → process: \`${esc(b.processName)}\`` : '';
    lines.push(`#### ${esc(b.serviceName)}${processRef}`, '');
    lines.push('| Method | Path | Operation | Notes |');
    lines.push('|---|---|---|---|');
    for (const op of b.operations) {
      const method = op.method ?? type;
      lines.push(`| ${esc(method)} | \`${esc(b.basePath || b.path || '/')}\` | ${esc(op.operationName)} | ${esc(op.notes ?? '—')} |`);
    }
    lines.push('');
  }

  lines.push('---', '');
  return lines.join('\n');
}

// ─── QA Analysis section ─────────────────────────────────────────────────────

function renderQAMd(violations: QAViolation[], product: string): string {
  if (violations.length === 0) return '';

  const { errs, warns, infos } = countBySeverity(violations);
  const summaryParts: string[] = [];
  if (errs)  summaryParts.push(`**${errs} error${errs !== 1 ? 's' : ''}**`);
  if (warns) summaryParts.push(`**${warns} warning${warns !== 1 ? 's' : ''}**`);
  if (infos) summaryParts.push(`${infos} info`);

  const isFlogo = product === 'flogo';
  const sonarUrl = isFlogo ? 'https://github.com/mpandav-tibco/flogo-sonar' : 'https://github.com/TIBCOSoftware/sonar-bw';
  const sonarLabel = isFlogo ? 'TIBCO Flogo Sonar Plugin' : 'TIBCO BusinessWorks SonarQube Plugin';
  const sonarDesc = isFlogo ? 'Flogo quality, security and maintainability.' : 'BW6 quality, security and maintainability.';

  const lines: string[] = [
    '## QA Analysis',
    '',
    summaryParts.join(' · '),
    '',
    `> ℹ Rules are based on the [${sonarLabel}](${sonarUrl}) — open-source static analysis for ${sonarDesc}`,
    '',
    '| Severity | Rule | Message | Location | Detail |',
    '|---|---|---|---|---|',
  ];

  for (const v of violations) {
    lines.push(`| ${sevIcon(v.severity)} | \`${esc(v.ruleId)}\` | ${esc(v.message)} | ${esc(v.location)} | ${esc(v.detail ?? '—')} |`);
  }

  lines.push('', '---', '');
  return lines.join('\n');
}

// ─── Cross-References section ─────────────────────────────────────────────────

function crossRefTable(heading: string, col1: string, col2: string, data: Record<string, string[]>, quoteValues: boolean): string[] {
  if (Object.keys(data).length === 0) return [];
  const rows = Object.entries(data).map(([key, vals]) => {
    const valStr = quoteValues ? vals.map(v => `\`${esc(v)}\``).join(', ') : vals.map(v => esc(v)).join(', ');
    return `| \`${esc(key)}\` | ${valStr} |`;
  });
  return [`### ${heading}`, '', `| ${col1} | ${col2} |`, '|---|---|', ...rows, ''];
}

function renderCrossRefsMd(crossRefs: CrossRefDoc): string {
  const sections = [
    crossRefTable('Process → Resource Dependencies',  'Process',        'Resources Used',    crossRefs.processUsesResource,   false),
    crossRefTable('Resource → Process Usage',         'Resource',       'Used By',           crossRefs.resourceUsedByProcess, true),
    crossRefTable('Process → Sub-Process Calls',      'Caller Process', 'Called Processes',  crossRefs.processCallsProcess,   true),
    crossRefTable('Process → Callers',                'Process',        'Called By',         crossRefs.processCalledBy,       true),
  ].filter(s => s.length > 0);

  if (sections.length === 0) return '';
  return ['## Cross-References', '', ...sections.flat(), '---', ''].join('\n');
}

// ─── Activity config + mappings tables ────────────────────────────────────────

function renderActivityConfigMd(act: ActivityDoc): string {
  const parts: string[] = [];

  // Config / Settings table
  const settingsEntries = Object.entries(act.settings ?? {})
    .filter(([, v]) => v != null && String(v).trim() !== '');
  if (settingsEntries.length > 0) {
    const rows = settingsEntries.map(([k, v]) =>
      `| \`${esc(k)}\` | ${renderSubstValue(String(v))} |`
    );
    parts.push(`**Configuration**\n\n| Property | Value |\n|---|---|\n${rows.join('\n')}`);
  }

  // Input mappings table (Target XPath → Source Expression)
  const mappingEntries = Object.entries(act.input ?? {})
    .filter(([, v]) => v != null && String(v).trim() !== '');
  if (mappingEntries.length > 0) {
    const rows = mappingEntries.map(([target, source]) =>
      `| \`${esc(target)}\` | \`${esc(String(source))}\` |`
    );
    parts.push(`**Input Mappings**\n\n| Target | Source Expression |\n|---|---|\n${rows.join('\n')}`);
  }

  return parts.join('\n\n');
}

// ─── Process section ──────────────────────────────────────────────────────────

function renderProcessMd(flow: FlowDoc, triggerMap: Map<string, string>, svgRelPath?: string, hLevel = 3): string {
  const h  = '#'.repeat(hLevel);
  const h1 = '#'.repeat(hLevel + 1);
  const faultIds = getFaultActivityIds(flow);
  const starterType = triggerMap.get(flow.id) ?? triggerMap.get(flow.name) ?? '';
  const starterLabel = starterType ? ` · Starter: ${humanizeType(starterType)}` : '';

  const lines: string[] = [
    `${h} ${escMd(flow.name)}`,
    '',
    `> **Process:** \`${flow.id}\`${starterLabel}  `,
    `> **Activities:** ${flow.activities.length} | **Transitions:** ${flow.links.length}`,
    '',
  ];

  if (flow.description) {
    lines.push(`${escMd(flow.description)}`, '');
  }

  if (svgRelPath) {
    lines.push(`${h1} Process Flow Diagram`, '', `![${escMd(flow.name)} Flow Diagram](${svgRelPath})`, '');
  }

  // Activities table
  lines.push(`${h1} Activities`, '');
  lines.push('| # | Name | Palette | Type | Fault Handler | Description |');
  lines.push('|---|---|---|---|---|---|');
  flow.activities.forEach((act, i) => {
    const isFault = faultIds.has(act.id) ? 'Yes' : '';
    const palette = paletteFromType(act.ref);
    const hType = humanizeType(act.ref);
    lines.push(`| ${i + 1} | ${esc(act.name)} | ${palette} | ${hType} | ${isFault} | ${esc(act.description || '—')} |`);
  });
  lines.push('');

  // Activity config details — only for non-trivial activities
  const configActs = flow.activities.filter(a => {
    const s = Object.keys(a.settings ?? {}).length;
    const inp = Object.keys(a.input ?? {}).length;
    return s + inp > 0;
  });
  if (configActs.length > 0) {
    lines.push(`${h1} Activity Configuration Details`, '');
    for (const act of configActs) {
      const isFault = faultIds.has(act.id);
      const faultNote = isFault ? ' ⚠ (Fault Handler)' : '';
      lines.push(`**${escMd(act.name)}**${faultNote} — ${humanizeType(act.ref)}`, '');
      const cfgTable = renderActivityConfigMd(act);
      if (cfgTable) lines.push(cfgTable, '');
    }
  }

  // Transitions table
  if (flow.links.length > 0) {
    lines.push(`${h1} Transitions`, '');
    lines.push('| From | To | Type | Condition |');
    lines.push('|---|---|---|---|');
    for (const l of flow.links) {
      lines.push(`| ${esc(l.from)} | ${esc(l.to)} | ${l.type} | ${esc(l.condition || '—')} |`);
    }
    lines.push('');
  }

  lines.push('---', '');
  return lines.join('\n');
}

function renderGroupedProcessMd(key: string, flows: FlowDoc[], triggerMap: Map<string, string>): string {
  const displayName = key.split(/[./\\]/).filter(Boolean).pop() ?? key;
  const subNames = flows.map(f => f.id.includes('/') ? f.id.split('/').slice(1).join('/') : f.name).join(', ');
  const totalActs  = flows.reduce((s, f) => s + f.activities.length, 0);
  const totalLinks = flows.reduce((s, f) => s + f.links.length, 0);

  const lines: string[] = [
    `### ${escMd(displayName)}`,
    '',
    `> **Process Group:** \`${key}\`  `,
    `> **Sub-handlers:** ${subNames}  `,
    `> **Total Activities:** ${totalActs} | **Total Transitions:** ${totalLinks}`,
    '',
  ];

  for (const flow of flows) {
    lines.push(renderProcessMd(flow, triggerMap, `processes/${safeId(flow.id)}.svg`, 4));
  }
  return lines.join('\n');
}

// ─── Main renderer ─────────────────────────────────────────────────────────────

export function renderBW6Markdown(model: DocModel, outputDir: string, options?: { bw6Icons?: BW6IconRegistry }): void {
  setIconRegistry(options?.bw6Icons);
  const { app, flows, triggers, connections, properties, schemas, specs } = model;
  const sharedLibs = model.bw6SharedLibs ?? [];
  const profileProperties = model.profileProperties ?? {};
  const profileNames = Object.keys(profileProperties);
  const violations = model.violations ?? [];
  const restBindings = model.restBindings ?? [];
  const crossRefs = model.crossRefs;

  // Build trigger → flow map for process starter labels
  const triggerMap = new Map<string, string>();
  for (const t of triggers) {
    for (const h of t.handlers) {
      if (h.flowRef) triggerMap.set(h.flowRef, t.ref ?? '');
    }
    // Also map by trigger name itself (used as process starter in BW6 BPEL)
    triggerMap.set(t.name, t.ref ?? '');
  }

  const description = app.description || generateAppDescription(model);
  const generatedAt = new Date(model.generatedAt).toLocaleString();
  const totalActivities = flows.reduce((n, f) => n + f.activities.length, 0);
  const processGroupCount = groupFlowsByParent(flows).size;
  const allLibFlows = sharedLibs.flatMap(l => l.flows);
  const allLibConns = sharedLibs.flatMap(l => l.connections);

  // Write SVG diagram files alongside the markdown
  const processesDir = path.join(outputDir, 'processes');
  if (flows.length > 0) fs.mkdirSync(processesDir, { recursive: true });
  const archSvg = renderArchDiagramSVG(model);
  fs.writeFileSync(path.join(outputDir, 'arch-diagram.svg'), archSvg, 'utf8');
  for (const flow of flows) {
    const svg = renderBW6FlowSVG(flow, { activityLinks: false, iconRegistry: getIconRegistry() });
    fs.writeFileSync(path.join(processesDir, `${safeId(flow.id)}.svg`), svg, 'utf8');
  }
  // SharedLib process SVGs
  for (const lib of sharedLibs) {
    const libDir = path.join(outputDir, 'sharedlibs', safeId(lib.id), 'processes');
    fs.mkdirSync(libDir, { recursive: true });
    for (const flow of lib.flows) {
      const svg = renderBW6FlowSVG(flow, { activityLinks: false, iconRegistry: getIconRegistry() });
      fs.writeFileSync(path.join(libDir, `${safeId(flow.id)}.svg`), svg, 'utf8');
    }
  }

  const lines: string[] = [
    `# ${app.name}`,
    '',
    `> ${description}`,
    '',
    `**Version:** ${app.version}  `,
    `**Product:** TIBCO BusinessWorks 6  `,
    `**Generated:** ${generatedAt}  `,
    `**Processes:** ${processGroupCount}  `,
    `**Activities:** ${totalActivities}  `,
    `**Shared Resources:** ${connections.length}  `,
    '',
    '---',
    '',
    buildTOC(model),
    '---',
    '',
    '## Application Architecture',
    '',
    '![Application Architecture Diagram](arch-diagram.svg)',
    '',
    '---',
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|---|---|',
    `| Processes | ${processGroupCount} |`,
    `| Process Starters | ${triggers.length} |`,
    `| Shared Resources | ${connections.length} |`,
    `| Module Properties | ${properties.length} |`,
    `| Schemas (XSD) | ${schemas.length} |`,
    `| Service Descriptors | ${specs.length} |`,
    `| Shared Libraries | ${sharedLibs.length} |`,
    `| Total Activities | ${totalActivities} |`,
    '',
    '---',
    '',
    '## Processes',
    '',
  ];

  if (flows.length === 0) {
    lines.push('_No processes defined._', '');
  } else {
    // Process index table — one row per group (same grouping as HTML)
    const processGroups = groupFlowsByParent(flows);
    lines.push('| Process | Starter Type | Activities | Transitions | Description |');
    lines.push('|---|---|---|---|---|');
    for (const [key, groupFlows] of processGroups) {
      const isGrouped = groupFlows.length > 1 || groupFlows[0].id !== key;
      if (isGrouped) {
        const displayName = key.split(/[./\\]/).filter(Boolean).pop() ?? key;
        const subNames = groupFlows.map(f => f.id.includes('/') ? f.id.split('/').slice(1).join('/') : f.name).join(', ');
        const totalActs  = groupFlows.reduce((s, f) => s + f.activities.length, 0);
        const totalLinks = groupFlows.reduce((s, f) => s + f.links.length, 0);
        lines.push(`| \`${esc(displayName)}\` (${esc(subNames)}) | — | ${totalActs} | ${totalLinks} | Composite process |`);
      } else {
        const flow = groupFlows[0];
        const starterRef = triggerMap.get(flow.id) ?? triggerMap.get(flow.name) ?? '';
        const starterLabel = starterRef ? humanizeType(starterRef) : '—';
        lines.push(`| \`${esc(flow.id)}\` | ${starterLabel} | ${flow.activities.length} | ${flow.links.length} | ${esc(flow.description || '—')} |`);
      }
    }
    lines.push('', '---', '');

    // Per-process details
    for (const [key, groupFlows] of processGroups) {
      const isGrouped = groupFlows.length > 1 || groupFlows[0].id !== key;
      if (isGrouped) {
        lines.push(renderGroupedProcessMd(key, groupFlows, triggerMap));
      } else {
        lines.push(renderProcessMd(groupFlows[0], triggerMap, `processes/${safeId(groupFlows[0].id)}.svg`));
      }
    }
  }

  // Shared Library processes
  if (allLibFlows.length > 0) {
    lines.push('## Shared Library Processes', '');
    for (const lib of sharedLibs) {
      if (lib.flows.length === 0) continue;
      lines.push(`### ${escMd(lib.name)} (v${lib.version})`, '');
      if (lib.description) lines.push(`> ${lib.description}`, '');
      for (const flow of lib.flows) {
        lines.push(renderProcessMd(flow, triggerMap, `sharedlibs/${safeId(lib.id)}/processes/${safeId(flow.id)}.svg`));
      }
    }
    lines.push('---', '');
  }

  // Shared Resources
  lines.push('## Shared Resources', '');
  const allConns = [...connections, ...allLibConns];
  if (allConns.length === 0) {
    lines.push('_No shared resources defined._', '');
  } else {
    for (const c of allConns) {
      lines.push(`### ${escMd(c.name)}`, '');
      lines.push(`**Type:** ${escMd(c.type)}${c.description ? `  \n**Description:** ${escMd(c.description)}` : ''}`, '');
      const entries = Object.entries(c.settings ?? {}).filter(([, v]) => v != null && String(v).trim() !== '');
      if (entries.length > 0) {
        lines.push('| Property | Value |');
        lines.push('|---|---|');
        for (const [k, v] of entries) {
          lines.push(`| \`${esc(k)}\` | ${renderSubstValue(String(v))} |`);
        }
        lines.push('');
      }
    }
  }

  lines.push('---', '');

  // Module Properties (default profile)
  lines.push('## Module Properties', '');
  if (properties.length === 0) {
    lines.push('_No module properties defined._', '');
  } else {
    lines.push('| Name | Type | Value | Description |');
    lines.push('|---|---|---|---|');
    for (const p of properties) {
      lines.push(`| ${esc(p.name || '—')} | \`${esc(p.type)}\` | ${renderSubstValue(p.value)} | ${esc(p.description || '—')} |`);
    }
    lines.push('');
  }

  // Per-profile overrides
  if (profileNames.length > 0) {
    lines.push('### Profile Overrides', '');
    for (const profileName of profileNames) {
      const profileProps = profileProperties[profileName] ?? [];
      if (profileProps.length === 0) continue;
      lines.push(`#### Profile: ${escMd(profileName)}`, '');
      lines.push('| Name | Type | Value |');
      lines.push('|---|---|---|');
      for (const p of profileProps) {
        lines.push(`| ${esc(p.name || '—')} | \`${esc(p.type)}\` | ${renderSubstValue(p.value)} |`);
      }
      lines.push('');
    }
  }

  lines.push('---', '');

  // Schemas (XSD)
  lines.push('## Schemas (XSD)', '');
  if (schemas.length === 0) {
    lines.push('_No XSD schemas found in Schemas/ directory._', '');
  } else {
    for (const s of schemas) {
      const nsMatch = s.value.match(/targetNamespace\s*=\s*["']([^"']+)["']/);
      const ns = nsMatch ? nsMatch[1] : null;
      lines.push(`### ${escMd(s.name)}`, '');
      if (ns) lines.push(`**Namespace:** \`${esc(ns)}\``, '');
      // Extract xs:element declarations and show as a field table
      const elementRe = /<(?:xs|xsd):element\b([^/>]*(?:\/(?!>)[^/>]*)*)(?:\/>|>)/g;
      let em: RegExpExecArray | null;
      const elements: Array<{ name: string; type: string; min: string; max: string }> = [];
      while ((em = elementRe.exec(s.value)) !== null) {
        const attrs = em[1];
        const name = attrs.match(/\bname=["']([^"']+)["']/)?.[1] ?? '';
        const type = (attrs.match(/\btype=["']([^"']+)["']/)?.[1] ?? '').replace(/^(?:xs|xsd):/, '');
        const min  = attrs.match(/\bminOccurs=["']([^"']+)["']/)?.[1] ?? '1';
        const max  = attrs.match(/\bmaxOccurs=["']([^"']+)["']/)?.[1] ?? '1';
        if (name) elements.push({ name, type, min, max });
      }
      if (elements.length > 0) {
        lines.push('| Element | Type | Required | Repeats |');
        lines.push('|---|---|---|---|');
        for (const el of elements) {
          lines.push(`| \`${esc(el.name)}\` | ${esc(el.type || '—')} | ${el.min === '0' ? 'No' : 'Yes'} | ${el.max === 'unbounded' ? 'Yes (unbounded)' : el.max === '1' ? 'No' : el.max} |`);
        }
        lines.push('');
      } else {
        lines.push('_No element declarations found._', '');
      }
    }
  }

  lines.push('---', '');

  // Service Descriptors (WSDL / OpenAPI)
  lines.push('## Service Descriptors', '');
  if (specs.length === 0) {
    lines.push('_No service descriptors found in Service Descriptors/ directory._', '');
  } else {
    lines.push('| Name | Type | Title | Version | Base Path |');
    lines.push('|---|---|---|---|---|');
    for (const s of specs) {
      lines.push(`| ${esc(s.name)} | ${esc(s.type.toUpperCase())} | ${esc(s.title || '—')} | ${esc(s.version || '—')} | ${esc(s.basePath || '—')} |`);
    }
    lines.push('');

    // Per-spec details — inline (no <details>, so visible in PDF)
    for (const s of specs) {
      lines.push(`### ${escMd(s.title || s.name)}`, '');
      if (s.wsdlTargetNamespace) lines.push(`**Namespace:** \`${esc(s.wsdlTargetNamespace)}\``, '');
      if (s.basePath) lines.push(`**Base Path:** \`${esc(s.basePath)}\``, '');

      // WSDL: show port types and operations
      if (s.wsdlPortTypes && s.wsdlPortTypes.length > 0) {
        for (const pt of s.wsdlPortTypes) {
          lines.push(`#### Port Type: ${escMd(pt.name)}`, '');
          lines.push('| Operation | Input | Output | Fault |');
          lines.push('|---|---|---|---|');
          for (const op of pt.operations) {
            lines.push(`| ${esc(op.name)} | ${esc(op.input || '—')} | ${esc(op.output || '—')} | ${esc(op.fault || '—')} |`);
          }
          lines.push('');
        }
      } else if (s.endpoints && s.endpoints.length > 0) {
        // OpenAPI / Swagger: list endpoint paths
        lines.push('| Endpoint |');
        lines.push('|---|');
        for (const ep of s.endpoints) {
          lines.push(`| \`${esc(ep)}\` |`);
        }
        lines.push('');
      }
    }
  }

  lines.push('---', '');

  // Process Starters (Triggers)
  if (triggers.length > 0) {
    lines.push('## Process Starters', '');
    lines.push('| Name | Type | Process |');
    lines.push('|---|---|---|');
    for (const t of triggers) {
      for (const h of t.handlers) {
        lines.push(`| ${esc(t.name)} | ${humanizeType(t.ref)} | \`${esc(h.flowRef)}\` |`);
      }
    }
    lines.push('', '---', '');
  }

  // Palettes / Installed Plugins
  if (app.imports && app.imports.length > 0) {
    lines.push('## Installed Palettes', '');
    lines.push('| Bundle | Version |');
    lines.push('|---|---|');
    for (const imp of app.imports) {
      const [bundle, ...rest] = imp.split(';');
      const versionPart = rest.find(r => r.includes('bundle-version') || r.includes('version'));
      const version = versionPart ? versionPart.replace(/bundle-version=|version=/g, '').replace(/['"\[\]]/g, '').trim() : '—';
      lines.push(`| \`${esc(bundle.trim())}\` | ${esc(version)} |`);
    }
    lines.push('');
  }

  // API Surface
  if (restBindings.length > 0) {
    lines.push(renderApiSurfaceMd(restBindings));
  }

  // QA Analysis
  if (violations.length > 0) {
    lines.push(renderQAMd(violations, model.product));
  }

  // Cross-References
  if (crossRefs) {
    const section = renderCrossRefsMd(crossRefs);
    if (section) lines.push(section);
  }

  fs.writeFileSync(path.join(outputDir, 'index.md'), lines.join('\n'), 'utf8');
}
