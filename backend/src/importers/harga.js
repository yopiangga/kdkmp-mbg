/** Importer harga pangan PIHPS → harga_pangan. Nama wilayah PIHPS dicocokkan ke kode Kemendagri. */
import { createRepo } from '../db/repo.js';
import { cocokkanNamaDetail } from '../lib/wilayahNama.js';

// Nama provinsi PIHPS yang berbeda dari Kemendagri.
const ALIAS_PROVINSI = { 'Kep. Bangka Belitung': 'Kepulauan Bangka Belitung', 'Kep. Riau': 'Kepulauan Riau' };

// PIHPS memakai nama kota ibu kota kabupaten; petakan ke kode kabupaten Kemendagri.
export const ALIAS_KOTA_PIHPS = {
  'Kota Meulaboh': '11.05', // Kab. Aceh Barat
  'Kota Lhokseumawe': '11.73',
  'Kota Singaraja': '51.08', // Kab. Buleleng
  'Kota Tanjung': '63.09', // Kab. Tabalong
  'Kota Sampit': '62.02', // Kab. Kotawaringin Timur
  'Kota Bungo': '15.08', // Kab. Bungo (Muara Bungo)
  'Kota Muara Bungo': '15.08',
  'Kota Tanjung Pandan': '19.02', // Kab. Belitung
  'Kota Maumere': '53.07', // Kab. Sikka
  'Kota Tembilahan': '14.04', // Kab. Indragiri Hilir
  'Kota Mamuju': '76.02', // Kab. Mamuju
  'Kota Watampone': '73.08', // Kab. Bone
};

// PIHPS masih memakai 34 provinsi lama: kab/kota di Papua dan Papua Barat dicari juga di provinsi hasil pemekaran.
const PEMEKARAN = { 91: ['91', '93', '94', '95'], 92: ['92', '96'] };

export function importHarga(store, hasil, { jenisPasar, sumberUrl, runId = null, periode }) {
  const repo = createRepo(store);
  const provList = repo.wilayahByLevel('provinsi');
  const rows = [];
  const tidakCocok = [];
  let wilayah = 0;

  for (const h of hasil) {
    const prov = cocokkanNamaDetail(ALIAS_PROVINSI[h.provinsi] ?? h.provinsi, provList);
    let kode = prov?.kode ?? null;
    if (kode && h.level === 'kabupaten') {
      const alias = ALIAS_KOTA_PIHPS[h.nama.trim()];
      const provKandidat = PEMEKARAN[kode] ?? [kode];
      const kandidat = provKandidat.flatMap((p) => repo.anakWilayah(p));
      // PIHPS menulis "Kota Surakarta (Solo)", "Kab. Boyolali " — buang keterangan dalam kurung.
      kode = alias && provKandidat.includes(repo.wilayah(alias)?.parent_kode)
        ? alias
        : cocokkanNamaDetail(h.nama.replace(/\s*\(.*\)\s*/g, ' ').trim(), kandidat)?.kode ?? null;
    }
    if (!kode) {
      tidakCocok.push(`${h.level} ${h.nama}`);
      continue;
    }
    if (!h.baris.length) continue;
    wilayah += 1;
    for (const b of h.baris) {
      rows.push({
        kode, tanggal_data: b.tanggal_data, komoditas: b.komoditas, kategori: b.kategori, level_komoditas: b.level,
        satuan: b.satuan, harga: b.harga, rata_rata_7_hari: b.rata_rata, jumlah_hari: b.jumlah_hari,
        jenis_pasar: jenisPasar, nama_pihps: h.nama, pihps_id: h.pihps_id, level_wilayah: h.level,
        periode_awal: periode?.awal ?? null, periode_akhir: periode?.akhir ?? null,
        sumber_url: sumberUrl, collector_run_id: runId, asal_input: 'collector',
      });
    }
  }
  store.upsert('harga_pangan', rows);
  return {
    status: tidakCocok.length ? 'perlu_cek' : 'ok',
    jumlah_baris: rows.length,
    wilayah,
    tidak_cocok: tidakCocok,
    pesan: `${wilayah} wilayah, ${rows.length} harga komoditas${tidakCocok.length ? `; tidak cocok: ${tidakCocok.slice(0, 5).join(', ')}` : ''}`,
  };
}
