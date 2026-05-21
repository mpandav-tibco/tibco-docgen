import * as path from 'path';
import * as fs from 'fs';
import { DocModel, FlowDoc, ActivityDoc, QAViolation, CrossRefDoc } from '../model';
import { BW6IconRegistry } from '../bw6-icons';
import { renderBW6Markdown } from './markdown-bw6';
import { renderFlowSVG } from '../svg/flow-renderer';
import { renderArchDiagramSVG } from './bw6/overview';
import { humanizeType, paletteFromType, safeId } from './bw6/helpers';

function esc(s: string): string {
  return String(s).replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escMd(s: string): string {
  return String(s).replace(/[[\]`*_\\]/g, '\\$&');
}

function tocAnchor(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
}

// ─── App description generator ───────────────────────────────────────────────

function generateFlogoAppDescription(model: DocModel): string {
  const appName = model.app.name.trim();

  const triggerRefs = model.triggers.map(t => (t.ref ?? '').toLowerCase());
  let integrationPattern = 'integration';
  let triggerDesc = '';
  if (triggerRefs.some(r => r.includes('kafka'))) {
    integrationPattern = 'event-driven integration';
    triggerDesc = 'consumes messages from Apache Kafka topics';
  } else if (triggerRefs.some(r => r.includes('rest') || r.includes('http'))) {
    integrationPattern = 'REST API service';
    triggerDesc = 'exposes REST/HTTP endpoints';
  } else if (triggerRefs.some(r => r.includes('timer') || r.includes('cron'))) {
    integrationPattern = 'scheduled integration';
    triggerDesc = 'runs on a scheduled timer';
  } else if (triggerRefs.some(r => r.includes('ems') || r.includes('jms'))) {
    integrationPattern = 'messaging integration';
    triggerDesc = 'consumes messages from EMS/JMS';
  }

  const connRefs = model.connections.map(c => (c.ref ?? c.type ?? '').toLowerCase());
  const datastoreDescs: string[] = [];
  if (connRefs.some(r => r.includes('jdbc') || r.includes('sql') || r.includes('postgres') || r.includes('mysql'))) {
    datastoreDescs.push('a SQL database via JDBC');
  }
  if (connRefs.some(r => r.includes('kafka'))) datastoreDescs.push('Apache Kafka messaging');
  if (connRefs.some(r => r.includes('ems') || r.includes('jms'))) datastoreDescs.push('EMS/JMS messaging');

  let sentence1 = `${appName} is a TIBCO Flogo ${integrationPattern}`;
  if (triggerDesc) sentence1 += ` that ${triggerDesc}`;
  if (datastoreDescs.length > 0) sentence1 += ` and integrates with ${datastoreDescs.join(' and ')}`;
  sentence1 += '.';

  const sentence2 = `The application implements ${model.flows.length} flow${model.flows.length !== 1 ? 's' : ''} with a total of ${model.flows.reduce((n, f) => n + f.activities.length, 0)} activit${model.flows.reduce((n, f) => n + f.activities.length, 0) !== 1 ? 'ies' : 'y'}.`;

  return `${sentence1} ${sentence2}`;
}

// ─── Table of Contents ────────────────────────────────────────────────────────

function buildTOC(model: DocModel): string {
  const { flows, triggers, connections, properties, violations, crossRefs } = model;

  const lines: string[] = ['## Table of Contents', ''];
  let n = 1;

  lines.push(`${n++}. [Application Architecture](#application-architecture)`);
  lines.push(`${n++}. [Summary](#summary)`);
  lines.push(`${n++}. [Triggers](#triggers)`);
  lines.push(`${n++}. [Flows](#flows)`);
  for (const flow of flows) {
    lines.push(`   - [${escMd(flow.name)}](#${tocAnchor(flow.name)})`);
  }
  if (connections.length > 0)  lines.push(`${n++}. [Connections](#connections)`);
  if (properties.length > 0)   lines.push(`${n++}. [App Properties](#app-properties)`);
  if (model.app.imports?.length) lines.push(`${n++}. [Imports](#imports)`);

  if (violations?.length) {
    const errs   = violations.filter(v => v.severity === 'error').length;
    const warns  = violations.filter(v => v.severity === 'warning').length;
    const badge  = errs > 0 ? ` — ${errs} error${errs !== 1 ? 's' : ''}` : warns > 0 ? ` — ${warns} warning${warns !== 1 ? 's' : ''}` : '';
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

// ─── Activity config + mappings ───────────────────────────────────────────────

function renderActivityConfigMd(act: ActivityDoc): string {
  const parts: string[] = [];

  const settingsEntries = Object.entries(act.settings ?? {})
    .filter(([, v]) => v != null && String(v).trim() !== '');
  if (settingsEntries.length > 0) {
    const rows = settingsEntries.map(([k, v]) =>
      `| \`${esc(k)}\` | \`${esc(String(v))}\` |`
    );
    parts.push(`**Configuration**\n\n| Property | Value |\n|---|---|\n${rows.join('\n')}`);
  }

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

// ─── Flow section ─────────────────────────────────────────────────────────────

function renderFlowMd(flow: FlowDoc, svgRelPath?: string): string {
  const lines: string[] = [
    `### ${escMd(flow.name)}`,
    '',
    `> **Flow ID:** \`${flow.id}\`  `,
    `> **Activities:** ${flow.activities.length} | **Transitions:** ${flow.links.length}`,
    '',
  ];

  if (flow.description) lines.push(`${escMd(flow.description)}`, '');

  if (svgRelPath) {
    lines.push('#### Flow Diagram', '', `![${escMd(flow.name)} Diagram](${svgRelPath})`, '');
  }

  // Input/Output parameter tables
  if (flow.metadata?.input?.length) {
    lines.push('#### Input Parameters', '');
    lines.push('| Name | Type | Required |');
    lines.push('|---|---|---|');
    for (const f of flow.metadata.input) {
      lines.push(`| ${esc(f.name)} | \`${esc(f.type)}\` | ${f.required ? 'Yes' : 'No'} |`);
    }
    lines.push('');
  }

  if (flow.metadata?.output?.length) {
    lines.push('#### Output Parameters', '');
    lines.push('| Name | Type |');
    lines.push('|---|---|');
    for (const f of flow.metadata.output) {
      lines.push(`| ${esc(f.name)} | \`${esc(f.type)}\` |`);
    }
    lines.push('');
  }

  // Activities table
  lines.push('#### Activities', '');
  lines.push('| # | Name | Palette | Type | Description |');
  lines.push('|---|---|---|---|---|');
  flow.activities.forEach((act, i) => {
    const palette = paletteFromType(act.ref);
    const hType = humanizeType(act.ref);
    lines.push(`| ${i + 1} | ${esc(act.name)} | ${palette} | ${hType} | ${esc(act.description || '—')} |`);
  });
  lines.push('');

  // Activity config details
  const configActs = flow.activities.filter(a =>
    Object.keys(a.settings ?? {}).length + Object.keys(a.input ?? {}).length > 0
  );
  if (configActs.length > 0) {
    lines.push('<details>');
    lines.push('<summary>Activity Configuration Details</summary>', '');
    for (const act of configActs) {
      lines.push(`**${escMd(act.name)}** — ${humanizeType(act.ref)}`, '');
      const cfgTable = renderActivityConfigMd(act);
      if (cfgTable) lines.push(cfgTable, '');
    }
    lines.push('</details>', '');
  }

  // Transitions table
  if (flow.links.length > 0) {
    lines.push('#### Transitions', '');
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

// ─── QA section ───────────────────────────────────────────────────────────────

function renderQAMd(violations: QAViolation[]): string {
  if (violations.length === 0) return '';

  let errs = 0, warns = 0, infos = 0;
  for (const v of violations) {
    if (v.severity === 'error') errs++;
    else if (v.severity === 'warning') warns++;
    else infos++;
  }

  const summaryParts: string[] = [];
  if (errs)  summaryParts.push(`**${errs} error${errs !== 1 ? 's' : ''}**`);
  if (warns) summaryParts.push(`**${warns} warning${warns !== 1 ? 's' : ''}**`);
  if (infos) summaryParts.push(`${infos} info`);

  const sevIcon = (s: string) => s === 'error' ? '🔴 ERROR' : s === 'warning' ? '🟡 WARNING' : 'ℹ️ INFO';

  const lines: string[] = [
    '## QA Analysis',
    '',
    summaryParts.join(' · '),
    '',
    '> ℹ Rules are based on the [TIBCO Flogo Sonar Plugin](https://github.com/mpandav-tibco/flogo-sonar) — open-source static analysis for Flogo quality, security and maintainability.',
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
    crossRefTable('Flow → Resource Dependencies',   'Flow',         'Resources Used',   crossRefs.processUsesResource,   false),
    crossRefTable('Resource → Flow Usage',          'Resource',     'Used By',          crossRefs.resourceUsedByProcess, true),
    crossRefTable('Flow → Sub-Flow Calls',          'Caller Flow',  'Called Flows',     crossRefs.processCallsProcess,   true),
    crossRefTable('Flow → Callers',                 'Flow',         'Called By',        crossRefs.processCalledBy,       true),
  ].filter(s => s.length > 0);

  if (sections.length === 0) return '';
  return ['## Cross-References', '', ...sections.flat(), '---', ''].join('\n');
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export function renderMarkdown(model: DocModel, outputDir: string, options?: { bw6Icons?: BW6IconRegistry }): void {
  if (model.product === 'bw6') { renderBW6Markdown(model, outputDir, options); return; }

  const { app, flows, triggers, connections, properties, violations, crossRefs } = model;
  const totalActivities = flows.reduce((n, f) => n + f.activities.length, 0);
  const generatedAt = new Date(model.generatedAt).toLocaleString();
  const description = app.description || generateFlogoAppDescription(model);

  // Write arch diagram and flow SVGs
  const archSvg = renderArchDiagramSVG(model);
  fs.writeFileSync(path.join(outputDir, 'arch-diagram.svg'), archSvg, 'utf8');

  const processesDir = path.join(outputDir, 'processes');
  if (flows.length > 0) fs.mkdirSync(processesDir, { recursive: true });
  for (const flow of flows) {
    const svg = renderFlowSVG(flow);
    fs.writeFileSync(path.join(processesDir, `${safeId(flow.id)}.svg`), svg, 'utf8');
  }

  const lines: string[] = [
    `# ${app.name}`,
    '',
    `> ${description}`,
    '',
    `**Version:** ${app.version}  `,
    `**Product:** TIBCO Flogo  `,
    app.appModel ? `**App Model:** ${app.appModel}  ` : '',
    `**Generated:** ${generatedAt}  `,
    `**Flows:** ${flows.length}  `,
    `**Activities:** ${totalActivities}  `,
    `**Connections:** ${connections.length}  `,
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
    `| Flows | ${flows.length} |`,
    `| Triggers | ${triggers.length} |`,
    `| Connections | ${connections.length} |`,
    `| App Properties | ${properties.length} |`,
    `| Total Activities | ${totalActivities} |`,
    '',
    '---',
    '',
    '## Triggers',
    '',
  ];

  if (triggers.length) {
    lines.push('| Trigger | Type | Handler | Flow |');
    lines.push('|---|---|---|---|');
    for (const t of triggers) {
      for (const h of t.handlers) {
        lines.push(`| ${esc(t.name)} | \`${esc(humanizeType(t.ref))}\` | ${esc(h.name)} | \`${esc(h.flowRef)}\` |`);
      }
    }
    lines.push('');

    // Trigger settings details
    const triggersWithSettings = triggers.filter(t => t.settings && Object.keys(t.settings).length > 0);
    if (triggersWithSettings.length > 0) {
      lines.push('<details>');
      lines.push('<summary>Trigger Configuration Details</summary>', '');
      for (const t of triggersWithSettings) {
        lines.push(`**${escMd(t.name)}** (${humanizeType(t.ref)})`, '');
        const entries = Object.entries(t.settings ?? {}).filter(([, v]) => v != null && String(v).trim() !== '');
        if (entries.length > 0) {
          lines.push('| Property | Value |');
          lines.push('|---|---|');
          for (const [k, v] of entries) {
            lines.push(`| \`${esc(k)}\` | \`${esc(String(v))}\` |`);
          }
          lines.push('');
        }
      }
      lines.push('</details>', '');
    }
  } else {
    lines.push('_No triggers defined._', '');
  }

  lines.push('---', '', '## Flows', '');

  if (flows.length === 0) {
    lines.push('_No flows defined._', '');
  } else {
    // Flow index table
    lines.push('| Flow | Activities | Transitions | Description |');
    lines.push('|---|---|---|---|');
    for (const flow of flows) {
      lines.push(`| \`${esc(flow.id)}\` | ${flow.activities.length} | ${flow.links.length} | ${esc(flow.description || '—')} |`);
    }
    lines.push('', '---', '');

    for (const flow of flows) {
      lines.push(renderFlowMd(flow, `processes/${safeId(flow.id)}.svg`));
    }
  }

  // Connections
  if (connections.length) {
    lines.push('---', '', '## Connections', '');
    lines.push('| Name | Type | Ref | Description |');
    lines.push('|---|---|---|---|');
    for (const c of connections) {
      lines.push(`| ${esc(c.name)} | ${esc(c.type)} | \`${esc(c.ref)}\` | ${esc(c.description || '—')} |`);
    }
    lines.push('');

    const withSettings = connections.filter(c => c.settings && Object.keys(c.settings).length > 0);
    if (withSettings.length > 0) {
      lines.push('<details>');
      lines.push('<summary>Connection Configuration Details</summary>', '');
      for (const c of withSettings) {
        lines.push(`**${escMd(c.name)}** (${escMd(c.type)})`, '');
        const entries = Object.entries(c.settings ?? {}).filter(([, v]) => v != null && String(v).trim() !== '');
        if (entries.length > 0) {
          lines.push('| Property | Value |');
          lines.push('|---|---|');
          for (const [k, v] of entries) {
            lines.push(`| \`${esc(k)}\` | \`${esc(String(v))}\` |`);
          }
          lines.push('');
        }
      }
      lines.push('</details>', '');
    }
  }

  // App Properties
  if (properties.length) {
    lines.push('---', '', '## App Properties', '');
    lines.push('| Name | Type | Value |');
    lines.push('|---|---|---|');
    for (const p of properties) {
      lines.push(`| ${esc(p.name)} | \`${esc(p.type)}\` | ${p.value !== undefined ? `\`${esc(String(p.value))}\`` : '—'} |`);
    }
    lines.push('');
  }

  // Imports
  if (app.imports?.length) {
    lines.push('---', '', '## Imports', '');
    for (const i of app.imports) {
      lines.push(`- \`${esc(i)}\``);
    }
    lines.push('');
  }

  // QA Analysis
  if (violations?.length) {
    lines.push('---', '');
    lines.push(renderQAMd(violations));
  }

  // Cross-References
  if (crossRefs) {
    const section = renderCrossRefsMd(crossRefs);
    if (section) lines.push('---', '', section);
  }

  fs.writeFileSync(path.join(outputDir, 'index.md'), lines.join('\n'), 'utf8');
}
