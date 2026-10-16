import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDashboard, parseDotDecimal } from '../src/parsers/dashboard.js';

// Fixture: HTML hasil render Simkopdes, ditangkap 16 Okt 2026 (scripts/capture-fixture.js).
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (n) => parseDashboard(fs.readFileSync(path.join(FIX, `${n}.html`), 'utf8'), { tanggalPengambilan: '2026-10-16' });
const sum = (rows, k) => rows.reduce((s, r) => s + Math.round((r[k] ?? 0) * 100), 0) / 100;

const nas = load('dashboard_nasional');
const jatim = load('district_15');
const gresik = load('subdistrict_245');

test('persen bertitik desimal', () => {
  assert.equal(parseDotDecimal('77.98'), 77.98);
  assert.equal(parseDotDecimal('94.36%'), 94.36);
  assert.equal(parseDotDecimal('70'), 70);
  assert.equal(parseDotDecimal('1.234.5'), null);
  assert.equal(parseDotDecimal(''), null);
});

test('nasional: KPI, tanggal, dan 10 produk', () => {
  assert.equal(nas.tanggal_data, '2026-10-16');
  assert.equal(nas.kpi.jumlah_koperasi, 83363);
  assert.equal(nas.kpi.punya_akun, 79733);
  assert.equal(nas.kpi.nilai_transaksi, 208617164786);
  assert.equal(nas.kpi.lahan_terverifikasi, 36334);
  assert.equal(nas.kpi.gerai_selesai, 28375);
  assert.equal(nas.kpi.rat_draft, 14516);
  assert.equal(nas.kpi.rat_diverifikasi, 45340);
  assert.equal(nas.produk_terlaris.length, 10);
  assert.deepEqual(nas.produk_terlaris[1], { peringkat: 2, nama_produk: 'MINYAK GORENG', volume: 3218208, nilai: 47065270778.96 });
});

test('nasional: 38 provinsi dan jumlahnya = KPI nasional (toleransi 0)', () => {
  assert.equal(nas.level_anak, 'provinsi');
  assert.equal(nas.anak.length, 38);
  for (const [kolom, kpi] of [['jumlah_koperasi', 'jumlah_koperasi'], ['nilai_transaksi', 'nilai_transaksi'], ['simpanan_pokok', 'simpanan_pokok'],
    ['simpanan_wajib', 'simpanan_wajib'], ['rat_selesai', 'rat_selesai'], ['manajer_aktif', 'manajer_aktif'], ['punya_nib', 'punya_nib'],
    ['punya_npwp', 'punya_npwp'], ['pemetaan_lahan', 'lahan_diajukan']]) {
    assert.equal(sum(nas.anak, kolom), nas.kpi[kpi], kolom);
  }
  const aceh = nas.anak.find((r) => r.nama === 'ACEH');
  assert.equal(aceh.pembangunan_gerai_pct, 89.1);
  assert.equal(aceh.pemetaan_lahan_pct, 28.24);
  assert.equal(aceh.simkopdes_id, null); // baris provinsi tidak memuat ID internal
});

test('provinsi (Jawa Timur, id 15): 38 kab/kota dengan ID internal', () => {
  assert.equal(jatim.konteks.provinsi, 'JAWA TIMUR');
  assert.equal(jatim.level_anak, 'kabupaten');
  assert.equal(jatim.anak.length, 38);
  assert.equal(jatim.kpi.pembangunan_gerai_pct, 94.36);
  assert.equal(jatim.kpi.pemetaan_lahan, 6624);
  assert.equal(jatim.kpi.pemetaan_lahan_pct, 77.98);
  const g = jatim.anak.find((r) => r.nama === 'KAB. GRESIK');
  assert.equal(g.simkopdes_id, 245);
  assert.equal(g.jumlah_koperasi, 356);
  assert.equal(g.nilai_transaksi, 3481280428);
  assert.equal(sum(jatim.anak, 'jumlah_koperasi'), jatim.kpi.jumlah_koperasi);
  assert.equal(sum(jatim.anak, 'nilai_transaksi'), jatim.kpi.nilai_transaksi);
});

test('kab/kota (Gresik, id 245): 18 kecamatan, total = Lampiran B', () => {
  assert.equal(gresik.konteks.kabupaten, 'KAB. GRESIK');
  assert.equal(gresik.level_anak, 'kecamatan');
  assert.equal(gresik.anak.length, 18);
  assert.equal(gresik.kpi.jumlah_koperasi, 356);
  assert.equal(gresik.kpi.nilai_transaksi, 3481280428);
  assert.equal(sum(gresik.anak, 'jumlah_koperasi'), 356);
  assert.equal(sum(gresik.anak, 'nilai_transaksi'), 3481280428);
  const keb = gresik.anak.find((r) => r.nama === 'Kebomas');
  assert.deepEqual(
    { nib: keb.punya_nib, rat: keb.rat_selesai, trx: keb.nilai_transaksi, manajer: keb.manajer_aktif },
    { nib: 19, rat: 16, trx: 357437365, manajer: undefined },
  );
});
