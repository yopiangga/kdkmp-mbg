import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCoopTrade } from '../src/parsers/cooptrade.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const r = parseCoopTrade(fs.readFileSync(path.join(FIX, 'cooptrade_search.html'), 'utf8'));

test('Coop Trade halaman 1: total 18, 10 kartu produk', () => {
  assert.equal(r.total, 18);
  assert.equal(r.produk.length, 10);
});

test('Coop Trade: field kartu terbaca', () => {
  const vanila = r.produk.find((p) => p.produk === 'VANILA');
  assert.equal(vanila.harga, 4000000);
  assert.equal(vanila.nama_koperasi, 'KOPERASI DESA MERAH PUTIH BATUAGUNG KECAMATAN JEMBRANA');
  assert.equal(vanila.kecamatan, 'Jembrana');
  assert.equal(vanila.kabupaten, 'KAB. JEMBRANA');
  assert.equal(vanila.terjual, 0);
  assert.ok(Number.isInteger(vanila.produk_id));
  assert.ok(r.produk.every((p) => p.terjual === 0 && p.harga !== null));
});
