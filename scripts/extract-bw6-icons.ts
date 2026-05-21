#!/usr/bin/env node
/**
 * Build-time script: extracts real TIBCO BW6 palette icons from the bw-dev codebase
 * and generates BW6_REAL_ICONS in packages/parser-bw6/src/svg-icons-real.ts.
 *
 * Run once whenever the bw-dev codebase is updated:
 *   npx ts-node scripts/extract-bw6-icons.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const PALETTE_BASE = 'c:/Users/mpandav/Downloads/Work/TIBCO/git/bw-dev/bw-dev/palettes/design/plugins';
const OUT_FILE     = path.join(__dirname, '../packages/parser-bw6/src/svg-icons-real.ts');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPngDataURI(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const ext  = path.extname(filePath).toLowerCase();
    const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.gif' ? 'image/gif' : 'image/png';
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${data}`;
  } catch { return null; }
}

/** Find all icon files in a palette dir's icons/ subtree, keyed by lowercase basename (no ext). */
function buildIconFileMap(paletteDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const iconsDir = path.join(paletteDir, 'icons');
  if (!fs.existsSync(iconsDir)) return map;

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.png', '.gif', '.svg'].includes(ext)) continue;
      // Key: basename without size suffix and extension, lowercased
      const base = entry.name.replace(/_\d+x\d+\.(png|gif|svg)$/i, '').replace(/\.(png|gif|svg)$/i, '').toLowerCase();
      if (!map.has(base)) map.set(base, full); // first wins (prefer obj16 > obj32 since we walk alphabetically)
    }
  }
  // Walk obj16 first for preference, then everything else
  const obj16 = path.join(iconsDir, 'obj16');
  const fullObj16 = path.join(iconsDir, 'full', 'obj16');
  const fileObj16 = path.join(iconsDir, 'file', 'obj16');
  for (const preferred of [obj16, fullObj16, fileObj16]) {
    if (fs.existsSync(preferred)) walk(preferred);
  }
  // Also walk the rest to catch icons in non-standard locations
  walk(iconsDir);
  return map;
}

/** Parse plugin.xml and return list of { activityTypeID, eClassName } pairs. */
function parsePluginXml(pluginXmlPath: string): Array<{ id: string; className: string; explicitIcon?: string }> {
  const xml = fs.readFileSync(pluginXmlPath, 'utf8');
  const results: Array<{ id: string; className: string; explicitIcon?: string }> = [];

  // Match <config activityTypeID="..." eClassName="..."> blocks
  const configRe = /<config\s[^>]*activityTypeID="([^"]+)"[^>]*eClassName="([^"]+)"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = configRe.exec(xml)) !== null) {
    results.push({ id: m[1], className: m[2] });
  }

  // Also match explicit smallIcon attributes co-located with activityTypeID
  // Pattern: <activityType ... activityTypeID="X" ... smallIcon="Y">
  const actRe = /<activityType\b([^>]+)>/gs;
  while ((m = actRe.exec(xml)) !== null) {
    const attrs = m[1];
    const idMatch      = /activityTypeID="([^"]+)"/.exec(attrs);
    const iconMatch    = /smallIcon="([^"]+)"/.exec(attrs);
    if (idMatch && iconMatch) {
      const existing = results.find(r => r.id === idMatch[1]);
      if (existing) existing.explicitIcon = iconMatch[1];
      else results.push({ id: idMatch[1], className: '', explicitIcon: iconMatch[1] });
    }
  }

  // Deduplicate by activityTypeID
  const seen = new Set<string>();
  return results.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
}

/** Lowercase first character of a string. */
function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const entries: Array<{ activityId: string; className: string; dataUri: string; source: string }> = [];
const paletteIcons: Array<{ paletteKey: string; dataUri: string }> = [];

const paletteDirs = fs.readdirSync(PALETTE_BASE)
  .filter(d => d.startsWith('com.tibco.bw.palette.') && d.endsWith('.design'))
  .map(d => path.join(PALETTE_BASE, d));

for (const paletteDir of paletteDirs) {
  const pluginXml = path.join(paletteDir, 'plugin.xml');
  if (!fs.existsSync(pluginXml)) continue;

  const paletteName = path.basename(paletteDir)
    .replace('com.tibco.bw.palette.', '')
    .replace('.design', '');

  const iconMap  = buildIconFileMap(paletteDir);
  const activities = parsePluginXml(pluginXml);

  console.log(`\n[${paletteName}] ${activities.length} activities, ${iconMap.size} icon files`);

  // Palette-level icon (smallIcon at palette element level)
  const xmlContent = fs.readFileSync(pluginXml, 'utf8');
  const paletteIconMatch = /smallIcon="([^"]+)"/.exec(xmlContent);
  if (paletteIconMatch) {
    const iconRelPath = paletteIconMatch[1];
    const iconAbsPath = path.join(paletteDir, iconRelPath);
    const uri = toPngDataURI(iconAbsPath);
    if (uri) {
      paletteIcons.push({ paletteKey: `__palette.${paletteName}`, dataUri: uri });
      console.log(`  palette icon: ${iconRelPath}`);
    }
  }

  // Per-activity icons
  for (const act of activities) {
    let uri: string | null = null;
    let source = '';

    // 1. Explicit smallIcon in plugin.xml
    if (act.explicitIcon) {
      const abs = path.join(paletteDir, act.explicitIcon);
      uri = toPngDataURI(abs);
      if (uri) source = `explicit: ${act.explicitIcon}`;
    }

    // 2. Match by eClassName (lowercase first char) → iconMap
    if (!uri && act.className) {
      const key = lcFirst(act.className);
      const iconPath = iconMap.get(key);
      if (iconPath) {
        uri = toPngDataURI(iconPath);
        if (uri) source = `className: ${act.className} → ${path.basename(iconPath)}`;
      }
    }

    // 3. Match by last segment of activityTypeID against icon map
    if (!uri) {
      const lastSeg = act.id.split('.').pop()!.toLowerCase();
      // Try direct match, then with 'activity' suffix, then prefix scan
      for (const candidate of [lastSeg, `${lastSeg}activity`, `${lastSeg}starter`]) {
        const iconPath = iconMap.get(candidate);
        if (iconPath) {
          uri = toPngDataURI(iconPath);
          if (uri) { source = `segment: ${candidate} → ${path.basename(iconPath)}`; break; }
        }
      }
      // Fuzzy: find any key that contains the segment
      if (!uri) {
        for (const [k, v] of iconMap) {
          if (k.includes(lastSeg) && !k.includes('palette') && !k.includes('resource') && !k.includes('connection')) {
            uri = toPngDataURI(v);
            if (uri) { source = `fuzzy: ${k} → ${path.basename(v)}`; break; }
          }
        }
      }
    }

    if (uri) {
      entries.push({ activityId: act.id, className: act.className, dataUri: uri, source });
      console.log(`  ✓ ${act.id} (${source})`);
    } else {
      console.log(`  ✗ ${act.id} — no icon found, will use palette fallback`);
    }
  }
}

// ─── Generate TypeScript ───────────────────────────────────────────────────────

const allEntries = [
  ...entries.map(e => ({ key: e.activityId, uri: e.dataUri })),
  ...paletteIcons.map(p => ({ key: p.paletteKey, uri: p.dataUri })),
];

// Build className → icon map (keyed by lowercase Java class name, e.g. "jdbcqueryactivity")
const classMappings: Array<{ className: string; dataUri: string }> = [];
const seenClasses = new Set<string>();
for (const e of entries) {
  if (!e.className) continue;
  const key = e.className.charAt(0).toLowerCase() + e.className.slice(1); // lcFirst
  const keyLower = key.toLowerCase();
  if (!seenClasses.has(keyLower)) {
    seenClasses.add(keyLower);
    classMappings.push({ className: keyLower, dataUri: e.dataUri });
  }
}

const tsLines = [
  '// AUTO-GENERATED by scripts/extract-bw6-icons.ts — DO NOT EDIT MANUALLY',
  `// Generated: ${new Date().toISOString()}`,
  `// Source: bw-dev/palettes/design/plugins/`,
  '',
  '// Maps activityTypeID → base64 PNG data URI.',
  '// Keys prefixed with "__palette." are palette-level fallbacks.',
  'export const BW6_REAL_ICONS: Record<string, string> = {',
  ...allEntries.map(e => `  '${e.key}': '${e.uri}',`),
  '};',
  '',
  '// Maps lowercase Java eClassName → base64 PNG data URI.',
  '// e.g. "jdbcqueryactivity" → icon URI. Used as fallback when activityTypeID is absent from bwp.',
  'export const BW6_CLASS_ICONS: Record<string, string> = {',
  ...classMappings.map(e => `  '${e.className}': '${e.dataUri}',`),
  '};',
  '',
  `// ${entries.length} per-activity icons, ${paletteIcons.length} palette icons`,
];

fs.writeFileSync(OUT_FILE, tsLines.join('\n'), 'utf8');
console.log(`\n✅ Written ${entries.length} activity + ${paletteIcons.length} palette icons → ${OUT_FILE}`);
