const nf = (max: number, min = 0) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: max, minimumFractionDigits: min });

const missing = (n: number | null | undefined): n is null | undefined => n === null || n === undefined || Number.isNaN(n);

export const angka = (n: number | null | undefined, digits = 0) => (missing(n) ? '–' : nf(digits).format(n));

export const persen = (n: number | null | undefined, digits = 1) => (missing(n) ? '–' : `${nf(digits).format(n)}%`);

export function rupiahSingkat(n: number | null | undefined) {
  if (missing(n)) return '–';
  const a = Math.abs(n);
  if (a >= 1e12) return `Rp${nf(1).format(n / 1e12)} T`;
  if (a >= 1e9) return `Rp${nf(1).format(n / 1e9)} M`;
  if (a >= 1e6) return `Rp${nf(1).format(n / 1e6)} jt`;
  if (a >= 1e3) return `Rp${nf(0).format(n / 1e3)} rb`;
  return `Rp${nf(0).format(n)}`;
}

export const rupiah = (n: number | null | undefined) => (missing(n) ? '–' : `Rp${nf(0).format(n)}`);

export function angkaSingkat(n: number | null | undefined) {
  if (missing(n)) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return `${nf(1).format(n / 1e9)} M`;
  if (a >= 1e6) return `${nf(1).format(n / 1e6)} jt`;
  if (a >= 1e4) return `${nf(1).format(n / 1e3)} rb`;
  return nf(0).format(n);
}

export function nilaiSatuan(n: number | null | undefined, satuan: string) {
  if (satuan === 'Rp') return rupiahSingkat(n);
  return angka(n);
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function tanggal(iso: string | null | undefined) {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

export function signed(n: number, fn: (x: number) => string = (x) => angka(x)) {
  if (n === 0) return '±0';
  return `${n > 0 ? '+' : '−'}${fn(Math.abs(n))}`;
}
