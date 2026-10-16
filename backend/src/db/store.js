import fs from 'node:fs';
import path from 'node:path';

/**
 * Penyimpanan sementara berbasis file JSON: satu file per tabel di DATA_DIR.
 * Nama tabel dan kunci primer mengikuti skema PostgreSQL di BRIEF Bagian 7,
 * supaya migrasi ke Postgres nanti cukup mengganti modul repository.
 */
export const TABLES = {
  wilayah: ['kode'],
  simkopdes_wilayah_map: ['simkopdes_id', 'level'],
  kdkmp_snapshot: ['kode', 'tanggal_data'],
  kdkmp_produk_terlaris: ['kode', 'tanggal_data', 'peringkat'],
  produk_kelompok: ['pola'],
  kdkmp_koperasi: ['slug'],
  cooptrade_produk_snapshot: ['tanggal_data', 'nama_koperasi', 'produk'],
  cooptrade_ringkasan: ['tanggal_data'],
  rilis_angka: ['id'],
  harga_pangan: ['kode', 'tanggal_data', 'komoditas', 'jenis_pasar'],
  asumsi_simulasi: ['kunci'],
  collector_runs: ['id'],
};

export const keyOf = (table, row) => TABLES[table].map((k) => row[k]).join('|');

export class JsonStore {
  constructor(dir) {
    this.dir = dir;
    this.cache = new Map();
  }

  file(table) {
    if (!TABLES[table]) throw new Error(`Tabel tidak dikenal: ${table}`);
    return path.join(this.dir, `${table}.json`);
  }

  /** Baca seluruh baris; di-cache dan dimuat ulang bila file berubah (mis. setelah seed/collector). */
  all(table) {
    const file = this.file(table);
    let mtime;
    try {
      mtime = fs.statSync(file).mtimeMs;
    } catch {
      return [];
    }
    const hit = this.cache.get(table);
    if (hit && hit.mtime === mtime) return hit.rows;
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    this.cache.set(table, { mtime, rows });
    return rows;
  }

  write(table, rows) {
    fs.mkdirSync(this.dir, { recursive: true });
    const file = this.file(table);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(rows, null, 1));
    fs.renameSync(`${file}.tmp`, file);
    this.cache.set(table, { mtime: fs.statSync(file).mtimeMs, rows });
  }

  /** Sisipkan atau ganti baris berdasarkan kunci primer. */
  upsert(table, newRows) {
    const map = new Map(this.all(table).map((r) => [keyOf(table, r), r]));
    for (const r of newRows) map.set(keyOf(table, r), r);
    const rows = [...map.values()];
    this.write(table, rows);
    return rows;
  }

  nextId(table) {
    return this.all(table).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  }
}
