import * as fs from 'fs';
import * as path from 'path';
import { BW6AppManifest } from './types';

export function splitOnUnquotedCommas(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of value) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === ',' && !inQuotes) {
      const t = current.trim();
      if (t) result.push(t);
      current = '';
    } else {
      current += ch;
    }
  }
  const t = current.trim();
  if (t) result.push(t);
  return result;
}

export function parseManifest(manifestPath: string): BW6AppManifest {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const attrs: Record<string, string> = {};
  let currentKey = '';
  for (const line of raw.split(/\r?\n/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && currentKey) {
      attrs[currentKey] = (attrs[currentKey] ?? '') + ' ' + line.trim();
    } else {
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (m) { currentKey = m[1].trim(); attrs[currentKey] = m[2].trim(); }
    }
  }

  // Require-Bundle (BW6 on-prem) → palette list
  const requireBundle = splitOnUnquotedCommas(attrs['Require-Bundle'] ?? '');

  // Require-Capability (BWCE/BWE) → extract com.tibco.bw.palette entries
  const requireCap = attrs['Require-Capability'] ?? '';
  if (requireCap) {
    // Split on commas not inside quotes/parens
    const capEntries = splitOnUnquotedCommas(requireCap);
    for (const entry of capEntries) {
      if (entry.includes('com.tibco.bw.palette')) {
        // extract name from filter:="(name=bw.kafka)"
        const nm = entry.match(/name=([^)]+)\)/);
        if (nm) requireBundle.push(`com.tibco.bw.palette.${nm[1].replace(/^bw\./, '')}`);
      }
    }
  }

  // Require-Capability: extract com.tibco.bw.module references (SharedLib dependencies)
  const requiredModules: string[] = [];
  if (requireCap) {
    const capEntries = splitOnUnquotedCommas(requireCap);
    for (const entry of capEntries) {
      if (entry.includes('com.tibco.bw.module')) {
        const nm = entry.match(/name=([^)&]+)[)&]/);
        if (nm) requiredModules.push(nm[1].trim());
      }
    }
  }

  // Config profiles: extract substvar file basenames from TIBCO-BW-ConfigProfile
  const profileAttr = attrs['TIBCO-BW-ConfigProfile'] ?? '';
  const configProfiles: string[] = profileAttr
    ? profileAttr.split(/[\s,]+/).filter(Boolean)
        .map(p => path.basename(p, '.substvar'))
    : [];

  const isSharedModule = !!(attrs['TIBCO-BW-SharedModule']);

  // Normalize edition label
  const rawEdition = (attrs['TIBCO-BW-Edition'] ?? 'BW').toLowerCase();
  let edition = 'BW';
  if (rawEdition === 'bwce' || rawEdition === 'bwcf') edition = 'BWCE';
  else if (rawEdition === 'bwe') edition = 'BWE';
  else if (rawEdition === 'bw') edition = 'BW';
  else edition = rawEdition.toUpperCase();

  return {
    bundleName:         attrs['Bundle-Name']            ?? '',
    bundleSymbolicName: attrs['Bundle-SymbolicName']    ?? '',
    bundleVersion:      attrs['Bundle-Version']         ?? '1.0.0',
    description:        attrs['TIBCO-BW-Description']   ?? attrs['Bundle-Description'] ?? '',
    edition,
    bwVersion:          attrs['TIBCO-BW-Version']       ?? '',
    requireBundle,
    requiredModules,
    configProfiles,
    isSharedModule,
    msvPath:            attrs['TIBCO-BW-ModuleSharedVariables'] ?? '',
    jsvPath:            attrs['TIBCO-BW-JobSharedVariables']    ?? '',
    bwmPath:            attrs['TIBCO-BW-ApplicationModule']     ?? '',
    hasRequireCapability: !!(attrs['Require-Capability']),
  };
}
