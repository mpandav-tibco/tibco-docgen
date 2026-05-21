import * as fs from 'fs';
import * as path from 'path';
import { DocModel, renderBW6PrintHTML } from '@tibco-docgen/core';
import type { BW6IconRegistry } from '@tibco-docgen/core';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function findChromePath(): string | undefined {
  return CHROME_CANDIDATES.find(p => fs.existsSync(p));
}

export async function exportToPDF(
  model: DocModel,
  pdfPath: string,
  log: (msg: string) => void,
  bw6Icons?: BW6IconRegistry,
): Promise<void> {
  const { default: puppeteer } = await import('puppeteer-core');

  const executablePath = findChromePath();
  if (!executablePath) {
    throw new Error(
      'PDF export requires Chrome or Edge to be installed.\n' +
      'Install Google Chrome or Microsoft Edge, then re-run with --format pdf.',
    );
  }

  log(`   Launching ${path.basename(executablePath)}...\n`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const html = renderBW6PrintHTML(model, bw6Icons);
    const tab = await browser.newPage();

    // Set a wide viewport so SVG flow diagrams render at full width before print scaling
    await tab.setViewport({ width: 1200, height: 900 });
    await tab.setContent(html, { waitUntil: 'load', timeout: 60_000 });

    log(`   Printing to PDF...\n`);
    const buf = await tab.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' },
    });
    await tab.close();

    fs.writeFileSync(pdfPath, buf);
    log(`   PDF saved: ${pdfPath}\n`);
  } finally {
    await browser.close();
  }
}
