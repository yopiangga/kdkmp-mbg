import fs from 'node:fs';
import path from 'node:path';

/** Ray casting: apakah titik [lng, lat] berada di dalam (Multi)Polygon GeoJSON. */
export function titikDalamPoligon([x, y], geometry) {
  if (!geometry) return false;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.some((rings) => {
    let inside = false;
    rings.forEach((ring, idx) => {
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      // Cincin pertama = batas luar, berikutnya = lubang.
      if (hit) inside = idx === 0 ? true : false;
    });
    return inside;
  });
}

const cache = new Map();
/** Geometri kecamatan dari data/seed/geo/kecamatan_<kab>.geojson. */
export function geometriKecamatan(seedDir, kodeKab) {
  const file = path.join(seedDir, 'geo', `kecamatan_${kodeKab}.geojson`);
  if (!cache.has(file)) {
    const fc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { features: [] };
    cache.set(file, new Map(fc.features.map((f) => [f.properties.kode, f.geometry])));
  }
  return cache.get(file);
}

/** Toleransi ±~1 km karena batas poligon disederhanakan: cek juga titik yang digeser sedikit. */
export function lokasiCocok(lokasi, geometry, toleransi = 0.01) {
  if (!Array.isArray(lokasi) || !geometry) return null;
  const [x, y] = lokasi;
  const geser = [[0, 0], [toleransi, 0], [-toleransi, 0], [0, toleransi], [0, -toleransi]];
  return geser.some(([dx, dy]) => titikDalamPoligon([x + dx, y + dy], geometry));
}
