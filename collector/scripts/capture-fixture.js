#!/usr/bin/env node
/**
 * Fase 2 langkah pertama: simpan HTML hasil render sebagai fixture parser.
 *   node scripts/capture-fixture.js <url> <nama>
 * Menulis collector/test/fixtures/<nama>.html dan <nama>.txt (innerText) serta salinan di data/raw.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowser, expandPagination } from '../src/lib/browser.js';
import { RAW_DIR, today } from '../src/lib/paths.js';

const [url, nama] = process.argv.slice(2);
if (!url || !nama) {
  console.error('Pakai: node scripts/capture-fixture.js <url> <nama>');
  process.exit(2);
}
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '../test/fixtures');

await withBrowser(async (s) => {
  const page = await s.open(url, {
    timeoutMs: 90_000,
    // Siap bila ada tabel dengan ≥ 5 baris berisi angka.
    ready: (p) => p.evaluate(() => [...document.querySelectorAll('table tbody tr')].filter((tr) => /\d/.test(tr.textContent)).length >= 5),
  });
  await page.waitForTimeout(2500); // beri waktu kartu KPI lain selesai
  const pag = await expandPagination(page);
  if (pag.length) console.log('Paginasi diperluas:', JSON.stringify(pag));
  const html = await page.content();
  const text = await page.evaluate(() => document.body.innerText);
  await fs.mkdir(FIX, { recursive: true });
  await fs.writeFile(path.join(FIX, `${nama}.html`), html);
  await fs.writeFile(path.join(FIX, `${nama}.txt`), text);
  const rawDir = path.join(RAW_DIR, 'simkopdes_dashboard', today());
  await fs.mkdir(rawDir, { recursive: true });
  await fs.writeFile(path.join(rawDir, `${nama}.html`), html);
  console.log(`Tersimpan ${nama}.html (${(html.length / 1024).toFixed(0)} KB), teks ${text.length} karakter`);
});
