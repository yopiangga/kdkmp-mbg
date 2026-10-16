/**
 * Bagian 6.2: profil koperasi lewat API microsite (HTTP langsung, terbatas), pilot Kab. Gresik.
 * - Kandidat slug dari nama desa Kemendagri: huruf kecil, spasi → "-". Pola yang dipakai Simkopdes adalah
 *   "<desa>-kecamatan-<kecamatan>"; bila 404 atau kecamatan tidak cocok, coba SATU cadangan "<desa>". Tidak ada variasi lain.
 * - Data pribadi (members, managements, distinct_managements) dibuang di memori sebelum apa pun ditulis.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR, SEED_DIR, today } from '../lib/paths.js';
import { stripPII, toKoperasiRow } from '../lib/sanitize.js';
import { normalisasiNama } from '../../../backend/src/lib/wilayahNama.js';

export const API = 'https://simkopdes.go.id/api';

/**
 * Kabupaten pilot microsite, diproses berurutan (yang pertama = prioritas):
 * Kebumen (prioritas pemilik proyek), Gresik (brief), Kota Surabaya (perkotaan), Kab. Bangka (luar Jawa, gedung siap/usaha belum),
 * lalu tetangga Kebumen sebagai pembanding regional: Banyumas, Cilacap, Purworejo, Banjarnegara.
 */
export const PILOT_MICROSITE = ['33.05', '35.25', '35.78', '19.01', '33.02', '33.01', '33.06', '33.04'];

export const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

const urlFor = (endpoint, slug) => `${API}/${endpoint}?path_params=${encodeURIComponent(JSON.stringify({ name: slug }))}`;

async function post(client, endpoint, slug) {
  const res = await client.request(urlFor(endpoint, slug), { method: 'POST', headers: { 'Content-Length': '0' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${endpoint} ${slug}`);
  return res.json();
}

const samaKecamatan = (a, b) => normalisasiNama(a).replace(/^KECAMATAN /, '') === normalisasiNama(b).replace(/^KECAMATAN /, '');

/**
 * @param client  klien sopan (createPoliteClient) — jeda ≥ 3 dtk, kuota harian, robots.txt
 * @param opts.kab  kode kab pilot (default 35.25)
 * @param opts.limit  batasi jumlah desa yang dicoba pada run ini
 * @param opts.lewati  set kode desa yang sudah diambil dalam 7 hari terakhir
 */
/** Bila sekian desa pertama di satu kabupaten tidak ada yang ditemukan, pola slug kabupaten itu berbeda: berhenti. */
export const BATAS_NOL_BERUNTUN = 40;

export async function ambilMicrosite(client, { kab = '35.25', limit = Infinity, lewati = new Set(), rawDir, seedDir = SEED_DIR, onRow, batasNol = BATAS_NOL_BERUNTUN } = {}) {
  const ref = JSON.parse(await fs.readFile(path.join(seedDir, `wilayah_desa_${kab}.json`), 'utf8'));
  const kec = JSON.parse(await fs.readFile(path.join(seedDir, 'wilayah_kecamatan.json'), 'utf8')).kecamatan;
  const namaKec = new Map(kec.map((k) => [k.kode, k.nama]));
  const dir = rawDir ?? path.join(RAW_DIR, 'simkopdes_microsite', today());
  await fs.mkdir(dir, { recursive: true });

  const rows = [];
  let dicoba = 0;
  let kuotaHabis = false;
  let polaTidakCocok = false;
  for (const d of ref.desa) {
    if (rows.length >= batasNol && !rows.some((r) => r.status === 'aktif')) {
      polaTidakCocok = true;
      break;
    }
    if (lewati.has(d.kode)) continue;
    if (dicoba >= limit) break;
    // Sisakan cukup kuota untuk satu desa penuh (2 slug + produk).
    if (client.remaining !== undefined && client.remaining < 3) {
      kuotaHabis = true;
      break;
    }
    dicoba += 1;
    const kecamatan = namaKec.get(d.kode.slice(0, 8)) ?? '';
    // Pola nyata Simkopdes (diuji 16 Okt 2026): "<desa>-kecamatan-<kecamatan>"; nama desa saja sebagai cadangan.
    const kandidat = [`${slugify(d.nama)}-kecamatan-${slugify(kecamatan)}`, slugify(d.nama)];

    let hasil = null;
    for (const slug of kandidat) {
      const raw = await post(client, 'getCooperativeBySlug', slug);
      // Respons 200 berisi profil langsung (tanpa bungkus `data`); 404 berisi { data: null }.
      const prof = raw?.data ?? raw;
      if (!prof?.name) continue;
      const cocok = samaKecamatan(prof.subdistrict?.name ?? '', kecamatan);
      if (!cocok) continue;
      // Buang PII di memori SEBELUM ditulis ke mana pun.
      const profil = stripPII(prof);
      const produkRaw = await post(client, 'getCooperativeProductsBySlug', slug);
      const daftarProduk = Array.isArray(produkRaw) ? produkRaw : produkRaw?.data ?? [];
      const produk = stripPII(daftarProduk);
      const row = toKoperasiRow(slug, prof, daftarProduk);
      await fs.writeFile(path.join(dir, `${slug}.json`), JSON.stringify({ profil, produk }));
      hasil = { ...row, kode_desa: d.kode, kode_kecamatan: d.kode.slice(0, 8) };
      break;
    }
    const row = hasil ?? {
      slug: kandidat[0], nama: null, kode_desa: d.kode, kode_kecamatan: d.kode.slice(0, 8),
      diambil_pada: new Date().toISOString(), status: 'slug_tidak_ditemukan', slug_dicoba: kandidat,
    };
    rows.push(row);
    onRow?.([row]); // simpan bertahap supaya run panjang yang terputus tidak kehilangan hasil
  }
  return { rows, dicoba, rawDir: dir, kuotaHabis, polaTidakCocok };
}
