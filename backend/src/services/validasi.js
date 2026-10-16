/**
 * Validasi snapshot (BRIEF Bagian 6.3): jumlah 38 provinsi harus sama dengan total nasional (toleransi 0).
 * Kolom yang dibandingkan hanya yang ada di kedua sisi.
 */
export const KOLOM_PENJUMLAHAN = [
  ['jumlah_koperasi', 'jumlah_koperasi'],
  ['manajer_aktif', 'manajer_aktif'],
  ['punya_nib', 'punya_nib'],
  ['punya_npwp', 'punya_npwp'],
  ['rat_selesai', 'rat_selesai'],
  ['simpanan_pokok', 'simpanan_pokok'],
  ['simpanan_wajib', 'simpanan_wajib'],
  ['nilai_transaksi', 'nilai_transaksi'],
  ['pemetaan_lahan', 'lahan_diajukan'],
];

export function validasiTotal(provinsiRows, nasional, { jumlahProvinsi = 38 } = {}) {
  const masalah = [];
  if (provinsiRows.length !== jumlahProvinsi) {
    masalah.push(`Jumlah provinsi ${provinsiRows.length}, diharapkan ${jumlahProvinsi}`);
  }
  if (!nasional) {
    masalah.push('Snapshot nasional untuk tanggal ini tidak ada');
    return { ok: false, masalah };
  }
  for (const [kolomProv, kolomNas] of KOLOM_PENJUMLAHAN) {
    const target = nasional[kolomNas];
    if (target === null || target === undefined) continue;
    if (provinsiRows.some((r) => r[kolomProv] === null || r[kolomProv] === undefined)) continue;
    // Jumlahkan dalam sen untuk menghindari galat floating point.
    const sum = provinsiRows.reduce((s, r) => s + Math.round(r[kolomProv] * 100), 0);
    if (sum !== Math.round(target * 100)) {
      masalah.push(`${kolomProv}: jumlah provinsi ${sum / 100} ≠ nasional ${target}`);
    }
  }
  return { ok: masalah.length === 0, masalah };
}
