import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seededDir } from './helpers.js';
import { createRepo } from '../src/db/repo.js';
import { importHarga } from '../src/importers/harga.js';
import { hargaWilayah } from '../src/services/observatorium.js';
import { parseGridPihps } from '../../collector/src/parsers/pihps.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../collector/test/fixtures');
const grid = JSON.parse(fs.readFileSync(path.join(FIX, 'pihps_grid_banyumas_cilacap.json'), 'utf8'));
const baris = parseGridPihps(grid);

const { store } = seededDir();
const repo = createRepo(store);
const hasil = importHarga(store, [
  { level: 'provinsi', pihps_id: 14, nama: 'Jawa Tengah', provinsi: 'Jawa Tengah', baris },
  { level: 'kabupaten', pihps_id: 38, nama: 'Kab. Banyumas', provinsi: 'Jawa Tengah', baris },
  { level: 'kabupaten', pihps_id: 39, nama: 'Kab. Cilacap', provinsi: 'Jawa Tengah', baris },
  { level: 'kabupaten', pihps_id: 36, nama: 'Kota Surakarta (Solo)', provinsi: 'Jawa Tengah', baris },
  { level: 'kabupaten', pihps_id: 166, nama: 'Kab. Boyolali ', provinsi: 'Jawa Tengah', baris },
], { jenisPasar: 'tradisional', sumberUrl: 'https://www.bi.go.id/hargapangan', periode: { awal: '2026-10-12', akhir: '2026-10-16' } });

test('nama PIHPS ("Kota Surakarta (Solo)", spasi di akhir) cocok ke kode Kemendagri', () => {
  assert.equal(hasil.status, 'ok', hasil.tidak_cocok.join(', '));
  assert.deepEqual(repo.kodeDenganHarga().sort(), ['33', '33.01', '33.02', '33.09', '33.72']);
});

test('kota survei memakai harganya sendiri, ditambah kota survei terdekat', () => {
  const h = hargaWilayah(repo, '33.02');
  assert.equal(h.cakupan, 'kota_survei');
  assert.equal(h.kolom[0].peran, 'wilayah');
  assert.deepEqual(h.kolom.map((c) => c.peran), ['wilayah', 'provinsi', 'kota_survei_terdekat', 'kota_survei_terdekat', 'kota_survei_terdekat']);
  assert.ok(!h.kolom.slice(2).some((c) => c.kode === '33.02'));
  assert.equal(h.kolom[0].harga.find((x) => x.komoditas === 'Beras').harga, 15850);
});

test('Kebumen (bukan kota survei): provinsi + tiga kota survei terdekat', () => {
  const h = hargaWilayah(repo, '33.05');
  assert.equal(h.cakupan, 'pendekatan');
  assert.deepEqual(h.kolom.map((c) => c.peran), ['provinsi', 'kota_survei_terdekat', 'kota_survei_terdekat', 'kota_survei_terdekat']);
  assert.equal(h.kolom[1].kode, '33.02'); // Banyumas paling dekat
  assert.ok(h.kolom[1].jarak_km < h.kolom[2].jarak_km && h.kolom[2].jarak_km < h.kolom[3].jarak_km);
  assert.match(h.catatan, /bukan kota survei PIHPS/);
  assert.equal(h.komoditas[0], 'Beras');
});

test('wilayah tanpa harga di provinsinya tetap mendapat kota survei terdekat lintas provinsi', () => {
  const h = hargaWilayah(repo, '35.25');
  assert.equal(h.cakupan, 'pendekatan');
  assert.match(h.catatan, /bukan kota survei PIHPS; ditampilkan 3 kota survei terdekat/);
  assert.ok(h.kolom.length > 0 && h.kolom.every((c) => c.peran === 'kota_survei_terdekat'));
  assert.ok(h.kolom.every((c) => c.provinsi === 'Jawa Tengah'));
});
