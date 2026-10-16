import { Router } from 'express';
import { meta } from '../lib/meta.js';
import { SUMBER } from '../lib/sumber.js';
import * as obs from '../services/observatorium.js';
import { geometriKecamatan, lokasiCocok } from '../services/geoUtil.js';

const asDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const asNum = (v) => (v === undefined || v === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);

export function publicRoutes({ repo, seedDir }) {
  const r = Router();
  const notFound = (res, pesan) => res.status(404).json({ error: pesan, meta: meta({ label_asal: 'Resmi' }) });

  r.get('/ringkasan', (req, res) => {
    const data = obs.ringkasan(repo, { tanggal: asDate(req.query.tanggal) });
    if (!data) return notFound(res, 'Belum ada snapshot nasional untuk tanggal itu');
    res.json({
      data,
      meta: meta({ tanggal_data: data.tanggal_data, sumber: ['simkopdes', 'kemenkeu', 'bgn'], label_asal: ['Resmi', 'Rilis', 'Indeks'] }),
    });
  });

  r.get('/tren', (req, res) => {
    const data = obs.tren(repo, {
      indikator: String(req.query.indikator ?? 'jumlah_koperasi'),
      kode: String(req.query.kode ?? 'ID'),
      dari: asDate(req.query.dari),
      sampai: asDate(req.query.sampai),
    });
    if (!data) return res.status(400).json({ error: 'indikator tidak dikenal', meta: meta({ label_asal: 'Resmi' }) });
    res.json({
      data,
      meta: meta({ tanggal_data: data.titik.at(-1)?.tanggal ?? null, sumber: data.label_asal === 'Rilis' ? ['kemenkeu', 'bgn'] : ['simkopdes'], label_asal: data.label_asal }),
    });
  });

  r.get('/wilayah/:kode/anak', (req, res) => {
    const data = obs.anak(repo, req.params.kode, { tanggal: asDate(req.query.tanggal), bobot: req.query.bobot });
    if (!data) return notFound(res, 'Wilayah tidak ditemukan');
    res.json({ data, meta: meta({ tanggal_data: data.tanggal_data, sumber: ['simkopdes', 'observatorium'], label_asal: ['Resmi', 'Indeks'] }) });
  });

  r.get('/wilayah/:kode', (req, res) => {
    const data = obs.detail(repo, req.params.kode, { tanggal: asDate(req.query.tanggal) });
    if (!data) return notFound(res, 'Wilayah tidak ditemukan');
    res.json({ data, meta: meta({ tanggal_data: data.snapshot?.tanggal_data ?? null, sumber: ['simkopdes', 'simkopdes_wilayah'], label_asal: 'Resmi' }) });
  });

  r.get('/geo/:level', (req, res) => {
    const { level } = req.params;
    if (!['provinsi', 'kabupaten', 'kecamatan'].includes(level)) return res.status(400).json({ error: 'level tidak valid', meta: meta({ label_asal: 'Resmi' }) });
    const data = obs.geo(repo, seedDir, level, { parent: req.query.parent, tanggal: asDate(req.query.tanggal), bobot: req.query.bobot });
    if (!data) return notFound(res, 'Wilayah induk tidak ditemukan atau level tidak sesuai');
    const { data: tabel, ...fc } = data;
    res.json({
      ...fc,
      meta: meta({ tanggal_data: tabel.tanggal_data, sumber: ['simkopdes', 'kemendagri', 'observatorium'], label_asal: ['Resmi', 'Indeks'] }),
    });
  });

  r.get('/matriks', (req, res) => {
    const data = obs.matriks(repo, {
      level: req.query.level === 'kabupaten' ? 'kabupaten' : 'provinsi',
      ambangGerai: asNum(req.query.ambang_gerai),
      ambangTrx: asNum(req.query.ambang_trx),
      tanggal: asDate(req.query.tanggal),
    });
    res.json({ data, meta: meta({ tanggal_data: data.tanggal_data, sumber: ['simkopdes', 'observatorium'], label_asal: ['Resmi', 'Indeks'] }) });
  });

  r.get('/usaha/komposisi', (req, res) => {
    const data = obs.komposisi(repo, String(req.query.kode ?? 'ID'), { tanggal: asDate(req.query.tanggal) });
    if (!data) return notFound(res, 'Wilayah tidak ditemukan');
    res.json({ data, meta: meta({ tanggal_data: data.tanggal_data, sumber: ['simkopdes'], label_asal: 'Resmi' }) });
  });

  r.get('/usaha/wilayah', (_req, res) => {
    const data = repo.kodeDenganProduk()
      .map((kode) => repo.wilayah(kode))
      .filter(Boolean)
      .map((w) => ({ kode: w.kode, nama: w.nama, level: w.level, provinsi: w.level === 'kabupaten' ? repo.wilayah(w.parent_kode)?.nama ?? null : null }))
      .sort((a, b) => a.kode.localeCompare(b.kode));
    res.json({ data, meta: meta({ tanggal_data: repo.tanggalTerakhir('ID'), sumber: ['simkopdes'], label_asal: 'Resmi' }) });
  });

  // Kab/kota yang sudah punya snapshot kecamatan (untuk pemilih di halaman celah MBG).
  r.get('/wilayah-berdata/kabupaten', (_req, res) => {
    const kec = new Set(repo.store.all('kdkmp_snapshot').filter((s) => s.status === 'ok' && s.kode.length === 8).map((s) => s.kode.slice(0, 5)));
    const data = [...kec].map((k) => repo.wilayah(k)).filter(Boolean)
      .map((w) => ({ kode: w.kode, nama: w.nama, provinsi_kode: w.parent_kode, provinsi: repo.wilayah(w.parent_kode)?.nama ?? null }))
      .sort((a, b) => a.kode.localeCompare(b.kode));
    res.json({ data, meta: meta({ tanggal_data: repo.tanggalTerakhir('ID'), sumber: ['simkopdes'], label_asal: 'Resmi' }) });
  });

  r.get('/celah-mbg', (req, res) => {
    const data = obs.celahMbg(repo, {
      kodeKab: req.query.kode_kab ? String(req.query.kode_kab) : undefined,
      hariLayanan: asNum(req.query.hari_layanan),
      tanggal: asDate(req.query.tanggal),
    });
    if (data.error) return res.status(400).json({ error: data.error, meta: meta({ label_asal: 'Estimasi' }) });
    res.json({ data, meta: meta({ tanggal_data: data.tanggal_data, sumber: ['simkopdes', 'kemenkeu', 'bgn'], label_asal: ['Resmi', 'Rilis', 'Estimasi'] }) });
  });

  r.get('/permintaan', (req, res) => {
    const data = obs.permintaan(repo, { tanggal: asDate(req.query.tanggal) });
    res.json({ data, meta: meta({ tanggal_data: repo.tanggalTerakhir('ID'), sumber: ['bgn', 'simkopdes', 'observatorium'], label_asal: ['Rilis', 'Indeks'] }) });
  });

  r.get('/harga', (req, res) => {
    const data = obs.hargaWilayah(repo, String(req.query.kode ?? 'ID'));
    if (!data) return notFound(res, 'Wilayah tidak ditemukan');
    res.json({ data, meta: meta({ tanggal_data: data.tanggal_data, sumber: ['pihps'], label_asal: 'Resmi', catatan: data.catatan ?? undefined }) });
  });

  r.get('/cooptrade', (req, res) => {
    const ringkasan = repo.cooptradeRingkasan();
    const tanggal = asDate(req.query.tanggal) ?? ringkasan.at(-1)?.tanggal_data ?? null;
    res.json({
      data: { ringkasan, produk: repo.cooptradeProduk(tanggal), tanggal },
      meta: meta({ tanggal_data: tanggal, sumber: ['cooptrade'], label_asal: 'Resmi' }),
    });
  });

  r.get('/simulasi/asumsi', (_req, res) => {
    const data = repo.asumsi().map(({ asal_input, ...a }) => ({ ...a, asumsi_penulis: !a.sumber_url }));
    res.json({ data, meta: meta({ tanggal_data: null, sumber: ['bgn', 'observatorium'], label_asal: 'Estimasi' }) });
  });

  r.get('/rilis', (req, res) => {
    const data = repo.rilis({
      indikator: req.query.indikator ? String(req.query.indikator) : undefined,
      kode_wilayah: req.query.kode ? String(req.query.kode) : undefined,
      status: 'terverifikasi',
    });
    res.json({ data, meta: meta({ tanggal_data: data.at(-1)?.per_tanggal ?? null, sumber: ['bgn', 'kemenkeu', 'bapanas'], label_asal: 'Rilis' }) });
  });

  r.get('/koperasi', (req, res) => {
    const data = repo.koperasi(
      req.query.kode_kecamatan ? String(req.query.kode_kecamatan) : undefined,
      req.query.kode_kab ? String(req.query.kode_kab) : undefined,
    ).map(({ asal_input, collector_run_id, ...k }) => {
      // Tandai koordinat yang jatuh di luar kecamatannya (kemungkinan salah input di sumber).
      const geom = k.kode_kecamatan ? geometriKecamatan(seedDir, k.kode_kecamatan.slice(0, 5)).get(k.kode_kecamatan) : null;
      return { ...k, lokasi_cocok: k.status === 'aktif' ? lokasiCocok(k.lokasi, geom) : null };
    });
    res.json({ data, meta: meta({ tanggal_data: data.map((d) => d.diambil_pada).sort().at(-1)?.slice(0, 10) ?? null, sumber: ['simkopdes'], label_asal: 'Resmi', catatan: 'Tanpa data pribadi anggota atau pengurus.' }) });
  });

  r.get('/collector/status', (_req, res) => {
    const data = obs.collectorStatus(repo);
    res.json({ data, meta: meta({ tanggal_data: data.terakhir[0]?.mulai?.slice(0, 10) ?? null, sumber: ['observatorium'], label_asal: 'Resmi' }) });
  });

  // Kabupaten pilot microsite: ringkasan profil koperasi yang sudah terkumpul (tanpa data pribadi).
  r.get('/pilot', (_req, res) => {
    const PRIORITAS = ['33.05'];
    const perKab = new Map();
    for (const k of repo.store.all('kdkmp_koperasi')) {
      const kab = String(k.kode_kecamatan ?? '').slice(0, 5);
      if (!kab) continue;
      const x = perKab.get(kab) ?? { dicoba: 0, aktif: 0, anggota: 0, terakhir: '' };
      x.dicoba += 1;
      if (k.status === 'aktif') {
        x.aktif += 1;
        x.anggota += k.jumlah_anggota ?? 0;
      }
      if (k.diambil_pada > x.terakhir) x.terakhir = k.diambil_pada;
      perKab.set(kab, x);
    }
    const t = repo.tanggalTerakhir('ID');
    const data = [...perKab.entries()].map(([kode, x]) => {
      const w = repo.wilayah(kode);
      const s = repo.snapshotTerbaru(kode, t);
      return {
        kode, nama: w?.nama ?? kode, provinsi: repo.wilayah(w?.parent_kode)?.nama ?? null,
        prioritas: PRIORITAS.includes(kode),
        koperasi_dasbor: s?.jumlah_koperasi ?? null,
        trx_per_kop: s?.jumlah_koperasi ? (s.nilai_transaksi ?? 0) / s.jumlah_koperasi : null,
        profil: x.aktif, desa_dicoba: x.dicoba, anggota: x.anggota,
        diambil_pada: x.terakhir.slice(0, 10) || null,
        path: `/wilayah/${kode.slice(0, 2)}/${kode}`,
      };
    }).sort((a, b) => Number(b.prioritas) - Number(a.prioritas) || b.profil - a.profil);
    res.json({ data, meta: meta({ tanggal_data: data.map((d) => d.diambil_pada).sort().at(-1) ?? null, sumber: ['simkopdes'], label_asal: 'Resmi', catatan: 'Profil microsite Simkopdes; hanya agregat anggota.' }) });
  });

  // Pencarian wilayah untuk kolom cari di navigasi: provinsi, kab/kota, kecamatan.
  r.get('/cari', (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) return res.json({ data: [], meta: meta({ sumber: ['kemendagri'], label_asal: 'Resmi' }) });
    const urut = { provinsi: 0, kabupaten: 1, kecamatan: 2 };
    const data = repo.store.all('wilayah')
      .filter((w) => w.level in urut && w.nama.toLowerCase().includes(q))
      .map((w) => ({ w, skor: (w.nama.toLowerCase().startsWith(q) || w.nama.toLowerCase().includes(` ${q}`) ? 0 : 1) * 10 + urut[w.level] }))
      .sort((a, b) => a.skor - b.skor || a.w.nama.localeCompare(b.w.nama))
      .slice(0, 8)
      .map(({ w }) => {
        const jalur = repo.leluhur(w.kode).filter((x) => x.level !== 'nasional');
        // Halaman wilayah menampilkan anak dari kode terakhir; kecamatan dibuka lewat kabupatennya.
        const sampai = w.level === 'kecamatan' ? jalur.slice(0, -1) : jalur;
        return {
          kode: w.kode, nama: w.nama, level: w.level,
          konteks: jalur.slice(0, -1).map((x) => x.nama).join(' › ') || 'Indonesia',
          path: `/wilayah/${sampai.map((x) => x.kode).join('/')}`,
        };
      });
    res.json({ data, meta: meta({ sumber: ['kemendagri'], label_asal: 'Resmi' }) });
  });

  r.get('/sumber', (_req, res) => {
    res.json({ data: SUMBER, meta: meta({ sumber: ['observatorium'], label_asal: 'Resmi' }) });
  });

  return r;
}
