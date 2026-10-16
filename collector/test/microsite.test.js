import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ambilMicrosite, slugify } from '../src/targets/microsite.js';
import { JsonStore } from '../../backend/src/db/store.js';
import { importKoperasi } from '../../backend/src/importers/koperasi.js';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

// Seed mini: dua desa bernama sama di kecamatan berbeda + satu desa tanpa koperasi. Semua nama orang fiktif.
function seedDir() {
  const dir = tmp('kdkmp-seed-');
  fs.writeFileSync(path.join(dir, 'wilayah_desa_35.25.json'), JSON.stringify({ desa: [
    { kode: '35.25.01.2001', nama: 'Sawo' },
    { kode: '35.25.02.2001', nama: 'Banjarsari' },
    { kode: '35.25.03.2001', nama: 'Banjarsari' },
    { kode: '35.25.04.2001', nama: 'Tanpa Koperasi' },
  ] }));
  fs.writeFileSync(path.join(dir, 'wilayah_kecamatan.json'), JSON.stringify({ kecamatan: [
    { kode: '35.25.01', nama: 'Dukun' }, { kode: '35.25.02', nama: 'Balongpanggang' },
    { kode: '35.25.03', nama: 'Panceng' }, { kode: '35.25.04', nama: 'Benjeng' },
  ] }));
  return dir;
}

// Bentuk mengikuti respons nyata (16 Okt 2026): profil di level atas, tanpa bungkus `data`.
const profil = (nama, kec) => ({
    name: `KOPERASI DESA MERAH PUTIH ${nama.toUpperCase()}`,
    address: 'Jl. Contoh', postal_code: '61155', latitude: '-7.0', longitude: '112.5',
    province: { name: 'JAWA TIMUR' }, district: { name: 'KAB. GRESIK' }, subdistrict: { name: kec.toUpperCase() },
    village: { name: nama.toUpperCase(), total_population: 3000, total_male: 1490, total_female: 1510 },
    klu_types: [{ type: 'Gerai sembako' }], outlets: [{ name: 'Gerai' }],
    members: [{ name: 'Anggota Fiktif Satu', gender: 'LAKI-LAKI', nik: '3525000000000001' }, { name: 'Anggota Fiktif Dua', gender: 'PEREMPUAN' }],
    managements: [{ name: 'Ketua Fiktif', photo: 'https://contoh.invalid/f.jpg' }],
    distinct_managements: [{ name: 'Pengawas Fiktif' }],
    news: [{ created_at: '2026-10-01T00:00:00Z' }],
});

function fakeClient() {
  const calls = [];
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  return {
    calls,
    async request(url, init) {
      const slug = JSON.parse(decodeURIComponent(new URL(url).searchParams.get('path_params'))).name;
      calls.push({ endpoint: url.includes('Products') ? 'produk' : 'profil', slug, method: init?.method });
      if (url.includes('Products')) return json(200, [{ name: 'Beras 5 kg' }]);
      if (slug === 'sawo') return json(200, profil('Sawo', 'Dukun'));
      // "banjarsari" polos milik Panceng; Balongpanggang memakai akhiran kecamatan.
      if (slug === 'banjarsari') return json(200, profil('Banjarsari', 'Panceng'));
      if (slug === 'banjarsari-kecamatan-balongpanggang') return json(200, profil('Banjarsari', 'Balongpanggang'));
      return json(404, { message: 'Koperasi tidak ditemukan.', data: null });
    },
  };
}

function cariKunci(obj, keys, found = []) {
  if (Array.isArray(obj)) obj.forEach((v) => cariKunci(v, keys, found));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (keys.includes(k)) found.push(k);
      cariKunci(v, keys, found);
    }
  }
  return found;
}

const PII = ['members', 'managements', 'distinct_managements', 'nik', 'photo'];
const NAMA_FIKTIF = ['Anggota Fiktif', 'Ketua Fiktif', 'Pengawas Fiktif', '3525000000000001'];

test('slugify mengikuti aturan brief', () => {
  assert.equal(slugify('Petojo Selatan'), 'petojo-selatan');
  assert.equal(slugify("Sumber'rejo  Wetan"), 'sumberrejo-wetan');
});

test('microsite: tidak ada members/managements di output, file mentah, maupun DB', async () => {
  const client = fakeClient();
  const rawDir = tmp('kdkmp-raw-');
  const { rows } = await ambilMicrosite(client, { seedDir: seedDir(), rawDir });

  // output
  assert.deepEqual(cariKunci(rows, PII), []);
  // file mentah di data/raw
  for (const f of fs.readdirSync(rawDir)) {
    const text = fs.readFileSync(path.join(rawDir, f), 'utf8');
    assert.deepEqual(cariKunci(JSON.parse(text), PII), [], f);
    for (const n of NAMA_FIKTIF) assert.ok(!text.includes(n), `${f} memuat ${n}`);
  }
  // DB
  const store = new JsonStore(tmp('kdkmp-db-'));
  importKoperasi(store, rows);
  const dbText = JSON.stringify(store.all('kdkmp_koperasi'));
  assert.deepEqual(cariKunci(store.all('kdkmp_koperasi'), PII), []);
  for (const n of NAMA_FIKTIF) assert.ok(!dbText.includes(n), `DB memuat ${n}`);
});

test('microsite: agregat anggota disimpan, desa kembar dibedakan, 404 dicatat tanpa variasi agresif', async () => {
  const client = fakeClient();
  const { rows } = await ambilMicrosite(client, { seedDir: seedDir(), rawDir: tmp('kdkmp-raw-') });
  const byDesa = Object.fromEntries(rows.map((r) => [r.kode_desa, r]));

  assert.equal(byDesa['35.25.01.2001'].slug, 'sawo');
  assert.equal(byDesa['35.25.01.2001'].jumlah_anggota, 2);
  assert.equal(byDesa['35.25.01.2001'].anggota_laki, 1);
  assert.equal(byDesa['35.25.01.2001'].anggota_perempuan, 1);
  assert.equal(byDesa['35.25.01.2001'].penduduk_desa, 3000);
  assert.equal(byDesa['35.25.01.2001'].jumlah_produk, 1);
  assert.equal(byDesa['35.25.02.2001'].slug, 'banjarsari-kecamatan-balongpanggang');
  assert.equal(byDesa['35.25.03.2001'].slug, 'banjarsari');
  assert.equal(byDesa['35.25.04.2001'].status, 'slug_tidak_ditemukan');

  const percobaanTanpaKoperasi = client.calls.filter((c) => c.endpoint === 'profil' && c.slug.startsWith('tanpa-koperasi'));
  assert.equal(percobaanTanpaKoperasi.length, 2, 'maksimal nama desa + satu varian kecamatan');
  assert.ok(client.calls.every((c) => c.method === 'POST'));
});

test('importKoperasi menolak baris yang memuat field pribadi', () => {
  const store = new JsonStore(tmp('kdkmp-db-'));
  assert.throws(() => importKoperasi(store, [{ slug: 'x', kode_desa: '1', members: [] }]), /data pribadi/);
});

test('berhenti bila banyak desa pertama tidak ditemukan (pola slug kabupaten berbeda)', async () => {
  const dir = seedDir();
  const desa = Array.from({ length: 10 }, (_, i) => ({ kode: `35.25.04.${2001 + i}`, nama: `Tanpa ${i}` }));
  fs.writeFileSync(path.join(dir, 'wilayah_desa_35.25.json'), JSON.stringify({ desa }));
  const client = fakeClient();
  const r = await ambilMicrosite(client, { seedDir: dir, rawDir: tmp('kdkmp-raw-'), batasNol: 4 });
  assert.equal(r.polaTidakCocok, true);
  assert.equal(r.rows.length, 4);
  assert.equal(client.calls.length, 8);
});
