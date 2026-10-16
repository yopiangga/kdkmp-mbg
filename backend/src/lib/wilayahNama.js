/**
 * Normalisasi nama wilayah untuk mencocokkan nama Simkopdes ("KAB. GRESIK", "KOTA ADM. JAKARTA BARAT")
 * dengan nama Kemendagri ("Kabupaten Gresik", "Kota Administrasi Jakarta Barat").
 */
const ALIAS = {
  'DKI JAKARTA': 'DAERAH KHUSUS IBUKOTA JAKARTA',
  'DAERAH KHUSUS JAKARTA': 'DAERAH KHUSUS IBUKOTA JAKARTA',
  'DI YOGYAKARTA': 'DAERAH ISTIMEWA YOGYAKARTA',
  'BANGKA BELITUNG': 'KEPULAUAN BANGKA BELITUNG',
};

// Singkatan yang dipakai Simkopdes (diamati 16 Okt 2026).
const SINGKATAN = [
  [/\bADM\b/g, 'ADMINISTRASI'],
  [/\bKEP\b/g, 'KEPULAUAN'],
  [/\bOKU\b/g, 'OGAN KOMERING ULU'],
  [/\bOKI\b/g, 'OGAN KOMERING ILIR'],
  [/\bKAB\b/g, 'KABUPATEN'],
];

export function normalisasiNama(nama) {
  let s = String(nama ?? '')
    .toUpperCase()
    .replace(/[.,'`’()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^KAB\s+/, 'KABUPATEN ').replace(/^KEP\s+/, 'KEPULAUAN ');
  return ALIAS[s] ?? s;
}

const expand = (s) => SINGKATAN.reduce((acc, [re, v]) => acc.replace(re, v), s);
const ringkas = (s) => expand(s).replace(/\b(DAN|ADMINISTRASI)\b/g, ' ').replace(/^(KABUPATEN|KOTA) /, '').replace(/\s+/g, '');
const tanpaAwalan = (s) => s.replace(/^(KABUPATEN|KOTA) /, '');

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Jenis kota/kabupaten harus sama bila kedua nama menyebutkannya (Kota Blitar ≠ Kabupaten Blitar). */
function jenis(s) {
  if (/^KOTA /.test(s)) return 'kota';
  if (/^KABUPATEN /.test(s)) return 'kab';
  return null;
}

/**
 * Cocokkan nama ke daftar wilayah {kode, nama} bertahap: tepat → singkatan → tanpa spasi → mirip (≤ 2 huruf, unik).
 * @returns { kode, cara } atau null
 */
export function cocokkanNamaDetail(nama, kandidat) {
  const target = expand(normalisasiNama(nama));
  const list = kandidat.map((w) => ({ w, n: expand(normalisasiNama(w.nama)) }));
  const jt = jenis(target);
  const sejenis = list.filter((x) => !jt || !jenis(x.n) || jenis(x.n) === jt);

  const unik = (arr) => (arr.length === 1 ? arr[0].w.kode : null);
  const tepat = sejenis.filter((x) => x.n === target);
  if (tepat.length) return { kode: tepat[0].w.kode, cara: 'tepat' };

  const tanpa = unik(sejenis.filter((x) => tanpaAwalan(x.n) === tanpaAwalan(target)));
  if (tanpa) return { kode: tanpa, cara: 'tepat' };

  const r = ringkas(target);
  const rk = unik(sejenis.filter((x) => ringkas(x.n) === r));
  if (rk) return { kode: rk, cara: 'ringkas' };

  const skor = sejenis.map((x) => ({ x, d: levenshtein(ringkas(x.n), r) })).filter((s) => s.d <= 2).sort((a, b) => a.d - b.d);
  if (skor.length && (skor.length === 1 || skor[1].d > skor[0].d) && r.length >= 5) return { kode: skor[0].x.w.kode, cara: 'mirip' };
  return null;
}

/** Cocokkan nama ke daftar wilayah {kode, nama}. Mengembalikan kode atau null. */
export function cocokkanNama(nama, kandidat) {
  return cocokkanNamaDetail(nama, kandidat)?.kode ?? null;
}
