// Format angka Indonesia untuk teks temuan yang dibuat di backend.
const nf = (digits) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const angka = (n, digits = 0) => (n === null || n === undefined ? '–' : nf(digits).format(n));

export const persen = (n, digits = 1) => (n === null || n === undefined ? '–' : `${nf(digits).format(n)}%`);

export function rupiahSingkat(n) {
  if (n === null || n === undefined) return '–';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `Rp${nf(1).format(n / 1e12)} T`;
  if (abs >= 1e9) return `Rp${nf(1).format(n / 1e9)} M`;
  if (abs >= 1e6) return `Rp${nf(1).format(n / 1e6)} juta`;
  if (abs >= 1e3) return `Rp${nf(0).format(n / 1e3)} ribu`;
  return `Rp${nf(0).format(n)}`;
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function tanggal(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}
