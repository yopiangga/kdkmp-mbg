export type LabelAsal = 'Resmi' | 'Rilis' | 'Estimasi' | 'Indeks';

export interface Meta {
  tanggal_data: string | null;
  sumber: { nama: string; url: string | null }[];
  label_asal: LabelAsal | LabelAsal[];
  catatan?: string;
}

export interface Resp<T> {
  data: T;
  meta: Meta;
}

export interface Kpi {
  kunci: string;
  label: string;
  nilai: number | null;
  satuan: string;
  label_asal: LabelAsal;
  tanggal: string | null;
  sumber_url: string | null;
  delta: { nilai: number; terhadap_tanggal: string } | null;
  keterangan: string | null;
}

export interface FunnelStage {
  tahap: string;
  nilai: number | null;
  label_asal: LabelAsal;
  tanggal: string | null;
  sumber_url: string | null;
  tersedia: boolean;
  catatan?: string | null;
}

export interface Temuan {
  kunci: string;
  judul: string;
  isi: string;
  nilai: number;
  label_asal: LabelAsal;
  tanggal: string;
  tautan: string;
}

export interface Ringkasan {
  tanggal_data: string;
  /** Tanggal snapshot pembanding (≥ 7 hari sebelumnya), null bila belum ada riwayat seminggu. */
  pembanding: string | null;
  judul: string;
  kpi: Kpi[];
  funnel: FunnelStage[];
  temuan: Temuan[];
  sumber_url: string;
}

export interface Tren {
  indikator: string;
  kode: string;
  label_asal: LabelAsal;
  titik: { tanggal: string; nilai: number; sumber_url: string }[];
  cukup: boolean;
  mulai: string | null;
}

export type KomponenKey = 'gerai' | 'manajer' | 'nib' | 'rat' | 'transaksi';
export type Bobot = Record<KomponenKey, number>;
export type KuadranKey = 'siap' | 'gedung_siap_usaha_belum' | 'usaha_jalan_gedung_belum' | 'tertinggal';

export interface WilayahRow {
  kode: string;
  nama: string;
  level: string;
  status_data: 'ada' | 'belum_dikumpulkan';
  tanggal_data?: string;
  jumlah_koperasi?: number | null;
  manajer_aktif?: number | null;
  punya_nib?: number | null;
  rat_selesai?: number | null;
  nilai_transaksi?: number | null;
  pembangunan_gerai_pct?: number | null;
  pemetaan_lahan_pct?: number | null;
  sumber_url?: string;
  komponen: Record<KomponenKey, number | null> | null;
  trx_per_kop: number | null;
  indeks: number | null;
  jumlah_komponen: number;
  peringkat: number | null;
  kuadran: KuadranKey | null;
}

export interface Crumb {
  kode: string;
  nama: string;
  level: string;
}

export interface Anak {
  induk: Crumb;
  leluhur: Crumb[];
  level_anak: string | null;
  tanggal_data: string | null;
  cakupan: { ada: number; total: number };
  bobot: Bobot;
  komponen_indeks: Record<KomponenKey, string>;
  indeks_3_komponen: boolean;
  komponen_tersedia: KomponenKey[];
  rows: WilayahRow[];
}

export interface ProdukTerlaris {
  peringkat: number;
  nama_produk: string;
  volume: number;
  nilai: number;
  kelompok?: string;
  tanggal_data: string;
}

export interface Detail {
  wilayah: { kode: string; nama: string; level: string; parent_kode: string | null; centroid: [number, number] | null };
  leluhur: Crumb[];
  snapshot: Record<string, number | string | null> | null;
  turunan: { gerai: number | null; manajer: number | null; nib: number | null; rat: number | null; trx_per_kop: number | null; kuadran: KuadranKey | null } | null;
  produk_terlaris: ProdukTerlaris[];
  jumlah_anak: number;
}

export interface GeoFC {
  type: 'FeatureCollection';
  features: GeoJSON.Feature[];
  poligon: boolean;
  atribusi: string | null;
  meta: Meta;
}

export interface Matriks {
  level: string;
  aktif: boolean;
  alasan?: string | null;
  cakupan: { ada: number; total: number };
  tanggal_data: string;
  kuadran: Record<KuadranKey, { label: string; deskripsi: string }>;
  titik: { kode: string; nama: string; jumlah_koperasi: number; gerai_pct: number; trx_per_kop: number; kuadran: KuadranKey }[];
  jumlah: Record<KuadranKey, number> | null;
  prioritas: Matriks['titik'];
  ambang: { gerai: number; trx: number };
}

export interface Komposisi {
  wilayah: Crumb;
  tanggal_data: string | null;
  label_kelompok: Record<string, string>;
  produk: ProdukTerlaris[];
  kelompok: { kelompok: string; label: string; nilai: number; porsi_top_pct: number | null; porsi_total_pct: number | null }[];
  total_top: number;
  total_transaksi: number | null;
  cakupan_pct: number | null;
  tren_segar_protein: { titik: { tanggal: string; porsi_top_pct: number | null }[]; cukup: boolean };
}

export interface CelahRow {
  kode: string;
  nama: string;
  status_data: string;
  jumlah_koperasi: number | null;
  nilai_transaksi: number | null;
  trx_per_kop: number | null;
  sppg: number | null;
  penerima: number | null;
  kebutuhan_harian: number | null;
  setara_hari: number | null;
  rasio_celah: number | null;
}

export interface Celah {
  tanggal_data: string;
  ringkasan_nasional: {
    penerima: { nilai: number; tanggal: string; sumber_url: string; label_asal: LabelAsal } | null;
    biaya_per_porsi: number;
    porsi_bahan_baku: number;
    kebutuhan_harian: number | null;
    nilai_transaksi_koperasi: number | null;
    tanggal_transaksi: string;
    setara_hari: number | null;
    catatan: string;
  };
  kecamatan: null | {
    kabupaten: Crumb;
    leluhur: Crumb[];
    cakupan: { ada: number; total: number };
    tanggal_data: string | null;
    rows: CelahRow[];
  };
}


export interface Asumsi {
  kunci: string;
  label: string;
  nilai: number;
  satuan: string;
  sumber_url: string | null;
  catatan: string | null;
  asumsi_penulis: boolean;
}

export interface Rilis {
  id: number;
  indikator: string;
  nilai: number;
  satuan: string;
  kode_wilayah: string;
  per_tanggal: string;
  sumber_nama?: string | null;
  sumber_url: string;
  kutipan: string | null;
  status: 'draf' | 'terverifikasi';
  dibuat_oleh?: string;
}

export interface CollectorRun {
  id: number;
  target: string;
  mulai: string;
  selesai: string;
  status: string;
  jumlah_halaman: number;
  jumlah_baris: number;
  pesan: string;
  path_raw: string | null;
}

export interface Sumber {
  nama: string;
  url: string | null;
  frekuensi: string;
  cara: string;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

/** Dipancarkan saat server meminta password (sesi habis atau belum masuk). */
export const EVENT_PERLU_MASUK = 'kdkmp:perlu-masuk';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && body.perlu_masuk) window.dispatchEvent(new Event(EVENT_PERLU_MASUK));
  if (!res.ok) throw new ApiError(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`, res.status);
  return body as T;
}

export async function apiSend<T>(method: 'POST' | 'PATCH', path: string, token: string, body: unknown, contentType = 'application/json'): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: contentType === 'application/json' ? JSON.stringify(body) : (body as string),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error;
    throw new ApiError(Array.isArray(e) ? e.map((x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ') : String(e ?? `HTTP ${res.status}`), res.status);
  }
  return json as T;
}

export const bobotQuery = (b: Bobot) => Object.entries(b).map(([k, v]) => `${k}:${v}`).join(',');

export interface HargaKolom {
  kode: string;
  nama: string;
  peran: 'wilayah' | 'provinsi' | 'kota_survei_terdekat';
  jarak_km?: number;
  provinsi?: string | null;
  harga: { komoditas: string; satuan: string; harga: number; rata_rata_7_hari: number | null; tanggal_data: string }[];
}

export interface Harga {
  wilayah: Crumb;
  cakupan: 'kota_survei' | 'pendekatan' | 'tidak_ada';
  jenis_pasar: string;
  tanggal_data: string | null;
  komoditas: string[];
  kolom: HargaKolom[];
  catatan: string | null;
}
