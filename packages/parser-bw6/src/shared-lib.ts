import * as fs from 'fs';
import * as path from 'path';
import { BW6SubstVar } from './types';
import { BW6SharedLibDoc } from '@tibco-docgen/core';
import { parseManifest } from './manifest';
import { findFiles } from './archive';
import { parseProcessFile } from './process-file';
import { parseSubstVar } from './substvar';
import { findSharedResources } from './resources';
import { parseXsdSchemas, processToFlow } from './doc-model';

function parseSharedLib(libDir: string): BW6SharedLibDoc | null {
  try {
    const manifestPath = path.join(libDir, 'META-INF', 'MANIFEST.MF');
    if (!fs.existsSync(manifestPath)) return null;
    const manifest = parseManifest(manifestPath);
    if (!manifest.isSharedModule) return null;

    // Processes
    const processesDir = path.join(libDir, 'Processes');
    const bwpFiles = fs.existsSync(processesDir) ? findFiles(processesDir, '.bwp') : [];
    const processes = bwpFiles.flatMap(f => parseProcessFile(f));

    // Properties (substvar)
    const substVarFiles = findFiles(path.join(libDir, 'META-INF'), '.substvar');
    const primarySubstVar = substVarFiles[0];
    const substVars: BW6SubstVar[] = primarySubstVar ? parseSubstVar(primarySubstVar) : [];

    // Shared resources
    const sharedResources = findSharedResources(libDir);

    // XSD schemas
    const schemas = parseXsdSchemas(libDir);

    // Palettes from Require-Capability
    const palettes = manifest.requireBundle.filter(Boolean);

    return {
      id:          manifest.bundleSymbolicName || path.basename(libDir),
      name:        manifest.bundleName || path.basename(libDir),
      version:     manifest.bundleVersion,
      description: manifest.description || undefined,
      edition:     manifest.edition,
      sourceDir:   libDir,
      palettes,
      flows:       processes.map(p => processToFlow(p)),
      connections: sharedResources.map(r => ({
        id:          r.id,
        name:        r.name,
        description: r.description,
        type:        r.type,
        ref:         r.ref,
        settings:    Object.keys(r.settings).length > 0 ? r.settings : undefined,
      })),
      schemas,
      properties: substVars.map(v => ({
        name:        v.name,
        type:        v.type,
        value:       v.value,
        description: v.description,
      })),
    };
  } catch {
    return null;
  }
}

export function findSharedLibs(appDir: string, requiredModules: string[]): BW6SharedLibDoc[] {
  if (requiredModules.length === 0) return [];

  const parentDir = path.dirname(appDir);
  const results: BW6SharedLibDoc[] = [];
  const found = new Set<string>();

  try {
    for (const sibling of fs.readdirSync(parentDir)) {
      const siblingDir = path.join(parentDir, sibling);
      if (!fs.statSync(siblingDir).isDirectory()) continue;
      if (siblingDir === appDir) continue;
      const mf = path.join(siblingDir, 'META-INF', 'MANIFEST.MF');
      if (!fs.existsSync(mf)) continue;
      const content = fs.readFileSync(mf, 'utf8');
      if (!content.includes('TIBCO-BW-SharedModule')) continue;
      // Extract Bundle-SymbolicName to match against requiredModules
      const symMatch = content.match(/^Bundle-SymbolicName:\s*(.+)$/m);
      const symName = symMatch?.[1]?.trim() ?? sibling;
      if (!requiredModules.includes(symName)) continue;
      if (found.has(symName)) continue;
      const lib = parseSharedLib(siblingDir);
      if (lib) { results.push(lib); found.add(symName); }
    }
  } catch { /* ignore fs errors */ }

  return results;
}
