import type { BW6IconRegistry } from '@tibco-docgen/core';
import { getBW6SvgIcon, getBW6UnknownIcon } from './svg-icons';

/**
 * Build a BW6IconRegistry backed entirely by embedded SVG icons.
 * No local BW6 installation is required.
 * The SVG icons are crisp at any size (vector, not bitmap).
 */
export function buildBW6IconRegistry(_pluginsDirs: string[]): BW6IconRegistry {
  return {
    get(ref: string, name?: string, typeId?: string): string | undefined {
      return getBW6SvgIcon(ref, name, typeId);
    },
    unknownIcon: getBW6UnknownIcon(),
    size: -1, // sentinel: SVG-backed registry
  };
}

/**
 * Returns candidate BW6 plugins directories for this machine.
 * Still exported for backward compatibility but no longer used by the SVG registry.
 */
export function defaultBW6PluginsDirs(): string[] {
  const candidates: string[] = [];
  for (const ver of ['6.12', '6.11', '6.10', '6.9', '6.8']) {
    candidates.push(`C:/tibco/bw6/${ver}/bw/${ver}/p2repos/plugins`);
    candidates.push(`C:/tibco/BW/${ver}/p2repos/plugins`);
  }
  const tibcoHome = process.env['TIBCO_HOME'];
  if (tibcoHome) {
    const path = require('path') as typeof import('path');
    candidates.push(path.join(tibcoHome, 'bw', 'p2repos', 'plugins'));
  }
  return candidates;
}
