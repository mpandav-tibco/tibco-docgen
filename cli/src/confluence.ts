import { DocModel, renderArchDiagramSVG, renderBW6FlowSVG } from '@tibco-docgen/core';

export interface ConfluenceOptions {
  url: string;         // e.g. https://mycompany.atlassian.net/wiki
  spaceKey: string;    // e.g. TECH
  token: string;       // Atlassian API token (email:token for cloud, PAT for DC)
  parentId?: string;   // Parent page ID (optional; creates at space root if omitted)
  user?: string;       // For Cloud: user email. For DC: leave empty (PAT only)
}

interface PageInfo { id: string; version: number; }

// ─── REST helpers ─────────────────────────────────────────────────────────────

function authHeader(opts: ConfluenceOptions): string {
  if (opts.user) {
    return 'Basic ' + Buffer.from(`${opts.user}:${opts.token}`).toString('base64');
  }
  return `Bearer ${opts.token}`;
}

async function apiGet(url: string, opts: ConfluenceOptions): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: authHeader(opts), Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiPost(url: string, body: unknown, opts: ConfluenceOptions): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader(opts), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiPut(url: string, body: unknown, opts: ConfluenceOptions): Promise<unknown> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: authHeader(opts), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function findPage(title: string, spaceKey: string, opts: ConfluenceOptions): Promise<PageInfo | null> {
  const url = `${opts.url}/rest/api/content?spaceKey=${encodeURIComponent(spaceKey)}&title=${encodeURIComponent(title)}&expand=version`;
  const data = (await apiGet(url, opts)) as { results: Array<{ id: string; version: { number: number } }> };
  if (data.results.length === 0) return null;
  return { id: data.results[0].id, version: data.results[0].version.number };
}

async function upsertPage(
  title: string,
  bodyValue: string,
  spaceKey: string,
  parentId: string | undefined,
  opts: ConfluenceOptions,
): Promise<string> {
  const existing = await findPage(title, spaceKey, opts);
  const body = {
    type: 'page',
    title,
    space: { key: spaceKey },
    ...(parentId ? { ancestors: [{ id: parentId }] } : {}),
    body: { storage: { value: bodyValue, representation: 'storage' } },
  };

  if (existing) {
    await apiPut(`${opts.url}/rest/api/content/${existing.id}`, { ...body, version: { number: existing.version + 1 } }, opts);
    return existing.id;
  }
  const created = (await apiPost(`${opts.url}/rest/api/content`, body, opts)) as { id: string };
  return created.id;
}

async function uploadAttachment(pageId: string, filename: string, svgContent: string, opts: ConfluenceOptions): Promise<void> {
  const boundary = '----ConfluenceAttachmentBoundary';
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: image/svg+xml`,
    '',
    svgContent,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(`${opts.url}/rest/api/content/${pageId}/child/attachment`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(opts),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'X-Atlassian-Token': 'no-check',
    },
    body,
  });
  if (!res.ok) {
    // Ignore 400 "already exists" — Confluence updates the attachment automatically when re-posted with same filename
    const text = await res.text();
    if (!text.includes('already attached')) throw new Error(`Upload ${filename} → ${res.status}: ${text}`);
  }
}

// ─── CSF (Confluence Storage Format) builders ────────────────────────────────

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function svgAttachRef(filename: string): string {
  return `<ac:image ac:width="700"><ri:attachment ri:filename="${esc(filename)}" /></ac:image>`;
}

function table(headers: string[], rows: string[][]): string {
  const head = `<tr>${headers.map(h => `<th><strong>${esc(h)}</strong></th>`).join('')}</tr>`;
  const body = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table><tbody>${head}${body}</tbody></table>`;
}

function expandSection(label: string, content: string): string {
  return `<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">${esc(label)}</ac:parameter><ac:rich-text-body>${content}</ac:rich-text-body></ac:structured-macro>`;
}

function buildOverviewCSF(model: DocModel): string {
  const flows = model.flows;
  const totalActs = flows.reduce((n, f) => n + f.activities.length, 0);
  const sharedLibs = model.bw6SharedLibs ?? [];

  const summaryTable = table(
    ['Metric', 'Count'],
    [
      ['Processes', `${flows.length}`],
      ['Process Starters', `${model.triggers.length}`],
      ['Shared Resources', `${model.connections.length}`],
      ['Module Properties', `${model.properties.length}`],
      ['Schemas (XSD)', `${model.schemas.length}`],
      ['Service Descriptors', `${model.specs.length}`],
      ['Shared Libraries', `${sharedLibs.length}`],
      ['Total Activities', `${totalActs}`],
    ],
  );

  const processTable = table(
    ['Process', 'Activities', 'Transitions', 'Description'],
    flows.map(f => [esc(f.id), `${f.activities.length}`, `${f.links.length}`, esc(f.description || '—')]),
  );

  return [
    `<h1>${esc(model.app.name)}</h1>`,
    model.app.description ? `<p><em>${esc(model.app.description)}</em></p>` : '',
    `<p><strong>Version:</strong> ${esc(model.app.version)} | <strong>Product:</strong> TIBCO BusinessWorks 6 | <strong>Generated:</strong> ${new Date(model.generatedAt).toLocaleString()}</p>`,
    '<hr/>',
    '<h2>Application Architecture</h2>',
    svgAttachRef('arch-diagram.svg'),
    '<hr/>',
    '<h2>Summary</h2>',
    summaryTable,
    '<hr/>',
    '<h2>Processes</h2>',
    processTable,
  ].join('\n');
}

function buildProcessCSF(flow: { id: string; name: string; description: string; activities: Array<{ id: string; name: string; ref: string; description: string }>; links: Array<{ from: string; to: string; type: string; condition?: string }> }): string {
  const svgFile = `process-${flow.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.svg`;
  const actTable = table(
    ['#', 'Name', 'Type', 'Description'],
    flow.activities.map((a, i) => [
      `${i + 1}`,
      esc(a.name),
      esc(a.ref.split('.').pop()?.replace(/Activity$/, '') ?? a.ref),
      esc(a.description || '—'),
    ]),
  );
  const transTable = table(
    ['From', 'To', 'Type', 'Condition'],
    flow.links.map(l => [esc(l.from), esc(l.to), esc(l.type), esc(l.condition || '—')]),
  );

  return [
    `<h1>${esc(flow.name)}</h1>`,
    flow.description ? `<p>${esc(flow.description)}</p>` : '',
    `<p><strong>Process ID:</strong> <code>${esc(flow.id)}</code> | <strong>Activities:</strong> ${flow.activities.length} | <strong>Transitions:</strong> ${flow.links.length}</p>`,
    '<h2>Process Flow Diagram</h2>',
    svgAttachRef(svgFile),
    '<h2>Activities</h2>',
    actTable,
    flow.links.length > 0 ? expandSection('Transitions', transTable) : '',
  ].join('\n');
}

function buildResourcesCSF(model: DocModel): string {
  if (model.connections.length === 0) return '<p><em>No shared resources defined.</em></p>';
  return [
    '<h2>Shared Resources</h2>',
    table(
      ['Name', 'Type', 'Description'],
      model.connections.map(c => [esc(c.name), esc(c.type || c.ref), esc(c.description || '—')]),
    ),
  ].join('\n');
}

function buildPropertiesCSF(model: DocModel): string {
  if (model.properties.length === 0) return '<p><em>No module properties defined.</em></p>';
  return [
    '<h2>Module Properties</h2>',
    table(
      ['Name', 'Type', 'Default Value'],
      model.properties.map(p => [esc(p.name), esc(p.type), p.value !== undefined ? `<code>${esc(String(p.value))}</code>` : '—']),
    ),
  ].join('\n');
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function exportToConfluence(
  model: DocModel,
  opts: ConfluenceOptions,
  log: (msg: string) => void,
): Promise<void> {
  log(`   Connecting to Confluence at ${opts.url}...\n`);

  // 1. Create/update the main overview page
  const overviewCSF = buildOverviewCSF(model);
  const mainTitle = `${model.app.name} — TIBCO App Documentation`;
  log(`   Upserting page: "${mainTitle}"...\n`);
  const mainPageId = await upsertPage(mainTitle, overviewCSF, opts.spaceKey, opts.parentId, opts);

  // 2. Upload arch diagram SVG as attachment to main page
  log('   Uploading arch-diagram.svg...\n');
  const archSvg = renderArchDiagramSVG(model);
  await uploadAttachment(mainPageId, 'arch-diagram.svg', archSvg, opts);

  // 3. Per-process child pages
  for (const flow of model.flows) {
    const flowSvg = renderBW6FlowSVG(flow, { activityLinks: false });
    const svgFile = `process-${flow.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.svg`;
    const processTitle = `${model.app.name} — ${flow.name}`;

    log(`   Upserting process page: "${processTitle}"...\n`);
    const pid = await upsertPage(processTitle, buildProcessCSF(flow), opts.spaceKey, mainPageId, opts);
    await uploadAttachment(pid, svgFile, flowSvg, opts);
  }

  // 4. Resources + Properties as child pages of main
  const resTitle = `${model.app.name} — Resources & Properties`;
  log(`   Upserting: "${resTitle}"...\n`);
  await upsertPage(resTitle, buildResourcesCSF(model) + buildPropertiesCSF(model), opts.spaceKey, mainPageId, opts);

  log(`   ✅ Confluence export complete. Main page ID: ${mainPageId}\n`);
  log(`   🌐 ${opts.url}/wiki/spaces/${opts.spaceKey}/pages/${mainPageId}\n`);
}
