/**
 * Pembersih data pribadi untuk respons microsite koperasi (Bagian 6.2 & 10.3 BRIEF).
 * Nama anggota, pengurus, pengawas, foto, dan NIK tidak pernah ditulis ke disk maupun DB.
 * Dari `members` hanya disimpan agregat jumlah dan jenis kelamin.
 */

export const PII_KEYS = ['members', 'managements', 'distinct_managements'];
const PII_FIELD_RE = /^(nik|photo|foto|avatar|phone|telepon|email|ktp)$/i;

function genderOf(m) {
  const g = String(m?.gender ?? m?.jenis_kelamin ?? m?.sex ?? '').toLowerCase();
  if (['l', 'm', 'male', 'laki-laki', 'laki', 'pria'].includes(g)) return 'laki';
  if (['p', 'f', 'female', 'perempuan', 'wanita'].includes(g)) return 'perempuan';
  return null;
}

export function memberStats(members) {
  const list = Array.isArray(members) ? members : [];
  let laki = 0;
  let perempuan = 0;
  for (const m of list) {
    const g = genderOf(m);
    if (g === 'laki') laki += 1;
    else if (g === 'perempuan') perempuan += 1;
  }
  return { jumlah_anggota: list.length, anggota_laki: laki, anggota_perempuan: perempuan };
}

/** Hapus rekursif semua kunci PII dari objek apa pun (dipakai sebelum menyimpan JSON mentah). */
export function stripPII(value) {
  if (Array.isArray(value)) return value.map(stripPII);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEYS.includes(k) || PII_FIELD_RE.test(k)) continue;
      out[k] = stripPII(v);
    }
    return out;
  }
  return value;
}

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Ubah respons getCooperativeBySlug (+ produk opsional) menjadi baris kdkmp_koperasi
 * yang hanya berisi field yang diizinkan.
 */
export function toKoperasiRow(slug, profile, products = []) {
  const d = profile?.data ?? profile ?? {};
  const stats = memberStats(d.members);
  const news = Array.isArray(d.news) ? d.news : [];
  const lastNews = news
    .map((n) => String(n?.created_at ?? '').slice(0, 10))
    .filter(Boolean)
    .sort()
    .at(-1);
  const prodList = Array.isArray(products) ? products : Array.isArray(products?.data) ? products.data : [];

  return {
    slug,
    nama: d.name ?? null,
    alamat: d.address ?? null,
    kode_pos: d.postal_code ?? null,
    lokasi: toNum(d.latitude) !== null && toNum(d.longitude) !== null
      ? [toNum(d.longitude), toNum(d.latitude)]
      : null,
    provinsi: d.province?.name ?? null,
    kabupaten: d.district?.name ?? null,
    kecamatan: d.subdistrict?.name ?? null,
    penduduk_desa: toNum(d.village?.total_population ?? d.village?.population ?? d.village?.penduduk),
    penduduk_laki: toNum(d.village?.total_male),
    penduduk_perempuan: toNum(d.village?.total_female),
    ...stats,
    jumlah_gerai: Array.isArray(d.outlets) ? d.outlets.length : null,
    jenis_usaha: Array.isArray(d.klu_types) ? d.klu_types.map((k) => k?.type).filter(Boolean) : [],
    potensi: stripPII(d.potentials ?? null),
    member_stats: stripPII(d.member_stats ?? null),
    jumlah_produk: prodList.length,
    nama_produk: prodList.map((p) => p?.name ?? p?.product_name).filter(Boolean),
    berita_terakhir: lastNews ?? null,
    diambil_pada: new Date().toISOString(),
    status: 'aktif',
  };
}
