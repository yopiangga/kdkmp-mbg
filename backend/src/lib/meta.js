import { SUMBER } from './sumber.js';

export const LABEL_ASAL = ['Resmi', 'Rilis', 'Estimasi', 'Indeks'];

/** Bentuk `meta` wajib di setiap respons (BRIEF Bagian 8). */
export function meta({ tanggal_data = null, sumber = [], label_asal, catatan } = {}) {
  const list = (Array.isArray(sumber) ? sumber : [sumber]).map((s) =>
    typeof s === 'string' && SUMBER[s] ? { nama: SUMBER[s].nama, url: SUMBER[s].url } : s,
  );
  const labels = Array.isArray(label_asal) ? label_asal : [label_asal];
  for (const l of labels) {
    if (!LABEL_ASAL.includes(l)) throw new Error(`label_asal tidak valid: ${l}`);
  }
  return { tanggal_data, sumber: list, label_asal: labels.length === 1 ? labels[0] : labels, ...(catatan ? { catatan } : {}) };
}
