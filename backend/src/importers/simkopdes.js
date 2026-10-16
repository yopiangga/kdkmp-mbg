/**
 * Importer hasil parse dasbor Simkopdes (collector/src/parsers/dashboard.js) ke tabel JSON.
 * Dipanggil collector setelah halaman dibaca, atau ulang dari data/raw tanpa mengambil ulang.
 */
import { createRepo } from '../db/repo.js';
import { cocokkanNama, cocokkanNamaDetail } from '../lib/wilayahNama.js';
import { validasiTotal } from '../services/validasi.js';

const KOLOM_SNAPSHOT = [
  'jumlah_koperasi', 'punya_akun', 'manajer_aktif', 'punya_nib', 'punya_npwp', 'rat_selesai', 'rat_draft', 'rat_belum',
  'rat_diverifikasi', 'rat_dilaporkan', 'simpanan_pokok', 'simpanan_wajib', 'volume_transaksi', 'nilai_transaksi',
  'pemetaan_lahan', 'pemetaan_lahan_pct', 'pembangunan_gerai_pct', 'lahan_diajukan', 'lahan_belum_diverifikasi',
  'lahan_terverifikasi', 'gerai_belum', 'gerai_proses', 'gerai_selesai',
];

const pickDefined = (o) => Object.fromEntries(KOLOM_SNAPSHOT.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));

/** Gabungkan dengan baris yang sudah ada pada (kode, tanggal) tanpa menimpa kolom dengan nilai kosong. */
function merge(store, rows) {
  const existing = new Map(store.all('kdkmp_snapshot').map((r) => [`${r.kode}|${r.tanggal_data}`, r]));
  return rows.map((r) => {
    const old = existing.get(`${r.kode}|${r.tanggal_data}`);
    if (!old) return r;
    const base = old.asal_input === 'seed' ? {} : old; // data collector menggantikan seed pada tanggal yang sama
    return { ...base, ...r, status: r.status };
  });
}

/**
 * @param parsed  hasil parseDashboard
 * @param opts.halaman  'nasional' | 'provinsi' | 'kabupaten'
 * @param opts.simkopdesId  ID internal halaman (district/{id} atau sub-district/{id})
 * @param opts.url  URL halaman sumber
 * @param opts.runId  id collector_runs
 */
export function importDashboard(store, parsed, { halaman, simkopdesId = null, url, runId = null }) {
  const repo = createRepo(store);
  const tanggal = parsed.tanggal_data;
  if (!tanggal) throw new Error('tanggal_data tidak terbaca');
  const masalah = [];
  const now = new Date().toISOString();
  const mapRows = [];

  // ---- tentukan wilayah induk
  let kodeInduk;
  if (halaman === 'nasional') kodeInduk = 'ID';
  else if (halaman === 'provinsi') {
    kodeInduk = cocokkanNama(parsed.konteks.provinsi, repo.wilayahByLevel('provinsi'));
    if (!kodeInduk) throw new Error(`Nama provinsi tidak cocok: ${parsed.konteks.provinsi} (district/${simkopdesId})`);
    mapRows.push({ simkopdes_id: simkopdesId, level: 'provinsi', kode: kodeInduk, nama_simkopdes: parsed.konteks.provinsi, status_cocok: 'otomatis', sumber_url: url, diambil_pada: now, halaman_diambil_pada: now });
  } else if (halaman === 'kabupaten') {
    const peta = store.all('simkopdes_wilayah_map').find((m) => m.level === 'kabupaten' && m.simkopdes_id === simkopdesId && m.kode);
    kodeInduk = peta?.kode;
    if (!kodeInduk) {
      // Cocokkan lewat nama kab + provinsi bila pemetaan belum ada.
      const prov = cocokkanNama(parsed.konteks.provinsi, repo.wilayahByLevel('provinsi'));
      kodeInduk = prov ? cocokkanNama(parsed.konteks.kabupaten, repo.anakWilayah(prov)) : null;
    }
    if (!kodeInduk) throw new Error(`Kab/kota sub-district/${simkopdesId} belum terpetakan (${parsed.konteks.kabupaten})`);
    mapRows.push({ simkopdes_id: simkopdesId, level: 'kabupaten', kode: kodeInduk, nama_simkopdes: parsed.konteks.kabupaten ?? peta?.nama_simkopdes, status_cocok: peta?.status_cocok ?? 'otomatis', sumber_url: url, diambil_pada: now, halaman_diambil_pada: now });
  } else throw new Error(`halaman tidak dikenal: ${halaman}`);

  const indukRow = { kode: kodeInduk, tanggal_data: tanggal, ...pickDefined(parsed.kpi), sumber_url: url, collector_run_id: runId, asal_input: 'collector' };

  // ---- baris anak
  const kandidat = repo.anakWilayah(kodeInduk);
  const anakRows = [];
  for (const a of parsed.anak) {
    const cocok = cocokkanNamaDetail(a.nama, kandidat);
    const kode = cocok?.kode ?? null;
    if (a.simkopdes_id !== null) {
      mapRows.push({
        simkopdes_id: a.simkopdes_id, level: parsed.level_anak, kode, nama_simkopdes: a.nama,
        // "mirip" = cocok dengan selisih ejaan; dipakai tetapi masuk antrean verifikasi manual.
        status_cocok: !kode ? 'belum' : cocok.cara === 'mirip' ? 'mirip' : 'otomatis', sumber_url: url, diambil_pada: now,
      });
    }
    if (!kode) {
      masalah.push(`Tidak cocok: ${a.nama}`);
      continue;
    }
    anakRows.push({ kode, tanggal_data: tanggal, ...pickDefined(a), nama_simkopdes: a.nama, sumber_url: url, collector_run_id: runId, asal_input: 'collector' });
  }

  // ---- validasi: jumlah anak = total induk (toleransi 0)
  const cek = validasiTotal(anakRows, indukRow, { jumlahProvinsi: parsed.anak.length });
  masalah.push(...cek.masalah);
  if (parsed.anak.length === 0) masalah.push('Tabel wilayah kosong');
  const status = masalah.length ? 'perlu_cek' : 'ok';

  const rows = merge(store, [{ ...indukRow, status }, ...anakRows.map((r) => ({ ...r, status }))]);
  store.upsert('kdkmp_snapshot', rows);

  if (parsed.produk_terlaris.length) {
    store.upsert('kdkmp_produk_terlaris', parsed.produk_terlaris.map((p) => ({
      kode: kodeInduk, tanggal_data: tanggal, ...p, sumber_url: url, asal_input: 'collector',
    })));
  }

  // Pemetaan manual tidak ditimpa kodenya; kolom lain (mis. halaman_diambil_pada) digabung.
  const lama = new Map(store.all('simkopdes_wilayah_map').map((m) => [`${m.simkopdes_id}|${m.level}`, m]));
  store.upsert('simkopdes_wilayah_map', mapRows.map((m) => {
    const old = lama.get(`${m.simkopdes_id}|${m.level}`);
    if (!old) return m;
    const gabung = { ...old, ...m, halaman_diambil_pada: m.halaman_diambil_pada ?? old.halaman_diambil_pada };
    return old.status_cocok === 'manual' ? { ...gabung, kode: old.kode, status_cocok: 'manual' } : gabung;
  }));

  return {
    kode: kodeInduk, tanggal_data: tanggal, status, masalah,
    jumlah_baris: anakRows.length + 1, jumlah_anak: parsed.anak.length, produk: parsed.produk_terlaris.length,
  };
}
