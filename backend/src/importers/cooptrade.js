/** Importer katalog Coop Trade → cooptrade_produk_snapshot + cooptrade_ringkasan. */
export const COOPTRADE_URL = 'https://trade.simkopdes.go.id/search';

export function importCoopTrade(store, { tanggal, total, produk, runId = null }) {
  const masalah = [];
  if (total !== null && produk.length !== total) masalah.push(`Produk terbaca ${produk.length}, katalog menyebut ${total}`);
  const status = masalah.length ? 'perlu_cek' : 'ok';

  store.upsert('cooptrade_produk_snapshot', produk.map((p) => ({
    tanggal_data: tanggal,
    nama_koperasi: p.nama_koperasi,
    produk: p.produk,
    produk_id: p.produk_id,
    harga: p.harga,
    kecamatan: p.kecamatan,
    kabupaten: p.kabupaten,
    terjual: p.terjual,
    url: p.url,
    collector_run_id: runId,
    asal_input: 'collector',
  })));

  const ringkasan = {
    tanggal_data: tanggal,
    jumlah_produk: total ?? produk.length,
    jumlah_terjual: produk.reduce((s, p) => s + (p.terjual ?? 0), 0),
    jumlah_koperasi: new Set(produk.map((p) => p.nama_koperasi)).size,
    sumber_url: COOPTRADE_URL,
    status,
    collector_run_id: runId,
    asal_input: 'collector',
  };
  store.upsert('cooptrade_ringkasan', [ringkasan]);
  return { status, masalah, jumlah_baris: produk.length, ringkasan, pesan: `${produk.length} produk, ${ringkasan.jumlah_terjual} terjual (${status})` };
}
