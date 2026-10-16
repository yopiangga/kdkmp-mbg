import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAngkaPihps, parseGridPihps } from '../src/parsers/pihps.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const grid = JSON.parse(fs.readFileSync(path.join(FIX, 'pihps_grid_banyumas_cilacap.json'), 'utf8'));
const kom = JSON.parse(fs.readFileSync(path.join(FIX, 'pihps_komoditas.json'), 'utf8'));

test('angka PIHPS memakai koma ribuan (en-US)', () => {
  assert.equal(parseAngkaPihps('15,800'), 15800);
  assert.equal(parseAngkaPihps('1,250,000'), 1250000);
  assert.equal(parseAngkaPihps('950'), 950);
  assert.equal(parseAngkaPihps('-'), null);
  assert.equal(parseAngkaPihps(''), null);
  assert.equal(parseAngkaPihps('15.800,50'), null);
});

test('grid PIHPS: kategori, subkomoditas, harga terakhir, rata-rata', () => {
  const rows = parseGridPihps(grid, kom.data ?? kom);
  const beras = rows.find((r) => r.komoditas === 'Beras');
  assert.equal(beras.level, 'kategori');
  assert.equal(beras.harga, 15850);
  assert.equal(beras.tanggal_data, '2026-10-16');
  assert.equal(beras.jumlah_hari, 5);
  assert.equal(beras.satuan, 'kg');
  const medium = rows.find((r) => r.komoditas === 'Beras Kualitas Medium I');
  assert.equal(medium.level, 'subkomoditas');
  assert.equal(medium.kategori, 'Beras');
  const ayam = rows.find((r) => r.komoditas === 'Daging Ayam');
  assert.equal(ayam.harga, 40250);
  assert.equal(ayam.rata_rata, Math.round((41150 + 41150 + 40900 + 40900 + 40250) / 5));
  assert.ok(rows.some((r) => r.komoditas === 'Telur Ayam'));
});
