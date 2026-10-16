import { komponenDasar } from './indeks.js';

/** Kuadran matriks fisik vs usaha, BRIEF Bagian 4. Label memakai bahasa netral (Bagian 10.8). */
export const KUADRAN = {
  siap: {
    label: 'Siap',
    deskripsi: 'Gerai sudah terbangun dan transaksi per koperasi di atas ambang.',
  },
  gedung_siap_usaha_belum: {
    label: 'Gedung siap, usaha belum',
    deskripsi: 'Transaksi rendah relatif terhadap kesiapan fisik.',
  },
  usaha_jalan_gedung_belum: {
    label: 'Usaha jalan, gedung belum',
    deskripsi: 'Transaksi sudah berjalan meski pembangunan gerai belum mencapai ambang.',
  },
  tertinggal: {
    label: 'Keduanya di bawah ambang',
    deskripsi: 'Pembangunan gerai dan transaksi per koperasi sama-sama di bawah ambang.',
  },
};

export const AMBANG_BAWAAN = { gerai: 80, trx: 1_000_000 };

export function kuadranOf(gerai, trxPerKop, ambangGerai = AMBANG_BAWAAN.gerai, ambangTrx = AMBANG_BAWAAN.trx) {
  if (gerai === null || gerai === undefined || trxPerKop === null || trxPerKop === undefined) return null;
  const fisik = gerai >= ambangGerai;
  const usaha = trxPerKop >= ambangTrx;
  if (fisik && usaha) return 'siap';
  if (fisik) return 'gedung_siap_usaha_belum';
  if (usaha) return 'usaha_jalan_gedung_belum';
  return 'tertinggal';
}

/**
 * @param rows snapshot wilayah ({kode, nama, ...kolom snapshot})
 */
export function hitungMatriks(rows, { ambangGerai = AMBANG_BAWAAN.gerai, ambangTrx = AMBANG_BAWAAN.trx } = {}) {
  const titik = rows
    .map((r) => {
      const k = komponenDasar(r);
      return {
        kode: r.kode,
        nama: r.nama,
        jumlah_koperasi: r.jumlah_koperasi,
        gerai_pct: k.gerai,
        trx_per_kop: k.trx_per_kop,
        kuadran: kuadranOf(k.gerai, k.trx_per_kop, ambangGerai, ambangTrx),
      };
    })
    .filter((t) => t.kuadran);

  const jumlah = Object.fromEntries(Object.keys(KUADRAN).map((k) => [k, 0]));
  titik.forEach((t) => {
    jumlah[t.kuadran] += 1;
  });

  // Prioritas pendampingan: gedung siap tapi transaksi rendah, transaksi terendah lebih dulu.
  const prioritas = titik
    .filter((t) => t.kuadran === 'gedung_siap_usaha_belum')
    .sort((a, b) => a.trx_per_kop - b.trx_per_kop);

  return { titik, jumlah, prioritas, ambang: { gerai: ambangGerai, trx: ambangTrx } };
}
