#!/usr/bin/env node
/**
 * Pemakaian:
 *   node src/run.js wilayah
 *   node src/run.js nasional
 *   node src/run.js provinsi [id ...]        tanpa id: 6 provinsi bergilir; --semua: 38 provinsi (lewati yang sudah hari ini)
 *   node src/run.js kabupaten [id ...]       tanpa id: pilot Gresik (245)
 *   node src/run.js kabupaten --bergilir N   N kab/kota yang paling lama tidak diambil (selain Gresik)
 *   node src/run.js kabupaten --pilot        kab pilot microsite (Kebumen dulu) yang ID-nya sudah terpetakan
 *   node src/run.js kabupaten --semua        semua kab/kota terpetakan yang belum diambil hari ini (bisa dilanjutkan)
 *   node src/run.js cooptrade
 *   node src/run.js microsite [--kab 35.25] [--limit N]   kab pilot (bawaan: semua); kuota 500 request/hari lintas run
 *   node src/run.js impor-raw <YYYY-MM-DD>   parse ulang HTML di data/raw tanpa mengambil ulang
 *   node src/run.js harga [--provinsi "Jawa Tengah"]   harga pangan PIHPS Bank Indonesia (34 provinsi + kota survei)
 *   node src/run.js impor-raw-harga <YYYY-MM-DD>   parse ulang PIHPS dari data/raw tanpa mengambil ulang
 *   node src/run.js uji-gagal                simulasi kegagalan: dicatat di collector_runs dan memicu webhook
 */
import { createPoliteClient, BlockedError } from './lib/http.js';
import { recordRun, updateRun, blockedToday, notify } from './lib/runs.js';
import { today } from './lib/paths.js';
import { withBrowser } from './lib/browser.js';
import { collectWilayah } from './targets/wilayah.js';
import { ambilHalaman, provinsiBergilir, kabupatenBergilir, belumDiambilHariIni, imporUlangRaw, JUMLAH_PROVINSI } from './targets/dashboard.js';
import { ambilCoopTrade } from './targets/cooptrade.js';
import { ambilMicrosite, PILOT_MICROSITE } from './targets/microsite.js';
import { ambilHarga, imporUlangHarga } from './targets/harga.js';
import { idSimkopdes } from './targets/dashboard.js';
import { DATA_DIR } from './lib/paths.js';
import { JsonStore } from '../../backend/src/db/store.js';
import { importKoperasi } from '../../backend/src/importers/koperasi.js';

const PILOT_KAB = [245]; // pengecualian rotasi harian (Gresik juga ikut --pilot mingguan)

/**
 * Ambil beberapa halaman dalam satu sesi browser. Galat satu halaman dicatat lalu lanjut,
 * kecuali diblokir (CAPTCHA/403/429): run langsung berhenti (Bagian 6.3).
 */
async function jalankanHalaman(target, halaman, ids, runId) {
  return withBrowser(async (session) => {
    const hasil = [];
    for (const [i, id] of ids.entries()) {
      try {
        const h = await ambilHalaman(session, halaman, id, { runId });
        hasil.push({ id, ...h });
        console.log(`[${target}] ${i + 1}/${ids.length} id ${id} → ${h.kode}: ${h.status}`);
      } catch (err) {
        if (err instanceof BlockedError) {
          err.message = `${err.message} (setelah ${hasil.length} halaman berhasil)`;
          throw err;
        }
        // Browser mati (dihentikan atau crash): jangan lanjut ke ID berikutnya.
        if (/browser has been closed|Target page, context or browser has been closed/i.test(err.message)) {
          throw new Error(`Browser tertutup setelah ${hasil.length} halaman: ${err.message}`);
        }
        hasil.push({ id, kode: `id ${id}`, status: 'gagal', masalah: [err.message], jumlah_baris: 0 });
        console.error(`[${target}] ${i + 1}/${ids.length} id ${id} gagal: ${err.message}`);
      }
    }
    const gagal = hasil.filter((h) => h.status !== 'ok');
    return {
      jumlah_halaman: session.pages,
      jumlah_baris: hasil.reduce((s, h) => s + (h.jumlah_baris ?? 0), 0),
      status: gagal.length ? 'perlu_cek' : 'sukses',
      path_raw: hasil.length > 3 ? `${hasil.length} berkas di data/raw/simkopdes_dashboard/` : hasil.map((h) => h.path_raw).filter(Boolean).join(', '),
      pesan: `${hasil.length - gagal.length}/${hasil.length} halaman ok`
        + (gagal.length ? `; bermasalah: ${gagal.slice(0, 5).map((h) => `${h.kode} (${h.masalah.slice(0, 2).join('; ')})`).join(' | ')}${gagal.length > 5 ? ` …+${gagal.length - 5}` : ''}` : ''),
    };
  });
}

const TARGETS = {
  wilayah: async () => collectWilayah(createPoliteClient()),
  nasional: (runId) => jalankanHalaman('nasional', 'nasional', [null], runId),
  provinsi: (runId, args) => {
    if (args[0] === '--semua') {
      const ids = belumDiambilHariIni('provinsi', Array.from({ length: JUMLAH_PROVINSI }, (_, i) => i + 1));
      if (!ids.length) return { jumlah_halaman: 0, jumlah_baris: 0, pesan: 'Semua provinsi sudah diambil hari ini.' };
      return jalankanHalaman('provinsi', 'provinsi', ids, runId);
    }
    return jalankanHalaman('provinsi', 'provinsi', args.length ? args.map(Number) : provinsiBergilir(6), runId);
  },
  kabupaten: async (runId, args) => {
    if (args[0] === '--pilot') {
      const ids = PILOT_MICROSITE.map((k) => idSimkopdes('kabupaten', k)).filter(Boolean);
      const belum = PILOT_MICROSITE.filter((k) => !idSimkopdes('kabupaten', k));
      if (!ids.length) return { jumlah_halaman: 0, jumlah_baris: 0, pesan: `Kab pilot belum terpetakan (${belum.join(', ')}); jalankan provinsinya dulu.` };
      const r = await jalankanHalaman('kabupaten', 'kabupaten', ids, runId);
      return belum.length ? { ...r, pesan: `${r.pesan}; belum terpetakan: ${belum.join(', ')}` } : r;
    }
    if (args[0] === '--semua') {
      const ids = belumDiambilHariIni('kabupaten', kabupatenBergilir(Infinity, []));
      if (!ids.length) return { jumlah_halaman: 0, jumlah_baris: 0, pesan: 'Semua kab/kota terpetakan sudah diambil hari ini.' };
      return jalankanHalaman('kabupaten', 'kabupaten', ids, runId);
    }
    if (args[0] === '--bergilir') {
      const ids = kabupatenBergilir(Number(args[1]) || 17, PILOT_KAB);
      if (!ids.length) return { jumlah_halaman: 0, jumlah_baris: 0, pesan: 'Belum ada kab/kota terpetakan; jalankan target provinsi dulu.' };
      return jalankanHalaman('kabupaten', 'kabupaten', ids, runId);
    }
    return jalankanHalaman('kabupaten', 'kabupaten', args.length ? args.map(Number) : PILOT_KAB, runId);
  },
  harga: async (runId, args) => {
    const i = args.indexOf('--provinsi');
    const client = createPoliteClient({ quota: 1000 });
    const r = await ambilHarga(client, { runId, provinsiFilter: i >= 0 ? [args[i + 1]] : undefined });
    return { jumlah_halaman: client.used, jumlah_baris: r.jumlah_baris, status: r.status === 'perlu_cek' ? 'perlu_cek' : 'sukses', path_raw: r.path_raw, pesan: r.pesan };
  },
  'uji-gagal': async () => {
    throw new Error('Simulasi kegagalan (uji-gagal) untuk memeriksa notifikasi.');
  },
  cooptrade: (runId) => withBrowser(async (session) => {
    const h = await ambilCoopTrade(session, { runId });
    return { jumlah_halaman: h.jumlah_halaman, jumlah_baris: h.jumlah_baris, status: h.status === 'perlu_cek' ? 'perlu_cek' : 'sukses', path_raw: h.path_raw, pesan: h.pesan };
  }),
  microsite: async (runId, args) => {
    const opt = (k) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : undefined);
    const limit = opt('--limit') ? Number(opt('--limit')) : Infinity;
    const kabList = opt('--kab') ? [opt('--kab')] : PILOT_MICROSITE;
    const store = new JsonStore(DATA_DIR);
    // Kuota 500 request/hari dihitung lintas run (Bagian 6.2).
    const kuotaHarian = Number(process.env.COLLECTOR_DAILY_QUOTA) || 500;
    const terpakai = store.all('collector_runs')
      .filter((r) => r.target === 'microsite' && r.id !== runId && String(r.mulai).slice(0, 10) === today())
      .reduce((s, r) => s + (r.jumlah_halaman ?? 0), 0);
    const sisa = kuotaHarian - terpakai;
    if (sisa <= 1) return { jumlah_halaman: 0, jumlah_baris: 0, pesan: `Kuota harian ${kuotaHarian} request sudah terpakai; dilanjutkan besok.` };
    const hari = (iso) => (Date.now() - new Date(iso).getTime()) / 86_400_000;
    // Mingguan per koperasi yang dikenal; slug yang tidak ditemukan baru dicoba lagi setelah 30 hari.
    const lewati = new Set(store.all('kdkmp_koperasi')
      .filter((r) => r.diambil_pada && hari(r.diambil_pada) < (r.status === 'aktif' ? 7 : 30))
      .map((r) => r.kode_desa));
    const client = createPoliteClient({ quota: sisa });
    const pesan = [];
    let total = 0;
    let rawDir = null;
    for (const kab of kabList) {
      const r = await ambilMicrosite(client, { kab, limit, lewati, onRow: (rows) => importKoperasi(store, rows, { runId }) });
      const h = { aktif: r.rows.filter((x) => x.status === 'aktif').length, tidak: r.rows.filter((x) => x.status !== 'aktif').length };
      total += r.rows.length;
      rawDir = r.rawDir;
      pesan.push(`${kab}: ${r.dicoba} desa dicoba, ${h.aktif} koperasi, ${h.tidak} tidak ditemukan${r.kuotaHabis ? ' (kuota habis, lanjut besok)' : ''}${r.polaTidakCocok ? ' (dihentikan: pola slug kabupaten ini tidak cocok)' : ''}`);
      if (r.kuotaHabis) break;
    }
    return { jumlah_halaman: client.used, jumlah_baris: total, path_raw: rawDir, pesan: pesan.join(' | ') };
  },
};

// Bagian 10.4: User-Agent jujur beserta kontak.
const BUTUH_KONTAK = ['nasional', 'provinsi', 'kabupaten', 'cooptrade', 'microsite', 'harga'];

async function main() {
  const [target, ...args] = process.argv.slice(2);

  if (target === 'impor-raw-harga') {
    if (!args[0]) throw new Error('Tanggal wajib: impor-raw-harga YYYY-MM-DD');
    const h = await imporUlangHarga(args[0]);
    console.log(`[harga] ${h.status}: ${h.pesan}`);
    return;
  }

  if (target === 'impor-raw') {
    if (!args[0]) throw new Error('Tanggal wajib: impor-raw YYYY-MM-DD');
    const hasil = await imporUlangRaw(args[0]);
    for (const h of hasil) console.log(`${h.file}: ${h.kode ?? ''} ${h.status}${h.masalah?.length ? ` — ${h.masalah.join('; ')}` : ''}`);
    return;
  }

  if (!TARGETS[target]) {
    console.error(`Target tidak dikenal: ${target ?? '(kosong)'}. Tersedia: ${Object.keys(TARGETS).join(', ')}, impor-raw`);
    process.exit(2);
  }
  if (BUTUH_KONTAK.includes(target) && !process.env.CONTACT_EMAIL?.trim()) {
    console.error('CONTACT_EMAIL belum diisi di .env. Bagian 10.4 mewajibkan kontak di User-Agent.');
    process.exit(4);
  }
  if (await blockedToday(target, today())) {
    console.error(`Target ${target} sudah diblokir hari ini dan sudah dicoba ulang. Tidak dijalankan lagi.`);
    process.exit(3);
  }

  const run = await recordRun({ target, mulai: new Date().toISOString(), selesai: null, status: 'berjalan', jumlah_halaman: 0, jumlah_baris: 0, pesan: null, path_raw: null });
  try {
    const hasil = await TARGETS[target](run.id, args);
    const status = hasil.status ?? 'sukses';
    await updateRun(run.id, { selesai: new Date().toISOString(), ...hasil, status });
    if (status === 'perlu_cek') await notify(`Collector ${target} perlu_cek: ${hasil.pesan}`);
    console.log(`[${target}] ${status}: ${hasil.pesan}`);
  } catch (err) {
    const status = err instanceof BlockedError ? 'diblokir' : 'gagal';
    await updateRun(run.id, { selesai: new Date().toISOString(), status, pesan: err.message });
    await notify(`Collector ${target} ${status}: ${err.message}`);
    console.error(`[${target}] ${status}: ${err.message}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
