/**
 * Kebutuhan bahan baku MBG (estimasi), BRIEF Bagian 4.
 *   kebutuhan_harian = penerima × biaya_per_porsi × porsi_bahan_baku
 *   rasio_celah      = transaksi_koperasi_periode / (kebutuhan_harian × hari_layanan_periode)
 */
export function kebutuhanHarian(penerima, biayaPerPorsi = 15000, porsiBahanBaku = 0.7) {
  if (penerima === null || penerima === undefined) return null;
  return penerima * biayaPerPorsi * porsiBahanBaku;
}

export function rasioCelah(transaksiPeriode, kebHarian, hariLayanan) {
  if (transaksiPeriode === null || transaksiPeriode === undefined || !kebHarian || !hariLayanan) return null;
  return transaksiPeriode / (kebHarian * hariLayanan);
}

/** Berapa hari kebutuhan bahan baku yang setara dengan nilai transaksi koperasi (tanpa asumsi hari layanan). */
export function setaraHari(transaksi, kebHarian) {
  if (transaksi === null || transaksi === undefined || !kebHarian) return null;
  return transaksi / kebHarian;
}
