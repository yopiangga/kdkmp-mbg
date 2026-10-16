import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededDir } from './helpers.js';
import { createRepo } from '../src/db/repo.js';

const { store } = seededDir();
const repo = createRepo(store);
const prov = () => store.all('kdkmp_snapshot').filter((r) => r.tanggal_data === '2026-10-15' && /^\d{2}$/.test(r.kode));

test('38 provinsi dan 514 kab/kota dari referensi wilayah', () => {
  assert.equal(repo.wilayahByLevel('provinsi').length, 38);
  assert.equal(repo.wilayahByLevel('kabupaten').length, 514);
  assert.equal(repo.anakWilayah('35.25').length, 18, 'Gresik punya 18 kecamatan');
});

test('total 38 provinsi = 83.363 koperasi', () => {
  const rows = prov();
  assert.equal(rows.length, 38);
  assert.equal(rows.reduce((s, r) => s + r.jumlah_koperasi, 0), 83363);
});

test('total nilai transaksi = Rp208.610.761.686', () => {
  assert.equal(prov().reduce((s, r) => s + r.nilai_transaksi, 0), 208610761686);
  assert.equal(repo.snapshot('ID', '2026-10-15').nilai_transaksi, 208610761686);
});

test('validasi total lolos sehingga snapshot berstatus ok', () => {
  assert.ok(prov().every((r) => r.status === 'ok'));
  assert.equal(repo.snapshot('ID', '2026-10-15').status, 'ok');
  assert.equal(repo.tanggalTerakhir('ID'), '2026-10-15');
});

test('nama provinsi Simkopdes cocok ke kode Kemendagri', () => {
  const byNama = Object.fromEntries(prov().map((r) => [r.nama_simkopdes, r.kode]));
  assert.equal(byNama['DKI JAKARTA'], '31');
  assert.equal(byNama['JAWA TIMUR'], '35');
  assert.equal(byNama['PAPUA PEGUNUNGAN'], '95');
  assert.equal(byNama['KEPULAUAN BANGKA BELITUNG'], '19');
});

test('setiap baris data seed memiliki sumber_url', () => {
  for (const t of ['wilayah', 'kdkmp_snapshot', 'kdkmp_produk_terlaris', 'rilis_angka', 'cooptrade_ringkasan', 'simkopdes_wilayah_map']) {
    const missing = store.all(t).filter((r) => !r.sumber_url);
    assert.equal(missing.length, 0, `${t}: ${missing.length} baris tanpa sumber_url`);
  }
});

test('asumsi simulasi tanpa sumber diberi catatan (ditampilkan sebagai asumsi penulis)', () => {
  for (const a of store.all('asumsi_simulasi')) {
    assert.ok(a.sumber_url || a.catatan, a.kunci);
  }
  const tanpaSumber = store.all('asumsi_simulasi').filter((a) => !a.sumber_url).map((a) => a.kunci).sort();
  assert.deepEqual(tanpaSumber, ['efek_pengganda', 'pendapatan_per_petani', 'porsi_koperasi_lokal']);
});

test('rilis_angka dari Bagian 2 berstatus terverifikasi', () => {
  const rilis = store.all('rilis_angka');
  assert.ok(rilis.length >= 10);
  assert.ok(rilis.every((r) => r.status === 'terverifikasi'));
  assert.equal(repo.rilisTerakhir('sppg_beroperasi').nilai, 27485);
  assert.equal(repo.rilisTerakhir('pemasok_mbg_kdkmp').nilai, 199);
});

test('seed ulang tidak menggandakan baris dan mempertahankan input admin', async () => {
  const { seed } = await import('../scripts/seed.js');
  repo.insertRilis({ indikator: 'uji', nilai: 1, satuan: 'x', kode_wilayah: 'ID', per_tanggal: '2026-10-16', sumber_url: 'https://contoh.invalid', status: 'draf', asal_input: 'admin' });
  const before = store.all('rilis_angka').length;
  seed({ dataDir: store.dir, log: () => {} });
  const after = store.all('rilis_angka');
  assert.equal(after.length, before);
  assert.ok(after.some((r) => r.indikator === 'uji'));
  assert.equal(store.all('kdkmp_snapshot').length, 50);
});
