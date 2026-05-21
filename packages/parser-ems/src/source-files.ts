import * as fs from 'fs';
import * as path from 'path';
import type {
  EMSModel, EMSServerConfig, EMSDestination, EMSFactory, EMSDurable, EMSBridge,
  EMSUser, EMSGroup, EMSACLEntry, EMSRoute, EMSTransport, EMSStore,
} from '@tibco-docgen/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripComment(line: string): string {
  const idx = line.indexOf('#');
  if (idx === 0) return '';
  if (idx > 0 && (line[idx - 1] === ' ' || line[idx - 1] === '\t')) {
    return line.slice(0, idx).trim();
  }
  return line;
}

function readLines(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function parseDestProps(propsStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!propsStr.trim()) return result;
  for (const part of propsStr.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq >= 0) {
      result[p.slice(0, eq).trim()] = p.slice(eq + 1).trim().replace(/^"|"$/g, '');
    } else {
      result[p] = 'true';
    }
  }
  return result;
}

// ─── tibemsd.conf ─────────────────────────────────────────────────────────────

export function parseServerConfig(confPath: string): EMSServerConfig {
  const lines = readLines(confPath);
  const props: Record<string, string> = {};
  const configFiles: Record<string, string> = {};
  const CFG_KEYS = new Set([
    'users', 'groups', 'topics', 'queues', 'acl_list', 'factories',
    'routes', 'bridges', 'transports', 'tibrvcm', 'durables', 'channels', 'stores',
  ]);

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const m = line.match(/^([^\s=]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim(), val = m[2].trim();
    props[key] = val;
    if (CFG_KEYS.has(key) && val) configFiles[key] = val;
  }

  return {
    serverName:     props['server']          ?? 'EMS-SERVER',
    listenUrl:      props['listen']          ?? undefined,
    store:          props['store']           ?? undefined,
    maxConnections: props['max_connections'] ?? undefined,
    authorization:  props['authorization']   ?? undefined,
    properties:     props,
    configFiles,
  };
}

// ─── queues.conf / topics.conf ────────────────────────────────────────────────

export function parseDestinationFile(filePath: string, destType: 'queue' | 'topic'): EMSDestination[] {
  const lines = readLines(filePath);
  const dests: EMSDestination[] = [];
  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const spaceIdx = line.search(/\s/);
    const name = spaceIdx < 0 ? line : line.slice(0, spaceIdx).trim();
    const propsStr = spaceIdx < 0 ? '' : line.slice(spaceIdx + 1).trim();
    if (!name) continue;
    dests.push({
      name,
      type: destType,
      properties: parseDestProps(propsStr),
      isWildcard: name.includes('*') || name.includes('>'),
    });
  }
  return dests;
}

// ─── factories.conf ───────────────────────────────────────────────────────────

export function parseFactoriesFile(filePath: string): EMSFactory[] {
  const lines = readLines(filePath);
  const factories: EMSFactory[] = [];
  let current: EMSFactory | null = null;

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;

    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      if (current) factories.push(current);
      current = { name: section[1].trim(), factoryType: 'generic', url: '', ssl: false, properties: {} };
      continue;
    }

    if (!current) continue;
    const m = line.match(/^([^\s=]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim(), val = m[2].trim().replace(/^"|"$/g, '');
    current.properties[key] = val;
    if (key === 'type')     current.factoryType = val;
    if (key === 'url')      { current.url = val; current.ssl = val.startsWith('ssl://'); }
    if (key === 'clientID') current.clientId = val;
  }
  if (current) factories.push(current);
  return factories;
}

// ─── durables.conf ────────────────────────────────────────────────────────────

export function parseDurablesFile(filePath: string): EMSDurable[] {
  const lines = readLines(filePath);
  const durables: EMSDurable[] = [];
  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const parts = line.match(/^(\S+)\s+(\S+)\s*(.*)$/);
    if (!parts) continue;
    durables.push({ topic: parts[1], name: parts[2], properties: parseDestProps(parts[3] ?? '') });
  }
  return durables;
}

// ─── bridges.conf ─────────────────────────────────────────────────────────────

export function parseBridgesFile(filePath: string): EMSBridge[] {
  const lines = readLines(filePath);
  const bridges: EMSBridge[] = [];
  let current: EMSBridge | null = null;

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;

    const section = line.match(/^\[(\w+):([^\]]+)\]$/);
    if (section) {
      if (current) bridges.push(current);
      current = {
        sourceType: section[1] as 'topic' | 'queue',
        sourceName: section[2].trim(),
        targets: [],
      };
      continue;
    }

    if (!current) continue;
    const m = line.match(/^(topic|queue)\s*=\s*(\S+)(?:\s+selector="([^"]*)")?/);
    if (m) current.targets.push({ type: m[1] as 'topic' | 'queue', name: m[2], selector: m[3] });
  }
  if (current) bridges.push(current);
  return bridges;
}

// ─── users.conf ───────────────────────────────────────────────────────────────

export function parseUsersFile(filePath: string): EMSUser[] {
  const lines = readLines(filePath);
  const users: EMSUser[] = [];
  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    // Format: username  [password]  [description="..."]  [flags]
    const parts = line.split(/\s+/);
    const name = parts[0];
    if (!name) continue;
    const rest = parts.slice(1).join(' ');
    const descMatch = rest.match(/description="([^"]*)"/i);
    const isAdmin = /\badmin\b/i.test(rest);
    users.push({ name, description: descMatch?.[1], isAdmin });
  }
  return users;
}

// ─── groups.conf ──────────────────────────────────────────────────────────────

export function parseGroupsFile(filePath: string): EMSGroup[] {
  const lines = readLines(filePath);
  const groups: EMSGroup[] = [];
  let current: EMSGroup | null = null;

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;

    // INI section style: [groupname]
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      if (current) groups.push(current);
      current = { name: section[1].trim(), members: [] };
      continue;
    }

    if (current) {
      // member = username  OR  members = u1,u2,u3
      const m = line.match(/^members?\s*=\s*(.+)$/i);
      if (m) {
        current.members.push(...m[1].split(/[,\s]+/).filter(Boolean));
        continue;
      }
      // description = "..."
      const d = line.match(/^description\s*=\s*"?([^"]*)"?$/i);
      if (d) { current.description = d[1]; continue; }
    } else {
      // Flat style: groupname  member1 member2 ...  OR  groupname member1,member2
      const parts = line.split(/\s+/);
      if (parts.length >= 1) {
        const name = parts[0];
        const members = parts.slice(1).flatMap(p => p.split(',').filter(Boolean));
        groups.push({ name, members });
      }
    }
  }
  if (current) groups.push(current);
  return groups;
}

// ─── acl_list (acls.conf) ─────────────────────────────────────────────────────

function parsePermissions(permStr: string): EMSACLEntry['permissions'] {
  const s = permStr.toUpperCase();
  return {
    publish:   s.includes('P'),
    subscribe: s.includes('S'),
    durable:   s.includes('D') || s.includes('U'),
    browse:    s.includes('B'),
    create:    s.includes('C'),
    delete:    s.includes('L') || s.includes('X'),
    admin:     s.includes('A'),
    use:       s.includes('E'),
    modify:    s.includes('M'),
    receive:   s.includes('R'),
  };
}

export function parseACLFile(filePath: string): EMSACLEntry[] {
  const lines = readLines(filePath);
  const acls: EMSACLEntry[] = [];

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;

    // Format: PRINCIPAL  DESTINATION  PERMISSIONS
    // PRINCIPAL: user:name | group:name | @all
    // DESTINATION: * | name  (type inferred from context or default 'any')
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const principalRaw = parts[0];
    const destination  = parts[1];
    const permRaw      = parts[2] ?? '';

    let principalType: EMSACLEntry['principalType'] = 'user';
    let principal = principalRaw;

    if (principalRaw.startsWith('user:')) {
      principalType = 'user';
      principal = principalRaw.slice(5);
    } else if (principalRaw.startsWith('group:') || principalRaw.startsWith('grp:')) {
      principalType = 'group';
      principal = principalRaw.slice(principalRaw.indexOf(':') + 1);
    } else if (principalRaw === '@all' || principalRaw === '*') {
      principalType = 'all';
      principal = '@all';
    }

    // Destination type prefix: queue:name or topic:name or bare name
    let destType: EMSACLEntry['destType'] = 'any';
    let dest = destination;
    if (destination.startsWith('queue:')) { destType = 'queue'; dest = destination.slice(6); }
    else if (destination.startsWith('topic:')) { destType = 'topic'; dest = destination.slice(6); }

    acls.push({
      principal,
      principalType,
      destination: dest,
      destType,
      permissions: parsePermissions(permRaw),
      raw: line,
    });
  }
  return acls;
}

// ─── routes.conf ──────────────────────────────────────────────────────────────

export function parseRoutesFile(filePath: string): EMSRoute[] {
  const lines = readLines(filePath);
  const routes: EMSRoute[] = [];
  let current: EMSRoute | null = null;

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;

    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      if (current) routes.push(current);
      current = { name: section[1].trim(), url: '', enabled: true, properties: {} };
      continue;
    }

    if (!current) continue;
    const m = line.match(/^([^\s=]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim(), val = m[2].trim().replace(/^"|"$/g, '');
    current.properties[key] = val;
    if (key === 'url')     current.url = val;
    if (key === 'enabled') current.enabled = val.toLowerCase() !== 'false' && val !== '0';
  }
  if (current) routes.push(current);
  return routes;
}

// ─── transports.conf ──────────────────────────────────────────────────────────

function inferTransportType(name: string, props: Record<string, string>): EMSTransport['type'] {
  const n = name.toLowerCase();
  if (n.includes('ssl') || props['ssl_cert_file']) return 'ssl';
  if (n.includes('https')) return 'https';
  if (n.includes('http')) return 'http';
  return 'tcp';
}

export function parseTransportsFile(filePath: string): EMSTransport[] {
  const lines = readLines(filePath);
  const transports: EMSTransport[] = [];
  let current: { name: string; props: Record<string, string> } | null = null;

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;

    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      if (current) {
        const type = inferTransportType(current.name, current.props);
        transports.push({
          name: current.name,
          type,
          port: parseInt(current.props['port'] ?? '0', 10),
          enabled: current.props['enabled']?.toLowerCase() !== 'false',
          properties: current.props,
        });
      }
      current = { name: section[1].trim(), props: {} };
      continue;
    }

    if (!current) continue;
    const m = line.match(/^([^\s=]+)\s*=\s*(.*)$/);
    if (!m) continue;
    current.props[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  }

  if (current) {
    const type = inferTransportType(current.name, current.props);
    transports.push({
      name: current.name,
      type,
      port: parseInt(current.props['port'] ?? '0', 10),
      enabled: current.props['enabled']?.toLowerCase() !== 'false',
      properties: current.props,
    });
  }
  return transports;
}

// ─── stores.conf ──────────────────────────────────────────────────────────────

function inferStoreType(props: Record<string, string>): EMSStore['type'] {
  const t = (props['type'] ?? '').toLowerCase();
  if (t === 'file' || t === '') return 'file';
  if (t.includes('async')) return 'async-db';
  if (t.includes('sync') || t.includes('db')) return 'sync-db';
  return 'other';
}

export function parseStoresFile(filePath: string): EMSStore[] {
  const lines = readLines(filePath);
  const stores: EMSStore[] = [];
  let current: { name: string; props: Record<string, string> } | null = null;

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;

    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      if (current) {
        stores.push({
          name: current.name,
          type: inferStoreType(current.props),
          path: current.props['file'] ?? current.props['path'] ?? undefined,
          properties: current.props,
        });
      }
      current = { name: section[1].trim(), props: {} };
      continue;
    }

    if (!current) continue;
    const m = line.match(/^([^\s=]+)\s*=\s*(.*)$/);
    if (!m) continue;
    current.props[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  }

  if (current) {
    stores.push({
      name: current.name,
      type: inferStoreType(current.props),
      path: current.props['file'] ?? current.props['path'] ?? undefined,
      properties: current.props,
    });
  }
  return stores;
}

// ─── canParse ─────────────────────────────────────────────────────────────────

export function canParse(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, 'tibemsd.conf'));
}

// ─── parseEMSConfig (Mode 1) ─────────────────────────────────────────────────

export function parseEMSConfig(configDir: string): EMSModel {
  const mainConf = path.join(configDir, 'tibemsd.conf');
  const server = fs.existsSync(mainConf)
    ? parseServerConfig(mainConf)
    : { serverName: 'EMS-SERVER', properties: {}, configFiles: {} } as EMSServerConfig;

  function resolve(key: string, fallback: string): string {
    const v = server.configFiles[key];
    if (!v) return path.join(configDir, fallback);
    return path.isAbsolute(v) ? v : path.join(configDir, v);
  }

  const queues      = parseDestinationFile(resolve('queues',     'queues.conf'),      'queue');
  const topics      = parseDestinationFile(resolve('topics',     'topics.conf'),      'topic');
  const factories   = parseFactoriesFile(resolve('factories',   'factories.conf'));
  const durables    = parseDurablesFile(resolve('durables',     'durables.conf'));
  const bridges     = parseBridgesFile(resolve('bridges',       'bridges.conf'));
  const users       = parseUsersFile(resolve('users',           'users.conf'));
  const groups      = parseGroupsFile(resolve('groups',         'groups.conf'));
  const acls        = parseACLFile(resolve('acl_list',          'acls.conf'));
  const routes      = parseRoutesFile(resolve('routes',         'routes.conf'));
  const transports  = parseTransportsFile(resolve('transports', 'transports.conf'));
  const stores      = parseStoresFile(resolve('stores',         'stores.conf'));

  return {
    sourceMode: 'files',
    sourceDir: configDir,
    server,
    queues,
    topics,
    factories,
    durables,
    bridges,
    users,
    groups,
    acls,
    routes,
    transports,
    stores,
    generatedAt: new Date().toISOString(),
  };
}
