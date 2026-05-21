import * as https from 'https';
import type {
  EMSModel, EMSServerConfig, EMSDestination, EMSFactory, EMSDurable, EMSBridge,
  EMSUser, EMSGroup, EMSACLEntry, EMSRoute, EMSTransport, EMSStore,
  EMSLiveConnection, EMSLiveConsumer, EMSLiveProducer, EMSLiveServerInfo,
} from '@tibco-docgen/core';

export interface EMSRestOptions {
  /** Base URL of the EMS REST Proxy, e.g. http://localhost:8080 */
  url: string;
  user: string;
  password: string;
  /** Skip TLS certificate validation (useful for self-signed certs) */
  ignoreSslErrors?: boolean;
}

// ─── Session cookie auth (EMS REST proxy uses POST /connect → Set-Cookie) ────

interface Session {
  baseUrl: string;
  cookie: string;
  ignoreSsl?: boolean;
}

async function login(opts: EMSRestOptions): Promise<Session> {
  const baseUrl = opts.url.replace(/\/$/, '');
  const auth = Buffer.from(`${opts.user}:${opts.password}`).toString('base64');

  const fetchOpts: RequestInit = {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
  };

  if (opts.ignoreSslErrors && baseUrl.startsWith('https://')) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    (fetchOpts as Record<string, unknown>)['agent'] = agent;
  }

  const res = await fetch(`${baseUrl}/connect`, fetchOpts);
  if (!res.ok) {
    throw new Error(`EMS REST /connect → HTTP ${res.status}: ${res.statusText}. Check URL and credentials.`);
  }

  // Extract session cookie — format: "SESSION=xxx; Path=/; HttpOnly"
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('EMS REST /connect succeeded but returned no session cookie');
  }
  const cookie = setCookie.split(';')[0].trim();
  return { baseUrl, cookie, ignoreSsl: opts.ignoreSslErrors };
}

async function logout(session: Session): Promise<void> {
  try {
    await sessionPost(session, '/disconnect');
  } catch {
    // Ignore disconnect errors — session may already be expired
  }
}

async function sessionGet(session: Session, path: string): Promise<unknown> {
  const url = `${session.baseUrl}${path}`;
  const fetchOpts: RequestInit = {
    headers: { 'Cookie': session.cookie, 'Accept': 'application/json' },
  };
  if (session.ignoreSsl && url.startsWith('https://')) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    (fetchOpts as Record<string, unknown>)['agent'] = agent;
  }
  const res = await fetch(url, fetchOpts);
  if (!res.ok) throw new Error(`EMS REST GET ${path} → HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function sessionPost(session: Session, path: string): Promise<void> {
  const url = `${session.baseUrl}${path}`;
  const fetchOpts: RequestInit = {
    method: 'POST',
    headers: { 'Cookie': session.cookie, 'Accept': 'application/json' },
  };
  if (session.ignoreSsl && url.startsWith('https://')) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    (fetchOpts as Record<string, unknown>)['agent'] = agent;
  }
  await fetch(url, fetchOpts);
}

async function tryGet(session: Session, path: string): Promise<unknown> {
  try {
    return await sessionGet(session, path);
  } catch (e) {
    const msg = (e as Error).message;
    if (!msg.includes('404') && !msg.includes('405')) {
      process.stderr.write(`[docgen] WARN: ${msg}\n`);
    }
    return null;
  }
}

// ─── Response normalizers ─────────────────────────────────────────────────────

function unwrapArray(data: unknown, ...keys: string[]): unknown[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    for (const key of keys) {
      const v = (data as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
    const vals = Object.values(data as object);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0] as unknown[];
  }
  return [];
}

function str(v: unknown): string { return v == null ? '' : String(v); }
function num(v: unknown): number { return typeof v === 'number' ? v : parseInt(str(v), 10) || 0; }
function bool(v: unknown, def = true): boolean {
  if (typeof v === 'boolean') return v;
  const s = str(v).toLowerCase();
  if (s === 'false' || s === '0') return false;
  if (s === '' && !def) return false;
  return def;
}
function nested(o: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = o[key];
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
}

// ─── Map REST responses to our model types ────────────────────────────────────

function mapQueue(q: unknown): EMSDestination {
  const o = q as Record<string, unknown>;
  const stats = nested(o, 'statistics');
  const name = str(o['name'] ?? o['Name'] ?? '');
  const rawProps = nested(o, 'properties');
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (v != null && typeof v !== 'object') props[k] = str(v);
  }
  return {
    name,
    type: 'queue',
    properties: props,
    isWildcard: name.includes('*') || name.includes('>'),
    pendingMessages:  num(stats['pending_message_count'] ?? o['PendingMessageCount']),
    inTransitCount:   num(stats['in_transit_message_count'] ?? o['InTransitCount']),
    consumerCount:    num(stats['consumer_count'] ?? o['ConsumerCount']),
    producerCount:    0,
  };
}

function mapTopic(t: unknown): EMSDestination {
  const o = t as Record<string, unknown>;
  const stats = nested(o, 'statistics');
  const name = str(o['name'] ?? o['Name'] ?? '');
  const rawProps = nested(o, 'properties');
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (v != null && typeof v !== 'object') props[k] = str(v);
  }
  return {
    name,
    type: 'topic',
    properties: props,
    isWildcard: name.includes('*') || name.includes('>'),
    pendingMessages:  num(stats['pending_message_count'] ?? o['PendingMessageCount']),
    inTransitCount:   0,
    consumerCount:    num(stats['consumer_count'] ?? o['ConsumerCount']),
    producerCount:    0,
  };
}

function mapFactory(f: unknown): EMSFactory {
  const o = f as Record<string, unknown>;
  const url = str(o['url'] ?? o['Url'] ?? o['URL'] ?? '');
  const skip = new Set(['type', 'xa', 'url', 'client_id', 'server_group', 'server_role',
    'load_balancing_metric', 'connect_attempt_count', 'connect_attempt_delay',
    'connect_attempt_timeout', 'reconnect_attempt_count', 'reconnect_attempt_delay',
    'reconnect_attempt_timeout']);
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!skip.has(k) && v != null && typeof v !== 'object') props[k] = str(v);
  }
  return {
    name:        str((o['aliases'] as string[])?.[0] ?? o['alias'] ?? o['name'] ?? o['Name'] ?? ''),
    factoryType: str(o['type'] ?? o['Type'] ?? o['factoryType'] ?? 'GENERIC'),
    url,
    clientId:    str(o['client_id'] ?? o['clientId'] ?? o['ClientID']) || undefined,
    ssl:         url.startsWith('ssl://'),
    properties:  props,
  };
}

function mapDurable(d: unknown): EMSDurable {
  const o = d as Record<string, unknown>;
  const selector = str(o['selector'] ?? '');
  return {
    topic:    str(o['topic'] ?? o['Topic'] ?? ''),
    name:     str(o['name'] ?? o['Name'] ?? ''),
    clientId: str(o['client_id'] ?? o['clientId'] ?? o['ClientID']) || undefined,
    shared:   bool(o['shared'] ?? o['Shared'], false),
    properties: selector ? { selector } : {},
  };
}

function mapBridge(b: unknown): EMSBridge {
  const o = b as Record<string, unknown>;
  // REST API uses flat structure: source_name, source_type, target_name, target_type
  const srcTypeRaw = str(o['source_type'] ?? o['SourceType'] ?? o['sourceType'] ?? 'TOPIC');
  const srcType = srcTypeRaw.toUpperCase() === 'QUEUE' ? 'queue' : 'topic';
  const tgtTypeRaw = str(o['target_type'] ?? o['TargetType'] ?? o['targetType'] ?? 'QUEUE');
  const tgtType = tgtTypeRaw.toUpperCase() === 'QUEUE' ? 'queue' : 'topic';
  const tgtName = str(o['target_name'] ?? o['TargetName'] ?? o['targetName'] ?? '');
  const targets: EMSBridge['targets'] = [];
  if (tgtName) {
    targets.push({ type: tgtType, name: tgtName, selector: str(o['selector'] ?? '') || undefined });
  }
  return {
    sourceType: srcType,
    sourceName: str(o['source_name'] ?? o['SourceName'] ?? o['sourceName'] ?? o['name'] ?? ''),
    targets,
  };
}

function mapUser(u: unknown): EMSUser {
  const o = u as Record<string, unknown>;
  return {
    name:        str(o['name'] ?? o['Name'] ?? o['username'] ?? ''),
    description: str(o['description'] ?? o['Description']) || undefined,
    isAdmin:     bool(o['admin'] ?? o['isAdmin'] ?? o['IsAdmin'], false),
  };
}

function mapGroup(g: unknown): EMSGroup {
  const o = g as Record<string, unknown>;
  // GroupGet embeds users as array of UserGet objects
  const usersArr = unwrapArray(o['users'], 'users', 'members', 'Members');
  const members = usersArr.map(u => {
    if (typeof u === 'string') return u;
    const uo = u as Record<string, unknown>;
    return str(uo['name'] ?? uo['Name'] ?? uo['username'] ?? u);
  }).filter(Boolean);
  return {
    name:        str(o['name'] ?? o['Name'] ?? ''),
    description: str(o['description'] ?? o['Description']) || undefined,
    members,
  };
}

// Map REST ACL permission string arrays to our boolean-flag model
function permsFromArray(permsArr: string[], resourceType: string): EMSACLEntry['permissions'] {
  const p = permsArr.map(s => s.toUpperCase());
  const has = (...names: string[]) => names.some(n => p.includes(n) || p.includes('ALL'));
  if (resourceType === 'ADMIN') {
    return { admin: true };
  }
  if (resourceType === 'QUEUE') {
    return {
      publish:   has('SEND'),
      receive:   has('RECEIVE'),
      browse:    has('BROWSE'),
      create:    has('CREATE'),
      delete:    has('DELETE'),
      modify:    has('MODIFY'),
    };
  }
  // TOPIC
  return {
    publish:   has('PUBLISH'),
    subscribe: has('SUBSCRIBE'),
    durable:   has('DURABLE'),
    use:       has('USE_DURABLE'),
    create:    has('CREATE'),
    delete:    has('DELETE'),
    modify:    has('MODIFY'),
  };
}

function mapACL(a: unknown): EMSACLEntry {
  const o = a as Record<string, unknown>;
  const principal = nested(o, 'principal');
  const resource  = nested(o, 'resource');

  const principalName = str(principal['name'] ?? o['Principal'] ?? o['principal'] ?? '');
  const principalTypeRaw = str(principal['type'] ?? '').toUpperCase();
  const principalType: EMSACLEntry['principalType'] =
    principalTypeRaw === 'GROUP' ? 'group'
    : (principalName === '@all' || principalName === '*') ? 'all'
    : 'user';

  const resourceType = str(resource['type'] ?? o['DestinationType'] ?? '').toUpperCase();
  const destType: EMSACLEntry['destType'] =
    resourceType === 'QUEUE' ? 'queue'
    : resourceType === 'TOPIC' ? 'topic' : 'any';
  const destination = str(resource['name'] ?? o['Destination'] ?? '*');

  const permsRaw = resource['permissions'] ?? o['Permissions'] ?? o['permissions'];
  let permissions: EMSACLEntry['permissions'] = {};
  if (Array.isArray(permsRaw)) {
    permissions = permsFromArray(permsRaw as string[], resourceType);
  } else if (typeof permsRaw === 'object' && permsRaw) {
    const po = permsRaw as Record<string, unknown>;
    permissions = {
      publish:   bool(po['publish']   ?? po['PUBLISH'],   false),
      subscribe: bool(po['subscribe'] ?? po['SUBSCRIBE'], false),
      durable:   bool(po['durable']   ?? po['DURABLE'],   false),
      browse:    bool(po['browse']    ?? po['BROWSE'],    false),
      create:    bool(po['create']    ?? po['CREATE'],    false),
      delete:    bool(po['delete']    ?? po['DELETE'],    false),
      admin:     bool(po['admin']     ?? po['ALL'],       false),
      receive:   bool(po['receive']   ?? po['RECEIVE'],   false),
      use:       bool(po['use']       ?? po['USE_DURABLE'], false),
      modify:    bool(po['modify']    ?? po['MODIFY'],    false),
    };
  }

  return { principal: principalName, principalType, destination, destType, permissions };
}

function mapRoute(r: unknown): EMSRoute {
  const o = r as Record<string, unknown>;
  const instanceInfo = nested(o, 'instance_info');
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!['name', 'url', 'instance_info', 'statistics', 'server_group', 'server_role', 'tls', 'oauth2', 'selectors'].includes(k)
        && v != null && typeof v !== 'object') {
      props[k] = str(v);
    }
  }
  return {
    name:    str(o['name'] ?? ''),
    url:     str(o['url'] ?? ''),
    enabled: bool(instanceInfo['connected'] ?? o['Enabled'] ?? o['enabled'], true),
    properties: props,
  };
}

function mapTransport(t: unknown): EMSTransport {
  const o = t as Record<string, unknown>;
  const name = str(o['name'] ?? o['Name'] ?? '');
  const typeRaw = str(o['type'] ?? o['Type'] ?? o['protocol'] ?? name).toLowerCase();
  const type: EMSTransport['type'] =
    typeRaw.includes('ssl') ? 'ssl'
    : typeRaw.includes('https') ? 'https'
    : typeRaw.includes('http') ? 'http' : 'tcp';
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!['name', 'type', 'port', 'enabled', 'server_group', 'server_role'].includes(k)
        && v != null && typeof v !== 'object') {
      props[k] = str(v);
    }
  }
  return {
    name,
    type,
    port:    num(o['port'] ?? o['Port']),
    enabled: bool(o['enabled'] ?? o['Enabled'], true),
    properties: props,
  };
}

function mapStore(s: unknown): EMSStore {
  const o = s as Record<string, unknown>;
  const typeRaw = str(o['type'] ?? o['Type'] ?? o['store_type'] ?? 'file').toLowerCase();
  const type: EMSStore['type'] =
    typeRaw === '' || typeRaw === 'file' ? 'file'
    : typeRaw.includes('async') ? 'async-db'
    : typeRaw.includes('sync') || typeRaw.includes('db') ? 'sync-db' : 'other';
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!['name', 'type', 'path', 'file', 'server_group', 'server_role'].includes(k)
        && v != null && typeof v !== 'object') {
      props[k] = str(v);
    }
  }
  return {
    name: str(o['name'] ?? o['Name'] ?? ''),
    type,
    path: str(o['path'] ?? o['file'] ?? o['Path'] ?? o['File']) || undefined,
    properties: props,
  };
}

function mapConnection(c: unknown): EMSLiveConnection {
  const o = c as Record<string, unknown>;
  const info  = nested(o, 'instance_info');
  const stats = nested(o, 'statistics');
  // uptime is integer seconds in the REST API
  const uptimeSec = num(info['uptime'] ?? 0);
  let uptimeStr: string | undefined;
  if (uptimeSec > 0) {
    const d = Math.floor(uptimeSec / 86400);
    const h = Math.floor((uptimeSec % 86400) / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    uptimeStr = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  return {
    id:              str(info['id'] ?? o['id'] ?? o['ID'] ?? ''),
    user:            str(o['user'] ?? o['User'] ?? ''),
    host:            str(info['client_host'] ?? o['host'] ?? o['Host'] ?? ''),
    type:            str(o['client_type'] ?? o['type'] ?? o['Type'] ?? ''),
    uptime:          uptimeStr,
    sessions:        num(stats['session_count'] ?? o['sessions']),
    pendingMessages: 0,
  };
}

function mapConsumer(c: unknown): EMSLiveConsumer {
  const o = c as Record<string, unknown>;
  const info = nested(o, 'instance_info');
  const dt = str(o['destination_type'] ?? o['DestinationType'] ?? 'QUEUE');
  const isDurable = bool(o['durable'], false);
  return {
    destination:  str(o['destination_name'] ?? o['Destination'] ?? ''),
    destType:     dt.toUpperCase() === 'QUEUE' ? 'queue' : 'topic',
    connectionId: str(info['connection_id'] ?? o['connectionId'] ?? o['ConnectionID']) || undefined,
    selector:     str(o['selector'] ?? o['Selector']) || undefined,
    durableName:  isDurable ? (str(o['subscription_name'] ?? '') || undefined) : undefined,
    activeCount:  1,
  };
}

function mapProducer(p: unknown): EMSLiveProducer {
  const o = p as Record<string, unknown>;
  const info = nested(o, 'instance_info');
  const dt = str(o['destination_type'] ?? o['DestinationType'] ?? 'QUEUE');
  return {
    destination:  str(o['destination_name'] ?? o['Destination'] ?? ''),
    destType:     dt.toUpperCase() === 'QUEUE' ? 'queue' : 'topic',
    connectionId: str(info['connection_id'] ?? o['connectionId'] ?? o['ConnectionID']) || undefined,
    messageCount: 0,
  };
}

function mapServerInfo(data: unknown): EMSLiveServerInfo {
  if (!data || typeof data !== 'object') return {};

  // /server returns { servers: [ { ... } ] } — take first
  let o: Record<string, unknown>;
  const arr = unwrapArray(data, 'servers', 'server');
  if (arr.length > 0) {
    o = arr[0] as Record<string, unknown>;
  } else {
    o = data as Record<string, unknown>;
  }

  const stats    = nested(o, 'statistics');
  const instanceInfo = nested(o, 'instance_info');
  // version is nested inside instance_info in the EMS REST API
  const versionObj = nested(instanceInfo, 'version');
  const vStr = versionObj['major'] != null
    ? `${versionObj['major']}.${versionObj['minor'] ?? 0}.${versionObj['update'] ?? 0}`
    : str(o['version'] ?? '');

  // uptime is seconds integer in instance_info
  const uptimeSec = num(instanceInfo['uptime'] ?? o['uptime'] ?? 0);
  let uptimeStr: string | undefined;
  if (uptimeSec > 0) {
    const d = Math.floor(uptimeSec / 86400);
    const h = Math.floor((uptimeSec % 86400) / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    uptimeStr = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // start_time is epoch ms in instance_info → convert to ISO string
  const startMs = num(instanceInfo['start_time'] ?? 0);
  const startTimeStr = startMs > 0 ? new Date(startMs).toISOString() : undefined;

  // listens is array of listen URLs; take first
  const listens = Array.isArray(o['listens']) ? (o['listens'] as string[]) : [];

  // license info from nested license_status object
  const licenseStatus = nested(instanceInfo, 'license_status');
  const licenseStr = str(licenseStatus['message'] ?? instanceInfo['license'] ?? o['license'] ?? '') || undefined;

  return {
    version:     vStr || undefined,
    uptime:      uptimeStr,
    host:        str(o['name'] ?? o['host'] ?? instanceInfo['hostname'] ?? '') || undefined,
    listenUrl:   listens[0] ?? (str(o['listen_url'] ?? '') || undefined),
    connections: num(stats['connection_count'] ?? 0),
    queues:      num(stats['queue_count'] ?? stats['dynamic_queue_count'] ?? 0),
    topics:      num(stats['topic_count'] ?? stats['dynamic_topic_count'] ?? 0),
    msgMemory:   str(stats['message_memory'] ?? '') || undefined,
    msgRateIn:   num(stats['inbound_messages_per_second'] ?? stats['inbound_message_rate'] ?? 0),
    msgRateOut:  num(stats['outbound_messages_per_second'] ?? stats['outbound_message_rate'] ?? 0),
    license:     licenseStr,
    startTime:   startTimeStr,
  };
}

// ─── parseEMSFromRest (Mode 3 — preferred) ───────────────────────────────────

export async function parseEMSFromRest(opts: EMSRestOptions): Promise<EMSModel> {
  const session = await login(opts);

  try {
    const [
      serverData, queuesData, topicsData, factoriesData, durablesData, bridgesData,
      routesData, transportsData, storesData, usersData, groupsData, aclsData,
      connectionsData, consumersData, producersData,
    ] = await Promise.all([
      tryGet(session, '/server'),
      tryGet(session, '/queues'),
      tryGet(session, '/topics'),
      tryGet(session, '/factories'),
      tryGet(session, '/durables'),
      tryGet(session, '/bridges'),
      tryGet(session, '/routes'),
      tryGet(session, '/transports'),
      tryGet(session, '/stores'),
      tryGet(session, '/users'),
      tryGet(session, '/groups'),
      tryGet(session, '/acls'),
      tryGet(session, '/connections'),
      tryGet(session, '/consumers'),
      tryGet(session, '/producers'),
    ]);

    const liveInfo = mapServerInfo(serverData);

    const server: EMSServerConfig = {
      serverName:     liveInfo.host ?? opts.url,
      listenUrl:      liveInfo.listenUrl,
      maxConnections: liveInfo.connections != null ? String(liveInfo.connections) : undefined,
      authorization:  undefined,
      properties:     { url: opts.url },
      configFiles:    {},
    };

    return {
      sourceMode:    'rest',
      sourceUrl:     opts.url,
      server,
      liveServerInfo: liveInfo,
      queues:       unwrapArray(queuesData,      'queues',      'Queues').map(mapQueue),
      topics:       unwrapArray(topicsData,      'topics',      'Topics').map(mapTopic),
      factories:    unwrapArray(factoriesData,   'factories',   'Factories').map(mapFactory),
      durables:     unwrapArray(durablesData,    'durables',    'Durables').map(mapDurable),
      bridges:      unwrapArray(bridgesData,     'bridges',     'Bridges').map(mapBridge),
      users:        unwrapArray(usersData,       'users',       'Users').map(mapUser),
      groups:       unwrapArray(groupsData,      'groups',      'Groups').map(mapGroup),
      acls:         unwrapArray(aclsData,        'acls',        'ACLs').map(mapACL),
      routes:       unwrapArray(routesData,      'routes',      'Routes').map(mapRoute),
      transports:   unwrapArray(transportsData,  'transports',  'Transports').map(mapTransport),
      stores:       unwrapArray(storesData,      'stores',      'Stores').map(mapStore),
      liveConnections: connectionsData
        ? unwrapArray(connectionsData, 'connections', 'Connections').map(mapConnection)
        : undefined,
      liveConsumers: consumersData
        ? unwrapArray(consumersData, 'consumers', 'Consumers').map(mapConsumer)
        : undefined,
      liveProducers: producersData
        ? unwrapArray(producersData, 'producers', 'Producers').map(mapProducer)
        : undefined,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await logout(session);
  }
}
