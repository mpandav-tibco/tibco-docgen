import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { BW6ProcessDef, BW6Activity, BW6Transition } from './types';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => ['activity', 'transition', 'processProperty', 'pvPair', 'globalVariable', 'substitutionBindings', 'field'].includes(name),
  parseTagValue: false,
  trimValues: true,
  // Raise entity expansion limit for large BW6 process files (default is 1000)
  processEntities: { enabled: true, maxTotalExpansions: 100000 },
});

// ─── BPEL activity extraction ─────────────────────────────────────────────────

// Elements that are transparent containers: recurse into them but don't treat them as activities.
const BPEL_CONTAINER_ELEMENTS = new Set([
  // Standard BPEL structured activities (containers for other activities):
  'process', 'sequence', 'flow', 'pick', 'scope', 'eventHandlers',
  'if', 'while', 'repeatUntil', 'forEach',
  'onMessage', 'onEvent', 'onAlarm',
  // BPEL plumbing / link graph:
  'variables', 'partnerLinks', 'correlationSets', 'messageExchanges',
  'targets', 'sources', 'target', 'source', 'correlations', 'correlation',
  'link', 'links', 'branches', 'startCounterValue', 'finalCounterValue',
  // tibex transition-condition descriptors inside <bpws:source> — NOT activities:
  'DesignExpression', 'expression',
  // bpws:extensionActivity — transparent wrapper, real activity is the child:
  'extensionActivity',
]);

// Only these element names can produce an ActivityDoc.
// Everything else is either a container (above) or metadata (hard-skipped) and is ignored.
const BPEL_ACTIVITY_ELEMENTS = new Set([
  // Standard BPEL leaf activities ('empty' is handled separately — see collectBpelActivities):
  'invoke', 'receive', 'reply', 'assign',
  'throw', 'rethrow', 'compensate', 'wait', 'exit', 'validate',
  // BW6 / TIBCO extensions (tibex: namespace, stripped):
  'activityExtension',  // tibex:activityExtension — the main BW6 activity wrapper
  'receiveEvent',       // tibex:receiveEvent — process starter (HTTP receiver, EMS subscriber, etc.)
  'activity',           // tib:activity — older TIBCO BPEL format
]);

// Elements that introduce a fault-handling / compensation branch
const FAULT_HANDLER_ELEMENTS = new Set([
  'faultHandlers', 'catch', 'catchAll', 'compensationHandler',
]);

interface BpelActivity {
  name: string;
  type: string;
  attrs: Record<string, string>;
  configFields: Record<string, string>;
  inFaultHandler: boolean;
  mappings: Array<{ target: string; source: string }>;
  typeId?: string;   // activityTypeID from BWActivity, e.g. "bw.generalactivities.sleep"
  sourceLinks: string[]; // linkNames of outgoing BPEL links from this activity
  targetLinks: string[]; // linkNames of incoming BPEL links to this activity
}

// XSLT elements that appear inside xsl:template but are not output elements
const XSLT_CONTROL_ELEMENTS = new Set([
  'param', 'variable', 'if', 'choose', 'when', 'otherwise',
  'for-each', 'sort', 'apply-templates', 'call-template',
  'attribute', 'comment', 'processing-instruction', 'text',
  'number', 'decimal-format', 'import', 'include', 'output', 'key',
]);

export function extractMappingsFromXsltNode(
  node: Record<string, unknown>,
  parentPath: string,
  out: Array<{ target: string; source: string }>,
): void {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('@_') || key === '#text') continue;
    if (XSLT_CONTROL_ELEMENTS.has(key)) continue;
    if (key === 'value-of' || key === 'copy-of') {
      // Direct value-of at this level — parent is the target
      const select = (val as Record<string, string>)?.['@_select'];
      if (select && parentPath) out.push({ target: parentPath, source: String(select) });
      continue;
    }
    const children = Array.isArray(val) ? val : (val ? [val] : []);
    for (const child of children) {
      if (!child || typeof child !== 'object') continue;
      const c = child as Record<string, unknown>;
      const currentPath = parentPath ? `${parentPath}/${key}` : key;
      // Direct value-of child → this element = target
      const vo = c['value-of'] as Record<string, string> | undefined;
      if (vo && typeof vo === 'object') {
        const select = vo['@_select'];
        if (select) { out.push({ target: currentPath, source: String(select) }); continue; }
      }
      // copy-of child
      const co = c['copy-of'] as Record<string, string> | undefined;
      if (co && typeof co === 'object') {
        const select = co['@_select'];
        if (select) { out.push({ target: currentPath, source: String(select) }); continue; }
      }
      // Inline text (literal value)
      const text = c['#text'];
      if (text && typeof text === 'string' && text.trim()) {
        out.push({ target: currentPath, source: `'${text.trim()}'` }); continue;
      }
      // Recurse for nested output elements
      extractMappingsFromXsltNode(c, currentPath, out);
    }
  }
}

export function extractXsltMappings(node: Record<string, unknown>): Array<{ target: string; source: string }> {
  const out: Array<{ target: string; source: string }> = [];
  const bindingsNode = (node['inputBindings'] ?? node['tib:inputBindings']) as Record<string, unknown> | undefined;
  if (!bindingsNode || typeof bindingsNode !== 'object') return out;

  // Format 1: inputBindings/stylesheet/template — XSLT parsed as nested XML nodes
  const stylesheet = bindingsNode['stylesheet'] as Record<string, unknown> | undefined;
  if (stylesheet) {
    const rawTemplates = stylesheet['template'];
    const templates = Array.isArray(rawTemplates) ? rawTemplates : (rawTemplates ? [rawTemplates] : []);
    for (const tmpl of templates as Record<string, unknown>[]) {
      extractMappingsFromXsltNode(tmpl, '', out);
    }
    if (out.length > 0) return out;
  }

  // Format 2: inputBindings/inputBinding[@expression] — XSLT stored as XML-entity-encoded attribute.
  // fast-xml-parser already decoded the outer entity layer (&lt;→<, &quot;→", &amp;→&), so
  // the expression now contains valid XML with properly escaped inner attributes (e.g. &quot; inside
  // select="..."). Do NOT manually decode again — that would break the inner XML structure.
  const bindingRaw = bindingsNode['inputBinding'];
  const bindings = Array.isArray(bindingRaw) ? bindingRaw : (bindingRaw ? [bindingRaw] : []);
  for (const b of bindings as Record<string, unknown>[]) {
    const expr = (b as Record<string, string>)['@_expression'];
    if (!expr) continue;
    try {
      const parsed = xmlParser.parse(expr);
      const ss = (parsed['stylesheet'] as Record<string, unknown> | undefined);
      if (!ss) continue;
      const rawTmpl = ss['template'];
      const tmpls = Array.isArray(rawTmpl) ? rawTmpl : (rawTmpl ? [rawTmpl] : []);
      for (const tmpl of tmpls as Record<string, unknown>[]) {
        extractMappingsFromXsltNode(tmpl as Record<string, unknown>, '', out);
      }
    } catch { /* ignore malformed XSLT */ }
  }
  return out;
}

export function extractConfigFields(node: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  const configNode = node['config'] as Record<string, unknown> | undefined;
  if (!configNode || typeof configNode !== 'object') return result;

  // Old-style BW6 on-prem: config/field[]
  const rawFields = configNode['field'];
  const fields = Array.isArray(rawFields) ? rawFields : (rawFields ? [rawFields] : []);
  for (const f of fields as Record<string, unknown>[]) {
    if (!f || typeof f !== 'object') continue;
    const fname = String((f as Record<string, string>)['@_name'] ?? '');
    const fval = String((f as Record<string, unknown>)['#text'] ?? '');
    if (fname) result[fname] = fval;
  }

  // New-style BWCE: config/BWActivity/activityConfig/properties[]/value attrs
  // e.g. Log has controlBy="Application" role="Info" suppressJobInfo="true"
  const bwActivity = configNode['BWActivity'] as Record<string, unknown> | undefined;
  if (bwActivity && typeof bwActivity === 'object') {
    // attributeBindings: module property bindings for config fields
    // e.g. <attributeBindings bindingType="moduleProperty" eAttributeName="fileName" processProperty="ReadBookStoreXML"/>
    const bindingsRaw = bwActivity['attributeBindings'];
    const bindings = Array.isArray(bindingsRaw) ? bindingsRaw : (bindingsRaw ? [bindingsRaw] : []);
    for (const b of bindings as Record<string, unknown>[]) {
      if (!b || typeof b !== 'object') continue;
      const eAttrName = (b as Record<string, string>)['@_eAttributeName'];
      const processProp = (b as Record<string, string>)['@_processProperty'];
      if (eAttrName && processProp) {
        // Encode as module property ref so the renderer can highlight it
        result[eAttrName] = `%%{${processProp}}%%`;
      }
    }

    const actConfig = bwActivity['activityConfig'] as Record<string, unknown> | undefined;
    if (actConfig && typeof actConfig === 'object') {
      const propsRaw = actConfig['properties'];
      const props = Array.isArray(propsRaw) ? propsRaw : (propsRaw ? [propsRaw] : []);
      for (const prop of props as Record<string, unknown>[]) {
        if (!prop || typeof prop !== 'object') continue;
        const valueNode = prop['value'] as Record<string, string> | undefined;
        if (!valueNode || typeof valueNode !== 'object') continue;
        for (const [vk, vv] of Object.entries(valueNode)) {
          if (!vk.startsWith('@_') || typeof vv !== 'string') continue;
          const attrName = vk.slice(2);
          if (attrName === 'type') continue; // skip xsi:type metadata
          result[attrName] = vv;
        }
      }
    }
  }

  return result;
}

export function extractActivityTypeId(node: Record<string, unknown>): string | undefined {
  const configNode = node['config'] as Record<string, unknown> | undefined;
  if (!configNode) return undefined;
  const bwActivity = configNode['BWActivity'] as Record<string, string> | undefined;
  return bwActivity?.['@_activityTypeID'] ?? undefined;
}

export function parseProcessVariables(root: Record<string, unknown>): Map<string, string> {
  const varMap = new Map<string, string>();
  const varsNode = root['variables'] as Record<string, unknown> | undefined;
  if (!varsNode) return varMap;
  const rawVars = varsNode['variable'];
  const vars = Array.isArray(rawVars) ? rawVars : (rawVars ? [rawVars] : []);
  for (const v of vars as Record<string, string>[]) {
    const name = v['@_name'];
    const element = v['@_element'] ?? v['@_messageType'];
    if (name && element) {
      const typeName = element.includes(':') ? element.split(':').pop()! : element;
      varMap.set(name, typeName);
    }
  }
  return varMap;
}

export function parseTypesSection(root: Record<string, unknown>): Map<string, string[]> {
  const typeMap = new Map<string, string[]>();
  const typesNode = root['Types'] as Record<string, unknown> | undefined;
  if (!typesNode) return typeMap;

  const processSchema = (schemaNode: Record<string, unknown>) => {
    const extractFields = (ct: Record<string, unknown>): string[] => {
      const fields: string[] = [];
      for (const container of ['sequence', 'all', 'choice'] as const) {
        const seq = ct[container] as Record<string, unknown> | undefined;
        if (!seq) continue;
        const rawEls = seq['element'];
        const els = Array.isArray(rawEls) ? rawEls : (rawEls ? [rawEls] : []);
        for (const el of els as Record<string, string>[]) {
          if (el['@_name']) fields.push(el['@_name']);
        }
      }
      return fields;
    };

    // Top-level element declarations
    const rawTopEls = schemaNode['element'];
    const topEls = Array.isArray(rawTopEls) ? rawTopEls : (rawTopEls ? [rawTopEls] : []);
    for (const el of topEls as Record<string, unknown>[]) {
      const elName = (el as Record<string, string>)['@_name'];
      if (!elName) continue;
      const ct = el['complexType'] as Record<string, unknown> | undefined;
      if (ct) {
        const fields = extractFields(ct);
        if (fields.length > 0) typeMap.set(elName, fields);
      }
    }

    // Top-level complexType declarations
    const rawCTs = schemaNode['complexType'];
    const cts = Array.isArray(rawCTs) ? rawCTs : (rawCTs ? [rawCTs] : []);
    for (const ct of cts as Record<string, unknown>[]) {
      const ctName = (ct as Record<string, string>)['@_name'];
      if (!ctName) continue;
      const fields = extractFields(ct as Record<string, unknown>);
      if (fields.length > 0) typeMap.set(ctName, fields);
    }
  };

  const schemaRaw = typesNode['schema'];
  const schemas = Array.isArray(schemaRaw) ? schemaRaw : (schemaRaw ? [schemaRaw] : []);
  for (const s of schemas as Record<string, unknown>[]) processSchema(s);

  return typeMap;
}

/** Extract linkNames from <bpws:sources>/<bpws:targets> inside an activity node.
 *  Also collects link types (from tibex:linkType on source elements) into the provided map. */
function extractActivityLinks(
  node: Record<string, unknown>,
  linkTypes?: Map<string, string>,
): { sourceLinks: string[]; targetLinks: string[] } {
  const sourceLinks: string[] = [];
  const targetLinks: string[] = [];

  const sourcesContainer = node['sources'];
  if (sourcesContainer && typeof sourcesContainer === 'object') {
    const v = (sourcesContainer as Record<string, unknown>)['source'];
    const arr = Array.isArray(v) ? v : (v ? [v] : []);
    for (const el of arr as Record<string, unknown>[]) {
      const ln = el['@_linkName'];
      if (typeof ln === 'string') {
        sourceLinks.push(ln);
        if (linkTypes) {
          const lt = el['@_linkType'];
          if (typeof lt === 'string') {
            linkTypes.set(ln, lt.toLowerCase() === 'error' ? 'error' : 'always');
          } else {
            // BWCE BPEL format: error links use DesignExpression with ##error## expression
            const designExpr = el['DesignExpression'] as Record<string, unknown> | undefined;
            const exprNode = designExpr?.['expression'] as Record<string, unknown> | undefined;
            const exprVal = exprNode?.['@_expression'];
            if (typeof exprVal === 'string' && exprVal === '##error##') {
              linkTypes.set(ln, 'error');
            }
          }
        }
      }
    }
  }

  const targetsContainer = node['targets'];
  if (targetsContainer && typeof targetsContainer === 'object') {
    const v = (targetsContainer as Record<string, unknown>)['target'];
    const arr = Array.isArray(v) ? v : (v ? [v] : []);
    for (const el of arr as Record<string, unknown>[]) {
      const ln = el['@_linkName'];
      if (typeof ln === 'string') targetLinks.push(ln);
    }
  }

  return { sourceLinks, targetLinks };
}

/** Collect link type declarations from <bpws:links><bpws:link name="..." tibex:linkType="..."> anywhere in the tree. */
export function collectLinkTypes(node: Record<string, unknown>, out: Map<string, string>): void {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('@_') || key === '#text') continue;
    if (key === 'link') {
      const arr = Array.isArray(val) ? val : [val];
      for (const l of arr as Record<string, unknown>[]) {
        const name = l['@_name'];
        const type = l['@_linkType'];
        if (typeof name === 'string' && typeof type === 'string') {
          out.set(name, type.toLowerCase() === 'error' ? 'error' : 'always');
        }
      }
    } else {
      const children = Array.isArray(val) ? val : [val];
      for (const c of children) {
        if (c && typeof c === 'object') collectLinkTypes(c as Record<string, unknown>, out);
      }
    }
  }
}

export function collectBpelActivities(
  node: Record<string, unknown>,
  out: BpelActivity[],
  seenNames: Set<string>,
  inFaultHandler = false,
  linkTypes?: Map<string, string>,
): void {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('@_') || key === '#text') continue;
    // Skip non-activity sections embedded in BWCE BPEL files:
    // - inputBindings/outputBindings: XSLT, extracted separately
    // - Types: tibex:Types XSD type definitions
    // - Diagram: notation:Diagram GMF visual layout (children, styles, layoutConstraint, edges…)
    // - ProcessInfo: tibex:ProcessInfo metadata
    if (key === 'inputBindings' || key === 'outputBindings'
      || key === 'Types' || key === 'Diagram' || key === 'ProcessInfo'
      || key === 'ProcessInterface'   // tibex:ProcessInterface — process signature metadata
      || key === 'NamespaceRegistry'  // tibex:NamespaceRegistry — XML namespace config
      || key === 'eventSource'        // tibex:eventSource — event config child of receiveEvent, not an activity
      || key === 'activityConfig'     // palette-specific config blob — children are config objects, not activities
      || key === 'BWActivity'         // BWCE BWActivity wrapper — same as activityConfig
    ) continue;
    const children = Array.isArray(val) ? val : [val];
    for (const child of children) {
      if (!child || typeof child !== 'object') continue;
      const c = child as Record<string, unknown>;
      if (FAULT_HANDLER_ELEMENTS.has(key)) {
        // Fault/compensation branches — recurse, marking activities as fault-handler
        collectBpelActivities(c, out, seenNames, true, linkTypes);
      } else if (BPEL_CONTAINER_ELEMENTS.has(key)) {
        // Check if this container acts as an activity proxy (forEach group wrapper): it has direct
        // <bpws:targets>/<bpws:sources> children with outer flow connections (e.g. <bpws:scope name="ForEach">).
        // In that case, inject its external links into the first/last inner activity so the outer
        // Assign → [forEach body] → Reply chain appears correctly in the diagram.
        const outerLinks = (c['targets'] || c['sources']) ? extractActivityLinks(c, linkTypes) : null;
        const hasOuterLinks = outerLinks && (outerLinks.targetLinks.length + outerLinks.sourceLinks.length > 0);
        if (hasOuterLinks) {
          const innerActs: BpelActivity[] = [];
          collectBpelActivities(c, innerActs, seenNames, inFaultHandler, linkTypes);
          if (innerActs.length > 0) {
            innerActs[0].targetLinks.push(...outerLinks!.targetLinks);
            innerActs[innerActs.length - 1].sourceLinks.push(...outerLinks!.sourceLinks);
          }
          out.push(...innerActs);
        } else {
          // Transparent containers — recurse without producing an activity node
          collectBpelActivities(c, out, seenNames, inFaultHandler, linkTypes);
        }
      } else if (key === 'empty') {
        // <bpws:empty> with tibex:constructor is a lifecycle marker (onMessageStart/onMessageEnd) —
        // it's internal BPEL infrastructure, never shown in BW6 Studio; skip it entirely.
        if (c['@_constructor']) continue;
        // GroupInit/GroupStart/GroupEnd are forEach group boundary markers — BW6 Studio hides them.
        // They appear inside forEach wrapper scopes and have no meaningful documentation value.
        const emptyName = String(c['@_name'] ?? '');
        if (/^Group(Init|Start|End)$/.test(emptyName)) continue;
        // Other <bpws:empty> nodes are error-routing diamonds (valid user-visible activities).
        const uniq = seenNames.has(emptyName) ? `${emptyName}_${out.length}` : emptyName || 'Empty';
        seenNames.add(uniq);
        const { sourceLinks, targetLinks } = extractActivityLinks(c, linkTypes);
        out.push({ name: uniq, type: 'empty', attrs: {}, configFields: {}, inFaultHandler, mappings: [], sourceLinks, targetLinks });
      } else if (BPEL_ACTIVITY_ELEMENTS.has(key) || c['@_activityDisplayName'] !== undefined) {
        // Activity element — either a known BPEL/tibex type, or any element that carries
        // activityDisplayName (the TIBCO marker present on every palette activity:
        // tib:kafkaConsumer, tib:jdbcQuery, tib:restInvoke, etc.)
        const name = String(c['@_name'] ?? c['@_activityDisplayName'] ?? key);
        const uniq = seenNames.has(name) ? `${name}_${out.length}` : name;
        seenNames.add(uniq);
        const attrs: Record<string, string> = {};
        for (const [ak, av] of Object.entries(c)) {
          if (ak.startsWith('@_') && typeof av === 'string') attrs[ak.slice(2)] = av;
        }
        const configFields = extractConfigFields(c);
        const mappings = extractXsltMappings(c);
        const typeId = extractActivityTypeId(c);
        const { sourceLinks, targetLinks } = extractActivityLinks(c, linkTypes);
        out.push({ name: uniq, type: key, attrs, configFields, inFaultHandler, mappings, typeId, sourceLinks, targetLinks });
        // Recurse for nested fault scopes inside activities (e.g. scope with fault handler)
        collectBpelActivities(c, out, seenNames, inFaultHandler, linkTypes);
      }
      // Unknown element: skip entirely — it is metadata, config, or a BPEL/TIBCO extension
      // that is not an activity (e.g. VariableDescriptor, wsdl:definitions, SCA bindings).
    }
  }
}

/** Walk the parsed BPEL tree to find the first <bpws:pick> that has <bpws:onMessage> children.
 *  Returns that pick node, or undefined if not found. */
function findPickWithOnMessage(node: unknown): Record<string, unknown> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const c of node) {
      const r = findPickWithOnMessage(c);
      if (r) return r;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  if ('onMessage' in obj) return obj;                   // this IS the pick
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('@_') || k === '#text') continue;
    if (k === 'Types' || k === 'Diagram' || k === 'ProcessInfo') continue;
    const r = findPickWithOnMessage(v);
    if (r) return r;
  }
  return undefined;
}

/** Build transitions from BPEL link declarations. Falls back to sequential if no links found.
 *  Also adds implicit error links from the last main-flow activity to fault handler activities. */
function buildTransitions(acts: BpelActivity[], linkTypes: Map<string, string>): BW6Transition[] {
  const mainActs  = acts.filter(a => !a.inFaultHandler);
  const faultActs = acts.filter(a =>  a.inFaultHandler);

  // Collect source/target link maps from all activities
  const fromLink = new Map<string, string>(); // linkName → source activity name
  const toLink   = new Map<string, string>(); // linkName → target activity name
  for (const a of acts) {
    for (const ln of a.sourceLinks) fromLink.set(ln, a.name);
    for (const ln of a.targetLinks) toLink.set(ln, a.name);
  }

  const transitions: BW6Transition[] = [];

  if (fromLink.size > 0) {
    // Link-based transitions (main flow + any intra-fault-handler links)
    for (const [ln, fromName] of fromLink) {
      const toName = toLink.get(ln);
      if (!toName || toName === fromName) continue;
      // Determine link type: from linkTypes map (populated from <bpws:link> elements and <bpws:source tibex:linkType>)
      // Also detect error links from DesignExpression ##error## pattern (handled in extractActivityLinks)
      const type = linkTypes.get(ln) ?? 'always';
      transitions.push({ from: fromName, to: toName, conditionType: type as 'always' | 'error' });
    }
  } else {
    // No link data — fall back to sequential transitions for simple flat sequences
    for (let i = 0; i < mainActs.length - 1; i++) {
      transitions.push({ from: mainActs[i].name, to: mainActs[i + 1].name, conditionType: 'always' });
    }
  }

  // Add implicit error links from last main-flow activity to fault handler activities.
  // BPEL catchAll/catch fault handlers have no explicit link from the main flow —
  // the connection is implicit. Add one error link so the diagram shows the relationship.
  if (faultActs.length > 0 && mainActs.length > 0) {
    const anchor = mainActs[mainActs.length - 1].name;
    const faultEntry = faultActs[0].name;
    // Only add if not already explicitly connected
    if (!transitions.some(t => t.to === faultEntry && t.conditionType === 'error')) {
      transitions.push({ from: anchor, to: faultEntry, conditionType: 'error' });
    }
    for (let i = 0; i < faultActs.length - 1; i++) {
      transitions.push({ from: faultActs[i].name, to: faultActs[i + 1].name, conditionType: 'always' });
    }
  }

  return transitions;
}

export function parseBpelProcess(filePath: string, raw: string): BW6ProcessDef[] {
  const parsed = xmlParser.parse(raw);
  const root = (parsed['process'] ?? parsed) as Record<string, unknown>;
  const procName = String(root['@_name'] ?? path.basename(filePath, '.bwp'));

  // Keys that are internal BPEL plumbing — not useful in documentation
  const BPEL_SKIP_CONFIG_KEYS = new Set([
    'xpdlId', 'expressionLanguage', 'inputVariable', 'outputVariable',
  ]);

  // Parse output variable/type info from the process BPEL root
  const varMap   = parseProcessVariables(root);
  const typesMap = parseTypesSection(root);

  const toActivity = (a: BpelActivity): BW6Activity => {
    const config: Record<string, unknown> = { ...a.attrs, ...a.configFields };
    delete config['name'];
    delete config['activityDisplayName'];
    for (const k of BPEL_SKIP_CONFIG_KEYS) delete config[k];
    if (a.mappings.length > 0) delete config['expression'];
    const inputMappings: Record<string, unknown> | undefined =
      a.mappings.length > 0
        ? Object.fromEntries(a.mappings.map(m => [m.target, m.source]))
        : undefined;
    const outTypeName = varMap.get(a.name);
    const outputFields = outTypeName ? typesMap.get(outTypeName) : undefined;
    return {
      name:         a.name,
      type:         bpelTypeToJavaClass(a.type, a.attrs),
      description:  a.attrs['activityDisplayName'] ?? undefined,
      config,
      inputMappings,
      outputFields,
      typeId:       a.typeId,
    };
  };

  // Detect palette categories from namespace URIs in the raw XML
  const pluginNsRe = /\/plugins\/([a-zA-Z]+)/g;
  const usedPaletteSet = new Set<string>();
  for (const m of raw.matchAll(pluginNsRe)) usedPaletteSet.add(m[1].toLowerCase());
  const usedPalettes = usedPaletteSet.size > 0 ? [...usedPaletteSet] : undefined;

  // Check for ModuleActivator pattern: <bpws:pick> with multiple <bpws:onMessage> handlers.
  // The pick is typically nested: scope → flow → pick → onMessage[].
  // Walk the root to find the first pick that has onMessage children.
  const pickNode = findPickWithOnMessage(root);
  if (pickNode) {
    const raw_onMsg = pickNode['onMessage'];
    const handlers = Array.isArray(raw_onMsg) ? raw_onMsg : [raw_onMsg];
    const result: BW6ProcessDef[] = [];
    for (const handler of handlers as Record<string, unknown>[]) {
      const operation = String(handler['@_operation'] ?? 'handler');
      const handlerLinkTypes = new Map<string, string>();
      // Collect link type declarations from <bpws:links><bpws:link name="..." tibex:linkType="...">
      collectLinkTypes(handler, handlerLinkTypes);
      const handlerActs: BpelActivity[] = [];
      collectBpelActivities(handler, handlerActs, new Set(), false, handlerLinkTypes);
      if (handlerActs.length === 0) continue;
      const activities = handlerActs.map(toActivity);
      const transitions = buildTransitions(handlerActs, handlerLinkTypes);
      result.push({
        name:        `${procName}/${operation}`,
        activities,
        transitions,
        usedPalettes,
        rawContent:  raw,
      });
    }
    if (result.length > 0) return result;
  }

  // Standard single-process BPEL file
  const acts: BpelActivity[] = [];
  const mainLinkTypes = new Map<string, string>();
  collectLinkTypes(root, mainLinkTypes);
  collectBpelActivities(root, acts, new Set(), false, mainLinkTypes);
  const activities: BW6Activity[] = acts.map(toActivity);
  const transitions = buildTransitions(acts, mainLinkTypes);

  return [{ name: procName, activities, transitions, usedPalettes, rawContent: raw }];
}

export function bpelTypeToJavaClass(tag: string, attrs: Record<string, string>): string {
  // <tib:activity type="fully.qualified.ClassName"> — use the explicit type attribute directly
  if (tag === 'activity' && attrs['type']) return attrs['type'];

  const map: Record<string, string> = {
    // General Activities
    log:                    'com.tibco.bw.palette.generalactivities.runtime.LogActivity',
    mapper:                 'com.tibco.bw.palette.generalactivities.runtime.MapperActivity',
    generalMapping:         'com.tibco.bw.palette.generalactivities.runtime.GeneralMappingActivity',
    assign:                 'com.tibco.bw.palette.generalactivities.runtime.AssignActivity',
    callProcess:            'com.tibco.bw.palette.generalactivities.runtime.CallProcessActivity',
    engineCommand:          'com.tibco.bw.palette.generalactivities.runtime.EngineCommandActivity',
    receive:                'com.tibco.bw.palette.generalactivities.runtime.ReceiveEventActivity',
    invoke:                 'com.tibco.bw.palette.generalactivities.runtime.InvokeActivity',
    reply:                  'com.tibco.bw.palette.generalactivities.runtime.ReplyActivity',
    throw:                  'com.tibco.bw.palette.generalactivities.runtime.ThrowActivity',
    rethrow:                'com.tibco.bw.palette.generalactivities.runtime.RethrowActivity',
    compensate:             'com.tibco.bw.palette.generalactivities.runtime.CompensateActivity',
    wait:                   'com.tibco.bw.palette.generalactivities.runtime.WaitActivity',
    getSharedVariable:      'com.tibco.bw.palette.generalactivities.runtime.GetSharedVariableActivity',
    setSharedVariable:      'com.tibco.bw.palette.generalactivities.runtime.SetSharedVariableActivity',
    // Kafka
    kafkaSend:              'com.tibco.bw.palette.kafka.runtime.KafkaSendActivity',
    kafkaConsumer:          'com.tibco.bw.palette.kafka.runtime.KafkaSubscribeActivity',
    kafkaReceive:           'com.tibco.bw.palette.kafka.runtime.KafkaSubscribeActivity',
    // ADB (TIBCO Data Plane)
    DataMerger:             'com.tibco.bw.palette.adbplugin.runtime.DataMergerActivity',
    DataEventPoller:        'com.tibco.bw.palette.adbplugin.runtime.DataEventPollerActivity',
    DataRequester:          'com.tibco.bw.palette.adbplugin.runtime.DataRequesterActivity',
    // JDBC
    jdbcQuery:              'com.tibco.bw.palette.jdbc.runtime.JDBCQueryActivity',
    jdbcUpdate:             'com.tibco.bw.palette.jdbc.runtime.JDBCUpdateActivity',
    jdbcCall:               'com.tibco.bw.palette.jdbc.runtime.JDBCCallActivity',
    // REST / HTTP
    restInvoke:             'com.tibco.bw.palette.rest.runtime.RESTInvokeActivity',
    httpSend:               'com.tibco.bw.palette.rest.runtime.HTTPSendActivity',
    // EMS / JMS
    jmsSend:                'com.tibco.bw.palette.ems.runtime.JMSSendActivity',
    jmsReceive:             'com.tibco.bw.palette.ems.runtime.JMSReceiveActivity',
    jmsRequestReply:        'com.tibco.bw.palette.ems.runtime.JMSRequestReplyActivity',
    // File
    fileRead:               'com.tibco.bw.palette.file.runtime.FileReadActivity',
    fileWrite:              'com.tibco.bw.palette.file.runtime.FileWriteActivity',
  };
  return map[tag] ?? `com.tibco.bw.palette.generalactivities.runtime.${tag.charAt(0).toUpperCase() + tag.slice(1)}Activity`;
}
