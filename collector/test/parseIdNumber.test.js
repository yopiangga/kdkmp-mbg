import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIdNumber } from '../src/lib/parseIdNumber.js';

test('desimal dengan koma dan ribuan dengan titik', () => {
  assert.equal(parseIdNumber('8.564.043,68'), 8564043.68);
  assert.equal(parseIdNumber('1.870.109,8'), 1870109.8);
});

test('rupiah dengan dan tanpa spasi', () => {
  assert.equal(parseIdNumber('Rp 72.704.107.978'), 72704107978);
  assert.equal(parseIdNumber('Rp29.776.920.075'), 29776920075);
  assert.equal(parseIdNumber('Rp. 15.000'), 15000);
  assert.equal(parseIdNumber('Rp 208.610.761.686'), 208610761686);
});

test('persen', () => {
  assert.equal(parseIdNumber('89,03%'), 89.03);
  assert.equal(parseIdNumber('70 %'), 70);
  assert.equal(parseIdNumber('0,08'), 0.08);
});

test('bilangan bulat dan ribuan', () => {
  assert.equal(parseIdNumber('83.363'), 83363);
  assert.equal(parseIdNumber('199'), 199);
  assert.equal(parseIdNumber('0'), 0);
  assert.equal(parseIdNumber(' 6.534 '), 6534);
});

test('negatif', () => {
  assert.equal(parseIdNumber('-1.234,5'), -1234.5);
  assert.equal(parseIdNumber('(2.000)'), -2000);
});

test('nilai kosong atau tidak valid menjadi null', () => {
  for (const v of [null, undefined, '', '-', '–', 'N/A', 'abc', '1,2,3', '12.34.5', '1.2345']) {
    assert.equal(parseIdNumber(v), null, `input ${JSON.stringify(v)}`);
  }
});

test('angka asli diteruskan', () => {
  assert.equal(parseIdNumber(42.5), 42.5);
  assert.equal(parseIdNumber(Number.NaN), null);
});
