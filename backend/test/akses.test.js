import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

let ctx;
before(async () => {
  ctx = await startApp({ sitePassword: 'mbg' });
});
after(() => ctx.close());

const masuk = (password, headers = {}) => fetch(`${ctx.base}/api/masuk`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ password }),
});

test('tanpa cookie: data ditolak 401, health dan sesi tetap terbuka', async () => {
  const r = await fetch(`${ctx.base}/api/ringkasan`);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).perlu_masuk, true);
  assert.equal((await fetch(`${ctx.base}/api/health`)).status, 200);
  assert.deepEqual(await (await fetch(`${ctx.base}/api/sesi`)).json(), { perlu_password: true, masuk: false });
  assert.equal((await fetch(`${ctx.base}/api/admin/rilis`)).status, 401);
});

test('password salah ditolak, password benar memberi cookie HttpOnly', async () => {
  assert.equal((await masuk('salah', { 'X-Forwarded-For': '10.0.0.1' })).status, 401);
  const r = await masuk('mbg', { 'X-Forwarded-For': '10.0.0.1' });
  assert.equal(r.status, 204);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /^kdkmp_akses=\d+\.[0-9a-f]{64}; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax/);
  const isi = cookie.split(';')[0];
  const data = await fetch(`${ctx.base}/api/ringkasan`, { headers: { Cookie: isi } });
  assert.equal(data.status, 200);
  assert.equal(data.headers.get('cache-control'), 'private, max-age=3600');
  assert.deepEqual(await (await fetch(`${ctx.base}/api/sesi`, { headers: { Cookie: isi } })).json(), { perlu_password: true, masuk: true });
});

test('cookie palsu atau kedaluwarsa ditolak', async () => {
  const palsu = `kdkmp_akses=${Math.floor(Date.now() / 1000) + 999}.${'0'.repeat(64)}`;
  assert.equal((await fetch(`${ctx.base}/api/ringkasan`, { headers: { Cookie: palsu } })).status, 401);
  const lewat = `kdkmp_akses=1.${'0'.repeat(64)}`;
  assert.equal((await fetch(`${ctx.base}/api/ringkasan`, { headers: { Cookie: lewat } })).status, 401);
});

test('percobaan login dibatasi per IP', async () => {
  const ip = { 'X-Forwarded-For': '10.0.0.99' };
  for (let i = 0; i < 10; i++) assert.equal((await masuk('salah', ip)).status, 401);
  assert.equal((await masuk('mbg', ip)).status, 429);
  assert.equal((await masuk('mbg', { 'X-Forwarded-For': '10.0.0.100' })).status, 204);
});

test('keluar menghapus cookie', async () => {
  const r = await fetch(`${ctx.base}/api/keluar`, { method: 'POST' });
  assert.equal(r.status, 204);
  assert.match(r.headers.get('set-cookie'), /kdkmp_akses=; Max-Age=0/);
});
