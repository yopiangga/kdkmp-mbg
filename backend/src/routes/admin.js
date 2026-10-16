import crypto from 'node:crypto';
import express, { Router } from 'express';
import { meta } from '../lib/meta.js';
import { parseCsv, toNum } from '../lib/csv.js';
import { cocokkanNama } from '../lib/wilayahNama.js';
import { validasiTotal } from '../services/validasi.js';

const STATUS_RILIS = ['draf', 'terverifikasi'];
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUrl = (v) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

/** Pengganti Laravel Sanctum selama fase JSON: token Bearer statis dari ADMIN_TOKEN. */
function requireAdmin(token) {
  return (req, res, next) => {
    if (!token) return res.status(503).json({ error: 'Admin dinonaktifkan: ADMIN_TOKEN belum diset', meta: meta({ label_asal: 'Rilis' }) });
    const got = String(req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(got);
    const b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Token admin tidak valid', meta: meta({ label_asal: 'Rilis' }) });
    }
    next();
  };
}

export function validasiRilis(body, repo) {
  const err = [];
  if (!body.indikator || typeof body.indikator !== 'string') err.push('indikator wajib');
  if (toNum(body.nilai) === null) err.push('nilai harus angka');
  if (!body.satuan) err.push('satuan wajib');
  if (!isDate(body.per_tanggal)) err.push('per_tanggal harus YYYY-MM-DD');
  if (!isUrl(body.sumber_url)) err.push('sumber_url wajib berupa URL http(s)');
  if (body.kode_wilayah && !repo.wilayah(body.kode_wilayah)) err.push(`kode_wilayah tidak dikenal: ${body.kode_wilayah}`);
  if (body.status && !STATUS_RILIS.includes(body.status)) err.push('status harus draf atau terverifikasi');
  return err;
}

export function adminRoutes({ repo, adminToken }) {
  const r = Router();
  r.use(requireAdmin(adminToken));
  const dibuatOleh = (req) => String(req.get('x-admin-nama') ?? 'admin').slice(0, 80);

  r.get('/rilis', (req, res) => {
    const data = repo.rilis({ status: req.query.status ? String(req.query.status) : undefined });
    res.json({ data, meta: meta({ sumber: ['bgn', 'kemenkeu', 'bapanas'], label_asal: 'Rilis' }) });
  });

  r.post('/rilis', express.json(), (req, res) => {
    const b = req.body ?? {};
    const err = validasiRilis(b, repo);
    if (err.length) return res.status(422).json({ error: err, meta: meta({ label_asal: 'Rilis' }) });
    const row = repo.insertRilis({
      indikator: b.indikator.trim(),
      nilai: toNum(b.nilai),
      satuan: String(b.satuan),
      kode_wilayah: b.kode_wilayah || 'ID',
      per_tanggal: b.per_tanggal,
      sumber_nama: b.sumber_nama ?? null,
      sumber_url: b.sumber_url,
      kutipan: b.kutipan ?? null,
      // Angka hasil ekstraksi otomatis selalu draf sampai dikonfirmasi admin (Bagian 10.7).
      status: b.otomatis ? 'draf' : (b.status ?? 'draf'),
      dibuat_oleh: dibuatOleh(req),
      asal_input: b.otomatis ? 'otomatis' : 'admin',
    });
    res.status(201).json({ data: row, meta: meta({ tanggal_data: row.per_tanggal, sumber: [{ nama: row.sumber_nama, url: row.sumber_url }], label_asal: 'Rilis' }) });
  });

  r.patch('/rilis/:id', express.json(), (req, res) => {
    const status = req.body?.status;
    if (!STATUS_RILIS.includes(status)) return res.status(422).json({ error: 'status harus draf atau terverifikasi', meta: meta({ label_asal: 'Rilis' }) });
    const row = repo.updateRilis(Number(req.params.id), { status, diverifikasi_oleh: dibuatOleh(req), diverifikasi_pada: new Date().toISOString() });
    if (!row) return res.status(404).json({ error: 'Rilis tidak ditemukan', meta: meta({ label_asal: 'Rilis' }) });
    res.json({ data: row, meta: meta({ tanggal_data: row.per_tanggal, label_asal: 'Rilis' }) });
  });

  /**
   * Impor CSV (jalur cadangan bila collector diblokir, dan data PPID).
   *   ?tabel=rilis_angka                       kolom: indikator,nilai,satuan,kode_wilayah,per_tanggal,sumber_url,kutipan
   *   ?tabel=kdkmp_snapshot_provinsi&tanggal_data=YYYY-MM-DD&sumber_url=...   kolom: format Lampiran A
   */
  r.post('/impor-csv', express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }), (req, res) => {
    const tabel = String(req.query.tabel ?? '');
    const rows = parseCsv(req.body ?? '');
    if (!rows.length) return res.status(422).json({ error: 'CSV kosong', meta: meta({ label_asal: 'Rilis' }) });

    if (tabel === 'rilis_angka') {
      const errors = rows.map((row, i) => ({ baris: i + 2, error: validasiRilis(row, repo) })).filter((e) => e.error.length);
      if (errors.length) return res.status(422).json({ error: errors, meta: meta({ label_asal: 'Rilis' }) });
      const inserted = rows.map((row) => repo.insertRilis({
        indikator: row.indikator, nilai: toNum(row.nilai), satuan: row.satuan, kode_wilayah: row.kode_wilayah || 'ID',
        per_tanggal: row.per_tanggal, sumber_nama: row.sumber_nama || null, sumber_url: row.sumber_url, kutipan: row.kutipan || null,
        status: 'draf', dibuat_oleh: dibuatOleh(req), asal_input: 'impor_csv',
      }));
      return res.status(201).json({ data: { jumlah: inserted.length, status: 'draf' }, meta: meta({ label_asal: 'Rilis' }) });
    }

    if (tabel === 'kdkmp_snapshot_provinsi') {
      const tanggal = String(req.query.tanggal_data ?? '');
      const sumber = String(req.query.sumber_url ?? 'https://simkopdes.go.id/pers/dashboard');
      if (!isDate(tanggal)) return res.status(422).json({ error: 'tanggal_data wajib (YYYY-MM-DD)', meta: meta({ label_asal: 'Resmi' }) });
      const prov = repo.wilayahByLevel('provinsi');
      const tidakCocok = [];
      const parsed = rows.map((row) => {
        const kode = cocokkanNama(row.provinsi, prov);
        if (!kode) tidakCocok.push(row.provinsi);
        return {
          kode, tanggal_data: tanggal,
          jumlah_koperasi: toNum(row.jumlah_koperasi), manajer_aktif: toNum(row.manajer_aktif),
          punya_nib: toNum(row.punya_nib), punya_npwp: toNum(row.punya_npwp), rat_selesai: toNum(row.rat_2025 ?? row.rat_selesai),
          simpanan_pokok: toNum(row.simpanan_pokok), simpanan_wajib: toNum(row.simpanan_wajib),
          volume_transaksi: toNum(row.volume_transaksi_2026 ?? row.volume_transaksi),
          nilai_transaksi: toNum(row.nilai_transaksi_2026 ?? row.nilai_transaksi),
          pemetaan_lahan: toNum(row.pemetaan_lahan), pemetaan_lahan_pct: toNum(row.pemetaan_lahan_pct),
          pembangunan_gerai_pct: toNum(row.pembangunan_gerai_pct),
          sumber_url: sumber, collector_run_id: null, nama_simkopdes: row.provinsi, asal_input: 'impor_csv',
        };
      });
      if (tidakCocok.length) return res.status(422).json({ error: `Provinsi tidak cocok: ${tidakCocok.join(', ')}`, meta: meta({ label_asal: 'Resmi' }) });
      const nasional = repo.store.all('kdkmp_snapshot').find((s) => s.kode === 'ID' && s.tanggal_data === tanggal) ?? null;
      const cek = validasiTotal(parsed, nasional);
      const status = cek.ok ? 'ok' : 'perlu_cek';
      repo.insertSnapshots(parsed.map((p) => ({ ...p, status })));
      return res.status(201).json({ data: { jumlah: parsed.length, status, masalah: cek.masalah }, meta: meta({ tanggal_data: tanggal, label_asal: 'Resmi' }) });
    }

    return res.status(400).json({ error: 'tabel harus rilis_angka atau kdkmp_snapshot_provinsi', meta: meta({ label_asal: 'Rilis' }) });
  });

  return r;
}
