/** Daftar sumber dan atribusinya (BRIEF Bagian 10.9). Dipakai di meta respons dan halaman Tentang data. */
export const SUMBER = {
  simkopdes: {
    nama: 'Simkopdes, Kementerian Koperasi',
    url: 'https://simkopdes.go.id/pers/dashboard',
    frekuensi: 'Harian (nasional), mingguan (provinsi), bulanan (kab/kota)',
    cara: 'Baca halaman dasbor yang dirender (Playwright), teks DOM; seed 15 Okt 2026 sebagai titik awal riwayat.',
  },
  simkopdes_wilayah: {
    nama: 'Referensi wilayah Simkopdes (Kemendagri)',
    url: 'https://simkopdes.go.id/data/wilayah/index.json',
    frekuensi: 'Bulanan',
    cara: 'HTTP langsung (JSON statis terbuka)',
  },
  kemendagri: {
    nama: 'Kemendagri — kode & batas wilayah via cahyadsn/wilayah dan cahyadsn/wilayah_boundaries (MIT)',
    url: 'https://github.com/cahyadsn/wilayah_boundaries',
    frekuensi: 'Sekali, diperbarui bila ada Kepmendagri baru',
    cara: 'Unduh sekali, disederhanakan menjadi GeoJSON',
  },
  cooptrade: {
    nama: 'Coop Trade (katalog B2B Simkopdes)',
    url: 'https://trade.simkopdes.go.id/search',
    frekuensi: 'Mingguan',
    cara: 'Baca halaman yang dirender (Playwright), klik per halaman',
  },
  pihps: {
    nama: 'PIHPS Nasional, Bank Indonesia',
    url: 'https://www.bi.go.id/hargapangan',
    frekuensi: 'Mingguan (harga harian pasar tradisional, 7 hari terakhir)',
    cara: 'Endpoint JSON publik halaman Tabel Harga; 34 provinsi dan kota survei PIHPS',
  },
  bgn: { nama: 'Badan Gizi Nasional (BGN)', url: 'https://www.bgn.go.id/', frekuensi: 'Rilis berkala', cara: 'Input admin' },
  kemenkeu: { nama: 'Kemenkeu, APBN KiTa', url: 'https://www.kemenkeu.go.id/', frekuensi: 'Bulanan', cara: 'Input admin' },
  bapanas: { nama: 'Badan Pangan Nasional (Bapanas)', url: 'https://badanpangan.go.id/', frekuensi: 'Rilis berkala', cara: 'Input admin' },
  observatorium: { nama: 'Perhitungan observatorium', url: null, frekuensi: 'Setiap permintaan', cara: 'Rumus BRIEF Bagian 4' },
};

export const ATRIBUSI_SIMKOPDES = 'Sumber: Simkopdes, Kementerian Koperasi';
