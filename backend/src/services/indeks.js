/**
 * Indeks Kesiapan Operasional (0–100), BRIEF Bagian 4.
 *   gerai     = pembangunan_gerai_pct
 *   manajer   = manajer_aktif / jumlah_koperasi × 100
 *   nib       = punya_nib / jumlah_koperasi × 100
 *   rat       = rat_selesai / jumlah_koperasi × 100
 *   transaksi = log10(nilai_transaksi / jumlah_koperasi), min–max 0–100 antar wilayah sejenjang
 *   indeks    = Σ(bobot_i × komponen_i) / Σ bobot_i   (hanya komponen yang tersedia)
 */
export const KOMPONEN = ['gerai', 'manajer', 'nib', 'rat', 'transaksi'];
export const BOBOT_BAWAAN = Object.freeze({ gerai: 1, manajer: 1, nib: 1, rat: 1, transaksi: 1 });
export const LABEL_KOMPONEN = {
  gerai: 'Pembangunan gerai',
  manajer: 'Manajer aktif',
  nib: 'Punya NIB',
  rat: 'Sudah RAT',
  transaksi: 'Transaksi per koperasi (log)',
};
/** Indeks hanya dihitung bila minimal sekian komponen tersedia. */
export const MIN_KOMPONEN = 3;

/** Terima "gerai:1,manajer:0.5" atau JSON '{"gerai":1}'. Nilai tidak valid diabaikan. */
export function parseBobot(input) {
  const bobot = { ...BOBOT_BAWAAN };
  if (!input) return bobot;
  let pairs = [];
  if (typeof input === 'object') pairs = Object.entries(input);
  else {
    const s = String(input).trim();
    if (s.startsWith('{')) {
      try {
        pairs = Object.entries(JSON.parse(s));
      } catch {
        return bobot;
      }
    } else pairs = s.split(',').map((p) => p.split(':').map((x) => x.trim()));
  }
  for (const [k, v] of pairs) {
    const n = Number(v);
    if (KOMPONEN.includes(k) && Number.isFinite(n) && n >= 0) bobot[k] = n;
  }
  return bobot;
}

const pct = (v, n) => (v === null || v === undefined || !n ? null : (v / n) * 100);

export function komponenDasar(row) {
  const n = row?.jumlah_koperasi;
  return {
    gerai: row?.pembangunan_gerai_pct ?? null,
    manajer: pct(row?.manajer_aktif, n),
    nib: pct(row?.punya_nib, n),
    rat: pct(row?.rat_selesai, n),
    trx_per_kop: n && row?.nilai_transaksi !== null && row?.nilai_transaksi !== undefined ? row.nilai_transaksi / n : null,
  };
}

/**
 * Hitung indeks untuk sekumpulan wilayah sejenjang.
 * @returns baris asli + { komponen, trx_per_kop, indeks, jumlah_komponen, peringkat }
 */
export function hitungIndeks(rows, bobotInput = BOBOT_BAWAAN) {
  const bobot = parseBobot(bobotInput);
  const base = rows.map(komponenDasar);
  const logs = base.map((b) => (b.trx_per_kop > 0 ? Math.log10(b.trx_per_kop) : null));
  const valid = logs.filter((l) => l !== null);
  const mn = Math.min(...valid);
  const mx = Math.max(...valid);

  const out = rows.map((row, i) => {
    const b = base[i];
    let transaksi = null;
    if (logs[i] !== null) transaksi = mx === mn ? 100 : ((logs[i] - mn) / (mx - mn)) * 100;
    else if (b.trx_per_kop === 0) transaksi = 0;

    const komponen = { gerai: b.gerai, manajer: b.manajer, nib: b.nib, rat: b.rat, transaksi };
    const tersedia = KOMPONEN.filter((k) => komponen[k] !== null && komponen[k] !== undefined);
    const dipakai = tersedia.filter((k) => bobot[k] > 0);
    const sumW = dipakai.reduce((s, k) => s + bobot[k], 0);
    const indeks =
      tersedia.length >= MIN_KOMPONEN && sumW > 0
        ? dipakai.reduce((s, k) => s + bobot[k] * komponen[k], 0) / sumW
        : null;

    return { ...row, komponen, trx_per_kop: b.trx_per_kop, indeks, jumlah_komponen: tersedia.length };
  });

  const ranked = out
    .map((r, i) => ({ i, v: r.indeks }))
    .filter((x) => x.v !== null)
    .sort((a, b) => b.v - a.v);
  ranked.forEach((x, pos) => {
    out[x.i].peringkat = pos + 1;
  });
  out.forEach((r) => {
    r.peringkat ??= null;
  });
  return { rows: out, bobot };
}
