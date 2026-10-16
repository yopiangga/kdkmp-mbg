import fs from 'node:fs/promises';
import path from 'node:path';
import { expandPagination } from '../lib/browser.js';
import { RAW_DIR, DATA_DIR, today } from '../lib/paths.js';
import { parseDashboard, halamanTerisi } from '../parsers/dashboard.js';
import { JsonStore } from '../../../backend/src/db/store.js';
import { importDashboard } from '../../../backend/src/importers/simkopdes.js';

export const BASE = 'https://simkopdes.go.id/pers/dashboard';
export const JUMLAH_PROVINSI = 38;
const RAW_SUMBER = 'simkopdes_dashboard';

/** Tanggal hari ini menurut WIB (tanggal pengambilan untuk halaman tanpa cap waktu). */
export const hariIniWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export function halamanUrl(halaman, id) {
  if (halaman === 'nasional') return BASE;
  if (halaman === 'provinsi') return `${BASE}/district/${id}`;
  return `${BASE}/sub-district/${id}`;
}
const namaRaw = (halaman, id) => (halaman === 'nasional' ? 'nasional' : halaman === 'provinsi' ? `district_${id}` : `subdistrict_${id}`);

const tabelSiap = (p) =>
  p.evaluate(() => [...document.querySelectorAll('.ant-table-tbody tr[data-row-key]')].length >= 1
    && [...document.querySelectorAll('p')].some((e) => e.textContent.trim() === 'Total Koperasi'));

/** Buka satu halaman dasbor, simpan HTML mentah, parse, dan impor. */
export async function ambilHalaman(session, halaman, id, { runId } = {}) {
  const url = halamanUrl(halaman, id);
  const page = await session.open(url, { ready: tabelSiap, timeoutMs: 90_000 });
  await page.waitForTimeout(2000); // kartu KPI dan tabel produk dimuat terpisah
  await expandPagination(page);
  const html = await page.content();
  await page.close();

  const dir = path.join(RAW_DIR, RAW_SUMBER, today());
  await fs.mkdir(dir, { recursive: true });
  const rawPath = path.join(dir, `${namaRaw(halaman, id)}.html`);
  await fs.writeFile(rawPath, html);

  return imporHtml(html, { halaman, id, url, runId, rawPath });
}

export function imporHtml(html, { halaman, id, url, runId, rawPath, tanggalPengambilan = hariIniWib() }) {
  const parsed = parseDashboard(html, { tanggalPengambilan });
  if (!halamanTerisi(parsed)) throw new Error(`Halaman ${url} tidak memuat KPI/tabel yang diharapkan.`);
  const store = new JsonStore(DATA_DIR);
  const hasil = importDashboard(store, parsed, { halaman, simkopdesId: id ?? null, url, runId });
  return { ...hasil, path_raw: rawPath ? path.relative(path.resolve(RAW_DIR, '../..'), rawPath) : null };
}

/** ID internal Simkopdes untuk kode Kemendagri (dari simkopdes_wilayah_map). */
export function idSimkopdes(level, kode) {
  const store = new JsonStore(DATA_DIR);
  return store.all('simkopdes_wilayah_map').find((m) => m.level === level && m.kode === kode)?.simkopdes_id ?? null;
}

/** Saring ID yang halamannya belum diambil pada tanggal WIB hari ini (supaya backfill bisa dilanjutkan). */
export function belumDiambilHariIni(level, ids) {
  const store = new JsonStore(DATA_DIR);
  const hari = hariIniWib();
  const sudah = new Set(store.all('simkopdes_wilayah_map')
    .filter((m) => m.level === level && m.halaman_diambil_pada && new Date(new Date(m.halaman_diambil_pada).getTime() + 7 * 3600_000).toISOString().slice(0, 10) === hari)
    .map((m) => m.simkopdes_id));
  return ids.filter((id) => !sudah.has(id));
}

/** ID kab/kota (sub-district) untuk giliran berikutnya, dari pemetaan yang dikumpulkan halaman provinsi. */
export function kabupatenBergilir(jumlah = 17, kecuali = []) {
  const store = new JsonStore(DATA_DIR);
  return store.all('simkopdes_wilayah_map')
    .filter((m) => m.level === 'kabupaten' && m.kode && !kecuali.includes(m.simkopdes_id))
    .sort((a, b) => String(a.halaman_diambil_pada ?? '').localeCompare(String(b.halaman_diambil_pada ?? '')) || a.simkopdes_id - b.simkopdes_id)
    .slice(0, jumlah)
    .map((m) => m.simkopdes_id);
}

/** ID provinsi untuk giliran berikutnya: yang belum pernah atau paling lama diambil lebih dulu. */
export function provinsiBergilir(jumlah = 6) {
  const store = new JsonStore(DATA_DIR);
  const peta = store.all('simkopdes_wilayah_map').filter((m) => m.level === 'provinsi');
  const terakhir = new Map(peta.map((m) => [m.simkopdes_id, m.halaman_diambil_pada ?? m.diambil_pada ?? '']));
  return Array.from({ length: JUMLAH_PROVINSI }, (_, i) => i + 1)
    .sort((a, b) => String(terakhir.get(a) ?? '').localeCompare(String(terakhir.get(b) ?? '')) || a - b)
    .slice(0, jumlah);
}

/** Parse ulang semua HTML mentah pada satu tanggal (setelah parser diperbaiki). */
export async function imporUlangRaw(tanggal) {
  const dir = path.join(RAW_DIR, RAW_SUMBER, tanggal);
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.html')).sort((a, b) => urutan(a) - urutan(b));
  const hasil = [];
  for (const f of files) {
    const m = f.match(/^(nasional|dashboard_nasional|district_(\d+)|subdistrict_(\d+))\.html$/);
    if (!m) continue;
    const halaman = m[2] ? 'provinsi' : m[3] ? 'kabupaten' : 'nasional';
    const id = Number(m[2] ?? m[3]) || null;
    const html = await fs.readFile(path.join(dir, f), 'utf8');
    try {
      hasil.push({ file: f, ...imporHtml(html, { halaman, id, url: halamanUrl(halaman, id), rawPath: path.join(dir, f), tanggalPengambilan: tanggal }) });
    } catch (e) {
      hasil.push({ file: f, status: 'gagal', masalah: [e.message] });
    }
  }
  return hasil;
}
const urutan = (f) => (/nasional/.test(f) ? 0 : /^district/.test(f) ? 1 : 2);
