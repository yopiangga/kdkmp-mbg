import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededDir } from './helpers.js';
import { createRepo } from '../src/db/repo.js';
import { hitungIndeks, parseBobot } from '../src/services/indeks.js';
import { hitungMatriks, kuadranOf } from '../src/services/kuadran.js';
import { kelompokProduk, polaToRegex } from '../src/services/komposisi.js';
import { kebutuhanHarian, rasioCelah, setaraHari } from '../src/services/celah.js';
import { validasiTotal } from '../src/services/validasi.js';
import * as obs from '../src/services/observatorium.js';

const { store } = seededDir();
const repo = createRepo(store);
const provRows = obs.anak(repo, 'ID').rows;

test('kuadran gedung siap, usaha belum = Aceh, Bengkulu, Gorontalo, Kep. Bangka Belitung, Riau', () => {
  const m = hitungMatriks(provRows);
  const nama = m.titik.filter((t) => t.kuadran === 'gedung_siap_usaha_belum').map((t) => t.nama).sort();
  assert.deepEqual(nama, ['Aceh', 'Bengkulu', 'Gorontalo', 'Kepulauan Bangka Belitung', 'Riau']);
});

test('jumlah per kuadran 12 / 5 / 8 / 13', () => {
  const { jumlah } = hitungMatriks(provRows);
  assert.deepEqual(jumlah, { siap: 12, gedung_siap_usaha_belum: 5, usaha_jalan_gedung_belum: 8, tertinggal: 13 });
});

test('ambang kuadran bisa diatur', () => {
  assert.equal(kuadranOf(80, 1_000_000), 'siap');
  assert.equal(kuadranOf(79.99, 1_000_000), 'usaha_jalan_gedung_belum');
  assert.equal(kuadranOf(90, 999_999), 'gedung_siap_usaha_belum');
  assert.equal(kuadranOf(50, 10), 'tertinggal');
  const { jumlah } = hitungMatriks(provRows, { ambangGerai: 0, ambangTrx: 0 });
  assert.equal(jumlah.siap, 38);
});

test('peringkat indeks: #1 Jawa Timur, #38 Papua Pegunungan', () => {
  const ranked = [...provRows].sort((a, b) => a.peringkat - b.peringkat);
  assert.equal(ranked[0].nama, 'Jawa Timur');
  assert.equal(ranked[0].peringkat, 1);
  assert.equal(ranked[37].nama, 'Papua Pegunungan');
  assert.equal(ranked[37].peringkat, 38);
  assert.ok(provRows.every((r) => r.jumlah_komponen === 5));
});

test('indeks berada di 0–100 dan komponen transaksi dinormalisasi min–max', () => {
  assert.ok(provRows.every((r) => r.indeks >= 0 && r.indeks <= 100));
  const trx = provRows.map((r) => r.komponen.transaksi);
  assert.equal(Math.min(...trx), 0);
  assert.equal(Math.max(...trx), 100);
});

test('bobot bisa diatur; bobot 0 mengeluarkan komponen', () => {
  assert.deepEqual(parseBobot('gerai:2,rat:0,asal:9'), { gerai: 2, manajer: 1, nib: 1, rat: 0, transaksi: 1 });
  assert.deepEqual(parseBobot('{"nib":0.5}').nib, 0.5);
  const hanyaGerai = hitungIndeks(provRows, { gerai: 1, manajer: 0, nib: 0, rat: 0, transaksi: 0 }).rows;
  const jatim = hanyaGerai.find((r) => r.kode === '35');
  assert.equal(jatim.indeks, 94.34);
  const top = [...hanyaGerai].sort((a, b) => a.peringkat - b.peringkat)[0];
  assert.equal(top.nama, 'Jawa Tengah'); // gerai 94,85%
});

test('level kecamatan memakai indeks 3 komponen', () => {
  const a = obs.anak(repo, '35.25');
  assert.equal(a.level_anak, 'kecamatan');
  assert.equal(a.indeks_3_komponen, true);
  assert.deepEqual(a.cakupan, { ada: 10, total: 18 });
  const ada = a.rows.filter((r) => r.status_data === 'ada');
  assert.ok(ada.every((r) => r.jumlah_komponen === 3 && r.indeks !== null));
  assert.equal(a.rows.filter((r) => r.status_data === 'belum_dikumpulkan').length, 8);
  // Duduksampeyan: transaksi 0 → komponen transaksi 0, bukan null
  assert.equal(ada.find((r) => r.nama === 'Duduksampeyan').komponen.transaksi, 0);
});

test('kab/kota dengan komponen < 3 tidak diberi indeks', () => {
  const a = obs.anak(repo, '35');
  const gresik = a.rows.find((r) => r.kode === '35.25');
  assert.equal(gresik.status_data, 'ada');
  assert.equal(gresik.indeks, null);
  assert.equal(a.cakupan.ada, 1);
});

test('pengelompokan produk', () => {
  const pola = repo.polaKelompok();
  assert.equal(kelompokProduk('Beras medium SPHP 5 kg', pola), 'program');
  assert.equal(kelompokProduk('Beras', pola), 'sembako');
  assert.equal(kelompokProduk('Gas LPG 3 kg', pola), 'program');
  assert.equal(kelompokProduk('Pupuk Urea N 46%', pola), 'program');
  assert.equal(kelompokProduk('Sunco minyak goreng pouch 2 L', pola), 'sembako');
  assert.equal(kelompokProduk('Susu Ultramilk 125 ml', pola), 'segar_protein');
  assert.equal(kelompokProduk('Semen', pola), 'lainnya');
  assert.ok(polaToRegex('%a.b%').test('xa.by'));
  assert.ok(!polaToRegex('%a.b%').test('xaXby'));
});

test('komposisi nasional: porsi program dari total transaksi', () => {
  const k = obs.komposisi(repo, 'ID');
  const program = k.kelompok.find((x) => x.kelompok === 'program');
  assert.equal(program.nilai, 92973980428 + 15093971120 + 11274748800 + 663036731);
  assert.ok(Math.abs(program.porsi_total_pct - 57.53) < 0.01);
  assert.ok(Math.abs(k.cakupan_pct - 91.16) < 0.01);
});

test('rumus celah MBG', () => {
  assert.equal(kebutuhanHarian(53_000_000, 15000, 0.7), 556_500_000_000);
  assert.equal(rasioCelah(1000, 100, 5), 2);
  assert.equal(rasioCelah(1000, null, 5), null);
  assert.ok(Math.abs(setaraHari(208610761686, 556_500_000_000) - 0.3749) < 0.0001);
  const c = obs.celahMbg(repo, { kodeKab: '35.25' });
  assert.equal(c.kecamatan.rows.length, 18);
  assert.ok(c.kecamatan.rows.every((r) => r.sppg === null && r.kebutuhan_harian === null));
});

test('validasi total menandai selisih', () => {
  const rows = store.all('kdkmp_snapshot').filter((r) => /^\d{2}$/.test(r.kode));
  const nas = repo.snapshot('ID', '2026-10-15');
  assert.equal(validasiTotal(rows, nas).ok, true);
  const salah = rows.map((r, i) => (i === 0 ? { ...r, jumlah_koperasi: r.jumlah_koperasi + 1 } : r));
  const v = validasiTotal(salah, nas);
  assert.equal(v.ok, false);
  assert.match(v.masalah[0], /jumlah_koperasi/);
  assert.equal(validasiTotal(rows.slice(1), nas).ok, false);
});

test('ringkasan: judul temuan, 6 KPI berlabel, funnel, 3 temuan', () => {
  const r = obs.ringkasan(repo);
  assert.equal(r.judul, '28.330 gerai sudah berdiri, tetapi rata-rata koperasi baru bertransaksi Rp2,5 juta sepanjang 2026.');
  assert.equal(r.kpi.length, 6);
  assert.ok(r.kpi.every((k) => ['Resmi', 'Rilis', 'Estimasi', 'Indeks'].includes(k.label_asal) && 'tanggal' in k));
  assert.deepEqual(r.funnel.map((f) => f.nilai), [83363, 36328, 28330, 26911, null, 199]);
  assert.equal(r.funnel[4].tersedia, false);
  assert.equal(r.temuan.length, 3);
  assert.match(r.temuan[2].judul, /^5 provinsi/);
});

test('permintaan vs kesiapan nonaktif tanpa data SPPG per provinsi', () => {
  const p = obs.permintaan(repo);
  assert.equal(p.aktif, false);
  assert.equal(p.titik.length, 0);
});

test('matriks kab/kota nonaktif: sumber tidak memuat gerai per kab/kota', () => {
  const m = obs.matriks(repo, { level: 'kabupaten' });
  assert.equal(m.aktif, false);
  assert.match(m.alasan, /tidak menampilkan persentase pembangunan gerai/);
});
