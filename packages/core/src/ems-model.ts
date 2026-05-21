export interface EMSDestination {
  name: string;
  type: 'queue' | 'topic';
  properties: Record<string, string>;
  isWildcard: boolean;
  /** Live stats — populated in REST/admin mode */
  pendingMessages?: number;
  inTransitCount?: number;
  consumerCount?: number;
  producerCount?: number;
}

export interface EMSFactory {
  name: string;
  factoryType: string;
  url: string;
  clientId?: string;
  ssl: boolean;
  properties: Record<string, string>;
}

export interface EMSDurable {
  topic: string;
  name: string;
  clientId?: string;
  shared?: boolean;
  properties: Record<string, string>;
}

export interface EMSBridge {
  sourceType: 'topic' | 'queue';
  sourceName: string;
  targets: Array<{ type: 'topic' | 'queue'; name: string; selector?: string }>;
}

export interface EMSUser {
  name: string;
  description?: string;
  isAdmin?: boolean;
  groups?: string[];
}

export interface EMSGroup {
  name: string;
  description?: string;
  members: string[];
}

export interface EMSACLEntry {
  /** "user:admin", "group:tibco", "@all" */
  principal: string;
  principalType: 'user' | 'group' | 'all';
  /** "*" or specific destination name */
  destination: string;
  destType: 'queue' | 'topic' | 'any';
  permissions: {
    publish?: boolean;
    subscribe?: boolean;
    durable?: boolean;
    browse?: boolean;
    create?: boolean;
    delete?: boolean;
    admin?: boolean;
    receive?: boolean;
    use?: boolean;
    modify?: boolean;
  };
  raw?: string;
}

export interface EMSRoute {
  name: string;
  url: string;
  enabled: boolean;
  properties: Record<string, string>;
}

export interface EMSTransport {
  name: string;
  type: 'tcp' | 'ssl' | 'http' | 'https' | 'other';
  port: number;
  enabled: boolean;
  properties: Record<string, string>;
}

export interface EMSStore {
  name: string;
  type: 'file' | 'async-db' | 'sync-db' | 'other';
  path?: string;
  properties: Record<string, string>;
}

/** Runtime connection — populated in REST/admin mode only */
export interface EMSLiveConnection {
  id: string;
  user: string;
  host: string;
  type: string;
  uptime?: string;
  pendingMessages?: number;
  sessions?: number;
}

/** Active consumer — populated in REST/admin mode only */
export interface EMSLiveConsumer {
  destination: string;
  destType: 'queue' | 'topic';
  connectionId?: string;
  selector?: string;
  durableName?: string;
  activeCount?: number;
}

/** Active producer — populated in REST/admin mode only */
export interface EMSLiveProducer {
  destination: string;
  destType: 'queue' | 'topic';
  connectionId?: string;
  messageCount?: number;
}

/** Live server metrics — populated in REST/admin mode */
export interface EMSLiveServerInfo {
  version?: string;
  uptime?: string;
  host?: string;
  listenUrl?: string;
  connections?: number;
  queues?: number;
  topics?: number;
  msgMemory?: string;
  msgRateIn?: number;
  msgRateOut?: number;
  license?: string;
  startTime?: string;
}

export interface EMSServerConfig {
  serverName: string;
  listenUrl?: string;
  store?: string;
  maxConnections?: string;
  authorization?: string;
  properties: Record<string, string>;
  configFiles: Record<string, string>;
}

export type EMSSourceMode = 'files' | 'admin' | 'rest';

export interface EMSModel {
  sourceMode: EMSSourceMode;
  /** Mode 1: config directory path */
  sourceDir?: string;
  /** Mode 2/3: server URL used */
  sourceUrl?: string;
  server: EMSServerConfig;
  /** Live server metrics (mode 2 & 3 only) */
  liveServerInfo?: EMSLiveServerInfo;
  queues: EMSDestination[];
  topics: EMSDestination[];
  factories: EMSFactory[];
  durables: EMSDurable[];
  bridges: EMSBridge[];
  users: EMSUser[];
  groups: EMSGroup[];
  acls: EMSACLEntry[];
  routes: EMSRoute[];
  transports: EMSTransport[];
  stores: EMSStore[];
  /** Live runtime data (mode 2 & 3 only) */
  liveConnections?: EMSLiveConnection[];
  liveConsumers?: EMSLiveConsumer[];
  liveProducers?: EMSLiveProducer[];
  generatedAt: string;
}
