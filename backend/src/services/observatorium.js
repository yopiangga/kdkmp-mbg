import fs from 'node:fs';
import path from 'node:path';
import { hitungIndeks, parseBobot, komponenDasar, LABEL_KOMPONEN, KOMPONEN } from './indeks.js';
import { hitungMatriks, kuadranOf, KUADRAN, AMBANG_BAWAAN } from './kuadran.js';
import { hitungKomposisi, KELOMPOK } from './komposisi.js';
import { kebutuhanHarian, setaraHari, rasioCelah } from './celah.js';
import * as fmt from '../lib/format.js';

const SNAPSHOT_FIELDS = [
  'tanggal_data', 'jumlah_koperasi', 'punya_akun', 'manajer_aktif', 'punya_nib', 'punya_npwp',
  'rat_selesai', 'rat_draft', 'rat_belum', 'rat_diverifikasi', 'simpanan_pokok', 'simpanan_wajib',
  'volume_transaksi', 'nilai_transaksi', 'pemetaan_lahan', 'pemetaan_lahan_pct', 'pembangunan_gerai_pct',
  'lahan_diajukan', 'lahan_terverifikasi', 'gerai_belum', 'gerai_proses', 'gerai_selesai', 'sumber_url',
];
const pick = (s) => Object.fromEntries(SNAPSHOT_FIELDS.map((f) => [f, s[f] ?? null]));
const tahunDari = (iso) => iso?.slice(0, 4);
const nilaiAsumsi = (repo, kunci, fallback = null) => repo.asumsi().find((a) => a.kunci === kunci)?.nilai ?? fallback;

/** Batas cakupan data sebelum fitur level kab/kota atau data SPPG per provinsi diaktifkan. */
export const AMBANG_CAKUPAN = 0.8;

// ---------------------------------------------------------------- wilayah anak + indeks
export function anak(repo, kode, { tanggal, bobot } = {}) {
  const induk = kode === 'ID' ? repo.wilayah('ID') : repo.wilayah(kode);
  if (!induk) return null;
  const t = tanggal ?? repo.tanggalTerakhir('ID');
  const children = repo.anakWilayah(kode);

  const rows = children.map((w) => {
    const s = repo.snapshotTerbaru(w.kode, t);
    return s
      ? { kode: w.kode, nama: w.nama, level: w.level, status_data: 'ada', ...pick(s) }
      : { kode: w.kode, nama: w.nama, level: w.level, status_data: 'belum_dikumpulkan' };
  });
  const ada = rows.filter((r) => r.status_data === 'ada');
  const { rows: indexed, bobot: b } = hitungIndeks(ada, parseBobot(bobot));
  const byKode = new Map(indexed.map((r) => [r.kode, r]));

  const merged = rows.map((r) => {
    const x = byKode.get(r.kode);
    if (!x) return { ...r, komponen: null, trx_per_kop: null, indeks: null, jumlah_komponen: 0, peringkat: null, kuadran: null };
    return { ...x, kuadran: kuadranOf(x.komponen.gerai, x.trx_per_kop) };
  });

  const tanggalAnak = ada.map((r) => r.tanggal_data).sort().at(-1) ?? null;
  const levelAnak = children[0]?.level ?? null;
  return {
    induk: { kode: induk.kode, nama: induk.nama, level: induk.level },
    leluhur: repo.leluhur(kode),
    level_anak: levelAnak,
    tanggal_data: tanggalAnak,
    cakupan: { ada: ada.length, total: rows.length },
    bobot: b,
    komponen_indeks: Object.fromEntries(KOMPONEN.map((k) => [k, LABEL_KOMPONEN[k]])),
    indeks_3_komponen: levelAnak === 'kecamatan',
    komponen_tersedia: KOMPONEN.filter((k) => indexed.some((r) => r.komponen[k] !== null && r.komponen[k] !== undefined)),
    rows: merged,
  };
}

// ---------------------------------------------------------------- detail
export function detail(repo, kode, { tanggal } = {}) {
  const w = repo.wilayah(kode);
  if (!w) return null;
  const t = tanggal ?? repo.tanggalTerakhir('ID');
  const s = repo.snapshotTerbaru(kode, t);
  const k = s ? komponenDasar(s) : null;
  return {
    wilayah: { kode: w.kode, nama: w.nama, level: w.level, parent_kode: w.parent_kode, centroid: w.centroid ?? null },
    leluhur: repo.leluhur(kode),
    snapshot: s ? pick(s) : null,
    turunan: k
      ? { ...k, kuadran: kuadranOf(k.gerai, k.trx_per_kop) }
      : null,
    produk_terlaris: repo.produkTerlaris(kode, t),
    jumlah_anak: repo.anakWilayah(kode).length,
  };
}

// ---------------------------------------------------------------- ringkasan nasional
function kpi(kunci, label, nilai, satuan, { label_asal = 'Resmi', tanggal, sumber_url, sebelumnya, keterangan } = {}) {
  const delta = sebelumnya && nilai !== null && sebelumnya.nilai !== null && sebelumnya.nilai !== undefined
    ? { nilai: nilai - sebelumnya.nilai, terhadap_tanggal: sebelumnya.tanggal }
    : null;
  return { kunci, label, nilai, satuan, label_asal, tanggal, sumber_url, delta, keterangan: keterangan ?? null };
}

export function ringkasan(repo, { tanggal } = {}) {
  const t = tanggal ?? repo.tanggalTerakhir('ID');
  const nas = t ? repo.snapshot('ID', t) : null;
  if (!nas) return null;
  const prev = repo.snapshotSebelum('ID', t, 7);
  const sebelum = (f) => (prev && prev[f] !== null ? { nilai: prev[f], tanggal: prev.tanggal_data } : null);
  const trxPerKop = nas.nilai_transaksi / nas.jumlah_koperasi;
  const tahun = tahunDari(t);

  const sppg = repo.rilisTerakhir('sppg_beroperasi');
  const sppgPrev = sppg ? repo.rilis({ indikator: 'sppg_beroperasi', kode_wilayah: 'ID', status: 'terverifikasi' }).filter((r) => r.per_tanggal < sppg.per_tanggal).at(-1) : null;
  const pemasokKdkmp = repo.rilisTerakhir('pemasok_mbg_kdkmp');

  const kpis = [
    kpi('jumlah_koperasi', 'Koperasi berbadan hukum', nas.jumlah_koperasi, 'koperasi', { tanggal: t, sumber_url: nas.sumber_url, sebelumnya: sebelum('jumlah_koperasi') }),
    kpi('gerai_selesai', 'Gerai selesai 100%', nas.gerai_selesai, 'gerai', {
      tanggal: t, sumber_url: nas.sumber_url, sebelumnya: sebelum('gerai_selesai'),
      keterangan: nas.gerai_proses !== null ? `${fmt.angka(nas.gerai_proses)} sedang dibangun, ${fmt.angka(nas.gerai_belum)} belum mulai` : null,
    }),
    kpi('manajer_aktif', 'Manajer aktif', nas.manajer_aktif, 'orang', {
      tanggal: t, sumber_url: nas.sumber_url, sebelumnya: sebelum('manajer_aktif'),
      keterangan: `${fmt.persen((nas.manajer_aktif / nas.jumlah_koperasi) * 100)} dari koperasi`,
    }),
    kpi('rat_selesai', 'Sudah RAT', nas.rat_selesai, 'koperasi', {
      tanggal: t, sumber_url: nas.sumber_url, sebelumnya: sebelum('rat_selesai'),
      keterangan: `${fmt.persen((nas.rat_selesai / nas.jumlah_koperasi) * 100)} dari koperasi`,
    }),
    kpi('nilai_transaksi', `Nilai transaksi ${tahun}`, nas.nilai_transaksi, 'Rp', {
      tanggal: t, sumber_url: nas.sumber_url, sebelumnya: sebelum('nilai_transaksi'),
      keterangan: `rata-rata ${fmt.rupiahSingkat(trxPerKop)} per koperasi`,
    }),
    sppg
      ? kpi('sppg_beroperasi', 'SPPG beroperasi', sppg.nilai, 'unit', {
        label_asal: 'Rilis', tanggal: sppg.per_tanggal, sumber_url: sppg.sumber_url,
        sebelumnya: sppgPrev ? { nilai: sppgPrev.nilai, tanggal: sppgPrev.per_tanggal } : null,
        keterangan: sppg.sumber_nama ?? null,
      })
      : kpi('sppg_beroperasi', 'SPPG beroperasi', null, 'unit', { label_asal: 'Rilis', tanggal: null, sumber_url: null }),
  ];

  const funnel = [
    { tahap: 'Berbadan hukum', nilai: nas.jumlah_koperasi, label_asal: 'Resmi', tanggal: t, sumber_url: nas.sumber_url, tersedia: true },
    { tahap: 'Lahan terverifikasi', nilai: nas.lahan_terverifikasi, label_asal: 'Resmi', tanggal: t, sumber_url: nas.sumber_url, tersedia: nas.lahan_terverifikasi !== null },
    { tahap: 'Gerai selesai', nilai: nas.gerai_selesai, label_asal: 'Resmi', tanggal: t, sumber_url: nas.sumber_url, tersedia: nas.gerai_selesai !== null },
    { tahap: 'Manajer aktif', nilai: nas.manajer_aktif, label_asal: 'Resmi', tanggal: t, sumber_url: nas.sumber_url, tersedia: true },
    { tahap: 'Bertransaksi rutin', nilai: null, label_asal: 'Resmi', tanggal: null, sumber_url: null, tersedia: false, catatan: 'Belum ada data jumlah koperasi yang bertransaksi rutin.' },
    {
      tahap: 'Pemasok MBG', nilai: pemasokKdkmp?.nilai ?? null, label_asal: 'Rilis', tanggal: pemasokKdkmp?.per_tanggal ?? null,
      sumber_url: pemasokKdkmp?.sumber_url ?? null, tersedia: Boolean(pemasokKdkmp),
      catatan: pemasokKdkmp ? `Per ${fmt.tanggal(pemasokKdkmp.per_tanggal)}; tanggalnya berbeda dari tahap lain.` : null,
    },
  ];

  // --- temuan otomatis
  const prov = anak(repo, 'ID', { tanggal: t }).rows.filter((r) => r.status_data === 'ada');
  const temuan = [];

  const komp = hitungKomposisi(repo.produkTerlaris('ID', t), repo.polaKelompok(), nas.nilai_transaksi);
  const program = komp.kelompok.find((k) => k.kelompok === 'program');
  if (komp.produk.length) {
    temuan.push({
      kunci: 'porsi_program',
      judul: `Setidaknya ${fmt.persen(program.porsi_total_pct)} nilai transaksi berasal dari produk program pemerintah`,
      isi: `Dari 10 produk terlaris, SPHP, pupuk bersubsidi, dan LPG 3 kg bernilai ${fmt.rupiahSingkat(program.nilai)} dari total ${fmt.rupiahSingkat(nas.nilai_transaksi)}. Pangan segar dan protein hanya ${fmt.persen(komp.kelompok.find((k) => k.kelompok === 'segar_protein').porsi_total_pct, 2)}.`,
      nilai: program.porsi_total_pct,
      label_asal: 'Resmi',
      tanggal: t,
      tautan: '/gap/usaha-mbg',
    });
  }

  const top3 = [...prov].sort((a, b) => b.nilai_transaksi - a.nilai_transaksi).slice(0, 3);
  const top3Sum = top3.reduce((s, r) => s + r.nilai_transaksi, 0);
  temuan.push({
    kunci: 'konsentrasi_top3',
    judul: `${fmt.persen((top3Sum / nas.nilai_transaksi) * 100)} transaksi terkumpul di 3 provinsi`,
    isi: `${top3.map((r) => r.nama).join(', ')} mencakup ${fmt.persen((top3.reduce((s, r) => s + r.jumlah_koperasi, 0) / nas.jumlah_koperasi) * 100)} koperasi tetapi ${fmt.persen((top3Sum / nas.nilai_transaksi) * 100)} nilai transaksi.`,
    nilai: (top3Sum / nas.nilai_transaksi) * 100,
    label_asal: 'Resmi',
    tanggal: t,
    tautan: '/wilayah',
  });

  const mat = hitungMatriks(prov);
  const gsub = mat.titik.filter((x) => x.kuadran === 'gedung_siap_usaha_belum');
  temuan.push({
    kunci: 'gedung_siap_usaha_belum',
    judul: `${gsub.length} provinsi: gedung siap, usaha belum`,
    isi: `${gsub.map((x) => x.nama).join(', ')} — gerai ≥ ${AMBANG_BAWAAN.gerai}% tetapi transaksi per koperasi < ${fmt.rupiahSingkat(AMBANG_BAWAAN.trx)}.`,
    nilai: gsub.length,
    label_asal: 'Indeks',
    tanggal: t,
    tautan: '/gap/fisik-usaha',
  });

  return {
    tanggal_data: t,
    judul: `${fmt.angka(nas.gerai_selesai)} gerai sudah berdiri, tetapi rata-rata koperasi baru bertransaksi ${fmt.rupiahSingkat(trxPerKop)} sepanjang ${tahun}.`,
    kpi: kpis,
    funnel,
    temuan,
    sumber_url: nas.sumber_url,
  };
}

// ---------------------------------------------------------------- tren
const TREN_RILIS = ['sppg_beroperasi', 'penerima_mbg', 'serapan_apbn_mbg', 'pemasok_mbg_kdkmp'];
export const MIN_TITIK_TREN = 3;

export function tren(repo, { indikator, kode = 'ID', dari, sampai }) {
  let titik;
  let label_asal = 'Resmi';
  if (TREN_RILIS.includes(indikator)) {
    label_asal = 'Rilis';
    titik = repo
      .rilis({ indikator, kode_wilayah: kode, status: 'terverifikasi' })
      .filter((r) => (!dari || r.per_tanggal >= dari) && (!sampai || r.per_tanggal <= sampai))
      .map((r) => ({ tanggal: r.per_tanggal, nilai: r.nilai, sumber_url: r.sumber_url }));
  } else if (SNAPSHOT_FIELDS.includes(indikator) && indikator !== 'sumber_url' && indikator !== 'tanggal_data') {
    titik = repo.seriSnapshot(kode, indikator, dari, sampai);
  } else {
    return null;
  }
  return {
    indikator, kode, label_asal, titik,
    cukup: titik.length >= MIN_TITIK_TREN,
    mulai: titik[0]?.tanggal ?? null,
  };
}

// ---------------------------------------------------------------- geo
const geoCache = new Map();
function readGeo(seedDir, file) {
  const p = path.join(seedDir, 'geo', file);
  if (geoCache.has(p)) return geoCache.get(p);
  const v = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  geoCache.set(p, v);
  return v;
}

export function geo(repo, seedDir, level, { parent, tanggal, bobot } = {}) {
  const parentKode = level === 'provinsi' ? 'ID' : parent;
  if (!parentKode) return null;
  const data = anak(repo, parentKode, { tanggal, bobot });
  if (!data || data.level_anak !== level) return null;

  const file = level === 'provinsi' ? 'provinsi.geojson' : `${level}_${parentKode}.geojson`;
  const fc = readGeo(seedDir, file);
  const shapes = new Map((fc?.features ?? []).map((f) => [f.properties.kode, f.geometry]));

  const features = data.rows.map((r) => {
    const w = repo.wilayah(r.kode);
    const geometry = shapes.get(r.kode) ?? (w?.centroid ? { type: 'Point', coordinates: w.centroid } : null);
    return {
      type: 'Feature',
      properties: {
        kode: r.kode,
        nama: r.nama,
        status_data: r.status_data,
        indeks: r.indeks,
        gerai_pct: r.komponen?.gerai ?? null,
        manajer_pct: r.komponen?.manajer ?? null,
        nib_pct: r.komponen?.nib ?? null,
        rat_pct: r.komponen?.rat ?? null,
        trx_per_kop: r.trx_per_kop,
        jumlah_koperasi: r.jumlah_koperasi ?? null,
        peringkat: r.peringkat,
      },
      geometry,
    };
  });

  return {
    type: 'FeatureCollection',
    features: features.filter((f) => f.geometry),
    poligon: Boolean(fc),
    atribusi: fc?.atribusi ?? null,
    data,
  };
}

// ---------------------------------------------------------------- matriks
export function matriks(repo, { level = 'provinsi', ambangGerai, ambangTrx, tanggal } = {}) {
  const opts = { ambangGerai: ambangGerai ?? AMBANG_BAWAAN.gerai, ambangTrx: ambangTrx ?? AMBANG_BAWAAN.trx };
  const t = tanggal ?? repo.tanggalTerakhir('ID');
  if (level === 'kabupaten') {
    const semua = repo.wilayahByLevel('kabupaten');
    const rows = semua
      .map((w) => {
        const s = repo.snapshotTerbaru(w.kode, t);
        return s && s.pembangunan_gerai_pct !== null ? { kode: w.kode, nama: w.nama, ...pick(s) } : null;
      })
      .filter(Boolean);
    const cakupan = { ada: rows.length, total: semua.length };
    const aktif = rows.length / semua.length >= AMBANG_CAKUPAN;
    return {
      level, aktif, cakupan, tanggal_data: t,
      alasan: aktif
        ? null
        : rows.length === 0
          ? 'Dasbor Simkopdes tidak menampilkan persentase pembangunan gerai per kab/kota, sehingga matriks hanya tersedia di level provinsi.'
          : `Data gerai kab/kota baru mencakup ${rows.length} dari ${semua.length} wilayah; level ini aktif setelah ≥ ${AMBANG_CAKUPAN * 100}%.`,
      kuadran: KUADRAN,
      ...(aktif ? hitungMatriks(rows, opts) : { titik: [], jumlah: null, prioritas: [], ambang: { gerai: opts.ambangGerai, trx: opts.ambangTrx } }),
    };
  }
  const prov = anak(repo, 'ID', { tanggal: t }).rows.filter((r) => r.status_data === 'ada');
  return {
    level: 'provinsi', aktif: true, cakupan: { ada: prov.length, total: 38 }, tanggal_data: t,
    kuadran: KUADRAN, ...hitungMatriks(prov, opts),
  };
}

// ---------------------------------------------------------------- komposisi usaha
export function komposisi(repo, kode = 'ID', { tanggal } = {}) {
  const w = repo.wilayah(kode);
  if (!w) return null;
  const t = tanggal ?? repo.tanggalTerakhir('ID');
  const s = repo.snapshotTerbaru(kode, t);
  const produk = repo.produkTerlaris(kode, t);
  const pola = repo.polaKelompok();
  const hasil = hitungKomposisi(produk, pola, s?.nilai_transaksi ?? null);

  const trenSegar = repo.tanggalProdukTerlaris(kode).map((d) => {
    const snap = repo.snapshotTerbaru(kode, d);
    const k = hitungKomposisi(repo.produkTerlaris(kode, d), pola, snap?.nilai_transaksi ?? null);
    return { tanggal: d, porsi_top_pct: k.kelompok.find((x) => x.kelompok === 'segar_protein').porsi_top_pct };
  });

  return {
    wilayah: { kode: w.kode, nama: w.nama, level: w.level },
    tanggal_data: produk[0]?.tanggal_data ?? null,
    label_kelompok: KELOMPOK,
    ...hasil,
    tren_segar_protein: { titik: trenSegar, cukup: trenSegar.length >= MIN_TITIK_TREN },
  };
}

// ---------------------------------------------------------------- celah MBG
export function celahMbg(repo, { kodeKab, hariLayanan, tanggal } = {}) {
  const t = tanggal ?? repo.tanggalTerakhir('ID');
  const nas = repo.snapshot('ID', t);
  const penerima = repo.rilisTerakhir('penerima_mbg');
  const biaya = nilaiAsumsi(repo, 'biaya_per_porsi', 15000);
  const porsi = nilaiAsumsi(repo, 'porsi_bahan_baku', 0.7);
  const kebNas = kebutuhanHarian(penerima?.nilai ?? null, biaya, porsi);

  const ringkasanNasional = {
    penerima: penerima ? { nilai: penerima.nilai, tanggal: penerima.per_tanggal, sumber_url: penerima.sumber_url, label_asal: 'Rilis' } : null,
    biaya_per_porsi: biaya,
    porsi_bahan_baku: porsi,
    kebutuhan_harian: kebNas,
    nilai_transaksi_koperasi: nas?.nilai_transaksi ?? null,
    tanggal_transaksi: t,
    setara_hari: setaraHari(nas?.nilai_transaksi ?? null, kebNas),
    label_asal: 'Estimasi',
    catatan: 'Nilai transaksi koperasi mencakup semua produk (bukan hanya pasokan MBG); perbandingan ini hanya menunjukkan skala.',
  };

  let kecamatan = null;
  if (kodeKab) {
    const a = anak(repo, kodeKab, { tanggal: t });
    if (!a || a.level_anak !== 'kecamatan') return { error: 'kode_kab harus kode kabupaten/kota' };
    kecamatan = {
      kabupaten: a.induk,
      leluhur: a.leluhur,
      cakupan: a.cakupan,
      tanggal_data: a.tanggal_data,
      rows: a.rows.map((r) => {
        const sppg = repo.rilisTerakhir('sppg_beroperasi', r.kode);
        const pen = repo.rilisTerakhir('penerima_mbg', r.kode);
        const keb = kebutuhanHarian(pen?.nilai ?? null, biaya, porsi);
        return {
          kode: r.kode,
          nama: r.nama,
          status_data: r.status_data,
          jumlah_koperasi: r.jumlah_koperasi ?? null,
          nilai_transaksi: r.nilai_transaksi ?? null,
          trx_per_kop: r.trx_per_kop,
          sppg: sppg?.nilai ?? null,
          penerima: pen?.nilai ?? null,
          kebutuhan_harian: keb,
          setara_hari: setaraHari(r.nilai_transaksi ?? null, keb),
          rasio_celah: hariLayanan ? rasioCelah(r.nilai_transaksi ?? null, keb, hariLayanan) : null,
        };
      }),
    };
  }
  return { tanggal_data: t, ringkasan_nasional: ringkasanNasional, kecamatan, hari_layanan: hariLayanan ?? null };
}

// ---------------------------------------------------------------- permintaan vs kesiapan (2.3)
export function permintaan(repo, { tanggal } = {}) {
  const prov = anak(repo, 'ID', { tanggal }).rows.filter((r) => r.status_data === 'ada');
  const titik = prov
    .map((r) => {
      const sppg = repo.rilisTerakhir('sppg_beroperasi', r.kode);
      const pen = repo.rilisTerakhir('penerima_mbg', r.kode);
      return sppg ? { kode: r.kode, nama: r.nama, sppg: sppg.nilai, sppg_tanggal: sppg.per_tanggal, penerima: pen?.nilai ?? null, indeks: r.indeks } : null;
    })
    .filter(Boolean);
  const aktif = titik.length >= Math.ceil(38 * AMBANG_CAKUPAN);
  return {
    aktif,
    cakupan: { ada: titik.length, total: 38 },
    alasan: aktif ? null : `Data SPPG per provinsi berstatus terverifikasi baru tersedia untuk ${titik.length} dari 38 provinsi.`,
    titik: aktif ? titik : [],
  };
}

// ---------------------------------------------------------------- collector
export function collectorStatus(repo) {
  const runs = [...repo.collectorRuns()].sort((a, b) => String(b.mulai).localeCompare(String(a.mulai)));
  const terakhir = {};
  for (const r of runs) terakhir[r.target] ??= r;
  return { terakhir: Object.values(terakhir), riwayat: runs.slice(0, 50) };
}

// ---------------------------------------------------------------- harga pangan (PIHPS)
const jarakKm = ([lng1, lat1], [lng2, lat2]) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const URUT_KOMODITAS = ['Beras', 'Daging Ayam', 'Daging Sapi', 'Telur Ayam', 'Bawang Merah', 'Bawang Putih', 'Cabai Merah', 'Cabai Rawit', 'Minyak Goreng', 'Gula Pasir'];

function ringkasHarga(rows) {
  return rows
    .filter((r) => r.level_komoditas === 'kategori')
    .map((r) => ({ komoditas: r.komoditas, satuan: r.satuan, harga: r.harga, rata_rata_7_hari: r.rata_rata_7_hari, tanggal_data: r.tanggal_data }))
    .sort((a, b) => (URUT_KOMODITAS.indexOf(a.komoditas) + 100) % 100 - (URUT_KOMODITAS.indexOf(b.komoditas) + 100) % 100);
}

/**
 * Harga pangan untuk satu wilayah. Bila wilayah bukan kota survei PIHPS, kembalikan harga provinsi
 * dan dua kota survei terdekat di provinsi yang sama (cakupan: 'pendekatan').
 */
export function hargaWilayah(repo, kode) {
  const w = repo.wilayah(kode);
  if (!w) return null;
  const kolom = [];
  const langsung = repo.hargaTerbaru(kode);
  let cakupan = 'tidak_ada';
  if (langsung.length) {
    cakupan = 'kota_survei';
    kolom.push({ kode, nama: w.nama, peran: 'wilayah', harga: ringkasHarga(langsung) });
  }
  const kodeProv = w.level === 'provinsi' ? w.kode : w.level === 'kabupaten' ? w.parent_kode : w.level === 'kecamatan' ? kode.slice(0, 2) : null;
  if (kodeProv && kodeProv !== kode) {
    const prov = repo.hargaTerbaru(kodeProv);
    if (prov.length) {
      kolom.push({ kode: kodeProv, nama: repo.wilayah(kodeProv)?.nama, peran: 'provinsi', harga: ringkasHarga(prov) });
      if (cakupan === 'tidak_ada') cakupan = 'pendekatan';
    }
  }
  const kodeKab = w.level === 'kabupaten' ? w.kode : w.level === 'kecamatan' ? w.parent_kode : null;
  if (!langsung.length && kodeKab) {
    const asal = repo.wilayah(kodeKab)?.centroid;
    const survei = repo.kodeDenganHarga()
      .filter((k) => k.length === 5 && k.startsWith(`${kodeProv}.`) && k !== kodeKab)
      .map((k) => ({ k, w: repo.wilayah(k) }))
      .filter((x) => x.w?.centroid && asal)
      .map((x) => ({ ...x, jarak: jarakKm(asal, x.w.centroid) }))
      .sort((a, b) => a.jarak - b.jarak)
      .slice(0, 2);
    for (const x of survei) {
      kolom.push({ kode: x.k, nama: x.w.nama, peran: 'kota_survei_terdekat', jarak_km: Math.round(x.jarak), harga: ringkasHarga(repo.hargaTerbaru(x.k)) });
    }
  }
  const tanggal = kolom.flatMap((c) => c.harga.map((h) => h.tanggal_data)).sort().at(-1) ?? null;
  return {
    wilayah: { kode: w.kode, nama: w.nama, level: w.level },
    cakupan,
    jenis_pasar: 'tradisional',
    tanggal_data: tanggal,
    komoditas: URUT_KOMODITAS.filter((k) => kolom.some((c) => c.harga.some((h) => h.komoditas === k))),
    kolom,
    catatan: cakupan === 'pendekatan'
      ? `${w.nama} bukan kota survei PIHPS; ditampilkan harga provinsi dan kota survei terdekat sebagai pendekatan.`
      : cakupan === 'tidak_ada' ? 'Belum ada data harga PIHPS untuk wilayah ini atau provinsinya.' : null,
  };
}
