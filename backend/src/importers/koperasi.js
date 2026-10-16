/** Importer profil koperasi microsite → kdkmp_koperasi (tanpa data pribadi). */
const DILARANG = ['members', 'managements', 'distinct_managements', 'nik', 'photo', 'foto'];

function adaPII(obj) {
  if (Array.isArray(obj)) return obj.some(adaPII);
  if (obj && typeof obj === 'object') return Object.entries(obj).some(([k, v]) => DILARANG.includes(k) || adaPII(v));
  return false;
}

export function importKoperasi(store, rows, { runId = null } = {}) {
  for (const r of rows) {
    if (adaPII(r)) throw new Error(`Baris ${r.slug} memuat field data pribadi; impor dibatalkan.`);
  }
  // Satu baris per desa: koperasi yang ditemukan menggantikan catatan slug_tidak_ditemukan sebelumnya.
  const baru = new Set(rows.map((r) => r.kode_desa));
  const sisa = store.all('kdkmp_koperasi').filter((r) => !baru.has(r.kode_desa));
  store.write('kdkmp_koperasi', [...sisa, ...rows.map((r) => ({
    ...r,
    sumber_url: r.status === 'aktif' ? `https://simkopdes.go.id/${r.slug}` : null,
    collector_run_id: runId,
    asal_input: 'collector',
  }))]);
  const aktif = rows.filter((r) => r.status === 'aktif').length;
  return { aktif, tidak_ditemukan: rows.length - aktif, jumlah_baris: rows.length };
}
