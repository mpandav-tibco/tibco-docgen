import { DocModel, FlowDoc, ActivityDoc, TriggerDoc, ConnectionDoc } from '../../model';
import { html } from '../../html-safe';

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Groups flows by their parent prefix (the part before the first `/` in flow.id). */
export function groupFlowsByParent(flows: FlowDoc[]): Map<string, FlowDoc[]> {
  const groups = new Map<string, FlowDoc[]>();
  for (const f of flows) {
    const slashIdx = f.id.indexOf('/');
    const key = slashIdx >= 0 ? f.id.slice(0, slashIdx) : f.id;
    const arr = groups.get(key);
    if (arr) arr.push(f);
    else groups.set(key, [f]);
  }
  return groups;
}

export function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ─── Palette helpers ──────────────────────────────────────────────────────────

export const PALETTE_DISPLAY_NAMES: Record<string, string> = {
  // BW6 on-prem shortNames (from com.tibco.bw.palette.<name>)
  'generalactivities': 'General Activities',
  'restx':             'REST & JSON',
  'rest':              'REST & JSON',
  'restjson':          'REST & JSON',
  'jdbc':              'JDBC',
  'ems':               'TIBCO EMS',
  'jms':               'JMS',
  'kafka':             'Apache Kafka',
  'log':               'Log',
  'file':              'File',
  'timer':             'Timer / Sleep',
  'core':              'BW Core',
  'api':               'Process API',
  'xml':               'XML',
  'json':              'JSON',
  'ftp':               'FTP',
  'mail':              'Mail',
  'tcp':               'TCP',
  'http':              'HTTP',
  'soap':              'SOAP',
  'aws':               'AWS',
  's3':                'Amazon S3',
  'sap':               'SAP',
  'salesforce':        'Salesforce',
  'servicenow':        'ServiceNow',
  'subprocess':        'Sub-Process',
  // BWCE Require-Capability names (from bw.<name>)
  'adbplugin':         'TIBCO Data Plane',
  'cred':              'Credentials',
  'trustresource':     'Trust Provider',
  'jndiconfiguration': 'JNDI',
  'jmsconnection':     'JMS Connection',
  'kafkaconnection':   'Kafka Connection',
  'adbpluginconnection': 'ADB Connection',
  'rag':               'RAG / AI',
};

export function paletteDisplayName(shortName: string): string {
  return PALETTE_DISPLAY_NAMES[shortName.toLowerCase()] ?? shortName;
}

// "com.tibco.bw.palette.rest.runtime.RESTHTTPReceiveEventActivity" → "rest" / "kafka" / etc.
export function paletteFromType(type: string): string {
  const t = (type ?? '').toLowerCase();
  if (t.includes('kafka'))                                                return 'kafka';
  if (t.includes('jdbc') || t.includes('sql'))                           return 'jdbc';
  if (t.includes('ems') || t.includes('jms'))                            return 'ems';
  if (t.includes('rest') || t.includes('http'))                          return 'rest';
  if (t.includes('log'))                                                  return 'log';
  if (t.includes('sharedvariable'))                                       return 'sharedvar';
  if (t.includes('timer') || t.includes('sleep') || t.includes('wait')) return 'timer';
  if (t.includes('throw') || t.includes('rethrow'))                      return 'error';
  if (t.includes('callprocess') || t.includes('subprocess'))             return 'subprocess';
  if (t.includes('receive') || t.includes('reply') || t.includes('invoke')) return 'service';
  if (t.includes('generalactivities') || t.includes('generalmapping') ||
      t.includes('mapper') || t.includes('assign'))                       return 'generalactivities';
  // Technology connector palettes
  if (t.includes('sap'))                                                  return 'sap';
  if (t.includes('salesforce') || t.includes('sfdc'))                    return 'salesforce';
  if (t.includes('servicenow'))                                           return 'servicenow';
  if (t.includes('.s3') || t.includes('aws') || t.includes('lambda'))    return 'aws';
  if (t.includes('adbplugin') || t.includes('datarequester') ||
      t.includes('datamerger') || t.includes('datapoller'))              return 'adbplugin';
  // Fallback: extract from .palette.<name>.
  if (t.includes('.palette.')) {
    const after = t.split('.palette.')[1] ?? '';
    return after.split('.')[0] ?? 'generalactivities';
  }
  return 'generalactivities';
}

// "RESTHTTPReceiveEventActivity" → "HTTP Receive Event"
export function humanizeType(type: string): string {
  const last = (type.split('.').pop() ?? type).replace(/Activity$/, '');
  const normalized = last
    .replace(/^RESTHTTP/, 'HTTP')
    .replace(/^RESTx/, 'RESTx ')
    .replace(/^JDBC/, 'JDBC ')
    .replace(/^EMS/, 'EMS ')
    .replace(/^JMS/, 'JMS ')
    .replace(/^GetSharedVariable$/, 'Get Shared Variable')
    .replace(/^SetSharedVariable$/, 'Set Shared Variable')
    .replace(/^GeneralMapping$/, 'Mapping')
    .replace(/^EngineCommand$/, 'Engine Command')
    .replace(/^CallProcess$/, 'Call Process')
    .replace(/^ReceiveEvent$/, 'Receive Event');
  return normalized
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

// Authoritative lookup by activityTypeID (e.g. "bw.generalactivities.sleep")
// Returns [paletteShortName, humanTypeLabel] or undefined if not recognized
export const TYPE_ID_MAP: Record<string, [string, string]> = {
  // General Activities palette
  'bw.generalactivities.log':               ['general', 'Log'],
  'bw.generalactivities.mapper':            ['general', 'Mapper'],
  'bw.generalactivities.assign':            ['general', 'Assign'],
  'bw.generalactivities.callprocess':       ['general', 'Call Process'],
  'bw.generalactivities.getsharedvariable': ['general', 'Get Shared Variable'],
  'bw.generalactivities.setsharedvariable': ['general', 'Set Shared Variable'],
  'bw.generalactivities.throw':             ['general', 'Throw'],
  'bw.generalactivities.rethrow':           ['general', 'Rethrow'],
  'bw.generalactivities.receiveevent':      ['general', 'Receive Event'],
  'bw.generalactivities.invoke':            ['general', 'Invoke'],
  'bw.generalactivities.reply':             ['general', 'Reply'],
  'bw.generalactivities.wait':              ['general', 'Wait'],
  // Timer (still under generalactivities namespace but different Studio palette group)
  'bw.generalactivities.sleep':             ['basic', 'Sleep'],
  // File palette
  'bw.file.read':                           ['file', 'Read File'],
  'bw.file.write':                          ['file', 'Write File'],
  'bw.file.delete':                         ['file', 'Delete File'],
  'bw.file.list':                           ['file', 'List Files'],
  // XML palette
  'bw.xml.parsexml':                        ['xml', 'Parse XML'],
  'bw.xml.renderxml':                       ['xml', 'Render XML'],
  'bw.xml.validate':                        ['xml', 'Validate XML'],
  // JSON palette
  'bw.json.parsejson':                      ['json', 'Parse JSON'],
  'bw.json.renderjson':                     ['json', 'Render JSON'],
  // JDBC palette
  'bw.jdbc.jdbcquery':                      ['jdbc', 'JDBC Query'],
  'bw.jdbc.jdbcupdate':                     ['jdbc', 'JDBC Update'],
  'bw.jdbc.jdbccall':                       ['jdbc', 'JDBC Call'],
  // REST palette
  'bw.rest.invoke':                         ['rest', 'REST Invoke'],
  'bw.rest.httpreceive':                    ['rest', 'HTTP Receive'],
  'bw.rest.httpsend':                       ['rest', 'HTTP Send'],
  // EMS palette
  'bw.ems.send':                            ['ems', 'EMS Send'],
  'bw.ems.receive':                         ['ems', 'EMS Receive'],
  'bw.ems.requestreply':                    ['ems', 'EMS Request/Reply'],
  // Kafka palette
  'bw.kafka.send':                          ['kafka', 'Kafka Send'],
  'bw.kafka.subscribe':                     ['kafka', 'Kafka Subscribe'],
};

// Short display names for palette column in activity badge
export const PALETTE_SHORT_NAMES: Record<string, string> = {
  'general':    'General',
  'basic':      'Basic',
  'file':       'File',
  'xml':        'XML',
  'json':       'JSON',
  'jdbc':       'JDBC',
  'rest':       'REST',
  'ems':        'EMS',
  'kafka':      'Kafka',
  'sap':        'SAP',
  'salesforce': 'Salesforce',
  'aws':        'AWS',
  's3':         'S3',
  'servicenow': 'ServiceNow',
  'adbplugin':  'DataPlane',
  'log':        'General',
  'timer':      'Basic',
  'subprocess': 'General',
  'service':    'General',
  'sharedvar':  'General',
  'error':      'General',
  'api':        'Process',
};

export function paletteShortDisplay(pal: string): string {
  return PALETTE_SHORT_NAMES[pal.toLowerCase()] ?? paletteDisplayName(pal);
}

// For ActivityExtensionActivity wrappers derive human type from the activity name
export function humanTypeForActivity(ref: string, actName: string, typeId?: string): string {
  if (typeId) {
    const mapped = TYPE_ID_MAP[typeId.toLowerCase()];
    if (mapped) return mapped[1];
  }
  const cls = (ref.split('.').pop() ?? '').toLowerCase();
  if (cls === 'activityextensionactivity') {
    return actName
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
  }
  return humanizeType(ref);
}

// For ActivityExtensionActivity detect palette from activity name
export function paletteForActivity(ref: string, actName: string, typeId?: string): string {
  if (typeId) {
    const mapped = TYPE_ID_MAP[typeId.toLowerCase()];
    if (mapped) return mapped[0];
    // Fallback: derive from typeId prefix
    const parts = typeId.split('.');
    if (parts.length >= 2) return parts[1] ?? 'generalactivities';
  }
  const cls = (ref.split('.').pop() ?? '').toLowerCase();
  if (cls === 'activityextensionactivity') {
    const n = actName.toLowerCase();
    if (/log/.test(n))             return 'log';
    if (/sleep|wait/.test(n))      return 'timer';
    if (/file|read|write/.test(n)) return 'file';
    if (/xml|parse/.test(n))       return 'xml';
    if (/json/.test(n))            return 'json';
    if (/http|rest/.test(n))       return 'rest';
    if (/jdbc|sql/.test(n))        return 'jdbc';
    if (/ems|jms/.test(n))         return 'ems';
    return 'generalactivities';
  }
  return paletteFromType(ref);
}

export function palCls(palette: string): string {
  const p = palette.toLowerCase();
  if (p === 'rest' || p === 'http')                                    return 'pal-rest';
  if (p === 'restx')                                                   return 'pal-restx';
  if (p === 'jdbc' || p === 'sql' || p === 'db')                      return 'pal-jdbc';
  if (p.includes('ems') || p.includes('jms'))                         return 'pal-ems';
  if (p === 'kafka')                                                   return 'pal-kafka';
  if (p === 'sap')                                                     return 'pal-sap';
  if (p === 'salesforce' || p === 'sfdc')                              return 'pal-salesforce';
  if (p === 'aws' || p === 's3')                                       return 'pal-aws';
  if (p === 'servicenow')                                              return 'pal-servicenow';
  if (p === 'adbplugin' || p === 'adb')                               return 'pal-adb';
  if (p === 'log' || p === 'logger')                                   return 'pal-log';
  if (p === 'sharedvar')                                               return 'pal-sharedvar';
  if (p === 'error' || p === 'fault')                                  return 'pal-error';
  if (p === 'service')                                                 return 'pal-service';
  if (p === 'subprocess')                                              return 'pal-subprocess';
  if (p === 'generalactivities' || p === 'general')                   return 'pal-general';
  if (p === 'basic')                                                   return 'pal-timer';
  if (p === 'timer' || p === 'wait' || p === 'sleep')                 return 'pal-timer';
  if (p === 'api' || p === 'core')                                    return 'pal-api';
  if (p === 'file')                                                   return 'pal-file';
  if (p === 'xml' || p === 'json')                                    return 'pal-xml';
  return 'pal-general';
}

export function categoryFromType(type: string): string {
  const t = (type ?? '').toLowerCase();
  if (t.includes('jdbc') || t.includes('sql') || t.includes('database')) return 'JDBC';
  if (t.includes('ems') || t.includes('jms'))  return 'EMS';
  if (t.includes('kafka'))                     return 'Kafka';
  if (t.includes('rest') || t.includes('http')) return 'REST';
  if (t.includes('file'))                      return 'File';
  return 'Other';
}

export function categoryIcon(cat: string): string {
  if (cat === 'JDBC')  return '🗄';
  if (cat === 'EMS' || cat === 'JMS') return '📨';
  if (cat === 'Kafka') return '📨';
  if (cat === 'REST' || cat === 'HTTP') return '🌐';
  if (cat === 'File')  return '📁';
  return '🔌';
}

export function starterBadge(ref: string): string {
  const r = ref.toLowerCase();
  if (r.includes('kafka'))                        return `<span class="badge-starter pal-kafka">Kafka</span>`;
  if (r.includes('rest') || r.includes('http'))   return `<span class="badge-starter pal-rest">REST/HTTP</span>`;
  if (r.includes('restx'))                        return `<span class="badge-starter pal-restx">REST&amp;JSON</span>`;
  if (r.includes('ems') || r.includes('jms'))     return `<span class="badge-starter pal-ems">EMS/JMS</span>`;
  if (r.includes('timer') || r.includes('sleep')) return `<span class="badge-starter pal-timer">Timer</span>`;
  if (r.includes('jdbc'))                         return `<span class="badge-starter pal-jdbc">JDBC</span>`;
  if (r.includes('sap'))                          return `<span class="badge-starter pal-sap">SAP</span>`;
  if (r.includes('salesforce'))                   return `<span class="badge-starter pal-salesforce">Salesforce</span>`;
  if (r.includes('servicenow'))                   return `<span class="badge-starter pal-servicenow">ServiceNow</span>`;
  return `<span class="badge-starter pal-general">Starter</span>`;
}

export function transTypeBadge(type: string): string {
  const t = type.toLowerCase();
  if (t === 'error')      return `<span class="trans-badge trans-error">error</span>`;
  if (t === 'expression') return `<span class="trans-badge trans-cond">condition</span>`;
  if (t === 'default')    return `<span class="trans-badge trans-default">otherwise</span>`;
  return `<span class="trans-badge trans-always">always</span>`;
}

export function renderBW6Value(value: unknown): string {
  if (value == null || value === '') return '<span style="color:#94a3b8">—</span>';
  const s = String(value);
  if (/^#!.+!$/.test(s)) return '<span class="encrypted">🔒 encrypted</span>';
  // Use html`` to auto-escape the raw value, then mark substvar spans as safe
  const escaped = html`${s}`.value;
  return escaped.replace(/%%\{([^}]+)\}%%/g, (_, name) =>
    html`<span class="subst-ref">${name}</span>`.value,
  );
}

export interface ParsedPalette { bundleId: string; shortName: string; displayName: string; }

export function parsePalette(entry: string): ParsedPalette {
  const parts = entry.split(';');
  const bundleId = (parts[0] ?? '').trim();
  const segments = bundleId.split('.');
  const shortName = segments[segments.length - 1] ?? bundleId;
  return { bundleId, shortName, displayName: paletteDisplayName(shortName) };
}

export function dedupePalettes(palettes: ParsedPalette[]): ParsedPalette[] {
  const seen = new Set<string>();
  return palettes.filter(p => {
    const key = p.displayName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groupConnections(conns: ConnectionDoc[]): Map<string, ConnectionDoc[]> {
  const map = new Map<string, ConnectionDoc[]>();
  for (const c of conns) {
    const cat = categoryFromType(c.ref || c.type);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(c);
  }
  return map;
}

export function buildFlowTriggerMap(model: DocModel): Map<string, TriggerDoc> {
  const m = new Map<string, TriggerDoc>();
  for (const t of model.triggers) {
    for (const h of t.handlers) {
      m.set(h.flowRef, t);
    }
  }
  return m;
}

/**
 * Builds a resolver for cross-module callProcess navigation.
 * Returns a function: ActivityDoc → URL | null.
 * Only returns a URL when the activity has a processRef that maps to a known process.
 *
 * currentDepth='main'      → page is at processes/{id}.html
 * currentDepth='sharedlib' → page is at sharedlibs/{libId}/processes/{id}.html
 */
export function getAppDisplayName(model: DocModel): string {
  // model.app.name is now the application Bundle-Name (from sibling .application project).
  // If for any reason it still has "Module" suffix, strip it.
  return model.app.name.replace(/\s+Module\s*$/i, '').trim() || model.app.name;
}

export function buildProcessLinkResolver(
  model: DocModel,
  currentDepth: 'main' | 'sharedlib',
  currentLibId?: string,
): (act: ActivityDoc) => string | null {
  const refMap = new Map<string, string>();

  if (currentDepth === 'main') {
    // Same-module processes: NOT included — callProcess within same module
    // falls back to #activity-{id} anchor (no cross-module badge).
    // SharedLib processes: ../sharedlibs/{libId}/processes/{pId}.html
    for (const lib of model.bw6SharedLibs ?? []) {
      const libId = safeId(lib.id);
      for (const flow of lib.flows) {
        refMap.set(flow.id, `../sharedlibs/${libId}/processes/${safeId(flow.id)}.html`);
      }
    }
  } else {
    // Same SharedLib: Y.html (same dir)
    // Other SharedLib: ../../{libId}/processes/{pId}.html
    for (const lib of model.bw6SharedLibs ?? []) {
      const libId = safeId(lib.id);
      for (const flow of lib.flows) {
        if (libId === currentLibId) {
          refMap.set(flow.id, `${safeId(flow.id)}.html`);
        } else {
          refMap.set(flow.id, `../../${libId}/processes/${safeId(flow.id)}.html`);
        }
      }
    }
    // Main module: ../../../processes/{pId}.html
    for (const flow of model.flows) {
      refMap.set(flow.id, `../../../processes/${safeId(flow.id)}.html`);
    }
  }

  return (act: ActivityDoc): string | null => {
    // BWCE uses processName; BW6 on-prem / stubs may use processRef
    const processRef = (act.settings?.processRef ?? act.settings?.processName) as string | undefined;
    if (!processRef || typeof processRef !== 'string') return null;
    // Exact match
    const exact = refMap.get(processRef);
    if (exact) return exact;
    // Suffix match: processName may have extra qualifiers (e.g. "bwcelib.module.Foo" vs "bwcelib.Foo")
    // Try matching on the last dot-segment (process short name)
    const shortName = processRef.split('.').pop();
    if (shortName) {
      for (const [key, url] of refMap) {
        if (key.split('.').pop() === shortName) return url;
      }
    }
    return null;
  };
}
