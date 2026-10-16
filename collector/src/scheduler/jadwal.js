/**
 * Jadwal collector (BRIEF Bagian 6 dan Fase 7). Semua waktu WIB.
 * Urutan pagi dipisah supaya hanya satu proses Playwright berjalan pada satu waktu;
 * penjadwal juga mengantrekan job bila yang sebelumnya belum selesai.
 */
export const JADWAL = [
  { nama: 'wilayah', cron: '0 5 1 * *', args: ['wilayah'], keterangan: 'Referensi wilayah Simkopdes, bulanan (tanggal 1)' },
  { nama: 'nasional', cron: '0 6 * * *', args: ['nasional'], keterangan: 'Dasbor nasional + 38 provinsi, harian 06.00' },
  { nama: 'provinsi', cron: '20 6 * * *', args: ['provinsi'], keterangan: '6 halaman provinsi bergilir per hari (≈ mingguan per provinsi)' },
  { nama: 'kabupaten-pilot', cron: '0 7 * * 1', args: ['kabupaten', '--pilot'], keterangan: 'Kab. pilot (Kebumen, Gresik, Kota Surabaya, Kab. Bangka, Banyumas, Cilacap, Purworejo, Banjarnegara), mingguan (Senin)' },
  { nama: 'kabupaten-bergilir', cron: '30 7 * * *', args: ['kabupaten', '--bergilir', '17'], keterangan: '17 kab/kota bergilir per hari (≈ bulanan per kab/kota)' },
  { nama: 'cooptrade', cron: '0 9 * * 3', args: ['cooptrade'], keterangan: 'Katalog Coop Trade, mingguan (Rabu)' },
  { nama: 'microsite-pilot', cron: '0 10 * * *', args: ['microsite'], keterangan: 'Profil koperasi 8 kab pilot (Kebumen, Gresik, Kota Surabaya, Kab. Bangka, Banyumas, Cilacap, Purworejo, Banjarnegara): harian sampai kuota 500 request; tiap koperasi diperbarui mingguan' },
  { nama: 'harga-pangan', cron: '0 8 * * 4', args: ['harga'], keterangan: 'Harga 10 komoditas pokok (PIHPS Bank Indonesia), mingguan (Kamis)' },
  { nama: 'backup', cron: '30 23 * * *', perintah: ['node', 'scripts/backup.js'], keterangan: 'Backup harian data/db (atau pg_dump bila DATABASE_URL diisi)' },
];
