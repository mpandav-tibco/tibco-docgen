import * as path from 'path';
import * as fs from 'fs';
import chokidar from 'chokidar';
import { generateDocs } from './index';

export async function startWatch(
  inputPath: string,
  outputDir: string,
  format: 'html' | 'md' | 'json' | 'pdf' | 'all',
  log: (msg: string) => void,
): Promise<void> {
  // Initial generation
  await generateDocs(inputPath, outputDir, format, log);

  // Determine watch patterns
  const stat = fs.statSync(inputPath);
  const patterns = stat.isFile()
    ? [inputPath]
    : [
        path.join(inputPath, '**', '*.bwp'),
        path.join(inputPath, '**', '*.substvar'),
        path.join(inputPath, '**', '*.sharedjdbc'),
        path.join(inputPath, '**', '*.sharedjms'),
        path.join(inputPath, 'META-INF', 'MANIFEST.MF'),
      ];

  log(`\n[watch] Watching ${inputPath} for changes. Press Ctrl+C to stop.\n`);

  let running = false;
  const watcher = chokidar.watch(patterns, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('change', async (changedPath) => {
    if (running) return; // debounce concurrent triggers
    running = true;
    log(`\n[watch] Changed: ${path.basename(changedPath)} — regenerating...\n`);
    try {
      await generateDocs(inputPath, outputDir, format, log);
    } finally {
      running = false;
    }
  });

  watcher.on('add', async (changedPath) => {
    if (running) return;
    running = true;
    log(`\n[watch] Added: ${path.basename(changedPath)} — regenerating...\n`);
    try {
      await generateDocs(inputPath, outputDir, format, log);
    } finally {
      running = false;
    }
  });

  // Keep process alive
  await new Promise<void>((_, reject) => {
    watcher.on('error', reject);
    process.on('SIGINT', () => { watcher.close(); process.exit(0); });
  });
}
