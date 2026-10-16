/** Komposisi usaha per kelompok produk (BRIEF Bagian 4). */
export const KELOMPOK = {
  program: 'Program pemerintah',
  sembako: 'Sembako',
  segar_protein: 'Pangan segar dan protein',
  lainnya: 'Lainnya',
};

/** Pola gaya ILIKE: `%` = apa saja, `_` = satu karakter, tanpa membedakan huruf besar/kecil. */
export function polaToRegex(pola) {
  const body = [...pola]
    .map((c) => (c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${body}$`, 'i');
}

export function kelompokProduk(nama, polaRows) {
  const sorted = [...polaRows].sort(
    (a, b) => (a.prioritas ?? 100) - (b.prioritas ?? 100) || b.pola.length - a.pola.length,
  );
  const hit = sorted.find((p) => polaToRegex(p.pola).test(nama));
  return hit ? hit.kelompok : 'lainnya';
}

/**
 * @param produk baris kdkmp_produk_terlaris
 * @param totalTransaksi nilai_transaksi wilayah (untuk menghitung cakupan 10 produk terlaris)
 */
export function hitungKomposisi(produk, polaRows, totalTransaksi = null) {
  const items = produk.map((p) => ({ ...p, kelompok: kelompokProduk(p.nama_produk, polaRows) }));
  const totalTop = items.reduce((s, p) => s + (p.nilai ?? 0), 0);
  const kelompok = Object.entries(KELOMPOK).map(([k, label]) => {
    const nilai = items.filter((p) => p.kelompok === k).reduce((s, p) => s + (p.nilai ?? 0), 0);
    return {
      kelompok: k,
      label,
      nilai,
      porsi_top_pct: totalTop ? (nilai / totalTop) * 100 : null,
      porsi_total_pct: totalTransaksi ? (nilai / totalTransaksi) * 100 : null,
    };
  });
  return {
    produk: items,
    kelompok,
    total_top: totalTop,
    total_transaksi: totalTransaksi,
    cakupan_pct: totalTransaksi ? (totalTop / totalTransaksi) * 100 : null,
  };
}
