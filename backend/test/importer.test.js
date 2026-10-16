import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seededDir } from './helpers.js';
import { createRepo } from '../src/db/repo.js';
import { importDashboard } from '../src/importers/simkopdes.js';
import { importCoopTrade } from '../src/importers/cooptrade.js';
import { parseDashboard } from '../../collector/src/parsers/dashboard.js';
import * as obs from '../src/services/observatorium.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../collector/test/fixtures');
const parse = (n) => parseDashboard(fs.readFileSync(path.join(FIX, `${n}.html`), 'utf8'), { tanggalPengambilan: '2026-10-16' });

const { store } = seededDir();
const repo = createRepo(store);
const nas = importDashboard(store, parse('dashboard_nasional'), { halaman: 'nasional', url: 'https://simkopdes.go.id/pers/dashboard' });
const jatim = importDashboard(store, parse('district_15'), { halaman: 'provinsi', simkopdesId: 15, url: 'https://simkopdes.go.id/pers/dashboard/district/15' });
const gresik = importDashboard(store, parse('subdistrict_245'), { halaman: 'kabupaten', simkopdesId: 245, url: 'https://simkopdes.go.id/pers/dashboard/sub-district/245' });

test('impor nasional: snapshot 16 Okt lolos validasi dan menjadi tanggal terbaru', () => {
  assert.equal(nas.status, 'ok', nas.masalah.join('; '));
  assert.equal(nas.jumlah_anak, 38);
  assert.equal(repo.tanggalTerakhir('ID'), '2026-10-16');
  const s = repo.snapshot('ID', '2026-10-16');
  assert.equal(s.gerai_selesai, 28375);
  assert.equal(s.rat_draft, 14516);
  assert.equal(repo.snapshot('35', '2026-10-16').pembangunan_gerai_pct, 94.36);
  assert.equal(repo.produkTerlaris('ID', '2026-10-16').length, 10);
  // Snapshot seed 15 Okt tetap ada sebagai riwayat
  assert.equal(repo.snapshot('ID', '2026-10-15').gerai_selesai, 28330);
});

test('impor provinsi: 38 kab/kota Jatim terpetakan dengan ID internal', () => {
  assert.equal(jatim.status, 'ok', jatim.masalah.join('; '));
  assert.equal(jatim.kode, '35');
  const peta = store.all('simkopdes_wilayah_map').filter((m) => m.level === 'kabupaten');
  assert.equal(peta.filter((m) => m.kode?.startsWith('35.')).length, 38);
  assert.equal(peta.find((m) => m.simkopdes_id === 245).kode, '35.25');
  assert.equal(peta.find((m) => m.simkopdes_id === 257).kode, '35.78'); // KOTA SURABAYA
  // Snapshot provinsi digabung: kolom tabel nasional + KPI halaman provinsi
  const s = repo.snapshot('35', '2026-10-16');
  assert.equal(s.punya_akun, 8485);
  assert.equal(s.pemetaan_lahan_pct, 77.98);
});

test('impor kabupaten: 18 kecamatan Gresik, indeks 3 komponen', () => {
  assert.equal(gresik.status, 'ok', gresik.masalah.join('; '));
  const a = obs.anak(repo, '35.25');
  assert.deepEqual(a.cakupan, { ada: 18, total: 18 });
  assert.deepEqual(a.komponen_tersedia, ['nib', 'rat', 'transaksi']);
});

test('level kab/kota memakai 4 komponen (gerai tidak tersedia di sumber)', () => {
  const a = obs.anak(repo, '35');
  assert.equal(a.cakupan.ada, 38);
  assert.deepEqual(a.komponen_tersedia, ['manajer', 'nib', 'rat', 'transaksi']);
  assert.ok(a.rows.every((r) => r.indeks !== null && r.jumlah_komponen === 4));
});

test('selisih total menandai perlu_cek dan tidak dipublikasikan', () => {
  const p = parse('subdistrict_245');
  p.anak[0].jumlah_koperasi += 1;
  const r = importDashboard(store, { ...p, tanggal_data: '2026-10-17' }, { halaman: 'kabupaten', simkopdesId: 245, url: 'x' });
  assert.equal(r.status, 'perlu_cek');
  assert.equal(repo.snapshot('35.25', '2026-10-17'), null);
});

test('impor Coop Trade menyimpan snapshot dan ringkasan', () => {
  const r = importCoopTrade(store, {
    tanggal: '2026-10-16', total: 2,
    produk: [
      { produk_id: 1, produk: 'VANILA', nama_koperasi: 'KDMP A', harga: 4000000, kecamatan: 'X', kabupaten: 'Y', terjual: 2, url: 'u' },
      { produk_id: 2, produk: 'KOPI', nama_koperasi: 'KDMP B', harga: 50000, kecamatan: 'X', kabupaten: 'Y', terjual: 1, url: 'u' },
    ],
  });
  assert.equal(r.status, 'ok');
  assert.equal(repo.cooptradeRingkasan().at(-1).jumlah_terjual, 3);
  assert.equal(repo.cooptradeProduk('2026-10-16').length, 2);
});
