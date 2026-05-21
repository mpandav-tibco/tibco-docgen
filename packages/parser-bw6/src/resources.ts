import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { BW6SharedResource } from './types';
import { ConnectionDoc, SchemaDoc, SpecDoc, WsdlMessage, WsdlPortType, WsdlOperation } from '@tibco-docgen/core';
import { findFiles } from './archive';
import { extractConfig } from './process-file';

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

// Local helper — same as doc-model.ts shortType, duplicated to avoid circular import
function shortType(ref: string): string {
  return ref.split('.').pop() ?? ref;
}

const RESOURCE_EXTENSIONS = new Set([
  '.xml', '.sharedjdbc', '.sharedjms', '.sharedhttp', '.sharedftp',
  '.jdbcResource', '.jmsResource', '.kafkaconnectionResource',
  '.keystoreProviderResource', '.trustResource', '.adbResource',
  '.ragResource',
]);

export function isResourceFile(filename: string): boolean {
  if (RESOURCE_EXTENSIONS.has(path.extname(filename))) return true;
  if (filename.includes('shared') || filename.includes('Resource') || filename.includes('Connection')) return true;
  return false;
}

export function parseSharedResource(filePath: string): BW6SharedResource | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = xmlParser.parse(raw);
    const rootKey = Object.keys(parsed).find(k => !k.startsWith('?') && k !== 'xml' && k !== '');
    if (!rootKey) return null;
    const r = parsed[rootKey] as Record<string, unknown>;

    // XMI namedResource format (BWCE): <jndi:namedResource name="..." type="jdbc:JdbcDataSource">
    if (rootKey === 'namedResource') {
      const rawName = String(r['@_name'] ?? path.basename(filePath));
      const shortName = rawName.split('.').pop() ?? rawName;
      const rawType = String(r['@_type'] ?? '');
      // type like "jdbc:JdbcDataSource" → "JdbcDataSource"
      const typePart = rawType.includes(':') ? rawType.split(':')[1] ?? rawType : rawType;

      // Build settings by collecting all substitutionBindings from any nesting level,
      // then supplement with direct XML attributes on the config node.
      const configNode = (r['configuration'] ?? {}) as Record<string, unknown>;

      // Recursively collect all substitutionBindings from any child element
      function collectBindings(node: Record<string, unknown>): Record<string, unknown>[] {
        const result: Record<string, unknown>[] = [];
        const direct = node['substitutionBindings'];
        if (direct) {
          const arr = Array.isArray(direct) ? direct : [direct];
          result.push(...arr.filter(Boolean) as Record<string, unknown>[]);
        }
        for (const [k, v] of Object.entries(node)) {
          if (k.startsWith('@_') || k === 'substitutionBindings') continue;
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            result.push(...collectBindings(v as Record<string, unknown>));
          } else if (Array.isArray(v)) {
            for (const item of v) {
              if (item && typeof item === 'object') {
                result.push(...collectBindings(item as Record<string, unknown>));
              }
            }
          }
        }
        return result;
      }

      const topBindings = (r['substitutionBindings'] ?? []) as Record<string, unknown>[];
      const nestedBindings = collectBindings(configNode);
      const allBindings = [...topBindings, ...nestedBindings];

      const settings: Record<string, unknown> = {};
      for (const b of allBindings) {
        const template = String(b['@_template'] ?? b['template'] ?? '');
        const propName = String(b['@_propName'] ?? b['propName'] ?? '');
        if (template) settings[template] = propName ? `%%{${propName}}%%` : '';
      }

      // Also extract direct XML attributes from the config node (e.g. formatType, retryCount)
      const SKIP_CONFIG_ATTRS = new Set(['xmi:id', 'xsi:type', 'xmi:version', 'xmlns', 'name', 'type', 'id', 'version']);
      for (const [k, v] of Object.entries(configNode)) {
        if (!k.startsWith('@_')) continue;
        const attrName = k.slice(2);
        if (attrName.startsWith('xmlns:') || SKIP_CONFIG_ATTRS.has(attrName)) continue;
        if (!settings[attrName] && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
          settings[attrName] = v;
        }
      }

      return {
        id:   rawName,
        name: shortName,
        type: shortType(typePart),
        ref:  rawType || rootKey,
        settings,
      };
    }

    // BW6 on-prem format
    const settings = extractConfig(r);
    delete settings['name'];
    delete settings['description'];
    return {
      id:          String(r['@_name'] ?? r['name'] ?? path.basename(filePath)),
      name:        String(r['@_name'] ?? r['name'] ?? path.basename(filePath)),
      description: r['description'] != null ? String(r['description']) : undefined,
      type:        shortType(rootKey),
      ref:         rootKey,
      settings,
    };
  } catch {
    return null;
  }
}

export function findSharedResources(appDir: string): BW6SharedResource[] {
  const resourcesDir = path.join(appDir, 'Resources');
  if (!fs.existsSync(resourcesDir)) return [];
  const results: BW6SharedResource[] = [];
  for (const f of findFiles(resourcesDir, '')) {
    if (!isResourceFile(path.basename(f))) continue;
    const r = parseSharedResource(f);
    if (r) results.push(r);
  }
  return results;
}

// ─── Service Descriptors ──────────────────────────────────────────────────────

const SERVICE_DESC_EXTS = new Set(['.wsdl', '.yaml', '.yml', '.json', '.swagger']);

export function findServiceDescFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results.push(...findServiceDescFiles(full));
    } else if (SERVICE_DESC_EXTS.has(path.extname(entry).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

export function parseServiceDescriptors(appDir: string): SpecDoc[] {
  const candidates = [
    path.join(appDir, 'Service Descriptors'),
    path.join(appDir, 'service-descriptors'),
    path.join(appDir, 'ServiceDescriptors'),
  ];
  const specs: SpecDoc[] = [];
  for (const dir of candidates) {
    for (const file of findServiceDescFiles(dir)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const ext = path.extname(file).toLowerCase();
        const baseName = path.basename(file, ext);
        let type = 'other';
        if (ext === '.wsdl') type = 'wsdl';
        else if (ext === '.yaml' || ext === '.yml' || ext === '.json') type = 'openapi';
        else if (ext === '.swagger') type = 'swagger';

        let title = baseName;
        let version = '';
        let basePath = '';
        const endpoints: string[] = [];

        if (type === 'openapi' || type === 'swagger') {
          const titleM = content.match(/^title:\s*(.+)$/m) ?? content.match(/"title"\s*:\s*"([^"]+)"/);
          if (titleM) title = titleM[1].trim().replace(/['"]/g, '');
          const verM = content.match(/^\s*version:\s*(.+)$/m) ?? content.match(/"version"\s*:\s*"([^"]+)"/);
          if (verM) version = verM[1].trim().replace(/['"]/g, '');
          const bpM = content.match(/^basePath:\s*(.+)$/m);
          if (bpM) basePath = bpM[1].trim();
          // Extract path entries from YAML paths: section
          const pathMatches = content.match(/^  (\/[^\s:]+)\s*:/gm) ?? [];
          for (const p of pathMatches.slice(0, 20)) endpoints.push(p.trim().replace(/:$/, ''));
        } else if (type === 'wsdl') {
          const svcM = content.match(/service\s+name="([^"]+)"/i)
                    ?? content.match(/<[^:]*:?definitions\s[^>]*name="([^"]+)"/);
          if (svcM) title = svcM[1];
          const nsM = content.match(/targetNamespace="([^"]+)"/);
          const wsdlTargetNamespace = nsM?.[1];
          // Extract only portType operations (not binding duplicates)
          const portTypeBlock = content.match(/<[^:]*:?portType[\s\S]*?<\/[^:]*:?portType>/i)?.[0] ?? '';
          const opMatches = portTypeBlock.match(/operation\s+name="([^"]+)"/gi) ?? [];
          for (const op of opMatches.slice(0, 20)) {
            const m = op.match(/name="([^"]+)"/i);
            if (m) endpoints.push(m[1]);
          }
          // Parse messages
          const wsdlMessages: WsdlMessage[] = [];
          const msgBlocks = content.match(/<[^:]*:?message\s[^>]*>[\s\S]*?<\/[^:]*:?message>/gi) ?? [];
          for (const block of msgBlocks.slice(0, 50)) {
            const nameM = block.match(/name="([^"]+)"/i);
            if (!nameM) continue;
            const parts: WsdlMessage['parts'] = [];
            const partMatches = block.match(/<[^:]*:?part\s[^/]*\/?>/gi) ?? [];
            for (const pm of partMatches) {
              const pName = pm.match(/name="([^"]+)"/i)?.[1] ?? '';
              const pElem = pm.match(/element="([^"]+)"/i)?.[1];
              const pType = pm.match(/type="([^"]+)"/i)?.[1];
              parts.push({ name: pName, element: pElem, type: pType });
            }
            wsdlMessages.push({ name: nameM[1], parts });
          }
          // Parse portTypes with operations
          const wsdlPortTypes: WsdlPortType[] = [];
          const ptBlocks = content.match(/<[^:]*:?portType\s[^>]*>[\s\S]*?<\/[^:]*:?portType>/gi) ?? [];
          for (const block of ptBlocks) {
            const ptName = block.match(/name="([^"]+)"/i)?.[1] ?? '';
            const operations: WsdlPortType['operations'] = [];
            const opBlocks = block.match(/<[^:]*:?operation\s[^>]*>[\s\S]*?<\/[^:]*:?operation>/gi) ?? [];
            for (const ob of opBlocks.slice(0, 50)) {
              const opName = ob.match(/name="([^"]+)"/i)?.[1] ?? '';
              const inMsg = ob.match(/<[^:]*:?input[^>]*message="([^"]+)"/i)?.[1];
              const outMsg = ob.match(/<[^:]*:?output[^>]*message="([^"]+)"/i)?.[1];
              const faultMsg = ob.match(/<[^:]*:?fault[^>]*message="([^"]+)"/i)?.[1];
              operations.push({ name: opName, input: inMsg, output: outMsg, fault: faultMsg });
            }
            wsdlPortTypes.push({ name: ptName, operations });
          }

          specs.push({
            id: baseName.replace(/[^a-zA-Z0-9_-]/g, '_'),
            name: path.basename(file),
            type,
            content,
            title,
            version: version || undefined,
            basePath: basePath || undefined,
            endpoints: endpoints.length > 0 ? endpoints : undefined,
            wsdlMessages: wsdlMessages.length > 0 ? wsdlMessages : undefined,
            wsdlPortTypes: wsdlPortTypes.length > 0 ? wsdlPortTypes : undefined,
            wsdlTargetNamespace,
          });
          continue;
        }

        specs.push({
          id: baseName.replace(/[^a-zA-Z0-9_-]/g, '_'),
          name: path.basename(file),
          type,
          content,
          title,
          version: version || undefined,
          basePath: basePath || undefined,
          endpoints: endpoints.length > 0 ? endpoints : undefined,
        });
      } catch { /* skip unreadable files */ }
    }
  }
  return specs;
}
