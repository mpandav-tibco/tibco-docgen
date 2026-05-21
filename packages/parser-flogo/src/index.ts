import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  DocModel, AppInfo, FlowDoc, ActivityDoc, LinkDoc,
  FlowDiagram, TriggerDoc, TriggerHandler, ConnectionDoc,
  PropertyDoc, FlowMetadata, SchemaDoc, SpecDoc, QAViolation,
} from '@tibco-docgen/core';
import {
  FlogoApp, FlogoTask, FlogoLink, FlogoConnection, FlogoResource,
} from './types';

function resolveFlowId(flowURI?: string): string {
  if (!flowURI) return '';
  // "res://flow:FlowName" -> "flow:FlowName"
  return flowURI.replace(/^res:\/\//, '');
}

function decodePositions(feMetadata?: string): Record<string, { x: number; y: number }> {
  if (!feMetadata) return {};
  try {
    return JSON.parse(Buffer.from(feMetadata, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

function computeDiagram(
  tasks: FlogoTask[],
  links: FlogoLink[],
  positions: Record<string, { x: number; y: number }>
): FlowDiagram {
  const ACTIVITY_W = 120;
  const ACTIVITY_H = 60;
  const H_GAP = 60;
  const V_GAP = 30;
  const PADDING = 60;

  if (tasks.length === 0) {
    return { positions: {}, width: 400, height: 120 };
  }

  // Renderer card size — must match ACTIVITY_W/ACTIVITY_H in flow-renderer.ts
  const RENDER_W = 130;
  const RENDER_H = 84;
  const MIN_GAP = 15; // minimum clear space between adjacent cards

  // Use stored positions only when complete AND no cards would overlap
  const storedComplete = tasks.every(t => positions[t.id]);
  const storedClean = storedComplete && !links.some(l => {
    const fp = positions[l.from];
    const tp = positions[l.to];
    if (!fp || !tp) return false;
    const dx = Math.abs(tp.x - fp.x);
    const dy = Math.abs(tp.y - fp.y);
    return (dx >= dy && dx < RENDER_W + MIN_GAP) ||
           (dy > dx  && dy < RENDER_H + MIN_GAP);
  });

  if (storedClean) {
    const xs = tasks.map(t => positions[t.id].x);
    const ys = tasks.map(t => positions[t.id].y);
    return {
      positions,
      width:  Math.max(...xs) - Math.min(...xs) + ACTIVITY_W + PADDING * 2,
      height: Math.max(...ys) - Math.min(...ys) + ACTIVITY_H + PADDING * 2,
    };
  }

  // Full BFS layout — longest-path level assignment via Kahn's algorithm
  const out = new Map<string, string[]>();
  const deg = new Map<string, number>();
  for (const t of tasks) { out.set(t.id, []); deg.set(t.id, 0); }
  for (const l of links) {
    if (out.has(l.from) && deg.has(l.to)) {
      out.get(l.from)!.push(l.to);
      deg.set(l.to, deg.get(l.to)! + 1);
    }
  }

  const levelMap = new Map<string, number>();
  for (const t of tasks) levelMap.set(t.id, 0);

  // Seed with root nodes (no incoming links); fall back to all if circular
  const queue: string[] = [];
  for (const [id, d] of deg) if (d === 0) queue.push(id);
  if (queue.length === 0) for (const t of tasks) queue.push(t.id);

  const done = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (done.has(cur)) continue;
    done.add(cur);
    const nextLv = levelMap.get(cur)! + 1;
    for (const nxt of out.get(cur)!) {
      levelMap.set(nxt, Math.max(levelMap.get(nxt)!, nextLv));
      deg.set(nxt, deg.get(nxt)! - 1);
      if (deg.get(nxt) === 0) queue.push(nxt);
    }
  }
  // Nodes not reached by BFS (inside cycles) go at the end
  const maxLv = Math.max(...levelMap.values());
  for (const t of tasks) if (!done.has(t.id)) levelMap.set(t.id, maxLv + 1);

  // Group by level; preserve task declaration order within each level
  const byLevel = new Map<number, string[]>();
  for (const t of tasks) {
    const lv = levelMap.get(t.id)!;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(t.id);
  }

  const filled: Record<string, { x: number; y: number }> = {};
  for (const [lv, ids] of byLevel) {
    ids.forEach((id, row) => {
      filled[id] = {
        x: PADDING + lv * (ACTIVITY_W + H_GAP),
        y: PADDING + row * (ACTIVITY_H + V_GAP),
      };
    });
  }

  const xs = Object.values(filled).map(p => p.x);
  const ys = Object.values(filled).map(p => p.y);
  return {
    positions: filled,
    width:  Math.max(...xs) - Math.min(...xs) + ACTIVITY_W + PADDING * 2,
    height: Math.max(...ys) - Math.min(...ys) + ACTIVITY_H + PADDING * 2,
  };
}

function parseActivities(tasks: FlogoTask[]): ActivityDoc[] {
  return tasks.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    type: shortRef(t.activity.ref),
    ref: t.activity.ref,
    settings: t.activity.settings,
    input: t.activity.input,
  }));
}

function parseLinks(links: FlogoLink[]): LinkDoc[] {
  return (links ?? []).map(l => ({
    id: l.id,
    from: l.from,
    to: l.to,
    type: l.type === 'expression' ? 'expression' : 'label',
    label: l.label,
    condition: l.value,
  }));
}

function parseFlow(resource: FlogoResource): FlowDoc {
  const data = resource.data;
  const tasks = data.tasks ?? [];
  const links = data.links ?? [];
  const positions = decodePositions(data.fe_metadata);
  const diagram = computeDiagram(tasks, links, positions);

  const metadata: FlowMetadata | undefined =
    data.metadata?.input?.length || data.metadata?.output?.length
      ? {
          input: (data.metadata?.input ?? []).map(f => ({
            name: f.name,
            type: f.type,
            required: f.required ?? false,
          })),
          output: (data.metadata?.output ?? []).map(f => ({
            name: f.name,
            type: f.type,
          })),
        }
      : undefined;

  return {
    id: resource.id,
    name: data.name,
    description: data.description ?? '',
    activities: parseActivities(tasks),
    links: parseLinks(links),
    diagram,
    metadata,
  };
}

function parseTriggers(app: FlogoApp): TriggerDoc[] {
  return (app.triggers ?? []).map(t => ({
    id: t.id,
    name: t.id,
    description: t.description ?? '',
    ref: t.ref,
    type: shortRef(t.ref),
    settings: t.settings,
    handlers: t.handlers.map(h => ({
      name: h.name,
      description: h.description,
      flowRef: resolveFlowId(h.action?.settings?.flowURI),
      settings: h.settings,
      input: h.action?.input,
      output: h.action?.output,
    } as TriggerHandler)),
  }));
}

function parseConnections(app: FlogoApp): ConnectionDoc[] {
  const conns = app.connections ?? {};
  return Object.entries(conns).map(([id, c]) => ({
    id,
    name: c.name ?? id,
    description: c.description,
    type: shortRef(c.ref),
    ref: c.ref,
    settings: c.settings,
  }));
}

function parseSchemas(app: FlogoApp): SchemaDoc[] {
  return Object.entries(app.schemas ?? {}).map(([name, s]) => ({
    name,
    type: s.type,
    value: s.value,
  }));
}

function parseSpecs(app: FlogoApp): SpecDoc[] {
  return Object.entries(app.specs ?? {}).map(([, s]) => {
    const content = (() => {
      try { return Buffer.from(s.content, 'base64').toString('utf8'); }
      catch { return s.content; }
    })();

    const type = s.type ?? 'other';
    let title: string | undefined;
    let version: string | undefined;
    let basePath: string | undefined;
    let endpoints: string[] | undefined;

    if (type === 'openapi' || type === 'swagger') {
      const titleM = content.match(/^title:\s*(.+)$/m) ?? content.match(/"title"\s*:\s*"([^"]+)"/);
      if (titleM) title = titleM[1].trim().replace(/['"]/g, '');
      const verM = content.match(/^\s*version:\s*(.+)$/m) ?? content.match(/"version"\s*:\s*"([^"]+)"/);
      if (verM) version = verM[1].trim().replace(/['"]/g, '');
      const bpM = content.match(/^basePath:\s*(.+)$/m);
      if (bpM) basePath = bpM[1].trim();
      const pathMatches = content.match(/^  (\/[^\s:]+)\s*:/gm) ?? [];
      if (pathMatches.length > 0) {
        endpoints = pathMatches.slice(0, 20).map(p => p.trim().replace(/:$/, ''));
      }
    }

    return {
      id: s.id,
      name: s.name,
      type,
      content,
      title: title || s.name,
      version,
      basePath,
      endpoints,
    };
  });
}

function parseProperties(app: FlogoApp): PropertyDoc[] {
  return (app.properties ?? []).map(p => ({
    name: p.name,
    type: p.type,
    value: p.value !== undefined ? String(p.value) : undefined,
    description: p.description,
  }));
}

function shortRef(ref: string): string {
  return ref.replace(/^#/, '').split('/').pop() ?? ref;
}

// ─── Flogo QA Analysis ────────────────────────────────────────────────────────

const CRED_KEYS = /^(password|passwd|secret|apikey|api_key|token|accesstoken|access_token|privatekey|private_key|credential|auth|authorization|clientsecret|client_secret|keystore|truststore|passphrase)$/i;
const SAFE_VALUE = /^(=|\$property\[|\$env\[|SECRET:)/;
const SENSITIVE_WORDS = /\b(password|passwd|secret|apikey|api_key|token|credential|auth|private[_.]?key)\b/i;
const DB_REFS = /\b(mysql|postgres|oracle|mssql|sql|jdbc|db)\b/i;
const REST_REFS = /\/(rest|http|restclient)\b/i;
const LOG_REFS = /\/(log|logger)\b/i;
const SLEEP_REFS = /\/sleep\b/i;
const SUBFLOW_REFS = /\/(subflow|invoke|callprocess)\b/i;
const RETURN_REFS = /\/(actreturn|return|reply|sendreply)\b/i;
const START_REFS  = /\/(noop|start)\b/i;
const DEPRECATED_FUNS = [
  { pat: /string\.tostring\(/gi, replacement: 'coerce.toString()' },
  { pat: /string\.integer\(/gi,  replacement: 'coerce.toInt()' },
  { pat: /string\.float\(/gi,    replacement: 'coerce.toFloat64()' },
];

function isSafeValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  if (s === '') return true;
  return SAFE_VALUE.test(s);
}

function deepSearchStrings(obj: unknown, cb: (v: string, key: string) => void, parentKey = ''): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') { cb(obj, parentKey); return; }
  if (Array.isArray(obj)) { obj.forEach(v => deepSearchStrings(v, cb, parentKey)); return; }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      deepSearchStrings(v, cb, k);
    }
  }
}

function analyzeFlogoQA(
  flows: FlowDoc[],
  triggers: TriggerDoc[],
  connections: ConnectionDoc[],
  properties: PropertyDoc[],
  rawJson: string,
): QAViolation[] {
  const v: QAViolation[] = [];

  // ── App-level checks ────────────────────────────────────────────────────────

  // FS-011 SecretInProperties — secret-named property with plaintext value
  for (const p of properties) {
    if (CRED_KEYS.test(p.name) && p.value !== undefined && !isSafeValue(p.value)) {
      v.push({ severity: 'error', ruleId: 'FS-011', message: `Property "${p.name}" contains a plaintext secret`, location: `Properties / ${p.name}`, detail: 'Use $env[VAR] or SECRET: prefix' });
    }
    // FM-008/FS-009 InsecurePropertyURL
    if (p.value && /^http:\/\//i.test(p.value)) {
      v.push({ severity: 'warning', ruleId: 'FS-009', message: `Property "${p.name}" uses insecure HTTP URL`, location: `Properties / ${p.name}`, detail: 'Use HTTPS instead' });
    }
    // FS-008 HardcodedPropertyURL
    if (p.value && /^https?:\/\//i.test(p.value)) {
      v.push({ severity: 'info', ruleId: 'FS-008', message: `Property "${p.name}" has a hardcoded URL value`, location: `Properties / ${p.name}`, detail: 'Consider using $env[VAR] reference' });
    }
  }

  // FS-003 DisabledSSLVerification — raw JSON scan
  const sslDisablePatterns = [
    /disableSSLVerification["\s]*:["\s]*true/i,
    /tlsInsecureSkipVerify["\s]*:["\s]*true/i,
    /skipSSLVerify["\s]*:["\s]*true/i,
    /skipTlsVerify["\s]*:["\s]*true/i,
    /sslMode["\s]*:["\s]*"disable"/i,
  ];
  for (const pat of sslDisablePatterns) {
    if (pat.test(rawJson)) {
      v.push({ severity: 'error', ruleId: 'FS-003', message: 'SSL/TLS verification is disabled in the application', location: 'Application', detail: pat.source });
      break;
    }
  }

  // FS-012 ConnectionCredential + FS-010 InsecureConnection + FM-008 UnusedConnection
  const usedConnIds = new Set<string>();
  // Build used connection refs from raw JSON search
  for (const conn of connections) {
    const refPat = new RegExp(`conn://${conn.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const matches = rawJson.match(refPat);
    if (matches && matches.length > 1) usedConnIds.add(conn.id);
    else if ((rawJson.match(new RegExp(conn.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length > 1) usedConnIds.add(conn.id);

    // FS-012 plaintext credentials in connection settings
    if (conn.settings) {
      for (const [k, val] of Object.entries(conn.settings)) {
        if (CRED_KEYS.test(k) && val !== undefined && !isSafeValue(val)) {
          v.push({ severity: 'error', ruleId: 'FS-012', message: `Connection "${conn.name}" has plaintext credential in field "${k}"`, location: `Connections / ${conn.name}`, detail: 'Use $property[] or $env[] reference' });
        }
      }
    }

    // FS-010 insecure connection scheme
    const scheme = conn.settings?.['scheme'] as string | undefined;
    if (scheme && scheme.toLowerCase() === 'http') {
      v.push({ severity: 'warning', ruleId: 'FS-010', message: `Connection "${conn.name}" uses insecure HTTP scheme`, location: `Connections / ${conn.name}`, detail: 'Switch to HTTPS' });
    }

    // FS-004 ConnectionNoTLS
    const useTLS = conn.settings?.['useTLS'];
    if ((useTLS === false || useTLS === 'false') && (!scheme || scheme.toLowerCase() === 'http')) {
      v.push({ severity: 'warning', ruleId: 'FS-004', message: `Connection "${conn.name}" has TLS disabled`, location: `Connections / ${conn.name}`, detail: 'Enable TLS/SSL for secure communication' });
    }
  }

  // FM-008 UnusedConnection
  for (const conn of connections) {
    if (!usedConnIds.has(conn.id)) {
      v.push({ severity: 'info', ruleId: 'FM-008', message: `Connection "${conn.name}" is not referenced by any activity`, location: `Connections / ${conn.name}` });
    }
  }

  // FR-003 DuplicateFlowName
  const flowNameCounts = new Map<string, number>();
  for (const f of flows) flowNameCounts.set(f.name, (flowNameCounts.get(f.name) ?? 0) + 1);
  for (const [name, count] of flowNameCounts) {
    if (count > 1) v.push({ severity: 'error', ruleId: 'FR-003', message: `Flow name "${name}" is used ${count} times`, location: `Flows`, detail: 'Flow names must be unique' });
  }

  // FM-007 UnusedProperty — properties not referenced anywhere in the JSON
  for (const p of properties) {
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const refPat = new RegExp(`\\$property\\["?${escaped}"?\\]`, 'g');
    if (!refPat.test(rawJson)) {
      v.push({ severity: 'info', ruleId: 'FM-007', message: `Property "${p.name}" is not referenced anywhere`, location: `Properties / ${p.name}` });
    }
  }

  // ── Trigger checks ──────────────────────────────────────────────────────────
  const allFlowRefs = new Set(triggers.flatMap(t => t.handlers.map(h => h.flowRef)).filter(Boolean));

  for (const trig of triggers) {
    const isREST = REST_REFS.test(trig.ref);

    // FS-002 TriggerInsecureHTTP
    if (isREST) {
      const secure = trig.settings?.['secureConnection'];
      if (!secure || secure === false || String(secure).toLowerCase() === 'false') {
        v.push({ severity: 'warning', ruleId: 'FS-002', message: `REST trigger "${trig.name}" does not use HTTPS`, location: `Triggers / ${trig.name}`, detail: 'Set secureConnection to true' });
      }

      // FS-013 TriggerNoAuth
      const authType = trig.settings?.['authenticationType'] as string | undefined;
      if (!authType || authType.toLowerCase() === 'none' || authType === '') {
        v.push({ severity: 'error', ruleId: 'FS-013', message: `REST trigger "${trig.name}" has no authentication`, location: `Triggers / ${trig.name}`, detail: 'Configure authenticationType' });
      }

      // FM-016 CORSWildcard
      const corsOrigins = trig.settings?.['corsOrigins'];
      if (corsOrigins === '*') {
        v.push({ severity: 'warning', ruleId: 'FM-016', message: `REST trigger "${trig.name}" allows all CORS origins (*)`, location: `Triggers / ${trig.name}`, detail: 'Restrict CORS to specific origins' });
      }

      // FM-015 TriggerDefaultPort
      const port = trig.settings?.['port'];
      if (port === 9999 || port === '9999' || port === 7879 || port === '7879') {
        v.push({ severity: 'info', ruleId: 'FM-015', message: `REST trigger "${trig.name}" uses default port ${port}`, location: `Triggers / ${trig.name}`, detail: 'Use a $property[] reference for port' });
      }
    }

    // FM-013 TriggerTooManyHandlers
    if (trig.handlers.length > 10) {
      v.push({ severity: 'warning', ruleId: 'FM-013', message: `Trigger "${trig.name}" has ${trig.handlers.length} handlers (>10)`, location: `Triggers / ${trig.name}`, detail: 'Consider splitting into multiple triggers' });
    }

    // FR-009 UnboundTriggerHandler
    for (const h of trig.handlers) {
      if (!h.flowRef || h.flowRef.trim() === '') {
        v.push({ severity: 'error', ruleId: 'FR-009', message: `Handler "${h.name}" in trigger "${trig.name}" has no flow binding`, location: `Triggers / ${trig.name} / ${h.name}` });
      }
    }

    // FR-008 OrphanHandler — handler references non-existent flow
    const allFlowIds = new Set(flows.map(f => f.id));
    for (const h of trig.handlers) {
      if (h.flowRef && !allFlowIds.has(h.flowRef)) {
        v.push({ severity: 'error', ruleId: 'FR-008', message: `Handler "${h.name}" references non-existent flow "${h.flowRef}"`, location: `Triggers / ${trig.name} / ${h.name}` });
      }
    }

    // FR-011 DuplicateHandlerPath — REST triggers
    if (isREST) {
      const pathMap = new Map<string, string>();
      for (const h of trig.handlers) {
        const method = String(h.settings?.['method'] ?? '').toUpperCase();
        const hpath  = String(h.settings?.['path'] ?? h.settings?.['uri'] ?? '');
        const key = `${method}:${hpath}`;
        if (key !== ':' && pathMap.has(key)) {
          v.push({ severity: 'error', ruleId: 'FR-011', message: `Duplicate handler path ${key} in trigger "${trig.name}"`, location: `Triggers / ${trig.name} / ${h.name}`, detail: `First seen in handler "${pathMap.get(key)}"` });
        } else {
          pathMap.set(key, h.name);
        }
      }
    }

    // FS-001 TriggerHardcodedCredentials
    if (trig.settings) {
      for (const [k, val] of Object.entries(trig.settings)) {
        if (CRED_KEYS.test(k) && val !== undefined && !isSafeValue(val)) {
          v.push({ severity: 'error', ruleId: 'FS-001', message: `Trigger "${trig.name}" has hardcoded credential in setting "${k}"`, location: `Triggers / ${trig.name}` });
        }
      }
    }
  }

  // FM-006 UnusedFlow — flows not referenced by any trigger handler or subflow
  const flowsReferencedBySubflow = new Set<string>();
  for (const f of flows) {
    for (const act of f.activities) {
      if (SUBFLOW_REFS.test(act.ref)) {
        const ref = act.settings?.['flowURI'] ?? act.input?.['flowURI'] ?? act.settings?.['processRef'];
        if (ref) flowsReferencedBySubflow.add(String(ref).replace(/^res:\/\//, ''));
      }
    }
  }
  for (const f of flows) {
    const isReferencedByTrigger = allFlowRefs.has(f.id);
    const isReferencedBySubflow = flowsReferencedBySubflow.has(f.id);
    if (!isReferencedByTrigger && !isReferencedBySubflow) {
      v.push({ severity: 'info', ruleId: 'FM-006', message: `Flow "${f.name}" is not referenced by any trigger or subflow`, location: `Flows / ${f.name}` });
    }
  }

  // ── Per-flow checks ─────────────────────────────────────────────────────────
  for (const flow of flows) {
    const loc = `Flows / ${flow.name}`;
    const acts = flow.activities;
    const links = flow.links;

    // FM-004 FlowNoDescription
    if (!flow.description || flow.description.trim() === '') {
      v.push({ severity: 'info', ruleId: 'FM-004', message: `Flow "${flow.name}" has no description`, location: loc });
    }

    // FM-002 FlowTooManyActivities (>20)
    if (acts.length > 20) {
      v.push({ severity: 'warning', ruleId: 'FM-002', message: `Flow "${flow.name}" has ${acts.length} activities (>20)`, location: loc, detail: 'Consider breaking into sub-flows' });
    }

    // FM-001 FlowComplexity — too many conditional branches (>10)
    const conditionalCount = links.filter(l => l.type === 'expression').length;
    if (conditionalCount > 10) {
      v.push({ severity: 'warning', ruleId: 'FM-001', message: `Flow "${flow.name}" has ${conditionalCount} conditional transitions (>10)`, location: loc, detail: 'Reduce complexity to improve maintainability' });
    }

    // FM-003 FlowNoLogging — non-trivial flows without log activities
    if (acts.length > 2) {
      const hasLog = acts.some(a => LOG_REFS.test(a.ref));
      if (!hasLog) {
        v.push({ severity: 'info', ruleId: 'FM-003', message: `Flow "${flow.name}" has no logging activities`, location: loc });
      }
    }

    // FR-006 FlowMissingReturn
    const hasReturn = acts.some(a => RETURN_REFS.test(a.ref));
    if (!hasReturn) {
      v.push({ severity: 'warning', ruleId: 'FR-006', message: `Flow "${flow.name}" has no Return activity`, location: loc, detail: 'Flows should end with a Return activity' });
    }

    // FR-005 FlowMissingErrorHandler — no error-type links and no error/catch activity
    const hasErrorLink = links.some(l => l.type === 'error');
    const hasErrorAct  = acts.some(a => /\b(error|catch|exception|fault)\b/i.test(a.name));
    if (!hasErrorLink && !hasErrorAct && acts.length > 2) {
      v.push({ severity: 'warning', ruleId: 'FR-005', message: `Flow "${flow.name}" has no error handling`, location: loc, detail: 'Add error transitions or catch activities' });
    }

    // FR-002 FlowUnreachableTask — BFS from Start
    const startAct = acts.find(a => START_REFS.test(a.ref) || a.name.toLowerCase() === 'start');
    if (startAct && acts.length > 1) {
      const reachable = new Set<string>();
      const queue = [startAct.id];
      while (queue.length) {
        const cur = queue.shift()!;
        if (reachable.has(cur)) continue;
        reachable.add(cur);
        for (const l of links) {
          if (l.from === cur && !reachable.has(l.to)) queue.push(l.to);
        }
      }
      for (const act of acts) {
        if (!reachable.has(act.id) && !START_REFS.test(act.ref)) {
          v.push({ severity: 'error', ruleId: 'FR-002', message: `Activity "${act.name}" in flow "${flow.name}" is unreachable from Start`, location: `${loc} / ${act.name}` });
        }
      }
    }

    // FR-001 CircularLink — DFS cycle detection
    {
      const adjList = new Map<string, string[]>();
      for (const act of acts) adjList.set(act.id, []);
      for (const l of links) adjList.get(l.from)?.push(l.to);
      const visited = new Set<string>();
      const inStack = new Set<string>();
      const reportedCycles = new Set<string>();
      function dfsForCycle(node: string): void {
        if (inStack.has(node)) return;
        if (visited.has(node)) return;
        visited.add(node);
        inStack.add(node);
        for (const next of (adjList.get(node) ?? [])) {
          if (inStack.has(next)) {
            const key = [node, next].sort().join('→');
            if (!reportedCycles.has(key)) {
              reportedCycles.add(key);
              const fromName = acts.find(a => a.id === node)?.name ?? node;
              const toName   = acts.find(a => a.id === next)?.name ?? next;
              v.push({ severity: 'error', ruleId: 'FR-001', message: `Circular transition in flow "${flow.name}": ${fromName} → ${toName}`, location: loc });
            }
          } else {
            dfsForCycle(next);
          }
        }
        inStack.delete(node);
      }
      for (const act of acts) dfsForCycle(act.id);
    }

    // FR-004 DuplicateActivityName
    const actNameCounts = new Map<string, number>();
    for (const act of acts) actNameCounts.set(act.name, (actNameCounts.get(act.name) ?? 0) + 1);
    for (const [name, count] of actNameCounts) {
      if (count > 1) v.push({ severity: 'warning', ruleId: 'FR-004', message: `Activity name "${name}" is duplicated ${count} times in flow "${flow.name}"`, location: loc });
    }

    // ── Per-activity checks ────────────────────────────────────────────────────
    for (const act of acts) {
      const aloc = `${loc} / ${act.name}`;
      const isStart  = START_REFS.test(act.ref) || act.name.toLowerCase() === 'start';
      const isReturn = RETURN_REFS.test(act.ref);
      const isLog    = LOG_REFS.test(act.ref);
      const isREST   = REST_REFS.test(act.ref);
      const isSleep  = SLEEP_REFS.test(act.ref);
      const isDB     = DB_REFS.test(act.ref);

      // FM-005 EmptyActivityDescription
      if (!isStart && !act.description?.trim()) {
        v.push({ severity: 'info', ruleId: 'FM-005', message: `Activity "${act.name}" in flow "${flow.name}" has no description`, location: aloc });
      }

      // FM-010 EmptyActivityInput — non-start/return/log activities with no input mappings
      if (!isStart && !isReturn && !isLog && !isSleep) {
        const inputKeys = Object.keys(act.input ?? {});
        if (inputKeys.length === 0) {
          v.push({ severity: 'info', ruleId: 'FM-010', message: `Activity "${act.name}" has no input mappings configured`, location: aloc });
        }
      }

      // FS-001 HardcodedCredentials — activity inputs with credential field names
      deepSearchStrings(act.input, (val, key) => {
        if (CRED_KEYS.test(key) && !isSafeValue(val)) {
          v.push({ severity: 'error', ruleId: 'FS-001', message: `Activity "${act.name}" has hardcoded credential in input field "${key}"`, location: aloc });
        }
      });

      // FS-014 ActivitySkipTLSVerify
      deepSearchStrings({ ...act.settings, ...act.input }, (val, key) => {
        if (/^(skipTlsVerify|skipSSLVerify)$/i.test(key) && (val === 'true' || val.toLowerCase() === 'true')) {
          v.push({ severity: 'error', ruleId: 'FS-014', message: `Activity "${act.name}" skips TLS certificate verification`, location: aloc });
        }
      });

      // FS-007 HardcodedURL — REST activities with hardcoded URLs in inputs
      if (isREST) {
        deepSearchStrings(act.input, (val, key) => {
          if (/^(uri|url|endpoint|host)$/i.test(key) && /^https?:\/\//i.test(val) && !val.startsWith('=')) {
            v.push({ severity: 'warning', ruleId: 'FS-007', message: `Activity "${act.name}" has hardcoded URL in input "${key}"`, location: aloc, detail: 'Use $property[] reference' });
          }
        });

        // FM-011 RestActivityTimeout
        const timeout = act.settings?.['timeout'] ?? act.input?.['timeout'];
        if (timeout === undefined || timeout === null || timeout === 0 || timeout === '0' || timeout === 0.0 || timeout === '0.0') {
          v.push({ severity: 'warning', ruleId: 'FM-011', message: `REST activity "${act.name}" has no timeout configured`, location: aloc });
        }

        // FR-010 FlowDeadEnd — check below (after all activities, use outgoing link count)
      }

      // FS-005 SQLConcatInMapping — DB activities with string.concat + dynamic sources
      if (isDB) {
        deepSearchStrings(act.input, (val, key) => {
          if (/^(query|sql|statement|command)$/i.test(key)) {
            if (/string\.concat\(/.test(val) && /\$(flow|trigger|activity)\[/.test(val)) {
              v.push({ severity: 'error', ruleId: 'FS-005', message: `Activity "${act.name}" uses string concatenation in SQL — potential SQL injection`, location: aloc, detail: 'Use parameterized queries instead' });
            }
          }
        });
      }

      // FS-006 SensitiveDataInLog — log activities with sensitive keywords in message
      if (isLog) {
        deepSearchStrings(act.input, (val, key) => {
          if (/^(message|log|msg|text)$/i.test(key) && SENSITIVE_WORDS.test(val)) {
            v.push({ severity: 'error', ruleId: 'FS-006', message: `Log activity "${act.name}" may expose sensitive data in message`, location: aloc, detail: 'Avoid logging credential or secret fields' });
          }
        });
      }

      // FM-014 SleepActivity
      if (isSleep) {
        v.push({ severity: 'warning', ruleId: 'FM-014', message: `Activity "${act.name}" uses Sleep — avoid in production flows`, location: aloc, detail: 'Use timer triggers or retry mechanisms instead' });
      }

      // FM-009 DeprecatedFunction — scan all input expressions
      deepSearchStrings(act.input, (val) => {
        if (!val.startsWith('=')) return;
        for (const { pat, replacement } of DEPRECATED_FUNS) {
          if (pat.test(val)) {
            v.push({ severity: 'warning', ruleId: 'FM-009', message: `Activity "${act.name}" uses deprecated function — replace with ${replacement}`, location: aloc });
            break;
          }
        }
      });

      // FS-015 MD5HashFunction
      deepSearchStrings(act.input, (val) => {
        if (val.startsWith('=') && /util\.md5\(/i.test(val)) {
          v.push({ severity: 'warning', ruleId: 'FS-015', message: `Activity "${act.name}" uses MD5 (cryptographically broken) — use util.sha256()`, location: aloc });
        }
      });

      // FS-016 HardcodedCryptoKey — hardcoded HMAC key literal
      deepSearchStrings(act.input, (val) => {
        if (/util\.hmacSha256\([^,)]+,\s*"[^"]+"\)/i.test(val)) {
          v.push({ severity: 'error', ruleId: 'FS-016', message: `Activity "${act.name}" has hardcoded HMAC key — use $property[] or $env[] reference`, location: aloc });
        }
      });

      // FR-010 FlowDeadEnd — non-return/start tasks with no outgoing links
      if (!isStart && !isReturn) {
        const hasOutgoing = links.some(l => l.from === act.id);
        if (!hasOutgoing) {
          v.push({ severity: 'warning', ruleId: 'FR-010', message: `Activity "${act.name}" in flow "${flow.name}" is a dead end (no outgoing transitions)`, location: aloc });
        }
      }

      // FR-007 EmptyTransitionCondition
      for (const l of links) {
        if (l.from === act.id && l.type === 'expression' && (!l.condition || l.condition.trim() === '')) {
          v.push({ severity: 'error', ruleId: 'FR-007', message: `Conditional transition from "${act.name}" in flow "${flow.name}" has no condition`, location: aloc });
        }
      }

      // FM-012 MultipleTransitionsNoCondition — 2+ outgoing with none conditional
      const outgoing = links.filter(l => l.from === act.id);
      if (outgoing.length >= 2 && outgoing.every(l => l.type !== 'expression')) {
        v.push({ severity: 'warning', ruleId: 'FM-012', message: `Activity "${act.name}" has ${outgoing.length} outgoing transitions with no conditions`, location: aloc });
      }
    }
  }

  return v;
}

export function parseFlogoFile(filePath: string): DocModel {
  const raw = fs.readFileSync(filePath, 'utf8');
  const app: FlogoApp = JSON.parse(raw);

  const appInfo: AppInfo = {
    name: app.name,
    description: app.description ?? '',
    version: app.version,
    sourceFile: path.basename(filePath),
    appModel: app.appModel,
    tags: app.tags ?? [],
    imports: app.imports ?? [],
  };

  const flows = (app.resources ?? [])
    .filter(r => r.id.startsWith('flow:'))
    .map(parseFlow);

  const triggers    = parseTriggers(app);
  const connections = parseConnections(app);
  const properties  = parseProperties(app);
  const violations  = analyzeFlogoQA(flows, triggers, connections, properties, raw);

  return {
    product: 'flogo',
    app: appInfo,
    flows,
    triggers,
    connections,
    properties,
    schemas: parseSchemas(app),
    specs: parseSpecs(app),
    violations: violations.length > 0 ? violations : undefined,
    generatedAt: new Date().toISOString(),
    generatedBy: os.userInfo().username,
  };
}

export function canParse(filePath: string): boolean {
  return filePath.endsWith('.flogo');
}
