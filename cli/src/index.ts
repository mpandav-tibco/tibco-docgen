#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { renderHTML, renderMarkdown, renderEMSHTML, DocModel } from '@tibco-docgen/core';
import { parseFlogoFile, canParse as canParseFlogo } from '@tibco-docgen/parser-flogo';
import { parseBW6App, parseBW6Ear, parseBW6Zip, canParse as canParseBW6, buildBW6IconRegistry, defaultBW6PluginsDirs } from '@tibco-docgen/parser-bw6';
import { parseEMSConfig, parseEMSFromRest, parseEMSFromAdmin, canParse as canParseEMS } from '@tibco-docgen/parser-ems';
import { startMcpServer } from './mcp';
import { startWatch } from './watch';
import { exportToPDF } from './pdf';
import { exportToConfluence } from './confluence';

const VERSION = '1.0.0';

function usage(): void {
  console.log(`
DocGen v${VERSION} — TIBCO Application Documentation Generator

Usage:
  docgen <input> [options]
  docgen --ems-rest <url> [options]
  docgen --ems-admin <server> [options]

Arguments:
  <input>   Path to a .flogo file, BW6 app directory, EMS config dir, or a directory of apps

Options:
  -o, --output <dir>         Output directory (default: ./docgen-out)
  -f, --format <fmt>         Output format: html, md, json, pdf, all (default: all)
  --no-open                  Don't open browser after generation
  -h, --help                 Show this help
  -v, --version              Show version

PDF Export (requires puppeteer — downloads Chromium on first use):
  --format pdf               Generate PDF (HTML is also generated as source)

Confluence Export:
  --confluence-url <url>     Confluence base URL (e.g. https://myco.atlassian.net/wiki)
  --confluence-space <key>   Space key (e.g. TECH)
  --confluence-token <tok>   API token (Atlassian Cloud) or PAT (Data Center)
  --confluence-user <email>  User email (Cloud only; omit for Data Center PAT auth)
  --confluence-parent <id>   Parent page ID (optional)

EMS Live Connection Options:
  --ems-rest <url>           Connect via EMS REST Proxy (e.g. http://localhost:9000)
  --ems-admin <server>       Connect via tibemsadmin CLI (e.g. tcp://localhost:7222)
  --ems-user <user>          Username for REST/admin connection (default: admin)
  --ems-password <pass>      Password for REST/admin connection
  --ems-ignore-ssl           Skip TLS certificate validation (REST mode)
  --ems-name <name>          Display name for the EMS instance (default: ems-server)

MCP Server Mode (AI/Agent integration):
  --mcp                      Start an MCP stdio server so AI agents (Claude, Cursor, etc.)
                             can call tibco-docgen tools directly without spawning a subprocess.
                             Configure in claude_desktop_config.json or any MCP host.

Supported inputs:
  .flogo               TIBCO Flogo application
  .ear                 TIBCO BW6/BWCE EAR archive
  .zip                 Zipped BW6 project folder
  <directory>          TIBCO BW6 app directory (Processes/*.bwp) or EMS config dir (tibemsd.conf)

Examples:
  docgen myapp.flogo
  docgen myapp.flogo -o ./docs
  docgen myapp.application_1.0.0.ear -o ./docs
  docgen ./bw6-app/ -o ./docs --format html
  docgen ./ems-config/ -o ./docs
  docgen --ems-rest http://ems-host:9000 --ems-user admin --ems-password secret -o ./docs
  docgen --ems-admin tcp://ems-host:7222 --ems-user admin --ems-password secret -o ./docs
  docgen ./apps/ -o ./docs
`);
}

interface InputEntry {
  type: 'flogo' | 'bw6' | 'ems';
  path: string;
  label: string;
}

function discoverInputs(inputPath: string): InputEntry[] {
  const stat = fs.statSync(inputPath);

  if (stat.isFile()) {
    if (canParseFlogo(inputPath)) {
      return [{ type: 'flogo', path: inputPath, label: path.basename(inputPath, '.flogo') }];
    }
    if (canParseBW6(inputPath)) {
      // .ear or .zip
      const stem = path.basename(inputPath, path.extname(inputPath));
      return [{ type: 'bw6', path: inputPath, label: stem }];
    }
    console.error(`Error: unsupported file type: ${inputPath}`);
    return [];
  }

  // Directory — check if it is an EMS config dir
  if (canParseEMS(inputPath)) {
    return [{ type: 'ems', path: inputPath, label: 'ems-config' }];
  }

  // Directory — check if it is itself a BW6 app
  if (canParseBW6(inputPath)) {
    return [{ type: 'bw6', path: inputPath, label: path.basename(inputPath) }];
  }

  // Otherwise scan for .flogo files, .ear/.zip archives, and BW6 sub-directories
  const entries: InputEntry[] = [];
  for (const entry of fs.readdirSync(inputPath)) {
    const full = path.join(inputPath, entry);
    const s = fs.statSync(full);
    if (s.isFile() && canParseFlogo(full)) {
      entries.push({ type: 'flogo', path: full, label: path.basename(full, '.flogo') });
    } else if (s.isFile() && canParseBW6(full)) {
      // .ear or .zip archive inside the directory
      entries.push({ type: 'bw6', path: full, label: path.basename(full, path.extname(full)) });
    } else if (s.isDirectory() && canParseBW6(full)) {
      entries.push({ type: 'bw6', path: full, label: entry });
    }
  }
  return entries;
}

interface ParsedArgs {
  input: string;
  output: string;
  format: 'html' | 'md' | 'json' | 'pdf' | 'all';
  open: boolean;
  watch: boolean;
  emsRest?: string;
  emsAdmin?: string;
  emsUser?: string;
  emsPassword?: string;
  emsIgnoreSsl?: boolean;
  emsName?: string;
  confluenceUrl?: string;
  confluenceSpace?: string;
  confluenceToken?: string;
  confluenceUser?: string;
  confluenceParent?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  if (!args.length || args[0] === '-h' || args[0] === '--help') {
    usage();
    process.exit(0);
  }
  if (args[0] === '-v' || args[0] === '--version') {
    console.log(`DocGen v${VERSION}`);
    process.exit(0);
  }

  let output = path.join(process.cwd(), 'docgen-out');
  let format: 'html' | 'md' | 'json' | 'pdf' | 'all' = 'all';
  let open = true;
  let watch = false;
  let emsRest: string | undefined;
  let emsAdmin: string | undefined;
  let emsUser: string | undefined;
  let emsPassword: string | undefined;
  let emsIgnoreSsl = false;
  let emsName: string | undefined;
  let confluenceUrl: string | undefined;
  let confluenceSpace: string | undefined;
  let confluenceToken: string | undefined;
  let confluenceUser: string | undefined;
  let confluenceParent: string | undefined;

  // First arg is input unless it's a flag
  let input = args[0].startsWith('--') ? '' : args[0];
  const startIdx = input ? 1 : 0;

  for (let i = startIdx; i < args.length; i++) {
    if ((args[i] === '-o' || args[i] === '--output') && args[i + 1]) {
      output = args[++i];
    } else if ((args[i] === '-f' || args[i] === '--format') && args[i + 1]) {
      const f = args[++i];
      if (f === 'html' || f === 'md' || f === 'json' || f === 'pdf' || f === 'all') format = f;
    } else if (args[i] === '--no-open') {
      open = false;
    } else if (args[i] === '--watch' || args[i] === '-w') {
      watch = true;
    } else if (args[i] === '--ems-rest' && args[i + 1]) {
      emsRest = args[++i];
    } else if (args[i] === '--ems-admin' && args[i + 1]) {
      emsAdmin = args[++i];
    } else if (args[i] === '--ems-user' && args[i + 1]) {
      emsUser = args[++i];
    } else if (args[i] === '--ems-password' && args[i + 1]) {
      emsPassword = args[++i];
    } else if (args[i] === '--ems-ignore-ssl') {
      emsIgnoreSsl = true;
    } else if (args[i] === '--ems-name' && args[i + 1]) {
      emsName = args[++i];
    } else if (args[i] === '--confluence-url' && args[i + 1]) {
      confluenceUrl = args[++i];
    } else if (args[i] === '--confluence-space' && args[i + 1]) {
      confluenceSpace = args[++i];
    } else if (args[i] === '--confluence-token' && args[i + 1]) {
      confluenceToken = args[++i];
    } else if (args[i] === '--confluence-user' && args[i + 1]) {
      confluenceUser = args[++i];
    } else if (args[i] === '--confluence-parent' && args[i + 1]) {
      confluenceParent = args[++i];
    }
  }
  return { input, output, format, open, watch, emsRest, emsAdmin, emsUser, emsPassword, emsIgnoreSsl, emsName, confluenceUrl, confluenceSpace, confluenceToken, confluenceUser, confluenceParent };
}

// ─── Programmatic API ─────────────────────────────────────────────────────────

export interface GenerateResult {
  success: boolean;
  /** Base output directory for the first (or only) app generated */
  outputDir: string;
  /** HTML sub-directory (outputDir/html/) — set when HTML was generated */
  htmlDir?: string;
  /** Error message if success is false */
  error?: string;
}

export interface EMSLiveOptions {
  rest?: string;
  admin?: string;
  user?: string;
  password?: string;
  ignoreSsl?: boolean;
  name?: string;
}

/**
 * Generate documentation for a TIBCO app without spawning a subprocess.
 * Called directly by the VS Code extension (in-process, no Node.js on PATH needed).
 */
export interface ConfluenceExportOptions {
  url: string;
  spaceKey: string;
  token: string;
  user?: string;
  parentId?: string;
}

export async function generateDocs(
  inputPath: string,
  outputDir: string,
  format: 'html' | 'md' | 'json' | 'pdf' | 'all',
  log: (msg: string) => void,
  emsLive?: EMSLiveOptions,
  confluenceOpts?: ConfluenceExportOptions,
): Promise<GenerateResult> {
  log(`\nDocGen v${VERSION}\n${'─'.repeat(50)}\n`);

  const bw6Icons = buildBW6IconRegistry(defaultBW6PluginsDirs());

  // ── EMS live mode (no file input required) ──────────────────────────────────
  if (emsLive?.rest || emsLive?.admin) {
    const appOut = outputDir;
    const label = emsLive.name ?? (emsLive.rest ?? emsLive.admin ?? 'ems-server');
    const modeTag = emsLive.rest ? 'REST Proxy' : 'tibemsadmin';
    const serverUrl = emsLive.rest ?? emsLive.admin ?? '';
    log(`\n📨 EMS Live Connection [${modeTag}]: ${serverUrl}\n`);
    log('   Connecting & fetching... ');
    let emsModel;
    try {
      if (emsLive.rest) {
        emsModel = await parseEMSFromRest({
          url: emsLive.rest,
          user: emsLive.user ?? 'admin',
          password: emsLive.password ?? '',
          ignoreSslErrors: emsLive.ignoreSsl,
        });
      } else {
        emsModel = await parseEMSFromAdmin({
          server: emsLive.admin!,
          user: emsLive.user ?? 'admin',
          password: emsLive.password ?? '',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`\n   ✗ Connection error: ${msg}\n`);
      return { success: false, outputDir, error: msg };
    }
    const emsHtmlOut = path.join(outputDir, 'html');
    const emsJsonOut = path.join(outputDir, 'json');
    const { queues, topics, factories, users, acls, routes } = emsModel;
    log(`✓  (${queues.length} queues, ${topics.length} topics, ${factories.length} factories, ${users.length} users, ${acls.length} ACLs, ${routes.length} routes)\n`);
    if (format === 'html' || format === 'all') {
      fs.mkdirSync(emsHtmlOut, { recursive: true });
      log('   Rendering HTML... ');
      renderEMSHTML(emsModel, emsHtmlOut);
      log('✓\n');
    }
    if (format === 'json' || format === 'all') {
      fs.mkdirSync(emsJsonOut, { recursive: true });
      log('   Writing model.json... ');
      fs.writeFileSync(path.join(emsJsonOut, 'model.json'), JSON.stringify(emsModel, null, 2), 'utf8');
      log('✓\n');
    }
    log(`   📁 Output: ${outputDir}\n`);
    if (format === 'html' || format === 'all')
      log(`      html/   ${emsHtmlOut}\n`);
    if (format === 'json' || format === 'all')
      log(`      json/   ${path.join(emsJsonOut, 'model.json')}\n`);
    if (format === 'html' || format === 'all')
      log(`   🌐 Open:   file://${emsHtmlOut.replace(/\\/g, '/')}/index.html\n`);
    log(`\n${'─'.repeat(50)}\n✅ Done.\n`);
    return { success: true, outputDir, htmlDir: emsHtmlOut };
  }

  if (!inputPath || !fs.existsSync(inputPath)) {
    return { success: false, outputDir, error: `Input not found: ${inputPath}` };
  }

  const inputs = discoverInputs(inputPath);
  if (!inputs.length) {
    return { success: false, outputDir, error: `No supported apps found in: ${inputPath}` };
  }

  const processedModels: Array<{ entry: InputEntry; appOut: string; htmlOut: string; model: DocModel }> = [];
  const isMulti = inputs.length > 1;
  let firstAppOut = outputDir;
  let firstHtmlOut: string | undefined;

  for (const entry of inputs) {
    const appOut = isMulti ? path.join(outputDir, entry.label) : outputDir;
    const htmlOut  = path.join(appOut, 'html');
    const mdOut    = path.join(appOut, 'markdown');
    const jsonOut  = path.join(appOut, 'json');
    const pdfOut   = path.join(appOut, 'pdf');
    if (inputs.indexOf(entry) === 0) { firstAppOut = appOut; firstHtmlOut = htmlOut; }
    const tag = entry.type === 'bw6' ? '📁' : entry.type === 'ems' ? '📨' : '📄';
    log(`\n${tag} Processing: ${path.basename(entry.path)} [${entry.type.toUpperCase()}]\n`);
    log('   Parsing... ');

    if (entry.type === 'ems') {
      let emsModel;
      try {
        emsModel = parseEMSConfig(entry.path);
      } catch (err) {
        log(`\n   ✗ Parse error: ${err instanceof Error ? err.message : String(err)}\n`);
        continue;
      }
      const { queues, topics, factories, users, acls, routes } = emsModel;
      log(`✓  (${queues.length} queues, ${topics.length} topics, ${factories.length} factories, ${users.length} users, ${acls.length} ACLs, ${routes.length} routes)\n`);
      if (format === 'html' || format === 'all') {
        fs.mkdirSync(htmlOut, { recursive: true });
        log('   Rendering HTML... ');
        renderEMSHTML(emsModel, htmlOut);
        log('✓\n');
        log(`   📁 html/    ${htmlOut}\n`);
        log(`   🌐 Open:    file://${htmlOut.replace(/\\/g, '/')}/index.html\n`);
      }
      continue;
    }

    let model: DocModel;
    try {
      if (entry.type === 'bw6') {
        const ext = path.extname(entry.path).toLowerCase();
        model = ext === '.ear' ? parseBW6Ear(entry.path)
              : ext === '.zip' ? parseBW6Zip(entry.path)
              : parseBW6App(entry.path);
      } else {
        model = parseFlogoFile(entry.path);
      }
    } catch (err) {
      log(`\n   ✗ Parse error: ${err instanceof Error ? err.message : String(err)}\n`);
      continue;
    }

    const violations = model.violations ?? [];
    const errCount  = violations.filter(v => v.severity === 'error').length;
    const warnCount = violations.filter(v => v.severity === 'warning').length;
    const qaNote    = violations.length > 0 ? ` · QA: ${errCount}E ${warnCount}W` : '';
    log(`✓  (${model.flows.length} processes, ${model.triggers.length} triggers${qaNote})\n`);

    if (model.parseWarnings?.length) {
      for (const w of model.parseWarnings) log(`   [WARN] ${w}\n`);
    }

    if (format === 'html' || format === 'pdf' || format === 'all') {
      fs.mkdirSync(htmlOut, { recursive: true });
      log('   Rendering HTML... ');
      renderHTML(model, htmlOut, { bw6Icons });
      log('✓\n');
    }
    if (format === 'md' || format === 'all') {
      fs.mkdirSync(mdOut, { recursive: true });
      log('   Rendering Markdown... ');
      renderMarkdown(model, mdOut, { bw6Icons });
      log('✓\n');
    }
    if (format === 'json' || format === 'all') {
      fs.mkdirSync(jsonOut, { recursive: true });
      log('   Writing model.json... ');
      fs.writeFileSync(path.join(jsonOut, 'model.json'), JSON.stringify(model, null, 2), 'utf8');
      log('✓\n');
    }
    if (format === 'pdf' || format === 'all') {
      fs.mkdirSync(pdfOut, { recursive: true });
      log('   Exporting PDF...\n');
      try {
        await exportToPDF(model, path.join(pdfOut, `${entry.label}.pdf`), log, bw6Icons);
      } catch (pdfErr) {
        // Non-fatal in 'all' mode — Chrome may not be available in all environments
        if (format === 'pdf') throw pdfErr;
        log(`   ⚠ PDF skipped: ${(pdfErr as Error).message}\n`);
      }
    }
    if (confluenceOpts) {
      log('   Exporting to Confluence...\n');
      await exportToConfluence(model, confluenceOpts, log);
    }

    // Per-format output summary
    log(`   📁 Output: ${appOut}\n`);
    if (format === 'html' || format === 'pdf' || format === 'all')
      log(`      html/      ${htmlOut}\n`);
    if (format === 'md' || format === 'all')
      log(`      markdown/  ${mdOut}\n`);
    if (format === 'json' || format === 'all')
      log(`      json/      ${path.join(jsonOut, 'model.json')}\n`);
    if (format === 'pdf' || format === 'all') {
      const pdfFile = path.join(pdfOut, entry.label + '.pdf');
      if (fs.existsSync(pdfFile)) log(`      pdf/       ${pdfFile}\n`);
    }
    if (format === 'html' || format === 'pdf' || format === 'all')
      log(`   🌐 Open:   file://${htmlOut.replace(/\\/g, '/')}/index.html\n`);
    processedModels.push({ entry, appOut, htmlOut, model });
  }

  if (isMulti && processedModels.length > 1 && (format === 'html' || format === 'all')) {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'index.html'), renderWorkspaceIndex(processedModels, outputDir), 'utf8');
    log(`\n📊 Workspace index: file://${outputDir.replace(/\\/g, '/')}/index.html\n`);
  }

  log(`\n${'─'.repeat(50)}\n✅ Done.\n`);

  return {
    success: processedModels.length > 0 || inputs.some(e => e.type === 'ems'),
    outputDir: firstAppOut,
    htmlDir: firstHtmlOut,
  };
}

// ─── CLI entry point ───────────────────────────────────────────────────────────

async function run(): Promise<void> {
  if (process.argv.includes('--mcp')) {
    await startMcpServer();
    return;
  }

  const { input, output, format, open, watch, emsRest, emsAdmin, emsUser, emsPassword, emsIgnoreSsl, emsName,
          confluenceUrl, confluenceSpace, confluenceToken, confluenceUser, confluenceParent } = parseArgs(process.argv);

  const emsLive = (emsRest || emsAdmin) ? {
    rest: emsRest, admin: emsAdmin,
    user: emsUser, password: emsPassword,
    ignoreSsl: emsIgnoreSsl, name: emsName,
  } : undefined;

  const confluenceOpts = (confluenceUrl && confluenceSpace && confluenceToken)
    ? { url: confluenceUrl, spaceKey: confluenceSpace, token: confluenceToken, user: confluenceUser, parentId: confluenceParent }
    : undefined;

  if (confluenceUrl && !confluenceOpts) {
    console.error('Error: --confluence-url requires --confluence-space and --confluence-token');
    process.exit(1);
  }

  if (!emsLive && !fs.existsSync(input)) {
    console.error(`Error: input not found: ${input}`);
    process.exit(1);
  }

  if (watch && !emsLive) {
    await startWatch(input, output, format, (msg) => process.stdout.write(msg));
    return;
  }

  const result = await generateDocs(input, output, format, (msg) => process.stdout.write(msg), emsLive, confluenceOpts);
  if (!result.success && result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
}

function renderWorkspaceIndex(
  apps: Array<{ entry: InputEntry; appOut: string; htmlOut: string; model: DocModel }>,
  outputRoot: string,
): string {
  const rows = apps.map(({ entry, appOut, htmlOut, model }) => {
    const relApp  = path.relative(outputRoot, appOut).replace(/\\/g, '/');
    const relHtml = path.relative(outputRoot, htmlOut).replace(/\\/g, '/');
    const tag = entry.type === 'bw6' ? '📁' : '📄';
    const violations = model.violations ?? [];
    const errors   = violations.filter(v => v.severity === 'error').length;
    const warnings = violations.filter(v => v.severity === 'warning').length;
    const qaBadge = violations.length === 0
      ? `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:4px;font-size:12px">✓ Clean</span>`
      : `<span style="background:${errors > 0 ? '#fee2e2;color:#dc2626' : '#fef3c7;color:#d97706'};padding:2px 8px;border-radius:4px;font-size:12px">${errors > 0 ? `${errors}E ` : ''}${warnings > 0 ? `${warnings}W` : ''}</span>`;
    const profileCount = Object.keys(model.profileProperties ?? {}).length;
    return `<tr>
      <td><a href="${relHtml}/index.html" style="color:#0369a1;font-weight:600">${tag} ${model.app.name}</a><br>
          <span style="font-size:11px;color:#64748b">${relApp}</span></td>
      <td style="text-align:center">${model.flows.length}</td>
      <td style="text-align:center">${model.connections.length}</td>
      <td style="text-align:center">${model.schemas.length}</td>
      <td style="text-align:center">${profileCount}</td>
      <td>${qaBadge}</td>
      <td style="text-align:center"><a href="${relHtml}/index.html" style="color:#0369a1">→ Open</a></td>
    </tr>`;
  }).join('');

  const totalProcesses = apps.reduce((s, a) => s + a.model.flows.length, 0);
  const totalErrors    = apps.reduce((s, a) => s + (a.model.violations ?? []).filter(v => v.severity === 'error').length, 0);

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Workspace — DocGen</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b;min-height:100vh}
.header{background:linear-gradient(135deg,#1e3a5f 0%,#0f1e2e 100%);color:#fff;padding:32px 40px}
.header h1{font-size:24px;font-weight:700;margin-bottom:4px}
.header .sub{font-size:14px;color:#94a3b8}
.body{padding:32px 40px}
.stats{display:flex;gap:16px;margin-bottom:28px}
.stat{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 24px;text-align:center;min-width:110px}
.stat .val{font-size:28px;font-weight:700;color:#00695c}.stat .lbl{font-size:12px;color:#64748b;margin-top:2px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px #0001}
th{background:#f1f5f9;padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
td{padding:12px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tr:last-child td{border-bottom:none}
</style>
</head><body>
<div class="header">
  <h1>📦 Workspace Documentation</h1>
  <div class="sub">${apps.length} applications · ${totalProcesses} processes · Generated ${new Date().toLocaleString()}</div>
</div>
<div class="body">
  <div class="stats">
    <div class="stat"><div class="val">${apps.length}</div><div class="lbl">Applications</div></div>
    <div class="stat"><div class="val">${totalProcesses}</div><div class="lbl">Total Processes</div></div>
    <div class="stat"><div class="val" style="color:${totalErrors > 0 ? '#dc2626' : '#065f46'}">${totalErrors}</div><div class="lbl">QA Errors</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Application</th><th>Processes</th><th>Resources</th><th>Schemas</th><th>Profiles</th><th>QA Status</th><th>Link</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
</body></html>`;
}

// Only run CLI when executed directly (not when required as a module by the VS Code extension)
if (require.main === module) {
  run().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
