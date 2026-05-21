import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ─── Output channel (shared singleton) ───────────────────────────────────────
let outputChannel: vscode.OutputChannel;

// ─── Mtime-based doc cache (session lifetime, max 50 entries LRU) ────────────
const MAX_CACHE = 50;
const docCache = new Map<string, { mtime: number; outputDir: string }>();

function cacheSet(key: string, value: { mtime: number; outputDir: string }): void {
  docCache.delete(key); // move to end (most-recently-used)
  docCache.set(key, value);
  if (docCache.size > MAX_CACHE) {
    docCache.delete(docCache.keys().next().value!); // evict oldest
  }
}

// ─── CLI discovery ────────────────────────────────────────────────────────────

function findCLI(context: vscode.ExtensionContext): string | null {
  const config = vscode.workspace.getConfiguration('tibco-docgen');
  const configPath = config.get<string>('cliPath', '').trim();

  if (configPath && fs.existsSync(configPath)) return configPath;

  const bundledCLI = path.join(context.extensionPath, 'cli', 'tibco-docgen.js');
  if (fs.existsSync(bundledCLI)) return bundledCLI;

  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (wsFolder) {
    const wsBin = path.join(wsFolder, 'node_modules', '.bin', 'tibco-docgen');
    const wsScript = path.join(wsFolder, 'node_modules', '@tibco-docgen', 'cli', 'dist', 'index.js');
    if (fs.existsSync(wsBin)) return wsBin;
    if (fs.existsSync(wsScript)) return wsScript;
  }

  const ext = context.extensionPath;
  const devCandidates = [
    path.join(ext, '..', 'dist', 'tibco-docgen.js'),
    path.join(ext, '..', 'cli', 'dist', 'index.js'),
  ];
  for (const c of devCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ─── Input type detection ─────────────────────────────────────────────────────

type AppType = 'flogo' | 'bw6' | 'ems' | 'workspace' | 'unknown';

function detectAppType(fsPath: string): AppType {
  const stat = fs.statSync(fsPath);
  if (stat.isFile()) {
    const ext = path.extname(fsPath).toLowerCase();
    if (ext === '.flogo') return 'flogo';
    if (ext === '.ear' || ext === '.zip') return 'bw6';
    return 'unknown';
  }
  if (fs.existsSync(path.join(fsPath, 'META-INF', 'MANIFEST.MF'))) return 'bw6';
  if (hasEMSConfig(fsPath)) return 'ems';
  if (hasBWPFiles(fsPath)) return 'bw6';
  if (hasFlogoFiles(fsPath)) return 'workspace';
  return 'bw6';
}

function hasEMSConfig(dir: string): boolean {
  return ['tibemsd.conf', 'queues.conf', 'topics.conf'].some(f =>
    fs.existsSync(path.join(dir, f))
  );
}

function hasBWPFiles(dir: string): boolean {
  try {
    return fs.readdirSync(dir, { recursive: true } as Parameters<typeof fs.readdirSync>[1])
      .some((f: unknown) => String(f).endsWith('.bwp'));
  } catch { return false; }
}

function hasFlogoFiles(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some(f => f.endsWith('.flogo'));
  } catch { return false; }
}

// ─── EMS Live Connection types ────────────────────────────────────────────────

interface EMSLiveOpts {
  rest?:      string;
  admin?:     string;
  user?:      string;
  password?:  string;
  ignoreSsl?: boolean;
  name?:      string;
}

interface EMSConnection {
  id:        string;
  name:      string;         // display name e.g. "Production EMS"
  mode:      'rest' | 'admin';
  url:       string;         // http://... or tcp://...
  user:      string;
  ignoreSsl?: boolean;
}

const EMS_CONNECTIONS_KEY = 'tibco-docgen.emsConnections';

function loadConnections(context: vscode.ExtensionContext): EMSConnection[] {
  return context.globalState.get<EMSConnection[]>(EMS_CONNECTIONS_KEY, []);
}

async function saveConnections(context: vscode.ExtensionContext, conns: EMSConnection[]): Promise<void> {
  await context.globalState.update(EMS_CONNECTIONS_KEY, conns);
}

function secretKey(id: string): string { return `ems-pw-${id}`; }

async function loadPassword(context: vscode.ExtensionContext, id: string): Promise<string | undefined> {
  return context.secrets.get(secretKey(id));
}

async function savePassword(context: vscode.ExtensionContext, id: string, pw: string): Promise<void> {
  await context.secrets.store(secretKey(id), pw);
}

async function deleteConnection(context: vscode.ExtensionContext, id: string): Promise<void> {
  const conns = loadConnections(context).filter(c => c.id !== id);
  await saveConnections(context, conns);
  await context.secrets.delete(secretKey(id));
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── Prompt for a new EMS connection ─────────────────────────────────────────

async function promptNewConnection(context: vscode.ExtensionContext): Promise<EMSConnection | undefined> {
  // Step 1: mode
  const modePick = await vscode.window.showQuickPick(
    [
      {
        label: '$(cloud) REST Proxy',
        detail: 'Connect via tibemsrestd  —  http://host:9000',
        id: 'rest' as const,
      },
      {
        label: '$(terminal) tibemsadmin CLI',
        detail: 'Connect directly via tibemsadmin  —  tcp://host:7222',
        id: 'admin' as const,
      },
    ],
    { title: 'EMS: Connection Mode', placeHolder: 'How should docgen connect to EMS?' }
  );
  if (!modePick) return undefined;

  // Step 2: URL
  const urlDefault = modePick.id === 'rest' ? 'http://localhost:8081' : 'tcp://localhost:7222';
  const url = await vscode.window.showInputBox({
    title: 'EMS: Server URL',
    prompt: modePick.id === 'rest'
      ? 'REST Proxy URL  (e.g. http://localhost:8081 or https://ems-host:9443)'
      : 'EMS server URL  (e.g. tcp://localhost:7222 or ssl://ems-host:7243)',
    value: urlDefault,
    ignoreFocusOut: true,
    validateInput: v => v.trim() ? undefined : 'URL is required',
  });
  if (!url) return undefined;

  // Step 3: username
  const user = await vscode.window.showInputBox({
    title: 'EMS: Username',
    prompt: 'EMS admin username',
    value: 'admin',
    ignoreFocusOut: true,
  });
  if (user === undefined) return undefined;

  // Step 4: password
  const password = await vscode.window.showInputBox({
    title: 'EMS: Password',
    prompt: 'EMS password  (leave empty if none)',
    password: true,
    ignoreFocusOut: true,
  });
  if (password === undefined) return undefined;

  // Step 5: SSL ignore (REST + HTTPS only)
  let ignoreSsl = false;
  if (modePick.id === 'rest' && url.startsWith('https://')) {
    const sslPick = await vscode.window.showQuickPick(
      [
        { label: '$(shield) Verify TLS certificate  (recommended)', val: false },
        { label: '$(warning) Skip TLS verification  (self-signed certs)', val: true },
      ],
      { title: 'EMS: TLS Certificate Handling' }
    );
    if (!sslPick) return undefined;
    ignoreSsl = sslPick.val;
  }

  // Step 6: display name
  const suggestedName = url.replace(/^https?:\/\/|tcp:\/\/|ssl:\/\//, '').split(':')[0];
  const name = await vscode.window.showInputBox({
    title: 'EMS: Connection Name',
    prompt: 'A friendly name for this connection (shown in the picker)',
    value: suggestedName,
    ignoreFocusOut: true,
    validateInput: v => v.trim() ? undefined : 'Name is required',
  });
  if (!name) return undefined;

  const conn: EMSConnection = { id: makeId(), name: name.trim(), mode: modePick.id, url: url.trim(), user: user.trim(), ignoreSsl };

  // Save connection + password
  const conns = loadConnections(context);
  conns.push(conn);
  await saveConnections(context, conns);
  await savePassword(context, conn.id, password);

  return conn;
}

// ─── EMS connection picker (with saved connections) ───────────────────────────

async function pickEMSConnection(context: vscode.ExtensionContext): Promise<{ conn: EMSConnection; password: string } | undefined> {
  const saved = loadConnections(context);

  type PickItem = vscode.QuickPickItem & { action: 'use' | 'new' | 'manage'; conn?: EMSConnection };

  const items: PickItem[] = [
    ...saved.map(c => ({
      label: `$(server-process) ${c.name}`,
      detail: `${c.mode === 'rest' ? 'REST Proxy' : 'tibemsadmin CLI'}  ·  ${c.url}  ·  user: ${c.user}`,
      action: 'use' as const,
      conn: c,
    })),
    ...(saved.length > 0 ? [{ label: '', kind: vscode.QuickPickItemKind.Separator } as unknown as PickItem] : []),
    { label: '$(add) Add new EMS connection…', action: 'new' as const },
    ...(saved.length > 0 ? [{ label: '$(settings-gear) Manage saved connections…', action: 'manage' as const }] : []),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'DocGen: EMS Live Connection',
    placeHolder: saved.length ? 'Select a saved connection or add a new one' : 'No saved connections — add one to get started',
  });
  if (!picked) return undefined;

  if (picked.action === 'new') {
    const conn = await promptNewConnection(context);
    if (!conn) return undefined;
    const pw = await loadPassword(context, conn.id) ?? '';
    return { conn, password: pw };
  }

  if (picked.action === 'manage') {
    await manageConnections(context);
    return undefined; // user goes back to manage, then re-invokes command
  }

  // Use saved connection — prompt for password (pre-filled if stored)
  const conn = picked.conn!;
  const storedPw = await loadPassword(context, conn.id) ?? '';

  const password = await vscode.window.showInputBox({
    title: `EMS: Password for "${conn.name}"`,
    prompt: `Password for ${conn.user}@${conn.url}  (leave empty if none; stored value shown as placeholder)`,
    placeHolder: storedPw ? '(stored — press Enter to use)' : '',
    password: true,
    ignoreFocusOut: true,
  });
  if (password === undefined) return undefined;

  const finalPw = password === '' ? storedPw : password;

  // Update stored password if user typed a new one
  if (password !== '' && password !== storedPw) {
    await savePassword(context, conn.id, password);
  }

  return { conn, password: finalPw };
}

// ─── Manage saved connections ─────────────────────────────────────────────────

async function manageConnections(context: vscode.ExtensionContext): Promise<void> {
  const saved = loadConnections(context);
  if (saved.length === 0) {
    vscode.window.showInformationMessage('DocGen: No saved EMS connections.');
    return;
  }

  type ManageItem = vscode.QuickPickItem & { conn: EMSConnection };

  const items: ManageItem[] = saved.map(c => ({
    label: `$(server-process) ${c.name}`,
    detail: `${c.mode === 'rest' ? 'REST Proxy' : 'tibemsadmin CLI'}  ·  ${c.url}  ·  user: ${c.user}`,
    conn: c,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'DocGen: Manage EMS Connections — select one to delete',
    placeHolder: 'Select a connection to remove',
  });
  if (!picked) return;

  const confirm = await vscode.window.showWarningMessage(
    `Delete connection "${picked.conn.name}"?`,
    { modal: true },
    'Delete'
  );
  if (confirm === 'Delete') {
    await deleteConnection(context, picked.conn.id);
    vscode.window.showInformationMessage(`DocGen: Deleted connection "${picked.conn.name}".`);
  }
}

// ─── Resolve output directory ─────────────────────────────────────────────────

function resolveOutputDir(inputPath: string): string {
  const config = vscode.workspace.getConfiguration('tibco-docgen');
  const configured = config.get<string>('outputDirectory', '').trim();
  if (configured) {
    if (!path.isAbsolute(configured)) {
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      return path.resolve(wsRoot ?? path.dirname(inputPath), configured);
    }
    return configured;
  }
  const base = fs.statSync(inputPath).isFile() ? path.dirname(inputPath) : path.dirname(inputPath);
  return path.join(base, 'docgen-out');
}

function resolveEMSOutputDir(connName: string): string {
  const config = vscode.workspace.getConfiguration('tibco-docgen');
  const configured = config.get<string>('outputDirectory', '').trim();
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const safeName = connName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

  if (configured) {
    const base = path.isAbsolute(configured) ? configured : path.resolve(wsRoot ?? '.', configured);
    return path.join(base, `ems-${safeName}`);
  }
  const base = wsRoot ?? '.';
  return path.join(base, 'docgen-out', `ems-${safeName}`);
}

// ─── Run the CLI in-process ───────────────────────────────────────────────────

interface RunResult { success: boolean; outputDir: string; }

async function runCLI(
  cliScript: string,
  inputPath: string,
  outputDir: string,
  token: vscode.CancellationToken,
  emsLive?: EMSLiveOpts,
): Promise<RunResult> {
  const config = vscode.workspace.getConfiguration('tibco-docgen');
  const format = config.get<string>('format', 'all') as 'html' | 'md' | 'json' | 'pdf' | 'all';
  const label  = emsLive?.name ?? path.basename(inputPath);

  outputChannel.appendLine('');
  outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] Generating docs for: ${label}`);
  if (!emsLive) {
    outputChannel.appendLine(`  Input:  ${inputPath}`);
  } else {
    const modeTag = emsLive.rest ? `REST Proxy  ${emsLive.rest}` : `tibemsadmin  ${emsLive.admin}`;
    outputChannel.appendLine(`  EMS:    ${modeTag}`);
  }
  outputChannel.appendLine(`  Output: ${outputDir}`);
  outputChannel.appendLine(`  Format: ${format}`);
  outputChannel.appendLine('');

  // Mtime cache — skip for live EMS (no file to stat)
  if (!emsLive) {
    try {
      const mtime = fs.statSync(inputPath).mtimeMs;
      const cached = docCache.get(inputPath);
      if (cached && cached.mtime === mtime && fs.existsSync(cached.outputDir)) {
        outputChannel.appendLine(`  ℹ Docs are up to date (no changes detected). Using cached output.`);
        return { success: true, outputDir: cached.outputDir };
      }
    } catch { /* stat failed — proceed */ }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cli = require(cliScript) as {
      generateDocs: (
        input: string,
        output: string,
        format: string,
        log: (msg: string) => void,
        emsLive?: EMSLiveOpts,
      ) => Promise<{ success: boolean; outputDir: string; error?: string }>;
    };

    if (typeof cli.generateDocs !== 'function') {
      throw new Error('Bundled CLI does not export generateDocs — rebuild required.');
    }

    const result = await cli.generateDocs(
      inputPath,
      outputDir,
      format,
      (msg: string) => { outputChannel.append(msg); },
      emsLive,
    );

    if (result.success) {
      outputChannel.appendLine(`\n✓ Done — output: ${result.outputDir}`);
      if (!emsLive) {
        try {
          cacheSet(inputPath, { mtime: fs.statSync(inputPath).mtimeMs, outputDir: result.outputDir });
        } catch { /* ignore */ }
      }
    } else {
      outputChannel.appendLine(`\n✗ Generation failed${result.error ? ': ' + result.error : ''}`);
    }

    return { success: result.success, outputDir: result.outputDir };

  } catch (err) {
    const msg = (err as Error).message;
    outputChannel.appendLine(`\n✗ Error: ${msg}`);
    return { success: false, outputDir };
  }
}

// ─── Open generated docs ──────────────────────────────────────────────────────

async function openGeneratedDocs(outputDir: string): Promise<void> {
  // Output is now per-format: html/index.html takes priority, then workspace index.html, then any subdir
  const candidates = [
    path.join(outputDir, 'html', 'index.html'),   // per-format subdir (new layout)
    path.join(outputDir, 'index.html'),            // workspace root index
  ];

  let indexPath: string | undefined;
  for (const c of candidates) {
    if (fs.existsSync(c)) { indexPath = c; break; }
  }

  if (!indexPath) {
    // Fall back: scan one level of subdirs
    try {
      for (const sub of fs.readdirSync(outputDir)) {
        const c = path.join(outputDir, sub, 'html', 'index.html');
        if (fs.existsSync(c)) { indexPath = c; break; }
        const c2 = path.join(outputDir, sub, 'index.html');
        if (fs.existsSync(c2)) { indexPath = c2; break; }
      }
    } catch { /* ignore */ }
  }

  if (!indexPath) {
    vscode.window.showWarningMessage('DocGen: Could not find generated index.html');
    return;
  }
  await vscode.env.openExternal(vscode.Uri.file(indexPath));
}

// ─── Core generate command (file / folder inputs) ─────────────────────────────

async function generateDocs(context: vscode.ExtensionContext, inputPath: string): Promise<void> {
  const cliScript = findCLI(context);
  if (!cliScript) {
    const action = await vscode.window.showErrorMessage(
      'DocGen: tibco-docgen CLI not found. Configure the path in settings.',
      'Open Settings'
    );
    if (action === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'tibco-docgen.cliPath');
    }
    return;
  }

  const outputDir = resolveOutputDir(inputPath);
  const appType   = detectAppType(inputPath);
  const label     = path.basename(inputPath);

  outputChannel.show(true);

  let runResult: RunResult | undefined;
  let wasCancelled = false;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `DocGen: Generating docs for ${label}`,
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: `Parsing ${appType.toUpperCase()} application…` });
      runResult = await runCLI(cliScript, inputPath, outputDir, token);
      wasCancelled = token.isCancellationRequested;
    }
  );

  if (wasCancelled) { vscode.window.showWarningMessage('DocGen: Generation cancelled.'); return; }
  await handleResult(runResult);
}

// ─── EMS live generate command ────────────────────────────────────────────────

async function generateEMSDocs(context: vscode.ExtensionContext): Promise<void> {
  const cliScript = findCLI(context);
  if (!cliScript) {
    const action = await vscode.window.showErrorMessage(
      'DocGen: tibco-docgen CLI not found. Configure the path in settings.',
      'Open Settings'
    );
    if (action === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'tibco-docgen.cliPath');
    }
    return;
  }

  const picked = await pickEMSConnection(context);
  if (!picked) return;

  const { conn, password } = picked;
  const outputDir = resolveEMSOutputDir(conn.name);
  const emsLive: EMSLiveOpts = {
    [conn.mode === 'rest' ? 'rest' : 'admin']: conn.url,
    user: conn.user,
    password,
    ignoreSsl: conn.ignoreSsl,
    name: conn.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase(),
  };

  outputChannel.show(true);

  let runResult: RunResult | undefined;
  let wasCancelled = false;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `DocGen: Connecting to EMS — ${conn.name}`,
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: 'Fetching EMS configuration…' });
      runResult = await runCLI(cliScript, '', outputDir, token, emsLive);
      wasCancelled = token.isCancellationRequested;
    }
  );

  if (wasCancelled) { vscode.window.showWarningMessage('DocGen: Generation cancelled.'); return; }
  await handleResult(runResult);
}

// ─── Shared result handler ────────────────────────────────────────────────────

async function handleResult(runResult: RunResult | undefined): Promise<void> {
  if (!runResult?.success) {
    const action = await vscode.window.showErrorMessage(
      'DocGen: Generation failed. Check the Output panel for details.',
      'Show Output'
    );
    if (action === 'Show Output') outputChannel.show();
    return;
  }

  const config = vscode.workspace.getConfiguration('tibco-docgen');
  const openAfter = config.get<boolean>('openAfterGenerate', true);

  const action = await vscode.window.showInformationMessage(
    `DocGen: Documentation generated in ${path.basename(runResult.outputDir)}`,
    'Open in Browser',
    'Reveal in Explorer'
  );

  if (action === 'Open in Browser') {
    await openGeneratedDocs(runResult.outputDir);
  } else if (action === 'Reveal in Explorer') {
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(runResult.outputDir));
  } else if (openAfter) {
    await openGeneratedDocs(runResult.outputDir);
  }
}

// ─── Workspace scan ───────────────────────────────────────────────────────────

async function generateWorkspaceDocs(context: vscode.ExtensionContext): Promise<void> {
  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsFolder) {
    vscode.window.showWarningMessage('DocGen: No workspace folder open.');
    return;
  }

  const cliScript = findCLI(context);
  if (!cliScript) {
    vscode.window.showErrorMessage('DocGen: tibco-docgen CLI not found.');
    return;
  }

  const found: Array<{ label: string; detail: string; path: string }> = [];

  try {
    const flogoFiles = await vscode.workspace.findFiles('**/*.flogo', '**/node_modules/**', 50);
    for (const f of flogoFiles) {
      found.push({ label: `$(file) ${path.basename(f.fsPath)}`, detail: f.fsPath, path: f.fsPath });
    }

    const manifestFiles = await vscode.workspace.findFiles('**/META-INF/MANIFEST.MF', '**/node_modules/**', 20);
    const seen = new Set<string>();
    for (const f of manifestFiles) {
      const appDir = path.dirname(path.dirname(f.fsPath));
      if (!seen.has(appDir)) {
        seen.add(appDir);
        found.push({ label: `$(folder) ${path.basename(appDir)}`, detail: appDir, path: appDir });
      }
    }
  } catch { /* ignore scan errors */ }

  if (found.length === 0) {
    vscode.window.showInformationMessage('DocGen: No TIBCO apps found in workspace.');
    return;
  }

  const picked = await vscode.window.showQuickPick(
    found.map(f => ({ ...f, description: f.detail, picked: true })),
    {
      canPickMany: true,
      placeHolder: 'Select apps to generate documentation for',
      title: 'DocGen: Generate Workspace Documentation',
    }
  );
  if (!picked || picked.length === 0) return;

  const config  = vscode.workspace.getConfiguration('tibco-docgen');
  const outBase = config.get<string>('outputDirectory', '').trim()
    || path.join(wsFolder, 'docgen-out');

  outputChannel.show(true);
  outputChannel.appendLine(`\n${'─'.repeat(60)}`);
  outputChannel.appendLine(`DocGen workspace run — ${picked.length} app(s)`);
  outputChannel.appendLine(`Output base: ${outBase}`);
  outputChannel.appendLine(`${'─'.repeat(60)}`);

  let successCount = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'DocGen: Generating workspace documentation',
      cancellable: true,
    },
    async (progress, token) => {
      for (let i = 0; i < picked.length; i++) {
        if (token.isCancellationRequested) break;
        const app = picked[i];
        const appName = path.basename(app.path, '.flogo');
        const outputDir = path.join(outBase, appName);

        progress.report({
          message: `${i + 1}/${picked.length}: ${appName}`,
          increment: (1 / picked.length) * 100,
        });

        const result = await runCLI(cliScript, app.path, outputDir, token);
        if (result.success) successCount++;
      }

      if (!token.isCancellationRequested) {
        const msg = `DocGen: ${successCount}/${picked.length} app(s) documented.`;
        const action = await vscode.window.showInformationMessage(msg, 'Open Output Folder');
        if (action === 'Open Output Folder') {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outBase));
        }
      }
    }
  );
}

// ─── MCP Server Setup ────────────────────────────────────────────────────────

function getMcpCliPath(context: vscode.ExtensionContext): string {
  // Prefer the bundled CLI — MCP clients launch outside VS Code and need a stable absolute path.
  const bundled = path.join(context.extensionPath, 'cli', 'tibco-docgen.js');
  return fs.existsSync(bundled) ? bundled : (findCLI(context) ?? bundled);
}

function mcpServerEntry(cliPath: string) {
  return { command: 'node', args: [cliPath.replace(/\\/g, '/'), '--mcp'] };
}

async function copyMcpConfig(context: vscode.ExtensionContext): Promise<void> {
  const cliPath = getMcpCliPath(context);

  type HostItem = vscode.QuickPickItem & { configFile: string };
  const picked = await vscode.window.showQuickPick<HostItem>(
    [
      {
        label: '$(comment-discussion) Claude Desktop',
        detail: 'Paste into claude_desktop_config.json',
        configFile: 'claude_desktop_config.json',
      },
      {
        label: '$(edit) Cursor / Windsurf / Continue',
        detail: 'Paste into .cursor/mcp.json or .mcp.json',
        configFile: '.cursor/mcp.json',
      },
      {
        label: '$(globe) Generic MCP Host',
        detail: 'Standard mcpServers JSON block for any MCP-compatible host',
        configFile: 'mcp config file',
      },
    ],
    { title: 'DocGen: Copy MCP Server Config', placeHolder: 'Which AI host are you configuring?' }
  );
  if (!picked) return;

  const config = JSON.stringify({ mcpServers: { 'tibco-docgen': mcpServerEntry(cliPath) } }, null, 2);
  await vscode.env.clipboard.writeText(config);

  vscode.window.showInformationMessage(
    `DocGen: MCP config copied! Paste the "mcpServers" block into your ${picked.configFile}, then restart the AI host.`
  );
}

async function addMcpServerToVSCode(context: vscode.ExtensionContext): Promise<void> {
  const [major, minor] = vscode.version.split('.').map(Number);
  const supportsNativeMcp = major > 1 || (major === 1 && minor >= 99);

  if (!supportsNativeMcp) {
    const action = await vscode.window.showInformationMessage(
      `Native MCP server support requires VS Code 1.99+ (you have ${vscode.version}). Copy the config to clipboard for your AI host instead?`,
      'Copy Config',
      'Cancel'
    );
    if (action === 'Copy Config') await copyMcpConfig(context);
    return;
  }

  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsFolder) {
    const action = await vscode.window.showWarningMessage(
      'DocGen: Open a workspace folder first, or copy the config manually.',
      'Copy Config'
    );
    if (action === 'Copy Config') await copyMcpConfig(context);
    return;
  }

  const cliPath = getMcpCliPath(context);
  const vscodeDir = path.join(wsFolder, '.vscode');
  const mcpJsonPath = path.join(vscodeDir, 'mcp.json');

  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8')); } catch { /* start fresh */ }

  const servers = (existing['servers'] ?? {}) as Record<string, unknown>;
  servers['tibco-docgen'] = { type: 'stdio', ...mcpServerEntry(cliPath) };
  existing['servers'] = servers;

  fs.mkdirSync(vscodeDir, { recursive: true });
  fs.writeFileSync(mcpJsonPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');

  const action = await vscode.window.showInformationMessage(
    'DocGen: MCP server added to .vscode/mcp.json — Claude in VS Code will detect it automatically.',
    'Open mcp.json'
  );
  if (action === 'Open mcp.json') {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(mcpJsonPath));
    vscode.window.showTextDocument(doc);
  }
}

// ─── Status bar ───────────────────────────────────────────────────────────────

function createStatusBar(): vscode.StatusBarItem {
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  bar.command = 'tibco-docgen.generateDocs';
  bar.tooltip = 'DocGen: Generate Documentation';
  return bar;
}

function updateStatusBar(bar: vscode.StatusBarItem, editor?: vscode.TextEditor): void {
  const doc = editor?.document;
  if (doc && doc.uri.fsPath.endsWith('.flogo')) {
    bar.text = '$(book) DocGen';
    bar.show();
  } else {
    bar.hide();
  }
}

// ─── Extension activation ─────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('TIBCO DocGen');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('TIBCO DocGen extension activated.');

  const cli = findCLI(context);
  if (cli) {
    const isBundled = cli.startsWith(context.extensionPath);
    outputChannel.appendLine(`CLI: ${cli}${isBundled ? ' (bundled)' : ''}`);
  } else {
    outputChannel.appendLine('CLI not found — configure tibco-docgen.cliPath in settings.');
    vscode.window.showWarningMessage(
      'TIBCO DocGen: CLI not found. Set tibco-docgen.cliPath in settings.',
      'Open Settings'
    ).then(a => { if (a) vscode.commands.executeCommand('workbench.action.openSettings', 'tibco-docgen.cliPath'); });
  }

  // Status bar
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);
  updateStatusBar(statusBar, vscode.window.activeTextEditor);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(e => updateStatusBar(statusBar, e))
  );

  // ── Command: generate from active file or prompt ──────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('tibco-docgen.generateDocs', async () => {
      let inputPath: string | undefined;

      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc && !activeDoc.isUntitled) {
        const ext = path.extname(activeDoc.uri.fsPath).toLowerCase();
        if (['.flogo', '.ear', '.zip'].includes(ext)) {
          inputPath = activeDoc.uri.fsPath;
        }
      }

      if (!inputPath) {
        const picks = await vscode.window.showQuickPick(
          [
            { label: '$(file) Select .flogo file…',         id: 'file'   },
            { label: '$(folder) Select BW6 app folder…',    id: 'folder' },
            { label: '$(package) Select .ear / .zip archive…', id: 'ear' },
            { label: '$(server-process) Connect to EMS server…', id: 'ems' },
          ],
          { placeHolder: 'What do you want to document?' }
        );
        if (!picks) return;

        if (picks.id === 'ems') {
          await generateEMSDocs(context);
          return;
        }

        if (picks.id === 'file' || picks.id === 'ear') {
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: picks.id === 'file'
              ? { 'Flogo App': ['flogo'] }
              : { 'BW6 Archive': ['ear', 'zip'] },
            openLabel: 'Generate Documentation',
          });
          inputPath = uris?.[0]?.fsPath;
        } else {
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFolders: true,
            canSelectFiles: false,
            openLabel: 'Generate Documentation',
          });
          inputPath = uris?.[0]?.fsPath;
        }
      }

      if (!inputPath) return;
      await generateDocs(context, inputPath);
    })
  );

  // ── Command: generate from Explorer right-click ───────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'tibco-docgen.generateFromExplorer',
      async (uri?: vscode.Uri) => {
        if (!uri) return;
        await generateDocs(context, uri.fsPath);
      }
    )
  );

  // ── Command: generate EMS docs (live connection) ──────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('tibco-docgen.generateEMSDocs', async () => {
      await generateEMSDocs(context);
    })
  );

  // ── Command: open output ──────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('tibco-docgen.openOutput', async () => {
      const config = vscode.workspace.getConfiguration('tibco-docgen');
      const outDir = config.get<string>('outputDirectory', '').trim();
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const defaultOut = wsRoot ? path.join(wsRoot, 'docgen-out') : '';
      const resolved = outDir
        ? (path.isAbsolute(outDir) ? outDir : path.join(wsRoot ?? '.', outDir))
        : defaultOut;

      if (!fs.existsSync(resolved)) {
        vscode.window.showWarningMessage(`DocGen: Output directory not found: ${resolved}`);
        return;
      }
      await openGeneratedDocs(resolved);
    })
  );

  // ── Command: show output channel ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('tibco-docgen.showOutputChannel', () => {
      outputChannel.show();
    })
  );

  // ── Command: generate all in workspace ───────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('tibco-docgen.generateWorkspace', async () => {
      await generateWorkspaceDocs(context);
    })
  );

  // ── Command: copy MCP config to clipboard (all VS Code versions) ──────────
  context.subscriptions.push(
    vscode.commands.registerCommand('tibco-docgen.copyMcpConfig', async () => {
      await copyMcpConfig(context);
    })
  );

  // ── Command: add MCP server to .vscode/mcp.json (VS Code 1.99+) ──────────
  context.subscriptions.push(
    vscode.commands.registerCommand('tibco-docgen.addMcpServer', async () => {
      await addMcpServerToVSCode(context);
    })
  );
}

export function deactivate(): void {
  // nothing to clean up
}
