/**
 * Mengurai angka berformat Indonesia dari teks DOM.
 *   "8.564.043,68"        → 8564043.68
 *   "Rp 72.704.107.978"   → 72704107978
 *   "89,03%"              → 89.03
 *   "-", "", "N/A"        → null
 * Titik selalu dianggap pemisah ribuan, koma pemisah desimal.
 */
export function parseIdNumber(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;

  let s = String(input)
    .replace(/ /g, ' ')
    .replace(/rp\.?/gi, '')
    .replace(/%/g, '')
    .trim();

  if (s === '' || s === '-' || s === '–' || /^n\/?a$/i.test(s)) return null;

  let negative = false;
  if (/^[-−]/.test(s) || /^\(.*\)$/.test(s)) {
    negative = true;
    s = s.replace(/^[-−]/, '').replace(/^\((.*)\)$/, '$1');
  }

  s = s.replace(/\s+/g, '');
  if (!/^[\d.,]+$/.test(s)) return null;

  const [intPart, decPart, ...rest] = s.split(',');
  if (rest.length) return null;
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(intPart)) return null;

  const n = Number(intPart.replace(/\./g, '') + (decPart !== undefined ? `.${decPart}` : ''));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}
