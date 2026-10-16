import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

let ctx;
before(async () => {
  ctx = await startApp();
});
after(() => ctx.close());

const get = async (p) => {
  const res = await fetch(ctx.base + p);
  return { status: res.status, body: await res.json(), headers: res.headers };
};
const auth = (extra = {}) => ({ Authorization: `Bearer ${ctx.adminToken}`, ...extra });

function assertMeta(body, p) {
  assert.ok(body.meta, `${p}: meta hilang`);
  for (const k of ['tanggal_data', 'sumber', 'label_asal']) assert.ok(k in body.meta, `${p}: meta.${k} hilang`);
}

const ENDPOINTS = [
  '/api/ringkasan',
  '/api/ringkasan?tanggal=2026-10-15',
  '/api/tren?indikator=jumlah_koperasi&kode=ID',
  '/api/tren?indikator=sppg_beroperasi',
  '/api/wilayah/ID/anak',
  '/api/wilayah/35/anak?bobot=gerai:2',
  '/api/wilayah/35.25/anak',
  '/api/wilayah/35',
  '/api/wilayah/35.25',
  '/api/geo/provinsi',
  '/api/geo/kabupaten?parent=35',
  '/api/geo/kecamatan?parent=35.25',
  '/api/matriks?level=provinsi&ambang_gerai=80&ambang_trx=1000000',
  '/api/matriks?level=kabupaten',
  '/api/usaha/komposisi?kode=ID',
  '/api/celah-mbg?kode_kab=35.25',
  '/api/celah-mbg',
  '/api/permintaan',
  '/api/cooptrade',
  '/api/simulasi/asumsi',
  '/api/rilis',
  '/api/koperasi?kode_kecamatan=35.25.14',
  '/api/collector/status',
  '/api/sumber',
];

test('setiap endpoint publik merespons 200 dengan meta', async () => {
  for (const p of ENDPOINTS) {
    const { status, body } = await get(p);
    assert.equal(status, 200, `${p} → ${status} ${JSON.stringify(body).slice(0, 200)}`);
    assertMeta(body, p);
  }
});

test('respons galat juga memiliki meta', async () => {
  for (const p of ['/api/wilayah/99/anak', '/api/tren?indikator=xyz', '/api/geo/desa', '/api/tidak-ada', '/api/celah-mbg?kode_kab=35']) {
    const { status, body } = await get(p);
    assert.ok(status >= 400, p);
    assertMeta(body, p);
  }
});

test('cache HTTP 1 jam untuk GET publik', async () => {
  const { headers } = await get('/api/ringkasan');
  assert.equal(headers.get('cache-control'), 'public, max-age=3600');
});

test('matriks via API: 12/5/8/13 dan peringkat via API', async () => {
  const m = (await get('/api/matriks')).body.data;
  assert.deepEqual(m.jumlah, { siap: 12, gedung_siap_usaha_belum: 5, usaha_jalan_gedung_belum: 8, tertinggal: 13 });
  const rows = (await get('/api/wilayah/ID/anak')).body.data.rows;
  assert.equal(rows.find((r) => r.peringkat === 1).nama, 'Jawa Timur');
  assert.equal(rows.find((r) => r.peringkat === 38).nama, 'Papua Pegunungan');
});

test('geo provinsi berisi 38 poligon dengan indeks', async () => {
  const fc = (await get('/api/geo/provinsi')).body;
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 38);
  assert.ok(fc.features.every((f) => f.geometry.type === 'MultiPolygon' && f.properties.indeks !== null));
  const kab = (await get('/api/geo/kabupaten?parent=35')).body;
  assert.equal(kab.features.length, 38);
});

test('tren menandai belum cukup titik (< 3)', async () => {
  const t = (await get('/api/tren?indikator=gerai_selesai')).body.data;
  assert.equal(t.titik.length, 1);
  assert.equal(t.cukup, false);
  assert.equal(t.mulai, '2026-10-15');
});

test('admin: tanpa token ditolak', async () => {
  const res = await fetch(`${ctx.base}/api/admin/rilis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 401);
  assertMeta(await res.json(), 'admin 401');
});

test('admin: rilis baru default draf, tidak tampil publik sampai diverifikasi', async () => {
  const body = { indikator: 'sppg_beroperasi', nilai: 99, satuan: 'unit', kode_wilayah: '35', per_tanggal: '2026-10-01', sumber_url: 'https://contoh.invalid/rilis' };
  const res = await fetch(`${ctx.base}/api/admin/rilis`, { method: 'POST', headers: auth({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  assert.equal(res.status, 201);
  const row = (await res.json()).data;
  assert.equal(row.status, 'draf');
  assert.equal((await get('/api/rilis?indikator=sppg_beroperasi&kode=35')).body.data.length, 0);

  const patch = await fetch(`${ctx.base}/api/admin/rilis/${row.id}`, { method: 'PATCH', headers: auth({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status: 'terverifikasi' }) });
  assert.equal(patch.status, 200);
  assert.equal((await get('/api/rilis?indikator=sppg_beroperasi&kode=35')).body.data.length, 1);
});

test('admin: ekstraksi otomatis selalu draf walau meminta terverifikasi', async () => {
  const body = { indikator: 'penerima_mbg', nilai: 1, satuan: 'orang', per_tanggal: '2026-10-01', sumber_url: 'https://contoh.invalid/x', status: 'terverifikasi', otomatis: true };
  const res = await fetch(`${ctx.base}/api/admin/rilis`, { method: 'POST', headers: auth({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  assert.equal((await res.json()).data.status, 'draf');
});

test('admin: validasi field rilis', async () => {
  const res = await fetch(`${ctx.base}/api/admin/rilis`, { method: 'POST', headers: auth({ 'Content-Type': 'application/json' }), body: JSON.stringify({ indikator: 'x', nilai: 'abc' }) });
  assert.equal(res.status, 422);
  const { error } = await res.json();
  assert.ok(error.some((e) => /sumber_url/.test(e)));
});

test('admin: impor CSV snapshot provinsi yang tidak cocok total ditandai perlu_cek', async () => {
  const csv = 'provinsi,jumlah_koperasi,nilai_transaksi_2026,pembangunan_gerai_pct\nACEH,1,100,50\n';
  const res = await fetch(`${ctx.base}/api/admin/impor-csv?tabel=kdkmp_snapshot_provinsi&tanggal_data=2026-10-20`, { method: 'POST', headers: auth({ 'Content-Type': 'text/csv' }), body: csv });
  assert.equal(res.status, 201);
  const data = (await res.json()).data;
  assert.equal(data.status, 'perlu_cek');
  // Snapshot perlu_cek tidak dipublikasikan
  const aceh = (await get('/api/wilayah/11?tanggal=2026-10-20')).body.data.snapshot;
  assert.equal(aceh.tanggal_data, '2026-10-15');
});
