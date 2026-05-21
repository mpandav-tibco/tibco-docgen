import { DocModel } from '../../model';
import { BW6_CSS, BW6_JS } from './css';
import { escHtml } from './helpers';
import { renderSidebar, extractTagMeta, deploymentTargetTopbar } from './sidebar';

export function page(model: DocModel, activePage: string, content: string, pathPrefix = ''): string {
  const rawSidebar = renderSidebar(model, activePage);
  const sidebar = rawSidebar.replace(/href="([^"#][^"]*)"/g, (_m, href) => {
    if (href.startsWith('http')) return `href="${href}"`;
    return `href="${pathPrefix}${href}"`;
  });

  const { edition } = extractTagMeta(model);
  const edgBadgeCls = (edition === 'BWCE' || edition === 'bwcf') ? 'edition-badge-bwce' : 'edition-badge';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escHtml(model.app.name)} — DocGen</title>
  ${BW6_CSS}
</head>
<body>
<div class="shell" id="shell">
${sidebar}
<div class="sidebar-drag" id="sidebarDrag" title="Drag to resize sidebar"></div>
<div class="main">
  <div class="topbar">
    <div class="topbar-brand">
      <span class="brand-icon">⚡</span>
      <div class="brand-wordmark">
        <span class="brand-name">DocGen</span>
        <span class="brand-tagline">Integration Docs</span>
      </div>
    </div>
    <div class="topbar-meta">
      ${deploymentTargetTopbar(model)}
      <span class="${edgBadgeCls}">TIBCO ${escHtml(edition)}</span>
    </div>
  </div>
  <div class="content">${content}</div>
</div>
</div>
${BW6_JS}
</body>
</html>`;
}

export function generateAppDescription(model: DocModel): string {
  const appName = model.app.name.replace(/\s+Module\s*$/i, '').trim() || model.app.name;

  // Detect integration pattern from trigger refs
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

  // Detect data stores / messaging from connection refs
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

  // Build sentence 1
  let sentence1 = `${appName} is a TIBCO BusinessWorks ${integrationPattern}`;
  if (triggerDesc) sentence1 += ` that ${triggerDesc}`;
  if (datastoreDescs.length > 0) {
    sentence1 += ` and integrates with ${datastoreDescs.join(' and ')}`;
  }
  sentence1 += '.';

  // Build sentence 2
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
