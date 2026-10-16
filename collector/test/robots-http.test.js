import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, isAllowed } from '../src/lib/robots.js';
import { createPoliteClient, BlockedError } from '../src/lib/http.js';

test('robots.txt simkopdes (15 Okt 2026): hanya /_next/static/ yang dilarang', () => {
  const rules = parseRobots('# public/robots.txt\nUser-agent: *\nDisallow: /_next/static/');
  assert.equal(isAllowed(rules, '/data/wilayah/index.json'), true);
  assert.equal(isAllowed(rules, '/pers/dashboard'), true);
  assert.equal(isAllowed(rules, '/_next/static/chunks/a.js'), false);
});

test('robots.txt: aturan spesifik, Allow lebih panjang, wildcard', () => {
  const txt = [
    'User-agent: *', 'Disallow: /',
    '', 'User-agent: KDKMP-MBG-Observatorium', 'Disallow: /api/', 'Allow: /api/public', 'Disallow: /*.pdf$',
  ].join('\n');
  const rules = parseRobots(txt, 'KDKMP-MBG-Observatorium/0.1');
  assert.equal(isAllowed(rules, '/pers/dashboard'), true);
  assert.equal(isAllowed(rules, '/api/x'), false);
  assert.equal(isAllowed(rules, '/api/public/y'), true);
  assert.equal(isAllowed(rules, '/a/b.pdf'), false);
  assert.equal(isAllowed(rules, '/a/b.pdfx'), true);
});

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, at: Date.now(), ua: init?.headers?.['User-Agent'] });
    return handler(url);
  };
  fn.calls = calls;
  return fn;
}

const resp = (status, body = '') => new Response(body, { status });

test('klien menolak api.simkopdes.go.id', async () => {
  const client = createPoliteClient({ delayMs: 0, fetchImpl: fakeFetch(() => resp(200)) });
  await assert.rejects(client.request('https://api.simkopdes.go.id/api/statistics/x'), /tidak boleh/);
});

test('klien mematuhi robots.txt dan memberi User-Agent jujur', async () => {
  const f = fakeFetch((url) => (url.endsWith('/robots.txt') ? resp(200, 'User-agent: *\nDisallow: /rahasia') : resp(200, '{}')));
  const client = createPoliteClient({ delayMs: 0, fetchImpl: f });
  await assert.rejects(client.request('https://contoh.invalid/rahasia/a'), /robots/);
  const ok = await client.request('https://contoh.invalid/data.json');
  assert.equal(ok.status, 200);
  assert.ok(f.calls.every((c) => c.ua.startsWith('KDKMP-MBG-Observatorium/0.1')));
});

test('klien berhenti dengan BlockedError pada 403/429', async () => {
  for (const status of [403, 429]) {
    const f = fakeFetch((url) => (url.endsWith('/robots.txt') ? resp(404) : resp(status)));
    const client = createPoliteClient({ delayMs: 0, fetchImpl: f });
    await assert.rejects(client.request('https://contoh.invalid/x'), (e) => e instanceof BlockedError && e.status === status);
  }
});

test('klien memberi jeda antar request ke domain yang sama', async () => {
  const f = fakeFetch(() => resp(200, ''));
  const client = createPoliteClient({ delayMs: 120, fetchImpl: f });
  await client.request('https://contoh.invalid/a');
  await client.request('https://contoh.invalid/b');
  const gaps = f.calls.slice(1).map((c, i) => c.at - f.calls[i].at);
  assert.ok(gaps.every((g) => g >= 110), `jeda ${gaps}`);
});

test('kuota harian ditegakkan', async () => {
  const client = createPoliteClient({ delayMs: 0, quota: 2, fetchImpl: fakeFetch(() => resp(200)) });
  await client.request('https://contoh.invalid/a'); // robots + a = 2
  await assert.rejects(client.request('https://contoh.invalid/b'), /Kuota/);
});
