/**
 * Harga pangan dari PIHPS Nasional (Bank Indonesia) — BRIEF 6.7 (opsional).
 * Sumber resmi dengan endpoint JSON publik yang dipakai halaman tabelnya (robots.txt mengizinkan; tanpa API key/CAPTCHA).
 * Cakupan: 34 provinsi (pembagian lama) dan kota survei PIHPS saja; kab/kota lain tidak punya harga sendiri.
 * Catatan: Panel Harga Bapanas tidak dipakai karena endpoint harganya mensyaratkan API key.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR, DATA_DIR, today } from '../lib/paths.js';
import { parseGridPihps } from '../parsers/pihps.js';
import { JsonStore } from '../../../backend/src/db/store.js';
import { importHarga } from '../../../backend/src/importers/harga.js';

export const PIHPS = 'https://www.bi.go.id/hargapangan/WebSite/TabelHarga';
export const PIHPS_HALAMAN = 'https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah';
const JENIS_PASAR = { id: 1, nama: 'tradisional' };
const HARI = 7;

const isoHariIni = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const mundur = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

export async function ambilHarga(client, { runId, provinsiFilter } = {}) {
  const dir = path.join(RAW_DIR, 'pihps', today());
  await fs.mkdir(dir, { recursive: true });
  const get = async (endpoint, params = {}, simpanSebagai) => {
    const url = `${PIHPS}/${endpoint}?${new URLSearchParams(params)}`;
    const res = await client.request(url, { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${endpoint}`);
    const text = await res.text();
    if (simpanSebagai) await fs.writeFile(path.join(dir, `${simpanSebagai}.json`), text);
    return JSON.parse(text);
  };
  const daftar = (j) => (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []);

  const provinsi = daftar(await get('GetRefProvince', {}, 'ref_provinsi'));
  const komoditas = daftar(await get('GetRefCommodityAndCategory', {}, 'ref_komoditas'));
  const kategori = komoditas.filter((k) => String(k.id).startsWith('cat_')).map((k) => k.id).join(',');
  const akhir = isoHariIni();
  const awal = mundur(akhir, HARI - 1);
  const grid = (province_id, regency_id) => get('GetGridDataDaerah', {
    price_type_id: JENIS_PASAR.id, comcat_id: kategori, province_id, regency_id, market_id: '',
    tipe_laporan: 1, start_date: awal, end_date: akhir,
  }, `grid_${province_id}_${regency_id || 'prov'}`);

  const hasil = [];
  for (const p of provinsi.filter((x) => !provinsiFilter || provinsiFilter.includes(x.name))) {
    hasil.push({ level: 'provinsi', pihps_id: p.id, nama: p.name, provinsi: p.name, baris: parseGridPihps(await grid(p.id, ''), komoditas) });
    const kota = daftar(await get('GetRefRegency', { price_type_id: JENIS_PASAR.id, ref_prov_id: p.id }, `ref_kota_${p.id}`));
    for (const k of kota) {
      hasil.push({ level: 'kabupaten', pihps_id: k.id, nama: String(k.name).trim(), provinsi: p.name, baris: parseGridPihps(await grid(p.id, k.id), komoditas) });
    }
  }

  const store = new JsonStore(DATA_DIR);
  const r = importHarga(store, hasil, { jenisPasar: JENIS_PASAR.nama, sumberUrl: PIHPS_HALAMAN, runId, periode: { awal, akhir } });
  return { ...r, path_raw: path.relative(path.resolve(RAW_DIR, '../..'), dir) };
}

/** Parse ulang hasil mentah PIHPS pada satu tanggal tanpa mengambil ulang (setelah pencocokan diperbaiki). */
export async function imporUlangHarga(tanggal) {
  const dir = path.join(RAW_DIR, 'pihps', tanggal);
  const baca = async (f) => JSON.parse(await fs.readFile(path.join(dir, `${f}.json`), 'utf8'));
  const daftar = (j) => (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []);
  const provinsi = daftar(await baca('ref_provinsi'));
  const komoditas = daftar(await baca('ref_komoditas'));
  const hasil = [];
  for (const p of provinsi) {
    try {
      hasil.push({ level: 'provinsi', pihps_id: p.id, nama: p.name, provinsi: p.name, baris: parseGridPihps(await baca(`grid_${p.id}_prov`), komoditas) });
      for (const k of daftar(await baca(`ref_kota_${p.id}`))) {
        hasil.push({ level: 'kabupaten', pihps_id: k.id, nama: String(k.name).trim(), provinsi: p.name, baris: parseGridPihps(await baca(`grid_${p.id}_${k.id}`), komoditas) });
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  const store = new JsonStore(DATA_DIR);
  return importHarga(store, hasil, { jenisPasar: JENIS_PASAR.nama, sumberUrl: PIHPS_HALAMAN, periode: null });
}
