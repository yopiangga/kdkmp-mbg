import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededDir } from './helpers.js';
import { createRepo } from '../src/db/repo.js';
import { cocokkanNamaDetail } from '../src/lib/wilayahNama.js';

const repo = createRepo(seededDir().store);
const cek = (induk, nama) => cocokkanNamaDetail(nama, repo.anakWilayah(induk));

// Kasus nyata dari dasbor Simkopdes (16 Okt 2026).
test('singkatan Simkopdes: ADM., KEP., OKU', () => {
  assert.deepEqual(cek('31', 'KAB. ADM. KEP. SERIBU'), { kode: '31.01', cara: 'tepat' });
  assert.deepEqual(cek('31', 'KOTA ADM. JAKARTA BARAT'), { kode: '31.73', cara: 'tepat' });
  assert.deepEqual(cek('16', 'KAB. OKU SELATAN'), { kode: '16.09', cara: 'tepat' });
});

test('beda spasi dan kata "dan"', () => {
  assert.deepEqual(cek('15', 'KAB. BATANG HARI'), { kode: '15.04', cara: 'ringkas' });
  assert.deepEqual(cek('34', 'KAB. GUNUNG KIDUL'), { kode: '34.03', cara: 'ringkas' });
  assert.deepEqual(cek('73', 'KAB. PANGKAJENE KEPULAUAN'), { kode: '73.10', cara: 'ringkas' });
});

test('beda ejaan kecil ditandai "mirip"', () => {
  assert.deepEqual(cek('12', 'KOTA PADANG SIDEMPUAN'), { kode: '12.77', cara: 'mirip' });
});

test('kota dan kabupaten bernama sama tidak tertukar', () => {
  assert.equal(cek('35', 'KAB. BLITAR').kode, '35.05');
  assert.equal(cek('35', 'KOTA BLITAR').kode, '35.72');
  assert.equal(cek('35', 'KOTA MALANG').kode, '35.73');
});

test('nama yang jauh berbeda tidak dipaksakan', () => {
  assert.equal(cek('35', 'KAB. TIDAK ADA'), null);
  assert.equal(cek('35.25', 'Kebomasx Raya'), null);
});
