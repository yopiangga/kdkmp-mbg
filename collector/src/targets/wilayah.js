import fs from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR, SEED_DIR, today } from '../lib/paths.js';

export const WILAYAH_URL = 'https://simkopdes.go.id/data/wilayah/index.json';

/**
 * Bagian 6.1: referensi wilayah lewat HTTP langsung (JSON statis, terbuka).
 * Simpan mentah di data/raw; bila generated_at berubah, perbarui data/seed/wilayah_index.json.
 */
export async function collectWilayah(client) {
  const res = await client.request(WILAYAH_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} saat mengambil ${WILAYAH_URL}`);
  const text = await res.text();
  const json = JSON.parse(text);

  const provinsi = Object.keys(json.provinces ?? {}).length;
  const kabupaten = Object.keys(json.regencies ?? {}).length;
  if (provinsi !== 38) throw new Error(`Jumlah provinsi ${provinsi}, diharapkan 38`);

  const dir = path.join(RAW_DIR, 'simkopdes_wilayah', today());
  await fs.mkdir(dir, { recursive: true });
  const rawPath = path.join(dir, 'index.json');
  await fs.writeFile(rawPath, text);

  const seedPath = path.join(SEED_DIR, 'wilayah_index.json');
  let previous = null;
  try {
    previous = JSON.parse(await fs.readFile(seedPath, 'utf8')).generated_at;
  } catch {}
  const berubah = previous !== json.generated_at;
  if (berubah) await fs.writeFile(seedPath, text);

  return {
    jumlah_halaman: 1,
    jumlah_baris: provinsi + kabupaten,
    path_raw: path.relative(path.resolve(RAW_DIR, '../..'), rawPath),
    pesan: berubah
      ? `Versi baru generated_at=${json.generated_at} (sebelumnya ${previous ?? 'tidak ada'}); jalankan ulang seed.`
      : `Tidak berubah (generated_at=${json.generated_at}).`,
  };
}
