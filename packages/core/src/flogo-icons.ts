import * as fs from 'fs';
import * as path from 'path';

export interface FlogoIconRegistry {
  /** ref → base64 data URI (e.g. "data:image/png;base64,...") */
  get(ref: string): string | undefined;
  size: number;
}

function findDescriptors(dir: string, name: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findDescriptors(full, name, results);
    else if (e.name === name) results.push(full);
  }
  return results;
}

function toDataURI(iconPath: string): string | null {
  if (!fs.existsSync(iconPath)) return null;
  try {
    const data = fs.readFileSync(iconPath);
    const ext  = path.extname(iconPath).toLowerCase();
    const mime = ext === '.svg' ? 'image/svg+xml' : 'image/png';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

function resolveIconPath(descriptorFile: string, iconRef: string): string | null {
  const dir = path.dirname(descriptorFile);
  // Direct path from descriptor dir
  const direct = path.join(dir, iconRef);
  if (fs.existsSync(direct)) return direct;
  // Sometimes smallIcon omits 'icons/' prefix — try in icons/ subdir
  const parts = iconRef.split('/');
  const inIcons = path.join(dir, 'icons', parts[parts.length - 1]);
  if (fs.existsSync(inIcons)) return inIcons;
  // Last resort: bare filename in descriptor dir
  const bare = path.join(dir, parts[parts.length - 1]);
  if (fs.existsSync(bare)) return bare;
  return null;
}

/**
 * Build a Flogo icon registry by scanning VS Code extension dirs and custom
 * extension dirs. Returns a lookup from activity/trigger ref → base64 data URI.
 *
 * @param extensionDirs  Directories to scan (e.g. VS Code extension dir, custom extensions dir)
 */
export function buildFlogoIconRegistry(extensionDirs: string[]): FlogoIconRegistry {
  const map = new Map<string, string>();

  for (const extDir of extensionDirs) {
    const descriptors = [
      ...findDescriptors(extDir, 'activity.json'),
      ...findDescriptors(extDir, 'trigger.json'),
      ...findDescriptors(extDir, 'connector.json'),
    ];

    for (const descFile of descriptors) {
      try {
        const raw = fs.readFileSync(descFile, 'utf8');
        const d   = JSON.parse(raw) as {
          ref?: string;
          display?: { smallIcon?: string; largeIcon?: string };
          image?: string;
        };
        const ref = d.ref;
        if (!ref) continue;

        const iconRef = d.display?.smallIcon ?? d.display?.largeIcon ?? d.image;
        if (!iconRef) continue;

        const iconPath = resolveIconPath(descFile, iconRef);
        if (!iconPath) continue;

        const dataURI = toDataURI(iconPath);
        if (!dataURI) continue;

        // Store by full ref
        if (!map.has(ref)) map.set(ref, dataURI);
        // Also store by short alias: "#lastSegment" (e.g. "#actreturn", "#noop", "#log")
        const shortAlias = '#' + ref.split('/').pop();
        if (shortAlias !== '#' && !map.has(shortAlias)) map.set(shortAlias, dataURI);
      } catch {
        // skip invalid JSON or unreadable files
      }
    }
  }

  return {
    get: (ref: string) => map.get(ref),
    size: map.size,
  };
}

/**
 * Default extension directories to scan. Checks common paths and returns
 * existing ones. Add custom dirs as needed.
 */
export function defaultFlogoExtensionDirs(): string[] {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  const candidates = [
    // OOTB: scan all tibco.flogo-* extensions in ~/.vscode/extensions
    ...(() => {
      const extBase = path.join(home, '.vscode', 'extensions');
      if (!fs.existsSync(extBase)) return [];
      try {
        return fs.readdirSync(extBase)
          .filter(d => d.startsWith('tibco.flogo-'))
          .map(d => path.join(extBase, d, 'media', 'flogo-contributions'));
      } catch { return []; }
    })(),
  ];
  return candidates.filter(d => fs.existsSync(d));
}
