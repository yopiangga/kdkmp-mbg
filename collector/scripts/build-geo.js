#!/usr/bin/env node
/**
 * Mengubah dump SQL cahyadsn/wilayah_boundaries (MIT) menjadi GeoJSON yang disederhanakan,
 * dan dump cahyadsn/wilayah (MIT) menjadi daftar kecamatan.
 * Masukan: data/raw/wilayah_boundaries/<tgl>/*.sql, data/raw/cahyadsn_wilayah/<tgl>/wilayah.sql
 * Keluaran: data/seed/geo/*.geojson, data/seed/wilayah_kecamatan.json
 *
 * Catatan: kolom `path` di sumber berurutan [lat, lng]; GeoJSON memakai [lng, lat].
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR, SEED_DIR } from '../src/lib/paths.js';

const ATRIBUSI = 'Batas wilayah: cahyadsn/wilayah_boundaries (MIT), data Kemendagri';

async function latestDir(base) {
  const dirs = (await fs.readdir(base)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!dirs.length) throw new Error(`Tidak ada data mentah di ${base}`);
  return path.join(base, dirs.at(-1));
}

function* records(sql) {
  // Apostrof di dalam nama di-escape SQL sebagai '' (mis. 'Ma''u').
  const re = /\('([0-9.]+)','((?:[^']|'')*)',(-?[0-9.]+),(-?[0-9.]+),'(\[[^']*\])'/g;
  let m;
  while ((m = re.exec(sql))) {
    yield { kode: m[1], nama: m[2].replace(/''/g, "'"), lat: Number(m[3]), lng: Number(m[4]), path: m[5] };
  }
}

function perpDist(p, a, b) {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function simplify(points, tol) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function toGeometry(rawPath, tol, digits) {
  const f = 10 ** digits;
  const r = (n) => Math.round(n * f) / f;
  let multi = JSON.parse(rawPath);
  // Sumber mencampur Ring, Polygon, dan MultiPolygon; seragamkan ke MultiPolygon.
  const depth = (v) => (Array.isArray(v) ? 1 + depth(v[0]) : 0);
  const d = depth(multi);
  if (d === 2) multi = [[multi]];
  else if (d === 3) multi = [multi];
  const polys = [];
  for (const poly of multi) {
    const rings = [];
    for (const ring of poly) {
      const pts = simplify(ring.map(([lat, lng]) => [r(lng), r(lat)]), tol);
      if (pts.length < 4) continue;
      const [fx, fy] = pts[0];
      const [lx, ly] = pts.at(-1);
      if (fx !== lx || fy !== ly) pts.push([fx, fy]);
      rings.push(pts);
    }
    if (rings.length) polys.push(rings);
  }
  return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
}

async function writeCollection(file, features) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ type: 'FeatureCollection', atribusi: ATRIBUSI, features }));
  const { size } = await fs.stat(file);
  console.log(`  ${path.relative(SEED_DIR, file)}: ${features.length} fitur, ${(size / 1024).toFixed(0)} KB`);
}

async function buildBoundaries() {
  const dir = await latestDir(path.join(RAW_DIR, 'wilayah_boundaries'));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql'));
  const geoDir = path.join(SEED_DIR, 'geo');
  const byLevel = { prov: [], kab: [], kec: [] };

  for (const file of files) {
    const level = file.split('_')[0];
    const tol = { prov: 0.01, kab: 0.004, kec: 0.0015 }[level];
    const digits = level === 'prov' ? 3 : 4;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    for (const rec of records(sql)) {
      const geometry = toGeometry(rec.path, tol, digits);
      if (!geometry) continue;
      byLevel[level].push({
        type: 'Feature',
        properties: { kode: rec.kode, nama: rec.nama, centroid: [rec.lng, rec.lat] },
        geometry,
      });
    }
  }

  // Provinsi yang tidak ada di file prov upstream (mis. 63 Kalimantan Selatan) dirakit dari
  // poligon kab/kotanya. Tidak di-dissolve, jadi garis batas kab/kota tetap ada di dalamnya.
  const provCodes = new Set(byLevel.prov.map((f) => f.properties.kode));
  const index = JSON.parse(await fs.readFile(path.join(SEED_DIR, 'wilayah_index.json'), 'utf8'));
  for (const [kode, [nama, lat, lng]] of Object.entries(index.provinces)) {
    if (provCodes.has(kode)) continue;
    const kabs = byLevel.kab.filter((f) => f.properties.kode.startsWith(`${kode}.`));
    if (!kabs.length) {
      console.warn(`  PERINGATAN: batas provinsi ${kode} ${nama} tidak tersedia`);
      continue;
    }
    byLevel.prov.push({
      type: 'Feature',
      properties: { kode, nama, centroid: [lng, lat], dirakit_dari_kabupaten: true },
      geometry: { type: 'MultiPolygon', coordinates: kabs.flatMap((f) => f.geometry.coordinates) },
    });
    console.log(`  provinsi ${kode} ${nama} dirakit dari ${kabs.length} kab/kota`);
  }

  console.log(`Sumber: ${path.relative(RAW_DIR, dir)}`);
  await writeCollection(path.join(geoDir, 'provinsi.geojson'), byLevel.prov.sort((a, b) => a.properties.kode.localeCompare(b.properties.kode)));

  const group = (list, len) => list.reduce((acc, f) => {
    const parent = f.properties.kode.slice(0, len);
    (acc[parent] ??= []).push(f);
    return acc;
  }, {});
  for (const [parent, list] of Object.entries(group(byLevel.kab, 2))) {
    await writeCollection(path.join(geoDir, `kabupaten_${parent}.geojson`), list);
  }
  for (const [parent, list] of Object.entries(group(byLevel.kec, 5))) {
    await writeCollection(path.join(geoDir, `kecamatan_${parent}.geojson`), list);
  }
}

async function buildKecamatan() {
  const dir = await latestDir(path.join(RAW_DIR, 'cahyadsn_wilayah'));
  const sql = await fs.readFile(path.join(dir, 'wilayah.sql'), 'utf8');
  const meta = sql.match(/note\s*:\s*(.+)/)?.[1]?.trim() ?? null;
  const rows = [];
  for (const m of sql.matchAll(/\('(\d{2}\.\d{2}\.\d{2})','((?:[^']|'')+)'\)/g)) {
    rows.push({ kode: m[1], nama: m[2].replace(/''/g, "'") });
  }
  rows.sort((a, b) => a.kode.localeCompare(b.kode));
  await fs.writeFile(
    path.join(SEED_DIR, 'wilayah_kecamatan.json'),
    JSON.stringify({ source: `cahyadsn/wilayah (MIT) — ${meta}`, diambil: path.basename(dir), kecamatan: rows }),
  );
  console.log(`  wilayah_kecamatan.json: ${rows.length} kecamatan`);

  // Desa/kelurahan untuk kabupaten pilot microsite (Bagian 6.2: kandidat slug dari nama desa Kemendagri).
  for (const kab of PILOT_KAB) {
    const desa = [];
    for (const m of sql.matchAll(new RegExp(`\\('(${kab.replace('.', '\\.')}\\.\\d{2}\\.\\d{4})','((?:[^']|'')+)'\\)`, 'g'))) {
      desa.push({ kode: m[1], nama: m[2].replace(/''/g, "'") });
    }
    desa.sort((a, b) => a.kode.localeCompare(b.kode));
    await fs.writeFile(path.join(SEED_DIR, `wilayah_desa_${kab}.json`), JSON.stringify({ source: `cahyadsn/wilayah (MIT) — ${meta}`, desa }, null, 1));
    console.log(`  wilayah_desa_${kab}.json: ${desa.length} desa/kelurahan`);
  }
}

const PILOT_KAB = ['33.05', '35.25', '35.78', '19.01', '33.02', '33.01', '33.06', '33.04']; // samakan dengan PILOT_MICROSITE di src/targets/microsite.js

await buildBoundaries();
await buildKecamatan();
