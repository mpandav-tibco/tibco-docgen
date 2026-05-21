import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { BW6SubstVar, BW6AppManifest } from './types';
import { PropertyDoc, RestBindingDoc, RestOperationDoc, SharedVarDoc } from '@tibco-docgen/core';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => ['activity', 'transition', 'processProperty', 'pvPair', 'globalVariable', 'substitutionBindings', 'field'].includes(name),
  parseTagValue: false,
  trimValues: true,
  // Raise entity expansion limit for large BW6 process files (default is 1000)
  processEntities: { enabled: true, maxTotalExpansions: 100000 } as unknown as boolean,
});

export function parseSubstVar(filePath: string): BW6SubstVar[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = xmlParser.parse(raw);
    const root = (parsed['scalingPackage'] ?? parsed['repository'] ?? parsed) as Record<string, unknown>;

    // BW6 on-prem format: scalingPackage/subsVar/pvPairs/pvPair
    const subsVar = root['subsVar'] as Record<string, unknown> | undefined;
    if (subsVar) {
      const pvPairs = ((subsVar['pvPairs'] as Record<string, unknown>)?.['pvPair'] ?? []) as Record<string, unknown>[];
      return pvPairs.map(p => ({
        name:        String(p['name']  ?? ''),
        type:        String(p['type']  ?? 'String'),
        value:       String(p['value'] ?? ''),
        description: p['description'] != null ? String(p['description']) : undefined,
      }));
    }

    // BWCE/BWE format: globalVariables/globalVariable
    // Two sub-formats:
    //   A) element-based: <globalVariable><name>X</name><type>String</type>...</globalVariable>
    //   B) attribute-based: <globalVariable name="X" dataType="String">...</globalVariable>
    const gvContainer = root['globalVariables'] as Record<string, unknown> | undefined;
    if (gvContainer) {
      const gvs = (gvContainer['globalVariable'] ?? []) as Record<string, unknown>[];
      return gvs.map(g => ({
        name:        String(g['@_name']  ?? g['name']  ?? ''),
        type:        String(g['@_dataType'] ?? g['@_type'] ?? g['type'] ?? 'String'),
        value:       String(g['value'] ?? ''),
        description: g['description'] != null ? String(g['description']) : undefined,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

// ─── TIBCO.xml (application descriptor) ──────────────────────────────────────

export function parseTibcoXml(tibcoXmlPath: string): { modules: string[]; appModules: string[]; properties: BW6SubstVar[] } {
  try {
    const raw = fs.readFileSync(tibcoXmlPath, 'utf8');
    const parsed = xmlParser.parse(raw);
    const root = (parsed['application'] ?? parsed) as Record<string, unknown>;

    // Extract module names from <modules>/<module>
    const modulesNode = root['modules'] as Record<string, unknown> | undefined;
    const moduleList = modulesNode
      ? (Array.isArray(modulesNode['module']) ? modulesNode['module'] : [modulesNode['module']]).filter(Boolean) as Record<string, unknown>[]
      : [];
    const modules = moduleList.map(m => String(m['@_symbolicName'] ?? '')).filter(Boolean);
    // appModules: only type="application" entries — the primary module bundle (not shared libs)
    const appModules = moduleList
      .filter(m => String(m['@_type'] ?? 'application').toLowerCase() === 'application')
      .map(m => String(m['@_symbolicName'] ?? '')).filter(Boolean);

    // Extract properties from <properties>/<property>
    const propsNode = root['properties'] as Record<string, unknown> | undefined;
    const propList = propsNode
      ? (Array.isArray(propsNode['property']) ? propsNode['property'] : [propsNode['property']]).filter(Boolean) as Record<string, unknown>[]
      : [];
    const properties: BW6SubstVar[] = propList.map(p => ({
      name:        String(p['@_name'] ?? ''),
      type:        String(p['@_type'] ?? 'String'),
      value:       String(p['value'] ?? ''),
      description: p['description'] != null ? String(p['description']) : undefined,
    })).filter(p => p.name);

    return { modules, appModules, properties };
  } catch {
    return { modules: [], appModules: [], properties: [] };
  }
}

// ─── Per-profile properties ───────────────────────────────────────────────────

export function parseProfileProperties(
  appDir: string,
  siblingAppDir?: string,
): Record<string, PropertyDoc[]> {
  const profileMap: Record<string, PropertyDoc[]> = {};

  const scanDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.substvar')) continue;
      const profileName = path.basename(f, '.substvar');
      const fullPath = path.join(dir, f);
      const vars = parseSubstVar(fullPath);
      if (vars.length > 0) {
        profileMap[profileName] = vars.map(v => ({
          name: v.name, type: v.type, value: v.value, description: v.description,
        }));
      }
    }
  };

  scanDir(path.join(appDir, 'META-INF'));
  scanDir(path.join(appDir, 'defaultVars'));
  if (siblingAppDir) scanDir(path.join(siblingAppDir, 'META-INF'));

  return profileMap;
}

// ─── Shared Variables (module.msv / module.jsv) ──────────────────────────────

export function parseSharedVarFile(filePath: string, scope: 'module' | 'job'): SharedVarDoc[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = xmlParser.parse(raw);
    // Root element is <msv:DocumentRoot> or <jsv:DocumentRoot>
    const rootKey = Object.keys(parsed).find(k => !k.startsWith('?'));
    if (!rootKey) return [];
    const root = parsed[rootKey] as Record<string, unknown>;
    // Container is <moduleSharedVariables> or <jobSharedVariables>
    const containerKey = Object.keys(root).find(k =>
      k.includes('SharedVariables') || k.includes('sharedVariables'));
    if (!containerKey) return [];
    const container = root[containerKey] as Record<string, unknown> | null;
    if (!container) return [];
    // Each child element is a shared variable definition
    const results: SharedVarDoc[] = [];
    for (const [key, val] of Object.entries(container)) {
      if (key.startsWith('@_') || key === '#text') continue;
      const items = Array.isArray(val) ? val : [val];
      for (const item of items as Record<string, unknown>[]) {
        if (!item || typeof item !== 'object') continue;
        const name = String(item['@_name'] ?? item['name'] ?? key);
        const type = String(item['@_type'] ?? item['type'] ?? 'String')
          .replace(/^XMLSchema:/, '').replace(/^xsd:/, '');
        const value = item['@_value'] != null ? String(item['@_value'])
          : item['value'] != null ? String(item['value']) : undefined;
        const description = item['description'] != null ? String(item['description']) : undefined;
        if (name && name !== key) results.push({ name, type, value, description, scope });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Module.bwm — service binding extraction (REST + SOAP) ───────────────────

export function parseModuleBwm(bwmPath: string): RestBindingDoc[] {
  try {
    const raw = fs.readFileSync(bwmPath, 'utf8');
    const results: RestBindingDoc[] = [];

    // Step 1: Build component-name → processName map from <sca:component> elements.
    // XMI format: <sca:component name="ComponentBooks" ...>
    //               <scaext:implementation ... processName="tibco.bwce.....Books"/>
    // Simple format: processName may be directly inside <sca:service> block.
    const componentProcessMap = new Map<string, string>();
    for (const m of raw.matchAll(/<sca:component\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/sca:component>/g)) {
      const compName = m[1];
      const implM = m[2].match(/\bprocessName="([^"]+)"/);
      if (implM) componentProcessMap.set(compName, implM[1]);
    }

    // Step 2: Parse top-level <sca:service> blocks (those with a `promote` attribute are
    // top-level endpoints; nested ones inside <sca:component> lack that attribute).
    // Use a regex that matches the outermost <sca:service>…</sca:service> blocks.
    for (const m of raw.matchAll(/<sca:service\b([^>]*)>([\s\S]*?)<\/sca:service>/g)) {
      const attrStr = m[1];
      const body    = m[2];

      const nameM    = attrStr.match(/\bname="([^"]+)"/);
      const serviceName = nameM?.[1] ?? 'Service';
      const promoteM = attrStr.match(/\bpromote="([^/"]+)/);  // take component segment only

      // Resolve processName: prefer direct processName in service block, then via component map
      const directProcM = body.match(/\bprocessName="([^"]+)"/);
      const processName = directProcM?.[1]
        ?? (promoteM?.[1] ? componentProcessMap.get(promoteM[1]) : undefined);

      // Detect binding type from xsi:type attribute on <scaext:binding>
      const bindingTagM = body.match(/<scaext:binding\b([^>]*?)(?:\/>|>)/);
      if (!bindingTagM) continue;
      const bindingAttrs = bindingTagM[1];
      const xsiType = bindingAttrs.match(/xsi:type="([^"]+)"/)?.[1] ?? '';

      const isRest = /[Rr]est[Ss]ervice[Bb]inding/i.test(xsiType) || /rest:/i.test(xsiType);
      const isSoap = /[Ss]oap[Ss]ervice[Bb]inding/i.test(xsiType) || /axis2:/i.test(xsiType);
      if (!isRest && !isSoap) continue;  // skip reference bindings and unknown types

      const bindingType: 'rest' | 'soap' = isSoap ? 'soap' : 'rest';

      // REST: extract path and basePath from binding tag
      let bPath   = bindingAttrs.match(/\bpath="([^"]+)"/)?.[1] ?? '/';
      let basePath = bindingAttrs.match(/\bbasePath="([^"]+)"/)?.[1] ?? '';

      // SOAP: extract endpoint URI from nested <inboundConfiguration endpointURI="..."/>
      if (isSoap) {
        const epM = body.match(/\bendpointURI="([^"]+)"/);
        bPath = epM?.[1] ?? '/';
      }

      // Operations: <operation httpMethod="..." operationName="..." nickname="..."/>
      //         or: <operationConfiguration ... operationName="..."/>
      const operations: RestOperationDoc[] = [];
      const opPattern = /<(?:operation|operationConfiguration)\b([^/]*?)(?:\/>|>)/g;
      for (const op of body.matchAll(opPattern)) {
        const oa = op[1];
        const method  = oa.match(/\bhttpMethod="([^"]+)"/)?.[1]
          ?? (isSoap ? 'SOAP' : 'GET');
        const opName  = oa.match(/\boperationName="([^"]+)"/)?.[1]
          ?? oa.match(/\baction="([^"]+)"/)?.[1]
          ?? method.toLowerCase();
        const nickname = oa.match(/\bnickname="([^"]+)"/)?.[1];
        const notes    = oa.match(/\bnotes="([^"]+)"/)?.[1];
        operations.push({ method: method.toUpperCase(), operationName: opName, nickname, notes: notes || undefined });
      }

      results.push({ serviceName, path: bPath, basePath, processName, operations, bindingType });
    }

    // Deduplicate: if the same processName is bound via multiple services with the same path,
    // keep all — the renderer groups them by process for the arch diagram.
    return results;
  } catch {
    return [];
  }
}
