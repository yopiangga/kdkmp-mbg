/**
 * Ekspresi cron 5 kolom (menit jam tanggal bulan hari) dievaluasi dalam WIB (UTC+7, tanpa DST).
 * Mendukung *, angka, daftar (1,3), rentang (1-5), dan langkah (*\/15).
 */
const WIB_MS = 7 * 3600_000;
const BATAS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

function parseField(expr, [min, max]) {
  const set = new Set();
  for (const part of expr.split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? Number(stepStr) : 1;
    let [a, b] = range === '*' ? [min, max] : range.split('-').map(Number);
    if (b === undefined) b = stepStr ? max : a;
    if (![a, b, step].every(Number.isInteger) || a < min || b > max || a > b || step < 1) {
      throw new Error(`Bagian cron tidak valid: "${part}"`);
    }
    for (let v = a; v <= b; v += step) set.add(v);
  }
  return set;
}

export function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Cron harus 5 kolom: "${expr}"`);
  const [menit, jam, tanggal, bulan, hari] = parts.map((p, i) => parseField(p, BATAS[i]));
  return { expr, menit, jam, tanggal, bulan, hari, tanggalBebas: parts[2] === '*', hariBebas: parts[4] === '*' };
}

/** Komponen waktu WIB dari Date. */
export function wib(date) {
  const d = new Date(date.getTime() + WIB_MS);
  return { menit: d.getUTCMinutes(), jam: d.getUTCHours(), tanggal: d.getUTCDate(), bulan: d.getUTCMonth() + 1, hari: d.getUTCDay() };
}

export function cocok(cron, date) {
  const w = wib(date);
  if (!cron.menit.has(w.menit) || !cron.jam.has(w.jam) || !cron.bulan.has(w.bulan)) return false;
  // Aturan cron standar: bila tanggal dan hari sama-sama dibatasi, cukup salah satu yang cocok.
  const t = cron.tanggal.has(w.tanggal);
  const h = cron.hari.has(w.hari);
  if (cron.tanggalBebas && cron.hariBebas) return true;
  if (cron.tanggalBebas) return h;
  if (cron.hariBebas) return t;
  return t || h;
}

/** Waktu jalan berikutnya (dicari per menit, maksimal 400 hari ke depan). */
export function berikutnya(cron, dari = new Date()) {
  const t = new Date(Math.floor(dari.getTime() / 60_000) * 60_000 + 60_000);
  for (let i = 0; i < 400 * 24 * 60; i++) {
    if (cocok(cron, t)) return t;
    t.setTime(t.getTime() + 60_000);
  }
  return null;
}

export function formatWib(date) {
  const d = new Date(date.getTime() + WIB_MS);
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  return `${HARI[d.getUTCDay()]} ${d.toISOString().slice(0, 16).replace('T', ' ')} WIB`;
}
