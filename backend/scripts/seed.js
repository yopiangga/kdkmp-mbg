#!/usr/bin/env node
/**
 * Fase 1 — seed tabel JSON di DATA_DIR dari data/seed.
 * Baris seed ditandai `asal_input: 'seed'` dan di-upsert berdasarkan kunci primer;
 * baris dari admin atau collector tidak dihapus.
 *   node scripts/seed.js            → upsert
 *   node scripts/seed.js --fresh    → kosongkan semua tabel dulu
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { JsonStore, TABLES } from '../src/db/store.js';
import { parseCsv, toNum } from '../src/lib/csv.js';
import { cocokkanNama } from '../src/lib/wilayahNama.js';
import { validasiTotal } from '../src/services/validasi.js';

export function seed({ dataDir = config.dataDir, seedDir = config.seedDir, fresh = false, log = console.log } = {}) {
  const store = new JsonStore(dataDir);
  const read = (f) => fs.readFileSync(path.join(seedDir, f), 'utf8');
  const readJson = (f) => JSON.parse(read(f));
  const SEED = { asal_input: 'seed' };

  if (fresh) for (const t of Object.keys(TABLES)) store.write(t, []);
  for (const t of Object.keys(TABLES)) if (!fs.existsSync(store.file(t))) store.write(t, []);

  // ------------------------------------------------------------ wilayah
  const index = readJson('wilayah_index.json');
  const kecRef = readJson('wilayah_kecamatan.json');
  const geoDir = path.join(seedDir, 'geo');
  const kecCentroid = new Map();
  if (fs.existsSync(geoDir)) {
    for (const f of fs.readdirSync(geoDir).filter((x) => x.startsWith('kecamatan_'))) {
      for (const feat of JSON.parse(fs.readFileSync(path.join(geoDir, f), 'utf8')).features) {
        kecCentroid.set(feat.properties.kode, feat.properties.centroid);
      }
    }
  }
  const wilayah = [
    { kode: 'ID', level: 'nasional', nama: 'Indonesia', parent_kode: null, centroid: [118, -2.5], sumber_url: 'https://simkopdes.go.id/data/wilayah/index.json' },
    ...Object.entries(index.provinces).map(([kode, [nama, lat, lng]]) => ({
      kode, level: 'provinsi', nama, parent_kode: 'ID', centroid: [lng, lat], sumber_url: 'https://simkopdes.go.id/data/wilayah/index.json',
    })),
    ...Object.entries(index.regencies).map(([kode, [nama, lat, lng]]) => ({
      kode, level: 'kabupaten', nama, parent_kode: kode.slice(0, 2), centroid: [lng, lat], sumber_url: 'https://simkopdes.go.id/data/wilayah/index.json',
    })),
    ...kecRef.kecamatan
      .filter((k) => index.regencies[k.kode.slice(0, 5)])
      .map((k) => ({
        kode: k.kode, level: 'kecamatan', nama: k.nama, parent_kode: k.kode.slice(0, 5),
        centroid: kecCentroid.get(k.kode) ?? null, sumber_url: 'https://github.com/cahyadsn/wilayah',
      })),
  ];
  store.write('wilayah', wilayah);
  log(`wilayah: ${wilayah.length} baris (generated_at ${index.generated_at})`);

  // ------------------------------------------------------------ snapshot
  const provList = wilayah.filter((w) => w.level === 'provinsi');
  const tanggal = '2026-10-15';
  const nasional = readJson(`simkopdes_nasional_${tanggal}.json`);
  delete nasional._catatan;

  const provRows = parseCsv(read(`simkopdes_provinsi_${tanggal}.csv`)).map((r) => {
    const kode = cocokkanNama(r.provinsi, provList);
    if (!kode) throw new Error(`Provinsi tidak cocok dengan kode Kemendagri: ${r.provinsi}`);
    return {
      kode, tanggal_data: tanggal,
      jumlah_koperasi: toNum(r.jumlah_koperasi), punya_akun: null, manajer_aktif: toNum(r.manajer_aktif),
      punya_nib: toNum(r.punya_nib), punya_npwp: toNum(r.punya_npwp), rat_selesai: toNum(r.rat_2025),
      rat_draft: null, rat_belum: null, rat_diverifikasi: null,
      simpanan_pokok: toNum(r.simpanan_pokok), simpanan_wajib: toNum(r.simpanan_wajib),
      volume_transaksi: toNum(r.volume_transaksi_2026), nilai_transaksi: toNum(r.nilai_transaksi_2026),
      pemetaan_lahan: toNum(r.pemetaan_lahan), pemetaan_lahan_pct: toNum(r.pemetaan_lahan_pct),
      pembangunan_gerai_pct: toNum(r.pembangunan_gerai_pct),
      lahan_diajukan: null, lahan_terverifikasi: null, gerai_belum: null, gerai_proses: null, gerai_selesai: null,
      sumber_url: 'https://simkopdes.go.id/pers/dashboard', collector_run_id: null, status: 'ok',
      nama_simkopdes: r.provinsi, ...SEED,
    };
  });

  const cek = validasiTotal(provRows, nasional);
  const status = cek.ok ? 'ok' : 'perlu_cek';
  if (!cek.ok) log(`PERINGATAN validasi total: ${cek.masalah.join('; ')}`);
  provRows.forEach((r) => {
    r.status = status;
  });
  const nasRow = { ...nasional, collector_run_id: null, status, ...SEED };

  const kab = readJson(`simkopdes_kabupaten_${tanggal}.json`);
  const kabRows = kab.baris.map((b) => ({
    kode: b.kode, tanggal_data: kab.tanggal_data,
    jumlah_koperasi: b.jumlah_koperasi, nilai_transaksi: b.nilai_transaksi,
    pembangunan_gerai_pct: b.pembangunan_gerai_pct ?? null,
    sumber_url: b.sumber_url, collector_run_id: null, status: 'ok', ...SEED,
  }));

  const kecRows = [];
  for (const f of fs.readdirSync(seedDir).filter((x) => /^simkopdes_kecamatan_[\d.]+_\d{4}-\d{2}-\d{2}\.csv$/.test(x))) {
    const [, kodeKab, tgl] = f.match(/^simkopdes_kecamatan_([\d.]+)_(\d{4}-\d{2}-\d{2})\.csv$/);
    const kandidat = wilayah.filter((w) => w.parent_kode === kodeKab);
    const simkopdesId = readJson('simkopdes_wilayah_map.json').find((m) => m.kode === kodeKab)?.simkopdes_id;
    for (const r of parseCsv(read(f))) {
      const kode = cocokkanNama(r.kecamatan, kandidat);
      if (!kode) throw new Error(`Kecamatan tidak cocok: ${r.kecamatan} (${kodeKab})`);
      kecRows.push({
        kode, tanggal_data: tgl,
        jumlah_koperasi: toNum(r.jumlah_koperasi), punya_akun: null, manajer_aktif: null,
        punya_nib: toNum(r.punya_nib), punya_npwp: toNum(r.punya_npwp), rat_selesai: toNum(r.rat_2025),
        simpanan_pokok: toNum(r.simpanan_pokok), simpanan_wajib: toNum(r.simpanan_wajib),
        volume_transaksi: toNum(r.volume_transaksi_2026), nilai_transaksi: toNum(r.nilai_transaksi_2026),
        pembangunan_gerai_pct: null,
        sumber_url: `https://simkopdes.go.id/pers/dashboard/sub-district/${simkopdesId ?? ''}`,
        collector_run_id: null, status: 'ok', nama_simkopdes: r.kecamatan, ...SEED,
      });
    }
  }

  store.upsert('kdkmp_snapshot', [nasRow, ...provRows, ...kabRows, ...kecRows]);
  log(`kdkmp_snapshot: nasional 1, provinsi ${provRows.length} (status ${status}), kab ${kabRows.length}, kecamatan ${kecRows.length}`);

  // ------------------------------------------------------------ produk terlaris
  const produk = [];
  for (const f of fs.readdirSync(seedDir).filter((x) => /^simkopdes_produk_terlaris_/.test(x))) {
    const [, kode, tgl] = f.match(/^simkopdes_produk_terlaris_(.+)_(\d{4}-\d{2}-\d{2})\.csv$/);
    for (const r of parseCsv(read(f))) {
      produk.push({
        kode, tanggal_data: tgl, peringkat: toNum(r.peringkat), nama_produk: r.nama_produk,
        volume: toNum(r.volume), nilai: toNum(r.nilai), sumber_url: 'https://simkopdes.go.id/pers/dashboard', ...SEED,
      });
    }
  }
  store.upsert('kdkmp_produk_terlaris', produk);
  log(`kdkmp_produk_terlaris: ${produk.length}`);

  // ------------------------------------------------------------ referensi & rilis
  store.upsert('produk_kelompok', readJson('produk_kelompok.json').map((r) => ({ ...r, ...SEED })));
  store.upsert('simkopdes_wilayah_map', readJson('simkopdes_wilayah_map.json').map((r) => ({ ...r, ...SEED })));
  store.upsert('asumsi_simulasi', readJson('asumsi_simulasi.json').map((r) => ({ ...r, ...SEED })));
  store.upsert('cooptrade_ringkasan', readJson('cooptrade_ringkasan.json').map((r) => ({ ...r, ...SEED })));

  // rilis_angka memakai id serial; cocokkan baris seed lewat kunci alami.
  const natural = (r) => [r.indikator, r.kode_wilayah, r.per_tanggal, r.sumber_url].join('|');
  const existing = store.all('rilis_angka');
  const byNatural = new Map(existing.map((r) => [natural(r), r]));
  let nextId = store.nextId('rilis_angka');
  const rilis = readJson('rilis_angka.json').map((r) => ({
    id: byNatural.get(natural(r))?.id ?? nextId++,
    ...r,
    status: 'terverifikasi',
    dibuat_oleh: 'seed',
    dibuat_pada: byNatural.get(natural(r))?.dibuat_pada ?? new Date().toISOString(),
    ...SEED,
  }));
  store.upsert('rilis_angka', rilis);
  log(`rilis_angka: ${rilis.length} (terverifikasi)`);

  // Catat unduhan referensi yang dilakukan saat Fase 1 sebagai run collector.
  const runs = store.all('collector_runs');
  if (!runs.some((r) => r.target === 'wilayah' && r.asal_input === 'seed')) {
    store.write('collector_runs', [
      ...runs,
      {
        id: store.nextId('collector_runs'), target: 'wilayah', mulai: '2026-10-16T02:05:00Z', selesai: '2026-10-16T02:05:02Z',
        status: 'sukses', jumlah_halaman: 1, jumlah_baris: 552,
        pesan: `Unduh sekali saat Fase 1 (generated_at ${index.generated_at}); robots.txt dicek, hanya /_next/static/ dilarang.`,
        path_raw: 'data/seed/wilayah_index.json', ...SEED,
      },
    ]);
  }

  return { store, validasi: cek };
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  seed({ fresh: process.argv.includes('--fresh') });
}
