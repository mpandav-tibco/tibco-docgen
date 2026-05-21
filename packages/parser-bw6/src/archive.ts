import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';

/**
 * Extract a ZIP or EAR to a temporary directory and return the path.
 * Caller is responsible for cleanup via cleanupTempDir().
 */
export function extractToTemp(archivePath: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tibco-docgen-'));
  const zip = new AdmZip(archivePath);
  zip.extractAllTo(tmpDir, true);
  return tmpDir;
}

export function cleanupTempDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

export function findFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results.push(...findFiles(full, ext));
    } else if (!ext || entry.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}
