import fs from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR, DATA_DIR, today } from '../lib/paths.js';
import { parseCoopTrade } from '../parsers/cooptrade.js';
import { hariIniWib } from './dashboard.js';
import { JsonStore } from '../../../backend/src/db/store.js';
import { importCoopTrade } from '../../../backend/src/importers/cooptrade.js';

export const COOPTRADE_URL = 'https://trade.simkopdes.go.id/search';
const MAKS_HALAMAN = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bagian 6.5: baca katalog B2B yang dirender, klik halaman berikutnya sampai habis (jeda ≥ 3 detik). */
export async function ambilCoopTrade(session, { runId } = {}) {
  const page = await session.open(COOPTRADE_URL, {
    timeoutMs: 90_000,
    ready: (p) => p.evaluate(() => document.querySelectorAll('a[href^="/product/"]').length > 0 || /dari\s+0\s+produk/.test(document.body.innerText)),
  });
  await page.waitForTimeout(1500);
  const dir = path.join(RAW_DIR, 'cooptrade', today());
  await fs.mkdir(dir, { recursive: true });

  const halaman = [];
  for (let i = 1; i <= MAKS_HALAMAN; i++) {
    const html = await page.content();
    await fs.writeFile(path.join(dir, `search_${i}.html`), html);
    halaman.push(html);
    const next = page.locator('.ant-pagination-next:not(.ant-pagination-disabled) button');
    if (!(await next.count())) break;
    const firstHref = await page.locator('a[href^="/product/"]').first().getAttribute('href');
    await sleep(Math.max(3000, Number(process.env.COLLECTOR_DELAY_MS) || 3000));
    await next.click();
    await page.waitForFunction(
      (prev) => document.querySelector('a[href^="/product/"]')?.getAttribute('href') !== prev,
      firstHref,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(800);
  }
  await page.close();
  return imporHalamanCoopTrade(halaman, { runId, rawDir: dir });
}

export function imporHalamanCoopTrade(halaman, { runId, rawDir, tanggal = hariIniWib() }) {
  const parsed = halaman.map(parseCoopTrade);
  const total = parsed[0]?.total ?? null;
  const produk = [...new Map(parsed.flatMap((p) => p.produk).map((p) => [p.produk_id ?? `${p.nama_koperasi}|${p.produk}`, p])).values()];
  const store = new JsonStore(DATA_DIR);
  const hasil = importCoopTrade(store, { tanggal, total, produk, runId });
  return {
    ...hasil,
    jumlah_halaman: halaman.length,
    path_raw: rawDir ? path.relative(path.resolve(RAW_DIR, '../..'), rawDir) : null,
  };
}
