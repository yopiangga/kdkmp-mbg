/**
 * Parser respons PIHPS Nasional (Bank Indonesia), endpoint GetGridDataDaerah.
 * Bentuk baris: { no, name, level (1 = kategori, 2 = subkomoditas), "dd/MM/yyyy": "15,800", ... }
 * Angka memakai koma sebagai pemisah ribuan (format en-US), "-" atau kosong = tidak ada data.
 */
export function parseAngkaPihps(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === '-') return null;
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s.replace(/,/g, ''));
}

const keIso = (dmy) => {
  const [d, m, y] = dmy.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

/**
 * @returns [{ komoditas, kategori, level, satuan, harga (terakhir), tanggal_data, rata_rata, jumlah_hari, seri }]
 */
export function parseGridPihps(json, komoditasRef = []) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  const satuan = new Map(komoditasRef.map((k) => [k.name.trim(), k.denomination]));
  let kategori = null;
  return rows.map((r) => {
    const nama = String(r.name ?? '').trim();
    if (r.level === 1) kategori = nama;
    const seri = Object.entries(r)
      .filter(([k]) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(k))
      .map(([k, v]) => ({ tanggal: keIso(k), harga: parseAngkaPihps(v) }))
      .filter((x) => x.harga !== null)
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    const terakhir = seri.at(-1);
    return {
      komoditas: nama,
      kategori: r.level === 1 ? nama : kategori,
      level: r.level === 1 ? 'kategori' : 'subkomoditas',
      satuan: satuan.get(nama) ?? 'kg',
      harga: terakhir?.harga ?? null,
      tanggal_data: terakhir?.tanggal ?? null,
      rata_rata: seri.length ? Math.round(seri.reduce((s, x) => s + x.harga, 0) / seri.length) : null,
      jumlah_hari: seri.length,
      seri,
    };
  }).filter((r) => r.komoditas && r.harga !== null);
}
