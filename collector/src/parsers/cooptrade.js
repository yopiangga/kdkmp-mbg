/**
 * Parser halaman katalog Coop Trade (trade.simkopdes.go.id/search) yang sudah dirender.
 * Fixture: collector/test/fixtures/cooptrade_search.html (16 Okt 2026).
 */
import * as cheerio from 'cheerio';
import { parseIdNumber } from '../lib/parseIdNumber.js';

const clean = (s) => String(s ?? '').replace(/[ ⁠​]/g, ' ').replace(/\s+/g, ' ').trim();

export function parseCoopTrade(html) {
  const $ = cheerio.load(html);
  const total = clean($('body').text()).match(/dari\s+([\d.]+)\s+produk/)?.[1];
  const produk = $('a[href^="/product/"]').toArray().map((a) => {
    const el = $(a);
    const href = el.attr('href');
    const ps = el.find('p').toArray().map((p) => $(p));
    const koperasiP = ps.find((p) => p.find('[aria-label="shop"]').length);
    const lokasiP = ps.find((p) => p.find('[aria-label="environment"]').length);
    const hargaP = ps.find((p) => /^Rp\s?[\d.,]+$/.test(clean(p.text())));
    const namaP = ps.find((p) => p !== koperasiP && p !== lokasiP && p !== hargaP && clean(p.text()));
    const lokasi = clean(lokasiP?.text()).split(',').map((x) => x.trim());
    const terjual = clean(el.text()).match(/(\d[\d.]*)\s+Terjual/)?.[1];
    return {
      produk_id: Number(href.match(/^\/product\/(\d+)/)?.[1]) || null,
      produk: clean(namaP?.text()),
      nama_koperasi: clean(koperasiP?.text()),
      harga: parseIdNumber(clean(hargaP?.text())),
      kecamatan: lokasi[0] || null,
      kabupaten: lokasi[1] || null,
      terjual: terjual !== undefined ? parseIdNumber(terjual) : null,
      url: `https://trade.simkopdes.go.id${href.replace(/\/amp$/, '')}`,
    };
  }).filter((p) => p.produk && p.nama_koperasi);
  return { total: total ? parseIdNumber(total) : null, produk };
}
