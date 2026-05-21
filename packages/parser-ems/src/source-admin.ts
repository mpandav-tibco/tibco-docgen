import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  EMSModel, EMSServerConfig, EMSDestination, EMSFactory, EMSDurable, EMSBridge,
  EMSUser, EMSGroup, EMSACLEntry, EMSRoute, EMSTransport, EMSStore,
  EMSLiveConnection, EMSLiveConsumer, EMSLiveProducer, EMSLiveServerInfo,
} from '@tibco-docgen/core';

export interface EMSAdminOptions {
  /** EMS server URL, e.g. tcp://localhost:7222 */
  server: string;
  user: string;
  password: string;
  /** Full path to tibemsadmin binary (defaults to searching common install paths) */
  adminPath?: string;
  /** Timeout in ms for the admin session (default 45000) */
  timeout?: number;
}

// ─── Run tibemsadmin via script file (stdin pipe unreliable on Windows) ───────

function findAdminBinary(hint?: string): string {
  if (hint) return hint;
  // Common install paths
  const candidates = [
    'C:\\tibco\\ems\\10.5\\bin\\tibemsadmin.exe',
    'C:\\tibco\\ems\\10.3\\bin\\tibemsadmin.exe',
    'C:\\tibco\\ems\\10.1\\bin\\tibemsadmin.exe',
    '/opt/tibco/ems/10.5/bin/tibemsadmin',
    '/opt/tibco/ems/10.3/bin/tibemsadmin',
    'tibemsadmin',
  ];
  for (const c of candidates) {
    if (c !== 'tibemsadmin' && fs.existsSync(c)) return c;
  }
  return 'tibemsadmin';
}

async function runAdminScript(opts: EMSAdminOptions, commands: string): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `ems-admin-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, commands + '\nexit\n', 'utf8');

  try {
    return await new Promise((resolve, reject) => {
      const binary = findAdminBinary(opts.adminPath);
      const args = [
        '-server', opts.server,
        '-user', opts.user,
        '-password', opts.password,
        '-script', tmpFile,
        '-ignore',
      ];
      const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`tibemsadmin timed out after ${opts.timeout ?? 45000}ms`));
      }, opts.timeout ?? 45000);

      proc.on('close', () => {
        clearTimeout(timer);
        if (!stdout && stderr) {
          reject(new Error(`tibemsadmin failed: ${stderr.slice(0, 300)}`));
        } else {
          resolve(stdout);
        }
      });
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to launch tibemsadmin at '${binary}': ${err.message}`));
      });
    });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ─── Output parser ────────────────────────────────────────────────────────────

/**
 * Split tibemsadmin output into sections.
 * Script mode emits "Command: show queues\n<data>".
 * Interactive mode emits "ems> show queues\n<data>".
 */
function splitSections(output: string): Map<string, string> {
  const sections = new Map<string, string>();
  // Split on Command: or ems> lines
  const parts = output.split(/\r?\n(?=Command: |ems> )/);

  for (const part of parts) {
    const m = part.match(/^(?:Command:|ems>)\s*(.+?)(?:\r?\n|$)/);
    if (!m) continue;
    const cmd = m[1].trim().toLowerCase();
    const body = part.slice(m[0].length);
    if (cmd && cmd !== 'exit') sections.set(cmd, body);
  }
  return sections;
}

/** Extract name→value from "key = value" or "key: value" lines */
function parseKV(text: string): Record<string, string> {
  const kv: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.*)$/);
    if (m) kv[m[1].trim().toLowerCase().replace(/\s+/g, '_')] = m[2].trim();
  }
  return kv;
}

/**
 * Parse the simple list output of "show queues" / "show topics".
 * Format: 2 header rows, then data rows. No separator line.
 * We find the header row containing the destination name column and
 * use character positions derived from that row.
 */
function parseDestinationTable(text: string, nameCol: 'Queue Name' | 'Topic Name'): Array<{
  name: string; flags: string; rcvrs: number; msgs: number;
}> {
  const lines = text.split(/\r?\n/);
  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(nameCol)) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return [];

  const header = lines[headerIdx];
  // Column positions — name ends before the flags column
  const flagsCol = nameCol === 'Queue Name'
    ? header.indexOf('SNFGXIBCT')
    : header.indexOf('SNFGEIBCTM');
  if (flagsCol < 0) return [];

  // Find key columns by header position
  const rcvrsLabel = nameCol === 'Queue Name' ? 'Rcvrs' : 'Subs';
  const msgsLabel = 'Msgs';
  const rcvrsCol = header.indexOf(rcvrsLabel);
  const msgsCol  = header.lastIndexOf(msgsLabel); // first Msgs column (All Msgs)

  const results: Array<{ name: string; flags: string; rcvrs: number; msgs: number }> = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\d+\s+\w/.test(line.trim())) continue; // skip summary
    // Name: from char 0..flagsCol, trimmed, strip leading "*" (temp marker)
    const rawName = line.slice(0, flagsCol).trim().replace(/^\*\s*/, '');
    if (!rawName) continue;
    const flags = flagsCol < line.length ? line.slice(flagsCol, flagsCol + 10).trim() : '';
    const rcvrs = rcvrsCol > 0 && rcvrsCol < line.length
      ? parseInt(line.slice(rcvrsCol, rcvrsCol + 8).trim().replace(/\*/, ''), 10) || 0
      : 0;
    const msgs = msgsCol > 0 && msgsCol < line.length
      ? parseInt(line.slice(msgsCol, msgsCol + 12).trim(), 10) || 0
      : 0;
    results.push({ name: rawName, flags, rcvrs, msgs });
  }
  return results;
}

/** Parse the "show users" table */
function parseUsersTable(text: string): EMSUser[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  // Find header row
  const headerIdx = lines.findIndex(l => l.includes('User Name'));
  if (headerIdx < 0) return [];
  const header = lines[headerIdx];
  const descCol = header.indexOf('Description');
  return lines.slice(headerIdx + 1).map(line => {
    const name = descCol > 0 ? line.slice(0, descCol).trim() : line.trim();
    const desc = descCol > 0 && descCol < line.length ? line.slice(descCol).trim() : undefined;
    return { name, description: desc || undefined };
  }).filter(u => u.name && !u.name.startsWith('-'));
}

/** Parse the "show groups" table */
function parseGroupsTable(text: string): EMSGroup[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headerIdx = lines.findIndex(l => l.includes('Group Name'));
  if (headerIdx < 0) return [];
  const header = lines[headerIdx];
  const usersCol = header.indexOf('Users');
  const descCol  = header.indexOf('Description');
  return lines.slice(headerIdx + 1).map(line => {
    const name = usersCol > 0 ? line.slice(0, usersCol).trim() : line.trim();
    const desc = descCol > 0 && descCol < line.length ? line.slice(descCol).trim() : undefined;
    return { name, description: desc || undefined, members: [] };
  }).filter(g => g.name && !g.name.startsWith('-'));
}

/** Parse the "show factories" summary table → returns JNDI names */
function parseFactorySummary(text: string): Array<{ type: string; name: string }> {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headerIdx = lines.findIndex(l => l.includes('Factory') && l.includes('JNDI'));
  if (headerIdx < 0) return [];
  const header = lines[headerIdx];
  const jndiCol = header.indexOf('JNDI');
  return lines.slice(headerIdx + 1).map(line => {
    const type = jndiCol > 0 ? line.slice(0, jndiCol).trim() : '';
    const rawName = jndiCol > 0 && jndiCol < line.length ? line.slice(jndiCol).trim() : line.trim();
    // Strip surrounding quotes
    const name = rawName.replace(/^"+|"+$/g, '');
    return { type, name };
  }).filter(f => f.name && !f.name.startsWith('-'));
}

/** Parse "show factory <name>" KV output */
function parseFactoryDetail(text: string): EMSFactory | null {
  const kv = parseKV(text);
  // "Factory" field = internal type (ConnectionFactory/QueueConnectionFactory/TopicConnectionFactory)
  // "JNDI Names" field = actual JNDI name shown to clients — this is what we want
  const rawJndi = kv['jndi_names'] ?? kv['jndi_name'] ?? '';
  const name = rawJndi.replace(/^"+|"+$/g, '') || kv['factory'] || '';
  if (!name) return null;
  const url = kv['url'] ?? '';
  // Map internal factory class to our type
  const internalType = (kv['factory'] ?? '').toLowerCase();
  const factoryType = internalType.includes('queue') ? 'QUEUE'
    : internalType.includes('topic') ? 'TOPIC' : 'GENERIC';
  return {
    name,
    factoryType,
    url,
    clientId: kv['clientid'] || undefined,
    ssl: url.startsWith('ssl://'),
    properties: kv,
  };
}

/** Parse "show stores" → list of store names */
function parseStoreList(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('-') && !/^\d/.test(l));
}

/** Parse "show store <name>" KV output */
function parseStoreDetail(name: string, text: string): EMSStore {
  const kv = parseKV(text);
  const typeRaw = (kv['type'] ?? '').toLowerCase();
  const type: EMSStore['type'] = typeRaw.includes('async') ? 'async-db'
    : typeRaw.includes('sync') || typeRaw.includes('db') ? 'sync-db'
    : 'file';
  return {
    name,
    type,
    path: kv['file'] ?? kv['path'] ?? undefined,
    properties: kv,
  };
}

/** Parse "show routes" table */
function parseRoutesTable(text: string): Array<{ name: string; url: string; status: string }> {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headerIdx = lines.findIndex(l => /Route\s+T\s+ConnID/i.test(l));
  if (headerIdx < 0) return [];
  const header = lines[headerIdx];
  const urlCol = header.indexOf('URL');
  return lines.slice(headerIdx + 1).map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) return null;
    const name = parts[0];
    const url = urlCol > 0 && urlCol < line.length
      ? line.slice(urlCol).trim().split(/\s+/)[0]
      : parts[3] ?? '';
    const status = parts[1] ?? '';
    return { name, url, status };
  }).filter((r): r is { name: string; url: string; status: string } => !!r?.name && !r.name.startsWith('-'));
}

/** Parse "showacl topic/queue >" output */
function parseACLOutput(text: string, destType: 'topic' | 'queue'): EMSACLEntry[] {
  if (/No acl entries found/i.test(text)) return [];
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  // Format varies — try to parse "Principal Destination Permissions" style
  const headerIdx = lines.findIndex(l => /principal|user|permission/i.test(l));
  if (headerIdx < 0) return [];
  const header = lines[headerIdx];
  const destCol = header.toLowerCase().indexOf('dest');
  const permCol = header.toLowerCase().indexOf('perm');

  return lines.slice(headerIdx + 1).map(line => {
    if (!line.trim() || /^[-=]/.test(line.trim())) return null;
    const parts = line.trim().split(/\s{2,}/);
    if (!parts.length) return null;

    const principalRaw = parts[0] ?? '';
    let principalType: EMSACLEntry['principalType'] = 'user';
    let principal = principalRaw;
    if (principalRaw.toLowerCase().startsWith('group:')) {
      principalType = 'group'; principal = principalRaw.slice(6);
    } else if (principalRaw === '@all' || principalRaw === 'all') {
      principalType = 'all'; principal = '@all';
    }

    const dest = parts[1] ?? '*';
    const permsStr = (parts[2] ?? '').toUpperCase();
    const p = permsStr.split(/[,\s]+/);
    const has = (...names: string[]) => names.some(n => p.includes(n) || p.includes('ALL'));

    const permissions: EMSACLEntry['permissions'] = destType === 'topic'
      ? { publish: has('PUBLISH','P'), subscribe: has('SUBSCRIBE','S'), durable: has('DURABLE','D'), use: has('USE_DURABLE','U') }
      : { publish: has('SEND','P'), receive: has('RECEIVE','R'), browse: has('BROWSE','B') };

    return { principal, principalType, destination: dest, destType, permissions };
  }).filter(Boolean) as EMSACLEntry[];
}

/** Parse "show durables" */
function parseDurablesTable(text: string): EMSDurable[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headerIdx = lines.findIndex(l => /topic|durable/i.test(l) && /name/i.test(l));
  if (headerIdx < 0) return [];
  return lines.slice(headerIdx + 1).map(line => {
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length < 2) return null;
    return { topic: parts[0] ?? '', name: parts[1] ?? '', properties: {} };
  }).filter((d): d is EMSDurable => !!(d?.topic));
}

/** Parse "show bridges" */
function parseBridgesTable(text: string): EMSBridge[] {
  if (/No bridges found/i.test(text)) return [];
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headerIdx = lines.findIndex(l => /source|bridge/i.test(l));
  if (headerIdx < 0) return [];
  const bridges: EMSBridge[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length < 4) continue;
    const srcType = parts[0]?.toLowerCase().includes('queue') ? 'queue' : 'topic';
    const srcName = parts[1] ?? '';
    const tgtType = parts[2]?.toLowerCase().includes('queue') ? 'queue' : 'topic';
    const tgtName = parts[3] ?? '';
    if (!srcName || !tgtName) continue;
    const existing = bridges.find(b => b.sourceName === srcName && b.sourceType === srcType);
    if (existing) {
      existing.targets.push({ type: tgtType as 'queue' | 'topic', name: tgtName });
    } else {
      bridges.push({ sourceType: srcType as 'topic' | 'queue', sourceName: srcName, targets: [{ type: tgtType as 'queue' | 'topic', name: tgtName }] });
    }
  }
  return bridges;
}

/** Parse "show transports" */
function parseTransportsTable(text: string): EMSTransport[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headerIdx = lines.findIndex(l => /transport.*name|name.*type/i.test(l));
  if (headerIdx < 0) return [];
  return lines.slice(headerIdx + 1).map(line => {
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length < 2) return null;
    const name = parts[0] ?? '';
    const typeRaw = (parts[1] ?? name).toLowerCase();
    const type: EMSTransport['type'] = typeRaw.includes('ssl') ? 'ssl'
      : typeRaw.includes('https') ? 'https' : typeRaw.includes('http') ? 'http' : 'tcp';
    return { name, type, port: 0, enabled: true, properties: {} };
  }).filter(Boolean) as EMSTransport[];
}

/** Parse "show connections full" */
function parseConnectionsFull(text: string): EMSLiveConnection[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  // Header row contains "ID" and "User"
  const headerIdx = lines.findIndex(l => /\bID\b/.test(l) && /\bUser\b/.test(l));
  if (headerIdx < 0) return [];
  const header = lines[headerIdx];
  const idCol   = header.indexOf(' ID');
  const hostCol = header.indexOf('Host');
  const userCol = header.indexOf('User');
  const sessCol = header.indexOf('Sess');
  const uptCol  = header.indexOf('Uptime');

  return lines.slice(headerIdx + 1).map(line => {
    if (!line.trim() || /^[-=]/.test(line)) return null;
    const typeChar = line[0]?.toUpperCase() ?? 'C';
    const id   = idCol > 0   ? line.slice(idCol, idCol + 8).trim()     : '';
    const host = hostCol > 0 ? line.slice(hostCol, hostCol + 16).trim() : '';
    const user = userCol > 0 ? line.slice(userCol, userCol + 10).trim() : '';
    const sess = sessCol > 0 ? parseInt(line.slice(sessCol, sessCol + 6).trim(), 10) || 0 : 0;
    const upt  = uptCol > 0  ? line.slice(uptCol).trim().split(/\s+/)[0] : undefined;
    if (!id && !user) return null;
    return { id, user, host, type: typeChar, sessions: sess, uptime: upt, pendingMessages: 0 };
  }).filter(Boolean) as EMSLiveConnection[];
}

/** Parse "show consumers" */
function parseConsumersTable(text: string): EMSLiveConsumer[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headerIdx = lines.findIndex(l => /\bId\b/.test(l) && /Conn/i.test(l));
  if (headerIdx < 0) return [];
  const header = lines[headerIdx];
  const typeCol = header.indexOf(' T ');
  const destCol = typeCol > 0 ? typeCol + 3 : -1;
  const connCol = header.indexOf('Conn');

  return lines.slice(headerIdx + 1).map(line => {
    if (!line.trim() || /^[-=]/.test(line)) return null;
    const parts = line.trim().split(/\s+/);
    const typeChar = typeCol > 0 && typeCol < line.length ? line[typeCol + 1]?.toUpperCase() : 'Q';
    const destType: 'queue' | 'topic' = typeChar === 'T' ? 'topic' : 'queue';
    const dest = destCol > 0 && destCol < line.length ? line.slice(destCol).trim().split(/\s+/)[0] : parts[4] ?? '';
    const connId = connCol > 0 ? line.slice(connCol, connCol + 6).trim() : parts[1] ?? undefined;
    if (!dest) return null;
    return { destination: dest, destType, connectionId: connId || undefined, activeCount: 1 };
  }).filter(Boolean) as EMSLiveConsumer[];
}

/** Parse "show server" KV block into EMSLiveServerInfo */
function parseServerInfo(text: string): EMSLiveServerInfo {
  const info: EMSLiveServerInfo = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s+([^:]+):\s+(.+)$/);
    if (!m) continue;
    const k = m[1].trim().toLowerCase();
    const v = m[2].trim();
    if (k === 'server') {
      // "EMS-SERVER (version: 10.5.0 V2)" → split on " ("
      info.host = v.replace(/\s+\(.+$/, '').trim();
      const vm = v.match(/version:\s+([\d.]+)/);
      if (vm) info.version = vm[1];
    }
    else if (k === 'uptime') info.uptime = v;
    else if (k === 'license') info.license = v;
    else if (k === 'topics') info.topics = parseInt(v, 10) || 0;
    else if (k === 'queues') info.queues = parseInt(v, 10) || 0;
    else if (k === 'client connections') info.connections = parseInt(v, 10) || 0;
    else if (k.includes('inbound message rate')) {
      const n = v.match(/^(\d+)/);
      if (n) info.msgRateIn = parseInt(n[1], 10) || 0;
    } else if (k.includes('outbound message rate')) {
      const n = v.match(/^(\d+)/);
      if (n) info.msgRateOut = parseInt(n[1], 10) || 0;
    } else if (k === 'message memory usage') info.msgMemory = v;
  }
  return info;
}

// ─── parseEMSFromAdmin (Mode 2) ───────────────────────────────────────────────

export async function parseEMSFromAdmin(opts: EMSAdminOptions): Promise<EMSModel> {
  // Phase 1: get all list-level data
  const phase1 = [
    'show server',
    'show queues',
    'show topics',
    'show factories',
    'show durables',
    'show bridges type=queue',
    'show bridges type=topic',
    'show routes',
    'show transports',
    'show stores',
    'show users',
    'show groups',
    'showacl topic >',
    'showacl queue >',
    'show connections full',
    'show consumers',
  ].join('\n');

  const rawPhase1 = await runAdminScript(opts, phase1);
  const sec1 = splitSections(rawPhase1);

  function section(keyword: string): string {
    for (const [cmd, body] of sec1) {
      if (cmd.includes(keyword)) return body;
    }
    return '';
  }

  // Parse factory and store names for phase 2
  const factorySummary = parseFactorySummary(section('show factories'));
  const storeNames = parseStoreList(section('show stores'));
  const routeList = parseRoutesTable(section('show routes'));

  // Phase 2: per-object details
  const phase2Cmds = [
    ...factorySummary.map(f => `show factory ${f.name}`),
    ...storeNames.map(n => `show store ${n}`),
  ].join('\n');

  let sec2 = new Map<string, string>();
  if (phase2Cmds.trim()) {
    const rawPhase2 = await runAdminScript(opts, phase2Cmds);
    sec2 = splitSections(rawPhase2);
  }

  // Build factories from phase 2 detail output
  const factories: EMSFactory[] = [];
  for (const { name, type } of factorySummary) {
    const detailKey = `show factory ${name.toLowerCase()}`;
    const detailBody = sec2.get(detailKey) ?? '';
    const factory = parseFactoryDetail(detailBody);
    if (factory) {
      factories.push(factory);
    } else {
      factories.push({ name, factoryType: type, url: '', ssl: false, properties: {} });
    }
  }

  // Build stores from phase 2 detail output
  const stores: EMSStore[] = storeNames.map(name => {
    const detailKey = `show store ${name.toLowerCase()}`;
    const detailBody = sec2.get(detailKey) ?? '';
    return parseStoreDetail(name, detailBody);
  });

  // Queues and topics from list output
  const queueRows = parseDestinationTable(section('show queues'), 'Queue Name');
  const queues: EMSDestination[] = queueRows.map(r => ({
    name: r.name, type: 'queue' as const, properties: {},
    isWildcard: r.name.includes('*') || r.name.includes('>'),
    pendingMessages: r.msgs, consumerCount: r.rcvrs, inTransitCount: 0, producerCount: 0,
  }));

  const topicRows = parseDestinationTable(section('show topics'), 'Topic Name');
  const topics: EMSDestination[] = topicRows.map(r => ({
    name: r.name, type: 'topic' as const, properties: {},
    isWildcard: r.name.includes('*') || r.name.includes('>'),
    pendingMessages: r.msgs, consumerCount: r.rcvrs, inTransitCount: 0, producerCount: 0,
  }));

  // Routes from list
  const routes: EMSRoute[] = routeList.map(r => ({
    name: r.name, url: r.url,
    enabled: r.status.toUpperCase() !== 'D',
    properties: { status: r.status },
  }));

  // Bridges — combine both type sections
  const queueBridges = parseBridgesTable(section('show bridges type=queue'));
  const topicBridges = parseBridgesTable(section('show bridges type=topic'));
  const bridges = [...queueBridges, ...topicBridges];

  // ACLs — combine topic and queue
  const topicACLs = parseACLOutput(section('showacl topic >'), 'topic');
  const queueACLs = parseACLOutput(section('showacl queue >'), 'queue');
  const acls = [...topicACLs, ...queueACLs];

  const liveInfo = parseServerInfo(section('show server'));
  const server: EMSServerConfig = {
    serverName:     liveInfo.host ?? opts.server,
    listenUrl:      opts.server,
    maxConnections: liveInfo.connections != null ? String(liveInfo.connections) : undefined,
    authorization:  undefined,
    properties:     { server: opts.server },
    configFiles:    {},
  };

  return {
    sourceMode:      'admin',
    sourceUrl:       opts.server,
    server,
    liveServerInfo:  liveInfo,
    queues,
    topics,
    factories,
    durables:        parseDurablesTable(section('show durables')),
    bridges,
    users:           parseUsersTable(section('show users')),
    groups:          parseGroupsTable(section('show groups')),
    acls,
    routes,
    transports:      parseTransportsTable(section('show transports')),
    stores,
    liveConnections: parseConnectionsFull(section('show connections full')),
    liveConsumers:   parseConsumersTable(section('show consumers')),
    liveProducers:   [],
    generatedAt:     new Date().toISOString(),
  };
}
