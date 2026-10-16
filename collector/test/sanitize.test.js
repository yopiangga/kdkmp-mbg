import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripPII, toKoperasiRow, memberStats, PII_KEYS } from '../src/lib/sanitize.js';

// Contoh sintetis berbentuk respons getCooperativeBySlug; semua nama di bawah fiktif.
const profile = {
  message: 'ok',
  data: {
    name: 'Koperasi Desa Merah Putih Contoh',
    address: 'Jl. Contoh 1',
    postal_code: '61152',
    latitude: '-7.1601',
    longitude: '112.6532',
    province: { name: 'JAWA TIMUR' },
    district: { name: 'KAB. GRESIK' },
    subdistrict: { name: 'KEBOMAS' },
    village: { name: 'CONTOH', population: 5123 },
    klu_types: [{ type: 'Gerai sembako' }, { type: 'Simpan pinjam' }],
    outlets: [{ name: 'Gerai 1' }, { name: 'Gerai 2' }],
    potentials: [{ name: 'Padi', managements: [{ name: 'Fiktif Bersarang' }] }],
    member_stats: { total: 3 },
    members: [
      { name: 'Anggota Fiktif A', gender: 'L', nik: '3500000000000001' },
      { name: 'Anggota Fiktif B', gender: 'P', nik: '3500000000000002' },
      { name: 'Anggota Fiktif C', jenis_kelamin: 'Perempuan' },
    ],
    managements: [{ name: 'Pengurus Fiktif', photo: 'https://example.invalid/a.jpg' }],
    distinct_managements: [{ name: 'Pengawas Fiktif' }],
    news: [{ title: 'x', created_at: '2026-09-01T10:00:00Z' }, { created_at: '2026-10-02T08:00:00Z' }],
  },
};

const products = { data: [{ name: 'Beras 5 kg' }, { name: 'Minyak goreng' }] };

function findKeysDeep(obj, keys, found = []) {
  if (Array.isArray(obj)) obj.forEach((v) => findKeysDeep(v, keys, found));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (keys.includes(k)) found.push(k);
      findKeysDeep(v, keys, found);
    }
  }
  return found;
}

test('stripPII menghapus members/managements/distinct_managements di semua kedalaman', () => {
  const clean = stripPII(profile);
  assert.deepEqual(findKeysDeep(clean, [...PII_KEYS, 'nik', 'photo']), []);
  assert.equal(clean.data.name, profile.data.name);
});

test('toKoperasiRow tidak memuat field atau nama pribadi', () => {
  const row = toKoperasiRow('contoh', profile, products);
  assert.deepEqual(findKeysDeep(row, [...PII_KEYS, 'nik', 'photo']), []);
  const text = JSON.stringify(row);
  for (const nama of ['Anggota Fiktif', 'Pengurus Fiktif', 'Pengawas Fiktif', 'Fiktif Bersarang', '3500000000000001']) {
    assert.ok(!text.includes(nama), `bocor: ${nama}`);
  }
});

test('toKoperasiRow menyimpan agregat anggota dan field yang diizinkan', () => {
  const row = toKoperasiRow('contoh', profile, products);
  assert.equal(row.jumlah_anggota, 3);
  assert.equal(row.anggota_laki, 1);
  assert.equal(row.anggota_perempuan, 2);
  assert.equal(row.jumlah_gerai, 2);
  assert.deepEqual(row.lokasi, [112.6532, -7.1601]);
  assert.deepEqual(row.jenis_usaha, ['Gerai sembako', 'Simpan pinjam']);
  assert.equal(row.jumlah_produk, 2);
  assert.equal(row.berita_terakhir, '2026-10-02');
  assert.equal(row.penduduk_desa, 5123);
});

test('memberStats aman untuk masukan kosong', () => {
  assert.deepEqual(memberStats(undefined), { jumlah_anggota: 0, anggota_laki: 0, anggota_perempuan: 0 });
});
