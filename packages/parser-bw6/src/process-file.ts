import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { BW6ProcessDef } from './types';
import { parseBpelProcess, extractXsltMappings } from './bpel';

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

export function extractConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
    if (k.startsWith('@_')) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      result[k] = v;
    } else if (Array.isArray(v)) {
      result[k] = v.join(', ');
    } else if (v && typeof v === 'object') {
      const inner = extractConfig(v);
      for (const [ik, iv] of Object.entries(inner)) {
        result[`${k}.${ik}`] = iv;
      }
    }
  }
  return result;
}

export function parseProcessFile(bwpPath: string): BW6ProcessDef[] {
  const raw = fs.readFileSync(bwpPath, 'utf8');
  // Detect BPEL format (used by BWCE/BWE)
  if (raw.includes('docs.oasis-open.org/wsbpel') || raw.includes('bpws:process') || raw.includes('bpel:process')) {
    try { return parseBpelProcess(bwpPath, raw); } catch { /* fall through */ }
  }
  const parsed = xmlParser.parse(raw);
  const root = (parsed['ProcessDefinition'] ?? parsed) as Record<string, unknown>;

  const activities = ((root['activity'] ?? []) as Record<string, unknown>[])
    .map(a => {
      const mappings = extractXsltMappings(a);
      return {
        name:         String(a['@_name'] ?? ''),
        type:         String(a['type']   ?? ''),
        resourceType: a['resourceType'] != null ? String(a['resourceType']) : undefined,
        description:  a['description']  != null ? String(a['description'])  : undefined,
        config:       extractConfig(a['config']),
        inputMappings: mappings.length > 0 ? Object.fromEntries(mappings.map(m => [m.target, m.source])) : undefined,
      };
    });

  const transitions = ((root['transition'] ?? []) as Record<string, unknown>[])
    .map(t => ({
      from:                String(t['from'] ?? ''),
      to:                  String(t['to']   ?? ''),
      conditionType:       String(t['conditionType'] ?? 'always'),
      conditionExpression: t['conditionExpression'] != null ? String(t['conditionExpression']) : undefined,
      label:               t['label'] != null ? String(t['label']) : undefined,
    }));

  return [{
    name:        String(root['name']        ?? path.basename(bwpPath, '.bwp')),
    description: root['description'] != null ? String(root['description']) : undefined,
    startName:   root['startName']   != null ? String(root['startName'])   : undefined,
    activities,
    transitions,
    rawContent: raw,
  }];
}
